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
    const parameterStart = source.indexOf('(', start);
    let parameterDepth = 0;
    let parameterEnd = -1;
    for (let index = parameterStart; index < source.length; index += 1) {
        if (source[index] === '(') parameterDepth += 1;
        if (source[index] === ')') parameterDepth -= 1;
        if (parameterDepth === 0) {
            parameterEnd = index;
            break;
        }
    }
    assert.notEqual(parameterEnd, -1, `${name} parameters must close`);
    const braceStart = source.indexOf('{', parameterEnd);
    let depth = 0;
    for (let index = braceStart; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1;
        if (source[index] === '}') depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
    }
    throw new Error(`Unable to extract ${name}`);
}

const normalizePrice = extractFunction('mooncakeNormalizeMarketPersonalTradePrice');
const normalizeEntry = extractFunction('mooncakeNormalizeMarketPersonalTradeHistoryEntry');
const normalizeRecord = extractFunction('mooncakeNormalizeMarketPersonalTradeRecord');
const applyRecord = extractFunction('mooncakeApplyMarketPersonalTradeRecord');
const pruneHistory = extractFunction('mooncakePruneMarketPersonalTradeHistory');
const sandbox = {
    MOONCAKE_MARKET_PERSONAL_TRADE_HISTORY_MAX_ENTRIES: 500,
    Date: { now: () => 9_999 },
    Number,
    Math,
    Object
};

vm.runInNewContext(`
    ${normalizePrice}
    ${normalizeEntry}
    ${normalizeRecord}
    ${applyRecord}
    ${pruneHistory}
    globalThis.testApi = {
        normalizeRecord: mooncakeNormalizeMarketPersonalTradeRecord,
        applyRecord: mooncakeApplyMarketPersonalTradeRecord,
        pruneHistory: mooncakePruneMarketPersonalTradeHistory
    };
`, sandbox);

const sale = sandbox.testApi.normalizeRecord({
    itemHrid: '/items/test_sword',
    enhancementLevel: 12,
    price: 123_456_789.9,
    filledQuantity: 1,
    isSell: true
}, 1_000);
assert.deepEqual(JSON.parse(JSON.stringify(sale)), {
    key: '/items/test_sword:12',
    side: 'sell',
    price: 123_456_789,
    timestamp: 1_000
}, 'a filled sale must retain its item, enhancement level, and settled price');

const purchase = sandbox.testApi.normalizeRecord({
    itemHrid: '/items/test_sword',
    enhancementLevel: 12,
    price: 120_000_000,
    filledQuantity: 2,
    isSell: false
}, 2_000);
assert.equal(purchase.side, 'buy', 'a filled buy must be identified separately from a sale');
assert.equal(
    sandbox.testApi.normalizeRecord({ itemHrid: '/items/test_sword', price: 1, filledQuantity: 0, isSell: true }, 3_000),
    null,
    'unfilled or cancelled listings must not become trade history'
);

const history = {};
sandbox.testApi.applyRecord(history, sale);
sandbox.testApi.applyRecord(history, purchase);
assert.deepEqual(JSON.parse(JSON.stringify(history['/items/test_sword:12'])), {
    sell: 123_456_789,
    sellAt: 1_000,
    buy: 120_000_000,
    buyAt: 2_000,
    updatedAt: 2_000
}, 'latest buy and sell prices must coexist for the same market item');

const oversizedHistory = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [
    `/items/item_${index}:0`,
    { buy: index + 1, buyAt: index, updatedAt: index }
]));
const pruned = sandbox.testApi.pruneHistory(oversizedHistory);
assert.equal(Object.keys(pruned).length, 500, 'persistent trade history must remain bounded');
assert.ok(!('/items/item_0:0' in pruned), 'the oldest history entry must be discarded first');

assert.match(
    source,
    /mooncakeRecordMarketPersonalTradeHistory\(obj\.marketListings, obj\.endMarketListings\)/,
    'both active and completed listing collections must feed personal trade history'
);
assert.match(
    source,
    /MOONCAKE_MOOKET_OVERLAY_ID = 'mooket_safe_overlay'/,
    'MoonCake must identify mooket before rendering duplicate trade history'
);
assert.match(
    source,
    /badgeHost\.insertBefore\(badge, rangeTextNode\)/,
    'the personal history display must appear directly before the trade range text'
);
assert.match(
    source,
    /currentItem\.closest\?\.\('\[class\*="MarketplacePanel_infoContainer"\]'\) \|\| currentItem/,
    'the personal history display must search the market information container where the range is a sibling of the item'
);
assert.match(
    source,
    /const badgeHost = rangeTextNode\.parentNode;/,
    'the personal history badge must reuse the range text host rather than the sibling current-item node'
);
assert.match(
    source,
    /'market-personal-trade-history'/,
    'Settings Center must expose a personal trade history toggle'
);
assert.match(
    source,
    /isZH \? '最近成交价' : 'Recent trade prices'/,
    'the Settings Center trade history toggle must use the concise recent-price label'
);
assert.doesNotMatch(
    source,
    /我的最近：/,
    'the market trade price display must not prepend an unnecessary personal-history label'
);

console.log('Market personal trade history checks passed.');
