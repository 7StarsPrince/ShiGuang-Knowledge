import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'insight-vault.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Auto-create tables
  _db.exec(`
    CREATE TABLE IF NOT EXISTS speeches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      conference TEXT,
      speaker TEXT,
      speech_date TEXT,
      transcript TEXT,
      transcript_json TEXT,
      audio_path TEXT,
      audio_duration INTEGER DEFAULT 0,
      notes TEXT,
      source_url TEXT,
      iflyrec_audio_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS speech_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      speech_id INTEGER NOT NULL,
      slide_order INTEGER DEFAULT 0,
      slide_time INTEGER DEFAULT 0,
      image_path TEXT NOT NULL,
      FOREIGN KEY (speech_id) REFERENCES speeches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      source_name TEXT,
      source_url TEXT,
      author TEXT,
      summary TEXT,
      content TEXT,
      cover_image TEXT,
      published_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS speech_tags (
      speech_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (speech_id, tag_id),
      FOREIGN KEY (speech_id) REFERENCES speeches(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS article_tags (
      article_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (article_id, tag_id),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES topics(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS academic_papers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      authors TEXT,
      abstract TEXT,
      content TEXT,
      journal TEXT,
      year TEXT,
      doi TEXT,
      url TEXT,
      keywords TEXT,
      topic_id INTEGER REFERENCES topics(id),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_tags (
      paper_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (paper_id, tag_id),
      FOREIGN KEY (paper_id) REFERENCES academic_papers(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `);

  // Migrate: add new columns if they don't exist
  const columns = _db.prepare("PRAGMA table_info(speeches)").all().map((c: any) => c.name);
  if (!columns.includes('transcript_json')) _db.exec("ALTER TABLE speeches ADD COLUMN transcript_json TEXT");
  if (!columns.includes('audio_duration')) _db.exec("ALTER TABLE speeches ADD COLUMN audio_duration INTEGER DEFAULT 0");
  if (!columns.includes('source_url')) _db.exec("ALTER TABLE speeches ADD COLUMN source_url TEXT");
  if (!columns.includes('iflyrec_audio_id')) _db.exec("ALTER TABLE speeches ADD COLUMN iflyrec_audio_id TEXT");
  if (!columns.includes('topic')) _db.exec("ALTER TABLE speeches ADD COLUMN topic TEXT");
  if (!columns.includes('topic_id')) _db.exec("ALTER TABLE speeches ADD COLUMN topic_id INTEGER REFERENCES topics(id)");
  if (!columns.includes('audio_enhanced_path')) _db.exec("ALTER TABLE speeches ADD COLUMN audio_enhanced_path TEXT");
  if (!columns.includes('audio_enhanced_demucs_path')) _db.exec("ALTER TABLE speeches ADD COLUMN audio_enhanced_demucs_path TEXT");
  if (!columns.includes('transcript_demucs_json')) _db.exec("ALTER TABLE speeches ADD COLUMN transcript_demucs_json TEXT");
  if (!columns.includes('demucs_passes')) _db.exec("ALTER TABLE speeches ADD COLUMN demucs_passes INTEGER DEFAULT 0");

  const slideColumns = _db.prepare("PRAGMA table_info(speech_slides)").all().map((c: any) => c.name);
  if (!slideColumns.includes('slide_time')) _db.exec("ALTER TABLE speech_slides ADD COLUMN slide_time INTEGER DEFAULT 0");

  const articleColumns = _db.prepare("PRAGMA table_info(articles)").all().map((c: any) => c.name);
  if (!articleColumns.includes('topic')) _db.exec("ALTER TABLE articles ADD COLUMN topic TEXT");
  if (!articleColumns.includes('topic_id')) _db.exec("ALTER TABLE articles ADD COLUMN topic_id INTEGER REFERENCES topics(id)");
  if (!articleColumns.includes('content_html')) _db.exec("ALTER TABLE articles ADD COLUMN content_html TEXT");
  if (!articleColumns.includes('ai_keywords')) _db.exec("ALTER TABLE articles ADD COLUMN ai_keywords TEXT");
  if (!articleColumns.includes('ai_summary')) _db.exec("ALTER TABLE articles ADD COLUMN ai_summary TEXT");
  if (!articleColumns.includes('ai_entities')) _db.exec("ALTER TABLE articles ADD COLUMN ai_entities TEXT");
  if (!articleColumns.includes('ai_analyzed_at')) _db.exec("ALTER TABLE articles ADD COLUMN ai_analyzed_at TEXT");

  const paperColumns = _db.prepare("PRAGMA table_info(academic_papers)").all().map((c: any) => c.name);
  if (!paperColumns.includes('ai_keywords')) _db.exec("ALTER TABLE academic_papers ADD COLUMN ai_keywords TEXT");
  if (!paperColumns.includes('ai_summary')) _db.exec("ALTER TABLE academic_papers ADD COLUMN ai_summary TEXT");
  if (!paperColumns.includes('ai_entities')) _db.exec("ALTER TABLE academic_papers ADD COLUMN ai_entities TEXT");
  if (!paperColumns.includes('ai_analyzed_at')) _db.exec("ALTER TABLE academic_papers ADD COLUMN ai_analyzed_at TEXT");
  if (!paperColumns.includes('pdf_path')) _db.exec("ALTER TABLE academic_papers ADD COLUMN pdf_path TEXT");
  if (!paperColumns.includes('translation_zh')) _db.exec("ALTER TABLE academic_papers ADD COLUMN translation_zh TEXT");

  const speechColumnsNew = _db.prepare("PRAGMA table_info(speeches)").all().map((c: any) => c.name);
  if (!speechColumnsNew.includes('ai_keywords')) _db.exec("ALTER TABLE speeches ADD COLUMN ai_keywords TEXT");
  if (!speechColumnsNew.includes('ai_summary')) _db.exec("ALTER TABLE speeches ADD COLUMN ai_summary TEXT");
  if (!speechColumnsNew.includes('ai_entities')) _db.exec("ALTER TABLE speeches ADD COLUMN ai_entities TEXT");
  if (!speechColumnsNew.includes('ai_analyzed_at')) _db.exec("ALTER TABLE speeches ADD COLUMN ai_analyzed_at TEXT");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS ai_analysis_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_type TEXT NOT NULL CHECK(content_type IN ('article','speech','paper')),
      content_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(content_type, content_id)
    );
  `);

  _db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  return _db;
}

export default getDb;
