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

function createStyle(values = {}, priorities = {}) {
    return {
        values: { ...values },
        priorities: { ...priorities },
        getPropertyValue(property) {
            return this.values[property] || '';
        },
        getPropertyPriority(property) {
            return this.priorities[property] || '';
        },
        setProperty(property, value, priority = '') {
            this.values[property] = String(value);
            this.priorities[property] = String(priority);
        },
        removeProperty(property) {
            delete this.values[property];
            delete this.priorities[property];
        }
    };
}

const canRetainFunction = extractFunction('mooncakeWarehouseCanRetainCurrentEquipmentNode');
const repairFunction = extractFunction('mooncakeWarehouseCurrentEquipmentNeedsRepair');
const root = { contains: node => node.insideRoot !== false };
const node = {
    isConnected: true,
    insideRoot: true,
    itemHrid: '/items/test_sword',
    hasItem: true,
    querySelector() {
        return this.hasItem ? {} : null;
    }
};
const repairSandbox = {
    mooncakeWarehouseNormalizeItemHrid: value => value,
    mooncakeGetItemHridFromContainer: value => value.itemHrid
};
vm.runInNewContext(`
    ${canRetainFunction}
    ${repairFunction}
    globalThis.needsRepair = mooncakeWarehouseCurrentEquipmentNeedsRepair;
`, repairSandbox);

const currentTarget = { node, role: 'current-equipment', hidden: false };
assert.equal(repairSandbox.needsRepair(currentTarget, root), false, 'a complete current card must keep the fast path');
assert.equal(
    repairSandbox.needsRepair({ ...currentTarget, opacity: 0, transform: 'scale(.9)' }, root),
    false,
    'temporary native leave styles must not trigger a Mooncake repair loop'
);
node.itemHrid = '';
assert.equal(repairSandbox.needsRepair(currentTarget, root), true, 'an empty current identity must not pass integrity checks');
node.itemHrid = '/items/test_sword';
node.hasItem = false;
assert.equal(repairSandbox.needsRepair(currentTarget, root), true, 'a removed item shell must request a settled reconcile');
node.hasItem = true;
node.isConnected = false;
assert.equal(repairSandbox.needsRepair(currentTarget, root), true, 'a detached current card must request a settled reconcile');
node.isConnected = true;
assert.equal(
    repairSandbox.needsRepair({ ...currentTarget, role: 'queued-equipment' }, root),
    false,
    'the current-card reconcile check must stay limited to the current card'
);

const clearLeaseFunction = extractFunction('mooncakeWarehouseClearCurrentEquipmentLease');
const scheduleLeaseExpiryFunction = extractFunction('mooncakeWarehouseScheduleCurrentEquipmentLeaseExpiry');
const rememberCurrentFunction = extractFunction('mooncakeWarehouseRememberCurrentEquipment');
const getCurrentHandoffLeaseFunction = extractFunction('mooncakeWarehouseGetCurrentEquipmentHandoffLease');
const startCurrentHandoffFunction = extractFunction('mooncakeWarehouseStartCurrentEquipmentHandoff');
const getCurrentLeaseFunction = extractFunction('mooncakeWarehouseGetCurrentEquipmentLease');
let leaseNow = 1000;
const leaseTimers = [];
const leaseRoot = { contains: value => value === node };
const leaseSandbox = {
    Date: { now: () => leaseNow },
    Math,
    MOONCAKE_WAREHOUSE_CURRENT_EQUIPMENT_LEASE_MS: 420,
    mooncakeWarehouseCurrentEquipmentLease: null,
    mooncakeWarehouseCurrentEquipmentLeaseTimer: 0,
    mooncakeWarehouseNormalizeItemHrid: value => value,
    mooncakeGetItemHridFromContainer: value => value.itemHrid,
    setTimeout(callback, delay) {
        leaseTimers.push({ callback, delay });
        return leaseTimers.length;
    },
    clearTimeout() {},
    mooncakeWarehouseInvalidateInventoryEntries() {},
    mooncakeScheduleWarehouseRender() {}
};
vm.runInNewContext(`
    ${canRetainFunction}
    ${clearLeaseFunction}
    ${scheduleLeaseExpiryFunction}
    ${rememberCurrentFunction}
    ${getCurrentHandoffLeaseFunction}
    ${startCurrentHandoffFunction}
    ${getCurrentLeaseFunction}
    globalThis.rememberCurrent = mooncakeWarehouseRememberCurrentEquipment;
    globalThis.getCurrentHandoffLease = mooncakeWarehouseGetCurrentEquipmentHandoffLease;
    globalThis.getCurrentLease = mooncakeWarehouseGetCurrentEquipmentLease;
`, leaseSandbox);
node.insideRoot = true;
leaseSandbox.rememberCurrent({ ...currentTarget, point: { left: 12, top: 34 } }, leaseRoot);
assert.equal(leaseSandbox.mooncakeWarehouseCurrentEquipmentLease.expiresAt, 0, 'a live current card must not start its expiry timer');
const liveLease = leaseSandbox.getCurrentLease(leaseRoot);
assert.equal(liveLease.point.left, 12, 'a drawable current card must retain its stable horizontal placement');
assert.equal(liveLease.expiresAt, 0, 'a drawable current card must not consume the handoff window');
node.isConnected = false;
assert.equal(leaseSandbox.getCurrentLease(leaseRoot), null, 'a removed source card must not be rendered as the current card');
const lease = leaseSandbox.getCurrentHandoffLease(leaseRoot);
assert.equal(lease.point.left, 12, 'the lease must preserve the last stable horizontal placement');
assert.equal(lease.point.top, 34, 'the lease must preserve the last stable vertical placement');
assert.equal(lease.expiresAt, 1420, 'a missing replacement may retain the last stable card for one short handoff window');
assert.equal(leaseTimers[0].delay, 421, 'the expiry wakeup must follow the handoff window');
leaseNow = 1421;
assert.equal(leaseSandbox.getCurrentHandoffLease(leaseRoot), null, 'an expired lease must release the old icon');
node.isConnected = true;

const restoreOwnedFunction = extractFunction('mooncakeWarehouseRestoreOwnedInlineStyle');
const restoredNode = {
    style: createStyle({ display: 'block', opacity: '1', transform: 'none' })
};
const restoredOwnedStyles = new Map([
    ['display', { value: 'block', priority: '' }],
    ['opacity', { value: '1', priority: '' }],
    ['transform', { value: 'none', priority: '' }]
]);
const restoreSandbox = {
    mooncakeWarehouseNodeStyleSnapshots: new WeakMap([[
        restoredNode,
        {
            display: { value: '', priority: '' },
            opacity: { value: '0.8', priority: '' },
            transform: { value: 'scale(0.9)', priority: '' }
        }
    ]]),
    mooncakeWarehouseOwnedInlineStyles: new WeakMap([[restoredNode, restoredOwnedStyles]])
};
vm.runInNewContext(`
    ${restoreOwnedFunction}
    globalThis.restoreOwned = mooncakeWarehouseRestoreOwnedInlineStyle;
`, restoreSandbox);
for (const property of ['display', 'opacity', 'transform']) restoreSandbox.restoreOwned(restoredNode, property);
assert.equal(restoredNode.style.getPropertyValue('display'), '', 'current-to-queued must restore the native display');
assert.equal(restoredNode.style.getPropertyValue('opacity'), '0.8', 'current-to-queued must restore the native opacity');
assert.equal(restoredNode.style.getPropertyValue('transform'), 'scale(0.9)', 'current-to-queued must restore the native transform');
assert.equal(restoredOwnedStyles.size, 0, 'restored current-only styles must release ownership');

const disconnectObserverFunction = extractFunction('mooncakeWarehouseDisconnectCurrentEquipmentObserver');
const observeCurrentFunction = extractFunction('mooncakeWarehouseObserveCurrentEquipment');
const observerInstances = [];
class FakeMutationObserver {
    constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        observerInstances.push(this);
    }
    observe(target, options) {
        this.target = target;
        this.options = options;
    }
    disconnect() {
        this.disconnected = true;
    }
}
const observedNode = {
    isConnected: true,
    signature: '/items/test_sword|4|1',
    needsRepair: false
};
const observedRoot = { contains: value => value === observedNode };
const scheduledReasons = [];
const observerSandbox = {
    MutationObserver: FakeMutationObserver,
    mooncakeWarehouseCurrentEquipmentObserver: null,
    mooncakeWarehouseObservedCurrentEquipment: null,
    mooncakeWarehouseObservedCurrentEquipmentSignature: '',
    mooncakeWarehouseObservedCurrentEquipmentRoot: null,
    mooncakeWarehouseGetCurrentEquipmentDomSignature: value => value.signature,
    mooncakeWarehouseCurrentEquipmentNeedsRepair: target => target.node.needsRepair,
    mooncakeScheduleWarehouseRender: reason => scheduledReasons.push(reason)
};
vm.runInNewContext(`
    ${disconnectObserverFunction}
    ${observeCurrentFunction}
    globalThis.observeCurrent = mooncakeWarehouseObserveCurrentEquipment;
`, observerSandbox);
observerSandbox.observeCurrent(observedNode, observedRoot);
assert.equal(observerInstances.length, 1, 'the focused observer must be installed for the current card');
assert.equal(observerInstances[0].options.subtree, true, 'the focused observer must cover inner icon replacements');
observerInstances[0].callback([{ type: 'attributes', attributeName: 'style' }]);
assert.equal(scheduledReasons.length, 0, 'a healthy visual style mutation must not create an observer loop');
observedNode.needsRepair = true;
observerInstances[0].callback([{ type: 'attributes', attributeName: 'style' }]);
assert.deepEqual(scheduledReasons, ['queue-handoff'], 'a removed icon shell must schedule one frame-coalesced handoff');
observedNode.needsRepair = false;
observerInstances[0].callback([{ type: 'attributes', attributeName: 'style' }]);
assert.equal(scheduledReasons.length, 1, 'a healthy queued card must not schedule again');
observedNode.signature = '/items/test_sword|5|1';
observerInstances[0].callback([{ type: 'characterData' }]);
assert.equal(scheduledReasons.length, 1, 'an identity-level update inside the same card must not re-layout the queue');
observerSandbox.observeCurrent(null, observedRoot, true);
assert.equal(observerInstances[0].disconnected, false, 'an empty current shell must stay observed until React refills it');
const replacementRoot = { contains: value => value === observedNode };
observerSandbox.observeCurrent(observedNode, replacementRoot);
assert.equal(observerInstances[0].disconnected, true, 'moving the same node to another root must replace the stale observer closure');
assert.equal(observerInstances.length, 2, 'the new inventory root must receive a fresh current-card observer');

const duplicateScoreFunction = extractFunction('mooncakeWarehouseGetDuplicateInventoryNodeScore');
const duplicateScoreSandbox = {
    MOONCAKE_WAREHOUSE_PINNED_ATTR: 'data-mooncake-warehouse-pinned',
    getComputedStyle: value => value.computed
};
vm.runInNewContext(`
    ${duplicateScoreFunction}
    globalThis.duplicateScore = mooncakeWarehouseGetDuplicateInventoryNodeScore;
`, duplicateScoreSandbox);
const duplicateNode = (computed, rect, pinned = false) => ({
    isConnected: true,
    computed,
    getBoundingClientRect: () => rect,
    getAttribute: attribute => attribute === 'data-mooncake-warehouse-pinned' && pinned ? '1' : null
});
const leavingNode = duplicateNode(
    { display: 'none', visibility: 'hidden', opacity: '0', transform: 'matrix(0, 0, 0, 0, 0, 0)' },
    { width: 0, height: 0 },
    true
);
const enteringNode = duplicateNode(
    { display: 'block', visibility: 'visible', opacity: '1', transform: 'none' },
    { width: 60, height: 60 }
);
assert.ok(
    duplicateScoreSandbox.duplicateScore(enteringNode) > duplicateScoreSandbox.duplicateScore(leavingNode),
    'a drawable duplicate must replace the hidden React leave node'
);
const pinnedVisibleNode = duplicateNode(
    { display: 'block', visibility: 'visible', opacity: '1', transform: 'none' },
    { width: 60, height: 60 },
    true
);
assert.ok(
    duplicateScoreSandbox.duplicateScore(enteringNode) > duplicateScoreSandbox.duplicateScore(pinnedVisibleNode),
    'an equally drawable entering node must replace the stale pinned duplicate'
);

const getPinnedNodeId = extractFunction('mooncakeWarehouseGetPinnedNodeId');
const getPinnedLayoutSignature = extractFunction('mooncakeWarehouseGetPinnedLayoutSignature');
const pinnedLayoutSandbox = {
    WeakMap,
    Map,
    Math,
    JSON,
    mooncakeWarehousePinnedNodeIds: new WeakMap(),
    mooncakeWarehouseNextPinnedNodeId: 1
};
vm.runInNewContext(`
    ${getPinnedNodeId}
    ${getPinnedLayoutSignature}
    globalThis.getPinnedLayoutSignature = mooncakeWarehouseGetPinnedLayoutSignature;
`, pinnedLayoutSandbox);
const stableNode = { isConnected: true };
const layoutState = { sectionCollapsed: {} };
const previousProjection = {
    candidates: new Map([[
        '/items/test_sword\u00015',
        { node: stableNode, key: '/items/test_sword\u00015', sectionId: 'system:current-queue', role: 'current-equipment' }
    ]])
};
const nextLevelProjection = {
    candidates: new Map([[
        '/items/test_sword\u00016',
        { node: stableNode, key: '/items/test_sword\u00016', sectionId: 'system:current-queue', role: 'current-equipment' }
    ]])
};
const previousPlacements = new Map([['/items/test_sword\u00015', { left: 8, top: 42 }]]);
const nextLevelPlacements = new Map([['/items/test_sword\u00016', { left: 8, top: 42 }]]);
assert.equal(
    pinnedLayoutSandbox.getPinnedLayoutSignature(previousProjection, layoutState, previousPlacements),
    pinnedLayoutSandbox.getPinnedLayoutSignature(nextLevelProjection, layoutState, nextLevelPlacements),
    'a level/key update on the same native card at the same position must retain the fast path'
);
assert.notEqual(
    pinnedLayoutSandbox.getPinnedLayoutSignature(nextLevelProjection, layoutState, new Map([
        ['/items/test_sword\u00016', { left: 64, top: 42 }]
    ])),
    pinnedLayoutSandbox.getPinnedLayoutSignature(nextLevelProjection, layoutState, nextLevelPlacements),
    'a real card position change must still invalidate the pinned layout'
);

assert.match(
    source,
    /'display', 'opacity', 'pointer-events', 'transform'/,
    'display and opacity must be included in the reversible warehouse style snapshot'
);
assert.match(
    source,
    /role: queueIndex === 0 \? 'current-equipment' : 'queued-equipment'/,
    'the first valid enhancement action must own the current-card role'
);
assert.match(
    source,
    /const MOONCAKE_WAREHOUSE_CURRENT_EQUIPMENT_LEASE_MS = 420/,
    'the queue must use a bounded current-card handoff lease'
);
assert.match(
    source,
    /mooncakeWarehouseGetCurrentEquipmentLease\(root\)/,
    'a temporarily missing current card must use the last valid queue node'
);
assert.match(
    source,
    /function mooncakeWarehousePinIncomingCurrentEquipment\(mutations, root\)[\s\S]{0,1800}mooncakeWarehousePinCurrentEquipmentHandoffNode/,
    'an incoming React card must inherit the active queue placement before the next paint'
);
assert.match(
    source,
    /mooncakeWarehouseObserveCurrentEquipment\(\s*displayedCurrentEquipmentTarget\?\.node \|\| null,\s*root,\s*keepExistingCurrentShell\s*\);/,
    'the active queue must keep its focused current-card observer wired into rendering'
);
assert.match(
    source,
    /mooncakeWarehouseGetDuplicateInventoryNodeScore\(node\) >\s*mooncakeWarehouseGetDuplicateInventoryNodeScore\(entries\[previousIndex\]\.node\)/,
    'the collector must prefer the drawable entering node over a stale duplicate'
);
assert.match(
    source,
    /target\.role === 'current-equipment'[\s\S]{0,900}mooncakeWarehouseRestoreOwnedInlineStyle\(node, 'transition'\)/,
    'the current card must release visual-transition ownership back to the game'
);
assert.doesNotMatch(
    source,
    /target\.role === 'current-equipment'[\s\S]{0,900}mooncakeWarehouseSetInlineStyle\(node, '(?:display|opacity|transform)'/,
    'Mooncake must not fight the game\'s current-card visibility or transform styles'
);
assert.match(
    source,
    /mooncakeWarehouseCurrentEquipmentObserver\.observe\(node, \{[\s\S]{0,500}attributeFilter: \['hidden', 'aria-hidden', 'href', 'xlink:href'\][\s\S]{0,300}childList: true,[\s\S]{0,200}characterData: true,[\s\S]{0,200}subtree: true/,
    'only identity and node-replacement signals should trigger the focused queue observer'
);
assert.match(
    source,
    /function mooncakeWarehouseRestorePresentation\(\) \{\s*mooncakeWarehouseDisconnectCurrentEquipmentObserver\(\);\s*mooncakeWarehouseClearCurrentEquipmentLease\(\);/,
    'the current-card observer and handoff lease must be released with the warehouse presentation'
);
assert.match(
    source,
    /reason === 'inventory-dom' \|\| reason === 'queue-handoff'\) \{\s*mooncakeWarehouseRenderFrame = requestAnimationFrame/,
    'current-card handoffs must reconcile on the next animation frame without a timeout delay'
);
assert.match(
    source,
    /mooncakeWarehouseNodeStyleSnapshots\.delete\(node\);/,
    'a node leaving the projection must discard its obsolete inline-style snapshot'
);

console.log('Inventory warehouse queue integrity checks passed.');
