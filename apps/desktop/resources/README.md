# Desktop app icons

`logo.png` is the supplied black smile tile, copied unchanged from
`apps/desktop/docs/logo.png`. It supplies the favicon and Windows/Linux app icons.
`logo.svg` remains the theme-aware login mark. Missing Assistant avatars use the
separate vector layers in `src/avatar/AnimatedAssistantAvatar.tsx`; custom avatars are preserved.

## macOS: current Electron ICNS pipeline

- `icon-macos.svg`: editable composition referencing `logo.png`, with a rounded clip and transparent outer margins.
- `icon-macos.png`: 1024 x 1024 RGBA master, exported in sRGB with transparent margins.
- `Xpert.iconset/`: Apple's 10 standard/Retina PNG representations, from 16 to 1024 pixels.
- `Xpert.icns`: application bundle icon, compiled with Apple's `iconutil`.

The static composition uses an 824px rounded tile centered on a 1024px canvas
and a subtle shadow. The provided raster artwork is preserved inside the tile;
its surrounding white canvas is clipped out. These are visual choices for the
current ICNS/Dock path, not the canvas mask to use in Icon Composer. Passing an
opaque image directly to Electron would retain a square background in the Dock.

After exporting changes to the RGBA master, regenerate the complete set on macOS:

```sh
corepack pnpm --filter @xpert-ai/desktop icons:macos
```

Keep `logo.png` beside the SVG when exporting it to a 1024px RGBA PNG. Commit the
logo, master, editable composition, generated iconset, and ICNS together. Development
sets the Dock image from the PNG because the host binary is Electron; the packaged
app uses its bundle ICNS without overriding it at runtime. Restart Desktop to see
Dock changes. No signing or packaging is required to regenerate the assets.

## Modern layered icons

Apple's current Icon Composer workflow also uses a 1024px Mac canvas, but accepts
separate SVG/PNG layers and lets the system apply the enclosure mask and material
effects. Do not import this static tile, shadow, or premasked PNG as a complete
layered design. Supply separate artwork layers and configure
the background/material in Icon Composer. This repository currently ships the
static ICNS set; it does not claim dark, clear, or tinted layered appearances.

References:

- [Apple app icon design guidance](https://developer.apple.com/design/human-interface-guidelines/app-icons)
- [Apple Icon Composer workflow](https://developer.apple.com/documentation/xcode/creating-your-app-icon-using-icon-composer)
- [Apple iconset filenames and Retina sizes](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/IconSetType.html)
