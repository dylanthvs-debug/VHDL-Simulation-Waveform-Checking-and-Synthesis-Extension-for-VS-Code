import * as assert from 'assert';
import * as vscode from 'vscode';

// Runs inside a VS Code extension host (`npm test`). Needs no GHDL or Surfer.
const PACKAGE_NAME = 'vhdl-simulation-synthesis-extenstion';

suite('P4A in the VS Code extension host (DC-A1, SSA-A2)', () => {
    suiteSetup(async () => {
        const extension = vscode.extensions.all.find((e) => e.packageJSON?.name === PACKAGE_NAME);
        assert.ok(extension, 'the P4A extension is loaded in the test host');
        await extension.activate();
    });

    test('EH-P4A-01 registers the Run GHDL Simulation command', async () => {
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('p4a.runSimulation'));
    });

    test('EH-P4A-02 with no folder open, the command reports a configuration failure instead of throwing', async function () {
        if (vscode.workspace.workspaceFolders?.length) {
            this.skip();
        }
        const result = await vscode.commands.executeCommand<{ ok: boolean; failedStage?: string } | undefined>('p4a.runSimulation');

        assert.ok(result, 'the command returns its result');
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.failedStage, 'configuration');
    });
});
