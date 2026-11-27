import { useEffect, useId, useState } from 'react';
import { useApp } from '../../app/context.ts';
import { HitDetail } from './HitDetail.tsx';
import { ListSection } from './ListSection.tsx';
import { ScreeningSection } from './ScreeningSection.tsx';

/** Area "Abgleich": the list (head), the screening, and the detail page "Treffer klären" as a state. */
export function SanctionsScreen() {
  const { requestedHitKey, requestHit } = useApp();
  const uid = useId();
  // A hit another screen asked for opens its detail page (taken once, then cleared).
  const [detail, setDetail] = useState<string | null>(requestedHitKey);
  useEffect(() => {
    if (requestedHitKey !== null) requestHit(null);
  }, [requestedHitKey, requestHit]);

  if (detail !== null) {
    return <HitDetail caseKey={detail} onBack={() => setDetail(null)} />;
  }
  return (
    <section aria-labelledby={`${uid}-h`}>
      <h1 id={`${uid}-h`}>Abgleich</h1>
      <p>
        Abgleich der Personen und Mandate mit der Sanktionsliste. Das Programm erinnert und
        dokumentiert; es entscheidet nichts rechtlich und meldet nichts.
      </p>
      <ListSection />
      <ScreeningSection onOpen={setDetail} />
    </section>
  );
}
