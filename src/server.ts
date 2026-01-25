#!/usr/bin/env node
// Wormhole MCP Server - The Inter-Agent Context Bridge
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadConfig, ensureWormholeDir } from './config.js';
import { initDatabase, cleanupOldEvents } from './db.js';
import { LogSchema, GetRecentSchema, CheckConflictsSchema, CleanupSchema, StartSessionSchema, EndSessionSchema, ListSessionsSchema, SwitchSessionSchema } from './schemas.js';
import { TOOL_DEFINITIONS } from './tools.js';
import {
    handleLog,
    handleGetRecent,
    handleCheckConflicts,
    handleCleanup,
    handleStartSession,
    handleEndSession,
    handleListSessions,
    handleSwitchSession
} from './handlers.js';

async function main() {
    // Initialize
    ensureWormholeDir();
    const config = loadConfig();
    initDatabase();

    // Auto-cleanup on startup
    if (config.auto_cleanup) {
        const cleaned = cleanupOldEvents(config);
        if (cleaned > 0) {
            console.error(`[wormhole] Cleaned ${cleaned} old events`);
        }
    }

    // Create MCP server
    const server = new Server(
        {
            name: 'wormhole',
            version: '2.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: TOOL_DEFINITIONS,
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
            let result: string;

            switch (name) {
                case 'log': {
                    const parsed = LogSchema.parse(args);
                    result = handleLog(parsed, config);
                    break;
                }
                case 'get_recent': {
                    const parsed = GetRecentSchema.parse(args);
                    result = handleGetRecent(parsed, config);
                    break;
                }
                case 'check_conflicts': {
                    const parsed = CheckConflictsSchema.parse(args);
                    result = handleCheckConflicts(parsed);
                    break;
                }
                case 'cleanup': {
                    const parsed = CleanupSchema.parse(args);
                    result = handleCleanup(parsed, config);
                    break;
                }
                case 'start_session': {
                    const parsed = StartSessionSchema.parse(args);
                    result = handleStartSession(parsed);
                    break;
                }
                case 'end_session': {
                    const parsed = EndSessionSchema.parse(args);
                    result = handleEndSession(parsed);
                    break;
                }
                case 'list_sessions': {
                    const parsed = ListSessionsSchema.parse(args);
                    result = handleListSessions(parsed);
                    break;
                }
                case 'switch_session': {
                    const parsed = SwitchSessionSchema.parse(args);
                    result = handleSwitchSession(parsed);
                    break;
                }
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: result,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                content: [
                    {
                        type: 'text',
                        text: `error: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error('[wormhole] MCP server v2.0 started');
}

main().catch((error) => {
    console.error('[wormhole] Fatal error:', error);
    process.exit(1);
});
