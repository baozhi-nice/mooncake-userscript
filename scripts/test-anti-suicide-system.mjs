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

const stoneClassifier = extractFunction('mooncakeAntiSuicideDropTableHasPhilosophersStone');
const sandbox = {};
vm.runInNewContext(`
    const MOONCAKE_ANTI_SUICIDE_PHILOSOPHERS_STONE_HRID = '/items/philosophers_stone';
    ${stoneClassifier}
    globalThis.classifier = mooncakeAntiSuicideDropTableHasPhilosophersStone;
`, sandbox);

assert.equal(sandbox.classifier([
    { itemHrid: '/items/crushed_philosophers_stone' },
    { itemHrid: '/items/coin' }
]), false, 'crushed Philosopher Stone must not trigger the alchemy guard');
assert.equal(sandbox.classifier([
    { itemHrid: '/items/crushed_philosophers_stone' },
    { itemHrid: '/items/philosophers_stone' }
]), true, 'a direct Philosopher Stone output must trigger the alchemy guard');
assert.equal(sandbox.classifier(null), false, 'missing output data must not be treated as a confirmed stone pool');

const allowedMatcher = extractFunction('mooncakeAntiSuicideAllowedActionMatches');
const consumeAllowedAction = extractFunction('mooncakeAntiSuicideConsumeAllowedAction');
const replaySandbox = {};
vm.runInNewContext(`
    let mooncakeAntiSuicideAllowedAction = null;
    ${allowedMatcher}
    ${consumeAllowedAction}
    globalThis.setAllowed = value => { mooncakeAntiSuicideAllowedAction = value; };
    globalThis.getAllowed = () => mooncakeAntiSuicideAllowedAction;
    globalThis.consume = mooncakeAntiSuicideConsumeAllowedAction;
`, replaySandbox);

const originalAlchemyTarget = {};
const rebuiltAlchemyTarget = {};
const alchemyDescriptor = {
    actionTarget: rebuiltAlchemyTarget,
    kind: 'alchemy',
    itemHrid: '/items/high_value_item'
};
replaySandbox.setAllowed({
    target: originalAlchemyTarget,
    kind: 'alchemy',
    itemHrid: '/items/high_value_item',
    expiresAt: Date.now() + 1_000
});
assert.equal(replaySandbox.consume(alchemyDescriptor, { isTrusted: false }), true, 'a rebuilt alchemy option must accept the replay permit');
assert.ok(replaySandbox.getAllowed(), 'a synthetic replay must retain the short-lived permit for one real retry');
assert.equal(replaySandbox.consume(alchemyDescriptor, { isTrusted: true }), true, 'the immediate real retry must be allowed');
assert.equal(replaySandbox.getAllowed(), null, 'a trusted retry must consume the permit');

replaySandbox.setAllowed({
    target: {},
    kind: 'enhancement',
    itemHrid: '/items/celestial_enhancer',
    level: 13,
    expiresAt: Date.now() + 1_000
});
assert.equal(replaySandbox.consume({
    actionTarget: {},
    kind: 'enhancement',
    itemHrid: '/items/celestial_enhancer',
    level: 14
}, { isTrusted: false }), false, 'a different enhancement level must never inherit an existing permit');

const canReplayTarget = extractFunction('mooncakeAntiSuicideCanReplayTarget');
const getReplayTargets = extractFunction('mooncakeAntiSuicideGetReplayTargets');
const dispatchReplayActivation = extractFunction('mooncakeAntiSuicideDispatchReplayActivation');
const consumeAllowedReplayTarget = extractFunction('mooncakeAntiSuicideConsumeAllowedReplayTarget');
const replayAction = extractFunction('mooncakeAntiSuicideReplayAction');
const shouldPassThroughSelection = extractFunction('mooncakeAntiSuicideShouldPassThroughSelection');
const passThroughSandbox = {};
vm.runInNewContext(`
    ${shouldPassThroughSelection}
    globalThis.shouldPass = mooncakeAntiSuicideShouldPassThroughSelection;
`, passThroughSandbox);
assert.equal(passThroughSandbox.shouldPass({ kind: 'alchemy', selectionTarget: true }), true, 'guarded alchemy source selection must use the original trusted game click');
assert.equal(passThroughSandbox.shouldPass({ kind: 'alchemy', selectionTarget: false }), false, 'the alchemy tab route must retain its regular replay path');
assert.equal(passThroughSandbox.shouldPass({ kind: 'enhancement', selectionTarget: true }), false, 'enhancement selection must not inherit the alchemy pass-through behavior');

class FakeHTMLElement {
    constructor() {
        this.isConnected = true;
        this.events = [];
        this.clickCount = 0;
    }

    dispatchEvent(event) {
        this.events.push(event.type);
        return true;
    }

    click() {
        this.clickCount += 1;
    }

    contains(node) {
        return node === this;
    }
}

class FakeDomEvent {
    constructor(type, options = {}) {
        this.type = type;
        Object.assign(this, options);
    }
}

const replayActivationSandbox = {
    Element: FakeHTMLElement,
    HTMLElement: FakeHTMLElement,
    MOONCAKE_ANTI_SUICIDE_REPLAY_WINDOW_MS: 3_000,
    requestAnimationFrame(callback) {
        callback();
        return 1;
    },
    setTimeout() {
        return 1;
    },
    window: {
        PointerEvent: FakeDomEvent,
        MouseEvent: FakeDomEvent
    }
};
vm.runInNewContext(`
    let mooncakeAntiSuicideAllowedAction = null;
    ${canReplayTarget}
    ${getReplayTargets}
    ${dispatchReplayActivation}
    function mooncakeAntiSuicideReplaySelectionMatches() { return true; }
    ${replayAction}
    globalThis.replay = mooncakeAntiSuicideReplayAction;
    globalThis.getAllowed = () => mooncakeAntiSuicideAllowedAction;
`, replayActivationSandbox);
const replayTarget = new FakeHTMLElement();
const canonicalTarget = new FakeHTMLElement();
replayActivationSandbox.replay({
    actionTarget: canonicalTarget,
    replayTarget,
    kind: 'alchemy',
    itemHrid: '/items/high_value_item'
});
assert.deepEqual(replayTarget.events, [], 'the nested icon target must remain untouched when the item container succeeds');
assert.equal(replayTarget.clickCount, 0, 'the nested icon target must remain a fallback when the clickable item container succeeds');
assert.deepEqual(canonicalTarget.events, ['pointerdown', 'mousedown', 'pointerup', 'mouseup'], 'confirmed replay must activate the clickable item container before nested icon targets');
assert.equal(canonicalTarget.clickCount, 1, 'confirmed replay must issue the native click fallback on the item container');
assert.ok(replayActivationSandbox.getAllowed(), 'the replay permit must remain available until a trusted retry or timeout');

const replayFallbackSandbox = {
    Element: FakeHTMLElement,
    HTMLElement: FakeHTMLElement,
    MOONCAKE_ANTI_SUICIDE_REPLAY_WINDOW_MS: 3_000,
    mooncakeNormalizeEnhanceItemHrid: value => value,
    document: { querySelectorAll: () => [] },
    requestAnimationFrame(callback) {
        callback();
        return 1;
    },
    setTimeout() {
        return 1;
    },
    window: {
        PointerEvent: FakeDomEvent,
        MouseEvent: FakeDomEvent
    }
};
vm.runInNewContext(`
    let mooncakeAntiSuicideAllowedAction = null;
    ${canReplayTarget}
    ${getReplayTargets}
    ${dispatchReplayActivation}
    function mooncakeAntiSuicideReplaySelectionMatches() { return false; }
    ${replayAction}
    globalThis.replay = mooncakeAntiSuicideReplayAction;
`, replayFallbackSandbox);
const fallbackCanonicalTarget = new FakeHTMLElement();
const fallbackOriginalTarget = new FakeHTMLElement();
replayFallbackSandbox.replay({
    actionTarget: fallbackCanonicalTarget,
    replayTarget: fallbackOriginalTarget,
    selectionTarget: true,
    kind: 'alchemy',
    itemHrid: '/items/high_value_item'
});
assert.equal(fallbackCanonicalTarget.clickCount, 1, 'the clickable item container must always receive the first replay attempt');
assert.equal(fallbackOriginalTarget.clickCount, 1, 'the original nested target must be used only when the first replay did not select the item');

const replayPermitSandbox = {
    Element: FakeHTMLElement
};
vm.runInNewContext(`
    let mooncakeAntiSuicideAllowedAction = null;
    ${consumeAllowedReplayTarget}
    globalThis.setAllowed = value => { mooncakeAntiSuicideAllowedAction = value; };
    globalThis.getAllowed = () => mooncakeAntiSuicideAllowedAction;
    globalThis.consume = mooncakeAntiSuicideConsumeAllowedReplayTarget;
`, replayPermitSandbox);
const permittedTarget = new FakeHTMLElement();
replayPermitSandbox.setAllowed({
    replayTargets: [permittedTarget],
    expiresAt: Date.now() + 1_000
});
assert.equal(replayPermitSandbox.consume(permittedTarget, { isTrusted: false }), true, 'the captured replay target must bypass rediscovery before its synthetic click reaches the game');
assert.ok(replayPermitSandbox.getAllowed(), 'a synthetic activation must retain the permit for a rebuilt selector retry');

assert.match(source, /antiSuicideEnhancement:\s*true/, 'enhancement protection needs a default-on setting');
assert.match(source, /antiSuicideAlchemy:\s*true/, 'alchemy protection needs a default-on setting');
assert.match(source, /mooncakeSetAntiSuicideAlchemyEnabled\(false\);[\s\S]{0,180}close\(true\)/, 'planned alchemy branch must disable only alchemy protection before replaying');
assert.match(source, /mooncakeSetAntiSuicideEnhancementEnabled\(enabled\)/, 'enhancement protection needs an independent settings setter');
assert.match(source, /hookMooncakeAntiSuicideSystem\(\);/, 'the anti-suicide hook must be installed during initialization');
assert.match(source, /function mooncakeBuildEnhancementRouteNotice\(/, 'Mirror recommendation needs a dedicated route notice');
assert.match(source, /routeNotice = mooncakeBuildEnhancementRouteNotice\(routeRecommendation\)/, 'the protection helper must render the route notice');
assert.match(source, /isZH \? '严禁自杀' : 'Enhancement safety'/, 'enhancement safety must use the requested Chinese setting label');
assert.match(source, /isZH \? '炼金戒赌' : 'Alchemy safety'/, 'alchemy safety must use the requested Chinese setting label');
assert.match(source, /关闭“炼金戒赌”/, 'planned conversion copy must use the renamed alchemy setting');
assert.match(source, /descriptor\.replayTarget = element;/, 'the original user-clicked node must be retained for confirmation replay');
assert.match(source, /function mooncakeAntiSuicideConsumeAllowedReplayTarget\(/, 'the confirmed replay target must bypass a fragile second descriptor lookup');
assert.match(source, /function mooncakeAntiSuicideGetReplayTargets\(/, 'a rebuilt selector option must be resolved from its item identity');
assert.match(source, /function mooncakeAntiSuicideClearPassedThroughAlchemySelection\(/, 'cancelling a passed-through alchemy selection must remove the selected source item');
assert.match(source, /descriptor\.selectionPassThrough = true;[\s\S]{0,120}mooncakeOpenAntiSuicideModal\(descriptor\);/, 'guarded alchemy selection must open a confirmation overlay without blocking the original click');
assert.ok(
    getReplayTargets.indexOf('appendTarget(descriptor?.actionTarget);') < getReplayTargets.indexOf('appendTarget(descriptor?.replayTarget);'),
    'confirmed selection must replay the clickable item container before the original nested target'
);
assert.match(source, /mooncakeAntiSuicideDispatchReplayActivation\(replayTargets\[0\]\)/, 'confirmed actions must replay the primary selector target first');
assert.match(source, /dispatch\(window\.PointerEvent, 'pointerdown'/, 'confirmed actions must replay the selector pointer sequence');
assert.match(source, /if \(event\?\.isTrusted !== false\) mooncakeAntiSuicideAllowedAction = null;/, 'only a trusted fallback retry may consume a replay permit');

console.log('Anti-suicide system checks passed.');
