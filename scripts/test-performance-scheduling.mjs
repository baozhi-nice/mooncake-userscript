import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `Missing ${name}`);
    let pos = source.indexOf('(', start), depth = 0;
    do { if (source[pos] === '(') depth++; if (source[pos] === ')') depth--; pos++; } while (depth);
    pos = source.indexOf('{', pos);
    do { if (source[pos] === '{') depth++; if (source[pos] === '}') depth--; pos++; } while (depth);
    return source.slice(start, pos);
}
function install(context, names) {
    vm.runInContext(names.map(extract).join('\n'), context);
}
await import('./test-probability-task-queue.mjs');

// Real predicates: shared classification retains each feature's internal-node exclusions.
{
    const listingSelector = '[class*="MarketplacePanel_myListings"]';
    let listingLookups = 0;
    class Element {
        constructor(selectors = [], parentElement = null, children = []) {
            this.selectors = selectors; this.parentElement = parentElement; this.children = children;
        }
        matches(selector) { return selector.split(',').some(part => this.selectors.includes(part.trim())); }
        closest(selector) {
            if (selector === listingSelector) listingLookups++;
            for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
            return null;
        }
        querySelector(selector) {
            for (const node of this.children) if (node.matches(selector) || node.querySelector(selector)) return node;
            return null;
        }
    }
    const subscriptions = new Map(), calls = [];
    const c = vm.createContext({
        Element, console, mooncakeMyListingsDocumentObserverStarted: false,
        mooncakeMyListingsHourlyHooked: true, mooncakeMyListingsTargetFilterHooked: true,
        mooncakeMyListingsManagementHooked: true, mooncakeIsMyListingsManagementEnabled: () => true,
        MOONCAKE_MY_LISTINGS_TARGET_FILTER_ATTR: 'target', MOONCAKE_MY_LISTINGS_MANAGEMENT_ATTR: 'management',
        MOONCAKE_MY_LISTINGS_MARKET_UPDATE_ATTR: 'updated', MOONCAKE_MY_LISTINGS_TARGET_HIDDEN_ATTR: 'hidden',
        subscribeDocumentMutations: (name, fn) => subscriptions.set(name, fn),
        mooncakeScheduleMyListingsHourlyWages: () => calls.push('hourly'),
        mooncakeRefreshMyListingsTargetFilterForTableLifecycle: () => calls.push('filter'),
        mooncakeScheduleMyListingsManagement: () => calls.push('management')
    });
    install(c, ['mooncakeNodeTouchesMyListings', 'mooncakeIsMyListingsTargetFilterInternalNode',
        'mooncakeMyListingsTargetFilterMutationNeedsRefresh', 'mooncakeIsMyListingsManagementInternalNode',
        'mooncakeMyListingsManagementMutationNeedsRefresh', 'hookMooncakeMyListingsDocumentObserver']);
    c.hookMooncakeMyListingsDocumentObserver(); c.hookMooncakeMyListingsDocumentObserver();
    assert.equal(subscriptions.size, 1);
    const run = mutation => { calls.length = 0; listingLookups = 0; subscriptions.get('my-listings')([mutation]); return [...calls]; };
    const panel = new Element([listingSelector]), row = new Element([], panel);
    const change = (target, addedNodes = [], removedNodes = []) => ({ type: 'childList', target, addedNodes, removedNodes });
    assert.deepEqual(run(change(row, [new Element([], row)])), ['hourly', 'filter', 'management']);
    assert.equal(listingLookups, 1, 'the two feature filters share one ancestor lookup');
    assert.deepEqual(run(change(new Element(), [new Element([], null, [panel])])), ['hourly', 'filter', 'management']);
    assert.deepEqual(run(change(new Element(), [], [panel])), ['hourly', 'filter', 'management']);
    assert.deepEqual(run(change(new Element())), [], 'unrelated chat/inventory mutations do not refresh listings');
    assert.deepEqual(run(change(new Element(['[data-mooncake-my-listing-hourly]'], row))), []);
    assert.deepEqual(run(change(new Element(['[target="1"]'], panel))), ['management']);
    assert.deepEqual(run(change(new Element(['[management="1"]'], panel))), ['hourly', 'filter']);
    c.mooncakeScheduleMyListingsHourlyWages = () => { throw Error('fixture failure'); };
    c.console = { error() {} };
    assert.deepEqual(run(change(row)), ['filter', 'management'], 'one failing feature cannot block the others');
}

function visibilityHarness() {
    const listeners = new Map(), timers = new Map();
    let id = 0;
    const doc = { hidden: true, addEventListener: (name, fn) => listeners.set(name, fn),
        querySelectorAll: () => [], querySelector: () => ({}) };
    const c = vm.createContext({ document: doc, console: { error() {} },
        mooncakeVisibleRefreshes: new Map(), mooncakeVisibleRefreshListenerStarted: false,
        setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: n => timers.delete(n),
        setInterval: fn => { timers.set(++id, fn); return id; }, clearInterval: n => timers.delete(n)
    });
    install(c, ['mooncakeDeferVisibleRefresh', 'mooncakeFlushVisibleRefreshes']);
    return { c, doc, timers, show() { doc.hidden = false; listeners.get('visibilitychange')?.(); } };
}
{
    const h = visibilityHarness(), calls = [];
    for (let i = 0; i < 200; i++) h.c.mooncakeDeferVisibleRefresh('market', () => calls.push(i));
    h.c.mooncakeDeferVisibleRefresh('broken', () => { throw Error('fixture failure'); });
    h.c.mooncakeDeferVisibleRefresh('chat', () => calls.push('chat'));
    assert.equal(h.c.mooncakeVisibleRefreshes.size, 3, 'hidden changes do not accumulate unbounded callbacks');
    assert.deepEqual(calls, []);
    h.show();
    assert.deepEqual(calls, [199, 'chat'], 'resume runs the latest work once and isolates failures');
    h.c.mooncakeFlushVisibleRefreshes();
    assert.deepEqual(calls, [199, 'chat']);
}
{
    const h = visibilityHarness(), c = h.c;
    let latestPrice = 1, computedPrice = null, scans = 0;
    Object.assign(c, {
        mooncakeChatBackfillTimers: new WeakMap(), mooncakeChatBackfillCursor: new WeakMap(),
        mooncakeChatQueue: [], mooncakeChatQueueTimer: 0, mooncakeChatComputeQueue: [], mooncakeChatComputeTimer: 0,
        mooncakeChatSeqPending: [], mooncakeChatSeqBusy: false, mooncakeChatComputeGeneration: 0,
        MOONCAKE_CHAT_HISTORY_SELECTOR: '.history', MOONCAKE_CHAT_MESSAGE_SELECTOR: '.message',
        MOONCAKE_CHAT_BUBBLE_ATTR: 'bubble', MOONCAKE_CHAT_INJECTED_ATTR: 'injected',
        MOONCAKE_CHAT_COMPUTE_GAP_MS: 60, MOONCAKE_CHAT_BACKFILL_INTERVAL_MS: 3000,
        MOONCAKE_CHAT_BACKFILL_MAX_QUEUE: 60,
        isChatLaborEnabled: () => true, isTopLevelMooncakeChatMessage: () => true,
        forEachMooncakeChatDoc: fn => fn(h.doc),
        processRecentMooncakeChatMessages: () => { scans++; c.enqueueMooncakeChatCompute(() => { computedPrice = latestPrice; }); }
    });
    install(c, ['enqueueMooncakeChatMessage', 'enqueueMooncakeChatCompute', 'flushMooncakeChatCompute',
        'stopMooncakeChatBackfill', 'startMooncakeChatBackfill', 'mooncakePauseChatLabor',
        'clearMooncakeChatLaborBubbles', 'refreshMooncakeChatLabor']);
    h.doc.hidden = false;
    c.enqueueMooncakeChatCompute(() => { computedPrice = -1; });
    c.startMooncakeChatBackfill(h.doc);
    assert.equal(h.timers.size, 2);
    h.doc.hidden = true;
    c.mooncakePauseChatLabor();
    assert.equal(h.timers.size, 0, 'hiding stops chat compute and backfill timers');
    for (let i = 0; i < 200; i++) c.enqueueMooncakeChatMessage({});
    c.refreshMooncakeChatLabor();
    assert.equal(c.mooncakeChatQueue.length, 0, 'hidden chat messages do not retain a growing DOM queue');
    assert.equal(scans, 0, 'hidden refresh does not scan or clear the chat DOM');
    latestPrice = 2;
    h.show();
    assert.equal(scans, 1);
    assert.equal(c.mooncakeChatComputeQueue.length, 1, 'resume discards obsolete calculations');
    c.flushMooncakeChatCompute();
    assert.equal(computedPrice, 2, 'resume calculates with the latest market data');
}
console.log('Performance scheduling checks passed: shared worker jobs, unchanged calculations, failure recovery, DOM classification, hidden/resume work.');
