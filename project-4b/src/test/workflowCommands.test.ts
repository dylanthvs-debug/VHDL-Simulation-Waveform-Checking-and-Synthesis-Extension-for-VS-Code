import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { P4BOptions } from '../p4b';
import { ProcessRequest } from '../shared/processRunner';

suite('Mock command execution end to end (no Vivado)', () => {
    const root = path.resolve(__dirname, '../..');
    const tempRoot = path.join(root, '.vscode-test/tmp');
    let directory: string;
    let harness: { options: P4BOptions; lines: string[]; requests: ProcessRequest[] };

    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension('local-tests.p4b-mock-test-harness');
        assert.ok(extension);
        harness = await extension.activate();
        await mkdir(tempRoot, { recursive: true });
        directory = await mkdtemp(path.join(tempRoot, 'command workflow '));
        await writeFile(path.join(directory, 'design.vhd'), '-- Selection fixture only\n');
        await writeFile(path.join(directory, 'notes.txt'), 'not VHDL\n');
    });

    setup(async () => {
        delete harness.options.checking;
        delete harness.options.synthesis;
        harness.requests.length = 0;
        harness.lines.length = 0;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(directory, 'design.vhd')));
        await vscode.window.showTextDocument(doc);
    });

    teardown(async () => { await vscode.commands.executeCommand('workbench.action.closeAllEditors'); });
    suiteTeardown(async () => {
        if (directory && path.dirname(directory) === tempRoot) {
            await rm(directory, { recursive: true, force: true });
        }
    });

    function configuration(mode: string): ProcessRequest {
        const executable = process.env.P4B_TEST_NODE_EXECUTABLE;
        assert.ok(executable, 'Test configuration must supply the Node executable, not the VS Code executable.');
        return { executable, args: [path.join(root, 'test-fixtures/mock-process/program.cjs'), mode], cwd: directory };
    }

    for (const kind of ['checking', 'synthesis'] as const) {
        const command = `vhdl-course-workbench-vivado.run${kind === 'checking' ? 'Checking' : 'Synthesis'}`;
        for (const mode of ['success', 'failure', 'missing', 'stderr'] as const) {
            test(`${kind} command reports ${mode} through the real runner and Output channel`, async () => {
                const request = configuration(mode);
                if (mode === 'missing') {
                    request.executable = path.join(directory, 'missing-tool.exe');
                }
                harness.options[kind] = request;
                await vscode.commands.executeCommand(command);
                assert.deepEqual(harness.requests, [request]);
                const report = harness.lines.join('\n');
                assert.ok(report.includes(`VIVADO ${kind.toUpperCase()}`));
                assert.ok(report.includes(path.join(directory, 'design.vhd')));
                assert.doesNotMatch(report, /not configured|not yet implemented/);
                if (mode === 'missing') {
                    assert.match(report, /could not start.*ENOENT/);
                    assert.match(report, /executable or working directory not found/);
                    assert.doesNotMatch(report, /completed successfully/);
                } else if (mode === 'failure') {
                    assert.match(report, /failed \(exit code 7\)/);
                    assert.match(report, /--- stdout ---\nstarted/);
                    assert.match(report, /--- stderr ---\nmock stage failed/);
                    assert.doesNotMatch(report, /completed successfully/);
                } else {
                    assert.match(report, /Configured program completed successfully \(exit code 0\)/);
                    assert.ok(report.includes(mode === 'stderr' ? '--- stderr ---\nwarning only' : '--- stdout ---\ncompleted'));
                }
            });
        }

        test(`${kind} remains unconfigured even when the other command has configuration`, async () => {
            harness.options[kind === 'checking' ? 'synthesis' : 'checking'] = configuration('success');
            await vscode.commands.executeCommand(command);
            assert.equal(harness.requests.length, 0);
            assert.deepEqual(harness.lines, [
                `VIVADO ${kind.toUpperCase()}`, '---------------------------',
                'File: ' + path.join(directory, 'design.vhd'),
                'VHDL file recognized successfully.',
                kind === 'checking' ? 'Vivado execution not yet implemented.' : 'Vivado synthesis has not yet been implemented.',
                'Vivado workflow is not configured. Awaiting the official tool configuration and approved procedure.'
            ]);
        });

        for (const selection of ['non-vhdl', 'untitled', 'no-editor']) {
            test(`${kind} rejects ${selection} before invoking its configured runner`, async () => {
                harness.options[kind] = configuration('success');
                if (selection === 'no-editor') {
                    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
                } else {
                    const doc = selection === 'untitled'
                        ? await vscode.workspace.openTextDocument({ language: 'vhdl' })
                        : await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(directory, 'notes.txt')));
                    await vscode.window.showTextDocument(doc);
                }
                harness.lines.push('previous output');
                await vscode.commands.executeCommand(command);
                assert.equal(harness.requests.length, 0);
                assert.deepEqual(harness.lines, ['previous output']);
            });
        }
    }
});
