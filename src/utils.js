export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dateFa(iso){try{return new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(iso));}catch{return '—';}}
export function dayFa(iso){return new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Tehran'}).format(new Date(iso));}
export function todayTehran(iso){return new Date(iso).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'});}
export const moneyInput=x=>new Intl.NumberFormat('fa-IR').format(x||0);


/** Build safe select options and preserve the currently selected record after rerender. */
export function optionMarkup(items,key,label,placeholder='انتخاب کنید',selected='') {
  const selectedValue=String(selected ?? '');
  return `<option value="">${esc(placeholder)}</option>${items.map(item=>{
    const value=String(item[key] ?? '');
    const isSelected=value===selectedValue ? 'selected' : '';
    return `<option value="${esc(value)}" ${isSelected}>${esc(item[label])}</option>`;
  }).join('')}`;
}

const faDigits='۰۱۲۳۴۵۶۷۸۹';
export function formatGroupedInteger(value){
 const digits=String(value??'')
  .replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
  .replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
  .replace(/[٬,\s]/g,'')
  .replace(/[^0-9]/g,'');
 if(!digits)return '';
 return digits.replace(/\B(?=(\d{3})+(?!\d))/g,'٬').replace(/\d/g,d=>faDigits[Number(d)]);
}
export function formatMoneyField(input){
 if(!input)return;
 const before=String(input.value??'');
 const caret=typeof input.selectionStart==='number'?input.selectionStart:before.length;
 const prefixDigits=(before.slice(0,caret).match(/[0-9۰-۹٠-٩]/g)||[]).length;
 const formatted=formatGroupedInteger(before);
 if(before===formatted)return;
 input.value=formatted;
 if(typeof input.setSelectionRange==='function'){
  let position=0,seen=0;
  while(position<formatted.length&&seen<prefixDigits){
   if(/[0-9۰-۹٠-٩]/.test(formatted[position]))seen++;
   position++;
  }
  input.setSelectionRange(position,position);
 }
}
