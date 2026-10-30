import * as vscode from 'vscode';
import { runChecking } from './vivado/checking';

export function activate(context: vscode.ExtensionContext) {

    const output = vscode.window.createOutputChannel('Vivado Workflow');

    const command = vscode.commands.registerCommand(
        'vhdl-course-workbench-vivado.runChecking',
        () => runChecking(output)
    );

    context.subscriptions.push(command, output);
}

export function deactivate() {}