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
浏览器交互检查使用 `pnpm test:warehouse-scroll <游戏官方 main.*.chunk.js 的本地路径>`，打开输出的本地地址，运行布局和队列交互检查。该页面提取官方物品组件，使用测试数据和操作回调，不连接游戏账号。React 开发依赖仅用于此测试页面，发布脚本复用游戏已加载的组件和渲染器。

库存空格回归检查使用 `pnpm test:warehouse-visibility <游戏官方 main.*.chunk.js 的本地路径>`，覆盖连续强化、库存排序、分区归属与恢复原生布局；加 `--baseline=HEAD` 可与已提交版本对照。

挂牌弹窗检查运行 `node scripts/test-order-modal-scope.mjs --serve`，打开输出地址后点击“运行弹窗检查”；覆盖嵌套市场、异步表单、改价、关闭重开及兑换线清理。加 `--baseline=HEAD` 可用已提交版本进行对照，测试不连接游戏账号。

交易卡片布局检查运行 `pnpm test:market-card-layout`，打开输出地址并点击检查按钮；覆盖装备与材料、买/卖列开关、长数值、浮动卡片与窗口边界。可调整浏览器宽度检查窄屏滚动。

地下城材料显示“最优兑换”时，图片与文字共用发光边框，按“临界值 ≤ 价格 / 由【接替材料】取代”提示降价后的变化，鼠标悬停可看完整说明。提示限制在挂牌弹窗内；临界值是失去最优的最高有效挂牌价，并列仍算最优，保护之镜上限不参与此临界值计算。比较依据为市场买一，其他材料没有收购报价时显示缺少报价。运行 `pnpm test:dungeon-token-guide` 检查兑换比例、并列和价格档位；加 `--serve` 可验证弹窗显示和报价更新。

## 设置导出与导入

在“设置中心”顶部的“设置迁移”中点击“导出设置”，保存 JSON 文件；在另一台设备点击“导入设置”，选择该文件并确认覆盖。导入成功后页面会自动刷新。

文件包含插件开关、工时与路线偏好、快捷按钮、收藏方案、虚拟配置和背包分区。分区按原角色恢复，文件中没有的其他角色分区保留；交易记录、行情缓存、游戏登录信息及其他插件数据不参与迁移。导入文件先经过格式与内容校验，保存失败时回滚本次改动。

运行 `pnpm test:settings-transfer` 检查跨设备覆盖、数据范围及失败回滚；加 `--serve` 可在本地浏览器验证文件下载、导入确认和布局。

## 发布到 Greasy Fork

脚本 ID 为 `570078`，现有的 `@downloadURL` 与 `@updateURL` 必须保持 Greasy Fork 地址不变。

在 Greasy Fork 脚本管理页面的“源代码同步”中配置以下地址：

```text
https://raw.githubusercontent.com/baozhi-nice/mooncake-userscript/main/dist/mooncake.user.js
```

随后在 GitHub 仓库的 Webhook 设置中，使用 Greasy Fork “Webhook 信息”页面生成的 Payload URL 和 Secret，选择 `application/json` 与 Push events。每次推送到 `main` 后，Greasy Fork 会同步新的发布文件。
