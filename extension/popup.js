const setupView = document.querySelector("#setup-view");
const lockedView = document.querySelector("#locked-view");
const minutesInput = document.querySelector("#minutes");
const startButton = document.querySelector("#start");
const countdown = document.querySelector("#countdown");
const errorBox = document.querySelector("#error");
const focusNote = document.querySelector("#focus-note");
const siteList = document.querySelector("#site-list");
const siteInput = document.querySelector("#site-input");
const addSiteButton = document.querySelector("#add-site");
const siteError = document.querySelector("#site-error");
const lockedSummary = document.querySelector("#locked-summary");

let state = { active: false, remainingMs: 0 };
let sites = { builtIn: [], custom: [], maxCustomSites: 25 };
let tickId = null;

startButton.addEventListener("click", async () => {
  errorBox.textContent = "";
  startButton.disabled = true;

  const response = await chrome.runtime.sendMessage({
    type: "START_LOCK",
    minutes: minutesInput.value
  });

  startButton.disabled = false;

  if (!response?.ok) {
    errorBox.textContent = response?.error || "Could not start the lock.";
    return;
  }

  state = response.state;
  render();
});

addSiteButton.addEventListener("click", async () => {
  await addSite();
});

siteInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void addSite();
  }
});

void refresh();

async function refresh() {
  const [nextState, nextSites] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_STATE" }),
    chrome.runtime.sendMessage({ type: "GET_SITES" })
  ]);
  state = nextState;
  sites = nextSites;
  render();
}

function render() {
  window.clearInterval(tickId);

  if (state.active && state.lockUntil > Date.now()) {
    setupView.classList.add("hidden");
    lockedView.classList.remove("hidden");
    renderLockedSummary();
    renderFocusNote();
    renderCountdown();
    tickId = window.setInterval(renderCountdown, 1000);
    return;
  }

  lockedView.classList.add("hidden");
  setupView.classList.remove("hidden");
  renderSites();
}

async function addSite() {
  siteError.textContent = "";
  addSiteButton.disabled = true;

  const response = await chrome.runtime.sendMessage({
    type: "ADD_SITE",
    site: siteInput.value
  });

  addSiteButton.disabled = false;

  if (!response?.ok) {
    siteError.textContent = response?.error || "Could not add that website.";
    return;
  }

  sites = response.sites;
  siteInput.value = "";
  renderSites();
}

async function removeSite(domain) {
  siteError.textContent = "";
  const response = await chrome.runtime.sendMessage({
    type: "REMOVE_SITE",
    domain
  });

  if (!response?.ok) {
    siteError.textContent = response?.error || "Could not remove that website.";
    return;
  }

  sites = response.sites;
  renderSites();
}

function renderSites() {
  siteList.textContent = "";

  for (const site of sites.builtIn) {
    siteList.append(siteItem(site, true));
  }

  for (const site of sites.custom) {
    siteList.append(siteItem(site, false));
  }
}

function siteItem(site, builtIn) {
  const item = document.createElement("li");
  const label = document.createElement("span");
  const meta = document.createElement("span");

  label.textContent = site.label || site.domain;

  if (builtIn) {
    meta.textContent = "Default";
    meta.className = "site-pill";
  } else {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-site";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      void removeSite(site.domain);
    });
    meta.append(remove);
  }

  item.append(label, meta);
  return item;
}

function renderLockedSummary() {
  const total = sites.builtIn.length + sites.custom.length;
  lockedSummary.textContent = `${total} website${total === 1 ? "" : "s"} blocked until the timer ends.`;
}

function renderFocusNote() {
  if (state.focusOk === false) {
    focusNote.textContent = `Apple Focus did not start: ${state.focusError}`;
    focusNote.classList.remove("hidden");
    return;
  }

  focusNote.textContent = "";
  focusNote.classList.add("hidden");
}

function renderCountdown() {
  const remaining = Math.max(0, state.lockUntil - Date.now());
  const totalSeconds = Math.ceil(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  countdown.textContent = hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;

  if (remaining <= 0) {
    window.clearInterval(tickId);
    void refresh();
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}
