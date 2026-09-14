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
    this._slowMultiplier = 1; // 1 = tốc độ bình thường, <1 = đang bị làm chậm
    this._slowTimer = 0;
  }

  /* Gọi bởi Projectile khi trúng đạn từ tháp có slowFactor (vd. Bẫy cọc nhọn).
     multiplier: hệ số còn lại của tốc độ (vd. 0.65 = giảm 35%).
     Không cộng dồn chồng chéo: chỉ giữ hiệu ứng mạnh/lâu hơn hiện tại. */
  applySlow(multiplier, duration) {
    if (multiplier < this._slowMultiplier || duration > this._slowTimer) {
      this._slowMultiplier = multiplier;
      this._slowTimer = duration;
    }
  }

  update(dt) {
    if (!this.alive) return;
    if (this._slowTimer > 0) {
      this._slowTimer -= dt;
      if (this._slowTimer <= 0) { this._slowTimer = 0; this._slowMultiplier = 1; }
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
    const step = this.speed * this._slowMultiplier * dt;
    if (step >= dist) {
      this.x = target.x;
      this.y = target.y;
      this.wpIndex++;
    } else {
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
  }

  takeDamage(amount) {
    let real = Math.max(0, amount - this.defense);
    if (this.resistance > 0) real = real * (1 - this.resistance / 100);
    real = Math.max(1, Math.round(real));
    this.hp -= real;
    if (Enemy.onHit) Enemy.onHit(this.x, this.y, real);
    if (this.hp <= 0 && this.alive) {
      this.alive = false;
      this.killed = true;
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
    // vòng xanh khi đang bị làm chậm (Bẫy cọc nhọn...)
    if (this._slowTimer > 0) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(120,200,230,.8)";
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
    this.damage = tower.effectiveDamage() * (damageMult || 1);
    this.speed = tower.def.projectileSpeed;
    this.splashRadius = tower.def.splashRadius;
    this.slowFactor = tower.def.slowFactor || 0;
    this.slowDuration = tower.def.slowDuration || 0;
    this.color = tower.def.color;
    this.targetId = target.id;
    this.alive = true;
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
    if (this.splashRadius > 0) {
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - target.x, e.y - target.y);
        if (d <= this.splashRadius) {
          e.takeDamage(this.damage);
          this._applySlowIfAny(e);
        }
      }
    } else {
      target.takeDamage(this.damage);
      this._applySlowIfAny(target);
    }
  }

  _applySlowIfAny(enemy) {
    if (this.slowFactor > 0 && enemy.alive) {
      enemy.applySlow(1 - this.slowFactor, this.slowDuration);
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}
