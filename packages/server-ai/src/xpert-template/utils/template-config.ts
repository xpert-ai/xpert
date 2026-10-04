import type {
    IconDefinition,
    ISkillMarketFeaturedRef,
    ISkillMarketFilterGroup,
    ISkillMarketFilterGroups,
    ISkillRepository
} from '@xpert-ai/contracts'
import { DEFAULT_SKILL_MARKET_FILTERS, fallbackLanguage } from '../template.constants'
import type {
    TDefaultSkillRepositoriesConfig,
    TDefaultSkillRepositoryEntry,
    TLocalizedSkillMarketCatalog,
    TTemplateMarketConfig,
    TTemplateMarketRef,
    TWorkspaceDefaultsConfig,
    TWorkspaceDefaultSkillRef
} from '../template.types'
export const isObjectValue = (value: unknown): value is object =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const isOptionalString = (value: unknown): value is string | undefined =>
    typeof value === 'undefined' || typeof value === 'string'

const isOptionalNumber = (value: unknown): value is number | undefined =>
    typeof value === 'undefined' || (typeof value === 'number' && Number.isFinite(value))

const isStringRecord = (value: unknown): value is NonNullable<IconDefinition['style']> =>
    isObjectValue(value) && Object.values(value).every((item) => typeof item === 'string')

const SKILL_MARKET_ICON_TYPES: IconDefinition['type'][] = ['image', 'svg', 'font', 'emoji', 'lottie']

const isIconType = (value: unknown): value is IconDefinition['type'] =>
    typeof value === 'string' && SKILL_MARKET_ICON_TYPES.some((type) => type === value)

const isIconDefinition = (value: unknown): value is IconDefinition => {
    if (!isObjectValue(value)) {
        return false
    }

    const type = Reflect.get(value, 'type')
    const iconValue = Reflect.get(value, 'value')

    return (
        isIconType(type) &&
        typeof iconValue === 'string' &&
        !!iconValue.trim() &&
        isOptionalString(Reflect.get(value, 'color')) &&
        isOptionalNumber(Reflect.get(value, 'size')) &&
        isOptionalString(Reflect.get(value, 'alt')) &&
        (typeof Reflect.get(value, 'style') === 'undefined' || isStringRecord(Reflect.get(value, 'style')))
    )
}

const isOptionalIconDefinition = (value: unknown): value is IconDefinition | undefined =>
    typeof value === 'undefined' || isIconDefinition(value)

const normalizeIconDefinition = (value: IconDefinition): IconDefinition => ({
    type: value.type,
    value: value.value.trim(),
    ...(value.color?.trim() ? { color: value.color.trim() } : {}),
    ...(typeof value.size === 'number' ? { size: value.size } : {}),
    ...(value.alt?.trim() ? { alt: value.alt.trim() } : {}),
    ...(value.style ? { style: { ...value.style } } : {})
})

const isSkillMarketFeaturedRef = (value: unknown): value is ISkillMarketFeaturedRef =>
    isObjectValue(value) &&
    typeof Reflect.get(value, 'provider') === 'string' &&
    typeof Reflect.get(value, 'repositoryName') === 'string' &&
    typeof Reflect.get(value, 'skillId') === 'string' &&
    isOptionalString(Reflect.get(value, 'badge')) &&
    isOptionalString(Reflect.get(value, 'title')) &&
    isOptionalString(Reflect.get(value, 'description')) &&
    isOptionalIconDefinition(Reflect.get(value, 'avatar'))

const isSkillMarketFilterOption = (value: unknown): value is ISkillMarketFilterGroup['options'][number] =>
    isObjectValue(value) &&
    typeof Reflect.get(value, 'value') === 'string' &&
    typeof Reflect.get(value, 'label') === 'string' &&
    isOptionalString(Reflect.get(value, 'description'))

const isSkillMarketFilterGroup = (value: unknown): value is ISkillMarketFilterGroup =>
    isObjectValue(value) &&
    typeof Reflect.get(value, 'label') === 'string' &&
    Array.isArray(Reflect.get(value, 'options')) &&
    (Reflect.get(value, 'options') as unknown[]).every(isSkillMarketFilterOption)

export const isWorkspaceDefaultSkillRef = (value: unknown): value is TWorkspaceDefaultSkillRef =>
    isObjectValue(value) &&
    typeof Reflect.get(value, 'provider') === 'string' &&
    typeof Reflect.get(value, 'repositoryName') === 'string' &&
    typeof Reflect.get(value, 'skillId') === 'string'

const isTemplateMarketRef = (value: unknown): value is TTemplateMarketRef =>
    isObjectValue(value) && typeof Reflect.get(value, 'id') === 'string'

const isOptionalRepositoryPayload = (value: unknown): value is ISkillRepository['options'] | null | undefined =>
    typeof value === 'undefined' || value === null || isObjectValue(value)

const isDefaultSkillRepositoryEntry = (value: unknown): value is TDefaultSkillRepositoryEntry =>
    isObjectValue(value) &&
    typeof Reflect.get(value, 'name') === 'string' &&
    typeof Reflect.get(value, 'provider') === 'string' &&
    isOptionalRepositoryPayload(Reflect.get(value, 'options')) &&
    isOptionalRepositoryPayload(Reflect.get(value, 'credentials'))

export function normalizeSkillMarketCatalog(value: unknown): TLocalizedSkillMarketCatalog {
    if (!isObjectValue(value)) {
        return {
            [fallbackLanguage]: {
                featured: [],
                filters: DEFAULT_SKILL_MARKET_FILTERS
            }
        }
    }

    const locales: TLocalizedSkillMarketCatalog = {}

    for (const [locale, config] of Object.entries(value)) {
        if (!locale.trim() || !isObjectValue(config)) {
            continue
        }

        const featuredValue = Reflect.get(config, 'featured')
        const featured = Array.isArray(featuredValue)
            ? featuredValue.filter(isSkillMarketFeaturedRef).map((item) => ({
                  provider: item.provider.trim(),
                  repositoryName: item.repositoryName.trim(),
                  skillId: item.skillId.trim(),
                  ...(item.badge ? { badge: item.badge.trim() } : {}),
                  ...(item.title ? { title: item.title.trim() } : {}),
                  ...(item.description ? { description: item.description.trim() } : {}),
                  ...(item.avatar ? { avatar: normalizeIconDefinition(item.avatar) } : {})
              }))
            : []

        const filters = normalizeSkillMarketFilters(Reflect.get(config, 'filters'))
        locales[locale] = { featured, filters }
    }

    if (locales[fallbackLanguage]) {
        return locales
    }

    return {
        ...locales,
        [fallbackLanguage]: {
            featured: [],
            filters: DEFAULT_SKILL_MARKET_FILTERS
        }
    }
}

export function normalizeTemplatesMarketConfig(value: unknown): TTemplateMarketConfig {
    if (!isObjectValue(value)) {
        return { recommendedApps: [] }
    }

    const recommendedApps = Reflect.get(value, 'recommendedApps')
    if (!Array.isArray(recommendedApps)) {
        return { recommendedApps: [] }
    }

    return {
        recommendedApps: recommendedApps
            .filter(isTemplateMarketRef)
            .map((item) => ({ id: item.id.trim() }))
            .filter((item) => !!item.id)
    }
}

export function normalizeSkillMarketFilters(value: unknown): ISkillMarketFilterGroups {
    if (!isObjectValue(value)) {
        return DEFAULT_SKILL_MARKET_FILTERS
    }

    return {
        roles: normalizeSkillMarketFilterGroup(Reflect.get(value, 'roles'), DEFAULT_SKILL_MARKET_FILTERS.roles),
        appTypes: normalizeSkillMarketFilterGroup(
            Reflect.get(value, 'appTypes'),
            DEFAULT_SKILL_MARKET_FILTERS.appTypes
        ),
        hot: normalizeSkillMarketFilterGroup(Reflect.get(value, 'hot'), DEFAULT_SKILL_MARKET_FILTERS.hot)
    }
}

export function normalizeSkillMarketFilterGroup(
    value: unknown,
    fallback: ISkillMarketFilterGroup
): ISkillMarketFilterGroup {
    if (!isSkillMarketFilterGroup(value)) {
        return fallback
    }

    return {
        label: value.label.trim(),
        options: value.options.map((option) => ({
            value: option.value.trim(),
            label: option.label.trim(),
            ...(option.description ? { description: option.description.trim() } : {})
        }))
    }
}

export function normalizeWorkspaceDefaults(value: unknown): TWorkspaceDefaultsConfig {
    const normalizedSkills =
        isObjectValue(value) && isObjectValue(Reflect.get(value, 'userDefault'))
            ? Reflect.get(Reflect.get(value, 'userDefault'), 'skills')
            : undefined

    const skills = Array.isArray(normalizedSkills)
        ? normalizedSkills
              .filter(isWorkspaceDefaultSkillRef)
              .map((item) => ({
                  provider: item.provider.trim(),
                  repositoryName: item.repositoryName.trim(),
                  skillId: item.skillId.trim()
              }))
              .filter((item) => item.provider && item.repositoryName && item.skillId)
        : []

    return {
        userDefault: {
            skills
        }
    }
}

export function normalizeSkillRepositories(value: unknown): TDefaultSkillRepositoriesConfig {
    const normalizedRepositories = isObjectValue(value) ? Reflect.get(value, 'repositories') : undefined
    const repositories = Array.isArray(normalizedRepositories)
        ? normalizedRepositories
              .filter(isDefaultSkillRepositoryEntry)
              .map((item) => ({
                  name: item.name.trim(),
                  provider: item.provider.trim(),
                  ...(typeof item.options !== 'undefined' ? { options: item.options } : {}),
                  ...(typeof item.credentials !== 'undefined' ? { credentials: item.credentials } : {})
              }))
              .filter((item) => item.name && item.provider)
        : []

    return { repositories }
}
