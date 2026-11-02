import { ProcessRequest, ProcessResult, ProcessRunner } from '../shared/processRunner';

export const notConfiguredMessage = 'Vivado workflow is not configured. Awaiting the official tool configuration and approved procedure.';

export interface WorkflowResult {
    status: ProcessResult['status'] | 'not-configured' | 'runner-error';
    message: string;
    process?: ProcessResult;
}

/** Configuration is an in-memory process request, not a course manifest schema.
 * Tests and the explicitly opted-in development prototype can supply configuration.
 * Official course procedures remain unavailable.
 * Success describes process completion, not VHDL correctness or synthesis validity.
 */
export async function executeWorkflow(
    configuration: ProcessRequest | undefined,
    runner: ProcessRunner
): Promise<WorkflowResult> {
    if (!configuration) {
        return { status: 'not-configured', message: notConfiguredMessage };
    }

    try {
        const result = await runner.run(configuration);
        let message: string;
        switch (result.status) {
            case 'success':
                message = 'Configured program completed successfully (exit code 0).';
                break;
            case 'failed':
                message = result.signal
                    ? `Configured program terminated by signal ${result.signal}.`
                    : `Configured program failed (exit code ${result.exitCode ?? 'unavailable'}).`;
                break;
            case 'launch-error':
                message = `Configured program could not start${result.error?.code ? ` (${result.error.code})` : ''}. `
                    + (result.error?.message ?? 'Check the executable, working directory, and permissions.');
                break;
        }
        return { status: result.status, message, process: result };
    } catch (error) {
        return {
            status: 'runner-error',
            message: `Process runner failed: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

/** Accepts the existing VS Code Output channel or a small test double. */
export function writeWorkflowResult(output: { appendLine(value: string): void }, result: WorkflowResult): void {
    output.appendLine(result.message);
    if (result.process?.stdout) {
        output.appendLine('--- stdout ---');
        output.appendLine(result.process.stdout);
    }
    if (result.process?.stderr) {
        output.appendLine('--- stderr ---');
        output.appendLine(result.process.stderr);
    }
}
