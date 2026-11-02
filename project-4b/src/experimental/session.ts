import * as vscode from 'vscode';
import { ProcessRunner } from '../shared/processRunner';
import { ExperimentalKind } from './execution';
import { ExperimentalOutcome, runExperimentalCommand } from './commands';

export interface SessionState {
    phase: 'idle' | 'running' | ExperimentalOutcome['status'];
    message: string;
    kind?: ExperimentalKind;
    outcome?: ExperimentalOutcome;
}

/** One P4B session shared by the sidebar and Command Palette. */
export class ExperimentalSession implements vscode.Disposable {
    private readonly changes = new vscode.EventEmitter<SessionState>();
    readonly onDidChange = this.changes.event;
    state: SessionState = { phase: 'idle', message: 'Choose a VHDL file and configure the experimental tool.' };

    constructor(
        private readonly extensionPath: string,
        private readonly output: Pick<vscode.OutputChannel, 'clear' | 'appendLine' | 'show'>,
        private readonly runner: ProcessRunner
    ) {}

    async run(kind: ExperimentalKind, selectedSource?: vscode.Uri): Promise<void> {
        if (this.state.phase === 'running') {
            void vscode.window.showWarningMessage('An experimental P4B run is already active. Wait for it to finish.');
            return;
        }
        if (!vscode.workspace.getConfiguration('p4b.experimental', selectedSource).get<boolean>('enabled', false)) {
            this.setState({ phase: 'failed', kind, message: 'Experimental execution is disabled. Enable it explicitly and save configuration before running.' });
            return;
        }
        this.setState({ phase: 'running', kind, message: `Running experimental ${kind}. Detailed logs will appear after the process exits.` });
        try {
            const outcome = await runExperimentalCommand(kind, this.extensionPath, this.output, this.runner, selectedSource);
            this.setState({ phase: outcome.status, kind, message: outcome.message, outcome });
        } catch (error) {
            this.setState({ phase: 'failed', kind, message: error instanceof Error ? error.message : String(error) });
        }
    }

    private setState(state: SessionState): void { this.state = state; this.changes.fire(state); }
    dispose(): void { this.changes.dispose(); }
}
