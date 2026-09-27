/* =========================================================
   WEAPON-VISUALS.JS
   NGUỒN DUY NHẤT quyết định HÌNH DẠNG của từng loại vũ khí/tháp/đạn.

   Vấn đề cần sửa: trước đây renderer3d.js và Projectile.draw() chỉ chọn
   hình theo `role` (dps/aoe/control/siege/support...) — chỉ có 4-6 hình
   dùng chung cho 12 loại tháp khác nhau, nên "Cung" và "Nỏ thần" (cùng
   role dps) trông giống hệt nhau, chỉ khác màu.

   File này định nghĩa NGOẠI HÌNH THEO TỪNG ID VŨ KHÍ THẬT (cung_thu,
   no_than, voi_chien...), tách biệt hẳn với role. Nếu một id không có
   trong registry (vũ khí mới thêm ở Admin), hệ thống tự rơi về hình
   theo role như cũ (KHÔNG BAO GIỜ lỗi/trắng hình), nhưng mọi tháp gốc
   của game đều có hình riêng thật sự.

   API dùng ở nơi khác:
     WeaponVisuals.get(id)                       -> mô tả visual (2D+3D+fx)
     WeaponVisuals.drawProjectile2D(ctx, proj)    -> vẽ đạn 2D (game.js/entities.js)
     WeaponVisuals.buildTowerExtras(THREE, def, matFn) -> mesh phụ cho tháp 3D
     WeaponVisuals.buildProjectileGeometry3D(THREE, id, role) -> geometry đạn 3D
     WeaponVisuals.impactKind(projectileLike)     -> loại hiệu ứng va chạm dùng ở EffectManager
   ========================================================= */

const WeaponVisuals = (() => {
  /* ---------------------------------------------------------
     ĐĂNG KÝ VŨ KHÍ THEO ID THẬT (khớp shared/data-service.js)
     shape2D   : hàm vẽ đạn trên canvas 2D, nhận (ctx, proj, size)
     geom3D    : "arrow" | "bolt" | "spike" | "boulder" | "axeBlade" |
                 "rocket" | "shieldPuck" | "fireOrb" | "magicOrb" |
                 "dartNeedle" | "stompRing"  (xem buildProjectileGeometry3D)
     accent    : màu phụ dùng cho glow/hào quang đạn (khác màu chính def.color)
     impact    : loại hiệu ứng va chạm ("pierce"/"slash"/"fire"/"ice"/
                 "poison"/"lightning"/"explosion"/"magic"/"slow"/"blunt")
     tower3D   : hàm build mesh PHỤ gắn thêm lên tháp 3D để đổi silhouette
     --------------------------------------------------------- */
  const REG = {
    cung_thu: {
      geom3D: "arrow", accent: "#fff2c9", impact: "pierce",
      shape2D: drawArrow,
      tower3D: (T, def, mat) => {
        const g = [];
        // Thân cung cong: hai nửa cung uốn ra trước, dựng bằng ống xuyến cắt.
        const bowMat = mat("#3a2a18");
        const half1 = new T.Mesh(new T.TorusGeometry(15, 1.3, 6, 12, Math.PI * 0.62), bowMat);
        half1.rotation.set(0, Math.PI / 2, Math.PI * 0.19);
        half1.position.set(9, 26, 0);
        const half2 = half1.clone();
        half2.rotation.z = -Math.PI * 0.19;
        half2.position.set(9, 26, 0);
        // Dây cung
        const string = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 27, 4), mat("#e8dfc4"));
        string.rotation.z = Math.PI / 2;
        string.position.set(15.5, 26, 0);
        g.push(half1, half2, string);
        return g;
      },
    },
    no_than: {
      geom3D: "bolt", accent: "#bfe0ff", impact: "pierce",
      shape2D: drawBolt,
      tower3D: (T, def, mat) => {
        const g = [];
        const stockMat = mat("#4a3a26");
        // Báng nỏ nằm ngang + 2 cánh nỏ vuông góc (chữ thập) -> khác hẳn cây cung cong.
        const stock = new T.Mesh(new T.BoxGeometry(30, 4, 4), stockMat);
        stock.position.set(6, 24, 0);
        const limb = new T.Mesh(new T.BoxGeometry(3, 3, 26), mat(def.color || "#2f5d50"));
        limb.position.set(14, 24, 0);
        const tip1 = new T.Mesh(new T.ConeGeometry(2, 6, 6), stockMat);
        tip1.rotation.x = Math.PI / 2; tip1.position.set(14, 24, 13.5);
        const tip2 = tip1.clone(); tip2.rotation.x = -Math.PI / 2; tip2.position.set(14, 24, -13.5);
        g.push(stock, limb, tip1, tip2);
        return g;
      },
    },
    voi_chien: {
      geom3D: "stompRing", accent: "#e8d7b0", impact: "blunt",
      shape2D: drawStomp,
      tower3D: (T, def, mat) => {
        const g = [];
        const tuskMat = mat("#f2ead2");
        // 2 ngà voi chìa ra phía trước + bành voi (yên) trên lưng -> khối lớn, bè ngang.
        const t1 = new T.Mesh(new T.ConeGeometry(2.4, 16, 6), tuskMat);
        t1.rotation.z = Math.PI / 2 + 0.3; t1.position.set(16, 16, 6);
        const t2 = t1.clone(); t2.position.set(16, 16, -6);
        const howdah = new T.Mesh(new T.BoxGeometry(20, 10, 16), mat("#7a1f2b"));
        howdah.position.set(-2, 34, 0);
        g.push(t1, t2, howdah);
        return g;
      },
    },
    coc_nhon: {
      geom3D: "spike", accent: "#cbb27a", impact: "slow",
      shape2D: drawSpike,
      tower3D: (T, def, mat) => {
        const g = [];
        const woodMat = mat("#6b4a2f");
        // KHÔNG dựng một khối tháp - thay bằng CỤM CỌC NHỌN cắm lởm chởm,
        // silhouette hoàn toàn khác các tháp trụ tròn khác.
        const positions = [[0, 0], [8, 6], [-7, 5], [5, -7], [-6, -6]];
        for (const [dx, dz] of positions) {
          const h = 14 + Math.random() * 6;
          const spike = new T.Mesh(new T.ConeGeometry(2.6, h, 6), woodMat);
          spike.position.set(dx, h / 2 + 2, dz);
          spike.rotation.set((Math.random() - 0.5) * 0.2, 0, (Math.random() - 0.5) * 0.2);
          g.push(spike);
        }
        return g;
      },
      hideDefaultCore: true,
    },
    may_ban_da: {
      geom3D: "boulder", accent: "#c9b48a", impact: "explosion",
      shape2D: drawBoulder,
      tower3D: (T, def, mat) => {
        const g = [];
        const frameMat = mat("#5a4a3a");
        // Khung máy bắn đá: 2 bánh xe + cánh tay ném dài chếch lên, khác hẳn tháp trụ.
        const wheel1 = new T.Mesh(new T.CylinderGeometry(9, 9, 3, 14), mat("#3a2f22"));
        wheel1.rotation.x = Math.PI / 2; wheel1.position.set(-8, 9, 10);
        const wheel2 = wheel1.clone(); wheel2.position.set(-8, 9, -10);
        const arm = new T.Mesh(new T.BoxGeometry(3, 3, 34), frameMat);
        arm.position.set(4, 26, 6); arm.rotation.x = -0.5;
        const counterWeight = new T.Mesh(new T.SphereGeometry(5, 8, 6), mat("#2a2a2a"));
        counterWeight.position.set(-4, 20, -12);
        g.push(wheel1, wheel2, arm, counterWeight);
        return g;
      },
    },
    riu_chien: {
      geom3D: "axeBlade", accent: "#e6e6e6", impact: "slash",
      shape2D: drawAxe,
      tower3D: (T, def, mat) => {
        const g = [];
        const bladeMat = mat("#c7c7c7");
        // Lưỡi rìu to bản (hình nêm dẹt) gắn ngang trên đầu cán - silhouette rộng bè.
        const blade = new T.Mesh(new T.ConeGeometry(9, 6, 4), bladeMat);
        blade.rotation.z = Math.PI / 2; blade.scale.set(1, 1, 0.35);
        blade.position.set(10, 30, 0);
        const blade2 = blade.clone(); blade2.rotation.z = -Math.PI / 2; blade2.position.set(-10 + 24, 30, 0);
        g.push(blade, blade2);
        return g;
      },
    },
    hoa_tien: {
      geom3D: "rocket", accent: "#ffb35c", impact: "fire",
      shape2D: drawFireRocket,
      tower3D: (T, def, mat) => {
        const g = [];
        const tubeMat = mat("#5a3a2a");
        // Cụm 3 ống phóng tên lửa chĩa chếch lên, khác hẳn nòng đơn của Cung/Nỏ.
        for (const dz of [-6, 0, 6]) {
          const tube = new T.Mesh(new T.CylinderGeometry(2.2, 2.6, 20, 8), tubeMat);
          tube.rotation.z = -0.55;
          tube.position.set(10, 30, dz);
          g.push(tube);
        }
        return g;
      },
    },
    khien_binh: {
      geom3D: "shieldPuck", accent: "#bcd6e0", impact: "slow",
      shape2D: drawShield,
      tower3D: (T, def, mat) => {
        const g = [];
        // Tường khiên phẳng, rộng - hoàn toàn khác các tháp hình trụ/hình nón.
        const wall = new T.Mesh(new T.BoxGeometry(4, 30, 26), mat(def.color || "#4a6a7a"));
        wall.position.set(10, 24, 0);
        const boss = new T.Mesh(new T.SphereGeometry(4, 8, 6), mat("#dcd0a0"));
        boss.position.set(12, 24, 0);
        g.push(wall, boss);
        return g;
      },
    },
    thap_hoa_cong: {
      geom3D: "fireOrb", accent: "#ff7a3d", impact: "fire",
      shape2D: drawFlameJet,
      tower3D: (T, def, mat) => {
        const g = [];
        // Lò lửa: bồn tròn to + ngọn lửa hình nón lượn sóng bên trên.
        const brazier = new T.Mesh(new T.CylinderGeometry(15, 11, 10, 14), mat("#3a2a1a"));
        brazier.position.y = 20;
        const flame = new T.Mesh(new T.ConeGeometry(9, 18, 8), mat("#ff8a3d", { emissive: 0x5a2000 }));
        flame.position.y = 34;
        g.push(brazier, flame);
        return g;
      },
    },
    dao_si: {
      geom3D: "magicOrb", accent: "#c8a8ff", impact: "magic",
      shape2D: drawMagicOrb,
      tower3D: (T, def, mat) => {
        const g = [];
        const robe = new T.Mesh(new T.ConeGeometry(13, 30, 10), mat(def.color || "#6a4f9a"));
        robe.position.y = 22;
        // 3 quả cầu phép bay lượn quanh - dấu hiệu riêng của Đạo sĩ.
        for (let k = 0; k < 3; k++) {
          const orb = new T.Mesh(new T.OctahedronGeometry(2.6, 0), mat("#e6d8ff", { emissive: 0x3a2050 }));
          const a = (k / 3) * Math.PI * 2;
          orb.position.set(Math.cos(a) * 15, 38, Math.sin(a) * 15);
          orb.userData.orbitAngle = a;
          orb.userData.isDaoSiOrb = true;
          g.push(orb);
        }
        g.push(robe);
        return g;
      },
    },
    tam_doc: {
      geom3D: "dartNeedle", accent: "#9ede6a", impact: "poison",
      shape2D: drawPoisonDart,
      tower3D: (T, def, mat) => {
        const g = [];
        // Vạc độc: bồn thấp rộng sủi khói xanh, thấp hơn hẳn các tháp bắn xa.
        const cauldron = new T.Mesh(new T.CylinderGeometry(14, 10, 8, 14), mat("#2f4f2a"));
        cauldron.position.y = 12;
        const fume = new T.Mesh(
          new T.TorusGeometry(6, 2, 6, 16),
          new T.MeshLambertMaterial({ color: 0x7fbf4a, transparent: true, opacity: 0.5 })
        );
        fume.rotation.x = Math.PI / 2; fume.position.y = 20;
        g.push(cauldron, fume);
        return g;
      },
      hideDefaultCore: true,
    },
    trong_dong: {
      geom3D: "fireOrb", accent: "#e8c873", impact: "blunt",
      shape2D: drawArrow, // trống đồng không bắn đạn, chỉ để có fallback an toàn
      tower3D: (T, def, mat) => {
        const g = [];
        // Mặt trống đồng to, dẹt, nằm ngang - khác hẳn mọi tháp bắn tên/đạn khác.
        const drum = new T.Mesh(new T.CylinderGeometry(17, 17, 8, 20), mat(def.color || "#b8862b"));
        drum.rotation.z = 0; drum.position.y = 22;
        const rim = new T.Mesh(new T.TorusGeometry(17, 1, 6, 20), mat("#e8c873"));
        rim.rotation.x = Math.PI / 2; rim.position.y = 26.5;
        g.push(drum, rim);
        return g;
      },
      hideDefaultCore: true,
    },
  };

  /* ---------------------------------------------------------
     ĐẠN 2D - mỗi hàm vẽ MỘT HÌNH DẠNG THẬT SỰ KHÁC NHAU quanh (0,0),
     ctx đã được translate tới vị trí đạn trước khi gọi (xem entities.js).
     --------------------------------------------------------- */
  function aimAngle(proj) {
    if (!proj.target) return 0;
    return -Math.atan2(proj.target.y - proj.y, proj.target.x - proj.x) + Math.PI / 2;
  }

  function drawArrow(ctx, proj, size) {
    ctx.save();
    ctx.rotate(aimAngle(proj));
    ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, size * 1.6); ctx.lineTo(0, -size * 0.4); ctx.stroke();
    ctx.fillStyle = proj.color || "#e8c873";
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.7); ctx.lineTo(size * 0.6, -size * 0.3); ctx.lineTo(-size * 0.6, -size * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBolt(ctx, proj, size) {
    ctx.save();
    ctx.rotate(aimAngle(proj));
    ctx.fillStyle = proj.color || "#bfe0ff";
    ctx.fillRect(-size * 0.28, -size * 1.3, size * 0.56, size * 1.9);
    ctx.fillStyle = "#e8f4ff";
    ctx.beginPath(); ctx.moveTo(0, -size * 1.6); ctx.lineTo(size * 0.4, -size * 1.1); ctx.lineTo(-size * 0.4, -size * 1.1);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawStomp(ctx, proj, size) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.1, 0, Math.PI * 2);
    ctx.strokeStyle = proj.color || "#e8d7b0";
    ctx.lineWidth = 2.4;
    ctx.stroke();
    ctx.fillStyle = "rgba(180,150,100,.35)";
    ctx.beginPath(); ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawSpike(ctx, proj, size) {
    ctx.fillStyle = proj.color || "#cbb27a";
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.4); ctx.lineTo(size * 0.5, size * 0.7); ctx.lineTo(-size * 0.5, size * 0.7);
    ctx.closePath(); ctx.fill();
  }

  function drawBoulder(ctx, proj, size) {
    ctx.save();
    ctx.rotate((proj._age || 0) * 3);
    ctx.fillStyle = proj.color || "#8a7a5a";
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = size * (0.85 + (i % 2 === 0 ? 0.25 : 0));
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawAxe(ctx, proj, size) {
    ctx.save();
    ctx.rotate((proj._age || 0) * 8);
    ctx.fillStyle = proj.color || "#c7c7c7";
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.3);
    ctx.quadraticCurveTo(size * 1.4, -size * 1.1, size * 1.5, 0);
    ctx.quadraticCurveTo(size * 1.4, size * 1.1, 0, size * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#4a3a26"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -size * 0.3); ctx.lineTo(0, size * 0.3); ctx.stroke();
    ctx.restore();
  }

  function drawFireRocket(ctx, proj, size) {
    ctx.save();
    ctx.rotate(aimAngle(proj));
    const grad = ctx.createLinearGradient(0, size * 1.6, 0, -size * 0.6);
    grad.addColorStop(0, "#ffe36b"); grad.addColorStop(0.5, "#ff7a3d"); grad.addColorStop(1, "#c9542a");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.6);
    ctx.quadraticCurveTo(size * 0.9, size * 0.3, 0, size * 1.9);
    ctx.quadraticCurveTo(-size * 0.9, size * 0.3, 0, -size * 1.6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawShield(ctx, proj, size) {
    ctx.fillStyle = proj.color || "#4a6a7a";
    ctx.beginPath();
    ctx.moveTo(0, -size); ctx.lineTo(size * 0.85, -size * 0.3); ctx.lineTo(size * 0.6, size * 0.9);
    ctx.lineTo(0, size * 1.3); ctx.lineTo(-size * 0.6, size * 0.9); ctx.lineTo(-size * 0.85, -size * 0.3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#dcd0a0"; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawFlameJet(ctx, proj, size) {
    ctx.fillStyle = "rgba(255,138,61,.85)";
    ctx.beginPath(); ctx.arc(0, 0, size * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(255,220,140,.9)";
    ctx.beginPath(); ctx.arc(0, 0, size * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  function drawMagicOrb(ctx, proj, size) {
    const t = (proj._age || 0) * 4;
    ctx.fillStyle = "rgba(200,168,255,.85)";
    ctx.beginPath(); ctx.arc(0, 0, size * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#e6d8ff"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, size * 1.6, size * 0.6, t, 0, Math.PI * 2); ctx.stroke();
  }

  function drawPoisonDart(ctx, proj, size) {
    ctx.save();
    ctx.rotate(aimAngle(proj));
    ctx.fillStyle = proj.color || "#9ede6a";
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.5); ctx.lineTo(size * 0.35, size * 0.9); ctx.lineTo(-size * 0.35, size * 0.9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(120,200,80,.5)";
    ctx.beginPath(); ctx.arc(0, size * 0.9, size * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* Rơi về hình theo role cho vũ khí KHÔNG có trong registry (an toàn,
     tương thích mọi nội dung Admin tự tạo). */
  function fallbackByRole(role) {
    switch (role) {
      case "siege": return REG.may_ban_da;
      case "aoe": return REG.hoa_tien;
      case "control": return REG.coc_nhon;
      case "magic": return REG.dao_si;
      default: return REG.cung_thu;
    }
  }

  function get(id, role) {
    return REG[id] || fallbackByRole(role);
  }

  function drawProjectile2D(ctx, proj) {
    const tier = proj.tierIndex || 0;
    const size = (4 + tier * 0.5);
    const v = get(proj.weaponId, proj.role);
    ctx.save();
    ctx.translate(proj.x, proj.y);
    (v.shape2D || drawArrow)(ctx, proj, size);
    ctx.restore();
  }

  function buildTowerExtras(THREE, def, matFn) {
    const v = REG[def.id];
    if (!v || !v.tower3D) return { extras: [], hideDefaultCore: false };
    return { extras: v.tower3D(THREE, def, matFn) || [], hideDefaultCore: !!v.hideDefaultCore };
  }

  function buildProjectileGeometry3D(THREE, id, role) {
    const v = get(id, role);
    switch (v.geom3D) {
      case "bolt": return new THREE.BoxGeometry(2.2, 2.2, 9);
      case "stompRing": return new THREE.TorusGeometry(5, 1.6, 6, 14);
      case "spike": return new THREE.ConeGeometry(3, 8, 5);
      case "boulder": return new THREE.IcosahedronGeometry(6, 0);
      case "axeBlade": return new THREE.ConeGeometry(5, 3, 4);
      case "rocket": return new THREE.ConeGeometry(3, 11, 8);
      case "shieldPuck": return new THREE.CylinderGeometry(4.2, 4.2, 1.6, 6);
      case "fireOrb": return new THREE.SphereGeometry(4.6, 10, 8);
      case "magicOrb": return new THREE.OctahedronGeometry(4.4, 0);
      case "dartNeedle": return new THREE.ConeGeometry(1.6, 9, 6);
      case "arrow":
      default: return new THREE.ConeGeometry(3, 9, 6);
    }
  }

  function accentFor(id, role) { return get(id, role).accent || "#ffe36b"; }

  /* Suy ra loại HIỆU ỨNG VA CHẠM để EffectManager vẽ đúng hình (mục 9/4
     trong yêu cầu): ưu tiên hiệu ứng trạng thái đang áp (poison/burn/freeze/
     stun/slow) vì đó là thứ người chơi cần NHẬN RA ngay, sau đó mới tới
     hình dạng vũ khí, cuối cùng là loại sát thương. */
  function impactKind(proj) {
    switch (proj.effectType) {
      case "poison": return "poison";
      case "burn": return "fire";
      case "freeze": return "ice";
      case "stun": return "lightning";
      case "slow": return "ice";
      case "bleed": return "slash";
      default: break;
    }
    const v = get(proj.weaponId, proj.role);
    if (v.impact) return v.impact;
    return proj.dmgType === "magic" ? "magic" : "blunt";
  }

  return {
    get, drawProjectile2D, buildTowerExtras, buildProjectileGeometry3D,
    accentFor, impactKind,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = WeaponVisuals;
