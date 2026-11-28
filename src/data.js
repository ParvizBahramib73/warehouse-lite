import {asInteger,asPositiveInteger,asDecimalMilli,parseBaseQuantity,lineTotal,validateSaleLines,pricePerBaseUnit,valueForQuantity,calcSuggestedPrice,validDate,tehranDate,isoNow,makeId,invoiceOutstanding} from './domain.js';
// Fresh v0.2 IRR database for the main application; never reuse the legacy toman database.
// The earlier v0.1.8 and v0.2 preview stores are intentionally untouched.
export const DB_NAME='warehouse-lite-v02-irr';
export const DB_VERSION=1;
export const TABLES=['products','suppliers','customers','purchases','sales','payments','movements','cheques','settings','priceHistory'];
export const DEFAULT_SETTINGS=Object.freeze({id:'main',marginBps:1000,expiryWarningDays:30,theme:'auto',businessName:'انبار من',businessPhone:'',invoiceNote:'',invoiceSize:'a5'});
function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function completed(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('تراکنش لغو شد.'));tx.onerror=()=>{};});}
function abort(tx){try{tx.abort();}catch{}}
function validName(s,label){const v=String(s||'').trim();if(!v||v.length>100)throw new Error(`${label} نامعتبر است.`);return v;}
function phone(s){return String(s||'').trim().slice(0,25);}
function dateInput(s,label){return validDate(String(s||''),label);}
export function openDb(){return new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{const db=r.result;for(const t of TABLES)if(!db.objectStoreNames.contains(t))db.createObjectStore(t,{keyPath:'id'});};
  r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>db.close();resolve(db);};
  r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('پنجره دیگر برنامه را ببندید.'));
});}
export async function readAll(db){const tx=db.transaction(TABLES,'readonly');const rows=await Promise.all(TABLES.map(t=>req(tx.objectStore(t).getAll())));return Object.fromEntries(TABLES.map((t,i)=>[t,rows[i]]));}
export async function addRecord(db,table,input){if(!['products','suppliers','customers'].includes(table))throw new Error('نوع اطلاعات نامعتبر.');
  const now=isoNow();let row;
  if(table==='products'){
    const kind=input.kind;if(!['piece','gram'].includes(kind))throw new Error('واحد پایه نامعتبر.');
    const unitConfigs={};for(const k of ['pack','carton','can'])unitConfigs[k]=asInteger(input.unitConfigs?.[k]||0,'مقدار واحد');
    const lowBase=asInteger(input.lowBase||0,'حد موجودی');const replacementPrice=asInteger(input.replacementPrice||0,'قیمت جایگزینی');const salePrice=asInteger(input.salePrice??calcSuggestedPrice(replacementPrice),'قیمت فروش');
    row={id:makeId(),createdAt:now,name:validName(input.name,'کالا'),code:String(input.code||'').trim().slice(0,30),category:String(input.category||'').slice(0,60),kind,packBase:unitConfigs.pack,unitConfigs,lowBase,stockBase:0,lastBuyPrice:0,replacementPrice,salePrice,imageData:input.imageData||'',updatedAt:now};
  }else if(table==='suppliers')row={id:makeId(),createdAt:now,name:validName(input.name,'تأمین‌کننده'),phone:phone(input.phone)};
  else row={id:makeId(),createdAt:now,name:validName(input.name,'مشتری'),phone:phone(input.phone),district:String(input.district||'').slice(0,100),visitDay:String(input.visitDay||'').slice(0,20),note:String(input.note||'').slice(0,250)};
  const tx=db.transaction(table,'readwrite');const done=completed(tx);tx.objectStore(table).add(row);await done;return row;
}
export async function updateProduct(db,input){const tx=db.transaction(['products','priceHistory'],'readwrite');const done=completed(tx);
  try{
    const p=await req(tx.objectStore('products').get(input.id));if(!p)throw new Error('کالا یافت نشد.');
    const replacementPrice=asInteger(input.replacementPrice,'قیمت جایگزینی');const salePrice=asInteger(input.salePrice,'قیمت فروش');
    const updated={...p,replacementPrice,salePrice,lowBase:asInteger(input.lowBase??p.lowBase,'حد هشدار'),updatedAt:isoNow()};
    if(input.imageData!==undefined)updated.imageData=input.imageData;
    if(p.replacementPrice!==replacementPrice||p.salePrice!==salePrice){tx.objectStore('priceHistory').add({id:makeId(),productId:p.id,createdAt:isoNow(),oldReplacement:p.replacementPrice||0,newReplacement:replacementPrice,oldSale:p.salePrice||0,newSale:salePrice});}
    tx.objectStore('products').put(updated);await done;return updated;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
export async function updateSettings(db,input){const settings={...DEFAULT_SETTINGS,...input,id:'main'};
  settings.marginBps=asInteger(settings.marginBps,'درصد سود');if(settings.marginBps>50000)throw new Error('درصد سود غیرمجاز است.');
  settings.expiryWarningDays=asInteger(settings.expiryWarningDays,'روز هشدار');if(settings.expiryWarningDays>3650)throw new Error('حد هشدار نامعتبر است.');
  if(!['light','dark','auto'].includes(settings.theme))throw new Error('تم نامعتبر.');
  settings.businessName=String(settings.businessName||'انبار من').slice(0,100);settings.businessPhone=phone(settings.businessPhone);settings.invoiceNote=String(settings.invoiceNote||'').slice(0,250);
  const tx=db.transaction('settings','readwrite');const done=completed(tx);tx.objectStore('settings').put(settings);await done;return settings;
}
export async function addPurchase(db,input){
  const tx=db.transaction(['products','suppliers','purchases','movements','cheques'],'readwrite');const done=completed(tx);
  try{
    const [p,s]=await Promise.all([req(tx.objectStore('products').get(input.productId)),req(tx.objectStore('suppliers').get(input.supplierId))]);
    if(!p||!s)throw new Error('کالا یا تأمین‌کننده موجود نیست.');
    const qty=parseBaseQuantity(p,input.unit,input.quantity);const unitPrice=asPositiveInteger(input.unitPrice,'قیمت خرید');const total=lineTotal(unitPrice,qty.thousandths);
    const lastBuyPrice=pricePerBaseUnit(p,unitPrice,input.unit);const nextStock=p.stockBase+qty.base;if(!Number.isSafeInteger(nextStock))throw new Error('موجودی بیش از حد بزرگ است.');
    const paymentKind=String(input.paymentKind||'cash');if(!['cash','transfer','credit','check'].includes(paymentKind))throw new Error('روش پرداخت نامعتبر.');
    const expiryDate=dateInput(input.expiryDate,'تاریخ انقضا');const id=makeId(),now=isoNow();
    const row={id,createdAt:now,productId:p.id,productName:p.name,supplierId:s.id,supplierName:s.name,unit:input.unit,quantity:String(input.quantity),quantityBase:qty.base,remainingBase:qty.base,unitPrice,total,paymentKind,expiryDate};
    let next={...p,stockBase:nextStock,lastBuyPrice,updatedAt:now};
    // Replacement is user-managed. Seed only on the first purchase.
    if(!p.replacementPrice){next.replacementPrice=lastBuyPrice;next.salePrice=calcSuggestedPrice(lastBuyPrice,asInteger(input.marginBps??1000));}
    tx.objectStore('products').put(next);tx.objectStore('purchases').add(row);
    tx.objectStore('movements').add({id:makeId(),createdAt:now,productId:p.id,sourceType:'purchase',sourceId:id,deltaBase:qty.base});
    if(paymentKind==='check'){
      const no=validName(input.chequeNo,'شماره چک');const due=dateInput(input.chequeDueDate,'تاریخ سررسید چک');if(!due)throw new Error('تاریخ سررسید چک الزامی است.');
      tx.objectStore('cheques').add({id:makeId(),createdAt:now,supplierId:s.id,supplierName:s.name,purchaseId:id,number:no,bank:String(input.chequeBank||'').slice(0,80),amount:total,issueDate:dateInput(input.chequeIssueDate,'تاریخ چک')||tehranDate(now),dueDate:due,status:'pending',note:'ثبت همزمان خرید'});
    }
    await done;return id;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
export async function addSale(db,input){
  const tx=db.transaction(['products','customers','purchases','sales','payments','movements','settings'],'readwrite');const done=completed(tx);
  try{
    const c=await req(tx.objectStore('customers').get(input.customerId));if(!c)throw new Error('مشتری انتخاب‌شده یافت نشد.');
    const ids=[...new Set((input.lines||[]).map(x=>x.productId))];
    const products=(await Promise.all(ids.map(id=>req(tx.objectStore('products').get(id))))).filter(Boolean);
    const cfg=await req(tx.objectStore('settings').get('main'));const margin=cfg?.marginBps??1000;
    const {normalized,required,total,replacementCost,replacementProfit}=validateSaleLines(input.lines,products,margin);
    const paid=asInteger(input.paidAmount||'0','مبلغ دریافتی');if(!['cash','transfer'].includes(input.paymentMethod||'cash'))throw new Error('روش دریافت نامعتبر.');if(paid>total)throw new Error('دریافت اولیه بیشتر از مبلغ فاکتور است.');
    const dueDate=dateInput(input.dueDate,'تاریخ تسویه');const now=isoNow(),today=tehranDate(now),id=makeId();let acquisitionCost=0;const allocations=[];
    const lots=(await req(tx.objectStore('purchases').getAll())).filter(x=>x.remainingBase>0);
    for(const p of products){let needed=required.get(p.id)||0;if(!needed)continue;
      const available=lots.filter(x=>x.productId===p.id).sort((a,b)=>(a.expiryDate||'9999-12-31').localeCompare(b.expiryDate||'9999-12-31')||a.createdAt.localeCompare(b.createdAt));
      for(const lot of available){if(!needed)break;if(lot.expiryDate && lot.expiryDate<today)continue;
        const take=Math.min(needed,lot.remainingBase);needed-=take;
        // Proportional historic cost estimate, exact total retained on the final depletion.
        const cost=take===lot.remainingBase?Math.round(lot.total*lot.remainingBase/lot.quantityBase):Math.round(lot.total*take/lot.quantityBase);
        acquisitionCost+=cost;allocations.push({purchaseId:lot.id,productId:p.id,quantityBase:take,acquisitionCost:cost});
        tx.objectStore('purchases').put({...lot,remainingBase:lot.remainingBase-take});lot.remainingBase-=take;
      }
      if(needed)throw new Error(`موجودی قابل فروش «${p.name}» کافی نیست (ممکن است بخشی منقضی شده باشد).`);
      tx.objectStore('products').put({...p,stockBase:p.stockBase-required.get(p.id),updatedAt:now});
      tx.objectStore('movements').add({id:makeId(),createdAt:now,productId:p.id,sourceType:'sale',sourceId:id,deltaBase:-required.get(p.id)});
    }
    const sale={id,createdAt:now,invoiceNo:`WL-${today.replace(/-/g,'')}-${id.slice(0,6).toUpperCase()}`,customerId:c.id,customerName:c.name,lines:normalized,total,replacementCost,replacementProfit,acquisitionCost,acquisitionProfit:total-acquisitionCost,allocations,dueDate};
    tx.objectStore('sales').add(sale);
    if(paid)tx.objectStore('payments').add({id:makeId(),createdAt:now,customerId:c.id,amount:paid,method:input.paymentMethod||'cash',saleId:id,note:'دریافت زمان فروش'});
    await done;return sale;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
export async function addPayment(db,input){const amount=asPositiveInteger(input.amount,'مبلغ دریافت');
  const method=String(input.method||'cash');if(!['cash','transfer'].includes(method))throw new Error('روش دریافت نامعتبر.');
  const tx=db.transaction(['customers','sales','payments'],'readwrite');const done=completed(tx);
  try{
    const customer=await req(tx.objectStore('customers').get(input.customerId));if(!customer)throw new Error('مشتری یافت نشد.');
    let saleId=input.saleId||null;
    if(saleId){const s=await req(tx.objectStore('sales').get(saleId));if(!s||s.customerId!==customer.id)throw new Error('فاکتور متعلق به این مشتری نیست.');
      const all=await req(tx.objectStore('payments').getAll());if(amount>invoiceOutstanding(s,all))throw new Error('مبلغ از مانده تخصیص‌نیافته فاکتور بیشتر است.');}
    tx.objectStore('payments').add({id:makeId(),createdAt:isoNow(),customerId:customer.id,amount,method,saleId,note:String(input.note||'').slice(0,250)});await done;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
export async function addCheque(db,input){const amount=asPositiveInteger(input.amount,'مبلغ چک'),dueDate=dateInput(input.dueDate,'تاریخ سررسید');if(!dueDate)throw new Error('سررسید لازم است.');
  const tx=db.transaction(['suppliers','cheques'],'readwrite');const done=completed(tx);
  try{
    const s=await req(tx.objectStore('suppliers').get(input.supplierId));if(!s)throw new Error('تأمین‌کننده موجود نیست.');
    tx.objectStore('cheques').add({id:makeId(),createdAt:isoNow(),supplierId:s.id,supplierName:s.name,purchaseId:null,number:validName(input.number,'شماره چک'),bank:String(input.bank||'').slice(0,80),amount,issueDate:dateInput(input.issueDate,'تاریخ صدور')||tehranDate(),dueDate,status:'pending',note:String(input.note||'').slice(0,250)});await done;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
export async function setChequeStatus(db,id,status){if(!['pending','paid','returned','cancelled'].includes(status))throw new Error('وضعیت نامعتبر.');
  const tx=db.transaction('cheques','readwrite');const done=completed(tx);
  try{const row=await req(tx.objectStore('cheques').get(id));if(!row)throw new Error('چک یافت نشد.');if(row.status==='paid'&&status!=='paid')throw new Error('برای اصلاح چک تسویه‌شده باید سند اصلاحی ثبت شود.');
    tx.objectStore('cheques').put({...row,status,statusAt:isoNow()});await done;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
export async function addBulkProducts(db,rows,marginBps=1000){const margin=asInteger(marginBps,'حاشیه سود');if(margin>50000)throw new Error('درصد سود غیرمجاز است.');if(!Array.isArray(rows)||rows.length<1||rows.length>300)throw new Error('بین ۱ تا ۳۰۰ کالا در هر نوبت مجاز است.');
  const tx=db.transaction(['products','purchases','movements'],'readwrite');const done=completed(tx);
  try{
    const existing=(await req(tx.objectStore('products').getAll())).map(p=>p.name.trim().toLocaleLowerCase('fa'));
    const seen=new Set(existing);const now=isoNow();let created=0;
    for(const row of rows){const name=validName(row.name,'کالا');const normalized=name.toLocaleLowerCase('fa');if(seen.has(normalized))throw new Error(`کالای تکراری: ${name}`);seen.add(normalized);
      const kind=row.kind==='gram'?'gram':'piece';
      // Zero stock does not create a synthetic lot.
      const actualBase=kind==='gram'?asDecimalForOpening(row.stock):asInteger(row.stock||0,'موجودی');
      const replacementPrice=asInteger(row.replacementPrice||0,'قیمت جایگزینی');const lastBuyPrice=asInteger(row.lastBuyPrice||0,'قیمت خرید');
      const p={id:makeId(),createdAt:now,name,code:String(row.code||'').slice(0,30),category:String(row.category||'').slice(0,60),kind,lowBase:0,packBase:0,unitConfigs:{pack:0,carton:0,can:0},stockBase:actualBase,lastBuyPrice,replacementPrice,salePrice:calcSuggestedPrice(replacementPrice,margin),imageData:'',updatedAt:now};
      tx.objectStore('products').add(p);
      if(actualBase){const total=valueForQuantity(p,lastBuyPrice,actualBase),id=makeId();
        tx.objectStore('purchases').add({id,createdAt:now,productId:p.id,productName:name,supplierId:null,supplierName:'موجودی افتتاحیه',unit:kind==='gram'?'kg':'piece',quantity:String(row.stock),quantityBase:actualBase,remainingBase:actualBase,unitPrice:lastBuyPrice,total,paymentKind:'opening',expiryDate:dateInput(row.expiryDate,'تاریخ انقضا')});
        tx.objectStore('movements').add({id:makeId(),createdAt:now,productId:p.id,sourceType:'opening',sourceId:id,deltaBase:actualBase});
      }created++;
    }
    await done;return created;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
function asDecimalForOpening(value){return asDecimalMilli(String(value||'0'),'موجودی افتتاحیه');}
export async function replaceAll(db,snapshot){
  // Validate again before any destructive transaction, even if the caller already decrypted it.
  const {validateSnapshot}=await import('./backup.js');validateSnapshot(snapshot);
  const tx=db.transaction(TABLES,'readwrite');const done=completed(tx);try{
    for(const name of TABLES){const store=tx.objectStore(name);store.clear();for(const row of snapshot[name])store.add(row);}await done;
  }catch(e){abort(tx);await done.catch(()=>{});throw e;}
}
