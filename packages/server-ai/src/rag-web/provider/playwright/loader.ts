import {
	PlaywrightWebBaseLoader,
	PlaywrightWebBaseLoaderOptions
} from '@langchain/community/document_loaders/web/playwright'
import { Document } from '@langchain/core/documents'
import type { Browser, Page, Response } from 'playwright'

export type TPlaywrightWebBaseLoaderOptions = PlaywrightWebBaseLoaderOptions & {
	mode?: 'scrape' | 'crawl'
	limit?: number
	maxDepth?: number
	timeout?: number
	/**
	 * Extract metadata of page
	 */
	extract?: (page: Page, browser: Browser, response: Response | null) => Promise<Record<string, any>>
}

export class CustomPlaywrightWebBaseLoader extends PlaywrightWebBaseLoader {
	declare options: TPlaywrightWebBaseLoaderOptions | undefined

	constructor(webPath: string, options?: TPlaywrightWebBaseLoaderOptions) {
		super(webPath, options)
	}

	static async _scrapeDoc(url: string, options?: TPlaywrightWebBaseLoaderOptions): Promise<Document & {links: string[]}> {
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

		const links = options?.mode === 'crawl' ? await page.evaluate(() => {
			// Get all <a> tag links on the current page
			const links = Array.from(document.querySelectorAll('a'))
			  .map((a: HTMLAnchorElement) => a.href)
			  .filter((href: string) => href.startsWith(window.location.origin)); // Only extract links under the same domain name
			return links
		  }) : []

		await browser.close()

		return { metadata, pageContent, links }
	}

	/**
	 * Method that calls the _scrape method to perform the scraping of the web
	 * page specified by the webPath property. Returns a Promise that resolves
	 * to the scraped HTML content of the web page.
	 * @returns Promise that resolves to the scraped HTML content of the web page.
	 */
	async scrapeDoc(): Promise<Document[]> {
		const docs = []
		const visitedUrls = new Set<string>() // Used to track visited URLs
		const pages = [{depth: 0, url: this.webPath}]
		while(pages.length > 0 && docs.length <= (this.options?.limit ?? 1000)) {
			const current = pages.shift() // First in, first out, process the first URL
			if (!current.url) continue
			if (current.depth > (this.options.maxDepth ?? 2)) continue

			// Remove hash from URL to avoid duplicates caused by different hash tags
			const urlWithoutHash = current.url.split('#')[0]
			if (visitedUrls.has(urlWithoutHash)) {
				continue
			} else {
				visitedUrls.add(urlWithoutHash)
			}
			const {metadata, pageContent, links} = await CustomPlaywrightWebBaseLoader._scrapeDoc(current.url, this.options)
			docs.push({ metadata, pageContent })
			if (this.options?.mode === 'crawl') {
				pages.push(...links.map((link) => ({depth: current.depth + 1, url: link}))) // Add subpage links to the end of pages
			}
		}

		return docs
	}

	/**
	 * Method that calls the scrape method and returns the scraped HTML
	 * content as a Document object. Returns a Promise that resolves to an
	 * array of Document objects.
	 * @returns Promise that resolves to an array of Document objects.
	 */
	async load(): Promise<Document[]> {
		const timeout = (this.options?.timeout ?? 60) * 1000 // Default timeout of 60 seconds
		const scrapePromise = this.scrapeDoc();
		const timeoutPromise = new Promise<Document[]>((_, reject) => 
			setTimeout(() => reject(new Error('Timeout')), timeout)
		);
		return await Promise.race([scrapePromise, timeoutPromise]);
	}
}
