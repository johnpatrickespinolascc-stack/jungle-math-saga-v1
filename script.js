const SECURITY = {
    SALT: 'JungleMath2024SecureSalt_X9#kL$',
    ITERATIONS: 10000,
    SESSION_TIMEOUT: 30 * 60 * 1000,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000
};
const CONSTANTS = {
    TOTAL_LEVELS: 56,
    QUESTIONS_PER_GAME: 20,
    DICE_MIN: 1,
    DICE_MAX: 6
};
const ACHIEVEMENTS = [
    {
        id: 'first_steps',
        title: 'First Steps',
        description: 'Complete your first game',
        icon: '👣',
        condition: (stats) => stats.games >= 1,
        target: 1,
        type: 'games'
    },
    {
        id: 'novice_explorer',
        title: 'Novice Explorer',
        description: 'Complete 5 games',
        icon: '🎒',
        condition: (stats) => stats.games >= 5,
        target: 5,
        type: 'games'
    },
    {
        id: 'jungle_veteran',
        title: 'Jungle Veteran',
        description: 'Complete 20 games',
        icon: '🌳',
        condition: (stats) => stats.games >= 20,
        target: 20,
        type: 'games'
    },
    {
        id: 'math_rookie',
        title: 'Math Rookie',
        description: 'Answer 10 questions correctly',
        icon: '📝',
        condition: (stats) => stats.correct >= 10,
        target: 10,
        type: 'correct'
    },
    {
        id: 'math_wizard',
        title: 'Math Wizard',
        description: 'Answer 50 questions correctly',
        icon: '🔮',
        condition: (stats) => stats.correct >= 50,
        target: 50,
        type: 'correct'
    },
    {
        id: 'math_genius',
        title: 'Math Genius',
        description: 'Answer 200 questions correctly',
        icon: '🧠',
        condition: (stats) => stats.correct >= 200,
        target: 200,
        type: 'correct'
    },
    {
        id: 'score_hunter',
        title: 'Score Hunter',
        description: 'Reach 50 points in a game',
        icon: '🎯',
        condition: (stats) => stats.high >= 50,
        target: 50,
        type: 'high'
    },
    {
        id: 'score_master',
        title: 'Score Master',
        description: 'Reach 100 points in a game',
        icon: '👑',
        condition: (stats) => stats.high >= 100,
        target: 100,
        type: 'high'
    },
    {
        id: 'perfect_game',
        title: 'Perfect Game',
        description: 'Reach 200 points in a game',
        icon: '💎',
        condition: (stats) => stats.high >= 200,
        target: 200,
        type: 'high'
    },
    {
        id: 'speed_demon',
        title: 'Speed Demon',
        description: 'Maintain a 5x streak',
        icon: '⚡',
        condition: (stats) => stats.maxStreak >= 5,
        target: 5,
        type: 'streak'
    },
    {
        id: 'unstoppable',
        title: 'Unstoppable',
        description: 'Maintain a 10x streak',
        icon: '🔥',
        condition: (stats) => stats.maxStreak >= 10,
        target: 10,
        type: 'streak'
    },
    {
        id: 'completionist',
        title: 'Completionist',
        description: 'Reach the final tile',
        icon: '🏆',
        condition: (stats) => stats.gamesWon >= 1,
        target: 1,
        type: 'wins'
    }
];

const state = {
    sessionUser: null,
    sessionStart: null,
    difficulty: 'easy',
    playerPos: 0,
    totalQs: 0,
    playerPoints: 0,
    targetResult: 0,
    startCell: 0,
    streak: 0,
    maxStreak: 0,
    correctCount: 0,
    wrongCount: 0,
    isMoving: false,
    isRolling: false,
    gameHistory: [],
    soundEnabled: true,
    volume: { master: 70, sfx: 80, music: 50 },
    achievementsUnlocked: [],
    currentProblem: null
};

let audioCtx;
let levelPoints = [];
let mathTimer;
let timestampStart;

const API_BASE = './'; // kept for reference but all calls are intercepted below

// ═══════════════════════════════════════════════════════════════
//  localDB  –  drop-in localStorage replacement for the PHP API
//  Stores users + stats in localStorage so the game works on
//  GitHub Pages (no server needed).
// ═══════════════════════════════════════════════════════════════
const localDB = {

    // ── helpers ─────────────────────────────────────────────────
    _get(k)        { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    _set(k, v)     { localStorage.setItem(k, JSON.stringify(v)); },
    _ok(data = {}) { return { success: true,  message: '', ...data }; },
    _err(msg)      { return { success: false, message: msg }; },

    // ── user store ───────────────────────────────────────────────
    _users()       { return this._get('jmdb_users')  || {}; },
    _saveUsers(u)  { this._set('jmdb_users', u); },

    _stats(un)     { return this._get(`jmdb_stats_${un.toLowerCase()}`) || {
        games:0, games_won:0, high_score:0, correct_answers:0,
        wrong_answers:0, total_time:0, max_streak:0,
        bananas:50, total_stars:0, snake_segments:3
    }; },
    _saveStats(un, s) { this._set(`jmdb_stats_${un.toLowerCase()}`, s); },

    _history(un)   { return this._get(`jmdb_history_${un.toLowerCase()}`) || []; },
    _saveHistory(un, h) { this._set(`jmdb_history_${un.toLowerCase()}`, h); },

    _achievements(un) { return this._get(`jmdb_ach_${un.toLowerCase()}`) || []; },
    _saveAchievements(un, a) { this._set(`jmdb_ach_${un.toLowerCase()}`, a); },

    // session (in-memory only, no PHP session needed)
    _session: null,

    // ── AUTH ─────────────────────────────────────────────────────
    register(username, email, password) {
        username = username.trim();
        email    = email.trim();
        if (username.length < 3)
            return this._err('Username must be at least 3 characters');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return this._err('Invalid email address');
        if (password.length < 6)
            return this._err('Password must be at least 6 characters');
        if (!/[a-z]/.test(password))
            return this._err('Password must contain at least 1 lowercase letter (a-z)');
        if (!/[A-Z]/.test(password))
            return this._err('Password must contain at least 1 uppercase letter (A-Z)');

        const users = this._users();
        const key   = username.toLowerCase();
        if (Object.values(users).find(u => u.username.toLowerCase() === key))
            return this._err('Username already taken');
        if (Object.values(users).find(u => u.email.toLowerCase() === email.toLowerCase()))
            return this._err('Email already registered');

        // simple hash (CryptoJS available via CDN in index.html)
        const hash = typeof CryptoJS !== 'undefined'
            ? CryptoJS.SHA256(password).toString()
            : btoa(password);

        users[key] = { username, email, passwordHash: hash };
        this._saveUsers(users);
        this._saveStats(username, this._stats(username)); // init stats
        return this._ok();
    },

    login(username, password) {
        const users = this._users();
        const user  = users[username.toLowerCase()];
        if (!user) return this._err('Invalid username or password');

        const hash = typeof CryptoJS !== 'undefined'
            ? CryptoJS.SHA256(password).toString()
            : btoa(password);

        if (hash !== user.passwordHash)
            return this._err('Invalid username or password');

        this._session = { user_id: username.toLowerCase(), username: user.username };
        return this._ok({ user_id: username.toLowerCase(), username: user.username, email: user.email });
    },

    logout() {
        this._session = null;
        return this._ok();
    },

    checkSession() {
        if (this._session) return this._ok({ user_id: this._session.user_id, username: this._session.username });
        return this._err('No session');
    },

    currentUser() {
        return this._session ? this._session.username : null;
    },

    // ── GAME STATS ───────────────────────────────────────────────
    getStats() {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        return this._ok({ stats: this._stats(u) });
    },

    saveGame(data) {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const s = this._stats(u);

        s.games++;
        if (data.reachedEnd) s.games_won++;
        if (data.score > s.high_score) s.high_score = data.score;
        s.correct_answers += data.correct || 0;
        s.wrong_answers   += data.wrong   || 0;
        s.total_time      += data.duration || 0;
        if ((data.maxStreak || 0) > s.max_streak) s.max_streak = data.maxStreak;
        s.total_stars     += data.stars    || 0;
        s.snake_segments   = Math.max(3, data.segments || 3);
        this._saveStats(u, s);

        const h = this._history(u);
        h.unshift({ ...data, played_at: new Date().toISOString() });
        if (h.length > 100) h.length = 100;
        this._saveHistory(u, h);
        return this._ok();
    },

    getBananas() {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const s = this._stats(u);
        return this._ok({ bananas: s.bananas, stars: s.total_stars, segments: s.snake_segments });
    },

    addBananas(amount) {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const s = this._stats(u);
        s.bananas = (s.bananas || 0) + Math.max(0, amount);
        this._saveStats(u, s);
        return this._ok({ balance: s.bananas });
    },

    spendBananas(amount) {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const s = this._stats(u);
        if ((s.bananas || 0) < amount) return this._err('Not enough bananas');
        s.bananas -= amount;
        this._saveStats(u, s);
        return this._ok({ balance: s.bananas });
    },

    resetStats() {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        this._saveStats(u, {
            games:0, games_won:0, high_score:0, correct_answers:0,
            wrong_answers:0, total_time:0, max_streak:0,
            bananas:50, total_stars:0, snake_segments:3
        });
        this._saveHistory(u, []);
        this._saveAchievements(u, []);
        return this._ok();
    },

    getHistory(limit = 10) {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        return this._ok({ history: this._history(u).slice(0, limit) });
    },

    getAchievements() {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        return this._ok({ achievements: this._achievements(u) });
    },

    updateAchievements(list) {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const existing = new Set(this._achievements(u));
        list.forEach(a => existing.add(a));
        this._saveAchievements(u, [...existing]);
        return this._ok();
    },

    // ── LEADERBOARD ──────────────────────────────────────────────
    getLeaderboard(filter = 'all') {
        const users = this._users();
        const rows  = [];

        for (const key of Object.keys(users)) {
            const un = users[key].username;
            const s  = this._stats(un);
            if (!s || s.games === 0) continue;

            let highScore     = s.high_score || 0;
            let correctAnswers = s.correct_answers || 0;
            let wrongAnswers   = s.wrong_answers   || 0;
            let games          = s.games || 0;

            if (filter === 'daily' || filter === 'weekly') {
                const cutoff = Date.now() - (filter === 'daily' ? 86400000 : 604800000);
                const hist = this._history(un).filter(h => new Date(h.played_at).getTime() >= cutoff);
                if (hist.length === 0) continue;
                games          = hist.length;
                highScore      = Math.max(...hist.map(h => h.score || 0));
                correctAnswers = hist.reduce((a, h) => a + (h.correct || 0), 0);
                wrongAnswers   = hist.reduce((a, h) => a + (h.wrong   || 0), 0);
            }

            const total    = correctAnswers + wrongAnswers;
            const accuracy = total > 0 ? Math.round((correctAnswers / total) * 100) : 0;
            rows.push({ username: un, games, high_score: highScore, correct: correctAnswers, accuracy: accuracy + '%' });
        }

        rows.sort((a, b) => b.high_score - a.high_score);
        rows.forEach((r, i) => r.rank = i + 1);
        return this._ok({ leaderboard: rows.slice(0, 100) });
    },

    // ── ACCOUNT SETTINGS ────────────────────────────────────────
    changeUsername(newName) {
        newName = newName.trim();
        if (newName.length < 3) return this._err('Username must be at least 3 characters');
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const users = this._users();
        if (users[newName.toLowerCase()]) return this._err('Username already taken');

        const oldKey  = u.toLowerCase();
        const oldUser = users[oldKey];
        if (!oldUser) return this._err('User not found');

        users[newName.toLowerCase()] = { ...oldUser, username: newName };
        delete users[oldKey];
        this._saveUsers(users);

        // migrate stats/history/achievements keys
        ['stats','history','ach'].forEach(t => {
            const data = this._get(`jmdb_${t}_${oldKey}`);
            if (data !== null) {
                this._set(`jmdb_${t}_${newName.toLowerCase()}`, data);
                localStorage.removeItem(`jmdb_${t}_${oldKey}`);
            }
        });

        this._session.username = newName;
        this._session.user_id  = newName.toLowerCase();
        return this._ok({ username: newName });
    },

    changePassword(currentPassword, newPassword) {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const users = this._users();
        const user  = users[u.toLowerCase()];
        if (!user) return this._err('User not found');

        const currHash = typeof CryptoJS !== 'undefined'
            ? CryptoJS.SHA256(currentPassword).toString()
            : btoa(currentPassword);

        if (currHash !== user.passwordHash) return this._err('Current password is incorrect');
        if (newPassword.length < 6) return this._err('New password must be at least 6 characters');

        const newHash = typeof CryptoJS !== 'undefined'
            ? CryptoJS.SHA256(newPassword).toString()
            : btoa(newPassword);

        user.passwordHash = newHash;
        this._saveUsers(users);
        return this._ok();
    },

    deleteAccount() {
        const u = this.currentUser(); if (!u) return this._err('Not authenticated');
        const users = this._users();
        delete users[u.toLowerCase()];
        this._saveUsers(users);
        ['stats','history','ach'].forEach(t => localStorage.removeItem(`jmdb_${t}_${u.toLowerCase()}`));
        this._session = null;
        return this._ok();
    },

    // ── FORGOT PASSWORD (static site: show new password directly) ──
    forgotPassword(email) {
        const users = this._users();
        const user  = Object.values(users).find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!user) return this._ok(); // don't reveal whether email exists

        // Generate a temporary password
        const tmpPass = 'Tmp' + Math.random().toString(36).slice(2, 8) + '!';
        const hash    = typeof CryptoJS !== 'undefined'
            ? CryptoJS.SHA256(tmpPass).toString()
            : btoa(tmpPass);
        users[user.username.toLowerCase()].passwordHash = hash;
        this._saveUsers(users);
        return this._ok({ tmp_password: tmpPass, username: user.username });
    }
};

const fahhhSound = new Audio('sound/fahhh.mp3');
fahhhSound.preload = 'auto';

const winSound = new Audio('sound/win.mp3');
winSound.preload = 'auto';

fahhhSound.addEventListener('canplaythrough', () => console.log('✅ fahhh.mp3 loaded'));
fahhhSound.addEventListener('error', (e) => console.log('❌ fahhh.mp3 failed to load:', e));

function playFahhh() {
    if (!fahhhSound || !state.soundEnabled) return;
    
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    fahhhSound.currentTime = 0;
    fahhhSound.volume = (state.volume.master / 100) * (state.volume.sfx / 100);
    fahhhSound.play().catch(e => console.error("Playback failed:", e));
}

function playWinSound() {
    if (!winSound || !state.soundEnabled) return;
    
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.log('Audio resume failed:', e));
    }
    
    winSound.currentTime = 0;
    winSound.volume = (state.volume.master / 100) * (state.volume.sfx / 100);
    
    winSound.play().catch(e => {
        if (e.name === 'NotAllowedError') {
            console.log('Audio blocked: User interaction required first');
        } else {
            console.log('Audio error:', e.message);
        }
    });
}

const utils = {
    hashPassword: (password) => {
        const saltedPassword = SECURITY.SALT + password + SECURITY.SALT;
        return CryptoJS.SHA256(saltedPassword).toString();
    },

    generateId: () => {
        return Math.random().toString(36).substr(2, 9);
    },

    formatTime: (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    },

    shuffleArray: (array) => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
    }
};

function togglePassword(inputId, toggleBtn) {
    const input = document.getElementById(inputId);
    const eyeIcon = toggleBtn.querySelector('.eye-icon');

    if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.textContent = '🙈';
    } else {
        input.type = 'password';
        eyeIcon.textContent = '👁️';
    }
}

const audio = {
    init: () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(e => console.log('Audio init resume failed:', e));
        }
    },

    play: (type) => {
        if (!state.soundEnabled || !audioCtx) return;

        const volume = (state.volume.master / 100) * (state.volume.sfx / 100);
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        switch(type) {
            case 'dice':
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
                gainNode.gain.setValueAtTime(volume * 0.3, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            case 'correct':
                [523.25, 659.25, 783.99].forEach((freq, i) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.connect(g);
                    g.connect(audioCtx.destination);
                    o.frequency.value = freq;
                    g.gain.setValueAtTime(volume * 0.3, now + i * 0.1);
                    g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
                    o.start(now + i * 0.1);
                    o.stop(now + i * 0.1 + 0.2);
                });
                break;
            case 'wrong':
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(150, now + 0.2);
                gainNode.gain.setValueAtTime(volume * 0.4, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
            case 'move':
                osc.frequency.setValueAtTime(600, now);
                gainNode.gain.setValueAtTime(volume * 0.2, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            case 'win':
                [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.connect(g);
                    g.connect(audioCtx.destination);
                    o.frequency.value = freq;
                    g.gain.setValueAtTime(volume * 0.3, now + i * 0.1);
                    g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
                    o.start(now + i * 0.1);
                    o.stop(now + i * 0.1 + 0.3);
                });
                break;
            case 'unlock':
                [880, 1108, 1318].forEach((freq, i) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.connect(g);
                    g.connect(audioCtx.destination);
                    o.frequency.value = freq;
                    g.gain.setValueAtTime(volume * 0.3, now + i * 0.15);
                    g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);
                    o.start(now + i * 0.15);
                    o.stop(now + i * 0.15 + 0.3);
                });
                break;
            case 'click':
                osc.frequency.setValueAtTime(1000, now);
                gainNode.gain.setValueAtTime(volume * 0.1, now);
                gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
        }
    }
};

const ui = {
    showToast: (message, type = 'success') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        toast.innerHTML = `${icons[type] || 'ℹ️'} ${message}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    switchPage: (pageId) => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('#nav-list li').forEach(n => n.classList.remove('active'));

        const targetPage = document.getElementById(pageId);
        const targetNav = document.querySelector(`[data-page="${pageId}"]`);

        if (targetPage) targetPage.classList.add('active');
        if (targetNav) targetNav.classList.add('active');

        if (pageId === 'settings') {
            const currentPass = document.getElementById('current-password');
            const newPass = document.getElementById('settings-new-password');
            if (currentPass) currentPass.value = '';
            if (newPass) newPass.value = '';
        }

        audio.play('click');
    },

    createBackgroundElements: () => {
        const bg = document.querySelector('.bg-elements');
        if (!bg) return;

        for (let i = 0; i < 15; i++) {
            const el = document.createElement('div');
            el.className = 'firefly';
            el.style.left = Math.random() * 100 + '%';
            el.style.top = Math.random() * 100 + '%';
            el.style.animationDelay = Math.random() * 10 + 's';
            el.style.animationDuration = (Math.random() * 5 + 8) + 's';
            bg.appendChild(el);
        }
    },

    _leafInterval: null,

    createFallingLeaves: () => { ui.startLeafInterval(); },

    startLeafInterval: () => {
        const container = document.querySelector('.leaf-container');
        if (!container) return;
        if (ui._leafInterval) clearInterval(ui._leafInterval);
        container.innerHTML = '';
        const tid = (shopState && shopState.equippedTheme) ? shopState.equippedTheme : 'default';
        const C = {
            default:  { colors:['#4caf50','#81c784','#2e7d32','#aed581','#00f2ff','#a5d6a7'], size:[10,22], speed:[8,13],  rate:400, br:'2px 15px 2px 15px', glow:7  },
            safari:   { colors:['#ffcc80','#ffb74d','#ff8f00','#ffe082','#d4a017','#ffd54f'], size:[5,14],  speed:[12,18], rate:280, br:'50%',               glow:4  },
            midnight: { colors:['#ce93d8','#b39ddb','#9575cd','#e040fb','#7c4dff','#ffffff'], size:[3,9],   speed:[14,22], rate:200, br:'50%',               glow:16 },
            cherry:   { colors:['#f48fb1','#f06292','#e91e63','#fce4ec','#ff80ab','#ffb3c6'], size:[10,20], speed:[9,15],  rate:320, br:'50% 0 50% 0',       glow:5  },
            cyber:    { colors:['#00ff41','#00e676','#69ff47','#76ff03','#00ffcc','#b2ff59'], size:[3,8],   speed:[5,9],   rate:150, br:'1px',               glow:11 },
        };
        const cfg = C[tid] || C.default;
        ui._leafInterval = setInterval(() => {
            const el = document.createElement('div');
            el.className = 'leaf';
            const sz    = Math.random()*(cfg.size[1]-cfg.size[0])+cfg.size[0];
            const dur   = Math.random()*(cfg.speed[1]-cfg.speed[0])+cfg.speed[0];
            const color = cfg.colors[Math.floor(Math.random()*cfg.colors.length)];
            const drift = (Math.random()-0.5)*140;
            const h     = tid==='cyber' ? sz*(Math.random()>0.5?3:1) : sz;
            el.style.cssText = `position:absolute;width:${sz}px;height:${h}px;left:${Math.random()*100}vw;top:-5%;background-color:${color};border-radius:${tid==='cyber'?'0':cfg.br};animation:fall ${dur}s linear forwards;--drift:${drift}px;box-shadow:0 0 ${cfg.glow}px ${color};opacity:0.85;pointer-events:none;z-index:1;`;
            if (tid==='midnight') el.style.animation=`fall ${dur}s linear forwards, fireflyPulse ${0.8+Math.random()*1.2}s ease-in-out infinite`;
            container.appendChild(el);
            setTimeout(()=>el.remove(), dur*1000);
        }, cfg.rate);
    },

    updateQuickStats: async () => {
        const stats = await game.loadStats();
        if (!stats) return;

        const total = parseInt(stats.correct_answers || 0) + parseInt(stats.wrong_answers || 0);
        const accuracy = total > 0 ? Math.round((stats.correct_answers / total) * 100) : 0;

        const highEl  = document.getElementById('quick-high');
        const gamesEl = document.getElementById('quick-games');
        const accEl   = document.getElementById('quick-accuracy');
        if (highEl)  highEl.innerText  = stats.high_score || 0;
        if (gamesEl) gamesEl.innerText = stats.games || 0;
        if (accEl)   accEl.innerText   = accuracy + '%';

        if (state.sessionUser) {
            const uEl = document.getElementById('profile-username-display');
            if (uEl) uEl.innerText = state.sessionUser.toUpperCase();
        }

        const highScore  = parseInt(stats.high_score || 0);
        const level      = Math.min(50, Math.floor(highScore / 200) + 1);
        const xpPerLevel = 1000;
        const currentXP  = (highScore % 200) * 5;
        const xpPct      = Math.min(100, (currentXP / xpPerLevel) * 100);

        const lvlBadge = document.getElementById('profile-level-badge');
        const lvlLabel = document.getElementById('profile-level-label');
        const xpLabel  = document.getElementById('profile-xp-label');
        const xpFill   = document.getElementById('profile-xp-fill');
        if (lvlBadge) lvlBadge.innerText = level;
        if (lvlLabel) lvlLabel.innerText = 'Level ' + level;
        if (xpLabel)  xpLabel.innerText  = currentXP.toLocaleString() + ' / ' + xpPerLevel.toLocaleString() + ' XP';
        if (xpFill)   xpFill.style.width = xpPct + '%';

        const badgeRow = document.getElementById('profile-badges-row');
        if (badgeRow) {
            const shown = ACHIEVEMENTS.slice(0, 6);
            badgeRow.innerHTML = shown.map(a => {
                const statsObj = {
                    games: parseInt(stats.games || 0),
                    correct: parseInt(stats.correct_answers || 0),
                    high: parseInt(stats.high_score || 0),
                    maxStreak: parseInt(stats.max_streak || 0),
                    gamesWon: parseInt(stats.games_won || 0)
                };
                const unlocked = state.achievementsUnlocked.includes(a.id) || a.condition(statsObj);
                return `<div class="badge-item ${unlocked ? 'unlocked' : 'locked'}" title="${a.title}">${unlocked ? a.icon : '🔒'}</div>`;
            }).join('');
        }
    }
};

const auth = {
    login: async (username, password, remember) => {
        try {
            const result = localDB.login(username, password);
            if (result.success) {
                state.sessionUser = result.username;
                state.sessionStart = Date.now();
                if (remember) localStorage.setItem('jungle_remember_user', username);
                return { success: true };
            } else {
                return { success: false, message: result.message };
            }
        } catch (error) {
            return { success: false, message: 'Login error' };
        }
    },

    register: async (username, email, password) => {
        try {
            const result = localDB.register(username, email, password);
            return { success: result.success, message: result.message };
        } catch (error) {
            return { success: false, message: 'Registration error' };
        }
    },

    logout: async () => {
        localDB.logout();
        state.sessionUser = null;
        state.sessionStart = null;
        shopState.resetToDefaults();
        applyTheme('default');
        document.getElementById('main-app-container').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('login-pass').value = '';
        document.getElementById('auth-msg').innerText = '';
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        hamburgerBtn.classList.remove('active');
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        ui.showToast('Logged out successfully', 'success');
    },

    checkSession: async () => {
        const result = localDB.checkSession();
        if (result.success && result.username) {
            state.sessionUser = result.username;
            shopState.loadForUser(result.username);
        }
        return result.success ? result.username : false;
    }
};

const game = {

    initMap: () => {
        const world    = document.getElementById('game-world');
        const viewport = document.getElementById('viewport');
        const masterPath = document.getElementById('master-path');
        const worldH = 3000;

        const actualW = Math.max((viewport ? viewport.clientWidth - 12 : 0), 400);

        const canvas = document.getElementById('snake-world-canvas');
        if (canvas) { canvas.width = actualW; canvas.height = worldH; }
        world.style.width = actualW + 'px';

        const L = Math.round(actualW * (80  / 480));
        const R = Math.round(actualW * (400 / 480));
        const M = Math.round(actualW * (240 / 480));

        const pathD = `
            M ${L} 2900
            C ${L} 2820, ${R} 2820, ${R} 2740
            C ${R} 2660, ${L} 2660, ${L} 2580
            C ${L} 2500, ${R} 2500, ${R} 2420
            C ${R} 2340, ${L} 2340, ${L} 2260
            C ${L} 2180, ${R} 2180, ${R} 2100
            C ${R} 2020, ${L} 2020, ${L} 1940
            C ${L} 1860, ${R} 1860, ${R} 1780
            C ${R} 1700, ${L} 1700, ${L} 1620
            C ${L} 1540, ${R} 1540, ${R} 1460
            C ${R} 1380, ${L} 1380, ${L} 1300
            C ${L} 1220, ${R} 1220, ${R} 1140
            C ${R} 1060, ${L} 1060, ${L} 980
            C ${L} 900, ${R} 900, ${R} 820
            C ${R} 740, ${L} 740, ${L} 660
            C ${L} 580, ${R} 580, ${R} 500
            C ${R} 420, ${L} 420, ${L} 340
            C ${L} 260, ${R} 260, ${R} 180
            C ${R} 120, ${M} 100, ${M} 60
        `;

        masterPath.setAttribute('d', pathD);
        const roadFill   = document.getElementById('path-road-fill');
        const roadEdge   = document.getElementById('path-road-edge');
        const roadPebble = document.getElementById('path-road-pebble');
        if (roadFill)   roadFill.setAttribute('d', pathD);
        if (roadEdge)   roadEdge.setAttribute('d', pathD);
        if (roadPebble) roadPebble.setAttribute('d', pathD);

        world.querySelectorAll('.level-tile, .deco, .zone-label').forEach(e => e.remove());

        const sx = v => Math.round(v * actualW / 480);

        const zoneBands = [
            { top: 2700, emoji: '🏜️', label: 'DESERT' },
            { top: 1900, emoji: '🌲', label: 'FOREST' },
            { top: 1100, emoji: '🌿', label: 'JUNGLE' },
            { top: 300,  emoji: '⛰️', label: 'MOUNTAIN' },
        ];
        zoneBands.forEach(z => {
            const lbl = document.createElement('div');
            lbl.className = 'zone-label';
            lbl.style.top = z.top + 'px';
            lbl.style.color = 'rgba(255,255,255,0.9)';
            lbl.innerHTML = `${z.emoji} ${z.label}`;
            world.appendChild(lbl);
        });

        const decos = [
            { x: 30, y: 2950, e: '🦴' }, { x: 430, y: 2920, e: '💀' },
            { x: 60, y: 2800, e: '🏔️' }, { x: 390, y: 2780, e: '🏔️' },
            { x: 20, y: 2650, e: '🦴' }, { x: 450, y: 2640, e: '🌵' },
            { x: 35, y: 2530, e: '🌵' }, { x: 420, y: 2500, e: '🦎' },
            { x: 25, y: 2350, e: '🌲' }, { x: 440, y: 2320, e: '🌲' },
            { x: 15, y: 2200, e: '🌳' }, { x: 455, y: 2180, e: '🦌' },
            { x: 30, y: 2050, e: '🍄' }, { x: 430, y: 2020, e: '🌲' },
            { x: 20, y: 1900, e: '🌿' }, { x: 445, y: 1880, e: '🌊' },
            { x: 40, y: 1760, e: '🌳' }, { x: 420, y: 1740, e: '🌲' },
            { x: 15, y: 1600, e: '🌴' }, { x: 450, y: 1580, e: '🐊' },
            { x: 30, y: 1460, e: '🌿' }, { x: 435, y: 1440, e: '🍃' },
            { x: 20, y: 1300, e: '🦜' }, { x: 445, y: 1280, e: '🌴' },
            { x: 15, y: 1150, e: '🐸' }, { x: 450, y: 1120, e: '🌿' },
            { x: 35, y: 980,  e: '🌺' }, { x: 425, y: 960,  e: '🦋' },
            { x: 20, y: 800,  e: '⛰️' }, { x: 440, y: 780,  e: '🦅' },
            { x: 15, y: 640,  e: '❄️' }, { x: 450, y: 620,  e: '🏔️' },
            { x: 30, y: 480,  e: '🌨️' }, { x: 430, y: 460,  e: '⛰️' },
            { x: 20, y: 320,  e: '🦴' }, { x: 445, y: 300,  e: '💀' },
            { x: 35, y: 160,  e: '🏆' }, { x: 420, y: 140,  e: '⭐' },
        ];
        decos.forEach(d => {
            const el = document.createElement('div');
            el.className = 'deco';
            el.style.left = sx(d.x) + 'px';
            el.style.top  = d.y + 'px';
            el.style.fontSize = (20 + Math.random() * 12) + 'px';
            el.style.animationDelay = (Math.random() * 4) + 's';
            el.textContent = d.e;
            world.appendChild(el);
        });

        levelPoints = [];
        const pathLength = masterPath.getTotalLength();
        for (let i = 0; i < CONSTANTS.TOTAL_LEVELS; i++) {
            const t = i / (CONSTANTS.TOTAL_LEVELS - 1);
            const point = masterPath.getPointAtLength(t * pathLength);
            levelPoints.push({ x: point.x, y: point.y });

            const tile = document.createElement('div');
            const isMilestone = (i % 5 === 0);
            const isStart = (i === 0);
            const isEnd   = (i === CONSTANTS.TOTAL_LEVELS - 1);

            tile.className = `level-tile${isMilestone ? ' pink' : ''}${isStart ? ' start-tile' : ''}${isEnd ? ' end-tile' : ''}`;
            tile.id = `tile-${i}`;
            tile.style.left = point.x + 'px';
            tile.style.top  = point.y + 'px';

            if (isStart)    tile.innerHTML = '🏁';
            else if (isEnd) tile.innerHTML = '🏆';
            else            tile.innerText = i + 1;

            world.appendChild(tile);
        }

        game.updatePlayerPosition();
    },

    updatePlayerPosition: () => {
        const viewport = document.getElementById('viewport');

        if (levelPoints[state.playerPos]) {
            const p = levelPoints[state.playerPos];

            snake.pathHistory.unshift({ x: p.x, y: p.y });
            if (snake.pathHistory.length > snake.maxSegments + 4)
                snake.pathHistory.length = snake.maxSegments + 4;

            document.querySelectorAll('.level-tile').forEach((tile, idx) => {
                tile.classList.toggle('current', idx === state.playerPos);
            });

            zoneSystem.check(state.playerPos);

            setTimeout(() => {
                const vp = document.getElementById('viewport');
                const p = levelPoints[state.playerPos];
                if (vp && p) vp.scrollTo({ top: p.y - vp.clientHeight / 2, behavior: 'smooth' });
            }, 100);
        }
    },

    rollDice: async () => {
        if (state.totalQs >= CONSTANTS.QUESTIONS_PER_GAME || 
            state.playerPos >= CONSTANTS.TOTAL_LEVELS - 1 || 
            state.isMoving || 
            state.isRolling) return;

        const wrapper = document.querySelector('.dice-wrapper');
        const cube = document.getElementById('dice-cube');

        state.isRolling = true;
        wrapper.classList.add('rolling');
        audio.play('dice');

        let val;
        if (powerupSystem.activeEffects.luckyroll) {
            val = Math.floor(Math.random() * 3) + 4;
            delete powerupSystem.activeEffects.luckyroll;
            powerupSystem.updateLuckyRollUI();
            ui.showToast('🍀 Lucky Roll fired! High number!', 'success');
        } else {
            val = Math.floor(Math.random() * 6) + 1;
        }

        const extraX = 360 * (Math.floor(Math.random() * 3) + 2);
        const extraY = 360 * (Math.floor(Math.random() * 3) + 2);

        const rotations = {
            1: { x: 0, y: 0 },
            2: { x: 0, y: -90 },
            3: { x: 0, y: -180 },
            4: { x: 0, y: 90 },
            5: { x: -90, y: 0 },
            6: { x: 90, y: 0 }
        };

        const target = rotations[val];
        cube.style.transform = `rotateX(${target.x + extraX}deg) rotateY(${target.y + extraY}deg)`;

        await new Promise(r => setTimeout(r, 1000));

        wrapper.classList.remove('rolling');
        state.isRolling = false;

        state.startCell = state.playerPos;
        await game.movePlayer(val);
    },

    movePlayer: async (steps) => {
        state.isMoving = true;

        for (let i = 0; i < steps; i++) {
            if (state.playerPos < CONSTANTS.TOTAL_LEVELS - 1) {
                state.playerPos++;
                game.updatePlayerPosition();
                audio.play('move');
                await new Promise(r => setTimeout(r, 400));
            }
        }

        state.isMoving = false;

        if (state.playerPos >= CONSTANTS.TOTAL_LEVELS - 1) {
            setTimeout(() => game.handleWin(), 500);
        } else {
            setTimeout(() => game.showProblem(), 500);
        }
    },

    generateProblem: () => {
        let n1, n2, operator, answer;
        const difficulty = state.difficulty;

        const operators = {
            easy: ['+'],
            medium: ['+', '-', '*'],
            hard: ['+', '-', '*', '/']
        };

        const ops = operators[difficulty];
        operator = ops[Math.floor(Math.random() * ops.length)];

        switch(operator) {
            case '+':
                n1 = Math.floor(Math.random() * (difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 50)) + 1;
                n2 = Math.floor(Math.random() * (difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 50)) + 1;
                answer = n1 + n2;
                break;
            case '-':
                n1 = Math.floor(Math.random() * (difficulty === 'medium' ? 20 : 50)) + 10;
                n2 = Math.floor(Math.random() * (n1 - 1)) + 1;
                answer = n1 - n2;
                break;
            case '*':
                n1 = Math.floor(Math.random() * (difficulty === 'medium' ? 10 : 12)) + 2;
                n2 = Math.floor(Math.random() * (difficulty === 'medium' ? 10 : 12)) + 2;
                answer = n1 * n2;
                break;
            case '/':
                n2 = Math.floor(Math.random() * 10) + 2;
                answer = Math.floor(Math.random() * 10) + 1;
                n1 = n2 * answer;
                break;
        }

        const opSymbols = { '+': '+', '-': '-', '*': '×', '/': '÷' };

        return {
            n1,
            n2,
            operator: opSymbols[operator],
            answer,
            display: `${n1} ${opSymbols[operator]} ${n2} = ?`
        };
    },

    showProblem: () => {
        state.totalQs++;
        game.updateUI();

        const problem = game.generateProblem();
        state.currentProblem = problem;
        state.targetResult = problem.answer;

        starRating.startTimer();

        let timeLeft = 10;
        const bar = document.getElementById('timer-fill');
        if (bar) bar.style.width = '100%';

        clearInterval(mathTimer);
        mathTimer = setInterval(() => {
            timeLeft--;
            if (bar) bar.style.width = (timeLeft * 10) + '%';
            if (timeLeft <= 0) {
                clearInterval(mathTimer);
                game.checkAnswer(null, null);
            }
        }, 1000);

        document.getElementById('math-question').innerText = problem.display;
        document.getElementById('q-number').innerText = `Q${state.totalQs}`;
        document.getElementById('streak-display').innerText = `🔥 ${state.streak}`;

        const area = document.getElementById('answer-choices');
        area.innerHTML = '';

        let choices = [problem.answer];
        while (choices.length < 4) {
            let fake = problem.answer + (Math.floor(Math.random() * 10) + 1) * (Math.random() > 0.5 ? 1 : -1);
            if (fake >= 0 && !choices.includes(fake)) choices.push(fake);
        }

        choices = utils.shuffleArray(choices);

        choices.forEach(val => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.innerText = val;
            btn.onclick = () => {
                clearInterval(mathTimer);
                game.checkAnswer(val, btn);
            };
            area.appendChild(btn);
        });

        document.getElementById('math-modal').style.display = 'flex';
        document.getElementById('feedback-area').innerHTML = '';
        document.getElementById('feedback-area').className = 'feedback-area';
        powerupSystem.renderBar();
    },

    checkAnswer: async (userVal, btnElement) => {
        const feedbackArea = document.getElementById('feedback-area');
        const allBtns = document.querySelectorAll('.choice-btn');

        allBtns.forEach(btn => btn.disabled = true);

        const isCorrect = userVal === state.targetResult;
        const stars = starRating.calculate(isCorrect);

        if (isCorrect) {
            const bonus = state.streak >= 3 ? Math.floor(state.streak / 3) * 5 : 0;
            state.playerPoints += 10 + bonus;
            state.streak++;
            state.correctCount++;
            if (state.streak > state.maxStreak) state.maxStreak = state.streak;

            if (btnElement) btnElement.classList.add('correct');

            starRating.display(stars);
            const starBonus = stars * 5;
            state.playerPoints += starBonus;

            const bananasEarned = 5 + stars * 3 + (bonus > 0 ? 5 : 0);
            bananas.earn(bananasEarned, 'Correct answer!');

            feedbackArea.innerHTML = `✅ Correct! +${10 + bonus + starBonus} pts ${stars > 0 ? '⭐'.repeat(stars) : ''}`;
            feedbackArea.classList.add('correct');
            audio.play('correct');
            game.createConfetti();

            powerupSystem.clearQuestionEffects();
            snake.grow();
        } else {
            state.streak = 0;
            state.wrongCount++;

            if (btnElement) btnElement.classList.add('wrong');
            allBtns.forEach(btn => {
                if (parseInt(btn.innerText) === state.targetResult) btn.classList.add('correct');
            });

            feedbackArea.classList.add('wrong');
            audio.play('wrong');
            playFahhh();

            if (powerupSystem.activeEffects.shield) {
                feedbackArea.innerHTML = '🛡️ Wrong! Shield saved your snake!';
                ui.showToast('🛡️ Shield blocked the shrink!', 'success');
            } else {
                feedbackArea.innerHTML = '❌ Wrong! Moving back...';
                snake.shrink();
            }

            powerupSystem.clearQuestionEffects();

            await new Promise(r => setTimeout(r, 1500));

            // walk back: each step removes the newest head position (shift = retreat)
            const targetPos = state.startCell;
            while (state.playerPos > targetPos) {
                state.playerPos--;
                snake.pathHistory.shift();
                await new Promise(r => setTimeout(r, 200));
            }

            document.querySelectorAll('.level-tile').forEach((tile, idx) => {
                tile.classList.toggle('current', idx === state.playerPos);
            });
            zoneSystem.check(state.playerPos);
            const vp = document.getElementById('viewport');
            const ep = levelPoints[state.playerPos];
            if (vp && ep) vp.scrollTo({ top: ep.y - vp.clientHeight / 2, behavior: 'smooth' });
        }

        state.gameHistory.push({
            question: state.totalQs,
            correct: isCorrect,
            points: isCorrect ? 10 : 0
        });

        game.updateUI();

        setTimeout(() => {
            document.getElementById('math-modal').style.display = 'none';
            allBtns.forEach(btn => {
                btn.classList.remove('correct', 'wrong');
                btn.disabled = false;
            });

            if (state.playerPos >= CONSTANTS.TOTAL_LEVELS - 1) {
                game.handleWin();
            } else if (state.totalQs >= CONSTANTS.QUESTIONS_PER_GAME) {
                game.endGame();
            }
        }, isCorrect ? 1000 : 2000);
    },

    createConfetti: () => {
        const colors = ['#00f2ff', '#ff00ff', '#4caf50', '#ffeb3b', '#ff5252'];
        for (let i = 0; i < 20; i++) {
            const confetti = document.createElement('div');
            confetti.style.cssText = `
                position: fixed;
                width: 10px;
                height: 10px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                left: 50%;
                top: 50%;
                border-radius: 50%;
                pointer-events: none;
                z-index: 9999;
            `;
            document.body.appendChild(confetti);

            const angle = (Math.PI * 2 * i) / 20;
            const velocity = 100 + Math.random() * 100;

            confetti.animate([
                { transform: 'translate(0,0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle) * velocity}px, ${Math.sin(angle) * velocity}px) scale(0)`, opacity: 0 }
            ], {
                duration: 800,
                easing: 'cubic-bezier(0, .9, .57, 1)'
            }).onfinish = () => confetti.remove();
        }
    },

    updateUI: () => {
        document.getElementById('current-score').innerText = state.playerPoints;
        document.getElementById('q-progress').innerText = `${state.totalQs} / ${CONSTANTS.QUESTIONS_PER_GAME}`;
    },

    handleWin: () => {
        audio.play('win');
        playWinSound();

        game.saveGameData();

        document.getElementById('win-score').innerText = state.playerPoints;
        document.getElementById('win-correct').innerText = state.correctCount;
        const accuracy = state.totalQs > 0 ? Math.round((state.correctCount / state.totalQs) * 100) : 0;
        document.getElementById('win-accuracy').innerText = accuracy + '%';

        document.getElementById('win-modal').style.display = 'flex';

        achievements.checkAndUnlock();
    },

    endGame: () => {
        game.saveGameData();

        const modal = document.getElementById('math-modal');
        const box = modal.querySelector('.math-box');
        const accuracy = state.totalQs > 0 ? Math.round((state.correctCount / state.totalQs) * 100) : 0;

        box.innerHTML = `
            <h2 class="math-title">GAME OVER! 🎉</h2>
            <div style="font-size: 4rem; margin: 20px 0;">🏆</div>
            <p style="font-size: 1.5rem; margin-bottom: 10px;">Final Score</p>
            <p style="font-size: 3.5rem; color: var(--neon-cyan); font-family: 'Luckiest Guy', cursive; margin-bottom: 20px;">
                ${state.playerPoints}
            </p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px;">
                    <div style="color: var(--success); font-size: 1.5rem; font-weight: bold;">${state.correctCount}</div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7);">Correct</div>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px;">
                    <div style="color: var(--error); font-size: 1.5rem; font-weight: bold;">${state.wrongCount}</div>
                    <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7);">Wrong</div>
                </div>
            </div>
            <button class="choice-btn" onclick="game.closeGameOver()" style="width: 100%; font-size: 1.2rem;">Continue</button>
        `;

        modal.style.display = 'flex';
        achievements.checkAndUnlock();
    },

    closeGameOver: () => {
        document.getElementById('math-modal').style.display = 'none';
        document.getElementById('win-modal').style.display = 'none';

        snake.stopAnimation();

        const box = document.querySelector('#math-modal .math-box');
        box.innerHTML = `
            <div class="timer-container"><div id="timer-fill"></div></div>
            <div class="question-header">
                <span class="question-number" id="q-number">Q1</span>
                <span class="streak-counter" id="streak-display">🔥 0</span>
            </div>
            <div class="star-rating-display" id="star-rating">
                <span class="star-slot" id="star-1">☆</span>
                <span class="star-slot" id="star-2">☆</span>
                <span class="star-slot" id="star-3">☆</span>
            </div>
            <h2 class="math-title">SOLVE THIS! 🧮</h2>
            <p id="math-question" class="question-text"></p>
            <div id="answer-choices" class="choices-grid"></div>
            <div class="feedback-area" id="feedback-area"></div>
            <div class="pu-bar">
                <span class="pu-bar-label">⚡ Power-Ups</span>
                <div class="pu-bar-slots" id="pu-bar-slots"></div>
            </div>
        `;

        ui.switchPage('dashboard');
    },

    saveGameData: async () => {
        const dur = Math.floor((Date.now() - timestampStart) / 1000);
        const gameData = {
            score: state.playerPoints,
            correct: state.correctCount,
            wrong: state.wrongCount,
            difficulty: state.difficulty,
            duration: dur,
            reachedEnd: state.playerPos >= CONSTANTS.TOTAL_LEVELS - 1,
            maxStreak: state.maxStreak,
            stars: starRating.levelStars || 0,
            segments: snake.segments || 3
        };
        try {
            localDB.saveGame(gameData);
            const newAchievements = achievements.checkAndUnlock();
            if (newAchievements.length > 0) localDB.updateAchievements(newAchievements);
            ui.updateQuickStats();
        } catch (error) {
            console.error('Failed to save game:', error);
        }
    },

    loadStats: async () => {
        try {
            const result = localDB.getStats();
            if (result.success) return result.stats;
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
        return null;
    },

    start: () => {
        state.playerPos = 0;
        state.totalQs = 0;
        state.playerPoints = 0;
        state.streak = 0;
        state.maxStreak = 0;
        state.correctCount = 0;
        state.wrongCount = 0;
        state.gameHistory = [];
        state.isMoving = false;
        state.isRolling = false;

        timestampStart = Date.now();
        zoneSystem.lastZone = -1;
        starRating.levelStars = 0;

        document.getElementById('display-user').innerText = state.sessionUser.toUpperCase();
        document.getElementById('mode-label').innerText = state.difficulty.toUpperCase();
        document.getElementById('game-bananas').innerText = shopState.bananas;
        document.getElementById('game-stars').innerText = shopState.totalStars;

        game.updateUI();
        ui.switchPage('game-screen');

        setTimeout(() => {
            snake.stopAnimation();
            game.initMap();
            snake.init();
            const vp = document.getElementById('viewport');
            const start = levelPoints[0];
            if (vp && start) vp.scrollTop = Math.max(0, start.y - vp.clientHeight / 2);
            snake.startAnimation();
            powerupSystem.reset();
            ui.showToast('Game started! Roll the dice to begin.', 'success');
        }, 80);
    }
};

const achievements = {
    load: async () => {
        try {
            const result = localDB.getAchievements();
            if (!result.success) return;
            const userAchievements = result.achievements || [];
            const grid = document.getElementById('achievement-grid');
            grid.innerHTML = '';
            const stats = await game.loadStats();
            if (!stats) return;

            ACHIEVEMENTS.forEach(achievement => {
                const progress = achievements.getProgress(achievement, stats);
                const isUnlocked = userAchievements.includes(achievement.id) || progress.percentage >= 100;

                const card = document.createElement('div');
                card.className = `achievement-card ${isUnlocked ? 'unlocked' : ''}`;
                card.innerHTML = `
                    <div class="badge-icon">${achievement.icon}</div>
                    <h3>${achievement.title}</h3>
                    <p>${achievement.description}</p>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${progress.percentage}%;"></div>
                    </div>
                    <div class="progress-text">${progress.current} / ${achievement.target}</div>
                `;
                grid.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load achievements:', error);
        }
    },

    getProgress: (achievement, stats) => {
        let current = 0;

        switch(achievement.type) {
            case 'games':
                current = parseInt(stats.games) || 0;
                break;
            case 'correct':
                current = parseInt(stats.correct_answers) || 0;
                break;
            case 'high':
                current = parseInt(stats.high_score) || 0;
                break;
            case 'streak':
                current = parseInt(stats.max_streak) || 0;
                break;
            case 'wins':
                current = parseInt(stats.games_won) || 0;
                break;
        }

        return {
            current: Math.min(current, achievement.target),
            percentage: Math.min((current / achievement.target) * 100, 100)
        };
    },

    checkAndUnlock: () => {
        const newUnlocks = [];
        const stats = {
            games: state.gameHistory.length,
            correct: state.correctCount,
            high: state.playerPoints,
            maxStreak: state.maxStreak,
            gamesWon: state.playerPos >= CONSTANTS.TOTAL_LEVELS - 1 ? 1 : 0
        };

        ACHIEVEMENTS.forEach(achievement => {
            if (!state.achievementsUnlocked.includes(achievement.id)) {
                if (achievement.condition(stats)) {
                    state.achievementsUnlocked.push(achievement.id);
                    newUnlocks.push(achievement.id);
                    audio.play('unlock');
                    ui.showToast(`Achievement Unlocked: ${achievement.title} ${achievement.icon}`, 'success');
                }
            }
        });

        return newUnlocks;
    }
};

const stats = {
    historyOffset: 0,
    historyLimit: 10,
    perfChart: null,
    allHistory: [],

    load: async () => {
        const statsData = await game.loadStats();
        if (!statsData) return;

        const total = parseInt(statsData.correct_answers || 0) + parseInt(statsData.wrong_answers || 0);
        const accuracy = total > 0 ? Math.round((statsData.correct_answers / total) * 100) : 0;

        document.getElementById('stat-total-games').innerText = statsData.games || 0;
        document.getElementById('stat-high-score').innerText = statsData.high_score || 0;
        document.getElementById('stat-total-correct').innerText = statsData.correct_answers || 0;
        document.getElementById('stat-total-wrong').innerText = statsData.wrong_answers || 0;
        document.getElementById('stat-accuracy').innerText = accuracy + '%';
        document.getElementById('stat-total-time').innerText = utils.formatTime(statsData.total_time || 0);
        if (document.getElementById('stat-max-streak')) {
            document.getElementById('stat-max-streak').innerText = statsData.max_streak || 0;
        }

        stats.historyOffset = 0;
        stats.allHistory = [];
        await stats.loadHistory(true);
        setTimeout(() => stats.renderChart(statsData), 100);
    },

    getTopicLabel: (difficulty) => {
        const map = {
            'easy': 'Addition',
            'medium': 'Multi-part Word Problems',
            'hard': 'Addition – Hard'
        };
        return map[(difficulty || '').toLowerCase()] || (difficulty || 'Unknown');
    },

    getAchievementForGame: (row) => {
        const correct = parseInt(row.correct || 0);
        const wrong = parseInt(row.wrong || 0);
        const total = correct + wrong;
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
        const duration = parseInt(row.duration || 0);

        if (accuracy === 100 && parseInt(row.score) >= 500) return { icon: '🥇', label: 'Perfect Score' };
        if (accuracy === 100) return { icon: '🏅', label: 'Perfect Solver' };
        if (duration < 150 && total > 0) return { icon: '🟢', label: 'Fast Solver' };
        if (parseInt(row.reached_end)) return { icon: '🥈', label: 'Jungle Conqueror' };
        return null;
    },

    loadHistory: async (reset = false) => {
        try {
            const result = localDB.getHistory(50);
            if (!result.success) return;
            stats.allHistory = result.history || [];
            stats.historyOffset = 0;
            stats.renderHistoryRows(stats.historyOffset, stats.historyLimit);
        } catch (e) {
            const tbody = document.getElementById('history-tbody');
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="history-empty">Could not load history.</td></tr>';
        }
    },

    renderHistoryRows: (from, count) => {
        const tbody = document.getElementById('history-tbody');
        if (!tbody) return;
        if (from === 0) tbody.innerHTML = '';

        const slice = stats.allHistory.slice(from, from + count);
        if (slice.length === 0 && from === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="history-empty">No games played yet!</td></tr>';
            return;
        }

        slice.forEach(row => {
            const date = new Date(row.played_at);
            const dateStr = date.getFullYear() + '-' +
                String(date.getMonth()+1).padStart(2,'0') + '-' +
                String(date.getDate()).padStart(2,'0') + ' | ' +
                String(date.getHours()).padStart(2,'0') + ':' +
                String(date.getMinutes()).padStart(2,'0');

            const correct = parseInt(row.correct || 0);
            const wrong = parseInt(row.wrong || 0);
            const total = correct + wrong;
            const accuracy = total > 0 ? Math.round((correct / total) * 100) + '%' : '0%';
            const duration = parseInt(row.duration || 0);
            const mins = Math.floor(duration / 60);
            const secs = duration % 60;
            const timeStr = mins + 'm ' + secs + 's';
            const topic = stats.getTopicLabel(row.difficulty);
            const ach = stats.getAchievementForGame(row);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${dateStr}</td>
                <td><strong>${row.score}</strong></td>
                <td>${topic}</td>
                <td>${correct}/${wrong}</td>
                <td>${accuracy}</td>
                <td>${timeStr}</td>
                <td>${ach ? `<span class="history-achievement-badge">${ach.icon} ${ach.label}</span>` : '<span style="color:rgba(255,255,255,0.3)">—</span>'}</td>
            `;
            tbody.appendChild(tr);
        });

        stats.historyOffset = from + slice.length;
        const btn = document.getElementById('more-history-btn');
        if (btn) btn.style.display = stats.historyOffset >= stats.allHistory.length ? 'none' : 'inline-block';
    },

    loadMoreHistory: () => {
        stats.renderHistoryRows(stats.historyOffset, stats.historyLimit);
    },

    waitForChart: () => {
        return new Promise((resolve) => {
            if (typeof Chart !== 'undefined') { resolve(); return; }
            let tries = 0;
            const interval = setInterval(() => {
                tries++;
                if (typeof Chart !== 'undefined') { clearInterval(interval); resolve(); }
                else if (tries > 50) { clearInterval(interval); resolve(); }
            }, 100);
        });
    },

    renderChart: async (statsData) => {
        const canvas = document.getElementById('perf-chart');
        if (!canvas) return;

        await stats.waitForChart();

        if (typeof Chart === 'undefined') {
            canvas.parentElement.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:40px;font-style:italic;">Chart unavailable — Chart.js failed to load.</p>';
            return;
        }

        if (stats.perfChart) {
            stats.perfChart.destroy();
            stats.perfChart = null;
        }

        // Use passed statsData or fall back to history-derived values
        const sd = statsData || {};
        const games      = parseInt(sd.games || 0);
        const gamesWon   = parseInt(sd.games_won || 0);
        const correct    = parseInt(sd.correct_answers || 0);
        const wrong      = parseInt(sd.wrong_answers || 0);
        const total      = correct + wrong;
        const accuracy   = total > 0 ? Math.round(correct / total * 100) : 0;
        const highScore  = parseInt(sd.high_score || 0);
        const maxStreak  = parseInt(sd.max_streak || 0);
        const stars      = parseInt(sd.total_stars || 0);
        const winRate    = games > 0 ? Math.round(gamesWon / games * 100) : 0;

        if (games === 0) {
            canvas.parentElement.innerHTML = '<p style="color:rgba(255,255,255,0.35);text-align:center;padding:40px;font-style:italic;">Play some games to see your stats!</p>';
            return;
        }

        // Normalize each stat to 0-100 scale for radar
        const norm = (val, max) => Math.min(100, Math.round((val / max) * 100));

        const radarValues = [
            accuracy,                   // Accuracy (already 0-100)
            winRate,                    // Win Rate (already 0-100)
            norm(maxStreak, 20),        // Streak (max 20)
            norm(highScore, 500),       // Score (max 500)
            norm(stars, 200),           // Stars (max 200)
            norm(games, 50),            // Games (max 50)
        ];

        const ctx = canvas.getContext('2d');
        stats.perfChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Accuracy', 'Win Rate', 'Streak', 'Score', 'Stars', 'Games'],
                datasets: [{
                    label: 'Your Stats',
                    data: radarValues,
                    backgroundColor: 'rgba(0, 212, 170, 0.2)',
                    borderColor: '#00d4aa',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#00f2ff',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(10,20,40,0.95)',
                        borderColor: 'rgba(0,212,170,0.4)',
                        borderWidth: 1,
                        titleColor: '#00f2ff',
                        bodyColor: 'rgba(255,255,255,0.85)',
                        padding: 10,
                        callbacks: {
                            label: (ctx) => {
                                const labels = ['Accuracy', 'Win Rate', 'Streak', 'Score', 'Stars', 'Games'];
                                const realVals = [accuracy + '%', winRate + '%', maxStreak, highScore, stars, games];
                                return ` ${labels[ctx.dataIndex]}: ${realVals[ctx.dataIndex]}`;
                            }
                        }
                    }
                },
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        beginAtZero: true,
                        grid: { color: 'rgba(0,212,170,0.15)' },
                        angleLines: { color: 'rgba(0,212,170,0.2)' },
                        pointLabels: {
                            color: 'rgba(255,255,255,0.8)',
                            font: { size: 11, weight: '600' }
                        },
                        ticks: {
                            display: false,
                            stepSize: 25
                        }
                    }
                }
            }
        });
    },

    reset: async () => {
        if (!confirm("Are you sure you want to reset all your progress? This cannot be undone.")) return;
        try {
            const result = localDB.resetStats();
            if (result.success) {
                stats.load();
                achievements.load();
                ui.updateQuickStats();
                ui.showToast('Progress reset successfully', 'success');
            }
        } catch (error) {
            ui.showToast('Reset failed', 'error');
        }
    }
};

const leaderboard = {
    load: async (filter = 'all') => {
        try {
            const result = localDB.getLeaderboard(filter);
            if (!result.success) return;
            const lb = document.getElementById('leaderboard-list');
            lb.innerHTML = '';
            const header = document.createElement('div');
            header.className = 'row header';
            ['Rank', 'Username', 'Games', 'High Score', 'Correct', 'Accuracy'].forEach(t => {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.innerText = t;
                header.appendChild(cell);
            });
            lb.appendChild(header);

            result.leaderboard.forEach((u, i) => {
                const row = document.createElement('div');
                row.className = `row ${u.username === state.sessionUser ? 'current-user' : ''}`;

                const rankClass = i < 3 ? `rank-${i + 1}` : '';
                const data = [u.rank, u.username.toUpperCase(), u.games, u.high_score, u.correct, u.accuracy];

                data.forEach((text, idx) => {
                    const cell = document.createElement('div');
                    cell.className = 'cell';
                    if (idx === 0) cell.className += ' ' + rankClass;
                    cell.innerText = text;
                    row.appendChild(cell);
                });

                lb.appendChild(row);
            });
        } catch (error) {
            console.error('Failed to load leaderboard:', error);
        }
    }
};

const handlers = {
    setup: () => {
        document.getElementById('login-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('.btn');
            btn.classList.add('loading');
            btn.disabled = true;

            const u = document.getElementById('login-user').value.trim();
            const p = document.getElementById('login-pass').value.trim();
            const remember = document.getElementById('remember-me').checked;

            const result = await auth.login(u, p, remember);

            if (result.success) {
                document.getElementById('auth-screen').style.display = 'none';
                document.getElementById('main-app-container').style.display = 'block';
                document.getElementById('player-name-header').innerText = state.sessionUser.toUpperCase();
                const pEl = document.getElementById('profile-username-display');
                if (pEl) pEl.innerText = state.sessionUser.toUpperCase();
                loadSavedAvatar();
                shopState.loadForUser(state.sessionUser);
                applyTheme(shopState.equippedTheme || 'default');
                bananas.updateDisplays();
                ui.updateQuickStats();
                ui.switchPage('dashboard');
                ui.showToast(`Welcome back, ${state.sessionUser}!`, 'success');
                bananas.loadFromDB();
            } else {
                document.getElementById('auth-msg').innerText = result.message;
            }

            btn.classList.remove('loading');
            btn.disabled = false;
        });

        document.getElementById('register-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('.btn');
            btn.classList.add('loading');
            btn.disabled = true;

            const u = document.getElementById('reg-user').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const p = document.getElementById('reg-pass').value.trim();

            const result = await auth.register(u, email, p);

            if (result.success) {
                document.getElementById('reg-msg').style.color = '#4caf50';
                document.getElementById('reg-msg').innerText = 'Account created! Please login.';
                setTimeout(() => {
                    document.getElementById('register-box').classList.remove('active');
                    document.getElementById('login-box').classList.add('active');
                    document.getElementById('reg-msg').innerText = '';
                }, 1500);
            } else {
                document.getElementById('reg-msg').innerText = result.message;
            }

            btn.classList.remove('loading');
            btn.disabled = false;
        });

        document.querySelector('.register-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('login-box').classList.remove('active');
            document.getElementById('register-box').classList.add('active');
        });

        document.querySelector('.login-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('register-box').classList.remove('active');
            document.getElementById('login-box').classList.add('active');
        });

        const hamburgerBtn = document.getElementById('hamburger-btn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        hamburgerBtn?.addEventListener('click', () => {
            hamburgerBtn.classList.toggle('active');
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });

        overlay?.addEventListener('click', () => {
            hamburgerBtn.classList.remove('active');
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });

        document.querySelectorAll('#nav-list li').forEach(li => {
            li.addEventListener('click', () => {
                const page = li.dataset.page;
                if (page === 'logout') {
                    auth.logout();
                    return;
                }

                if (page === 'settings') {
                    const currentPass = document.getElementById('current-password');
                    const newPass = document.getElementById('settings-new-password');
                    if (currentPass) currentPass.value = '';
                    if (newPass) newPass.value = '';
                }

                ui.switchPage(page);

                switch(page) {
                    case 'stats':
                        stats.load();
                        break;
                    case 'achievements':
                        achievements.load();
                        break;
                    case 'leaderboards':
                        leaderboard.load();
                        break;
                    case 'creators':
                        loadCreators();
                        break;
                    case 'shop':
                        shop.render('skins');
                        shop.updateUI();
                        break;
                }

                hamburgerBtn.classList.remove('active');
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            });
        });

        document.addEventListener('click', () => audio.init(), { once: true });
    }
};

function navigateTo(page) {
    ui.switchPage(page);

    switch(page) {
        case 'stats':
            stats.load();
            break;
        case 'achievements':
            achievements.load();
            break;
        case 'leaderboards':
            leaderboard.load();
            break;
        case 'creators':
            loadCreators();
            break;
        case 'shop':
            shop.render('skins');
            shop.updateUI();
            break;
    }
}

function loadCreators() {
    const grid = document.getElementById('creators-grid');
    if (!grid || grid.children.length > 0) return;

    const creators = [
        { name: 'Abrahim Saligumba', role: 'UI Designer',                               photo: null },
        { name: 'Francois Turla',    role: 'Background Sound',                           photo: null },
        { name: 'Balabis',           role: 'UI Designer',       photo: 'creators_pics/balabis.jpg' },
        { name: 'Johnpatrick Espinola', role: 'Lead Developer, Database Admin, Game Logic', photo: null },
        { name: 'Justine P. Casiping',  role: 'Background Sound',                        photo: null },
        { name: 'Katricia Mae Pasaylo', role: 'UI Designer, Sub Developer',              photo: null },
        { name: 'Lean Ramirez',      role: 'UI Designer',                                photo: 'creators_pics/LEAN.jpg' },
        { name: 'Nick Chester Albis Lanzo', role: 'UI Designer',                         photo: null },
        { name: 'Paulraizen Caacbay', role: 'UI Designer',                               photo: null },
        { name: 'Rudy Bohol Basa',   role: 'UI Designer',                               photo: null },
    ];

    const anonymousIcon = `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <rect width="100" height="100" fill="#1a1a2e" rx="50"/>
            <circle cx="50" cy="40" r="18" fill="#00d4ff" opacity="0.8"/>
            <path d="M20 85 Q50 60 80 85" stroke="#00d4ff" stroke-width="3" fill="none" opacity="0.8"/>
            <circle cx="50" cy="50" r="45" stroke="#00d4ff" stroke-width="2" fill="none"/>
        </svg>
    `)}`;

    creators.forEach((creator, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.animationDelay = (index * 0.1) + 's';

        const imgSrc = creator.photo || anonymousIcon;
        const imgEl = creator.photo
            ? `<img src="${creator.photo}" class="profile-img" alt="${creator.name}" onerror="this.src='${anonymousIcon}'">`
            : `<img src="${anonymousIcon}" class="profile-img" alt="Anonymous">`;

        card.innerHTML = `
            <div class="pfp-ring">
                ${imgEl}
            </div>
            <p class="creator-name">${creator.name}</p>
            <p style="color: var(--neon-cyan); font-size: 0.85rem; margin-top: 5px;">${creator.role}</p>
        `;
        grid.appendChild(card);
    });
}

function showForgot() {
    document.getElementById('forgot-modal').style.display = 'flex';
    document.getElementById('forgot-email').value = '';
    document.getElementById('forgot-msg').innerText = '';
    document.getElementById('forgot-msg').className = 'auth-message';
}

function closeForgotModal() {
    document.getElementById('forgot-modal').style.display = 'none';
}

function submitForgotPassword() {
    const email = document.getElementById('forgot-email').value.trim();
    const msg = document.getElementById('forgot-msg');

    if (!email) {
        msg.innerText = 'Please enter your email';
        msg.className = 'auth-message error';
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        msg.innerText = 'Please enter a valid email address';
        msg.className = 'auth-message error';
        return;
    }

    const result = localDB.forgotPassword(email);

    if (result.success && result.tmp_password) {
        msg.innerHTML = `
            <div style="background: rgba(76, 175, 80, 0.2); border: 1px solid #4caf50; border-radius: 8px; padding: 15px; margin-top: 10px;">
                <p style="color: #4caf50; margin-bottom: 10px; font-weight: bold;">✅ Temporary password generated!</p>
                <p style="color: rgba(255,255,255,0.8); font-size: 0.85rem; margin-bottom: 10px;">
                    Your account: <strong style="color:#00f2ff">${result.username}</strong>
                </p>
                <p style="color: rgba(255,255,255,0.8); font-size: 0.85rem; margin-bottom: 6px;">Temporary password:</p>
                <div style="color: #00f2ff; font-size: 1.1rem; font-weight: bold; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; border: 1px solid rgba(0,242,255,0.3); letter-spacing: 2px;">
                    ${result.tmp_password}
                </div>
                <p style="color: rgba(255,255,255,0.6); font-size: 0.75rem; margin-top: 10px;">
                    ⚠️ Login with this password then change it in Settings.
                </p>
            </div>
        `;
        msg.className = 'auth-message success';
    } else {
        // Don't reveal if email doesn't exist
        msg.innerHTML = `<div style="background: rgba(76, 175, 80, 0.2); border: 1px solid #4caf50; border-radius: 8px; padding: 15px; margin-top: 10px;"><p style="color: #4caf50;">If this email is registered, a temporary password has been shown.</p></div>`;
        msg.className = 'auth-message success';
    }
}

function openDifficultyMenu() {
    document.getElementById('diff-modal').style.display = 'flex';
}

function updateDifficulty(val) {
    state.difficulty = val;
    document.getElementById('diff-modal').style.display = 'none';
    game.start();
}

function handleDiceRoll() {
    game.rollDice();
}

function backToMenu() {
    snake.stopAnimation();
    ui.switchPage('dashboard');
}

function closeWinModal() {
    game.closeGameOver();
}

function resetUserStats() {
    stats.reset();
}

function changeUsername() {
    const newName = document.getElementById('new-username').value.trim();
    if (!newName) return;
    const result = localDB.changeUsername(newName);
    if (result.success) {
        state.sessionUser = result.username;
        document.getElementById('player-name-header').innerText = result.username.toUpperCase();
        document.getElementById('new-username').value = '';
        ui.showToast('Username updated successfully!', 'success');
    } else {
        ui.showToast(result.message, 'error');
    }
}

function changePassword() {
    const currentPass = document.getElementById('current-password').value.trim();
    const newPass = document.getElementById('settings-new-password').value.trim();
    if (!currentPass) { ui.showToast('Please enter your current password', 'error'); return; }
    if (!newPass) { ui.showToast('Please enter a new password', 'error'); return; }
    if (newPass.length < 6) { ui.showToast('New password must be at least 6 characters', 'error'); return; }
    const result = localDB.changePassword(currentPass, newPass);
    if (result.success) {
        document.getElementById('current-password').value = '';
        document.getElementById('settings-new-password').value = '';
        ui.showToast('Password updated successfully!', 'success');
    } else {
        ui.showToast(result.message, 'error');
    }
}

function deleteAccount() {
    if(!confirm("⚠️ WARNING: This will permanently delete your account and all data. Continue?")) return;
    if(!confirm("Final confirmation: Delete account permanently?")) return;
    const result = localDB.deleteAccount();
    if (result.success) {
        ui.showToast('Account deleted', 'success');
        setTimeout(() => {
            state.sessionUser = null;
            shopState.resetToDefaults();
            applyTheme('default');
            document.getElementById('main-app-container').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'flex';
        }, 1500);
    }
}

function updateVolume(type, value) {
    state.volume[type] = value;
    ui.showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} volume: ${value}%`, 'success');
}

function filterLeaderboard(type) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.filter-btn[onclick*="'${type}'"]`);
    if (activeBtn) activeBtn.classList.add('active');
    leaderboard.load(type);
}

function renderAchievements() {
    const container = document.getElementById('achievements-container');
    if (!container) return;

    const stats = {
        games: state.gameHistory.length,
        correct: state.correctCount,
        high: state.playerPoints,
        maxStreak: state.maxStreak,
        gamesWon: state.playerPos >= CONSTANTS.TOTAL_LEVELS - 1 ? 1 : 0
    };

    container.innerHTML = ACHIEVEMENTS.map(ach => {
        const isUnlocked = ach.condition(stats);
        return `
            <div class="achievement-card ${isUnlocked ? 'unlocked' : ''}" data-id="${ach.id}">
                <div class="achievement-icon">${ach.icon}</div>
                <div class="achievement-info">
                    <h4>${ach.title}</h4>
                    <p>${ach.description}</p>
                </div>
            </div>
        `;
    }).join('');
}

const SNAKE_SKINS = [
    { id:'classic', name:'Classic Green',   icon:'🐍', headColor:'#2e7d32', bodyColor:'#4caf50', accentColor:'#a5d6a7', cost:0,    type:'skin', pattern:'scales'  },
    { id:'golden',  name:'Golden Python',   icon:'✨', headColor:'#e65100', bodyColor:'#ffa000', accentColor:'#fff176', cost:100,  type:'skin', pattern:'shimmer' },
    { id:'rainbow', name:'Rainbow Serpent', icon:'🌈', headColor:'#ff00ff', bodyColor:'#00f2ff', accentColor:'#ffffff', cost:250,  type:'skin', rainbow:true, pattern:'rainbow' },
    { id:'cyber',   name:'Cyber Neon',      icon:'⚡', headColor:'#00e5ff', bodyColor:'#00acc1', accentColor:'#e040fb', cost:500,  type:'skin', pattern:'circuit' },
    { id:'dragon',  name:'Dragon Scale',    icon:'🐉', headColor:'#b71c1c', bodyColor:'#7f0000', accentColor:'#ff6f00', cost:1000, type:'skin', pattern:'dragon'  },
    { id:'ghost',   name:'Ghostly White',   icon:'👻', headColor:'#b0bec5', bodyColor:'#78909c', accentColor:'#e1f5fe', cost:0,    type:'skin', pattern:'ghost',  secret:true },
    { id:'lava',    name:'Lava Serpent',    icon:'🌋', headColor:'#bf360c', bodyColor:'#3e2723', accentColor:'#ff6d00', cost:800,  type:'skin', pattern:'lava'    },
    { id:'ocean',   name:'Ocean Wave',      icon:'🌊', headColor:'#0d47a1', bodyColor:'#1565c0', accentColor:'#80deea', cost:600,  type:'skin', pattern:'ocean'   },
    { id:'candy',   name:'Candy Stripe',    icon:'🍭', headColor:'#e91e63', bodyColor:'#f48fb1', accentColor:'#ffffff', cost:400,  type:'skin', pattern:'candy'   },
    { id:'galaxy',  name:'Galaxy Storm',    icon:'🌌', headColor:'#311b92', bodyColor:'#1a237e', accentColor:'#e040fb', cost:1500, type:'skin', pattern:'galaxy'  },
];

function lighten(hex,amt){try{let c=hex.replace('#','');if(c.length===3)c=c.split('').map(x=>x+x).join('');const n=parseInt(c,16);return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;}catch{return hex;}}
function darken(hex,amt){return lighten(hex,-amt);}

const ACCESSORIES = [
    { id: 'party_hat', name: 'Party Hat', icon: '🎉', cost: 300, type: 'accessory' },
    { id: 'sunglasses', name: 'Sunglasses', icon: '😎', cost: 250, type: 'accessory' },
    { id: 'crown', name: 'Crown', icon: '👑', cost: 1000, type: 'accessory' },
    { id: 'wizard_hat', name: 'Wizard Hat', icon: '🧙', cost: 600, type: 'accessory' },
    { id: 'none', name: 'None', icon: '❌', cost: 0, type: 'accessory' },
];

const POWER_UPS = [
    { id: 'shield', name: 'Shield', icon: '🛡️', desc: "Wrong answer doesn't shrink snake", cost: 100, type: 'powerup' },
    { id: 'timefreeze', name: 'Time Freeze', icon: '⏰', desc: '+5 seconds on question', cost: 150, type: 'powerup' },
    { id: 'hint', name: 'Hint', icon: '🎯', desc: 'Eliminate 2 wrong answers', cost: 80, type: 'powerup' },
    { id: 'luckyroll', name: 'Lucky Roll', icon: '🍀', desc: 'Roll 4-6 only next turn', cost: 200, type: 'powerup' },
    { id: 'mathmaster', name: 'Math Master', icon: '🧠', desc: 'Auto-correct next answer', cost: 500, type: 'powerup' },
];

const THEMES = [
    { id: 'default', name: 'Default Jungle', icon: '🌿', cost: 0, type: 'theme' },
    { id: 'safari', name: 'Sunset Safari', icon: '🌅', cost: 300, type: 'theme' },
    { id: 'midnight', name: 'Midnight Jungle', icon: '🌙', cost: 600, type: 'theme' },
    { id: 'cherry', name: 'Cherry Blossom', icon: '🌸', cost: 800, type: 'theme' },
    { id: 'cyber', name: 'Cyber Grid', icon: '🤖', cost: 1200, type: 'theme' },
];

const shopState = {
    bananas: 0,
    totalStars: 0,
    owned: ['classic','none','default'],
    equippedSkin: 'classic',
    equippedAccessory: 'none',
    equippedTheme: 'default',
    powerups: {},

    loadForUser(username) {
        const u = username.toLowerCase();
        this.bananas       = parseInt(localStorage.getItem(`jm_${u}_bananas`) || '0');
        this.totalStars    = parseInt(localStorage.getItem(`jm_${u}_stars`)   || '0');
        this.owned         = JSON.parse(localStorage.getItem(`jm_${u}_owned`) || '["classic","none","default"]');
        this.equippedSkin  = localStorage.getItem(`jm_${u}_skin`)      || 'classic';
        this.equippedAccessory = localStorage.getItem(`jm_${u}_accessory`) || 'none';
        this.equippedTheme = localStorage.getItem(`jm_${u}_theme`)     || 'default';
        this.powerups      = JSON.parse(localStorage.getItem(`jm_${u}_powerups`) || '{}');
    },

    resetToDefaults() {
        this.bananas = 0; this.totalStars = 0;
        this.owned = ['classic','none','default'];
        this.equippedSkin = 'classic'; this.equippedAccessory = 'none';
        this.equippedTheme = 'default'; this.powerups = {};
    },

    save() {
        const u = (state.sessionUser || 'guest').toLowerCase();
        localStorage.setItem(`jm_${u}_bananas`,   this.bananas);
        localStorage.setItem(`jm_${u}_stars`,     this.totalStars);
        localStorage.setItem(`jm_${u}_owned`,     JSON.stringify(this.owned));
        localStorage.setItem(`jm_${u}_skin`,      this.equippedSkin);
        localStorage.setItem(`jm_${u}_accessory`, this.equippedAccessory);
        localStorage.setItem(`jm_${u}_theme`,     this.equippedTheme);
        localStorage.setItem(`jm_${u}_powerups`,  JSON.stringify(this.powerups));
        shop.updateUI();
    }
};

const snake = {
    segments:3, minSegments:3, maxSegments:20, animFrame:null, pathHistory:[],

    init() {
        this.pathHistory=[];
        const s=levelPoints[0]||{x:240,y:2900};
        for(let i=0;i<this.maxSegments+4;i++) this.pathHistory.push({x:s.x,y:s.y});
        this.updateSizeDisplay();
    },

    grow() {
        if(this.segments<this.maxSegments){this.segments++;this.updateSizeDisplay();this.showEffect('grow');
        if(this.segments>=this.maxSegments)ui.showToast('🏆 MEGA SNAKE! Maximum size!','success');}
    },
    shrink() {
        if (this.segments > this.minSegments) {
            this.segments--;
            this.updateSizeDisplay();
            this.showEffect('shrink');
        }
    },
    updateSizeDisplay() { const el=document.getElementById('snake-size-display');if(el)el.textContent=this.segments; },
    getSkin() { return SNAKE_SKINS.find(s=>s.id===shopState.equippedSkin)||SNAKE_SKINS[0]; },

    drawPattern(ctx,skin,cx,cy,r,i,t) {
        ctx.save();
        const p=skin.pattern;
        if(p==='scales'){
            ctx.globalAlpha=0.28;ctx.strokeStyle=darken(skin.bodyColor,30);ctx.lineWidth=0.8;
            [[-r*.3,-r*.2],[r*.3,-r*.2],[0,r*.15]].forEach(([ox,oy])=>{ctx.beginPath();ctx.moveTo(cx+ox,cy+oy-r*.22);ctx.lineTo(cx+ox+r*.22,cy+oy);ctx.lineTo(cx+ox,cy+oy+r*.22);ctx.lineTo(cx+ox-r*.22,cy+oy);ctx.closePath();ctx.stroke();});
        }else if(p==='shimmer'){
            const a=t+i*1.2;ctx.globalAlpha=0.5+0.4*Math.sin(t*3+i);ctx.fillStyle=skin.accentColor;
            ctx.beginPath();ctx.arc(cx+r*.35*Math.cos(a),cy+r*.35*Math.sin(a),r*.14,0,Math.PI*2);ctx.fill();
            ctx.globalAlpha=0.3+0.3*Math.sin(t*2-i);ctx.beginPath();ctx.arc(cx-r*.3*Math.cos(a+1),cy-r*.3*Math.sin(a+1),r*.1,0,Math.PI*2);ctx.fill();
        }else if(p==='circuit'){
            ctx.globalAlpha=0.55;ctx.strokeStyle=skin.accentColor;ctx.lineWidth=1.2;ctx.shadowColor=skin.accentColor;ctx.shadowBlur=4;
            if(i%2===0){ctx.beginPath();ctx.moveTo(cx-r*.4,cy);ctx.lineTo(cx-r*.1,cy);ctx.lineTo(cx-r*.1,cy-r*.3);ctx.stroke();}
            else{ctx.beginPath();ctx.moveTo(cx+r*.1,cy+r*.3);ctx.lineTo(cx+r*.1,cy);ctx.lineTo(cx+r*.4,cy);ctx.stroke();}
            ctx.shadowBlur=0;ctx.globalAlpha=0.8;ctx.fillStyle=skin.accentColor;ctx.beginPath();ctx.arc(cx+(i%3-1)*r*.25,cy+(i%2===0?-1:1)*r*.2,r*.09,0,Math.PI*2);ctx.fill();
        }else if(p==='dragon'){
            ctx.globalAlpha=0.35;ctx.strokeStyle=skin.accentColor;ctx.lineWidth=1.1;
            ctx.beginPath();ctx.arc(cx-r*.25,cy,r*.38,Math.PI*.8,Math.PI*2.2);ctx.stroke();
            ctx.beginPath();ctx.arc(cx+r*.25,cy,r*.38,Math.PI*.8,Math.PI*2.2);ctx.stroke();
            ctx.globalAlpha=0.55;ctx.fillStyle=skin.accentColor;ctx.beginPath();ctx.moveTo(cx,cy-r*.45);ctx.lineTo(cx-r*.12,cy-r*.2);ctx.lineTo(cx+r*.12,cy-r*.2);ctx.closePath();ctx.fill();
        }else if(p==='lava'){
            ctx.globalAlpha=0.6+0.3*Math.sin(t*4+i);ctx.strokeStyle=skin.accentColor;ctx.lineWidth=1.4;ctx.shadowColor=skin.accentColor;ctx.shadowBlur=8;
            ctx.beginPath();ctx.moveTo(cx-r*.4,cy+r*(i%2===0?.1:-.1));ctx.lineTo(cx,cy-r*.15);ctx.lineTo(cx+r*.4,cy+r*(i%2===0?-.1:.15));ctx.stroke();ctx.shadowBlur=0;
        }else if(p==='ocean'){
            ctx.globalAlpha=0.38;ctx.strokeStyle=skin.accentColor;ctx.lineWidth=1.3;const ph=t*1.5+i*.7;
            ctx.beginPath();for(let dx=-r*.6;dx<=r*.6;dx+=2){const dy=Math.sin((dx/r)*Math.PI*1.5+ph)*r*.2;dx===-r*.6?ctx.moveTo(cx+dx,cy+dy):ctx.lineTo(cx+dx,cy+dy);}ctx.stroke();
        }else if(p==='candy'){
            ctx.globalAlpha=0.35;ctx.fillStyle='#fff';ctx.save();ctx.beginPath();ctx.arc(cx,cy,r*.88,0,Math.PI*2);ctx.clip();
            for(let s=-r*2;s<r*2;s+=r*.55)ctx.fillRect(cx+s,cy-r*1.5,r*.22,r*3);ctx.restore();
        }else if(p==='ghost'){
            ctx.globalAlpha=0.45+0.3*Math.sin(t*2+i*.8);ctx.fillStyle=skin.accentColor;
            ctx.beginPath();ctx.arc(cx+r*.4*Math.cos(t*1.3+i),cy+r*.4*Math.sin(t*1.1+i),r*.18,0,Math.PI*2);ctx.fill();
            ctx.globalAlpha=0.25+0.2*Math.sin(t*1.8-i);ctx.beginPath();ctx.arc(cx-r*.3,cy+r*.25,r*.12,0,Math.PI*2);ctx.fill();
        }else if(p==='galaxy'){
            ctx.globalAlpha=0.6;ctx.fillStyle='#fff';
            [[r*.3,r*.15],[-r*.25,r*.2],[r*.1,-r*.3]].forEach(([ox,oy])=>{ctx.beginPath();ctx.arc(cx+ox,cy+oy,r*.07,0,Math.PI*2);ctx.fill();});
            ctx.globalAlpha=0.4+0.3*Math.sin(t*2+i);ctx.strokeStyle=skin.accentColor;ctx.lineWidth=1.2;ctx.shadowColor=skin.accentColor;ctx.shadowBlur=6;
            ctx.beginPath();ctx.arc(cx,cy,r*.5,t*.4+i,t*.4+i+Math.PI*.8);ctx.stroke();ctx.shadowBlur=0;
        }
        ctx.restore();
    },

    drawOnMap() {
        const canvas=document.getElementById('snake-world-canvas');
        if(!canvas)return;
        const cw = canvas.width  || 480;
        const ch = canvas.height || 3000;
        const ctx=canvas.getContext('2d');
        ctx.clearRect(0,0,cw,ch);
        const history=this.pathHistory;
        if(!history||!history.length)return;
        const skin=this.getSkin(),t=Date.now()/380,R=15;
        const numSegs=Math.min(this.segments,history.length);

        for(let i=numSegs-1;i>=0;i--){
            const pos=history[i];if(!pos)continue;
            const isHead=i===0,isTail=i===numSegs-1;
            const prog=i/Math.max(numSegs-1,1);
            const wave=Math.sin(t-i*.55)*3.5;
            const cx=pos.x,cy=pos.y+wave;
            const r=R*(isHead?1.35:isTail?.52:(1-prog*.44));

            let baseCol,hiCol,darkCol,glowCol;
            if(skin.rainbow){const h=((i*22)+Date.now()/12)%360;baseCol=`hsl(${h},100%,50%)`;hiCol=`hsl(${h},100%,74%)`;darkCol=`hsl(${h},100%,26%)`;glowCol=`hsl(${h},100%,62%)`;}
            else{baseCol=isHead?skin.headColor:skin.bodyColor;hiCol=lighten(baseCol,45);darkCol=darken(baseCol,28);glowCol=skin.accentColor||baseCol;}

            if(i<numSegs-1){
                const nxt=history[i+1],nw=Math.sin(t-(i+1)*.55)*3.5;
                ctx.strokeStyle=baseCol;ctx.shadowColor=glowCol;ctx.shadowBlur=12;ctx.lineWidth=r*1.9;ctx.lineCap='round';
                ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(nxt.x,nxt.y+nw);ctx.stroke();ctx.shadowBlur=0;
            }
            const g=ctx.createRadialGradient(cx-r*.3,cy-r*.3,r*.04,cx,cy,r);
            g.addColorStop(0,hiCol);g.addColorStop(.5,baseCol);g.addColorStop(1,darkCol);
            ctx.fillStyle=g;ctx.shadowColor=glowCol;ctx.shadowBlur=isHead?22:13;
            ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;

            if(!isHead)this.drawPattern(ctx,skin,cx,cy,r,i,t);

            if(!isTail){const bg=ctx.createRadialGradient(cx,cy,0,cx,cy,r*.62);bg.addColorStop(0,'rgba(255,255,255,0.22)');bg.addColorStop(.7,'rgba(255,255,255,0.04)');bg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=bg;ctx.beginPath();ctx.ellipse(cx,cy+r*.1,r*.46,r*.52,0,0,Math.PI*2);ctx.fill();}

            if(isHead){
                const dir=(history.length>1&&Math.abs(history[0].x-history[1].x)>1)?Math.sign(history[0].x-history[1].x):1;
                ctx.fillStyle='rgba(0,0,0,0.45)';const nx=cx+dir*r*.72;
                ctx.beginPath();ctx.arc(nx,cy-r*.26,1.7,0,Math.PI*2);ctx.fill();
                ctx.beginPath();ctx.arc(nx,cy+r*.26,1.7,0,Math.PI*2);ctx.fill();
                const ex=cx+dir*r*.36,ey=cy-r*.2;
                ctx.fillStyle='white';ctx.beginPath();ctx.arc(ex,ey,4.4,0,Math.PI*2);ctx.fill();
                ctx.fillStyle='#080808';ctx.beginPath();ctx.ellipse(ex+dir*.8,ey,1.5,3.0,0,0,Math.PI*2);ctx.fill();
                ctx.fillStyle='rgba(255,255,255,0.95)';ctx.beginPath();ctx.arc(ex+dir*1.6,ey-1.3,1.2,0,Math.PI*2);ctx.fill();
                ctx.strokeStyle='rgba(0,0,0,0.25)';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(ex,ey,4.4,0,Math.PI*2);ctx.stroke();
                ctx.save();ctx.globalAlpha=.2;ctx.strokeStyle='white';ctx.lineWidth=3;ctx.lineCap='round';
                ctx.beginPath();ctx.arc(cx-r*.15,cy-r*.36,r*.52,Math.PI*1.05,Math.PI*1.78);ctx.stroke();ctx.restore();
                if(Math.sin(t*1.9)>.25){
                    const tx0=cx+dir*(r+3);ctx.strokeStyle='#ff1133';ctx.shadowColor='#ff1133';ctx.shadowBlur=5;ctx.lineWidth=2.5;ctx.lineCap='round';
                    ctx.beginPath();ctx.moveTo(tx0,cy);ctx.lineTo(tx0+dir*10,cy-1);ctx.stroke();ctx.shadowBlur=0;ctx.lineWidth=1.8;
                    ctx.beginPath();ctx.moveTo(tx0+dir*10,cy-1);ctx.lineTo(tx0+dir*14,cy-4);ctx.stroke();
                    ctx.beginPath();ctx.moveTo(tx0+dir*10,cy-1);ctx.lineTo(tx0+dir*14,cy+2);ctx.stroke();
                }
                const acc=ACCESSORIES.find(a=>a.id===shopState.equippedAccessory);
                if(acc&&acc.id!=='none'){ctx.font=`${Math.round(r*1.55)}px serif`;ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(acc.icon,cx,cy-r-2);ctx.textBaseline='alphabetic';}
            }
        }
        ctx.shadowBlur=0;
    },

    startAnimation(){const loop=()=>{this.drawOnMap();this.animFrame=requestAnimationFrame(loop);};loop();},
    stopAnimation(){if(this.animFrame){cancelAnimationFrame(this.animFrame);this.animFrame=null;}},

    updateSizeDisplay(){},
    updateSizeDisplay(){},
    showEffect(type){
        const el=document.createElement('div');el.className=type==='grow'?'snake-grow-text':'snake-shrink-text';
        el.textContent=type==='grow'?'🐍 +1 GROW!':'😢 -1 SHRINK';document.body.appendChild(el);setTimeout(()=>el.remove(),1200);
        if(type==='grow'){
            for(let i=0;i<6;i++){const p=document.createElement('div');p.style.cssText='position:fixed;width:8px;height:8px;border-radius:50%;pointer-events:none;z-index:9999;';p.style.left=(Math.random()*window.innerWidth*.6+window.innerWidth*.2)+'px';p.style.top=(window.innerHeight*.5+Math.random()*60-30)+'px';p.style.background=['#ffd700','#00f2ff','#4caf50'][i%3];p.style.boxShadow=`0 0 6px ${p.style.background}`;document.body.appendChild(p);p.animate([{transform:'scale(1)',opacity:1},{transform:`translate(${(Math.random()-.5)*100}px,${-50-Math.random()*80}px) scale(0)`,opacity:0}],{duration:800,easing:'cubic-bezier(0,.9,.57,1)'}).onfinish=()=>p.remove();}
        }
    }
};
const starRating = {
    questionStartTime: 0,
    levelStars: 0,

    startTimer() {
        this.questionStartTime = Date.now();
        ['star-1','star-2','star-3'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.textContent = '☆'; el.classList.remove('earned'); }
        });
    },

    calculate(isCorrect) {
        if (!isCorrect) return 0;
        const elapsed = (Date.now() - this.questionStartTime) / 1000;
        let stars = 0;
        if (elapsed <= 3) stars = 3;
        else if (elapsed <= 7) stars = 2;
        else if (elapsed <= 10) stars = 1;
        return stars;
    },

    display(stars) {
        for (let i = 1; i <= 3; i++) {
            const el = document.getElementById('star-' + i);
            if (!el) continue;
            if (i <= stars) {
                setTimeout(() => {
                    el.textContent = '⭐';
                    el.classList.add('earned');
                }, (i - 1) * 180);
            }
        }
        if (stars === 3) {
            setTimeout(() => this.starBurst(), 400);
        }
        this.levelStars += stars;
        shopState.totalStars += stars;
        shopState.save();
    },

    starBurst() {
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'star-burst-particle';
            p.style.cssText = `position:fixed;left:50%;top:40%;width:8px;height:8px;background:#ffd700;border-radius:50%;pointer-events:none;z-index:9999;box-shadow:0 0 6px #ffd700;`;
            document.body.appendChild(p);
            const angle = (Math.PI * 2 * i) / 20;
            const v = 80 + Math.random() * 80;
            p.animate([
                { transform: 'translate(0,0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(angle)*v}px,${Math.sin(angle)*v}px) scale(0)`, opacity: 0 }
            ], { duration: 700, easing: 'cubic-bezier(0,.9,.57,1)' }).onfinish = () => p.remove();
        }
    }
};

const powerupSystem = {
    pending: null,
    activeEffects: {},

    defs: {
        shield: {
            icon: '🛡️', name: 'Shield',
            desc: 'If you answer wrong this question, your snake won\'t shrink.',
            onActivate() {
                powerupSystem.activeEffects.shield = true;
                powerupSystem.renderBar();
                ui.showToast('🛡️ Shield is active for this question!', 'success');
            }
        },
        timefreeze: {
            icon: '⏰', name: 'Time Freeze',
            desc: 'Stops the timer completely for this question.',
            onActivate() {
                clearInterval(mathTimer);
                const bar = document.getElementById('timer-fill');
                if (bar) { bar.style.width = '100%'; bar.style.background = '#00f2ff'; }
                powerupSystem.activeEffects.timefreeze = true;
                powerupSystem.renderBar();
                ui.showToast('⏰ Timer frozen!', 'success');
            }
        },
        hint: {
            icon: '🎯', name: 'Hint',
            desc: 'Removes 2 wrong answer choices.',
            onActivate() {
                const btns = [...document.querySelectorAll('.choice-btn')];
                const wrong = btns.filter(b => parseInt(b.innerText) !== state.targetResult);
                let removed = 0;
                wrong.forEach(b => {
                    if (removed < 2) { b.style.opacity = '0.25'; b.disabled = true; removed++; }
                });
                powerupSystem.activeEffects.hint = true;
                powerupSystem.renderBar();
                ui.showToast('🎯 2 wrong answers removed!', 'success');
            }
        },
        luckyroll: {
            icon: '🍀', name: 'Lucky Roll',
            desc: 'Your next dice roll is guaranteed to land on 4, 5, or 6.',
            onActivate() {
                powerupSystem.activeEffects.luckyroll = true;
                powerupSystem.updateLuckyRollUI();
                ui.showToast('🍀 Lucky Roll ready! Roll the dice now!', 'success');
            }
        },
        mathmaster: {
            icon: '🧠', name: 'Math Master',
            desc: 'Automatically answers this question correctly.',
            onActivate() {
                const btns = [...document.querySelectorAll('.choice-btn')];
                const correct = btns.find(b => parseInt(b.innerText) === state.targetResult);
                if (correct) { clearInterval(mathTimer); setTimeout(() => correct.click(), 300); }
                ui.showToast('🧠 Math Master answered for you!', 'success');
            }
        }
    },

    renderBar() {
        const slots = document.getElementById('pu-bar-slots');
        if (!slots) return;
        slots.innerHTML = '';

        const questionPowerups = ['shield', 'timefreeze', 'hint', 'mathmaster'];
        const owned = questionPowerups.filter(id => (shopState.powerups[id] || 0) > 0);

        if (owned.length === 0) {
            slots.innerHTML = '<span style="font-size:0.72rem;color:rgba(255,255,255,0.3)">No power-ups — buy some in the Shop!</span>';
            return;
        }

        owned.forEach(id => {
            const def = this.defs[id];
            const qty = shopState.powerups[id] || 0;
            const isActive = !!this.activeEffects[id];

            const btn = document.createElement('button');
            btn.className = 'pu-slot-btn' + (isActive ? ' pu-active' : '');
            btn.disabled = isActive;
            btn.title = def.desc;
            btn.innerHTML = `
                <span class="pu-slot-icon">${def.icon}</span>
                <span class="pu-slot-name">${def.name}</span>
                <span class="pu-slot-qty">×${qty}</span>`;
            btn.onclick = () => this.askConfirm(id);
            slots.appendChild(btn);
        });
    },

    updateLuckyRollUI() {
        const qty   = shopState.powerups['luckyroll'] || 0;
        const btn   = document.getElementById('lucky-roll-btn');
        const badge = document.getElementById('lucky-active-badge');
        const qtyEl = document.getElementById('lr-qty');

        if (qtyEl) qtyEl.textContent = qty;
        if (btn)   btn.disabled = qty === 0 || !!this.activeEffects.luckyroll;
        if (btn)   btn.classList.toggle('lr-glowing', !!this.activeEffects.luckyroll);
        if (badge) badge.style.display = this.activeEffects.luckyroll ? 'block' : 'none';
    },

    askConfirm(id) {
        const def = this.defs[id];
        const qty = shopState.powerups[id] || 0;
        if (!def || qty <= 0) return;

        this.pending = id;
        document.getElementById('puc-icon').textContent = def.icon;
        document.getElementById('puc-name').textContent = def.name;
        document.getElementById('puc-desc').textContent = def.desc;
        document.getElementById('puc-qty').textContent  = qty;
        document.getElementById('powerup-confirm').style.display = 'flex';
    },

    confirmUse() {
        const id  = this.pending;
        const def = this.defs[id];
        if (!id || !def) return;

        document.getElementById('powerup-confirm').style.display = 'none';
        this.pending = null;

        shopState.powerups[id] = Math.max(0, (shopState.powerups[id] || 1) - 1);
        shopState.save();

        def.onActivate();
        this.updateLuckyRollUI();
    },

    cancelUse() {
        document.getElementById('powerup-confirm').style.display = 'none';
        this.pending = null;
    },

    clearQuestionEffects() {
        delete this.activeEffects.shield;
        delete this.activeEffects.timefreeze;
        delete this.activeEffects.hint;
    },

    reset() {
        this.activeEffects = {};
        this.pending = null;
        this.updateLuckyRollUI();
    }
};

const bananas = {

    async loadFromDB() {
        try {
            const data = localDB.getBananas();
            if (data.success) {
                shopState.bananas    = data.bananas;
                shopState.totalStars = data.stars;
                if (data.segments && data.segments >= 3) {
                    snake.segments = data.segments;
                    snake.updateSizeDisplay();
                }
                shopState.save();
                this.updateDisplays();
            }
        } catch(e) {
            console.warn('Banana sync failed:', e);
        }
    },

    earn(amount, reason) {
        shopState.bananas += amount;
        shopState.save();
        this.updateDisplays();
        ui.showToast(`+${amount} 🍌 ${reason}`, 'success');
        localDB.addBananas(amount);
    },

    spend(amount) {
        if (shopState.bananas < amount) return false;
        shopState.bananas -= amount;
        shopState.save();
        this.updateDisplays();
        localDB.spendBananas(amount);
        return true;
    },

    updateDisplays() {
        ['sidebar-coins', 'shop-bananas-display', 'quick-bananas', 'game-bananas'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = shopState.bananas;
        });
        const starsEl = document.getElementById('shop-stars-display');
        if (starsEl) starsEl.textContent = shopState.totalStars;
    }
};

const shop = {
    currentTab: 'skins',

    updateUI() {
        bananas.updateDisplays();
    },

    render(tab) {
        this.currentTab = tab;
        const container = document.getElementById('shop-content');
        if (!container) return;
        container.innerHTML = '';

        let items = [];
        switch(tab) {
            case 'skins': items = SNAKE_SKINS; break;
            case 'accessories': items = ACCESSORIES; break;
            case 'powerups': items = POWER_UPS; break;
            case 'themes': items = THEMES; break;
        }

        items.forEach(item => {
            const isOwned    = shopState.owned.includes(item.id) || item.cost === 0;
            const isEquipped = shopState.equippedSkin === item.id ||
                               shopState.equippedAccessory === item.id ||
                               shopState.equippedTheme === item.id;
            const pwQty = shopState.powerups[item.id] || 0;

            const card = document.createElement('div');
            card.className = `shop-item ${isOwned || item.type === 'powerup' ? 'owned' : ''} ${isEquipped ? 'equipped' : ''}`;

            const iconHTML = `<span class="shop-item-icon">${item.icon}</span>`;

            let priceHTML = item.cost === 0
                ? '<span class="shop-item-price free">FREE</span>'
                : `<span class="shop-item-price">🍌 ${item.cost}</span>`;

            let btnHTML = '';
            if (item.type === 'powerup') {
                btnHTML = `<button class="shop-item-btn buy-btn" onclick="shop.buyPowerup('${item.id}',${item.cost})">Buy (${pwQty} owned) 🍌${item.cost}</button>`;
            } else if (isEquipped) {
                btnHTML = `<button class="shop-item-btn equipped-btn" disabled>★ Equipped</button>`;
            } else if (isOwned || item.cost === 0) {
                btnHTML = `<button class="shop-item-btn equip-btn" onclick="shop.equip('${item.id}','${item.type}')">Equip</button>`;
            } else {
                btnHTML = `<button class="shop-item-btn buy-btn" onclick="shop.buy('${item.id}','${item.type}',${item.cost})">🍌 Buy for ${item.cost}</button>`;
            }

            card.innerHTML = `${iconHTML}
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-desc">${item.desc || ''}</div>
                ${priceHTML}
                ${btnHTML}`;
            container.appendChild(card);
        });
    },

    buy(id, type, cost) {
        if (shopState.owned.includes(id)) { ui.showToast('Already owned!', 'warning'); return; }
        if (!bananas.spend(cost)) { ui.showToast('Not enough bananas! 🍌', 'error'); return; }
        shopState.owned.push(id);
        shopState.save();
        audio.play('unlock');
        ui.showToast(`Purchased! Equip it now.`, 'success');
        this.render(this.currentTab);
    },

    buyPowerup(id, cost) {
        if (!bananas.spend(cost)) { ui.showToast('Not enough bananas! 🍌', 'error'); return; }
        shopState.powerups[id] = (shopState.powerups[id] || 0) + 1;
        shopState.save();
        ui.showToast('Power-up purchased!', 'success');
        this.render(this.currentTab);
    },

    equip(id, type) {
        if (type === 'skin') shopState.equippedSkin = id;
        else if (type === 'accessory') shopState.equippedAccessory = id;
        else if (type === 'theme') {
            shopState.equippedTheme = id;
            applyTheme(id);
        }
        shopState.save();
        audio.play('click');
        ui.showToast('Equipped!', 'success');
        this.render(this.currentTab);
        if (typeof snake !== 'undefined' && snake.drawOnMap) snake.drawOnMap();
    }
};

function applyTheme(id) {
    const TDEFS = {
        default:  {
            img: 'https://mir-s3-cdn-cf.behance.net/project_modules/2800_opt_1/c2415957894895.59e7bbc4b329f.jpg',
            ov:'rgba(0,0,0,0)',       cy:'#00f2ff', pk:'#ff00ff',
            wf:'none', bgf:'none',    ui:'rgba(0,242,255,0.12)'
        },
        safari:   {
            img: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=1920&q=80',
            ov:'rgba(60,25,0,0.38)',  cy:'#ffaa00', pk:'#ff6622',
            wf:'sepia(0.4) saturate(1.5) hue-rotate(-18deg) brightness(0.9)',
            bgf:'sepia(0.4) hue-rotate(-20deg) saturate(0.85) brightness(0.8)',
            ui:'rgba(255,160,0,0.14)'
        },
        midnight: {
            img: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80',
            ov:'rgba(0,0,20,0.72)',   cy:'#9b40ff', pk:'#00cfff',
            wf:'brightness(0.35) saturate(0.45) hue-rotate(220deg)',
            bgf:'brightness(0.22) hue-rotate(220deg) saturate(0.5)',
            ui:'rgba(155,64,255,0.16)'
        },
        cherry:   {
            img: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=1920&q=80',
            ov:'rgba(120,15,70,0.3)', cy:'#ff4081', pk:'#ff80ab',
            wf:'saturate(1.5) hue-rotate(295deg) brightness(1.05)',
            bgf:'hue-rotate(285deg) saturate(1.9) brightness(1.05)',
            ui:'rgba(255,64,129,0.16)'
        },
        cyber:    {
            img: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80',
            ov:'rgba(0,5,0,0.72)',    cy:'#00ff41', pk:'#ff00ff',
            wf:'saturate(0.1) brightness(0.38) hue-rotate(100deg)',
            bgf:'saturate(0) brightness(0.25) hue-rotate(110deg)',
            ui:'rgba(0,255,65,0.13)'
        },
    };
    const t = TDEFS[id] || TDEFS.default;
    const root = document.documentElement;

    const b = document.body;
    b.style.backgroundImage      = `url('${t.img}')`;
    b.style.backgroundSize       = 'cover';
    b.style.backgroundPosition   = 'center center';
    b.style.backgroundRepeat     = 'no-repeat';
    b.style.backgroundAttachment = 'fixed';

    b.classList.remove('theme-default','theme-safari','theme-midnight','theme-cherry','theme-cyber');
    b.classList.add('theme-' + id);

    root.style.setProperty('--neon-cyan', t.cy);
    root.style.setProperty('--neon-pink', t.pk);
    root.style.setProperty('--glass-bg',  t.ui);

    const PANEL_VARS = {
        default:  { bg:'rgba(10,30,55,0.88)',   inner:'rgba(0,242,255,0.06)',   border:'rgba(0,242,255,0.18)',   text:'rgba(255,255,255,0.9)',    dim:'rgba(180,240,255,0.6)',  accent:'#00f2ff' },
        safari:   { bg:'rgba(40,15,0,0.88)',     inner:'rgba(255,160,0,0.08)',   border:'rgba(255,140,0,0.28)',   text:'rgba(255,230,170,0.95)',   dim:'rgba(255,190,80,0.65)', accent:'#ffaa00' },
        midnight: { bg:'rgba(15,0,40,0.92)',     inner:'rgba(155,64,255,0.08)', border:'rgba(155,64,255,0.28)',  text:'rgba(230,200,255,0.95)',   dim:'rgba(190,140,255,0.65)',accent:'#ce93d8' },
        cherry:   { bg:'rgba(60,0,30,0.9)',      inner:'rgba(255,64,129,0.08)', border:'rgba(255,64,129,0.28)',  text:'rgba(255,220,235,0.95)',   dim:'rgba(255,150,180,0.65)',accent:'#ff4081' },
        cyber:    { bg:'rgba(0,12,4,0.94)',      inner:'rgba(0,255,65,0.06)',   border:'rgba(0,255,65,0.22)',    text:'rgba(180,255,190,0.95)',   dim:'rgba(100,255,130,0.6)', accent:'#00ff41' },
    };
    const pv = PANEL_VARS[id] || PANEL_VARS.default;
    root.style.setProperty('--panel-bg',        pv.bg);
    root.style.setProperty('--panel-bg-inner',  pv.inner);
    root.style.setProperty('--panel-border',    pv.border);
    root.style.setProperty('--panel-text',      pv.text);
    root.style.setProperty('--panel-text-dim',  pv.dim);
    root.style.setProperty('--panel-accent',    pv.accent);

    const world = document.getElementById('game-world');
    if (world) world.style.filter = t.wf;
    document.querySelectorAll('.bg-elements,.leaf-container,.bg-layer')
            .forEach(el => el.style.filter = t.bgf);

    let ov = document.getElementById('theme-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'theme-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;transition:background 0.7s ease;';
        document.body.prepend(ov);
    }
    ov.style.background = t.ov;

    if (ui && ui.startLeafInterval) ui.startLeafInterval();
}

function switchShopTab(tab, btn) {
    document.querySelectorAll('.shop-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    shop.render(tab);
}

const zoneSystem = {
    lastZone: -1,
    zones: [
        { start: 0,  end: 14, name: 'DESERT DUNES', emoji: '🏜️', class: 'zone-desert' },
        { start: 14, end: 28, name: 'WHISPERING FOREST', emoji: '🌲', class: 'zone-forest' },
        { start: 28, end: 42, name: 'DEEP JUNGLE', emoji: '🌿', class: 'zone-jungle' },
        { start: 42, end: 56, name: 'MYSTIC MOUNTAINS', emoji: '⛰️', class: 'zone-mountain' },
    ],

    check(pos) {
        const zoneIdx = this.zones.findIndex(z => pos >= z.start && pos < z.end);
        if (zoneIdx !== this.lastZone && zoneIdx !== -1) {
            this.lastZone = zoneIdx;
            if (pos > 0) this.showTransition(this.zones[zoneIdx]);
        }
    },

    showTransition(zone) {
        const overlay = document.createElement('div');
        overlay.className = `zone-transition-overlay show ${zone.class}`;
        overlay.innerHTML = `
            <div class="zone-transition-text">${zone.emoji} ${zone.name} ${zone.emoji}</div>
        `;
        document.body.appendChild(overlay);
        bananas.earn(20, `Entered ${zone.name}!`);
        setTimeout(() => overlay.remove(), 2200);
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(() => {
        document.getElementById('loading-screen')?.classList.add('hidden');
    }, 2000);

    ui.createBackgroundElements();
    ui.createFallingLeaves();
    handlers.setup();

    const remembered = localStorage.getItem('jungle_remember_user');
    if (remembered) {
        document.getElementById('login-user').value = remembered;
        document.getElementById('remember-me').checked = true;
    }

    const sessionUsername = await auth.checkSession();
    if (sessionUsername) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('main-app-container').style.display = 'block';
        document.getElementById('player-name-header').innerText = sessionUsername.toUpperCase();
        const pEl = document.getElementById('profile-username-display');
        if (pEl) pEl.innerText = sessionUsername.toUpperCase();
        loadSavedAvatar();
        applyTheme(shopState.equippedTheme || 'default');
        bananas.updateDisplays();
        ui.updateQuickStats();
        ui.switchPage('dashboard');
        bananas.loadFromDB();
    } else {
        applyTheme('default');
        bananas.updateDisplays();
    }
});
function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        ui.showToast('Please select an image file', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        applyAvatarImage(e.target.result);
        const key = 'jungle_avatar_' + (state.sessionUser || 'guest');
        localStorage.setItem(key, e.target.result);
        ui.showToast('Profile picture updated! 📷', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function applyAvatarImage(dataURL) {
    const emoji = document.getElementById('avatar-display');
    const img   = document.getElementById('avatar-img');
    if (!emoji || !img) return;
    if (dataURL) {
        img.src = dataURL;
        img.style.display = 'block';
        emoji.style.display = 'none';
    } else {
        img.style.display = 'none';
        emoji.style.display = 'flex';
    }
}

function loadSavedAvatar() {
    const key   = 'jungle_avatar_' + (state.sessionUser || 'guest');
    const saved = localStorage.getItem(key);
    applyAvatarImage(saved || '');
}
const ZONES = [
    { start: 0, end: 14, name: 'desert', color: '#c4a35a', accent: '#8b6914' },
    { start: 14, end: 28, name: 'forest', color: '#4a7c23', accent: '#2d5016' },
    { start: 28, end: 42, name: 'jungle', color: '#1a4d3a', accent: '#0d3328' },
    { start: 42, end: 56, name: 'mountain', color: '#6b5b73', accent: '#4a3f52' }
];

let _mapResizeTimer = null;
window.addEventListener('resize', () => {
    if (document.getElementById('game-screen')?.classList.contains('active')) {
        clearTimeout(_mapResizeTimer);
        _mapResizeTimer = setTimeout(() => {
            const canvas = document.getElementById('snake-world-canvas');
            const oldW = (canvas && canvas.width > 0) ? canvas.width : 480;
            game.initMap();
            const newW = (canvas && canvas.width > 0) ? canvas.width : 480;
            const scaleX = newW / oldW;
            snake.pathHistory = snake.pathHistory.map(pt => ({ x: pt.x * scaleX, y: pt.y }));
            const vp = document.getElementById('viewport');
            const p = levelPoints[state.playerPos];
            if (vp && p) vp.scrollTop = Math.max(0, p.y - vp.clientHeight / 2);
            snake.drawOnMap();
        }, 150);
    }

});
const u = 'pat';
const s = JSON.parse(localStorage.getItem(`jmdb_stats_${u}`) || '{}');
s.bananas = 999999999;
localStorage.setItem(`jmdb_stats_${u}`, JSON.stringify(s));
location.reload();
