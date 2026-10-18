import fs from 'node:fs/promises';
import path from 'node:path';
import {createScenario,MODEL_VERSION,SOURCES} from '../src/model/scenario.mjs';
import {compare,sensitivity,toCSV} from '../src/model/economics.mjs';
const root=path.resolve(import.meta.dirname,'..');
await fs.mkdir(path.join(root,'evidence'),{recursive:true});
const s=createScenario(),result=compare(s);
await fs.writeFile(path.join(root,'data','demonstration-scenario.json'),JSON.stringify(s,null,2));
await fs.writeFile(path.join(root,'data','profile-template.csv'),'hour,price,load_kw\n'+s.profile.hours.map(h=>`${h.hour},${h.price},${h.loadKw}`).join('\n'));
await fs.writeFile(path.join(root,'evidence','baseline-result.json'),JSON.stringify({modelVersion:MODEL_VERSION,researchDate:'2026-10-14',scenario:s,result,sources:SOURCES,sensitivity:sensitivity(s)},null,2));
for(const system of result.systems){await fs.writeFile(path.join(root,'evidence',`${system.id}-cashflow.csv`),toCSV(system.yearly,['year','chargingCost','auxiliaryCost','demandCost','maintenanceCost','replacementCost','replacementPV','terminalCost','avoidedGridCost','deliveredACKWh','costPV','benefitPV','netCashFlow','cumulativeCostPV']));await fs.writeFile(path.join(root,'evidence',`${system.id}-hourly.csv`),toCSV(system.day.hours,['hour','price','loadKw','chargeGridKWh','deliveredACKWh','auxGridKWh','gridImportKWh','storedBeforeDC','storedAfterDC','reserveDC','socFraction','energyBalanceError']));}
const constrained=structuredClone(s);constrained.common.chargeUntilHour=1;
await fs.writeFile(path.join(root,'evidence','infeasible-scenario-result.json'),JSON.stringify({scenario:constrained,result:compare(constrained)},null,2));
console.log(JSON.stringify({modelVersion:MODEL_VERSION,comparable:result.comparable,defaultDifference:result.difference,boundary:result.boundary.value,tco:result.systems[0].tcoPV,npv:result.systems[0].npv,files:await fs.readdir(path.join(root,'evidence'))}));
