import { useState } from 'react';
import { useApp } from '../app/context.ts';

/**
 * "Treffer öffnen": like "Mandant öffnen", the wheel cannot be steered from inside a page. The button
 * leaves a request and says how to get there; the screen "Abgleich" opens that hit's detail page.
 */
export function OpenHit({ hitKey, label }: { hitKey: string; label: string }) {
  const { requestHit } = useApp();
  const [asked, setAsked] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Treffer öffnen: ${label}`}
        onClick={() => {
          requestHit(hitKey);
          setAsked(true);
        }}
      >
        Treffer öffnen
      </button>
      {asked && (
        <span role="status" className="hint">
          {' '}
          Der Treffer ist vorgemerkt: Wählen Sie im Rad den Bereich „Abgleich“, die Detailseite
          öffnet sich.
        </span>
      )}
    </>
  );
}
