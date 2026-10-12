// Getting files ready to send in a chat: big photos are made smaller (sharp enough to look at,
// quick to send), and pictures say how big they are so the chat can keep their place.

const MAX_SIDE = 2048;
const KEEP_UNDER = 1_500_000;
export const MAX_FILE = 10 * 1024 * 1024;

export type Prepared = { blob: Blob; name: string; width?: number; height?: number; duration?: number };

async function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  if (webp?.type === 'image/webp') return webp;
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
}

export async function prepare(file: File): Promise<Prepared> {
  const name = file.name || 'file';
  // Animated GIFs and drawings (SVG) stay as they are.
  if (!/^image\/(png|jpeg|webp|avif|bmp)$/.test(file.type)) {
    if (file.type.startsWith('image/')) return { blob: file, name, ...(await imageSize(file)) };
    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) return { blob: file, name, ...(await mediaInfo(file)) };
    return { blob: file, name };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { blob: file, name };
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (scale === 1 && file.size <= KEEP_UNDER) {
    bitmap.close();
    return { blob: file, name, width, height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = (await encode(canvas)) ?? file;
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : null;
  return { blob, name: ext ? name.replace(/\.[^.]+$/, '') + '.' + ext : name, width: canvas.width, height: canvas.height };
}

async function imageSize(file: Blob): Promise<{ width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

function mediaInfo(file: Blob): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
    const url = URL.createObjectURL(file);
    const done = (info: { width?: number; height?: number; duration?: number }) => {
      URL.revokeObjectURL(url);
      resolve(info);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () =>
      done({
        duration: Number.isFinite(el.duration) ? Math.round(el.duration) : undefined,
        ...(el instanceof HTMLVideoElement && el.videoWidth ? { width: el.videoWidth, height: el.videoHeight } : {}),
      });
    el.onerror = () => done({});
    setTimeout(() => done({}), 4000);
    el.src = url;
  });
}

/** Records a voice message from the microphone. */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private started = 0;

  static get supported() {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.stream, type ? { mimeType: type, audioBitsPerSecond: 48_000 } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(250);
    this.started = Date.now();
  }

  /** Seconds so far. */
  get seconds() {
    return this.started ? (Date.now() - this.started) / 1000 : 0;
  }

  /** Stop, and get the recording (or null if it was cancelled). */
  stop(keep: boolean): Promise<{ blob: Blob; duration: number } | null> {
    const recorder = this.recorder;
    const duration = Math.max(1, Math.round(this.seconds));
    return new Promise((resolve) => {
      const finish = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        this.recorder = null;
        this.started = 0;
        if (!keep || !this.chunks.length) return resolve(null);
        const type = (recorder?.mimeType || 'audio/webm').split(';')[0];
        resolve({ blob: new Blob(this.chunks, { type }), duration });
      };
      if (!recorder || recorder.state === 'inactive') return finish();
      recorder.onstop = finish;
      recorder.stop();
    });
  }
}
