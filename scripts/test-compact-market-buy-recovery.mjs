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

class FakeButton {
    constructor({ text = '', classes = [], disabled = false, ariaDisabled = null } = {}) {
        this.textContent = text;
        this.disabled = disabled;
        this.classList = new Set(classes);
        this.attributes = new Map();
        this.clicks = 0;
        if (ariaDisabled !== null) this.attributes.set('aria-disabled', ariaDisabled);
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    click() {
        this.clicks += 1;
    }
}

const getText = extractFunction('mooncakeGetMarketplaceNavigationButtonText');
const isBuyAction = extractFunction('mooncakeIsCompactMarketplaceBuyActionButton');
const isStale = extractFunction('mooncakeIsStaleCompactMarketplaceBuyAction');
const findRefresh = extractFunction('mooncakeFindCompactMarketplaceRefreshButton');
const recover = extractFunction('mooncakeRecoverCompactMarketplaceBuyActions');
const sandbox = {
    HTMLButtonElement: FakeButton,
    MOONCAKE_NATIVE_DISABLED_BUTTON_CLASS_RE: /^Button_disabled(?:__|$)/
};

vm.runInNewContext(`
    ${getText}
    ${isBuyAction}
    ${isStale}
    ${findRefresh}
    globalThis.isStale = mooncakeIsStaleCompactMarketplaceBuyAction;
    globalThis.findRefresh = mooncakeFindCompactMarketplaceRefreshButton;
`, sandbox, { filename: 'compact-market-buy-recovery.js' });

const staleBuyListing = new FakeButton({
    text: '+ 新购买挂牌',
    classes: ['Button_button__1Fe9z', 'Button_buy__3s24l', 'Button_disabled__wCyIq']
});
assert.equal(sandbox.isStale(staleBuyListing), true, 'an enabled compact buy-listing button with a native disabled class must be recovered');
assert.equal(
    sandbox.isStale(new FakeButton({
        text: '+ 新购买挂牌',
        disabled: true,
        classes: ['Button_buy__3s24l', 'Button_disabled__wCyIq']
    })),
    false,
    'a genuinely disabled buy-listing button must remain untouched'
);
assert.equal(
    sandbox.isStale(new FakeButton({
        text: '购买',
        classes: ['Button_buy__3s24l']
    })),
    false,
    'a healthy buy action must not trigger a refresh'
);
assert.equal(
    sandbox.isStale(new FakeButton({
        text: 'Buy',
        classes: ['Button_buy__3s24l', 'Button_disabled__wCyIq'],
        ariaDisabled: 'true'
    })),
    false,
    'ARIA-disabled buy actions must remain untouched'
);

const refresh = new FakeButton({ text: '刷新' });
const panel = {
    querySelectorAll(selector) {
        assert.equal(selector, 'button');
        return [staleBuyListing, refresh];
    }
};
assert.equal(sandbox.findRefresh(panel), refresh, 'the recovery must use the native refresh button in the same compact marketplace');

const activeOrderRoots = [];
const recoverySandbox = {
    HTMLButtonElement: FakeButton,
    MOONCAKE_NATIVE_DISABLED_BUTTON_CLASS_RE: /^Button_disabled(?:__|$)/,
    document: {
        querySelectorAll(selector) {
            assert.equal(selector, '[class*="MainPanel_marketplaceModalContent"]');
            return [panel];
        }
    },
    mooncakeFindOrderModalRoots() {
        return activeOrderRoots;
    },
    mooncakeIsCreateOrderModal(modal) {
        return modal?.isCreate === true;
    },
    mooncakeIsVisibleElement() {
        return true;
    }
};
vm.runInNewContext(`
    ${getText}
    ${isBuyAction}
    ${isStale}
    ${findRefresh}
    ${recover}
    globalThis.recover = mooncakeRecoverCompactMarketplaceBuyActions;
`, recoverySandbox, { filename: 'compact-market-buy-recovery-runtime.js' });
assert.equal(recoverySandbox.recover(), true, 'a stale compact buy action must trigger a native refresh');
assert.equal(refresh.clicks, 1, 'the recovery must refresh exactly the compact marketplace that contains the stale action');
activeOrderRoots.push({ isCreate: true });
assert.equal(recoverySandbox.recover(), false, 'an open order dialog must never be refreshed underneath the player');
assert.equal(refresh.clicks, 1, 'the active order dialog guard must prevent an additional refresh');

assert.match(
    source,
    /function mooncakeRecoverCompactMarketplaceBuyActions\(\)[\s\S]{0,1100}?refreshButton\.click\(\)/,
    'the stale compact-market action must trigger exactly the native refresh path'
);
assert.match(
    source,
    /function hookMooncakeCompactMarketplaceBuyActionRecovery\(\)[\s\S]{0,750}?subscribeDocumentMutations\('compact-market-buy-action-recovery'/,
    'the recovery must run after order-modal DOM changes'
);
assert.match(
    source,
    /hookMooncakeOrderModalEconomics\(\);\s*hookMooncakeCompactMarketplaceBuyActionRecovery\(\);/,
    'the compact-market recovery hook must be initialized with the marketplace helpers'
);

console.log('Compact marketplace buy-action recovery checks passed.');
