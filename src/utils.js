export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function dateFa(iso){try{return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Tehran'}).format(new Date(iso));}catch{return '—';}}
export function dayFa(iso){return new Intl.DateTimeFormat('fa-IR',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Tehran'}).format(new Date(iso));}
export function todayTehran(iso){return new Date(iso).toLocaleDateString('en-CA',{timeZone:'Asia/Tehran'});}
export const moneyInput=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(x||0);
