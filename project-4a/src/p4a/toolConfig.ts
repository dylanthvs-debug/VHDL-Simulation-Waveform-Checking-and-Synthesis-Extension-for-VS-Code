import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Tool location for P4A (IR-SH2, DC-A3).
 *
 * Resolution order for each tool:
 *   1. p4a.ghdlPath / p4a.surferPath setting (explicit override, e.g. for testing a missing tool)
 *   2. the entry in the Local EDA Tool Manifest v1 named by p4a.toolManifestPath
 *   3. the bare command name ('ghdl' / 'surfer') looked up on PATH, as in the course setup guide
 *
 * PROVISIONAL: the course-supplied manifest file was not in the project pack, so its exact
 * layout is unknown. parseToolManifest() accepts a JSON object with a "tools" member that is
 * either an object keyed by tool id or an array of entries with "id"/"name". The executable is
 * read from "executable", "path", "executablePath", "exe" or "command". Adjust this when the
 * staff manifest is available.
 */

export type ToolId = 'ghdl' | 'surfer';

export const DEFAULT_TOOL_COMMANDS: Readonly<Record<ToolId, string>> = {
    ghdl: 'ghdl',
    surfer: 'surfer',
};

export const TOOL_SETTING_NAMES: Readonly<Record<ToolId, string>> = {
    ghdl: 'p4a.ghdlPath',
    surfer: 'p4a.surferPath',
};

export interface ManifestToolEntry {
    id: string;
    executable?: string;
    version?: string;
}

export interface ToolManifest {
    /** File the manifest was read from. */
    source: string;
    /** Entries keyed by lower-case tool id. */
    tools: Map<string, ManifestToolEntry>;
}

/** Where a tool executable came from, used in diagnostics. */
export interface ResolvedTool {
    id: ToolId;
    executable: string;
    source: 'setting' | 'manifest' | 'path';
    description: string;
}

export class ToolManifestError extends Error {}

const EXECUTABLE_KEYS = ['executable', 'path', 'executablePath', 'exe', 'command'];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbsoluteAnyPlatform(p: string): boolean {
    return path.win32.isAbsolute(p) || path.posix.isAbsolute(p);
}

function stripQuotes(value: string): string {
    const trimmed = value.trim();
    return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).trim() : trimmed;
}

/** Expands Windows-style %VARIABLE% references. Unknown variables are left unchanged. */
export function expandEnvironmentVariables(value: string, env: NodeJS.ProcessEnv = process.env): string {
    return value.replace(/%([^%]+)%/g, (whole, name: string) => {
        const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
        const replacement = key === undefined ? undefined : env[key];
        return replacement === undefined ? whole : replacement;
    });
}

export function parseToolManifest(text: string, source: string, env: NodeJS.ProcessEnv = process.env): ToolManifest {
    let data: unknown;
    try {
        data = JSON.parse(text.replace(/^﻿/, ''));
    } catch (err) {
        throw new ToolManifestError(`Tool manifest is not valid JSON (${source}): ${(err as Error).message}`);
    }
    if (!isRecord(data) || data.tools === undefined) {
        throw new ToolManifestError(`Tool manifest has no "tools" member (${source}).`);
    }

    const baseDir = path.dirname(source);
    const tools = new Map<string, ManifestToolEntry>();
    const addEntry = (id: string, value: Record<string, unknown>): void => {
        let executable: string | undefined;
        for (const key of EXECUTABLE_KEYS) {
            const candidate = value[key];
            if (typeof candidate === 'string' && candidate.trim() !== '') {
                executable = expandEnvironmentVariables(stripQuotes(candidate), env);
                break;
            }
        }
        // A relative path (with a folder part) is relative to the manifest; a bare name stays a PATH lookup.
        if (executable !== undefined && /[\\/]/.test(executable) && !isAbsoluteAnyPlatform(executable)) {
            executable = path.resolve(baseDir, executable);
        }
        const version = typeof value.version === 'string' ? value.version : undefined;
        tools.set(id.toLowerCase(), { id, executable, version });
    };

    if (Array.isArray(data.tools)) {
        for (const item of data.tools) {
            if (!isRecord(item)) {
                continue;
            }
            const id = typeof item.id === 'string' ? item.id : typeof item.name === 'string' ? item.name : undefined;
            if (id) {
                addEntry(id, item);
            }
        }
    } else if (isRecord(data.tools)) {
        for (const [id, value] of Object.entries(data.tools)) {
            if (isRecord(value)) {
                addEntry(id, value);
            }
        }
    } else {
        throw new ToolManifestError(`Tool manifest "tools" member must be an object or an array (${source}).`);
    }

    return { source, tools };
}

export async function readToolManifest(filePath: string, env: NodeJS.ProcessEnv = process.env): Promise<ToolManifest> {
    let text: string;
    try {
        text = await fs.readFile(filePath, 'utf8');
    } catch (err) {
        const code = (err as { code?: unknown }).code;
        if (code === 'ENOENT') {
            throw new ToolManifestError(`Tool manifest not found: ${filePath} (check p4a.toolManifestPath).`);
        }
        throw new ToolManifestError(`Tool manifest could not be read: ${filePath}: ${(err as Error).message}`);
    }
    return parseToolManifest(text, filePath, env);
}

export function resolveTool(
    id: ToolId,
    settingValue: string | undefined,
    manifest?: ToolManifest,
    env: NodeJS.ProcessEnv = process.env
): ResolvedTool {
    const setting = settingValue === undefined ? '' : expandEnvironmentVariables(stripQuotes(settingValue), env);
    if (setting !== '') {
        return { id, executable: setting, source: 'setting', description: `${TOOL_SETTING_NAMES[id]} setting` };
    }
    const entry = manifest?.tools.get(id);
    if (manifest !== undefined && entry?.executable) {
        const version = entry.version ? `, version ${entry.version}` : '';
        return {
            id,
            executable: entry.executable,
            source: 'manifest',
            description: `tool manifest ${manifest.source}${version}`,
        };
    }
    return { id, executable: DEFAULT_TOOL_COMMANDS[id], source: 'path', description: `"${DEFAULT_TOOL_COMMANDS[id]}" on PATH` };
}
