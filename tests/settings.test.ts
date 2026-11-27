// @vitest-environment jsdom
import { createVault, memoryEnvironment } from 'local-vault';
import {
  createMemorySettingsStore,
  createVaultSettingsStore,
  createVaultStore,
  SETTINGS_SLOT,
  VAULT_SLOT,
} from '../src/io/index.ts';
import {
  checkListSettings,
  DEFAULT_LIST_SETTINGS,
  isListStale,
  listAgeDays,
  parseSettings,
  type ListIndex,
} from '../src/logic/index.ts';

const good = { relayUrl: 'https://relay.example/x', autoFetch: false, maxAgeDays: 7 };
const bad = (v: unknown) =>
  expect(checkListSettings(v)).toMatchObject({ ok: false, reason: 'bad-settings' });

describe('checkListSettings', () => {
  it('has the defaults: off, no auto fetch, 7 days', () => {
    expect(DEFAULT_LIST_SETTINGS).toEqual({ relayUrl: '', autoFetch: false, maxAgeDays: 7 });
    expect(checkListSettings(DEFAULT_LIST_SETTINGS).ok).toBe(true);
  });
  it('accepts an empty address, https, and http only for localhost', () => {
    for (const relayUrl of [
      '',
      'https://relay.example',
      'https://relay.example/a/b/',
      'http://localhost:8787',
      'http://127.0.0.1:8787/x',
    ]) {
      expect(checkListSettings({ ...good, relayUrl }).ok).toBe(true);
    }
  });
  it('refuses other addresses', () => {
    for (const relayUrl of [
      'http://relay.example',
      'ftp://relay.example',
      'relay.example',
      'https://relay.example/?a=1',
      'https://relay.example?',
      'https://relay.example/#x',
      'https://user:pw@relay.example',
      'https://relay .example',
      'javascript:alert(1)',
    ]) {
      bad({ ...good, relayUrl });
    }
  });
  it('limits the age to whole days from 1 to 365', () => {
    expect(checkListSettings({ ...good, maxAgeDays: 1 }).ok).toBe(true);
    expect(checkListSettings({ ...good, maxAgeDays: 365 }).ok).toBe(true);
    for (const maxAgeDays of [0, 366, 1.5, -1, NaN, '7']) bad({ ...good, maxAgeDays });
  });
  it('is strict about shape and types', () => {
    bad(null);
    bad([]);
    bad({ ...good, extra: 1 });
    bad({ relayUrl: '', autoFetch: false });
    bad({ ...good, autoFetch: 'yes' });
    bad({ ...good, relayUrl: 5 });
    expect(parseSettings('kaputt')).toMatchObject({ ok: false, reason: 'bad-settings' });
  });
});

describe('settings store', () => {
  it('memory store gives defaults, round-trips and refuses invalid settings', async () => {
    const s = createMemorySettingsStore();
    expect(await s.load()).toEqual({ ok: true, value: DEFAULT_LIST_SETTINGS });
    expect((await s.save(good)).ok).toBe(true);
    expect(await s.load()).toEqual({ ok: true, value: good });
    expect(await s.save({ ...good, maxAgeDays: 0 })).toMatchObject({ ok: false });
    expect(await s.load()).toEqual({ ok: true, value: good });
  });
  it('vault store uses its own slot, apart from the data slot', async () => {
    const v = createVault(
      { prefix: 'gwg', slots: [VAULT_SLOT, SETTINGS_SLOT] },
      memoryEnvironment(),
    );
    await v.startVault();
    const s = createVaultSettingsStore(v);
    expect(await s.load()).toEqual({ ok: true, value: DEFAULT_LIST_SETTINGS });
    expect((await s.save(good)).ok).toBe(true);
    expect(v.readSlot(VAULT_SLOT)).toBeNull();
    expect(await s.load()).toEqual({ ok: true, value: good });
    expect(await createVaultStore(v).load()).toEqual({ ok: true, value: null });
  });
  it('vault store reports damage as bad-settings and a closed vault as store-failed', async () => {
    const v = createVault(
      { prefix: 'gwg', slots: [VAULT_SLOT, SETTINGS_SLOT] },
      memoryEnvironment(),
    );
    await v.startVault();
    v.writeSlot(SETTINGS_SLOT, '{"relayUrl":"http://evil.example"}');
    expect(await createVaultSettingsStore(v).load()).toMatchObject({
      ok: false,
      reason: 'bad-settings',
    });
    const closed = createVault({ prefix: 'gwg', slots: [SETTINGS_SLOT] }, memoryEnvironment());
    expect(await createVaultSettingsStore(closed).load()).toMatchObject({
      ok: false,
      reason: 'store-failed',
    });
  });
});

describe('list age', () => {
  const idx = (fetchedOn: ListIndex['fetchedOn']): ListIndex => ({
    source: 's',
    kind: 'sanktion',
    fetchedOn,
    entries: [],
  });
  it('counts whole days and never goes negative', () => {
    expect(listAgeDays('2026-11-20', '2026-11-20')).toBe(0);
    expect(listAgeDays('2026-11-20', '2026-11-27')).toBe(7);
    expect(listAgeDays('2026-11-28', '2026-11-27')).toBe(0);
  });
  it('treats no list as stale, a list older than the limit as stale, the limit itself as fresh', () => {
    expect(isListStale(null, '2026-11-27', 7)).toBe(true);
    expect(isListStale(idx('2026-11-20'), '2026-11-27', 7)).toBe(false);
    expect(isListStale(idx('2026-11-19'), '2026-11-27', 7)).toBe(true);
    expect(isListStale(idx('2026-11-27'), '2026-11-27', 1)).toBe(false);
  });
});
