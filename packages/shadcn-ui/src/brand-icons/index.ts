import { brandLogos } from './logos'

const names = {
  codex: 'Codex',
  opencode: 'OpenCode',
  aider: 'Aider',
  claude: 'Claude Code',
  qwen: 'Qwen Code',
  kimi: 'Kimi Code',
  codebuddy: 'CodeBuddy'
} as const satisfies Record<keyof typeof brandLogos, string>

export type BrandIconId = keyof typeof names
export type BrandIconDefinition = Readonly<{ id: BrandIconId; name: string; svg: string }>

/** Only exact brand IDs; runtime/provider aliases belong to the consuming domain. */
export function getBrandIcon(id: string | null | undefined): BrandIconDefinition | undefined {
  if (!id || !Object.prototype.hasOwnProperty.call(names, id)) return undefined
  const key = id as BrandIconId
  return { id: key, name: names[key], svg: brandLogos[key] }
}
