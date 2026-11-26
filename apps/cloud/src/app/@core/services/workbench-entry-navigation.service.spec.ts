import { HttpClient } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { of, throwError } from 'rxjs'
import type { NotificationWorkbench } from '@xpert-ai/contracts'
import { Store } from '../state'
import { OrganizationsService } from './organizations.service'
import { ScopeService } from './scope.service'
import { WorkbenchEntryNavigation } from './workbench-entry-navigation.service'

describe('notification workbench navigation', () => {
  const id = 'a1111111-1111-4111-8111-111111111111'
  const target: NotificationWorkbench = {
    target: 'project.pipelines',
    projectId: id,
    organizationId: id,
    pipelineInstanceId: id,
    pipelineRoundId: id,
    pipelineNodeId: id
  }
  const navigate = jest.fn(async () => true)
  const store: { organizationId: string | null; user: { id: string } } = { organizationId: null, user: { id: 'human' } }
  const switchToOrganization = jest.fn(async (organization: { id: string }) => {
    store.organizationId = organization.id
    return true
  })
  const switchToTenant = jest.fn(async () => {
    store.organizationId = null
    return true
  })
  const post = jest.fn()
  const getById = jest.fn()
  beforeEach(() => {
    jest.clearAllMocks()
    store.organizationId = null
    store.user = { id: 'human' }
    getById.mockReturnValue(of({ id, isActive: true }))
    TestBed.configureTestingModule({
      providers: [
        WorkbenchEntryNavigation,
        { provide: HttpClient, useValue: { post } },
        { provide: Router, useValue: { navigate } },
        { provide: Store, useValue: store },
        { provide: OrganizationsService, useValue: { getById } },
        { provide: ScopeService, useValue: { switchToOrganization, switchToTenant } }
      ]
    })
  })
  it('selects an authorized organization before opening the exact pipeline node', async () => {
    expect(await TestBed.inject(WorkbenchEntryNavigation).open(target)).toBe(true)
    expect(switchToOrganization).toHaveBeenCalledWith({ id, isActive: true })
    expect(navigate).toHaveBeenCalledWith(['/project', id, 'pipelines'], {
      queryParams: { pipelineInstanceId: id, pipelineRoundId: id, pipelineNodeId: id }
    })
  })
  it('does not switch scope or navigate when current organization access is denied', async () => {
    getById.mockReturnValue(throwError(() => new Error('forbidden')))
    await expect(TestBed.inject(WorkbenchEntryNavigation).open(target)).rejects.toThrow('forbidden')
    expect(switchToOrganization).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
  it.each([null, id])(
    'opens a non-Project View through the generic host resolver in scope %s',
    async (organizationId) => {
      const view = { viewKey: 'orders__review', selectionId: 'order-42', parameters: { tab: 'evidence' } }
      post.mockReturnValue(of({ organizationId, projectId: null, assistant: { id, name: 'Orders' }, view }))
      expect(
        await TestBed.inject(WorkbenchEntryNavigation).open({
          target: 'workbench.view',
          assistantId: id,
          organizationId,
          projectId: null,
          ...view
        })
      ).toBe(true)
      expect(post).toHaveBeenCalledWith(expect.stringContaining(`/xpert/${id}/workbench-navigation`), {
        projectId: null,
        ...view
      })
      expect(navigate).toHaveBeenCalledWith(['/chat/x', id, 'c'], {
        queryParams: {
          view: view.viewKey,
          viewSelection: view.selectionId,
          viewParameters: JSON.stringify(view.parameters)
        }
      })
    }
  )
  it('retains Project scope for generic business Views and rejects unavailable View responses', async () => {
    const view = { viewKey: 'audit__timeline' }
    const input = { target: 'workbench.view' as const, assistantId: id, organizationId: id, projectId: id, ...view }
    post.mockReturnValue(of({ organizationId: id, projectId: id, assistant: { id, name: 'Audit' }, view }))
    expect(await TestBed.inject(WorkbenchEntryNavigation).open(input)).toBe(true)
    expect(navigate).toHaveBeenCalledWith(['/chat/x', id, 'p', id, 'c'], expect.anything())
    navigate.mockClear()
    post.mockReturnValue(throwError(() => new Error('revoked')))
    await expect(TestBed.inject(WorkbenchEntryNavigation).open(input)).rejects.toThrow('revoked')
    expect(navigate).not.toHaveBeenCalled()
  })
})
