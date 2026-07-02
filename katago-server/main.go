package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
)

// katago-server exposes the local KataGo engine over HTTP.
// It replaces the AWS SQS/DynamoDB transport of the original agent: the
// backend POSTs a MoveRequest and receives a MoveResponse synchronously.
func main() {
	logWriter := setupLogging()
	defer logWriter.Close()

	if err := run(); err != nil {
		slog.Error("fatal error", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := LoadConfig()
	slog.Info("configuration loaded",
		"listen", cfg.ListenAddr,
		"katago", cfg.KataGoPath,
		"model", cfg.KataGoModel,
		"human_model", cfg.KataGoHumanModel,
		"config", cfg.KataGoConfig,
	)

	kg, err := NewKataGo(cfg.KataGoPath, cfg.KataGoModel, cfg.KataGoConfig, cfg.KataGoHumanModel)
	if err != nil {
		return err
	}
	defer func() {
		if qErr := kg.Quit(); qErr != nil {
			slog.Error("failed to quit katago", "err", qErr)
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("POST /genmove", makeGenmoveHandler(kg))

	slog.Info("katago-server ready", "listen", cfg.ListenAddr)
	return http.ListenAndServe(cfg.ListenAddr, mux)
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// makeGenmoveHandler processes both move-generation and score-estimation
// requests. A request with Type == "score" is routed to EstimateScore.
func makeGenmoveHandler(kg *KataGo) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req MoveRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
			return
		}

		slog.Info("processing request",
			"request_id", req.RequestID,
			"type", req.Type,
			"board_size", req.BoardSize,
			"komi", req.Komi,
			"moves", len(req.Moves),
			"color", req.ColorToPlay,
			"rank", req.Rank,
		)

		resp := &MoveResponse{RequestID: req.RequestID, Success: true}

		if req.Type == "score" {
			score, err := kg.EstimateScore(r.Context(), &req)
			if err != nil {
				slog.Error("katago failed to estimate score", "request_id", req.RequestID, "err", err)
				writeFailure(w, &req, err)
				return
			}
			resp.BlackWinRate = score.BlackWinRate
			resp.ScoreLead = score.ScoreLead
			slog.Info("score estimated", "request_id", req.RequestID,
				"black_win_rate", score.BlackWinRate, "score_lead", score.ScoreLead)
		} else {
			result, err := kg.GenMove(r.Context(), &req)
			if err != nil {
				slog.Error("katago failed to generate move", "request_id", req.RequestID, "err", err)
				writeFailure(w, &req, err)
				return
			}
			resp.Move = result.Move
			resp.BlackWinRate = result.BlackWinRate
			resp.ScoreLead = result.ScoreLead
			slog.Info("move generated", "request_id", req.RequestID,
				"move", result.Move, "black_win_rate", result.BlackWinRate, "score_lead", result.ScoreLead)
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

func writeFailure(w http.ResponseWriter, req *MoveRequest, err error) {
	msg := err.Error()
	writeJSON(w, http.StatusOK, &MoveResponse{
		RequestID: req.RequestID,
		Success:   false,
		Error:     &msg,
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("failed to encode response", "err", err)
	}
}
