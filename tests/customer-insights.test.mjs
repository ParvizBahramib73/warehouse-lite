import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCustomerStatement,getCustomerFollowups} from '../src/customer-insights.js';

const sales=[
 {id:'s1',customerId:'c1',createdAt:'2026-11-01T10:00:00.000Z',total:100,invoiceNo:'INV-1',status:'active',lines:[{productName:'روغن'}]},
 {id:'s2',customerId:'c1',createdAt:'2026-11-03T10:00:00.000Z',total:50,invoiceNo:'INV-2',status:'void',lines:[]},
 {id:'s3',customerId:'c1',createdAt:'2026-11-05T10:00:00.000Z',total:30,invoiceNo:'INV-3',status:'active',lines:[{productName:'بادکا'}]},
 {id:'s4',customerId:'c2',createdAt:'2026-11-22T10:00:00.000Z',total:40,invoiceNo:'INV-4',status:'active',lines:[]},
 {id:'s5',customerId:'c3',createdAt:'2026-11-01T10:00:00.000Z',total:60,invoiceNo:'INV-5',status:'active',lines:[]}
];
const payments=[
 {id:'p1',customerId:'c1',createdAt:'2026-11-02T10:00:00.000Z',amount:20,method:'cash',status:'active'},
 {id:'p2',customerId:'c1',createdAt:'2026-11-04T10:00:00.000Z',amount:15,method:'transfer',status:'void'},
 {id:'p3',customerId:'c1',createdAt:'2026-11-06T10:00:00.000Z',amount:10,method:'transfer',note:'بخشی از بدهی',status:'active'}
];
test('customer statement is chronological and carries a running balance',()=>{
 const rows=buildCustomerStatement('c1',sales,payments);
 assert.deepEqual(rows.map(x=>x.id),['s1','p1','s2','p2','s3','p3']);
 assert.deepEqual(rows.map(x=>x.balanceAfter),[100,80,80,80,110,100]);
 assert.equal(rows.find(x=>x.id==='s2').status,'void');
});
test('voided invoices and receipts remain visible but do not change the statement balance',()=>{
 const rows=buildCustomerStatement('c1',sales,payments);
 assert.equal(rows.find(x=>x.id==='s2').balanceAfter,80);
 assert.equal(rows.find(x=>x.id==='p2').balanceAfter,80);
 assert.equal(rows.at(-1).balanceAfter,100);
});
test('follow-up suggestions use latest active sale and outstanding balance, excluding inactive customers',()=>{
 const customers=[
  {id:'c1',name:'قدیمی',active:true},
  {id:'c2',name:'جدید',active:true},
  {id:'c3',name:'غیرفعال',active:false}
 ];
 const items=getCustomerFollowups(customers,sales,payments,Date.parse('2026-11-23T10:00:00.000Z'));
 assert.deepEqual(items.map(x=>x.id),['c1','c2']);
 assert.equal(items[0].daysSinceSale,22);
 assert.equal(items[0].balance,100);
 assert.equal(items[0].reason,'پیگیری خرید و مانده حساب');
 assert.equal(items[1].balance,40);
 assert.equal(items[1].reason,'پیگیری مانده حساب');
});
