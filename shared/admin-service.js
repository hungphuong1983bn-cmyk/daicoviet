/* =========================================================
   ADMIN-SERVICE.JS
   Lớp trung gian mà TRANG ADMIN dùng để đọc/ghi dữ liệu. So với gọi
   thẳng DataService, lớp này thêm 2 việc:
     1. Kiểm tra quyền (role) trước khi cho phép ghi.
     2. Ghi Nhật ký Admin (adminLogs) cho mọi thao tác làm thay đổi
        dữ liệu (tạo/sửa/xoá/reset/import).
   ========================================================= */

const AdminService = (() => {
  function currentUser() {
    const s = AuthService.getSession();
    if (!s) throw new Error("Chưa đăng nhập.");
    return s;
  }

  function assertPermission(section) {
    const s = currentUser();
    if (!AuthService.can(s.role, section)) {
      throw new Error(`Tài khoản "${s.username}" (${s.role}) không có quyền truy cập mục "${section}".`);
    }
    return s;
  }

  function log(action, target, before, after) {
    const s = AuthService.getSession();
    DataService.appendLog({
      id: "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      time: Date.now(),
      admin: s ? s.username : "unknown",
      action,
      target,
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
    });
  }

  function diffSummary(before, after) {
    if (!before || !after) return null;
    const changes = [];
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach((k) => {
      const b = before[k];
      const a = after[k];
      if (JSON.stringify(b) !== JSON.stringify(a)) changes.push(`${k}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
    });
    return changes.join("; ");
  }

  function list(section, collection) {
    assertPermission(section);
    return DataService.list(collection || section);
  }

  function create(section, collection, item) {
    assertPermission(section);
    const created = DataService.create(collection || section, item);
    log(`CREATE_${(collection || section).toUpperCase()}`, item.id, null, created);
    return created;
  }

  function update(section, collection, id, patch) {
    assertPermission(section);
    const result = DataService.update(collection || section, id, patch);
    if (result) {
      log(`UPDATE_${(collection || section).toUpperCase()}`, id, result.before, result.after);
    }
    return result;
  }

  function remove(section, collection, id) {
    assertPermission(section);
    const removed = DataService.remove(collection || section, id);
    if (removed) log(`DELETE_${(collection || section).toUpperCase()}`, id, removed, null);
    return removed;
  }

  function toggleEnabled(section, collection, id) {
    const item = DataService.get(collection || section, id);
    if (!item) return null;
    return update(section, collection, id, { enabled: !(item.enabled !== false) });
  }

  /* ---------------- CẤU HÌNH ---------------- */
  function getConfig() {
    assertPermission("config");
    return DataService.getConfig();
  }
  function setConfig(patch) {
    assertPermission("config");
    const before = DataService.getConfig();
    const after = DataService.setConfig(patch);
    log("UPDATE_GAME_CONFIG", "gameConfig", before, after);
    return after;
  }

  /* ---------------- NGƯỜI CHƠI ---------------- */
  function adjustPlayerGold(playerId, delta) {
    assertPermission("players");
    const p = DataService.get("players", playerId);
    if (!p) return null;
    return update("players", "players", playerId, { gold: Math.max(0, p.gold + delta) });
  }
  function adjustPlayerExp(playerId, delta) {
    assertPermission("players");
    const p = DataService.get("players", playerId);
    if (!p) return null;
    return update("players", "players", playerId, { exp: Math.max(0, p.exp + delta) });
  }
  function setPlayerLevel(playerId, level) {
    assertPermission("players");
    return update("players", "players", playerId, { level: Math.max(1, Math.floor(level)) });
  }
  function resetPlayerProgress(playerId) {
    assertPermission("players");
    const before = DataService.get("players", playerId);
    if (!before) return null;
    const fresh = DataService.defaultAll().players[0];
    const after = Object.assign({}, fresh, { id: playerId, name: before.name });
    DataService.replaceAll("players", DataService.list("players").map((p) => (p.id === playerId ? after : p)));
    log("RESET_PLAYER_PROGRESS", playerId, before, after);
    return after;
  }
  function deletePlayer(playerId) {
    return remove("players", "players", playerId);
  }
  function setPlayerBanned(playerId, banned) {
    assertPermission("players");
    return update("players", "players", playerId, { banned: !!banned });
  }

  /* ---------------- WAVE (thuộc 1 stage) ---------------- */
  function setStageWaves(stageId, waves) {
    assertPermission("waves");
    const before = DataService.get("stages", stageId);
    const result = DataService.update("stages", stageId, { waves });
    log("UPDATE_STAGE_WAVES", stageId, before && before.waves, waves);
    return result;
  }

  /* ---------------- ĐỔI THỨ TỰ STAGE ---------------- */
  function setStageOrder(orderedIds) {
    assertPermission("stages");
    const stages = DataService.list("stages");
    orderedIds.forEach((id, idx) => {
      const s = stages.find((x) => x.id === id);
      if (s) s.order = idx + 1;
    });
    DataService.replaceAll("stages", stages);
    log("REORDER_STAGES", "stages", null, orderedIds);
  }

  /* ---------------- BACKUP / RESTORE ---------------- */
  function exportSnapshot() {
    assertPermission("backup");
    log("EXPORT_DATA", "all", null, null);
    return DataService.exportSnapshot();
  }
  function importSnapshot(snapshot) {
    assertPermission("backup");
    DataService.importSnapshot(snapshot);
    log("IMPORT_DATA", "all", null, "imported");
  }
  async function resetAllData() {
    assertPermission("backup");
    await DataService.resetAllToDefault({ keepAdminUsers: true });
    log("RESET_ALL_DATA", "all", null, "reset_to_default");
  }

  /* ---------------- TÀI KHOẢN ADMIN (Phần 17) ---------------- */
  function listAdminUsers() {
    const s = currentUser();
    if (!AuthService.roleAtLeast(s.role, "ADMIN")) throw new Error("Chỉ Admin trở lên mới xem được danh sách tài khoản.");
    return DataService.list("adminUsers").map((u) => ({ ...u, passwordHash: undefined, salt: undefined }));
  }

  async function createAdminUser({ username, password, role }) {
    const s = currentUser();
    if (!AuthService.roleAtLeast(s.role, "SUPER_ADMIN")) throw new Error("Chỉ Super Admin mới tạo được tài khoản mới.");
    if (!username || !password || password.length < 8) throw new Error("Thiếu tên đăng nhập hoặc mật khẩu quá ngắn (>=8 ký tự).");
    const { salt, hash } = await CryptoUtil.hashPassword(password);
    const user = {
      id: "admin_" + Date.now(),
      username, role: role || "EDITOR",
      salt, passwordHash: hash,
      mustChangePassword: true,
      banned: false,
      createdAt: Date.now(), lastLoginAt: null,
    };
    const created = DataService.create("adminUsers", user);
    log("CREATE_ADMIN_USER", user.username, null, { username: user.username, role: user.role });
    return { ...created, passwordHash: undefined, salt: undefined };
  }

  function setAdminUserRole(userId, role) {
    const s = currentUser();
    if (!AuthService.roleAtLeast(s.role, "SUPER_ADMIN")) throw new Error("Chỉ Super Admin mới đổi được quyền tài khoản khác.");
    return update("accounts", "adminUsers", userId, { role });
  }

  function setAdminUserBanned(userId, banned) {
    const s = currentUser();
    if (!AuthService.roleAtLeast(s.role, "SUPER_ADMIN")) throw new Error("Chỉ Super Admin mới khoá/mở được tài khoản khác.");
    return update("accounts", "adminUsers", userId, { banned: !!banned });
  }

  function deleteAdminUser(userId) {
    const s = currentUser();
    if (!AuthService.roleAtLeast(s.role, "SUPER_ADMIN")) throw new Error("Chỉ Super Admin mới xoá được tài khoản khác.");
    if (userId === s.userId) throw new Error("Không thể tự xoá tài khoản đang đăng nhập.");
    return remove("accounts", "adminUsers", userId);
  }

  return {
    list, create, update, remove, toggleEnabled,
    getConfig, setConfig,
    adjustPlayerGold, adjustPlayerExp, setPlayerLevel, resetPlayerProgress, deletePlayer, setPlayerBanned,
    setStageWaves, setStageOrder,
    exportSnapshot, importSnapshot, resetAllData,
    listAdminUsers, createAdminUser, setAdminUserRole, setAdminUserBanned, deleteAdminUser,
    diffSummary,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AdminService;
