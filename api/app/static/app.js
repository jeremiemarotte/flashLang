const TOKEN_KEY = "flashlang_pwa_token";
const CACHE_KEY = "flashlang_due_cache";
const QUEUE_KEY = "flashlang_review_queue";

const THEMES = {
  es: { flag: "🇪🇸", label: "Español", langChip: "ES → FR" },
  en: { flag: "🇬🇧", label: "English", langChip: "EN → FR" },
  culture: { flag: "🎭", label: "Culture", langChip: "Culture" },
};

const app = document.getElementById("app");

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  dueCards: [],
  offline: false,
  session: { index: 0, revealed: false, reviewed: 0, goodOrEasy: 0 },
};

function readQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
}

function writeQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok && res.status !== 204) throw new Error(`request failed: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function flushQueue() {
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining = [];
  for (const item of queue) {
    try {
      await apiFetch("/reviews", { method: "POST", body: JSON.stringify(item) });
    } catch (e) {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

async function loadDueCards() {
  try {
    const cards = await apiFetch("/cards/due?limit=100");
    state.dueCards = cards;
    state.offline = false;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cards));
  } catch (e) {
    state.offline = true;
    state.dueCards = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  }
}

function countsByBucket(cards) {
  // Culture cards are counted in one combined bucket regardless of language — the actual
  // language is still shown per-card during review, this is just the home-screen tally.
  return cards.reduce((acc, c) => {
    const bucket = c.domain === "culture" ? "culture" : c.language;
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
}

function themeFor(card) {
  return card.domain === "culture" ? "culture" : card.language;
}

function formatInterval(days) {
  if (days < 1) {
    const minutes = Math.round(days * 24 * 60);
    return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
  }
  return `${Math.round(days)} j`;
}

function relativeTime(isoDate) {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "il y a 1j";
  return `il y a ${days}j`;
}

function renderClozeText(text, revealed) {
  return text.replace(/\{\{c\d+::(.*?)\}\}/g, (_, word) =>
    revealed ? `<span class="cloze-blank">${escapeHtml(word)}</span>` : `<span class="cloze-blank">____</span>`
  );
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderGate() {
  app.innerHTML = `
    <div class="screen token-gate">
      <h1>flashLang</h1>
      <p class="muted">Entre le token d'accès pour cet appareil.</p>
      <input id="token-input" type="password" placeholder="Token" autocapitalize="off" autocorrect="off" />
      <button class="btn-primary" id="save-token">Continuer</button>
    </div>
  `;
  document.getElementById("save-token").onclick = () => {
    const value = document.getElementById("token-input").value.trim();
    if (!value) return;
    state.token = value;
    localStorage.setItem(TOKEN_KEY, value);
    renderHome();
  };
}

async function renderHome() {
  app.removeAttribute("data-theme");
  app.innerHTML = `<div class="screen"><p class="muted">Chargement…</p></div>`;
  await flushQueue();
  await loadDueCards();

  const counts = countsByBucket(state.dueCards);
  const total = state.dueCards.length;

  app.innerHTML = `
    <div class="screen">
      ${state.offline ? `<div class="offline-banner">Hors ligne — dernières cartes chargées</div>` : ""}
      <h1>flashLang</h1>
      <div class="due-counts">
        <div class="due-count en"><div class="n">${counts.en || 0}</div><div class="muted">EN</div></div>
        <div class="due-count es"><div class="n">${counts.es || 0}</div><div class="muted">ES</div></div>
        <div class="due-count culture"><div class="n">${counts.culture || 0}</div><div class="muted">Culture</div></div>
      </div>
      <button class="btn-primary" id="start-review" ${total === 0 ? "disabled" : ""}>
        ${total === 0 ? "Rien à réviser" : `Réviser (${total})`}
      </button>
    </div>
  `;
  const startBtn = document.getElementById("start-review");
  if (startBtn && total > 0) startBtn.onclick = startReview;
}

function startReview() {
  state.session = { index: 0, revealed: false, reviewed: 0, goodOrEasy: 0 };
  renderReview();
}

function currentCard() {
  return state.dueCards[state.session.index];
}

function renderReview() {
  const card = currentCard();
  if (!card) return renderSummary();

  const { revealed } = state.session;
  const theme = THEMES[themeFor(card)] || THEMES.culture;
  app.dataset.theme = themeFor(card);

  let front, back;
  if (card.type === "cloze") {
    front = renderClozeText(card.text, false);
    back = renderClozeText(card.text, true);
  } else {
    front = escapeHtml(card.front);
    back = escapeHtml(card.back);
  }

  const typeChip = card.tags && card.tags.length ? escapeHtml(card.tags[0]) : card.type === "cloze" ? "Structure" : "Vocabulaire";
  const total = state.dueCards.length;
  const progressPct = Math.round(((state.session.index + (revealed ? 0.5 : 0)) / total) * 100);

  app.innerHTML = `
    <div class="screen">
      <div class="review-header">
        <div class="theme-dot"></div>
        <div class="theme-label">${theme.flag} ${theme.label}</div>
        <div class="review-progress-bar"><div class="review-progress-fill" style="width:${progressPct}%"></div></div>
        <div class="review-progress-count">${state.session.index + 1} / ${total}</div>
      </div>
      <div class="card-wrap">
        <div class="card-stripe"></div>
        <div class="card" id="card-face">
          <div class="card-meta">
            <span class="chip chip-type">${typeChip}</span>
            <span class="chip">${theme.langChip}</span>
            <span class="chip chip-source">${relativeTime(card.created_at)}</span>
          </div>
          <div>${revealed ? back : front}</div>
          ${!revealed ? `<div class="tap-hint">↓ Appuyer pour révéler</div>` : ""}
          ${
            revealed && card.context
              ? `<hr class="card-divider"><span class="context-label">Contexte</span><div class="context">${escapeHtml(card.context)}</div>`
              : ""
          }
        </div>
      </div>
      ${
        revealed
          ? `<div class="ratings">
              <button class="rating-again" data-rating="1">Again<span class="interval"></span></button>
              <button class="rating-hard" data-rating="2">Hard<span class="interval"></span></button>
              <button class="rating-good" data-rating="3">Good<span class="interval"></span></button>
              <button class="rating-easy" data-rating="4">Easy<span class="interval"></span></button>
            </div>`
          : `<button class="btn-primary" id="reveal">Révéler</button>`
      }
    </div>
  `;

  if (!revealed) {
    document.getElementById("reveal").onclick = () => {
      state.session.revealed = true;
      renderReview();
    };
  } else {
    document.querySelectorAll(".ratings button").forEach((btn) => {
      btn.onclick = () => submitRating(Number(btn.dataset.rating));
    });
    loadIntervalPreview(card.id);
  }
}

async function loadIntervalPreview(cardId) {
  // Best-effort: if offline or the request fails, the buttons just show no interval hint —
  // rating still works either way, this is purely informational.
  try {
    const intervals = await apiFetch(`/cards/${cardId}/preview`);
    const labels = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
    document.querySelectorAll(".ratings button").forEach((btn) => {
      const key = labels[btn.dataset.rating];
      const el = btn.querySelector(".interval");
      if (el && intervals[key] !== undefined) el.textContent = formatInterval(intervals[key]);
    });
  } catch (e) {
    // offline or request failed — leave interval spans empty
  }
}

async function submitRating(rating) {
  const card = currentCard();
  state.session.reviewed += 1;
  if (rating >= 3) state.session.goodOrEasy += 1;

  const payload = { card_id: card.id, rating };
  try {
    await apiFetch("/reviews", { method: "POST", body: JSON.stringify(payload) });
  } catch (e) {
    const queue = readQueue();
    queue.push(payload);
    writeQueue(queue);
  }

  state.session.index += 1;
  state.session.revealed = false;
  renderReview();
}

function renderSummary() {
  const { reviewed, goodOrEasy } = state.session;
  const retention = reviewed ? Math.round((goodOrEasy / reviewed) * 100) : 0;
  app.innerHTML = `
    <div class="screen">
      <h1>Session terminée</h1>
      <p class="muted">${reviewed} carte${reviewed > 1 ? "s" : ""} révisée${reviewed > 1 ? "s" : ""} · ${retention}% de rétention</p>
      <button class="btn-primary" id="back-home">Retour à l'accueil</button>
    </div>
  `;
  document.getElementById("back-home").onclick = renderHome;
}

async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  // Server-injected token (see /config.js, baked in from PWA_TOKEN at container start) skips
  // the manual entry screen — Tailscale is already the trust boundary for this mono-user app.
  if (window.PWA_TOKEN) state.token = window.PWA_TOKEN;
  if (!state.token) return renderGate();
  renderHome();
}

boot();
