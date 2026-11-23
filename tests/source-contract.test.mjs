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

test('master records expose safe edit, archive and guarded permanent delete actions',()=>{
 const app=read('src/app.js');
 const data=read('src/data.js');
 assert.ok(app.includes('data-edit-type'));
 assert.ok(app.includes('data-toggle-type'));
 assert.ok(app.includes('data-delete-type'));
 assert.ok(data.includes('export async function updateRecord'));
 assert.ok(data.includes('export async function setRecordActive'));
 assert.ok(data.includes('export async function deleteRecord'));
 assert.ok(data.includes('حذف دائمی مجاز نیست'));
});

test('financial documents use edit and reversal rather than hard deletion',()=>{
 const app=read('src/app.js');
 const data=read('src/data.js');
 for(const token of ['data-edit-purchase','data-void-purchase','data-edit-sale','data-void-sale','data-edit-payment','data-void-payment']) assert.ok(app.includes(token),token);
 for(const token of ['export async function updatePurchase','export async function voidPurchase','export async function updateSale','export async function voidSale','export async function updatePayment','export async function voidPayment']) assert.ok(data.includes(token),token);
 assert.ok(data.includes("status:'void'"));
 assert.ok(data.includes("sourceType:'sale-void'"));
 assert.ok(data.includes("sourceType:'purchase-void'"));
});

test('edit dialogs support safe document workflows and keep invoice customer fixed',()=>{
 const app=read('src/app.js');
 assert.ok(app.includes('data-form="edit-product"'));
 assert.ok(app.includes('data-form="edit-customer"'));
 assert.ok(app.includes('data-form="edit-supplier"'));
 assert.ok(app.includes('data-form="edit-purchase"'));
 assert.ok(app.includes('data-form="edit-sale"'));
 assert.ok(app.includes('data-form="edit-payment"'));
});

test('dashboard welcomes Ali and credits the creator with a safe personal-site link',()=>{
 const app=read('src/app.js');
 assert.ok(app.includes('سلام علی جان، خوش اومدی!'));
 assert.ok(app.includes('ساخته‌شده برای داداش علی'));
 assert.ok(app.includes('طراحی و توسعه:'));
 assert.ok(app.includes('https://parvizbahramib73.github.io/personal-brand-website'));
 assert.ok(app.includes('target="_blank"'));
 assert.ok(app.includes('rel="noopener noreferrer"'));
});

test('invoice share module is included in offline shell and app exposes share controls',()=>{
 const app=read('src/app.js');
 const sw=read('sw.js');
 const share=read('src/invoice-share.js');
 assert.ok(app.includes("from './invoice-share.js'"));
 assert.ok(app.includes('data-share-invoice'));
 assert.ok(app.includes('shareInvoiceFile'));
 assert.ok(sw.includes('./src/invoice-share.js'));
 assert.ok(share.includes('navigator.canShare({files:[file]})'));
 assert.ok(share.includes('navigator.share({files:[file]'));
 assert.ok(share.includes('علی‌فاکتور'));
});

test('creator credit says built for Ali and all monetary fields use grouped formatting',()=>{
 const app=read('src/app.js');
 const utils=read('src/utils.js');
 assert.ok(app.includes('ساخته‌شده برای داداش علی'));
 assert.ok((app.match(/data-money-input/g)||[]).length>=8);
 assert.ok(app.includes('formatMoneyField(event.target)'));
 assert.ok(app.includes("app.querySelectorAll('[data-money-input]')"));
 assert.ok(utils.includes('formatGroupedInteger'));
});

test('every monetary input including edit dialogs is wired to the formatter',()=>{
 const app=read('src/app.js');
 const tags=[...app.matchAll(/<input[^>]*>/g)].map(m=>m[0]);
 const priceFields=tags.filter(x=>/name="(salePrice|unitPrice|paidAmount|amount)"/.test(x));
 assert.equal(priceFields.length,8);
 for(const field of priceFields)assert.ok(field.includes('data-money-input'),field);
 assert.ok(app.includes("app.addEventListener('focusout'"));
 assert.ok(app.includes("app.addEventListener('change'"));
});
