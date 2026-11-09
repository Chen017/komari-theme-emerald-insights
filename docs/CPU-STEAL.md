# CPU Steal Monitor 与 Emerald Insights 联动

## 架构：插件和主题可分别使用

- 插件仓库：[komari-plugin-cpu-steal-monitor](https://github.com/Chen017/komari-plugin-cpu-steal-monitor)。
- **插件独立模式**：安装插件后，服务端每两分钟从受监控的 Linux VPS 的 /proc/stat 采集 Steal，独立保存历史并提供 REST API。无需安装 Emerald Insights。
- **主题联动模式**：再安装 Emerald Insights 时，组件 `src/components/LoadChart.vue` 调用插件 `/api/plugin/cpu-steal-monitor/v1/history`，将 Steal（2 分钟均值）叠加原有 CPU/负载图表。主题不运行命令或维护额外样本账本。

## 前置条件

1. Komari Plugin Manager 中安装 CPU Steal Monitor 的有效插件 ZIP（而非 GitHub Actions 外层 Artifact ZIP）。
2. Agent 运行 Linux，且 Komari 远程命令执行能力已启用；设置 `disable_web_ssh` 会阻止远程命令采集。
3. 插件应具有 node、allowSystemRPC、allowRoutes 权限；无需修改 Komari 核心。
4. 在主题管理中安装主题 ZIP。插件与主题可以分别升级，且升级期间原生 CPU 和负载曲线必须保持可用。

## 数据与时间轴

Steal 区间：`{from: Unix毫秒, time: Unix毫秒, value: 0..100}`，表示两次累计 CPU 计数器之间 Steal 的**平均百分比**。

| 图表 | Steal 对齐方式 |
| --- | --- |
| 实时 | 在采样区间覆盖的原有时间点显示区间均值，不生成独立 X 轴 |
| 1 小时 / 6 小时 / 1 天 | 以主题原生时间网格为准，按样本与时间桶重叠时长求平均 |
| 7/30/60/90 天 | 继续以主题原生历史网格为准，按时间权重聚合；没有足够观测的时间桶保持断点 |

UI 使用 ECharts CPU 百分比左轴画 Steal，负载继续使用右轴（Load Average 不是百分比）；tooltip 清晰标注“Steal（2 分钟均值）”。不将 Steal 简单加到 CPU 或 Load 上。

**缺失 ≠ 0%**：新节点、离线、超时、重启、插件缺失、HTTP 403/404/503、超过采样覆盖区间均显示无数据；有效 0% 才是 0%。

## API 约定和故障排查

| 接口 | 使用方 |
| --- | --- |
| `GET /api/plugin/cpu-steal-monitor/v1/history?uuid=...&from=<ms>&to=<ms>` | 主题 CPU 叠加曲线、第三方历史查询 |
| `GET /api/plugin/cpu-steal-monitor/v1/summary?uuids=...&from=<ms>&to=<ms>` | 与主题无关的独立最新、均值、最大值和覆盖率查询 |
| `GET /api/plugin/cpu-steal-monitor/v1/health` | 管理员诊断 Agent 命令被禁、超时、刚开始建立计数器基线等情况 |

如果前台 20 分钟仍是 `Steal -%`，**不要继续盲等**：

1. 先查插件状态和 `/v1/health` 的节点 status。`warming_up` 表示第一轮成功且没有可以相减的前一次计数器，`remote_command_failed` 通常是 Agent 无权限，`timeout` 表示采集任务未及时结束。
2. 查看 `/v1/history?uuid=真实节点UUID` 的 samples 是否非空（从浏览器发起、同源且登录状态一致）。
3. 插件已有样本但主题不显示时，检查浏览器 Network 是否是 403/404、节点 UUID 是否匹配、采样时间戳是否属于当前图表范围。
4. 管理员可以直接使用 `/v1/summary` 获取与主题无关的 Steal 数据；主题 PR 缺失不影响插件 API。

## 回归检查

- API 断网、缺插件、无权限时保留原有 CPU/负载图，不在 tooltip 产生 NaN%。
- 同一个样本在实时和历史模式的显示点不应跨越实际测量区间；主题视图切换不能混入前一个节点的样本。
- 图表 CPU 和 Steal 共用 0–100% 左轴，负载保留独立右轴。
- PR 运行 Node 测试、Vue 类型检查、构建及 ESLint，上传可安装主题 ZIP Artifact；**不发 Release**。
