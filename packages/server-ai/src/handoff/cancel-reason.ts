const CANCELED_REASON_PREFIX = 'canceled:'

export function buildCanceledReason(reason?: string): string {
	const normalized = typeof reason === 'string' ? reason.trim() : ''
	return `${CANCELED_REASON_PREFIX}${normalized || 'Canceled by user'}`
}

export function isCanceledReason(reason?: string | null): boolean {
	return typeof reason === 'string' && reason.startsWith(CANCELED_REASON_PREFIX)
}

export function isAbortLikeError(error: unknown): boolean {
	if (!error) {
		return false
	}
	if (error instanceof Error) {
		return (
			error.name === 'AbortError' ||
			error.message.toLowerCase().includes('abort') ||
			error.message.toLowerCase().includes('cancel')
		)
	}
	if (typeof error === 'string') {
		const lower = error.toLowerCase()
		return lower.includes('abort') || lower.includes('cancel')
	}
	return false
}
