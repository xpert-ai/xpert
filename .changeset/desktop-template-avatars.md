---
'@xpert-ai/desktop': patch
---

Fix missing Assistant avatars imported from templates in Desktop by preserving validated inline image Data URLs in Assistant lists and template/expert catalogs. Share avatar URL normalization, enforce the existing 5 MiB avatar limit for embedded images, and retain emoji and default-avatar fallbacks for unsupported URLs.
