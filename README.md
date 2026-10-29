# 潮汐纪年社 · 守护天使名号计算器

[打开网站](https://mkwanjyusi.github.io/tidal-guardian-angel/) · [项目源码](https://github.com/mkwanjyusi/tidal-guardian-angel)

浏览器内运行的五生命点取字工具，支持出生资料自动计算和手动输入点位。提供五点计算记录、带品牌水印的 PNG 导出、打印与复制记录，适配手机与桌面。

## 本地运行

安装 Node.js 24，然后在本目录执行：

```sh
npm ci
npm run dev
```

构建与验证：

```sh
npm test
npm run build
npm run preview
```

`dist/` 是可部署的静态网站。通过 HTTP(S) 打开，直接双击 HTML 的 `file://` 方式无法载入城市、时区与星历文件。

## GitHub Pages

本项目采用 GitHub Pages 静态分支发布：`main` 保留完整源码，`gh-pages` 保留构建后的静态网站。在 Settings → Pages → Build and deployment 中选择 **Deploy from a branch**，分支选 `gh-pages`，目录选 `/ (root)`。

修改后先运行 `npm test`，提交并推送 `main`，再运行：

```sh
npm run publish:pages
```

该命令构建网站并将 `dist/` 发布到 `gh-pages`；GitHub Pages 随后自动更新。需要本机 Git 已登录并有该仓库写入权限，不需要额外的 Actions 工作流权限。

`base: './'` 与同源数据路径同时支持 `用户名.github.io/项目名/` 和独立域名。更换仓库或账号时，一并修改页面“源码与许可”中的源码仓库链接。

## 计算口径

- 回归黄道、地心视黄经；Swiss Ephemeris 2.10.03，通过本地 WebAssembly 运行。
- 使用随站发布的四份 Swiss 星历文件；检查实际星历来源，文件失效时明确报错。
- 日期范围 1800—2100 年；固定 tzdata 2026.6 / IANA 2026f，处理历史秒级偏移与夏令时重复、缺失时刻。
- 采用太阳中心的几何高度判定昼夜；朔望搜索出生前最近一次精确的新月或满月，始终取当时月亮的黄经。
- 五点按累计黄经向下取整，对 22 个希伯来字母循环取字；昼夜调整日月顺序与福点公式，添加 el 后缀，保留重复字母。

计算器用于配套课程的计算与核对。方法细节及天文核验记录见 `docs/浏览器星历核验.md`。

## 团队修改入口

- `index.html`：品牌名、顶部提示、联系方式、使用说明。
- `src/style.css`：D 版配色、排版与手机适配。
- `src/app.js`：交互与结果图片排版。
- `public/assets/tidal-watermark.png`：已确认的靛蓝透明字标。
- `src/naming.js`、`src/astrology.js`：取字规则与星历计算。
- `public/data/`：城市、固定时区及星历文件。

出生资料只在当前页面内参与计算；没有账户、资料数据库、统计脚本或外部排盘 API。页面刷新后输入清空。浏览器会从站点下载公共计算数据。

## 发布许可

网站程序按 AGPL-3.0-or-later 开源，见 `LICENSE` 与 `NOTICE`。本版 Swiss Ephemeris WebAssembly 依赖采用同一许可。第三方组件的许可证和完整星历封装源码随站点一并提供，详见 `public/licenses/`、`public/source/` 与 `docs/第三方来源.md`。
