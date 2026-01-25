/**
 * Tests for Zod schemas
 */
import { describe, it, expect } from 'vitest';
import {
    LogSchema,
    GetRecentSchema,
    CheckConflictsSchema,
    CleanupSchema,
    StartSessionSchema,
    EndSessionSchema,
    ListSessionsSchema,
    SwitchSessionSchema,
} from '../src/schemas.js';

describe('LogSchema', () => {
    it('should accept valid input', () => {
        const input = {
            action: 'cmd_run',
            agent_id: 'claude-code',
            project_path: '/path/to/project',
            content: { command: 'npm test', exit_code: 0 },
        };

        expect(() => LogSchema.parse(input)).not.toThrow();
    });

    it('should accept optional isolate field', () => {
        const input = {
            action: 'decision',
            agent_id: 'copilot',
            project_path: '/project',
            content: { decision: 'Use React' },
            isolate: true,
        };

        const result = LogSchema.parse(input);
        expect(result.isolate).toBe(true);
    });

    it('should reject missing required fields', () => {
        const input = {
            action: 'cmd_run',
            // missing agent_id, project_path, content
        };

        expect(() => LogSchema.parse(input)).toThrow();
    });

    it('should reject invalid content type', () => {
        const input = {
            action: 'cmd_run',
            agent_id: 'test',
            project_path: '/path',
            content: 'not an object',
        };

        expect(() => LogSchema.parse(input)).toThrow();
    });
});

describe('GetRecentSchema', () => {
    it('should accept minimal valid input', () => {
        const input = {
            project_path: '/path/to/project',
        };

        expect(() => GetRecentSchema.parse(input)).not.toThrow();
    });

    it('should accept all optional fields', () => {
        const input = {
            project_path: '/path',
            limit: 10,
            detail: 'full' as const,
            since_cursor: 'cursor123',
            related_to: ['file.ts'],
            action_types: ['cmd_run', 'file_edit'],
        };

        const result = GetRecentSchema.parse(input);
        expect(result.limit).toBe(10);
        expect(result.detail).toBe('full');
    });

    it('should reject invalid detail value', () => {
        const input = {
            project_path: '/path',
            detail: 'invalid',
        };

        expect(() => GetRecentSchema.parse(input)).toThrow();
    });
});

describe('CheckConflictsSchema', () => {
    it('should accept minimal valid input', () => {
        const input = {
            project_path: '/path/to/project',
        };

        expect(() => CheckConflictsSchema.parse(input)).not.toThrow();
    });

    it('should accept optional time_window and files', () => {
        const input = {
            project_path: '/path',
            time_window: 30,
            files: ['src/index.ts', 'src/utils.ts'],
        };

        const result = CheckConflictsSchema.parse(input);
        expect(result.time_window).toBe(30);
        expect(result.files).toHaveLength(2);
    });
});

describe('CleanupSchema', () => {
    it('should accept scope all', () => {
        const input = {
            scope: 'all' as const,
        };

        expect(() => CleanupSchema.parse(input)).not.toThrow();
    });

    it('should accept scope project with project_path', () => {
        const input = {
            scope: 'project' as const,
            project_path: '/path',
        };

        expect(() => CleanupSchema.parse(input)).not.toThrow();
    });

    it('should accept scope session with session_id', () => {
        const input = {
            scope: 'session' as const,
            session_id: 'session-123',
        };

        expect(() => CleanupSchema.parse(input)).not.toThrow();
    });

    it('should reject invalid scope', () => {
        const input = {
            scope: 'invalid',
        };

        expect(() => CleanupSchema.parse(input)).toThrow();
    });
});

describe('StartSessionSchema', () => {
    it('should accept valid input', () => {
        const input = {
            project_path: '/path/to/project',
            agent_id: 'claude-code',
        };

        expect(() => StartSessionSchema.parse(input)).not.toThrow();
    });

    it('should accept optional fields', () => {
        const input = {
            project_path: '/path',
            agent_id: 'agent',
            name: 'Feature Work',
            description: 'Working on new feature',
            isolate: false,
        };

        const result = StartSessionSchema.parse(input);
        expect(result.name).toBe('Feature Work');
        expect(result.isolate).toBe(false);
    });
});

describe('EndSessionSchema', () => {
    it('should accept empty object', () => {
        expect(() => EndSessionSchema.parse({})).not.toThrow();
    });

    it('should accept session_id and summary', () => {
        const input = {
            session_id: 'session-123',
            summary: 'Completed the task',
        };

        const result = EndSessionSchema.parse(input);
        expect(result.session_id).toBe('session-123');
        expect(result.summary).toBe('Completed the task');
    });
});

describe('ListSessionsSchema', () => {
    it('should accept minimal valid input', () => {
        const input = {
            project_path: '/path/to/project',
        };

        expect(() => ListSessionsSchema.parse(input)).not.toThrow();
    });

    it('should accept optional fields', () => {
        const input = {
            project_path: '/path',
            active_only: false,
            limit: 5,
        };

        const result = ListSessionsSchema.parse(input);
        expect(result.active_only).toBe(false);
        expect(result.limit).toBe(5);
    });
});

describe('SwitchSessionSchema', () => {
    it('should accept valid session_id', () => {
        const input = {
            session_id: 'session-abc-123',
        };

        expect(() => SwitchSessionSchema.parse(input)).not.toThrow();
    });

    it('should reject missing session_id', () => {
        expect(() => SwitchSessionSchema.parse({})).toThrow();
    });
});
