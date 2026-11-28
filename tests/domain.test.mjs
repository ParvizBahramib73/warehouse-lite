import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDigits,asDecimalMilli,asInteger,parseBaseQuantity,lineTotal,validateSaleLines,customerBalance,calcSuggestedPrice,defaultUnitPrice,inventoryValues,valueForQuantity,invoiceOutstanding,INVOICE_CUSTODY_NOTICE,validDate} from '../src/domain.js';
import {encryptBackup,decryptBackup,validateSnapshot} from '../src/backup.js';

const oil={id:'p1',name:'روغن قنادی',kind:'gram',packBase:5000,unitConfigs:{pack:5000,carton:20000,can:16000},stockBase:15000,lowBase:2000,lastBuyPrice:1000000,replacementPrice:1500000,salePrice:1650000};
const carton={id:'p2',name:'کارتن نمونه',kind:'piece',packBase:12,unitConfigs:{pack:12,carton:144},stockBase:20,lowBase:2,lastBuyPrice:50000,replacementPrice:70000,salePrice:77000};
function snapshot(){return {schemaVersion:2,currency:'IRR',products:[{...oil}],customers:[{id:'c1',name:'قنادی نمونه'}],suppliers:[{id:'s1',name:'تأمین‌کننده نمونه'}],purchases:[{id:'b1',productId:'p1',supplierId:'s1',unit:'kg',quantity:'15',quantityBase:15000,remainingBase:15000,unitPrice:1000000,total:15000000}],sales:[],payments:[],movements:[{id:'m1',productId:'p1',deltaBase:15000}],cheques:[],settings:[],priceHistory:[]};}
test('normalizes Persian numbers and rejects negative/unsafe rial amounts',()=>{
 assert.equal(normalizeDigits('۱٬۲۳۴٫۵'),'1234.5');assert.equal(normalizeDigits('١٢٣'),'123');assert.equal(asDecimalMilli('۲٫۵'),2500);
 assert.throws(()=>asInteger('-10'));assert.throws(()=>asInteger('9007199254740992'));
});
test('supports kilogram, piece, pack, carton and can with base inventory precision',()=>{
 assert.deepEqual(parseBaseQuantity(oil,'kg','۱٫۲۵'),{base:1250,thousandths:1250});
 assert.deepEqual(parseBaseQuantity(oil,'pack','۲'),{base:10000,thousandths:2000});
 assert.deepEqual(parseBaseQuantity(oil,'can','۱'),{base:16000,thousandths:1000});
 assert.deepEqual(parseBaseQuantity(carton,'carton','۲'),{base:288,thousandths:2000});
 assert.throws(()=>parseBaseQuantity(carton,'piece','1.2'));
});
test('uses replacement cost and 10 percent recommended markup with exact rial math',()=>{
 assert.equal(calcSuggestedPrice(1500000),1650000);
 assert.equal(defaultUnitPrice(oil,'kg'),1650000);
 assert.equal(defaultUnitPrice(oil,'pack'),8250000);
 assert.equal(defaultUnitPrice(oil,'carton'),33000000);
 assert.equal(lineTotal(1650000,2500),4125000);
 assert.equal(valueForQuantity(oil,1500000,2500),3750000);
 const result=validateSaleLines([{productId:'p1',unit:'kg',quantity:'2.5',unitPrice:'1650000'}],[oil]);
 assert.equal(result.total,4125000);assert.equal(result.replacementCost,3750000);assert.equal(result.replacementProfit,375000);
 const values=inventoryValues([oil],snapshot().purchases);
 assert.deepEqual(values,{purchase:15000000,replacement:22500000,sale:24750000});
});
test('rejects overselling across duplicate items',()=>{
 assert.throws(()=>validateSaleLines([{productId:'p1',unit:'kg',quantity:'10',unitPrice:'2000000'},{productId:'p1',unit:'kg',quantity:'6',unitPrice:'2000000'}],[oil]),/کافی نیست/);
});
test('calculates debts and linked invoice amount separately',()=>{
 const sales=[{id:'s1',customerId:'c1',total:100000},{id:'s2',customerId:'c1',total:50000}];
 const payments=[{customerId:'c1',saleId:'s1',amount:70000},{customerId:'c1',saleId:null,amount:40000}];
 assert.equal(customerBalance('c1',sales,payments),40000);
 assert.equal(invoiceOutstanding(sales[0],payments),30000);
});
test('requires valid expiration date',()=>{
 assert.equal(validDate('2027-01-31'),'2027-01-31');assert.throws(()=>validDate('2027-02-31'));
});
test('backup encrypts IRR preview only and rejects corruption and legacy toman snapshot',async()=>{
 const snap=snapshot();assert.ok(validateSnapshot(snap));assert.match(INVOICE_CUSTODY_NOTICE,/تسویه کامل/);
 const b=await encryptBackup(snap,'passphrase-long');assert.equal(b.formatVersion,3);assert.equal(b.format,'warehouse-lite-preview-2026-encrypted');
 assert.deepEqual((await decryptBackup(b,'passphrase-long')).products,snap.products);
 await assert.rejects(()=>decryptBackup(b,'bad-password'));await assert.rejects(()=>decryptBackup({...b,ciphertext:b.ciphertext.slice(0,-4)+'AAAA'},'passphrase-long'));
 assert.throws(()=>validateSnapshot({...snap,schemaVersion:1,currency:'IRT'}),/پشتیبان/);
});
test('validates lot stock and recorded financial relationships before restore',()=>{
 const snap=snapshot();
 assert.throws(()=>validateSnapshot({...snap,products:[{...oil,stockBase:12000}]}),/مطابقت ندارد/);
 assert.throws(()=>validateSnapshot({...snap,purchases:[{...snap.purchases[0],remainingBase:20000}]}),/خرید/);
 const badSale={id:'sale1',customerId:'c1',total:2000,replacementCost:500,replacementProfit:1500,acquisitionCost:300,acquisitionProfit:1700,allocations:[{purchaseId:'b1',productId:'p1',quantityBase:1000,acquisitionCost:300}],lines:[{productId:'p1',unit:'kg',quantity:'1',unitPrice:1200,amount:1200,replacementCost:500,quantityBase:1000}]};
 assert.throws(()=>validateSnapshot({...snap,sales:[badSale]}),/مبلغ|جمع فاکتور/);
 assert.throws(()=>validateSnapshot({...snap,cheques:[{id:'cheque1',supplierId:'missing',number:'100',amount:2000,status:'pending'}]}),/چک/);
});
