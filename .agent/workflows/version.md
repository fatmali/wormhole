---
description: How to release a new version of wormhole-mcp
---

# Version Management Workflow

## Release a New Version

// turbo-all

1. Ensure you're on `main` with latest changes:
```bash
git checkout main && git pull
```

2. Bump the version (choose one):
```bash
# Patch (bug fixes): 2.0.0 → 2.0.1
npm version patch

# Minor (new features): 2.0.0 → 2.1.0
npm version minor

# Major (breaking changes): 2.0.0 → 3.0.0
npm version major
```

3. Push the tag to trigger release:
```bash
git push && git push --tags
```

## What Happens Automatically

When you push a `v*` tag, GitHub Actions will:
1. Build the project
2. Publish to npm with provenance (trusted publishing)
3. Create a GitHub Release with auto-generated changelog

## One-Time Setup: Link npm to GitHub

1. Go to [npmjs.com](https://www.npmjs.com/) → Package Settings → `wormhole-mcp`
2. Publishing access → Link to GitHub repository
3. Select `fatmali/wormhole` (or your repo)
