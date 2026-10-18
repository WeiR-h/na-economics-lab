"""Render conditional research figures from the exported deterministic model results."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'figures'
OUT.mkdir(parents=True,exist_ok=True)
data=json.loads((ROOT/'evidence/research-v1/research-results.json').read_text(encoding='utf-8'))
font_manager.fontManager.addfont(r'C:\Windows\Fonts\msyh.ttc')
plt.rcParams.update({'font.family':'Microsoft YaHei','axes.unicode_minus':False,'font.size':12,'axes.spines.top':False,'axes.spines.right':False,'savefig.dpi':260})
green='#155a46'; slate='#71819a'; ink='#20342c'
def save(fig,name):
    fig.savefig(OUT/(name+'.png'),facecolor='white',bbox_inches='tight')
    fig.savefig(OUT/(name+'.svg'),facecolor='white',bbox_inches='tight')
    plt.close(fig)

fig,ax=plt.subplots(figsize=(10,5))
for policy,label,color in [('energy-first','低价优先补电',slate),('min-peak','先降低充电峰值',green)]:
    rows=[r for r in data['demandSweep'] if r['policy']==policy]
    ax.plot([r['monthlyDemandRate'] for r in rows],[r['npv']/10000 for r in rows],label=label,color=color,lw=2.5)
    r40=next(r for r in rows if r['monthlyDemandRate']==40)
    ax.scatter([40],[r40['npv']/10000],color=color,s=40,zorder=4)
    ax.annotate(f"{r40['npv']/10000:.2f}万元",(40,r40['npv']/10000),xytext=(12,10),textcoords='offset points',color=color)
ax.axhline(0,color='#9ba8a1',lw=1)
ax.axvline(10.457443657041345,color=green,lw=1,ls=':')
ax.text(12,40,'最小峰值回本界限：10.46',fontsize=11,color=green)
ax.set(xlabel='假设月需量单价（元/kW·月）',ylabel='20年条件性净现值（万元）',xlim=(0,60))
ax.set_title('需量费用与充电策略可以改变项目回本',loc='left',fontweight='bold',color=ink,pad=20)
ax.grid(axis='y',alpha=.15);ax.legend(frameon=False,loc='lower left')
fig.text(.125,-.025,'条件模拟：1MW，2MWh/日，15分钟备用，20年，5%折现；两类电池相同假设。40元不是实际电价。',fontsize=10,color='#66766c')
save(fig,'demand-npv')

fig,ax=plt.subplots(figsize=(10,5))
rows=[r for r in data['standbySweep'] if r['backupMinutes']==15]
x=np.arange(len(rows));vals=[r['nominalKWh'] for r in rows]
bars=ax.bar(x,vals,color=[green if r['sizingConstraint']=='energy' else slate for r in rows],width=.58)
for bar,value in zip(bars,vals):ax.text(bar.get_x()+bar.get_width()/2,value+110,f'{value:,.0f}',ha='center',fontsize=13,color=ink)
ax.set_xticks(x,[f"{r['dischargeC']:g}C" for r in rows])
ax.set(xlabel='假设有效放电倍率',ylabel='所需标称DC容量（kWh）',ylim=(0,6900))
ax.axhline(406.6715097953162,color=green,linestyle=':',lw=1)
ax.text(3.65,960,'3.6C为功率/能量\n配置分界',ha='center',fontsize=11,color=green)
ax.set_title('1MW、15分钟纯备电：低倍率会放大配置容量',loc='left',fontweight='bold',color=ink,pad=20)
ax.grid(axis='y',alpha=.15)
fig.text(.125,-.025,'条件模拟：DoD90%、EOL80%、容量系数90%、RTE90%。倍率是反事实输入，未赋予任何实际产品。',fontsize=10,color='#66766c')
save(fig,'standby-capacity')

fig,ax=plt.subplots(figsize=(8,5.8))
levels=[.7,.8,.9,1]
z=np.array([[next(r['priceBoundary'] for r in data['boundarySweep'] if r['naCold']==na and r['lfpCold']==lfp) for lfp in levels] for na in levels])
im=ax.imshow(z,cmap='YlGn',vmin=275,vmax=1288,origin='lower',aspect='auto')
for i in range(4):
    for j in range(4):ax.text(j,i,f'{z[i,j]:.0f}',ha='center',va='center',fontsize=16,color='white' if z[i,j]>950 else ink)
ax.set_xticks(range(4),['70%','80%','90%','100%']);ax.set_yticks(range(4),['70%','80%','90%','100%'])
ax.set(xlabel='LFP假设低温容量系数',ylabel='Na假设低温容量系数')
ax.set_title('钠电初始电池采购分界（元/kWh标称DC）',loc='left',fontweight='bold',color=ink,pad=20)
cb=fig.colorbar(im,ax=ax,pad=.035);cb.set_label('初始电池单价分界（元/kWh）')
fig.text(.125,-.03,'LFP初始700元、双方替换500元，其余参数相同。系数无配对测试依据；仅改变Na初始单价。',fontsize=10,color='#66766c')
save(fig,'cold-price-boundary')
print(json.dumps({'figures':3,'source':'evidence/research-v1/research-results.json','format':['PNG','SVG'],'dataStatus':'conditional-simulation'},ensure_ascii=False))
