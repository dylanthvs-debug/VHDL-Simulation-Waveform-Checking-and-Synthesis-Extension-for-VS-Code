import * as fs from 'fs/promises';
import * as path from 'path';
import { firstErrorLine } from './ghdlDiagnostics';
import { ProcessResult, ProcessRunner } from './processRunner';
import { SurferLaunchResult } from './surferLauncher';

/**
 * P4A workflow (FR-A1, FR-A2, FR-A3, FR-SH1):
 *   GHDL analysis -> elaboration -> simulation -> waveform check -> Surfer launch.
 * Each stage runs only if the previous one succeeded, and the result names the failed stage.
 * This module has no 'vscode' dependency so it can be unit tested on its own (SSA-A2).
 */

export type StageId = 'configuration' | 'analysis' | 'elaboration' | 'simulation' | 'waveform' | 'surfer';

export const STAGE_LABELS: Readonly<Record<StageId, string>> = {
    configuration: 'Configuration',
    analysis: 'GHDL analysis',
    elaboration: 'GHDL elaboration',
    simulation: 'GHDL simulation',
    waveform: 'Waveform check',
    surfer: 'Surfer launch',
};

/** Executable plus a human-readable note on where it came from (setting, manifest or PATH). */
export interface ToolLocation {
    executable: string;
    description: string;
}

export interface SimulationOptions {
    /** Folder GHDL runs in; relative file names are resolved from here. */
    workspaceRoot: string;
    ghdl: ToolLocation;
    surfer: ToolLocation;
    /** Files for `ghdl -a`, in order. */
    sourceFiles: string[];
    testbenchEntity: string;
    /** Waveform for `ghdl -r --vcd=...`, relative to workspaceRoot (or absolute). */
    waveformFile: string;
    /** VHDL standard for --std (course convention: 08). */
    vhdlStandard?: string;
}

export interface StageRecord {
    stage: StageId;
    ok: boolean;
    /** Executable and arguments, when the stage ran a program. */
    executable?: string;
    args?: string[];
    exitCode?: number | null;
    stdout?: string;
    stderr?: string;
    message: string;
}

export interface WorkflowResult {
    ok: boolean;
    failedStage?: StageId;
    message: string;
    /** Absolute waveform path for this run ('' if the run never got that far). */
    waveformPath: string;
    stages: StageRecord[];
    warnings: string[];
    startedAt: string;
    finishedAt: string;
}

export interface WorkflowDeps {
    runner: ProcessRunner;
    launchViewer: (executable: string, waveformPath: string, toolDescription: string) => Promise<SurferLaunchResult>;
    onStageStart?: (stage: StageId, commandLine: string) => void;
    onStageEnd?: (record: StageRecord) => void;
    /** Clock, replaceable in tests. */
    now?: () => number;
}

/** File-system clocks can be coarse; accept a waveform written up to this long before the run started. */
const MTIME_TOLERANCE_MS = 2000;

export interface GhdlCommand {
    stage: 'analysis' | 'elaboration' | 'simulation';
    args: string[];
}

/** The M2 command sequence, as argument arrays (no shell). */
export function buildGhdlCommands(options: SimulationOptions): GhdlCommand[] {
    const std = `--std=${options.vhdlStandard ?? '08'}`;
    return [
        { stage: 'analysis', args: ['-a', std, ...options.sourceFiles] },
        { stage: 'elaboration', args: ['-e', std, options.testbenchEntity] },
        { stage: 'simulation', args: ['-r', std, options.testbenchEntity, `--vcd=${options.waveformFile}`] },
    ];
}

/** For display and logs only; quotes arguments that contain spaces. */
export function formatCommandLine(executable: string, args: readonly string[]): string {
    return [executable, ...args].map((part) => (part === '' || /\s/.test(part) ? `"${part}"` : part)).join(' ');
}

function describeGhdlFailure(stage: GhdlCommand['stage'], ghdl: ToolLocation, result: ProcessResult): string {
    const remaining = stage === 'simulation' ? 'The waveform was not checked and Surfer was not started.' : 'Later stages were not run.';
    if (result.errorCode === 'ENOENT') {
        return (
            `GHDL was not found (${ghdl.executable}, from ${ghdl.description}). Install GHDL and add its bin folder to PATH, ` +
            'or set its location in the tool manifest or p4a.ghdlPath. If you just changed PATH, restart VS Code. ' +
            remaining
        );
    }
    if (result.errorCode) {
        return `GHDL could not be run (${result.errorCode}${result.errorMessage ? `: ${result.errorMessage}` : ''}). ${remaining}`;
    }
    if (result.timedOut) {
        return `GHDL did not finish within the time limit and was stopped. ${remaining}`;
    }
    const detail = firstErrorLine(`${result.stderr}\n${result.stdout}`);
    return `GHDL exited with code ${result.exitCode}.${detail ? ` ${detail}` : ''} ${remaining}`;
}

async function checkWaveform(waveformPath: string, runStartedMs: number): Promise<{ ok: boolean; message: string }> {
    const stats = await fs.stat(waveformPath).catch(() => undefined);
    if (stats === undefined) {
        return { ok: false, message: `GHDL finished, but no waveform was produced at ${waveformPath}. Surfer was not started.` };
    }
    if (!stats.isFile()) {
        return { ok: false, message: `The waveform path is not a file: ${waveformPath}. Surfer was not started.` };
    }
    if (stats.size === 0) {
        return { ok: false, message: `The waveform file is empty: ${waveformPath}. Surfer was not started.` };
    }
    if (stats.mtimeMs + MTIME_TOLERANCE_MS < runStartedMs) {
        return { ok: false, message: `The waveform file was not written by this run: ${waveformPath}. Surfer was not started.` };
    }
    return { ok: true, message: `Waveform written by this run: ${waveformPath} (${stats.size} bytes)` };
}

export function configurationFailure(message: string, now: Date = new Date()): WorkflowResult {
    const stamp = now.toISOString();
    return {
        ok: false,
        failedStage: 'configuration',
        message,
        waveformPath: '',
        stages: [{ stage: 'configuration', ok: false, message }],
        warnings: [],
        startedAt: stamp,
        finishedAt: stamp,
    };
}

export async function runSimulationWorkflow(options: SimulationOptions, deps: WorkflowDeps): Promise<WorkflowResult> {
    const now = deps.now ?? Date.now;
    const runStartedMs = now();
    const startedAt = new Date(runStartedMs).toISOString();
    const waveformPath = path.resolve(options.workspaceRoot, options.waveformFile);
    const stages: StageRecord[] = [];
    const warnings: string[] = [];

    const done = (record: StageRecord): StageRecord => {
        stages.push(record);
        deps.onStageEnd?.(record);
        return record;
    };
    const fail = (stage: StageId, message: string): WorkflowResult => ({
        ok: false,
        failedStage: stage,
        message,
        waveformPath,
        stages,
        warnings,
        startedAt,
        finishedAt: new Date(now()).toISOString(),
    });

    // Validate the output before any tool or filesystem operation can replace an input.
    const name = options.waveformFile;
    if (path.isAbsolute(name) || name.includes(':') || path.extname(name).toLowerCase() !== '.vcd') {
        return configurationFailure('Choose a workspace-relative .vcd file for the waveform.');
    }
    try {
        const root = await fs.realpath(options.workspaceRoot);
        const parent = await fs.realpath(path.dirname(waveformPath));
        const relative = path.relative(root, parent);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
            return configurationFailure('Choose a waveform folder inside the workspace.');
        }
        const output = path.join(parent, path.basename(waveformPath));
        for (const source of options.sourceFiles) {
            const input = path.resolve(options.workspaceRoot, source);
            const canonicalInput = await fs.realpath(input).catch(() => input);
            if (path.relative(canonicalInput, output) === '' || path.relative(input, waveformPath) === '') {
                return configurationFailure('The waveform and a source file have the same path.');
            }
        }
    } catch (err) {
        return configurationFailure('Cannot resolve the waveform folder: ' + (err as Error).message);
    }
    for (const command of buildGhdlCommands(options)) {
        if (command.stage === 'simulation') {
            try {
                await fs.rm(waveformPath, { force: true });
            } catch (err) {
                const message = 'Cannot prepare the waveform output: ' + (err as Error).message;
                done({ stage: 'waveform', ok: false, message });
                return fail('waveform', message);
            }
        }
        deps.onStageStart?.(command.stage, formatCommandLine(options.ghdl.executable, command.args));
        const result = await deps.runner.run(options.ghdl.executable, command.args, options.workspaceRoot);
        const ok = result.exitCode === 0 && !result.errorCode && !result.timedOut;
        const record = done({
            stage: command.stage,
            ok,
            executable: options.ghdl.executable,
            args: command.args,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            message: ok ? 'Passed (exit code 0)' : describeGhdlFailure(command.stage, options.ghdl, result),
        });
        if (!ok) {
            return fail(command.stage, record.message);
        }
    }

    deps.onStageStart?.('waveform', waveformPath);
    const waveform = await checkWaveform(waveformPath, runStartedMs);
    done({ stage: 'waveform', ok: waveform.ok, message: waveform.message });
    if (!waveform.ok) {
        return fail('waveform', waveform.message);
    }

    deps.onStageStart?.('surfer', formatCommandLine(options.surfer.executable, [waveformPath]));
    const launch = await deps.launchViewer(options.surfer.executable, waveformPath, options.surfer.description);
    done({
        stage: 'surfer',
        ok: launch.ok,
        executable: launch.executable,
        args: launch.args,
        exitCode: launch.exitCode,
        message: launch.message,
    });
    if (!launch.ok) {
        return fail('surfer', launch.message);
    }

    return {
        ok: true,
        message: `GHDL analysis, elaboration and simulation passed. Waveform opened in Surfer: ${waveformPath}`,
        waveformPath,
        stages,
        warnings,
        startedAt,
        finishedAt: new Date(now()).toISOString(),
    };
}

export interface RunLogContext {
    extensionVersion: string;
    workspaceRoot: string;
    ghdl?: ToolLocation;
    surfer?: ToolLocation;
}

function indent(text: string): string {
    return text
        .replace(/\s+$/, '')
        .split(/\r?\n/)
        .map((line) => `    ${line}`)
        .join('\n');
}

/** Text written to logs/p4a-simulation-log.txt and the output channel. */
export function formatStageRecord(record: StageRecord): string {
    const lines: string[] = [`[${STAGE_LABELS[record.stage]}]`];
    if (record.executable !== undefined) {
        lines.push(`  Command: ${formatCommandLine(record.executable, record.args ?? [])}`);
    }
    if (record.exitCode !== undefined) {
        lines.push(`  Exit code: ${record.exitCode === null ? 'none' : record.exitCode}`);
    }
    if (record.stdout && record.stdout.trim() !== '') {
        lines.push('  stdout:', indent(record.stdout));
    }
    if (record.stderr && record.stderr.trim() !== '') {
        lines.push('  stderr:', indent(record.stderr));
    }
    lines.push(`  ${record.ok ? 'OK' : 'FAILED'}: ${record.message}`);
    return lines.join('\n');
}

export function formatRunLog(result: WorkflowResult, context: RunLogContext): string {
    const lines: string[] = [
        'P4A GHDL AND SURFER RUN LOG',
        `Extension version: ${context.extensionVersion}`,
        `Started: ${result.startedAt}`,
        `Finished: ${result.finishedAt}`,
        `Workspace: ${context.workspaceRoot}`,
    ];
    if (context.ghdl) {
        lines.push(`GHDL: ${context.ghdl.executable} (${context.ghdl.description})`);
    }
    if (context.surfer) {
        lines.push(`Surfer: ${context.surfer.executable} (${context.surfer.description})`);
    }
    if (result.waveformPath) {
        lines.push(`Waveform: ${result.waveformPath}`);
    }
    lines.push('');
    for (const record of result.stages) {
        lines.push(formatStageRecord(record), '');
    }
    for (const warning of result.warnings) {
        lines.push(`Warning: ${warning}`);
    }
    lines.push(
        result.ok
            ? `RESULT: PASSED. ${result.message}`
            : `RESULT: FAILED at ${STAGE_LABELS[result.failedStage ?? 'configuration']}. ${result.message}`
    );
    return `${lines.join('\n')}\n`;
}
