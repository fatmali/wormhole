// Database layer for Wormhole
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { TimelineEvent, Config, QueryResult, Session } from './types.js';
import { getWormholeDir, getArchiveDir } from './config.js';

let db: Database.Database | null = null;

// In-memory active sessions per project
const activeSessions = new Map<string, string>();

const SCHEMA = `
CREATE TABLE IF NOT EXISTS timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  project_path TEXT NOT NULL,
  isolated INTEGER DEFAULT 0,
  session_id TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  project_path TEXT NOT NULL,
  description TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  started_by TEXT NOT NULL,
  summary TEXT,
  active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_timestamp ON timeline(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_project ON timeline(project_path);
CREATE INDEX IF NOT EXISTS idx_session ON timeline(session_id);
CREATE INDEX IF NOT EXISTS idx_project_timestamp ON timeline(project_path, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path, active);
`;

export function initDatabase(): Database.Database {
    if (db) return db;

    const dbPath = path.join(getWormholeDir(), 'timeline.db');
    db = new Database(dbPath);
    db.exec(SCHEMA);

    return db;
}

export function getDatabase(): Database.Database {
    if (!db) {
        return initDatabase();
    }
    return db;
}

// === Timeline Events ===

export function addEvent(
    agent_id: string,
    action: string,
    payload: string,
    project_path: string,
    isolated: boolean = false,
    session_id: string | null = null
): number {
    const db = getDatabase();
    const timestamp = Date.now();

    const stmt = db.prepare(`
    INSERT INTO timeline (agent_id, action, payload, timestamp, project_path, isolated, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    const result = stmt.run(agent_id, action, payload, timestamp, project_path, isolated ? 1 : 0, session_id);
    return result.lastInsertRowid as number;
}

export function getRecentEvents(
    project_path: string,
    limit: number = 5,
    since_cursor: string | null = null,
    action_types: string[] | null = null
): QueryResult {
    const db = getDatabase();

    let query = `
    SELECT * FROM timeline 
    WHERE project_path = ?
  `;
    const params: (string | number)[] = [project_path];

    // Handle cursor-based pagination
    if (since_cursor) {
        const cursorId = parseInt(since_cursor.replace('evt_', ''), 10);
        if (!isNaN(cursorId)) {
            query += ` AND id > ?`;
            params.push(cursorId);
        }
    }

    // Handle action type filtering
    if (action_types && action_types.length > 0) {
        const placeholders = action_types.map(() => '?').join(', ');
        query += ` AND action IN (${placeholders})`;
        params.push(...action_types);
    }

    // Find the most recent isolation boundary
    const isolationQuery = db.prepare(`
    SELECT id FROM timeline 
    WHERE project_path = ? AND isolated = 1 
    ORDER BY timestamp DESC 
    LIMIT 1
  `);
    const isolation = isolationQuery.get(project_path) as { id: number } | undefined;

    if (isolation) {
        query += ` AND id >= ?`;
        params.push(isolation.id);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as TimelineEvent[];

    // Reverse to show oldest first
    const events = rows.reverse();

    // Generate cursor from the latest event
    const cursor = events.length > 0 ? `evt_${events[events.length - 1].id}` : null;

    return { events, cursor };
}

export function getConflicts(
    project_path: string,
    time_window_mins: number = 60,
    files: string[] | null = null
): Map<string, TimelineEvent[]> {
    const db = getDatabase();
    const cutoff = Date.now() - (time_window_mins * 60 * 1000);

    const stmt = db.prepare(`
    SELECT * FROM timeline 
    WHERE project_path = ? 
      AND timestamp > ? 
      AND action = 'file_edit'
    ORDER BY timestamp DESC
  `);

    const rows = stmt.all(project_path, cutoff) as TimelineEvent[];

    // Group by file path
    const fileEdits = new Map<string, TimelineEvent[]>();

    for (const event of rows) {
        try {
            const payload = JSON.parse(event.payload);
            const filePath = payload.file_path;

            if (!filePath) continue;
            if (files && !files.some(f => filePath.includes(f))) continue;

            if (!fileEdits.has(filePath)) {
                fileEdits.set(filePath, []);
            }
            fileEdits.get(filePath)!.push(event);
        } catch {
            continue;
        }
    }

    // Filter to only files with multiple agents
    const conflicts = new Map<string, TimelineEvent[]>();

    for (const [filePath, events] of fileEdits) {
        const agents = new Set(events.map(e => e.agent_id));
        if (agents.size > 1) {
            conflicts.set(filePath, events);
        }
    }

    return conflicts;
}

// === Cleanup ===

export function cleanupOldEvents(config: Config): number {
    const db = getDatabase();
    const cutoff = Date.now() - (config.retention_hours * 60 * 60 * 1000);

    if (config.archive_before_delete) {
        archiveOldEvents(cutoff);
    }

    const stmt = db.prepare(`DELETE FROM timeline WHERE timestamp < ?`);
    const result = stmt.run(cutoff);

    // Also cleanup old sessions
    const sessionStmt = db.prepare(`DELETE FROM sessions WHERE ended_at IS NOT NULL AND ended_at < ?`);
    sessionStmt.run(cutoff);

    return result.changes;
}

export function cleanupByScope(
    scope: 'all' | 'project' | 'session',
    project_path?: string,
    session_id?: string,
    archive: boolean = false
): number {
    const db = getDatabase();

    let stmt: Database.Statement;
    let result: Database.RunResult;

    switch (scope) {
        case 'all':
            if (archive) archiveOldEvents(Date.now());
            stmt = db.prepare(`DELETE FROM timeline`);
            result = stmt.run();
            db.prepare(`DELETE FROM sessions`).run();
            break;
        case 'project':
            if (!project_path) throw new Error('project_path required for project scope');
            if (archive) archiveProjectEvents(project_path);
            stmt = db.prepare(`DELETE FROM timeline WHERE project_path = ?`);
            result = stmt.run(project_path);
            db.prepare(`DELETE FROM sessions WHERE project_path = ?`).run(project_path);
            break;
        case 'session':
            if (!session_id) throw new Error('session_id required for session scope');
            if (archive) archiveSessionEvents(session_id);
            stmt = db.prepare(`DELETE FROM timeline WHERE session_id = ?`);
            result = stmt.run(session_id);
            db.prepare(`DELETE FROM sessions WHERE id = ?`).run(session_id);
            break;
        default:
            throw new Error(`Unknown scope: ${scope}`);
    }

    return result.changes;
}

function archiveOldEvents(beforeTimestamp: number): void {
    const db = getDatabase();
    const archiveDir = getArchiveDir();

    const stmt = db.prepare(`SELECT * FROM timeline WHERE timestamp < ?`);
    const rows = stmt.all(beforeTimestamp) as TimelineEvent[];

    if (rows.length === 0) return;

    const filename = `archive-${Date.now()}.json`;
    const filepath = path.join(archiveDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(rows, null, 2));
}

function archiveProjectEvents(project_path: string): void {
    const db = getDatabase();
    const archiveDir = getArchiveDir();

    const stmt = db.prepare(`SELECT * FROM timeline WHERE project_path = ?`);
    const rows = stmt.all(project_path) as TimelineEvent[];

    if (rows.length === 0) return;

    const safePath = project_path.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `archive-${safePath}-${Date.now()}.json`;
    const filepath = path.join(archiveDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(rows, null, 2));
}

function archiveSessionEvents(session_id: string): void {
    const db = getDatabase();
    const archiveDir = getArchiveDir();

    const stmt = db.prepare(`SELECT * FROM timeline WHERE session_id = ?`);
    const rows = stmt.all(session_id) as TimelineEvent[];

    if (rows.length === 0) return;

    const filename = `archive-session-${session_id}-${Date.now()}.json`;
    const filepath = path.join(archiveDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(rows, null, 2));
}

// === Sessions ===

export function createSession(
    project_path: string,
    started_by: string,
    name?: string,
    description?: string
): string {
    const db = getDatabase();
    const id = crypto.randomUUID();
    const started_at = Date.now();

    const stmt = db.prepare(`
    INSERT INTO sessions (id, name, project_path, description, started_at, started_by, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

    stmt.run(id, name || null, project_path, description || null, started_at, started_by);
    return id;
}

export function getSession(session_id: string): Session | null {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
    const row = stmt.get(session_id) as Session | undefined;
    return row || null;
}

export function listSessions(
    project_path: string,
    active_only: boolean = true,
    limit: number = 10
): Session[] {
    const db = getDatabase();

    let query = `SELECT * FROM sessions WHERE project_path = ?`;
    if (active_only) {
        query += ` AND active = 1`;
    }
    query += ` ORDER BY started_at DESC LIMIT ?`;

    const stmt = db.prepare(query);
    return stmt.all(project_path, limit) as Session[];
}

export function endSession(session_id: string, summary?: string): void {
    const db = getDatabase();
    const ended_at = Date.now();

    const stmt = db.prepare(`
    UPDATE sessions 
    SET ended_at = ?, summary = ?, active = 0 
    WHERE id = ?
  `);

    stmt.run(ended_at, summary || null, session_id);
}

export function setActiveSession(project_path: string, session_id: string): void {
    activeSessions.set(project_path, session_id);
}

export function getActiveSession(project_path: string): Session | null {
    const sessionId = activeSessions.get(project_path);
    if (!sessionId) return null;
    return getSession(sessionId);
}

// === Utils ===

export function getDatabaseSize(): number {
    const dbPath = path.join(getWormholeDir(), 'timeline.db');
    try {
        const stats = fs.statSync(dbPath);
        return stats.size;
    } catch {
        return 0;
    }
}

export function getEventCount(): number {
    const db = getDatabase();
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM timeline`);
    const result = stmt.get() as { count: number };
    return result.count;
}
