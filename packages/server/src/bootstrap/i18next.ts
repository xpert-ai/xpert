import i18next from 'i18next'
import FsBackend from 'i18next-fs-backend'
import middleware from 'i18next-http-middleware'
import path from 'path'
import chalk from 'chalk'
import { RequestContext } from '../core'

export async function initI18next(baseDir: string) {
	await i18next
		.use(FsBackend)
		.use(middleware.LanguageDetector)
		.init({
			debug: false,
			fallbackLng: 'en',
			fallbackNS: 'common',
			defaultNS: 'common',
			preload: ['en', 'en-US', 'zh-Hans'],
			ns: ['sql', 'xmla', 'common'], // list your namespaces
			backend: {
				loadPath: path.resolve(baseDir, '{{ns}}/src/i18n/{{lng}}.json')
			},
			detection: {
				order: ['header', 'querystring'],
				lookupHeader: 'language',
				caches: false
			},
			interpolation: {
				escapeValue: false
			}
		})
	
	// Monkey patch i18next.t
	const originalT = i18next.t.bind(i18next)
	i18next.t = ((key: any, options?: any) => {
		const lang = RequestContext.getLanguageCode()

		// If there was already lng in the original call, keep it
		const finalOptions = {
			lng: lang,
			...(options ?? {}),
		};

		return originalT(key, finalOptions);
	}) as any;

	// console.log(chalk.bgCyan(i18n.t('Error.NoPropertyFoundFor', {ns: 'xmla'})))
}
