package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// KataGo manages a long-lived KataGo subprocess and communicates with it
// using the Go Text Protocol (GTP).
type KataGo struct {
	cmd           *exec.Cmd
	stdin         io.WriteCloser
	stdout        *bufio.Reader
	mu            sync.Mutex // serialises GTP command/response pairs
	hasHumanModel bool       // true if human SL model was loaded
	tainted       bool       // true after a context timeout desynchronises GTP I/O

	// Startup arguments retained for restart.
	binPath    string
	modelPath  string
	configPath string
	humanPath  string
}

// NewKataGo starts the KataGo process in GTP mode and returns a ready-to-use
// instance.  The caller is responsible for calling Quit when done.
// If humanModel is non-empty, the -human-model flag is passed to KataGo
// to enable human-like play at various rank levels.
func NewKataGo(katago, model, config, humanModel string) (*KataGo, error) {
	k := &KataGo{
		hasHumanModel: humanModel != "",
		binPath:       katago,
		modelPath:     model,
		configPath:    config,
		humanPath:     humanModel,
	}
	if err := k.startProcess(); err != nil {
		return nil, err
	}
	return k, nil
}

// startProcess launches (or re-launches) the KataGo subprocess.
// The caller must hold k.mu when calling this for a restart.
func (k *KataGo) startProcess() error {
	args := []string{"gtp", "-model", k.modelPath, "-config", k.configPath}
	if k.hasHumanModel {
		args = append(args, "-human-model", k.humanPath)
	}
	cmd := exec.Command(k.binPath, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("create stdin pipe: %w", err)
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("create stdout pipe: %w", err)
	}

	cmd.Stderr = logWriter{prefix: "katago"}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start katago: %w", err)
	}

	k.cmd = cmd
	k.stdin = stdin
	k.stdout = bufio.NewReader(stdoutPipe)
	k.tainted = false

	if err := k.waitReady(); err != nil {
		_ = k.kill()
		return fmt.Errorf("katago startup: %w", err)
	}

	slog.Info("katago process started", "pid", cmd.Process.Pid)
	return nil
}

// restart kills the current KataGo process and starts a fresh one.
// The caller must hold k.mu.
func (k *KataGo) restart() error {
	slog.Warn("restarting katago process due to tainted GTP state")
	_ = k.kill()
	return k.startProcess()
}

// kill terminates the KataGo subprocess without the GTP quit handshake.
func (k *KataGo) kill() error {
	_ = k.stdin.Close()
	if k.cmd.Process != nil {
		_ = k.cmd.Process.Kill()
	}
	_ = k.cmd.Wait()
	return nil
}

// GenMove replays the full game described by req and returns the best move
// for req.ColorToPlay as a GTP coordinate string (e.g. "R4", "pass", "resign").
// A 300-second timeout is applied to the entire operation via the supplied
// context; if the deadline fires an error is returned without killing KataGo.
func (k *KataGo) GenMove(ctx context.Context, req *MoveRequest) (*GenMoveResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()

	k.mu.Lock()
	defer k.mu.Unlock()

	// If a previous request timed out, GTP I/O is desynchronised.
	// Restart KataGo to recover a clean state.
	if k.tainted {
		if err := k.restart(); err != nil {
			return nil, fmt.Errorf("restart after taint: %w", err)
		}
	}

	// Clear the board before replaying moves.
	if err := k.send("clear_board"); err != nil {
		return nil, err
	}
	if _, err := k.readResponseCtx(ctx); err != nil {
		return nil, fmt.Errorf("clear_board: %w", err)
	}

	if err := k.send("boardsize %d", req.BoardSize); err != nil {
		return nil, err
	}
	if _, err := k.readResponseCtx(ctx); err != nil {
		return nil, fmt.Errorf("boardsize: %w", err)
	}

	// Set komi.
	if err := k.send("komi %.1f", req.Komi); err != nil {
		return nil, err
	}
	if _, err := k.readResponseCtx(ctx); err != nil {
		return nil, fmt.Errorf("komi: %w", err)
	}

	// Replay move history.
	for i, m := range req.Moves {
		color := gtpColor(m.Color)
		pos := strings.ToUpper(m.Position)
		if err := k.send("play %s %s", color, pos); err != nil {
			return nil, err
		}
		if _, err := k.readResponseCtx(ctx); err != nil {
			return nil, fmt.Errorf("play move %d (%s %s): %w", i, color, pos, err)
		}
	}

	// Adjust playing strength based on player rank.
	if req.Rank != "" {
		if err := k.applyRankSettings(ctx, req.Rank); err != nil {
			return nil, fmt.Errorf("apply rank settings: %w", err)
		}
	}

	// Ask for the best move.
	color := gtpColor(req.ColorToPlay)
	if err := k.send("genmove %s", color); err != nil {
		return nil, err
	}
	move, err := k.readResponseCtx(ctx)
	if err != nil {
		return nil, fmt.Errorf("genmove: %w", err)
	}

	moveStr := strings.ToUpper(strings.TrimSpace(move))

	// Get score estimate after the move has been played.
	score, scoreErr := k.estimateScoreRaw(ctx)
	if scoreErr != nil {
		slog.Warn("failed to get score after genmove, returning move only", "err", scoreErr)
		return &GenMoveResult{Move: moveStr}, nil
	}

	return &GenMoveResult{
		Move:         moveStr,
		BlackWinRate: score.BlackWinRate,
		ScoreLead:    score.ScoreLead,
	}, nil
}

// GenMoveResult holds the AI move and optional score estimate.
type GenMoveResult struct {
	Move         string
	BlackWinRate float64
	ScoreLead    float64
}

// estimateScoreRaw runs kata-raw-nn on the current board position (no replay).
// The caller must hold k.mu.
func (k *KataGo) estimateScoreRaw(ctx context.Context) (*ScoreResult, error) {
	if err := k.send("kata-raw-nn 0"); err != nil {
		return nil, err
	}
	lines, err := k.readFullResponseCtx(ctx)
	if err != nil {
		return nil, fmt.Errorf("kata-raw-nn: %w", err)
	}

	var whiteWin, whiteLead float64
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		switch fields[0] {
		case "whiteWin":
			if v, err := strconv.ParseFloat(fields[1], 64); err == nil {
				whiteWin = v
			}
		case "whiteLead":
			if v, err := strconv.ParseFloat(fields[1], 64); err == nil {
				whiteLead = v
			}
		}
	}

	return &ScoreResult{
		BlackWinRate: 1.0 - whiteWin,
		ScoreLead:    -whiteLead,
	}, nil
}

// ScoreResult holds the parsed score estimation from kata-raw-nn.
type ScoreResult struct {
	BlackWinRate float64
	ScoreLead    float64
}

// EstimateScore replays the full game described by req and returns a neural-network
// score estimate using the `kata-raw-nn 0` GTP command.
// BlackWinRate is in [0,1]; ScoreLead is positive when black leads.
func (k *KataGo) EstimateScore(ctx context.Context, req *MoveRequest) (*ScoreResult, error) {
	ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()

	k.mu.Lock()
	defer k.mu.Unlock()

	if k.tainted {
		if err := k.restart(); err != nil {
			return nil, fmt.Errorf("restart after taint: %w", err)
		}
	}

	// Clear the board before replaying moves.
	if err := k.send("clear_board"); err != nil {
		return nil, err
	}
	if _, err := k.readResponseCtx(ctx); err != nil {
		return nil, fmt.Errorf("clear_board: %w", err)
	}

	if err := k.send("boardsize %d", req.BoardSize); err != nil {
		return nil, err
	}
	if _, err := k.readResponseCtx(ctx); err != nil {
		return nil, fmt.Errorf("boardsize: %w", err)
	}

	if err := k.send("komi %.1f", req.Komi); err != nil {
		return nil, err
	}
	if _, err := k.readResponseCtx(ctx); err != nil {
		return nil, fmt.Errorf("komi: %w", err)
	}

	for i, m := range req.Moves {
		color := gtpColor(m.Color)
		pos := strings.ToUpper(m.Position)
		if err := k.send("play %s %s", color, pos); err != nil {
			return nil, err
		}
		if _, err := k.readResponseCtx(ctx); err != nil {
			return nil, fmt.Errorf("play move %d (%s %s): %w", i, color, pos, err)
		}
	}

	return k.estimateScoreRaw(ctx)
}

// Quit sends the GTP quit command and waits for the process to exit.
func (k *KataGo) Quit() error {
	k.mu.Lock()
	defer k.mu.Unlock()

	if err := k.send("quit"); err != nil {
		// Best-effort: attempt to kill the process directly.
		_ = k.cmd.Process.Kill()
		return err
	}
	// Drain the quit acknowledgement; ignore errors — process may already exit.
	_, _ = k.readResponse()
	_ = k.stdin.Close()
	if err := k.cmd.Wait(); err != nil {
		// Exit code 0 is expected; anything else we log but do not propagate.
		slog.Warn("katago exited with non-zero status", "err", err)
	}
	slog.Info("katago process stopped")
	return nil
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

// waitReady discards lines until the first blank line that signals KataGo is
// ready to accept GTP commands.  KataGo emits startup logging before the
// engine is ready; we skip it by watching for a GTP-style response prefix.
func (k *KataGo) waitReady() error {
	// KataGo does not emit a formal "ready" token, but the first GTP response
	// will arrive after we send a command.  We probe with a no-op command.
	if err := k.send("protocol_version"); err != nil {
		return err
	}
	_, err := k.readResponse()
	return err
}

// send writes a formatted GTP command followed by a newline to KataGo's stdin.
func (k *KataGo) send(format string, args ...any) error {
	line := fmt.Sprintf(format, args...) + "\n"
	if _, err := io.WriteString(k.stdin, line); err != nil {
		return fmt.Errorf("write gtp command %q: %w", strings.TrimSpace(line), err)
	}
	return nil
}

// readResponse reads a single GTP response from KataGo's stdout.
//
// GTP responses have the form:
//
//	= <content>\n\n   (success)
//	? <message>\n\n   (failure)
//
// The function returns the content on success and an error wrapping the GTP
// error message on failure.
func (k *KataGo) readResponse() (string, error) {
	var lines []string
	for {
		line, err := k.stdout.ReadString('\n')
		if err != nil {
			return "", fmt.Errorf("read gtp response: %w", err)
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "" {
			// Blank line terminates the response.
			break
		}
		lines = append(lines, trimmed)
	}

	if len(lines) == 0 {
		return "", fmt.Errorf("empty gtp response")
	}

	first := lines[0]
	if strings.HasPrefix(first, "=") {
		// Strip the "= " prefix and return the content.
		content := strings.TrimPrefix(first, "=")
		content = strings.TrimSpace(content)
		return content, nil
	}
	if strings.HasPrefix(first, "?") {
		msg := strings.TrimSpace(strings.TrimPrefix(first, "?"))
		return "", fmt.Errorf("gtp error: %s", msg)
	}

	return "", fmt.Errorf("unexpected gtp response: %q", first)
}

// readResponseCtx wraps readResponse with context cancellation support.
// It runs readResponse in a goroutine and returns its result, or a context
// error if the context is cancelled/timed out first.  Note: if the context
// fires, the goroutine will remain blocked on the underlying read until
// KataGo eventually responds or the process terminates — we intentionally
// do NOT kill KataGo since it may recover.
func (k *KataGo) readResponseCtx(ctx context.Context) (string, error) {
	type result struct {
		val string
		err error
	}
	ch := make(chan result, 1)
	go func() {
		v, err := k.readResponse()
		ch <- result{v, err}
	}()
	select {
	case <-ctx.Done():
		// The goroutine is still blocked reading from KataGo's stdout.
		// All subsequent GTP I/O will be out of sync, so mark tainted
		// to trigger a restart on the next request.
		k.tainted = true
		return "", fmt.Errorf("gtp read cancelled: %w", ctx.Err())
	case r := <-ch:
		return r.val, r.err
	}
}

// readFullResponse reads a GTP response and returns ALL content lines
// (not just the first), which is needed for multiline responses like kata-raw-nn.
func (k *KataGo) readFullResponse() ([]string, error) {
	var lines []string
	firstLine := true
	for {
		line, err := k.stdout.ReadString('\n')
		if err != nil {
			return nil, fmt.Errorf("read gtp response: %w", err)
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if trimmed == "" {
			break
		}
		if firstLine {
			firstLine = false
			if strings.HasPrefix(trimmed, "?") {
				msg := strings.TrimSpace(strings.TrimPrefix(trimmed, "?"))
				return nil, fmt.Errorf("gtp error: %s", msg)
			}
			// Strip the leading "= " from the first line if present.
			trimmed = strings.TrimSpace(strings.TrimPrefix(trimmed, "="))
			if trimmed != "" {
				lines = append(lines, trimmed)
			}
			continue
		}
		lines = append(lines, trimmed)
	}
	return lines, nil
}

// readFullResponseCtx wraps readFullResponse with context cancellation support.
func (k *KataGo) readFullResponseCtx(ctx context.Context) ([]string, error) {
	type result struct {
		val []string
		err error
	}
	ch := make(chan result, 1)
	go func() {
		v, err := k.readFullResponse()
		ch <- result{v, err}
	}()
	select {
	case <-ctx.Done():
		k.tainted = true
		return nil, fmt.Errorf("gtp read cancelled: %w", ctx.Err())
	case r := <-ch:
		return r.val, r.err
	}
}

// gtpColor normalises a color string ("B"/"W"/"black"/"white") to the
// lowercase form expected by GTP ("black"/"white").
func gtpColor(c string) string {
	switch strings.ToUpper(c) {
	case "B", "BLACK":
		return "black"
	case "W", "WHITE":
		return "white"
	default:
		return strings.ToLower(c)
	}
}

// rankSettings holds the KataGo parameters for a given rank level.
type rankSettings struct {
	maxVisits   int
	temperature float64 // chosenMoveTemperature: higher = more random (weaker)
	// Human SL model parameters (only used when human model is loaded).
	humanSLProfile        string  // e.g. "rank_20k"
	humanSLChosenMoveProp float64 // probability of playing human-like move (1.0 = always)
	humanSLPiklLambda     float64 // how aggressively to filter bad human moves (large = no filter)
}

// rankSettingsTable returns the settings for a given rank.
// The first return value is the settings for when human model is available,
// the second is for when only maxVisits + temperature is used.
func getRankSettings(rank string, hasHumanModel bool) (rankSettings, bool) {
	// Human SL model settings: natural human-like play at each level.
	// PIKL Lambda: lower = stronger adherence to human SL profile (weaker play),
	//              higher = more KataGo optimal play (stronger play).
	humanTable := map[string]rankSettings{
		"15k": {maxVisits: 1, temperature: 2.80, humanSLProfile: "rank_20k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.0000075},
		"10k": {maxVisits: 1, temperature: 2.80, humanSLProfile: "rank_20k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.0000075},
		"7k":  {maxVisits: 1, temperature: 2.80, humanSLProfile: "rank_20k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.0000075},
		"5k":  {maxVisits: 1, temperature: 2.70, humanSLProfile: "rank_15k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.00003},
		"3k":  {maxVisits: 1, temperature: 2.60, humanSLProfile: "rank_10k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.000075},
		"1k":  {maxVisits: 1, temperature: 2.20, humanSLProfile: "rank_7k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.005},
		"1d":  {maxVisits: 1, temperature: 1.80, humanSLProfile: "rank_5k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.02},
		"2d":  {maxVisits: 1, temperature: 1.50, humanSLProfile: "rank_3k", humanSLChosenMoveProp: 1.0, humanSLPiklLambda: 0.075},
		"3d":  {maxVisits: 2, temperature: 1.20, humanSLProfile: "rank_1k", humanSLChosenMoveProp: 0.9, humanSLPiklLambda: 0.25},
		"4d":  {maxVisits: 20, temperature: 0.70, humanSLProfile: "rank_1d", humanSLChosenMoveProp: 0.8, humanSLPiklLambda: 1.25},
		"5d":  {maxVisits: 38, temperature: 0.55, humanSLProfile: "rank_2d", humanSLChosenMoveProp: 0.7, humanSLPiklLambda: 2.5},
		"7d":  {maxVisits: 75, temperature: 0.50, humanSLProfile: "rank_3d", humanSLChosenMoveProp: 0.6, humanSLPiklLambda: 5.0},
	}

	// Fallback settings: only maxVisits + temperature (no human model).
	// Note: temperature capped at 1.5 to avoid nonsensical random moves (e.g. 1st/2nd line spam).
	// True low-rank play requires the Human SL model; fallback is inherently limited.
	fallbackTable := map[string]rankSettings{
		"15k": {maxVisits: 1, temperature: 5.00},
		"10k": {maxVisits: 1, temperature: 5.00},
		"7k":  {maxVisits: 1, temperature: 5.00},
		"5k":  {maxVisits: 1, temperature: 5.00},
		"3k":  {maxVisits: 1, temperature: 4.70},
		"1k":  {maxVisits: 1, temperature: 3.60},
		"1d":  {maxVisits: 1, temperature: 2.80},
		"2d":  {maxVisits: 1, temperature: 2.00},
		"3d":  {maxVisits: 4, temperature: 1.40},
		"4d":  {maxVisits: 25, temperature: 0.65},
		"5d":  {maxVisits: 62, temperature: 0.50},
		"7d":  {maxVisits: 125, temperature: 0.45},
	}

	if hasHumanModel {
		s, ok := humanTable[rank]
		return s, ok
	}
	s, ok := fallbackTable[rank]
	return s, ok
}

// applyRankSettings sends the appropriate kata-set-param commands for the
// given rank. The caller must hold k.mu.
func (k *KataGo) applyRankSettings(ctx context.Context, rank string) error {
	settings, ok := getRankSettings(rank, k.hasHumanModel)
	if !ok {
		return nil
	}

	// Parameters to set: name, value pairs.
	params := []struct {
		name string
		val  string
	}{
		{"maxVisits", strconv.Itoa(settings.maxVisits)},
		{"chosenMoveTemperature", fmt.Sprintf("%.2f", settings.temperature)},
		{"chosenMoveTemperatureEarly", fmt.Sprintf("%.2f", settings.temperature)},
	}

	if k.hasHumanModel && settings.humanSLProfile != "" {
		params = append(params,
			struct{ name, val string }{"humanSLProfile", settings.humanSLProfile},
			struct{ name, val string }{"humanSLChosenMoveProp", fmt.Sprintf("%.2f", settings.humanSLChosenMoveProp)},
			struct{ name, val string }{"humanSLChosenMoveIgnorePass", "true"},
			struct{ name, val string }{"humanSLChosenMovePiklLambda", fmt.Sprintf("%g", settings.humanSLPiklLambda)},
		)
	}

	for _, p := range params {
		if err := k.send("kata-set-param %s %s", p.name, p.val); err != nil {
			return err
		}
		if _, err := k.readResponseCtx(ctx); err != nil {
			return fmt.Errorf("kata-set-param %s: %w", p.name, err)
		}
	}

	slog.Info("rank settings applied", "rank", rank, "maxVisits", settings.maxVisits,
		"temperature", settings.temperature, "humanModel", k.hasHumanModel)
	return nil
}

// --------------------------------------------------------------------------
// logWriter pipes KataGo's stderr into our structured logger.
// --------------------------------------------------------------------------

type logWriter struct{ prefix string }

func (w logWriter) Write(p []byte) (int, error) {
	msg := strings.TrimRight(string(p), "\n")
	for _, line := range strings.Split(msg, "\n") {
		if line != "" {
			slog.Debug("katago stderr", "line", line)
		}
	}
	return len(p), nil
}
