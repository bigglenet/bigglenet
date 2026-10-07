<script lang="ts" module>
  const PATHS = {
    back: 'M15 18l-6-6 6-6',
    forward: 'M9 6l6 6-6 6',
    reload: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
    close: 'M18 6 6 18M6 6l12 12',
    plus: 'M12 5v14M5 12h14',
    shield: 'M12 3l7 3v5c0 4.4-2.9 8.4-7 10-4.1-1.6-7-5.6-7-10V6l7-3zM9 12l2 2 4-4',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    users:
      'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    userPlus: 'M15 20v-1a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v1M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    check: 'M5 12l5 5L20 7',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
    tabs: 'M4 8h12v12H4zM8 4h12v12h-4',
    logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
    settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  };
  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name]} />
</svg>
