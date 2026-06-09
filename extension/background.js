const HOST_NAME = "com.focus_lock.host";
const ALARM_NAME = "focus-lock-release";
const STORAGE_KEY = "focusLockState";
const CUSTOM_SITES_KEY = "focusLockCustomSites";

const RESOURCE_TYPES = ["main_frame", "sub_frame", "xmlhttprequest", "script", "image", "media", "other"];
const BUILT_IN_SITES = [
  { id: 1001, domain: "instagram.com", label: "Instagram" },
  { id: 1002, domain: "x.com", label: "X" },
  { id: 1003, domain: "twitter.com", label: "Twitter" }
];
const BUILT_IN_RULE_IDS = BUILT_IN_SITES.map((site) => site.id);
const CUSTOM_RULE_START = 2000;
const MAX_CUSTOM_SITES = 25;
const ALL_RULE_IDS = [
  ...BUILT_IN_RULE_IDS,
  ...Array.from({ length: MAX_CUSTOM_SITES }, (_value, index) => CUSTOM_RULE_START + index)
];

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  if (isActive(state)) {
    await enableRules();
    await scheduleRelease(state.lockUntil);
  } else {
    await clearLock();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await getState();
  if (isActive(state)) {
    await enableRules();
    await scheduleRelease(state.lockUntil);
  } else {
    await clearLock();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void releaseLock();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STATE") {
    getState().then((state) => sendResponse(toClientState(state)));
    return true;
  }

  if (message?.type === "START_LOCK") {
    startLock(message.minutes).then(sendResponse);
    return true;
  }

  if (message?.type === "GET_SITES") {
    getSites().then(sendResponse);
    return true;
  }

  if (message?.type === "ADD_SITE") {
    addCustomSite(message.site).then(sendResponse);
    return true;
  }

  if (message?.type === "REMOVE_SITE") {
    removeCustomSite(message.domain).then(sendResponse);
    return true;
  }

  if (message?.type === "VALIDATE_RULES") {
    validateRules().then(sendResponse);
    return true;
  }

  return false;
});

async function startLock(minutes) {
  const parsedMinutes = Number(minutes);
  if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
    return { ok: false, error: "Enter a positive number of minutes." };
  }

  const maxMinutes = 24 * 60;
  const safeMinutes = Math.min(Math.ceil(parsedMinutes), maxMinutes);
  const lockUntil = Date.now() + safeMinutes * 60 * 1000;
  const state = { active: true, lockUntil, startedAt: Date.now(), minutes: safeMinutes };

  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  await enableRules();
  await scheduleRelease(lockUntil);

  const focus = await sendNativeMessage({ action: "start", minutes: safeMinutes, lockUntil });
  const updatedState = {
    ...state,
    focusOk: Boolean(focus.ok),
    focusError: focus.ok ? "" : focus.error || "Apple Focus did not start."
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: updatedState });

  return { ok: true, state: toClientState(updatedState) };
}

async function releaseLock() {
  await clearLock();
  await sendNativeMessage({ action: "stop" });
}

async function clearLock() {
  await chrome.storage.local.set({ [STORAGE_KEY]: { active: false, lockUntil: 0 } });
  await chrome.alarms.clear(ALARM_NAME);
  await disableRules();
}

async function getState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { active: false, lockUntil: 0 };
}

function isActive(state) {
  return Boolean(state?.active && state.lockUntil && state.lockUntil > Date.now());
}

function toClientState(state) {
  if (!isActive(state)) {
    return { active: false, lockUntil: 0, remainingMs: 0 };
  }

  return {
    active: true,
    lockUntil: state.lockUntil,
    remainingMs: Math.max(0, state.lockUntil - Date.now()),
    focusOk: state.focusOk !== false,
    focusError: state.focusError || ""
  };
}

async function enableRules() {
  const rules = await buildBlockRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ALL_RULE_IDS,
    addRules: rules
  });
}

async function disableRules() {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ALL_RULE_IDS
  });
}

async function validateRules() {
  const checks = [];
  const rules = await buildBlockRules();

  for (const rule of rules) {
    const regex = rule.condition.regexFilter;
    const result = await chrome.declarativeNetRequest.isRegexSupported({ regex });
    checks.push({
      id: rule.id,
      regex,
      supported: result.isSupported,
      reason: result.reason || ""
    });
  }

  return {
    ok: checks.every((check) => check.supported),
    checks
  };
}

async function getSites() {
  const customSites = await getCustomSites();
  return {
    builtIn: BUILT_IN_SITES.map(({ domain, label }) => ({ domain, label, builtIn: true })),
    custom: customSites.map((domain) => ({ domain, label: domain, builtIn: false })),
    maxCustomSites: MAX_CUSTOM_SITES
  };
}

async function addCustomSite(input) {
  const state = await getState();
  if (isActive(state)) {
    return { ok: false, error: "The list is locked until the timer ends." };
  }

  const normalized = normalizeDomain(input);
  if (!normalized) {
    return { ok: false, error: "Enter a valid domain, like youtube.com." };
  }

  if (BUILT_IN_SITES.some((site) => site.domain === normalized)) {
    return { ok: true, sites: await getSites() };
  }

  const customSites = await getCustomSites();
  if (customSites.includes(normalized)) {
    return { ok: true, sites: await getSites() };
  }

  if (customSites.length >= MAX_CUSTOM_SITES) {
    return { ok: false, error: `You can add up to ${MAX_CUSTOM_SITES} custom sites.` };
  }

  const nextSites = [...customSites, normalized].sort();
  await chrome.storage.local.set({ [CUSTOM_SITES_KEY]: nextSites });
  return { ok: true, sites: await getSites() };
}

async function removeCustomSite(domain) {
  const state = await getState();
  if (isActive(state)) {
    return { ok: false, error: "The list is locked until the timer ends." };
  }

  const normalized = normalizeDomain(domain);
  const customSites = await getCustomSites();
  const nextSites = customSites.filter((site) => site !== normalized);
  await chrome.storage.local.set({ [CUSTOM_SITES_KEY]: nextSites });
  return { ok: true, sites: await getSites() };
}

async function getCustomSites() {
  const result = await chrome.storage.local.get(CUSTOM_SITES_KEY);
  const sites = Array.isArray(result[CUSTOM_SITES_KEY]) ? result[CUSTOM_SITES_KEY] : [];
  return sites.map(normalizeDomain).filter(Boolean).slice(0, MAX_CUSTOM_SITES);
}

async function buildBlockRules() {
  const customSites = await getCustomSites();
  const builtInRules = BUILT_IN_SITES.map((site) => siteToRule(site.id, site.domain));
  const customRules = customSites.map((domain, index) => siteToRule(CUSTOM_RULE_START + index, domain));
  return [...builtInRules, ...customRules];
}

function siteToRule(id, domain) {
  return {
    id,
    priority: 1,
    action: { type: "block" },
    condition: {
      regexFilter: domainToRegex(domain),
      resourceTypes: RESOURCE_TYPES
    }
  };
}

function domainToRegex(domain) {
  return `^https?://([^/]+\\.)?${escapeRegex(domain)}/`;
}

function normalizeDomain(input) {
  if (typeof input !== "string") {
    return "";
  }

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  let hostname = trimmed;
  try {
    hostname = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch (_error) {
    return "";
  }

  const normalized = hostname.replace(/^www\./, "");
  const validDomain = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(normalized);
  return validDomain ? normalized : "";
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function scheduleRelease(lockUntil) {
  await chrome.alarms.clear(ALARM_NAME);
  await chrome.alarms.create(ALARM_NAME, { when: lockUntil });
}

async function sendNativeMessage(payload) {
  try {
    const response = await chrome.runtime.sendNativeMessage(HOST_NAME, payload);
    return response || { ok: true };
  } catch (error) {
    console.warn("Focus Lock native host unavailable:", error);
    return { ok: false, error: error?.message || "Focus Lock native host unavailable." };
  }
}
