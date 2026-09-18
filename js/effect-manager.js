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
  _shake: { magnitude: 0, timer: 0, duration: 0 },

  reset() {
    this._numbers = [];
    this._sparks = [];
    this._shake = { magnitude: 0, timer: 0, duration: 0 };
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

  spawnDamageNumber(x, y, amount, isCritical) {
    this._numbers.push({
      x, y, amount,
      isCritical: !!isCritical,
      life: isCritical ? 1.0 : 0.8,
      age: 0,
    });
    if (isCritical) this.spawnSpark(x, y, "#ffdf6b", 6);
  },

  spawnSpark(x, y, color, count) {
    const n = count || 4;
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
  },

  draw(ctx) {
    if (this._sparks.length === 0 && this._numbers.length === 0) return;
    ctx.save();
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
        ctx.fillStyle = "#fff2c9";
        ctx.fillText("-" + Math.round(n.amount), n.x, n.y - 15);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = EffectManager;
