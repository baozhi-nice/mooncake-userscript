import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

function extractFunction(name) {
    const marker = `function ${name}(`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `${name} must exist`);
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unable to extract ${name}`);
}

assert.match(source, /const MOONCAKE_MOBILE_MARKET_HELPER_Z_INDEX = '802';/, 'the mobile helper must sit above the native compact-market modal');
assert.match(source, /const MOONCAKE_MOBILE_MARKET_HELPER_MENU_Z_INDEX = '803';/, 'the mobile helper menu must remain above its launcher');
assert.match(source, /function mooncakePositionAndRevealMobileJumpBar\(bar, currentItem\)[\s\S]{0,220}?bar\.style\.visibility = positioned \? 'visible' : 'hidden';/, 'the mobile helper must remain hidden until its measured position is available');
assert.match(source, /left: '-9999px',[\s\S]{0,160}?top: '-9999px',[\s\S]{0,160}?visibility: 'hidden'/, 'a newly inserted mobile helper must never paint from the document origin');
assert.match(source, /mooncakePositionAndRevealMobileJumpBar\(bar, currentItem\);/, 'both new and retained mobile helpers must reveal only after positioning');

assert.match(source, /\.mooncake-market-history-price-cell',\s*'\.mooncake-market-history-hourly-cell'/, 'range and hourly cells must both be tooltip targets');
assert.match(source, /data-mooncake-history-detail-trigger="range"/, 'the min\/max cell must opt out of mobile-card dismissal');
assert.match(source, /data-mooncake-history-detail-trigger="hourly"/, 'the hourly cell must opt out of mobile-card dismissal');
assert.match(source, /function mooncakeStartMobileMarketHistoryDrag\(event\)[\s\S]{0,900}?const card = event\.target\?\.closest\?\.\(`#\$\{MOONCAKE_MARKET_HISTORY_MOBILE_ID\}`\)/, 'mobile drag must begin from the card instead of a dedicated handle');
assert.match(source, /touchAction: expanded \? 'none' : 'manipulation'/, 'an expanded mobile card must claim touch movement for whole-card dragging');
assert.match(source, /const mobileCard = target\.closest\?\.\(`#\$\{MOONCAKE_MARKET_HISTORY_MOBILE_ID\}`\);[\s\S]{0,900}?mooncakeRenderMobileMarketHistoryLauncher/, 'a non-interactive mobile-card tap must collapse the card');

assert.match(source, /function mooncakeFormatArchiveRecordCompactTime\(timestamp\)/, 'archive records need a compact mobile time formatter');
const compactTimeSandbox = {};
vm.runInNewContext(`${extractFunction('mooncakeFormatArchiveRecordCompactTime')}\nglobalThis.format = mooncakeFormatArchiveRecordCompactTime;`, compactTimeSandbox);
assert.match(compactTimeSandbox.format('2026-09-10T01:13:44.000Z'), /^\d{2}\/\d{2} \d{2}:\d{2}$/, 'the compact archive time must fit a mobile button');
assert.match(source, /data-mooncake-order-archive-record-compact-label/, 'archive buttons must render a dedicated compact label');
assert.match(source, /\[data-mooncake-order-archive-page-body\] \{ grid-template-rows:64px minmax\(0,1fr\); \}/, 'the mobile archive rail must not reserve a large empty area');
assert.match(source, /\[data-mooncake-order-archive-sides\] \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\) !important; gap:5px !important; \}/, 'the narrowest archive layout must retain side-by-side asks and bids');
assert.match(source, /\[data-mooncake-market-trade-log-filter="date-range"\] \{ flex:1 1 100%; \}/, 'the arbitrary date range must own a full mobile toolbar row');
assert.match(source, /\[data-mooncake-market-trade-log-date-range\] \{ grid-template-columns:auto minmax\(0,1fr\); gap:4px 6px; \}/, 'the narrowest layout must stack labeled datetime inputs');
assert.match(source, /data-mooncake-market-trade-log-date-boundary/, 'the stacked datetime inputs must keep visible start and end labels');
assert.match(source, /\[data-mooncake-market-trade-log-start-time\], #better-loot-tracker-config-panel \[data-mooncake-market-trade-log-end-time\] \{ height:34px; font-size:16px; \}/, 'mobile datetime inputs must avoid iOS focus zoom');

console.log('Mobile market layout checks passed.');
