import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createScenario,MODEL_VERSION,SOURCES} from '../src/model/scenario.mjs';
import {compare,toCSV} from '../src/model/economics.mjs';
const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'evidence','research-v1');
await fs.mkdir(out,{recursive:true});
const base=createScenario();base.common.dispatchPolicy='min-peak';
const definitions=[
 ['control-energy-first','无需量费用，低价优先',s=>s.common.dispatchPolicy='energy-first'],
 ['mixed-no-demand','兼用：最小峰值，不计需量费用',()=>{}],
 ['mixed-demand-40-energy','兼用：需量40，低价优先',s=>{s.common.monthlyDemandRate=40;s.common.dispatchPolicy='energy-first';}],
 ['mixed-demand-40-peak','兼用：需量40，最小峰值',s=>s.common.monthlyDemandRate=40],
 ['standby-half-c','纯备电：0.5C',s=>{s.common.targetDeliveryKWh=0;s.common.operatingDays=0;}],
 ['standby-four-c','纯备电：4C假设',s=>{s.common.targetDeliveryKWh=0;s.common.operatingDays=0;s.batteries.forEach(b=>b.dischargeC=4);}],
 ['tight-window','1小时充电窗口反例',s=>s.common.chargeUntilHour=1],
 ['lfp-cycle-6000','单方解释：LFP6000次假设',s=>{s.interpretation='sodium-only';s.batteries[1].cycleLife=6000;}],
 ['lfp-cycle-3000','单方解释：LFP3000次假设',s=>{s.interpretation='sodium-only';s.batteries[1].cycleLife=3000;}],
 ['sodium-premium-20','钠电初始电池费用贵20%假设',s=>s.batteries[0].pricePerKWh=840],
 ['cold-difference','Na0.9、LFP0.7低温系数假设',s=>s.batteries[1].coldCapacityFactor=0.7],
];
const cases=[], rows=[];
for(const [id,label,mutate] of definitions){
 const scenario=structuredClone(base);mutate(scenario);scenario.title=label;
 const result=compare(scenario);const record={id,label,classification:'conditional-simulation',scenario,result};cases.push(record);
 await fs.writeFile(path.join(out,id+'.json'),JSON.stringify(record,null,2));
 for(const r of result.systems)rows.push({case:id,label,technology:r.name,feasible:r.feasible,nominalKWh:r.day.nominalKWh,energySizingKWh:r.day.energySizingKWh,powerSizingKWh:r.day.powerSizingKWh,deliveredAC:r.day.deliveredAC,gridPeakKw:r.day.gridPeakKw,annualTestCycles:r.annualTestCycles,cycleYears:r.cycleYears,replacementInterval:r.replacementInterval,replacementBinding:r.replacementBinding,batteryReplacementTimes:r.events.filter(e=>e.type==='battery').map(e=>e.timeYears).join('|'),initialPV:r.breakdown.initial,energyPV:r.breakdown.energy,demandPV:r.breakdown.demand,maintenancePV:r.breakdown.maintenance,replacementsPV:r.breakdown.replacements,terminalPV:r.breakdown.terminal,tcoPV:r.tcoPV,npv:r.npv,lcos:r.lcos,annualCostPerReservedKw:r.annualCostPerReservedKw,requiredAnnualUnmodelledBenefit:r.requiredAnnualUnmodelledBenefit,demandRateBreakEven:r.demandRateBreakEven,sodiumInitialPriceBoundary:result.boundary.value});
}
const demandSweep=[];
for(const policy of ['energy-first','min-peak'])for(let rate=0;rate<=60;rate+=5){const s=structuredClone(base);s.common.dispatchPolicy=policy;s.common.monthlyDemandRate=rate;const r=compare(s).systems[0];demandSweep.push({policy,monthlyDemandRate:rate,npv:r.npv,gridPeakKw:r.day.gridPeakKw,tcoPV:r.tcoPV});}
const standbySweep=[];
for(const backupMinutes of [5,15,30,60])for(const dischargeC of [.25,.5,1,2,4]){const s=structuredClone(base);Object.assign(s.common,{targetDeliveryKWh:0,operatingDays:0,backupMinutes});s.batteries.forEach(b=>b.dischargeC=dischargeC);const r=compare(s).systems[0];standbySweep.push({backupMinutes,dischargeC,nominalKWh:r.day.nominalKWh,sizingConstraint:r.day.sizingConstraint,annualCostPerReservedKw:r.annualCostPerReservedKw});}
const cycleSweep=[];
for(const cycleLife of [1500,3000,6000,10000,15000]){const s=structuredClone(base);s.interpretation='sodium-only';s.batteries[1].cycleLife=cycleLife;const r=compare(s);cycleSweep.push({lfpCycleLife:cycleLife,annualTestCycles:r.systems[1].annualTestCycles,lfpCycleYears:r.systems[1].cycleYears,lfpReplacementYears:r.systems[1].replacementInterval,binding:r.systems[1].replacementBinding,sodiumInitialPriceBoundary:r.boundary.value,costDifference:r.difference});}
const boundarySweep=[];
for(const naCold of [.7,.8,.9,1])for(const lfpCold of [.7,.8,.9,1]){const s=structuredClone(base);s.batteries[0].coldCapacityFactor=naCold;s.batteries[1].coldCapacityFactor=lfpCold;const r=compare(s);boundarySweep.push({naCold,lfpCold,priceBoundary:r.boundary.value,nominalNa:r.systems[0].day.nominalKWh,nominalLfp:r.systems[1].day.nominalKWh});}
const axes={naPrice:[560,700,840,1050],naRTE:[.85,.9,.95],naCold:[.7,.8,.9,1],naCalendar:[10,15,20],lfpCold:[.8,.9,1]};
const robustness=[];
for(const naPrice of axes.naPrice)for(const naRTE of axes.naRTE)for(const naCold of axes.naCold)for(const naCalendar of axes.naCalendar)for(const lfpCold of axes.lfpCold){
 const s=structuredClone(base);s.common.monthlyDemandRate=40;Object.assign(s.batteries[0],{pricePerKWh:naPrice,roundTripEfficiency:naRTE,coldCapacityFactor:naCold,calendarLifeYears:naCalendar});s.batteries[1].coldCapacityFactor=lfpCold;const r=compare(s);robustness.push({naPrice,naRTE,naCold,naCalendar,lfpCold,comparable:r.comparable,difference:r.difference,naNPV:r.systems[0].npv,priceBoundary:r.boundary.value,boundaryStatus:r.boundary.status});
}
for(const [file,data] of [['case-summary.csv',rows],['demand-sweep.csv',demandSweep],['standby-sweep.csv',standbySweep],['cycle-sweep.csv',cycleSweep],['cold-boundary-sweep.csv',boundarySweep],['robustness-grid.csv',robustness]])await fs.writeFile(path.join(out,file),toCSV(data,Object.keys(data[0])));
const find=id=>cases.find(c=>c.id===id);
assert.ok(Math.abs(find('mixed-no-demand').result.difference)<1e-6);
assert.ok(find('mixed-no-demand').result.systems[0].npv>0);
assert.ok(find('mixed-demand-40-peak').result.systems[0].npv<0);
assert.equal(find('tight-window').result.comparable,false);
assert.equal(find('standby-four-c').result.systems[0].lcos,null);
assert.equal(find('lfp-cycle-6000').result.systems[1].replacementInterval,15);
const summary={modelVersion:MODEL_VERSION,researchDate:'2026-10-14',dataStatus:'synthetic-not-field-measured',scenarioCount:cases.length,robustnessGridCount:robustness.length,axes,robustness:{comparable:robustness.filter(r=>r.comparable).length,minDifference:Math.min(...robustness.map(r=>r.difference)),maxDifference:Math.max(...robustness.map(r=>r.difference)),minNaNPV:Math.min(...robustness.map(r=>r.naNPV)),maxNaNPV:Math.max(...robustness.map(r=>r.naNPV)),minBoundary:Math.min(...robustness.filter(r=>r.priceBoundary!=null).map(r=>r.priceBoundary)),maxBoundary:Math.max(...robustness.filter(r=>r.priceBoundary!=null).map(r=>r.priceBoundary)),interpretation:'这些网格点不是抽样分布，不输出占优概率或获奖概率。'},baseScenario:base,cases:rows,demandSweep,standbySweep,cycleSweep,boundarySweep,sources:SOURCES};
await fs.writeFile(path.join(out,'research-results.json'),JSON.stringify(summary,null,2));
await fs.writeFile(path.join(out,'simulation-assertions.json'),JSON.stringify({passed:6,modelVersion:MODEL_VERSION,classification:'software-consistency-not-real-world-validation'},null,2));
console.log(JSON.stringify({modelVersion:MODEL_VERSION,caseCount:cases.length,gridCount:robustness.length,highlights:rows.filter(r=>r.technology==='钠电').map(({case:id,nominalKWh,npv,gridPeakKw,annualCostPerReservedKw,demandRateBreakEven,requiredAnnualUnmodelledBenefit,sodiumInitialPriceBoundary})=>({id,nominalKWh,npv,gridPeakKw,annualCostPerReservedKw,demandRateBreakEven,requiredAnnualUnmodelledBenefit,sodiumInitialPriceBoundary})),robustness:summary.robustness},null,2));
