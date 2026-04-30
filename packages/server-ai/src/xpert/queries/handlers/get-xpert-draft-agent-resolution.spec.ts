jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		getLanguageCode: jest.fn().mockReturnValue('en')
	}
}))

jest.mock('../../xpert.service', () => ({
	XpertService: class XpertService {}
}))

jest.mock('@xpert-ai/copilot', () => ({
	nonNullable: <T>(value: T): value is NonNullable<T> => value != null
}))

jest.mock('../../../copilot', () => ({
	CopilotGetOneQuery: class CopilotGetOneQuery {
		constructor(..._args: unknown[]) {}
	}
}))

jest.mock('../../../shared', () => ({
	isKeyEqual: (left?: string | null, right?: string | null) => Boolean(left && right && left === right)
}))

import type { QueryBus } from '@nestjs/cqrs'
import type { IXpert, IXpertAgent, TXpertTeamDraft } from '@xpert-ai/contracts'
import type { I18nService } from 'nestjs-i18n'
import type { XpertService } from '../../xpert.service'
import { GetXpertAgentQuery } from '../get-xpert-agent.query'
import { GetXpertWorkflowQuery } from '../get-xpert-workflow.query'
import { GetXpertAgentHandler } from './get-xpert-agent.handler'
import { GetXpertWorkflowHandler } from './get-xpert-workflow.handler'

describe('draft agent resolution', () => {
	const hiddenPrimaryAgent = {
		key: 'Agent_Primary',
		name: 'Primary',
		options: {
			hidden: true
		}
	} as IXpertAgent

	function createXpert(draft: TXpertTeamDraft) {
		return {
			id: 'xpert-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			graph: {
				nodes: [],
				connections: []
			},
			draft,
			agent: hiddenPrimaryAgent,
			agents: [],
			executors: []
		} as IXpert
	}

	function createDraft() {
		return {
			team: {
				agent: hiddenPrimaryAgent
			},
			nodes: [],
			connections: []
		} as TXpertTeamDraft
	}

	function createXpertService(xpert: IXpert) {
		return {
			findOne: jest.fn().mockResolvedValue(xpert)
		} as Partial<XpertService> as XpertService
	}

	function createQueryBus() {
		return {
			execute: jest.fn()
		} as Partial<QueryBus> as QueryBus
	}

	it('does not use hidden primary fallback for a different requested workflow agent', async () => {
		const xpert = createXpert(createDraft())
		const service = createXpertService(xpert)
		const i18nService = {
			translate: jest.fn().mockResolvedValue('No agent in graph')
		} as Partial<I18nService> as I18nService
		const handler = new GetXpertWorkflowHandler(service, i18nService, createQueryBus())

		await expect(handler.execute(new GetXpertWorkflowQuery('xpert-1', 'OtherAgent', true))).rejects.toThrow(
			'No agent in graph'
		)
	})

	it('uses hidden primary fallback when querying that primary agent directly', async () => {
		const xpert = createXpert(createDraft())
		const service = createXpertService(xpert)
		const handler = new GetXpertAgentHandler(service, createQueryBus())

		const agent = await handler.execute(new GetXpertAgentQuery('xpert-1', 'Agent_Primary', true))

		expect(agent?.key).toBe('Agent_Primary')
	})
})
