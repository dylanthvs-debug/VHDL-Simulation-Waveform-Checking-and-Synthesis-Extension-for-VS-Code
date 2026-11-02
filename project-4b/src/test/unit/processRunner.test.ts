import * as assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chmod, copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import * as path from 'node:path';
import { NodeProcessRunner, ProcessRunner } from '../../shared/processRunner';

const projectRoot = path.resolve(__dirname, '../../..');
const fixture = path.join(projectRoot, 'test-fixtures/mock-process/program.cjs');
const temporaryRoot = path.join(projectRoot, '.vscode-test/tmp');
const runner: ProcessRunner = new NodeProcessRunner();
let workDirectory: string;

before(async () => {
    await mkdir(temporaryRoot, { recursive: true });
    workDirectory = await mkdtemp(path.join(temporaryRoot, 'process runner '));
});

after(async () => {
    // Only remove this suite's generated directory within the project.
    if (workDirectory && path.dirname(path.resolve(workDirectory)) === path.resolve(temporaryRoot)) {
        await rm(workDirectory, { recursive: true, force: true });
    }
});

function runMock(mode: string, args: string[] = [], cwd?: string) {
    return runner.run({ executable: process.execPath, args: [fixture, mode, ...args], cwd });
}

test('captures stdout and a successful exit', async () => {
    assert.deepEqual(await runMock('success'), {
        status: 'success', stdout: 'completed\n', stderr: '', exitCode: 0, signal: null
    });
});

test('captures nonzero exit codes and both output streams', async () => {
    assert.deepEqual(await runMock('failure'), {
        status: 'failed', stdout: 'started\n', stderr: 'mock stage failed\n', exitCode: 7, signal: null
    });
});

test('stderr alone does not mean execution failed', async () => {
    const result = await runMock('stderr');
    assert.equal(result.status, 'success');
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'warning only\n');
});

test('reports missing executable with actionable launch error information', async () => {
    const executable = path.join(workDirectory, 'missing-program.exe');
    const result = await runner.run({ executable, args: [] });
    assert.equal(result.status, 'launch-error');
    assert.equal(result.exitCode, null);
    assert.equal(result.error?.code, 'ENOENT');
    assert.ok(result.error?.message.includes(executable));
    assert.match(result.error.message, /not found.*Check/);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
});

test('executes an actual executable whose path contains spaces', async () => {
    const executable = path.join(workDirectory, process.platform === 'win32' ? 'mock node.exe' : 'mock node');
    await copyFile(process.execPath, executable);
    await chmod(executable, 0o755);
    const result = await runner.run({ executable, args: [fixture, 'success'] });
    assert.equal(result.status, 'success');
    assert.equal(result.stdout, 'completed\n');
});

test('uses the supplied working directory with spaces', async () => {
    const result = await runMock('cwd', [], workDirectory);
    assert.equal(result.status, 'success');
    assert.equal(result.stdout, workDirectory);
});

test('inherits the current working directory when omitted', async () => {
    const result = await runMock('cwd');
    assert.equal(result.status, 'success');
    assert.equal(result.stdout, process.cwd());
});

test('distinguishes a missing working directory from a tool exit failure', async () => {
    const cwd = path.join(workDirectory, 'missing-directory');
    const result = await runMock('success', [], cwd);
    assert.equal(result.status, 'launch-error');
    assert.equal(result.exitCode, null);
    assert.equal(result.error?.code, 'ENOENT');
    assert.ok(result.error?.message.includes(cwd));
});

test('passes spaces and shell metacharacters as literal arguments', async () => {
    const args = ['two words', 'a"b', '& echo unexpected', '$HOME', 'x;y', 'a|b'];
    const result = await runMock('args', args);
    assert.equal(result.status, 'success');
    assert.deepEqual(JSON.parse(result.stdout), args);
});

test('waits for final output and preserves split UTF-8 characters', async () => {
    const result = await runMock('chunks');
    assert.equal(result.status, 'success');
    assert.equal(result.stdout, 'VHDL café ✓\n');
    assert.equal(result.stderr, 'last stderr chunk\n');
});

test('reports synchronous invalid-executable errors as launch errors', async () => {
    const result = await runner.run({ executable: '', args: [] });
    assert.equal(result.status, 'launch-error');
    assert.equal(result.exitCode, null);
    assert.match(result.error?.message ?? '', /Could not launch/);
});
