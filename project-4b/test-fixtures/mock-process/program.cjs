// A deterministic local process fixture, not a Vivado simulator.
switch (process.argv[2]) {
    case 'success':
        process.stdout.write('completed\n');
        break;
    case 'failure':
        process.stdout.write('started\n');
        process.stderr.write('mock stage failed\n');
        process.exitCode = 7;
        break;
    case 'stderr':
        process.stderr.write('warning only\n');
        break;
    case 'cwd':
        process.stdout.write(process.cwd());
        break;
    case 'args':
        process.stdout.write(JSON.stringify(process.argv.slice(3)));
        break;
    case 'chunks': {
        const bytes = Buffer.from('VHDL café ✓\n', 'utf8');
        process.stdout.write(bytes.subarray(0, 9));
        setTimeout(() => {
            process.stdout.write(bytes.subarray(9));
            process.stderr.write('last stderr chunk\n');
        }, 20);
        break;
    }
    default:
        process.stderr.write('unknown fixture mode\n');
        process.exitCode = 2;
}
