/* =========================================================
   MAIN.JS
   Điểm khởi động ứng dụng.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  GameState.loadProgress();
  UI.init();
  Game.init(document.getElementById("game-canvas"));
  Game.render(); // vẽ khung nền trước khi người chơi bắt đầu
  UI.showScreen("splash");
});
