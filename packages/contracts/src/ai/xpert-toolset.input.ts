import { I18nObject, TAvatar } from '../types'
import { TagCategoryEnum, TagTarget } from '../tag-entity.model'
import { XpertToolsetCategoryEnum } from './xpert-toolset.model'

/** Write models intentionally exclude ORM relations, scope owners and audit fields. */
export interface ToolsetToolInput {
  id?: string
  name: string
  label?: I18nObject | string | null
  description?: string | null
  avatar?: TAvatar | null
  enabled?: boolean | null
  disabled?: boolean | null
  schema?: object | null
  parameters?: Record<string, unknown> | null
  options?: Record<string, unknown> | null
}

/** Existing tags are references; ID-less definitions support legacy toolset imports. */
export interface ToolsetTagInput {
  id?: string
  name?: string
  label?: I18nObject | null
  description?: string | null
  category?: TagCategoryEnum | null
  color?: string | null
  icon?: string | null
  targets?: TagTarget[] | null
  isActive?: boolean
}

export interface ToolsetUpdateInput {
  workspaceId?: string | null
  name?: string
  type?: string | null
  category?: 'command' | XpertToolsetCategoryEnum | null
  description?: string | null
  avatar?: TAvatar | null
  options?: Record<string, unknown> | null
  credentials?: Record<string, unknown> | null
  schema?: string | null
  schemaType?: 'openapi_json' | 'openapi_yaml' | null
  privacyPolicy?: string | null
  customDisclaimer?: string | null
  tools?: ToolsetToolInput[] | null
  tags?: ToolsetTagInput[] | null
}

export interface ToolsetCreateInput extends ToolsetUpdateInput {
  name: string
}

export interface BuiltinToolsetInput extends ToolsetUpdateInput {
  id?: string
}

/** Build an HTTP payload from editor state without serializing loaded entity relations. */
export function toToolsetWriteInput(input: ToolsetUpdateInput): ToolsetUpdateInput {
  return {
    workspaceId: input.workspaceId,
    name: input.name,
    type: input.type,
    category: input.category,
    description: input.description,
    avatar: input.avatar,
    options: input.options,
    credentials: input.credentials,
    schema: input.schema,
    schemaType: input.schemaType,
    privacyPolicy: input.privacyPolicy,
    customDisclaimer: input.customDisclaimer,
    tools:
      input.tools?.map((tool) => ({
        id: tool.id,
        name: tool.name,
        label: tool.label,
        description: tool.description,
        avatar: tool.avatar,
        enabled: tool.enabled,
        disabled: tool.disabled,
        schema: tool.schema,
        parameters: tool.parameters,
        options: tool.options
      })) ?? input.tools,
    tags:
      input.tags?.map((tag) =>
        tag.id
          ? { id: tag.id }
          : {
              name: tag.name,
              label: tag.label,
              description: tag.description,
              category: tag.category,
              color: tag.color,
              icon: tag.icon,
              targets: tag.targets,
              isActive: tag.isActive
            }
      ) ?? input.tags
  }
}
