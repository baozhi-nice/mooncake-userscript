import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createEnhancementHarness } from './enhancement-cache-harness.mjs';
import { probabilityTaskFunctionNames } from './probability-task-test-support.mjs';

export function createProbabilityHarness(version, options = {}) {
    const h = createEnhancementHarness(version), c = h.context;
    const posts = [], timers = new Map();
    let timerId = 0, now = 0;
    Object.assign(c, {
        enhancelateWorker: null, enhancelateWorkerDisabled: false, enhancelateWorkerRequestId: 0,
        Blob: class {}, URL: { createObjectURL: () => 'fixture', revokeObjectURL() {} },
        mooncakeGetRefinementActionForItem: () => null,
        setTimeout(callback, delay) { timers.set(++timerId, { callback, delay, at: now + delay }); return timerId; },
        clearTimeout: id => timers.delete(id)
    });
    c.Worker = options.worker === false ? undefined : class {
        constructor() { this.failPost = options.failPost; }
        postMessage(message) {
            if (this.failPost) throw Error('fixture worker failure');
            posts.push({ ...structuredClone(message), worker: this, delivered: false });
        }
        terminate() { this.terminated = true; }
    };
    const names = [...probabilityTaskFunctionNames, 'enhancelateWorkerMain', 'disableEnhancelateWorker',
        'getEnhancelateWorker', 'prewarmEnhancelateLevels', 'mooncakeEnsureEnhancementRoutePrewarm'];
    vm.runInContext(names.map(name => version.functions.get(name)).join('\n'), c);
    function tick() {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) return false;
        timers.delete(next[0]); now = next[1].at; next[1].callback(); return true;
    }
    function deliver(post = posts.find(entry => !entry.delivered)) {
        if (!post) return false;
        post.delivered = true;
        const runner = vm.createContext({ self: { postMessage: data => post.worker.onmessage({ data }) } });
        vm.runInContext(version.functions.get('enhancelateWorkerMain') + '\nenhancelateWorkerMain();', runner);
        runner.self.onmessage({ data: post });
        return true;
    }
    async function drain() {
        let maxInversionsPerTurn = 0;
        for (let step = 0; step < 20000; step++) {
            const before = h.counts.inversions;
            const worked = deliver() || tick();
            maxInversionsPerTurn = Math.max(maxInversionsPerTurn, h.counts.inversions - before);
            for (let i = 0; i < 4; i++) await Promise.resolve();
            if (!worked && !timers.size && !posts.some(post => !post.delivered)) return { maxInversionsPerTurn };
        }
        assert.fail('probability dispatcher did not settle');
    }
    return { ...h, posts, timers, tick, deliver, drain };
}
