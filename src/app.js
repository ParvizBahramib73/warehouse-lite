import {openDb,readAll,addRecord,updateRecord,setRecordActive,deleteRecord,addPurchase,updatePurchase,voidPurchase,addSale,updateSale,voidSale,addPayment,updatePayment,voidPayment,saveVisit,replaceAll} from './data.js';
import {asInteger,asDecimalMilli,money,stockLabel,defaultUnitPrice,validateSaleLines,customerBalance,makeId,isoNow} from './domain.js';
import {encryptBackup,decryptBackup,validateSnapshot,downloadBackup,readBackupFile} from './backup.js';
import {esc,dateFa,dayFa,todayTehran,optionMarkup,formatMoneyField} from './utils.js';
import {shareInvoiceFile,invoicePaidAmount} from './invoice-share.js';
import {buildCustomerStatement,getCustomerFollowups} from './customer-insights.js';
import {buildRoutePlan,groupRoutePlan,VISIT_OUTCOMES} from './route-planning.js';
import {buildProfitReport} from './profit-report.js';

const app=document.getElementById('app');
let db, data, page='dashboard', toastTimer, importCandidate=null, importWrapper=null, saleRows=[{productId:'',unit:'',quantity:'1',unitPrice:''}];
let currentTab='list', editor=null, statementCustomerId=null;
const PAGE_SIZE=25;
const listState={products:{query:'',status:'all',page:1},purchases:{query:'',page:1},suppliers:{query:'',page:1},sales:{query:'',status:'all',page:1},customers:{query:'',page:1}};
const todayKey=todayTehran(new Date().toISOString());
const visitState={date:todayKey,query:'',district:'all',status:'all',page:1};
const profitState={from:todayKey.slice(0,8)+'01',to:todayKey,query:'',page:1};
const visitDrafts=new Map();
let saleState={customerId:'',paidAmount:'0',paymentMethod:'cash'};
const tabs=[['dashboard','خانه','⌂'],['products','کالاها','▦'],['purchases','خرید','↓'],['sales','فروش','↑'],['customers','مشتریان','♙'],['visits','ویزیت','🧭'],['profit','سود','٪'],['backup','تنظیمات','⚙']];
const weekday=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
const titleMap={dashboard:'داشبورد',products:'مدیریت کالاها',purchases:'ثبت خرید',sales:'ثبت فروش و فاکتور',customers:'مشتریان و حساب‌ها',visits:'مسیر ویزیت مشتریان',profit:'گزارش سود ناخالص',backup:'پشتیبان‌گیری'};
const subtitleMap={dashboard:'خلاصه وضعیت امروز کسب‌وکار شما',products:'کالا، واحد، قیمت و موجودی را مدیریت کنید',purchases:'ورود کالا از تأمین‌کننده به انبار',sales:'فاکتور صادر کنید و موجودی را به‌روز نگه دارید',customers:'حساب و سوابق فروش مشتریان را ببینید',visits:'برنامه روزانه، محله‌بندی و ثبت نتیجه مراجعه',profit:'درآمد، بهای خرید و سود ناخالص برآوردی',backup:'خروجی امن و بازگرداندن اطلاعات روی دستگاه'};
const $=(selector,root=document)=>root.querySelector(selector);
const formatDate=()=>new Intl.DateTimeFormat('fa-IR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Tehran'}).format(new Date());
const opt=(v,label,selected)=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(label)}</option>`;
const formVal=(form,name)=>String(new FormData(form).get(name)??'').trim();

const listPage=(rows,state)=>{
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 state.page=Math.min(Math.max(1,state.page),pages);
 const start=(state.page-1)*PAGE_SIZE;
 return {rows:rows.slice(start,start+PAGE_SIZE),pages,start,total:rows.length};
};
const listSearch=(key,placeholder)=>`<label class="list-search"><span aria-hidden="true">⌕</span><input type="search" data-list-search="${key}" value="${esc(listState[key].query)}" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off"/></label>`;
const pager=(key,view)=>`<div class="pagination"><span>نمایش ${view.total?view.start+1:0} تا ${Math.min(view.start+PAGE_SIZE,view.total)} از ${view.total}</span>${view.pages>1?`<div class="pagination-actions"><button type="button" class="btn sm outline" data-list-page data-list-key="${key}" data-direction="prev" ${view.start===0?'disabled':''}>قبلی</button><span>صفحه ${listState[key].page} از ${view.pages}</span><button type="button" class="btn sm outline" data-list-page data-list-key="${key}" data-direction="next" ${listState[key].page>=view.pages?'disabled':''}>بعدی</button></div>`:''}</div>`;
function renderSearchAgain(selector,caret){
 render();const input=app.querySelector(selector);if(input){input.focus();if(typeof input.setSelectionRange==='function')input.setSelectionRange(caret,caret);}
}
function visitDraftKey(customerId,date){return customerId+'|'+date;}
function rememberVisitDraft(form){
 const values=new FormData(form),customerId=String(values.get('customerId')||''),date=String(values.get('plannedDate')||'');
 if(!customerId||!date)return;
 visitDrafts.set(visitDraftKey(customerId,date),{outcome:String(values.get('outcome')||'planned'),note:String(values.get('note')||''),nextFollowUpDate:String(values.get('nextFollowUpDate')||'')});
}

const stockTone=p=>p.stockBase<=p.lowBase?'low':'good';
const productUnits=p=>{if(!p)return[];const u=p.kind==='gram'?[['kg','کیلوگرم']]:[['piece','عدد']];if(p.packBase>1)u.push(['pack','بسته']);return u;};

const selectUnit=(product,value,name)=>`<select name="${name}" required>${productUnits(product).map(([v,l])=>opt(v,l,value)).join('')}</select>`;
const currRows=(form)=>{if(!form)return; saleState={customerId:form.querySelector('[name=customerId]')?.value||'',paidAmount:form.querySelector('[name=paidAmount]')?.value||'0',paymentMethod:form.querySelector('[name=paymentMethod]')?.value||'cash'};const entries=[...form.querySelectorAll('[data-sale-row]')];saleRows=entries.map((el)=>({productId:el.querySelector('[name=productId]')?.value||'',unit:el.querySelector('[name=unit]')?.value||'',quantity:el.querySelector('[name=quantity]')?.value||'',unitPrice:el.querySelector('[name=unitPrice]')?.value||''}));};

function notify(message,type='ok'){
  document.querySelector('.toast')?.remove(); clearTimeout(toastTimer);
  const el=document.createElement('div');el.className=`toast ${type==='error'?'error':''}`;el.role=type==='error'?'alert':'status';el.textContent=message;document.body.append(el);
  toastTimer=setTimeout(()=>el.remove(),5100);
}

async function refresh(){data=await readAll(db);render();}
function render(){
  if(!data)return;
  const online=navigator.onLine;
  app.innerHTML=`<div class="layout page-${page}">
    <aside class="sidebar">
      <div class="logo"><div class="logo-mark" aria-hidden="true">◈</div><div><strong>انبار من</strong><span>Warehouse Lite</span></div></div>
      <nav class="nav-list" aria-label="بخش‌های برنامه">${tabs.map(([id,label,icon])=>`<button type="button" data-nav="${id}" class="nav ${id===page?'active':''}" ${id===page?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${icon}</span>${label}</button>`).join('')}</nav>
      <div class="side-footer"><strong>نسخه آزمایشی ۰.۱.۷</strong><br/>اطلاعات فقط روی همین دستگاه ذخیره می‌شوند. هر روز پشتیبان تهیه کنید.</div>
    </aside>
    <main class="main">
      <header class="topbar"><div class="topbar-heading"><div class="topbar-mobile-brand"><span class="logo-mark" aria-hidden="true">◈</span><strong>انبار من</strong></div><div><h1>${titleMap[page]}</h1><div class="top-sub">${subtitleMap[page]}</div></div></div><div class="top-right"><span class="pill ${online?'ok':'offline'}" id="net-status">${online?'● آماده کار آفلاین':'● بدون اینترنت'}</span><span class="date">${formatDate()}</span></div></header>
      <div class="page-content">${page==='dashboard'?dashboard():page==='products'?productsPage():page==='purchases'?purchasesPage():page==='sales'?salesPage():page==='customers'?customersPage():page==='visits'?visitsPage():page==='profit'?profitPage():backupPage()}</div>
      <footer class="app-footer">
        <span>ساخته‌شده برای داداش علی</span>
        <span>طراحی و توسعه:
          <a href="https://parvizbahramib73.github.io/personal-brand-website" target="_blank" rel="noopener noreferrer" aria-label="وب‌سایت شخصی Parviz Bahrami">Parviz Bahrami <span aria-hidden="true">↗</span></a>
        </span>
      </footer>
    </main>
    <nav class="mobile-nav" aria-label="ناوبری موبایل">${[['dashboard','خانه','⌂'],['products','کالا','▦'],['purchases','خرید','↓'],['sales','فروش','↑'],['customers','مشتری','♙'],['visits','ویزیت','🧭'],['profit','سود','٪'],['backup','تنظیمات','⚙']].map(([id,l,i])=>`<button type="button" class="mob ${id===page?'active':''}" data-nav="${id}" ${id===page?'aria-current="page"':''}><span aria-hidden="true">${i}</span>${l}</button>`).join('')}</nav>
  </div>${editorModal()}${customerStatementModal()}`;
  app.querySelectorAll('[data-money-input]').forEach(formatMoneyField);
}

function dashboard(){
  const today=todayTehran(new Date().toISOString());
  const todaysSales=data.sales.filter(s=>s.status!=='void'&&todayTehran(s.createdAt)===today);
  const total=todaysSales.reduce((a,b)=>a+b.total,0);
  const balance=data.customers.reduce((a,c)=>a+Math.max(0,customerBalance(c.id,data.sales,data.payments)),0);
  const low=data.products.filter(p=>isActive(p)&&p.stockBase<=p.lowBase);
  const latest=[...data.sales].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5);
  const allFollowups=getCustomerFollowups(data.customers,data.sales,data.payments);
  const followups=allFollowups.slice(0,6);
  return `<section class="welcome-card" aria-label="خوش‌آمدگویی">
    <div class="welcome-content">
      <span class="welcome-kicker">WAREHOUSE LITE · انبار من</span>
      <h2>سلام علی جان، خوش اومدی! <span aria-hidden="true">👋</span></h2>
      <p>از اینجا می‌تونی موجودی انبار، خریدها و فروش‌های روزانه‌ات رو ساده و مرتب مدیریت کنی.</p>
      <div class="welcome-hint"><span aria-hidden="true">✦</span> همه‌چیز برای یک روز کاری منظم آماده است.</div>
    </div>
    <div class="welcome-emblem" aria-hidden="true">
      <span>◈</span><strong>انبار من</strong><small>مدیریت ساده‌تر، خیال راحت‌تر</small>
    </div>
  </section><div class="grid stats">
    ${stat('فروش امروز',money(total),'↗','green')}${stat('مانده مشتریان',money(balance),'◉','peach')}${stat('تنوع کالا',data.products.length+' قلم','▦','blue')}${stat('کم‌موجود',low.length+' کالا','!','peach')}
  </div>
  <div class="quick-actions"><button class="quick" data-nav="sales"><span>🧾</span> ثبت فروش جدید</button><button class="quick" data-nav="purchases"><span>📦</span> ورود کالا</button><button class="quick" data-nav="customers"><span>👤</span> مدیریت مشتری</button><button class="quick" data-nav="visits"><span>🧭</span> برنامه ویزیت</button><button class="quick" data-nav="profit"><span>٪</span> گزارش سود</button></div>
  <div class="grid two"><section class="card"><div class="card-header"><h2>آخرین فاکتورهای فروش</h2><button class="btn sm outline" data-nav="sales">مشاهده همه</button></div>
  ${latest.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>مشتری</th><th>مبلغ</th><th>زمان</th><th>فاکتور</th></tr></thead><tbody>${latest.map(s=>`<tr><td class="name-cell"><strong>${esc(s.customerName)}</strong><small>${esc(s.invoiceNo)}</small></td><td>${money(s.total)}</td><td>${dateFa(s.createdAt)}</td><td><div class="record-actions"><button class="btn outline sm" data-invoice="${esc(s.id)}">چاپ / PDF</button><button class="btn sm primary" data-share-invoice="${esc(s.id)}">ارسال فاکتور</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('🧾','هنوز فاکتوری صادر نشده است.','برای شروع، کالا و مشتری تعریف کنید.')}</section>
  <section class="card"><div class="card-header"><h2>کالاهای نیازمند تأمین</h2><span class="tag ${low.length?'low':'good'}">${low.length} مورد</span></div>
  ${low.length?`<div class="list">${low.slice(0,7).map(p=>`<div class="list-row"><div class="item-avatar">📦</div><div class="grow"><strong>${esc(p.name)}</strong><small>حد هشدار: ${stockLabel(p,p.lowBase)}</small></div><span class="tag low">${stockLabel(p)}</span></div>`).join('')}</div>`:empty('✓','همه‌چیز مرتب است.','در حال حاضر کالای کم‌موجود ندارید.')}</section></div>
  <section class="card followup-panel"><div class="card-header"><div><h2>مشتریان نیازمند پیگیری</h2><p class="small muted">بر اساس آخرین فاکتور و مانده حساب ثبت‌شده</p></div><span class="tag ${allFollowups.length?'low':'good'}">${allFollowups.length} مورد</span></div>
  ${followups.length?`<div class="list followup-list">${followups.map(c=>`<div class="list-row followup-row"><div class="item-avatar">🧭</div><div class="grow"><strong>${esc(c.name)}</strong><small>${esc(c.reason)} · ${c.daysSinceSale===null?'بدون فاکتور ثبت‌شده':c.daysSinceSale===0?'خرید امروز':`${new Intl.NumberFormat('fa-IR').format(c.daysSinceSale)} روز از آخرین خرید`}</small><small>${esc(c.district||'همدان')} ${c.lastSale?'· '+dateFa(c.lastSale.createdAt):''}</small></div><div class="followup-side">${c.balance>0?`<strong class="number debt">${money(c.balance)}</strong><small>مانده حساب</small>`: '<span class="tag good">پیگیری رضایت</span>'}<button class="btn sm soft" data-customer-statement="${esc(c.id)}">گردش حساب</button></div></div>`).join('')}</div>`:empty('✓','فعلاً موردی برای پیگیری نیست','با ثبت خریدهای جدید، پیشنهادهای پیگیری اینجا نمایش داده می‌شوند.')}</section>
  ${!data.products.length?`<div class="inline-note warning">برای شروع می‌توانید چند کالای واقعی ثبت کنید، یا فقط برای آزمایش رابط، <button class="btn sm soft" data-action="demo">داده‌های نمونه ایجاد کنید</button>. داده نمونه را با اطلاعات واقعی مخلوط نکنید.</div>`:''}`;
}
function stat(label,value,icon,tone){return `<section class="stat"><div class="stat-icon ${tone}" aria-hidden="true">${icon}</div><div class="stat-label">${label}</div><div class="stat-value mono">${value}</div></section>`;}
function empty(icon,title,detail){return `<div class="empty"><span class="empty-icon" aria-hidden="true">${icon}</span><strong>${title}</strong><div class="small">${detail}</div></div>`;}

const isActive=row=>row?.active!==false;
function canDeleteMaster(type,row){
 if(type==='product')return row.stockBase===0&&!data.movements.some(x=>x.productId===row.id)&&!data.purchases.some(x=>x.productId===row.id)&&!data.sales.some(x=>(x.lines||[]).some(line=>line.productId===row.id));
 if(type==='supplier')return !data.purchases.some(x=>x.supplierId===row.id);
 if(type==='customer')return !data.sales.some(x=>x.customerId===row.id)&&!data.payments.some(x=>x.customerId===row.id);
 return false;
}
function masterActions(type,row,canDelete){
 const archiveDisabled=type==='product'&&row.stockBase>0;
 return `<div class="record-actions"><button type="button" class="btn sm outline" data-edit-type="${type}" data-record-id="${esc(row.id)}">ویرایش</button>${isActive(row)?`<button type="button" class="btn sm soft" data-toggle-type="${type}" data-record-id="${esc(row.id)}" data-active="false" ${archiveDisabled?'disabled title="ابتدا موجودی را تعیین تکلیف کنید"':''}>غیرفعال</button>`:`<button type="button" class="btn sm soft" data-toggle-type="${type}" data-record-id="${esc(row.id)}" data-active="true">فعال‌سازی</button>`}${canDelete?`<button type="button" class="btn sm danger" data-delete-type="${type}" data-record-id="${esc(row.id)}">حذف دائمی</button>`:''}</div>`;
}


function productsPage(){
 const state=listState.products,q=state.query.trim().toLocaleLowerCase('fa');
 let rows=[...data.products].sort((a,b)=>a.name.localeCompare(b.name,'fa')).filter(p=>!q||[p.name,p.code,p.category].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(q));
 if(state.status==='active')rows=rows.filter(isActive);
 if(state.status==='inactive')rows=rows.filter(p=>!isActive(p));
 if(state.status==='low')rows=rows.filter(p=>isActive(p)&&p.stockBase<=p.lowBase);
 const view=listPage(rows,state);
 return `<div class="grid two"><section class="card"><div class="card-header"><div><h2>فهرست کالاها</h2><p class="small muted">جستجو و فیلتر برای مدیریت فهرست‌های بزرگ</p></div><span class="tag">${data.products.length} کالا</span></div>
 <div class="list-toolbar">${listSearch('products','نام، کد یا دسته کالا…')}<select class="toolbar-select" data-list-filter="products-status" aria-label="فیلتر وضعیت کالا"><option value="all" ${state.status==='all'?'selected':''}>همه وضعیت‌ها</option><option value="active" ${state.status==='active'?'selected':''}>فعال</option><option value="inactive" ${state.status==='inactive'?'selected':''}>غیرفعال</option><option value="low" ${state.status==='low'?'selected':''}>کم‌موجود</option></select></div>
 ${view.total?`<div class="table-wrap products-table-wrap"><table class="data-table products-table"><thead><tr><th>کالا</th><th>موجودی</th><th>قیمت پیشنهادی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${view.rows.map(p=>`<tr><td class="name-cell"><strong>${esc(p.name)}</strong><small>${esc(p.category||'بدون دسته')} · ${esc(p.code||'—')}</small></td><td>${stockLabel(p)}</td><td>${money(p.salePrice)} / ${p.kind==='gram'?'کیلو':'عدد'}</td><td><span class="tag ${!isActive(p)?'red':stockTone(p)}">${!isActive(p)?'غیرفعال':p.stockBase<=p.lowBase?'کم‌موجود':'موجود'}</span></td><td>${masterActions('product',p,canDeleteMaster('product',p))}</td></tr>`).join('')}</tbody></table></div>${pager('products',view)}`:empty('🔎','کالایی پیدا نشد','عبارت جستجو یا فیلتر وضعیت را تغییر دهید.')}</section>
 <section class="card"><div class="card-header"><h2>تعریف کالای جدید</h2></div><form data-form="product" class="form-grid">
 <div class="field wide"><label for="p-name">نام کالا *</label><input id="p-name" name="name" required maxlength="100" placeholder="مثلاً بادکا یا روغن قنادی"/></div>
 <div class="field"><label for="p-code">کد کالا (اختیاری)</label><input id="p-code" name="code" maxlength="30" placeholder="مثلاً OIL-5"/></div>
 <div class="field"><label for="p-category">دسته‌بندی</label><input id="p-category" name="category" maxlength="60" placeholder="مواد اولیه"/></div>
 <div class="field"><label for="p-kind">واحد پایه</label><select id="p-kind" name="kind"><option value="piece">عدد</option><option value="gram">کیلوگرم (ذخیره دقیق گرم)</option></select></div>
 <div class="field"><label for="p-pack">مقدار هر بسته (اختیاری)</label><input id="p-pack" name="pack" inputmode="decimal" placeholder="مثلاً ۵ کیلو یا ۱۲ عدد"/><span class="hint">صفر یا خالی یعنی این کالا بسته جداگانه ندارد.</span></div>
 <div class="field"><label for="p-low">حد هشدار موجودی</label><input id="p-low" name="low" inputmode="decimal" value="0" required/><span class="hint">به واحد پایه انتخاب‌شده</span></div>
 <div class="field"><label for="p-price">قیمت فروش پیشنهادی (تومان)</label><input id="p-price" name="salePrice" data-money-input dir="ltr" inputmode="numeric" value="0" required/><span class="hint">به ازای هر کیلو یا هر عدد؛ فاکتور می‌تواند قیمت دیگری داشته باشد.</span></div>
 <div class="form-footer"><button type="submit" class="btn primary full">+ افزودن کالا</button></div>
 </form></section></div>`;
}



function purchasesPage(){
 const activeProducts=data.products.filter(isActive),activeSuppliers=data.suppliers.filter(isActive);
 const supState=listState.suppliers,supQuery=supState.query.trim().toLocaleLowerCase('fa');
 const supFiltered=[...data.suppliers].sort((a,b)=>a.name.localeCompare(b.name,'fa')).filter(s=>!supQuery||[s.name,s.phone].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(supQuery));
 const supView=listPage(supFiltered,supState);
 const state=listState.purchases,q=state.query.trim().toLocaleLowerCase('fa');
 const filtered=[...data.purchases].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).filter(p=>!q||[p.productName,p.supplierName,p.paymentKind].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(q));
 const view=listPage(filtered,state);
 return `<div class="grid two"><section class="card"><div class="card-header"><h2>ثبت خرید و ورود به انبار</h2></div>
 <form data-form="purchase" class="form-grid">
 <div class="field"><label>تأمین‌کننده *</label><select name="supplierId" required>${optionMarkup(activeSuppliers,'id','name')}</select></div>
 <div class="field"><label>کالا *</label><select name="productId" required id="purchase-product">${optionMarkup(activeProducts,'id','name')}</select></div>
 <div class="field"><label>مقدار *</label><input name="quantity" required inputmode="decimal" placeholder="مثلاً ۱۰ یا ۲٫۵"/></div>
 <div class="field"><label>واحد *</label><select name="unit" id="purchase-unit"><option value="">ابتدا کالا را انتخاب کنید</option></select></div>
 <div class="field"><label>قیمت خرید هر واحد (تومان) *</label><input name="unitPrice" data-money-input dir="ltr" required inputmode="numeric" placeholder="مثلاً ۲۵۰۰۰۰"/></div>
 <div class="field"><label>شیوه پرداخت خرید</label><select name="paymentKind"><option value="cash">نقدی</option><option value="transfer">انتقال بانکی</option><option value="credit">نسیه</option><option value="check">چک (ثبت مالی چک هنوز کامل نیست)</option></select></div>
 <div class="form-footer"><button type="submit" class="btn primary full" ${!activeProducts.length||!activeSuppliers.length?'disabled':''}>ثبت قطعی خرید و افزایش موجودی</button></div>
 </form>
 <div class="inline-note warning">ویرایش خرید، موجودی را با سند اصلاحی تنظیم می‌کند. ابطال فقط وقتی مجاز است که موجودی فعلی برای برگشت مقدار خرید کافی باشد.</div></section>
 <section class="grid">
 <div class="card"><div class="card-header"><h2>افزودن تأمین‌کننده</h2></div><form data-form="supplier" class="form-grid"><div class="field wide"><label>نام *</label><input name="name" required maxlength="100" placeholder="شرکت یا فروشنده"/></div><div class="field wide"><label>شماره تماس</label><input name="phone" inputmode="tel" maxlength="25" placeholder="اختیاری"/></div><div class="form-footer"><button class="btn outline full" type="submit">+ ثبت تأمین‌کننده</button></div></form></div>
 <div class="card"><div class="card-header"><div><h2>تأمین‌کنندگان</h2><p class="small muted">جستجو در نام و شماره تماس</p></div><span class="tag">${data.suppliers.length}</span></div>
 ${listSearch('suppliers','نام یا شماره تماس تأمین‌کننده…')}
 ${supView.total?`<div class="list">${supView.rows.map(s=>`<div class="list-row"><div class="item-avatar">🚚</div><div class="grow"><strong>${esc(s.name)}</strong><small>${esc(s.phone||'بدون شماره')}</small>${!isActive(s)?'<span class="tag red">غیرفعال</span>':''}</div>${masterActions('supplier',s,canDeleteMaster('supplier',s))}</div>`).join('')}</div>${pager('suppliers',supView)}`:empty('🚚','تأمین‌کننده‌ای پیدا نشد','عبارت جستجو را تغییر دهید.')}</div>
 <div class="card"><div class="card-header"><div><h2>سوابق خرید</h2><p class="small muted">جستجو در تمام اسناد خرید</p></div><span class="tag">${data.purchases.length} سند</span></div>
 ${listSearch('purchases','نام کالا یا تأمین‌کننده…')}
 ${view.total?`<div class="list">${view.rows.map(p=>`<div class="list-row"><div class="item-avatar">📥</div><div class="grow"><strong>${esc(p.productName)}</strong><small>${esc(p.supplierName)} · ${dateFa(p.createdAt)}</small><span class="tag ${p.status==='void'?'red':'good'}">${p.status==='void'?'باطل شده':money(p.total)}</span></div>${p.status==='void'?'':`<div class="record-actions"><button class="btn sm outline" data-edit-purchase="${esc(p.id)}">ویرایش</button><button class="btn sm danger" data-void-purchase="${esc(p.id)}">ابطال</button></div>`}</div>`).join('')}</div>${pager('purchases',view)}`:empty('🔎','سندی پیدا نشد','عبارت جستجو را تغییر دهید.')}</div>
 </section></div>`;
}


function saleRow(i,row){
 const p=data.products.find(x=>x.id===row.productId);
 const availableProducts=data.products.filter(x=>isActive(x)||x.id===row.productId);
 const unit=row.unit&&productUnits(p).some(x=>x[0]===row.unit)?row.unit:productUnits(p)[0]?.[0]||'';
 return `<div class="line-form" data-sale-row="${i}"><div class="line-form-head"><strong class="small">قلم ${new Intl.NumberFormat('fa-IR').format(i+1)}</strong>${saleRows.length>1?`<button type="button" class="btn sm danger" data-remove-line="${i}">حذف قلم</button>`:''}</div>
 <div class="line-grid"><div class="field"><label>کالا</label><select name="productId" data-sale-product="${i}" required>${availableProducts.length?optionMarkup(availableProducts,'id','name','انتخاب کالا',row.productId):'<option value="">ابتدا کالا تعریف کنید</option>'}</select></div>
 <div class="field"><label>مقدار</label><input name="quantity" required inputmode="decimal" value="${esc(row.quantity)}" placeholder="۱"/></div>
 <div class="field"><label>واحد</label><select name="unit">${p?productUnits(p).map(([v,l])=>opt(v,l,unit)).join(''):'<option value="">—</option>'}</select></div>
 <div class="field"><label>قیمت واحد (تومان)</label><input name="unitPrice" data-money-input dir="ltr" required inputmode="numeric" value="${esc(row.unitPrice)}" placeholder="قیمت دلخواه"/></div></div></div>`;
}


function salesPage(){
 const activeCustomers=data.customers.filter(isActive),activeProducts=data.products.filter(isActive);
 const state=listState.sales,q=state.query.trim().toLocaleLowerCase('fa');
 let filtered=[...data.sales].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).filter(s=>!q||[s.customerName,s.invoiceNo].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(q));
 if(state.status==='active')filtered=filtered.filter(s=>s.status!=='void');
 if(state.status==='void')filtered=filtered.filter(s=>s.status==='void');
 const view=listPage(filtered,state);
 return `<div class="grid two"><section class="card"><div class="card-header"><h2>صدور فاکتور فروش</h2><span class="tag">موجودی پس از تأیید کم می‌شود</span></div>
 <form data-form="sale" id="sale-form" class="sale-form" data-sale-lines-form><div class="sale-customer-row"><div class="field"><label>مشتری *</label><select name="customerId" required>${optionMarkup(activeCustomers,'id','name','انتخاب مشتری',saleState.customerId)}</select></div><button type="button" class="btn sm soft sale-new-customer" data-nav="customers">+ مشتری جدید</button></div><div class="section-split" style="margin:18px 0"></div>
 <div id="sale-lines">${saleRows.map((row,i)=>saleRow(i,row)).join('')}</div><button class="btn outline sm" data-action="add-line" type="button">+ افزودن قلم دیگر</button>
 <div class="sale-checkout">
 <div class="line-summary sale-summary"><div><span class="summary-label">جمع نهایی فاکتور</span><small>مبلغ به تومان</small></div><strong class="headline-number" id="sale-total">—</strong></div>
 <div class="form-grid sale-payment-grid"><div class="field"><label>مبلغ دریافت اولیه (تومان)</label><input name="paidAmount" data-money-input dir="ltr" inputmode="numeric" value="${esc(saleState.paidAmount)}" required/></div>
 <div class="field"><label>روش دریافت</label><select name="paymentMethod"><option value="cash" ${saleState.paymentMethod==='cash'?'selected':''}>نقدی</option><option value="transfer" ${saleState.paymentMethod==='transfer'?'selected':''}>انتقال بانکی</option></select></div>
 <div class="form-footer sale-submit"><button class="btn primary full" type="submit" ${!activeProducts.length||!activeCustomers.length?'disabled':''}>تأیید فاکتور و کسر موجودی</button></div></div>
 </div>
 </form>
 <div class="inline-note warning">فاکتورهای ثبت‌شده قابل ویرایش‌اند. ابطال فاکتور فقط وقتی مجاز است که دریافت وجه یا تسویه بعدی نامشخصی به آن مشتری مرتبط نباشد.</div></section>
 <section class="card"><div class="card-header"><div><h2>فاکتورهای ثبت‌شده</h2><p class="small muted">جستجو و فیلتر بدون بارگذاری همه ردیف‌ها در صفحه</p></div><span class="tag">${data.sales.length} فاکتور</span></div><div class="invoice-share-note">برای ارسال، «ارسال فاکتور» را بزنید و در منوی اشتراک‌گذاری گوشی، واتساپ، تلگرام، روبیکا یا ایتا را انتخاب کنید.</div>
 <div class="list-toolbar">${listSearch('sales','نام مشتری یا شماره فاکتور…')}<select class="toolbar-select" data-list-filter="sales-status" aria-label="وضعیت فاکتور"><option value="all" ${state.status==='all'?'selected':''}>همه فاکتورها</option><option value="active" ${state.status==='active'?'selected':''}>فعال</option><option value="void" ${state.status==='void'?'selected':''}>باطل‌شده</option></select></div>
 ${view.total?`<div class="list">${view.rows.map(s=>`<div class="list-row invoice-row"><div class="item-avatar"><span aria-hidden="true">🧾</span></div><div class="grow"><strong>${esc(s.customerName)}</strong><small>${dateFa(s.createdAt)} · ${s.lines.length} قلم</small><small>${esc(s.invoiceNo)}</small><span class="tag ${s.status==='void'?'red':'good'}">${s.status==='void'?'باطل شده':money(s.total)}</span></div><div class="record-actions"><button class="btn sm outline" data-invoice="${esc(s.id)}">چاپ / PDF</button><button class="btn sm primary" data-share-invoice="${esc(s.id)}">ارسال فاکتور</button>${s.status==='void'?'':`<button class="btn sm outline" data-edit-sale="${esc(s.id)}">ویرایش</button><button class="btn sm danger" data-void-sale="${esc(s.id)}">ابطال</button>`}</div></div>`).join('')}</div>${pager('sales',view)}`:empty('🔎','فاکتوری پیدا نشد','عبارت جستجو یا وضعیت را تغییر دهید.')}</section></div>`;
}



function customersPage(){
 const customerOptions=data.customers.map(c=>({...c,displayName:c.name+(isActive(c)?'':' (غیرفعال)')}));
 const state=listState.customers,q=state.query.trim().toLocaleLowerCase('fa');
 const filtered=[...data.customers].sort((a,b)=>a.name.localeCompare(b.name,'fa')).filter(c=>!q||[c.name,c.phone,c.district].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(q));
 const view=listPage(filtered,state);
 return `<div class="grid two customer-layout"><section class="card"><div class="card-header"><div><h2>فهرست مشتریان و حساب‌ها</h2><p class="small muted">جستجو، تماس و مشاهده گردش مالی هر مشتری</p></div><span class="tag">${data.customers.length} مشتری</span></div>
 ${listSearch('customers','جستجوی نام، شماره یا محله…')}
 ${view.total?`<div class="list customer-list">${view.rows.map(c=>{const balance=customerBalance(c.id,data.sales,data.payments);return `<div class="list-row customer-row"><div class="item-avatar"><span aria-hidden="true">👤</span></div><div class="grow"><strong>${esc(c.name)}</strong><small>${esc(c.district||'همدان')} · ${esc(c.visitDay||'بدون روز ویزیت')}</small>${c.phone?`<a href="tel:${esc(c.phone)}" class="small customer-phone">تماس: <bdi>${esc(c.phone)}</bdi></a>`:''}<span class="tag ${isActive(c)?'good':'red'}">${isActive(c)?'فعال':'غیرفعال'}</span></div><div class="customer-balance"><div class="number ${balance>0?'debt':'credit'}">${money(balance)}</div><small class="muted">${balance>0?'بدهکار':balance<0?'بستانکار':'تسویه'}</small><div class="customer-actions"><button type="button" class="btn sm soft" data-customer-statement="${esc(c.id)}">گردش حساب</button>${masterActions('customer',c,canDeleteMaster('customer',c))}</div></div></div>`}).join('')}</div>${pager('customers',view)}`:empty('🔎','مشتری‌ای پیدا نشد','عبارت جستجو را تغییر دهید.')}</section>
 <section class="grid customer-forms"><div class="card"><div class="card-header"><div><h2>افزودن مشتری</h2><p class="small muted">اطلاعات تماس و زمان مراجعه را ثبت کنید</p></div></div><form data-form="customer" class="form-grid">
 <div class="field wide"><label>نام قنادی یا مشتری *</label><input name="name" required maxlength="100" placeholder="مثلاً قنادی بهار"/></div>
 <div class="field"><label>موبایل یا تلفن</label><input name="phone" inputmode="tel" maxlength="25" placeholder="شماره تماس"/></div><div class="field"><label>محله یا خیابان</label><input name="district" maxlength="80" placeholder="مثلاً مهدیه"/></div>
 <div class="field"><label>روز ویزیت</label><select name="visitDay"><option value="">بدون برنامه</option>${weekday.map(d=>opt(d,d,'')).join('')}</select></div>
 <div class="field"><label>یادداشت / نشانی</label><input name="note" maxlength="150"/></div>
 <div class="form-footer"><button type="submit" class="btn primary full">+ ثبت مشتری</button></div></form></div>
 <div class="card"><div class="card-header"><div><h2>ثبت دریافت وجه</h2><p class="small muted">ثبت نقدی یا انتقال بانکی از مشتری</p></div></div><form data-form="payment" class="form-grid"><div class="field wide"><label>مشتری *</label><select name="customerId" required>${optionMarkup(customerOptions,'id','displayName')}</select></div>
 <div class="field"><label>مبلغ (تومان)</label><input required name="amount" data-money-input dir="ltr" inputmode="numeric" placeholder="۰"/></div>
 <div class="field"><label>روش دریافت</label><select name="method"><option value="cash">نقدی</option><option value="transfer">انتقال بانکی</option></select></div>
 <div class="field wide"><label>شرح اختیاری</label><input name="note" maxlength="250" placeholder="مثلاً تسویه بخشی از بدهی"/></div>
 <div class="form-footer"><button type="submit" class="btn outline full" ${!data.customers.length?'disabled':''}>ثبت دریافت و اصلاح مانده</button></div></form></div>
 <div class="card"><div class="card-header"><div><h2>سوابق دریافت وجه</h2><p class="small muted">۱۲ دریافت اخیر</p></div><span class="tag">${data.payments.length}</span></div>
 ${data.payments.length?`<div class="list">${[...data.payments].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,12).map(p=>{const customer=data.customers.find(c=>c.id===p.customerId);return `<div class="list-row"><div class="item-avatar">💳</div><div class="grow"><strong>${esc(customer?.name||'مشتری حذف‌شده')}</strong><small>${dateFa(p.createdAt)} · ${p.method==='cash'?'نقدی':'انتقال بانکی'}</small><small>${esc(p.note||'بدون شرح')}</small><span class="tag ${p.status==='void'?'red':'good'}">${p.status==='void'?'باطل شده':money(p.amount)}</span></div>${p.status==='void'?'':`<div class="record-actions"><button class="btn sm outline" data-edit-payment="${esc(p.id)}">ویرایش</button><button class="btn sm danger" data-void-payment="${esc(p.id)}">ابطال</button></div>`}</div>`}).join('')}</div>`:empty('💳','دریافتی ثبت نشده','دریافت‌های مشتریان در این بخش نمایش داده می‌شوند.')}</div>
 </section></div>`;
}


function customerStatementModal(){
 if(!statementCustomerId)return '';
 const customer=data.customers.find(item=>item.id===statementCustomerId);
 if(!customer)return '';
 const entries=buildCustomerStatement(customer.id,data.sales,data.payments);
 const active=entries.filter(item=>item.status!=='void');
 const salesTotal=active.filter(item=>item.type==='sale').reduce((sum,item)=>sum+item.amount,0);
 const paymentsTotal=active.filter(item=>item.type==='payment').reduce((sum,item)=>sum+item.amount,0);
 const balance=customerBalance(customer.id,data.sales,data.payments);
 const rows=[...entries].reverse().map(item=>`<tr class="${item.status==='void'?'statement-void':''}"><td>${dateFa(item.createdAt)}</td><td><strong>${item.type==='sale'?'فاکتور فروش':'دریافت وجه'}</strong><small class="statement-detail">${esc(item.reference)} ${item.detail?'· '+esc(item.detail):''}</small></td><td>${item.type==='sale'&&item.status!=='void'?money(item.amount):'—'}</td><td>${item.type==='payment'&&item.status!=='void'?money(item.amount):'—'}</td><td><strong>${money(item.balanceAfter)}</strong></td><td><span class="tag ${item.status==='void'?'red':item.type==='sale'?'low':'good'}">${item.status==='void'?'باطل‌شده':item.type==='sale'?'فروش':'دریافت'}</span></td></tr>`).join('');
 return `<div class="statement-backdrop" data-statement-backdrop><section class="statement-modal" role="dialog" aria-modal="true" aria-labelledby="statement-title"><header class="statement-head"><div><span class="welcome-kicker">ALI FACTOR · CUSTOMER LEDGER</span><h2 id="statement-title">گردش حساب ${esc(customer.name)}</h2><p>${esc(customer.district||'همدان')} ${customer.phone?'· '+esc(customer.phone):'· بدون شماره تماس'}</p></div><button type="button" class="btn sm outline" data-close-statement>بستن</button></header>
 <div class="statement-stats"><div><small>مجموع فروش</small><strong>${money(salesTotal)}</strong></div><div><small>مجموع دریافت</small><strong>${money(paymentsTotal)}</strong></div><div class="statement-balance"><small>${balance>0?'مانده بدهی':balance<0?'بستانکاری':'وضعیت حساب'}</small><strong>${money(Math.abs(balance))}</strong></div></div>
 <div class="statement-table-wrap">${entries.length?`<table class="data-table statement-table"><thead><tr><th>تاریخ</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>مانده پس از سند</th><th>نوع</th></tr></thead><tbody>${rows}</tbody></table>`:empty('📒','گردش مالی ثبت نشده','پس از اولین خرید یا دریافت، سوابق اینجا نمایش داده می‌شوند.')}</div>
 <footer class="statement-foot"><span>تعداد اسناد: ${entries.length}</span><span>مانده بر اساس فاکتورهای فعال و دریافت‌های ثبت‌شده محاسبه شده است.</span></footer>
 </section></div>`;
}

function editorModal(){
 if(!editor)return '';
 const row=editor.type==='product'?data.products.find(x=>x.id===editor.id):editor.type==='supplier'?data.suppliers.find(x=>x.id===editor.id):editor.type==='customer'?data.customers.find(x=>x.id===editor.id):editor.type==='purchase'?data.purchases.find(x=>x.id===editor.id):editor.type==='sale'?data.sales.find(x=>x.id===editor.id):data.payments.find(x=>x.id===editor.id);
 if(!row)return '';
 const close='<button type="button" class="btn sm outline" data-close-editor>بستن</button>';
 if(editor.type==='product'){
  const hasHistory=data.movements.some(x=>x.productId===row.id)||data.purchases.some(x=>x.productId===row.id)||data.sales.some(x=>(x.lines||[]).some(line=>line.productId===row.id));
  const low=row.kind==='gram'?String(row.lowBase/1000):String(row.lowBase);
  const pack=row.kind==='gram'?String(row.packBase/1000):String(row.packBase);
  return `<div class="modal-backdrop" data-editor-backdrop><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header class="modal-head"><div><h2 id="editor-title">ویرایش کالا</h2><p class="muted small">${esc(row.name)}</p></div>${close}</header>
  <form data-form="edit-product" class="form-grid"><input type="hidden" name="id" value="${esc(row.id)}">
   <div class="field wide"><label>نام کالا *</label><input name="name" required maxlength="100" value="${esc(row.name)}"></div>
   <div class="field"><label>کد کالا</label><input name="code" maxlength="30" value="${esc(row.code||'')}"></div>
   <div class="field"><label>دسته‌بندی</label><input name="category" maxlength="60" value="${esc(row.category||'')}"></div>
   ${hasHistory?`<div class="field wide"><div class="inline-note warning">به دلیل وجود سابقه خرید، فروش یا موجودی، واحد پایه و اندازه بسته قفل شده‌اند تا سوابق و موجودی تغییر نکند.</div></div>`:`<div class="field"><label>واحد پایه</label><select name="kind"><option value="piece" ${row.kind==='piece'?'selected':''}>عدد</option><option value="gram" ${row.kind==='gram'?'selected':''}>کیلوگرم</option></select></div><div class="field"><label>مقدار هر بسته</label><input name="pack" inputmode="decimal" value="${pack}"></div>`}
   <div class="field"><label>حد هشدار موجودی (${row.kind==='gram'?'کیلوگرم':'عدد'})</label><input name="low" required inputmode="decimal" value="${low}"></div>
   <div class="field"><label>قیمت فروش پیشنهادی (تومان)</label><input name="salePrice" data-money-input dir="ltr" required inputmode="numeric" value="${row.salePrice}"></div>
   <div class="form-footer"><button class="btn primary full" type="submit">ذخیره تغییرات</button></div>
  </form></section></div>`;
 }
 if(editor.type==='supplier'){
  return `<div class="modal-backdrop" data-editor-backdrop><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header class="modal-head"><div><h2 id="editor-title">ویرایش تأمین‌کننده</h2></div>${close}</header>
  <form data-form="edit-supplier" class="form-grid"><input type="hidden" name="id" value="${esc(row.id)}"><div class="field wide"><label>نام *</label><input name="name" required maxlength="100" value="${esc(row.name)}"></div><div class="field wide"><label>شماره تماس</label><input name="phone" maxlength="25" value="${esc(row.phone||'')}"></div><div class="form-footer"><button class="btn primary full" type="submit">ذخیره تغییرات</button></div></form></section></div>`;
 }
 if(editor.type==='customer'){
  return `<div class="modal-backdrop" data-editor-backdrop><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header class="modal-head"><div><h2 id="editor-title">ویرایش مشتری</h2></div>${close}</header>
  <form data-form="edit-customer" class="form-grid"><input type="hidden" name="id" value="${esc(row.id)}"><div class="field wide"><label>نام قنادی یا مشتری *</label><input name="name" required maxlength="100" value="${esc(row.name)}"></div>
  <div class="field"><label>موبایل یا تلفن</label><input name="phone" inputmode="tel" maxlength="25" value="${esc(row.phone||'')}"></div><div class="field"><label>محله یا خیابان</label><input name="district" maxlength="80" value="${esc(row.district||'')}"></div>
  <div class="field"><label>روز ویزیت</label><select name="visitDay"><option value="">بدون برنامه</option>${weekday.map(d=>opt(d,d,row.visitDay||'')).join('')}</select></div><div class="field"><label>یادداشت / نشانی</label><input name="note" maxlength="150" value="${esc(row.note||'')}"></div>
  <div class="form-footer"><button class="btn primary full" type="submit">ذخیره تغییرات</button></div></form></section></div>`;
 }
 if(editor.type==='purchase'){
  const product=data.products.find(x=>x.id===row.productId);
  const supplierOptions=data.suppliers.map(s=>({...s,displayName:s.name+(isActive(s)?'':' (غیرفعال)')}));
  const quantity=row.quantity||String(row.quantityBase);
  return `<div class="modal-backdrop" data-editor-backdrop><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header class="modal-head"><div><h2 id="editor-title">ویرایش سند خرید</h2><p class="muted small">کالا: ${esc(row.productName)} · ${dateFa(row.createdAt)}</p></div>${close}</header>
  <form data-form="edit-purchase" class="form-grid"><input type="hidden" name="id" value="${esc(row.id)}"><div class="field wide"><label>تأمین‌کننده *</label><select name="supplierId" required>${optionMarkup(supplierOptions,'id','displayName','انتخاب تأمین‌کننده',row.supplierId)}</select></div>
  <div class="field"><label>مقدار *</label><input name="quantity" required inputmode="decimal" value="${esc(quantity)}"></div><div class="field"><label>واحد *</label><select name="unit" required>${product?productUnits(product).map(([v,l])=>opt(v,l,row.unit)).join(''):'<option value="">—</option>'}</select></div>
  <div class="field"><label>قیمت واحد خرید (تومان) *</label><input name="unitPrice" data-money-input dir="ltr" required inputmode="numeric" value="${row.unitPrice}"></div><div class="field"><label>روش پرداخت</label><select name="paymentKind">${[['cash','نقدی'],['transfer','انتقال بانکی'],['credit','نسیه'],['check','چک']].map(([v,l])=>opt(v,l,row.paymentKind)).join('')}</select></div>
  <div class="inline-note warning wide">ویرایش فقط وقتی پذیرفته می‌شود که کاهش مقدار باعث موجودی منفی نشود. سابقه اصلاح در گردش انبار باقی می‌ماند.</div>
  <div class="form-footer"><button class="btn primary full" type="submit">ذخیره اصلاح خرید</button></div></form></section></div>`;
 }
 if(editor.type==='sale'){
  const customer=data.customers.find(x=>x.id===row.customerId);
  return `<div class="modal-backdrop" data-editor-backdrop><section class="modal-card wide-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header class="modal-head"><div><h2 id="editor-title">ویرایش فاکتور فروش</h2><p class="muted small">${esc(row.invoiceNo)} · مشتری: ${esc(customer?.name||row.customerName)}</p></div>${close}</header>
  <form data-form="edit-sale" id="sale-edit-form" data-sale-lines-form><input type="hidden" name="id" value="${esc(row.id)}"><input type="hidden" name="customerId" value="${esc(row.customerId)}">
  <div id="sale-edit-lines">${saleRows.map((line,i)=>saleRow(i,line)).join('')}</div><button class="btn outline sm" data-action="add-line" type="button">+ افزودن قلم دیگر</button>
  <div class="line-summary"><span>جمع جدید فاکتور</span><strong class="headline-number" id="sale-edit-total">—</strong></div>
  <div class="inline-note warning">مشتری و دریافت‌های قبلی تغییر نمی‌کنند. اگر مبلغ جدید از دریافت ثبت‌شده کمتر باشد، ویرایش رد می‌شود. گردش موجودی با اسناد اصلاحی ثبت خواهد شد.</div>
  <div class="form-footer"><button class="btn primary full" type="submit">ذخیره فاکتور اصلاح‌شده</button></div></form></section></div>`;
 }
 if(editor.type==='payment'){
  const customer=data.customers.find(x=>x.id===row.customerId);
  return `<div class="modal-backdrop" data-editor-backdrop><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="editor-title"><header class="modal-head"><div><h2 id="editor-title">ویرایش دریافت وجه</h2><p class="muted small">مشتری: ${esc(customer?.name||'—')}</p></div>${close}</header>
  <form data-form="edit-payment" class="form-grid"><input type="hidden" name="id" value="${esc(row.id)}"><div class="field"><label>مبلغ (تومان) *</label><input name="amount" data-money-input dir="ltr" required inputmode="numeric" value="${row.amount}"></div><div class="field"><label>روش دریافت</label><select name="method"><option value="cash" ${row.method==='cash'?'selected':''}>نقدی</option><option value="transfer" ${row.method==='transfer'?'selected':''}>انتقال بانکی</option></select></div><div class="field wide"><label>شرح</label><input name="note" maxlength="250" value="${esc(row.note||'')}"></div><div class="inline-note warning wide">این تغییر مانده حساب مشتری را به‌روزرسانی می‌کند. اگر دریافت به فاکتور مشخصی وصل باشد، مبلغ نباید از مبلغ آن فاکتور بیشتر شود.</div><div class="form-footer"><button class="btn primary full" type="submit">ذخیره دریافت</button></div></form></section></div>`;
 }
 return '';
}
function openEditor(type,id){
 const table={product:'products',supplier:'suppliers',customer:'customers',purchase:'purchases',sale:'sales',payment:'payments'}[type];
 const row=data[table]?.find(x=>x.id===id);if(!row)return notify('رکورد پیدا نشد.','error');
 if(type==='sale'&&row.status==='void')return notify('فاکتور باطل‌شده قابل ویرایش نیست.','error');
 if(type==='purchase'&&row.status==='void')return notify('سند خرید باطل‌شده قابل ویرایش نیست.','error');
 if(type==='payment'&&row.status==='void')return notify('دریافت باطل‌شده قابل ویرایش نیست.','error');
 editor={type,id};
 if(type==='sale'){saleRows=(row.lines||[]).map(line=>({productId:line.productId,unit:line.unit,quantity:String(line.quantity),unitPrice:String(line.unitPrice)}));}
 render();
 if(type==='sale')updateSaleTotal($('#sale-edit-form'));
}
function closeEditor(){
 const wasSale=editor?.type==='sale';editor=null;
 if(wasSale){saleRows=[{productId:'',unit:'',quantity:'1',unitPrice:''}];saleState={customerId:'',paidAmount:'0',paymentMethod:'cash'};}
 render();if(page==='sales')updateSaleTotal($('#sale-form'));
}


function visitsPage(){
 const all=buildRoutePlan(data.customers,data.visits,visitState.date);
 const districts=[...new Set(all.map(row=>row.district||'بدون محله'))].sort((a,b)=>a.localeCompare(b,'fa'));
 const q=visitState.query.trim().toLocaleLowerCase('fa');
 let filtered=all.filter(row=>!q||[row.name,row.phone,row.district].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(q));
 if(visitState.district!=='all')filtered=filtered.filter(row=>(row.district||'بدون محله')===visitState.district);
 if(visitState.status!=='all')filtered=filtered.filter(row=>row.outcome===visitState.status);
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));visitState.page=Math.min(Math.max(1,visitState.page),pages);
 const start=(visitState.page-1)*PAGE_SIZE,rows=filtered.slice(start,start+PAGE_SIZE),groups=groupRoutePlan(rows);
 const count=outcome=>all.filter(row=>row.outcome===outcome).length;
 const pageControl=`<div class="pagination"><span>نمایش ${filtered.length?start+1:0} تا ${Math.min(start+PAGE_SIZE,filtered.length)} از ${filtered.length}</span>${pages>1?`<div class="pagination-actions"><button class="btn sm outline" type="button" data-visit-page="prev" ${start===0?'disabled':''}>قبلی</button><span>صفحه ${visitState.page} از ${pages}</span><button class="btn sm outline" type="button" data-visit-page="next" ${visitState.page>=pages?'disabled':''}>بعدی</button></div>`:''}</div>`;
 const cards=groups.map(group=>`<section class="route-group"><header><h3>${esc(group.district)}</h3><span class="tag">${group.customers.length} مشتری</span></header><div class="route-cards">${group.customers.map(customer=>{
  const key=visitDraftKey(customer.id,visitState.date),draft=visitDrafts.get(key)||{};
  const outcome=draft.outcome||customer.outcome||'planned',note=draft.note??customer.note??'',nextDate=draft.nextFollowUpDate??customer.nextFollowUpDate??'';
  return `<article class="route-customer-card"><div class="route-customer-top"><div class="item-avatar">👤</div><div class="grow"><strong>${esc(customer.name)}</strong><small>${esc(customer.district||'بدون محله')} ${customer.phone?'· '+esc(customer.phone):'· بدون شماره تماس'}</small>${customer.isFollowUp?'<span class="tag low">پیگیری زمان‌بندی‌شده</span>':''}${customer.visit?.outcome&&customer.visit.outcome!=='planned'?'<span class="tag good">نتیجه قبلی همین روز ثبت شده</span>':''}</div>${customer.phone?`<a class="btn sm outline" href="tel:${esc(customer.phone)}">تماس</a>`:''}</div>
  ${customer.isFollowUp&&customer.followUpNote?`<p class="route-previous-note">یادداشت پیگیری قبلی: ${esc(customer.followUpNote)}</p>`:''}
  <form data-form="visit" data-visit-form>
   <input type="hidden" name="customerId" value="${esc(customer.id)}"/><input type="hidden" name="plannedDate" value="${esc(visitState.date)}"/>
   <div class="field"><label>نتیجه مراجعه</label><select name="outcome" data-visit-outcome>${Object.entries(VISIT_OUTCOMES).map(([value,label])=>opt(value,label,outcome)).join('')}</select></div>
   ${outcome==='follow_up'?`<div class="field"><label>تاریخ پیگیری بعدی *</label><input type="date" name="nextFollowUpDate" value="${esc(nextDate)}" min="${esc(visitState.date)}" required/></div>`:''}
   <div class="field"><label>یادداشت کوتاه (اختیاری)</label><textarea name="note" rows="2" maxlength="500" placeholder="مثلاً روغن نیاز داشت؛ فردا تماس بگیر…">${esc(note)}</textarea></div>
   <button class="btn primary full" type="submit">ذخیره نتیجه مراجعه</button>
  </form>
  </article>`;
 }).join('')}</div></section>`).join('');
 const weekdayName=weekdayForRoute(visitState.date);
 return `<div class="route-page">
  <section class="card route-toolbar-card"><div class="route-toolbar-heading"><div><h2>برنامه مسیر ویزیت</h2><p class="small muted">مشتریان بر اساس روز مراجعه و محله گروه‌بندی شده‌اند.</p></div><button class="btn sm outline" type="button" data-visit-today>امروز</button></div>
   <div class="route-filters"><div class="field"><label>تاریخ مسیر</label><input type="date" data-visit-date value="${esc(visitState.date)}"/></div><div class="field route-search-field"><label>جستجوی مشتری</label><input type="search" data-visit-search value="${esc(visitState.query)}" placeholder="نام، تلفن یا محله…"/></div><div class="field"><label>محله</label><select data-visit-district><option value="all">همه محله‌ها</option>${districts.map(d=>opt(d,d,visitState.district)).join('')}</select></div><div class="field"><label>وضعیت مراجعه</label><select data-visit-status><option value="all">همه وضعیت‌ها</option>${Object.entries(VISIT_OUTCOMES).map(([value,label])=>opt(value,label,visitState.status)).join('')}</select></div></div>
   <div class="route-day-caption"><strong>${weekdayName?weekdayName+' · ':''}${dateFa(visitState.date)}</strong><span>${all.length} مشتری در برنامه این روز</span></div>
  </section>
  <div class="grid route-stats">
   <div class="stat"><span class="stat-label">کل برنامه</span><strong class="stat-value">${all.length} مشتری</strong></div>
   <div class="stat"><span class="stat-label">خرید انجام شد</span><strong class="stat-value route-good">${count('purchased')}</strong></div>
   <div class="stat"><span class="stat-label">خرید انجام نشد</span><strong class="stat-value">${count('no_purchase')}</strong></div>
   <div class="stat"><span class="stat-label">در انتظار / پیگیری</span><strong class="stat-value route-warn">${count('planned')+count('follow_up')+count('unavailable')}</strong></div>
  </div>
  <section class="card route-results-card"><div class="card-header"><div><h2>ترتیب مراجعه بر اساس محله</h2><p class="small muted">برای افزودن مشتری به روز دیگری، روز ویزیت او را در بخش مشتریان تنظیم کنید.</p></div><span class="tag">${filtered.length} نتیجه</span></div>
   ${filtered.length?cards:empty('🧭','مشتری‌ای در این برنامه نیست','روز ویزیت مشتریان را در بخش مشتریان تعیین کنید یا فیلترها را تغییر دهید.')}
   ${filtered.length?pageControl:''}
  </section>
  <div class="inline-note warning">ثبت نتیجه مراجعه، فقط سابقه ویزیت را ذخیره می‌کند و به‌تنهایی فاکتور فروش یا دریافت وجه ایجاد نمی‌کند. برای ثبت مبلغ فروش یا تسویه، از بخش فروش و حساب مشتری استفاده کنید.</div>
 </div>`;
}
function weekdayForRoute(date){
 const parts=String(date||'').split('-').map(Number);
 if(parts.length!==3||!parts.every(Number.isFinite))return '';
 const d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
 return weekday[d.getUTCDay()]||'';
}

function profitPage(){
 const invalidRange=profitState.from&&profitState.to&&profitState.from>profitState.to;
 const report=invalidRange?null:buildProfitReport(data.sales,data.purchases,profitState.from,profitState.to);
 const q=profitState.query.trim().toLocaleLowerCase('fa');
 const filtered=(report?.rows||[]).filter(row=>!q||[row.invoiceNo,row.customerName].filter(Boolean).join(' ').toLocaleLowerCase('fa').includes(q));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));profitState.page=Math.min(Math.max(1,profitState.page),pages);
 const start=(profitState.page-1)*PAGE_SIZE,rows=filtered.slice(start,start+PAGE_SIZE);
 const pageControl=`<div class="pagination"><span>نمایش ${filtered.length?start+1:0} تا ${Math.min(start+PAGE_SIZE,filtered.length)} از ${filtered.length}</span>${pages>1?`<div class="pagination-actions"><button class="btn sm outline" type="button" data-profit-page="prev" ${start===0?'disabled':''}>قبلی</button><span>صفحه ${profitState.page} از ${pages}</span><button class="btn sm outline" type="button" data-profit-page="next" ${profitState.page>=pages?'disabled':''}>بعدی</button></div>`:''}</div>`;
 const margin=report?.marginPercent===null||report?.marginPercent===undefined?'—':new Intl.NumberFormat('fa-IR',{maximumFractionDigits:1}).format(report.marginPercent)+'٪';
 const profitValue=report?.salesCount>0&&report.coveredSales===0?'قابل محاسبه نیست':money(report?.grossProfit||0);
 const costValue=report?.coveredSales?money(report.costOfGoods):'—';
 return `<div class="profit-page">
  <section class="card profit-filter-card"><div class="profit-filter-heading"><div><h2>گزارش سود و فروش</h2><p class="small muted">بازه زمانی را انتخاب کنید؛ فاکتورهای باطل‌شده در گزارش نیستند.</p></div><span class="tag">برآورد سود ناخالص</span></div>
   <div class="profit-filters"><div class="field"><label>از تاریخ</label><input type="date" data-profit-from value="${esc(profitState.from)}"/></div><div class="field"><label>تا تاریخ</label><input type="date" data-profit-to value="${esc(profitState.to)}"/></div><div class="field profit-search-field"><label>جستجوی فاکتور یا مشتری</label><input type="search" data-profit-search value="${esc(profitState.query)}" placeholder="شماره فاکتور یا نام مشتری…"/></div></div>
  </section>
  ${invalidRange?'<div class="inline-note warning">تاریخ شروع باید قبل از تاریخ پایان باشد.</div>':`
  <div class="grid profit-stats">
   <div class="stat"><span class="stat-label">فروش ثبت‌شده</span><strong class="stat-value">${money(report.revenue)}</strong><small class="muted">${report.salesCount} فاکتور فعال</small></div>
   <div class="stat"><span class="stat-label">بهای خرید فاکتورهای قابل محاسبه</span><strong class="stat-value">${costValue}</strong><small class="muted">${report.coveredSales} فاکتور با بهای کامل</small></div>
   <div class="stat profit-highlight"><span class="stat-label">سود ناخالص فاکتورهای قابل محاسبه</span><strong class="stat-value">${profitValue}</strong><small class="muted">حاشیه سود ${margin}</small></div>
   <div class="stat"><span class="stat-label">فاکتور با بهای نامشخص</span><strong class="stat-value">${report.unknownSales}</strong><small class="muted">${money(report.unknownRevenue)} فروش بدون بهای کامل</small></div>
  </div>
  <section class="card profit-table-card"><div class="card-header"><div><h2>سود هر فاکتور</h2><p class="small muted">${report.snapshotSales} فاکتور با بهای ثبت‌شده · ${report.estimatedSales} فاکتور با بهای تاریخی بازسازی‌شده</p></div><span class="tag">${filtered.length} نتیجه</span></div>
   ${rows.length?`<div class="table-wrap"><table class="data-table profit-table"><thead><tr><th>فاکتور / مشتری</th><th>تاریخ</th><th>فروش</th><th>بهای خرید</th><th>سود ناخالص</th><th>مبنای هزینه</th></tr></thead><tbody>${rows.map(row=>`<tr><td class="name-cell"><strong>${esc(row.customerName)}</strong><small>${esc(row.invoiceNo)}</small></td><td>${dateFa(row.createdAt)}</td><td>${money(row.revenue)}</td><td>${row.costComplete?money(row.cost):'—'}</td><td>${row.costComplete?`<strong class="${row.grossProfit>=0?'route-good':'debt'}">${money(row.grossProfit)}</strong>`:'—'}</td><td><span class="tag ${row.costSource==='missing'?'low':'good'}">${row.costSource==='snapshot'?'میانگین موزون ثبت‌شده':row.costSource==='historical-estimate'?'برآورد از سوابق خرید':'بهای خرید نامشخص'}</span></td></tr>`).join('')}</tbody></table></div>${pageControl}`:empty('🔎','فاکتوری در این بازه پیدا نشد','بازه زمانی یا عبارت جستجو را تغییر دهید.')}
  </section>`}
  <div class="inline-note warning">سود نمایش‌داده‌شده، سود ناخالص بر پایه میانگین موزون بهای خرید است؛ هزینه‌های حمل، اجاره، حقوق، ضایعات و مالیات از آن کسر نشده‌اند. برای فاکتورهای قدیمی که بهای خرید هنگام فروش ذخیره نشده، سیستم از سوابق خرید موجود برآورد تاریخی می‌سازد؛ فاکتورهای فاقد سابقه خرید کافی جداگانه مشخص می‌شوند.</div>
 </div>`;
}

function backupPage(){const c=data.products.length+data.customers.length+data.sales.length;
 return `<div class="grid two"><section class="card"><div class="card-header"><h2>خروجی رمزگذاری‌شده</h2><span class="tag good">دستی و آفلاین</span></div>
 <p class="text-sm muted" style="line-height:2">یک فایل شامل تمام اطلاعات خرید، موجودی، مشتریان، فاکتورها و دریافت‌ها ساخته می‌شود. آن را روی حافظه خارجی یا جای امن دیگری نگه دارید.</p>
 <form data-form="export" class="form-grid"><div class="field wide"><label>گذرواژه پشتیبان (حداقل ۸ کاراکتر)</label><input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="برای بازیابی به این گذرواژه نیاز است"/></div>
 <div class="form-footer"><button type="submit" class="btn primary full">↓ ساخت و ذخیره فایل پشتیبان</button></div></form>
 <div class="inline-note warning">اگر گذرواژه پشتیبان را فراموش کنید، امکان بازیابی فایل وجود ندارد. پس از خروجی، فایل را به محلی خارج از مرورگر منتقل و آزمایش کنید.</div></section>
 <section class="card"><div class="card-header"><h2>بازیابی از فایل</h2></div>
 <form data-form="import" class="form-grid"><div class="field wide"><label>فایل با پسوند wlbackup</label><input name="file" type="file" accept=".wlbackup,.json,application/json" required/></div>
 <div class="field wide"><label>گذرواژه فایل</label><input name="password" type="password" required minlength="8"/></div><div class="form-footer"><button type="submit" class="btn outline full">بررسی فایل، بدون تغییر داده‌ها</button></div></form>
 ${importCandidate?`<div class="restore-meta" style="margin-top:16px"><strong>فایل معتبر است</strong><div class="small muted">زمان خروجی: ${dateFa(importCandidate.exportedAt)}</div><p class="text-sm" style="margin-top:8px">${importCandidate.products.length} کالا · ${importCandidate.customers.length} مشتری · ${importCandidate.sales.length} فاکتور · ${importCandidate.payments.length} دریافت</p></div>
 <label class="checkbox-line"><input type="checkbox" id="restore-ack"/> می‌دانم که اطلاعات فعلی جایگزین می‌شود؛ از وضعیت فعلی نسخه پشتیبان جداگانه گرفته‌ام.</label>
 <button class="btn danger full" data-action="restore" type="button">جایگزین‌کردن همه اطلاعات با این فایل</button>`:''}</section></div>
 <section class="card" style="margin-top:18px"><div class="card-header"><h2>وضعیت داده‌های دستگاه</h2><span class="tag">یک دستگاه اصلی</span></div>
 <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:12px"><div><strong>${data.products.length}</strong><div class="small muted">کالا</div></div><div><strong>${data.customers.length}</strong><div class="small muted">مشتری</div></div><div><strong>${data.sales.length}</strong><div class="small muted">فاکتور</div></div></div>
 <p class="small muted" style="margin:18px 0 8px;line-height:2">تا وقتی اطلاعات روی سرور نیستند، پاک‌کردن داده مرورگر یا حذف برنامه ممکن است آن‌ها را از بین ببرد. خروجی دستی و آزمون بازیابی ضروری‌اند.</p>
 <div class="actions"><button class="btn outline sm" data-action="persist">درخواست ذخیره‌سازی پایدار مرورگر</button><button class="btn outline sm" data-action="offline-check">بررسی اتصال</button></div>
 </section>`;}

function setPage(next){if(!titleMap[next])return;if(page==='sales')currRows($('#sale-form'));page=next;currentTab='list';render();window.scrollTo({top:0,behavior:'instant'});if(page==='sales')updateSaleTotal($('#sale-form'));}
function updateSaleTotal(form){
 const target=form||(editor?.type==='sale'?$('#sale-edit-form'):$('#sale-form'));if(!target)return;currRows(target);
 try{
  const valid=saleRows.filter(r=>r.productId&&r.quantity&&r.unitPrice);
  const output=target.id==='sale-edit-form'?$('#sale-edit-total'):$('#sale-total');
  if(!output)return;
  if(valid.length!==saleRows.length){output.textContent='—';return;}
  let products=data.products;
  if(target.id==='sale-edit-form'){
   const sale=data.sales.find(x=>x.id===editor.id),oldRequired=new Map();
   for(const line of sale?.lines||[])oldRequired.set(line.productId,(oldRequired.get(line.productId)||0)+line.quantityBase);
   products=data.products.map(p=>({...p,stockBase:p.stockBase+(oldRequired.get(p.id)||0)}));
  }
  const out=validateSaleLines(saleRows,products);output.textContent=money(out.total);
 }catch(e){const output=target.id==='sale-edit-form'?$('#sale-edit-total'):$('#sale-total');if(output)output.textContent=e.message.includes('موجودی')?'موجودی ناکافی':'—';}
}

function invoicePopup(id){
 const sale=data.sales.find(s=>s.id===id);if(!sale)return notify('فاکتور یافت نشد.','error');
 const win=window.open('','_blank');if(!win)return notify('مرورگر اجازه بازکردن پنجره چاپ را نداد.','error');
 const paid=invoicePaidAmount(sale,data.payments),remaining=Math.max(0,sale.total-paid);
 const rowHtml=sale.lines.map((line,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(line.productName)+'</td><td>'+esc(line.quantity)+' '+(line.unit==='kg'?'کیلو':line.unit==='pack'?'بسته':'عدد')+'</td><td>'+money(line.unitPrice)+'</td><td>'+money(line.amount)+'</td></tr>').join('');
 const voidBanner=sale.status==='void'?'<div class="void">این فاکتور باطل شده است و فقط برای مشاهده سابقه نمایش داده می‌شود.</div>':'';
 const html='<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>علی‌فاکتور '+esc(sale.invoiceNo)+'</title><style>'+
 ':root{font-family:Tahoma,"Noto Naskh Arabic",Arial,sans-serif;color:#19333b;background:#f4f8f6}*{box-sizing:border-box}body{margin:0;padding:28px;line-height:1.9}.sheet{max-width:900px;margin:0 auto;background:#fff;border:1px solid #e2eae6;border-radius:18px;overflow:hidden}.brand{background:linear-gradient(120deg,#173642,#176b61,#148b72);color:#fff;padding:28px 34px;display:flex;justify-content:space-between;gap:20px;align-items:center}.brand h1{margin:0;font-size:28px}.brand p{margin:3px 0 0;color:#d7f1e8}.meta{text-align:left;font-size:13px;line-height:2;color:#e9f7f2}.content{padding:26px 34px}.seller{color:#57706e;font-size:13px;margin:0 0 15px}.customer{background:#f2f8f5;border:1px solid #e0eee7;padding:12px 16px;border-radius:10px;margin-bottom:18px}table{width:100%;border-collapse:collapse;text-align:right;margin-top:12px}td,th{border-bottom:1px solid #e7eeea;padding:11px 9px;font-size:13px}th{background:#eef6f2;color:#42605a}.summary{margin:22px 0 0 auto;max-width:390px;background:#f6faf8;border-radius:12px;padding:14px 18px}.summary div{display:flex;justify-content:space-between;gap:20px;padding:5px 0}.summary .grand{font-size:18px;font-weight:bold;color:#087a62;border-top:1px solid #dcebe4;margin-top:6px;padding-top:12px}.void{margin:18px 0;padding:12px;background:#fff0f0;color:#a33;border-radius:8px;font-weight:bold}.no-print{padding:11px 18px;background:#138a71;color:#fff;border:0;border-radius:9px;cursor:pointer;margin:20px 0;font-weight:bold}@media print{body{padding:0;background:#fff}.sheet{border:0;border-radius:0}.no-print{display:none}.brand{print-color-adjust:exact;-webkit-print-color-adjust:exact}th,.customer,.summary{print-color-adjust:exact;-webkit-print-color-adjust:exact}}'+
 '</style></head><body><article class="sheet"><header class="brand"><div><h1>علی‌فاکتور</h1><p>پخش مواد اولیه قنادی علی · همدان</p><p>فاکتور فروش</p></div><div class="meta">شماره: <bdi><b>'+esc(sale.invoiceNo)+'</b></bdi><br/>تاریخ: '+dayFa(sale.createdAt)+'<br/>صادرکننده: علی</div></header><main class="content">'+voidBanner+'<p class="seller">صادرکننده: <strong>علی</strong> · پخش مواد اولیه قنادی · همدان</p><div class="customer">مشتری: <strong>'+esc(sale.customerName)+'</strong></div><table><thead><tr><th>ردیف</th><th>شرح کالا</th><th>مقدار</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>'+rowHtml+'</tbody></table><section class="summary"><div><span>جمع فاکتور</span><strong>'+money(sale.total)+'</strong></div><div><span>دریافت ثبت‌شده برای این فاکتور</span><strong>'+money(paid)+'</strong></div><div class="grand"><span>مانده این فاکتور</span><strong>'+money(remaining)+'</strong></div></section><div style="text-align:center;margin-top:24px;color:#54716b">با سپاس از خرید شما ❤️<br/><strong>علی</strong><br/><small>علی‌فاکتور · تهیه‌شده با سامانه انبار من</small></div><button class="no-print" onclick="window.print()">چاپ / ذخیره PDF</button></main></article></body></html>';
 win.document.open();win.document.write(html);win.document.close();
}

async function makeDemo(){if(data.products.length||data.customers.length||data.sales.length||data.purchases.length)throw new Error('داده نمونه فقط روی پایگاه‌داده خالی قابل ایجاد است.');
 const s=await addRecord(db,'suppliers',{name:'تأمین‌کننده نمونه',phone:''});
 const p1=await addRecord(db,'products',{name:'بادکا',code:'DEMO-1',category:'مواد اولیه',kind:'gram',packBase:0,lowBase:3000,salePrice:88000,lastBuyPrice:0,stockBase:0});
 const p2=await addRecord(db,'products',{name:'روغن قنادی',code:'DEMO-2',category:'روغن',kind:'gram',packBase:5000,lowBase:10000,salePrice:138000,lastBuyPrice:0,stockBase:0});
 await addRecord(db,'customers',{name:'قنادی نمونه همدان',phone:'',district:'مهدیه',visitDay:'شنبه',note:'اطلاعات ساختگی'});
 await addPurchase(db,{productId:p1.id,supplierId:s.id,unit:'kg',quantity:'25',unitPrice:'70000',paymentKind:'cash'});
 await addPurchase(db,{productId:p2.id,supplierId:s.id,unit:'pack',quantity:'8',unitPrice:'550000',paymentKind:'cash'});
 await refresh();notify('داده‌های نمونه افزوده شدند؛ برای استفاده واقعی با اطلاعات آزمایشی دیگر جایگزین کنید.');
}

app.addEventListener('click',async(event)=>{
 const listPageButton=event.target.closest('[data-list-page]');if(listPageButton){const key=listPageButton.dataset.listKey,state=listState[key];if(state){state.page=Math.max(1,state.page+(listPageButton.dataset.direction==='next'?1:-1));render();}return;}
 const visitPageButton=event.target.closest('[data-visit-page]');if(visitPageButton){visitState.page=Math.max(1,visitState.page+(visitPageButton.dataset.visitPage==='next'?1:-1));render();return;}
 const profitPageButton=event.target.closest('[data-profit-page]');if(profitPageButton){profitState.page=Math.max(1,profitState.page+(profitPageButton.dataset.profitPage==='next'?1:-1));render();return;}
 if(event.target.closest('[data-visit-today]')){visitState.date=todayKey;visitState.page=1;render();return;}

 const statementClose=event.target.closest('[data-close-statement]');if(statementClose||event.target.matches('[data-statement-backdrop]')){statementCustomerId=null;render();return;}
 const statementOpen=event.target.closest('[data-customer-statement]');if(statementOpen){statementCustomerId=statementOpen.dataset.customerStatement;render();return;}
 const close=event.target.closest('[data-close-editor]');if(close||event.target.classList.contains('modal-backdrop')){closeEditor();return;}
 const nav=event.target.closest('[data-nav]');if(nav){setPage(nav.dataset.nav);return;}
 const shareButton=event.target.closest('[data-share-invoice]');if(shareButton){
  const sale=data.sales.find(x=>x.id===shareButton.dataset.shareInvoice);
  if(!sale)return notify('فاکتور یافت نشد.','error');
  if(sale.status==='void')return notify('فاکتور باطل‌شده قابل ارسال نیست.','error');
  shareButton.disabled=true;
  try{
   const result=await shareInvoiceFile(sale,data.payments);
   if(result==='shared')notify('تصویر علی‌فاکتور آماده ارسال است؛ پیام‌رسان مقصد را انتخاب کنید.');
   else if(result==='downloaded-and-text-shared')notify('تصویر فاکتور در دانلودها ذخیره شد؛ پیام‌رسان را انتخاب و تصویر را پیوست کنید.');
   else if(result==='downloaded-and-copied')notify('تصویر فاکتور دانلود و متن آن کپی شد؛ آن را در پیام‌رسان پیوست کنید.');
   else if(result==='downloaded')notify('تصویر فاکتور در پوشه دانلودها ذخیره شد.');
  }catch(error){if(error?.name!=='AbortError')notify(error.message||'اشتراک‌گذاری فاکتور انجام نشد.','error');}
  finally{if(shareButton.isConnected)shareButton.disabled=false;}
  return;
 }
 const invoice=event.target.closest('[data-invoice]');if(invoice){invoicePopup(invoice.dataset.invoice);return;}
 const editMaster=event.target.closest('[data-edit-type]');if(editMaster){openEditor(editMaster.dataset.editType,editMaster.dataset.recordId);return;}
 const toggle=event.target.closest('[data-toggle-type]');if(toggle){
  try{await setRecordActive(db,({product:'products',supplier:'suppliers',customer:'customers'})[toggle.dataset.toggleType],toggle.dataset.recordId,toggle.dataset.active==='true');await refresh();notify(toggle.dataset.active==='true'?'رکورد دوباره فعال شد.':'رکورد غیرفعال شد؛ سوابق آن حفظ شده‌اند.');}catch(e){notify(e.message,'error');}return;
 }
 const del=event.target.closest('[data-delete-type]');if(del){
  const type=del.dataset.deleteType,id=del.dataset.recordId,table=({product:'products',supplier:'suppliers',customer:'customers'})[type],row=data[table].find(x=>x.id===id);
  if(!confirm(`حذف دائمی «${row?.name||'این رکورد'}»؟ این عملیات فقط برای رکورد بدون سابقه مجاز است.`))return;
  try{await deleteRecord(db,table,id);await refresh();notify('رکورد حذف شد.');}catch(e){notify(e.message,'error');}return;
 }
 const editPurchase=event.target.closest('[data-edit-purchase]');if(editPurchase){openEditor('purchase',editPurchase.dataset.editPurchase);return;}
 const voidPurchaseButton=event.target.closest('[data-void-purchase]');if(voidPurchaseButton){
  if(!confirm('این سند خرید باطل شود؟ موجودی به اندازه مقدار خرید کاهش می‌یابد و سابقه سند حفظ می‌شود.'))return;
  try{await voidPurchase(db,voidPurchaseButton.dataset.voidPurchase);await refresh();notify('سند خرید باطل و گردش موجودی اصلاح شد.');}catch(e){notify(e.message,'error');}return;
 }
 const editSale=event.target.closest('[data-edit-sale]');if(editSale){openEditor('sale',editSale.dataset.editSale);return;}
 const voidSaleButton=event.target.closest('[data-void-sale]');if(voidSaleButton){
  if(!confirm('فاکتور باطل شود؟ کالاها به موجودی برمی‌گردند. اگر دریافت وجه یا تسویه بعدی وجود داشته باشد، عملیات به‌صورت امن متوقف می‌شود.'))return;
  try{await voidSale(db,voidSaleButton.dataset.voidSale);await refresh();notify('فاکتور باطل و موجودی اصلاح شد.');}catch(e){notify(e.message,'error');}return;
 }
 const editPayment=event.target.closest('[data-edit-payment]');if(editPayment){openEditor('payment',editPayment.dataset.editPayment);return;}
 const voidPaymentButton=event.target.closest('[data-void-payment]');if(voidPaymentButton){
  if(!confirm('این دریافت باطل شود؟ سابقه آن حفظ می‌شود و مانده حساب مشتری دوباره محاسبه خواهد شد.'))return;
  try{await voidPayment(db,voidPaymentButton.dataset.voidPayment);await refresh();notify('دریافت باطل شد و مانده حساب به‌روزرسانی شد.');}catch(e){notify(e.message,'error');}return;
 }
 const saleForm=event.target.closest('[data-sale-lines-form]');
 const remove=event.target.closest('[data-remove-line]');if(remove&&saleForm){currRows(saleForm);const index=Number(remove.dataset.removeLine);saleRows.splice(index,1);render();updateSaleTotal();app.querySelector('[data-sale-row="'+Math.min(index,saleRows.length-1)+'"] [name="productId"]')?.focus();return;}
 const act=event.target.closest('[data-action]');if(!act)return;
 try{
  if(act.dataset.action==='add-line'&&saleForm){currRows(saleForm);saleRows.push({productId:'',unit:'',quantity:'1',unitPrice:''});render();updateSaleTotal();app.querySelector('[data-sale-row="'+(saleRows.length-1)+'"] [name="productId"]')?.focus();}
  if(act.dataset.action==='demo'){await makeDemo();}
  if(act.dataset.action==='restore'){
    if(!importCandidate)throw new Error('ابتدا فایل پشتیبان را بررسی کنید.');
    if(!$('#restore-ack')?.checked)throw new Error('تأیید تهیه نسخه پشتیبان از داده فعلی ضروری است.');
    if(!confirm('این عملیات همه اطلاعات فعلی را حذف و با فایل انتخاب‌شده جایگزین می‌کند. آیا مطمئنید؟'))return;
    await replaceAll(db,importCandidate);importCandidate=null;importWrapper=null;await refresh();notify('بازیابی انجام شد. تعداد کالا و فاکتور را کنترل کنید.');
  }
  if(act.dataset.action==='persist'){
    if(!navigator.storage?.persist)throw new Error('مرورگر این قابلیت را پشتیبانی نمی‌کند.');
    const ok=await navigator.storage.persist();notify(ok?'مرورگر ذخیره‌سازی پایدار را پذیرفت؛ همچنان پشتیبان بگیرید.':'مرورگر درخواست را نپذیرفت؛ حتماً خارج از دستگاه پشتیبان نگه دارید.',ok?'ok':'error');
  }
  if(act.dataset.action==='offline-check')notify(navigator.onLine?'اکنون آنلاین هستید. برای تست واقعی حالت پرواز را فعال کنید.':'اکنون بدون اینترنت کار می‌کنید.');
 }catch(e){notify(e.message||'خطایی رخ داد.','error');}
});

app.addEventListener('change',event=>{
 if(event.target.id==='purchase-product'){
  const p=data.products.find(p=>p.id===event.target.value);
  const select=$('#purchase-unit');select.innerHTML=p?productUnits(p).map(([v,l])=>opt(v,l,'' )).join(''):'<option value="">انتخاب کالا</option>';
 }
 if(event.target.matches('[data-list-filter]')){
  const filter=event.target.dataset.listFilter;
  if(filter==='products-status')listState.products.status=event.target.value;
  if(filter==='sales-status')listState.sales.status=event.target.value;
  const key=filter.split('-')[0];if(listState[key])listState[key].page=1;
  render();return;
 }
 if(event.target.matches('[data-visit-date]')){visitState.date=event.target.value||todayKey;visitState.page=1;render();return;}
 if(event.target.matches('[data-visit-district]')){visitState.district=event.target.value;visitState.page=1;render();return;}
 if(event.target.matches('[data-visit-status]')){visitState.status=event.target.value;visitState.page=1;render();return;}
 if(event.target.matches('[data-profit-from]')){profitState.from=event.target.value;profitState.page=1;render();return;}
 if(event.target.matches('[data-profit-to]')){profitState.to=event.target.value;profitState.page=1;render();return;}
 if(event.target.matches('[data-visit-outcome]')){rememberVisitDraft(event.target.closest('[data-visit-form]'));render();return;}
 const visitForm=event.target.closest('[data-visit-form]');if(visitForm)rememberVisitDraft(visitForm);
 const saleForm=event.target.closest('[data-sale-lines-form]');
 if(event.target.matches('[data-sale-product]')&&saleForm){
  const index=Number(event.target.dataset.saleProduct);currRows(saleForm);
  const p=data.products.find(p=>p.id===saleRows[index]?.productId);
  if(p){saleRows[index].unit=productUnits(p)[0][0];saleRows[index].unitPrice=String(defaultUnitPrice(p,saleRows[index].unit));}
  render();updateSaleTotal();app.querySelector('[data-sale-row="'+index+'"] [name="quantity"]')?.focus();
 }
 if(saleForm&&event.target.name==='unit'){
  currRows(saleForm);const idx=Number(event.target.closest('[data-sale-row]').dataset.saleRow),p=data.products.find(x=>x.id===saleRows[idx].productId);
  if(p)saleRows[idx].unitPrice=String(defaultUnitPrice(p,saleRows[idx].unit));render();updateSaleTotal();app.querySelector('[data-sale-row="'+idx+'"] [name="unitPrice"]')?.focus();
 }
});
app.addEventListener('input',event=>{
 if(event.target.matches('[data-money-input]'))formatMoneyField(event.target);
 if(event.target.matches('[data-list-search]')){
  const key=event.target.dataset.listSearch,caret=event.target.selectionStart??event.target.value.length;
  if(listState[key]){listState[key].query=event.target.value;listState[key].page=1;renderSearchAgain('[data-list-search="'+key+'"]',caret);}return;
 }
 if(event.target.matches('[data-visit-search]')){
  const caret=event.target.selectionStart??event.target.value.length;visitState.query=event.target.value;visitState.page=1;renderSearchAgain('[data-visit-search]',caret);return;
 }
 if(event.target.matches('[data-profit-search]')){
  const caret=event.target.selectionStart??event.target.value.length;profitState.query=event.target.value;profitState.page=1;renderSearchAgain('[data-profit-search]',caret);return;
 }
 const visitForm=event.target.closest('[data-visit-form]');if(visitForm)rememberVisitDraft(visitForm);
 const saleForm=event.target.closest('[data-sale-lines-form]');if(saleForm)updateSaleTotal(saleForm);
});
app.addEventListener('focusout',event=>{if(event.target.matches('[data-money-input]'))formatMoneyField(event.target);});
app.addEventListener('compositionend',event=>{if(event.target.matches('[data-money-input]'))formatMoneyField(event.target);});

app.addEventListener('submit',async(event)=>{
 const form=event.target.closest('[data-form]');if(!form)return;
 event.preventDefault();const kind=form.dataset.form,submitButton=form.querySelector('[type=submit]');if(submitButton)submitButton.disabled=true;
 try{
  if(kind==='product'){
   const name=formVal(form,'name');if(!name)throw new Error('نام کالا الزامی است.');
   const base=formVal(form,'kind'),lowInput=formVal(form,'low'),packInput=formVal(form,'pack');
   const lowBase=base==='gram'?asDecimalMilli(lowInput,'حد موجودی'):asInteger(lowInput,'حد موجودی');
   const packBase=!packInput?0:(base==='gram'?asDecimalMilli(packInput,'اندازه بسته'):asInteger(packInput,'اندازه بسته'));
   if(packBase===1)throw new Error('اندازه بسته باید بیشتر از یک واحد پایه باشد.');
   const salePrice=asInteger(formVal(form,'salePrice'),'قیمت'),code=formVal(form,'code');
   if(code&&data.products.some(p=>p.code===code))throw new Error('کد کالا تکراری است.');
   await addRecord(db,'products',{name,code,category:formVal(form,'category'),kind:base,lowBase,packBase,salePrice,stockBase:0,lastBuyPrice:0});
  }
  else if(kind==='supplier'){const name=formVal(form,'name');if(!name)throw new Error('نام الزامی است.');await addRecord(db,'suppliers',{name,phone:formVal(form,'phone')});}
  else if(kind==='customer'){const name=formVal(form,'name');if(!name)throw new Error('نام الزامی است.');await addRecord(db,'customers',{name,phone:formVal(form,'phone'),district:formVal(form,'district'),visitDay:formVal(form,'visitDay'),note:formVal(form,'note')});}
  else if(kind==='purchase'){await addPurchase(db,{supplierId:formVal(form,'supplierId'),productId:formVal(form,'productId'),unit:formVal(form,'unit'),quantity:formVal(form,'quantity'),unitPrice:formVal(form,'unitPrice'),paymentKind:formVal(form,'paymentKind')});}
  else if(kind==='sale'){
   currRows(form);await addSale(db,{customerId:formVal(form,'customerId'),lines:saleRows.map(x=>({...x})),paidAmount:formVal(form,'paidAmount'),paymentMethod:formVal(form,'paymentMethod')});
   saleRows=[{productId:'',unit:'',quantity:'1',unitPrice:''}];saleState={customerId:'',paidAmount:'0',paymentMethod:'cash'};
  }
  else if(kind==='payment'){await addPayment(db,{customerId:formVal(form,'customerId'),amount:formVal(form,'amount'),method:formVal(form,'method'),note:formVal(form,'note')});}
  else if(kind==='visit'){
   const customerId=formVal(form,'customerId'),plannedDate=formVal(form,'plannedDate');
   await saveVisit(db,{customerId,plannedDate,outcome:formVal(form,'outcome'),note:formVal(form,'note'),nextFollowUpDate:formVal(form,'nextFollowUpDate')});
   visitDrafts.delete(visitDraftKey(customerId,plannedDate));
  }
  else if(kind==='edit-product'){
   const row=data.products.find(x=>x.id===formVal(form,'id'));if(!row)throw new Error('کالا پیدا نشد.');
   const base=formVal(form,'kind')||row.kind,packInput=formVal(form,'pack');
   const lowInput=formVal(form,'low'),lowBase=base==='gram'?asDecimalMilli(lowInput,'حد هشدار'):asInteger(lowInput,'حد هشدار');
   const packBase=form.elements.pack?(!packInput?0:(base==='gram'?asDecimalMilli(packInput,'اندازه بسته'):asInteger(packInput,'اندازه بسته'))):row.packBase;
   if(packBase===1)throw new Error('اندازه بسته باید بیشتر از یک واحد پایه باشد.');
   await updateRecord(db,'products',row.id,{name:formVal(form,'name'),code:formVal(form,'code'),category:formVal(form,'category'),kind:base,packBase,lowBase,salePrice:asInteger(formVal(form,'salePrice'),'قیمت فروش')});
  }
  else if(kind==='edit-supplier'){
   await updateRecord(db,'suppliers',formVal(form,'id'),{name:formVal(form,'name'),phone:formVal(form,'phone')});
  }
  else if(kind==='edit-customer'){
   await updateRecord(db,'customers',formVal(form,'id'),{name:formVal(form,'name'),phone:formVal(form,'phone'),district:formVal(form,'district'),visitDay:formVal(form,'visitDay'),note:formVal(form,'note')});
  }
  else if(kind==='edit-purchase'){
   await updatePurchase(db,formVal(form,'id'),{supplierId:formVal(form,'supplierId'),unit:formVal(form,'unit'),quantity:formVal(form,'quantity'),unitPrice:formVal(form,'unitPrice'),paymentKind:formVal(form,'paymentKind')});
  }
  else if(kind==='edit-sale'){
   currRows(form);await updateSale(db,formVal(form,'id'),saleRows.map(x=>({...x})));
  }
  else if(kind==='edit-payment'){
   await updatePayment(db,formVal(form,'id'),{amount:formVal(form,'amount'),method:formVal(form,'method'),note:formVal(form,'note')});
  }
  else if(kind==='export'){
   const backup=await encryptBackup(data,formVal(form,'password'));downloadBackup(backup);notify('فایل پشتیبان برای ذخیره ارائه شد. ذخیره واقعی فایل را در Downloads بررسی کنید.');return;
  }
  else if(kind==='import'){
   importCandidate=null;importWrapper=null;const file=form.querySelector('[name=file]').files?.[0];
   importWrapper=await readBackupFile(file);importCandidate=await decryptBackup(importWrapper,formVal(form,'password'));
   render();notify('فایل بررسی شد و هنوز هیچ اطلاعاتی تغییر نکرده است.');return;
  }
  if(kind.startsWith('edit-')){const wasSale=editor?.type==='sale';editor=null;if(wasSale){saleRows=[{productId:'',unit:'',quantity:'1',unitPrice:''}];saleState={customerId:'',paidAmount:'0',paymentMethod:'cash'};}}
  await refresh();if(kind==='sale'){updateSaleTotal($('#sale-form'));$('#sale-form [name="customerId"]')?.focus();}notify(kind==='visit'?'نتیجه مراجعه ذخیره شد.':kind.startsWith('edit-')?'تغییرات با موفقیت ذخیره شد.':'عملیات با موفقیت ثبت شد.');
 }catch(e){if(kind==='import'){importCandidate=null;importWrapper=null;render();}notify(e.message||'در ثبت اطلاعات خطایی رخ داد.','error');}
 finally{if(submitButton&&submitButton.isConnected)submitButton.disabled=false;}
});

async function init(){try{
 if(!('indexedDB'in window)||!crypto?.subtle)throw new Error('مرورگر از ذخیره‌سازی امن این برنامه پشتیبانی نمی‌کند؛ با Chrome جدید باز کنید.');
 db=await openDb();await refresh();
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('offline cache registration failed',e));
 window.addEventListener('online',()=>{const el=$('#net-status');if(el){el.className='pill ok';el.textContent='● آماده کار آفلاین';}});
 window.addEventListener('offline',()=>{const el=$('#net-status');if(el){el.className='pill offline';el.textContent='● بدون اینترنت';}});
 }catch(e){app.innerHTML=`<div class="loading-screen"><div class="card" style="max-width:450px"><h2>برنامه اجرا نشد</h2><p>${esc(e.message)}</p><div class="small muted">با مرورگر Chrome جدید و از طریق یک نشانی HTTPS یا localhost امتحان کنید.</div></div></div>`;}}
init();
