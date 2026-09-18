/* =========================================================
   UI.JS  (Giai đoạn 2)
   Điều hướng màn hình, cập nhật HUD, xử lý thao tác chạm/click.
   Không chứa logic tính toán trận đấu (nằm ở game.js).

   MỚI SO VỚI PHIÊN BẢN 1:
   - Màn hình chọn Màn chơi (nhiều stage thay vì chỉ Hoa Lư).
   - Màn hình Tướng: mở khoá / chọn tướng chỉ huy trước khi vào trận.
   - Màn hình Nhiệm vụ: xem tiến độ & nhận thưởng.
   - Nút Kỹ năng trong HUD (kèm hiển thị thời gian hồi).
   - Bấm vào ô đã có quân thủ thành để NÂNG CẤP thay vì bị bỏ qua.
   - Toast thông báo (vd. hoàn thành nhiệm vụ).
   ========================================================= */

const UI = {
  els: {},
  selectedSpot: -1,
  _hudTimer: null,
  _pendingStageId: null, // stage đang chờ chọn tướng để vào trận
  _pickerMode: "build", // "build" | "upgrade"

  init() {
    this.els = {
      splash: document.getElementById("screen-splash"),
      menu: document.getElementById("screen-menu"),
      guide: document.getElementById("screen-guide"),
      settings: document.getElementById("screen-settings"),
      levels: document.getElementById("screen-levels"),
      heroes: document.getElementById("screen-heroes"),
      quests: document.getElementById("screen-quests"),
      game: document.getElementById("screen-game"),

      btnStart: document.getElementById("btn-start"),
      btnContinue: document.getElementById("btn-continue"),
      btnGuide: document.getElementById("btn-guide"),
      btnSettings: document.getElementById("btn-settings"),
      btnMenuHeroes: document.getElementById("btn-menu-heroes"),
      btnMenuQuests: document.getElementById("btn-menu-quests"),
      btnGuideBack: document.getElementById("btn-guide-back"),
      btnSettingsBack: document.getElementById("btn-settings-back"),
      btnToggleSound: document.getElementById("btn-toggle-sound"),
      btnResetProgress: document.getElementById("btn-reset-progress"),

      levelList: document.getElementById("level-list"),
      btnLevelsBack: document.getElementById("btn-levels-back"),

      heroList: document.getElementById("hero-list"),
      heroGold: document.getElementById("hero-gold"),
      heroExp: document.getElementById("hero-exp"),
      btnHeroesBack: document.getElementById("btn-heroes-back"),
      btnHeroesStart: document.getElementById("btn-heroes-start"),

      questList: document.getElementById("quest-list"),
      btnQuestsBack: document.getElementById("btn-quests-back"),
      btnMenuAchievements: document.getElementById("btn-menu-achievements"),
      achievementList: document.getElementById("achievement-list"),
      achievementsProgress: document.getElementById("achievements-progress"),
      btnAchievementsBack: document.getElementById("btn-achievements-back"),

      hudGold: document.getElementById("hud-gold"),
      hudHp: document.getElementById("hud-hp"),
      hudScore: document.getElementById("hud-score"),
      hudTide: document.getElementById("hud-tide"),
      hudTideLabel: document.getElementById("hud-tide-label"),
      hudWave: document.getElementById("hud-wave"),
      comboBadge: document.getElementById("combo-badge"),
      btnSpeed: document.getElementById("btn-speed"),
      btnSkill: document.getElementById("btn-skill"),
      btnPause: document.getElementById("btn-pause"),
      btnExit: document.getElementById("btn-exit"),
      btnStartWave: document.getElementById("btn-start-wave"),

      bossBar: document.getElementById("boss-bar"),
      bossBarIcon: document.getElementById("boss-bar-icon"),
      bossBarName: document.getElementById("boss-bar-name"),
      bossBarPhase: document.getElementById("boss-bar-phase"),
      bossBarFill: document.getElementById("boss-bar-fill"),
      bossBarHp: document.getElementById("boss-bar-hp"),

      canvas: document.getElementById("game-canvas"),
      towerPicker: document.getElementById("tower-picker"),
      toastContainer: document.getElementById("toast-container"),

      overlayResult: document.getElementById("overlay-result"),
      overlayTitle: document.getElementById("overlay-title"),
      overlayStars: document.getElementById("overlay-stars"),
      overlayDesc: document.getElementById("overlay-desc"),
      overlayStats: document.getElementById("overlay-stats"),
      btnResultRetry: document.getElementById("btn-result-retry"),
      btnResultNext: document.getElementById("btn-result-next"),
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

    e.btnStart.addEventListener("click", () => {
      this._pendingStageId = null;
      this.showScreen("levels");
    });
    e.btnContinue.addEventListener("click", () => this.continueGame());
    e.btnGuide.addEventListener("click", () => this.showScreen("guide"));
    e.btnSettings.addEventListener("click", () => this.showScreen("settings"));
    e.btnMenuHeroes.addEventListener("click", () => {
      this._pendingStageId = null;
      this.showScreen("heroes");
    });
    e.btnMenuQuests.addEventListener("click", () => this.showScreen("quests"));
    e.btnMenuAchievements.addEventListener("click", () => this.showScreen("achievements"));
    e.btnAchievementsBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnGuideBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnSettingsBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnLevelsBack.addEventListener("click", () => this.showScreen("menu"));
    e.btnHeroesBack.addEventListener("click", () => this.showScreen(this._pendingStageId ? "levels" : "menu"));
    e.btnQuestsBack.addEventListener("click", () => this.showScreen("menu"));

    e.btnToggleSound.addEventListener("click", () => {
      GameState.progress.settings.sound = !GameState.progress.settings.sound;
      GameState.saveProgress();
      SoundManager.setEnabled(GameState.progress.settings.sound);
      if (GameState.progress.settings.sound) SoundManager.play("button"); // phản hồi ngay khi vừa BẬT lại
      this._refreshSettingsButtons();
    });
    e.btnResetProgress.addEventListener("click", () => {
      if (confirm("Xoá toàn bộ tiến trình đã lưu?")) {
        GameState.resetProgress();
        this._refreshMenuButtons();
        this._refreshSettingsButtons();
      }
    });

    e.btnHeroesStart.addEventListener("click", () => {
      if (!this._pendingStageId) return;
      this._startStage(this._pendingStageId);
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

    e.btnSkill.addEventListener("click", () => {
      if (!Game.run || !Game.run.skillDef) return;
      const ok = Game.useSkill();
      if (!ok && Game.run.skillCooldownRemaining > 0) {
        this.showToast("Kỹ năng đang hồi (" + Math.ceil(Game.run.skillCooldownRemaining) + "s)");
      }
    });

    e.btnPause.addEventListener("click", () => this.openPause());
    e.btnResume.addEventListener("click", () => this.closePause());
    e.btnPauseMenu.addEventListener("click", () => this.exitToMenu());
    e.btnExit.addEventListener("click", () => this.exitToMenu());

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
      if (!e.towerPicker.contains(ev.target) && ev.target !== e.canvas) {
        this._hideTowerPicker();
      }
    });
    // Nút đóng (✕) trên header của Tower Picker/Upgrade Panel - cần thiết
    // nhất ở kiểu bottom sheet trên mobile, nơi bấm ra ngoài không phải
    // lúc nào cũng dễ (mục XLIII).
    e.towerPicker.addEventListener("click", (ev) => {
      if (ev.target.closest('[data-act="close-picker"]')) this._hideTowerPicker();
    });
  },

  /* ---------------- ĐIỀU HƯỚNG MÀN HÌNH ---------------- */
  showScreen(name) {
    for (const key of ["splash", "menu", "guide", "settings", "levels", "heroes", "quests", "game"]) {
      this.els[key].classList.toggle("active", key === name);
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
    this.els.btnToggleSound.textContent = GameState.progress.settings.sound ? "Bật" : "Tắt";
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
    for (const stage of stages) {
      const isUnlocked = unlocked.includes(stage.id);
      const best = (GameState.progress.bestWave || {})[stage.id] || 0;
      const bestStars = (GameState.progress.stageStars || {})[stage.id] || 0;
      const bestScore = (GameState.progress.bestScore || {})[stage.id] || 0;
      const starsLine = bestStars > 0
        ? `<span>${"⭐".repeat(bestStars)}${"☆".repeat(3 - bestStars)} · ${bestScore.toLocaleString("vi-VN")} điểm</span>`
        : "";
      const card = document.createElement("div");
      card.className = "level-card" + (isUnlocked ? "" : " locked");
      card.innerHTML = `
        <div class="level-card-head">
          <span class="level-name">${stage.name}</span>
          <span class="level-diff">${"★".repeat(stage.difficulty || 1)}</span>
        </div>
        <p class="level-desc">${stage.description || ""}</p>
        <div class="level-meta">
          <span>${stage.waves.length} đợt</span>
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
      const expBar = owned
        ? `<div class="hero-exp-row">
             <div class="hero-exp-track"><div class="hero-exp-fill" style="width:${expPct}%"></div></div>
             <span class="hero-exp-label">${level >= maxLevel ? "MAX" : `${heroExp}/${expNeeded} EXP`}</span>
           </div>`
        : "";
      const card = document.createElement("div");
      card.className = "hero-card" + (selected ? " selected" : "");
      card.innerHTML = `
        <div class="hero-icon">${hero.icon || "🧑"}</div>
        <div class="hero-info">
          <div class="hero-name">${hero.nameVi || hero.name} ${owned ? `<span class="hero-level">Lv${level}</span>` : ""}</div>
          <p class="hero-desc">${hero.description || ""}</p>
          <div class="hero-stats">
            <span>+${hero.hp} HP thành</span>
            <span>+${hero.damage}% ST tháp</span>
            <span>-${hero.defense} ST nhận</span>
          </div>
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
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._unlockHero(hero.id, hero.unlockCost || 0);
        });
        actionEl.appendChild(btn);
      } else if (selected) {
        const badge = document.createElement("span");
        badge.className = "hero-selected-badge";
        badge.textContent = "Đang chọn";
        actionEl.appendChild(badge);
      } else {
        const btn = document.createElement("button");
        btn.className = "btn btn-small btn-primary";
        btn.textContent = "Chọn";
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this._selectHero(hero.id);
        });
        actionEl.appendChild(btn);
      }
      container.appendChild(card);
    }
  },

  _unlockHero(heroId, cost) {
    const player = GameState.getPlayer();
    if (player.gold < cost) return;
    const heroesOwned = [...(player.heroesOwned || []), heroId];
    const heroLevels = Object.assign({}, player.heroLevels, { [heroId]: 1 });
    DataService.update("players", player.id, {
      gold: player.gold - cost,
      heroesOwned,
      heroLevels,
    });
    this.showToast("Đã mở khoá tướng!");
    this._renderHeroList();
  },

  _selectHero(heroId) {
    const player = GameState.getPlayer();
    DataService.update("players", player.id, { selectedHero: heroId });
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
          if (res.ok) {
            this.showToast("Đã nhận thưởng!");
            this._renderQuestList();
          }
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

  /* Thành tích (mục XXX) - mở khoá là có thưởng luôn, khác Quest. */
  onAchievementsUnlocked(achievements) {
    if (!achievements || !achievements.length) return;
    for (const a of achievements) this.showToast(`🏆 Đã mở khoá: ${a.icon || ""} ${a.name}!`);
  },

  /* ---------------- TOAST ---------------- */
  showToast(message) {
    const container = this.els.toastContainer;
    if (!container) return;
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
    if (Game.run.skillDef) this.els.btnSkill.textContent = Game.run.skillDef.icon || "✨";
    this._maybeShowTutorial();
    this._startHudLoop();
  },

  _maybeShowTutorial() {
    const cfg = GAME_DATA.config.features || {};
    const player = GameState.getPlayer();
    if (!cfg.tutorialEnabled || !player || player.settings.tutorialSeen) return;
    this.showToast("Mẹo: chạm ô đất trống để xây quân, bấm \"Bắt đầu đợt\" khi đã sẵn sàng!");
    DataService.update("players", player.id, { settings: Object.assign({}, player.settings, { tutorialSeen: true }) });
  },

  continueGame() {
    const snap = GameState.loadRunSnapshot();
    if (!snap) { this.showScreen("levels"); return; }
    Game.loadRun(snap);
    this._enterGameScreen();
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
    this.els.hudScore.textContent = Math.round(r.score);
    if (this.els.hudTide) {
      const isTideMap = Game.levelDef && Game.levelDef.specialMechanic === "tide";
      this.els.hudTide.classList.toggle("hidden", !isTideMap);
    }
    const waveShown = Math.max(0, r.waveIndex + 1);
    this.els.hudWave.textContent = `${waveShown}/${r.totalWaves}`;
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

  /* ---------------- THANH MÁU BOSS (mục XVII) ---------------- */
  _updateBossBar() {
    const r = Game.run;
    const bar = this.els.bossBar;
    if (!r || !bar) return;
    const boss = r.enemies.find((e) => e.isBoss && e.alive);
    if (!boss) {
      bar.classList.add("hidden");
      this._bossBarShownId = null;
      return;
    }
    bar.classList.remove("hidden");
    this.els.bossBarIcon.textContent = boss.def.icon || "👹";
    this.els.bossBarName.textContent = boss.def.name;
    const pct = Math.max(0, boss.hp / boss.maxHp) * 100;
    this.els.bossBarFill.style.width = pct.toFixed(1) + "%";
    this.els.bossBarHp.textContent = `${Math.max(0, Math.round(boss.hp))} / ${boss.maxHp} HP`;
    this.els.bossBarPhase.textContent = boss.currentPhase ? boss.currentPhase.name : "";
    bar.classList.toggle("boss-bar-enrage", !!(boss.currentPhase && boss.currentPhase.enrage));
    this._bossBarShownId = boss.id;
  },

  /* ---------------- COMBO (mục XXVI) ---------------- */
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

  /* Boss đổi phase (vd. 60% -> "Mạnh hơn", 30% -> "Cuồng nộ"): cảnh báo
     bằng Toast + flash nhẹ thanh máu Boss, không rung màn hình mạnh để
     tránh khó chịu trên di động (mục XXXVI). */
  onBossPhaseChanged(boss, phase) {
    const bar = this.els.bossBar;
    if (bar) {
      bar.classList.remove("boss-bar-flash");
      void bar.offsetWidth; // ép trình duyệt reset animation để có thể phát lại
      bar.classList.add("boss-bar-flash");
    }
    if (phase && phase.enrage) {
      this.showToast(`⚠ ${boss.def.name} CUỒNG NỘ!`);
    } else if (phase) {
      this.showToast(`${boss.def.name} bước sang giai đoạn: ${phase.name}`);
    }
  },

  onBossAbilityUsed(boss, ability) {
    this.showToast(`${boss.def.name} dùng chiêu: ${ability.name}!`);
  },

  onHeroLeveledUp(heroId, level) {
    const hero = GAME_DATA.generals && GAME_DATA.generals[heroId];
    this.showToast(`🎉 ${hero ? (hero.nameVi || hero.name) : "Tướng"} đã lên Lv${level}!`);
  },

  /* Tide Mechanic (mục VI, riêng cho Bạch Đằng) */
  onTideChanged(isHighTide) {
    if (this.els.hudTideLabel) this.els.hudTideLabel.textContent = isHighTide ? "Triều dâng (chậm)" : "Triều rút (nhanh)";
    if (this.els.hudTide) this.els.hudTide.classList.toggle("hud-tide-high", isHighTide);
    this.showToast(isHighTide ? "🌊 Triều dâng! Quân địch di chuyển chậm lại." : "🌊 Triều rút! Quân địch di chuyển nhanh hơn.");
  },

  onWaveCleared() {
    this.els.btnStartWave.disabled = false;
  },

  onGameEnded(won, stats) {
    this._stopHudLoop();
    if (this.els.bossBar) this.els.bossBar.classList.add("hidden");
    if (this.els.comboBadge) this.els.comboBadge.classList.add("hidden");
    this.els.overlayTitle.textContent = won ? "🏆 CHIẾN THẮNG" : "💀 THÀNH ĐÃ THẤT THỦ";

    const s = stats || {};
    // Sao (mục V/LIII) - chỉ hiện khi thắng
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
      ? ((s.stars || 0) >= 3 ? "HOÀN HẢO! Đại Cồ Việt vững vàng dưới sự bảo vệ của các anh hùng." : "Đại Cồ Việt vững vàng dưới sự bảo vệ của các anh hùng.")
      : "Quân địch đã tràn vào thành. Hãy thử lại!";

    // Thống kê thật của trận (mục LIII/LIV) - không phải số giả
    if (this.els.overlayStats) {
      const mm = Math.floor((s.elapsedTime || 0) / 60);
      const ss = String((s.elapsedTime || 0) % 60).padStart(2, "0");
      const rows = [
        `<span>⚔ Score</span><strong>${(s.score || 0).toLocaleString("vi-VN")}</strong>`,
        `<span>💀 Enemy tiêu diệt</span><strong>${s.killCount || 0}</strong>`,
        `<span>👹 Boss</span><strong>${s.bossKillCount || 0}</strong>`,
        `<span>🔥 Combo cao nhất</span><strong>x${s.maxCombo || 0}</strong>`,
        `<span>🎯 Chí mạng</span><strong>${s.critCount || 0}</strong>`,
        `<span>⏱ Thời gian</span><strong>${mm}:${ss}</strong>`,
      ];
      if (!won) {
        rows.push(`<span class="overlay-tip">Gợi ý: nâng cấp tháp, dùng thêm tháp diện rộng, hoặc chọn tướng phòng thủ.</span>`);
      }
      this.els.overlayStats.innerHTML = rows.map((r) => `<div class="overlay-stat-row">${r}</div>`).join("");
    }

    // Nút "Màn tiếp theo" - chỉ hiện khi thắng và còn màn kế mở được
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
      dispH = rect.height;
      dispW = dispH * contentRatio;
      offX = (rect.width - dispW) / 2;
      offY = 0;
    } else {
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
    if (occupied) {
      this._showUpgradePanel(spotIndex, ev.clientX, ev.clientY);
    } else {
      this._showTowerPicker(spotIndex, ev.clientX, ev.clientY);
    }
  },

  /* Định vị bộ chọn quân / bảng nâng cấp NGAY TRONG khung màn chơi, không
     bao giờ để lọt ra ngoài viewport hay bị vỡ khung (mục XLIII).
     Phải đo kích thước THẬT sau khi đã có nội dung (gọi hàm này SAU khi
     dựng xong innerHTML), vì đo lúc còn "hidden" hoặc rỗng sẽ luôn ra 0x0
     và làm phép kẹp mép vô nghĩa. */
  _positionPicker(clientX, clientY) {
    const picker = this.els.towerPicker;
    const stageRect = this.els.canvas.parentElement.getBoundingClientRect();
    const margin = 8;

    picker.style.transform = "none"; // JS tự tính left/top, không dựa vào transform cố định nữa
    picker.classList.remove("hidden");
    const w = picker.offsetWidth;
    const h = picker.offsetHeight;

    const tapX = clientX - stageRect.left;
    const tapY = clientY - stageRect.top;

    let left = tapX - w / 2;
    let top = tapY - h - 14; // mặc định hiện phía TRÊN điểm chạm

    if (top < margin) {
      // Sát mép trên (build spot gần đỉnh màn hình) -> hiện phía DƯỚI thay vì bị cắt đầu.
      top = tapY + 24;
    }

    left = Math.max(margin, Math.min(left, stageRect.width - w - margin));
    top = Math.max(margin, Math.min(top, stageRect.height - h - margin));

    picker.style.left = left + "px";
    picker.style.top = top + "px";
  },

  _showTowerPicker(spotIndex, clientX, clientY) {
    this._pickerMode = "build";
    this.selectedSpot = spotIndex;
    const picker = this.els.towerPicker;
    picker.innerHTML = `
      <div class="picker-header"><span>Chọn Tháp</span><button class="picker-close" data-act="close-picker">✕</button></div>
      <div class="picker-grid"></div>`;
    const grid = picker.querySelector(".picker-grid");

    for (const typeId in GAME_DATA.towerTypes) {
      const def = GAME_DATA.towerTypes[typeId];
      const canAfford = Game.run.gold >= def.cost;
      const opt = document.createElement("div");
      opt.className = "tower-option" + (canAfford ? "" : " disabled");
      opt.innerHTML = `<span class="t-icon">${def.icon}</span>
                        <span class="t-name">${def.name}</span>
                        <span class="t-stats">DMG ${Math.round(def.damage)}<br>TẦM ${Math.round(def.range)} · TĐ ${def.fireRate}</span>
                        <span class="t-cost">${def.cost} 🪙</span>`;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!canAfford) return;
        Game.buildTower(spotIndex, typeId);
        this._hideTowerPicker();
      });
      grid.appendChild(opt);
    }
    this._positionPicker(clientX, clientY);
  },

  _showUpgradePanel(spotIndex, clientX, clientY) {
    this._pickerMode = "upgrade";
    this.selectedSpot = spotIndex;
    const tower = Game.run.towers.find(t => t.spotIndex === spotIndex);
    if (!tower) return;
    const picker = this.els.towerPicker;
    picker.innerHTML = `
      <div class="picker-header"><span>Nâng cấp Tháp</span><button class="picker-close" data-act="close-picker">✕</button></div>`;

    const cost = tower.nextUpgradeCost();
    const info = document.createElement("div");
    info.className = "upgrade-panel";
    if (cost === null) {
      info.innerHTML = `
        <div class="t-name">${tower.def.name} · Lv${tower.level}</div>
        <div class="upgrade-maxed">Đã đạt cấp tối đa</div>`;
    } else {
      const canAfford = Game.run.gold >= cost;
      const critLine = tower.def.criticalChance
        ? `<div class="upgrade-stats">Chí mạng ${tower.def.criticalChance}% (×${tower.def.criticalMultiplier})</div>`
        : "";
      info.innerHTML = `
        <div class="t-name">${tower.def.name} · Lv${tower.level}</div>
        <div class="upgrade-stats">DMG ${Math.round(tower.effectiveDamage())} · Tầm ${Math.round(tower.effectiveRange())}</div>
        ${critLine}
        <button class="btn btn-small btn-primary" id="btn-do-upgrade" ${canAfford ? "" : "disabled"}>
          Nâng cấp (${cost} 🪙)
        </button>`;
    }
    picker.appendChild(info);
    const upgradeBtn = picker.querySelector("#btn-do-upgrade");
    if (upgradeBtn) {
      upgradeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        Game.upgradeTower(spotIndex);
        this._hideTowerPicker();
      });
    }
    this._positionPicker(clientX, clientY);
  },

  _hideTowerPicker() {
    this.els.towerPicker.classList.add("hidden");
    this.selectedSpot = -1;
  },
};
