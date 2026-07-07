import type { ISkillRepositoryIndex } from '@cloud/app/@core'

export type SkillPlazaTab = 'featured' | 'enterprise' | 'favorites'

export interface SkillHotCardViewModel {
  item: ISkillRepositoryIndex
  title: string
  description: string
  tags: string[]
  downloads?: number | null
  stars?: number | null
}
