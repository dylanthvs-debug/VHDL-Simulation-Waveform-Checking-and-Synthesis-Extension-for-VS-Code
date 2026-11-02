import * as vscode from 'vscode';
import { ProcessRunner } from '../shared/processRunner';
import { validateCheckingInput } from '../vivado/checkingInput';
import { writeWorkflowResult } from '../vivado/workflow';
import { executeExperimental, ExperimentalKind, ExperimentalRun } from './execution';

export interface ExperimentalOutcome {
    status: 'succeeded' | 'failed' | 'cancelled';
    message: string;
    source?: string;
    run?: ExperimentalRun;
}

export async function runExperimentalCommand(
    kind: ExperimentalKind, extensionPath: string,
    output: Pick<vscode.OutputChannel, 'clear' | 'appendLine' | 'show'>, runner: ProcessRunner,
    selectedSource?: vscode.Uri
): Promise<ExperimentalOutcome> {
    output.clear();
    output.appendLine(`P4B EXPERIMENTAL ${kind.toUpperCase()} - DEVELOPMENT TESTING ONLY`);
    output.appendLine('This procedure is not approved by the course. Real Vivado compatibility is unverified.');
    output.show(true);
    try {
        if (process.platform !== 'win32') { throw new Error('This experimental launcher targets Windows only.'); }
        if (!vscode.workspace.isTrusted) { throw new Error('Open a trusted local workspace before enabling experimental execution.'); }
        // A sidebar selection is authoritative; never fall back to another active editor.
        let document = selectedSource
            ? await vscode.workspace.openTextDocument(selectedSource)
            : vscode.window.activeTextEditor?.document;
        if (!document) {
            const selection = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { VHDL: ['vhd', 'vhdl'] }, title: 'Select the experimental VHDL source' });
            if (!selection?.[0]) {
                output.appendLine('Selection cancelled; nothing executed.');
                return { status: 'cancelled', message: 'Selection cancelled; nothing executed.' };
            }
            document = await vscode.workspace.openTextDocument(selection[0]);
        }
        const input = validateCheckingInput(document);
        if (!input.valid) { throw new Error(input.message); }
        if (document.isDirty) { throw new Error('Save the VHDL file before experimental execution.'); }
        const config = vscode.workspace.getConfiguration('p4b.experimental', document.uri);
        output.appendLine('File: ' + input.filePath);
        output.appendLine('Running the experimental procedure; logs are collected after the process exits.');
        const run = await executeExperimental(kind, {
            executablePath: config.get<string>('executablePath', ''),
            topLevel: config.get<string>('topLevel', ''), part: config.get<string>('part', '')
        }, input.filePath, extensionPath, runner);
        writeWorkflowResult(output, run.result);
        output.appendLine('Run folder (logs, source snapshot, scripts, result): ' + run.directory);
        for (const report of run.reports) { output.appendLine('Artifact: ' + report); }
        return {
            status: run.result.status === 'success' ? 'succeeded' : 'failed',
            message: run.result.message, source: input.filePath, run
        };
    } catch (error) {
        const message = `EXPERIMENTAL configuration/execution error: ${error instanceof Error ? error.message : String(error)}`;
        output.appendLine(message);
        void vscode.window.showErrorMessage(message);
        return { status: 'failed', message, source: selectedSource?.fsPath };
    }
}
