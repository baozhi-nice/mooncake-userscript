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
    let parameterDepth = 0;
    let parameterEnd = -1;
    for (let index = start + marker.length - 1; index < source.length; index += 1) {
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

const getQ7Level = extractFunction('mooncakeGetQ7MarketReportCacheLevel');
const getQ7Report = extractFunction('mooncakeGetQ7CachedMarketOrderBookReport');
const cacheQ7OrderBooks = extractFunction('mooncakeCacheQ7MarketOrderBooks');
const q7Sandbox = {
    MOONCAKE_Q7_MARKET_REPORT_MAX_LEVEL: 20,
    MOONCAKE_Q7_MARKET_REPORT_RAW_CACHE_LIMIT: 2,
    mooncakeQ7PendingMarketReport: { itemHrid: '/items/test', level: 9, selectedAt: 1000, ready: false },
    mooncakeQ7MarketOrderBookCache: new Map(),
    mooncakeQ7MarketReporterUnavailable: false,
    currentMarketItem: { itemHrid: '/items/test', enhancementLevel: 9 },
    MOONCAKE_Q7_MARKET_REPORT_FRESHNESS_MS: 1000,
    reportBuilds: 0,
    sends: 0,
    Date: { now: () => 1200 },
    mooncakeIsQ7MarketReportHost: () => true
};

vm.runInNewContext(`
    function mooncakeBuildQ7MarketOrderBookReport(level) {
        globalThis.reportBuilds += 1;
        return { level };
    }
    function mooncakeTrySendQ7MarketReport() {
        globalThis.sends += 1;
    }
    ${getQ7Level}
    ${getQ7Report}
    ${cacheQ7OrderBooks}
    globalThis.cacheQ7OrderBooks = mooncakeCacheQ7MarketOrderBooks;
    globalThis.getQ7Report = mooncakeGetQ7CachedMarketOrderBookReport;
`, q7Sandbox);

const orderBooks = Array.from({ length: 21 }, (_, level) => ({
    asks: [[1000 + level, 1]],
    bids: [[900 + level, 1]]
}));
q7Sandbox.cacheQ7OrderBooks({ itemHrid: '/items/test', orderBooks });
assert.equal(q7Sandbox.reportBuilds, 1, 'a live packet must build only the pending/current Q7 level');
assert.equal(q7Sandbox.sends, 1, 'a pending current-level report must still send normally');
const cached = q7Sandbox.mooncakeQ7MarketOrderBookCache.get('/items/test');
assert.ok(cached, 'the selected item must remain available for a delayed report request');
assert.equal(q7Sandbox.getQ7Report(cached, 10).level, 10, 'another level may be built lazily when explicitly requested');
assert.equal(q7Sandbox.reportBuilds, 2, 'lazy access must not rebuild every other level');

const schedulePending = extractFunction('mooncakeSchedulePendingMarketOrderBookProcessing');
const queuePending = extractFunction('mooncakeQueueMarketOrderBookWebSocketMessage');
const timers = [];
const marketUpdates = [];
const messageSandbox = {
    MOONCAKE_MARKET_WS_IDLE_TIMEOUT_MS: 180,
    MOONCAKE_MARKET_WS_PENDING_ITEM_LIMIT: 3,
    BLT_WS_MARKET_ITEM_HRID_PATTERN: /"itemHrid"\s*:\s*"([^"]+)"/,
    mooncakePendingMarketOrderBookMessages: new Map(),
    mooncakePendingMarketOrderBookProcessHandle: null,
    mooncakePendingMarketOrderBookProcessUsesIdleCallback: false,
    currentMarketItem: { itemHrid: '/items/old', enhancementLevel: 0 },
    mooncakeQ7PendingMarketReport: null,
    JSON,
    console: { error() {} },
    setTimeout(callback, delay) {
        timers.push({ callback, delay });
        return timers.length;
    },
    updateMarketCacheFromWS(payload) {
        marketUpdates.push(payload);
    }
};

vm.runInNewContext(`
    ${schedulePending}
    ${queuePending}
    globalThis.queuePending = mooncakeQueueMarketOrderBookWebSocketMessage;
`, messageSandbox);
messageSandbox.queuePending(JSON.stringify({ type: 'market_item_order_books_updated', marketItemOrderBooks: { itemHrid: '/items/old' } }));
messageSandbox.queuePending(JSON.stringify({ type: 'market_item_order_books_updated', marketItemOrderBooks: { itemHrid: '/items/latest' } }));
assert.equal(timers.length, 1, 'bursts must schedule one deferred market task');
assert.equal(timers[0].delay, 32, 'browsers without requestIdleCallback must use the short fallback timer');
timers[0].callback();
assert.deepEqual(marketUpdates, [{ itemHrid: '/items/old' }], 'the selected material packet must not be replaced by another item in the same burst');
assert.equal(timers.length, 2, 'a second queued item must use a later idle turn instead of making the first turn expensive');
timers[1].callback();
assert.deepEqual(marketUpdates, [{ itemHrid: '/items/old' }, { itemHrid: '/items/latest' }], 'each retained item must still receive its latest deferred normalization');

assert.match(
    source,
    /messageType === 'market_item_order_books_updated'\) \{\s*mooncakeQueueMarketOrderBookWebSocketMessage\(message\);\s*return message;/,
    'the native message handler must enqueue market packets before JSON parsing'
);
assert.match(
    source,
    /while \(mooncakeQ7MarketOrderBookCache\.size > MOONCAKE_Q7_MARKET_REPORT_RAW_CACHE_LIMIT\)/,
    'raw Q7 market books must remain tightly bounded'
);

console.log('WebSocket message performance checks passed.');
