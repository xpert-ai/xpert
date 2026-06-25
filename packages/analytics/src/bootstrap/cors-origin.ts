type CorsOriginCallback = (error: Error | null, allow?: boolean) => void
type CorsOriginRule = string | RegExp

export function createCorsOriginMatcher(...allowedOrigins: string[]) {
	const rules = expandCorsOriginRules(...allowedOrigins)

	return (origin: string | undefined, callback: CorsOriginCallback) => {
		callback(null, isCorsOriginAllowedByRules(origin, rules))
	}
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: string[]) {
	return isCorsOriginAllowedByRules(origin, expandCorsOriginRules(...allowedOrigins))
}

export function expandCorsOriginRules(...urls: string[]) {
	return urls.flatMap(expandCorsOriginUrl).filter((rule) => {
		return typeof rule === 'string' ? rule.length > 0 : true
	})
}

function isCorsOriginAllowedByRules(origin: string | undefined, rules: CorsOriginRule[]) {
	if (!origin) {
		return true
	}

	const normalizedOrigin = normalizeCorsOrigin(origin)
	return rules.some((rule) => {
		return typeof rule === 'string' ? rule === normalizedOrigin : rule.test(normalizedOrigin)
	})
}

function expandCorsOriginUrl(url: string) {
	const normalized = normalizeCorsOrigin(url)
	if (!normalized) {
		return []
	}

	if (normalized.startsWith('http')) {
		return [toCorsOriginRule(normalized)]
	}

	if (normalized.startsWith('//')) {
		return [toCorsOriginRule('http:' + normalized), toCorsOriginRule('https:' + normalized)]
	}

	return [toCorsOriginRule('http://' + normalized), toCorsOriginRule('https://' + normalized)]
}

function toCorsOriginRule(origin: string): CorsOriginRule {
	if (!origin.includes('*')) {
		return origin
	}

	const pattern = origin
		.split('*')
		.map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'))
		.join('[^./:]+')
	return new RegExp(`^${pattern}$`)
}

function normalizeCorsOrigin(origin: string) {
	return origin.trim().replace(/\/+$/, '')
}
