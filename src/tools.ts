// Tool handlers for Wormhole MCP
import { z } from 'zod';
import {
    addEvent,
    getRecentEvents,
    getConflicts,
    cleanupByScope,
    cleanupOldEvents,
    getDatabaseSize,
    getEventCount,
    createSession,
    getSession,
    listSessions,
    endSession,
    setActiveSession,
    getActiveSession,
} from './db.js';
import { Config } from './types.js';
import { formatEvents, formatRelativeTime, isEventRelevant, truncatePayload } from './utils.js';

// === Zod Schemas ===

// Generic log tool - replaces separate tools for each action type
export const LogSchema = z.object({
    action: z.string().describe('Action type: cmd_run, file_edit, decision, test_result, feedback, or custom'),
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

// Session management schemas
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

// === Tool Handlers ===

export function handleLog(args: z.infer<typeof LogSchema>, config: Config): string {
    // Get active session for this project
    const activeSession = getActiveSession(args.project_path);

    // Truncate content values based on config
    const truncatedContent: Record<string, any> = {};
    for (const [key, value] of Object.entries(args.content)) {
        if (typeof value === 'string') {
            truncatedContent[key] = truncatePayload(value, config.max_payload_chars);
        } else {
            truncatedContent[key] = value;
        }
    }

    const payload = JSON.stringify(truncatedContent);

    const id = addEvent(
        args.agent_id,
        args.action,
        payload,
        args.project_path,
        args.isolate ?? false,
        activeSession?.id ?? null
    );

    // Format compact confirmation based on action type
    let summary: string;
    switch (args.action) {
        case 'cmd_run': {
            const cmd = truncatePayload(truncatedContent.command || '', 30);
            const status = truncatedContent.exit_code === 0 ? '✓' : `✗ ${truncatedContent.exit_code ?? '?'}`;
            summary = `${cmd} → ${status}`;
            break;
        }
        case 'file_edit': {
            const file = truncatedContent.file_path || 'unknown';
            summary = `edit ${file}`;
            break;
        }
        case 'decision': {
            const decision = truncatePayload(truncatedContent.decision || '', 40);
            summary = `decided: ${decision}`;
            break;
        }
        case 'test_result': {
            const status = truncatedContent.status === 'passed' ? '✓' : '✗';
            const suite = truncatedContent.test_suite || 'tests';
            summary = `${suite} ${status}`;
            break;
        }
        case 'feedback': {
            const response = truncatedContent.user_response || 'unknown';
            summary = `feedback: ${response}`;
            break;
        }
        default:
            summary = args.action;
    }

    return `logged: ${summary} (evt_${id})`;
}

export function handleGetRecent(args: z.infer<typeof GetRecentSchema>, config: Config): string {
    const limit = args.limit ?? config.default_limit;
    const detail = args.detail ?? config.default_detail;

    const result = getRecentEvents(
        args.project_path,
        limit,
        args.since_cursor ?? null,
        args.action_types ?? null
    );

    // Apply relevance filtering if specified
    let events = result.events;
    if (args.related_to && args.related_to.length > 0) {
        events = events.filter(e => isEventRelevant(e, args.related_to!));
    }

    return formatEvents(events, detail, result.cursor);
}

export function handleCheckConflicts(args: z.infer<typeof CheckConflictsSchema>): string {
    const timeWindow = args.time_window ?? 60;
    const conflicts = getConflicts(
        args.project_path,
        timeWindow,
        args.files ?? null
    );

    if (conflicts.size === 0) {
        return 'no conflicts';
    }

    const lines: string[] = [];
    for (const [file, events] of conflicts) {
        const agents = events.map(e => {
            const time = formatRelativeTime(e.timestamp);
            const agent = e.agent_id.split('-')[0];
            return `${agent}@${time}`;
        }).join(', ');
        lines.push(`${file} (${agents})`);
    }

    return `conflicts:\n${lines.join('\n')}`;
}

export function handleCleanup(args: z.infer<typeof CleanupSchema>, config: Config): string {
    const beforeSize = getDatabaseSize();

    let deleted: number;

    if (args.force) {
        deleted = cleanupByScope(args.scope, args.project_path, args.session_id, args.archive ?? false);
    } else {
        deleted = cleanupOldEvents(config);
    }

    const afterSize = getDatabaseSize();
    const savings = beforeSize - afterSize;

    return `cleaned: ${deleted} events, ${Math.round(savings / 1024)}KB freed`;
}

// Session handlers
export function handleStartSession(args: z.infer<typeof StartSessionSchema>): string {
    const sessionId = createSession(
        args.project_path,
        args.agent_id,
        args.name,
        args.description
    );

    // Set as active session
    setActiveSession(args.project_path, sessionId);

    // If isolate (default true), add an isolation marker
    if (args.isolate !== false) {
        addEvent(
            args.agent_id,
            'session_start',
            JSON.stringify({ session_id: sessionId, name: args.name }),
            args.project_path,
            true, // Mark as isolation boundary
            sessionId
        );
    }

    const name = args.name || sessionId.slice(0, 8);
    return `session started: ${name} (${sessionId})`;
}

export function handleEndSession(args: z.infer<typeof EndSessionSchema>): string {
    // Get session to end
    let sessionId = args.session_id;

    if (!sessionId) {
        // Find any active session (we'd need project_path ideally, but for now check all)
        throw new Error('session_id required');
    }

    const session = getSession(sessionId);
    if (!session) {
        return `error: session not found`;
    }

    endSession(sessionId, args.summary);

    const name = session.name || sessionId.slice(0, 8);
    return `session ended: ${name}`;
}

export function handleListSessions(args: z.infer<typeof ListSessionsSchema>): string {
    const sessions = listSessions(
        args.project_path,
        args.active_only ?? true,
        args.limit ?? 10
    );

    if (sessions.length === 0) {
        return 'no sessions';
    }

    const lines = sessions.map(s => {
        const time = formatRelativeTime(s.started_at);
        const status = s.active ? '●' : '○';
        const name = s.name || s.id.slice(0, 8);
        return `${status} ${name} (${time}) by ${s.started_by}`;
    });

    return lines.join('\n');
}

export function handleSwitchSession(args: z.infer<typeof SwitchSessionSchema>): string {
    const session = getSession(args.session_id);
    if (!session) {
        return `error: session not found`;
    }

    setActiveSession(session.project_path, args.session_id);

    const name = session.name || args.session_id.slice(0, 8);
    return `switched to: ${name}`;
}

// === Tool Definitions for MCP ===

export const TOOL_DEFINITIONS = [
    {
        name: 'log',
        description: `Log any agent action. Action types:
- cmd_run: {command, output?, exit_code?}
- file_edit: {file_path, description?, diff?}
- decision: {decision, rationale?, alternatives?}
- test_result: {test_suite, status, summary?}
- feedback: {agent_suggestion, user_response, user_note?}
Or use any custom action type.`,
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', description: 'Action type (cmd_run, file_edit, decision, test_result, feedback, or custom)' },
                agent_id: { type: 'string', description: 'Agent identifier' },
                project_path: { type: 'string', description: 'Project path' },
                content: { type: 'object', description: 'Action-specific content' },
                isolate: { type: 'boolean', description: 'Start fresh context' },
            },
            required: ['action', 'agent_id', 'project_path', 'content'],
        },
    },
    {
        name: 'get_recent',
        description: 'Get recent agent activity. Returns compact output by default.',
        inputSchema: {
            type: 'object',
            properties: {
                project_path: { type: 'string', description: 'Project path' },
                limit: { type: 'number', description: 'Max events (default: 5)' },
                detail: { type: 'string', enum: ['minimal', 'normal', 'full'], description: 'Output detail' },
                since_cursor: { type: 'string', description: 'Cursor for delta queries' },
                related_to: { type: 'array', items: { type: 'string' }, description: 'Filter by files' },
                action_types: { type: 'array', items: { type: 'string' }, description: 'Filter by action types' },
            },
            required: ['project_path'],
        },
    },
    {
        name: 'check_conflicts',
        description: 'Check for concurrent file edits by multiple agents.',
        inputSchema: {
            type: 'object',
            properties: {
                project_path: { type: 'string', description: 'Project path' },
                time_window: { type: 'number', description: 'Minutes to look back (default: 60)' },
                files: { type: 'array', items: { type: 'string' }, description: 'Files to check' },
            },
            required: ['project_path'],
        },
    },
    {
        name: 'cleanup',
        description: 'Clean up events. Scopes: all, project, session.',
        inputSchema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['all', 'project', 'session'], description: 'Cleanup scope' },
                project_path: { type: 'string', description: 'For project scope' },
                session_id: { type: 'string', description: 'For session scope' },
                force: { type: 'boolean', description: 'Force cleanup' },
                archive: { type: 'boolean', description: 'Archive before delete' },
            },
            required: ['scope'],
        },
    },
    {
        name: 'start_session',
        description: 'Start a named work session. Isolates context by default.',
        inputSchema: {
            type: 'object',
            properties: {
                project_path: { type: 'string', description: 'Project path' },
                agent_id: { type: 'string', description: 'Agent starting session' },
                name: { type: 'string', description: 'Session name (e.g., "bugfix-auth")' },
                description: { type: 'string', description: 'Session goal' },
                isolate: { type: 'boolean', description: 'Hide previous context (default: true)' },
            },
            required: ['project_path', 'agent_id'],
        },
    },
    {
        name: 'end_session',
        description: 'End a session with optional summary.',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session to end' },
                summary: { type: 'string', description: 'What was accomplished' },
            },
            required: ['session_id'],
        },
    },
    {
        name: 'list_sessions',
        description: 'List sessions for a project.',
        inputSchema: {
            type: 'object',
            properties: {
                project_path: { type: 'string', description: 'Project path' },
                active_only: { type: 'boolean', description: 'Only active (default: true)' },
                limit: { type: 'number', description: 'Max sessions (default: 10)' },
            },
            required: ['project_path'],
        },
    },
    {
        name: 'switch_session',
        description: 'Switch to a different session.',
        inputSchema: {
            type: 'object',
            properties: {
                session_id: { type: 'string', description: 'Session to switch to' },
            },
            required: ['session_id'],
        },
    },
];
