/* =========================================================
   EFFECT-MANAGER.JS  (Giai đoạn 4 — Nâng cấp hiệu ứng chuyên nghiệp)
   Quản lý toàn bộ hiệu ứng hình ảnh trên Canvas: số sát thương bay
   lên, tia lửa chí mạng, ánh chớp đầu nòng khi tháp bắn, vòng va
   chạm khi trúng đích, vụ nổ lan toả (splash), bụi/mảnh vỡ khi địch
   gục ngã, hào quang trạng thái (đốt/đóng băng/choáng), rung màn
   hình khi thành bị công phá hoặc Boss gục ngã.

   Thiết kế nhẹ, không dùng DOM: mọi hạt được lưu trong mảng phẳng,
   lọc (filter) một lần mỗi khung hình thay vì cấp phát liên tục.

   API chính:
     EffectManager.reset()
     EffectManager.spawnDamageNumber(x,y,amount,isCritical)
     EffectManager.spawnMuzzleFlash(x,y,angle,color)
     EffectManager.spawnImpactRing(x,y,color,big)
     EffectManager.spawnExplosion(x,y,radius,color)
     EffectManager.spawnDeathBurst(x,y,color,isBoss)
     EffectManager.spawnStatusPuff(x,y,type)
     EffectManager.shakeScreen(amount, duration)
     EffectManager.update(dt)
     EffectManager.draw(ctx)
     EffectManager.getShakeOffset()  -> {x,y} dùng để dịch canvas khi render
   ========================================================= */

const EffectManager = {
  _numbers: [],
  _sparks: [],
  _rings: [],
  _particles: [],
  _shake: { time: 0, duration: 0, amount: 0 },

  reset() {
    this._numbers = [];
    this._sparks = [];
    this._rings = [];
    this._particles = [];
    this._shake = { time: 0, duration: 0, amount: 0 };
  },

  /* ---------------- SỐ SÁT THƯƠNG ---------------- */
  spawnDamageNumber(x, y, amount, isCritical) {
    this._numbers.push({
      x, y, amount,
      isCritical: !!isCritical,
      life: isCritical ? 1.0 : 0.8,
      age: 0,
      driftX: (Math.random() - 0.5) * 14,
    });
    if (isCritical) {
      this.spawnSpark(x, y, "#ffdf6b", 8);
      this.spawnImpactRing(x, y, "#ffdf6b", true);
    }
  },

  /* ---------------- TIA LỬA (hạt bắn toé) ---------------- */
  spawnSpark(x, y, color, count) {
    const n = count || 4;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      this._sparks.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.2,
        age: 0,
        size: 1.5 + Math.random() * 1.8,
        color: color || "#e8c873",
      });
    }
  },

  /* ---------------- ÁNH CHỚP ĐẦU NÒNG (khi tháp khai hoả) ---------------- */
  spawnMuzzleFlash(x, y, angle, color) {
    this._particles.push({
      kind: "muzzle",
      x, y, angle: angle || 0,
      age: 0, life: 0.12,
      color: color || "#fff2c9",
    });
  },

  /* ---------------- VÒNG VA CHẠM (khi đạn trúng đích) ---------------- */
  spawnImpactRing(x, y, color, big) {
    this._rings.push({
      x, y,
      age: 0,
      life: big ? 0.32 : 0.22,
      maxR: big ? 22 : 13,
      color: color || "#fff2c9",
      width: big ? 3 : 2,
    });
  },

  /* ---------------- NỔ LAN TOẢ (tháp splash: voi chiến, hoả công) ---------------- */
  spawnExplosion(x, y, radius, color) {
    this._rings.push({
      x, y, age: 0, life: 0.4,
      maxR: Math.max(18, radius * 0.9), color: color || "#ff8c42", width: 3,
    });
    this.spawnSpark(x, y, color || "#ff8c42", 12);
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.6;
      this._particles.push({
        kind: "smoke",
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        vy: -14 - Math.random() * 10,
        age: 0, life: 0.5 + Math.random() * 0.3,
        size: 6 + Math.random() * 8,
        color: "rgba(60,50,40,.5)",
      });
    }
  },

  /* ---------------- ĐỊCH GỤC NGÃ ---------------- */
  spawnDeathBurst(x, y, color, isBoss) {
    this.spawnSpark(x, y, color || "#c94f4f", isBoss ? 22 : 9);
    this.spawnImpactRing(x, y, color || "#c94f4f", !!isBoss);
    if (isBoss) {
      this.shakeScreen(9, 0.4);
      for (let i = 0; i < 10; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 60;
        this._particles.push({
          kind: "ember",
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          age: 0, life: 0.8 + Math.random() * 0.4,
          size: 2 + Math.random() * 2,
          color: "#ffdf6b",
        });
      }
    }
  },

  /* ---------------- HẠT TRẠNG THÁI (đốt/đóng băng/độc...) ---------------- */
  spawnStatusPuff(x, y, type) {
    const palette = {
      burn: "#ff7a3d", bleed: "#c94f4f", freeze: "#8fd6ef",
      stun: "#ffdf6b", slow: "#7bb8d6",
    };
    this.spawnSpark(x, y - 6, palette[type] || "#e8c873", 2);
  },

  /* ---------------- RUNG MÀN HÌNH ---------------- */
  shakeScreen(amount, duration) {
    this._shake.amount = Math.max(this._shake.amount, amount || 6);
    this._shake.duration = Math.max(this._shake.duration, duration || 0.25);
    this._shake.time = this._shake.duration;
  },
  getShakeOffset() {
    if (this._shake.time <= 0) return { x: 0, y: 0 };
    const pct = this._shake.time / this._shake.duration;
    const mag = this._shake.amount * pct;
    return {
      x: (Math.random() - 0.5) * mag,
      y: (Math.random() - 0.5) * mag,
    };
  },

  /* ---------------- CẬP NHẬT ---------------- */
  update(dt) {
    if (this._shake.time > 0) this._shake.time = Math.max(0, this._shake.time - dt);

    for (const n of this._numbers) {
      n.age += dt;
      n.y -= dt * (n.isCritical ? 34 : 24);
      n.x += n.driftX * dt;
    }
    if (this._numbers.length > 0) this._numbers = this._numbers.filter((n) => n.age < n.life);

    for (const s of this._sparks) {
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 140 * dt; // trọng lực nhẹ
    }
    if (this._sparks.length > 0) this._sparks = this._sparks.filter((s) => s.age < s.life);

    for (const r of this._rings) r.age += dt;
    if (this._rings.length > 0) this._rings = this._rings.filter((r) => r.age < r.life);

    for (const p of this._particles) {
      p.age += dt;
      if (p.vx !== undefined) p.x += p.vx * dt;
      if (p.vy !== undefined) p.y += p.vy * dt;
    }
    if (this._particles.length > 0) this._particles = this._particles.filter((p) => p.age < p.life);
  },

  /* ---------------- VẼ ---------------- */
  draw(ctx) {
    if (
      this._sparks.length === 0 && this._numbers.length === 0 &&
      this._rings.length === 0 && this._particles.length === 0
    ) return;
    ctx.save();

    // khói / hạt lửa dưới cùng
    for (const p of this._particles) {
      const a = Math.max(0, 1 - p.age / p.life);
      if (p.kind === "smoke") {
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + p.age), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "ember") {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "muzzle") {
        ctx.globalAlpha = a;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, "rgba(255,242,201,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(6, 0, 12, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // vòng va chạm / nổ
    for (const r of this._rings) {
      const t = r.age / r.life;
      const a = Math.max(0, 1 - t);
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxR * t, 0, Math.PI * 2);
      ctx.stroke();
    }

    // tia lửa
    for (const s of this._sparks) {
      const a = Math.max(0, 1 - s.age / s.life);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size || 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // số sát thương
    ctx.textAlign = "center";
    for (const n of this._numbers) {
      const a = Math.max(0, 1 - n.age / n.life);
      ctx.globalAlpha = a;
      if (n.isCritical) {
        ctx.font = "bold 13px sans-serif";
        ctx.fillStyle = "#ff5c3d";
        ctx.shadowColor = "rgba(0,0,0,.6)";
        ctx.shadowBlur = 3;
        ctx.fillText("CHÍ MẠNG!", n.x, n.y - 30);
        ctx.font = "bold 15px sans-serif";
        ctx.fillStyle = "#ffdf6b";
        ctx.fillText("-" + Math.round(n.amount), n.x, n.y - 14);
        ctx.shadowBlur = 0;
      } else {
        ctx.font = "bold 12px sans-serif";
        ctx.fillStyle = "#fff2c9";
        ctx.shadowColor = "rgba(0,0,0,.5)";
        ctx.shadowBlur = 2;
        ctx.fillText("-" + Math.round(n.amount), n.x, n.y - 15);
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = EffectManager;
