import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const register = JSON.parse(await fs.readFile(path.join(root, 'data/product-price-register-2026-10-14.json'), 'utf8'));
const lfp = register.products.find(p => p.id === 'cospowers-lfp');
const na = register.products.find(p => p.id === 'cospowers-na');
const taskKW = 1000;
const screened = [lfp, na].map(p => {
  const cabinets = Math.ceil(taskKW / p.listed15MinutePowerKW);
  return {
    id: p.id, sku: p.sku,
    powerKWPerCabinetFor15Minutes: p.listed15MinutePowerKW,
    cabinetsAtCatalogueConditions: cabinets,
    aggregateListedPowerKW: cabinets * p.listed15MinutePowerKW,
    aggregateListedEnergyKWh: cabinets * p.listedEnergyKWh,
    cabinetBaseAreaM2: cabinets * p.dimensionsMm[0] * p.dimensionsMm[1] / 1e6,
    validForMinus30C: false,
    acSideEOLTaskFeasibilityConfirmed: false
  };
});
const prices = register.publicPrices.map(p => ({
  ...p, durationHours: p.energyMWh / p.powerMW,
  derivedRMBPerKWh: p.totalRMB / (p.energyMWh * 1000),
  derivedRMBPerWh: p.totalRMB / (p.energyMWh * 1e6)
}));
const pureInitialCabinetPriceRatioBoundary = screened[0].cabinetsAtCatalogueConditions / screened[1].cabinetsAtCatalogueConditions;
const out = {
  author: register.author, researchRevision: register.researchRevision, date: register.retrievedOn,
  task: {powerKW: taskKW, minutes: 15, scope: '厂商15分钟功率表的整柜数量初筛，尚未保证交流侧、EOL、−30℃、冗余与UPS接口'},
  screened,
  pureInitialCabinetPriceRatioBoundary,
  boundaryMeaning: '仅在原表功率可用、柜价供货边界一致及其他费用相同的条件下，9柜钠电总柜价低于5柜LFP需Na单柜价/LFP单柜价<5/9。不是本任务完整TCO或实际成交结论。',
  prices,
  awardNaToLFPRMBPerKWhRatio: prices[0].derivedRMBPerKWh / prices[1].derivedRMBPerKWh,
  batteryOnlyModelPricesUpdated: false,
  modelCalibrationComplete: false
};
const assertions = [];
function check(name, fn) { fn(); assertions.push({name, passed: true}); }
check('LFP minimum cabinet count and one-less infeasibility', () => {assert.equal(screened[0].cabinetsAtCatalogueConditions, 5);assert.ok(4 * lfp.listed15MinutePowerKW < taskKW);});
check('Na minimum cabinet count and one-less infeasibility', () => {assert.equal(screened[1].cabinetsAtCatalogueConditions, 9);assert.ok(8 * na.listed15MinutePowerKW < taskKW);});
check('Per-cabinet quote boundary', () => assert.equal(pureInitialCabinetPriceRatioBoundary, 5 / 9));
check('Na award normalization', () => assert.equal(prices[0].derivedRMBPerKWh, 1035.4055));
check('LFP award normalization', () => assert.equal(prices[1].derivedRMBPerKWh, 518));
check('Secondary reported total cannot yield 518 RMB/kWh', () => assert.equal(194616000 / 360000, 540.6));
check('Both awards are four-hour systems', () => prices.forEach(p => assert.equal(p.durationHours, 4)));
check('Operating temperature does not use storage temperature', () => {assert.equal(na.operatingAmbientC[0], -20);assert.equal(na.storageC[0], -40);assert.ok(na.operatingAmbientC[0] > -30);});
check('No integrated award becomes battery-only price', () => prices.forEach(p => assert.equal(p.admittedAsBatteryOnlyModelInput, false)));
check('LFP nominal field discrepancy retained', () => {assert.equal(lfp.nominalVoltageV * lfp.nominalAh / 1000, 65.28);assert.notEqual(65.28, lfp.listedEnergyKWh);});
const target = path.join(root, 'evidence/product-prices-2026-10-14');
await fs.mkdir(target, {recursive: true});
await fs.writeFile(path.join(target, 'screening-results.json'), JSON.stringify(out, null, 2));
await fs.writeFile(path.join(target, 'arithmetic-verification.json'), JSON.stringify({author: register.author, assertions, count: assertions.length, input: 'data/product-price-register-2026-10-14.json', evidenceType: 'public-source-arithmetic-not-field-test'}, null, 2));
console.log(JSON.stringify({cabinetCounts: screened.map(p => p.cabinetsAtCatalogueConditions), pricesRMBPerKWh: prices.map(p => p.derivedRMBPerKWh), assertions: assertions.length, modelCalibrationComplete: false}));
