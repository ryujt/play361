package main

import (
	"os"
)

type Config struct {
	ListenAddr       string
	KataGoPath       string
	KataGoModel      string
	KataGoHumanModel string
	KataGoConfig     string
}

func LoadConfig() *Config {
	return &Config{
		ListenAddr:       getEnvOrDefault("LISTEN_ADDR", ":8789"),
		KataGoPath:       getEnvOrDefault("KATAGO_PATH", "/opt/homebrew/bin/katago"),
		KataGoModel:      getEnvOrDefault("KATAGO_MODEL", "/opt/homebrew/share/katago/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz"),
		KataGoHumanModel: os.Getenv("KATAGO_HUMAN_MODEL"),
		KataGoConfig:     getEnvOrDefault("KATAGO_CONFIG", "/opt/homebrew/share/katago/configs/gtp_example.cfg"),
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
