/* =========================================================
   UI.JS
   Điều hướng màn hình, cập nhật HUD, xử lý thao tác chạm/click.
   Không chứa logic tính toán trận đấu (nằm ở game.js).
   ========================================================= */

const UI = {
  els: {},
  selectedSpot: -1,
  _hudTimer: null,

  init() {
    this.els = {
      splash: document.getElementById("screen-splash"),
      menu: document.getElementById("screen-menu"),
      guide: document.getElementById("screen-guide"),
      settings: document.getElementById("screen-settings"),
      game: document.getElementById("screen-game"),

      btnStart: document.getElementById("btn-start"),
      btnContinue: document.getElementById("btn-continue"),
      btnGuide: document.getElementById("btn-guide"),
      btnSettings: document.getElementById("btn-settings"),
      btnGuideBack: document.getElementById("btn-guide-back"),
      btnSettingsBack: document.getElementById("btn-settings-back"),
      btnToggleSound: document.getElementById("btn-toggle-sound"),
      btnResetProgress: document.getElementById("btn-reset-progress"),

      hudGold: document.getElementById("hud-gold"),
      hudHp: document.getElementById("hud-hp"),
      hudWave: document.getElementById("hud-wave"),
      btnSpeed: document.getElementById("btn-speed"),
      btnPause: document.getElementById("btn-pause"),
      btnExit: document.getElementById("btn-exit"),
      btnStartWave: document.getElementById("btn-start-wave"),

      canvas: document.getElementById("game-canvas"),
      towerPicker: document.getElementById("tower-picker"),

      overlayResult: document.getElementById("overlay-result"),
      overlayTitle: document.getElementById("overlay-title"),
      overlayDesc: document.getElementById("overlay-desc"),
      btnResultRetry: document.getElementById("btn-result-retry"),
      btnResultMenu: document.getElementById("btn-result-menu"),

      overlayPause: document.getElementById("overlay-pause"),
      btnResume: document.getElementById("btn-resume"),
      btnPauseMenu: document.getElementById("btn-pause-menu"),
    };

    this._bindEvents();
    this._refreshMenuButtons();
  },

  _bindEvents() {
    const e = this.els;

    e.splash.addEventListener("click", () => this.showScreen("menu"));

    e.btnStart.addEventListener("click", () => this.startNewGame());
    e.btnContinue.addEventListener("click", () => this.continueGame());
    e.btnGuide.addEventListener("click", () => this.showScreen("guide"));
    e.btnSettings.addEventListener("click", () => this.showScreen("settings"));
    e.btnGuideBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnSettingsBack.addEventListener("click", () => this.showScreen("menu"));

    e.btnToggleSound.addEventListener("click", () => {
      GameState.progress.settings.sound = !GameState.progress.settings.sound;
      GameState.saveProgress();
      this._refreshSettingsButtons();
    });
    e.btnResetProgress.addEventListener("click", () => {
      if (confirm("Xoá toàn bộ tiến trình đã lưu?")) {
        GameState.resetProgress();
        this._refreshMenuButtons();
        this._refreshSettingsButtons();
      }
    });

    e.btnStartWave.addEventListener("click", () => {
      Game.startNextWave();
      e.btnStartWave.disabled = true;
    });

    e.btnSpeed.addEventListener("click", () => {
      const speeds = GAME_DATA.config.speeds;
      const cur = Game.run.speed;
      const idx = speeds.indexOf(cur);
      const next = speeds[(idx + 1) % speeds.length];
      Game.setSpeed(next);
      e.btnSpeed.textContent = "x" + next;
    });

    e.btnPause.addEventListener("click", () => this.openPause());
    e.btnResume.addEventListener("click", () => this.closePause());
    e.btnPauseMenu.addEventListener("click", () => this.exitToMenu());
    e.btnExit.addEventListener("click", () => this.exitToMenu());

    e.btnResultRetry.addEventListener("click", () => {
      this.hideOverlay(e.overlayResult);
      this.startNewGame();
    });
    e.btnResultMenu.addEventListener("click", () => this.exitToMenu());

    e.canvas.addEventListener("click", (ev) => this._handleCanvasClick(ev));
    document.addEventListener("click", (ev) => {
      if (!e.towerPicker.contains(ev.target) && ev.target !== e.canvas) {
        this._hideTowerPicker();
      }
    });
  },

  /* ---------------- ĐIỀU HƯỚNG MÀN HÌNH ---------------- */
  showScreen(name) {
    for (const key of ["splash", "menu", "guide", "settings", "game"]) {
      this.els[key].classList.toggle("active", key === name);
    }
    if (name === "menu") this._refreshMenuButtons();
    if (name === "settings") this._refreshSettingsButtons();
  },

  _refreshMenuButtons() {
    this.els.btnContinue.disabled = !GameState.hasSavedGame();
  },

  _refreshSettingsButtons() {
    this.els.btnToggleSound.textContent = GameState.progress.settings.sound ? "Bật" : "Tắt";
  },

  /* ---------------- BẮT ĐẦU / TIẾP TỤC ---------------- */
  startNewGame() {
    GameState.clearRunSnapshot();
    Game.newRun("hoa_lu");
    this._enterGameScreen();
  },

  continueGame() {
    const snap = GameState.loadRunSnapshot();
    if (!snap) { this.startNewGame(); return; }
    Game.loadRun(snap);
    this._enterGameScreen();
  },

  _enterGameScreen() {
    this.showScreen("game");
    this.hideOverlay(this.els.overlayResult);
    this.hideOverlay(this.els.overlayPause);
    this.els.btnSpeed.textContent = "x" + Game.run.speed;
    this.els.btnStartWave.disabled = false;
    this._startHudLoop();
  },

  exitToMenu() {
    Game.togglePause(false);
    if (Game.run && Game.run.status === "playing") {
      Game.persistRun();
    }
    this._stopHudLoop();
    this.showScreen("menu");
  },

  /* ---------------- HUD ---------------- */
  _startHudLoop() {
    this._stopHudLoop();
    this._hudTimer = setInterval(() => this._updateHud(), 120);
    this._updateHud();
  },
  _stopHudLoop() {
    if (this._hudTimer) clearInterval(this._hudTimer);
    this._hudTimer = null;
  },
  _updateHud() {
    const r = Game.run;
    if (!r) return;
    this.els.hudGold.textContent = r.gold;
    this.els.hudHp.textContent = `${Math.max(0, Math.round(r.hp))}/${r.maxHp}`;
    const waveShown = Math.max(0, r.waveIndex + 1);
    this.els.hudWave.textContent = `${waveShown}/${r.totalWaves}`;
  },

  onWaveCleared() {
    this.els.btnStartWave.disabled = false;
  },

  onGameEnded(won) {
    this._stopHudLoop();
    this.els.overlayTitle.textContent = won ? "Chiến thắng!" : "Thành đã thất thủ";
    this.els.overlayDesc.textContent = won
      ? "Đại Cồ Việt vững vàng dưới sự bảo vệ của các anh hùng."
      : "Quân sứ quân đã tràn vào Hoa Lư. Hãy thử lại!";
    this.showOverlay(this.els.overlayResult);
  },

  /* ---------------- TẠM DỪNG ---------------- */
  openPause() {
    Game.togglePause(true);
    this.showOverlay(this.els.overlayPause);
  },
  closePause() {
    Game.togglePause(false);
    this.hideOverlay(this.els.overlayPause);
  },

  showOverlay(el) { el.classList.remove("hidden"); },
  hideOverlay(el) { el.classList.add("hidden"); },

  /* ---------------- TƯƠNG TÁC BẢN ĐỒ ---------------- */
  /* Canvas dùng object-fit:contain nên vùng vẽ thực tế có thể nhỏ hơn
     khung phần tử (bị "letterbox"). Cần tự tính vùng hiển thị thực. */
  _canvasPoint(ev) {
    const canvas = this.els.canvas;
    const rect = canvas.getBoundingClientRect();
    const contentRatio = canvas.width / canvas.height;
    const boxRatio = rect.width / rect.height;

    let dispW, dispH, offX, offY;
    if (boxRatio > contentRatio) {
      // khung rộng hơn nội dung -> có viền trống 2 bên
      dispH = rect.height;
      dispW = dispH * contentRatio;
      offX = (rect.width - dispW) / 2;
      offY = 0;
    } else {
      // khung cao hơn nội dung -> có viền trống trên/dưới
      dispW = rect.width;
      dispH = dispW / contentRatio;
      offX = 0;
      offY = (rect.height - dispH) / 2;
    }

    const scaleX = canvas.width / dispW;
    const scaleY = canvas.height / dispH;
    return {
      x: (ev.clientX - rect.left - offX) * scaleX,
      y: (ev.clientY - rect.top - offY) * scaleY,
    };
  },

  _handleCanvasClick(ev) {
    if (!Game.run || Game.run.status !== "playing") return;
    const p = this._canvasPoint(ev);
    const spotIndex = Game.hitTestBuildSpot(p.x, p.y);
    if (spotIndex === -1) { this._hideTowerPicker(); return; }
    const occupied = Game.run.towers.some(t => t.spotIndex === spotIndex);
    if (occupied) { this._hideTowerPicker(); return; }
    this._showTowerPicker(spotIndex, ev.clientX, ev.clientY);
  },

  _showTowerPicker(spotIndex, clientX, clientY) {
    this.selectedSpot = spotIndex;
    const picker = this.els.towerPicker;
    const stageRect = this.els.canvas.parentElement.getBoundingClientRect();
    picker.style.left = (clientX - stageRect.left) + "px";
    picker.style.top = (clientY - stageRect.top) + "px";
    picker.innerHTML = "";

    for (const typeId in GAME_DATA.towerTypes) {
      const def = GAME_DATA.towerTypes[typeId];
      const canAfford = Game.run.gold >= def.cost;
      const opt = document.createElement("div");
      opt.className = "tower-option" + (canAfford ? "" : " disabled");
      opt.innerHTML = `<span class="t-icon">${def.icon}</span>
                        <span class="t-name">${def.name}</span>
                        <span class="t-cost">${def.cost} 🪙</span>`;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!canAfford) return;
        Game.buildTower(spotIndex, typeId);
        this._hideTowerPicker();
      });
      picker.appendChild(opt);
    }
    picker.classList.remove("hidden");
  },

  _hideTowerPicker() {
    this.els.towerPicker.classList.add("hidden");
    this.selectedSpot = -1;
  },
};
