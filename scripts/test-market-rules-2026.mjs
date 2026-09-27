import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

function extractFunction(name) {
    const asyncMarker = `async function ${name}(`;
    const regularMarker = `function ${name}(`;
    const asyncStart = source.indexOf(asyncMarker);
    const start = asyncStart >= 0 ? asyncStart : source.indexOf(regularMarker);
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

const pricingStart = source.indexOf('const MOONCAKE_MARKET_BIN_GAP_UNIT_TIERS');
const pricingEnd = source.indexOf('function mooncakeEstimateMarketHistorySideVolumes', pricingStart);
assert.notEqual(pricingStart, -1, 'the official marketplace bin-gap table must exist');
assert.notEqual(pricingEnd, -1, 'the marketplace bin-gap helper block must have a stable end marker');

const sandbox = {};
vm.runInNewContext(`
    ${source.slice(pricingStart, pricingEnd)}
    this.marketRules = {
        unitTiers: MOONCAKE_MARKET_BIN_GAP_UNIT_TIERS,
        binGap: mooncakeGetMarketPriceBinGap,
        snap: mooncakeSnapMarketPrice
    };
`, sandbox, { filename: 'mooncake-market-rules.js' });

const { unitTiers, binGap, snap } = sandbox.marketRules;
assert.deepEqual(
    Array.from(unitTiers, pair => Array.from(pair)),
    [[12, 4], [15, 5], [18, 6], [24, 8], [30, 10], [36, 12], [48, 16], [60, 20], [75, 25], [90, 30]],
    'bin-gap leading-two-digit thresholds must match the official test client'
);

const gapCases = [
    [2, 0, 1],
    [99, 10, 1],
    [100, 0, 1],
    [100, 1, 2],
    [200, 1, 5],
    [399, 1, 5],
    [400, 0, 2],
    [400, 1, 10],
    [800, 0, 4],
    [800, 1, 20],
    [1000, 0, 4],
    [1000, 1, 20],
    [1199, 0, 4],
    [1200, 0, 5],
    [1499, 0, 5],
    [1500, 0, 6],
    [1799, 0, 6],
    [1800, 0, 8],
    [2399, 0, 8],
    [2400, 0, 10],
    [2999, 0, 10],
    [3000, 0, 12],
    [3599, 0, 12],
    [3600, 0, 16],
    [4799, 0, 16],
    [4800, 0, 20],
    [5999, 0, 20],
    [6000, 0, 25],
    [7499, 0, 25],
    [7500, 0, 30],
    [8999, 0, 30],
    [9000, 0, 40],
    [10000, 0, 40],
    [10000, 12, 200]
];
for (const [price, enhancementLevel, expected] of gapCases) {
    assert.equal(
        binGap(price, enhancementLevel),
        expected,
        `unexpected bin gap for ${price} at +${enhancementLevel}`
    );
}
for (const [price, enhancementLevel, expected] of gapCases) {
    if (enhancementLevel !== 0 || price < 1000) continue;
    assert.equal(binGap(price, 10), expected * 5, `+10 must use the 5x bin gap at ${price}`);
}

const snapCases = [
    [1, 'down', 0, 2],
    [2, 'up', 10, 2],
    [101, 'down', 10, 100],
    [101, 'up', 10, 102],
    [398, 'down', 10, 395],
    [398, 'up', 10, 400],
    [401, 'down', 10, 400],
    [401, 'up', 10, 410],
    [1199, 'down', 10, 1180],
    [1199, 'up', 10, 1200],
    [1201, 'down', 10, 1200],
    [1201, 'up', 10, 1225],
    [1234, 'down', 0, 1230],
    [1234, 'up', 0, 1235],
    [1234, 'down', 10, 1225],
    [1234, 'up', 10, 1250],
    [1235.9, 'up', 0, 1235]
];
for (const [price, direction, enhancementLevel, expected] of snapCases) {
    assert.equal(
        snap(price, direction, enhancementLevel),
        expected,
        `unexpected ${direction} snap for ${price} at +${enhancementLevel}`
    );
}

assert.match(source, /const MOONCAKE_MARKET_SELL_TAX_RATE = 0\.04;/, 'the standard market tax must be 4%');
assert.match(
    source,
    /const listingPrice = listing\.workingPrice > 0 \? listing\.workingPrice : listing\.price;[\s\S]{0,140}?mooncakeGetMarketNetSaleUnitPrice\(listingPrice, listing\.itemHrid\)/,
    'listing funds must use the effective working price and the shared unit-settlement helper'
);
assert.match(
    source,
    /totalOutput \+= mooncakeGetMarketNetSaleUnitPrice\(outputPrice, output\.itemHrid\) \* output\.count;/,
    'alchemy output valuation must settle each unit before multiplying by quantity'
);
assert.doesNotMatch(source, /\b0\.82\b/, 'cowbell settlement must derive its net factor from the 18% tax rate');
assert.doesNotMatch(source, /MOONCAKE_MARKET_PRICE_TIERS|function mooncakeGetMarketPriceTier\(/, 'the legacy tier table must be removed');

assert.match(
    source,
    /processMarketHistory\(data, \{[\s\S]{0,100}?enhancementLevel: level/,
    'market-history bounds must receive their variant level'
);
assert.match(
    source,
    /undercutPrice = getPriceTier\(ask, 'down', enhancementLevel\)/,
    'enhanced market scanning must use the wider tick'
);
assert.match(
    source,
    /getAllPriceTiers\(ask, bid, enhancementLevel\)/,
    'enhancement analysis must use level-aware neighboring prices'
);
assert.match(
    source,
    /getPriceTier\(currentAsk, 'down', listing\.enhancementLevel\)/,
    'personal listings must calculate the enhanced one-tick undercut'
);
assert.match(
    source,
    /mooncakeSnapMarketPrice\(high, 'up', enhancementLevel\)/,
    'target-price search must snap with the order enhancement level'
);

const settlementSandbox = {};
vm.runInNewContext(`
    const MOONCAKE_MARKET_SELL_TAX_RATE = 0.04;
    const MOONCAKE_COWBELL_BAG_SELL_TAX_RATE = 0.18;
    ${extractFunction('mooncakeGetMarketSellTaxRate')}
    ${extractFunction('mooncakeGetMarketNetSaleUnitPrice')}
    ${extractFunction('mooncakeCalculateEnhancementRouteAtPrice')}
    function mooncakeGetEnhancementRoute() {
        return { totalCost: 90, totalTimeHours: 2 };
    }
    globalThis.netUnit = mooncakeGetMarketNetSaleUnitPrice;
    globalThis.enhancementRoute = mooncakeCalculateEnhancementRouteAtPrice;
`, settlementSandbox);

assert.equal(settlementSandbox.netUnit(101), 96, 'standard sale tax must floor the unit settlement');
assert.equal(
    settlementSandbox.netUnit(150, '/items/bag_of_10_cowbells'),
    123,
    'cowbell price 150 must settle to 123 by calculating 1 - 0.18 before flooring'
);
assert.equal(settlementSandbox.netUnit(7, '/items/coin'), 7, 'coin outputs must remain untaxed');
assert.equal(
    settlementSandbox.enhancementRoute('/items/test_equipment', 10, {}, 101).hourlyWage,
    3,
    'enhancement hourly economics must use the floored unit settlement'
);

const listingSandbox = {};
vm.runInNewContext(`
    const MOONCAKE_MARKET_SELL_TAX_RATE = 0.04;
    const MOONCAKE_COWBELL_BAG_SELL_TAX_RATE = 0.18;
    const mooncakeListingFundsListings = new Map();
    function mooncakeGetListingFundsId(listing) { return String(listing?.id || ''); }
    function mooncakeBootstrapListingFundsFromState() { return true; }
    ${extractFunction('mooncakeGetMarketSellTaxRate')}
    ${extractFunction('mooncakeGetMarketNetSaleUnitPrice')}
    ${extractFunction('mooncakeNormalizeListingFundsNumber')}
    ${extractFunction('mooncakeNormalizeListingFundsListing')}
    ${extractFunction('mooncakeGetListingFundsTotals')}
    globalThis.normalizeListing = mooncakeNormalizeListingFundsListing;
    globalThis.addListing = listing => mooncakeListingFundsListings.set(listing.id, listing);
    globalThis.getTotals = mooncakeGetListingFundsTotals;
`, listingSandbox);

const cowbellListing = listingSandbox.normalizeListing({
    id: 'cowbells',
    isSell: true,
    itemHrid: '/items/bag_of_10_cowbells',
    orderQuantity: 3,
    filledQuantity: 1,
    price: 100,
    workingPrice: 150
});
const regularListing = listingSandbox.normalizeListing({
    id: 'regular',
    isSell: true,
    itemHrid: '/items/test_material',
    orderQuantity: 2,
    filledQuantity: 0,
    price: 101,
    workingPrice: 0
});
assert.equal(cowbellListing.workingPrice, 150, 'listing snapshots must preserve the working price');
listingSandbox.addListing(cowbellListing);
listingSandbox.addListing(regularListing);
assert.equal(
    listingSandbox.getTotals().sellProceeds,
    438,
    'active proceeds must use workingPrice when positive and floor each unit before quantity'
);

const alchemySandbox = {};
vm.runInNewContext(`
    const MOONCAKE_MARKET_SELL_TAX_RATE = 0.04;
    const MOONCAKE_COWBELL_BAG_SELL_TAX_RATE = 0.18;
    const itemDetailMap = { '/items/input': { alchemyDetail: { bulkMultiplier: 1 } } };
    function getInitClientData() { return { itemDetailMap }; }
    function getAlchemyPriceMode() { return 'market'; }
    function getAlchemyPriceSides() { return { costSide: 'ask', outputSide: 'bid' }; }
    function mooncakeGetAlchemyActionCoinCost() { return 0; }
    function mooncakeGetStrictAlchemyMarketPrice(itemHrid) {
        return ({
            '/items/input': 101,
            '/items/bag_of_10_cowbells': 150,
            '/items/output': 101,
            '/items/coin': 7
        })[itemHrid] || 0;
    }
    ${extractFunction('mooncakeGetMarketSellTaxRate')}
    ${extractFunction('mooncakeGetMarketNetSaleUnitPrice')}
    ${extractFunction('mooncakeCalculateAlchemyLootEconomics')}
    globalThis.calculateAlchemy = mooncakeCalculateAlchemyLootEconomics;
`, alchemySandbox);

const alchemy = alchemySandbox.calculateAlchemy({
    actionKey: 'alchemy',
    inputItemHrid: '/items/input',
    inputEnhancementLevel: 0,
    attempts: 2,
    outputs: [
        { itemHrid: '/items/bag_of_10_cowbells', enhancementLevel: 0, count: 2 },
        { itemHrid: '/items/output', enhancementLevel: 0, count: 2 },
        { itemHrid: '/items/coin', enhancementLevel: 0, count: 3 }
    ]
}, {});
assert.equal(alchemy.inputCost, 202, 'alchemy input purchases must remain untaxed');
assert.equal(alchemy.totalOutput, 459, 'alchemy outputs must floor net sale value per unit before quantity');
assert.equal(alchemy.profit, 257);

const orderEconomicsSandbox = {};
vm.runInNewContext(`
    const MOONCAKE_MARKET_SELL_TAX_RATE = 0.04;
    const MOONCAKE_COWBELL_BAG_SELL_TAX_RATE = 0.18;
    const MOONCAKE_MARKET_SELL_NET_FACTOR = 1 - MOONCAKE_MARKET_SELL_TAX_RATE;
    function mooncakeCalculateEnhancementRouteAtPrice() {
        return { totalCost: 90, totalTimeHours: 2 };
    }
    function mooncakeEvaluateEnhancementEconomics() { return null; }
    ${extractFunction('mooncakeGetMarketSellTaxRate')}
    ${extractFunction('mooncakeGetMarketNetSaleUnitPrice')}
    ${extractFunction('mooncakeCalculateOrderModalEconomicsAtTaxMode')}
    globalThis.calculateOrderEconomics = mooncakeCalculateOrderModalEconomicsAtTaxMode;
`, orderEconomicsSandbox);

const taxedOrder = orderEconomicsSandbox.calculateOrderEconomics('/items/test_equipment', 10, 101, {}, 'after-tax');
assert.equal(taxedOrder.netPrice, 96, 'sell-order economics must use floored unit settlement');
assert.equal(taxedOrder.hourlyWage, 3);
const untaxedOrder = orderEconomicsSandbox.calculateOrderEconomics('/items/test_equipment', 10, 101, {}, 'before-tax');
assert.equal(untaxedOrder.netPrice, 101, 'buy-order economics must preserve the untaxed unit price');
assert.equal(untaxedOrder.hourlyWage, 5.5);

const recoverySandbox = { snapMarketPrice: snap };
vm.runInNewContext(`
    const MOONCAKE_MARKET_SELL_TAX_RATE = 0.04;
    const MOONCAKE_COWBELL_BAG_SELL_TAX_RATE = 0.18;
    const MOONCAKE_ORDER_TARGET_PRICE_MAX = 1e12;
    const itemDetails = {
        '/items/low_floor': { sellPrice: 2 },
        '/items/vendor_floor': { sellPrice: 125 },
        '/items/bag_of_10_cowbells': { sellPrice: 2 }
    };
    function mooncakeGetItemDetailOfHrid(itemHrid) { return itemDetails[itemHrid] || null; }
    function mooncakeSnapMarketPrice(price, direction, enhancementLevel) {
        return globalThis.snapMarketPrice(price, direction, enhancementLevel);
    }
    ${extractFunction('mooncakeGetMarketSellTaxRate')}
    ${extractFunction('mooncakeGetMarketNetSaleUnitPrice')}
    ${extractFunction('mooncakeGetOrderTargetPriceBounds')}
    ${extractFunction('mooncakeRecoverOrderModalGrossUnitPrice')}
    globalThis.netUnit = mooncakeGetMarketNetSaleUnitPrice;
    globalThis.recoverGross = mooncakeRecoverOrderModalGrossUnitPrice;
`, recoverySandbox);

assert.equal(
    recoverySandbox.recoverGross('/items/low_floor', 10, 192, 2),
    100,
    'sell-total fallback must recover a legal enhanced price whose unit settlement is exact'
);
assert.equal(
    recoverySandbox.recoverGross('/items/bag_of_10_cowbells', 0, 246, 2),
    150,
    'cowbell sell-total fallback must invert the 18% tax without fractional division'
);
assert.equal(
    Number.isNaN(recoverySandbox.recoverGross('/items/low_floor', 10, 193, 2)),
    true,
    'a total that is not an exact multiple of unit settlement must not invent a price'
);
assert.equal(
    Number.isNaN(recoverySandbox.recoverGross('/items/vendor_floor', 10, 96, 1)),
    true,
    'the recovered gross candidate must respect the item sell-price floor'
);
assert.equal(
    recoverySandbox.recoverGross(
        '/items/low_floor',
        10,
        recoverySandbox.netUnit(1e12, '/items/low_floor'),
        1
    ),
    1e12,
    'the capped gross candidate must remain recoverable when settlement is exact'
);
assert.equal(
    Number.isNaN(recoverySandbox.recoverGross(
        '/items/low_floor',
        10,
        recoverySandbox.netUnit(1e12, '/items/low_floor') + 1,
        1
    )),
    true,
    'the sell-total fallback must reject candidates beyond the 1T cap'
);
assert.doesNotMatch(
    extractFunction('mooncakeGetOrderModalUnitPrice'),
    /total\s*\/\s*MOONCAKE_MARKET_SELL_NET_FACTOR/,
    'sell-total fallback must not use fractional net-factor inversion'
);
assert.match(
    extractFunction('mooncakeGetOrderModalUnitPrice'),
    /return total \/ quantity;/,
    'buy-total fallback must remain untaxed'
);

const targetSandbox = { evaluatedPrices: [], snapMarketPrice: snap };
vm.runInNewContext(`
    const MOONCAKE_MARKET_SELL_NET_FACTOR = 0.96;
    const MOONCAKE_ORDER_TARGET_HOURLY_SEARCH_STEPS = 56;
    const MOONCAKE_ORDER_TARGET_PRICE_MAX = 1e12;
    const itemDetails = {
        '/items/vendor_floor': { sellPrice: 125 },
        '/items/too_expensive': { sellPrice: 1e12 + 1 }
    };
    function mooncakeGetItemDetailOfHrid(itemHrid) { return itemDetails[itemHrid] || null; }
    function mooncakeSnapMarketPrice(price, direction, enhancementLevel) {
        return globalThis.snapMarketPrice(price, direction, enhancementLevel);
    }
    function mooncakeCalculateOrderModalEconomics(itemHrid, enhancementLevel, orderType, price) {
        globalThis.evaluatedPrices.push(price);
        return { hourlyWage: price, route: { totalCost: 0, totalTimeHours: 1 } };
    }
    ${extractFunction('mooncakeGetOrderTargetPriceBounds')}
    ${extractFunction('mooncakeCalculateOrderModalTargetPrice')}
    globalThis.getBounds = mooncakeGetOrderTargetPriceBounds;
    globalThis.calculateTarget = mooncakeCalculateOrderModalTargetPrice;
`, targetSandbox);

assert.deepEqual(
    { ...targetSandbox.getBounds('/items/vendor_floor') },
    { min: 125, max: 1e12 },
    'target bounds must combine the item vendor price floor with the 1T cap'
);
assert.equal(
    targetSandbox.calculateTarget('/items/vendor_floor', 10, 'buy', 50, 100, {}).price,
    126,
    'a low target must stop at the first valid market tick at or above the item sell-price floor'
);
assert.equal(
    targetSandbox.calculateTarget('/items/vendor_floor', 10, 'buy', 125, 1e12, {}).price,
    1e12,
    'the upper bound itself must remain reachable'
);
assert.equal(
    targetSandbox.calculateTarget('/items/vendor_floor', 10, 'buy', 125, 1e12 + 1, {}),
    null,
    'an unreachable target above the 1T cap must fail clearly'
);
assert.equal(
    targetSandbox.calculateTarget('/items/too_expensive', 10, 'buy', 1e12, 0, {}),
    null,
    'an item floor above the cap must fail instead of escaping the bounds'
);
assert.equal(
    targetSandbox.evaluatedPrices.every(price => price >= 125 && price <= 1e12),
    true,
    'the target search must never evaluate prices outside its bounds'
);

const setterSandbox = { snapMarketPrice: snap };
vm.runInNewContext(`
    const MOONCAKE_ORDER_TARGET_PRICE_MAX = 1e12;
    const writtenPrices = [];
    class HTMLInputElement {
        focus() {}
        blur() {}
    }
    const input = new HTMLInputElement();
    function mooncakeGetItemDetailOfHrid() { return { sellPrice: 125 }; }
    function mooncakeGetOrderModalItemHrid() { return '/items/vendor_floor'; }
    function mooncakeGetOrderModalEnhancementLevel() { return 10; }
    function mooncakeSnapMarketPrice(price, direction, enhancementLevel) {
        return globalThis.snapMarketPrice(price, direction, enhancementLevel);
    }
    async function mooncakeGetEditableOrderModalPriceInput() { return input; }
    function mooncakeSetEnhanceRepeatCount(target, price) {
        if (target !== input) return false;
        writtenPrices.push(price);
        return true;
    }
    function mooncakeWaitForOrderModalFrame() { return Promise.resolve(); }
    function mooncakeFindOrderModalPriceInput() { return input; }
    ${extractFunction('mooncakeGetOrderTargetPriceBounds')}
    ${extractFunction('mooncakeSetOrderModalUnitPrice')}
    globalThis.setPrice = mooncakeSetOrderModalUnitPrice;
    globalThis.writtenPrices = writtenPrices;
`, setterSandbox);

assert.equal(await setterSandbox.setPrice({}, 124), false, 'the setter must reject prices below the item floor');
assert.equal(await setterSandbox.setPrice({}, 125), true, 'the setter must accept the lower bound');
assert.equal(await setterSandbox.setPrice({}, 1e12), true, 'the setter must accept the upper bound');
assert.equal(await setterSandbox.setPrice({}, 1e12 + 1), false, 'the setter must reject prices above 1T');
assert.deepEqual(Array.from(setterSandbox.writtenPrices), [126, 1e12]);

console.log('2026 marketplace tax and bin-gap checks passed.');
