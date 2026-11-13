import * as assert from 'assert';
import { SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { launchSurfer, SpawnFunction } from '../../p4a/surferLauncher';

/** Stand-in for a ChildProcess; the test decides which events it emits. */
class FakeChild extends EventEmitter {
    unrefCalled = false;
    unref(): void {
        this.unrefCalled = true;
    }
}

interface SpawnCall {
    command: string;
    args: string[];
    options: SpawnOptions;
}

function fakeSpawn(behaviour: (child: FakeChild) => void): { spawnFn: SpawnFunction; calls: SpawnCall[]; children: FakeChild[] } {
    const calls: SpawnCall[] = [];
    const children: FakeChild[] = [];
    const spawnFn: SpawnFunction = (command, args, options) => {
        calls.push({ command, args: [...args], options });
        const child = new FakeChild();
        children.push(child);
        setImmediate(() => behaviour(child));
        return child;
    };
    return { spawnFn, calls, children };
}

const SURFER = 'C:\\Users\\Student Name\\Tools\\surfer_win\\surfer.exe';
const WAVEFORM_WITH_SPACES = 'C:\\Users\\Student Name\\ECNG2007 Group 4 - M3 and M4\\M2 input\\waveform.vcd';

suite('Surfer launcher (FR-A3, IR-A2, FR-SH1)', () => {
    test('UT-P4A-01 passes a waveform path containing spaces as exactly one argument, without a shell', async () => {
        const { spawnFn, calls, children } = fakeSpawn((child) => child.emit('spawn'));

        const result = await launchSurfer(SURFER, WAVEFORM_WITH_SPACES, { spawnFn, earlyExitWindowMs: 0 });

        assert.strictEqual(result.ok, true, result.message);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].command, SURFER);
        assert.deepStrictEqual(calls[0].args, [WAVEFORM_WITH_SPACES]);
        assert.deepStrictEqual(result.args, [WAVEFORM_WITH_SPACES]);
        assert.ok(!calls[0].options.shell, 'Surfer must not be started through a shell');
        assert.strictEqual(calls[0].options.detached, true);
        assert.strictEqual(children[0].unrefCalled, true);
    });

    test('UT-P4A-02 reports an unavailable viewer (ENOENT) as a failure that names the executable', async () => {
        const { spawnFn } = fakeSpawn((child) =>
            child.emit('error', Object.assign(new Error(`spawn ${SURFER} ENOENT`), { code: 'ENOENT' }))
        );

        const result = await launchSurfer(SURFER, WAVEFORM_WITH_SPACES, { spawnFn, toolDescription: 'p4a.surferPath setting' });

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.errorCode, 'ENOENT');
        assert.match(result.message, /Surfer was not found/);
        assert.ok(result.message.includes(SURFER), 'message names the executable that was tried');
        assert.ok(result.message.includes('p4a.surferPath setting'), 'message says where the path came from');
    });

    test('UT-P4A-03 reports an unavailable viewer using a real spawn of a missing executable', async () => {
        const missing = path.join(os.tmpdir(), 'p4a missing tools', 'surfer_win', process.platform === 'win32' ? 'surfer.exe' : 'surfer');
        // The waveform folder must exist so the failure can only come from the missing executable.
        const waveform = path.join(os.tmpdir(), 'waveform.vcd');

        const result = await launchSurfer(missing, waveform);

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.errorCode, 'ENOENT');
        assert.ok(result.message.includes(missing));
    });

    test('UT-P4A-04 reports Surfer closing immediately with a non-zero exit code as a failure', async () => {
        const { spawnFn } = fakeSpawn((child) => {
            child.emit('spawn');
            child.emit('exit', 1, null);
        });

        const result = await launchSurfer(SURFER, WAVEFORM_WITH_SPACES, { spawnFn, earlyExitWindowMs: 1000 });

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.exitCode, 1);
        assert.match(result.message, /closed immediately/);
    });

    test('UT-P4A-05 a real child process receives the full path with spaces as one argument', async function () {
        this.timeout(15000);
        // Uses Node itself as the "viewer": the waveform argument is a script that records its argv.
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p4a launcher '));
        try {
            const recordFile = path.join(dir, 'argv.json');
            const fakeWaveform = path.join(dir, 'wave form with spaces.js');
            await fs.writeFile(
                fakeWaveform,
                `require('fs').writeFileSync(${JSON.stringify(recordFile)}, JSON.stringify(process.argv.slice(1)));\n`,
                'utf8'
            );

            const result = await launchSurfer(process.execPath, fakeWaveform, { earlyExitWindowMs: 10000 });

            assert.strictEqual(result.ok, true, result.message);
            const received = JSON.parse(await fs.readFile(recordFile, 'utf8')) as string[];
            assert.deepStrictEqual(received, [fakeWaveform]);
        } finally {
            await fs.rm(dir, { recursive: true, force: true });
        }
    });
});
