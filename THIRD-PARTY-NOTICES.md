# Third-Party Notices

This package includes or adapts the following open-source works.

## 1. Pet sprite packs

- Source project: [dsh-desk](https://github.com/Renakoni/dsh-desk)
- Author: Renakoni
- License: MIT License, Copyright (c) 2026 Renakoni
- Used: the sprite figures (`spritesheet.webp`) and `pet.json` from
  `yuexinmiao/` and `maid-deepseek-whale/`, following the Codex Pet pack
  sheet layout convention (1536×8 columns; one row per animation; ~160ms per
  frame). The sheets are re-encoded lossy WebP (quality 75) for inlining and
  the animation tables are re-declared in `src/client/pets.ts`; the original
  packs' bytes are preserved as `assets/pets/*/spritesheet.orig.webp`.

## 2. Ring gauges and the sprite pet animation schedule

- Source project: [zcode-speed-panel](https://github.com/)（本地项目
  `zcode-speed-panel`，其速度口径又参考 [zcode-tps-monitor](https://github.com/shy3130/zcode-tps-monitor)，MIT，shy3130）
- License: MIT License
- Used: the ring gauge drawing (arc sweep, band coloring, eased indicator,
  peak-following scale), the sprite pet's animation schedule (row-completion
  switching, speed-band-to-row mapping, sideways trot turn-around, idle
  rotation, bubble layout with hover expansion), and the six-band speed color
  table. No source code was copied verbatim; the behaviors are re-implemented
  against this package's own reading pipeline.
