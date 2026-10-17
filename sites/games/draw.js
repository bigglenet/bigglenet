// Draw & guess: everyone in the room plays. Each round someone draws a word only they see, and
// the others guess. Guessing quickly scores more, and the drawer scores for each right guess.
// The drawer's own page picks the word and tells the others only its length and a fingerprint, so
// a guesser's page can tell when they've got it without anyone seeing the word early.
const WORDS = {
  en: ['cat', 'dog', 'house', 'tree', 'sun', 'moon', 'star', 'car', 'boat', 'plane', 'fish', 'bird', 'apple', 'banana', 'pizza', 'cake', 'ice cream', 'robot', 'rocket', 'castle', 'dragon', 'flower', 'rainbow', 'snowman', 'guitar', 'piano', 'phone', 'computer', 'glasses', 'hat', 'shoe', 'umbrella', 'clock', 'key', 'book', 'chair', 'bed', 'train', 'bicycle', 'mountain', 'island', 'volcano', 'ghost', 'pirate', 'crown', 'heart', 'cloud', 'lightning', 'spider', 'snake', 'turtle', 'penguin', 'elephant', 'giraffe', 'octopus', 'cactus', 'mushroom', 'balloon', 'kite', 'camera'],
  tr: ['kedi', 'köpek', 'ev', 'ağaç', 'güneş', 'ay', 'yıldız', 'araba', 'gemi', 'uçak', 'balık', 'kuş', 'elma', 'muz', 'pizza', 'pasta', 'dondurma', 'robot', 'roket', 'kale', 'ejderha', 'çiçek', 'gökkuşağı', 'kardan adam', 'gitar', 'piyano', 'telefon', 'bilgisayar', 'gözlük', 'şapka', 'ayakkabı', 'şemsiye', 'saat', 'anahtar', 'kitap', 'sandalye', 'yatak', 'tren', 'bisiklet', 'dağ', 'ada', 'yanardağ', 'hayalet', 'korsan', 'taç', 'kalp', 'bulut', 'şimşek', 'örümcek', 'yılan', 'kaplumbağa', 'penguen', 'fil', 'zürafa', 'ahtapot', 'kaktüs', 'mantar', 'balon', 'uçurtma', 'kamera'],
};
const ROUND_MS = 80_000;
const COLOURS = ['#111111', '#e03131', '#f08c00', '#2f9e44', '#1971c2', '#9c36b5', '#ffffff'];

/** A guess as it's compared: lower case, without accents, so "agac" counts for "ağaç". */
const fold = (s) =>
  String(s)
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** A fingerprint of a word (FNV-1a), so guessers can check without seeing it. */
const print = (word, salt) => {
  let h = 0x811c9dc5;
  for (const ch of salt + fold(word)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(36);
};

const canvas = document.querySelector('#canvas');
const ctx = canvas.getContext('2d');
let view = null;
let secret = null; // { round, word }, on the drawer's page only
let colour = COLOURS[0];
let shownRound = -1;
let seenGuessed = 0;

function line(points, c, w) {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] * canvas.width;
    const y = points[i + 1] * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (points.length === 2) ctx.lineTo(points[0] * canvas.width + 0.1, points[1] * canvas.height);
  ctx.stroke();
}
const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

function feed(text, good = false) {
  const p = Object.assign(document.createElement('p'), { textContent: text, className: good ? 'good' : '' });
  const f = document.querySelector('#feed');
  f.append(p);
  f.scrollTop = f.scrollHeight;
}

// --- Drawing (only the drawer) ---

let stroke = null;
let pending = [];
const amDrawing = () => view && view.game.phase === 'drawing' && view.game.drawer === view.me;
const point = (e) => {
  const r = canvas.getBoundingClientRect();
  return [Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000];
};
canvas.addEventListener('pointerdown', (e) => {
  if (!amDrawing()) return;
  canvas.setPointerCapture(e.pointerId);
  stroke = point(e);
  pending = [...stroke];
  line(stroke, colour, colour === '#ffffff' ? 28 : 6);
});
canvas.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const p = point(e);
  line([...stroke.slice(-2), ...p], colour, colour === '#ffffff' ? 28 : 6);
  stroke.push(...p);
  pending.push(...p);
});
const flush = () => {
  if (pending.length >= 2) Game.send({ k: 'line', p: pending, c: colour, w: colour === '#ffffff' ? 28 : 6 });
  // Carry on from the last point, so pieces join up.
  pending = stroke ? stroke.slice(-2) : [];
};
setInterval(() => stroke && flush(), 60);
canvas.addEventListener('pointerup', () => {
  flush();
  stroke = null;
  pending = [];
});

const tools = document.querySelector('#tools');
for (const c of COLOURS) {
  const b = Object.assign(document.createElement('button'), { className: `dot${c === colour ? ' on' : ''}`, title: c });
  b.style.background = c;
  b.setAttribute('aria-label', c);
  b.onclick = () => {
    colour = c;
    for (const d of tools.querySelectorAll('.dot')) d.classList.toggle('on', d === b);
  };
  tools.append(b);
}
const clearButton = Object.assign(document.createElement('button'), { className: 'ghost', textContent: Game.say('clear') });
clearButton.onclick = () => {
  clear();
  Game.send({ k: 'clear' });
};
tools.append(clearButton);

// --- Guessing ---

document.querySelector('#guess').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.querySelector('#guess-text');
  const text = input.value.trim();
  input.value = '';
  if (!text || !view) return;
  const g = view.game;
  if (g.phase === 'drawing' && print(text, g.salt) === g.print) Game.move({ t: 'correct' });
  else {
    feed(`${Game.say('you')}: ${text}`);
    Game.send({ k: 'say', text: text.slice(0, 40) });
  }
});

Game.start({
  name: 'draw',
  seats: 0,
  initial: (old) => ({ phase: 'waiting', round: old ? old.round : 0, drawer: null, len: 0, salt: '', print: '', endsAt: 0, guessed: [], scores: old ? old.scores : {}, word: null }),
  apply(g, m, _seat, from, members) {
    if (m.t === 'begin') {
      if (g.phase === 'drawing' || members.length < 2) return null;
      const at = members.indexOf(g.drawer);
      const drawer = members[(at + 1) % members.length];
      return { ...g, phase: 'picking', round: g.round + 1, drawer, len: 0, salt: '', print: '', endsAt: 0, guessed: [], word: null };
    }
    if (m.t === 'picked' && g.phase === 'picking' && from === g.drawer) {
      return { ...g, phase: 'drawing', len: Number(m.len) || 0, salt: String(m.salt), print: String(m.print), endsAt: Date.now() + ROUND_MS };
    }
    if (m.t === 'correct' && g.phase === 'drawing' && from !== g.drawer && !g.guessed.includes(from)) {
      const guessed = [...g.guessed, from];
      const scores = { ...g.scores, [from]: (g.scores[from] || 0) + Math.max(10 - 2 * g.guessed.length, 3), [g.drawer]: (g.scores[g.drawer] || 0) + 2 };
      const everyone = members.filter((u) => u !== g.drawer).every((u) => guessed.includes(u));
      return { ...g, guessed, scores, phase: everyone ? 'between' : 'drawing' };
    }
    if (m.t === 'reveal' && g.phase === 'between' && from === g.drawer && !g.word) return { ...g, word: String(m.word).slice(0, 40) };
    if (m.t === 'timeup' && g.phase === 'drawing') return { ...g, phase: 'between' };
    if (m.t === 'gone' && (g.phase === 'drawing' || g.phase === 'picking')) return { ...g, phase: 'between' };
    return null;
  },
  // The host keeps time, and moves on if the drawer leaves.
  tick(g, apply) {
    if (g.phase === 'drawing' && Date.now() > g.endsAt) apply({ t: 'timeup' });
  },
  left(g, members) {
    if ((g.phase === 'drawing' || g.phase === 'picking') && !members.includes(g.drawer)) g.phase = 'between';
  },
  live(data, from) {
    if (data.k === 'line' && Array.isArray(data.p)) line(data.p.slice(0, 4000).map(Number), String(data.c).slice(0, 9), Math.min(Number(data.w) || 6, 40));
    else if (data.k === 'clear') clear();
    else if (data.k === 'say') feed(`${from}: ${String(data.text).slice(0, 40)}`);
  },
  render: draw,
});

function draw(v) {
  view = v;
  const { game: g, me, members, say } = v;
  if (g.round !== shownRound) {
    shownRound = g.round;
    seenGuessed = 0;
    clear();
  }
  // Right guesses, as they come in.
  for (const u of g.guessed.slice(seenGuessed)) feed(u === me ? say('youGuessed') : say('guessed', { name: u }), true);
  seenGuessed = g.guessed.length;

  // The drawer's page picks the word, and later says what it was.
  if (g.phase === 'picking' && g.drawer === me && secret?.round !== g.round) {
    const list = WORDS[biggle.lang === 'tr' ? 'tr' : 'en'];
    const word = list[Math.floor(Math.random() * list.length)];
    const salt = Game.newCode();
    secret = { round: g.round, word };
    // After this drawing is done (the move may come straight back to this page).
    queueMicrotask(() => Game.move({ t: 'picked', len: word.length, salt, print: print(word, salt) }));
  }
  if (g.phase === 'between' && g.drawer === me && secret?.round === g.round && !g.word) queueMicrotask(() => Game.move({ t: 'reveal', word: secret.word }));

  const scores = document.querySelector('#scores');
  scores.innerHTML = '';
  for (const u of members) {
    const li = Object.assign(document.createElement('li'), { className: u === g.drawer && g.phase !== 'waiting' ? 'drawing' : '' });
    li.append(`${u === g.drawer && g.phase !== 'waiting' ? '✏️ ' : ''}${u === me ? `${u} (${say('you')})` : u}`, Object.assign(document.createElement('span'), { textContent: say('points', { n: g.scores[u] || 0 }) }));
    scores.append(li);
  }

  let text = '';
  if (members.length < 2) text = say('needTwo');
  else if (g.phase === 'drawing' && g.drawer === me) text = say('youDraw', { word: secret?.round === g.round ? secret.word : '…' });
  else if (g.phase === 'drawing') text = `${say('drawing', { name: g.drawer })} · ${'_ '.repeat(g.len).trim()}`;
  else if (g.phase === 'picking') text = say('drawing', { name: g.drawer });
  else if (g.phase === 'between') text = `${g.guessed.length && members.filter((u) => u !== g.drawer).every((u) => g.guessed.includes(u)) ? '' : `${say('timeUp')} `}${g.word ? say('wordWas', { word: g.word }) : ''}`;
  document.querySelector('#status').textContent = text;

  tools.hidden = !amDrawing();
  document.querySelector('#guess').hidden = g.phase !== 'drawing' || g.drawer === me || g.guessed.includes(me);
  document.querySelector('#guess-text').placeholder = say('guess');
  const next = document.querySelector('#next');
  next.hidden = g.phase === 'drawing' || g.phase === 'picking' || members.length < 2;
  next.textContent = say('next');
  next.onclick = () => Game.move({ t: 'begin' });
}

// Time left, for everyone (the host's clock decides when it's up).
setInterval(() => {
  if (!view || view.game.phase !== 'drawing') return;
  const left = Math.max(0, Math.ceil((view.game.endsAt - Date.now()) / 1000));
  const s = document.querySelector('#status');
  s.textContent = s.textContent.replace(/ · \d+ s.*$| · \d+ sn.*$/, '') + ` · ${Game.say('left', { n: left })}`;
}, 1000);
