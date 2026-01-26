// UI Server for Wormhole visualization
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { getDatabase } from './db.js';
import type { TimelineEvent, Session } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function sendJSON(res: http.ServerResponse, statusCode: number, data: APIResponse): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendHTML(res: http.ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}

function sendCSS(res: http.ServerResponse, css: string): void {
  res.writeHead(200, { 'Content-Type': 'text/css' });
  res.end(css);
}

function sendJS(res: http.ServerResponse, js: string): void {
  res.writeHead(200, { 'Content-Type': 'application/javascript' });
  res.end(js);
}

// API Handlers
function getProjects(): string[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT DISTINCT project_path FROM timeline ORDER BY project_path');
  const rows = stmt.all() as Array<{ project_path: string }>;
  return rows.map(r => r.project_path);
}

function getSessions(projectPath?: string): Session[] {
  const db = getDatabase();
  let stmt;
  if (projectPath) {
    stmt = db.prepare(`
      SELECT * FROM sessions 
      WHERE project_path = ? 
      ORDER BY started_at DESC 
      LIMIT 100
    `);
    return stmt.all(projectPath) as Session[];
  } else {
    stmt = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 100');
    return stmt.all() as Session[];
  }
}

function getEvents(projectPath?: string, sessionId?: string, limit: number = 100): TimelineEvent[] {
  const db = getDatabase();
  let query = 'SELECT * FROM timeline WHERE 1=1';
  const params: (string | number)[] = [];

  if (projectPath) {
    query += ' AND project_path = ?';
    params.push(projectPath);
  }

  if (sessionId) {
    query += ' AND session_id = ?';
    params.push(sessionId);
  }

  query += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const stmt = db.prepare(query);
  return stmt.all(...params) as TimelineEvent[];
}

function getStats(projectPath?: string) {
  const db = getDatabase();
  let baseQuery = '';
  const params: string[] = [];

  if (projectPath) {
    baseQuery = ' WHERE project_path = ?';
    params.push(projectPath);
  }

  const totalEvents = db.prepare(`SELECT COUNT(*) as count FROM timeline${baseQuery}`).get(...params) as { count: number };
  const totalSessions = db.prepare(`SELECT COUNT(*) as count FROM sessions${baseQuery}`).get(...params) as { count: number };
  const activeSessions = db.prepare(`SELECT COUNT(*) as count FROM sessions${baseQuery}${baseQuery ? ' AND' : ' WHERE'} active = 1`).get(...params) as { count: number };
  
  const agents = db.prepare(`SELECT DISTINCT agent_id FROM timeline${baseQuery}`).all(...params) as Array<{ agent_id: string }>;
  
  const actionTypes = db.prepare(`
    SELECT action, COUNT(*) as count 
    FROM timeline${baseQuery} 
    GROUP BY action 
    ORDER BY count DESC
  `).all(...params) as Array<{ action: string; count: number }>;

  return {
    totalEvents: totalEvents.count,
    totalSessions: totalSessions.count,
    activeSessions: activeSessions.count,
    agents: agents.map(a => a.agent_id),
    actionTypes
  };
}

function getTags(projectPath?: string) {
  const db = getDatabase();
  let query = 'SELECT tags FROM timeline WHERE tags IS NOT NULL';
  const params: string[] = [];

  if (projectPath) {
    query += ' AND project_path = ?';
    params.push(projectPath);
  }

  const stmt = db.prepare(query);
  const rows = stmt.all(...params) as Array<{ tags: string }>;
  
  const tagCounts = new Map<string, number>();
  rows.forEach(row => {
    try {
      const tags = JSON.parse(row.tags) as string[];
      tags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    } catch (e) {
      // Skip invalid JSON
    }
  });

  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function handleAPI(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  
  if (!url.pathname.startsWith('/api/')) {
    return false;
  }

  try {
    switch (url.pathname) {
      case '/api/projects':
        sendJSON(res, 200, { success: true, data: getProjects() });
        return true;

      case '/api/sessions': {
        const projectPath = url.searchParams.get('project') || undefined;
        sendJSON(res, 200, { success: true, data: getSessions(projectPath) });
        return true;
      }

      case '/api/events': {
        const projectPath = url.searchParams.get('project') || undefined;
        const sessionId = url.searchParams.get('session') || undefined;
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        sendJSON(res, 200, { success: true, data: getEvents(projectPath, sessionId, limit) });
        return true;
      }

      case '/api/stats': {
        const projectPath = url.searchParams.get('project') || undefined;
        sendJSON(res, 200, { success: true, data: getStats(projectPath) });
        return true;
      }

      case '/api/tags': {
        const projectPath = url.searchParams.get('project') || undefined;
        sendJSON(res, 200, { success: true, data: getTags(projectPath) });
        return true;
      }

      default:
        sendJSON(res, 404, { success: false, error: 'Not found' });
        return true;
    }
  } catch (error) {
    console.error('API error:', error);
    sendJSON(res, 500, { success: false, error: 'Internal server error' });
    return true;
  }
}

function getUIFiles(): { html: string; css: string; js: string } {
  const uiDir = path.join(__dirname, '..', 'ui');
  
  return {
    html: fs.readFileSync(path.join(uiDir, 'index.html'), 'utf-8'),
    css: fs.readFileSync(path.join(uiDir, 'styles.css'), 'utf-8'),
    js: fs.readFileSync(path.join(uiDir, 'app.js'), 'utf-8')
  };
}

export function startUIServer(port: number = 3000): void {
  const server = http.createServer((req, res) => {
    // Handle API routes
    if (handleAPI(req, res)) {
      return;
    }

    // Handle static files
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    
    try {
      const { html, css, js } = getUIFiles();

      switch (url.pathname) {
        case '/':
        case '/index.html':
          sendHTML(res, html);
          break;
        case '/styles.css':
          sendCSS(res, css);
          break;
        case '/app.js':
          sendJS(res, js);
          break;
        default:
          res.writeHead(404);
          res.end('Not found');
      }
    } catch (error) {
      console.error('Error serving files:', error);
      res.writeHead(500);
      res.end('Internal server error');
    }
  });

  server.listen(port, () => {
    console.log(`🌀 Wormhole UI running at http://localhost:${port}`);
    console.log(`   Press Ctrl+C to stop`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    server.close(() => {
      process.exit(0);
    });
  });
}
