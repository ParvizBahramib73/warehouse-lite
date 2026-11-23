import {estimateLegacyLineCost} from './costing.js';
export function tehranDateKey(value){
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=type=>parts.find(part=>part.type===type)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
function lineCost(line,purchases,sale){
 if(line.costBasis==='weighted-average'&&Number.isSafeInteger(line.costAmount)&&line.costAmount>=0)return {amount:line.costAmount,source:'snapshot'};
 if(line.costBasis==='missing')return null;
 const estimated=estimateLegacyLineCost(line,purchases,sale.createdAt);
 return estimated===null?null:{amount:estimated,source:'historical-estimate'};
}
export function buildProfitReport(sales=[],purchases=[],from='',to=''){
 const rows=sales.filter(sale=>{
  if(sale.status==='void')return false;
  const date=tehranDateKey(sale.createdAt);
  return date&&(!from||date>=from)&&(!to||date<=to);
 }).map(sale=>{
  const details=(sale.lines||[]).map(line=>lineCost(line,purchases,sale));
  const complete=details.length>0&&details.every(Boolean);
  const cost=complete?details.reduce((sum,item)=>sum+item.amount,0):null;
  const grossProfit=complete?sale.total-cost:null;
  const source=complete?(details.some(item=>item.source==='historical-estimate')?'historical-estimate':'snapshot'):'missing';
  return {id:sale.id,invoiceNo:sale.invoiceNo,customerName:sale.customerName,createdAt:sale.createdAt,revenue:sale.total,cost,grossProfit,marginPercent:complete&&sale.total>0?(grossProfit/sale.total)*100:null,costComplete:complete,costSource:source,lineCount:(sale.lines||[]).length};
 }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const covered=rows.filter(row=>row.costComplete);
 const unknown=rows.filter(row=>!row.costComplete);
 const revenue=rows.reduce((sum,row)=>sum+row.revenue,0);
 const coveredRevenue=covered.reduce((sum,row)=>sum+row.revenue,0);
 const costOfGoods=covered.reduce((sum,row)=>sum+row.cost,0);
 const grossProfit=coveredRevenue-costOfGoods;
 return {
  rows,revenue,costOfGoods,grossProfit,coveredRevenue,
  unknownRevenue:unknown.reduce((sum,row)=>sum+row.revenue,0),
  salesCount:rows.length,coveredSales:covered.length,unknownSales:unknown.length,
  snapshotSales:covered.filter(row=>row.costSource==='snapshot').length,
  estimatedSales:covered.filter(row=>row.costSource==='historical-estimate').length,
  marginPercent:coveredRevenue>0?(grossProfit/coveredRevenue)*100:null
 };
}
