import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { CheckingInput, validateCheckingInput } from '../../vivado/checkingInput';

function savedFile(filePath: string): CheckingInput {
    return { isUntitled: false, uri: { scheme: 'file', fsPath: filePath } };
}

for (const filePath of [
    'C:\\course\\design.vhd',
    'C:\\course\\design.vhdl',
    'C:\\course\\DESIGN.VHD',
    'C:\\course\\design.VhDl',
    'C:\\course project\\nested folder\\design.vhdl',
    'C:\\course\\circuit.v1.vhd'
]) {
    test(`accepts saved local VHDL file: ${filePath}`, () => {
        assert.deepEqual(validateCheckingInput(savedFile(filePath)), { valid: true, filePath });
    });
}

test('rejects an absent active editor', () => {
    assert.deepEqual(validateCheckingInput(undefined), {
        valid: false, message: 'Please open a saved VHDL file.'
    });
});

test('rejects an untitled document even with a VHDL filename', () => {
    assert.deepEqual(validateCheckingInput({ ...savedFile('design.vhd'), isUntitled: true }), {
        valid: false, message: 'Please open a saved VHDL file.'
    });
});

for (const scheme of ['untitled', 'vscode-remote', 'git']) {
    test(`rejects a non-local document: ${scheme}`, () => {
        assert.deepEqual(validateCheckingInput({
            isUntitled: false, uri: { scheme, fsPath: 'design.vhdl' }
        }), { valid: false, message: 'Please open a saved VHDL file.' });
    });
}

for (const filePath of ['design.txt', 'design.v', 'design', 'design.vh', 'design.vhd.bak', 'folder.vhdl/design.txt']) {
    test(`rejects a non-VHDL filename: ${filePath}`, () => {
        assert.deepEqual(validateCheckingInput(savedFile(filePath)), {
            valid: false, message: 'This is not a VHDL file.'
        });
    });
}

test('reports the saved-file error before the filename error', () => {
    assert.deepEqual(validateCheckingInput({ ...savedFile('notes.txt'), isUntitled: true }), {
        valid: false, message: 'Please open a saved VHDL file.'
    });
});

test('preserves acceptance of previously saved documents with unsaved edits', () => {
    const document = { ...savedFile('design.vhd'), isDirty: true };
    assert.deepEqual(validateCheckingInput(document), { valid: true, filePath: 'design.vhd' });
});
