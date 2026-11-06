import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cmi.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    location_text TEXT,
    lat REAL,
    lng REAL,
    severity_score INTEGER DEFAULT 0,
    severity_label TEXT DEFAULT 'Low',
    report_count INTEGER DEFAULT 1,
    independent_count INTEGER DEFAULT 1,
    confidence REAL DEFAULT 0.35,
    avg_sentiment REAL DEFAULT 0,
    status TEXT DEFAULT 'unverified',      -- unverified | verified | resolved | rejected
    notes TEXT DEFAULT '',
    first_seen TEXT,
    last_seen TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    text_hash TEXT,
    source TEXT,
    language TEXT,
    relevant INTEGER DEFAULT 1,
    category TEXT,
    sub_issue TEXT,
    affected TEXT,
    location_text TEXT,
    lat REAL,
    lng REAL,
    geo_confidence REAL DEFAULT 0,
    geo_method TEXT,
    incident_time TEXT,
    duration_min INTEGER,
    sentiment TEXT,
    sentiment_score REAL,
    severity_score INTEGER DEFAULT 0,
    severity_label TEXT,
    severity_reason TEXT,
    incident_id INTEGER REFERENCES incidents(id) ON DELETE SET NULL,
    is_copy INTEGER DEFAULT 0,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS geocache (
    query TEXT PRIMARY KEY,
    lat REAL,
    lng REAL
);

CREATE INDEX IF NOT EXISTS idx_reports_incident ON reports(incident_id);
CREATE INDEX IF NOT EXISTS idx_reports_hash ON reports(text_hash);
CREATE INDEX IF NOT EXISTS idx_incidents_cat ON incidents(category, status);

CREATE TABLE IF NOT EXISTS crowd_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    voter_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(incident_id, voter_hash)
);

CREATE TABLE IF NOT EXISTS incident_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
"""


def _connect():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db():
    """Use: with db() as conn: conn.execute(...)  (auto-commit / rollback / close)"""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript(SCHEMA)


def query_all(sql, params=()):
    with db() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def query_one(sql, params=()):
    with db() as conn:
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None


def execute(sql, params=()):
    with db() as conn:
        return conn.execute(sql, params).lastrowid