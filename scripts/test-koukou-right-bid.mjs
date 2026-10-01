import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

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

// Exercise the scanner that actually feeds the table, including selecting a
// header, saving its key, fetching rows, and refreshing with the saved choice.
const between = (start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `Missing source block: ${start}`);
    return source.slice(from, to);
};
const examples = [
    { name: 'Alpha', ask: 100, hourly: 30e6, bid: 90, bidHourly: 2e6, undercutHourly: 15e6, profit: 150e6, volume: 2 },
    { name: 'Beta', ask: 200, hourly: 20e6, bid: 180, bidHourly: 10e6, undercutHourly: 19e6, profit: 190e6, volume: 3 },
    { name: 'Gamma', ask: 300, hourly: 10e6, bid: 280, bidHourly: 5e6, undercutHourly: 8e6, profit: 80e6, volume: 4 },
    { name: 'Zero', ask: 400, hourly: 0, bid: 380, bidHourly: 0, undercutHourly: 0, profit: 0, volume: 5 },
    { name: 'Loss', ask: 500, hourly: -10e6, bid: 480, bidHourly: -1e6, undercutHourly: -15e6, profit: -150e6, volume: 6 },
    { name: 'Missing', ask: 2, hourly: 40e6, bid: 0, volume: 7 },
    { name: 'Unknown', ask: 0, bid: 0, volume: 8 }
].map(row => ({ ...row, itemHrid: '/items/' + row.name.toLowerCase() }));
const items = new Map(examples.map(row => [row.itemHrid, row]));
const saved = new Map();
const controls = {
    '[data-mooncake-koukou-body]': { innerHTML: '' },
    '[data-mooncake-koukou-status]': { textContent: '' },
    '[data-mooncake-koukou-item-name]': { value: '' },
    '[data-mooncake-koukou-target-hourly]': { value: '0' },
    '[data-mooncake-koukou-min-volume]': { value: '0' },
    '[data-mooncake-koukou-only]': { checked: false }
};
const panel = { isConnected: true, querySelector: selector => controls[selector] || null };
const market = { marketData: Object.fromEntries(examples.map(row => [row.itemHrid, { 10: { a: row.ask, b: row.bid } }])) };
let displayedRows = [];
const sandbox = {
    console: { warn: (...messages) => { throw new Error(messages.join(' ')); } },
    AbortController,
    setTimeout,
    document: { getElementById: () => panel },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    MOONCAKE_MARKET_KOUKOU_ID: 'test-koukou',
    MOONCAKE_MARKET_KOUKOU_PREFS_KEY: 'test-koukou-prefs',
    MOONCAKE_ORDER_TARGET_HOURLY_MIN_M: 0,
    MOONCAKE_ORDER_TARGET_HOURLY_MAX_M: 1000,
    itemDetailMap: Object.fromEntries(examples.map(row => [row.itemHrid, { itemLevel: 95 }])),
    mooncakeGetOrderTargetHourlyM: () => 0,
    mooncakeReadRankingMultiSelect: () => [95],
    mooncakeReadRankingSingleSelect: () => 10,
    getMarketData: () => market,
    mooncakeGetEnhanceableEquipmentHrids: () => examples.map(row => row.itemHrid),
    mooncakeFilterEquipmentHridsByName: rows => rows,
    getItemName: hrid => items.get(hrid).name,
    getPriceTier: ask => ask === 2 ? ask : ask - 1,
    calcHourlyWageAndMetrics: (hrid, level, data, price) => {
        const row = items.get(hrid);
        return { hourlyWage: price === row.ask ? row.hourly : price === row.bid ? row.bidHourly : row.undercutHourly, metrics: { profit: row.profit } };
    },
    getProfitPerItem: metrics => metrics.profit,
    fetchMarketHistories: async hrids => Object.fromEntries(hrids.map(hrid => [hrid, { 10: Object.fromEntries([1, 3, 7].map(day => [day, { volume: items.get(hrid).volume, avgPrice: 1, turnover: items.get(hrid).volume * 10 }])) }])),
    mooncakeCalcHourlyWageResultByPrice: () => null,
    mooncakeRenderKouKouRows: rows => { displayedRows = Array.from(rows); return 'Rendered'; },
    mooncakeHydrateRankingIcons: () => {},
    mooncakeFormatSignedHourlyWage: value => String(value),
    mooncakeFormatSignedMoney: value => String(value)
};
vm.runInNewContext(`
    let mooncakeMarketHistoryRankingSort = 'koukouHourly';
    let mooncakeMarketKouKouSeq = 0, mooncakeMarketKouKouAbortController = null;
    ${between('    function mooncakeSetMarketHistoryRankingSort(', '    function mooncakeReadRankingPreferences(')}
    ${between('    function mooncakeReadKouKouPreferences(', '    function mooncakeWriteRankingPreferences(')}
    ${between('    function mooncakeFormatKouKouHourly(', '    function mooncakeBuildKouKouMobileMetricPair(')}
    ${between('    async function mooncakeRunMarketKouKou(', '    function mooncakeGetOpenMarketStatisticsPanel(')}
    globalThis.api = {
        select: key => mooncakeSetMarketHistoryRankingSort(key, mooncakeWriteKouKouPreferences),
        run: mooncakeRunMarketKouKou,
        restore: () => { mooncakeMarketHistoryRankingSort = mooncakeReadKouKouPreferences().sort; },
        hourly: mooncakeFormatKouKouHourly,
        profit: mooncakeFormatKouKouProfit
    };
`, sandbox);
for (const [key, expected] of [
    ['bidHourly', ['Beta', 'Gamma', 'Alpha', 'Zero', 'Loss', 'Missing', 'Unknown']],
    ['undercutHourly', ['Beta', 'Alpha', 'Gamma', 'Zero', 'Loss', 'Missing', 'Unknown']],
    ['koukouHourly', ['Missing', 'Alpha', 'Beta', 'Gamma', 'Zero', 'Loss', 'Unknown']],
    ['undercutProfit', ['Beta', 'Alpha', 'Gamma', 'Zero', 'Loss', 'Missing', 'Unknown']],
    ['volume7', ['Unknown', 'Missing', 'Loss', 'Zero', 'Gamma', 'Beta', 'Alpha']],
    ['name', ['Alpha', 'Beta', 'Gamma', 'Loss', 'Missing', 'Unknown', 'Zero']]
]) {
    sandbox.api.select(key);
    await sandbox.api.run();
    assert.deepEqual(displayedRows.map(row => row.name), expected, `${key} must order rendered rows by its displayed metric`);
    assert.equal(JSON.parse(saved.get('test-koukou-prefs')).sort, key, 'the selected header must persist');
    sandbox.api.restore();
    await sandbox.api.run();
    assert.deepEqual(displayedRows.map(row => row.name), expected, 'refresh must retain the selected ordering');
}
for (const format of [sandbox.api.hourly, sandbox.api.profit]) {
    assert.match(format(null), />-<\/span>$/, 'missing values must be visibly distinct from a real zero');
    assert.doesNotMatch(format(0), />-<\/span>$/, 'a real zero must remain a valid value');
}
console.log('PASS: rendered scanner order, negative/zero/missing metrics, saved sort and refresh.');
