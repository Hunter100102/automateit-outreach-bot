PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_query TEXT,
    domain TEXT,
    page_url TEXT,
    name TEXT,
    title TEXT,
    email TEXT UNIQUE,
    city TEXT,
    state TEXT,
    industry TEXT,
    verified INTEGER DEFAULT 0,
    verification_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_email TEXT,
    sendgrid_msg_id TEXT,
    status TEXT,
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppression (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domains_visited (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
