import type { Hit } from '../../../logic/index.ts';

/** The traffic light as text and symbol; the colour is never the only signal. */
export const LIGHT_LABELS: Record<Hit['klasse'], string> = {
  rot: '● ROT – Treffer',
  gelb: '◐ GELB – prüfen',
};

/** Why the traffic light shows this colour, in plain words. */
export const LIGHT_EXPLANATIONS: Record<Hit['klasse'], string> = {
  rot: 'Warum rot: Der Name ist sehr ähnlich (über der Schwelle „stark“ der Einstellungen) und das volle Geburtsdatum stimmt überein. Das ist ein Hinweis, kein Urteil: Ein Mensch entscheidet.',
  gelb: 'Warum gelb: Der Name ist ähnlich (über der Schwelle „möglich“ der Einstellungen), aber die Geburtsangabe fehlt, ist nur teilweise bekannt oder stimmt im Jahr überein; bei Mandaten gibt es kein Geburtsdatum. Ein Mensch prüft und entscheidet. Nur ein klar anderes Geburtsjahr hätte den Treffer automatisch ausgeschlossen.',
};

export const EXCLUSION_REASONS = [
  'Anderes Geburtsjahr',
  'Andere Staatsangehörigkeit',
  'Anderer Geburtsort',
  'Namensgleichheit ohne Bezug',
  'Sonstiger Grund',
] as const;

/** Readable form of the reader's skip and adjustment codes (`ListNote.why`). */
export function noteText(why: string): string {
  if (why === 'no-name') return 'kein verwendbarer Name';
  if (why === 'no-id') return 'keine Kennung (logicalId)';
  if (why === 'name-unusable') return 'ein Name ohne Buchstaben wurde weggelassen';
  if (why === 'birthdate-unusable')
    return 'eine Geburtsangabe war unbrauchbar und wurde weggelassen';
  if (why === 'remark-cut') return 'die Bemerkung wurde gekürzt';
  if (why === 'duplicate-id-merged') return 'doppelte Kennung, Einträge zusammengeführt';
  if (why.startsWith('names-cut-')) return 'zu viele Namen, überzählige weggelassen';
  if (why.startsWith('births-cut-')) return 'zu viele Geburtsangaben, überzählige weggelassen';
  return why;
}
