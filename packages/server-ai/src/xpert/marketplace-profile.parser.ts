import {
    TXpertMarketplaceBusinessCategory,
    TXpertPublishMarketplaceInput,
    XpertMarketplaceBusinessCategories
} from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

const MAX_SUMMARY_LENGTH = 240
const MAX_TAG_LENGTH = 32
const MAX_TAG_COUNT = 12

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBusinessCategory(value: unknown): value is TXpertMarketplaceBusinessCategory {
    return (
        typeof value === 'string' &&
        XpertMarketplaceBusinessCategories.includes(value as TXpertMarketplaceBusinessCategory)
    )
}

function readString(value: unknown, maxLength: number, field: string) {
    if (value == null || value === '') {
        return null
    }
    if (typeof value !== 'string') {
        throw new BadRequestException(
            t('server-ai:Error.XpertMarketplaceInvalidField', {
                field,
                defaultValue: 'Invalid marketplace field.'
            })
        )
    }

    const trimmed = value.trim()
    if (!trimmed) {
        return null
    }
    if (trimmed.length > maxLength) {
        throw new BadRequestException(
            t('server-ai:Error.XpertMarketplaceFieldTooLong', {
                field,
                maxLength,
                defaultValue: 'Marketplace field is too long.'
            })
        )
    }

    return trimmed
}

function readBusinessCategories(value: unknown) {
    if (value == null) {
        return []
    }
    if (!Array.isArray(value) || value.some((item) => !isBusinessCategory(item))) {
        throw new BadRequestException(
            t('server-ai:Error.XpertMarketplaceInvalidCategory', {
                defaultValue: 'Invalid marketplace category.'
            })
        )
    }

    return Array.from(new Set(value))
}

function readCapabilityTags(value: unknown) {
    if (value == null) {
        return []
    }
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new BadRequestException(
            t('server-ai:Error.XpertMarketplaceInvalidTag', {
                defaultValue: 'Invalid marketplace tag.'
            })
        )
    }

    const tags = value.map((item) => item.trim()).filter(Boolean)
    if (tags.length > MAX_TAG_COUNT || tags.some((item) => item.length > MAX_TAG_LENGTH)) {
        throw new BadRequestException(
            t('server-ai:Error.XpertMarketplaceInvalidTag', {
                defaultValue: 'Invalid marketplace tag.'
            })
        )
    }

    return Array.from(new Set(tags))
}

export function parseXpertPublishMarketplaceInput(value: unknown): TXpertPublishMarketplaceInput | undefined {
    if (value == null) {
        return undefined
    }
    if (!isObjectValue(value)) {
        throw new BadRequestException(
            t('server-ai:Error.XpertMarketplaceInvalidProfile', {
                defaultValue: 'Invalid marketplace profile.'
            })
        )
    }

    const summary = readString(Reflect.get(value, 'summary'), MAX_SUMMARY_LENGTH, 'summary')
    const businessCategories = readBusinessCategories(Reflect.get(value, 'businessCategories'))
    const capabilityTags = readCapabilityTags(Reflect.get(value, 'capabilityTags'))
    const featuredValue = Reflect.get(value, 'featured')

    return {
        summary,
        businessCategories,
        capabilityTags,
        featured: featuredValue === true
    }
}
