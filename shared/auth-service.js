/* =========================================================
   AUTH-SERVICE.JS
   Đăng nhập/đăng xuất Admin, quản lý phiên (session) và phân quyền
   theo Role. Xây trên nền StorageService + DataService + CryptoUtil.

   ĐỌC KỸ:
   "Frontend-only admin authentication is NOT secure for production."
   Vì toàn bộ logic kiểm tra mật khẩu chạy trong trình duyệt của
   chính người dùng, người dùng có thể sửa mã nguồn JS đang chạy để
   luôn trả về true. Cơ chế này chỉ ngăn truy cập tình cờ, không phải
   một hàng rào bảo mật thực sự. Khi có backend, hãy thay toàn bộ nội
   dung các hàm dưới đây bằng lời gọi API tới server (server kiểm tra
   mật khẩu bằng bcrypt/Argon2 + trả về JWT/session cookie).
   ========================================================= */

const AuthService = (() => {
  const SESSION_KEY = "admin_session";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ

  const ROLES = {
    SUPER_ADMIN: { level: 4, label: "Super Admin" },
    ADMIN: { level: 3, label: "Admin" },
    EDITOR: { level: 2, label: "Editor" },
    MODERATOR: { level: 1, label: "Moderator" },
  };

  /* Ma trận quyền theo section của Admin Dashboard.
     Section không được liệt kê cho một role => role đó không có quyền. */
  const PERMISSIONS = {
    SUPER_ADMIN: ["*"],
    ADMIN: [
      "dashboard", "players", "heroes", "buildings", "enemies", "bosses",
      "stages", "waves", "skills", "quests", "items", "rewards",
      "economy", "config", "backup", "logs",
    ],
    EDITOR: ["dashboard", "heroes", "enemies", "bosses", "stages", "waves"],
    MODERATOR: ["dashboard", "players", "logs"],
  };

  function can(role, section) {
    const perms = PERMISSIONS[role];
    if (!perms) return false;
    return perms.includes("*") || perms.includes(section);
  }

  function roleAtLeast(role, minRole) {
    const a = ROLES[role] ? ROLES[role].level : 0;
    const b = ROLES[minRole] ? ROLES[minRole].level : 99;
    return a >= b;
  }

  async function login(username, password) {
    const users = DataService.list("adminUsers");
    const user = users.find((u) => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user) return { ok: false, error: "Sai tài khoản hoặc mật khẩu." };
    if (user.banned) return { ok: false, error: "Tài khoản đã bị khoá." };
    const valid = await CryptoUtil.verifyPassword(password, user.salt, user.passwordHash);
    if (!valid) return { ok: false, error: "Sai tài khoản hoặc mật khẩu." };

    DataService.update("adminUsers", user.id, { lastLoginAt: Date.now() });

    const session = {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      mustChangePassword: !!user.mustChangePassword,
    };
    StorageService.set(SESSION_KEY, session);
    return { ok: true, session };
  }

  function logout() {
    StorageService.remove(SESSION_KEY);
  }

  function getSession() {
    const s = StorageService.get(SESSION_KEY, null);
    if (!s) return null;
    if (Date.now() > s.expiresAt) {
      logout();
      return null;
    }
    return s;
  }

  function isLoggedIn() {
    return !!getSession();
  }

  function refreshSession() {
    const s = getSession();
    if (!s) return;
    s.expiresAt = Date.now() + SESSION_TTL_MS;
    StorageService.set(SESSION_KEY, s);
  }

  async function changeOwnPassword(currentPassword, newPassword) {
    const session = getSession();
    if (!session) return { ok: false, error: "Chưa đăng nhập." };
    const user = DataService.get("adminUsers", session.userId);
    if (!user) return { ok: false, error: "Không tìm thấy tài khoản." };
    const valid = await CryptoUtil.verifyPassword(currentPassword, user.salt, user.passwordHash);
    if (!valid) return { ok: false, error: "Mật khẩu hiện tại không đúng." };
    if (!newPassword || newPassword.length < 8) {
      return { ok: false, error: "Mật khẩu mới phải có ít nhất 8 ký tự." };
    }
    const { salt, hash } = await CryptoUtil.hashPassword(newPassword);
    DataService.update("adminUsers", user.id, { salt, passwordHash: hash, mustChangePassword: false });
    session.mustChangePassword = false;
    StorageService.set(SESSION_KEY, session);
    return { ok: true };
  }

  /* Guard dùng ở đầu admin/index.html: nếu chưa đăng nhập, đá về login. */
  function requireLogin(redirectTo = "login.html") {
    if (!isLoggedIn()) {
      window.location.href = redirectTo;
      return null;
    }
    refreshSession();
    return getSession();
  }

  return {
    ROLES, PERMISSIONS,
    can, roleAtLeast,
    login, logout, getSession, isLoggedIn, refreshSession,
    changeOwnPassword, requireLogin,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = AuthService;
