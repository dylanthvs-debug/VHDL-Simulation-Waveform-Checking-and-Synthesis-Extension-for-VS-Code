/* Local webview controller. Configuration remains a draft until explicitly saved. */
(() => {
    const vscode = acquireVsCodeApi();
    const el = id => document.getElementById(id);
    let state;
    let dirty = false;
    const fields = ['executablePath', 'topLevel', 'part', 'enabled'];
    const post = action => vscode.postMessage({ action });
    function render() {
        if (!state) { return; }
        const running = state.status.phase === 'running';
        el('controls').disabled = running;
        el('source').value = state.selectedFile;
        el('error').textContent = state.error;
        el('error').hidden = !state.error;
        const labels = { idle: 'Ready', running: 'Running...', succeeded: 'Success — experimental procedure completed', failed: 'Failed', cancelled: 'Cancelled' };
        el('phase').textContent = labels[state.status.phase];
        el('status').dataset.phase = state.status.phase;
        el('summary').textContent = state.status.message;
        el('resultSource').textContent = state.status.source || '';
        el('exitCode').textContent = state.status.exitCode === null ? '' : `Process exit code: ${state.status.exitCode}`;
        const reason = running ? 'Please wait for this run to finish.' : dirty ? 'Save your configuration before running.' : !state.selectedFile ? 'Choose a VHDL file first.' : !state.configuration.enabled ? 'Explicitly enable experimental execution and save to run.' : 'Ready to run the selected file using experimental procedures.';
        el('runHelp').textContent = reason;
        for (const id of ['runChecking', 'runSynthesis']) { el(id).disabled = running || dirty || !state.selectedFile || !state.configuration.enabled; }
        el('revealRun').disabled = !state.hasRun || running;
        el('artifacts').replaceChildren();
        for (const artifact of state.artifacts) {
            const button = document.createElement('button');
            button.className = 'secondary artifact';
            button.textContent = `${artifact.name.endsWith('.dcp') ? 'Reveal' : 'Open'} ${artifact.name}`;
            button.addEventListener('click', () => vscode.postMessage({ action: 'openArtifact', id: artifact.id }));
            el('artifacts').append(button);
        }
    }
    for (const id of fields) {
        el(id).addEventListener('input', () => { dirty = true; el('saveState').textContent = 'Unsaved changes'; render(); });
    }
    for (const id of ['browseSource', 'useActive', 'browseExecutable', 'runChecking', 'runSynthesis', 'showOutput', 'revealRun']) {
        el(id).addEventListener('click', () => post(id));
    }
    el('save').addEventListener('click', () => vscode.postMessage({ action: 'save', enabled: el('enabled').checked, executablePath: el('executablePath').value, topLevel: el('topLevel').value, part: el('part').value }));
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'executablePicked') {
            el('executablePath').value = message.value;
            dirty = true;
            el('saveState').textContent = 'Unsaved changes';
        } else if (message.type === 'state') {
            state = message.state;
            if (message.saved) { dirty = false; el('saveState').textContent = 'Configuration saved'; }
            if (!dirty) {
                for (const id of fields) { el(id)[id === 'enabled' ? 'checked' : 'value'] = state.configuration[id]; }
            }
        }
        render();
    });
    post('ready');
})();
