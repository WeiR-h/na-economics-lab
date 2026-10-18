import {MODEL_VERSION,parameterRegister} from './scenario.mjs';
const EPS = 1e-8;
const total = values => values.reduce((sum,value)=>sum+value,0);
const discount = (amount,time,rate)=>amount/(1+rate)**time;

export function validateScenario(s) {
 const errors=[];
 const check=(value,min,max,name,integer=false)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value))) errors.push(`${name}需要是${min}—${max}之间的${integer?'整数':'数值'}`);};
 if(!s||s.schemaVersion!==1) return ['场景版本需要为1'];
 if(typeof s.title!=='string'||s.title.length<1||s.title.length>100) errors.push('场景名称需要是1—100字的文本');
 if(!['common','sodium-only'].includes(s.interpretation)) errors.push('题设解释需要是common或sodium-only');
 const c=s.common;
 if(!c||!Array.isArray(s.batteries)||s.batteries.length!==2) return [...errors,'需要共同参数与两类电池参数'];
 if(s.batteries.some(b=>!b||typeof b!=='object')) return [...errors,'电池参数需要是对象'];
 if(c.monthlyDemandRate!=null)check(c.monthlyDemandRate,0,10000,'monthlyDemandRate');
 if(c.dispatchPolicy!=null&&!['energy-first','min-peak'].includes(c.dispatchPolicy))errors.push('调度策略需要是energy-first或min-peak');
 for(const [key,min,max,int] of [['ratedPowerKw',1,1000000],['targetDeliveryKWh',0,10000000],['backupMinutes',0,1440],['projectYears',1,40,true],['discountRate',0,0.3],['operatingDays',0,365,true],['designTemperatureC',-30,-30],['depthOfDischarge',0.01,1],['endOfLifeFraction',0.1,1],['lifeTestDoD',0.01,1],['chargeUntilHour',1,23,true],['gridImportLimitKw',0,10000000],['pcsPricePerKw',0,100000],['pcsLifeYears',0.5,100],['otherInitialCost',0,100000000],['replacementFixedCost',0,100000000],['decommissionCost',0,100000000],['residualValue',0,100000000]]) check(c[key],min,max,key,int);
 if(s.batteries[0]?.id!=='sodium'||s.batteries[1]?.id!=='lfp') errors.push('电池顺序需要是sodium与lfp');
 if(s.batteries.some(b=>typeof b.name!=='string'||b.name.length>40)) errors.push('电池名称需要是文本');
 if(!['synthetic','user-input'].includes(s.profile?.kind)||typeof s.profile?.description!=='string') errors.push('逐时数据类型与说明不正确');
 for(const b of s.batteries) for(const [key,min,max] of [['pricePerKWh',0,100000],['replacementPricePerKWh',0,100000],['roundTripEfficiency',0.01,1],['calendarLifeYears',0.5,100],['cycleLife',1,1000000],['coldCapacityFactor',0.01,1],['dischargeC',0.01,20],['chargeC',0.01,20],['annualOM',0,10000000],['auxKWhPerDay',0,1000000]]) check(b[key],min,max,`${b.name||b.id}.${key}`);
 if(!Array.isArray(s.profile?.hours)||s.profile.hours.length!==24) errors.push('需要0—23点共24行的电价与负载');
 else for(let i=0;i<24;i++){const h=s.profile.hours[i];if(h?.hour!==i) errors.push(`第${i}行小时不正确`);check(h?.price,0,100,'电价');check(h?.loadKw,0,10000000,'负载');}
 return errors;
}

export function dispatchDay(s,battery) {
 const c=s.common, b=battery, eta=Math.sqrt(b.roundTripEfficiency);
 const reserveAC=c.ratedPowerKw*c.backupMinutes/60;
 const requested=c.operatingDays>0?c.targetDeliveryKWh:0;
 // Size for identical AC service at end of life; no invented low-temperature benefit.
 const energySizingKWh=(c.targetDeliveryKWh+reserveAC)/(c.depthOfDischarge*c.endOfLifeFraction*b.coldCapacityFactor*eta);
 const powerSizingKWh=c.ratedPowerKw/(b.dischargeC*c.endOfLifeFraction*b.coldCapacityFactor*eta);
 const nominalKWh=Math.max(energySizingKWh,powerSizingKWh);
 const availableDC=nominalKWh*c.endOfLifeFraction*b.coldCapacityFactor;
 const reserveDC=reserveAC/eta;
 const dispatchCapacityAC=Math.max(0,(availableDC*c.depthOfDischarge-reserveDC)*eta);
 const auxHour=b.auxKWhPerDay/24;
 const maxDischargeKw=Math.min(c.ratedPowerKw,availableDC*b.dischargeC*eta);
 const maxChargeKw=Math.min(c.ratedPowerKw,availableDC*b.chargeC/eta);
 const chargeSlots=s.profile.hours.filter(h=>h.hour<c.chargeUntilHour).toSorted((a,b)=>a.price-b.price||a.hour-b.hour);
 const dischargeSlots=s.profile.hours.filter(h=>h.hour>=c.chargeUntilHour).toSorted((a,b)=>b.price-a.price||a.hour-b.hour);
 const dischargeRoom=total(dischargeSlots.map(h=>Math.min(h.loadKw,maxDischargeKw)));
 const target=Math.min(requested,dispatchCapacityAC,dischargeRoom);
 const charge=Array(24).fill(0), discharge=Array(24).fill(0);
 let gridNeeded=target/b.roundTripEfficiency;
 let chargingGridCap=c.gridImportLimitKw;
 if((c.dispatchPolicy??'energy-first')==='min-peak'&&gridNeeded>EPS){
  // Monotone feasibility search for the minimum charging-window grid peak.
  // Under flat charging prices this also minimizes demand cost without changing energy cost.
  const room=cap=>total(chargeSlots.map(h=>Math.min(maxChargeKw,Math.max(0,cap-h.loadKw-auxHour))));
  const required=Math.min(gridNeeded,room(c.gridImportLimitKw));
  let lo=0,hi=c.gridImportLimitKw;
  for(let i=0;i<64;i++){const mid=(lo+hi)/2;if(room(mid)>=required)hi=mid;else lo=mid;}
  chargingGridCap=hi;
 }
 for(const h of chargeSlots){const amount=Math.min(gridNeeded,maxChargeKw,Math.max(0,chargingGridCap-h.loadKw-auxHour));charge[h.hour]=Math.max(0,amount);gridNeeded=Math.max(0,gridNeeded-amount);}
 const chargedGrid=total(charge);
 let outputNeeded=chargedGrid*b.roundTripEfficiency;
 for(const h of dischargeSlots){const amount=Math.min(outputNeeded,maxDischargeKw,h.loadKw);discharge[h.hour]=Math.max(0,amount);outputNeeded=Math.max(0,outputNeeded-amount);}
 const deliveredAC=total(discharge), baselineGridFeasible=s.profile.hours.every(h=>h.loadKw+auxHour<=c.gridImportLimitKw+EPS);
 let storedDC=reserveDC;
 const hours=s.profile.hours.map(h=>{const beforeDC=storedDC;storedDC+=charge[h.hour]*eta-discharge[h.hour]/eta;return {hour:h.hour,price:h.price,loadKw:h.loadKw,chargeGridKWh:charge[h.hour],deliveredACKWh:discharge[h.hour],auxGridKWh:auxHour,gridImportKWh:h.loadKw+charge[h.hour]+auxHour-discharge[h.hour],storedBeforeDC:beforeDC,storedAfterDC:storedDC,reserveDC,socFraction:1-c.depthOfDischarge+storedDC/availableDC,energyBalanceError:storedDC-beforeDC-charge[h.hour]*eta+discharge[h.hour]/eta};});
 const warnings=[];
 if(!baselineGridFeasible) warnings.push('负载与辅助用电超过购电上限，当前供电基线不可行。');
 if(deliveredAC+1e-6<requested) warnings.push(`日交付电量不足：需要${requested.toFixed(2)} kWh，实际${deliveredAC.toFixed(2)} kWh。`);
 if(Math.abs(storedDC-reserveDC)>1e-5) warnings.push('日末储能未回到备用水平。');
 const baselinePeakKw=Math.max(...s.profile.hours.map(h=>h.loadKw));
 const gridPeakKw=Math.max(...hours.map(h=>h.gridImportKWh));
 return {nominalKWh,energySizingKWh,powerSizingKWh,sizingConstraint:Math.abs(energySizingKWh-powerSizingKWh)<EPS?'both':energySizingKWh>powerSizingKWh?'energy':'power',availableDC,reserveAC,reserveDC,eta,hours,deliveredAC,chargedGrid,chargingGridCap,baselinePeakKw,gridPeakKw,incrementalPeakKw:gridPeakKw-baselinePeakKw,chargeCost:total(hours.map(h=>h.chargeGridKWh*h.price)),avoidedCost:total(hours.map(h=>h.deliveredACKWh*h.price)),auxCost:total(hours.map(h=>h.auxGridKWh*h.price)),feasible:warnings.length===0,warnings};
}

function replacements(interval,horizon) {
 const times=[];
 if(!Number.isFinite(interval)||interval<=0) return times;
 if(horizon/interval>10000) throw new Error('更换次数超过模型上限，请核对循环寿命与测试口径。');
 for(let time=interval;time<horizon-EPS;time+=interval) times.push(time);
 return times;
}

export function evaluateBattery(s,input) {
 const c=s.common;
 const b={...input,cycleLife:input.id==='sodium'||s.interpretation==='common'?15000:input.cycleLife};
 const day=dispatchDay(s,b);
 const annualDelivery=day.deliveredAC*c.operatingDays;
 // Equivalent cycles at explicitly assumed life-test DoD; linear throughput ageing.
 const annualTestCycles=annualDelivery/day.eta/(day.nominalKWh*c.lifeTestDoD);
 const cycleYears=annualTestCycles>EPS?b.cycleLife/annualTestCycles:Infinity;
 const replacementInterval=Math.min(b.calendarLifeYears,cycleYears);
 const reserveFillCost=day.reserveDC/day.eta*s.profile.hours[0].price;
 const batteryCapex=day.nominalKWh*b.pricePerKWh;
 const pcsCapex=c.ratedPowerKw*c.pcsPricePerKw;
 const initialCost=batteryCapex+pcsCapex+c.otherInitialCost+reserveFillCost;
 const events=[...replacements(replacementInterval,c.projectYears).map(timeYears=>({type:'battery',timeYears,cost:day.nominalKWh*b.replacementPricePerKWh+c.replacementFixedCost})), ...replacements(c.pcsLifeYears,c.projectYears).map(timeYears=>({type:'pcs',timeYears,cost:pcsCapex}))].toSorted((a,b)=>a.timeYears-b.timeYears);
 const annualCharging=day.chargeCost*c.operatingDays;
 const annualAuxiliary=day.auxCost*365;
 const annualAvoided=day.avoidedCost*c.operatingDays;
 // Representative-day peaks assumed to recur in each of 12 billing months.
 // This is incremental measured-demand billing, not a transformer-capacity tariff.
 const annualDemand=12*(c.monthlyDemandRate??0)*day.incrementalPeakKw;
 const yearly=[];let cumulative=initialCost;
 const breakdown={initial:initialCost,energy:0,demand:0,maintenance:0,replacements:0,terminal:0};
 for(let year=1;year<=c.projectYears;year++){
  const replacementEvents=events.filter(e=>e.timeYears>year-1+EPS&&e.timeYears<=year+EPS);
  const replacementPV=total(replacementEvents.map(e=>discount(e.cost,e.timeYears,c.discountRate)));
  const operatingPV=discount(annualCharging+annualAuxiliary+annualDemand+b.annualOM,year,c.discountRate);
  const terminal=year===c.projectYears?c.decommissionCost-c.residualValue:0;
  const terminalPV=discount(terminal,year,c.discountRate);
  const costPV=operatingPV+replacementPV+terminalPV;
  cumulative+=costPV;
  breakdown.energy+=discount(annualCharging+annualAuxiliary,year,c.discountRate);
  breakdown.demand+=discount(annualDemand,year,c.discountRate);
  breakdown.maintenance+=discount(b.annualOM,year,c.discountRate);
  breakdown.replacements+=replacementPV;breakdown.terminal+=terminalPV;
  yearly.push({year,chargingCost:annualCharging,auxiliaryCost:annualAuxiliary,demandCost:annualDemand,maintenanceCost:b.annualOM,replacementCost:total(replacementEvents.map(e=>e.cost)),replacementPV,terminalCost:terminal,avoidedGridCost:annualAvoided,deliveredACKWh:annualDelivery,costPV,benefitPV:discount(annualAvoided,year,c.discountRate),netCashFlow:annualAvoided-annualCharging-annualAuxiliary-annualDemand-b.annualOM-total(replacementEvents.map(e=>e.cost))-terminal,cumulativeCostPV:cumulative});
 }
 const tcoPV=total(Object.values(breakdown));
 const discountedDelivery=total(yearly.map(y=>discount(y.deliveredACKWh,y.year,c.discountRate)));
 const benefitPV=total(yearly.map(y=>y.benefitPV));
 const annuityFactor=total(yearly.map(y=>discount(1,y.year,c.discountRate)));
 const annualizedCost=tcoPV/annuityFactor;
 const npv=benefitPV-tcoPV;
 const replacementBinding=cycleYears<b.calendarLifeYears-EPS?'cycle':cycleYears>b.calendarLifeYears+EPS?'calendar':'both';
 const npvBeforeDemand=npv+breakdown.demand;
 const demandRateBreakEven=day.incrementalPeakKw>EPS?npvBeforeDemand/(12*day.incrementalPeakKw*annuityFactor):null;
 return {id:b.id,name:b.name,battery:b,day,annualTestCycles,cycleYears:Number.isFinite(cycleYears)?cycleYears:null,replacementBinding,replacementInterval,events,yearly,breakdown,annualDemand,annuityFactor,annualizedCost,annualCostPerReservedKw:day.reserveAC>EPS?annualizedCost/c.ratedPowerKw:null,requiredAnnualUnmodelledBenefit:Math.max(0,-npv/annuityFactor),demandRateBreakEven,tcoPV,benefitPV,npv,lcos:discountedDelivery>EPS?tcoPV/discountedDelivery:null,discountedDelivery,feasible:day.feasible};
}

export function compare(s,options={boundary:true}) {
 const errors=validateScenario(s);if(errors.length) throw new Error(errors.join('；'));
 const systems=s.batteries.map(b=>evaluateBattery(s,b));
 const comparable=systems.every(r=>r.feasible)&&Math.abs(systems[0].day.deliveredAC-systems[1].day.deliveredAC)<1e-5;
 const difference=systems[0].tcoPV-systems[1].tcoPV;
 const result={modelVersion:MODEL_VERSION,interpretation:s.interpretation,systems,comparable,difference,preferred:comparable?(Math.abs(difference)<1e-5?'equal':difference<0?'sodium':'lfp'):null,parameterRegister:parameterRegister(s),limitations:['除题设外均为演示假设或用户输入，未进行产品、报价和现场验证。','重复一个24小时代表日；−30℃是设计条件，不能解释为全年环境温度。','充电在指定前段窗口内按低价优先，放电在后段按高价优先；未证明全局最优。','电价负载、效率、低温系数和辅助用电在项目期保持不变；未纳入税费、融资与供应链。','年度收支按年末折现；更换按精确发生时点折现；金额采用不变价。','备用电仅按能量与功率约束模拟，未验证真实UPS切换、电气冗余或安全标准。']};
 if(options.boundary) result.boundary=priceBoundary(s,result);
 result.limitations.push('需量费用按代表日的购电峰值在每月出现计算。实际按月峰值、容量计费或合同门槛须重新核验；低频调度不能据此估算月份。','最小峰值策略先满足日交付，再压低充电窗口峰值；只在充电电价平坦等限定条件下同时达到较低能量费与需量费。','所需额外年收益是回本条件；没有假定停电概率、可用率或避免损失已被实现。');
 return result;
}

export function priceBoundary(s,existing) {
 const result=existing||compare(s,{boundary:false});
 if(!result.comparable) return {status:'infeasible',value:null,description:'供电任务未满足，不能比较采购边界。'};
 const sodium=result.systems[0], lfp=result.systems[1];
 // Only initial sodium battery price varies; replacement price is an independent input.
 const otherCost=sodium.tcoPV-sodium.day.nominalKWh*s.batteries[0].pricePerKWh;
 const value=(lfp.tcoPV-otherCost)/sodium.day.nominalKWh;
 if(value<0) return {status:'none',value:null,rawValue:value,description:'即使钠电初始电池报价为0，在其他条件不变时也不能达到费用相同。'};
 return {status:'found',value,description:'仅改变钠电初始电池单价；替换价格、配置与其他参数保持不变。'};
}

export function sensitivity(s,prices=[400,550,700,850,1000],efficiencies=[0.8,0.85,0.9,0.95,1]) {
 return efficiencies.map(efficiency=>prices.map(price=>{const next=structuredClone(s);next.batteries[0].pricePerKWh=price;next.batteries[0].roundTripEfficiency=efficiency;const r=compare(next,{boundary:false});return {price,efficiency,comparable:r.comparable,difference:r.comparable?r.difference:null};}));
}

export function parseProfileCSV(text) {
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 if(lines[0]?.trim()!=='hour,price,load_kw'||lines.length!==25) throw new Error('CSV需要表头hour,price,load_kw及0—23点共24行数据。');
 const hours=lines.slice(1).map((line,i)=>{const parts=line.split(',');if(parts.length!==3||parts.some(p=>p.trim()==='')) throw new Error(`第${i+2}行格式不正确`);const [hour,price,loadKw]=parts.map(Number);if(hour!==i||!Number.isFinite(price)||price<0||price>100||!Number.isFinite(loadKw)||loadKw<0||loadKw>10000000) throw new Error(`第${i+2}行数值不正确`);return {hour,price,loadKw};});
 return {kind:'user-input',description:'用户导入的24小时数据，来源与代表性需自行核验。',hours};
}
export function toCSV(rows,columns) {
 const escape=value=>{let text=value==null?'':String(value);if(typeof value==='string'&&/^[\s]*[=+@-]/.test(text))text="'"+text;return /[",\n\r]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;};
 return '\uFEFF'+[columns.join(','),...rows.map(row=>columns.map(key=>escape(row[key])).join(','))].join('\r\n');
}
