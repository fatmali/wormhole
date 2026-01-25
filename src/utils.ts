// Utility functions for Wormhole
import { TimelineEvent } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

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
                const hasDiff = payload.diff ? ' [+diff]' : '';
                return `[${time}] ${agent}: edit ${file}${desc}${hasDiff}`;
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
                if (payload.diff) {
                    lines.push(`  diff:`);
                    lines.push(payload.diff.split('\n').map((l: string) => `    ${l}`).join('\n'));
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

/**
 * Minimum percentage of patch lines that must match for validation to pass.
 * 60% allows for minor formatting changes or line movements while still
 * confirming the patch is substantially present. Lower values would accept
 * mostly-reverted changes; higher values would reject valid patches with
 * minor edits.
 */
const PATCH_VALIDATION_THRESHOLD = 0.6;

/**
 * Extract patch from diff content
 * Returns the full patch for accurate validation
 */
export function extractPatch(diff: string | undefined): string | null {
    if (!diff) return null;

    const lines = diff.split('\n');
    const patchLines: string[] = [];

    for (const line of lines) {
        // Include added, removed, and context lines (skip file headers)
        if (line.startsWith('+') && !line.startsWith('+++')) {
            patchLines.push(line);
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            patchLines.push(line);
        } else if (line.startsWith(' ')) {
            patchLines.push(line);
        }
    }

    return patchLines.length > 0 ? patchLines.join('\n') : null;
}

/**
 * Validate if a patch still exists in the current file
 * Uses fuzzy matching to handle line movements and minor changes
 */
export function validatePatch(
    filePath: string,
    patch: string | null,
    projectPath: string
): boolean {
    // No patch to validate
    if (!patch) return true;

    // Construct absolute file path
    const absolutePath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(projectPath, filePath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
        return false;
    }

    try {
        const currentContent = fs.readFileSync(absolutePath, 'utf-8');
        const currentLines = currentContent.split('\n');
        const patchLines = patch.split('\n');

        // Extract the meaningful content from patch (ignore +/- markers)
        const patchContent: string[] = [];
        for (const line of patchLines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                // Added line
                patchContent.push(line.substring(1).trim());
            } else if (line.startsWith('-') && !line.startsWith('---')) {
                // Removed line - we check if it's MISSING from current file
                const removed = line.substring(1).trim();
                if (removed.length > 0 && currentContent.includes(removed)) {
                    // If "removed" line still exists, patch is stale
                    return false;
                }
            }
        }

        // If no added lines to check, patch is valid (deletion-only or context-only)
        if (patchContent.length === 0) return true;

        // Create a Set of normalized current lines for O(1) lookup
        const normalizedLines = new Set(currentLines.map(line => line.trim()));

        // Check if added lines exist in the file (fuzzy match)
        let matchCount = 0;
        for (const patchLine of patchContent) {
            if (patchLine.length === 0) continue;
            
            // Exact match
            if (normalizedLines.has(patchLine)) {
                matchCount++;
                continue;
            }

            // Fuzzy match: check if any line contains or is contained by patch line
            for (const normalized of normalizedLines) {
                if (normalized.includes(patchLine) || patchLine.includes(normalized)) {
                    matchCount++;
                    break;
                }
            }
        }

        // If enough patch lines are found, consider it valid
        const threshold = Math.ceil(patchContent.length * PATCH_VALIDATION_THRESHOLD);
        return matchCount >= threshold;
    } catch (err) {
        // If we can't read the file, consider patch invalid
        return false;
    }
}

/**
 * Filter out rejected (stale) file_edit events
 */
export function filterStaleFileEdits(
    events: TimelineEvent[],
    projectPath: string
): TimelineEvent[] {
    return events.filter(event => {
        // Only validate file_edit events
        if (event.action !== 'file_edit') return true;
        
        // Skip already rejected events
        if (event.rejected) return false;

        // Validate the patch
        try {
            const payload = JSON.parse(event.payload);
            const filePath = payload.file_path;
            const diff = payload.diff;
            
            if (!filePath) return true;
            
            // If no diff stored, keep the event (backward compatibility)
            if (!diff) return true;

            const patch = extractPatch(diff);
            return validatePatch(filePath, patch, projectPath);
        } catch {
            // If payload can't be parsed, keep the event
            return true;
        }
    });
}
