import test from 'node:test';
import assert from 'node:assert/strict';
import {caseScenario,runResearchCase} from '../src/research/cases.mjs';
test('研究案例复现路演中的两项条件净现值',()=>{for(const [id,expected] of [['mixed-no-demand',436494.70746435504],['mixed-demand-40-peak',-1233109.152826869]]){const r=runResearchCase(id);for(const s of r.result.systems)assert.ok(Math.abs(s.npv-expected)<.01);assert.equal(r.result.preferred,'equal');}});
test('不可行案例不输出采购胜者且案例之间互不修改',()=>{const a=caseScenario('mixed-no-demand');a.common.monthlyDemandRate=999;assert.equal(caseScenario('mixed-no-demand').common.monthlyDemandRate,0);const r=runResearchCase('tight-window');assert.equal(r.result.comparable,false);assert.equal(r.result.preferred,null);assert.equal(r.result.boundary.status,'infeasible');});
