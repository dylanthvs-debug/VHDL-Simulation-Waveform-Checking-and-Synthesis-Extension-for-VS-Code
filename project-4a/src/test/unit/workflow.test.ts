import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ProcessResult, ProcessRunner } from '../../p4a/processRunner';
import { SurferLaunchResult } from '../../p4a/surferLauncher';
import { formatRunLog, runSimulationWorkflow, SimulationOptions, WorkflowDeps } from '../../p4a/workflow';

/** Test double for GHDL: records calls and answers each stage with a scripted result. */
class FakeRunner implements ProcessRunner {
    readonly calls: { executable: string; args: string[]; cwd: string }[] = [];

    constructor(private readonly respond: (args: string[], cwd: string) => Promise<ProcessResult> | ProcessResult) {}

    async run(executable: string, args: readonly string[], cwd: string): Promise<ProcessResult> {
        this.calls.push({ executable, args: [...args], cwd });
        return this.respond([...args], cwd);
    }
}

const PASS: ProcessResult = { exitCode: 0, stdout: '', stderr: '' };

/** Behaves like a successful GHDL run: `-r ... --vcd=FILE` writes FILE. */
function ghdlThatPasses(): FakeRunner {
    return new FakeRunner(async (args, cwd) => {
        if (args[0] === '-r') {
            const vcd = args.find((a) => a.startsWith('--vcd='));
            if (vcd) {
                await fs.writeFile(path.resolve(cwd, vcd.slice('--vcd='.length)), '$date today $end\n$timescale 1fs $end\n', 'utf8');
            }
            return { exitCode: 0, stdout: '', stderr: 'inverter_tb.vhd:58:9:@41ns:(report note): ALL TESTS PASSED\n' };
        }
        return PASS;
    });
}

function viewerSpy(result: Partial<SurferLaunchResult> = {}) {
    const calls: { executable: string; waveformPath: string }[] = [];
    const launchViewer: WorkflowDeps['launchViewer'] = async (executable, waveformPath) => {
        calls.push({ executable, waveformPath });
        return { ok: true, executable, args: [waveformPath], message: 'Surfer started', ...result };
    };
    return { launchViewer, calls };
}

suite('GHDL to Surfer workflow (FR-A1, FR-A2, FR-A3, FR-SH1, SSA-A2)', () => {
    let workspace: string;
    let options: SimulationOptions;

    setup(async () => {
        // A folder name with spaces, like "M2 input".
        workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'p4a M2 input '));
        options = {
            workspaceRoot: workspace,
            ghdl: { executable: 'ghdl', description: '"ghdl" on PATH' },
            surfer: { executable: 'surfer', description: '"surfer" on PATH' },
            sourceFiles: ['inverter.vhd', 'inverter_tb.vhd'],
            testbenchEntity: 'inverter_tb',
            waveformFile: 'waveform.vcd',
        };
    });

    teardown(async () => {
        await fs.rm(workspace, { recursive: true, force: true });
    });

    test('Rejects the design source as waveform output and preserves its contents', async () => {
        const source = path.join(workspace, 'inverter.vhd');
        await fs.writeFile(source, 'original circuit');
        const runner = ghdlThatPasses();
        const viewer = viewerSpy();
        const result = await runSimulationWorkflow({ ...options, waveformFile: 'inverter.vhd' },
            { runner, launchViewer: viewer.launchViewer });
        assert.strictEqual(result.failedStage, 'configuration');
        assert.strictEqual(await fs.readFile(source, 'utf8'), 'original circuit');
        assert.strictEqual(runner.calls.length, 0);
    });

    test('Rejects a waveform destination outside the workspace', async () => {
        const runner = ghdlThatPasses();
        const viewer = viewerSpy();
        const result = await runSimulationWorkflow({ ...options, waveformFile: '../outside.vcd' },
            { runner, launchViewer: viewer.launchViewer });
        assert.strictEqual(result.failedStage, 'configuration');
        assert.strictEqual(runner.calls.length, 0);
    });
    test('UT-P4A-06 runs the M2 commands in order, then opens the full waveform path in Surfer', async () => {
        const runner = ghdlThatPasses();
        const viewer = viewerSpy();

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.ok, true, result.message);
        assert.deepStrictEqual(
            runner.calls.map((c) => c.args),
            [
                ['-a', '--std=08', 'inverter.vhd', 'inverter_tb.vhd'],
                ['-e', '--std=08', 'inverter_tb'],
                ['-r', '--std=08', 'inverter_tb', '--vcd=waveform.vcd'],
            ]
        );
        assert.ok(runner.calls.every((c) => c.cwd === workspace));
        assert.deepStrictEqual(viewer.calls, [{ executable: 'surfer', waveformPath: path.join(workspace, 'waveform.vcd') }]);
        assert.deepStrictEqual(
            result.stages.map((s) => s.stage),
            ['analysis', 'elaboration', 'simulation', 'waveform', 'surfer']
        );
    });

    test('UT-P4A-07 an analysis error stops before elaboration, simulation and Surfer', async () => {
        const runner = new FakeRunner(() => ({
            exitCode: 1,
            stdout: '',
            stderr: 'inverter.vhd:13:1:error: \';\' is expected instead of "end"\nghdl:error: compilation error\n',
        }));
        const viewer = viewerSpy();

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.failedStage, 'analysis');
        assert.strictEqual(runner.calls.length, 1, 'elaboration and simulation must not run');
        assert.strictEqual(viewer.calls.length, 0, 'Surfer must not start');
        assert.match(result.message, /exit(ed)? with code 1/);
        assert.ok(result.message.includes('inverter.vhd:13:1'), 'message quotes the GHDL error location');
    });

    test('UT-P4A-08 an elaboration error stops before simulation and Surfer', async () => {
        const runner = new FakeRunner((args) =>
            args[0] === '-e' ? { exitCode: 1, stdout: '', stderr: 'ghdl:error: cannot find entity or configuration inverter_tb\n' } : PASS
        );
        const viewer = viewerSpy();

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.failedStage, 'elaboration');
        assert.strictEqual(runner.calls.length, 2);
        assert.strictEqual(viewer.calls.length, 0);
        assert.ok(result.message.includes('cannot find entity'));
    });

    test('UT-P4A-09 a failed simulation (assertion failure) stops before Surfer', async () => {
        const runner = new FakeRunner((args) =>
            args[0] === '-r'
                ? { exitCode: 1, stdout: '', stderr: 'inverter_tb.vhd:33:9:@10ns:(assertion failure): Inverter failed for I=0\n' }
                : PASS
        );
        const viewer = viewerSpy();

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.failedStage, 'simulation');
        assert.strictEqual(viewer.calls.length, 0);
        assert.ok(result.message.includes('Inverter failed for I=0'));
    });

    test('UT-P4A-10 missing GHDL (ENOENT) is reported as a missing tool and nothing else runs', async () => {
        const runner = new FakeRunner(() => ({ exitCode: null, stdout: '', stderr: '', errorCode: 'ENOENT', errorMessage: 'spawn ghdl ENOENT' }));
        const viewer = viewerSpy();

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.failedStage, 'analysis');
        assert.match(result.message, /GHDL was not found/);
        assert.strictEqual(runner.calls.length, 1);
        assert.strictEqual(viewer.calls.length, 0);
    });

    test('UT-P4A-11 GHDL succeeds but no waveform is written: waveform stage fails and Surfer does not start', async () => {
        const runner = new FakeRunner(() => PASS);
        const viewer = viewerSpy();

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.failedStage, 'waveform');
        assert.match(result.message, /no waveform was produced/);
        assert.strictEqual(viewer.calls.length, 0);
    });

    test('UT-P4A-12 a waveform left over from an earlier run is not opened', async () => {
        await fs.writeFile(path.join(workspace, 'waveform.vcd'), 'old waveform', 'utf8');
        const runner = new FakeRunner(() => PASS); // this run writes nothing
        const viewer = viewerSpy();

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.failedStage, 'waveform');
        assert.strictEqual(viewer.calls.length, 0);
    });

    test('UT-P4A-13 a Surfer launch failure makes the whole run fail (never reported as success)', async () => {
        const runner = ghdlThatPasses();
        const viewer = viewerSpy({ ok: false, errorCode: 'ENOENT', message: 'Surfer was not found (surfer, from "surfer" on PATH).' });

        const result = await runSimulationWorkflow(options, { runner, launchViewer: viewer.launchViewer });

        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.failedStage, 'surfer');
        const log = formatRunLog(result, { extensionVersion: 'test', workspaceRoot: workspace });
        assert.match(log, /RESULT: FAILED at Surfer launch/);
        assert.doesNotMatch(log, /RESULT: PASSED/);
    });
});
