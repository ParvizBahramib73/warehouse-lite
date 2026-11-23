export const VISIT_OUTCOMES={
 planned:'در برنامه؛ هنوز مراجعه نشده',
 purchased:'خرید خوب / کامل انجام شد',
 small_purchase:'خرید کم / جزئی انجام شد',
 no_purchase:'مراجعه شد؛ خرید نکرد',
 unavailable:'مشتری در دسترس نبود',
 follow_up:'نیازمند پیگیری مجدد',
 rescheduled:'مراجعه به روز دیگری موکول شد',
 not_needed:'فعلاً نیاز به خرید نداشت',
 declined:'فعلاً تمایلی به خرید نداشت',
 other:'سایر وضعیت‌ها',
 cancelled:'از برنامه این روز حذف شد'
};
export const FOLLOW_UP_OUTCOMES=['follow_up','rescheduled'];
export const VISITED_OUTCOMES=Object.keys(VISIT_OUTCOMES).filter(value=>!['planned','cancelled'].includes(value));
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
 for(const visit of dueFollowups){
  const previous=dueByCustomer.get(visit.customerId);
  if(!previous||String(visit.createdAt||'')>String(previous.createdAt||''))dueByCustomer.set(visit.customerId,visit);
 }
 const customersById=new Map(customers.map(customer=>[customer.id,customer]));
 const ids=new Set([...scheduled.map(customer=>customer.id),...sameDay.map(visit=>visit.customerId),...dueFollowups.map(visit=>visit.customerId)]);
 const rows=[];
 for(const id of ids){
  const customer=customersById.get(id);
  if(!customer||customer.active===false)continue;
  const visit=byCustomer.get(id)||null;
  if(visit?.outcome==='cancelled')continue;
  const followUp=dueByCustomer.get(id)||null;
  rows.push({
   ...customer,
   visit,
   outcome:visit?.outcome||'planned',
   note:visit?.note||'',
   routeName:visit?.routeName||followUp?.routeName||customer.district||'مسیر روزانه',
   routeOrder:visit?.routeOrder??followUp?.routeOrder??null,
   visitedAt:visit?.visitedAt||null,
   nextFollowUpDate:visit?.nextFollowUpDate||'',
   isFollowUp:Boolean(followUp),
   followUpNote:followUp?.note||''
  });
 }
 return rows.sort((a,b)=>
  String(a.routeName||'').localeCompare(String(b.routeName||''),'fa')||
  (a.routeOrder??0)-(b.routeOrder??0)||
  (a.district||'بدون محله').localeCompare(b.district||'بدون محله','fa')||
  a.name.localeCompare(b.name,'fa')
 );
}
export function groupRoutePlan(rows=[]){
 const groups=new Map();
 for(const row of rows){
  const routeName=String(row.routeName||row.district||'مسیر روزانه').trim()||'مسیر روزانه';
  if(!groups.has(routeName))groups.set(routeName,[]);
  groups.get(routeName).push(row);
 }
 return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'fa')).map(([routeName,customers])=>({routeName,customers}));
}
export function summarizeRoute(rows=[]){
 const summary={total:rows.length,planned:0,purchased:0,small_purchase:0,no_purchase:0,unavailable:0,follow_up:0,rescheduled:0,not_needed:0,declined:0,other:0,visited:0,needsFollowUp:0};
 for(const row of rows){
  const outcome=VISIT_OUTCOMES[row.outcome]?row.outcome:'planned';
  summary[outcome]=(summary[outcome]||0)+1;
  if(VISITED_OUTCOMES.includes(outcome))summary.visited++;
  if(FOLLOW_UP_OUTCOMES.includes(outcome)||row.isFollowUp)summary.needsFollowUp++;
 }
 return summary;
}
