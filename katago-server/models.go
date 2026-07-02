package main

type MoveRecord struct {
	Color    string `json:"color"`
	Position string `json:"position"`
}

type MoveRequest struct {
	RequestID   string       `json:"request_id"`
	Type        string       `json:"type,omitempty"`
	BoardSize   int          `json:"board_size"`
	Komi        float64      `json:"komi"`
	Moves       []MoveRecord `json:"moves"`
	ColorToPlay string       `json:"color_to_play,omitempty"`
	Rank        string       `json:"rank,omitempty"`
}

type MoveResponse struct {
	RequestID    string  `json:"request_id"`
	Move         string  `json:"move"`
	Success      bool    `json:"success"`
	Error        *string `json:"error"`
	BlackWinRate float64 `json:"black_win_rate,omitempty"`
	ScoreLead    float64 `json:"score_lead,omitempty"`
}
