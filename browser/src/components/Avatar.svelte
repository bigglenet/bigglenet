<script lang="ts">
  let { name, size = 32, online }: { name: string; size?: number; online?: boolean } = $props();
</script>

<span class="avatar" style:--size="{size}px" aria-hidden="true">
  {name[0]?.toUpperCase()}
  {#if online !== undefined}
    <span class="dot" class:online></span>
  {/if}
</span>

<style>
  .avatar {
    position: relative;
    flex: none;
    display: inline-grid;
    place-items: center;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font-size: calc(var(--size) * 0.44);
    font-weight: 700;
    line-height: 1;
  }
  .dot {
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: calc(var(--size) * 0.32);
    height: calc(var(--size) * 0.32);
    min-width: 8px;
    min-height: 8px;
    border-radius: 50%;
    background: var(--faint);
    box-shadow: 0 0 0 2px var(--surface);
  }
  .dot.online {
    background: var(--online);
  }
</style>
