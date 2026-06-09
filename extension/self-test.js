const runButton = document.querySelector("#run");
const results = document.querySelector("#results");

runButton.addEventListener("click", () => {
  void runTests();
});

void runTests();

async function runTests() {
  results.textContent = "";
  runButton.disabled = true;

  await check("Background responds", async () => {
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return typeof state.active === "boolean";
  });

  await check("Invalid timer is rejected", async () => {
    const response = await chrome.runtime.sendMessage({ type: "START_LOCK", minutes: 0 });
    return response.ok === false;
  });

  await check("Block rules are Chrome-supported", async () => {
    const response = await chrome.runtime.sendMessage({ type: "VALIDATE_RULES" });
    return response.ok === true;
  });

  await check("One-minute lock starts", async () => {
    const response = await chrome.runtime.sendMessage({ type: "START_LOCK", minutes: 1 });
    return response.ok === true && response.state.active === true;
  });

  await check("Stored lock is readable", async () => {
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    return state.active === true && state.remainingMs > 0;
  });

  runButton.disabled = false;
}

async function check(label, fn) {
  const item = document.createElement("li");
  const name = document.createElement("span");
  const status = document.createElement("span");
  name.textContent = label;
  status.textContent = "Running";
  item.append(name, status);
  results.append(item);

  try {
    const passed = await fn();
    status.textContent = passed ? "Pass" : "Fail";
    status.className = passed ? "pass" : "fail";
  } catch (error) {
    status.textContent = "Fail";
    status.className = "fail";
    item.title = error?.message || String(error);
  }
}
