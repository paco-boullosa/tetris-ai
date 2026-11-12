# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No build, no dependencies, no package.json, no tests, no linter. README.md is in Spanish; UI strings are Spanish too.

## Running

Open `index.html` directly (`open index.html`), or serve statically (`python3 -m http.server 8000`). Reload the browser to see changes.

## Architecture

Three files: `index.html` (DOM + two canvases), `style.css`, and `game.js` (all logic, one script, global state, no modules).

- **Global mutable state** in `game.js` (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, ...) is declared once and reset by `init()`. Restart button just calls `init()`.
- **Board** is a `ROWS × COLS` matrix of `0` or a color/piece index 1–7; `COLORS` and `PIECES` are indexed by that same number (index 0 is `null`). Adding a piece means adding to both arrays and updating `randomPiece()`'s hardcoded `* 7`.
- **Game loop**: `loop(ts)` via `requestAnimationFrame` accumulates `dropAccum` and drops one row when it reaches `dropInterval`. Pause/game over stop it with `cancelAnimationFrame(animId)`; unpausing restarts it by calling `loop` directly.
- **Piece lifecycle**: `lockPiece()` → `merge()` → `clearLines()` (updates score/level/speed) → `spawn()` (promotes `next`; calls `endGame()` if the spawn collides).
- Rotation is `rotateCW` plus a simple horizontal kick list `[0,-1,1,-2,2]` in `tryRotate` (not SRS).
- Rendering is split between `draw()` (main board, ghost at alpha 0.2) and `drawNext()` (preview canvas).

## Gotchas

- Canvas size in `index.html` (`300×600` board, `120×120` next) must match `COLS*BLOCK` × `ROWS*BLOCK` if those constants change.
- `endGame()` is called inside `spawn()`, which is called by `lockPiece()` from `loop`; `loop` still calls `requestAnimationFrame` afterward, so the loop is not strictly halted by `cancelAnimationFrame` in that same frame — be careful when changing end-of-game flow.
- Scoring/speed formulas (`LINE_SCORES × level`, `max(100, 1000 − (level−1)×90)`, hard drop +2/cell, soft drop +1/row) are duplicated in README.md; update both when changing them.
