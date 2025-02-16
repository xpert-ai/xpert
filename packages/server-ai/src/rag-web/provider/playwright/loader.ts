import {
	PlaywrightWebBaseLoader,
	PlaywrightWebBaseLoaderOptions
} from '@langchain/community/document_loaders/web/playwright'
import { Document } from '@langchain/core/documents'
import type { Browser, Page, Response } from 'playwright'

export type TPlaywrightWebBaseLoaderOptions = PlaywrightWebBaseLoaderOptions & {
	extract?: (page: Page, browser: Browser, response: Response | null) => Promise<Record<string, any>>
}

export class CustomPlaywrightWebBaseLoader extends PlaywrightWebBaseLoader {
	declare options: TPlaywrightWebBaseLoaderOptions | undefined

	constructor(webPath: string, options?: TPlaywrightWebBaseLoaderOptions) {
		super(webPath, options)
	}

	static async _scrapeDoc(url: string, options?: TPlaywrightWebBaseLoaderOptions): Promise<Document> {
		const { chromium } = await PlaywrightWebBaseLoader.imports()

		const browser = await chromium.launch({
			headless: true,
			...options?.launchOptions
		})
		const page = await browser.newPage()

		const response = await page.goto(url, {
			timeout: 180000,
			waitUntil: 'domcontentloaded',
			...options?.gotoOptions
		})
		const pageContent = options?.evaluate ? await options?.evaluate(page, browser, response) : await page.content()

		const metadata = options?.extract ? await options?.extract(page, browser, response) : { source: url }

		await browser.close()

		return { metadata, pageContent }
	}

	/**
	 * Method that calls the _scrape method to perform the scraping of the web
	 * page specified by the webPath property. Returns a Promise that resolves
	 * to the scraped HTML content of the web page.
	 * @returns Promise that resolves to the scraped HTML content of the web page.
	 */
	async scrapeDoc(): Promise<Document> {
		return CustomPlaywrightWebBaseLoader._scrapeDoc(this.webPath, this.options)
	}

	/**
	 * Method that calls the scrape method and returns the scraped HTML
	 * content as a Document object. Returns a Promise that resolves to an
	 * array of Document objects.
	 * @returns Promise that resolves to an array of Document objects.
	 */
	async load(): Promise<Document[]> {
		return [await this.scrapeDoc()]
	}
}
