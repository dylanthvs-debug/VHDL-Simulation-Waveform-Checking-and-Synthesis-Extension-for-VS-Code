import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import * as vscode from 'vscode';
import { ExperimentalSession } from '../experimental/session';
import { VivadoWorkflowView } from '../ui/vivadoWorkflowView';
import { NodeProcessRunner } from '../shared/processRunner';

suite('Vivado sidebar', () => {
    const root = path.resolve(__dirname, '../..');
    const tempRoot = path.join(root, '.vscode-test/tmp');
    const config = () => vscode.workspace.getConfiguration('p4b.experimental');
    const previous = new Map<string, unknown>();
    let directory: string;
    let launcher: string;
    let source: vscode.Uri;
    let session: ExperimentalSession;
    let view: VivadoWorkflowView;
    let lines: string[];
    let calls: number;
    suiteSetup(async () => {
        for (const key of ['enabled', 'executablePath', 'topLevel', 'part']) { previous.set(key, config().inspect(key)?.globalValue); }
        await mkdir(tempRoot, { recursive: true });
        directory = await mkdtemp(path.join(tempRoot, 'sidebar spaced '));
        launcher = path.join(directory, 'mock vivado.cmd');
        await writeFile(launcher, `@echo off\r\n"${process.env.P4B_TEST_NODE_EXECUTABLE}" "${path.join(root, 'test-fixtures/mock-process/vivado.cjs')}" %*\r\nexit /b %errorlevel%\r\n`);
    });
    setup(async () => {
        lines = []; calls = 0;
        const output = { clear: () => { lines = []; }, appendLine: (line: string) => lines.push(line), show: () => {} };
        session = new ExperimentalSession(root, output, { run: request => { calls++; return new NodeProcessRunner().run(request); } });
        source = vscode.Uri.file(path.join(directory, `source-${Date.now()}.vhd`));
        await writeFile(source.fsPath, '-- mock valid');
        view = new VivadoWorkflowView(vscode.Uri.file(root), session, output, { showOpenDialog: async () => [source] });
        for (const [key, value] of Object.entries({ enabled: true, executablePath: launcher, topLevel: 'p4b_sample', part: 'mock-part-only' })) {
            await config().update(key, value, vscode.ConfigurationTarget.Global);
        }
    });
    teardown(async () => { view.dispose(); session.dispose(); await vscode.commands.executeCommand('workbench.action.closeAllEditors'); });
    suiteTeardown(async () => {
        for (const [key, value] of previous) { await config().update(key, value, vscode.ConfigurationTarget.Global); }
        if (path.dirname(directory) === tempRoot) { await rm(directory, { recursive: true, force: true }); }
    });
    for (const kind of ['Checking', 'Synthesis']) {
        test(`${kind} uses browsed source instead of active editor and exposes results`, async () => {
            const other = vscode.Uri.file(path.join(directory, 'other.vhd'));
            await writeFile(other.fsPath, 'y <= a and ;');
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(other));
            await view.handleMessage({ action: 'browseSource' });
            assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, other.fsPath);
            const phases: string[] = [];
            session.onDidChange(state => phases.push(state.phase));
            await view.handleMessage({ action: 'run' + kind });
            const state = await view.snapshot();
            assert.equal(state.status.phase, 'succeeded');
            assert.equal(state.status.source, source.fsPath);
            assert.deepEqual(phases, ['running', 'succeeded']);
            assert.equal(calls, 1);
            assert.ok(lines.some(line => line.includes('EXPERIMENTAL')));
            assert.ok(state.artifacts.some(item => item.name === (kind === 'Checking' ? 'syntax.rpt' : 'utilization.rpt')));
            const log = state.artifacts.find(item => item.name === 'stdout.txt')!;
            await view.handleMessage({ action: 'openArtifact', id: log.id });
            assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, path.join(session.state.outcome!.run!.directory, 'stdout.txt'));
        });
        test(`${kind} failure appears in sidebar`, async () => {
            await writeFile(source.fsPath, 'y <= a and ;');
            await view.selectSource(source);
            await view.handleMessage({ action: 'run' + kind });
            assert.equal((await view.snapshot()).status.phase, 'failed');
        });
    }
    test('disabled configuration never executes', async () => {
        await config().update('enabled', false, vscode.ConfigurationTarget.Global);
        await view.selectSource(source);
        await view.handleMessage({ action: 'runChecking' });
        assert.equal(calls, 0);
        assert.match((await view.snapshot()).status.message, /disabled/);
    });
    test('missing source does not fall back to the active editor', async () => {
        await view.handleMessage({ action: 'runChecking' });
        assert.equal(calls, 0);
        assert.match((await view.snapshot()).error, /Choose a VHDL/);
    });
    test('missing executable produces a useful failure', async () => {
        await config().update('executablePath', path.join(directory, 'missing.exe'), vscode.ConfigurationTarget.Global);
        await view.selectSource(source);
        await view.handleMessage({ action: 'runChecking' });
        assert.equal((await view.snapshot()).status.phase, 'failed');
        assert.match((await view.snapshot()).status.message, /not found|ENOENT|exist/i);
    });
    test('incomplete synthesis configuration prevents execution', async () => {
        await config().update('part', '', vscode.ConfigurationTarget.Global);
        await view.selectSource(source);
        await view.handleMessage({ action: 'runSynthesis' });
        assert.equal(calls, 0);
        assert.match((await view.snapshot()).status.message, /part/i);
    });
    test('configuration save respects explicit disabled and enabled choices', async () => {
        const fields = { action: 'save', executablePath: launcher, topLevel: 'p4b_sample', part: 'mock-part-only' };
        await view.handleMessage({ ...fields, enabled: false });
        assert.equal(config().get('enabled'), false);
        await view.handleMessage({ ...fields, enabled: true });
        assert.equal(config().get('enabled'), true);
        assert.equal((await view.snapshot()).error, '');
    });
    test('rejects invalid file extensions and arbitrary artifact requests', async () => {
        await assert.rejects(view.selectSource(vscode.Uri.file(path.join(directory, 'bad.txt'))));
        await view.handleMessage({ action: 'openArtifact', id: -1, path: source.fsPath });
        assert.match((await view.snapshot()).error, /Invalid artifact/);
    });
    test('open sidebar command is registered', async () => {
        assert.ok((await vscode.commands.getCommands()).includes('vhdl-course-workbench-vivado.openWorkflow'));
        await vscode.commands.executeCommand('vhdl-course-workbench-vivado.openWorkflow');
    });
});
