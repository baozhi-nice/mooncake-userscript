import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { baseParameters, createEnhancementHarness, readEnhancementSource, snapshotResult } from './lib/enhancement-cache-harness.mjs';

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const baseline = await readEnhancementSource(argument('baseline') || '4f73d9a');
const current = await readEnhancementSource();
const scenarios = [
    ['warm-repeat', (h) => {
        const results = [];
        for (let i = 0; i < 30; i++) results.push(snapshotResult(h.context, 12, 7));
        return results;
    }],
    ['total-skill-updates', (h) => {
        const results = [];
        for (let i = 0; i < 10; i++) {
            h.context.totalSkills = 1874 + i;
            for (const target of [7, 12, 14]) results.push(snapshotResult(h.context, target, Math.min(7, target)));
        }
        return results;
    }],
    ['community-speed-refresh', (h) => {
        const results = [];
        for (const speed of [0, 5, 10, 5, 0]) {
            h.context.player = { ...baseParameters, community_enhancing_speed_bonus: speed };
            h.context.mooncakeRefreshEnhancingCommunityBuffCalculations();
            for (const target of [7, 12, 14]) results.push(snapshotResult(h.context, target, Math.min(7, target)));
        }
        return results;
    }],
    ['live-speed-refresh', (h) => {
        const results = [];
        for (const speed of [10, 15, 20, 15, 10]) {
            h.context.player = { ...baseParameters, glove_bonus: speed };
            h.context.mooncakeScheduleCharacterDependentRefresh(); h.flushTimers();
            results.push(snapshotResult(h.context));
        }
        return results;
    }],
    ['probability-profile-switch', (h) => {
        const results = [];
        for (const ultra of [true, false, true]) {
            h.context.player = { ...baseParameters, tea_ultra_enhancing: ultra, tea_super_enhancing: !ultra };
            h.context.mooncakeScheduleCharacterDependentRefresh(); h.flushTimers();
            results.push(snapshotResult(h.context));
        }
        return results;
    }]
];

// Warm mathjs/JIT before measurements; each measured scenario gets empty caches.
snapshotResult(createEnhancementHarness(current).context);
const samples = new Map(scenarios.map(([name]) => [name, { baseline: [], current: [] }]));
for (let round = 0; round < 3; round++) {
    for (const [name, run] of scenarios) {
        const output = {};
        for (const label of round % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
            const h = createEnhancementHarness(label === 'baseline' ? baseline : current);
            const started = performance.now();
            output[label] = run(h);
            samples.get(name)[label].push({ ms: performance.now() - started, ...h.counts });
        }
        assert.deepEqual(output.current, output.baseline, `${name}: outputs must equal ${baseline.label}`);
    }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [...samples].map(([name, groups]) => ({
    scenario: name,
    ...Object.fromEntries(Object.entries(groups).map(([label, values]) => [label, {
        inversions: median(values.map(value => value.inversions)),
        totalSkillReads: median(values.map(value => value.totalSkillReads)),
        medianMs: Number(median(values.map(value => value.ms)).toFixed(2))
    }]))
}));
const report = {
    baseline: baseline.label, candidate: current.label, rounds: 3,
    runtime: process.version, mathjs: '10.6.4',
    scope: 'Isolated production calculation/lifecycle functions with fixed data; excludes real game DOM, network and actual Worker scheduling.',
    outputParity: 'All values exactly match the baseline in every scenario.', rows
};
if (argument('output')) await writeFile(argument('output'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
