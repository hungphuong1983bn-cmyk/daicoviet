/* =========================================================
   ACHIEVEMENT-SERVICE.JS
   Thành tích (Phần XXX, Giai đoạn 3) - khác Quest ở chỗ KHÔNG có bước
   "nhận thưởng" thủ công: vừa đủ điều kiện là mở khoá + cộng thưởng
   luôn, và có màn hình riêng để xem lại toàn bộ huy hiệu (khoá/đã mở).

   Định nghĩa lấy từ collection "achievements" (Admin CRUD được, giống
   hệt kiến trúc Quest); tiến độ mở khoá lưu ở players[].achievements.

   Được gọi bởi js/game.js tại các mốc: hạ Boss, qua màn (thắng), và
   ngay sau khi nâng cấp Tower lên Max Level. KILL_COUNT được kiểm tra
   ở bất kỳ mốc nào evaluate() chạy vì nó dựa trên số liệu luỹ kế.
   ========================================================= */

const AchievementService = (() => {
  function getPlayer() {
    return DataService.get("players", "local_player");
  }

  function isConditionMet(ach, player, eventType, payload) {
    const c = ach.condition || {};
    switch (c.type) {
      case "KILL_COUNT":
        return ((player.stats && player.stats.totalKills) || 0) >= (c.count || 0);
      case "BOSS_KILL_COUNT":
        return ((player.stats && player.stats.totalBossKills) || 0) >= (c.count || 0);
      case "COMBO":
        return eventType === "COMBO" && (payload.maxCombo || 0) >= (c.count || 0);
      case "STAGE_STARS":
        return eventType === "STAGE_STARS" && (payload.stars || 0) >= (c.stars || 0);
      case "ALL_STAGES_CLEARED":
        return eventType === "ALL_STAGES_CLEARED";
      case "NO_DAMAGE_STAGE_CLEARED":
        return eventType === "NO_DAMAGE_STAGE_CLEARED";
      case "SCORE":
        return eventType === "SCORE" && (payload.score || 0) >= (c.value || 0);
      case "TOWER_MAX_LEVEL":
        return eventType === "TOWER_MAX_LEVEL";
      default:
        return false;
    }
  }

  /* Chạy sau một sự kiện. Trả về danh sách Thành tích VỪA mở khoá (để
     UI hiện toast "🏆 Đã mở khoá thành tích!"). Tự cộng thưởng ngay,
     không cần bước "claim" như Quest. */
  function evaluate(eventType, payload = {}) {
    const player = getPlayer();
    if (!player) return [];
    const achievements = DataService.list("achievements").filter((a) => a.enabled !== false);
    const unlocked = Object.assign({}, player.achievements || {});
    const justUnlocked = [];

    for (const ach of achievements) {
      if (unlocked[ach.id]) continue;
      if (isConditionMet(ach, player, eventType, payload)) {
        unlocked[ach.id] = { unlockedAt: Date.now() };
        justUnlocked.push(ach);
      }
    }
    if (justUnlocked.length > 0) {
      DataService.update("players", player.id, { achievements: unlocked });
      for (const ach of justUnlocked) {
        GameState.addPersistentReward((ach.reward && ach.reward.gold) || 0, (ach.reward && ach.reward.exp) || 0);
      }
    }
    return justUnlocked;
  }

  function listForPlayer() {
    const player = getPlayer();
    if (!player) return [];
    const unlocked = player.achievements || {};
    return DataService.list("achievements")
      .filter((a) => a.enabled !== false)
      .map((a) => ({
        ...a,
        unlocked: !!unlocked[a.id],
        unlockedAt: unlocked[a.id] ? unlocked[a.id].unlockedAt : null,
      }));
  }

  return { evaluate, listForPlayer };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AchievementService;
