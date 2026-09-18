/* =========================================================
   UI.JS  (Giai đoạn 4)
   Điều hướng màn hình, HUD, thao tác chạm/click, bàn phím, tooltip.
   Không chứa logic tính toán trận đấu (nằm ở game.js).

   MỚI SO VỚI GIAI ĐOẠN 3
   ----------------------
   - Bảng thông tin THÁP đầy đủ: sát thương, loại sát thương, tầm, tốc bắn,
     DPS ước tính, chí mạng, xuyên giáp, hiệu ứng, tổng vốn, giá bán.
   - CÂY NÂNG CẤP: tới cấp phân nhánh sẽ hiện 2 lựa chọn kèm mô tả.
   - BÁN THÁP kèm số vàng hoàn lại hiển thị ngay trên nút.
   - 7 chế độ ƯU TIÊN MỤC TIÊU chọn được cho từng tháp.
   - TOOLTIP dùng chung (chạm/di chuột) cho mọi phần tử có data-tip.
   - PHÍM TẮT: Space/Enter bắt đầu đợt, P tạm dừng, S kỹ năng, F đổi tốc độ,
     Esc đóng bảng/menu.
   - Cài đặt tách riêng Nhạc nền và Hiệu ứng âm thanh.
   - Màn Tướng hiển thị kỹ năng CHỦ ĐỘNG (nâng cấp được) và BỊ ĐỘNG.
   ========================================================= */

const UI = {
  els: {},
  selectedSpot: -1,
  _hudTimer: null,
  _pendingStageId: null,
  _pickerMode: "build",
  _nextStageId: null,

  _inited: false,

  init() {
    // Chống khởi tạo hai lần (tránh gắn trùng sự kiện bàn phím/chuột).
    if (this._inited) return;
    this._inited = true;
    const $ = (id) => document.getElementById(id);
    this.els = {
      splash: $("screen-splash"),
      menu: $("screen-menu"),
      guide: $("screen-guide"),
      settings: $("screen-settings"),
      levels: $("screen-levels"),
      heroes: $("screen-heroes"),
      quests: $("screen-quests"),
      achievements: $("screen-achievements"),
      game: $("screen-game"),

      btnStart: $("btn-start"),
      btnContinue: $("btn-continue"),
      btnGuide: $("btn-guide"),
      btnSettings: $("btn-settings"),
      btnMenuHeroes: $("btn-menu-heroes"),
      btnMenuQuests: $("btn-menu-quests"),
      btnGuideBack: $("btn-guide-back"),
      btnSettingsBack: $("btn-settings-back"),
      btnToggleSound: $("btn-toggle-sound"),
      btnToggleMusic: $("btn-toggle-music"),
      btnToggleSfx: $("btn-toggle-sfx"),
      btnToggleDamageNumbers: $("btn-toggle-damage-numbers"),
      btnToggle3d: $("btn-toggle-3d"),
      btnToggleShadows: $("btn-toggle-shadows"),
      btnResetProgress: $("btn-reset-progress"),

      levelList: $("level-list"),
      btnLevelsBack: $("btn-levels-back"),

      heroList: $("hero-list"),
      heroGold: $("hero-gold"),
      heroExp: $("hero-exp"),
      btnHeroesBack: $("btn-heroes-back"),
      btnHeroesStart: $("btn-heroes-start"),

      questList: $("quest-list"),
      btnQuestsBack: $("btn-quests-back"),
      btnMenuAchievements: $("btn-menu-achievements"),
      achievementList: $("achievement-list"),
      achievementsProgress: $("achievements-progress"),
      btnAchievementsBack: $("btn-achievements-back"),

      hudGold: $("hud-gold"),
      hudHp: $("hud-hp"),
      hudHpFill: $("hud-hp-fill"),
      hudScore: $("hud-score"),
      hudTide: $("hud-tide"),
      hudTideLabel: $("hud-tide-label"),
      hudWave: $("hud-wave"),
      hudStage: $("hud-stage"),
      comboBadge: $("combo-badge"),
      btnSpeed: $("btn-speed"),
      btnSkill: $("btn-skill"),
      btnPause: $("btn-pause"),
      btnExit: $("btn-exit"),
      btnStartWave: $("btn-start-wave"),

      bossBar: $("boss-bar"),
      bossBarIcon: $("boss-bar-icon"),
      bossBarName: $("boss-bar-name"),
      bossBarPhase: $("boss-bar-phase"),
      bossBarFill: $("boss-bar-fill"),
      bossBarHp: $("boss-bar-hp"),

      canvas: $("game-canvas"),
      towerPicker: $("tower-picker"),
      toastContainer: $("toast-container"),
      tooltip: $("tooltip"),

      overlayResult: $("overlay-result"),
      overlayTitle: $("overlay-title"),
      overlayStars: $("overlay-stars"),
      overlayDesc: $("overlay-desc"),
      overlayStats: $("overlay-stats"),
      btnResultRetry: $("btn-result-retry"),
      btnResultNext: $("btn-result-next"),
      btnResultMenu: $("btn-result-menu"),

      overlayPause: $("overlay-pause"),
      pauseStats: $("pause-stats"),
      btnResume: $("btn-resume"),
      btnPauseMenu: $("btn-pause-menu"),
      btnPauseMusic: $("btn-pause-music"),
      btnPauseSfx: $("btn-pause-sfx"),
    };

    this._bindEvents();
    this._bindKeyboard();
    this._bindTooltips();
    this._refreshMenuButtons();
  },

  _bindEvents() {
    const e = this.els;

    e.splash.addEventListener("click", () => this.showScreen("menu"));

    e.btnStart.addEventListener("click", () => { this._pendingStageId = null; this.showScreen("levels"); });
    e.btnContinue.addEventListener("click", () => this.continueGame());
    e.btnGuide.addEventListener("click", () => this.showScreen("guide"));
    e.btnSettings.addEventListener("click", () => this.showScreen("settings"));
    e.btnMenuHeroes.addEventListener("click", () => { this._pendingStageId = null; this.showScreen("heroes"); });
    e.btnMenuQuests.addEventListener("click", () => this.showScreen("quests"));
    e.btnMenuAchievements.addEventListener("click", () => this.showScreen("achievements"));
    e.btnAchievementsBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnGuideBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnSettingsBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnLevelsBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnHeroesBack.addEventListener("click", () => this.showScreen(this._pendingStageId ? "levels" : "menu"));
    e.btnQuestsBack.addEventListener("click", () => this.showScreen("menu"));

    e.btnToggleSound.addEventListener("click", () => this._toggleSetting("sound"));
    if (e.btnToggleMusic) e.btnToggleMusic.addEventListener("click", () => this._toggleSetting("music"));
    if (e.btnToggleSfx) e.btnToggleSfx.addEventListener("click", () => this._toggleSetting("sfx"));
    if (e.btnToggleDamageNumbers) {
      e.btnToggleDamageNumbers.addEventListener("click", () => {
        const cfg = DataService.getConfig();
        const cur = !(cfg.features && cfg.features.showDamageNumbers === false);
        DataService.setConfig({ features: { showDamageNumbers: !cur } });
        rebuildGameData();
        this._refreshSettingsButtons();
      });
    }
    if (e.btnToggle3d) {
      e.btnToggle3d.addEventListener("click", () => {
        const cfg = DataService.getConfig();
        const cur = !(cfg.features && cfg.features.render3dEnabled === false);
        if (typeof Renderer3D !== "undefined") Renderer3D.setEnabled(!cur);
        else DataService.setConfig({ features: { render3dEnabled: !cur } });
        rebuildGameData();
        this._refreshSettingsButtons();
        if (typeof Renderer3D !== "undefined" && !cur && !Renderer3D.active()) {
          this.showToast("Máy hoặc trình duyệt không hỗ trợ WebGL — vẫn chơi ở chế độ 2D.");
        }
      });
    }
    if (e.btnToggleShadows) {
      e.btnToggleShadows.addEventListener("click", () => {
        const cfg = DataService.getConfig();
        const cur = !(cfg.features && cfg.features.shadows3d === false);
        DataService.setConfig({ features: { shadows3d: !cur } });
        rebuildGameData();
        if (typeof Renderer3D !== "undefined" && Renderer3D.renderer) {
          Renderer3D.renderer.shadowMap.enabled = !cur;
          Renderer3D._levelKey = null; // dựng lại địa hình để áp cờ đổ bóng mới
        }
        this._refreshSettingsButtons();
      });
    }
    e.btnResetProgress.addEventListener("click", () => {
      if (confirm("Xoá toàn bộ tiến trình đã lưu?")) {
        GameState.resetProgress();
        this._refreshMenuButtons();
        this._refreshSettingsButtons();
        this.showToast("Đã xoá tiến trình.");
      }
    });

    e.btnHeroesStart.addEventListener("click", () => {
      if (!this._pendingStageId) return;
      this._startStage(this._pendingStageId);
    });

    e.btnStartWave.addEventListener("click", () => this.startWave());

    e.btnSpeed.addEventListener("click", () => {
      if (!Game.run) return;
      const next = Game.cycleSpeed();
      e.btnSpeed.textContent = "x" + next;
    });

    e.btnSkill.addEventListener("click", () => this.useSkill());

    e.btnPause.addEventListener("click", () => this.openPause());
    e.btnResume.addEventListener("click", () => this.closePause());
    e.btnPauseMenu.addEventListener("click", () => this.exitToMenu());
    e.btnExit.addEventListener("click", () => this.exitToMenu());
    if (e.btnPauseMusic) e.btnPauseMusic.addEventListener("click", () => { this._toggleSetting("music"); this._refreshPauseButtons(); });
    if (e.btnPauseSfx) e.btnPauseSfx.addEventListener("click", () => { this._toggleSetting("sfx"); this._refreshPauseButtons(); });

    e.btnResultRetry.addEventListener("click", () => {
      this.hideOverlay(e.overlayResult);
      this._startStage(Game.run.levelId, Game.run.heroId);
    });
    e.btnResultNext.addEventListener("click", () => {
      this.hideOverlay(e.overlayResult);
      if (this._nextStageId) this._startStage(this._nextStageId, Game.run.heroId);
    });
    e.btnResultMenu.addEventListener("click", () => this.exitToMenu());

    e.canvas.addEventListener("click", (ev) => this._handleCanvasClick(ev));
    document.addEventListener("click", (ev) => {
      if (!e.towerPicker.contains(ev.target) && ev.target !== e.canvas) this._hideTowerPicker();
    });
    e.towerPicker.addEventListener("click", (ev) => {
      if (ev.target.closest('[data-act="close-picker"]')) this._hideTowerPicker();
    });
  },

  /* ---------------- PHÍM TẮT ---------------- */
  _bindKeyboard() {
    document.addEventListener("keydown", (ev) => {
      // không cướp phím khi người dùng đang gõ vào ô nhập liệu
      const tag = (ev.target && ev.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (ev.target && ev.target.isContentEditable)) return;

      const key = ev.key;
      const inGame = this.els.game.classList.contains("active");

      if (key === "Escape") {
        // Esc: đóng bảng tháp -> đóng pause -> quay lại màn trước
        ev.preventDefault();
        if (!this.els.towerPicker.classList.contains("hidden")) { this._hideTowerPicker(); return; }
        if (inGame && !this.els.overlayPause.classList.contains("hidden")) { this.closePause(); return; }
        if (inGame && this.els.overlayResult.classList.contains("hidden")) { this.openPause(); return; }
        for (const name of ["guide", "settings", "levels", "heroes", "quests", "achievements"]) {
          if (this.els[name] && this.els[name].classList.contains("active")) {
            this.showScreen(name === "heroes" && this._pendingStageId ? "levels" : "menu");
            return;
          }
        }
        return;
      }

      if (!inGame || !Game.run) return;
      switch (key) {
        case " ":
        case "Spacebar":
        case "Enter":
          ev.preventDefault();
          this.startWave();
          break;
        case "p": case "P":
          ev.preventDefault();
          if (this.els.overlayPause.classList.contains("hidden")) this.openPause();
          else this.closePause();
          break;
        case "s": case "S":
          ev.preventDefault();
          this.useSkill();
          break;
        case "f": case "F":
          ev.preventDefault();
          this.els.btnSpeed.textContent = "x" + Game.cycleSpeed();
          break;
      }
    });
  },

  /* ---------------- TOOLTIP DÙNG CHUNG ---------------- */
  _bindTooltips() {
    const tip = this.els.tooltip;
    if (!tip) return;
    const show = (target) => {
      const text = target.getAttribute("data-tip");
      if (!text) return;
      tip.textContent = text;
      tip.classList.remove("hidden");
      const rect = target.getBoundingClientRect();
      // đo sau khi đã có nội dung, rồi kẹp vào trong khung nhìn
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let left = rect.left + rect.width / 2 - w / 2;
      let top = rect.top - h - 8;
      if (top < 6) top = rect.bottom + 8;
      left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    };
    const hide = () => tip.classList.add("hidden");

    document.addEventListener("mouseover", (ev) => {
      const t = ev.target.closest ? ev.target.closest("[data-tip]") : null;
      if (t) show(t); else hide();
    });
    document.addEventListener("mouseout", hide);
    document.addEventListener("scroll", hide, true);
    // trên cảm ứng: chạm giữ để xem tooltip
    document.addEventListener("touchstart", (ev) => {
      const t = ev.target.closest ? ev.target.closest("[data-tip]") : null;
      if (t) { show(t); setTimeout(hide, 2200); }
    }, { passive: true });
  },

  _toggleSetting(key) {
    const st = GameState.progress.settings;
    st[key] = !(st[key] !== false);
    const player = GameState.getPlayer();
    if (player) DataService.update("players", player.id, { settings: Object.assign({}, player.settings, st) });
    GameState.saveProgress();
    if (key === "sound") {
      SoundManager.setEnabled(st.sound);
      if (st.sound && st.music !== false && Game.run) SoundManager.setMusicEnabled(true);
    }
    if (key === "music") SoundManager.setMusicEnabled(st.music !== false);
    if (st.sound !== false && st.sfx !== false) SoundManager.play("button");
    this._refreshSettingsButtons();
  },

  /* ---------------- ĐIỀU HƯỚNG MÀN HÌNH ---------------- */
  showScreen(name) {
    for (const key of ["splash", "menu", "guide", "settings", "levels", "heroes", "quests", "achievements", "game"]) {
      if (this.els[key]) this.els[key].classList.toggle("active", key === name);
    }
    if (name === "menu") this._refreshMenuButtons();
    if (name === "settings") this._refreshSettingsButtons();
    if (name === "levels") this._renderLevelList();
    if (name === "heroes") this._renderHeroList();
    if (name === "quests") this._renderQuestList();
    if (name === "achievements") this._renderAchievementList();
  },

  _refreshMenuButtons() {
    this.els.btnContinue.disabled = !GameState.hasSavedGame();
  },

  _refreshSettingsButtons() {
    const st = GameState.progress.settings || {};
    const setBtn = (btn, on) => {
      if (!btn) return;
      btn.textContent = on ? "Bật" : "Tắt";
      btn.classList.toggle("off", !on);
    };
    setBtn(this.els.btnToggleSound, st.sound !== false);
    setBtn(this.els.btnToggleMusic, st.music !== false);
    setBtn(this.els.btnToggleSfx, st.sfx !== false);
    const cfg = DataService.getConfig();
    setBtn(this.els.btnToggleDamageNumbers, !(cfg.features && cfg.features.showDamageNumbers === false));
    setBtn(this.els.btnToggle3d, !(cfg.features && cfg.features.render3dEnabled === false));
    setBtn(this.els.btnToggleShadows, !(cfg.features && cfg.features.shadows3d === false));
  },

  _refreshPauseButtons() {
    const st = GameState.progress.settings || {};
    if (this.els.btnPauseMusic) this.els.btnPauseMusic.textContent = "🎵 Nhạc: " + (st.music !== false ? "Bật" : "Tắt");
    if (this.els.btnPauseSfx) this.els.btnPauseSfx.textContent = "🔊 Hiệu ứng: " + (st.sfx !== false ? "Bật" : "Tắt");
  },

  /* ---------------- CHỌN MÀN CHƠI ---------------- */
  _renderLevelList() {
    rebuildGameData();
    const stages = Object.values(GAME_DATA.levels)
      .filter((s) => s.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const unlocked = GameState.progress.unlockedLevels || [];
    const container = this.els.levelList;
    container.innerHTML = "";
    const THEME_NAME = { karst: "Núi đá vôi", citadel: "Thành luỹ", river: "Sông nước", mountain: "Ải núi", field: "Đồng bằng", plain: "Đồng bằng" };
    for (const stage of stages) {
      const isUnlocked = unlocked.includes(stage.id);
      const best = (GameState.progress.bestWave || {})[stage.id] || 0;
      const bestStars = (GameState.progress.stageStars || {})[stage.id] || 0;
      const bestScore = (GameState.progress.bestScore || {})[stage.id] || 0;
      const starsLine = bestStars > 0
        ? `<span>${"⭐".repeat(bestStars)}${"☆".repeat(3 - bestStars)} · ${bestScore.toLocaleString("vi-VN")} điểm</span>`
        : "";
      const bossWaves = (stage.waves || []).filter((w) => w.waveType === "boss" || (w.groups || []).some((g) => g.boss)).length;
      const card = document.createElement("div");
      card.className = "level-card" + (isUnlocked ? "" : " locked");
      card.innerHTML = `
        <div class="level-card-head">
          <span class="level-name">${stage.name}</span>
          <span class="level-diff" data-tip="Độ khó ${stage.difficulty || 1}/8">${"★".repeat(stage.difficulty || 1)}</span>
        </div>
        <p class="level-desc">${stage.description || ""}</p>
        <div class="level-meta">
          <span>${stage.waves.length} đợt${bossWaves ? " · " + bossWaves + " Boss" : ""}</span>
          <span>🗺 ${THEME_NAME[stage.theme] || "Đồng bằng"}</span>
          <span>Tốt nhất: ${best}/${stage.waves.length}</span>
          ${starsLine}
        </div>
        ${isUnlocked ? "" : '<div class="level-lock">🔒 Cần hoàn thành màn trước</div>'}
      `;
      if (isUnlocked) {
        card.addEventListener("click", () => {
          this._pendingStageId = stage.id;
          this.showScreen("heroes");
        });
      }
      container.appendChild(card);
    }
  },

  _startStage(stageId, heroId) {
    GameState.clearRunSnapshot();
    const player = GameState.getPlayer();
    const useHero = heroId || (player && player.selectedHero) || null;
    Game.newRun(stageId, useHero);
    this._pendingStageId = null;
    this._enterGameScreen();
  },

  /* ---------------- TƯỚNG ---------------- */
  _renderHeroList() {
    rebuildGameData();
    const player = GameState.getPlayer();
    this.els.heroGold.textContent = player.gold;
    this.els.heroExp.textContent = player.exp;
    this.els.btnHeroesStart.classList.toggle("hidden", !this._pendingStageId);

    const container = this.els.heroList;
    container.innerHTML = "";
    const heroes = Object.values(GAME_DATA.generals).filter((h) => h.enabled !== false);
    for (const hero of heroes) {
      const owned = (player.heroesOwned || []).includes(hero.id);
      const selected = player.selectedHero === hero.id;
      const level = (player.heroLevels || {})[hero.id] || 1;
      const maxLevel = hero.maxLevel || 5;
      const heroExp = (player.heroExp || {})[hero.id] || 0;
      const expNeeded = GameState.heroExpNeeded(hero, level);
      const expPct = level >= maxLevel ? 100 : Math.min(100, Math.round((heroExp / expNeeded) * 100));
      const skillLevel = (player.heroSkillLevels || {})[hero.id] || 1;
      const skillMax = hero.skillMaxLevel || 5;
      const skill = GAME_DATA.skills[hero.skillId];
      const passive = hero.passive;

      const expBar = owned
        ? `<div class="hero-exp-row">
             <div class="hero-exp-track"><div class="hero-exp-fill" style="width:${expPct}%"></div></div>
             <span class="hero-exp-label">${level >= maxLevel ? "MAX" : `${heroExp}/${expNeeded} EXP`}</span>
           </div>`
        : "";
      const skillBlock = skill
        ? `<div class="hero-skill" data-tip="${skill.description || ""}">
             <span class="hero-skill-icon">${skill.icon || "✨"}</span>
             <span class="hero-skill-name">Chủ động: ${skill.name}${owned ? ` <b>Lv${skillLevel}/${skillMax}</b>` : ""}</span>
           </div>` : "";
      const passiveBlock = passive
        ? `<div class="hero-skill hero-passive" data-tip="${passive.description || ""}">
             <span class="hero-skill-icon">🔰</span>
             <span class="hero-skill-name">Bị động: ${passive.name}</span>
           </div>` : "";

      const card = document.createElement("div");
      card.className = "hero-card" + (selected ? " selected" : "");
      card.innerHTML = `
        <div class="hero-icon">${hero.icon || "🧑"}</div>
        <div class="hero-info">
          <div class="hero-name">${hero.nameVi || hero.name} ${owned ? `<span class="hero-level">Lv${level}</span>` : ""}</div>
          <p class="hero-desc">${hero.description || ""}</p>
          <div class="hero-stats">
            <span data-tip="Cộng thẳng vào HP tối đa của thành">+${hero.hp} HP thành</span>
            <span data-tip="Cộng % sát thương cho MỌI tháp">+${hero.damage}% ST tháp</span>
            <span data-tip="Giảm sát thương thành phải nhận">-${hero.defense} ST nhận</span>
            <span data-tip="Tướng tự đánh địch trong tầm khi ra trận">⚔ ${hero.heroDamage || 24} ST ra trận</span>
          </div>
          ${skillBlock}
          ${passiveBlock}
          ${expBar}
        </div>
        <div class="hero-action"></div>
      `;
      const actionEl = card.querySelector(".hero-action");
      if (!owned) {
        const btn = document.createElement("button");
        btn.className = "btn btn-small";
        btn.textContent = hero.unlockCost > 0 ? `Mở khoá (${hero.unlockCost} 🪙)` : "Mở khoá";
        btn.disabled = player.gold < (hero.unlockCost || 0);
        btn.addEventListener("click", (ev) => { ev.stopPropagation(); this._unlockHero(hero.id, hero.unlockCost || 0); });
        actionEl.appendChild(btn);
      } else {
        if (selected) {
          const badge = document.createElement("span");
          badge.className = "hero-selected-badge";
          badge.textContent = "Đang chọn";
          actionEl.appendChild(badge);
        } else {
          const btn = document.createElement("button");
          btn.className = "btn btn-small btn-primary";
          btn.textContent = "Chọn";
          btn.addEventListener("click", (ev) => { ev.stopPropagation(); this._selectHero(hero.id); });
          actionEl.appendChild(btn);
        }
        // Nâng cấp KỸ NĂNG chủ động bằng vàng bền vững
        if (skill && skillLevel < skillMax) {
          const cost = GameState.heroSkillCost(hero, skillLevel);
          const up = document.createElement("button");
          up.className = "btn btn-small";
          up.textContent = `Nâng kỹ năng (${cost} 🪙)`;
          up.disabled = player.gold < cost;
          up.setAttribute("data-tip", `Mỗi cấp tăng ${Math.round((skill.perLevelBonus || 0.2) * 100)}% hiệu lực kỹ năng`);
          up.addEventListener("click", (ev) => {
            ev.stopPropagation();
            const res = GameState.upgradeHeroSkill(hero.id);
            if (res.ok) { this.showToast(`Kỹ năng ${skill.name} lên Lv${res.level}!`); SoundManager.play("upgrade"); }
            else if (res.reason === "no_gold") this.showToast("Không đủ vàng!");
            this._renderHeroList();
          });
          actionEl.appendChild(up);
        }
      }
      container.appendChild(card);
    }
  },

  _unlockHero(heroId, cost) {
    const player = GameState.getPlayer();
    if (player.gold < cost) return;
    const heroesOwned = [...(player.heroesOwned || []), heroId];
    const heroLevels = Object.assign({}, player.heroLevels, { [heroId]: 1 });
    const heroSkillLevels = Object.assign({}, player.heroSkillLevels, { [heroId]: 1 });
    const heroExp = Object.assign({}, player.heroExp, { [heroId]: 0 });
    DataService.update("players", player.id, {
      gold: player.gold - cost, heroesOwned, heroLevels, heroSkillLevels, heroExp,
    });
    this.showToast("Đã mở khoá tướng!");
    SoundManager.play("upgrade");
    this._renderHeroList();
  },

  _selectHero(heroId) {
    const player = GameState.getPlayer();
    DataService.update("players", player.id, { selectedHero: heroId });
    SoundManager.play("button");
    this._renderHeroList();
  },

  /* ---------------- NHIỆM VỤ ---------------- */
  _renderQuestList() {
    const quests = QuestService.listForPlayer();
    const container = this.els.questList;
    container.innerHTML = "";
    for (const q of quests) {
      const card = document.createElement("div");
      card.className = "quest-card" + (q.claimed ? " claimed" : q.done ? " done" : "");
      card.innerHTML = `
        <div class="quest-name">${q.name}</div>
        <p class="quest-desc">${q.description || ""}</p>
        <div class="quest-reward">Thưởng: ${q.reward.gold || 0} 🪙 · ${q.reward.exp || 0} EXP</div>
      `;
      const actionEl = document.createElement("div");
      actionEl.className = "quest-action";
      if (q.claimed) {
        actionEl.innerHTML = `<span class="quest-status">✔ Đã nhận</span>`;
      } else if (q.done) {
        const btn = document.createElement("button");
        btn.className = "btn btn-small btn-primary";
        btn.textContent = "Nhận thưởng";
        btn.addEventListener("click", () => {
          const res = QuestService.claim(q.id);
          if (res.ok) { this.showToast("Đã nhận thưởng!"); this._renderQuestList(); }
        });
        actionEl.appendChild(btn);
      } else {
        actionEl.innerHTML = `<span class="quest-status">Đang thực hiện</span>`;
      }
      card.appendChild(actionEl);
      container.appendChild(card);
    }
  },

  _renderAchievementList() {
    const achievements = AchievementService.listForPlayer();
    const container = this.els.achievementList;
    if (!container) return;
    container.innerHTML = "";
    const unlockedCount = achievements.filter((a) => a.unlocked).length;
    if (this.els.achievementsProgress) {
      this.els.achievementsProgress.textContent = `Đã đạt ${unlockedCount}/${achievements.length}`;
    }
    for (const a of achievements) {
      const card = document.createElement("div");
      card.className = "achievement-card" + (a.unlocked ? " unlocked" : " locked");
      const dateStr = a.unlocked && a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString("vi-VN") : "";
      card.innerHTML = `
        <div class="achievement-icon">${a.unlocked ? (a.icon || "🏆") : "🔒"}</div>
        <div class="achievement-info">
          <div class="achievement-name">${a.name}</div>
          <p class="achievement-desc">${a.description || ""}</p>
          <div class="achievement-reward">
            ${a.unlocked ? `<span class="achievement-status">✔ Đã đạt ${dateStr}</span>` : `Thưởng: ${(a.reward && a.reward.gold) || 0} 🪙 · ${(a.reward && a.reward.exp) || 0} EXP`}
          </div>
        </div>
      `;
      container.appendChild(card);
    }
  },

  onQuestsCompleted(quests) {
    if (!quests || !quests.length) return;
    for (const q of quests) this.showToast("Hoàn thành nhiệm vụ: " + q.name);
  },

  onAchievementsUnlocked(achievements) {
    if (!achievements || !achievements.length) return;
    for (const a of achievements) this.showToast(`🏆 Đã mở khoá: ${a.icon || ""} ${a.name}!`);
  },

  /* ---------------- TOAST ---------------- */
  showToast(message) {
    const container = this.els.toastContainer;
    if (!container) return;
    // giới hạn số toast cùng lúc -> không bao giờ ngập màn hình / phình DOM
    while (container.children.length >= 4) container.removeChild(container.firstChild);
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.classList.add("visible"), 10);
    setTimeout(() => {
      el.classList.remove("visible");
      setTimeout(() => el.remove(), 300);
    }, 2600);
  },

  /* ---------------- VÀO TRẬN ---------------- */
  _enterGameScreen() {
    this.showScreen("game");
    this.hideOverlay(this.els.overlayResult);
    this.hideOverlay(this.els.overlayPause);
    this.els.btnSpeed.textContent = "x" + Game.run.speed;
    this.els.btnStartWave.disabled = false;
    this.els.btnSkill.classList.toggle("hidden", !Game.run.skillDef);
    if (Game.run.skillDef) {
      this.els.btnSkill.textContent = Game.run.skillDef.icon || "✨";
      this.els.btnSkill.setAttribute("data-tip", `${Game.run.skillDef.name} (phím S) - ${Game.run.skillDef.description || ""}`);
    }
    if (this.els.hudStage) this.els.hudStage.textContent = Game.levelDef ? Game.levelDef.name : "";
    this._refreshPauseButtons();
    this._maybeShowTutorial();
    this._startHudLoop();
  },

  _maybeShowTutorial() {
    const cfg = GAME_DATA.config.features || {};
    const player = GameState.getPlayer();
    if (!cfg.tutorialEnabled || !player || player.settings.tutorialSeen) return;
    this.showToast("Mẹo: chạm ô đất trống để xây quân · Space bắt đầu đợt · P tạm dừng · F đổi tốc độ");
    DataService.update("players", player.id, { settings: Object.assign({}, player.settings, { tutorialSeen: true }) });
  },

  continueGame() {
    const snap = GameState.loadRunSnapshot();
    if (!snap) { this.showToast("Không có ván nào đang chơi dở."); this.showScreen("levels"); return; }
    if (!Game.loadRun(snap)) { this.showToast("Không khôi phục được ván cũ."); this.showScreen("levels"); return; }
    this._enterGameScreen();
  },

  startWave() {
    if (!Game.run || Game.run.status !== "playing") return;
    if (Game.run.waveInProgress) { this.showToast("Đợt hiện tại chưa kết thúc!"); return; }
    if (Game.isBossWave(Game.run.waveIndex + 1)) this.showToast("👹 ĐỢT BOSS! Hãy chuẩn bị kỹ.");
    if (Game.startNextWave()) this.els.btnStartWave.disabled = true;
  },

  useSkill() {
    if (!Game.run || !Game.run.skillDef) return;
    const ok = Game.useSkill();
    if (!ok && Game.run.skillCooldownRemaining > 0) {
      this.showToast("Kỹ năng đang hồi (" + Math.ceil(Game.run.skillCooldownRemaining) + "s)");
    }
  },

  exitToMenu() {
    Game.togglePause(false);
    if (Game.run && Game.run.status === "playing") Game.persistRun();
    Game.stopMusic();
    this._hideTowerPicker();
    this._stopHudLoop();
    this.hideOverlay(this.els.overlayResult);
    this.hideOverlay(this.els.overlayPause);
    // Dừng hẳn vòng lặp vẽ khi rời trận: tiết kiệm CPU/GPU khi đang ở menu
    // và không giữ lại mô hình 3D của ván cũ.
    Game.stopLoop();
    if (typeof Renderer3D !== "undefined") Renderer3D.clearRun();
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
    this.els.hudHp.textContent = `${Math.max(0, Math.round(r.hp))}/${Math.round(r.maxHp)}`;
    if (this.els.hudHpFill) {
      const pct = Math.max(0, Math.min(1, r.hp / r.maxHp));
      this.els.hudHpFill.style.width = (pct * 100).toFixed(1) + "%";
      this.els.hudHpFill.classList.toggle("low", pct <= 0.3);
    }
    this.els.hudScore.textContent = Math.round(r.score);
    if (this.els.hudTide) {
      const isTideMap = Game.levelDef && Game.levelDef.specialMechanic === "tide";
      this.els.hudTide.classList.toggle("hidden", !isTideMap);
    }
    const waveShown = Math.max(0, r.waveIndex + 1);
    const nextIsBoss = Game.isBossWave(r.waveIndex + 1);
    this.els.hudWave.textContent = `${waveShown}/${r.totalWaves}` + (nextIsBoss && !r.waveInProgress ? " 👹" : "");
    this.els.btnStartWave.textContent = r.waveInProgress
      ? (r.waveIsSurvival ? `Sống sót ${Math.ceil(Math.max(0, r.waveSurviveTimer))}s` : "Đang đánh…")
      : (nextIsBoss ? "👹 Bắt đầu đợt BOSS" : "Bắt đầu đợt (Space)");
    this.els.btnStartWave.disabled = r.waveInProgress || r.status !== "playing";
    this._updateBossBar();
    this._updateComboBadge(r);

    if (r.skillDef) {
      this.els.btnSkill.classList.remove("hidden");
      if (r.skillCooldownRemaining > 0) {
        this.els.btnSkill.disabled = true;
        this.els.btnSkill.textContent = Math.ceil(r.skillCooldownRemaining) + "s";
      } else {
        this.els.btnSkill.disabled = false;
        this.els.btnSkill.textContent = r.skillDef.icon || "✨";
      }
    } else {
      this.els.btnSkill.classList.add("hidden");
    }
  },

  _updateBossBar() {
    const r = Game.run;
    const bar = this.els.bossBar;
    if (!r || !bar) return;
    const boss = r.enemies.find((e) => e.isBoss && e.alive);
    if (!boss) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    this.els.bossBarIcon.textContent = boss.def.icon || "👹";
    this.els.bossBarName.textContent = boss.def.name;
    const pct = Math.max(0, boss.hp / boss.maxHp) * 100;
    this.els.bossBarFill.style.width = pct.toFixed(1) + "%";
    const shieldTxt = boss.shield > 0 ? ` 🛡${Math.round(boss.shield)}` : "";
    this.els.bossBarHp.textContent = `${Math.max(0, Math.round(boss.hp))} / ${boss.maxHp} HP${shieldTxt}`;
    this.els.bossBarPhase.textContent = boss.currentPhase ? boss.currentPhase.name : "";
    bar.classList.toggle("boss-bar-enrage", !!(boss.currentPhase && boss.currentPhase.enrage));
  },

  _updateComboBadge(r) {
    const badge = this.els.comboBadge;
    if (!badge) return;
    if (r.combo >= 2) {
      badge.classList.remove("hidden");
      badge.textContent = `🔥 COMBO x${r.combo}`;
      const tier = r.combo >= 20 ? "combo-t4" : r.combo >= 10 ? "combo-t3" : r.combo >= 5 ? "combo-t2" : "combo-t1";
      badge.className = "combo-badge " + tier;
    } else {
      badge.classList.add("hidden");
    }
  },

  onBossPhaseChanged(boss, phase) {
    const bar = this.els.bossBar;
    if (bar) {
      bar.classList.remove("boss-bar-flash");
      void bar.offsetWidth;
      bar.classList.add("boss-bar-flash");
    }
    if (phase && phase.enrage) this.showToast(`⚠ ${boss.def.name} CUỒNG NỘ!`);
    else if (phase) this.showToast(`${boss.def.name} bước sang giai đoạn: ${phase.name}`);
  },

  onBossAbilityUsed(boss, ability) {
    this.showToast(`${boss.def.name} dùng chiêu: ${ability.name}!`);
  },

  onHeroLeveledUp(heroId, level) {
    const hero = GAME_DATA.generals && GAME_DATA.generals[heroId];
    this.showToast(`🎉 ${hero ? (hero.nameVi || hero.name) : "Tướng"} đã lên Lv${level}!`);
  },

  onTideChanged(isHighTide) {
    if (this.els.hudTideLabel) this.els.hudTideLabel.textContent = isHighTide ? "Triều dâng (chậm)" : "Triều rút (nhanh)";
    if (this.els.hudTide) this.els.hudTide.classList.toggle("hud-tide-high", isHighTide);
    this.showToast(isHighTide ? "🌊 Triều dâng! Quân địch di chuyển chậm lại." : "🌊 Triều rút! Quân địch di chuyển nhanh hơn.");
  },

  onWaveCleared() {
    this.els.btnStartWave.disabled = false;
    this.showToast("✔ Đã dọn sạch đợt này!");
  },

  onGameEnded(won, stats) {
    this._stopHudLoop();
    this._hideTowerPicker();
    if (this.els.bossBar) this.els.bossBar.classList.add("hidden");
    if (this.els.comboBadge) this.els.comboBadge.classList.add("hidden");
    this.els.overlayTitle.textContent = won ? "🏆 CHIẾN THẮNG" : "💀 THÀNH ĐÃ THẤT THỦ";

    const s = stats || {};
    if (this.els.overlayStars) {
      if (won) {
        const stars = s.stars || 0;
        this.els.overlayStars.textContent = "⭐".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars));
        this.els.overlayStars.classList.remove("hidden");
      } else {
        this.els.overlayStars.classList.add("hidden");
        this.els.overlayStars.textContent = "";
      }
    }

    this.els.overlayDesc.textContent = won
      ? ((s.stars || 0) >= 3 ? "HOÀN HẢO! Đại Cồ Việt vững vàng dưới sự bảo vệ của các anh hùng."
                             : "Đại Cồ Việt vững vàng dưới sự bảo vệ của các anh hùng.")
      : "Quân địch đã tràn vào thành. Hãy thử lại!";

    if (this.els.overlayStats) {
      const mm = Math.floor((s.elapsedTime || 0) / 60);
      const ss = String((s.elapsedTime || 0) % 60).padStart(2, "0");
      const rows = [
        `<span>⚔ Score</span><strong>${(s.score || 0).toLocaleString("vi-VN")}</strong>`,
        `<span>💀 Enemy tiêu diệt</span><strong>${s.killCount || 0}</strong>`,
        `<span>👹 Boss</span><strong>${s.bossKillCount || 0}</strong>`,
        `<span>🏰 Tháp còn lại</span><strong>${s.towerCount || 0}</strong>`,
        `<span>🔥 Combo cao nhất</span><strong>x${s.maxCombo || 0}</strong>`,
        `<span>🎯 Chí mạng</span><strong>${s.critCount || 0}</strong>`,
        `<span>❤ HP thành còn</span><strong>${s.hpPercent || 0}%</strong>`,
        `<span>⏱ Thời gian</span><strong>${mm}:${ss}</strong>`,
      ];
      if (!won) rows.push(`<span class="overlay-tip">Gợi ý: kết hợp tháp PHÉP (Đạo sĩ, Hoả tiễn) để xuyên giáp, đặt Trống đồng để buff, và dùng kỹ năng tướng đúng lúc.</span>`);
      this.els.overlayStats.innerHTML = rows.map((r) => `<div class="overlay-stat-row">${r}</div>`).join("");
    }

    this._nextStageId = won ? this._findNextStageId(Game.run && Game.run.levelId) : null;
    if (this.els.btnResultNext) this.els.btnResultNext.classList.toggle("hidden", !this._nextStageId);

    this.showOverlay(this.els.overlayResult);
  },

  _findNextStageId(currentStageId) {
    if (!currentStageId) return null;
    const stages = Object.values(GAME_DATA.levels)
      .filter((s) => s.enabled !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = stages.findIndex((s) => s.id === currentStageId);
    if (idx === -1 || idx + 1 >= stages.length) return null;
    const next = stages[idx + 1];
    const unlocked = GameState.progress.unlockedLevels || [];
    return unlocked.includes(next.id) ? next.id : null;
  },

  /* ---------------- TẠM DỪNG ---------------- */
  openPause() {
    if (!Game.run || Game.run.status !== "playing") return;
    Game.togglePause(true);
    const r = Game.run;
    if (this.els.pauseStats) {
      this.els.pauseStats.innerHTML = [
        `<div class="overlay-stat-row"><span>🗺 Màn</span><strong>${Game.levelDef ? Game.levelDef.name : ""}</strong></div>`,
        `<div class="overlay-stat-row"><span>🌊 Đợt</span><strong>${Math.max(0, r.waveIndex + 1)}/${r.totalWaves}</strong></div>`,
        `<div class="overlay-stat-row"><span>🪙 Vàng</span><strong>${r.gold}</strong></div>`,
        `<div class="overlay-stat-row"><span>🏰 Tháp</span><strong>${r.towers.length}</strong></div>`,
        `<div class="overlay-stat-row"><span>💀 Đã diệt</span><strong>${r.killCount}</strong></div>`,
      ].join("");
    }
    this._refreshPauseButtons();
    this.showOverlay(this.els.overlayPause);
  },
  closePause() {
    Game.togglePause(false);
    this.hideOverlay(this.els.overlayPause);
  },

  showOverlay(el) { if (el) el.classList.remove("hidden"); },
  hideOverlay(el) { if (el) el.classList.add("hidden"); },

  /* ---------------- TƯƠNG TÁC BẢN ĐỒ ---------------- */
  _canvasPoint(ev) {
    const canvas = this.els.canvas;
    const rect = canvas.getBoundingClientRect();
    const contentRatio = canvas.width / canvas.height;
    const boxRatio = rect.width / rect.height;
    let dispW, dispH, offX, offY;
    if (boxRatio > contentRatio) {
      dispH = rect.height; dispW = dispH * contentRatio;
      offX = (rect.width - dispW) / 2; offY = 0;
    } else {
      dispW = rect.width; dispH = dispW / contentRatio;
      offX = 0; offY = (rect.height - dispH) / 2;
    }
    return {
      x: (ev.clientX - rect.left - offX) * (canvas.width / dispW),
      y: (ev.clientY - rect.top - offY) * (canvas.height / dispH),
    };
  },

  _handleCanvasClick(ev) {
    if (!Game.run || Game.run.status !== "playing") return;
    let p = this._canvasPoint(ev);
    // Ở chế độ 3D, điểm trên canvas phải được BẮN TIA xuống mặt đất để ra
    // đúng toạ độ bản đồ (2D) mà toàn bộ logic game đang dùng.
    if (typeof Renderer3D !== "undefined" && Renderer3D.active()) p = Renderer3D.pick(p.x, p.y);
    const spotIndex = Game.hitTestBuildSpot(p.x, p.y);
    if (spotIndex === -1) { this._hideTowerPicker(); return; }
    const occupied = Game.run.towers.some((t) => t.spotIndex === spotIndex);
    if (occupied) this._showUpgradePanel(spotIndex, ev.clientX, ev.clientY);
    else this._showTowerPicker(spotIndex, ev.clientX, ev.clientY);
  },

  _positionPicker(clientX, clientY) {
    const picker = this.els.towerPicker;
    const stageRect = this.els.canvas.parentElement.getBoundingClientRect();
    const margin = 8;
    picker.style.transform = "none";
    picker.classList.remove("hidden");
    const w = picker.offsetWidth;
    const h = picker.offsetHeight;
    const tapX = clientX - stageRect.left;
    const tapY = clientY - stageRect.top;
    let left = tapX - w / 2;
    let top = tapY - h - 14;
    if (top < margin) top = tapY + 24;
    left = Math.max(margin, Math.min(left, stageRect.width - w - margin));
    top = Math.max(margin, Math.min(top, stageRect.height - h - margin));
    picker.style.left = left + "px";
    picker.style.top = top + "px";
  },

  _dmgTypeLabel(type) {
    return type === "magic" ? "🔮 Phép" : type === "true" ? "💠 Chuẩn" : "⚔ Vật lý";
  },
  _roleLabel(role) {
    switch (role) {
      case "aoe": return "Diện rộng";
      case "control": return "Khống chế";
      case "support": return "Hỗ trợ";
      case "siege": return "Công thành";
      default: return "Sát thương";
    }
  },
  _effectLabel(eff) {
    if (!eff) return "";
    const meta = STATUS_META[eff.type];
    if (!meta) return "";
    const val = eff.type === "slow" ? Math.round(eff.value * 100) + "%" : eff.value;
    return `${meta.icon} ${meta.name} ${val} · ${eff.duration}s`;
  },

  /* ---------------- BẢNG CHỌN THÁP ---------------- */
  _showTowerPicker(spotIndex, clientX, clientY) {
    this._pickerMode = "build";
    this.selectedSpot = spotIndex;
    Game.selectedSpotIndex = -1;
    const picker = this.els.towerPicker;
    picker.innerHTML = `
      <div class="picker-header"><span>Chọn Tháp · 🪙 ${Game.run.gold}</span><button class="picker-close" data-act="close-picker">✕</button></div>
      <div class="picker-grid"></div>`;
    const grid = picker.querySelector(".picker-grid");

    for (const typeId in GAME_DATA.towerTypes) {
      const def = GAME_DATA.towerTypes[typeId];
      const canAfford = Game.run.gold >= def.cost;
      const dps = def.isSupport ? 0 : Math.round(def.damage * def.fireRate);
      const opt = document.createElement("div");
      opt.className = "tower-option" + (canAfford ? "" : " disabled");
      opt.setAttribute("data-tip", `${def.description || ""}`);
      opt.innerHTML = `<span class="t-icon">${def.icon}</span>
                        <span class="t-name">${def.name}</span>
                        <span class="t-role">${this._roleLabel(def.role)} · ${this._dmgTypeLabel(def.damageType)}</span>
                        <span class="t-stats">${def.isSupport
                          ? `HÀO QUANG +${Math.round((def.auraDamageBonus || 0) * 100)}% ST<br>+${Math.round((def.auraFireRateBonus || 0) * 100)}% TĐ · TẦM ${Math.round(def.range)}`
                          : `DMG ${Math.round(def.damage)} · DPS ~${dps}<br>TẦM ${Math.round(def.range)} · TĐ ${def.fireRate}/s`}</span>
                        <span class="t-cost">${def.cost} 🪙</span>`;
      opt.addEventListener("click", (evt) => {
        evt.stopPropagation();
        if (!canAfford) { this.showToast("Không đủ vàng!"); return; }
        Game.buildTower(spotIndex, typeId);
        this._hideTowerPicker();
      });
      grid.appendChild(opt);
    }
    this._positionPicker(clientX, clientY);
  },

  /* ---------------- BẢNG THÔNG TIN / NÂNG CẤP THÁP ---------------- */
  _showUpgradePanel(spotIndex, clientX, clientY) {
    this._pickerMode = "upgrade";
    this.selectedSpot = spotIndex;
    Game.selectedSpotIndex = spotIndex; // để game.js vẽ vòng tầm bắn của tháp này
    const tower = Game.towerAt(spotIndex);
    if (!tower) return;
    const picker = this.els.towerPicker;
    const branch = tower.branch();
    const eff = tower.effectiveEffect();
    const dps = tower.isSupport ? 0 : Math.round(tower.effectiveDamage() * tower.effectiveFireRate());
    const sell = tower.sellValue();

    const statRows = tower.isSupport
      ? [
          ["Hào quang ST", "+" + Math.round(tower.auraOutput().damage * 100) + "%"],
          ["Hào quang tốc bắn", "+" + Math.round(tower.auraOutput().fireRate * 100) + "%"],
          ["Bán kính", Math.round(tower.effectiveRange())],
        ]
      : [
          ["Sát thương", Math.round(tower.effectiveDamage()) + " (" + this._dmgTypeLabel(tower.damageType()) + ")"],
          ["Tốc độ đánh", tower.effectiveFireRate().toFixed(2) + "/s"],
          ["DPS ước tính", "~" + dps],
          ["Tầm bắn", Math.round(tower.effectiveRange())],
          ["Chí mạng", Math.round(tower.effectiveCritChance()) + "% (×" + tower.effectiveCritMultiplier().toFixed(1) + ")"],
          ["Xuyên giáp", Math.round(tower.effectiveArmorPen()) + "%"],
        ];
    if (tower.effectiveSplash() > 0) statRows.push(["Bán kính nổ", Math.round(tower.effectiveSplash())]);
    if (eff) statRows.push(["Hiệu ứng", this._effectLabel(eff)]);

    const cost = tower.nextUpgradeCost();
    const needBranch = tower.needsBranchChoice();

    picker.innerHTML = `
      <div class="picker-header">
        <span>${tower.def.icon} ${tower.def.name} · Lv${tower.level}/${tower.maxLevel}${branch ? " · " + branch.icon + " " + branch.name : ""}</span>
        <button class="picker-close" data-act="close-picker">✕</button>
      </div>
      <div class="upgrade-panel">
        <div class="stat-table">
          ${statRows.map((r) => `<div class="stat-row"><span>${r[0]}</span><b>${r[1]}</b></div>`).join("")}
        </div>
        <div class="priority-box">
          <div class="priority-title">🎯 Ưu tiên mục tiêu</div>
          <div class="priority-list">
            ${TARGET_PRIORITIES.map((p) => `<button class="prio-btn${tower.targetPriority === p.id ? " active" : ""}" data-prio="${p.id}" data-tip="${p.hint}">${p.icon} ${p.name}</button>`).join("")}
          </div>
        </div>
        <div class="upgrade-actions"></div>
        <button class="btn btn-small btn-danger btn-sell" data-act="sell" data-tip="Hoàn lại ${Math.round(((GAME_DATA.config.sellRefundRate !== undefined ? GAME_DATA.config.sellRefundRate : 0.7)) * 100)}% tổng vốn đã bỏ ra (${tower.totalInvested} 🪙)">
          💰 Bán tháp (+${sell} 🪙)
        </button>
      </div>`;

    const actions = picker.querySelector(".upgrade-actions");
    if (cost === null) {
      actions.innerHTML = `<div class="upgrade-maxed">★ Đã đạt cấp tối đa</div>`;
    } else if (needBranch) {
      actions.innerHTML = `<div class="branch-title">⚔ Chọn hướng phát triển (${cost} 🪙)</div>`;
      const wrap = document.createElement("div");
      wrap.className = "branch-list";
      for (const b of tower.availableBranches()) {
        const btn = document.createElement("button");
        btn.className = "branch-btn";
        btn.disabled = Game.run.gold < cost;
        btn.setAttribute("data-tip", b.description || "");
        btn.innerHTML = `<span class="branch-icon">${b.icon || "★"}</span>
                         <span class="branch-name">${b.name}</span>
                         <span class="branch-desc">${b.description || ""}</span>`;
        btn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          if (Game.chooseBranch(spotIndex, b.id)) this._showUpgradePanel(spotIndex, clientX, clientY);
          else this.showToast("Không đủ vàng!");
        });
        wrap.appendChild(btn);
      }
      actions.appendChild(wrap);
    } else {
      const btn = document.createElement("button");
      btn.className = "btn btn-small btn-primary";
      btn.textContent = `⬆ Nâng cấp Lv${tower.level + 1} (${cost} 🪙)`;
      btn.disabled = Game.run.gold < cost;
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        if (Game.upgradeTower(spotIndex)) this._showUpgradePanel(spotIndex, clientX, clientY);
        else this.showToast("Không đủ vàng!");
      });
      actions.appendChild(btn);
    }

    picker.querySelectorAll("[data-prio]").forEach((btn) => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        Game.setTowerPriority(spotIndex, btn.getAttribute("data-prio"));
        this._showUpgradePanel(spotIndex, clientX, clientY);
      });
    });
    const sellBtn = picker.querySelector('[data-act="sell"]');
    if (sellBtn) {
      sellBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const refund = Game.sellTower(spotIndex);
        if (refund) this.showToast(`Đã bán tháp, hoàn lại ${refund} 🪙`);
        this._hideTowerPicker();
      });
    }

    this._positionPicker(clientX, clientY);
  },

  _hideTowerPicker() {
    this.els.towerPicker.classList.add("hidden");
    this.selectedSpot = -1;
    Game.selectedSpotIndex = -1;
  },
};
