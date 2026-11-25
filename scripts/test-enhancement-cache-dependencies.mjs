import assert from 'node:assert/strict';
import { baseParameters, createEnhancementHarness, readEnhancementSource, snapshotResult } from './lib/enhancement-cache-harness.mjs';

const baseline = await readEnhancementSource('4f73d9a');
const candidate = await readEnhancementSource();
const checked = [];

// Compare actual main-thread mathjs calculations, including nonzero starts and
// exact-level components, to the released implementation using identical data.
{
    const old = createEnhancementHarness(baseline).context;
    const now = createEnhancementHarness(candidate).context;
    const profiles = [
        baseParameters,
        { ...baseParameters, tea_ultra_enhancing: false, tea_blessed: false },
        { ...baseParameters, tea_ultra_enhancing: false, tea_super_enhancing: true },
        { ...baseParameters, tea_ultra_enhancing: false, tea_enhancing: true },
        { ...baseParameters, champion_achievement: false },
        { ...baseParameters, enhancing_level: 80, laboratory_level: 3 },
        { ...baseParameters, drink_concentration_bonus: 0 },
        { ...baseParameters, enhancer_bonus: 9, laboratory_level: 12 }
    ];
    let cases = 0, scalarCases = 0;
    for (const profile of profiles) {
        old.player = now.player = { ...profile };
        for (const item of ['/items/example', '/items/example_85', '/items/example_200']) {
            for (const target of [1, 7, 12, 14, 20]) {
                const protection = Math.min(target, 7);
                for (const start of target === 1 ? [0] : [0, Math.min(3, target - 1)]) {
                    const actual = snapshotResult(now, target, protection, start, item);
                    const expected = snapshotResult(old, target, protection, start, item);
                    const label = `numeric parity: ${item}, +${start}→+${target}, ${JSON.stringify(profile)}`;
                    if (target === 1 && profile.tea_blessed) {
                        // The release's 1x1 mathjs row is a scalar. Its old
                        // flatten(number) error returned the approximate model;
                        // validate the corrected exact model independently.
                        assert.deepEqual({ ...actual, exact: null }, { ...expected, exact: null }, label);
                        const skip = .01 * (1 + profile.drink_concentration_bonus / 100);
                        const exact = { actions: expected.ordinary.actions / (1 - skip), protectCount: 0,
                            exp: expected.ordinary.exp / (1 - skip), baseItemCount: 1 / (1 - skip), overshootProbability: skip };
                        for (const [field, value] of Object.entries(exact)) {
                            assert(Math.abs(actual.exact[field] - value) < 1e-10 * Math.max(1, Math.abs(value)), label + ': scalar ' + field);
                        }
                        assert.equal(actual.exact.exactTarget, true); scalarCases++;
                    } else assert.deepEqual(actual, expected, label);
                    cases++;
                }
            }
        }
    }
    checked.push(`${cases - scalarCases} ordinary/exact/start-level cases exactly match 1.6.259; ${scalarCases} corrected scalar exact +1 cases match the analytic result`);
}

// An unrelated skill-level change must preserve ordinary, exact and risk data.
{
    const h = createEnhancementHarness(candidate), c = h.context;
    const first = c.Enhancelate('/items/example', 12, 7);
    const exact = c.mooncakeEnhancelateExactLevel('/items/example', 12, 7);
    const risk = c.mooncakeBuildTraditionalEnhancementRiskEntry('/items/example', 7, 4);
    assert(risk?.risk && risk?.model, 'risk calculation is available');
    const inversions = h.counts.inversions;
    c.totalSkills++;
    assert.equal(c.Enhancelate('/items/example', 12, 7), first);
    assert.equal(c.mooncakeEnhancelateExactLevel('/items/example', 12, 7), exact);
    assert.equal(c.mooncakeBuildTraditionalEnhancementRiskEntry('/items/example', 7, 4), risk);
    assert.equal(h.counts.inversions, inversions);
    assert.equal(h.counts.totalSkillReads, 0, 'the calculation paths no longer read total skills');
    const old = createEnhancementHarness(baseline).context;
    const oldRisk = old.mooncakeBuildTraditionalEnhancementRiskEntry('/items/example', 7, 4);
    assert.deepEqual(JSON.parse(JSON.stringify({ model: risk.model, risk: risk.risk })),
        JSON.parse(JSON.stringify({ model: oldRisk.model, risk: oldRisk.risk })));
    checked.push('total-skill changes reuse ordinary, exact and risk results; risk matches the release');
}

// Every effective probability input must select its own result. Returning to a
// previous configuration reuses only that configuration's cached result.
{
    const h = createEnhancementHarness(candidate), c = h.context;
    const first = c.Enhancelate('/items/example', 12, 7);
    const exact = c.mooncakeEnhancelateExactLevel('/items/example', 12, 7);
    const changes = [
        { enhancing_level: 157 }, { laboratory_level: 9 }, { enhancer_bonus: 8.5 },
        { drink_concentration_bonus: 16 }, { tea_enhancing: true },
        { tea_super_enhancing: true }, { tea_ultra_enhancing: false },
        { tea_blessed: false }, { champion_achievement: false }
    ];
    for (const change of changes) {
        c.player = { ...baseParameters, ...change };
        c.mooncakeScheduleCharacterDependentRefresh(); h.flushTimers();
        const before = h.counts.inversions;
        const result = c.Enhancelate('/items/example', 12, 7);
        assert.notEqual(result, first, `probability input ${JSON.stringify(change)} is separate`);
        assert(h.counts.inversions > before, 'a changed profile really executes its matrix solve');
        const old = createEnhancementHarness(baseline).context;
        old.player = c.player;
        assert.deepEqual(snapshotResult(c), snapshotResult(old));
    }
    c.player = { ...baseParameters };
    c.mooncakeScheduleCharacterDependentRefresh(); h.flushTimers();
    const before = h.counts.inversions;
    assert.equal(c.Enhancelate('/items/example', 12, 7), first);
    assert.equal(c.mooncakeEnhancelateExactLevel('/items/example', 12, 7), exact);
    assert.equal(h.counts.inversions, before);
    assert.notEqual(c.Enhancelate('/items/example_85', 12, 7), first);
    assert.notEqual(c.Enhancelate('/items/example', 12, 6), first);
    assert.notEqual(c.Enhancelate('/items/example', 14, 7), first);
    assert.notEqual(c.Enhancelate('/items/example', 12, 7, null, 3), first);
    const override = c.Enhancelate('/items/example', 12, 7, { champion_achievement: false });
    assert.notEqual(override, first, 'virtual/rival parameter overrides remain isolated');
    checked.push('all nine probability inputs, item/target/protection/start levels and overrides stay isolated');
}

// Speed changes must keep expected counts but invalidate cost/time decisions.
{
    const h = createEnhancementHarness(candidate), c = h.context;
    const result = snapshotResult(c);
    const first = c.Enhancelate('/items/example', 12, 7);
    const beforeContext = c.mooncakeBuildEnhancePanelPricingContext('/items/example', 0, {});
    const profiles = c.mooncakeGetEnhanceSimulationProfiles('/items/example', 0, 12, beforeContext.simulationCharacterKey);
    const risk = c.mooncakeBuildTraditionalEnhancementRiskEntry('/items/example', 7, 4);
    const inversions = h.counts.inversions;
    const revision = c.mooncakeMyListingsHourlyRevision;
    c.mooncakeEnhancementRouteCandidateCache.set('fixture', {});
    c.mooncakeTraditionalEnhancementRiskCostCache.set('fixture', {});
    c.player = { ...baseParameters, glove_bonus: 25, community_enhancing_speed_bonus: 10 };
    c.mooncakeRefreshEnhancingCommunityBuffCalculations();
    c.mooncakeScheduleCharacterDependentRefresh(); h.flushTimers();
    const afterContext = c.mooncakeBuildEnhancePanelPricingContext('/items/example', 0, {});
    assert.equal(c.Enhancelate('/items/example', 12, 7), first);
    assert.equal(c.mooncakeBuildTraditionalEnhancementRiskEntry('/items/example', 7, 4), risk);
    assert.equal(c.mooncakeGetEnhanceSimulationProfiles('/items/example', 0, 12, afterContext.simulationCharacterKey), profiles);
    assert.equal(h.counts.inversions, inversions);
    assert.equal(afterContext.simulationCharacterKey, beforeContext.simulationCharacterKey);
    assert.notEqual(afterContext.dependencySignature, beforeContext.dependencySignature);
    assert(c.calcEnhancingSecondsPerAction('/items/example') < result.seconds);
    assert.notEqual(snapshotResult(c).hourly, result.hourly);
    assert(c.mooncakeMyListingsHourlyRevision > revision, 'display revisions still advance');
    assert.equal(c.mooncakeEnhancementRouteCandidateCache.size, 0);
    assert.equal(c.mooncakeTraditionalEnhancementRiskCostCache.size, 0);
    c.mooncakeBuildGenericEnhancementCostContext = item => ({
        perActionCost: 120000, secondsPerAction: c.calcEnhancingSecondsPerAction(item)
    });
    c.mooncakeClearEnhancementRouteCache();
    const repriced = c.mooncakeBuildEnhancePanelPricingContext('/items/example', 0, {});
    assert.equal(repriced.simulationCharacterKey, afterContext.simulationCharacterKey);
    assert.notEqual(repriced.dependencySignature, afterContext.dependencySignature);
    assert.equal(repriced.costContext.perActionCost, 120000);
    assert.equal(c.mooncakeGetEnhanceSimulationProfiles('/items/example', 0, 12, repriced.simulationCharacterKey), profiles);
    assert.equal(h.counts.inversions, inversions, 'repricing also reuses the probability profiles');
    c.player = { ...baseParameters, champion_achievement: false };
    const changed = c.mooncakeBuildEnhancePanelPricingContext('/items/example', 0, {});
    assert.notEqual(changed.simulationCharacterKey, beforeContext.simulationCharacterKey);
    assert.notEqual(c.mooncakeGetEnhanceSimulationProfiles('/items/example', 0, 12, changed.simulationCharacterKey), profiles);
    checked.push('speed/price refresh reuses probabilities while time, hourly value and route/display state refresh');
}

// Complete resets remain available for client metadata replacement. Retained
// multi-profile entries must still obey the existing cache capacity.
{
    const h = createEnhancementHarness(candidate), c = h.context;
    const first = c.Enhancelate('/items/example', 12, 7);
    c.mooncakeEnhancelateExactLevel('/items/example', 12, 7);
    c.mooncakeGetEnhanceSimulationProfiles('/items/example', 0, 7, 'fixture');
    c.mooncakeBuildTraditionalEnhancementRiskEntry('/items/example', 7, 4);
    c.mooncakeEnhancementRoutePrewarmState.set('fixture', { ready: true });
    c.mooncakeClearEnhancementCalculationCaches();
    for (const key of ['enhancelateCache', 'mooncakeExactEnhancelateCache', 'mooncakeEnhanceSimulationProfileCache',
        'mooncakeTraditionalEnhancementRiskCache', 'mooncakeEnhancementRoutePrewarmState']) assert.equal(c[key].size, 0, key);
    assert.notEqual(c.Enhancelate('/items/example', 12, 7), first);
    for (let i = 0; i < 550; i++) {
        c.player = { ...baseParameters, enhancer_bonus: 7 + i / 1000 };
        c.Enhancelate('/items/example', 7, 4);
    }
    assert.equal(c.enhancelateCache.size, 512);
    assert.equal(h.counts.totalSkillReads, 0);
    checked.push('complete metadata reset clears results; retained probability entries stay bounded');
}

for (const message of checked) console.log(`PASS ${message}`);
