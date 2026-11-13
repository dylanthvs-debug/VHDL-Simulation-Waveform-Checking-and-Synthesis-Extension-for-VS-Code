import * as vscode from 'vscode';
import { registerP4A } from './p4a/register';

// P4A entry point. In the combined Group 4 extension, the shared activate() calls
// registerP4A(context) next to the P4B registration.
export function activate(context: vscode.ExtensionContext): void {
    registerP4A(context);
}

export function deactivate(): void {}
