import * as assert from 'assert';
import { firstErrorLine, parseGhdlOutput } from '../../p4a/ghdlDiagnostics';

suite('GHDL output to Problems panel diagnostics (FR-SH1)', () => {
    test('UT-P4A-20 parses an analysis error with file, line and column', () => {
        const [d] = parseGhdlOutput('inverter.vhd:13:1:error: \';\' is expected instead of "end"\n');

        assert.deepStrictEqual(d, { file: 'inverter.vhd', line: 13, column: 1, severity: 'error', message: '\';\' is expected instead of "end"' });
    });

    test('UT-P4A-21 parses a simulation assertion failure and ignores report notes', () => {
        const output = [
            'inverter_tb.vhd:33:9:@10ns:(assertion failure): Inverter failed for I=0',
            'inverter_tb.vhd:58:9:@41ns:(report note): ALL TESTS PASSED',
            '    O <= not I',
            '         ^',
        ].join('\r\n');

        const diagnostics = parseGhdlOutput(output);

        assert.strictEqual(diagnostics.length, 1);
        assert.strictEqual(diagnostics[0].line, 33);
        assert.strictEqual(diagnostics[0].severity, 'error');
        assert.match(diagnostics[0].message, /Inverter failed for I=0/);
    });

    test('UT-P4A-22 handles a Windows path with a drive letter and spaces', () => {
        const [d] = parseGhdlOutput('C:\\Users\\Student Name\\M2 input\\inverter.vhd:7:5:warning: declaration hides port\n');

        assert.strictEqual(d.file, 'C:\\Users\\Student Name\\M2 input\\inverter.vhd');
        assert.strictEqual(d.line, 7);
        assert.strictEqual(d.severity, 'warning');
    });

    test('UT-P4A-23 picks the located error line for the notification', () => {
        const text = 'ghdl:error: compilation error\ninverter.vhd:13:1:error: \';\' is expected instead of "end"\n';
        assert.strictEqual(firstErrorLine(text), 'inverter.vhd:13:1: \';\' is expected instead of "end"');
        assert.strictEqual(firstErrorLine('ghdl:error: cannot find entity or configuration inverter_tb\n'), 'ghdl:error: cannot find entity or configuration inverter_tb');
    });
});
