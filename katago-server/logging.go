package main

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	logDir        = "logs"
	logRetainDays = 7
)

// dailyFileWriter is an io.Writer that writes to a date-stamped log file
// inside logDir.  It automatically rotates to a new file when the date
// changes and cleans up files older than logRetainDays.
type dailyFileWriter struct {
	mu       sync.Mutex
	current  *os.File
	today    string // "2006-01-02"
	fallback io.Writer
}

func newDailyFileWriter(fallback io.Writer) *dailyFileWriter {
	return &dailyFileWriter{fallback: fallback}
}

func (w *dailyFileWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	today := time.Now().Format("2006-01-02")

	if today != w.today || w.current == nil {
		if err := w.rotate(today); err != nil {
			// 파일 열기 실패 시 fallback(stdout)에 기록
			return w.fallback.Write(p)
		}
	}

	n, err := w.current.Write(p)
	if err != nil {
		// 파일 쓰기 실패 시 fallback에도 기록
		w.fallback.Write(p)
	}
	return n, err
}

func (w *dailyFileWriter) rotate(today string) error {
	if w.current != nil {
		_ = w.current.Close()
	}

	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return err
	}

	path := filepath.Join(logDir, fmt.Sprintf("agent-%s.log", today))
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}

	w.current = f
	w.today = today

	// 비동기로 오래된 로그 정리
	go cleanOldLogs()

	return nil
}

func (w *dailyFileWriter) Close() error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.current != nil {
		return w.current.Close()
	}
	return nil
}

// cleanOldLogs removes log files older than logRetainDays.
func cleanOldLogs() {
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return
	}

	cutoff := time.Now().AddDate(0, 0, -logRetainDays)
	var files []os.DirEntry

	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "agent-") || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		files = append(files, e)
	}

	// 날짜순 정렬 (파일명에 날짜가 포함되어 있으므로 문자열 정렬로 충분)
	sort.Slice(files, func(i, j int) bool {
		return files[i].Name() < files[j].Name()
	})

	for _, f := range files {
		info, err := f.Info()
		if err != nil {
			continue
		}
		if info.ModTime().Before(cutoff) {
			path := filepath.Join(logDir, f.Name())
			if err := os.Remove(path); err == nil {
				slog.Info("old log file removed", "path", path)
			}
		}
	}
}

// setupLogging configures slog to write JSON logs to both stdout and
// a daily rotating log file in the logs/ directory.
func setupLogging() *dailyFileWriter {
	dfw := newDailyFileWriter(os.Stdout)
	multi := io.MultiWriter(os.Stdout, dfw)
	slog.SetDefault(slog.New(slog.NewJSONHandler(multi, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))
	return dfw
}
