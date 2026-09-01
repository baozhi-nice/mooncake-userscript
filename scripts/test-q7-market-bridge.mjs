import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(scriptDirectory, '..', 'src', 'mooncake.js'), 'utf8');
const start = source.indexOf('    const MARKET_CACHE_KEY');
const end = source.indexOf('    function readMWICoreMarketData');
const wsStart = source.indexOf('    function updateMarketCacheFromWS');
const wsEnd = source.indexOf('\n\n\n\n    function getMarketData', wsStart);
const resolverStart = source.indexOf('    function mooncakeResolveEnhancementMarketQuotes');
const resolverEnd = source.indexOf('\n\n    const MOONCAKE_ORDER_BOOK_ARCHIVE_ENABLED_KEY', resolverStart);
assert.notEqual(start, -1, 'market-cache block must exist');
assert.notEqual(end, -1, 'market-cache block must have a stable end marker');
assert.notEqual(wsStart, -1, 'WebSocket market-cache updater must exist');
assert.notEqual(wsEnd, -1, 'WebSocket market-cache updater must have a stable end marker');
assert.notEqual(resolverStart, -1, 'enhancement market quote resolver must exist');
assert.notEqual(resolverEnd, -1, 'enhancement market quote resolver must have a stable end marker');
assert.match(
    source,
    /if \(!getMarketData\(\)\) \{\s*await fetchMarketApi\(\);\s*}\s*\/\/ The standalone Q7 script may have refreshed before MoonCake initialized\.\s*mooncakeApplyQ7MarketCacheUpdate\(\);/,
    'MoonCake initialization must apply an already-cached Q7 snapshot'
);

const bridgeSource = `${source.slice(start, end)}
${source.slice(wsStart, wsEnd)}
${source.slice(resolverStart, resolverEnd)}
globalThis.__bridgeTest = {
    getMarketDataCache: () => marketDataCache,
    getSnapshotCache: () => marketDetailSnapshotCache,
    getPricingRevision: () => mooncakeMarketPricingRevision,
    updateMarketCacheFromWS,
    resolveEnhancementMarketQuotes: mooncakeResolveEnhancementMarketQuotes
};`;

const fallbackMarketData = {
    '/items/shared': { 0: { a: 100, b: 90, p: 95, v: 8 } },
    '/items/official_only': { 0: { a: 400, b: 350, p: 375, v: 8 } }
};
const q7MarketData = {
    '/items/shared': { 0: { a: -1, b: 77 } }
};
const q7SourceTimestamp = Math.floor(Date.now() / 1000) - 60;
const localStorage = {
    getItem(key) {
        if (key === 'mwi-q7-market-refresh.snapshot.v1') {
            return JSON.stringify({
                fetchedAt: q7SourceTimestamp * 1000,
                sourceTimestamp: q7SourceTimestamp,
                marketData: q7MarketData
            });
        }
        return key === 'MWITools_marketAPI_json' ? JSON.stringify({ marketData: fallbackMarketData }) : null;
    }
};
const listeners = new Map();
const calls = {
    clearRoute: 0,
    clearQuick: 0,
    orderModal: 0,
    myListings: 0,
    marketplace: 0,
    chat: 0,
    enhancementRefresh: []
};

const context = vm.createContext({
    console,
    localStorage,
    mooncakeClearEnhancementRouteCache() { calls.clearRoute++; },
    mooncakeEnhanceQuickRecommendationCache: { clear() { calls.clearQuick++; } },
    mooncakeRefreshOrderModalEconomics() { calls.orderModal++; },
    mooncakeScheduleMyListingsTargetFilter() { calls.myListings++; },
    mooncakeMyListingsManagementState: null,
    currentMarketItem: null,
    mooncakeScheduleCurrentEnhancementMarketRefresh(itemHrid) { calls.enhancementRefresh.push(itemHrid); },
    scheduleMarketplaceHourlyWageRefresh() { calls.marketplace++; },
    refreshMooncakeChatLabor() { calls.chat++; },
    mooncakeCacheQ7MarketOrderBooks() {},
    mooncakeScheduleOrderBookArchiveCapture() {},
    mooncakeIsMarketListingAgeEnabled() { return false; },
    mooncakeGetOrderBookBestPrice(book, side) {
        const prices = (book?.[side] || [])
            .map(order => Number(order?.price))
            .filter(Number.isFinite);
        if (!prices.length) return -1;
        return side === 'asks' ? Math.min(...prices) : Math.max(...prices);
    },
    mooncakeGetOrderBookPriceBandValue(values, level) {
        const value = values?.[level] ?? values?.[String(level)];
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    },
    getMarketData() { return null; },
    window: {
        addEventListener(type, handler) { listeners.set(type, handler); },
        logInitData() {}
    }
});

vm.runInContext(bridgeSource, context, { filename: 'mooncake-q7-bridge.js' });
const handler = listeners.get('mwi-q7-market-updated');
assert.equal(typeof handler, 'function', 'MoonCake must listen for Q7 updates');

const snapshots = context.__bridgeTest.getSnapshotCache();
snapshots['/items/shared:0'] = { bid: 90, ask: 100, priceBandMin: 1, priceBandMax: 1000 };
snapshots['/items/unrelated:0'] = { bid: 10, ask: 20 };
handler({ detail: { success: true } });
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].a, -1, 'Q7 cache must seed MoonCake memory data when no live quote exists');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].b, 77, 'Q7 bid must seed MoonCake memory data when no live quote exists');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].p, 95, 'fallback metadata must remain available');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/official_only'][0].b, 350, 'fallback entries must remain available');
const sharedSnapshot = snapshots['/items/shared:0'];
assert.equal(sharedSnapshot.bid, 77, 'Q7 must replace a legacy snapshot bid');
assert.equal(sharedSnapshot.ask, -1, 'Q7 must replace a legacy snapshot ask');
assert.equal(sharedSnapshot.time, q7SourceTimestamp, 'Q7 snapshots must use the Q7 source timestamp');
assert.equal(sharedSnapshot.source, 'q7-snapshot', 'Q7 snapshots must be marked as fallback data');
assert.equal(sharedSnapshot.priceBandMin, 1, 'Q7 snapshots must retain the lower price band');
assert.equal(sharedSnapshot.priceBandMax, 1000, 'Q7 snapshots must retain the upper price band');
assert.equal(snapshots['/items/unrelated:0'].bid, 10, 'unrelated live snapshots must remain intact');
const resolvedQ7Quote = context.__bridgeTest.resolveEnhancementMarketQuotes('/items/shared', 0, 888, 999, 123);
assert.equal(resolvedQ7Quote.bid, 77, 'Q7 bid must override stale renderer input');
assert.equal(resolvedQ7Quote.ask, -1, 'Q7 no-ask marker must override stale renderer input');
assert.equal(resolvedQ7Quote.time, q7SourceTimestamp, 'Q7 source timestamp must be returned with the quote');
assert.equal(context.__bridgeTest.getPricingRevision(), 1, 'price revision must advance');
assert.deepEqual(calls, {
    clearRoute: 1,
    clearQuick: 1,
    orderModal: 1,
    myListings: 1,
    marketplace: 1,
    chat: 1,
    enhancementRefresh: []
}, 'all price-dependent surfaces must be scheduled');

handler({ detail: { success: false } });
assert.equal(context.__bridgeTest.getPricingRevision(), 1, 'failed Q7 requests must not refresh MoonCake data');

context.currentMarketItem = { itemHrid: '/items/shared', enhancementLevel: 0 };
context.__bridgeTest.updateMarketCacheFromWS({
    itemHrid: '/items/shared',
    orderBooks: [{ asks: [{ price: 999 }], bids: [{ price: 888 }] }],
    priceBandMins: [1],
    priceBandMaxs: [1000]
});
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].a, 999, 'the open game order book must overwrite stale Q7 asks');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].b, 888, 'the open game order book must overwrite stale Q7 bids');
assert.equal(snapshots['/items/shared:0'].ask, 999, 'WebSocket snapshots must retain the live ask');
assert.equal(snapshots['/items/shared:0'].bid, 888, 'WebSocket snapshots must retain the live bid');
assert.equal(snapshots['/items/shared:0'].source, 'game-order-book', 'WebSocket snapshots must be marked as live game data');
assert.equal(calls.enhancementRefresh.at(-1), '/items/shared', 'opening a material must schedule its visible enhancement data to redraw');
const resolvedLiveQuote = context.__bridgeTest.resolveEnhancementMarketQuotes('/items/shared', 0, 77, -1, q7SourceTimestamp);
assert.equal(resolvedLiveQuote.bid, 888, 'the resolver must prefer live game bids over Q7');
assert.equal(resolvedLiveQuote.ask, 999, 'the resolver must prefer live game asks over Q7');

handler({ detail: { success: true } });
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].a, 999, 'a later Q7 refresh must not replace a live material ask');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].b, 888, 'a later Q7 refresh must not replace a live material bid');

context.__bridgeTest.updateMarketCacheFromWS({
    itemHrid: '/items/official_only',
    orderBooks: [{ asks: [{ price: 480 }], bids: [{ price: 410 }] }],
    priceBandMins: [1],
    priceBandMaxs: [1000]
});
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/official_only'][0].a, 480, 'non-Q7 entries must still use game order-book asks');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/official_only'][0].b, 410, 'non-Q7 entries must still use game order-book bids');

console.log('Validated MoonCake Q7 event bridge.');
