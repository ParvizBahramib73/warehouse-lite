import {TABLES} from './data.js';
import {parseBaseQuantity,lineTotal} from './domain.js';
const FORMAT='warehouse-lite-preview-2026-encrypted';
const MAX_FILE_SIZE=25*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const b64=bytes=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
const from64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
async function key(password,salt){
  if(typeof password!=='string'||password.length<8)throw new Error('رمز پشتیبان باید حداقل ۸ کاراکتر باشد.');
  const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const goodMoney=n=>Number.isSafeInteger(n)&&n>=0;
export function validateSnapshot(s){
  if(!s||s.schemaVersion!==2||s.currency!=='IRR')throw new Error('فایل پشتیبان با ساختار ریالی نسخه ۰.۲ سازگار نیست. اطلاعات نسخه ۰.۱.۸ بدون تبدیل قابل واردکردن نیست.');
  const maps={};for(const table of TABLES){const rows=s[table];if(!Array.isArray(rows)||rows.length>100000)throw new Error('جدول پشتیبان ناقص است.');
    const map=new Map();for(const row of rows){if(!row||typeof row.id!=='string'||map.has(row.id))throw new Error('شناسه تکراری در پشتیبان.');map.set(row.id,row);}maps[table]=map;}
  const fromLots=new Map(),fromMoves=new Map(),lotConsumption=new Map(),expectedMoves=new Map();
  for(const p of s.products){if(!p.name||!['piece','gram'].includes(p.kind)||!goodMoney(p.stockBase)||!goodMoney(p.lastBuyPrice)||!goodMoney(p.replacementPrice)||!goodMoney(p.salePrice)||!goodMoney(p.lowBase))throw new Error('مقادیر کالای پشتیبان نامعتبر است.');
    if(p.imageData&&(!/^data:image\/(?:webp|png|jpeg);base64,/.test(p.imageData)||p.imageData.length>400000))throw new Error('تصویر کالای پشتیبان نامعتبر است.');
    fromLots.set(p.id,0);fromMoves.set(p.id,0);expectedMoves.set(p.id,0);}
  for(const lot of s.purchases){const p=maps.products.get(lot.productId);
    if(!p||(lot.supplierId&&!maps.suppliers.has(lot.supplierId))||!goodMoney(lot.total)||!goodMoney(lot.unitPrice)||!goodMoney(lot.quantityBase)||lot.quantityBase<1||!goodMoney(lot.remainingBase)||lot.remainingBase>lot.quantityBase)throw new Error('اطلاعات خرید در پشتیبان ناسازگار است.');
    let qty;try{qty=parseBaseQuantity(p,lot.unit,lot.quantity);}catch{throw new Error('مقدار خرید در پشتیبان نامعتبر است.');}
    if(qty.base!==lot.quantityBase||lineTotal(lot.unitPrice,qty.thousandths)!==lot.total)throw new Error('جمع و مقدار سند خرید با هم سازگار نیست.');
    fromLots.set(p.id,fromLots.get(p.id)+lot.remainingBase);expectedMoves.set(p.id,expectedMoves.get(p.id)+lot.quantityBase);
    lotConsumption.set(lot.id,0);
  }
  const saleDebitPerProduct=new Map();
  for(const sale of s.sales){if(!maps.customers.has(sale.customerId)||!Array.isArray(sale.lines)||!sale.lines.length||!goodMoney(sale.total)||!goodMoney(sale.replacementCost)||!goodMoney(sale.acquisitionCost))throw new Error('فاکتور نامعتبر است.');
    let total=0,rcost=0,acost=0;const salesRequired=new Map(),allocations=new Map();
    for(const line of sale.lines){const p=maps.products.get(line.productId);if(!p||!goodMoney(line.amount)||!goodMoney(line.replacementCost)||!goodMoney(line.quantityBase)||!goodMoney(line.unitPrice))throw new Error('قلم فروش نامعتبر است.');
      let qty;try{qty=parseBaseQuantity(p,line.unit,line.quantity);}catch{throw new Error('مقدار قلم فروش نامعتبر است.');}
      if(lineTotal(line.unitPrice,qty.thousandths)!==line.amount||qty.base!==line.quantityBase)throw new Error('مبلغ یا مقدار قلم فاکتور با هم مطابقت ندارند.');
      total+=line.amount;rcost+=line.replacementCost;salesRequired.set(p.id,(salesRequired.get(p.id)||0)+qty.base);
    }
    for(const a of sale.allocations||[]){const lot=maps.purchases.get(a.purchaseId);
      if(!lot||lot.productId!==a.productId||!goodMoney(a.quantityBase)||a.quantityBase<1||!goodMoney(a.acquisitionCost))throw new Error('تخصیص دوره خرید نامعتبر است.');
      allocations.set(a.productId,(allocations.get(a.productId)||0)+a.quantityBase);lotConsumption.set(lot.id,lotConsumption.get(lot.id)+a.quantityBase);acost+=a.acquisitionCost;
    }
    for(const [id,amount] of salesRequired){if(allocations.get(id)!==amount)throw new Error('تخصیص دوره خرید با مقدار فروش تطبیق ندارد.');saleDebitPerProduct.set(id,(saleDebitPerProduct.get(id)||0)+amount);}
    if(total!==sale.total||rcost!==sale.replacementCost||sale.replacementProfit!==sale.total-rcost||acost!==sale.acquisitionCost||sale.acquisitionProfit!==sale.total-acost)throw new Error('جمع فاکتور و سود با اقلام مطابقت ندارند.');
  }
  for(const lot of s.purchases)if(lot.remainingBase!==lot.quantityBase-lotConsumption.get(lot.id))throw new Error('باقی‌مانده دوره خرید با فروش‌ها سازگار نیست.');
  for(const row of s.movements){if(!maps.products.has(row.productId)||!Number.isSafeInteger(row.deltaBase))throw new Error('گردش کالا نامعتبر است.');fromMoves.set(row.productId,fromMoves.get(row.productId)+row.deltaBase);}
  for(const p of s.products){const expected=expectedMoves.get(p.id)-(saleDebitPerProduct.get(p.id)||0);
    if(p.stockBase!==fromLots.get(p.id)||p.stockBase!==fromMoves.get(p.id)||p.stockBase!==expected)throw new Error(`موجودی ${p.name} با گردش و دوره‌های خرید مطابقت ندارد.`);}
  const paid=new Map();for(const p of s.payments){if(!maps.customers.has(p.customerId)||!goodMoney(p.amount)||p.amount===0)throw new Error('دریافت وجه نامعتبر است.');
    if(p.saleId){const sale=maps.sales.get(p.saleId);if(!sale||sale.customerId!==p.customerId)throw new Error('ارتباط دریافت وجه و فاکتور نامعتبر است.');paid.set(p.saleId,(paid.get(p.saleId)||0)+p.amount);}}
  for(const [id,amount] of paid)if(amount>maps.sales.get(id).total)throw new Error('دریافت بیش از مبلغ فاکتور است.');
  for(const c of s.cheques)if(!maps.suppliers.has(c.supplierId)||!goodMoney(c.amount)||!c.amount||!['pending','paid','returned','cancelled'].includes(c.status)||!c.number||(c.purchaseId&&!maps.purchases.has(c.purchaseId)))throw new Error('اطلاعات چک نامعتبر است.');
  if(s.settings.length>1||s.settings.some(x=>x.id!=='main'||!goodMoney(x.marginBps)||!goodMoney(x.expiryWarningDays)))throw new Error('تنظیمات نامعتبر است.');
  return Object.fromEntries(TABLES.map(t=>[t,s[t].length]));
}
export async function encryptBackup(data,password){
  const payload={schemaVersion:2,currency:'IRR',exportedAt:new Date().toISOString(),...data};validateSnapshot(payload);
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt),encoder.encode(JSON.stringify(payload)));
  return {format:FORMAT,formatVersion:2,createdAt:payload.exportedAt,crypto:{kdf:'PBKDF2-SHA256',iterations:250000,algorithm:'AES-256-GCM',salt:b64(salt),iv:b64(iv)},ciphertext:b64(new Uint8Array(cipher))};
}
export async function decryptBackup(wrapper,password){
  if(!wrapper||wrapper.format!==FORMAT||wrapper.formatVersion!==2||wrapper.crypto?.algorithm!=='AES-256-GCM'||wrapper.crypto?.iterations!==250000)throw new Error('این فایل با پشتیبان نسخه ریالی ۰.۲ سازگار نیست؛ تبدیل پشتیبان قدیمی هنوز انجام نشده است.');
  let data;try{
    const salt=from64(wrapper.crypto.salt),iv=from64(wrapper.crypto.iv),cipher=from64(wrapper.ciphertext);
    if(salt.length!==16||iv.length!==12||cipher.length<16||cipher.length>MAX_FILE_SIZE)throw new Error('داده رمزگذاری نامعتبر است.');
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(password,salt),cipher);data=JSON.parse(decoder.decode(plaintext));
  }catch{throw new Error('رمز اشتباه است یا فایل آسیب‌دیده است.');}
  validateSnapshot(data);return data;
}
export function downloadBackup(wrapper){const blob=new Blob([JSON.stringify(wrapper)],{type:'application/octet-stream'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`anbar-man-v02-${wrapper.createdAt.replaceAll(':','-')}.wlbackup`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function readBackupFile(file){if(!file||file.size>MAX_FILE_SIZE)throw new Error('فایل بیش از حد مجاز است.');try{return JSON.parse(await file.text());}catch{throw new Error('ساختار فایل پشتیبان خراب است.');}}
