import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { readEnhancementSource } from './lib/enhancement-cache-harness.mjs';
import { createMarketDependencyHarness } from './lib/market-dependency-harness.mjs';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const baseline = await readEnhancementSource(argument('baseline') || '4f73d9a', argument('baseline-file'));
const current = await readEnhancementSource();
const targets = ['/items/equipment', '/items/equipment_refined', '/items/other_equipment'];
const scenarios = [
    ['warm-repeat', () => {}],
    ['unrelated-quotes', (h, index) => h.update('/items/unrelated', 200 + index)],
    ['recursive-material-quotes', (h, index) => h.update('/items/raw', 2e6 + index * 1e5)],
    ['candidate-protection-quotes', (h, index) => h.update('/items/protection_b', 1e6 + index * 1e5)],
    ['same-price-order-updates', h => h.update('/items/equipment', 100e6)]
];
const snapshot = h => targets.map(item => {
    const pair = h.pair(item, 14);
    return JSON.parse(JSON.stringify(pair));
});
// Warm mathjs before timing. Harness construction and source parsing are
// outside the measured interval; count actual production route/cost calls.
snapshot(createMarketDependencyHarness(current));
const samples = new Map(scenarios.map(([name]) => [name, { baseline: [], current: [] }]));
for (let round = 0; round < 3; round++) {
    for (const [name, change] of scenarios) {
        const outputs = {};
        for (const label of round % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
            const h = createMarketDependencyHarness(label === 'baseline' ? baseline : current);
            const results = [snapshot(h)];
            const started = performance.now();
            const counters = { ...h.counts };
            for (let index = 0; index < 12; index++) {
                change(h, index);
                results.push(snapshot(h));
            }
            samples.get(name)[label].push({
                ms: performance.now() - started,
                candidateBuilds: h.counts.candidateBuilds - counters.candidateBuilds,
                routeSelections: h.counts.routeSelections - counters.routeSelections,
                recipeCosts: h.counts.recipeCosts - counters.recipeCosts
            });
            outputs[label] = results;
        }
        assert.deepEqual(outputs.current, outputs.baseline, `${name}: output differs from ${baseline.label}`);
    }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [...samples].map(([scenario, groups]) => ({
    scenario,
    ...Object.fromEntries(Object.entries(groups).map(([label, values]) => [label, {
        candidateBuilds: median(values.map(value => value.candidateBuilds)),
        routeSelections: median(values.map(value => value.routeSelections)),
        recipeCosts: median(values.map(value => value.recipeCosts)),
        medianMs: Number(median(values.map(value => value.ms)).toFixed(2))
    }]))
}));
assert.equal(rows.find(row => row.scenario === 'unrelated-quotes').current.candidateBuilds, 0);
assert(rows.find(row => row.scenario === 'recursive-material-quotes').current.candidateBuilds > 0, 'relevant quotes must still rebuild routes');
const report = {
    baseline: baseline.label, candidate: current.label, rounds: 3, updatesPerScenario: 12,
    note: 'Synthetic production-function benchmark with fixed metadata and live quote payloads. Cold initialization and DOM/game rendering are excluded; elapsed times do not represent game FPS.',
    outputsEqual: true, rows
};
if (argument('output')) await writeFile(argument('output'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
