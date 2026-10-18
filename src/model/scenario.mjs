export const MODEL_VERSION = '0.2.0';
export const SOURCES = [
 {id:'official-topic',title:'04题官方说明',url:'https://1836.online/projects/cmujvb96f000z3jo188jx0xjp',supports:'15,000次、−30℃题设与五项经济比较；适用对象待澄清'},
 {id:'official-rules',title:'官网赛程与评审机制',url:'https://1836.online/points-and-revenue',supports:'平台留痕、单页PPT、分组与归集节点'},
 {id:'doe-method',title:'美国能源部储能成本与性能评价',url:'https://www.energy.gov/cmei/2022-grid-energy-storage-technology-cost-and-performance-assessment',supports:'充电、运维、更换、退役费用及循环与日历寿命的方法框架，不提供本工具的产品参数'},
 {id:'catl-sodium',title:'宁德时代2026年钠电场站公告',url:'https://www.catl.com/news/10052.html',supports:'厂商披露：15,000次对应25℃，容量保持率对应−20℃；不能替代−30℃测试或配对产品数据'},
 {id:'hongying',title:'宏英智能2026年7月24日投资者记录',url:'https://static.cninfo.com.cn/finalpage/2026-07-24/1225441968.PDF',supports:'第3页披露钠电电芯当前成本与理论长期成本判断；不是成套AIDC采购报价'},
 {id:'nature-cost',title:'Nature Energy钠电成本竞争力研究',url:'https://www.nature.com/articles/s41560-024-01701-9',supports:'2025年电芯成本情景研究；能量密度、材料与供应链影响结果，不涵盖本工具系统服务成本'},
 {id:'iea-sodium',title:'IEA钠电发展与约束分析',url:'https://www.iea.org/commentaries/sodium-ion-battery-momentum-grows-but-challenges-remain',supports:'2026年产业背景与低温应用潜力，不提供配对AIDC参数'},
 {id:'delta-ups',title:'台达LBM磷酸铁锂UPS电池系统',url:'https://www.deltapowersolutions.com/en/mcis/lbm-series-ups-battery-system-introduction.php',supports:'10—30分钟短时备电的产品用途；不是−30℃倍率、寿命或报价依据'},
];
export function createScenario() {
 const technology = {pricePerKWh:700,replacementPricePerKWh:500,roundTripEfficiency:0.9,calendarLifeYears:15,cycleLife:15000,coldCapacityFactor:0.9,dischargeC:0.5,chargeC:0.5,annualOM:20000,auxKWhPerDay:32};
 return {
  schemaVersion:1,title:'寒冷地区AIDC园区',preset:'cold',interpretation:'common',
  provenance:{classification:'demonstration',researchDate:'2026-10-14',description:'除官方题设外均为演示假设；无真实AIDC运行数据或同口径产品报价。'},
  common:{ratedPowerKw:1000,targetDeliveryKWh:2000,backupMinutes:15,projectYears:20,discountRate:0.05,operatingDays:365,designTemperatureC:-30,depthOfDischarge:0.9,endOfLifeFraction:0.8,lifeTestDoD:0.9,chargeUntilHour:8,gridImportLimitKw:2200,monthlyDemandRate:0,dispatchPolicy:'energy-first',pcsPricePerKw:200,pcsLifeYears:15,otherInitialCost:180000,replacementFixedCost:20000,decommissionCost:20000,residualValue:0},
  batteries:[{id:'sodium',name:'钠电',...technology},{id:'lfp',name:'磷酸铁锂',...technology,cycleLife:6000}],
  profile:{kind:'synthetic',description:'24小时演示日，重复用于年度测算；没有模拟全年天气。',hours:Array.from({length:24},(_,hour)=>({hour,price:hour<8?0.3:hour<16?0.55:hour<22?0.85:0.55,loadKw:1000}))}
 };
}
export function parameterRegister(scenario) {
 const rows=[{parameter:'题设：循环次数',value:15000,unit:'次',classification:'题设',source:'official-topic',scope:'测试温度、倍率、DoD、容量终点及两类系统适用范围未明确'}, {parameter:'题设：设计温度',value:scenario.common.designTemperatureC,unit:'℃',classification:'题设',source:'official-topic',scope:'正常充放电不等于无容量、效率或功率损失'}];
 for(const [key,value] of Object.entries(scenario.common)) if(key!=='designTemperatureC') rows.push({parameter:key,value,classification:'演示假设或用户输入，未核验',scope:key==='monthlyDemandRate'?'增量实际峰值需量计费；假设代表日峰值每月出现，非容量计费合同。旧场景缺省为0':key==='dispatchPolicy'?'energy-first为低价优先；min-peak先求最小充电峰值再低价优先；不是任意电价下的经济最优证明':'场景/共同参数，不代表行业均值'});
 if(scenario.common.monthlyDemandRate==null)rows.push({parameter:'monthlyDemandRate',value:0,classification:'兼容旧场景缺省',scope:'旧版未计需量费用，本版显式采用0'});
 if(scenario.common.dispatchPolicy==null)rows.push({parameter:'dispatchPolicy',value:'energy-first',classification:'兼容旧场景缺省',scope:'旧版低价优先调度'});
 for(const battery of scenario.batteries) for(const [key,value] of Object.entries(battery)) if(!['id','name'].includes(key)) {const applied=key==='cycleLife'&&(battery.id==='sodium'||scenario.interpretation==='common')?15000:value;rows.push({parameter:`${battery.name}.${key}`,value:applied,inputValue:value,classification:key==='cycleLife'&&(battery.id==='sodium'||scenario.interpretation==='common')?'题设解释':'演示假设或用户输入，未核验',scope:key==='cycleLife'?'本列为实际生效值；common模式双方统一15,000，sodium-only模式LFP采用独立输入':'电池侧费用与产品性能假设；没有厂商确认'});}
 rows.push({parameter:'逐时电价与负载',value:scenario.profile.kind,classification:'用户输入，未核验',scope:scenario.profile.description});
 return rows;
}
