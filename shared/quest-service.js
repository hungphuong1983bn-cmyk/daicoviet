/* =========================================================
   QUEST-SERVICE.JS
   Theo dõi tiến độ Nhiệm vụ (Phần 11) và phát Phần thưởng (Phần 12)
   cho hồ sơ người chơi cục bộ. Định nghĩa nhiệm vụ lấy từ collection
   "quests" (Admin CRUD được); TIẾN ĐỘ của người chơi lưu trong
   players[].questProgress.

   Được gọi bởi js/game.js tại các thời điểm: qua đợt (WAVE_CLEARED),
   qua màn (STAGE_CLEARED), hạ Boss (BOSS_KILLED). KILL_COUNT được
   kiểm tra mỗi lần evaluate() chạy vì nó dựa trên số liệu luỹ kế của
   người chơi, không gắn với một sự kiện cụ thể.
   ========================================================= */

const QuestService = (() => {
  function getPlayer() {
    return DataService.get("players", "local_player");
  }

  function getProgressMap(player) {
    return Object.assign({}, player.questProgress || {});
  }

  function isConditionMet(quest, player, eventType, payload) {
    const c = quest.condition || {};
    switch (c.type) {
      case "WAVE_CLEARED":
        return eventType === "WAVE_CLEARED" && payload.waveNumber >= (c.waveNumber || 1);
      case "STAGE_CLEARED":
        return eventType === "STAGE_CLEARED" && (!c.stageId || payload.stageId === c.stageId);
      case "KILL_COUNT":
        return ((player.stats && player.stats.totalKills) || 0) >= (c.count || 0);
      case "CASTLE_HP_ABOVE_PERCENT":
        return eventType === "STAGE_CLEARED" && payload.hpPercent >= (c.percent || 0);
      case "BOSS_KILLED":
        return eventType === "BOSS_KILLED";
      default:
        return false;
    }
  }

  /* Chạy sau một sự kiện trong trận. Trả về danh sách quest vừa hoàn
     thành (để UI có thể hiện thông báo "Hoàn thành nhiệm vụ!"). */
  function evaluate(eventType, payload = {}) {
    const player = getPlayer();
    if (!player) return [];
    const quests = DataService.list("quests").filter((q) => q.enabled !== false);
    const progress = getProgressMap(player);
    const justCompleted = [];

    for (const quest of quests) {
      const entry = progress[quest.id] || { done: false, claimed: false };
      if (entry.done) continue;
      if (isConditionMet(quest, player, eventType, payload)) {
        entry.done = true;
        progress[quest.id] = entry;
        justCompleted.push(quest);
      } else {
        progress[quest.id] = entry;
      }
    }
    DataService.update("players", player.id, { questProgress: progress });
    return justCompleted;
  }

  function listForPlayer() {
    const player = getPlayer();
    if (!player) return [];
    const progress = getProgressMap(player);
    return DataService.list("quests")
      .filter((q) => q.enabled !== false)
      .map((q) => ({
        ...q,
        done: !!(progress[q.id] && progress[q.id].done),
        claimed: !!(progress[q.id] && progress[q.id].claimed),
      }));
  }

  function claim(questId) {
    const player = getPlayer();
    if (!player) return { ok: false, error: "Không tìm thấy hồ sơ người chơi." };
    const quest = DataService.get("quests", questId);
    if (!quest) return { ok: false, error: "Nhiệm vụ không tồn tại." };
    const progress = getProgressMap(player);
    const entry = progress[questId];
    if (!entry || !entry.done) return { ok: false, error: "Nhiệm vụ chưa hoàn thành." };
    if (entry.claimed) return { ok: false, error: "Đã nhận thưởng rồi." };
    entry.claimed = true;
    progress[questId] = entry;
    DataService.update("players", player.id, { questProgress: progress });
    GameState.addPersistentReward((quest.reward && quest.reward.gold) || 0, (quest.reward && quest.reward.exp) || 0);
    return { ok: true, reward: quest.reward };
  }

  return { evaluate, listForPlayer, claim };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QuestService;
