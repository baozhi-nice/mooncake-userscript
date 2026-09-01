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

const marketRouteHelper = extractFunction('mooncakeGetEnhanceMarketPlanMarketRoute');
const sandbox = { calls: [] };
vm.runInNewContext(`
    const calls = globalThis.calls;
    function mooncakeCalculateEnhancementRouteAtPrice(itemHrid, targetLevel, marketData, price) {
        calls.push({ itemHrid, targetLevel, marketData, price });
        if (marketData.throwRoute) throw new Error('route failure');
        return marketData.route;
    }
    ${marketRouteHelper}
    globalThis.getMarketPlanRoute = mooncakeGetEnhanceMarketPlanMarketRoute;
`, sandbox);

const marketData = {
    route: {
        routeType: 'traditional',
        protectAt: 7,
        expectedActions: 38.5,
        expectedProtects: 11.2,
        totalCost: 277_950_000,
        totalTimeHours: 3.8,
        hourlyWage: 7_380_000
    }
};
const displayedRoute = sandbox.getMarketPlanRoute('/items/knight_shield', 10, marketData, 306_000_000);
assert.equal(sandbox.calls.length, 1, 'market-plan display must use the shared market route calculator');
assert.equal(sandbox.calls[0].itemHrid, '/items/knight_shield');
assert.equal(sandbox.calls[0].targetLevel, 10);
assert.equal(sandbox.calls[0].price, 306_000_000);
assert.equal(sandbox.calls[0].marketData.route.hourlyWage, 7_380_000);
assert.equal(displayedRoute.hourlyWage, 7_380_000, 'displayed wage must come directly from the full market route');
assert.equal(displayedRoute.targetLevel, 10, 'displayed market route must retain the quoted level');
assert.equal(displayedRoute.targetPrice, 306_000_000, 'displayed market route must retain the quoted price');
assert.equal(sandbox.getMarketPlanRoute('/items/knight_shield', 0, marketData, 306_000_000), null, 'level zero must not create an enhancement route');
assert.equal(sandbox.getMarketPlanRoute('/items/knight_shield', 10, { throwRoute: true }, 306_000_000), null, 'a failed market route must leave only that quote unavailable');

assert.match(
    source,
    /function calcHourlyWageAndMetrics\([\s\S]{0,700}?mooncakeCalculateEnhancementRouteAtPrice\(/,
    'marketplace order rows must continue to use the shared market route calculator'
);
assert.match(
    source,
    /sellMarketRoute = quote\.ask > 0\s*\? mooncakeGetEnhanceMarketPlanMarketRoute\(itemHrid, quote\.level, marketData, quote\.ask\)/,
    'ask references must obtain their displayed wage from the market route'
);
assert.match(
    source,
    /buyMarketRoute = quote\.bid > 0\s*\? mooncakeGetEnhanceMarketPlanMarketRoute\(itemHrid, quote\.level, marketData, quote\.bid\)/,
    'bid references must obtain their displayed wage from the market route'
);
assert.match(
    source,
    /const marketHourlyWage = Number\(marketRoute\?\.hourlyWage\);/,
    'the market-plan row must render the market route wage instead of the current-item plan wage'
);
assert.match(
    source,
    /mooncakeSetEnhanceMarketPlanRowRouteData\(row, 'ask', sellRecommendation\)/,
    'current-item recommendation data must remain responsible for row selection'
);
assert.match(
    source,
    /await mooncakeApplyEnhanceQuickRecommendation\(panel, recommendation\);/,
    'left click must continue applying the current-item recommendation'
);
assert.match(
    source,
    /mooncakeMarketPricingRevision,\s*pricingContext\?\.dependencySignature/,
    'market-plan rows must redraw when a market pricing revision changes the full route'
);
assert.match(
    source,
    /function mooncakeRefreshExternalMarketPricingSurfaces\(\)[\s\S]{0,500}?scheduleMooncakeEnhanceProtectionBuyBox\(0\)/,
    'external market refreshes must schedule the visible enhancement reference to redraw'
);
assert.match(
    source,
    /if \(priceChanged\) \{[\s\S]{0,300}?scheduleMooncakeEnhanceProtectionBuyBox\(0\)/,
    'live game order-book refreshes must schedule the visible enhancement reference to redraw'
);

console.log('Market hourly consistency checks passed.');
