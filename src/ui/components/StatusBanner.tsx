import { useApp } from '../app/context.ts';

/**
 * "Abgleich veraltet" (or "keine Liste"): text and symbol, never only colour. Nothing is shown while
 * the last run is still current, so a missing banner means: list fresh, nothing changed since the run.
 */
export function StatusBanner() {
  const { screeningStatus } = useApp();
  if (screeningStatus.state === 'ok') return null;
  return (
    <div className="warning">
      <p>
        <strong>
          ⚠ {screeningStatus.state === 'no-list' ? 'Kein Abgleich möglich' : 'Abgleich veraltet'}
        </strong>
      </p>
      <ul>
        {screeningStatus.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
