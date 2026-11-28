import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of ['index.html', 'app.css', 'sw.js', 'manifest.webmanifest']) {
  await cp(new URL(file, root), new URL(file, dist));
}

for (const directory of ['src', 'icons']) {
  await cp(new URL(`${directory}/`, root), new URL(`${directory}/`, dist), { recursive: true });
}

await writeFile(new URL('.nojekyll', dist), '');
console.log('Static PWA build created in dist/.');
