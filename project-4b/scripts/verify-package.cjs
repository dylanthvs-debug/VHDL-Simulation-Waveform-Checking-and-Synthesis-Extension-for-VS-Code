// Verify the extracted VSIX as a development extension. No installation/download.
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');
const { runTests } = require('@vscode/test-electron');

async function main() {
    const root = path.resolve(__dirname, '..');
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const area = path.join(root, '.vscode-test/packaged-verification');
    await fs.mkdir(area, { recursive: true });
    const extraction = await fs.mkdtemp(path.join(area, 'artifact-'));
    const zip = await JSZip.loadAsync(await fs.readFile(path.join(root, `dist/p4b-vivado-final-test-v${pkg.version}.vsix`)), { checkCRC32: true });
    for (const file of Object.values(zip.files)) {
        if (file.dir || !file.name.startsWith('extension/')) { continue; }
        const target = path.resolve(extraction, file.name);
        if (!target.startsWith(extraction + path.sep)) { throw new Error('Unsafe ZIP path'); }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, await file.async('nodebuffer'));
    }
    const profile = path.join(extraction, 'profile');
    const temp = path.join(extraction, 'tmp');
    await fs.mkdir(path.join(profile, 'User'), { recursive: true });
    await fs.mkdir(temp, { recursive: true });
    await fs.writeFile(path.join(profile, 'User/settings.json'), JSON.stringify({
        'chat.disableAIFeatures': true, 'git.enabled': false, 'telemetry.telemetryLevel': 'off'
    }));
    for (const key of Object.keys(process.env)) { if (key.startsWith('VSCODE_')) { delete process.env[key]; } }
    process.env.TEMP = temp;
    process.env.TMP = temp;
    process.env.NODE_DISABLE_COMPILE_CACHE = '1';
    const executable = process.env.P4B_TEST_VSCODE ?? path.join(root, '.vscode-test/vscode-win32-x64-archive-1.144.0/Code.exe');
    await fs.access(executable); // No download fallback.
    await runTests({
        vscodeExecutablePath: executable,
        extensionDevelopmentPath: path.join(extraction, 'extension'),
        extensionTestsPath: path.join(root, 'out/test/packagedRunner.js'),
        launchArgs: ['--disable-extensions', '--disable-telemetry', '--user-data-dir=' + profile, '--extensions-dir=' + path.join(extraction, 'extensions')],
        extensionTestsEnv: {
            ELECTRON_RUN_AS_NODE: undefined,
            P4B_PACKAGED_EXTENSION_PATH: path.join(extraction, 'extension'),
            P4B_TEST_NODE_EXECUTABLE: process.execPath,
            P4B_TEST_ROOT: root
        }
    });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
