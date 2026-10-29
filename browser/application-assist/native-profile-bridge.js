/* Native workspace projection. No private state is exposed to webpage messages. */
(function (root) {
  'use strict';
  const PROFILE = 'escapeHatch.applicationAssistProfile.v1';
  const LEGACY = 'escapeHatch.applicationAutofillProfile.v1';
  const BROWSER = 'escapeHatch.browserProfileId.v1';
  const SYNC = 'escapeHatch.workspaceProfileSync.v1';
  const ANSWERS = 'escapeHatch.approvedWorkspaceAnswers.v1';
  const HOST = 'com.escapehatch.profile';
  const FIELDS = ['name_prefix','first_name','last_name','preferred_name','email','phone','linkedin_url','street_address','city','region','postal_code','country'];
  const AUTHORITIES = ['unconfirmed','user_confirmed_primary','secondary_or_forwarded'];
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  function cleanProfile(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_PROFILE');
    const profile = {};
    for (const key of FIELDS) {
      if (value[key] === undefined) continue;
      if (typeof value[key] !== 'string' || value[key].length > 4096) throw new Error('INVALID_PROFILE');
      if (value[key].trim()) profile[key] = value[key].trim();
    }
    const authority = value.phone_authority || 'unconfirmed';
    if (!AUTHORITIES.includes(authority)) throw new Error('INVALID_PROFILE');
    profile.phone_authority = profile.phone ? authority : 'unconfirmed';
    return profile;
  }
  function cleanAnswers(value) {
    if (!Array.isArray(value) || value.length > 200) throw new Error('INVALID_ANSWERS');
    const ids = new Set();
    return value.map(entry => {
      if (!entry || typeof entry.id !== 'string' || !/^[a-z0-9_.-]{1,160}$/i.test(entry.id) || ids.has(entry.id) || typeof entry.label !== 'string' || entry.label.length > 512 || typeof entry.value !== 'string' || entry.value.length > 4096) throw new Error('INVALID_ANSWERS');
      ids.add(entry.id);
      return { id: entry.id, label: entry.label, value: entry.value };
    });
  }
  const count = profile => FIELDS.filter(key => profile?.[key]).length;
  function binding(response) {
    for (const key of ['ownerId','workspaceId','installationId']) if (!uuid(response[key])) throw new Error('INVALID_NATIVE_BINDING');
    return { ownerId: response.ownerId, workspaceId: response.workspaceId, installationId: response.installationId };
  }
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const sourceState = stored => [stored[PROFILE], stored[LEGACY], stored[ANSWERS], stored[SYNC], stored[BROWSER]];
  function create({ storage, native, api, randomUUID = () => crypto.randomUUID() }) {
    const PREF = api.PREFERENCE_STORAGE_KEY;
    const keys = [PROFILE, LEGACY, ANSWERS, SYNC, BROWSER, PREF];
    async function read() { return storage.get(keys); }
    async function browserId() {
      const stored = await storage.get(BROWSER);
      if (stored[BROWSER] !== undefined && !uuid(stored[BROWSER])) throw new Error('INVALID_BROWSER_BINDING');
      if (stored[BROWSER]) return stored[BROWSER];
      const id = randomUUID(); await storage.set({ [BROWSER]: id }); return id;
    }
    async function request(action, values = {}) {
      const response = await native(HOST, { protocol: 1, action, browserProfileId: await browserId(), ...values });
      if (!response || response.ok !== true) throw new Error(typeof response?.reason === 'string' && /^[A-Z0-9_]{1,100}$/.test(response.reason) ? response.reason : 'NATIVE_WORKSPACE_UNAVAILABLE');
      return response;
    }
    function assertBinding(response, sync) {
      const next = binding(response);
      if (sync?.ownerId && !['ownerId','workspaceId','installationId'].every(key => sync[key] === next[key])) throw new Error('OWNER_BINDING_MISMATCH');
      return next;
    }
    async function view() {
      const stored = await read();
      return { profile: stored[PROFILE] || stored[LEGACY] || {}, answers: stored[ANSWERS] || [], sync: stored[SYNC] || null };
    }
    async function review() {
      const stored = await read();
      const response = await request('status');
      if (response.ownerId) assertBinding(response, stored[SYNC]);
      return response;
    }
    async function refresh() {
      await browserId();
      const before = await read(), sync = before[SYNC];
      if (!sync?.paired) return { status: 'NOT_PAIRED', profileFieldCount: 0, answerCount: 0 };
      if (sync.paused) return { status: 'PAUSED', profileFieldCount: count(before[PROFILE]), answerCount: (before[ANSWERS] || []).length };
      const existingProfile = before[PROFILE] || before[LEGACY] || {};
      const existingAnswers = Object.fromEntries((before[ANSWERS] || []).map(entry => [entry.id, entry.value]));
      const response = await request('project', { existingProfile, existingAnswers });
      const nextBinding = assertBinding(response, sync);
      if (!['PROJECTED','ALREADY_CURRENT'].includes(response.status)) throw new Error('NATIVE_PROJECTION_NOT_READY');
      const profile = cleanProfile(response.profile), answers = cleanAnswers(response.answers || []);
      if (count(existingProfile) && !same(cleanProfile(existingProfile), profile)) throw new Error('EXISTING_PROFILE_REVIEW_REQUIRED');
      for (const answer of answers) if (Object.hasOwn(existingAnswers, answer.id) && existingAnswers[answer.id] !== answer.value) throw new Error('EXISTING_ANSWERS_REVIEW_REQUIRED');
      for (const key of ['workspaceRevision','preferenceRevision','profileRevision']) {
        if (typeof response[key] !== 'string' || !/^[a-f0-9]{64}$/.test(response[key])) throw new Error('INVALID_NATIVE_REVISION');
      }
      // Host admission is authoritative; a local concurrent edit still wins.
      const current = await read();
      if (!same(sourceState(before), sourceState(current)) || !same(before[PREF], current[PREF])) throw new Error('LOCAL_PROFILE_CHANGED');
      const preferences = api.projectProfileToPreferenceStore(profile, current[PREF] || {});
      const existingPreferences = api.normalizePreferenceStore(current[PREF]).preferences;
      for (const key of FIELDS) {
        if (!profile[key]) continue;
        const question = api.PROFILE_TO_QUESTION[key];
        const previous = api.resolvePreferenceEntry(question, current[PREF]);
        if (previous && previous.value !== profile[key]) throw new Error('EXISTING_PREFERENCE_REVIEW_REQUIRED');
        // Preserve existing scope/confirmation provenance; hydration grants none.
        if (Object.hasOwn(existingPreferences, question)) preferences.preferences[question] = existingPreferences[question];
      }
      await storage.set({ [PROFILE]: profile, [PREF]: preferences, [ANSWERS]: answers,
        [SYNC]: { ...nextBinding, paired: true, paused: false, workspaceRevision: response.workspaceRevision, preferenceRevision: response.preferenceRevision, profileRevision: response.profileRevision, status: response.status } });
      return { status: response.status, profileFieldCount: count(profile), answerCount: answers.length };
    }
    async function confirm(values) {
      await browserId();
      const before = await read();
      if (!values || !Array.isArray(values.approvedFields) || !Array.isArray(values.approvedAnswerIds) || values.approvedFields.some(key => ![...FIELDS,'phone_authority'].includes(key))) throw new Error('INVALID_APPROVAL');
      const response = await request('confirm', { expectedWorkspaceRevision: values.expectedWorkspaceRevision, expectedPreferenceRevision: values.expectedPreferenceRevision, approvedFields: values.approvedFields, approvedAnswerIds: values.approvedAnswerIds });
      const nextBinding = assertBinding(response, before[SYNC]);
      const current = await read();
      if (!same(sourceState(before), sourceState(current))) throw new Error('LOCAL_PROFILE_CHANGED');
      await storage.set({ [SYNC]: { ...nextBinding, paired: true, paused: false, status: 'READY' } });
      return refresh();
    }
    async function edit(action, value) {
      const current = await read(), sync = current[SYNC];
      if (action === 'clear') {
        const preferences = api.normalizePreferenceStore(current[PREF]);
        const retained = { ...preferences.preferences };
        for (const key of Object.values(api.PROFILE_TO_QUESTION)) delete retained[key];
        await storage.remove([PROFILE, LEGACY, ANSWERS]);
        await storage.set({ [PREF]: { schema_version: 'escapehatch-application-question-preferences/v1', preferences: retained }, [SYNC]: { ...sync, paused: true, status: 'PAUSED' } });
        return view();
      }
      const profile = cleanProfile(value);
      const preferences = api.projectProfileToPreferenceStore(profile, current[PREF] || {});
      await storage.set({ [PROFILE]: profile, [PREF]: preferences, [SYNC]: { ...sync, status: 'LOCAL_EDIT' } });
      return view();
    }
    return { view, review, refresh, confirm, edit };
  }
  root.EscapeHatchNativeProfile = { create, cleanProfile, cleanAnswers, PROFILE, LEGACY, SYNC, ANSWERS, BROWSER, HOST };
  if (typeof module !== 'undefined') module.exports = root.EscapeHatchNativeProfile;
})(typeof globalThis !== 'undefined' ? globalThis : this);
