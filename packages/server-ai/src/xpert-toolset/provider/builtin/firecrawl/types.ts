import { TToolCredentials } from "@metad/contracts";

export enum FirecrawlToolEnum {
    Scrape = 'firecrawl_scrape',
    Crawl = 'firecrawl_crawl',
}

export type TFirecrawlToolCredentials = TToolCredentials & {
    integration: string
    firecrawl_api_key?: string
    base_url?: string
}