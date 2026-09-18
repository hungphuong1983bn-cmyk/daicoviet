/* =========================================================
   SCHEMAS.JS
   Khai báo "hình dạng" của từng loại dữ liệu để component CRUD dùng
   chung (admin/js/components.js) có thể tự vẽ bảng + form thêm/sửa
   mà không phải viết lại HTML cho từng mục (Tướng, Công trình, Quân
   địch, Boss, Kỹ năng, Nhiệm vụ, Vật phẩm, Phần thưởng...).

   Mỗi field: { key, label, type, ... }
     type: text | number | textarea | checkbox | select
   ========================================================= */

const ADMIN_SCHEMAS = {
  heroes: {
    label: "Tướng",
    collection: "heroes",
    columns: ["icon", "name", "hp", "damage", "defense", "unlockCost", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true, hint: "Không dấu, không khoảng trắng, vd: dinh_bo_linh" },
      { key: "name", label: "Tên", type: "text", required: true },
      { key: "nameVi", label: "Tên tiếng Việt", type: "text" },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "icon", label: "Icon (emoji)", type: "text" },
      { key: "hp", label: "Cộng HP thành", type: "number", min: 0 },
      { key: "damage", label: "Cộng % sát thương tháp", type: "number", min: 0 },
      { key: "defense", label: "Giảm sát thương thành nhận (flat)", type: "number", min: 0 },
      { key: "level", label: "Level hiện tại (mặc định khi tạo)", type: "number", min: 1 },
      { key: "maxLevel", label: "Level tối đa", type: "number", min: 1 },
      { key: "expToUpgrade", label: "EXP cần để lên 1 cấp (x theo cấp hiện tại, vd cấp 2 cần expToUpgrade×2)", type: "number", min: 1,
        hint: "Engine THẬT SỰ cộng EXP mỗi khi tướng này hạ địch trong trận (xem rewardExp ở Quân địch) và tự lên cấp, không còn là field dự phòng." },
      { key: "unlockCost", label: "Giá mở khoá (vàng bền vững)", type: "number", min: 0 },
      { key: "upgradeCost", label: "Giá nâng cấp (dự phòng, chưa dùng - lên cấp hiện qua EXP)", type: "number", min: 0 },
      { key: "skillId", label: "Kỹ năng", type: "select", optionsFrom: "skills" },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  buildings: {
    label: "Công trình",
    collection: "buildings",
    columns: ["icon", "name", "cost", "damage", "range", "fireRate", "criticalChance", "effectType", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên", type: "text", required: true },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "icon", label: "Icon", type: "text" },
      { key: "color", label: "Màu", type: "text" },
      { key: "cost", label: "Giá xây", type: "number", min: 0 },
      { key: "damage", label: "Damage", type: "number", min: 0 },
      { key: "range", label: "Range", type: "number", min: 0 },
      { key: "fireRate", label: "Attack Speed (phát/giây)", type: "number", step: "0.1", min: 0 },
      { key: "projectileSpeed", label: "Tốc độ đạn", type: "number", min: 0 },
      { key: "splashRadius", label: "Bán kính lan (0 = không)", type: "number", min: 0 },
      { key: "criticalChance", label: "Tỉ lệ chí mạng % (0-100)", type: "number", min: 0, max: 100 },
      { key: "criticalMultiplier", label: "Hệ số sát thương chí mạng (vd 2 = x2)", type: "number", step: "0.1", min: 1 },
      { key: "armorPenetration", label: "Xuyên giáp % (giảm Defense hiệu dụng của địch)", type: "number", min: 0, max: 100 },
      { key: "effectType", label: "Hiệu ứng trạng thái khi trúng đạn", type: "select", options: [
        { value: "none", label: "Không" },
        { value: "slow", label: "🐌 Làm chậm (Slow)" },
        { value: "burn", label: "🔥 Đốt cháy theo thời gian (Burn)" },
        { value: "freeze", label: "❄️ Đóng băng - dừng di chuyển (Freeze)" },
        { value: "stun", label: "⚡ Choáng - dừng hoàn toàn (Stun)" },
        { value: "bleed", label: "🩸 Chảy máu theo thời gian (Bleed)" },
      ] },
      { key: "effectValue", label: "Giá trị hiệu ứng (Slow: 0-1 = %giảm tốc; Burn/Bleed: sát thương/giây)", type: "number", step: "0.01", min: 0 },
      { key: "effectDuration", label: "Thời lượng hiệu ứng (giây)", type: "number", min: 0 },
      { key: "maxLevel", label: "Level tối đa", type: "number", min: 1 },
      { key: "upgradeCost", label: "Giá nâng cấp / cấp", type: "number", min: 0 },
      { key: "upgradeDamageMult", label: "Hệ số tăng Damage / cấp", type: "number", step: "0.01", min: 0 },
      { key: "upgradeRangeMult", label: "Hệ số tăng Range / cấp", type: "number", step: "0.01", min: 0 },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  enemies: {
    label: "Quân địch",
    collection: "enemies",
    columns: ["icon", "name", "hp", "speed", "damage", "reward", "rewardExp", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên", type: "text", required: true },
      { key: "icon", label: "Icon", type: "text" },
      { key: "color", label: "Màu", type: "text" },
      { key: "radius", label: "Kích thước (bán kính vẽ)", type: "number", min: 0 },
      { key: "hp", label: "HP", type: "number", min: 0 },
      { key: "speed", label: "Speed (px/s)", type: "number", min: 0 },
      { key: "damage", label: "Damage (khi lọt vào thành)", type: "number", min: 0 },
      { key: "defense", label: "Defense (giảm sát thương phẳng)", type: "number", min: 0 },
      { key: "resistance", label: "Resistance % (giảm sát thương theo %)", type: "number", min: 0, max: 100 },
      { key: "reward", label: "Reward Gold", type: "number", min: 0 },
      { key: "rewardExp", label: "Reward Hero EXP (tướng đang dùng nhận khi hạ loại địch này)", type: "number", min: 0 },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  bosses: {
    label: "Boss",
    collection: "bosses",
    columns: ["icon", "name", "hp", "damage", "reward", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên Boss", type: "text", required: true },
      { key: "icon", label: "Icon", type: "text" },
      { key: "color", label: "Màu", type: "text" },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "hp", label: "HP", type: "number", min: 0 },
      { key: "damage", label: "Damage", type: "number", min: 0 },
      { key: "defense", label: "Defense (flat)", type: "number", min: 0 },
      { key: "resistance", label: "Resistance %", type: "number", min: 0, max: 100 },
      { key: "speed", label: "Speed (px/s)", type: "number", min: 0 },
      { key: "reward", label: "Reward Gold", type: "number", min: 0 },
      { key: "rewardExp", label: "Reward EXP", type: "number", min: 0 },
      { key: "skill", label: "Mô tả kỹ năng Boss (flavor text hiển thị cho người chơi)", type: "text" },
      { key: "phases", label: "Phases (JSON) — mảng {id,name,hpFromPct,hpToPct,speedMult,damageMult,enrage}", type: "json",
        hint: "Engine đọc %HP còn lại để chọn phase và áp speedMult/damageMult nền thật sự trong trận, không phải chỉ hiển thị." },
      { key: "abilities", label: "Abilities (JSON) — mảng {id,name,trigger:{type,percent|seconds},effect,...}", type: "json",
        hint: "effect: self_buff (speedBonus/damageBonus), summon (summonType/summonCount, cần cooldown), heal_self (healPercent). trigger.type: hp_below, hp_above (continuous:true để duy trì buff khi còn đúng điều kiện), interval (seconds). Đây là skill THẬT, engine thực sự chạy — không phải chỉ text mô tả." },
      { key: "enabled", label: "Kích hoạt (xuất hiện trong wave)", type: "checkbox" },
    ],
  },

  skills: {
    label: "Kỹ năng",
    collection: "skills",
    columns: ["icon", "name", "effect", "cooldown", "damage", "heal", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên", type: "text", required: true },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "icon", label: "Icon", type: "text" },
      { key: "effect", label: "Loại hiệu ứng", type: "select", options: [
        { value: "damage_all", label: "Sát thương diện rộng (damage_all)" },
        { value: "heal_castle", label: "Hồi máu thành (heal_castle)" },
        { value: "buff_attack_speed", label: "Tăng tốc bắn cho tháp (buff_attack_speed)" },
      ] },
      { key: "cooldown", label: "Cooldown (giây)", type: "number", min: 0 },
      { key: "damage", label: "Damage (nếu damage_all)", type: "number", min: 0 },
      { key: "heal", label: "Heal (nếu heal_castle)", type: "number", min: 0 },
      { key: "value", label: "Giá trị buff (vd 0.4 = +40%, nếu buff_attack_speed)", type: "number", step: "0.05", min: 0 },
      { key: "duration", label: "Thời lượng buff (giây, nếu buff_attack_speed)", type: "number", min: 0 },
      { key: "manaCost", label: "Mana/Năng lượng (dự phòng, chưa dùng)", type: "number", min: 0 },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  quests: {
    label: "Nhiệm vụ",
    collection: "quests",
    columns: ["name", "conditionType", "rewardGold", "rewardExp", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên nhiệm vụ", type: "text", required: true },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "conditionType", label: "Loại điều kiện", type: "select", options: [
        { value: "WAVE_CLEARED", label: "Hoàn thành Wave số..." },
        { value: "STAGE_CLEARED", label: "Hoàn thành một Màn" },
        { value: "KILL_COUNT", label: "Tổng số địch đã diệt" },
        { value: "CASTLE_HP_ABOVE_PERCENT", label: "Qua màn với %HP thành còn lại tối thiểu" },
        { value: "BOSS_KILLED", label: "Diệt một Boss" },
      ] },
      { key: "conditionWaveNumber", label: "Số Wave (nếu WAVE_CLEARED)", type: "number" },
      { key: "conditionStageId", label: "Stage ID (nếu STAGE_CLEARED)", type: "select", optionsFrom: "stages", allowEmpty: true },
      { key: "conditionCount", label: "Số lượng (nếu KILL_COUNT)", type: "number" },
      { key: "conditionPercent", label: "% HP tối thiểu (nếu CASTLE_HP_ABOVE_PERCENT)", type: "number" },
      { key: "rewardGold", label: "Thưởng Gold", type: "number" },
      { key: "rewardExp", label: "Thưởng EXP", type: "number" },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  achievements: {
    label: "Thành tích",
    collection: "achievements",
    columns: ["icon", "name", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên thành tích", type: "text", required: true },
      { key: "icon", label: "Icon", type: "text" },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "condition", label: "Điều kiện (JSON) — {type, count|stars|value}", type: "json", jsonDefault: {},
        hint: "type hợp lệ: KILL_COUNT{count}, BOSS_KILL_COUNT{count}, COMBO{count}, STAGE_STARS{stars}, ALL_STAGES_CLEARED{}, NO_DAMAGE_STAGE_CLEARED{}, SCORE{value}, TOWER_MAX_LEVEL{}. Engine THẬT SỰ đánh giá điều kiện này, không phải chỉ hiển thị." },
      { key: "reward", label: "Thưởng (JSON) — {gold, exp}", type: "json", jsonDefault: {},
        hint: "Tự động cộng ngay khi mở khoá, không cần người chơi bấm nhận như Nhiệm vụ." },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  items: {
    label: "Vật phẩm",
    collection: "items",
    columns: ["icon", "name", "type", "value", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên", type: "text", required: true },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "icon", label: "Icon", type: "text" },
      { key: "type", label: "Loại", type: "select", options: [
        { value: "gold_boost", label: "Cộng vàng" },
        { value: "exp_boost", label: "Cộng EXP" },
      ] },
      { key: "value", label: "Giá trị", type: "number" },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  rewards: {
    label: "Phần thưởng",
    collection: "rewards",
    columns: ["name", "type", "gold", "exp", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên", type: "text", required: true },
      { key: "type", label: "Loại", type: "select", options: [
        { value: "stage_clear", label: "Thưởng qua màn (tham khảo, lấy số thật từ Màn chơi)" },
        { value: "wave_clear", label: "Thưởng qua đợt" },
      ] },
      { key: "gold", label: "Gold", type: "number" },
      { key: "exp", label: "EXP", type: "number" },
      { key: "note", label: "Ghi chú", type: "textarea" },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
  },

  stages: {
    label: "Màn chơi",
    collection: "stages",
    columns: ["order", "name", "difficulty", "waveCount", "rewardGold", "enabled"],
    fields: [
      { key: "id", label: "ID", type: "text", required: true, immutable: true },
      { key: "name", label: "Tên màn", type: "text", required: true },
      { key: "mapName", label: "Tên bản đồ", type: "text" },
      { key: "description", label: "Mô tả", type: "textarea" },
      { key: "order", label: "Thứ tự", type: "number", min: 1 },
      { key: "difficulty", label: "Độ khó (số sao)", type: "number", min: 1 },
      { key: "rewardGold", label: "Reward Gold (khi qua màn)", type: "number", min: 0 },
      { key: "rewardExp", label: "Reward EXP (khi qua màn)", type: "number", min: 0 },
      { key: "targetTime", label: "Thời gian chuẩn (giây) để đạt Speed Bonus khi tính Score", type: "number", min: 1 },
      { key: "specialMechanic", label: "Cơ chế bản đồ đặc biệt", type: "select", options: [
        { value: "none", label: "Không có" },
        { value: "tide", label: "🌊 Thuỷ triều (làm chậm/nhanh toàn bộ địch theo chu kỳ)" },
        { value: "ambush", label: "🗡️ Phục kích (dùng Delay ở từng nhóm quân trong Wave)" },
      ] },
      { key: "starConditions", label: "Điều kiện 3 Sao (JSON) — {oneStar,twoStarCastleHpPercent,threeStarCastleHpPercent,threeStarScore}", type: "json", jsonDefault: {},
        hint: "2 sao khi %HP thành còn lại lúc thắng >= twoStarCastleHpPercent. 3 sao khi %HP >= threeStarCastleHpPercent HOẶC Score đạt threeStarScore. Engine THẬT SỰ tính đúng công thức này, không chỉ hiển thị." },
      { key: "unlockConditionType", label: "Điều kiện mở khoá", type: "select", options: [
        { value: "always", label: "Luôn mở (màn khởi đầu)" },
        { value: "stage_cleared", label: "Phải qua màn khác trước" },
      ] },
      { key: "unlockConditionStageId", label: "Cần qua màn nào (nếu stage_cleared)", type: "select", optionsFrom: "stages", allowEmpty: true },
      { key: "enabled", label: "Kích hoạt", type: "checkbox" },
    ],
    hint: "Đường đi (path), vị trí thành (castle) và ô xây (buildSpots) là toạ độ trên bản đồ, chỉnh sửa trực tiếp trong file dữ liệu vì cần thiết kế bản đồ trực quan — xem README mục Giới hạn.",
  },
};

/* Chuẩn hoá dữ liệu quest giữa "condition lồng nhau" (dùng bởi
   game/QuestService) và "các field phẳng" (dễ vẽ form hơn). */
function questToFormValues(q) {
  const c = q.condition || {};
  return Object.assign({}, q, {
    conditionType: c.type || "WAVE_CLEARED",
    conditionWaveNumber: c.waveNumber,
    conditionStageId: c.stageId,
    conditionCount: c.count,
    conditionPercent: c.percent,
    rewardGold: q.reward ? q.reward.gold : 0,
    rewardExp: q.reward ? q.reward.exp : 0,
  });
}

function formValuesToQuest(values) {
  const condition = { type: values.conditionType };
  if (values.conditionType === "WAVE_CLEARED") condition.waveNumber = Number(values.conditionWaveNumber || 1);
  if (values.conditionType === "STAGE_CLEARED") condition.stageId = values.conditionStageId || null;
  if (values.conditionType === "KILL_COUNT") condition.count = Number(values.conditionCount || 0);
  if (values.conditionType === "CASTLE_HP_ABOVE_PERCENT") condition.percent = Number(values.conditionPercent || 0);
  return {
    id: values.id, name: values.name, description: values.description,
    condition,
    reward: { gold: Number(values.rewardGold || 0), exp: Number(values.rewardExp || 0) },
    enabled: !!values.enabled,
  };
}

function stageToFormValues(s) {
  const c = s.unlockCondition || {};
  return Object.assign({}, s, {
    unlockConditionType: c.type || "always",
    unlockConditionStageId: c.stageId,
    waveCount: (s.waves || []).length,
  });
}

function formValuesToStagePatch(values) {
  const unlockCondition = { type: values.unlockConditionType };
  if (values.unlockConditionType === "stage_cleared") unlockCondition.stageId = values.unlockConditionStageId || null;
  return {
    name: values.name, mapName: values.mapName, description: values.description,
    order: Number(values.order || 1), difficulty: Number(values.difficulty || 1),
    rewardGold: Number(values.rewardGold || 0), rewardExp: Number(values.rewardExp || 0),
    unlockCondition,
    enabled: !!values.enabled,
  };
}
