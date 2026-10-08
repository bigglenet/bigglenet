// Reading the files out of a .zip, with the browser's own decompression (no library needed).
// Handles the ordinary zips that computers make; not zip64 or encrypted ones.

const MAX_ZIP = 50_000_000;

export async function unzip(zip: Blob): Promise<Map<string, Blob>> {
  if (zip.size > MAX_ZIP) throw new Error('That .zip is too big. A Biggle site can use up to 5 MB.');
  const buf = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(buf.buffer);

  // The list of files is at the end, found through a record in the last 64 KB.
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("That file isn't a .zip.");

  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const out = new Map<string, Blob>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('That .zip looks damaged.');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLength));
    p += 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    if (name.endsWith('/')) continue;
    if (size === 0xffffffff || local === 0xffffffff) throw new Error("That .zip is a kind Biggle can't open. Try making it again.");

    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = new Blob([buf.subarray(start, start + size)]);
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob());
    else throw new Error(`${name} is packed in a way Biggle can't open. Try making the .zip again.`);
  }
  return out;
}
