/* =========================================================
   DAILY-REWARD-SERVICE.JS
   Điểm danh nhận thưởng hàng ngày (mục "Daily Reward" trong spec).
   Khác Quest/Achievement ở chỗ đây là một CHU KỲ LẶP LẠI (7 ngày,
   quay vòng vô hạn) chứ không phải một điều kiện làm-một-lần.

   Định nghĩa phần thưởng từng ngày lấy từ collection "dailyRewards"
   (Admin CRUD được, giống hệt items/rewards - mỗi record có field
   `day` 1..7). Tiến độ điểm danh của người chơi lưu ở
   players[].dailyReward = { streak, lastClaimDate, totalClaims }.

   `lastClaimDate` là chuỗi "YYYY-MM-DD" theo GIỜ MÁY của người chơi
   (không dùng timestamp UTC) - cố ý, vì "một ngày" ở đây nghĩa là một
   ngày lịch mà người chơi trải qua, không phải 24 giờ tuyệt đối.

   Quy tắc chuỗi (streak):
     - Điểm danh lần đầu tiên, hoặc điểm danh sau khi đã BỎ LỠ ít
       nhất 1 ngày lịch -> chuỗi reset về 1.
     - Điểm danh vào đúng ngày lịch kế tiếp ngày đã điểm danh gần nhất
       -> chuỗi +1 (không giới hạn, có thể vượt quá 7).
     - Điểm danh 2 lần trong cùng một ngày lịch -> bị chặn (canClaim
       false), không có "double claim".
     - Phần thưởng của NGÀY hiện tại trong chu kỳ = ((streak-1) % 7) + 1,
       nghĩa là ngày 8, 15, 22... nhận lại đúng phần thưởng của "Ngày 1"
       nhưng streak hiển thị vẫn tăng liên tục (không bị lùi về 1).
   ========================================================= */

const DailyRewardService = (() => {
  function getPlayer() {
    return DataService.get("players", "local_player");
  }

  /* "YYYY-MM-DD" theo giờ máy cục bộ (không dùng toISOString() vì đó
     là giờ UTC, có thể lệch ngày so với người chơi). */
  function todayStr(now) {
    const d = now || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /* Số ngày lịch chênh lệch giữa 2 chuỗi "YYYY-MM-DD" (parse theo UTC
     nửa đêm để tránh lỗi DST/giờ mùa hè làm lệch phép trừ mili-giây). */
  function daysBetween(dateStrA, dateStrB) {
    const a = Date.UTC(...dateStrA.split("-").map(Number));
    const b = Date.UTC(...dateStrB.split("-").map(Number));
    return Math.round((b - a) / 86400000);
  }

  function getRewardTable() {
    const list = DataService.list("dailyRewards").filter((r) => r.enabled !== false);
    return list.slice().sort((a, b) => (a.day || 0) - (b.day || 0));
  }

  function getRewardForDayInCycle(dayInCycle, table) {
    const t = table || getRewardTable();
    if (t.length === 0) return { day: dayInCycle, name: `Ngày ${dayInCycle}`, gold: 0, exp: 0, icon: "🎁" };
    return t.find((r) => r.day === dayInCycle) || t[(dayInCycle - 1) % t.length];
  }

  /* Tính "nếu điểm danh ngay bây giờ thì chuỗi mới sẽ là bao nhiêu",
     dùng chung cho cả getStatus() (xem trước) và claim() (áp dụng
     thật) để 2 nơi không bao giờ lệch logic nhau. */
  function computeNextStreak(dr, today) {
    if (!dr.lastClaimDate) return 1; // chưa từng điểm danh
    const diff = daysBetween(dr.lastClaimDate, today);
    if (diff === 0) return dr.streak || 0; // đã điểm danh hôm nay rồi (không đổi)
    if (diff === 1) return (dr.streak || 0) + 1; // đúng ngày kế tiếp -> nối chuỗi
    return 1; // bỏ lỡ >=1 ngày (hoặc đồng hồ máy lùi lại) -> reset
  }

  function buildCalendar(dayInCycle, claimedToday, table) {
    const t = table || getRewardTable();
    const calendar = [];
    for (let day = 1; day <= 7; day++) {
      const reward = getRewardForDayInCycle(day, t);
      calendar.push({
        day,
        name: reward.name,
        gold: reward.gold || 0,
        exp: reward.exp || 0,
        icon: reward.icon || "🎁",
        // Trong chu kỳ hiện tại: các ngày TRƯỚC dayInCycle đã được nhận từ
        // các lượt điểm danh trước đó của chuỗi này; nếu hôm nay đã nhận,
        // dayInCycle bản thân nó cũng được đánh dấu đã nhận.
        claimed: day < dayInCycle || (day === dayInCycle && claimedToday),
        isToday: day === dayInCycle,
      });
    }
    return calendar;
  }

  /* Trả về trạng thái điểm danh hiện tại để UI hiển thị (không ghi
     dữ liệu gì cả - an toàn gọi nhiều lần, kể cả để chỉ vẽ chấm đỏ
     thông báo trên nút Hub). */
  function getStatus(now) {
    const player = getPlayer();
    if (!player) return null;
    const dr = player.dailyReward || { streak: 0, lastClaimDate: null, totalClaims: 0 };
    const today = todayStr(now);
    const claimedToday = dr.lastClaimDate === today;
    const table = getRewardTable();
    const hypotheticalStreak = computeNextStreak(dr, today);
    const dayInCycle = ((hypotheticalStreak - 1) % 7) + 1;
    return {
      canClaim: !claimedToday,
      streak: dr.streak || 0, // số ngày ĐÃ điểm danh xong (nếu hôm nay đã bấm nhận, dr.streak đã bao gồm hôm nay)
      totalClaims: dr.totalClaims || 0,
      dayInCycle,
      todayReward: getRewardForDayInCycle(dayInCycle, table),
      calendar: buildCalendar(dayInCycle, claimedToday, table),
      willResetStreak: !claimedToday && !!dr.lastClaimDate && daysBetween(dr.lastClaimDate, today) > 1,
    };
  }

  /* Thực hiện điểm danh thật: cộng thưởng bền vững qua
     GameState.addPersistentReward() và ghi lại players[].dailyReward.
     Trả về {ok:false,error} nếu hôm nay đã điểm danh rồi. */
  function claim(now) {
    const player = getPlayer();
    if (!player) return { ok: false, error: "Không tìm thấy hồ sơ người chơi." };
    const dr = player.dailyReward || { streak: 0, lastClaimDate: null, totalClaims: 0 };
    const today = todayStr(now);
    if (dr.lastClaimDate === today) {
      return { ok: false, error: "Hôm nay đã điểm danh rồi, quay lại vào ngày mai nhé." };
    }
    const newStreak = computeNextStreak(dr, today);
    const dayInCycle = ((newStreak - 1) % 7) + 1;
    const reward = getRewardForDayInCycle(dayInCycle);

    const newDr = {
      streak: newStreak,
      lastClaimDate: today,
      totalClaims: (dr.totalClaims || 0) + 1,
    };
    DataService.update("players", player.id, { dailyReward: newDr });
    GameState.addPersistentReward(reward.gold || 0, reward.exp || 0);

    return { ok: true, reward, streak: newStreak, dayInCycle, totalClaims: newDr.totalClaims };
  }

  return { getStatus, claim, todayStr, daysBetween, getRewardForDayInCycle };
})();

if (typeof module !== "undefined" && module.exports) module.exports = DailyRewardService;
