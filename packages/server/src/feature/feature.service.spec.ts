import { AiFeatureEnum, AnalyticsFeatures, FeatureEnum, IFeature, IFeatureCreateInput } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import { DEFAULT_FEATURES, setDefaultFeatures } from './default-features'
import { Feature } from './feature.entity'
import { FeatureService } from './feature.service'

const createFeature = (code: string, children: IFeature[] = []): IFeature => ({
	id: code,
	code,
	name: code,
	description: '',
	link: '',
	status: '',
	icon: '',
	children
})

const originalDefaultFeatures = DEFAULT_FEATURES

describe('FeatureService', () => {
	afterEach(() => {
		setDefaultFeatures(originalDefaultFeatures)
	})

	it('filters retired feature toggles from parent feature results', async () => {
		const retainedChild = createFeature('FEATURE_RETAINED_CHILD')
		const copilotFeature = createFeature(AiFeatureEnum.FEATURE_COPILOT, [
			createFeature(AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE),
			createFeature(AiFeatureEnum.FEATURE_COPILOT_CHAT),
			retainedChild
		])
		const smtpFeature = createFeature(FeatureEnum.FEATURE_SMTP)
		const repository = {
			findAndCount: jest.fn().mockResolvedValue([
				[
					createFeature(FeatureEnum.FEATURE_HOME, [
						createFeature(FeatureEnum.FEATURE_DASHBOARD),
						createFeature(AnalyticsFeatures.FEATURE_HOME_CATALOG),
						createFeature(AnalyticsFeatures.FEATURE_HOME_TREND)
					]),
					createFeature(FeatureEnum.FEATURE_SETTING, [
						createFeature(FeatureEnum.FEATURE_FILE_STORAGE)
					]),
					copilotFeature,
					createFeature(AnalyticsFeatures.FEATURE_INDICATOR, [
						createFeature(AnalyticsFeatures.FEATURE_INDICATOR_MARKET),
						createFeature(AnalyticsFeatures.FEATURE_INDICATOR_REGISTER),
						createFeature(AnalyticsFeatures.FEATURE_INDICATOR_APP)
					]),
					smtpFeature
				],
				5
			])
		}
		const service = new FeatureService(repository as unknown as Repository<Feature>)

		const result = await service.getParentFeatures(['children'])

		expect(result).toEqual({
			items: [
				{
					...copilotFeature,
					children: [retainedChild]
				},
				smtpFeature
			],
			total: 2
		})
	})

	it('syncs parent ids for existing child feature definitions', async () => {
		const emailFeatureDefinition: IFeatureCreateInput = {
			name: 'Email',
			code: 'FEATURE_EMAIL',
			description: 'Manage Email',
			link: 'settings/email-history',
			isEnabled: true,
			icon: 'file-text-outline',
			status: 'info',
			children: [
				{
					name: 'Custom SMTP',
					code: FeatureEnum.FEATURE_SMTP,
					description: 'Manage Tenant & Organization Custom SMTP',
					link: 'settings/custom-smtp',
					isEnabled: true,
					icon: 'file-text-outline',
					status: 'success'
				}
			]
		}
		const emailFeature = {
			...createFeature('FEATURE_EMAIL'),
			id: 'feature-email',
			name: 'Email'
		}
		const smtpFeature = {
			...createFeature(FeatureEnum.FEATURE_SMTP),
			id: 'feature-smtp',
			name: 'Custom SMTP',
			parentId: null
		}
		const repository = {
			find: jest.fn(async ({ where }: { where?: { code?: string } }) => {
				if (where?.code === 'FEATURE_EMAIL') {
					return [emailFeature]
				}
				if (where?.code === FeatureEnum.FEATURE_SMTP) {
					return [smtpFeature]
				}
				return []
			}),
			save: jest.fn(async <T>(feature: T) => feature),
			delete: jest.fn()
		}
		const service = new FeatureService(repository as unknown as Repository<Feature>)
		setDefaultFeatures([emailFeatureDefinition])

		await service.seedDB()

		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				code: FeatureEnum.FEATURE_SMTP,
				parent: expect.objectContaining({
					id: emailFeature.id,
					code: emailFeature.code
				}),
				parentId: emailFeature.id
			})
		)
	})

	it('removes legacy duplicate feature rows when syncing a child feature definition', async () => {
		const xpertFeatureDefinition: IFeatureCreateInput = {
			name: 'Xpert',
			code: 'GROUP_XPERT',
			description: 'Manage Xpert feature modules',
			link: '',
			isEnabled: false,
			icon: 'sparkles',
			status: 'accent',
			children: [
				{
					name: 'Digital Expert',
					code: AiFeatureEnum.FEATURE_XPERT,
					description: 'Enable Xpert',
					link: '/xpert',
					isEnabled: true,
					icon: 'assistant',
					status: 'info'
				}
			]
		}
		const xpertGroupFeature = {
			...createFeature('GROUP_XPERT'),
			id: 'feature-group-xpert',
			name: 'Xpert'
		}
		const legacyTopLevelXpertFeature = {
			...createFeature(AiFeatureEnum.FEATURE_XPERT),
			id: 'feature-legacy-xpert',
			name: 'Xpert',
			parentId: null
		}
		const digitalExpertFeature = {
			...createFeature(AiFeatureEnum.FEATURE_XPERT),
			id: 'feature-digital-xpert',
			name: 'Digital Expert',
			parentId: xpertGroupFeature.id
		}
		const repository = {
			find: jest.fn(async ({ where }: { where?: { code?: string } }) => {
				if (where?.code === 'GROUP_XPERT') {
					return [xpertGroupFeature]
				}
				if (where?.code === AiFeatureEnum.FEATURE_XPERT) {
					return [legacyTopLevelXpertFeature, digitalExpertFeature]
				}
				return []
			}),
			save: jest.fn(async <T>(feature: T) => feature),
			upsert: jest.fn(),
			delete: jest.fn()
		}
		const service = new FeatureService(repository as unknown as Repository<Feature>)
		setDefaultFeatures([xpertFeatureDefinition])

		await service.seedDB()

		expect(repository.save).toHaveBeenCalledWith(
			expect.objectContaining({
				id: digitalExpertFeature.id,
				code: AiFeatureEnum.FEATURE_XPERT,
				name: 'Digital Expert',
				parent: expect.objectContaining({
					id: xpertGroupFeature.id,
					code: xpertGroupFeature.code
				}),
				parentId: xpertGroupFeature.id
			})
		)
		expect(repository.delete).toHaveBeenCalledWith([legacyTopLevelXpertFeature.id])
	})
})
