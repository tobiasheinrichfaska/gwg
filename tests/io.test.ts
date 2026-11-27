import { createVault, memoryEnvironment, type Vault } from 'local-vault';
import {
  BACKUP_WARNING,
  backupFileName,
  createMemoryStore,
  createVaultStore,
  readBackupFile,
} from '../src/io/index.ts';
import { DEFAULT_RULES, serializeBackup, type Backup } from '../src/logic/index.ts';
import { mandate } from './helpers.ts';

const backup = (): Backup => ({
  format: 'gwg-backup',
  version: 3,
  createdOn: '2026-11-27',
  rules: DEFAULT_RULES,
  mandates: [mandate({ id: '10002', name: 'Zweite GmbH' }), mandate({ id: '10001' })],
  persons: [],
  auditClosings: [],
  screeningDecisions: [],
  lastScreening: { sanktion: null, pep: null },
});

describe('memory store', () => {
  it('is empty at first, then round-trips', async () => {
    const s = createMemoryStore();
    expect(await s.load()).toEqual({ ok: true, value: null });
    const b = backup();
    expect((await s.save(b)).ok).toBe(true);
    const r = await s.load();
    expect(r.ok && r.value && serializeBackup(r.value)).toBe(serializeBackup(b));
  });
  it('reports damaged content as an error code, never as empty', async () => {
    const r = await createMemoryStore('{"format":').load();
    expect(r).toMatchObject({ ok: false, reason: 'bad-backup' });
  });
});

describe('vault store', () => {
  const open = async (): Promise<Vault> => {
    const v = createVault({ prefix: 'gwg', slots: ['bestand'] }, memoryEnvironment());
    expect((await v.startVault()).kind).toBe('open');
    return v;
  };

  it('round-trips and stores exactly the serialized text', async () => {
    const v = await open();
    const s = createVaultStore(v);
    expect(await s.load()).toEqual({ ok: true, value: null });
    const b = backup();
    expect((await s.save(b)).ok).toBe(true);
    expect(v.readSlot('bestand')).toBe(serializeBackup(b));
    const r = await s.load();
    expect(r.ok && r.value && serializeBackup(r.value)).toBe(serializeBackup(b));
  });
  it('reports damaged slot content as bad-backup', async () => {
    const v = await open();
    expect(v.writeSlot('bestand', 'kaputt')).toBeUndefined();
    expect(await createVaultStore(v).load()).toMatchObject({ ok: false, reason: 'bad-backup' });
  });
  it('reports a read failure as store-failed (unreadable or closed vault)', async () => {
    const v = createVault({ prefix: 'gwg', slots: ['bestand'] }, memoryEnvironment());
    expect(await createVaultStore(v).load()).toMatchObject({ ok: false, reason: 'store-failed' });
  });
  it('reports a refused write and a late storage error as store-failed', async () => {
    const v = await open();
    const refusing: Vault = { ...v, writeSlot: () => 'refused' };
    expect(await createVaultStore(refusing).save(backup())).toMatchObject({
      ok: false,
      reason: 'store-failed',
    });
    let listener: ((e: string) => void) | undefined;
    const late: Vault = {
      ...v,
      writeSlot: () => undefined,
      onError: (fn) => {
        listener = fn;
        return () => undefined;
      },
      saved: () => {
        listener?.('quota');
        return Promise.resolve();
      },
    };
    expect(await createVaultStore(late).save(backup())).toMatchObject({
      ok: false,
      reason: 'store-failed',
    });
  });
});

describe('backup files', () => {
  it('names the file by day', () => {
    expect(backupFileName('2026-11-27')).toBe('gwg-sicherung-2026-11-27.gwg.json');
  });
  it('warns in German about the missing encryption', () => {
    expect(BACKUP_WARNING).toMatch(/nicht verschlüsselt/);
    expect(BACKUP_WARNING).toMatch(/Mandanten/);
    expect(BACKUP_WARNING).toMatch(/E-Mail/);
  });
  it('reads a file as text', async () => {
    const f = new File(['{"a":1}'], 'x.gwg.json');
    expect(await readBackupFile(f)).toEqual({ ok: true, value: '{"a":1}' });
  });
  it('refuses an oversized file without reading it', async () => {
    const f = new File(['0123456789'], 'x.gwg.json');
    expect(await readBackupFile(f, 5)).toMatchObject({ ok: false, reason: 'file-too-large' });
    expect((await readBackupFile(f, 10)).ok).toBe(true);
  });
  it('maps a read error to bad-backup', async () => {
    const broken = { size: 1, text: () => Promise.reject(new Error('x')) } as unknown as File;
    expect(await readBackupFile(broken)).toMatchObject({ ok: false, reason: 'bad-backup' });
  });
});
