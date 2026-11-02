import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as util from 'util';

const execPromise = util.promisify(exec);

export function activate(context: vscode.ExtensionContext) {
    //creating a status bar with button to run simulation command
    const runButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,100);
    runButton.text = "$(play) Run GHDL Simulation";
    runButton.command = 'p4a.runSimulation';
    runButton.tooltip = 'Click to run the GHDL simulation';
    runButton.show();
    context.subscriptions.push(runButton);

    // registering the run simulation command defined in package.json
    let disposable = vscode.commands.registerCommand('p4a.runSimulation', async () => {
        
        //wrapping the pipeline in a VSCode progress notification
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Running GHDL Simulation",
            cancellable: false
        }, async (progress) => {
            vscode.window.showInformationMessage('Starting GHDL pipeline...');

        try {
            // Workspace root path
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('Please open a workspace folder containing your VHDL files.');
                return;
            }
            const cwd = workspaceFolders[0].uri.fsPath;

            // Step 1: Analysis (-a) with VHDL-2008 standard
            // Replace design.vhd and testbench.vhd with your course fixture filenames
            await execPromise('ghdl -a --std=08 inverter.vhd inverter_tb.vhd', { cwd });
            
            // Step 2: Elaboration (-e) with VHDL-2008 standard
            await execPromise('ghdl -e --std=08 inverter_tb', { cwd });

            // Step 3: Simulation (-r) and generate VCD waveform with VHDL-2008 standard
            await execPromise('ghdl -r  --std=08 inverter_tb --vcd=waveform.vcd', { cwd });

            vscode.window.showInformationMessage('GHDL simulation completed successfully! Waveform generated.');

        } catch (error: any) {
            // If any stage fails, stop and report the error (M2 requirement)
            vscode.window.showErrorMessage(`GHDL Pipeline Failed: ${error.message}`);
        }
         });

    });
        
    context.subscriptions.push(disposable);
}

export function deactivate() {}