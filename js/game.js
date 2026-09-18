/* =========================================================
   GAME.JS  (Giai đoạn 2)
   Vòng lặp chính, vẽ bản đồ, sinh quân địch, xử lý xây quân
   thủ thành, thắng/thua, tốc độ game. Đọc dữ liệu từ GAME_DATA
   (được DataService dựng lại từ dữ liệu Admin), thao tác thực thể
   từ entities.js, đọc/ghi qua state.js.

   MỚI SO VỚI PHIÊN BẢN 1:
   - Tướng chỉ huy (hero): cộng máu thành, cộng % sát thương tháp,
     giảm sát thương thành nhận, và mở khoá 1 kỹ năng chủ động.
   - Kỹ năng chủ động (skill) có thể kích hoạt trong trận qua nút HUD.
   - Boss xuất hiện ở đợt cuối của mỗi màn (waves[].groups có thể có
     { boss: bossId } thay vì { type, count, interval }).
   - Nâng cấp tháp (Tower.upgrade) ngay trong trận bằng vàng của trận.
   - Nhiệm vụ (QuestService) được đánh giá sau mỗi đợt/màn/hạ Boss.
   - Cấu hình Admin (ENEMY_SPAWN_RATE, REWARD_MULTIPLIER, debugMode,
     showDamageNumbers, showEnemyHpBar, showFps, autoSaveEnabled)
     thực sự ảnh hưởng tới vòng lặp và cách vẽ.
   ========================================================= */

/* Hằng số Score/Combo (Giai đoạn 3, Priority 5). Giữ dạng code constant
   thay vì thêm field Admin ở bước này để tránh phình schema/migration
   quá mức trong 1 lượt - có thể chuyển vào GAME_DATA.config sau nếu cần
   Admin tinh chỉnh cân bằng điểm số. */
const SCORE_RULES = {
  KILL_BASE: 5,
  KILL_REWARD_MULT: 1.5,   // điểm = KILL_BASE + reward vàng * hệ số này
  CRIT_BONUS: 10,
  BOSS_KILL_BONUS: 400,
  WAVE_CLEAR_BONUS: 50,
  COMBO_WINDOW: 2.2,       // giây không giết thêm địch thì combo reset
  COMBO_SCORE_PER_STACK: 2,
  COMBO_SCORE_CAP_STACK: 20,
  REMAINING_HP_BONUS_MAX: 200,
  SPEED_BONUS: 150,
  NO_DAMAGE_BONUS: 250,
};

const Game = {
  canvas: null,
  ctx: null,
  levelDef: null,

  /* Phát âm thanh an toàn: nếu js/sound-manager.js không tải được (lỗi
     mạng, bị chặn, môi trường không có Web Audio) thì game vẫn chạy bình
     thường, chỉ là im lặng - không bao giờ để âm thanh làm vỡ gameplay. */
  _sfx(name) {
    if (typeof SoundManager !== "undefined") SoundManager.play(name);
  },

  /* trạng thái ván đấu hiện tại */
  run: null,

  _rafId: null,
  _lastTs: 0,
  _fpsSamples: [],

  /* ---------------- KHỞI TẠO ---------------- */
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    Enemy.onHit = (x, y, amount, isCritical) => {
      const cfg = GAME_DATA.config.features || {};
      if (!this.run) return;
      if (isCritical) {
        this.run.critCount++;
        this.run.score += SCORE_RULES.CRIT_BONUS;
        this._sfx("critical");
      } else {
        this._sfx("hit");
      }
      if (cfg.showDamageNumbers === false) return;
      EffectManager.spawnDamageNumber(x, y, amount, isCritical);
    };
    Enemy.onBossEvent = (enemy, event) => {
      if (!this.run) return;
      if (event.type === "phase_change") {
        EffectManager.spawnSpark(enemy.x, enemy.y, event.phase && event.phase.enrage ? "#ff5c3d" : "#e8c873", 14);
        this._sfx("boss");
        EffectManager.shake(3, 0.28);
        if (UI.onBossPhaseChanged) UI.onBossPhaseChanged(enemy, event.phase);
      } else if (event.type === "ability_used") {
        EffectManager.spawnSpark(enemy.x, enemy.y, "#e8c873", 10);
        this._sfx("skill");
        EffectManager.shake(2.5, 0.22);
        if (UI.onBossAbilityUsed) UI.onBossAbilityUsed(enemy, event.ability);
      }
    };
  },

  _heroBonuses(heroId) {
    const heroDef = heroId && GAME_DATA.generals[heroId];
    if (!heroDef) {
      return { hpBonus: 0, damagePct: 0, defenseFlat: 0, skillDef: null, heroDef: null };
    }
    const player = GameState.getPlayer();
    const level = (player && player.heroLevels && player.heroLevels[heroId]) || heroDef.level || 1;
    const scale = 1 + 0.1 * (level - 1);
    return {
      hpBonus: Math.round((heroDef.hp || 0) * scale),
      damagePct: (heroDef.damage || 0) * scale,
      defenseFlat: Math.round((heroDef.defense || 0) * scale),
      skillDef: heroDef.skillId ? GAME_DATA.skills[heroDef.skillId] : null,
      heroDef,
      level,
    };
  },

  /* Bắt đầu một ván mới ở màn levelId, với tướng heroId (tuỳ chọn) */
  newRun(levelId, heroId) {
    rebuildGameData(); // luôn lấy dữ liệu mới nhất từ Admin trước khi vào trận
    EffectManager.reset();
    const levelDef = GAME_DATA.levels[levelId];
    this.levelDef = levelDef;
    const config = GAME_DATA.config;
    const player = GameState.getPlayer();
    const chosenHero = heroId || (player && player.selectedHero) || null;
    const bonus = this._heroBonuses(chosenHero);
    const maxHp = (config.startingHP || 20) + bonus.hpBonus;

    this.run = {
      levelId,
      heroId: chosenHero,
      gold: config.startingGold,
      hp: maxHp,
      maxHp,
      towerDamageMult: 1 + bonus.damagePct / 100,
      castleDefense: bonus.defenseFlat,
      skillDef: bonus.skillDef,
      heroLevel: bonus.level || 1,
      skillCooldownRemaining: 0,
      towerBuffRemaining: 0,
      towerBuffFireRateMult: 1,
      bossKilledThisRun: false,
      waveIndex: -1,
      totalWaves: levelDef.waves.length,
      status: "playing",
      speed: 1,
      paused: false,
      waveInProgress: false,
      spawnQueue: [],
      spawnTimer: 0,
      enemies: [],
      towers: [],
      projectiles: [],
      heroExpGained: 0,
      // Score/Combo/3-Sao (Giai đoạn 3, Priority 5)
      score: 0,
      combo: 0,
      comboTimer: 0,
      maxCombo: 0,
      critCount: 0,
      bossKillCount: 0,
      elapsedTime: 0,
      noDamageTaken: true,
      killCount: 0,
      // Wave Engine mở rộng (Giai đoạn 3, Priority 4): Special Wave + Tide
      waveGroupsTemplate: null,
      waveIsSurvival: false,
      waveSurviveTimer: 0,
      waveRewardBonus: 0,
      waveScoreBonus: 0,
      tidePhase: 0,
      _isHighTide: false,
    };
    this._startLoop();
  },

  /* Khôi phục ván đã lưu (Tiếp tục) */
  loadRun(snapshot) {
    rebuildGameData();
    EffectManager.reset();
    const levelDef = GAME_DATA.levels[snapshot.levelId];
    this.levelDef = levelDef;
    const bonus = this._heroBonuses(snapshot.heroId);
    this.run = Object.assign({}, snapshot, {
      towerDamageMult: 1 + bonus.damagePct / 100,
      castleDefense: bonus.defenseFlat,
      skillDef: bonus.skillDef,
      heroLevel: bonus.level || 1,
      skillCooldownRemaining: 0,
      towerBuffRemaining: 0,
      towerBuffFireRateMult: 1,
      bossKilledThisRun: false,
      enemies: [],
      projectiles: [],
      spawnQueue: [],
      spawnTimer: 0,
      waveInProgress: false,
      paused: false,
      towers: [],
      heroExpGained: snapshot.heroExpGained || 0,
      score: snapshot.score || 0,
      combo: 0, // combo không có ý nghĩa "tiếp tục" qua lần Continue - bắt đầu lại từ 0
      comboTimer: 0,
      maxCombo: snapshot.maxCombo || 0,
      critCount: snapshot.critCount || 0,
      bossKillCount: snapshot.bossKillCount || 0,
      elapsedTime: snapshot.elapsedTime || 0,
      noDamageTaken: snapshot.noDamageTaken !== false,
      killCount: snapshot.killCount || 0,
      waveGroupsTemplate: snapshot.waveGroupsTemplate || null,
      waveIsSurvival: !!snapshot.waveIsSurvival,
      waveSurviveTimer: snapshot.waveSurviveTimer || 0,
      waveRewardBonus: snapshot.waveRewardBonus || 0,
      waveScoreBonus: snapshot.waveScoreBonus || 0,
      tidePhase: snapshot.tidePhase || 0,
      _isHighTide: false,
    });
    for (const t of snapshot.towers || []) {
      const spot = levelDef.buildSpots[t.spotIndex];
      const tower = new Tower(t.typeId, spot.x, spot.y);
      tower.spotIndex = t.spotIndex;
      tower.level = t.level || 1;
      this.run.towers.push(tower);
    }
    this._startLoop();
  },

  /* Lấy dữ liệu rút gọn để lưu vào localStorage */
  snapshot() {
    if (!this.run) return null;
    const r = this.run;
    return {
      levelId: r.levelId,
      heroId: r.heroId,
      gold: r.gold,
      hp: r.hp,
      maxHp: r.maxHp,
      waveIndex: r.waveIndex,
      totalWaves: r.totalWaves,
      status: r.status,
      speed: r.speed,
      towers: r.towers.map(t => ({ spotIndex: t.spotIndex, typeId: t.typeId, level: t.level })),
      heroExpGained: r.heroExpGained,
      score: r.score,
      maxCombo: r.maxCombo,
      critCount: r.critCount,
      bossKillCount: r.bossKillCount,
      elapsedTime: r.elapsedTime,
      noDamageTaken: r.noDamageTaken,
      killCount: r.killCount,
      waveGroupsTemplate: r.waveGroupsTemplate,
      waveIsSurvival: r.waveIsSurvival,
      waveSurviveTimer: r.waveSurviveTimer,
      waveRewardBonus: r.waveRewardBonus,
      waveScoreBonus: r.waveScoreBonus,
      tidePhase: r.tidePhase,
    };
  },

  stopLoop() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  },

  _startLoop() {
    this.stopLoop();
    this._lastTs = performance.now();
    const loop = (ts) => {
      const dtReal = Math.min((ts - this._lastTs) / 1000, 0.05);
      this._trackFps(dtReal);
      this._lastTs = ts;
      if (this.run && !this.run.paused && this.run.status === "playing") {
        const dt = dtReal * this.run.speed;
        this.update(dt);
      }
      this.render();
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  },

  _trackFps(dtReal) {
    if (dtReal <= 0) return;
    this._fpsSamples.push(1 / dtReal);
    if (this._fpsSamples.length > 30) this._fpsSamples.shift();
  },
  currentFps() {
    if (!this._fpsSamples.length) return 0;
    return Math.round(this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length);
  },

  /* ---------------- CẬP NHẬT ---------------- */
  update(dt) {
    const r = this.run;
    const rewardMult = GAME_DATA.config.rewardMultiplier || 1;
    r.elapsedTime += dt;

    // đếm ngược Combo (mục XXVI): hết giờ mà không giết thêm địch -> reset
    if (r.comboTimer > 0) {
      r.comboTimer -= dt;
      if (r.comboTimer <= 0) { r.comboTimer = 0; r.combo = 0; }
    }

    // Tide Mechanic (mục VI) - CHỈ áp dụng cho map có specialMechanic:"tide"
    // (Bạch Đằng): triều dâng làm CHẬM toàn bộ địch đang có mặt, triều rút
    // làm NHANH hơn - áp dụng thật vào tốc độ di chuyển, không chỉ đổi màu nước.
    let mapSpeedMult = 1;
    if (this.levelDef.specialMechanic === "tide") {
      const cycle = GAME_DATA.config.tideCycleSeconds || 9;
      r.tidePhase = (r.tidePhase || 0) + dt;
      const isHighTide = Math.floor(r.tidePhase / cycle) % 2 === 0;
      mapSpeedMult = isHighTide ? 0.7 : 1.2;
      if (r._isHighTide !== isHighTide) {
        r._isHighTide = isHighTide;
        if (UI.onTideChanged) UI.onTideChanged(isHighTide);
      }
    }
    r.mapSpeedMult = mapSpeedMult;

    // sinh quân theo hàng đợi (Wave Engine mục XXIII - hỗ trợ delay phục
    // kích qua marker "wait", không phát sinh địch)
    if (r.spawnQueue.length > 0) {
      r.spawnTimer -= dt;
      if (r.spawnTimer <= 0) {
        const next = r.spawnQueue.shift();
        if (!next.wait) {
          r.enemies.push(new Enemy(next.type, this.levelDef.path, {
            speedMultiplier: next.speedMultiplier,
            hpMultiplier: next.hpMultiplier,
            elite: next.elite,
          }));
        }
        r.spawnTimer = next.interval;
      }
    } else if (r.waveIsSurvival && r.waveSurviveTimer > 0) {
      // SURVIVAL WAVE (mục XXIV): hết hàng đợi nhưng chưa hết giờ sống sót
      // -> tái sinh lại đúng cấu hình nhóm quân của đợt này.
      r.spawnQueue = this._buildSpawnQueue(r.waveGroupsTemplate);
    }

    // cập nhật địch
    for (const e of r.enemies) {
      e.update(dt, mapSpeedMult);
      if (e.reachedCastle) {
        const dmg = Math.max(0, e.getEffectiveDamage() - r.castleDefense);
        if (dmg > 0) r.noDamageTaken = false; // mục XXV "No Damage Bonus"
        r.hp -= dmg;
      }
      if (e.killed) {
        const mult = rewardMult * (e.rewardMult || 1);
        r.gold += Math.round(e.def.reward * mult);
        r.heroExpGained += Math.round((e.def.rewardExp || 0) * mult);
        r.killCount++;
        GameState.recordKill(1);
        if (e.isBoss) {
          r.bossKilledThisRun = true; r.bossKillCount++; GameState.recordBossKill(1);
          EffectManager.shake(5, 0.45);
          EffectManager.spawnSpark(e.x, e.y, "#ff5c3d", 24);
        }
        this._addKillScore(e);
      }
      // Boss Skill "Triệu Hồi": rút quân chờ sinh ra khỏi hàng đợi riêng của
      // Boss rồi đẩy thẳng vào trận, xuất phát tại đúng vị trí Boss hiện tại.
      if (e.isBoss && e.pendingSummons && e.pendingSummons.length > 0) {
        for (const s of e.pendingSummons) {
          const summonDef = GAME_DATA.enemyTypes[s.type];
          if (!summonDef) continue; // Admin đã tắt/xoá loại địch này -> bỏ qua an toàn, không crash
          for (let i = 0; i < (s.count || 1); i++) {
            const ne = new Enemy(s.type, this.levelDef.path);
            ne.wpIndex = e.wpIndex;
            ne.x = e.x;
            ne.y = e.y;
            r.enemies.push(ne);
          }
        }
        e.pendingSummons.length = 0;
      }
    }
    r.enemies = r.enemies.filter(e => e.alive);

    // buff tạm thời từ kỹ năng (vd. Trống Trận)
    let towerBuff = { fireRateMult: 1, damageMult: r.towerDamageMult };
    if (r.towerBuffRemaining > 0) {
      r.towerBuffRemaining -= dt;
      towerBuff.fireRateMult = r.towerBuffFireRateMult;
    }
    if (r.skillCooldownRemaining > 0) r.skillCooldownRemaining -= dt;

    // cập nhật tháp
    for (const t of r.towers) t.update(dt, r.enemies, r.projectiles, towerBuff);

    // cập nhật đạn
    for (const p of r.projectiles) p.update(dt, r.enemies);
    r.projectiles = r.projectiles.filter(p => p.alive);

    // cập nhật hiệu ứng hình ảnh (số sát thương, tia lửa chí mạng...)
    EffectManager.update(dt);

    // thua
    if (r.hp <= 0) {
      r.hp = 0;
      r.status = "lost";
      GameState.clearRunSnapshot();
      GameState.recordRunResult(false);
      this._grantHeroExp();
      const stats = this._finalizeScore(false);
      this._sfx("defeat");
      UI.onGameEnded(false, stats);
      return;
    }

    // đếm ngược Đợt Sống Sót (SURVIVAL WAVE, mục XXIV): hết giờ -> coi như
    // đã qua đợt, dọn số địch còn sót lại (không thưởng thêm cho chúng vì
    // mục tiêu là "sống sót", không phải "diệt sạch").
    if (r.waveIsSurvival && r.waveInProgress) {
      r.waveSurviveTimer -= dt;
      if (r.waveSurviveTimer <= 0) {
        r.spawnQueue = [];
        r.enemies = [];
        this._completeWave();
        return;
      }
    }

    // kết thúc đợt (thường - đã diệt sạch hàng đợi + toàn bộ địch trên sân)?
    if (r.waveInProgress && !r.waveIsSurvival && r.spawnQueue.length === 0 && r.enemies.length === 0) {
      this._completeWave();
    }
  },

  /* Xử lý logic chung khi 1 đợt kết thúc (dù là dọn sạch địch hay hết giờ
     Sống Sót): cộng thưởng riêng của đợt (Special Wave, mục XXIII-XXIV),
     kiểm tra thắng màn hay sang đợt kế tiếp. */
  _completeWave() {
    const r = this.run;
    r.waveInProgress = false;
    r.waveIsSurvival = false;
    const waveNumber = r.waveIndex + 1;
    r.score += SCORE_RULES.WAVE_CLEAR_BONUS + (r.waveScoreBonus || 0);
    if (r.waveRewardBonus) r.gold += r.waveRewardBonus;
    GameState.updateBestWave(r.levelId, waveNumber);
    const waveRewardDef = GAME_DATA.rewards ? GAME_DATA.rewards.r_wave_clear : null;
    if (waveRewardDef) GameState.addPersistentReward(waveRewardDef.gold || 0, waveRewardDef.exp || 0);
    const completedQuests = QuestService.evaluate("WAVE_CLEARED", { waveNumber });
    UI.onQuestsCompleted(completedQuests);

    if (waveNumber >= r.totalWaves) {
      r.status = "won";
      GameState.clearRunSnapshot();
      const hpPercent = Math.round((r.hp / r.maxHp) * 100);
      GameState.recordRunResult(true);
      GameState.addPersistentReward(this.levelDef.rewardGold || 0, this.levelDef.rewardExp || 0);
      this._grantHeroExp();
      const stats = this._finalizeScore(true);
      const stageQuests = QuestService.evaluate("STAGE_CLEARED", { stageId: r.levelId, hpPercent });
      let bossQuests = [];
      if (r.bossKilledThisRun) bossQuests = QuestService.evaluate("BOSS_KILLED", {});
      UI.onQuestsCompleted([...stageQuests, ...bossQuests]);
      this._unlockNextStages(r.levelId);
      this._checkStageEndAchievements(stats);
      this._sfx("victory");
      EffectManager.shake(3.5, 0.35);
      UI.onGameEnded(true, stats);
    } else {
      UI.onWaveCleared();
      this.persistRun();
    }
  },

  /* Cộng điểm + Combo thật khi hạ 1 địch (mục XXV-XXVI). */
  _addKillScore(e) {
    const r = this.run;
    r.combo += 1;
    r.comboTimer = SCORE_RULES.COMBO_WINDOW;
    const isNewComboRecord = r.combo > r.maxCombo;
    r.maxCombo = Math.max(r.maxCombo, r.combo);
    const comboStacks = Math.min(r.combo, SCORE_RULES.COMBO_SCORE_CAP_STACK);
    const killScore = SCORE_RULES.KILL_BASE + Math.round((e.def.reward || 0) * SCORE_RULES.KILL_REWARD_MULT);
    const comboScore = comboStacks * SCORE_RULES.COMBO_SCORE_PER_STACK;
    r.score += killScore + comboScore;
    if (e.isBoss) {
      r.score += SCORE_RULES.BOSS_KILL_BONUS;
      const unlocked = AchievementService.evaluate("BOSS_KILL_COUNT", {});
      if (unlocked.length) UI.onAchievementsUnlocked(unlocked);
    }
    if (isNewComboRecord && r.maxCombo >= 20) {
      const unlocked = AchievementService.evaluate("COMBO", { maxCombo: r.maxCombo });
      if (unlocked.length) UI.onAchievementsUnlocked(unlocked);
    }
  },

  /* Cộng Hero EXP thật đã tích luỹ trong trận (mục XIX) vào tiến trình
     dài hạn của tướng đang dùng. Gọi đúng 1 lần khi trận kết thúc (thắng
     hoặc thua), rồi xoá heroExpGained để không cộng lại nếu update() còn
     chạy thêm khung hình nào đó trước khi màn hình chuyển cảnh. */
  _grantHeroExp() {
    const r = this.run;
    if (!r || !r.heroId || r.heroExpGained <= 0) return;
    const gained = r.heroExpGained;
    r.heroExpGained = 0;
    const result = GameState.addHeroExp(r.heroId, gained);
    if (result && result.leveledUp && UI.onHeroLeveledUp) {
      UI.onHeroLeveledUp(r.heroId, result.level);
    }
  },

  /* Xác định số sao đạt được khi THẮNG (mục V), đọc điều kiện Admin cấu
     hình trên từng Stage (starConditions), có fallback an toàn nếu Admin
     xoá/thiếu field để không bao giờ crash. */
  _computeStars(levelDef, r, hpPercent) {
    const cond = levelDef.starConditions || {};
    let stars = cond.oneStar === false ? 0 : 1;
    if (hpPercent >= (cond.twoStarCastleHpPercent ?? 50)) stars = 2;
    const hitThreeByHp = hpPercent >= (cond.threeStarCastleHpPercent ?? 80);
    const hitThreeByScore = r.score >= (cond.threeStarScore ?? Infinity);
    if (hitThreeByHp || hitThreeByScore) stars = 3;
    return stars;
  },

  /* Tính điểm thưởng cuối trận + lưu kỷ lục, trả về stats cho Victory/
     Defeat Screen (mục LIII-LIV). Gọi đúng 1 lần khi trận kết thúc. */
  _finalizeScore(won) {
    const r = this.run;
    const hpPercent = Math.max(0, Math.round((r.hp / r.maxHp) * 100));
    let stars = 0;
    if (won) {
      r.score += Math.round((r.hp / r.maxHp) * SCORE_RULES.REMAINING_HP_BONUS_MAX);
      if (r.elapsedTime <= (this.levelDef.targetTime || Infinity)) r.score += SCORE_RULES.SPEED_BONUS;
      if (r.noDamageTaken) r.score += SCORE_RULES.NO_DAMAGE_BONUS;
      stars = this._computeStars(this.levelDef, r, hpPercent);
      GameState.recordStageResult(r.levelId, { stars, score: r.score, time: Math.round(r.elapsedTime) });
    } else {
      GameState.recordStageResult(r.levelId, { stars: 0, score: r.score });
    }
    return {
      won, stars,
      score: Math.round(r.score),
      hpPercent,
      killCount: r.killCount,
      bossKillCount: r.bossKillCount,
      elapsedTime: Math.round(r.elapsedTime),
      maxCombo: r.maxCombo,
      critCount: r.critCount,
    };
  },

  /* Kiểm tra các Thành tích chỉ có thể biết được KHI THẮNG 1 màn (mục
     XXX): 3 sao, không mất HP thành, Score cao, và đã dọn sạch bản đồ. */
  _checkStageEndAchievements(stats) {
    const r = this.run;
    let unlocked = [];
    unlocked = unlocked.concat(AchievementService.evaluate("KILL_COUNT", {}));
    unlocked = unlocked.concat(AchievementService.evaluate("STAGE_STARS", { stars: stats.stars }));
    unlocked = unlocked.concat(AchievementService.evaluate("SCORE", { score: stats.score }));
    if (r.noDamageTaken) unlocked = unlocked.concat(AchievementService.evaluate("NO_DAMAGE_STAGE_CLEARED", {}));

    const enabledStages = DataService.list("stages").filter((s) => s.enabled !== false);
    const player = GameState.getPlayer();
    const clearedAll = enabledStages.every((s) => (player.stageStars || {})[s.id] >= 1);
    if (clearedAll) unlocked = unlocked.concat(AchievementService.evaluate("ALL_STAGES_CLEARED", {}));

    if (unlocked.length) UI.onAchievementsUnlocked(unlocked);
  },

  _unlockNextStages(clearedStageId) {
    const stages = Object.values(GAME_DATA.levels);
    for (const s of stages) {
      if (s.unlockCondition && s.unlockCondition.type === "stage_cleared" && s.unlockCondition.stageId === clearedStageId) {
        GameState.unlockStage(s.id);
      }
    }
  },

  persistRun() {
    const snap = this.snapshot();
    if (snap) GameState.saveRun(snap);
  },

  /* ---------------- BẮT ĐẦU ĐỢT ---------------- */
  startNextWave() {
    const r = this.run;
    if (r.waveInProgress || r.status !== "playing") return;
    r.waveIndex++;
    const wave = this.levelDef.waves[r.waveIndex];
    if (!wave) return;
    if (wave.warning) UI.showToast(wave.warning);
    r.waveGroupsTemplate = wave.groups;
    r.waveIsSurvival = wave.waveType === "survival";
    r.waveSurviveTimer = r.waveIsSurvival ? (wave.surviveSeconds || 25) : 0;
    r.waveRewardBonus = wave.reward || 0;
    r.waveScoreBonus = wave.bonus || 0;
    r.spawnQueue = this._buildSpawnQueue(wave.groups);
    r.spawnTimer = 0;
    r.waveInProgress = true;
    this._sfx("wave");
    this.persistRun();
  },

  /* Dựng hàng đợi sinh quân từ danh sách "groups" của 1 đợt (mục XXIII).
     Hỗ trợ: delay (khoảng nghỉ trước khi nhóm này xuất hiện - dùng cho
     Ambush/phục kích), speedMultiplier/hpMultiplier (buff riêng cho nhóm -
     dùng cho FAST WAVE/ARMOR WAVE), eliteCount (số con đầu nhóm là Elite -
     dùng cho ELITE WAVE). Dùng lại cho cả lúc bắt đầu đợt lẫn khi
     SURVIVAL WAVE cần tái sinh quân giữa chừng. */
  _buildSpawnQueue(groups) {
    const spawnRate = GAME_DATA.config.enemySpawnRate || 1;
    const queue = [];
    for (const group of groups || []) {
      if (group.delay) queue.push({ wait: true, interval: group.delay });
      if (group.boss) {
        if (!GAME_DATA.enemyTypes[group.boss]) continue; // Boss đã bị Admin tắt -> bỏ qua an toàn
        queue.push({ type: group.boss, interval: (group.interval || 1) * spawnRate });
        continue;
      }
      if (!GAME_DATA.enemyTypes[group.type]) continue; // loại địch đã bị tắt/xoá
      for (let i = 0; i < group.count; i++) {
        queue.push({
          type: group.type,
          interval: group.interval * spawnRate,
          speedMultiplier: group.speedMultiplier,
          hpMultiplier: group.hpMultiplier,
          armorBonus: group.armorBonus,
          elite: i < (group.eliteCount || 0),
        });
      }
    }
    return queue;
  },

  /* ---------------- XÂY / NÂNG CẤP QUÂN THỦ THÀNH ---------------- */
  buildTower(spotIndex, typeId) {
    const r = this.run;
    const def = GAME_DATA.towerTypes[typeId];
    if (!def) return false;
    if (r.towers.some(t => t.spotIndex === spotIndex)) return false;
    if (r.gold < def.cost) return false;
    const spot = this.levelDef.buildSpots[spotIndex];
    const tower = new Tower(typeId, spot.x, spot.y);
    tower.spotIndex = spotIndex;
    r.towers.push(tower);
    r.gold -= def.cost;
    this._sfx("build");
    this.persistRun();
    return true;
  },

  upgradeTower(spotIndex) {
    const r = this.run;
    const tower = r.towers.find(t => t.spotIndex === spotIndex);
    if (!tower) return false;
    const cost = tower.nextUpgradeCost();
    if (cost === null || r.gold < cost) return false;
    tower.upgrade();
    r.gold -= cost;
    this._sfx("upgrade");
    if (tower.level >= tower.def.maxLevel) {
      const unlocked = AchievementService.evaluate("TOWER_MAX_LEVEL", {});
      if (unlocked.length) UI.onAchievementsUnlocked(unlocked);
    }
    this.persistRun();
    return true;
  },

  /* ---------------- KỸ NĂNG CHỦ ĐỘNG ---------------- */
  useSkill() {
    const r = this.run;
    if (!r || !r.skillDef || r.skillCooldownRemaining > 0 || r.status !== "playing") return false;
    const skill = r.skillDef;
    // Kỹ năng chủ động scale theo Level tướng (mục XXI): mỗi cấp +15% hiệu
    // lực, cùng cách hp/damage/defense passive đã scale ở _heroBonuses.
    const skillScale = 1 + 0.15 * ((r.heroLevel || 1) - 1);
    switch (skill.effect) {
      case "damage_all": {
        const dmg = (skill.damage || 0) * skillScale;
        for (const e of r.enemies) {
          if (!e.alive) continue;
          e.takeDamage(dmg);
          EffectManager.spawnSpark(e.x, e.y, "#ff5c3d", 5);
        }
        break;
      }
      case "heal_castle": {
        const healAmount = (skill.heal || 0) * skillScale;
        r.hp = Math.min(r.maxHp, r.hp + healAmount);
        break;
      }
      case "buff_attack_speed":
        r.towerBuffRemaining = skill.duration;
        r.towerBuffFireRateMult = 1 + (skill.value || 0) * skillScale;
        for (const t of r.towers) EffectManager.spawnSpark(t.x, t.y, "#e8c873", 4);
        break;
      default:
        return false;
    }
    r.skillCooldownRemaining = skill.cooldown;
    this._sfx("skill");
    this.persistRun();
    return true;
  },

  setSpeed(speed) {
    if (this.run) this.run.speed = speed;
  },

  togglePause(forceValue) {
    if (!this.run) return;
    this.run.paused = forceValue !== undefined ? forceValue : !this.run.paused;
  },

  /* Tìm ô xây gần điểm bấm (trả về index hoặc -1) */
  hitTestBuildSpot(x, y) {
    const spots = this.levelDef.buildSpots;
    for (let i = 0; i < spots.length; i++) {
      const d = Math.hypot(spots[i].x - x, spots[i].y - y);
      if (d <= 26) return i;
    }
    return -1;
  },

  /* ---------------- VẼ ---------------- */
  render() {
    const ctx = this.ctx;
    const w = GAME_DATA.config.canvasWidth;
    const h = GAME_DATA.config.canvasHeight;
    ctx.clearRect(0, 0, w, h);

    // Screen shake (mục XXXVI): dịch toàn bộ khung vẽ một chút rồi trả lại
    // nguyên trạng ở cuối - dùng save/restore để không bao giờ để ma trận
    // biến đổi rò rỉ sang khung hình sau.
    const shake = EffectManager.getShakeOffset();
    ctx.save();
    if (shake.x || shake.y) ctx.translate(shake.x, shake.y);

    this._drawBackground(ctx, w, h);
    if (!this.levelDef) { ctx.restore(); return; }
    this._drawPath(ctx);
    this._drawBuildSpots(ctx);
    this._drawCastle(ctx);

    const cfg = GAME_DATA.config.features || {};
    if (this.run) {
      if (cfg.debugMode) for (const t of this.run.towers) t.drawRange(ctx);
      for (const t of this.run.towers) t.draw(ctx);
      for (const e of this.run.enemies) e.draw(ctx, cfg.showEnemyHpBar);
      for (const p of this.run.projectiles) p.draw(ctx);
      EffectManager.draw(ctx);
    }
    ctx.restore();
    if (cfg.showFps) this._drawFps(ctx); // FPS vẽ NGOÀI shake để không bị rung theo
  },

  _drawFps(ctx) {
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(8, 8, 62, 20);
    ctx.fillStyle = "#7bc96f";
    ctx.fillText("FPS: " + this.currentFps(), 14, 22);
  },

  _drawBackground(ctx, w, h) {
    // nền trời - đồng lúa
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#e9d9ab");
    sky.addColorStop(0.45, "#d8c48c");
    sky.addColorStop(0.46, "#6e8f4e");
    sky.addColorStop(1, "#4d6b39");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // núi đá vôi cách điệu (đặc trưng Hoa Lư - Ninh Bình)
    ctx.fillStyle = "rgba(90,95,80,.55)";
    this._drawMountain(ctx, 60, 240, 90);
    this._drawMountain(ctx, 220, 250, 70);
    this._drawMountain(ctx, 850, 230, 100);
    this._drawMountain(ctx, 700, 240, 60);
    ctx.fillStyle = "rgba(70,75,62,.5)";
    this._drawMountain(ctx, 500, 255, 55);
  },

  _drawMountain(ctx, cx, baseY, size) {
    ctx.beginPath();
    ctx.moveTo(cx - size, baseY);
    ctx.lineTo(cx - size * 0.3, baseY - size * 1.5);
    ctx.lineTo(cx, baseY - size * 0.9);
    ctx.lineTo(cx + size * 0.35, baseY - size * 1.6);
    ctx.lineTo(cx + size, baseY);
    ctx.closePath();
    ctx.fill();
  },

  _drawPath(ctx) {
    const pts = this.levelDef.path;
    ctx.lineWidth = 34;
    ctx.strokeStyle = "#b8945f";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    ctx.lineWidth = 28;
    ctx.strokeStyle = "#c9a876";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  },

  _drawBuildSpots(ctx) {
    const spots = this.levelDef.buildSpots;
    const towers = this.run ? this.run.towers : [];
    for (let i = 0; i < spots.length; i++) {
      const occupied = towers.some(t => t.spotIndex === i);
      if (occupied) continue;
      ctx.beginPath();
      ctx.arc(spots[i].x, spots[i].y, 20, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(46,33,25,.35)";
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(201,162,74,.8)";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "16px serif";
      ctx.fillStyle = "rgba(232,200,115,.9)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("+", spots[i].x, spots[i].y);
    }
  },

  _drawCastle(ctx) {
    const c = this.levelDef.castle;
    // tường thành
    ctx.fillStyle = "#7a1f2b";
    ctx.fillRect(c.x - 42, c.y - 30, 84, 60);
    ctx.strokeStyle = "#c9a24a";
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - 42, c.y - 30, 84, 60);
    // răng thành
    ctx.fillStyle = "#c9a24a";
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(c.x + i * 12 - 4, c.y - 40, 8, 12);
    }
    // cổng
    ctx.fillStyle = "#2e2119";
    ctx.fillRect(c.x - 10, c.y - 4, 20, 34);
    // cờ
    ctx.fillStyle = "#e8c873";
    ctx.font = "26px serif";
    ctx.textAlign = "center";
    ctx.fillText("🏯", c.x, c.y - 46);
  },
};
