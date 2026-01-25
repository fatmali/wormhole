import { z } from 'zod';

export const LogSchema = z.object({
    action: z.string().describe('Action type: cmd_run, file_edit, decision, test_result, feedback, todos, plan_output, or custom'),
    agent_id: z.string().describe('Agent identifier (e.g., "claude-code")'),
    project_path: z.string().describe('Project path'),
    content: z.record(z.any()).describe('Action-specific content (command, file_path, decision, etc.)'),
    isolate: z.boolean().optional().describe('Start fresh context'),
});

export const GetRecentSchema = z.object({
    project_path: z.string().describe('Project path'),
    limit: z.number().optional().describe('Max events (default: 5)'),
    detail: z.enum(['minimal', 'normal', 'full']).optional().describe('Output detail level'),
    since_cursor: z.string().optional().describe('Cursor for delta queries'),
    related_to: z.array(z.string()).optional().describe('Filter by related files'),
    action_types: z.array(z.string()).optional().describe('Filter by action types'),
});

export const CheckConflictsSchema = z.object({
    project_path: z.string().describe('Project path'),
    time_window: z.number().optional().describe('Minutes to look back (default: 60)'),
    files: z.array(z.string()).optional().describe('Specific files to check'),
});

export const CleanupSchema = z.object({
    scope: z.enum(['all', 'project', 'session']).describe('Cleanup scope'),
    project_path: z.string().optional().describe('Required if scope is "project"'),
    session_id: z.string().optional().describe('Required if scope is "session"'),
    force: z.boolean().optional().describe('Force cleanup'),
    archive: z.boolean().optional().describe('Archive before delete'),
});

export const StartSessionSchema = z.object({
    project_path: z.string().describe('Project path'),
    agent_id: z.string().describe('Agent starting the session'),
    name: z.string().optional().describe('Session name (e.g., "bugfix-auth")'),
    description: z.string().optional().describe('Session goal'),
    isolate: z.boolean().optional().describe('Hide previous context (default: true)'),
});

export const EndSessionSchema = z.object({
    session_id: z.string().optional().describe('Session to end (default: current)'),
    summary: z.string().optional().describe('What was accomplished'),
});

export const ListSessionsSchema = z.object({
    project_path: z.string().describe('Project path'),
    active_only: z.boolean().optional().describe('Only active sessions (default: true)'),
    limit: z.number().optional().describe('Max sessions (default: 10)'),
});

export const SwitchSessionSchema = z.object({
    session_id: z.string().describe('Session to switch to'),
});
