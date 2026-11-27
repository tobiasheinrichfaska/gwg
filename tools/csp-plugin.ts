import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Content-Security-Policy of the BUILT file (`dist/index.html`), set as a `<meta http-equiv>` because the
 * file runs from `file://` and has no server that could send a header.
 *
 * - Scripts: only the inline scripts of the build, each by its sha256 hash (no `'unsafe-inline'`).
 * - Connections: https only (the optional sanctions-list download through the relay), plus loopback http
 *   so a local test relay works. Everything else (images, fonts, frames, workers, objects, forms) is off.
 * - Styles: `'unsafe-inline'` (the single-file build inlines its CSS; React sets `style` attributes).
 *
 * The meta tag in the source `index.html` (used by `vite dev`) is looser on purpose: hot reload needs
 * inline scripts and a websocket. The build replaces it.
 */
export function cspFor(scriptHashes: readonly string[]): string {
  const scripts =
    scriptHashes.length === 0 ? "'none'" : scriptHashes.map((h) => `'${h}'`).join(' ');
  return [
    "default-src 'none'",
    `script-src ${scripts}`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    'connect-src https: http://localhost:* http://127.0.0.1:*',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** `sha256-<base64>` over the text of every inline `<script>` (those without `src`), in order. */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1] ?? '')) continue;
    out.push(
      'sha256-' +
        createHash('sha256')
          .update(m[2] ?? '', 'utf8')
          .digest('base64'),
    );
  }
  return out;
}

const META = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i;

/** Replaces the CSP meta tag of `html` by the strict one for its inline scripts. Throws without a meta tag. */
export function applyCsp(html: string): string {
  if (!META.test(html)) throw new Error('csp: index.html has no Content-Security-Policy meta tag');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${cspFor(inlineScriptHashes(html))}" />`;
  return html.replace(META, () => meta);
}

export function cspPlugin(): Plugin {
  return {
    name: 'gwg-csp',
    apply: 'build',
    enforce: 'post',
    // After vite-plugin-singlefile has inlined the script (list this plugin after it).
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const page = bundle['index.html'];
        if (page?.type !== 'asset' || typeof page.source !== 'string') {
          throw new Error('csp: index.html asset not found in the bundle');
        }
        page.source = applyCsp(page.source);
      },
    },
  };
}
