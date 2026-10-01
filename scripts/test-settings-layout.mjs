import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';

const projectRoot = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(projectRoot, 'src', 'mooncake.js'), 'utf8');

assert.match(source, /@media \(min-width:1320px\)/, 'wide settings layout must have a dedicated breakpoint');
assert.match(
    source,
    /grid-template-areas:"transfer transfer transfer transfer" "market market listings chat" "enhance enhance enhance enhance" "quote quote quote quote"/,
    'wide settings must keep the quote after the compacted sections'
);
assert.match(
    source,
    /data-mooncake-enhancement-settings-group="market"\] \[data-mooncake-enhancement-settings-rows\] \{ display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    'market settings must use two columns on wide screens'
);
assert.match(
    source,
    /grid-template-areas:"lazy inventory base-cost" "route protection base-cost" "standard-hourly anti-suicide-enhancement queue-next" "style anti-suicide-alchemy buff" "reminder reminder-level \."/,
    'enhancement settings must keep base cost in the upper-right and standard hourly below the route selector'
);
assert.match(source, /isZH \? '棒棒糖按钮🍭' : 'Lollipop button'/, 'lollipop visibility should use the merged setting title');
assert.match(source, /isZH \? '包子页签或按Ctrl\+Alt\+D隐藏\/显示'/, 'lollipop visibility should explain both restore paths');
assert.doesNotMatch(source, /data-mooncake-enhancement-settings-fab-shortcut/, 'lollipop shortcut must not render as a separate settings card');
assert.match(source, /baseItemCostPricePolicyRow\.setAttribute\('data-mooncake-settings-enhance-row', 'base-cost'\)/, 'base cost policy must live in the enhancement grid');
assert.doesNotMatch(source, /data-mooncake-enhancement-settings-group="market"\] \[data-mooncake-base-item-cost-price-policy\] \{ grid-column:1 \/ -1; \}/, 'base cost policy must not span both market columns');
assert.match(source, /data-mooncake-enhancement-settings-easter-egg\] \{ margin:6px 0 0/, 'quote spacing must stay compact');

console.log('Settings layout checks passed.');

// Render the production styles and row builders so narrow-screen clipping can
// be checked in a real browser, including controls below the first screen.
if (process.argv.includes('--serve')) {
    const upgrade = source.slice(source.indexOf('    function mooncakeUpgradeVirtualConfigPanel('));
    const panelStyle = upgrade.match(/configPanel\.style\.cssText = '([^']+)'/)[1];
    const cssStart = upgrade.indexOf('style.textContent = `') + 'style.textContent = `'.length;
    const css = upgrade.slice(cssStart, upgrade.indexOf('`;', cssStart));
    const builders = source.slice(
        source.indexOf('    function mooncakeCreateSettingsTransferSection('),
        source.indexOf('    function mooncakeNormalizeEnhancementSettingsTab(')
    );
    const defaults = source.slice(source.indexOf('    const MOONCAKE_HOURLY_WAGE_TIER_KEYS'), source.indexOf('    const MOONCAKE_BASE_ITEM_COST_PRICE_SOURCE_KEYS'));
    const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>设置中心移动端布局验证</title>
<style>body{margin:0;background:#10131c} ${css}</style>
<div id="better-loot-tracker-config-panel" style="${panelStyle.replace('display:none', 'display:flex')}">
  <div data-mooncake-enhancement-settings-dialog role="dialog" aria-label="设置面板">
    <div data-mooncake-enhancement-settings-chrome>
      <div data-mooncake-enhancement-settings-tablist role="tablist">
        ${['挂单记录', '设置中心', '装装糕手', '已读取装备信息', '打赏'].map((name, i) =>
            '<button role="tab" data-mooncake-enhancement-settings-tab aria-selected="' + (i === 1) + '">' + name + '</button>').join('')}
      </div>
      <button type="button" aria-label="关闭设置" style="width:44px;height:44px;background:transparent;border:0;color:#edf2ff;font-size:26px">×</button>
    </div>
    <div data-mooncake-enhancement-settings-body><div data-mooncake-enhancement-settings-tabpanel="settings"></div></div>
  </div>
</div>
<script>
const isZH = true;
const mooncakeGetEnhancementSettingsToggleValue = () => true;
${defaults}
let testProfile = structuredClone(MOONCAKE_DEFAULT_HOURLY_WAGE_COLOR_PROFILE);
const mooncakeGetHourlyWageColorProfile = () => testProfile;
const mooncakeGetHourlyWageColorProfileStorageValue = () => structuredClone(testProfile);
const mooncakeSetHourlyWageColorProfile = next => { testProfile = next; mooncakeSyncHourlyWageColorProfileControls(document); return true; };
const mooncakeBindNonNegativeHourlyInput = () => {};
const MOONCAKE_BASE_ITEM_COST_PRICE_SOURCE_KEYS = ['ask', 'askMinusOne', 'bidPlusOne', 'bid'];
const mooncakeGetBaseItemCostPricePolicy = () => ({material:['ask', 'askMinusOne'], product:'ask'});
${builders}
const page = document.querySelector('[data-mooncake-enhancement-settings-tabpanel="settings"]');
const status = document.createElement('output');
status.setAttribute('data-mooncake-enhancement-settings-easter-egg', '1');
status.setAttribute('aria-live', 'polite');
status.textContent = '本地布局验证，不会改动游戏设置。';
function section(key, title, description) {
    const result = mooncakeCreateEnhancementSettingsSection(title, description);
    result.section.setAttribute('data-mooncake-enhancement-settings-group', key);
    page.append(result.section);
    return result.rows;
}
function toggle(key, title, description, extra = '') {
    const row = mooncakeCreateEnhancementSettingsToggle(key, title, description, '', extra ? 'div' : 'label');
    row.querySelector('[data-mooncake-enhancement-settings-toggle-state]').textContent = '已启用';
    if (extra === '分档') {
        row.querySelector('[data-mooncake-enhancement-settings-row-control]').append(mooncakeCreateHourlyWageColorProfilePopover());
    } else if (extra) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = extra;
        button.setAttribute('data-mooncake-enhancement-settings-command', '1');
        row.querySelector('[data-mooncake-enhancement-settings-row-control]').append(button);
    }
    return row;
}
function inputRow(title, description, value, hourly = false, type = 'text') {
    const input = document.createElement('input');
    input.type = hourly ? 'number' : type;
    input.value = value;
    input.setAttribute('aria-label', title);
    return (hourly ? mooncakeCreateEnhancementSettingsHourlyInputRow : mooncakeCreateEnhancementSettingsTextInputRow)(title, description, input);
}
function selectRow(title, description, options) {
    const select = document.createElement('select');
    select.setAttribute('aria-label', title);
    options.forEach(text => select.add(new Option(text, text)));
    return mooncakeCreateEnhancementSettingsSelectRow(title, description, select);
}
page.append(mooncakeCreateSettingsTransferSection());
const market = section('market', '市场显示', '行情、工时与导航。');
market.append(
    toggle('history', '交易卡片', '显示近期行情统计。', '归位'),
    toggle('recent', '最近成交价', '显示最近买/卖成交价。'),
    toggle('hourly', '市场工时', '显示挂单工时费。', '分档'),
    toggle('lollipop', '棒棒糖按钮🍭', '包子页签或按Ctrl+Alt+D隐藏/显示'),
    toggle('duration', '挂单时长', '在订单簿显示挂单已存在时长。'),
    toggle('dungeon', '地下城代币提示', '购买挂牌或订单行购买时，标记当前每代币买一最优的地下城兑换物。'),
    toggle('navigation', '快捷导航', '显示等级、关联物品与最近访问入口。'),
    inputRow('最近访问数量', '快捷导航保留最近访问的市场物品，范围 1–20，默认 5。', '5', false, 'number'),
    inputRow('快捷等级', '用逗号分隔 0–20，例如 0,5,7,10；留空即默认。', '0,7,8,10,11,12,14'),
    selectRow('默认跳转等级', '生活精华跳转装备时使用。', ['+0', '+7', '+10', '+12'])
);
const listings = section('listings', '我的挂单', '管理、记录与定价。');
listings.append(
    toggle('management', '挂单管理', '搜索并筛选我的挂单。'),
    toggle('crowd', '挂单时间众筹', '共享挂单 id、估算创建时间，并显示挂单资金汇总。'),
    toggle('records', '挂单记录', '保存挂单快照和我的成交记录。'),
    inputRow('挂单目标', '挂牌填价和强化行情参考高亮使用。', '15', true),
    toggle('undercut', '扣扣出击', '筛选可继续压价的出售单。'),
    inputRow('扣扣目标', '独立时使用；否则跟随挂单目标。', '8', true)
);
const chat = section('chat', '聊天速算', '聊天挂单快速估算。');
chat.append(toggle('chat', '工时费速算', '显示聊天挂单工时费。'));
const enhance = section('enhance', '强化', '方案、计算与界面辅助。');
[
    ['lazy', toggle('lazy', '懒鬼按钮', '保存多组方案，自动填入默认方案。', '管理 (21)')],
    ['inventory', toggle('inventory', '背包管理', '按用途整理强化背包。', '管理 (3)')],
    ['route', selectRow('强化路线', '标准工时：把时间折算为成本，自动权衡保护消耗与预计耗时。', ['标准工时', '最高工时', '最高利润'])],
    ['standard-hourly', inputRow('标准工时设定', '仅供“标准工时”策略使用：按该工时算最低成本来判断保护等级。', '12', true)],
    ['protection', toggle('protection', '保护助手', '隐藏高风险保护选项。')],
    ['anti-suicide-enhancement', toggle('safe', '严禁自杀', '星空强化器 +13 起的普通强化需要连续确认；贤璐路线会明确提示。')],
    ['queue-next', toggle('next', '下一次队列', '在行动队列中显示“设为下一次”；收藏插件已提供时自动避让。')],
    ['style', toggle('style', '强化等级美化', '按等级分级着色。')],
    ['buff', toggle('buff', '强化buff', '计入实时强化速度。')],
    ['anti-suicide-alchemy', toggle('alchemy', '炼金戒赌', '选择“计划内转化”后会自动关闭此项。')],
    ['reminder', toggle('reminder', '强化等级提醒', '低于阈值时放大停止按钮。')],
    ['reminder-level', inputRow('提醒等级', '达到该等级时提醒。', '10')]
].forEach(([key, row]) => { row.setAttribute('data-mooncake-settings-enhance-row', key); enhance.append(row); });
const baseCost = mooncakeCreateBaseItemCostPricePolicyControl();
baseCost.setAttribute('data-mooncake-settings-enhance-row', 'base-cost');
enhance.append(baseCost);
page.append(status);
page.addEventListener('change', event => {
    status.textContent = '已操作：' + (event.target.getAttribute('aria-label') || '控件') + ' = ' +
        (event.target.type === 'checkbox' ? event.target.checked : event.target.value);
});
page.addEventListener('click', event => {
    if (event.target.matches('[data-mooncake-enhancement-settings-command]')) status.textContent = '已点击：' + event.target.textContent;
});
</script></html>`;
    const server = createServer((request, response) => {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(html);
    });
    server.listen(0, '127.0.0.1', () => console.log(`Settings layout fixture: http://127.0.0.1:${server.address().port}`));
}
