import { execFile } from 'child_process';

/** Captured result of one external tool invocation. */
export interface ProcessResult {
    /** Process exit code, or null when the process did not start or was stopped. */
    exitCode: number | null;
    stdout: string;
    stderr: string;
    /** Node error code when the process could not be run, e.g. 'ENOENT' (executable not found). */
    errorCode?: string;
    /** True when the process was stopped because it exceeded the time limit. */
    timedOut?: boolean;
    /** Error text reported by Node, if any. */
    errorMessage?: string;
}

/**
 * Testable boundary around child_process (SSA-A2). The workflow only talks to this
 * interface, so unit tests can supply a fake runner instead of the real GHDL.
 */
export interface ProcessRunner {
    run(executable: string, args: readonly string[], cwd: string): Promise<ProcessResult>;
}

/** Default time limit for one GHDL stage. */
export const DEFAULT_STAGE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Runs a tool with execFile: no shell is involved and every argument is passed separately,
 * so file names containing spaces stay intact.
 */
export class NodeProcessRunner implements ProcessRunner {
    constructor(private readonly timeoutMs: number = DEFAULT_STAGE_TIMEOUT_MS) {}

    run(executable: string, args: readonly string[], cwd: string): Promise<ProcessResult> {
        return new Promise<ProcessResult>((resolve) => {
            try {
                execFile(
                    executable,
                    [...args],
                    {
                        cwd,
                        timeout: this.timeoutMs,
                        windowsHide: true,
                        maxBuffer: 16 * 1024 * 1024,
                        encoding: 'utf8',
                    },
                    (error, stdout, stderr) => {
                        const out = String(stdout ?? '');
                        const err = String(stderr ?? '');
                        if (!error) {
                            resolve({ exitCode: 0, stdout: out, stderr: err });
                            return;
                        }
                        const details = error as { code?: unknown; killed?: boolean; message: string };
                        if (typeof details.code === 'number') {
                            resolve({ exitCode: details.code, stdout: out, stderr: err, errorMessage: details.message });
                        } else if (typeof details.code === 'string') {
                            resolve({ exitCode: null, stdout: out, stderr: err, errorCode: details.code, errorMessage: details.message });
                        } else if (details.killed) {
                            resolve({ exitCode: null, stdout: out, stderr: err, timedOut: true, errorMessage: details.message });
                        } else {
                            resolve({ exitCode: null, stdout: out, stderr: err, errorMessage: details.message });
                        }
                    }
                );
            } catch (thrown) {
                const details = thrown as { code?: unknown; message?: string };
                resolve({
                    exitCode: null,
                    stdout: '',
                    stderr: '',
                    errorCode: typeof details.code === 'string' ? details.code : 'ESPAWN',
                    errorMessage: details.message ?? String(thrown),
                });
            }
        });
    }
}
