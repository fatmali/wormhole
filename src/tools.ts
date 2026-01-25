export const TOOL_DEFINITIONS = [
    {
        name: 'log',
        description: `Log any agent action. Action types:
- cmd_run: {command, output?, exit_code?}
- file_edit: {file_path, description?, diff?}
- decision: {decision, rationale?, alternatives?}
- test_result: {test_suite, status, summary?}
- feedback: {agent_suggestion, user_response, user_note?}
- todos: {items: [{task, status?, priority?}], context?}
- plan_output: {title, content, type?: 'design'|'architecture'|'tasks'}
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
