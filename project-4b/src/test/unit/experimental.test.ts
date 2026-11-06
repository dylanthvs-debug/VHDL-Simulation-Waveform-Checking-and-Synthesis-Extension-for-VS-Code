import * as assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { NodeProcessRunner, ProcessRunner } from '../../shared/processRunner';
import { executeExperimental, experimentalLaunchRequest, ExperimentalSettings, tclString, validateExperimentalSettings } from '../../experimental/execution';

const root = path.resolve(__dirname, '../../..');
const tempRoot = path.join(root, '.vscode-test/tmp');
let directory: string;
let source: string;
let settings: ExperimentalSettings;
const runner = new NodeProcessRunner();

before(async () => {
    await mkdir(tempRoot, { recursive: true });
    directory = await mkdtemp(path.join(tempRoot, 'experimental spaces '));
    source = path.join(directory, 'source with spaces.vhd');
    const launcher = path.join(directory, 'mock vivado.cmd');
    await writeFile(launcher, `@echo off\r\n"${process.execPath}" "${path.join(root, 'test-fixtures/mock-process/vivado.cjs')}" %*\r\nexit /b %errorlevel%\r\n`);
    settings = { executablePath: launcher, topLevel: 'p4b_sample', part: 'mock-part-only' };
});
after(async () => {
    if (directory && path.dirname(directory) === tempRoot) { await rm(directory, { recursive: true, force: true }); }
});

for (const kind of ['checking', 'synthesis'] as const) {
    for (const valid of [true, false]) {
        test(`experimental ${kind} ${valid ? 'success' : 'failure'} with real Windows mock batch process and spaced paths`, async () => {
            await writeFile(source, valid ? '-- valid mock input\n' : 'y <= a and ;\n');
            const run = await executeExperimental(kind, settings, source, root, runner);
            assert.equal(run.result.status, valid ? 'success' : 'failed');
            assert.equal(run.result.process?.exitCode, valid ? 0 : 1);
            assert.match(await readFile(path.join(run.directory, 'stdout.txt'), 'utf8'), /MOCK running/);
            assert.match(await readFile(path.join(run.directory, 'stderr.txt'), 'utf8'), valid ? /WARNING/ : /simulated Tcl error/);
            const saved = JSON.parse(await readFile(path.join(run.directory, 'result.json'), 'utf8'));
            assert.equal(saved.kind, kind);
            assert.equal(saved.experimental, true);
            assert.equal(saved.source, source);
            assert.equal(saved.status, run.result.status);
            if (valid) { assert.ok(run.reports.length >= 2); }
        });
    }
}

for (const marker of ['MOCK_NO_MARKER', 'MOCK_NO_REPORT', 'MOCK_TCL_ERROR MOCK_ZERO_EXIT']) {
    test(`exit zero cannot mask ${marker}`, async () => {
        await writeFile(source, '-- ' + marker);
        const run = await executeExperimental('checking', settings, source, root, runner);
        assert.equal(run.result.process?.exitCode, 0);
        assert.equal(run.result.status, 'failed');
        assert.match(run.result.message, /not confirmed/);
    });
}

test('missing Vivado launcher produces a saved failure without calling runner', async () => {
    await writeFile(source, '-- mock');
    let called = false;
    const fake: ProcessRunner = { run: async () => { called = true; throw new Error('must not run'); } };
    const run = await executeExperimental('checking', { ...settings, executablePath: path.join(directory, 'missing.exe') }, source, root, fake);
    assert.equal(called, false);
    assert.equal(run.result.status, 'launch-error');
    assert.match(run.result.message, /ENOENT/);
    assert.equal(JSON.parse(await readFile(path.join(run.directory, 'result.json'), 'utf8')).exitCode, null);
});

test('invalid configuration is rejected before running any process', async () => {
    let calls = 0;
    const fake: ProcessRunner = { run: async () => { calls++; throw new Error('must not run'); } };
    await assert.rejects(executeExperimental('synthesis', { ...settings, part: '' }, source, root, fake), /explicitly supplied FPGA part/);
    await assert.rejects(executeExperimental('synthesis', { ...settings, topLevel: '' }, source, root, fake), /top-level/);
    assert.equal(calls, 0);
});

test('checking does not require or invent a top-level entity or FPGA part', () => {
    assert.doesNotThrow(() => validateExperimentalSettings({ ...settings, topLevel: '', part: '' }, 'checking'));
});

test('relative launch paths, inline arguments and shell expansion are rejected', () => {
    for (const executablePath of ['vivado.bat', 'C:\\Vivado\\vivado.bat -mode batch', 'C:\\%TEMP%\\vivado.cmd', 'C:\\unsafe&path\\vivado.cmd']) {
        assert.throws(() => validateExperimentalSettings({ ...settings, executablePath }, 'checking'));
    }
    assert.throws(() => experimentalLaunchRequest(settings.executablePath, 'C:\\bad!path\\driver.tcl', directory), /Unsafe/);
});

test('exe launch uses direct arguments without a shell adapter', () => {
    const request = experimentalLaunchRequest(process.execPath, 'driver with spaces.tcl', directory);
    assert.equal(request.executable, process.execPath);
    assert.deepEqual(request.args.slice(0, 4), ['-mode', 'batch', '-source', 'driver with spaces.tcl']);
    assert.equal(request.windowsVerbatimArguments, undefined);
});

test('Tcl input escapes substitutions, quotes and Windows backslashes as data', () => {
    assert.equal(tclString('C:\\a $x[exec bad]".vhd'), '"C:\\\\a \\$x\\[exec bad\\]\\".vhd"');
    assert.throws(() => tclString('\0'));
});

test('each run gets a fresh directory and cannot reuse an old success marker', async () => {
    await writeFile(source, '-- mock success');
    const good = await executeExperimental('checking', settings, source, root, runner);
    await writeFile(source, '-- MOCK_NO_MARKER');
    const bad = await executeExperimental('checking', settings, source, root, runner);
    assert.notEqual(good.directory, bad.directory);
    assert.equal(good.result.status, 'success');
    assert.equal(bad.result.status, 'failed');
});

for (const channel of ['stdout', 'stderr', 'syntax.rpt', 'vivado.log']) {
    test(`Vivado 2026.1 syntax critical warning in ${channel} defeats exit zero and success marker`, async () => {
        await writeFile(source, '-- mock');
        const diagnostic = "CRITICAL WARNING: [HDL 9-1206] Syntax error near ';' [input.vhd:11]";
        const fake: ProcessRunner = { run: async request => {
            for (const [name, contents] of Object.entries({ 'status.txt': 'P4B_EXPERIMENTAL_SUCCESS checking', 'syntax.rpt': 'report', 'version.txt': 'mock' })) {
                await writeFile(path.join(request.cwd!, name), contents);
            }
            if (channel.includes('.')) { await writeFile(path.join(request.cwd!, channel), diagnostic); }
            return { status: 'success', exitCode: 0, signal: null,
                stdout: channel === 'stdout' ? diagnostic : '', stderr: channel === 'stderr' ? diagnostic : '' };
        } };
        const run = await executeExperimental('checking', settings, source, root, fake);
        assert.equal(run.result.status, 'failed');
        assert.ok(run.result.message.includes(diagnostic));
        // Preserve the actual process code; the adapter must not fabricate exit 1.
        assert.equal(run.result.process?.exitCode, 0);
    });
}

test('unrelated critical warnings do not fail valid checking', async () => {
    await writeFile(source, '-- mock');
    const fake: ProcessRunner = { run: async request => {
        for (const [name, contents] of Object.entries({ 'status.txt': 'P4B_EXPERIMENTAL_SUCCESS checking', 'syntax.rpt': 'report', 'version.txt': 'mock' })) {
            await writeFile(path.join(request.cwd!, name), contents);
        }
        return { status: 'success', exitCode: 0, signal: null, stdout: '', stderr: 'CRITICAL WARNING: [Other 1-1] Unrelated warning' };
    } };
    assert.equal((await executeExperimental('checking', settings, source, root, fake)).result.status, 'success');
});

test('missing source is rejected before process launch', async () => {
    await assert.rejects(executeExperimental('checking', settings, path.join(directory, 'missing.vhd'), root, runner), /ENOENT/);
});
