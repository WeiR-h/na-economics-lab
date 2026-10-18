import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createWorkspace,claimTask,submitEvidence,reviewEvidence,addPlatformPoints,addCommercialEntry,confirmCommercialEntry,commercialSummary,distributionTrial,serializeWorkspace} from '../src/cobuild/workspace.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'evidence/cobuild-v0.3');
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(root,'data/cobuild-empty-workspace.json'),serializeWorkspace(createWorkspace()));
let state=createWorkspace();state.dataStatus='rehearsal';
const at='2026-10-14T08:00:00.000Z';
for(const [task,contributor,points] of [['model-review','演练贡献者甲','1'],['power-curves','演练贡献者乙','3']]){
 state=claimTask(state,task,contributor,at);
 state=submitEvidence(state,task,{contributor,summary:'本地流程演练夹具，不代表外部证据或真实共建。',source:'https://1836.online/points-and-revenue',impact:'检查共建状态与分配算法，经济模型参数未更改。',modelVersion:'0.2.0',shareAllowed:true},at);
 const contributionId=state.contributions.at(-1).id;
 state=reviewEvidence(state,contributionId,{reviewer:'演练复核者',decision:'accept',checks:[true,true,true],note:'本地演练复核，不是实际独立验证。'},at);
 state=addPlatformPoints(state,{contributionId,points,reference:'https://1836.online/points-and-revenue',recordedBy:'演练登记者'},at);
}
state=addCommercialEntry(state,{kind:'income',status:'pending',amount:'100',memo:'演练收入，未实际发生',reference:'REHEARSAL-PENDING',recordedBy:'演练登记者'},at);
assert.equal(commercialSummary(state).incomeCents,0);
state=confirmCommercialEntry(state,state.commercialEntries[0].id,{recordedBy:'演练确认人',reference:'REHEARSAL-ONLY-NOT-RECEIPT'},at);
state=addCommercialEntry(state,{kind:'expense',status:'recorded',amount:'20',memo:'演练费用，非实际账单',reference:'REHEARSAL-ONLY-NOT-RECEIPT',recordedBy:'演练登记者'},at);
const summary=commercialSummary(state),trial=distributionTrial(state,'80');
assert.equal(summary.balanceCents,8000);const allocation=Object.fromEntries(trial.rows.map(x=>[x.contributor,x.amountCents]));assert.equal(allocation['演练贡献者甲'],2000);assert.equal(allocation['演练贡献者乙'],6000);assert.equal(trial.settlement,false);
await fs.writeFile(path.join(out,'rehearsal-workspace.json'),serializeWorkspace(state));
await fs.writeFile(path.join(out,'rehearsal-result.json'),JSON.stringify({author:'WeiR-h',toolVersion:'0.3.0',evidenceType:'local-rehearsal-not-platform-or-business-proof',summary,trial,actualExternalParticipants:0,actualOperatingIncomeRMB:0,platformSync:false,settlement:false},null,2));
console.log(JSON.stringify({toolVersion:'0.3.0',taskCount:5,rehearsalBalanceRMB:80,rehearsalAllocationRMB:Object.fromEntries(trial.rows.map(x=>[x.contributor,x.amountCents/100])),actualOperatingIncomeRMB:0,settlement:false}));
