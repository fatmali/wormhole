// State
let state = {
    projects: [],
    sessions: [],
    events: [],
    stats: {},
    tags: [],
    currentProject: '',
    currentSession: '',
    currentView: 'dashboard'
};

const commands = [
    { id: 'dashboard', label: 'Go to Overview', key: '1', action: () => switchView('dashboard') },
    { id: 'timeline', label: 'Go to Activity', key: '2', action: () => switchView('timeline') },
    { id: 'sessions', label: 'Go to Sessions', key: '3', action: () => switchView('sessions') },
    { id: 'analytics', label: 'Go to Insights', key: '4', action: () => switchView('analytics') },
    { id: 'refresh', label: 'Refresh data', key: 'R', action: () => loadData() },
    { id: 'export', label: 'Export events', key: 'E', action: () => exportData() }
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
    setInterval(loadData, 30000);
});

async function loadData() {
    try {
        const [projectsRes, sessionsRes, eventsRes, statsRes, tagsRes] = await Promise.all([
            fetch('/api/projects').then(r => r.json()),
            fetch('/api/sessions').then(r => r.json()),
            fetch('/api/events').then(r => r.json()),
            fetch('/api/stats').then(r => r.json()),
            fetch('/api/tags').then(r => r.json())
        ]);

        // Unwrap data from API response format { success: true, data: ... }
        const projects = projectsRes.data || projectsRes || [];
        const sessions = sessionsRes.data || sessionsRes || [];
        const events = eventsRes.data || eventsRes || [];
        const stats = statsRes.data || statsRes || {};
        const tags = tagsRes.data || tagsRes || [];

        state = { ...state, projects, sessions, events, stats, tags };
        render();
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Filters
    document.getElementById('project-filter').addEventListener('change', e => {
        state.currentProject = e.target.value;
        loadFilteredData();
    });

    document.getElementById('session-filter').addEventListener('change', e => {
        state.currentSession = e.target.value;
        loadFilteredData();
    });

    // Search
    document.getElementById('timeline-search').addEventListener('input', e => {
        filterTimeline(e.target.value);
    });

    // Command palette
    document.getElementById('cmd-palette-btn').addEventListener('click', openCommandPalette);
    document.getElementById('refresh-btn').addEventListener('click', loadData);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Command palette input
    document.getElementById('command-input').addEventListener('input', e => {
        filterCommands(e.target.value);
    });

    document.getElementById('command-palette').addEventListener('click', e => {
        if (e.target.id === 'command-palette') closeCommandPalette();
    });
}

function handleKeyboard(e) {
    // Command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
        return;
    }

    // Don't process if in input
    if (e.target.tagName === 'INPUT') {
        if (e.key === 'Escape') closeCommandPalette();
        return;
    }

    switch(e.key) {
        case '1': switchView('dashboard'); break;
        case '2': switchView('timeline'); break;
        case '3': switchView('sessions'); break;
        case '4': switchView('analytics'); break;
        case 'r': loadData(); break;
        case 'e': exportData(); break;
        case 'Escape': closeCommandPalette(); break;
    }
}

function switchView(view) {
    state.currentView = view;
    
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${view}-view`).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    closeCommandPalette();
}

function render() {
    renderFilters();
    renderMetrics();
    renderRecentActivity();
    renderActionChart();
    renderActiveFiles();
    renderTimeline();
    renderSessions();
    renderAnalytics();
}

function renderFilters() {
    const projectSelect = document.getElementById('project-filter');
    const sessionSelect = document.getElementById('session-filter');
    
    projectSelect.innerHTML = '<option value="">All projects</option>' +
        state.projects.map(p => `<option value="${p}">${p.split('/').pop()}</option>`).join('');

    const filteredSessions = state.currentProject 
        ? state.sessions.filter(s => s.project_path === state.currentProject)
        : state.sessions;

    sessionSelect.innerHTML = '<option value="">All sessions</option>' +
        filteredSessions.map(s => `<option value="${s.id}">${s.name || s.id.slice(0, 8)}</option>`).join('');
}

function renderMetrics() {
    const stats = state.stats;
    const activeSessions = state.sessions.filter(s => s.status === 'active' || s.active === 1).length;
    const agents = [...new Set(state.events.map(e => e.agent_id))];

    document.getElementById('stat-events').textContent = stats.totalEvents || stats.total_events || 0;
    document.getElementById('stat-sessions').textContent = stats.totalSessions || stats.total_sessions || 0;
    document.getElementById('stat-active').textContent = stats.activeSessions || activeSessions || 0;
    document.getElementById('stat-agents').textContent = stats.agents?.length || agents.length || 0;

    const agentList = stats.agents || agents;
    document.getElementById('agent-badges').innerHTML = agentList
        .map(a => `<span class="agent-badge">${a}</span>`).join('');
}

function renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    const events = getFilteredEvents().slice(0, 15);
    
    document.getElementById('activity-count').textContent = events.length;

    if (events.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p>No activity recorded yet</p>
            </div>`;
        return;
    }

    container.innerHTML = events.map(e => `
        <div class="list-item" onclick="showEventDetail('${e.id}')">
            <div class="item-icon ${e.action}">${getActionIcon(e.action)}</div>
            <div class="item-content">
                <div class="item-title">${getEventTitle(e)}</div>
                <div class="item-meta">
                    <span>${e.agent_id}</span>
                    <span>${formatTime(e.timestamp)}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="item-action-btn" onclick="event.stopPropagation(); copyEvent(${e.id})">Copy</button>
            </div>
        </div>
    `).join('');
}

function renderActionChart() {
    const container = document.getElementById('top-actions');
    const events = getFilteredEvents();
    
    const counts = {};
    events.forEach(e => {
        counts[e.action] = (counts[e.action] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const max = sorted[0]?.[1] || 1;

    container.innerHTML = sorted.map(([action, count]) => `
        <div class="chart-bar">
            <div class="chart-label">${action.replace('_', ' ')}</div>
            <div class="chart-bar-bg">
                <div class="chart-bar-fill ${action}" style="width: ${(count / max) * 100}%"></div>
            </div>
            <div class="chart-count">${count}</div>
        </div>
    `).join('');
}

function renderActiveFiles() {
    const container = document.getElementById('active-files');
    const events = getFilteredEvents();
    
    const files = {};
    events.forEach(e => {
        const payload = parsePayload(e);
        const path = payload?.file_path || payload?.file;
        if (path) {
            files[path] = (files[path] || 0) + 1;
        }
    });

    const sorted = Object.entries(files).sort((a, b) => b[1] - a[1]).slice(0, 8);

    if (sorted.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No file activity</p></div>`;
        return;
    }

    container.innerHTML = sorted.map(([file, count]) => `
        <div class="list-item">
            <div class="item-content">
                <div class="item-title">${file.split('/').pop()}</div>
                <div class="item-meta">
                    <span>${file}</span>
                </div>
            </div>
            <span class="badge">${count}</span>
        </div>
    `).join('');
}

function renderTimeline() {
    const container = document.getElementById('timeline');
    const events = getFilteredEvents();

    if (events.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No activity yet</p></div>`;
        return;
    }

    container.innerHTML = events.map(e => {
        const payload = parsePayload(e);
        const tags = parseTags(e);

        return `
            <div class="event-item">
                <div class="event-time">${formatTime(e.timestamp)}</div>
                <div class="event-indicator ${e.action}"></div>
                <div class="event-body">
                    <div class="event-header">
                        <span class="event-action">${e.action.replace('_', ' ')}</span>
                        <span class="event-agent">${e.agent_id}</span>
                    </div>
                    <div class="event-description">${getEventDescription(e, payload)}</div>
                    ${tags.length ? `<div class="event-tags">${tags.map(t => `<span class="event-tag">${t}</span>`).join('')}</div>` : ''}
                </div>
                <div class="event-actions">
                    <button class="item-action-btn" onclick="copyEvent(${e.id})">Copy</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderSessions() {
    const container = document.getElementById('sessions-list');
    const sessions = state.currentProject 
        ? state.sessions.filter(s => s.project_path === state.currentProject)
        : state.sessions;

    if (sessions.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No sessions yet</p></div>`;
        return;
    }

    container.innerHTML = sessions.map(s => {
        const isActive = s.active === 1 || s.active === true;
        const status = isActive ? 'active' : 'ended';
        return `
            <div class="session-card ${status}" onclick="selectSession('${s.id}')">
                <div class="session-header">
                    <div class="session-name">${s.name || 'Unnamed'}</div>
                    <span class="session-status ${status}">${status}</span>
                </div>
                <div class="session-desc">${s.description || 'No description'}</div>
                <div class="session-meta">
                    <span>${s.started_by || s.agent_id || 'unknown'}</span>
                    <span>${formatDate(s.started_at)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderAnalytics() {
    // Action types
    const actionContainer = document.getElementById('action-types');
    const events = getFilteredEvents();
    
    const counts = {};
    events.forEach(e => {
        counts[e.action] = (counts[e.action] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;

    if (sorted.length === 0) {
        actionContainer.innerHTML = `<div class="empty-state"><p>No data</p></div>`;
    } else {
        actionContainer.innerHTML = sorted.map(([action, count]) => `
            <div class="chart-bar">
                <div class="chart-label">${action.replace('_', ' ')}</div>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill ${action}" style="width: ${(count / max) * 100}%"></div>
                </div>
                <div class="chart-count">${count}</div>
            </div>
        `).join('');
    }

    // Tags
    const tagContainer = document.getElementById('tags-chart');
    const tagCounts = {};
    
    events.forEach(e => {
        const tags = parseTags(e);
        tags.forEach(t => {
            tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
    });

    const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);

    if (sortedTags.length === 0) {
        tagContainer.innerHTML = `<div class="empty-state"><p>No tags</p></div>`;
    } else {
        tagContainer.innerHTML = sortedTags.map(([tag, count]) => `
            <span class="tag" onclick="filterByTag('${tag}')">${tag}<span class="tag-count">${count}</span></span>
        `).join('');
    }
}

// Helpers
function getFilteredEvents() {
    let events = state.events;
    
    if (state.currentProject) {
        events = events.filter(e => e.project_path === state.currentProject);
    }
    if (state.currentSession) {
        events = events.filter(e => e.session_id === state.currentSession);
    }
    
    return events;
}

async function loadFilteredData() {
    const params = new URLSearchParams();
    if (state.currentProject) params.set('project', state.currentProject);
    if (state.currentSession) params.set('session', state.currentSession);

    try {
        const res = await fetch(`/api/events?${params}`).then(r => r.json());
        const events = res.data || res || [];
        state.events = events;
        render();
    } catch (err) {
        console.error('Failed to load filtered data:', err);
    }
}

function filterTimeline(query) {
    const items = document.querySelectorAll('.event-item');
    const q = query.toLowerCase();
    
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q) ? '' : 'none';
    });
}

function filterByTag(tag) {
    document.getElementById('timeline-search').value = tag;
    switchView('timeline');
    filterTimeline(tag);
}

function selectSession(id) {
    state.currentSession = id;
    document.getElementById('session-filter').value = id;
    loadFilteredData();
    switchView('timeline');
}

function getActionIcon(action) {
    const icons = {
        file_edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        cmd_run: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
        decision: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        test_result: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        todos: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
    };
    return icons[action] || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
}

// Helper to safely parse payload
function parsePayload(event) {
    const raw = event.payload || event.content;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

// Helper to safely parse tags
function parseTags(event) {
    if (!event.tags) return [];
    if (Array.isArray(event.tags)) return event.tags;
    try {
        return JSON.parse(event.tags) || [];
    } catch {
        return [];
    }
}

function getEventTitle(event) {
    const payload = parsePayload(event);
    
    switch (event.action) {
        case 'file_edit':
            return payload?.file_path?.split('/').pop() || 'File edited';
        case 'cmd_run':
            const cmd = payload?.command || '';
            return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd || 'Command executed';
        case 'decision':
            return payload?.decision?.slice(0, 50) || 'Decision made';
        case 'test_result':
            return payload?.test_suite || 'Tests run';
        case 'todos':
            return `${payload?.items?.length || 0} tasks`;
        default:
            return event.action.replace('_', ' ');
    }
}

function getEventDescription(event, payload) {
    switch (event.action) {
        case 'file_edit':
            return payload?.description || payload?.file_path || 'File modified';
        case 'cmd_run':
            return payload?.command || 'Command executed';
        case 'decision':
            return payload?.decision || '';
        case 'test_result':
            return `${payload?.status || ''}: ${payload?.summary || ''}`;
        case 'todos':
            const items = payload?.items || [];
            const done = items.filter(i => i.status === 'done').length;
            return `${done}/${items.length} complete`;
        default:
            try {
                return JSON.stringify(payload).slice(0, 100);
            } catch {
                return '';
            }
    }
}

function formatTime(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Actions
function copyEvent(id) {
    const event = state.events.find(e => e.id == id);
    if (event) {
        navigator.clipboard.writeText(JSON.stringify(event, null, 2));
        showToast('Copied to clipboard');
    }
}

function showEventDetail(id) {
    const event = state.events.find(e => e.id === id);
    if (event) {
        console.log('Event detail:', event);
        // Could open a modal here
    }
}

function exportData() {
    const events = getFilteredEvents();
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wormhole-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export downloaded');
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// Command Palette
function openCommandPalette() {
    const palette = document.getElementById('command-palette');
    palette.classList.remove('hidden');
    document.getElementById('command-input').value = '';
    document.getElementById('command-input').focus();
    renderCommands(commands);
}

function closeCommandPalette() {
    document.getElementById('command-palette').classList.add('hidden');
}

function renderCommands(cmds) {
    document.getElementById('command-results').innerHTML = cmds.map(c => `
        <div class="command-item" onclick="executeCommand('${c.id}')">
            <span>${c.label}</span>
            <span class="command-key">${c.key}</span>
        </div>
    `).join('');
}

function filterCommands(query) {
    const q = query.toLowerCase();
    const filtered = commands.filter(c => c.label.toLowerCase().includes(q));
    renderCommands(filtered);
}

function executeCommand(id) {
    const cmd = commands.find(c => c.id === id);
    if (cmd) cmd.action();
    closeCommandPalette();
}
