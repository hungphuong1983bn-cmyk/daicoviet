/* =========================================================
   STATE.JS
   Quản lý trạng thái tổng thể của game + lưu/đọc localStorage.
   Không chứa logic vẽ hay va chạm (nằm ở game.js).
   ========================================================= */

const STORAGE_KEYS = {
  progress: "dcv_progress_v1",   // tiến trình dài hạn (đã mở khoá, cài đặt)
  saveGame: "dcv_savegame_v1",   // ván đang chơi dở (để "Tiếp tục")
};

const GameState = {

  /* ----- tiến trình dài hạn ----- */
  progress: {
    unlockedLevels: ["hoa_lu"],
    bestWave: {},          // { levelId: số đợt cao nhất từng qua }
    settings: { sound: true },
  },

  /* ----- trạng thái ván đang chơi ----- */
  run: null, // sẽ được khởi tạo bởi Game.newRun()

  /* ---------- Tiến trình dài hạn ---------- */
  loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.progress);
      if (raw) this.progress = Object.assign(this.progress, JSON.parse(raw));
    } catch (e) { console.warn("Không đọc được tiến trình:", e); }
  },

  saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(this.progress));
    } catch (e) { console.warn("Không lưu được tiến trình:", e); }
  },

  resetProgress() {
    localStorage.removeItem(STORAGE_KEYS.progress);
    localStorage.removeItem(STORAGE_KEYS.saveGame);
    this.progress = {
      unlockedLevels: ["hoa_lu"],
      bestWave: {},
      settings: { sound: true },
    };
  },

  /* ---------- Ván chơi dở (Continue) ---------- */
  hasSavedGame() {
    return !!localStorage.getItem(STORAGE_KEYS.saveGame);
  },

  saveRun(runSnapshot) {
    try {
      localStorage.setItem(STORAGE_KEYS.saveGame, JSON.stringify(runSnapshot));
    } catch (e) { console.warn("Không lưu được ván chơi:", e); }
  },

  loadRunSnapshot() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.saveGame);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  clearRunSnapshot() {
    localStorage.removeItem(STORAGE_KEYS.saveGame);
  },
};
