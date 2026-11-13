import * as assert from 'assert';
import * as path from 'path';
import { parseToolManifest, resolveTool, ToolManifestError } from '../../p4a/toolConfig';

const MANIFEST_FILE = path.join(path.sep === '\\' ? 'C:\\' : '/', 'course', 'local-eda-tool-manifest.json');
const ENV = { USERPROFILE: 'C:\\Users\\Student Name' };

suite('Tool location: setting, Local EDA Tool Manifest, PATH (IR-SH2, DC-A3)', () => {
    test('UT-P4A-14 an explicit setting wins over the manifest', () => {
        const manifest = parseToolManifest('{"tools":{"surfer":{"path":"C:\\\\Tools\\\\surfer_win\\\\surfer.exe"}}}', MANIFEST_FILE, ENV);

        const tool = resolveTool('surfer', 'D:\\Other\\surfer.exe', manifest, ENV);

        assert.strictEqual(tool.executable, 'D:\\Other\\surfer.exe');
        assert.strictEqual(tool.source, 'setting');
    });

    test('UT-P4A-15 the manifest entry is used when the setting is empty, with %USERPROFILE% expanded', () => {
        const manifest = parseToolManifest(
            JSON.stringify({ tools: { ghdl: { path: '%USERPROFILE%\\Tools\\ghdl-mcode-6.0.0-ucrt64\\bin\\ghdl.exe', version: '6.0.0' } } }),
            MANIFEST_FILE,
            ENV
        );

        const tool = resolveTool('ghdl', '', manifest, ENV);

        assert.strictEqual(tool.executable, 'C:\\Users\\Student Name\\Tools\\ghdl-mcode-6.0.0-ucrt64\\bin\\ghdl.exe');
        assert.strictEqual(tool.source, 'manifest');
        assert.ok(tool.description.includes('6.0.0'));
    });

    test('UT-P4A-16 the array form of the manifest is accepted', () => {
        const manifest = parseToolManifest(
            JSON.stringify({ tools: [{ id: 'GHDL', executable: 'ghdl.exe' }, { name: 'Surfer', executable: 'surfer.exe' }] }),
            MANIFEST_FILE,
            ENV
        );

        assert.strictEqual(resolveTool('ghdl', undefined, manifest, ENV).executable, 'ghdl.exe');
        assert.strictEqual(resolveTool('surfer', undefined, manifest, ENV).executable, 'surfer.exe');
    });

    test('UT-P4A-17 with no setting and no manifest, the command name is looked up on PATH', () => {
        assert.deepStrictEqual(
            ['ghdl', 'surfer'].map((id) => resolveTool(id as 'ghdl' | 'surfer', '', undefined, ENV).executable),
            ['ghdl', 'surfer']
        );
        assert.strictEqual(resolveTool('surfer', '   ', undefined, ENV).source, 'path');
    });

    test('UT-P4A-18 a quoted setting value (pasted from Explorer) is unquoted', () => {
        const tool = resolveTool('surfer', '"C:\\Users\\Student Name\\Tools\\surfer_win\\surfer.exe"', undefined, ENV);
        assert.strictEqual(tool.executable, 'C:\\Users\\Student Name\\Tools\\surfer_win\\surfer.exe');
    });

    test('UT-P4A-19 an invalid manifest gives a clear configuration error', () => {
        assert.throws(() => parseToolManifest('{ not json', MANIFEST_FILE, ENV), ToolManifestError);
        assert.throws(() => parseToolManifest('{"version":1}', MANIFEST_FILE, ENV), /no "tools" member/);
    });
});
