import {openDb,readAll,addRecord,updateProduct,updateSettings,addPurchase,addSale,addSaleReturn,addPayment,addCheque,setChequeStatus,addBulkProducts,replaceAll,DEFAULT_SETTINGS} from './data.js';
import {asInteger,asDecimalMilli,parseBaseQuantity,money,stockLabel,unitOptions,UNITS,defaultUnitPrice,calcSuggestedPrice,inventoryValues,validateSaleLines,customerBalance,invoiceOutstanding,INVOICE_CUSTODY_NOTICE,tehranDate,normalizeDigits,validDate} from './domain.js';
import {buildReturnPlan,creditedForSale,returnProfitDelta} from './returns.js';
import {encryptBackup,decryptBackup,downloadBackup,readBackupFile} from './backup.js';
import {esc,dateFa,dayFa} from './utils.js';
import {formatJalaliDate,parseJalaliDate,jalaliParts,jalaliMonthNames,jalaliMonthDays,jalaliToIso,jalaliWeekdayIndex,toPersianDigits} from './jalali.js';
import {formatRialInput,digitsBeforeCaret,caretForDigitCount} from './rial-input.js';
const app=document.querySelector('#app');
const sections={dashboard:[['overview','نمای کلی'],['alerts','هشدارها'],['profits','گزارش سود']],products:[['list','فهرست و جزئیات'],['add','کالای جدید'],['bulk','ورود یکجا']],purchases:[['new','ثبت خرید'],['history','دوره‌های خرید'],['suppliers','تأمین‌کنندگان']],sales:[['new','صدور فاکتور'],['invoices','فاکتورها'],['returns','مرجوعی‌ها'],['receivables','سررسیدها']],customers:[['list','حساب مشتریان'],['add','مشتری جدید'],['payments','دریافت وجه']],cheques:[['list','چک‌های پرداختی'],['new','ثبت چک']],settings:[['personalize','شخصی‌سازی'],['backup','پشتیبان'],['info','راهنما'],['support','پشتیبانی']]};
const nav=[['dashboard','داشبورد','⌂'],['products','کالاها','▦'],['purchases','خرید','↓'],['sales','فروش','↑'],['customers','مشتریان','♙'],['cheques','چک‌ها','◷'],['settings','تنظیمات','⚙']];
const weekday=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
let calendarWidget=null,calendarYear,calendarMonth;
const creatorUrl='https://parvizbahramib73.github.io/personal-brand-website/';
const moneyFields=new Set(['replacementPrice','salePrice','lastBuyPrice','unitPrice','amount','paidAmount']);
let db,data,page='dashboard',sub='overview',toastTimer,importCandidate=null,bulkCandidate=null,customerSort='debt',saleRows=[{productId:'',search:'',unit:'',quantity:'1',unitPrice:''}],saleState={customerId:'',paidAmount:'0',paymentMethod:'cash',dueDate:''};
const $=(q,root=document)=>root.querySelector(q);
const formVal=(form,key)=>String(new FormData(form).get(key)??'').trim();
const selectOpt=(value,label,selected='')=>`<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`;
const dropdown=(list,chosen='',placeholder='انتخاب کنید')=>`<option value="">${placeholder}</option>${list.map(x=>selectOpt(x.id,x.name,chosen)).join('')}`;
const sconfig=()=>({...DEFAULT_SETTINGS,...data?.settings?.find(s=>s.id==='main')});
function msg(text,type='ok'){$('.toast')?.remove();clearTimeout(toastTimer);const el=document.createElement('div');el.className=`toast ${type==='error'?'error':''}`;el.role=type==='error'?'alert':'status';el.textContent=text;document.body.append(el);toastTimer=setTimeout(()=>el.remove(),5500);}
function displayDate(date){if(!date)return '—';try{return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'medium',timeZone:'Asia/Tehran'}).format(new Date(`${date}T12:00:00Z`));}catch{return esc(date);}}
function dayGap(date){if(!date)return Infinity;const one=Date.parse(date+'T00:00:00Z'),two=Date.parse(tehranDate()+'T00:00:00Z');return Math.round((one-two)/86400000);}
function pBadge(p){return p.stockBase<=p.lowBase?'<span class="tag low">کم‌موجود</span>':'<span class="tag good">موجود</span>';}
function formatTime(t){try{return dateFa(t);}catch{return '—';}}
const card=(title,body,extra='')=>`<section class="card"><div class="card-header"><h2>${title}</h2>${extra}</div>${body}</section>`;
const field=(label,control,wide=false,hint='')=>`<div class="field ${wide?'wide':''}"><label>${label}</label>${control}${hint?`<span class="hint">${hint}</span>`:''}</div>`;
const input=(name,opts={})=>{
 if(opts.type==='date')return `<div class="jalali-date-field"><input type="hidden" data-date-iso name="${esc(name)}" value="${esc(opts.value||'')}"/><input type="text" data-jalali-input dir="ltr" inputmode="numeric" autocomplete="off" aria-label="${esc(({expiryDate:'تاریخ انقضا',issueDate:'تاریخ صدور چک',chequeIssueDate:'تاریخ صدور چک',chequeDueDate:'سررسید چک',dueDate:'تاریخ تسویه یا سررسید'})[name]||'تاریخ شمسی')}" placeholder="۱۴۰۵/۰۹/۰۷" ${opts.required?'required':''} value="${esc(formatJalaliDate(opts.value||''))}"/><button type="button" class="jalali-open" data-jalali-open aria-label="باز کردن تقویم شمسی" title="انتخاب از تقویم شمسی">▦</button></div>`;
 const isMoney=opts.mode==='numeric'&&moneyFields.has(name);
 const value=isMoney?formatRialInput(opts.value??''):opts.value;
 return `<input name="${esc(name)}" ${opts.type?`type="${opts.type}"`:''} ${opts.required?'required':''} ${opts.placeholder?`placeholder="${esc(opts.placeholder)}"`:''} ${value!==undefined?`value="${esc(value)}"`:''} ${opts.mode?`inputmode="${opts.mode}"`:''} ${isMoney?'data-money-input dir="ltr" lang="en" class="money-input" aria-label="مبلغ ریالی"':''} ${opts.zero?'data-zero-clear':''} ${opts.minlength?`minlength="${opts.minlength}"`:''} ${opts.maxlength?`maxlength="${opts.maxlength}"`:''}/>`;
};
const submit=label=>`<div class="form-footer"><button class="btn primary full" type="submit">${label}</button></div>`;
function updateJalaliText(textInput,normalize=false){
 const widget=textInput.closest('.jalali-date-field'),hidden=widget?.querySelector('[data-date-iso]');
 if(!hidden)return;
 try{
  const iso=parseJalaliDate(textInput.value);
  hidden.value=iso;textInput.setCustomValidity('');
  if(normalize&&iso)textInput.value=formatJalaliDate(iso);
 }catch(error){hidden.value='';textInput.setCustomValidity(error.message||'تاریخ شمسی نامعتبر است.');}
}
function calendarMarkup(){
 const first=jalaliToIso(calendarYear,calendarMonth,1);
 const offset=jalaliWeekdayIndex(first),days=jalaliMonthDays(calendarYear,calendarMonth);
 const selected=calendarWidget?.querySelector('[data-date-iso]')?.value||'';
 const cells=Array.from({length:offset},()=>'<span class="cal-blank" aria-hidden="true"></span>');
 for(let day=1;day<=days;day++){
  const iso=jalaliToIso(calendarYear,calendarMonth,day);
  cells.push(`<button type="button" data-jalali-day="${day}" class="cal-day ${selected===iso?'selected':''}" ${selected===iso?'aria-current="date"':''} aria-label="${toPersianDigits(day)} ${jalaliMonthNames[calendarMonth-1]} ${toPersianDigits(calendarYear)}">${toPersianDigits(day)}</button>`);
 }
 return `<div class="cal-top"><strong id="calendar-heading">انتخاب تاریخ شمسی</strong><button type="button" data-calendar-close class="cal-close" aria-label="بستن">×</button></div>
  <div class="cal-month"><button type="button" data-calendar-move="-1" aria-label="ماه قبل">❮</button><strong>${jalaliMonthNames[calendarMonth-1]} ${toPersianDigits(calendarYear)}</strong><button type="button" data-calendar-move="1" aria-label="ماه بعد">❯</button></div>
  <div class="cal-weekdays">${['ش','ی','د','س','چ','پ','ج'].map((x,i)=>`<span aria-label="${['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'][i]}">${x}</span>`).join('')}</div>
  <div class="cal-grid">${cells.join('')}</div><div class="cal-bottom"><button type="button" data-calendar-today>امروز</button><button type="button" data-calendar-clear>پاک کردن تاریخ</button></div>`;
}
function openJalaliCalendar(button){
 calendarWidget=button.closest('.jalali-date-field');
 const raw=calendarWidget.querySelector('[data-date-iso]').value||tehranDate();
 const parts=jalaliParts(raw);calendarYear=parts.year;calendarMonth=parts.month;
 let dialog=document.getElementById('jalali-calendar-dialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='jalali-calendar-dialog';dialog.className='jalali-dialog';dialog.setAttribute('aria-labelledby','calendar-heading');document.body.append(dialog);}
 dialog.innerHTML=calendarMarkup();dialog.showModal();
}
function selectJalaliIso(iso){
 const text=calendarWidget?.querySelector('[data-jalali-input]');
 if(!text)return;
 text.value=formatJalaliDate(iso);updateJalaliText(text);
 document.getElementById('jalali-calendar-dialog')?.close();text.focus();
}
function applyTheme(){const theme=sconfig().theme;document.documentElement.setAttribute('data-theme',theme);document.documentElement.style.colorScheme=theme==='dark'?'dark':theme==='light'?'light':'light dark';}
async function refresh(){data=await readAll(db);applyTheme();render();}
function setPage(p,s){if(!sections[p])return;page=p;sub=sections[p].some(x=>x[0]===s)?s:sections[p][0][0];render();window.scrollTo({top:0,behavior:'instant'});}
function render(){if(!data)return;const cfg=sconfig();
  app.innerHTML=`<div class="layout"><aside class="sidebar"><div class="logo"><div class="logo-mark">◈</div><div><strong>${esc(cfg.businessName||'انبار من')}</strong><span>نسخه ۰.۲.۲ · تقویم شمسی</span></div></div>
    <nav class="nav-list" aria-label="منوهای اصلی">${nav.map(([id,name,icon])=>`<div><button class="nav ${id===page?'active':''}" data-nav="${id}" ${id===page?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span>${name}</button>${id===page?`<div class="side-sub">${sections[id].map(([sid,label])=>`<button type="button" class="subnav ${sid===sub?'active':''}" data-sub="${sid}">${label}</button>`).join('')}</div>`:''}</div>`).join('')}</nav>
    <div class="side-footer"><strong>انبار من · ۰.۲.۲</strong><br>ذخیره آفلاین روی همین دستگاه؛ پشتیبان منظم فراموش نشود.</div></aside>
    <main class="main"><header class="topbar"><div><h1>${esc(nav.find(x=>x[0]===page)?.[1]||'انبار من')}</h1><div class="top-sub">مبالغ ریالی · تقویم شمسی · ذخیره روی همین دستگاه</div></div><div class="top-right"><span class="pill ${navigator.onLine?'ok':'offline'}">${navigator.onLine?'● آماده کار آفلاین':'● آفلاین'}</span></div></header>

    <div class="tabs section-tabs" aria-label="زیرمنو">${sections[page].map(([id,label])=>`<button class="tab ${id===sub?'active':''}" data-sub="${id}" ${id===sub?'aria-current="page"':''}>${label}</button>`).join('')}</div>
    ${content()}</main><nav class="mobile-nav" aria-label="ناوبری موبایل">${nav.map(([id,label,icon])=>`<button class="mob ${id===page?'active':''}" data-nav="${id}"><span aria-hidden="true">${icon}</span>${label}</button>`).join('')}</nav></div>`;
  if(page==='sales'&&sub==='new')updateSaleTotal();
}
function content(){switch(page){case 'dashboard':return dashboard();case 'products':return products();case 'purchases':return purchases();case 'sales':return sales();case 'customers':return customers();case 'cheques':return cheques();default:return settings();}}
function tiles(items){return `<div class="grid stats">${items.map(([title,val,icon])=>`<section class="stat"><div class="stat-icon green">${icon}</div><div class="stat-label">${title}</div><div class="stat-value mono">${val}</div></section>`).join('')}</div>`;}
function listEmpty(message){return `<div class="empty"><span class="empty-icon">□</span><strong>${message}</strong></div>`;}
function expiryItems(){const threshold=sconfig().expiryWarningDays;return data.purchases.filter(x=>x.remainingBase>0&&x.expiryDate&&dayGap(x.expiryDate)<=threshold).sort((a,b)=>a.expiryDate.localeCompare(b.expiryDate));}
function debtItems(){return data.sales.filter(x=>x.dueDate&&invoiceOutstanding(x,data.payments,data.returns)>0&&dayGap(x.dueDate)<=7).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));}
function chequeDue(){return data.cheques.filter(x=>x.status==='pending'&&dayGap(x.dueDate)<=7).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));}
function dashboard(){const vals=inventoryValues(data.products,data.purchases),debt=data.customers.reduce((a,c)=>a+Math.max(0,customerBalance(c.id,data.sales,data.payments,data.returns)),0);
  const exp=expiryItems(),dues=debtItems(),cheq=chequeDue(),low=data.products.filter(p=>p.stockBase<=p.lowBase),today=tehranDate();
  const todaySales=data.sales.filter(s=>tehranDate(s.createdAt)===today);
  const todayReturns=data.returns.filter(r=>tehranDate(r.createdAt)===today);
  if(sub==='overview')return `${tiles([['ارزش بر پایه خرید',money(vals.purchase),'◈'],['ارزش جایگزینی روز',money(vals.replacement),'↗'],['ارزش فروش امروز',money(vals.sale),'▣'],['مانده مشتریان',money(debt),'◷']])}
    <div class="quick-actions"><button class="quick" data-nav="sales">🧾 ثبت فروش</button><button class="quick" data-nav="purchases">📥 ثبت خرید</button><button class="quick" data-nav="products" data-to-sub="list">📦 بررسی کالا</button></div>
    ${card('وضعیت فوری',`<div class="grid stats"><div>موجودی کم: <b>${low.length}</b></div><div>دوره نزدیک انقضا: <b>${exp.length}</b></div><div>فاکتور نزدیک سررسید: <b>${dues.length}</b></div><div>چک نیازمند پیگیری: <b>${cheq.length}</b></div></div><p class="small muted">ارزش خرید از دوره‌های باقی‌مانده محاسبه می‌شود؛ قیمت‌های جایگزین و فروش توسط کاربر قابل ویرایش‌اند.</p>`)}
    ${card('امروز',`<p>فروش ثبت‌شده: <b>${money(todaySales.reduce((a,x)=>a+x.total,0)-todayReturns.reduce((a,x)=>a+x.total,0))}</b></p><p>سود جایگزینی بر اساس قیمت زمان صدور: <b>${money(todaySales.reduce((a,x)=>a+(x.replacementProfit||0),0)-todayReturns.reduce((a,x)=>a+returnProfitDelta(x),0))}</b></p>`)}
    `;
  if(sub==='profits')return `${tiles([['فروش خالص پس از مرجوعی',money(data.sales.reduce((s,x)=>s+x.total,0)-data.returns.reduce((s,r)=>s+r.total,0)),'▣'],['سود جایگزینی',money(data.sales.reduce((s,x)=>s+(x.replacementProfit||0),0)-data.returns.reduce((s,r)=>s+returnProfitDelta(r),0)),'↗'],['سود تاریخی خرید',money(data.sales.reduce((s,x)=>s+(x.acquisitionProfit||0),0)-data.returns.reduce((s,r)=>s+returnProfitDelta(r,'acquisition'),0)),'◈'],['ارزش جایگزینی مانده',money(vals.replacement),'□']])}
    ${card('نحوه محاسبه',`<p>سود جایگزینی = فروش فاکتور − هزینه جایگزینی ثبت‌شده هنگام فروش. سود تاریخی = فروش − هزینه دوره‌های خرید مصرف‌شده (تقریبی). مرجوعی‌ها از فروش و سود کسر می‌شوند و هزینه کالای آسیب‌دیده باقی می‌ماند.</p><p class="small muted">این ارقام سود ناخالص‌اند؛ هزینه حمل، مالیات، ضایعات، تورم نقدینگی و هزینه‌های عملیاتی در آن منظور نشده است.</p>`)}`;
  return `${card('کالاهای رو به انقضا',exp.length?`<div class="list">${exp.slice(0,30).map(x=>`<div class="list-row"><strong>${esc(x.productName)}</strong><span class="grow">موجودی دوره: ${stockLabel(data.products.find(p=>p.id===x.productId),x.remainingBase)}</span><span class="tag ${dayGap(x.expiryDate)<0?'red':'low'}">${displayDate(x.expiryDate)} · ${dayGap(x.expiryDate)} روز</span></div>`).join('')}</div>`:listEmpty('موردی در بازه هشدار نیست.'))}
    ${card('فاکتورهای سررسیددار',dues.length?`<div class="list">${dues.map(x=>`<div class="list-row"><strong>${esc(x.customerName)}</strong><span class="grow">${esc(x.invoiceNo)} · ${displayDate(x.dueDate)}</span><b>${money(invoiceOutstanding(x,data.payments,data.returns))}</b></div>`).join('')}</div><p class="small muted">دریافت‌های بدون اتصال به فاکتور در این هشدار تخصیص داده نمی‌شوند.</p>`:listEmpty('فاکتور دارای سررسید نزدیک ثبت نشده است.'))}
    ${card('چک‌های سررسیددار',cheq.length?`<div class="list">${cheq.map(x=>`<div class="list-row"><strong>${esc(x.supplierName)}</strong><span class="grow">چک ${esc(x.number)} · ${displayDate(x.dueDate)}</span><b>${money(x.amount)}</b></div>`).join('')}</div>`:listEmpty('چک نزدیک سررسید نیست.'))}`;
}
function productPicker(selected='',search='',kind='purchase',idx=''){
  const p=data.products.find(x=>x.id===selected);return `<div class="product-picker" data-product-picker data-kind="${kind}" data-index="${idx}">
   <input type="search" name="productSearch" data-product-query autocomplete="off" placeholder="چند حرف نام یا کد کالا را بنویسید" value="${esc(search||p?.name||'')}" role="combobox" aria-autocomplete="list" aria-expanded="false"/>
   <input type="hidden" name="productId" value="${esc(selected)}"/><div class="suggestions" role="listbox" hidden></div></div>`;
}
function productRows(){const list=[...data.products].sort((a,b)=>a.name.localeCompare(b.name,'fa'));
 return list.length?`<div class="field wide"><input type="search" id="product-list-filter" placeholder="جست‌وجوی نام یا کد کالا" aria-label="جست‌وجوی کالا"/></div>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>موجودی</th><th>خرید آخر</th><th>جایگزینی</th><th>فروش</th><th>جزئیات</th></tr></thead><tbody>
 ${list.map(p=>`<tr data-filter-row="${esc((p.name+' '+p.code).toLocaleLowerCase('fa'))}"><td class="name-cell"><strong>${esc(p.name)}</strong><small>${esc(p.code||p.category||'—')}</small></td><td>${stockLabel(p)} ${pBadge(p)}</td><td>${money(p.lastBuyPrice)}</td><td>${money(p.replacementPrice)}</td><td>${money(p.salePrice)}</td><td><button class="btn outline sm" data-product-detail="${esc(p.id)}">مشخصات و ویرایش</button></td></tr>`).join('')}
 </tbody></table></div>`:listEmpty('هنوز کالایی ثبت نشده است.');
}
function products(){if(sub==='list')return card('فهرست کالاها',productRows(),`<span class="tag">${data.products.length} کالا</span>`);
 if(sub==='add')return card('ثبت کالا و واحدهای فروش',`<form data-form="product" class="form-grid">
 ${field('نام کالا *',input('name',{required:true,placeholder:'مثلاً روغن قنادی',maxlength:100}),true)}
 ${field('کد کالا',input('code',{maxlength:30}))}${field('دسته‌بندی',input('category',{maxlength:60}))}
 ${field('واحد پایه',`<select name="kind"><option value="piece">عدد</option><option value="gram">کیلوگرم / گرم</option></select>`)}
 ${field('تعداد / کیلو در بسته',input('packSize',{mode:'decimal',placeholder:'مثلاً ۱۲ یا ۵'}))}
 ${field('تعداد / کیلو در کارتن',input('cartonSize',{mode:'decimal'}))}${field('تعداد / کیلو در حلب',input('canSize',{mode:'decimal'}))}
 ${field('حد هشدار موجودی',input('low',{value:'0',mode:'decimal',zero:true}))}
 ${field('قیمت جایگزینی هر عدد / کیلو (ریال)',input('replacementPrice',{value:'0',mode:'numeric',zero:true,required:true}))}
 ${field('قیمت فروش دستی (ریال)',input('salePrice',{mode:'numeric',placeholder:'خالی = پیشنهاد بر پایه سود ۱۰٪'}),false,'اگر خالی باشد درصد سود پیش‌فرض اعمال می‌شود.')}
 ${field('عکس محصول',input('image',{type:'file'}),true,'تصویر کوچک‌شده فقط روی همین دستگاه ذخیره می‌شود.')}
 ${submit('ثبت کالای جدید')}</form>`);
 if(sub==='bulk')return `${card('ورود گروهی موجودی افتتاحیه',`<p class="small muted">لیست را از یک جدول، خروجی اکسل یا متن آماده‌شده توسط یک ابزار هوش مصنوعی وارد کنید. پیش‌نمایش و تأیید نهایی ضروری است؛ این برنامه خودش به سرویس هوش مصنوعی متصل نیست.</p>
 <p class="small muted">هر ردیف با «;» جدا شود: نام ; نوع واحد (عدد/کیلو) ; موجودی ; قیمت خرید ریالی ; قیمت جایگزین ریالی ; تاریخ انقضای شمسی ۱۴۰۵/۰۹/۰۷ یا میلادی YYYY-MM-DD (اختیاری)</p>
 <form data-form="bulk" class="form-grid"><div class="field wide"><textarea name="lines" rows="8" placeholder="روغن قنادی;کیلو;۲۰;۱۰۰۰۰۰۰;۱۵۰۰۰۰۰;۱۴۰۵/۰۹/۰۷&#10;قالب شیرینی;عدد;۸;۵۰۰۰۰;۷۰۰۰۰"></textarea></div><div class="field wide"><label>یا فایل متنی CSV/TSV</label><input type="file" name="file" accept=".csv,.tsv,.txt,text/plain,text/csv"/></div><div class="form-footer"><button class="btn outline full" type="submit">بررسی و نمایش پیش‌نویس</button></div></form>`)}
 ${bulkCandidate?card('پیش‌نمایش قبل از ذخیره',`<div class="table-wrap"><table class="data-table"><thead><tr><th>نام</th><th>واحد</th><th>موجودی</th><th>قیمت خرید</th><th>جایگزینی</th></tr></thead><tbody>${bulkCandidate.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.kind==='gram'?'کیلو':'عدد'}</td><td>${esc(x.stock)}</td><td>${money(x.lastBuyPrice)}</td><td>${money(x.replacementPrice)}</td></tr>`).join('')}</tbody></table></div><p class="small muted">${bulkCandidate.length} ردیف. نام‌های تکراری رد می‌شوند و تاریخ انقضا برای موجودی اولیه ذخیره می‌شود.</p><button class="btn primary" data-action="bulk-confirm">ثبت نهایی پس از بررسی</button>`):''}`;
 return '';
}
function productDialog(id){const p=data.products.find(x=>x.id===id);if(!p)return;
 const lots=data.purchases.filter(x=>x.productId===id&&x.remainingBase>0).sort((a,b)=>(a.expiryDate||'9999').localeCompare(b.expiryDate||'9999'));
 $('#detail-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='detail-dialog';dialog.className='product-dialog';
 dialog.innerHTML=`<div class="dialog-header"><h2>${esc(p.name)}</h2><button type="button" class="btn outline sm" data-action="close-detail">بستن</button></div>
 ${p.imageData&&/^data:image\/(webp|png|jpeg);base64,/.test(p.imageData)?`<img class="product-image" alt="تصویر ${esc(p.name)}" src="${esc(p.imageData)}"/>`:''}
 ${tiles([['موجودی',stockLabel(p),'□'],['آخرین خرید',money(p.lastBuyPrice),'↙'],['جایگزینی',money(p.replacementPrice),'↗'],['فروش',money(p.salePrice),'◈']])}
 <div class="inline-note">قیمت پیشنهادی با حاشیه ${new Intl.NumberFormat('fa-IR').format(sconfig().marginBps/100)}٪: <b>${money(calcSuggestedPrice(p.replacementPrice,sconfig().marginBps))}</b> به ازای هر کیلو/عدد</div>
 ${card('اصلاح قیمت روز و مشخصات',`<form data-form="edit-product" data-auto-price="${p.salePrice===calcSuggestedPrice(p.replacementPrice,sconfig().marginBps)?'1':'0'}" class="form-grid"><input type="hidden" name="id" value="${esc(id)}"/>
 ${field('قیمت جایگزینی (ریال)',input('replacementPrice',{value:p.replacementPrice,mode:'numeric',required:true,zero:true}))}
 ${field('قیمت فروش روز (ریال)',input('salePrice',{value:p.salePrice,mode:'numeric',required:true,zero:true}))}
 ${field('حد هشدار موجودی',input('low',{value:p.kind==='gram'?p.lowBase/1000:p.lowBase,mode:'decimal'}))}
 ${field('تغییر تصویر',input('image',{type:'file'}),true)}${submit('ذخیره قیمت‌های جدید')}</form>`)}
 ${card('دوره‌های موجودی و انقضا',lots.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ ورود</th><th>موجودی دوره</th><th>انقضا</th><th>وضعیت</th></tr></thead><tbody>${lots.map(x=>`<tr><td>${formatTime(x.createdAt)}</td><td>${stockLabel(p,x.remainingBase)}</td><td>${displayDate(x.expiryDate)}</td><td>${x.expiryDate&&dayGap(x.expiryDate)<0?'<span class="tag red">منقضی</span>':x.expiryDate&&dayGap(x.expiryDate)<=sconfig().expiryWarningDays?'<span class="tag low">نزدیک انقضا</span>':'—'}</td></tr>`).join('')}</tbody></table></div>`:listEmpty('هنوز دوره خرید دارای موجودی ثبت نشده است.'))}`;
 document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.showModal();
}

function openReturnDialog(id){
 const sale=data.sales.find(s=>s.id===id);if(!sale)return msg('فاکتور یافت نشد.','error');
 const old=data.returns.filter(r=>r.saleId===id);
 const fields=sale.lines.map((l,i)=>{
  const used=old.flatMap(r=>r.lines).filter(x=>x.lineIndex===i).reduce((sum,x)=>sum+x.quantityBase,0);
  const p=data.products.find(x=>x.id===l.productId);if(!p)return '';
  const remaining=l.quantityBase-used;
  if(remaining<=0)return `<div class="return-row muted">${esc(l.productName)} · کاملاً مرجوع شده</div>`;
  const numeric=Number(normalizeDigits(l.quantity));const max=numeric*remaining/l.quantityBase;
  const maxLabel=l.unit==='kg'?String(Number(max.toFixed(3))):String(Math.floor(max));
  return `<div class="return-row" data-return-line="${i}"><div><strong>${esc(l.productName)}</strong><small>فروش: ${esc(l.quantity)} ${esc(UNITS[l.unit]||l.unit)} · باقی‌مانده قابل مرجوعی: ${esc(maxLabel)} ${esc(UNITS[l.unit]||l.unit)}</small></div>${field('مقدار مرجوعی',input('returnQuantity',{value:'',mode:'decimal',placeholder:'خالی = بدون مرجوعی'}))}</div>`;
 }).join('');
 document.querySelector('#return-dialog')?.remove();const dialog=document.createElement('dialog');dialog.id='return-dialog';dialog.className='product-dialog return-dialog';
 dialog.innerHTML=`<div class="dialog-header"><h2>ثبت مرجوعی فاکتور ${esc(sale.invoiceNo)}</h2><button type="button" class="btn outline sm" data-return-close>بستن</button></div>
 <p class="small muted">فاکتور اصلی دست‌نخورده می‌ماند. هر قلم را به مقدار دلخواه مرجوع کنید؛ در یک سند می‌توانید چند قلم را ثبت کنید.</p>
 <form data-form="return" data-sale-id="${esc(id)}"><div class="return-lines">${fields}</div>
 <div class="form-grid">${field('وضعیت ورود مجدد به موجودی *',`<select name="restock" required><option value="">انتخاب کنید</option><option value="true">سالم و قابل فروش؛ افزایش موجودی</option><option value="false">آسیب‌دیده یا غیرقابل فروش؛ بدون افزایش موجودی</option></select>`,true)}
 ${field('علت مرجوعی *',`<textarea name="reason" rows="2" maxlength="250" required placeholder="مثلاً بسته‌بندی معیوب، سفارش اشتباه..."></textarea>`,true)}
 ${submit('ثبت سند مرجوعی و اصلاح حساب مشتری')}</div></form>
 <div class="inline-note warning">مبلغ مرجوعی از بدهی مشتری کم می‌شود و در صورت تسویه قبلی، بستانکاری او ایجاد می‌کند؛ بازپرداخت پول به‌صورت خودکار ثبت نمی‌شود.</div>`;
 document.body.append(dialog);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.showModal();
}
function suppliersTable(){return data.suppliers.length?`<div class="list">${data.suppliers.map(x=>`<div class="list-row"><div class="grow"><strong>${esc(x.name)}</strong></div>${x.phone?`<a href="tel:${esc(x.phone)}" class="btn sm outline">تماس با ${esc(x.name)}</a>`:''}</div>`).join('')}</div>`:listEmpty('تأمین‌کننده‌ای ثبت نشده است.');}
function purchases(){if(sub==='suppliers')return `${card('ثبت تأمین‌کننده',`<form class="form-grid" data-form="supplier">${field('نام *',input('name',{required:true,maxlength:100}))}${field('شماره تماس',input('phone',{mode:'tel'}))}${submit('افزودن تأمین‌کننده')}</form>`)}${card('فهرست تأمین‌کنندگان',suppliersTable())}`;
 if(sub==='history')return card('دوره‌های مستقل خرید و تاریخ انقضا',data.purchases.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>کالا</th><th>تأمین‌کننده</th><th>مقدار اولیه</th><th>باقی‌مانده</th><th>انقضا</th><th>هزینه خرید</th></tr></thead><tbody>${[...data.purchases].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(x=>`<tr><td>${esc(x.productName)}</td><td>${esc(x.supplierName)}</td><td>${esc(x.quantity)} ${esc(UNITS[x.unit]||x.unit)}</td><td>${stockLabel(data.products.find(p=>p.id===x.productId),x.remainingBase)}</td><td>${displayDate(x.expiryDate)}</td><td>${money(x.total)}</td></tr>`).join('')}</tbody></table></div>`:listEmpty('خریدی ثبت نشده است.'));
 return `${card('ثبت خرید و ورود کالا',`<form class="form-grid" data-form="purchase" id="purchase-form">
 ${field('تأمین‌کننده *',`<select name="supplierId" required>${dropdown(data.suppliers)}</select>`)}
 ${field('جست‌وجوی کالا *',productPicker('','','purchase'),true)}
 ${field('موجودی فعلی','<span id="purchase-stock" class="hint">بعد از انتخاب محصول نمایش داده می‌شود</span>',true)}
 ${field('مقدار *',input('quantity',{mode:'decimal',required:true,placeholder:'مثلاً ۲ یا ۲٫۵'}))}
 ${field('نوع واحد *','<select name="unit" id="purchase-unit" required><option value="">ابتدا کالا را جست‌وجو کنید</option></select>')}
 ${field('قیمت خرید هر واحد (ریال) *',input('unitPrice',{mode:'numeric',required:true,placeholder:'به واحد انتخاب‌شده'}))}
 ${field('تاریخ انقضای همین سری خرید',input('expiryDate',{type:'date'}),false,'اگر کالا تاریخ انقضا ندارد، خالی بگذارید.')}
 ${field('شیوه پرداخت',`<select name="paymentKind" id="payment-kind"><option value="cash">نقدی</option><option value="transfer">بانکی</option><option value="credit">نسیه</option><option value="check">چک پرداختی</option></select>`)}
 <div class="field wide check-fields" hidden><label>شماره چک</label>${input('chequeNo')}
 <label>بانک</label>${input('chequeBank')}
 <label>تاریخ صدور</label>${input('chequeIssueDate',{type:'date'})}
 <label>سررسید چک</label>${input('chequeDueDate',{type:'date'})}</div>
 ${submit('ثبت خرید و افزایش موجودی')}</form>`)}<div class="inline-note">قیمت جایگزینی را علی در فهرست کالاها روزانه به‌روز می‌کند؛ خرید جدید قیمت دستی قبلی را خودکار تغییر نمی‌دهد.</div>`;
}
function captureSaleRows(form){if(!form)return;
 const f=new FormData(form);saleState={customerId:String(f.get('customerId')||''),paidAmount:String(f.get('paidAmount')||'0'),paymentMethod:String(f.get('paymentMethod')||'cash'),dueDate:String(f.get('dueDate')||'')};
 saleRows=[...form.querySelectorAll('[data-sale-row]')].map(el=>({productId:el.querySelector('[name="productId"]')?.value||'',search:el.querySelector('[name="productSearch"]')?.value||'',quantity:el.querySelector('[name="quantity"]')?.value||'',unit:el.querySelector('[name="unit"]')?.value||'',unitPrice:el.querySelector('[name="unitPrice"]')?.value||''}));
}
function saleRow(row,i){const p=data.products.find(p=>p.id===row.productId);const unit=unitOptions(p).some(x=>x[0]===row.unit)?row.unit:unitOptions(p)[0]?.[0]||'';
 return `<div class="line-form" data-sale-row="${i}"><div class="line-form-head"><strong>قلم ${i+1}</strong>${saleRows.length>1?`<button class="btn sm danger" type="button" data-remove-line="${i}">حذف قلم</button>`:''}</div>
 <div class="line-grid">
 ${field('نام محصول',productPicker(row.productId,row.search,'sale',i))}
 ${field('مقدار',input('quantity',{value:row.quantity||'1',mode:'decimal',required:true}))}
 ${field('واحد',`<select name="unit" data-sale-unit required>${p?unitOptions(p).map(([id,l])=>selectOpt(id,l,unit)).join(''):'<option value="">—</option>'}</select>`)}
 ${field('قیمت فروش هر واحد (ریال)',input('unitPrice',{value:row.unitPrice||'',mode:'numeric',required:true}))}
 </div><div class="live-stock" data-stock-live>${p?`موجودی فعلی: ${stockLabel(p)} · قیمت پیشنهاد: ${money(defaultUnitPrice(p,unit,sconfig().marginBps))}`:'محصول را با جست‌وجو انتخاب کنید.'}</div></div>`;
}
function invoiceButtons(s){return `<div class="actions invoice-actions"><button type="button" class="btn outline sm" data-invoice="${esc(s.id)}" data-mode="a5">چاپ A5</button><button type="button" class="btn outline sm" data-invoice="${esc(s.id)}" data-mode="a4">تمام‌صفحه</button><button type="button" class="btn soft sm" data-invoice="${esc(s.id)}" data-mode="image">تصویر اشتراک</button></div>`;}
function sales(){if(sub==='new')return `${card('ثبت فاکتور فروش',`<form data-form="sale" id="sale-form">
 ${field('مشتری *',`<select name="customerId" required>${dropdown(data.customers,saleState.customerId)}</select>`)}
 <div class="section-split" style="margin:18px 0"></div><div id="sale-lines">${saleRows.map(saleRow).join('')}</div>
 <button type="button" class="btn outline sm" data-action="add-sale-row">+ افزودن قلم بعدی (چند قلم)</button><p class="small muted">هر تعداد کالا را پشت‌سرهم جست‌وجو و انتخاب کنید؛ همه اقلام در یک فاکتور ثبت می‌شوند.</p>
 <div class="line-summary"><div>جمع فاکتور</div><strong id="sale-total">—</strong></div>
 <div class="inline-note"><span id="sale-profit">سود جایگزینی هنگام ثبت محاسبه می‌شود.</span><div id="sale-validation" class="small" role="status"></div></div>
 <div class="form-grid">
 ${field('تاریخ تسویه فاکتور',input('dueDate',{type:'date',value:saleState.dueDate}),false,'در هشدارهای برنامه نمایش داده خواهد شد.')}
 ${field('دریافت اولیه (ریال)',input('paidAmount',{value:saleState.paidAmount,mode:'numeric',zero:true,required:true}))}
 ${field('روش دریافت',`<select name="paymentMethod">${selectOpt('cash','نقدی',saleState.paymentMethod)}${selectOpt('transfer','انتقال بانکی',saleState.paymentMethod)}</select>`)}
 ${submit('ثبت فاکتور و کسر از موجودی')}</div></form>`)}
 <div class="inline-note warning">محاسبه سود بر مبنای قیمت جایگزینی ثبت‌شده در لحظه صدور انجام می‌شود. دوره‌های منقضی‌شده به فروش اختصاص نمی‌یابند.</div>`;
 if(sub==='invoices')return card('فاکتورهای ثبت‌شده',data.sales.length?`<div class="list">${[...data.sales].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(x=>`<div class="list-row"><div class="item-avatar">🧾</div><div class="grow"><strong>${esc(x.customerName)}</strong><small>${esc(x.invoiceNo)} · ${formatTime(x.createdAt)}</small><small>مانده منتسب به فاکتور: ${money(invoiceOutstanding(x,data.payments,data.returns))} · سررسید: ${displayDate(x.dueDate)}</small></div><div class="invoice-side"><b>${money(x.total)}</b>${invoiceButtons(x)}<small>مرجوعی: ${money(creditedForSale(x.id,data.returns))} · خالص: ${money(x.total-creditedForSale(x.id,data.returns))}</small>${x.lines.some((line,i)=>line.quantityBase>data.returns.filter(r=>r.saleId===x.id).flatMap(r=>r.lines).filter(l=>l.lineIndex===i).reduce((t,l)=>t+l.quantityBase,0))?`<button type="button" class="btn soft sm" data-return-open="${esc(x.id)}">↩ ثبت مرجوعی</button>`:''}</div></div>`).join('')}</div>`:listEmpty('فاکتوری ثبت نشده است.'));
 if(sub==='returns')return card('سوابق مرجوعی فاکتورها',data.returns.length?`<div class="list">${[...data.returns].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(r=>`<div class="list-row"><div class="grow"><strong>سند ${esc(r.creditNo)}</strong><small>فاکتور ${esc(r.invoiceNo)} · ${esc(r.customerName)} · ${formatTime(r.createdAt)}</small><small>${r.restock?'کالاهای سالم به انبار برگشته‌اند':'کالاها به موجودی قابل فروش برنگشته‌اند'} · ${esc(r.reason)}</small><small>${r.lines.map(l=>`${esc(l.productName)}: ${esc(l.quantity)} ${esc(UNITS[l.unit]||l.unit)}`).join('، ')}</small></div><b>${money(r.total)} بستانکاری</b></div>`).join('')}</div><div class="inline-note">مرجوعی از بدهی مشتری کسر می‌شود. اگر دریافت قبلی بیش از مبلغ خالص فاکتور باشد، اعتبار مشتری ایجاد می‌شود؛ وجهی خودکار بازپرداخت نمی‌شود.</div>`:listEmpty('سند مرجوعی ثبت نشده است.'));
 return card('مطالبات دارای تاریخ تسویه',data.sales.filter(s=>s.dueDate).length?`<div class="list">${data.sales.filter(s=>s.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(s=>`<div class="list-row"><strong>${esc(s.customerName)}</strong><span class="grow">${esc(s.invoiceNo)} · ${displayDate(s.dueDate)}${dayGap(s.dueDate)<0?' · <b>گذشته</b>':''}</span><span>${money(invoiceOutstanding(s,data.payments,data.returns))}</span></div>`).join('')}</div><div class="inline-note warning">دریافت‌های عمومی بدون انتخاب شماره فاکتور، به فاکتور خاصی تخصیص نمی‌یابند.</div>`:listEmpty('فاکتور سررسیددار ثبت نشده است.'));
}
function updateSaleTotal(){const form=$('#sale-form');if(!form)return;
 const current=[...form.querySelectorAll('[data-sale-row]')].map(el=>({productId:el.querySelector('[name="productId"]')?.value||'',unit:el.querySelector('[name="unit"]')?.value||'',quantity:el.querySelector('[name="quantity"]')?.value||'',unitPrice:el.querySelector('[name="unitPrice"]')?.value||''}));
 const stockUsed=new Map();const stockEligible=new Map();const today=tehranDate();for(const lot of data.purchases){if(lot.remainingBase>0&&(!lot.expiryDate||lot.expiryDate>=today))stockEligible.set(lot.productId,(stockEligible.get(lot.productId)||0)+lot.remainingBase);}for(const r of current){if(!r.productId||!r.unit)continue;try{const p=data.products.find(p=>p.id===r.productId);const qty=parseBaseQuantity(p,r.unit,r.quantity);stockUsed.set(p.id,(stockUsed.get(p.id)||0)+qty.base);}catch{}}
 [...form.querySelectorAll('[data-sale-row]')].forEach((el,i)=>{const p=data.products.find(p=>p.id===current[i].productId);const stock=el.querySelector('[data-stock-live]');if(p&&stock){const available=stockEligible.get(p.id)||0;const remaining=available-(stockUsed.get(p.id)||0);stock.innerHTML=`موجودی کل: <b>${stockLabel(p)}</b> · قابل فروش: <b>${stockLabel(p,available)}</b> · پس از اقلام این فاکتور: <b class="${remaining<0?'bad-text':''}">${stockLabel(p,remaining)}</b> · قیمت جایگزینی هر واحد: ${money(p.replacementPrice)} · پیشنهاد: ${money(defaultUnitPrice(p,current[i].unit,sconfig().marginBps))}`;}});
 const out=$('#sale-total'),profit=$('#sale-profit'),err=$('#sale-validation');
 try{const r=validateSaleLines(current,data.products,sconfig().marginBps);for(const [productId,needed] of r.required){if(needed>(stockEligible.get(productId)||0))throw new Error('موجودی قابل فروش کافی نیست؛ بخشی از کالا ممکن است منقضی باشد.');}out.textContent=money(r.total);profit.textContent=`سود جایگزینی تخمینی این فاکتور: ${money(r.replacementProfit)} (قیمت جایگزینی: ${money(r.replacementCost)})`;err.textContent='';}
 catch(e){out.textContent='—';profit.textContent='پس از تکمیل اقلام، سود محاسبه می‌شود.';err.textContent=e.message;}
}
function customers(){if(sub==='add')return card('ثبت مشتری',`<form data-form="customer" class="form-grid">
 ${field('نام مشتری *',input('name',{required:true,maxlength:100}))}${field('شماره تماس',input('phone',{mode:'tel',maxlength:25}))}
 ${field('محله',input('district',{maxlength:100}))}${field('روز ویزیت',`<select name="visitDay"><option value="">بدون روز</option>${weekday.map(x=>selectOpt(x,x)).join('')}</select>`)}
 ${field('یادداشت',input('note',{maxlength:250}),true)}${submit('ثبت مشتری')}</form>`);
 if(sub==='payments')return card('دریافت وجه مشتری',`<form data-form="payment" class="form-grid">
 ${field('مشتری *',`<select name="customerId" id="pay-customer" required>${dropdown(data.customers)}</select>`)}
 ${field('تخصیص به فاکتور (اختیاری)',`<select name="saleId" id="pay-sale"><option value="">بدون تخصیص به فاکتور</option></select>`)}
 ${field('مبلغ (ریال) *',input('amount',{mode:'numeric',required:true}))}
 ${field('روش دریافت',`<select name="method"><option value="cash">نقدی</option><option value="transfer">انتقال بانکی</option></select>`)}
 ${field('شرح',input('note',{maxlength:250}),true)}${submit('ثبت دریافت')}</form>`);
 const latest=id=>data.sales.filter(s=>s.customerId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]?.createdAt||'';
 let rows=[...data.customers];rows.sort((a,b)=>customerSort==='debt'?(customerBalance(b.id,data.sales,data.payments,data.returns)-customerBalance(a.id,data.sales,data.payments,data.returns))||latest(b.id).localeCompare(latest(a.id)):customerSort==='latest'?latest(b.id).localeCompare(latest(a.id)):a.name.localeCompare(b.name,'fa'));
 return card('مانده حساب مشتریان',`<div class="field"><label>مرتب‌سازی</label><select id="customer-sort">${selectOpt('debt','بیشترین بدهی',customerSort)}${selectOpt('latest','جدیدترین فاکتور',customerSort)}${selectOpt('name','نام مشتری',customerSort)}</select></div>
 ${rows.length?`<div class="list" style="margin-top:16px">${rows.map(c=>{const b=customerBalance(c.id,data.sales,data.payments,data.returns);return `<div class="list-row"><div class="item-avatar">👤</div><div class="grow">${c.phone?`<a class="customer-name" href="tel:${esc(c.phone)}"><strong>${esc(c.name)}</strong> <span aria-label="تماس">☎</span></a>`:`<strong>${esc(c.name)}</strong>`}<small>${esc(c.district||'')} · آخرین فاکتور: ${latest(c.id)?formatTime(latest(c.id)):'—'}</small></div><div class="number">${money(b)}<small class="muted">${b>0?'بدهکار':b<0?'بستانکار':'تسویه'}</small></div></div>`;}).join('')}</div>`:listEmpty('مشتری ثبت نشده است.')}`);
}
function cheques(){if(sub==='new')return card('ثبت چک پرداختی به تأمین‌کننده',`<form data-form="cheque" class="form-grid">
 ${field('تأمین‌کننده *',`<select name="supplierId" required>${dropdown(data.suppliers)}</select>`)}
 ${field('شماره چک *',input('number',{required:true}))}
 ${field('بانک',input('bank'))}${field('مبلغ (ریال) *',input('amount',{required:true,mode:'numeric'}))}
 ${field('تاریخ صدور',input('issueDate',{type:'date'}))}${field('تاریخ سررسید *',input('dueDate',{type:'date',required:true}))}
 ${field('یادداشت',input('note',{maxlength:250}),true)}${submit('ثبت چک')}</form>`);
 return card('چک‌های پرداختی',data.cheques.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>تأمین‌کننده</th><th>شماره چک</th><th>سررسید</th><th>مبلغ</th><th>وضعیت</th><th>اقدام</th></tr></thead><tbody>
 ${[...data.cheques].sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).map(x=>`<tr><td>${esc(x.supplierName)}</td><td>${esc(x.number)} <small>${esc(x.bank||'')}</small></td><td>${displayDate(x.dueDate)}</td><td>${money(x.amount)}</td><td><span class="tag ${x.status==='pending'&&dayGap(x.dueDate)<0?'red':x.status==='paid'?'good':'low'}">${({pending:'در انتظار',paid:'پرداخت‌شده',returned:'برگشتی',cancelled:'لغوشده'})[x.status]}</span></td><td>${x.status==='pending'?`<button class="btn sm soft" data-cheque-paid="${esc(x.id)}">ثبت پرداخت چک</button><button class="btn sm danger" data-cheque-returned="${esc(x.id)}">برگشتی</button>`:'—'}</td></tr>`).join('')}
 </tbody></table></div>`:listEmpty('چکی ثبت نشده است.'));
}
function settings(){const cfg=sconfig();if(sub==='personalize')return card('شخصی‌سازی برنامه و فاکتورها',`<form data-form="settings" class="form-grid">
 ${field('نام کسب‌وکار',input('businessName',{value:cfg.businessName,maxlength:100}))}
 ${field('تلفن کسب‌وکار',input('businessPhone',{value:cfg.businessPhone,mode:'tel'}))}
 ${field('درصد سود پیشنهادی بر جایگزینی',input('marginPercent',{value:cfg.marginBps/100,mode:'decimal',required:true}))}
 ${field('هشدار چند روز پیش از انقضا؟',input('expiryWarningDays',{value:cfg.expiryWarningDays,mode:'numeric',required:true}))}
 ${field('حالت نمایش',`<select name="theme">${selectOpt('auto','مطابق دستگاه',cfg.theme)}${selectOpt('light','روشن',cfg.theme)}${selectOpt('dark','تاریک',cfg.theme)}</select>`)}
 ${field('متن اضافه در فاکتور',`<textarea name="invoiceNote" rows="3" maxlength="250">${esc(cfg.invoiceNote)}</textarea>`,true,'عبارت امانت تا تسویه در همه مدل‌های فاکتور به‌صورت ثابت درج می‌شود.')}
 ${submit('ذخیره تنظیمات')}</form>`);
 if(sub==='backup')return `${card('پشتیبان رمزگذاری‌شده اطلاعات',`<form data-form="export" class="form-grid">${field('گذرواژه حداقل ۸ کاراکتر',input('password',{type:'password',required:true,minlength:8}),true)}${submit('ساخت و ذخیره پشتیبان')}</form><p class="small muted">فایل به‌صورت AES-256-GCM رمزگذاری می‌شود. یک نسخه بیرون از دستگاه نگه دارید و بازیابی را روی دستگاه دیگری با داده غیرواقعی بررسی کنید.</p>`)}
 ${card('بازیابی پشتیبان همین نسخه',`<form data-form="import" class="form-grid">${field('فایل',input('file',{type:'file',required:true}),true)}${field('گذرواژه',input('password',{type:'password',required:true,minlength:8}),true)}${submit('فقط بررسی فایل')}</form>
 ${importCandidate?`<div class="inline-note success">فایل با ${importCandidate.products.length} کالا، ${importCandidate.sales.length} فاکتور و ${importCandidate.cheques.length} چک معتبر است.</div><label class="checkbox-line"><input type="checkbox" id="restore-ack"/> از داده فعلی فایل پشتیبان جداگانه تهیه کرده‌ام و جایگزینی کامل را قبول دارم.</label><button type="button" class="btn danger" data-action="restore">جایگزینی اطلاعات این نسخه</button>`:''}`)}`;
 if(sub==='support')return card('پشتیبانی و سازنده برنامه',`<p>برای پیگیری مشکلات برنامه و گزارش خطا می‌توانید از وب‌سایت سازنده استفاده کنید.</p><p>طراحی و توسعه: <a class="creator-link" href="${creatorUrl}" target="_blank" rel="noopener noreferrer">Parviz Bahrami | پرویز بهرامی</a></p><p class="small muted">نسخه برنامه: ۰.۲.۲ · اطلاعات فقط روی دستگاه کاربر ذخیره می‌شوند.</p>`);
 return card('راهنمای برنامه و وضعیت نسخه',`<p>انبار من نسخه ۰.۲.۲ دارای تقویم شمسی و محاسبات ریالی است. اطلاعات جدید روی همین دستگاه و مستقل از داده‌های قدیمی نسخه ۰.۱.۸ ذخیره می‌شود. اگر در نسخه قدیمی اطلاعاتی ثبت کرده‌اید، به این نسخه منتقل نمی‌شود. قبل از استفاده با اطلاعات واقعی، بازیابی پشتیبان روی دستگاه دوم و سناریوهای حسابداری را تأیید کنید.</p><p>قیمت خرید تاریخی مبنای ارزش هزینه خرید است؛ قیمت جایگزینی را روزانه خودتان تنظیم می‌کنید. سود پیش‌فرض ${cfg.marginBps/100}٪ بالاتر از قیمت جایگزینی است.</p><p class="small muted">در مورد عبارت حقوقی امانت روی فاکتور، کاربرد و اثر قانونی آن باید با مشاور حقوقی متناسب با قراردادهای واقعی بررسی شود.</p>`);
}
function normalizeSearch(value){return String(value||'').normalize('NFKC').toLocaleLowerCase('fa').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/[\u064b-\u065f\u0670]/g,'').replace(/\u200c/g,' ').replace(/\s+/g,' ').trim();}
function suggestProducts(input){const picker=input.closest('[data-product-picker]'),box=picker.querySelector('.suggestions'),hidden=picker.querySelector('input[name="productId"]');
 hidden.value='';const q=normalizeSearch(input.value);if(q.length<2){box.hidden=true;box.innerHTML='';input.setAttribute('aria-expanded','false');return;}
 const terms=q.split(' ').filter(Boolean);const match=data.products.filter(p=>{const hay=normalizeSearch(p.name+' '+(p.code||''));return terms.every(t=>hay.includes(t));}).slice(0,8);
 box.innerHTML=match.length?match.map(p=>`<button type="button" role="option" data-select-product="${esc(p.id)}"><strong>${esc(p.name)}</strong><small>${stockLabel(p)}</small></button>`).join(''):'<p class="small muted">کالایی پیدا نشد.</p>';box.hidden=false;input.setAttribute('aria-expanded','true');
}
function selectProduct(button){const picker=button.closest('[data-product-picker]'),p=data.products.find(x=>x.id===button.dataset.selectProduct);if(!p)return;
 picker.querySelector('[name="productSearch"]').value=p.name;picker.querySelector('[name="productId"]').value=p.id;picker.querySelector('.suggestions').hidden=true;
 picker.querySelector('[data-product-query]')?.setAttribute('aria-expanded','false');
 if(picker.dataset.kind==='purchase'){
   const form=$('#purchase-form');const select=form?.querySelector('[name="unit"]');if(select)select.innerHTML=unitOptions(p).map(([k,name])=>selectOpt(k,name)).join('');
   const available=$('#purchase-stock');if(available)available.textContent=`موجودی فعلی: ${stockLabel(p)} · قیمت جایگزینی: ${money(p.replacementPrice)}`;
 }else{const form=$('#sale-form');captureSaleRows(form);const i=Number(picker.dataset.index);saleRows[i].productId=p.id;saleRows[i].search=p.name;saleRows[i].unit=unitOptions(p)[0]?.[0]||'';saleRows[i].unitPrice=String(defaultUnitPrice(p,saleRows[i].unit,sconfig().marginBps));render();
   const quantity=document.querySelectorAll('#sale-form [data-sale-row]')[i]?.querySelector('[name=quantity]');quantity?.focus();quantity?.select();}
}
function parseBulk(text){const lines=String(text||'').replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);if(lines.length>300)throw new Error('حداکثر ۳۰۰ ردیف در هر مرحله مجاز است.');
 const records=[];for(const [i,line] of lines.entries()){
  const separator=line.includes('\t')?'\t':line.includes(';')?';':',';
  const cells=[];let buffer='',quoted=false;
  for(let j=0;j<line.length;j++){const ch=line[j];if(ch==='"'){if(quoted&&line[j+1]==='"'){buffer+='"';j++;}else quoted=!quoted;}else if(ch===separator&&!quoted){cells.push(buffer.trim());buffer='';}else buffer+=ch;}
  cells.push(buffer.trim());if(i===0&&/^(نام|name|product)/i.test(cells[0]))continue;
  if(cells.length<5)throw new Error(`ردیف ${i+1}: پنج ستون اصلی لازم است.`);
  const kind=/کیلو|kg|گرم/i.test(cells[1])?'gram':'piece';
  const stock=normalizeDigits(cells[2]);if(kind==='gram')asDecimalMilli(stock,'موجودی');else asInteger(stock,'موجودی');
  const lastBuyPrice=asInteger(cells[3],'قیمت خرید'),replacementPrice=asInteger(cells[4],'جایگزینی');const rawDate=String(cells[5]||'').trim();const normalizedDate=normalizeDigits(rawDate).replace(/\//g,'-');const expiryDate=validDate(rawDate?(Number(normalizedDate.slice(0,4))<1700?parseJalaliDate(rawDate):normalizedDate):'','تاریخ انقضا');
  records.push({name:cells[0],kind,stock,lastBuyPrice,replacementPrice,expiryDate});
 }
 if(!records.length)throw new Error('اطلاعات قابل واردکردن پیدا نشد.');return records;
}
async function imageData(file){if(!file||!file.size)return undefined;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('عکس باید PNG/JPEG/WebP و حداکثر ۵ مگابایت باشد.');
 const bitmap=await createImageBitmap(file);const scale=Math.min(1,420/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const encoded=canvas.toDataURL('image/webp',.68);if(encoded.length>350000)throw new Error('تصویر بعد از فشرده‌سازی بزرگ است؛ عکس کوچک‌تری انتخاب کنید.');return encoded;
}
function unitSize(raw,kind){if(!String(raw||'').trim())return 0;
 if(kind==='gram')return asDecimalMilli(raw,'اندازه بسته');return asInteger(raw,'اندازه بسته');}
function issueMarkup(s,mode){const cfg=sconfig();const rows=s.lines.map((l,i)=>`<tr><td>${i+1}</td><td>${esc(l.productName)}</td><td>${esc(l.quantity)} ${esc(UNITS[l.unit]||l.unit)}</td><td>${money(l.unitPrice)}</td><td>${money(l.amount)}</td></tr>`).join('');
 const returnTotal=creditedForSale(s.id,data.returns);
 const a5=mode==='a5';return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
 <title>فاکتور ${esc(s.invoiceNo)} · ${a5?'A5':'تمام‌صفحه'}</title><style>@page{size:${a5?'A5':'A4'} portrait;margin:9mm}*{box-sizing:border-box}body{font-family:Tahoma,sans-serif;color:#17343a;margin:0;padding:20px;line-height:1.9}.paper{max-width:${a5?'720px':'1050px'};margin:auto;border:1px solid #d8e2e1;padding:24px;border-radius:12px}header{display:flex;justify-content:space-between;gap:18px;border-bottom:4px solid #137b68;padding-bottom:16px}h1{margin:0;font-size:26px}.muted{color:#667c80}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #d8e2e1;padding:9px 7px;text-align:right;font-size:12px}th{background:#eef8f4}.total{font-weight:900;text-align:left;font-size:20px}.custody{border-top:1px dashed #aaa;margin-top:28px;padding-top:14px;text-align:center;font-weight:800}.preview{color:#a36a35;font-size:12px;text-align:center;margin:9px}.actions{margin:20px auto;text-align:center}.actions button{font:inherit;padding:10px 20px;border:0;background:#16866e;color:white;border-radius:8px}@media print{.actions{display:none}.paper{border:0;padding:0}body{padding:0}}</style></head><body><div class="paper"><header><div><h1>${esc(cfg.businessName)}</h1><div class="muted">${esc(cfg.businessPhone)}</div></div><div>صورتحساب فروش<br><b>${esc(s.invoiceNo)}</b><div class="muted">${displayDate(tehranDate(s.createdAt))}</div></div></header><p>مشتری: <b>${esc(s.customerName)}</b></p><table><thead><tr><th>ردیف</th><th>کالا</th><th>مقدار</th><th>قیمت واحد (ریال)</th><th>مبلغ (ریال)</th></tr></thead><tbody>${rows}</tbody></table><p class="total">جمع اصلی فاکتور: ${money(s.total)}</p>${returnTotal?`<p>مرجوعی ثبت‌شده: ${money(returnTotal)} · <strong>جمع پس از مرجوعی: ${money(s.total-returnTotal)}</strong></p>`:''}${s.dueDate?`<p>تاریخ تسویه: ${displayDate(s.dueDate)}</p>`:''}<p class="custody">${esc(INVOICE_CUSTODY_NOTICE)}</p>${cfg.invoiceNote?`<p class="muted">${esc(cfg.invoiceNote)}</p>`:''}</div><div class="actions"><button onclick="window.print()">چاپ / ذخیره PDF</button></div></body></html>`;
}
function openInvoice(id,mode){const s=data.sales.find(x=>x.id===id);if(!s)return msg('فاکتور موجود نیست.','error');
 if(mode==='image'){shareInvoiceImage(s).catch(e=>msg(e.message||'خطا در تولید تصویر','error'));return;}
 const win=window.open('','_blank');if(!win){msg('اجازه باز شدن پنجره چاپ را در مرورگر فعال کنید.','error');return;}
 win.document.open();win.document.write(issueMarkup(s,mode));win.document.close();
}
async function shareInvoiceImage(s){const cfg=sconfig();const width=1080,rows=s.lines.length,rowH=92,height=680+rows*rowH+(cfg.invoiceNote?85:0);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const cx=canvas.getContext('2d');cx.fillStyle='#ffffff';cx.fillRect(0,0,width,height);cx.fillStyle='#146b63';cx.fillRect(0,0,width,165);cx.direction='rtl';cx.textAlign='right';cx.fillStyle='white';cx.font='bold 54px Tahoma';cx.fillText(cfg.businessName,1000,78);cx.font='30px Tahoma';cx.fillText('صورتحساب فروش',1000,128);
 cx.fillStyle='#173840';cx.font='29px Tahoma';cx.fillText(`مشتری: ${s.customerName}`,1000,225);cx.fillText(`فاکتور: ${s.invoiceNo}`,1000,275);cx.fillText(`تاریخ: ${displayDate(tehranDate(s.createdAt))}`,1000,325);
 let y=385;for(const line of s.lines){cx.fillStyle='#f4f7f6';cx.fillRect(55,y-44,970,78);cx.fillStyle='#193941';cx.font='bold 27px Tahoma';cx.fillText(String(line.productName).slice(0,33),1000,y);cx.font='24px Tahoma';cx.fillText(`${line.quantity} ${UNITS[line.unit]||line.unit}   ·   ${money(line.amount)}`,1000,y+30);y+=rowH;}
 cx.fillStyle='#167e68';cx.font='bold 41px Tahoma';cx.fillText(`جمع اصلی: ${money(s.total)}`,1000,y+34);cx.fillStyle='#273a40';const returned=creditedForSale(s.id,data.returns);if(returned){cx.font='25px Tahoma';cx.fillText(`مرجوعی: ${money(returned)} · خالص: ${money(s.total-returned)}`,1000,y+82);}cx.font='bold 27px Tahoma';cx.fillText(INVOICE_CUSTODY_NOTICE,1000,y+140,920);
 if(cfg.invoiceNote){cx.font='24px Tahoma';cx.fillText(cfg.invoiceNote.slice(0,60),1000,y+192);}

 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('تصویر ساخته نشد.')),'image/png'));const file=new File([blob],`invoice-${s.invoiceNo}.png`,{type:'image/png'});
 if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:`فاکتور ${s.invoiceNo}`});return;}catch(e){if(e.name==='AbortError')return;}}
 const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),25000);msg('تصویر فاکتور ذخیره شد؛ می‌توانید در پیام‌رسان به اشتراک بگذارید.');
}
document.addEventListener('click',async e=>{
 if(e.target.closest('[data-jalali-open]')){openJalaliCalendar(e.target.closest('[data-jalali-open]'));return;}
 if(e.target.closest('[data-calendar-close]')){document.getElementById('jalali-calendar-dialog')?.close();return;}
 const shift=e.target.closest('[data-calendar-move]');if(shift){
  const count=calendarYear*12+calendarMonth-1+Number(shift.dataset.calendarMove);
  calendarYear=Math.floor(count/12);calendarMonth=(count%12+12)%12+1;
  document.getElementById('jalali-calendar-dialog').innerHTML=calendarMarkup();return;
 }
 const day=e.target.closest('[data-jalali-day]');if(day){selectJalaliIso(jalaliToIso(calendarYear,calendarMonth,Number(day.dataset.jalaliDay)));return;}
 if(e.target.closest('[data-calendar-today]')){selectJalaliIso(tehranDate());return;}
 if(e.target.closest('[data-calendar-clear]')){selectJalaliIso('');return;}
 const navButton=e.target.closest('[data-nav]');if(navButton){setPage(navButton.dataset.nav,navButton.dataset.toSub);return;}
 const subButton=e.target.closest('[data-sub]');if(subButton){setPage(page,subButton.dataset.sub);return;}
 const chosen=e.target.closest('[data-select-product]');if(chosen){selectProduct(chosen);return;}
 const returnClose=e.target.closest('[data-return-close]');if(returnClose){$('#return-dialog')?.close();return;}
 const returnOpen=e.target.closest('[data-return-open]');if(returnOpen){openReturnDialog(returnOpen.dataset.returnOpen);return;}
 const detail=e.target.closest('[data-product-detail]');if(detail){productDialog(detail.dataset.productDetail);return;}
 const invoice=e.target.closest('[data-invoice]');if(invoice){openInvoice(invoice.dataset.invoice,invoice.dataset.mode||'a5');return;}
 const paid=e.target.closest('[data-cheque-paid]'),returned=e.target.closest('[data-cheque-returned]');
 if(paid||returned){const status=paid?'paid':'returned';if(!confirm(`آیا ثبت وضعیت «${status==='paid'?'پرداخت‌شده':'برگشتی'}» برای این چک درست است؟`))return;
  try{await setChequeStatus(db,(paid||returned).dataset[paid?'chequePaid':'chequeReturned'],status);await refresh();msg('وضعیت چک تغییر کرد.');}catch(error){msg(error.message,'error');}return;}
 const removed=e.target.closest('[data-remove-line]');if(removed){captureSaleRows($('#sale-form'));saleRows.splice(Number(removed.dataset.removeLine),1);render();return;}
 const action=e.target.closest('[data-action]');if(!action)return;
 try{
  switch(action.dataset.action){
   case 'close-detail':$('#detail-dialog')?.close();break;
   case 'add-sale-row':captureSaleRows($('#sale-form'));saleRows.push({productId:'',search:'',unit:'',quantity:'1',unitPrice:''});render();const row=$('#sale-form [data-sale-row]:last-child [data-product-query]');row?.focus();break;
   case 'bulk-confirm':if(!bulkCandidate)throw new Error('پیش‌نمایشی برای ورود وجود ندارد.');if(!confirm(`ثبت ${bulkCandidate.length} کالا انجام شود؟`))return;
     await addBulkProducts(db,bulkCandidate,sconfig().marginBps);bulkCandidate=null;await refresh();msg('ورود گروهی کالاها انجام شد.');break;
   case 'restore':if(!importCandidate)throw new Error('ابتدا فایل پشتیبان را بررسی کنید.');if(!$('#restore-ack')?.checked)throw new Error('ابتدا تأیید نسخه پشتیبان از وضعیت فعلی ضروری است.');
     if(!confirm('تمام داده‌های این نسخه با پشتیبان انتخابی جایگزین شوند؟ اطلاعات نسخه قدیمی ۰.۱.۸ تغییر نمی‌کند.'))return;
     await replaceAll(db,importCandidate);importCandidate=null;await refresh();msg('اطلاعات از پشتیبان بازیابی شد.');break;
  }
 }catch(error){msg(error.message||'خطا در عملیات','error');}
});

document.addEventListener('keydown',e=>{
 if(e.target.matches('[data-product-query]')&&e.key==='Escape'){const box=e.target.closest('[data-product-picker]')?.querySelector('.suggestions');if(box)box.hidden=true;e.target.setAttribute('aria-expanded','false');return;}
 if(e.target.matches('[data-product-query]')&&e.key==='ArrowDown'){const box=e.target.closest('[data-product-picker]')?.querySelector('.suggestions');const first=box&&!box.hidden?box.querySelector('[data-select-product]'):null;if(first){e.preventDefault();first.focus();}}
 if(e.target.matches('[data-select-product]')&&e.key==='ArrowDown'){const next=e.target.nextElementSibling;if(next?.matches('[data-select-product]')){e.preventDefault();next.focus();}}
 if(e.target.matches('[data-select-product]')&&e.key==='ArrowUp'){const prev=e.target.previousElementSibling;if(prev?.matches('[data-select-product]')){e.preventDefault();prev.focus();}else{e.preventDefault();e.target.closest('[data-product-picker]')?.querySelector('[data-product-query]')?.focus();}}
});
document.addEventListener('focusin',e=>{if(e.target.matches('[data-zero-clear]')&&normalizeDigits(e.target.value)==='0')e.target.value='';});
document.addEventListener('focusout',e=>{if(e.target.matches('[data-jalali-input]'))updateJalaliText(e.target,true);if(e.target.matches('[data-zero-clear]')&&!e.target.value.trim()){e.target.value='0';if(e.target.closest('#sale-form'))updateSaleTotal();}});
document.addEventListener('input',e=>{
 if(e.target.matches('[data-jalali-input]')){updateJalaliText(e.target);return;}
 if(e.target.matches('[data-money-input]')){
  const previous=e.target.value,offset=digitsBeforeCaret(previous,e.target.selectionStart??previous.length),formatted=formatRialInput(previous);
  if(previous!==formatted){e.target.value=formatted;const caret=caretForDigitCount(formatted,offset);e.target.setSelectionRange(caret,caret);}
 }
 if(e.target.closest('[data-form="edit-product"]')){const form=e.target.closest('form');if(e.target.name==='salePrice')form.dataset.autoPrice='0';if(e.target.name==='replacementPrice'&&form.dataset.autoPrice==='1'){try{form.querySelector('[name="salePrice"]').value=formatRialInput(calcSuggestedPrice(asInteger(e.target.value||'0'),sconfig().marginBps));}catch{}}}
 if(e.target.matches('[data-product-query]')){suggestProducts(e.target);if(e.target.closest('#sale-form'))updateSaleTotal();return;}
 if(e.target.id==='product-list-filter'){const q=normalizeSearch(e.target.value);document.querySelectorAll('[data-filter-row]').forEach(tr=>{tr.hidden=!normalizeSearch(tr.dataset.filterRow).includes(q);});return;}
 if(e.target.closest('#sale-form'))updateSaleTotal();
});
document.addEventListener('change',e=>{
 if(e.target.id==='customer-sort'){customerSort=e.target.value;render();return;}
 if(e.target.id==='payment-kind'){$('.check-fields').hidden=e.target.value!=='check';return;}
 if(e.target.id==='pay-customer'){const id=e.target.value;const select=$('#pay-sale');select.innerHTML='<option value="">بدون تخصیص به فاکتور</option>'+data.sales.filter(s=>s.customerId===id&&invoiceOutstanding(s,data.payments,data.returns)>0).map(s=>selectOpt(s.id,`${s.invoiceNo} · مانده ${money(invoiceOutstanding(s,data.payments,data.returns))}`)).join('');return;}
 if(e.target.closest('#sale-form')&&e.target.name==='unit'){
  captureSaleRows($('#sale-form'));const idx=Number(e.target.closest('[data-sale-row]').dataset.saleRow),p=data.products.find(x=>x.id===saleRows[idx].productId);
  if(p)saleRows[idx].unitPrice=String(defaultUnitPrice(p,saleRows[idx].unit,sconfig().marginBps));render();return;
 }
 if(e.target.closest('#sale-form'))updateSaleTotal();
});
document.addEventListener('submit',async e=>{
 const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();const kind=form.dataset.form,button=form.querySelector('[type="submit"]');if(button)button.disabled=true;
 try{
  if(kind==='product'){
   const kindBase=formVal(form,'kind'),replacementPrice=asInteger(formVal(form,'replacementPrice'),'قیمت جایگزینی');
   const unitConfigs={pack:unitSize(formVal(form,'packSize'),kindBase),carton:unitSize(formVal(form,'cartonSize'),kindBase),can:unitSize(formVal(form,'canSize'),kindBase)};
   const lowBase=kindBase==='gram'?asDecimalMilli(formVal(form,'low')||'0','حد هشدار'):asInteger(formVal(form,'low')||'0','حد هشدار');
   const manual=formVal(form,'salePrice');
   await addRecord(db,'products',{name:formVal(form,'name'),code:formVal(form,'code'),category:formVal(form,'category'),kind:kindBase,unitConfigs,lowBase,replacementPrice,salePrice:manual?asInteger(manual,'قیمت فروش'):calcSuggestedPrice(replacementPrice,sconfig().marginBps),imageData:await imageData(form.querySelector('[name="image"]').files?.[0])});
  }else if(kind==='edit-product'){
   const p=data.products.find(x=>x.id===formVal(form,'id'));if(!p)throw new Error('کالا موجود نیست.');const lowBase=p.kind==='gram'?asDecimalMilli(formVal(form,'low'),'حد هشدار'):asInteger(formVal(form,'low'),'حد هشدار');
   const img=await imageData(form.querySelector('[name="image"]').files?.[0]);await updateProduct(db,{id:p.id,replacementPrice:formVal(form,'replacementPrice'),salePrice:formVal(form,'salePrice'),lowBase,...(img===undefined?{}:{imageData:img})});$('#detail-dialog')?.close();
  }else if(kind==='supplier')await addRecord(db,'suppliers',{name:formVal(form,'name'),phone:formVal(form,'phone')});
   else if(kind==='customer')await addRecord(db,'customers',{name:formVal(form,'name'),phone:formVal(form,'phone'),district:formVal(form,'district'),visitDay:formVal(form,'visitDay'),note:formVal(form,'note')});
   else if(kind==='purchase'){
    const values=Object.fromEntries(new FormData(form));await addPurchase(db,{...values,marginBps:sconfig().marginBps});
   }else if(kind==='sale'){
    captureSaleRows(form);const lines=saleRows.map(x=>({productId:x.productId,unit:x.unit,quantity:x.quantity,unitPrice:x.unitPrice}));
    await addSale(db,{...saleState,lines});saleRows=[{productId:'',search:'',unit:'',quantity:'1',unitPrice:''}];saleState={customerId:'',paidAmount:'0',paymentMethod:'cash',dueDate:''};
   }else if(kind==='return'){
    const saleId=form.dataset.saleId,rawRestock=formVal(form,'restock');
    if(!['true','false'].includes(rawRestock))throw new Error('نوع مرجوعی را انتخاب کنید.');
    const lines=[...form.querySelectorAll('[data-return-line]')].map(el=>({lineIndex:Number(el.dataset.returnLine),quantity:el.querySelector('[name=returnQuantity]')?.value.trim()||''})).filter(x=>x.quantity&&Number(normalizeDigits(x.quantity))>0);
    if(!lines.length)throw new Error('مقدار حداقل یک قلم مرجوعی را وارد کنید.');
    // Compute and show exact credit before committing the immutable return document.
    const sale=data.sales.find(x=>x.id===saleId);
    const estimate=buildReturnPlan(sale,data.returns,data.products,lines,{restock:rawRestock==='true',reason:formVal(form,'reason')});
    if(!confirm(`مرجوعی ${estimate.lines.length} قلم به مبلغ ${money(estimate.total)} ثبت شود؟`))return;
    await addSaleReturn(db,{saleId,lines,restock:rawRestock==='true',reason:formVal(form,'reason')});
    $('#return-dialog')?.close();
   }else if(kind==='payment')await addPayment(db,Object.fromEntries(new FormData(form)));
   else if(kind==='cheque')await addCheque(db,Object.fromEntries(new FormData(form)));
   else if(kind==='settings'){
    const v=asDecimalMilli(formVal(form,'marginPercent'),'درصد سود');await updateSettings(db,{marginBps:Math.round(v/10),theme:formVal(form,'theme'),expiryWarningDays:formVal(form,'expiryWarningDays'),businessName:formVal(form,'businessName'),businessPhone:formVal(form,'businessPhone'),invoiceNote:formVal(form,'invoiceNote')});
   }else if(kind==='bulk'){
    const f=form.querySelector('[name="file"]')?.files?.[0];if(f?.size>1024*1024)throw new Error('فایل ورودی نباید بیش از ۱ مگابایت باشد.');
    bulkCandidate=parseBulk(f?.size?await f.text():formVal(form,'lines'));await refresh();msg('پیش‌نمایش آماده است. لطفاً قبل از ثبت بررسی کنید.');return;
   }else if(kind==='export'){
    const wrapper=await encryptBackup(data,formVal(form,'password'));downloadBackup(wrapper);msg('دانلود پشتیبان آغاز شد. ذخیره فایل را در Downloads بررسی کنید.');return;
   }else if(kind==='import'){
    importCandidate=null;const wrapper=await readBackupFile(form.querySelector('[name="file"]').files?.[0]);importCandidate=await decryptBackup(wrapper,formVal(form,'password'));await refresh();msg('فایل بررسی شد؛ هنوز داده‌ای جایگزین نشده است.');return;
   }
   await refresh();msg('ثبت با موفقیت انجام شد.');
 }catch(error){msg(error.message||'عملیات موفق نبود.','error');}
 finally{if(button?.isConnected)button.disabled=false;}
});
async function init(){try{
 if(!('indexedDB'in window)||!crypto?.subtle)throw new Error('این مرورگر برای ذخیره آفلاین و رمزگذاری فایل پشتیبان مناسب نیست.');
 db=await openDb();await refresh();if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
 window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
 }catch(e){app.innerHTML=`<div class="loading-screen"><section class="card"><h2>برنامه قابل اجرا نیست</h2><p>${esc(e.message)}</p><p>در مرورگر جدید از نشانی HTTPS یا localhost باز کنید.</p></section></div>`;}}
init();
