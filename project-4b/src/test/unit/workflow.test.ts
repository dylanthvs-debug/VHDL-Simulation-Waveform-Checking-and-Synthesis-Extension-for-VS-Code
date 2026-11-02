import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import * as path from 'node:path';
import { NodeProcessRunner, ProcessRequest, ProcessResult, ProcessRunner } from '../../shared/processRunner';
import { executeWorkflow, writeWorkflowResult } from '../../vivado/workflow';

const configuration: ProcessRequest = { executable: 'test-only-program', args: ['a b'], cwd: 'test-only-workspace' };
const success: ProcessResult = { status: 'success', stdout: 'output\n', stderr: '', exitCode: 0, signal: null };

function fakeRunner(result: ProcessResult): ProcessRunner {
    return { run: async () => result };
}

test('workflow forwards injected executable, arguments and directory without reinterpretation', async () => {
    const requests: ProcessRequest[] = [];
    const runner: ProcessRunner = { run: async request => { requests.push(request); return success; } };
    const result = await executeWorkflow(configuration, runner);
    assert.deepEqual(requests, [configuration]);
    assert.equal(result.status, 'success');
    assert.match(result.message, /Configured program completed successfully.*exit code 0/);
    assert.deepEqual(result.process, success);
});

test('unconfigured workflow never calls the runner', async () => {
    let called = false;
    const runner: ProcessRunner = { run: async () => { called = true; return success; } };
    const result = await executeWorkflow(undefined, runner);
    assert.equal(called, false);
    assert.equal(result.status, 'not-configured');
    assert.match(result.message, /not configured.*official/);
    assert.equal(result.process, undefined);
});

test('workflow retains stderr without treating warnings as an exit failure', async () => {
    const result = await executeWorkflow(configuration, fakeRunner({ ...success, stderr: 'warning\n' }));
    assert.equal(result.status, 'success');
    assert.equal(result.process?.stderr, 'warning\n');
});

test('workflow reports nonzero exit and retains both streams', async () => {
    const processResult: ProcessResult = { ...success, status: 'failed', exitCode: 7, stderr: 'failure\n' };
    const result = await executeWorkflow(configuration, fakeRunner(processResult));
    assert.equal(result.status, 'failed');
    assert.match(result.message, /failed.*exit code 7/);
    assert.deepEqual(result.process, processResult);
});

test('workflow reports permission launch failures separately from tool failures', async () => {
    const result = await executeWorkflow(configuration, fakeRunner({
        ...success, status: 'launch-error', exitCode: null,
        error: { code: 'EACCES', message: 'Permission denied for test-only-program.' }
    }));
    assert.equal(result.status, 'launch-error');
    assert.match(result.message, /could not start.*EACCES.*Permission denied/);
});

test('workflow reports signal termination rather than successful completion', async () => {
    const result = await executeWorkflow(configuration, fakeRunner({ ...success, status: 'failed', exitCode: null, signal: 'SIGTERM' }));
    assert.equal(result.status, 'failed');
    assert.match(result.message, /terminated by signal SIGTERM/);
});

test('workflow converts unexpected runner rejection into a displayable failure', async () => {
    const runner: ProcessRunner = { run: async () => { throw new Error('test runner unavailable'); } };
    const result = await executeWorkflow(configuration, runner);
    assert.equal(result.status, 'runner-error');
    assert.equal(result.message, 'Process runner failed: test runner unavailable');
    assert.equal(result.process, undefined);
});

test('workflow output separates stdout and stderr and preserves their contents', async () => {
    const result = await executeWorkflow(configuration, fakeRunner({ ...success, stderr: 'warning\n' }));
    const lines: string[] = [];
    writeWorkflowResult({ appendLine: line => lines.push(line) }, result);
    assert.deepEqual(lines, [result.message, '--- stdout ---', 'output\n', '--- stderr ---', 'warning\n']);
});

test('unconfigured output does not claim execution or emit empty stream headings', async () => {
    const result = await executeWorkflow(undefined, fakeRunner(success));
    const lines: string[] = [];
    writeWorkflowResult({ appendLine: line => lines.push(line) }, result);
    assert.deepEqual(lines, [result.message]);
    assert.doesNotMatch(lines.join('\n'), /successfully/);
});

// End-to-end demonstration: workflow -> real runner -> local Node fixture.
// No Vivado-specific arguments or installation paths are involved.
const projectRoot = path.resolve(__dirname, '../../..');
const fixture = path.join(projectRoot, 'test-fixtures/mock-process/program.cjs');
const realRunner = new NodeProcessRunner();

for (const mode of ['success', 'failure', 'cwd']) {
    test(`workflow executes local mock through NodeProcessRunner: ${mode}`, async () => {
        const result = await executeWorkflow({
            executable: process.execPath, args: [fixture, mode], cwd: projectRoot
        }, realRunner);
        assert.equal(result.status, mode === 'failure' ? 'failed' : 'success');
        assert.equal(result.process?.exitCode, mode === 'failure' ? 7 : 0);
        assert.equal(result.process?.stdout, mode === 'cwd' ? projectRoot : mode === 'failure' ? 'started\n' : 'completed\n');
        assert.equal(result.process?.stderr, mode === 'failure' ? 'mock stage failed\n' : '');
    });
}

test('workflow reports a genuinely missing executable through NodeProcessRunner', async () => {
    const result = await executeWorkflow({
        executable: path.join(projectRoot, 'test-fixtures/mock-process/nonexistent-tool.exe'), args: [], cwd: projectRoot
    }, realRunner);
    assert.equal(result.status, 'launch-error');
    assert.equal(result.process?.exitCode, null);
    assert.equal(result.process?.error?.code, 'ENOENT');
    assert.match(result.message, /could not start.*ENOENT/);
    assert.match(result.message, /executable or working directory not found/);
});
