import { IBasePerTenantAndOrganizationEntityModel } from './base-entity.model'
import { I18nObject } from './types'

export interface ITag extends IBasePerTenantAndOrganizationEntityModel {
  name?: string
  label?: I18nObject
  description?: string
  category?: TagCategoryEnum
  color?: string
  isSelected?: boolean
  icon?: string
  targets?: TagTarget[]
  isActive?: boolean
  isSystem?: boolean
}

export type TagTarget = TagCategoryEnum | 'knowledgebase' | 'people' | 'integration'

export function getTagTargets(tag: ITag): TagTarget[] {
  return tag.targets?.length ? tag.targets : tag.category ? [tag.category] : []
}

export interface ITagUsage {
  target: TagTarget
  count: number
}

export interface ITagDirectoryItem extends ITag {
  editable: boolean
  usage: ITagUsage[]
}

/** A visible expert version associated with a tag; excludes private expert configuration. */
export interface ITagXpertUsage {
  id: string
  name: string
  version: string | null
  latest: boolean
  deleted: boolean
}

export interface ITagName {
  name?: string
}

export enum TagCategoryEnum {
  INDICATOR = 'indicator',
  STORY = 'story',
  TOOLSET = 'toolset',
  XPERT = 'xpert'
}

export const TAG_TARGETS: TagTarget[] = [
  TagCategoryEnum.XPERT,
  'knowledgebase',
  TagCategoryEnum.TOOLSET,
  TagCategoryEnum.INDICATOR,
  TagCategoryEnum.STORY,
  'people',
  'integration'
]
