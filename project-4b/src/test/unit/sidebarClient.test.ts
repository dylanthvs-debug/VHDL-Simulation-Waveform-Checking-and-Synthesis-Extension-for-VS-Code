import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { runInNewContext } from 'node:vm';

class Element {
    value = ''; checked = false; disabled = false; hidden = false; textContent = ''; className = '';
    dataset: Record<string, string> = {};
    children: Element[] = [];
    listeners = new Map<string, () => void>();
    addEventListener(event: string, callback: () => void) { this.listeners.set(event, callback); }
    replaceChildren() { this.children = []; }
    append(child: Element) { this.children.push(child); }
    fire(event: string) { this.listeners.get(event)?.(); }
}
function client() {
    const elements = new Map<string, Element>();
    const element = (id: string) => { if (!elements.has(id)) { elements.set(id, new Element()); } return elements.get(id)!; };
    const messages: Record<string, unknown>[] = [];
    let receive: (event: { data: unknown }) => void;
    runInNewContext(readFileSync(path.resolve(__dirname, '../../../media/vivadoWorkflow.js'), 'utf8'), {
        acquireVsCodeApi: () => ({ postMessage: (message: Record<string, unknown>) => messages.push(message) }),
        document: { getElementById: element, createElement: () => new Element() },
        window: { addEventListener: (_event: string, handler: typeof receive) => { receive = handler; } }
    });
    const state = { selectedFile: 'selected.vhd', error: '', configuration: { enabled: false, executablePath: '', topLevel: '', part: '' }, status: { phase: 'idle', message: 'Ready', source: '', exitCode: null as number | null }, artifacts: [] as { id: number; name: string }[], hasRun: false };
    return { element, messages, state, send: (data: unknown) => receive({ data }) };
}
test('sidebar client requires explicit save and keeps launcher browsing as a draft', () => {
    const c = client();
    assert.equal(c.messages[0].action, 'ready');
    c.send({ type: 'state', state: c.state });
    assert.equal(c.element('runChecking').disabled, true);
    c.send({ type: 'executablePicked', value: 'C:/tools with spaces/vivado.bat' });
    assert.equal(c.element('enabled').checked, false);
    c.element('enabled').checked = true;
    c.element('enabled').fire('input');
    c.element('save').fire('click');
    assert.equal(c.messages.at(-1)?.enabled, true);
    assert.equal(c.messages.at(-1)?.executablePath, 'C:/tools with spaces/vivado.bat');
    assert.equal(c.element('runChecking').disabled, true);
    c.state.configuration.enabled = true;
    c.send({ type: 'state', state: c.state, saved: true });
    assert.equal(c.element('runChecking').disabled, false);
    c.element('runChecking').fire('click');
    assert.equal(c.messages.at(-1)?.action, 'runChecking');
});
test('sidebar client renders running/failure/success and host-owned report buttons', () => {
    const c = client();
    c.state.status.phase = 'running';
    c.send({ type: 'state', state: c.state });
    assert.equal(c.element('controls').disabled, true);
    assert.equal(c.element('phase').textContent, 'Running...');
    c.state.status.phase = 'failed';
    c.state.status.message = '<script>literal error text</script>';
    c.send({ type: 'state', state: c.state });
    assert.equal(c.element('phase').textContent, 'Failed');
    assert.equal(c.element('summary').textContent, c.state.status.message);
    c.state.status.phase = 'succeeded'; c.state.hasRun = true;
    c.state.artifacts = [{ id: 3, name: 'syntax.rpt' }];
    c.send({ type: 'state', state: c.state });
    assert.match(c.element('phase').textContent, /Success/);
    c.element('artifacts').children[0].fire('click');
    assert.equal(c.messages.at(-1)?.id, 3);
    assert.equal(c.messages.at(-1)?.action, 'openArtifact');
});
