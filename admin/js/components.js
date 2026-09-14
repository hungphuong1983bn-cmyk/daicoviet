/* =========================================================
   COMPONENTS.JS
   Các mảnh UI dùng chung cho toàn bộ trang Admin: Toast, hộp thoại
   xác nhận (kể cả xác nhận 2 bước cho thao tác nguy hiểm), bảng dữ
   liệu (table) và modal form được vẽ tự động từ schema.
   ========================================================= */

const Components = (() => {
  function toast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) { console.log(`[toast:${type}]`, message); return; }
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add("visible"));
    setTimeout(() => {
      el.classList.remove("visible");
      setTimeout(() => el.remove(), 250);
    }, 3200);
  }

  function _modalRoot() {
    let root = document.getElementById("modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "modal-root";
      document.body.appendChild(root);
    }
    return root;
  }

  function closeModal() {
    const root = _modalRoot();
    root.innerHTML = "";
    root.classList.remove("open");
  }

  function confirm(message, { danger = false, confirmLabel = "Xác nhận" } = {}) {
    return new Promise((resolve) => {
      const root = _modalRoot();
      root.classList.add("open");
      root.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-box modal-small">
          <p class="modal-message">${message}</p>
          <div class="modal-actions">
            <button class="btn" data-act="cancel">Huỷ</button>
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${confirmLabel}</button>
          </div>
        </div>`;
      root.querySelector('[data-act="cancel"]').onclick = () => { closeModal(); resolve(false); };
      root.querySelector('[data-act="ok"]').onclick = () => { closeModal(); resolve(true); };
    });
  }

  /* Xác nhận 2 bước cho thao tác cực kỳ nguy hiểm (Reset toàn bộ dữ
     liệu). Người dùng phải gõ đúng chữ xác nhận thì nút mới bật. */
  function confirmDangerous(message, requiredText = "XOA") {
    return new Promise((resolve) => {
      const root = _modalRoot();
      root.classList.add("open");
      root.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-box modal-small">
          <p class="modal-message">${message}</p>
          <p class="modal-hint">Gõ <strong>${requiredText}</strong> vào ô bên dưới để xác nhận:</p>
          <input type="text" class="form-input" id="confirm-input" autocomplete="off">
          <div class="modal-actions">
            <button class="btn" data-act="cancel">Huỷ</button>
            <button class="btn btn-danger" data-act="ok" disabled>Tôi hiểu, tiếp tục</button>
          </div>
        </div>`;
      const input = root.querySelector("#confirm-input");
      const okBtn = root.querySelector('[data-act="ok"]');
      input.addEventListener("input", () => {
        okBtn.disabled = input.value.trim().toUpperCase() !== requiredText.toUpperCase();
      });
      root.querySelector('[data-act="cancel"]').onclick = () => { closeModal(); resolve(false); };
      okBtn.onclick = () => { closeModal(); resolve(true); };
    });
  }

  function fieldOptions(field) {
    if (field.options) return field.options;
    if (field.optionsFrom) {
      const items = DataService.list(field.optionsFrom);
      const opts = items.map((i) => ({ value: i.id, label: i.name || i.id }));
      if (field.allowEmpty) opts.unshift({ value: "", label: "(không)" });
      return opts;
    }
    return [];
  }

  function renderField(field, value) {
    const id = `f_${field.key}`;
    const val = value === undefined || value === null ? "" : value;
    if (field.type === "textarea") {
      return `<label class="form-label" for="${id}">${field.label}</label>
        <textarea class="form-input" id="${id}" name="${field.key}" rows="2">${escapeHtml(val)}</textarea>`;
    }
    if (field.type === "checkbox") {
      return `<label class="form-checkbox-row" for="${id}">
        <input type="checkbox" id="${id}" name="${field.key}" ${val ? "checked" : ""}>
        <span>${field.label}</span></label>`;
    }
    if (field.type === "select") {
      const opts = fieldOptions(field).map((o) =>
        `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(val) ? "selected" : ""}>${escapeHtml(o.label)}</option>`
      ).join("");
      return `<label class="form-label" for="${id}">${field.label}</label>
        <select class="form-input" id="${id}" name="${field.key}">${opts}</select>`;
    }
    const type = field.type === "number" ? "number" : "text";
    const step = field.step ? `step="${field.step}"` : "";
    const disabled = field.immutable && value !== undefined && value !== "" ? "disabled" : "";
    return `<label class="form-label" for="${id}">${field.label}</label>
      <input class="form-input" type="${type}" id="${id}" name="${field.key}" value="${escapeHtml(val)}" ${step} ${disabled} ${field.required ? "required" : ""}>
      ${field.hint ? `<p class="field-hint">${field.hint}</p>` : ""}`;
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function readForm(fields, formEl) {
    const values = {};
    for (const f of fields) {
      const el = formEl.querySelector(`[name="${f.key}"]`);
      if (!el) continue;
      if (f.type === "checkbox") values[f.key] = el.checked;
      else if (f.type === "number") values[f.key] = el.value === "" ? 0 : Number(el.value);
      else values[f.key] = el.value;
    }
    return values;
  }

  /* Kiểm tra ràng buộc min/max khai báo trên field schema (vd. HP >= 0,
     Critical Chance <= 100...). Trả về thông báo lỗi tiếng Việt đầu tiên
     gặp phải, hoặc null nếu hợp lệ. Không bao giờ để giá trị sai lọt vào
     dữ liệu game và làm engine crash lúc chơi. */
  function validateFields(fields, values) {
    for (const f of fields) {
      if (f.type !== "number") continue;
      const v = values[f.key];
      if (v === undefined || v === null || v === "") continue;
      if (f.min !== undefined && v < f.min) {
        return `"${f.label}" phải >= ${f.min} (đang nhập ${v}).`;
      }
      if (f.max !== undefined && v > f.max) {
        return `"${f.label}" phải <= ${f.max} (đang nhập ${v}).`;
      }
    }
    return null;
  }

  function openFormModal({ title, fields, initialValues = {}, onSubmit, isEdit = false }) {
    const root = _modalRoot();
    root.classList.add("open");
    const fieldsHtml = fields.map((f) => `<div class="form-field">${renderField(f, initialValues[f.key])}</div>`).join("");
    root.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-box">
        <h3 class="modal-title">${title}</h3>
        <form id="admin-form">
          <div class="form-grid">${fieldsHtml}</div>
          <p class="form-error hidden" id="form-error"></p>
          <div class="modal-actions">
            <button type="button" class="btn" data-act="cancel">Huỷ</button>
            <button type="submit" class="btn btn-primary">${isEdit ? "Lưu thay đổi" : "Tạo mới"}</button>
          </div>
        </form>
      </div>`;
    root.querySelector('[data-act="cancel"]').onclick = () => closeModal();
    const form = root.querySelector("#admin-form");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const values = readForm(fields, form);
      const errorEl = root.querySelector("#form-error");
      const validationError = validateFields(fields, values);
      if (validationError) {
        errorEl.textContent = validationError;
        errorEl.classList.remove("hidden");
        return;
      }
      try {
        await onSubmit(values);
        closeModal();
      } catch (e) {
        errorEl.textContent = e.message || String(e);
        errorEl.classList.remove("hidden");
      }
    });
  }

  function renderTable(container, schema, items, handlers) {
    const cols = schema.columns;
    const head = cols.map((c) => `<th>${c}</th>`).join("") + "<th>Thao tác</th>";
    const rows = items.map((item) => {
      const cells = cols.map((c) => {
        let v = item[c];
        if (c === "enabled") v = item.enabled !== false ? "✅" : "⛔";
        if (c === "conditionType") v = (item.condition && item.condition.type) || "-";
        if (c === "rewardGold") v = item.reward ? item.reward.gold : item.rewardGold;
        if (c === "rewardExp") v = item.reward ? item.reward.exp : item.rewardExp;
        if (c === "waveCount") v = (item.waves || []).length;
        if (v === undefined || v === null) v = "";
        return `<td>${escapeHtml(v)}</td>`;
      }).join("");
      return `<tr data-id="${escapeHtml(item.id)}">
        ${cells}
        <td class="row-actions">
          <button class="btn btn-tiny" data-act="edit">Sửa</button>
          <button class="btn btn-tiny" data-act="toggle">${item.enabled !== false ? "Tắt" : "Bật"}</button>
          <button class="btn btn-tiny btn-danger" data-act="delete">Xoá</button>
        </td>
      </tr>`;
    }).join("");

    container.innerHTML = `
      <div class="table-wrap">
        <table class="admin-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${cols.length + 1}" class="empty-row">Chưa có dữ liệu</td></tr>`}</tbody>
        </table>
      </div>`;

    container.querySelectorAll("tr[data-id]").forEach((tr) => {
      const id = tr.getAttribute("data-id");
      const item = items.find((i) => i.id === id);
      const editBtn = tr.querySelector('[data-act="edit"]');
      const toggleBtn = tr.querySelector('[data-act="toggle"]');
      const deleteBtn = tr.querySelector('[data-act="delete"]');
      if (editBtn) editBtn.onclick = () => handlers.onEdit(item);
      if (toggleBtn) toggleBtn.onclick = () => handlers.onToggle(item);
      if (deleteBtn) deleteBtn.onclick = () => handlers.onDelete(item);
    });
  }

  return { toast, confirm, confirmDangerous, openFormModal, closeModal, renderTable, escapeHtml };
})();
