// games.biggle: what every game here shares. A game happens in a room (biggle.room) named after
// its invite code (?room=…). Whoever has been in the room longest is the host: they keep the
// game's state, check each move, and send everyone the result. If they leave, the next one in
// line carries on. Seats go to the first people in (the rest watch), and free up when someone
// leaves. Remix this site to make your own games.
(() => {
  const TEXT = {
    en: {
      title: 'Games',
      signin: 'Sign in to Bigglenet to play.',
      start: 'Start a new game',
      invite: 'Send this link to a friend to play together:',
      copy: 'Copy link',
      copied: 'Copied!',
      waiting: 'Waiting for someone to join…',
      watching: 'You’re watching.',
      you: 'you',
      again: 'Play again',
      resign: 'Give up',
      back: '← All games',
      yourTurn: 'Your turn',
      theirTurn: '{name}’s turn',
      won: '{name} won!',
      youWon: 'You won! 🎉',
      draw: 'It’s a draw.',
      gaveUp: '{name} gave up.',
      checkmate: 'Checkmate!',
      stalemate: 'Stalemate: it’s a draw.',
      check: 'Check!',
      fifty: '50 moves without a capture: a draw.',
      drawing: '{name} is drawing',
      youDraw: 'You’re drawing: {word}',
      guess: 'Your guess',
      guessed: '{name} guessed it!',
      youGuessed: 'You guessed it! 🎉',
      wordWas: 'The word was {word}.',
      timeUp: 'Time’s up!',
      clear: 'Clear',
      next: 'Next round',
      needTwo: 'You need at least two people to play. Send the link to a friend!',
      points: '{n} pts',
      left: '{n} s left',
      pick: 'Pick a game',
      ttt: 'Tic-tac-toe',
      tttAbout: 'Three in a row wins. Quick and classic.',
      chess: 'Chess',
      chessAbout: 'The real thing, with castling, en passant and checkmate.',
      draw: 'Draw & guess',
      drawAbout: 'One draws, everyone else guesses. Points for being quick.',
      play: 'Play',
    },
    tr: {
      title: 'Oyunlar',
      signin: 'Oynamak için Bigglenet’e giriş yap.',
      start: 'Yeni bir oyun başlat',
      invite: 'Birlikte oynamak için bu bağlantıyı bir arkadaşına gönder:',
      copy: 'Bağlantıyı kopyala',
      copied: 'Kopyalandı!',
      waiting: 'Birinin katılması bekleniyor…',
      watching: 'İzliyorsun.',
      you: 'sen',
      again: 'Tekrar oyna',
      resign: 'Pes et',
      back: '← Bütün oyunlar',
      yourTurn: 'Sıra sende',
      theirTurn: 'Sıra {name} kişisinde',
      won: '{name} kazandı!',
      youWon: 'Kazandın! 🎉',
      draw: 'Berabere.',
      gaveUp: '{name} pes etti.',
      checkmate: 'Şah mat!',
      stalemate: 'Pat: berabere.',
      check: 'Şah!',
      fifty: '50 hamledir taş alınmadı: berabere.',
      drawing: '{name} çiziyor',
      youDraw: 'Sen çiziyorsun: {word}',
      guess: 'Tahminin',
      guessed: '{name} bildi!',
      youGuessed: 'Bildin! 🎉',
      wordWas: 'Kelime: {word}.',
      timeUp: 'Süre doldu!',
      clear: 'Temizle',
      next: 'Sonraki tur',
      needTwo: 'Oynamak için en az iki kişi gerekiyor. Bağlantıyı bir arkadaşına gönder!',
      points: '{n} puan',
      left: '{n} sn kaldı',
      pick: 'Bir oyun seç',
      ttt: 'XOX',
      tttAbout: 'Üçünü yan yana dizen kazanır. Hızlı ve klasik.',
      chess: 'Satranç',
      chessAbout: 'Gerçeği: rok, geçerken alma ve şah mat dahil.',
      draw: 'Çiz ve bil',
      drawAbout: 'Biri çizer, diğerleri tahmin eder. Hızlı olan kazanır.',
      play: 'Oyna',
    },
  };
  const lang = biggle.lang === 'tr' ? 'tr' : 'en';
  const say = (key, params = {}) => (TEXT[lang][key] ?? TEXT.en[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-say]')) el.textContent = say(el.dataset.say);

  const LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789';
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => LETTERS[b % LETTERS.length]).join('');
  const unique = (list) => [...new Set(list)];
  const $ = (sel) => document.querySelector(sel);

  let room = null;
  let opts = null;
  let me = null;
  let state = null;

  const members = () => unique(room ? room.members : []);
  const isHost = () => members()[0] === me;

  function setStatus(text) {
    const s = $('#status');
    if (s) s.textContent = text;
  }

  /** The invite link, and a way to copy it. */
  function showInvite(page, code) {
    const box = $('#invite');
    if (!box) return;
    const link = `biggle://games.biggle/${page}?room=${code}`;
    box.innerHTML = '';
    const input = Object.assign(document.createElement('input'), { value: link, readOnly: true });
    input.onclick = () => input.select();
    const copy = Object.assign(document.createElement('button'), { textContent: say('copy'), className: 'ghost' });
    copy.onclick = () => biggle.copy(link).then(() => ((copy.textContent = say('copied')), setTimeout(() => (copy.textContent = say('copy')), 1500)));
    const p = Object.assign(document.createElement('p'), { textContent: say('invite'), className: 'muted' });
    const row = Object.assign(document.createElement('div'), { className: 'invite-row' });
    row.append(input, copy);
    box.append(p, row);
  }

  /** Give empty seats to people in the room who don't have one (host only). */
  function seatPeople() {
    if (!opts.seats) return;
    const here = members();
    state.seats = Array.from({ length: opts.seats }, (_, i) => (here.includes(state.seats[i]) ? state.seats[i] : null));
    for (let i = 0; i < opts.seats; i++) {
      if (state.seats[i]) continue;
      const free = here.find((u) => !state.seats.includes(u));
      if (free) state.seats[i] = free;
    }
  }

  function broadcast() {
    room.send({ t: 'state', state });
  }

  function draw() {
    if (!state) return;
    const seat = state.seats.indexOf(me);
    opts.render({ game: state.game, seats: state.seats, me, seat, host: isHost(), members: members(), say });
  }

  /** The host checks a move and, if it's fine, tells everyone the new state. */
  function apply(move, from) {
    const seat = state.seats.indexOf(from);
    let next;
    if (move.t === 'again') {
      if (opts.seats && seat < 0) return;
      // Swap sides, so the other one starts.
      if (opts.seats) state.seats.reverse();
      next = opts.initial(state.game);
    } else {
      next = opts.apply(state.game, move, seat, from, members());
    }
    if (!next) return;
    state = { ...state, v: state.v + 1, game: next };
    broadcast();
    draw();
  }

  /** Make a move (or another game action). */
  function move(m) {
    if (!room || !state) return;
    if (isHost()) apply(m, me);
    else room.send({ t: 'move', move: m });
  }

  /** Send something straight to everyone else, not through the host (like lines being drawn). */
  function send(data) {
    room?.send({ t: 'live', data });
  }

  async function start(options) {
    opts = options;
    const page = `${opts.name}.bhtml`;
    const code = (biggle.params.get('room') || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    if (!code) {
      const a = $('#new');
      if (a) {
        a.hidden = false;
        a.href = `${page}?room=${newCode()}`;
        a.textContent = say('start');
      }
      $('#game')?.setAttribute('hidden', '');
      return;
    }
    showInvite(page, code);
    try {
      room = await biggle.room(`${opts.name}-${code}`);
    } catch {
      setStatus(say('signin'));
      return;
    }
    me = room.me;
    room.on('join', () => {
      if (isHost() && state) {
        seatPeople();
        state.v++;
        broadcast();
      }
      draw();
    });
    room.on('leave', () => {
      if (isHost() && state) {
        seatPeople();
        state.v++;
        opts.left?.(state.game, members());
        broadcast();
      }
      draw();
    });
    room.on('message', ({ from, data }) => {
      if (!data || typeof data !== 'object') return;
      if (data.t === 'hello' && isHost() && state) broadcast();
      else if (data.t === 'state' && data.state && (!state || data.state.v >= state.v || from === members()[0])) {
        state = data.state;
        draw();
      } else if (data.t === 'move' && isHost() && state) apply(data.move || {}, from);
      else if (data.t === 'live') opts.live?.(data.data, from);
    });
    if (isHost()) {
      state = { v: 1, seats: [], game: opts.initial(null) };
      seatPeople();
      broadcast();
    } else {
      room.send({ t: 'hello' });
    }
    draw();
    // The host also keeps time, for games that have it.
    if (opts.tick) setInterval(() => isHost() && state && opts.tick(state.game, (m) => apply(m, me)), 1000);
  }

  window.Game = { start, move, send, say, newCode, get me() { return me; } };
})();
