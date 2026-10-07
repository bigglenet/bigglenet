import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Each build gets an id. The web app compares it with /version.json to notice new deploys.
const buildId = new Date().toISOString();

const versionFile: Plugin = {
  name: 'bigglenet-version',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) });
  },
};

export default defineConfig({
  plugins: [svelte(), versionFile],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
});
