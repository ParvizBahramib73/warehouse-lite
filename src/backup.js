import {TABLES} from './data.js';
const FORMAT='warehouse-lite-encrypted';
const MAX_FILE_SIZE=25*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const bytes64=bytes=>btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
const from64=str=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));

async function key(password,salt) {
  if(typeof password!=='string'||password.length<8) throw new Error('رمز پشتیبان باید حداقل ۸ کاراکتر باشد.');
  const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:250000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}

export function validateSnapshot(snapshot) {
  if(!snapshot||typeof snapshot!=='object'||![1,2].includes(snapshot.schemaVersion)) throw new Error('نسخه پشتیبان پشتیبانی نمی‌شود.');
  const rowsFor=table=>table==='visits'&&snapshot.schemaVersion===1&&!Array.isArray(snapshot.visits)?[]:snapshot[table];
  for(const table of TABLES){const rows=rowsFor(table);if(!Array.isArray(rows)||rows.length>100000)throw new Error('ساختار اطلاعات پشتیبان ناقص است.');
    const ids=new Set();for(const row of rows){if(!row||typeof row.id!=='string'||ids.has(row.id))throw new Error('شناسه‌های فایل پشتیبان نامعتبرند.');ids.add(row.id);}
  }
  const products=new Map(snapshot.products.map(x=>[x.id,x]));
  const customers=new Set(snapshot.customers.map(x=>x.id));
  const suppliers=new Set(snapshot.suppliers.map(x=>x.id));
  const sums=new Map([...products.keys()].map(id=>[id,0]));
  for(const p of products.values()){
    if(typeof p.name!=='string'||!['piece','gram'].includes(p.kind)||!Number.isSafeInteger(p.stockBase)||p.stockBase<0||!Number.isSafeInteger(p.lowBase)||p.lowBase<0||!Number.isSafeInteger(p.packBase)||p.packBase<0||!Number.isSafeInteger(p.salePrice)||p.salePrice<0)throw new Error('اطلاعات کالا در پشتیبان معتبر نیست.');
  }
  for(const row of snapshot.movements){if(!products.has(row.productId)||!Number.isSafeInteger(row.deltaBase)) throw new Error('گردش موجودی نامعتبر است.');sums.set(row.productId,sums.get(row.productId)+row.deltaBase);}
  for(const p of products.values())if(sums.get(p.id)!==p.stockBase)throw new Error('موجودی و گردش کالا در فایل پشتیبان با هم مطابقت ندارند.');
  for(const row of snapshot.purchases)if(!products.has(row.productId)||!suppliers.has(row.supplierId)||!Number.isSafeInteger(row.total)||row.total<0)throw new Error('سند خرید نامعتبر است.');
  for(const row of snapshot.sales){if(!customers.has(row.customerId)||!Array.isArray(row.lines)||!Number.isSafeInteger(row.total)||row.total<0)throw new Error('فاکتور نامعتبر است.');
    for(const line of row.lines)if(!products.has(line.productId)||!Number.isSafeInteger(line.amount)||line.amount<0)throw new Error('قلم فاکتور نامعتبر است.');
  }
  for(const row of snapshot.payments)if(!customers.has(row.customerId)||!Number.isSafeInteger(row.amount)||row.amount<0)throw new Error('دریافت وجه نامعتبر است.');
  const validDate=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return false;
    const [year,month,day]=value.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));
    return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
  };
  const visitKeys=new Set();
  for(const row of rowsFor('visits')){
    const key=row.customerId+'|'+row.plannedDate;
    if(!customers.has(row.customerId)||!validDate(row.plannedDate)||!['planned','purchased','small_purchase','no_purchase','unavailable','follow_up','rescheduled','not_needed','declined','other','cancelled'].includes(row.outcome)||String(row.note||'').length>500)throw new Error('سابقه مراجعه نامعتبر است.');
    if(visitKeys.has(key))throw new Error('برای یک مشتری در یک روز، سابقه مراجعه تکراری وجود دارد.');
    visitKeys.add(key);
    if(row.routeName!==undefined&&(typeof row.routeName!=='string'||row.routeName.length>80))throw new Error('نام مسیر در فایل پشتیبان نامعتبر است.');
    if(row.routeOrder!==undefined&&(!Number.isSafeInteger(row.routeOrder)||row.routeOrder<1))throw new Error('ترتیب مسیر در فایل پشتیبان نامعتبر است.');
    if(row.nextFollowUpDate&&!validDate(row.nextFollowUpDate))throw new Error('تاریخ پیگیری در فایل پشتیبان نامعتبر است.');
    if(['follow_up','rescheduled'].includes(row.outcome)&&(!validDate(row.nextFollowUpDate)||row.nextFollowUpDate<row.plannedDate))throw new Error('تاریخ پیگیری در فایل پشتیبان نامعتبر است.');
    if(row.outcome==='other'&&!String(row.note||'').trim())throw new Error('توضیح وضعیت مراجعه در فایل پشتیبان ثبت نشده است.');
  }
  for(const sale of snapshot.sales)for(const line of sale.lines)if(line.costAmount!==undefined&&line.costAmount!==null&&(!Number.isSafeInteger(line.costAmount)||line.costAmount<0))throw new Error('بهای تمام‌شده فاکتور نامعتبر است.');
  return Object.fromEntries(TABLES.map(t=>[t,rowsFor(t).length]));
}

export async function encryptBackup(data,password){
  const payload={...data,schemaVersion:2,visits:Array.isArray(data.visits)?data.visits:[],exportedAt:new Date().toISOString()};
  validateSnapshot(payload);
  const salt=crypto.getRandomValues(new Uint8Array(16));const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt),encoder.encode(JSON.stringify(payload)));
  return {format:FORMAT,formatVersion:1,createdAt:payload.exportedAt,crypto:{kdf:'PBKDF2-SHA256',iterations:250000,algorithm:'AES-256-GCM',salt:bytes64(salt),iv:bytes64(iv)},ciphertext:bytes64(new Uint8Array(encrypted))};
}

export async function decryptBackup(wrapper,password){
  if(!wrapper||wrapper.format!==FORMAT||wrapper.formatVersion!==1||wrapper.crypto?.algorithm!=='AES-256-GCM'||wrapper.crypto?.iterations!==250000)throw new Error('فرمت فایل پشتیبان شناخته‌شده نیست.');
  try{
    const salt=from64(wrapper.crypto.salt),iv=from64(wrapper.crypto.iv),cipher=from64(wrapper.ciphertext);
    if(salt.length!==16||iv.length!==12||cipher.length<16||cipher.length>MAX_FILE_SIZE)throw new Error('فرمت رمزنگاری فایل نامعتبر است.');
    const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv},await key(password,salt),cipher);
    const data=JSON.parse(decoder.decode(plaintext)); validateSnapshot(data);return {...data,schemaVersion:2,visits:Array.isArray(data.visits)?data.visits:[]};
  }catch(e){if(e.message==='نسخه پشتیبان پشتیبانی نمی‌شود.'||e.message?.includes('نامعتبر')||e.message?.includes('مطابقت'))throw e;
    throw new Error('رمز نادرست است یا فایل پشتیبان آسیب دیده است.');}
}

export function downloadBackup(wrapper){
  const blob=new Blob([JSON.stringify(wrapper)],{type:'application/octet-stream'});
  const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;
  const safe=wrapper.createdAt.replaceAll(':','-'); a.download=`warehouse-lite-${safe}.wlbackup`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);
}

export async function readBackupFile(file){
  if(!file||file.size>MAX_FILE_SIZE)throw new Error('حجم فایل پشتیبان نامعتبر یا بیش از حد مجاز است.');
  return JSON.parse(await file.text());
}
