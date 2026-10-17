// Tic-tac-toe: seat 0 is ✕ and starts, seat 1 is ○.
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const MARKS = ['✕', '○'];
const winLine = (b) => LINES.find(([a, c, d]) => b[a] !== null && b[a] === b[c] && b[a] === b[d]);

Game.start({
  name: 'tictactoe',
  seats: 2,
  initial: () => ({ board: Array(9).fill(null), turn: 0, over: null }),
  apply(game, move, seat) {
    if (game.over || seat !== game.turn || move.t !== 'mark') return null;
    const i = Number(move.i);
    if (!(i >= 0 && i < 9) || game.board[i] !== null) return null;
    const board = [...game.board];
    board[i] = seat;
    const line = winLine(board);
    const over = line ? { winner: seat, line } : board.every((c) => c !== null) ? { winner: null } : null;
    return { board, turn: 1 - seat, over };
  },
  render({ game, seats, me, seat, say }) {
    const name = (u) => (u === me ? say('you') : u);
    document.querySelector('#players').innerHTML = '';
    seats.forEach((u, i) => {
      const p = Object.assign(document.createElement('span'), { className: `player${!game.over && game.turn === i ? ' turn' : ''}` });
      p.append(Object.assign(document.createElement('span'), { className: 'chip', textContent: MARKS[i] }), u ? name(u) : say('waiting'));
      document.querySelector('#players').append(p);
    });
    const board = document.querySelector('#board');
    board.innerHTML = '';
    game.board.forEach((c, i) => {
      const b = Object.assign(document.createElement('button'), { textContent: c === null ? '' : MARKS[c], className: c === null ? '' : c ? 'o' : 'x' });
      if (game.over?.line?.includes(i)) b.classList.add('win');
      b.disabled = !!game.over || c !== null || seat !== game.turn || !seats[1 - seat];
      b.setAttribute('aria-label', c === null ? String(i + 1) : MARKS[c]);
      b.onclick = () => Game.move({ t: 'mark', i });
      board.append(b);
    });
    let text;
    if (!seats[1]) text = say('waiting');
    else if (game.over) text = game.over.winner === null ? say('draw') : seats[game.over.winner] === me ? say('youWon') : say('won', { name: seats[game.over.winner] });
    else if (seat < 0) text = `${say('watching')} ${say('theirTurn', { name: seats[game.turn] })}`;
    else text = game.turn === seat ? say('yourTurn') : say('theirTurn', { name: seats[game.turn] });
    document.querySelector('#status').textContent = text;
    const again = document.querySelector('#again');
    again.hidden = !game.over || seat < 0;
    again.textContent = say('again');
    again.onclick = () => Game.move({ t: 'again' });
  },
});
