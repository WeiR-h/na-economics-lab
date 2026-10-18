import {MODEL_VERSION} from '../model/scenario.mjs';
import {daySummary} from './datasets.mjs';
import {validateScenario} from '../model/economics.mjs';

const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const SCOPE='仅对应样本日；不含真实月需量结算或真实年度/20年收益；产品参数仍为假设。';
export function assertAnalysis(record){
 if(!record||record.schemaVersion!==1||record.modelVersion!==MODEL_VERSION||record.kind!=='observed-day'||!['sample','user-supplied'].includes(record.classification)||record.scope!==SCOPE)throw new Error('复算记录版本、性质或使用范围无效。');
 if(!record.source||typeof record.source.description!=='string'||!record.source.description.trim()||record.source.description.length>500||!['private','summary'].includes(record.source.shareScope)||!/^\d{4}-\d{2}-\d{2}$/.test(record.source.date)||record.source.timezone!=='Asia/Shanghai')throw new Error('复算来源和分享范围不完整。');
 for(const s of [record.baselineScenario,record.scenario])if(validateScenario(s).length)throw new Error('复算输入不完整。');
 if(stable(record.baselineScenario.common)!==stable(record.scenario.common)||stable(record.baselineScenario.batteries)!==stable(record.scenario.batteries))throw new Error('本版单日资料回放只能替换负荷与电价。');
 const provenance=record.scenario.provenance;
 if(provenance?.shareScope!==record.source.shareScope||provenance?.source!==record.source.description||provenance?.classification!==(record.classification==='sample'?'sample-validation':'user-supplied-not-independently-verified'))throw new Error('来源、性质或分享范围与输入快照不一致。');
 for(const [key,scenario] of [['before',record.baselineScenario],['after',record.scenario]])if(stable(record[key])!==stable(daySummary(scenario)))throw new Error('复算结果与保留的输入不一致，请重新计算。');
 return record;
}
export function inputChanges(record){assertAnalysis(record);return record.scenario.profile.hours.flatMap((h,i)=>['loadKw','price'].filter(k=>h[k]!==record.baselineScenario.profile.hours[i][k]).map(k=>({parameter:`profile.hours[${h.hour}].${k}`,before:record.baselineScenario.profile.hours[i][k],after:h[k]})));}
const plain=value=>String(value).replace(/[\r\n]/g,' ').replace(/([\\`*_{}\[\]<>#!|])/g,'\\$1');
export function communityAnalysisSummary(workspace){
 const lines=['# 04题研究更新摘要','',`作者：${plain(workspace.author??'WeiR-h')}`,'','以下为本地复算与贡献记录；资料来源由提供者声明，正式身份与项目积分由1836确认。',''];
 for(const link of workspace.analysisRecords??[]){const c=workspace.contributions.find(c=>c.id===link.contributionId);if(!c)continue;const review=c.reviews.at(-1);lines.push(`## ${plain(c.id)} · ${plain(c.contributor)}`,`本地证据状态：${c.status==='accepted'?'复核通过':c.status==='revision'?'需补充':'待复核'}；模型${link.analysis.modelVersion}。`);
  if(link.analysis.source.shareScope!=='summary'){lines.push('这条资料仅允许本地使用，摘要已省略来源、日期、输入及数值。','');continue;}
  lines.push(`资料性质：${link.analysis.classification==='sample'?'合成样例验证，非现场研究':'用户提供资料，尚未独立核验来源'}。`, `来源：${plain(link.analysis.source.description)}；样本日${link.analysis.source.date}。`,`与基线相比，${inputChanges(link.analysis).length}个逐时负荷或电价字段变化；其余产品和费用参数保持基线假设。`,'','| 系统 | 交付kWh：前→后 | 充电费元：前→后 | 避免购电费元：前→后 | 购电峰值kW：前→后 | 任务可行 |','| --- | --- | --- | --- | --- | --- |');
  link.analysis.after.forEach((a,i)=>{const b=link.analysis.before[i],f=n=>Number(n).toFixed(2);lines.push(`| ${a.name} | ${f(b.deliveredACKWh)}→${f(a.deliveredACKWh)} | ${f(b.chargingCostRMB)}→${f(a.chargingCostRMB)} | ${f(b.avoidedCostRMB)}→${f(a.avoidedCostRMB)} | ${f(b.gridPeakKw)}→${f(a.gridPeakKw)} | ${a.feasible?'是':'否'} |`);});
  lines.push('',review?`复核署名：${plain(review.reviewer)}；意见：${plain(review.note)}`:'尚无复核意见。',link.analysis.scope,'');
 }
 if(!workspace.analysisRecords?.length)lines.push('尚无关联的复算记录。');
 lines.push('实际经营收入须在发生后凭据登记，模型结果不作为工具收入。');return lines.join('\n');
}
