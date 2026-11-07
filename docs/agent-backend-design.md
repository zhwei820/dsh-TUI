# 多后端架构

[文档索引](README.md) · [架构与限制](architecture.md)

dsh-TUI 的会话跑在后端中立的 Agent Domain 之上：内置后端只有 DeepSeek Harness（默认，
下称 DSH），第三方后端可按公开声明面以 bundle 形式装配进来（见「接入新后端」）。所有后端
共用同一套 Channel、投影器与界面；后端差异只体现在翻译器和会话能力上。本文说明分层、
身份映射、后端实现与回归边界。

## 分层

```text
src/screens · src/components · src/ink          界面：只读 ChannelUi，不碰任何后端
        │ ChannelUi（src/adapter/ports/channel-ui.ts）
src/dsh-adapter/channel.ts                      Channel 入口
  ├ channel/core/        后端中立核心：每个会话都走它
  ├ src/channel/         共享投影器（AgentEvent → ChannelState）与中立 store
  └ channel/extensions.ts  DSH 扩展：只在会话带 native.dsh 时挂载
        │ AgentSession · AgentEvent · SessionCapabilities
src/agent/                                      Agent Domain：纯类型 + 小工具函数，无 I/O
        │
  ┌─────┴─────────────────────┐
src/dsh-adapter/backend/      第三方后端 bundle
DSH 翻译器与会话               翻译器、会话、能力（按公开面实现）
  │                             │
@deepseek-ai/*（Cordis 服务）  各自的厂商 SDK / 原生进程
```

依赖方向：界面 → ports；channel → agent + ports + 宿主服务；后端 → agent + 各自厂商
SDK/原生进程；agent 读取 ports 类型并使用中立 helper。目录与 import 规则由 `verify:boundary` 强制，规则表见
[ADAPTER.md](../ADAPTER.md)。

一个进程只跑一个后端，在启动时决定（`dsh-tui --backend`、配置行 `backend`、
`/kernel` 记住的选择）。`/kernel` 切换后端的方式是记住选择并重启进程。

## Agent Domain（`src/agent/`）

- `events.ts`：`AgentEvent` 联合类型，live 流与历史回放共用同一套词汇。覆盖会话
  （ready/title/color/reset/status）、回合与步、用户消息、待发队列、助手流
  （attempt/delta/message）、工具（call/result/progress，以及运行中的实时输出 output：
  投影器在运行中的卡片上保留有界尾部，结果到达即清除）、审批与提问、子代理与后台
  任务、压缩、上下文、只记账的 `usage`、模型/effort/模式变化、命令列表、目标与 DSH 专有事实（preset、
  system prompt、request header）、提示与限流，以及给插件渲染器的 `custom`。后端
  不支持的东西就不发事件，不发假事件。
- `session.ts`：`AgentSession` 句柄：`history()`（回放种子）、`subscribe()`、
  `submit(input, placement)`、`cancel(cause)`、`dispose()`。`placement` 有四种：
  `turn`（空闲时开回合）、`steer`（并入运行中的回合）、`followup`（回合结束后再跑）、
  `now`（打断并立即投递）。取消回执带 `outcome`：只有 `confirmed` 的 `stillQueued`
  才代表后端的真实队列；`unknown`/`failed` 给的是请求时的快照，Channel 不能据此认定
  队列已空。
- `capabilities.ts`：`SessionCapabilities`，每项都是可选的类型化对象（permissions、
  questions、models、effort、modes、compact、rewind、fork、subagents、tasks、
  transcript、mcp、sideQuery、rename、color、images、commands、context、account、
  auth、goals、init…）。缺席即不支持：Channel 对应的动作明确报 "当前后端不支持"，
  不做静默 no-op。
- `native.dsh`：只供 DSH specialist 使用的逃生舱，暴露 DSH 的 `agent`/`ctx`；
  只能在 `src/dsh-adapter/` 内读（`verify:boundary` 检查）。
- `backend.ts`、`refs.ts`、`presentation.ts`：后端注册契约、跨后端的会话标识
  `{backendId, sessionId}`、工具卡形态的中立描述（界面按 `presentation` 选卡片，
  不按工具名）。

身份字段在 DSH 后端上的含义（新后端按同样的语义映射自己的原生标识；没有持久 seq 的后端
用翻译器单调计数，回放与 live 连续）：

| 字段 | DSH |
| --- | --- |
| `seq` | 会话日志的 seq（持久） |
| `anchor` | `String(seq)` |
| `turn` / `step` | 原生 |
| `attemptId` | 流帧的 `attemptId` |
| `callId` | `tool/call.callId` |
| `parentCallId` | 无（子代理另有事件） |
| `agentId` | 子 Agent 的会话 id |

## Channel：核心加 DSH 扩展

`createChannel` 在一个 owner 事务里做三件事：`createCoreChannel` 建核心 →
会话带 `native.dsh` 时 `attachDshExtensions` → `start`。任何一步抛错都整体回滚
（`verify-channel-rollback`）。

- 核心（`src/dsh-adapter/channel/core/`）对所有会话一样：绑定、输入管线（FIFO、
  `@` 提及、图片、IDE 选区、`tui/input` 决策）、共享投影器与唯一的 transcript 写入
  路径、宿主接缝、git 分支、`/clear`、`!cmd`、`/new`、`/export`、`/doctor`，以及
  按会话能力委托的动作。非 DSH 会话的 `/resume`、`/fork`、双击 Esc 回退由
  `core/sessions.ts` 基于后端的离线会话目录与 `fork`/`rewind` 能力提供。
- 动作按层解析（`core/actions.ts`）：明确不可用 → 会话能力（每次调用时在当前绑定的
  会话上重新解析）→ 核心动作 → 扩展动作。
- DSH 扩展（`channel/extensions.ts`）只做接线，DSH specialist 内部不变：同步种子
  回放、子代理与任务投影、resume/agent view/rewind/fork、模型/preset/模式、recap、
  DSH 报告。

新增后端不需要写 channel 代码。

## 数据来源

| 事实 | 来源 | TUI 自己存什么 |
| --- | --- | --- |
| DSH 会话 | DSH 会话事件日志 | `~/.dsh-tui` 下既有的偏好与元数据 |
| 其他后端的会话 | 后端自己的原生存储，经其 API 访问 | `~/.dsh-tui/backends/<id>/`（`BackendHost.dataDir`）下的偏好与缓存；不另存转录 |
| 回放 | DSH：全量日志；其他后端：各自的原生历史 API | 无 |
| 权限状态 | 后端（DSH：permission presets） | 无 |
| 用量/费用 | 后端上报优先，DSH 为本地估算 | 无 |
| 后端选择 | `--backend` / 配置行 / `/kernel` 记忆 | `~/.dsh-tui/kernel.json` |

用户消息不在提交时乐观插入，等后端确认（DSH：日志事件）后才落行。

## DSH 后端

`src/dsh-adapter/backend/translate.ts` 把 DSH 会话事件与流帧翻成 `AgentEvent`，
`backend/session.ts` 把 `Agent` 包成 `AgentSession`。拆分是纯重构：
`verify:projection-golden` 用录制的 DSH 日志（`scripts/fixtures/dsh/`）对比拆分前后的
投影结果，`verify-dsh-translate` 覆盖每类事件。唯一登记的有意差异：运行中已被窗口
上限折叠的工具卡收到结果时，只更新状态和预览，不再挂回完整结果。

## 接入新后端

`Backend` 是 `tui.dsh/v1alpha1` 的第三个贡献族（继设置区块、全屏场景之后），当前状态是
**`alpha`、不承诺**：类型面、definition、contract profile、conformance、**准入链路**
（清单 → registry → descriptor，W-2）与**装配链路**（装 → 重启 → 进 kernel picker，D-1）
都已接线。接入一个后端 = 按公开面写一份声明 + 实现 `AgentBackend` 与 `AgentSession`；
**协议不依赖任何单个后端的特殊性**：
SDK peer 形态（带安装配方）与系统 CLI 形态（带进程池）必须都能用同一份声明面表达，
两者的差异只落在 `install?`、`unloadExport?` 这类字段上——conformance 的两个正例
（`valid-backend-contribution.json` 与 `valid-backend-contribution-cli.json`）与常驻假后端
夹具钉的就是这条。仓内的 `manifest.ts` 是这份声明的
**超集**，私有项不投影出去。完整口径见
[tui-profile 说明 0009](../tui-profile/notes/0009-backend-contribution.md)，其中
「Public surface（α）」一节是**承诺 / 不承诺清单**（导出面只增不删、破坏性变更怎么被发现），
「Assembled (D-1)」一节是第三方 bundle 被装配进 picker 的逐条规则。

1. 写 `src/backends/<id>/manifest.ts`——它投影出的**公开声明**（`tui.dsh/v1alpha1#Backend`）
   字段是 `id`、`label`（**只收字面量**，宿主 i18n 键进不来）、`shortLabel`、`product?`、`capabilities`、`grants`、`install?`、
   `unloadExport?`、`confirmation?`。形状由 `validateBackendSpec()`
   （`tui-profile/protocols/tui-contributions.js`，经 `src/adapter/spec/tui-contributions.ts`
   再导出）判定，"这个宿主能不能兑现"由 `backendAdmission()` 判定：未知的能力名或权限名
   **降级不拒绝**（记为待决项），已知权限名而没有授权则注册但不进 picker，声明宿主保留的
   `id`（`BACKEND_RESERVED_IDS`）在准入处被拒。仓内 manifest 是公开声明的超集：
   `inTree`、`alwaysAvailable`、`nativeKey`、`vendorPackages`、`backendExport` 与
   `label.kind === 'key'` 是私有项，`backendContributionOf()` 是唯一投影方向，门禁断言
   投影不泄漏私有键且结果过 validator。
2. **后端是孤岛**：只从自己目录、`src/agent/`（你实现的领域，含它为公开面再导出的视图类型）与
   `src/backends/shared/`（中立接缝：原子写、JSONL、图片探测、`LocalizedText`）
   取值，外加 node 内建与自己在 manifest 里声明的厂商包。宿主内部一律不可读——宿主字典
   （`src/i18n.ts`）、`src/utils/`、`src/channel/`、`src/dsh-adapter/`——`import type` 也算；
   `verify-adapter-boundary.ts` 钉住这条（存量违例在 allowlist 的 `backendEntries`）。
   厂商包只在这里 import。构建期索引（`scripts/gen-backend-index.mjs`，挂在 `compile` 上）
   会把它纳入注册表，门禁的厂商包与 `native.<id>` 规则也由它派生：**不要手改**
   `kernelPrefs.ts` 与 `backends.ts`（目录与身份回归都按 ID 取项，新增目录不必同步它们）；
   声明了非空 `vendorPackages` 或 `nativeKey` 时，`verify-adapter-boundary.ts` 的
   `EXPECTED_*` 快照要与 `ADAPTER.md` 一并更新（派生结果逐字比对，门禁报错会写明——不声明
   这两项的后端无需改动）；`install` 是**声明式配方**（`{ executor, specifier, version }`，
   宿主侧执行器表在 `src/dsh-adapter/install/`，首版只有 `pnpm-profile-add`）：注册表查表
   派生"这个条目可不可装"，选择器那行"未安装·按 Enter 安装"由此而来，装的是**你声明的**
   specifier；没有包可装的后端（驱动系统 CLI 的那类）就不声明，那是一条一等公民的
   降级路径（落检测自己的 hint，不长假按钮）；把 `pnpm compile` 重新生成的
   `src/dsh-adapter/backends.generated.ts` 一起提交（它是入库的生成产物，过期会被
   `verify-backend-registry` 判红）。字段语义与六条边界（id 语法、`nativeKey` 缺省的含义、
   公开子集与私有项、`unloadExport` 只管进程级资源池、`install` 的执行器查表、恢复语义）见
   [ADAPTER.md](../ADAPTER.md) 的「后端 manifest」一节。
3. 实现 `AgentBackend`（检测、`open`、可选的离线会话目录）与 `AgentSession`。注册时交出的
   handler 对象由 `assertBackendHandler()` 断言形状（`src/adapter/spec/tui-contributions.ts`
   再导出）。
4. 写翻译器：把后端消息翻成 `AgentEvent`，live 与回放用同一套映射；不认识的消息
   忽略，不崩。
5. 按后端真实支持的东西声明 `SessionCapabilities`；没有的就不声明，界面会显示不可用。
   同一份清单也是声明里的 `capabilities` 字段：它必须覆盖运行期
   `AgentSession.capabilities` 实际返回的键集，而宿主不认识的名字降级不拒绝（见第 1 条）。
6. 工具卡经 `presentation` 描述，不在界面里按工具名分支。
7. 子代理转录页按 [dsh-child-transcript.md](dsh-child-transcript.md) 的清单实现
   `history`。
8. 宿主服务按 **feature-detect** 取，不是 grants：后端真正需要的东西（起子进程、读自己的
   prefs、联网）不在宿主权限词表里。`BackendHost` 上与存储和文案有关的三项是：
   `dataDir`（**可选**，`~/.dsh-tui/backends/<id>`，你自己的 prefs 与缓存写这里；缺席即
   这次进程不落盘，**不要**自己拼一条宿主数据目录下的路径）、`locale()`（当前界面语言，
   实时读：`/lang` 切换对下一条字符串生效）、`appVersion?`（跑着的 TUI 版本）；`tokenStore`、
   `stderr` 同样是可选成员——缺席即自己降级，不要假设它一定在。
   `launch.sessionPrefs(host)` 拿到的也是这个 host（启动器在会话打开之前就要问上次会话）。
   收口分两层：会话级资源归 `session.dispose()`，`unloadExport` 只用于模块级/进程级资源池，
   且宿主只对真的加载过的条目记账并调用。
9. **文案是后端自己的**（插件读不到宿主字典，也不该借宿主 i18n 键冒充首方文案）：把字符串
   放在自己目录里，按 `host.locale()` 选 `zh`/`en`。两条规则（`{{name}}` 占位、`count`
   复数）在 `src/backends/shared/localized-text.ts`，字典在你这边；`scripts/verify-i18n.ts`
   会把你登记的字典按宿主字典同样的规则查（双语齐全、占位符一致、单花括号打回）。
10. 恢复只走自己的 `lastSession()`：启动恢复只针对所选后端，恢复目标绑定后端身份，裸
    `--resume` 只查该后端自己的 `lastSession`；后端不可用、没有上次会话、指定会话不存在
    一律明确报错并**非零退出**，不回落、不恢复别的后端的上次会话、不自动新建。
11. 回归用假 SDK/假进程驱动，翻译器用脱敏 fixture 测；登记进 `scripts/run-ci-group.mjs`。
12. **驱动系统 CLI 的后端**走另一条一等公民路径：**不声明** `install`
    ——声明了等于长出一个装不出任何东西的按钮——改为在 `detect()` 里报告 `installed` /
    `version` 与"缺什么、怎么补"的 hint；进程池照旧用 `unloadExport` 登记给注册表。
    这条形态与 SDK peer 形态由 conformance 的两个正例对照钉住（见上），宿主侧
    由 `scripts/fixtures/probe-backend/` 的两种安装面夹具与
    `scripts/verify-backend-contribution.ts` 的执行体覆盖。

### 第三方后端 bundle（不在本仓的作者）

上面 1–12 条讲的是**仓内**后端（目录进 `src/backends/`、由构建期索引收进注册表）。本仓之外的
作者走的是**装链路**，形态不同、要求更少：

1. 包根一份 `dsh-plugin.json`，`contributes['x-dsh-tui']` 里放一个 `kind: 'Backend'` 条目
   （形状同上第 1 条），`name` 是这个贡献的本地名。
2. `package.json` 声明 `dsh.bundle`（哪怕没有要 patch 的行）——否则它只会作为普通依赖装进
   profile，不会成为一层，也就不会被装配。
3. 包入口导出 handler：**默认导出名就是 `backend`**（`backendExport` 是 in-tree 私有项，声明里
   命名不了别的导出），`spec.unloadExport` 从同一个模块命名空间取。每个 bundle 只声明一个
   后端；多个声明会被拒绝，handler 的 `id` 也必须与 `spec.id` 一致，不能借用其他后端的数据目录。
4. 启动时宿主扫 profile 的 `dsh.profile.bundles`，按 Loader 自己的 resolver 解析入口、从**最近的
   包根**读清单，校验 + 准入后注册；**模块只在真的选中该后端时才 import**。所以声明要过
   `validateBackendSpec()`（未知字段一律拒），保留 id（`BACKEND_RESERVED_IDS`）在准入处被拒。
5. 承诺是**装 → 重启 → 出现在 picker 里**；装了不重启不算。判不了的清单/入口不会静默消失——
   宿主给一行归属到该 bundle 的告警，其余 bundle 照常装配。
   清单须过规范投影（含贡献身份唯一性）；等待授权的条目只注册身份，不参与探测，也不能显式启动。

可照抄的实例：[`scripts/fixtures/third-party-backend/`](../scripts/fixtures/third-party-backend/README.md)
（按公开面写的 bundle：声明 + 实现 + 池钩子，不发布），执行体是
`scripts/verify-backend-assembly.ts`（把它装进一次性 profile 跑完整装配链）。上面 1–12 条里与
装配无关的事项——`AgentBackend`/`AgentSession` 的实现、翻译器、能力声明、文案、恢复语义——
对包外作者同样成立，只是执法者是**你自己**的仓库（孤岛规则那类宿主侧门禁只覆盖仓内后端）。

## 验证

| 范围 | 脚本 |
| --- | --- |
| 边界与领域 | `verify:boundary`、`verify:agent-domain`（共享投影器与各翻译器对事件联合类型穷举） |
| DSH 等价性 | `verify:projection-golden`、`verify-dsh-translate` |
| Channel | `verify-backend-channel`、`verify-backend-chat`、`verify-channel-composition`、`verify-channel-rollback`、`verify-permission-store`、`verify-approval-panel-options` |
| 后端贡献 | `verify-backend-registry`、`verify-backend-contribution`、`verify-backend-assembly`（第三方 bundle 装配链） |
| 中立增量 | `verify-usage-event`、`verify-init-capability`、`verify-agent-event-invariants`；`verify-backend-logout` 验证仅清 OAuth 存储，`verify-session-archive` 对照归档/普通删除文案；保留 DSH 黄金投影 |
