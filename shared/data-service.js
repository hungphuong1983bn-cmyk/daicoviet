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

  const SCHEMA_VERSION = 6;

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
        description: "Bắn xa, sát thương vừa phải, tốc bắn nhanh.",
        icon: "🏹", color: "#c9a24a",
        cost: 50, damage: 12, range: 130, fireRate: 1.1,
        projectileSpeed: 420, splashRadius: 0,
        criticalChance: 10, criticalMultiplier: 1.8, armorPenetration: 0,
        effectType: "none", effectValue: 0, effectDuration: 0,
        maxLevel: 5, upgradeCost: 40, upgradeDamageMult: 0.32, upgradeRangeMult: 0.07,
        enabled: true,
      },
      {
        id: "no_than", name: "Nỏ thần", nameVi: "Nỏ thần",
        description: "Sát thương lớn, xuyên một phần giáp, bắn chậm.",
        icon: "🎯", color: "#2f5d50",
        cost: 100, damage: 30, range: 160, fireRate: 0.7,
        projectileSpeed: 520, splashRadius: 0,
        criticalChance: 18, criticalMultiplier: 2.2, armorPenetration: 35,
        effectType: "none", effectValue: 0, effectDuration: 0,
        maxLevel: 5, upgradeCost: 75, upgradeDamageMult: 0.36, upgradeRangeMult: 0.07,
        enabled: true,
      },
      {
        id: "voi_chien", name: "Voi chiến", nameVi: "Voi chiến",
        description: "Sát thương lan toả diện rộng, đắt nhưng dọn đám đông tốt.",
        icon: "🐘", color: "#7a1f2b",
        cost: 130, damage: 16, range: 100, fireRate: 0.8,
        projectileSpeed: 300, splashRadius: 45,
        criticalChance: 6, criticalMultiplier: 1.5, armorPenetration: 0,
        effectType: "none", effectValue: 0, effectDuration: 0,
        maxLevel: 5, upgradeCost: 95, upgradeDamageMult: 0.28, upgradeRangeMult: 0.05,
        enabled: true,
      },
      {
        id: "coc_nhon", name: "Bẫy cọc nhọn", nameVi: "Bẫy cọc nhọn",
        description: "Cọc gỗ vót nhọn theo kế Ngô Quyền, gây sát thương nhẹ và làm chậm quân địch trúng phải.",
        icon: "🪵", color: "#6b4a2f",
        cost: 70, damage: 8, range: 95, fireRate: 1.4,
        projectileSpeed: 520, splashRadius: 0,
        criticalChance: 4, criticalMultiplier: 1.5, armorPenetration: 0,
        effectType: "slow", effectValue: 0.35, effectDuration: 2.5,
        slowFactor: 0.35, slowDuration: 2.5, // giữ lại field cũ để tương thích ngược, engine đọc effectType
        maxLevel: 5, upgradeCost: 55, upgradeDamageMult: 0.25, upgradeRangeMult: 0.05,
        enabled: true,
      },
      {
        id: "may_ban_da", name: "Máy bắn đá", nameVi: "Máy bắn đá",
        description: "Bắn đá tảng gây sát thương cực lớn trên diện rộng, tốc bắn chậm nhưng khắc chế Boss.",
        icon: "🪨", color: "#5a4a3a",
        cost: 220, damage: 55, range: 190, fireRate: 0.4,
        projectileSpeed: 260, splashRadius: 70,
        criticalChance: 12, criticalMultiplier: 2.5, armorPenetration: 25,
        effectType: "none", effectValue: 0, effectDuration: 0,
        maxLevel: 5, upgradeCost: 150, upgradeDamageMult: 0.32, upgradeRangeMult: 0.06,
        enabled: true,
      },
      {
        id: "riu_chien", name: "Rìu chiến", nameVi: "Rìu chiến",
        description: "Cận chiến, sát thương đơn mục tiêu rất cao và tỉ lệ chí mạng lớn, nhưng tầm đánh ngắn.",
        icon: "🪓", color: "#8a5a2f",
        cost: 90, damage: 45, range: 75, fireRate: 0.9,
        projectileSpeed: 900, splashRadius: 0,
        criticalChance: 22, criticalMultiplier: 2.0, armorPenetration: 10,
        effectType: "none", effectValue: 0, effectDuration: 0,
        maxLevel: 5, upgradeCost: 70, upgradeDamageMult: 0.34, upgradeRangeMult: 0.04,
        enabled: true,
      },
      {
        id: "hoa_tien", name: "Hoả tiễn", nameVi: "Hoả tiễn",
        description: "Tên lửa lửa gây sát thương diện rộng và đốt cháy quân địch theo thời gian.",
        icon: "🚀", color: "#c9542a",
        cost: 150, damage: 18, range: 150, fireRate: 0.9,
        projectileSpeed: 380, splashRadius: 40,
        criticalChance: 8, criticalMultiplier: 1.6, armorPenetration: 0,
        effectType: "burn", effectValue: 6, effectDuration: 4,
        maxLevel: 5, upgradeCost: 110, upgradeDamageMult: 0.3, upgradeRangeMult: 0.06,
        enabled: true,
      },
      {
        id: "khien_binh", name: "Khiên binh", nameVi: "Khiên binh",
        description: "Sát thương thấp nhưng làm chậm mạnh, dùng để khống chế đội hình địch.",
        icon: "🛡️", color: "#4a6a7a",
        cost: 60, damage: 5, range: 80, fireRate: 1.6,
        projectileSpeed: 520, splashRadius: 0,
        criticalChance: 0, criticalMultiplier: 1, armorPenetration: 0,
        effectType: "slow", effectValue: 0.55, effectDuration: 3,
        maxLevel: 5, upgradeCost: 45, upgradeDamageMult: 0.2, upgradeRangeMult: 0.04,
        enabled: true,
      },
      {
        id: "thap_hoa_cong", name: "Hoả công", nameVi: "Hoả công",
        description: "Kế hoả công diện rộng, sát thương ban đầu thấp nhưng đốt cháy dai dẳng cả nhóm địch.",
        icon: "♨️", color: "#a8391f",
        cost: 180, damage: 10, range: 120, fireRate: 1.0,
        projectileSpeed: 340, splashRadius: 55,
        criticalChance: 5, criticalMultiplier: 1.5, armorPenetration: 0,
        effectType: "burn", effectValue: 8, effectDuration: 5,
        maxLevel: 5, upgradeCost: 130, upgradeDamageMult: 0.28, upgradeRangeMult: 0.05,
        enabled: true,
      },
    ];
  }

  function defaultEnemies() {
    return [
      {
        id: "quan_su_quan", name: "Quân sứ quân",
        hp: 40, speed: 55, reward: 8, rewardExp: 4, damage: 1,
        defense: 0, resistance: 0,
        color: "#8a4a3a", radius: 12, icon: "🛡", enabled: true,
      },
      {
        id: "ky_binh", name: "Kỵ binh",
        hp: 28, speed: 95, reward: 10, rewardExp: 5, damage: 1,
        defense: 0, resistance: 0,
        color: "#5a5a8a", radius: 11, icon: "🐎", enabled: true,
      },
      {
        id: "truong_giap", name: "Trường giáp binh",
        hp: 90, speed: 40, reward: 16, rewardExp: 8, damage: 2,
        defense: 2, resistance: 0,
        color: "#4a4a4a", radius: 14, icon: "⚔", enabled: true,
      },
      {
        id: "cung_thu_dich", name: "Cung thủ địch",
        hp: 34, speed: 48, reward: 12, rewardExp: 6, damage: 1,
        defense: 0, resistance: 10,
        color: "#6a5a2f", radius: 12, icon: "🏹", enabled: true,
      },
      {
        id: "tuong_giac", name: "Tướng giặc",
        hp: 260, speed: 38, reward: 60, rewardExp: 30, damage: 4,
        defense: 4, resistance: 0,
        color: "#7a1f2b", radius: 18, icon: "👑", enabled: true,
      },
      {
        id: "thiet_ky", name: "Thiết kỵ",
        hp: 140, speed: 58, reward: 22, rewardExp: 11, damage: 3,
        defense: 5, resistance: 0,
        color: "#39395c", radius: 15, icon: "🏇", enabled: true,
      },
      {
        id: "cung_no_tong", name: "Cung nỏ Tống",
        hp: 60, speed: 46, reward: 18, rewardExp: 9, damage: 2,
        defense: 0, resistance: 25,
        color: "#5a4a2f", radius: 12, icon: "🎯", enabled: true,
      },
    ];
  }

  /* 3 phase chuẩn theo % HP còn lại, dùng chung cho mọi Boss (mục XV).
     speedMult/damageMult là hệ số NỀN theo phase, sẽ nhân thêm với buff
     tự thân từ ability (mục XVI) để ra hệ số cuối cùng. */
  function defaultBossPhases() {
    return [
      { id: "p1", name: "Bình thường", hpFromPct: 100, hpToPct: 60, speedMult: 1, damageMult: 1, enrage: false },
      { id: "p2", name: "Mạnh hơn", hpFromPct: 60, hpToPct: 30, speedMult: 1.12, damageMult: 1.2, enrage: false },
      { id: "p3", name: "Cuồng nộ", hpFromPct: 30, hpToPct: 0, speedMult: 1.25, damageMult: 1.35, enrage: true },
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
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "cuong_no", name: "Cuồng Nộ",
            trigger: { type: "hp_below", percent: 30 }, once: true,
            effect: "self_buff", speedBonus: 0.3, damageBonus: 0,
          },
        ],
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
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "trieu_hoi", name: "Triệu Hồi",
            trigger: { type: "hp_below", percent: 50 }, cooldown: 22,
            effect: "summon", summonType: "ky_binh", summonCount: 3,
          },
        ],
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
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "hoi_sinh_luc", name: "Hồi Sinh Lực",
            trigger: { type: "interval", seconds: 5 }, cooldown: 5,
            effect: "heal_self", healPercent: 5,
          },
        ],
      },
      {
        id: "boss_hau_nhan_bao", name: "Hầu Nhân Bảo",
        hp: 3400, damage: 12, defense: 12, resistance: 20,
        speed: 34, reward: 650, rewardExp: 320,
        skill: "Xung phong ải hẹp (+25% sát thương khi HP trên 70%)",
        skillCooldown: 0,
        icon: "⚔️", color: "#4a2f2f",
        description: "Chủ tướng quân Tống, tử trận tại ải Chi Lăng năm 981.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "xung_phong", name: "Xung Phong Ải Hẹp",
            trigger: { type: "hp_above", percent: 70 }, continuous: true,
            effect: "self_buff", speedBonus: 0, damageBonus: 0.25,
          },
        ],
      },
      {
        id: "boss_quach_quan_bien", name: "Quách Quân Biện",
        hp: 4300, damage: 14, defense: 14, resistance: 22,
        speed: 33, reward: 800, rewardExp: 380,
        skill: "Triệu hồi thêm 4 cung nỏ khi máu dưới 40%",
        skillCooldown: 0,
        icon: "🏹", color: "#2f3a4a",
        description: "Phó tướng quân Tống, bị bắt sống ở phòng tuyến Bình Lỗ năm 981.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "trieu_hoi_cung_no", name: "Triệu Hồi Cung Nỏ",
            trigger: { type: "hp_below", percent: 40 }, cooldown: 22,
            effect: "summon", summonType: "cung_no_tong", summonCount: 4,
          },
        ],
      },
      {
        id: "boss_giac_phuong_bac", name: "Đại Tướng Xâm Lăng",
        hp: 5600, damage: 16, defense: 16, resistance: 25,
        speed: 32, reward: 1000, rewardExp: 500,
        skill: "Cuồng nộ toàn phần (+40% sát thương khi máu dưới 25%)",
        skillCooldown: 0,
        icon: "👹", color: "#2a1f3a",
        description: "Chỉ huy tối cao của đội quân xâm lược cuối cùng, trấn giữ cửa ngõ kinh thành Thăng Long.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "cuong_no_toan_phan", name: "Cuồng Nộ Toàn Phần",
            trigger: { type: "hp_below", percent: 25 }, once: true,
            effect: "self_buff", speedBonus: 0.1, damageBonus: 0.4,
          },
        ],
      },
    ];
  }

  function defaultStages() {
    const stages = [
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
          { waveType: "boss", warning: "⚠ CẢNH BÁO: SỨ QUÂN HOẢ LONG XUẤT HIỆN!",
            groups: [{ type: "truong_giap", count: 5, interval: 0.8 }, { type: "ky_binh", count: 6, interval: 0.5 }, { boss: "boss_hoa_lu" }] },
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
          { waveType: "elite", warning: "⚠ ĐỢT TINH NHUỆ! Tướng giặc dẫn đầu được tăng cường.",
            groups: [{ type: "tuong_giac", count: 2, interval: 1.2, eliteCount: 2 }, { type: "truong_giap", count: 6, interval: 0.6 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO: ĐÔ HỘ SỨ CAO CHÍNH BÌNH XUẤT HIỆN!",
            groups: [{ type: "truong_giap", count: 8, interval: 0.5 }, { type: "cung_thu_dich", count: 6, interval: 0.5 }, { boss: "boss_dai_la" }] },
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
        specialMechanic: "tide",
        buildSpots: [
          { x: 100, y: 190 }, { x: 320, y: 100 }, { x: 350, y: 270 },
          { x: 480, y: 260 }, { x: 600, y: 440 }, { x: 620, y: 230 },
          { x: 780, y: 150 }, { x: 800, y: 320 },
        ],
        waves: [
          { groups: [{ type: "ky_binh", count: 12, interval: 0.5 }] },
          { groups: [{ type: "cung_thu_dich", count: 10, interval: 0.5 }, { type: "truong_giap", count: 6, interval: 0.7 }] },
          { waveType: "fast", warning: "⚠ ĐỢT NHANH! Nước rút, quân địch di chuyển thần tốc.",
            groups: [{ type: "tuong_giac", count: 3, interval: 1.0 }, { type: "ky_binh", count: 10, interval: 0.4, speedMultiplier: 1.35 }] },
          { groups: [{ type: "truong_giap", count: 12, interval: 0.5 }, { type: "cung_thu_dich", count: 8, interval: 0.45 }] },
          { groups: [{ type: "tuong_giac", count: 4, interval: 0.8 }, { type: "truong_giap", count: 10, interval: 0.4 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO: THUỶ TẶC CHÚA XUẤT HIỆN!",
            groups: [{ type: "truong_giap", count: 10, interval: 0.4 }, { type: "ky_binh", count: 10, interval: 0.35 }, { boss: "boss_bach_dang" }] },
        ],
      },
      {
        id: "chi_lang", order: 4, name: "Ải Chi Lăng",
        mapName: "Ải Chi Lăng",
        description: "Cửa ải hiểm trở, nơi quân Tống bị chặn đứng năm 981.",
        background: "chi_lang",
        difficulty: 4,
        unlockCondition: { type: "stage_cleared", stageId: "bach_dang" },
        rewardGold: 220, rewardExp: 120,
        enabled: true,
        path: [
          { x: -40, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 400 },
          { x: 420, y: 400 }, { x: 420, y: 80 }, { x: 640, y: 80 },
          { x: 640, y: 320 }, { x: 860, y: 320 },
        ],
        castle: { x: 900, y: 320 },
        specialMechanic: "ambush",
        buildSpots: [
          { x: 90, y: 230 }, { x: 300, y: 150 }, { x: 300, y: 400 },
          { x: 420, y: 240 }, { x: 530, y: 80 }, { x: 530, y: 320 },
          { x: 640, y: 200 }, { x: 760, y: 400 },
        ],
        waves: [
          { groups: [{ type: "quan_su_quan", count: 10, interval: 0.6 }] },
          { warning: "⚠ PHỤC KÍCH! Cẩn thận quân địch từ phía sau.",
            groups: [{ type: "ky_binh", count: 8, interval: 0.5 }, { type: "cung_thu_dich", count: 5, interval: 0.6, delay: 3.5 }] },
          { groups: [{ type: "truong_giap", count: 10, interval: 0.6 }, { type: "thiet_ky", count: 4, interval: 0.9 }] },
          { groups: [{ type: "cung_no_tong", count: 8, interval: 0.6 }, { type: "ky_binh", count: 10, interval: 0.4 }] },
          { warning: "⚠ PHỤC KÍCH! Tướng giặc bất ngờ xuất hiện giữa trận.",
            groups: [{ type: "thiet_ky", count: 6, interval: 0.7 }, { type: "tuong_giac", count: 4, interval: 0.9, delay: 6 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO: HẦU NHÂN BẢO XUẤT HIỆN!",
            groups: [{ type: "truong_giap", count: 10, interval: 0.4 }, { type: "thiet_ky", count: 8, interval: 0.6 }, { boss: "boss_hau_nhan_bao" }] },
        ],
      },
      {
        id: "binh_lo", order: 5, name: "Sông Bình Lỗ",
        mapName: "Phòng tuyến Bình Lỗ",
        description: "Tuyến sông hiểm yếu, nơi quân Tống bị đánh tan và bắt sống tướng giặc.",
        background: "binh_lo",
        difficulty: 5,
        unlockCondition: { type: "stage_cleared", stageId: "chi_lang" },
        rewardGold: 280, rewardExp: 150,
        enabled: true,
        path: [
          { x: -40, y: 400 }, { x: 180, y: 400 }, { x: 180, y: 150 },
          { x: 380, y: 150 }, { x: 380, y: 460 }, { x: 600, y: 460 },
          { x: 600, y: 200 }, { x: 820, y: 200 }, { x: 820, y: 340 }, { x: 900, y: 340 },
        ],
        castle: { x: 930, y: 340 },
        buildSpots: [
          { x: 90, y: 280 }, { x: 280, y: 150 }, { x: 280, y: 460 },
          { x: 380, y: 300 }, { x: 490, y: 460 }, { x: 490, y: 200 },
          { x: 710, y: 200 }, { x: 710, y: 340 }, { x: 860, y: 270 },
        ],
        waves: [
          { waveType: "swarm", warning: "⚠ ĐỢT QUÂN ĐÔNG! Số lượng áp đảo nhưng máu mỏng.",
            groups: [{ type: "ky_binh", count: 20, interval: 0.3, hpMultiplier: 0.6 }] },
          { groups: [{ type: "cung_no_tong", count: 10, interval: 0.5 }, { type: "truong_giap", count: 6, interval: 0.7 }] },
          { groups: [{ type: "thiet_ky", count: 8, interval: 0.6 }, { type: "cung_thu_dich", count: 8, interval: 0.5 }] },
          { groups: [{ type: "tuong_giac", count: 4, interval: 0.8 }, { type: "cung_no_tong", count: 10, interval: 0.45 }] },
          { groups: [{ type: "thiet_ky", count: 10, interval: 0.5 }, { type: "ky_binh", count: 12, interval: 0.4 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO: QUÁCH QUÂN BIỆN XUẤT HIỆN!",
            groups: [{ type: "truong_giap", count: 12, interval: 0.4 }, { type: "thiet_ky", count: 10, interval: 0.45 }, { boss: "boss_quach_quan_bien" }] },
        ],
      },
      {
        id: "thang_long", order: 6, name: "Kinh đô Thăng Long",
        mapName: "Kinh thành Thăng Long",
        description: "Trận chiến cuối cùng bảo vệ kinh đô mới dời năm 1010.",
        background: "thang_long",
        difficulty: 6,
        unlockCondition: { type: "stage_cleared", stageId: "binh_lo" },
        rewardGold: 360, rewardExp: 200,
        enabled: true,
        path: [
          { x: -40, y: 270 }, { x: 150, y: 270 }, { x: 150, y: 80 },
          { x: 350, y: 80 }, { x: 350, y: 460 }, { x: 550, y: 460 },
          { x: 550, y: 150 }, { x: 750, y: 150 }, { x: 750, y: 380 }, { x: 900, y: 380 },
        ],
        castle: { x: 930, y: 380 },
        buildSpots: [
          { x: 80, y: 170 }, { x: 250, y: 80 }, { x: 250, y: 460 },
          { x: 350, y: 270 }, { x: 450, y: 460 }, { x: 450, y: 150 },
          { x: 650, y: 150 }, { x: 650, y: 380 }, { x: 830, y: 280 },
        ],
        waves: [
          { groups: [{ type: "ky_binh", count: 14, interval: 0.45 }] },
          { groups: [{ type: "cung_no_tong", count: 12, interval: 0.45 }, { type: "thiet_ky", count: 6, interval: 0.6 }] },
          { waveType: "armor", warning: "⚠ ĐỢT THIẾT GIÁP! Quân địch phòng thủ dày hơn hẳn.",
            groups: [{ type: "truong_giap", count: 14, interval: 0.4, armorBonus: 4 }, { type: "tuong_giac", count: 4, interval: 0.8, armorBonus: 4 }] },
          { groups: [{ type: "thiet_ky", count: 12, interval: 0.5 }, { type: "cung_no_tong", count: 12, interval: 0.4 }] },
          { groups: [{ type: "tuong_giac", count: 6, interval: 0.7 }, { type: "thiet_ky", count: 10, interval: 0.45 }] },
          { waveType: "survival", surviveSeconds: 30, warning: "⚠ SỐNG SÓT 30 GIÂY! Quân địch sẽ liên tục kéo đến.",
            groups: [{ type: "truong_giap", count: 4, interval: 0.6 }, { type: "cung_no_tong", count: 4, interval: 0.6 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO TỐI HẬU: ĐẠI TƯỚNG XÂM LĂNG XUẤT HIỆN!",
            groups: [{ type: "thiet_ky", count: 14, interval: 0.4 }, { type: "tuong_giac", count: 6, interval: 0.6 }, { boss: "boss_giac_phuong_bac" }] },
        ],
      },
    ];
    // Priority 5 (Score+Combo+3-Sao): gắn starConditions + targetTime THẬT
    // cho từng màn, tăng dần độ khó theo "order", thay vì để trống rồi
    // chỉ hiển thị UI giả (mục LXI - cấm "giả" tính năng).
    return stages.map((s) => ({
      ...s,
      targetTime: s.targetTime || Math.round(s.waves.length * 24 + (s.order || 1) * 6),
      starConditions: s.starConditions || {
        oneStar: true,
        twoStarCastleHpPercent: 45,
        threeStarCastleHpPercent: 80,
        threeStarScore: 500 + (s.order || 1) * 350,
      },
    }));
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
      {
        id: "ngo_quyen", name: "Ngô Quyền", nameVi: "Ngô Quyền",
        description: "Anh hùng dân tộc, đại thắng quân Nam Hán trên sông Bạch Đằng năm 938.",
        icon: "🌊", image: "",
        hp: 35,
        damage: 15,
        defense: 2,
        level: 1, maxLevel: 5,
        expToUpgrade: 140,
        unlockCost: 300,
        upgradeCost: 110,
        skillId: "coc_go_bach_dang",
        enabled: true,
      },
      {
        id: "duong_van_nga", name: "Dương Vân Nga", nameVi: "Dương Vân Nga",
        description: "Thái hậu nhiếp chính, cầu nối giữa hai triều Đinh – Tiền Lê, an dân giữ nước.",
        icon: "👸", image: "",
        hp: 20,
        damage: 5,
        defense: 3,
        level: 1, maxLevel: 5,
        expToUpgrade: 130,
        unlockCost: 200,
        upgradeCost: 90,
        skillId: "an_dan",
        enabled: true,
      },
      {
        id: "dinh_lien", name: "Đinh Liễn", nameVi: "Đinh Liễn",
        description: "Nam Việt Vương, con trưởng Đinh Bộ Lĩnh, xông pha khắp các trận tiền.",
        icon: "🗡️", image: "",
        hp: 15,
        damage: 25,
        defense: 0,
        level: 1, maxLevel: 5,
        expToUpgrade: 150,
        unlockCost: 220,
        upgradeCost: 95,
        skillId: "xung_phong",
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
      {
        id: "coc_go_bach_dang", name: "Cọc Gỗ Bạch Đằng",
        description: "Tái hiện kế cọc ngầm, gây sát thương lớn lên toàn bộ quân địch đang trên bản đồ.",
        icon: "🌊", cooldown: 30, manaCost: 0,
        effect: "damage_all", damage: 60, heal: 0, area: 0, duration: 0,
        enabled: true,
      },
      {
        id: "an_dan", name: "An Dân",
        description: "Vỗ về lòng quân, hồi phục đáng kể HP của thành.",
        icon: "👸", cooldown: 45, manaCost: 0,
        effect: "heal_castle", damage: 0, heal: 10, area: 0, duration: 0,
        enabled: true,
      },
      {
        id: "xung_phong", name: "Xung Phong",
        description: "Thúc quân xông trận, tăng mạnh tốc độ bắn cho mọi quân thủ thành trong 10 giây.",
        icon: "🗡️", cooldown: 32, manaCost: 0,
        effect: "buff_attack_speed", damage: 0, heal: 0, area: 0, duration: 10, value: 0.5,
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
      {
        id: "q_stage_chi_lang", name: "Phá vòng vây Chi Lăng",
        description: "Hoàn thành màn Ải Chi Lăng.",
        condition: { type: "STAGE_CLEARED", stageId: "chi_lang" },
        reward: { gold: 120, exp: 70 },
        enabled: true,
      },
      {
        id: "q_stage_binh_lo", name: "Trấn giữ Bình Lỗ",
        description: "Hoàn thành màn Sông Bình Lỗ.",
        condition: { type: "STAGE_CLEARED", stageId: "binh_lo" },
        reward: { gold: 160, exp: 90 },
        enabled: true,
      },
      {
        id: "q_stage_thang_long", name: "Vững nền Thăng Long",
        description: "Hoàn thành màn Kinh đô Thăng Long.",
        condition: { type: "STAGE_CLEARED", stageId: "thang_long" },
        reward: { gold: 220, exp: 130 },
        enabled: true,
      },
      {
        id: "q_kill300", name: "Sát thù ba trăm trận",
        description: "Tiêu diệt tổng cộng 300 quân địch.",
        condition: { type: "KILL_COUNT", count: 300 },
        reward: { gold: 130, exp: 60 },
        enabled: true,
      },
      {
        id: "q_kill600", name: "Uy trấn thiên hạ",
        description: "Tiêu diệt tổng cộng 600 quân địch.",
        condition: { type: "KILL_COUNT", count: 600 },
        reward: { gold: 220, exp: 100 },
        enabled: true,
      },
      {
        id: "q_no_damage2", name: "Trường thành vững chãi",
        description: "Hoàn thành một màn mà thành không mất quá 5% HP.",
        condition: { type: "CASTLE_HP_ABOVE_PERCENT", percent: 95 },
        reward: { gold: 150, exp: 80 },
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
        stageStars: {},   // { stageId: 1|2|3 } - Giai đoạn 3, mục V
        bestScore: {},    // { stageId: number } - mục XXV
        bestTime: {},     // { stageId: giây } - mục XXV, chỉ cập nhật khi THẮNG
        heroesOwned: ["dinh_bo_linh"],
        heroLevels: { dinh_bo_linh: 1 },
        heroExp: { dinh_bo_linh: 0 }, // EXP riêng của từng tướng (Giai đoạn 3), TÁCH BIỆT với exp người chơi ở trên
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

  /* Đảm bảo mọi công trình có đủ field Combat Engine (Giai đoạn 3):
     Critical/Armor Penetration/Effect thống nhất, và các tháp mới đã có
     mặt. Chỉ THÊM, không ghi đè field đã tồn tại. Idempotent - gọi lại
     nhiều lần vô hại. Dùng cho cả migrate lúc khởi động lẫn sau import
     một bản backup cũ (v2). */
  function ensureBuildingCombatFields() {
    const buildingDefaults = defaultBuildings();
    const buildings = list("buildings");
    const buildingIds = new Set(buildings.map((b) => b.id));
    const migratedBuildings = buildings.map((b) => {
      const patch = {};
      if (b.criticalChance === undefined) patch.criticalChance = 8;
      if (b.criticalMultiplier === undefined) patch.criticalMultiplier = 1.8;
      if (b.armorPenetration === undefined) patch.armorPenetration = 0;
      if (b.effectType === undefined) {
        if (b.slowFactor) {
          patch.effectType = "slow";
          patch.effectValue = b.slowFactor;
          patch.effectDuration = b.slowDuration || 2;
        } else {
          patch.effectType = "none";
          patch.effectValue = 0;
          patch.effectDuration = 0;
        }
      }
      return Object.keys(patch).length ? Object.assign({}, b, patch) : b;
    });
    for (const def of buildingDefaults) {
      if (!buildingIds.has(def.id)) migratedBuildings.push(def);
    }
    StorageService.set(KEYS.buildings, migratedBuildings);

    const bosses = list("bosses").map((b) => {
      const patch = {};
      if (b.phases === undefined) patch.phases = [];
      if (b.abilities === undefined) patch.abilities = [];
      return Object.keys(patch).length ? Object.assign({}, b, patch) : b;
    });
    StorageService.set(KEYS.bosses, bosses);
  }

  /* Di trú schemaVersion 2 -> 3 (Giai đoạn 3 - Combat Engine).
     LƯU Ý: ghi literal 3 (KHÔNG dùng hằng SCHEMA_VERSION), vì
     SCHEMA_VERSION là phiên bản MỚI NHẤT hiện tại (có thể lớn hơn 3 ở
     các Giai đoạn sau) - nếu ghi nhầm hằng số, các bước di trú kế tiếp
     (v3->v4, v4->v5...) sẽ bị coi là "đã xong" và bị BỎ QUA im lặng. */
  function migrateSchemaV2ToV3() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 3) return;
    ensureBuildingCombatFields();
    StorageService.set(KEYS.schemaVersion, 3);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 3: thêm Critical/Armor Penetration/Effect cho công trình, thêm tháp mới, thêm khung phases/abilities cho Boss.");
  }

  /* Đảm bảo mọi Boss có Phase Engine + Skill thật (Giai đoạn 3, Priority 2).
     Chỉ điền phases/abilities nếu đang RỖNG (mảng trống do migration v3
     trước đó chỉ tạo khung), không đụng tới Boss Admin đã tự cấu hình. */
  function ensureBossEngineFields() {
    const defaults = defaultBosses();
    const defaultsById = {};
    for (const d of defaults) defaultsById[d.id] = d;
    const bosses = list("bosses").map((b) => {
      const patch = {};
      if (!Array.isArray(b.phases) || b.phases.length === 0) patch.phases = defaultBossPhases();
      if (!Array.isArray(b.abilities) || b.abilities.length === 0) {
        const def = defaultsById[b.id];
        patch.abilities = def ? def.abilities : [];
      }
      return Object.keys(patch).length ? Object.assign({}, b, patch) : b;
    });
    StorageService.set(KEYS.bosses, bosses);
  }

  /* Di trú schemaVersion 3 -> 4 (Giai đoạn 3 - Boss Phase Engine + Boss Skill thật).
     Ghi literal 4, cùng lý do như trên. */
  function migrateSchemaV3ToV4() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 4) return;
    ensureBossEngineFields();
    StorageService.set(KEYS.schemaVersion, 4);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 4: thêm Boss Phase Engine (3 phase HP) + Boss Skill thật (phases/abilities) cho Boss.");
  }

  /* Đảm bảo Hero EXP/Level thật có đủ field cần thiết (Giai đoạn 3,
     Priority 3): player.heroExp{} riêng biệt với player.exp (EXP người
     chơi), và enemies có rewardExp (EXP tướng nhận khi hạ địch loại đó).
     Chỉ điền field còn THIẾU, không đụng dữ liệu Admin đã tự chỉnh. */
  function ensureHeroProgressionFields() {
    const players = list("players").map((p) => {
      if (p.heroExp !== undefined) return p;
      const heroExp = {};
      for (const hid of p.heroesOwned || []) heroExp[hid] = 0;
      return Object.assign({}, p, { heroExp });
    });
    StorageService.set(KEYS.players, players);

    const enemies = list("enemies").map((e) => {
      if (e.rewardExp !== undefined) return e;
      // Chưa có Admin nào khai báo rewardExp -> suy ra từ reward vàng hiện có
      // (khoảng 50%) để không có địch nào cho 0 EXP một cách vô lý.
      return Object.assign({}, e, { rewardExp: Math.max(1, Math.round((e.reward || 0) * 0.5)) });
    });
    StorageService.set(KEYS.enemies, enemies);
  }

  /* Di trú schemaVersion 4 -> 5 (Giai đoạn 3 - Hero EXP/Level thật).
     Đây là bước cuối cùng hiện tại nên trùng với SCHEMA_VERSION, nhưng
     vẫn ghi literal 5 để nếu có Giai đoạn 4 (schemaVersion 6) thêm vào
     sau, hàm này không bị đổi ý nghĩa theo hằng số. */
  function migrateSchemaV4ToV5() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 5) return;
    ensureHeroProgressionFields();
    StorageService.set(KEYS.schemaVersion, 5);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 5: thêm Hero EXP/Level thật (player.heroExp, enemies.rewardExp).");
  }

  /* Đảm bảo Score/Combo/3-Sao (Giai đoạn 3, Priority 5) có đủ field.
     Chỉ điền field còn THIẾU, không đụng dữ liệu Admin/người chơi đã có. */
  function ensureScoreProgressionFields() {
    const players = list("players").map((p) => {
      const patch = {};
      if (p.stageStars === undefined) patch.stageStars = {};
      if (p.bestScore === undefined) patch.bestScore = {};
      if (p.bestTime === undefined) patch.bestTime = {};
      return Object.keys(patch).length ? Object.assign({}, p, patch) : p;
    });
    StorageService.set(KEYS.players, players);

    const stages = list("stages").map((s) => {
      const patch = {};
      if (!s.targetTime) patch.targetTime = Math.round((s.waves ? s.waves.length : 5) * 24 + (s.order || 1) * 6);
      if (!s.starConditions) {
        patch.starConditions = {
          oneStar: true,
          twoStarCastleHpPercent: 45,
          threeStarCastleHpPercent: 80,
          threeStarScore: 500 + (s.order || 1) * 350,
        };
      }
      return Object.keys(patch).length ? Object.assign({}, s, patch) : s;
    });
    StorageService.set(KEYS.stages, stages);
  }

  /* Di trú schemaVersion 5 -> 6 (Giai đoạn 3 - Score/Combo/3-Sao thật). */
  function migrateSchemaV5ToV6() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 6) return;
    ensureScoreProgressionFields();
    StorageService.set(KEYS.schemaVersion, 6);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 6: thêm Score/Combo/3-Sao thật (player.stageStars/bestScore/bestTime, stages.starConditions/targetTime).");
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
    migrateSchemaV2ToV3();
    migrateSchemaV3ToV4();
    migrateSchemaV4ToV5();
    migrateSchemaV5ToV6();
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
    ensureBuildingCombatFields(); // vá field mới nếu snapshot import là bản backup cũ (v2)
    ensureBossEngineFields(); // vá Boss Phase Engine + Skill thật nếu snapshot import là bản backup cũ (v3)
    ensureHeroProgressionFields(); // vá Hero EXP/Level thật nếu snapshot import là bản backup cũ (v4)
    ensureScoreProgressionFields(); // vá Score/Combo/3-Sao thật nếu snapshot import là bản backup cũ (v5)
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
        // Priority 5 (Score/3-Sao) + Priority 4 (Wave/Map đặc biệt) - PHẢI
        // trộn vào đây, nếu không Game.levelDef sẽ luôn đọc undefined dù
        // dữ liệu gốc trong collection "stages" đã có đầy đủ.
        starConditions: stage.starConditions,
        targetTime: stage.targetTime,
        specialMechanic: stage.specialMechanic,
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
        phases: Array.isArray(b.phases) ? b.phases : [],
        abilities: Array.isArray(b.abilities) ? b.abilities : [],
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
