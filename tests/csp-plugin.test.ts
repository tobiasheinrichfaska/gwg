import { createHash } from 'node:crypto';
import { applyCsp, cspFor, inlineScriptHashes } from '../tools/csp-plugin.ts';

const sha = (s: string) => 'sha256-' + createHash('sha256').update(s).digest('base64');

const PAGE = (body: string) =>
  `<html><head><meta http-equiv="Content-Security-Policy" content="loose" /></head><body>${body}</body></html>`;

describe('CSP plugin', () => {
  it('hashes the content of every inline script and skips external ones', () => {
    const html = PAGE(
      '<script type="module">console.log(1)</script><script src="x.js"></script><script>a()</script>',
    );
    expect(inlineScriptHashes(html)).toEqual([sha('console.log(1)'), sha('a()')]);
  });

  it('known value: sha256 of "alert(1)"', () => {
    expect(inlineScriptHashes(PAGE('<script>alert(1)</script>'))).toEqual([
      'sha256-' + 'bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI=',
    ]);
  });

  it('puts the hashes into the meta tag, without unsafe-inline for scripts', () => {
    const out = applyCsp(PAGE('<script type="module">x=1</script>'));
    expect(out).toContain(`script-src '${sha('x=1')}'`);
    expect(out).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(out).not.toContain('content="loose"');
    expect(out).toContain("default-src 'none'");
    expect(out).toContain('connect-src https: http://localhost:* http://127.0.0.1:*');
    expect(out).toContain("base-uri 'none'; form-action 'none'");
    expect(out).toContain('<script type="module">x=1</script>');
  });

  it('scripts are off without any inline script', () => {
    expect(cspFor([])).toContain("script-src 'none'");
  });

  it('refuses a page without the meta tag (so a build never ships without a policy)', () => {
    expect(() => applyCsp('<html><head></head></html>')).toThrow(/Content-Security-Policy/);
  });
});
