# 本地运行与源码说明

项目用法见根 [README](../README.md)。这份文档只讲源码交付相关的事：版本对应、离线运行、以及数据不随源码迁移的边界。

## 对应版本

- 线上地址：https://financial-sankey-studio.chuangcius.chatgpt.site
- Sites 最新保存版本：v15（发布记录状态 succeeded，2026-10-26 核验）。
- 源码提交：`7504d0c5003cb697d4b2f971fe6bc328a3d9f1a5`。
- 应用源代码、测试、构建配置与 `dist/` 与该提交保持一致；`SOURCE-PROVENANCE.json` 记录 73 个文件的 SHA-256。
- 导出仅包含代码，未修改或重新发布线上站点。

## 不安装依赖直接跑随附网页

若已有 Python 3，在解压目录执行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Windows 上 `python3` 不可用时改用 `py -m http.server 8000 --bind 127.0.0.1 --directory dist`。打开 http://127.0.0.1:8000 ，Ctrl+C 停止。

ES 模块必须经 HTTP 访问，**不要双击 HTML** 用 `file://` 打开。

## 修改源码

需要 Node.js 22+ 与 npm；安装依赖要能访问 npm 源，运行应用本身不需要任何账号、密钥或后端。构建与测试命令见根 README。

修改 `src/` 后重新 `npm run build` 再刷新。不要把 `dist/` 当作编辑入口。

## 数据边界

未包含部署平台标识配置、`.git`、`node_modules`、缓存、QA 截图与导出、账号凭据或个人浏览器存储。

既有项目数据保存在原浏览器、原网址的 localStorage 中，**不随源码迁移**。需要迁移时，先在原页面「保存项目」导出 JSON，再在本地页面打开。

## 许可

原仓库未提供独立项目 LICENSE 文件；本包不自行授予新的开源许可。构建产物中的第三方许可注释保留；`npm ci` 安装的依赖各自附带许可证。
