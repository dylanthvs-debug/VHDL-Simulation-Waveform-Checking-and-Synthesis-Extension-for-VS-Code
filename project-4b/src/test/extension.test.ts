import * as assert from 'assert';

import * as vscode from 'vscode';

// This host contains P4B only: activation exercises registerP4B without P4A.
suite('Standalone P4B registration', () => {
	test('activation registers the existing checking command through P4B', async () => {
		const extension = vscode.extensions.all.find(
			candidate => candidate.packageJSON.name === 'vhdl-course-workbench-vivado'
		);
		assert.ok(extension, 'The development extension must be installed in the test host.');
		await extension.activate();
		assert.strictEqual(extension.isActive, true);
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('vhdl-course-workbench-vivado.runChecking'));
		// Executing also detects a missing handler, even if package.json contributes the command.
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await vscode.commands.executeCommand('vhdl-course-workbench-vivado.runChecking');
	});

	test('contributes and registers the synthesis command', async () => {
		const extension = vscode.extensions.all.find(
			candidate => candidate.packageJSON.name === 'vhdl-course-workbench-vivado'
		);
		assert.ok(extension);
		await extension.activate();
		const commandId = 'vhdl-course-workbench-vivado.runSynthesis';
		assert.ok(extension.packageJSON.contributes.commands.some(
			(command: { command: string; title: string }) =>
				command.command === commandId && command.title === 'Vivado: Run Synthesis'
		));
		assert.ok((await vscode.commands.getCommands(true)).includes(commandId));
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		await vscode.commands.executeCommand(commandId);
	});
});
