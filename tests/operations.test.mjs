import test from 'node:test';
import assert from 'node:assert/strict';
import {weightedPurchaseCost,snapshotSaleLines,estimateLegacyLineCost} from '../src/costing.js';
import {buildProfitReport} from '../src/profit-report.js';
import {buildRoutePlan,groupRoutePlan,weekdayForDate,summarizeRoute,VISIT_OUTCOMES} from '../src/route-planning.js';

const purchases=[
 {id:'p1',productId:'oil',createdAt:'2026-11-01T10:00:00.000Z',quantityBase:10,total:1000,status:'active'},
 {id:'p2',productId:'oil',createdAt:'2026-11-05T10:00:00.000Z',quantityBase:10,total:3000,status:'active'},
 {id:'p3',productId:'oil',createdAt:'2026-11-06T10:00:00.000Z',quantityBase:100,total:100,status:'void'},
 {id:'p4',productId:'oil',createdAt:'2026-11-20T10:00:00.000Z',quantityBase:10,total:9000,status:'active'}
];

test('weighted purchase cost ignores void and future purchases',()=>{
 const result=weightedPurchaseCost(purchases,'oil','2026-11-10T10:00:00.000Z');
 assert.deepEqual(result,{totalCost:4000,totalQuantity:20});
});

test('new sale lines store weighted-average cost snapshots at sale time',()=>{
 const lines=snapshotSaleLines([{productId:'oil',quantityBase:5,amount:2000}],purchases,'2026-11-10T10:00:00.000Z');
 assert.equal(lines[0].costAmount,1000);
 assert.equal(lines[0].costBasis,'weighted-average');
 assert.equal(lines[0].costSnapshotAt,'2026-11-10T10:00:00.000Z');
 const missing=snapshotSaleLines([{productId:'unknown',quantityBase:2,amount:300}],purchases,'2026-11-10T10:00:00.000Z');
 assert.equal(missing[0].costAmount,null);
 assert.equal(missing[0].costBasis,'missing');
});

test('legacy invoice cost can be reconstructed as an explicitly estimated value',()=>{
 assert.equal(estimateLegacyLineCost({productId:'oil',quantityBase:5},purchases,'2026-11-10T10:00:00.000Z'),1000);
 assert.equal(estimateLegacyLineCost({productId:'unknown',quantityBase:2},purchases,'2026-11-10T10:00:00.000Z'),null);
});

test('profit report excludes void invoices and separates missing cost from covered gross profit',()=>{
 const sales=[
  {id:'s1',createdAt:'2026-11-10T10:00:00.000Z',invoiceNo:'INV-1',customerName:'بهار',total:3000,status:'active',lines:[{productId:'oil',quantityBase:5,amount:3000,costAmount:1000,costBasis:'weighted-average'}]},
  {id:'s2',createdAt:'2026-11-11T10:00:00.000Z',invoiceNo:'INV-2',customerName:'گل',total:2500,status:'active',lines:[{productId:'oil',quantityBase:5,amount:2500}]},
  {id:'s3',createdAt:'2026-11-12T10:00:00.000Z',invoiceNo:'INV-3',customerName:'نامشخص',total:500,status:'active',lines:[{productId:'unknown',quantityBase:1,amount:500,costBasis:'missing',costAmount:null}]},
  {id:'s4',createdAt:'2026-11-13T10:00:00.000Z',invoiceNo:'INV-4',customerName:'باطل',total:999,status:'void',lines:[{productId:'oil',quantityBase:1,amount:999,costAmount:100,costBasis:'weighted-average'}]}
 ];
 const report=buildProfitReport(sales,purchases,'2026-11-01','2026-11-30');
 assert.equal(report.salesCount,3);
 assert.equal(report.revenue,6000);
 assert.equal(report.coveredSales,2);
 assert.equal(report.costOfGoods,2000);
 assert.equal(report.grossProfit,3500);
 assert.equal(report.unknownSales,1);
 assert.equal(report.unknownRevenue,500);
 assert.equal(report.snapshotSales,1);
 assert.equal(report.estimatedSales,1);
});

test('route planner groups scheduled customers by Persian weekday and includes due follow-ups',()=>{
 assert.equal(weekdayForDate('2026-11-23'),'دوشنبه');
 const customers=[
  {id:'c1',name:'قنادی بهار',district:'مهدیه',visitDay:'دوشنبه',active:true},
  {id:'c2',name:'قنادی گل',district:'بوعلی',visitDay:'',active:true},
  {id:'c3',name:'غیرفعال',district:'مهدیه',visitDay:'دوشنبه',active:false}
 ];
 const visits=[
  {id:'v1',customerId:'c2',plannedDate:'2026-11-20',outcome:'follow_up',nextFollowUpDate:'2026-11-23',note:'تماس مجدد'}
 ];
 const rows=buildRoutePlan(customers,visits,'2026-11-23');
 assert.deepEqual(rows.map(x=>x.id),['c2','c1']);
 assert.equal(rows.find(x=>x.id==='c2').isFollowUp,true);
 assert.equal(rows.find(x=>x.id==='c1').outcome,'planned');
 const groups=groupRoutePlan(rows);
 assert.deepEqual(groups.map(x=>x.district),['بوعلی','مهدیه']);
});

test('daily route includes manually added customers, groups named routes and counts partial purchases',()=>{
 const customers=[
  {id:'c1',name:'قنادی بهار',district:'مهدیه',visitDay:'دوشنبه',active:true},
  {id:'c2',name:'قنادی گل',district:'بوعلی',visitDay:'شنبه',active:true},
  {id:'c3',name:'قنادی لغو',district:'مهدیه',visitDay:'دوشنبه',active:true}
 ];
 const visits=[
  {id:'v1',customerId:'c1',plannedDate:'2026-11-23',outcome:'small_purchase',routeName:'مسیر کبودرآهنگ',routeOrder:1,visitedAt:'2026-11-23T08:00:00.000Z',note:'نیم کارتن روغن'},
  {id:'v2',customerId:'c2',plannedDate:'2026-11-23',outcome:'rescheduled',routeName:'مسیر کبودرآهنگ',routeOrder:2,nextFollowUpDate:'2026-11-25',note:'فردا تماس بگیر'},
  {id:'v3',customerId:'c3',plannedDate:'2026-11-23',outcome:'cancelled',routeName:'مهدیه',routeOrder:3}
 ];
 const rows=buildRoutePlan(customers,visits,'2026-11-23');
 assert.deepEqual(rows.map(row=>row.id),['c1','c2']);
 assert.equal(rows[0].outcome,'small_purchase');
 assert.equal(rows[0].routeName,'مسیر کبودرآهنگ');
 assert.equal(rows[1].outcome,'rescheduled');
 assert.equal(rows[1].nextFollowUpDate,'2026-11-25');
 assert.deepEqual(groupRoutePlan(rows).map(group=>group.routeName),['مسیر کبودرآهنگ']);
 const summary=summarizeRoute(rows);
 assert.equal(summary.total,2);
 assert.equal(summary.visited,2);
 assert.equal(summary.small_purchase,1);
 assert.equal(summary.needsFollowUp,1);
 assert.equal(summary.planned,0);
});

test('visit outcome catalog includes complete, partial, no-sale, unavailable and custom results',()=>{
 for(const key of ['purchased','small_purchase','no_purchase','unavailable','follow_up','rescheduled','not_needed','declined','other'])assert.ok(VISIT_OUTCOMES[key],key);
});

test('cancelled route stop does not reappear from its recurring weekday schedule',()=>{
 const customers=[{id:'c1',name:'قنادی بهار',district:'مهدیه',visitDay:'دوشنبه',active:true}];
 const visits=[{id:'v1',customerId:'c1',plannedDate:'2026-11-23',outcome:'cancelled'}];
 assert.deepEqual(buildRoutePlan(customers,visits,'2026-11-23'),[]);
});
