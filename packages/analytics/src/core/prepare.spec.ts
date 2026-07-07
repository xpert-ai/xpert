import { AiFeatureEnum, AnalyticsFeatures, FeatureEnum } from '@xpert-ai/contracts'
import { DEFAULT_FEATURES as SERVER_AI_DEFAULT_FEATURES } from '../../../server-ai/src/core/features'
import { DEFAULT_FEATURES as SERVER_DEFAULT_FEATURES } from '../../../server/src/feature/default-features'
import { DEFAULT_FEATURES as ANALYTICS_DEFAULT_FEATURES } from './features'

type FeatureTree = {
	code?: string
	isEnabled?: boolean
	children?: FeatureTree[]
}

const collectFeatureCodes = (features: readonly FeatureTree[]): string[] =>
	features
		.flatMap((feature) => [feature.code, ...collectFeatureCodes(feature.children ?? [])])
		.filter((code): code is string => Boolean(code))

const cloneFeature = (feature: FeatureTree): FeatureTree => ({
	code: feature.code,
	isEnabled: feature.isEnabled,
	children: feature.children?.map(cloneFeature)
})

const findFeature = (features: readonly FeatureTree[], code: string): FeatureTree | undefined => {
	for (const feature of features) {
		if (feature.code === code) {
			return feature
		}

		const childFeature = findFeature(feature.children ?? [], code)
		if (childFeature) {
			return childFeature
		}
	}

	return undefined
}

const getMergedDefaultFeatures = () => {
	const features = SERVER_DEFAULT_FEATURES.map(cloneFeature)

	;[...SERVER_AI_DEFAULT_FEATURES, ...ANALYTICS_DEFAULT_FEATURES].forEach((feature) => {
		const index = features.findIndex((item) => item.code === feature.code)
		if (index > -1) {
			features[index].children ??= []
			features[index].children.push(...(feature.children ?? []).map(cloneFeature))
		} else {
			features.push(cloneFeature(feature))
		}
	})

	return features
}

describe('prepare default feature definitions', () => {
	it('nests the digital expert feature under a pure Xpert feature group', () => {
		const features = getMergedDefaultFeatures()
		const topLevelCodes = features.map((feature) => feature.code)
		const xpertGroup = findFeature(features, 'GROUP_XPERT')

		expect(topLevelCodes).not.toContain(AiFeatureEnum.FEATURE_XPERT)
		expect(xpertGroup?.children?.map((feature) => feature.code)).toEqual(
			expect.arrayContaining([
				AiFeatureEnum.FEATURE_XPERT,
				AiFeatureEnum.FEATURE_XPERT_CLAWXPERT,
				AiFeatureEnum.FEATURE_XPERT_CHATBI,
				AiFeatureEnum.FEATURE_XPERT_CODEXPERT,
				AiFeatureEnum.FEATURE_XPERT_DEEP_RESEARCH,
				AiFeatureEnum.FEATURE_XPERT_DATA_ONTOLOGY,
				AiFeatureEnum.FEATURE_XPERT_MARKETPLACE
			])
		)
		expect(findFeature(features, AiFeatureEnum.FEATURE_XPERT_MARKETPLACE)?.isEnabled).toBe(false)
	})

	it('nests Copilot feature toggles under a pure Copilot feature group', () => {
		const features = getMergedDefaultFeatures()
		const topLevelCodes = features.map((feature) => feature.code)
		const copilotGroup = findFeature(features, 'GROUP_COPILOT')

		expect(topLevelCodes).not.toContain(AiFeatureEnum.FEATURE_COPILOT)
		expect(copilotGroup?.children?.map((feature) => feature.code)).toEqual(
			expect.arrayContaining([AiFeatureEnum.FEATURE_COPILOT, AiFeatureEnum.FEATURE_COPILOT_MONITORING])
		)
	})

	it('does not expose retired tenant feature toggles', () => {
		const codes = new Set(collectFeatureCodes(getMergedDefaultFeatures()))

		;[
			FeatureEnum.FEATURE_HOME,
			FeatureEnum.FEATURE_DASHBOARD,
			AnalyticsFeatures.FEATURE_HOME_CATALOG,
			AnalyticsFeatures.FEATURE_HOME_TREND,
			FeatureEnum.FEATURE_SETTING,
			FeatureEnum.FEATURE_FILE_STORAGE,
			AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE,
			AiFeatureEnum.FEATURE_COPILOT_CHAT,
			AnalyticsFeatures.FEATURE_INDICATOR,
			AnalyticsFeatures.FEATURE_INDICATOR_MARKET,
			AnalyticsFeatures.FEATURE_INDICATOR_REGISTER,
			AnalyticsFeatures.FEATURE_INDICATOR_APP
		].forEach((code) => {
			expect(codes).not.toContain(code)
		})

		expect(codes).toContain(AiFeatureEnum.FEATURE_COPILOT)
		expect(codes).toContain(FeatureEnum.FEATURE_SMTP)
	})

	it('nests custom SMTP under the email feature group', () => {
		const features = getMergedDefaultFeatures()
		const topLevelCodes = features.map((feature) => feature.code)
		const emailFeature = findFeature(features, 'FEATURE_EMAIL')

		expect(topLevelCodes).not.toContain(FeatureEnum.FEATURE_SMTP)
		expect(emailFeature?.children?.map((feature) => feature.code)).toContain(FeatureEnum.FEATURE_SMTP)
	})

	it('nests users and user groups under the user feature group', () => {
		const features = getMergedDefaultFeatures()
		const topLevelCodes = features.map((feature) => feature.code)
		const userFeature = findFeature(features, FeatureEnum.FEATURE_USER)

		expect(topLevelCodes).not.toContain(FeatureEnum.FEATURE_USERS)
		expect(topLevelCodes).not.toContain(FeatureEnum.FEATURE_USER_GROUPS)
		expect(userFeature?.children?.map((feature) => feature.code)).toEqual(
			expect.arrayContaining([FeatureEnum.FEATURE_USERS, FeatureEnum.FEATURE_USER_GROUPS])
		)
	})

	it('exposes data sources as an independent analytics feature', () => {
		const codes = collectFeatureCodes(getMergedDefaultFeatures())

		expect(codes).toContain(AnalyticsFeatures.FEATURE_DATA_SOURCE)
	})
})
