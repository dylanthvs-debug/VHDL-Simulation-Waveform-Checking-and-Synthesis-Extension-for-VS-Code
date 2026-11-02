// Offline allowlisted VSIX builder, using existing JSZip. No installs or downloads.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const root = path.resolve(__dirname, '..');
const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

async function main() {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const runtime = [
        'extension', 'p4b', 'shared/processRunner', 'vivado/checkingInput',
        'vivado/checking', 'vivado/synthesis', 'vivado/workflow',
        'experimental/commands', 'experimental/execution', 'experimental/session', 'ui/vivadoWorkflowView'
    ].map(file => `out/${file}.js`);
    const files = [
        'README.md', ...runtime, 'media/vivadoWorkflow.js', 'media/vivadoWorkflow.css', 'media/vivado.svg',
        'resources/experimental/common.tcl', 'resources/experimental/checking.tcl', 'resources/experimental/synthesis.tcl',
        'samples/experimental/valid.vhd', 'samples/experimental/invalid.vhd',
        'docs/EXPERIMENTAL-TESTING.md', 'docs/TEST-RESULTS-TEMPLATE.md', 'docs/VERIFICATION.md'
    ];
    const zip = new JSZip();
    const manifest = { ...pkg, displayName: pkg.displayName + ' (Experimental Prototype)' };
    delete manifest.scripts;
    delete manifest.devDependencies;
    delete manifest.overrides;
    zip.file('extension/package.json', JSON.stringify(manifest, null, 2));
    for (const file of files) { zip.file('extension/' + file, await fs.readFile(path.join(root, file))); }
    zip.file('extension.vsixmanifest', `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="${xml(pkg.name)}" Version="${xml(pkg.version)}" Publisher="${xml(pkg.publisher)}"/>
<DisplayName>${xml(manifest.displayName)}</DisplayName><Description xml:space="preserve">P4B opt-in development prototype. Real Vivado execution unverified.</Description>
<Tags>experimental,vhdl,vivado</Tags><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags>
<Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(pkg.engines.vscode)}"/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/>
<Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace"/><Property Id="Microsoft.VisualStudio.Code.LocalizedLanguages" Value=""/>
</Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/></Assets></PackageManifest>`);
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="css" ContentType="text/css"/><Default Extension="svg" ContentType="image/svg+xml"/>
<Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/>
<Default Extension="md" ContentType="text/markdown"/><Default Extension="tcl" ContentType="text/plain"/><Default Extension="vhd" ContentType="text/plain"/>
<Default Extension="vsixmanifest" ContentType="text/xml"/></Types>`);
    const output = path.join(root, 'dist/experimental');
    await fs.mkdir(output, { recursive: true });
    const name = `p4b-experimental-${pkg.version}`;
    const vsix = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fs.writeFile(path.join(output, `${name}.vsix`), vsix);
    const verified = await JSZip.loadAsync(vsix, { checkCRC32: true });
    const entries = Object.values(verified.files).filter(file => !file.dir).map(file => file.name).sort();
    const expected = ['[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', ...files.map(file => 'extension/' + file)].sort();
    if (JSON.stringify(entries) !== JSON.stringify(expected)) { throw new Error('VSIX allowlist mismatch'); }
    const packageReport = { version: pkg.version, entries, bytes: vsix.length, sha256: crypto.createHash('sha256').update(vsix).digest('hex'),
        realVivadoVerified: false, packaging: 'Offline JSZip allowlist; no additional software installed' };
    await fs.writeFile(path.join(output, 'package-contents.json'), JSON.stringify(packageReport, null, 2));
    const transfer = new JSZip();
    transfer.file(`${name}.vsix`, vsix);
    transfer.file('package-contents.json', JSON.stringify(packageReport, null, 2));
    for (const file of files.filter(file => !file.startsWith('out/'))) { transfer.file(file, await fs.readFile(path.join(root, file))); }
    const bundle = await transfer.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await fs.writeFile(path.join(output, `${name}.zip`), bundle);
    await fs.writeFile(path.join(output, 'SHA256SUMS.txt'), `${packageReport.sha256}  ${name}.vsix\n${crypto.createHash('sha256').update(bundle).digest('hex')}  ${name}.zip\n`);
    console.log(JSON.stringify({ output, files: [`${name}.vsix`, `${name}.zip`, 'package-contents.json', 'SHA256SUMS.txt'], vsixBytes: vsix.length, bundleBytes: bundle.length, entries: entries.length }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
