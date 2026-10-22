<script lang="ts">
  // A page that's loaded the first time it's opened rather than when the app starts, so the app
  // opens faster (most of all on phones). `load` must be the same function each time.
  import type { Component } from 'svelte';

  let { load, ...props }: { load: () => Promise<{ default: Component<any> }>; [prop: string]: unknown } = $props();
</script>

{#await load() then { default: Page }}
  <Page {...props} />
{/await}
