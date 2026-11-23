export const VISIT_OUTCOMES={
 planned:'در انتظار مراجعه',
 purchased:'خرید انجام شد',
 no_purchase:'مراجعه شد؛ خرید نکرد',
 unavailable:'مشتری در دسترس نبود',
 follow_up:'نیازمند پیگیری مجدد'
};
const WEEKDAYS=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه','شنبه'];
export function weekdayForDate(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return '';
 const [year,month,day]=date.split('-').map(Number);
 const value=new Date(Date.UTC(year,month-1,day));
 if(value.getUTCFullYear()!==year||value.getUTCMonth()!==month-1||value.getUTCDate()!==day)return '';
 return WEEKDAYS[value.getUTCDay()];
}
export function buildRoutePlan(customers=[],visits=[],date=''){
 const day=weekdayForDate(date);
 if(!day)return [];
 const scheduled=customers.filter(customer=>customer.active!==false&&customer.visitDay===day);
 const sameDay=visits.filter(visit=>visit.plannedDate===date);
 const dueFollowups=visits.filter(visit=>visit.nextFollowUpDate===date&&visit.plannedDate!==date);
 const byCustomer=new Map();
 for(const visit of sameDay)byCustomer.set(visit.customerId,visit);
 const dueByCustomer=new Map();
 for(const visit of dueFollowups)if(!dueByCustomer.has(visit.customerId))dueByCustomer.set(visit.customerId,visit);
 const customersById=new Map(customers.map(customer=>[customer.id,customer]));
 const ids=new Set([...scheduled.map(customer=>customer.id),...sameDay.map(visit=>visit.customerId),...dueFollowups.map(visit=>visit.customerId)]);
 const rows=[];
 for(const id of ids){
  const customer=customersById.get(id);
  if(!customer||customer.active===false)continue;
  const visit=byCustomer.get(id)||null;
  const followUp=dueByCustomer.get(id)||null;
  rows.push({
   ...customer,
   visit,
   outcome:visit?.outcome||'planned',
   note:visit?.note||'',
   nextFollowUpDate:visit?.nextFollowUpDate||'',
   isFollowUp:!visit&&Boolean(followUp),
   followUpNote:followUp?.note||''
  });
 }
 return rows.sort((a,b)=>(a.district||'بدون محله').localeCompare(b.district||'بدون محله','fa')||a.name.localeCompare(b.name,'fa'));
}
export function groupRoutePlan(rows=[]){
 const groups=new Map();
 for(const row of rows){
  const district=String(row.district||'بدون محله').trim()||'بدون محله';
  if(!groups.has(district))groups.set(district,[]);
  groups.get(district).push(row);
 }
 return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'fa')).map(([district,customers])=>({district,customers}));
}
