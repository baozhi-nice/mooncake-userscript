import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { inflateRawSync, inflateSync, gunzipSync } from 'node:zlib';

const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
const extract = name => {
    const start = source.search(new RegExp(`    (?:async )?function ${name}\\(`));
    assert(start >= 0, `${name} exists`);
    const next = source.slice(start + 1).search(/\n    (?:async )?function /);
    return source.slice(start, next < 0 ? undefined : start + 1 + next);
};
const dataNames = ['mooncakeGetMarketHistoryHourlyVolume', 'processMarketHistory',
    'mooncakeAttachMarketHistoryTimeline', 'mooncakeFormatCompactNumber',
    'mooncakeFormatMarketHistoryHourlyVolume', 'mooncakeBuildMarketHistoryHourlyVolumeTooltip'];
const uiNames = ['mooncakeIsMarketHistoryEquipmentTarget', 'mooncakeBuildMarketHistoryOrderValue',
    'mooncakeBuildCompactMarketHistoryColGroup', 'mooncakeBuildMarketHistoryRows',
    'mooncakeBuildMarketHistoryHourlyRange', 'mooncakeBuildMarketHistoryMedianTitle',
    'mooncakeFormatHistoryPrice', 'mooncakeFormatMarketHistoryPrice', 'mooncakeEscapeHtml',
    'mooncakeGetMarketHistoryCardOrderPresentation', 'mooncakeBuildMarketHistoryCardHtml',
    'mooncakeStyleMarketHistoryCard', 'mooncakeApplyFloatingMarketHistoryLayout',
    'mooncakeGetMobileMarketHistoryCardWidth'];
const functions = [...dataNames, ...uiNames].map(extract).join('\n');
const now = Date.parse('2026-09-28T12:20:00Z');
const hourlyRows = (volume, count = 168) => Array.from({ length: count }, (_, index) => ({
    time: now / 1000 - index * 3600 - 60, v: volume, p: 520, a: 521, b: 519
}));
let columns = { average: true, median: true, volume: true, buySell: false, range: true, hourly: true };
const context = vm.createContext({
    console, URLSearchParams, AbortController, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return now; } },
    MOONCAKE_MARKET_HISTORY_WINDOWS: [1, 3, 7],
    MOONCAKE_MARKET_HISTORY_FLOAT_SELECTOR: '[data-mooncake-history-floating="1"]',
    isZH: true,
    mooncakeGetMarketHistoryPriceStats: () => ({ minPrice: 519, maxPrice: 521, medianPrice: 520, timeline: [] }),
    mooncakeMarketHistoryPriceTier: price => price,
    mooncakeEstimateMarketHistorySideVolumes: () => ({ buyVolume: 0, sellVolume: 0 }),
    mooncakeBuildMarketHistoryTimelinePoints: () => [],
    mooncakeBuildMarketHistoryTradeRecords: () => [],
    mooncakeIsEnhanceableItem: hrid => hrid === '/items/equipment',
    mooncakeGetMarketHistoryMobileColumns: () => columns,
    mooncakeIsMarketHistoryCardSellFirst: () => true,
    getMarketData: () => null
});
vm.runInContext(functions, context);
const rate = rows => context.mooncakeGetMarketHistoryHourlyVolume(rows, now);
const format = context.mooncakeFormatMarketHistoryHourlyVolume;
const full = hourlyRows(8400);
assert.equal(rate(full).volume, 1008000);
assert.equal(rate(full).hourlyVolume, 8400);
assert.equal(format(rate(full).hourlyVolume), '8.4K');
const sparse = hourlyRows(0); sparse[0].v = 12;
assert.equal(rate(sparse).hourlyVolume, 0.1, 'zero-trade hours remain in the 120-hour denominator');
assert.equal(format(rate(sparse).hourlyVolume), '0.1');
sparse[0].v = 1;
assert.equal(format(rate(sparse).hourlyVolume), '0.008', 'rare trades must not round to zero');
assert.equal(format(rate(hourlyRows(0)).hourlyVolume), '0');
assert.equal(format(rate([]).hourlyVolume), '—', 'missing data is different from observed zero volume');
assert.equal(rate(full.filter((_, i) => i !== 67)).complete, false, 'a missing middle hour is not silently counted as zero');
assert.equal(rate(full.slice(1)).complete, false, 'stale data cannot claim a complete rolling window');
assert.equal(rate(full.slice(0, 24)).complete, false, 'one day cannot be projected into a five-day rate');
assert.equal(rate([...full, ...full]).volume, 1008000, 'duplicate snapshots must not double volume');
assert.equal(rate([...full, { ...full[0], time: full[0].time + 30, v: 8500 }]).volume, 1008100,
    'a newer snapshot of the same hour replaces the old one');
assert.equal(rate([...full, { time: now / 1000 + 1, v: 9e9 }, { time: now / 1000 - 120 * 3600, v: 9e9 }]).volume,
    1008000, 'future and lower-boundary snapshots are outside the rolling interval');
for (const invalid of [null, undefined, '', -1, Infinity, NaN]) {
    const broken = hourlyRows(8400); broken[30].v = invalid;
    assert.equal(rate(broken).complete, false, `invalid volume ${invalid} is not a zero-volume hour`);
}
for (const [input, expected] of [[0, '0'], [10, '10'], [100, '100'], [50.25, '50.25'], [null, '—'], [NaN, '—']]) {
    assert.equal(format(input), expected);
}
const processed = context.processMarketHistory(full, { includeTimeline: true });
const enriched = context.mooncakeAttachMarketHistoryTimeline(processed.windows, processed.timeline);
assert.equal(enriched.hourlyVolume5d.hourlyVolume, 8400, 'adding chart data retains the rate');
assert.equal(JSON.parse(JSON.stringify(enriched)).hourlyVolume5d.volume, 1008000, 'persistent cache retains the rate');
assert.equal(enriched[1].volume, 24 * 8400, 'existing 1d window remains unchanged');
assert.equal(enriched[3].volume, 72 * 8400, 'existing 3d window remains unchanged');
assert.equal(enriched[7].volume, 168 * 8400, 'existing 7d window remains unchanged');
const card = context.mooncakeBuildMarketHistoryCardHtml('/items/milk', 0, enriched);
assert.match(card, /5d 时均量/);
assert.match(card, /rowspan="3"/);
assert.equal((card.match(/>8\.4K</g) || []).length, 1, 'show the five-day rate once, not once per history row');
assert.doesNotMatch(context.mooncakeBuildMarketHistoryCardHtml('/items/equipment', 12, enriched), /5d 时均量/);
assert.match(context.mooncakeBuildMarketHistoryCardHtml('/items/milk', 0, null, '加载失败'), />—</);
assert.match(context.mooncakeBuildMarketHistoryCardHtml('/items/milk', 0, context.processMarketHistory(hourlyRows(0)), '无交易记录'), />0</);
assert.match(context.mooncakeBuildMarketHistoryHourlyVolumeTooltip(enriched), /1,008,000/);
assert.match(context.mooncakeBuildMarketHistoryHourlyVolumeTooltip(enriched), /120 小时/);

// Run the real fetch path against a local response and then its warm cache.
let requests = 0;
const cache = new Map(), timelines = new Map();
Object.assign(context, {
    MOONCAKE_MARKET_HISTORY_API: 'https://fixture.invalid/histories',
    mooncakeReadMarketHistoryCache: () => ({}),
    mooncakeGetCachedMarketHistory: (hrid, level) => cache.get(hrid + level),
    mooncakeSetCachedMarketHistory: (hrid, level, windows) => cache.set(hrid + level, windows),
    mooncakeGetCachedMarketHistoryTimeline: (hrid, level) => timelines.get(hrid + level),
    mooncakeSetCachedMarketHistoryTimeline: (hrid, level, timeline) => timelines.set(hrid + level, timeline),
    mooncakeReadJsonResponse: async response => response.json(),
    fetch: async url => {
        requests++;
        assert.equal(new URL(url).searchParams.get('days'), '7', 'reuse the existing seven-day request');
        return { ok: true, json: async () => ({ '/items/milk': { 0: full } }) };
    }
});
vm.runInContext(extract('fetchMarketHistories'), context);
const first = await context.fetchMarketHistories('/items/milk', 0, 7, { includeTimeline: true });
const warm = await context.fetchMarketHistories('/items/milk', 0, 7, { includeTimeline: true });
assert.equal(first['/items/milk'][0].hourlyVolume5d.hourlyVolume, 8400);
assert.equal(warm['/items/milk'][0].hourlyVolume5d.hourlyVolume, 8400);
assert.equal(requests, 1, 'the new metric must not add another request on a cache hit');
console.log('Market hourly volume checks passed: 120-hour coverage, zero/rare trades, duplicates, boundaries, cache and card output.');

if (process.argv.includes('--live')) {
    // Validate production decoding and aggregation against the public API.
    const live = vm.createContext({ Date, fetch, TextDecoder, Uint8Array, Blob, Response, DecompressionStream,
        // The userscript loads pako via @require; Node supplies the same raw
        // DEFLATE fallback through zlib when DecompressionStream lacks it.
        pako: { inflateRaw: inflateRawSync, inflate: inflateSync, ungzip: gunzipSync } });
    vm.runInContext(extract('mooncakeReadJsonResponse') + '\n' + extract('mooncakeGetMarketHistoryHourlyVolume'), live);
    const endpoint = source.match(/const MOONCAKE_MARKET_HISTORY_API = '([^']+)'/)[1];
    const response = await fetch(endpoint + '?item_id=%2Fitems%2Fmilk&variant=0&days=7', { signal: AbortSignal.timeout(8000) });
    assert(response.ok, `API status ${response.status}`);
    const json = await live.mooncakeReadJsonResponse(response);
    const actual = live.mooncakeGetMarketHistoryHourlyVolume(json['/items/milk'][0]);
    assert(actual.complete, 'live response supplies all 120 hourly buckets');
    console.log(`Live milk sample: ${actual.coveredHours} hours, ${actual.volume} units, ${format(actual.hourlyVolume)} /h.`);
}

if (process.argv.includes('--serve')) {
    const examples = { full: enriched, sparse: context.processMarketHistory(sparse), missing: context.processMarketHistory(full.slice(0, 24)) };
    const html = String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>材料交易卡片预览</title>
    <style>body{background:#101217;color:#c8d3eb;font:14px system-ui;margin:24px}button{padding:8px;background:#384976;color:inherit;border:1px solid #7989b6;border-radius:4px;cursor:pointer}section{margin:20px 0;max-width:100%}.card{box-sizing:border-box;padding:4px 6px}#tooltip{margin:24px 0;padding:12px;border:1px solid #495270;max-width:300px;background:#181c29}#result{white-space:pre-wrap}h2{font-size:15px;font-weight:500}</style>
    <button id="check">检查窄屏与列宽</button> <button id="columns">切换全部列</button>
    <section><h2>桌面卡片</h2><div id="desktop" class="card" style="width:fit-content"></div></section>
    <section><h2>手机卡片 · 320px 视口</h2><div id="compact" class="card" style="width:304px;padding:6px 34px 7px 6px"></div></section>
    <section><h2>浮动卡片</h2><div id="floating" class="card" data-mooncake-history-floating="1" style="width:380px"></div></section>
    <section><h2>低成交量 / 数据不足</h2><div id="sparse" class="card" style="width:fit-content"></div><div id="missing" class="card" style="width:fit-content;margin-top:12px"></div></section>
    <div id="tooltip"></div><pre id="result" role="status">等待检查</pre><script>
    const MOONCAKE_MARKET_HISTORY_WINDOWS=[1,3,7],MOONCAKE_MARKET_HISTORY_FLOAT_SELECTOR='[data-mooncake-history-floating="1"]';
    const isZH=true, examples=${JSON.stringify(examples)};
    let all=false;
    const mooncakeIsEnhanceableItem=()=>false;
    /* browser fixture */
    </script></html>`;
    const browserScript = String.raw`
    const mooncakeGetMarketHistoryMobileColumns=()=>({average:true,median:all,volume:true,buySell:all,range:true,hourly:true});
    const mooncakeIsMarketHistoryCardSellFirst=()=>true;
    ${functions}
    function render(){for(const id of ['desktop','compact','floating','sparse','missing']){const card=document.getElementById(id);card.innerHTML=mooncakeBuildMarketHistoryCardHtml('/items/milk',0,examples[id]||examples.full,'',{compact:id==='compact'});mooncakeStyleMarketHistoryCard(card,id==='compact');if(id==='floating')mooncakeApplyFloatingMarketHistoryLayout(card);card.querySelectorAll('.mooncake-market-history-volume-rate').forEach(cell=>{cell.onmouseenter=cell.onclick=()=>document.getElementById('tooltip').innerHTML=mooncakeBuildMarketHistoryHourlyVolumeTooltip(examples[id]||examples.full)})}}
    function check(){const failures=[];for(const expanded of [false,true]){all=expanded;render();for(const id of ['desktop','compact','floating']){const card=document.getElementById(id);if(card.scrollWidth>card.clientWidth+1)failures.push(id+': card overflow');for(const cell of card.querySelectorAll('.mooncake-market-history-volume-rate')){if(cell.scrollWidth>cell.clientWidth+1)failures.push(id+': clipped metric')}if(card.querySelectorAll('tbody [data-mooncake-history-detail-trigger="volume-rate"]').length!==1)failures.push(id+': repeated value')}}all=false;render();document.getElementById('result').textContent=failures.length?'FAIL: '+failures.join(', '):'PASS：桌面、320px 窄屏、浮动卡片及全部列模式，5d 指标完整显示。'}
    document.getElementById('check').onclick=check;document.getElementById('columns').onclick=()=>{all=!all;render()};render();document.getElementById('tooltip').innerHTML=mooncakeBuildMarketHistoryHourlyVolumeTooltip(examples.full);
    `;
    const page = html.replace('/* browser fixture */', () => browserScript);
    const server = createServer((request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(page); });
    server.listen(0, '127.0.0.1', () => console.log(`Market card preview: http://127.0.0.1:${server.address().port}`));
}
