// --- Compatibility: ctx.roundRect is missing in older Safari/Firefox and would kill the render loop ---
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        r = Array.isArray(r) ? (r[0] || 0) : (r || 0);
        r = Math.max(0, Math.min(r, w / 2, h / 2));
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
    };
}

// --- Shared Utilities & Navigation Logic ---
function openGame(gameId) {
    document.getElementById('home-menu').classList.remove('active');
    document.querySelectorAll('.game-container').forEach(c => c.classList.remove('active'));
    document.getElementById(gameId).classList.add('active');
    document.getElementById('global-back-btn').style.display = 'block';

    if (gameId === 'snakeladder') drawSLBoard();
    if (gameId === 'arkanoid') resumeArkanoid();
}

function returnToMenu() {
    leaveAllFullscreen();
    document.querySelectorAll('.game-container').forEach(c => c.classList.remove('active'));
    document.getElementById('home-menu').classList.add('active');
    document.getElementById('global-back-btn').style.display = 'none';

    // Safety Pauses
    if(typeof snakePaused !== 'undefined' && snakeGameActive) snakePaused = true;
    if (typeof arkState !== 'undefined') { if (arkState.mode === 'PLAYING') arkState.mode = 'PAUSED'; arkReleaseKeys(); } 
}

// --- Fullscreen (cross-browser, with CSS fallback for browsers that lack the API, e.g. iPhone Safari) ---
const FS_POPUPS = { tictactoe: 'ttt-popup', snake: 'snake-popup', snakeladder: 'sl-popup', tetris: 'tetris-popup' };

function getFsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function requestFs(elem) {
    const fn = elem.requestFullscreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen;
    if (!fn) return false;
    try {
        const p = fn.call(elem);
        if (p && typeof p.catch === 'function') p.catch(() => enterFsUI(elem, true));
        return true;
    } catch (e) { return false; }
}

function exitFs() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!fn) return;
    try {
        const p = fn.call(document);
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) {}
}

// Only the fullscreen element's subtree is rendered, so the game's popup (game over, winner...)
// must live inside it while fullscreen, otherwise it is invisible and the game looks frozen.
function enterFsUI(c, pseudo) {
    c.classList.add('fs-active');
    c.classList.toggle('pseudo-fs', !!pseudo);
    c.scrollTop = 0; requestAnimationFrame(() => { c.scrollTop = 0; }); // keep the scroll position from before fullscreen from clipping the top
    const pop = document.getElementById(FS_POPUPS[c.id]);
    if (pop && !pseudo) c.appendChild(pop);
    if (!c.querySelector('.fs-exit-btn')) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fs-exit-btn';
        b.textContent = '\u2715 Exit';
        b.setAttribute('aria-label', 'Exit fullscreen');
        b.addEventListener('click', () => toggleFullscreen(c.id));
        c.appendChild(b);
    }
}

function leaveFsUI(c) {
    c.classList.remove('fs-active', 'pseudo-fs');
    const pop = document.getElementById(FS_POPUPS[c.id]);
    if (pop && pop.parentElement === c) document.body.appendChild(pop);
    const b = c.querySelector('.fs-exit-btn');
    if (b) b.remove();
}

function toggleFullscreen(elemId) {
    const elem = document.getElementById(elemId);
    if (!elem) return;
    if (elem.classList.contains('pseudo-fs')) { leaveFsUI(elem); return; }
    if (getFsElement()) { exitFs(); return; }
    if (!requestFs(elem)) enterFsUI(elem, true);
}

function leaveAllFullscreen() {
    document.querySelectorAll('.game-container.pseudo-fs').forEach(leaveFsUI);
    if (getFsElement()) exitFs();
}

function syncFullscreenUI() {
    const fsEl = getFsElement();
    document.querySelectorAll('.game-container.fs-active:not(.pseudo-fs)').forEach(c => { if (c !== fsEl) leaveFsUI(c); });
    if (fsEl && fsEl.classList && fsEl.classList.contains('game-container')) enterFsUI(fsEl, false);
}
['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(ev => document.addEventListener(ev, syncFullscreenUI));
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.game-container.pseudo-fs').forEach(leaveFsUI);
});

// --- Tic-Tac-Toe Logic ---
const boardElement = document.getElementById('ttt-board');
let tttBoard = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let tttGameActive = true;
let statsTTT = { X: 0, tie: 0, O: 0 };

function getPlayerName(symbol) {
    let mode = document.getElementById('ttt-mode').value;
    if (mode === '2P') return symbol === 'X' ? 'Player X' : 'Player O';
    return symbol === 'X' ? 'Player X' : 'Computer';
}

function initTTT() {
    boardElement.innerHTML = '';
    tttBoard.forEach((cell, index) => {
        const cellElement = document.createElement('div');
        cellElement.classList.add('cell');
        cellElement.addEventListener('click', () => handleCellClick(index));
        boardElement.appendChild(cellElement);
    });
    updateTurnIndicator();
}

function changeTTTMode() {
    let mode = document.getElementById('ttt-mode').value;
    let diffLabel = document.getElementById('ttt-diff-label');
    let diffSelect = document.getElementById('ttt-difficulty');
    if (mode === 'CPU') {
        diffLabel.style.display = 'inline';
        diffSelect.style.display = 'inline';
    } else {
        diffLabel.style.display = 'none';
        diffSelect.style.display = 'none';
    }
    resetAllTTT();
}

function handleCellClick(index) {
    let mode = document.getElementById('ttt-mode').value;
    if (tttBoard[index] !== '' || !tttGameActive) return;
    if (mode === 'CPU' && currentPlayer === 'O') return; 

    tttBoard[index] = currentPlayer;
    updateTTTBoard();
    checkTTTWin();

    if (tttGameActive) {
        if (mode === '2P') {
            currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
            updateTurnIndicator();
        } else if (mode === 'CPU') {
            currentPlayer = 'O';
            updateTurnIndicator();
            setTimeout(makeCpuMove, 500); 
        }
    }
}

function makeCpuMove() {
    if (!tttGameActive || !document.getElementById('tictactoe').classList.contains('active')) return;
    let available = tttBoard.map((val, idx) => val === '' ? idx : null).filter(val => val !== null);
    if (available.length === 0) return;

    let diff = document.getElementById('ttt-difficulty').value;
    let move;
    if (diff === 'easy') {
        move = available[Math.floor(Math.random() * available.length)];
    } else if (diff === 'medium') {
        move = Math.random() > 0.5 ? available[Math.floor(Math.random() * available.length)] : getBestMove(tttBoard);
    } else {
        move = getBestMove(tttBoard);
    }

    tttBoard[move] = 'O';
    updateTTTBoard();
    checkTTTWin();

    if (tttGameActive) { 
        currentPlayer = 'X'; 
        updateTurnIndicator(); 
    }
}

function updateTTTBoard() {
    Array.from(boardElement.children).forEach((cell, index) => {
        cell.innerText = tttBoard[index];
        cell.className = 'cell'; 
        if (tttBoard[index] === 'X') cell.classList.add('mark-x');
        else if (tttBoard[index] === 'O') cell.classList.add('mark-o');
    });
}

function updateTurnIndicator() {
    const turnIcon = document.getElementById('turn-icon');
    const indicatorBox = document.getElementById('ttt-turn-indicator');
    if (currentPlayer === 'X') {
        turnIcon.innerText = 'X'; 
        turnIcon.className = 'mark-x'; 
        indicatorBox.style.borderColor = 'var(--primary)';
        indicatorBox.style.boxShadow = '0 0 10px var(--primary)';
    } else {
        turnIcon.innerText = 'O'; 
        turnIcon.className = 'mark-o'; 
        indicatorBox.style.borderColor = 'var(--secondary)';
        indicatorBox.style.boxShadow = '0 0 10px var(--secondary)';
    }
}

function updateScoreBoard() {
    document.getElementById('score-x').innerText = statsTTT.X;
    document.getElementById('score-tie').innerText = statsTTT.tie;
    document.getElementById('score-o').innerText = statsTTT.O;
}

function showPopup(message) {
    document.getElementById('ttt-winner-text').innerText = message;
    document.getElementById('ttt-popup').classList.add('show');
}

function closePopupAndReset() { 
    document.getElementById('ttt-popup').classList.remove('show'); 
    resetTTT(); 
}

function exitTTT() { 
    document.getElementById('ttt-popup').classList.remove('show'); 
    resetTTT(); 
    returnToMenu();
}

function resetAllTTT() { 
    statsTTT = { X: 0, tie: 0, O: 0 }; 
    updateScoreBoard(); 
    resetTTT(); 
}

function getWinningCombo(board) {
    const winPatterns = [ [0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6] ];
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return pattern;
        }
    }
    return null;
}

function checkTTTWin() {
    let res = checkWinnerCore(tttBoard);
    if (res === 'X' || res === 'O') {
        statsTTT[res]++; 
        updateScoreBoard();
        let winnerName = getPlayerName(res); 
        tttGameActive = false;

        let combo = getWinningCombo(tttBoard);
        if(combo) {
            combo.forEach(idx => boardElement.children[idx].classList.add('win-highlight'));
        }
        setTimeout(() => showPopup(`${winnerName} Wins!`), 1000);
    } else if (res === 'tie') {
        statsTTT.tie++; 
        updateScoreBoard(); 
        tttGameActive = false;
        setTimeout(() => showPopup("It's a Draw!"), 1000);
    }
}

function resetTTT() {
    tttBoard = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X'; 
    tttGameActive = true; 
    updateTurnIndicator();
    Array.from(boardElement.children).forEach(cell => cell.classList.remove('win-highlight'));
    updateTTTBoard();
}

function checkWinnerCore(board) {
    const winPatterns = [ [0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6] ];
    for (let pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    if (!board.includes('')) return 'tie';
    return null;
}

const scores = { 'O': 10, 'X': -10, 'tie': 0 };
function minimax(board, depth, isMaximizing) {
    let result = checkWinnerCore(board);
    if (result !== null) return scores[result];

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < board.length; i++) {
            if (board[i] === '') { 
                board[i] = 'O'; 
                let score = minimax(board, depth + 1, false); 
                board[i] = ''; 
                bestScore = Math.max(score, bestScore); 
            }
        } 
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < board.length; i++) {
            if (board[i] === '') { 
                board[i] = 'X'; 
                let score = minimax(board, depth + 1, true); 
                board[i] = ''; 
                bestScore = Math.min(score, bestScore); 
            }
        } 
        return bestScore;
    }
}

function getBestMove(board) {
    let bestScore = -Infinity; 
    let move;
    for (let i = 0; i < board.length; i++) {
        if (board[i] === '') { 
            board[i] = 'O'; 
            let score = minimax(board, 0, false); 
            board[i] = ''; 
            if (score > bestScore) { 
                bestScore = score; 
                move = i; 
            } 
        }
    } 
    return move;
}

initTTT();

// --- Retro Audio System (Shared) ---
let audioCtx;
let soundEnabled = true;

function initAudio() {
    try {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                audioCtx = new AudioContext();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    } catch (e) {
        console.warn("Audio Context not supported");
    }
}

function playRetroSound(type) {
    if (!soundEnabled || !audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator(); 
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterOut());

        if (type === 'eat') {
            osc.type = 'square'; 
            osc.frequency.setValueAtTime(880, now); 
            gain.gain.setValueAtTime(0.05, now); 
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'crash') {
            osc.type = 'sawtooth'; 
            osc.frequency.setValueAtTime(150, now); 
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.3); 
            gain.gain.setValueAtTime(0.1, now); 
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'bounce_paddle') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'bounce_wall') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'brick_hit') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'brick_silver') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.linearRampToValueAtTime(400, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'brick_gold') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1000, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'powerup_catch') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.15);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.3);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'laser_shoot') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now); osc.stop(now + 0.15);
        } else if (type === 'die') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.6);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
            osc.start(now); osc.stop(now + 0.6);
        } else if (type === 'boss_hit') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2);
        }
    } catch (e) {}
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    const indicators = document.querySelectorAll('#snake-sound-indicator, #ark-sound-indicator');
    indicators.forEach(ind => {
        if (ind) ind.innerText = soundEnabled ? 'SND: ON' : 'SND: OFF';
    });
}

// --- Nokia Snake Logic & Leaderboard ---
const sCanvas = document.getElementById('snakeCanvas');
const sCtx = sCanvas.getContext('2d');
const grid = 20;
let snakeCount = 0; 
let score = 0; 
let snakeGameActive = false; 
let snakePaused = false; 
let snakeBaseDelay = 6; let currentFrameDelay = 6; 

let snakeObj = { x: 160, y: 160, dx: grid, dy: 0, cells: [], maxCells: 4 }; 
let apple = { x: 320, y: 320 };

const scoreEl = document.getElementById('snake-score'); 
const highEl = document.getElementById('snake-high');

let snakeLeaderboard = [];
try {
    snakeLeaderboard = JSON.parse(localStorage.getItem('onlyFunsSnakeScores')) || [];
    if(snakeLeaderboard.length > 0) {
        highEl.innerText = snakeLeaderboard[0].score;
    }
} catch(e) {
    console.warn("Local storage error:", e);
}

function getRandomInt(min, max) { 
    return Math.floor(Math.random() * (max - min)) + min; 
}

function startSnake() { 
    initAudio(); 
    document.getElementById('snake-start-btn').style.display = 'none'; 
    resetSnake(); 
    snakeGameActive = true; 
    snakePaused = false; 
}

function togglePauseSnake() { 
    if (!snakeGameActive) return; 
    snakePaused = !snakePaused; 
}

function snakeGameOver() {
    playRetroSound('crash'); 
    snakeGameActive = false;
    document.getElementById('snake-winner-text').innerHTML = `Game Over!<br><span style="color:var(--secondary); text-shadow:0 0 5px var(--secondary);">Score: ${score}</span>`;
    document.getElementById('snake-player-nickname').value = '';
    document.getElementById('snake-leaderboard-entry').style.display = 'block'; 
    document.getElementById('snake-leaderboard-display').style.display = 'none';
    document.getElementById('snake-popup').classList.add('show');
}

function submitSnakeScore() {
    const nicknameInput = document.getElementById('snake-player-nickname').value.trim().toUpperCase();
    if(nicknameInput.length < 3 || nicknameInput.length > 12) { 
        alert("Nickname must be between 3 and 12 characters."); 
        return; 
    }

    snakeLeaderboard.push({ name: nicknameInput, score: score });
    snakeLeaderboard.sort((a, b) => b.score - a.score); 
    snakeLeaderboard = snakeLeaderboard.slice(0, 5);

    try {
        localStorage.setItem('onlyFunsSnakeScores', JSON.stringify(snakeLeaderboard));
    } catch(e) {}

    highEl.innerText = snakeLeaderboard[0].score;

    const listEl = document.getElementById('snake-leaderboard-list'); 
    listEl.innerHTML = '';
    snakeLeaderboard.forEach(entry => { 
        const li = document.createElement('li'); 
        li.innerText = `${entry.name} ... ${entry.score}`; 
        listEl.appendChild(li); 
    });

    document.getElementById('snake-leaderboard-entry').style.display = 'none'; 
    document.getElementById('snake-leaderboard-display').style.display = 'block';
}

function closeSnakePopupAndReset() { 
    document.getElementById('snake-popup').classList.remove('show'); 
    resetSnake(); 
    snakeGameActive = true; 
    snakePaused = false; 
}

function exitSnake() { 
    document.getElementById('snake-popup').classList.remove('show'); 
    document.getElementById('snake-start-btn').style.display = 'block'; 
    resetSnake(); 
    snakeGameActive = false; 
    snakePaused = false; 
    returnToMenu();
}

function resetSnake() {
    snakeObj.x = 160; 
    snakeObj.y = 160; 
    snakeObj.cells = []; 
    snakeObj.maxCells = 4; 
    snakeObj.dx = grid; 
    snakeObj.dy = 0;
    apple.x = getRandomInt(0, 20) * grid; 
    apple.y = getRandomInt(0, 20) * grid;
    score = 0; 
    currentFrameDelay = snakeBaseDelay; 
    scoreEl.innerText = score;
}

function loopSnake() {
    requestAnimationFrame(loopSnake);

    if (!document.getElementById('snake').classList.contains('active')) return;

    if (!snakeGameActive) {
        sCtx.fillStyle = '#8c9b00'; 
        sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);
        if(!document.getElementById('snake-popup').classList.contains('show')) { 
            sCtx.fillStyle = '#1a1a1a'; 
            sCtx.font = '24px "Press Start 2P"'; 
            sCtx.textAlign = 'center'; 
            sCtx.fillText('PRESS START', sCanvas.width / 2, sCanvas.height / 2 + 10); 
        }
        return;
    }

    if (snakePaused) { 
        sCtx.fillStyle = '#1a1a1a'; 
        sCtx.font = '24px "Press Start 2P"'; 
        sCtx.textAlign = 'center'; 
        sCtx.fillText('PAUSED', sCanvas.width / 2, sCanvas.height / 2 + 10); 
        return; 
    }

    if (++snakeCount < currentFrameDelay) return; 
    snakeCount = 0;

    sCtx.fillStyle = '#8c9b00'; 
    sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);

    snakeObj.x += snakeObj.dx; 
    snakeObj.y += snakeObj.dy;

    if (settings.snakeWrap) { snakeObj.x = (snakeObj.x + sCanvas.width) % sCanvas.width; snakeObj.y = (snakeObj.y + sCanvas.height) % sCanvas.height; }
    if (snakeObj.x < 0 || snakeObj.x >= sCanvas.width || snakeObj.y < 0 || snakeObj.y >= sCanvas.height) { 
        snakeGameOver(); 
        return; 
    }

    snakeObj.cells.unshift({x: snakeObj.x, y: snakeObj.y});
    if (snakeObj.cells.length > snakeObj.maxCells) {
        snakeObj.cells.pop();
    }

    // Draw Apple (Black square)
    sCtx.fillStyle = '#1a1a1a'; 
    sCtx.fillRect(apple.x + 2, apple.y + 2, grid - 4, grid - 4);

    // Draw Snake
    sCtx.fillStyle = '#1a1a1a';
    snakeObj.cells.forEach(function(cell, index) {
        sCtx.fillRect(cell.x + 1, cell.y + 1, grid - 2, grid - 2);
        if (cell.x === apple.x && cell.y === apple.y) {
            playRetroSound('eat'); 
            snakeObj.maxCells++; 
            score += 10; 
            scoreEl.innerText = score;
            apple.x = getRandomInt(0, 20) * grid; 
            apple.y = getRandomInt(0, 20) * grid;
            currentFrameDelay = Math.max(2, snakeBaseDelay - Math.floor(score / 50));
        }
        for (let i = index + 1; i < snakeObj.cells.length; i++) { 
            if (cell.x === snakeObj.cells[i].x && cell.y === snakeObj.cells[i].y) {
                snakeGameOver(); 
            }
        }
    });
}

document.addEventListener('keydown', function(e) {
    if(document.getElementById('snake').classList.contains('active')){
        if (document.activeElement.id === 'snake-player-nickname') return;
        const key = e.keyCode;
        if([32, 37, 38, 39, 40].includes(key)) e.preventDefault();

        if (key === 13) { 
            if (!snakeGameActive) { 
                if(document.getElementById('snake-popup').classList.contains('show')) {
                    closeSnakePopupAndReset(); 
                } else {
                    startSnake(); 
                }
            } 
        }
        if (snakeGameActive) {
            if (key === 32 || key === 27) togglePauseSnake(); 
            if (!snakePaused) {
                if ((key === 37 || key === 65) && snakeObj.dx === 0) { snakeObj.dx = -grid; snakeObj.dy = 0; } 
                else if ((key === 38 || key === 87) && snakeObj.dy === 0) { snakeObj.dy = -grid; snakeObj.dx = 0; } 
                else if ((key === 39 || key === 68) && snakeObj.dx === 0) { snakeObj.dx = grid; snakeObj.dy = 0; } 
                else if ((key === 40 || key === 83) && snakeObj.dy === 0) { snakeObj.dy = grid; snakeObj.dx = 0; } 
            }
        }
    }
});
requestAnimationFrame(loopSnake);

// --- Snake & Ladder Logic ---
const slCanvas = document.getElementById('slCanvas');
const slCtx = slCanvas.getContext('2d');
const slCellSize = 40;
let slPlayers = [0, 0]; 
let slCurrent = 0; 
let slGameActive = true;

const slSnakes = { 99: 41, 95: 75, 89: 53, 66: 45, 54: 31, 43: 18, 27: 5 };
const slLadders = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
const slSnakeColors = { 99: '#FF1493', 95: '#32CD32', 89: '#DC143C', 66: '#9370DB', 54: '#4169E1', 43: '#228B22', 27: '#FF8C00' };

const diceLayouts = {
    1: ['e'], 2: ['c', 'g'], 3: ['c', 'e', 'g'], 4: ['a', 'c', 'g', 'i'], 5: ['a', 'c', 'e', 'g', 'i'], 6: ['a', 'c', 'd', 'f', 'g', 'i'] 
};

function renderDiceFace(num) {
    const face = document.getElementById('sl-dice-face');
    face.innerHTML = '';
    const dots = diceLayouts[num];
    ['a','b','c','d','e','f','g','h','i'].forEach(area => {
        const placeholder = document.createElement('div');
        placeholder.style.gridArea = area;
        if (dots.includes(area)) { const dot = document.createElement('div'); dot.className = 'dice-dot'; placeholder.appendChild(dot); }
        face.appendChild(placeholder);
    });
}
renderDiceFace(1);

function slGetCoords(pos) {
    if (pos === 0) return { x: -20, y: 380 };
    let r = Math.floor((pos - 1) / 10); let c = (pos - 1) % 10;
    if (r % 2 !== 0) c = 9 - c; 
    let x = c * slCellSize; let y = 400 - (r + 1) * slCellSize;
    return { x, y };
}

function drawSLBoard() {
    slCtx.clearRect(0,0,400,400);

    for (let i = 1; i <= 100; i++) {
        let {x, y} = slGetCoords(i);
        slCtx.fillStyle = '#ffffff'; slCtx.fillRect(x, y, slCellSize, slCellSize);
        slCtx.strokeStyle = '#000000'; slCtx.lineWidth = 1; slCtx.strokeRect(x, y, slCellSize, slCellSize);
        slCtx.fillStyle = '#000000'; slCtx.font = 'bold 15px Arial'; slCtx.fillText(i, x + 3, y + 15);
    }

    for (let [start, end] of Object.entries(slLadders)) {
        let s = slGetCoords(parseInt(start)); let e = slGetCoords(end);
        let sx = s.x + 20, sy = s.y + 20; let ex = e.x + 20, ey = e.y + 20;
        let dx = ex - sx; let dy = ey - sy; let angle = Math.atan2(dy, dx);
        let offX = Math.sin(angle) * 10; let offY = -Math.cos(angle) * 10;

        slCtx.strokeStyle = '#000000'; slCtx.lineWidth = 8; slCtx.lineCap = 'butt';
        slCtx.beginPath(); slCtx.moveTo(sx + offX, sy + offY); slCtx.lineTo(ex + offX, ey + offY); slCtx.stroke();
        slCtx.beginPath(); slCtx.moveTo(sx - offX, sy - offY); slCtx.lineTo(ex - offX, ey - offY); slCtx.stroke();

        slCtx.strokeStyle = '#8B4513'; slCtx.lineWidth = 5;
        slCtx.beginPath(); slCtx.moveTo(sx + offX, sy + offY); slCtx.lineTo(ex + offX, ey + offY); slCtx.stroke();
        slCtx.beginPath(); slCtx.moveTo(sx - offX, sy - offY); slCtx.lineTo(ex - offX, ey - offY); slCtx.stroke();

        let rungs = Math.floor(Math.sqrt(dx*dx + dy*dy) / 16);
        for(let i=1; i<=rungs; i++) {
            let mx = sx + dx * (i / (rungs + 1)); let my = sy + dy * (i / (rungs + 1));
            slCtx.strokeStyle = '#000000'; slCtx.lineWidth = 6;
            slCtx.beginPath(); slCtx.moveTo(mx + offX, my + offY); slCtx.lineTo(mx - offX, my - offY); slCtx.stroke();
            slCtx.strokeStyle = '#A0522D'; slCtx.lineWidth = 3;
            slCtx.beginPath(); slCtx.moveTo(mx + offX, my + offY); slCtx.lineTo(mx - offX, my - offY); slCtx.stroke();
        }
    }

    for (let [start, end] of Object.entries(slSnakes)) {
        let s = slGetCoords(parseInt(start)); let e = slGetCoords(end);
        let sx = s.x + 20, sy = s.y + 20; let ex = e.x + 20, ey = e.y + 20;
        let dx = ex - sx; let dy = ey - sy; let dist = Math.sqrt(dx*dx + dy*dy);
        let perpX = -dy / dist * 40; let perpY = dx / dist * 40;
        let midX1 = sx + dx*0.33 + perpX; let midY1 = sy + dy*0.33 + perpY;
        let midX2 = sx + dx*0.66 - perpX; let midY2 = sy + dy*0.66 - perpY;

        slCtx.strokeStyle = '#000000'; slCtx.lineWidth = 14; slCtx.lineCap = 'round';
        slCtx.beginPath(); slCtx.moveTo(sx, sy); slCtx.bezierCurveTo(midX1, midY1, midX2, midY2, ex, ey); slCtx.stroke();

        slCtx.strokeStyle = slSnakeColors[start]; slCtx.lineWidth = 10; slCtx.stroke();

        slCtx.fillStyle = '#000000'; slCtx.beginPath(); slCtx.arc(sx, sy, 12, 0, Math.PI*2); slCtx.fill();
        slCtx.fillStyle = slSnakeColors[start]; slCtx.beginPath(); slCtx.arc(sx, sy, 10, 0, Math.PI*2); slCtx.fill();

        let angle = Math.atan2(dy, dx); let eyeOffX = Math.cos(angle - Math.PI/2) * 5; let eyeOffY = Math.sin(angle - Math.PI/2) * 5;
        slCtx.fillStyle = '#ffffff'; slCtx.beginPath(); slCtx.arc(sx - eyeOffX, sy - eyeOffY, 3.5, 0, Math.PI*2); slCtx.fill();
        slCtx.beginPath(); slCtx.arc(sx + eyeOffX, sy + eyeOffY, 3.5, 0, Math.PI*2); slCtx.fill();
        slCtx.fillStyle = '#000000'; slCtx.beginPath(); slCtx.arc(sx - eyeOffX, sy - eyeOffY, 1.5, 0, Math.PI*2); slCtx.fill();
        slCtx.beginPath(); slCtx.arc(sx + eyeOffX, sy + eyeOffY, 1.5, 0, Math.PI*2); slCtx.fill();

        slCtx.strokeStyle = '#ff0000'; slCtx.lineWidth = 2; slCtx.lineCap = 'round';
        slCtx.beginPath(); slCtx.moveTo(sx - Math.cos(angle)*10, sy - Math.sin(angle)*10); slCtx.lineTo(sx - Math.cos(angle)*18, sy - Math.sin(angle)*18); slCtx.stroke();
    }

    let p1 = slGetCoords(slPlayers[0]); let p2 = slGetCoords(slPlayers[1]);

    slCtx.fillStyle = '#ffffff'; slCtx.beginPath(); slCtx.arc(p1.x + 12, p1.y + 28, 7, 0, Math.PI*2); slCtx.fill();
    slCtx.strokeStyle = '#000000'; slCtx.lineWidth = 2; slCtx.stroke(); 
    slCtx.strokeStyle = '#00bcd4'; slCtx.lineWidth = 4; slCtx.stroke(); slCtx.strokeStyle = 'rgba(0,188,212,0.3)'; slCtx.lineWidth = 8; slCtx.stroke(); 

    slCtx.fillStyle = '#ffffff'; slCtx.beginPath(); slCtx.arc(p2.x + 28, p2.y + 28, 7, 0, Math.PI*2); slCtx.fill();
    slCtx.strokeStyle = '#000000'; slCtx.lineWidth = 2; slCtx.stroke(); 
    slCtx.strokeStyle = '#e040fb'; slCtx.lineWidth = 4; slCtx.stroke(); slCtx.strokeStyle = 'rgba(224,64,251,0.3)'; slCtx.lineWidth = 8; slCtx.stroke(); 
}

function updateSLUI() {
    document.getElementById('sl-p1-pos').innerText = slPlayers[0];
    document.getElementById('sl-p2-pos').innerText = slPlayers[1];
    document.getElementById('sl-p1-prog').style.width = `${slPlayers[0]}%`;
    document.getElementById('sl-p2-prog').style.width = `${slPlayers[1]}%`;
    document.getElementById('sl-card-0').classList.toggle('active', slCurrent === 0);
    document.getElementById('sl-card-0').classList.toggle('p2-turn', false); 
    document.getElementById('sl-card-1').classList.toggle('active', slCurrent === 1);
    document.getElementById('sl-card-1').classList.toggle('p2-turn', slCurrent === 1);
    const turnDot = document.getElementById('sl-turn-dot');
    turnDot.className = `sl-dot ${slCurrent === 0 ? 'p1' : 'p2'}`;
    document.getElementById('sl-turn-text').innerText = `Player ${slCurrent + 1}'s turn`;
}

function rollSLDice() {
    if (!slGameActive) return;
    const btn = document.getElementById('sl-dice-btn');
    const face = document.getElementById('sl-dice-face');
    btn.disabled = true; document.getElementById('sl-dice-status').innerText = "Rolling...";
    face.classList.add('rolling');

    let diceRolls = 0;
    const rollInterval = setInterval(() => {
        renderDiceFace(Math.floor(Math.random() * 6) + 1);
        diceRolls++;
        if (diceRolls > 16) {
            clearInterval(rollInterval);
            let finalDice = Math.floor(Math.random() * 6) + 1;
            renderDiceFace(finalDice);
            document.getElementById('sl-dice-status').innerText = `Rolled a ${finalDice}!`;
            setTimeout(() => face.classList.remove('rolling'), 100); 
            setTimeout(() => { processSLMove(finalDice); }, 1000);
        }
    }, 50);
}

function processSLMove(dice) {
    let nextPos = slPlayers[slCurrent] + dice;
    let statusMsg = `Moving ${dice} spaces...`;

    if (nextPos <= 100) {
        slPlayers[slCurrent] = nextPos;
        if (slSnakes[nextPos]) {
            statusMsg = `Snake! Slid down to ${slSnakes[nextPos]}.`; slPlayers[slCurrent] = slSnakes[nextPos];
        } else if (slLadders[nextPos]) {
            statusMsg = `Ladder! Climbed up to ${slLadders[nextPos]}.`; slPlayers[slCurrent] = slLadders[nextPos];
        } else {
            statusMsg = `Landed on ${nextPos}.`;
        }
    } else {
        statusMsg = `Needs exact roll! Staying at ${slPlayers[slCurrent]}.`;
    }

    document.getElementById('sl-dice-status').innerText = statusMsg;
    drawSLBoard();

    if (slPlayers[slCurrent] === 100) {
        slGameActive = false; updateSLUI(); 
        document.getElementById('sl-winner-text').innerText = `Player ${slCurrent + 1} Wins!`;
        setTimeout(() => document.getElementById('sl-popup').classList.add('show'), 600);
        document.getElementById('sl-dice-btn').disabled = false;
        return;
    }

    slCurrent = slCurrent === 0 ? 1 : 0; updateSLUI();
    setTimeout(() => { document.getElementById('sl-dice-btn').disabled = false; }, 400);
}

function resetSLGame() { slPlayers = [0, 0]; slCurrent = 0; slGameActive = true; document.getElementById('sl-dice-status').innerText = 'Roll to start'; renderDiceFace(1); updateSLUI(); drawSLBoard(); }
function closeSLPopup() { document.getElementById('sl-popup').classList.remove('show'); resetSLGame(); returnToMenu(); }

// --- Tetris Logic ---
const tCanvas = document.getElementById('tetrisCanvas');
const context = tCanvas.getContext('2d');
context.scale(20, 20);
const hCanvas = document.getElementById('holdCanvas');
const hCtx = hCanvas.getContext('2d');
hCtx.scale(20, 20);

let tetrisGameActive = false; let tetrisScore = 0; let heldPiece = null; let canHold = true;

function updateTetrisScoreDisplay() { document.getElementById('tetris-score').innerText = tetrisScore; }

function drawHold() {
    hCtx.fillStyle = '#000'; hCtx.fillRect(0, 0, 4, 4);
    if (heldPiece) { const offset = { x: (4 - heldPiece[0].length) / 2, y: (4 - heldPiece.length) / 2 }; drawMatrixToCtx(heldPiece, offset, hCtx); }
}

function resetTetrisData() { arena.forEach(row => row.fill(0)); tetrisScore = 0; heldPiece = null; canHold = true; updateTetrisScoreDisplay(); drawHold(); }

function startTetris() { document.getElementById('tetris-start-btn').style.display = 'none'; resetTetrisData(); playerReset(); tetrisGameActive = true; }
function tetrisGameOver() { tetrisGameActive = false; document.getElementById('tetris-popup').classList.add('show'); }
function closeTetrisPopupAndReset() { document.getElementById('tetris-popup').classList.remove('show'); resetTetrisData(); playerReset(); tetrisGameActive = true; }
function exitTetris() { document.getElementById('tetris-popup').classList.remove('show'); document.getElementById('tetris-start-btn').style.display = 'block'; resetTetrisData(); tetrisGameActive = false; returnToMenu(); }

function arenaSweep() {
    let linesCleared = 0;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) if (arena[y][x] === 0) continue outer;
        const row = arena.splice(y, 1)[0].fill(0); arena.unshift(row); ++y; linesCleared++;
    }
    if (linesCleared > 0) {
        if (linesCleared === 1) tetrisScore += 100; else if (linesCleared === 2) tetrisScore += 300; else if (linesCleared === 3) tetrisScore += 500; else if (linesCleared >= 4) tetrisScore += 800;
        updateTetrisScoreDisplay();
    }
}

function collide(arena, player) {
    const m = player.matrix; const o = player.pos;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) return true;
        }
    } return false;
}

function createMatrix(w, h) { const matrix = []; while (h--) matrix.push(new Array(w).fill(0)); return matrix; }

function createPiece(type) {
    if (type === 'I') return [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]];
    if (type === 'L') return [[0,2,0],[0,2,0],[0,2,2]];
    if (type === 'J') return [[0,3,0],[0,3,0],[3,3,0]];
    if (type === 'O') return [[4,4],[4,4]];
    if (type === 'Z') return [[5,5,0],[0,5,5],[0,0,0]];
    if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
    if (type === 'T') return [[0,7,0],[7,7,7],[0,0,0]];
}

function drawMatrixToCtx(matrix, offset, ctx) {
    const colors = [null, '#ff00ff', '#00ffff', '#39ff14', '#e040fb', '#ff0055', '#ff3333', '#3333ff'];
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) { ctx.fillStyle = colors[value]; ctx.fillRect(x + offset.x, y + offset.y, 1, 1); }
        });
    });
}

let tetrisGridColor = 'rgba(0, 255, 255, 0.16)';
function drawTetrisGrid() {
    const cols = arena[0].length, rows = arena.length;
    context.save();
    context.lineWidth = 0.05; // field is scaled 20x, so ~1 real pixel
    context.strokeStyle = tetrisGridColor;
    context.beginPath();
    for (let x = 1; x < cols; x++) { context.moveTo(x, 0); context.lineTo(x, rows); }
    for (let y = 1; y < rows; y++) { context.moveTo(0, y); context.lineTo(cols, y); }
    context.stroke();
    context.restore();
}

function draw() {
    context.fillStyle = '#000'; context.fillRect(0, 0, tCanvas.width, tCanvas.height);
    drawTetrisGrid();
    drawMatrixToCtx(arena, {x: 0, y: 0}, context); 
    if (tetrisGameActive) drawMatrixToCtx(player.matrix, player.pos, context);
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => { row.forEach((value, x) => { if (value !== 0) arena[y + player.pos.y][x + player.pos.x] = value; }); });
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) { player.pos.y--; merge(arena, player); playerReset(); arenaSweep(); } dropCounter = 0;
}

function playerHardDrop() {
    while (!collide(arena, player)) { player.pos.y++; }
    player.pos.y--; merge(arena, player); playerReset(); arenaSweep(); dropCounter = 0;
}

function playerHold() {
    if (!canHold) return;
    if (heldPiece === null) { heldPiece = player.matrix; playerReset(); } 
    else {
        const temp = player.matrix; player.matrix = heldPiece; heldPiece = temp;
        player.pos.y = 0; player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    }
    canHold = false; drawHold();
}

function playerMove(offset) { player.pos.x += offset; if (collide(arena, player)) player.pos.x -= offset; }

function playerReset() {
    const pieces = 'TJLOSZI'; player.matrix = createPiece(pieces[pieces.length * Math.random() | 0]);
    player.pos.y = 0; player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0); canHold = true;
    if (collide(arena, player)) { arena.forEach(row => row.fill(0)); if (tetrisGameActive) tetrisGameOver(); }
}

function playerRotate(dir) {
    const pos = player.pos.x; let offset = 1; rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset; offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) { rotate(player.matrix, -dir); player.pos.x = pos; return; }
    }
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) { for (let x = 0; x < y; ++x) { [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]]; } }
    if (dir > 0) matrix.forEach(row => row.reverse()); else matrix.reverse();
}

let dropCounter = 0; let dropInterval = 1000; let lastTime = 0;

function update(time = 0) {
    requestAnimationFrame(update);
    const deltaTime = time - lastTime; lastTime = time; 
    if (document.getElementById('tetris').classList.contains('active')) {
        if (tetrisGameActive) { dropCounter += deltaTime; if (dropCounter > dropInterval) playerDrop(); }
        draw(); 
    }
}

const arena = createMatrix(12, 20); const player = { pos: {x: 0, y: 0}, matrix: null };

document.addEventListener('keydown', event => {
    if(document.getElementById('tetris').classList.contains('active') && tetrisGameActive){
        if([32, 37, 38, 39, 40, 67].includes(event.keyCode)) event.preventDefault();
        if (event.keyCode === 37) playerMove(-1); else if (event.keyCode === 39) playerMove(1);
        else if (event.keyCode === 40) playerDrop(); else if (event.keyCode === 38) playerRotate(1);
        else if (event.keyCode === 32) playerHardDrop(); else if (event.keyCode === 67) playerHold(); 
    }
});
playerReset(); update();

// --- Arkanoid Ultimate Logic ---
const arkCanvas = document.getElementById('arkanoidCanvas');
const arkCtx = arkCanvas.getContext('2d');

const arkScreens = {
    start: document.getElementById('ark-start-screen'), gameOver: document.getElementById('ark-game-over-screen'),
    victory: document.getElementById('ark-victory-screen'), levelAnnounce: document.getElementById('ark-level-announcement')
};
const arkDisplays = {
    score: document.getElementById('ark-score-display'), lives: document.getElementById('ark-lives-display'),
    level: document.getElementById('ark-level-display'), finalScore: document.getElementById('ark-final-score'), victoryScore: document.getElementById('ark-victory-score')
};

const ARK_GAME_WIDTH = 600; const ARK_GAME_HEIGHT = 800;
arkCanvas.width = ARK_GAME_WIDTH; arkCanvas.height = ARK_GAME_HEIGHT;

let arkState = { mode: 'START', score: 0, lives: 3, level: 1, maxLevel: 4 };
let arkRightPressed = false; let arkLeftPressed = false;

const arkLevelData = [ [], 
    [ [0,0,0,0,0,0,0,0,0,0], [1,1,1,1,1,1,1,1,1,1], [2,2,2,2,2,2,2,2,2,2], [3,3,3,3,3,3,3,3,3,3], [4,4,4,4,4,4,4,4,4,4], [5,5,5,5,5,5,5,5,5,5] ],
    [ [7,7,7,7,7,7,7,7,7,7], [0,1,0,2,0,3,0,4,0,5], [6,0,1,0,2,0,3,0,4,0], [0,6,0,1,0,2,0,3,0,4], [5,0,6,0,1,0,2,0,3,0], [0,0,0,7,7,7,7,0,0,0] ],
    [ [8,1,1,8,2,2,8,3,3,8], [1,1,1,1,2,2,2,2,3,3], [8,0,0,8,7,7,8,0,0,8], [4,4,4,4,5,5,5,5,6,6], [8,4,4,8,5,5,8,6,6,8], [7,7,7,7,7,7,7,7,7,7] ],
    [ [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0], [0,0,0,0,0,0,0,0,0,0] ]
];

const arkBrickColors = { 1: '#ff0000', 2: '#ff7f00', 3: '#ffff00', 4: '#00ff00', 5: '#00ffff', 6: '#0000ff' };

const arkVaus = {
    width: 100, baseWidth: 100, height: 18, x: ARK_GAME_WIDTH / 2 - 50, y: ARK_GAME_HEIGHT - 50, speed: 10, powerMode: 'NORMAL', color: '#ccc',
    draw() {
        arkCtx.shadowBlur = 15;
        arkCtx.shadowColor = this.powerMode === 'LASER' ? '#f00' : (this.powerMode === 'CATCH' ? '#adff2f' : 'var(--secondary)');
        arkCtx.fillStyle = this.color; arkCtx.beginPath(); arkCtx.roundRect(this.x, this.y, this.width, this.height, 8); arkCtx.fill();
        arkCtx.shadowBlur = 0; arkCtx.fillStyle = '#fff'; arkCtx.beginPath(); arkCtx.roundRect(this.x + 5, this.y + 3, this.width - 10, this.height / 3, 4); arkCtx.fill();
        if (this.powerMode === 'LASER') { arkCtx.fillStyle = '#f00'; arkCtx.fillRect(this.x + 10, this.y - 5, 8, 10); arkCtx.fillRect(this.x + this.width - 18, this.y - 5, 8, 10); } 
        else if (this.powerMode === 'CATCH') { arkCtx.fillStyle = '#adff2f'; arkCtx.fillRect(this.x + 20, this.y + this.height/2 - 2, this.width - 40, 4); }
    },
    update() {
        if (this.x < 0) this.x = 0; if (this.x + this.width > ARK_GAME_WIDTH) this.x = ARK_GAME_WIDTH - this.width;
        const targetWidth = this.powerMode === 'WIDE' ? 160 : this.baseWidth;
        if (this.width < targetWidth) this.width += 4; if (this.width > targetWidth) this.width -= 4;
    },
    fire() {
        if (this.powerMode === 'LASER' && !arkLasersOnCooldown) {
            arkLasers.push({ x: this.x + 14, y: this.y, dy: -12, active: true }); arkLasers.push({ x: this.x + this.width - 14, y: this.y, dy: -12, active: true });
            playRetroSound('laser_shoot'); arkLasersOnCooldown = true; setTimeout(() => arkLasersOnCooldown = false, 300);
        }
        arkBalls.forEach(b => {
            if (b.stuck) {
                b.stuck = false;
                const off = Math.max(-1, Math.min(1, (b.stuckOffset - this.width / 2) / (this.width / 2)));
                const a = off * 60 * Math.PI / 180;
                b.dx = b.speed * Math.sin(a); b.dy = -b.speed * Math.cos(a); b.idle = 0;
            }
        });
        if(arkState.mode === 'PLAYING' && arkBalls.length === 1 && !arkBalls[0].active && !arkBalls[0].stuck) { arkBalls[0].active = true; }
    }
};

class ArkBall {
    constructor(x, y, dx, dy) { this.r = 7; this.x = x; this.y = y; this.baseSpeed = 7; this.speed = this.baseSpeed; this.dx = dx || 0; this.dy = dy || -this.speed; this.active = false; this.stuck = false; this.stuckOffset = 0; this.idle = 0; this.color = '#fff'; }
    draw() {
        arkCtx.shadowBlur = 10; arkCtx.shadowColor = 'var(--secondary)'; arkCtx.fillStyle = this.color;
        arkCtx.beginPath(); arkCtx.arc(this.x, this.y, this.r, 0, Math.PI * 2); arkCtx.fill();
        arkCtx.shadowBlur = 0; arkCtx.fillStyle = '#eef';
        arkCtx.beginPath(); arkCtx.arc(this.x - 2, this.y - 2, this.r / 2, 0, Math.PI * 2); arkCtx.fill();
    }
    update() {
        if (this.stuck) { this.x = arkVaus.x + this.stuckOffset; this.y = arkVaus.y - this.r; return; }
        if (!this.active) { this.x = arkVaus.x + arkVaus.width / 2; this.y = arkVaus.y - this.r - 2; return; }
        this.x += this.dx; this.y += this.dy;
        if (this.x - this.r < 0) { this.x = this.r; this.dx = Math.abs(this.dx); playRetroSound('bounce_wall'); }
        if (this.x + this.r > ARK_GAME_WIDTH) { this.x = ARK_GAME_WIDTH - this.r; this.dx = -Math.abs(this.dx); playRetroSound('bounce_wall'); }
        if (this.y - this.r < 0) { this.y = this.r; this.dy = Math.abs(this.dy); playRetroSound('bounce_wall'); }
    }
}

const arkPowerups = [];
const arkPTypes = { 'E': { color: '#4b0082', letter: 'E', name: 'EXPAND' }, 'L': { color: '#ff0000', letter: 'L', name: 'LASER' }, 'C': { color: '#adff2f', letter: 'C', name: 'CATCH' }, 'D': { color: '#add8e6', letter: 'D', name: 'DISRUPT' }, 'S': { color: '#ffa500', letter: 'S', name: 'SLOW' }, 'P': { color: '#ffc0cb', letter: 'P', name: 'PLAYER WARP' }, 'B': { color: '#808080', letter: 'B', name: 'BREAK' } };

class ArkPowerUp {
    constructor(x, y, type) { this.x = x; this.y = y; this.width = 40; this.height = 16; this.dy = 3; this.type = type; this.active = true; }
    draw() {
        if (!this.active) return;
        const style = arkPTypes[this.type]; arkCtx.fillStyle = style.color; arkCtx.shadowBlur = 10; arkCtx.shadowColor = style.color;
        arkCtx.beginPath(); arkCtx.roundRect(this.x, this.y, this.width, this.height, 8); arkCtx.fill();
        arkCtx.shadowBlur = 0; arkCtx.fillStyle = '#fff'; arkCtx.font = '12px "Press Start 2P"'; arkCtx.textAlign = 'center'; arkCtx.textBaseline = 'middle'; arkCtx.fillText(style.letter, this.x + this.width/2, this.y + this.height/2 + 1);
    }
    update() {
        this.y += this.dy; if (this.y > ARK_GAME_HEIGHT) this.active = false;
        if (this.active && this.y + this.height > arkVaus.y && this.y < arkVaus.y + arkVaus.height && this.x + this.width > arkVaus.x && this.x < arkVaus.x + arkVaus.width) { this.active = false; applyArkPowerUp(this.type); }
    }
}

const arkBricks = []; const arkBrickProps = { w: 50, h: 20, padding: 6, offsetX: 25, offsetY: 80 };

class ArkBrick {
    constructor(r, c, type) {
        this.x = c * (arkBrickProps.w + arkBrickProps.padding) + arkBrickProps.offsetX; this.y = r * (arkBrickProps.h + arkBrickProps.padding) + arkBrickProps.offsetY;
        this.w = arkBrickProps.w; this.h = arkBrickProps.h; this.type = type; this.active = true;
        this.hp = type === 7 ? 3 : (type === 8 ? Infinity : 1); this.color = type >= 1 && type <= 6 ? arkBrickColors[type] : (type === 7 ? '#c0c0c0' : '#ffd700'); this.scoreVal = type === 7 ? 50 : (type === 8 ? 0 : (7-r)*10);
    }
    draw() {
        if (!this.active) return;
        arkCtx.shadowBlur = 5; arkCtx.shadowColor = this.color; arkCtx.fillStyle = this.color;
        arkCtx.beginPath(); arkCtx.roundRect(this.x, this.y, this.w, this.h, 2); arkCtx.fill();
        arkCtx.shadowBlur = 0; arkCtx.fillStyle = 'rgba(255,255,255,0.4)'; arkCtx.beginPath(); arkCtx.roundRect(this.x+1, this.y+1, this.w-2, 4, 1); arkCtx.fill();
        arkCtx.fillStyle = 'rgba(0,0,0,0.3)'; arkCtx.beginPath(); arkCtx.roundRect(this.x+1, this.y+this.h-5, this.w-2, 4, 1); arkCtx.fill();
        if (this.type === 7 && this.hp < 3) {
            arkCtx.strokeStyle = '#333'; arkCtx.lineWidth = 2; arkCtx.beginPath(); arkCtx.moveTo(this.x + 10, this.y); arkCtx.lineTo(this.x + 20, this.y + 10);
            if (this.hp < 2) { arkCtx.lineTo(this.x + 15, this.y + this.h); arkCtx.moveTo(this.x + 40, this.y + 5); arkCtx.lineTo(this.x + 30, this.y + this.h); } arkCtx.stroke();
        }
    }
    hit() {
        if (this.type === 8) { playRetroSound('brick_gold'); return false; }
        this.hp--;
        if (this.hp <= 0) {
            this.active = false; arkState.score += this.scoreVal; updateArkHUD(); playRetroSound('brick_hit');
            if (Math.random() < (this.type === 7 ? 0.3 : 0.15)) {
                const types = ['S', 'P', 'C', 'L', 'D', 'E', 'B']; const pType = types[Math.floor(Math.random() * types.length)];
                arkPowerups.push(new ArkPowerUp(this.x + this.w/2 - 20, this.y, pType));
            }
            return true; 
        } else { playRetroSound('brick_silver'); return false; }
    }
}

const ARK_BOSS_HP = 36; // each ball contact now counts once, so this is far longer than the old 30 (which could drain in a few touches)
const arkBoss = {
    active: false, x: ARK_GAME_WIDTH / 2 - 60, y: 80, baseY: 80, w: 120, h: 120,
    hp: ARK_BOSS_HP, maxHp: ARK_BOSS_HP, dir: 1, baseSpeed: 2, phase: 1,
    projectiles: [], fireTimer: 90, volley: 0, hitCooldown: 0, flash: 0, tick: 0,
    reset() {
        this.active = true; this.hp = this.maxHp; this.phase = 1; this.dir = 1;
        this.x = ARK_GAME_WIDTH / 2 - this.w / 2; this.y = this.baseY;
        this.projectiles = []; this.fireTimer = 90; this.volley = 0; this.hitCooldown = 0; this.flash = 0; this.tick = 0;
    },
    damage() { return 1 - this.hp / this.maxHp; }, // 0 (fresh) .. 1 (nearly dead)
    speed() { return this.baseSpeed * (1 + this.damage() * 1.2) * (this.phase === 2 ? 1.25 : 1); },
    fireDelay() { // frames between volleys at 60fps; shrinks as the boss is hurt, and again in phase 2
        const d = this.damage();
        return this.phase === 1 ? 110 - d * 50 : 70 - (d - 0.5) * 36;
    },
    shoot(angle, speed, offsetX = this.w / 2) { // angle in radians, 0 = straight down
        this.projectiles.push({ x: this.x + offsetX, y: this.y + this.h - 10, dx: Math.sin(angle) * speed, dy: Math.cos(angle) * speed });
    },
    fireVolley() {
        const d = this.damage(), n = this.volley++;
        const sp = this.phase === 1 ? 4 + d * 2 : 5 + (d - 0.5) * 2;
        const aimed = Math.max(-0.9, Math.min(0.9, Math.atan2(arkVaus.x + arkVaus.width / 2 - (this.x + this.w / 2), arkVaus.y - (this.y + this.h))));
        if (this.phase === 1) {
            if (n % 3 === 2) [-0.3, 0, 0.3].forEach(a => this.shoot(a, sp)); else this.shoot(0, sp);
        } else {
            switch (n % 4) {
                case 0: this.shoot(aimed, sp); break;
                case 1: [-0.4, 0, 0.4].forEach(a => this.shoot(aimed + a, sp)); break;
                case 2: [-0.9, -0.5, 0.5, 0.9].forEach(a => this.shoot(a, sp * 0.9)); break; // fan with a safe gap in the middle
                default: this.shoot(0, sp, 20); this.shoot(0, sp, this.w - 20); // twin cannons
            }
        }
    },
    draw() {
        if (!this.active) return;
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2, enraged = this.phase === 2;
        const flashing = this.flash > 0 && this.flash % 4 < 2;
        arkCtx.shadowBlur = 20; arkCtx.shadowColor = enraged ? '#f00' : '#f0f'; arkCtx.fillStyle = flashing ? '#aaa' : (enraged ? '#4a1010' : '#333');
        arkCtx.beginPath(); arkCtx.ellipse(cx, cy, this.w / 2, this.h / 2, 0, 0, Math.PI * 2); arkCtx.fill();
        arkCtx.shadowBlur = 10; arkCtx.shadowColor = enraged ? '#ff0' : '#f00'; arkCtx.fillStyle = enraged ? '#ff0' : '#f00';
        arkCtx.fillRect(this.x + 30, this.y + 40, 20, enraged ? 14 : 10); arkCtx.fillRect(this.x + 70, this.y + 40, 20, enraged ? 14 : 10);
        arkCtx.fillStyle = '#000'; arkCtx.fillRect(this.x + 40, this.y + 80, 40, 15);
        arkCtx.shadowBlur = 0; arkCtx.fillStyle = enraged ? '#ff6a00' : '#f00'; arkCtx.fillRect(this.x, this.y - 20, this.w * Math.max(0, this.hp / this.maxHp), 8);
        arkCtx.strokeStyle = '#fff'; arkCtx.lineWidth = 1; arkCtx.strokeRect(this.x, this.y - 20, this.w, 8);
        arkCtx.fillStyle = '#fff'; arkCtx.fillRect(this.x + this.w / 2 - 1, this.y - 22, 2, 12); // phase-2 threshold marker
        this.projectiles.forEach(p => { arkCtx.fillStyle = enraged ? '#ff6a00' : '#ff0'; arkCtx.beginPath(); arkCtx.arc(p.x, p.y, 5, 0, Math.PI * 2); arkCtx.fill(); });
    },
    update() {
        if (!this.active) return;
        this.tick++;
        if (this.hitCooldown > 0) this.hitCooldown--;
        if (this.flash > 0) this.flash--;
        this.x += this.dir * this.speed();
        const minX = 50, maxX = ARK_GAME_WIDTH - 50 - this.w;
        if (this.x <= minX) { this.x = minX; this.dir = 1; } else if (this.x >= maxX) { this.x = maxX; this.dir = -1; }
        if (this.phase === 2) {
            this.y = this.baseY + Math.sin(this.tick / 30) * 20;
            if (this.tick % 90 === 0 && Math.random() < 0.4) this.dir *= -1; // less predictable when enraged
        }
        if (--this.fireTimer <= 0) { this.fireVolley(); this.fireTimer = this.fireDelay(); }
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i]; p.x += p.dx; p.y += p.dy;
            if (p.y > ARK_GAME_HEIGHT + 10 || p.x < -10 || p.x > ARK_GAME_WIDTH + 10) { this.projectiles.splice(i, 1); continue; }
            if (arkCircleRectCollide(p.x, p.y, 5, arkVaus.x, arkVaus.y, arkVaus.width, arkVaus.height).hit) { handleArkLifeLost(); return; }
        }
    },
    // Circle-vs-circle (the body is 120x120): reflects the ball off the surface normal and pushes it clear.
    // Returns true only when the ball was actually travelling into the boss.
    collide(ball) {
        const R = this.w / 2, cx = this.x + R, cy = this.y + this.h / 2;
        let nx = ball.x - cx, ny = ball.y - cy, d = Math.hypot(nx, ny);
        if (d > R + ball.r) return false;
        if (d < 0.0001) { nx = 0; ny = 1; d = 1; }
        nx /= d; ny /= d;
        const vn = ball.dx * nx + ball.dy * ny;
        if (vn < 0) { ball.dx -= 2 * vn * nx; ball.dy -= 2 * vn * ny; }
        ball.x = cx + nx * (R + ball.r + 1); ball.y = cy + ny * (R + ball.r + 1);
        return vn < 0;
    },
    containsPoint(px, py) { return Math.hypot(px - (this.x + this.w / 2), py - (this.y + this.h / 2)) <= this.w / 2 + 2; },
    hit(dmg = 1) {
        if (this.hitCooldown > 0) return false; // one contact = one hit
        this.hitCooldown = 12; this.flash = 8;
        playRetroSound('boss_hit'); this.hp -= dmg; arkState.score += 100; updateArkHUD();
        if (this.phase === 1 && this.hp <= this.maxHp * 0.5) { this.phase = 2; this.flash = 45; this.projectiles = []; this.fireTimer = 90; } // enrage: brief breather, then the faster patterns begin
        if (this.hp <= 0) { this.hp = 0; this.active = false; this.projectiles = []; triggerArkVictory(); }
        return true;
    }
};

let arkBalls = []; let arkLasers = []; let arkLasersOnCooldown = false;

function applyArkPowerUp(type) {
    playRetroSound('powerup_catch'); arkState.score += 1000; updateArkHUD();
    if (type === 'D') {
        const newBalls = [];
        arkBalls.forEach(b => { if (b.active) { [1, -1].forEach(sg => { const nb = new ArkBall(b.x, b.y, sg * b.speed * 0.8, -b.speed * 0.6); nb.speed = b.speed; newBalls.push(nb); }); } });
        newBalls.forEach(nb => nb.active = true); arkBalls.push(...newBalls);
    } else if (type === 'S') {
        arkBalls.forEach(b => { b.speed = Math.max(4, b.speed * 0.6); let currentVel = Math.sqrt(b.dx*b.dx + b.dy*b.dy); if(currentVel > 0) { b.dx = (b.dx / currentVel) * b.speed; b.dy = (b.dy / currentVel) * b.speed; } });
    } else if (type === 'P') {
        arkBricks.forEach(b => b.active = false); checkArkLevelClear();
    } else if (type === 'B') { arkState.lives++; updateArkHUD();
    } else { arkVaus.powerMode = type === 'E' ? 'WIDE' : (type === 'L' ? 'LASER' : 'CATCH'); }
}

function buildArkLevel(levelIdx) {
    arkBricks.length = 0; arkPowerups.length = 0; arkLasers.length = 0; arkBoss.active = false; arkBoss.projectiles = [];
    const layout = arkLevelData[levelIdx];
    if (levelIdx === 4) { arkBoss.reset(); } 
    else { for (let r = 0; r < layout.length; r++) { for (let c = 0; c < layout[r].length; c++) { if (layout[r][c] > 0) { arkBricks.push(new ArkBrick(r, c, layout[r][c])); } } } }
}

function checkArkLevelClear() {
    if (arkState.mode !== 'PLAYING' || arkState.level === 4) return;
    const remainingBreakable = arkBricks.filter(b => b.active && b.type !== 8).length;
    if (remainingBreakable === 0) { arkState.mode = 'TRANSITION'; setTimeout(() => { arkState.level++; startArkLevel(); }, 2000); }
}

function resetArkVausAndBall() { arkVaus.x = ARK_GAME_WIDTH / 2 - arkVaus.baseWidth / 2; arkVaus.width = arkVaus.baseWidth; arkVaus.powerMode = 'NORMAL'; arkBalls = [new ArkBall(0, 0, 0, 0)]; arkLasers = []; arkPowerups.length = 0; }

function handleArkLifeLost() {
    if (arkState.mode !== 'PLAYING') return; // one life per incident, never after game over
    arkBoss.projectiles = []; arkBoss.fireTimer = Math.max(arkBoss.fireTimer, 75);
    playRetroSound('die'); arkState.lives--; updateArkHUD();
    if (arkState.lives <= 0) { arkState.mode = 'GAMEOVER'; arkDisplays.finalScore.textContent = `SCORE: ${arkState.score}`; arkScreens.gameOver.classList.remove('ark-hidden'); } 
    else { resetArkVausAndBall(); }
}

function exitArkanoid() {
    arkState.mode = 'START'; 
    arkScreens.gameOver.classList.add('ark-hidden');
    arkScreens.victory.classList.add('ark-hidden');
    arkScreens.start.classList.remove('ark-hidden');
    returnToMenu();
}

function arkCircleRectCollide(cx, cy, radius, rx, ry, rw, rh) {
    let testX = cx; let testY = cy;
    if (cx < rx) testX = rx; else if (cx > rx + rw) testX = rx + rw;
    if (cy < ry) testY = ry; else if (cy > ry + rh) testY = ry + rh;
    let distX = cx - testX; let distY = cy - testY; let distance = Math.sqrt((distX*distX) + (distY*distY));
    if (distance <= radius) return { hit: true, distX: distX, distY: distY, closestX: testX, closestY: testY }; return { hit: false };
}

// Reflects the ball off the face it actually touched. Velocity is forced to point away from the
// rect (never blindly negated), so overlapping a block for several frames can't make it jitter or stick.
function arkResolveRect(ball, rx, ry, rw, rh, col) {
    const r = ball.r + 0.5;
    let nx = col.distX, ny = col.distY;
    if (Math.hypot(nx, ny) < 0.0001) { // centre is inside the rect: use the nearest face
        const ox = (ball.x - (rx + rw / 2)) / (rw / 2), oy = (ball.y - (ry + rh / 2)) / (rh / 2);
        if (Math.abs(ox) > Math.abs(oy)) { nx = ox > 0 ? 1 : -1; ny = 0; ball.x = ox > 0 ? rx + rw + r : rx - r; }
        else { ny = oy > 0 ? 1 : -1; nx = 0; ball.y = oy > 0 ? ry + rh + r : ry - r; }
    } else if (Math.abs(nx) > Math.abs(ny)) { ball.x = col.closestX + Math.sign(nx) * r; ny = 0; }
    else if (Math.abs(ny) > Math.abs(nx)) { ball.y = col.closestY + Math.sign(ny) * r; nx = 0; }
    else { ball.x = col.closestX + Math.sign(nx) * r * Math.SQRT1_2; ball.y = col.closestY + Math.sign(ny) * r * Math.SQRT1_2; } // corner
    if (nx) ball.dx = Math.abs(ball.dx) * Math.sign(nx);
    if (ny) ball.dy = Math.abs(ball.dy) * Math.sign(ny);
}

// Keeps speed constant and the ball from settling into a (near-)horizontal loop.
function arkNormalizeBall(ball) {
    const len = Math.hypot(ball.dx, ball.dy);
    if (!isFinite(len) || len < 0.0001) { ball.dx = 0; ball.dy = -ball.speed; return; }
    let nx = ball.dx / len, ny = ball.dy / len;
    if (Math.abs(ny) < 0.3) { ny = ny > 0 ? 0.3 : -0.3; nx = (nx < 0 ? -1 : 1) * Math.sqrt(1 - 0.09); }
    ball.dx = nx * ball.speed; ball.dy = ny * ball.speed;
}

function handleArkCollisions() {
    for (let i = arkLasers.length - 1; i >= 0; i--) {
        let l = arkLasers[i]; l.y += l.dy;
        if (l.y < 0) { arkLasers.splice(i, 1); continue; }
        let hit = false;
        for (let b of arkBricks) { if (b.active && l.y < b.y + b.h && l.y + 10 > b.y && l.x > b.x && l.x < b.x + b.w) { b.hit(); hit = true; break; } }
        if (!hit && arkBoss.active && arkBoss.containsPoint(l.x, l.y)) { arkBoss.hit(); hit = true; }
        if (hit) arkLasers.splice(i, 1);
    }

    for (let i = arkBalls.length - 1; i >= 0; i--) {
        let ball = arkBalls[i]; ball.update();
        if (ball.y - ball.r > ARK_GAME_HEIGHT) { arkBalls.splice(i, 1); if (arkBalls.length === 0) handleArkLifeLost(); continue; }
        if (ball.stuck || !ball.active) continue;

        // Paddle: only when falling and the ball's centre is still above the paddle's mid-line
        const colVaus = arkCircleRectCollide(ball.x, ball.y, ball.r, arkVaus.x, arkVaus.y, arkVaus.width, arkVaus.height);
        if (colVaus.hit && ball.dy > 0 && ball.y <= arkVaus.y + arkVaus.height / 2) {
            playRetroSound('bounce_paddle'); ball.idle = 0; ball.y = arkVaus.y - ball.r - 1;
            if (arkVaus.powerMode === 'CATCH') { ball.stuck = true; ball.stuckOffset = Math.max(0, Math.min(arkVaus.width, ball.x - arkVaus.x)); continue; }
            const hitPoint = Math.max(-1, Math.min(1, (ball.x - (arkVaus.x + arkVaus.width / 2)) / (arkVaus.width / 2)));
            const angle = hitPoint * 60 * Math.PI / 180;
            ball.dx = ball.speed * Math.sin(angle); ball.dy = -ball.speed * Math.cos(angle);
        }

        if (arkBoss.active && arkBoss.collide(ball)) { if (arkBoss.hit()) ball.speed = Math.min(10, ball.speed + 0.15); ball.idle = 0; } // ball quickens as the boss weakens

        // Bricks: only the closest one takes damage per frame (damaging two at once let the ball tunnel),
        // but up to 3 overlaps are pushed apart, since the 6px gaps between bricks are narrower than the ball.
        let damaged = false;
        for (let pass = 0; pass < 3; pass++) {
            let best = null, bestCol = null, bestDist = Infinity;
            for (const b of arkBricks) {
                if (!b.active) continue;
                const col = arkCircleRectCollide(ball.x, ball.y, ball.r, b.x, b.y, b.w, b.h);
                if (col.hit) { const d = Math.hypot(col.distX, col.distY); if (d < bestDist) { best = b; bestCol = col; bestDist = d; } }
            }
            if (!best) break;
            if (!damaged) {
                damaged = true; ball.idle = 0;
                if (best.hit() && ball.speed < 12) ball.speed += 0.05;
            }
            arkResolveRect(ball, best.x, best.y, best.w, best.h, bestCol);
        }

        // Anti-stall: if nothing has happened for ~30s, nudge the trajectory
        if (++ball.idle > 1800) {
            const a = (Math.random() - 0.5) * 0.5, c = Math.cos(a), sn = Math.sin(a);
            const ndx = ball.dx * c - ball.dy * sn, ndy = ball.dx * sn + ball.dy * c; ball.dx = ndx; ball.dy = ndy; ball.idle = 1500;
        }
        arkNormalizeBall(ball);
    }
}

function updateArkHUD() { arkDisplays.score.textContent = `1UP: ${arkState.score}`; arkDisplays.level.textContent = `STAGE: ${arkState.level}`; arkDisplays.lives.textContent = `LIVES: ${arkState.lives}`; }

function startArkLevel() {
    buildArkLevel(arkState.level); resetArkVausAndBall(); updateArkHUD();
    arkScreens.levelAnnounce.textContent = arkState.level === 4 ? "BOSS: DOH" : `STAGE ${arkState.level}`; arkScreens.levelAnnounce.classList.remove('ark-hidden');
    setTimeout(() => { arkScreens.levelAnnounce.classList.add('ark-hidden'); arkState.mode = 'PLAYING'; }, 2000);
}

function triggerArkVictory() { arkState.mode = 'VICTORY'; arkDisplays.victoryScore.textContent = `FINAL SCORE: ${arkState.score}`; arkScreens.victory.classList.remove('ark-hidden'); }

function resetArkGame() {
    arkState.score = 0; arkState.lives = settings.arkLives; arkState.level = 1;
    arkScreens.start.classList.add('ark-hidden'); arkScreens.gameOver.classList.add('ark-hidden'); arkScreens.victory.classList.add('ark-hidden');
    startArkLevel();
}

const arkIsActive = () => document.getElementById('arkanoid').classList.contains('active');
function arkInputBlocked() {
    return /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '') || document.getElementById('settings-modal').classList.contains('show');
}
function arkReleaseKeys() { arkLeftPressed = false; arkRightPressed = false; }

// Returning to Arkanoid after leaving mid-game used to leave it frozen in TRANSITION forever.
function resumeArkanoid() {
    if (arkState.mode !== 'PAUSED') return;
    arkReleaseKeys();
    arkState.mode = 'TRANSITION';
    arkScreens.levelAnnounce.textContent = 'GET READY'; arkScreens.levelAnnounce.classList.remove('ark-hidden');
    setTimeout(() => {
        arkScreens.levelAnnounce.classList.add('ark-hidden');
        if (arkState.mode === 'TRANSITION') arkState.mode = arkIsActive() ? 'PLAYING' : 'PAUSED';
    }, 1000);
}

document.addEventListener('keydown', (e) => {
    if (!arkIsActive() || arkInputBlocked()) return;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') arkRightPressed = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') arkLeftPressed = true;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault(); // the game container is scrollable
    if (e.key === ' ' && arkState.mode === 'PLAYING') { e.preventDefault(); arkVaus.fire(); }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') arkRightPressed = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') arkLeftPressed = false;
});
// A key released while the window lost focus / changed fullscreen state never sends keyup
window.addEventListener('blur', arkReleaseKeys);
document.addEventListener('visibilitychange', arkReleaseKeys);
['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(ev => document.addEventListener(ev, arkReleaseKeys));

function getArkMousePos(e) {
    if (arkState.mode !== 'PLAYING') return;
    const rect = arkCanvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = (e.clientX - rect.left) * (ARK_GAME_WIDTH / rect.width);
    arkVaus.x = Math.max(0, Math.min(ARK_GAME_WIDTH - arkVaus.width, x - arkVaus.width / 2));
}

arkCanvas.addEventListener('mousemove', getArkMousePos);
arkCanvas.addEventListener('mousedown', (e) => { if (e.button !== 0) return; initAudio(); if (arkState.mode === 'PLAYING') arkVaus.fire(); });
arkCanvas.addEventListener('touchmove', (e) => { if (!arkIsActive()) return; e.preventDefault(); getArkMousePos(e.touches[0]); }, { passive: false });
// preventDefault stops the browser's follow-up emulated mouse events (they fired the ball twice)
arkCanvas.addEventListener('touchstart', (e) => { if (!arkIsActive()) return; e.preventDefault(); initAudio(); if (arkState.mode === 'PLAYING') { getArkMousePos(e.touches[0]); arkVaus.fire(); } }, { passive: false });

document.getElementById('ark-start-btn').addEventListener('click', () => { initAudio(); resetArkGame(); });
document.getElementById('ark-restart-btn').addEventListener('click', () => { initAudio(); resetArkGame(); });
document.getElementById('ark-next-level-btn').addEventListener('click', () => { initAudio(); resetArkGame(); });

function drawArk() {
    requestAnimationFrame(drawArk);
    if(document.getElementById('arkanoid').classList.contains('active')) {
        arkCtx.clearRect(0, 0, ARK_GAME_WIDTH, ARK_GAME_HEIGHT);

        if (arkState.mode === 'PLAYING') {
            if (arkRightPressed) arkVaus.x += arkVaus.speed; if (arkLeftPressed) arkVaus.x -= arkVaus.speed;
            arkVaus.update(); arkBoss.update(); handleArkCollisions(); arkPowerups.forEach(p => p.update()); checkArkLevelClear();
        }

        arkPowerups.forEach(p => p.draw()); arkBricks.forEach(b => b.draw());

        arkCtx.fillStyle = '#f00'; arkCtx.shadowBlur = 10; arkCtx.shadowColor = '#f00';
        arkLasers.forEach(l => { arkCtx.fillRect(l.x, l.y, 4, 15); }); arkCtx.shadowBlur = 0;

        arkBoss.draw(); arkVaus.draw(); arkBalls.forEach(b => b.draw());

        if (arkState.mode === 'PLAYING' && arkBalls.length === 1 && !arkBalls[0].active && !arkBalls[0].stuck) {
            arkCtx.fillStyle = '#fff'; arkCtx.font = '16px "Press Start 2P"'; arkCtx.textAlign = 'center'; arkCtx.shadowBlur = 10; arkCtx.shadowColor = 'var(--secondary)';
            arkCtx.fillText('FIRE TO LAUNCH', ARK_GAME_WIDTH / 2, ARK_GAME_HEIGHT / 2 + 100); arkCtx.shadowBlur = 0;
        }
    }
}

updateArkHUD();
drawArk();

// --- Settings ---
const $ = id => document.getElementById(id);
const DEFAULTS = { sound: true, volume: 100, theme: 'synthwave', scanlines: true, reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, tttMode: '2P', tttLevel: 'easy', snakeSpeed: 'normal', snakeWrap: false, tetrisSpeed: 'normal', arkLives: 3 };
const THEMES = {
    synthwave: { primary: '#ff00ff', secondary: '#00ffff', tertiary: '#39ff14', bg: '#090014' },
    sunset: { primary: '#ff6a00', secondary: '#ffd400', tertiary: '#ff2d75', bg: '#140500' },
    ice: { primary: '#4d7cff', secondary: '#00f0ff', tertiary: '#b6ff3b', bg: '#020617' },
    terminal: { primary: '#00ff66', secondary: '#9dff00', tertiary: '#00ffd5', bg: '#001407' }
};
const SNAKE_DELAY = { slow: 8, normal: 6, fast: 4 };
const TETRIS_DROP = { slow: 1400, normal: 1000, fast: 600 };
const CONTROLS = [['set-sound','sound','check'],['set-volume','volume','num'],['set-theme','theme'],['set-scanlines','scanlines','check'],['set-motion','reduceMotion','check'],['set-ttt-mode','tttMode'],['set-ttt-level','tttLevel'],['set-snake-speed','snakeSpeed'],['set-snake-wrap','snakeWrap','check'],['set-tetris-speed','tetrisSpeed'],['set-ark-lives','arkLives','num']];

let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('onlyFunsSettings')) || {}); } catch (e) {}
function saveSettings() { try { localStorage.setItem('onlyFunsSettings', JSON.stringify(settings)); } catch (e) {} }

let masterGain;
function masterOut() {
    if (!masterGain) { masterGain = audioCtx.createGain(); masterGain.connect(audioCtx.destination); }
    masterGain.gain.value = settings.volume / 100;
    return masterGain;
}
function setSound(on) {
    soundEnabled = on;
    document.querySelectorAll('#snake-sound-indicator').forEach(i => i.innerText = on ? 'SND: ON' : 'SND: OFF');
}
function toggleSound() { settings.sound = !soundEnabled; setSound(settings.sound); saveSettings(); syncSettingsUI(); }

function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${a})`;
}

function applySettings() {
    const s = settings, root = document.documentElement, t = THEMES[s.theme] || THEMES.synthwave;
    for (const k in t) root.style.setProperty('--' + k, t[k]);
    tetrisGridColor = hexToRgba(t.secondary, 0.16);
    root.classList.toggle('no-scan', !s.scanlines);
    root.classList.toggle('reduce-motion', s.reduceMotion);
    setSound(s.sound);
    if (masterGain) masterGain.gain.value = s.volume / 100;
    snakeBaseDelay = SNAKE_DELAY[s.snakeSpeed] || 6;
    currentFrameDelay = Math.max(2, snakeBaseDelay - Math.floor(score / 50));
    dropInterval = TETRIS_DROP[s.tetrisSpeed] || 1000;
    if ($('ttt-mode').value !== s.tttMode) { $('ttt-mode').value = s.tttMode; changeTTTMode(); }
    if ($('ttt-difficulty').value !== s.tttLevel) { $('ttt-difficulty').value = s.tttLevel; resetTTT(); }
}
function syncSettingsUI() {
    CONTROLS.forEach(([id, key, type]) => { const el = $(id); if (type === 'check') el.checked = !!settings[key]; else el.value = settings[key]; });
}
CONTROLS.forEach(([id, key, type]) => {
    const el = $(id);
    el.addEventListener('input', () => {
        settings[key] = type === 'check' ? el.checked : type === 'num' ? Number(el.value) : el.value;
        saveSettings(); applySettings();
    });
});
$('set-volume').addEventListener('change', () => { initAudio(); playRetroSound('eat'); });

// Pause whatever is running while settings are open
let paused = {};
function openSettings() {
    syncSettingsUI();
    paused = { snake: snakeGameActive && !snakePaused, tetris: tetrisGameActive, ark: arkState.mode === 'PLAYING' };
    if (paused.snake) snakePaused = true;
    if (paused.tetris) tetrisGameActive = false;
    if (paused.ark) arkState.mode = 'TRANSITION';
    $('settings-modal').classList.add('show');
    $('set-sound').focus();
}
function closeSettings() {
    $('settings-modal').classList.remove('show');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (paused.snake) snakePaused = false;
    if (paused.tetris) tetrisGameActive = true;
    if (paused.ark && arkState.mode === 'TRANSITION') arkState.mode = 'PLAYING';
    paused = {};
}
function resetSettings() { settings = { ...DEFAULTS }; saveSettings(); syncSettingsUI(); applySettings(); }
function clearSnakeScores() {
    if (!confirm('Clear all Snake high scores?')) return;
    snakeLeaderboard = [];
    try { localStorage.removeItem('onlyFunsSnakeScores'); } catch (e) {}
    highEl.innerText = '0';
}
function playAgainSL() { $('sl-popup').classList.remove('show'); resetSLGame(); }

document.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.key === 'm' || e.key === 'M') toggleSound();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('settings-modal').classList.contains('show')) closeSettings(); });

syncSettingsUI();
applySettings();
