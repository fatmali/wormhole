---
name: wormhole
description: Sync work between AI agents. Log actions, manage sessions, detect conflicts.
---

# Wormhole

Shared memory for AI agents. **CRITICAL: You MUST log all significant actions** so other agents can see your work.

## 🚨 MANDATORY WORKFLOW

**ALWAYS follow this sequence:**

1. **First action**: `start_session` (at beginning of task)
2. **During work**: `log` after EVERY file edit, command, or decision
3. **Before editing files**: `check_conflicts` to see if another agent touched them
4. **When resuming**: `get_recent` to see what others did
5. **Last action**: `end_session` with summary

## ⚠️ WHEN TO LOG (Non-Negotiable)

You MUST call `log` immediately after:

| Action | Example | Required? |
|--------|---------|-----------|
| Editing any file | Modified `auth.ts` | ✅ REQUIRED |
| Running commands | `npm test`, `git commit` | ✅ REQUIRED |
| Making design decisions | "Chose JWT over sessions" | ✅ REQUIRED |
| Terminal operations | Build, deploy, test | ✅ REQUIRED |
| Creating/deleting files | New component, removed util | ✅ REQUIRED |

**DO NOT skip logging.** Other agents depend on seeing your work.

## Tools

### log (USE THIS CONSTANTLY)
```js
// After editing a file - ALWAYS include this
log({ 
  action: "file_edit", 
  agent_id: "claude-code", 
  project_path: ".", 
  content: { 
    file_path: "src/auth.ts", 
    description: "Added JWT validation",
    diff: "--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,3 +10,4 @@\n+export const validateJWT = ..."
  },
  tags: ["auth", "bugfix"]
})

// After running commands
log({ 
  action: "cmd_run", 
  agent_id: "claude-code", 
  project_path: ".", 
  content: { command: "npm test", exit_code: 0 }
})

// After decisions
log({ 
  action: "decision", 
  agent_id: "claude-code", 
  project_path: ".", 
  content: { 
    decision: "Use Zod for validation", 
    rationale: "Already in dependencies" 
  }
})

// Test results
log({ 
  action: "test_result", 
  agent_id: "claude-code", 
  project_path: ".", 
  content: { test_suite: "auth.test.ts", status: "passed" }
})

// Track todos
log({ 
  action: "todos", 
  agent_id: "claude-code", 
  project_path: ".", 
  content: {
    items: [
      { task: "Add input validation", status: "done" },
      { task: "Write tests", status: "pending" }
    ]
  }
})
```

**Action types:** `file_edit`, `cmd_run`, `decision`, `test_result`, `feedback`, `todos`, `plan_output`

### start_session (DO THIS FIRST)
```js
start_session({ 
  project_path: ".", 
  agent_id: "claude-code", 
  name: "bugfix-auth",
  description: "Fixing login timeout issue" 
})
```

### get_recent (CHECK BEFORE STARTING)
```js
// See what other agents did recently
get_recent({ project_path: "." })

// Filter by files
get_recent({ project_path: ".", related_to: ["src/auth.ts"] })

// Filter by tags
get_recent({ project_path: ".", tags: ["bugfix"] })
```

### check_conflicts (BEFORE EDITING)
```js
// Check if anyone else modified these files
check_conflicts({ 
  project_path: ".", 
  files: ["src/auth.ts", "src/api.ts"] 
})
```

### end_session (FINISH WITH SUMMARY)
```js
end_session({ 
  session_id: "abc-123", 
  summary: "Fixed timeout by optimizing DB query. Tests passing." 
})
```

### get_tags (DISCOVER CATEGORIES)
```js
// See all tags used in the project
get_tags({ project_path: "." })
```

## 📋 Typical Workflow Example

```js
// 1. Start
start_session({ project_path: ".", agent_id: "claude-code", name: "add-auth" })

// 2. Check recent work
get_recent({ project_path: "." })

// 3. Before editing
check_conflicts({ project_path: ".", files: ["src/auth.ts"] })

// 4. After making changes
log({ action: "file_edit", agent_id: "claude-code", project_path: ".", 
     content: { file_path: "src/auth.ts", description: "Added JWT" } })

// 5. After running tests
log({ action: "cmd_run", agent_id: "claude-code", project_path: ".", 
     content: { command: "npm test", exit_code: 0 } })

// 6. Finish
end_session({ session_id: "abc", summary: "Auth implemented and tested" })
```

## ⚡ Remember

- **LOG EVERYTHING SIGNIFICANT** — Don't make other agents guess
- **Use tags** — Makes filtering easier later
- **Include diffs** — Enables automatic stale detection
- **Check conflicts** — Prevents overlapping work
- **End with summary** — Documents what was accomplished
