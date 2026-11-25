import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { readEnhancementSource } from './lib/enhancement-cache-harness.mjs';
import { characterFixture, createCharacterStateHarness } from './lib/character-state-harness.mjs';

const argument = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const versions = { baseline: await readEnhancementSource('4f73d9a', argument('baseline-file')), current: await readEnhancementSource() };
const scenarios = ['xp-only', 'inventory-only', 'burst-xp', 'identical-native-snapshots'];
const samples = new Map(scenarios.map(name => [name, { baseline: [], current: [] }]));
for (let round = 0; round < 3; round++) {
    for (const scenario of scenarios) {
        const states = {};
        for (const label of round % 2 ? ['current', 'baseline'] : ['baseline', 'current']) {
            const h = createCharacterStateHarness(versions[label]), native = characterFixture();
            h.setGame(native); h.feed(native); h.advance(120);
            const before = { ...h.counts }, started = performance.now();
            for (let i = 0; i < 60; i++) {
                if (scenario === 'inventory-only') {
                    native.characterItems[2].count = i + 20;
                    h.feed({ type: 'items_updated', endCharacterItems: [native.characterItems[2]] });
                } else if (scenario === 'identical-native-snapshots') {
                    h.context.mooncakeSyncCharacterDataFromGameState();
                } else {
                    native.characterSkills[1].experience = 100 + i;
                    h.feed({ type: 'skills_updated', endCharacterSkills: [native.characterSkills[1]] });
                }
                h.advance(scenario === 'burst-xp' ? 1 : 5000);
            }
            h.advance(2500);
            samples.get(scenario)[label].push({ ms: performance.now() - started,
                ...Object.fromEntries(Object.entries(h.counts).map(([name, value]) => [name, value - before[name]])) });
            states[label] = h.state();
        }
        assert.deepEqual(states.current, states.baseline, scenario + ': final state differs');
    }
}
const median = values => [...values].sort((a, b) => a - b)[1];
const rows = [...samples].map(([scenario, groups]) => ({ scenario,
    ...Object.fromEntries(Object.entries(groups).map(([label, values]) => [label,
        Object.fromEntries(Object.keys(values[0]).map(name => [name, Number(median(values.map(value => value[name])).toFixed(2))]))]))
}));
const report = { baseline: versions.baseline.label, events: 60, rounds: 3, statesEqual: true,
    note: 'Fixed native-state and delta fixtures using production merge/signature/snapshot code. No game rendering, network or real React traversal is timed.', rows };
if (argument('output')) await writeFile(argument('output'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
