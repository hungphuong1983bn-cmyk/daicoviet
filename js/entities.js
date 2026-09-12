/* =========================================================
   ENTITIES.JS
   Các "lớp" thực thể trong trận đấu: Địch, Quân thủ thành, Đạn.
   Chỉ chứa hành vi của từng thực thể (update/draw), không chứa
   vòng lặp game chính (nằm ở game.js).
   ========================================================= */

let __entityId = 0;
function nextEntityId() { return ++__entityId; }

/* ---------------- ĐỊCH ---------------- */
class Enemy {
  constructor(typeId, path) {
    const def = GAME_DATA.enemyTypes[typeId];
    this.id = nextEntityId();
    this.typeId = typeId;
    this.def = def;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.speed = def.speed;
    this.path = path;
    this.wpIndex = 0;
    this.x = path[0].x;
    this.y = path[0].y;
    this.alive = true;
    this.reachedCastle = false;
  }

  update(dt) {
    if (!this.alive) return;
    const target = this.path[this.wpIndex + 1];
    if (!target) {
      this.reachedCastle = true;
      this.alive = false;
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt;
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
    this.hp -= amount;
    if (this.hp <= 0 && this.alive) {
      this.alive = false;
      this.killed = true;
    }
  }

  draw(ctx) {
    const r = this.def.radius;
    // thân
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.def.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,.4)";
    ctx.stroke();
    // icon
    ctx.font = `${r}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(this.def.icon, this.x, this.y);
    // thanh máu
    const barW = r * 2.2;
    const pct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(this.x - barW / 2, this.y - r - 10, barW, 5);
    ctx.fillStyle = pct > 0.4 ? "#7bc96f" : "#c94f4f";
    ctx.fillRect(this.x - barW / 2, this.y - r - 10, barW * pct, 5);
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
  }

  findTarget(enemies) {
    let best = null;
    let bestProgress = -1;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.def.range) {
        // ưu tiên địch đi xa nhất trên đường (wpIndex cao nhất)
        if (e.wpIndex > bestProgress) {
          bestProgress = e.wpIndex;
          best = e;
        }
      }
    }
    return best;
  }

  update(dt, enemies, projectiles) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const target = this.findTarget(enemies);
    if (!target) return;
    projectiles.push(new Projectile(this, target));
    this.cooldown = 1 / this.def.fireRate;
  }

  draw(ctx) {
    // vùng tầm bắn khi cần debug (ẩn mặc định)
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
  }

  drawRange(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.def.range, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(201,162,74,.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(201,162,74,.35)";
    ctx.stroke();
  }
}

/* ---------------- ĐẠN ---------------- */
class Projectile {
  constructor(tower, target) {
    this.id = nextEntityId();
    this.x = tower.x;
    this.y = tower.y;
    this.damage = tower.def.damage;
    this.speed = tower.def.projectileSpeed;
    this.splashRadius = tower.def.splashRadius;
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
        if (d <= this.splashRadius) e.takeDamage(this.damage);
      }
    } else {
      target.takeDamage(this.damage);
    }
  }

  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
  }
}
