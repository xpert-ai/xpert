export function normalizeTenantSubdomain(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return null
	}

	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '')

	return normalized || null
}
