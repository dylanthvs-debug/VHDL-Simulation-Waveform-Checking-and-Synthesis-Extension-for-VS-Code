/** The document properties needed by checking, independent of the VS Code API. */
export interface CheckingInput {
    isUntitled: boolean;
    uri: {
        scheme: string;
        fsPath: string;
    };
}

export type CheckingInputResult =
    | { valid: true; filePath: string }
    | { valid: false; message: string };

export function validateCheckingInput(input: CheckingInput | undefined): CheckingInputResult {
    if (!input || input.isUntitled || input.uri.scheme !== 'file') {
        return { valid: false, message: 'Please open a saved VHDL file.' };
    }

    if (!/\.vhdl?$/i.test(input.uri.fsPath)) {
        return { valid: false, message: 'This is not a VHDL file.' };
    }

    return { valid: true, filePath: input.uri.fsPath };
}
