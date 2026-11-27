import type { ListNote } from '../../../io/index.ts';
import { noteText } from './texts.ts';

const SHOWN = 100;

/** Entries the reader left out or changed: count, reason and the first ids; nothing is dropped silently. */
export function NotesReport({
  title,
  notes,
  what,
}: {
  title: string;
  notes: readonly ListNote[];
  what: string;
}) {
  if (notes.length === 0) return null;
  const byWhy = new Map<string, number>();
  for (const n of notes) byWhy.set(noteText(n.why), (byWhy.get(noteText(n.why)) ?? 0) + 1);
  return (
    <div>
      <p>
        <strong>
          {title}: {notes.length}
        </strong>{' '}
        {what}
      </p>
      <ul>
        {[...byWhy].map(([text, n]) => (
          <li key={text}>
            {n} × {text}
          </li>
        ))}
      </ul>
      <details>
        <summary>Kennungen ansehen</summary>
        <ul>
          {notes.slice(0, SHOWN).map((n, i) => (
            <li key={`${n.id}-${i}`}>
              {n.id}: {noteText(n.why)}
            </li>
          ))}
        </ul>
        {notes.length > SHOWN && <p>… und {notes.length - SHOWN} weitere.</p>}
      </details>
    </div>
  );
}
