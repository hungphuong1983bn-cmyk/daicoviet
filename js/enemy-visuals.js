/* =========================================================
   ENEMY-VISUALS.JS  (Ngoại hình riêng cho từng loại quân địch)

   Trước đây renderer3d.js._makeEnemyMesh() dựng MỘT hình duy nhất cho
   mọi địch (thân capsule + đầu tròn) rồi chỉ đổi màu theo def.color,
   nên Kỵ binh, Cung thủ, Thầy mo, Boss... nhìn giống hệt nhau. File này
   là NGUỒN DUY NHẤT quyết định hình dáng, cùng nguyên tắc với
   js/weapon-visuals.js (tháp) và js/hero-weapons.js (Tướng):

     1) Tra theo ID loại địch/Boss (typeId) -> kiểu riêng.
     2) Không có ID (địch Admin tự tạo) -> tra theo def.behavior
        (dash/armored/flying/healer/shield/regen/splitter/boss...).
     3) Vẫn không khớp -> bộ binh mặc định. KHÔNG BAO GIỜ trả về rỗng.

   Quy ước không gian (đơn vị = đơn vị thế giới, địch thường cao ~26,
   renderer tự nhân scale theo def.radius / Boss / Elite):
     - +Z là hướng địch đang nhìn/đi tới; +X là bên tay phải.
     - style.body  : mesh thân chính, renderer đổi màu theo trạng thái
                     (choáng/độc) và phát sáng Boss/Elite.
     - style.parts : các mesh/nhóm phụ (mũ, vũ khí, áo choàng, cánh...).
     - style.anim(t, i) : (tuỳ chọn) hoạt ảnh nhẹ (vũ khí, cánh, chân).
     - style.lift  : (tuỳ chọn) độ nâng cả hình lên khỏi mặt đất (ma).
     - style.height: chiều cao ước lượng, dùng để đặt khiên chắn.
   ========================================================= */

const EnemyVisuals = (() => {
  const SKIN = "#f0d9b5";
  const IRON = "#8d9198";
  const DARK = "#2b2b31";
  const GOLD = "#e8c873";
  const WOOD = "#6b4a2c";

  /* ---------- bộ dựng hình cơ bản ---------- */
  function makeKit(T, m, baseColor) {
    const col = (c) => new T.Color(c);
    const shade = (c, amt) => {   // amt>0: sáng dần về trắng, amt<0: tối dần về đen
      const k = col(c);
      return "#" + k.lerp(col(amt > 0 ? "#ffffff" : "#000000"), Math.min(1, Math.abs(amt))).getHexString();
    };
    const mesh = (geo, c, o) => new T.Mesh(geo, m(c, o));
    const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
    const K = {
      T, m, c: baseColor, shade, at,
      box: (w, h, d, c, o) => mesh(new T.BoxGeometry(w, h, d), c, o),
      cyl: (rt, rb, h, c, o, seg) => mesh(new T.CylinderGeometry(rt, rb, h, seg || 8), c, o),
      cone: (r, h, c, o, seg) => mesh(new T.ConeGeometry(r, h, seg || 8), c, o),
      sph: (r, c, o) => mesh(new T.SphereGeometry(r, 10, 8), c, o),
      ico: (r, c, o) => mesh(new T.IcosahedronGeometry(r, 0), c, o),
      tor: (r, t, c, o, arc) => mesh(new T.TorusGeometry(r, t, 6, 14, arc || Math.PI * 2), c, o),
      dome: (r, c, o) => mesh(new T.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, o),
      group: () => new T.Group(),
    };
    // thân người + đầu (hình gốc cũ, dùng làm nền cho hầu hết kiểu)
    K.torso = (r, len, y, c) => at(mesh(new T.CapsuleGeometry(r || 6, len || 8, 4, 10), c || baseColor), 0, y === undefined ? 11 : y, 0);
    K.head = (y, skin, r) => at(K.sph(r || 4.6, skin || SKIN), 0, y === undefined ? 21 : y, 0);
    K.eyes = (y, z, c, r, dx) => {
      const g = K.group();
      g.add(at(K.sph(r || 0.9, c, { emissive: c }), -(dx || 1.8), y, z), at(K.sph(r || 0.9, c, { emissive: c }), dx || 1.8, y, z));
      return g;
    };
    // vũ khí dài (giáo/thương): trục dọc, hơi chúc về phía trước
    K.spear = (x, z, len, tip, shaft, lean) => {
      const g = K.group();
      g.add(at(K.cyl(0.6, 0.6, len, shaft || WOOD, null, 5), 0, len / 2, 0));
      g.add(at(K.cone(1.7, 5.5, tip || IRON, null, 5), 0, len + 2.6, 0));
      g.position.set(x, 0, z); g.rotation.x = lean === undefined ? 0.18 : lean;
      return g;
    };
    K.sword = (x, z, len, blade, w, tilt) => {
      const g = K.group();
      g.add(at(K.box(w || 1.4, len, 0.5, blade || "#c7cdd3"), 0, len / 2 + 3, 0));
      g.add(at(K.box(4.2, 0.9, 1.3, GOLD), 0, 3, 0));
      g.add(at(K.cyl(0.6, 0.6, 3.4, WOOD, null, 5), 0, 1.3, 0));
      g.position.set(x, 12, z); g.rotation.x = tilt === undefined ? 0.6 : tilt;
      return g;
    };
    K.axe = (x, z, len, blade, double) => {
      const g = K.group();
      g.add(at(K.cyl(0.7, 0.7, len, WOOD, null, 5), 0, len / 2, 0));
      g.add(at(K.box(6.5, 5.5, 0.9, blade || "#aab0b8"), 3.2, len - 3, 0));
      if (double) g.add(at(K.box(6.5, 5.5, 0.9, blade || "#aab0b8"), -3.2, len - 3, 0));
      g.position.set(x, 0, z); g.rotation.x = 0.2;
      return g;
    };
    K.bow = (x, y, z, c) => {
      const outer = K.group(), inner = K.tor(7.5, 0.6, c || "#3a2a18", null, Math.PI);
      inner.rotation.z = -Math.PI / 2;        // vòng cung phình ra +X, hai đầu dọc trục Y
      outer.add(inner); outer.add(at(K.cyl(0.15, 0.15, 15, "#e8dfc4", null, 4), 0, 0, 0));
      outer.rotation.y = -Math.PI / 2;         // +X -> +Z (cung phình ra phía trước)
      outer.position.set(x, y, z);
      return outer;
    };
    K.banner = (x, z, h, flagColor, w) => {
      const g = K.group();
      g.add(at(K.cyl(0.5, 0.5, h, WOOD, null, 5), 0, h / 2, 0));
      const flag = at(K.box(w || 9, 6.5, 0.5, flagColor), (w || 9) / 2, h - 4, 0);
      g.add(flag); g.userData.flag = flag;
      g.position.set(x, 0, z);
      return g;
    };
    K.cape = (w, h, y, z, c) => { const p = at(K.box(w, h, 0.9, c), 0, y, z); p.rotation.x = -0.12; return p; };
    K.aura = (c, r) => {
      const ring = K.tor(r || 16, 0.9, c, { opacity: 0.55, emissive: c });
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.6;
      return ring;
    };
    K.orbit = (n, radius, y, orbR, c) => {
      const g = K.group(); g.position.y = y;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        g.add(at(K.sph(orbR, c, { emissive: c }), Math.cos(a) * radius, Math.sin(a * 2) * 1.5, Math.sin(a) * radius));
      }
      return g;
    };
    // ngựa: trả về { parts, legs } ; rider đặt cao hơn (y ~ 20)
    K.horse = (coat, armor) => {
      const parts = [], legs = [];
      parts.push(at(K.box(8.5, 8, 19, coat), 0, 9, 0));                       // thân
      const neck = at(K.box(4, 9, 4.4, coat), 0, 14.5, 9.5); neck.rotation.x = -0.45; parts.push(neck);
      parts.push(at(K.box(4, 4.2, 8, coat), 0, 18.5, 14));                    // đầu
      parts.push(at(K.cone(0.9, 2.4, coat, null, 4), -1.3, 21.6, 12.2), at(K.cone(0.9, 2.4, coat, null, 4), 1.3, 21.6, 12.2)); // tai
      const tail = at(K.cone(1.6, 9, K.shade(coat, -0.35), null, 5), 0, 9.5, -12); tail.rotation.x = -2.2; parts.push(tail);
      parts.push(at(K.box(1.4, 6, 7, K.shade(coat, -0.4)), 0, 18, 8));        // bờm
      for (const [x, z] of [[-2.7, 6.5], [2.7, 6.5], [-2.7, -6.5], [2.7, -6.5]]) {
        const leg = K.group(); leg.position.set(x, 8, z);
        leg.add(at(K.cyl(1.5, 1.1, 8, K.shade(coat, -0.15), null, 6), 0, -4, 0));
        parts.push(leg); legs.push(leg);
      }
      if (armor) {
        parts.push(at(K.box(9.4, 5.5, 15, armor), 0, 11, 0));                 // giáp ngựa
        parts.push(at(K.box(4.6, 4.6, 3.4, armor), 0, 19.2, 17.4));           // mặt nạ ngựa
      }
      return { parts, legs };
    };
    K.gallop = (legs) => (t, i) => {
      for (let n = 0; n < legs.length; n++) legs[n].rotation.x = Math.sin(t * 11 + i + (n % 2 ? Math.PI : 0)) * 0.55;
    };
    return K;
  }

  /* =========================================================
     KIỂU RIÊNG THEO ID LOẠI ĐỊCH
     ========================================================= */
  const S = {};

  // Quân sứ quân: dân binh, nón lá + giáo ngắn
  S.quan_su_quan = (K) => {
    const body = K.torso(6, 8);
    return { body, height: 27, parts: [
      K.head(),
      K.at(K.cone(7.6, 4.4, "#c9a962", null, 10), 0, 26.4, 0),
      K.at(K.cyl(6.3, 6.3, 1.6, K.shade(K.c, -0.4), null, 10), 0, 9, 0),
      K.at(K.box(1.2, 8, 0.6, "#b23a3a"), 4, 5.5, 5.6),           // dải khố
      K.spear(8.5, 2, 26),
    ] };
  };

  // Kỵ binh: ngựa nâu + kỵ sĩ mũ nhọn, thương có cờ hiệu
  S.ky_binh = (K) => {
    const h = K.horse("#7a5a3a"), body = K.at(K.torso(5, 5, 0, K.c), 0, 21, 0);
    const lance = K.spear(4.8, 1, 24, IRON, WOOD, 0.95); lance.position.y = 21;
    const pennant = K.at(K.box(0.4, 3.2, 5, "#c0392b"), 4.8, 37.5, 12.5);
    return { body, height: 36, anim: K.gallop(h.legs), parts: [
      ...h.parts, K.at(K.head(0, SKIN, 4), 0, 29.5, 0),
      K.at(K.cone(4.4, 6, IRON, null, 8), 0, 35, 0),
      lance, pennant,
    ] };
  };

  // Trường giáp binh: giáp dày dài, giáp vai, mũ sắt vành, giáo dài
  S.truong_giap = (K) => {
    const body = K.torso(7.2, 8);
    return { body, height: 30, parts: [
      K.head(21.5),
      K.at(K.dome(5.6, IRON), 0, 22.4, 0), K.at(K.cyl(6.9, 6.9, 0.8, IRON, null, 12), 0, 22.4, 0),
      K.at(K.sph(3.4, IRON), -8, 18, 0), K.at(K.sph(3.4, IRON), 8, 18, 0),
      K.at(K.cyl(7, 9.6, 8, K.shade(K.c, -0.25), null, 10), 0, 4.5, 0),   // váy giáp dài
      K.at(K.box(3.4, 9, 0.8, "#b8873a"), 0, 13, 7.1),                      // tấm hộ tâm
      K.spear(9.8, 1, 38, IRON, WOOD, 0.1),
    ] };
  };

  // Cung thủ địch: mũ trùm, cung cầm tay, ống tên sau lưng
  S.cung_thu_dich = (K) => {
    const body = K.torso(5.2, 8);
    const quiver = K.at(K.cyl(1.5, 1.5, 10, "#5a3a1f", null, 6), -3, 14, -5.6); quiver.rotation.x = 0.25;
    const arrows = K.group();
    for (let n = -1; n <= 1; n++) arrows.add(K.at(K.cone(0.7, 2, "#eeeeee", null, 4), n * 0.9, 20.5, -6.6));
    return { body, height: 27, parts: [
      K.head(21.2), K.at(K.cone(5.8, 7.5, K.shade(K.c, -0.15), null, 8), 0, 26.2, -0.6),
      quiver, arrows, K.bow(8, 15, 3),
    ] };
  };

  // Tướng giặc: to lớn, mũ sừng có lông đuôi đỏ, áo choàng, gươm lớn
  S.tuong_giac = (K) => {
    const body = K.torso(7, 9);
    const g = K.group();
    for (const s of [-1, 1]) {
      g.add(K.at(K.sph(3.8, IRON), s * 8.4, 19, 0));
      g.add(K.at(K.cone(1.4, 5, IRON, null, 5), s * 9.6, 22.4, 0));
    }
    const horn = (s) => { const c = K.at(K.cone(1.3, 7, "#e8dfc4", null, 6), s * 5, 27.5, 0); c.rotation.z = -s * 0.7; return c; };
    return { body, height: 33, parts: [
      K.head(22.5), K.at(K.dome(5.5, "#7a1f2b"), 0, 23.4, 0), horn(-1), horn(1),
      K.at(K.cone(2, 11, "#c0392b", null, 6), 0, 30, -2),                      // lông đuôi mũ
      K.cape(15, 22, 13, -7, "#5a1620"), g,
      K.sword(10.5, 3, 24, "#d5d9de", 2.6, 0.5),
      K.at(K.cyl(7.3, 7.3, 1.6, GOLD, null, 10), 0, 8, 0),
    ] };
  };

  // Thiết kỵ: ngựa giáp sắt, kỵ sĩ mũ kín, khiên tròn
  S.thiet_ky = (K) => {
    const h = K.horse("#3a3f4a", K.c), body = K.at(K.torso(6, 5, 0, K.shade(K.c, -0.1)), 0, 21.5, 0);
    const lance = K.spear(5.4, 1, 28, IRON, "#3a2f22", 0.95); lance.position.y = 22;
    const shield = K.at(K.cyl(4.2, 4.2, 1, IRON, null, 12), -6.6, 23, 2); shield.rotation.z = Math.PI / 2;
    return { body, height: 38, anim: K.gallop(h.legs), parts: [
      ...h.parts, K.at(K.cyl(4.5, 4.5, 6.5, IRON, null, 8), 0, 31, 0),           // mũ kín
      K.at(K.box(4.6, 0.7, 0.6, DARK), 0, 31.2, 4.4),
      K.at(K.cone(1.8, 8, "#c0392b", null, 5), 0, 38, -1.5),
      lance, shield,
    ] };
  };

  // Cung nỏ Tống: nón Tống rộng vành, nỏ bắn thẳng
  S.cung_no_tong = (K) => {
    const body = K.torso(6, 8);
    const crossbow = K.group();
    crossbow.add(K.box(1.7, 1.7, 12, "#4a3018"));
    crossbow.add(K.at(K.box(13, 1, 1, "#2f2418"), 0, 0.4, 5.5));
    crossbow.add(K.at(K.cone(0.6, 5, "#cfd3d8", null, 4), 0, 1.6, 8));
    crossbow.position.set(5.5, 15, 6); crossbow.children[2].rotation.x = Math.PI / 2;
    return { body, height: 30, parts: [
      K.head(21), K.at(K.cone(9.6, 3.6, "#3a3020", null, 14), 0, 26, 0),
      K.at(K.sph(1, GOLD), 0, 28.2, 0),
      K.at(K.cyl(6.4, 6.4, 1.4, "#c9b26a", null, 10), 0, 9, 0), crossbow,
    ] };
  };

  // Diều hâu trinh sát: chim săn mồi, cánh vỗ
  S.dieu_hau = (K) => {
    const body = K.at(K.sph(5, K.c), 0, 13, 0); body.scale.set(0.9, 0.85, 1.7);
    const wing = (s) => {
      const g = K.group(); g.position.set(s * 3.5, 14.5, 0);
      g.add(K.at(K.box(9, 0.7, 7, K.shade(K.c, -0.15)), s * 4.5, 0, 0));
      g.add(K.at(K.box(8, 0.6, 5, K.shade(K.c, -0.4)), s * 12, 0, -0.6));
      return g;
    };
    const wl = wing(-1), wr = wing(1);
    const beak = K.at(K.cone(1.3, 4.2, "#e0b13a", null, 5), 0, 15.6, 11.4); beak.rotation.x = Math.PI / 2;
    return { body, height: 24, parts: [
      K.at(K.sph(3.1, K.shade(K.c, 0.2)), 0, 16.4, 7.4), beak,
      K.at(K.sph(0.7, "#111111"), -1.8, 17.2, 9), K.at(K.sph(0.7, "#111111"), 1.8, 17.2, 9),
      K.at(K.box(3.4, 0.5, 7, K.shade(K.c, -0.35)), 0, 12.6, -9.4),
      wl, wr,
    ], anim: (t, i) => { const a = Math.sin(t * 13 + i) * 0.7; wl.rotation.z = a; wr.rotation.z = -a; } };
  };

  // Thầy mo: áo choàng dài, mặt nạ, mũ lông vũ, trượng có cầu sáng
  S.thay_mo = (K) => {
    const body = K.at(K.cone(9, 23, K.c, null, 9), 0, 12, 0);
    const feathers = K.group();
    ["#3fae63", "#c0392b", "#e8c873", "#3fae63", "#c0392b"].forEach((c, n) => {
      const f = K.at(K.cone(1.1, 9, c, null, 4), (n - 2) * 2.2, 29.4, -1); f.rotation.z = -(n - 2) * 0.28; feathers.add(f);
    });
    const orbs = K.orbit(3, 11, 15, 1.4, "#7fff9f");
    const staff = K.group(); staff.position.set(9.5, 0, 2);
    staff.add(K.at(K.cyl(0.6, 0.6, 30, "#4a3a26", null, 5), 0, 15, 0), K.at(K.sph(2.6, "#7fff9f", { emissive: "#2a8f4a" }), 0, 32, 0));
    return { body, height: 33, parts: [
      K.at(K.sph(4.4, "#e8e0d0"), 0, 24, 0), K.eyes(24.6, 3.9, "#1a1a1a", 0.8, 1.6),
      K.at(K.box(0.8, 5, 0.5, "#c0392b"), 0, 23, 4.3), feathers,
      K.at(K.tor(6.4, 0.7, "#e8e0d0"), 0, 19, 0), staff, orbs,
    ], anim: (t, i) => { orbs.rotation.y = t * 1.8 + i; } };
  };

  // Lính khiên chắn: khiên chữ nhật lớn phía trước, mũ phẳng
  S.khien_chan = (K) => {
    const body = K.torso(6.6, 8);
    const shield = K.group(); shield.position.set(0, 12, 8.2);
    shield.add(K.box(13, 17, 1.8, K.shade(K.c, 0.15)), K.at(K.box(13.8, 1.2, 2.2, IRON), 0, 8.6, 0),
      K.at(K.box(13.8, 1.2, 2.2, IRON), 0, -8.6, 0), K.at(K.sph(2.2, GOLD), 0, 0, 1.2));
    return { body, height: 27, parts: [
      K.head(21.5), K.at(K.cyl(5.2, 5.6, 2.4, IRON, null, 10), 0, 25.4, 0),
      K.at(K.box(1.2, 4, 0.8, IRON), 0, 22.6, 4.6), shield, K.sword(-8.6, 0, 14, "#c7cdd3", 1.6, 0.1),
    ] };
  };

  // Ma binh: hồn ma trong suốt, mắt phát sáng, lưỡi gươm ma
  S.ma_binh = (K) => {
    const body = K.at(K.cone(7.6, 22, K.c, { opacity: 0.72 }, 10), 0, 12, 0);
    const rags = K.group();
    for (let n = 0; n < 5; n++) {
      const a = (n / 5) * Math.PI * 2, r = K.at(K.cone(1.9, 6, K.c, { opacity: 0.55 }, 5), Math.cos(a) * 5.4, 0.5, Math.sin(a) * 5.4);
      r.rotation.x = Math.PI; rags.add(r);
    }
    const blade = K.group(); blade.position.set(8.6, 15, 3);
    blade.add(K.at(K.box(1.4, 16, 0.6, "#8fe8ff", { emissive: "#3aa0c0", opacity: 0.85 }), 0, 8, 0));
    return { body, height: 30, lift: 5, parts: [
      K.at(K.dome(5.4, K.shade(K.c, -0.35), { opacity: 0.8 }), 0, 22.6, 0),
      K.at(K.sph(4.3, K.shade(K.c, 0.1), { opacity: 0.8 }), 0, 21.6, 0),
      K.eyes(22, 3.7, "#8fe8ff", 1.05, 1.7), rags, blade,
    ], anim: (t, i) => { blade.rotation.z = Math.sin(t * 2.4 + i) * 0.25 - 0.2; } };
  };

  // Quỷ tốt: tiểu quỷ lùn mập, sừng, nanh, chùy gai
  S.quy_tot = (K) => {
    const body = K.at(K.sph(7.6, K.c), 0, 9.5, 0); body.scale.set(1.05, 0.95, 1);
    const spikes = K.group();
    for (let n = -1; n <= 1; n++) { const s = K.at(K.cone(1.6, 5, K.shade(K.c, -0.35), null, 5), n * 3.6, 12 - Math.abs(n) * 1.2, -7); s.rotation.x = -1.1; spikes.add(s); }
    const horn = (s) => { const c = K.at(K.cone(1.4, 6, "#e8dfc4", null, 5), s * 3.2, 22.6, 0); c.rotation.z = -s * 0.35; return c; };
    const tusk = (s) => { const c = K.at(K.cone(0.7, 3, "#ffffff", null, 4), s * 2.2, 15.4, 4.3); c.rotation.x = -0.4; return c; };
    const club = K.group(); club.position.set(9.4, 2, 3);
    club.add(K.at(K.cyl(0.9, 1.3, 15, "#4a3018", null, 6), 0, 7.5, 0), K.at(K.cyl(2.9, 1.8, 6.5, "#5a4a3a", null, 7), 0, 15.5, 0));
    for (let n = 0; n < 4; n++) { const a = n * Math.PI / 2; club.add(K.at(K.cone(0.7, 2.2, IRON, null, 4), Math.cos(a) * 2.6, 15.5, Math.sin(a) * 2.6)); }
    club.rotation.x = 0.25;
    return { body, height: 26, parts: [
      K.at(K.sph(5.4, K.shade(K.c, 0.18)), 0, 17.4, 0), horn(-1), horn(1), tusk(-1), tusk(1),
      K.eyes(18.6, 4.6, "#ffd23f", 0.95, 2), spikes, club,
    ] };
  };

  // Thổ phỉ: khăn bịt mặt, áo rách, hai dao găm
  S.tho_phi = (K) => {
    const body = K.torso(5.5, 8);
    const dagger = (s) => { const g = K.sword(s * 8.4, 3.5, 9, "#b8bec5", 1.2, 0.9); g.rotation.z = -s * 0.25; return g; };
    return { body, height: 26, parts: [
      K.head(21), K.at(K.cyl(4.9, 4.9, 1.7, "#b23a3a", null, 10), 0, 23.4, 0),
      K.at(K.box(1.2, 4.6, 0.5, "#b23a3a"), 2.4, 22.4, -4.6),
      K.at(K.box(7.6, 2.8, 1, DARK), 0, 20, 4), K.eyes(21.8, 4.2, "#111111", 0.55, 1.6),
      K.at(K.sph(3.6, "#6b4a2c"), -5.8, 17.5, 0), K.at(K.cyl(5.9, 5.9, 1.4, "#3a2a18", null, 10), 0, 8.6, 0),
      dagger(-1), dagger(1),
    ] };
  };

  /* =========================================================
     BOSS + MINI BOSS (mỗi tên một dáng riêng)
     ========================================================= */
  const bossAura = (K, c, r) => { const a = K.aura(c, r || 18); return { a, anim: (t) => { a.scale.setScalar(1 + Math.sin(t * 2.4) * 0.07); a.rotation.z = t * 0.6; } }; };

  S.boss_hoa_lu = (K) => {   // Sứ Quân Hoả Long: giáp vảy rồng, mũ rồng lửa, kiếm lửa
    const body = K.torso(7.6, 10), aura = bossAura(K, "#ff7a3d", 18);
    const flames = K.group(), fl = [];
    for (let n = -2; n <= 2; n++) { const f = K.at(K.cone(1.6, 9 - Math.abs(n), "#ff8a3d", { emissive: "#c2410c" }, 5), n * 2.2, 33.5, -1); f.rotation.z = -n * 0.22; flames.add(f); fl.push(f); }
    const horn = (s) => { const c = K.at(K.cone(1.6, 9, "#c45a20", null, 6), s * 5.4, 29, 0); c.rotation.z = -s * 0.85; return c; };
    const blade = K.group(); blade.position.set(11.5, 12, 3);
    blade.add(K.at(K.box(2.4, 25, 0.7, "#ff7a3d", { emissive: "#c2410c" }), 0, 14, 0), K.at(K.box(6, 1, 1.4, GOLD), 0, 2, 0));
    blade.rotation.x = 0.5;
    return { body, height: 38, parts: [
      aura.a, K.head(23.5), K.at(K.dome(6.2, "#8a1f14"), 0, 24.6, 0), horn(-1), horn(1), flames,
      K.at(K.sph(4.4, "#c45a20"), -9, 20, 0), K.at(K.sph(4.4, "#c45a20"), 9, 20, 0),
      K.at(K.box(9, 9, 1.4, "#c45a20"), 0, 14, 7.6), K.cape(17, 24, 14, -8, "#5a1208"), blade,
    ], anim: (t, i) => { aura.anim(t); fl.forEach((f, n) => { f.scale.y = 1 + Math.sin(t * 9 + n + i) * 0.22; }); } };
  };

  S.boss_dai_la = (K) => {   // Cao Chính Bình: quan đô hộ, mũ cánh chuồn, hốt ngọc
    const body = K.at(K.cone(10.4, 27, K.c, null, 10), 0, 14, 0), aura = bossAura(K, "#e8c873", 17);
    const wing = (s) => K.at(K.box(11, 1, 3.4, "#15121c"), s * 9.5, 30.6, 0);
    return { body, height: 38, parts: [
      aura.a, K.head(27), K.at(K.cyl(4.6, 4.6, 5.4, "#15121c", null, 10), 0, 31, 0), wing(-1), wing(1),
      K.at(K.cone(1.9, 6.5, "#1a1a1a", null, 5), 0, 24.4, 3.6).rotateX(Math.PI),        // râu
      K.at(K.tor(9.2, 0.9, GOLD), 0, 15, 0),
      K.at(K.box(3.4, 11, 0.7, "#cfeee0", { emissive: "#2a5a48" }), 8, 19, 6),         // hốt ngọc
      K.at(K.cyl(9.5, 9.5, 0.8, GOLD, null, 16), 0, 24, -7).rotateX(Math.PI / 2),       // vầng vàng sau lưng
    ], anim: aura.anim };
  };

  S.boss_bach_dang = (K) => {   // Thuỷ Tặc Chúa: thuỷ tặc, neo sắt khổng lồ, vòng nước
    const body = K.torso(7.6, 10), water = K.aura("#3fb7c9", 19);
    const anchor = K.group(); anchor.position.set(11, 0, 2);
    anchor.add(K.at(K.cyl(0.9, 0.9, 30, "#4a4a52", null, 6), 0, 15, 0), K.at(K.box(9, 1.2, 1.2, "#4a4a52"), 0, 26, 0),
      K.at(K.tor(4.6, 0.9, "#4a4a52", null, Math.PI), 0, 3, 0).rotateZ(Math.PI), K.at(K.tor(1.6, 0.5, "#4a4a52"), 0, 31, 0));
    return { body, height: 36, parts: [
      water, K.head(23), K.at(K.cone(11, 4.4, K.shade(K.c, -0.4), null, 12), 0, 28, 0),
      K.at(K.cone(1.3, 10, "#e8dfc4", null, 4), 5, 31, -2).rotateZ(-0.6),                 // lông vũ mũ
      K.at(K.box(3.2, 3.2, 0.6, DARK), 1.8, 23.6, 4.5),                                     // bịt mắt
      K.at(K.tor(7.6, 0.9, "#c9a962"), 0, 9, 0), K.at(K.sph(2.6, "#d9d2c0"), -8, 19, 0), K.at(K.sph(2.6, "#d9d2c0"), 8, 19, 0),
      K.cape(15, 20, 13, -7.4, K.shade(K.c, -0.45)), anchor,
    ], anim: (t) => { water.scale.setScalar(1 + Math.sin(t * 2) * 0.09); } };
  };

  S.boss_hau_nhan_bao = (K) => {   // Hầu Nhân Bảo: mũ hổ, đại đao
    const body = K.torso(8, 10), aura = bossAura(K, "#b8873a", 17);
    const glaive = K.group(); glaive.position.set(11.5, 0, 1);
    glaive.add(K.at(K.cyl(0.8, 0.8, 38, "#4a3018", null, 6), 0, 19, 0), K.at(K.box(1.4, 13, 6, "#cfd3d8"), 0, 39, 1.8), K.at(K.cone(1.4, 5, "#cfd3d8", null, 5), 0, 47, 0));
    glaive.rotation.x = 0.1;
    const ear = (s) => K.at(K.cone(1.9, 3.6, "#d9a24a", null, 5), s * 4.6, 31.4, 0);
    const stripe = (x) => K.at(K.box(0.8, 3.2, 0.5, DARK), x, 27.6, 5.8);
    return { body, height: 36, parts: [
      aura.a, K.head(23.4), K.at(K.dome(6.3, "#d9a24a"), 0, 24.6, 0), ear(-1), ear(1), stripe(-1.6), stripe(0), stripe(1.6),
      K.at(K.sph(4.4, "#d9a24a"), -9.4, 20, 0), K.at(K.sph(4.4, "#d9a24a"), 9.4, 20, 0),
      K.at(K.cyl(8.2, 11.2, 9, K.shade(K.c, -0.25), null, 10), 0, 4.5, 0), glaive,
    ], anim: aura.anim };
  };

  S.boss_quach_quan_bien = (K) => {   // Quách Quân Biện: quân sư-tướng, cờ lệnh lưng, quạt lông
    const body = K.torso(7, 10), aura = bossAura(K, "#8fb4d9", 17);
    const banner = K.banner(0, -7, 46, K.shade(K.c, 0.3), 12); banner.position.y = 2;
    const fan = K.group(); fan.position.set(9.6, 17, 4);
    for (let n = -2; n <= 2; n++) { const f = K.at(K.cone(1.5, 9, "#f4f1ea", null, 4), 0, 4.5, 0); f.rotation.z = -n * 0.3; f.scale.z = 0.3; fan.add(f); }
    return { body, height: 36, parts: [
      aura.a, K.head(23.2), K.at(K.dome(5.6, K.shade(K.c, -0.2)), 0, 24.2, 0),
      K.at(K.cone(1.2, 15, "#f4f1ea", null, 5), 0, 34, -2).rotateX(-0.4),                    // lông chim dài
      K.at(K.box(15, 20, 0.8, K.shade(K.c, -0.3)), 0, 13, -7).rotateX(-0.12),
      K.at(K.box(3.4, 3.4, 8, "#e8dfc4"), -6, 10, 6.4), banner, fan,
    ], anim: (t, i) => { aura.anim(t); const f = banner.userData.flag; if (f) f.rotation.y = Math.sin(t * 3 + i) * 0.35; } };
  };

  S.boss_giac_phuong_bac = (K) => {   // Đại Tướng Xâm Lăng: áo lông thú, mũ sừng lớn, đại kiếm
    const body = K.torso(8, 10), aura = bossAura(K, "#7a4ad9", 19);
    const horn = (s) => { const c = K.at(K.cone(2, 13, "#d9d2c0", null, 6), s * 7, 29.4, 0); c.rotation.z = -s * 0.9; return c; };
    const sword = K.group(); sword.position.set(12, 8, 3);
    sword.add(K.at(K.box(3.4, 32, 0.9, "#5a5a70", { emissive: "#1a1030" }), 0, 19, 0), K.at(K.box(8, 1.4, 1.6, GOLD), 0, 3, 0));
    sword.rotation.x = 0.45;
    return { body, height: 38, parts: [
      aura.a, K.head(23.6), K.at(K.dome(6.4, "#2a1f3a"), 0, 24.8, 0), horn(-1), horn(1),
      K.eyes(24, 4.4, "#ff3030", 0.9, 2.1),
      K.at(K.sph(6, "#4a3a55"), -9.6, 19, 0), K.at(K.sph(6, "#4a3a55"), 9.6, 19, 0), K.at(K.tor(8.2, 2.4, "#5a4a66"), 0, 17.6, 0),
      K.cape(17, 24, 13, -8, "#1a1226"), sword,
    ], anim: aura.anim };
  };

  S.boss_nguyen_sieu = (K) => {   // Nguyễn Siêu: mũ gạc nai, rìu song đầu, trống trận sau lưng
    const body = K.torso(7.6, 10), aura = bossAura(K, "#6fbf4a", 17);
    const antler = (s) => {
      const g = K.group(); g.position.set(s * 3.6, 28, 0);
      const a = K.at(K.cone(1, 10, "#d9d2c0", null, 5), 0, 5, 0); a.rotation.z = -s * 0.4;
      const b = K.at(K.cone(0.8, 6, "#d9d2c0", null, 5), s * 3, 6, 0); b.rotation.z = -s * 0.9;
      g.add(a, b); return g;
    };
    const drum = K.at(K.cyl(5.4, 5.4, 4.6, "#8a4a1f", null, 12), 0, 16, -7.4); drum.rotation.x = Math.PI / 2;
    return { body, height: 37, parts: [
      aura.a, K.head(23.2), K.at(K.dome(5.6, "#4a7a2f"), 0, 24.2, 0), antler(-1), antler(1),
      K.at(K.sph(4.4, "#b08a3a"), -9, 19.6, 0), K.at(K.sph(4.4, "#b08a3a"), 9, 19.6, 0),
      K.at(K.tor(5.4, 0.7, "#e8c873"), 0, 16, -7.4), drum, K.axe(11.4, 2, 32, "#aab0b8", true),
    ], anim: aura.anim };
  };

  S.boss_do_canh_thac = (K) => {   // Đỗ Cảnh Thạc: mũ sọ, chùy gai, khiên gai
    const body = K.torso(7.6, 10), aura = bossAura(K, "#d94a4a", 17);
    const shield = K.group(); shield.position.set(-9.6, 15, 3);
    const disc = K.cyl(6.6, 6.6, 1.4, "#3a2626", null, 12); disc.rotation.z = Math.PI / 2; shield.add(disc);
    for (let n = 0; n < 6; n++) { const a = (n / 6) * Math.PI * 2, sp = K.at(K.cone(0.9, 3.4, IRON, null, 4), -1.6, Math.cos(a) * 3.6, Math.sin(a) * 3.6); sp.rotation.z = Math.PI / 2; shield.add(sp); }
    const mace = K.group(); mace.position.set(11.4, 0, 3);
    mace.add(K.at(K.cyl(0.9, 0.9, 24, "#3a2f22", null, 6), 0, 12, 0), K.at(K.ico(5, "#5a5a5a"), 0, 26, 0));
    for (let n = 0; n < 6; n++) { const a = (n / 6) * Math.PI * 2, sp = K.at(K.cone(1, 3.2, IRON, null, 4), Math.cos(a) * 5, 26 + (n % 2 ? 2 : -2), Math.sin(a) * 5); sp.lookAt(0, 0, 0); mace.add(sp); }
    return { body, height: 36, parts: [
      aura.a, K.head(23.2), K.at(K.dome(5.6, "#3a1616"), 0, 24.2, 0), K.at(K.sph(3.4, "#efe8d8"), 0, 30.4, 1), K.eyes(30.6, 3.9, "#111111", 0.8, 1.2),
      K.at(K.cone(1.3, 5, "#efe8d8", null, 5), -3.6, 29, 0), K.at(K.cone(1.3, 5, "#efe8d8", null, 5), 3.6, 29, 0),
      K.at(K.sph(4, "#d9d2c0"), -8.6, 19.6, 0), K.at(K.sph(4, "#d9d2c0"), 8.6, 19.6, 0), shield, mace,
    ], anim: aura.anim };
  };

  S.boss_tong_tien_cong = (K) => {   // Nguyên Soái Liêu Đông: vương miện, hai cờ lệnh, gậy soái
    const body = K.at(K.cone(10, 24, K.c, null, 10), 0, 13, 0), aura = bossAura(K, "#c9a0ff", 19);
    const crown = K.group(); crown.position.y = 30;
    crown.add(K.cyl(5.2, 5.2, 5, GOLD, { emissive: "#3a2d12" }, 10));
    for (let n = 0; n < 5; n++) { const a = (n / 5) * Math.PI * 2; crown.add(K.at(K.cone(1, 4.6, GOLD, { emissive: "#3a2d12" }, 4), Math.cos(a) * 4.4, 4.6, Math.sin(a) * 4.4)); }
    const b1 = K.banner(-6, -7, 44, K.shade(K.c, 0.25), 10), b2 = K.banner(6, -7, 44, K.shade(K.c, 0.25), 10);
    const baton = K.group(); baton.position.set(9.4, 0, 5);
    baton.add(K.at(K.cyl(0.8, 0.8, 24, GOLD, null, 6), 0, 12, 0), K.at(K.sph(2.4, "#c9a0ff", { emissive: "#5a2f9a" }), 0, 25, 0));
    return { body, height: 42, parts: [
      aura.a, K.head(26), crown, K.cape(18, 24, 15, -8, "#20122a"), K.at(K.tor(9.6, 1, GOLD), 0, 17, 0),
      K.at(K.sph(5.4, "#5a4a66"), -8, 22, 0), K.at(K.sph(5.4, "#5a4a66"), 8, 22, 0), b1, b2, baton,
    ], anim: (t, i) => { aura.anim(t); for (const b of [b1, b2]) if (b.userData.flag) b.userData.flag.rotation.y = Math.sin(t * 3 + i) * 0.3; } };
  };

  S.boss_quyet_chien = (K) => {   // Ma Vương Thập Nhị Sứ Quân: sừng khổng lồ, 12 quả cầu quay, lưỡi hái đen
    const body = K.torso(8.4, 12), aura = bossAura(K, "#e0203a", 22);
    const orbs = K.orbit(12, 15, 20, 1.5, "#ff3a4a");
    const horn = (s) => {
      const g = K.group();
      const a = K.at(K.cone(2.4, 12, "#2a0a10", null, 6), s * 5, 30, 0); a.rotation.z = -s * 0.5;
      const b = K.at(K.cone(1.6, 9, "#2a0a10", null, 6), s * 10.6, 37, 0); b.rotation.z = -s * 0.15;
      g.add(a, b); return g;
    };
    const crown = K.group(); crown.position.y = 28;
    for (let n = 0; n < 7; n++) { const a = (n / 7) * Math.PI * 2; crown.add(K.at(K.cone(0.9, 4.4, "#ff3a4a", { emissive: "#7a0a18" }, 4), Math.cos(a) * 5, 2, Math.sin(a) * 5)); }
    const scythe = K.group(); scythe.position.set(12.4, 0, 4);
    scythe.add(K.at(K.cyl(0.9, 0.9, 40, "#1a1a1a", null, 6), 0, 20, 0));
    const blade = K.at(K.tor(9, 1.5, "#2a2a30", { emissive: "#3a0a10" }, Math.PI * 0.75), 0, 40, 0); blade.rotation.z = Math.PI * 0.6; scythe.add(blade);
    return { body, height: 44, parts: [
      aura.a, K.head(24, "#8a2a32", 5.4), K.eyes(24.6, 4.8, "#ffd23f", 1.1, 2.2), horn(-1), horn(1), crown,
      K.cape(20, 30, 14, -9, "#20050a"), K.at(K.sph(5.4, "#3a0a12"), -10, 21, 0), K.at(K.sph(5.4, "#3a0a12"), 10, 21, 0),
      orbs, scythe,
    ], anim: (t, i) => { aura.anim(t); orbs.rotation.y = t * 1.4 + i; } };
  };

  /* ---- Mini Boss ---- */
  S.miniboss_son_tac = (K) => {   // Sơn tặc đầu lĩnh: áo lông, dao chặt lớn, sọ treo hông
    const body = K.torso(7, 9);
    const hair = K.group();
    for (let n = -2; n <= 2; n++) { const c = K.at(K.cone(1.3, 5, "#2a1a10", null, 4), n * 1.9, 26.6, -0.4); c.rotation.z = -n * 0.3; hair.add(c); }
    const skulls = K.group();
    for (let n = -1; n <= 1; n++) skulls.add(K.at(K.sph(1.5, "#efe8d8"), n * 4.2, 8, 6.6));
    const cleaver = K.group(); cleaver.position.set(10, 8, 3);
    cleaver.add(K.at(K.box(5.4, 16, 0.9, "#b8bec5"), 0, 10, 0), K.at(K.cyl(0.7, 0.7, 5, WOOD, null, 5), 0, 0, 0)); cleaver.rotation.x = 0.5;
    return { body, height: 30, parts: [
      K.head(22), hair, K.at(K.box(3.4, 3.4, 0.6, DARK), 1.8, 22.6, 4.4),
      K.at(K.sph(4.4, "#6b4a2c"), -7.4, 18.6, 0), K.at(K.sph(4.4, "#6b4a2c"), 7.4, 18.6, 0),
      K.at(K.box(15, 3, 6, "#b23a3a"), 0, 17.6, 0.4), K.at(K.cyl(7.4, 7.4, 1.6, "#3a2a18", null, 10), 0, 8.4, 0), skulls, cleaver,
    ] };
  };

  S.miniboss_ky_tuong = (K) => {   // Kỵ tướng tiên phong: ngựa đen, lông mũ lớn, cờ lệnh
    const h = K.horse("#2a2a33", K.shade(K.c, -0.1)), body = K.at(K.torso(6, 6, 0, K.c), 0, 22, 0);
    const banner = K.banner(0, -8, 30, "#c0392b", 9); banner.position.y = 12;
    const lance = K.spear(5.6, 1, 30, IRON, "#3a2f22", 0.95); lance.position.y = 22.5;
    return { body, height: 42, anim: K.gallop(h.legs), parts: [
      ...h.parts, K.head(31, SKIN, 4.4), K.at(K.dome(4.9, IRON), 0, 32, 0),
      K.at(K.cone(1.6, 12, "#c0392b", null, 5), 0, 40, -2).rotateX(-0.5),
      K.cape(13, 16, 21, -6, K.shade(K.c, -0.4)), banner, lance,
    ] };
  };

  S.miniboss_chien_than = (K) => {   // Chiến thần vây thành: khiên tháp, phá thành chuỳ gỗ trên vai
    const body = K.torso(8, 10);
    const ram = K.group(); ram.position.set(5, 21, 0);
    const log = K.cyl(2.8, 2.8, 30, "#5a4028", null, 8); log.rotation.x = Math.PI / 2; ram.add(log);
    ram.add(K.at(K.sph(3.4, "#4a4a52"), 0, 0, 15.6), K.at(K.tor(3, 0.6, "#4a4a52"), 0, 0, 6).rotateY(0), K.at(K.tor(3, 0.6, "#4a4a52"), 0, 0, -6));
    const tower = K.group(); tower.position.set(-9.6, 13, 2);
    tower.add(K.box(2, 22, 11, K.shade(K.c, 0.15)), K.at(K.box(2.6, 22, 1.4, IRON), 0, 0, 5.4), K.at(K.box(2.6, 22, 1.4, IRON), 0, 0, -5.4));
    const horn = (s) => { const c = K.at(K.cone(1.5, 7, IRON, null, 5), s * 5.2, 27.6, 0); c.rotation.z = -s * 0.8; return c; };
    return { body, height: 34, parts: [
      K.head(23), K.at(K.dome(5.9, IRON), 0, 24, 0), K.at(K.box(4.4, 0.8, 0.6, DARK), 0, 23.4, 5), horn(-1), horn(1),
      K.at(K.sph(4.6, IRON), 9.2, 19, 0), K.at(K.cyl(8.2, 8.2, 1.6, GOLD, null, 10), 0, 8, 0), ram, tower,
    ] };
  };

  /* ---------- Bộ tra cứu dự phòng theo hành vi (địch Admin tự tạo) ---------- */
  const BY_BEHAVIOR = {
    dash: S.ky_binh, armored: S.thiet_ky, flying: S.dieu_hau, healer: S.thay_mo,
    shield: S.khien_chan, regen: S.ma_binh, splitter: S.quy_tot,
  };

  // Boss chưa đăng ký (Admin tự tạo): bộ khung Boss chung - mũ sừng + áo choàng + hào quang
  S._genericBoss = (K) => {
    const body = K.torso(8, 10), aura = bossAura(K, K.shade(K.c, 0.3), 18);
    const horn = (s) => { const c = K.at(K.cone(1.8, 10, "#d9d2c0", null, 6), s * 6, 29, 0); c.rotation.z = -s * 0.7; return c; };
    return { body, height: 36, parts: [
      aura.a, K.head(23.4), K.at(K.dome(6.2, K.shade(K.c, -0.3)), 0, 24.6, 0), horn(-1), horn(1),
      K.cape(16, 22, 13, -7.6, K.shade(K.c, -0.45)), K.at(K.sph(4.6, IRON), -9, 20, 0), K.at(K.sph(4.6, IRON), 9, 20, 0),
      K.sword(11.4, 3, 26, "#d5d9de", 2.4, 0.5),
    ], anim: aura.anim };
  };

  function resolve(typeId, def) {
    if (S[typeId] && typeId.charAt(0) !== "_") return { key: typeId, fn: S[typeId] };
    const behavior = def && def.behavior;
    if (def && (def.boss || behavior === "boss" || String(typeId).indexOf("boss_") === 0)) return { key: "_genericBoss", fn: S._genericBoss };
    if (BY_BEHAVIOR[behavior]) return { key: "behavior:" + behavior, fn: BY_BEHAVIOR[behavior] };
    return { key: "_default", fn: S.quan_su_quan };
  }

  /* API chính: dựng hình cho một loại địch.
     Trả về { body, parts, anim, lift, height, key } - LUÔN hợp lệ. Nếu bộ
     dựng riêng lỗi (dữ liệu Admin lạ...) rơi về bộ binh mặc định. */
  function build(THREE, typeId, def, matFn) {
    const d = def || {};
    const K = makeKit(THREE, matFn, d.color || "#8a4a3a");
    const r = resolve(String(typeId || ""), d);
    let out = null;
    try { out = r.fn(K, d); } catch (err) {
      if (typeof console !== "undefined" && console.warn) console.warn("[EnemyVisuals] build lỗi:", typeId, err);
    }
    if (!out || !out.body) out = S.quan_su_quan(K, d);
    out.parts = out.parts || [];
    out.key = r.key;
    return out;
  }

  function has(typeId) { return !!(S[typeId] && String(typeId).charAt(0) !== "_"); }
  function ids() { return Object.keys(S).filter((k) => k.charAt(0) !== "_"); }

  return { build, has, ids };
})();

if (typeof module !== "undefined" && module.exports) module.exports = EnemyVisuals;
