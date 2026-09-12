/* =========================================================
   DATA.JS
   Toàn bộ dữ liệu game (số liệu, bản đồ, đợt chơi...) được đặt
   ở đây, tách biệt hoàn toàn khỏi logic (game.js / entities.js).
   Muốn thêm tướng / quân / màn chơi / công trình / kỹ năng mới
   -> chỉ cần bổ sung dữ liệu trong file này.
   ========================================================= */

const GAME_DATA = {

  /* ---------------- CẤU HÌNH CHUNG ---------------- */
  config: {
    canvasWidth: 960,
    canvasHeight: 540,
    startingGold: 150,
    startingHP: 20,
    speeds: [1, 2],
  },

  /* ---------------- LOẠI QUÂN ĐỊCH ----------------
     hp, speed (px/s), reward (vàng khi bị diệt),
     damage (sát thương gây cho thành nếu lọt tới cuối đường)
  */
  enemyTypes: {
    quan_su_quan: {
      id: "quan_su_quan",
      name: "Quân sứ quân",
      hp: 40,
      speed: 55,
      reward: 8,
      damage: 1,
      color: "#8a4a3a",
      radius: 12,
      icon: "🛡",
    },
    ky_binh: {
      id: "ky_binh",
      name: "Kỵ binh",
      hp: 28,
      speed: 95,
      reward: 10,
      damage: 1,
      color: "#5a5a8a",
      radius: 11,
      icon: "🐎",
    },
    truong_giap: {
      id: "truong_giap",
      name: "Trường giáp binh",
      hp: 90,
      speed: 40,
      reward: 16,
      damage: 2,
      color: "#4a4a4a",
      radius: 14,
      icon: "⚔",
    },
    tuong_giac: {
      id: "tuong_giac",
      name: "Tướng giặc",
      hp: 260,
      speed: 38,
      reward: 60,
      damage: 4,
      color: "#7a1f2b",
      radius: 18,
      icon: "👑",
      boss: true,
    },
  },

  /* ---------------- LOẠI QUÂN THỦ THÀNH (THÁP) ----------------
     range (bán kính bắn), fireRate (số phát/giây),
     projectileSpeed (px/s), splashRadius (0 = không lan)
  */
  towerTypes: {
    cung_thu: {
      id: "cung_thu",
      name: "Cung thủ",
      cost: 50,
      damage: 12,
      range: 130,
      fireRate: 1.1,
      projectileSpeed: 420,
      splashRadius: 0,
      color: "#c9a24a",
      icon: "🏹",
      desc: "Bắn xa, sát thương vừa phải.",
    },
    no_than: {
      id: "no_than",
      name: "Nỏ thần",
      cost: 100,
      damage: 30,
      range: 160,
      fireRate: 0.7,
      projectileSpeed: 520,
      splashRadius: 0,
      color: "#2f5d50",
      icon: "🎯",
      desc: "Sát thương lớn, bắn chậm.",
    },
    voi_chien: {
      id: "voi_chien",
      name: "Voi chiến",
      cost: 130,
      damage: 16,
      range: 100,
      fireRate: 0.8,
      projectileSpeed: 300,
      splashRadius: 45,
      color: "#7a1f2b",
      icon: "🐘",
      desc: "Sát thương lan toả diện rộng.",
    },
  },

  /* ---------------- HỆ THỐNG TƯỚNG (mở rộng sau) ----------------
     Chưa dùng ở prototype này, để sẵn cấu trúc cho tương lai. */
  generals: {
    // dinh_bo_linh: { id:"dinh_bo_linh", name:"Đinh Bộ Lĩnh", skill:null, ... }
  },

  /* ---------------- HỆ THỐNG KỸ NĂNG (mở rộng sau) ---------------- */
  skills: {
    // vd: { id:"hoa_cong", name:"Hoả công", cooldown:30, effect:null }
  },

  /* ---------------- DANH SÁCH MÀN CHƠI ---------------- */
  levels: {
    hoa_lu: {
      id: "hoa_lu",
      name: "Hoa Lư",
      description: "Kinh đô đầu tiên của Đại Cồ Việt, năm 968.",

      /* Đường đi của quân địch (waypoint, toạ độ theo canvas 960x540) */
      path: [
        { x: -40, y: 90 },
        { x: 170, y: 90 },
        { x: 170, y: 280 },
        { x: 430, y: 280 },
        { x: 430, y: 110 },
        { x: 700, y: 110 },
        { x: 700, y: 360 },
        { x: 820, y: 360 },
      ],

      /* Vị trí thành Hoa Lư (điểm cuối đường đi) */
      castle: { x: 850, y: 360 },

      /* Các ô đất trống có thể xây quân thủ thành */
      buildSpots: [
        { x: 100, y: 190 },
        { x: 260, y: 90 },
        { x: 260, y: 360 },
        { x: 430, y: 200 },
        { x: 560, y: 110 },
        { x: 560, y: 280 },
        { x: 700, y: 220 },
        { x: 780, y: 440 },
      ],

      /* Danh sách các đợt (wave). Mỗi đợt gồm nhiều nhóm quân,
         mỗi nhóm: loại quân, số lượng, khoảng cách ra quân (giây) */
      waves: [
        { groups: [{ type: "quan_su_quan", count: 6, interval: 0.9 }] },
        {
          groups: [
            { type: "quan_su_quan", count: 6, interval: 0.8 },
            { type: "ky_binh", count: 3, interval: 0.7 },
          ],
        },
        {
          groups: [
            { type: "ky_binh", count: 5, interval: 0.6 },
            { type: "truong_giap", count: 3, interval: 1.0 },
          ],
        },
        {
          groups: [
            { type: "quan_su_quan", count: 8, interval: 0.6 },
            { type: "truong_giap", count: 4, interval: 0.9 },
          ],
        },
        {
          groups: [
            { type: "truong_giap", count: 5, interval: 0.8 },
            { type: "ky_binh", count: 6, interval: 0.5 },
            { type: "tuong_giac", count: 1, interval: 1 },
          ],
        },
      ],
    },
  },
};
