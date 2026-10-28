import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * A tiny original synthesized bird chorus. No external asset, licensed recording,
 * side-loaded PNG or private file path is needed. User gesture starts the sound.
 * This control lives in AppShell, so changing routes cannot silently stop it.
 */
function chirp(context: AudioContext) {
  const start = context.currentTime + 0.01;
  for (const [index, from, to] of [[0, 880, 1230], [1, 1030, 1490], [2, 920, 1350]]) {
    const at = start + index * 0.135;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(from, at);
    oscillator.frequency.exponentialRampToValueAtTime(to, at + 0.11);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(0.025, at + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    oscillator.connect(envelope);
    envelope.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.135);
  }
}

export function BirdsongControl() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(true);
  const contextRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const context = contextRef.current;
      if (context?.state === 'running') chirp(context);
    }, 16_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  useEffect(() => () => {
    const context = contextRef.current;
    contextRef.current = null;
    if (context) void context.close().catch(() => undefined);
  }, []);
  function toggle() {
    if (enabled) {
      setEnabled(false);
      const context = contextRef.current;
      contextRef.current = null;
      if (context) void context.close().catch(() => undefined);
      return;
    }
    if (typeof window.AudioContext !== 'function') {
      setSupported(false);
      return;
    }
    try {
      const context = new window.AudioContext();
      contextRef.current = context;
      void context.resume().then(() => {
        if (contextRef.current === context && context.state === 'running') chirp(context);
      }).catch(() => { setSupported(false); setEnabled(false); });
      setEnabled(true);
    } catch {
      setSupported(false);
      setEnabled(false);
    }
  }
  return <button type="button" onClick={toggle} disabled={!supported} aria-pressed={enabled}
    aria-label={enabled ? 'Turn birdsong off' : 'Turn birdsong on'}
    data-testid="button-birdsong-control"
    className="fixed bottom-3 right-3 z-20 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-lg hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 sm:bottom-5 sm:right-5">
    {enabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
    {supported ? enabled ? 'Birdsong on' : 'Birdsong off' : 'Sound unavailable'}
  </button>;
}
