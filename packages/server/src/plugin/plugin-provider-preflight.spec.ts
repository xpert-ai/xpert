import 'reflect-metadata'
import { Module, type Type } from '@nestjs/common'
import {
	definePluginRegistration,
	MessageWidgetProvider,
	PLUGIN_METADATA_KEY,
	WidgetActionProvider
} from '@xpert-ai/plugin-sdk'
import i18next from 'i18next'
import { preflightPluginProviders, type PluginProviderClaims } from './plugin-provider-preflight'

@Module({})
class TestPluginModule {}

const owner = '@example/reports'
const key = owner + ':report'

function preflight(providers: Type<unknown>[], pluginName = owner, existing: PluginProviderClaims[] = []) {
	return preflightPluginProviders({ module: TestPluginModule, providers }, pluginName, 'org-a', existing)
}

beforeAll(async () => {
	await i18next.init({ lng: 'en', resources: {}, interpolation: { escapeValue: false } })
})

it('accepts the same name in independent categories, including an extension unknown to the host', () => {
	const ReportView = definePluginRegistration('EXAMPLE_REPORT_VIEW', 'report view')
	@ReportView(key)
	class View {}
	@WidgetActionProvider(key)
	class Action {}
	@MessageWidgetProvider(key)
	class Card {}

	expect(preflight([View, Action, Card]).strategies).toEqual([
		{ kind: 'report view', key },
		{ kind: 'widget action provider', key },
		{ kind: 'widget provider', key }
	])
})

it.each([
	WidgetActionProvider,
	MessageWidgetProvider,
	definePluginRegistration('EXAMPLE_REPORT_ROUTE', 'report route')
])('rejects foreign and reserved names using the installing plugin identity', (decorate) => {
	@decorate(key)
	class Foreign {}
	Reflect.defineMetadata(PLUGIN_METADATA_KEY, owner, Foreign)
	expect(() => preflight([Foreign], '@example/other')).toThrow(/does not belong to @example\/other/)

	@decorate('project.move')
	class Reserved {}
	expect(() => preflight([Reserved])).toThrow(/does not belong/)
})

it.each([WidgetActionProvider, MessageWidgetProvider])(
	'rejects two providers claiming the same category and name',
	(decorate) => {
		@decorate(key)
		class First {}
		class Second extends First {}
		expect(() => preflight([First, Second])).toThrow(/Duplicate/)
		const previous = preflight([First])
		expect(preflight([Second], owner, [previous]).strategies).toEqual(previous.strategies)
	}
)

it('checks every category on one provider', () => {
	@WidgetActionProvider(key)
	@MessageWidgetProvider(key)
	class Combined {}
	expect(preflight([Combined]).strategies).toEqual(
		expect.arrayContaining([
			{ kind: 'widget action provider', key },
			{ kind: 'widget provider', key }
		])
	)
})
