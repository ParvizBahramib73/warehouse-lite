import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLES,readAll,addRecord,updateProduct,addPurchase,addSale,addPayment,addBulkProducts,replaceAll,setChequeStatus} from '../src/data.js';
import {encryptBackup,decryptBackup,validateSnapshot} from '../src/backup.js';
import {tehranDate} from '../src/domain.js';

// Browser-free IndexedDB transaction harness: checks business data flows and atomic
// abort semantics, but DOES NOT replace a real-browser/device IndexedDB test.
import {MemoryDb} from './helpers/memory-db.mjs';
const datePlus=days=>new Date(Date.parse(`${tehranDate()}T00:00:00Z`)+days*86400000).toISOString().slice(0,10);

test('purchase lots, custom replacement pricing, sale snapshots, expiry and collection integrate atomically',async()=>{
  const db=new MemoryDb();
  const supplier=await addRecord(db,'suppliers',{name:'تأمین‌کننده تستی'});
  const customer=await addRecord(db,'customers',{name:'مشتری تستی'});
  const p=await addRecord(db,'products',{name:'روغن',kind:'gram',unitConfigs:{pack:5000,carton:20000,can:16000},replacementPrice:15000000,salePrice:16500000});
  const old=await addPurchase(db,{supplierId:supplier.id,productId:p.id,unit:'kg',quantity:'3',unitPrice:'10000000',expiryDate:datePlus(-1),paymentKind:'cash'});
  const fresh=await addPurchase(db,{supplierId:supplier.id,productId:p.id,unit:'kg',quantity:'10',unitPrice:'10000000',expiryDate:datePlus(30),paymentKind:'check',chequeNo:'000122',chequeDueDate:datePlus(5)});
  assert.ok(old&&fresh);
  const initial=await readAll(db);
  assert.equal(initial.products[0].stockBase,13000);
  assert.equal(initial.products[0].replacementPrice,15000000); // purchase did not overwrite Ali's manual replacement
  assert.equal(initial.cheques.length,1);
  const sale=await addSale(db,{customerId:customer.id,lines:[{productId:p.id,unit:'kg',quantity:'8',unitPrice:'16500000'}],paidAmount:'30000000',paymentMethod:'transfer',dueDate:datePlus(12)});
  assert.equal(sale.total,132000000);assert.equal(sale.replacementCost,120000000);assert.equal(sale.replacementProfit,12000000);
  assert.equal(sale.acquisitionCost,80000000);assert.equal(sale.acquisitionProfit,52000000);
  assert.equal(sale.allocations.length,1);assert.equal(sale.allocations[0].purchaseId,fresh);
  let snapshot=await readAll(db);assert.equal(snapshot.products[0].stockBase,5000);
  assert.equal(snapshot.payments[0].amount,30000000);
  assert.equal(snapshot.purchases.find(x=>x.id===old).remainingBase,3000);
  assert.equal(snapshot.purchases.find(x=>x.id===fresh).remainingBase,2000);
  assert.deepEqual(validateSnapshot({...snapshot,schemaVersion:2,currency:'IRR'}).sales,1);
  const afterBefore=structuredClone(snapshot);
  await assert.rejects(()=>addSale(db,{customerId:customer.id,lines:[{productId:p.id,unit:'kg',quantity:'3',unitPrice:'16500000'}],paidAmount:'0'}),/قابل فروش/);
  snapshot=await readAll(db);assert.deepEqual(snapshot,afterBefore,'failed sale must not corrupt stock');
  await addPayment(db,{customerId:customer.id,saleId:sale.id,amount:'10000000',method:'cash'});
  await setChequeStatus(db,snapshot.cheques[0].id,'paid');
  snapshot=await readAll(db);
  assert.equal(snapshot.payments.length,2);assert.equal(snapshot.cheques[0].status,'paid');
  const wrapper=await encryptBackup({...snapshot,schemaVersion:2,currency:'IRR'},'testing123456');
  const validated=await decryptBackup(wrapper,'testing123456');
  assert.equal(validated.sales[0].replacementProfit,12000000);
  await assert.rejects(()=>replaceAll(db,{...validated,products:[{...validated.products[0],stockBase:999}]}),/مطابقت ندارد/);
  assert.deepEqual(await readAll(db),snapshot,'invalid restore must not mutate any table');
  await replaceAll(db,validated);
  assert.deepEqual(await readAll(db),snapshot,'full validated preview restore round trip');
  assert.equal((await updateProduct(db,{id:p.id,replacementPrice:18000000,salePrice:19800000})).replacementPrice,18000000);
  snapshot=await readAll(db);assert.equal(snapshot.sales[0].replacementProfit,12000000,'historical replacement-cost snapshot is immutable');
  assert.equal(snapshot.priceHistory.length,1);
});

test('bulk import accepts zero kilogram stock and respects user-defined margin',async()=>{
  const db=new MemoryDb();
  await addBulkProducts(db,[{name:'روغن بدون موجودی',kind:'gram',stock:'0.000',replacementPrice:'15000000',lastBuyPrice:'10000000'},
    {name:'قالب افتتاحیه',kind:'piece',stock:'5',replacementPrice:'70000',lastBuyPrice:'50000',expiryDate:datePlus(40)}],1200);
  const snapshot=await readAll(db);
  assert.equal(snapshot.products[0].salePrice,16800000);
  assert.equal(snapshot.products[0].stockBase,0);
  assert.equal(snapshot.products[1].salePrice,78400);
  assert.equal(snapshot.purchases.length,1);
  assert.equal(snapshot.purchases[0].paymentKind,'opening');
  assert.equal(snapshot.movements.length,1);
  assert.ok(validateSnapshot({...snapshot,schemaVersion:2,currency:'IRR'}));
  await assert.rejects(()=>addBulkProducts(db,[{name:'قالب افتتاحیه',kind:'piece',stock:'1',replacementPrice:'100',lastBuyPrice:'50'}]),/تکراری/);
  assert.equal((await readAll(db)).products.length,2);
});
