import { spawn } from 'node:child_process';

export interface ProcessRequest {
    /** An executable path or program name. Do not add shell quotes. */
    executable: string;
    args: readonly string[];
    cwd?: string;
    /** Used only by the experimental Windows batch adapter after strict validation. */
    windowsVerbatimArguments?: boolean;
}

export interface ProcessResult {
    status: 'success' | 'failed' | 'launch-error';
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    /** Present for launch errors; tool output remains in stdout/stderr. */
    error?: { code?: string; message: string };
}

/** Workflows accept this interface so tests can supply a fake implementation. */
export interface ProcessRunner {
    run(request: ProcessRequest): Promise<ProcessResult>;
}

/** Runs non-interactive executables directly, without a shell or VS Code dependency. */
export class NodeProcessRunner implements ProcessRunner {
    run(request: ProcessRequest): Promise<ProcessResult> {
        return new Promise(resolve => {
            let stdout = '';
            let stderr = '';
            let launchError: ProcessResult['error'];

            const describeError = (error: NodeJS.ErrnoException): NonNullable<ProcessResult['error']> => ({
                code: error.code,
                message: error.code === 'ENOENT'
                    ? `Could not launch "${request.executable}": executable or working directory not found. Check the executable path/PATH${request.cwd ? ` and working directory "${request.cwd}"` : ''}. ${error.message}`
                    : `Could not launch "${request.executable}": ${error.message}`
            });

            try {
                const child = spawn(request.executable, [...request.args], {
                    cwd: request.cwd,
                    shell: false,
                    windowsHide: true,
                    windowsVerbatimArguments: request.windowsVerbatimArguments,
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                // Stream decoding preserves UTF-8 characters split across chunks.
                child.stdout.setEncoding('utf8');
                child.stderr.setEncoding('utf8');
                child.stdout.on('data', (chunk: string) => { stdout += chunk; });
                child.stderr.on('data', (chunk: string) => { stderr += chunk; });
                child.on('error', (error: NodeJS.ErrnoException) => {
                    launchError = describeError(error);
                });
                // close follows exit/error and waits until captured streams have closed.
                child.on('close', (exitCode, signal) => {
                    resolve({
                        status: launchError ? 'launch-error' : exitCode === 0 && signal === null ? 'success' : 'failed',
                        stdout,
                        stderr,
                        exitCode: launchError ? null : exitCode,
                        signal,
                        ...(launchError ? { error: launchError } : {})
                    });
                });
            } catch (error) {
                resolve({
                    status: 'launch-error', stdout, stderr, exitCode: null, signal: null,
                    error: describeError(error as NodeJS.ErrnoException)
                });
            }
        });
    }
}
