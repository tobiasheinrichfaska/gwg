import { useId, useState } from 'react';
import type { OrphanRepair, Result } from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { Modal } from '../../components/Modal.tsx';

/**
 * Lock screen only, and only when the sole defect of the stored data is screening decisions about persons
 * or mandates that no longer exist (left behind by an older version). Names the number, asks, then saves.
 */
export function OrphanRepairSection({
  repair,
  onRepair,
}: {
  repair: OrphanRepair;
  onRepair(b: OrphanRepair['backup']): Promise<Result<void>>;
}) {
  const id = useId();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = repair.removed;

  async function confirm() {
    const r = await onRepair(repair.backup);
    setAsking(false);
    if (!r.ok) setError(`Nicht gespeichert. ${describeFailure(r.reason, r.where)}`);
  }

  return (
    <section aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Verwaiste Einträge</h2>
      <p>
        Der gespeicherte Bestand ist sonst in Ordnung: Nur {n} Entscheidungen zu Treffern gehören zu
        Personen oder Mandaten, die es nicht mehr gibt. Beim Entfernen gehen genau diese {n}{' '}
        Entscheidungen verloren; alles andere bleibt unverändert.
      </p>
      <button type="button" onClick={() => setAsking(true)}>
        Verwaiste Einträge entfernen und fortfahren
      </button>
      {error !== null && <p role="alert">{error}</p>}
      {asking && (
        <Modal role="alertdialog" labelledBy={`${id}-t`} onClose={() => setAsking(false)}>
          <h3 id={`${id}-t`}>{n} Entscheidungen entfernen?</h3>
          <p>
            {n} Entscheidungen werden endgültig aus dem Bestand entfernt, danach öffnet die
            Anwendung.
          </p>
          <button type="button" autoFocus onClick={() => setAsking(false)}>
            Abbrechen
          </button>{' '}
          <button type="button" onClick={() => void confirm()}>
            Verwaiste Einträge entfernen
          </button>
        </Modal>
      )}
    </section>
  );
}
