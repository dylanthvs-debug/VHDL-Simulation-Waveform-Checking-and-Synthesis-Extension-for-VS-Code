import { defineConfig } from '@vscode/test-cli';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
for (const key of Object.keys(process.env)) {
    if (key.startsWith('VSCODE_')) { delete process.env[key]; }
}
export default defineConfig(['standard', 'mock-workflows'].map(label => {
    const profile = path.resolve(root, '.vscode-test', label, 'profile');
    fs.mkdirSync(path.join(profile, 'User'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({
        'chat.disableAIFeatures': true, 'git.enabled': false, 'telemetry.telemetryLevel': 'off'
    }));
    return {
        label, version: '1.144.0',
        files: label === 'standard'
            ? ['out/test/extension.test.js', 'out/test/synthesis.test.js', 'out/test/experimentalCommands.test.js', 'out/test/sidebar.test.js']
            : ['out/test/workflowCommands.test.js'],
        extensionDevelopmentPath: label === 'standard' ? root : path.join(root, 'test-fixtures/p4b-extension'),
        useInstallation: process.env.P4B_TEST_VSCODE ? { fromPath: process.env.P4B_TEST_VSCODE } : undefined,
        launchArgs: ['--disable-extensions', '--disable-telemetry', '--user-data-dir=' + profile,
            '--extensions-dir=' + path.resolve(root, '.vscode-test', label, 'extensions')],
        env: { P4B_TEST_NODE_EXECUTABLE: process.execPath, ELECTRON_RUN_AS_NODE: undefined },
        mocha: { timeout: 20000 }
    };
}));
