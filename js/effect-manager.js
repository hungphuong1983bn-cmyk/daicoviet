/* =========================================================
   EFFECT-MANAGER.JS  (Giai đoạn 3)
   Quản lý hiệu ứng hình ảnh nhẹ trên Canvas: số sát thương bay lên
   (thường/chí mạng), tia lửa khi trúng chí mạng. Thay thế cho mảng
   floatingTexts cũ từng nằm trong Game.run.

   Thiết kế nhẹ, không dùng DOM, không tạo object khổng lồ mỗi khung
   hình: mảng được lọc (filter) mỗi update thay vì cấp phát mới liên
   tục cho từng entity.

   API:
     EffectManager.reset()                         - gọi khi bắt đầu/tiếp tục ván mới
     EffectManager.spawnDamageNumber(x,y,amt,crit)  - số sát thương bay lên
     EffectManager.spawnSpark(x,y,color,count)      - tia lửa nhỏ
     EffectManager.update(dt)
     EffectManager.draw(ctx)
   ========================================================= */

const EffectManager = {
  _numbers: [],
  _sparks: [],
  _rings: [],   // vòng nổ lan (Giai đoạn 4)
  _beams: [],   // vệt đánh của Tướng (Giai đoạn 4)
  _shake: { magnitude: 0, timer: 0, duration: 0 },
  /* Trần số lượng hiệu ứng cùng lúc: bảo vệ FPS và bộ nhớ khi combo cao,
     đúng yêu cầu mục 8 (không để vật thể vô dụng tồn đọng). */
  _MAX_NUMBERS: 90,
  _MAX_SPARKS: 260,

  reset() {
    this._numbers.length = 0;
    this._sparks.length = 0;
    this._rings.length = 0;
    this._beams.length = 0;
    this._particles.length = 0;
    this._slashes.length = 0;
    this._bolts.length = 0;
    this._shake = { magnitude: 0, timer: 0, duration: 0 };
  },

  /* Vòng sóng xung kích khi đạn diện rộng phát nổ. */
  spawnBlast(x, y, radius, color) {
    if (this._rings.length > 40) return;
    this._rings.push({ x, y, radius: radius || 40, color: color || "#e8c873", life: 0.35, age: 0 });
  },

  /* Vệt sáng nối tướng với mục tiêu vừa bị đánh. */
  spawnBeam(x1, y1, x2, y2, color) {
    if (this._beams.length > 24) return;
    this._beams.push({ x1, y1, x2, y2, color: color || "#e8c873", life: 0.22, age: 0 });
  },

  /* Rung màn hình (mục XXXVI) - CHỈ dùng cho Máy bắn đá, Boss skill, Boss
     chết, Victory. Biên độ giữ rất nhỏ (<= 6px) và thời lượng ngắn để
     không gây khó chịu/say trên mobile, đúng yêu cầu "Shake rất nhẹ". */
  shake(magnitude, duration) {
    const mag = Math.min(magnitude || 3, 6); // chặn cứng biên độ tối đa
    // không cộng dồn - lấy hiệu ứng mạnh hơn, tránh rung giật liên hồi
    if (mag >= this._shake.magnitude) {
      const dur = Math.min(duration || 0.25, 0.5);
      this._shake.magnitude = mag;
      this._shake.timer = dur;
      this._shake.duration = dur; // giữ lại để chuẩn hoá độ tắt dần về 0..1
    }
  },

  /* Trả về độ lệch camera hiện tại; game.js dùng ctx.translate() trước
     khi vẽ và restore() sau khi vẽ. Độ lệch KHÔNG bao giờ vượt quá
     `magnitude` px (tối đa 6px) - đã chuẩn hoá theo tỉ lệ thời gian còn
     lại, đúng tinh thần "Shake rất nhẹ" của mục XXXVI. */
  getShakeOffset() {
    if (this._shake.timer <= 0) return { x: 0, y: 0 };
    const decay = this._shake.timer / (this._shake.duration || 1); // 0..1
    const m = this._shake.magnitude * decay;
    return { x: (Math.random() * 2 - 1) * m, y: (Math.random() * 2 - 1) * m };
  },

  spawnDamageNumber(x, y, amount, isCritical, kind) {
    if (this._numbers.length >= this._MAX_NUMBERS) return;
    this._numbers.push({
      x, y, amount,
      isCritical: !!isCritical,
      kind: kind || null, // "burn"|"poison"|"bleed"|"shield" -> đổi màu số
      life: isCritical ? 1.0 : 0.8,
      age: 0,
    });
    if (isCritical) this.spawnSpark(x, y, "#ffdf6b", 6);
  },

  /* ---------------------------------------------------------
     spawnImpact(kind, x, y, opts) — MỖI LOẠI VA CHẠM MỘT HÌNH DẠNG/MÀU
     SẮC/CHUYỂN ĐỘNG RIÊNG (mục 4 & 9 trong yêu cầu nâng cấp), thay vì
     dùng chung spawnSpark(màu) cho mọi vũ khí/skill như trước.
     kind: "pierce" | "slash" | "blunt" | "fire" | "ice" | "poison" |
           "lightning" | "explosion" | "magic" | "slow" | "heal" | "buff"
     --------------------------------------------------------- */
  spawnImpact(kind, x, y, opts) {
    opts = opts || {};
    const n = opts.count;
    // Nếu vũ khí có sát thương lan toả (splash), luôn vẽ vòng lan đúng bán
    // kính thật để người chơi thấy vùng ảnh hưởng, MÀU theo loại hiệu ứng
    // (không còn cố định vàng cho mọi vụ nổ).
    if (opts.radius > 0) {
      const KIND_BLAST_COLOR = {
        fire: "#ff7a3d", ice: "#bfe6ff", poison: "#7fbf4a", lightning: "#f5f0c8",
        magic: "#c8a8ff", explosion: opts.color || "#e8c873", blunt: opts.color || "#e8d7b0",
      };
      this.spawnBlast(x, y, opts.radius, opts.blastColor || KIND_BLAST_COLOR[kind] || opts.color || "#e8c873");
    }
    switch (kind) {
      case "fire":
        // hạt lửa bay NGƯỢC trọng lực (bốc lên), màu cam-đỏ.
        this._spawnParticles(x, y, n || 10, { color: "#ff8a3d", altColor: "#ffdf6b", rise: true, speed: 55, life: 0.5, shape: "flame" });
        break;
      case "ice":
        // tinh thể băng: rơi CHẬM, gần như đứng yên tại chỗ, màu xanh nhạt.
        this._spawnParticles(x, y, n || 8, { color: "#bfe6ff", altColor: "#ffffff", rise: false, speed: 18, life: 0.55, gravity: 10, shape: "shard" });
        break;
      case "poison":
        // khói độc lan toả, hạt bay lên chậm rồi tản ra, màu xanh lá.
        this._spawnParticles(x, y, n || 9, { color: "#7fbf4a", altColor: "#9ede6a", rise: true, speed: 22, life: 0.75, gravity: -4, shape: "puff" });
        break;
      case "lightning":
        // 1 tia chớp răng cưa + hạt trắng-vàng bắn toé, không rơi (không trọng lực).
        this._spawnBolt(x, y, opts.toX, opts.toY, "#f5f0c8");
        this._spawnParticles(x, y, n || 10, { color: "#fff6c8", altColor: "#9fd8ff", rise: false, speed: 90, life: 0.22, gravity: 0, shape: "spark" });
        break;
      case "slash":
        // 1-2 vệt chém cong, không phải hạt tròn.
        this._slashes.push({ x, y, angle: opts.angle || (Math.random() * Math.PI * 2), life: 0.22, age: 0, color: opts.color || "#eaeaea" });
        this._spawnParticles(x, y, n || 4, { color: "#eaeaea", speed: 70, life: 0.25, gravity: 60, shape: "spark" });
        break;
      case "explosion":
        if (!(opts.radius > 0)) this.spawnBlast(x, y, 40, opts.color || "#e8c873");
        this._spawnParticles(x, y, n || 14, { color: opts.color || "#e8c873", altColor: "#ff9a3d", speed: 100, life: 0.4, gravity: 140, shape: "spark" });
        if ((opts.radius || 40) >= 55) this.shake(2.5, 0.2);
        break;
      case "magic":
        this._spawnParticles(x, y, n || 8, { color: "#c8a8ff", altColor: "#e6d8ff", rise: false, speed: 50, life: 0.4, gravity: 0, shape: "shard" });
        break;
      case "slow":
        this._spawnParticles(x, y, n || 6, { color: "#8cc8ff", speed: 30, life: 0.4, gravity: 40, shape: "puff" });
        break;
      case "heal":
        this._spawnParticles(x, y, n || 6, { color: "#7bc96f", altColor: "#c8f0b8", rise: true, speed: 26, life: 0.6, gravity: -18, shape: "puff" });
        break;
      case "buff":
        this._spawnParticles(x, y, n || 6, { color: "#ffe36b", rise: true, speed: 20, life: 0.6, gravity: -12, shape: "shard" });
        break;
      case "pierce":
        this._spawnParticles(x, y, n || 4, { color: opts.color || "#e8c873", speed: 60, life: 0.28, gravity: 90, shape: "spark" });
        break;
      case "blunt":
      default:
        this.spawnSpark(x, y, opts.color || "#e8c873", n || 6);
    }
  },

  /* Va chạm của MỘT Projectile: chọn kind qua WeaponVisuals (nếu có) để mỗi
     vũ khí/hiệu ứng trạng thái có hình va chạm riêng, không dùng chung 1 hình. */
  spawnImpactForProjectile(proj, x, y) {
    const kind = (typeof WeaponVisuals !== "undefined") ? WeaponVisuals.impactKind(proj) : "blunt";
    this.spawnImpact(kind, x, y, { color: proj.color, radius: proj.splashRadius });
  },

  _particles: [],
  _slashes: [],
  _bolts: [],
  _MAX_PARTICLES: 220,

  _spawnParticles(x, y, count, cfg) {
    if (this._particles.length >= this._MAX_PARTICLES) return;
    const n = Math.min(count, this._MAX_PARTICLES - this._particles.length);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (cfg.speed || 40) * (0.5 + Math.random() * 0.7);
      const life = cfg.life || 0.4;
      this._particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (cfg.rise ? speed * 0.6 : 0),
        gravity: cfg.gravity === undefined ? 90 : cfg.gravity,
        life, age: 0,
        color: (Math.random() < 0.5 || !cfg.altColor) ? cfg.color : cfg.altColor,
        shape: cfg.shape || "spark",
        size: 1.8 + Math.random() * 1.6,
      });
    }
  },

  _spawnBolt(x, y, toX, toY, color) {
    if (this._bolts.length > 20) return;
    const x2 = (toX === undefined) ? x + (Math.random() - 0.5) * 30 : toX;
    const y2 = (toY === undefined) ? y - 26 - Math.random() * 14 : toY;
    // đường zig-zag: vài đoạn gãy khúc ngẫu nhiên giữa 2 điểm.
    const segs = 4;
    const pts = [{ x, y }];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push({
        x: x + (x2 - x) * t + (Math.random() - 0.5) * 10,
        y: y + (y2 - y) * t + (Math.random() - 0.5) * 10,
      });
    }
    pts.push({ x: x2, y: y2 });
    this._bolts.push({ pts, color: color || "#f5f0c8", life: 0.18, age: 0 });
  },

  spawnSpark(x, y, color, count) {
    let n = count || 4;
    if (this._sparks.length + n > this._MAX_SPARKS) n = Math.max(0, this._MAX_SPARKS - this._sparks.length);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 70;
      this._sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4,
        age: 0,
        color: color || "#e8c873",
      });
    }
  },

  update(dt) {
    if (this._shake.timer > 0) {
      this._shake.timer -= dt;
      if (this._shake.timer <= 0) { this._shake.timer = 0; this._shake.magnitude = 0; this._shake.duration = 0; }
    }
    for (const n of this._numbers) {
      n.age += dt;
      n.y -= dt * (n.isCritical ? 34 : 24);
    }
    if (this._numbers.length > 0) this._numbers = this._numbers.filter((n) => n.age < n.life);

    for (const s of this._sparks) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 110 * dt; // trọng lực nhẹ
    }
    if (this._sparks.length > 0) this._sparks = this._sparks.filter((s) => s.age < s.life);

    for (const r of this._rings) r.age += dt;
    if (this._rings.length > 0) this._rings = this._rings.filter((r) => r.age < r.life);

    for (const b of this._beams) b.age += dt;
    if (this._beams.length > 0) this._beams = this._beams.filter((b) => b.age < b.life);

    for (const p of this._particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
    }
    if (this._particles.length > 0) this._particles = this._particles.filter((p) => p.age < p.life);

    for (const s of this._slashes) s.age += dt;
    if (this._slashes.length > 0) this._slashes = this._slashes.filter((s) => s.age < s.life);

    for (const bo of this._bolts) bo.age += dt;
    if (this._bolts.length > 0) this._bolts = this._bolts.filter((bo) => bo.age < bo.life);
  },

  draw(ctx) {
    if (this._sparks.length === 0 && this._numbers.length === 0 &&
        this._rings.length === 0 && this._beams.length === 0 &&
        this._particles.length === 0 && this._slashes.length === 0 && this._bolts.length === 0) return;
    ctx.save();

    // tia sét răng cưa (khác hẳn vệt thẳng của Tướng)
    for (const bo of this._bolts) {
      const a = Math.max(0, 1 - bo.age / bo.life);
      ctx.globalAlpha = a;
      ctx.strokeStyle = bo.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      bo.pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // vệt chém (khác hẳn hạt tròn)
    for (const s of this._slashes) {
      const a = Math.max(0, 1 - s.age / s.life);
      ctx.globalAlpha = a;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, s.angle - 0.6, s.angle + 0.6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // hạt hiệu ứng theo shape riêng (flame/shard/puff/spark)
    for (const p of this._particles) {
      const a = Math.max(0, 1 - p.age / p.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === "flame") {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - p.size * 1.6);
        ctx.quadraticCurveTo(p.x + p.size, p.y, p.x, p.y + p.size * 1.2);
        ctx.quadraticCurveTo(p.x - p.size, p.y, p.x, p.y - p.size * 1.6);
        ctx.fill();
      } else if (p.shape === "shard") {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - p.size * 1.4); ctx.lineTo(p.x + p.size, p.y); ctx.lineTo(p.x, p.y + p.size * 1.4); ctx.lineTo(p.x - p.size, p.y);
        ctx.closePath(); ctx.fill();
      } else if (p.shape === "puff") {
        ctx.globalAlpha = a * 0.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // vệt đánh của Tướng
    for (const b of this._beams) {
      const a = Math.max(0, 1 - b.age / b.life);
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }

    // vòng sóng xung kích của đòn nổ diện rộng
    for (const r of this._rings) {
      const t = r.age / r.life;
      ctx.globalAlpha = Math.max(0, 1 - t) * 0.65;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.35 + t * 0.75), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const s of this._sparks) {
      const a = Math.max(0, 1 - s.age / s.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = "center";
    for (const n of this._numbers) {
      const a = Math.max(0, 1 - n.age / n.life);
      ctx.globalAlpha = a;
      if (n.isCritical) {
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = "#ff5c3d";
        ctx.fillText("CHÍ MẠNG!", n.x, n.y - 30);
        ctx.font = "bold 14px sans-serif";
        ctx.fillStyle = "#ffdf6b";
        ctx.fillText("-" + Math.round(n.amount), n.x, n.y - 15);
      } else {
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle =
          n.kind === "burn" ? "#ff9b4a" :
          n.kind === "poison" ? "#9ede6a" :
          n.kind === "bleed" ? "#ff7d7d" :
          n.kind === "shield" ? "#8cc8ff" : "#fff2c9";
        ctx.fillText("-" + Math.round(n.amount), n.x, n.y - 15);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = EffectManager;
