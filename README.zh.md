# dsh-realtime-tps-pet

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的实时输出速度悬浮窗：一个可拖动的窗口，三种形态——**桌宠**（默认小肥鱼，另含月薪喵与矢量绘制的小机器人）、**环形仪表**与紧凑的**速度胶囊**。

- 流式期间实时显示 tok/s，六档速度分档配色；在校准样本到来之前数字带 `≈` 标记。
- 三种形态都显示**上轮均速**：最近一次已完成调用的精确值（适配器报告的输出 token ÷ 纯生成时长）。
- **会话未结束时不回待机**：命令或工具正在执行、没有步骤在流式时，气泡保持显示并如实写 `0.0`。
- 桌宠动画安排移植自 zcode-speed-panel：当前行动画整行播完才切换、速度档位选行、最高两档左右来回跑每遍换向；矢量小机器人走同一套动画表。
- **滚轮缩放**：鼠标悬停在窗口上滚动即可调节大小（0.6×–2×，自动记住）。
- 可拖到任意位置；右键菜单切换形态、换宠物、常显上轮均速、空闲隐藏；双击或回车循环形态；摆放与形态持久化。

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

流式期间客户端只能拿到文本增量，实时读数在锚定于最新增量的 15 秒滚动窗口上积分估算 token；每个已完成调用贡献一次报告值/估算值之比，最近 8 个样本的中位数校准估算（首个样本到来之前带 `≈`）。上轮均速是精确值——适配器自己的输出 token 除以纯生成窗口（首 token 到末 token）。

## 形态

| 形态 | 显示内容 |
|---|---|
| 桌宠 | 按速度档位播放的精灵/矢量动画；头顶**上方**的气泡显示实时 + 上轮均速（悬停展开，默认常显；会话未结束时保持显示并如实写 0） |
| 环形仪表 | **大环是实时速度**（缓动、分档变色），左上角小环显示上轮均速 |
| 胶囊 | 实时数字（空闲时回落到上轮均速、暗淡）+ 上轮均速一行 |

## 开发说明

`lib/` 为预构建产物。从源码构建在 DeepSeek Harness 单仓库内进行（客户端 bundle 格式、CSS Modules 内联与精灵图内联都来自其 `tsdown` 预设）；`src/` 附上供阅读与修补。精灵图位于 `assets/pets/`（`*.orig.webp` 为未改动的原始素材）。

宠物包素材与移植的仪表/动画行为的归属说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 许可

[MIT](LICENSE) © masterchiefm
