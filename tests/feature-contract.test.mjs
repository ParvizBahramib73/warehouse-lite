import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('creator link exists only in Settings > Support, never global sidebar or footer',()=>{
 const app=read('src/app.js');
 assert.match(app,/\['support','پشتیبانی'\]/);
 assert.match(app,/if\(sub==='support'\)return card\('پشتیبانی/);
 assert.equal((app.match(/href="\$\{creatorUrl\}"/g)||[]).length,1);
 assert.doesNotMatch(app,/creator-inline|<footer class="app-creator"/);
});
test('purchase expiry remains per supplier lot, and app exposes the same Persian calendar',()=>{
 const data=read('src/data.js'),app=read('src/app.js');
 assert.match(data,/const row=\{id,createdAt:now,productId:p\.id,productName:p\.name,supplierId:s\.id/);
 assert.match(data,/remainingBase:qty\.base,unitPrice,total,paymentKind,expiryDate/);
 assert.match(app,/تاریخ انقضای همین سری خرید/);
 assert.match(app,/parseJalaliDate/);
});
test('multi-word autocomplete, consecutive multi-line action and keyboard selection survive build',()=>{
 const app=read('src/app.js');
 assert.match(app,/terms\.every\(t=>hay\.includes\(t\)\)/);
 assert.match(app,/افزودن قلم بعدی \(چند قلم\)/);
 assert.match(app,/\[data-product-query\]/);
 assert.match(app,/row\?\.focus\(\)/);
 assert.match(app,/e\.key==='ArrowDown'/);
});
test('invoice lists, domain, backup, offline shell, and DB migration are return-aware',()=>{
 const app=read('src/app.js'),data=read('src/data.js'),backup=read('src/backup.js'),sw=read('sw.js');
 assert.match(app,/\['returns','مرجوعی‌ها'\]/);
 assert.match(app,/data-return-open/);
 assert.match(app,/data-form="return"/);
 assert.match(app,/addSaleReturn\(db/);
 assert.match(data,/DB_VERSION=2/);
 assert.match(data,/'priceHistory','returns'/);
 assert.match(backup,/normalizeSnapshot/);
 assert.match(backup,/buildReturnPlan/);
 assert.match(sw,/src\/returns\.js/);
 assert.match(sw,/v022-/);
});
