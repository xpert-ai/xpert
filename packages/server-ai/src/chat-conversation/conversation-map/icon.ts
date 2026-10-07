import type { IconDefinition } from '@xpert-ai/contracts'

// Self-contained host identity: one conversation branching into two replies on the shared 256-unit tile grid.
// Fixed identity colors are intentional: host menus cannot consume the Remote View's theme tokens.
export const CONVERSATION_MAP_ICON = {
    type: 'svg',
    alt: 'Conversation Map',
    value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none"><rect x="24" y="24" width="208" height="208" rx="40" fill="#EFF6FF"/><path d="M128 108v28H82v20m46-20h46v20" stroke="#2563EB" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M108 58h40a12 12 0 0 1 12 12v24a12 12 0 0 1-12 12h-24l-16 14v-14a12 12 0 0 1-12-12V70a12 12 0 0 1 12-12Z" fill="#2563EB"/><path d="M68 152h30a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H80l-14 12v-12a10 10 0 0 1-8-10v-20a10 10 0 0 1 10-10Z" fill="#2563EB"/><path d="M158 152h30a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10h-18l-14 12v-12a10 10 0 0 1-8-10v-20a10 10 0 0 1 10-10Z" fill="#0891B2"/></svg>`
} satisfies IconDefinition
