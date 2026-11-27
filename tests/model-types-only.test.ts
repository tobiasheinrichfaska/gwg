import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) ? [p.replaceAll('\\', '/')] : [];
  });
}

/** Import statements (single or multi line) whose path ends in mandate/model(.ts), without `import type`. */
export function valueImportsOfModel(code: string): string[] {
  const found = code.match(
    /import\s+(?!type\b)[^;]*?from\s+['"][^'"]*mandate\/model(?:\.ts)?['"]/gs,
  );
  return found ?? [];
}

describe('mandate/model is types only outside mandate/', () => {
  it('detects a value import (self-check)', () => {
    expect(valueImportsOfModel("import { ok } from '../mandate/model.ts';")).toHaveLength(1);
    expect(valueImportsOfModel("import type { Mandate } from '../mandate/model.ts';")).toHaveLength(
      0,
    );
    expect(valueImportsOfModel("import {\n  a,\n} from '../mandate/model';")).toHaveLength(1);
  });

  it('has no value import from mandate/model in src or tests outside src/logic/mandate', () => {
    const offenders = [...sources('src'), ...sources('tests'), ...sources('relay')]
      .filter((f) => !f.startsWith('src/logic/mandate/') && f !== 'tests/model-types-only.test.ts')
      .filter((f) => valueImportsOfModel(readFileSync(f, 'utf8')).length > 0);
    expect(offenders).toEqual([]);
  });
});
