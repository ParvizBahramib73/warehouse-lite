/** Anbar Man v0.2.1. All money is stored as safe integer IRR (rial). */
export const DEFAULT_MARGIN_BPS = 1000; // 10%
export const UNITS = Object.freeze({piece:'عدد',kg:'کیلوگرم',pack:'بسته',carton:'کارتن',can:'حلب'});
export const INVOICE_CUSTODY_NOTICE='تمامی محصولات فوق تا تسویه کامل نزد خریدار امانت میباشد';
export const normalizeDigits=value=>String(value??'').replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[٬,\s]/g,'').replace(/٫/g,'.');
export function asInteger(value,label='مقدار'){
  const text=normalizeDigits(value);
  if(!/^\d+$/.test(text))throw new Error(`${label} باید عدد صحیح غیرمنفی باشد.`);
  const n=Number(text);if(!Number.isSafeInteger(n))throw new Error(`${label} بیش از حد بزرگ است.`);return n;
}
export function asPositiveInteger(value,label='مقدار'){const n=asInteger(value,label);if(n<1)throw new Error(`${label} باید بیشتر از صفر باشد.`);return n;}
export function asDecimalMilli(value,label='مقدار'){
  const text=normalizeDigits(value);if(!/^\d+(?:\.\d{1,3})?$/.test(text))throw new Error(`${label} تا سه رقم اعشار مجاز است.`);
  const [a,b='']=text.split('.');const n=Number(a)*1000+Number(b.padEnd(3,'0'));if(!Number.isSafeInteger(n))throw new Error(`${label} بیش از حد بزرگ است.`);return n;
}
export function tehranDate(iso=new Date().toISOString()){
  const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
  const p=Object.fromEntries(pieces.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;
}
export function validDate(value,label='تاریخ'){if(value===''||value==null)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T12:00:00Z`))||new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)!==value)throw new Error(`${label} معتبر نیست.`);return value;
}
export function unitOptions(product){
  if(!product)return[];
  const entries=[[product.kind==='gram'?'kg':'piece',product.kind==='gram'?'کیلوگرم':'عدد']];
  for(const key of ['pack','carton','can'])if((product.unitConfigs?.[key]??(key==='pack'?product.packBase:0))>0)entries.push([key,UNITS[key]]);
  return entries;
}
export function packageBase(product,unit){
  if(unit==='kg'&&product.kind==='gram')return 1000;
  if(unit==='piece'&&product.kind==='piece')return 1;
  const amount=product.unitConfigs?.[unit]??(unit==='pack'?product.packBase:0);
  if(!['pack','carton','can'].includes(unit)||!Number.isSafeInteger(amount)||amount<1)throw new Error('واحد برای این محصول تعریف نشده است.');
  return amount;
}
export function parseBaseQuantity(product,unit,value){
  if(!product||!['piece','gram'].includes(product.kind))throw new Error('کالای نامعتبر.');
  if(unit==='kg'&&product.kind==='gram'){
    const grams=asDecimalMilli(value,'مقدار کیلوگرم');if(!grams)throw new Error('مقدار باید مثبت باشد.');return {base:grams,thousandths:grams};
  }
  const count=asPositiveInteger(value,'تعداد');const factor=packageBase(product,unit);const base=count*factor;
  if(!Number.isSafeInteger(base))throw new Error('مقدار بیش از حد بزرگ است.');
  return {base,thousandths:count*1000};
}
export function lineTotal(unitPrice,thousandths){
  const price=asInteger(unitPrice,'قیمت');if(!Number.isSafeInteger(thousandths)||thousandths<1)throw new Error('مقدار نامعتبر است.');
  const total=BigInt(price)*BigInt(thousandths);const rounded=(total+500n)/1000n;
  if(rounded>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('مبلغ بیش از حد بزرگ است.');return Number(rounded);
}
export function calcSuggestedPrice(replacementPrice,marginBps=DEFAULT_MARGIN_BPS){
  const price=asInteger(replacementPrice,'قیمت جایگزینی');const margin=asInteger(marginBps,'درصد سود');if(margin>100000)throw new Error('درصد سود بیش از حد است.');
  const n=(BigInt(price)*BigInt(10000+margin)+9999n)/10000n;
  if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('قیمت پیشنهادی بیش از حد بزرگ است.');return Number(n);
}
export function unitPriceFromBase(product,basePrice,unit){
  const factor=packageBase(product,unit);const divisor=product.kind==='gram'?1000:1;
  const result=(BigInt(asInteger(basePrice,'قیمت'))*BigInt(factor)+BigInt(Math.floor(divisor/2)))/BigInt(divisor);
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('قیمت بیش از حد بزرگ است.');return Number(result);
}
export function pricePerBaseUnit(product,unitPrice,unit){
  const factor=packageBase(product,unit),numerator=product.kind==='gram'?1000:1;
  const result=(BigInt(asInteger(unitPrice,'قیمت'))*BigInt(numerator)+BigInt(Math.floor(factor/2)))/BigInt(factor);
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('قیمت بیش از حد بزرگ است.');return Number(result);
}
export function valueForQuantity(product,basePrice,baseAmount){
  const divisor=product.kind==='gram'?1000n:1n;
  const amount=(BigInt(asInteger(basePrice,'قیمت'))*BigInt(asInteger(baseAmount,'مقدار'))+divisor/2n)/divisor;
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('ارزش موجودی بیش از حد بزرگ است.');return Number(amount);
}
export function defaultUnitPrice(product,unit,marginBps=DEFAULT_MARGIN_BPS){
  return unitPriceFromBase(product,calcSuggestedPrice(product.replacementPrice??product.lastBuyPrice??0,marginBps),unit);
}
export function stockLabel(p,base=p.stockBase){return `${new Intl.NumberFormat('fa-IR',{maximumFractionDigits:3}).format(p.kind==='gram'?base/1000:base)} ${p.kind==='gram'?'کیلو':'عدد'}`;}
export function money(value){return `${new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(value??0)} ریال`;}
export function customerBalance(id,sales,payments,returns=[]){return sales.filter(x=>x.customerId===id&&!x.voided).reduce((s,x)=>s+x.total,0)-payments.filter(x=>x.customerId===id).reduce((s,x)=>s+x.amount,0)-returns.filter(x=>x.customerId===id).reduce((s,x)=>s+x.total,0);}
export function invoiceOutstanding(sale,payments,returns=[]){return Math.max(0,sale.total-payments.filter(x=>x.saleId===sale.id).reduce((a,x)=>a+x.amount,0)-returns.filter(x=>x.saleId===sale.id).reduce((a,x)=>a+x.total,0));}
export function inventoryValues(products,purchases){
  return products.reduce((acc,p)=>{
    const lots=purchases.filter(x=>x.productId===p.id && x.remainingBase>0);
    const byPurchase=lots.reduce((s,x)=>s+Math.round(x.total*(x.remainingBase/x.quantityBase)),0);
    acc.purchase+=byPurchase;
    acc.replacement+=valueForQuantity(p,p.replacementPrice||p.lastBuyPrice||0,p.stockBase);
    acc.sale+=valueForQuantity(p,p.salePrice||calcSuggestedPrice(p.replacementPrice||p.lastBuyPrice||0),p.stockBase);
    return acc;
  },{purchase:0,replacement:0,sale:0});
}
export function validateSaleLines(lines,products,marginBps=DEFAULT_MARGIN_BPS){
  if(!Array.isArray(lines)||!lines.length)throw new Error('حداقل یک قلم کالا لازم است.');
  const map=new Map(products.map(p=>[p.id,p]));const required=new Map();let total=0,replacementCost=0;
  const normalized=lines.map(line=>{
    const p=map.get(line.productId);if(!p)throw new Error('کالای انتخاب‌شده وجود ندارد.');
    const qty=parseBaseQuantity(p,line.unit,line.quantity);
    const price=asInteger(line.unitPrice,'قیمت فروش');const amount=lineTotal(price,qty.thousandths);
    const cost=valueForQuantity(p,p.replacementPrice??p.lastBuyPrice??0,qty.base);
    total+=amount;replacementCost+=cost;
    if(!Number.isSafeInteger(total)||!Number.isSafeInteger(replacementCost))throw new Error('مبلغ بیش از حد بزرگ است.');
    required.set(p.id,(required.get(p.id)||0)+qty.base);
    return {productId:p.id,productName:p.name,unit:line.unit,quantity:normalizeDigits(line.quantity),quantityBase:qty.base,unitPrice:price,amount,replacementCost:cost,replacementProfit:amount-cost,quotedReplacementPrice:p.replacementPrice??p.lastBuyPrice??0,suggestedUnitPrice:defaultUnitPrice(p,line.unit,marginBps)};
  });
  for(const [id,qty] of required){const p=map.get(id);if(!Number.isSafeInteger(qty)||qty>p.stockBase)throw new Error(`موجودی «${p.name}» کافی نیست.`);}
  return {normalized,required,total,replacementCost,replacementProfit:total-replacementCost};
}
export const makeId=()=>crypto.randomUUID();
export const isoNow=()=>new Date().toISOString();
