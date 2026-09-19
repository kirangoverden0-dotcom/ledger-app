const BOOKS = {
  santhoor: { label: "Santoor Book", cls: "" },
  mtr: { label: "MTR Book", cls: "mtr" },
};

const state = {
  authed: false,
  pinSet: true,
  screen: "loading", // loading | login | pinSetup | home | list | detail | addRetailer | entry | collectionEntry | billEntry | monthlyReport
  book: "santhoor",
  retailers: [],
  activeRetailer: null,
  entryType: "payment",
  query: "",
  loginError: "",
  pinSetupError: "",
  confirm: null,
  // Report state
  reportBook: "santhoor",
  reportFrom: "",
  reportTo: "",
  reportData: null,
  // Collection entry state
  collectionBook: "santhoor",
  collectionRetailerId: null,
  collectionDate: localISODate(new Date()),
  collectionAmount: "",
  // Bill entry state
  billBook: "santhoor",
  billRetailerId: null,
  billDate: localISODate(new Date()),
  billAmount: "",
};

const app = document.getElementById("app");

function inr(n) {
  n = Number(n) || 0;
  return "\u20B9" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
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

function startSpeechToText(onResult, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (onError) onError("Speech recognition not supported in browser. Use keyboard mic.");
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = "en-IN";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const numbers = text.replace(/[^0-9]/g, "");
    if (numbers) {
      onResult(numbers);
    } else if (onError) {
      onError("Recognized: '" + text + "'. No numbers found.");
    }
  };
  rec.onerror = (e) => {
    if (onError) onError("Voice error: " + (e.error || "Could not hear"));
  };
  rec.start();
}

function startSpeechToTextForName(onResult, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    if (onError) onError("Speech recognition not supported in browser.");
    return;
  }
  const rec = new SpeechRecognition();
  rec.lang = "en-IN";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    if (text && text.trim()) {
      onResult(text.trim());
    } else if (onError) {
      onError("No speech recognized. Try speaking clearly.");
    }
  };
  rec.onerror = (e) => {
    if (onError) onError("Voice error: " + (e.error || "Could not hear"));
  };
  rec.start();
}

// ---------------- boot ----------------

async function boot() {
  try {
    const s = await api("/session");
    state.authed = !!s.authed;
    state.pinSet = s.pin_set !== undefined ? !!s.pin_set : true;
  } catch (e) {
    state.authed = false;
    state.pinSet = true;
  }
  if (!state.pinSet) {
    state.screen = "pinSetup";
  } else if (state.authed) {
    state.screen = "home";
  } else {
    state.screen = "login";
  }
  render();
}

// ---------------- render ----------------

function render() {
  app.innerHTML = "";
  if (state.screen === "loading") return app.appendChild(el(`<div class="loading-screen">Loading ledger…</div>`));
  if (state.screen === "pinSetup") return app.appendChild(renderPinSetup());
  if (state.screen === "login") return app.appendChild(renderLogin());
  if (state.screen === "home") return renderHome();
  if (state.screen === "list") return renderList();
  if (state.screen === "addRetailer") return app.appendChild(renderAddRetailer());
  if (state.screen === "detail") return renderDetail();
  if (state.screen === "entry") return app.appendChild(renderEntry());
  if (state.screen === "billEntry") return renderBillEntry();
  if (state.screen === "collectionEntry") return renderCollectionEntry();
  if (state.screen === "monthlyReport") return renderMonthlyReport();
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

// ---------------- PIN setup & login ----------------

function renderPinSetup() {
  const wrap = el(`
    <div class="login-wrap">
      <h1>Set Security PIN</h1>
      <div class="subtitle" style="text-align:center;margin-bottom:16px;">Create a security PIN for your ledger app</div>
      ${state.pinSetupError ? `<div class="error">${state.pinSetupError}</div>` : ""}
      <input id="newPinInput" type="password" inputmode="numeric" maxlength="6" placeholder="New PIN" autofocus />
      <input id="confirmPinInput" type="password" inputmode="numeric" maxlength="6" placeholder="Confirm PIN" style="margin-top:8px" />
      <button id="setupBtn" style="margin-top:14px">Save & Unlock</button>
    </div>
  `);
  const submit = async () => {
    const p1 = wrap.querySelector("#newPinInput").value.trim();
    const p2 = wrap.querySelector("#confirmPinInput").value.trim();
    if (!p1 || p1.length < 4) {
      state.pinSetupError = "PIN must be at least 4 digits";
      render();
      return;
    }
    if (p1 !== p2) {
      state.pinSetupError = "PINs do not match";
      render();
      return;
    }
    try {
      await api("/pin/setup", { method: "POST", body: JSON.stringify({ pin: p1 }) });
      state.authed = true;
      state.pinSet = true;
      state.pinSetupError = "";
      state.screen = "home";
      render();
    } catch (e) {
      state.pinSetupError = e.message || "Could not save PIN";
      render();
    }
  };
  wrap.querySelector("#setupBtn").onclick = submit;
  wrap.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  });
  return wrap;
}

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
      if (e.message === "pin_not_set") {
        state.pinSet = false;
        state.screen = "pinSetup";
        render();
        return;
      }
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

function showChangePinModal() {
  hideConfirm();
  const backdrop = el(`
    <div class="modal-backdrop" id="confirmBackdrop">
      <div class="modal-card">
        <div class="title">Change Security PIN</div>
        <div class="body">Enter new PIN for this application.</div>
        <div class="field">
          <label>New PIN (4-6 digits)</label>
          <input type="password" id="changePinInput" inputmode="numeric" maxlength="6" autofocus />
        </div>
        <div class="modal-actions" style="margin-top:14px">
          <button class="cancel">Cancel</button>
          <button class="primary">Save PIN</button>
        </div>
      </div>
    </div>
  `);
  backdrop.querySelector(".cancel").onclick = hideConfirm;
  backdrop.querySelector(".primary").onclick = async () => {
    const newPin = backdrop.querySelector("#changePinInput").value.trim();
    if (!newPin || newPin.length < 4) {
      alert("PIN must be at least 4 digits");
      return;
    }
    try {
      await api("/pin/change", { method: "POST", body: JSON.stringify({ new_pin: newPin }) });
      hideConfirm();
      alert("PIN changed successfully!");
    } catch (e) {
      alert(e.message || "Could not change PIN.");
    }
  };
  document.body.appendChild(backdrop);
}

function addLongPressListener(element, onLongPress, onClick) {
  let timer = null;
  let isLongPress = false;
  let isMoved = false;
  let startX = 0;
  let startY = 0;
  let isTouchSequence = false;
  let touchResetTimeout = null;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const start = (e) => {
    cancel();
    isLongPress = false;
    isMoved = false;

    const isTouch = e.type.startsWith("touch");
    if (isTouch) {
      isTouchSequence = true;
      if (touchResetTimeout) clearTimeout(touchResetTimeout);
      touchResetTimeout = setTimeout(() => {
        isTouchSequence = false;
      }, 1000);
    } else if (isTouchSequence) {
      return;
    }

    const touch = e.touches ? e.touches[0] : e;
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;

    timer = setTimeout(() => {
      isLongPress = true;
      if (navigator.vibrate) navigator.vibrate(40);
      onLongPress(e);
    }, 500);
  };

  const move = (e) => {
    const isTouch = e.type.startsWith("touch");
    if (!isTouch && isTouchSequence) return;

    const touch = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    if (!touch) return;

    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > 10 || dy > 10) {
      isMoved = true;
      cancel();
    }
  };

  const end = (e) => {
    const isTouch = e.type.startsWith("touch");
    if (!isTouch && isTouchSequence) return;

    const wasLongPress = isLongPress;
    const moved = isMoved;
    cancel();

    if (wasLongPress) {
      e.preventDefault();
      e.stopPropagation();
    } else if (!moved && onClick) {
      onClick(e);
    }
  };

  const handleTouchCancel = () => {
    cancel();
  };

  element.addEventListener("touchstart", start, { passive: true });
  element.addEventListener("touchend", end);
  element.addEventListener("touchmove", move, { passive: true });
  element.addEventListener("touchcancel", handleTouchCancel);

  element.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    start(e);
  });
  element.addEventListener("mouseup", end);
  element.addEventListener("mouseleave", cancel);
  element.addEventListener("mousemove", move);

  element.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
}

function showRetailerOptionsMenu(retailer) {
  hideConfirm();
  const backdrop = el(`
    <div class="modal-backdrop" id="confirmBackdrop">
      <div class="modal-card">
        <div class="title">${escapeHtml(retailer.name)}</div>
        <div class="body" style="margin-bottom:16px;font-size:15px;">Options for retailer</div>
        <button class="context-menu-btn" id="menuEditBtn">
          <span>✏️</span> <span>Edit Retailer</span>
        </button>
        <button class="context-menu-btn danger" id="menuDeleteBtn">
          <span>🗑️</span> <span>Delete Retailer</span>
        </button>
        <div class="modal-actions" style="margin-top:16px;">
          <button class="cancel">Cancel</button>
        </div>
      </div>
    </div>
  `);

  backdrop.querySelector(".cancel").onclick = hideConfirm;
  backdrop.querySelector("#menuEditBtn").onclick = () => {
    hideConfirm();
    showEditRetailerModal(retailer);
  };
  backdrop.querySelector("#menuDeleteBtn").onclick = () => {
    hideConfirm();
    handleDeleteRetailer(retailer);
  };

  document.body.appendChild(backdrop);
}

function showEditRetailerModal(retailer) {
  hideConfirm();
  const backdrop = el(`
    <div class="modal-backdrop" id="confirmBackdrop">
      <div class="modal-card">
        <div class="title">Edit Retailer</div>
        <div class="field" style="margin-top:14px;">
          <label>Shop Name</label>
          <input id="editNameInput" value="${escapeHtml(retailer.name)}" autofocus />
        </div>
        <div class="field">
          <label>Associated Product Lines</label>
          <div style="display:flex;gap:20px;margin-top:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700;cursor:pointer;">
              <input type="checkbox" id="editChkSanthoor" ${retailer.has_santhoor ? "checked" : ""} style="width:22px;height:22px;" />
              Santoor
            </label>
            <label style="display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700;cursor:pointer;">
              <input type="checkbox" id="editChkMtr" ${retailer.has_mtr ? "checked" : ""} style="width:22px;height:22px;" />
              MTR
            </label>
          </div>
        </div>
        <div class="modal-actions" style="margin-top:18px;">
          <button class="cancel">Cancel</button>
          <button class="primary" id="saveEditBtn">Save Changes</button>
        </div>
      </div>
    </div>
  `);

  const nameInput = backdrop.querySelector("#editNameInput");
  const chkSanthoor = backdrop.querySelector("#editChkSanthoor");
  const chkMtr = backdrop.querySelector("#editChkMtr");
  const saveBtn = backdrop.querySelector("#saveEditBtn");

  backdrop.querySelector(".cancel").onclick = hideConfirm;

  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) {
      alert("Shop name required");
      return;
    }
    if (!chkSanthoor.checked && !chkMtr.checked) {
      alert("Retailer must belong to at least one product line");
      return;
    }

    saveBtn.disabled = true;
    try {
      await api(`/retailers/${retailer.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          has_santhoor: chkSanthoor.checked,
          has_mtr: chkMtr.checked,
        }),
      });
      hideConfirm();
      if (state.screen === "list") {
        state.retailers = await api("/retailers?book=" + state.book);
        renderList();
      } else {
        render();
      }
    } catch (e) {
      alert(e.message || "Could not update retailer");
      saveBtn.disabled = false;
    }
  };

  document.body.appendChild(backdrop);
}

function handleDeleteRetailer(retailer) {
  showConfirm({
    title: `Delete ${retailer.name}?`,
    body: "Are you sure you want to delete this retailer?",
    danger: true,
    confirmLabel: "Delete",
    onConfirm: async () => {
      try {
        await api(`/retailers/${retailer.id}`, { method: "DELETE" });
        hideConfirm();
        if (state.screen === "detail") {
          state.screen = "list";
        } else if (state.screen === "list") {
          state.retailers = await api("/retailers?book=" + state.book);
        }
        render();
      } catch (e) {
        hideConfirm();
        showWarningModal({
          title: "⚠️ Cannot Delete Retailer",
          body: e.message || `Cannot delete '${retailer.name}' because they have transaction history. Deletion blocked to preserve transaction records.`,
        });
      }
    },
  });
}

function showWarningModal(opts) {
  hideConfirm();
  const backdrop = el(`
    <div class="modal-backdrop" id="confirmBackdrop">
      <div class="modal-card">
        <div class="title" style="color:var(--due);">${opts.title}</div>
        <div class="body" style="margin-top:10px;margin-bottom:20px;line-height:1.4;">${escapeHtml(opts.body)}</div>
        <div class="modal-actions">
          <button class="primary" style="background:var(--ink);" id="closeWarningBtn">OK, Got It</button>
        </div>
      </div>
    </div>
  `);
  backdrop.querySelector("#closeWarningBtn").onclick = hideConfirm;
  document.body.appendChild(backdrop);
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

  const lockBtn = el(`<button class="icon-btn" title="Change Security PIN">&#9881;</button>`);
  lockBtn.onclick = () => showChangePinModal();

  const bar = topbar("Credit Ledger", { right: lockBtn });
  app.appendChild(bar);

  const page = el(`
    <div class="page">
      <div class="subtitle">Select Product Line</div>
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

  const quickActions = el(`
    <div class="quick-actions-section">
      <div class="section-label" style="margin-top:24px">Quick Actions</div>
      <button class="action-card-btn bill-btn">
        <div class="icon">&#128221;</div>
        <div class="info">
          <div class="title">Add Bill</div>
          <div class="desc">Record delivery bill total with retailer, product line & date</div>
        </div>
      </button>
      <button class="action-card-btn collection-btn" style="margin-top:12px">
        <div class="icon">&#128179;</div>
        <div class="info">
          <div class="title">Daily Collection Entry</div>
          <div class="desc">Record payments with retailer, product line & date</div>
        </div>
      </button>
      <button class="action-card-btn report-btn" style="margin-top:12px">
        <div class="icon">&#128200;</div>
        <div class="info">
          <div class="title">Monthly / Date Range Report</div>
          <div class="desc">View, print & export Excel reports per product line</div>
        </div>
      </button>
    </div>
  `);

  quickActions.querySelector(".bill-btn").onclick = () => {
    state.billBook = "santhoor";
    state.billRetailerId = null;
    state.billDate = localISODate(new Date());
    state.billAmount = "";
    state.screen = "billEntry";
    render();
  };

  quickActions.querySelector(".collection-btn").onclick = () => {
    state.collectionBook = "santhoor";
    state.collectionRetailerId = null;
    state.collectionDate = localISODate(new Date());
    state.collectionAmount = "";
    state.screen = "collectionEntry";
    render();
  };

  quickActions.querySelector(".report-btn").onclick = () => {
    state.reportBook = "santhoor";
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    state.reportFrom = localISODate(firstDay);
    state.reportTo = localISODate(today);
    state.screen = "monthlyReport";
    render();
  };

  page.appendChild(quickActions);
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
      <button type="button" id="searchMicBtn" style="background:none;border:none;font-size:22px;cursor:pointer;padding:4px;" title="Voice Search (Speak retailer name)">🎙️</button>
    </div>
  `);
  const searchInput = searchBox.querySelector("#searchInput");
  const searchMicBtn = searchBox.querySelector("#searchMicBtn");

  searchInput.oninput = (e) => {
    state.query = e.target.value;
    renderRetailerRows(listBody);
  };

  if (searchMicBtn) {
    searchMicBtn.onclick = () => {
      searchMicBtn.style.opacity = "0.5";
      startSpeechToTextForName(
        (text) => {
          searchInput.value = text;
          state.query = text;
          searchMicBtn.style.opacity = "1";
          renderRetailerRows(listBody);
        },
        (err) => {
          searchMicBtn.style.opacity = "1";
          alert(err || "Could not hear speech.");
        }
      );
    };
  }

  page.appendChild(searchBox);

  const quickActionsRow = el(`
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <button class="secondary-btn" id="topPrintBtn" style="flex:1;padding:12px 6px;font-size:14px;margin:0;">&#128438; Print List</button>
      <button class="secondary-btn" id="topReportBtn" style="flex:1;padding:12px 6px;font-size:14px;margin:0;">&#128200; Report</button>
      <button class="secondary-btn" id="topImportBtn" style="flex:1;padding:12px 6px;font-size:14px;margin:0;">&#128196; Import</button>
    </div>
  `);

  quickActionsRow.querySelector("#topPrintBtn").onclick = () => printBookList();
  quickActionsRow.querySelector("#topReportBtn").onclick = () => {
    state.reportBook = state.book;
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    state.reportFrom = localISODate(firstDay);
    state.reportTo = localISODate(today);
    state.screen = "monthlyReport";
    render();
  };
  quickActionsRow.querySelector("#topImportBtn").onclick = () => showBulkImportModal();

  page.appendChild(quickActionsRow);

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
          state.retailers.length === 0 ? "No retailers associated with this product line." : "No match found."
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
    addLongPressListener(
      row,
      () => showRetailerOptionsMenu(r),
      () => {
        state.activeRetailer = { id: r.id };
        state.screen = "detail";
        render();
      }
    );
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
        <label>Shop Name</label>
        <div style="position:relative;display:flex;align-items:center;">
          <input id="nameInput" placeholder="e.g. Ganesh Traders" autofocus style="padding-right:48px;" />
          <button type="button" id="nameMicBtn" style="position:absolute;right:8px;background:none;border:none;font-size:24px;padding:6px;cursor:pointer;" title="Voice input (Speak retailer name)">🎙️</button>
        </div>
        <div id="nameMicFeedback" class="hint" style="margin-top:4px;">Tap 🎙️ or keyboard mic to speak shop name</div>
      </div>

      <div class="field">
        <label>Associated Product Lines</label>
        <div class="checkbox-row" style="display:flex;gap:20px;margin-top:8px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700;cursor:pointer;">
            <input type="checkbox" id="chkSanthoor" checked style="width:22px;height:22px;" />
            Santoor
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700;cursor:pointer;">
            <input type="checkbox" id="chkMtr" checked style="width:22px;height:22px;" />
            MTR
          </label>
        </div>
      </div>

      <div class="field" id="openingSanthoorGroup">
        <label>Opening balance for Santoor (₹0 if none)</label>
        <input id="openingSanthoor" inputmode="numeric" placeholder="0" />
      </div>

      <div class="field" id="openingMtrGroup">
        <label>Opening balance for MTR (₹0 if none)</label>
        <input id="openingMtr" inputmode="numeric" placeholder="0" />
      </div>

      <button class="primary-btn ${BOOKS[state.book].cls}" id="saveBtn" disabled>Save Retailer</button>

      <div class="import-btn-container">
        <div style="font-size:14px;color:var(--ink-soft);margin-bottom:8px;">Have a list of retailers in Excel or JSON?</div>
        <button type="button" class="secondary-btn" id="bulkImportBtn" style="margin-top:0;">📊 Import Retailers from Excel / JSON</button>
      </div>
    </div>
  `);

  const nameInput = form.querySelector("#nameInput");
  const chkSanthoor = form.querySelector("#chkSanthoor");
  const chkMtr = form.querySelector("#chkMtr");
  const openingSanthoor = form.querySelector("#openingSanthoor");
  const openingMtr = form.querySelector("#openingMtr");
  const openingSanthoorGroup = form.querySelector("#openingSanthoorGroup");
  const openingMtrGroup = form.querySelector("#openingMtrGroup");
  const saveBtn = form.querySelector("#saveBtn");

  const updateVisibility = () => {
    openingSanthoorGroup.style.display = chkSanthoor.checked ? "block" : "none";
    openingMtrGroup.style.display = chkMtr.checked ? "block" : "none";
    saveBtn.disabled = !nameInput.value.trim() || (!chkSanthoor.checked && !chkMtr.checked);
  };

  nameInput.oninput = updateVisibility;
  chkSanthoor.onchange = updateVisibility;
  chkMtr.onchange = updateVisibility;

  const nameMicBtn = form.querySelector("#nameMicBtn");
  const nameMicFeedback = form.querySelector("#nameMicFeedback");
  if (nameMicBtn) {
    nameMicBtn.onclick = () => {
      nameMicFeedback.textContent = "Listening... Speak shop name now";
      nameMicFeedback.style.color = "var(--santhoor)";
      nameMicBtn.style.opacity = "0.5";

      startSpeechToTextForName(
        (text) => {
          nameInput.value = text;
          nameMicFeedback.textContent = "Recognized: " + text;
          nameMicFeedback.style.color = "var(--ink-soft)";
          nameMicBtn.style.opacity = "1";
          updateVisibility();
        },
        (err) => {
          nameMicFeedback.textContent = err || "Could not hear speech. Try typing.";
          nameMicFeedback.style.color = "var(--due)";
          nameMicBtn.style.opacity = "1";
        }
      );
    };
  }

  openingSanthoor.oninput = () => {
    openingSanthoor.value = openingSanthoor.value.replace(/[^0-9]/g, "");
  };
  openingMtr.oninput = () => {
    openingMtr.value = openingMtr.value.replace(/[^0-9]/g, "");
  };

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const payload = {
        name: nameInput.value.trim(),
        has_santhoor: chkSanthoor.checked,
        has_mtr: chkMtr.checked,
        opening_santhoor: chkSanthoor.checked ? openingSanthoor.value || 0 : 0,
        opening_mtr: chkMtr.checked ? openingMtr.value || 0 : 0,
      };
      await api("/retailers", { method: "POST", body: JSON.stringify(payload) });
      state.screen = "list";
      render();
    } catch (e) {
      alert(e.message || "Could not save retailer. Try again.");
      saveBtn.disabled = false;
    }
  };

  const bulkImportBtn = form.querySelector("#bulkImportBtn");
  if (bulkImportBtn) {
    bulkImportBtn.onclick = () => showBulkImportModal();
  }

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
  deleteBtn.onclick = () => handleDeleteRetailer(r);

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
  page.appendChild(
    el(`
    <div class="balance-block">
      <div class="label">Current balance (${BOOKS[state.book].label})</div>
      <div class="amount ${r.balance > 0 ? "due" : "clear"}">${inr(r.balance)}</div>
    </div>
  `)
  );

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

  const historyHeader = el(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin:24px 0 10px;">
      <div class="section-label" style="margin:0;">History</div>
      <div style="display:flex;gap:8px;">
        ${r.history.length > 0 ? `<button class="clear-history-btn" id="clearHistBtn" style="background:none;border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700;color:var(--due);cursor:pointer;">🗑️ Clear History</button>` : ""}
        ${r.has_archived ? `<button class="restore-history-btn" id="restoreHistBtn" style="background:none;border:1px solid var(--santhoor);border-radius:8px;padding:6px 12px;font-size:13px;font-weight:700;color:var(--santhoor);cursor:pointer;">↺ Restore History</button>` : ""}
      </div>
    </div>
  `);

  if (historyHeader.querySelector("#clearHistBtn")) {
    historyHeader.querySelector("#clearHistBtn").onclick = () => {
      showConfirm({
        title: "Clear History?",
        body: `Archive transaction history for ${escapeHtml(r.name)}? This will reset the running balance to ₹0. You can restore records anytime.`,
        confirmLabel: "Clear History",
        onConfirm: async () => {
          hideConfirm();
          try {
            await api(`/retailers/${r.id}/clear?book=${state.book}`, { method: "POST" });
            renderDetail();
          } catch (e) {
            alert(e.message || "Could not clear history");
          }
        },
      });
    };
  }

  if (historyHeader.querySelector("#restoreHistBtn")) {
    historyHeader.querySelector("#restoreHistBtn").onclick = async () => {
      try {
        await api(`/retailers/${r.id}/restore?book=${state.book}`, { method: "POST" });
        renderDetail();
      } catch (e) {
        alert(e.message || "Could not restore history");
      }
    };
  }

  page.appendChild(historyHeader);

  if (r.history.length === 0) {
    page.appendChild(
      el(`<div class="empty-note">${r.has_archived ? "History cleared (archived). Tap '↺ Restore History' above to bring entries back." : "No entries yet."}</div>`)
    );
  } else {
    r.history.forEach((h) => {
      page.appendChild(
        el(`
        <div class="history-row">
          <div>
            <div class="date">${h.date}</div>
            <div class="type ${h.type === "purchase" ? "due" : "clear"}">
              ${h.type === "purchase" ? `Bill #${h.bill_number}` : "Payment received"}
            </div>
          </div>
          <div class="amt">${h.type === "purchase" ? "+" : "-"}${inr(h.amount)}</div>
        </div>
      `)
      );
    });
  }

  const printBtn = el(`<button class="secondary-btn">&#128438; Print Statement</button>`);
  printBtn.onclick = () => printRetailerStatement(r);
  page.appendChild(printBtn);

  app.appendChild(page);
}

// ---------------- add bill entry ----------------

async function renderBillEntry() {
  app.innerHTML = "";
  app.appendChild(
    topbar("Add Bill", {
      back: () => {
        state.screen = "home";
        render();
      },
    })
  );

  const page = el(`<div class="page"></div>`);

  // Product Line Tabs
  const tabs = el(`
    <div class="product-line-tabs">
      <button class="tab-btn ${state.billBook === "santhoor" ? "active santhoor" : ""}" id="tabSanthoor">Santoor</button>
      <button class="tab-btn ${state.billBook === "mtr" ? "active mtr" : ""}" id="tabMtr">MTR</button>
    </div>
  `);

  tabs.querySelector("#tabSanthoor").onclick = () => {
    state.billBook = "santhoor";
    state.billRetailerId = null;
    renderBillEntry();
  };
  tabs.querySelector("#tabMtr").onclick = () => {
    state.billBook = "mtr";
    state.billRetailerId = null;
    renderBillEntry();
  };
  page.appendChild(tabs);

  // Form (3 fields: Retailer, Date, Amount)
  const form = el(`
    <div style="margin-top:16px;">
      <div class="field">
        <label>Retailer (${BOOKS[state.billBook].label})</label>
        <div class="searchable-select-wrap" id="billRetailerSearchWrap">
          <div class="searchable-select-box">
            <input type="text" class="searchable-select-input" id="billRetailerSearchInput" placeholder="Type retailer name to search..." autocomplete="off" />
            <button type="button" class="searchable-clear-btn" id="billRetailerClearBtn" style="display:none;" title="Clear selection">✕</button>
          </div>
          <div class="searchable-dropdown-list" id="billRetailerDropdownList" style="display:none;"></div>
        </div>
      </div>

      <div class="field">
        <label>Bill Date</label>
        <input type="date" id="billDateInput" value="${state.billDate || localISODate(new Date())}" />
      </div>

      <div class="field">
        <label>Total Bill Amount (₹)</label>
        <div style="position:relative;">
          <input class="entry-input" id="billAmtInput" inputmode="numeric" placeholder="Enter bill amount" value="${state.billAmount || ""}" style="padding-right:54px;text-align:left;padding-left:18px;" />
          <button id="billMicBtn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;font-size:24px;padding:8px;border-radius:999px;cursor:pointer;" title="Voice input (Kannada/English)">🎙️</button>
        </div>
        <div id="billSpeechFeedback" style="font-size:14px;color:var(--santhoor);margin-top:6px;min-height:20px;">
          Tap 🎙️ or keyboard mic to speak amount
        </div>
      </div>

      <button class="primary-btn ${BOOKS[state.billBook].cls}" id="saveBillBtn" disabled>Save Bill</button>
    </div>
  `);

  const searchInput = form.querySelector("#billRetailerSearchInput");
  const clearBtn = form.querySelector("#billRetailerClearBtn");
  const dropdownList = form.querySelector("#billRetailerDropdownList");
  const dateInput = form.querySelector("#billDateInput");
  const amtInput = form.querySelector("#billAmtInput");
  const micBtn = form.querySelector("#billMicBtn");
  const feedback = form.querySelector("#billSpeechFeedback");
  const saveBtn = form.querySelector("#saveBillBtn");

  let fetchedRetailers = [];

  const updateSaveDisabled = () => {
    const val = Number(amtInput.value);
    saveBtn.disabled = !state.billRetailerId || !val || val <= 0;
  };

  const renderDropdownItems = (filterQuery) => {
    dropdownList.innerHTML = "";
    const q = filterQuery.trim().toLowerCase();
    const matches = fetchedRetailers.filter((r) => r.name.toLowerCase().includes(q));

    if (matches.length === 0) {
      dropdownList.innerHTML = `<div class="searchable-empty">No matching retailer found</div>`;
    } else {
      matches.forEach((r) => {
        const item = el(`
          <div class="searchable-item ${String(r.id) === String(state.billRetailerId) ? "selected" : ""}">
            <span>${escapeHtml(r.name)}</span>
            <span class="item-bal ${r.balance > 0 ? "due" : "clear"}">${r.balance > 0 ? inr(r.balance) : "Cleared"}</span>
          </div>
        `);
        item.onmousedown = (e) => {
          e.preventDefault();
          selectRetailer(r);
        };
        dropdownList.appendChild(item);
      });
    }
  };

  const selectRetailer = (r) => {
    if (r) {
      state.billRetailerId = r.id;
      searchInput.value = `${r.name} (Bal: ${r.balance > 0 ? inr(r.balance) : "Cleared"})`;
      clearBtn.style.display = "block";
    } else {
      state.billRetailerId = null;
      searchInput.value = "";
      clearBtn.style.display = "none";
    }
    dropdownList.style.display = "none";
    updateSaveDisabled();
  };

  searchInput.onfocus = () => {
    dropdownList.style.display = "block";
    const q = state.billRetailerId ? "" : searchInput.value;
    renderDropdownItems(q);
  };

  searchInput.oninput = () => {
    state.billRetailerId = null;
    clearBtn.style.display = searchInput.value ? "block" : "none";
    dropdownList.style.display = "block";
    renderDropdownItems(searchInput.value);
    updateSaveDisabled();
  };

  clearBtn.onclick = () => {
    selectRetailer(null);
    searchInput.focus();
    dropdownList.style.display = "block";
    renderDropdownItems("");
  };

  document.addEventListener("click", function closeBillDropdown(e) {
    if (!form.contains(e.target)) {
      dropdownList.style.display = "none";
    }
  });

  dateInput.onchange = (e) => {
    state.billDate = e.target.value;
  };

  amtInput.oninput = () => {
    amtInput.value = amtInput.value.replace(/[^0-9]/g, "");
    state.billAmount = amtInput.value;
    updateSaveDisabled();
  };

  micBtn.onclick = () => {
    feedback.textContent = "Listening... speak amount in Kannada or English";
    micBtn.style.opacity = "0.5";
    startSpeechToText(
      (numberStr) => {
        amtInput.value = numberStr;
        state.billAmount = numberStr;
        feedback.textContent = `Recognized amount: ₹${numberStr}`;
        micBtn.style.opacity = "1";
        updateSaveDisabled();
      },
      (err) => {
        feedback.textContent = err || "Could not hear speech. Try keyboard mic.";
        micBtn.style.opacity = "1";
      }
    );
  };

  saveBtn.onclick = async () => {
    if (!state.billRetailerId) return;
    saveBtn.disabled = true;
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          retailer_id: state.billRetailerId,
          book: state.billBook,
          type: "purchase",
          amount: Number(amtInput.value),
          date: dateInput.value,
        }),
      });
      alert(`Bill of ₹${plainNum(amtInput.value)} saved successfully!`);
      state.billAmount = "";
      amtInput.value = "";
      updateSaveDisabled();
    } catch (e) {
      alert(e.message || "Could not save entry.");
      saveBtn.disabled = false;
    }
  };

  page.appendChild(form);
  app.appendChild(page);

  try {
    const retailers = await api("/retailers?book=" + state.billBook);
    fetchedRetailers = retailers.sort((a, b) => a.name.localeCompare(b.name));
    if (state.billRetailerId) {
      const match = fetchedRetailers.find((r) => String(r.id) === String(state.billRetailerId));
      if (match) selectRetailer(match);
    }
  } catch (e) {
    searchInput.placeholder = "Could not load retailers";
  }
}

// ---------------- daily collection entry ----------------

async function renderCollectionEntry() {
  app.innerHTML = "";
  app.appendChild(
    topbar("Daily Collection Entry", {
      back: () => {
        state.screen = "home";
        render();
      },
    })
  );

  const page = el(`<div class="page"></div>`);

  // Product Line Tabs
  const tabs = el(`
    <div class="product-line-tabs">
      <button class="tab-btn ${state.collectionBook === "santhoor" ? "active santhoor" : ""}" id="tabSanthoor">Santoor</button>
      <button class="tab-btn ${state.collectionBook === "mtr" ? "active mtr" : ""}" id="tabMtr">MTR</button>
    </div>
  `);

  tabs.querySelector("#tabSanthoor").onclick = () => {
    state.collectionBook = "santhoor";
    state.collectionRetailerId = null;
    renderCollectionEntry();
  };
  tabs.querySelector("#tabMtr").onclick = () => {
    state.collectionBook = "mtr";
    state.collectionRetailerId = null;
    renderCollectionEntry();
  };
  page.appendChild(tabs);

  // Form
  const form = el(`
    <div style="margin-top:16px;">
      <div class="field">
        <label>Retailer (${BOOKS[state.collectionBook].label})</label>
        <div class="searchable-select-wrap" id="retailerSearchWrap">
          <div class="searchable-select-box">
            <input type="text" class="searchable-select-input" id="retailerSearchInput" placeholder="Type retailer name to search..." autocomplete="off" />
            <button type="button" class="searchable-clear-btn" id="retailerClearBtn" style="display:none;" title="Clear selection">✕</button>
          </div>
          <div class="searchable-dropdown-list" id="retailerDropdownList" style="display:none;"></div>
        </div>
      </div>

      <div class="field">
        <label>Collection Date</label>
        <input type="date" id="collectionDateInput" value="${state.collectionDate || localISODate(new Date())}" />
      </div>

      <div class="field">
        <label>Amount Collected (₹)</label>
        <div style="position:relative;">
          <input class="entry-input" id="collAmtInput" inputmode="numeric" placeholder="Enter amount" value="${state.collectionAmount || ""}" style="padding-right:54px;text-align:left;padding-left:18px;" />
          <button id="micBtn" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;font-size:24px;padding:8px;border-radius:999px;cursor:pointer;" title="Voice input (Kannada/English)">🎙️</button>
        </div>
        <div id="speechFeedback" style="font-size:14px;color:var(--santhoor);margin-top:6px;min-height:20px;">
          Tap 🎙️ or keyboard mic to speak amount
        </div>
      </div>

      <button class="primary-btn ${BOOKS[state.collectionBook].cls}" id="saveCollBtn" disabled>Save Collection</button>
    </div>
  `);

  const searchInput = form.querySelector("#retailerSearchInput");
  const clearBtn = form.querySelector("#retailerClearBtn");
  const dropdownList = form.querySelector("#retailerDropdownList");
  const dateInput = form.querySelector("#collectionDateInput");
  const amtInput = form.querySelector("#collAmtInput");
  const micBtn = form.querySelector("#micBtn");
  const feedback = form.querySelector("#speechFeedback");
  const saveBtn = form.querySelector("#saveCollBtn");

  let fetchedRetailers = [];

  const updateSaveDisabled = () => {
    const val = Number(amtInput.value);
    saveBtn.disabled = !state.collectionRetailerId || !val || val <= 0;
  };

  const renderDropdownItems = (filterQuery) => {
    dropdownList.innerHTML = "";
    const q = filterQuery.trim().toLowerCase();
    const matches = fetchedRetailers.filter((r) => r.name.toLowerCase().includes(q));

    if (matches.length === 0) {
      dropdownList.innerHTML = `<div class="searchable-empty">No matching retailer found</div>`;
    } else {
      matches.forEach((r) => {
        const item = el(`
          <div class="searchable-item ${String(r.id) === String(state.collectionRetailerId) ? "selected" : ""}">
            <span>${escapeHtml(r.name)}</span>
            <span class="item-bal ${r.balance > 0 ? "due" : "clear"}">${r.balance > 0 ? inr(r.balance) : "Cleared"}</span>
          </div>
        `);
        item.onmousedown = (e) => {
          e.preventDefault();
          selectRetailer(r);
        };
        dropdownList.appendChild(item);
      });
    }
  };

  const selectRetailer = (r) => {
    if (r) {
      state.collectionRetailerId = r.id;
      searchInput.value = `${r.name} (Bal: ${r.balance > 0 ? inr(r.balance) : "Cleared"})`;
      clearBtn.style.display = "block";
    } else {
      state.collectionRetailerId = null;
      searchInput.value = "";
      clearBtn.style.display = "none";
    }
    dropdownList.style.display = "none";
    updateSaveDisabled();
  };

  searchInput.onfocus = () => {
    dropdownList.style.display = "block";
    const q = state.collectionRetailerId ? "" : searchInput.value;
    renderDropdownItems(q);
  };

  searchInput.oninput = () => {
    state.collectionRetailerId = null;
    clearBtn.style.display = searchInput.value ? "block" : "none";
    dropdownList.style.display = "block";
    renderDropdownItems(searchInput.value);
    updateSaveDisabled();
  };

  clearBtn.onclick = () => {
    selectRetailer(null);
    searchInput.focus();
    dropdownList.style.display = "block";
    renderDropdownItems("");
  };

  document.addEventListener("click", function closeDropdown(e) {
    if (!form.contains(e.target)) {
      dropdownList.style.display = "none";
    }
  });

  dateInput.onchange = (e) => {
    state.collectionDate = e.target.value;
  };

  amtInput.oninput = () => {
    amtInput.value = amtInput.value.replace(/[^0-9]/g, "");
    state.collectionAmount = amtInput.value;
    updateSaveDisabled();
  };

  micBtn.onclick = () => {
    feedback.textContent = "Listening... speak amount in Kannada or English";
    micBtn.style.opacity = "0.5";
    startSpeechToText(
      (numberStr) => {
        amtInput.value = numberStr;
        state.collectionAmount = numberStr;
        feedback.textContent = `Recognized amount: ₹${numberStr}`;
        micBtn.style.opacity = "1";
        updateSaveDisabled();
      },
      (err) => {
        feedback.textContent = err || "Could not hear speech. Try keyboard mic.";
        micBtn.style.opacity = "1";
      }
    );
  };

  saveBtn.onclick = async () => {
    if (!state.collectionRetailerId) return;
    saveBtn.disabled = true;
    try {
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          retailer_id: state.collectionRetailerId,
          book: state.collectionBook,
          type: "payment",
          amount: Number(amtInput.value),
          date: dateInput.value,
        }),
      });
      alert(`Collection of ₹${plainNum(amtInput.value)} saved successfully!`);
      state.collectionAmount = "";
      amtInput.value = "";
      updateSaveDisabled();
    } catch (e) {
      alert(e.message || "Could not save entry.");
      saveBtn.disabled = false;
    }
  };

  page.appendChild(form);
  app.appendChild(page);

  try {
    const retailers = await api("/retailers?book=" + state.collectionBook);
    fetchedRetailers = retailers.sort((a, b) => a.name.localeCompare(b.name));
    if (state.collectionRetailerId) {
      const match = fetchedRetailers.find((r) => String(r.id) === String(state.collectionRetailerId));
      if (match) selectRetailer(match);
    }
  } catch (e) {
    searchInput.placeholder = "Could not load retailers";
  }
}

// ---------------- monthly / date range report ----------------

async function renderMonthlyReport() {
  app.innerHTML = "";
  app.appendChild(
    topbar("Monthly / Range Report", {
      back: () => {
        state.screen = "home";
        render();
      },
    })
  );

  const page = el(`<div class="page" style="padding-bottom:60px;"></div>`);

  // Product Line Tabs
  const tabs = el(`
    <div class="product-line-tabs">
      <button class="tab-btn ${state.reportBook === "santhoor" ? "active santhoor" : ""}" id="tabSanthoor">Santoor Report</button>
      <button class="tab-btn ${state.reportBook === "mtr" ? "active mtr" : ""}" id="tabMtr">MTR Report</button>
    </div>
  `);

  tabs.querySelector("#tabSanthoor").onclick = () => {
    state.reportBook = "santhoor";
    renderMonthlyReport();
  };
  tabs.querySelector("#tabMtr").onclick = () => {
    state.reportBook = "mtr";
    renderMonthlyReport();
  };
  page.appendChild(tabs);

  // Filter Box
  const today = new Date();
  const defaultFrom = state.reportFrom || localISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultTo = state.reportTo || localISODate(today);

  const filterBox = el(`
    <div class="report-filter-box" style="margin-top:14px;background:var(--white);padding:16px;border-radius:16px;border:1px solid var(--line);">
      <div class="preset-row" style="display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;">
        <button class="preset-btn" id="btnThisMonth">This Month</button>
        <button class="preset-btn" id="btn7Days">Last 7 Days</button>
        <button class="preset-btn" id="btn30Days">Last 30 Days</button>
      </div>
      <div class="date-range-row">
        <div class="field">
          <label>From Date</label>
          <input type="date" id="repFrom" value="${defaultFrom}" />
        </div>
        <div class="field">
          <label>To Date</label>
          <input type="date" id="repTo" value="${defaultTo}" />
        </div>
      </div>
      <button class="primary-btn ${BOOKS[state.reportBook].cls}" id="genReportBtn" style="padding:14px;font-size:18px;margin-top:8px;">
        Generate Report
      </button>
    </div>
  `);

  filterBox.querySelector("#btnThisMonth").onclick = () => {
    const f = new Date(today.getFullYear(), today.getMonth(), 1);
    filterBox.querySelector("#repFrom").value = localISODate(f);
    filterBox.querySelector("#repTo").value = localISODate(today);
  };
  filterBox.querySelector("#btn7Days").onclick = () => {
    const f = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
    filterBox.querySelector("#repFrom").value = localISODate(f);
    filterBox.querySelector("#repTo").value = localISODate(today);
  };
  filterBox.querySelector("#btn30Days").onclick = () => {
    const f = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    filterBox.querySelector("#repFrom").value = localISODate(f);
    filterBox.querySelector("#repTo").value = localISODate(today);
  };

  const reportResults = el(`<div id="reportResults" style="margin-top:20px;"></div>`);
  filterBox.querySelector("#genReportBtn").onclick = () => {
    state.reportFrom = filterBox.querySelector("#repFrom").value;
    state.reportTo = filterBox.querySelector("#repTo").value;
    loadAndRenderReportGrid(reportResults);
  };

  page.appendChild(filterBox);
  page.appendChild(reportResults);
  app.appendChild(page);

  state.reportFrom = defaultFrom;
  state.reportTo = defaultTo;
  loadAndRenderReportGrid(reportResults);
}

async function loadAndRenderReportGrid(container) {
  container.innerHTML = `<div class="empty-note">Generating report…</div>`;
  let data;
  try {
    data = await api(`/reports/grid?book=${state.reportBook}&from=${state.reportFrom}&to=${state.reportTo}`);
  } catch (e) {
    container.innerHTML = `<div class="empty-note">Could not load report: ${escapeHtml(e.message)}</div>`;
    return;
  }

  container.innerHTML = "";

  const actionRow = el(`
    <div style="position:sticky;top:0;z-index:100;background:var(--paper);padding:10px 0 12px 0;margin-bottom:12px;display:flex;gap:10px;border-bottom:1px solid var(--line);">
      <button class="secondary-btn" id="printReportBtn" style="flex:1;">&#128438; Print Report</button>
      <button class="secondary-btn" id="excelReportBtn" style="flex:1;background:var(--clear);color:white;border-color:var(--clear);">&#128190; Export Excel</button>
    </div>
  `);

  actionRow.querySelector("#printReportBtn").onclick = () => {
    printGrid(data.from, data.to);
  };
  actionRow.querySelector("#excelReportBtn").onclick = async () => {
    const btn = actionRow.querySelector("#excelReportBtn");
    const origText = btn.innerHTML;
    btn.innerHTML = "Downloading…";
    btn.disabled = true;
    try {
      const url = `/api/reports/excel?book=${data.book}&from=${data.from}&to=${data.to}`;
      const res = await fetch(url, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not generate Excel file.");
      const blob = await res.blob();
      const filename = `Ledger_Report_${data.book}_${data.from}_to_${data.to}.xlsx`;
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (e) {
      alert(e.message || "Failed to download Excel report.");
    } finally {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  };

  container.appendChild(actionRow);

  const stats = el(`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;">
      <div class="stat-card" style="background:var(--white);padding:14px;border-radius:14px;border:1px solid var(--line);">
        <div style="font-size:13px;color:var(--ink-soft);">Total Credit (Paid)</div>
        <div style="font-size:22px;font-weight:800;color:var(--clear);margin-top:2px;">${inr(data.totals.grand_credit)}</div>
      </div>
      <div class="stat-card" style="background:var(--white);padding:14px;border-radius:14px;border:1px solid var(--line);">
        <div style="font-size:13px;color:var(--ink-soft);">Total Debit (Billed)</div>
        <div style="font-size:22px;font-weight:800;color:var(--due);margin-top:2px;">${inr(data.totals.grand_debit)}</div>
      </div>
      <div class="stat-card" style="background:var(--white);padding:14px;border-radius:14px;border:1px solid var(--line);">
        <div style="font-size:13px;color:var(--ink-soft);">Net Outstanding</div>
        <div style="font-size:22px;font-weight:800;color:${data.totals.grand_balance > 0 ? "var(--due)" : "var(--clear)"};margin-top:2px;">${inr(data.totals.grand_balance)}</div>
      </div>
    </div>
  `);
  container.appendChild(stats);

  const rows = data.rows
    .map((r) => `
      <tr>
        <td style="padding:10px 8px;font-weight:700;font-size:13px;white-space:nowrap;">${escapeHtml(r.name)}</td>
        <td style="padding:10px 8px;text-align:center;font-size:13px;color:var(--ink-soft);">${r.credit_date}</td>
        <td style="padding:10px 8px;text-align:right;font-weight:700;font-size:13px;color:var(--clear);">${r.credit_amount > 0 ? inr(r.credit_amount) : "-"}</td>
        <td style="padding:10px 8px;text-align:center;font-size:13px;color:var(--ink-soft);">${r.debit_date}</td>
        <td style="padding:10px 8px;text-align:right;font-weight:700;font-size:13px;color:var(--due);">${r.debit_amount > 0 ? inr(r.debit_amount) : "-"}</td>
        <td style="padding:10px 8px;text-align:right;font-weight:800;font-size:13px;color:${r.balance > 0 ? "var(--due)" : "var(--clear)"};">${inr(r.balance)}</td>
      </tr>
    `)
    .join("");

  const tableCard = el(`
    <div class="report-table-wrap">
      <table class="report-table">
        <thead>
          <tr style="background:var(--paper);border-bottom:2px solid var(--line);">
            <th style="padding:10px 8px;text-align:left;font-size:13px;">Retailer Name</th>
            <th style="padding:10px 8px;text-align:center;font-size:13px;">Credit Date</th>
            <th style="padding:10px 8px;text-align:right;font-size:13px;color:var(--clear);">Credit (₹)</th>
            <th style="padding:10px 8px;text-align:center;font-size:13px;">Debit Date</th>
            <th style="padding:10px 8px;text-align:right;font-size:13px;color:var(--due);">Debit (₹)</th>
            <th style="padding:10px 8px;text-align:right;font-size:13px;">Net Balance (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--ink-soft)">No retailers found for this product line</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background:var(--paper);border-top:2px solid var(--line);">
            <th style="padding:10px 8px;text-align:left;font-weight:800;">TOTAL</th>
            <th style="padding:10px 8px;text-align:center;">-</th>
            <th style="padding:10px 8px;text-align:right;font-weight:800;color:var(--clear);">${inr(data.totals.grand_credit)}</th>
            <th style="padding:10px 8px;text-align:center;">-</th>
            <th style="padding:10px 8px;text-align:right;font-weight:800;color:var(--due);">${inr(data.totals.grand_debit)}</th>
            <th style="padding:10px 8px;text-align:right;font-weight:800;color:${data.totals.grand_balance > 0 ? "var(--due)" : "var(--clear)"};">${inr(data.totals.grand_balance)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `);
  container.appendChild(tableCard);
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

async function printGrid(from, to) {
  let data;
  try {
    data = await api(`/reports/grid?book=${state.reportBook || state.book}&from=${from}&to=${to}`);
  } catch (e) {
    alert(e.message || "Could not load data for that range.");
    return;
  }

  const rows = data.rows
    .map(
      (r) => `
        <tr>
          <td style="font-weight:700;">${escapeHtml(r.name)}</td>
          <td style="text-align:center;">${r.credit_date}</td>
          <td style="text-align:right;">${r.credit_amount > 0 ? inr(r.credit_amount) : "-"}</td>
          <td style="text-align:center;">${r.debit_date}</td>
          <td style="text-align:right;">${r.debit_amount > 0 ? inr(r.debit_amount) : "-"}</td>
          <td style="text-align:right;font-weight:700;">${inr(r.balance)}</td>
        </tr>`
    )
    .join("");

  document.getElementById("printArea").innerHTML = `
    <div class="print-header">
      <h2>${BOOKS[data.book].label} &mdash; Credit & Debit Report</h2>
      <div class="meta">Date Range: ${from} to ${to} &middot; Printed ${printDateStamp()}</div>
    </div>
    <table class="print-table report-print-table">
      <thead>
        <tr>
          <th style="width:30%;">Retailer Name</th>
          <th style="width:14%;text-align:center;">Credit Date</th>
          <th style="width:14%;text-align:right;">Credit (₹)</th>
          <th style="width:14%;text-align:center;">Debit Date</th>
          <th style="width:14%;text-align:right;">Debit (₹)</th>
          <th style="width:14%;text-align:right;">Net Balance (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="6" style="text-align:center;">No retailers found</td></tr>`}
      </tbody>
      <tfoot>
        <tr style="font-weight:bold;background:#eee;">
          <td>TOTAL</td>
          <td style="text-align:center;">-</td>
          <td style="text-align:right;">${inr(data.totals.grand_credit)}</td>
          <td style="text-align:center;">-</td>
          <td style="text-align:right;">${inr(data.totals.grand_debit)}</td>
          <td style="text-align:right;">${inr(data.totals.grand_balance)}</td>
        </tr>
      </tfoot>
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

// ---------------- entry (single retailer view) ----------------

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
  body.appendChild(el(`<div class="mic-hint">Tap the mic on your keyboard or speak the amount</div>`));

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

// ---------------- bulk import modal ----------------

function showBulkImportModal() {
  const backdrop = el(`
    <div class="modal-backdrop" id="importBackdrop">
      <div class="modal-card" style="max-width:520px;border-radius:20px;padding:24px;">
        <div class="title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Import Retailers</span>
          <button id="closeImportModalBtn" style="background:none;border:none;font-size:24px;cursor:pointer;">&times;</button>
        </div>
        <div class="body" id="importModalBody" style="margin-top:14px;margin-bottom:14px;">
          <p style="font-size:15px;color:var(--ink-soft);margin-bottom:16px;">
            Upload an <strong>Excel (.xlsx)</strong> or <strong>JSON (.json)</strong> file with your retailer list.
          </p>
          <div class="import-dropzone" id="fileDropzone">
            <div style="font-size:32px;margin-bottom:6px;">📄</div>
            <div style="font-size:16px;font-weight:700;color:var(--ink);">Click or drag file to upload</div>
            <div style="font-size:13px;color:var(--ink-soft);margin-top:4px;">Supports .xlsx or .json files</div>
            <input type="file" id="bulkFileInput" accept=".xlsx,.xls,.json" style="display:none;" />
          </div>
          <div id="fileInfo" style="display:none;font-size:14px;font-weight:700;color:var(--santhoor);margin-bottom:12px;text-align:center;"></div>
        </div>
        <div class="modal-actions" id="importModalActions">
          <button class="cancel" id="cancelImportBtn">Cancel</button>
          <button class="primary" id="startImportBtn" disabled>Upload & Process</button>
        </div>
      </div>
    </div>
  `);

  document.body.appendChild(backdrop);

  const fileInput = backdrop.querySelector("#bulkFileInput");
  const dropzone = backdrop.querySelector("#fileDropzone");
  const fileInfo = backdrop.querySelector("#fileInfo");
  const startBtn = backdrop.querySelector("#startImportBtn");
  const cancelBtn = backdrop.querySelector("#cancelImportBtn");
  const closeBtn = backdrop.querySelector("#closeImportModalBtn");

  const close = () => backdrop.remove();
  cancelBtn.onclick = close;
  closeBtn.onclick = close;

  dropzone.onclick = () => fileInput.click();

  let selectedFile = null;
  fileInput.onchange = (e) => {
    if (e.target.files && e.target.files[0]) {
      selectedFile = e.target.files[0];
      fileInfo.textContent = `Selected: ${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`;
      fileInfo.style.display = "block";
      startBtn.disabled = false;
    }
  };

  startBtn.onclick = async () => {
    if (!selectedFile) return;
    startBtn.disabled = true;
    startBtn.textContent = "Processing...";

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/retailers/bulk-import?confirm=1", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process file.");
      }

      if (data.status === "mapping_required") {
        renderMappingStep(data, selectedFile, backdrop);
      } else {
        renderSummaryStep(data, backdrop);
      }
    } catch (err) {
      alert(err.message || "An error occurred during import.");
      startBtn.disabled = false;
      startBtn.textContent = "Upload & Process";
    }
  };
}

function renderMappingStep(data, file, backdrop) {
  const cols = data.columns || [];
  const sugg = data.suggested_mapping || {};
  const modalBody = backdrop.querySelector("#importModalBody");
  const modalActions = backdrop.querySelector("#importModalActions");

  const optionsHtml = (selected) => {
    return `<option value="">-- Ignore --</option>` + cols.map(c =>
      `<option value="${escapeHtml(c)}" ${c === selected ? 'selected' : ''}>${escapeHtml(c)}</option>`
    ).join('');
  };

  modalBody.innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--ink);">Confirm Header Mapping</div>
    <p style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">
      We detected the columns below. Please confirm which Excel columns correspond to retailer fields:
    </p>
    <table class="import-mapping-table">
      <tr>
        <td><strong>Retailer Name *</strong></td>
        <td><select id="mapName">${optionsHtml(sugg.name)}</select></td>
      </tr>
      <tr>
        <td>Santoor Line</td>
        <td><select id="mapSanthoor">${optionsHtml(sugg.has_santhoor)}</select></td>
      </tr>
      <tr>
        <td>MTR Line</td>
        <td><select id="mapMtr">${optionsHtml(sugg.has_mtr)}</select></td>
      </tr>
      <tr>
        <td>Opening Bal (Santoor)</td>
        <td><select id="mapOpenSanthoor">${optionsHtml(sugg.opening_santhoor)}</select></td>
      </tr>
      <tr>
        <td>Opening Bal (MTR)</td>
        <td><select id="mapOpenMtr">${optionsHtml(sugg.opening_mtr)}</select></td>
      </tr>
    </table>
  `;

  modalActions.innerHTML = `
    <button class="cancel" id="cancelMapBtn">Cancel</button>
    <button class="primary" id="confirmMapBtn">Confirm & Import</button>
  `;

  backdrop.querySelector("#cancelMapBtn").onclick = () => backdrop.remove();
  backdrop.querySelector("#confirmMapBtn").onclick = async () => {
    const mapName = backdrop.querySelector("#mapName").value;
    if (!mapName) {
      alert("Please select a column for Retailer Name.");
      return;
    }

    const mapping = {
      name: mapName,
      has_santhoor: backdrop.querySelector("#mapSanthoor").value,
      has_mtr: backdrop.querySelector("#mapMtr").value,
      opening_santhoor: backdrop.querySelector("#mapOpenSanthoor").value,
      opening_mtr: backdrop.querySelector("#mapOpenMtr").value
    };

    const confirmBtn = backdrop.querySelector("#confirmMapBtn");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Importing...";

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/retailers/bulk-import", {
        method: "POST",
        body: formData
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Import failed");
      renderSummaryStep(result, backdrop);
    } catch (err) {
      alert(err.message || "Failed to complete import.");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirm & Import";
    }
  };
}

function renderSummaryStep(data, backdrop) {
  const modalBody = backdrop.querySelector("#importModalBody");
  const modalActions = backdrop.querySelector("#importModalActions");

  const addedList = data.added || [];
  const skippedList = data.skipped || [];

  modalBody.innerHTML = `
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:38px;">🎉</div>
      <div style="font-size:20px;font-weight:900;color:var(--ink);">Import Completed</div>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:16px;">
      <div style="flex:1;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:#059669;">${data.added_count || 0}</div>
        <div style="font-size:13px;font-weight:700;color:#047857;">Added</div>
      </div>
      <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:#d97706;">${data.skipped_count || 0}</div>
        <div style="font-size:13px;font-weight:700;color:#b45309;">Duplicates Skipped</div>
      </div>
    </div>

    ${addedList.length > 0 ? `
      <div style="font-size:13px;font-weight:700;color:var(--ink);margin-top:8px;">Added Retailers:</div>
      <div class="import-summary-box">
        ${addedList.map(name => `<div>✅ ${escapeHtml(name)}</div>`).join('')}
      </div>
    ` : ''}

    ${skippedList.length > 0 ? `
      <div style="font-size:13px;font-weight:700;color:var(--ink);margin-top:8px;">Skipped Duplicates:</div>
      <div class="import-summary-box">
        ${skippedList.map(name => `<div style="color:#b45309;">⚠️ ${escapeHtml(name)}</div>`).join('')}
      </div>
    ` : ''}
  `;

  modalActions.innerHTML = `
    <button class="primary" id="finishImportBtn" style="width:100%;">Done</button>
  `;

  backdrop.querySelector("#finishImportBtn").onclick = () => {
    backdrop.remove();
    state.screen = "list";
    render();
  };
}

boot();


