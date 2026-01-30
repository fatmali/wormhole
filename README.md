# Wormhole 🌀

**Collaborative AI Workflow Manager**

Keep your AI coding agents in sync. Wormhole gives Claude Code, GitHub Copilot, and Cursor a shared memory layer—so when you switch tools mid-task, nothing gets lost.

**Works across:**
- 🔀 **Multiple subagents** within the same tool (e.g., parallel Claude tasks)
- 🔄 **Different AI tools** entirely (Claude ↔ Copilot ↔ Cursor)

⚠️ *Disclaimer*: Wormhole is an early-stage project. APIs and behavior may change, and there may be rough edges. It’s built in the open and evolving fast based on real developer feedback.

## Features

- **Universal Logging** - Single `log` tool for any action type
- **Event Tagging** - Categorize events with tags for better organization
- **Session Management** - Named work sessions with isolation
- **Token Optimized** - Compact output, delta queries, relevance filtering
- **Conflict Detection** - Know when agents touch the same files
- **Stale Event Rejection** - Automatically filters out file edits that no longer exist in the current project state
- **Web UI Visualization** - View sessions, timeline events, and insights with `npx wormhole ui`

## Quick Start

Try instantly with npx (no installation required):

```bash
npx wormhole-mcp
```

## Web UI

Visualize your agent activity with the built-in web interface:

```bash
# Start the UI server (default port: 3000)
npx wormhole ui

# Or specify a custom port
npx wormhole ui 8080
```

Then open http://localhost:3000 in your browser to see:
- 📊 **Dashboard** - Stats on events, sessions, and agents
- ⏱️ **Timeline** - Visual event stream with filtering
- 📋 **Sessions** - All work sessions with details
- 📈 **Insights** - Action types and tag analytics

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
  content: { command: "npm test", exit_code: 0 },
  tags: ["testing", "ci"]  // Optional: categorize events
})

// Log a file edit
log({
  action: "file_edit",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: { file_path: "src/auth.ts", description: "Added JWT validation" },
  tags: ["bugfix", "auth"]
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
- `tags` - Filter by tags (e.g., `["bugfix", "feature"]`)

### `get_tags`

Get all unique tags used in a project with counts:

```javascript
get_tags({ project_path: "/path/to/project" })
// Output: 
// tags:
// bugfix (12)
// feature (8)
// testing (5)
// auth (3)
```

**Options:**
- `with_counts` - Include event counts per tag (default: true)

### `check_conflicts`

Detect concurrent file edits:

```javascript
check_conflicts({ project_path: "/path/to/project" })
```

---

## Stale Event Rejection

Wormhole automatically tracks and validates file edits to ensure agents never act on stale information. When a `file_edit` event is logged with a `diff`, Wormhole:

1. **Extracts the full patch** - Stores all added/removed lines from the diff
2. **Validates on query** - When events are retrieved via `get_recent` or conflict detection, each file edit is checked against the current file state
3. **Fuzzy matching** - Uses intelligent matching to handle code that moved positions, only rejecting truly stale edits
4. **Auto-filters** - Rejected events are automatically excluded from results

### How it works

When you log a file edit:
```javascript
log({
  action: "file_edit",
  agent_id: "claude-code",
  project_path: "/path/to/project",
  content: {
    file_path: "src/auth.ts",
    description: "Added JWT validation",
    diff: `--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,6 +10,7 @@
 function validateToken(token: string) {
+  const decoded = jwt.verify(token, SECRET);
   return decoded;
 }`
  }
})
```

Wormhole stores the full diff in the payload. Later, when another agent queries recent events:
- **File still has the change** → Event is included
- **Code was removed or changed** → Event is silently filtered out
- **Code moved to different location** → Still recognized (fuzzy match)

**Note:** The `diff` field is NOT truncated (unlike other content fields), ensuring accurate validation even for large changes.

This ensures agents always work with accurate context about what's currently in the codebase.

### Validation Algorithm

The patch validation uses intelligent fuzzy matching:

**For Added Lines (`+`):**
- Checks if the added code exists anywhere in the current file
- Uses normalized comparison (trimmed whitespace)
- Accepts partial matches (code that contains or is contained by the search)
- Requires 60% of added lines to match for validation

**For Removed Lines (`-`):**
- If a "removed" line still exists in the file → patch is stale
- This catches cases where a deletion was reverted

**Edge Cases Handled:**
- **File deleted**: Patch fails validation
- **Code refactored**: Fuzzy matching still finds the logic if it exists
- **Whitespace changes**: Normalized comparison ignores formatting
- **Line movements**: Searches entire file, not just original position
- **No patch stored**: Event is kept (backward compatibility)
- **Already rejected**: Event is skipped on subsequent queries

### Performance

- Validation runs only when events are queried (lazy evaluation)
- File I/O is cached by OS for repeated reads
- Minimal overhead: ~1-5ms per file_edit event
- Database stores full diffs efficiently as TEXT columns

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

**Note:** The `max_payload_chars` setting truncates most content fields for display, but `diff` fields in `file_edit` events are always stored in full to enable accurate stale-event validation.

## Token Optimization

Wormhole minimizes token usage for `get_recent` responses through four key strategies:

### 1. Compact Output Format (Default)

Instead of returning raw JSON, events are formatted as single-line summaries:

```
# Compact (default) - ~35 chars per event
[5m] claude: npm test → ✓

# vs Full JSON - ~200+ chars per event
{"id":42,"agent_id":"claude-code","action":"cmd_run","payload":"{\"command\":\"npm test\",\"exit_code\":0}","timestamp":1706621234567,"project_path":"/path/to/project","session_id":"abc-123"}
```

The `detail` parameter controls verbosity:
- `minimal` (default) — Single-line summaries with symbols (✓/✗)
- `normal` — Multi-line with key details
- `full` — Complete JSON payloads

### 2. Payload Truncation

Content fields are truncated to 200 characters by default (`max_payload_chars` config):

```javascript
// Stored/displayed as:
"Added authentication middleware with JWT validation and refresh token..."

// Instead of full 2000+ char description
```

**Exception:** `diff` fields in `file_edit` events are never truncated—they're needed for stale event validation.

### 3. Delta Queries

Use `since_cursor` to fetch only events since your last query:

```javascript
// First call returns events + cursor
get_recent({ project_path: "." })
// → [5 events] + cursor: evt_42

// Subsequent call returns only NEW events
get_recent({ project_path: ".", since_cursor: "evt_42" })
// → [0-2 events] instead of repeating all 5
```

This prevents re-sending the same context repeatedly.

### 4. Low Default Limits

- `default_limit: 5` — Returns only 5 most recent events
- Agents can increase with `limit` param when needed

### Token Comparison

| Scenario | Without Optimization | With Optimization |
|----------|---------------------|-------------------|
| 5 events, first query | ~500-1000 tokens | ~100 tokens |
| 5 events, delta query (2 new) | ~500-1000 tokens | ~40 tokens |
| 10 events, full detail | ~2000+ tokens | ~800 tokens |

### Configuration

Adjust in `~/.wormhole/config.json`:

```json
{
  "max_payload_chars": 200,
  "default_detail": "minimal",
  "default_limit": 5
}
```

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