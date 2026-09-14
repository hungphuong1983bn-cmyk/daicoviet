/* =========================================================
   MAIN.JS  (Giai đoạn 2)
   Điểm khởi động ứng dụng.
   DataService.init() phải chạy xong (seed dữ liệu mặc định lần đầu +
   tạo tài khoản admin mặc định) trước khi bất kỳ màn hình nào được
   vẽ, nên toàn bộ luồng khởi động là bất đồng bộ (async).
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  await DataService.init();
  rebuildGameData();
  GameState.loadProgress();

  const player = GameState.getPlayer();
  if (player && player.banned) {
    // Admin đã khoá hồ sơ chơi này (Phần 3). Chặn truy cập toàn bộ
    // menu game, chỉ hiện màn hình thông báo.
    document.getElementById("screen-banned").classList.add("active");
    return;
  }

  UI.init();
  Game.init(document.getElementById("game-canvas"));
  Game.render(); // vẽ khung nền trước khi người chơi bắt đầu
  UI.showScreen("splash");
});
