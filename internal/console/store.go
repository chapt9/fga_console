package console

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"time"
)

// Batch records one "Give access": the shares a person gave in one go, so
// they can take them back together. fga keeps the shares themselves; this
// is only the grouping, which fga has no place for.
type Batch struct {
	ID      string      `json:"id"`
	Grantor string      `json:"grantor"`
	Grantee string      `json:"grantee"`
	Actions []string    `json:"actions"`
	Created time.Time   `json:"created"`
	Expires time.Time   `json:"expires"`
	Files   []BatchFile `json:"files"`
}

// BatchFile is one shared file.
type BatchFile struct {
	Space string `json:"space"`
	Key   string `json:"key"`
}

// Store keeps the console's own records in one JSON file in the data folder,
// replaced atomically on every change.
type Store struct {
	mu      sync.Mutex
	path    string
	Batches []Batch `json:"batches"`
}

// OpenStore reads the store in dir, or starts an empty one.
func OpenStore(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{path: filepath.Join(dir, "console-records.json")}
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, err
	}
	return s, json.Unmarshal(raw, s)
}

func (s *Store) save() error {
	raw, err := json.MarshalIndent(s, "", " ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(raw); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// AddBatch records a batch.
func (s *Store) AddBatch(b Batch) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Batches = append(s.Batches, b)
	return s.save()
}

// BatchesOf returns the unexpired batches a person gave, newest first.
func (s *Store) BatchesOf(grantor string, now time.Time) []Batch {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Batch
	for _, b := range s.Batches {
		if b.Grantor == grantor && b.Expires.After(now) {
			out = append(out, b)
		}
	}
	slices.SortFunc(out, func(a, b Batch) int { return b.Created.Compare(a.Created) })
	return out
}

// Batch returns one of a person's batches.
func (s *Store) Batch(id, grantor string) (Batch, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, b := range s.Batches {
		if b.ID == id && b.Grantor == grantor {
			return b, true
		}
	}
	return Batch{}, false
}

// KeepFiles replaces a batch's files with those still shared; a batch left
// without files is dropped, and so are expired batches.
func (s *Store) KeepFiles(id, grantor string, files []BatchFile, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := s.Batches[:0]
	for _, b := range s.Batches {
		if b.ID == id && b.Grantor == grantor {
			b.Files = files
		}
		if len(b.Files) > 0 && b.Expires.After(now) {
			out = append(out, b)
		}
	}
	s.Batches = out
	return s.save()
}
