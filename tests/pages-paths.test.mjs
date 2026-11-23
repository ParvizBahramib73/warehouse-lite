import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('GitHub Pages assets use relative paths for project-site subpaths', () => {
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /href="\.\/app\.css"/);
  assert.match(html, /src="\.\/src\/app\.js"/);
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.match(sw, /'\.\/index\.html'/);
  assert.match(app, /serviceWorker\.register\('\.\/sw\.js'/);
});

test('manifest defines Persian RTL standalone PWA metadata', () => {
  assert.equal(manifest.lang, 'fa');
  assert.equal(manifest.dir, 'rtl');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.icons.length >= 2, true);
});
