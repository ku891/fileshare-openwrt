package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

var noteIDRe = regexp.MustCompile(`^[a-f0-9]{32}$`)

type noteMeta struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	UpdatedAt string `json:"updatedAt"`
}

type textStore struct {
	dir   string
	index string
	legacy string
}

func newTextStore(base string) *textStore {
	return &textStore{
		dir:    filepath.Join(base, "textshare"),
		index:  filepath.Join(base, "textshare", "index.json"),
		legacy: filepath.Join(base, "shared-text.txt"),
	}
}

func (t *textStore) init() error {
	if err := os.MkdirAll(t.dir, 0o755); err != nil {
		return err
	}
	notes, err := t.readIndex()
	if err != nil {
		return err
	}
	if len(notes) > 0 {
		return nil
	}
	initial := ""
	if b, err := os.ReadFile(t.legacy); err == nil {
		initial = string(b)
	}
	id, err := newNoteID()
	if err != nil {
		return err
	}
	notes = []noteMeta{{ID: id, Title: "默认笔记", UpdatedAt: time.Now().UTC().Format(time.RFC3339)}}
	if err := t.writeIndex(notes); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(t.dir, id+".txt"), []byte(initial), 0o644)
}

func newNoteID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (t *textStore) readIndex() ([]noteMeta, error) {
	b, err := os.ReadFile(t.index)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var wrap struct {
		Notes []noteMeta `json:"notes"`
	}
	if err := json.Unmarshal(b, &wrap); err != nil {
		return nil, err
	}
	return wrap.Notes, nil
}

func (t *textStore) writeIndex(notes []noteMeta) error {
	b, err := json.MarshalIndent(map[string]any{"notes": notes}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(t.index, b, 0o644)
}

func (t *textStore) readNote(id string) (string, error) {
	if !noteIDRe.MatchString(id) {
		return "", nil
	}
	b, err := os.ReadFile(filepath.Join(t.dir, id+".txt"))
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(b), nil
}

func (t *textStore) writeNote(id, text string) error {
	if !noteIDRe.MatchString(id) {
		return os.ErrInvalid
	}
	return os.WriteFile(filepath.Join(t.dir, id+".txt"), []byte(text), 0o644)
}
