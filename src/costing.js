export function weightedPurchaseCost(purchases=[],productId,asOf=new Date().toISOString()){
 const cutoff=Date.parse(asOf);
 let totalCost=0,totalQuantity=0;
 for(const purchase of purchases){
  if(purchase.productId!==productId||purchase.status==='void')continue;
  if(!Number.isSafeInteger(purchase.total)||purchase.total<0||!Number.isSafeInteger(purchase.quantityBase)||purchase.quantityBase<=0)continue;
  const created=Date.parse(purchase.createdAt);
  if(!Number.isFinite(created)||created>cutoff)continue;
  totalCost+=purchase.total;
  totalQuantity+=purchase.quantityBase;
  if(!Number.isSafeInteger(totalCost)||!Number.isSafeInteger(totalQuantity))throw new Error('حجم سوابق خرید برای محاسبه بهای تمام‌شده بیش از حد مجاز است.');
 }
 return totalQuantity>0?{totalCost,totalQuantity}:null;
}
export function snapshotSaleLines(lines=[],purchases=[],asOf=new Date().toISOString()){
 return lines.map(line=>{
  const average=weightedPurchaseCost(purchases,line.productId,asOf);
  if(!average)return {...line,costAmount:null,costBasis:'missing',costSnapshotAt:asOf};
  const numerator=BigInt(average.totalCost)*BigInt(line.quantityBase);
  const divisor=BigInt(average.totalQuantity);
  const costAmount=Number((numerator+divisor/2n)/divisor);
  if(!Number.isSafeInteger(costAmount)||costAmount<0)throw new Error('بهای تمام‌شده این قلم بیش از حد مجاز است.');
  return {...line,costAmount,costBasis:'weighted-average',costSnapshotAt:asOf};
 });
}
export function estimateLegacyLineCost(line,purchases=[],asOf){
 const average=weightedPurchaseCost(purchases,line.productId,asOf);
 if(!average)return null;
 const numerator=BigInt(average.totalCost)*BigInt(line.quantityBase);
 const divisor=BigInt(average.totalQuantity);
 const amount=Number((numerator+divisor/2n)/divisor);
 return Number.isSafeInteger(amount)&&amount>=0?amount:null;
}
