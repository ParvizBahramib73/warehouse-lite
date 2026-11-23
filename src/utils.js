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
