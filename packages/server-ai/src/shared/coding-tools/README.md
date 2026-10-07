# Coding tool branding

Shared presentation for Coding Execution headers, project task/attempt views and resource cards. Lookup accepts exact CLI tool IDs, or explicitly registered Runtime provider aliases when no tool ID exists. Unknown tools keep a generic icon. No inference from names, prompts or task titles.

Task rows show the latest implementation executor only for ordinary leaf tasks without a registered business presentation. Summary/milestone and registered business icons remain intact. Independent reviews carry their own logos without replacing the implementation identity. Execution status remains a separate indicator.

## Boundaries

Canonical assets, brand names and licenses live in [`shadcn-ui/src/brand-icons`](../../../../shadcn-ui/src/brand-icons/README.md). Its `@xpert-ai/shadcn-ui/brand-icons` entry is React-free. This directory only maps exact Coding tool/provider IDs to brand IDs and supplies the Coding-specific terminal fallback. It contains no logo data or HTML rendering implementation.

The shared React `BrandIcon` in `packages/shadcn-ui/src/brand-icons/brand-icon.tsx` owns rendering and accessibility. Resource-card providers use the data entry through the Coding adapter. Neither entry imports this domain adapter or server services.
