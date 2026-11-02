import * as vscode from 'vscode';
import { validateCheckingInput } from './checkingInput';
import { executeWorkflow, notConfiguredMessage, writeWorkflowResult } from './workflow';
import { NodeProcessRunner, ProcessRequest, ProcessRunner } from '../shared/processRunner';

export async function runSynthesis(
    output: Pick<vscode.OutputChannel, 'clear' | 'appendLine' | 'show'>,
    configuration?: ProcessRequest,
    runner: ProcessRunner = new NodeProcessRunner()
): Promise<void> {
    // Synthesis currently uses the same saved, local VHDL selection rules as checking.
    const selection = validateCheckingInput(vscode.window.activeTextEditor?.document);
    if (!selection.valid) {
        vscode.window.showErrorMessage(selection.message);
        return;
    }

    output.clear();
    output.appendLine('VIVADO SYNTHESIS');
    output.appendLine('---------------------------');
    output.appendLine('File: ' + selection.filePath);
    output.appendLine('VHDL file recognized successfully.');
    if (!configuration) {
        output.appendLine('Vivado synthesis has not yet been implemented.');
        output.appendLine(notConfiguredMessage);
        output.show(true);
        return;
    }
    output.show(true);
    writeWorkflowResult(output, await executeWorkflow(configuration, runner));
}
