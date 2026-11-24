import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { getJourneyStop, getWorkspaceGuide } from '@/lib/journey-wayfinding';

export const TUTORIAL_VOICE_KEY = 'escapehatch.tutorial-voice.v1';
const containerWorkspace = import.meta.env.VITE_ESCAPEHATCH_CONTAINER === '1';

// Speak public tutorial copy only: never pass applicant names, documents or answers
// to a browser speech engine. The visual guide remains the source of navigation.
function narrationFor(route: string): string {
  if (route === '/') return 'Welcome to EscapeHatch! I will guide you through your application journey. Start by bringing your career sources and reviewing your reusable profile. Save an opportunity, then prepare its application. You decide what reaches an employer. You can turn my voice off at any time.';
  if (route === '/journey') return 'Explore your application journey. Choose a stop to see what to do next. You stay in control of your applications.';
  const stop = getWorkspaceGuide(route);
  if (!stop) return '';
  const guidance = getJourneyStop(stop.id, containerWorkspace);
  return guidance.title + '. ' + guidance.detail;
}

function readEnabled(): boolean {
  try { return localStorage.getItem(TUTORIAL_VOICE_KEY) !== 'off'; }
  catch { return true; }
}

type VoiceStatus = 'ready' | 'speaking' | 'waiting' | 'unavailable' | 'off';

/** One speech owner across cockpit routes. Only the tutorial voice defaults on. */
export function TutorialVoiceControl({ route }: { route: string }) {
  const [enabled, setEnabled] = useState(readEnabled);
  const [status, setStatus] = useState<VoiceStatus>('ready');
  const narration = narrationFor(route);

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

  return <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="tutorial-voice-control">
    <button type="button" aria-pressed={enabled} aria-label={enabled ? 'Turn tutorial voice off' : 'Turn tutorial voice on'}
      onClick={toggle} data-testid="button-tutorial-voice"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
      {enabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
      Tutorial voice {enabled ? 'on' : 'off'}
    </button>
    <span className="text-xs text-muted-foreground" data-testid="tutorial-voice-status">
      {enabled && status === 'waiting' ? 'Voice will start after your next interaction.' : enabled && status === 'unavailable' ? 'Voice unavailable. The written tutorial is still here.' : enabled && status === 'speaking' ? 'Speaking guidance' : enabled ? 'Spoken guidance follows your journey.' : 'Written guidance remains available.'}
    </span>
  </div>;
}
