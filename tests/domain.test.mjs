import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDigits,asDecimalMilli,asInteger,parseBaseQuantity,lineTotal,validateSaleLines,customerBalance,money} from '../src/domain.js';
import {encryptBackup,decryptBackup,validateSnapshot} from '../src/backup.js';

const kg={id:'p1',name:'بادکا',kind:'gram',packBase:5000,stockBase:15000,lowBase:2000,salePrice:120000};
const pcs={id:'p2',name:'خامه',kind:'piece',packBase:12,stockBase:20,lowBase:2,salePrice:40000};
const snap={schemaVersion:1,products:[{...kg}],customers:[{id:'c1',name:'مشتری'}],suppliers:[{id:'s1',name:'تأمین‌کننده'}],purchases:[],sales:[],payments:[],movements:[{id:'m1',productId:'p1',deltaBase:15000}]};

test('normalizes Persian and Arabic numeral input',()=>{
 assert.equal(normalizeDigits('۱٬۲۳۴٫۵'),'1234.5');assert.equal(normalizeDigits('١٢٣'),'123');
 assert.equal(asDecimalMilli('۲٫۵'),2500);
});
test('uses exact integer base units for kilogram/pack/pieces',()=>{
 assert.deepEqual(parseBaseQuantity(kg,'kg','۱٫۲۵'),{base:1250,thousandths:1250});
 assert.deepEqual(parseBaseQuantity(kg,'pack','۲'),{base:10000,thousandths:2000});
 assert.deepEqual(parseBaseQuantity(pcs,'pack','۱'),{base:12,thousandths:1000});
 assert.throws(()=>parseBaseQuantity(pcs,'piece','1.2'));
 assert.throws(()=>parseBaseQuantity(kg,'kg','1.0009'));
});
test('rounds per line in whole toman, no floating currency',()=>{
 assert.equal(lineTotal(100000,1250),125000);
 assert.equal(lineTotal(101,500),51);
 assert.throws(()=>asInteger('-10'));
});
test('rejects overselling stock across duplicate lines',()=>{
 assert.throws(()=>validateSaleLines([{productId:'p1',unit:'kg',quantity:'10',unitPrice:'300'},{productId:'p1',unit:'kg',quantity:'6',unitPrice:'300'}],[kg]),/کافی نیست/);
 const x=validateSaleLines([{productId:'p1',unit:'kg',quantity:'2.5',unitPrice:'130000'},{productId:'p2',unit:'piece',quantity:'2',unitPrice:'45000'}],[kg,pcs]);
 assert.equal(x.total,415000);assert.equal(x.required.get('p1'),2500);
});
test('customer balance tracks sales minus settled payments',()=>{
 const s=[{customerId:'c1',total:100000},{customerId:'c1',total:50000}];
 const p=[{customerId:'c1',amount:110000}];
 assert.equal(customerBalance('c1',s,p),40000);
});
test('encrypt/decrypt roundtrip and rejects wrong password and tampering',async()=>{
 assert.ok(validateSnapshot(snap));
 const wrapper=await encryptBackup(snap,'passphrase-long');
 assert.equal(wrapper.format,'warehouse-lite-encrypted');
 assert.deepEqual((await decryptBackup(wrapper,'passphrase-long')).products,snap.products);
 await assert.rejects(()=>decryptBackup(wrapper,'bad-password'));
 const modified={...wrapper,ciphertext:wrapper.ciphertext.slice(0,-4)+'AAAA'};
 await assert.rejects(()=>decryptBackup(modified,'passphrase-long'));
});
test('backup validation rejects inconsistent stock',()=>{
 assert.throws(()=>validateSnapshot({...snap,products:[{...kg,stockBase:12000}]}),/مطابقت ندارند/);
});

test('customer balance ignores voided invoices and voided receipts',()=>{
 const sales=[
  {customerId:'c1',total:100000,status:'active'},
  {customerId:'c1',total:50000,status:'void'},
  {customerId:'c1',total:20000}
 ];
 const payments=[
  {customerId:'c1',amount:30000,status:'active'},
  {customerId:'c1',amount:10000,status:'void'},
  {customerId:'c1',amount:5000}
 ];
 assert.equal(customerBalance('c1',sales,payments),85000);
});

test('backup stock reconciliation accepts edit and void reversal movements',()=>{
 const product={id:'p1',name:'بادکا',kind:'gram',packBase:0,stockBase:0,lowBase:0,salePrice:100};
 const snapshot={
  schemaVersion:1,products:[product],suppliers:[{id:'s1',name:'تأمین‌کننده'}],customers:[{id:'c1',name:'مشتری'}],
  purchases:[{id:'buy1',productId:'p1',supplierId:'s1',total:1000,status:'void'}],
  sales:[{id:'sale1',customerId:'c1',lines:[{productId:'p1',amount:400}],total:400,status:'void'}],
  payments:[],
  movements:[
   {id:'m1',productId:'p1',deltaBase:10000},
   {id:'m2',productId:'p1',deltaBase:-3000},
   {id:'m3',productId:'p1',deltaBase:3000},
   {id:'m4',productId:'p1',deltaBase:-4000},
   {id:'m5',productId:'p1',deltaBase:4000},
   {id:'m6',productId:'p1',deltaBase:2000},
   {id:'m7',productId:'p1',deltaBase:-12000}
  ]
 };
 assert.ok(validateSnapshot(snapshot));
});

test('displayed Toman amounts use Persian three-digit grouping',()=>{
 assert.equal(money(3000000),'۳٬۰۰۰٬۰۰۰ تومان');
 assert.equal(money(125000),'۱۲۵٬۰۰۰ تومان');
});
