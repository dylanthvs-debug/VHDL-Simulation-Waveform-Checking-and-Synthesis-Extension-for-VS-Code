import * as vscode from 'vscode';
import { validateCheckingInput } from './checkingInput';
import { executeWorkflow, notConfiguredMessage, writeWorkflowResult } from './workflow';
import { NodeProcessRunner, ProcessRequest, ProcessRunner } from '../shared/processRunner';

export async function runChecking(
    output: Pick<vscode.OutputChannel, 'clear' | 'appendLine' | 'show'>,
    configuration?: ProcessRequest,
    runner: ProcessRunner = new NodeProcessRunner()
): Promise<void> {

    const selection = validateCheckingInput(vscode.window.activeTextEditor?.document);
    if (!selection.valid) {
        vscode.window.showErrorMessage(selection.message);
        return;
    }

    const filePath = selection.filePath;

    // Display checking information
    output.clear();
    output.appendLine('VIVADO CHECKING');
    output.appendLine('---------------------------');
    output.appendLine('File: ' + filePath);
    output.appendLine('VHDL file recognized successfully.');
    if (!configuration) {
        output.appendLine('Vivado execution not yet implemented.');
        output.appendLine(notConfiguredMessage);
        output.show(true);
        return;
    }

    output.show(true);
    writeWorkflowResult(output, await executeWorkflow(configuration, runner));
}
