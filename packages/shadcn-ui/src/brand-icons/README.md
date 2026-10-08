# Brand icons

Brand assets, display names, licenses and the React component live together in this shadcn-ui directory. The `@xpert-ai/shadcn-ui/brand-icons` entry exports only data and lookup functions: it does not import React, Angular, NestJS, contracts, Plugin SDK or business services. Server resource cards use this entry rather than the React component barrel.

```ts
import { getBrandIcon } from '@xpert-ai/shadcn-ui/brand-icons'

const brand = getBrandIcon('codex') // { id, name, svg }
```

Only exact brand IDs are accepted. Unknown IDs return `undefined`; provider aliases such as `codex-computer` are not brand IDs. Consumers choose their own fallback. The package neither chooses an executor nor infers identities from labels.

- Assets, names, colors and third-party licenses belong here.
- `brand-icon.tsx` owns React rendering, receiving a `brandId`; it is exported from `@xpert-ai/shadcn-ui`, not the data entry.
- Coding tool/provider mappings and the terminal fallback live in `server-ai/src/shared/coding-tools`.
- Resource-card providers adapt the returned SVG to the existing card protocol. No React dependency is required on the server.

The remote-view builders include `THIRD_PARTY_LICENSES.txt` automatically when the bundle uses these assets. Maintain the license here, not in each view. Other consumers must include it in their distributed assets.

## Asset policy and provenance

Prefer published color variants consistently across every surface. Six SVG marks are vendored from `@lobehub/icons-static-svg@1.95.1` ([Lobe Icons](https://github.com/lobehub/lobe-icons), MIT): Codex, OpenCode, Claude Code, Qwen, Kimi and CodeBuddy. Use `*-color.svg` except for OpenCode, whose [published brand assets](https://opencode.ai/brand) are monochrome. Aider uses its [official green PNG icon](https://github.com/Aider-AI/aider/blob/main/aider/website/assets/icons/android-chrome-192x192.png), Apache-2.0, embedded unchanged as a data URL.

SVG metadata/titles and fixed dimensions were removed. Preserve brand colors; only neutral paths inherit the foreground (OpenCode's mark and Kimi's white letter, keeping Kimi's blue accent visible in both themes). Do not invent colors for monochrome brands. Brand trademarks belong to their respective owners. Full licenses are in `THIRD_PARTY_LICENSES.txt`. No external image requests or additional icon package dependency. Aider's PNG is embedded inside an SVG image element to preserve the existing static resource-card protocol; the same SVG renders in React and cards.
