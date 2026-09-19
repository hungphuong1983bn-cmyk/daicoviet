/* =========================================================
   HERO-TIERS.JS  (Giai đoạn 8)

   Hệ thống TƯỚC HIỆU (rank) cho Tướng, cấp 1 -> 10 (Giai đoạn 7 đã nâng
   trần cấp Tướng từ 5 lên 10). Đây là lớp TRA CỨU cấp -> tước hiệu/màu
   sắc, dùng chung cho:
     - ui.js         (hiển thị "LvX · Tước hiệu" trên thẻ Tướng)
     - renderer3d.js (đổi màu áo choàng/hào quang của mô hình Tướng 3D
                       theo tước hiệu, KHÔNG dựng lại mesh mỗi khung hình)

   QUAN TRỌNG: Tước hiệu ở đây CHỈ LÀ HÌNH ẢNH/DANH XƯNG, KHÔNG cộng thêm
   sức mạnh nào ngoài những gì đã tính trong `passive.value` (data) và
   scale cấp trong entities.js Hero - hai chỗ đó đã được cân bằng cẩn
   thận ở Giai đoạn 7 (giảm hệ số ×0.62 để cấp 10 không mạnh gấp đôi cấp
   5 cũ). Nếu tước hiệu này CŨNG cộng thêm sức mạnh, tổng sức mạnh cấp 10
   sẽ vượt mức đã tính toán - vì vậy powerMultiplier() không tồn tại ở
   đây, khác với tower-tiers.js.

   Không giữ trạng thái -> gọi bao nhiêu lần cũng an toàn, không rò bộ nhớ.
   ========================================================= */

const HERO_TIER_LEVELS = [1, 3, 5, 7, 10];
const HERO_TIER_LABELS = ["Tân Binh", "Dũng Binh", "Kiện Tướng", "Đại Tướng", "Thần Tướng"];
const HERO_TIER_ACCENTS = ["#9a8466", "#c2c6cf", "#e8c873", "#ff9a4a", "#ffe36b"];
const HERO_TIER_GLOW = [0, 0.15, 0.32, 0.55, 1];
const HERO_TIER_HALO_SCALE = [1, 1.08, 1.18, 1.3, 1.5];

const HeroTiers = {
  /* Chỉ số mốc (0..4) mà `level` đã đạt tới - lớn nhất mà level >= mốc. */
  indexOf(level) {
    let idx = 0;
    for (let i = 0; i < HERO_TIER_LEVELS.length; i++) {
      if (level >= HERO_TIER_LEVELS[i]) idx = i;
    }
    return idx;
  },

  /* Tước hiệu + màu sắc hiện tại của một Tướng ở `level`. */
  rank(level) {
    const i = this.indexOf(level);
    return {
      index: i,
      label: HERO_TIER_LABELS[i] || HERO_TIER_LABELS[0],
      accent: HERO_TIER_ACCENTS[i] || HERO_TIER_ACCENTS[0],
      glow: HERO_TIER_GLOW[i] || 0,
      haloScale: HERO_TIER_HALO_SCALE[i] || 1,
      isMax: level >= HERO_TIER_LEVELS[HERO_TIER_LEVELS.length - 1],
    };
  },

  /* Tước hiệu kế tiếp (để hiển thị "còn N cấp nữa lên <tước hiệu>"),
     hoặc null nếu đã ở tước hiệu cao nhất. */
  nextRank(level) {
    const i = this.indexOf(level);
    if (i >= HERO_TIER_LEVELS.length - 1) return null;
    return { label: HERO_TIER_LABELS[i + 1], atLevel: HERO_TIER_LEVELS[i + 1] };
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = HeroTiers;
