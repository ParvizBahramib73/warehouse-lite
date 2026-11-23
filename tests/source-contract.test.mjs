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

test('responsive app shell includes page-specific layout and mobile brand',()=>{
 const app=read('src/app.js');const css=read('app.css');
 assert.ok(app.includes('class="layout page-${page}"'));
 assert.ok(app.includes('topbar-mobile-brand'));
 assert.ok(app.includes('class="page-content"'));
 assert.ok(app.includes('class="sale-checkout"'));
 assert.ok(css.includes('@media(max-width:760px)'));
 assert.ok(css.includes('env(safe-area-inset-bottom)'));
 assert.ok(css.includes('.sale-checkout{position:sticky'));
});
test('responsive UX styles cover dashboard, lists, forms, dialogs and navigation',()=>{
 const css=read('app.css');
 for(const token of ['.welcome-card','.stat{','.quick{','.data-table','.line-form','.list-row','.modal-card','.mobile-nav','.app-footer'])assert.ok(css.includes(token),token);
});

test('customer account statement and follow-up insights are wired into the app',()=>{
 const app=read('src/app.js');
 const sw=read('sw.js');
 const insights=read('src/customer-insights.js');
 assert.ok(app.includes("from './customer-insights.js'"));
 assert.ok(app.includes('function customerStatementModal()'));
 assert.ok(app.includes('data-customer-statement'));
 assert.ok(app.includes("listSearch('customers'"));
 assert.ok(app.includes('مشتریان نیازمند پیگیری'));
 assert.ok(sw.includes('./src/customer-insights.js'));
 assert.ok(insights.includes('buildCustomerStatement'));
 assert.ok(insights.includes('getCustomerFollowups'));
});

test('desktop layout spans viewport and sidebar is anchored to the right edge',()=>{
 const css=read('app.css');
 assert.ok(css.includes('.layout{width:100%;max-width:none;margin:0}'));
 assert.ok(css.includes('.sidebar{position:sticky;top:0;right:0'));
 assert.ok(css.includes('@media(max-width:760px)'));
});

test('visit planner and profit reporting are included in the offline application shell',()=>{
 const app=read('src/app.js');
 const data=read('src/data.js');
 const sw=read('sw.js');
 const route=read('src/route-planning.js');
 const profit=read('src/profit-report.js');
 const costing=read('src/costing.js');
 assert.ok(app.includes("from './route-planning.js'"));
 assert.ok(app.includes("from './profit-report.js'"));
 assert.ok(app.includes('function visitsPage()'));
 assert.ok(app.includes('function profitPage()'));
 assert.ok(app.includes('data-form="visit"'));
 assert.ok(app.includes('data-profit-from'));
 assert.ok(data.includes('export const DB_VERSION = 2'));
 assert.ok(data.includes("'visits'"));
 assert.ok(data.includes('export async function saveVisit'));
 assert.ok(data.includes('snapshotSaleLines(normalized,purchases,now)'));
 for(const file of ['./src/costing.js','./src/route-planning.js','./src/profit-report.js'])assert.ok(sw.includes(file));
 assert.ok(route.includes('groupRoutePlan'));
 assert.ok(profit.includes('buildProfitReport'));
 assert.ok(costing.includes('weightedPurchaseCost'));
});

test('large lists use bounded page rendering, search and IndexedDB indexes',()=>{
 const app=read('src/app.js');
 const data=read('src/data.js');
 const css=read('app.css');
 assert.ok(app.includes('const PAGE_SIZE=25'));
 for(const key of ['products','purchases','suppliers','sales','customers'])assert.ok(app.includes("pager('"+key+"'"));
 assert.ok(app.includes('data-visit-page'));
 assert.ok(app.includes('data-profit-page'));
 assert.ok(data.includes("'byCustomerDate'"));
 assert.ok(data.includes("'byCreatedAt'"));
 assert.ok(css.includes('.pagination'));
 assert.ok(css.includes('.route-cards'));
});
