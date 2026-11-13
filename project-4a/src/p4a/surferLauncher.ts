import { spawn, SpawnOptions } from 'child_process';
import * as path from 'path';

/** The parts of a child process the launcher needs. Real ChildProcess objects satisfy it. */
export interface LaunchedProcess {
    once(event: string, listener: (...args: any[]) => void): unknown;
    unref(): void;
}

export type SpawnFunction = (command: string, args: string[], options: SpawnOptions) => LaunchedProcess;

export interface SurferLaunchOptions {
    /** Replaces child_process.spawn in unit tests. */
    spawnFn?: SpawnFunction;
    /**
     * After Surfer starts, wait this long for an immediate crash (for example an unreadable
     * waveform) before reporting success.
     */
    earlyExitWindowMs?: number;
    /** Where the executable came from, for the error message (e.g. "p4a.surferPath setting"). */
    toolDescription?: string;
}

export interface SurferLaunchResult {
    ok: boolean;
    executable: string;
    args: string[];
    message: string;
    /** Node error code when Surfer could not be started, e.g. 'ENOENT'. */
    errorCode?: string;
    /** Exit code when Surfer started but exited during the early-exit window. */
    exitCode?: number | null;
}

export const DEFAULT_EARLY_EXIT_WINDOW_MS = 1500;

const defaultSpawn: SpawnFunction = (command, args, options) => spawn(command, args, options);

/** Surfer CLI: `surfer [OPTIONS] [WAVE_FILE]`. The full waveform path is one argument. */
export function buildSurferArgs(waveformPath: string): string[] {
    return [waveformPath];
}

function describeStartError(executable: string, code: string | undefined, message: string, toolDescription?: string): string {
    const from = toolDescription ? `, from ${toolDescription}` : '';
    if (code === 'ENOENT') {
        return (
            `Surfer was not found (${executable}${from}). Install Surfer and add its folder to PATH, ` +
            'or set its location in the tool manifest or p4a.surferPath. If you just changed PATH, restart VS Code.'
        );
    }
    if (code === 'EINVAL') {
        return `Surfer could not be started (${executable}${from}): point the setting or manifest at surfer.exe itself, not a .bat or .cmd file.`;
    }
    return `Surfer could not be started (${executable}${from}): ${code ? `${code} ` : ''}${message}`.trim();
}

/**
 * Starts Surfer on the given waveform without a shell, detached from VS Code so it stays open.
 * Resolves (never rejects) with ok=false when Surfer cannot start or exits straight away.
 */
export function launchSurfer(executable: string, waveformPath: string, options: SurferLaunchOptions = {}): Promise<SurferLaunchResult> {
    const spawnFn = options.spawnFn ?? defaultSpawn;
    const windowMs = options.earlyExitWindowMs ?? DEFAULT_EARLY_EXIT_WINDOW_MS;
    const args = buildSurferArgs(waveformPath);

    return new Promise<SurferLaunchResult>((resolve) => {
        let settled = false;
        let timer: NodeJS.Timeout | undefined;
        const finish = (result: SurferLaunchResult): void => {
            if (settled) {
                return;
            }
            settled = true;
            if (timer !== undefined) {
                clearTimeout(timer);
            }
            resolve(result);
        };

        let child: LaunchedProcess;
        try {
            child = spawnFn(executable, args, {
                cwd: path.dirname(waveformPath),
                detached: true,
                stdio: 'ignore',
                windowsHide: false,
            });
        } catch (thrown) {
            const details = thrown as { code?: unknown; message?: string };
            const code = typeof details.code === 'string' ? details.code : undefined;
            finish({
                ok: false,
                executable,
                args,
                errorCode: code,
                message: describeStartError(executable, code, details.message ?? String(thrown), options.toolDescription),
            });
            return;
        }

        child.once('error', (err: NodeJS.ErrnoException) => {
            finish({
                ok: false,
                executable,
                args,
                errorCode: err.code,
                message: describeStartError(executable, err.code, err.message, options.toolDescription),
            });
        });

        child.once('spawn', () => {
            timer = setTimeout(() => {
                child.unref();
                finish({ ok: true, executable, args, message: `Surfer started with ${waveformPath}` });
            }, windowMs);
        });

        child.once('exit', (code: number | null, signal: string | null) => {
            if (code === 0) {
                finish({ ok: true, executable, args, exitCode: 0, message: `Surfer started with ${waveformPath} and exited normally` });
                return;
            }
            const how = code !== null ? `exit code ${code}` : `signal ${signal ?? 'unknown'}`;
            finish({
                ok: false,
                executable,
                args,
                exitCode: code,
                message: `Surfer started but closed immediately (${how}). Check that ${waveformPath} is a readable VCD file and open it in Surfer manually to see the error.`,
            });
        });
    });
}
