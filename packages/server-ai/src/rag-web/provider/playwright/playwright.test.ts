import { PlaywrightWebBaseLoader } from '@langchain/community/document_loaders/web/playwright';

describe('PlaywrightWebBaseLoader', () => {
    it('should load and return documents from a web page', async () => {
        const loader = new PlaywrightWebBaseLoader('https://www.langchain.com/', {
            launchOptions: {
                headless: true
            },
            gotoOptions: {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            },
            async evaluate(page, browser, response) {
                const content = await page.evaluate(() => document.body.innerHTML);
                return content;
            }
        });

        const documents = await loader.load();
        expect(documents).toBeInstanceOf(Array);
        expect(documents.length).toBeGreaterThan(0);
        expect(documents[0]).toHaveProperty('pageContent');
    }, 60 * 1000);
});
