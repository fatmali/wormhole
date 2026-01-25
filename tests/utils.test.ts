/**
 * Tests for utility functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    formatRelativeTime,
    truncatePayload,
    formatEventCompact,
    formatEventNormal,
    formatEvents,
    extractFilePaths,
    isEventRelevant,
    extractPatch,
    validatePatch,
    filterStaleFileEdits,
} from '../src/utils.js';
import { createTestEvent } from './setup.js';
import { TimelineEvent } from '../src/types.js';

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

    it('should format file_edit events with diff indicator', () => {
        const event = createTestEvent({
            action: 'file_edit',
            payload: JSON.stringify({
                file_path: 'src/auth.ts',
                description: 'Added JWT validation',
                diff: '+ import jwt from "jsonwebtoken";\n+ export function validateToken(token: string) {\n+   return jwt.verify(token, SECRET);\n+ }'
            }),
            timestamp: Date.now() - 5 * 60000,
        });

        const result = formatEventCompact(event);
        expect(result).toContain('edit');
        expect(result).toContain('src/auth.ts');
        expect(result).toContain('[+diff]');
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

    it('should format file_edit events with diff', () => {
        const event = createTestEvent({
            action: 'file_edit',
            payload: JSON.stringify({
                file_path: 'src/auth.ts',
                description: 'Added JWT validation',
                diff: '+ import jwt from "jsonwebtoken";\n+ export function validateToken(token: string) {\n+   return jwt.verify(token, SECRET);\n+ }'
            }),
            timestamp: Date.now() - 3 * 60000,
        });

        const result = formatEventNormal(event);
        expect(result).toContain('3m');
        expect(result).toContain('file_edit');
        expect(result).toContain('src/auth.ts');
        expect(result).toContain('Added JWT validation');
        expect(result).toContain('diff:');
        expect(result).toContain('+ import jwt');
        expect(result).toContain('validateToken');
    });

    it('should format file_edit events without diff', () => {
        const event = createTestEvent({
            action: 'file_edit',
            payload: JSON.stringify({
                file_path: 'src/index.ts',
                description: 'Refactored imports'
            }),
            timestamp: Date.now() - 1 * 60000,
        });

        const result = formatEventNormal(event);
        expect(result).toContain('file_edit');
        expect(result).toContain('src/index.ts');
        expect(result).toContain('Refactored imports');
        expect(result).not.toContain('diff:');
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

describe('Patch Validation', () => {
    let tempDir: string;
    let testFilePath: string;

    beforeEach(() => {
        // Create a temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wormhole-test-'));
        testFilePath = path.join(tempDir, 'test.ts');
    });

    afterEach(() => {
        // Clean up temporary directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('extractPatch', () => {
        it('should extract patch from diff with added lines', () => {
            const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,4 @@
 function test() {
+  console.log('hello');
   return true;
 }`;

            const patch = extractPatch(diff);
            expect(patch).toContain('+  console.log(\'hello\');');
        });

        it('should extract patch from diff with removed lines', () => {
            const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,4 +1,3 @@
 function test() {
-  console.log('hello');
   return true;
 }`;

            const patch = extractPatch(diff);
            expect(patch).toContain('-  console.log(\'hello\');');
        });

        it('should extract all patch lines without limit', () => {
            const diff = Array(20).fill(0).map((_, i) => `+ line ${i}`).join('\n');
            const patch = extractPatch(diff);
            const lines = patch?.split('\n') || [];
            expect(lines.length).toBe(20);
        });

        it('should return null for empty diff', () => {
            expect(extractPatch('')).toBeNull();
            expect(extractPatch(undefined)).toBeNull();
        });
    });

    describe('validatePatch', () => {
        it('should validate patch when added lines exist in file', () => {
            // Create test file with content
            const content = `function test() {
  console.log('hello');
  return true;
}`;
            fs.writeFileSync(testFilePath, content);

            // Patch that added the console.log line
            const patch = ` function test() {
+  console.log('hello');
   return true;
 }`;

            const isValid = validatePatch('test.ts', patch, tempDir);
            expect(isValid).toBe(true);
        });

        it('should reject patch when removed lines still exist', () => {
            // Create test file that still has the "removed" line
            const content = `function test() {
  console.log('hello');
  return true;
}`;
            fs.writeFileSync(testFilePath, content);

            // Patch that supposedly removed the console.log line
            const patch = ` function test() {
-  console.log('hello');
   return true;
 }`;

            const isValid = validatePatch('test.ts', patch, tempDir);
            expect(isValid).toBe(false);
        });

        it('should reject patch when added lines are missing', () => {
            // Create test file without the added line
            const content = `function test() {
  return true;
}`;
            fs.writeFileSync(testFilePath, content);

            // Patch that added the console.log line
            const patch = ` function test() {
+  console.log('hello');
   return true;
 }`;

            const isValid = validatePatch('test.ts', patch, tempDir);
            expect(isValid).toBe(false);
        });

        it('should handle fuzzy matching for moved lines', () => {
            // Create test file where the added line moved position
            const content = `function test() {
  return true;
}

function another() {
  console.log('hello');
}`;
            fs.writeFileSync(testFilePath, content);

            // Patch that added console.log in original position
            const patch = ` function test() {
+  console.log('hello');
   return true;
 }`;

            // Should still be valid because the line exists somewhere
            const isValid = validatePatch('test.ts', patch, tempDir);
            expect(isValid).toBe(true);
        });

        it('should return false when file does not exist', () => {
            const patch = `+ console.log('hello');`;
            const isValid = validatePatch('nonexistent.ts', patch, tempDir);
            expect(isValid).toBe(false);
        });

        it('should return true when patch is null', () => {
            const isValid = validatePatch('test.ts', null, tempDir);
            expect(isValid).toBe(true);
        });

        it('should handle absolute file paths', () => {
            const content = `function test() {
  console.log('hello');
  return true;
}`;
            fs.writeFileSync(testFilePath, content);

            const patch = `+  console.log('hello');`;
            const isValid = validatePatch(testFilePath, patch, tempDir);
            expect(isValid).toBe(true);
        });
    });

    describe('filterStaleFileEdits', () => {
        beforeEach(() => {
            // Create a test file
            const content = `function test() {
  console.log('current');
  return true;
}`;
            fs.writeFileSync(testFilePath, content);
        });

        it('should keep non-file_edit events', () => {
            const events: TimelineEvent[] = [
                {
                    id: 1,
                    agent_id: 'test-agent',
                    action: 'cmd_run',
                    payload: JSON.stringify({ command: 'npm test' }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: false,
                },
            ];

            const filtered = filterStaleFileEdits(events, tempDir);
            expect(filtered).toHaveLength(1);
        });

        it('should keep file_edit events with valid patches', () => {
            const events: TimelineEvent[] = [
                {
                    id: 1,
                    agent_id: 'test-agent',
                    action: 'file_edit',
                    payload: JSON.stringify({ 
                        file_path: 'test.ts',
                        diff: `+  console.log('current');`
                    }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: false,
                },
            ];

            const filtered = filterStaleFileEdits(events, tempDir);
            expect(filtered).toHaveLength(1);
        });

        it('should filter out file_edit events with invalid patches', () => {
            const events: TimelineEvent[] = [
                {
                    id: 1,
                    agent_id: 'test-agent',
                    action: 'file_edit',
                    payload: JSON.stringify({ 
                        file_path: 'test.ts',
                        diff: `+  console.log('old-content-that-does-not-exist');`
                    }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: false,
                },
            ];

            const filtered = filterStaleFileEdits(events, tempDir);
            expect(filtered).toHaveLength(0);
        });

        it('should keep file_edit events without patches for backward compatibility', () => {
            const events: TimelineEvent[] = [
                {
                    id: 1,
                    agent_id: 'test-agent',
                    action: 'file_edit',
                    payload: JSON.stringify({ file_path: 'test.ts' }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: false,
                },
            ];

            const filtered = filterStaleFileEdits(events, tempDir);
            expect(filtered).toHaveLength(1);
        });

        it('should filter out already rejected events', () => {
            const events: TimelineEvent[] = [
                {
                    id: 1,
                    agent_id: 'test-agent',
                    action: 'file_edit',
                    payload: JSON.stringify({ 
                        file_path: 'test.ts',
                        diff: `+  console.log('current');`
                    }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: true,
                },
            ];

            const filtered = filterStaleFileEdits(events, tempDir);
            expect(filtered).toHaveLength(0);
        });

        it('should handle mixed events correctly', () => {
            const events: TimelineEvent[] = [
                {
                    id: 1,
                    agent_id: 'test-agent',
                    action: 'cmd_run',
                    payload: JSON.stringify({ command: 'npm test' }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: false,
                },
                {
                    id: 2,
                    agent_id: 'test-agent',
                    action: 'file_edit',
                    payload: JSON.stringify({ 
                        file_path: 'test.ts',
                        diff: `+  console.log('current');`
                    }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: false,
                },
                {
                    id: 3,
                    agent_id: 'test-agent',
                    action: 'file_edit',
                    payload: JSON.stringify({ 
                        file_path: 'test.ts',
                        diff: `+  console.log('stale-content');`
                    }),
                    timestamp: Date.now(),
                    project_path: tempDir,
                    isolated: false,
                    session_id: null,
                    tags: null,
                    rejected: false,
                },
            ];

            const filtered = filterStaleFileEdits(events, tempDir);
            expect(filtered).toHaveLength(2); // cmd_run + valid file_edit
            expect(filtered[0].action).toBe('cmd_run');
            expect(filtered[1].action).toBe('file_edit');
        });
    });
});
