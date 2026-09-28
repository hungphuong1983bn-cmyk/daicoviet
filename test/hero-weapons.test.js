/* Node regression harness (DOM-less) cho Hệ thống Skill mới + Vũ khí Hero:
   - Migration schemaVersion 13 -> 14 (3 Tướng mới + skill pha_giap_lien_hoan)
   - Cơ chế "sunder" (phá giáp) trong Enemy.takeDamage()
   - HeroWeapons.onHit() cho từng Tướng + an toàn khi id lạ / thiếu ctx
   Chạy: node test/hero-weapons.test.js */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
const readFile = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

function newSandbox() {
  const sandbox = {
    console, window: { localStorage: makeFakeLocalStorage() },
    crypto: global.crypto || require("crypto").webcrypto,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, Promise, RegExp, Error,
  };
  vm.createContext(sandbox);
  const run = (p) => vm.runInContext(readFile(p), sandbox, { filename: p });
  ["shared/storage-service.js", "shared/crypto-util.js", "shared/data-service.js"].forEach(run);
  return { sandbox, run, window: sandbox.window,
    DataService: vm.runInContext("DataService", sandbox) };
}

let pass = 0, fail = 0;
const assert = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };

async function main() {
  // ---- 1. Cài mới: 10 Tướng, skill mới, không còn skill mồ côi ----
  {
    const { DataService, window } = newSandbox();
    await DataService.init();
    const heroes = DataService.list("heroes");
    const skills = DataService.list("skills");
    assert(heroes.length === 10, "cài mới: phải có 10 Tướng, có " + heroes.length);
    assert(window.localStorage.getItem("dcv:schema_version") === "14", "schemaVersion phải là 14");
    const skillIds = new Set(skills.map((s) => s.id));
    assert(skillIds.has("pha_giap_lien_hoan"), "phải có skill pha_giap_lien_hoan");
    for (const h of heroes) assert(skillIds.has(h.skillId), `Tướng ${h.id}: skillId ${h.skillId} không tồn tại`);
    const used = new Set(heroes.map((h) => h.skillId));
    assert(used.has("hoa_cong") && used.has("hoi_phuc_thanh"), "2 skill mồ côi phải đã có Tướng dùng");
    for (const id of ["luu_co", "van_hanh", "dinh_dien"]) {
      const h = heroes.find((x) => x.id === id);
      assert(h && h.maxLevel === 10 && h.enabled === true, `${id}: maxLevel 10 + enabled`);
    }
  }

  // ---- 2. Nâng cấp từ save cũ v13: chỉ THÊM, không đụng dữ liệu Admin đã sửa ----
  {
    const { DataService, window } = newSandbox();
    await DataService.init();
    const heroes = DataService.list("heroes").filter((h) => !["luu_co", "van_hanh", "dinh_dien"].includes(h.id));
    heroes.find((h) => h.id === "le_hoan").heroDamage = 999; // Admin đã sửa
    DataService.replaceAll("heroes", heroes);
    DataService.replaceAll("skills", DataService.list("skills").filter((s) => s.id !== "pha_giap_lien_hoan"));
    window.localStorage.setItem("dcv:schema_version", "13");
    await DataService.init();
    assert(DataService.list("heroes").length === 10, "v13->v14: phải bù đủ 10 Tướng");
    assert(DataService.get("heroes", "le_hoan").heroDamage === 999, "v13->v14: KHÔNG được ghi đè chỉnh sửa Admin");
    assert(DataService.get("skills", "pha_giap_lien_hoan"), "v13->v14: phải bù skill mới");
    assert(window.localStorage.getItem("dcv:schema_version") === "14", "sau nâng cấp phải là 14");
  }

  // ---- 3. Enemy sunder + HeroWeapons ----
  {
    const { sandbox, run } = newSandbox();
    sandbox.EffectManager = { spawnSpark() {}, spawnBeam() {}, shake() {} };
    try {
      run("js/entities.js");
    } catch (e) { console.error("entities.js không nạp được trong sandbox:", e.message); }
    run("js/hero-weapons.js");
    const HW = vm.runInContext("HeroWeapons", sandbox);
    const ids = ["dinh_bo_linh","le_hoan","ngo_quyen","duong_van_nga","dinh_lien","nguyen_bac","pham_cu_lang","luu_co","van_hanh","dinh_dien"];
    for (const id of ids) assert(HW.get(id), "HeroWeapons thiếu " + id);
    // an toàn với id lạ / ctx rỗng
    let threw = false;
    try { HW.onHit("khong_ton_tai", {}); HW.onHit("dinh_dien", {}); HW.onHit("le_hoan", {}); } catch (e) { threw = true; }
    assert(!threw, "onHit không được ném lỗi với id lạ/ctx rỗng");
    assert(Array.isArray(HW.build3D({}, "khong_ton_tai", {}, () => ({}))) && HW.build3D({}, "khong_ton_tai", {}, () => ({})).length === 0, "build3D id lạ phải trả []");

    // hiệu ứng trên đối tượng giả
    const mkEnemy = (x) => ({ alive: true, x, y: 0, hits: [], status: [],
      takeDamage(a, m) { this.hits.push([a, m && m.damageType]); }, applyStatusEffect(s) { this.status.push(s); } });
    const hero = { damage: 20, dmgType: "physical", x: 0, y: 0 };
    const run_ = { hp: 10, maxHp: 20 };
    const t = mkEnemy(0), near = mkEnemy(30), far = mkEnemy(500);
    HW.onHit("dinh_dien", { hero, target: t, enemies: [t], run: run_ });
    assert(t.status.some((s) => s.type === "sunder"), "dinh_dien: phải áp sunder");
    HW.onHit("le_hoan", { hero, target: t, enemies: [t, near, far], run: run_ });
    assert(near.hits.length === 1 && far.hits.length === 0, "le_hoan: chỉ xuyên địch gần");
    HW.onHit("pham_cu_lang", { hero, target: t, enemies: [t, near, far], run: run_ });
    assert(near.hits.length === 2 && far.hits.length === 0, "pham_cu_lang: nổ diện hẹp 36px");
    HW.onHit("van_hanh", { hero, target: t, enemies: [t], run: run_ });
    assert(run_.hp > 10, "van_hanh: hồi thành");
    HW.onHit("dinh_bo_linh", { hero, target: t, enemies: [t], run: run_ });
    assert(t.hits.some((h) => h[1] === "true"), "dinh_bo_linh: sát thương chuẩn");
    HW.onHit("nguyen_bac", { hero, target: t, enemies: [t], run: { castleShieldRemaining: 9, castleShieldValue: 5 } });
  }

  console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
}
main();
