import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The Bigglenet version (the same for the website and the apps), from the root package.json.
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// Each build gets an id. The web app compares it with /version.json to notice new deploys.
const buildId = new Date().toISOString();

const versionFile: Plugin = {
  name: 'bigglenet-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId, version }) });
  },
};

export default defineConfig({
  plugins: [svelte(), versionFile],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __APP_VERSION__: JSON.stringify(version),
  },
});
