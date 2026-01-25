/**
 * Tests for request handlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTestDatabase, resetTestDatabase, setTestDatabase } from './setup.js';
import * as handlers from '../src/handlers.js';
import * as db from '../src/db.js';

// Initialize real database efficiently bypassing the mock
const actualSqlite = await vi.importActual<{ default: any }>('better-sqlite3');
const realDb = new actualSqlite.default(':memory:');
setTestDatabase(realDb);

// Re-mock dependencies to ensure consistency with db.test.ts
vi.mock('better-sqlite3', () => {
    return {
        default: vi.fn()
    };
});

import Database from 'better-sqlite3';
(Database as any).mockImplementation(function () {
    return realDb;
});

vi.mock('../src/config.js', () => ({
    getWormholeDir: () => '/tmp/wormhole-test',
    loadConfig: () => ({
        retention_hours: 24,
        max_payload_chars: 200,
        auto_cleanup: false, // Disable auto/implicit cleanup for handler tests
        default_limit: 5,
        default_detail: 'minimal'
    }),
}));

describe('Request Handlers', () => {
    const mockConfig = {
        retention_hours: 24,
        max_payload_chars: 50,
        auto_cleanup: false,
        archive_before_delete: false,
        strict_project_isolation: true,
        default_context_window: 'project' as const,
        output_format: 'compact' as const,
        default_detail: 'minimal' as const,
        default_limit: 5,
        enable_delta_queries: true,
    };

    beforeEach(() => {
        resetTestDatabase();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('handleLog', () => {
        it('should log an event and return confirmation', () => {
            const args = {
                action: 'cmd_run',
                agent_id: 'claude',
                project_path: '/path',
                content: { command: 'ls -la', exit_code: 0 }
            };

            const result = handlers.handleLog(args, mockConfig);

            expect(result).toContain('logged: ls -la → ✓');
            expect(result).toContain('evt_'); // Should contain ID

            // Verify in DB
            const events = db.getRecentEvents('/path');
            expect(events.events).toHaveLength(1);
            expect(events.events[0].action).toBe('cmd_run');
        });

        it('should truncate long content', () => {
            const longCmd = 'a'.repeat(100);
            const args = {
                action: 'cmd_run',
                agent_id: 'claude',
                project_path: '/path',
                content: { command: longCmd }
            };

            handlers.handleLog(args, mockConfig);

            const events = db.getRecentEvents('/path');
            const payload = JSON.parse(events.events[0].payload);

            // Config max char is 50
            expect(payload.command.length).toBeLessThan(60);
            expect(payload.command).toContain('...');
        });

        it('should start session if StartSessionSchema is used? No, LogSchema handles plain logging', () => {
            // handleLog is for 'log' tool.
            // Session start is explicit via handleStartSession or implicit?
            // The handler just logs.
        });
    });

    describe('handleGetRecent', () => {
        it('should return formatted events', () => {
            // Setup data
            db.addEvent('agent', 'cmd_run', JSON.stringify({ command: 'echo 1', exit_code: 0 }), '/path');

            const args = { project_path: '/path' };
            const result = handlers.handleGetRecent(args, mockConfig);

            expect(result).toContain('echo 1');
            expect(result).toContain('✓');
        });

        it('should filter by related files', () => {
            db.addEvent('agent', 'file_edit', JSON.stringify({ file_path: 'src/a.ts' }), '/path');
            db.addEvent('agent', 'file_edit', JSON.stringify({ file_path: 'src/b.ts' }), '/path');

            const args = {
                project_path: '/path',
                related_to: ['a.ts']
            };

            const result = handlers.handleGetRecent(args, mockConfig);

            expect(result).toContain('src/a.ts');
            expect(result).not.toContain('src/b.ts');
        });
    });

    describe('handleCheckConflicts', () => {
        it('should return no conflicts message', () => {
            const args = { project_path: '/path' };
            const result = handlers.handleCheckConflicts(args);
            expect(result).toBe('no conflicts');
        });

        it('should report conflicts', () => {
            const payload = JSON.stringify({ file_path: 'test.ts' });
            db.addEvent('agent1', 'file_edit', payload, '/path');
            db.addEvent('agent2', 'file_edit', payload, '/path');

            const args = { project_path: '/path' };
            const result = handlers.handleCheckConflicts(args);

            expect(result).toContain('conflicts:');
            expect(result).toContain('test.ts');
            expect(result).toContain('agent1');
            expect(result).toContain('agent2');
        });
    });

    describe('Session Handlers', () => {
        it('should start a session', () => {
            const args = {
                project_path: '/path',
                agent_id: 'claude',
                name: 'Test Session'
            };

            const result = handlers.handleStartSession(args);
            expect(result).toContain('session started: Test Session');

            const active = db.getActiveSession('/path');
            expect(active?.name).toBe('Test Session');
        });

        it('should end a session', () => {
            const sessionId = db.createSession('/path', 'claude', 'S1');

            const args = { session_id: sessionId, summary: 'Done' };
            const result = handlers.handleEndSession(args);

            expect(result).toContain('session ended: S1');

            const session = db.getSession(sessionId);
            expect(session?.active).toBe(0);
        });

        it('should list sessions', () => {
            db.createSession('/path', 'claude', 'S1');

            const args = { project_path: '/path' };
            const result = handlers.handleListSessions(args);

            expect(result).toContain('● S1');
        });

        it('should switch session', () => {
            const s1 = db.createSession('/path', 'claude', 'S1');
            const s2 = db.createSession('/path', 'claude', 'S2');

            // Default active is latest created (S2)
            expect(db.getActiveSession('/path')?.id).toBe(s2);

            const args = { session_id: s1 };
            const result = handlers.handleSwitchSession(args);

            expect(result).toContain('switched to: S1');
            expect(db.getActiveSession('/path')?.id).toBe(s1);
        });
    });
});
