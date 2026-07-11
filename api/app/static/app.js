const TOKEN_KEY = "flashlang_pwa_token";
const CACHE_KEY = "flashlang_due_cache";
const QUEUE_KEY = "flashlang_review_queue";

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

function countsByLanguage(cards) {
  return cards.reduce((acc, c) => {
    acc[c.language] = (acc[c.language] || 0) + 1;
    return acc;
  }, {});
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
  app.innerHTML = `<div class="screen"><p class="muted">Chargement…</p></div>`;
  await flushQueue();
  await loadDueCards();

  const counts = countsByLanguage(state.dueCards);
  const total = state.dueCards.length;

  app.innerHTML = `
    <div class="screen">
      ${state.offline ? `<div class="offline-banner">Hors ligne — dernières cartes chargées</div>` : ""}
      <h1>flashLang</h1>
      <div class="due-counts">
        <div class="due-count"><div class="n">${counts.en || 0}</div><div class="muted">EN</div></div>
        <div class="due-count"><div class="n">${counts.es || 0}</div><div class="muted">ES</div></div>
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
  let front, back;
  if (card.type === "cloze") {
    front = renderClozeText(card.text, false);
    back = renderClozeText(card.text, true);
  } else {
    front = escapeHtml(card.front);
    back = escapeHtml(card.back);
  }

  app.innerHTML = `
    <div class="screen">
      <div class="progress">${state.session.index + 1} / ${state.dueCards.length} · ${card.language.toUpperCase()}</div>
      <div class="card" id="card-face">
        <div>${revealed ? back : front}</div>
        ${revealed && card.context ? `<div class="context">${escapeHtml(card.context)}</div>` : ""}
      </div>
      ${
        revealed
          ? `<div class="ratings">
              <button class="rating-again" data-rating="1">Again</button>
              <button class="rating-hard" data-rating="2">Hard</button>
              <button class="rating-good" data-rating="3">Good</button>
              <button class="rating-easy" data-rating="4">Easy</button>
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
  if (!state.token) return renderGate();
  renderHome();
}

boot();
