import { $, storageGet, toast, showBanner, hideBanner, setLoading, openModal, escapeHtml, fetchAvatars, getCachedAvatar, setAvatar, getCsrfToken } from './utils.js';

let friends = [];
let selected = new Set();
let account = null;

async function loadFriends() {
  hideBanner("#friends-banner");
  const { account: acc } = await storageGet("account");
  account = acc;
  if (!account) return showBanner("#friends-banner", "Conecte uma conta primeiro na aba Cookies.");

  const btn = $("#btn-load-friends");
  setLoading(btn, true, true);
  $("#friends-list").innerHTML = `<div class="totp-empty"><span class="spinner"></span> Carregando…</div>`;

  try {
    // 0. Confere quem está logado de verdade no navegador (a lista e o unfriend usam o cookie)
    const auth = await fetch("https://users.roblox.com/v1/users/authenticated", { credentials: "include", cache: "no-store" });
    if (!auth.ok) {
      showBanner("#friends-banner", "Sessão expirada. Vá em Cookies e reconecte.");
      $("#friends-list").innerHTML = ""; return;
    }
    const me = await auth.json();
    if (me.id !== account.id) {
      account = { id: me.id, name: me.name };
      await chrome.storage.local.set({ account });
    }

    // 1. Pega IDs
    const res = await fetch(`https://friends.roblox.com/v1/users/${account.id}/friends`, { credentials: "include", cache: "no-store" });
    if (res.status === 401) {
      showBanner("#friends-banner", "Sessão expirada. Vá em Cookies e reconecte.");
      $("#friends-list").innerHTML = ""; return;
    }
    const data = await res.json();
    const rawFriends = data.data || data.friends || [];
    
    if (rawFriends.length === 0) {
      friends = []; renderFriends(); return;
    }

    const ids = rawFriends.map(f => f.id);

    // 2. Pega Nomes (API nova)
    const userRes = await fetch("https://users.roblox.com/v1/users", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: ids, excludeBannedUsers: true })
    });
    
    let userData = [];
    if (userRes.ok) { const uJson = await userRes.json(); userData = uJson.data || []; }

    // 3. Junta
    friends = rawFriends.map(f => {
      const u = userData.find(x => x.id === f.id);
      return {
        id: f.id,
        name: u ? u.name : `User_${f.id}`,
        displayName: u ? (u.displayName || u.name) : `User_${f.id}`
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    selected.clear(); renderFriends();
  } catch (err) {
    showBanner("#friends-banner", "Erro ao carregar amizades.");
    $("#friends-list").innerHTML = "";
  } finally { setLoading(btn, false, true); }
}

function renderFriends() {
  const list = $("#friends-list");
  list.innerHTML = "";
  $("#friends-count").textContent = friends.length;
  $("#friends-selected-count").textContent = selected.size + " sel.";
  
  if (friends.length === 0) {
    list.innerHTML = `<div class="totp-empty">Nenhuma amizade carregada.</div>`; return;
  }
  
  friends.forEach((f, idx) => {
    const el = document.createElement("div");
    el.className = "friend-item" + (selected.has(f.id) ? " selected" : "");
    el.dataset.id = f.id;
    el.innerHTML = `
      <input type="checkbox" class="friend-check" ${selected.has(f.id) ? "checked" : ""} />
      <img class="friend-avatar" alt="" />
      <div class="friend-meta">
        <div class="friend-name">${escapeHtml(f.displayName)}</div>
        <div class="friend-handle">@${escapeHtml(f.name)}</div>
      </div>`;
    
    el.style.setProperty("--i", Math.min(idx, 14));
    setAvatar(el.querySelector("img"), getCachedAvatar(f.id), f.name);
    if (!getCachedAvatar(f.id)) el.querySelector("img").classList.add("is-loading");

    el.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (selected.has(f.id)) selected.delete(f.id); else selected.add(f.id);
      el.classList.toggle("selected");
      el.querySelector("input").checked = selected.has(f.id);
      $("#friends-selected-count").textContent = selected.size + " sel.";
    });
    el.querySelector("input").addEventListener("change", (e) => {
      if (e.target.checked) selected.add(f.id); else selected.delete(f.id);
      el.classList.toggle("selected");
      $("#friends-selected-count").textContent = selected.size + " sel.";
    });
    list.appendChild(el);
  });
  loadFriendAvatars();
}

let avatarRun = 0;
async function loadFriendAvatars() {
  const run = ++avatarRun;
  const missing = friends.filter((f) => !getCachedAvatar(f.id));
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const map = await fetchAvatars(chunk.map((f) => f.id));
    if (run !== avatarRun) return;                       // lista foi re-renderizada
    const items = document.querySelectorAll(".friend-item");
    chunk.forEach((f) => {
      const idx = friends.indexOf(f);
      const img = items[idx]?.querySelector("img");
      setAvatar(img, map.get(Number(f.id)) || null, f.name);
    });
  }
}

// ---------- Menu de progresso ----------
const prog = {
  el: () => $("#progress-overlay"),
  open(total) {
    $("#prog-title").textContent = "Removendo amigos";
    $("#prog-count").textContent = `0/${total}`;
    $("#prog-name").textContent = "Preparando…";
    $("#prog-fill").style.transform = "scaleX(0)";
    $("#prog-ok").textContent = "0"; $("#prog-fail").textContent = "0";
    $("#prog-cancel").textContent = "Cancelar"; $("#prog-cancel").disabled = false;
    $("#prog-cancel").dataset.done = "false";
    prog.el().classList.remove("hidden");
  },
  update(i, total, name, ok, fail) {
    $("#prog-count").textContent = `${i}/${total}`;
    $("#prog-fill").style.transform = `scaleX(${total ? i / total : 0})`;
    if (name) $("#prog-name").textContent = name;
    $("#prog-ok").textContent = ok; $("#prog-fail").textContent = fail;
  },
  finish(title, note) {
    $("#prog-title").textContent = title; $("#prog-name").textContent = note;
    $("#prog-cancel").textContent = "Fechar"; $("#prog-cancel").disabled = false; $("#prog-cancel").dataset.done = "true";
  },
  close() { prog.el().classList.add("hidden"); }
};

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// ID do AMIGO na URL, sem body.
async function unfriendOne(targetId, state) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let r;
    try {
      r = await fetch(`https://friends.roblox.com/v1/users/${targetId}/unfriend`, {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "X-CSRF-TOKEN": state.csrf || "" }
      });
    } catch { await sleepMs(800); continue; }

    if (r.ok) return { ok: true };
    if (r.status === 403) {
      const t = r.headers.get("x-csrf-token");
      if (t && t !== state.csrf) { state.csrf = t; continue; }
      return { ok: false, status: 403 };
    }
    if (r.status === 429) { await sleepMs(2500 * (attempt + 1)); continue; }
    return { ok: false, status: r.status };
  }
  return { ok: false, status: 429 };
}

// Confere NA ROBLOX quais ids continuam sendo amigos (não confia só no "200 OK").
async function stillFriends(myId, ids) {
  const still = new Set();
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const q = chunk.map((id) => "userIds=" + id).join("&");
      const r = await fetch(`https://friends.roblox.com/v1/users/${myId}/friends/statuses?${q}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error("status " + r.status);
      const j = await r.json();
      (j.data || []).forEach((d) => { if (d.status === "Friends") still.add(Number(d.id)); });
    }
    return still;
  } catch {
    // fallback: relê a lista de amigos
    try {
      const r = await fetch(`https://friends.roblox.com/v1/users/${myId}/friends`, { credentials: "include", cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json(); const now = new Set((j.data || []).map((f) => Number(f.id)));
      ids.forEach((id) => { if (now.has(Number(id))) still.add(Number(id)); });
      return still;
    } catch { return null; }
  }
}

let cancelRequested = false;

async function removeFriends() {
  if (selected.size === 0) return showBanner("#friends-banner", "Selecione ao menos um amigo.");
  const ids = Array.from(selected);
  const total = ids.length;
  if (!await openModal({ title: "Remover Amigos", body: `Tem certeza que deseja remover ${total} amigo${total > 1 ? "s" : ""}?`, confirmText: `Remover (${total})` })) return;

  hideBanner("#friends-banner");
  cancelRequested = false;
  prog.open(total);

  // Garante que o cookie do navegador é da conta cuja lista está na tela
  let me;
  try {
    const a = await fetch("https://users.roblox.com/v1/users/authenticated", { credentials: "include", cache: "no-store" });
    if (!a.ok) throw new Error();
    me = await a.json();
  } catch {
    prog.close(); return showBanner("#friends-banner", "Sessão expirada. Vá em Cookies e reconecte.");
  }
  if (account && me.id !== account.id) {
    prog.close();
    return showBanner("#friends-banner", `O navegador está logado como ${me.name}, mas a lista é de outra conta. Clique em "Carregar Amizades" de novo.`);
  }

  const state = { csrf: await getCsrfToken() };
  const byId = new Map(friends.map((f) => [f.id, f]));
  const accepted = [], failed = []; const codes = new Set();
  let done = 0;

  for (let i = 0; i < ids.length; i++) {
    if (cancelRequested) break;
    const id = ids[i], f = byId.get(id);
    prog.update(i + 1, total, `@${f ? f.name : id}`, accepted.length, failed.length);
    const res = await unfriendOne(id, state);
    done = i + 1;
    if (res.ok) accepted.push(id); else { failed.push(id); codes.add(res.status); if (res.status === 401) break; }
    prog.update(done, total, null, accepted.length, failed.length);
    await sleepMs(400);
  }

  // Verificação real
  let removed = [];
  let unverified = false;
  if (accepted.length) {
    $("#prog-title").textContent = "Verificando…"; $("#prog-name").textContent = "Confirmando na Roblox";
    $("#prog-cancel").disabled = true;
    await sleepMs(1200);
    let still = await stillFriends(me.id, accepted);
    if (still && still.size) {                       // uma segunda chance só pros que "voltaram"
      const retry = accepted.filter((id) => still.has(id));
      for (const id of retry) { await unfriendOne(id, state); await sleepMs(400); }
      await sleepMs(1200);
      still = await stillFriends(me.id, accepted);
    }
    if (still === null) { unverified = true; removed = accepted; }
    else { removed = accepted.filter((id) => !still.has(id)); accepted.filter((id) => still.has(id)).forEach((id) => failed.push(id)); }
  }

  // Atualiza lista/seleção só com quem saiu de verdade
  const gone = new Set(removed);
  friends = friends.filter((f) => !gone.has(f.id));
  removed.forEach((id) => selected.delete(id));
  renderFriends();

  const cancelled = cancelRequested && done < total;
  const title = cancelled ? "Cancelado" : failed.length ? "Concluído com falhas" : "Concluído";
  let note = `${removed.length} removido(s)` + (failed.length ? `, ${failed.length} falharam` : "");
  if (unverified) note += " (não foi possível confirmar na Roblox)";
  prog.update(done, total, null, removed.length, failed.length);
  prog.finish(title, note);

  if (failed.length) {
    const c = [...codes].filter(Boolean).join(", ");
    showBanner("#friends-banner", `${failed.length} amigo(s) não foram removidos` + (c ? ` (HTTP ${c})` : " (a Roblox aceitou, mas continuam na lista)") + ". Eles continuam selecionados para tentar de novo.");
  }
}

function selectAll() {
  const all = friends.map((f) => f.id);
  if (selected.size === all.length && all.length > 0) selected.clear();
  else all.forEach((id) => selected.add(id));
  renderFriends();
}

export function initFriendsTab() {
  $("#btn-load-friends").addEventListener("click", loadFriends);
  $("#btn-select-all").addEventListener("click", selectAll);
  $("#btn-remove-friends").addEventListener("click", removeFriends);
  $("#prog-cancel").addEventListener("click", (e) => {
    if (e.currentTarget.dataset.done === "true") return prog.close();
    cancelRequested = true; e.currentTarget.disabled = true; e.currentTarget.textContent = "Cancelando…";
  });
}