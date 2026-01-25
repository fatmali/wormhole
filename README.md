# Wormhole 🌀

**Collaborative AI Workflow Manager**

Keep your AI coding agents in sync. Wormhole gives Claude Code, GitHub Copilot, and Cursor a shared memory layer—so when you switch tools mid-task, nothing gets lost.

## Features

- **Universal Logging** - Single `log` tool for any action type
- **Session Management** - Named work sessions with isolation
- **Token Optimized** - Compact output, delta queries, relevance filtering
- **Conflict Detection** - Know when agents touch the same files

## Quick Start

Try instantly with npx (no installation required):

```bash
npx wormhole-mcp
```

## Installation

### Option 1: npx (Recommended)

**Claude Code** — Add to `~/.claude/claude_code_config.json`:

```json
{
  "mcpServers": {
    "wormhole": {
      "command": "npx",
      "args": ["-y", "wormhole-mcp"]
    }
  }
}
```

**GitHub Copilot** — Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "wormhole": {
      "command": "npx",
      "args": ["-y", "wormhole-mcp"]
    }
  }
}
```

### Option 2: Global Install

```bash
npm install -g wormhole-mcp
```

Then use `"command": "wormhole-mcp"` in your config.

### Option 3: From Source

```bash
git clone https://github.com/fatmali/wormhole.git
cd wormhole
npm install
npm run build
```

Use `"command": "node"` with `"args": ["/path/to/wormhole/dist/server.js"]`.
```

### Claude Code Plugin

For Claude Code users, there's an optional plugin that bundles the MCP server config with a skill:

```bash
# Install the plugin
claude /install-plugin ./node_modules/wormhole-mcp/plugins/wormhole
```

Or test locally:
```bash
claude --plugin-dir ./node_modules/wormhole-mcp/plugins/wormhole
```

Then invoke with `/wormhole:wormhole` in Claude Code.

**Standalone skill** (simpler):
```bash
cp -r node_modules/wormhole-mcp/skills/wormhole .claude/skills/
```

## MCP Tools

### `log`

Universal logging for any action type:

```javascript
// Log a command
log({
  action: "cmd_run",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: { command: "npm test", exit_code: 0 }
})

// Log a file edit
log({
  action: "file_edit",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: { file_path: "src/auth.ts", description: "Added JWT validation" }
})

// Log a decision
log({
  action: "decision",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: { decision: "Use Zod for validation", rationale: "Already in deps" }
})

// Log test results
log({
  action: "test_result",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: { test_suite: "auth.test.ts", status: "passed" }
})

// Log user feedback
log({
  action: "feedback",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: { agent_suggestion: "Use async/await", user_response: "rejected", user_note: "Legacy code" }
})

// Log todos
log({
  action: "todos",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: {
    items: [
      { task: "Add input validation", status: "pending", priority: "high" },
      { task: "Write unit tests", status: "done" },
      { task: "Update README", status: "pending" }
    ],
    context: "Auth refactor"
  }
})

// Log plan output
log({
  action: "plan_output",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: {
    title: "API Authentication Design",
    type: "architecture",
    content: "Use JWT with refresh tokens, store in httpOnly cookies..."
  }
})
```

**Action Types:**
- `cmd_run` - Command executions
- `file_edit` - File modifications  
- `decision` - Design decisions with rationale
- `test_result` - Test outcomes
- `feedback` - User acceptance/rejection
- `todos` - Task items with status tracking
- `plan_output` - Planning artifacts (design, architecture, tasks)
- Any custom type you need

### `get_recent`

Get recent activity (compact by default):

```javascript
get_recent({ project_path: "/path/to/project" })
```

**Output:**
```
[5m] claude: npm test → ✓
[8m] cursor: edit auth.ts "Add JWT"
[12m] copilot: decided "Use Zod for validation"
[15m] claude: auth.test.ts ✓
cursor: evt_123
```

**Options:**
- `limit` - Max events (default: 5)
- `detail` - `minimal` | `normal` | `full`
- `since_cursor` - Only new events (delta query)
- `related_to` - Filter by file paths
- `action_types` - Filter by action types

### `check_conflicts`

Detect concurrent file edits:

```javascript
check_conflicts({ project_path: "/path/to/project" })
```

### `cleanup`

Clean up events with scopes:

```javascript
// Clean entire project
cleanup({ scope: "project", project_path: "/path/to/project" })

// Clean specific session
cleanup({ scope: "session", session_id: "abc-123" })

// Clean everything
cleanup({ scope: "all", force: true })
```

---

## Session Management

### `start_session`

Start a named work session:

```javascript
start_session({
  project_path: "/path/to/project",
  agent_id: "claude-code",
  name: "bugfix-auth",
  description: "Fixing login timeout issue"
})
// → session started: bugfix-auth (abc-123-def)
```

Sessions automatically isolate context—previous events hidden from queries.

### `end_session`

End a session with summary:

```javascript
end_session({
  session_id: "abc-123-def",
  summary: "Fixed timeout by optimizing DB query"
})
```

### `list_sessions`

View sessions:

```javascript
list_sessions({ project_path: "/path/to/project" })
```

**Output:**
```
● bugfix-auth (2h) by claude
○ feature-payment (1d) by cursor
```

### `switch_session`

Resume a previous session:

```javascript
switch_session({ session_id: "xyz-789" })
```

---

## Configuration

Config file: `~/.wormhole/config.json`

```json
{
  "retention_hours": 24,
  "max_payload_chars": 200,
  "auto_cleanup": true,
  "default_detail": "minimal",
  "default_limit": 5
}
```

## Token Optimization

Wormhole minimizes token usage:

- **Compact output** by default
- **Delta queries** with `since_cursor`
- **200-char** payload limits
- **5 events** default limit

Typical task: ~400 tokens vs ~5,000 without optimization.

## Architecture

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Claude Code │  │  Copilot    │  │   Cursor    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                ┌───────▼───────┐
                │   Wormhole    │
                │  MCP Server   │
                └───────┬───────┘
                        │
                ┌───────▼───────┐
                │    SQLite     │
                │  timeline.db  │
                └───────────────┘
```

## Data Storage

- Database: `~/.wormhole/timeline.db`
- Config: `~/.wormhole/config.json`
- Archives: `~/.wormhole/archives/`

## License

MIT