import { useEffect, useState } from 'react';
import { parsePreferences } from '../lib/application-preferences';
import type { RecommendationWorkMode } from '../lib/opportunity-fit';

/** Read the existing private host preference. Null means automatic selection is not authorized. */
export function useRecommendationWorkMode(): RecommendationWorkMode | null {
  const [mode, setMode] = useState<RecommendationWorkMode | null>(null);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      setMode(null);
      try {
        const response = await fetch('/__escapehatch/managed-assist/preferences', { credentials: 'same-origin', cache: 'no-store' });
        if (!response.ok) throw new Error('Preference unavailable');
        const json = await response.json();
        const preferences = parsePreferences(json.preferences);
        if (!preferences) throw new Error('Preference invalid');
        if (active && request === revision) setMode(preferences.recommendation_work_mode ?? 'any');
      } catch {
        if (active && request === revision) setMode(null);
      }
    };
    void refresh();
    window.addEventListener('escapehatch-recommendation-policy-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      active = false;
      window.removeEventListener('escapehatch-recommendation-policy-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  return mode;
}
