import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

suite('Opt-in experimental commands with a fake Vivado launcher', () => {
    const root = path.resolve(__dirname, '../..');
    const tempRoot = path.join(root, '.vscode-test/tmp');
    let directory: string;
    const previous = new Map<string, unknown>();
    const keys = ['enabled', 'executablePath', 'topLevel', 'part'];
    const config = () => vscode.workspace.getConfiguration('p4b.experimental');

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('ecng2007-local.vhdl-course-workbench-vivado');
        assert.ok(extension);
        await extension.activate();
        for (const key of keys) { previous.set(key, config().inspect(key)?.globalValue); }
        await mkdir(tempRoot, { recursive: true });
        directory = await mkdtemp(path.join(tempRoot, 'experimental commands '));
        const node = process.env.P4B_TEST_NODE_EXECUTABLE;
        assert.ok(node);
        await writeFile(path.join(directory, 'mock vivado.cmd'), `@echo off\r\n"${node}" "${path.join(root, 'test-fixtures/mock-process/vivado.cjs')}" %*\r\nexit /b %errorlevel%\r\n`);
        await config().update('executablePath', path.join(directory, 'mock vivado.cmd'), vscode.ConfigurationTarget.Global);
        await config().update('topLevel', 'p4b_sample', vscode.ConfigurationTarget.Global);
        await config().update('part', 'mock-part-only', vscode.ConfigurationTarget.Global);
    });

    teardown(async () => { await vscode.commands.executeCommand('workbench.action.closeAllEditors'); });
    suiteTeardown(async () => {
        for (const key of keys) { await config().update(key, previous.get(key), vscode.ConfigurationTarget.Global); }
        if (directory && path.dirname(directory) === tempRoot) { await rm(directory, { recursive: true, force: true }); }
    });

    async function openSource(contents: string) {
        const file = path.join(directory, 'selected.vhd');
        await writeFile(file, contents);
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(file)));
    }

    test('development execution is disabled by default', () => {
        assert.equal(config().inspect('enabled')?.defaultValue, false);
    });

    test('disabled mode executes nothing even if a launcher path is configured', async () => {
        await config().update('enabled', false, vscode.ConfigurationTarget.Global);
        await openSource('-- mock');
        await vscode.commands.executeCommand('vhdl-course-workbench-vivado.runChecking');
        await assert.rejects(readdir(path.join(directory, '.p4b-experimental')), /ENOENT/);
    });

    for (const kind of ['Checking', 'Synthesis']) {
        for (const valid of [true, false]) {
            test(`opt-in ${kind} returns ${valid ? 'success' : 'failure'} from mock execution`, async () => {
                await config().update('enabled', true, vscode.ConfigurationTarget.Global);
                await openSource(valid ? '-- MOCK valid' : 'y <= a and ;');
                const runRoot = path.join(directory, '.p4b-experimental');
                const before = await readdir(runRoot).catch(() => [] as string[]);
                await vscode.commands.executeCommand(`vhdl-course-workbench-vivado.run${kind}`);
                const newRuns = (await readdir(runRoot)).filter(name => !before.includes(name));
                assert.equal(newRuns.length, 1);
                const result = JSON.parse(await readFile(path.join(runRoot, newRuns[0], 'result.json'), 'utf8'));
                assert.equal(result.status, valid ? 'success' : 'failed');
                assert.equal(result.kind, kind.toLowerCase());
                assert.equal(result.experimental, true);
            });
        }
    }
});
