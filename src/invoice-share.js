import {money} from './domain.js';
import {dayFa} from './utils.js';

const unitLabels={piece:'عدد',kg:'کیلوگرم',pack:'بسته'};
export function invoicePaidAmount(sale,payments=[]){
 return payments.filter(p=>p.saleId===sale.id&&p.status!=='void').reduce((sum,p)=>sum+p.amount,0);
}
export function buildInvoiceShareText(sale,payments=[]){
 const paid=invoicePaidAmount(sale,payments);
 const remaining=Math.max(0,sale.total-paid);
 const itemLines=(sale.lines||[]).map((line,index)=>{
  const unit=unitLabels[line.unit]||'عدد';
  return (index+1)+'. '+line.productName+' — '+line.quantity+' '+unit+' × '+money(line.unitPrice)+' = '+money(line.amount);
 }).join('\n');
 return [
  'علی‌فاکتور',
  'پخش مواد اولیه قنادی علی | همدان',
  (sale.status==='void'?'فاکتور باطل‌شده':'فاکتور فروش')+' شماره: '+sale.invoiceNo,
  'تاریخ: '+dayFa(sale.createdAt),
  'مشتری: '+sale.customerName,
  'اقلام فاکتور:',
  itemLines,
  'جمع کل: '+money(sale.total),
  'دریافت ثبت‌شده برای این فاکتور: '+money(paid),
  'مانده این فاکتور: '+money(remaining),
  'با سپاس از خرید شما، علی'
 ].join('\n');
}
function roundedRect(ctx,x,y,w,h,r){
 ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function drawText(ctx,text,x,y,size,color,bold,align,maxWidth){
 ctx.save();ctx.direction=align==='left'?'ltr':'rtl';ctx.textAlign=align||'right';ctx.textBaseline='middle';
 ctx.font=(bold?'700 ':'400 ')+size+'px "Noto Naskh Arabic", Tahoma, Arial, sans-serif';
 ctx.fillStyle=color;if(maxWidth)ctx.fillText(String(text??''),x,y,maxWidth);else ctx.fillText(String(text??''),x,y);ctx.restore();
}
export async function createInvoiceImageFile(sale,payments=[]){
 if(typeof document==='undefined')throw new Error('ساخت تصویر فاکتور در این محیط پشتیبانی نمی‌شود.');
 const lines=Array.isArray(sale.lines)?sale.lines:[];
 const width=1200,pad=58,rowHeight=78,headerHeight=205,customerHeight=100,tableHeader=62;
 const tableTop=pad+headerHeight+28+customerHeight+24;
 const summaryTop=tableTop+tableHeader+(Math.max(lines.length,1)*rowHeight)+30;
 const footerTop=summaryTop+190;
 const height=footerTop+116;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('امکان ساخت تصویر فاکتور وجود ندارد.');
 ctx.fillStyle='#eef4f1';ctx.fillRect(0,0,width,height);
 roundedRect(ctx,pad,pad,width-pad*2,height-pad*2,28);ctx.fillStyle='#ffffff';ctx.fill();
 const gx=ctx.createLinearGradient(pad,pad,width-pad,pad+headerHeight);gx.addColorStop(0,'#173642');gx.addColorStop(.58,'#176b61');gx.addColorStop(1,'#148b72');
 roundedRect(ctx,pad,pad,width-pad*2,headerHeight,25);ctx.fillStyle=gx;ctx.fill();
 drawText(ctx,'علی‌فاکتور',width-pad-38,pad+54,48,'#ffffff',true,'right',560);
 drawText(ctx,'پخش مواد اولیه قنادی علی | همدان',width-pad-38,pad+102,24,'#d8f1e8',false,'right',570);
 drawText(ctx,'فاکتور فروش',width-pad-38,pad+158,28,'#ffffff',true,'right',420);
 drawText(ctx,'شماره فاکتور',pad+38,pad+58,20,'#cce8df',false,'left',260);
 drawText(ctx,sale.invoiceNo,pad+38,pad+96,24,'#ffffff',true,'left',300);
 drawText(ctx,'تاریخ: '+dayFa(sale.createdAt),pad+38,pad+151,20,'#e7f5ef',false,'left',360);
 let y=pad+headerHeight+28;
 roundedRect(ctx,pad+16,y,width-pad*2-32,customerHeight,16);ctx.fillStyle='#f2f8f5';ctx.fill();
 drawText(ctx,'مشتری',width-pad-48,y+34,19,'#607a72',false,'right',300);
 drawText(ctx,sale.customerName,width-pad-48,y+70,27,'#193b37',true,'right',740);
 drawText(ctx,'صادرکننده: علی',pad+44,y+55,20,'#41635a',true,'left',300);
 y=tableTop;
 roundedRect(ctx,pad+16,y,width-pad*2-32,tableHeader,12);ctx.fillStyle='#eaf4ef';ctx.fill();
 const right=width-pad-42;
 drawText(ctx,'شرح کالا',right,y+tableHeader/2,19,'#31564c',true,'right',430);
 drawText(ctx,'مقدار',690,y+tableHeader/2,19,'#31564c',true,'right',150);
 drawText(ctx,'قیمت واحد',440,y+tableHeader/2,19,'#31564c',true,'right',190);
 drawText(ctx,'جمع',pad+44,y+tableHeader/2,19,'#31564c',true,'left',160);
 if(!lines.length)drawText(ctx,'قلمی در فاکتور ثبت نشده است.',right,y+tableHeader+rowHeight/2,20,'#60747c',false,'right',800);
 lines.forEach((line,index)=>{
  const rowY=y+tableHeader+index*rowHeight;
  if(index%2===0){ctx.fillStyle='#fbfdfc';ctx.fillRect(pad+16,rowY,width-pad*2-32,rowHeight);}
  const unit=unitLabels[line.unit]||'عدد';
  drawText(ctx,String(index+1)+'. '+line.productName,right,rowY+rowHeight/2,19,'#243e3a',true,'right',430);
  drawText(ctx,String(line.quantity)+' '+unit,690,rowY+rowHeight/2,18,'#3f5d56',false,'right',170);
  drawText(ctx,money(line.unitPrice),440,rowY+rowHeight/2,17,'#3f5d56',false,'right',210);
  drawText(ctx,money(line.amount),pad+44,rowY+rowHeight/2,18,'#193b37',true,'left',190);
  ctx.strokeStyle='#edf2ef';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad+24,rowY+rowHeight);ctx.lineTo(width-pad-24,rowY+rowHeight);ctx.stroke();
 });
 const paid=invoicePaidAmount(sale,payments),remaining=Math.max(0,sale.total-paid);
 const sy=summaryTop;
 roundedRect(ctx,pad+16,sy,width-pad*2-32,166,16);ctx.fillStyle='#f5faf7';ctx.fill();
 drawText(ctx,'جمع کل فاکتور',width-pad-48,sy+35,21,'#43635a',false,'right',360);
 drawText(ctx,money(sale.total),pad+48,sy+35,22,'#193b37',true,'left',300);
 drawText(ctx,'دریافت ثبت‌شده برای این فاکتور',width-pad-48,sy+82,18,'#607a72',false,'right',510);
 drawText(ctx,money(paid),pad+48,sy+82,19,'#31564c',true,'left',300);
 drawText(ctx,'مانده این فاکتور',width-pad-48,sy+130,20,'#087a62',true,'right',360);
 drawText(ctx,money(remaining),pad+48,sy+130,22,'#087a62',true,'left',300);
 const footer=footerTop;
 drawText(ctx,'با سپاس از خرید شما',width/2,footer+25,23,'#31564c',true,'center',700);
 drawText(ctx,'علی · علی‌فاکتور',width/2,footer+61,22,'#087a62',true,'center',700);
 drawText(ctx,'تهیه‌شده با سامانه انبار من',width/2,footer+94,15,'#81938d',false,'center',700);
 if(sale.status==='void'){
  ctx.save();ctx.globalAlpha=.12;ctx.translate(width/2,height/2);ctx.rotate(-.18);drawText(ctx,'باطل شده',0,0,104,'#b42318',true,'center',900);ctx.restore();
 }
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw new Error('تولید فایل تصویر فاکتور ناموفق بود.');
 const safeName=String(sale.invoiceNo||'invoice').replace(/[^a-zA-Z0-9_-]/g,'-');
 return new File([blob],'ali-factor-'+safeName+'.png',{type:'image/png',lastModified:Date.now()});
}
function downloadFile(file){
 const url=URL.createObjectURL(file),link=document.createElement('a');
 link.href=url;link.download=file.name;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function shareInvoiceFile(sale,payments=[]){
 const file=await createInvoiceImageFile(sale,payments);
 const text=buildInvoiceShareText(sale,payments);
 let canShareFile=false;
 try{canShareFile=typeof navigator!=='undefined'&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});}catch{}
 if(canShareFile){
  await navigator.share({files:[file],title:'علی‌فاکتور '+sale.invoiceNo,text});
  return 'shared';
 }
 downloadFile(file);
 if(typeof navigator!=='undefined'&&typeof navigator.share==='function'){
  try{await navigator.share({title:'علی‌فاکتور '+sale.invoiceNo,text});return 'downloaded-and-text-shared';}
  catch(error){if(error?.name==='AbortError')return 'downloaded';throw error;}
 }
 if(typeof navigator!=='undefined'&&navigator.clipboard?.writeText){
  try{await navigator.clipboard.writeText(text);return 'downloaded-and-copied';}catch{}
 }
 return 'downloaded';
}
