/* =========================================================
   LOGIN.JS
   Xử lý trang /admin/login.html.
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  await DataService.init();

  if (AuthService.isLoggedIn()) {
    window.location.href = "index.html";
    return;
  }

  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const usernameEl = document.getElementById("login-username");
  const passwordEl = document.getElementById("login-password");
  const submitBtn = document.getElementById("login-submit");

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    errorEl.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Đang đăng nhập...";
    try {
      const result = await AuthService.login(usernameEl.value.trim(), passwordEl.value);
      if (!result.ok) {
        errorEl.textContent = result.error;
        errorEl.classList.remove("hidden");
        submitBtn.disabled = false;
        submitBtn.textContent = "Đăng nhập";
        return;
      }
      window.location.href = "index.html";
    } catch (e) {
      errorEl.textContent = "Có lỗi xảy ra: " + e.message;
      errorEl.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Đăng nhập";
    }
  });
});
