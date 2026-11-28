import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');

test('PWA manifest is valid and icons exist',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.equal(manifest.display,'standalone');assert.equal(manifest.lang,'fa');assert.equal(manifest.dir,'rtl');
 for(const icon of manifest.icons)assert.ok(fs.existsSync(new URL(icon.src,root)),`missing ${icon.src}`);
});
test('offline shell precache list refers to committed assets',()=>{
 const js=read('sw.js');const match=js.match(/const SHELL=\[([^\]]+)\]/);assert.ok(match);
 const assets=[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
 for(const rel of assets){const safe=rel.startsWith('./')?rel.slice(2):rel;if(!safe)continue;assert.ok(fs.existsSync(new URL(safe,root)),`offline resource ${rel} missing`);}
});
test('no network calls or remote SDKs included in HTML shell',()=>{
 const html=read('index.html');assert.ok(html.includes('lang="fa" dir="rtl"'));assert.ok(!/<script[^>]*src="https?:\/\//i.test(html));
});
