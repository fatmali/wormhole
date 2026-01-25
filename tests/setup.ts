/**
 * Test helpers and setup for wormhole tests
 */
import Database from 'better-sqlite3';
import { TimelineEvent, Config, DEFAULT_CONFIG, Session } from '../src/types.js';

// In-memory database for testing
let testDb: Database.Database | null = null;

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
CREATE INDEX IF NOT EXISTS idx_project ON timeline(project_path);
CREATE INDEX IF NOT EXISTS idx_agent ON timeline(agent_id);
CREATE INDEX IF NOT EXISTS idx_action ON timeline(action);
CREATE INDEX IF NOT EXISTS idx_timestamp ON timeline(timestamp);
CREATE INDEX IF NOT EXISTS idx_session ON timeline(session_id);
CREATE INDEX IF NOT EXISTS idx_project_timestamp ON timeline(project_path, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path, active);
`;

/**
 * Get or create the in-memory test database
 */
export function getTestDatabase(): Database.Database {
    if (!testDb) {
        testDb = new Database(':memory:');
        testDb.exec(SCHEMA);
    }
    return testDb;
}

/**
 * Manually set the test database (useful for testing with mocks)
 */
export function setTestDatabase(db: Database.Database): void {
    testDb = db;
    testDb.exec(SCHEMA);
}

/**
 * Reset the test database (clear all data)
 */
export function resetTestDatabase(): void {
    if (testDb) {
        testDb.exec('DELETE FROM timeline');
        testDb.exec('DELETE FROM sessions');
    }
}

/**
 * Close the test database
 */
export function closeTestDatabase(): void {
    if (testDb) {
        testDb.close();
        testDb = null;
    }
}

/**
 * Create a test event with sensible defaults
 */
export function createTestEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
    return {
        id: 1,
        agent_id: 'test-agent',
        action: 'cmd_run',
        payload: JSON.stringify({ command: 'echo test', exit_code: 0 }),
        timestamp: Date.now(),
        project_path: '/test/project',
        isolated: false,
        session_id: null,
        ...overrides,
    };
}

/**
 * Create a test session with sensible defaults
 */
export function createTestSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'test-session-123',
        name: 'Test Session',
        project_path: '/test/project',
        description: 'A test session',
        started_at: Date.now(),
        ended_at: null,
        started_by: 'test-agent',
        summary: null,
        active: true,
        ...overrides,
    };
}

/**
 * Get a test config with sensible defaults
 */
export function getTestConfig(overrides: Partial<Config> = {}): Config {
    return {
        ...DEFAULT_CONFIG,
        ...overrides,
    };
}

/**
 * Insert a test event directly into the database
 */
export function insertTestEvent(event: Partial<TimelineEvent> = {}): number {
    const db = getTestDatabase();
    const fullEvent = createTestEvent(event);

    const stmt = db.prepare(`
        INSERT INTO timeline (agent_id, action, payload, timestamp, project_path, isolated, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        fullEvent.agent_id,
        fullEvent.action,
        fullEvent.payload,
        fullEvent.timestamp,
        fullEvent.project_path,
        fullEvent.isolated ? 1 : 0,
        fullEvent.session_id
    );

    return Number(result.lastInsertRowid);
}

/**
 * Insert a test session directly into the database
 */
export function insertTestSession(session: Partial<Session> = {}): string {
    const db = getTestDatabase();
    const fullSession = createTestSession(session);

    const stmt = db.prepare(`
        INSERT INTO sessions (id, name, project_path, description, started_at, ended_at, started_by, summary, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        fullSession.id,
        fullSession.name,
        fullSession.project_path,
        fullSession.description,
        fullSession.started_at,
        fullSession.ended_at,
        fullSession.started_by,
        fullSession.summary,
        fullSession.active ? 1 : 0
    );

    return fullSession.id;
}
