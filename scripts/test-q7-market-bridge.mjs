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
const priceHelperStart = source.indexOf('    function mooncakeGetOrderBookBestPrice');
const priceHelperEnd = source.indexOf('\n\n    function mooncakeGetUsableMarketQuote', priceHelperStart);
const resolverStart = source.indexOf('    function mooncakeResolveEnhancementMarketQuotes');
const resolverEnd = source.indexOf('\n\n    const MOONCAKE_ORDER_BOOK_ARCHIVE_ENABLED_KEY', resolverStart);
assert.notEqual(start, -1, 'market-cache block must exist');
assert.notEqual(end, -1, 'market-cache block must have a stable end marker');
assert.notEqual(wsStart, -1, 'WebSocket market-cache updater must exist');
assert.notEqual(wsEnd, -1, 'WebSocket market-cache updater must have a stable end marker');
assert.notEqual(priceHelperStart, -1, 'order-book price helper must exist');
assert.notEqual(priceHelperEnd, -1, 'order-book price helper must have a stable end marker');
assert.notEqual(resolverStart, -1, 'enhancement market quote resolver must exist');
assert.notEqual(resolverEnd, -1, 'enhancement market quote resolver must have a stable end marker');
assert.match(
    source,
    /const cachedMarketData = getMarketData\(\);[\s\S]{0,400}const marketRefresh = fetchMarketApi\(\);\s*if \(!cachedMarketData\) await marketRefresh;\s*\/\/ The standalone Q7 script may have refreshed before MoonCake initialized\.\s*mooncakeApplyQ7MarketCacheUpdate\(\);/,
    'MoonCake initialization must refresh the public API even when a local cache exists'
);

const bridgeSource = `${source.slice(start, end)}
${source.slice(priceHelperStart, priceHelperEnd)}
${source.slice(wsStart, wsEnd)}
${source.slice(resolverStart, resolverEnd)}
globalThis.__bridgeTest = {
    getMarketDataCache: () => marketDataCache,
    getSnapshotCache: () => marketDetailSnapshotCache,
    getPricingRevision: () => mooncakeMarketPricingRevision,
    getMarketDataUpdateState: () => ({
        timestamp: mooncakeMarketDataUpdateTimestamp,
        source: mooncakeMarketDataUpdateSource
    }),
    getQ7Overlay: () => mooncakeQ7MarketOverlay,
    setMarketDataUpdateTimestamp: mooncakeSetMarketDataUpdateTimestamp,
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
let nowMs = 1_700_000_000_000;
let q7SourceTimestamp = Math.floor(nowMs / 1000) - 60;
let q7HasSourceTimestamp = true;
const localStorage = {
    getItem(key) {
        if (key === 'mwi-q7-market-refresh.snapshot.v1') {
            const snapshot = {
                fetchedAt: q7SourceTimestamp * 1000,
                marketData: q7MarketData
            };
            if (q7HasSourceTimestamp) snapshot.sourceTimestamp = q7SourceTimestamp;
            return JSON.stringify(snapshot);
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
    mooncakeMarketplacePricingSurfaceState: null,
    currentMarketItem: null,
    mooncakeScheduleCurrentEnhancementMarketRefresh(itemHrid) { calls.enhancementRefresh.push(itemHrid); },
    scheduleMarketplaceHourlyWageRefresh() { calls.marketplace++; },
    refreshMooncakeChatLabor() { calls.chat++; },
    mooncakeCacheQ7MarketOrderBooks() {},
    mooncakeScheduleOrderBookArchiveCapture() {},
    mooncakeIsMarketListingAgeEnabled() { return false; },
    mooncakeGetOrderBookPriceBandValue(values, level) {
        const value = values?.[level] ?? values?.[String(level)];
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
    },
    Date: { now: () => nowMs },
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
assert.equal(context.__bridgeTest.getMarketDataUpdateState().timestamp, q7SourceTimestamp, 'the My Listings timestamp must use Q7 sourceTimestamp rather than the local fetch time');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().source, 'q7', 'the My Listings timestamp must retain its Q7 source');
context.__bridgeTest.setMarketDataUpdateTimestamp((q7SourceTimestamp + 60) * 1000, 'public-api');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().timestamp, q7SourceTimestamp + 60, 'a valid public response must replace stale source metadata when Q7 is unavailable');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().source, 'public-api', 'a valid public response must retain its source');
context.__bridgeTest.setMarketDataUpdateTimestamp(q7SourceTimestamp, 'q7');
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
    orderBooks: [{ asks: [[999, 1]], bids: [[888, 1]] }],
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
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].a, 999, 'an older Q7 refresh must not replace a live material ask');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].b, 888, 'an older Q7 refresh must not replace a live material bid');

// A game quote is only authoritative while it is at least as fresh as the
// reporter snapshot. This prevents an item opened earlier in a session from
// retaining a permanently stale material price.
nowMs += 90_000;
q7SourceTimestamp = Math.floor(nowMs / 1000);
q7MarketData['/items/shared'][0] = { a: 777, b: 666 };
handler({ detail: { success: true } });
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].a, 777, 'a newer Q7 snapshot must replace an old live ask');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].b, 666, 'a newer Q7 snapshot must replace an old live bid');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().timestamp, q7SourceTimestamp, 'the visible interface time must advance with a newer Q7 snapshot');
const resolvedNewQ7Quote = context.__bridgeTest.resolveEnhancementMarketQuotes('/items/shared', 0, 888, 999, nowMs / 1000);
assert.equal(resolvedNewQ7Quote.ask, 777, 'the resolver must choose a newer Q7 ask over an old live quote');
assert.equal(resolvedNewQ7Quote.bid, 666, 'the resolver must choose a newer Q7 bid over an old live quote');

nowMs += 10_000;
context.__bridgeTest.updateMarketCacheFromWS({
    itemHrid: '/items/shared',
    orderBooks: [{ asks: [[1111, 1]], bids: [[1001, 1]] }],
    priceBandMins: [1],
    priceBandMaxs: [1000]
});
const resolvedFreshLiveQuote = context.__bridgeTest.resolveEnhancementMarketQuotes('/items/shared', 0, 666, 777, nowMs / 1000);
assert.equal(resolvedFreshLiveQuote.ask, 1111, 'a fresh tuple order book ask must replace Q7');
assert.equal(resolvedFreshLiveQuote.bid, 1001, 'a fresh tuple order book bid must replace Q7');

context.__bridgeTest.updateMarketCacheFromWS({
    itemHrid: '/items/official_only',
    orderBooks: [{ asks: [{ price: 480 }], bids: [{ price: 410 }] }],
    priceBandMins: [1],
    priceBandMaxs: [1000]
});
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/official_only'][0].a, 480, 'non-Q7 entries must still use game order-book asks');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/official_only'][0].b, 410, 'non-Q7 entries must still use game order-book bids');

q7HasSourceTimestamp = false;
nowMs += 10_000;
handler({ detail: { success: true } });
assert.equal(context.__bridgeTest.getMarketDataUpdateState().timestamp, q7SourceTimestamp, 'an undated Q7 refresh must not erase a valid interface time');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().source, 'q7', 'the valid Q7 source must remain active when an undated refresh is rejected');

q7HasSourceTimestamp = true;
const publicTimestamp = q7SourceTimestamp + 300;
const publicSharedQuote = { a: 1234, b: 1200, p: 1217, v: 10 };
context.__bridgeTest.getMarketDataCache()['/items/shared'][0] = publicSharedQuote;
assert.equal(
    context.__bridgeTest.setMarketDataUpdateTimestamp(publicTimestamp, 'public-api'),
    true,
    'a newer public snapshot must advance the visible market clock'
);
handler({ detail: { success: true } });
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].a, 1234, 'stale Q7 asks must not overwrite a newer public snapshot');
assert.equal(context.__bridgeTest.getMarketDataCache()['/items/shared'][0].b, 1200, 'stale Q7 bids must not overwrite a newer public snapshot');
assert.equal(context.__bridgeTest.getQ7Overlay(), null, 'rejecting stale Q7 data must clear its in-memory quote overlay');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().timestamp, publicTimestamp, 'stale Q7 metadata must not roll the toolbar date backwards');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().source, 'public-api', 'stale Q7 metadata must not replace the newer toolbar source');
assert.equal(
    context.__bridgeTest.setMarketDataUpdateTimestamp(q7SourceTimestamp, 'q7'),
    false,
    'timestamp metadata must be monotonic across delayed sources'
);

q7HasSourceTimestamp = false;
handler({ detail: { success: true } });
assert.equal(context.__bridgeTest.getMarketDataUpdateState().timestamp, publicTimestamp, 'an undated Q7 cache must not clear a newer public timestamp');
assert.equal(context.__bridgeTest.getMarketDataUpdateState().source, 'public-api', 'an undated Q7 cache must not replace a newer public source');

console.log('Validated MoonCake Q7 event bridge.');
