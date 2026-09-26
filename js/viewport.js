/* =========================================================
   VIEWPORT.JS  (Giai đoạn 8 - Toàn màn hình trên mobile)

   VẤN ĐỀ CŨ
   ---------
   Bản đồ là khung NGANG 16:9 (960x540). Trên điện thoại cầm DỌC, khung
   này chỉ rộng bằng chiều ngang máy nên cao khoảng 1/3 chiều cao màn hình,
   phần còn lại là hai mảng đen -> khó quan sát, nhìn thiếu chuyên nghiệp.

   CÁCH GIẢI QUYẾT
   ---------------
   1. Khi khung chơi có tỉ lệ DỌC, module này cho buffer canvas (3D + lớp phủ
      2D) có tỉ lệ ĐÚNG BẰNG khung chơi, đồng thời xoay camera 3D 90° để trục
      dài của bản đồ chạy theo chiều cao màn hình:
        quân địch đi từ TRÊN xuống · thành nằm ở DƯỚI · không còn dải đen.
      Toàn bộ logic game vẫn chạy trên toạ độ bản đồ gốc 960x540 (chỉ đổi
      cách NHÌN), nên tầm bắn, đường đi, save game... không đổi một dòng.
   2. Màn hình ngang / máy tính: giữ NGUYÊN bố cục cũ (buffer 960x540).
   3. Chế độ 2D dự phòng (không có WebGL) luôn dùng khung ngang gốc.
   4. Hỗ trợ TOÀN MÀN HÌNH thật (Fullscreen API) để ẩn thanh địa chỉ trình
      duyệt; iPhone Safari không có API này nên hướng dẫn "Thêm vào Màn hình
      chính" (đã có manifest + meta PWA trong index.html).

   Có thể tắt phần xoay dọc trong Cài đặt (features.portraitFill = false).
   ========================================================= */

const Viewport = {
  PORTRAIT_MAX_ASPECT: 0.9,   // rộng/cao của khung chơi nhỏ hơn mức này -> coi là màn dọc
  MAX_PIXELS: 800000,         // trần số điểm ảnh buffer ở chế độ dọc (giữ tải GPU ổn định)
  MAX_DPR_SCALE: 1.75,        // buffer tối đa 1.75 điểm ảnh / px CSS

  _inited: false,
  _raf: 0,
  _lastKey: "",
  stage: null,
  canvas2d: null,
  portrait: false,

  /* ---------------- Vòng đời ---------------- */
  init(canvas2d) {
    if (this._inited || !canvas2d) return;
    this._inited = true;
    this.canvas2d = canvas2d;
    this.stage = canvas2d.parentElement;

    const later = () => this.schedule();
    window.addEventListener("resize", later);
    window.addEventListener("orientationchange", later);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", later);
    document.addEventListener("fullscreenchange", later);
    document.addEventListener("webkitfullscreenchange", later);
    // Khung chơi đổi cỡ vì lý do khác (ẩn/hiện hàng HUD, màn chơi vừa hiện ra...)
    if (typeof ResizeObserver !== "undefined" && this.stage) {
      this._ro = new ResizeObserver(later);
      this._ro.observe(this.stage);
    }
    this.update(true);
  },

  /* Gộp nhiều sự kiện resize dồn dập thành một lần cập nhật mỗi khung hình. */
  schedule() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this.update(); });
  },

  isPortrait() { return this.portrait; },

  /* ---------------- Tính bố cục ---------------- */
  _mapSize() {
    const cfg = (typeof GAME_DATA !== "undefined" && GAME_DATA && GAME_DATA.config) || {};
    return { w: cfg.canvasWidth || 960, h: cfg.canvasHeight || 540 };
  },

  _wantPortrait(stageW, stageH) {
    const feats = (typeof GAME_DATA !== "undefined" && GAME_DATA && GAME_DATA.config && GAME_DATA.config.features) || {};
    if (feats.portraitFill === false) return false;
    if (typeof Renderer3D === "undefined" || !Renderer3D.active()) return false;   // 2D dự phòng: giữ khung ngang
    return stageW / stageH < this.PORTRAIT_MAX_ASPECT;
  },

  _desired() {
    if (!this.stage) return null;
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return null;                     // màn chơi đang ẩn -> giữ nguyên trạng thái
    const map = this._mapSize();
    if (!this._wantPortrait(w, h)) return { orient: 0, w: map.w, h: map.h };

    const k = Math.min(window.devicePixelRatio || 1, this.MAX_DPR_SCALE);
    let bw = w * k, bh = h * k;
    const px = bw * bh;
    if (px > this.MAX_PIXELS) { const f = Math.sqrt(this.MAX_PIXELS / px); bw *= f; bh *= f; }
    return { orient: 1, w: Math.max(240, Math.round(bw)), h: Math.max(320, Math.round(bh)) };
  },

  /* Áp bố cục mới nếu có thay đổi (hoặc `force`). */
  update(force) {
    if (!this._inited) return;
    const d = this._desired();
    if (!d) return;
    const key = d.orient + ":" + d.w + "x" + d.h;
    if (!force && key === this._lastKey) return;
    this._lastKey = key;
    this.portrait = d.orient === 1;

    // 1) canvas 3D + camera 3D
    if (typeof Renderer3D !== "undefined" && Renderer3D.renderer) Renderer3D.setView(d.w, d.h, d.orient);

    // 2) canvas 2D (lớp phủ + bắt chạm) phải có ĐÚNG cùng buffer với canvas 3D
    const c2 = this.canvas2d;
    if (c2.width !== d.w) c2.width = d.w;
    if (c2.height !== d.h) c2.height = d.h;

    // 3) camera chiến trường: biết hướng nhìn + tỉ lệ pixel/đơn vị để kéo/zoom đúng
    if (typeof BattleCamera !== "undefined") {
      const ppu = (this.portrait && typeof Renderer3D !== "undefined") ? Renderer3D.pxPerUnit() : 1;
      BattleCamera.setOrientation(d.orient, ppu, d.w, d.h);
    }

    // 4) CSS + vẽ lại ngay (kể cả khi đang tạm dừng)
    if (this.stage) this.stage.classList.toggle("map-portrait", this.portrait);
    document.body.classList.toggle("portrait-map", this.portrait);
    try {
      if (typeof Game !== "undefined" && Game.render && Game.levelDef) Game.render();
    } catch (e) { /* khung kế tiếp sẽ vẽ lại */ }
  },

  /* ---------------- TOÀN MÀN HÌNH ---------------- */
  _fsRoot() { return document.documentElement; },

  fullscreenSupported() {
    const el = this._fsRoot();
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  },

  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },

  /* Đã chạy như ứng dụng cài trên màn hình chính (không còn thanh trình duyệt). */
  isStandalone() {
    try {
      if (window.navigator.standalone === true) return true;
      // Khi CHÍNH game vừa gọi requestFullscreen, trình duyệt cũng báo display-mode: fullscreen.
      // Trường hợp đó KHÔNG phải ứng dụng cài sẵn -> vẫn phải cho người chơi thoát ra được.
      if (this.isFullscreen()) return false;
      return ["fullscreen", "standalone", "minimal-ui"].some((m) => window.matchMedia("(display-mode: " + m + ")").matches);
    } catch (e) { return false; }
  },

  isIOS() {
    const ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  },

  isTouchDevice() {
    try { return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0; }
    catch (e) { return false; }
  },

  /* Có nên hiện nút toàn màn hình không? (ẩn khi đã là ứng dụng độc lập) */
  canOfferFullscreen() {
    if (this.isStandalone()) return false;
    return this.fullscreenSupported() || this.isIOS();
  },

  /* Vào/thoát toàn màn hình. Phải gọi từ một thao tác chạm của người chơi.
     Trả về { ok, reason } với reason: "ios" | "unsupported" | "denied" | "standalone". */
  async toggleFullscreen() {
    if (this.isStandalone()) return { ok: true, reason: "standalone" };
    if (!this.fullscreenSupported()) return { ok: false, reason: this.isIOS() ? "ios" : "unsupported" };
    try {
      if (this.isFullscreen()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        const p = exit.call(document);
        if (p && p.then) await p;
      } else {
        const el = this._fsRoot();
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        const p = req.call(el, { navigationUI: "hide" });
        if (p && p.then) await p;
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "denied" };
    }
  },

  /* Tự vào toàn màn hình khi bắt đầu trận trên điện thoại/máy tính bảng.
     Chỉ chạy nếu người chơi không tắt trong Cài đặt và đây là thiết bị cảm ứng
     (trên máy tính không tự ý phóng to cửa sổ). Lỗi/từ chối được bỏ qua êm. */
  autoFullscreen() {
    const feats = (typeof GAME_DATA !== "undefined" && GAME_DATA && GAME_DATA.config && GAME_DATA.config.features) || {};
    if (feats.autoFullscreen === false) return;
    if (!this.isTouchDevice() || this.isStandalone() || this.isFullscreen()) return;
    if (!this.fullscreenSupported()) return;
    try {
      const el = this._fsRoot();
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const p = req.call(el, { navigationUI: "hide" });
      if (p && p.catch) p.catch(() => { /* trình duyệt từ chối: bỏ qua */ });
    } catch (e) { /* bỏ qua */ }
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = Viewport;
