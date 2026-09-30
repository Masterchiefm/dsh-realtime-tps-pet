# dsh-realtime-tps-pet

A live output-speed floating window for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH): one draggable overlay in three forms — an **animated sprite pet**, a **ring gauge**, and a compact speed **capsule**.

- Live tok/s while the followed session streams, in six speed-band colors; `≈` marks the figure until a settled call has calibrated it.
- **Last round's average speed** on every form (exact: adapter-reported output tokens ÷ pure decode time).
- The pet packs (whale maid / cat) follow the animation schedule ported from zcode-speed-panel: rows finish before any switch, speed bands pick the row, the top band trots sideways and turns each pass.
- Drag anywhere, right-click for the menu (form, pet pack, always-show-last-average, hide-while-idle); double-click or Enter cycles forms; placement and form persist.

## Install

### Method 1 — let DeepSeek install it (recommended)

Paste this sentence into a DeepSeek Harness workspace and send it:

> 查阅 https://github.com/masterchiefm/dsh-realtime-tps-pet 项目地址，根据里面内容安装 deepseek-harness 插件。若网络不佳，请善用用户本地的代理服务或者镜像源。

DeepSeek reads this README, verifies the prerequisites, and runs the install for you.

### Method 2 — manual install

**Via the UI:** Settings → Plugins → install from URL / repository, and enter:

```
https://github.com/masterchiefm/dsh-realtime-tps-pet
```

**Via the CLI:**

```bash
dsh plugin install https://github.com/masterchiefm/dsh-realtime-tps-pet
```

Add `--profile <name>` if you use a named profile (the default desktop profile needs no flag). Restart DSH (or refresh the page) after installing; the pet appears over the main-view conversation once a session is bound.

**Prerequisites:** DSH ≥ 0.2.0-rc.2 with the web (desktop) profile. No API keys, no extra services — the plugin is a read-only view over the session's own streaming events.

## How it reads speed

While a step streams, the client only receives text deltas, so the live figure counts estimated tokens over a rolling 15 s window anchored on the newest delta. Every settled call contributes its reported-over-estimated ratio; the median of the last 8 calibrates the estimate (marked `≈` until the first sample). The last round's average is exact — the adapter's own output tokens over the pure decode window (first token to last).

## Forms

| Form | What it shows |
|---|---|
| Pet | Sprite animation by speed band; bubble above with live + last-average (hover or always-on) |
| Ring gauge | Eased arc in band colors; badge ring and caption with the last average |
| Capsule | Live figure (idle falls back to the last average, dimmed) + last-average line |

## Development

`lib/` ships prebuilt. Building from source happens inside the DeepSeek Harness monorepo (the client bundle format, CSS-modules inlining, and sprite-sheet inlining all come from its `tsdown` preset); `src/` is included for reading and patching. The sprite sheets live in `assets/pets/` (`*.orig.webp` are the untouched originals).

Attribution for the pet packs and the ported gauge/animation behavior: see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## License

[MIT](LICENSE) © masterchiefm
