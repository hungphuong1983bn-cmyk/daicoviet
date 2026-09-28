/* =========================================================
   HERO-WEAPONS.JS  (Hệ thống Skill mới + Vũ khí Hero)

   NGUỒN DUY NHẤT quyết định VŨ KHÍ 3D + HIỆU ỨNG CHIẾN ĐẤU riêng của
   từng Tướng khi ra trận, cùng nguyên tắc với js/weapon-visuals.js
   (dùng cho Công trình) nhưng khớp theo ID TƯỚNG thay vì ID tháp:

     dinh_bo_linh -> banner (cờ lệnh)      | le_hoan     -> bow (cung)
     ngo_quyen    -> spear (giáo cọc nhọn) | duong_van_nga -> fan (quạt lụa)
     dinh_lien    -> dualSword (song kiếm) | nguyen_bac  -> shieldSword
     pham_cu_lang -> warDrum (trống trận)  | luu_co      -> fireLance
     van_hanh     -> monkStaff (thiền trượng) | dinh_dien -> warMace (chuỳ sắt)

   Trước đây MỌI Tướng dùng chung đúng một mesh (cloak/head/crown/halo)
   trong renderer3d.js._makeHeroMesh() - chỉ đổi màu áo theo tước hiệu
   (hero-tiers.js), không phân biệt được Tướng nào cầm vũ khí gì. File
   này thêm:
     1) build3D(THREE, heroDef, matFn) -> mảng mesh vũ khí cầm tay, gắn
        thêm vào group Tướng trong renderer3d.js (KHÔNG đụng cloak/head/
        crown/halo cũ, nên tước hiệu vẫn hoạt động y nguyên).
     2) onHit(id, ctx) -> MỘT hiệu ứng chiến đấu phụ, khác nhau theo
        từng vũ khí, kích hoạt mỗi khi Hero.update() (js/entities.js)
        đánh trúng mục tiêu chính. Tách biệt hoàn toàn khỏi sát thương
        gốc của Tướng nên không ảnh hưởng cân bằng heroDamage hiện có.

   AN TOÀN: nếu id không có trong registry (Tướng do Admin tự tạo chưa
   có vũ khí riêng), get()/onHit()/build3D() đều trả về rỗng một cách an
   toàn - Tướng vẫn đánh bình thường, không lỗi/không trắng hình, giống
   hệt nguyên tắc "rơi về mặc định" của WeaponVisuals.
   ========================================================= */

const HeroWeapons = (() => {
  /* ---------------------------------------------------------
     ĐĂNG KÝ VŨ KHÍ THEO ID TƯỚNG (khớp shared/data-service.js)
     weaponType : nhãn mô tả (không dùng để tra cứu, chỉ để đọc code)
     accent     : màu phụ (glow vũ khí, dùng được cho UI sau này)
     build3D    : (THREE, heroDef, matFn) -> mảng THREE.Mesh, đặt trong
                  không gian cục bộ quanh gốc (0,0,0) = vị trí cầm tay,
                  renderer3d.js tự dịch chuyển ra đúng bên hông Tướng.
     onHit      : (ctx) -> hiệu ứng chiến đấu phụ. ctx = {
                    hero: Hero, target: Enemy (đã trúng đòn chính),
                    enemies: Enemy[] (toàn bộ địch còn sống trong trận),
                    run: đối tượng ván đang chơi (Game.run) - có thể
                         undefined khi gọi từ môi trường không đầy đủ,
                         LUÔN kiểm tra tồn tại trước khi dùng.
                  }
     --------------------------------------------------------- */
  const REG = {
    /* ---- Đinh Bộ Lĩnh: cờ lệnh (banner) ---- */
    dinh_bo_linh: {
      weaponType: "banner", accent: "#ffe36b",
      build3D(T, def, mat) {
        const poleMat = mat("#5a4632");
        const pole = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 30, 6), poleMat);
        pole.position.set(0, 8, 0);
        const flag = new T.Mesh(new T.BoxGeometry(10, 7, 0.6), mat(def.color || "#9d2130"));
        flag.position.set(5.2, 18, 0);
        const finial = new T.Mesh(new T.ConeGeometry(1.6, 3, 6), mat("#e8c873", { emissive: 0x3a2d12 }));
        finial.position.set(0, 24, 0);
        return [pole, flag, finial];
      },
      // Cờ lệnh hiệu triệu: mỗi đòn đánh cộng thêm một chút sát thương
      // CHUẨN (xuyên mọi kháng) - tượng trưng cho khí thế ba quân, không
      // đụng tới hệ số heroDamage gốc đã cân bằng.
      onHit(ctx) {
        if (!ctx.target || !ctx.target.alive) return;
        ctx.target.takeDamage(Math.max(1, Math.round(ctx.hero.damage * 0.15)), { damageType: "true" });
        if (typeof EffectManager !== "undefined") EffectManager.spawnSpark(ctx.target.x, ctx.target.y, "#ffe36b", 3);
      },
    },

    /* ---- Lê Hoàn: cung (bow) ---- */
    le_hoan: {
      weaponType: "bow", accent: "#fff2c9",
      build3D(T, def, mat) {
        const bowMat = mat("#3a2a18");
        const half1 = new T.Mesh(new T.TorusGeometry(9, 0.8, 6, 12, Math.PI * 0.62), bowMat);
        half1.rotation.set(0, Math.PI / 2, Math.PI * 0.19);
        half1.position.set(0, 14, 0);
        const half2 = half1.clone();
        half2.rotation.z = -Math.PI * 0.19;
        const string = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 16, 4), mat("#e8dfc4"));
        string.rotation.z = Math.PI / 2;
        string.position.set(4.2, 14, 0);
        return [half1, half2, string];
      },
      // Mưa Tên: đòn đánh của Lê Hoàn xuyên qua, gây thêm sát thương nhẹ
      // lên MỘT địch khác đứng gần mục tiêu chính (không cần địch thẳng
      // hàng thật - đơn giản hoá bằng bán kính, an toàn & rẻ CPU).
      onHit(ctx) {
        if (!ctx.target || !ctx.enemies) return;
        let second = null, bestD = 70;
        for (const e of ctx.enemies) {
          if (!e.alive || e === ctx.target) continue;
          const d = Math.hypot(e.x - ctx.target.x, e.y - ctx.target.y);
          if (d < bestD) { bestD = d; second = e; }
        }
        if (second) {
          second.takeDamage(Math.max(1, Math.round(ctx.hero.damage * 0.4)), { damageType: ctx.hero.dmgType, armorPen: 15 });
          if (typeof EffectManager !== "undefined") EffectManager.spawnBeam(ctx.target.x, ctx.target.y, second.x, second.y, "#fff2c9");
        }
      },
    },

    /* ---- Ngô Quyền: giáo cọc nhọn (spear) ---- */
    ngo_quyen: {
      weaponType: "spear", accent: "#bfe0ff",
      build3D(T, def, mat) {
        const shaft = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 26, 6), mat("#4a3a26"));
        shaft.rotation.z = 0.3;
        shaft.position.set(0, 15, 0);
        const tip = new T.Mesh(new T.ConeGeometry(1.8, 7, 6), mat(def.color || "#2f5d50"));
        tip.rotation.z = 0.3;
        tip.position.set(3.6, 27, 0);
        return [shaft, tip];
      },
      // Bãi Cọc Ngầm: đòn đánh có xác suất làm chậm mục tiêu, tái hiện kế
      // cọc ngầm Bạch Đằng ngay trên chính đòn đánh thường (khác với
      // passive slow_aura vốn chỉ có hiệu lực khi địch lọt vào tầm).
      onHit(ctx) {
        if (!ctx.target || !ctx.target.alive) return;
        if (Math.random() < 0.3) ctx.target.applyStatusEffect({ type: "slow", value: 0.35, duration: 1.5 });
      },
    },

    /* ---- Dương Vân Nga: quạt lụa (fan) ---- */
    duong_van_nga: {
      weaponType: "fan", accent: "#e6d8ff",
      build3D(T, def, mat) {
        const fan = new T.Mesh(new T.CylinderGeometry(0.2, 7, 9, 10, 1, false, 0, Math.PI * 0.75), mat(def.color || "#6a4f9a", { opacity: 0.92 }));
        fan.rotation.set(Math.PI / 2, 0, -0.4);
        fan.position.set(2, 16, 0);
        const rib = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 8, 4), mat("#e8dfc4"));
        rib.position.set(0, 12, 0);
        return [fan, rib];
      },
      // An Dân: đòn đánh có xác suất vỗ về ba quân, hồi một chút HP thành
      // ngay lập tức (rất nhỏ, chỉ là "điểm xuyết" - kỹ năng chủ động An
      // Dân mới là nguồn hồi máu chính).
      onHit(ctx) {
        if (!ctx.run || Math.random() >= 0.25) return;
        ctx.run.hp = Math.min(ctx.run.maxHp, ctx.run.hp + 0.4);
      },
    },

    /* ---- Đinh Liễn: song kiếm (dual sword) ---- */
    dinh_lien: {
      weaponType: "dualSword", accent: "#e6e6e6",
      build3D(T, def, mat) {
        const bladeMat = mat("#c7c7c7");
        const b1 = new T.Mesh(new T.BoxGeometry(0.7, 14, 0.25), bladeMat);
        b1.position.set(-3, 16, 0); b1.rotation.z = 0.25;
        const b2 = b1.clone();
        b2.position.set(3, 16, 0); b2.rotation.z = -0.25;
        const hilt1 = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 3, 6), mat("#4a3a26"));
        hilt1.position.set(-3, 8, 0);
        const hilt2 = hilt1.clone(); hilt2.position.set(3, 8, 0);
        return [b1, b2, hilt1, hilt2];
      },
      // Xung Phong: đòn đánh có xác suất chém liên hoàn (đánh thêm lần 2
      // ngay tức khắc lên cùng mục tiêu với sát thương giảm) - tái hiện
      // đúng phong cách "xung trận" song kiếm liên hoàn.
      onHit(ctx) {
        if (!ctx.target || !ctx.target.alive) return;
        if (Math.random() < 0.25) {
          ctx.target.takeDamage(Math.max(1, Math.round(ctx.hero.damage * 0.5)), { damageType: ctx.hero.dmgType, armorPen: 15 });
          if (typeof EffectManager !== "undefined") EffectManager.spawnSpark(ctx.target.x, ctx.target.y, "#fff2c9", 4);
        }
      },
    },

    /* ---- Nguyễn Bặc: khiên + đoản kiếm (shield + sword) ---- */
    nguyen_bac: {
      weaponType: "shieldSword", accent: "#bcd6e0",
      build3D(T, def, mat) {
        const shield = new T.Mesh(new T.CylinderGeometry(6, 6, 1.2, 10), mat(def.color || "#4a6a7a"));
        shield.rotation.x = Math.PI / 2;
        shield.position.set(-3, 15, 4);
        const boss = new T.Mesh(new T.SphereGeometry(1.6, 8, 6), mat("#dcd0a0"));
        boss.position.set(-3, 15, 4.7);
        const blade = new T.Mesh(new T.BoxGeometry(0.6, 10, 0.25), mat("#c7c7c7"));
        blade.position.set(4, 13, -2);
        return [shield, boss, blade];
      },
      // Hộ Quốc Trận: đòn đánh có xác suất cộng dồn một lớp khiên nhỏ cho
      // thành (dùng MAX với khiên đang có sẵn từ kỹ năng chủ động, không
      // bao giờ làm YẾU đi khiên đang mạnh hơn).
      onHit(ctx) {
        if (!ctx.run || Math.random() >= 0.2) return;
        ctx.run.castleShieldRemaining = Math.max(ctx.run.castleShieldRemaining || 0, 2.5);
        ctx.run.castleShieldValue = Math.max(ctx.run.castleShieldValue || 0, 1);
      },
    },

    /* ---- Phạm Cự Lạng: trống trận (war drum) ---- */
    pham_cu_lang: {
      weaponType: "warDrum", accent: "#e8c873",
      build3D(T, def, mat) {
        const drum = new T.Mesh(new T.CylinderGeometry(5, 5, 6, 12), mat(def.color || "#7a1f2b"));
        drum.rotation.z = Math.PI / 2;
        drum.position.set(2, 14, 0);
        const mallet1 = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 7, 5), mat("#4a3a26"));
        mallet1.position.set(2, 20, 2);
        const mallet2 = mallet1.clone(); mallet2.position.set(2, 20, -2);
        return [drum, mallet1, mallet2];
      },
      // Sấm Sét Trận Tiền: đòn đánh dội một tiếng trống nhỏ, gây thêm sát
      // thương nhẹ diện hẹp quanh mục tiêu chính (khác Mưa Tên của Lê
      // Hoàn ở chỗ đây là nổ quanh 1 điểm, không chọn địch gần nhất).
      onHit(ctx) {
        if (!ctx.target || !ctx.enemies) return;
        for (const e of ctx.enemies) {
          if (!e.alive || e === ctx.target) continue;
          if (Math.hypot(e.x - ctx.target.x, e.y - ctx.target.y) <= 36) {
            e.takeDamage(Math.max(1, Math.round(ctx.hero.damage * 0.3)), { damageType: "physical", armorPen: 10 });
          }
        }
      },
    },

    /* ---- Lưu Cơ: giáo lửa (fire lance) ---- */
    luu_co: {
      weaponType: "fireLance", accent: "#ff7a3d",
      build3D(T, def, mat) {
        const shaft = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 24, 6), mat("#3a2a1a"));
        shaft.rotation.z = 0.3;
        shaft.position.set(0, 15, 0);
        const flame = new T.Mesh(new T.SphereGeometry(2.6, 10, 8), mat("#ff8a3d", { emissive: 0x5a2000 }));
        flame.position.set(3.6, 27, 0);
        return [shaft, flame];
      },
      // Hoả Công: đòn đánh có xác suất mồi thêm một lượt bỏng nhỏ.
      onHit(ctx) {
        if (!ctx.target || !ctx.target.alive) return;
        if (Math.random() < 0.3) ctx.target.applyStatusEffect({ type: "burn", value: 3, duration: 2 });
      },
    },

    /* ---- Vạn Hạnh: thiền trượng (monk staff) ---- */
    van_hanh: {
      weaponType: "monkStaff", accent: "#e6d8ff",
      build3D(T, def, mat) {
        const staff = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 28, 6), mat("#5a4632"));
        staff.position.set(0, 16, 0);
        const ring = new T.Mesh(new T.TorusGeometry(2.6, 0.4, 6, 12), mat("#e8c873", { emissive: 0x3a2d12 }));
        ring.position.set(0, 29, 0);
        const beads = new T.Mesh(new T.SphereGeometry(1, 8, 6), mat("#e6d8ff"));
        beads.position.set(0, 25.5, 0);
        return [staff, ring, beads];
      },
      // Hồi Phục Thành: đòn đánh (dù rất nhẹ) cũng vỗ về ba quân, hồi một
      // chút HP thành - hợp vai trò hỗ trợ thuần tuý của Thiền sư.
      onHit(ctx) {
        if (!ctx.run) return;
        ctx.run.hp = Math.min(ctx.run.maxHp, ctx.run.hp + 0.25);
      },
    },

    /* ---- Đinh Điền: chuỳ sắt (war mace) ---- */
    dinh_dien: {
      weaponType: "warMace", accent: "#ff8a3d",
      build3D(T, def, mat) {
        const handle = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 16, 6), mat("#4a3a26"));
        handle.rotation.z = 0.35;
        handle.position.set(0, 13, 0);
        const head = new T.Mesh(new T.IcosahedronGeometry(3.4, 0), mat("#5a5a5a"));
        head.position.set(4.4, 21, 0);
        return [handle, head];
      },
      // Chuỳ Phá Thiết Giáp: mỗi đòn đánh trực tiếp của Tướng cũng dồn
      // thêm một chút hiệu ứng "sunder" (phá giáp) lên mục tiêu, cùng cơ
      // chế với hào quang bị động + kỹ năng chủ động Phá Giáp Liên Hoàn -
      // ba lớp cùng chủ đề nhưng độc lập, dùng chung MAX nên không cộng
      // dồn vượt mức (xem Enemy.takeDamage() trong js/entities.js).
      onHit(ctx) {
        if (!ctx.target || !ctx.target.alive) return;
        ctx.target.applyStatusEffect({ type: "sunder", value: 0.15, duration: 2.5 });
      },
    },
  };

  function get(id) { return REG[id] || null; }

  function onHit(id, ctx) {
    const v = REG[id];
    if (!v || !v.onHit) return;
    try { v.onHit(ctx); } catch (err) {
      // An toàn tuyệt đối: một vũ khí lỗi (do Admin tự sửa dữ liệu, thiếu
      // enemies/run...) không bao giờ được phép làm crash cả trận đấu.
      if (typeof console !== "undefined" && console.warn) console.warn("[HeroWeapons] onHit lỗi:", id, err);
    }
  }

  function build3D(THREE, id, heroDef, matFn) {
    const v = REG[id];
    if (!v || !v.build3D) return [];
    try { return v.build3D(THREE, heroDef || {}, matFn) || []; } catch (err) {
      if (typeof console !== "undefined" && console.warn) console.warn("[HeroWeapons] build3D lỗi:", id, err);
      return [];
    }
  }

  function accentFor(id) {
    const v = REG[id];
    return (v && v.accent) || "#ffe36b";
  }

  return { get, onHit, build3D, accentFor };
})();

if (typeof module !== "undefined" && module.exports) module.exports = HeroWeapons;
