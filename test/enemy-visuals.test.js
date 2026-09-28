/* Regression (Node, DOM-less) cho ngoại hình riêng từng loại địch.
   Chạy: node test/enemy-visuals.test.js
   Nạp three.js THẬT của dự án (vendor/three.min.js) + js/enemy-visuals.js. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const sb = { console, Math, JSON, Object, Array, Map, Set, Date, String, Number, window: {}, performance: { now: () => 0 } };
sb.self = sb; sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(fs.readFileSync(path.join(root, "vendor/three.min.js"), "utf8"), sb);
vm.runInContext(fs.readFileSync(path.join(root, "js/enemy-visuals.js"), "utf8"), sb);
const THREE = sb.THREE || vm.runInContext("THREE", sb);
const EV = vm.runInContext("EnemyVisuals", sb);
const mat = (c, o) => new THREE.MeshLambertMaterial({ color: new THREE.Color(c), transparent: !!(o && o.opacity !== undefined), opacity: o && o.opacity !== undefined ? o.opacity : 1, emissive: new THREE.Color((o && o.emissive) || 0) });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };

const ENEMIES = ["quan_su_quan","ky_binh","truong_giap","cung_thu_dich","tuong_giac","thiet_ky","cung_no_tong","dieu_hau","thay_mo","khien_chan","ma_binh","quy_tot","tho_phi"];
const BOSSES = ["boss_hoa_lu","boss_dai_la","boss_bach_dang","boss_hau_nhan_bao","boss_quach_quan_bien","boss_giac_phuong_bac","boss_nguyen_sieu","boss_do_canh_thac","boss_tong_tien_cong","boss_quyet_chien","miniboss_son_tac","miniboss_ky_tuong","miniboss_chien_than"];

function assemble(typeId, def) {
  const st = EV.build(THREE, typeId, def, mat);
  const rig = new THREE.Group();
  rig.add(st.body); st.parts.forEach((p) => rig.add(p));
  if (st.anim) { st.anim(1.234, 3); st.anim(5.5, 0); }   // anim không được ném lỗi
  rig.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig);
  let meshes = 0; rig.traverse((o) => { if (o.isMesh) meshes++; });
  return { st, box, meshes, size: box.getSize(new THREE.Vector3()) };
}

const sigs = new Map();
for (const id of [...ENEMIES, ...BOSSES]) {
  const def = { color: "#8a4a3a", radius: 12, behavior: id.indexOf("boss") >= 0 ? "boss" : "normal" };
  let r;
  try { r = assemble(id, def); } catch (e) { ok(false, id + " ném lỗi: " + e.message); continue; }
  ok(EV.has(id), id + " phải có kiểu riêng đăng ký");
  ok(r.st.key === id, id + ": key phải là chính nó, có " + r.st.key);
  ok(r.st.body && r.st.body.isMesh, id + ": body phải là Mesh (renderer đổi màu trên body.material)");
  ok(r.meshes >= 5, id + ": quá ít mesh (" + r.meshes + ") - còn giống hình chung");
  ok(r.size.y > (id === "dieu_hau" ? 10 : 18) && r.size.y < 60, id + ": chiều cao bất thường " + r.size.y.toFixed(1));
  ok(r.size.x < 60 && r.size.z < 60, id + ": bề ngang bất thường " + r.size.x.toFixed(1) + "x" + r.size.z.toFixed(1));
  ok(r.box.min.y > -12, id + ": chìm sâu dưới đất min.y=" + r.box.min.y.toFixed(1));
  sigs.set(id, r.meshes + "|" + r.size.x.toFixed(0) + "|" + r.size.y.toFixed(0) + "|" + r.size.z.toFixed(0));
  for (const p of r.st.parts) ok(p && p.isObject3D, id + ": part không phải Object3D");
}
ok(EV.ids().length === 26, "phải có đúng 26 kiểu riêng, có " + EV.ids().length);
// mỗi loại địch thường phải có hình khác biệt rõ (chữ ký kích thước+số mesh không trùng nhau)
const seen = new Map();
for (const id of ENEMIES) { const s = sigs.get(id); if (seen.has(s)) ok(false, id + " trùng chữ ký hình với " + seen.get(s)); else seen.set(s, id); }

// đường dự phòng theo behavior cho địch Admin tự tạo (id lạ)
const FB = { dash: "behavior:dash", armored: "behavior:armored", flying: "behavior:flying", healer: "behavior:healer", shield: "behavior:shield", regen: "behavior:regen", splitter: "behavior:splitter", normal: "_default", boss: "_genericBoss" };
for (const [b, key] of Object.entries(FB)) {
  const r = assemble("admin_tu_tao_" + b, { color: "#123456", behavior: b, boss: b === "boss" });
  ok(r.st.key === key, `fallback behavior=${b}: mong ${key}, có ${r.st.key}`);
  ok(r.meshes >= 5, `fallback ${b}: phải dựng được hình đầy đủ`);
}
ok(assemble("boss_admin_moi", { color: "#222222" }).st.key === "_genericBoss", "id bắt đầu boss_ chưa đăng ký -> khung Boss chung");
// dữ liệu rác không được làm sập
for (const bad of [undefined, null, {}, { color: 12345 }, { color: "khong-phai-mau" }]) {
  let threw = false, r = null;
  try { r = assemble("x", bad); } catch (e) { threw = true; }
  ok(!threw && r && r.st.body, "def rác " + JSON.stringify(bad) + " không được làm sập");
}
console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
process.exit(fail ? 1 : 0);
