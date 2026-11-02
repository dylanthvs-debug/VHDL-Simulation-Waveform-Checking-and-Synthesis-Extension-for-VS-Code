import * as assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { runSynthesis } from '../vivado/synthesis';

suite('Synthesis selection and placeholder output', () => {
    const temporaryRoot = path.resolve(__dirname, '../../.vscode-test/tmp');
    let directory: string;

    suiteSetup(async () => {
        await mkdir(temporaryRoot, { recursive: true });
        directory = await mkdtemp(path.join(temporaryRoot, 'synthesis '));
    });

    teardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });

    suiteTeardown(async () => {
        if (directory && path.dirname(path.resolve(directory)) === temporaryRoot) {
            await rm(directory, { recursive: true, force: true });
        }
    });

    function captureOutput() {
        const calls: unknown[] = [];
        return {
            calls,
            clear: () => { calls.push('clear'); },
            appendLine: (line: string) => { calls.push(line); },
            show: (preserveFocus?: boolean | vscode.ViewColumn) => { calls.push({ show: preserveFocus }); }
        };
    }

    async function openSavedFile(name: string) {
        const filePath = path.join(directory, name);
        await writeFile(filePath, '-- Test selection only; no Vivado execution.\n');
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(document);
        return document.uri.fsPath;
    }

    for (const filename of ['design.vhd', 'design.VHDL']) {
        test(`recognizes ${filename} and explicitly reports synthesis is unimplemented`, async () => {
            const filePath = await openSavedFile(filename);
            const output = captureOutput();
            await runSynthesis(output);
            assert.deepEqual(output.calls, [
                'clear', 'VIVADO SYNTHESIS', '---------------------------',
                'File: ' + filePath,
                'VHDL file recognized successfully.',
                'Vivado synthesis has not yet been implemented.',
                'Vivado workflow is not configured. Awaiting the official tool configuration and approved procedure.',
                { show: true }
            ]);
        });
    }

    test('rejects a saved non-VHDL file without changing existing output', async () => {
        await openSavedFile('notes.txt');
        const output = captureOutput();
        await runSynthesis(output);
        assert.deepEqual(output.calls, []);
    });

    test('rejects an untitled VHDL document without changing existing output', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'vhdl' });
        await vscode.window.showTextDocument(document);
        assert.equal(document.isUntitled, true);
        const output = captureOutput();
        await runSynthesis(output);
        assert.deepEqual(output.calls, []);
    });

    test('rejects a missing active editor without changing existing output', async () => {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        assert.equal(vscode.window.activeTextEditor, undefined);
        const output = captureOutput();
        await runSynthesis(output);
        assert.deepEqual(output.calls, []);
    });
});

