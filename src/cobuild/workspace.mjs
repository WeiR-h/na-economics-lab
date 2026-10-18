import {assertAnalysis} from '../research/analysis.mjs';
export const WORKSPACE_VERSION = 2;
export const PROJECT_ID = 'cmujvb96f000z3jo188jx0xjp';
export const PROJECT_URL = `https://1836.online/projects/${PROJECT_ID}`;
export const STORAGE_KEY = 'na-lab-cobuild-v1';
export const STATUS_LABELS = {open:'待认领',claimed:'进行中',submitted:'待复核',revision:'待补充',accepted:'本地复核通过'};
export const EVENT_LABELS = {claim:'认领任务',submit:'提交证据',review:'独立复核',correction:'记录复核更正','points-record':'登记积分依据','business-record':'登记经营事项','business-confirmed':'确认经营发生','analysis-link':'关联复算记录'};
const MAX_ITEMS = 500;
const MAX_MONEY_CENTS = 100000000000;
const TASKS = [
 ['paired-quotes','补齐同任务配对报价','同一交流侧1MW、15分钟任务，分别取得LFP与钠电预算报价。','两份报价及型号明确；列明温度、寿命终点、含税范围、UPS/PCS和温控是否包含。', ['同任务及型号明确','来源与日期可追溯','供货边界和缺口已说明']],
 ['power-curves','核对15分钟功率与低温条件','澄清昆宇5/9柜初筛的测试工况，以及−30℃部署需要的条件。','厂商书面答复或测试报告，明确温度、寿命终点、直流/交流边界及柜数修正。',['测试条件可追溯','目录矛盾已保留或解决','对柜数结论的影响已说明']],
 ['model-review','独立复算经济模型','复算需量费反例、备用约束、更换时点和现金流。','独立复算过程，保留输入、模型版本、差异与复核结果。',['输入及版本已记录','复算过程可重复','差异及结论已说明']],
 ['monthly-load','补充真实月度负荷与计费','获取可分享的匿名15分钟负荷和一个完整月的计费依据。','明确数据授权、计费类型、记录时段、缺失数据和实际峰值；不公开客户敏感字段。',['数据使用范围明确','负荷与账单口径一致','模型可用性及缺口已说明']],
 ['user-feedback','验证一次实际使用需求','请AIDC业主或集成商试用选型比较，并记录实际用途。','可引用的使用反馈，说明是否影响选型、减少重复计价或发现约束。',['反馈来源及授权明确','具体用途与结果明确','付费意向与实际收入分开记录']]
];
function text(value,label,max=3000){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`${label}不能为空，且不能超过${max}字。`);return value.trim();}
export const identity = value => String(value).trim().normalize('NFKC').toLowerCase();
function url(value,label='证据链接'){const s=text(value,label,1000);let u;try{u=new URL(s);}catch{throw new Error(`${label}需要完整的网址。`);}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw new Error(`${label}仅支持不含账号密码的http或https网址。`);return u.href;}
function stamp(value){const s=value??new Date().toISOString();if(typeof s!=='string'||!Number.isFinite(Date.parse(s)))throw new Error('记录日期无效。');return s;}
function id(state,prefix){return `${prefix}-${state.sequence+1}`;}
function event(state,kind,actor,detail,at){state.sequence++;state.events.push({id:`event-${state.sequence}`,kind,actor,detail,at:stamp(at)});if(state.events.length>MAX_ITEMS)throw new Error('记录已达到500条，请导出归档后建立新的工作台。');return state;}
function copy(state){assertWorkspace(state);return structuredClone(state);}
function taskOf(state,taskId){const task=state.tasks.find(t=>t.id===taskId);if(!task)throw new Error('找不到对应任务。');return task;}
function latestOf(state,taskId){return state.contributions.filter(c=>c.taskId===taskId).at(-1);}

export function parseMoney(value){
 const s=String(value).trim();
 if(!/^\d{1,10}(\.\d{1,2})?$/.test(s))throw new Error('金额须为非负数字，最多保留两位小数。');
 const [whole,fraction='']=s.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>MAX_MONEY_CENTS)throw new Error('金额超过本地账本支持范围。');
 return cents;
}
export const moneyText = cents => (cents/100).toFixed(2);
function pointsMicro(value){const s=String(value).trim();if(!/^\d{1,7}(\.\d{1,6})?$/.test(s))throw new Error('积分须为非负数字，最多保留六位小数。');const [whole,fraction='']=s.split('.');const n=Number(whole)*1e6+Number(fraction.padEnd(6,'0'));if(!Number.isSafeInteger(n)||n>1e12)throw new Error('积分超出支持范围。');return n;}

export function createWorkspace(){
 return {schemaVersion:WORKSPACE_VERSION,projectId:PROJECT_ID,author:'WeiR-h',dataStatus:'local-records',sequence:0,
 tasks:TASKS.map(([id,title,question,acceptance,checks])=>({id,title,question,acceptance,checks,status:'open',claimant:null})),
  contributions:[],pointRecords:[],commercialEntries:[],events:[],analysisRecords:[],
 scope:{storage:'local',platformSync:false,authenticatedIdentity:false,settlement:false}};
}

export function claimTask(state,taskId,claimant,at){const next=copy(state),task=taskOf(next,taskId);if(task.status!=='open')throw new Error('该任务已被认领。');task.claimant=text(claimant,'认领者',80);task.status='claimed';return event(next,'claim',task.claimant,taskId,at);}
export function submitEvidence(state,taskId,input,at){
 const next=copy(state),task=taskOf(next,taskId);if(!['claimed','revision'].includes(task.status))throw new Error('请先认领任务；已提交的证据需要复核后再修订。');
 if(identity(input.contributor)!==identity(task.claimant))throw new Error('提交者应与任务认领者一致。');
 if(input.shareAllowed!==true)throw new Error('请确认已获得证据内容的分享许可。');
 const previous=latestOf(next,taskId);
 const entry={id:id(next,'contribution'),taskId,contributor:task.claimant,revision:(previous?.revision??0)+1,
  question:task.question,summary:text(input.summary,'证据说明'),source:url(input.source),impact:text(input.impact,'结论影响'),
  modelVersion:text(input.modelVersion,'模型版本',80),shareAllowed:true,status:'submitted',submittedAt:stamp(at),reviews:[]};
 next.contributions.push(entry);task.status='submitted';return event(next,'submit',task.claimant,entry.id,at);
}
export function reviewEvidence(state,contributionId,input,at){
 const next=copy(state),entry=next.contributions.find(c=>c.id===contributionId);if(!entry||entry.status!=='submitted')throw new Error('只能复核当前待复核的证据。');
 const reviewer=text(input.reviewer,'复核者',80);if(identity(reviewer)===identity(entry.contributor))throw new Error('请由另一位复核者检查，贡献者不能通过自己的证据。');
 if(!['accept','revise'].includes(input.decision))throw new Error('复核决定无效。');
 const task=taskOf(next,entry.taskId),checks=input.checks;
 if(!Array.isArray(checks)||checks.length!==task.checks.length||checks.some(v=>typeof v!=='boolean'))throw new Error('复核项不完整。');
 if(input.decision==='accept'&&!checks.every(Boolean))throw new Error('通过前需逐项确认全部验收依据。');
 entry.reviews.push({reviewer,decision:input.decision,checks:[...checks],note:text(input.note,'复核说明'),at:stamp(at)});
 entry.status=input.decision==='accept'?'accepted':'revision';task.status=entry.status;
 return event(next,'review',reviewer,`${entry.id}:${input.decision}`,at);
}
export function addPlatformPoints(state,input,at){
 const next=copy(state),entry=next.contributions.find(c=>c.id===input.contributionId);
 if(!entry||entry.status!=='accepted')throw new Error('请先完成该贡献的本地复核。');
 if(next.pointRecords.some(p=>p.contributionId===entry.id))throw new Error('这条贡献已有积分登记，避免重复计算。');
 const reference=url(input.reference,'1836积分依据');if(new URL(reference).hostname!=='1836.online')throw new Error('请使用1836平台的依据链接。');
 const units=pointsMicro(input.points);if(units===0)throw new Error('积分登记须大于0。');
 const record={id:id(next,'points'),contributionId:entry.id,projectId:PROJECT_ID,contributor:entry.contributor,
  pointsMicro:units,reference,recordedBy:text(input.recordedBy,'登记者',80),at:stamp(at),active:true,verification:'manual-reference-not-api-verified'};
 next.pointRecords.push(record);return event(next,'points-record',record.recordedBy,record.id,at);
}
export function reopenEvidence(state,contributionId,input,at){
 const next=copy(state),entry=next.contributions.find(c=>c.id===contributionId);
 if(!entry||entry.status!=='accepted')throw new Error('只有已通过本地复核的证据可以记录更正。');
 const reviewer=text(input.reviewer,'复核者',80);if(identity(reviewer)===identity(entry.contributor))throw new Error('请由另一位复核者记录更正。');
 entry.reviews.push({reviewer,decision:'revise',checks:taskOf(next,entry.taskId).checks.map(()=>false),note:text(input.note,'更正说明'),at:stamp(at)});
 entry.status='revision';taskOf(next,entry.taskId).status='revision';
 next.pointRecords.filter(p=>p.contributionId===entry.id).forEach(p=>{p.active=false;});
 return event(next,'correction',reviewer,entry.id,at);
}
export function addCommercialEntry(state,input,at){
 const next=copy(state);if(!['income','expense'].includes(input.kind)||!['recorded','pending'].includes(input.status))throw new Error('经营记录类型或状态无效。');
 const amountCents=parseMoney(input.amount);if(amountCents===0)throw new Error('经营记录金额须大于0。');
 const record={id:id(next,'business'),kind:input.kind,status:input.status,initialStatus:input.status,amountCents,
  memo:text(input.memo,'经营事项',500),reference:text(input.reference,'凭据或约定依据',1000),recordedBy:text(input.recordedBy,'登记者',80),at:stamp(at)};
 next.commercialEntries.push(record);return event(next,'business-record',record.recordedBy,record.id,at);
}
export function confirmCommercialEntry(state,entryId,input,at){
 const next=copy(state),entry=next.commercialEntries.find(e=>e.id===entryId);if(!entry||entry.status!=='pending')throw new Error('只能确认待发生的经营事项。');
 entry.status='recorded';entry.confirmedAt=stamp(at);entry.confirmedBy=text(input.recordedBy,'确认人',80);entry.occurrenceReference=text(input.reference,'发生凭据',1000);
 return event(next,'business-confirmed',entry.confirmedBy,entry.id,at);
}
export function commercialSummary(state){
 assertWorkspace(state);let income=0,expense=0,pendingIncome=0,pendingExpense=0;
 for(const e of state.commercialEntries){if(e.status==='recorded'){if(e.kind==='income')income+=e.amountCents;else expense+=e.amountCents;}else if(e.kind==='income')pendingIncome+=e.amountCents;else pendingExpense+=e.amountCents;}
 return {incomeCents:income,expenseCents:expense,balanceCents:income-expense,positiveBalanceCents:Math.max(0,income-expense),pendingIncomeCents:pendingIncome,pendingExpenseCents:pendingExpense};
}
export function distributionTrial(state,amount){
 assertWorkspace(state);const poolCents=parseMoney(amount),groups=new Map();
 for(const p of state.pointRecords){const entry=state.contributions.find(c=>c.id===p.contributionId);if(!entry||entry.status!=='accepted'||!p.active||p.projectId!==PROJECT_ID)continue;const key=identity(p.contributor);const g=groups.get(key)??{contributor:p.contributor,pointsMicro:0};g.pointsMicro+=p.pointsMicro;groups.set(key,g);}
 const rows=[...groups.values()].sort((a,b)=>identity(a.contributor)<identity(b.contributor)?-1:1);
 const totalMicro=rows.reduce((n,row)=>n+BigInt(row.pointsMicro),0n);
 if(!totalMicro)return {poolCents,allocatedCents:0,unallocatedCents:poolCents,rows:[],status:'no-project-points',settlement:false};
 let allocated=0;
 for(const row of rows){const numerator=BigInt(poolCents)*BigInt(row.pointsMicro);row.amountCents=Number(numerator/totalMicro);row.remainder=numerator%totalMicro;row.share=Number(BigInt(row.pointsMicro))/Number(totalMicro);allocated+=row.amountCents;}
 const order=[...rows].sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:identity(a.contributor)<identity(b.contributor)?-1:1);
 for(let i=0;i<poolCents-allocated;i++)order[i].amountCents++;
 return {poolCents,allocatedCents:poolCents,unallocatedCents:0,rows:rows.map(({remainder,...row})=>row),status:'hypothetical-manually-recorded-points',settlement:false};
}

export function linkAnalysis(state,contributionId,analysis,at){
 const next=copy(state),c=next.contributions.find(c=>c.id===contributionId);
 if(!c||c.status!=='submitted')throw new Error('只能关联待复核贡献；已通过的证据需更正并重新提交。');
 assertAnalysis(analysis);if(c.modelVersion!==analysis.modelVersion)throw new Error('贡献声明的模型版本与复算版本不一致。');
 if(next.analysisRecords.some(r=>r.contributionId===contributionId&&JSON.stringify(r.analysis.scenario)===JSON.stringify(analysis.scenario)&&JSON.stringify(r.analysis.baselineScenario)===JSON.stringify(analysis.baselineScenario)))throw new Error('这次复算已关联，避免重复记录。');
 const entry={id:id(next,'analysis'),contributionId,recordedBy:c.contributor,recordedAt:stamp(at),analysis:structuredClone(analysis)};
 next.analysisRecords.push(entry);return event(next,'analysis-link',c.contributor,entry.id,at);
}
export function assertWorkspace(state){
 if(!state||state.schemaVersion!==WORKSPACE_VERSION||state.projectId!==PROJECT_ID)throw new Error('不是本项目支持的共建资料格式。');
 if(state.dataStatus!==undefined&&!['local-records','rehearsal'].includes(state.dataStatus))throw new Error('共建资料性质无效。');
 if(!Number.isSafeInteger(state.sequence)||state.sequence<0)throw new Error('资料序号无效。');
 for(const key of ['tasks','contributions','pointRecords','commercialEntries','events','analysisRecords'])if(!Array.isArray(state[key])||state[key].length>MAX_ITEMS)throw new Error('资料列表缺失或超过500条。');
 if(state.scope?.storage!=='local'||state.scope.platformSync!==false||state.scope.authenticatedIdentity!==false||state.scope.settlement!==false)throw new Error('本地资料不能标记为已同步、身份认证或完成结算。');
 if(state.tasks.length!==TASKS.length)throw new Error('任务定义不完整。');
 const unique=(items)=>{const ids=items.map(x=>text(x.id,'记录编号',100));if(new Set(ids).size!==ids.length)throw new Error('存在重复记录编号。');};
 for(const key of ['tasks','contributions','pointRecords','commercialEntries','events','analysisRecords'])unique(state[key]);
 for(const definition of TASKS){const t=state.tasks.find(x=>x.id===definition[0]);if(!t||t.title!==definition[1]||t.question!==definition[2]||t.acceptance!==definition[3]||JSON.stringify(t.checks)!==JSON.stringify(definition[4])||!Object.hasOwn(STATUS_LABELS,t.status))throw new Error('任务定义或验收要求被修改。');if(t.status==='open'){if(t.claimant!==null)throw new Error('待认领任务的认领者应为空。');}else text(t.claimant,'认领者',80);}
 for(const c of state.contributions){const t=taskOf(state,c.taskId);if(c.question!==t.question||identity(c.contributor)!==identity(t.claimant)||!['submitted','revision','accepted'].includes(c.status)||c.shareAllowed!==true||!Number.isInteger(c.revision)||c.revision<1)throw new Error('贡献与任务不一致。');text(c.summary,'证据说明');url(c.source);text(c.impact,'结论影响');text(c.modelVersion,'模型版本',80);stamp(c.submittedAt);if(!Array.isArray(c.reviews)||c.reviews.length>MAX_ITEMS)throw new Error('复核记录无效。');for(const review of c.reviews){text(review.reviewer,'复核者',80);text(review.note,'复核说明');stamp(review.at);if(identity(review.reviewer)===identity(c.contributor)||!['accept','revise'].includes(review.decision)||!Array.isArray(review.checks)||review.checks.length!==t.checks.length||review.checks.some(v=>typeof v!=='boolean')||(review.decision==='accept'&&!review.checks.every(Boolean)))throw new Error('复核身份或验收依据无效。');}const last=c.reviews.at(-1);if(c.status==='accepted'&&last?.decision!=='accept'||c.status==='revision'&&last?.decision!=='revise'||c.status==='submitted'&&c.reviews.length)throw new Error('贡献状态与复核记录不一致。');}
 for(const t of state.tasks){const latest=latestOf(state,t.id);if(['submitted','revision','accepted'].includes(t.status)&&latest?.status!==t.status)throw new Error('任务与最新证据状态不一致。');if(['open','claimed'].includes(t.status)&&latest)throw new Error('任务历史与状态不一致。');const versions=state.contributions.filter(c=>c.taskId===t.id);versions.forEach((c,i)=>{if(c.revision!==i+1||i<versions.length-1&&c.status!=='revision')throw new Error('证据修订顺序无效。');});}
 const contributionIds=new Set();for(const p of state.pointRecords){const c=state.contributions.find(c=>c.id===p.contributionId);if(!c||typeof p.active!=='boolean'||p.active&&c.status!=='accepted'||!p.active&&c.status!=='revision'||p.projectId!==PROJECT_ID||identity(p.contributor)!==identity(c.contributor)||contributionIds.has(p.contributionId)||!Number.isSafeInteger(p.pointsMicro)||p.pointsMicro<=0||p.pointsMicro>1e12||p.verification!=='manual-reference-not-api-verified'||new URL(url(p.reference,'1836积分依据')).hostname!=='1836.online')throw new Error('积分记录不符合本项目依据要求。');contributionIds.add(p.contributionId);text(p.recordedBy,'登记者',80);stamp(p.at);}
 for(const e of state.commercialEntries){if(!['income','expense'].includes(e.kind)||!['recorded','pending'].includes(e.status)||!['recorded','pending'].includes(e.initialStatus)||!Number.isSafeInteger(e.amountCents)||e.amountCents<=0||e.amountCents>MAX_MONEY_CENTS)throw new Error('经营记录金额或类型无效。');text(e.memo,'经营事项',500);text(e.reference,'凭据',1000);text(e.recordedBy,'登记者',80);stamp(e.at);if(e.initialStatus==='recorded'&&e.status!=='recorded')throw new Error('已发生经营事项不能回退为待发生。');if(e.initialStatus==='pending'&&e.status==='recorded'){text(e.occurrenceReference,'发生凭据',1000);text(e.confirmedBy,'确认人',80);stamp(e.confirmedAt);}}
 if(state.sequence!==state.events.length)throw new Error('操作记录序号不一致。');state.events.forEach((e,i)=>{if(e.id!==`event-${i+1}`||!Object.hasOwn(EVENT_LABELS,e.kind))throw new Error('操作记录顺序或类型无效。');text(e.actor,'记录人',80);text(e.detail,'记录内容',500);stamp(e.at);});
 const recorded=(kind,detail,actor)=>state.events.some(e=>e.kind===kind&&e.detail===detail&&identity(e.actor)===identity(actor));
 for(const t of state.tasks)if(t.claimant&&!recorded('claim',t.id,t.claimant))throw new Error('缺少任务认领留痕。');
 for(const c of state.contributions){if(!recorded('submit',c.id,c.contributor))throw new Error('缺少证据提交留痕。');for(const review of c.reviews){if(!recorded('review',`${c.id}:${review.decision}`,review.reviewer)&&!(review.decision==='revise'&&recorded('correction',c.id,review.reviewer)))throw new Error('缺少复核留痕。');}}
 for(const p of state.pointRecords)if(!recorded('points-record',p.id,p.recordedBy))throw new Error('缺少积分登记留痕。');
 for(const e of state.commercialEntries){if(!recorded('business-record',e.id,e.recordedBy))throw new Error('缺少经营事项留痕。');if(e.confirmedBy&&!recorded('business-confirmed',e.id,e.confirmedBy))throw new Error('缺少经营发生确认留痕。');}
 for(const r of state.analysisRecords){const c=state.contributions.find(c=>c.id===r.contributionId);if(!c||c.modelVersion!==r.analysis?.modelVersion||identity(r.recordedBy)!==identity(c.contributor)||!recorded('analysis-link',r.id,r.recordedBy))throw new Error('复算与贡献或操作留痕不一致。');stamp(r.recordedAt);assertAnalysis(r.analysis);
  const linkIndex=state.events.findIndex(e=>e.kind==='analysis-link'&&e.detail===r.id),submitIndex=state.events.findIndex(e=>e.kind==='submit'&&e.detail===c.id),reviewIndex=state.events.findIndex(e=>e.kind==='review'&&e.detail.startsWith(c.id+':'));
  if(linkIndex<=submitIndex||reviewIndex>=0&&linkIndex>=reviewIndex)throw new Error('复算必须在提交证据后、复核前关联。');
 }
 return state;
}
export function parseWorkspace(textValue){if(typeof textValue!=='string'||new TextEncoder().encode(textValue).length>1000000)throw new Error('共建资料不能超过1MB。');const parsed=JSON.parse(textValue);if(parsed?.schemaVersion===1){if(parsed.analysisRecords!==undefined&&(!Array.isArray(parsed.analysisRecords)||parsed.analysisRecords.length))throw new Error('旧版资料不能含复算关联。');parsed.schemaVersion=WORKSPACE_VERSION;parsed.analysisRecords=[];}return assertWorkspace(parsed);}
export function serializeWorkspace(state){assertWorkspace(state);const text=JSON.stringify(state,null,2);if(new TextEncoder().encode(text).length>1000000)throw new Error('共建资料已超过1MB，请导出当前资料归档后建立新的工作台。');return text;}
const csvCell=value=>{let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function contributionsCSV(state){assertWorkspace(state);return '\uFEFF'+[['贡献编号','任务','贡献者','修订','状态','模型版本','证据来源','结论影响','复核者','积分（手工登记）','参与本地预演'],...state.contributions.map(c=>{const p=state.pointRecords.find(p=>p.contributionId===c.id);return [c.id,c.taskId,c.contributor,c.revision,STATUS_LABELS[c.status],c.modelVersion,c.source,c.impact,c.reviews.at(-1)?.reviewer??'',p?.pointsMicro/1e6||'',p?.active?'是':'否'];})].map(row=>row.map(csvCell).join(',')).join('\r\n');}
