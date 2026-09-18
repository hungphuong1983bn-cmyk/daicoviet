/* =========================================================
   SOUND-MANAGER.JS  (Giai đoạn 3, Priority 10 - mục XXXVII)

   Âm thanh THẬT, tổng hợp trực tiếp bằng Web Audio API - KHÔNG dùng file
   .mp3/.wav nào cả. Đây là lựa chọn có chủ đích, đúng yêu cầu mục
   XXXVII ("Nếu không có file audio thật -> xây architecture nhưng không
   được dùng file giả làm crash"): dự án hiện không có tài nguyên âm
   thanh, nếu trỏ tới file không tồn tại sẽ sinh 404 và có thể vỡ luồng
   khởi tạo. Tổng hợp bằng oscillator cho ra tiếng thật, nhẹ (0 byte tải
   về), không bao giờ 404.

   Thiết kế an toàn:
   - AudioContext chỉ được tạo SAU tương tác đầu tiên của người dùng
     (chính sách autoplay của trình duyệt), nên không có cảnh báo console.
   - Mọi lời gọi play() đều bọc try/catch: trình duyệt không hỗ trợ Web
     Audio thì game vẫn chạy bình thường, chỉ là im lặng.
   - Tôn trọng cờ có sẵn: GameState.progress.settings.sound và
     GAME_DATA.config.soundEnabled (Admin tắt được toàn cục).
   - Có giới hạn số âm cùng lúc để không "ù" tai khi diệt nhiều địch.

   API:
     SoundManager.play("attack" | "hit" | "critical" | "explosion" |
                       "boss" | "skill" | "victory" | "defeat" |
                       "upgrade" | "button" | "build" | "wave" | "coin")
     SoundManager.setEnabled(bool)
   ========================================================= */

const SoundManager = (() => {
  let ctx = null;
  let masterGain = null;
  let unlocked = false;
  let activeVoices = 0;
  const MAX_VOICES = 8; // chống chồng âm khi combo cao

  /* Bảng "công thức" cho từng loại âm. Mỗi âm là 1-2 oscillator ngắn có
     đường bao âm lượng (envelope) riêng, mô phỏng đúng tính chất:
     - type: dạng sóng (sine mượt, square/sawtooth gắt, triangle trung tính)
     - freq -> freqTo: quét cao độ (lên = tích cực, xuống = tiêu cực)
     - dur: độ dài (giây), gain: âm lượng tương đối */
  const PRESETS = {
    attack:   { type: "triangle", freq: 620, freqTo: 380, dur: 0.07, gain: 0.10 },
    hit:      { type: "square",   freq: 240, freqTo: 150, dur: 0.06, gain: 0.09 },
    critical: { type: "sawtooth", freq: 880, freqTo: 220, dur: 0.16, gain: 0.16 },
    explosion:{ type: "sawtooth", freq: 180, freqTo: 40,  dur: 0.32, gain: 0.20, noise: true },
    boss:     { type: "sawtooth", freq: 90,  freqTo: 55,  dur: 0.70, gain: 0.24 },
    skill:    { type: "sine",     freq: 420, freqTo: 1180, dur: 0.30, gain: 0.18 },
    victory:  { type: "sine",     freq: 523, freqTo: 1046, dur: 0.55, gain: 0.20, chord: [659, 784] },
    defeat:   { type: "sine",     freq: 392, freqTo: 130,  dur: 0.80, gain: 0.20 },
    upgrade:  { type: "sine",     freq: 560, freqTo: 900,  dur: 0.20, gain: 0.15 },
    build:    { type: "triangle", freq: 320, freqTo: 520,  dur: 0.14, gain: 0.14 },
    button:   { type: "sine",     freq: 480, freqTo: 620,  dur: 0.05, gain: 0.09 },
    wave:     { type: "sawtooth", freq: 200, freqTo: 320,  dur: 0.40, gain: 0.16 },
    coin:     { type: "sine",     freq: 980, freqTo: 1320, dur: 0.09, gain: 0.10 },
  };

  function isEnabled() {
    // Ưu tiên cờ Admin (tắt toàn cục), sau đó tới cài đặt của người chơi.
    try {
      if (typeof GAME_DATA !== "undefined" && GAME_DATA.config && GAME_DATA.config.soundEnabled === false) return false;
      if (typeof GameState !== "undefined" && GameState.progress && GameState.progress.settings) {
        return GameState.progress.settings.sound !== false;
      }
    } catch (e) { /* chưa khởi tạo xong -> coi như bật */ }
    return true;
  }

  /* Khởi tạo AudioContext lười - chỉ chạy khi người dùng đã tương tác,
     tránh cảnh báo "AudioContext was not allowed to start". */
  function ensureContext() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.85;
      masterGain.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  /* Tiếng nổ cần thành phần nhiễu (noise) chứ không chỉ oscillator thuần,
     nếu không sẽ nghe như tiếng "bíp" chứ không ra tiếng nổ. */
  function playNoiseBurst(dur, gainValue) {
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // nhiễu trắng tắt dần theo hàm mũ
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gainValue;
    src.connect(g);
    g.connect(masterGain);
    src.start();
  }

  function playTone(preset, freqOverride) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = preset.type;

    const f0 = freqOverride || preset.freq;
    const f1 = freqOverride ? freqOverride * (preset.freqTo / preset.freq) : preset.freqTo;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + preset.dur);

    // Envelope: vào nhanh, tắt mượt -> tránh tiếng "tách" (click) khó chịu
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(preset.gain, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + preset.dur);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + preset.dur + 0.02);

    activeVoices++;
    osc.onended = () => { activeVoices = Math.max(0, activeVoices - 1); };
  }

  function play(name) {
    if (!isEnabled()) return;
    const preset = PRESETS[name];
    if (!preset) return; // tên âm không tồn tại -> im lặng, không ném lỗi
    if (activeVoices >= MAX_VOICES) return; // chống chồng âm
    try {
      if (!ensureContext()) return;
      if (ctx.state === "suspended") ctx.resume();
      playTone(preset);
      if (preset.chord) {
        for (const f of preset.chord) playTone(preset, f);
      }
      if (preset.noise) playNoiseBurst(preset.dur, preset.gain * 0.7);
    } catch (e) {
      // Web Audio lỗi/không hỗ trợ -> game vẫn chạy bình thường, chỉ im lặng
    }
  }

  /* Gọi 1 lần từ main.js: mở khoá AudioContext ở tương tác đầu tiên. */
  function installUnlockHandler() {
    if (unlocked) return;
    const unlock = () => {
      unlocked = true;
      ensureContext();
      if (ctx && ctx.state === "suspended") ctx.resume();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock, { once: false });
    document.addEventListener("keydown", unlock, { once: false });
  }

  function setEnabled(on) {
    if (!on && ctx && ctx.state === "running") {
      try { ctx.suspend(); } catch (e) {}
    } else if (on && ctx && ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) {}
    }
  }

  return { play, setEnabled, installUnlockHandler };
})();

if (typeof module !== "undefined" && module.exports) module.exports = SoundManager;
