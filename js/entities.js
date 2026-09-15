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
  // hook toàn cục (được game.js gán) - Boss đổi phase / dùng skill
  static onBossEvent = null;

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
    this._statusSpeedMult = 1;
    this._stunned = false;

    /* Boss Engine (Giai đoạn 3, Priority 2): Phase theo %HP + Skill thật
       (self_buff / summon / heal_self), đọc từ def.phases/def.abilities
       do DataService.buildGameData() trộn vào từ collection "bosses". */
    if (this.isBoss) {
      this.phases = def.phases || [];
      this.abilities = (def.abilities || []).map((a) => ({
        ...a,
        cooldownRemaining: 0,
        triggeredOnce: false,
        _intervalTimer: 0,
      }));
      this.currentPhase = null;
      this._bossSpeedMult = 1;
      this._bossDamageMult = 1;
      this.pendingSummons = []; // Game.update() rút ra để spawn quân, rồi xoá
    }
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
          }
          break;
      }
      if (s.timer <= 0) this.statusEffects.splice(i, 1);
    }
    this._statusSpeedMult = Math.max(0, speedMult);
    this._stunned = stunned;
  }

  /* Boss Phase Engine (mục XIV-XVI): xác định phase hiện tại theo %HP,
     bắn sự kiện phase_change cho UI (thanh máu Boss/hiệu ứng), rồi xét
     từng ability xem có kích hoạt hay không. Không "giả" tính năng: mọi
     hiệu ứng ở đây đều thật sự làm thay đổi speed/damage/HP/spawn quân. */
  _processBossAbilities(dt) {
    if (!this.alive) return;
    const pct = Math.max(0, (this.hp / this.maxHp) * 100);

    // 1) Xác định phase theo %HP còn lại (hpToPct <= pct <= hpFromPct)
    const phase = this.phases.find((p) => pct <= p.hpFromPct && pct > p.hpToPct) ||
      this.phases[this.phases.length - 1] || null;
    if (phase && phase !== this.currentPhase) {
      this.currentPhase = phase;
      if (Enemy.onBossEvent) Enemy.onBossEvent(this, { type: "phase_change", phase });
    }

    // 2) Duyệt qua từng skill thật của Boss
    let abilitySpeedBonus = 0;
    let abilityDamageBonus = 0;
    for (const a of this.abilities) {
      if (a.cooldownRemaining > 0) a.cooldownRemaining -= dt;
      const trig = a.trigger || {};
      let shouldFire = false;
      let continuousActive = false;

      if (trig.type === "hp_below") {
        if (pct <= trig.percent) {
          continuousActive = true;
          if ((!a.once || !a.triggeredOnce) && a.cooldownRemaining <= 0) shouldFire = true;
        }
      } else if (trig.type === "hp_above") {
        if (pct >= trig.percent) {
          continuousActive = true;
          if (a.continuous) {
            // buff chỉ tồn tại khi điều kiện còn đúng (vd. Xung Phong Ải Hẹp)
            if (a.effect === "self_buff") {
              abilitySpeedBonus += a.speedBonus || 0;
              abilityDamageBonus += a.damageBonus || 0;
            }
          } else if ((!a.once || !a.triggeredOnce) && a.cooldownRemaining <= 0) {
            shouldFire = true;
          }
        }
      } else if (trig.type === "interval") {
        a._intervalTimer += dt;
        if (a._intervalTimer >= (trig.seconds || 5) && a.cooldownRemaining <= 0) {
          shouldFire = true;
          a._intervalTimer = 0;
        }
      }

      if (shouldFire) {
        a.triggeredOnce = true;
        if (a.cooldown) a.cooldownRemaining = a.cooldown;
        this._fireBossAbility(a);
      }
      // self_buff kiểu "once" (không continuous) cộng dồn vĩnh viễn sau khi kích hoạt
      if (a.effect === "self_buff" && a.triggeredOnce && !a.continuous) {
        abilitySpeedBonus += a.speedBonus || 0;
        abilityDamageBonus += a.damageBonus || 0;
      }
    }

    const phaseSpeedMult = phase ? phase.speedMult : 1;
    const phaseDamageMult = phase ? phase.damageMult : 1;
    this._bossSpeedMult = phaseSpeedMult * (1 + abilitySpeedBonus);
    this._bossDamageMult = phaseDamageMult * (1 + abilityDamageBonus);
  }

  _fireBossAbility(a) {
    if (a.effect === "summon") {
      this.pendingSummons.push({ type: a.summonType, count: a.summonCount || 1 });
    } else if (a.effect === "heal_self") {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * ((a.healPercent || 0) / 100));
    }
    // "self_buff" được cộng vào bộ đệm speed/damage ngay trong _processBossAbilities
    if (Enemy.onBossEvent) Enemy.onBossEvent(this, { type: "ability_used", ability: a });
  }

  update(dt) {
    if (!this.alive) return;
    this._processStatusEffects(dt);
    if (!this.alive) return; // DOT (burn/bleed) có thể vừa giết địch
    if (this.isBoss) this._processBossAbilities(dt);
    this._effectiveSpeedMult = this._statusSpeedMult * (this.isBoss ? this._bossSpeedMult : 1);
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

  /* Sát thương Boss gây cho thành khi đến đích, đã gồm buff từ Skill/Phase. */
  getEffectiveDamage() {
    return this.isBoss ? Math.round(this.def.damage * (this._bossDamageMult || 1)) : this.def.damage;
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
    // thân
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.def.color;
    ctx.fill();
    ctx.lineWidth = this.isBoss ? 3 : 2;
    ctx.strokeStyle = this.isBoss ? "#e8c873" : "rgba(0,0,0,.4)";
    ctx.stroke();
    // vòng xanh khi đang bị làm chậm/đóng băng/choáng
    if (this._effectiveSpeedMult < 1 || this._stunned) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
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
    ctx.fillText(this.def.icon, this.x, this.y);
    // huy hiệu trạng thái (Burn/Freeze/Slow/Stun/Bleed) phía trên đầu
    if (this.statusEffects.length > 0) {
      ctx.font = "11px serif";
      let ix = this.x - (this.statusEffects.length - 1) * 6;
      for (const s of this.statusEffects) {
        const icon = Enemy._statusIcon(s.type);
        if (icon) ctx.fillText(icon, ix, this.y - r - 16);
        ix += 12;
      }
    }
    // thanh máu
    if (showHpBar !== false) {
      const barW = r * 2.2;
      const pct = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(this.x - barW / 2, this.y - r - 10, barW, 5);
      ctx.fillStyle = pct > 0.4 ? "#7bc96f" : "#c94f4f";
      ctx.fillRect(this.x - barW / 2, this.y - r - 10, barW * pct, 5);
    }
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
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(46,33,25,.9)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.def.color;
    ctx.stroke();
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.icon, this.x, this.y);
    if (this.level > 1) {
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#e8c873";
      ctx.fillText("Lv" + this.level, this.x, this.y + 24);
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
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= this.splashRadius) {
          e.takeDamage(finalDamage, meta);
          this._applyEffectIfAny(e);
        }
      }
    } else {
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
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}
