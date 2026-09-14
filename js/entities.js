/* =========================================================
   ENTITIES.JS  (Giai đoạn 2)
   Các "lớp" thực thể trong trận đấu: Địch, Quân thủ thành, Đạn.
   Chỉ chứa hành vi của từng thực thể (update/draw), không chứa
   vòng lặp game chính (nằm ở game.js).

   Thay đổi so với phiên bản 1:
   - Enemy: hỗ trợ Defense (giảm sát thương phẳng) và Resistance
     (giảm sát thương theo %) lấy từ dữ liệu Admin, dùng chung cho cả
     quân địch thường lẫn Boss (Boss được trộn vào enemyTypes bởi
     DataService.buildGameData()).
   - Enemy: có thể gọi ra "số sát thương bay lên" nếu bật cấu hình
     showDamageNumbers (Admin > Cấu hình game), qua hook Enemy.onHit.
   - Tower: hỗ trợ nâng cấp (level) làm tăng damage/range theo dữ
     liệu maxLevel/upgradeCost/upgradeDamageMult của công trình, và
     nhận thêm hệ số buff tạm thời (vd. kỹ năng Trống Trận) khi bắn.
   ========================================================= */

let __entityId = 0;
function nextEntityId() { return ++__entityId; }

/* ---------------- ĐỊCH ---------------- */
class Enemy {
  // hook toàn cục (được game.js gán) - dùng để hiện số sát thương bay lên
  static onHit = null;

  constructor(typeId, path) {
    const def = GAME_DATA.enemyTypes[typeId];
    this.id = nextEntityId();
    this.typeId = typeId;
    this.def = def;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.speed = def.speed;
    this.defense = def.defense || 0;
    this.resistance = def.resistance || 0;
    this.isBoss = !!def.boss;
    this.path = path;
    this.wpIndex = 0;
    this.x = path[0].x;
    this.y = path[0].y;
    this.alive = true;
    this.reachedCastle = false;
    /* Hệ thống trạng thái chung (Giai đoạn 3): slow/freeze/stun/burn/bleed.
       Mỗi phần tử: { type, value, duration, timer, tickAcc, sourceId }.
       Không cộng dồn vô hạn: cùng loại chỉ giữ giá trị/thời lượng cao hơn
       (refresh), không xếp chồng nhiều bản sao cùng loại. */
    this.statusEffects = [];
    this._effectiveSpeedMult = 1;
    this._stunned = false;
  }

  /* API hợp nhất cho mọi hiệu ứng trạng thái tháp/kỹ năng gây ra.
     effect = { type: "slow"|"freeze"|"stun"|"burn"|"bleed", value, duration, sourceId } */
  applyStatusEffect(effect) {
    if (!this.alive || !effect || !effect.type || effect.type === "none") return;
    const existing = this.statusEffects.find((s) => s.type === effect.type);
    if (existing) {
      existing.value = Math.max(existing.value, effect.value || 0);
      existing.duration = Math.max(existing.duration, effect.duration || 0);
      existing.timer = existing.duration;
    } else {
      this.statusEffects.push({
        type: effect.type,
        value: effect.value || 0,
        duration: effect.duration || 0,
        timer: effect.duration || 0,
        tickAcc: 0,
        sourceId: effect.sourceId || null,
      });
    }
  }

  /* Tương thích ngược: mã cũ có thể còn gọi applySlow trực tiếp. */
  applySlow(multiplier, duration) {
    this.applyStatusEffect({ type: "slow", value: 1 - multiplier, duration });
  }

  hasStatus(type) {
    return this.statusEffects.some((s) => s.type === type);
  }

  _processStatusEffects(dt) {
    let speedMult = 1;
    let stunned = false;
    for (let i = this.statusEffects.length - 1; i >= 0; i--) {
      const s = this.statusEffects[i];
      s.timer -= dt;
      switch (s.type) {
        case "slow":
          speedMult = Math.min(speedMult, Math.max(0, 1 - s.value));
          break;
        case "freeze":
          speedMult = 0;
          break;
        case "stun":
          stunned = true;
          speedMult = 0;
          break;
        case "burn":
        case "bleed":
          s.tickAcc += dt;
          while (s.tickAcc >= 1 && this.alive) {
            s.tickAcc -= 1;
            this.takeDamage(s.value, { isDot: true, sourceId: s.sourceId });
            if (typeof EffectManager !== "undefined") {
              EffectManager.spawnStatusPuff(this.x, this.y, s.type);
            }
          }
          break;
      }
      if (s.timer <= 0) this.statusEffects.splice(i, 1);
    }
    this._effectiveSpeedMult = Math.max(0, speedMult);
    this._stunned = stunned;
  }

  update(dt) {
    if (!this.alive) return;
    this._processStatusEffects(dt);
    if (!this.alive) return; // DOT (burn/bleed) có thể vừa giết địch
    if (this._stunned) return; // đứng yên hoàn toàn khi bị Stun
    const target = this.path[this.wpIndex + 1];
    if (!target) {
      this.reachedCastle = true;
      this.alive = false;
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * this._effectiveSpeedMult * dt;
    if (step >= dist) {
      this.x = target.x;
      this.y = target.y;
      this.wpIndex++;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  /* Pipeline sát thương thật (Giai đoạn 3):
       amount (đã gồm Hero% + Level tháp + Critical, tính ở Projectile)
         -> Armor Penetration (giảm Defense hiệu dụng)
         -> Defense (trừ phẳng)
         -> Resistance (giảm theo %)
         -> Sát thương cuối cùng
     meta = { isCritical, armorPen, isDot, sourceId }
     Sát thương theo thời gian (Burn/Bleed) bỏ qua Defense/Resistance,
     đúng quy ước Tower Defense phổ biến, để hiệu ứng luôn có tác dụng
     kể cả lên địch giáp dày. */
  takeDamage(amount, meta = {}) {
    if (!this.alive) return;
    let real = amount;
    if (!meta.isDot) {
      const effectiveDefense = Math.max(0, this.defense * (1 - (meta.armorPen || 0) / 100));
      real = Math.max(0, amount - effectiveDefense);
      if (this.resistance > 0) real = real * (1 - this.resistance / 100);
    }
    real = Math.max(1, Math.round(real));
    this.hp -= real;
    if (Enemy.onHit) Enemy.onHit(this.x, this.y, real, !!meta.isCritical);
    if (this.hp <= 0 && this.alive) {
      this.alive = false;
      this.killed = true;
      if (typeof EffectManager !== "undefined") {
        EffectManager.spawnDeathBurst(this.x, this.y, this.def.color, this.isBoss);
      }
    }
  }

  static _statusIcon(type) {
    switch (type) {
      case "burn": return "🔥";
      case "bleed": return "🩸";
      case "freeze": return "❄️";
      case "stun": return "⚡";
      case "slow": return "🐌";
      default: return "";
    }
  }

  draw(ctx, showHpBar) {
    const r = this.def.radius;
    const t = (this._animT = (this._animT || Math.random() * 10) + 1 / 60);
    const bob = this._stunned ? 0 : Math.sin(t * 8 + this.id) * 1.4;

    // hào quang boss (vòng quầng đỏ mờ pulsing phía sau)
    if (this.isBoss) {
      const pulse = 0.55 + Math.sin(t * 3) * 0.18;
      const glow = ctx.createRadialGradient(this.x, this.y, r * 0.4, this.x, this.y, r * 2.1);
      glow.addColorStop(0, `rgba(232,200,115,${0.28 * pulse})`);
      glow.addColorStop(1, "rgba(232,200,115,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // bóng đổ dưới chân
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.75, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fill();

    // thân (gradient để có chiều sâu thay vì fill phẳng)
    const bodyY = this.y + bob;
    const grad = ctx.createRadialGradient(
      this.x - r * 0.3, bodyY - r * 0.35, r * 0.15,
      this.x, bodyY, r * 1.15
    );
    grad.addColorStop(0, this._lighten(this.def.color, 28));
    grad.addColorStop(1, this.def.color);
    ctx.beginPath();
    ctx.arc(this.x, bodyY, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = this.isBoss ? 3 : 2;
    ctx.strokeStyle = this.isBoss ? "#e8c873" : "rgba(0,0,0,.4)";
    ctx.stroke();
    // vòng xanh khi đang bị làm chậm/đóng băng/choáng
    if (this._effectiveSpeedMult < 1 || this._stunned) {
      ctx.beginPath();
      ctx.arc(this.x, bodyY, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = this._stunned ? "rgba(232,200,115,.85)" : "rgba(120,200,230,.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // icon
    ctx.font = `${r}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.icon, this.x, bodyY);
    // huy hiệu trạng thái (Burn/Freeze/Slow/Stun/Bleed) phía trên đầu
    if (this.statusEffects.length > 0) {
      ctx.font = "11px serif";
      let ix = this.x - (this.statusEffects.length - 1) * 6;
      for (const s of this.statusEffects) {
        const icon = Enemy._statusIcon(s.type);
        if (icon) ctx.fillText(icon, ix, bodyY - r - 16);
        ix += 12;
      }
    }
    // thanh máu (viền + gradient để trông sắc nét, chuyên nghiệp hơn)
    if (showHpBar !== false) {
      const barW = r * 2.2;
      const pct = Math.max(0, this.hp / this.maxHp);
      const barY = bodyY - r - 10;
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(this.x - barW / 2 - 1, barY - 1, barW + 2, 7);
      ctx.fillStyle = "rgba(0,0,0,.4)";
      ctx.fillRect(this.x - barW / 2, barY, barW, 5);
      const hpGrad = ctx.createLinearGradient(this.x - barW / 2, 0, this.x + barW / 2, 0);
      if (pct > 0.4) { hpGrad.addColorStop(0, "#5a9e4f"); hpGrad.addColorStop(1, "#9bde6a"); }
      else { hpGrad.addColorStop(0, "#8a2f2f"); hpGrad.addColorStop(1, "#e0655f"); }
      ctx.fillStyle = hpGrad;
      ctx.fillRect(this.x - barW / 2, barY, barW * pct, 5);
    }
  }

  /* Làm sáng một màu hex thêm `amt` đơn vị (dùng cho gradient thân địch/tháp) */
  _lighten(hex, amt) {
    if (!hex || hex[0] !== "#") return hex;
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + amt;
    let g = ((num >> 8) & 0xff) + amt;
    let b = (num & 0xff) + amt;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `rgb(${r},${g},${b})`;
  }
}

/* ---------------- QUÂN THỦ THÀNH (THÁP) ---------------- */
class Tower {
  constructor(typeId, x, y) {
    const def = GAME_DATA.towerTypes[typeId];
    this.id = nextEntityId();
    this.typeId = typeId;
    this.def = def;
    this.x = x;
    this.y = y;
    this.cooldown = 0;
    this.targetId = null;
    this.level = 1;
    this.maxLevel = def.maxLevel || 1;
  }

  /* Chỉ số hiệu dụng sau khi tính nâng cấp (level) */
  effectiveDamage() {
    const mult = 1 + (this.level - 1) * (this.def.upgradeDamageMult || 0);
    return this.def.damage * mult;
  }
  effectiveRange() {
    const mult = 1 + (this.level - 1) * (this.def.upgradeRangeMult || 0);
    return this.def.range * mult;
  }
  nextUpgradeCost() {
    if (this.level >= this.maxLevel) return null;
    return Math.round((this.def.upgradeCost || 0) * this.level);
  }
  upgrade() {
    if (this.level >= this.maxLevel) return false;
    this.level += 1;
    return true;
  }

  findTarget(enemies) {
    let best = null;
    let bestProgress = -1;
    const range = this.effectiveRange();
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= range) {
        // ưu tiên địch đi xa nhất trên đường (wpIndex cao nhất)
        if (e.wpIndex > bestProgress) {
          bestProgress = e.wpIndex;
          best = e;
        }
      }
    }
    return best;
  }

  /* buff = { fireRateMult, damageMult } áp dụng tạm thời (vd. kỹ năng) */
  update(dt, enemies, projectiles, buff) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const target = this.findTarget(enemies);
    if (!target) return;
    const fireRateMult = (buff && buff.fireRateMult) || 1;
    const damageMult = (buff && buff.damageMult) || 1;
    projectiles.push(new Projectile(this, target, damageMult));
    this.cooldown = 1 / (this.def.fireRate * fireRateMult);
    this._recoil = 1;
    if (typeof EffectManager !== "undefined") {
      const angle = Math.atan2(target.y - this.y, target.x - this.x);
      EffectManager.spawnMuzzleFlash(
        this.x + Math.cos(angle) * 18,
        this.y + Math.sin(angle) * 18,
        angle,
        this.def.color
      );
    }
  }

  draw(ctx) {
    // hồi phục hiệu ứng "giật lùi" nhẹ sau mỗi phát bắn để trông sống động
    if (this._recoil === undefined) this._recoil = 0;
    this._recoil = Math.max(0, this._recoil - 0.08);
    const scale = 1 - this._recoil * 0.06;

    // bệ tháp: bóng + vòng nền gradient thay vì khối phẳng đơn sắc
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 16, 22, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);
    const baseGrad = ctx.createRadialGradient(-5, -6, 3, 0, 0, 22);
    baseGrad.addColorStop(0, "#4a382a");
    baseGrad.addColorStop(1, "#241a12");
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fillStyle = baseGrad;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = this.def.color;
    ctx.stroke();
    // vòng thếp vàng mỏng bên trong cho cảm giác "cao cấp"
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(201,162,74,.35)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.icon, 0, 0);
    ctx.restore();

    if (this.level > 1) {
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(this.x - 14, this.y + 19, 28, 13);
      ctx.fillStyle = "#e8c873";
      ctx.fillText("Lv" + this.level, this.x, this.y + 26);
    }
  }

  drawRange(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.effectiveRange(), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(201,162,74,.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(201,162,74,.35)";
    ctx.stroke();
  }
}

/* ---------------- ĐẠN ---------------- */
class Projectile {
  constructor(tower, target, damageMult) {
    this.id = nextEntityId();
    this.x = tower.x;
    this.y = tower.y;
    this.baseDamage = tower.effectiveDamage() * (damageMult || 1);
    this.speed = tower.def.projectileSpeed;
    this.splashRadius = tower.def.splashRadius || 0;
    this.color = tower.def.color;
    this.targetId = target.id;
    this.alive = true;

    /* Combat Engine (Giai đoạn 3): Critical + Armor Penetration + hiệu ứng
       trạng thái thống nhất. Tương thích ngược với dữ liệu cũ (chỉ có
       slowFactor/slowDuration, chưa qua migration) bằng cách suy ra
       effectType = "slow" nếu effectType chưa được định nghĩa. */
    this.criticalChance = tower.def.criticalChance || 0;
    this.criticalMultiplier = tower.def.criticalMultiplier || 1.5;
    this.armorPenetration = tower.def.armorPenetration || 0;
    let effType = tower.def.effectType;
    let effValue = tower.def.effectValue;
    let effDuration = tower.def.effectDuration;
    if ((effType === undefined || effType === null) && tower.def.slowFactor) {
      effType = "slow";
      effValue = tower.def.slowFactor;
      effDuration = tower.def.slowDuration || 2;
    }
    this.effectType = effType && effType !== "none" ? effType : null;
    this.effectValue = effValue || 0;
    this.effectDuration = effDuration || 0;
    this.sourceId = tower.id;
  }

  update(dt, enemies) {
    const target = enemies.find(e => e.id === this.targetId && e.alive);
    if (!target) { this.alive = false; return; }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (step >= dist) {
      this.hit(target, enemies);
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  hit(target, enemies) {
    this.alive = false;
    const isCritical = Math.random() * 100 < this.criticalChance;
    const finalDamage = this.baseDamage * (isCritical ? this.criticalMultiplier : 1);
    const meta = { isCritical, armorPen: this.armorPenetration, sourceId: this.sourceId };
    if (this.splashRadius > 0) {
      if (typeof EffectManager !== "undefined") {
        EffectManager.spawnExplosion(target.x, target.y, this.splashRadius, this.color);
      }
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= this.splashRadius) {
          e.takeDamage(finalDamage, meta);
          this._applyEffectIfAny(e);
        }
      }
    } else {
      if (typeof EffectManager !== "undefined") {
        EffectManager.spawnImpactRing(target.x, target.y, this.color, false);
      }
      target.takeDamage(finalDamage, meta);
      this._applyEffectIfAny(target);
    }
  }

  _applyEffectIfAny(enemy) {
    if (this.effectType && enemy.alive) {
      enemy.applyStatusEffect({
        type: this.effectType,
        value: this.effectValue,
        duration: this.effectDuration,
        sourceId: this.sourceId,
      });
    }
  }

  draw(ctx) {
    // vệt sáng nhỏ phía sau đạn để tạo cảm giác tốc độ
    if (this._prevX !== undefined) {
      ctx.strokeStyle = this.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this._prevX, this._prevY);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this._prevX = this.x;
    this._prevY = this.y;

    // quầng sáng nhẹ quanh đầu đạn
    const glow = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 8);
    glow.addColorStop(0, "rgba(255,255,255,.9)");
    glow.addColorStop(0.35, this.color);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff8e6";
    ctx.fill();
  }
}
