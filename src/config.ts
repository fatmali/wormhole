// Configuration management for Wormhole
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, DEFAULT_CONFIG } from './types.js';

const WORMHOLE_DIR = path.join(os.homedir(), '.wormhole');
const CONFIG_PATH = path.join(WORMHOLE_DIR, 'config.json');

export function ensureWormholeDir(): void {
    if (!fs.existsSync(WORMHOLE_DIR)) {
        fs.mkdirSync(WORMHOLE_DIR, { recursive: true });
    }
}

export function loadConfig(): Config {
    ensureWormholeDir();

    if (!fs.existsSync(CONFIG_PATH)) {
        // Create default config
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
        return DEFAULT_CONFIG;
    }

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const userConfig = JSON.parse(raw);
        return { ...DEFAULT_CONFIG, ...userConfig };
    } catch {
        return DEFAULT_CONFIG;
    }
}

export function getWormholeDir(): string {
    return WORMHOLE_DIR;
}

export function getArchiveDir(): string {
    const archiveDir = path.join(WORMHOLE_DIR, 'archives');
    if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
    }
    return archiveDir;
}
