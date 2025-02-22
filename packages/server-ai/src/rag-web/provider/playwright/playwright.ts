import { TRagWebOptions } from '@metad/contracts'
import { Browser, Page, Response } from 'playwright'
import TurndownService = require('turndown')
import { CustomPlaywrightWebBaseLoader } from './loader'
import { TRagPlaywrightParams } from './schema'
import { v4 as uuidv4 } from 'uuid'


export const load = async (webOptions: TRagWebOptions) => {
	const params: Partial<TRagPlaywrightParams> = webOptions.params ?? {}
	const turndownService = new TurndownService()

	const loader = new CustomPlaywrightWebBaseLoader(webOptions.url, {
		mode: params.mode,
		limit: params.limit,
		maxDepth: params.maxDepth,
		timeout: params.timeout,
		launchOptions: {
			headless: true
		},
		gotoOptions: {
			waitUntil: 'domcontentloaded',
			timeout: (params.timeout ?? 60) * 1000
		},
		async extract(page: Page, browser: Browser, response: Response | null) {
			// 提取自定义的 metadata 信息
			const title = await page.title()
			const metadata = {
				title
			}
			for await (const name of ['description', 'author']) {
				let value: string | null = null
				try {
					const element = page.locator(`meta[name="${name}"]`)
					const isElementVisible = await element.isVisible()
					if (isElementVisible) {
						value = await element.getAttribute('content', { timeout: 30000 })
					}
				} catch (error) {
					//
				}
				metadata[name] = value
			}

			const url = page.url()

			return {
				...metadata,
				source: url,
				url: url,
				scrapeId: uuidv4()
			}
		},
		/** Pass custom evaluate, in this case you get page and browser instances */
		async evaluate(page: Page, browser: Browser, response: Response | null) {
			const result = await page.evaluate(() => document.body.innerHTML)
			return turndownService.turndown(result)
		}
	})

	return await loader.load()
}
