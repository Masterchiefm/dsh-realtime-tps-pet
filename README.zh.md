# dsh-realtime-tps-pet

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的实时输出速度悬浮窗：一个可拖动的窗口，三种形态——**精灵动画桌宠**（默认小肥鱼）、**环形仪表**与紧凑的**速度胶囊**。

- 流式期间实时显示 tok/s，六档速度分档配色；在校准样本到来之前数字带 `≈` 标记。
- 三种形态都显示**上步均速**。这里的“步”（step）指一轮对话内的单次模型调用，因此与应用内置的**按轮（turn）**统计口径不同：本插件读的是最近一步的精确值（适配器报告的输出 token ÷ 纯生成时长）。
- 桌宠（默认小肥鱼 / 月薪喵）的动画安排移植自 zcode-speed-panel：当前行动画整行播完才切换、速度档位选行、最高两档左右来回跑每遍换向。
- 可拖到任意位置；右键菜单切换形态、换宠物、常显上步均速、空闲隐藏；双击或回车循环形态；摆放与形态持久化。

## 安装

### 方式一（推荐）—— 让 DeepSeek 帮你装

把下面这句话粘贴到 DeepSeek Harness 的工作区并发送：

> 查阅 https://github.com/masterchiefm/dsh-realtime-tps-pet 项目地址，根据里面内容安装 deepseek-harness 插件。若网络不佳，请善用用户本地的代理服务或者镜像源。

DeepSeek 会阅读本 README、核对前置条件，然后替你执行安装。

### 方式二 —— 手动安装

**界面：** 设置 → 插件 → 通过 URL / 仓库安装，填入：

```
https://github.com/masterchiefm/dsh-realtime-tps-pet
```

**命令行：**

```bash
dsh plugin install https://github.com/masterchiefm/dsh-realtime-tps-pet
```

使用命名 profile 时加 `--profile <名称>`（默认 desktop profile 无需加）。安装后重启 DSH（或刷新页面）；绑定会话后桌宠出现在主视图会话上方。

**前置条件：** DSH ≥ 0.2.0-rc.2，web（桌面）profile。不需要 API key、不依赖额外服务——插件只是会话自身流式事件的只读视图。

## 速度口径

流式期间客户端只能拿到文本增量，实时读数在锚定于最新增量的 15 秒滚动窗口上积分估算 token；每个已完成调用贡献一次报告值/估算值之比，最近 8 个样本的中位数校准估算（首个样本到来之前带 `≈`）。上步均速是精确值——适配器自己的输出 token 除以纯生成窗口（首 token 到末 token）。

## 形态

| 形态 | 显示内容 |
|---|---|
| 桌宠 | 按速度档位播放的精灵动画；头顶**上方**的气泡显示实时 + 上步均速（悬停展开，默认常显） |
| 环形仪表 | 缓动弧线按分档变色；角标小环与文字说明显示上步均速 |
| 胶囊 | 实时数字（空闲时回落到上步均速、暗淡）+ 上步均速一行 |

## 开发说明

`lib/` 为预构建产物。从源码构建在 DeepSeek Harness 单仓库内进行（客户端 bundle 格式、CSS Modules 内联与精灵图内联都来自其 `tsdown` 预设）；`src/` 附上供阅读与修补。精灵图位于 `assets/pets/`（`*.orig.webp` 为未改动的原始素材）。

宠物包素材与移植的仪表/动画行为的归属说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 许可

[MIT](LICENSE) © masterchiefm
