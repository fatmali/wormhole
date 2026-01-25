/**
 * Tests for utility functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    formatRelativeTime,
    truncatePayload,
    formatEventCompact,
    formatEventNormal,
    formatEvents,
    extractFilePaths,
    isEventRelevant,
} from '../src/utils.js';
import { createTestEvent } from './setup.js';

describe('formatRelativeTime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should format minutes correctly', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        expect(formatRelativeTime(now - 5 * 60000)).toBe('5m');
        expect(formatRelativeTime(now - 30 * 60000)).toBe('30m');
        expect(formatRelativeTime(now - 59 * 60000)).toBe('59m');
    });

    it('should format hours correctly', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        expect(formatRelativeTime(now - 60 * 60000)).toBe('1h');
        expect(formatRelativeTime(now - 3 * 60 * 60000)).toBe('3h');
        expect(formatRelativeTime(now - 23 * 60 * 60000)).toBe('23h');
    });

    it('should format days correctly', () => {
        const now = Date.now();
        vi.setSystemTime(now);

        expect(formatRelativeTime(now - 24 * 60 * 60000)).toBe('1d');
        expect(formatRelativeTime(now - 7 * 24 * 60 * 60000)).toBe('7d');
    });
});

describe('truncatePayload', () => {
    it('should return unchanged string if under limit', () => {
        expect(truncatePayload('short', 100)).toBe('short');
    });

    it('should truncate and add ellipsis if over limit', () => {
        expect(truncatePayload('this is a long string', 10)).toBe('this is...');
    });

    it('should handle exact length', () => {
        expect(truncatePayload('exact', 5)).toBe('exact');
    });

    it('should handle empty string', () => {
        expect(truncatePayload('', 10)).toBe('');
    });
});

describe('formatEventCompact', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.now());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should format cmd_run events', () => {
        const event = createTestEvent({
            agent_id: 'claude-code',
            action: 'cmd_run',
            payload: JSON.stringify({ command: 'npm test', exit_code: 0 }),
            timestamp: Date.now() - 5 * 60000,
        });

        const result = formatEventCompact(event);
        expect(result).toContain('5m');
        expect(result).toContain('claude');
        expect(result).toContain('npm test');
        expect(result).toContain('✓');
    });

    it('should format file_edit events', () => {
        const event = createTestEvent({
            action: 'file_edit',
            payload: JSON.stringify({ file_path: 'src/index.ts', description: 'Added feature' }),
            timestamp: Date.now() - 10 * 60000,
        });

        const result = formatEventCompact(event);
        expect(result).toContain('edit');
        expect(result).toContain('src/index.ts');
    });

    it('should format decision events', () => {
        const event = createTestEvent({
            action: 'decision',
            payload: JSON.stringify({ decision: 'Use TypeScript instead of JavaScript' }),
            timestamp: Date.now(),
        });

        const result = formatEventCompact(event);
        expect(result).toContain('decided');
        expect(result).toContain('Use TypeScript');
    });

    it('should handle invalid JSON gracefully', () => {
        const event = createTestEvent({
            payload: 'not valid json',
            timestamp: Date.now(),
        });

        const result = formatEventCompact(event);
        expect(result).toContain('cmd_run');
    });
});

describe('formatEventNormal', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.now());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should format cmd_run events with details', () => {
        const event = createTestEvent({
            agent_id: 'copilot',
            action: 'cmd_run',
            payload: JSON.stringify({ command: 'npm test', exit_code: 0, output: 'All tests passed' }),
            timestamp: Date.now() - 2 * 60000,
        });

        const result = formatEventNormal(event);
        expect(result).toContain('2m');
        expect(result).toContain('copilot');
        expect(result).toContain('npm test');
        expect(result).toContain('exit: 0');
        expect(result).toContain('All tests passed');
    });

    it('should format test_result events', () => {
        const event = createTestEvent({
            action: 'test_result',
            payload: JSON.stringify({ test_suite: 'unit', status: 'passed', summary: '10 tests passed' }),
            timestamp: Date.now(),
        });

        const result = formatEventNormal(event);
        expect(result).toContain('unit');
        expect(result).toContain('passed');
    });
});

describe('formatEvents', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.now());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should return no activity message for empty array', () => {
        expect(formatEvents([], 'minimal', null)).toBe('no recent activity');
    });

    it('should format events with cursor', () => {
        const events = [createTestEvent({ timestamp: Date.now() })];
        const result = formatEvents(events, 'minimal', 'cursor123');
        expect(result).toContain('cursor: cursor123');
    });

    it('should use different formatting for detail levels', () => {
        const events = [createTestEvent({ timestamp: Date.now() })];

        const minimal = formatEvents(events, 'minimal', null);
        const normal = formatEvents(events, 'normal', null);
        const full = formatEvents(events, 'full', null);

        // All should contain some output
        expect(minimal.length).toBeGreaterThan(0);
        expect(normal.length).toBeGreaterThan(minimal.length);
        expect(full.length).toBeGreaterThan(0);
    });
});

describe('extractFilePaths', () => {
    it('should extract file_path from payload', () => {
        const event = createTestEvent({
            payload: JSON.stringify({ file_path: 'src/index.ts' }),
        });

        expect(extractFilePaths(event)).toContain('src/index.ts');
    });

    it('should extract related_files from payload', () => {
        const event = createTestEvent({
            payload: JSON.stringify({ related_files: ['a.ts', 'b.ts'] }),
        });

        const paths = extractFilePaths(event);
        expect(paths).toContain('a.ts');
        expect(paths).toContain('b.ts');
    });

    it('should return empty array for invalid JSON', () => {
        const event = createTestEvent({
            payload: 'not json',
        });

        expect(extractFilePaths(event)).toEqual([]);
    });
});

describe('isEventRelevant', () => {
    it('should return true if relatedTo is empty', () => {
        const event = createTestEvent();
        expect(isEventRelevant(event, [])).toBe(true);
    });

    it('should return true if event contains related file', () => {
        const event = createTestEvent({
            payload: JSON.stringify({ file_path: 'src/utils.ts' }),
        });

        expect(isEventRelevant(event, ['utils.ts'])).toBe(true);
    });

    it('should return false if event does not contain related file', () => {
        const event = createTestEvent({
            payload: JSON.stringify({ file_path: 'src/other.ts' }),
        });

        expect(isEventRelevant(event, ['utils.ts'])).toBe(false);
    });
});
