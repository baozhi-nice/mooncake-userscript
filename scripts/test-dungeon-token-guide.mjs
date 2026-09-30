import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import vm from 'node:vm';

const source = await readFile(new URL('../src/mooncake.js', import.meta.url), 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, `Missing ${name}`);
    let position = source.indexOf('{', start), depth = 0;
    do {
        if (source[position] === '{') depth++;
        if (source[position] === '}') depth--;
        position++;
    } while (depth);
    return source.slice(start, position);
}
const priceRules = source.slice(source.indexOf('    const MOONCAKE_MARKET_BIN_GAP_UNIT_TIERS'),
    source.indexOf('    function mooncakeEstimateMarketHistorySideVolumes'));
const functions = [
    'mooncakeGetPositivePrice', 'mooncakeIsTraineeCharm', 'mooncakeGetMarketPriceObject',
    'mooncakeGetMarketAskPrice', 'mooncakeGetMarketBidPrice', 'mooncakeGetDungeonTokenShopOutputHrid',
    'mooncakeGetDungeonTokenShopOutputCount', 'mooncakeBuildDungeonTokenRedemptionIndex',
    'mooncakeDungeonTokenRatesEqual', 'mooncakeGetDungeonTokenListingSummary'
].map(extract).join('\n');
function createFixture() {
    const shop = (itemHrid, tokenCount, outputCount = 1, token = '/items/token') => ({
        category: '/shop_categories/dungeon', itemHrid, outputCount,
        costs: [{ itemHrid: token, count: tokenCount }]
    });
    const data = {
        shopItemDetailMap: {
            '/shop_items/a': shop('/items/a', 10),
            '/shop_items/b': shop('/items/b', 5),
            '/shop_items/c': shop('/items/c', 10, 2),
            '/shop_items/other': shop('/items/other', 1, 1, '/items/other_token')
        },
        market: { marketData: {
            '/items/a': { 0: { a: 1.2e6, b: 1e6 } },
            '/items/b': { 0: { a: 480e3, b: 450e3 } },
            '/items/c': { 0: { a: 460e3, b: 400e3 } },
            '/items/other': { 0: { a: 6e6, b: 5e6 } },
            '/items/mirror_of_protection': { 0: { a: 2e6, b: 1.8e6 } }
        } },
        names: { '/items/a': '材料 A', '/items/b': '材料 B', '/items/c': '材料 C' }
    };
    return data;
}
const shared = `
    let data = (${createFixture.toString()})();
    let mooncakeDungeonTokenRedemptionIndex = null, mooncakeDungeonTokenRedemptionIndexSource = null;
    const getInitClientData = () => data;
    const getMarketData = () => data.market;
    ${priceRules}
    ${functions}
`;
const context = vm.createContext({});
vm.runInContext(`${shared}
    this.reset = () => { data = (${createFixture.toString()})(); return data; };
`, context);
let data = context.reset();
const summary = () => context.mooncakeGetDungeonTokenListingSummary('/items/a');
let result = summary();
assert.equal(result.isSelectedBestBid, true);
assert.equal(result.bestOtherBid.itemHrid, '/items/b', 'compare other materials for the same token only');
assert.equal(result.redemptionLineUnitPrice, 900e3);
assert.equal(result.tokenSafeBidUnitPrice, 897e3);
data.market.marketData['/items/a'][0].b = 900e3;
assert.equal(summary().isSelectedBestBid, true, 'a tie still qualifies as best');
data.market.marketData['/items/a'][0].b = 897e3;
assert.equal(summary().isSelectedBestBid, false, 'the next lower valid price loses to the replacement');

data = context.reset();
data.market.marketData['/items/b'][0].b = 400e3;
result = summary();
assert.equal(result.redemptionLineRawUnitPrice, 800e3);
assert.equal(result.redemptionLineUnitPrice, 801e3, 'round up to a valid price, not to an unattainable tie');
assert.equal(result.tokenSafeBidUnitPrice, 798e3, 'inclusive loss threshold is the last losing tick');
data.market.marketData['/items/a'][0].b = 798e3;
assert.equal(summary().isSelectedBestBid, false);
data.market.marketData['/items/a'][0].b = 801e3;
assert.equal(summary().isSelectedBestBid, true);
data.market.marketData['/items/mirror_of_protection'][0].a = 100e3;
assert.equal(summary().redemptionLineUnitPrice, 801e3, 'the mirror cap must not change the loss threshold');
assert.equal(summary().isSelectedBestBid, true, 'exceeding the mirror cap must not hide best status');

data = context.reset();
data.shopItemDetailMap['/shop_items/a'].outputCount = 2;
assert.equal(summary().redemptionLineRawUnitPrice, 450e3, 'include output quantities on both sides');
assert.equal(summary().redemptionLineUnitPrice, 451200, 'apply price steps after the quantity conversion');
data = context.reset();
data.shopItemDetailMap['/shop_items/a'].costs[0].count = 3;
data.shopItemDetailMap['/shop_items/a'].outputCount = 4;
data.shopItemDetailMap['/shop_items/b'].costs[0].count = 1;
data.market.marketData['/items/b'][0].b = 534;
delete data.market.marketData['/items/c'];
assert.equal(summary().redemptionLineRawUnitPrice, 400.5);
assert.equal(summary().redemptionLineUnitPrice, 402, 'fractional coin thresholds must not round down');
assert.equal(summary().tokenSafeBidUnitPrice, 400);
data.market.marketData['/items/a'][0].b = 400;
assert.equal(summary().isSelectedBestBid, false);
data.market.marketData['/items/a'][0].b = 402;
assert.equal(summary().isSelectedBestBid, true);

data = context.reset();
data.shopItemDetailMap['/shop_items/a'].costs[0].count = 37;
data.shopItemDetailMap['/shop_items/b'].costs[0].count = 37;
data.market.marketData['/items/b'][0].b = 900e3;
delete data.market.marketData['/items/c'];
assert.equal(summary().redemptionLineUnitPrice, 900e3, 'floating-point noise must not turn a tie into a higher tick');
assert.equal(summary().tokenSafeBidUnitPrice, 897e3, 'an inclusive loss threshold must never include an exact tie');
data.market.marketData['/items/a'][0].b = 900e3;
assert.equal(summary().isSelectedBestBid, true);

data = context.reset();
delete data.market.marketData['/items/b'];
data.market.marketData['/items/c'][0].b = 0;
assert.equal(summary().bestOtherBid, null, 'do not substitute asks for missing bids');
assert.equal(summary().redemptionLineUnitPrice, 0, 'missing competitor data must not invent a threshold');
assert.equal(summary().isSelectedBestBid, true);
assert.equal(context.mooncakeGetDungeonTokenListingSummary('/items/unknown'), null);
data = context.reset();
data.shopItemDetailMap['/shop_items/a'].costs[0].count = 1;
data.shopItemDetailMap['/shop_items/b'].costs[0].count = 1;
delete data.market.marketData['/items/c'];
data.market.marketData['/items/a'][0].b = 2;
data.market.marketData['/items/b'][0].b = 2;
assert.equal(summary().isSelectedBestBid, true);
assert.equal(summary().tokenSafeBidUnitPrice, 0, 'there is no losing price below the minimum valid tick');
console.log('PASS dungeon-token thresholds: same-token ratios, ties, valid price steps, fractional coins, mirror independence and missing quotes.');

if (process.argv.includes('--serve')) {
    const constants = [...source.matchAll(/^    const (?:MOONCAKE_DUNGEON_TOKEN_LISTING_\w+|MOONCAKE_ORDER_MODAL_CONTENT_SELECTOR) = .+;/gm)]
        .map(match => match[0]).join('\n');
    const renderFunctions = [
        'mooncakeRemoveDungeonTokenListingGuide', 'mooncakeGetOrderModalItemBadgeTarget',
        'mooncakePositionDungeonTokenListingBadge', 'mooncakeEnsureDungeonTokenListingBadge',
        'mooncakeEnsureDungeonTokenListingGuide'
    ].map(extract).join('\n');
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>地下城材料临界价检查</title><style>
    *{box-sizing:border-box}body{background:#191b27;color:#ddd;font:16px system-ui;margin:24px}
    button{padding:8px 14px;border:1px solid #62729c;border-radius:5px;background:#4054a8;color:white;cursor:pointer}
    .Modal_modalContainer__test{width:min(480px,100%);margin:25px auto;padding:18px;border:1px solid #8c8c9b;border-radius:8px;background:#111319;text-align:center}
    h2{font-size:22px;margin:0 0 18px}.MarketplacePanel_itemContainer__test{display:flex;justify-content:center}
    .Item_item__test{display:grid;place-content:center;width:108px;height:108px;background:#2c2d45;border-radius:7px;font-size:44px}
    .form{margin-top:24px}input{display:block;margin:8px auto 22px;width:170px;background:#dde1f8;color:#171925;border:0;padding:6px;font:inherit}
    #result{white-space:pre-wrap;font-size:13px}.note{color:#a5adbe;font-size:13px;margin:12px 0}
    </style><button id="run">运行临界价检查</button> <button id="long">查看长材料名</button> <button id="example">查看发光提示</button>
    <p class="note">本地模拟挂牌窗口；材料 A：10 枚换 1 个，买一 1M；材料 B：5 枚换 1 个，买一 450K。</p>
    <div class="Modal_modalContainer__test" id="modal" data-kind="buy-listing"><div class="MarketplacePanel_modalContent__test">
    <h2>购买挂牌</h2><div class="MarketplacePanel_itemContainer__test"><div class="Item_item__test">🧵</div></div>
    <div class="form"><label>价格<input value="1,000,000" aria-label="价格"></label><label>数量<input value="1" aria-label="数量"></label><button id="publish">发布购买挂牌（模拟）</button></div>
    </div></div><pre id="result" role="status">等待检查</pre><script>
    ${constants}
    ${shared}
    let isZH = true, enabled = true, posts = 0;
    const mooncakeDungeonTokenListingBadges = new WeakMap();
    const getItemName = hrid => data.names[hrid] || hrid;
    const mooncakeGetItemDetailOfHrid = hrid => ({name:data.names[hrid] || hrid});
    const mooncakeIsDungeonTokenListingGuideEnabled = () => enabled;
    const mooncakeIsCreateOrderModal = modal => !!modal.dataset.kind;
    const mooncakeGetOrderModalTransactionKind = modal => modal.dataset.kind;
    const mooncakeGetOrderModalItemHrid = () => '/items/a';
    ${renderFunctions}
    const modal = document.getElementById('modal');
    const render = () => mooncakeEnsureDungeonTokenListingGuide(modal);
    const badge = () => document.querySelector('[data-mooncake-dungeon-token-listing-badge]');
    const quote = item => data.market.marketData['/items/'+item][0];
    const expect = (condition,message) => {if(!condition)throw Error(message)};
    const checkBounds = () => {
        const node = badge(), rect = node.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();
        const iconRect = modal.querySelector('.Item_item__test').getBoundingClientRect();
        expect(rect.left >= 7 && rect.right <= document.documentElement.clientWidth - 7,'标记超出窗口');
        expect(rect.left >= modalRect.left && rect.right <= modalRect.right,'标记超出挂牌弹窗');
        expect(rect.left >= iconRect.right || rect.right <= iconRect.left,'标记遮挡物品图标');
        const headerRect=modal.querySelector('h2').getBoundingClientRect();
        const formRect=modal.querySelector('.form').getBoundingClientRect();
        expect(rect.top >= headerRect.bottom && rect.bottom <= formRect.top,'标记遮挡标题或表单');
        expect(node.scrollWidth <= rect.width + 1,'长文案被截断');
    };
    function reset(){data=(${createFixture.toString()})();isZH=true;enabled=true;modal.dataset.kind='buy-listing';render()}
    document.getElementById('publish').onclick=()=>posts++;
    document.getElementById('long').onclick=()=>{reset();data.names['/items/b']='皇家地下城珍稀强化材料长名称示例';render();checkBounds()};
    document.getElementById('example').onclick=()=>{
        reset();modal.style.width='400px';data.names['/items/b']='裂空宝石';
        quote('a').b=568e4;quote('b').b=283e4;render();checkBounds();
        const hint=badge()._mooncakeDungeonTokenListingLabelHint;
        expect(hint.scrollWidth<=hint.clientWidth,'常规材料名不应截断');
        document.querySelector('input[aria-label="价格"]').value='5,700,000';
        document.querySelector('.note').textContent='样式示例：5.66M 仍并列最优；降至 5.64M 或更低时，由裂空宝石取代。';
    };
    document.getElementById('run').onclick=()=>{
        const checks=[];
        function check(name,run){run();checks.push(name)}
        try{
            reset();const initial=badge();
            check('最优兑换显示临界价与接替材料',()=>{
                expect(initial.innerText.includes('临界值 ≤ 897K'),'临界值未显示');
                expect(initial.innerText.includes('由【材料 B】取代'),'接替材料未显示');checkBounds();
                expect(initial.querySelector('img')?.getBoundingClientRect().height>0,'图片未恢复');
                expect(getComputedStyle(initial).boxShadow!=='none','图片与文字未共用发光边框');
            });
            check('保护之镜上限不改变临界价',()=>{quote('mirror_of_protection').a=100e3;render();expect(badge().innerText.includes('≤ 897K'),'错误使用镜子上限')});
            check('并列最优与降一档失去最优',()=>{
                quote('a').b=900e3;render();expect(badge().innerText.includes('最优兑换'),'并列时丢失标记');
                quote('a').b=897e3;render();expect(badge().innerText.includes('兑换线')&&badge().innerText.includes('100K')&&!badge().innerText.includes('取代'),'非最优时残留旧文案');
                quote('a').b=1e6;render();expect(badge()===initial,'报价更新重建了标记');
            });
            check('临界值使用实际失去最优的价格档位',()=>{quote('b').b=400e3;render();expect(badge().innerText.includes('≤ 798K'),'价格档位不正确')});
            check('多个材料并列接替',()=>{quote('b').b=450e3;quote('c').b=450e3;render();expect(badge().innerText.includes('由【材料 B】等材料取代'),'并列材料未说明')});
            check('无报价时不给出虚构临界价，恢复后更新',()=>{
                delete data.market.marketData['/items/b'];quote('c').b=0;render();
                expect(badge().innerText.includes('暂无其他材料报价')&&!badge().innerText.includes('≤'),'缺失行情残留阈值');
                reset();expect(badge().innerText.includes('≤ 897K'),'行情恢复后没有更新');
            });
            check('长材料名、英文与窄弹窗布局',()=>{
                data.names['/items/b']='皇家地下城珍稀强化材料长名称示例';render();checkBounds();
                expect(badge().title.includes(data.names['/items/b']),'完整名称无法查看');
                isZH=false;data.names['/items/b']='RareRoyalDungeonEnhancementMaterial';render();checkBounds();
                expect(badge().innerText.includes('≤ 897K'),'英文阈值缺失');
                const width=modal.style.width;modal.style.width='320px';render();checkBounds();modal.style.width=width;render();
            });
            check('购买场景启用，出售与设置关闭时清理',()=>{
                reset();modal.dataset.kind='instant-buy';render();expect(badge(),'立即购买缺少提示');
                modal.dataset.kind='sell-listing';render();expect(!badge(),'出售时未清理');
                modal.dataset.kind='buy-listing';render();enabled=false;render();expect(!badge(),'关闭开关后仍显示');
                reset();expect(document.querySelectorAll('[data-mooncake-dungeon-token-listing-badge]').length===1,'重复标记');
                expect(posts===0,'触发了挂牌提交');
            });
            document.getElementById('result').textContent='PASS '+checks.length+' 项\\n'+checks.join('\\n');
        }catch(error){document.getElementById('result').textContent='FAIL '+error.message+'\\n'+checks.join('\\n')}
    };
    window.addEventListener('resize',render);render();
    </script></html>`;
    createServer((request,response)=>{
        response.setHeader('Content-Type','text/html; charset=utf-8');response.end(html);
    }).listen(0,'127.0.0.1',function(){console.log('Dungeon token guide: http://127.0.0.1:'+this.address().port)});
}
