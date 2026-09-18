/* =========================================================
   TOWER-TIERS.JS  (Giai đoạn 6)

   Hệ thống CẤP CÔNG TRÌNH / VŨ KHÍ 1 -> 10.

   Dữ liệu gốc nằm trong DataService (mảng `tiers` của từng công trình,
   Admin sửa được). File này chỉ là lớp TRA CỨU + quy đổi cấp -> ngoại
   hình/hiệu ứng, dùng chung cho:
     - entities.js   (vẽ 2D, chỉ số)
     - renderer3d.js (dựng lại mesh khi đổi mốc tiến hoá)
     - ui.js         (tên vũ khí, bảng nâng cấp, animation tiến hoá)

   Không giữ trạng thái -> gọi bao nhiêu lần cũng an toàn, không rò bộ nhớ.
   ========================================================= */

const TOWER_TIER_LEVELS = [1, 3, 5, 7, 9, 10];
const TOWER_TIER_LABELS = ["Cơ bản", "Gia cố", "TIẾN HOÁ", "Chiến tướng", "HUYỀN THOẠI", "TỐI THƯỢNG"];
const TOWER_TIER_FX = ["basic", "metal", "aura", "trail", "legend", "ultimate"];
const TOWER_TIER_ACCENTS = ["#9a8466", "#c2c6cf", "#e8c873", "#ff9a4a", "#b57bff", "#ffe36b"];
const TOWER_TIER_GLOW = [0, 0.12, 0.3, 0.45, 0.68, 1];
const TOWER_TIER_POWER = [1, 1.04, 1.12, 1.18, 1.26, 1.35];
const TOWER_TIER_RANGE = [1, 1.01, 1.05, 1.07, 1.1, 1.15];

const TowerTiers = {
  /* Mảng tiers dự phòng cho dữ liệu cũ chưa kịp di trú. */
  _fallback(def) {
    const base = (def && (def.name || def.id)) || "Công trình";
    return TOWER_TIER_LEVELS.map((lv, i) => ({
      level: lv,
      name: i === 0 ? base : `${base} cấp ${lv}`,
      label: TOWER_TIER_LABELS[i],
      fx: TOWER_TIER_FX[i],
      evolution: lv === 5 || lv === 10,
      ultimate: null,
    }));
  },

  list(def) {
    return (def && Array.isArray(def.tiers) && def.tiers.length) ? def.tiers : this._fallback(def);
  },

  /* Chỉ số mốc (0..5) ứng với một cấp. */
  indexOf(def, level) {
    const tiers = this.list(def);
    let idx = 0;
    for (let i = 0; i < tiers.length; i++) if (level >= tiers[i].level) idx = i;
    return idx;
  },

  at(def, level) {
    return this.list(def)[this.indexOf(def, level)];
  },

  /* Tên hiển thị của công trình ở cấp hiện tại. */
  nameAt(def, level) {
    const t = this.at(def, level);
    return (t && t.name) || (def && def.name) || "";
  },

  /* Mốc kế tiếp (null nếu đã tối đa) - dùng để hiện "cấp sau mở gì". */
  next(def, level) {
    const tiers = this.list(def);
    for (const t of tiers) if (t.level > level) return t;
    return null;
  },

  /* Nâng từ `fromLevel` lên `toLevel` có vượt qua mốc nào không? */
  crossedTier(def, fromLevel, toLevel) {
    const tiers = this.list(def);
    for (const t of tiers) if (t.level > fromLevel && t.level <= toLevel) return t;
    return null;
  },

  /* Quy đổi mốc -> thông số hình ảnh (số/chuỗi thuần, dùng chung 2D & 3D). */
  visual(def, level) {
    const i = this.indexOf(def, level);
    const tier = this.at(def, level) || {};
    return {
      tierIndex: i,
      fx: tier.fx || TOWER_TIER_FX[i] || "basic",
      scale: 1 + i * 0.06,
      accent: TOWER_TIER_ACCENTS[i] || "#e8c873",
      glow: TOWER_TIER_GLOW[i] || 0,
      hasAura: i >= 2,
      hasTrail: i >= 3,
      hasParticles: i >= 4,
      isUltimate: i >= 5,
    };
  },

  /* Sức mạnh THÊM của các mốc (ngoài mức tăng đều mỗi cấp).
     Mốc 5 và mốc 10 là hai bước nhảy thật sự. */
  powerMultiplier(def, level) {
    return TOWER_TIER_POWER[this.indexOf(def, level)] || 1;
  },
  rangeMultiplier(def, level) {
    return TOWER_TIER_RANGE[this.indexOf(def, level)] || 1;
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = TowerTiers;
