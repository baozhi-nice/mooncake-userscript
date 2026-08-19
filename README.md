# 学学中秋月饼

用于 Milky Way Idle 的 Tampermonkey 用户脚本。公开发布文件是 `dist/mooncake.user.js`；Greasy Fork 从该文件同步版本。

## 本地开发

1. 安装 Node.js 20 或更新版本。
2. 运行 `corepack pnpm install`。
3. 修改 `src/mooncake.js`，并在 `src/header.js` 中递增 `@version`。
4. 运行 `pnpm build`，生成 `dist/mooncake.user.js`。
5. 运行 `pnpm check`，确认已提交的发布文件与源码一致。

`dist/mooncake.user.js` 必须提交到 `main`。其大小会在构建时校验，避免超过 Greasy Fork 的 2 MiB 发布上限。

## 发布到 Greasy Fork

脚本 ID 为 `570078`，现有的 `@downloadURL` 与 `@updateURL` 必须保持 Greasy Fork 地址不变。

在 Greasy Fork 脚本管理页面的“源代码同步”中配置以下地址：

```text
https://raw.githubusercontent.com/baozhi-nice/mooncake-userscript/main/dist/mooncake.user.js
```

随后在 GitHub 仓库的 Webhook 设置中，使用 Greasy Fork “Webhook 信息”页面生成的 Payload URL 和 Secret，选择 `application/json` 与 Push events。每次推送到 `main` 后，Greasy Fork 会同步新的发布文件。
