# dsh-model-fold

[English](#english) · [中文](#中文)

<a id="english"></a>
**ZCode-style model picker for DeepSeek Harness.** Replaces the composer's model selector with ZCode's interaction model: a provider menu that opens upward from the trigger, floating model submenus beside it, reasoning-effort selection, and full keyboard navigation — without touching any DSH source.

**English**

- Trigger shows `model · reasoning effort` and opens a provider menu **above** it (right-anchored, bottom- and right-collision aware).
- Providers open **model submenus beside the menu** (right side preferred, flips left when out of room). The first model row lines up with the hovered provider row; panels shift up just enough when the bottom would overflow. Long catalogs scroll internally.
- The provider holding the current model and the current model itself carry a ✓ — "where am I" is always visible.
- **Reasoning effort**: a menu row under the providers lists the current model's levels (from its `reasoning.efforts`); picking one re-submits the current provider/model with the new `reasoningEffort`, exactly like the stock seat.
- Keyboard: `↑`/`↓` within the active panel, `→` opens the focused row's submenu, `←`/`Esc` collapse back, `Esc` closes and restores focus.
- Typography and surfaces follow the app: 14px UI text on 32px rows, the stock menu surface (`--dsw-specific-menu` + backdrop blur), stroke chevrons.

Install (any of):

```powershell
# from npm, once published
dsh plugin --profile desktop add dsh-model-fold
# from a local checkout
dsh plugin --profile desktop add "link:<this folder>"
```

Requires DSH `>= 0.2.0-rc.1` (tested on 0.2.0-rc.2). Uninstall: `dsh plugin --profile desktop remove dsh-model-fold` — the stock selector returns automatically; DSH's install directory is never modified.

---

<a id="中文"></a>
**中文**

把 DSH composer 右下角的模型选择器换成 **ZCode composer 选择器的交互模式**，不修改任何 DSH 源码。

## 行为

- 触发器显示当前模型 + 当前推理等级（`模型名 · 等级名`，等级在 caption 弱化色里）+ 14px 小 chevron（↓）；字号、行高、系统字体栈对齐 ZCode（`--ui-font-size: 14px`、32px 行高）。
- 提供方菜单：**向上展开**、右对齐锚在触发器上方；每个有模型的提供方一行，行尾有向右的小 chevron（›）；**当前模型所属的提供方带 ✓**，"我在哪"不用展开就能看到。
- **推理等级**：菜单底部（分隔线之下）有「推理等级」行，显示当前等级；悬停/点击/`→` 开出等级子面板（Off/Low/High/Max…来自当前模型的 `reasoning.efforts`，无默认等级的模型多一项「Default」），当前等级带 ✓。选等级 = 以当前 provider/model + 新 `reasoningEffort` 重新提交，与内置座位的语义一致；选当前等级则仅关闭。模型不带 reasoning 元数据时该行不出现。
- 子面板：悬停、点击或按 `→` 打开；**优先开在菜单右侧，右侧放不下时翻到左侧**（ZCode/Radix 的碰撞翻转规则）；垂直方向按 ZCode/Radix 的放置规则——**面板第一行与所悬停的提供方行对齐**，底部放不下时整体上移到恰好贴住视口下缘，比视口还高的面板钉在顶部并内部滚动（`overscroll-behavior: contain`）。
- 键盘：`↑`/`↓` 在**当前面板**（提供方菜单或子面板）内移动焦点；`→` 打开聚焦行（提供方或推理等级）的子面板并聚焦第一行；`←`/`Esc` 收回子面板回到所在行；`Esc` 在菜单级关闭整个选择器并把焦点还给触发器。
- 选择模型后菜单关闭，触发器标签立即更新。
- 目录加载失败时菜单内显示错误与重试按钮；目录为空时显示空态。

## 实现要点

- **不修改 DSH 源码**。这是一个独立的客户端插件，通过 `conversation.input.model` 槽位接管 composer 的模型位。
- `conversation.input.model` 是 `single` 槽位，注册表按**优先级选举**一个占用者（`entriesOfSlot`，升序取第一个存活的）。内置模型选择器用默认优先级 0，本插件用 `priority: -1` 完成遮蔽 —— 这是注册表自身的遮蔽通道，不是 monkey-patch。
- 复用**同一个** `ModelDirectory` 实例（`ctx.modelDirectories.directoryFor(sessionId)`），因此只有一次目录请求、一条选择提交路径；在这里切换模型，`/model` 弹窗立刻同步，反之亦然。
- 选择仍走 `directory.select(...)`，所以推理强度默认值、pending 指示器、失败处理与内置完全一致。
- **fiber inject 声明是授权门**：座位的 inject 回调在渲染期运行（不在任何 `ctx.inject` 作用域内），服务代理把 `this` 绑定到**调用方**的 fiber —— 因此模块级必须导出 `inject = ['slots', 'sessions', 'remote', 'remote.session']`，否则 `directoryFor` 内部的 `remote.session` 访问被拒（`cannot get property "remote.session" without inject`），座位首渲染即崩、选举回落内置。内置 ModelSelect 声明了同一对服务。
- 菜单/子面板定位：打开时用 `getBoundingClientRect()` 测触发器/菜单，`useLayoutEffect` 里算出锚点（首帧绘制前完成，无闪烁）；面板表面用应用自己的 `--dsw-specific-menu` + `--dsw-menu-backdrop-filter` + `--dsw-elevation-prominent`。

## 安装

发布到 npm 后（或在 DSH 的 **插件** 面板里直接填包名）：

```powershell
dsh plugin --profile desktop add dsh-model-fold
```

本地开发安装：

```powershell
dsh plugin --profile desktop add "link:<本目录绝对路径>"
```

`package.json` 的 `dsh.profile.bundles` 会新增一行 `dsh-model-fold`。

## 卸载 / 回滚

```powershell
dsh plugin --profile desktop remove dsh-model-fold
```

移除后 `single` 槽位的选举自动回落到内置模型选择器，**无需其他清理**。因为本插件从未改动 DSH 安装目录或 asar。

## 生效方式

- **宿主插件行在 DSH 重启后生效**。
- **改 `lib/client.js` 后：重启 DSH 生效。** 迁移到 `~/.dsh/plugins/` 之后，宿主的 HMR 监视不再捕获此处的文件变化（revision 不更新、旧 body 失效 → 404 / `import failed`），热刷新通道不可用；重启是唯一可靠路径。（早期放在工作区目录时宿主能感知变化，存在"改完立刻刷新"的重建竞态；该问题随迁移一并消失。）

## 开发与自检

```powershell
node tools/verify.cjs    # 一键跑全部四套
node tools/validate.cjs  <本目录>          # 清单与 bundle 格式
node tools/discover.cjs  <profile cordis.yml> dsh-model-fold   # 复刻宿主发现流程
node tools/smoke.cjs     <本目录>          # 子菜单选择器 39 项（桩件驱动）
node tools/election.cjs                    # 对真实 slots 内核验证优先级遮蔽 15 项
```

对**运行中的 DSH**（带 `--remote-debugging-port=9222` 启动）做端到端验证：

```powershell
node tools/cdp-probe.cjs --reload --capture errors.json     # 收集启动期 Console 报错
node tools/cdp-probe.cjs --eval tools/e2e-picker.js         # 真机交互全流程
```

`tools/election.cjs` 与 `tools/smoke.cjs` 不需要浏览器：前者直接加载从 app.asar 提取的真实 `SlotCore`，后者用桩件驱动组件函数（含 ref 挂载与 layout/effect 队列的提交顺序模拟）。`tools/shots/` 是真机截图（收起态 / 菜单 / 两个子面板）。

## 已知边界

- 只影响 composer 的模型位。`/model` 命令弹窗走 `commandUi` 的 popupSelect，是**另一套渲染**，本插件不改它。
- ZCode 的视觉徽标（vision 标签等）未照搬——DSH 目录数据里没有对应字段。
- 若内置选择器未来改用不同优先级注册，遮蔽会失效（界面退回内置样式，不会报错）。
