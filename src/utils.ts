// Utility functions for Wormhole
import { TimelineEvent } from './types.js';

/**
 * Format relative time (e.g., "5m", "2h", "1d")
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    return `${days}d`;
}

/**
 * Truncate payload to max chars
 */
export function truncatePayload(payload: string, maxChars: number): string {
    if (payload.length <= maxChars) return payload;
    return payload.slice(0, maxChars - 3) + '...';
}

/**
 * Format event in compact format
 */
export function formatEventCompact(event: TimelineEvent): string {
    const time = formatRelativeTime(event.timestamp);
    const agent = event.agent_id.split('-')[0]; // "claude-code" -> "claude"

    try {
        const payload = JSON.parse(event.payload);

        switch (event.action) {
            case 'cmd_run': {
                const cmd = truncatePayload(payload.command || '', 40);
                const status = payload.exit_code === 0 ? '✓' : `✗ ${payload.exit_code}`;
                const out = payload.output ? ` ${truncatePayload(payload.output, 30)}` : '';
                return `[${time}] ${agent}: ${cmd} → ${status}${out}`;
            }
            case 'file_edit': {
                const file = payload.file_path || 'unknown';
                const desc = payload.description ? ` "${truncatePayload(payload.description, 30)}"` : '';
                return `[${time}] ${agent}: edit ${file}${desc}`;
            }
            case 'decision': {
                const decision = truncatePayload(payload.decision || '', 50);
                return `[${time}] ${agent}: decided "${decision}"`;
            }
            case 'test_result': {
                const suite = payload.test_suite || 'tests';
                const status = payload.status === 'passed' ? '✓' : '✗';
                const count = payload.failed_count ? ` (${payload.failed_count} failed)` : '';
                return `[${time}] ${agent}: ${suite} ${status}${count}`;
            }
            case 'feedback': {
                const response = payload.user_response || 'unknown';
                const note = payload.user_note ? ` - ${truncatePayload(payload.user_note, 30)}` : '';
                return `[${time}] ${agent}: feedback ${response}${note}`;
            }
            case 'session_start': {
                const name = payload.name || 'unnamed';
                return `[${time}] ${agent}: ▸ session "${name}"`;
            }
            default: {
                const summary = truncatePayload(JSON.stringify(payload), 50);
                return `[${time}] ${agent}: ${event.action} ${summary}`;
            }
        }
    } catch {
        return `[${time}] ${agent}: ${event.action}`;
    }
}

/**
 * Format event in normal format
 */
export function formatEventNormal(event: TimelineEvent): string {
    const time = formatRelativeTime(event.timestamp);

    try {
        const payload = JSON.parse(event.payload);
        const lines = [`[${time}] ${event.agent_id}: ${event.action}`];

        switch (event.action) {
            case 'cmd_run':
                lines.push(`  ${payload.command || 'unknown'}`);
                if (payload.exit_code !== undefined) {
                    lines.push(`  exit: ${payload.exit_code}`);
                }
                if (payload.output) {
                    lines.push(`  ${truncatePayload(payload.output, 100)}`);
                }
                break;
            case 'file_edit':
                lines.push(`  ${payload.file_path || 'unknown'}`);
                if (payload.description) {
                    lines.push(`  ${payload.description}`);
                }
                break;
            case 'decision':
                lines.push(`  ${payload.decision || 'unknown'}`);
                if (payload.rationale) {
                    lines.push(`  rationale: ${truncatePayload(payload.rationale, 80)}`);
                }
                break;
            case 'test_result':
                lines.push(`  ${payload.test_suite}: ${payload.status}`);
                if (payload.summary) {
                    lines.push(`  ${truncatePayload(payload.summary, 80)}`);
                }
                break;
            case 'feedback':
                lines.push(`  ${payload.user_response}: ${payload.agent_suggestion || ''}`);
                if (payload.user_note) {
                    lines.push(`  note: ${truncatePayload(payload.user_note, 80)}`);
                }
                break;
            default:
                lines.push(`  ${truncatePayload(JSON.stringify(payload), 100)}`);
        }

        return lines.join('\n');
    } catch {
        return `[${time}] ${event.agent_id}: ${event.action}`;
    }
}

/**
 * Format events based on detail level
 */
export function formatEvents(
    events: TimelineEvent[],
    detail: 'minimal' | 'normal' | 'full',
    cursor: string | null
): string {
    if (events.length === 0) {
        return 'no recent activity';
    }

    let output: string;

    switch (detail) {
        case 'minimal':
            output = events.map(formatEventCompact).join('\n');
            break;
        case 'normal':
            output = events.map(formatEventNormal).join('\n\n');
            break;
        case 'full':
            output = events.map(e => {
                const time = formatRelativeTime(e.timestamp);
                return `[${time}] ${e.agent_id}: ${e.action}\n${e.payload}`;
            }).join('\n\n---\n\n');
            break;
    }

    if (cursor) {
        output += `\ncursor: ${cursor}`;
    }

    return output;
}

/**
 * Extract file paths from event payload for relevance filtering
 */
export function extractFilePaths(event: TimelineEvent): string[] {
    try {
        const payload = JSON.parse(event.payload);
        const paths: string[] = [];

        if (payload.file_path) paths.push(payload.file_path);
        if (payload.related_files) paths.push(...payload.related_files);
        if (payload.context_files) paths.push(...payload.context_files);

        return paths;
    } catch {
        return [];
    }
}

/**
 * Check if event is relevant to given files
 */
export function isEventRelevant(event: TimelineEvent, relatedTo: string[]): boolean {
    if (relatedTo.length === 0) return true;

    const eventPaths = extractFilePaths(event);
    return eventPaths.some(p => relatedTo.some(r => p.includes(r) || r.includes(p)));
}
