import {asInteger,asPositiveInteger,parseBaseQuantity,lineTotal,validateSaleLines,isoNow,makeId} from './domain.js';
import {snapshotSaleLines} from './costing.js';
export const DB_NAME = 'warehouse-lite-v01';
export const DB_VERSION = 2;
export const TABLES = ['products','suppliers','customers','purchases','sales','payments','movements','visits'];

function request(req) { return new Promise((resolve,reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
function completed(tx) { return new Promise((resolve,reject) => { tx.oncomplete=()=>resolve(); tx.onabort=()=>reject(tx.error||new Error('تراکنش لغو شد.')); tx.onerror=()=>{}; }); }
function active(row) { return row?.active !== false; }
function abort(tx, done, error) { try { tx.abort(); } catch {} return done.catch(()=>{}).then(()=>{ throw error; }); }

export function openDb() {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{
      const db=r.result,tx=r.transaction;
      for(const t of TABLES)if(!db.objectStoreNames.contains(t))db.createObjectStore(t,{keyPath:'id'});
      const indexes={
        products:[['byName','name',{}],['byCode','code',{}]],
        customers:[['byDistrict','district',{}],['byVisitDay','visitDay',{}]],
        purchases:[['byCreatedAt','createdAt',{}],['byProduct','productId',{}]],
        sales:[['byCreatedAt','createdAt',{}],['byCustomer','customerId',{}],['byInvoiceNo','invoiceNo',{}]],
        payments:[['byCreatedAt','createdAt',{}],['byCustomer','customerId',{}]],
        movements:[['byCreatedAt','createdAt',{}],['byProduct','productId',{}]],
        visits:[['byDate','plannedDate',{}],['byCustomer','customerId',{}],['byCustomerDate',['customerId','plannedDate'],{unique:true}]]
      };
      for(const [table,items] of Object.entries(indexes)){
        const store=tx.objectStore(table);
        for(const [name,keyPath,options] of items)if(!store.indexNames.contains(name))store.createIndex(name,keyPath,options);
      }
    };
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
  const row={id:makeId(),createdAt:isoNow(),active:true,...fields};
  const tx=db.transaction(table,'readwrite'); const done=completed(tx);
  tx.objectStore(table).add(row); await done; return row;
}

/** Update a master record without changing its identity or historical stock. */
export async function updateRecord(db, table, id, fields) {
  if(!['products','suppliers','customers'].includes(table)) throw new Error('نوع اطلاعات برای ویرایش نامعتبر است.');
  const stores=table==='products'?['products','movements','purchases','sales']:[table];
  const tx=db.transaction(stores,'readwrite'); const done=completed(tx);
  try {
    const store=tx.objectStore(table), current=await request(store.get(id));
    if(!current) throw new Error('رکورد موردنظر پیدا نشد.');
    if(table==='products'){
      const [allProducts,movements,purchases,sales]=await Promise.all([
        request(store.getAll()),request(tx.objectStore('movements').getAll()),
        request(tx.objectStore('purchases').getAll()),request(tx.objectStore('sales').getAll())
      ]);
      const code=String(fields.code||'').trim();
      if(code&&allProducts.some(p=>p.id!==id&&p.code===code)) throw new Error('کد کالا قبلاً برای کالای دیگری ثبت شده است.');
      const hasHistory=movements.some(m=>m.productId===id)||purchases.some(p=>p.productId===id)||sales.some(s=>(s.lines||[]).some(line=>line.productId===id));
      const baseChanged=current.kind!==fields.kind||current.packBase!==fields.packBase;
      if(baseChanged&&(hasHistory||current.stockBase!==0)) throw new Error('واحد پایه یا اندازه بسته این کالا قابل تغییر نیست؛ چون سابقه گردش یا موجودی دارد. فقط نام، دسته، قیمت و حد هشدار را ویرایش کنید.');
    }
    const next={...current,...fields,id:current.id,createdAt:current.createdAt,modifiedAt:isoNow()};
    if(table==='products'){next.stockBase=current.stockBase;next.lastBuyPrice=current.lastBuyPrice;}
    store.put(next); await done; return next;
  } catch(error) { return abort(tx,done,error); }
}

export async function setRecordActive(db, table, id, isActive) {
  if(!['products','suppliers','customers'].includes(table)) throw new Error('نوع اطلاعات نامعتبر است.');
  const tx=db.transaction(table,'readwrite'); const done=completed(tx);
  try {
    const store=tx.objectStore(table), row=await request(store.get(id));
    if(!row) throw new Error('رکورد پیدا نشد.');
    if(!isActive&&table==='products'&&row.stockBase>0) throw new Error('این کالا هنوز موجودی دارد. ابتدا موجودی آن را بفروشید یا با ثبت اصلاح موجودی تعیین تکلیف کنید.');
    store.put({...row,active:Boolean(isActive),archivedAt:isActive?null:isoNow(),modifiedAt:isoNow()});
    await done;
  } catch(error) { return abort(tx,done,error); }
}

export async function deleteRecord(db, table, id) {
  if(!['products','suppliers','customers'].includes(table)) throw new Error('حذف دائمی برای این نوع اطلاعات مجاز نیست.');
  const stores=table==='products'?['products','movements','purchases','sales']:table==='suppliers'?['suppliers','purchases']:['customers','sales','payments'];
  const tx=db.transaction(stores,'readwrite'); const done=completed(tx);
  try {
    const row=await request(tx.objectStore(table).get(id));
    if(!row) throw new Error('رکورد پیدا نشد.');
    if(table==='products'){
      const [movements,purchases,sales]=await Promise.all([request(tx.objectStore('movements').getAll()),request(tx.objectStore('purchases').getAll()),request(tx.objectStore('sales').getAll())]);
      if(row.stockBase!==0||movements.some(x=>x.productId===id)||purchases.some(x=>x.productId===id)||sales.some(x=>(x.lines||[]).some(line=>line.productId===id))) throw new Error('این کالا سابقه خرید، فروش یا گردش موجودی دارد؛ حذف دائمی مجاز نیست. آن را غیرفعال کنید.');
    } else if(table==='suppliers'){
      if((await request(tx.objectStore('purchases').getAll())).some(x=>x.supplierId===id)) throw new Error('برای این تأمین‌کننده سابقه خرید ثبت شده؛ حذف دائمی مجاز نیست. آن را غیرفعال کنید.');
    } else {
      const [sales,payments]=await Promise.all([request(tx.objectStore('sales').getAll()),request(tx.objectStore('payments').getAll())]);
      if(sales.some(x=>x.customerId===id)||payments.some(x=>x.customerId===id)) throw new Error('برای این مشتری سابقه فاکتور یا دریافت وجه ثبت شده؛ حذف دائمی مجاز نیست. آن را غیرفعال کنید.');
    }
    tx.objectStore(table).delete(id); await done;
  } catch(error) { return abort(tx,done,error); }
}

export async function addPurchase(db, input) {
  const {productId,supplierId,unit,quantity,unitPrice,paymentKind}=input;
  const tx=db.transaction(['products','suppliers','purchases','movements'],'readwrite'); const done=completed(tx);
  try {
    const [product,supplier]=await Promise.all([request(tx.objectStore('products').get(productId)),request(tx.objectStore('suppliers').get(supplierId))]);
    if(!product||!supplier) throw new Error('کالا یا تأمین‌کننده یافت نشد.');
    if(!active(product)||!active(supplier)) throw new Error('کالا یا تأمین‌کننده غیرفعال است.');
    const qty=parseBaseQuantity(product,unit,quantity), price=asInteger(unitPrice,'قیمت خرید'), total=lineTotal(price,qty.thousandths);
    const stock=product.stockBase+qty.base;
    if(!Number.isSafeInteger(stock)) throw new Error('موجودی بیش از حد بزرگ است.');
    const now=isoNow(), id=makeId();
    tx.objectStore('products').put({...product,stockBase:stock,lastBuyPrice:price});
    tx.objectStore('purchases').add({id,createdAt:now,productId,productName:product.name,supplierId,supplierName:supplier.name,unit,quantity:String(quantity),quantityBase:qty.base,unitPrice:price,total,paymentKind,status:'active'});
    tx.objectStore('movements').add({id:makeId(),createdAt:now,productId,sourceType:'purchase',sourceId:id,deltaBase:qty.base});
    await done; return id;
  } catch (error) { return abort(tx,done,error); }
}

export async function updatePurchase(db, id, input) {
  const tx=db.transaction(['products','suppliers','purchases','movements'],'readwrite'); const done=completed(tx);
  try {
    const purchase=await request(tx.objectStore('purchases').get(id));
    if(!purchase||purchase.status==='void') throw new Error('خرید پیدا نشد یا قبلاً باطل شده است.');
    const [product,supplier]=await Promise.all([request(tx.objectStore('products').get(purchase.productId)),request(tx.objectStore('suppliers').get(input.supplierId))]);
    if(!product||!supplier) throw new Error('کالا یا تأمین‌کننده پیدا نشد.');
    if(!active(supplier)&&supplier.id!==purchase.supplierId) throw new Error('تأمین‌کننده جدید غیرفعال است.');
    const qty=parseBaseQuantity(product,input.unit,input.quantity), price=asInteger(input.unitPrice,'قیمت خرید');
    const delta=qty.base-purchase.quantityBase;
    if(delta<0&&product.stockBase < -delta) throw new Error('موجودی فعلی برای کاهش مقدار این خرید کافی نیست؛ احتمالاً بخشی از کالا فروخته شده است.');
    const stock=product.stockBase+delta;
    if(!Number.isSafeInteger(stock)||stock<0) throw new Error('اصلاح خرید باعث موجودی نامعتبر می‌شود.');
    const now=isoNow(), total=lineTotal(price,qty.thousandths);
    const allPurchases=await request(tx.objectStore('purchases').getAll());
    const latest=[...allPurchases.filter(p=>p.productId===product.id&&p.id!==id&&p.status!=='void'),{...purchase,createdAt:purchase.createdAt,unitPrice:price,status:'active'}].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
    const lastBuyPrice=latest?.unitPrice??price;
    tx.objectStore('products').put({...product,stockBase:stock,lastBuyPrice});
    tx.objectStore('purchases').put({...purchase,supplierId:supplier.id,supplierName:supplier.name,unit:input.unit,quantity:String(input.quantity),quantityBase:qty.base,unitPrice:price,total,paymentKind:input.paymentKind,modifiedAt:now});
    if(delta) tx.objectStore('movements').add({id:makeId(),createdAt:now,productId:product.id,sourceType:'purchase-edit',sourceId:id,deltaBase:delta});
    await done;
  } catch(error) { return abort(tx,done,error); }
}

export async function voidPurchase(db, id) {
  const tx=db.transaction(['products','purchases','movements'],'readwrite'); const done=completed(tx);
  try {
    const purchase=await request(tx.objectStore('purchases').get(id));
    if(!purchase||purchase.status==='void') throw new Error('خرید پیدا نشد یا قبلاً باطل شده است.');
    const product=await request(tx.objectStore('products').get(purchase.productId));
    if(!product||product.stockBase<purchase.quantityBase) throw new Error('موجودی فعلی برای ابطال این خرید کافی نیست؛ ابتدا موجودی و فروش‌های بعدی را بررسی کنید.');
    const now=isoNow(), stock=product.stockBase-purchase.quantityBase;
    const allPurchases=await request(tx.objectStore('purchases').getAll());
    const latest=allPurchases.filter(p=>p.productId===product.id&&p.id!==id&&p.status!=='void').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
    tx.objectStore('products').put({...product,stockBase:stock,lastBuyPrice:latest?.unitPrice??0});
    tx.objectStore('purchases').put({...purchase,status:'void',voidedAt:now});
    tx.objectStore('movements').add({id:makeId(),createdAt:now,productId:product.id,sourceType:'purchase-void',sourceId:id,deltaBase:-purchase.quantityBase});
    await done;
  } catch(error) { return abort(tx,done,error); }
}

export async function addSale(db, input) {
  const {customerId,lines,paidAmount,paymentMethod}=input;
  const tx=db.transaction(['products','customers','sales','payments','movements','purchases'],'readwrite'); const done=completed(tx);
  try {
    const [customer,purchases]=await Promise.all([request(tx.objectStore('customers').get(customerId)),request(tx.objectStore('purchases').getAll())]);
    if(!customer||!active(customer)) throw new Error('مشتری یافت نشد یا غیرفعال است.');
    if(!Array.isArray(lines)||!lines.length) throw new Error('اقلام فاکتور خالی است.');
    const ids=[...new Set(lines.map(l=>l.productId))], products=await Promise.all(ids.map(id=>request(tx.objectStore('products').get(id))));
    if(products.some(p=>!active(p))) throw new Error('یکی از کالاهای انتخاب‌شده غیرفعال است.');
    const {normalized,total,required}=validateSaleLines(lines,products.filter(Boolean));
    const paid=asInteger(paidAmount||'0','مبلغ دریافت‌شده');
    if(paid>total) throw new Error('دریافت اولیه نمی‌تواند از مبلغ فاکتور بیشتر باشد.');
    if(paid>0&&!['cash','transfer'].includes(paymentMethod)) throw new Error('نوع دریافت وجه نامعتبر است.');
    const id=makeId(),now=isoNow();
    for(const p of products){const delta=required.get(p.id)||0;if(!delta)continue;
      tx.objectStore('products').put({...p,stockBase:p.stockBase-delta});
      tx.objectStore('movements').add({id:makeId(),createdAt:now,productId:p.id,sourceType:'sale',sourceId:id,deltaBase:-delta});
    }
    const costedLines=snapshotSaleLines(normalized,purchases,now);
    tx.objectStore('sales').add({id,createdAt:now,invoiceNo:'WL-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+id.slice(0,6).toUpperCase(),customerId,customerName:customer.name,lines:costedLines,total,status:'active'});
    if(paid>0)tx.objectStore('payments').add({id:makeId(),createdAt:now,customerId,amount:paid,method:paymentMethod,saleId:id,note:'دریافت هنگام فروش',status:'active'});
    await done; return id;
  } catch(error){return abort(tx,done,error);}
}

export async function updateSale(db, id, lines) {
  const tx=db.transaction(['products','sales','payments','movements','purchases'],'readwrite'); const done=completed(tx);
  try {
    const sale=await request(tx.objectStore('sales').get(id));
    if(!sale||sale.status==='void') throw new Error('فاکتور پیدا نشد یا باطل شده است.');
    const [allProducts,payments,purchases]=await Promise.all([request(tx.objectStore('products').getAll()),request(tx.objectStore('payments').getAll()),request(tx.objectStore('purchases').getAll())]);
    const oldRequired=new Map();
    for(const line of sale.lines||[]) oldRequired.set(line.productId,(oldRequired.get(line.productId)||0)+line.quantityBase);
    const oldIds=new Set(oldRequired.keys());
    const virtual=allProducts.map(p=>({...p,stockBase:p.stockBase+(oldRequired.get(p.id)||0)}));
    const ids=new Set(lines.map(line=>line.productId));
    for(const id2 of ids){const p=allProducts.find(x=>x.id===id2);if(!p)throw new Error('یکی از کالاهای انتخاب‌شده پیدا نشد.');if(!active(p)&&!oldIds.has(id2))throw new Error('کالای جدید انتخاب‌شده غیرفعال است.');}
    const {normalized,total,required}=validateSaleLines(lines,virtual);
    const linkedPaid=payments.filter(p=>p.saleId===id&&p.status!=='void').reduce((sum,p)=>sum+p.amount,0);
    if(linkedPaid>total) throw new Error('مبلغ فاکتور نمی‌تواند از دریافتی ثبت‌شده کمتر باشد.');
    const now=isoNow(), allIds=new Set([...oldRequired.keys(),...required.keys()]);
    for(const productId of allIds){
      const p=allProducts.find(x=>x.id===productId);
      const oldQty=oldRequired.get(productId)||0,newQty=required.get(productId)||0;
      const stock=p.stockBase+oldQty-newQty;
      if(!Number.isSafeInteger(stock)||stock<0)throw new Error('ویرایش فاکتور باعث موجودی نامعتبر می‌شود.');
      tx.objectStore('products').put({...p,stockBase:stock});
      if(oldQty)tx.objectStore('movements').add({id:makeId(),createdAt:now,productId,sourceType:'sale-edit-reversal',sourceId:id,deltaBase:oldQty});
      if(newQty)tx.objectStore('movements').add({id:makeId(),createdAt:now,productId,sourceType:'sale-edit',sourceId:id,deltaBase:-newQty});
    }
    tx.objectStore('sales').put({...sale,lines:snapshotSaleLines(normalized,purchases,now),total,modifiedAt:now});
    await done;
  } catch(error) { return abort(tx,done,error); }
}

export async function voidSale(db, id) {
  const tx=db.transaction(['products','sales','payments','movements'],'readwrite'); const done=completed(tx);
  try {
    const sale=await request(tx.objectStore('sales').get(id));
    if(!sale||sale.status==='void') throw new Error('فاکتور پیدا نشد یا قبلاً باطل شده است.');
    const payments=await request(tx.objectStore('payments').getAll());
    const uncertainPayments=payments.filter(p=>p.customerId===sale.customerId&&p.status!=='void'&&p.createdAt>=sale.createdAt);
    if(uncertainPayments.length) throw new Error('برای این مشتری پس از تاریخ فاکتور دریافت وجه ثبت شده است. برای جلوگیری از اشتباه در حساب، ابطال خودکار ممکن نیست؛ ابتدا وضعیت دریافت‌ها را بررسی کنید.');
    const allProducts=await request(tx.objectStore('products').getAll()), required=new Map();
    for(const line of sale.lines||[]) required.set(line.productId,(required.get(line.productId)||0)+line.quantityBase);
    const now=isoNow();
    for(const [productId,qty] of required){
      const p=allProducts.find(x=>x.id===productId);if(!p)throw new Error('کالای فاکتور در پایگاه داده پیدا نشد.');
      const stock=p.stockBase+qty;if(!Number.isSafeInteger(stock))throw new Error('موجودی پس از ابطال نامعتبر است.');
      tx.objectStore('products').put({...p,stockBase:stock});
      tx.objectStore('movements').add({id:makeId(),createdAt:now,productId,sourceType:'sale-void',sourceId:id,deltaBase:qty});
    }
    tx.objectStore('sales').put({...sale,status:'void',voidedAt:now});
    await done;
  } catch(error) { return abort(tx,done,error); }
}

export async function addPayment(db,{customerId,amount,method,note}) {
  const value=asPositiveInteger(amount,'مبلغ دریافت');
  if(!['cash','transfer'].includes(method)) throw new Error('روش پرداخت نامعتبر است.');
  const tx=db.transaction(['customers','payments'],'readwrite');const done=completed(tx);
  try {
    const c=await request(tx.objectStore('customers').get(customerId));
    if(!c)throw new Error('مشتری پیدا نشد.');
    tx.objectStore('payments').add({id:makeId(),createdAt:isoNow(),customerId,amount:value,method,note:String(note||'').slice(0,250),saleId:null,status:'active'});
    await done;
  }catch(error){return abort(tx,done,error);}
}

export async function updatePayment(db,id,{amount,method,note}) {
  const value=asPositiveInteger(amount,'مبلغ دریافت');
  if(!['cash','transfer'].includes(method)) throw new Error('روش دریافت نامعتبر است.');
  const tx=db.transaction(['payments','sales'],'readwrite');const done=completed(tx);
  try {
    const payment=await request(tx.objectStore('payments').get(id));
    if(!payment||payment.status==='void')throw new Error('دریافت پیدا نشد یا باطل شده است.');
    if(payment.saleId){
      const [sale,allPayments]=await Promise.all([request(tx.objectStore('sales').get(payment.saleId)),request(tx.objectStore('payments').getAll())]);
      const otherLinked=allPayments.filter(p=>p.saleId===payment.saleId&&p.id!==id&&p.status!=='void').reduce((sum,p)=>sum+p.amount,0);
      if(!sale||sale.status==='void'||otherLinked+value>sale.total)throw new Error('مجموع دریافت‌های مرتبط با فاکتور نمی‌تواند از مبلغ فاکتور بیشتر باشد.');
    }
    tx.objectStore('payments').put({...payment,amount:value,method,note:String(note||'').slice(0,250),modifiedAt:isoNow()});
    await done;
  }catch(error){return abort(tx,done,error);}
}

export async function voidPayment(db,id) {
  const tx=db.transaction('payments','readwrite');const done=completed(tx);
  try {
    const payment=await request(tx.objectStore('payments').get(id));
    if(!payment||payment.status==='void')throw new Error('دریافت پیدا نشد یا قبلاً باطل شده است.');
    tx.objectStore('payments').put({...payment,status:'void',voidedAt:isoNow()});
    await done;
  }catch(error){return abort(tx,done,error);}
}

export async function saveVisit(db,{customerId,plannedDate,outcome,note,nextFollowUpDate}) {
  const allowed=['planned','purchased','no_purchase','unavailable','follow_up'];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(plannedDate||'')))throw new Error('تاریخ مراجعه معتبر نیست.');
  if(!allowed.includes(outcome))throw new Error('نتیجه مراجعه معتبر نیست.');
  const detail=String(note||'').trim().slice(0,500);
  const nextDate=String(nextFollowUpDate||'');
  if(outcome==='follow_up'&&!/^\d{4}-\d{2}-\d{2}$/.test(nextDate))throw new Error('برای پیگیری مجدد، تاریخ بعدی را انتخاب کنید.');
  if(nextDate&&nextDate<plannedDate)throw new Error('تاریخ پیگیری نمی‌تواند قبل از تاریخ مراجعه باشد.');
  const tx=db.transaction(['customers','visits'],'readwrite');const done=completed(tx);
  try{
    const customer=await request(tx.objectStore('customers').get(customerId));
    if(!customer||!active(customer))throw new Error('مشتری پیدا نشد یا غیرفعال است.');
    const store=tx.objectStore('visits');
    const existing=await request(store.index('byCustomerDate').get([customerId,plannedDate]));
    const now=isoNow();
    const row={id:existing?.id||makeId(),customerId,customerName:customer.name,plannedDate,outcome,note:detail,nextFollowUpDate:outcome==='follow_up'?nextDate:'',createdAt:existing?.createdAt||now,modifiedAt:now};
    store.put(row);await done;return row.id;
  }catch(error){return abort(tx,done,error);}
}

export async function replaceAll(db,snapshot) {
  const tx=db.transaction(TABLES,'readwrite');const done=completed(tx);
  for(const name of TABLES){const store=tx.objectStore(name);store.clear();for(const row of (snapshot[name]||[]))store.add(row);}
  await done;
}
