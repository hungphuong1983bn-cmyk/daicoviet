/* =========================================================
   STATE.JS  (Giai đoạn 2)
   Quản lý trạng thái tổng thể của game trong một phiên chơi + đọc/ghi
   tiến trình dài hạn của người chơi.

   Từ Giai đoạn 2, "tiến trình dài hạn" (level đã mở, level cao nhất
   đã qua, cài đặt, vàng bền vững, tướng sở hữu, nhiệm vụ...) không
   còn nằm trong 1 key JSON tự do như phiên bản 1 nữa, mà là MỘT BẢN
   GHI trong collection "players" của DataService — cùng một nguồn dữ
   liệu mà Admin nhìn thấy ở mục "Người chơi".

   Vì trò chơi hiện tại chưa có hệ thống tài khoản/đăng nhập cho
   NGƯỜI CHƠI (khác với đăng nhập ADMIN ở /admin), toàn bộ trình
   duyệt hiện tại chỉ có một hồ sơ chơi duy nhất, id cố định
   "local_player". Đây là giới hạn của kiến trúc frontend-only, xem
   thêm ở README.md mục "Hướng dẫn chuyển sang backend".

   GameState vẫn giữ nguyên các hàm public mà js/game.js và js/ui.js
   của phiên bản 1 đã gọi (loadProgress, saveProgress, resetProgress,
   hasSavedGame, saveRun, loadRunSnapshot, clearRunSnapshot) để không
   phải sửa lại các file đó.
   ========================================================= */

const LOCAL_PLAYER_ID = "local_player";
const RUN_SNAPSHOT_KEY = "runSnapshot";
/* Phiên bản cấu trúc SAVE tổng thể (tiến trình + ván đang chơi).
   Nếu save trên máy người chơi có version CŨ HƠN, dữ liệu vẫn được giữ và
   được DataService vá dần qua các bước migrate; nếu save của MỘT VÁN ĐANG
   CHƠI không khớp RUN_SAVE_VERSION (định nghĩa trong js/game.js) thì ván đó
   bị bỏ qua an toàn thay vì làm vỡ game. */
const SAVE_FORMAT_VERSION = 4;

const GameState = {
  /* ----- tiến trình dài hạn, hình dạng tương thích phiên bản 1 ----- */
  progress: {
    unlockedLevels: ["hoa_lu"],
    bestWave: {},
    stageStars: {},
    bestScore: {},
    settings: { sound: true, sfx: true, music: true },
  },

  run: null,

  /* ---------- Truy cập hồ sơ người chơi (Giai đoạn 2) ---------- */
  getPlayer() {
    return DataService.get("players", LOCAL_PLAYER_ID);
  },

  _syncProgressFromPlayer(player) {
    if (!player) return;
    this.progress.unlockedLevels = player.unlockedStages || ["hoa_lu"];
    this.progress.bestWave = player.bestWave || {};
    this.progress.stageStars = player.stageStars || {};
    this.progress.bestScore = player.bestScore || {};
    this.progress.settings = Object.assign({ sound: true, sfx: true, music: true }, player.settings || {});
  },

  /* ---------- Tiến trình dài hạn ---------- */
  loadProgress() {
    let player = this.getPlayer();
    if (!player) {
      // Không nên xảy ra vì DataService.init() đã seed sẵn, nhưng đề
      // phòng trường hợp bị xoá thủ công.
      const fresh = DataService.defaultAll().players[0];
      player = DataService.create("players", fresh);
    }
    this._syncProgressFromPlayer(player);
  },

  saveProgress() {
    const player = this.getPlayer();
    if (!player) return;
    DataService.update("players", LOCAL_PLAYER_ID, {
      unlockedStages: this.progress.unlockedLevels,
      bestWave: this.progress.bestWave,
      settings: this.progress.settings,
    });
  },

  resetProgress() {
    const fresh = DataService.defaultAll().players[0];
    fresh.id = LOCAL_PLAYER_ID;
    DataService.replaceAll(
      "players",
      DataService.list("players").map((p) => (p.id === LOCAL_PLAYER_ID ? fresh : p))
    );
    StorageService.remove(RUN_SNAPSHOT_KEY);
    this._syncProgressFromPlayer(fresh);
  },

  /* ---------- Hero EXP / Level thật (Giai đoạn 3, Priority 3) ----------
     Tách biệt hoàn toàn với player.exp (EXP người chơi) ở trên, đúng yêu
     cầu: "Không được dùng chung EXP người chơi và Hero EXP". EXP cộng dồn
     trong player.heroExp[heroId], lên cấp thật sự làm heroLevels[heroId]
     tăng, và scale thẳng vào Passive/Active Skill của tướng đó (đọc lại
     ở đầu trận kế tiếp qua Game._heroBonuses, giống cách hp/damage/defense
     hiện tại đã scale theo level).
     Công thức EXP cần cho level N -> N+1: expToUpgrade * N (tăng dần theo
     cấp, giống công thức level*100 đã dùng cho EXP người chơi ở trên). */
  heroExpNeeded(heroDef, level) {
    return Math.round((heroDef.expToUpgrade || 100) * level);
  },

  /* Cộng EXP thật cho một tướng sau khi kết thúc trận (thắng hoặc thua
     đều được tính, vì EXP là công lao diệt địch trong trận, không phải
     phần thưởng riêng của chiến thắng). Trả về { level, leveledUp, expLeft, needed }
     để UI có thể báo "Tướng đã lên cấp!". */
  addHeroExp(heroId, exp) {
    if (!heroId || !exp || exp <= 0) return null;
    const player = this.getPlayer();
    if (!player) return null;
    const heroDef = DataService.get("heroes", heroId);
    if (!heroDef) return null;
    const maxLevel = heroDef.maxLevel || 5;
    const heroExpMap = Object.assign({}, player.heroExp);
    const heroLevels = Object.assign({}, player.heroLevels);
    let level = heroLevels[heroId] || 1;
    let expLeft = (heroExpMap[heroId] || 0) + exp;
    let needed = this.heroExpNeeded(heroDef, level);
    let leveledUp = false;
    while (level < maxLevel && expLeft >= needed) {
      expLeft -= needed;
      level += 1;
      leveledUp = true;
      needed = this.heroExpNeeded(heroDef, level);
    }
    if (level >= maxLevel) expLeft = 0; // đã tối đa, không tích luỹ EXP thừa vô ích
    heroExpMap[heroId] = expLeft;
    heroLevels[heroId] = level;
    DataService.update("players", player.id, { heroExp: heroExpMap, heroLevels });
    return { level, leveledUp, expLeft, needed };
  },

  /* ---------- Nâng cấp KỸ NĂNG chủ động của tướng (Giai đoạn 4) ----------
     Dùng vàng BỀN VỮNG của người chơi (ví ngoài trận), tách biệt hoàn toàn
     với vàng trong trận. Mỗi cấp kỹ năng làm tăng hiệu lực theo
     skill.perLevelBonus, được game.js áp dụng thật khi dùng kỹ năng. */
  heroSkillCost(heroDef, skillLevel) {
    return Math.round((heroDef.skillUpgradeCost || 130) * skillLevel);
  },

  upgradeHeroSkill(heroId) {
    const player = this.getPlayer();
    const heroDef = DataService.get("heroes", heroId);
    if (!player || !heroDef) return { ok: false, reason: "not_found" };
    if (!(player.heroesOwned || []).includes(heroId)) return { ok: false, reason: "not_owned" };
    const levels = Object.assign({}, player.heroSkillLevels);
    const cur = levels[heroId] || 1;
    const max = heroDef.skillMaxLevel || 5;
    if (cur >= max) return { ok: false, reason: "max" };
    const cost = this.heroSkillCost(heroDef, cur);
    if (player.gold < cost) return { ok: false, reason: "no_gold", cost };
    levels[heroId] = cur + 1;
    DataService.update("players", player.id, { gold: player.gold - cost, heroSkillLevels: levels });
    return { ok: true, level: cur + 1, cost };
  },

  /* ---------- Vàng bền vững / EXP / tướng (dùng cho màn Tướng) ---------- */
  addPersistentReward(gold, exp) {
    const player = this.getPlayer();
    if (!player) return;
    const config = DataService.getConfig();
    const mult = config.REWARD_MULTIPLIER || 1;
    const newExp = player.exp + Math.round((exp || 0) * mult);
    const maxLevel = config.MAX_LEVEL || 10;
    // Công thức lên cấp đơn giản: mỗi cấp cần 100 * cấp hiện tại EXP.
    let level = player.level;
    let expLeft = newExp;
    let needed = level * 100;
    while (expLeft >= needed && level < maxLevel) {
      expLeft -= needed;
      level += 1;
      needed = level * 100;
    }
    DataService.update("players", player.id, {
      gold: player.gold + Math.round((gold || 0) * mult),
      exp: expLeft,
      level,
    });
  },

  recordKill(count = 1) {
    const player = this.getPlayer();
    if (!player) return;
    const stats = Object.assign({ totalKills: 0, totalRuns: 0, wins: 0, losses: 0, totalBossKills: 0 }, player.stats);
    stats.totalKills += count;
    DataService.update("players", player.id, { stats });
  },

  /* Đếm dồn số Boss đã hạ TRỌN ĐỜI (khác r.bossKillCount trong game.js chỉ
     đếm trong 1 trận) - dùng cho Thành tích "Khắc Tinh Của Boss" (mục XXX). */
  recordBossKill(count = 1) {
    const player = this.getPlayer();
    if (!player) return;
    const stats = Object.assign({ totalKills: 0, totalRuns: 0, wins: 0, losses: 0, totalBossKills: 0 }, player.stats);
    stats.totalBossKills += count;
    DataService.update("players", player.id, { stats });
  },

  recordRunResult(won) {
    const player = this.getPlayer();
    if (!player) return;
    const stats = Object.assign({ totalKills: 0, totalRuns: 0, wins: 0, losses: 0, totalBossKills: 0 }, player.stats);
    stats.totalRuns += 1;
    if (won) stats.wins += 1; else stats.losses += 1;
    DataService.update("players", player.id, { stats });
  },

  unlockStage(stageId) {
    const player = this.getPlayer();
    if (!player) return;
    if (!player.unlockedStages.includes(stageId)) {
      const unlockedStages = [...player.unlockedStages, stageId];
      DataService.update("players", player.id, { unlockedStages });
      this.progress.unlockedLevels = unlockedStages;
    }
  },

  updateBestWave(levelId, waveNumber) {
    const player = this.getPlayer();
    if (!player) return;
    const bestWave = Object.assign({}, player.bestWave);
    bestWave[levelId] = Math.max(bestWave[levelId] || 0, waveNumber);
    DataService.update("players", player.id, { bestWave });
    this.progress.bestWave = bestWave;
  },

  /* ---------- Score / 3 Sao (Giai đoạn 3, Priority 5) ----------
     stars: số sao đạt được lần này (0 nếu thua). Không bao giờ làm GIẢM
     số sao/điểm/thành tích đã có trước đó (chỉ giữ giá trị tốt nhất).
     time (giây) chỉ được truyền khi THẮNG - thời gian của một trận thua
     không có ý nghĩa "kỷ lục" nên không cập nhật bestTime khi thua. */
  recordStageResult(stageId, { stars = 0, score = 0, time } = {}) {
    const player = this.getPlayer();
    if (!player) return;
    const stageStars = Object.assign({}, player.stageStars);
    const bestScore = Object.assign({}, player.bestScore);
    const bestTime = Object.assign({}, player.bestTime);
    stageStars[stageId] = Math.max(stageStars[stageId] || 0, stars);
    bestScore[stageId] = Math.max(bestScore[stageId] || 0, Math.round(score));
    if (time !== undefined) {
      bestTime[stageId] = bestTime[stageId] ? Math.min(bestTime[stageId], Math.round(time)) : Math.round(time);
    }
    DataService.update("players", player.id, { stageStars, bestScore, bestTime });
    this.progress.stageStars = stageStars;
    this.progress.bestScore = bestScore;
  },

  /* ---------- Ván chơi dở (Continue) ----------
     Đây là trạng thái NGẮN HẠN của một ván đang đánh dở, khác với
     tiến trình dài hạn ở trên nên KHÔNG lưu trong collection
     "players" (Admin không cần thấy/sửa cái này). */
  hasSavedGame() {
    return !!this.loadRunSnapshot();
  },

  saveRun(runSnapshot) {
    const config = DataService.getConfig();
    if (config.features && config.features.autoSaveEnabled === false) return;
    StorageService.set(RUN_SNAPSHOT_KEY, Object.assign({ formatVersion: SAVE_FORMAT_VERSION }, runSnapshot));
  },

  /* Đọc ván đang chơi dở. Nếu save được ghi bởi một PHIÊN BẢN GAME KHÁC
     (cấu trúc đã đổi), ta BỎ QUA nó và xoá đi thay vì cố nạp rồi crash -
     đây chính là cơ chế "version save" chống lỗi khi cập nhật game. */
  loadRunSnapshot() {
    const snap = StorageService.get(RUN_SNAPSHOT_KEY, null);
    if (!snap) return null;
    const runVersion = snap.saveVersion || 0;
    const expected = (typeof RUN_SAVE_VERSION !== "undefined") ? RUN_SAVE_VERSION : runVersion;
    if (runVersion !== expected) {
      console.info("[GameState] Bỏ qua save cũ (version " + runVersion + " ≠ " + expected + ").");
      StorageService.remove(RUN_SNAPSHOT_KEY);
      return null;
    }
    return snap;
  },

  clearRunSnapshot() {
    StorageService.remove(RUN_SNAPSHOT_KEY);
  },
};
