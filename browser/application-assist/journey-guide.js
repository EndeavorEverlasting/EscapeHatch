"use strict";
/** Optional companion journey guide. Pure navigation; it never triggers employer writes. */
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
  let preferenceKnown = false;
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
    for (let i = 0; i < sceneButtons.length; i++) {
      sceneButtons[i].classList.toggle("active", i === index);
      sceneButtons[i].setAttribute("aria-pressed", String(i === index));
    }
    toggle.disabled = saving || !preferenceKnown;
    mode.disabled = saving || !preferenceKnown;
  }
  // Keep the same buttons alive across updates so keyboard focus survives selection.
  const sceneButtons = STEPS.map((step, i) => {
    const li = doc.createElement("li");
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = String(i + 1) + ". " + step.title;
    button.className = "guide-scene";
    button.setAttribute("aria-controls", "guideSceneInspection");
    button.addEventListener("click", () => { index = i; render(); });
    li.appendChild(button);
    guideList.appendChild(li);
    return button;
  });
  async function saveMode(enabled) {
    if (saving || !preferenceKnown) return;
    saving = true;
    toggle.disabled = true;
    mode.disabled = true;
    let writeCompleted = false;
    const previous = guided;
    try {
      await root.chrome.storage.local.set({ [KEY]: enabled });
      writeCompleted = true;
      const current = await root.chrome.storage.local.get(KEY);
      if (current[KEY] !== enabled) throw new Error("Guided setting readback disagreed.");
      guided = enabled;
      guideStatus.textContent = enabled ? "Guided mode is on for this Chrome profile." : "Quiet mode saved. Show guide to return at any time.";
    } catch {
      guided = previous;
      preferenceKnown = false;
      guideStatus.textContent = writeCompleted
        ? "The setting write completed, but its saved value could not be verified. This view remains unchanged; reopen the popup to check the saved setting."
        : "The guided setting could not be saved or verified. This view remains unchanged; reopen the popup before changing the saved setting.";
    } finally {
      saving = false;
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
    if (id === "phoneSheet" && doc.documentElement.classList.contains("profile-open")) {
      try { root.EscapeHatchAssistModality?.invokeSemantic("dismiss_overlay", "guide"); } catch { /* report visibility below */ }
    }
    const destination = id ? doc.getElementById(id) : null;
    const visible = element => !!element && !element.closest("[hidden], [inert], [aria-hidden='true']") && element.getClientRects().length > 0;
    if (!visible(destination) || destination.matches(":disabled")) {
      guideStatus.textContent = "The related control is hidden or unavailable. Return to session commands or open the linked cockpit page to continue.";
      return;
    }
    destination.scrollIntoView?.({ block: "center", behavior: root.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const selector = "button:not([disabled]), input:not([disabled]), select:not([disabled])";
    const sheetAction = id === "phoneSheet" ? destination.querySelector('[data-action="' + (current.id === "fill" ? "fill_allowed" : "start_assist") + '"]:not([disabled])') : null;
    const control = sheetAction || (destination.matches(selector) ? destination : Array.from(destination.querySelectorAll(selector)).find(visible));
    const focusTarget = visible(control) ? control : destination;
    if (focusTarget === destination && !destination.matches(selector) && !destination.hasAttribute("tabindex")) {
      destination.setAttribute("tabindex", "-1");
      destination.addEventListener("blur", () => destination.removeAttribute("tabindex"), { once: true });
    }
    focusTarget.focus?.({ preventScroll: true });
    if (doc.activeElement !== focusTarget) {
      guideStatus.textContent = "The related region is visible, but focus could not be moved. Choose its control directly; no employer action was triggered.";
      return;
    }
    guideStatus.textContent = "Related region focused. Choose the actual action yourself; no employer action was triggered.";
  });

  // A fresh install is guide-on; previous user choice survives extension upgrades.
  root.chrome.storage.local.get(KEY).then(saved => {
    if (!saved || (Object.hasOwn(saved, KEY) && typeof saved[KEY] !== "boolean")) {
      guideStatus.textContent = "The saved guide preference is invalid. This temporary guide stays visible; reopen the popup after recovering the setting.";
      render();
      return;
    }
    if (typeof saved[KEY] === "boolean") guided = saved[KEY];
    preferenceKnown = true;
    render();
    guideStatus.textContent = guided
      ? "Guided mode is on. Use the six pieces, or work directly from any control."
      : "Quiet mode restored. Show guide any time.";
  }, () => {
    preferenceKnown = false;
    guideStatus.textContent = "The saved guide preference could not be read. This temporary guide stays visible; setting changes are disabled until you reopen the popup.";
    render();
  });
  render();
})(typeof globalThis !== "undefined" ? globalThis : this);
