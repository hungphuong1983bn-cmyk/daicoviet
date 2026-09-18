/* =========================================================
   APP.JS
   Logic chính của trang /admin/index.html: điều hướng sidebar, và
   toàn bộ 16 mục quản trị.
   ========================================================= */

const AdminApp = {
  session: null,
  currentSection: "dashboard",

  async boot() {
    await DataService.init();
    this.session = AuthService.requireLogin("login.html");
    if (!this.session) return; // đã redirect

    this._renderTopbar();
    this._renderSidebar();
    this._bindGlobalActions();

    if (this.session.mustChangePassword) {
      Components.toast("Vì lý do an toàn, hãy đổi mật khẩu mặc định trước khi dùng lâu dài.", "warn");
    }

    this.goTo("dashboard");
  },

  _renderTopbar() {
    document.getElementById("topbar-username").textContent = this.session.username;
    const roleInfo = AuthService.ROLES[this.session.role];
    document.getElementById("topbar-role").textContent = roleInfo ? roleInfo.label : this.session.role;
  },

  _renderSidebar() {
    const items = [
      ["dashboard", "📊", "Tổng quan"],
      ["players", "👤", "Người chơi"],
      ["heroes", "🧑‍✈️", "Tướng"],
      ["buildings", "🏹", "Công trình"],
      ["enemies", "⚔️", "Quân địch"],
      ["bosses", "👑", "Boss"],
      ["stages", "🗺️", "Màn chơi"],
      ["waves", "🌊", "Wave"],
      ["skills", "✨", "Kỹ năng"],
      ["items", "🎁", "Vật phẩm"],
      ["quests", "📜", "Nhiệm vụ"],
      ["achievements", "🏆", "Thành tích"],
      ["rewards", "🏆", "Phần thưởng"],
      ["economy", "💰", "Kinh tế game"],
      ["config", "⚙️", "Cấu hình game"],
      ["backup", "💾", "Backup / Restore"],
      ["logs", "🧾", "Nhật ký Admin"],
    ];
    const nav = document.getElementById("sidebar-nav");
    nav.innerHTML = items.map(([key, icon, label]) => {
      const allowed = AuthService.can(this.session.role, key);
      return '<button class="side-link ' + (allowed ? "" : "disabled") + '" data-section="' + key + '" ' + (allowed ? "" : "disabled") + '>' +
        '<span class="side-icon">' + icon + '</span><span>' + label + '</span></button>';
    }).join("");
    nav.querySelectorAll(".side-link").forEach((btn) => {
      btn.addEventListener("click", () => this.goTo(btn.dataset.section));
    });
  },

  _bindGlobalActions() {
    document.getElementById("btn-logout").addEventListener("click", () => {
      AuthService.logout();
      window.location.href = "login.html";
    });
    document.getElementById("btn-change-password").addEventListener("click", () => this._openChangePasswordModal());
    document.getElementById("btn-manage-accounts").addEventListener("click", () => this._openAccountsModal());
  },

  goTo(section) {
    if (!AuthService.can(this.session.role, section)) {
      Components.toast("Bạn không có quyền truy cập mục này.", "error");
      return;
    }
    rebuildGameData(); // luôn lấy dữ liệu mới nhất trước khi vẽ mỗi mục
    this.currentSection = section;
    document.querySelectorAll(".side-link").forEach((b) => b.classList.toggle("active", b.dataset.section === section));
    const title = document.getElementById("content-title");
    const body = document.getElementById("content-body");
    body.innerHTML = "";

    const renderers = {
      dashboard: () => this._renderDashboard(body),
      players: () => this._renderPlayers(body),
      stages: () => this._renderStages(body),
      waves: () => this._renderWaves(body),
      economy: () => this._renderEconomy(body),
      config: () => this._renderConfig(body),
      backup: () => this._renderBackup(body),
      logs: () => this._renderLogs(body),
    };
    const titles = {
      dashboard: "Tổng quan", players: "Người chơi", heroes: "Tướng", buildings: "Công trình",
      enemies: "Quân địch", bosses: "Boss", stages: "Màn chơi", waves: "Wave", skills: "Kỹ năng",
      items: "Vật phẩm", quests: "Nhiệm vụ", rewards: "Phần thưởng", achievements: "Thành tích", economy: "Kinh tế game",
      config: "Cấu hình game", backup: "Backup / Restore", logs: "Nhật ký Admin",
    };
    title.textContent = titles[section] || section;

    if (renderers[section]) {
      renderers[section]();
    } else if (ADMIN_SCHEMAS[section]) {
      this._renderGenericSection(body, section);
    } else {
      body.innerHTML = "<p>Chưa hỗ trợ mục này.</p>";
    }
  },

  /* ---------------- TỔNG QUAN ---------------- */
  _renderDashboard(body) {
    const players = DataService.list("players");
    const stages = DataService.list("stages");
    const heroes = DataService.list("heroes");
    const buildings = DataService.list("buildings");
    const enemies = DataService.list("enemies");
    const bosses = DataService.list("bosses");
    const logs = DataService.list("adminLogs").slice(0, 8);

    const totalGold = players.reduce((s, p) => s + (p.gold || 0), 0);
    const totalUnlocked = players.reduce((s, p) => s + ((p.unlockedStages || []).length), 0);
    const wins = players.reduce((s, p) => s + ((p.stats && p.stats.wins) || 0), 0);
    const losses = players.reduce((s, p) => s + ((p.stats && p.stats.losses) || 0), 0);
    let bestWaveTotal = 0;
    players.forEach((p) => Object.values(p.bestWave || {}).forEach((w) => (bestWaveTotal += w)));

    const cards = [
      ["Tổng số người chơi", players.length],
      ["Tổng số màn chơi", stages.length],
      ["Tổng số tướng", heroes.length],
      ["Tổng số công trình", buildings.length],
      ["Tổng số loại quân địch", enemies.length],
      ["Tổng số boss", bosses.length],
      ["Tổng vàng trong hệ thống", totalGold],
      ["Số lượt mở màn (cộng dồn)", totalUnlocked],
      ["Thắng / Thua", wins + " / " + losses],
      ["Tổng wave đã vượt (cộng dồn)", bestWaveTotal],
    ];

    body.innerHTML =
      '<div class="stat-grid">' +
      cards.map(([label, value]) =>
        '<div class="stat-card"><div class="stat-value">' + value + '</div><div class="stat-label">' + label + '</div></div>'
      ).join("") +
      '</div>' +
      '<h3 class="section-subtitle">Hoạt động gần đây</h3>' +
      '<div id="dashboard-logs"></div>';
    this._renderLogTable(document.getElementById("dashboard-logs"), logs);
  },

  /* ---------------- NGƯỜI CHƠI ---------------- */
  _renderPlayers(body) {
    body.innerHTML =
      '<div class="toolbar"><input type="text" id="player-search" class="form-input" placeholder="Tìm theo tên hoặc ID..."></div>' +
      '<div id="players-table"></div>';
    const renderList = () => {
      const q = document.getElementById("player-search").value.trim().toLowerCase();
      const players = DataService.list("players").filter((p) =>
        !q || p.id.toLowerCase().includes(q) || (p.name || "").toLowerCase().includes(q)
      );
      const container = document.getElementById("players-table");
      const rowsHtml = players.map((p) =>
        '<tr data-id="' + p.id + '">' +
          '<td>' + p.id + '</td>' +
          '<td>' + Components.escapeHtml(p.name) + '</td>' +
          '<td>' + p.level + '</td>' +
          '<td>' + p.exp + '</td>' +
          '<td>' + p.gold + '</td>' +
          '<td>' + (p.unlockedStages || []).length + '</td>' +
          '<td>' + (p.heroesOwned || []).length + '</td>' +
          '<td>' + ((p.stats && p.stats.wins) || 0) + '/' + ((p.stats && p.stats.losses) || 0) + '</td>' +
          '<td>' + (p.banned ? "🔒 Đã khoá" : "✅ Hoạt động") + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn btn-tiny" data-act="detail">Chi tiết</button>' +
            '<button class="btn btn-tiny" data-act="gold">+/- Vàng</button>' +
            '<button class="btn btn-tiny" data-act="exp">+/- EXP</button>' +
            '<button class="btn btn-tiny" data-act="level">Level</button>' +
            '<button class="btn btn-tiny" data-act="ban">' + (p.banned ? "Mở khoá" : "Khoá") + '</button>' +
            '<button class="btn btn-tiny btn-danger" data-act="reset">Reset</button>' +
            '<button class="btn btn-tiny btn-danger" data-act="delete">Xoá</button>' +
          '</td>' +
        '</tr>'
      ).join("");
      container.innerHTML =
        '<div class="table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>ID</th><th>Tên</th><th>Level</th><th>EXP</th><th>Vàng</th>' +
        '<th>Màn mở</th><th>Tướng sở hữu</th><th>Thắng/Thua</th><th>Trạng thái</th><th>Thao tác</th>' +
        '</tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="10" class="empty-row">Không có người chơi phù hợp</td></tr>') + '</tbody></table></div>';

      container.querySelectorAll("tr[data-id]").forEach((tr) => {
        const id = tr.getAttribute("data-id");
        const player = players.find((p) => p.id === id);
        tr.querySelector('[data-act="detail"]').onclick = () => this._openPlayerDetail(player);
        tr.querySelector('[data-act="gold"]').onclick = () => {
          const delta = prompt("Nhập số vàng cộng thêm (số âm để trừ):", "0");
          if (delta === null) return;
          AdminService.adjustPlayerGold(player.id, Number(delta) || 0);
          Components.toast("Đã cập nhật vàng.");
          renderList();
        };
        tr.querySelector('[data-act="exp"]').onclick = () => {
          const delta = prompt("Nhập số EXP cộng thêm (số âm để trừ):", "0");
          if (delta === null) return;
          AdminService.adjustPlayerExp(player.id, Number(delta) || 0);
          Components.toast("Đã cập nhật EXP.");
          renderList();
        };
        tr.querySelector('[data-act="level"]').onclick = () => {
          const lv = prompt("Nhập level mới:", String(player.level));
          if (lv === null) return;
          AdminService.setPlayerLevel(player.id, Number(lv) || 1);
          Components.toast("Đã đổi level.");
          renderList();
        };
        tr.querySelector('[data-act="ban"]').onclick = async () => {
          const ok = await Components.confirm(player.banned
            ? "Mở khoá tài khoản này?"
            : "Khoá tài khoản này? Người chơi sẽ không vào được menu chính ở lần mở game tiếp theo.");
          if (!ok) return;
          AdminService.setPlayerBanned(player.id, !player.banned);
          renderList();
        };
        tr.querySelector('[data-act="reset"]').onclick = async () => {
          const ok = await Components.confirm('Reset toàn bộ tiến trình của "' + player.name + '"? Hành động này không thể hoàn tác.', { danger: true, confirmLabel: "Reset" });
          if (!ok) return;
          AdminService.resetPlayerProgress(player.id);
          Components.toast("Đã reset tiến trình người chơi.");
          renderList();
        };
        tr.querySelector('[data-act="delete"]').onclick = async () => {
          const ok = await Components.confirm('Xoá vĩnh viễn hồ sơ "' + player.name + '"?', { danger: true, confirmLabel: "Xoá" });
          if (!ok) return;
          AdminService.deletePlayer(player.id);
          Components.toast("Đã xoá người chơi.");
          renderList();
        };
      });
    };
    document.getElementById("player-search").addEventListener("input", renderList);
    renderList();
  },

  _openPlayerDetail(p) {
    const root = document.getElementById("modal-root");
    root.classList.add("open");
    root.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-box">' +
        '<h3 class="modal-title">Chi tiết: ' + Components.escapeHtml(p.name) + ' (' + p.id + ')</h3>' +
        '<div class="detail-grid">' +
          '<div><strong>Level:</strong> ' + p.level + '</div>' +
          '<div><strong>EXP:</strong> ' + p.exp + '</div>' +
          '<div><strong>Vàng:</strong> ' + p.gold + '</div>' +
          '<div><strong>Tổng số trận:</strong> ' + ((p.stats && p.stats.totalRuns) || 0) + '</div>' +
          '<div><strong>Tổng địch đã diệt:</strong> ' + ((p.stats && p.stats.totalKills) || 0) + '</div>' +
          '<div><strong>Thắng/Thua:</strong> ' + ((p.stats && p.stats.wins) || 0) + '/' + ((p.stats && p.stats.losses) || 0) + '</div>' +
        '</div>' +
        '<p><strong>Màn đã mở:</strong> ' + ((p.unlockedStages || []).join(", ") || "(không)") + '</p>' +
        '<p><strong>Tướng sở hữu:</strong> ' + ((p.heroesOwned || []).join(", ") || "(không)") + '</p>' +
        '<p><strong>Wave tốt nhất mỗi màn:</strong> ' + (Object.entries(p.bestWave || {}).map(([k, v]) => k + ": " + v).join(", ") || "(không)") + '</p>' +
        '<div class="modal-actions"><button class="btn btn-primary" data-act="close">Đóng</button></div>' +
      '</div>';
    root.querySelector('[data-act="close"]').onclick = () => Components.closeModal();
  },

  /* ---------------- CRUD CHUNG ---------------- */
  _renderGenericSection(body, sectionKey) {
    const schema = ADMIN_SCHEMAS[sectionKey];
    body.innerHTML =
      '<div class="toolbar"><button class="btn btn-primary" id="btn-add-item">+ Thêm ' + schema.label + '</button></div>' +
      (schema.hint ? '<p class="field-hint">' + schema.hint + '</p>' : "") +
      '<div id="generic-table"></div>';
    const isQuests = sectionKey === "quests";

    const refresh = () => {
      const items = DataService.list(schema.collection);
      const displayItems = isQuests ? items.map(questToFormValues) : items;
      Components.renderTable(document.getElementById("generic-table"), schema, displayItems, {
        onEdit: (item) => openEdit(item),
        onToggle: (item) => { AdminService.toggleEnabled(sectionKey, schema.collection, item.id); refresh(); },
        onDelete: async (item) => {
          const ok = await Components.confirm('Xoá "' + (item.name || item.id) + '"?', { danger: true, confirmLabel: "Xoá" });
          if (!ok) return;
          AdminService.remove(sectionKey, schema.collection, item.id);
          Components.toast("Đã xoá.");
          refresh();
        },
      });
    };

    const openEdit = (item) => {
      Components.openFormModal({
        title: "Sửa " + schema.label + ": " + (item.name || item.id),
        fields: schema.fields,
        initialValues: item,
        isEdit: true,
        onSubmit: async (values) => {
          const patch = isQuests ? formValuesToQuest(values) : sanitizeValues(schema, values);
          delete patch.id;
          AdminService.update(sectionKey, schema.collection, item.id, patch);
          Components.toast("Đã lưu thay đổi.");
          refresh();
        },
      });
    };

    document.getElementById("btn-add-item").onclick = () => {
      Components.openFormModal({
        title: "Thêm " + schema.label + " mới",
        fields: schema.fields,
        initialValues: {},
        isEdit: false,
        onSubmit: async (values) => {
          if (!values.id) throw new Error("Vui lòng nhập ID.");
          const obj = isQuests ? formValuesToQuest(values) : sanitizeValues(schema, values);
          AdminService.create(sectionKey, schema.collection, obj);
          Components.toast("Đã tạo mới.");
          refresh();
        },
      });
    };

    refresh();
  },

  /* ---------------- MÀN CHƠI ---------------- */
  _renderStages(body) {
    const schema = ADMIN_SCHEMAS.stages;
    body.innerHTML =
      '<div class="toolbar"><button class="btn btn-primary" id="btn-add-stage">+ Thêm màn chơi</button></div>' +
      '<p class="field-hint">' + schema.hint + '</p>' +
      '<div id="stages-table"></div>';

    const refresh = () => {
      const items = DataService.list("stages").sort((a, b) => (a.order || 0) - (b.order || 0)).map(stageToFormValues);
      Components.renderTable(document.getElementById("stages-table"), schema, items, {
        onEdit: (item) => openEdit(item),
        onToggle: (item) => { AdminService.toggleEnabled("stages", "stages", item.id); refresh(); },
        onDelete: async (item) => {
          const ok = await Components.confirm('Xoá màn "' + item.name + '"? Toàn bộ wave của màn này cũng sẽ bị xoá.', { danger: true, confirmLabel: "Xoá" });
          if (!ok) return;
          AdminService.remove("stages", "stages", item.id);
          refresh();
        },
      });
      document.querySelectorAll("#stages-table tr[data-id]").forEach((tr) => {
        const id = tr.getAttribute("data-id");
        const actionsCell = tr.querySelector(".row-actions");
        const btn = document.createElement("button");
        btn.className = "btn btn-tiny";
        btn.textContent = "Sửa Wave";
        btn.onclick = () => { AdminApp._waveStageId = id; AdminApp.goTo("waves"); };
        actionsCell.prepend(btn);
      });
    };

    const openEdit = (item) => {
      Components.openFormModal({
        title: "Sửa màn: " + item.name,
        fields: schema.fields,
        initialValues: item,
        isEdit: true,
        onSubmit: async (values) => {
          const patch = formValuesToStagePatch(values);
          AdminService.update("stages", "stages", item.id, patch);
          Components.toast("Đã lưu thay đổi.");
          refresh();
        },
      });
    };

    document.getElementById("btn-add-stage").onclick = () => {
      Components.openFormModal({
        title: "Thêm màn chơi mới",
        fields: schema.fields,
        initialValues: { order: DataService.list("stages").length + 1, difficulty: 1, enabled: true, unlockConditionType: "stage_cleared" },
        isEdit: false,
        onSubmit: async (values) => {
          if (!values.id) throw new Error("Vui lòng nhập ID.");
          const patch = formValuesToStagePatch(values);
          const firstEnemyId = Object.keys(GAME_DATA.enemyTypes)[0];
          const stage = Object.assign({ id: values.id }, patch, {
            path: [{ x: -40, y: 270 }, { x: 300, y: 270 }, { x: 300, y: 120 }, { x: 650, y: 120 }, { x: 650, y: 400 }, { x: 900, y: 400 }],
            castle: { x: 930, y: 400 },
            buildSpots: [{ x: 150, y: 200 }, { x: 300, y: 380 }, { x: 480, y: 120 }, { x: 480, y: 300 }, { x: 650, y: 250 }, { x: 800, y: 400 }],
            waves: [{ groups: [{ type: firstEnemyId, count: 6, interval: 0.8 }] }],
          });
          AdminService.create("stages", "stages", stage);
          Components.toast("Đã tạo màn chơi mới với bản đồ mặc định. Vào mục Wave để thiết kế đợt chơi.");
          refresh();
        },
      });
    };

    refresh();
  },

  /* ---------------- WAVE ---------------- */
  _renderWaves(body) {
    const stages = DataService.list("stages").sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!stages.length) { body.innerHTML = "<p>Chưa có màn chơi nào. Hãy tạo màn chơi trước.</p>"; return; }
    if (!this._waveStageId || !stages.some((s) => s.id === this._waveStageId)) this._waveStageId = stages[0].id;

    body.innerHTML =
      '<div class="toolbar">' +
        '<label class="form-label" for="wave-stage-select">Chọn màn:</label>' +
        '<select id="wave-stage-select" class="form-input" style="max-width:260px;">' +
          stages.map((s) => '<option value="' + s.id + '" ' + (s.id === this._waveStageId ? "selected" : "") + '>' + s.name + '</option>').join("") +
        '</select>' +
        '<button class="btn btn-primary" id="btn-add-wave">+ Thêm Wave</button>' +
        '<button class="btn" id="btn-save-waves">Lưu thay đổi</button>' +
      '</div>' +
      '<div id="wave-editor"></div>';
    document.getElementById("wave-stage-select").onchange = (e) => {
      this._waveStageId = e.target.value;
      this.goTo("waves");
    };

    const stage = DataService.get("stages", this._waveStageId);
    let waves = JSON.parse(JSON.stringify(stage.waves || []));
    const enemyOptions = Object.keys(GAME_DATA.enemyTypes).filter((id) => !GAME_DATA.enemyTypes[id].boss);
    const bossOptions = DataService.list("bosses");

    const renderEditor = () => {
      const container = document.getElementById("wave-editor");
      container.innerHTML = waves.map((wave, wi) => {
        const groupsHtml = wave.groups.map((g, gi) => {
          if (g.boss) {
            return '<div class="wave-group boss-group" data-gi="' + gi + '">' +
              '<span>👑 Boss:</span>' +
              '<select data-field="boss">' +
                bossOptions.map((b) => '<option value="' + b.id + '" ' + (b.id === g.boss ? "selected" : "") + '>' + b.name + '</option>').join("") +
              '</select>' +
              '<label>Delay(s) <input type="number" min="0" step="0.5" data-field="delay" value="' + (g.delay || 0) + '" style="width:55px;" title="Trễ trước khi nhóm này xuất hiện - dùng cho Phục kích"></label>' +
              '<button class="btn btn-tiny btn-danger" data-act="remove-group">✕</button>' +
            '</div>';
          }
          return '<div class="wave-group" data-gi="' + gi + '">' +
            '<select data-field="type">' +
              enemyOptions.map((id) => '<option value="' + id + '" ' + (id === g.type ? "selected" : "") + '>' + GAME_DATA.enemyTypes[id].name + '</option>').join("") +
            '</select>' +
            '<label>SL <input type="number" min="1" data-field="count" value="' + g.count + '" style="width:55px;"></label>' +
            '<label>Giãn cách(s) <input type="number" min="0.1" step="0.1" data-field="interval" value="' + g.interval + '" style="width:55px;"></label>' +
            '<label>Delay(s) <input type="number" min="0" step="0.5" data-field="delay" value="' + (g.delay || 0) + '" style="width:50px;" title="Trễ trước khi nhóm xuất hiện - Phục kích"></label>' +
            '<label>×Speed <input type="number" min="0" step="0.05" data-field="speedMultiplier" value="' + (g.speedMultiplier || 1) + '" style="width:50px;" title="FAST WAVE"></label>' +
            '<label>×HP <input type="number" min="0" step="0.05" data-field="hpMultiplier" value="' + (g.hpMultiplier || 1) + '" style="width:50px;" title="SWARM/ELITE WAVE"></label>' +
            '<label>+Giáp <input type="number" min="0" step="1" data-field="armorBonus" value="' + (g.armorBonus || 0) + '" style="width:50px;" title="ARMOR WAVE"></label>' +
            '<label>Elite đầu nhóm <input type="number" min="0" step="1" data-field="eliteCount" value="' + (g.eliteCount || 0) + '" style="width:50px;" title="ELITE WAVE"></label>' +
            '<button class="btn btn-tiny btn-danger" data-act="remove-group">✕</button>' +
          '</div>';
        }).join("");
        return '<div class="wave-card" data-wi="' + wi + '">' +
          '<div class="wave-card-head"><strong>Wave ' + (wi + 1) + '</strong><div>' +
            '<button class="btn btn-tiny" data-act="add-group">+ Nhóm quân</button>' +
            '<button class="btn btn-tiny" data-act="add-boss">+ Boss</button>' +
            '<button class="btn btn-tiny btn-danger" data-act="remove-wave">Xoá Wave</button>' +
          '</div></div>' +
          '<div class="wave-meta-row">' +
            '<label>Loại đợt ' +
              '<select data-field="waveType">' +
                ["normal", "survival", "elite", "swarm", "fast", "armor", "boss"].map((t) =>
                  '<option value="' + t + '" ' + ((wave.waveType || "normal") === t ? "selected" : "") + '>' + t + '</option>').join("") +
              '</select></label>' +
            '<label>Sống sót (s, nếu Survival) <input type="number" min="1" data-field="surviveSeconds" value="' + (wave.surviveSeconds || 25) + '" style="width:60px;"></label>' +
            '<label>Cảnh báo (Toast) <input type="text" data-field="warning" value="' + (wave.warning || "").replace(/"/g, "&quot;") + '" style="width:220px;" placeholder="vd. ⚠ ĐỢT NHANH!"></label>' +
            '<label>+Vàng <input type="number" min="0" data-field="reward" value="' + (wave.reward || 0) + '" style="width:55px;"></label>' +
            '<label>+Score <input type="number" min="0" data-field="bonus" value="' + (wave.bonus || 0) + '" style="width:55px;"></label>' +
          '</div>' +
          '<div class="wave-groups">' + groupsHtml + '</div>' +
        '</div>';
      }).join("") || '<p class="empty-row">Chưa có wave nào cho màn này.</p>';

      container.querySelectorAll(".wave-card").forEach((card) => {
        const wi = Number(card.dataset.wi);
        card.querySelector('[data-act="add-group"]').onclick = () => {
          waves[wi].groups.push({ type: enemyOptions[0], count: 5, interval: 0.8 });
          renderEditor();
        };
        card.querySelector('[data-act="add-boss"]').onclick = () => {
          if (!bossOptions.length) { Components.toast("Chưa có Boss nào, hãy tạo ở mục Boss trước.", "error"); return; }
          waves[wi].groups.push({ boss: bossOptions[0].id, interval: 1 });
          renderEditor();
        };
        card.querySelector('[data-act="remove-wave"]').onclick = async () => {
          const ok = await Components.confirm("Xoá Wave " + (wi + 1) + "?", { danger: true, confirmLabel: "Xoá" });
          if (!ok) return;
          waves.splice(wi, 1);
          renderEditor();
        };
        card.querySelectorAll('.wave-meta-row [data-field]').forEach((input) => {
          input.addEventListener("change", () => {
            const field = input.dataset.field;
            const val = input.type === "number" ? Number(input.value) : input.value;
            if (val === "" || val === 0) delete waves[wi][field];
            else waves[wi][field] = val;
          });
        });
        card.querySelectorAll(".wave-group").forEach((groupEl) => {
          const gi = Number(groupEl.dataset.gi);
          groupEl.querySelectorAll("select,input").forEach((input) => {
            input.addEventListener("change", () => {
              const field = input.dataset.field;
              const val = input.type === "number" ? Number(input.value) : input.value;
              // 0/1 nghĩa là "không áp dụng" cho các hệ số nhân - xoá field
              // để engine dùng mặc định, tránh lưu rác "speedMultiplier:1".
              if ((field === "speedMultiplier" || field === "hpMultiplier") && val === 1) delete waves[wi].groups[gi][field];
              else if ((field === "delay" || field === "armorBonus" || field === "eliteCount") && val === 0) delete waves[wi].groups[gi][field];
              else waves[wi].groups[gi][field] = val;
            });
          });
          groupEl.querySelector('[data-act="remove-group"]').onclick = () => {
            waves[wi].groups.splice(gi, 1);
            renderEditor();
          };
        });
      });
    };

    document.getElementById("btn-add-wave").onclick = () => {
      waves.push({ groups: [{ type: enemyOptions[0], count: 5, interval: 0.8 }] });
      renderEditor();
    };
    document.getElementById("btn-save-waves").onclick = () => {
      AdminService.setStageWaves(this._waveStageId, waves);
      Components.toast("Đã lưu wave cho màn " + stage.name + ".");
    };

    renderEditor();
  },

  /* ---------------- KINH TẾ GAME ---------------- */
  _renderEconomy(body) {
    const config = DataService.getConfig();
    const buildings = DataService.list("buildings");
    const heroes = DataService.list("heroes");
    const stages = DataService.list("stages");
    body.innerHTML =
      '<form id="economy-form" class="form-grid">' +
        '<div class="form-field"><label class="form-label">Hệ số nhân Phần thưởng (REWARD_MULTIPLIER)</label>' +
          '<input class="form-input" type="number" step="0.1" name="REWARD_MULTIPLIER" value="' + config.REWARD_MULTIPLIER + '">' +
          '<p class="field-hint">Áp dụng cho vàng/EXP nhận được khi diệt địch, qua wave, qua màn và nhận thưởng nhiệm vụ.</p></div>' +
        '<div class="form-field"><label class="form-label">Hệ số nhân chỉ số Boss (BOSS_MULTIPLIER)</label>' +
          '<input class="form-input" type="number" step="0.1" name="BOSS_MULTIPLIER" value="' + config.BOSS_MULTIPLIER + '">' +
          '<p class="field-hint">Nhân vào HP và Damage của mọi Boss khi vào trận.</p></div>' +
        '<div class="form-field"><label class="form-label">Vàng khởi đầu mỗi trận (START_GOLD)</label>' +
          '<input class="form-input" type="number" name="START_GOLD" value="' + config.START_GOLD + '"></div>' +
        '<div class="modal-actions" style="grid-column:1/-1;"><button type="submit" class="btn btn-primary">Lưu cấu hình kinh tế</button></div>' +
      '</form>' +
      '<h3 class="section-subtitle">Chi phí công trình (tham khảo — sửa ở mục Công trình)</h3>' +
      '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Tên</th><th>Giá xây</th><th>Giá nâng cấp/cấp</th></tr></thead><tbody>' +
      buildings.map((b) => '<tr><td>' + b.name + '</td><td>' + b.cost + '</td><td>' + b.upgradeCost + '</td></tr>').join("") +
      '</tbody></table></div>' +
      '<h3 class="section-subtitle">Giá mở khoá Tướng (tham khảo — sửa ở mục Tướng)</h3>' +
      '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Tên</th><th>Giá mở khoá</th><th>Giá nâng cấp</th></tr></thead><tbody>' +
      heroes.map((h) => '<tr><td>' + h.name + '</td><td>' + h.unlockCost + '</td><td>' + h.upgradeCost + '</td></tr>').join("") +
      '</tbody></table></div>' +
      '<h3 class="section-subtitle">Phần thưởng theo màn (tham khảo — sửa ở mục Màn chơi)</h3>' +
      '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Màn</th><th>Reward Gold</th><th>Reward EXP</th></tr></thead><tbody>' +
      stages.map((s) => '<tr><td>' + s.name + '</td><td>' + s.rewardGold + '</td><td>' + s.rewardExp + '</td></tr>').join("") +
      '</tbody></table></div>';
    document.getElementById("economy-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      AdminService.setConfig({
        REWARD_MULTIPLIER: Number(fd.get("REWARD_MULTIPLIER")),
        BOSS_MULTIPLIER: Number(fd.get("BOSS_MULTIPLIER")),
        START_GOLD: Number(fd.get("START_GOLD")),
      });
      Components.toast("Đã lưu cấu hình kinh tế.");
    });
  },

  /* ---------------- CẤU HÌNH GAME ---------------- */
  _renderConfig(body) {
    const config = DataService.getConfig();
    const f = config.features || {};
    const featureList = [
      ["soundEnabled", "Sound"], ["musicEnabled", "Music (chưa có file nhạc trong dự án)"],
      ["tutorialEnabled", "Tutorial"], ["autoSaveEnabled", "Auto save"],
      ["debugMode", "Debug mode (hiện vùng bắn của tháp)"], ["showDamageNumbers", "Damage numbers"],
      ["showEnemyHpBar", "Enemy HP bar"], ["showFps", "FPS display"],
    ];
    body.innerHTML =
      '<form id="config-form">' +
        '<h3 class="section-subtitle">Thông số chung</h3>' +
        '<div class="form-grid">' +
          '<div class="form-field"><label class="form-label">MAX_LEVEL</label><input class="form-input" type="number" name="MAX_LEVEL" value="' + config.MAX_LEVEL + '"></div>' +
          '<div class="form-field"><label class="form-label">START_HP (HP thành khởi đầu)</label><input class="form-input" type="number" name="START_HP" value="' + config.START_HP + '"></div>' +
          '<div class="form-field"><label class="form-label">ENEMY_SPAWN_RATE (hệ số giãn cách spawn)</label><input class="form-input" type="number" step="0.1" name="ENEMY_SPAWN_RATE" value="' + config.ENEMY_SPAWN_RATE + '"></div>' +
          '<div class="form-field"><label class="form-label">WAVE_TIME (dự phòng, giây)</label><input class="form-input" type="number" name="WAVE_TIME" value="' + config.WAVE_TIME + '"></div>' +
        '</div>' +
        '<h3 class="section-subtitle">Tính năng bật/tắt</h3>' +
        '<div class="form-grid">' +
          featureList.map(([key, label]) =>
            '<label class="form-checkbox-row"><input type="checkbox" name="' + key + '" ' + (f[key] ? "checked" : "") + '><span>' + label + '</span></label>'
          ).join("") +
        '</div>' +
        '<div class="modal-actions"><button type="submit" class="btn btn-primary">Lưu cấu hình</button></div>' +
      '</form>';
    document.getElementById("config-form").addEventListener("submit", (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const features = {};
      featureList.forEach(([k]) => (features[k] = fd.get(k) === "on"));
      AdminService.setConfig({
        MAX_LEVEL: Number(fd.get("MAX_LEVEL")),
        START_HP: Number(fd.get("START_HP")),
        ENEMY_SPAWN_RATE: Number(fd.get("ENEMY_SPAWN_RATE")),
        WAVE_TIME: Number(fd.get("WAVE_TIME")),
        features,
      });
      Components.toast("Đã lưu cấu hình game.");
    });
  },

  /* ---------------- BACKUP / RESTORE ---------------- */
  _renderBackup(body) {
    body.innerHTML =
      '<div class="backup-actions">' +
        '<div class="backup-card"><h3>Export Game Data</h3>' +
          '<p>Xuất toàn bộ dữ liệu (trừ mật khẩu admin) thành file JSON để lưu trữ hoặc chuyển sang máy khác.</p>' +
          '<button class="btn btn-primary" id="btn-export">Export</button></div>' +
        '<div class="backup-card"><h3>Import Game Data</h3>' +
          '<p>Nhập lại một file JSON đã export trước đó. Dữ liệu hiện tại sẽ bị GHI ĐÈ.</p>' +
          '<input type="file" id="import-file" accept="application/json">' +
          '<button class="btn" id="btn-import">Import</button></div>' +
        '<div class="backup-card danger"><h3>Reset Game Data</h3>' +
          '<p>Đưa toàn bộ dữ liệu game về mặc định ban đầu. Tài khoản Admin được giữ nguyên. Không thể hoàn tác.</p>' +
          '<button class="btn btn-danger" id="btn-reset">Reset</button></div>' +
      '</div>';
    document.getElementById("btn-export").onclick = () => {
      const snapshot = AdminService.exportSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "daicoviet-backup-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(url);
      Components.toast("Đã export dữ liệu.");
    };
    document.getElementById("btn-import").onclick = async () => {
      const fileInput = document.getElementById("import-file");
      if (!fileInput.files.length) { Components.toast("Chọn file JSON trước.", "error"); return; }
      const ok = await Components.confirm("Import sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại. Tiếp tục?", { danger: true, confirmLabel: "Import" });
      if (!ok) return;
      try {
        const text = await fileInput.files[0].text();
        const json = JSON.parse(text);
        AdminService.importSnapshot(json);
        Components.toast("Import thành công. Đang tải lại...");
        setTimeout(() => window.location.reload(), 800);
      } catch (e) {
        Components.toast("File không hợp lệ: " + e.message, "error");
      }
    };
    document.getElementById("btn-reset").onclick = async () => {
      const ok = await Components.confirmDangerous(
        "Thao tác này sẽ XOÁ TOÀN BỘ dữ liệu game hiện tại (người chơi, tướng, công trình, màn chơi...) và đưa về mặc định ban đầu. KHÔNG THỂ HOÀN TÁC.",
        "XOA"
      );
      if (!ok) return;
      await AdminService.resetAllData();
      Components.toast("Đã reset toàn bộ dữ liệu. Đang tải lại...");
      setTimeout(() => window.location.reload(), 800);
    };
  },

  /* ---------------- NHẬT KÝ ADMIN ---------------- */
  _renderLogs(body) {
    body.innerHTML = '<div id="logs-table"></div>';
    this._renderLogTable(document.getElementById("logs-table"), DataService.list("adminLogs"));
  },

  _renderLogTable(container, logs) {
    const rows = logs.map((l) =>
      '<tr>' +
        '<td>' + new Date(l.time).toLocaleString("vi-VN") + '</td>' +
        '<td>' + Components.escapeHtml(l.admin) + '</td>' +
        '<td>' + l.action + '</td>' +
        '<td>' + Components.escapeHtml(l.target) + '</td>' +
        '<td class="log-diff">' + Components.escapeHtml(AdminService.diffSummary(l.before, l.after) || (l.after ? JSON.stringify(l.after).slice(0, 80) : "")) + '</td>' +
      '</tr>'
    ).join("");
    container.innerHTML =
      '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Thời gian</th><th>Admin</th><th>Hành động</th><th>Đối tượng</th><th>Thay đổi</th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="5" class="empty-row">Chưa có nhật ký</td></tr>') + '</tbody></table></div>';
  },

  /* ---------------- ĐỔI MẬT KHẨU ---------------- */
  _openChangePasswordModal() {
    const root = document.getElementById("modal-root");
    root.classList.add("open");
    root.innerHTML =
      '<div class="modal-backdrop"></div>' +
      '<div class="modal-box modal-small">' +
        '<h3 class="modal-title">Đổi mật khẩu</h3>' +
        '<form id="pwd-form">' +
          '<div class="form-field"><label class="form-label">Mật khẩu hiện tại</label><input class="form-input" type="password" name="current" required></div>' +
          '<div class="form-field"><label class="form-label">Mật khẩu mới (>= 8 ký tự)</label><input class="form-input" type="password" name="next" required minlength="8"></div>' +
          '<div class="form-field"><label class="form-label">Nhập lại mật khẩu mới</label><input class="form-input" type="password" name="confirm" required minlength="8"></div>' +
          '<p class="form-error hidden" id="pwd-error"></p>' +
          '<div class="modal-actions"><button type="button" class="btn" data-act="cancel">Huỷ</button><button type="submit" class="btn btn-primary">Đổi mật khẩu</button></div>' +
        '</form>' +
      '</div>';
    root.querySelector('[data-act="cancel"]').onclick = () => Components.closeModal();
    root.querySelector("#pwd-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const errEl = root.querySelector("#pwd-error");
      if (fd.get("next") !== fd.get("confirm")) {
        errEl.textContent = "Mật khẩu mới nhập lại không khớp.";
        errEl.classList.remove("hidden");
        return;
      }
      const result = await AuthService.changeOwnPassword(fd.get("current"), fd.get("next"));
      if (!result.ok) {
        errEl.textContent = result.error;
        errEl.classList.remove("hidden");
        return;
      }
      Components.closeModal();
      Components.toast("Đã đổi mật khẩu thành công.");
      this.session = AuthService.getSession();
    });
  },

  /* ---------------- QUẢN LÝ TÀI KHOẢN ADMIN ---------------- */
  _openAccountsModal() {
    const canManage = AuthService.roleAtLeast(this.session.role, "ADMIN");
    if (!canManage) { Components.toast("Chỉ Admin trở lên mới xem được mục này.", "error"); return; }
    const root = document.getElementById("modal-root");
    root.classList.add("open");

    const render = () => {
      const users = AdminService.listAdminUsers();
      const canCreate = AuthService.roleAtLeast(this.session.role, "SUPER_ADMIN");
      const rows = users.map((u) =>
        '<tr data-id="' + u.id + '">' +
          '<td>' + u.username + '</td>' +
          '<td><select data-field="role" ' + (canCreate ? "" : "disabled") + '>' +
            Object.keys(AuthService.ROLES).map((r) => '<option value="' + r + '" ' + (r === u.role ? "selected" : "") + '>' + r + '</option>').join("") +
          '</select></td>' +
          '<td>' + (u.banned ? "🔒 Khoá" : "✅ Hoạt động") + '</td>' +
          '<td>' + (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("vi-VN") : "Chưa đăng nhập") + '</td>' +
          '<td class="row-actions">' +
            '<button class="btn btn-tiny" data-act="ban" ' + (canCreate ? "" : "disabled") + '>' + (u.banned ? "Mở khoá" : "Khoá") + '</button>' +
            '<button class="btn btn-tiny btn-danger" data-act="delete" ' + (canCreate ? "" : "disabled") + '>Xoá</button>' +
          '</td>' +
        '</tr>'
      ).join("");

      root.innerHTML =
        '<div class="modal-backdrop"></div>' +
        '<div class="modal-box">' +
          '<h3 class="modal-title">Quản lý tài khoản Admin</h3>' +
          '<div class="table-wrap"><table class="admin-table"><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Thao tác</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>' +
          (canCreate ?
            '<h3 class="section-subtitle">Tạo tài khoản mới</h3>' +
            '<form id="new-account-form" class="form-grid">' +
              '<div class="form-field"><label class="form-label">Tên đăng nhập</label><input class="form-input" name="username" required></div>' +
              '<div class="form-field"><label class="form-label">Mật khẩu tạm (>= 8 ký tự)</label><input class="form-input" type="password" name="password" required minlength="8"></div>' +
              '<div class="form-field"><label class="form-label">Vai trò</label><select class="form-input" name="role">' +
                Object.keys(AuthService.ROLES).map((r) => '<option value="' + r + '">' + r + '</option>').join("") +
              '</select></div>' +
              '<div class="modal-actions" style="grid-column:1/-1;"><button type="submit" class="btn btn-primary">Tạo tài khoản</button></div>' +
            '</form>' : "") +
          '<div class="modal-actions"><button class="btn" data-act="close">Đóng</button></div>' +
        '</div>';

      root.querySelector('[data-act="close"]').onclick = () => Components.closeModal();
      root.querySelectorAll("tr[data-id]").forEach((tr) => {
        const id = tr.getAttribute("data-id");
        const roleSelect = tr.querySelector('[data-field="role"]');
        if (roleSelect && canCreate) {
          roleSelect.addEventListener("change", () => {
            try { AdminService.setAdminUserRole(id, roleSelect.value); Components.toast("Đã đổi vai trò."); }
            catch (e) { Components.toast(e.message, "error"); }
          });
        }
        const banBtn = tr.querySelector('[data-act="ban"]');
        if (banBtn) banBtn.onclick = () => {
          try {
            const u = users.find((x) => x.id === id);
            AdminService.setAdminUserBanned(id, !u.banned);
            render();
          } catch (e) { Components.toast(e.message, "error"); }
        };
        const delBtn = tr.querySelector('[data-act="delete"]');
        if (delBtn) delBtn.onclick = async () => {
          const ok = await Components.confirm("Xoá tài khoản này?", { danger: true, confirmLabel: "Xoá" });
          if (!ok) return;
          try { AdminService.deleteAdminUser(id); render(); }
          catch (e) { Components.toast(e.message, "error"); }
        };
      });
      const newForm = root.querySelector("#new-account-form");
      if (newForm) {
        newForm.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const fd = new FormData(ev.target);
          try {
            await AdminService.createAdminUser({ username: fd.get("username"), password: fd.get("password"), role: fd.get("role") });
            Components.toast("Đã tạo tài khoản mới.");
            render();
          } catch (e) {
            Components.toast(e.message, "error");
          }
        });
      }
    };
    render();
  },
};

function sanitizeValues(schema, values) {
  const out = {};
  schema.fields.forEach((f) => { out[f.key] = values[f.key]; });
  return out;
}

document.addEventListener("DOMContentLoaded", () => AdminApp.boot());
