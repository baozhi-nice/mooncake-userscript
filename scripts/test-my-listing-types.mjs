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

const helperNames = [
    'mooncakeNormalizeMyListingId',
    'mooncakeGetMyListingIdKey',
    'mooncakeNormalizeMyListingType',
    'mooncakeGetMyListingTypeStore',
    'mooncakeReadMyListingTypeEntry',
    'mooncakeGetMyListingType',
    'mooncakeSetMyListingType',
    'mooncakePruneMyListingTypes',
    'mooncakeGetMyListingTypePriority'
];

const sandbox = { now: 1000 * 60 * 60 * 24 * 61 };
vm.runInNewContext(`
    const MOONCAKE_MY_LISTING_TYPE_NORMAL = 'normal';
    const MOONCAKE_MY_LISTING_TYPE_IGNORE_UNDERCUT = 'ignore-undercut';
    const MOONCAKE_MY_LISTING_TYPE_PINNED = 'pinned';
    const MOONCAKE_MY_LISTING_TYPE_EXPIRY_MS = 1000 * 60 * 60 * 24 * 60;
    const config = { preferences: { myListingTypes: {} } };
    let mooncakeMyListingTypeLastPruneAt = 0;
    let saveCount = 0;
    const saveConfig = () => { saveCount += 1; };
    const Date = { now: () => globalThis.now };
    ${helperNames.map(extractFunction).join('\n')}
    globalThis.helpers = {
        normalizeType: mooncakeNormalizeMyListingType,
        getType: mooncakeGetMyListingType,
        setType: mooncakeSetMyListingType,
        prune: mooncakePruneMyListingTypes,
        priority: mooncakeGetMyListingTypePriority,
        getStore: () => config.preferences.myListingTypes,
        getSaveCount: () => saveCount
    };
`, sandbox);

assert.equal(sandbox.helpers.normalizeType('pinned'), 'pinned');
assert.equal(sandbox.helpers.normalizeType('ignore-undercut'), 'ignore-undercut');
assert.equal(sandbox.helpers.normalizeType('unexpected'), 'normal');

assert.equal(sandbox.helpers.setType(1001, 'pinned'), true);
assert.equal(sandbox.helpers.getType('1001'), 'pinned');
assert.equal(sandbox.helpers.setType(1002, 'ignore-undercut'), true);
assert.equal(sandbox.helpers.getType(1002), 'ignore-undercut');
assert.equal(sandbox.helpers.setType(1001, 'normal'), true);
assert.equal(sandbox.helpers.getType(1001), 'normal');
assert.equal(sandbox.helpers.getSaveCount(), 3, 'only actual type changes should persist');

const store = sandbox.helpers.getStore();
store.stale = { type: 'pinned', updatedAt: sandbox.now - (1000 * 60 * 60 * 24 * 60) - 1 };
store.fresh = { type: 'ignore-undercut', updatedAt: sandbox.now };
assert.equal(sandbox.helpers.prune(sandbox.now), true, 'expired listing rules should be cleaned up');
assert.equal('stale' in store, false);
assert.equal('fresh' in store, true);

assert.equal(sandbox.helpers.priority('pinned', false), 0);
assert.equal(sandbox.helpers.priority('normal', true), 1);
assert.equal(sandbox.helpers.priority('ignore-undercut', false), 1, 'ignore only moves in undercut mode');
assert.equal(sandbox.helpers.priority('ignore-undercut', true), 2, 'ignored undercuts must be last');

const resolverFunctionNames = [
    'mooncakeNormalizeMyListingId',
    'mooncakeGetMyListingIdKey',
    'mooncakeResolveMyListingIdFromLiveSnapshot'
];
const resolverSandbox = {};
vm.runInNewContext(`
    const mooncakeListingFundsListings = new Map([
        ['101', { id: '101', itemHrid: '/items/test_item', isSell: true, enhancementLevel: 10, price: 1234, orderQuantity: 1, filledQuantity: 0 }],
        ['202', { id: '202', itemHrid: '/items/test_item', isSell: true, enhancementLevel: 10, price: 1234, orderQuantity: 2, filledQuantity: 0 }]
    ]);
    let bootstrapCalls = 0;
    const mooncakeBootstrapListingFundsFromState = () => { bootstrapCalls += 1; return true; };
    ${resolverFunctionNames.map(extractFunction).join('\n')}
    globalThis.helpers = {
        resolve: mooncakeResolveMyListingIdFromLiveSnapshot,
        bootstrapCalls: () => bootstrapCalls
    };
`, resolverSandbox);

assert.equal(
    resolverSandbox.helpers.resolve({ itemHrid: '/items/test_item', isSell: true, enhancementLevel: 10, price: 1234, orderQuantity: 2, filledQuantity: 0 }),
    '202',
    'a visible row with matching quantity must resolve to its unique live listing'
);
assert.equal(
    resolverSandbox.helpers.resolve({ itemHrid: '/items/test_item', isSell: true, enhancementLevel: 10, price: 1234 }),
    '',
    'ambiguous listings must stay uneditable instead of receiving a wrong rule'
);
assert.equal(
    resolverSandbox.helpers.resolve({ listingId: 303 }),
    '303',
    'a direct native listing ID remains preferred'
);
assert.ok(resolverSandbox.helpers.bootstrapCalls() >= 2, 'the resolver should use the live listing snapshot when needed');

const progressSandbox = {};
vm.runInNewContext(`
    ${extractFunction('mooncakeReadMyListingProgress')}
    globalThis.readProgress = mooncakeReadMyListingProgress;
`, progressSandbox);
const parsedProgress = progressSandbox.readProgress('1,024 / 2,048');
assert.equal(parsedProgress.filledQuantity, 1024, 'row progress parsing must retain the filled quantity');
assert.equal(parsedProgress.orderQuantity, 2048, 'row progress parsing must preserve a usable order quantity for ID matching');

const orderingFunctionNames = [
    'mooncakeNormalizeMyListingId',
    'mooncakeGetMyListingIdKey',
    'mooncakeNormalizeMyListingType',
    'mooncakeGetMyListingTypePriority',
    'mooncakeGetMyListingManagementOrderKey',
    'mooncakeCaptureMyListingsManagementNativeOrder',
    'mooncakeGetMyListingsManagementNativeIndex',
    'mooncakeReorderMyListingsManagementRows',
    'mooncakeApplyMyListingsManagementOrder'
];
const orderingSandbox = {};
vm.runInNewContext(`
    const MOONCAKE_MY_LISTING_TYPE_NORMAL = 'normal';
    const MOONCAKE_MY_LISTING_TYPE_IGNORE_UNDERCUT = 'ignore-undercut';
    const MOONCAKE_MY_LISTING_TYPE_PINNED = 'pinned';
    const MOONCAKE_MY_LISTINGS_MANAGEMENT_SORTED_ATTR = 'data-sorted';
    const mooncakeMyListingsManagementNativeOrder = new WeakMap();
    const document = {
        createDocumentFragment: () => ({
            children: [],
            appendChild(row) { this.children.push(row); }
        })
    };
    ${orderingFunctionNames.map(extractFunction).join('\n')}
    globalThis.applyOrder = mooncakeApplyMyListingsManagementOrder;
`, orderingSandbox);

const tbody = {
    rows: [],
    appendChild(fragment) {
        this.rows = fragment.children;
        this.rows.forEach(row => { row.parentElement = this; });
    }
};
const tableAttributes = new Map();
const table = {
    tBodies: [tbody],
    getAttribute: key => tableAttributes.get(key) ?? null,
    setAttribute: (key, value) => tableAttributes.set(key, value),
    removeAttribute: key => tableAttributes.delete(key),
    querySelector: () => tbody
};
const nativeRows = ['normal', 'ignored', 'pinned'].map(name => ({ name, parentElement: tbody }));
tbody.rows = nativeRows;
const orderedRecords = [
    { row: nativeRows[0], descriptor: { listingId: 1 }, type: 'normal' },
    { row: nativeRows[1], descriptor: { listingId: 2 }, type: 'ignore-undercut' },
    { row: nativeRows[2], descriptor: { listingId: 3 }, type: 'pinned' }
];
orderingSandbox.applyOrder(table, orderedRecords, true);
assert.deepEqual(Array.from(tbody.rows, row => row.name), ['pinned', 'normal', 'ignored']);
orderedRecords.forEach(record => { record.type = 'normal'; });
orderingSandbox.applyOrder(table, orderedRecords, false);
assert.deepEqual(
    Array.from(tbody.rows, row => row.name),
    ['normal', 'ignored', 'pinned'],
    'clearing priority restores native order'
);

assert.match(source, /mooncakeEnsureMyListingsManagementTypeColumn\(table, results\)/, 'type controls must render with listing rows');
assert.match(source, /mooncakeApplyMyListingsManagementOrder\(table, results, undercutOnly\)/, 'type rules must affect table order');
assert.match(source, /MOONCAKE_MY_LISTINGS_MANAGEMENT_TYPE_HEADER_ATTR/, 'the desktop type column needs a header');
assert.match(source, /mooncakeResolveMyListingIdFromLiveSnapshot\(descriptor\)/, 'rows without a native ID must resolve against the live listing snapshot');
assert.match(source, /width:78px !important/, 'the type column must retain a fixed desktop width');
assert.match(source, /width:70px !important/, 'the type column must stay compact on mobile layouts');

console.log('My listing type checks passed.');
