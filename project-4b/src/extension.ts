import * as vscode from 'vscode';
import { registerP4B } from './p4b';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(registerP4B({ experimentalExtensionPath: context.extensionPath }));
}

export function deactivate() {}
