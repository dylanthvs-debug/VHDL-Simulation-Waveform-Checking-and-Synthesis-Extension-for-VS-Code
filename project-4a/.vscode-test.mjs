import { defineConfig } from '@vscode/test-cli';

// Extension-host tests only. Plain unit tests (out/test/unit) run outside VS Code with `npm run test:unit`.
export default defineConfig({
	files: 'out/test/suite/**/*.test.js',
	mocha: {
		ui: 'tdd',
		timeout: 20000,
	},
});
