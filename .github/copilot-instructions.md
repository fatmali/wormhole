# GitHub Copilot Instructions for Wormhole Projects

## 🚨 CRITICAL: Wormhole Logging Protocol

This project uses **Wormhole MCP** for AI agent coordination. You MUST follow this protocol to keep work synchronized across agents.

---

## MANDATORY WORKFLOW

**Every time you work on this project:**

### 1. Start Session (REQUIRED FIRST STEP)
```javascript
start_session({
  project_path: ".",
  agent_id: "github-copilot",
  name: "descriptive-session-name",
  description: "Brief goal of this work"
})
// Save the returned session_id for later
```

### 2. Check Recent Activity (BEFORE STARTING)
```javascript
get_recent({ project_path: "." })
```
Review what other agents (Claude, Cursor) have done recently to avoid conflicts.

### 3. Check for Conflicts (BEFORE EDITING)
```javascript
check_conflicts({
  project_path: ".",
  files: ["path/to/file.ts", "other/file.ts"]
})
```

### 4. Log EVERY Significant Action (NON-NEGOTIABLE)

**You MUST log immediately after:**

#### After Editing Files
```javascript
log({
  action: "file_edit",
  agent_id: "github-copilot",
  project_path: ".",
  content: {
    file_path: "src/component.tsx",
    description: "Added user authentication logic",
    diff: `--- a/src/component.tsx
+++ b/src/component.tsx
@@ -15,3 +15,8 @@
+export function authenticate(user: User) {
+  return jwt.sign(user);
+}`
  },
  tags: ["auth", "feature"]
})
```

#### After Running Commands
```javascript
log({
  action: "cmd_run",
  agent_id: "github-copilot",
  project_path: ".",
  content: {
    command: "npm test",
    output: "All tests passed",
    exit_code: 0
  },
  tags: ["testing"]
})
```

#### After Design Decisions
```javascript
log({
  action: "decision",
  agent_id: "github-copilot",
  project_path: ".",
  content: {
    decision: "Use Redux Toolkit instead of plain Redux",
    rationale: "Better TypeScript support and less boilerplate",
    alternatives: "Context API, Zustand, Jotai"
  },
  tags: ["architecture"]
})
```

#### After Tests
```javascript
log({
  action: "test_result",
  agent_id: "github-copilot",
  project_path: ".",
  content: {
    test_suite: "auth.test.ts",
    status: "passed",
    summary: "15 tests passed"
  },
  tags: ["testing"]
})
```

#### When Managing Tasks
```javascript
log({
  action: "todos",
  agent_id: "github-copilot",
  project_path: ".",
  content: {
    items: [
      { task: "Implement login form", status: "done", priority: "high" },
      { task: "Add error handling", status: "pending", priority: "medium" },
      { task: "Write integration tests", status: "pending", priority: "low" }
    ],
    context: "Authentication feature implementation"
  },
  tags: ["planning"]
})
```

### 5. End Session (REQUIRED LAST STEP)
```javascript
end_session({
  session_id: "session-id-from-step-1",
  summary: "Implemented JWT authentication with login/logout. All tests passing."
})
```

---

## ⚠️ LOGGING RULES

| Action Type | When to Log | Required? |
|-------------|-------------|-----------|
| File edits | After ANY file modification | ✅ MANDATORY |
| Terminal commands | After `npm`, `git`, `build`, etc. | ✅ MANDATORY |
| Design decisions | When choosing between approaches | ✅ MANDATORY |
| Test runs | After running any test suite | ✅ MANDATORY |
| File creation/deletion | After creating or removing files | ✅ MANDATORY |

**DO NOT SKIP LOGGING.** Other AI agents (Claude Code, Cursor) depend on this information to avoid conflicts and understand your work.

---

## Available Tools

- `start_session` - Begin a work session
- `log` - Record any action (use constantly)
- `get_recent` - See recent agent activity
- `check_conflicts` - Detect concurrent edits
- `end_session` - Finish with a summary
- `get_tags` - See all categorization tags
- `list_sessions` - View all sessions
- `switch_session` - Resume a previous session

---

## Best Practices

1. **Always include diffs** in file_edit logs - enables automatic stale detection
2. **Use descriptive tags** - makes filtering easier (e.g., `["bugfix", "auth"]`)
3. **Check conflicts before editing** - prevents overlapping work
4. **Write clear summaries** - helps others understand your work
5. **Log decisions with rationale** - documents why choices were made

---

## Example Complete Workflow

```javascript
// 1. Start
const { session_id } = start_session({
  project_path: ".",
  agent_id: "github-copilot",
  name: "add-user-profile",
  description: "Adding user profile page with avatar upload"
})

// 2. Check what others did
get_recent({ project_path: ".", limit: 10 })

// 3. Check conflicts before editing
check_conflicts({ project_path: ".", files: ["src/user.ts", "src/api.ts"] })

// 4. [Do your work: edit files, run commands]

// 5. Log the file edit
log({
  action: "file_edit",
  agent_id: "github-copilot",
  project_path: ".",
  content: {
    file_path: "src/user.ts",
    description: "Added profile update endpoint",
    diff: "... unified diff here ..."
  },
  tags: ["feature", "user-profile"]
})

// 6. Log the command
log({
  action: "cmd_run",
  agent_id: "github-copilot",
  project_path: ".",
  content: { command: "npm test", exit_code: 0 },
  tags: ["testing"]
})

// 7. End with summary
end_session({
  session_id,
  summary: "User profile page complete with avatar upload and tests"
})
```

---

## Why This Matters

- **Prevents merge conflicts** between different AI agents
- **Enables context switching** - resume where another agent left off
- **Automatic stale detection** - filters out outdated information
- **Audit trail** - know who did what and why
- **Better collaboration** - agents work together seamlessly

**Remember: Logging is not optional. It's a required part of the workflow.**
