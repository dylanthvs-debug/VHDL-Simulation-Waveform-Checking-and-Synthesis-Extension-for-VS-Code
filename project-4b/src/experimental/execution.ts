import * as path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { ProcessRequest, ProcessRunner } from '../shared/processRunner';
import { executeWorkflow, WorkflowResult } from '../vivado/workflow';

export type ExperimentalKind = 'checking' | 'synthesis';
/** Development settings only. NOT Local EDA Tool Manifest v1. */
export interface ExperimentalSettings {
    executablePath: string;
    topLevel: string;
    part: string;
}
export interface ExperimentalRun {
    directory: string;
    result: WorkflowResult;
    reports: string[];
}

export function validateExperimentalSettings(settings: ExperimentalSettings, kind: ExperimentalKind): void {
    if (!path.isAbsolute(settings.executablePath) || !/\.(exe|bat|cmd)$/i.test(settings.executablePath)) {
        throw new Error('Supply the absolute path to the Vivado .bat, .cmd, or .exe launcher; do not include arguments or quotes.');
    }
    if (/[\x00-\x1f"%!^&|<>]/.test(settings.executablePath)) {
        throw new Error('The experimental Windows launcher does not support control characters, quotes, or % ! ^ & | < > in paths. Use a simpler path.');
    }
    if (kind === 'synthesis') {
        if (!/^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/.test(settings.topLevel)) {
            throw new Error('Synthesis requires an explicitly supplied basic VHDL top-level entity name.');
        }
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(settings.part)) {
            throw new Error('Synthesis requires an explicitly supplied FPGA part name from the tester\'s installed Vivado device list.');
        }
    }
}

/** Quote data as a Tcl string, never as executable Tcl source. */
export function tclString(value: string): string {
    if (value.includes('\0')) { throw new Error('NUL is not supported in Tcl input.'); }
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        .replace(/\$/g, '\\$').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
        .replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
}

/** A .bat launcher requires cmd.exe on Windows. No shell is used for .exe files.
 * Arguments are fixed by this adapter, quoted, and reject expansion/control syntax.
 */
export function experimentalLaunchRequest(executable: string, driver: string, directory: string): ProcessRequest {
    const args = ['-mode', 'batch', '-source', driver, '-log', 'vivado.log', '-journal', 'vivado.jou'];
    if (!/\.(bat|cmd)$/i.test(executable)) { return { executable, args, cwd: directory }; }
    for (const value of [executable, directory, ...args]) {
        if (/[\x00-\x1f"%!^&|<>]/.test(value)) {
            throw new Error('Unsafe or unsupported character in experimental batch-launch path. Use paths without quotes or % ! ^ & | < >.');
        }
    }
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot) { throw new Error('Windows SystemRoot is unavailable; cannot locate cmd.exe.'); }
    return {
        executable: path.join(systemRoot, 'System32', 'cmd.exe'),
        args: ['/d', '/s', '/v:off', '/c', '"' + [executable, ...args].map(value => `"${value}"`).join(' ') + '"'],
        cwd: directory,
        windowsVerbatimArguments: true
    };
}

/** Runs a single saved source in an isolated folder beside that source.
 * This intentionally excludes IP, constraints, multifile projects and implementation.
 */
export async function executeExperimental(
    kind: ExperimentalKind,
    settings: ExperimentalSettings,
    source: string,
    extensionPath: string,
    runner: ProcessRunner
): Promise<ExperimentalRun> {
    validateExperimentalSettings(settings, kind);
    if (!path.isAbsolute(source) || !/\.vhdl?$/i.test(source) || !(await stat(source)).isFile()) {
        throw new Error('Select a saved local .vhd or .vhdl source file.');
    }
    const resources = path.join(extensionPath, 'resources/experimental');
    for (const name of ['common.tcl', `${kind}.tcl`]) {
        if (!(await stat(path.join(resources, name))).isFile()) { throw new Error(`Missing runtime resource: ${name}`); }
    }
    const outputRoot = path.join(path.dirname(source), '.p4b-experimental');
    await mkdir(outputRoot, { recursive: true });
    const directory = await mkdtemp(path.join(outputRoot, `${kind}-`));
    const driver = path.join(directory, 'driver.tcl');
    const sourceSnapshot = path.join(directory, 'input.vhd');
    await copyFile(source, sourceSnapshot);
    // Copy scripts to each run so returned logs include the exact experimental procedure.
    for (const name of ['common.tcl', `${kind}.tcl`]) {
        await copyFile(path.join(resources, name), path.join(directory, name));
    }
    await writeFile(driver, [
        '# P4B EXPERIMENTAL ONLY - not an approved course workflow',
        `set ::p4b_source ${tclString(sourceSnapshot)}`,
        `set ::p4b_top ${tclString(settings.topLevel)}`,
        `set ::p4b_part ${tclString(settings.part)}`,
        `source ${tclString(path.join(directory, `${kind}.tcl`))}`,
        ''
    ].join('\n'), 'utf8');
    const started = new Date().toISOString();
    const expectedReports = kind === 'checking' ? ['syntax.rpt', 'version.txt'] : ['utilization.rpt', 'post_synth.dcp', 'version.txt'];
    let result: WorkflowResult;
    let request: ProcessRequest | undefined;
    try {
        // Preflight gives a useful missing-launcher diagnostic even for .bat files.
        if (!(await stat(settings.executablePath)).isFile()) { throw new Error('Launcher path is not a file.'); }
        request = experimentalLaunchRequest(settings.executablePath, driver, directory);
        result = await executeWorkflow(request, runner);
        if (result.status === 'success') {
            const marker = await readFile(path.join(directory, 'status.txt'), 'utf8').catch(() => '');
            const missing: string[] = [];
            for (const name of expectedReports) {
                const info = await stat(path.join(directory, name)).catch(() => undefined);
                if (!info?.isFile() || info.size === 0) { missing.push(name); }
            }
            const errors = /(?:^|\n)\s*(?:ERROR:|P4B_EXPERIMENTAL_FAILURE)/i.test(
                (result.process?.stdout ?? '') + '\n' + (result.process?.stderr ?? ''));
            if (marker.trim() !== `P4B_EXPERIMENTAL_SUCCESS ${kind}` || missing.length || errors) {
                result = { ...result, status: 'failed', message: `EXPERIMENTAL ${kind} not confirmed: completion marker/reports missing or error output detected. Missing reports: ${missing.join(', ') || 'none'}. Exit code alone is not sufficient.` };
            } else {
                result = { ...result, message: `EXPERIMENTAL ${kind} procedure completed (exit code 0; marker and reports verified). Not an official course acceptance result.` };
            }
        }
    } catch (error) {
        result = { status: 'launch-error', message: `EXPERIMENTAL launch/setup failure: ${error instanceof Error ? error.message : String(error)}. Check the launcher path, directory permissions and Vivado installation.` };
    }
    await writeFile(path.join(directory, 'stdout.txt'), result.process?.stdout ?? '', 'utf8');
    await writeFile(path.join(directory, 'stderr.txt'), result.process?.stderr ?? '', 'utf8');
    await writeFile(path.join(directory, 'result.json'), JSON.stringify({
        experimental: true, kind, source, settings, request, started, finished: new Date().toISOString(),
        status: result.status, message: result.message, exitCode: result.process?.exitCode ?? null,
        signal: result.process?.signal ?? null, launchError: result.process?.error, expectedReports
    }, null, 2), 'utf8');
    const reports: string[] = [];
    for (const name of expectedReports) {
        if ((await stat(path.join(directory, name)).catch(() => undefined))?.isFile()) { reports.push(path.join(directory, name)); }
    }
    return { directory, result, reports };
}
