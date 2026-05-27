package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const serviceDir = "/usr/lib/fileshare"

var (
	textExtRe  = regexp.MustCompile(`\.(txt|js|json|html|css|xml|md|log|conf|config|ini|yaml|yml|sh|bat|cmd|py|java|c|cpp|h|hpp|php|rb|go|rs|swift|kt|ts|jsx|tsx|vue|svelte)$`)
	imageExtRe = regexp.MustCompile(`\.(jpg|jpeg|png|gif|bmp|webp)$`)
	videoExtRe = regexp.MustCompile(`\.(mp4|avi|mov|wmv|flv|webm|mkv)$`)
)

type server struct {
	base     string
	upload   string
	public   string
	auth     *authState
	texts    *textStore
	cfg      Config
}

func main() {
	base := serviceDir
	if e := os.Getenv("FILESHARE_DIR"); e != "" {
		base = e
	}
	cfg := loadConfig()
	s := &server{
		base:   base,
		upload: filepath.Join(base, "uploads"),
		public: filepath.Join(base, "public"),
		auth:   newAuth(cfg),
		texts:  newTextStore(base),
		cfg:    cfg,
	}
	_ = os.MkdirAll(s.upload, 0o755)
	_ = os.MkdirAll(s.public, 0o755)
	if err := s.texts.init(); err != nil {
		log.Printf("textshare init: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.Handle("/uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(s.upload))))
	mux.Handle("/public/", http.StripPrefix("/public/", http.FileServer(http.Dir(s.public))))
	// static assets at root (css/js next to index)
	fs := http.FileServer(http.Dir(s.public))
	mux.Handle("/style.css", fs)
	mux.Handle("/script.js", fs)

	mux.HandleFunc("/api/files", s.auth.middleware(s.apiFiles))
	mux.HandleFunc("/api/upload", s.auth.middleware(s.apiUpload))
	mux.HandleFunc("/api/download/", s.apiDownload)
	mux.HandleFunc("/api/delete/", s.auth.middleware(s.apiDelete))
	mux.HandleFunc("/api/shared-text", s.auth.middleware(s.apiSharedText))
	mux.HandleFunc("/api/shared-texts", s.auth.middleware(s.apiSharedTexts))
	mux.HandleFunc("/api/shared-texts/", s.auth.middleware(s.apiSharedTextsID))
	mux.HandleFunc("/api/file-content/", s.auth.middleware(s.apiFileContent))

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" && !strings.HasPrefix(r.URL.Path, "/api/") &&
			r.URL.Path != "/style.css" && r.URL.Path != "/script.js" &&
			!strings.HasPrefix(r.URL.Path, "/uploads/") {
			r.URL.Path = "/"
		}
		mux.ServeHTTP(w, r)
	})

	if cfg.EnableHTTPS {
		tlsCfg, err := loadOrGenerateTLS(base, cfg)
		if err != nil {
			log.Printf("HTTPS cert: %v, fallback HTTP", err)
			log.Fatal(http.ListenAndServe(fmt.Sprintf("0.0.0.0:%d", cfg.Port), handler))
		}
		srv := &http.Server{Addr: fmt.Sprintf("0.0.0.0:%d", cfg.HTTPSPort), Handler: handler, TLSConfig: tlsCfg}
		go func() {
			if cfg.Port != cfg.HTTPSPort {
				redirect := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					host := strings.Split(r.Host, ":")[0]
					http.Redirect(w, r, fmt.Sprintf("https://%s:%d%s", host, cfg.HTTPSPort, r.URL.RequestURI()), http.StatusMovedPermanently)
				})
				log.Printf("HTTP redirect :%d -> HTTPS :%d", cfg.Port, cfg.HTTPSPort)
				_ = http.ListenAndServe(fmt.Sprintf("0.0.0.0:%d", cfg.Port), redirect)
			}
		}()
		log.Printf("HTTPS on :%d", cfg.HTTPSPort)
		log.Fatal(srv.ListenAndServeTLS("", ""))
	}
	log.Printf("HTTP on :%d", cfg.Port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf("0.0.0.0:%d", cfg.Port), handler))
}

func (s *server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.public, "index.html"))
}

func (s *server) safeUploadPath(name string) (string, bool) {
	name = filepath.Base(name)
	if name == "." || name == ".." || strings.Contains(name, "/") {
		return "", false
	}
	p := filepath.Join(s.upload, name)
	absUp, _ := filepath.Abs(s.upload)
	absP, _ := filepath.Abs(p)
	return p, strings.HasPrefix(absP, absUp+string(os.PathSeparator)) || absP == absUp
}

func (s *server) apiFiles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	entries, err := os.ReadDir(s.upload)
	if err != nil {
		s.auth.writeJSON(w, 500, map[string]string{"error": "获取文件列表失败"})
		return
	}
	type fileInfo struct {
		Name       string    `json:"name"`
		Size       int64     `json:"size"`
		UploadTime time.Time `json:"uploadTime"`
		IsImage    bool      `json:"isImage"`
		IsVideo    bool      `json:"isVideo"`
		IsText     bool      `json:"isText"`
	}
	var list []fileInfo
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		info, err := e.Info()
		if err != nil {
			continue
		}
		list = append(list, fileInfo{
			Name: name, Size: info.Size(), UploadTime: info.ModTime(),
			IsImage: imageExtRe.MatchString(name), IsVideo: videoExtRe.MatchString(name),
			IsText: textExtRe.MatchString(name),
		})
	}
	s.auth.writeJSON(w, 200, list)
}

func (s *server) apiUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	const maxMem = 32 << 20
	if err := r.ParseMultipartForm(maxMem); err != nil {
		s.auth.writeJSON(w, 400, map[string]string{"error": "解析上传失败"})
		return
	}
	var uploaded []map[string]any
	for _, headers := range r.MultipartForm.File {
		for _, fh := range headers {
			name := sanitizeFilename(fh.Filename)
			ts := time.Now().UnixMilli()
			ext := filepath.Ext(name)
			base := strings.TrimSuffix(name, ext)
			dstName := fmt.Sprintf("%s_%d%s", base, ts, ext)
			dst := filepath.Join(s.upload, dstName)
			src, err := fh.Open()
			if err != nil {
				continue
			}
			out, err := os.Create(dst)
			if err != nil {
				src.Close()
				continue
			}
			_, _ = io.Copy(out, src)
			out.Close()
			src.Close()
			uploaded = append(uploaded, map[string]any{"name": dstName, "originalName": name, "size": fh.Size})
		}
	}
	if len(uploaded) == 0 {
		s.auth.writeJSON(w, 400, map[string]string{"error": "没有文件被上传"})
		return
	}
	s.auth.writeJSON(w, 200, map[string]any{"message": "文件上传成功", "files": uploaded})
}

func sanitizeFilename(name string) string {
	// multer latin1 -> utf8 fix for CJK
	if strings.IndexFunc(name, func(r rune) bool { return r > 127 }) < 0 {
		b := []byte(name)
		if u := tryLatin1ToUTF8(b); u != "" {
			return u
		}
	}
	return filepath.Base(name)
}

func tryLatin1ToUTF8(b []byte) string {
	r := make([]rune, len(b))
	for i, c := range b {
		r[i] = rune(c)
	}
	return string(r)
}

func (s *server) apiDownload(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/download/")
	if name == "" {
		http.NotFound(w, r)
		return
	}
	p, ok := s.safeUploadPath(name)
	if !ok {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, p)
}

func (s *server) apiDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(r.URL.Path, "/api/delete/")
	p, ok := s.safeUploadPath(name)
	if !ok {
		s.auth.writeJSON(w, 404, map[string]string{"error": "文件不存在"})
		return
	}
	if err := os.Remove(p); err != nil {
		if os.IsNotExist(err) {
			s.auth.writeJSON(w, 404, map[string]string{"error": "文件不存在"})
		} else {
			s.auth.writeJSON(w, 500, map[string]string{"error": "文件删除失败"})
		}
		return
	}
	s.auth.writeJSON(w, 200, map[string]string{"message": "文件删除成功"})
}

func (s *server) apiSharedText(w http.ResponseWriter, r *http.Request) {
	notes, _ := s.texts.readIndex()
	var first string
	if len(notes) > 0 {
		first, _ = s.texts.readNote(notes[0].ID)
	}
	switch r.Method {
	case http.MethodGet:
		s.auth.writeJSON(w, 200, map[string]string{"text": first})
	case http.MethodPost:
		var body struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			s.auth.writeJSON(w, 400, map[string]string{"error": "无效的文本内容"})
			return
		}
		if len(notes) == 0 {
			s.auth.writeJSON(w, 500, map[string]string{"error": "笔记数据异常"})
			return
		}
		_ = s.texts.writeNote(notes[0].ID, body.Text)
		notes[0].UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		_ = s.texts.writeIndex(notes)
		s.auth.writeJSON(w, 200, map[string]any{"message": "文本更新成功", "text": body.Text})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *server) apiSharedTexts(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		notes, err := s.texts.readIndex()
		if err != nil {
			s.auth.writeJSON(w, 500, map[string]string{"error": "获取笔记列表失败"})
			return
		}
		var out []map[string]string
		for _, n := range notes {
			out = append(out, map[string]string{"id": n.ID, "title": n.Title, "updatedAt": n.UpdatedAt})
		}
		s.auth.writeJSON(w, 200, map[string]any{"notes": out})
	case http.MethodPost:
		var body struct {
			Title string `json:"title"`
			Text  string `json:"text"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		title := strings.TrimSpace(body.Title)
		if title == "" {
			title = "新笔记"
		}
		if len(title) > 200 {
			title = title[:200]
		}
		id, err := newNoteID()
		if err != nil {
			s.auth.writeJSON(w, 500, map[string]string{"error": "创建笔记失败"})
			return
		}
		now := time.Now().UTC().Format(time.RFC3339)
		notes, _ := s.texts.readIndex()
		notes = append(notes, noteMeta{ID: id, Title: title, UpdatedAt: now})
		_ = s.texts.writeIndex(notes)
		_ = s.texts.writeNote(id, body.Text)
		s.auth.writeJSON(w, 200, map[string]any{"id": id, "title": title, "updatedAt": now})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *server) apiSharedTextsID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/shared-texts/")
	path = strings.Trim(path, "/")
	if path == "" {
		http.NotFound(w, r)
		return
	}
	if r.Method == http.MethodDelete {
		id := path
		if !noteIDRe.MatchString(id) {
			s.auth.writeJSON(w, 400, map[string]string{"error": "无效的笔记 ID"})
			return
		}
		notes, _ := s.texts.readIndex()
		if len(notes) <= 1 {
			s.auth.writeJSON(w, 400, map[string]string{"error": "至少保留一篇笔记"})
			return
		}
		var next []noteMeta
		found := false
		for _, n := range notes {
			if n.ID == id {
				found = true
				continue
			}
			next = append(next, n)
		}
		if !found {
			s.auth.writeJSON(w, 404, map[string]string{"error": "笔记不存在"})
			return
		}
		_ = s.texts.writeIndex(next)
		_ = os.Remove(filepath.Join(s.texts.dir, id+".txt"))
		s.auth.writeJSON(w, 200, map[string]string{"message": "已删除"})
		return
	}
	if r.Method == http.MethodPost {
		id := path
		if !noteIDRe.MatchString(id) {
			s.auth.writeJSON(w, 400, map[string]string{"error": "无效的笔记 ID"})
			return
		}
		notes, _ := s.texts.readIndex()
		idx := -1
		for i, n := range notes {
			if n.ID == id {
				idx = i
				break
			}
		}
		if idx < 0 {
			s.auth.writeJSON(w, 404, map[string]string{"error": "笔记不存在"})
			return
		}
		var raw map[string]json.RawMessage
		_ = json.NewDecoder(r.Body).Decode(&raw)
		if v, ok := raw["title"]; ok {
			var t string
			_ = json.Unmarshal(v, &t)
			t = strings.TrimSpace(t)
			if t == "" {
				t = "未命名"
			}
			if len(t) > 200 {
				t = t[:200]
			}
			notes[idx].Title = t
		}
		bodyText, _ := s.texts.readNote(id)
		if v, ok := raw["text"]; ok {
			var t string
			_ = json.Unmarshal(v, &t)
			_ = s.texts.writeNote(id, t)
			bodyText = t
		}
		notes[idx].UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		_ = s.texts.writeIndex(notes)
		s.auth.writeJSON(w, 200, map[string]any{
			"message": "保存成功", "id": id, "title": notes[idx].Title,
			"text": bodyText, "updatedAt": notes[idx].UpdatedAt,
		})
		return
	}
	if r.Method == http.MethodGet {
		id := path
		if !noteIDRe.MatchString(id) {
			s.auth.writeJSON(w, 400, map[string]string{"error": "无效的笔记 ID"})
			return
		}
		notes, _ := s.texts.readIndex()
		var meta *noteMeta
		for i := range notes {
			if notes[i].ID == id {
				meta = &notes[i]
				break
			}
		}
		if meta == nil {
			s.auth.writeJSON(w, 404, map[string]string{"error": "笔记不存在"})
			return
		}
		text, _ := s.texts.readNote(id)
		s.auth.writeJSON(w, 200, map[string]any{
			"id": meta.ID, "title": meta.Title, "text": text, "updatedAt": meta.UpdatedAt,
		})
		return
	}
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}

func (s *server) apiFileContent(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/api/file-content/")
	name, _ = strings.CutSuffix(name, "/")
	p, ok := s.safeUploadPath(name)
	if !ok {
		s.auth.writeJSON(w, 400, map[string]string{"error": "无效的文件路径"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		st, err := os.Stat(p)
		if err != nil {
			s.auth.writeJSON(w, 404, map[string]string{"error": "文件不存在"})
			return
		}
		if st.Size() > 5<<20 {
			s.auth.writeJSON(w, 400, map[string]string{"error": "文件过大，无法在线编辑（最大 5MB）"})
			return
		}
		b, err := os.ReadFile(p)
		if err != nil {
			s.auth.writeJSON(w, 500, map[string]string{"error": "读取文件失败"})
			return
		}
		s.auth.writeJSON(w, 200, map[string]any{"content": string(b), "size": st.Size()})
	case http.MethodPost:
		var body struct {
			Content string `json:"content"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			s.auth.writeJSON(w, 400, map[string]string{"error": "无效的文件内容"})
			return
		}
		if err := os.WriteFile(p, []byte(body.Content), 0o644); err != nil {
			s.auth.writeJSON(w, 500, map[string]string{"error": "保存文件失败"})
			return
		}
		st, _ := os.Stat(p)
		s.auth.writeJSON(w, 200, map[string]any{
			"message": "文件保存成功", "size": st.Size(),
			"savedAt": time.Now().UTC().Format(time.RFC3339),
		})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
