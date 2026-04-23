import { BadRequestException } from '@nestjs/common'

type BrandedIdFactory<T> = (value: string) => T

export function normalizeRequiredBrandedId<T>(
	value: unknown,
	fieldName: string,
	factory: BrandedIdFactory<T>,
	options?: {
		missingMessage?: string
		blankMessage?: string
	}
): T {
	const missingMessage = options?.missingMessage ?? `${fieldName} is required`
	const blankMessage = options?.blankMessage ?? missingMessage

	if (typeof value !== 'string') {
		throw new BadRequestException(missingMessage)
	}

	const normalized = value.trim()
	if (!normalized) {
		throw new BadRequestException(blankMessage)
	}

	return factory(normalized)
}

export function normalizeOptionalBrandedId<T>(
	value: unknown,
	fieldName: string,
	factory: BrandedIdFactory<T>,
	options?: {
		blankAs?: 'null' | 'undefined'
		invalidMessage?: string
	}
): T | null | undefined {
	if (value === null) {
		return null
	}

	if (value === undefined) {
		return undefined
	}

	if (typeof value !== 'string') {
		throw new BadRequestException(options?.invalidMessage ?? `${fieldName} must be a string id when provided`)
	}

	const normalized = value.trim()
	if (!normalized) {
		return options?.blankAs === 'undefined' ? undefined : null
	}

	return factory(normalized)
}
