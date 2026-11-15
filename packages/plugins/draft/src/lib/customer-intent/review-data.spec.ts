import type { ExecutionReviewApi, ExecutionReviewItem, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AGENT_WORKBENCH_SLOT, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import {
  DefaultRuntimeCapabilityRegistry,
  ExecutionReviewRuntimeCapability,
  ViewMiddlewareRuntimeCapability,
  type IAgentMiddlewareContext
} from '@xpert-ai/plugin-sdk'
import { intentTarget } from './policy'
import { reviewFeature, reviewMiddleware, reviewViewKey } from './review-access'
import { getIntentReviewData, submitIntentReview } from './review-data'
import { IntentReviewMiddleware, IntentReviewView } from './review-view'

const host: XpertResolvedViewHostContext = {
  tenantId: 'tenant',
  organizationId: 'org',
  userId: 'supervisor',
  hostType: 'agent',
  hostId: 'assistant',
  slots: [],
  runtimeScope: {
    projectId: 'project',
    conversationId: 'open-case',
    dataScopeKey: 'project:project',
    workspaceFiles: { catalog: 'projects', scopeId: 'project' },
    projectAccess: { role: 'manager', canManage: true, canRead: true, canUse: true, canEdit: true }
  }
}

function fixture() {
  const api: jest.Mocked<ExecutionReviewApi> = { list: jest.fn(), get: jest.fn(), submit: jest.fn() }
  const scoped = new DefaultRuntimeCapabilityRegistry().register(ExecutionReviewRuntimeCapability, api)
  const context: IAgentMiddlewareContext = {
    tenantId: host.tenantId,
    organizationId: host.organizationId,
    userId: host.userId,
    node: { id: 'node', key: 'node', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: reviewMiddleware },
    tools: new Map(),
    runtime: { capabilities: scoped, createModelClient: jest.fn(), wrapWorkflowNodeExecution: jest.fn() }
  }
  const resolve = jest.fn(async () => ({ options: {}, context }))
  const capabilities = new DefaultRuntimeCapabilityRegistry().register(ViewMiddlewareRuntimeCapability, { resolve })
  return { api, resolve, capabilities }
}

it('forwards two cases, their source text and receipts through the host-scoped review API', async () => {
  const { api, resolve, capabilities } = fixture()
  const view = new IntentReviewView(capabilities)
  const first: ExecutionReviewItem = {
    executionId: '00000000-0000-4000-8000-000000000001',
    conversationId: 'case-one',
    threadId: 'thread-one',
    sourceText: '想查订单进度',
    createdAt: '2026-01-01T00:00:00Z',
    originalLabel: 'order_status',
    bundleHash: 'hash',
    versionId: 'v1'
  }
  const second = {
    ...first,
    executionId: '00000000-0000-4000-8000-000000000002',
    conversationId: 'case-two',
    threadId: 'thread-two',
    sourceText: '退款到哪一步了',
    originalLabel: 'refund'
  }
  const items = [first, second]
  api.list.mockResolvedValueOnce({ items, total: items.length })
  await expect(view.getViewData(host, reviewViewKey, {})).resolves.toEqual({ items, total: 2 })
  expect(api.list).toHaveBeenCalledWith(intentTarget, { queue: 'pending', page: 1, pageSize: 10 })

  for (const item of items) {
    const submission = {
      executionId: item.executionId,
      bundleHash: item.bundleHash,
      disposition: 'confirmed',
      expectedLabel: item.originalLabel,
      use: 'case_only'
    } as const
    const receipt = {
      ...submission,
      receiptId: 'receipt-' + item.executionId,
      originalLabel: item.originalLabel,
      versionId: item.versionId,
      reviewerId: host.userId,
      reviewedAt: '2026-01-02T00:00:00Z'
    }
    const selection = { selectionId: item.executionId }
    api.get.mockResolvedValueOnce(item).mockResolvedValueOnce({ ...item, receipt })
    api.submit.mockResolvedValueOnce(receipt)
    await expect(view.getViewData(host, reviewViewKey, selection)).resolves.toEqual({ item })
    await expect(view.executeViewAction(host, reviewViewKey, 'submit', { input: submission })).resolves.toEqual({
      success: true,
      data: receipt,
      refresh: true
    })
    expect(api.submit).toHaveBeenLastCalledWith(intentTarget, submission)
    await expect(view.getViewData(host, reviewViewKey, selection)).resolves.toEqual({
      item: { ...item, receipt }
    })
    expect(api.get).toHaveBeenLastCalledWith(intentTarget, item.executionId)
  }
  expect(resolve).toHaveBeenCalledTimes(7)
  expect(resolve).toHaveBeenCalledWith({ context: host, provider: reviewMiddleware, requiredFeature: reviewFeature })
})

it('exposes the review entry only in an authorized project Workbench', async () => {
  const { capabilities, resolve } = fixture()
  const view = new IntentReviewView(capabilities)
  const member: XpertResolvedViewHostContext = {
    ...host,
    runtimeScope: {
      ...host.runtimeScope,
      projectAccess: { role: 'member', canManage: false, canRead: true, canUse: true, canEdit: false }
    }
  }
  expect(view.getViewManifests(member, AGENT_WORKBENCH_SLOT)).toEqual([])
  await expect(view.getRemoteComponentEntry(member, reviewViewKey)).rejects.toMatchObject({ status: 403 })
  expect(resolve).not.toHaveBeenCalled()
  expect(view.getViewManifests(host, AGENT_WORKBENCH_SLOT)).toMatchObject([
    {
      key: reviewViewKey,
      activation: { requiredFeatures: new IntentReviewMiddleware().meta.features }
    }
  ])
  const entry = await view.getRemoteComponentEntry(host, reviewViewKey)
  expect(entry.contentType).toContain('text/html')
  expect(entry.html).toContain('xpertai.remote_component')
})

it('rejects a foreign View, an unsupported queue and a caller-supplied project override', async () => {
  const { api, resolve, capabilities } = fixture()
  await expect(getIntentReviewData(capabilities, host, 'other-view', {})).rejects.toMatchObject({ status: 403 })
  expect(resolve).not.toHaveBeenCalled()
  await expect(
    getIntentReviewData(capabilities, host, reviewViewKey, { parameters: { queue: 'other' } })
  ).rejects.toMatchObject({ status: 400 })
  await expect(
    submitIntentReview(capabilities, host, reviewViewKey, 'submit', {
      executionId: '00000000-0000-4000-8000-000000000001',
      bundleHash: 'hash',
      disposition: 'insufficient',
      use: 'case_only',
      projectId: 'another-project'
    })
  ).rejects.toMatchObject({ status: 400 })
  expect(api.list).not.toHaveBeenCalled()
  expect(api.submit).not.toHaveBeenCalled()
})
