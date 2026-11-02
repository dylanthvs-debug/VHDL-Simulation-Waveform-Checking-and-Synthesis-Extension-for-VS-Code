// Fake Vivado protocol for tests ONLY. Does not parse or synthesize VHDL or Tcl.
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] !== '-mode' || args[1] !== 'batch' || !fs.existsSync(args[3])) {
    process.stderr.write('MOCK: incorrect launcher arguments\n');
    process.exitCode = 9;
} else {
    const kind = fs.existsSync('checking.tcl') ? 'checking' : 'synthesis';
    const source = fs.readFileSync('input.vhd', 'utf8');
    fs.writeFileSync('version.txt', 'MOCK VIVADO - no real EDA execution\n');
    fs.writeFileSync('vivado.log', 'Mock launcher arguments: ' + JSON.stringify(args) + '\n');
    process.stdout.write('MOCK running ' + kind + ' in ' + process.cwd() + '\n');
    if (source.includes('a and ;') || source.includes('MOCK_TCL_ERROR')) {
        fs.writeFileSync('status.txt', 'P4B_EXPERIMENTAL_FAILURE ' + kind);
        process.stderr.write('P4B_EXPERIMENTAL_FAILURE ' + kind + ': simulated Tcl error\n');
        process.exitCode = source.includes('MOCK_ZERO_EXIT') ? 0 : 1;
    } else if (!source.includes('MOCK_NO_MARKER')) {
        fs.writeFileSync('status.txt', 'P4B_EXPERIMENTAL_SUCCESS ' + kind + '\n');
        if (!source.includes('MOCK_NO_REPORT')) {
            const files = kind === 'checking' ? ['syntax.rpt'] : ['utilization.rpt', 'post_synth.dcp'];
            for (const file of files) { fs.writeFileSync(path.join(process.cwd(), file), 'MOCK ONLY\n'); }
        }
        process.stderr.write('WARNING: MOCK ONLY; not real Vivado\n');
    }
}
