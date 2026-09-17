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

const normalizeQuantity = extractFunction('mooncakeNormalizeMarketTradeLogQuantity');
const normalizeInstantRequest = extractFunction('mooncakeNormalizeInstantMarketTradeRequest');
const inventoryQuantity = extractFunction('mooncakeGetMarketTradeLogInventoryQuantity');
const instantInventoryConfirm = extractFunction('mooncakeDoesInstantMarketTradeInventoryConfirm');
const buildInstantEntry = extractFunction('mooncakeBuildInstantMarketTradeLogEntry');
const instantListingCover = extractFunction('mooncakeDoesListingCoverInstantMarketTrade');
const instantTradeRecordCover = extractFunction('mooncakeDoesMarketTradeLogEntryCoverInstantTrade');
const normalizeListing = extractFunction('mooncakeNormalizeMarketTradeLogListing');
const planFill = extractFunction('mooncakePlanMarketTradeLogFill');
const buildEntry = extractFunction('mooncakeBuildMarketTradeLogEntry');
const tradeLogItemName = extractFunction('mooncakeGetMarketTradeLogItemName');
const normalizeFilterInteger = extractFunction('mooncakeNormalizeMarketTradeLogFilterInteger');
const normalizeFilterTimestamp = extractFunction('mooncakeNormalizeMarketTradeLogFilterTimestamp');
const parseDateTimeInput = extractFunction('mooncakeParseMarketTradeLogDateTimeInput');
const formatDateTimeInput = extractFunction('mooncakeFormatMarketTradeLogDateTimeInput');
const getDefaultDateRange = extractFunction('mooncakeGetDefaultMarketTradeLogDateRange');
const tradeLogEnhancementLevel = extractFunction('mooncakeGetMarketTradeLogEnhancementLevel');
const tradeLogItemLevel = extractFunction('mooncakeGetMarketTradeLogItemLevel');
const matchesFilter = extractFunction('mooncakeMarketTradeLogMatchesFilter');
const createSummaryAccumulator = extractFunction('mooncakeCreateMarketTradeLogSummaryAccumulator');
const schedulePageRefresh = extractFunction('mooncakeScheduleMarketTradeLogPageRefresh');
const invalidateArchivePage = extractFunction('mooncakeInvalidateOrderBookArchivePage');
const renderTradeLogPage = extractFunction('mooncakeRenderMarketTradeLogPage');
const createArchiveViewTabs = extractFunction('mooncakeCreateOrderBookArchiveViewTabs');
const sandbox = { Number, Math, String, Boolean, Date };

vm.runInNewContext(`
    function mooncakeGetMarketListingIdKey(value) {
        return value === undefined || value === null || value === '' ? '' : String(value);
    }
    function getItemName(itemHrid) {
        return {
            '/items/test_sword': 'Test Sword',
            '/items/test_herb': 'Test Herb'
        }[itemHrid] || itemHrid;
    }
    function getBaseItemLevel(itemHrid) {
        return {
            '/items/test_sword': 95,
            '/items/test_herb': 0
        }[itemHrid] || 0;
    }
    function mooncakeCollectionValues(value) {
        if (Array.isArray(value)) return value.filter(Boolean);
        if (value && typeof value === 'object') return Object.values(value).filter(Boolean);
        return [];
    }
    const MOONCAKE_INSTANT_MARKET_TRADE_DEDUPE_WINDOW_MS = 10000;
    ${normalizeQuantity}
    ${normalizeInstantRequest}
    ${inventoryQuantity}
    ${instantInventoryConfirm}
    ${buildInstantEntry}
    ${instantListingCover}
    ${instantTradeRecordCover}
    ${normalizeListing}
    ${planFill}
    ${buildEntry}
    ${tradeLogItemName}
    ${normalizeFilterInteger}
    ${normalizeFilterTimestamp}
    ${parseDateTimeInput}
    ${formatDateTimeInput}
    ${getDefaultDateRange}
    ${tradeLogEnhancementLevel}
    ${tradeLogItemLevel}
    ${matchesFilter}
    ${createSummaryAccumulator}
    globalThis.testApi = {
        normalizeInstantRequest: mooncakeNormalizeInstantMarketTradeRequest,
        inventoryQuantity: mooncakeGetMarketTradeLogInventoryQuantity,
        instantInventoryConfirm: mooncakeDoesInstantMarketTradeInventoryConfirm,
        buildInstantEntry: mooncakeBuildInstantMarketTradeLogEntry,
        instantListingCover: mooncakeDoesListingCoverInstantMarketTrade,
        instantTradeRecordCover: mooncakeDoesMarketTradeLogEntryCoverInstantTrade,
        normalizeListing: mooncakeNormalizeMarketTradeLogListing,
        planFill: mooncakePlanMarketTradeLogFill,
        buildEntry: mooncakeBuildMarketTradeLogEntry,
        parseDateTimeInput: mooncakeParseMarketTradeLogDateTimeInput,
        formatDateTimeInput: mooncakeFormatMarketTradeLogDateTimeInput,
        getDefaultDateRange: mooncakeGetDefaultMarketTradeLogDateRange,
        matchesFilter: mooncakeMarketTradeLogMatchesFilter,
        createSummaryAccumulator: mooncakeCreateMarketTradeLogSummaryAccumulator
    };
`, sandbox);

const instantRequest = sandbox.testApi.normalizeInstantRequest({
    type: 'post_market_order',
    postMarketOrderData: {
        isSell: true,
        itemHrid: '/items/test_herb',
        enhancementLevel: 0,
        quantity: 12,
        price: 321,
        isInstantOrder: true
    }
});
assert.deepEqual(JSON.parse(JSON.stringify(instantRequest)), {
    isSell: true,
    itemHrid: '/items/test_herb',
    enhancementLevel: 0,
    quantity: 12,
    unitPrice: 321
}, 'an instant sell request must retain its final market details');
assert.equal(sandbox.testApi.normalizeInstantRequest({
    type: 'post_market_order',
    postMarketOrderData: { ...instantRequest, isInstantOrder: false }
}), null, 'a regular listing must not enter the instant-trade fallback path');
assert.equal(sandbox.testApi.inventoryQuantity([{
    itemLocationHrid: '/item_locations/inventory',
    itemHrid: '/items/test_herb',
    enhancementLevel: 0,
    count: 0
}], '/items/test_herb', 0, true), 0,
'an inventory update that clears the final material stack must remain observable');
assert.equal(sandbox.testApi.inventoryQuantity([{
    itemLocationHrid: '/item_locations/inventory',
    itemHrid: '/items/test_sword',
    enhancementLevel: 12,
    count: 1
}], '/items/test_herb', 0, true), null,
'unrelated inventory updates must not confirm an instant material trade');
assert.equal(sandbox.testApi.instantInventoryConfirm({
    isSell: true, quantity: 2, inventoryBefore: 9
}, 7), true, 'a confirmed instant sale must reduce inventory by the requested quantity');
assert.equal(sandbox.testApi.instantInventoryConfirm({
    isSell: false, quantity: 2, inventoryBefore: 9
}, 11), true, 'a confirmed instant buy must increase inventory by the requested quantity');
assert.equal(sandbox.testApi.instantInventoryConfirm({
    isSell: true, quantity: 2, inventoryBefore: 9
}, 8), false, 'a partial or unrelated inventory update must not become a completed trade');
const instantEntry = sandbox.testApi.buildInstantEntry({
    ...instantRequest,
    characterId: '77',
    inventoryBefore: 12,
    sentAt: 1_000,
    sequence: 4
}, 2_000);
assert.deepEqual(JSON.parse(JSON.stringify(instantEntry)), {
    id: 'instant:77:1000:4',
    characterId: '77',
    listingId: 'instant-1000-4',
    side: 'sell',
    itemHrid: '/items/test_herb',
    itemLevel: '/items/test_herb#0',
    enhancementLevel: 0,
    quantity: 12,
    unitPrice: 321,
    grossAmount: 3852,
    fromFilledQuantity: 0,
    toFilledQuantity: 12,
    orderQuantity: 12,
    status: '/market_listing_status/filled',
    timestamp: 2_000,
    source: 'instant'
}, 'a confirmed instant trade must have an idempotent local record');
assert.equal(sandbox.testApi.instantListingCover({
    characterId: '77', itemHrid: '/items/test_herb', enhancementLevel: 0,
    isSell: true, unitPrice: 999, filledQuantity: 12
}, {
    ...instantRequest, characterId: '77'
}), true, 'a matching terminal listing must suppress the fallback even when the native price field differs');
assert.equal(sandbox.testApi.instantListingCover({
    characterId: '77', itemHrid: '/items/test_herb', enhancementLevel: 0,
    isSell: false, filledQuantity: 12
}, {
    ...instantRequest, characterId: '77'
}), false, 'the fallback must not confuse opposite market sides');
assert.equal(sandbox.testApi.instantTradeRecordCover({
    ...instantEntry,
    id: '77:901:0:12',
    source: 'live',
    unitPrice: 999,
    timestamp: 8_000
}, instantEntry), true, 'an ordinary record must replace the less-authoritative instant fallback');
assert.equal(sandbox.testApi.instantTradeRecordCover({
    ...instantEntry,
    id: '77:901:0:12',
    source: 'live',
    timestamp: 13_001
}, instantEntry), false, 'records outside the short confirmation window must remain independent trades');

const listing = sandbox.testApi.normalizeListing({
    id: 901,
    characterID: 77,
    itemHrid: '/items/test_sword',
    enhancementLevel: 12,
    isSell: true,
    price: 123_456_789,
    orderQuantity: 10,
    filledQuantity: 5,
    status: '/market_listing_status/active'
});
assert.deepEqual(JSON.parse(JSON.stringify(listing)), {
    listingId: '901',
    characterId: '77',
    itemHrid: '/items/test_sword',
    enhancementLevel: 12,
    isSell: true,
    unitPrice: 123_456_789,
    orderQuantity: 10,
    filledQuantity: 5,
    status: '/market_listing_status/active'
}, 'the trade log must preserve a completed listing identity and price');

assert.deepEqual(JSON.parse(JSON.stringify(sandbox.testApi.planFill(null, 5, 'snapshot'))), {
    fromFilled: 5,
    toFilled: 5,
    checkpoint: 5,
    delta: 0
}, 'the initial character snapshot must establish a fill baseline without inventing a historical trade');

const firstLiveEntry = sandbox.testApi.buildEntry(listing, null, 'incremental', 1_000);
assert.equal(firstLiveEntry.trade.quantity, 5, 'the first live terminal listing must record its full completed quantity');
assert.equal(firstLiveEntry.trade.grossAmount, 617_283_945, 'the trade log must retain a simple gross amount without accounting adjustments');
assert.equal(firstLiveEntry.trade.id, '77:901:0:5', 'trade IDs must be stable for duplicate WebSocket packets');

const laterListing = { ...listing, filledQuantity: 7 };
const laterEntry = sandbox.testApi.buildEntry(laterListing, firstLiveEntry.state, 'incremental', 2_000);
assert.equal(laterEntry.trade.quantity, 2, 'a cumulative fill update must record only the newly completed quantity');
assert.equal(laterEntry.trade.id, '77:901:5:7', 'a new fill checkpoint must create a distinct transaction record');
assert.equal(
    sandbox.testApi.buildEntry(laterListing, laterEntry.state, 'incremental', 3_000).trade,
    null,
    'a duplicate market packet must not create a duplicate transaction'
);

const tradeRow = {
    side: 'sell',
    itemHrid: '/items/test_sword',
    enhancementLevel: 12,
    timestamp: 1_726_000_000_000
};
assert.equal(sandbox.testApi.matchesFilter(tradeRow, {
    nameQuery: 'sword', enhancementLevel: '12', itemLevel: '95', side: 'sell'
}), true, 'the trade filter must combine item name, enhancement, item level, and side');
assert.equal(sandbox.testApi.matchesFilter(tradeRow, { enhancementLevel: '10' }), false, 'the enhancement filter must be exact');
assert.equal(sandbox.testApi.matchesFilter(tradeRow, { itemLevel: '85' }), false, 'the item-level filter must be exact');
assert.equal(sandbox.testApi.matchesFilter(tradeRow, { side: 'buy' }), false, 'the buy/sell filter must be exact');
assert.equal(sandbox.testApi.matchesFilter(tradeRow, {
    startTimestamp: tradeRow.timestamp,
    endTimestamp: tradeRow.timestamp
}), true, 'the chosen date range must include trades exactly on both boundaries');
assert.equal(sandbox.testApi.matchesFilter(tradeRow, {
    startTimestamp: tradeRow.timestamp + 1
}), false, 'the chosen start time must exclude older trades');
assert.equal(sandbox.testApi.matchesFilter(tradeRow, {
    endTimestamp: tradeRow.timestamp - 1
}), false, 'the chosen end time must exclude newer trades');
assert.equal(sandbox.testApi.matchesFilter({
    side: 'buy', itemHrid: '/items/test_herb', enhancementLevel: 0
}, { itemLevel: '0', enhancementLevel: '0', query: 'herb', side: 'buy' }), true,
'the non-equipment and legacy name-query filters must remain supported');

const summaryAccumulator = sandbox.testApi.createSummaryAccumulator();
[
    { itemHrid: '/items/test_sword', enhancementLevel: 12, side: 'sell', quantity: 3, unitPrice: 200, grossAmount: 600 },
    { itemHrid: '/items/test_sword', enhancementLevel: 12, side: 'sell', quantity: 2, unitPrice: 100, grossAmount: 200 },
    { itemHrid: '/items/test_sword', enhancementLevel: 12, side: 'buy', quantity: 4, unitPrice: 50, grossAmount: 200 }
].forEach(row => summaryAccumulator.add(row));
const itemSummary = summaryAccumulator.getSummary();
assert.equal(itemSummary.sellQuantity, 5, 'the summary must aggregate sell quantities');
assert.equal(itemSummary.sellAveragePrice, 160, 'the sell average must be weighted by completed quantity');
assert.equal(itemSummary.buyQuantity, 4, 'the summary must aggregate buy quantities');
assert.equal(itemSummary.buyAveragePrice, 50, 'the buy average must be weighted by completed quantity');
assert.equal(itemSummary.totalQuantity, 9, 'the summary must combine buy and sell quantities');
assert.ok(Math.abs(itemSummary.totalAveragePrice - (1000 / 9)) < 1e-9, 'the total average must be quantity-weighted');

const mixedItemAccumulator = sandbox.testApi.createSummaryAccumulator();
mixedItemAccumulator.add({ itemHrid: '/items/test_sword', enhancementLevel: 12, side: 'buy', quantity: 1, unitPrice: 100 });
mixedItemAccumulator.add({ itemHrid: '/items/test_sword', enhancementLevel: 13, side: 'buy', quantity: 1, unitPrice: 100 });
assert.equal(mixedItemAccumulator.getSummary(), null, 'different enhancement levels must not share a single-item summary');

const defaultRangeNow = new Date(2026, 8, 10, 12, 34, 45).getTime();
const defaultDateRange = sandbox.testApi.getDefaultDateRange(defaultRangeNow);
assert.equal(
    defaultDateRange.endTimestamp - defaultDateRange.startTimestamp,
    24 * 60 * 60 * 1000,
    'the default rolling date range must cover exactly the latest 24 hours'
);
assert.equal(
    defaultDateRange.endDateTime,
    sandbox.testApi.formatDateTimeInput(defaultRangeNow),
    'datetime-local values must be formatted in local time rather than UTC'
);
assert.equal(
    sandbox.testApi.parseDateTimeInput('2026-02-31T12:00'),
    null,
    'an invalid calendar date must not be silently normalized into another day'
);

assert.match(source, /indexedDB\.open\(MOONCAKE_ORDER_BOOK_ARCHIVE_DB, 2\)/, 'the existing archive database must upgrade in place');
assert.match(source, /MOONCAKE_MARKET_TRADE_LOG_STORE = 'trades'/, 'completed trades must have a dedicated IndexedDB store');
assert.match(source, /MOONCAKE_MARKET_TRADE_LOG_STATE_STORE = 'tradeListingState'/, 'listing fill checkpoints must persist separately from immutable trade rows');
assert.match(source, /mooncakeScheduleMarketTradeLogCapture\(\[obj\.myMarketListings\], 'snapshot'\)/, 'initial listings must create a non-duplicating baseline');
assert.match(source, /mooncakeScheduleMarketTradeLogCapture\(\[obj\.marketListings, obj\.endMarketListings\], 'incremental'\)/, 'market updates must capture completed trade deltas');
assert.match(source, /mooncakeTrackInstantMarketTradeRequest\(payload\)/, 'outbound instant market orders must enter the confirmation queue');
assert.match(source, /mooncakeResolvePendingInstantMarketTrades\(obj\.endCharacterItems, obj\.endMarketListings\)/, 'market updates must confirm instant orders from their inventory change');
assert.match(source, /MOONCAKE_INSTANT_MARKET_TRADE_FALLBACK_DELAY_MS = 900/, 'the instant fallback must wait for the standard listing capture');
assert.match(source, /mooncakeFilterUnrecordedInstantMarketTradeLogEntries/, 'the instant fallback must query for a standard record before writing');
assert.match(source, /mooncakeRemoveInstantMarketTradeLogDuplicates/, 'late standard records must remove an earlier instant fallback duplicate');
assert.match(source, /WebSocket\.prototype\.send = hookedSend/, 'the trade log must observe the game post-order request without touching its result');
assert.match(source, /if \(!listing \|\| listing\.characterId !== currentCharacterId\) return;/, 'the trade log must only retain the current character\'s listings');
assert.match(source, /data-mooncake-order-archive-view-tab/, 'the archive page must contain sub-tabs for snapshots and trade records');
assert.match(source, /data-mooncake-market-trade-log-enhancement/, 'the trade log must expose an enhancement-level filter');
assert.match(source, /data-mooncake-market-trade-log-item-level/, 'the trade log must expose an item-level filter');
assert.match(source, /data-mooncake-market-trade-log-start-time/, 'the trade log must expose an arbitrary start time');
assert.match(source, /data-mooncake-market-trade-log-end-time/, 'the trade log must expose an arbitrary end time');
assert.match(source, /type = 'datetime-local'/, 'the date range must retain minute-level local time precision');
assert.match(source, /endMinuteTimestamp \+ 60 \* 1000 - 1/, 'the selected end minute must be included in full');
assert.match(source, /\[normalizedCharacterId, lowerTimestamp\]/, 'the trade log query must start at the chosen IndexedDB timestamp boundary');
assert.match(source, /\[normalizedCharacterId, upperTimestamp\]/, 'the trade log query must stop at the chosen IndexedDB timestamp boundary');
assert.match(source, /data-mooncake-market-trade-log-filter/, 'the trade log filters must have visible labels');
assert.match(source, /data-mooncake-market-trade-log-summary/, 'single-item trade results must expose a summary row');
assert.match(source, /summaryAccumulator\.add\(cursor\.value\)/, 'the summary must include every matched IndexedDB row, not only the visible page');
assert.match(schedulePageRefresh, /_mooncakeRefreshMarketTradeLogResults/, 'background trade captures must refresh only the visible trade rows');
assert.doesNotMatch(schedulePageRefresh, /mooncakeRenderOrderBookArchivePage\(host\)/, 'background trade captures must not rebuild filter controls');
assert.match(invalidateArchivePage, /_mooncakeRefreshMarketTradeLogResults = null/, 'stale trade-row refresh callbacks must be invalidated with the archive page');
assert.match(renderTradeLogPage, /_mooncakeRefreshMarketTradeLogResults = refresh/, 'the rendered trade log must expose a rows-only refresher');
assert.match(renderTradeLogPage, /const \[\{ rows, hasMore, summary \}, total\]/, 'the result renderer must receive the full-filter summary with its page rows');
assert.match(renderTradeLogPage, /requestSequence !== refreshSequence/, 'out-of-order background reads must not overwrite a newer filter result');
assert.match(renderTradeLogPage, /rollingDateRange = dateRangeFollowsNow[\s\S]*?mooncakeGetDefaultMarketTradeLogDateRange\(\)/, 'the default latest-1d range must advance during background row refreshes');
assert.match(renderTradeLogPage, /startDateTime\.addEventListener\('input', freezeRollingDateRange\)/, 'editing the start time must protect an in-progress mobile picker value from background refresh');
assert.match(renderTradeLogPage, /endDateTime\.addEventListener\('input', freezeRollingDateRange\)/, 'editing the end time must protect an in-progress mobile picker value from background refresh');
assert.match(renderTradeLogPage, /startDateTime\.addEventListener\('change',[\s\S]*?dateRangeFollowsNow = false/, 'manually changing the start time must freeze the custom range');
assert.match(renderTradeLogPage, /endDateTime\.addEventListener\('change',[\s\S]*?dateRangeFollowsNow = false/, 'manually changing the end time must freeze the custom range');
assert.match(createArchiveViewTabs, /data-mooncake-order-archive-view-tab/, 'archive sub-tabs must use an attribute separate from the page view state');
assert.doesNotMatch(createArchiveViewTabs, /setAttribute\('data-mooncake-order-archive-view'/, 'archive sub-tabs must not reuse the host page-state attribute');
assert.match(source, /closest\?\.\('button\[data-mooncake-order-archive-view-tab\]'\)/, 'archive tab delegation must only match actual tab buttons');
assert.doesNotMatch(source, /closest\?\.\('\[data-mooncake-order-archive-view\]'\)/, 'filter clicks must not bubble into the archive host state attribute');

console.log('Market trade log checks passed.');
