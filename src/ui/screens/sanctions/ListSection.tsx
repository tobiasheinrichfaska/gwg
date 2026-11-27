import { useId, useRef, useState } from 'react';
import { readEuListFile, type EuListFile, type ListNote } from '../../../io/index.ts';
import { isListStale, listAgeDays } from '../../../logic/index.ts';
import { describeFailure } from '../../app/messages.ts';
import { useApp } from '../../app/context.ts';
import { dayCount, formatDate } from '../../format.ts';
import { ListImportDialog } from './ListImportDialog.tsx';
import { NotesReport } from './NotesReport.tsx';

export const PRIVACY_NOTE =
  'Beim Abruf wird nur die öffentliche Liste geladen; es werden keine Mandantendaten gesendet.';

/** Head of the screen: which list is loaded, how old it is, how to get a newer one, and the settings. */
export function ListSection() {
  const {
    list,
    listError,
    settings,
    settingsLoaded,
    today,
    storeList,
    fetchList,
    fetching,
    lastFetch,
  } = useApp();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [pending, setPending] = useState<EuListFile | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [report, setReport] = useState<{
    count: number;
    on: string;
    skipped: ListNote[];
    adjusted: ListNote[];
  } | null>(null);

  const stale = isListStale(list, today, settings.maxAgeDays);

  async function choose(file: File | undefined) {
    setReadError(null);
    setReport(null);
    if (!file) return;
    setReading(true);
    try {
      const r = await readEuListFile(file);
      if (!r.ok) {
        setReadError(
          `Datei nicht eingelesen. ${describeFailure(r.reason, r.where)} Die gespeicherte Liste bleibt unverändert.`,
        );
        return;
      }
      setSaveError(null);
      setPending(r.value);
    } catch {
      // Whatever went wrong in reading: a message, never a crashed screen.
      setReadError(
        'Datei konnte nicht gelesen werden. (Code: bad-list) Die gespeicherte Liste bleibt unverändert.',
      );
    } finally {
      setReading(false);
    }
  }

  async function confirmImport(index: NonNullable<typeof list>) {
    if (pending === null) return;
    const r = await storeList(index);
    if (!r.ok) {
      setSaveError(
        `Nicht gespeichert. ${describeFailure(r.reason, r.where)} Die bisherige Liste bleibt.`,
      );
      return;
    }
    setReport({
      count: index.entries.length,
      on: index.fetchedOn,
      skipped: pending.skipped,
      adjusted: pending.adjusted,
    });
    setPending(null);
    setSaveError(null);
  }

  return (
    <section aria-labelledby={`${uid}-liste`}>
      <h2 id={`${uid}-liste`}>Liste</h2>
      {list === null ? (
        <p className="warning">
          ⚠ Keine Sanktionsliste geladen. Ohne Liste ist kein Abgleich möglich; nichts gilt dann als
          „unauffällig“. Lesen Sie eine Datei ein
          {settings.relayUrl !== '' ? ' oder rufen Sie die Liste ab' : ''}.
        </p>
      ) : (
        <>
          {stale && (
            <p className="warning">
              ⚠ Liste veraltet: Stand {formatDate(list.fetchedOn)},{' '}
              {dayCount(listAgeDays(list.fetchedOn, today))} alt (Höchstalter{' '}
              {dayCount(settings.maxAgeDays)}). Laden Sie eine neuere Liste, bevor Sie sich auf
              einen Abgleich verlassen.
            </p>
          )}
          <dl>
            <dt>Quelle</dt>
            <dd>{list.source}</dd>
            <dt>Stand</dt>
            <dd>{formatDate(list.fetchedOn)}</dd>
            <dt>Alter</dt>
            <dd>{dayCount(listAgeDays(list.fetchedOn, today))}</dd>
            <dt>Einträge</dt>
            <dd>{list.entries.length}</dd>
          </dl>
        </>
      )}
      {listError !== null && (
        <p role="alert">
          Die gespeicherte Liste ist nicht lesbar. {describeFailure(listError)} Lesen Sie die Liste
          neu ein.
        </p>
      )}
      <p>
        <input
          ref={fileRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="sr-only"
          tabIndex={-1}
          aria-label="Datei der EU-Liste wählen"
          onChange={(e) => {
            const input = e.currentTarget;
            void choose(input.files?.[0]).finally(() => {
              input.value = '';
            });
          }}
        />
        <button type="button" disabled={reading} onClick={() => fileRef.current?.click()}>
          Liste aus Datei einlesen
        </button>{' '}
        <button
          type="button"
          disabled={settings.relayUrl === '' || fetching}
          aria-describedby={settings.relayUrl === '' ? `${uid}-norelay` : undefined}
          onClick={() => void fetchList()}
        >
          {fetching ? 'Wird abgerufen …' : 'Jetzt abrufen'}
        </button>
      </p>
      {settings.relayUrl === '' && (
        <p className="hint" id={`${uid}-norelay`}>
          „Jetzt abrufen“ ist aus, solange unten keine Relay-Adresse eingetragen ist.
        </p>
      )}
      {reading && <p role="status">Datei wird gelesen …</p>}
      {readError !== null && <p role="alert">{readError}</p>}
      {report !== null && (
        <div role="status">
          <p>
            Liste eingelesen: {report.count} Einträge, Stand {formatDate(report.on)}.
          </p>
          <NotesReport
            title="Übersprungene Einträge"
            notes={report.skipped}
            what="Diese Einträge werden nicht abgeglichen."
          />
          <NotesReport
            title="Geänderte Einträge"
            notes={report.adjusted}
            what="Diese Einträge sind mit Einschränkung in der Liste."
          />
        </div>
      )}
      {lastFetch !== null &&
        (lastFetch.ok ? (
          <div role="status">
            <p>
              {lastFetch.auto ? 'Abruf beim Start: ' : ''}Liste abgerufen
              {list !== null
                ? `: Stand ${formatDate(list.fetchedOn)}, ${list.entries.length} Einträge`
                : ''}
              .
            </p>
            {lastFetch.keptNewer !== null && (
              <p className="warning">
                ⚠ Die abgerufene Liste ist älter als die gespeicherte. Die gespeicherte Liste (Stand{' '}
                {formatDate(lastFetch.keptNewer)}) bleibt.
              </p>
            )}
            {lastFetch.shrunk !== null && (
              <p className="warning">
                ⚠ Die abgerufene Liste hat nur {lastFetch.shrunk.got} Einträge, die gespeicherte{' '}
                {lastFetch.shrunk.had} Einträge. Die Liste wurde nicht ersetzt. Prüfen Sie die
                Quelle; eine bewusst kleinere Liste spielen Sie über „Liste aus Datei einlesen“ mit
                Bestätigung ein.
              </p>
            )}
            {lastFetch.stale && (
              <p className="warning">
                ⚠ Hinweis: Das Relay hat eine ältere Kopie geliefert (X-Stale); die EU-Quelle war
                nicht erreichbar. Die Liste kann älter sein als der angezeigte Abruf.
              </p>
            )}
            <NotesReport
              title="Übersprungene Einträge"
              notes={lastFetch.skipped}
              what="Diese Einträge werden nicht abgeglichen."
            />
            <NotesReport
              title="Geänderte Einträge"
              notes={lastFetch.adjusted}
              what="Diese Einträge sind mit Einschränkung in der Liste."
            />
          </div>
        ) : (
          <p role={lastFetch.auto ? 'status' : 'alert'}>
            {lastFetch.auto ? 'Abruf beim Start fehlgeschlagen. ' : 'Abruf fehlgeschlagen. '}
            {describeFailure(lastFetch.reason)}
          </p>
        ))}
      {pending !== null && (
        <ListImportDialog
          file={pending}
          currentOn={list?.fetchedOn ?? null}
          currentCount={list?.entries.length ?? null}
          error={saveError}
          onConfirm={(index) => void confirmImport(index)}
          onCancel={() => setPending(null)}
        />
      )}

      <SettingsForm key={String(settingsLoaded)} />
      <p className="hint">{PRIVACY_NOTE}</p>
    </section>
  );
}

/** Settings of the download. Remounted (by key) once the stored settings have been read. */
function SettingsForm() {
  const { settings, settingsError, saveSettings } = useApp();
  const uid = useId();
  const [relay, setRelay] = useState(settings.relayUrl);
  const [auto, setAuto] = useState(settings.autoFetch);
  const [maxAge, setMaxAge] = useState(String(settings.maxAgeDays));
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsProblem, setSettingsProblem] = useState<string | null>(null);

  async function submitSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsNotice(null);
    const days = maxAge.trim() === '' ? Number.NaN : Number(maxAge);
    const r = await saveSettings({ relayUrl: relay.trim(), autoFetch: auto, maxAgeDays: days });
    if (!r.ok) {
      setSettingsProblem(`Nicht gespeichert. ${describeFailure(r.reason, r.where)}`);
      return;
    }
    setSettingsProblem(null);
    setSettingsNotice('Einstellungen gespeichert.');
  }

  return (
    <>
      <h3>Einstellungen zum Abruf</h3>
      {settingsError !== null && (
        <p role="alert">
          Die gespeicherten Einstellungen sind nicht lesbar ({describeFailure(settingsError)}); es
          gelten die Standardwerte, bis Sie neu speichern.
        </p>
      )}
      <form onSubmit={(e) => void submitSettings(e)} noValidate>
        <p className="field">
          <label htmlFor={`${uid}-relay`}>Relay-Adresse (leer = Abruf aus)</label>
          <input
            id={`${uid}-relay`}
            type="text"
            inputMode="url"
            value={relay}
            placeholder="https://…"
            onChange={(e) => setRelay(e.target.value)}
          />
        </p>
        <p className="field">
          <span>
            <input
              id={`${uid}-auto`}
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />{' '}
            <label htmlFor={`${uid}-auto`}>
              Beim Start abrufen, wenn die Liste veraltet ist (Standard: aus)
            </label>
          </span>
        </p>
        <p className="field">
          <label htmlFor={`${uid}-age`}>
            Höchstalter der Liste in Tagen (1 bis 365; Startvorschlag 7, kein Gesetz)
          </label>
          <input
            id={`${uid}-age`}
            type="number"
            inputMode="numeric"
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
          />
        </p>
        {settingsProblem !== null && <p role="alert">{settingsProblem}</p>}
        {settingsNotice !== null && <p role="status">{settingsNotice}</p>}
        <p>
          <button type="submit">Einstellungen speichern</button>
        </p>
      </form>
    </>
  );
}
