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
    Enemy.onHit = (x, y, amount, isCritical) => {
      const cfg = GAME_DATA.config.features || {};
      if (cfg.showDamageNumbers === false) return;
      if (!this.run) return;
      EffectManager.spawnDamageNumber(x, y, amount, isCritical);
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
    EffectManager.reset();
    this._prevHp = undefined;
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
    };
    this._startLoop();
  },

  /* Khôi phục ván đã lưu (Tiếp tục) */
  loadRun(snapshot) {
    rebuildGameData();
    EffectManager.reset();
    this._prevHp = undefined;
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

    // cập nhật hiệu ứng hình ảnh (số sát thương, tia lửa chí mạng...)
    EffectManager.update(dt);

    // rung nhẹ màn hình mỗi khi thành bị công phá
    if (this._prevHp !== undefined && r.hp < this._prevHp) {
      EffectManager.shakeScreen(4, 0.15);
    }
    this._prevHp = r.hp;

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

    const shake = this.run ? EffectManager.getShakeOffset() : { x: 0, y: 0 };
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
    this._drawVignette(ctx, w, h);
    ctx.restore();
    if (cfg.showFps) this._drawFps(ctx);
  },

  /* Viền tối nhẹ quanh mép khung hình - tạo chiều sâu điện ảnh,
     giống phong cách game thương mại thay vì canvas phẳng. */
  _drawVignette(ctx, w, h) {
    const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,.35)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },

  _drawFps(ctx) {
    ctx.font = "12px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(8, 8, 62, 20);
    ctx.fillStyle = "#7bc96f";
    ctx.fillText("FPS: " + this.currentFps(), 14, 22);
  },

  /* Bảng chủ đề hình nền theo từng màn chơi — mỗi thời kỳ lịch sử một
     bầu không khí riêng, thay vì dùng chung 1 nền tĩnh cho mọi màn. */
  _bgThemes: {
    hoa_lu: { sky: ["#e9d9ab", "#d8c48c", "#6e8f4e", "#4d6b39"], split: 0.45, kind: "mountain" },
    dai_la: { sky: ["#e8c9a0", "#d1a56e", "#7a5a3a", "#4a3521"], split: 0.42, kind: "city" },
    bach_dang: { sky: ["#bfe0e6", "#8fc4d4", "#1f4a5a", "#0f2c38"], split: 0.4, kind: "water" },
    chi_lang: { sky: ["#d9c8a8", "#b8a074", "#5c5548", "#3a352c"], split: 0.44, kind: "mountain" },
    binh_lo: { sky: ["#c9e0d8", "#8fbfae", "#2f5d50", "#1a382f"], split: 0.4, kind: "water" },
    thang_long: { sky: ["#f0d9a0", "#e0a860", "#7a2f2f", "#4a1a1a"], split: 0.42, kind: "city" },
    chuong_duong: { sky: ["#cfe2ea", "#9fc0cf", "#2f4a5a", "#1a2c38"], split: 0.4, kind: "water" },
    van_kiep: { sky: ["#a8c8d8", "#6f9fb8", "#12303f", "#081820"], split: 0.38, kind: "stakes" },
    dong_da: { sky: ["#f0b48a", "#d1704a", "#5a1f1f", "#301010"], split: 0.4, kind: "battlefield" },
  },

  _drawBackground(ctx, w, h) {
    const theme = (this.levelDef && this._bgThemes[this.levelDef.background]) || this._bgThemes.hoa_lu;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, theme.sky[0]);
    sky.addColorStop(theme.split - 0.01, theme.sky[1]);
    sky.addColorStop(theme.split, theme.sky[2]);
    sky.addColorStop(1, theme.sky[3]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    switch (theme.kind) {
      case "water":
        this._drawWater(ctx, w, h, theme.split);
        break;
      case "stakes":
        this._drawWater(ctx, w, h, theme.split);
        this._drawStakes(ctx, w, h, theme.split);
        break;
      case "city":
        this._drawCitySkyline(ctx, w, h, theme.split);
        break;
      case "battlefield":
        this._drawBattlefieldHaze(ctx, w, h, theme.split);
        break;
      default:
        ctx.fillStyle = "rgba(90,95,80,.55)";
        this._drawMountain(ctx, 60, h * theme.split, 90);
        this._drawMountain(ctx, 220, h * theme.split + 10, 70);
        this._drawMountain(ctx, 850, h * theme.split - 10, 100);
        this._drawMountain(ctx, 700, h * theme.split, 60);
        ctx.fillStyle = "rgba(70,75,62,.5)";
        this._drawMountain(ctx, 500, h * theme.split + 15, 55);
    }
  },

  _drawWater(ctx, w, h, split) {
    const baseY = h * split;
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 2;
    const t = performance.now() / 1000;
    for (let row = 0; row < 5; row++) {
      const y = baseY + 18 + row * 26;
      if (y > h) break;
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 24) {
        const yy = y + Math.sin(x * 0.03 + t * 1.3 + row) * 3;
        if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.globalAlpha = 0.5 - row * 0.07;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  _drawStakes(ctx, w, h, split) {
    // cọc gỗ nhọn cắm dưới sông, đặc trưng kế Ngô Quyền / Bạch Đằng 1288
    const baseY = h * split;
    ctx.fillStyle = "rgba(40,28,18,.75)";
    const positions = [40, 130, 300, 380, 520, 610, 760, 880];
    for (const x of positions) {
      const y = baseY + 30 + (x % 3) * 14;
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 22);
      ctx.lineTo(x + 5, y + 22);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
    }
  },

  _drawCitySkyline(ctx, w, h, split) {
    const baseY = h * split;
    ctx.fillStyle = "rgba(40,25,18,.6)";
    const buildings = [
      { x: 40, w: 60, hgt: 70 }, { x: 130, w: 40, hgt: 50 },
      { x: 640, w: 70, hgt: 90 }, { x: 760, w: 50, hgt: 60 },
      { x: 860, w: 55, hgt: 75 },
    ];
    for (const b of buildings) {
      ctx.fillRect(b.x, baseY - b.hgt, b.w, b.hgt);
      // mái cong kiểu đình chùa
      ctx.beginPath();
      ctx.moveTo(b.x - 8, baseY - b.hgt);
      ctx.lineTo(b.x + b.w / 2, baseY - b.hgt - 16);
      ctx.lineTo(b.x + b.w + 8, baseY - b.hgt);
      ctx.closePath();
      ctx.fill();
    }
  },

  _drawBattlefieldHaze(ctx, w, h, split) {
    // gò đất + khói súng mờ đặc trưng chiến trường Đống Đa
    const baseY = h * split;
    ctx.fillStyle = "rgba(60,30,20,.5)";
    this._drawMountain(ctx, 150, baseY + 20, 65);
    this._drawMountain(ctx, 780, baseY + 10, 75);
    const t = performance.now() / 1000;
    for (let i = 0; i < 4; i++) {
      const x = (i * 260 + (t * 12) % 260) % w;
      const y = baseY - 20 - i * 8;
      const grad = ctx.createRadialGradient(x, y, 4, x, y, 60);
      grad.addColorStop(0, "rgba(120,110,100,.28)");
      grad.addColorStop(1, "rgba(120,110,100,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, 60, 0, Math.PI * 2);
      ctx.fill();
    }
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
    const t = performance.now() / 1000;

    // bóng đổ nền
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + 34, 50, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fill();

    // tường thành (gradient thay vì màu phẳng)
    const wallGrad = ctx.createLinearGradient(c.x, c.y - 30, c.x, c.y + 30);
    wallGrad.addColorStop(0, "#9a3040");
    wallGrad.addColorStop(1, "#5a1620");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(c.x - 42, c.y - 30, 84, 60);
    ctx.strokeStyle = "#c9a24a";
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - 42, c.y - 30, 84, 60);
    // đường chỉ trang trí
    ctx.strokeStyle = "rgba(232,200,115,.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x - 36, c.y - 24, 72, 48);

    // răng thành
    ctx.fillStyle = "#c9a24a";
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(c.x + i * 12 - 4, c.y - 40, 8, 12);
    }
    // cổng
    const gateGrad = ctx.createLinearGradient(c.x - 10, c.y - 4, c.x + 10, c.y + 30);
    gateGrad.addColorStop(0, "#3a281c");
    gateGrad.addColorStop(1, "#1a1109");
    ctx.fillStyle = gateGrad;
    ctx.fillRect(c.x - 10, c.y - 4, 20, 34);
    ctx.strokeStyle = "rgba(201,162,74,.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x - 10, c.y - 4, 20, 34);

    // đèn lồng le lói hai bên cổng
    const flicker = 0.6 + Math.sin(t * 6) * 0.2;
    for (const dx of [-22, 22]) {
      const glow = ctx.createRadialGradient(c.x + dx, c.y + 10, 0, c.x + dx, c.y + 10, 10);
      glow.addColorStop(0, `rgba(255,200,110,${flicker})`);
      glow.addColorStop(1, "rgba(255,200,110,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(c.x + dx, c.y + 10, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // cột cờ + lá cờ tung bay (dùng sóng sin thay vì icon tĩnh)
    const poleX = c.x;
    const poleTopY = c.y - 62;
    ctx.strokeStyle = "#8a6a3a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(poleX, c.y - 40);
    ctx.lineTo(poleX, poleTopY);
    ctx.stroke();

    ctx.save();
    ctx.translate(poleX, poleTopY);
    ctx.beginPath();
    ctx.moveTo(0, -2);
    const waveAmp = 5;
    for (let i = 0; i <= 8; i++) {
      const fx = i * 4.5;
      const fy = -2 + Math.sin(t * 5 - i * 0.9) * waveAmp * (i / 8) - 12;
      ctx.lineTo(fx, fy);
    }
    for (let i = 8; i >= 0; i--) {
      const fx = i * 4.5;
      const fy = 6 + Math.sin(t * 5 - i * 0.9) * waveAmp * (i / 8) - 12;
      ctx.lineTo(fx, fy);
    }
    ctx.closePath();
    const flagGrad = ctx.createLinearGradient(0, -12, 36, -12);
    flagGrad.addColorStop(0, "#e8c873");
    flagGrad.addColorStop(1, "#c9a24a");
    ctx.fillStyle = flagGrad;
    ctx.fill();
    ctx.strokeStyle = "#7a1f2b";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  },
};
