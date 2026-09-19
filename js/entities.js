/* =========================================================
   ENTITIES.JS  (Giai đoạn 4)
   Các "lớp" thực thể trong trận: Địch (Enemy), Quân thủ thành (Tower),
   Đạn (Projectile) và Tướng ra trận (Hero).

   MỚI SO VỚI GIAI ĐOẠN 3
   ----------------------
   1. SÁT THƯƠNG CÓ LOẠI: "physical" bị GIÁP (defense) trừ phẳng rồi bị
      Kháng vật lý (resistance %) chặn tiếp; "magic" bỏ qua giáp nhưng bị
      KHÁNG PHÉP (magicResist %) chặn; "true" xuyên mọi thứ.
   2. CHÍ MẠNG có thể bị KHÁNG (critResist) - địch bọc thép rất khó ăn crit.
   3. HIỆU ỨNG: slow, freeze, stun, burn, poison, bleed - đều thật sự tác
      động tới tốc độ/máu, có biểu tượng riêng trên đầu địch.
   4. HÀNH VI ĐỊCH (behavior): normal / dash / armored / flying / healer /
      shield / regen / splitter / boss - engine xử lý thật.
   5. THÁP: có damageType, chế độ ƯU TIÊN MỤC TIÊU, CÂY NÂNG CẤP 2 nhánh,
      tháp HỖ TRỢ (aura) không bắn mà buff tháp xung quanh, có thể bị Boss
      VÔ HIỆU HOÁ tạm thời, và có giá BÁN dựa trên tổng vốn đã bỏ ra.
   6. TƯỚNG (Hero) đứng thật trên bản đồ, tự đánh, có animation riêng.
   ========================================================= */

let __entityId = 0;
function nextEntityId() { return ++__entityId; }

/* Danh sách chế độ ưu tiên mục tiêu dùng chung cho UI và engine. */
const TARGET_PRIORITIES = [
  { id: "first", name: "Đi đầu", icon: "🚩", hint: "Đánh kẻ đi xa nhất trên đường" },
  { id: "last", name: "Đi cuối", icon: "🔚", hint: "Đánh kẻ mới vào trận" },
  { id: "strongest", name: "Máu cao", icon: "💪", hint: "Đánh kẻ nhiều máu nhất" },
  { id: "weakest", name: "Máu thấp", icon: "🩹", hint: "Dứt điểm kẻ sắp chết" },
  { id: "fastest", name: "Nhanh nhất", icon: "💨", hint: "Chặn kẻ chạy nhanh nhất" },
  { id: "closest", name: "Gần nhất", icon: "🎯", hint: "Đánh kẻ gần tháp nhất" },
  { id: "boss", name: "Boss/Elite", icon: "👹", hint: "Ưu tiên Boss và Elite" },
];

/* Biểu tượng + màu của từng hiệu ứng trạng thái (dùng cho cả vẽ lẫn tooltip) */
const STATUS_META = {
  slow:   { icon: "🐌", color: "#78c8e6", name: "Làm chậm" },
  freeze: { icon: "❄️", color: "#9fe3ff", name: "Đóng băng" },
  stun:   { icon: "⚡", color: "#e8c873", name: "Choáng" },
  burn:   { icon: "🔥", color: "#ff7a3d", name: "Bỏng" },
  poison: { icon: "☠️", color: "#8fd44a", name: "Trúng độc" },
  bleed:  { icon: "🩸", color: "#e04b4b", name: "Chảy máu" },
};

/* ---------------- ĐỊCH ---------------- */
class Enemy {
  static onHit = null;        // (x, y, amount, isCritical, damageType)
  static onBossEvent = null;  // (enemy, event)

  constructor(typeId, path, modifiers) {
    const def = GAME_DATA.enemyTypes[typeId];
    const mod = modifiers || {};
    this.id = nextEntityId();
    this.typeId = typeId;
    this.def = def;
    this.isElite = !!mod.elite;

    const hpMult = (mod.hpMultiplier || 1) * (this.isElite ? 1.6 : 1);
    const speedMult0 = mod.speedMultiplier || 1;
    this.maxHp = Math.max(1, Math.round(def.hp * hpMult));
    this.hp = this.maxHp;
    this.speed = def.speed * speedMult0;
    this.rewardMult = this.isElite ? 1.4 : 1;

    /* --- Phòng thủ --- */
    this.defense = (def.defense || 0) + (mod.armorBonus || 0) + (this.isElite ? 2 : 0);
    this.resistance = def.resistance || 0;             // kháng VẬT LÝ (%)
    this.magicResist = def.magicResist || 0;           // kháng PHÉP (%)
    this.critResist = def.critResist || (this.isElite ? 20 : 0); // kháng chí mạng (%)

    this.behavior = def.behavior || "normal";
    this.isBoss = !!def.boss;
    this.path = path;
    this.wpIndex = 0;
    this.x = path[0].x;
    this.y = path[0].y;
    this.alive = true;
    this.reachedCastle = false;
    this.statusEffects = [];
    this._effectiveSpeedMult = 1;
    this._statusSpeedMult = 1;
    this._extraSlow = 0;      // hào quang làm chậm của tướng (passive slow_aura)
    this._stunned = false;
    this._poisoned = false;
    this._animTime = Math.random() * 6; // lệch pha để đám đông không nhấp nháy đồng loạt

    /* --- Khiên hấp thụ (behavior "shield") --- */
    this.maxShield = this.behavior === "shield" ? Math.round((def.shieldAmount || 0) * hpMult) : 0;
    this.shield = this.maxShield;
    this._shieldIdle = 0;

    /* --- Bộ đếm riêng của từng hành vi --- */
    this._dashTimer = Math.random() * (def.dashInterval || 4);
    this._dashRemaining = 0;
    this._healTimer = 0;
    this.pendingHeals = [];   // healer: Game rút ra để hồi máu cho đồng đội
    this.pendingSplits = [];  // splitter: Game rút ra để sinh quân nhỏ khi chết

    /* --- Địch BAY: bay thẳng tới thành, không theo đường bộ --- */
    if (this.behavior === "flying") {
      this._flyTarget = (typeof Game !== "undefined" && Game.levelDef && Game.levelDef.castle)
        || path[path.length - 1];
    }

    /* --- Boss --- */
    if (this.isBoss) {
      this.phases = def.phases || [];
      this.abilities = (def.abilities || []).map((a) => ({
        ...a, cooldownRemaining: 0, triggeredOnce: false, _intervalTimer: 0,
      }));
      this.currentPhase = null;
      this._bossSpeedMult = 1;
      this._bossDamageMult = 1;
      this.pendingSummons = [];
      this.pendingTowerDisables = []; // { radius, seconds, x, y }
    }
  }

  /* ---------- Hiệu ứng trạng thái ---------- */
  applyStatusEffect(effect) {
    if (!this.alive || !effect || !effect.type || effect.type === "none") return;
    // Boss/Elite kháng khống chế: thời lượng Stun/Freeze bị rút ngắn
    let duration = effect.duration || 0;
    if (this.isBoss && (effect.type === "stun" || effect.type === "freeze")) duration *= 0.4;
    else if (this.isElite && (effect.type === "stun" || effect.type === "freeze")) duration *= 0.7;

    const existing = this.statusEffects.find((s) => s.type === effect.type);
    if (existing) {
      existing.value = Math.max(existing.value, effect.value || 0);
      existing.duration = Math.max(existing.duration, duration);
      existing.timer = existing.duration;
    } else {
      this.statusEffects.push({
        type: effect.type,
        value: effect.value || 0,
        duration,
        timer: duration,
        tickAcc: 0,
        sourceId: effect.sourceId || null,
      });
    }
  }

  applySlow(multiplier, duration) {
    this.applyStatusEffect({ type: "slow", value: 1 - multiplier, duration });
  }

  hasStatus(type) { return this.statusEffects.some((s) => s.type === type); }

  _processStatusEffects(dt) {
    let speedMult = 1;
    let stunned = false;
    let poisoned = false;
    for (let i = this.statusEffects.length - 1; i >= 0; i--) {
      const s = this.statusEffects[i];
      s.timer -= dt;
      switch (s.type) {
        case "slow":
          speedMult = Math.min(speedMult, Math.max(0.1, 1 - s.value));
          break;
        case "freeze":
          speedMult = 0;
          break;
        case "stun":
          stunned = true;
          speedMult = 0;
          break;
        case "poison":
          poisoned = true;
          /* rơi xuống nhánh dưới: độc cũng gây sát thương theo thời gian */
        case "burn":
        case "bleed":
          s.tickAcc += dt;
          while (s.tickAcc >= 0.5 && this.alive) {
            s.tickAcc -= 0.5;
            this.takeDamage(s.value * 0.5, { isDot: true, damageType: "true", sourceId: s.sourceId });
          }
          break;
      }
      if (s.timer <= 0) this.statusEffects.splice(i, 1);
    }
    if (this._extraSlow > 0) speedMult = Math.min(speedMult, Math.max(0.1, 1 - this._extraSlow));
    this._statusSpeedMult = Math.max(0, speedMult);
    this._stunned = stunned;
    this._poisoned = poisoned;
  }

  /* ---------- Hành vi riêng của từng loại địch ---------- */
  _processBehavior(dt) {
    let behaviorSpeedMult = 1;
    switch (this.behavior) {
      case "dash": {
        const interval = this.def.dashInterval || 4;
        if (this._dashRemaining > 0) {
          this._dashRemaining -= dt;
          behaviorSpeedMult = this.def.dashSpeedMult || 1.8;
        } else {
          this._dashTimer += dt;
          if (this._dashTimer >= interval) {
            this._dashTimer = 0;
            this._dashRemaining = this.def.dashDuration || 1.2;
          }
        }
        break;
      }
      case "regen": {
        // Tự hồi máu liên tục, TRỪ KHI đang trúng độc (độc chặn hồi máu)
        if (!this._poisoned && this.hp < this.maxHp) {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * ((this.def.regenPercent || 0) / 100) * dt);
        }
        break;
      }
      case "shield": {
        this._shieldIdle += dt;
        const delay = this.def.shieldRegenDelay || 4;
        if (this._shieldIdle >= delay && this.shield < this.maxShield) {
          this.shield = Math.min(this.maxShield, this.shield + (this.def.shieldRegenRate || 20) * dt);
        }
        break;
      }
      case "healer": {
        this._healTimer += dt;
        const iv = this.def.healInterval || 3;
        if (this._healTimer >= iv) {
          this._healTimer = 0;
          this.pendingHeals.push({
            radius: this.def.healRadius || 110,
            percent: this.def.healPercent || 8,
            x: this.x, y: this.y,
          });
        }
        break;
      }
    }
    return behaviorSpeedMult;
  }

  /* ---------- Boss Phase Engine + Skill ---------- */
  _processBossAbilities(dt) {
    if (!this.alive) return;
    const pct = Math.max(0, (this.hp / this.maxHp) * 100);

    const phase = this.phases.find((p) => pct <= p.hpFromPct && pct > p.hpToPct) ||
      this.phases[this.phases.length - 1] || null;
    if (phase && phase !== this.currentPhase) {
      this.currentPhase = phase;
      if (Enemy.onBossEvent) Enemy.onBossEvent(this, { type: "phase_change", phase });
    }

    let abilitySpeedBonus = 0;
    let abilityDamageBonus = 0;
    for (const a of this.abilities) {
      if (a.cooldownRemaining > 0) a.cooldownRemaining -= dt;
      const trig = a.trigger || {};
      let shouldFire = false;

      if (trig.type === "hp_below") {
        if (pct <= trig.percent && (!a.once || !a.triggeredOnce) && a.cooldownRemaining <= 0) shouldFire = true;
      } else if (trig.type === "hp_above") {
        if (pct >= trig.percent) {
          if (a.continuous) {
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
    } else if (a.effect === "shield_self") {
      const amount = Math.round(this.maxHp * ((a.shieldPercent || 15) / 100));
      this.maxShield = Math.max(this.maxShield, amount);
      this.shield = Math.min(this.maxShield, (this.shield || 0) + amount);
    } else if (a.effect === "tower_disable") {
      this.pendingTowerDisables.push({
        radius: a.disableRadius || 150,
        seconds: a.disableSeconds || 3,
        x: this.x, y: this.y,
      });
    }
    if (Enemy.onBossEvent) Enemy.onBossEvent(this, { type: "ability_used", ability: a });
  }

  /* ---------- Cập nhật ---------- */
  update(dt, mapSpeedMult) {
    if (!this.alive) return;
    this._animTime += dt;
    this._processStatusEffects(dt);
    if (!this.alive) return; // DOT có thể vừa giết
    const behaviorSpeedMult = this._processBehavior(dt);
    if (this.isBoss) this._processBossAbilities(dt);

    this._effectiveSpeedMult = this._statusSpeedMult * behaviorSpeedMult *
      (this.isBoss ? this._bossSpeedMult : 1) * (mapSpeedMult || 1);
    if (this._stunned) return;

    const step = this.speed * this._effectiveSpeedMult * dt;

    if (this.behavior === "flying") {
      // BAY thẳng tới thành, không quan tâm đường đi bộ
      const t = this._flyTarget || this.path[this.path.length - 1];
      const dx = t.x - this.x, dy = t.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= step || dist < 4) {
        this.reachedCastle = true;
        this.alive = false;
        return;
      }
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      // wpIndex quy đổi theo khoảng cách còn lại, để chế độ "Đi đầu" vẫn đúng
      this.wpIndex = Math.max(0, this.path.length - Math.min(this.path.length, Math.round(dist / 90)));
      return;
    }

    const target = this.path[this.wpIndex + 1];
    if (!target) {
      this.reachedCastle = true;
      this.alive = false;
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (step >= dist) {
      this.x = target.x;
      this.y = target.y;
      this.wpIndex++;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  getEffectiveDamage() {
    return this.isBoss ? Math.round(this.def.damage * (this._bossDamageMult || 1)) : this.def.damage;
  }

  /* Tỉ lệ chí mạng thực tế sau khi trừ kháng chí mạng của địch. */
  critChanceAgainst(baseChance) {
    return Math.max(0, (baseChance || 0) * (1 - (this.critResist || 0) / 100));
  }

  /* ---------- PIPELINE SÁT THƯƠNG ----------
       amount (đã gồm buff tháp/tướng/level/nhánh + chí mạng)
         -> Khiên hấp thụ trước
         -> physical: Armor Penetration -> Giáp (trừ phẳng) -> Kháng vật lý (%)
            magic   : Kháng phép (%)
            true/DOT: xuyên mọi thứ  */
  takeDamage(amount, meta = {}) {
    if (!this.alive) return 0;
    const type = meta.damageType || "physical";
    let real = amount;

    if (!meta.isDot && type !== "true") {
      if (type === "magic") {
        real = amount * (1 - Math.max(0, this.magicResist) / 100);
      } else {
        const effectiveDefense = Math.max(0, this.defense * (1 - (meta.armorPen || 0) / 100));
        real = Math.max(0, amount - effectiveDefense);
        if (this.resistance > 0) real = real * (1 - this.resistance / 100);
      }
    }
    real = Math.max(1, Math.round(real));

    // Khiên hấp thụ trước máu
    if (this.shield > 0) {
      this._shieldIdle = 0;
      const absorbed = Math.min(this.shield, real);
      this.shield -= absorbed;
      real -= absorbed;
      if (Enemy.onHit && absorbed > 0) Enemy.onHit(this.x, this.y, absorbed, false, "shield");
      if (real <= 0) return absorbed;
    }

    this.hp -= real;
    if (Enemy.onHit) Enemy.onHit(this.x, this.y, real, !!meta.isCritical, type);
    if (this.hp <= 0 && this.alive) {
      this.alive = false;
      this.killed = true;
      if (this.behavior === "splitter" && this.def.splitInto) {
        this.pendingSplits.push({
          type: this.def.splitInto,
          count: this.def.splitCount || 2,
          hpPercent: this.def.splitHpPercent || 45,
          x: this.x, y: this.y, wpIndex: this.wpIndex,
        });
      }
    }
    return real;
  }

  /* ---------- Vẽ ---------- */
  draw(ctx, showHpBar) {
    const r = this.def.radius;
    const bob = Math.sin(this._animTime * 6) * (this.behavior === "flying" ? 3.5 : 1.2);
    const y = this.y + bob;

    if (this.isBoss) {
      const enraged = this.currentPhase && this.currentPhase.enrage;
      const pulse = 1 + Math.sin(this._animTime * (enraged ? 9 : 4)) * 0.14;
      const auraR = (r + 10) * pulse;
      const grad = ctx.createRadialGradient(this.x, y, r * 0.6, this.x, y, auraR);
      grad.addColorStop(0, enraged ? "rgba(255,92,61,.42)" : "rgba(232,200,115,.28)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.beginPath();
      ctx.arc(this.x, y, auraR, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // bóng đổ - địch BAY có bóng tách rời nên nhận ra ngay
    ctx.beginPath();
    ctx.ellipse(this.x, this.y + r * 0.85, r * 0.75, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fill();

    if (this.isElite) {
      ctx.beginPath();
      ctx.arc(this.x, y, r + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(232,200,115,.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(this.x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.def.color;
    ctx.fill();
    ctx.lineWidth = this.isBoss ? 3 : (this.isElite ? 2.5 : 2);
    ctx.strokeStyle = this.isBoss ? "#e8c873" : (this.isElite ? "#e8c873" : "rgba(0,0,0,.4)");
    ctx.stroke();

    if (this._effectiveSpeedMult < 1 || this._stunned) {
      ctx.beginPath();
      ctx.arc(this.x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = this._stunned ? "rgba(232,200,115,.85)" : "rgba(120,200,230,.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = r + "px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.icon, this.x, y);

    if (this.statusEffects.length > 0) {
      ctx.font = "11px serif";
      let ix = this.x - (this.statusEffects.length - 1) * 6;
      for (const s of this.statusEffects) {
        const meta = STATUS_META[s.type];
        if (meta) ctx.fillText(meta.icon, ix, y - r - 18);
        ix += 12;
      }
    }

    if (showHpBar !== false) {
      const barW = r * 2.2;
      const barY = y - r - 10;
      const pct = Math.max(0, this.hp / this.maxHp);
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(this.x - barW / 2, barY, barW, 5);
      ctx.fillStyle = pct > 0.4 ? "#7bc96f" : "#c94f4f";
      ctx.fillRect(this.x - barW / 2, barY, barW * pct, 5);
      if (this.maxShield > 0 && this.shield > 0) {
        ctx.fillStyle = "#79c8f0";
        ctx.fillRect(this.x - barW / 2, barY - 4, barW * Math.min(1, this.shield / this.maxShield), 3);
      }
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
    this.level = 1;
    this.maxLevel = def.maxLevel || 1;
    this.branchId = null;                 // nhánh đã chọn trong cây nâng cấp
    this.targetPriority = def.targetPriority || "first";
    this.isSupport = !!def.isSupport;
    this.totalInvested = def.cost || 0;   // dùng để tính tiền bán
    this.disabledFor = 0;                 // > 0 => bị Boss vô hiệu hoá
    this.killCount = 0;
    this._animTime = 0;
    this._recoil = 0;                     // hiệu ứng giật khi bắn
    this._aura = { damage: 0, fireRate: 0, range: 0 };            // từ tháp hỗ trợ
    this._heroBuff = { damage: 0, fireRate: 0, range: 0, crit: 0 }; // bị động của tướng
  }

  branch() {
    const tree = this.def.upgradeTree;
    if (!tree || !this.branchId) return null;
    return (tree.branches || []).find((b) => b.id === this.branchId) || null;
  }

  /* Đã tới cấp phải CHỌN nhánh nhưng chưa chọn? */
  needsBranchChoice() {
    const tree = this.def.upgradeTree;
    if (!tree || this.branchId) return false;
    return this.level + 1 >= (tree.branchAt || 3) && this.level < this.maxLevel;
  }

  availableBranches() {
    const tree = this.def.upgradeTree;
    return tree ? (tree.branches || []) : [];
  }

  /* ---------- Chỉ số hiệu dụng ---------- */
  effectiveDamage() {
    const b = this.branch();
    const levelMult = 1 + (this.level - 1) * (this.def.upgradeDamageMult || 0);
    const branchMult = b && b.damageMult ? b.damageMult : 1;
    const auraMult = 1 + (this._aura.damage || 0) + (this._heroBuff.damage || 0);
    // Giai đoạn 6: các MỐC TIẾN HOÁ (1/3/5/7/9/10) cộng thêm một bước nhảy
    // sức mạnh, ngoài mức tăng đều mỗi cấp.
    const tierMult = (typeof TowerTiers !== "undefined") ? TowerTiers.powerMultiplier(this.def, this.level) : 1;
    return this.def.damage * levelMult * branchMult * auraMult * tierMult;
  }
  effectiveRange() {
    const b = this.branch();
    const levelMult = 1 + (this.level - 1) * (this.def.upgradeRangeMult || 0);
    const branchMult = b && b.rangeMult ? b.rangeMult : 1;
    const tierMult = (typeof TowerTiers !== "undefined") ? TowerTiers.rangeMultiplier(this.def, this.level) : 1;
    const auraMult = (1 + (this._aura.range || 0) + (this._heroBuff.range || 0)) * tierMult;
    return this.def.range * levelMult * branchMult * auraMult;
  }
  effectiveFireRate() {
    const b = this.branch();
    const branchMult = b && b.fireRateMult ? b.fireRateMult : 1;
    const auraMult = 1 + (this._aura.fireRate || 0) + (this._heroBuff.fireRate || 0);
    return this.def.fireRate * branchMult * auraMult;
  }
  effectiveSplash() {
    const b = this.branch();
    return (this.def.splashRadius || 0) + (b && b.splashRadiusBonus ? b.splashRadiusBonus : 0);
  }
  effectiveCritChance() {
    const b = this.branch();
    return (this.def.criticalChance || 0) + (b && b.critChanceBonus ? b.critChanceBonus : 0) + (this._heroBuff.crit || 0);
  }
  effectiveCritMultiplier() {
    const b = this.branch();
    return (this.def.criticalMultiplier || 1.5) + (b && b.critMultiplierBonus ? b.critMultiplierBonus : 0);
  }
  effectiveArmorPen() {
    const b = this.branch();
    return (this.def.armorPenetration || 0) + (b && b.armorPenBonus ? b.armorPenBonus : 0);
  }
  damageType() {
    const b = this.branch();
    return (b && b.damageType) || this.def.damageType || "physical";
  }
  effectiveEffect() {
    const b = this.branch();
    let type = this.def.effectType, value = this.def.effectValue, duration = this.def.effectDuration;
    if (b && b.effectType) { type = b.effectType; value = b.effectValue; duration = b.effectDuration; }
    if ((type === undefined || type === null) && this.def.slowFactor) {
      type = "slow"; value = this.def.slowFactor; duration = this.def.slowDuration || 2;
    }
    if (!type || type === "none") return null;
    return { type, value: value || 0, duration: duration || 0 };
  }

  /* Hào quang mà tháp HỖ TRỢ phát ra (đã tính cấp + nhánh) */
  auraOutput() {
    if (!this.isSupport) return null;
    const b = this.branch();
    const lvlMult = 1 + (this.level - 1) * (this.def.upgradeAuraMult || 0.2);
    return {
      radius: this.effectiveRange(),
      damage: ((this.def.auraDamageBonus || 0) + (b && b.auraDamageBonusAdd ? b.auraDamageBonusAdd : 0)) * lvlMult,
      fireRate: ((this.def.auraFireRateBonus || 0) + (b && b.auraFireRateBonusAdd ? b.auraFireRateBonusAdd : 0)) * lvlMult,
      range: (this.def.auraRangeBonus || 0) * lvlMult,
    };
  }

  /* ---------- Nâng cấp / bán ---------- */
  /* Tên hiển thị theo MỐC TIẾN HOÁ hiện tại (vd. "THẦN CUNG HOA LƯ"). */
  displayName() {
    return (typeof TowerTiers !== "undefined")
      ? TowerTiers.nameAt(this.def, this.level)
      : (this.def.name || "");
  }

  /* Mốc tiến hoá hiện tại / kế tiếp. */
  tier() {
    return (typeof TowerTiers !== "undefined") ? TowerTiers.at(this.def, this.level) : null;
  }
  nextTier() {
    return (typeof TowerTiers !== "undefined") ? TowerTiers.next(this.def, this.level) : null;
  }

  nextUpgradeCost() {
    if (this.level >= this.maxLevel) return null;
    // Đường giá cho 10 cấp: tăng dần đều, riêng hai mốc TIẾN HOÁ (5 và 10)
    // đắt hơn hẳn để việc lên mốc thật sự là một quyết định.
    const target = this.level + 1;
    // Hệ số theo MỐC của cấp đích: giá luôn tăng đều, hai mốc tiến hoá
    // (Lv5, Lv10) đắt hẳn lên nhưng không bao giờ rẻ hơn cấp trước.
    const tierFactor = [1, 1.15, 1.45, 1.7, 2.0, 2.6];
    const ti = (typeof TowerTiers !== "undefined") ? TowerTiers.indexOf(this.def, target) : 0;
    const cost = (this.def.upgradeCost || 0) * (1 + (this.level - 1) * 0.85) * (tierFactor[ti] || 1);
    return Math.round(cost);
  }
  upgrade() {
    if (this.level >= this.maxLevel) return false;
    this.level += 1;
    return true;
  }
  /* Giá bán = tổng vốn đã bỏ ra × tỉ lệ hoàn tiền (Admin chỉnh được) */
  sellValue() {
    const rate = (GAME_DATA.config && GAME_DATA.config.sellRefundRate !== undefined)
      ? GAME_DATA.config.sellRefundRate : 0.7;
    return Math.max(1, Math.floor(this.totalInvested * rate));
  }

  /* ---------- Chọn mục tiêu ---------- */
  findTarget(enemies) {
    const range = this.effectiveRange();
    const mode = this.targetPriority || "first";
    let best = null;
    let bestScore = -Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > range) continue;
      let score;
      switch (mode) {
        case "last": score = -e.wpIndex * 1000 - d; break;
        case "strongest": score = e.hp; break;
        case "weakest": score = -e.hp; break;
        case "fastest": score = e.speed * (e._effectiveSpeedMult || 1); break;
        case "closest": score = -d; break;
        case "boss": score = (e.isBoss ? 1e9 : e.isElite ? 1e6 : 0) + e.wpIndex; break;
        case "first":
        default: score = e.wpIndex * 1000 - d; break;
      }
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /* buff = { fireRateMult, damageMult } (kỹ năng tướng, tạm thời) */
  update(dt, enemies, projectiles, buff) {
    this._animTime += dt;
    if (this._recoil > 0) this._recoil = Math.max(0, this._recoil - dt * 4);
    if (this.disabledFor > 0) { this.disabledFor -= dt; return; }
    if (this.isSupport) return; // tháp hỗ trợ không bắn

    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const target = this.findTarget(enemies);
    if (!target) return;
    const fireRateMult = (buff && buff.fireRateMult) || 1;
    const damageMult = (buff && buff.damageMult) || 1;
    projectiles.push(new Projectile(this, target, damageMult));
    // ghi lại hướng bắn để lớp dựng hình 3D xoay nòng tháp về phía mục tiêu
    this._lastTargetX = target.x;
    this._lastTargetY = target.y;
    this._recoil = 1;
    const rate = Math.max(0.05, this.effectiveFireRate() * fireRateMult);
    this.cooldown = 1 / rate;
    if (typeof SoundManager !== "undefined") SoundManager.play("attack");
  }

  draw(ctx) {
    const b = this.branch();
    const disabled = this.disabledFor > 0;
    const bob = this.isSupport ? Math.sin(this._animTime * 3) * 1.5 : 0;
    const y = this.y + bob - this._recoil * 2;

    if (this.isSupport && !disabled) {
      const aura = this.auraOutput();
      const pulse = 0.5 + Math.sin(this._animTime * 2.2) * 0.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, aura.radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(232,200,115," + (0.10 + pulse * 0.12).toFixed(3) + ")";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(this.x, y, 20, 0, Math.PI * 2);
    ctx.fillStyle = disabled ? "rgba(70,70,70,.9)" : "rgba(46,33,25,.9)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = disabled ? "#888888" : this.def.color;
    ctx.stroke();

    // Vòng ngoài theo MỐC TIẾN HOÁ - ngoại hình 2D đổi thật theo cấp
    if (!disabled && typeof TowerTiers !== "undefined") {
      const vis = TowerTiers.visual(this.def, this.level);
      if (vis.tierIndex > 0) {
        ctx.beginPath();
        ctx.arc(this.x, y, 20 + vis.tierIndex * 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = vis.accent;
        ctx.lineWidth = 1 + vis.tierIndex * 0.35;
        ctx.globalAlpha = 0.45 + vis.glow * 0.45;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (vis.hasAura) {
        const pulse = 0.5 + 0.5 * Math.sin(this._animTime * 2.4);
        ctx.beginPath();
        ctx.arc(this.x, y, 26 + vis.tierIndex * 1.2 + pulse * 2, 0, Math.PI * 2);
        ctx.strokeStyle = vis.accent;
        ctx.globalAlpha = 0.10 + vis.glow * 0.18;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = disabled ? 0.45 : 1;
    ctx.fillText(this.def.icon, this.x, y);
    ctx.globalAlpha = 1;

    if (b) {
      ctx.font = "12px serif";
      ctx.fillText(b.icon || "★", this.x + 15, y - 14);
    }
    if (this.level > 1) {
      // dấu cấp: 2 hàng, tối đa 10 cấp, hàng dưới là các cấp từ 6 trở lên
      const vis = (typeof TowerTiers !== "undefined") ? TowerTiers.visual(this.def, this.level) : null;
      const col = vis ? vis.accent : "#e8c873";
      const total = Math.min(this.level, 10);
      for (let row = 0; row < 2; row++) {
        const n = row === 0 ? Math.min(total, 5) : Math.max(0, total - 5);
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(this.x - (n - 1) * 3.5 + i * 7, y + 23 + row * 6, 2.2, 0, Math.PI * 2);
          ctx.fillStyle = col;
          ctx.fill();
        }
      }
    }
    if (disabled) {
      ctx.font = "14px serif";
      ctx.fillText("🚫", this.x, y - 22);
    }
  }

  drawRange(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.effectiveRange(), 0, Math.PI * 2);
    ctx.fillStyle = this.isSupport ? "rgba(232,200,115,.07)" : "rgba(201,162,74,.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(201,162,74,.45)";
    ctx.lineWidth = 1.5;
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
    this.speed = tower.def.projectileSpeed || 400;
    this.splashRadius = tower.effectiveSplash();
    this.color = tower.def.color;
    this.dmgType = tower.damageType();
    this.role = tower.def.role;
    this.tierIndex = (typeof TowerTiers !== "undefined") ? TowerTiers.indexOf(tower.def, tower.level) : 0;
    this.target = target;       // tham chiếu trực tiếp -> không quét mảng mỗi frame
    this.targetId = target.id;
    this.alive = true;
    this.criticalChance = tower.effectiveCritChance();
    this.criticalMultiplier = tower.effectiveCritMultiplier();
    this.armorPenetration = tower.effectiveArmorPen();
    const eff = tower.effectiveEffect();
    this.effectType = eff ? eff.type : null;
    this.effectValue = eff ? eff.value : 0;
    this.effectDuration = eff ? eff.duration : 0;
    this.sourceId = tower.id;
    // _t = tiến độ đường bay 0..1 (dùng để nhô cao giữa đường bay ở renderer3d.js).
    // _age = thời gian sống thô, dùng để xoay hình 2D (đá công thành...).
    this._t = 0;
    this._age = 0;
    this._totalDist = Math.max(1, Math.hypot(target.x - tower.x, target.y - tower.y));
  }

  update(dt, enemies) {
    this._age += dt;
    const target = this.target;
    if (!target || !target.alive) { this.alive = false; this.target = null; return; }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (step >= dist) {
      this._t = 1;
      this.hit(target, enemies);
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      // Tiến độ đường bay TÍNH SAU KHI DI CHUYỂN, để renderer3d.js dùng vẽ
      // đúng độ cao vòng cung tại vị trí đạn THỰC SỰ đang ở, không lệch 1 khung hình.
      this._t = Math.max(0, Math.min(1, 1 - (dist - step) / this._totalDist));
    }
  }

  hit(target, enemies) {
    this.alive = false;
    const isCritical = Math.random() * 100 < target.critChanceAgainst(this.criticalChance);
    const finalDamage = this.baseDamage * (isCritical ? this.criticalMultiplier : 1);
    const meta = {
      isCritical, armorPen: this.armorPenetration,
      sourceId: this.sourceId, damageType: this.dmgType,
    };
    if (this.splashRadius > 0) {
      if (typeof SoundManager !== "undefined") SoundManager.play("explosion");
      if (typeof EffectManager !== "undefined") {
        if (this.splashRadius >= 60) EffectManager.shake(2.5, 0.18);
        EffectManager.spawnBlast(target.x, target.y, this.splashRadius, this.color);
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
      target.takeDamage(finalDamage, meta);
      this._applyEffectIfAny(target);
    }
    this.target = null; // nhả tham chiếu ngay, không giữ enemy đã chết trong bộ nhớ
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

  /* Hình dạng đạn theo VAI TRÒ vũ khí (mục XV: "projectile mới" khi tiến hoá),
     cộng thêm hào quang tăng dần theo MỐC TIẾN HOÁ (tierIndex 0..5) - đạn của
     một tháp Lv9-10 phải trông rõ ràng khác một tháp Lv1. */
  draw(ctx) {
    const isMagic = this.dmgType === "magic";
    const tier = this.tierIndex || 0;
    const glowR = 3.5 + tier * 1.1;
    if (isMagic || tier >= 3) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = isMagic ? "rgba(180,140,255,.35)" : "rgba(255,220,140,.3)";
      ctx.fill();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    const size = (isMagic ? 3.4 : 4) + tier * 0.35;
    ctx.fillStyle = this.color;
    switch (this.role) {
      case "siege": // đá công thành: khối vuông nặng nề, xoay khi bay
        ctx.rotate(this._age * 3);
        ctx.fillRect(-size, -size, size * 2, size * 2);
        break;
      case "control": // lưới/xích khống chế: vòng tròn rỗng
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.color;
        ctx.stroke();
        break;
      case "aoe": { // đạn nổ diện rộng: hình thoi
        ctx.beginPath();
        ctx.moveTo(0, -size); ctx.lineTo(size, 0); ctx.lineTo(0, size); ctx.lineTo(-size, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      default: // dps mặc định: mũi tên/tia thẳng
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
  }
}

/* ---------------- TƯỚNG RA TRẬN ---------------- */
/* Tướng đứng cạnh thành, TỰ ĐÁNH địch trong tầm bằng chỉ số riêng
   (heroDamage/heroRange/heroFireRate/heroDamageType), mạnh lên theo Level
   tướng, có animation thở/đánh/toả sáng khi dùng kỹ năng. */
class Hero {
  constructor(heroDef, level, x, y) {
    this.id = nextEntityId();
    this.def = heroDef;
    this.level = level || 1;
    this.x = x;
    this.y = y;
    this.cooldown = 0;
    this._animTime = 0;
    this._attackFlash = 0;
    this._skillFlash = 0;
    // Giai đoạn 7: maxLevel tướng 5 -> 10. Hệ số mỗi cấp giảm còn ~62% mức
    // cũ (giống cách Công trình đã làm ở Giai đoạn 6) để tướng cấp 10 mới
    // chỉ mạnh hơn tướng cấp 5 cũ ~20-25%, không mạnh gấp đôi.
    const scale = 1 + 0.112 * (this.level - 1);
    this.damage = (heroDef.heroDamage || 24) * scale;
    this.range = (heroDef.heroRange || 150) * (1 + 0.025 * (this.level - 1));
    this.fireRate = heroDef.heroFireRate || 0.9;
    this.dmgType = heroDef.heroDamageType || "physical";
  }

  update(dt, enemies) {
    this._animTime += dt;
    if (this._attackFlash > 0) this._attackFlash -= dt;
    if (this._skillFlash > 0) this._skillFlash -= dt;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    let best = null, bestScore = -Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d > this.range) continue;
      const score = (e.isBoss ? 1e6 : 0) + e.wpIndex * 1000 - d;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (!best) return;
    best.takeDamage(this.damage, { damageType: this.dmgType, armorPen: 15, sourceId: this.id });
    if (typeof EffectManager !== "undefined") {
      EffectManager.spawnBeam(this.x, this.y, best.x, best.y, this.dmgType === "magic" ? "#b98cff" : "#e8c873");
    }
    this._attackFlash = 0.18;
    this.cooldown = 1 / Math.max(0.1, this.fireRate);
  }

  flashSkill() { this._skillFlash = 0.8; }

  draw(ctx) {
    const bob = Math.sin(this._animTime * 2.4) * 2;
    const y = this.y + bob;
    const pulse = 0.5 + Math.sin(this._animTime * 2) * 0.5;
    const grad = ctx.createRadialGradient(this.x, y, 6, this.x, y, 32);
    grad.addColorStop(0, "rgba(232,200,115," + (0.30 + pulse * 0.16 + (this._skillFlash > 0 ? 0.35 : 0)).toFixed(3) + ")");
    grad.addColorStop(1, "rgba(232,200,115,0)");
    ctx.beginPath();
    ctx.arc(this.x, y, 32, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(this.x, this.y + 14, 15, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, y, 17, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(122,31,43,.92)";
    ctx.fill();
    ctx.lineWidth = this._attackFlash > 0 ? 4 : 2.5;
    ctx.strokeStyle = this._attackFlash > 0 ? "#fff2c9" : "#e8c873";
    ctx.stroke();

    ctx.font = "20px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.icon || "🧑", this.x, y);

    ctx.font = "bold 10px sans-serif";
    ctx.fillStyle = "#e8c873";
    ctx.fillText("Lv" + this.level, this.x, y + 26);
  }

  drawRange(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(232,200,115,.25)";
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
