import * as vscode from 'vscode';

export function runChecking(output: vscode.OutputChannel): void {

    const editor = vscode.window.activeTextEditor;

    // Make sure a saved file is open
    if (!editor || editor.document.isUntitled ||
        editor.document.uri.scheme !== 'file') {
        vscode.window.showErrorMessage('Please open a saved VHDL file.');
        return;
    }

    const filePath = editor.document.uri.fsPath;

    // Check the file extension
    if (!/\.vhdl?$/i.test(filePath)) {
        vscode.window.showErrorMessage('This is not a VHDL file.');
        return;
    }

    // Display checking information
    output.clear();
    output.appendLine('VIVADO CHECKING');
    output.appendLine('---------------------------');
    output.appendLine('File: ' + filePath);
    output.appendLine('VHDL file recognized successfully.');
    output.appendLine('Vivado execution not yet implemented.');

    output.show(true);
}