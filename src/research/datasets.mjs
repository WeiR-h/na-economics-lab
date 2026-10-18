import {compare,validateScenario} from '../model/economics.mjs';
import {MODEL_VERSION} from '../model/scenario.mjs';

export const TIME_SERIES_HEADER='timestamp,load_kw,price';
const HOUR=3600000, DAY=24*HOUR;
function timestamp(value){
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!m)return null;
 const [y,mo,d,h,mi,se]=m.slice(1,7).map(v=>Number(v??0));
 if(y<2000||y>2100||h>23||mi>59||se>59)return null;
 const check=new Date(Date.UTC(y,mo-1,d,h,mi,se));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d)return null;
 if(m[7]!=='Z'){const [zh,zm]=m[7].slice(1).split(':').map(Number);if(zh>14||zm>59||zh===14&&zm!==0)return null;}
 const ms=Date.parse(value);if(!Number.isFinite(ms))return null;
 const local=new Date(ms+8*HOUR).toISOString();
 return {ms,date:local.slice(0,10),hour:Number(local.slice(11,13)),onHour:local.slice(14,19)==='00:00'};
}
export function inspectTimeSeries(csv,metadata={}){
 if(typeof csv!=='string'||csv.length>5000000)throw new Error('CSV须为文本，且不超过5MB。');
 const lines=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 if(lines[0]?.trim()!==TIME_SERIES_HEADER||lines.length<2)throw new Error('需要timestamp,load_kw,price表头及数据行。');
 if(lines.length>50001)throw new Error('当前最多检查50,000行。');
 const loadUnit=metadata.loadUnit??'kW',priceUnit=metadata.priceUnit??'RMB/kWh';
 if(loadUnit!=='kW'||priceUnit!=='RMB/kWh')throw new Error('当前只接受kW和元/kWh，不能静默转换单位。');
 const source=String(metadata.source??'用户上传资料，来源待核对').trim();if(!source||source.length>500)throw new Error('请提供1至500字的数据来源。');
 const classification=metadata.classification??'user-supplied';if(!['sample','user-supplied'].includes(classification))throw new Error('资料性质不支持。');
 const shareScope=metadata.shareScope??'private';if(!['private','summary'].includes(shareScope))throw new Error('分享范围无效。');
 const rows=[],issues=[],times=new Set();let invalidTimestamps=0,duplicates=0,invalidValues=0,nonHourly=0,outOfOrder=0,last=-Infinity;
 for(let i=1;i<lines.length;i++){
  const parts=lines[i].split(',').map(x=>x.trim()),t=timestamp(parts[0]??'');
  const loadKw=Number(parts[1]),price=Number(parts[2]);
  const validValues=parts.length===3&&parts[1]!==''&&parts[2]!==''&&Number.isFinite(loadKw)&&loadKw>=0&&loadKw<=10000000&&Number.isFinite(price)&&price>=0&&price<=100;
  const reasons=[];
  if(!t){invalidTimestamps++;reasons.push('时间无效或缺少时区');}
  if(!validValues){invalidValues++;reasons.push('负荷或电价缺失、越界或格式错误');}
  let duplicate=false;
  if(t){duplicate=times.has(t.ms);if(duplicate){duplicates++;reasons.push('重复时刻');}times.add(t.ms);if(!t.onHour){nonHourly++;reasons.push('非整小时，当前仅质检');}if(t.ms<last)outOfOrder++;last=t.ms;}
  const row={line:i+1,timestamp:parts[0],loadKw,price,...t,valid:!!t&&t.onHour&&validValues&&!duplicate};rows.push(row);
  if(reasons.length&&issues.length<100)issues.push({line:i+1,reasons});
 }
 const dated=rows.filter(r=>r.date),groups=new Map();for(const r of dated){if(!groups.has(r.date))groups.set(r.date,[]);groups.get(r.date).push(r);}
 const dates=[...groups.keys()].sort();if(!dates.length)throw new Error('没有可识别日期；请检查时间格式和时区。');
 const first=Date.parse(dates[0]+'T00:00:00Z'),lastDate=Date.parse(dates.at(-1)+'T00:00:00Z');
 if((lastDate-first)/DAY>365)throw new Error('本版一次最多检查366个日历日，请按年份拆分资料。');
 const days=[];
 for(let ms=first;ms<=lastDate;ms+=DAY){const date=new Date(ms).toISOString().slice(0,10),items=groups.get(date)??[],hours=new Set(items.filter(r=>r.onHour).map(r=>r.hour));const missingHours=Array.from({length:24},(_,h)=>h).filter(h=>!hours.has(h));const eligible=items.length===24&&hours.size===24&&items.every(r=>r.valid)&&invalidTimestamps===0;
  days.push({date,rows:items.length,missingHours,eligible,peakLoadKw:eligible?Math.max(...items.map(r=>r.loadKw)):null,loadEnergyKWh:eligible?items.reduce((sum,r)=>sum+r.loadKw,0):null,minPrice:eligible?Math.min(...items.map(r=>r.price)):null,maxPrice:eligible?Math.max(...items.map(r=>r.price)):null,reason:eligible?'完整24小时':invalidTimestamps?'存在无法归属日期的记录，先修正整份CSV':!items.length?'整日缺失':items.some(r=>!r.onHour)?'含非整小时记录':items.some(r=>!r.valid)?'含异常或重复记录':'缺少小时记录'});
 }
 return {schemaVersion:1,classification,source,shareScope,timezone:'Asia/Shanghai',loadUnit,priceUnit,rows,days,issues,quality:{rows:rows.length,startDate:dates[0],endDate:dates.at(-1),completeDays:days.filter(d=>d.eligible).length,missingHours:days.reduce((sum,d)=>sum+d.missingHours.length,0),duplicates,invalidValues,invalidTimestamps,nonHourly,outOfOrder,issuePreviewLimit:100},sourceVerification:'user-declared-not-independently-verified'};
}
export function sampleTimeSeries(){
 const rows=[TIME_SERIES_HEADER];
 for(let day=10;day<=13;day++)for(let hour=0;hour<24;hour++){
  if(day===12&&hour===5)continue;
  const price=hour<8?.3:hour<16?.55:hour<22?.85:.55;
  const line=`2026-10-${day}T${String(hour).padStart(2,'0')}:00:00+08:00,${day===11&&hour>=8?1100:1000},${day===11&&hour>=16&&hour<22?.75:price}`;
  rows.push(line);if(day===13&&hour===6)rows.push(line);
 }
 return rows.join('\n');
}
export function datasetDayScenario(dataset,date,baseline){
 if(!dataset.days.find(d=>d.date===date)?.eligible)throw new Error('只能使用质检通过的完整日。');
 if(validateScenario(baseline).length)throw new Error('基线场景无效。');
 const hours=dataset.rows.filter(r=>r.date===date).toSorted((a,b)=>a.hour-b.hour).map(r=>({hour:r.hour,price:r.price,loadKw:r.loadKw}));
 const next=structuredClone(baseline);next.title=`${dataset.classification==='sample'?'合成样例':'用户资料'} ${date} 单日回放`;next.preset='custom';
 next.profile={kind:dataset.classification==='sample'?'synthetic':'user-input',description:`${date} Asia/Shanghai；${dataset.source}；仅当日分析，来源由用户声明。`,hours};
 next.provenance={classification:dataset.classification==='sample'?'sample-validation':'user-supplied-not-independently-verified',source:dataset.source,shareScope:dataset.shareScope,calibratedFields:['profile.hours.loadKw','profile.hours.price'],description:'仅替换负荷与电价，其他电池性能、报价和寿命参数仍沿用基线假设。'};
 return next;
}
export function daySummary(scenario){return compare(scenario,{boundary:false}).systems.map(s=>({id:s.id,name:s.name,feasible:s.feasible,nominalKWh:s.day.nominalKWh,deliveredACKWh:s.day.deliveredAC,reserveACKWh:s.day.reserveAC,gridPeakKw:s.day.gridPeakKw,chargingCostRMB:s.day.chargeCost,auxiliaryCostRMB:s.day.auxCost,avoidedCostRMB:s.day.avoidedCost,energyBalance:s.day.hours}));}
export function replayDatasetDay(dataset,date,baseline){const scenario=datasetDayScenario(dataset,date,baseline);return {schemaVersion:1,modelVersion:MODEL_VERSION,kind:'observed-day',classification:dataset.classification,source:{description:dataset.source,shareScope:dataset.shareScope,date,timezone:dataset.timezone,quality:dataset.quality},baselineScenario:structuredClone(baseline),scenario,before:daySummary(baseline),after:daySummary(scenario),scope:'仅对应样本日；不含真实月需量结算或真实年度/20年收益；产品参数仍为假设。'};}
