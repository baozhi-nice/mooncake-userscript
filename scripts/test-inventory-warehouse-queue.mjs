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

const repairFunction = extractFunction('mooncakeWarehouseCurrentEquipmentNeedsRepair');
const root = { contains: node => node.insideRoot !== false };
const node = {
    isConnected: true,
    insideRoot: true,
    itemHrid: '/items/test_sword',
    style: createStyle({
        position: 'absolute',
        display: 'block',
        opacity: '1',
        transform: 'none',
        visibility: 'visible'
    }),
    computed: { display: 'block', visibility: 'visible', opacity: '1' },
    rect: { width: 60, height: 60 },
    getBoundingClientRect() {
        return this.rect;
    }
};
const repairSandbox = {
    mooncakeWarehouseNormalizeItemHrid: value => value,
    mooncakeGetItemHridFromContainer: value => value.itemHrid,
    getComputedStyle: value => value.computed
};
vm.runInNewContext(`
    ${repairFunction}
    globalThis.needsRepair = mooncakeWarehouseCurrentEquipmentNeedsRepair;
`, repairSandbox);

const currentTarget = { node, role: 'current-equipment', hidden: false };
assert.equal(repairSandbox.needsRepair(currentTarget, root), false, 'a healthy current card must keep the fast path');
node.style.values.opacity = '0';
node.computed.opacity = '0';
assert.equal(repairSandbox.needsRepair(currentTarget, root), true, 'an opacity-zero current card must be repaired');
node.style.values.opacity = '1';
node.computed.opacity = '1';
node.style.values.display = 'none';
node.computed.display = 'none';
assert.equal(repairSandbox.needsRepair(currentTarget, root), true, 'a display-none current card must be repaired');
node.style.values.display = 'block';
node.computed.display = 'block';
node.itemHrid = '';
assert.equal(repairSandbox.needsRepair(currentTarget, root), true, 'an emptied current card must not pass integrity checks');
node.itemHrid = '/items/test_sword';
node.rect = { width: 0, height: 60 };
assert.equal(repairSandbox.needsRepair(currentTarget, root), true, 'a zero-size current card must be repaired');
assert.equal(
    repairSandbox.needsRepair({ ...currentTarget, role: 'queued-equipment' }, root),
    false,
    'the extra computed-style check must stay limited to the current card'
);

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
    mooncakeWarehouseCurrentEquipmentIntegrityDirty: false,
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
assert.equal(scheduledReasons.length, 0, 'a healthy Mooncake style write must not create an observer loop');
observedNode.needsRepair = true;
observerInstances[0].callback([{ type: 'attributes', attributeName: 'style' }]);
assert.deepEqual(scheduledReasons, ['current-equipment-dom'], 'an external hide must schedule one repair');
observedNode.needsRepair = false;
observerInstances[0].callback([{ type: 'attributes', attributeName: 'style' }]);
assert.equal(scheduledReasons.length, 1, 'the healthy repair write must not schedule again');
observedNode.signature = '/items/test_sword|5|1';
observerInstances[0].callback([{ type: 'characterData' }]);
assert.equal(scheduledReasons.length, 2, 'an identity-level update must schedule reprojection');
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
    /mooncakeWarehouseCurrentEquipmentNeedsRepair\(currentEquipmentTarget, root, false\)/,
    'the normal fast path must avoid a forced layout read'
);
assert.match(
    source,
    /!currentEquipmentNeedsRepair\)/,
    'the unchanged-presentation fast path must honor current-card integrity'
);
assert.match(
    source,
    /mooncakeWarehouseObserveCurrentEquipment\(\s*currentEquipmentTarget\?\.node \|\| null,\s*root,\s*keepExistingCurrentShell\s*\);/,
    'the active queue must keep its focused current-card observer wired into rendering'
);
assert.match(
    source,
    /mooncakeWarehouseGetDuplicateInventoryNodeScore\(node\) >\s*mooncakeWarehouseGetDuplicateInventoryNodeScore\(entries\[previousIndex\]\.node\)/,
    'the collector must prefer the drawable entering node over a stale duplicate'
);
assert.match(
    source,
    /target\.role === 'current-equipment'[\s\S]{0,900}mooncakeWarehouseSetInlineStyle\(node, 'display', 'block'\)[\s\S]{0,300}mooncakeWarehouseSetInlineStyle\(node, 'opacity', '1'\)[\s\S]{0,300}mooncakeWarehouseSetInlineStyle\(node, 'transform', 'none'\)/,
    'the current card must explicitly clear the native leave state'
);
assert.match(
    source,
    /\[\$\{MOONCAKE_WAREHOUSE_ROLE_ATTR\}=\"current-equipment\"\][\s\S]{0,500}display: block !important; visibility: visible !important; opacity: 1 !important; transform: none !important;/,
    'the current card CSS guard must cover native transition styles between renders'
);
assert.match(
    source,
    /mooncakeWarehouseCurrentEquipmentObserver\.observe\(node, \{[\s\S]{0,500}attributeFilter: \['class', 'style', 'hidden', 'aria-hidden', 'href', 'xlink:href'\][\s\S]{0,300}childList: true,[\s\S]{0,200}characterData: true,[\s\S]{0,200}subtree: true/,
    'only the active equipment card should receive the focused DOM integrity observer'
);
assert.match(
    source,
    /function mooncakeWarehouseRestorePresentation\(\) \{\s*mooncakeWarehouseDisconnectCurrentEquipmentObserver\(\);/,
    'the current-card observer must be disconnected with the warehouse presentation'
);
assert.match(
    source,
    /mooncakeWarehouseNodeStyleSnapshots\.delete\(node\);/,
    'a node leaving the projection must discard its obsolete inline-style snapshot'
);

console.log('Inventory warehouse queue integrity checks passed.');
