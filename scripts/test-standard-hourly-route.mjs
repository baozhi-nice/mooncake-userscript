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

const equivalentCost = extractFunction('mooncakeGetRouteEquivalentCost');
const compareRoutes = extractFunction('mooncakeCompareStandardHourlyRoutes');
const selectRoute = extractFunction('mooncakeSelectStandardHourlyRoute');
const sandbox = {};
vm.runInNewContext(`
    const MOONCAKE_ROUTE_SELECTION_EPSILON = 1e-8;
    function mooncakeGetEnhancementStandardHourlyWage() { return 15e6; }
    ${equivalentCost}
    ${compareRoutes}
    ${selectRoute}
    globalThis.getEquivalentCost = mooncakeGetRouteEquivalentCost;
    globalThis.selectStandardRoute = mooncakeSelectStandardHourlyRoute;
`, sandbox);

const fasterMoreProtected = {
    routeType: 'traditional',
    protectAt: 2,
    totalCost: 3_430_140_000,
    totalTimeHours: 1220 / 3600
};
const slowerCheaper = {
    routeType: 'traditional',
    protectAt: 3,
    totalCost: 3_421_880_000,
    totalTimeHours: 1397 / 3600
};

const lowValuation = sandbox.selectStandardRoute(
    [fasterMoreProtected, slowerCheaper],
    { standardHourlyWage: 15e6 }
);
assert.equal(lowValuation.protectAt, 3, 'a low standard hourly value must prefer the cheaper route');
assert.equal(lowValuation.routeSelectionPolicy.type, 'standard-hourly-equivalent-cost');
assert.equal(lowValuation.routeSelectionPolicy.alternateRoute.protectAt, 2);

const highValuation = sandbox.selectStandardRoute(
    [fasterMoreProtected, slowerCheaper],
    { standardHourlyWage: 170e6 }
);
assert.equal(highValuation.protectAt, 2, 'a high standard hourly value must prefer the faster route');

const breakEvenHourly = (fasterMoreProtected.totalCost - slowerCheaper.totalCost) /
    (slowerCheaper.totalTimeHours - fasterMoreProtected.totalTimeHours);
assert.ok(Math.abs(breakEvenHourly - 168e6) < 1, 'the example breakpoint should remain 168M/h');
assert.ok(
    sandbox.getEquivalentCost(fasterMoreProtected, 15e6) > sandbox.getEquivalentCost(slowerCheaper, 15e6),
    'the lower valuation result must be based on equivalent cost rather than final item price'
);

const equalCostDifferentRisk = sandbox.selectStandardRoute([
    { routeType: 'traditional', protectAt: 2, totalCost: 100, totalTimeHours: 1 },
    { routeType: 'traditional', protectAt: 3, totalCost: 100, totalTimeHours: 1 }
], { standardHourlyWage: 15e6 });
assert.equal(equalCostDifferentRisk.protectAt, 2, 'equal equivalent costs must prefer earlier protection');

assert.match(source, /enhancementStandardHourlyM:\s*15/, 'standard hourly must have an independent default');
assert.match(source, /value === 'balanced'[\s\S]{0,140}?return 'standard'/, 'saved comprehensive-strategy selections must migrate to standard hourly');
assert.match(source, /\[\["hourly"[\s\S]{0,260}?\["standard", isZH \? '标准工时'/, 'settings must expose the Standard hourly route');
assert.match(source, /标准工时设定/, 'settings must expose the independent standard-hourly input');
assert.match(source, /仅供“标准工时”策略使用：按该工时算最低成本来判断保护等级。/, 'settings must explain how the standard hourly value determines protection');
assert.match(
    source,
    /grid-template-areas:"lazy inventory base-cost" "route protection base-cost" "standard-hourly anti-suicide-enhancement queue-next"/,
    'wide settings must put the standard-hourly input below the route selector and pin base-cost controls in the upper-right two rows'
);
assert.match(source, /if \(!\(Number\(price\) > 0\) && selectionMode !== 'standard'\) return null;/, 'standard hourly must remain available without a final-item quote');
assert.match(source, /mooncakeBuildMirrorRouteForObjective\(template, price, 'standard'/, 'mirror routes must use the same standard-hourly selection');

console.log('Standard hourly route checks passed.');
