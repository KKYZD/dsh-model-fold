# dsh-model-fold 交接文档

> 更新于 2026-10-06（深夜）。**任务已完成并在真机验证通过。**
> 前一版「折叠式」按用户要求废弃，最终交付物是 **ZCode composer 选择器的完整交互模式**（提供方子菜单 + 向上展开 + 子面板内滚动）。
> 本工程现位于 **`C:\Users\86180\.dsh\plugins\dsh-model-fold\`**（本地插件的约定位置；曾误放在 IMMFGO-takehome 工作区，已迁出并重新 `dsh plugin add`，迁移改 link 路径后需重启 DSH）。
> 本文保留根因分析——那是整个任务最有价值的部分。

---

## 1. 最终状态

| 项 | 状态 |
|---|---|
| 需求①（删没 key 的 DeepSeek 提供商） | 维持原结论：**不真删**（见旧版 §5，子菜单模式本身消除了视觉干扰） |
| 需求②（模型选择器改造） | **完成**。ZCode 模式：提供方菜单向上展开，子面板列模型、内部滚动、当前项打 ✓ |
| 自检 | validate ✓ / discover ✓ / smoke 30/30 ✓ / election 15/15 ✓ |
| 真机验证 | CDP 驱动：几何（向上/右对齐/实底/子面板钳制）、悬停切换、键盘全链路、选择回写、Esc 层级关闭，全通过；截图见 `tools/shots/` |
| 用户模型 | 测试后已恢复为 `Deepseek-V4.1-Flash · x0.00` |

## 2. 「界面没变化」的根因（前次卡死三天的问题）

**一条 Console 报错直接定位：`slot entry crashed in 'conversation.input.model': Error: cannot get property "remote.session" without inject`**

完整机理：

1. 插件装好了、bundle 注册了、`apply` 跑了（CSS 都注入了）、`priority: -1` 也赢了选举——**全都没有问题**。
2. 渲染期渲染器裸调用座位的 `inject(sessionId)`，里面 `models.directoryFor(sessionId)`。
3. DSH/cordis 的服务代理会把方法调用的 `this` 绑定到**调用方插件的 fiber**；`directoryFor` 内部访问 `this.ctx.remote.session`，授权按**调用方 fiber 的 inject 声明**检查。
4. 旧版模块级 `inject` 只有 `['slots','modelDirectories','sessions']`，没有 `remote`/`remote.session` → 抛错 → 座位崩溃 → `reportEntryError(abdicate)` 弃权 → **选举静默回落内置座位**。于是「宿主显示运行中、界面毫无变化」。
5. 内置 ModelSelect 的模块级 `inject = ["commandUi","locale","sessions","slots","remote","remote.session"]`——照抄服务对（去掉我们用不到的 commandUi/locale）即修复。

**教训（再次验证）**：第一天就该开 DevTools。本次全程用 CDP（`--remote-debugging-port=9222` + `tools/cdp-probe.cjs`）自取 Console，没有求用户开一次 DevTools。

## 3. 第二个坑：改完 lib/client.js 后 `import failed`

宿主按 `mtimeMs`/`ctimeMs`/大小派生 revision。改源码后立刻刷新页面会出现**双向不同步**：

- 页面新图 → 请求新 rev，宿主尚未重建 → 404 / `did not activate`；
- 页面旧图 → 请求旧 rev，宿主已重建并作废旧 body → 404。

**迁移到 `~/.dsh/plugins/` 之后规则变了（2026-10-06 深夜实测）**：宿主的 HMR 监视根本不感知这里的文件变化——revision 完全不动、旧 body 逐渐失效，任何刷新都 404，反复刷新还可能把应用搞退出。**改 `lib/client.js` 后唯一可靠动作：重启 DSH。** 判断宿主当前吐的是什么：页面里 `fetch('/' + __DSH_BOOT__.entries.find(e=>e.id==='dsh-model-fold').url)` 看内容是否含特征串。

## 3.5 第三个坑：迁移目录必须重启

`dsh plugin remove/add` 改 link 路径后，运行中的宿主包元数据仍缓存旧路径（「包元数据缓存至重启」）→ 界面不更新。重启即愈。

## 4. 最终交互设计（对照 ZCode v4-toolbar 的 `WH` 组件逐项照做）

- 触发器：模型名 + 强度 + chevron（打开时翻转）。
- 菜单：`side=top` 向上、右对齐锚定（`useLayoutEffect` 里测 `getBoundingClientRect`，首帧前算好 `right/bottom/maxHeight`）；表面 `--dsw-specific-menu` + `--dsw-menu-backdrop-filter`（毛玻璃）+ `--dsw-elevation-prominent`。
- 提供方行：当前模型所在提供方带 ✓（ZCode 同款）；悬停/点击/`→` 开子面板。
- 子面板：**优先菜单右侧**，右侧放不下（<192px）翻左侧（碰撞规则）；垂直按 ZCode/Radix 规则——第一行与悬停的提供方行对齐（top = rowTop - 4 面板内边距），底部放不下按**实际内容高度**（行数×32+8，不是 max 296）上移到恰好贴住视口下缘（innerHeight-12），比视口高的钉顶内部滚动；当前项 ✓。
- **推理等级（2026-10-06 深夜补回）**：菜单底部分隔线下「推理等级」行（`menu.effort`）显示当前等级，悬停/`→` 开等级子面板；等级来自当前模型 `reasoning.efforts`（display name），无 `defaultEffort` 时多一项 `effort.providerDefault`；选择 = 当前 provider/model + 新 `reasoningEffort` 重提交（与内置 `chooseEffort` 逐字同构）；触发器 `模型名 · 等级名`；无 reasoning 元数据的模型整行隐藏。
- 键盘：↑/↓ 面板内循环（菜单级含推理等级行）；→ 开子面板并聚焦首行；←/Esc 收子面板回所在行；Esc 菜单级关闭并还焦点给触发器。
- 无搜索框（ZCode composer 版没有；它的搜索在 `/model` 命令面板里，DSH 的 `/model` 本来就有）。
- 未照搬：底部「管理模型」入口（需要未验证的设置跳转 API）、vision 徽标（DSH 目录无此字段）。

## 5. 工程结构与工具（现状）

```
dsh-model-fold/
├── package.json / cordis.patch.yml   # 未变
├── README.md                         # 已重写为 ZCode 模式说明
├── lib/
│   ├── index.js                      # 宿主半边（未变）
│   └── client.js                     # 全量重写：ZCode 式子菜单选择器
├── tools/
│   ├── verify.cjs                    # 一键四套自检 ★
│   ├── validate.cjs / discover.cjs / compose.cjs / mountcheck.cjs / asar.cjs
│   ├── smoke.cjs                     # 39 项；桩件已支持 ref 挂载 + layout/effect 提交顺序
│   ├── election.cjs                  # 15 项；加载真实 SlotCore
│   ├── cdp-probe.cjs                 # CDP 探针：--reload/--capture/--eval/--watch ★
│   ├── e2e-picker.js                 # 真机交互全流程（配 cdp-probe --eval 用）
│   └── shots/                        # 真机截图 4 张
└── .docs/                            # 上游参考（只读）；新增 cordis-client-runner.js
```

## 6. 验收记录（真机，2026-10-06）

- `open`：4 提供方、当前提供方 ✓、菜单在触发器上方且右对齐、面板实底（毛玻璃）。
- `hover WorkBuddy`：子面板 5 行、开在菜单左侧、行对齐。
- `hover Trae`：子面板 6 行、高 200px ≤ 296 钳制。
- `Escape`：子面板关、菜单留；`ArrowRight`：子面板开且焦点在首行；`↓`+选择：`Space-Bunny · x0.03` 标签回写、全部关闭；随后恢复用户原模型。
- 全新启动 Console **0 报错**（侧栏 WebSocket 报错系环境所致，与本插件无关）。

## 7. 给后来者

1. **先拿运行时证据，再动任何代码。** CDP 探针就位后，此前三天的静态推理一小时内全部结清。
2. 座位/服务代码要分清**两个 inject**：包 `dsh.client.inject`（模块加载顺序）≠ 模块级 `inject` 导出（fiber 服务授权门）≠ `ctx.inject([...])`（等待+局部授权）。
3. 改 `lib/client.js` 后的重载竞态见 §3；`/plugins/<pkg>/client.js` 直接 GET 404 不代表没加载（需要 rev/cookie）。
4. DSH 安装目录与 app.asar 全程未改；卸载依旧干净。
