import { ISkillMarketFeaturedSkill, ISkillRepositoryIndex } from '@cloud/app/@core'

export function skillDisplayTitle(item: ISkillRepositoryIndex, featured?: ISkillMarketFeaturedSkill | null): string {
  return featured?.title || item.name || item.skillId || item.skillPath
}

export function skillDisplayDescription(
  item: ISkillRepositoryIndex,
  featured?: ISkillMarketFeaturedSkill | null
): string | null {
  return featured?.description || item.description || null
}

export function skillPublisherDisplayName(item: ISkillRepositoryIndex): string {
  return item.publisher?.displayName || item.publisher?.name || item.publisher?.handle || item.name || item.skillId
}

export function skillPublisherHandle(item: ISkillRepositoryIndex): string {
  if (item.publisher?.handle) {
    return `@${item.publisher.handle}`
  }

  return skillPublisherDisplayName(item)
}

export function skillPublisherAvatarFallback(item: ISkillRepositoryIndex): string {
  return skillPublisherDisplayName(item).charAt(0).toUpperCase() || 'S'
}
