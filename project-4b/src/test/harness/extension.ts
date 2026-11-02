// Loaded only by the separate mock extension-host test configuration.
import * as vscode from 'vscode';
import { P4BOptions, registerP4B } from '../../p4b';
import { NodeProcessRunner, ProcessRequest } from '../../shared/processRunner';

export function activate(context: vscode.ExtensionContext) {
    const output = vscode.window.createOutputChannel('Vivado Workflow');
    const lines: string[] = [];
    const requests: ProcessRequest[] = [];
    const nodeRunner = new NodeProcessRunner();
    const options: P4BOptions = {
        runner: { run: request => { requests.push(request); return nodeRunner.run(request); } },
        output: {
            clear: () => { lines.length = 0; output.clear(); },
            appendLine: line => { lines.push(line); output.appendLine(line); },
            show: (focus?: boolean | vscode.ViewColumn) => { output.show(typeof focus === 'boolean' ? focus : true); }
        }
    };
    context.subscriptions.push(output, registerP4B(options));
    return { options, lines, requests };
}
