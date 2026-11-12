# Emerald Insights 工程维护指南

## 结构与入口

- `src/main.ts` 和 `src/App.vue` 负责启动及布局，`src/stores/` 管理 Komari 设置、节点和连接状态。`src/features/` 存放资源概览、成本、IPQA 等业务模块。
- `src/utils/api.ts` 和 `src/utils/rpc.ts` 负责 HTTP 与 WebSocket 通信。资源、归档和时序转换逻辑由各功能模块复用。具体代码约定见 [源码指南](../src/AGENTS.md)。
- `komari-theme.json` 定义 Komari 主题及配置，`public/images/` 提供运行期资源，`docs/preview.png` 是安装包输入。Vite 生成 `dist/` 并打包。

## 开发、测试和打包

使用 Node 24、`package.json` 指定的 Bun 1.4.4，以及 Linux/macOS 的 `unzip` 或 Windows 自带的 `tar`。

```bash
bun install --frozen-lockfile
bun run dev
bun run verify
```

`verify` 检查构建脚本、运行 Node 回归、做 Vue 类型检查并构建，再检查 ZIP 内的清单、预览和 HTML 入口引用。单独调试可运行 `bun run test`、`bun run type-check` 或 `bun run preview`。改动应用代码时，额外用 `bun x eslint <文件>` 校验相关文件。`bun run lint` 会尝试修复全库格式，已有全量 lint 问题需分批处理。

构建后运行 `bun run playwright install --only-shell chromium` 和 `bun run test:browser`。浏览器测试通过本地 Vite Preview 打开构建产物，用模拟的 Komari 接口验证原生 CPU/负载图表、Steal 图例、真实值提示和插件缺失时的降级。CI 运行同一套 Chromium 测试，失败时可从 Actions 下载追踪文件。

正式包名为 `komari-theme-emerald-insights.zip`。运行 `bun run build:beta` 生成 `komari-theme-emerald-insights-beta-<sha>.zip`，包内版本附加 Beta 后缀，仓库版本字段保持正式版本。可通过 `bun run test:package -- <zip>` 校验指定包。两个包都包含 `dist/`、`komari-theme.json` 和根目录 `preview.png`。缺少构建产物或打包写入失败时，构建会报错并保留上一份有效 ZIP。Windows 本地构建在用户桌面存在时仍复制一份。

## CI 与发布

- [工作流](../.github/workflows/release-on-version-bump.yml) 接收 `master` 推送、面向 `master` 的 PR 和手动触发。纯文档推送跳过 CI，预览图片改动属于打包输入。Bun 从 npm 注册表安装指定版本，并对暂时下载失败重试。依赖解析使用已提交的 `bun.lock`，工作流缓存包下载。
- CI 用只读权限完成验证。推送 `master` 后，工作流对比最新正式 Release，检测主题源码、清单、预览图和构建输入的改动；需要发布时自动递增补丁版本并同步清单，验证通过后创建标签和 Release，复用同次验证生成的 ZIP。纯文档、测试和 CI 改动本身不会触发新版本。PR 和手动运行可下载验证通过的安装包。
- 发布任务单独取得仓库写权限；失败时检查 Actions 日志并重跑原工作流。若标签指向其他提交，应先检查版本冲突。手动指定较高正式版本仍可使用 `bun run publish -- --version X.Y.Z`。
- 锁文件解析失败时先核对 `bun --version`，当前锁文件 v3 使用 Bun 1.4.4。安装包失败时检查 `docs/preview.png`、两个清单的版本和 `dist/index.html`，然后本地复跑 `bun run verify`。
- 用 `bun audit` 检查依赖安全。依赖覆盖仅将 `archiver-utils` 使用的 `glob` 和 TypeScript ESLint 解析器使用的 `minimatch` 指向修复版。升级各自的上游工具时复查这些覆盖与已有的 `tinypool` 补丁。

## 兼容性与回归

| 约定 | 维护要点 |
| --- | --- |
| IPQA 延迟加载与缓存 | 首屏优先返回最新快照，历史 JSON 按日期读取、同一请求合并，短期缓存避免回看时重复下载。HTTP 和 RPC 共享数据适配，区分未检测、未解锁、DNS 解锁与原生解锁。见 [历史设计](IPQA-HISTORY.md) 和 `tests/ipqa/`。 |
| 观测缺口与时间序列 | 离线或没有样本时保留缺口，只有真实失败计入丢包。负载和延迟以实际观测时间定位。流量周期使用节点重置日和时区，兼容目标月份缺少指定日期。见 `tests/utils/` 和 `tests/resource-insights/`。 |
| 请求取消 | 切换节点或时间范围时，HTTP 与 WebSocket 请求都应响应 `AbortSignal`。取消一个请求会清理该请求的等待状态，连接仍可为其他调用服务。见 [RPC 说明](../src/utils/rpc.md) 和 `tests/utils/rpc-cancellation.test.ts`。 |
| CPU Steal 接入 | 独立插件的采样区间映射到原生图表时间轴。历史桶按重叠时间加权，覆盖率不足则保留缺口。曲线可调整倍率，提示框显示原始值。见 [Steal 集成指南](CPU-STEAL.md) 和 `tests/cpu-steal/`。 |
| 插件和私有站点 | 主题通过 IPQA Alert Report 与 Availability History 的接口获取扩展数据。接口缺失时按模块降级，保持私有站点鉴权。反代配置见 [Cloudflare 指南](CLOUDFLARE-ZERO-TRUST.md)。 |

改动公共接口、清单、构建或时间序列语义时，一并更新对应回归、README 和本页。
