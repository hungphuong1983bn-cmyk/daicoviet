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
   - Canvas 3D mặc định có buffer 960x540 và dùng CSS `object-fit: contain`
     y hệt canvas 2D, nên hàm đổi toạ độ chuột sẵn có vẫn đúng.
   - Giai đoạn 8: trên màn hình DỌC (điện thoại), Viewport (viewport.js) gọi
     `setView(w, h, 1)` để buffer có tỉ lệ đúng bằng khung chơi và camera 3D
     xoay 90° quanh trục đứng -> bản đồ lấp đầy chiều cao thay vì bị thu
     thành một dải mỏng giữa hai mảng đen.
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
  _previewRing: null,
  _previewDisc: null,
  _castle: null,
  _castleShield: null,
  _hero: null,
  _tmpVec: null,
  _sun: null,
  _horizon: null,
  _rim: null,
  _MW: 960,             // kích thước BẢN ĐỒ (hệ toạ độ game) - không bao giờ đổi
  _MH: 540,
  _W: 960,              // kích thước KHUNG NHÌN (buffer canvas) - đổi theo màn hình
  _H: 540,
  _orient: 0,           // 0 = ngang (gốc) · 1 = dọc (xoay bản đồ 90°)
  _fit: null,           // {dist, pitch, shift, ppu} khi orient = 1
  _uiScale: 1,          // hệ số phóng lớp phủ 2D (thanh máu, số sát thương)
  _fontScale: 1,

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
      this._MW = this._W = cfg.canvasWidth || 960;
      this._MH = this._H = cfg.canvasHeight || 540;

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
      this._sun = sun;
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
    // bật/tắt 3D hoặc WebGL hỏng -> bố cục dọc phải tính lại (2D dự phòng luôn dùng khung ngang gốc)
    if (typeof Viewport !== "undefined") Viewport.update(true);
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
     KHUNG NHÌN THEO MÀN HÌNH (Giai đoạn 8)
     Viewport gọi hàm này mỗi khi khung chơi đổi kích thước/hướng.
       orient = 0 : giữ đúng như bản gốc (buffer 960x540, camera nghiêng ~43°).
       orient = 1 : màn hình DỌC. Buffer có tỉ lệ đúng bằng khung chơi, camera
                    đứng ở phía +x nhìn về -x nên bản đồ xoay 90° thuận chiều
                    kim đồng hồ: quân địch đi từ TRÊN xuống, thành nằm ở DƯỚI.
                    Khoảng cách + độ nghiêng camera được TÍNH để cả bản đồ vừa
                    khít khung ở zoom 1 (không mất một ô đất nào).
     Trả về true nếu có thay đổi thật sự.
     -------------------------------------------------------- */
  setView(w, h, orient) {
    if (!this.renderer || !this.camera) return false;
    w = Math.max(2, Math.round(w));
    h = Math.max(2, Math.round(h));
    const o = orient ? 1 : 0;
    if (w === this._W && h === this._H && o === this._orient) return false;

    this._W = w;
    this._H = h;
    this._orient = o;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this._fit = o ? this._computeFit(w / h) : null;
    const ppu = o ? this._fit.ndcPerUnit * w : w / this._MW;   // pixel canvas / đơn vị bản đồ
    this._ppu = ppu;
    // Lớp phủ 2D (thanh máu, số sát thương) phóng theo cùng tỉ lệ để tương xứng với vật thể
    this._uiScale = o ? Math.max(1, ppu * 1.1) : 1;
    this._fontScale = o ? Math.max(1, ppu * 1.35) : 1;

    if (this._horizon) this._horizon.visible = !o;
    if (this._rim) this._rim.scale.x = o ? 1.24 : 1;
    // Nắng xoay cùng camera để mặt nhìn thấy vẫn được chiếu sáng như bản ngang.
    if (this._sun) {
      if (o) this._sun.position.set(360, 700, 380);
      else this._sun.position.set(-380, 700, 360);
    }
    return true;
  },

  /* Pixel canvas trên mỗi đơn vị bản đồ ở tâm khung (BattleCamera dùng để đổi kéo ngón -> dịch bản đồ). */
  pxPerUnit() { return this._ppu || 1; },
  isPortraitView() { return this._orient === 1; },

  /* Tính camera cho chế độ dọc: chọn độ nghiêng THẤP NHẤT (giữ cảm giác 3D)
     mà vẫn lấp đầy chiều cao khung, rồi nhị phân tìm khoảng cách + độ lệch
     điểm ngắm để cả hình chữ nhật bản đồ vừa khít, cân đều trên/dưới. */
  _computeFit(aspect) {
    const MW = this._MW, MH = this._MH;
    const cam = new THREE.PerspectiveCamera(this.camera.fov, aspect, 10, 9000);
    const pts = [];
    for (const x of [-MW / 2, 0, MW / 2]) for (const z of [-MH / 2, 0, MH / 2]) pts.push(new THREE.Vector3(x, 0, z));
    const MX = 0.04, MY = 0.03;            // lề an toàn (toạ độ NDC)
    const tmp = new THREE.Vector3();

    const measure = (D, pitch, sh) => {
      cam.position.set(sh + D * Math.cos(pitch), D * Math.sin(pitch), 0);
      cam.lookAt(sh, 0, 0);
      cam.updateMatrixWorld(true);
      let maxX = 0, maxY = -9, minY = 9;
      for (const p of pts) {
        tmp.copy(p).project(cam);
        maxX = Math.max(maxX, Math.abs(tmp.x));
        maxY = Math.max(maxY, tmp.y);
        minY = Math.min(minY, tmp.y);
      }
      return { maxX, maxY, minY };
    };
    const centered = (D, pitch) => {        // chọn độ lệch điểm ngắm để cân trên/dưới
      let lo = -500, hi = 500;
      for (let i = 0; i < 28; i++) {
        const sh = (lo + hi) / 2;
        const r = measure(D, pitch, sh);
        if (r.maxY + r.minY > 0) hi = sh; else lo = sh;
      }
      const sh = (lo + hi) / 2;
      const r = measure(D, pitch, sh);
      r.shift = sh;
      return r;
    };
    const solve = (pitch) => {
      let lo = 300, hi = 9000;
      for (let i = 0; i < 28; i++) {
        const D = (lo + hi) / 2;
        const r = centered(D, pitch);
        if (Math.max(r.maxX / (1 - MX), r.maxY / (1 - MY)) > 1) lo = D; else hi = D;
      }
      const r = centered(hi, pitch);
      return { dist: hi, pitch, shift: r.shift, fillY: r.maxY };
    };

    let best = null;
    for (let deg = 50; deg <= 72; deg += 2) {
      best = solve(deg * Math.PI / 180);
      if (best.fillY >= 0.9) break;         // đã lấp đầy chiều cao -> không cần nghiêng thêm
    }

    // số pixel NDC trên mỗi đơn vị bản đồ ở tâm (theo phương ngang màn hình)
    cam.position.set(best.shift + best.dist * Math.cos(best.pitch), best.dist * Math.sin(best.pitch), 0);
    cam.lookAt(best.shift, 0, 0);
    cam.updateMatrixWorld(true);
    const a = new THREE.Vector3(0, 0, 0).project(cam);
    const b = new THREE.Vector3(0, 0, 100).project(cam);
    best.ndcPerUnit = Math.abs(b.x - a.x) * 0.5 / 100;   // × chiều rộng canvas = pixel / đơn vị
    return best;
  },

  /* --------------------------------------------------------
     TIỆN ÍCH
     -------------------------------------------------------- */
  _wx(mx) { return mx - this._MW / 2; },
  _wz(my) { return my - this._MH / 2; },

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
      x: ray.origin.x + ray.direction.x * t + this._MW / 2,
      y: ray.origin.z + ray.direction.z * t + this._MH / 2,
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
    this._previewRing = null;
    this._previewDisc = null;

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
    const rim = new THREE.Mesh(new THREE.PlaneGeometry(this._MW + 60, this._MH + 60), this._mat(pal.field));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = -0.2;
    rim.scale.x = this._orient === 1 ? 1.24 : 1;   // màn dọc nhìn xa hơn theo trục x -> mở rộng thảm cỏ
    rim.receiveShadow = this.renderer.shadowMap.enabled;
    this._levelGroup.add(rim);
    this._rim = rim;

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
    const group = new THREE.Group();
    for (const [x, size, h] of spots) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(size, h, 5), this._mat(pal.hill));
      cone.position.set(x, h / 2 - 20, -620 - Math.abs(x) * 0.12);
      cone.rotation.y = (x % 7) * 0.3;
      group.add(cone);
    }
    // Nhìn từ trên cao (màn dọc) không có đường chân trời: núi cao sẽ đè lên bản đồ -> ẩn đi.
    group.visible = this._orient !== 1;
    this._horizon = group;
    this._levelGroup.add(group);
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
    // NGOẠI HÌNH RIÊNG THEO TỪNG VŨ KHÍ THẬT (không chỉ theo role): tra
    // WeaponVisuals.buildTowerExtras() theo def.id. Đây là phần khiến
    // "Cung" và "Nỏ thần" (cùng role dps) không còn giống hệt nhau.
    const wv = (typeof WeaponVisuals !== "undefined")
      ? WeaponVisuals.buildTowerExtras(THREE, def, (c, o) => this._mat(c, o))
      : { extras: [], hideDefaultCore: false };
    if (wv.hideDefaultCore) core.visible = false;
    g.add(core);

    // nòng / hướng bắn, xoay theo mục tiêu. Nếu vũ khí có hình phụ riêng
    // (cung/nỏ/rìu/hoả tiễn/...), gắn CHÍNH các mesh đó vào turret để chúng
    // xoay theo hướng bắn thay vì dựng cứng một thanh nòng chung chung.
    const turret = new THREE.Group();
    if (wv.extras.length > 0) {
      for (const extra of wv.extras) turret.add(extra);
    } else if (def.role !== "support") {
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 5), this._mat(0x3a2f22));
      barrel.position.x = 13;
      turret.add(barrel);
    }
    g.add(turret);
    g.userData.turret = turret;
    g.userData.core = core;
    g.userData.hasWeaponExtras = wv.extras.length > 0;

    // vòng cấp độ (mỗi cấp một vòng vàng)
    const rings = new THREE.Group();
    g.add(rings);
    g.userData.rings = rings;
    g.userData.level = 0;

    // trang sức theo MỐC TIẾN HOÁ (Giai đoạn 6): được dựng lại mỗi khi
    // công trình vượt mốc, đây chính là phần "ngoại hình thực sự thay đổi".
    const tierOrn = new THREE.Group();
    g.add(tierOrn);
    g.userData.tierOrn = tierOrn;
    g.userData.tierIndex = -1;
    g.userData.baseCoreColor = new THREE.Color(color);

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
    if (mesh.userData.level === tower.level) {
      this._animateTierOrnament(mesh);
      return;
    }
    mesh.userData.level = tower.level;
    const rings = mesh.userData.rings;
    this._disposeGroup(rings);
    const shown = Math.min(tower.level - 1, 5); // tối đa 5 vòng để không rối hình
    for (let i = 0; i < shown; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(16 - i * 0.6, 1.3, 6, 18), this._mat(0xe8c873, { emissive: 0x2e2410 }));
      r.rotation.x = -Math.PI / 2;
      r.position.y = 13 + i * 4;
      rings.add(r);
    }
    this._syncTowerTier(mesh, tower);
  },

  /* Dựng lại ngoại hình theo MỐC TIẾN HOÁ (1/3/5/7/9/10).
     Mỗi mốc thêm chi tiết thật sự khác nhau chứ không chỉ đổi màu:
       1 cơ bản · 3 kim loại · 5 hào quang · 7 cột chiến tướng
       9 huyền thoại (hào quang + hạt bay) · 10 tối thượng (diện mạo mới) */
  _syncTowerTier(mesh, tower) {
    if (typeof TowerTiers === "undefined") return;
    const vis = TowerTiers.visual(tower.def, tower.level);
    if (mesh.userData.tierIndex === vis.tierIndex) return;
    mesh.userData.tierIndex = vis.tierIndex;

    const orn = mesh.userData.tierOrn;
    this._disposeGroup(orn);
    mesh.scale.setScalar(vis.scale);

    const accent = new THREE.Color(vis.accent);
    const core = mesh.userData.core;
    if (core && core.material) {
      core.material.emissive.setRGB(accent.r * vis.glow * 0.55, accent.g * vis.glow * 0.55, accent.b * vis.glow * 0.55);
    }

    const i = vis.tierIndex;
    const matAccent = this._mat(vis.accent, { emissive: vis.glow > 0.4 ? 0x241a08 : 0x000000 });

    // Mốc 1+ (kim loại): đai bọc quanh thân
    if (i >= 1) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(13.5, 1.8, 6, 20), matAccent);
      band.rotation.x = -Math.PI / 2;
      band.position.y = 20;
      orn.add(band);
    }
    // Mốc 2+ (tiến hoá): bệ đá lớn hơn + 4 cột hoa văn Đại Cồ Việt
    if (i >= 2) {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const pil = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 16, 6), matAccent);
        pil.position.set(Math.cos(a) * 17, 10, Math.sin(a) * 17);
        orn.add(pil);
      }
    }
    // Mốc 3+ (chiến tướng): cờ hiệu dựng cao
    if (i >= 3) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 6), this._mat(0x4a3a28));
      pole.position.set(-14, 34, -10);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(18, 11), new THREE.MeshLambertMaterial({
        color: new THREE.Color(vis.accent), side: THREE.DoubleSide,
      }));
      flag.position.set(-5, 48, -10);
      orn.add(pole, flag);
    }
    // Mốc 4+ (huyền thoại): vòng hào quang quay dưới chân
    if (i >= 4) {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(24, 1.6, 6, 32),
        new THREE.MeshLambertMaterial({ color: new THREE.Color(vis.accent), transparent: true, opacity: 0.55 })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 3;
      orn.add(halo);
      mesh.userData.tierHalo = halo;
    } else {
      mesh.userData.tierHalo = null;
    }
    // Mốc 5 (TỐI THƯỢNG): vương miện tám cánh + lõi phát sáng bay lơ lửng
    if (i >= 5) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(16, 20, 8), matAccent);
      crown.position.y = 52;
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(7, 0),
        new THREE.MeshLambertMaterial({ color: 0xfff2c9, emissive: 0x8a6a10 })
      );
      orb.position.y = 70;
      orn.add(crown, orb);
      mesh.userData.tierOrb = orb;
    } else {
      mesh.userData.tierOrb = null;
    }

    orn.traverse((m) => { if (m.isMesh) m.castShadow = this.renderer.shadowMap.enabled; });
  },

  /* Chuyển động nhẹ của trang sức mốc cao. Chỉ chạy khi có vật thể, nên
     không tốn gì ở các mốc thấp. */
  _animateTierOrnament(mesh) {
    const ud = mesh.userData;
    if (!ud.tierHalo && !ud.tierOrb) return;
    const t = performance.now() / 1000;
    if (ud.tierHalo) ud.tierHalo.rotation.z = t * 0.9;
    if (ud.tierOrb) {
      ud.tierOrb.rotation.y = t * 1.6;
      ud.tierOrb.position.y = 70 + Math.sin(t * 2) * 3;
    }
  },

  /* Dựng mesh địch theo LOẠI (typeId). Ngoại hình riêng nằm hết trong
     js/enemy-visuals.js (tra theo ID, rồi theo behavior, rồi mặc định);
     ở đây chỉ lắp ráp: rig (nhún/nâng cả bộ) chứa thân + phụ kiện, còn
     khiên chắn (shield) đứng ngoài rig để không bị nhún theo. */
  _makeEnemyMesh(e) {
    const g = new THREE.Group();
    const rig = new THREE.Group();
    let style = null;
    if (typeof EnemyVisuals !== "undefined" && e) {
      style = EnemyVisuals.build(THREE, e.typeId, e.def, (c, o) => this._mat(c, o));
    }
    let body, head = null;
    if (style) {
      body = style.body;
      rig.add(body);
      for (const part of style.parts) rig.add(part);
    } else {
      // dự phòng tuyệt đối (thiếu enemy-visuals.js): hình gốc cũ
      body = new THREE.Mesh(new THREE.CapsuleGeometry(6, 8, 4, 10), this._mat(0xffffff));
      body.position.y = 11;
      head = new THREE.Mesh(new THREE.SphereGeometry(4.6, 10, 8), this._mat(0xf0d9b5));
      head.position.y = 21;
      rig.add(body, head);
    }
    const height = (style && style.height) || 26;
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(13, 12, 9),
      new THREE.MeshLambertMaterial({ color: 0x79c8f0, transparent: true, opacity: 0.3 })
    );
    shield.position.y = height / 2;
    shield.scale.setScalar(Math.max(1, height / 26));
    shield.visible = false;
    g.add(rig, shield);
    g.userData = {
      body, head, shield, rig,
      anim: style ? style.anim || null : null,
      lift: style ? style.lift || 0 : 0,
      styleKey: e ? e.typeId : "_",
    };
    g.traverse((m) => { if (m.isMesh) m.castShadow = this.renderer.shadowMap.enabled; });
    this._dynGroup.add(g);
    return g;
  },

  _makeProjMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this._buildProjGeometry("dps"), this._mat(0xffffff, { emissive: 0x333322 }));
    g.add(body);
    g.userData.body = body;
    g.userData.shapeKey = "dps";
    // Hào quang phụ cho đạn của tháp đã tiến hoá cao (mốc >=3) - một quầng
    // sáng nhỏ theo sau, chỉ hiện khi cần để không tốn hiệu năng ở mốc thấp.
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe36b, transparent: true, opacity: 0.35 })
    );
    glow.visible = false;
    g.add(glow);
    g.userData.glow = glow;
    this._dynGroup.add(g);
    return g;
  },

  /* Hình dạng đạn theo vai trò vũ khí (mục XV: "projectile mới" theo tiến
     hoá). Luôn tạo geometry RIÊNG cho từng mesh (không chia sẻ) vì
     _trimPool()/_disposeGroup() sẽ gọi .dispose() trên geometry khi dọn bớt
     pool - chia sẻ một geometry dùng chung sẽ làm hỏng các đạn khác đang
     tham chiếu cùng geometry đó. */
  _buildProjGeometry(shapeKey, role) {
    if (typeof WeaponVisuals !== "undefined") {
      return WeaponVisuals.buildProjectileGeometry3D(THREE, shapeKey, role);
    }
    switch (role) {
      case "siege": return new THREE.IcosahedronGeometry(6, 0);       // đá công thành
      case "aoe": return new THREE.OctahedronGeometry(5.5, 0);        // đạn nổ diện rộng
      case "control": return new THREE.TorusGeometry(4, 1.4, 6, 12);  // lưới/xích khống chế
      case "dps":
      default: return new THREE.ConeGeometry(3, 9, 6);                // tên/tia bắn thẳng
    }
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
    // VŨ KHÍ HERO (Hệ thống mới): tra js/hero-weapons.js theo đúng ID
    // Tướng (giống hệt cách tháp tra WeaponVisuals.buildTowerExtras() theo
    // ID Công trình) - gắn vào một nhóm riêng đặt bên hông phải Tướng,
    // KHÔNG đụng cloak/head/crown/halo cũ nên tước hiệu (hero-tiers.js)
    // vẫn đổi màu áo/hào quang y như trước khi có vũ khí riêng.
    const weaponGroup = new THREE.Group();
    weaponGroup.position.set(9, 0, 4);
    weaponGroup.rotation.y = -0.35;
    if (typeof HeroWeapons !== "undefined" && heroDef) {
      const extras = HeroWeapons.build3D(THREE, heroDef.id, heroDef, (c, o) => this._mat(c, o));
      for (const mesh of extras) weaponGroup.add(mesh);
    }
    g.add(weaponGroup);
    g.userData = { halo, cloak, weaponGroup };
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

    // --- vòng tầm bắn XEM TRƯỚC khi đang chọn vũ khí (chưa xác nhận) ---
    const pv = game.previewSpot;
    if (pv) {
      if (!this._previewRing) {
        this._previewRing = new THREE.Mesh(
          new THREE.TorusGeometry(1, 1.2, 6, 48),
          new THREE.MeshLambertMaterial({ color: 0x78c8f0, transparent: true, opacity: 0.65 })
        );
        this._previewRing.rotation.x = -Math.PI / 2;
        this._dynGroup.add(this._previewRing);
        this._previewDisc = new THREE.Mesh(
          new THREE.CircleGeometry(1, 40),
          new THREE.MeshBasicMaterial({ color: 0x78c8f0, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
        );
        this._previewDisc.rotation.x = -Math.PI / 2;
        this._dynGroup.add(this._previewDisc);
      }
      this._previewRing.visible = true;
      this._previewDisc.visible = true;
      this._previewRing.position.set(this._wx(pv.x), 3, this._wz(pv.y));
      this._previewRing.scale.set(pv.range, pv.range, 1);
      this._previewDisc.position.set(this._wx(pv.x), 2, this._wz(pv.y));
      this._previewDisc.scale.set(pv.range, pv.range, 1);
    } else {
      if (this._previewRing) this._previewRing.visible = false;
      if (this._previewDisc) this._previewDisc.visible = false;
    }

    // --- quân địch (dùng pool, không cấp phát mới mỗi khung hình) ---
    // Mesh được gán theo LOẠI địch (styleKey = typeId), không theo chỉ số:
    // khi 1 địch chết, các địch sau không bị dồn sang mesh của loại khác
    // (nếu không sẽ phải dựng lại hình liên tục mỗi lần có địch chết).
    const enemies = run ? run.enemies : [];
    const freeByType = this._enemyFree || (this._enemyFree = new Map());
    for (const list of freeByType.values()) list.length = 0;
    for (const m of this._enemyPool) {
      m.visible = false;
      const k = m.userData.styleKey;
      let list = freeByType.get(k);
      if (!list) { list = []; freeByType.set(k, list); }
      list.push(m);
    }
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const free = freeByType.get(e.typeId);
      let mesh = free && free.length ? free.pop() : null;
      if (!mesh) { mesh = this._makeEnemyMesh(e); this._enemyPool.push(mesh); }
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
      // nhún nhẹ khi đi bộ (cả bộ khung, kể cả phụ kiện) + nâng (ma bay lơ lửng)
      ud.rig.position.y = ud.lift + (e._stunned ? 0 : Math.abs(Math.sin(t * 6 + i)) * 1.6);
      if (ud.anim && !e._stunned) ud.anim(t, i);   // cánh vỗ / chân phi / cờ bay...
    }
    this._trimEnemyPool(enemies.length);

    // --- đạn ---
    const projs = run ? run.projectiles : [];
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      let mesh = this._projPool[i];
      if (!mesh) { mesh = this._makeProjMesh(); this._projPool.push(mesh); }
      mesh.visible = true;
      // Hình đạn RA THEO VŨ KHÍ THẬT (weaponId), không còn gộp chung theo role.
      const shapeKey = p.weaponId || p.role || "dps";
      const body = mesh.userData.body;
      if (mesh.userData.shapeKey !== shapeKey) {
        if (body.geometry) body.geometry.dispose();
        body.geometry = this._buildProjGeometry(shapeKey, p.role);
        mesh.userData.shapeKey = shapeKey;
      }
      body.material.color.set(p.color || "#e8c873");
      const tier = p.tierIndex || 0;
      const tierScale = 1 + tier * 0.08;
      const bigArcRoles = p.role === "siege" || p.role === "aoe";
      const arc = Math.sin(Math.min(1, p._t || 0) * Math.PI) * (bigArcRoles ? 20 : 12);
      mesh.position.set(this._wx(p.x), 26 + arc, this._wz(p.y));
      body.scale.setScalar((p.splashRadius > 0 ? 1.6 : 1) * tierScale);
      // Tên/mũi thẳng xoay theo hướng bay; đá/rìu xoay lăn khi bay.
      if (p.target && (shapeKey === "cung_thu" || shapeKey === "no_than" || shapeKey === "hoa_tien" || shapeKey === "tam_doc" || (!p.role || p.role === "dps"))) {
        body.rotation.z = -Math.atan2(p.target.y - p.y, p.target.x - p.x) + Math.PI / 2;
      } else if (shapeKey === "may_ban_da" || p.role === "siege") {
        body.rotation.x = (p._age || 0) * 3;
      } else if (shapeKey === "riu_chien") {
        body.rotation.z = (p._age || 0) * 8;
      }
      const glow = mesh.userData.glow;
      const glowColor = (typeof WeaponVisuals !== "undefined") ? WeaponVisuals.accentFor(p.weaponId, p.role) : (p.color || "#ffe36b");
      if (tier >= 3 || p.weaponId === "hoa_tien" || p.weaponId === "dao_si" || p.weaponId === "thap_hoa_cong") {
        glow.visible = true;
        glow.scale.setScalar(1.2 + tier * 0.35);
        glow.material.color.set(glowColor);
      } else {
        glow.visible = false;
      }
    }
    for (let i = projs.length; i < this._projPool.length; i++) this._projPool[i].visible = false;
    this._trimPool(this._projPool, projs.length);

    // --- tướng ---
    const heroEnt = run ? run.heroEntity : null;
    if (heroEnt) {
      // Tướng đổi giữa 2 ván (vũ khí 3D khác nhau theo id) -> dựng lại mesh,
      // nếu không sẽ giữ nguyên vũ khí của Tướng ván trước.
      if (this._hero && this._hero.userData.heroId !== heroEnt.def.id) {
        this._dynGroup.remove(this._hero);
        this._disposeGroup(this._hero);
        this._hero = null;
      }
      if (!this._hero) {
        this._hero = this._makeHeroMesh(heroEnt.def);
        this._hero.userData.heroId = heroEnt.def.id;
      }
      this._hero.visible = true;
      this._hero.position.set(this._wx(heroEnt.x), 0, this._wz(heroEnt.y));
      this._hero.rotation.y = Math.sin(t * 0.8) * 0.25;
      const halo = this._hero.userData.halo;
      halo.rotation.z = t * 1.2;
      const flash = Math.max(heroEnt._skillFlash || 0, heroEnt._attackFlash || 0);
      // Tước hiệu (mục HeroTiers, Giai đoạn 8) - CHỈ đổi màu áo choàng/độ
      // sáng hào quang theo cấp, hoàn toàn trang trí, không đụng tới sát
      // thương/tầm đánh (đã cân bằng riêng ở Giai đoạn 7). Chỉ cập nhật
      // màu khi tước hiệu thực sự đổi mốc, không phải mỗi khung hình.
      if (typeof HeroTiers !== "undefined") {
        const rankIdx = HeroTiers.indexOf(heroEnt.level);
        if (this._hero.userData.rankIdx !== rankIdx) {
          const rank = HeroTiers.rank(heroEnt.level);
          this._hero.userData.cloak.material.color.set(rank.accent);
          this._hero.userData.rankIdx = rankIdx;
          this._hero.userData.rankGlow = rank.glow;
          this._hero.userData.rankHaloScale = rank.haloScale;
        }
      }
      const rankGlow = this._hero.userData.rankGlow || 0;
      const rankHaloScale = this._hero.userData.rankHaloScale || 1;
      halo.material.opacity = (0.45 + rankGlow * 0.25) + Math.min(0.5, flash * 1.6);
      halo.scale.setScalar(rankHaloScale * (1 + Math.min(1.6, flash * 3)));
      // Vũ khí vung nhẹ mỗi khi Tướng ra đòn (chỉ trang trí).
      const wg = this._hero.userData.weaponGroup;
      if (wg) wg.rotation.z = Math.min(0.6, (heroEnt._attackFlash || 0) * 3.2);
    } else if (this._hero) {
      this._hero.visible = false;
    }

    // --- khiên thành ---
    if (this._castleShield) {
      const on = !!(run && run.castleShieldRemaining > 0);
      this._castleShield.visible = on;
      if (on) this._castleShield.scale.setScalar(1 + Math.sin(t * 3) * 0.03);
    }

    // --- camera chiến trường (pan/zoom) + rung màn hình ---
    this._applyCamera();
  },

  /* Đặt camera 3D theo BattleCamera: giữ nguyên GÓC NHÌN gốc, chỉ dời tâm
     ngắm và rút ngắn khoảng cách khi zoom. Nhờ giữ nguyên hướng nhìn nên
     bố cục vẫn đẹp ở mọi mức zoom, và `pick()` (bắn tia) vẫn đúng tuyệt
     đối vì nó dùng chính camera này. */
  _applyCamera() {
    const shake = EffectManager.getShakeOffset();
    let cx = this._MW / 2, cy = this._MH / 2, zoom = 1;
    if (typeof BattleCamera !== "undefined" && BattleCamera.enabled()) {
      cx = BattleCamera.x; cy = BattleCamera.y; zoom = BattleCamera.zoom;
    }
    // Điểm ngắm ĐÚNG BẰNG tâm camera -> giữa màn hình luôn là (cx, cy),
    // nhờ vậy zoom/pan và thao tác chạm khớp nhau tuyệt đối.
    const tx = this._wx(cx), tz = this._wz(cy);
    const d = 1 / zoom;
    const fog = this.scene ? this.scene.fog : null;
    const f = this._orient === 1 ? this._fit : null;
    if (f) {
      // Màn hình DỌC: camera đứng phía +x, nhìn về -x (bản đồ xoay 90° thuận chiều kim đồng hồ).
      const fx = tx + f.shift * d;
      const back = f.dist * Math.cos(f.pitch) * d;
      const up = f.dist * Math.sin(f.pitch) * d;
      this.camera.position.set(fx + back, up + shake.y * 1.4, tz + shake.x * 1.4);
      this.camera.lookAt(fx, 0, tz);
      // camera xa hơn bản ngang -> đẩy sương mù ra xa theo cùng tỉ lệ để hình không bị phai màu
      const r = f.dist / 941;
      if (fog) { fog.near = 900 * r; fog.far = 2200 * r; }
    } else {
      this.camera.position.set(tx + shake.x * 1.4, 640 * d + shake.y * 1.4, tz + 690 * d);
      this.camera.lookAt(tx, 0, tz);
      if (fog) { fog.near = 900; fog.far = 2200; }
    }
  },

  /* Dọn pool địch: CHỈ bỏ mesh đang ẩn (không dùng khung hình này). Không
     dùng _trimPool() vì nó pop từ cuối mảng - với pool gán theo loại địch,
     mesh đang hiển thị có thể nằm ở cuối và sẽ bị huỷ nhầm. */
  _trimEnemyPool(needed) {
    const keep = Math.max(needed + 24, 32);
    for (let i = this._enemyPool.length - 1; i >= 0 && this._enemyPool.length > keep; i--) {
      const m = this._enemyPool[i];
      if (m.visible) continue;
      this._enemyPool.splice(i, 1);
      this._dynGroup.remove(m);
      this._disposeGroup(m);
    }
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
    const u = this._uiScale, fs = this._fontScale;   // = 1 ở chế độ ngang gốc
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
          const w = (e.isBoss ? 56 : 26) * u;
          ctx.fillStyle = "rgba(0,0,0,.55)";
          ctx.fillRect(p.x - w / 2, p.y, w, 4 * u);
          ctx.fillStyle = e.isBoss ? "#e0483c" : (e.isElite ? "#e8c873" : "#7bc96f");
          ctx.fillRect(p.x - w / 2, p.y, w * Math.max(0, e.hp / e.maxHp), 4 * u);
          if (e.shield > 0 && e.maxShield > 0) {
            ctx.fillStyle = "#79c8f0";
            ctx.fillRect(p.x - w / 2, p.y - 4 * u, w * Math.max(0, e.shield / e.maxShield), 3 * u);
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
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      // vòng nổ lan
      for (const r of EffectManager._rings) {
        const k = r.age / r.life;
        const c = this.project(r.x, r.y, 4);
        const edge = this.project(r.x + r.radius * (0.35 + k * 0.75), r.y, 4);
        ctx.globalAlpha = Math.max(0, 1 - k) * 0.6;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = (3 * (1 - k) + 1) * u;
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
        ctx.fillRect(p.x - 1.5 * u, p.y - 1.5 * u, 3 * u, 3 * u);
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
        ctx.font = "bold " + Math.round((n.isCritical ? 17 : 13) * fs) + "px sans-serif";
        ctx.strokeStyle = "rgba(0,0,0,.6)";
        ctx.lineWidth = 3 * fs;
        const text = (n.isCritical ? "✦-" : "-") + Math.round(n.amount);
        ctx.strokeText(text, p.x, p.y - (n.age / n.life) * 24 * u);
        ctx.fillText(text, p.x, p.y - (n.age / n.life) * 24 * u);
      }
      ctx.globalAlpha = 1;

      // thanh máu thành, neo ngay trên nóc thành
      const c = game.levelDef && game.levelDef.castle;
      if (c) {
        const p = this.project(c.x, c.y, 130);
        const pct = Math.max(0, run.hp / run.maxHp);
        ctx.fillStyle = "rgba(0,0,0,.55)";
        ctx.fillRect(p.x - 42 * u, p.y, 84 * u, 7 * u);
        ctx.fillStyle = pct > 0.5 ? "#7bc96f" : (pct > 0.25 ? "#e8c873" : "#e0483c");
        ctx.fillRect(p.x - 42 * u, p.y, 84 * u * pct, 7 * u);
        ctx.strokeStyle = "rgba(201,162,74,.85)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - 42 * u, p.y, 84 * u, 7 * u);
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
    for (const m of this._enemyPool) m.visible = false;
    this._trimEnemyPool(0);
    this._trimPool(this._projPool, 0);
    for (const m of this._projPool) m.visible = false;
    if (this._hero) this._hero.visible = false;
    if (this._rangeRing) this._rangeRing.visible = false;
    if (this._previewRing) this._previewRing.visible = false;
    if (this._previewDisc) this._previewDisc.visible = false;
  },
};
