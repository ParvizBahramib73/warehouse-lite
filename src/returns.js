import {asPositiveInteger,parseBaseQuantity} from './domain.js';

// A return is a separate immutable credit note. The original invoice remains intact.
// Quantity and credit limits are tied to original invoice lines and sold purchase lots.
const proportional = (total,whole,part,alreadyQuantity,alreadyAmount) => {
  if(part+alreadyQuantity===whole)return total-alreadyAmount;
  return Math.min(total-alreadyAmount, Math.round(total*part/whole));
};
export function buildReturnPlan(sale,priorReturns,products,requests,{restock,reason}={}){
  if(!sale||!Array.isArray(sale.lines)||!Array.isArray(sale.allocations))throw new Error('فاکتور مرجع معتبر نیست.');
  if(typeof restock!=='boolean')throw new Error('وضعیت بازگشت به انبار را مشخص کنید.');
  if(!Array.isArray(requests)||!requests.length)throw new Error('حداقل یک قلم مرجوعی وارد کنید.');
  if(requests.length>sale.lines.length)throw new Error('اقلام مرجوعی تکراری یا نامعتبرند.');
  const normalizedReason=String(reason||'').trim();
  if(!normalizedReason||normalizedReason.length>250)throw new Error('دلیل مرجوعی را بنویسید (حداکثر ۲۵۰ حرف).');
  const productMap=new Map(products.map(p=>[p.id,p])),prior=priorReturns.filter(r=>r.saleId===sale.id);
  const seen=new Set(),lines=[],byProduct=new Map();
  let total=0,replacementCostReversed=0;
  for(const request of requests){
    const idx=Number(request.lineIndex);
    if(!Number.isSafeInteger(idx)||idx<0||idx>=sale.lines.length||seen.has(idx))throw new Error('قلم فاکتور نامعتبر یا تکراری است.');
    seen.add(idx);const line=sale.lines[idx],p=productMap.get(line.productId);
    if(!p)throw new Error('محصول این فاکتور پیدا نشد.');
    const qty=parseBaseQuantity(p,line.unit,String(request.quantity));
    const old=prior.flatMap(r=>r.lines).filter(l=>l.lineIndex===idx);
    const oldQty=old.reduce((s,l)=>s+l.quantityBase,0);
    const oldCredit=old.reduce((s,l)=>s+l.creditAmount,0);
    const oldReplacement=old.reduce((s,l)=>s+l.replacementCostAttributed,0);
    if(qty.base>line.quantityBase-oldQty)throw new Error(`مقدار مرجوعی «${line.productName}» بیشتر از فروش باقی‌مانده است.`);
    const creditAmount=proportional(line.amount,line.quantityBase,qty.base,oldQty,oldCredit);
    const replacementCostAttributed=proportional(line.replacementCost,line.quantityBase,qty.base,oldQty,oldReplacement);
    const result={lineIndex:idx,productId:line.productId,productName:line.productName,unit:line.unit,quantity:String(request.quantity),quantityBase:qty.base,creditAmount,replacementCostAttributed};
    lines.push(result);total+=creditAmount;
    if(restock)replacementCostReversed+=replacementCostAttributed;
    byProduct.set(line.productId,(byProduct.get(line.productId)||0)+qty.base);
  }
  if(!Number.isSafeInteger(total)||!Number.isSafeInteger(replacementCostReversed))throw new Error('مبلغ مرجوعی بیش از حد بزرگ است.');
  const allocations=[];let acquisitionCostReversed=0;
  for(const [productId,amount] of byProduct){
    let needed=amount;
    for(const oldAllocation of sale.allocations.filter(x=>x.productId===productId)){
      if(!needed)break;
      const priorAlloc=prior.flatMap(r=>r.allocations).filter(a=>a.purchaseId===oldAllocation.purchaseId);
      const used=priorAlloc.reduce((s,a)=>s+a.quantityBase,0);
      const oldAttributed=priorAlloc.reduce((s,a)=>s+a.acquisitionCostAttributed,0);
      const remaining=oldAllocation.quantityBase-used;
      if(remaining<0)throw new Error('سوابق مرجوعی این دوره ناسازگار است.');
      const take=Math.min(remaining,needed);if(!take)continue;
      const attributed=proportional(oldAllocation.acquisitionCost,oldAllocation.quantityBase,take,used,oldAttributed);
      allocations.push({purchaseId:oldAllocation.purchaseId,productId,quantityBase:take,acquisitionCostAttributed:attributed});
      if(restock)acquisitionCostReversed+=attributed;
      needed-=take;
    }
    if(needed)throw new Error('مقدار مرجوعی با دوره‌های خرید تخصیص‌یافته مطابقت ندارد.');
  }
  return {lines,allocations,total,restock,reason:normalizedReason,replacementCostReversed,acquisitionCostReversed};
}
export const creditedForSale=(saleId,returns=[])=>returns.filter(r=>r.saleId===saleId).reduce((sum,r)=>sum+r.total,0);
export const returnProfitDelta=(r,type='replacement')=>r.total-(type==='replacement'?r.replacementCostReversed:r.acquisitionCostReversed);
