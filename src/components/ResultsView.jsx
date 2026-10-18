import React,{useMemo} from 'react';
import {CostChart} from './Charts.jsx';
import {fmt,downloadFile} from '../io.mjs';
import {sensitivity,toCSV} from '../model/economics.mjs';
const LABELS=[['initial','初始投入'],['energy','充电与辅助用电'],['demand','增量需量费用'],['maintenance','运维'],['replacements','电池与设备更换'],['terminal','退役与残值'],['tcoPV','费用合计']];
export default function ResultsView({result,scenario}){
 const [na,lfp]=result.systems;
 const grid=useMemo(()=>sensitivity(scenario),[scenario]);
 const verdict=result.preferred==='equal'?'两类系统在相同假设下费用相同':result.preferred==='sodium'?'本场景下，钠电的长期费用较低。':result.preferred==='lfp'?'本场景下，磷酸铁锂的长期费用较低。':'当前供电任务未满足，请先检查运行约束。';
 return <div className="results-stack">
  <section className="metrics-panel" aria-label="比较结果">
   <div><span>长期费用差额</span><strong data-testid="cost-difference">{result.comparable?fmt(result.difference/10000):'不可比较'}<small>{result.comparable?'万元':''}</small></strong></div>
   <div><span>钠电报价分界</span><strong data-testid="price-boundary">{result.boundary.status==='found'?fmt(result.boundary.value,0):'暂无'}<small>{result.boundary.status==='found'?'元/kWh':''}</small></strong></div>
   <div><span>应急备用电量</span><strong>{fmt(na.day.reserveAC,0)}<small>kWh</small></strong></div>
  </section>
  <section className="surface chart-panel"><div className="section-heading"><div><h2>累计费用</h2><p className="helper" data-testid="verdict">{verdict}</p></div><div className="legend"><span><i className="swatch sodium"/>钠电</span><span><i className="swatch lfp"/>磷酸铁锂</span></div></div><CostChart systems={result.systems} years={scenario.common.projectYears}/></section>
  <section className="surface cost-panel"><h2>费用拆分</h2><div className="table-scroll"><table><caption className="sr-only">按现值口径计算，单位万元</caption><thead><tr><th>项目</th><th>钠电</th><th>磷酸铁锂</th><th>差额</th></tr></thead><tbody>{LABELS.map(([key,label])=>{const a=key==='tcoPV'?na.tcoPV:na.breakdown[key],b=key==='tcoPV'?lfp.tcoPV:lfp.breakdown[key];return <tr key={key} className={key==='tcoPV'?'total-row':''}><th scope="row">{label}</th><td>{fmt(a/10000)}</td><td>{fmt(b/10000)}</td><td>{fmt((a-b)/10000)}</td></tr>;})}</tbody></table></div>
   <p className="helper">单位：万元，按现值口径。费用差额＝钠电−磷酸铁锂。采购分界仅改变钠电初始单价。</p>
   <div className="result-details">{result.systems.map(s=><div key={s.id}><h3>{s.name}</h3><dl>
    <div><dt>配置容量</dt><dd>{fmt(s.day.nominalKWh,1)} kWh</dd></div>
    <div><dt>容量约束</dt><dd>{s.day.sizingConstraint==='power'?'放电功率':s.day.sizingConstraint==='energy'?'交付与备用电量':'功率与电量'}</dd></div>
    <div><dt>净现值</dt><dd>{s.feasible?fmt(s.npv/10000)+' 万元':'任务未满足'}</dd></div>
    <div><dt>储能度电成本</dt><dd>{!s.feasible?'任务未满足':s.lcos==null?'无放电量，未计算':fmt(s.lcos,3)+' 元/kWh'}</dd></div>
    <div><dt>电池更换周期</dt><dd>{fmt(s.replacementInterval,2)} 年（{s.replacementBinding==='calendar'?'日历':s.replacementBinding==='cycle'?'循环':'共同'}约束）</dd></div>
    <div><dt>购电峰值</dt><dd>{fmt(s.day.gridPeakKw,1)} kW</dd></div>
    <div><dt>备电年化费用</dt><dd>{!s.feasible?'任务未满足':s.annualCostPerReservedKw==null?'未承担备用':fmt(s.annualCostPerReservedKw,1)+' 元/kW·年'}</dd></div>
    <div><dt>回本所需额外年收益</dt><dd>{s.feasible?fmt(s.requiredAnnualUnmodelledBenefit/10000)+' 万元':'任务未满足'}</dd></div>
   </dl></div>)}</div>
   <p className="helper">备电年化费用为整个系统费用按保护功率分摊，兼用时包含日常调度费用。额外年收益是回本条件，未假定停电损失已被避免。需量费以每月出现代表日峰值计算。</p>
   <button className="text-button" onClick={()=>{const rows=result.systems.flatMap(s=>s.yearly.map(y=>({technology:s.name,...y})));downloadFile('cashflow.csv',toCSV(rows,['technology','year','chargingCost','auxiliaryCost','demandCost','maintenanceCost','replacementCost','replacementPV','terminalCost','avoidedGridCost','deliveredACKWh','costPV','benefitPV','netCashFlow','cumulativeCostPV']),'text/csv;charset=utf-8');}}>下载现金流CSV</button>
  </section>
  <section className="surface boundary-panel"><h2>采购边界检验</h2><p className="helper">只改变钠电初始报价与往返效率，格内为长期费用差额（万元）。绿色为钠电费用较低。</p><div className="table-scroll"><table className="heatmap"><thead><tr><th>效率 / 单价</th>{grid[0].map(p=><th key={p.price}>{p.price}元</th>)}</tr></thead><tbody>{grid.map(row=><tr key={row[0].efficiency}><th>{fmt(row[0].efficiency*100,0)}%</th>{row.map(p=><td key={p.price} className={p.difference==null?'':p.difference<0?'advantage':'disadvantage'}>{p.difference==null?'不可比较':fmt(p.difference/10000,1)}</td>)}</tr>)}</tbody></table></div></section>
 </div>;
}
