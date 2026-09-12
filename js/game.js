/* =========================================================
   GAME.JS
   Vòng lặp chính, vẽ bản đồ, sinh quân địch, xử lý xây quân
   thủ thành, thắng/thua, tốc độ game. Đọc dữ liệu từ data.js,
   thao tác thực thể từ entities.js, đọc/ghi qua state.js.
   ========================================================= */

const Game = {
  canvas: null,
  ctx: null,
  levelDef: null,

  /* trạng thái ván đấu hiện tại */
  run: null,

  _rafId: null,
  _lastTs: 0,

  /* ---------------- KHỞI TẠO ---------------- */
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  },

  /* Bắt đầu một ván mới ở màn levelId */
  newRun(levelId) {
    const levelDef = GAME_DATA.levels[levelId];
    this.levelDef = levelDef;
    this.run = {
      levelId,
      gold: GAME_DATA.config.startingGold,
      hp: GAME_DATA.config.startingHP,
      maxHp: GAME_DATA.config.startingHP,
      waveIndex: -1,           // chưa bắt đầu đợt nào
      totalWaves: levelDef.waves.length,
      status: "playing",       // playing | won | lost
      speed: 1,
      paused: false,
      waveInProgress: false,
      spawnQueue: [],          // hàng đợi sinh quân của đợt hiện tại
      spawnTimer: 0,
      enemies: [],
      towers: [],              // { spotIndex, typeId }
      projectiles: [],
    };
    this._startLoop();
  },

  /* Khôi phục ván đã lưu (Tiếp tục) */
  loadRun(snapshot) {
    const levelDef = GAME_DATA.levels[snapshot.levelId];
    this.levelDef = levelDef;
    this.run = Object.assign({}, snapshot, {
      enemies: [],
      projectiles: [],
      spawnQueue: [],
      spawnTimer: 0,
      waveInProgress: false,
      paused: false,
      towers: [],
    });
    // Khôi phục lại các quân thủ thành đã xây (không khôi phục quân địch giữa đợt
    // để tránh phức tạp - đợt sẽ được yêu cầu bắt đầu lại từ nút "Bắt đầu đợt")
    for (const t of snapshot.towers || []) {
      const spot = levelDef.buildSpots[t.spotIndex];
      const tower = new Tower(t.typeId, spot.x, spot.y);
      tower.spotIndex = t.spotIndex;
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
      gold: r.gold,
      hp: r.hp,
      maxHp: r.maxHp,
      waveIndex: r.waveIndex,
      totalWaves: r.totalWaves,
      status: r.status,
      speed: r.speed,
      towers: r.towers.map(t => ({ spotIndex: t.spotIndex, typeId: t.typeId })),
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

  /* ---------------- CẬP NHẬT ---------------- */
  update(dt) {
    const r = this.run;

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
        r.hp -= e.def.damage;
      }
      if (e.killed) {
        r.gold += e.def.reward;
      }
    }
    r.enemies = r.enemies.filter(e => e.alive);

    // cập nhật tháp
    for (const t of r.towers) t.update(dt, r.enemies, r.projectiles);

    // cập nhật đạn
    for (const p of r.projectiles) p.update(dt, r.enemies);
    r.projectiles = r.projectiles.filter(p => p.alive);

    // thua
    if (r.hp <= 0) {
      r.hp = 0;
      r.status = "lost";
      UI.onGameEnded(false);
      return;
    }

    // kết thúc đợt?
    if (r.waveInProgress && r.spawnQueue.length === 0 && r.enemies.length === 0) {
      r.waveInProgress = false;
      GameState.progress.bestWave[r.levelId] = Math.max(
        GameState.progress.bestWave[r.levelId] || 0,
        r.waveIndex + 1
      );
      GameState.saveProgress();

      if (r.waveIndex + 1 >= r.totalWaves) {
        r.status = "won";
        GameState.clearRunSnapshot();
        UI.onGameEnded(true);
      } else {
        UI.onWaveCleared();
        this.persistRun();
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
    const queue = [];
    for (const group of wave.groups) {
      for (let i = 0; i < group.count; i++) {
        queue.push({ type: group.type, interval: group.interval });
      }
    }
    r.spawnQueue = queue;
    r.spawnTimer = 0;
    r.waveInProgress = true;
    this.persistRun();
  },

  /* ---------------- XÂY QUÂN THỦ THÀNH ---------------- */
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

    if (this.run) {
      for (const t of this.run.towers) t.draw(ctx);
      for (const e of this.run.enemies) e.draw(ctx);
      for (const p of this.run.projectiles) p.draw(ctx);
    }
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
