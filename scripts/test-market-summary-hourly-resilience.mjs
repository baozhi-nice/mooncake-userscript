import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

const summaryStart = source.indexOf('function addHourlyWageToMarketplaceSummary(');
const summaryEnd = source.indexOf('\n    function mooncakeShouldIgnoreMarketplaceClick(', summaryStart);
assert.notEqual(summaryStart, -1, 'summary hourly renderer must exist');
assert.notEqual(summaryEnd, -1, 'summary hourly renderer must have a stable boundary');
const summaryRenderer = source.slice(summaryStart, summaryEnd);

assert.match(
    source,
    /function mooncakeEnsureMarketplaceSummaryHourlyWageHeaders\([\s\S]{0,1800}?header\.textContent = isZH \? '工时费'/,
    'summary headers must be created independently of the asynchronous wage calculation'
);
assert.match(
    source,
    /function mooncakeRenderMarketplaceSummaryHourlyWagePlaceholders\([\s\S]{0,2200}?sellCell\.textContent = bestAsk > 0 \? '…' : '-';[\s\S]{0,300}?buyCell\.textContent = bestBid > 0 \? '…' : '-';/,
    'summary rows must preserve visible placeholders while route data is prewarming'
);

const scaffoldIndex = summaryRenderer.indexOf('mooncakeRenderMarketplaceSummaryHourlyWagePlaceholders(');
const noDataRetryIndex = summaryRenderer.indexOf('if (!marketData) {', scaffoldIndex);
const prewarmIndex = summaryRenderer.indexOf('Promise.all([...new Set(prewarmItemHrids)]', scaffoldIndex);
assert.ok(scaffoldIndex >= 0, 'desktop summary renderer must render the column shell');
assert.ok(noDataRetryIndex > scaffoldIndex, 'missing market data must retain the already-rendered column shell');
assert.ok(prewarmIndex > scaffoldIndex, 'the worker prewarm must run after the shell is visible');
assert.match(
    summaryRenderer.slice(noDataRetryIndex, prewarmIndex),
    /mooncakeScheduleMarketplaceSummaryHourlyWageDataRetry\(table, itemHrid\)/,
    'missing market data must schedule a bounded recovery pass'
);
assert.match(
    summaryRenderer,
    /if \(renderGeneration === _summaryRenderGeneration\) \{[\s\S]{0,240}?return;[\s\S]{0,1800}?scheduleMarketplaceSummaryHourlyWageRefresh\(\{ force: true \}\)/,
    'a completed stale prewarm must wake the newest summary renderer'
);
assert.match(
    source,
    /state\.attempt >= MOONCAKE_SUMMARY_HOURLY_DATA_RETRY_DELAYS\.length/,
    'summary-data recovery must remain bounded when market data is unavailable'
);

console.log('Market summary hourly resilience checks passed.');
