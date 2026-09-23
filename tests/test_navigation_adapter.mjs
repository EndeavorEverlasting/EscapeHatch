import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const progression = require("../browser/application-assist/progression.js");
const navigation = require("../browser/application-assist/navigation-adapter.js");

function fakeControl(label, extra = {}) {
  return {
    innerText: label, textContent: label, value:"", type:"button", disabled:false, hidden:false, clicks:0,
    getAttribute(name) { if (name === "aria-hidden") return this.ariaHidden || null; if (name === "aria-label") return this.ariaLabel || null; return null; },
    click() { this.clicks += 1; },
    ...extra
  };
}
function fakeField(extra = {}) {
  return { required:false, disabled:false, type:"text", name:"field", id:"", value:"ok", checked:false, placeholder:"",
    getAttribute(name){ return name === "aria-label" ? null : null; }, ...extra };
}
function fakeDocument(controls, fields = [], text = "Job application") {
  return {
    title:"Synthetic", location:{href:"https://example.invalid/app/page"},
    body:{innerText:text},
    querySelectorAll(selector) { if (selector.includes("button")) return controls; if (selector === "input, select, textarea") return fields; return []; },
    querySelector() { return null; }
  };
}

const next=fakeControl("Continue");
const doc=fakeDocument([next],[]);
const page=navigation.describeDocument(doc); page.archetype="identity-contact";
const plan=progression.buildProgressionPlan(page,{stable:true});
const live=navigation.buildLiveState(doc,{session:{status:"active"},archetype:"identity-contact",fillStable:true,pageId:"page-1",loopState:progression.createLoopGuard(),transitionObserverReady:true});
let persisted=null;
const executed=await navigation.executeGatedNavigation(plan,live,doc,progression,{beforeDispatch:async state=>{persisted=state;}});
assert.equal(executed.status,"dispatched");
assert.equal(executed.decision,"AUTO_ADVANCE_SAFE");
assert.equal(next.clicks,1,"exactly one gated intermediate action may dispatch");
assert.equal(persisted.loopState.advancesThisSession,1);
assert.ok(persisted.pendingTransition.expectedArchetypes.length>0);

const submit=fakeControl("Submit Application");
const submitDoc=fakeDocument([submit],[]);
const submitPage=navigation.describeDocument(submitDoc); submitPage.archetype="identity-contact";
const submitPlan=progression.buildProgressionPlan(submitPage,{stable:true});
const submitLive=navigation.buildLiveState(submitDoc,{session:{status:"active"},archetype:"identity-contact",fillStable:true,transitionObserverReady:true,loopState:progression.createLoopGuard()});
const submitResult=await navigation.executeGatedNavigation(submitPlan,submitLive,submitDoc,progression,{beforeDispatch:async()=>{}});
assert.equal(submitResult.status,"blocked"); assert.equal(submit.clicks,0);

const hidden=fakeControl("Continue",{hidden:true});
const visibleSubmit=fakeControl("Submit Application");
const hiddenDoc=fakeDocument([hidden,visibleSubmit],[]);
const hiddenPage=navigation.describeDocument(hiddenDoc); hiddenPage.archetype="identity-contact";
const hiddenPlan=progression.buildProgressionPlan(hiddenPage,{stable:true});
assert.equal(hiddenPlan.action,null,"hidden Continue must not become a progression candidate");

const r1=fakeField({required:true,type:"radio",name:"choice",checked:false});
const r2=fakeField({required:true,type:"radio",name:"choice",checked:true});
const radioLive=navigation.buildLiveState(fakeDocument([fakeControl("Continue")],[r1,r2]),{session:{status:"active"},archetype:"intermediate-form",fillStable:true,transitionObserverReady:true,loopState:progression.createLoopGuard()});
assert.deepEqual(radioLive.unresolvedRequiredFields,[],"selected required radio group must be satisfied");

const benignText="Our accessibility policy discusses race, certification training, MFA security, and CAPTCHA support documentation.";
const benignLive=navigation.buildLiveState(fakeDocument([fakeControl("Continue")],[],benignText),{session:{status:"active"},archetype:"intermediate-form",fillStable:true,transitionObserverReady:true,loopState:progression.createLoopGuard()});
assert.equal(benignLive.hasCaptcha,false);
assert.equal(benignLive.hasMFA,false);
assert.equal(benignLive.hasLegalGate,false);
assert.equal(benignLive.hasDemographicGate,false);

const changed=fakeControl("Different");
const changedDoc=fakeDocument([changed],[]);
const changedResult=await navigation.executeGatedNavigation(plan,navigation.buildLiveState(changedDoc,{session:{status:"active"},archetype:"identity-contact",fillStable:true,transitionObserverReady:true,loopState:progression.createLoopGuard()}),changedDoc,progression,{beforeDispatch:async()=>{}});
assert.equal(changedResult.status,"blocked"); assert.equal(changed.clicks,0);

const observerMissing=progression.progressionGate(plan,navigation.buildLiveState(doc,{session:{status:"active"},archetype:"identity-contact",fillStable:true,loopState:progression.createLoopGuard(),transitionObserverReady:false}));
assert.equal(observerMissing.decision,"REVIEW_REQUIRED");
assert.equal(observerMissing.reason,"transition_observer_not_ready");

const pending={fromPageId:"page-old",fromArchetype:"identity-contact",expectedArchetypes:["application-form"]};
assert.equal(progression.validatePendingTransition(pending,"page-new","application-form").matches,true);
assert.equal(progression.validatePendingTransition(pending,"page-old","application-form").matches,false);
assert.equal(progression.validatePendingTransition(pending,"page-new","account-creation").matches,false);

const contentSource=fs.readFileSync(new URL("../browser/application-assist/content.js",import.meta.url),"utf8");
const popupSource=fs.readFileSync(new URL("../browser/application-assist/popup.js",import.meta.url),"utf8");
assert.ok(contentSource.includes('message.type === "advance"'));
assert.ok(contentSource.includes("beforeDispatch"));
assert.ok(contentSource.includes("pendingTransition"));
assert.ok(contentSource.includes("chrome.storage.local.set"));
assert.equal(contentSource.includes(".click()"),false);
assert.ok(popupSource.includes('"progression.js", "navigation-adapter.js"'),"popup must inject progression runtime for advance");

console.log("NAVIGATION_ADAPTER_TEST: PASS");
