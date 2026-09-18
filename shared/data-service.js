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
    achievements: "collection:achievements",
    adminUsers: "collection:adminUsers",
    adminLogs: "collection:adminLogs",
  };

  const SCHEMA_VERSION = 11;

  /* ---------------------------------------------------------
     GIAI ĐOẠN 6 - HỆ THỐNG CẤP VŨ KHÍ / CÔNG TRÌNH 1 -> 10
     Mỗi công trình có 6 MỐC TIẾN HOÁ (tier). Mỗi mốc đổi TÊN,
     đổi NGOẠI HÌNH (dựng lại mesh 3D + ký hiệu 2D) và đổi HIỆU
     ỨNG (fx). Các mốc `evolution: true` sẽ phát animation tiến hoá
     toàn màn hình khi người chơi nâng tới.

     fx (js/tower-tiers.js đọc để quyết định hiệu ứng):
       basic    - không hiệu ứng thêm
       metal    - thêm chi tiết kim loại, tia lửa khi bắn
       aura     - mở vòng hào quang dưới chân
       trail    - đạn có vệt đuôi
       legend   - hào quang + hạt bay + vệt đuôi mạnh
       ultimate - đổi diện mạo hoàn toàn, có tên riêng + đòn tối thượng

     Dữ liệu này nằm trong DataService nên Admin sửa được, KHÔNG
     hard-code trong file game.
     --------------------------------------------------------- */
  const TOWER_TIER_NAMES = {
    cung_thu:      ["Cung Thường", "Cung Gia Cố Kim Loại", "Cung Chiến Tướng", "Cung Linh", "Thần Cung", "THẦN CUNG HOA LƯ"],
    no_than:       ["Nỏ Gỗ", "Nỏ Bọc Đồng", "Chiến Nỏ", "Đại Chiến Nỏ", "Nỏ Thần Kim Quy", "HOA LƯ THIÊN NỖ"],
    voi_chien:     ["Voi Trận", "Voi Bọc Giáp", "Voi Chiến Tướng", "Voi Xung Thành", "Thần Tượng", "BẠCH TƯỢNG ĐẠI CỒ VIỆT"],
    coc_nhon:      ["Cọc Gỗ", "Cọc Vót Sắt", "Bãi Cọc Chiến", "Bãi Cọc Ngầm", "Thiên La Địa Võng", "BÃI CỌC BẠCH ĐẰNG"],
    may_ban_da:    ["Máy Bắn Đá", "Máy Bắn Gia Cố", "Chiến Xa Phá Thành", "Đại Pháo Đá", "Thần Khí Công Thành", "HOA LƯ CỰ THẠCH"],
    riu_chien:     ["Rìu Thường", "Rìu Thép", "Rìu Chiến Tướng", "Rìu Hỏa", "Thần Phủ", "ĐẠI VIỆT THẦN PHỦ"],
    hoa_tien:      ["Hoả Tiễn", "Hoả Tiễn Gia Cố", "Hoả Xa Chiến Tướng", "Hoả Long Tiễn", "Thần Hoả", "HỎA LONG THIÊN TIỄN"],
    khien_binh:    ["Khiên Gỗ", "Khiên Bọc Đồng", "Khiên Chiến Tướng", "Thiết Bích", "Thần Thuẫn", "KIM CANG HOA LƯ THUẪN"],
    thap_hoa_cong: ["Lò Hoả Công", "Lò Gia Cố", "Hoả Đài Chiến Tướng", "Hoả Ngục Đài", "Thần Hoả Đài", "HỎA THẦN HOA LƯ ĐÀI"],
    dao_si:        ["Đạo Sĩ", "Pháp Sư", "Đại Pháp Sư", "Tiên Sư Linh Phù", "Quốc Sư", "QUỐC SƯ ĐẠI CỒ VIỆT"],
    tam_doc:       ["Bẫy Độc", "Bẫy Độc Gia Cố", "Trận Độc Chiến Tướng", "Vạn Độc Trận", "Thần Độc", "VẠN ĐỘC HOA LƯ TRẬN"],
    trong_dong:    ["Trống Trận", "Trống Bọc Đồng", "Trống Chiến Tướng", "Trống Đông Sơn", "Thần Cổ", "ĐỒNG CỔ ĐẠI CỒ VIỆT"],
  };

  const TIER_LEVELS = [1, 3, 5, 7, 9, 10];
  const TIER_FX = ["basic", "metal", "aura", "trail", "legend", "ultimate"];
  const TIER_LABEL = ["Cơ bản", "Gia cố", "TIẾN HOÁ", "Chiến tướng", "HUYỀN THOẠI", "TỐI THƯỢNG"];

  /* Sinh mảng `tiers` + nâng maxLevel lên 10 cho một công trình. */
  function withTowerTiers(b) {
    if (Array.isArray(b.tiers) && b.tiers.length === TIER_LEVELS.length && b.maxLevel === 10) return b;
    const names = TOWER_TIER_NAMES[b.id] || [];
    const base = b.name || b.id;
    const tiers = TIER_LEVELS.map((lv, i) => ({
      level: lv,
      name: names[i] || `${base} cấp ${lv}`,
      label: TIER_LABEL[i],
      fx: TIER_FX[i],
      evolution: lv === 5 || lv === 10,
      ultimate: lv === 10 ? `${(names[5] || base)} – đòn tối thượng: +35% sát thương, +15% tầm bắn.` : null,
    }));
    return Object.assign({}, b, {
      maxLevel: 10,
      tiers,
      // Chỉ số tăng đều tới cấp 10: giữ nguyên hệ số gốc của bản cũ (đã cân
      // bằng cho 5 cấp) nhưng giảm nhẹ để tổng sức mạnh cấp 10 không vỡ game.
      upgradeDamageMult: b.upgradeDamageMult !== undefined ? +(b.upgradeDamageMult * 0.62).toFixed(3) : 0,
      upgradeRangeMult: b.upgradeRangeMult !== undefined ? +(b.upgradeRangeMult * 0.62).toFixed(3) : 0,
      upgradeAuraMult: b.upgradeAuraMult !== undefined ? +(b.upgradeAuraMult * 0.62).toFixed(3) : undefined,
    });
  }

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
      SELL_REFUND_RATE: 0.7,   // Giai đoạn 4: bán tháp hoàn lại 70% tổng vốn đã bỏ ra
      TIDE_CYCLE_SECONDS: 9,
      canvasWidth: 960,
      canvasHeight: 540,
      speeds: [1, 2, 3],
      features: {
        soundEnabled: true,
        sfxEnabled: true,
        musicEnabled: true,  // Giai đoạn 4: nhạc nền được TỔNG HỢP bằng Web Audio, không cần file
        tutorialEnabled: true,
        autoSaveEnabled: true,
        debugMode: false,
        showDamageNumbers: true,
        showEnemyHpBar: true,
        showFps: false,
        // Giai đoạn 5: dựng hình 3D bằng WebGL (Three.js đóng gói sẵn trong
        // vendor/three.min.js). Nếu máy/trình duyệt không hỗ trợ WebGL, engine
        // TỰ ĐỘNG quay về chế độ vẽ 2D cũ nên game không bao giờ trắng màn.
        render3dEnabled: true,
        shadows3d: true,
      },
    };
  }

  /* ---------------------------------------------------------
     CÔNG TRÌNH / THÁP (Giai đoạn 4)
     Mỗi tháp có:
       role          - vai trò chiến thuật (dps/aoe/control/support/siege)
       damageType    - "physical" (bị Giáp chặn) | "magic" (bị Kháng phép chặn)
       targetPriority- chế độ ưu tiên mục tiêu mặc định
       upgradeTree   - cây nâng cấp riêng: từ cấp branchAt trở lên người chơi
                       chọn 1 trong 2 nhánh, mỗi nhánh đổi hẳn lối chơi của tháp
       aura*         - dành cho tháp hỗ trợ (không bắn, buff tháp xung quanh)
     --------------------------------------------------------- */
  function defaultBuildings() {
    return [
      {
        id: "cung_thu", name: "Cung thủ", nameVi: "Cung thủ",
        description: "Bắn xa, sát thương vừa phải, tốc bắn nhanh. Lính đánh chủ lực giá rẻ.",
        icon: "🏹", color: "#c9a24a", role: "dps", damageType: "physical",
        cost: 50, damage: 12, range: 130, fireRate: 1.1,
        projectileSpeed: 420, splashRadius: 0,
        criticalChance: 10, criticalMultiplier: 1.8, armorPenetration: 0,
        effectType: "none", effectValue: 0, effectDuration: 0,
        targetPriority: "first",
        maxLevel: 5, upgradeCost: 40, upgradeDamageMult: 0.32, upgradeRangeMult: 0.07,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "than_xa", name: "Thần Xạ", icon: "🎯",
              description: "Tầm bắn xa hơn, chí mạng cực cao — chuyên hạ mục tiêu đơn.",
              damageMult: 1.25, rangeMult: 1.3, fireRateMult: 0.9,
              critChanceBonus: 20, critMultiplierBonus: 0.5, armorPenBonus: 10 },
            { id: "lien_chau", name: "Liên Châu", icon: "💨",
              description: "Bắn liên hoàn như nỏ Liên Châu, tốc bắn tăng vọt.",
              damageMult: 0.9, rangeMult: 1.0, fireRateMult: 1.85,
              critChanceBonus: 5, critMultiplierBonus: 0, armorPenBonus: 0 },
          ],
        },
        enabled: true,
      },
      {
        id: "no_than", name: "Nỏ thần", nameVi: "Nỏ thần",
        description: "Sát thương lớn, xuyên một phần giáp, bắn chậm. Khắc chế địch giáp dày.",
        icon: "🎯", color: "#2f5d50", role: "dps", damageType: "physical",
        cost: 100, damage: 30, range: 160, fireRate: 0.7,
        projectileSpeed: 520, splashRadius: 0,
        criticalChance: 18, criticalMultiplier: 2.2, armorPenetration: 35,
        effectType: "none", effectValue: 0, effectDuration: 0,
        targetPriority: "strongest",
        maxLevel: 5, upgradeCost: 75, upgradeDamageMult: 0.36, upgradeRangeMult: 0.07,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "xuyen_giap", name: "Xuyên Giáp", icon: "🗡️",
              description: "Mũi tên bọc thép xuyên thủng gần như mọi loại giáp.",
              damageMult: 1.15, rangeMult: 1.05, fireRateMult: 1.0,
              critChanceBonus: 5, critMultiplierBonus: 0.2, armorPenBonus: 55 },
            { id: "kim_quy", name: "Nỏ Kim Quy", icon: "⚡",
              description: "Móng rùa thần phóng điện, làm choáng mục tiêu trúng đòn.",
              damageMult: 1.3, rangeMult: 1.1, fireRateMult: 0.8,
              effectType: "stun", effectValue: 1, effectDuration: 0.6,
              critChanceBonus: 10, critMultiplierBonus: 0.3, armorPenBonus: 10 },
          ],
        },
        enabled: true,
      },
      {
        id: "voi_chien", name: "Voi chiến", nameVi: "Voi chiến",
        description: "Sát thương lan toả diện rộng, đắt nhưng dọn đám đông rất tốt.",
        icon: "🐘", color: "#7a1f2b", role: "aoe", damageType: "physical",
        cost: 130, damage: 16, range: 100, fireRate: 0.8,
        projectileSpeed: 300, splashRadius: 45,
        criticalChance: 6, criticalMultiplier: 1.5, armorPenetration: 0,
        effectType: "none", effectValue: 0, effectDuration: 0,
        targetPriority: "first",
        maxLevel: 5, upgradeCost: 95, upgradeDamageMult: 0.28, upgradeRangeMult: 0.05,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "xung_tran", name: "Voi Xung Trận", icon: "💥",
              description: "Vùng sát thương lan rộng hơn nhiều, quét sạch đội hình đông.",
              damageMult: 1.2, rangeMult: 1.15, fireRateMult: 1.0, splashRadiusBonus: 40 },
            { id: "giay_xeo", name: "Voi Giày Xéo", icon: "⚡",
              description: "Cú giậm chân làm choáng toàn bộ địch trong vùng nổ.",
              damageMult: 1.1, rangeMult: 1.0, fireRateMult: 0.9, splashRadiusBonus: 15,
              effectType: "stun", effectValue: 1, effectDuration: 0.8 },
          ],
        },
        enabled: true,
      },
      {
        id: "coc_nhon", name: "Bẫy cọc nhọn", nameVi: "Bẫy cọc nhọn",
        description: "Cọc gỗ vót nhọn theo kế Ngô Quyền, gây sát thương nhẹ và làm chậm quân địch.",
        icon: "🪵", color: "#6b4a2f", role: "control", damageType: "physical",
        cost: 70, damage: 8, range: 95, fireRate: 1.4,
        projectileSpeed: 520, splashRadius: 0,
        criticalChance: 4, criticalMultiplier: 1.5, armorPenetration: 0,
        effectType: "slow", effectValue: 0.35, effectDuration: 2.5,
        slowFactor: 0.35, slowDuration: 2.5, // giữ lại field cũ để tương thích ngược
        targetPriority: "first",
        maxLevel: 5, upgradeCost: 55, upgradeDamageMult: 0.25, upgradeRangeMult: 0.05,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "coc_ngam", name: "Cọc Ngầm", icon: "🌊",
              description: "Bãi cọc ngầm Bạch Đằng: làm chậm cực mạnh và lâu hơn.",
              damageMult: 1.1, rangeMult: 1.2, fireRateMult: 1.0,
              effectType: "slow", effectValue: 0.6, effectDuration: 4 },
            { id: "coc_tam_doc", name: "Cọc Tẩm Độc", icon: "☠️",
              description: "Đầu cọc tẩm độc, gây độc bào mòn máu địch theo thời gian.",
              damageMult: 1.0, rangeMult: 1.1, fireRateMult: 1.1,
              effectType: "poison", effectValue: 9, effectDuration: 6 },
          ],
        },
        enabled: true,
      },
      {
        id: "may_ban_da", name: "Máy bắn đá", nameVi: "Máy bắn đá",
        description: "Bắn đá tảng gây sát thương cực lớn trên diện rộng, tốc bắn chậm nhưng khắc chế Boss.",
        icon: "🪨", color: "#5a4a3a", role: "siege", damageType: "physical",
        cost: 220, damage: 55, range: 190, fireRate: 0.4,
        projectileSpeed: 260, splashRadius: 70,
        criticalChance: 12, criticalMultiplier: 2.5, armorPenetration: 25,
        effectType: "none", effectValue: 0, effectDuration: 0,
        targetPriority: "boss",
        maxLevel: 5, upgradeCost: 150, upgradeDamageMult: 0.32, upgradeRangeMult: 0.06,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "da_lua", name: "Đá Lửa", icon: "🔥",
              description: "Đá tẩm dầu bốc cháy, thiêu đốt mọi kẻ trúng đòn.",
              damageMult: 1.15, rangeMult: 1.05, fireRateMult: 1.0, splashRadiusBonus: 15,
              effectType: "burn", effectValue: 14, effectDuration: 5 },
            { id: "cong_thanh", name: "Công Thành", icon: "🏰",
              description: "Đá công thành khổng lồ: sát thương và tầm bắn vượt trội.",
              damageMult: 1.55, rangeMult: 1.3, fireRateMult: 0.85, splashRadiusBonus: 25,
              armorPenBonus: 30 },
          ],
        },
        enabled: true,
      },
      {
        id: "riu_chien", name: "Rìu chiến", nameVi: "Rìu chiến",
        description: "Cận chiến, sát thương đơn mục tiêu rất cao và tỉ lệ chí mạng lớn, tầm đánh ngắn.",
        icon: "🪓", color: "#8a5a2f", role: "dps", damageType: "physical",
        cost: 90, damage: 45, range: 75, fireRate: 0.9,
        projectileSpeed: 900, splashRadius: 0,
        criticalChance: 22, criticalMultiplier: 2.0, armorPenetration: 10,
        effectType: "none", effectValue: 0, effectDuration: 0,
        targetPriority: "strongest",
        maxLevel: 5, upgradeCost: 70, upgradeDamageMult: 0.34, upgradeRangeMult: 0.04,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "dao_phu", name: "Đao Phủ", icon: "💀",
              description: "Nhát chém quyết định: chí mạng khủng khiếp, chuyên chặt Boss.",
              damageMult: 1.3, rangeMult: 1.1, fireRateMult: 0.9,
              critChanceBonus: 25, critMultiplierBonus: 0.8, armorPenBonus: 20 },
            { id: "cuong_chien", name: "Cuồng Chiến", icon: "🌀",
              description: "Vung rìu liên tục không ngừng nghỉ, gây chảy máu cho địch.",
              damageMult: 0.95, rangeMult: 1.15, fireRateMult: 1.7,
              effectType: "bleed", effectValue: 6, effectDuration: 4 },
          ],
        },
        enabled: true,
      },
      {
        id: "hoa_tien", name: "Hoả tiễn", nameVi: "Hoả tiễn",
        description: "Tên lửa lửa gây sát thương diện rộng và đốt cháy quân địch theo thời gian.",
        icon: "🚀", color: "#c9542a", role: "aoe", damageType: "magic",
        cost: 150, damage: 18, range: 150, fireRate: 0.9,
        projectileSpeed: 380, splashRadius: 40,
        criticalChance: 8, criticalMultiplier: 1.6, armorPenetration: 0,
        effectType: "burn", effectValue: 6, effectDuration: 4,
        targetPriority: "first",
        maxLevel: 5, upgradeCost: 110, upgradeDamageMult: 0.3, upgradeRangeMult: 0.06,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "hoa_long", name: "Hoả Long", icon: "🐉",
              description: "Ngọn lửa rồng cháy dai dẳng, huỷ diệt địch máu dày.",
              damageMult: 1.15, rangeMult: 1.1, fireRateMult: 1.0,
              effectType: "burn", effectValue: 16, effectDuration: 7 },
            { id: "no_chum", name: "Nổ Chùm", icon: "💣",
              description: "Đầu đạn nổ chùm, vùng sát thương và uy lực tức thời lớn hơn hẳn.",
              damageMult: 1.5, rangeMult: 1.05, fireRateMult: 0.95, splashRadiusBonus: 35 },
          ],
        },
        enabled: true,
      },
      {
        id: "khien_binh", name: "Khiên binh", nameVi: "Khiên binh",
        description: "Sát thương thấp nhưng làm chậm mạnh, dùng để khống chế đội hình địch.",
        icon: "🛡️", color: "#4a6a7a", role: "control", damageType: "physical",
        cost: 60, damage: 5, range: 80, fireRate: 1.6,
        projectileSpeed: 520, splashRadius: 0,
        criticalChance: 0, criticalMultiplier: 1, armorPenetration: 0,
        effectType: "slow", effectValue: 0.55, effectDuration: 3,
        targetPriority: "fastest",
        maxLevel: 5, upgradeCost: 45, upgradeDamageMult: 0.2, upgradeRangeMult: 0.04,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "tran_ap", name: "Trấn Áp", icon: "⚡",
              description: "Cú thúc khiên làm choáng địch, chặn đứng bước tiến.",
              damageMult: 1.4, rangeMult: 1.1, fireRateMult: 0.8,
              effectType: "stun", effectValue: 1, effectDuration: 1.0 },
            { id: "bang_giap", name: "Băng Giáp", icon: "❄️",
              description: "Hơi lạnh đóng băng mục tiêu tại chỗ trong chốc lát.",
              damageMult: 1.1, rangeMult: 1.25, fireRateMult: 1.0,
              effectType: "freeze", effectValue: 1, effectDuration: 1.2 },
          ],
        },
        enabled: true,
      },
      {
        id: "thap_hoa_cong", name: "Hoả công", nameVi: "Hoả công",
        description: "Kế hoả công diện rộng, sát thương ban đầu thấp nhưng đốt cháy dai dẳng cả nhóm địch.",
        icon: "♨️", color: "#a8391f", role: "aoe", damageType: "magic",
        cost: 180, damage: 10, range: 120, fireRate: 1.0,
        projectileSpeed: 340, splashRadius: 55,
        criticalChance: 5, criticalMultiplier: 1.5, armorPenetration: 0,
        effectType: "burn", effectValue: 8, effectDuration: 5,
        targetPriority: "first",
        maxLevel: 5, upgradeCost: 130, upgradeDamageMult: 0.28, upgradeRangeMult: 0.05,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "hoa_nguc", name: "Hoả Ngục", icon: "🔥",
              description: "Biển lửa thiêu rụi mọi thứ trong vùng, cháy cực mạnh.",
              damageMult: 1.1, rangeMult: 1.15, fireRateMult: 1.0, splashRadiusBonus: 25,
              effectType: "burn", effectValue: 18, effectDuration: 6 },
            { id: "khoi_doc", name: "Khói Độc", icon: "☠️",
              description: "Khói độc lan rộng khiến cả đám địch trúng độc và chậm lại.",
              damageMult: 1.0, rangeMult: 1.2, fireRateMult: 1.15, splashRadiusBonus: 35,
              effectType: "poison", effectValue: 12, effectDuration: 6 },
          ],
        },
        enabled: true,
      },
      /* ---- Tháp mới của Giai đoạn 4 ---- */
      {
        id: "dao_si", name: "Đạo sĩ", nameVi: "Đạo sĩ",
        description: "Dùng bùa chú gây SÁT THƯƠNG PHÉP — bỏ qua giáp vật lý, khắc chế địch giáp dày.",
        icon: "🧙", color: "#6a4f9a", role: "dps", damageType: "magic",
        cost: 140, damage: 34, range: 145, fireRate: 0.75,
        projectileSpeed: 430, splashRadius: 0,
        criticalChance: 12, criticalMultiplier: 2.0, armorPenetration: 0,
        effectType: "none", effectValue: 0, effectDuration: 0,
        targetPriority: "strongest",
        maxLevel: 5, upgradeCost: 105, upgradeDamageMult: 0.35, upgradeRangeMult: 0.06,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "loi_phu", name: "Lôi Phù", icon: "⚡",
              description: "Bùa sấm sét đánh choáng mục tiêu và lan sát thương.",
              damageMult: 1.15, rangeMult: 1.1, fireRateMult: 1.0, splashRadiusBonus: 35,
              effectType: "stun", effectValue: 1, effectDuration: 0.7 },
            { id: "bua_yem", name: "Bùa Yểm", icon: "🔮",
              description: "Yểm bùa trực diện: sát thương phép đơn mục tiêu cực lớn.",
              damageMult: 1.75, rangeMult: 1.15, fireRateMult: 0.9,
              critChanceBonus: 12, critMultiplierBonus: 0.4 },
          ],
        },
        enabled: true,
      },
      {
        id: "tam_doc", name: "Bẫy tẩm độc", nameVi: "Bẫy tẩm độc",
        description: "Phi tiêu tẩm độc: sát thương ban đầu thấp nhưng gây ĐỘC bào mòn máu địch rất lâu.",
        icon: "☠️", color: "#4f7a3a", role: "control", damageType: "magic",
        cost: 95, damage: 7, range: 125, fireRate: 1.3,
        projectileSpeed: 480, splashRadius: 0,
        criticalChance: 5, criticalMultiplier: 1.5, armorPenetration: 0,
        effectType: "poison", effectValue: 10, effectDuration: 6,
        targetPriority: "strongest",
        maxLevel: 5, upgradeCost: 70, upgradeDamageMult: 0.22, upgradeRangeMult: 0.06,
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "kich_doc", name: "Kịch Độc", icon: "🧪",
              description: "Nọc độc cực mạnh, mỗi giây bào mòn lượng máu lớn.",
              damageMult: 1.2, rangeMult: 1.05, fireRateMult: 1.0,
              effectType: "poison", effectValue: 24, effectDuration: 8 },
            { id: "doc_lan", name: "Độc Lan", icon: "🌫️",
              description: "Độc bay lan cả cụm địch xung quanh mục tiêu.",
              damageMult: 1.1, rangeMult: 1.2, fireRateMult: 1.2, splashRadiusBonus: 55,
              effectType: "poison", effectValue: 13, effectDuration: 6 },
          ],
        },
        enabled: true,
      },
      {
        id: "trong_dong", name: "Trống đồng", nameVi: "Trống đồng",
        description: "Tháp HỖ TRỢ: không tự bắn, nhưng tăng sát thương và tốc bắn cho mọi tháp xung quanh.",
        icon: "🥁", color: "#b8862b", role: "support", damageType: "physical",
        cost: 160, damage: 0, range: 150, fireRate: 0,
        projectileSpeed: 0, splashRadius: 0,
        criticalChance: 0, criticalMultiplier: 1, armorPenetration: 0,
        effectType: "none", effectValue: 0, effectDuration: 0,
        targetPriority: "first",
        isSupport: true, auraDamageBonus: 0.18, auraFireRateBonus: 0.15, auraRangeBonus: 0.05,
        maxLevel: 5, upgradeCost: 120, upgradeDamageMult: 0, upgradeRangeMult: 0.08,
        upgradeAuraMult: 0.22, // mỗi cấp cộng thêm 22% hiệu lực hào quang
        upgradeTree: {
          branchAt: 3,
          branches: [
            { id: "trong_tran_co", name: "Trống Trận", icon: "🥁",
              description: "Nhịp trống dồn dập: ưu tiên tăng mạnh TỐC BẮN cho tháp quanh vùng.",
              rangeMult: 1.1, auraDamageBonusAdd: 0.05, auraFireRateBonusAdd: 0.35 },
            { id: "trong_dong_son", name: "Trống Đông Sơn", icon: "🌞",
              description: "Uy linh trống đồng cổ: ưu tiên tăng mạnh SÁT THƯƠNG và tầm bắn.",
              rangeMult: 1.35, auraDamageBonusAdd: 0.34, auraFireRateBonusAdd: 0.04 },
          ],
        },
        enabled: true,
      },
    ].map(withTowerTiers);
  }

  /* ---------------------------------------------------------
     QUÂN ĐỊCH (Giai đoạn 4)
     Mỗi loại địch có HÀNH VI (behavior) riêng, được engine
     (js/entities.js) xử lý thật sự chứ không chỉ khác màu:
       normal   - đi thẳng theo đường, không có gì đặc biệt
       dash     - định kỳ tăng tốc đột ngột (xung phong)
       armored  - giáp dày, KHÁNG CHÍ MẠNG (critResist)
       flying   - bay thẳng tới thành, bỏ qua khúc quanh của đường đi
       healer   - định kỳ hồi máu cho đồng đội xung quanh
       shield   - có lớp khiên hấp thụ sát thương, tự hồi khi không bị đánh
       regen    - tự hồi máu liên tục theo % máu tối đa
       splitter - khi chết tách ra thành nhiều con nhỏ hơn
     defense = giáp vật lý (trừ phẳng ST vật lý)
     resistance = kháng vật lý theo % ; magicResist = kháng phép theo %
     --------------------------------------------------------- */
  function defaultEnemies() {
    return [
      {
        id: "quan_su_quan", name: "Quân sứ quân",
        hp: 40, speed: 55, reward: 8, rewardExp: 4, damage: 1,
        defense: 0, resistance: 0, magicResist: 0,
        behavior: "normal",
        description: "Bộ binh thường của các sứ quân, đông nhưng yếu.",
        color: "#8a4a3a", radius: 12, icon: "🛡", enabled: true,
      },
      {
        id: "ky_binh", name: "Kỵ binh",
        hp: 28, speed: 95, reward: 10, rewardExp: 5, damage: 1,
        defense: 0, resistance: 0, magicResist: 0,
        behavior: "dash", dashInterval: 4, dashDuration: 1.2, dashSpeedMult: 1.8,
        description: "Di chuyển nhanh, định kỳ phi nước đại vượt qua tầm bắn.",
        color: "#5a5a8a", radius: 11, icon: "🐎", enabled: true,
      },
      {
        id: "truong_giap", name: "Trường giáp binh",
        hp: 90, speed: 40, reward: 16, rewardExp: 8, damage: 2,
        defense: 2, resistance: 0, magicResist: 0,
        behavior: "normal",
        description: "Bộ binh giáp trung bình, chậm chạp nhưng dai sức.",
        color: "#4a4a4a", radius: 14, icon: "⚔", enabled: true,
      },
      {
        id: "cung_thu_dich", name: "Cung thủ địch",
        hp: 34, speed: 48, reward: 12, rewardExp: 6, damage: 1,
        defense: 0, resistance: 10, magicResist: 0,
        behavior: "normal",
        description: "Nhẹ giáp, kháng nhẹ sát thương vật lý.",
        color: "#6a5a2f", radius: 12, icon: "🏹", enabled: true,
      },
      {
        id: "tuong_giac", name: "Tướng giặc",
        hp: 260, speed: 38, reward: 60, rewardExp: 30, damage: 4,
        defense: 4, resistance: 0, magicResist: 10,
        behavior: "normal",
        description: "Chỉ huy cấp thấp, máu dày và gây nhiều sát thương cho thành.",
        color: "#7a1f2b", radius: 18, icon: "👑", enabled: true,
      },
      {
        id: "thiet_ky", name: "Thiết kỵ",
        hp: 140, speed: 58, reward: 22, rewardExp: 11, damage: 3,
        defense: 5, resistance: 0, magicResist: 0,
        behavior: "armored", critResist: 70,
        description: "Kỵ binh bọc thép: giáp dày và rất khó bị chí mạng. Dùng sát thương phép để khắc chế.",
        color: "#39395c", radius: 15, icon: "🏇", enabled: true,
      },
      {
        id: "cung_no_tong", name: "Cung nỏ Tống",
        hp: 60, speed: 46, reward: 18, rewardExp: 9, damage: 2,
        defense: 0, resistance: 25, magicResist: 0,
        behavior: "normal",
        description: "Kháng vật lý cao, nên dùng tháp phép để hạ.",
        color: "#5a4a2f", radius: 12, icon: "🎯", enabled: true,
      },
      /* ---- Quân địch mới của Giai đoạn 4 ---- */
      {
        id: "dieu_hau", name: "Diều hâu trinh sát",
        hp: 55, speed: 78, reward: 20, rewardExp: 10, damage: 2,
        defense: 0, resistance: 0, magicResist: 20,
        behavior: "flying",
        description: "BAY thẳng tới thành, không đi theo đường bộ — phải bố trí tháp trên đường bay.",
        color: "#7a6a4a", radius: 12, icon: "🦅", enabled: true,
      },
      {
        id: "thay_mo", name: "Thầy mo",
        hp: 80, speed: 44, reward: 26, rewardExp: 14, damage: 1,
        defense: 1, resistance: 0, magicResist: 35,
        behavior: "healer", healInterval: 3, healRadius: 110, healPercent: 8,
        description: "HỒI MÁU cho đồng đội xung quanh — nên tiêu diệt trước tiên.",
        color: "#3f6a4a", radius: 13, icon: "🧿", enabled: true,
      },
      {
        id: "khien_chan", name: "Lính khiên chắn",
        hp: 110, speed: 42, reward: 24, rewardExp: 12, damage: 2,
        defense: 3, resistance: 0, magicResist: 0,
        behavior: "shield", shieldAmount: 90, shieldRegenDelay: 4, shieldRegenRate: 22,
        description: "Có lớp KHIÊN hấp thụ sát thương, tự hồi lại nếu ngừng bị đánh.",
        color: "#4a6a7a", radius: 14, icon: "🛡️", enabled: true,
      },
      {
        id: "ma_binh", name: "Ma binh",
        hp: 130, speed: 50, reward: 28, rewardExp: 15, damage: 3,
        defense: 1, resistance: 0, magicResist: 45,
        behavior: "regen", regenPercent: 3,
        description: "Kháng phép rất cao và TỰ HỒI MÁU liên tục — phải dứt điểm nhanh bằng sát thương vật lý.",
        color: "#5c3a6a", radius: 14, icon: "👻", enabled: true,
      },
      {
        id: "quy_tot", name: "Quỷ tốt",
        hp: 120, speed: 52, reward: 24, rewardExp: 12, damage: 2,
        defense: 2, resistance: 0, magicResist: 0,
        behavior: "splitter", splitInto: "quan_su_quan", splitCount: 2, splitHpPercent: 45,
        description: "Khi bị hạ sẽ TÁCH thành 2 quân nhỏ hơn tại chỗ.",
        color: "#6a3a3a", radius: 15, icon: "👺", enabled: true,
      },
      {
        id: "tho_phi", name: "Thổ phỉ",
        hp: 46, speed: 88, reward: 14, rewardExp: 7, damage: 1,
        defense: 0, resistance: 0, magicResist: 0,
        behavior: "dash", dashInterval: 3, dashDuration: 1, dashSpeedMult: 2.1,
        description: "Cực nhanh, chuyên luồn qua khe hở phòng thủ.",
        color: "#8a6a2f", radius: 11, icon: "🗡", enabled: true,
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
        hp: 900, damage: 6, defense: 6, resistance: 10, magicResist: 8,
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
        hp: 1500, damage: 8, defense: 8, resistance: 15, magicResist: 12,
        speed: 36, reward: 320, rewardExp: 140,
        skill: "Triệu hồi thêm 3 kỵ binh khi máu dưới 50%",
        skillCooldown: 0,
        icon: "🐉", color: "#3a2a55",
        description: "Trấn giữ phòng tuyến Đại La kiên cố.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "khien_thanh", name: "Khiên Thành Đồng",
            trigger: { type: "hp_below", percent: 70 }, cooldown: 26,
            effect: "shield_self", shieldPercent: 18,
          },
          {
            id: "trieu_hoi", name: "Triệu Hồi",
            trigger: { type: "hp_below", percent: 50 }, cooldown: 22,
            effect: "summon", summonType: "ky_binh", summonCount: 3,
          },
        ],
      },
      {
        id: "boss_bach_dang", name: "Thuỷ Tặc Chúa",
        hp: 2400, damage: 10, defense: 10, resistance: 20, magicResist: 16,
        speed: 32, reward: 500, rewardExp: 240,
        skill: "Hồi 5% máu tối đa mỗi 5 giây",
        skillCooldown: 0,
        icon: "🌊", color: "#1f4a5a",
        description: "Trấn giữ cửa sông Bạch Đằng, được cọc gỗ Ngô Quyền chờ sẵn.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "song_nhan_chim", name: "Sóng Nhấn Chìm",
            trigger: { type: "interval", seconds: 14 }, cooldown: 14,
            effect: "tower_disable", disableRadius: 150, disableSeconds: 3,
          },
          {
            id: "hoi_sinh_luc", name: "Hồi Sinh Lực",
            trigger: { type: "interval", seconds: 5 }, cooldown: 5,
            effect: "heal_self", healPercent: 5,
          },
        ],
      },
      {
        id: "boss_hau_nhan_bao", name: "Hầu Nhân Bảo",
        hp: 3400, damage: 12, defense: 12, resistance: 20, magicResist: 16,
        speed: 34, reward: 650, rewardExp: 320,
        skill: "Xung phong ải hẹp (+25% sát thương khi HP trên 70%)",
        skillCooldown: 0,
        icon: "⚔️", color: "#4a2f2f",
        description: "Chủ tướng quân Tống, tử trận tại ải Chi Lăng năm 981.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "khien_sat", name: "Khiên Sắt Tống Binh",
            trigger: { type: "hp_below", percent: 55 }, cooldown: 24,
            effect: "shield_self", shieldPercent: 22,
          },
          {
            id: "xung_phong", name: "Xung Phong Ải Hẹp",
            trigger: { type: "hp_above", percent: 70 }, continuous: true,
            effect: "self_buff", speedBonus: 0, damageBonus: 0.25,
          },
        ],
      },
      {
        id: "boss_quach_quan_bien", name: "Quách Quân Biện",
        hp: 4300, damage: 14, defense: 14, resistance: 22, magicResist: 17,
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
        hp: 5600, damage: 16, defense: 16, resistance: 25, magicResist: 20,
        speed: 32, reward: 1000, rewardExp: 500,
        skill: "Cuồng nộ toàn phần (+40% sát thương khi máu dưới 25%)",
        skillCooldown: 0,
        icon: "👹", color: "#2a1f3a",
        description: "Chỉ huy tối cao của đội quân xâm lược cuối cùng, trấn giữ cửa ngõ kinh thành Thăng Long.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "tram_co", name: "Trảm Cờ Hiệu",
            trigger: { type: "interval", seconds: 12 }, cooldown: 12,
            effect: "tower_disable", disableRadius: 175, disableSeconds: 3.5,
          },
          {
            id: "cuong_no_toan_phan", name: "Cuồng Nộ Toàn Phần",
            trigger: { type: "hp_below", percent: 25 }, once: true,
            effect: "self_buff", speedBonus: 0.1, damageBonus: 0.4,
          },
        ],
      },
      {
        id: "boss_nguyen_sieu", name: "Sứ Quân Nguyễn Siêu",
        hp: 6800, damage: 18, defense: 18, resistance: 26, magicResist: 20,
        speed: 34, reward: 1250, rewardExp: 600,
        skill: "Cố Thủ Cổ Loa (hồi 4% máu tối đa mỗi 4 giây, +15% Defense khi máu dưới 60%)",
        skillCooldown: 0,
        icon: "🏯", color: "#3a5a2f",
        description: "Một trong 12 sứ quân, cố thủ thành Cổ Loa cũ, không chịu quy phục Đinh Bộ Lĩnh.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "co_thu_co_loa", name: "Cố Thủ Cổ Loa",
            trigger: { type: "interval", seconds: 4 }, cooldown: 4,
            effect: "heal_self", healPercent: 4,
          },
          {
            id: "phong_thu_kien_co", name: "Phòng Thủ Kiên Cố",
            trigger: { type: "hp_below", percent: 60 }, once: true,
            effect: "self_buff", speedBonus: 0, damageBonus: 0.15,
          },
        ],
      },
      {
        id: "boss_do_canh_thac", name: "Sứ Quân Đỗ Cảnh Thạc",
        hp: 8200, damage: 20, defense: 20, resistance: 28, magicResist: 22,
        speed: 33, reward: 1600, rewardExp: 750,
        skill: "Song Kiếm Hợp Bích (+35% tốc độ đánh khi HP<50%, triệu hồi 4 Thiết kỵ khi HP<30%)",
        skillCooldown: 0,
        icon: "⚔️", color: "#5a1f1f",
        description: "Sứ quân cuối cùng còn ngoan cố kháng cự tại Siêu Loại, trận chiến khép lại cuộc dẹp loạn 12 sứ quân.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          {
            id: "kim_chung_trao", name: "Kim Chung Trạo",
            trigger: { type: "hp_below", percent: 65 }, cooldown: 20,
            effect: "shield_self", shieldPercent: 25,
          },
          {
            id: "pha_tran", name: "Phá Trận",
            trigger: { type: "interval", seconds: 15 }, cooldown: 15,
            effect: "tower_disable", disableRadius: 190, disableSeconds: 4,
          },
          {
            id: "song_kiem_hop_bich", name: "Song Kiếm Hợp Bích",
            trigger: { type: "hp_below", percent: 50 }, once: true,
            effect: "self_buff", speedBonus: 0.35, damageBonus: 0.1,
          },
          {
            id: "trieu_hoi_thiet_ky", name: "Triệu Hồi Thiết Kỵ",
            trigger: { type: "hp_below", percent: 30 }, cooldown: 25,
            effect: "summon", summonType: "thiet_ky", summonCount: 4,
          },
        ],
      },
      /* ------- GIAI ĐOẠN 6: Boss của 2 màn mới (Level 9, Level 10) ------- */
      {
        id: "boss_tong_tien_cong", name: "Đại Boss – Nguyên Soái Liêu Đông",
        hp: 12000, damage: 24, defense: 24, resistance: 32, magicResist: 28,
        speed: 32, reward: 2200, rewardExp: 1000,
        skill: "Tổng Tiến Công: liên tục triệu viện binh, phá công trình và tự bọc giáp.",
        skillCooldown: 0,
        icon: "🏴", color: "#3d1f4a",
        description: "Nguyên soái chỉ huy cuộc tổng tiến công vào Hoa Lư. Càng bị dồn ép càng hung hãn.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          { id: "thiet_bich", name: "Thiết Bích", trigger: { type: "interval", seconds: 18 }, cooldown: 18,
            effect: "shield_self", shieldPercent: 20 },
          { id: "pha_luy", name: "Phá Luỹ", trigger: { type: "interval", seconds: 13 }, cooldown: 13,
            effect: "tower_disable", disableRadius: 200, disableSeconds: 4 },
          { id: "vien_binh_1", name: "Viện Binh Đợt 1", trigger: { type: "hp_below", percent: 70 }, cooldown: 22,
            effect: "summon", summonType: "cung_no_tong", summonCount: 5 },
          { id: "vien_binh_2", name: "Viện Binh Đợt 2", trigger: { type: "hp_below", percent: 40 }, cooldown: 22,
            effect: "summon", summonType: "thiet_ky", summonCount: 5 },
          { id: "tong_luc", name: "Dốc Toàn Lực", trigger: { type: "hp_below", percent: 25 }, once: true,
            effect: "self_buff", speedBonus: 0.3, damageBonus: 0.35 },
        ],
      },
      {
        id: "boss_quyet_chien", name: "Ma Vương Thập Nhị Sứ Quân",
        hp: 18000, damage: 30, defense: 28, resistance: 35, magicResist: 32,
        speed: 30, reward: 3200, rewardExp: 1600,
        skill: "FINAL BOSS 3 giai đoạn: đánh thường → gọi viện binh → nổi giận đổi hoàn toàn lối đánh.",
        skillCooldown: 0,
        icon: "👹", color: "#6b0f1a",
        description: "Oán khí của cả 12 sứ quân tụ lại thành một, quyết chiến trước cổng Hoa Lư. Trận cuối của chiến dịch.",
        enabled: true,
        phases: [
          { id: "p1", name: "Giai đoạn 1 – Giao tranh", hpFromPct: 100, hpToPct: 66, speedMult: 1, damageMult: 1, enrage: false },
          { id: "p2", name: "Giai đoạn 2 – Viện binh", hpFromPct: 66, hpToPct: 33, speedMult: 1.15, damageMult: 1.25, enrage: false },
          { id: "p3", name: "Giai đoạn 3 – NỔI GIẬN", hpFromPct: 33, hpToPct: 0, speedMult: 1.4, damageMult: 1.6, enrage: true },
        ],
        abilities: [
          { id: "hac_khi", name: "Hắc Khí Hộ Thể", trigger: { type: "interval", seconds: 16 }, cooldown: 16,
            effect: "shield_self", shieldPercent: 22 },
          { id: "am_binh", name: "Triệu Âm Binh", trigger: { type: "hp_below", percent: 66 }, cooldown: 18,
            effect: "summon", summonType: "ma_binh", summonCount: 6 },
          { id: "quy_tot_trieu", name: "Triệu Quỷ Tốt", trigger: { type: "hp_below", percent: 50 }, cooldown: 20,
            effect: "summon", summonType: "quy_tot", summonCount: 6 },
          { id: "huy_thanh", name: "Huỷ Công Trình", trigger: { type: "interval", seconds: 11 }, cooldown: 11,
            effect: "tower_disable", disableRadius: 230, disableSeconds: 4.5 },
          { id: "hoi_khi", name: "Hấp Thụ Oán Khí", trigger: { type: "interval", seconds: 9 }, cooldown: 9,
            effect: "heal_self", healPercent: 3 },
          { id: "cuong_no_cuoi", name: "Nộ Khí Xung Thiên", trigger: { type: "hp_below", percent: 33 }, once: true,
            effect: "self_buff", speedBonus: 0.4, damageBonus: 0.5 },
        ],
      },
      /* ------- MINI BOSS (dùng từ Level 3 trở đi, giữa màn) ------- */
      {
        id: "miniboss_son_tac", name: "Mini Boss – Sơn Tặc Đầu Lĩnh",
        hp: 2200, damage: 9, defense: 12, resistance: 16, magicResist: 10,
        speed: 44, reward: 260, rewardExp: 120,
        skill: "Cướp đường: tăng tốc mạnh khi máu thấp.",
        skillCooldown: 0,
        icon: "🪓", color: "#7a4a1f",
        description: "Đầu lĩnh sơn tặc chặn đường núi, xuất hiện giữa màn.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          { id: "cuop_duong", name: "Cướp Đường", trigger: { type: "hp_below", percent: 45 }, once: true,
            effect: "self_buff", speedBonus: 0.45, damageBonus: 0.1 },
        ],
      },
      {
        id: "miniboss_ky_tuong", name: "Mini Boss – Kỵ Tướng Tiên Phong",
        hp: 3400, damage: 12, defense: 15, resistance: 20, magicResist: 14,
        speed: 48, reward: 380, rewardExp: 180,
        skill: "Xung phong: triệu kỵ binh và phá công trình quanh mình.",
        skillCooldown: 0,
        icon: "🐎", color: "#4a3a7a",
        description: "Kỵ tướng dẫn đầu mũi đột kích, xuất hiện trước đợt Boss.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          { id: "xung_phong", name: "Xung Phong", trigger: { type: "hp_below", percent: 55 }, cooldown: 20,
            effect: "summon", summonType: "ky_binh", summonCount: 4 },
          { id: "dap_pha", name: "Đạp Phá", trigger: { type: "interval", seconds: 16 }, cooldown: 16,
            effect: "tower_disable", disableRadius: 130, disableSeconds: 2.5 },
        ],
      },
      {
        id: "miniboss_chien_than", name: "Mini Boss – Chiến Thần Vây Thành",
        hp: 5200, damage: 16, defense: 20, resistance: 24, magicResist: 20,
        speed: 36, reward: 520, rewardExp: 250,
        skill: "Vây thành: tự bọc giáp và vô hiệu hoá công trình.",
        skillCooldown: 0,
        icon: "🛡️", color: "#2f4a5a",
        description: "Chiến thần chỉ huy vòng vây, dày giáp và khó hạ.",
        enabled: true,
        phases: defaultBossPhases(),
        abilities: [
          { id: "giap_tran", name: "Giáp Trận", trigger: { type: "interval", seconds: 17 }, cooldown: 17,
            effect: "shield_self", shieldPercent: 20 },
          { id: "vay_ham", name: "Vây Hãm", trigger: { type: "interval", seconds: 14 }, cooldown: 14,
            effect: "tower_disable", disableRadius: 160, disableSeconds: 3 },
        ],
      },
    ];
  }

  /* ---------------------------------------------------------
     ĐỊA HÌNH BẢN ĐỒ (Giai đoạn 4)
     Mỗi màn có một "theme" quyết định bảng màu nền + loại chướng ngại
     vật, và một danh sách chướng ngại vật (obstacles) THẬT được vẽ trên
     canvas. Chướng ngại vật không nằm đè lên đường đi hay ô xây tháp -
     chúng thu hẹp không gian nhìn và định hình chiến trường.
     --------------------------------------------------------- */
  const STAGE_THEMES = {
    hoa_lu: "karst",      // núi đá vôi Ninh Bình
    dai_la: "citadel",    // thành luỹ gạch
    bach_dang: "river",   // sông nước, bãi cọc
    chi_lang: "mountain", // ải núi hiểm trở
    binh_lo: "river",
    thang_long: "citadel",
    co_loa: "citadel",
    sieu_loai: "field",   // đồng bằng, luỹ tre
    tong_tien_cong: "field",  // đồng bằng trống trải, nhiều mũi tiến công
    quyet_chien_hoa_lu: "karst", // trở về Hoa Lư cho trận quyết chiến cuối
  };

  /* ---------------------------------------------------------
     GIAI ĐOẠN 6 - CHIẾN DỊCH 10 LEVEL, WAVE CÓ DIỄN BIẾN
     Mỗi Level có số Wave riêng, TĂNG DẦN theo thứ tự màn:
       L1=10, L2=12, L3=14, L4=15, L5=16, L6=18, L7=20, L8=20, L9=22, L10=25
     Các đợt do người viết tay (có `warning`, waveType đặc biệt) được GIỮ
     NGUYÊN. Phần còn thiếu được sinh thêm theo một kịch bản có DIỄN BIẾN
     thật sự (quân thường -> cung thủ -> kỵ binh -> hỗn hợp -> tank ->
     swarm -> Mini Boss -> Boss), chứ không phải chỉ tăng HP.
     Kết quả được LƯU vào collection "stages" nên Admin sửa lại được.
     --------------------------------------------------------- */
  const STAGE_WAVE_TARGET = {
    hoa_lu: 10, dai_la: 12, bach_dang: 14, chi_lang: 15, binh_lo: 16,
    thang_long: 18, co_loa: 20, sieu_loai: 20,
    tong_tien_cong: 22, quyet_chien_hoa_lu: 25,
  };

  /* Bể quân địch dùng được theo độ khó của màn. */
  function enemyPoolFor(order) {
    const basic = ["quan_su_quan", "tho_phi"];
    const fast = ["ky_binh"];
    const tank = ["truong_giap"];
    const ranged = ["cung_thu_dich"];
    const support = [];
    const special = [];
    if (order >= 3) { fast.push("dieu_hau"); support.push("thay_mo"); tank.push("khien_chan"); }
    if (order >= 4) { tank.push("thiet_ky"); ranged.push("cung_no_tong"); special.push("tuong_giac"); }
    if (order >= 5) { special.push("quy_tot"); }
    if (order >= 6) { special.push("ma_binh"); }
    return { basic, fast, tank, ranged, support, special };
  }

  /* Mini Boss dùng cho màn thứ `order` (từ Level 3 trở đi). */
  function miniBossFor(order) {
    if (order < 3) return null;
    if (order <= 4) return "miniboss_son_tac";
    if (order <= 7) return "miniboss_ky_tuong";
    return "miniboss_chien_than";
  }

  /* Sinh một đợt quân có "diễn biến" tại vị trí `i` trên tổng `total` đợt. */
  function makeWave(stageOrder, i, total, rnd) {
    const p = enemyPoolFor(stageOrder);
    const t = total > 1 ? i / (total - 1) : 0;           // 0 -> 1 theo tiến độ màn
    const scale = 1 + t * 1.1 + (stageOrder - 1) * 0.12; // số lượng tăng dần
    const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
    const n = (base) => Math.max(3, Math.round(base * scale));
    const kind = i % 7;

    switch (kind) {
      case 0:
        return { groups: [{ type: pick(p.basic), count: n(6), interval: 0.7 }] };
      case 1:
        return { warning: "⚠ CUNG THỦ! Địch bắn trả từ xa, hãy dồn sát thương sớm.",
          groups: [{ type: pick(p.ranged), count: n(5), interval: 0.6 },
                   { type: pick(p.basic), count: n(4), interval: 0.7 }] };
      case 2:
        return { waveType: "fast", warning: "⚠ ĐỢT NHANH! Kỵ binh phi nước đại.",
          groups: [{ type: pick(p.fast), count: n(7), interval: 0.4, speedMultiplier: 1.2 }] };
      case 3:
        return { groups: [{ type: pick(p.tank), count: n(5), interval: 0.75 },
                          { type: pick(p.ranged), count: n(4), interval: 0.6 },
                          { type: pick(p.fast), count: n(4), interval: 0.5 }] };
      case 4:
        return { waveType: "armor", warning: "⚠ ĐỢT THIẾT GIÁP! Giáp dày – hãy dùng tháp phép hoặc xuyên giáp.",
          groups: [{ type: pick(p.tank), count: n(6), interval: 0.6, armorBonus: 3 + Math.floor(stageOrder / 2) }] };
      case 5: {
        const g = [{ type: pick(p.basic), count: n(11), interval: 0.28, hpMultiplier: 0.7 }];
        if (p.support.length) g.push({ type: pick(p.support), count: 2, interval: 1.1 });
        return { waveType: "swarm", warning: "⚠ ĐỢT QUÂN ĐÔNG! Số lượng áp đảo.", groups: g };
      }
      default: {
        const g = [{ type: pick(p.tank), count: n(4), interval: 0.7 },
                   { type: pick(p.fast), count: n(5), interval: 0.45 }];
        if (p.special.length) g.push({ type: pick(p.special), count: Math.max(2, Math.round(n(2) * 0.5)), interval: 0.9 });
        return { warning: "⚠ QUÂN HỖN HỢP! Nhiều loại quân cùng tiến công.", groups: g };
      }
    }
  }

  /* Mở rộng danh sách đợt của một màn lên đúng `target` đợt:
     giữ nguyên các đợt viết tay, chèn Mini Boss, đặt Boss ở đợt cuối. */
  function expandStageWaves(stage, target) {
    const waves = Array.isArray(stage.waves) ? stage.waves.slice() : [];
    if (!target || waves.length >= target) return waves;

    // tách đợt Boss ra khỏi danh sách (luôn là đợt cuối cùng)
    let bossWave = null;
    for (let i = waves.length - 1; i >= 0; i--) {
      const hasBoss = (waves[i].groups || []).some((g) => g.boss);
      if (hasBoss) { bossWave = waves.splice(i, 1)[0]; break; }
    }

    const order = stage.order || 1;
    const rnd = seededRandom("waves:" + stage.id);
    const bodyTarget = target - (bossWave ? 1 : 0) - (miniBossFor(order) ? 1 : 0);
    let i = waves.length;
    while (waves.length < bodyTarget) {
      waves.push(makeWave(order, i, bodyTarget, rnd));
      i++;
    }

    // Mini Boss: đặt ở khoảng 65% chặng đường, ngay trước nhóm đợt cuối
    const miniId = miniBossFor(order);
    if (miniId) {
      const at = Math.max(2, Math.floor(waves.length * 0.65));
      const p = enemyPoolFor(order);
      waves.splice(at, 0, {
        waveType: "miniboss",
        warning: "⚠ MINI BOSS XUẤT HIỆN! Hãy dồn hoả lực trước khi hắn tới thành.",
        groups: [
          { type: p.tank[0], count: 6 + order, interval: 0.6 },
          { boss: miniId },
        ],
      });
    }

    if (bossWave) waves.push(bossWave);
    return waves;
  }

  const THEME_OBSTACLES = {
    karst: ["rock", "rock", "tree"],
    citadel: ["wall", "rock", "banner"],
    river: ["water", "stake", "water"],
    mountain: ["rock", "rock", "wall"],
    field: ["tree", "tree", "banner"],
    plain: ["rock", "tree"],
  };

  /* PRNG tất định theo id màn: cùng một màn luôn cho ra cùng một địa hình,
     không bị "nhảy múa" mỗi lần tải lại trang. */
  function seededRandom(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function distToSegment(px, py, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = px - a.x, wy = py - a.y;
    const len2 = vx * vx + vy * vy;
    let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + vx * t, cy = a.y + vy * t;
    return Math.hypot(px - cx, py - cy);
  }

  /* Sinh chướng ngại vật cho một màn: thử ngẫu nhiên (có hạt giống) các vị
     trí, loại bỏ mọi vị trí quá gần ĐƯỜNG ĐI, Ô XÂY THÁP, THÀNH hoặc một
     chướng ngại vật khác. Nhờ vậy địa hình không bao giờ che mất lối chơi. */
  function generateObstacles(stage, count) {
    const theme = stage.theme || STAGE_THEMES[stage.id] || "plain";
    const kinds = THEME_OBSTACLES[theme] || THEME_OBSTACLES.plain;
    const rnd = seededRandom("obstacles:" + stage.id);
    const path = stage.path || [];
    const spots = stage.buildSpots || [];
    const castle = stage.castle || { x: -999, y: -999 };
    const out = [];
    const want = count || 14;
    let tries = 0;
    while (out.length < want && tries < 600) {
      tries++;
      const x = 40 + rnd() * 880;
      const y = 40 + rnd() * 460;
      const size = 16 + rnd() * 22;
      let ok = true;
      for (let i = 0; i < path.length - 1 && ok; i++) {
        if (distToSegment(x, y, path[i], path[i + 1]) < size + 30) ok = false;
      }
      for (const sp of spots) if (ok && Math.hypot(sp.x - x, sp.y - y) < size + 34) ok = false;
      if (ok && Math.hypot(castle.x - x, castle.y - y) < size + 70) ok = false;
      for (const o of out) if (ok && Math.hypot(o.x - x, o.y - y) < size + o.size + 10) ok = false;
      if (!ok) continue;
      out.push({ type: kinds[Math.floor(rnd() * kinds.length)], x: Math.round(x), y: Math.round(y), size: Math.round(size) });
    }
    return out;
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
          { groups: [{ type: "ky_binh", count: 8, interval: 0.5 }, { type: "cung_thu_dich", count: 4, interval: 0.7 }, { type: "tho_phi", count: 3, interval: 0.6 }] },
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
          { warning: "⚠ ĐỊCH BAY! Diều hâu trinh sát bay thẳng tới thành, bỏ qua đường bộ.",
            groups: [{ type: "truong_giap", count: 8, interval: 0.7 }, { type: "cung_thu_dich", count: 5, interval: 0.6 }, { type: "dieu_hau", count: 3, interval: 1.1 }] },
          { groups: [{ type: "ky_binh", count: 10, interval: 0.45 }, { type: "truong_giap", count: 6, interval: 0.75 }] },
          { waveType: "elite", warning: "⚠ ĐỢT TINH NHUỆ! Tướng giặc dẫn đầu được tăng cường.",
            groups: [{ type: "tuong_giac", count: 2, interval: 1.2, eliteCount: 2 }, { type: "truong_giap", count: 6, interval: 0.6 }] },
          { groups: [{ type: "cung_thu_dich", count: 10, interval: 0.5 }, { type: "ky_binh", count: 10, interval: 0.45 }, { type: "khien_chan", count: 4, interval: 0.9 }] },
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
          { warning: "⚠ CÓ THẦY MO! Hắn hồi máu cho đồng đội - hạ hắn trước.",
            groups: [{ type: "truong_giap", count: 12, interval: 0.5 }, { type: "cung_thu_dich", count: 8, interval: 0.45 }, { type: "thay_mo", count: 2, interval: 1.2 }] },
          { groups: [{ type: "tuong_giac", count: 4, interval: 0.8 }, { type: "truong_giap", count: 10, interval: 0.4 }] },
          { groups: [{ type: "ky_binh", count: 14, interval: 0.35, speedMultiplier: 1.2 }, { type: "cung_thu_dich", count: 8, interval: 0.5 }] },
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
          { groups: [{ type: "cung_no_tong", count: 8, interval: 0.6 }, { type: "ky_binh", count: 10, interval: 0.4 }, { type: "ma_binh", count: 4, interval: 0.9 }] },
          { warning: "⚠ PHỤC KÍCH! Tướng giặc bất ngờ xuất hiện giữa trận.",
            groups: [{ type: "thiet_ky", count: 6, interval: 0.7 }, { type: "tuong_giac", count: 4, interval: 0.9, delay: 6 }] },
          { groups: [{ type: "cung_no_tong", count: 10, interval: 0.5 }, { type: "thiet_ky", count: 8, interval: 0.55 }, { type: "dieu_hau", count: 4, interval: 0.8 }] },
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
          { warning: "⚠ QUỶ TỐT! Bị hạ sẽ tách đôi tại chỗ.",
            groups: [{ type: "thiet_ky", count: 8, interval: 0.6 }, { type: "cung_thu_dich", count: 8, interval: 0.5 }, { type: "quy_tot", count: 6, interval: 0.8 }] },
          { groups: [{ type: "tuong_giac", count: 4, interval: 0.8 }, { type: "cung_no_tong", count: 10, interval: 0.45 }] },
          { groups: [{ type: "thiet_ky", count: 10, interval: 0.5 }, { type: "ky_binh", count: 12, interval: 0.4 }, { type: "thay_mo", count: 3, interval: 1.0 }, { type: "khien_chan", count: 4, interval: 0.8 }] },
          { groups: [{ type: "tuong_giac", count: 5, interval: 0.75 }, { type: "cung_no_tong", count: 12, interval: 0.4 }] },
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
          { groups: [{ type: "thiet_ky", count: 12, interval: 0.5 }, { type: "cung_no_tong", count: 12, interval: 0.4 }, { type: "ma_binh", count: 5, interval: 0.8 }, { type: "dieu_hau", count: 4, interval: 0.8 }] },
          { groups: [{ type: "tuong_giac", count: 6, interval: 0.7 }, { type: "thiet_ky", count: 10, interval: 0.45 }] },
          { waveType: "survival", surviveSeconds: 30, warning: "⚠ SỐNG SÓT 30 GIÂY! Quân địch sẽ liên tục kéo đến.",
            groups: [{ type: "truong_giap", count: 4, interval: 0.6 }, { type: "cung_no_tong", count: 4, interval: 0.6 }] },
          { groups: [{ type: "thiet_ky", count: 12, interval: 0.45 }, { type: "tuong_giac", count: 5, interval: 0.7 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO TỐI HẬU: ĐẠI TƯỚNG XÂM LĂNG XUẤT HIỆN!",
            groups: [{ type: "thiet_ky", count: 14, interval: 0.4 }, { type: "tuong_giac", count: 6, interval: 0.6 }, { boss: "boss_giac_phuong_bac" }] },
        ],
      },
      {
        id: "co_loa", order: 7, name: "Thành Cổ Loa",
        mapName: "Cổ Loa cửu trùng thành",
        description: "Sứ quân Nguyễn Siêu cố thủ trong toà thành cổ hình xoáy trôn ốc, không chịu quy phục.",
        background: "co_loa",
        difficulty: 7,
        unlockCondition: { type: "stage_cleared", stageId: "thang_long" },
        rewardGold: 420, rewardExp: 230,
        enabled: true,
        path: [
          { x: -40, y: 300 }, { x: 160, y: 300 }, { x: 160, y: 120 },
          { x: 380, y: 120 }, { x: 380, y: 420 }, { x: 580, y: 420 },
          { x: 580, y: 200 }, { x: 380, y: 200 }, { x: 760, y: 200 },
          { x: 760, y: 340 }, { x: 900, y: 340 },
        ],
        castle: { x: 930, y: 340 },
        buildSpots: [
          { x: 90, y: 210 }, { x: 270, y: 120 }, { x: 270, y: 420 },
          { x: 470, y: 320 }, { x: 470, y: 120 }, { x: 660, y: 260 },
          { x: 660, y: 420 }, { x: 830, y: 260 }, { x: 830, y: 420 },
        ],
        waves: [
          { groups: [{ type: "truong_giap", count: 12, interval: 0.5 }] },
          { groups: [{ type: "cung_no_tong", count: 10, interval: 0.5 }, { type: "ky_binh", count: 10, interval: 0.4 }] },
          { waveType: "armor", warning: "⚠ ĐỢT THIẾT GIÁP! Tường thành Cổ Loa vững chắc tiếp sức cho địch.",
            groups: [{ type: "truong_giap", count: 14, interval: 0.4, armorBonus: 5 }, { type: "thiet_ky", count: 6, interval: 0.6, armorBonus: 5 }] },
          { warning: "⚠ PHỤC KÍCH! Địch phục sẵn trong các vòng thành xoáy ốc.",
            groups: [{ type: "cung_no_tong", count: 10, interval: 0.45 }, { type: "tuong_giac", count: 3, interval: 0.9, delay: 5 }] },
          { waveType: "elite", warning: "⚠ ĐỢT TINH NHUỆ! Cấm quân của Sứ Quân được tăng cường.",
            groups: [{ type: "tuong_giac", count: 3, interval: 1.0, eliteCount: 3 }, { type: "thiet_ky", count: 8, interval: 0.5 }] },
          { groups: [{ type: "thiet_ky", count: 14, interval: 0.4 }, { type: "cung_no_tong", count: 12, interval: 0.4 }, { type: "quy_tot", count: 8, interval: 0.6 }, { type: "thay_mo", count: 3, interval: 1.0 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO: SỨ QUÂN NGUYỄN SIÊU XUẤT HIỆN!",
            groups: [{ type: "truong_giap", count: 12, interval: 0.4 }, { type: "thiet_ky", count: 10, interval: 0.45 }, { boss: "boss_nguyen_sieu" }] },
        ],
      },
      {
        id: "sieu_loai", order: 8, name: "Siêu Loại",
        mapName: "Chiến luỹ Siêu Loại",
        description: "Trận đánh cuối cùng: sứ quân Đỗ Cảnh Thạc gục ngã, khép lại loạn 12 sứ quân, mở ra Đại Cồ Việt thống nhất.",
        background: "sieu_loai",
        difficulty: 8,
        unlockCondition: { type: "stage_cleared", stageId: "co_loa" },
        rewardGold: 550, rewardExp: 300,
        enabled: true,
        path: [
          { x: -40, y: 120 }, { x: 200, y: 120 }, { x: 200, y: 440 },
          { x: 420, y: 440 }, { x: 420, y: 80 }, { x: 620, y: 80 },
          { x: 620, y: 300 }, { x: 440, y: 300 }, { x: 800, y: 300 },
          { x: 800, y: 460 }, { x: 900, y: 460 },
        ],
        castle: { x: 930, y: 460 },
        buildSpots: [
          { x: 90, y: 280 }, { x: 310, y: 120 }, { x: 310, y: 440 },
          { x: 520, y: 260 }, { x: 520, y: 80 }, { x: 620, y: 190 },
          { x: 710, y: 300 }, { x: 710, y: 460 }, { x: 850, y: 380 },
        ],
        waves: [
          { groups: [{ type: "thiet_ky", count: 14, interval: 0.4 }] },
          { waveType: "swarm", warning: "⚠ ĐỢT QUÂN ĐÔNG! Tàn quân sứ quân tràn tới từ mọi phía.",
            groups: [{ type: "quan_su_quan", count: 24, interval: 0.25, hpMultiplier: 0.7 }] },
          { groups: [{ type: "cung_no_tong", count: 14, interval: 0.4 }, { type: "tuong_giac", count: 4, interval: 0.8 }, { type: "ma_binh", count: 6, interval: 0.7 }, { type: "khien_chan", count: 5, interval: 0.8 }, { type: "dieu_hau", count: 5, interval: 0.7 }] },
          { warning: "⚠ PHỤC KÍCH! Kỵ binh vòng ra sau lưng.",
            groups: [{ type: "thiet_ky", count: 12, interval: 0.45 }, { type: "ky_binh", count: 12, interval: 0.35, delay: 5 }] },
          { waveType: "fast", warning: "⚠ ĐỢT NHANH! Kỵ binh tinh nhuệ phi nước đại.",
            groups: [{ type: "ky_binh", count: 16, interval: 0.3, speedMultiplier: 1.3 }, { type: "tuong_giac", count: 3, interval: 0.9 }] },
          { waveType: "elite", warning: "⚠ ĐỢT TINH NHUỆ! Thân binh của Sứ Quân xuất trận.",
            groups: [{ type: "tuong_giac", count: 4, interval: 0.85, eliteCount: 4 }, { type: "thiet_ky", count: 10, interval: 0.45 }] },
          { waveType: "survival", surviveSeconds: 35, warning: "⚠ SỐNG SÓT 35 GIÂY! Đây là đợt tổng phản công cuối cùng.",
            groups: [{ type: "thiet_ky", count: 5, interval: 0.5 }, { type: "cung_no_tong", count: 5, interval: 0.5 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO TỐI HẬU: SỨ QUÂN ĐỖ CẢNH THẠC XUẤT HIỆN!",
            groups: [{ type: "thiet_ky", count: 16, interval: 0.35 }, { type: "tuong_giac", count: 7, interval: 0.55 }, { boss: "boss_do_canh_thac" }] },
        ],
      },
      /* ============ LEVEL 9 – TỔNG TIẾN CÔNG ============ */
      {
        id: "tong_tien_cong", order: 9, name: "Tổng tiến công",
        mapName: "Cánh đồng Trường Yên",
        description: "Tàn dư các sứ quân hợp binh mở cuộc tổng tiến công vào vùng đệm trước Hoa Lư. Đường tiến quân trải rộng, phải giữ nhiều mũi cùng lúc.",
        background: "tong_tien_cong",
        difficulty: 9,
        unlockCondition: { type: "stage_cleared", stageId: "sieu_loai" },
        rewardGold: 700, rewardExp: 400,
        enabled: true,
        path: [
          { x: -40, y: 70 }, { x: 140, y: 70 }, { x: 140, y: 250 },
          { x: 330, y: 250 }, { x: 330, y: 60 }, { x: 520, y: 60 },
          { x: 520, y: 470 }, { x: 700, y: 470 }, { x: 700, y: 170 },
          { x: 860, y: 170 }, { x: 860, y: 380 }, { x: 920, y: 380 },
        ],
        castle: { x: 930, y: 380 },
        buildSpots: [
          { x: 70, y: 180 }, { x: 240, y: 70 }, { x: 240, y: 250 },
          { x: 430, y: 60 }, { x: 430, y: 300 }, { x: 430, y: 470 },
          { x: 610, y: 470 }, { x: 610, y: 170 }, { x: 780, y: 170 },
          { x: 780, y: 380 }, { x: 880, y: 270 },
        ],
        waves: [
          { groups: [{ type: "thiet_ky", count: 14, interval: 0.4 }, { type: "cung_no_tong", count: 10, interval: 0.5 }] },
          { waveType: "swarm", warning: "⚠ BIỂN NGƯỜI! Tàn quân bốn phương đổ về.",
            groups: [{ type: "quan_su_quan", count: 28, interval: 0.22, hpMultiplier: 0.75 }, { type: "tho_phi", count: 10, interval: 0.4 }] },
          { waveType: "elite", warning: "⚠ ĐỢT TINH NHUỆ! Thân binh của các sứ quân hợp lại.",
            groups: [{ type: "tuong_giac", count: 5, interval: 0.8, eliteCount: 5 }, { type: "thiet_ky", count: 10, interval: 0.45 }] },
          { waveType: "survival", surviveSeconds: 40, warning: "⚠ SỐNG SÓT 40 GIÂY! Đây là mũi tiến công liên tục.",
            groups: [{ type: "thiet_ky", count: 6, interval: 0.5 }, { type: "cung_no_tong", count: 6, interval: 0.5 }, { type: "ma_binh", count: 4, interval: 0.7 }] },
          { waveType: "boss", warning: "⚠ CẢNH BÁO: NGUYÊN SOÁI LIÊU ĐÔNG MỞ TỔNG TIẾN CÔNG!",
            groups: [{ type: "thiet_ky", count: 18, interval: 0.32 }, { type: "tuong_giac", count: 8, interval: 0.5 }, { boss: "boss_tong_tien_cong" }] },
        ],
      },
      /* ============ LEVEL 10 – QUYẾT CHIẾN HOA LƯ ============ */
      {
        id: "quyet_chien_hoa_lu", order: 10, name: "Quyết chiến Hoa Lư",
        mapName: "Cổng thành Hoa Lư",
        description: "Trận cuối cùng ngay trước cổng kinh đô. Oán khí của cả 12 sứ quân tụ thành Ma Vương. Giữ được Hoa Lư là giữ được Đại Cồ Việt.",
        background: "quyet_chien_hoa_lu",
        difficulty: 10,
        unlockCondition: { type: "stage_cleared", stageId: "tong_tien_cong" },
        rewardGold: 1000, rewardExp: 600,
        enabled: true,
        path: [
          { x: -40, y: 270 }, { x: 120, y: 270 }, { x: 120, y: 80 },
          { x: 300, y: 80 }, { x: 300, y: 450 }, { x: 470, y: 450 },
          { x: 470, y: 130 }, { x: 640, y: 130 }, { x: 640, y: 400 },
          { x: 800, y: 400 }, { x: 800, y: 240 }, { x: 920, y: 240 },
        ],
        castle: { x: 930, y: 240 },
        buildSpots: [
          { x: 60, y: 160 }, { x: 210, y: 80 }, { x: 210, y: 380 },
          { x: 390, y: 200 }, { x: 390, y: 450 }, { x: 560, y: 130 },
          { x: 560, y: 320 }, { x: 720, y: 400 }, { x: 720, y: 240 },
          { x: 870, y: 120 }, { x: 870, y: 350 },
        ],
        waves: [
          { groups: [{ type: "thiet_ky", count: 16, interval: 0.35 }, { type: "cung_no_tong", count: 12, interval: 0.45 }] },
          { waveType: "armor", warning: "⚠ TRỌNG GIÁP! Đội hình khiên thép tiến sát cổng thành.",
            groups: [{ type: "truong_giap", count: 16, interval: 0.35, armorBonus: 8 }, { type: "khien_chan", count: 8, interval: 0.6, armorBonus: 8 }] },
          { warning: "⚠ ÂM BINH! Ma binh và quỷ tốt tràn lên cùng thầy mo.",
            groups: [{ type: "ma_binh", count: 10, interval: 0.5 }, { type: "quy_tot", count: 10, interval: 0.5 }, { type: "thay_mo", count: 4, interval: 1.0 }] },
          { waveType: "elite", warning: "⚠ ĐỢT TINH NHUỆ CUỐI! Toàn bộ tướng lĩnh còn lại xuất trận.",
            groups: [{ type: "tuong_giac", count: 6, interval: 0.75, eliteCount: 6 }, { type: "thiet_ky", count: 12, interval: 0.4 }] },
          { waveType: "survival", surviveSeconds: 45, warning: "⚠ SỐNG SÓT 45 GIÂY! Giữ vững cho tới khi Ma Vương lộ diện.",
            groups: [{ type: "thiet_ky", count: 6, interval: 0.45 }, { type: "cung_no_tong", count: 6, interval: 0.45 }, { type: "dieu_hau", count: 4, interval: 0.8 }] },
          { waveType: "boss", warning: "⚠⚠ QUYẾT CHIẾN! MA VƯƠNG THẬP NHỊ SỨ QUÂN GIÁNG LÂM!",
            groups: [{ type: "thiet_ky", count: 20, interval: 0.3 }, { type: "tuong_giac", count: 10, interval: 0.45 }, { type: "ma_binh", count: 10, interval: 0.4 }, { boss: "boss_quyet_chien" }] },
        ],
      },
    ];
    // Priority 5 (Score+Combo+3-Sao): gắn starConditions + targetTime THẬT
    // cho từng màn, tăng dần độ khó theo "order", thay vì để trống rồi
    // chỉ hiển thị UI giả (mục LXI - cấm "giả" tính năng).
    return stages.map((s0) => {
      const s = Object.assign({}, s0, { theme: s0.theme || STAGE_THEMES[s0.id] || "plain" });
      const waves = expandStageWaves(s, STAGE_WAVE_TARGET[s.id]);
      return {
      ...s,
      waves,
      miniBossId: miniBossFor(s.order || 1),
      obstacles: s.obstacles || generateObstacles(s, 10 + (s.order || 1)),
      targetTime: s.targetTime || Math.round(waves.length * 22 + (s.order || 1) * 8),
      starConditions: s.starConditions || {
        oneStar: true,
        twoStarCastleHpPercent: 45,
        threeStarCastleHpPercent: 80,
        threeStarScore: 500 + (s.order || 1) * 350,
      },
      };
    });
  }

  /* ---------------------------------------------------------
     TƯỚNG ĐẠI CỒ VIỆT (Giai đoạn 4)
     Tướng giờ THỰC SỰ RA TRẬN: đứng trên bản đồ, tự đánh địch trong tầm,
     có Kỹ năng CHỦ ĐỘNG (nút ✨ / phím S) và Kỹ năng BỊ ĐỘNG (passive)
     luôn có hiệu lực. Cả hai đều mạnh lên theo Level tướng, và kỹ năng
     chủ động còn có thể NÂNG CẤP riêng bằng vàng bền vững.
       hp/damage/defense - chỉ số cộng cho THÀNH và cho MỌI THÁP (bị động nền)
       heroDamage/heroRange/heroFireRate/heroDamageType - chỉ số đánh nhau
         của bản thân tướng trên bản đồ
       passive - kỹ năng bị động: { id, name, description, type, value }
         type: "tower_damage" | "tower_range" | "tower_firerate" |
               "gold_bonus" | "castle_regen" | "slow_aura" | "crit_bonus"
     --------------------------------------------------------- */
  function defaultHeroes() {
    return [
      {
        id: "dinh_bo_linh", name: "Đinh Bộ Lĩnh", nameVi: "Đinh Bộ Lĩnh",
        description: "Người dẹp loạn 12 sứ quân, lập nên nhà nước Đại Cồ Việt.",
        icon: "👑", image: "",
        hp: 40, damage: 12, defense: 1,
        heroDamage: 26, heroRange: 150, heroFireRate: 0.9, heroDamageType: "physical",
        passive: { id: "co_lau_tap_tran", name: "Cờ Lau Tập Trận", type: "tower_damage", value: 0.08,
          description: "Mọi tháp được +8% sát thương mỗi cấp tướng." },
        level: 1, maxLevel: 5,
        expToUpgrade: 100,
        unlockCost: 0,
        upgradeCost: 80,
        skillId: "trong_tran", skillMaxLevel: 5, skillUpgradeCost: 120,
        enabled: true,
      },
      {
        id: "le_hoan", name: "Lê Hoàn", nameVi: "Lê Hoàn",
        description: "Thập đạo tướng quân, đánh tan quân Tống trên sông Bạch Đằng.",
        icon: "⚔️", image: "",
        hp: 25, damage: 20, defense: 0,
        heroDamage: 34, heroRange: 140, heroFireRate: 1.0, heroDamageType: "physical",
        passive: { id: "thap_dao_tuong_quan", name: "Thập Đạo Tướng Quân", type: "tower_firerate", value: 0.06,
          description: "Mọi tháp được +6% tốc bắn mỗi cấp tướng." },
        level: 1, maxLevel: 5,
        expToUpgrade: 120,
        unlockCost: 250,
        upgradeCost: 100,
        skillId: "mua_ten", skillMaxLevel: 5, skillUpgradeCost: 140,
        enabled: true,
      },
      {
        id: "ngo_quyen", name: "Ngô Quyền", nameVi: "Ngô Quyền",
        description: "Anh hùng dân tộc, đại thắng quân Nam Hán trên sông Bạch Đằng năm 938.",
        icon: "🌊", image: "",
        hp: 35, damage: 15, defense: 2,
        heroDamage: 28, heroRange: 160, heroFireRate: 0.8, heroDamageType: "magic",
        passive: { id: "bai_coc_ngam", name: "Bãi Cọc Ngầm", type: "slow_aura", value: 0.05,
          description: "Địch quanh tướng bị làm chậm thêm 5% mỗi cấp tướng." },
        level: 1, maxLevel: 5,
        expToUpgrade: 140,
        unlockCost: 300,
        upgradeCost: 110,
        skillId: "coc_go_bach_dang", skillMaxLevel: 5, skillUpgradeCost: 150,
        enabled: true,
      },
      {
        id: "duong_van_nga", name: "Dương Vân Nga", nameVi: "Dương Vân Nga",
        description: "Thái hậu nhiếp chính, cầu nối giữa hai triều Đinh – Tiền Lê, an dân giữ nước.",
        icon: "👸", image: "",
        hp: 20, damage: 5, defense: 3,
        heroDamage: 18, heroRange: 150, heroFireRate: 0.8, heroDamageType: "magic",
        passive: { id: "an_dan_ho_quoc", name: "An Dân Hộ Quốc", type: "castle_regen", value: 0.5,
          description: "Thành tự hồi 0,5 HP mỗi đợt cho mỗi cấp tướng." },
        level: 1, maxLevel: 5,
        expToUpgrade: 130,
        unlockCost: 200,
        upgradeCost: 90,
        skillId: "an_dan", skillMaxLevel: 5, skillUpgradeCost: 130,
        enabled: true,
      },
      {
        id: "dinh_lien", name: "Đinh Liễn", nameVi: "Đinh Liễn",
        description: "Nam Việt Vương, con trưởng Đinh Bộ Lĩnh, xông pha khắp các trận tiền.",
        icon: "🗡️", image: "",
        hp: 15, damage: 25, defense: 0,
        heroDamage: 40, heroRange: 130, heroFireRate: 1.1, heroDamageType: "physical",
        passive: { id: "xung_tran", name: "Tiên Phong Xung Trận", type: "crit_bonus", value: 3,
          description: "Mọi tháp được +3% tỉ lệ chí mạng mỗi cấp tướng." },
        level: 1, maxLevel: 5,
        expToUpgrade: 150,
        unlockCost: 220,
        upgradeCost: 95,
        skillId: "xung_phong", skillMaxLevel: 5, skillUpgradeCost: 145,
        enabled: true,
      },
      {
        id: "nguyen_bac", name: "Nguyễn Bặc", nameVi: "Nguyễn Bặc",
        description: "Định Quốc công, khai quốc công thần trung nghĩa bậc nhất của nhà Đinh.",
        icon: "🛡️", image: "",
        hp: 55, damage: 8, defense: 4,
        heroDamage: 24, heroRange: 125, heroFireRate: 0.9, heroDamageType: "physical",
        passive: { id: "trung_nghia", name: "Trung Nghĩa Vệ Quốc", type: "tower_range", value: 0.05,
          description: "Mọi tháp được +5% tầm bắn mỗi cấp tướng." },
        level: 1, maxLevel: 5,
        expToUpgrade: 160,
        unlockCost: 340,
        upgradeCost: 120,
        skillId: "ho_quoc_tran", skillMaxLevel: 5, skillUpgradeCost: 155,
        enabled: true,
      },
      {
        id: "pham_cu_lang", name: "Phạm Cự Lạng", nameVi: "Phạm Cự Lạng",
        description: "Thái uý thời Tiền Lê, người suy tôn Lê Hoàn lên ngôi để chống Tống.",
        icon: "🥁", image: "",
        hp: 30, damage: 16, defense: 1,
        heroDamage: 30, heroRange: 155, heroFireRate: 0.95, heroDamageType: "physical",
        passive: { id: "quan_luong", name: "Quân Lương Dồi Dào", type: "gold_bonus", value: 0.06,
          description: "Nhận thêm 6% vàng từ mỗi kẻ địch bị hạ, mỗi cấp tướng." },
        level: 1, maxLevel: 5,
        expToUpgrade: 165,
        unlockCost: 380,
        upgradeCost: 125,
        skillId: "sam_set_tran_tien", skillMaxLevel: 5, skillUpgradeCost: 160,
        enabled: true,
      },
    ];
  }

  /* ---------------------------------------------------------
     KỸ NĂNG CHỦ ĐỘNG (Giai đoạn 4)
     effect được game.js thực thi thật:
       damage_all     - sát thương lên toàn bộ địch (theo damageType)
       heal_castle    - hồi HP thành
       buff_attack_speed - tăng tốc bắn mọi tháp trong `duration` giây
       buff_damage    - tăng sát thương mọi tháp trong `duration` giây
       stun_all       - làm choáng toàn bộ địch trong `duration` giây
       shield_castle  - tăng giáp thành (giảm ST nhận) trong `duration` giây
     perLevelBonus: mỗi cấp KỸ NĂNG cộng thêm bao nhiêu % hiệu lực.
     --------------------------------------------------------- */
  function defaultSkills() {
    return [
      {
        id: "hoa_cong", name: "Hoả Công",
        description: "Thiêu đốt toàn bộ quân địch đang trên bản đồ và gây bỏng.",
        icon: "🔥", cooldown: 28, manaCost: 0,
        effect: "damage_all", damage: 45, heal: 0, area: 0, duration: 0,
        damageType: "magic", perLevelBonus: 0.22,
        statusEffect: { type: "burn", value: 8, duration: 4 },
        enabled: true,
      },
      {
        id: "mua_ten", name: "Mưa Tên",
        description: "Một trận mưa tên gây sát thương vật lý diện rộng lên quân địch.",
        icon: "🏹", cooldown: 20, manaCost: 0,
        effect: "damage_all", damage: 25, heal: 0, area: 0, duration: 0,
        damageType: "physical", perLevelBonus: 0.22,
        enabled: true,
      },
      {
        id: "trong_tran", name: "Trống Trận",
        description: "Thúc trống tăng 40% tốc độ bắn cho mọi quân thủ thành trong 8 giây.",
        icon: "🥁", cooldown: 35, manaCost: 0,
        effect: "buff_attack_speed", damage: 0, heal: 0, area: 0, duration: 8, value: 0.4,
        damageType: "physical", perLevelBonus: 0.2,
        enabled: true,
      },
      {
        id: "hoi_phuc_thanh", name: "Hồi Phục Thành",
        description: "Ngay lập tức hồi phục một phần HP của thành.",
        icon: "💗", cooldown: 40, manaCost: 0,
        effect: "heal_castle", damage: 0, heal: 6, area: 0, duration: 0,
        damageType: "physical", perLevelBonus: 0.25,
        enabled: true,
      },
      {
        id: "coc_go_bach_dang", name: "Cọc Gỗ Bạch Đằng",
        description: "Tái hiện kế cọc ngầm: sát thương lớn lên toàn bộ địch và làm chậm chúng.",
        icon: "🌊", cooldown: 30, manaCost: 0,
        effect: "damage_all", damage: 60, heal: 0, area: 0, duration: 0,
        damageType: "physical", perLevelBonus: 0.22,
        statusEffect: { type: "slow", value: 0.5, duration: 3 },
        enabled: true,
      },
      {
        id: "an_dan", name: "An Dân",
        description: "Vỗ về lòng quân, hồi phục đáng kể HP của thành.",
        icon: "👸", cooldown: 45, manaCost: 0,
        effect: "heal_castle", damage: 0, heal: 10, area: 0, duration: 0,
        damageType: "physical", perLevelBonus: 0.25,
        enabled: true,
      },
      {
        id: "xung_phong", name: "Xung Phong",
        description: "Thúc quân xông trận, tăng mạnh tốc độ bắn cho mọi quân thủ thành trong 10 giây.",
        icon: "🗡️", cooldown: 32, manaCost: 0,
        effect: "buff_attack_speed", damage: 0, heal: 0, area: 0, duration: 10, value: 0.5,
        damageType: "physical", perLevelBonus: 0.2,
        enabled: true,
      },
      {
        id: "ho_quoc_tran", name: "Hộ Quốc Trận",
        description: "Dựng thế trận giữ thành: giảm mạnh sát thương thành phải nhận trong 12 giây.",
        icon: "🛡️", cooldown: 40, manaCost: 0,
        effect: "shield_castle", damage: 0, heal: 0, area: 0, duration: 12, value: 4,
        damageType: "physical", perLevelBonus: 0.22,
        enabled: true,
      },
      {
        id: "sam_set_tran_tien", name: "Sấm Sét Trận Tiền",
        description: "Sấm sét giáng xuống làm CHOÁNG toàn bộ quân địch trong 2,5 giây.",
        icon: "⚡", cooldown: 38, manaCost: 0,
        effect: "stun_all", damage: 12, heal: 0, area: 0, duration: 2.5,
        damageType: "magic", perLevelBonus: 0.18,
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

  /* Thành tích (Giai đoạn 3, mục XXX): khác Quest ở chỗ KHÔNG cần "nhận
     thưởng" thủ công - mở khoá là có thưởng luôn, và có màn hình riêng
     🏆 để xem lại toàn bộ huy hiệu đã đạt. condition dùng lại đúng các
     eventType mà game.js đã bắn ra (KILL_COUNT/BOSS_KILL_COUNT/COMBO/
     STAGE_STARS/SCORE/ALL_STAGES_CLEARED/NO_DAMAGE_STAGE_CLEARED/
     TOWER_MAX_LEVEL), được AchievementService (shared/achievement-
     service.js) đánh giá thật, không chỉ hiển thị cho có. */
  function defaultAchievements() {
    return [
      {
        id: "a_kill100", name: "Sát Thù Trăm Trận", icon: "💀",
        description: "Tiêu diệt tổng cộng 100 quân địch.",
        condition: { type: "KILL_COUNT", count: 100 },
        reward: { gold: 80, exp: 40 },
        enabled: true,
      },
      {
        id: "a_boss1", name: "Diệt Trừ Hoạ Lớn", icon: "👹",
        description: "Tiêu diệt 1 Boss bất kỳ.",
        condition: { type: "BOSS_KILL_COUNT", count: 1 },
        reward: { gold: 60, exp: 30 },
        enabled: true,
      },
      {
        id: "a_boss10", name: "Khắc Tinh Của Boss", icon: "🏆",
        description: "Tiêu diệt tổng cộng 10 Boss.",
        condition: { type: "BOSS_KILL_COUNT", count: 10 },
        reward: { gold: 300, exp: 150 },
        enabled: true,
      },
      {
        id: "a_combo20", name: "Vũ Bão", icon: "🔥",
        description: "Đạt Combo x20 trong 1 trận.",
        condition: { type: "COMBO", count: 20 },
        reward: { gold: 100, exp: 50 },
        enabled: true,
      },
      {
        id: "a_3stars", name: "Hoàn Hảo", icon: "⭐",
        description: "Đạt 3 sao ở bất kỳ màn nào.",
        condition: { type: "STAGE_STARS", stars: 3 },
        reward: { gold: 120, exp: 60 },
        enabled: true,
      },
      {
        id: "a_all_stages", name: "Thống Nhất Giang Sơn", icon: "🗺️",
        description: "Hoàn thành tất cả các màn.",
        condition: { type: "ALL_STAGES_CLEARED" },
        reward: { gold: 500, exp: 250 },
        enabled: true,
      },
      {
        id: "a_no_damage", name: "Thành Trì Bất Khả Xâm Phạm", icon: "🏯",
        description: "Hoàn thành 1 màn mà thành không mất một chút HP nào.",
        condition: { type: "NO_DAMAGE_STAGE_CLEARED" },
        reward: { gold: 150, exp: 80 },
        enabled: true,
      },
      {
        id: "a_score10000", name: "Kỳ Tích Một Trận", icon: "🎯",
        description: "Đạt Score từ 10.000 trở lên trong 1 trận.",
        condition: { type: "SCORE", value: 10000 },
        reward: { gold: 200, exp: 100 },
        enabled: true,
      },
      {
        id: "a_tower_max", name: "Đỉnh Cao Công Nghệ", icon: "⬆️",
        description: "Nâng cấp 1 Tower lên Level tối đa.",
        condition: { type: "TOWER_MAX_LEVEL" },
        reward: { gold: 90, exp: 45 },
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
        achievements: {}, // { achievementId: true } - mục XXX
        heroesOwned: ["dinh_bo_linh"],
        heroLevels: { dinh_bo_linh: 1 },
        heroExp: { dinh_bo_linh: 0 }, // EXP riêng của từng tướng (Giai đoạn 3), TÁCH BIỆT với exp người chơi ở trên
        heroSkillLevels: { dinh_bo_linh: 1 }, // cấp KỸ NĂNG chủ động của từng tướng (Giai đoạn 4)
        selectedHero: "dinh_bo_linh",
        questProgress: {},   // { questId: { done:false, claimed:false, progressValue:0 } }
        stats: { totalKills: 0, totalRuns: 0, wins: 0, losses: 0, totalBossKills: 0, towersBuilt: 0, towersSold: 0 },
        settings: { sound: true, sfx: true, music: true, tutorialSeen: false },
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
      achievements: defaultAchievements(),
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

  /* Đảm bảo Thành tích (Giai đoạn 3, mục XXX) có đủ field: collection
     "achievements" (nếu chưa từng tồn tại - vd. cài từ bản v6 trở về
     trước) và player.achievements{}. */
  function ensureAchievementFields() {
    if (!StorageService.has(KEYS.achievements)) {
      StorageService.set(KEYS.achievements, defaultAchievements());
    }
    const players = list("players").map((p) => {
      if (p.achievements !== undefined) return p;
      return Object.assign({}, p, { achievements: {} });
    });
    StorageService.set(KEYS.players, players);
  }

  /* Di trú schemaVersion 6 -> 7 (Giai đoạn 3 - Thành tích thật). */
  function migrateSchemaV6ToV7() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 7) return;
    ensureAchievementFields();
    StorageService.set(KEYS.schemaVersion, 7);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 7: thêm hệ thống Thành tích thật (collection achievements, player.achievements).");
  }

  /* Đảm bảo nội dung "thêm đợt chơi + thêm màn chơi" (yêu cầu trực tiếp
     sau Giai đoạn 3) có mặt: 2 Boss mới, 2 màn mới (Cổ Loa, Siêu Loại),
     và thêm 1 wave cho mỗi màn cũ trước đợt Boss. Với các stage ĐÃ TỒN
     TẠI, chỉ THAY `waves` khi số wave hiện tại còn ÍT HƠN bản mới (tức
     là chưa được vá) - không đụng tới name/description/enabled hay bất
     kỳ field nào khác Admin có thể đã tự sửa. Đây là migration nội
     dung theo yêu cầu cụ thể của người vận hành, không phải fix schema
     đơn thuần, nhưng vẫn giữ nguyên tắc "chỉ thêm, không xoá tuỳ biến". */
  function ensureExpandedCampaignContent() {
    const defaultBossList = defaultBosses();
    const bosses = list("bosses");
    const bossIds = new Set(bosses.map((b) => b.id));
    const newBosses = defaultBossList.filter((b) => !bossIds.has(b.id));
    if (newBosses.length) StorageService.set(KEYS.bosses, bosses.concat(newBosses));

    const defaultStageList = defaultStages();
    const defaultStageById = {};
    for (const s of defaultStageList) defaultStageById[s.id] = s;
    const stages = list("stages");
    const stageIds = new Set(stages.map((s) => s.id));

    const patchedStages = stages.map((s) => {
      const def = defaultStageById[s.id];
      if (!def || !Array.isArray(s.waves) || s.waves.length >= def.waves.length) return s;
      return Object.assign({}, s, { waves: def.waves });
    });
    const newStages = defaultStageList.filter((s) => !stageIds.has(s.id));
    StorageService.set(KEYS.stages, patchedStages.concat(newStages));
  }

  /* Di trú schemaVersion 7 -> 8 (thêm đợt chơi + 2 màn chơi mới). */
  function migrateSchemaV7ToV8() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 8) return;
    ensureExpandedCampaignContent();
    StorageService.set(KEYS.schemaVersion, 8);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 8: thêm 2 màn chơi mới (Cổ Loa, Siêu Loại) + 2 Boss mới + thêm 1 wave cho mỗi màn cũ.");
  }

  /* ---------------------------------------------------------
     DI TRÚ 8 -> 9 (Giai đoạn 4)
     Bổ sung toàn bộ field mới mà engine mới cần, cho dữ liệu người chơi
     CŨ đã lưu trong localStorage từ bản trước:
       - Tháp: damageType, role, targetPriority, upgradeTree, aura*
       - Địch: magicResist, behavior + tham số hành vi
       - Boss: magicResist + kỹ năng mới (shield_self, tower_disable)
       - Màn: theme, obstacles
       - Tướng: chỉ số chiến đấu trên bản đồ + kỹ năng bị động
       - Người chơi: heroSkillLevels, settings.music/sfx
       - Cấu hình: SELL_REFUND_RATE, tốc độ x3, cờ nhạc/SFX
     Nguyên tắc: CHỈ THÊM field còn thiếu, KHÔNG ghi đè giá trị mà người
     chơi hoặc Admin đã tự chỉnh (vd. giá tháp đã sửa tay vẫn được giữ).
     --------------------------------------------------------- */
  function ensureGiaiDoan4Fields() {
    const fillMissing = (item, defaults) => {
      const patch = {};
      for (const k of Object.keys(defaults)) {
        if (item[k] === undefined || item[k] === null) patch[k] = defaults[k];
      }
      return patch;
    };
    const byId = (arr) => { const m = {}; for (const x of arr) m[x.id] = x; return m; };

    /* --- Tháp --- */
    const buildingDefaults = byId(defaultBuildings());
    const buildings = list("buildings");
    const buildingIds = new Set(buildings.map((b) => b.id));
    const patchedBuildings = buildings.map((b) => {
      const def = buildingDefaults[b.id];
      const generic = {
        role: "dps", damageType: "physical", targetPriority: "first",
        upgradeTree: null, isSupport: false,
      };
      return Object.assign({}, b, fillMissing(b, def ? Object.assign({}, generic, def) : generic));
    });
    for (const id of Object.keys(buildingDefaults)) {
      if (!buildingIds.has(id)) patchedBuildings.push(buildingDefaults[id]);
    }
    replaceAll("buildings", patchedBuildings);

    /* --- Quân địch --- */
    const enemyDefaults = byId(defaultEnemies());
    const enemies = list("enemies");
    const enemyIds = new Set(enemies.map((e) => e.id));
    const patchedEnemies = enemies.map((e) => {
      const def = enemyDefaults[e.id];
      const generic = { magicResist: 0, behavior: "normal", description: "" };
      return Object.assign({}, e, fillMissing(e, def ? Object.assign({}, generic, def) : generic));
    });
    for (const id of Object.keys(enemyDefaults)) {
      if (!enemyIds.has(id)) patchedEnemies.push(enemyDefaults[id]);
    }
    replaceAll("enemies", patchedEnemies);

    /* --- Boss --- */
    const bossDefaults = byId(defaultBosses());
    replaceAll("bosses", list("bosses").map((b) => {
      const def = bossDefaults[b.id];
      const patch = fillMissing(b, { magicResist: def ? def.magicResist : Math.round((b.resistance || 0) * 0.8) });
      // bổ sung các kỹ năng mới (shield_self/tower_disable) nếu boss gốc có
      if (def && Array.isArray(def.abilities) && Array.isArray(b.abilities)) {
        const have = new Set(b.abilities.map((a) => a.id));
        const missing = def.abilities.filter((a) => !have.has(a.id));
        if (missing.length) patch.abilities = [...b.abilities, ...missing];
      }
      return Object.assign({}, b, patch);
    }));

    /* --- Màn chơi --- */
    const stageDefaults = byId(defaultStages());
    replaceAll("stages", list("stages").map((s) => {
      const def = stageDefaults[s.id];
      const patch = {};
      if (s.theme === undefined) patch.theme = (def && def.theme) || STAGE_THEMES[s.id] || "plain";
      if (!Array.isArray(s.obstacles) || s.obstacles.length === 0) {
        patch.obstacles = (def && def.obstacles) || generateObstacles(s);
      }
      // các đợt quân mới (dùng loại địch mới) chỉ được áp cho màn gốc chưa bị sửa tay
      if (def && Array.isArray(def.waves) && Array.isArray(s.waves) && def.waves.length === s.waves.length) {
        patch.waves = def.waves;
      }
      return Object.assign({}, s, patch);
    }));

    /* --- Tướng --- */
    const heroDefaults = byId(defaultHeroes());
    replaceAll("heroes", list("heroes").map((h) => {
      const def = heroDefaults[h.id];
      const generic = {
        heroDamage: 24, heroRange: 150, heroFireRate: 0.9, heroDamageType: "physical",
        passive: null, skillMaxLevel: 5, skillUpgradeCost: 130,
      };
      return Object.assign({}, h, fillMissing(h, def ? Object.assign({}, generic, def) : generic));
    }));

    /* --- Kỹ năng --- */
    const skillDefaults = byId(defaultSkills());
    const skills = list("skills");
    const skillIds = new Set(skills.map((k) => k.id));
    const patchedSkills = skills.map((k) => {
      const def = skillDefaults[k.id];
      return Object.assign({}, k, fillMissing(k, def ? Object.assign({ perLevelBonus: 0.22, damageType: "physical" }, def)
        : { perLevelBonus: 0.22, damageType: "physical" }));
    });
    for (const id of Object.keys(skillDefaults)) {
      if (!skillIds.has(id)) patchedSkills.push(skillDefaults[id]);
    }
    replaceAll("skills", patchedSkills);

    /* --- Người chơi --- */
    replaceAll("players", list("players").map((p) => {
      const patch = {};
      if (!p.heroSkillLevels) {
        const lv = {};
        for (const hid of p.heroesOwned || []) lv[hid] = 1;
        patch.heroSkillLevels = lv;
      }
      const st = Object.assign({}, p.settings);
      if (st.music === undefined) st.music = true;
      if (st.sfx === undefined) st.sfx = st.sound !== false;
      patch.settings = st;
      const stats = Object.assign({ totalKills: 0, totalRuns: 0, wins: 0, losses: 0, totalBossKills: 0, towersBuilt: 0, towersSold: 0 }, p.stats);
      patch.stats = stats;
      return Object.assign({}, p, patch);
    }));

    /* --- Cấu hình game --- */
    const cfg = getConfig();
    const defCfg = defaultGameConfig();
    const cfgPatch = {};
    if (cfg.SELL_REFUND_RATE === undefined) cfgPatch.SELL_REFUND_RATE = defCfg.SELL_REFUND_RATE;
    if (cfg.TIDE_CYCLE_SECONDS === undefined) cfgPatch.TIDE_CYCLE_SECONDS = defCfg.TIDE_CYCLE_SECONDS;
    if (!Array.isArray(cfg.speeds) || cfg.speeds.length < 3) cfgPatch.speeds = defCfg.speeds;
    const feat = Object.assign({}, cfg.features);
    const defFeat = defCfg.features;
    for (const k of Object.keys(defFeat)) if (feat[k] === undefined) feat[k] = defFeat[k];
    if (feat.musicEnabled === false && cfg.features && cfg.features.musicEnabled === false) feat.musicEnabled = true; // bản cũ tắt cứng vì chưa có nhạc
    cfgPatch.features = feat;
    setConfig(cfgPatch);
  }

  /* Bổ sung cờ cấu hình Giai đoạn 5 (dựng hình 3D) cho dữ liệu cũ. */
  function ensureGiaiDoan5Fields() {
    const cfg = getConfig();
    const feat = Object.assign({}, cfg.features);
    if (feat.render3dEnabled === undefined) feat.render3dEnabled = true;
    if (feat.shadows3d === undefined) feat.shadows3d = true;
    setConfig({ features: feat });
  }

  /* Di trú schemaVersion 9 -> 10 (Giai đoạn 5: dựng hình 3D). */
  function migrateSchemaV9ToV10() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 10) return;
    ensureGiaiDoan5Fields();
    StorageService.set(KEYS.schemaVersion, 10);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 10 (Giai đoạn 5): bật chế độ dựng hình 3D WebGL, có fallback 2D.");
  }

  /* ---------------------------------------------------------
     DI TRÚ 10 -> 11 (Giai đoạn 6)
       - Công trình: maxLevel 5 -> 10 + mảng `tiers` (tên/ngoại hình/hiệu
         ứng từng mốc tiến hoá). Giữ nguyên mọi chỉ số Admin đã sửa tay.
       - Boss: thêm 2 Boss mới (Level 9, Level 10) + 3 Mini Boss.
       - Màn chơi: thêm Level 9 và Level 10; mở rộng số Wave của các màn
         cũ lên đúng chỉ tiêu (chỉ THÊM đợt, không xoá đợt viết tay).
       - Cấu hình: cờ camera chiến trường + mini-map.
     Nguyên tắc: CHỈ THÊM, không ghi đè dữ liệu người chơi/Admin đã có.
     --------------------------------------------------------- */
  function ensureGiaiDoan6Fields() {
    /* --- Công trình: nâng lên 10 cấp + tiers --- */
    replaceAll("buildings", list("buildings").map((b) => {
      if (Array.isArray(b.tiers) && b.tiers.length === TIER_LEVELS.length && b.maxLevel === 10) return b;
      // giữ nguyên chỉ số Admin đã chỉnh, chỉ bổ sung tiers + maxLevel
      const names = TOWER_TIER_NAMES[b.id] || [];
      const base = b.name || b.id;
      const tiers = TIER_LEVELS.map((lv, i) => ({
        level: lv,
        name: names[i] || `${base} cấp ${lv}`,
        label: TIER_LABEL[i],
        fx: TIER_FX[i],
        evolution: lv === 5 || lv === 10,
        ultimate: lv === 10 ? `${(names[5] || base)} – đòn tối thượng: +35% sát thương, +15% tầm bắn.` : null,
      }));
      const patch = { tiers };
      if (!b.maxLevel || b.maxLevel < 10) {
        patch.maxLevel = 10;
        // Số cấp gấp đôi -> giảm hệ số mỗi cấp để tổng sức mạnh không vỡ game.
        if (b.upgradeDamageMult) patch.upgradeDamageMult = +(b.upgradeDamageMult * 0.62).toFixed(3);
        if (b.upgradeRangeMult) patch.upgradeRangeMult = +(b.upgradeRangeMult * 0.62).toFixed(3);
        if (b.upgradeAuraMult) patch.upgradeAuraMult = +(b.upgradeAuraMult * 0.62).toFixed(3);
      }
      return Object.assign({}, b, patch);
    }));

    /* --- Boss mới + Mini Boss --- */
    const bosses = list("bosses");
    const have = new Set(bosses.map((b) => b.id));
    const added = defaultBosses().filter((b) => !have.has(b.id));
    if (added.length) replaceAll("bosses", bosses.concat(added));

    /* --- Màn chơi: thêm Level 9/10 + mở rộng Wave --- */
    const defStages = defaultStages();
    const defById = {};
    for (const s of defStages) defById[s.id] = s;
    const stages = list("stages");
    const stageIds = new Set(stages.map((s) => s.id));
    const patched = stages.map((s) => {
      const target = STAGE_WAVE_TARGET[s.id];
      const patch = {};
      if (s.miniBossId === undefined) patch.miniBossId = miniBossFor(s.order || 1);
      if (target && Array.isArray(s.waves) && s.waves.length < target) {
        patch.waves = expandStageWaves(s, target);
        patch.targetTime = Math.round(patch.waves.length * 22 + (s.order || 1) * 8);
      }
      return Object.keys(patch).length ? Object.assign({}, s, patch) : s;
    });
    const newStages = defStages.filter((s) => !stageIds.has(s.id));
    replaceAll("stages", patched.concat(newStages));

    /* --- Cấu hình: camera chiến trường --- */
    const cfg = getConfig();
    const feat = Object.assign({}, cfg.features);
    if (feat.cameraEnabled === undefined) feat.cameraEnabled = true;
    if (feat.miniMapEnabled === undefined) feat.miniMapEnabled = true;
    setConfig({ features: feat });
  }

  function migrateSchemaV10ToV11() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 11) return;
    ensureGiaiDoan6Fields();
    StorageService.set(KEYS.schemaVersion, 11);
    console.info("[DataService] Đã di trú lên schemaVersion 11 (Giai đoạn 6): chiến dịch 10 Level, Wave có diễn biến, Mini Boss, công trình 10 cấp có tiến hoá ngoại hình, camera chiến trường + mini-map.");
  }

  /* Di trú schemaVersion 8 -> 9 (Giai đoạn 4: combat/tower/hero/map/audio). */
  function migrateSchemaV8ToV9() {
    const currentVersion = StorageService.get(KEYS.schemaVersion, 0);
    if (currentVersion >= 9) return;
    ensureGiaiDoan4Fields();
    StorageService.set(KEYS.schemaVersion, 9);
    console.info("[DataService] Đã di trú dữ liệu lên schemaVersion 9 (Giai đoạn 4): sát thương phép/giáp/kháng phép, hành vi quân địch, cây nâng cấp tháp, tháp hỗ trợ, tướng ra trận, chướng ngại vật, nhạc nền.");
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
    migrateSchemaV6ToV7();
    migrateSchemaV7ToV8();
    migrateSchemaV8ToV9();
    migrateSchemaV9ToV10();
    migrateSchemaV10ToV11();
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
    ensureAchievementFields(); // vá Thành tích thật nếu snapshot import là bản backup cũ (v6)
    ensureExpandedCampaignContent(); // vá 2 màn/2 Boss/wave mới nếu snapshot import là bản backup cũ (v7)
    ensureGiaiDoan4Fields(); // vá toàn bộ field Giai đoạn 4 nếu snapshot import là bản backup cũ (v8)
    ensureGiaiDoan5Fields(); // vá cờ 3D của Giai đoạn 5 (v9 -> v10)
    ensureGiaiDoan6Fields(); // vá 10 Level / Wave mới / công trình 10 cấp / camera (v10 -> v11)
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
        // Giai đoạn 6: Mini Boss của màn (dùng cho nút "theo dõi Boss" và HUD)
        miniBossId: stage.miniBossId || null,
        // Giai đoạn 4: địa hình/chướng ngại vật của bản đồ
        theme: stage.theme || "plain",
        obstacles: Array.isArray(stage.obstacles) ? stage.obstacles : [],
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
        magicResist: b.magicResist || 0,
        behavior: "boss",
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
        sellRefundRate: config.SELL_REFUND_RATE !== undefined ? config.SELL_REFUND_RATE : 0.7,
        tideCycleSeconds: config.TIDE_CYCLE_SECONDS || 9,
        soundEnabled: config.features ? config.features.soundEnabled !== false : true,
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
      achievements: toKeyedObject(list("achievements")),
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
