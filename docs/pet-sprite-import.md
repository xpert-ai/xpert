# Desktop pet imports

The Assistant appearance editor accepts a PNG/WebP sprite sheet directly, or a ZIP containing one pet. Importing only `anything.webp` needs no JSON when the image follows the standard dimensions:

| Sprite layout | Image size  | Grid   | Cell size |
| ------------- | ----------- | ------ | --------- |
| v1            | 1536 × 1872 | 8 × 9  | 192 × 208 |
| v2            | 1536 × 2288 | 8 × 11 | 192 × 208 |

The first nine rows keep the existing animations and frame counts (6, 8, 8, 4, 5, 8, 6, 6, 6). The last two v2 rows contain sixteen look directions, clockwise from up in 22.5° increments. Idle Assistant previews and chat avatars follow the pointer with these poses. Actual activity takes priority; reduced motion disables animation and pointer following. Image dimensions identify the layout, not the correctness of the artwork in each cell.

A ZIP can have files at its root or inside a `.codex-pet` folder:

```text
quill-field-notes.codex-pet/
  pet.json
  spritesheet.webp
```

```json
{
  "id": "quill-field-notes",
  "displayName": "Quill (Field Notes)",
  "spritesheetPath": "spritesheet.webp",
  "spriteVersionNumber": 2
}
```

`spritesheetPath` is relative to `pet.json`. A declared version must match the decoded image dimensions. Without a manifest, a ZIP must contain exactly one PNG/WebP. Extra descriptive manifest fields do not affect rendering or rename the Assistant. Resource IDs remain open identifiers, independent of the preset catalog.

Imports are limited to 8 MiB per upload and per extracted file. ZIPs are parsed in memory, support stored/deflate entries, and reject encryption, multiple pets, unsafe paths, duplicate entries, unsupported versions, CRC failures and oversized output. No files are extracted to disk. Existing GIF/WebP animation imports remain available.

The original sprite and a static first-frame preview use the existing authorized file upload. The Assistant stores `avatar.appearance.spriteVersionNumber` (1 or 2), separately from `appearance.version` (still 1). Missing sprite version defaults to v1. The shared avatar URL remains usable by legacy clients.

Deploy the server schema/contracts and updated ChatKit frame before the Desktop build. No database migration or image conversion is required. Older ChatKit runtimes do not understand the v2 grid, and older appearance endpoints reject its new version field.
