/* Node regression harness (DOM-less) cho:
   - Hệ thống Điểm danh (DailyRewardService) mới thêm
   - Migration schemaVersion 12 -> 13
   - 2 bug đã fix: ARRAY_COLLECTIONS thiếu "achievements", và
     importSnapshot() thiếu bước ensureGiaiDoan7Fields()

   Chạy: node test/daily-reward.test.js
   Boot THẬT qua storage-service.js + data-service.js (không mock),
   giống cách các harness trước đó (combat/boss/hero-exp/migration...)
   đã làm trong các session trước. */

const fs = require("fs");
const path = require("path");

function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
  };
}

const vm = require("vm");

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

function newSandbox() {
  // Dùng vm.createContext thay vì eval() thường: top-level "const X = ..."
  // của mỗi file (data-service.js, state.js...) chỉ persist qua nhiều lần
  // chạy NẾU dùng chung một vm Context thật sự (Node tạo một Realm riêng
  // với global lexical environment của chính nó) - eval() thường trong
  // Node KHÔNG làm được việc này vì const/let luôn bị nhốt trong scope
  // của chính lệnh eval, kể cả ở chế độ sloppy.
  const sandbox = {
    console,
    window: { localStorage: makeFakeLocalStorage() },
    crypto: global.crypto || require("crypto").webcrypto,
    Date, Math, JSON, Object, Array, String, Number, Boolean,
    Map, Set, Promise, RegExp, Error, TypeError, RangeError,
  };
  vm.createContext(sandbox);

  const run = (relPath) => vm.runInContext(readFile(relPath), sandbox, { filename: relPath });

  run("shared/storage-service.js");
  run("shared/crypto-util.js");
  run("shared/data-service.js");
  run("shared/quest-service.js");
  run("shared/achievement-service.js");
  run("shared/daily-reward-service.js");
  run("shared/admin-service.js");
  run("shared/auth-service.js");
  run("js/state.js");

  const services = vm.runInContext(
    "({ DataService, DailyRewardService, GameState, AdminService, AuthService, QuestService, AchievementService })",
    sandbox
  );
  services.window = sandbox.window;
  return services;
}

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", msg); }
}

async function run() {
  // ---------- Test 1: init() từ trắng, migration lên đúng schemaVersion 13 ----------
  {
    const { DataService } = newSandbox();
    await DataService.init();
    const rewards = DataService.list("dailyRewards");
    assert(rewards.length === 7, "seed mới: phải có đúng 7 record dailyRewards, có " + rewards.length);
    assert(rewards.every((r, i) => r.day === i + 1), "seed mới: day phải là 1..7 đúng thứ tự");
    const player = DataService.get("players", "local_player");
    assert(player.dailyReward && player.dailyReward.streak === 0 && player.dailyReward.lastClaimDate === null,
      "player mới: dailyReward phải khởi tạo {streak:0, lastClaimDate:null}");
  }

  // ---------- Test 2: chuỗi điểm danh 3 ngày liên tiếp ----------
  {
    const { DataService, DailyRewardService } = newSandbox();
    await DataService.init();
    const day1 = new Date(2026, 8, 1, 10, 0, 0); // 2026-09-01
    const day2 = new Date(2026, 8, 2, 9, 0, 0);
    const day3 = new Date(2026, 8, 3, 23, 59, 0);

    let status = DailyRewardService.getStatus(day1);
    assert(status.canClaim === true, "ngày 1: canClaim phải true (chưa từng điểm danh)");
    assert(status.dayInCycle === 1, "ngày 1: dayInCycle xem trước phải là 1, có " + status.dayInCycle);

    let res = DailyRewardService.claim(day1);
    assert(res.ok === true, "ngày 1: claim() phải thành công");
    assert(res.streak === 1 && res.dayInCycle === 1, "ngày 1: streak=1, dayInCycle=1 sau khi claim, có streak=" + res.streak + " dayInCycle=" + res.dayInCycle);

    // Điểm danh lần 2 CÙNG NGÀY phải bị chặn
    let blocked = DailyRewardService.claim(day1);
    assert(blocked.ok === false, "cùng ngày: claim() lần 2 phải bị chặn");

    res = DailyRewardService.claim(day2);
    assert(res.ok === true && res.streak === 2 && res.dayInCycle === 2,
      "ngày 2 (kế tiếp): streak phải nối lên 2, dayInCycle=2, có streak=" + res.streak + " dayInCycle=" + res.dayInCycle);

    res = DailyRewardService.claim(day3);
    assert(res.ok === true && res.streak === 3 && res.dayInCycle === 3,
      "ngày 3 (kế tiếp): streak phải nối lên 3, dayInCycle=3, có streak=" + res.streak);
  }

  // ---------- Test 3: bỏ lỡ 1 ngày -> reset chuỗi về 1 ----------
  {
    const { DataService, DailyRewardService } = newSandbox();
    await DataService.init();
    const day1 = new Date(2026, 8, 1);
    const day2 = new Date(2026, 8, 2);
    const day4 = new Date(2026, 8, 4); // bỏ lỡ ngày 3

    DailyRewardService.claim(day1);
    DailyRewardService.claim(day2); // streak = 2

    let preview = DailyRewardService.getStatus(day4);
    assert(preview.willResetStreak === true, "bỏ lỡ 1 ngày: getStatus() phải báo willResetStreak=true trước khi claim");

    const res = DailyRewardService.claim(day4);
    assert(res.ok === true && res.streak === 1 && res.dayInCycle === 1,
      "bỏ lỡ 1 ngày: claim() phải RESET streak về 1, có streak=" + res.streak);
  }

  // ---------- Test 4: chu kỳ 7 ngày lặp lại (ngày 8 = phần thưởng Ngày 1) ----------
  {
    const { DataService, DailyRewardService } = newSandbox();
    await DataService.init();
    let d = new Date(2026, 0, 1);
    let lastRes;
    for (let i = 0; i < 8; i++) {
      lastRes = DailyRewardService.claim(new Date(d));
      assert(lastRes.ok === true, "chu kỳ liên tục: ngày thứ " + (i + 1) + " claim() phải thành công");
      d.setDate(d.getDate() + 1);
    }
    assert(lastRes.streak === 8, "sau 8 lần điểm danh liên tiếp: streak phải =8 (không bị giới hạn ở 7), có " + lastRes.streak);
    assert(lastRes.dayInCycle === 1, "sau 8 lần điểm danh liên tiếp: dayInCycle phải quay lại =1, có " + lastRes.dayInCycle);
    const rewardDay1 = DailyRewardService.getRewardForDayInCycle(1);
    assert(lastRes.reward.gold === rewardDay1.gold, "ngày 8 phải nhận ĐÚNG phần thưởng của Ngày 1 (chu kỳ lặp lại)");
  }

  // ---------- Test 5: GameState.addPersistentReward() thật sự được cộng vàng ----------
  {
    const { DataService, DailyRewardService, GameState } = newSandbox();
    await DataService.init();
    const before = DataService.get("players", "local_player").gold;
    const res = DailyRewardService.claim(new Date(2026, 5, 1));
    const after = DataService.get("players", "local_player").gold;
    assert(after === before + res.reward.gold, "claim() phải cộng ĐÚNG số gold vào ví bền vững của người chơi (before=" + before + " reward=" + res.reward.gold + " after=" + after + ")");
  }

  // ---------- Test 6: migration idempotent (init() lần 2 không phá dữ liệu đã điểm danh) ----------
  {
    const { DataService, DailyRewardService } = newSandbox();
    await DataService.init();
    DailyRewardService.claim(new Date(2026, 3, 1));
    await DataService.init(); // gọi lại lần 2, mô phỏng reload trang
    const player = DataService.get("players", "local_player");
    assert(player.dailyReward.streak === 1, "init() gọi lại lần 2 không được reset streak đã có, có streak=" + player.dailyReward.streak);
  }

  // ---------- Test 7: mô phỏng nâng cấp từ save CŨ (schemaVersion 12, chưa có dailyReward) ----------
  {
    const { DataService, window } = newSandbox();
    // Seed thủ công một "máy cũ" ở schemaVersion 12: có player nhưng KHÔNG có
    // field dailyReward, và KHÔNG có collection dailyRewards - đúng như một
    // máy thật đã chơi qua Session 14 (v9) trước khi có bản này.
    window.localStorage.setItem("dcv:schema_version", "12");
    window.localStorage.setItem("dcv:collection:players", JSON.stringify([
      { id: "local_player", name: "Người chơi cũ", level: 3, exp: 40, gold: 555, dailyReward: undefined },
    ]));
    // Xoá field dailyReward thật sự (JSON.stringify ở trên sẽ tự bỏ key
    // có value undefined, đúng ý mô phỏng "chưa từng tồn tại field này").
    await DataService.init();
    const player = DataService.get("players", "local_player");
    assert(player.gold === 555, "di trú save cũ: KHÔNG được đổi gold sẵn có của người chơi cũ, có " + player.gold);
    assert(player.dailyReward && player.dailyReward.streak === 0,
      "di trú save cũ: phải vá thêm dailyReward={streak:0,...} mà không mất dữ liệu khác");
    assert(DataService.list("dailyRewards").length === 7, "di trú save cũ: phải seed collection dailyRewards nếu chưa từng có");
  }

  // ---------- Test 8: BUG FIX #1 - DataService.create("achievements", ...) không còn ném lỗi ----------
  {
    const { DataService } = newSandbox();
    await DataService.init();
    let threw = null;
    try {
      DataService.create("achievements", { id: "test_ach_new", name: "Test", condition: {}, reward: {}, enabled: true });
    } catch (e) {
      threw = e;
    }
    assert(threw === null, "BUG FIX: DataService.create('achievements', ...) KHÔNG được ném lỗi nữa, nhưng ném: " + (threw && threw.message));
    assert(DataService.get("achievements", "test_ach_new") !== null, "BUG FIX: achievement mới tạo phải thực sự nằm trong collection");
  }

  // ---------- Test 9: BUG FIX #2 - importSnapshot() từ backup v10 cũ phải chạy ensureGiaiDoan7Fields ----------
  {
    const { DataService } = newSandbox();
    await DataService.init();
    // Lấy 1 hero thật, giả lập nó ở trạng thái CŨ trước Giai đoạn 7 (maxLevel=5)
    const heroesBefore = DataService.list("heroes");
    const oldHeroes = heroesBefore.map((h) => Object.assign({}, h, { maxLevel: 5 }));
    const fakeOldBackup = {
      schemaVersion: 10,
      exportedAt: Date.now(),
      data: {
        heroes: oldHeroes,
        players: DataService.list("players"),
      },
    };
    DataService.importSnapshot(fakeOldBackup);
    const heroesAfter = DataService.list("heroes");
    assert(heroesAfter.every((h) => h.maxLevel === 10),
      "BUG FIX: importSnapshot() từ backup v10 (maxLevel=5) phải tự vá lên maxLevel=10 qua ensureGiaiDoan7Fields(), nhưng có hero maxLevel=" + (heroesAfter.find((h) => h.maxLevel !== 10) || {}).maxLevel);
    assert(DataService.get("players", "local_player").dailyReward !== undefined,
      "BUG FIX: importSnapshot() từ backup cũ cũng phải chạy ensureDailyRewardFields() luôn trong cùng lượt vá");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

run();
