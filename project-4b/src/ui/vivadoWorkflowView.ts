import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import { ExperimentalSession } from '../experimental/session';
import { validateExperimentalSettings } from '../experimental/execution';
import { validateCheckingInput } from '../vivado/checkingInput';

export class VivadoWorkflowView implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewId = 'p4b.vivadoWorkflow';
    private view?: vscode.WebviewView;
    private selected?: vscode.Uri;
    private error = '';
    private artifacts: { name: string; file: string }[] = [];
    private readonly disposables: vscode.Disposable[] = [];
    private messageSubscription?: vscode.Disposable;
    private publication = 0;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly session: ExperimentalSession,
        private readonly output: Pick<vscode.OutputChannel, 'show'>,
        private readonly dialogs: Pick<typeof vscode.window, 'showOpenDialog'> = vscode.window
    ) {
        this.disposables.push(session.onDidChange(() => { void this.publish(); }));
        this.disposables.push(vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('p4b.experimental')) { void this.publish(); }
        }));
    }

    resolveWebviewView(view: vscode.WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')] };
        view.webview.html = this.html(view.webview);
        this.messageSubscription?.dispose();
        this.messageSubscription = view.webview.onDidReceiveMessage(message => { void this.handleMessage(message); });
    }

    async selectSource(uri: vscode.Uri): Promise<void> {
        const input = validateCheckingInput({ isUntitled: false, uri });
        if (!input.valid) { throw new Error(input.message); }
        if (!(await stat(uri.fsPath)).isFile()) { throw new Error('Select a VHDL file, not a directory.'); }
        this.selected = uri;
        this.error = '';
    }

    /** Narrow host-owned actions; paths for opening artifacts never come from the webview. */
    async handleMessage(message: unknown): Promise<void> {
        try {
            if (!message || typeof message !== 'object') { throw new Error('Invalid sidebar action.'); }
            const data = message as Record<string, unknown>;
            const action = data.action;
            if (typeof action !== 'string') { throw new Error('Invalid sidebar action.'); }
            if (this.session.state.phase === 'running' && !['ready', 'showOutput'].includes(action)) {
                throw new Error('Wait for the current run to finish before changing configuration or starting another run.');
            }
            this.error = '';
            if (action === 'browseSource') {
                const uris = await this.dialogs.showOpenDialog({ canSelectMany: false, filters: { VHDL: ['vhd', 'vhdl'] }, title: 'Select the VHDL source to run' });
                if (uris?.[0]) { await this.selectSource(uris[0]); }
            } else if (action === 'useActive') {
                const document = vscode.window.activeTextEditor?.document;
                const input = validateCheckingInput(document);
                if (!input.valid || !document) { throw new Error(input.valid ? 'Open a saved VHDL file.' : input.message); }
                await this.selectSource(document.uri);
            } else if (action === 'browseExecutable') {
                const uris = await this.dialogs.showOpenDialog({ canSelectMany: false, filters: { 'Vivado launcher': ['bat', 'cmd', 'exe'] }, title: 'Select your installed Vivado launcher' });
                if (uris?.[0]) { await this.view?.webview.postMessage({ type: 'executablePicked', value: uris[0].fsPath }); }
            } else if (action === 'save') {
                if (typeof data.enabled !== 'boolean' || !['executablePath', 'topLevel', 'part'].every(key => typeof data[key] === 'string' && (data[key] as string).length <= 4096)) {
                    throw new Error('Invalid configuration fields.');
                }
                const values = { executablePath: (data.executablePath as string).trim(), topLevel: (data.topLevel as string).trim(), part: (data.part as string).trim() };
                if (data.enabled) { validateExperimentalSettings(values, 'checking'); }
                const config = vscode.workspace.getConfiguration('p4b.experimental', this.selected);
                // Disable first when requested; never infer opt-in from another field.
                if (!data.enabled) { await config.update('enabled', false, vscode.ConfigurationTarget.Global); }
                await config.update('executablePath', values.executablePath, vscode.ConfigurationTarget.Global);
                const target = this.selected && vscode.workspace.getWorkspaceFolder(this.selected)
                    ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
                for (const key of ['topLevel', 'part'] as const) { await config.update(key, values[key], target); }
                if (data.enabled) { await config.update('enabled', true, vscode.ConfigurationTarget.Global); }
                await this.publish(true);
                return;
            } else if (action === 'runChecking' || action === 'runSynthesis') {
                if (!this.selected) { throw new Error('Choose a VHDL file using Browse or Use Active File.'); }
                await this.session.run(action === 'runChecking' ? 'checking' : 'synthesis', this.selected);
            } else if (action === 'showOutput') {
                this.output.show(true);
            } else if (action === 'openArtifact') {
                if (!Number.isInteger(data.id) || (data.id as number) < 0) { throw new Error('Invalid artifact selection.'); }
                const artifact = this.artifacts[data.id as number];
                if (!artifact || !(await this.isRunFile(artifact.file))) { throw new Error('This artifact is unavailable for the current run.'); }
                const uri = vscode.Uri.file(artifact.file);
                if (artifact.name.endsWith('.dcp')) { await vscode.commands.executeCommand('revealFileInOS', uri); }
                else { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: true }); }
            } else if (action === 'revealRun') {
                const directory = this.session.state.outcome?.run?.directory;
                if (!directory || !(await this.isRunFile(path.join(directory, 'result.json')))) { throw new Error('No completed run folder is available.'); }
                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.join(directory, 'result.json')));
            } else if (action !== 'ready') { throw new Error('Unknown sidebar action.'); }
        } catch (error) {
            this.error = error instanceof Error ? error.message : String(error);
        }
        await this.publish();
    }

    private async isRunFile(file: string): Promise<boolean> {
        const directory = this.session.state.outcome?.run?.directory;
        if (!directory || path.dirname(file) !== directory) { return false; }
        try {
            return path.dirname(await realpath(file)) === await realpath(directory) && (await stat(file)).isFile();
        } catch { return false; }
    }

    async snapshot() {
        const config = vscode.workspace.getConfiguration('p4b.experimental', this.selected);
        const run = this.session.state.outcome?.run;
        const artifacts: { name: string; file: string }[] = [];
        if (run) {
            for (const name of ['result.json', 'stdout.txt', 'stderr.txt', 'vivado.log', 'vivado.jou', 'syntax.rpt', 'utilization.rpt', 'version.txt', 'failure.txt', 'post_synth.dcp']) {
                const file = path.join(run.directory, name);
                if (await this.isRunFile(file)) { artifacts.push({ name, file }); }
            }
        }
        this.artifacts = artifacts;
        return {
            selectedFile: this.selected?.fsPath ?? '', error: this.error,
            configuration: { enabled: config.get<boolean>('enabled', false), executablePath: config.get<string>('executablePath', ''), topLevel: config.get<string>('topLevel', ''), part: config.get<string>('part', '') },
            status: { phase: this.session.state.phase, message: this.session.state.message, kind: this.session.state.kind,
                source: this.session.state.outcome?.source, exitCode: run?.result.process?.exitCode ?? null },
            artifacts: artifacts.map((item, id) => ({ id, name: item.name })), hasRun: Boolean(run)
        };
    }

    private async publish(saved = false): Promise<void> {
        const publication = ++this.publication;
        const state = await this.snapshot();
        if (publication === this.publication) { await this.view?.webview.postMessage({ type: 'state', state, saved }); }
    }

    private html(webview: vscode.Webview): string {
        const nonce = randomBytes(24).toString('hex');
        const css = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media/vivadoWorkflow.css'));
        const js = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media/vivadoWorkflow.js'));
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${css}"><title>Vivado Workflow</title></head><body>
<header><span class="badge">EXPERIMENTAL</span><h1>Vivado Workflow</h1><p>Check and synthesize one saved VHDL file.</p><p class="muted">Development prototype. Not an approved course workflow.</p></header>
<main><fieldset id="controls"><legend class="sr-only">Workflow controls</legend>
<section><h2>1 <span>Choose your source</span></h2><label for="source">Selected VHDL file</label><textarea id="source" rows="2" readonly placeholder="No file selected" aria-describedby="sourceHelp"></textarea>
<div class="row"><button id="browseSource" type="button">Browse…</button><button id="useActive" class="secondary" type="button">Use Active File</button></div><p id="sourceHelp" class="hint">Runs use this file, even when another editor is open.</p></section>
<section><h2>2 <span>Configure Vivado</span></h2><label for="executablePath">Vivado launcher</label><input id="executablePath" type="text" spellcheck="false" placeholder="Select vivado.bat, .cmd or .exe"><button id="browseExecutable" class="secondary" type="button">Browse for launcher…</button>
<label for="topLevel">Top-level entity</label><input id="topLevel" type="text" spellcheck="false" placeholder="For example: p4b_sample" aria-describedby="synthesisHelp">
<label for="part">FPGA part</label><input id="part" type="text" spellcheck="false" placeholder="Exact installed part name" aria-describedby="synthesisHelp"><p id="synthesisHelp" class="hint">Entity and part are required only for synthesis. No device is chosen automatically.</p>
<label class="check"><input id="enabled" type="checkbox"><span>Enable experimental execution</span></label><p class="hint">Opt in only when you are ready to run the development Tcl procedures.</p>
<button id="save" class="secondary" type="button">Save Configuration</button><p id="saveState" class="hint" role="status">Settings apply after saving.</p></section>
<section><h2>3 <span>Run your workflow</span></h2><div class="row"><button id="runChecking" type="button" disabled>Run Checking</button><button id="runSynthesis" type="button" disabled>Run Synthesis</button></div><p id="runHelp" class="hint">Select a file and explicitly enable execution to begin.</p></section></fieldset>
<p id="error" class="error" role="alert" hidden></p>
<section class="results" aria-labelledby="resultsTitle"><h2 id="resultsTitle">Results</h2><div id="status" role="status" aria-live="polite" aria-atomic="true"><strong id="phase">Ready</strong><p id="summary">Choose a source to begin.</p></div><p id="resultSource" class="hint path"></p><p id="exitCode" class="hint"></p><div class="row"><button id="showOutput" class="secondary" type="button">Show Output</button><button id="revealRun" class="secondary" type="button" disabled>Open Run Folder</button></div><div id="artifacts" aria-label="Logs and generated reports"></div></section>
<footer>Completion means the experimental procedure finished—not official acceptance. Real Vivado compatibility still requires testing.</footer></main><script nonce="${nonce}" src="${js}"></script></body></html>`;
    }

    dispose(): void { this.messageSubscription?.dispose(); this.disposables.forEach(item => item.dispose()); }
}
