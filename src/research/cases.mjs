import {createScenario,MODEL_VERSION} from '../model/scenario.mjs';
import {compare} from '../model/economics.mjs';

export const RESEARCH_CASES = [
 {id:'mixed-no-demand',title:'不计需量费用',description:'先检查相同参数的两类系统是否得到相同结果。',rate:0},
 {id:'mixed-demand-40-peak',title:'计入假设需量费40元',description:'在平价窗口摊平充电后，检查完整计费能否改变回本判断。',rate:40},
 {id:'tight-window',title:'充电窗口只有1小时',description:'先确认任务可行，再讨论长期费用。',rate:0}
];
export function caseScenario(id){
 const definition=RESEARCH_CASES.find(c=>c.id===id);
 if(!definition)throw new Error('未知研究案例。');
 const s=createScenario();s.title=definition.title;s.preset='custom';
 s.common.dispatchPolicy='min-peak';s.common.monthlyDemandRate=definition.rate;
 if(id==='tight-window')s.common.chargeUntilHour=1;
 return s;
}
export function runResearchCase(id){const scenario=caseScenario(id);return {schemaVersion:1,caseId:id,modelVersion:MODEL_VERSION,classification:'conditional-simulation',scenario,result:compare(scenario)};}
