import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

assert.match(
    source,
    /function mooncakeBindNonNegativeHourlyInput\(input\) \{[\s\S]{0,900}?text\.startsWith\('-'\)/,
    'hourly inputs must normalize pasted negative values'
);
assert.match(
    source,
    /function mooncakeBindNonNegativeHourlyInput\(input\) \{[\s\S]{0,1300}?(?:event\.key === '-'|event\.key === 'Subtract')/,
    'hourly inputs must reject typed negative values'
);
assert.match(
    source,
    /function setChatLaborExpectedHourlyM\(side, value\) \{[\s\S]{0,650}?numeric < MOONCAKE_ORDER_TARGET_HOURLY_MIN_M[\s\S]{0,260}?numeric > MOONCAKE_ORDER_TARGET_HOURLY_MAX_M/,
    'chat hourly threshold persistence must reject negative values'
);
assert.match(
    source,
    /function getChatLaborSellExpectedHourlyWage\(\) \{[\s\S]{0,420}?Math\.max\(MOONCAKE_ORDER_TARGET_HOURLY_MIN_M, expectedM\)/,
    'saved negative chat sale thresholds must be clamped before display or use'
);
assert.match(
    source,
    /function getChatLaborBuyExpectedHourlyWage\(\) \{[\s\S]{0,420}?Math\.max\(MOONCAKE_ORDER_TARGET_HOURLY_MIN_M, expectedM\)/,
    'saved negative chat buy thresholds must be clamped before display or use'
);
assert.ok(
    source.includes("mooncakeBindNonNegativeHourlyInput(panel.querySelector('[data-mooncake-koukou-target-hourly]'))"),
    'the KouKou target input must receive the shared nonnegative guard'
);
assert.match(
    source,
    /data-mooncake-chat-labor-expected="sell"[\s\S]{0,50}?type="number"|type="number"[\s\S]{0,260}?data-mooncake-chat-labor-expected="sell"/,
    'chat sale threshold UI must be a bounded numeric field'
);
assert.match(
    source,
    /mooncakeBindNonNegativeHourlyInput\(threshold\)/,
    'hourly colour-tier thresholds must use the same negative-value guard'
);

console.log('Nonnegative hourly input checks passed.');
