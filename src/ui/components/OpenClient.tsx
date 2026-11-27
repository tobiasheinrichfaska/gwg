import { useState } from 'react';
import { useApp } from '../app/context.ts';

/**
 * "Mandant öffnen": the wheel cannot be steered from inside a page, so the button leaves a request
 * (the "Mandanten" screen then opens that mandate in the edit form) and says how to get there.
 */
export function OpenClient({ id, name }: { id: string; name: string }) {
  const { requestClient } = useApp();
  const [asked, setAsked] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={`Mandant öffnen: ${id} ${name}`}
        onClick={() => {
          requestClient(id);
          setAsked(true);
        }}
      >
        Mandant öffnen
      </button>
      {asked && (
        <span role="status" className="hint">
          {' '}
          Mandat {id} ist vorgemerkt: Wählen Sie im Rad den Bereich „Mandanten“, es öffnet sich zum
          Bearbeiten.
        </span>
      )}
    </>
  );
}
