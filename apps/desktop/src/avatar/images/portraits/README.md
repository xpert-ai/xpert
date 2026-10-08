# Image avatar presets

These are **20 independent avatars** from the user-supplied `apps/desktop/avatars.zip`.

- `avatar-01.webp` through `avatar-10.webp`: converted from `1.png` through `10.png`, scaled proportionally with Lanczos resampling to fit a transparent 128 × 128 canvas, centered, and encoded as lossless WebP.
- `avatar-11.webp` through `avatar-20.webp`: the original 128 × 128 `1.webp` through `10.webp`, renamed and copied byte-for-byte. These are separate avatars, not thumbnails or alternate formats of the PNG files.

All presets are transparent 128 × 128 WebP images, named `avatar-NN.webp`. Keep every source image as a separate choice; matching source basenames do not imply matching artwork.

macOS archive metadata is excluded. The picker discovers each WebP independently with Vite's asset glob; adding another WebP here adds a separate image choice. Selecting one uses the existing public Assistant image-avatar upload and permission checks. A transparent square preview contains the full portrait by default; the user may adjust its crop before saving.
