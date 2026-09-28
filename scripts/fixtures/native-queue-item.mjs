import { readFile } from 'node:fs/promises';

// Use the Item class and Inventory item factory from the supplied official game
// bundle. Keep its code out of the repository and replace only external services
// with local spies; no game requests or account actions occur in this fixture.
export async function nativeItemFixture(bundlePath) {
    const bundle = await readFile(bundlePath, 'utf8');
    function slice(from, to) {
        const start = bundle.indexOf(from);
        const end = bundle.indexOf(to, start);
        if (start < 0 || end < 0) throw new Error(`Unsupported game bundle: ${from}`);
        return bundle.slice(start, end);
    }
    const item = slice('class Tr extends', 'var wr=');
    const factory = slice('getLearnAbilityBookHandler(e){', 'renderFoolStoneItem(');
    return String.raw`
const s = {a: React};
const h = {jsx: (type, props, key) => React.createElement(type, {...props, key}),
    jsxs: (type, props, key) => React.createElement(type, {...props, key})};
const F = {
    getDetail: item => F.getDetailByHrid(item.itemHrid),
    getDetailByHrid: hrid => ({hrid, isTradable: true, sellPrice: 100,
        equipmentDetail: hrid.includes('equipment') ? {levelRequirements: []} : null}),
    isEquipment: hrid => hrid.includes('equipment'), isAbilityBook: () => false,
    getEquipableItemLocationHridByItemHrid: () => '/item_locations/head',
    getItemLocationDetailByHrid: () => ({isMultiItem: true})
};
const W = {formatShorten: value => String(value)};
const Be = {getItemIconSrc: hrid => hrid, MiscIcons: {LockBadge:'🔒', FavoriteBadge:'♥'}};
const D = props => React.createElement('span', {role:'img', 'aria-label':props.alt},
    props.src.startsWith('/items/') ? (props.src.includes('equipment') ? '⚒' : '◆') : props.src);
const Js = {Kinds:{Lock:'lock', Favorite:'favorite'}, isMarked: (marks, kind, level) => !!marks?.[kind]?.includes(level)};
const Qi = {isCharacterMarketRestricted: () => false};
const te = {checkLevelRequirements: skills => skills.get('allowed') !== false};
const Xr = {isItemAlchemizable: () => true}, Tn = {isItemEnhanceable: item => F.isEquipment(item.itemHrid)};
const Or = 'inline', kr = 'small', Sr = 'large';
const vn = {a: new Proxy({}, {get: (_, name) => 'Item_' + name + '__fixture'})};
const xr = props => React.createElement(React.Fragment, null, props.children,
    props.open ? ReactDOM.createPortal(React.createElement('div', {role:'dialog', className:'native-menu'},
        props.content, React.createElement('button', {onClick:props.onClose}, '关闭菜单')), document.body) : null);
const yr = props => props.children;
const dt = ({text, onClick, disabled}) => React.createElement('button', {onClick, disabled}, text);
const _s = ({value, onChange}) => React.createElement('input', {type:'number', value, onChange, 'aria-label':'数量'});
const translate = key => ({'item.equip':'装备', 'item.enhance':'强化', 'item.alchemize':'炼金',
    'item.viewMarketplace':'前往市场', 'item.linkToChat':'链接到聊天', 'item.openItemDictionary':'打开物品词典',
    'item.favoriteOrLock':'最爱 / 锁定', 'item.sellFor':'卖出', 'item.confirmSellFor':'确认卖出',
    'item.all':'全部', 'item.cannotDuringCombat':'战斗中不可用', 'item.levelNotMet':'等级不足'}[key] || key.replace('itemNames.', ''));
${item}
const wr = React.memo(props => React.createElement(Tr, {...props, t:translate}));
class FixtureInventory {
    constructor(items) {
        this.props = {characterItemMap: items, characterItemMarkDict: {},
            characterSkillMap: new Map(), characterAbilityMap: new Map(), isInCombat:false};
        for (const name of ['equipItemHandler','addEnhancingItemHandler','addAlchemyItemHandler',
            'goToMarketplaceHandler','itemLinkHandler','openItemDictionaryHandler','sellToShopHandler']) {
            this.props[name] = (...args) => recordAction(name, args);
        }
        this.openItemMarkMenu = (...args) => recordAction('marks', args);
    }
    componentDidUpdate() { this.originalUpdates = (this.originalUpdates || 0) + 1; }
    ${factory}
}
`;
}
