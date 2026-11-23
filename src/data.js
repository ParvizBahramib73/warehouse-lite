import {asInteger,asPositiveInteger,parseBaseQuantity,lineTotal,validateSaleLines,isoNow,makeId} from './domain.js';
export const DB_NAME = 'warehouse-lite-v01';
export const DB_VERSION = 1;
export const TABLES = ['products','suppliers','customers','purchases','sales','payments','movements'];

function request(req) { return new Promise((resolve,reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function completed(tx) { return new Promise((resolve,reject) => { tx.oncomplete=()=>resolve(); tx.onabort=()=>reject(tx.error||new Error('تراکنش لغو شد.')); tx.onerror=()=>{}; }); }

export function openDb() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{const db=r.result; for(const t of TABLES) if(!db.objectStoreNames.contains(t)) db.createObjectStore(t,{keyPath:'id'});};
    r.onsuccess=()=>{const db=r.result; db.onversionchange=()=>db.close(); resolve(db);};
    r.onerror=()=>reject(r.error);
    r.onblocked=()=>reject(new Error('برنامه در پنجره دیگری باز است؛ آن را ببندید.'));
  });
}

export async function readAll(db) {
  const tx=db.transaction(TABLES,'readonly');
  const values=await Promise.all(TABLES.map(t=>request(tx.objectStore(t).getAll())));
  return Object.fromEntries(TABLES.map((t,i)=>[t,values[i]]));
}

export async function addRecord(db, table, fields) {
  if(!['products','suppliers','customers'].includes(table)) throw new Error('جدول نامعتبر.');
  const row={id:makeId(),createdAt:isoNow(),...fields};
  const tx=db.transaction(table,'readwrite'); const done=completed(tx);
  tx.objectStore(table).add(row); await done; return row;
}

export async function addPurchase(db, input) {
  const {productId,supplierId,unit,quantity,unitPrice,paymentKind}=input;
  const tx=db.transaction(['products','suppliers','purchases','movements'],'readwrite'); const done=completed(tx);
  try {
    const [product,supplier]=await Promise.all([
      request(tx.objectStore('products').get(productId)),request(tx.objectStore('suppliers').get(supplierId))
    ]);
    if(!product||!supplier) throw new Error('کالا یا تأمین‌کننده یافت نشد.');
    const qty=parseBaseQuantity(product,unit,quantity);
    const price=asInteger(unitPrice,'قیمت خرید');
    const total=lineTotal(price,qty.thousandths);
    const stock=product.stockBase+qty.base;
    if(!Number.isSafeInteger(stock)) throw new Error('موجودی بیش از حد بزرگ است.');
    const now=isoNow(), id=makeId();
    tx.objectStore('products').put({...product,stockBase:stock,lastBuyPrice:price});
    tx.objectStore('purchases').add({id,createdAt:now,productId,productName:product.name,supplierId,supplierName:supplier.name,unit,quantity:String(quantity),quantityBase:qty.base,unitPrice:price,total,paymentKind});
    tx.objectStore('movements').add({id:makeId(),createdAt:now,productId,sourceType:'purchase',sourceId:id,deltaBase:qty.base});
    await done; return id;
  } catch (error) { try{tx.abort();}catch{} await done.catch(()=>{}); throw error; }
}

export async function addSale(db, input) {
  const {customerId,lines,paidAmount,paymentMethod}=input;
  // Read/write transaction locks all affected stores and validates stock within it.
  const tx=db.transaction(['products','customers','sales','payments','movements'],'readwrite'); const done=completed(tx);
  try {
    const customer=await request(tx.objectStore('customers').get(customerId));
    if(!customer) throw new Error('مشتری یافت نشد.');
    if(!Array.isArray(lines)||!lines.length) throw new Error('اقلام فاکتور خالی است.');
    const ids=[...new Set(lines.map(l=>l.productId))];
    const products=await Promise.all(ids.map(id=>request(tx.objectStore('products').get(id))));
    const {normalized,total,required}=validateSaleLines(lines,products.filter(Boolean));
    const paid=asInteger(paidAmount||'0','مبلغ دریافت‌شده');
    if(paid>total) throw new Error('دریافت اولیه نمی‌تواند از مبلغ فاکتور بیشتر باشد.');
    if(paid>0&&!['cash','transfer'].includes(paymentMethod)) throw new Error('نوع دریافت وجه نامعتبر است.');
    const id=makeId(),now=isoNow();
    for(const p of products){const delta=required.get(p.id)||0;if(!delta)continue;
      tx.objectStore('products').put({...p,stockBase:p.stockBase-delta});
      tx.objectStore('movements').add({id:makeId(),createdAt:now,productId:p.id,sourceType:'sale',sourceId:id,deltaBase:-delta});
    }
    tx.objectStore('sales').add({id,createdAt:now,invoiceNo:'WL-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+id.slice(0,6).toUpperCase(),customerId,customerName:customer.name,lines:normalized,total});
    if(paid>0)tx.objectStore('payments').add({id:makeId(),createdAt:now,customerId,amount:paid,method:paymentMethod,saleId:id,note:'دریافت هنگام فروش'});
    await done; return id;
  } catch(error){try{tx.abort();}catch{}await done.catch(()=>{});throw error;}
}

export async function addPayment(db,{customerId,amount,method,note}) {
  const money=asPositiveInteger(amount,'مبلغ دریافت');
  if(!['cash','transfer'].includes(method)) throw new Error('روش پرداخت نامعتبر است.');
  const tx=db.transaction(['customers','payments'],'readwrite');const done=completed(tx);
  try {
    const c=await request(tx.objectStore('customers').get(customerId));
    if(!c)throw new Error('مشتری پیدا نشد.');
    tx.objectStore('payments').add({id:makeId(),createdAt:isoNow(),customerId,amount:money,method,note:String(note||'').slice(0,250),saleId:null});
    await done;
  }catch(error){try{tx.abort()}catch{}await done.catch(()=>{});throw error;}
}

export async function replaceAll(db,snapshot) {
  const tx=db.transaction(TABLES,'readwrite');const done=completed(tx);
  for(const name of TABLES){const store=tx.objectStore(name);store.clear();for(const row of snapshot[name])store.add(row);}
  await done;
}
