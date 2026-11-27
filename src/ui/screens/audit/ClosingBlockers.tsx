import type { ClosingBlocker, ClosingWarning } from '../../../logic/index.ts';

const hits = (n: number) => (n === 1 ? '1 offener roter Treffer' : `${n} offene rote Treffer`);

/** One plain sentence per blocker, with the number and where to deal with it. */
function blockerText(b: ClosingBlocker): string {
  switch (b.kind) {
    case 'red-hits':
      return `${hits(b.count)} aus dem Sanktionsabgleich: Entscheiden Sie ${b.count === 1 ? 'ihn' : 'sie'} im Bereich „Abgleich“ (Treffer öffnen).`;
    case 'pep-approvals':
      return `${b.count === 1 ? '1 PEP-Freigabe fehlt' : `${b.count} PEP-Freigaben fehlen`}: Erfassen Sie sie bei der Person im Bereich „Mandanten“ oder in den Aufgaben (Bereich „Aufgaben“).`;
    case 'unscreenable':
      return `${b.count === 1 ? '1 Name ist' : `${b.count} Namen sind`} nicht prüfbar (zum Beispiel nur ein Strich oder nur Rechtsform): Ergänzen Sie die Daten im Bereich „Mandanten“ (siehe Aufgabe „Name nicht prüfbar“).`;
    case 'screening-missing':
      return b.why === 'no-list'
        ? 'Es ist keine Sanktionsliste geladen: Ohne Abgleich lässt sich nicht sagen, ob Treffer offen sind. Laden Sie die Liste im Bereich „Abgleich“.'
        : b.why === 'never-run'
          ? 'In dieser Sitzung wurde noch kein Sanktionsabgleich durchgeführt: Treffer werden nur im Speicher gehalten. Starten Sie den Abgleich im Bereich „Abgleich“.'
          : 'Der Sanktionsabgleich ist veraltet (Liste, Personen oder Mandate haben sich geändert): Starten Sie ihn im Bereich „Abgleich“ neu.';
  }
}

function warningText(w: ClosingWarning): string {
  return `${w.count === 1 ? '1 offener gelber Treffer' : `${w.count} offene gelbe Treffer`} aus dem Sanktionsabgleich: kein Hindernis, aber bitte vor dem Abschluss ansehen.`;
}

export function ClosingBlockerList({ blockers }: { blockers: readonly ClosingBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <div role="alert">
      <p>Das Audit lässt sich noch nicht abschließen:</p>
      <ul>
        {blockers.map((b) => (
          <li key={b.kind}>{blockerText(b)}</li>
        ))}
      </ul>
    </div>
  );
}

export function ClosingWarnings({ warnings }: { warnings: readonly ClosingWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="hint">
      {warnings.map((w) => (
        <li key={w.kind}>{warningText(w)}</li>
      ))}
    </ul>
  );
}
