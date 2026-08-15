const BOOKS = {
  santhoor: { label: "Santhoor Book", cls: "" },
  mtr: { label: "MTR Book", cls: "mtr" },
};

const state = {
  authed: false,
  screen: "loading", // loading | login | home | list | detail | addRetailer | entry
  book: "santhoor",
  retailers: [],
  activeRetailer: null,
  entryType: "payment",
  query: "",
  loginError: "",
  confirm: null,
};

const app = document.getElementById("app");

function inr(n) {
  n = Number(n) || 0;
  return "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    ...opts,
  });
  if (res.status === 401) {
    state.authed = false;
    state.screen = "login";
    render();
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "request failed");
  return data;
}

// ---------------- boot ----------------

async function boot() {
  try {
    const s = await api("/session");
    state.authed = !!s.authed;
  } catch (e) {
    state.authed = false;
  }
  state.screen = state.authed ? "home" : "login";
  render();
}

// ---------------- render ----------------

function render() {
  app.innerHTML = "";
  if (state.screen === "loading") return app.appendChild(el(`<div class="loading-screen">Loading ledger…</div>`));
  if (state.screen === "login") return app.appendChild(renderLogin());
  if (state.screen === "home") return renderHome();
  if (state.screen === "list") return renderList();
  if (state.screen === "addRetailer") return app.appendChild(renderAddRetailer());
  if (state.screen === "detail") return renderDetail();
  if (state.screen === "entry") return app.appendChild(renderEntry());
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function topbar(title, opts = {}) {
  const bar = el(`
    <div class="topbar">
      ${opts.back ? `<button class="back-btn" id="backBtn">&#8592;</button>` : `<span style="width:38px"></span>`}
      <h1>${title}</h1>
      <span id="topbarRight"></span>
    </div>
  `);
  if (opts.back) bar.querySelector("#backBtn").onclick = opts.back;
  if (opts.right) bar.querySelector("#topbarRight").appendChild(opts.right);
  return bar;
}

// ---------------- login ----------------

function renderLogin() {
  const wrap = el(`
    <div class="login-wrap">
      <h1>Credit Ledger</h1>
      ${state.loginError ? `<div class="error">${state.loginError}</div>` : ""}
      <input id="pinInput" type="password" inputmode="numeric" maxlength="6" placeholder="PIN" autofocus />
      <button id="loginBtn">Unlock</button>
    </div>
  `);
  const submit = async () => {
    const pin = wrap.querySelector("#pinInput").value;
    try {
      await api("/login", { method: "POST", body: JSON.stringify({ pin }) });
      state.authed = true;
      state.loginError = "";
      state.screen = "home";
      render();
    } catch (e) {
      state.loginError = "Wrong PIN, try again";
      render();
    }
  };
  wrap.querySelector("#loginBtn").onclick = submit;
  wrap.querySelector("#pinInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  return wrap;
}

// ---------------- home ----------------

async function renderHome() {
  app.innerHTML = `<div class="loading-screen">Loading…</div>`;
  let summary;
  try {
    summary = await api("/summary");
  } catch (e) {
    app.innerHTML = `<div class="loading-screen">Could not load. Check connection.</div>`;
    return;
  }
  app.innerHTML = "";
  const page = el(`
    <div class="page">
      <div class="big-title">Credit Ledger</div>
      <div class="subtitle">Choose a book</div>
    </div>
  `);
  Object.entries(BOOKS).forEach(([key, meta]) => {
    const s = summary[key] || { total: 0, count: 0 };
    const card = el(`
      <button class="book-card ${meta.cls}">
        <div class="name">${meta.label}</div>
        <div class="meta">${s.count} retailer${s.count === 1 ? "" : "s"}</div>
        <div class="total">Outstanding:
          <span class="${s.total > 0 ? "due" : "clear"}">${inr(s.total)}</span>
        </div>
      </button>
    `);
    card.onclick = () => {
      state.book = key;
      state.query = "";
      state.screen = "list";
      render();
    };
    page.appendChild(card);
  });
  app.appendChild(page);
}

// ---------------- list ----------------

async function renderList() {
  app.innerHTML = "";
  app.appendChild(
    topbar(BOOKS[state.book].label, {
      back: () => {
        state.screen = "home";
        render();
      },
    })
  );
  const page = el(`<div class="page" style="padding-bottom:100px"></div>`);
  const searchBox = el(`
    <div class="search-box">
      <span>&#128269;</span>
      <input id="searchInput" placeholder="Search retailer" value="${state.query}" />
    </div>
  `);
  searchBox.querySelector("#searchInput").oninput = (e) => {
    state.query = e.target.value;
    renderRetailerRows(listBody);
  };
  page.appendChild(searchBox);
  const listBody = el(`<div></div>`);
  page.appendChild(listBody);
  app.appendChild(page);

  listBody.innerHTML = `<div class="empty-note">Loading…</div>`;
  try {
    state.retailers = await api("/retailers?book=" + state.book);
  } catch (e) {
    listBody.innerHTML = `<div class="empty-note">Could not load retailers.</div>`;
    return;
  }
  renderRetailerRows(listBody);

  const printBtn = el(`<button class="secondary-btn">&#128438; Print This List</button>`);
  printBtn.onclick = () => printBookList();
  page.appendChild(printBtn);

  const gridBtn = el(`<button class="secondary-btn">&#128203; Print Date-wise Sheet</button>`);
  gridBtn.onclick = () => showDateRangeModal();
  page.appendChild(gridBtn);

  const fab = el(`<button class="fab ${BOOKS[state.book].cls}">+ Add Retailer</button>`);
  fab.onclick = () => {
    state.screen = "addRetailer";
    render();
  };
  app.appendChild(fab);
}

function renderRetailerRows(container) {
  const filtered = state.retailers
    .filter((r) => r.name.toLowerCase().includes(state.query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  container.innerHTML = "";
  if (filtered.length === 0) {
    container.appendChild(
      el(
        `<div class="empty-note">${
          state.retailers.length === 0 ? "No retailers yet. Add one below." : "No match found."
        }</div>`
      )
    );
    return;
  }
  filtered.forEach((r) => {
    const row = el(`
      <button class="retailer-row">
        <span class="name">${escapeHtml(r.name)}</span>
        <span class="amt ${r.balance > 0 ? "due" : "clear"}">${r.balance > 0 ? inr(r.balance) : "Cleared"}</span>
      </button>
    `);
    row.onclick = () => {
      state.activeRetailer = { id: r.id };
      state.screen = "detail";
      render();
    };
    container.appendChild(row);
  });
}

// ---------------- add retailer ----------------

function renderAddRetailer() {
  const page = el(`<div class="page"></div>`);
  const bar = topbar("Add Retailer", {
    back: () => {
      state.screen = "list";
      render();
    },
  });
  const form = el(`
    <div>
      <div class="field">
        <label>Shop name</label>
        <input id="nameInput" placeholder="e.g. Ganesh Traders" autofocus />
      </div>
      <div class="field">
        <label>Opening balance for ${BOOKS[state.book].label} (0 if none)</label>
        <input id="openingInput" inputmode="numeric" placeholder="0" />
        <div class="hint">This retailer will also appear in the other book with a balance of 0 — add that opening balance separately if needed.</div>
      </div>
      <button class="primary-btn ${BOOKS[state.book].cls}" id="saveBtn" disabled>Save Retailer</button>
    </div>
  `);
  const nameInput = form.querySelector("#nameInput");
  const openingInput = form.querySelector("#openingInput");
  const saveBtn = form.querySelector("#saveBtn");

  const updateDisabled = () => {
    saveBtn.disabled = !nameInput.value.trim();
  };
  nameInput.oninput = updateDisabled;
  openingInput.oninput = () => {
    openingInput.value = openingInput.value.replace(/[^0-9]/g, "");
  };

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const payload = { name: nameInput.value.trim() };
      payload["opening_" + state.book] = openingInput.value || 0;
      await api("/retailers", { method: "POST", body: JSON.stringify(payload) });
      state.screen = "list";
      render();
    } catch (e) {
      alert("Could not save retailer. Try again.");
      saveBtn.disabled = false;
    }
  };

  const wrap = document.createDocumentFragment();
  wrap.appendChild(bar);
  page.appendChild(form);
  wrap.appendChild(page);
  const container = el(`<div></div>`);
  container.appendChild(wrap);
  return container;
}

// ---------------- detail ----------------

async function renderDetail() {
  app.innerHTML = "";
  const id = state.activeRetailer.id;
  app.appendChild(
    topbar("Loading…", {
      back: () => {
        state.screen = "list";
        render();
      },
    })
  );

  let r;
  try {
    r = await api(`/retailers/${id}?book=${state.book}`);
  } catch (e) {
    app.innerHTML = `<div class="loading-screen">Could not load retailer.</div>`;
    return;
  }
  state.activeRetailer = r;
  app.innerHTML = "";

  const deleteBtn = el(`<button class="icon-btn">&#128465;</button>`);
  deleteBtn.onclick = () => showConfirm({
    title: "Delete this retailer?",
    body: `${r.name} and all history (both books) will be removed.`,
    danger: true,
    confirmLabel: "Delete",
    onConfirm: async () => {
      try {
        await api(`/retailers/${id}`, { method: "DELETE" });
        hideConfirm();
        state.screen = "list";
        render();
      } catch (e) {
        hideConfirm();
        alert("Could not delete. Try again.");
      }
    },
  });
  app.appendChild(
    topbar(r.name, {
      back: () => {
        state.screen = "list";
        render();
      },
      right: deleteBtn,
    })
  );

  const page = el(`<div class="page"></div>`);
  page.appendChild(el(`
    <div class="balance-block">
      <div class="label">Current balance (${BOOKS[state.book].label})</div>
      <div class="amount ${r.balance > 0 ? "due" : "clear"}">${inr(r.balance)}</div>
    </div>
  `));

  const actions = el(`
    <div class="action-row">
      <button class="action-btn payment">Payment<br/>Received</button>
      <button class="action-btn purchase">New<br/>Purchase</button>
    </div>
  `);
  actions.querySelector(".payment").onclick = () => {
    state.entryType = "payment";
    state.screen = "entry";
    render();
  };
  actions.querySelector(".purchase").onclick = () => {
    state.entryType = "purchase";
    state.screen = "entry";
    render();
  };
  page.appendChild(actions);

  page.appendChild(el(`<div class="section-label">History</div>`));
  if (r.history.length === 0) {
    page.appendChild(el(`<div class="empty-note">No entries yet.</div>`));
  } else {
    r.history.forEach((h) => {
      page.appendChild(el(`
        <div class="history-row">
          <div>
            <div class="date">${h.date}</div>
            <div class="type ${h.type === "purchase" ? "due" : "clear"}">
              ${h.type === "purchase" ? "Purchase (added)" : "Payment received"}
            </div>
          </div>
          <div class="amt">${h.type === "purchase" ? "+" : "-"}${inr(h.amount)}</div>
        </div>
      `));
    });
  }

  const printBtn = el(`<button class="secondary-btn">&#128438; Print Statement</button>`);
  printBtn.onclick = () => printRetailerStatement(r);
  page.appendChild(printBtn);

  app.appendChild(page);
}

// ---------------- print ----------------

function printDateStamp() {
  return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function printRetailerStatement(r) {
  const sorted = [...r.history].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let running = 0;
  const rows = sorted
    .map((h) => {
      running += h.type === "purchase" ? h.amount : -h.amount;
      return `
        <tr>
          <td>${h.date}</td>
          <td>${h.type === "purchase" ? "Purchase" : "Payment"}</td>
          <td style="text-align:right">${h.type === "purchase" ? "+" : "-"}${inr(h.amount)}</td>
          <td style="text-align:right">${inr(running)}</td>
        </tr>`;
    })
    .join("");

  document.getElementById("printArea").innerHTML = `
    <div class="print-header">
      <h2>${escapeHtml(r.name)}</h2>
      <div class="meta">${BOOKS[state.book].label} &mdash; printed ${printDateStamp()}</div>
      <div class="print-balance">Current balance: ${inr(r.balance)}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No entries</td></tr>'}</tbody>
    </table>
  `;
  window.print();
}

function localISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function plainNum(n) {
  return Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function showDateRangeModal() {
  hideConfirm();
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const toStr = localISODate(today);
  const fromStr = localISODate(weekAgo);

  const backdrop = el(`
    <div class="modal-backdrop" id="confirmBackdrop">
      <div class="modal-card">
        <div class="title">Print Date-wise Sheet</div>
        <div class="body">Retailers as rows, dates as columns, balance at the end &mdash; like the ledger book. Max 45 days at a time.</div>
        <div class="date-range-row">
          <div class="field">
            <label>From</label>
            <input type="date" id="gridFrom" value="${fromStr}" />
          </div>
          <div class="field">
            <label>To</label>
            <input type="date" id="gridTo" value="${toStr}" />
          </div>
        </div>
        <div class="modal-actions" style="margin-top:18px">
          <button class="cancel">Cancel</button>
          <button class="primary">Print</button>
        </div>
      </div>
    </div>
  `);
  backdrop.querySelector(".cancel").onclick = hideConfirm;
  backdrop.querySelector(".primary").onclick = async () => {
    const from = backdrop.querySelector("#gridFrom").value;
    const to = backdrop.querySelector("#gridTo").value;
    if (!from || !to) return;
    hideConfirm();
    await printGrid(from, to);
  };
  document.body.appendChild(backdrop);
}

async function printGrid(from, to) {
  let data;
  try {
    data = await api(`/grid?book=${state.book}&from=${from}&to=${to}`);
  } catch (e) {
    alert(e.message || "Could not load data for that range.");
    return;
  }

  const dateHeaders = data.dates
    .map((d) => {
      const [, m, day] = d.split("-");
      return `<th class="date-col">${day}/${m}</th>`;
    })
    .join("");

  const rows = data.rows
    .map((r) => {
      const cells = data.dates
        .map((d) => {
          const amt = r.entries[d];
          return `<td class="date-cell">${amt ? plainNum(amt) : ""}</td>`;
        })
        .join("");
      return `
        <tr>
          <td class="name-cell">${escapeHtml(r.name)}</td>
          ${cells}
          <td class="balance-cell">${inr(r.balance)}</td>
        </tr>`;
    })
    .join("");

  document.getElementById("printArea").innerHTML = `
    <div class="print-header">
      <h2>${BOOKS[state.book].label} &mdash; Date-wise Sheet</h2>
      <div class="meta">${from} to ${to} &middot; printed ${printDateStamp()}</div>
    </div>
    <table class="print-table grid-table">
      <thead><tr><th>Retailer</th>${dateHeaders}<th class="balance-col">Balance</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${data.dates.length + 2}">No retailers</td></tr>`}</tbody>
    </table>
  `;
  window.print();
}

function printBookList() {
  const sorted = [...state.retailers].sort((a, b) => a.name.localeCompare(b.name));
  const total = sorted.reduce((s, r) => s + r.balance, 0);
  const rows = sorted
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.name)}</td>
          <td style="text-align:right">${r.balance > 0 ? inr(r.balance) : "Cleared"}</td>
        </tr>`
    )
    .join("");

  document.getElementById("printArea").innerHTML = `
    <div class="print-header">
      <h2>${BOOKS[state.book].label}</h2>
      <div class="meta">Printed ${printDateStamp()}</div>
      <div class="print-balance">Total outstanding: ${inr(total)}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Retailer</th><th>Balance</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2">No retailers</td></tr>'}</tbody>
    </table>
  `;
  window.print();
}

// ---------------- entry ----------------

function renderEntry() {
  const isPurchase = state.entryType === "purchase";
  const page = document.createDocumentFragment();
  page.appendChild(
    topbar(isPurchase ? "New Purchase" : "Payment Received", {
      back: () => {
        state.screen = "detail";
        render();
      },
    })
  );
  const body = el(`<div class="page"></div>`);
  body.appendChild(el(`<div class="entry-name">${escapeHtml(state.activeRetailer.name)}</div>`));
  const display = el(`
    <div class="entry-display ${isPurchase ? "purchase" : "payment"}">
      <span class="rupee">&#8377;</span><span class="amount" id="amtDisplay">0</span>
    </div>
  `);
  body.appendChild(display);

  const input = el(`<input class="entry-input" id="amtInput" inputmode="numeric" placeholder="Type or use mic to enter amount" autofocus />`);
  input.oninput = () => {
    input.value = input.value.replace(/[^0-9]/g, "");
    display.querySelector("#amtDisplay").textContent = input.value || "0";
    saveBtn.disabled = !input.value || Number(input.value) <= 0;
  };
  body.appendChild(input);
  body.appendChild(el(`<div class="mic-hint">Tap the mic on your keyboard to speak the amount in Kannada</div>`));

  const saveBtn = el(`<button class="primary-btn ${isPurchase ? "" : ""}" style="background:${isPurchase ? "#B3261E" : "#1B7A3D"}" disabled>Save Entry</button>`);
  saveBtn.onclick = async () => {
    const amount = Number(input.value);
    if (!amount || amount <= 0) return;
    saveBtn.disabled = true;
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          retailer_id: state.activeRetailer.id,
          book: state.book,
          type: state.entryType,
          amount,
        }),
      });
      state.screen = "detail";
      render();
    } catch (e) {
      alert("Could not save entry. Try again.");
      saveBtn.disabled = false;
    }
  };
  body.appendChild(saveBtn);
  page.appendChild(body);

  const container = el(`<div></div>`);
  container.appendChild(page);
  return container;
}

// ---------------- confirm modal ----------------

function showConfirm(opts) {
  hideConfirm();
  const backdrop = el(`
    <div class="modal-backdrop" id="confirmBackdrop">
      <div class="modal-card">
        <div class="title">${opts.title}</div>
        <div class="body">${opts.body || ""}</div>
        <div class="modal-actions">
          <button class="cancel">Cancel</button>
          <button class="danger">${opts.confirmLabel || "Confirm"}</button>
        </div>
      </div>
    </div>
  `);
  backdrop.querySelector(".cancel").onclick = hideConfirm;
  backdrop.querySelector(".danger").onclick = opts.onConfirm;
  document.body.appendChild(backdrop);
}
function hideConfirm() {
  const el = document.getElementById("confirmBackdrop");
  if (el) el.remove();
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

boot();
