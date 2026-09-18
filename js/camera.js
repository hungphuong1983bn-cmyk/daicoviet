/* =========================================================
   CAMERA.JS  (Giai đoạn 6 - Camera chiến trường)

   Cho phép KÉO và PHÓNG TO chiến trường:
     - PC     : giữ chuột trái kéo để pan, lăn chuột để zoom.
     - Mobile : một ngón kéo để pan, hai ngón pinch để zoom.
     - Nút    : 🎯 về trung tâm · 🔍+ · 🔍− · 👑 theo dõi Boss.
     - Mini-map: chạm để nhảy camera tới khu vực đó.

   NGUYÊN TẮC:
   - Toàn bộ LOGIC game vẫn chạy trên hệ toạ độ bản đồ gốc 960x540.
     Camera chỉ đổi cách NHÌN, không đổi một dòng nào của gameplay.
   - Không kéo ra ngoài bản đồ: zoom nhỏ nhất = 1 (vừa khít bản đồ), nên
     vùng nhìn LUÔN nằm trọn trong bản đồ, không bao giờ lộ vùng trống.
   - Thao tác chọn tháp/kỹ năng không bị ảnh hưởng: chỉ khi ngón tay/chuột
     di chuyển quá ngưỡng DRAG_THRESHOLD mới tính là kéo camera, còn lại
     vẫn là một cú chạm chọn ô đất như cũ.
   ========================================================= */

const BattleCamera = {
  W: 960,
  H: 540,

  x: 480,          // tâm khung nhìn theo toạ độ bản đồ
  y: 270,
  zoom: 1,

  MIN_ZOOM: 1,
  MAX_ZOOM: 3.2,

  _targetZoom: 1,
  _followBossId: null,
  _enabled: true,

  /* ---------------- Vòng đời ---------------- */
  init(mapW, mapH) {
    this.W = mapW || 960;
    this.H = mapH || 540;
    this.reset();
  },

  reset() {
    this.x = this.W / 2;
    this.y = this.H / 2;
    this.zoom = 1;
    this._targetZoom = 1;
    this._followBossId = null;
    this._clamp();
  },

  enabled() {
    try {
      const f = (GAME_DATA && GAME_DATA.config && GAME_DATA.config.features) || {};
      return f.cameraEnabled !== false;
    } catch (e) { return true; }
  },

  /* Camera có đang lệch khỏi mặc định không? (để biết có cần biến đổi hình) */
  isDefault() {
    return Math.abs(this.zoom - 1) < 0.001 &&
           Math.abs(this.x - this.W / 2) < 0.5 &&
           Math.abs(this.y - this.H / 2) < 0.5;
  },

  /* ---------------- Giới hạn ---------------- */
  _clamp() {
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom));
    const halfW = this.W / (2 * this.zoom);
    const halfH = this.H / (2 * this.zoom);
    // zoom = 1 -> halfW = W/2 -> tâm bị ghim đúng giữa bản đồ.
    this.x = Math.max(halfW, Math.min(this.W - halfW, this.x));
    this.y = Math.max(halfH, Math.min(this.H - halfH, this.y));
  },

  /* ---------------- Thao tác ---------------- */
  /* Kéo: dx/dy tính bằng PIXEL TRÊN CANVAS (đã quy về hệ 960x540). */
  panByScreen(dx, dy) {
    if (!this.enabled()) return;
    this._followBossId = null;
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this._clamp();
  },

  /* Zoom quanh một điểm trên canvas để điểm đó "đứng yên" dưới ngón tay. */
  zoomAt(factor, canvasX, canvasY) {
    if (!this.enabled()) return;
    const before = this.screenToMap(canvasX, canvasY);
    this.zoom *= factor;
    this._clamp();
    const after = this.screenToMap(canvasX, canvasY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this._clamp();
    this._targetZoom = this.zoom;
  },

  zoomStep(inOut) {
    this.zoomAt(inOut > 0 ? 1.35 : 1 / 1.35, this.W / 2, this.H / 2);
  },

  centerOn(mx, my) {
    this.x = mx;
    this.y = my;
    this._clamp();
  },

  /* Theo dõi Boss: bật/tắt. Trả về true nếu đang bật sau khi gọi. */
  toggleFollowBoss(bossId) {
    if (this._followBossId && (!bossId || this._followBossId === bossId)) {
      this._followBossId = null;
      return false;
    }
    this._followBossId = bossId || "any";
    if (this.zoom < 1.5) { this.zoom = 1.6; this._clamp(); }
    return true;
  },

  followingBoss() { return !!this._followBossId; },

  /* Gọi mỗi khung hình: bám theo Boss nếu đang bật. */
  update(run) {
    if (!this._followBossId || !run) return;
    const boss = (run.enemies || []).find((e) => e.isBoss && e.alive !== false);
    if (!boss) { this._followBossId = null; return; }
    // nội suy mượt, tránh giật hình
    this.x += (boss.x - this.x) * 0.12;
    this.y += (boss.y - this.y) * 0.12;
    this._clamp();
  },

  /* ---------------- Đổi toạ độ ---------------- */
  /* Canvas (0..960, 0..540) -> bản đồ. */
  screenToMap(px, py) {
    return {
      x: (px - this.W / 2) / this.zoom + this.x,
      y: (py - this.H / 2) / this.zoom + this.y,
    };
  },

  /* Bản đồ -> canvas. */
  mapToScreen(mx, my) {
    return {
      x: (mx - this.x) * this.zoom + this.W / 2,
      y: (my - this.y) * this.zoom + this.H / 2,
    };
  },

  /* Áp biến đổi lên context 2D (chế độ vẽ 2D dự phòng). */
  apply(ctx) {
    ctx.translate(this.W / 2, this.H / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  },

  /* Khung nhìn hiện tại theo toạ độ bản đồ - mini-map dùng để vẽ ô chữ nhật. */
  viewRect() {
    const w = this.W / this.zoom;
    const h = this.H / this.zoom;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = BattleCamera;
