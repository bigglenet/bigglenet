// Confirming an email by emailing us. Sending email to anyone needs a paid mail service, but
// receiving it is free: Cloudflare Email Routing hands mail for JOIN_ADDRESS to this Worker.
// The app shows a code; the person emails it to us; we confirm the request with that code if
// the email really came from the address they typed in.
//
// Cloudflare checks SPF, DKIM and DMARC on arrival and adds an Authentication-Results header
// above everything the sender wrote. So we only trust the topmost one: any further down could
// have been written by the sender, who could claim whatever they like.
import { confirmByMail } from './auth';

const READ_LIMIT = 64 * 1024;

export async function receive(message: ForwardableEmailMessage, env: Env) {
  if (!env.JOIN_ADDRESS || message.to.toLowerCase() !== env.JOIN_ADDRESS.toLowerCase()) {
    message.setReject('Nobody here by that name.');
    return;
  }
  const raw = await readStart(message.raw);
  const split = raw.search(/\r?\n\r?\n/);
  const headers = parseHeaders(split < 0 ? raw : raw.slice(0, split));
  const body = split < 0 ? '' : raw.slice(split);

  const from = address(header(headers, 'from') ?? '');
  const domain = from?.split('@')[1];
  const verdict = domain ? checkAuth(headers, domain) : 'no sender';
  console.log('Join email', { verdict, headers: headers.map(([name]) => name).slice(0, 12) });
  if (!from || verdict !== 'pass') {
    message.setReject(
      `We couldn't check that this email really came from ${from ?? 'you'}, so it didn't confirm anything. ` +
        'Try sending it from a different email address.',
    );
    return;
  }

  const subject = decodeWords(header(headers, 'subject') ?? '');
  const codes = [...new Set([...subject.matchAll(/\b\d{6}\b/g), ...body.matchAll(/\b\d{6}\b/g)].map((m) => m[0]))].slice(0, 20);
  if (!(await confirmByMail(env, from, codes))) {
    message.setReject(
      `Bigglenet isn't waiting for a code from ${from}. Send the email from the same address you typed in the app, ` +
        'with the code from the app in it. Codes last 15 minutes.',
    );
  }
}

/** The first part of the message: enough for the headers and a typed note. */
async function readStart(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (text.length < READ_LIMIT) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return text;
}

/** Headers in order, top first, with folded lines joined back up. */
function parseHeaders(block: string): [name: string, value: string][] {
  const out: [string, string][] = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1][1] += ' ' + line.trim();
    else {
      const colon = line.indexOf(':');
      if (colon > 0) out.push([line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()]);
    }
  }
  return out;
}

const header = (headers: [string, string][], name: string) => headers.find(([n]) => n === name)?.[1];

/** The email address in a From header: "Name <a@b.c>" or "a@b.c". */
function address(value: string): string | null {
  const m = value.match(/<([^<>\s]+@[^<>\s]+)>/) ?? value.match(/([^\s<>"',;:]+@[^\s<>"',;:]+)/);
  return m ? m[1].toLowerCase() : null;
}

/** Same organisation, roughly: one domain is the other or a subdomain of it. */
const aligned = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/**
 * Did Cloudflare find the From address genuine? It did if DMARC passed, or DKIM or SPF passed
 * for the From domain (DMARC's own rule, for senders with no DMARC policy).
 */
function checkAuth(headers: [string, string][], domain: string): 'pass' | string {
  const top = headers.find(([n]) => n === 'authentication-results');
  if (!top) return 'no results';
  const [server, ...results] = top[1].replace(/\([^)]*\)/g, ' ').split(';').map((s) => s.trim());
  if (server.toLowerCase() !== 'mx.cloudflare.net') return `results from ${server}`;

  const seen: string[] = [];
  for (const part of results) {
    const [method, ...props] = part.split(/\s+/);
    const [name, result] = method.toLowerCase().split('=');
    const prop = (key: string) => props.find((p) => p.toLowerCase().startsWith(`${key}=`))?.slice(key.length + 1).toLowerCase();
    const checked =
      name === 'dmarc' ? prop('header.from') : name === 'dkim' ? prop('header.d') : name === 'spf' ? prop('smtp.mailfrom')?.split('@').pop() : undefined;
    if (result === 'pass' && checked && aligned(checked, domain)) return 'pass';
    seen.push(`${method} ${checked ?? ''}`.trim());
  }
  return `not authenticated: ${seen.join(', ')}`;
}

/** Decode =?utf-8?B?...?= and =?utf-8?Q?...?= words in a header. */
function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (whole, charset: string, kind: string, text: string) => {
    try {
      const binary =
        kind.toUpperCase() === 'B'
          ? atob(text)
          : text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
      return new TextDecoder(charset).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    } catch {
      return whole;
    }
  });
}
