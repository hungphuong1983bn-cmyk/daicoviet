/* =========================================================
   SOUND-MANAGER.JS  (Giai đoạn 4)

   Âm thanh + NHẠC NỀN được TỔNG HỢP trực tiếp bằng Web Audio API -
   KHÔNG dùng file .mp3/.wav nào. Dự án không có tài nguyên audio, nếu
   trỏ tới file không tồn tại sẽ sinh lỗi 404 và có thể vỡ luồng khởi
   tạo; tổng hợp bằng oscillator cho ra tiếng thật, 0 byte tải về,
   không bao giờ 404.

   MỚI Ở GIAI ĐOẠN 4
   -----------------
   - NHẠC NỀN theo từng màn: mỗi theme bản đồ có thang âm ngũ cung, tempo
     và bè trống riêng (playMusic(theme) / stopMusic() / setMusicPaused()).
   - TÁCH RIÊNG công tắc SFX và MUSIC (Cài đặt), ngoài công tắc âm thanh
     tổng vẫn giữ nguyên như cũ.
   - Thêm hiệu ứng "sell" (bán tháp).

   Thiết kế an toàn:
   - AudioContext chỉ tạo SAU tương tác đầu tiên (chính sách autoplay).
   - Mọi lời gọi đều bọc try/catch: không có Web Audio thì game vẫn chạy.
   - Bộ hẹn giờ của nhạc nền luôn được clearInterval khi dừng -> KHÔNG rò
     rỉ bộ nhớ và không có oscillator mồ côi chạy nền.

   API:
     SoundManager.play(name)
     SoundManager.playMusic(theme) / stopMusic() / setMusicPaused(bool)
     SoundManager.setEnabled(bool) / setSfxEnabled(bool) / setMusicEnabled(bool)
     SoundManager.installUnlockHandler()
   ========================================================= */

const SoundManager = (() => {
  let ctx = null;
  let masterGain = null;
  let sfxGain = null;
  let musicGain = null;
  let unlocked = false;
  let activeVoices = 0;
  const MAX_VOICES = 10;

  let musicTimer = null;
  let musicStep = 0;
  let musicTheme = null;
  let musicPaused = false;

  const PRESETS = {
    attack:   { type: "triangle", freq: 620, freqTo: 380, dur: 0.05, gain: 0.05 },
    hit:      { type: "square",   freq: 240, freqTo: 150, dur: 0.06, gain: 0.07 },
    critical: { type: "sawtooth", freq: 880, freqTo: 220, dur: 0.16, gain: 0.15 },
    explosion:{ type: "sawtooth", freq: 180, freqTo: 40,  dur: 0.32, gain: 0.18, noise: true },
    boss:     { type: "sawtooth", freq: 90,  freqTo: 55,  dur: 0.70, gain: 0.24 },
    skill:    { type: "sine",     freq: 420, freqTo: 1180, dur: 0.30, gain: 0.18 },
    victory:  { type: "sine",     freq: 523, freqTo: 1046, dur: 0.55, gain: 0.20, chord: [659, 784] },
    defeat:   { type: "sine",     freq: 392, freqTo: 130,  dur: 0.80, gain: 0.20 },
    upgrade:  { type: "sine",     freq: 560, freqTo: 900,  dur: 0.20, gain: 0.15 },
    sell:     { type: "triangle", freq: 700, freqTo: 300,  dur: 0.18, gain: 0.13, chord: [520] },
    build:    { type: "triangle", freq: 320, freqTo: 520,  dur: 0.14, gain: 0.14 },
    button:   { type: "sine",     freq: 480, freqTo: 620,  dur: 0.05, gain: 0.08 },
    wave:     { type: "sawtooth", freq: 200, freqTo: 320,  dur: 0.40, gain: 0.16 },
    coin:     { type: "sine",     freq: 980, freqTo: 1320, dur: 0.09, gain: 0.10 },
    /* Giai đoạn 6 */
    evolve:   { type: "sine",     freq: 392, freqTo: 1568, dur: 0.75, gain: 0.22, chord: [523, 784] },
    miniboss: { type: "sawtooth", freq: 140, freqTo: 80,   dur: 0.50, gain: 0.20 },
  };

  /* Nhạc nền: mỗi theme một thang ngũ cung + tempo + bè trầm riêng, gợi
     không khí của vùng đất tương ứng. */
  const MUSIC_THEMES = {
    karst:    { scale: [262, 294, 330, 392, 440, 523], tempo: 520, bass: 98,  wave: "triangle" },
    citadel:  { scale: [294, 330, 392, 440, 494, 587], tempo: 470, bass: 110, wave: "triangle" },
    river:    { scale: [247, 294, 330, 370, 440, 494], tempo: 600, bass: 87,  wave: "sine" },
    mountain: { scale: [220, 262, 294, 349, 392, 440], tempo: 500, bass: 82,  wave: "triangle" },
    field:    { scale: [294, 349, 392, 440, 523, 587], tempo: 440, bass: 116, wave: "sine" },
    plain:    { scale: [262, 294, 330, 392, 440],      tempo: 520, bass: 98,  wave: "triangle" },
  };

  function settings() {
    try {
      if (typeof GameState !== "undefined" && GameState.progress && GameState.progress.settings) {
        return GameState.progress.settings;
      }
    } catch (e) { /* chưa khởi tạo */ }
    return {};
  }

  function globalEnabled() {
    try {
      if (typeof GAME_DATA !== "undefined" && GAME_DATA && GAME_DATA.config &&
          GAME_DATA.config.soundEnabled === false) return false;
    } catch (e) { /* bỏ qua */ }
    return settings().sound !== false;
  }

  function isSfxEnabled() {
    if (!globalEnabled()) return false;
    const st = settings();
    return st.sfx !== false;
  }

  function isMusicEnabled() {
    if (!globalEnabled()) return false;
    try {
      if (typeof GAME_DATA !== "undefined" && GAME_DATA && GAME_DATA.config &&
          GAME_DATA.config.features && GAME_DATA.config.features.musicEnabled === false) return false;
    } catch (e) { /* bỏ qua */ }
    return settings().music !== false;
  }

  function ensureContext() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 1;
      sfxGain.connect(masterGain);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.34; // nhạc nền luôn nhỏ hơn hiệu ứng
      musicGain.connect(masterGain);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  function playNoiseBurst(dur, gainValue) {
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gainValue;
    src.connect(g);
    g.connect(sfxGain);
    src.start();
  }

  function playTone(preset, freqOverride, destination, countVoice) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = preset.type;

    const f0 = freqOverride || preset.freq;
    const f1 = freqOverride ? freqOverride * (preset.freqTo / preset.freq) : preset.freqTo;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + preset.dur);

    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(preset.gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + preset.dur);

    osc.connect(g);
    g.connect(destination || sfxGain);
    osc.start(now);
    osc.stop(now + preset.dur + 0.02);

    if (countVoice !== false) {
      activeVoices++;
      osc.onended = () => { activeVoices = Math.max(0, activeVoices - 1); };
    }
  }

  function play(name) {
    if (!isSfxEnabled()) return;
    const preset = PRESETS[name];
    if (!preset) return;
    if (activeVoices >= MAX_VOICES) return;
    try {
      if (!ensureContext()) return;
      if (ctx.state === "suspended") ctx.resume();
      playTone(preset);
      if (preset.chord) for (const f of preset.chord) playTone(preset, f);
      if (preset.noise) playNoiseBurst(preset.dur, preset.gain * 0.7);
    } catch (e) { /* im lặng, không làm vỡ gameplay */ }
  }

  /* ---------- NHẠC NỀN ---------- */
  function musicTick() {
    if (musicPaused || !isMusicEnabled() || !ctx) return;
    const theme = MUSIC_THEMES[musicTheme] || MUSIC_THEMES.plain;
    try {
      const scale = theme.scale;
      // Giai điệu: đi theo thang ngũ cung, thỉnh thoảng nhảy quãng cho đỡ đơn điệu
      const idx = (musicStep % 2 === 0)
        ? musicStep % scale.length
        : (musicStep * 3 + 1) % scale.length;
      playTone({ type: theme.wave, freq: scale[idx], freqTo: scale[idx], dur: 0.45, gain: 0.10 },
        null, musicGain, false);
      // Bè trầm rơi vào phách mạnh
      if (musicStep % 4 === 0) {
        playTone({ type: "sine", freq: theme.bass, freqTo: theme.bass, dur: 0.75, gain: 0.13 },
          null, musicGain, false);
      }
      // Tiếng trống nhẹ mô phỏng trống đồng
      if (musicStep % 8 === 4) {
        playTone({ type: "triangle", freq: theme.bass * 2, freqTo: theme.bass, dur: 0.16, gain: 0.09 },
          null, musicGain, false);
      }
      musicStep++;
    } catch (e) { /* im lặng */ }
  }

  function playMusic(theme) {
    stopMusic();
    musicTheme = MUSIC_THEMES[theme] ? theme : "plain";
    musicStep = 0;
    musicPaused = false;
    if (!isMusicEnabled()) return;
    try {
      if (!ensureContext()) return;
      if (ctx.state === "suspended") ctx.resume();
      const t = MUSIC_THEMES[musicTheme];
      musicTick();
      musicTimer = setInterval(musicTick, t.tempo);
    } catch (e) { /* im lặng */ }
  }

  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    musicPaused = false;
  }

  function setMusicPaused(paused) {
    musicPaused = !!paused;
  }

  function installUnlockHandler() {
    if (unlocked) return;
    const unlock = () => {
      unlocked = true;
      ensureContext();
      if (ctx && ctx.state === "suspended") ctx.resume();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
  }

  function setEnabled(on) {
    if (!on) {
      stopMusic();
      if (ctx && ctx.state === "running") { try { ctx.suspend(); } catch (e) {} }
    } else if (ctx && ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) {}
    }
  }

  function setSfxEnabled() { /* đọc thẳng từ settings mỗi lần play, không cần state riêng */ }

  /* Bật/tắt nhạc ngay giữa trận: tắt thì dừng hẳn bộ hẹn giờ, bật lại thì
     phát tiếp đúng theme của màn đang chơi. */
  function setMusicEnabled(on) {
    if (!on) { stopMusic(); return; }
    if (musicTheme) playMusic(musicTheme);
  }

  function currentMusicTheme() { return musicTheme; }

  return {
    play, setEnabled, setSfxEnabled, setMusicEnabled,
    playMusic, stopMusic, setMusicPaused, currentMusicTheme,
    installUnlockHandler,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = SoundManager;
