/* =========================================================
   DATA.JS  (Giai đoạn 2)
   Phiên bản 1 định nghĩa toàn bộ số liệu game trực tiếp trong file
   này (hard-code). Từ Giai đoạn 2, số liệu thật sự nằm trong
   DataService (shared/data-service.js), được lưu ở localStorage và
   có thể chỉnh sửa qua /admin.

   File này chỉ còn nhiệm vụ: dựng lại biến toàn cục GAME_DATA đúng
   HÌNH DẠNG mà entities.js / game.js / ui.js của phiên bản 1 đang
   dùng (GAME_DATA.enemyTypes, GAME_DATA.towerTypes, GAME_DATA.levels,
   GAME_DATA.config...), để không phải sửa lại các file đó.

   GAME_DATA được dựng lại (rebuild) mỗi khi:
     - Trang game vừa tải xong (main.js gọi rebuildGameData()).
     - Người chơi bắt đầu/tiếp tục một ván (để lấy dữ liệu mới nhất
       nếu Admin vừa chỉnh sửa ở tab khác).
   ========================================================= */

let GAME_DATA = null;

function rebuildGameData() {
  GAME_DATA = DataService.buildGameData();
  return GAME_DATA;
}
