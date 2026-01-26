#!/usr/bin/env node

// CLI entry point for Wormhole
import { startUIServer } from './ui-server.js';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'ui') {
    const port = parseInt(args[1]) || 3000;
    startUIServer(port);
} else {
    console.log(`
🌀 Wormhole CLI

Usage:
  wormhole ui [port]    Start the web UI (default port: 3000)

Examples:
  wormhole ui           Start UI on port 3000
  wormhole ui 8080      Start UI on port 8080
`);
    process.exit(command ? 1 : 0);
}
