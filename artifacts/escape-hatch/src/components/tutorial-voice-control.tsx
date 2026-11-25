import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import registry from '../../../../contracts/application-journey-scenes.v1.json' with { type: 'json' };
import { Volume2, VolumeX } from 'lucide-react';
import { getJourneyStop, getWorkspaceGuide } from '@/lib/journey-wayfinding';

export const TUTORIAL_VOICE_KEY = registry.tutorial_voice.storage_key;
const containerWorkspace = import.meta.env.VITE_ESCAPEHATCH_CONTAINER === '1';

// Speak public tutorial copy only: never pass applicant names, documents or answers
// to a browser speech engine. The visual guide remains the source of navigation.
type Target = { kind: 'route' | 'scene' | 'stop' | 'supplemental'; id: string; nextId?: string };
type RegisteredTarget = { target: Target; priority: number };
type PublicGuidance = { label: string; narration: string };
const emptyGuidance: PublicGuidance = { label: '', narration: '' };

function sceneCopy(id: string, nextId?: string): PublicGuidance {
  const current = registry.scenes.find(scene => scene.id === id);
  if (!current) return emptyGuidance;
  const next = nextId && nextId !== id ? registry.scenes.find(scene => scene.id === nextId) : undefined;
  return { label: current.coach_prompt, narration: current.coach_prompt + '. ' +
    current.wayfinding.action + '.' + (next ? ' Next: ' + next.coach_prompt + '.' : '') };
}

function narrationFor(target?: Target): PublicGuidance {
  if (!target) return emptyGuidance;
  if (target.kind === 'scene') return sceneCopy(target.id, target.nextId);
  if (target.kind === 'supplemental') {
    const guide = registry.supplemental_guides.find(item => item.id === target.id);
    return guide ? { label: guide.title, narration: guide.title + '. ' + guide.detail + ' ' + guide.action + '.' } : emptyGuidance;
  }
  if (target.kind === 'route' && target.id === '/') {
    const home = sceneCopy('HOME_READY');
    return { label: home.label, narration: 'Welcome to EscapeHatch! I will guide you through your application journey. ' + home.narration + ' You decide what reaches an employer. Turn my voice off at any time.' };
  }
  const stop = target.kind === 'stop' ? registry.guide_stops.find(row => row.id === target.id) : getWorkspaceGuide(target.id);
  if (!stop) return emptyGuidance;
  const guide = getJourneyStop(stop.id, containerWorkspace);
  return { label: guide.title, narration: guide.title + '. ' + guide.detail + ' ' + guide.action + '.' };
}

function readEnabled(): boolean {
  try { const saved = localStorage.getItem(TUTORIAL_VOICE_KEY); return saved === null ? registry.tutorial_voice.default_enabled : saved !== 'off'; }
  catch { return registry.tutorial_voice.default_enabled; }
}

type VoiceStatus = 'ready' | 'speaking' | 'waiting' | 'unavailable' | 'off';

type VoiceContextValue = {
  enabled: boolean;
  status: VoiceStatus;
  label: string;
  toggle: () => void;
  publish: (key: string, target: Target | null, priority: number) => void;
};
const VoiceContext = createContext<VoiceContextValue | null>(null);

/** Register a semantic identity only, never arbitrary applicant text. */
export function useTutorialGuidance(target: Target | null, priority: number) {
  const context = useContext(VoiceContext);
  const publish = context?.publish;
  const key = useId();
  const kind = target?.kind, id = target?.id, nextId = target?.nextId;
  useEffect(() => {
    if (!publish || !kind || !id) return;
    publish(key, { kind, id, nextId }, priority);
    return () => publish(key, null, priority);
  }, [publish, key, kind, id, nextId, priority]);
}

/** One speech owner across recovery, cockpit routes and active application scenes. */
export function TutorialVoiceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(readEnabled);
  const [status, setStatus] = useState<VoiceStatus>('ready');
  const [targets, setTargets] = useState<Record<string, RegisteredTarget>>({});
  const publish = useCallback((key: string, target: Target | null, priority: number) => {
    setTargets(current => {
      const next = { ...current };
      if (target) next[key] = { target, priority };
      else delete next[key];
      return next;
    });
  }, []);
  const active = Object.values(targets).sort((a, b) => b.priority - a.priority)[0]?.target;
  const { label, narration } = narrationFor(active);

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!enabled) { setStatus('off'); return; }
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') {
      setStatus('unavailable'); return;
    }
    if (!narration) { setStatus('ready'); return; }
    let active = true;
    let current: SpeechSynthesisUtterance | undefined;
    let began = false;
    let retried = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    function speak() {
      if (!active) return;
      clearTimeout(retryTimer);
      began = false;
      const utterance = new SpeechSynthesisUtterance(narration);
      current = utterance;
      utterance.lang = document.documentElement.lang || 'en-US';
      utterance.rate = 0.95;
      const local = synth.getVoices().find(voice => voice.localService && voice.lang.toLowerCase() === utterance.lang.toLowerCase());
      if (local) utterance.voice = local;
      utterance.onstart = () => {
        if (!active || current !== utterance) return;
        began = true; clearTimeout(retryTimer); setStatus('speaking');
      };
      utterance.onend = () => {
        if (!active || current !== utterance) return;
        began = true; clearTimeout(retryTimer); setStatus('ready');
      };
      utterance.onerror = event => {
        if (!active || current !== utterance) return;
        clearTimeout(retryTimer);
        if (!began && event.error === 'not-allowed' && !retried) setStatus('waiting');
        else { began = true; setStatus('unavailable'); }
      };
      try {
        synth.speak(utterance);
        // Some engines silently queue until a gesture instead of reporting an error.
        if (!began) retryTimer = setTimeout(() => { if (active && !began) setStatus('waiting'); }, 1500);
      } catch { setStatus('waiting'); }
    }
    function retry(event: Event) {
      if (!active || began || retried || !event.isTrusted) return;
      // Never start speech when the user is trying to mute it.
      if (event.target instanceof Element && event.target.closest('[data-testid="button-tutorial-voice"]')) return;
      retried = true;
      current = undefined;
      synth.cancel();
      speak();
    }
    setStatus('ready');
    // Attempt immediately. Browsers that enforce activation get one retry from
    // a real user gesture; no synthetic interaction or audio-policy bypass.
    document.addEventListener('pointerdown', retry, true);
    document.addEventListener('keydown', retry, true);
    speak();
    return () => {
      active = false; current = undefined;
      clearTimeout(retryTimer);
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
      synth.cancel();
    };
  }, [enabled, narration]);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (event.key === TUTORIAL_VOICE_KEY || event.key === null) setEnabled(readEnabled());
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function toggle() {
    const next = !enabled;
    if (!next) window.speechSynthesis?.cancel();
    try { localStorage.setItem(TUTORIAL_VOICE_KEY, next ? 'on' : 'off'); }
    catch { /* A blocked storage backend still permits a session mute. */ }
    setEnabled(next);
  }

  return <VoiceContext.Provider value={{ enabled, status, label, toggle, publish }}>{children}</VoiceContext.Provider>;
}

/** One visible mute control in each mounted host surface; the provider owns speech. */
export function TutorialVoiceControl({ route }: { route?: string }) {
  useTutorialGuidance(route ? { kind: 'route', id: route } : null, 1);
  const voice = useContext(VoiceContext);
  if (!voice) return null;
  const { enabled, status, label, toggle } = voice;
  return <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="tutorial-voice-control">
    <img src="/escapehatch-mascot.webp" width={32} height={32} alt="" aria-hidden="true" data-testid="tutorial-voice-avatar" className="h-8 w-8 shrink-0" />
    <button type="button" aria-pressed={enabled} aria-label={enabled ? 'Turn tutorial voice off' : 'Turn tutorial voice on'}
      onClick={toggle} data-testid="button-tutorial-voice"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      {enabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
      Tutorial voice {enabled ? 'on' : 'off'}
    </button>
    {label && <span className="text-xs font-semibold text-primary" data-testid="tutorial-voice-current">{label}</span>}
    <span className="text-xs text-muted-foreground" data-testid="tutorial-voice-status">
      {enabled && status === 'waiting' ? 'Voice will start after your next interaction.' : enabled && status === 'unavailable' ? 'Voice unavailable. The written tutorial is still here.' : enabled && status === 'speaking' ? 'Speaking guidance' : enabled ? 'Spoken guidance follows your journey.' : 'Written guidance remains available.'}
    </span>
  </div>;
}
