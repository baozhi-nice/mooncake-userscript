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

const orderBookScheduler = extractFunction('scheduleMarketplaceOrderBookHourlyWageRefresh');
const orderBookSandbox = {
    mooncakeMarketplacePricingSurfaceState: false,
    _pendingOrderBookRaf: null,
    scheduledFrames: 0
};
vm.runInNewContext(`
    globalThis.requestAnimationFrame = () => {
        globalThis.scheduledFrames += 1;
        return 1;
    };
    ${orderBookScheduler}
    globalThis.scheduleOrderBook = scheduleMarketplaceOrderBookHourlyWageRefresh;
`, orderBookSandbox);
orderBookSandbox.scheduleOrderBook();
assert.equal(orderBookSandbox.scheduledFrames, 0, 'a hidden marketplace must not enqueue background order-book work');
orderBookSandbox.scheduleOrderBook({ force: true });
assert.equal(orderBookSandbox.scheduledFrames, 1, 'a native market mutation must still force one order-book verification');

const warehouseActiveRoot = extractFunction('mooncakeWarehouseGetActiveRootForMutations');
const visibleRoot = { isConnected: true };
const warehouseSandbox = {
    mooncakeWarehouseInventoryRoot: visibleRoot,
    mooncakeWarehouseObservedRoot: visibleRoot,
    mooncakeWarehouseObservedRootVisible: false,
    mooncakeWarehouseLastMissingRootProbeAt: 0,
    performance: { now: () => 1000 },
    rootLookups: 0
};
vm.runInNewContext(`
    globalThis.mooncakeWarehouseFindInventoryRoot = () => {
        globalThis.rootLookups += 1;
        return { isConnected: true };
    };
    ${warehouseActiveRoot}
    globalThis.getActiveWarehouseRoot = mooncakeWarehouseGetActiveRootForMutations;
`, warehouseSandbox);
assert.equal(warehouseSandbox.getActiveWarehouseRoot(), null, 'a mounted but hidden inventory must defer to its visibility observer');
assert.equal(warehouseSandbox.rootLookups, 0, 'hidden inventory must not trigger a root lookup for every document mutation');
warehouseSandbox.mooncakeWarehouseInventoryRoot = null;
assert.ok(warehouseSandbox.getActiveWarehouseRoot(), 'a missing root must still be discovered after the probe interval');
assert.equal(warehouseSandbox.rootLookups, 1, 'the first missing-root probe must query once');
warehouseSandbox.performance.now = () => 1200;
assert.equal(warehouseSandbox.getActiveWarehouseRoot(), null, 'missing-root probes must be throttled during mutation bursts');
assert.equal(warehouseSandbox.rootLookups, 1, 'the throttled probe must not repeat the document query');

assert.match(
    source,
    /const refreshVisibleMarketplacePricing = mooncakeMarketplacePricingSurfaceState !== false;/,
    'live market packets must know whether a visible pricing surface still exists'
);
assert.match(
    source,
    /refreshVisibleMarketplacePricing && typeof scheduleMarketplaceHourlyWageRefresh === 'function'/,
    'background quote packets must skip hourly table and navigation work after the market closes'
);
assert.match(
    source,
    /scheduleMarketplaceOrderBookHourlyWageRefresh\(\{ force: true \}\)/,
    'native order-book mutations must bypass the hidden-surface fast path'
);
assert.match(
    source,
    /scheduleMarketplaceHourlyWageRefresh\(\{ force: true \}\);/,
    'user market controls must recheck a table that React reveals without child nodes'
);
assert.match(
    source,
    /scanRoots\.some\(parent => parent\.contains\(root\)\)/,
    'nested enhancement-level mutation roots must be coalesced before selector scans'
);

console.log('Performance guard checks passed.');
