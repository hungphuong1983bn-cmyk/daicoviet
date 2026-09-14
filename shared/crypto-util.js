/* =========================================================
   CRYPTO-UTIL.JS
   Hàm băm mật khẩu phía client bằng Web Crypto API (SubtleCrypto,
   SHA-256 + salt ngẫu nhiên). Dùng để KHÔNG lưu mật khẩu admin dạng
   plaintext trong localStorage.

   CẢNH BÁO QUAN TRỌNG:
   Băm ở PHÍA TRÌNH DUYỆT không tương đương với bảo mật thực sự.
   Vì toàn bộ mã nguồn (kể cả file này) và toàn bộ dữ liệu đã băm đều
   nằm trong tay người dùng, một người có chủ đích hoàn toàn có thể:
     - Đọc trực tiếp danh sách adminUsers trong localStorage.
     - Sửa mã nguồn JS đang chạy trong DevTools để bỏ qua bước kiểm
       tra mật khẩu.
     - Tự tạo lại hash hợp lệ nếu biết thuật toán (vốn công khai ở
       đây).
   SHA-256 + salt ở đây chỉ nhằm mục đích:
     1. Không lộ mật khẩu dạng đọc được ngay khi mở DevTools > Application.
     2. Tạo sẵn kiến trúc (interface) để khi có backend thật, ta thay
        thế bước băm này bằng bcrypt/Argon2 phía server mà không phải
        sửa lại toàn bộ luồng đăng nhập.
   Đây KHÔNG PHẢI giải pháp bảo mật cho môi trường production.
   ========================================================= */

const CryptoUtil = (() => {
  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function randomSaltHex(bytes = 16) {
    const arr = new Uint8Array(bytes);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return bufToHex(arr.buffer);
  }

  async function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && window.isSecureContext !== false) {
      try {
        const data = new TextEncoder().encode(text);
        const digest = await window.crypto.subtle.digest("SHA-256", data);
        return bufToHex(digest);
      } catch (e) {
        console.warn("[CryptoUtil] SubtleCrypto lỗi, dùng fallback hash yếu hơn:", e);
      }
    }
    // Fallback rất yếu (chỉ để trang không bị vỡ khi chạy trên
    // context không hỗ trợ SubtleCrypto, ví dụ mở file:// trên vài
    // trình duyệt cũ). KHÔNG dùng cho production.
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
    }
    return "weakfallback_" + Math.abs(h).toString(16);
  }

  /* Trả về { salt, hash } để lưu vào adminUsers */
  async function hashPassword(plainPassword, salt) {
    const s = salt || randomSaltHex();
    const hash = await sha256Hex(`${s}:${plainPassword}`);
    return { salt: s, hash };
  }

  async function verifyPassword(plainPassword, salt, expectedHash) {
    const { hash } = await hashPassword(plainPassword, salt);
    return hash === expectedHash;
  }

  return { randomSaltHex, sha256Hex, hashPassword, verifyPassword };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CryptoUtil;
