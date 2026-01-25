import { z } from 'zod';
import {
    addEvent,
    getRecentEvents,
    getConflicts,
    cleanupByScope,
    cleanupOldEvents,
    getDatabaseSize,
    getSession,
    listSessions,
    endSession,
    setActiveSession,
    getActiveSession,
    createSession,
    getAllTags,
} from './db.js';
import { Config, TimelineEvent } from './types.js';
import { formatEvents, formatRelativeTime, isEventRelevant, truncatePayload, extractPatch, filterStaleFileEdits } from './utils.js';
import {
    LogSchema,
    GetRecentSchema,
    CheckConflictsSchema,
    CleanupSchema,
    StartSessionSchema,
    EndSessionSchema,
    ListSessionsSchema,
    SwitchSessionSchema,
    GetTagsSchema,
} from './schemas.js';

export function handleLog(args: z.infer<typeof LogSchema>, config: Config): string {
    // Get active session for this project
    const activeSession = getActiveSession(args.project_path);

    // Truncate content values based on config. Do NOT truncate "diff" fields:
    // stale-event validation relies on comparing the full, original diff content
    // (see filterStaleFileEdits and related logic), so truncating it here would
    // prevent reliable detection of whether a file_edit event has gone stale.
    const truncatedContent: Record<string, any> = {};
    for (const [key, value] of Object.entries(args.content)) {
        if (typeof value === 'string' && key !== 'diff') {
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
        activeSession?.id ?? null,
        args.tags ?? []
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
        case 'todos': {
            const items = truncatedContent.items || [];
            const count = Array.isArray(items) ? items.length : 0;
            const pending = Array.isArray(items) ? items.filter((i: any) => i.status !== 'done').length : 0;
            summary = `todos: ${pending}/${count} pending`;
            break;
        }
        case 'plan_output': {
            const title = truncatePayload(truncatedContent.title || 'untitled', 30);
            const type = truncatedContent.type || 'plan';
            summary = `${type}: ${title}`;
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
        args.action_types ?? null,
        args.tags ?? null
    );

    // Apply relevance filtering if specified
    let events = result.events;
    if (args.related_to && args.related_to.length > 0) {
        events = events.filter(e => isEventRelevant(e, args.related_to!));
    }

    // Filter out stale file_edit events
    events = filterStaleFileEdits(events, args.project_path);

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

    // Filter out stale file edits from conflicts
    const validConflicts = new Map<string, TimelineEvent[]>();
    for (const [file, events] of conflicts) {
        const validEvents = filterStaleFileEdits(events, args.project_path);
        // Only include files with multiple valid edits
        if (validEvents.length > 1) {
            validConflicts.set(file, validEvents);
        }
    }

    if (validConflicts.size === 0) {
        return 'no conflicts';
    }

    const lines: string[] = [];
    for (const [file, events] of validConflicts) {
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

export function handleGetTags(args: z.infer<typeof GetTagsSchema>): string {
    const withCounts = args.with_counts ?? true;
    const result = getAllTags(args.project_path, withCounts);

    if (withCounts) {
        const tagMap = result as Map<string, number>;
        if (tagMap.size === 0) {
            return 'no tags found';
        }

        // Sort by count descending
        const sorted = Array.from(tagMap.entries())
            .sort((a, b) => b[1] - a[1]);

        const lines = sorted.map(([tag, count]) => `${tag} (${count})`);
        return `tags:\n${lines.join('\n')}`;
    } else {
        const tags = result as string[];
        if (tags.length === 0) {
            return 'no tags found';
        }
        return `tags: ${tags.join(', ')}`;
    }
}
