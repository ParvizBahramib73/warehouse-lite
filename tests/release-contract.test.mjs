import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const get=file=>readFileSync(new URL(file,root),'utf8');

test('all browser date inputs are replaced by Jalali UI and ISO field storage',()=>{
 const app=get('src/app.js');
 assert.match(app,/if\(opts\.type==='date'\)/);
 assert.match(app,/data-jalali-input/);
 assert.match(app,/data-date-iso/);
 assert.match(app,/parseJalaliDate\(textInput\.value\)/);
 assert.match(app,/dateControl|jalali-date-field/);
 assert.doesNotMatch(app,/<input type="date"/);
});
test('UI formats monetary inputs with Latin grouping and keeps default zero focus behavior',()=>{
 const app=get('src/app.js');
 assert.match(app,/const moneyFields=new Set/);
 assert.match(app,/isMoney\?'data-money-input dir="ltr" lang="en"/);
 assert.match(app,/formatRialInput\(previous\)/);
 assert.match(app,/digitsBeforeCaret\(previous/);
 assert.match(app,/data-zero-clear/);
});
test('Creator identity is visible and links to the confirmed personal website',()=>{
 const app=get('src/app.js'),html=get('index.html');
 assert.match(app,/پرویز بهرامی \| Parviz Bahrami/);
 assert.match(app,/https:\/\/parvizbahramib73\.github\.io\/personal-brand-website\//);
 assert.match(app,/rel="noopener noreferrer"/);
 assert.doesNotMatch(html,/نسخه آزمایشی/);
});
test('Main app uses distinct IRR store and preserves root PWA identity',()=>{
 const data=get('src/data.js'),backup=get('src/backup.js'),manifest=JSON.parse(get('manifest.webmanifest'));
 assert.match(data,/DB_NAME='warehouse-lite-v02-irr'/);
 assert.match(backup,/FORMAT='warehouse-lite-preview-2026-encrypted'/);
 assert.equal(manifest.id,'./');
});

test('service worker removes legacy root cache and isolates v0.2 responses from old caches',()=>{
 const sw=get('sw.js');
 assert.match(sw,/LEGACY_PREFIX = 'warehouse-lite-shell-v'/);
 assert.match(sw,/caches.open\(CACHE\)\.then\(cache => cache.match\(event\.request\)/);
 assert.doesNotMatch(sw,/caches.match\(event\.request\)/);
 assert.match(sw,/!url\.pathname\.startsWith\(SCOPE_PATH\)/);
});
