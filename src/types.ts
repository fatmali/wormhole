// Types for Wormhole MCP Server

export interface TimelineEvent {
    id: number;
    agent_id: string;
    action: string;
    payload: string;
    timestamp: number;
    project_path: string;
    isolated: boolean;
    session_id: string | null;
}

export interface Session {
    id: string;
    name: string | null;
    project_path: string;
    description: string | null;
    started_at: number;
    ended_at: number | null;
    started_by: string;
    summary: string | null;
    active: boolean;
}

export interface Config {
    retention_hours: number;
    max_payload_chars: number;
    auto_cleanup: boolean;
    archive_before_delete: boolean;
    strict_project_isolation: boolean;
    default_context_window: 'project' | 'global' | 'session';
    output_format: 'compact' | 'normal' | 'full';
    default_detail: 'minimal' | 'normal' | 'full';
    default_limit: number;
    enable_delta_queries: boolean;
}

export interface QueryResult {
    events: TimelineEvent[];
    cursor: string | null;
}

export const DEFAULT_CONFIG: Config = {
    retention_hours: 24,
    max_payload_chars: 200,
    auto_cleanup: true,
    archive_before_delete: false,
    strict_project_isolation: true,
    default_context_window: 'project',
    output_format: 'compact',
    default_detail: 'minimal',
    default_limit: 5,
    enable_delta_queries: true,
};
