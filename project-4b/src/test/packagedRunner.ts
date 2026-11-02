import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';

// Standalone test-electron entry point, intentionally not discovered by Mocha/Node.
export async function run(): Promise<void> {
    const extension = vscode.extensions.getExtension('ecng2007-local.vhdl-course-workbench-vivado');
    assert.ok(extension);
    assert.equal(path.resolve(extension.extensionPath), path.resolve(process.env.P4B_PACKAGED_EXTENSION_PATH!));
    await extension.activate();
    for (const file of ['vivadoWorkflow.js', 'vivadoWorkflow.css', 'vivado.svg']) {
        assert.ok((await stat(path.join(extension.extensionPath, 'media', file))).size > 0);
    }
    await vscode.commands.executeCommand('vhdl-course-workbench-vivado.openWorkflow');
    for (const file of ['common.tcl', 'checking.tcl', 'synthesis.tcl']) {
        assert.ok((await stat(path.join(extension.extensionPath, 'resources/experimental', file))).size > 0);
    }
    assert.equal(vscode.workspace.getConfiguration('p4b.experimental').get('enabled'), false);
    assert.equal(extension.packageJSON.devDependencies, undefined);
    console.log('PACKAGE CHECK 1 PASS: extracted runtime activates; Tcl resources present; experimental mode disabled.');

    const node = process.env.P4B_TEST_NODE_EXECUTABLE!;
    const testRoot = process.env.P4B_TEST_ROOT!;
    const launcher = path.join(path.dirname(extension.extensionPath), 'mock launcher.cmd');
    await writeFile(launcher, `@echo off\r\n"${node}" "${path.join(testRoot, 'test-fixtures/mock-process/vivado.cjs')}" %*\r\nexit /b %errorlevel%\r\n`);
    const config = vscode.workspace.getConfiguration('p4b.experimental');
    await config.update('executablePath', launcher, vscode.ConfigurationTarget.Global);
    await config.update('topLevel', 'p4b_sample', vscode.ConfigurationTarget.Global);
    await config.update('part', 'mock-part-only', vscode.ConfigurationTarget.Global);
    await config.update('enabled', true, vscode.ConfigurationTarget.Global);
    const source = path.join(extension.extensionPath, 'samples/experimental/valid.vhd');
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(source));
    await vscode.window.showTextDocument(doc);
    for (const [index, kind] of ['Checking', 'Synthesis'].entries()) {
        await vscode.commands.executeCommand('vhdl-course-workbench-vivado.run' + kind);
        const runRoot = path.join(path.dirname(source), '.p4b-experimental');
        const folders = (await readdir(runRoot)).filter(name => name.startsWith(kind.toLowerCase() + '-'));
        assert.equal(folders.length, 1);
        const result = JSON.parse(await readFile(path.join(runRoot, folders[0], 'result.json'), 'utf8'));
        assert.equal(result.status, 'success');
        assert.equal(result.experimental, true);
        console.log(`PACKAGE CHECK ${index + 2} PASS: extracted ${kind} command executes mock and verifies artifacts.`);
    }
    await config.update('enabled', false, vscode.ConfigurationTarget.Global);
    console.log('3 packaged-runtime checks passed. No real Vivado execution or VSIX installation performed.');
}
