import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseGhdlOutput } from './ghdlDiagnostics';
import { NodeProcessRunner } from './processRunner';
import { launchSurfer } from './surferLauncher';
import { expandEnvironmentVariables, readToolManifest, resolveTool, ResolvedTool, ToolManifest } from './toolConfig';
import {
    configurationFailure,
    formatRunLog,
    formatStageRecord,
    runSimulationWorkflow,
    STAGE_LABELS,
    StageRecord,
    WorkflowResult,
} from './workflow';

/**
 * VS Code side of P4A: status-bar button, command, progress, output channel, Problems panel
 * and run log. The shared extension shell only needs to call registerP4A(context).
 */

export const RUN_SIMULATION_COMMAND = 'p4a.runSimulation';
export const LOG_RELATIVE_PATH = path.join('logs', 'p4a-simulation-log.txt');

const BUTTON_IDLE = '$(play) Run GHDL Simulation';
const BUTTON_BUSY = '$(sync~spin) Running GHDL Simulation';

export function registerP4A(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel('P4A GHDL & Surfer');
    const diagnostics = vscode.languages.createDiagnosticCollection('p4a-ghdl');
    const extensionVersion = String(context.extension.packageJSON?.version ?? 'unknown');

    const runButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    runButton.text = BUTTON_IDLE;
    runButton.command = RUN_SIMULATION_COMMAND;
    runButton.tooltip = 'Analyse, elaborate and simulate with GHDL, then open the waveform in Surfer';
    runButton.show();

    let running = false;
    const command = vscode.commands.registerCommand(RUN_SIMULATION_COMMAND, async (): Promise<WorkflowResult | undefined> => {
        if (running) {
            void vscode.window.showWarningMessage('A GHDL simulation is already running.');
            return undefined;
        }
        running = true;
        runButton.text = BUTTON_BUSY;
        try {
            return await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'GHDL simulation', cancellable: false },
                (progress) => runOnce(output, diagnostics, progress, extensionVersion)
            );
        } finally {
            running = false;
            runButton.text = BUTTON_IDLE;
        }
    });

    context.subscriptions.push(output, diagnostics, runButton, command);
}

type Progress = vscode.Progress<{ message?: string; increment?: number }>;

async function runOnce(
    output: vscode.OutputChannel,
    diagnostics: vscode.DiagnosticCollection,
    progress: Progress,
    extensionVersion: string
): Promise<WorkflowResult> {
    diagnostics.clear();
    output.clear();

    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
        const result = configurationFailure('Open the folder that contains your VHDL files (File > Open Folder), then run the simulation again.');
        output.appendLine(formatStageRecord(result.stages[0]));
        notify(result, output, undefined);
        return result;
    }
    const root = folder.uri.fsPath;
    const config = vscode.workspace.getConfiguration('p4a', folder.uri);

    const finishEarly = async (message: string, tools?: { ghdl: ResolvedTool; surfer: ResolvedTool }): Promise<WorkflowResult> => {
        const result = configurationFailure(message);
        output.appendLine(formatStageRecord(result.stages[0]));
        const logPath = await writeRunLog(output, root, formatRunLog(result, { extensionVersion, workspaceRoot: root, ...tools }));
        notify(result, output, logPath);
        return result;
    };

    let manifest: ToolManifest | undefined;
    const manifestSetting = expandEnvironmentVariables(config.get<string>('toolManifestPath', '').trim());
    if (manifestSetting !== '') {
        try {
            manifest = await readToolManifest(path.resolve(root, manifestSetting));
        } catch (err) {
            return finishEarly(`The Local EDA Tool Manifest could not be used. ${(err as Error).message}`);
        }
    }
    const ghdl = resolveTool('ghdl', config.get<string>('ghdlPath'), manifest);
    const surfer = resolveTool('surfer', config.get<string>('surferPath'), manifest);

    const sourceFiles = (config.get<string[]>('sourceFiles') ?? []).map((f) => f.trim()).filter((f) => f !== '');
    const testbenchEntity = (config.get<string>('testbenchEntity') ?? '').trim();
    const waveformFile = (config.get<string>('waveformFile') ?? '').trim();
    if (sourceFiles.length === 0 || testbenchEntity === '' || waveformFile === '') {
        return finishEarly('p4a.sourceFiles, p4a.testbenchEntity and p4a.waveformFile must not be empty.', { ghdl, surfer });
    }

    output.appendLine(`Workspace: ${root}`);
    output.appendLine(`GHDL: ${ghdl.executable} (${ghdl.description})`);
    output.appendLine(`Surfer: ${surfer.executable} (${surfer.description})`);
    output.appendLine('');

    const result = await runSimulationWorkflow(
        { workspaceRoot: root, ghdl, surfer, sourceFiles, testbenchEntity, waveformFile },
        {
            runner: new NodeProcessRunner(),
            launchViewer: (executable, waveformPath, toolDescription) => launchSurfer(executable, waveformPath, { toolDescription }),
            onStageStart: (stage, commandLine) => {
                progress.report({ message: STAGE_LABELS[stage] });
                output.appendLine(`> ${STAGE_LABELS[stage]}: ${commandLine}`);
            },
            onStageEnd: (record) => output.appendLine(`${formatStageRecord(record)}\n`),
        }
    );

    for (const warning of result.warnings) {
        output.appendLine(`Warning: ${warning}`);
    }
    output.appendLine(result.ok ? `RESULT: PASSED. ${result.message}` : `RESULT: FAILED at ${STAGE_LABELS[result.failedStage ?? 'configuration']}.`);

    publishDiagnostics(diagnostics, root, result.stages);
    const logPath = await writeRunLog(output, root, formatRunLog(result, { extensionVersion, workspaceRoot: root, ghdl, surfer }));
    if (logPath) {
        output.appendLine(`Log: ${logPath}`);
    }
    notify(result, output, logPath);
    return result;
}

/** GHDL file:line:col messages go to the Problems panel. */
function publishDiagnostics(collection: vscode.DiagnosticCollection, root: string, stages: StageRecord[]): void {
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const stage of stages) {
        const text = `${stage.stderr ?? ''}\n${stage.stdout ?? ''}`;
        for (const d of parseGhdlOutput(text)) {
            const file = path.resolve(root, d.file);
            const line = Math.max(d.line - 1, 0);
            const column = Math.max(d.column - 1, 0);
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(line, column, line, column + 1),
                d.message,
                d.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error
            );
            diagnostic.source = `GHDL (${STAGE_LABELS[stage.stage]})`;
            const list = byFile.get(file) ?? [];
            list.push(diagnostic);
            byFile.set(file, list);
        }
    }
    for (const [file, list] of byFile) {
        collection.set(vscode.Uri.file(file), list);
    }
}

async function writeRunLog(output: vscode.OutputChannel, root: string, text: string): Promise<string | undefined> {
    const logPath = path.join(root, LOG_RELATIVE_PATH);
    try {
        await fs.mkdir(path.dirname(logPath), { recursive: true });
        await fs.writeFile(logPath, text, 'utf8');
        return logPath;
    } catch (err) {
        output.appendLine(`Warning: the run log could not be written to ${logPath}: ${(err as Error).message}`);
        return undefined;
    }
}

/** Notifications are not awaited, so an unanswered message never blocks the command. */
function notify(result: WorkflowResult, output: vscode.OutputChannel, logPath: string | undefined): void {
    if (result.ok) {
        void vscode.window
            .showInformationMessage(`GHDL simulation passed. Surfer opened ${path.basename(result.waveformPath)}.`, 'Show Output')
            .then((choice) => {
                if (choice === 'Show Output') {
                    output.show(true);
                }
            });
        return;
    }

    output.show(true);
    const label = STAGE_LABELS[result.failedStage ?? 'configuration'];
    const actions = logPath ? ['Show Output', 'Open Log'] : ['Show Output'];
    void vscode.window.showErrorMessage(`${label} failed: ${result.message}`, ...actions).then(async (choice) => {
        if (choice === 'Show Output') {
            output.show(true);
        } else if (choice === 'Open Log' && logPath) {
            const document = await vscode.workspace.openTextDocument(logPath);
            await vscode.window.showTextDocument(document);
        }
    });
}
