#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(callback) {
      listeners.push(callback);
    },
    async emit(...args) {
      for (const listener of listeners) {
        await listener(...args);
      }
    }
  };
}

function createChromeMock() {
  const storage = {};
  const dynamicRules = new Map();
  const alarms = new Map();
  const nativeMessages = [];

  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onMessage: createEvent(),
      async sendNativeMessage(host, payload) {
        nativeMessages.push({ host, payload });
        return { ok: true };
      }
    },
    alarms: {
      onAlarm: createEvent(),
      async create(name, options) {
        alarms.set(name, options);
      },
      async clear(name) {
        alarms.delete(name);
        return true;
      }
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(values) {
          Object.assign(storage, values);
        }
      }
    },
    declarativeNetRequest: {
      async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
        for (const id of removeRuleIds) {
          dynamicRules.delete(id);
        }
        for (const rule of addRules) {
          dynamicRules.set(rule.id, rule);
        }
      },
      async isRegexSupported({ regex }) {
        return { isSupported: Boolean(regex), reason: "" };
      }
    },
    __test: { storage, dynamicRules, alarms, nativeMessages }
  };

  return chrome;
}

function sendMessage(chrome, message) {
  const [listener] = chrome.runtime.onMessage.listeners;
  assert.equal(typeof listener, "function", "background registered a message listener");

  return new Promise((resolve) => {
    listener(message, {}, resolve);
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function flushAsyncWork() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

async function run() {
  const chrome = createChromeMock();
  const backgroundPath = path.join(__dirname, "../extension/background.js");
  const source = fs.readFileSync(backgroundPath, "utf8");

  const context = vm.createContext({
    chrome,
    console,
    Date,
    Math,
    Number,
    Boolean,
    URL
  });

  vm.runInContext(source, context, { filename: backgroundPath });

  const invalid = await sendMessage(chrome, { type: "START_LOCK", minutes: "0" });
  assert.deepEqual(plain(invalid), { ok: false, error: "Enter a positive number of minutes." });
  assert.equal(chrome.__test.dynamicRules.size, 0, "invalid timers do not add block rules");

  const validation = await sendMessage(chrome, { type: "VALIDATE_RULES" });
  assert.equal(validation.ok, true, "rules validate through Chrome DNR API");
  assert.equal(validation.checks.length, 3, "all rules are validated");

  const added = await sendMessage(chrome, { type: "ADD_SITE", site: "https://www.youtube.com/watch?v=focus" });
  assert.equal(added.ok, true, "custom site can be added");
  assert.deepEqual(plain(added.sites.custom), [{ domain: "youtube.com", label: "youtube.com", builtIn: false }]);

  const sites = await sendMessage(chrome, { type: "GET_SITES" });
  assert.equal(sites.builtIn.length, 3, "built-in sites remain present");
  assert.equal(sites.custom.length, 1, "custom site is stored");

  const validationWithCustom = await sendMessage(chrome, { type: "VALIDATE_RULES" });
  assert.equal(validationWithCustom.ok, true, "custom rule validates through Chrome DNR API");
  assert.equal(validationWithCustom.checks.length, 4, "built-in plus custom rules are validated");

  const started = await sendMessage(chrome, { type: "START_LOCK", minutes: "3" });
  assert.equal(started.ok, true, "valid timer starts");
  assert.equal(started.state.active, true, "started state is active");
  assert.equal(chrome.__test.dynamicRules.size, 4, "all site block rules are installed");
  assert.equal(chrome.__test.alarms.has("focus-lock-release"), true, "release alarm is scheduled");
  assert.equal(chrome.__test.nativeMessages.length, 1, "native focus start message is sent");
  assert.equal(chrome.__test.nativeMessages[0].payload.action, "start");

  const addDuringLock = await sendMessage(chrome, { type: "ADD_SITE", site: "reddit.com" });
  assert.equal(addDuringLock.ok, false, "custom site list cannot change during active lock");

  const state = await sendMessage(chrome, { type: "GET_STATE" });
  assert.equal(state.active, true, "active state can be read");
  assert.ok(state.remainingMs > 0, "remaining time is positive");

  await chrome.alarms.onAlarm.emit({ name: "focus-lock-release" });
  await flushAsyncWork();
  assert.equal(chrome.__test.dynamicRules.size, 0, "block rules are removed on release");
  assert.equal(chrome.__test.alarms.size, 0, "release alarm is cleared");
  assert.equal(chrome.__test.nativeMessages.length, 2, "native focus stop message is sent");
  assert.equal(chrome.__test.nativeMessages[1].payload.action, "stop");

  const released = await sendMessage(chrome, { type: "GET_STATE" });
  assert.deepEqual(plain(released), { active: false, lockUntil: 0, remainingMs: 0 });

  console.log("extension background tests ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
