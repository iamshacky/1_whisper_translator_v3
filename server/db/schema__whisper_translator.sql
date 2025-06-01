-- schema__whisper_translator.sql

-- Rooms table (for public/private/grouped messages)
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_private INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    sender_id TEXT,
    sender_type TEXT CHECK(sender_type IN ('me', 'them', 'system')),
    original TEXT,
    corrected TEXT,
    translated TEXT,
    my_output TEXT,
    source_lang TEXT,
    target_lang TEXT,
    warning TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);
