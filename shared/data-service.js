/* =========================================================
   DATA-SERVICE.JS
   NGUỒN DỮ LIỆU TRUNG TÂM DUY NHẤT của toàn bộ dự án (game + admin).

   Mọi số liệu (tướng, công trình, quân địch, boss, màn chơi, wave,
   kỹ năng, nhiệm vụ, vật phẩm, cấu hình...) đều đi qua đây. Không có
   module nào khác được phép tự định nghĩa lại các con số này.

   Kiến trúc:
     StorageService  -> đọc/ghi thô (key-value)
     DataService      -> "database" logic: collection, CRUD, seed mặc định
     AdminService      -> CRUD có ghi log + phân quyền (dùng ở trang Admin)
     Game (js/game.js) -> chỉ ĐỌC dữ liệu qua DataService.buildGameData()

   Khi chuyển sang backend thật: giữ nguyên toàn bộ API bên dưới
   (list/get/create/update/remove/getConfig/setConfig...), chỉ đổi
   phần triển khai bên trong từ StorageService (localStorage) sang
   gọi fetch() tới REST API / GraphQL.
   ========================================================= */

const DataService = (() => {
  const KEYS = {
    schemaVersion: "schema_version",
    gameConfig: "collection:gameConfig",
    players: "collection:players",
    heroes: "collection:heroes",
    buildings: "collection:buildings",
    enemies: "collection:enemies",
    bosses: "collection:bosses",
    stages: "collection:stages",
    skills: "collection:skills",
    quests: "collection:quests",
    items: "collection:items",
    rewards: "collection:rewards",
    adminUsers: "collection:adminUsers",
    adminLogs: "collection:adminLogs",
  };

  const SCHEMA_VERSION = 2;

  /* ---------------------------------------------------------
     DỮ LIỆU MẶC ĐỊNH (seed)
     Đây là bản dịch lại toàn bộ số liệu gốc từng nằm cứng trong
     js/data.js của phiên bản 1, cộng thêm dữ liệu mới cho Giai đoạn 2
     (tướng, boss, thêm màn chơi, kỹ năng, nhiệm vụ, vật phẩm).
     --------------------------------------------------------- */
  function defaultGameConfig() {
    return {
      MAX_LEVEL: 10,
      START_GOLD: 150,
      START_HP: 20,
      START_STAGE: "hoa_lu",
      WAVE_TIME: 0, // 0 = không giới hạn thời gian chờ giữa các đợt
      ENEMY_SPAWN_RATE: 1, // hệ số nhân lên khoảng cách spawn (1 = mặc định, <1 = spawn nhanh hơn)
      BOSS_MULTIPLIER: 1,
      REWARD_MULTIPLIER: 1,
      canvasWidth: 960,
      canvasHeight: 540,
      speeds: [1, 2],
      features: {
        soundEnabled: true,
        musicEnabled: false, // chưa có file nhạc trong dự án, cờ này để dành sẵn
        tutorialEnabled: true,
        autoSaveEnabled: true,
        debugMode: false,
        showDamageNumbers: true,
        showEnemyHpBar: true,
        showFps: false,
      },
    };
  }

  function defaultBuildings() {
    return [
      {
        id: "cung_thu", name: "Cung thủ", nameVi: "Cung thủ",
        description: "Bắn xa, sát thương vừa phải.",
        icon: "🏹", color: "#c9a24a",
        cost: 50, damage: 12, range: 130, fireRate: 1.1,
        projectileSpeed: 420, splashRadius: 0,
        maxLevel: 3, upgradeCost: 40, upgradeDamageMult: 0.35, upgradeRangeMult: 0.08,
        enabled: true,
      },
      {
        id: "no_than", name: "Nỏ thần", nameVi: "Nỏ thần",
        description: "Sát thương lớn, bắn chậm.",
        icon: "🎯", color: "#2f5d50",
        cost: 100, damage: 30, range: 160, fireRate: 0.7,
        projectileSpeed: 520, splashRadius: 0,
        maxLevel: 3, upgradeCost: 80, upgradeDamageMult: 0.4, upgradeRangeMult: 0.08,
        enabled: true,
      },
      {
        id: "voi_chien", name: "Voi chiến", nameVi: "Voi chiến",
        description: "Sát thương lan toả diện rộng.",
        icon: "🐘", color: "#7a1f2b",
        cost: 130, damage: 16, range: 100, fireRate: 0.8,
        projectileSpeed: 300, splashRadius: 45,
        maxLevel: 3, upgradeCost: 100, upgradeDamageMult: 0.3, upgradeRangeMult: 0.05,
        enabled: true,
      },
    ];
  }

  function defaultEnemies() {
    return [
      {
        id: "quan_su_quan", name: "Quân sứ quân",
        hp: 40, speed: 55, reward: 8, damage: 1,
        defense: 0, resistance: 0,
        color: "#8a4a3a", radius: 12, icon: "🛡", enabled: true,
      },
      {
        id: "ky_binh", name: "Kỵ binh",
        hp: 28, speed: 95, reward: 10, damage: 1,
        defense: 0, resistance: 0,
        color: "#5a5a8a", radius: 11, icon: "🐎", enabled: true,
      },
      {
        id: "truong_giap", name: "Trường giáp binh",
        hp: 90, speed: 40, reward: 16, damage: 2,
        defense: 2, resistance: 0,
        color: "#4a4a4a", radius: 14, icon: "⚔", enabled: true,
      },
      {
        id: "cung_thu_dich", name: "Cung thủ địch",
        hp: 34, speed: 48, reward: 12, damage: 1,
        defense: 0, resistance: 10,
        color: "#6a5a2f", radius: 12, icon: "🏹", enabled: true,
      },
      {
        id: "tuong_giac", name: "Tướng giặc",
        hp: 260, speed: 38, reward: 60, damage: 4,
        defense: 4, resistance: 0,
        color: "#7a1f2b", radius: 18, icon: "👑", enabled: true,
      },
    ];
  }

  function defaultBosses() {
    return [
      {
        id: "boss_hoa_lu", name: "Sứ Quân Hoả Long",
        hp: 900, damage: 6, defense: 6, resistance: 10,
        speed: 34, reward: 200, rewardExp: 80,
        skill: "Cuồng nộ (+30% tốc độ khi máu dưới 30%)",
        skillCooldown: 0,
        icon: "🔥", color: "#7a1f2b",
        description: "Thủ lĩnh sứ quân cố thủ Hoa Lư, xuất hiện ở đợt cuối.",
        enabled: true,
      },
      {
        id: "boss_dai_la", name: "Đô Hộ Sứ Cao Chính Bình",
        hp: 1500, damage: 8, defense: 8, resistance: 15,
        speed: 36, reward: 320, rewardExp: 140,
        skill: "Triệu hồi thêm 3 kỵ binh khi máu dưới 50%",
        skillCooldown: 0,
        icon: "🐉", color: "#3a2a55",
        description: "Trấn giữ phòng tuyến Đại La kiên cố.",
        enabled: true,
      },
      {
        id: "boss_bach_dang", name: "Thuỷ Tặc Chúa",
        hp: 2400, damage: 10, defense: 10, resistance: 20,
        speed: 32, reward: 500, rewardExp: 240,
        skill: "Hồi 5% máu tối đa mỗi 5 giây",
        skillCooldown: 0,
        icon: "🌊", color: "#1f4a5a",
        description: "Trấn giữ cửa sông Bạch Đằng, được cọc gỗ Ngô Quyền chờ sẵn.",
        enabled: true,
      },
    ];
  }

  function defaultStages() {
    return [
      {
        id: "hoa_lu", order: 1, name: "Hoa Lư",
        mapName: "Kinh đô Hoa Lư",
        description: "Kinh đô đầu tiên của Đại Cồ Việt, năm 968.",
        background: "hoa_lu",
        difficulty: 1,
        unlockCondition: { type: "always" },
        rewardGold: 60, rewardExp: 30,
        enabled: true,
        path: [
          { x: -40, y: 90 }, { x: 170, y: 90 }, { x: 170, y: 280 },
          { x: 430, y: 280 }, { x: 430, y: 110 }, { x: 700, y: 110 },
          { x: 700, y: 360 }, { x: 820, y: 360 },
        ],
        castle: { x: 850, y: 360 },
        buildSpots: [
          { x: 100, y: 190 }, { x: 260, y: 90 }, { x: 260, y: 360 },
          { x: 430, y: 200 }, { x: 560, y: 110 }, { x: 560, y: 280 },
          { x: 700, y: 220 }, { x: 780, y: 440 },
        ],
        waves: [
          { groups: [{ type: "quan_su_quan", count: 6, interval: 0.9 }] },
          { groups: [{ type: "quan_su_quan", count: 6, interval: 0.8 }, { type: "ky_binh", count: 3, interval: 0.7 }] },
          { groups: [{ type: "ky_binh", count: 5, interval: 0.6 }, { type: "truong_giap", count: 3, interval: 1.0 }] },
          { groups: [{ type: "quan_su_quan", count: 8, interval: 0.6 }, { type: "truong_giap", count: 4, interval: 0.9 }] },
          { groups: [{ type: "truong_giap", count: 5, interval: 0.8 }, { type: "ky_binh", count: 6, interval: 0.5 }, { boss: "boss_hoa_lu" }] },
        ],
      },
      {
        id: "dai_la", order: 2, name: "Phòng tuyến Đại La",
        mapName: "Thành Đại La",
        description: "Tiền thân của Thăng Long, tuyến phòng thủ then chốt.",
        background: "dai_la",
        difficulty: 2,
        unlockCondition: { type: "stage_cleared", stageId: "hoa_lu" },
        rewardGold: 100, rewardExp: 55,
        enabled: true,
        path: [
          { x: -40, y: 460 }, { x: 150, y: 460 }, { x: 150, y: 200 },
          { x: 340, y: 200 }, { x: 340, y: 420 }, { x: 560, y: 420 },
          { x: 560, y: 140 }, { x: 780, y: 140 }, { x: 780, y: 320 }, { x: 900, y: 320 },
        ],
        castle: { x: 930, y: 320 },
        buildSpots: [
          { x: 80, y: 340 }, { x: 240, y: 200 }, { x: 240, y: 420 },
          { x: 420, y: 300 }, { x: 450, y: 140 }, { x: 650, y: 420 },
          { x: 670, y: 140 }, { x: 860, y: 220 }, { x: 820, y: 400 },
        ],
        waves: [
          { groups: [{ type: "quan_su_quan", count: 10, interval: 0.7 }] },
          { groups: [{ type: "ky_binh", count: 8, interval: 0.55 }, { type: "cung_thu_dich", count: 4, interval: 0.8 }] },
          { groups: [{ type: "truong_giap", count: 8, interval: 0.7 }, { type: "cung_thu_dich", count: 5, interval: 0.6 }] },
          { groups: [{ type: "ky_binh", count: 10, interval: 0.45 }, { type: "truong_giap", count: 6, interval: 0.75 }] },
          { groups: [{ type: "tuong_giac", count: 2, interval: 1.2 }, { type: "truong_giap", count: 6, interval: 0.6 }] },
          { groups: [{ type: "truong_giap", count: 8, interval: 0.5 }, { type: "cung_thu_dich", count: 6, interval: 0.5 }, { boss: "boss_dai_la" }] },
        ],
      },
      {
        id: "bach_dang", order: 3, name: "Chiến trường Bạch Đằng",
        mapName: "Sông Bạch Đằng",
        description: "Trận thuỷ chiến quyết định, năm 938 tái hiện trong ký ức dân tộc.",
        background: "bach_dang",
        difficulty: 3,
        unlockCondition: { type: "stage_cleared", stageId: "dai_la" },
        rewardGold: 160, rewardExp: 90,
        enabled: true,
        path: [
          { x: -40, y: 270 }, { x: 220, y: 270 }, { x: 220, y: 100 },
          { x: 480, y: 100 }, { x: 480, y: 440 }, { x: 700, y: 440 },
          { x: 700, y: 230 }, { x: 900, y: 230 },
        ],
        castle: { x: 930, y: 230 },
        buildSpots: [
          { x: 100, y: 190 }, { x: 320, y: 100 }, { x: 350, y: 270 },
          { x: 480, y: 260 }, { x: 600, y: 440 }, { x: 620, y: 230 },
          { x: 780, y: 150 }, { x: 800, y: 320 },
        ],
        waves: [
          { groups: [{ type: "ky_binh", count: 12, interval: 0.5 }] },
          { groups: [{ type: "cung_thu_dich", count: 10, interval: 0.5 }, { type: "truong_giap", count: 6, interval: 0.7 }] },
          { groups: [{ type: "tuong_giac", count: 3, interval: 1.0 }, { type: "ky_binh", count: 10, interval: 0.4 }] },
          { groups: [{ type: "truong_giap", count: 12, interval: 0.5 }, { type: "cung_thu_dich", count: 8, interval: 0.45 }] },
          { groups: [{ type: "tuong_giac", count: 4, interval: 0.8 }, { type: "truong_giap", count: 10, interval: 0.4 }] },
          { groups: [{ type: "truong_giap", count: 10, interval: 0.4 }, { type: "ky_binh", count: 10, interval: 0.35 }, { boss: "boss_bach_dang" }] },
        ],
      },
    ];
  }

  function defaultHeroes() {
    return [
      {
        id: "dinh_bo_linh", name: "Đinh Bộ Lĩnh", nameVi: "Đinh Bộ Lĩnh",
        description: "Người dẹp loạn 12 sứ quân, lập nên nhà nước Đại Cồ Việt.",
        icon: "👑", image: "",
        hp: 40,           // cộng thẳng vào maxHP của thành khi được chọn
        damage: 12,        // % cộng thêm sát thương cho MỌI tháp (12 = +12%)
        defense: 1,        // giảm sát thương thành nhận mỗi khi địch lọt qua (trừ thẳng, tối thiểu 0)
        level: 1, maxLevel: 5,
        expToUpgrade: 100,
        unlockCost: 0,     // mở khoá miễn phí, dùng làm tướng khởi đầu
        upgradeCost: 80,
        skillId: "trong_tran",
        enabled: true,
      },
      {
        id: "le_hoan", name: "Lê Hoàn", nameVi: "Lê Hoàn",
        description: "Thập đạo tướng quân, đánh tan quân Tống trên sông Bạch Đằng.",
        icon: "⚔️", image: "",
        hp: 25,
        damage: 20,
        defense: 0,
        level: 1, maxLevel: 5,
        expToUpgrade: 120,
        unlockCost: 250,
        upgradeCost: 100,
        skillId: "mua_ten",
        enabled: true,
      },
    ];
  }

  function defaultSkills() {
    return [
      {
        id: "hoa_cong", name: "Hoả Công",
        description: "Thiêu đốt toàn bộ quân địch đang trên bản đồ.",
        icon: "🔥", cooldown: 28, manaCost: 0,
        effect: "damage_all", damage: 45, heal: 0, area: 0, duration: 0,
        enabled: true,
      },
      {
        id: "mua_ten", name: "Mưa Tên",
        description: "Một trận mưa tên gây sát thương diện rộng lên quân địch.",
        icon: "🏹", cooldown: 20, manaCost: 0,
        effect: "damage_all", damage: 25, heal: 0, area: 0, duration: 0,
        enabled: true,
      },
      {
        id: "trong_tran", name: "Trống Trận",
        description: "Thúc trống tăng 40% tốc độ bắn cho mọi quân thủ thành trong 8 giây.",
        icon: "🥁", cooldown: 35, manaCost: 0,
        effect: "buff_attack_speed", damage: 0, heal: 0, area: 0, duration: 8, value: 0.4,
        enabled: true,
      },
      {
        id: "hoi_phuc_thanh", name: "Hồi Phục Thành",
        description: "Ngay lập tức hồi phục một phần HP của thành.",
        icon: "💗", cooldown: 40, manaCost: 0,
        effect: "heal_castle", damage: 0, heal: 6, area: 0, duration: 0,
        enabled: true,
      },
    ];
  }

  function defaultQuests() {
    return [
      {
        id: "q_wave1", name: "Trấn ải đầu tiên",
        description: "Hoàn thành đợt 1 của bất kỳ màn nào.",
        condition: { type: "WAVE_CLEARED", waveNumber: 1 },
        reward: { gold: 20, exp: 10 },
        enabled: true,
      },
      {
        id: "q_stage_hoa_lu", name: "Giữ vững Hoa Lư",
        description: "Hoàn thành màn Hoa Lư.",
        condition: { type: "STAGE_CLEARED", stageId: "hoa_lu" },
        reward: { gold: 50, exp: 30 },
        enabled: true,
      },
      {
        id: "q_kill100", name: "Sát thù trăm trận",
        description: "Tiêu diệt tổng cộng 100 quân địch.",
        condition: { type: "KILL_COUNT", count: 100 },
        reward: { gold: 60, exp: 25 },
        enabled: true,
      },
      {
        id: "q_no_damage", name: "Thành trì bất khả xâm phạm",
        description: "Hoàn thành một màn mà thành không mất quá 20% HP.",
        condition: { type: "CASTLE_HP_ABOVE_PERCENT", percent: 80 },
        reward: { gold: 70, exp: 35 },
        enabled: true,
      },
      {
        id: "q_boss_kill", name: "Diệt trừ hoạ lớn",
        description: "Tiêu diệt một Boss bất kỳ.",
        condition: { type: "BOSS_KILLED" },
        reward: { gold: 100, exp: 60 },
        enabled: true,
      },
    ];
  }

  function defaultItems() {
    return [
      {
        id: "tui_vang_nho", name: "Túi vàng nhỏ",
        description: "Phần thưởng cộng thêm vàng ngay lập tức.",
        type: "gold_boost", value: 30, icon: "💰", enabled: true,
      },
      {
        id: "lenh_bai_kinh_nghiem", name: "Lệnh bài kinh nghiệm",
        description: "Cộng thêm điểm kinh nghiệm cho người chơi.",
        type: "exp_boost", value: 20, icon: "📜", enabled: true,
      },
    ];
  }

  function defaultRewards() {
    return [
      { id: "r_stage_clear", name: "Thưởng qua màn", type: "stage_clear", gold: 0, exp: 0, note: "Lấy trực tiếp từ rewardGold/rewardExp của từng màn.", enabled: true },
      { id: "r_wave_clear", name: "Thưởng qua đợt", type: "wave_clear", gold: 5, exp: 2, note: "Cộng nhỏ mỗi đợt để khuyến khích chơi tiếp.", enabled: true },
    ];
  }

  function defaultPlayers() {
    return [
      {
        id: "local_player",
        name: "Người chơi",
        level: 1,
        exp: 0,
        gold: 100,           // ví vàng bền vững (persistent), khác vàng trong trận
        unlockedStages: ["hoa_lu"],
        bestWave: {},
        heroesOwned: ["dinh_bo_linh"],
        heroLevels: { dinh_bo_linh: 1 },
        selectedHero: "dinh_bo_linh",
        questProgress: {},   // { questId: { done:false, claimed:false, progressValue:0 } }
        stats: { totalKills: 0, totalRuns: 0, wins: 0, losses: 0 },
        settings: { sound: true, tutorialSeen: false },
        banned: false,
        createdAt: Date.now(),
      },
    ];
  }

  /* Salt/hash mặc định của tài khoản admin@Admin@123456 được tạo LÚC
     CHẠY LẦN ĐẦU (xem seedAdminUserAsync) vì cần Web Crypto API bất
     đồng bộ. Trước khi async đó chạy xong, ta seed tạm một placeholder
     rồi ghi đè lại. */
  function defaultAdminUsers() {
    return [];
  }

  function defaultAll() {
    return {
      gameConfig: defaultGameConfig(),
      players: defaultPlayers(),
      heroes: defaultHeroes(),
      buildings: defaultBuildings(),
      enemies: defaultEnemies(),
      bosses: defaultBosses(),
      stages: defaultStages(),
      skills: defaultSkills(),
      quests: defaultQuests(),
      items: defaultItems(),
      rewards: defaultRewards(),
      adminUsers: defaultAdminUsers(),
      adminLogs: [],
    };
  }

  /* ---------------------------------------------------------
     KHỞI TẠO / DI TRÚ
     --------------------------------------------------------- */
  function migrateLegacyIfNeeded() {
    // Phiên bản 1 lưu 2 key: dcv_progress_v1 và dcv_savegame_v1
    // (KHÔNG thuộc namespace "dcv:" của StorageService — đọc thẳng).
    if (StorageService.has("collection:players")) return; // đã có dữ liệu mới, bỏ qua

    const legacyProgress = StorageService.getLegacyRaw("dcv_progress_v1");
    if (!legacyProgress) return;

    const players = defaultPlayers();
    const p = players[0];
    p.unlockedStages = legacyProgress.unlockedLevels || ["hoa_lu"];
    p.bestWave = legacyProgress.bestWave || {};
    p.settings.sound = legacyProgress.settings ? !!legacyProgress.settings.sound : true;
    StorageService.set(KEYS.players, players);
    console.info("[DataService] Đã di trú tiến trình từ phiên bản 1 (localStorage cũ).");
  }

  function ensureSeeded() {
    const defaults = defaultAll();
    Object.keys(KEYS).forEach((name) => {
      if (name === "schemaVersion") return;
      const key = KEYS[name];
      if (!StorageService.has(key)) {
        StorageService.set(key, defaults[name]);
      }
    });
    migrateLegacyIfNeeded();
    if (!StorageService.has(KEYS.schemaVersion)) {
      StorageService.set(KEYS.schemaVersion, SCHEMA_VERSION);
    }
  }

  async function ensureDefaultAdmin() {
    const users = list("adminUsers");
    if (users.length > 0) return;
    const { salt, hash } = await CryptoUtil.hashPassword("Admin@123456");
    const admin = {
      id: "admin",
      username: "admin",
      role: "SUPER_ADMIN",
      salt,
      passwordHash: hash,
      mustChangePassword: true,
      createdAt: Date.now(),
      lastLoginAt: null,
    };
    StorageService.set(KEYS.adminUsers, [admin]);
  }

  function init() {
    ensureSeeded();
    return ensureDefaultAdmin();
  }

  /* ---------------------------------------------------------
     CRUD CHUNG CHO COLLECTION DẠNG MẢNG
     --------------------------------------------------------- */
  const ARRAY_COLLECTIONS = [
    "players", "heroes", "buildings", "enemies", "bosses",
    "stages", "skills", "quests", "items", "rewards",
    "adminUsers", "adminLogs",
  ];

  function keyOf(collection) {
    const k = KEYS[collection];
    if (!k) throw new Error(`[DataService] Không rõ collection "${collection}"`);
    return k;
  }

  function list(collection) {
    return StorageService.get(keyOf(collection), []) || [];
  }

  function get(collection, id) {
    return list(collection).find((item) => item.id === id) || null;
  }

  function create(collection, item) {
    if (!ARRAY_COLLECTIONS.includes(collection)) throw new Error("Collection không hỗ trợ create()");
    const items = list(collection);
    if (!item.id) throw new Error("Thiếu id");
    if (items.some((i) => i.id === item.id)) throw new Error(`ID "${item.id}" đã tồn tại`);
    items.push(item);
    StorageService.set(keyOf(collection), items);
    return item;
  }

  function update(collection, id, patch) {
    const items = list(collection);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const before = Object.assign({}, items[idx]);
    items[idx] = Object.assign({}, items[idx], patch);
    StorageService.set(keyOf(collection), items);
    return { before, after: items[idx] };
  }

  function remove(collection, id) {
    const items = list(collection);
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return false;
    const [removed] = items.splice(idx, 1);
    StorageService.set(keyOf(collection), items);
    return removed;
  }

  function replaceAll(collection, items) {
    StorageService.set(keyOf(collection), items || []);
  }

  function appendLog(entry) {
    const logs = list("adminLogs");
    logs.unshift(entry); // mới nhất lên đầu
    if (logs.length > 500) logs.length = 500; // giới hạn để tránh phình localStorage
    StorageService.set(keyOf("adminLogs"), logs);
  }

  /* ---------------------------------------------------------
     CẤU HÌNH (singleton, không phải mảng)
     --------------------------------------------------------- */
  function getConfig() {
    return StorageService.get(KEYS.gameConfig, defaultGameConfig());
  }

  function setConfig(patch) {
    const cur = getConfig();
    const next = Object.assign({}, cur, patch, {
      features: Object.assign({}, cur.features, patch && patch.features),
    });
    StorageService.set(KEYS.gameConfig, next);
    return next;
  }

  /* ---------------------------------------------------------
     RESET / BACKUP
     --------------------------------------------------------- */
  function resetCollectionToDefault(collection) {
    const defaults = defaultAll();
    if (collection === "gameConfig") {
      StorageService.set(KEYS.gameConfig, defaults.gameConfig);
      return;
    }
    StorageService.set(keyOf(collection), defaults[collection]);
  }

  async function resetAllToDefault({ keepAdminUsers = true } = {}) {
    const keepUsers = keepAdminUsers ? list("adminUsers") : null;
    const defaults = defaultAll();
    Object.keys(KEYS).forEach((name) => {
      if (name === "schemaVersion") return;
      StorageService.set(KEYS[name], defaults[name]);
    });
    if (keepUsers && keepUsers.length) {
      StorageService.set(KEYS.adminUsers, keepUsers);
    } else {
      await ensureDefaultAdmin();
    }
    StorageService.set(KEYS.schemaVersion, SCHEMA_VERSION);
  }

  function exportSnapshot() {
    const out = { schemaVersion: SCHEMA_VERSION, exportedAt: Date.now(), data: {} };
    Object.keys(KEYS).forEach((name) => {
      if (name === "schemaVersion") return;
      out.data[name] = StorageService.get(KEYS[name], null);
    });
    return out;
  }

  function importSnapshot(snapshot) {
    if (!snapshot || !snapshot.data) throw new Error("File không hợp lệ: thiếu trường 'data'");
    Object.keys(KEYS).forEach((name) => {
      if (name === "schemaVersion") return;
      if (snapshot.data[name] !== undefined) {
        StorageService.set(KEYS[name], snapshot.data[name]);
      }
    });
    StorageService.set(KEYS.schemaVersion, SCHEMA_VERSION);
  }

  /* ---------------------------------------------------------
     GHÉP DỮ LIỆU THÀNH GAME_DATA (dùng bởi js/data.js)
     Giữ đúng hình dạng (shape) mà entities.js/game.js/ui.js phiên
     bản 1 đã quen dùng: object được KEY bằng id, không phải mảng.
     --------------------------------------------------------- */
  function toKeyedObject(items) {
    const out = {};
    for (const item of items) out[item.id] = item;
    return out;
  }

  function buildGameData() {
    const config = getConfig();
    const stages = list("stages");
    const bosses = toKeyedObject(list("bosses"));

    const levels = {};
    for (const stage of stages) {
      levels[stage.id] = {
        id: stage.id,
        name: stage.name,
        mapName: stage.mapName,
        description: stage.description,
        order: stage.order,
        difficulty: stage.difficulty,
        unlockCondition: stage.unlockCondition,
        rewardGold: stage.rewardGold,
        rewardExp: stage.rewardExp,
        enabled: stage.enabled !== false,
        path: stage.path,
        castle: stage.castle,
        buildSpots: stage.buildSpots,
        waves: stage.waves,
      };
    }

    // Trộn boss vào enemyTypes dưới dạng loại "địch" đặc biệt để Enemy
    // class (entities.js) dùng lại được nguyên vẹn không cần sửa.
    const enemyTypes = toKeyedObject(list("enemies").filter((e) => e.enabled !== false));
    for (const bossId in bosses) {
      const b = bosses[bossId];
      if (b.enabled === false) continue; // Boss bị tắt sẽ không được đưa vào wave khi spawn
      enemyTypes[bossId] = {
        id: bossId,
        name: b.name,
        hp: Math.round(b.hp * (config.BOSS_MULTIPLIER || 1)),
        speed: b.speed,
        reward: b.reward, // hệ số REWARD_MULTIPLIER áp dụng 1 lần lúc cộng vàng trong game.js, tránh nhân đôi
        rewardExp: b.rewardExp,
        damage: Math.round(b.damage * (config.BOSS_MULTIPLIER || 1)),
        defense: b.defense || 0,
        resistance: b.resistance || 0,
        color: b.color, radius: 22, icon: b.icon,
        boss: true, bossSkill: b.skill,
        enabled: b.enabled !== false,
      };
    }

    return {
      config: {
        canvasWidth: config.canvasWidth,
        canvasHeight: config.canvasHeight,
        startingGold: config.START_GOLD,
        startingHP: config.START_HP,
        speeds: config.speeds,
        startStage: config.START_STAGE,
        enemySpawnRate: config.ENEMY_SPAWN_RATE,
        rewardMultiplier: config.REWARD_MULTIPLIER,
        features: config.features,
      },
      enemyTypes,
      towerTypes: toKeyedObject(list("buildings").filter((b) => b.enabled !== false)),
      generals: toKeyedObject(list("heroes")),
      skills: toKeyedObject(list("skills")),
      bosses,
      quests: toKeyedObject(list("quests")),
      items: toKeyedObject(list("items")),
      rewards: toKeyedObject(list("rewards")),
      levels,
    };
  }

  return {
    KEYS,
    init,
    list, get, create, update, remove, replaceAll,
    appendLog,
    getConfig, setConfig,
    resetCollectionToDefault, resetAllToDefault,
    exportSnapshot, importSnapshot,
    buildGameData,
    defaultAll,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = DataService;
