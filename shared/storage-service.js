/* =========================================================
   STORAGE-SERVICE.JS
   Lớp trừu tượng hoá việc lưu trữ dữ liệu.

   MỤC ĐÍCH:
   Toàn bộ game + admin KHÔNG được gọi thẳng localStorage.getItem/
   setItem ở khắp nơi. Thay vào đó mọi nơi phải đi qua StorageService.
   Nhờ vậy, khi dự án chuyển từ "frontend-only (localStorage)" sang
   "có backend thật (API + database)", ta chỉ cần viết lại NỘI DUNG
   bên trong các hàm của file này (gọi fetch() tới server thay vì
   localStorage) mà KHÔNG cần sửa bất kỳ chỗ nào khác trong game
   hoặc trong admin.

   GIỚI HẠN BẢO MẬT (đọc README.md để biết chi tiết):
   - localStorage là bộ nhớ phía trình duyệt, người dùng có toàn quyền
     đọc/sửa/xoá bằng DevTools. Vì vậy nó KHÔNG PHẢI là nơi lưu trữ an
     toàn cho mật khẩu, quyền hạn hay bất cứ dữ liệu nào cần được bảo
     vệ thực sự.
   - Mọi cơ chế "đăng nhập admin" xây dựng trên nền tảng này chỉ có
     tác dụng NGĂN NGƯỜI DÙNG BÌNH THƯỜNG vô tình vào nhầm khu vực
     quản trị, KHÔNG ngăn được người có chủ đích can thiệp mã nguồn.
   ========================================================= */

const StorageService = (() => {
  const NAMESPACE = "dcv"; // Đại Cồ Việt

  function nsKey(key) {
    return `${NAMESPACE}:${key}`;
  }

  function isAvailable() {
    try {
      const testKey = nsKey("__test__");
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  function get(key, fallback = null) {
    try {
      const raw = window.localStorage.getItem(nsKey(key));
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[StorageService] Không đọc được key "${key}":`, e);
      return fallback;
    }
  }

  function set(key, value) {
    try {
      window.localStorage.setItem(nsKey(key), JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[StorageService] Không lưu được key "${key}":`, e);
      return false;
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(nsKey(key));
      return true;
    } catch (e) {
      return false;
    }
  }

  function has(key) {
    return window.localStorage.getItem(nsKey(key)) !== null;
  }

  /* Đọc trực tiếp một key KHÔNG thuộc namespace (dùng để đọc dữ liệu
     phiên bản cũ trước khi có StorageService, phục vụ di trú dữ liệu) */
  function getLegacyRaw(rawKey) {
    try {
      const raw = window.localStorage.getItem(rawKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function keysWithPrefix(prefix) {
    const full = nsKey(prefix);
    const out = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.indexOf(full) === 0) out.push(k.slice(NAMESPACE.length + 1));
    }
    return out;
  }

  function exportAll() {
    const out = {};
    const prefix = NAMESPACE + ":";
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) {
        try {
          out[k.slice(prefix.length)] = JSON.parse(window.localStorage.getItem(k));
        } catch (e) { /* bỏ qua key lỗi */ }
      }
    }
    return out;
  }

  function importAll(obj, { clearFirst = false } = {}) {
    if (clearFirst) clearAll();
    Object.keys(obj || {}).forEach((k) => set(k, obj[k]));
    return true;
  }

  function clearAll() {
    const prefix = NAMESPACE + ":";
    const toRemove = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) toRemove.push(k);
    }
    toRemove.forEach((k) => window.localStorage.removeItem(k));
  }

  return {
    isAvailable,
    get,
    set,
    remove,
    has,
    getLegacyRaw,
    keysWithPrefix,
    exportAll,
    importAll,
    clearAll,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = StorageService;
