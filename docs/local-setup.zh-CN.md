# 本地运行与源码说明

[English](local-setup.md) · **简体中文**

项目用法见根 [README](../README.md)。这份文档讲源码交付相关的事：离线运行、以及数据不随源码迁移的边界。

## 版本

版本以 `package.json` 与 git 标签为准。`dist/` 是构建产物、不入版本库；`npm run build` 会重新生成，构建本身可复现。

## 不安装依赖直接跑随附网页

若已有 Python 3，在解压目录执行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Windows 上 `python3` 不可用时改用 `py -m http.server 8000 --bind 127.0.0.1 --directory dist`。打开 http://127.0.0.1:8000 ，Ctrl+C 停止。

ES 模块必须经 HTTP 访问，**不要双击 HTML** 用 `file://` 打开。

## 修改源码

需要 Node.js 24.x（完整支持范围见 `package.json` 的 `engines`） 与 npm；安装依赖要能访问 npm 源，运行应用本身不需要任何账号、密钥或后端。构建与测试命令见根 README。

修改 `src/` 后重新 `npm run build` 再刷新。不要把 `dist/` 当作编辑入口。

## 数据边界

未包含部署平台标识配置、`.git`、`node_modules`、缓存、QA 截图与导出、账号凭据或个人浏览器存储。

既有项目数据保存在原浏览器、原网址的 localStorage 中，**不随源码迁移**。需要迁移时，先在原页面「保存项目」导出 JSON，再在本地页面打开。

## 许可

MIT，见 [LICENSE](../LICENSE)，覆盖本仓库的代码。构建产物中的第三方许可注释保留；`npm ci` 安装的依赖各自附带许可证。

开发源码时，运行 `npm run dev` 并打开 http://127.0.0.1:4183。提交评审前运行 `npm run check`；生产预览使用 `npm run build` 后的 `npm run preview`。不要直接修改 `dist/`。

## 依赖审计记录

2026-10-30 的 `npm audit` 报告了 ExcelJS → uuid 依赖链上的两项中危告警（[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)）。公告涉及 UUID 的 v3/v5/v6 方法及调用方提供的输出缓冲区；当前安装的 ExcelJS 源码调用 v4，且未传入缓冲区。这一检查缩小了告警对当前应用的适用范围，不代表依赖本身不存在问题。告警保留，待上游提供兼容修复后更新；未强制降级 ExcelJS，也未覆盖其声明范围外的依赖版本。
