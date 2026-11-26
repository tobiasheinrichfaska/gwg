import { ESLint } from 'eslint';

const eslint = new ESLint();

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.map((m) => m.ruleId ?? '');
}

describe('ESLint module boundaries', () => {
  it('forbids a deep import into another module (sanctions -> mandate/validate)', async () => {
    const ids = await ruleIds(
      'src/logic/sanctions/x.ts',
      "import { validateMandate } from '../mandate/validate.ts';\nexport const a = validateMandate;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('forbids core importing another module (core -> mandate)', async () => {
    const ids = await ruleIds(
      'src/logic/core/x.ts',
      "import { nextReviewDate } from '../mandate/index.ts';\nexport const a = nextReviewDate;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('forbids mandate importing audit (mandate -> audit)', async () => {
    const ids = await ruleIds(
      'src/logic/mandate/x.ts',
      "import { auditExceptions } from '../audit/index.ts';\nexport const a = auditExceptions;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('allows the module root and type imports from mandate/model', async () => {
    const ids = await ruleIds(
      'src/logic/sanctions/x.ts',
      "import type { SanctionClass } from '../mandate/model.ts';\nimport { nextReviewDate } from '../mandate/index.ts';\nexport const a: SanctionClass | undefined = undefined;\nexport const b = nextReviewDate;\n",
    );
    expect(ids).not.toContain('no-restricted-imports');
  });

  it('forbids a deep import into core (sanctions -> core/time)', async () => {
    const ids = await ruleIds(
      'src/logic/sanctions/x.ts',
      "import { isDateKey } from '../core/time.ts';\nexport const a = isDateKey;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('allows the core public entry (../core/index.ts and ../core)', async () => {
    for (const spec of ['../core/index.ts', '../core']) {
      const ids = await ruleIds(
        'src/logic/sanctions/x.ts',
        `import { isDateKey } from '${spec}';\nexport const a = isDateKey;\n`,
      );
      expect(ids).not.toContain('no-restricted-imports');
    }
  });

  it('still forbids React in logic (base rule kept)', async () => {
    const ids = await ruleIds('src/logic/core/x.ts', "import 'react';\n");
    expect(ids).toContain('no-restricted-imports');
  });
});

describe('ESLint module boundaries: tasks', () => {
  it.each(['mandate', 'audit', 'sanctions', 'core'])('forbids %s importing tasks', async (mod) => {
    const ids = await ruleIds(
      `src/logic/${mod}/x.ts`,
      "import { buildTasks } from '../tasks/index.ts';\nexport const a = buildTasks;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('forbids a deep import into tasks', async () => {
    const ids = await ruleIds(
      'src/logic/x.ts',
      "import { buildTasks } from './tasks/tasks.ts';\nexport const a = buildTasks;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });
});

describe('ESLint module boundaries: backup', () => {
  it.each(['mandate', 'audit', 'sanctions', 'tasks', 'core'])(
    'forbids %s importing backup',
    async (mod) => {
      const ids = await ruleIds(
        `src/logic/${mod}/x.ts`,
        "import { parseBackup } from '../backup/index.ts';\nexport const a = parseBackup;\n",
      );
      expect(ids).toContain('no-restricted-imports');
    },
  );

  it('forbids a deep import into backup', async () => {
    const ids = await ruleIds(
      'src/logic/x.ts',
      "import { parseBackup } from './backup/format.ts';\nexport const a = parseBackup;\n",
    );
    expect(ids).toContain('no-restricted-imports');
  });

  it('forbids backup deep imports into mandate and core, allows the roots', async () => {
    const deep = await ruleIds(
      'src/logic/backup/x.ts',
      "import { checkMandate } from '../mandate/validate.ts';\nexport const a = checkMandate;\n",
    );
    expect(deep).toContain('no-restricted-imports');
    const root = await ruleIds(
      'src/logic/backup/x.ts',
      "import { checkMandate } from '../mandate/index.ts';\nimport { isDateKey } from '../core/index.ts';\nexport const a = [checkMandate, isDateKey];\n",
    );
    expect(root).not.toContain('no-restricted-imports');
  });
});
