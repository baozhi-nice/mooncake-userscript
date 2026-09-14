import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

assert.match(source, /'name', 'koukouHourly', 'bidHourly', 'undercutHourly', 'undercutProfit'/, 'the right-one hourly wage must be sortable');
assert.match(source, /grid-column:2 \/ span 6;[\s\S]{0,500}?当前右一[\s\S]{0,300}?右一工时/, 'the desktop header must place the two right-one columns in the KouKou group');
assert.match(source, /const bid = Number\(marketData\.marketData\?\.\[itemHrid\]\?\.\[String\(enhancementLevel\)\]\?\.b\);/, 'the scanner must read the live best bid');
assert.match(source, /const bidResult = calcHourlyWageAndMetrics\([\s\S]{0,240}?bid,[\s\S]{0,100}?includeRoutePair: false/, 'right-one hourly wage must use the shared route calculation without an unnecessary route-pair comparison');
assert.match(source, /bid,\s*bidHourlyWage,\s*bidEvaluation,\s*undercutPrice/, 'right-one metrics must be retained for the rendered row');
assert.match(source, /mooncakeFormatBargainPrice\(row\.bid, '#9CDCF5'\)[\s\S]{0,180}?row\.bidHourlyWage/, 'desktop rows must render the right-one price and its hourly wage');
assert.match(source, /'当前右一 \/ 工时'[\s\S]{0,220}?row\.bidHourlyWage/, 'mobile cards must also expose the right-one metric');

console.log('KouKou right-one checks passed.');
