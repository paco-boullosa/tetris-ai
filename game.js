'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#5a5a6e', // 8 - gris (basura / bloques fijos de los desafíos)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const menuBtn = document.getElementById('menu-btn');
const menuEl = document.getElementById('menu');
const menuList = document.getElementById('menu-list');
const endBox = document.getElementById('end-box');
const goalSection = document.getElementById('goal-section');
const goalText = document.getElementById('goal-text');
const goalProgress = document.getElementById('goal-progress');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let mode = null, elapsed = 0, garbageAccum = 0, startLevel = 1;
let showGhost = true; // se alterna con la tecla G; no se resetea en init()

const GARBAGE_EVERY = 10000;
const TIME_LIMIT = 120000;

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function countGray() {
  let n = 0;
  for (const row of board) for (const v of row) if (v === 8) n++;
  return n;
}

// Cada desafío: startLevel, setup(), tick(dt), checkWin(), checkLose() -> motivo | null, goal, progress()
const CHALLENGES = [
  {
    id: 'sprint', name: 'Sprint 40', desc: 'Limpia 40 líneas en 2 minutos',
    startLevel: 1,
    goal: 'Limpia 40 líneas en 2:00',
    progress: () => `${lines}/40 · ${fmtTime(TIME_LIMIT - elapsed)}`,
    checkWin: () => lines >= 40,
    checkLose: () => (elapsed >= TIME_LIMIT ? 'Se acabó el tiempo' : null),
  },
  {
    id: 'garbage', name: 'Marea de basura', desc: 'Sobrevive 2 minutos con basura subiendo cada 10 s',
    startLevel: 1,
    goal: 'Sobrevive 2:00 (sube basura cada 10 s)',
    progress: () => `${fmtTime(TIME_LIMIT - elapsed)} · basura en ${Math.ceil((GARBAGE_EVERY - garbageAccum) / 1000)}s`,
    tick(dt) {
      garbageAccum += dt;
      while (garbageAccum >= GARBAGE_EVERY && !gameOver) {
        garbageAccum -= GARBAGE_EVERY;
        addGarbageRow();
      }
    },
    checkWin: () => elapsed >= TIME_LIMIT,
  },
  {
    id: 'fixed', name: 'Bloques fijos', desc: 'Elimina todos los bloques grises pre-colocados',
    startLevel: 1,
    goal: 'Elimina todos los bloques grises',
    progress: () => `${countGray()} bloques restantes`,
    setup() {
      for (let r = ROWS - 6; r < ROWS; r++) {
        const hole = Math.floor(Math.random() * COLS);
        for (let c = 0; c < COLS; c++)
          if (c !== hole && Math.random() < 0.65) board[r][c] = 8;
      }
    },
    checkWin: () => countGray() === 0,
  },
  {
    id: 'invisible', name: 'Piezas fantasma', desc: 'Las piezas se vuelven invisibles al fijarse. Limpia 20 líneas',
    startLevel: 1,
    goal: 'Limpia 20 líneas (piezas invisibles)',
    progress: () => `${lines}/20`,
    checkWin: () => lines >= 20,
  },
  {
    id: 'reverse', name: 'Rotación inversa', desc: 'Empiezas en nivel 5; desde el nivel 6 la rotación se invierte. Llega al nivel 8',
    startLevel: 5,
    goal: 'Llega al nivel 8 (rotación inversa desde nivel 6)',
    progress: () => `Nivel ${level}/8${level >= 6 ? ' · ROT. INVERSA' : ''}`,
    checkWin: () => level >= 8,
  },
];

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function rotateCCW(shape) {
  return rotateCW(rotateCW(rotateCW(shape)));
}

function reverseRotation() {
  return mode?.id === 'reverse' && level >= 6;
}

function tryRotate() {
  const rotated = reverseRotation() ? rotateCCW(current.shape) : rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  if (mode?.checkWin?.()) {
    endGame(true);
    return;
  }
  spawn();
}

function addGarbageRow() {
  if (board[0].some(v => v)) { endGame(false, 'La basura llegó arriba'); return; }
  const hole = Math.floor(Math.random() * COLS);
  const row = new Array(COLS).fill(8);
  row[hole] = 0;
  board.shift();
  board.push(row);
  if (collide(current.shape, current.x, current.y)) {
    current.y--;
    if (collide(current.shape, current.x, current.y)) endGame(false, 'La basura te aplastó');
  }
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (!(mode?.id === 'invisible' && !gameOver && board[r][c] < 8))
        drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  if (showGhost) {
    const gy = ghostY();
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        if (current.shape[r][c])
          drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  }

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame(won = false, reason = '') {
  gameOver = true;
  cancelAnimationFrame(animId);
  if (current) draw();
  overlayTitle.textContent = won ? '¡DESAFÍO SUPERADO!' : 'GAME OVER';
  overlayTitle.classList.toggle('win', won);
  const parts = [];
  if (reason) parts.push(reason);
  parts.push(`Puntuación: ${score.toLocaleString()}`);
  if (mode) parts.push(`Tiempo: ${fmtTime(elapsed)}`);
  overlayScore.textContent = parts.join('\n');
  showEndBox();
}

function showEndBox() {
  menuEl.classList.add('hidden');
  endBox.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function showMenu() {
  cancelAnimationFrame(animId);
  gameOver = true; // bloquea el input mientras se ve el menú
  goalSection.classList.add('hidden');
  endBox.classList.add('hidden');
  menuEl.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function buildMenu() {
  const entries = [{ id: null, name: 'Clásico', desc: 'Juego libre sin objetivo' }, ...CHALLENGES];
  for (const m of entries) {
    const btn = document.createElement('button');
    btn.className = 'mode-btn';
    const name = document.createElement('strong');
    name.textContent = m.name;
    const desc = document.createElement('span');
    desc.textContent = m.desc;
    btn.append(name, desc);
    btn.addEventListener('click', () => init(m.id));
    menuList.appendChild(btn);
  }
}

function updateGoal() {
  if (!mode) return;
  goalProgress.textContent = mode.progress();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    overlay.classList.add('hidden');
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayTitle.classList.remove('win');
    overlayScore.textContent = '';
    showEndBox();
  }
}

function loop(ts) {
  const dt = Math.max(0, ts - lastTime);
  lastTime = ts;
  dropAccum += dt;
  elapsed += dt;

  if (mode) {
    mode.tick?.(dt);
    if (gameOver) return;
    if (mode.checkWin?.()) { endGame(true); return; }
    const loseReason = mode.checkLose?.();
    if (loseReason) { endGame(false, loseReason); return; }
  }

  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return; // endGame() dentro de lockPiece/spawn: no seguir el bucle
  draw();
  updateGoal();
  animId = requestAnimationFrame(loop);
}

function init(modeId = null) {
  cancelAnimationFrame(animId);
  mode = CHALLENGES.find(m => m.id === modeId) || null;
  startLevel = mode?.startLevel ?? 1;
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  elapsed = 0;
  garbageAccum = 0;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  lastTime = performance.now();
  mode?.setup?.();
  next = randomPiece();
  spawn();
  updateHUD();
  overlayTitle.classList.remove('win');
  if (mode) {
    goalText.textContent = mode.goal;
    goalSection.classList.remove('hidden');
    updateGoal();
  } else {
    goalSection.classList.add('hidden');
  }
  overlay.classList.add('hidden');
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyM' && (paused || gameOver)) { showMenu(); return; }
  if (e.code === 'KeyG') {
    showGhost = !showGhost;
    if (current && !paused && !gameOver) draw();
    return;
  }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => init(mode ? mode.id : null));
menuBtn.addEventListener('click', showMenu);

buildMenu();
showMenu();
