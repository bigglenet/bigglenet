// Chess: seat 0 plays white, seat 1 black. The host checks every move against the rules (check,
// castling, en passant, promotion), and spots checkmate, stalemate and the 50-move rule.
//
// The board is 64 squares, a8 first and h1 last; a piece is its colour and kind, like "wN".
const FILES = 'abcdefgh';
// The same shapes for both sides (coloured by CSS); \uFE0E keeps them from showing as emoji.
const GLYPH = { K: '♚\uFE0E', Q: '♛\uFE0E', R: '♜\uFE0E', B: '♝\uFE0E', N: '♞\uFE0E', P: '♟\uFE0E' };
const START = 'rnbqkbnrpppppppp' + ' '.repeat(32) + 'PPPPPPPPRNBQKBNR';
const row = (i) => i >> 3;
const col = (i) => i & 7;
const at = (r, c) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? r * 8 + c : -1);
const other = (side) => (side === 'w' ? 'b' : 'w');

function initial() {
  const board = [...START].map((ch) => (ch === ' ' ? null : (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toUpperCase()));
  return { board, turn: 'w', castle: 'KQkq', ep: -1, quiet: 0, last: null, result: null };
}

/** Whether `sq` is attacked by `by`. */
function attacked(board, sq, by) {
  const r = row(sq);
  const c = col(sq);
  const is = (i, kinds) => i >= 0 && board[i] && board[i][0] === by && kinds.includes(board[i][1]);
  const pawnRow = by === 'w' ? r + 1 : r - 1;
  if (is(at(pawnRow, c - 1), 'P') || is(at(pawnRow, c + 1), 'P')) return true;
  for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) if (is(at(r + dr, c + dc), 'N')) return true;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && is(at(r + dr, c + dc), 'K')) return true;
  const slide = (dirs, kinds) =>
    dirs.some(([dr, dc]) => {
      for (let k = 1; k < 8; k++) {
        const i = at(r + dr * k, c + dc * k);
        if (i < 0) return false;
        if (board[i]) return board[i][0] === by && kinds.includes(board[i][1]);
      }
      return false;
    });
  return slide([[1, 0], [-1, 0], [0, 1], [0, -1]], 'RQ') || slide([[1, 1], [1, -1], [-1, 1], [-1, -1]], 'BQ');
}

const kingOf = (board, side) => board.indexOf(side + 'K');
const inCheck = (game, side) => attacked(game.board, kingOf(game.board, side), other(side));

/** Moves that follow how pieces move, before checking they don't leave the king in check. */
function pseudo(game) {
  const { board, turn: side, ep, castle } = game;
  const moves = [];
  const add = (from, to, extra = {}) => moves.push({ from, to, ...extra });
  board.forEach((p, from) => {
    if (!p || p[0] !== side) return;
    const r = row(from);
    const c = col(from);
    const kind = p[1];
    if (kind === 'P') {
      const dir = side === 'w' ? -1 : 1;
      const one = at(r + dir, c);
      const lastRow = side === 'w' ? 0 : 7;
      const push = (to, extra) => (row(to) === lastRow ? add(from, to, { ...extra, promote: true }) : add(from, to, extra));
      if (one >= 0 && !board[one]) {
        push(one);
        const two = at(r + 2 * dir, c);
        if (r === (side === 'w' ? 6 : 1) && !board[two]) add(from, two, { double: true });
      }
      for (const dc of [-1, 1]) {
        const to = at(r + dir, c + dc);
        if (to < 0) continue;
        if (board[to] && board[to][0] !== side) push(to);
        else if (to === ep) add(from, to, { enPassant: true });
      }
    } else if (kind === 'N' || kind === 'K') {
      const steps = kind === 'N' ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of steps) {
        const to = at(r + dr, c + dc);
        if (to >= 0 && (!board[to] || board[to][0] !== side)) add(from, to);
      }
      if (kind === 'K') {
        const home = side === 'w' ? 60 : 4;
        const enemy = other(side);
        const rights = side === 'w' ? castle.toUpperCase() : castle.toLowerCase();
        if (from === home && !attacked(board, home, enemy)) {
          if (castle.includes(side === 'w' ? 'K' : 'k') && rights && !board[home + 1] && !board[home + 2] && board[home + 3] === side + 'R' && !attacked(board, home + 1, enemy) && !attacked(board, home + 2, enemy)) {
            add(from, home + 2, { castle: 'king' });
          }
          if (castle.includes(side === 'w' ? 'Q' : 'q') && !board[home - 1] && !board[home - 2] && !board[home - 3] && board[home - 4] === side + 'R' && !attacked(board, home - 1, enemy) && !attacked(board, home - 2, enemy)) {
            add(from, home - 2, { castle: 'queen' });
          }
        }
      }
    } else {
      const dirs = kind === 'R' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : kind === 'B' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of dirs) {
        for (let k = 1; k < 8; k++) {
          const to = at(r + dr * k, c + dc * k);
          if (to < 0) break;
          if (board[to]) {
            if (board[to][0] !== side) add(from, to);
            break;
          }
          add(from, to);
        }
      }
    }
  });
  return moves;
}

/** The game after a move (not checked). */
function play(game, m, promoteTo = 'Q') {
  const board = [...game.board];
  const piece = board[m.from];
  const side = piece[0];
  const taken = board[m.to] || m.enPassant;
  board[m.to] = m.promote ? side + promoteTo : piece;
  board[m.from] = null;
  if (m.enPassant) board[m.to + (side === 'w' ? 8 : -8)] = null;
  if (m.castle === 'king') [board[m.to - 1], board[m.to + 1]] = [board[m.to + 1], null];
  if (m.castle === 'queen') [board[m.to + 1], board[m.to - 2]] = [board[m.to - 2], null];
  let castle = game.castle;
  const lose = (letters) => (castle = [...castle].filter((x) => !letters.includes(x)).join(''));
  if (piece[1] === 'K') lose(side === 'w' ? 'KQ' : 'kq');
  for (const [sq, letter] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === sq || m.to === sq) lose(letter);
  return {
    ...game,
    board,
    turn: other(side),
    castle,
    ep: m.double ? (m.from + m.to) / 2 : -1,
    quiet: taken || piece[1] === 'P' ? 0 : game.quiet + 1,
    last: { from: m.from, to: m.to },
  };
}

/** Every move the side to play can make. */
const legal = (game) => pseudo(game).filter((m) => !inCheck(play(game, m), game.turn));

Game.start({
  name: 'chess',
  seats: 2,
  initial,
  apply(game, move, seat) {
    if (game.result) return null;
    const side = seat === 0 ? 'w' : seat === 1 ? 'b' : null;
    if (!side) return null;
    if (move.t === 'resign') return { ...game, result: { winner: side === 'w' ? 1 : 0, why: 'gaveUp', by: seat } };
    if (move.t !== 'move' || side !== game.turn) return null;
    const m = legal(game).find((x) => x.from === move.from && x.to === move.to);
    if (!m) return null;
    const next = play(game, m, 'QRBN'.includes(move.promote) ? move.promote : 'Q');
    if (!legal(next).length) next.result = inCheck(next, next.turn) ? { winner: seat, why: 'checkmate' } : { winner: null, why: 'stalemate' };
    else if (next.quiet >= 100) next.result = { winner: null, why: 'fifty' };
    return next;
  },
  render: draw,
});

let selected = -1;
let view = null;

function draw(v) {
  view = v;
  const { game, seats, me, seat, say } = v;
  const mySide = seat === 1 ? 'b' : 'w';
  const name = (u) => (u === me ? say('you') : u);
  const players = document.querySelector('#players');
  players.innerHTML = '';
  seats.forEach((u, i) => {
    const p = Object.assign(document.createElement('span'), { className: `player${!game.result && game.turn === (i ? 'b' : 'w') ? ' turn' : ''}` });
    p.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: i ? '♚' : '♔' }), u ? name(u) : say('waiting'));
    players.append(p);
  });
  const mine = !game.result && seat >= 0 && game.turn === mySide && seats[0] && seats[1];
  const moves = mine ? legal(game) : [];
  if (!moves.some((m) => m.from === selected)) selected = -1;
  const targets = moves.filter((m) => m.from === selected);
  const checked = !game.result && inCheck(game, game.turn) ? kingOf(game.board, game.turn) : -1;
  const board = document.querySelector('#board');
  board.innerHTML = '';
  for (let k = 0; k < 64; k++) {
    // Black sees the board from their side.
    const i = mySide === 'b' && seat === 1 ? 63 - k : k;
    const p = game.board[i];
    const b = Object.assign(document.createElement('button'), { className: (row(i) + col(i)) % 2 ? 'dark' : 'light', textContent: p ? GLYPH[p[1]] : '' });
    if (p?.[0] === 'w') b.classList.add('w');
    if (i === selected) b.classList.add('sel');
    if (game.last && (i === game.last.from || i === game.last.to)) b.classList.add('last');
    if (i === checked) b.classList.add('check');
    const target = targets.find((m) => m.to === i);
    if (target) b.classList.add('target', ...(p ? ['take'] : []));
    b.setAttribute('aria-label', `${FILES[col(i)]}${8 - row(i)}${p ? ` ${p}` : ''}`);
    b.onclick = () => {
      if (target) {
        selected = -1;
        Game.move({ t: 'move', from: target.from, to: target.to, promote: 'Q' });
      } else if (moves.some((m) => m.from === i)) {
        selected = i === selected ? -1 : i;
        draw(view);
      }
    };
    board.append(b);
  }
  let text;
  if (!seats[1]) text = say('waiting');
  else if (game.result) {
    const r = game.result;
    const winner = r.winner === null ? null : seats[r.winner];
    const head = r.why === 'checkmate' ? say('checkmate') : r.why === 'stalemate' ? say('stalemate') : r.why === 'fifty' ? say('fifty') : say('gaveUp', { name: name(seats[r.by]) });
    text = winner ? `${head} ${winner === me ? say('youWon') : say('won', { name: winner })}` : head;
  } else {
    const whose = seats[game.turn === 'w' ? 0 : 1];
    text = `${checked >= 0 ? `${say('check')} ` : ''}${seat < 0 ? `${say('watching')} ` : ''}${whose === me ? say('yourTurn') : say('theirTurn', { name: whose })}`;
  }
  document.querySelector('#status').textContent = text;
  const again = document.querySelector('#again');
  again.hidden = !game.result || seat < 0;
  again.textContent = say('again');
  again.onclick = () => Game.move({ t: 'again' });
  const resign = document.querySelector('#resign');
  resign.hidden = !!game.result || seat < 0 || !seats[1];
  resign.textContent = say('resign');
  resign.onclick = () => Game.move({ t: 'resign' });
}
