import { IWFNMiddleware, TXpertFeatures, TXpertTeamDraft, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { Test, TestingModule } from '@nestjs/testing'
import { WorkflowMiddlewareNodeValidator } from './validator'

jest.mock('../../../xpert/types', () => ({
	EventNameXpertValidate: 'xpert.validate',
	XpertDraftValidateEvent: class XpertDraftValidateEvent {}
}))

describe('WorkflowMiddlewareNodeValidator', () => {
	let moduleRef: TestingModule
	let validator: WorkflowMiddlewareNodeValidator
	let middlewareRegistry: { get: jest.Mock }

	const createFeatures = (sandboxEnabled: boolean): TXpertFeatures => ({
		opener: {
			enabled: false,
			message: '',
			questions: []
		},
		suggestion: {
			enabled: false,
			prompt: ''
		},
		textToSpeech: {
			enabled: false
		},
		speechToText: {
			enabled: false
		},
		sandbox: {
			enabled: sandboxEnabled
		}
	})

	const createDraft = (
		features?: TXpertTeamDraft['team']['features'],
		provider = 'SandboxShell'
	): TXpertTeamDraft => {
		const entity: IWFNMiddleware = {
			id: 'workflow-node-1',
			key: 'Middleware_1',
			type: WorkflowNodeTypeEnum.MIDDLEWARE,
			provider
		}
		const node: TXpertTeamNode<'workflow'> = {
			type: 'workflow',
			key: 'Middleware_1',
			position: { x: 0, y: 0 },
			entity
		}

		return {
			team: {
				id: 'xpert-1',
				features
			},
			nodes: [node],
			connections: []
		}
	}

	const createEvent = (
		draft: TXpertTeamDraft
	): Parameters<WorkflowMiddlewareNodeValidator['handle']>[0] => ({
		draft
	})

	beforeEach(async () => {
		middlewareRegistry = {
			get: jest.fn()
		}

		moduleRef = await Test.createTestingModule({
			providers: [
				WorkflowMiddlewareNodeValidator,
				{
					provide: AgentMiddlewareRegistry,
					useValue: middlewareRegistry
				}
			]
		}).compile()

		validator = moduleRef.get(WorkflowMiddlewareNodeValidator)
	})

	afterEach(async () => {
		await moduleRef.close()
	})

	it('returns a checklist error when a required middleware feature is disabled', () => {
		middlewareRegistry.get.mockReturnValue({
			meta: {
				name: 'SandboxShell',
				label: {
					en_US: 'Sandbox Shell',
					zh_Hans: '沙箱命令行工具'
				},
				features: ['sandbox']
			}
		})

		const results = validator.handle(createEvent(createDraft()))

		expect(results).toEqual([
			{
				node: 'Middleware_1',
				ruleCode: 'MIDDLEWARE_REQUIRED_FEATURE_DISABLED',
				field: 'provider',
				value: 'sandbox',
				message: {
					en_US: 'Middleware "Sandbox Shell" requires the xpert "sandbox" feature to be enabled',
					zh_Hans: '中间件 "沙箱命令行工具" 需要先开启 xpert 的 "sandbox" 功能'
				},
				level: 'error'
			}
		])
	})

	it('passes when all required middleware features are enabled', () => {
		middlewareRegistry.get.mockReturnValue({
			meta: {
				name: 'SandboxShell',
				label: {
					en_US: 'Sandbox Shell'
				},
				features: ['sandbox']
			}
		})

		const results = validator.handle(createEvent(createDraft(createFeatures(true))))

		expect(results).toEqual([])
	})

	it('returns a checklist error when the middleware provider is unavailable', () => {
		middlewareRegistry.get.mockImplementation(() => {
			throw new Error('No strategy found for type SandboxShell')
		})

		const results = validator.handle(createEvent(createDraft(undefined, 'SandboxShell')))

		expect(results).toEqual([
			{
				node: 'Middleware_1',
				ruleCode: 'MIDDLEWARE_PROVIDER_NOT_FOUND',
				field: 'provider',
				value: 'SandboxShell',
				message: {
					en_US: 'Middleware provider "SandboxShell" not found',
					zh_Hans: '中间件提供者 "SandboxShell" 未找到'
				},
				level: 'error'
			}
		])
	})
})
