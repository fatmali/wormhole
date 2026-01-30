export const TOOL_DEFINITIONS = [
    {
        name: 'log',
        description: `Log any agent action. Action types:
- cmd_run: {command, output?, exit_code?}
- file_edit: {file_path, description?, diff?}
  * diff must be a unified diff format (with +/- lines, not a text description)
  * Example: "--- a/file.ts\\n+++ b/file.ts\\n@@ -1,3 +1,4 @@\\n function() {\\n+  newLine();\\n   return;\\n }"
  * Used for automatic stale-event validation - ensures agents don't act on outdated changes
- decision: {decision, rationale?, alternatives?}
- test_result: {test_suite, status, summary?}
- feedback: {agent_suggestion, user_response, user_note?}
- todos: {items: [{task, status?, priority?}], context?}
- plan_output: {title, content, type?: 'design'|'architecture'|'tasks'}
Or use any custom action type. Optional: add tags array to categorize events.`,
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', description: 'Action type (cmd_run, file_edit, decision, test_result, feedback, or custom)' },
                agent_id: { type: 'string', description: 'Agent identifier' },
                project_path: { type: 'string', description: 'Project path' },
                content: { type: 'object', description: 'Action-specific content' },
                isolate: { type: 'boolean', description: 'Start fresh context' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorizing events (e.g., ["bugfix", "auth"])' },
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
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (e.g., ["bugfix", "feature"])' },
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
    {
        name: 'get_tags',
        description: 'Get all unique tags used in events for a project, with optional counts.',
        inputSchema: {
            type: 'object',
            properties: {
                project_path: { type: 'string', description: 'Project path' },
                with_counts: { type: 'boolean', description: 'Include event counts per tag (default: true)' },
            },
            required: ['project_path'],
        },
    },
    {
        name: 'get_session_events',
        description: 'Get all events for specific sessions.',
        inputSchema: {
            type: 'object',
            properties: {
                session_ids: { type: 'array', items: { type: 'string' }, description: 'Array of session IDs' },
            },
            required: ['session_ids'],
        },
    },
    {
        name: 'save_knowledge',
        description: `Save a knowledge object for a project. Agents should analyze session events and extract important learnings, then save them as structured knowledge.

Knowledge types:
- decision: Explicit choices made (e.g., "Use TypeScript for type safety")
- pitfall: Errors or failures to avoid (e.g., "Don't use sync fs operations in server code")
- constraint: Limitations or restrictions (e.g., "API rate limit is 100 req/min")
- convention: Patterns or practices to follow (e.g., "Use async/await instead of callbacks")

Prevents duplicates: same title + type won't be saved twice.`,
        inputSchema: {
            type: 'object',
            properties: {
                project_path: { type: 'string', description: 'Project path' },
                knowledge_type: { type: 'string', enum: ['decision', 'pitfall', 'constraint', 'convention'], description: 'Type of knowledge' },
                title: { type: 'string', description: 'Short summary (max 200 chars)' },
                content: { type: 'string', description: 'Full details about the knowledge' },
                confidence: { type: 'number', description: 'Confidence level 0-1 (default: 1.0, optional)' },
                source_event_id: { type: 'number', description: 'Optional: ID of source event' },
                metadata: { type: 'object', description: 'Optional: Additional metadata' },
            },
            required: ['project_path', 'knowledge_type', 'title', 'content'],
        },
    },
    {
        name: 'search_project_knowledge',
        description: `Search for relevant project knowledge based on agent intent and optional query.

Returns up to 10 knowledge items, prioritized by:
1. Intent-driven type preference:
   - debugging: pitfall, constraint
   - feature: decision, convention
   - refactor: convention, constraint
   - test: pitfall
   - unknown: no preference
2. Confidence level (higher ranks first)
3. Query match (if provided)

Results include: type, summary, confidence score.`,
        inputSchema: {
            type: 'object',
            properties: {
                project_path: { type: 'string', description: 'Project path' },
                intent: { type: 'string', enum: ['debugging', 'feature', 'refactor', 'test', 'unknown'], description: 'Agent intent' },
                query: { type: 'string', description: 'Optional: free-text search hint' },
            },
            required: ['project_path', 'intent'],
        },
    },
];
