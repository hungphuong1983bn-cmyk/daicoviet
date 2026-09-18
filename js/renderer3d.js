/* =========================================================
   RENDERER3D.JS  (Giai đoạn 5 - Dựng hình 3D)

   Nâng toàn bộ phần HÌNH ẢNH của game lên 3D bằng WebGL (Three.js
   đóng gói sẵn tại vendor/three.min.js - KHÔNG cần mạng).

   NGUYÊN TẮC QUAN TRỌNG:
   - Đây CHỈ là một lớp DỰNG HÌNH thay thế. Toàn bộ logic game (combat,
     wave, tháp, tướng, save...) giữ nguyên 100%, vẫn chạy trên hệ toạ
     độ 2D cũ (960x540). Renderer3D chỉ đọc trạng thái và dựng cảnh.
   - Hệ toạ độ: điểm bản đồ (mx, my) -> thế giới 3D (mx - 480, 0, my - 270).
     Nhờ vậy mọi va chạm, tầm bắn, đường đi... không phải sửa một dòng.
   - Canvas 3D có buffer cố định 960x540 và dùng CSS `object-fit: contain`
     y hệt canvas 2D, nên hàm đổi toạ độ chuột sẵn có vẫn đúng.
   - Canvas 2D cũ được giữ lại NẰM TRÊN, trong suốt, để bắt sự kiện chuột
     và vẽ lớp phủ (số sát thương, thanh máu, tia lửa) bằng cách chiếu
     toạ độ 3D về màn hình.
   - Nếu không có WebGL/Three.js -> `active()` trả về false và game tự
     động vẽ 2D như cũ. Không bao giờ trắng màn hình.
   ========================================================= */

const Renderer3D = {
  supported: null,      // null = chưa thử, true/false = kết quả khởi tạo
  failed: false,
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  raycaster: null,
  _ground: null,
  _levelGroup: null,    // địa hình tĩnh: đường đi, chướng ngại, ô đất, thành
  _dynGroup: null,      // vật thể động: tháp, địch, đạn, tướng
  _levelKey: null,
  _towerMeshes: new Map(),
  _enemyPool: [],
  _projPool: [],
  _spotPads: [],
  _rangeRing: null,
  _castle: null,
  _castleShield: null,
  _hero: null,
  _tmpVec: null,
  _W: 960,
  _H: 540,

  /* --------------------------------------------------------
     BẬT / TẮT
     -------------------------------------------------------- */
  wanted() {
    try {
      const f = (GAME_DATA && GAME_DATA.config && GAME_DATA.config.features) || {};
      return f.render3dEnabled !== false;
    } catch (e) { return false; }
  },

  active() {
    return this.supported === true && !this.failed && this.wanted();
  },

  /* Khởi tạo một lần. Trả về true nếu dựng được WebGL. */
  init(canvas2d) {
    if (this.supported !== null) return this.supported;
    this.supported = false;
    if (typeof THREE === "undefined" || !canvas2d || !canvas2d.parentElement) return false;
    try {
      const cfg = (GAME_DATA && GAME_DATA.config) || {};
      this._W = cfg.canvasWidth || 960;
      this._H = cfg.canvasHeight || 540;

      const canvas = document.createElement("canvas");
      canvas.id = "game-canvas-3d";
      canvas.width = this._W;
      canvas.height = this._H;
      canvas2d.parentElement.insertBefore(canvas, canvas2d);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(1);           // buffer cố định -> tải GPU ổn định
      renderer.setSize(this._W, this._H, false);
      renderer.shadowMap.enabled = ((cfg.features || {}).shadows3d !== false);
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f0b08);
      const camera = new THREE.PerspectiveCamera(42, this._W / this._H, 10, 4000);
      camera.position.set(0, 640, 690);
      camera.lookAt(0, 0, 30);

      // Ánh sáng: nắng chếch + trời + hắt nền, đủ khối mà không bệt màu
      const sun = new THREE.DirectionalLight(0xfff0d0, 1.15);
      sun.position.set(-380, 700, 360);
      if (renderer.shadowMap.enabled) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        const c = sun.shadow.camera;
        c.left = -640; c.right = 640; c.top = 460; c.bottom = -460;
        c.near = 100; c.far = 1800;
      }
      scene.add(sun);
      scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x4a3a28, 0.75));
      scene.add(new THREE.AmbientLight(0xffffff, 0.22));

      this._levelGroup = new THREE.Group();
      this._dynGroup = new THREE.Group();
      scene.add(this._levelGroup, this._dynGroup);

      this.canvas = canvas;
      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.raycaster = new THREE.Raycaster();
      this._tmpVec = new THREE.Vector3();
      this.supported = true;
      canvas2d.classList.add("canvas-overlay-3d");
      this._syncCanvasVisibility();
      return true;
    } catch (err) {
      console.warn("[Renderer3D] Không khởi tạo được WebGL, quay về chế độ 2D:", err);
      this.failed = true;
      this.supported = false;
      return false;
    }
  },

  /* Đồng bộ hiển thị canvas 3D + cờ trong suốt của canvas 2D. */
  _syncCanvasVisibility() {
    if (!this.canvas) return;
    const on = this.active();
    this.canvas.style.display = on ? "block" : "none";
    if (Game && Game.canvas) Game.canvas.classList.toggle("canvas-overlay-3d", on);
  },

  setEnabled(on) {
    try {
      DataService.setConfig({ features: { render3dEnabled: !!on } });
      if (typeof rebuildGameData === "function") rebuildGameData();
    } catch (e) { /* bỏ qua - vẫn đổi được hiển thị bên dưới */ }
    if (on && this.supported === null && Game && Game.canvas) this.init(Game.canvas);
    this._syncCanvasVisibility();
    if (Game && Game.render) Game.render();
  },

  /* --------------------------------------------------------
     TIỆN ÍCH
     -------------------------------------------------------- */
  _wx(mx) { return mx - this._W / 2; },
  _wz(my) { return my - this._H / 2; },

  /* Chiếu một điểm bản đồ (kèm độ cao) về toạ độ canvas 2D để vẽ lớp phủ. */
  project(mx, my, h) {
    const v = this._tmpVec.set(this._wx(mx), h || 0, this._wz(my));
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this._W, y: (-v.y * 0.5 + 0.5) * this._H, z: v.z };
  },

  /* Chuột -> toạ độ bản đồ, bằng cách bắn tia xuống mặt đất y = 0. */
  pick(px, py) {
    if (!this.active()) return { x: px, y: py };
    const ndc = { x: (px / this._W) * 2 - 1, y: -((py / this._H) * 2 - 1) };
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.y) < 1e-6) return { x: px, y: py };
    const t = -ray.origin.y / ray.direction.y;
    if (t < 0) return { x: -9999, y: -9999 };
    return {
      x: ray.origin.x + ray.direction.x * t + this._W / 2,
      y: ray.origin.z + ray.direction.z * t + this._H / 2,
    };
  },

  _mat(color, opts) {
    const o = opts || {};
    return new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      transparent: o.opacity !== undefined,
      opacity: o.opacity !== undefined ? o.opacity : 1,
      emissive: new THREE.Color(o.emissive || 0x000000),
    });
  },

  _disposeGroup(group) {
    if (!group) return;
    const dead = [];
    group.traverse((o) => { if (o.isMesh) dead.push(o); });
    for (const m of dead) {
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material.dispose();
      }
    }
    while (group.children.length) group.remove(group.children[0]);
  },

  /* --------------------------------------------------------
     ĐỊA HÌNH TĨNH
     -------------------------------------------------------- */
  buildLevel(levelDef) {
    if (!this.active() || !levelDef) return;
    const key = levelDef.id + "|" + (levelDef.theme || "karst");
    if (key === this._levelKey) return;
    this._levelKey = key;
    this._disposeGroup(this._levelGroup);
    this._towerMeshes.clear();
    this._spotPads.length = 0;
    this._castle = null;
    this._castleShield = null;
    this._rangeRing = null;

    const pal = this._palette(levelDef.theme || "karst");
    this.scene.background = new THREE.Color(pal.sky);
    if (!this.scene.fog) this.scene.fog = new THREE.Fog(pal.sky, 900, 2200);
    else { this.scene.fog.color.set(pal.sky); }

    // nền đất
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 1600),
      this._mat(pal.ground)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = this.renderer.shadowMap.enabled;
    this._levelGroup.add(ground);

    // thảm cỏ sẫm quanh rìa cho có chiều sâu
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(this._W + 60, this._H + 60), this._mat(pal.field));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.2;
    rim.receiveShadow = this.renderer.shadowMap.enabled;
    this._levelGroup.add(rim);

    this._buildHorizon(pal);
    this._buildPath(levelDef, pal);
    this._buildObstacles(levelDef, pal);
    this._buildSpots(levelDef);
    this._buildCastle(levelDef);
  },

  _palette(theme) {
    switch (theme) {
      case "river":    return { sky: 0x9ec3cf, ground: 0x3f6f76, field: 0x4a7f86, path: 0xb8945f, hill: 0x4a5f63 };
      case "mountain": return { sky: 0xcdbf9d, ground: 0x4c6139, field: 0x5e7346, path: 0xa98d5f, hill: 0x6a6a56 };
      case "citadel":  return { sky: 0xd9c28e, ground: 0x6c7a49, field: 0x7d8a55, path: 0xc2a271, hill: 0x8a7458 };
      case "field":    return { sky: 0xddcb91, ground: 0x6f8d45, field: 0x83a052, path: 0xc9a876, hill: 0x6f7f56 };
      case "karst":
      default:         return { sky: 0xd8c48c, ground: 0x5c7a42, field: 0x6e8f4e, path: 0xc09b66, hill: 0x63685a };
    }
  },

  /* Dãy núi phía chân trời - tạo chiều sâu thật sự cho khung hình 3D. */
  _buildHorizon(pal) {
    const spots = [
      [-760, 470, 280], [-380, 520, 210], [40, 560, 300],
      [430, 500, 240], [820, 470, 265], [-120, 420, 170], [620, 430, 160],
    ];
    for (const [x, size, h] of spots) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(size, h, 5), this._mat(pal.hill));
      cone.position.set(x, h / 2 - 20, -620 - Math.abs(x) * 0.12);
      cone.rotation.y = (x % 7) * 0.3;
      this._levelGroup.add(cone);
    }
  },

  _buildPath(levelDef, pal) {
    const pts = levelDef.path || [];
    const matRoad = this._mat(pal.path);
    const matEdge = this._mat(0x8d6f45);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 34), matRoad);
      seg.position.set(this._wx((a.x + b.x) / 2), 1.6, this._wz((a.y + b.y) / 2));
      seg.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
      seg.receiveShadow = this.renderer.shadowMap.enabled;
      this._levelGroup.add(seg);
    }
    // khớp nối bo tròn ở mỗi khúc cua
    for (const p of pts) {
      const joint = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 3, 16), matRoad);
      joint.position.set(this._wx(p.x), 1.6, this._wz(p.y));
      joint.receiveShadow = this.renderer.shadowMap.enabled;
      this._levelGroup.add(joint);
    }
    // cọc mốc hai bên đường cho rõ lối tiến quân
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      for (let d = 30; d < len - 20; d += 95) {
        for (const side of [-1, 1]) {
          const px = a.x + ux * d - uy * side * 22;
          const py = a.y + uy * d + ux * side * 22;
          const post = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 12, 6), matEdge);
          post.position.set(this._wx(px), 6, this._wz(py));
          post.castShadow = this.renderer.shadowMap.enabled;
          this._levelGroup.add(post);
        }
      }
    }
  },

  _buildObstacles(levelDef, pal) {
    const list = levelDef.obstacles || [];
    for (const o of list) {
      const r = o.r || 14;
      let mesh = null;
      switch (o.type) {
        case "tree": {
          mesh = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.24, r * 1.1, 6), this._mat(0x6b4a2c));
          trunk.position.y = r * 0.55;
          const leaf = new THREE.Mesh(new THREE.ConeGeometry(r * 0.85, r * 1.8, 7), this._mat(0x3f6b33));
          leaf.position.y = r * 1.75;
          mesh.add(trunk, leaf);
          break;
        }
        case "water": {
          mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 2, 18), this._mat(0x3d7f96, { opacity: 0.85 }));
          mesh.position.y = 0.8;
          break;
        }
        case "stake": {
          mesh = new THREE.Group();
          for (let i = 0; i < 3; i++) {
            const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 1.5, 5), this._mat(0x7a5a33));
            s.position.set((i - 1) * r * 0.5, r * 0.75, (i % 2) * r * 0.3);
            s.rotation.z = (i - 1) * 0.16;
            mesh.add(s);
          }
          break;
        }
        case "wall": {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(r * 2.1, r * 1.1, r * 0.8), this._mat(0x8b7a64));
          mesh.position.y = r * 0.55;
          break;
        }
        case "banner": {
          mesh = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, r * 2.4, 6), this._mat(0x5a4632));
          pole.position.y = r * 1.2;
          const flag = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, r * 0.6, 0.8), this._mat(0x9d2130));
          flag.position.set(r * 0.5, r * 2.0, 0);
          mesh.add(pole, flag);
          break;
        }
        case "rock":
        default: {
          mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.9, 0), this._mat(pal.hill));
          mesh.position.y = r * 0.55;
          mesh.rotation.set(o.x % 3, o.y % 5, o.x % 2);
          break;
        }
      }
      const holder = new THREE.Group();
      holder.add(mesh);
      holder.position.set(this._wx(o.x), 0, this._wz(o.y));
      holder.traverse((m) => {
        if (m.isMesh) { m.castShadow = this.renderer.shadowMap.enabled; m.receiveShadow = this.renderer.shadowMap.enabled; }
      });
      this._levelGroup.add(holder);
    }
  },

  _buildSpots(levelDef) {
    const spots = levelDef.buildSpots || [];
    for (let i = 0; i < spots.length; i++) {
      const pad = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 4, 20), this._mat(0x4a3a2a));
      base.position.y = 2;
      base.receiveShadow = this.renderer.shadowMap.enabled;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(19, 1.6, 8, 24), this._mat(0xc9a24a, { emissive: 0x3a2d12 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 4.4;
      pad.add(base, ring);
      pad.position.set(this._wx(spots[i].x), 0, this._wz(spots[i].y));
      pad.userData.ring = ring;
      this._levelGroup.add(pad);
      this._spotPads.push(pad);
    }
  },

  _buildCastle(levelDef) {
    const c = levelDef.castle;
    if (!c) return;
    const g = new THREE.Group();
    const wallMat = this._mat(0x7a1f2b);
    const goldMat = this._mat(0xc9a24a);
    const base = new THREE.Mesh(new THREE.BoxGeometry(96, 46, 72), wallMat);
    base.position.y = 23;
    g.add(base);
    // lỗ châu mai
    for (let i = -3; i <= 3; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 9), goldMat);
      m.position.set(i * 13, 52, -34);
      g.add(m);
    }
    // mái cong kiểu điện Hoa Lư
    const roof = new THREE.Mesh(new THREE.ConeGeometry(74, 40, 4), this._mat(0x5d2a1c));
    roof.position.y = 68;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    const top = new THREE.Mesh(new THREE.ConeGeometry(44, 28, 4), this._mat(0x7b3a24));
    top.position.y = 96;
    top.rotation.y = Math.PI / 4;
    g.add(top);
    // cổng
    const gate = new THREE.Mesh(new THREE.BoxGeometry(24, 30, 6), this._mat(0x2e2119));
    gate.position.set(0, 15, 37);
    g.add(gate);
    // 4 tháp canh
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 62, 8), wallMat);
      t.position.set(sx * 50, 31, sz * 38);
      g.add(t);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(13, 16, 8), goldMat);
      cap.position.set(sx * 50, 70, sz * 38);
      g.add(cap);
    }
    // khiên thành (Hộ Quốc Trận) - ẩn/hiện theo trạng thái
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(86, 20, 14),
      new THREE.MeshLambertMaterial({ color: 0x79c8f0, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
    );
    shield.position.y = 30;
    shield.visible = false;
    g.add(shield);

    g.traverse((m) => {
      if (m.isMesh) { m.castShadow = this.renderer.shadowMap.enabled; m.receiveShadow = this.renderer.shadowMap.enabled; }
    });
    g.position.set(this._wx(c.x), 0, this._wz(c.y));
    this._levelGroup.add(g);
    this._castle = g;
    this._castleShield = shield;
  },

  /* --------------------------------------------------------
     VẬT THỂ ĐỘNG
     -------------------------------------------------------- */
  _makeTowerMesh(tower) {
    const def = tower.def;
    const g = new THREE.Group();
    const color = def.color || "#c9a24a";
    const stone = this._mat(0x6a5a46);
    const body = this._mat(color);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(18, 21, 12, 12), stone);
    base.position.y = 6;
    g.add(base);

    let core;
    switch (def.role) {
      case "aoe":
        core = new THREE.Mesh(new THREE.BoxGeometry(24, 26, 24), body);
        core.position.y = 25;
        break;
      case "control":
        core = new THREE.Mesh(new THREE.CylinderGeometry(6, 15, 32, 8), body);
        core.position.y = 28;
        break;
      case "magic":
        core = new THREE.Mesh(new THREE.OctahedronGeometry(15, 0), this._mat(color, { emissive: 0x2a1a3a }));
        core.position.y = 32;
        break;
      case "dot":
        core = new THREE.Mesh(new THREE.SphereGeometry(13, 14, 10), this._mat(color, { emissive: 0x16240f }));
        core.position.y = 26;
        break;
      case "support":
        core = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 14, 16), body);
        core.position.y = 19;
        break;
      default:
        core = new THREE.Mesh(new THREE.CylinderGeometry(11, 14, 30, 10), body);
        core.position.y = 27;
    }
    g.add(core);

    // nòng / hướng bắn, xoay theo mục tiêu
    const turret = new THREE.Group();
    if (def.role !== "support") {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 5), this._mat(0x3a2f22));
      barrel.position.x = 13;
      turret.add(barrel);
    }
    turret.position.y = core.position.y + 6;
    g.add(turret);
    g.userData.turret = turret;
    g.userData.core = core;

    // vòng cấp độ (mỗi cấp một vòng vàng)
    const rings = new THREE.Group();
    g.add(rings);
    g.userData.rings = rings;
    g.userData.level = 0;

    // hào quang cho tháp hỗ trợ
    if (def.isSupport) {
      const aura = new THREE.Mesh(
        new THREE.TorusGeometry(1, 1.5, 6, 30),
        new THREE.MeshLambertMaterial({ color: 0xe8c873, transparent: true, opacity: 0.45 })
      );
      aura.rotation.x = -Math.PI / 2;
      aura.position.y = 2.5;
      g.add(aura);
      g.userData.aura = aura;
    }

    g.traverse((m) => { if (m.isMesh) { m.castShadow = this.renderer.shadowMap.enabled; m.receiveShadow = this.renderer.shadowMap.enabled; } });
    return g;
  },

  _syncTowerLevelRings(mesh, tower) {
    if (mesh.userData.level === tower.level) return;
    mesh.userData.level = tower.level;
    const rings = mesh.userData.rings;
    this._disposeGroup(rings);
    for (let i = 0; i < tower.level - 1; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(16 - i * 0.6, 1.3, 6, 18), this._mat(0xe8c873, { emissive: 0x2e2410 }));
      r.rotation.x = -Math.PI / 2;
      r.position.y = 13 + i * 4;
      rings.add(r);
    }
  },

  _makeEnemyMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(6, 8, 4, 10), this._mat(0xffffff));
    body.position.y = 11;
    const head = new THREE.Mesh(new THREE.SphereGeometry(4.6, 10, 8), this._mat(0xf0d9b5));
    head.position.y = 21;
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(13, 12, 9),
      new THREE.MeshLambertMaterial({ color: 0x79c8f0, transparent: true, opacity: 0.3 })
    );
    shield.position.y = 13;
    shield.visible = false;
    g.add(body, head, shield);
    g.userData = { body, head, shield };
    g.traverse((m) => { if (m.isMesh) m.castShadow = this.renderer.shadowMap.enabled; });
    this._dynGroup.add(g);
    return g;
  },

  _makeProjMesh() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 6), this._mat(0xffffff, { emissive: 0x333322 }));
    this._dynGroup.add(m);
    return m;
  },

  _makeHeroMesh(heroDef) {
    const g = new THREE.Group();
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 10), this._mat(0x9d2130));
    cloak.position.y = 13;
    const head = new THREE.Mesh(new THREE.SphereGeometry(5.6, 12, 10), this._mat(0xf0d9b5));
    head.position.y = 30;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 4, 10), this._mat(0xe8c873, { emissive: 0x3a2d12 }));
    crown.position.y = 35;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(15, 1.6, 6, 26),
      new THREE.MeshLambertMaterial({ color: 0xe8c873, transparent: true, opacity: 0.6 })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 2;
    g.add(cloak, head, crown, halo);
    g.userData = { halo, cloak };
    g.traverse((m) => { if (m.isMesh) m.castShadow = this.renderer.shadowMap.enabled; });
    this._dynGroup.add(g);
    return g;
  },

  /* --------------------------------------------------------
     ĐỒNG BỘ TRẠNG THÁI -> CẢNH 3D
     -------------------------------------------------------- */
  _sync(game) {
    const run = game.run;
    const t = performance.now() / 1000;

    // --- ô đất trống nhấp nháy nhẹ, ô đã xây thì tắt vòng ---
    const towers = run ? run.towers : [];
    for (let i = 0; i < this._spotPads.length; i++) {
      const occupied = towers.some((tw) => tw.spotIndex === i);
      const ring = this._spotPads[i].userData.ring;
      ring.visible = !occupied;
      if (!occupied) ring.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.04);
    }

    // --- tháp ---
    const seen = new Set();
    for (const tw of towers) {
      seen.add(tw.id);
      let mesh = this._towerMeshes.get(tw.id);
      if (!mesh) {
        mesh = this._makeTowerMesh(tw);
        mesh.position.set(this._wx(tw.x), 0, this._wz(tw.y));
        this._dynGroup.add(mesh);
        this._towerMeshes.set(tw.id, mesh);
      }
      this._syncTowerLevelRings(mesh, tw);
      // xoay nòng về mục tiêu gần nhất đang bị bắn
      if (mesh.userData.turret && tw._lastTargetX !== undefined) {
        mesh.userData.turret.rotation.y = -Math.atan2(tw._lastTargetY - tw.y, tw._lastTargetX - tw.x);
      }
      // bị Boss vô hiệu hoá -> chìm xuống và tối màu
      const disabled = tw.disabledFor > 0;
      mesh.position.y = disabled ? -6 : 0;
      if (mesh.userData.core) mesh.userData.core.visible = !disabled || Math.sin(t * 10) > 0;
      if (mesh.userData.aura) {
        const r = tw.effectiveRange ? tw.effectiveRange() : 120;
        mesh.userData.aura.scale.set(r, r, 1);
        mesh.userData.aura.rotation.z = t * 0.6;
      }
    }
    for (const [id, mesh] of this._towerMeshes) {
      if (!seen.has(id)) {
        this._dynGroup.remove(mesh);
        this._disposeGroup(mesh);
        this._towerMeshes.delete(id);
      }
    }

    // --- vòng tầm bắn của tháp đang chọn ---
    const selIndex = game.selectedSpotIndex;
    const sel = (selIndex !== undefined && selIndex >= 0 && game.towerAt) ? game.towerAt(selIndex) : null;
    const showRange = !!sel || ((GAME_DATA.config.features || {}).debugMode && towers.length > 0);
    if (showRange) {
      if (!this._rangeRing) {
        this._rangeRing = new THREE.Mesh(
          new THREE.TorusGeometry(1, 1.4, 6, 48),
          new THREE.MeshLambertMaterial({ color: 0xe8c873, transparent: true, opacity: 0.7 })
        );
        this._rangeRing.rotation.x = -Math.PI / 2;
        this._dynGroup.add(this._rangeRing);
      }
      const tw = sel || towers[0];
      const r = tw.effectiveRange();
      this._rangeRing.visible = true;
      this._rangeRing.position.set(this._wx(tw.x), 3, this._wz(tw.y));
      this._rangeRing.scale.set(r, r, 1);
    } else if (this._rangeRing) {
      this._rangeRing.visible = false;
    }

    // --- quân địch (dùng pool, không cấp phát mới mỗi khung hình) ---
    const enemies = run ? run.enemies : [];
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      let mesh = this._enemyPool[i];
      if (!mesh) { mesh = this._makeEnemyMesh(); this._enemyPool.push(mesh); }
      mesh.visible = true;
      const scale = (e.def.radius || 12) / 12 * (e.isBoss ? 2.1 : (e.isElite ? 1.25 : 1));
      mesh.scale.setScalar(scale);
      const fly = e.behavior === "flying" ? 34 + Math.sin(t * 3 + i) * 4 : 0;
      mesh.position.set(this._wx(e.x), fly, this._wz(e.y));
      // hướng đi
      if (e._prevX !== undefined && (e.x !== e._prevX || e.y !== e._prevY)) {
        mesh.rotation.y = -Math.atan2(e.y - e._prevY, e.x - e._prevX) + Math.PI / 2;
      }
      e._prevX = e.x; e._prevY = e.y;
      // màu + trạng thái
      const ud = mesh.userData;
      let col = e.def.color || "#8a4a3a";
      if (e._stunned) col = "#9fd8ff";
      else if (e._poisoned) col = "#7fbf4a";
      ud.body.material.color.set(col);
      ud.body.material.emissive.set(e.isBoss ? 0x3a1010 : (e.isElite ? 0x2a2005 : 0x000000));
      ud.shield.visible = (e.shield || 0) > 0;
      // nhún nhẹ khi đi bộ
      ud.body.position.y = 11 + (e._stunned ? 0 : Math.abs(Math.sin(t * 6 + i)) * 1.6);
    }
    for (let i = enemies.length; i < this._enemyPool.length; i++) this._enemyPool[i].visible = false;
    this._trimPool(this._enemyPool, enemies.length);

    // --- đạn ---
    const projs = run ? run.projectiles : [];
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      let mesh = this._projPool[i];
      if (!mesh) { mesh = this._makeProjMesh(); this._projPool.push(mesh); }
      mesh.visible = true;
      mesh.material.color.set(p.color || "#e8c873");
      const arc = Math.sin(Math.min(1, (p._t || 0)) * Math.PI) * 14;
      mesh.position.set(this._wx(p.x), 26 + arc, this._wz(p.y));
      mesh.scale.setScalar(p.splashRadius > 0 ? 1.7 : 1);
    }
    for (let i = projs.length; i < this._projPool.length; i++) this._projPool[i].visible = false;
    this._trimPool(this._projPool, projs.length);

    // --- tướng ---
    const heroEnt = run ? run.heroEntity : null;
    if (heroEnt) {
      if (!this._hero) this._hero = this._makeHeroMesh(heroEnt.def);
      this._hero.visible = true;
      this._hero.position.set(this._wx(heroEnt.x), 0, this._wz(heroEnt.y));
      this._hero.rotation.y = Math.sin(t * 0.8) * 0.25;
      const halo = this._hero.userData.halo;
      halo.rotation.z = t * 1.2;
      const flash = Math.max(heroEnt._skillFlash || 0, heroEnt._attackFlash || 0);
      halo.material.opacity = 0.45 + Math.min(0.5, flash * 1.6);
      halo.scale.setScalar(1 + Math.min(1.6, flash * 3));
    } else if (this._hero) {
      this._hero.visible = false;
    }

    // --- khiên thành ---
    if (this._castleShield) {
      const on = !!(run && run.castleShieldRemaining > 0);
      this._castleShield.visible = on;
      if (on) this._castleShield.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
    }

    // --- rung màn hình: lắc camera thay vì dịch ảnh ---
    const shake = EffectManager.getShakeOffset();
    this.camera.position.set(shake.x * 1.4, 640 + shake.y * 1.4, 690);
    this.camera.lookAt(0, 0, 30);
  },

  /* Giải phóng phần thừa của pool khi số lượng vật thể giảm mạnh, tránh
     giữ mesh rác vĩnh viễn (yêu cầu hiệu năng mục 8). */
  _trimPool(pool, needed) {
    const keep = Math.max(needed + 24, 32);
    while (pool.length > keep) {
      const m = pool.pop();
      this._dynGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
      if (m.traverse) this._disposeGroup(m);
    }
  },

  /* --------------------------------------------------------
     LỚP PHỦ 2D (số sát thương, thanh máu, tia lửa)
     Vẽ trên canvas 2D trong suốt nằm trên canvas 3D, toạ độ được
     CHIẾU từ thế giới 3D nên luôn dính đúng vật thể.
     -------------------------------------------------------- */
  _drawOverlay(game, ctx) {
    const run = game.run;
    const cfg = GAME_DATA.config.features || {};
    ctx.save();
    ctx.textAlign = "center";

    if (run) {
      // thanh máu quân địch
      if (cfg.showEnemyHpBar !== false) {
        for (const e of run.enemies) {
          if (e.hp >= e.maxHp && !e.isBoss && !(e.shield > 0)) continue;
          const h = (e.behavior === "flying" ? 34 : 0) + (e.def.radius || 12) * 2.6 + (e.isBoss ? 30 : 8);
          const p = this.project(e.x, e.y, h);
          if (p.z > 1) continue;
          const w = e.isBoss ? 56 : 26;
          ctx.fillStyle = "rgba(0,0,0,.55)";
          ctx.fillRect(p.x - w / 2, p.y, w, 4);
          ctx.fillStyle = e.isBoss ? "#e0483c" : (e.isElite ? "#e8c873" : "#7bc96f");
          ctx.fillRect(p.x - w / 2, p.y, w * Math.max(0, e.hp / e.maxHp), 4);
          if (e.shield > 0 && e.maxShield > 0) {
            ctx.fillStyle = "#79c8f0";
            ctx.fillRect(p.x - w / 2, p.y - 4, w * Math.max(0, e.shield / e.maxShield), 3);
          }
        }
      }

      // tia sáng của tướng
      for (const b of EffectManager._beams) {
        const a = Math.max(0, 1 - b.age / b.life);
        const p1 = this.project(b.x1, b.y1, 26);
        const p2 = this.project(b.x2, b.y2, 16);
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      // vòng nổ lan
      for (const r of EffectManager._rings) {
        const k = r.age / r.life;
        const c = this.project(r.x, r.y, 4);
        const edge = this.project(r.x + r.radius * (0.35 + k * 0.75), r.y, 4);
        ctx.globalAlpha = Math.max(0, 1 - k) * 0.6;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, Math.abs(edge.x - c.x), Math.abs(edge.x - c.x) * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // tia lửa
      for (const s of EffectManager._sparks) {
        const a = Math.max(0, 1 - s.age / s.life);
        const p = this.project(s.x, s.y, 16);
        ctx.globalAlpha = a;
        ctx.fillStyle = s.color;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      // số sát thương
      ctx.globalAlpha = 1;
      for (const n of EffectManager._numbers) {
        const a = Math.max(0, 1 - n.age / n.life);
        const p = this.project(n.x, n.y, 24);
        ctx.globalAlpha = a;
        // dùng đúng bảng màu của chế độ 2D để hai chế độ nhìn nhất quán
        ctx.fillStyle = n.isCritical ? "#ffdf6b" :
          n.kind === "burn" ? "#ff9b4a" :
          n.kind === "poison" ? "#9ede6a" :
          n.kind === "bleed" ? "#ff7d7d" :
          n.kind === "shield" ? "#8cc8ff" : "#fff2c9";
        ctx.font = (n.isCritical ? "bold 17px" : "bold 13px") + " sans-serif";
        ctx.strokeStyle = "rgba(0,0,0,.6)";
        ctx.lineWidth = 3;
        const text = (n.isCritical ? "✦-" : "-") + Math.round(n.amount);
        ctx.strokeText(text, p.x, p.y - (n.age / n.life) * 24);
        ctx.fillText(text, p.x, p.y - (n.age / n.life) * 24);
      }
      ctx.globalAlpha = 1;

      // thanh máu thành, neo ngay trên nóc thành
      const c = game.levelDef && game.levelDef.castle;
      if (c) {
        const p = this.project(c.x, c.y, 130);
        const pct = Math.max(0, run.hp / run.maxHp);
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(p.x - 42, p.y, 84, 7);
        ctx.fillStyle = pct > 0.5 ? "#7bc96f" : (pct > 0.25 ? "#e8c873" : "#e0483c");
        ctx.fillRect(p.x - 42, p.y, 84 * pct, 7);
        ctx.strokeStyle = "rgba(201,162,74,.85)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - 42, p.y, 84, 7);
      }
    }

    if (cfg.showFps) {
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      ctx.font = "12px monospace";
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(8, 8, 92, 20);
      ctx.fillStyle = "#7bc96f";
      ctx.fillText("3D " + game.currentFps() + "fps", 14, 22);
    }
    ctx.restore();
  },

  /* --------------------------------------------------------
     VẼ MỘT KHUNG HÌNH
     Trả về true nếu đã dựng 3D (game.js sẽ bỏ qua đường vẽ 2D).
     -------------------------------------------------------- */
  render(game) {
    if (!this.active()) return false;
    try {
      if (game.levelDef) this.buildLevel(game.levelDef);
      this._sync(game);
      this.renderer.render(this.scene, this.camera);
      if (game.ctx) {
        game.ctx.clearRect(0, 0, this._W, this._H);
        this._drawOverlay(game, game.ctx);
      }
      return true;
    } catch (err) {
      console.warn("[Renderer3D] Lỗi khi dựng hình 3D, chuyển về 2D:", err);
      this.failed = true;
      this._syncCanvasVisibility();
      return false;
    }
  },

  /* Dọn sạch khi rời trận - không để mesh rác tồn đọng. */
  clearRun() {
    if (!this.scene) return;
    for (const [, mesh] of this._towerMeshes) { this._dynGroup.remove(mesh); this._disposeGroup(mesh); }
    this._towerMeshes.clear();
    this._trimPool(this._enemyPool, 0);
    this._trimPool(this._projPool, 0);
    for (const m of this._enemyPool) m.visible = false;
    for (const m of this._projPool) m.visible = false;
    if (this._hero) this._hero.visible = false;
    if (this._rangeRing) this._rangeRing.visible = false;
  },
};
