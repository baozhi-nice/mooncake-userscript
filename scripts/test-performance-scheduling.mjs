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
const params = {
    enhancing_level: 156, laboratory_level: 8, enhancer_bonus: 8.4,
    enhancers_top_speed: 15.02, enhancers_bottom_speed: 15.02, glove_bonus: 15.02,
    necklace_speed: 10.68, chance_cape_speed: 20.358, drink_concentration_bonus: 15.7,
    tea_ultra_enhancing: true, tea_blessed: true, champion_achievement: true,
    community_enhancing_speed_bonus: 0
};
const successRates = [50, 45, 45, 40, 40, 40, 35, 35, 35, 35, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
function workerHarness() {
    const posts = [], timers = new Map();
    let timerId = 0, worker;
    const ctx = vm.createContext({
        console, Blob: class {}, URL: { createObjectURL: () => 'fixture', revokeObjectURL() {} },
        enhancelateWorker: null, enhancelateWorkerDisabled: false, enhancelateWorkerRequestId: 0,
        enhancelateWorkerPending: new Map(), enhancelateWorkerInFlight: new Map(),
        enhancelateCache: new Map(), mooncakeExactEnhancelateCache: new Map(),
        mooncakeEnhancementRoutePrewarmState: new Map(), SUCCESS_RATE: successRates,
        player: { ...params }, getBaseItemLevel: hrid => hrid?.includes('85') ? 85 : 90,
        getEnhancelateTotalSkillLevel: () => 1874,
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: id => timers.delete(id)
    });
    ctx.getPlayerEnhanceParams = () => ctx.player;
    ctx.cacheEnhancelateResult = (key, value) => ctx.enhancelateCache.set(key, value);
    ctx.cacheMooncakeExactEnhancelateResult = (key, value) => ctx.mooncakeExactEnhancelateCache.set(key, value);
    ctx.Worker = class {
        constructor() { worker = this; }
        postMessage(message) {
            if (this.failPost) throw Error('fixture postMessage failure');
            posts.push(structuredClone(message));
        }
        terminate() { this.terminated = true; }
    };
    install(ctx, ['buildEnhancelateCacheKey', 'enhancelateWorkerMain', 'disableEnhancelateWorker',
        'getEnhancelateWorker', 'prewarmEnhancelateLevels', 'mooncakeEnsureEnhancementRoutePrewarm',
        'calcEnhancingSecondsPerAction']);
    function deliver(index, error = false) {
        const message = posts[index];
        if (error) { worker.onmessage({ data: { requestId: message.requestId, error: 'fixture error' } }); return; }
        const runner = vm.createContext({ self: { postMessage: data => worker.onmessage({ data }) } });
        vm.runInContext(`${extract('enhancelateWorkerMain')}\nenhancelateWorkerMain();`, runner);
        runner.self.onmessage({ data: message });
    }
    return { ctx, posts, timers, deliver, get worker() { return worker; } };
}
const close = (actual, expected, label) => assert(Math.abs(actual - expected) < 1e-7 * Math.max(1, Math.abs(expected)), label);

// Same-level equipment shares probability results, including overlapping batches.
{
    const h = workerHarness(), c = h.ctx;
    const first = c.mooncakeEnsureEnhancementRoutePrewarm('/items/first', 12);
    const second = c.mooncakeEnsureEnhancementRoutePrewarm('/items/second', 12);
    assert.equal(h.posts.length, 1, 'same-profile concurrent surfaces share the worker request');
    assert.equal(h.posts[0].jobs.length, 134, 'only the 134 distinct +1..12 jobs are sent');
    const higher = c.mooncakeEnsureEnhancementRoutePrewarm('/items/third', 14);
    assert.equal(h.posts.length, 2);
    assert.equal(h.posts[1].jobs.length, 50, 'overlapping prewarm submits only the missing +13/+14 jobs');
    const allJobs = h.posts.flatMap(post => post.jobs);
    assert.equal(new Set(allJobs.map(job => job.key)).size, allJobs.length);
    h.deliver(1);
    await Promise.resolve();
    assert.equal(higher.ready, false, 'a partial reply cannot expose an unfinished shared batch');
    h.deliver(0);
    assert.deepEqual(await Promise.all([first.promise, second.promise, higher.promise]), [true, true, true]);
    assert.equal(c.enhancelateWorkerInFlight.size, 0);
    assert.equal(h.timers.size, 0);
    const key = c.buildEnhancelateCacheKey('', 12, 7, 90, 1874, c.player);
    const result = c.enhancelateCache.get(key);
    close(result.actions, 6301.174414285177, 'ultra tea attempts stay unchanged');
    close(result.protectCount, 59.48103203935401, 'ultra tea protections stay unchanged');
    const seconds = c.calcEnhancingSecondsPerAction('/items/first');
    const profit = 1960e6 * .96 - 380010723 - result.actions * 108803 - result.protectCount * 9e6;
    close(profit / (result.actions * seconds / 3600), 35584880.47099592, 'the screenshot hourly result stays unchanged');
    assert(c.mooncakeExactEnhancelateCache.get(`exact:${key}`).actions > result.actions,
        'exact-target and overshoot-allowed results remain distinct');
    await c.prewarmEnhancelateLevels('/items/first', [12], { includeExact: true });
    assert.equal(h.posts.length, 2, 'completed cached results require no more worker work');
}
{
    const h = workerHarness(), c = h.ctx;
    const ordinary = c.prewarmEnhancelateLevels('/items/a', [12]);
    const exact = c.prewarmEnhancelateLevels('/items/a', [12], { includeExact: true });
    assert.equal(h.posts[0].jobs.length, 11);
    assert.equal(h.posts[1].jobs.length, 11);
    assert(h.posts[1].jobs.every(job => job.exact), 'adding exact targets does not repeat ordinary jobs');
    c.player = { ...params, tea_ultra_enhancing: false, tea_super_enhancing: true };
    const superTea = c.prewarmEnhancelateLevels('/items/a', [12]);
    const differentItemLevel = c.prewarmEnhancelateLevels('/items/85', [12]);
    assert.equal(h.posts.length, 4, 'different tea and item levels never share probability results');
    h.deliver(3); h.deliver(2); h.deliver(1); h.deliver(0);
    assert((await Promise.all([ordinary, exact, superTea, differentItemLevel])).every(Boolean));
    const key = c.buildEnhancelateCacheKey('', 12, 7, 90, 1874, c.player);
    close(c.enhancelateCache.get(key).actions, 6381.187242935053, 'super tea attempts stay unchanged');
    close(c.enhancelateCache.get(key).protectCount, 59.78802863068613, 'super tea protections stay unchanged');
}
for (const failure of ['timeout', 'reply-error', 'worker-error', 'post-error']) {
    const h = workerHarness(), c = h.ctx;
    c.getEnhancelateWorker();
    if (failure === 'post-error') h.worker.failPost = true;
    const first = c.prewarmEnhancelateLevels('/items/a', [12]);
    const second = c.prewarmEnhancelateLevels('/items/b', [12]);
    if (failure === 'timeout') [...h.timers.values()].forEach(fn => fn());
    if (failure === 'reply-error') h.deliver(0, true);
    if (failure === 'worker-error') h.worker.onerror();
    assert.deepEqual(await Promise.all([first, second]), [false, false], `${failure} releases every waiting caller`);
    assert.equal(c.enhancelateWorkerInFlight.size, 0);
    assert.equal(c.enhancelateWorkerPending.size, 0);
    assert.equal(h.timers.size, 0);
    if (failure === 'timeout') {
        const retry = c.prewarmEnhancelateLevels('/items/a', [12]);
        h.deliver(0);
        assert.equal(c.enhancelateCache.size, 0, 'a timed-out reply cannot satisfy a replacement request');
        h.deliver(1);
        assert.equal(await retry, true);
    }
}

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
        mooncakeChatSeqPending: [], mooncakeChatSeqBusy: false,
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
