import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readEnhancementSource } from './lib/enhancement-cache-harness.mjs';
import { settlePricingBrowserFrames } from './lib/market-pricing-test-support.mjs';

const source = await readEnhancementSource();
const names = ['mooncakeGetDocumentMutationContext', 'mooncakeQueryDocumentRoots', 'ensureDocumentMutationObserver', 'subscribeDocumentMutations'];
for (const name of names) assert(source.functions.has(name));
if (!process.argv.includes('--serve')) {
    console.log('Use --serve for real-DOM routing, shared root discovery, native rebuilds and subscription lifecycle checks.');
    process.exit(0);
}
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>C 批页面调度检查</title>
<style>body{font:16px system-ui;background:#121722;color:#e0e6f5;margin:24px}button{background:#4561b0;color:white;padding:9px 16px;border:0;border-radius:5px}pre{white-space:pre-wrap;line-height:1.8}#stage{padding:12px;border:1px solid #485474}table{width:100%;background:#202b40}td{padding:8px}</style>
<h2>C 批：页面检查共享与生命周期</h2><button id="run">运行页面检查</button><pre id="result" role="status">等待检查</pre><div id="stage"></div>
<script>
const documentMutationSubscribers=new Map();let documentMutationObserver=null;
const mooncakeDocumentMutationContexts=new WeakMap();let mooncakeActiveDocumentMutationContext=null;
${names.map(name => source.functions.get(name)).join('\n')}
const wait=${settlePricingBrowserFrames.toString()};
const stage=document.getElementById('stage'),result=document.getElementById('result');
const calls={},seen=[];let rootQueries=0;
const nativeQuery=document.querySelectorAll.bind(document);
document.querySelectorAll=function(selector){if(selector==='[data-page-root]')rootQueries++;return nativeQuery(selector)};
for(const name of ['market-detail','my-listings','market-order-economics','chat-labor','loot-log','external-module']){
 subscribeDocumentMutations(name,()=>{calls[name]=(calls[name]||0)+1;if(name.startsWith('market-')||name==='my-listings')seen.push(mooncakeQueryDocumentRoots('[data-page-root]').map(node=>node.id).join(','))});
}
const reset=async()=>{stage.replaceChildren();await wait(30);for(const name in calls)calls[name]=0;rootQueries=0;seen.length=0};
const expect=(value,message)=>{if(!value)throw Error(message)};
async function run(){document.getElementById('run').disabled=true;const checks=[];
 const check=async(name,body)=>{await reset();try{await body();checks.push('PASS '+name)}catch(error){checks.push('FAIL '+name+'：'+error.message)}result.textContent=checks.join('\\n')};
 await check('无关战斗变化跳过市场、聊天和掉落检查',async()=>{const battle=document.createElement('div');battle.className='BattlePanel';stage.append(battle);await wait(50);expect(!calls['market-detail']&&!calls['chat-labor']&&!calls['loot-log'],'无关模块被唤醒');expect(calls['external-module']>0,'未知扩展订阅被误过滤')});
 await check('同批三个市场模块共享一次根节点查询',async()=>{stage.innerHTML='<section class="MarketplacePanel_marketplacePanel_fixture"><table id="native-a" data-page-root><tr><td>122.5M</td></tr></table></section>';await wait(50);expect(calls['market-detail']===1&&calls['my-listings']===1&&calls['market-order-economics']===1,'市场模块通知缺失或重复');expect(rootQueries===1,'重复发现页面根节点：'+rootQueries);expect(seen.every(ids=>ids==='native-a'),'读取了过期根节点');expect(!calls['chat-labor']&&!calls['loot-log'],'市场触发其他页面模块')});
 await check('已挂载市场不使无关页面变化触发市场扫描',async()=>{stage.innerHTML='<section class="MarketplacePanel_marketplacePanel_fixture"><table data-page-root></table></section>';await wait(50);const before=calls['market-detail'];stage.append(document.createElement('aside'));await wait(50);expect(calls['market-detail']===before,'只因市场存在就扫描')});
 await check('文本原地变化、嵌套页面插入和整块移除仍通知',async()=>{const market=document.createElement('section');market.className='MarketplacePanel_marketplacePanel_fixture';market.innerHTML='<table data-page-root id="native-a"><tr><td>1M</td></tr></table>';stage.append(market);await wait(50);let before=calls['market-detail'];market.querySelector('td').firstChild.nodeValue='2M';market.querySelector('td').append(document.createTextNode(' gold'));await wait(50);expect(calls['market-detail']>before,'原地价格更新遗漏');const outer=document.createElement('div');outer.innerHTML='<div class="MainPanel_marketplaceModalContent_fixture"><table data-page-root id="native-b"></table></div>';stage.append(outer);await wait(50);expect(seen.at(-1)==='native-a,native-b','嵌套弹窗未发现');before=calls['market-detail'];outer.remove();await wait(50);expect(calls['market-detail']>before&&seen.at(-1)==='native-a','移除弹窗未恢复背景页面')});
 await check('聊天与掉落独立分派，断开页面不保留旧根',async()=>{stage.innerHTML='<section class="ChatHistory_chatHistory_fixture"><div class="ChatMessage_chatMessage_fixture">新消息</div></section>';await wait(50);expect(calls['chat-labor']===1&&!calls['loot-log']&&!calls['market-detail'],'聊天分类错误');stage.replaceChildren();const loot=document.createElement('section');loot.className='LootLogPanel_actionLoots_fixture';stage.append(loot);await wait(50);expect(calls['loot-log']===1,'掉落分类错误');expect(mooncakeQueryDocumentRoots('[data-page-root]').length===0,'直接读取复用了旧的根节点')});
 await check('旧取消句柄不移除新订阅；关闭后可重新注册',async()=>{let first=0,second=0;const stopOld=subscribeDocumentMutations('reused',()=>first++);const stopNew=subscribeDocumentMutations('reused',()=>second++);stopOld();stage.append(document.createElement('div'));await wait(50);expect(first===0&&second>0,'旧取消句柄误删新订阅');stopNew();const before=second;stage.append(document.createElement('div'));await wait(50);expect(second===before,'取消订阅未生效')});
 await check('没有打开市场时，原生页签和设置面板挂载仍通知导航',async()=>{const tabs=document.createElement('div');tabs.className='CharacterManagement_tabsComponentContainer_fixture';stage.append(tabs);await wait(50);expect(calls['market-detail']>0,'页签挂载没有刷新导航');const count=calls['market-detail'];const overlay=document.createElement('div');overlay.id='mooket_safe_overlay';stage.append(overlay);await wait(50);expect(calls['market-detail']>count,'设置面板挂载被误过滤')});
 result.textContent=(checks.some(line=>line.startsWith('FAIL'))?'FAILED':'PASS ALL')+' · '+checks.length+'\\n'+checks.join('\\n');document.getElementById('run').disabled=false;
}
document.getElementById('run').onclick=run;
</script></html>`;
createServer((request, response) => { response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); })
    .listen(0, '127.0.0.1', function () { console.log(`Document scheduling checks: http://127.0.0.1:${this.address().port}/`); });
