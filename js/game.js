/* =========================================================
   GAME.JS  (Giai đoạn 4)
   Vòng lặp chính, vẽ bản đồ + địa hình, sinh quân địch, xử lý xây/nâng
   cấp/BÁN quân thủ thành, Tướng ra trận, thắng/thua, tốc độ game.

   MỚI SO VỚI GIAI ĐOẠN 3
   ----------------------
   - BÁN THÁP hoàn tiền theo tỉ lệ cấu hình được (mặc định 70% tổng vốn).
   - CÂY NÂNG CẤP: từ cấp 3 người chơi chọn 1 trong 2 nhánh cho mỗi tháp.
   - ƯU TIÊN MỤC TIÊU: 7 chế độ, đổi ngay trong trận.
   - THÁP HỖ TRỢ (Trống đồng) phát hào quang buff tháp xung quanh - engine
     tính lại hào quang mỗi khi đội hình tháp thay đổi.
   - TƯỚNG RA TRẬN: đứng cạnh thành, tự đánh, có kỹ năng BỊ ĐỘNG tác động
     thật lên tháp/vàng/thành và kỹ năng CHỦ ĐỘNG nâng cấp được.
   - Quân địch có hành vi: hồi máu đồng đội, tách đôi khi chết, bay, khiên...
   - Boss có thêm chiêu KHIÊN và VÔ HIỆU HOÁ THÁP quanh nó.
   - ĐỊA HÌNH: mỗi màn có theme + chướng ngại vật riêng được vẽ thật.
   - SAVE có VERSION: save cũ không tương thích sẽ bị bỏ qua an toàn.
   ========================================================= */

const SCORE_RULES = {
  KILL_BASE: 5,
  KILL_REWARD_MULT: 1.5,
  CRIT_BONUS: 10,
  BOSS_KILL_BONUS: 400,
  WAVE_CLEAR_BONUS: 50,
  COMBO_WINDOW: 2.2,
  COMBO_SCORE_PER_STACK: 2,
  COMBO_SCORE_CAP_STACK: 20,
  REMAINING_HP_BONUS_MAX: 200,
  SPEED_BONUS: 150,
  NO_DAMAGE_BONUS: 250,
};

/* Phiên bản cấu trúc save của MỘT VÁN ĐANG CHƠI. Tăng số này mỗi khi thay
   đổi hình dạng snapshot theo cách không tương thích ngược -> save cũ sẽ bị
   bỏ qua thay vì làm vỡ ván chơi mới. */
const RUN_SAVE_VERSION = 4;

const Game = {
  canvas: null,
  ctx: null,
  levelDef: null,
  run: null,

  _rafId: null,
  _lastTs: 0,
  _fpsSamples: [],
  _auraDirty: true,

  _sfx(name) {
    if (typeof SoundManager !== "undefined") SoundManager.play(name);
  },

  /* ---------------- KHỞI TẠO ---------------- */
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    // Giai đoạn 5: thử bật lớp dựng hình 3D (WebGL). Nếu không được,
    // `Renderer3D.active()` trả về false và toàn bộ phần vẽ 2D cũ chạy y nguyên.
    if (typeof Renderer3D !== "undefined") Renderer3D.init(canvas);
    Enemy.onHit = (x, y, amount, isCritical, damageType) => {
      const cfg = GAME_DATA.config.features || {};
      if (!this.run) return;
      if (isCritical) {
        this.run.critCount++;
        this.run.score += SCORE_RULES.CRIT_BONUS;
        this._sfx("critical");
      } else if (damageType !== "shield") {
        this._sfx("hit");
      }
      if (cfg.showDamageNumbers === false) return;
      EffectManager.spawnDamageNumber(x, y, amount, isCritical, damageType);
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

  /* Chỉ số cộng thêm từ Tướng: chỉ số nền (hp/damage/defense), kỹ năng chủ
     động và kỹ năng BỊ ĐỘNG (passive) - tất cả đều scale theo Level tướng. */
  _heroBonuses(heroId) {
    const heroDef = heroId && GAME_DATA.generals[heroId];
    if (!heroDef) {
      return { hpBonus: 0, damagePct: 0, defenseFlat: 0, skillDef: null, heroDef: null, level: 1, skillLevel: 1, passive: null };
    }
    const player = GameState.getPlayer();
    const level = (player && player.heroLevels && player.heroLevels[heroId]) || heroDef.level || 1;
    const skillLevel = (player && player.heroSkillLevels && player.heroSkillLevels[heroId]) || 1;
    const scale = 1 + 0.1 * (level - 1);
    return {
      hpBonus: Math.round((heroDef.hp || 0) * scale),
      damagePct: (heroDef.damage || 0) * scale,
      defenseFlat: Math.round((heroDef.defense || 0) * scale),
      skillDef: heroDef.skillId ? GAME_DATA.skills[heroDef.skillId] : null,
      passive: heroDef.passive || null,
      heroDef,
      level,
      skillLevel,
    };
  },

  /* Vị trí đứng của Tướng: ngay trước cổng thành, lệch lên trên một chút để
     không che mất công trình, và luôn nằm trong khung canvas. */
  _heroSpawnPoint(levelDef) {
    const c = levelDef.castle;
    const w = GAME_DATA.config.canvasWidth, h = GAME_DATA.config.canvasHeight;
    return {
      x: Math.max(30, Math.min(w - 30, c.x - 70)),
      y: Math.max(30, Math.min(h - 30, c.y - 60)),
    };
  },

  _makeHeroEntity(heroId, level) {
    const def = heroId && GAME_DATA.generals[heroId];
    if (!def) return null;
    const p = this._heroSpawnPoint(this.levelDef);
    return new Hero(def, level, p.x, p.y);
  },

  /* Bắt đầu một ván mới */
  _initCamera() {
    if (typeof BattleCamera === "undefined") return;
    BattleCamera.init(GAME_DATA.config.canvasWidth, GAME_DATA.config.canvasHeight);
  },

  newRun(levelId, heroId) {
    rebuildGameData();
    EffectManager.reset();
    const levelDef = GAME_DATA.levels[levelId];
    this.levelDef = levelDef;
    this._initCamera();
    const config = GAME_DATA.config;
    const player = GameState.getPlayer();
    const chosenHero = heroId || (player && player.selectedHero) || null;
    const bonus = this._heroBonuses(chosenHero);
    const maxHp = (config.startingHP || 20) + bonus.hpBonus;

    this.run = {
      saveVersion: RUN_SAVE_VERSION,
      levelId,
      heroId: chosenHero,
      gold: config.startingGold,
      hp: maxHp,
      maxHp,
      towerDamageMult: 1 + bonus.damagePct / 100,
      castleDefense: bonus.defenseFlat,
      skillDef: bonus.skillDef,
      heroLevel: bonus.level || 1,
      heroSkillLevel: bonus.skillLevel || 1,
      heroPassive: bonus.passive,
      skillCooldownRemaining: 0,
      towerBuffRemaining: 0,
      towerBuffFireRateMult: 1,
      towerBuffDamageMult: 1,
      castleShieldRemaining: 0,
      castleShieldValue: 0,
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
      heroEntity: null,
      heroExpGained: 0,
      score: 0,
      combo: 0,
      comboTimer: 0,
      maxCombo: 0,
      critCount: 0,
      bossKillCount: 0,
      elapsedTime: 0,
      noDamageTaken: true,
      killCount: 0,
      towersSoldThisRun: 0,
      waveGroupsTemplate: null,
      waveIsSurvival: false,
      waveSurviveTimer: 0,
      waveRewardBonus: 0,
      waveScoreBonus: 0,
      tidePhase: 0,
      _isHighTide: false,
    };
    this.run.heroEntity = this._makeHeroEntity(chosenHero, bonus.level || 1);
    this._auraDirty = true;
    this._startMusic();
    this._startLoop();
  },

  /* Khôi phục ván đã lưu (Tiếp tục) */
  loadRun(snapshot) {
    rebuildGameData();
    EffectManager.reset();
    const levelDef = GAME_DATA.levels[snapshot.levelId];
    if (!levelDef) return false; // Admin đã xoá màn này -> không khôi phục được
    this.levelDef = levelDef;
    this._initCamera();
    const bonus = this._heroBonuses(snapshot.heroId);
    this.run = Object.assign({}, snapshot, {
      saveVersion: RUN_SAVE_VERSION,
      towerDamageMult: 1 + bonus.damagePct / 100,
      castleDefense: bonus.defenseFlat,
      skillDef: bonus.skillDef,
      heroLevel: bonus.level || 1,
      heroSkillLevel: bonus.skillLevel || 1,
      heroPassive: bonus.passive,
      skillCooldownRemaining: 0,
      towerBuffRemaining: 0,
      towerBuffFireRateMult: 1,
      towerBuffDamageMult: 1,
      castleShieldRemaining: 0,
      castleShieldValue: 0,
      bossKilledThisRun: false,
      enemies: [],
      projectiles: [],
      spawnQueue: [],
      spawnTimer: 0,
      waveInProgress: false,
      paused: false,
      towers: [],
      heroEntity: null,
      heroExpGained: snapshot.heroExpGained || 0,
      score: snapshot.score || 0,
      combo: 0,
      comboTimer: 0,
      maxCombo: snapshot.maxCombo || 0,
      critCount: snapshot.critCount || 0,
      bossKillCount: snapshot.bossKillCount || 0,
      elapsedTime: snapshot.elapsedTime || 0,
      noDamageTaken: snapshot.noDamageTaken !== false,
      killCount: snapshot.killCount || 0,
      towersSoldThisRun: snapshot.towersSoldThisRun || 0,
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
      if (!spot || !GAME_DATA.towerTypes[t.typeId]) continue; // dữ liệu đã đổi -> bỏ qua an toàn
      const tower = new Tower(t.typeId, spot.x, spot.y);
      tower.spotIndex = t.spotIndex;
      tower.level = t.level || 1;
      tower.branchId = t.branchId || null;
      tower.targetPriority = t.targetPriority || tower.targetPriority;
      tower.totalInvested = t.totalInvested || tower.def.cost;
      this.run.towers.push(tower);
    }
    this.run.heroEntity = this._makeHeroEntity(snapshot.heroId, bonus.level || 1);
    this._auraDirty = true;
    this._startMusic();
    this._startLoop();
    return true;
  },

  _startMusic() {
    if (typeof SoundManager === "undefined" || !SoundManager.playMusic) return;
    SoundManager.playMusic((this.levelDef && this.levelDef.theme) || "plain");
  },
  stopMusic() {
    if (typeof SoundManager !== "undefined" && SoundManager.stopMusic) SoundManager.stopMusic();
  },

  snapshot() {
    if (!this.run) return null;
    const r = this.run;
    return {
      saveVersion: RUN_SAVE_VERSION,
      levelId: r.levelId,
      heroId: r.heroId,
      gold: r.gold,
      hp: r.hp,
      maxHp: r.maxHp,
      waveIndex: r.waveIndex,
      totalWaves: r.totalWaves,
      status: r.status,
      speed: r.speed,
      towers: r.towers.map((t) => ({
        spotIndex: t.spotIndex, typeId: t.typeId, level: t.level,
        branchId: t.branchId, targetPriority: t.targetPriority, totalInvested: t.totalInvested,
      })),
      heroExpGained: r.heroExpGained,
      score: r.score,
      maxCombo: r.maxCombo,
      critCount: r.critCount,
      bossKillCount: r.bossKillCount,
      elapsedTime: r.elapsedTime,
      noDamageTaken: r.noDamageTaken,
      killCount: r.killCount,
      towersSoldThisRun: r.towersSoldThisRun,
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
        /* Tốc độ x2/x3 được mô phỏng bằng NHIỀU BƯỚC NHỎ thay vì 1 bước dt
           lớn: giữ nguyên độ chính xác va chạm/hiệu ứng và tránh địch
           "nhảy cóc" qua tầm bắn của tháp ở tốc độ cao. */
        const steps = Math.max(1, Math.round(this.run.speed));
        const stepDt = (dtReal * this.run.speed) / steps;
        for (let i = 0; i < steps && this.run && this.run.status === "playing" && !this.run.paused; i++) {
          this.update(stepDt);
        }
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

  /* ---------------- HÀO QUANG THÁP HỖ TRỢ + BỊ ĐỘNG TƯỚNG ----------------
     Được tính lại mỗi khi đội hình tháp thay đổi (xây/bán/nâng cấp/chọn
     nhánh), KHÔNG tính lại mỗi khung hình để khỏi phí CPU. */
  recomputeAuras() {
    const r = this.run;
    if (!r) return;
    const passive = r.heroPassive;
    const lvl = r.heroLevel || 1;
    const heroBuff = { damage: 0, fireRate: 0, range: 0, crit: 0 };
    if (passive) {
      const v = (passive.value || 0) * lvl;
      if (passive.type === "tower_damage") heroBuff.damage = v;
      else if (passive.type === "tower_firerate") heroBuff.fireRate = v;
      else if (passive.type === "tower_range") heroBuff.range = v;
      else if (passive.type === "crit_bonus") heroBuff.crit = v;
    }
    for (const t of r.towers) {
      t._aura = { damage: 0, fireRate: 0, range: 0 };
      t._heroBuff = heroBuff;
    }
    for (const src of r.towers) {
      if (!src.isSupport) continue;
      const aura = src.auraOutput();
      for (const t of r.towers) {
        if (t === src || t.isSupport) continue;
        if (Math.hypot(t.x - src.x, t.y - src.y) <= aura.radius) {
          t._aura.damage += aura.damage;
          t._aura.fireRate += aura.fireRate;
          t._aura.range += aura.range;
        }
      }
    }
    this._auraDirty = false;
  },

  /* ---------------- CẬP NHẬT ---------------- */
  update(dt) {
    const r = this.run;
    const rewardMult = GAME_DATA.config.rewardMultiplier || 1;
    r.elapsedTime += dt;
    // Camera bám Boss (nếu người chơi đã bật nút 👑)
    if (typeof BattleCamera !== "undefined") BattleCamera.update(r);
    if (this._auraDirty) this.recomputeAuras();

    if (r.comboTimer > 0) {
      r.comboTimer -= dt;
      if (r.comboTimer <= 0) { r.comboTimer = 0; r.combo = 0; }
    }

    // Cơ chế thuỷ triều (chỉ map có specialMechanic:"tide")
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

    // --- sinh quân theo hàng đợi ---
    if (r.spawnQueue.length > 0) {
      r.spawnTimer -= dt;
      if (r.spawnTimer <= 0) {
        const next = r.spawnQueue.shift();
        if (!next.wait) {
          r.enemies.push(new Enemy(next.type, this.levelDef.path, {
            speedMultiplier: next.speedMultiplier,
            hpMultiplier: next.hpMultiplier,
            armorBonus: next.armorBonus,
            elite: next.elite,
          }));
        }
        r.spawnTimer = next.interval;
      }
    } else if (r.waveIsSurvival && r.waveSurviveTimer > 0) {
      r.spawnQueue = this._buildSpawnQueue(r.waveGroupsTemplate);
    }

    // --- hào quang làm chậm của Tướng (passive slow_aura) ---
    const heroEnt = r.heroEntity;
    const slowAura = (r.heroPassive && r.heroPassive.type === "slow_aura")
      ? (r.heroPassive.value || 0) * (r.heroLevel || 1) : 0;

    // --- cập nhật địch ---
    const pendingSpawns = [];
    for (const e of r.enemies) {
      if (slowAura > 0 && heroEnt) {
        e._extraSlow = Math.hypot(e.x - heroEnt.x, e.y - heroEnt.y) <= heroEnt.range ? slowAura : 0;
      } else {
        e._extraSlow = 0;
      }
      e.update(dt, mapSpeedMult);

      if (e.reachedCastle) {
        const defense = r.castleDefense + (r.castleShieldRemaining > 0 ? r.castleShieldValue : 0);
        const dmg = Math.max(0, e.getEffectiveDamage() - defense);
        if (dmg > 0) {
          r.noDamageTaken = false;
          EffectManager.shake(2, 0.15);
        }
        r.hp -= dmg;
      }

      if (e.killed) {
        const goldBonus = (r.heroPassive && r.heroPassive.type === "gold_bonus")
          ? 1 + (r.heroPassive.value || 0) * (r.heroLevel || 1) : 1;
        const mult = rewardMult * (e.rewardMult || 1) * goldBonus;
        r.gold += Math.round(e.def.reward * mult);
        r.heroExpGained += Math.round((e.def.rewardExp || 0) * (rewardMult * (e.rewardMult || 1)));
        r.killCount++;
        GameState.recordKill(1);
        if (e.isBoss) {
          r.bossKilledThisRun = true; r.bossKillCount++; GameState.recordBossKill(1);
          EffectManager.shake(5, 0.45);
          EffectManager.spawnSpark(e.x, e.y, "#ff5c3d", 24);
        } else {
          EffectManager.spawnSpark(e.x, e.y, e.def.color || "#e8c873", 4);
        }
        this._addKillScore(e);
        // ĐỊCH TÁCH ĐÔI: sinh quân con ngay tại vị trí chết
        if (e.pendingSplits && e.pendingSplits.length) {
          for (const sp of e.pendingSplits) {
            if (!GAME_DATA.enemyTypes[sp.type]) continue;
            for (let i = 0; i < sp.count; i++) {
              pendingSpawns.push({
                type: sp.type, x: sp.x + (i - 0.5) * 14, y: sp.y + (i - 0.5) * 10,
                wpIndex: sp.wpIndex, hpMultiplier: sp.hpPercent / 100,
              });
            }
          }
          e.pendingSplits.length = 0;
        }
      }

      // THẦY MO hồi máu cho đồng đội quanh nó
      if (e.pendingHeals && e.pendingHeals.length) {
        for (const h of e.pendingHeals) {
          for (const ally of r.enemies) {
            if (!ally.alive || ally === e) continue;
            if (Math.hypot(ally.x - h.x, ally.y - h.y) > h.radius) continue;
            if (ally._poisoned) continue; // trúng độc thì không hồi được
            const amount = ally.maxHp * (h.percent / 100);
            ally.hp = Math.min(ally.maxHp, ally.hp + amount);
          }
          EffectManager.spawnSpark(h.x, h.y, "#7bc96f", 6);
        }
        e.pendingHeals.length = 0;
      }

      // BOSS: triệu hồi quân
      if (e.isBoss && e.pendingSummons && e.pendingSummons.length > 0) {
        for (const s of e.pendingSummons) {
          if (!GAME_DATA.enemyTypes[s.type]) continue;
          for (let i = 0; i < (s.count || 1); i++) {
            pendingSpawns.push({ type: s.type, x: e.x, y: e.y, wpIndex: e.wpIndex });
          }
        }
        e.pendingSummons.length = 0;
      }
      // BOSS: vô hiệu hoá tháp quanh nó
      if (e.isBoss && e.pendingTowerDisables && e.pendingTowerDisables.length > 0) {
        for (const d of e.pendingTowerDisables) {
          for (const t of r.towers) {
            if (Math.hypot(t.x - e.x, t.y - e.y) <= d.radius) {
              t.disabledFor = Math.max(t.disabledFor, d.seconds);
              EffectManager.spawnSpark(t.x, t.y, "#ff5c3d", 6);
            }
          }
        }
        e.pendingTowerDisables.length = 0;
      }
    }

    for (const sp of pendingSpawns) {
      const ne = new Enemy(sp.type, this.levelDef.path, { hpMultiplier: sp.hpMultiplier });
      ne.wpIndex = sp.wpIndex;
      ne.x = sp.x;
      ne.y = sp.y;
      r.enemies.push(ne);
    }

    // dọn địch đã chết -> không giữ lại object rác trong bộ nhớ
    if (r.enemies.some((e) => !e.alive)) r.enemies = r.enemies.filter((e) => e.alive);

    // --- buff tạm thời từ kỹ năng ---
    const towerBuff = { fireRateMult: 1, damageMult: r.towerDamageMult };
    if (r.towerBuffRemaining > 0) {
      r.towerBuffRemaining -= dt;
      towerBuff.fireRateMult = r.towerBuffFireRateMult;
      towerBuff.damageMult *= r.towerBuffDamageMult;
    }
    if (r.castleShieldRemaining > 0) r.castleShieldRemaining -= dt;
    if (r.skillCooldownRemaining > 0) r.skillCooldownRemaining -= dt;

    // --- tháp + tướng + đạn ---
    for (const t of r.towers) t.update(dt, r.enemies, r.projectiles, towerBuff);
    if (heroEnt) heroEnt.update(dt, r.enemies);
    for (const p of r.projectiles) p.update(dt, r.enemies);
    if (r.projectiles.some((p) => !p.alive)) r.projectiles = r.projectiles.filter((p) => p.alive);

    EffectManager.update(dt);

    // --- thua ---
    if (r.hp <= 0) {
      r.hp = 0;
      r.status = "lost";
      GameState.clearRunSnapshot();
      GameState.recordRunResult(false);
      this._grantHeroExp();
      const stats = this._finalizeScore(false);
      this.stopMusic();
      this._sfx("defeat");
      UI.onGameEnded(false, stats);
      return;
    }

    // --- đợt sống sót ---
    if (r.waveIsSurvival && r.waveInProgress) {
      r.waveSurviveTimer -= dt;
      if (r.waveSurviveTimer <= 0) {
        r.spawnQueue.length = 0;
        r.enemies.length = 0;
        this._completeWave();
        return;
      }
    }

    // --- kết thúc đợt thường ---
    if (r.waveInProgress && !r.waveIsSurvival && r.spawnQueue.length === 0 && r.enemies.length === 0) {
      this._completeWave();
    }
  },

  _completeWave() {
    const r = this.run;
    r.waveInProgress = false;
    r.waveIsSurvival = false;
    const waveNumber = r.waveIndex + 1;
    r.score += SCORE_RULES.WAVE_CLEAR_BONUS + (r.waveScoreBonus || 0);
    if (r.waveRewardBonus) r.gold += r.waveRewardBonus;

    // Bị động "An Dân Hộ Quốc": thành tự hồi máu sau mỗi đợt
    if (r.heroPassive && r.heroPassive.type === "castle_regen") {
      const heal = (r.heroPassive.value || 0) * (r.heroLevel || 1);
      if (heal > 0 && r.hp < r.maxHp) {
        r.hp = Math.min(r.maxHp, r.hp + heal);
        UI.showToast("💗 An Dân: thành hồi " + heal.toFixed(1) + " HP");
      }
    }

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
      this.stopMusic();
      this._sfx("victory");
      EffectManager.shake(3.5, 0.35);
      UI.onGameEnded(true, stats);
    } else {
      UI.onWaveCleared();
      this.persistRun();
    }
  },

  _addKillScore(e) {
    const r = this.run;
    r.combo += 1;
    r.comboTimer = SCORE_RULES.COMBO_WINDOW;
    const isNewComboRecord = r.combo > r.maxCombo;
    r.maxCombo = Math.max(r.maxCombo, r.combo);
    const comboStacks = Math.min(r.combo, SCORE_RULES.COMBO_SCORE_CAP_STACK);
    const killScore = SCORE_RULES.KILL_BASE + Math.round((e.def.reward || 0) * SCORE_RULES.KILL_REWARD_MULT);
    r.score += killScore + comboStacks * SCORE_RULES.COMBO_SCORE_PER_STACK;
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

  _computeStars(levelDef, r, hpPercent) {
    const cond = levelDef.starConditions || {};
    let stars = cond.oneStar === false ? 0 : 1;
    if (hpPercent >= (cond.twoStarCastleHpPercent ?? 50)) stars = 2;
    const hitThreeByHp = hpPercent >= (cond.threeStarCastleHpPercent ?? 80);
    const hitThreeByScore = r.score >= (cond.threeStarScore ?? Infinity);
    if (hitThreeByHp || hitThreeByScore) stars = 3;
    return stars;
  },

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
      towerCount: r.towers.length,
    };
  },

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
    if (!r || r.waveInProgress || r.status !== "playing") return false;
    if (r.waveIndex + 1 >= r.totalWaves) return false;
    r.waveIndex++;
    const wave = this.levelDef.waves[r.waveIndex];
    if (!wave) return false;
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
    return true;
  },

  /* Đợt hiện tại có Boss không? (dùng cho cảnh báo UI) */
  isBossWave(index) {
    const wave = this.levelDef && this.levelDef.waves[index];
    if (!wave) return false;
    return wave.waveType === "boss" || (wave.groups || []).some((g) => g.boss);
  },

  _buildSpawnQueue(groups) {
    const spawnRate = GAME_DATA.config.enemySpawnRate || 1;
    const queue = [];
    for (const group of groups || []) {
      if (group.delay) queue.push({ wait: true, interval: group.delay });
      if (group.boss) {
        if (!GAME_DATA.enemyTypes[group.boss]) continue;
        queue.push({ type: group.boss, interval: (group.interval || 1) * spawnRate });
        continue;
      }
      if (!GAME_DATA.enemyTypes[group.type]) continue;
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

  /* ---------------- XÂY / NÂNG CẤP / BÁN ---------------- */
  /* Giai đoạn 6: xử lý sau khi một công trình lên cấp.
     Nếu vượt qua một MỐC TIẾN HOÁ (1/3/5/7/9/10) thì phát hiệu ứng tại chỗ
     và báo cho UI mở animation tiến hoá. Hiệu ứng có giới hạn số hạt để
     không tụt FPS trên máy yếu. */
  _onTowerLevelUp(tower, fromLevel) {
    if (typeof TowerTiers === "undefined") return;
    const tier = TowerTiers.crossedTier(tower.def, fromLevel, tower.level);
    if (!tier) return;
    const vis = TowerTiers.visual(tower.def, tower.level);
    EffectManager.spawnSpark(tower.x, tower.y, vis.accent, tier.evolution ? 22 : 12);
    EffectManager.spawnBlast(tower.x, tower.y, tier.evolution ? 60 : 36, vis.accent);
    if (tier.evolution) {
      EffectManager.shake(4, 0.28);
      this._sfx("evolve");
      if (typeof UI !== "undefined" && UI.showEvolution) UI.showEvolution(tower, tier);
    } else if (typeof UI !== "undefined" && UI.showToast) {
      UI.showToast(`⬆ ${tower.displayName()} · Lv.${tower.level}`);
    }
  },

  towerAt(spotIndex) {
    return this.run ? this.run.towers.find((t) => t.spotIndex === spotIndex) : null;
  },

  buildTower(spotIndex, typeId) {
    const r = this.run;
    const def = GAME_DATA.towerTypes[typeId];
    if (!r || !def) return false;
    if (r.towers.some((t) => t.spotIndex === spotIndex)) return false;
    if (r.gold < def.cost) return false;
    const spot = this.levelDef.buildSpots[spotIndex];
    if (!spot) return false;
    const tower = new Tower(typeId, spot.x, spot.y);
    tower.spotIndex = spotIndex;
    r.towers.push(tower);
    r.gold -= def.cost;
    this._auraDirty = true;
    EffectManager.spawnSpark(spot.x, spot.y, def.color, 8);
    this._sfx("build");
    this.persistRun();
    return true;
  },

  upgradeTower(spotIndex) {
    const r = this.run;
    const tower = this.towerAt(spotIndex);
    if (!tower) return false;
    if (tower.needsBranchChoice()) return false; // phải chọn nhánh trước
    const cost = tower.nextUpgradeCost();
    if (cost === null || r.gold < cost) return false;
    const fromLevel = tower.level;
    tower.upgrade();
    tower.totalInvested += cost;
    r.gold -= cost;
    this._auraDirty = true;
    EffectManager.spawnSpark(tower.x, tower.y, "#e8c873", 10);
    this._sfx("upgrade");
    this._onTowerLevelUp(tower, fromLevel);
    if (tower.level >= tower.maxLevel) {
      const unlocked = AchievementService.evaluate("TOWER_MAX_LEVEL", {});
      if (unlocked.length) UI.onAchievementsUnlocked(unlocked);
    }
    this.persistRun();
    return true;
  },

  /* Chọn nhánh trong cây nâng cấp rồi nâng luôn lên cấp tiếp theo. */
  chooseBranch(spotIndex, branchId) {
    const r = this.run;
    const tower = this.towerAt(spotIndex);
    if (!tower || tower.branchId) return false;
    const branch = tower.availableBranches().find((b) => b.id === branchId);
    if (!branch) return false;
    const cost = tower.nextUpgradeCost();
    if (cost === null || r.gold < cost) return false;
    const fromLevel = tower.level;
    tower.branchId = branchId;
    tower.upgrade();
    tower.totalInvested += cost;
    r.gold -= cost;
    this._auraDirty = true;
    EffectManager.spawnSpark(tower.x, tower.y, "#e8c873", 16);
    this._sfx("upgrade");
    this._onTowerLevelUp(tower, fromLevel);
    this.persistRun();
    return true;
  },

  /* BÁN THÁP: hoàn lại `sellRefundRate` × tổng vốn đã bỏ ra (xây + mọi lần
     nâng cấp), làm tròn xuống. Ô đất trở lại trống để xây lại. */
  sellTower(spotIndex) {
    const r = this.run;
    const idx = r ? r.towers.findIndex((t) => t.spotIndex === spotIndex) : -1;
    if (idx === -1) return false;
    const tower = r.towers[idx];
    const refund = tower.sellValue();
    r.gold += refund;
    r.towersSoldThisRun++;
    r.towers.splice(idx, 1);
    this._auraDirty = true;
    EffectManager.spawnSpark(tower.x, tower.y, "#c9a24a", 10);
    this._sfx("sell");
    this.persistRun();
    return refund;
  },

  setTowerPriority(spotIndex, priorityId) {
    const tower = this.towerAt(spotIndex);
    if (!tower) return false;
    if (!TARGET_PRIORITIES.some((p) => p.id === priorityId)) return false;
    tower.targetPriority = priorityId;
    this._sfx("button");
    this.persistRun();
    return true;
  },

  /* ---------------- KỸ NĂNG CHỦ ĐỘNG ---------------- */
  useSkill() {
    const r = this.run;
    if (!r || !r.skillDef || r.skillCooldownRemaining > 0 || r.status !== "playing") return false;
    const skill = r.skillDef;
    // Hiệu lực = Level TƯỚNG (+15%/cấp) × Level KỸ NĂNG (perLevelBonus/cấp)
    const heroScale = 1 + 0.15 * ((r.heroLevel || 1) - 1);
    const skillScale = 1 + (skill.perLevelBonus || 0.2) * ((r.heroSkillLevel || 1) - 1);
    const scale = heroScale * skillScale;
    const dmgType = skill.damageType || "physical";

    switch (skill.effect) {
      case "damage_all": {
        const dmg = (skill.damage || 0) * scale;
        for (const e of r.enemies) {
          if (!e.alive) continue;
          e.takeDamage(dmg, { damageType: dmgType, armorPen: 25 });
          if (skill.statusEffect) e.applyStatusEffect(skill.statusEffect);
          EffectManager.spawnSpark(e.x, e.y, "#ff5c3d", 5);
        }
        EffectManager.shake(3, 0.25);
        break;
      }
      case "heal_castle": {
        r.hp = Math.min(r.maxHp, r.hp + (skill.heal || 0) * scale);
        break;
      }
      case "buff_attack_speed":
        r.towerBuffRemaining = skill.duration;
        r.towerBuffFireRateMult = 1 + (skill.value || 0) * scale;
        r.towerBuffDamageMult = 1;
        for (const t of r.towers) EffectManager.spawnSpark(t.x, t.y, "#e8c873", 4);
        break;
      case "buff_damage":
        r.towerBuffRemaining = skill.duration;
        r.towerBuffFireRateMult = 1;
        r.towerBuffDamageMult = 1 + (skill.value || 0) * scale;
        for (const t of r.towers) EffectManager.spawnSpark(t.x, t.y, "#ff9a3d", 4);
        break;
      case "stun_all": {
        const dur = (skill.duration || 2) * skillScale;
        for (const e of r.enemies) {
          if (!e.alive) continue;
          if (skill.damage) e.takeDamage(skill.damage * scale, { damageType: dmgType });
          e.applyStatusEffect({ type: "stun", value: 1, duration: dur });
          EffectManager.spawnSpark(e.x, e.y, "#e8c873", 5);
        }
        EffectManager.shake(3.5, 0.3);
        break;
      }
      case "shield_castle":
        r.castleShieldRemaining = skill.duration || 10;
        r.castleShieldValue = Math.round((skill.value || 3) * scale);
        break;
      default:
        return false;
    }
    if (r.heroEntity) r.heroEntity.flashSkill();
    r.skillCooldownRemaining = skill.cooldown;
    this._sfx("skill");
    this.persistRun();
    return true;
  },

  setSpeed(speed) {
    if (this.run) this.run.speed = speed;
  },

  cycleSpeed() {
    if (!this.run) return 1;
    const speeds = (GAME_DATA.config.speeds && GAME_DATA.config.speeds.length) ? GAME_DATA.config.speeds : [1, 2, 3];
    const idx = speeds.indexOf(this.run.speed);
    const next = speeds[(idx + 1) % speeds.length];
    this.setSpeed(next);
    return next;
  },

  togglePause(forceValue) {
    if (!this.run) return;
    this.run.paused = forceValue !== undefined ? forceValue : !this.run.paused;
    if (typeof SoundManager !== "undefined" && SoundManager.setMusicPaused) {
      SoundManager.setMusicPaused(this.run.paused);
    }
  },

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
    if (!ctx) return;
    // Ưu tiên dựng hình 3D; hàm trả về false nếu chế độ 3D đang tắt hoặc
    // máy không hỗ trợ WebGL -> rơi xuống đường vẽ 2D bên dưới.
    if (typeof UI !== "undefined" && UI.drawMinimap) UI.drawMinimap(this);
    if (typeof Renderer3D !== "undefined" && Renderer3D.render(this)) return;
    const w = GAME_DATA.config.canvasWidth;
    const h = GAME_DATA.config.canvasHeight;
    ctx.clearRect(0, 0, w, h);

    const shake = EffectManager.getShakeOffset();
    ctx.save();
    if (shake.x || shake.y) ctx.translate(shake.x, shake.y);
    // Camera chiến trường (chế độ vẽ 2D dự phòng): pan/zoom bằng biến đổi
    // ma trận của context, gameplay vẫn chạy trên toạ độ bản đồ gốc.
    if (typeof BattleCamera !== "undefined" && BattleCamera.enabled() && !BattleCamera.isDefault()) {
      BattleCamera.apply(ctx);
    }

    this._drawBackground(ctx, w, h);
    if (!this.levelDef) { ctx.restore(); return; }
    this._drawPath(ctx);
    this._drawObstacles(ctx);
    this._drawBuildSpots(ctx);
    this._drawCastle(ctx);

    const cfg = GAME_DATA.config.features || {};
    if (this.run) {
      if (cfg.debugMode) for (const t of this.run.towers) t.drawRange(ctx);
      if (this.selectedSpotIndex !== undefined && this.selectedSpotIndex >= 0) {
        const sel = this.towerAt(this.selectedSpotIndex);
        if (sel) sel.drawRange(ctx);
      }
      for (const t of this.run.towers) t.draw(ctx);
      if (this.run.heroEntity) {
        this.run.heroEntity.drawRange(ctx);
        this.run.heroEntity.draw(ctx);
      }
      for (const e of this.run.enemies) e.draw(ctx, cfg.showEnemyHpBar);
      for (const p of this.run.projectiles) p.draw(ctx);
      EffectManager.draw(ctx);
    }
    ctx.restore();
    if (cfg.showFps) this._drawFps(ctx);
  },

  _drawFps(ctx) {
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(8, 8, 62, 20);
    ctx.fillStyle = "#7bc96f";
    ctx.fillText("FPS: " + this.currentFps(), 14, 22);
  },

  /* Bảng màu nền theo THEME của từng màn (Giai đoạn 4) */
  _themePalette(theme) {
    switch (theme) {
      case "river":    return { skyTop: "#cfe3e8", skyBot: "#9ec3cf", groundTop: "#4a7f86", groundBot: "#2f5a63", hill: "rgba(70,100,105,.5)" };
      case "mountain": return { skyTop: "#e6dcc4", skyBot: "#cdbf9d", groundTop: "#5e7346", groundBot: "#3b4f2d", hill: "rgba(80,82,70,.62)" };
      case "citadel":  return { skyTop: "#efdfb8", skyBot: "#d9c28e", groundTop: "#7d8a55", groundBot: "#535f38", hill: "rgba(110,95,75,.5)" };
      case "field":    return { skyTop: "#f0e4bb", skyBot: "#ddcb91", groundTop: "#83a052", groundBot: "#57713a", hill: "rgba(95,110,80,.45)" };
      case "karst":
      default:         return { skyTop: "#e9d9ab", skyBot: "#d8c48c", groundTop: "#6e8f4e", groundBot: "#4d6b39", hill: "rgba(90,95,80,.55)" };
    }
  },

  _drawBackground(ctx, w, h) {
    const theme = (this.levelDef && this.levelDef.theme) || "karst";
    const pal = this._themePalette(theme);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, pal.skyTop);
    sky.addColorStop(0.45, pal.skyBot);
    sky.addColorStop(0.46, pal.groundTop);
    sky.addColorStop(1, pal.groundBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = pal.hill;
    this._drawMountain(ctx, 60, 240, 90);
    this._drawMountain(ctx, 220, 250, 70);
    this._drawMountain(ctx, 850, 230, 100);
    this._drawMountain(ctx, 700, 240, 60);
    ctx.fillStyle = "rgba(70,75,62,.42)";
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

  /* CHƯỚNG NGẠI VẬT: đá, cây, tường, cọc, vũng nước - định hình chiến trường
     và cho biết ngay đây là vùng KHÔNG xây được. */
  _drawObstacles(ctx) {
    const list = this.levelDef.obstacles || [];
    for (const o of list) {
      const s = o.size || 18;
      switch (o.type) {
        case "tree":
          ctx.fillStyle = "#5a3f26";
          ctx.fillRect(o.x - 2.5, o.y, 5, s * 0.5);
          ctx.beginPath();
          ctx.arc(o.x, o.y - s * 0.25, s * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = "#3f6a34";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(o.x - s * 0.3, o.y, s * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = "#4a7a3c";
          ctx.fill();
          break;
        case "water":
          ctx.beginPath();
          ctx.ellipse(o.x, o.y, s * 0.9, s * 0.45, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(60,120,140,.55)";
          ctx.fill();
          ctx.strokeStyle = "rgba(180,220,230,.5)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
        case "stake":
          ctx.strokeStyle = "#6b4a2f";
          ctx.lineWidth = 3;
          for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(o.x + i * 7, o.y + s * 0.4);
            ctx.lineTo(o.x + i * 7 + 2, o.y - s * 0.5);
            ctx.stroke();
          }
          break;
        case "wall":
          ctx.fillStyle = "#6e5138";
          ctx.fillRect(o.x - s * 0.8, o.y - s * 0.35, s * 1.6, s * 0.7);
          ctx.strokeStyle = "rgba(40,28,18,.6)";
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x - s * 0.8, o.y - s * 0.35, s * 1.6, s * 0.7);
          break;
        case "banner":
          ctx.strokeStyle = "#4a3320";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(o.x, o.y + s * 0.5);
          ctx.lineTo(o.x, o.y - s * 0.7);
          ctx.stroke();
          ctx.fillStyle = "#7a1f2b";
          ctx.beginPath();
          ctx.moveTo(o.x, o.y - s * 0.7);
          ctx.lineTo(o.x + s * 0.7, o.y - s * 0.45);
          ctx.lineTo(o.x, o.y - s * 0.2);
          ctx.closePath();
          ctx.fill();
          break;
        case "rock":
        default:
          ctx.beginPath();
          ctx.moveTo(o.x - s * 0.7, o.y + s * 0.4);
          ctx.lineTo(o.x - s * 0.35, o.y - s * 0.55);
          ctx.lineTo(o.x + s * 0.2, o.y - s * 0.35);
          ctx.lineTo(o.x + s * 0.7, o.y + s * 0.4);
          ctx.closePath();
          ctx.fillStyle = "rgba(96,96,88,.85)";
          ctx.fill();
          ctx.strokeStyle = "rgba(40,40,36,.55)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
      }
    }
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

    // mũi tên chỉ hướng tiến quân
    ctx.fillStyle = "rgba(90,62,36,.35)";
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      for (let d = 40; d < len - 20; d += 70) {
        const x = a.x + ux * d, y = a.y + uy * d;
        ctx.beginPath();
        ctx.moveTo(x + ux * 7, y + uy * 7);
        ctx.lineTo(x - uy * 5, y + ux * 5);
        ctx.lineTo(x + uy * 5, y - ux * 5);
        ctx.closePath();
        ctx.fill();
      }
    }
  },

  _drawBuildSpots(ctx) {
    const spots = this.levelDef.buildSpots;
    const towers = this.run ? this.run.towers : [];
    for (let i = 0; i < spots.length; i++) {
      const occupied = towers.some((t) => t.spotIndex === i);
      if (occupied) continue;
      ctx.beginPath();
      ctx.arc(spots[i].x, spots[i].y, 20, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(46,33,25,.35)";
      ctx.fill();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(201,162,74,.8)";
      ctx.lineWidth = 2;
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
    ctx.fillStyle = "#7a1f2b";
    ctx.fillRect(c.x - 42, c.y - 30, 84, 60);
    ctx.strokeStyle = "#c9a24a";
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - 42, c.y - 30, 84, 60);
    ctx.fillStyle = "#c9a24a";
    for (let i = -3; i <= 3; i++) ctx.fillRect(c.x + i * 12 - 4, c.y - 40, 8, 12);
    ctx.fillStyle = "#2e2119";
    ctx.fillRect(c.x - 10, c.y - 4, 20, 34);
    ctx.fillStyle = "#e8c873";
    ctx.font = "26px serif";
    ctx.textAlign = "center";
    ctx.fillText("🏯", c.x, c.y - 46);

    // khiên thành đang bật (kỹ năng Hộ Quốc Trận)
    if (this.run && this.run.castleShieldRemaining > 0) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 62, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(121,200,240,.75)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // thanh máu thành ngay trên bản đồ
    if (this.run) {
      const pct = Math.max(0, this.run.hp / this.run.maxHp);
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(c.x - 42, c.y + 36, 84, 7);
      ctx.fillStyle = pct > 0.4 ? "#7bc96f" : "#c94f4f";
      ctx.fillRect(c.x - 42, c.y + 36, 84 * pct, 7);
    }
  },
};
