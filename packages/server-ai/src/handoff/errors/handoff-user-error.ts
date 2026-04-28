export type HandoffUserErrorAction = {
	type: 'sso_login' | 'request_workspace_access' | 'contact_admin' | 'retry'
	label: string
	url?: string
}

export type HandoffUserError = {
	code:
		| 'LARK_ACCOUNT_NOT_BOUND'
		| 'LEGACY_GHOST_USER'
		| 'WORKSPACE_ACCESS_DENIED'
		| 'ORGANIZATION_CONTEXT_MISSING'
		| 'BUSINESS_PRINCIPAL_MISSING'
		| 'UPSTREAM_EXECUTION_FAILED'
	title: string
	message: string
	action?: HandoffUserErrorAction
	diagnosticId?: string
}

const PUBLIC_APP_URL_ENV_KEYS = ['XPERT_PUBLIC_APP_URL', 'PUBLIC_APP_URL', 'WEB_APP_URL', 'APP_URL']

export function normalizeHandoffUserError(
	error: unknown,
	options?: { source?: string; diagnosticId?: string }
): HandoffUserError {
	const rawMessage = getErrorMessage(error)
	const source = options?.source?.trim().toLowerCase()
	const diagnosticId = options?.diagnosticId

	if (isLarkAccountNotBoundError(rawMessage)) {
		return {
			code: 'LARK_ACCOUNT_NOT_BOUND',
			title: '需要绑定 Xpert 账号',
			message:
				'我已经收到了你的飞书消息，但还不知道你对应哪个 Xpert 账号。请点击下面的按钮，用飞书登录 Xpert 平台完成绑定，然后再试一次。',
			action: buildLarkSsoLoginAction(),
			diagnosticId
		}
	}

	if (isLegacyGhostUserError(rawMessage)) {
		return {
			code: 'LEGACY_GHOST_USER',
			title: '需要重新绑定 Xpert 账号',
			message:
				'当前飞书身份对应的是历史临时账号，不是正式绑定的 Xpert 账号。请点击下面的按钮，用飞书重新登录并完成账号绑定。',
			action: buildLarkSsoLoginAction(),
			diagnosticId
		}
	}

	if (isWorkspaceAccessDenied(error, rawMessage)) {
		return {
			code: 'WORKSPACE_ACCESS_DENIED',
			title: '没有工作区权限',
			message:
				'你的飞书账号已经识别成功，但对应的 Xpert 账号没有访问当前 Claw 工作区的权限。请联系工作区管理员把你加入该工作区，然后再试一次。',
			action: {
				type: 'request_workspace_access',
				label: '联系工作区管理员'
			},
			diagnosticId
		}
	}

	if (rawMessage.includes('Organization context is required') || rawMessage.includes('organizationId')) {
		return {
			code: 'ORGANIZATION_CONTEXT_MISSING',
			title: '缺少组织信息',
			message: '无法确认你当前要使用的 Xpert 组织。请先登录 Xpert 平台并选择组织，然后再从飞书重试。',
			action: source === 'lark' ? buildLarkSsoLoginAction('用飞书重新登录 Xpert') : undefined,
			diagnosticId
		}
	}

	if (rawMessage.includes('BusinessPrincipal') || rawMessage.includes('Codexpert identity')) {
		return {
			code: 'BUSINESS_PRINCIPAL_MISSING',
			title: '无法确认 Xpert 用户身份',
			message:
				'系统没有拿到完整的 Xpert 用户、租户或组织信息，因此不能继续调用 Codexpert。请重新登录或重新绑定飞书账号后再试一次。',
			action: source === 'lark' ? buildLarkSsoLoginAction('重新登录 Xpert') : undefined,
			diagnosticId
		}
	}

	return {
		code: 'UPSTREAM_EXECUTION_FAILED',
		title: '执行失败',
		message: rawMessage || '任务执行失败，请稍后再试。',
		diagnosticId
	}
}

export function formatHandoffUserError(error: HandoffUserError): string {
	const lines = [error.title, '', error.message]
	if (error.action?.url) {
		lines.push('', `${error.action.label}: ${error.action.url}`)
	} else if (error.action?.label) {
		lines.push('', `建议: ${error.action.label}`)
	}
	if (error.diagnosticId) {
		lines.push('', `诊断编号: ${error.diagnosticId}`)
	}
	return lines.join('\n')
}

function buildLarkSsoLoginAction(label = '用飞书登录 Xpert'): HandoffUserErrorAction {
	const url = buildPublicUrl('/api/lark-identity/login/start', {
		returnTo: '/'
	})
	return {
		type: 'sso_login',
		label,
		...(url ? { url } : {})
	}
}

function buildPublicUrl(path: string, params?: Record<string, string>): string | undefined {
	const baseUrl = resolvePublicAppUrl()
	if (!baseUrl) {
		return undefined
	}
	const url = new URL(path, ensureTrailingSlash(baseUrl))
	Object.entries(params ?? {}).forEach(([key, value]) => {
		url.searchParams.set(key, value)
	})
	return url.toString()
}

function resolvePublicAppUrl(): string | undefined {
	for (const key of PUBLIC_APP_URL_ENV_KEYS) {
		const value = process.env[key]?.trim()
		if (value) {
			return value
		}
	}
	if (process.env.NODE_ENV !== 'production') {
		return 'http://localhost:4200'
	}
	return undefined
}

function ensureTrailingSlash(baseUrl: string): string {
	return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function isWorkspaceAccessDenied(error: unknown, message: string): boolean {
	return (
		message === 'Access denied to workspace' ||
		(getStatusCode(error) === 403 && /workspace|access denied/i.test(message))
	)
}

function isLarkAccountNotBoundError(message: string): boolean {
	return (
		message.includes('executeAsMappedUser requires account binding') ||
		message.includes('Lark account is not bound') ||
		message.includes('No mapped user found')
	)
}

function isLegacyGhostUserError(message: string): boolean {
	return (
		message.includes('ghost user') ||
		message.includes('historical temporary account') ||
		message.includes('legacy temporary account')
	)
}

function getStatusCode(error: unknown): number | undefined {
	const candidate = error as { status?: unknown; getStatus?: () => unknown } | undefined
	if (typeof candidate?.status === 'number') {
		return candidate.status
	}
	const status = candidate?.getStatus?.()
	return typeof status === 'number' ? status : undefined
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message
	}
	return typeof error === 'string' ? error : 'Internal Error'
}
