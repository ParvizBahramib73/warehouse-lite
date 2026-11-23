import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoiceShareText, invoicePaidAmount } from '../src/invoice-share.js';
import { money } from '../src/domain.js';

const sale={
 id:'sale-1',
 invoiceNo:'WL-20261123-ABC123',
 createdAt:'2026-11-23T09:30:00.000Z',
 customerName:'قنادی بهار',
 total:200000,
 status:'active',
 lines:[{productName:'روغن پنج کیلویی',quantity:'2',unit:'pack',unitPrice:100000,amount:200000}]
};
const payments=[
 {id:'p1',saleId:'sale-1',amount:50000,status:'active'},
 {id:'p2',saleId:'sale-1',amount:10000,status:'void'},
 {id:'p3',saleId:'other-sale',amount:90000,status:'active'}
];

test('invoice paid amount counts only active receipts linked to this invoice',()=>{
 assert.equal(invoicePaidAmount(sale,payments),50000);
});

test('AliFactor share text contains seller identity, customer, lines and correct balance',()=>{
 const text=buildInvoiceShareText(sale,payments);
 assert.ok(text.includes('علی‌فاکتور'));
 assert.ok(text.includes('پخش مواد اولیه قنادی علی | همدان'));
 assert.ok(text.includes('قنادی بهار'));
 assert.ok(text.includes('روغن پنج کیلویی'));
 assert.ok(text.includes('2 بسته'));
 assert.ok(text.includes(money(200000)));
 assert.ok(text.includes(money(50000)));
 assert.ok(text.includes(money(150000)));
 assert.ok(text.includes('با سپاس از خرید شما، علی'));
});

test('void invoice is clearly labelled in shared text',()=>{
 const text=buildInvoiceShareText({...sale,status:'void'},payments);
 assert.ok(text.includes('فاکتور باطل‌شده'));
});
