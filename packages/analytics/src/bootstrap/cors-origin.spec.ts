import { createCorsOriginMatcher, isCorsOriginAllowed } from './cors-origin'

describe('cors origin', () => {
	it('allows exact and wildcard tenant app origins', () => {
		const allowedOrigins = ['https://app.xpertai.cn', 'https://*.app.xpertai.cn']

		expect(isCorsOriginAllowed('https://app.xpertai.cn', allowedOrigins)).toBe(true)
		expect(isCorsOriginAllowed('https://shenzhen.app.xpertai.cn', allowedOrigins)).toBe(true)
		expect(isCorsOriginAllowed('https://api.xpertai.cn', allowedOrigins)).toBe(false)
		expect(isCorsOriginAllowed('https://shenzhen.app.xpertai.cn.evil.test', allowedOrigins)).toBe(false)
	})

	it('allows requests without an Origin header', () => {
		const callback = jest.fn()

		createCorsOriginMatcher('https://*.app.xpertai.cn')(undefined, callback)

		expect(callback).toHaveBeenCalledWith(null, true)
	})
})
