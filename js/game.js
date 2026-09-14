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

const Game = {
  canvas: null,
  ctx: null,
  levelDef: null,

  /* trạng thái ván đấu hiện tại */
  run: null,

  _rafId: null,
  _lastTs: 0,
  _fpsSamples: [],

  /* ---------------- KHỞI TẠO ---------------- */
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    Enemy.onHit = (x, y, amount) => {
      const cfg = GAME_DATA.config.features || {};
      if (cfg.showDamageNumbers === false) return;
      if (!this.run) return;
      this.run.floatingTexts.push({ x, y, amount, life: 0.8 });
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
    };
  },

  /* Bắt đầu một ván mới ở màn levelId, với tướng heroId (tuỳ chọn) */
  newRun(levelId, heroId) {
    rebuildGameData(); // luôn lấy dữ liệu mới nhất từ Admin trước khi vào trận
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
      floatingTexts: [],
    };
    this._startLoop();
  },

  /* Khôi phục ván đã lưu (Tiếp tục) */
  loadRun(snapshot) {
    rebuildGameData();
    const levelDef = GAME_DATA.levels[snapshot.levelId];
    this.levelDef = levelDef;
    const bonus = this._heroBonuses(snapshot.heroId);
    this.run = Object.assign({}, snapshot, {
      towerDamageMult: 1 + bonus.damagePct / 100,
      castleDefense: bonus.defenseFlat,
      skillDef: bonus.skillDef,
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
      floatingTexts: [],
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

    // sinh quân theo hàng đợi
    if (r.spawnQueue.length > 0) {
      r.spawnTimer -= dt;
      if (r.spawnTimer <= 0) {
        const next = r.spawnQueue.shift();
        r.enemies.push(new Enemy(next.type, this.levelDef.path));
        r.spawnTimer = next.interval;
      }
    }

    // cập nhật địch
    for (const e of r.enemies) {
      e.update(dt);
      if (e.reachedCastle) {
        r.hp -= Math.max(0, e.def.damage - r.castleDefense);
      }
      if (e.killed) {
        r.gold += Math.round(e.def.reward * rewardMult);
        GameState.recordKill(1);
        if (e.isBoss) r.bossKilledThisRun = true;
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

    // cập nhật số sát thương bay lên
    for (const ft of r.floatingTexts) { ft.life -= dt; ft.y -= dt * 24; }
    r.floatingTexts = r.floatingTexts.filter(ft => ft.life > 0);

    // thua
    if (r.hp <= 0) {
      r.hp = 0;
      r.status = "lost";
      GameState.clearRunSnapshot();
      GameState.recordRunResult(false);
      UI.onGameEnded(false);
      return;
    }

    // kết thúc đợt?
    if (r.waveInProgress && r.spawnQueue.length === 0 && r.enemies.length === 0) {
      r.waveInProgress = false;
      const waveNumber = r.waveIndex + 1;
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
        const stageQuests = QuestService.evaluate("STAGE_CLEARED", { stageId: r.levelId, hpPercent });
        let bossQuests = [];
        if (r.bossKilledThisRun) bossQuests = QuestService.evaluate("BOSS_KILLED", {});
        UI.onQuestsCompleted([...stageQuests, ...bossQuests]);
        this._unlockNextStages(r.levelId);
        UI.onGameEnded(true);
      } else {
        UI.onWaveCleared();
        this.persistRun();
      }
    }
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
    const spawnRate = GAME_DATA.config.enemySpawnRate || 1;
    const queue = [];
    for (const group of wave.groups) {
      if (group.boss) {
        // Boss có thể đã bị Admin tắt (enabled:false) -> bị lọc khỏi
        // GAME_DATA.enemyTypes. Bỏ qua an toàn thay vì làm vỡ trận.
        if (!GAME_DATA.enemyTypes[group.boss]) continue;
        queue.push({ type: group.boss, interval: (group.interval || 1) * spawnRate });
        continue;
      }
      if (!GAME_DATA.enemyTypes[group.type]) continue; // loại địch đã bị tắt/xoá
      for (let i = 0; i < group.count; i++) {
        queue.push({ type: group.type, interval: group.interval * spawnRate });
      }
    }
    r.spawnQueue = queue;
    r.spawnTimer = 0;
    r.waveInProgress = true;
    this.persistRun();
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
    this.persistRun();
    return true;
  },

  /* ---------------- KỸ NĂNG CHỦ ĐỘNG ---------------- */
  useSkill() {
    const r = this.run;
    if (!r || !r.skillDef || r.skillCooldownRemaining > 0 || r.status !== "playing") return false;
    const skill = r.skillDef;
    switch (skill.effect) {
      case "damage_all":
        for (const e of r.enemies) if (e.alive) e.takeDamage(skill.damage);
        break;
      case "heal_castle":
        r.hp = Math.min(r.maxHp, r.hp + skill.heal);
        break;
      case "buff_attack_speed":
        r.towerBuffRemaining = skill.duration;
        r.towerBuffFireRateMult = 1 + (skill.value || 0);
        break;
      default:
        return false;
    }
    r.skillCooldownRemaining = skill.cooldown;
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
    this._drawBackground(ctx, w, h);
    if (!this.levelDef) return;
    this._drawPath(ctx);
    this._drawBuildSpots(ctx);
    this._drawCastle(ctx);

    const cfg = GAME_DATA.config.features || {};
    if (this.run) {
      if (cfg.debugMode) for (const t of this.run.towers) t.drawRange(ctx);
      for (const t of this.run.towers) t.draw(ctx);
      for (const e of this.run.enemies) e.draw(ctx, cfg.showEnemyHpBar);
      for (const p of this.run.projectiles) p.draw(ctx);
      this._drawFloatingTexts(ctx, this.run.floatingTexts);
    }
    if (cfg.showFps) this._drawFps(ctx);
  },

  _drawFloatingTexts(ctx, texts) {
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    for (const ft of texts) {
      ctx.globalAlpha = Math.max(0, Math.min(1, ft.life / 0.8));
      ctx.fillStyle = "#fff2c9";
      ctx.fillText("-" + Math.round(ft.amount), ft.x, ft.y - 18);
    }
    ctx.globalAlpha = 1;
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
