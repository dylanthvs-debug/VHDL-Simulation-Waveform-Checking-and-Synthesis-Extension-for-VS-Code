/**
 * Turns GHDL's own messages into file/line diagnostics for the Problems panel (FR-SH1).
 * This only re-formats tool output; the extension does not analyse VHDL itself (LIM 6).
 *
 * Handled GHDL formats:
 *   inverter.vhd:13:1:error: ';' is expected instead of "end"
 *   inverter.vhd:5:3:warning: ...
 *   inverter_tb.vhd:33:9:@10ns:(assertion failure): Inverter failed for I=0
 * Notes and reports (e.g. "(report note): ALL TESTS PASSED") are not treated as problems.
 */

export type ToolDiagnosticSeverity = 'error' | 'warning';

export interface ToolDiagnostic {
    /** File name as printed by GHDL (normally relative to the workspace folder). */
    file: string;
    /** 1-based line number. */
    line: number;
    /** 1-based column number. */
    column: number;
    severity: ToolDiagnosticSeverity;
    message: string;
}

const LOCATION = /^(.+?\.vhdl?):(\d+):(\d+):\s*(.*)$/i;
const PREFIXED = /^(error|warning|note|info)\s*:\s*(.*)$/i;
const ASSERTION = /^\((?:assertion|report)\s+(failure|error|warning|note)\)\s*:?\s*(.*)$/i;

export function parseGhdlOutput(text: string): ToolDiagnostic[] {
    const diagnostics: ToolDiagnostic[] = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const match = LOCATION.exec(rawLine.trim());
        if (!match) {
            continue;
        }
        // Drop the simulation time stamp, e.g. "@10ns:".
        const rest = match[4].replace(/^@[^:]*:\s*/, '');
        let severity: string;
        let message: string;
        const prefixed = PREFIXED.exec(rest);
        const assertion = ASSERTION.exec(rest);
        if (prefixed) {
            severity = prefixed[1].toLowerCase();
            message = prefixed[2];
        } else if (assertion) {
            severity = assertion[1].toLowerCase();
            message = rest;
        } else {
            // Older GHDL releases print analysis errors without a severity word.
            severity = 'error';
            message = rest;
        }
        if (severity !== 'error' && severity !== 'failure' && severity !== 'warning') {
            continue;
        }
        diagnostics.push({
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            severity: severity === 'warning' ? 'warning' : 'error',
            message: message.trim(),
        });
    }
    return diagnostics;
}

/** The most useful single line to show in a notification for a failed GHDL stage. */
export function firstErrorLine(text: string): string {
    const located = parseGhdlOutput(text).find((d) => d.severity === 'error');
    if (located) {
        return `${located.file}:${located.line}:${located.column}: ${located.message}`;
    }
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
    return lines.find((l) => /error|failure|failed/i.test(l)) ?? lines[lines.length - 1] ?? '';
}
