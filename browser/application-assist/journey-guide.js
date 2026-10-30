"use strict";
/** Extension-first journey guide. Pure navigation; it never triggers employer writes. */
(function (root) {
  const KEY = "escapeHatch.extensionGuidedMode.v1";
  const STEPS = Object.freeze([
    { id: "profile", title: "Prepare your identity", detail: "Review your local contact details. Your employer-specific skills and dates belong in your private career workspace.", target: "profilePanel", action: "Open profile editor" },
    { id: "workspace", title: "Connect the right workspace", detail: "Review the exact locally approved fields and answers. A different owner or Chrome profile must remain blocked.", target: "workspaceStatus", action: "Review workspace connection" },
    { id: "opportunity", title: "Open an employer application", detail: "Use the website's Applications and Browser Assist pages to choose a job and open its application. Return to this extension on that employer tab.", target: "jobBoardState", action: "Inspect employer page status" },
    { id: "session", title: "Start an observed session", detail: "Start Assist for this specific origin and review its status. Sign in to the employer directly; never give your password or verification code to EscapeHatch.", target: "startAssist", action: "Find Start Assist" },
    { id: "fill", title: "Fit the final puzzle pieces", detail: "Only after the profile, exact job, policy and session are verified, choose Fill Allowed Fields yourself. Inspect and verify the result on the employer page.", target: "fillAllowed", action: "Find Fill Allowed Fields" },
    { id: "review", title: "Review and submit yourself", detail: "Review unanswered fields and documents in the employer window. You alone choose final Submit. A click is not proof until the employer confirms acceptance.", target: "submissionState", action: "Find submission evidence" }
  ]);
  function clampStep(value) { return Number.isInteger(value) ? Math.max(0, Math.min(STEPS.length - 1, value)) : 0; }
  function guideStep(index) { return STEPS[clampStep(index)]; }
  function nextStep(index, delta) { return clampStep(clampStep(index) + delta); }
  function resolveTarget(step, mode) {
    if (!step || !STEPS.some(item => item.id === step.id)) return null;
    if (mode === "phone" && (step.id === "session" || step.id === "fill")) return "phoneSheet";
    return step.target;
  }
  // Readiness is never inferred from tour navigation, a saved profile, or a button click.
  function guideProgress(index) { return { displayedStep: clampStep(index) + 1, totalSteps: STEPS.length, capabilityUnlocked: false, employerSubmissionConfirmed: false }; }

  const api = { KEY, STEPS, clampStep, guideStep, nextStep, resolveTarget, guideProgress };
  root.EscapeHatchJourneyGuide = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (!root.document || !root.chrome?.storage?.local) return;
  const doc = root.document;
  const toggle = doc.getElementById("guideToggle");
  const mode = doc.getElementById("guidedMode");
  const panel = doc.getElementById("extensionJourneyGuide");
  const heading = doc.getElementById("guideSceneTitle");
  const description = doc.getElementById("guideSceneDetail");
  const count = doc.getElementById("guideScenePosition");
  const guideList = doc.getElementById("guideScenes");
  const prev = doc.getElementById("guidePrevious");
  const next = doc.getElementById("guideNext");
  const find = doc.getElementById("guideFind");
  const guideStatus = doc.getElementById("guideStatus");
  if (![toggle, mode, panel, heading, description, count, guideList, prev, next, find, guideStatus].every(Boolean)) return;

  let index = 0;
  let guided = true;
  let saving = false;
  // Gate the first preference write on an actual saved-state readback.
  toggle.disabled = true;
  mode.disabled = true;
  function render() {
    panel.hidden = !guided;
    toggle.textContent = guided ? "Hide guide" : "Show guide";
    toggle.setAttribute("aria-expanded", String(guided));
    mode.checked = guided;
    const item = guideStep(index);
    heading.textContent = item.title;
    description.textContent = item.detail;
    count.textContent = "Puzzle piece " + (index + 1) + " of " + STEPS.length + " · instructional, not job completion";
    prev.disabled = index === 0;
    next.disabled = index === STEPS.length - 1;
    find.textContent = item.action;
    guideList.replaceChildren();
    for (let i = 0; i < STEPS.length; i++) {
      const li = doc.createElement("li");
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = String(i + 1) + ". " + STEPS[i].title;
      button.className = "guide-scene" + (i === index ? " active" : "");
      button.setAttribute("aria-current", i === index ? "step" : "false");
      button.addEventListener("click", () => { index = i; render(); });
      li.appendChild(button);
      guideList.appendChild(li);
    }
  }
  async function saveMode(enabled) {
    if (saving) return;
    saving = true;
    mode.disabled = true;
    const previous = guided;
    try {
      await root.chrome.storage.local.set({ [KEY]: enabled });
      const current = await root.chrome.storage.local.get(KEY);
      if (current[KEY] !== enabled) throw new Error("Guided setting readback disagreed.");
      guided = enabled;
      guideStatus.textContent = enabled ? "Guided mode is on for this Chrome profile." : "Quiet mode saved. Show guide to return at any time.";
    } catch {
      guided = previous;
      guideStatus.textContent = "The new guided setting could not be verified. Previous mode preserved.";
    } finally {
      saving = false;
      mode.disabled = false;
      render();
    }
  }
  toggle.addEventListener("click", () => { void saveMode(!guided); });
  mode.addEventListener("change", () => { void saveMode(mode.checked); });
  prev.addEventListener("click", () => { index = nextStep(index, -1); render(); });
  next.addEventListener("click", () => { index = nextStep(index, 1); render(); });
  find.addEventListener("click", () => {
    const current = guideStep(index);
    if (current.id === "profile") {
      try { root.EscapeHatchAssistModality?.invokeSemantic("open_profile_panel", "guide"); } catch { /* fallback below */ }
    }
    const modeName = doc.documentElement.getAttribute("data-modality");
    const id = resolveTarget(current, modeName);
    const destination = id ? doc.getElementById(id) : null;
    if (!destination) { guideStatus.textContent = "Open the linked EscapeHatch cockpit page or employer tab to continue."; return; }
    destination.scrollIntoView?.({ block: "center", behavior: root.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    (destination.querySelector?.("button:not([disabled]), input:not([disabled]), select:not([disabled])") ||
      (destination.matches?.("button:not([disabled]), input:not([disabled]), select:not([disabled])") ? destination : null))?.focus?.();
    guideStatus.textContent = "Target located. Choose the actual action yourself; no employer action was triggered.";
  });

  // A fresh install is guide-on; previous user choice survives extension upgrades.
  root.chrome.storage.local.get(KEY).then(saved => {
    if (typeof saved[KEY] === "boolean") guided = saved[KEY];
    toggle.disabled = false;
    mode.disabled = false;
    render();
    guideStatus.textContent = guided
      ? "Guided mode is on. Use the six pieces, or work directly from any control."
      : "Quiet mode restored. Show guide any time.";
  }, () => {
    toggle.disabled = false;
    mode.disabled = false;
    guideStatus.textContent = "Guided preference unavailable; default guide remains visible.";
    render();
  });
  render();
})(typeof globalThis !== "undefined" ? globalThis : this);
