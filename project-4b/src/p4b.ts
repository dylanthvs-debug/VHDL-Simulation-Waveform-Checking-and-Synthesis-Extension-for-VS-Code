import * as vscode from 'vscode';
import { runChecking } from './vivado/checking';
import { runSynthesis } from './vivado/synthesis';
import { NodeProcessRunner, ProcessRequest, ProcessRunner } from './shared/processRunner';
import { ExperimentalSession } from './experimental/session';
import { VivadoWorkflowView } from './ui/vivadoWorkflowView';
import { ExperimentalKind } from './experimental/execution';

export interface P4BOptions {
    /** Runtime resource root; opt-in settings are still required at invocation. */
    experimentalExtensionPath?: string;
    checking?: ProcessRequest;
    synthesis?: ProcessRequest;
    runner?: ProcessRunner;
    /** Optional borrowed channel; the caller owns its disposal. */
    output?: Pick<vscode.OutputChannel, 'clear' | 'appendLine' | 'show'>;
}

/** Register P4B once per extension activation, independently of P4A.
 * Add the returned disposable to the hosting extension's subscriptions.
 */
export function registerP4B(options: P4BOptions = {}): vscode.Disposable {
    const ownedOutput = options.output ? undefined : vscode.window.createOutputChannel('Vivado Workflow');
    const output = options.output ?? ownedOutput!;
    const runner = options.runner ?? new NodeProcessRunner();
    const ui: vscode.Disposable[] = [];
    const session = options.experimentalExtensionPath ? new ExperimentalSession(options.experimentalExtensionPath, output, runner) : undefined;
    if (session && options.experimentalExtensionPath) {
        const provider = new VivadoWorkflowView(vscode.Uri.file(options.experimentalExtensionPath), session, output);
        ui.push(session, provider, vscode.window.registerWebviewViewProvider(VivadoWorkflowView.viewId, provider),
            vscode.commands.registerCommand('vhdl-course-workbench-vivado.openWorkflow', () => vscode.commands.executeCommand('p4b.vivadoWorkflow.focus')));
    }
    const dispatch = async (kind: ExperimentalKind) => {
        if (options.experimentalExtensionPath && vscode.workspace.getConfiguration('p4b.experimental').get<boolean>('enabled', false)) {
            await session!.run(kind);
        } else if (kind === 'checking') { await runChecking(output, options.checking, runner); }
        else { await runSynthesis(output, options.synthesis, runner); }
    };

    const checkingCommand = vscode.commands.registerCommand(
        'vhdl-course-workbench-vivado.runChecking',
        () => dispatch('checking')
    );

    const synthesisCommand = vscode.commands.registerCommand(
        'vhdl-course-workbench-vivado.runSynthesis',
        () => dispatch('synthesis')
    );

    return vscode.Disposable.from(checkingCommand, synthesisCommand, ...ui, ...(ownedOutput ? [ownedOutput] : []));
}
