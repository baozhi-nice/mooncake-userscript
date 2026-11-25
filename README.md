# 学学中秋月饼

用于 Milky Way Idle 的 Tampermonkey 用户脚本。公开发布文件是 `dist/mooncake.user.js`；Greasy Fork 从该文件同步版本。

## 本地开发

1. 安装 Node.js 20 或更新版本。
2. 运行 `corepack pnpm install`。
3. 修改 `src/mooncake.js`，并在 `src/header.js` 中递增 `@version`。
4. 运行 `pnpm build`，生成 `dist/mooncake.user.js`。
5. 运行 `pnpm check`，确认已提交的发布文件与源码一致。

`dist/mooncake.user.js` 必须提交到 `main`。其大小会在构建时校验，避免超过 Greasy Fork 的 2 MiB 发布上限。

背包相关检查可运行 `pnpm test:warehouse-native-queue`、`pnpm test:warehouse-queue`、`pnpm test:warehouse-tabs`、`pnpm test:warehouse-performance` 和 `pnpm test:warehouse-relayout`。
性能调度检查运行 `pnpm test:performance-scheduling`：验证相同强化参数的并发预热共享、部分重叠任务、超时和 Worker 失败后的回退，以及计算数值不变；同时检查挂牌页面变化的合并判断、隐藏时暂停显示任务和恢复时使用最新数据。后台 WebSocket、交易记录与行情缓存继续更新。
强化概率缓存检查运行 `pnpm test:enhancement-cache`：使用与用户脚本相同版本的 mathjs，对照 1.6.259 的普通／精确等级和起始等级计算，并以解析公式验证修正后的精确 +1 标量情形。验证总技能变化及速度变化复用概率结果、有效概率参数隔离、完整重置和缓存容量。角色参数或虚拟配置变化仍刷新耗时、成本和路线；客户端静态数据替换保留完整清理。
固定数据计算基线运行 `pnpm benchmark:enhancement-cache --baseline=4f73d9a`；可用 `--output=<JSON 路径>` 保存三轮对照结果。它统计实际矩阵求解与总技能读取次数，并比较所有数值；测量不包含游戏 DOM、网络或真实 Worker 调度，耗时只能用于该计算场景，不能当作整页 CPU 或帧率改善比例。mathjs 仅作为开发测试依赖，发布脚本继续使用现有 `@require`。

行情依赖检查运行 `pnpm test:market-pricing-dependencies`，对照已发布版本完整失效后的计算结果，覆盖三种路线目标、递归制作、备用保护材料、镜子、精炼、缺报价恢复、缓存回收和扣扣目标筛选。单物品行情只失效依赖该报价的成本与路线；未建立完整依赖时保守刷新，公开行情整体替换和配置变化仍完整刷新。连续局部刷新合并影响物品，订单时长继续独立刷新。依赖记录限 256 个，路线和成本缓存保留各自容量上限。

行情固定样本对照运行 `pnpm benchmark:market-pricing --baseline=4f73d9a --output=<JSON 路径>`，记录 12 次报价更新下的候选重建、路线选择、配方计算和三轮耗时中位数；该结果不包含实际游戏渲染。挂牌、汇总、时长与嵌套弹窗的 `--serve` 页面另测局部刷新、后到更新、完整刷新优先和未知依赖回退；检查等待实际渲染帧后断言 DOM，适用于后台浏览器页签。

角色增量检查运行 `pnpm test:character-state`；固定状态样本对照运行 `pnpm benchmark:character-state --output=<JSON 路径>`，可加 `--baseline-file=<源码文件>` 比较分批检查点。完整消息直接维护技能、装备、库存和行动状态；经验和普通库存变化复用强化计算签名。初始化、缺失字段、周期校验及角色恢复保留全量读取，旧角色或没有角色标识的原生快照不能覆盖当前消息流。快照跳过相同内容，经验快照合并到两秒内写入，离开页面时补存。

页面分派检查运行 `pnpm test:document-scheduling --serve`。共享观察器复用同批 DOM 变化的分类，市场模块在批内共享根节点发现；直接用户操作和后续帧重新读取当前 DOM。未知模块保留原通知，导航、设置面板、嵌套市场及移除事件仍通知相关入口。仓库和保护助手继续保留必要的局部兼容判断。

冷计算检查运行 `pnpm test:probability-queue` 和 `pnpm test:probability-consumers`，验证共享任务、交互优先、公平处理历史任务、非零起始等级、Worker 错误回退、缓存回收及旧界面结果丢弃。Worker 每批最多八个任务；不可用时每轮最多一次主线程求解。隐藏页面暂停尚未分派的任务。聊天、掉落、合并分析、挂牌弹窗和强化参考等待预热后读取最新上下文；简单 +12 挂牌准备十一项普通任务。精确 +1 的 mathjs 标量行按数组归一化，保持既有精确模型并修复旧近似回退。

真实浏览器计算对照运行 `pnpm test:probability-browser`，比较相同数据的同步参考、真实 Worker 和不可用回退，并核对数值。它展示主线程求解、≥50ms 长任务和定时器间隔；回退延长总等待以分散工作，这些固定样本指标不代表整页游戏 CPU 或帧率。
浏览器交互检查使用 `pnpm test:warehouse-scroll <游戏官方 main.*.chunk.js 的本地路径>`，打开输出的本地地址，运行布局和队列交互检查。该页面提取官方物品组件，使用测试数据和操作回调，不连接游戏账号。React 开发依赖仅用于此测试页面，发布脚本复用游戏已加载的组件和渲染器。

库存空格回归检查使用 `pnpm test:warehouse-visibility <游戏官方 main.*.chunk.js 的本地路径>`，覆盖连续强化、库存排序、分区归属与恢复原生布局；加 `--baseline=HEAD` 可与已提交版本对照。

库存整页空白回归检查使用 `pnpm test:inventory-tab-isolation`，在输出的本地地址运行页面切换和挂载等待检查；覆盖“包子”与库存、装备、技能的往返切换，以及内部分类页签的状态保留。加 `--baseline=HEAD` 可复现旧版误隐藏嵌套面板的问题。

挂牌弹窗检查运行 `node scripts/test-order-modal-scope.mjs --serve`，打开输出地址后点击“运行弹窗检查”；覆盖嵌套市场、异步表单、改价、关闭重开，以及材料弹窗延迟显示、复用、图标更新和行情到达时的最优兑换提示。检查使用正式兑换计算与提示代码，同时验证隐藏或关闭时清理、无重复更新和不提交挂牌。加 `--baseline=HEAD` 可用已提交版本进行对照，测试不连接游戏账号。

交易卡片布局检查运行 `pnpm test:market-card-layout`，打开输出地址并点击检查按钮；覆盖装备与材料、买/卖列开关、长数值、浮动卡片与窗口边界。可调整浏览器宽度检查窄屏滚动。

材料的“5d 时均量”按行情最新采样所覆盖的连续 120 个小时计算，提示中显示数据截止时间；最新一小时延迟不会清空上一段完整统计。真正缺失的小时或无效成交量仍显示数据不足，并列出已覆盖小时数。旧算法缓存会失效，数据不完整时的缓存有效期缩短为 30 秒。运行 `pnpm test:market-volume-rate` 验证计算与缓存；可加 `--live --item=/items/kraken_fang` 核对克拉肯之牙的公开行情。

挂单时长恢复检查运行 `pnpm test:market-listing-age --serve`，在输出地址点击检查按钮；覆盖整块市场挂载、隐藏面板切换、弹出市场优先、物品/等级复用、缺数据占位、窄屏、开关与观察器回收。使用正式刷新和列渲染代码及固定测试挂单，不连接游戏账号；加 `--baseline=HEAD` 可与已提交版本对照。

地下城材料显示“最优兑换”时，图片与文字共用发光边框，按“临界值 ≤ 价格 / 由【接替材料】取代”提示降价后的变化，鼠标悬停可看完整说明。提示限制在挂牌弹窗内；临界值是失去最优的最高有效挂牌价，并列仍算最优，保护之镜上限不参与此临界值计算。比较依据为市场买一，其他材料没有收购报价时显示缺少报价。运行 `pnpm test:dungeon-token-guide` 检查兑换比例、并列和价格档位；加 `--serve` 可验证弹窗显示和报价更新。

## 设置导出与导入

在“设置中心”顶部的“设置迁移”中点击“导出设置”，保存 JSON 文件；在另一台设备点击“导入设置”，选择该文件并确认覆盖。导入成功后页面会自动刷新。

文件包含插件开关、工时与路线偏好、快捷按钮、收藏方案、虚拟配置和背包分区。分区按原角色恢复，文件中没有的其他角色分区保留；交易记录、行情缓存、游戏登录信息及其他插件数据不参与迁移。导入文件先经过格式与内容校验，保存失败时回滚本次改动。

运行 `pnpm test:settings-transfer` 检查跨设备覆盖、数据范围及失败回滚；加 `--serve` 可在本地浏览器验证文件下载、导入确认和布局。

设置中心布局检查运行 `pnpm test:settings-layout --serve`，在本地页面调整手机、平板与桌面宽度，检查开关、快捷等级输入框、下拉选择和工时分档的边界与操作。页面复用正式样式和控件，只使用测试数据，不连接游戏账号。

## 发布到 Greasy Fork

脚本 ID 为 `570078`，现有的 `@downloadURL` 与 `@updateURL` 必须保持 Greasy Fork 地址不变。

在 Greasy Fork 脚本管理页面的“源代码同步”中配置以下地址：

```text
https://raw.githubusercontent.com/baozhi-nice/mooncake-userscript/main/dist/mooncake.user.js
```

随后在 GitHub 仓库的 Webhook 设置中，使用 Greasy Fork “Webhook 信息”页面生成的 Payload URL 和 Secret，选择 `application/json` 与 Push events。每次推送到 `main` 后，Greasy Fork 会同步新的发布文件。
