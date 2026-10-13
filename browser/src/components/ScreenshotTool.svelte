<script lang="ts" module>
  import { isApp as app } from '../lib/platform';
  // Screenshots (⇧⌘S): drag over part of the page, or press Enter for all of it. The desktop app
  // takes the picture itself; web browsers that can share a tab (Chrome, Edge) ask first.
  export const canScreenshot = app || (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && !matchMedia('(pointer: coarse)').matches);
  class Shot {
    open = $state(false);
    start() {
      this.open = true;
    }
  }
  export const shot = new Shot();
</script>

<script lang="ts">
  import { browser } from '../lib/browser.svelte';
  import { chats } from '../lib/chats.svelte';
  import { i18n, t } from '../lib/i18n.svelte';
  import { overlays } from '../lib/overlays.svelte';
  import { controlFor } from '../lib/pagecontrol';
  import { desktop } from '../lib/platform';
  import { social } from '../lib/social.svelte';
  import Icon from './Icon.svelte';

  /** The page area, and a picture of it taken when the tool opened. */
  let area = $state<DOMRect | null>(null);
  let picture = $state<string | null>(null);
  let drag = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  let result = $state<string | null>(null);
  let sending = $state(false);
  let error = $state('');

  $effect(() => {
    if (!shot.open) return;
    result = null;
    drag = null;
    error = '';
    capture();
  });

  // While choosing, the page shows as a picture (so sites drawn over the window can be shot too).
  $effect(() => {
    if (shot.open && picture) return overlays.hold();
  });

  /** The web: a picture of this tab, through the browser's screen sharing (it asks first). */
  async function captureTab(r: DOMRect): Promise<string | null> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      } as DisplayMediaStreamOptions);
    } catch {
      return null;
    }
    try {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      // Let the sharing prompt disappear from the picture.
      await new Promise((resolve) => setTimeout(resolve, 350));
      const scale = video.videoWidth / innerWidth;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(r.width * scale);
      canvas.height = Math.round(r.height * scale);
      canvas.getContext('2d')!.drawImage(video, r.x * scale, r.y * scale, r.width * scale, r.height * scale, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    } finally {
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  async function capture() {
    const tab = browser.active;
    const section = tab && document.querySelector<HTMLElement>(`[data-tab="${tab.id}"]`);
    if (!tab || !section || !canScreenshot) {
      shot.open = false;
      return;
    }
    area = section.getBoundingClientRect();
    const control = controlFor(tab.id);
    // A site straight from the internet can draw itself; anything else is in the window.
    picture = desktop
      ? ((tab.view.type === 'web' && control?.capture ? await control.capture() : null) ??
        (await desktop.window.capture({ x: area.x, y: area.y, width: area.width, height: area.height })))
      : await captureTab(area);
    if (!picture) {
      browser.say(t('Couldn’t take a screenshot of this page.'));
      shot.open = false;
    }
  }

  function close() {
    shot.open = false;
    picture = null;
    result = null;
  }

  /** Cut the chosen part out of the picture. */
  async function cut(rect: { x: number; y: number; width: number; height: number } | null) {
    if (!picture || !area) return;
    const img = new Image();
    img.src = picture;
    await img.decode();
    const scale = img.naturalWidth / area.width;
    const r = rect ?? { x: 0, y: 0, width: area.width, height: area.height };
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(r.width * scale));
    canvas.height = Math.max(1, Math.round(r.height * scale));
    canvas.getContext('2d')!.drawImage(img, r.x * scale, r.y * scale, r.width * scale, r.height * scale, 0, 0, canvas.width, canvas.height);
    result = canvas.toDataURL('image/png');
  }

  function onpointerdown(e: PointerEvent) {
    if (result || !area) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x0: e.clientX - area.x, y0: e.clientY - area.y, x1: e.clientX - area.x, y1: e.clientY - area.y };
  }
  function onpointermove(e: PointerEvent) {
    if (drag && area) drag = { ...drag, x1: e.clientX - area.x, y1: e.clientY - area.y };
  }
  function onpointerup() {
    if (!drag) return;
    const r = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) };
    drag = null;
    cut(r.width > 8 && r.height > 8 ? r : null);
  }
  function onkeydown(e: KeyboardEvent) {
    if (!shot.open) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && !result) cut(null);
  }

  const blob = async () => (await fetch(result!)).blob();
  const fileName = () => `${t('Screenshot')} ${new Date().toLocaleString(i18n.locale).replace(/[/:.]/g, '-')}.png`;

  async function copy() {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blob() })]);
      browser.say(t('Screenshot copied.'));
      close();
    } catch {
      error = t('Couldn’t copy it.');
    }
  }

  async function save() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await blob());
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    browser.say(t('Screenshot saved to Downloads.'));
    close();
  }

  // Send it in the chat that's open, or the newest one.
  const target = $derived(chats.get(chats.focus?.id ?? null) ?? chats.list[0]);
  async function send() {
    if (!target) return;
    sending = true;
    try {
      const up = await chats.upload(target.id, await blob(), fileName());
      await chats.send(target.id, '', { attachment: { key: up.key } });
      social.showChat(target.id);
      close();
    } catch (e) {
      error = e instanceof Error ? e.message : t('Couldn’t send it.');
    } finally {
      sending = false;
    }
  }

  const box = $derived(drag ? { left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) } : null);
</script>

<svelte:window {onkeydown} />

{#if shot.open && picture && area}
  <div class="shot" style:left="{area.x}px" style:top="{area.y}px" style:width="{area.width}px" style:height="{area.height}px">
    <img src={picture} alt="" draggable="false" />
    {#if !result}
      <div class="chooser" role="presentation" {onpointerdown} {onpointermove} {onpointerup}>
        {#if box}<div class="box" style:left="{box.left}px" style:top="{box.top}px" style:width="{box.width}px" style:height="{box.height}px"></div>{/if}
        <p class="hint">{t('Drag over what you want, or press Enter for the whole page. Esc to cancel.')}</p>
      </div>
    {:else}
      <div class="done">
        <img class="preview" src={result} alt={t('Your screenshot')} />
        <div class="buttons">
          <button onclick={copy}><Icon name="copy" size={15} /> {t('Copy')}</button>
          <button onclick={save}><Icon name="download" size={15} /> {t('Save')}</button>
          {#if target}
            <button onclick={send} disabled={sending}><Icon name="send" size={15} /> {t('Send to {chat}', { chat: chats.title(target) })}</button>
          {/if}
          <button onclick={close}><Icon name="close" size={15} /> {t('Cancel')}</button>
        </div>
        {#if error}<p class="error">{error}</p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .shot {
    position: fixed;
    z-index: 75;
    overflow: hidden;
  }
  .shot > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    user-select: none;
  }
  .chooser {
    position: absolute;
    inset: 0;
    background: rgb(0 0 0 / 0.3);
    cursor: crosshair;
  }
  .box {
    position: absolute;
    border: 2px solid #fff;
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.35);
    background: rgb(255 255 255 / 0.04);
  }
  .hint {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgb(0 0 0 / 0.75);
    color: #fff;
    font-size: 13px;
    white-space: nowrap;
    pointer-events: none;
  }
  .done {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 20px;
    background: rgb(0 0 0 / 0.6);
  }
  .preview {
    max-width: 80%;
    max-height: 70%;
    border-radius: 8px;
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.5);
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .buttons button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    background: var(--card);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
  }
  .error {
    margin: 0;
    color: #ffb3ab;
  }
</style>
