import { TestBed } from '@angular/core/testing'
import { Dialog } from '@angular/cdk/dialog'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { ChatConversationService, Store, XpertProjectService } from '@cloud/app/@core'
import { WORKBENCH_NAVIGATION_OPEN_COMMAND, type XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '@cloud/app/@shared/view-extension/view-client-command-registry.service'
import { XpertProjectTaskManagementComponent } from './project-task-management.component'

it('preserves node focus query parameters through the actual Project host registration', async () => {
  const navigate = jest.fn(async () => true),
    paramMap = convertToParamMap({ id: 'project' })
  TestBed.configureTestingModule({
    providers: [
      { provide: Store, useValue: { user$: of({ id: 'user' }) } },
      { provide: Router, useValue: { navigate } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap({})),
          snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
          parent: { paramMap: of(paramMap), snapshot: { paramMap } }
        }
      },
      { provide: Dialog, useValue: {} },
      { provide: ChatConversationService, useValue: {} },
      { provide: XpertProjectService, useValue: {} }
    ]
  })
  const component = TestBed.runInInjectionContext(() => new XpertProjectTaskManagementComponent())
  const registry = TestBed.inject(ViewClientCommandRegistry)
  const context = {
    hostType: 'project',
    hostId: 'project',
    viewKey: 'tasks',
    manifest: {} as XpertExtensionViewManifest
  }
  const pipelineNodeId = '45123b96-3d55-4321-91d3-9123acb31380'
  expect(
    await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      { target: 'project.application', projectId: 'project', pipelineNodeId },
      context
    )
  ).toMatchObject({ success: true })
  expect(navigate).toHaveBeenCalledWith(['/project', 'project', 'application'], { queryParams: { pipelineNodeId } })
  component.ngOnDestroy()
  expect(
    await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      { target: 'project.application', projectId: 'project', pipelineNodeId },
      context
    )
  ).toMatchObject({ success: false })
})

it('opens only a selected execution View in the current Project and never routes it through a chat', async () => {
  const open = jest.fn(),
    navigate = jest.fn(),
    paramMap = convertToParamMap({ id: 'project' })
  TestBed.configureTestingModule({
    providers: [
      { provide: Store, useValue: { user$: of({ id: 'user' }) } },
      { provide: Router, useValue: { navigate } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap({})),
          snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
          parent: { paramMap: of(paramMap), snapshot: { paramMap } }
        }
      },
      { provide: Dialog, useValue: { open } },
      { provide: ChatConversationService, useValue: {} },
      { provide: XpertProjectService, useValue: {} }
    ]
  })
  const component = TestBed.runInInjectionContext(() => new XpertProjectTaskManagementComponent())
  const registry = TestBed.inject(ViewClientCommandRegistry)
  const context = {
    hostType: 'project',
    hostId: 'project',
    viewKey: 'tasks',
    manifest: {} as XpertExtensionViewManifest
  }
  const target = {
    target: 'assistant.project',
    projectId: 'project',
    viewKey: 'platform.agent-results__results',
    selectionId: '45123b96-3d55-4321-91d3-9123acb31380'
  }
  expect(await registry.execute(WORKBENCH_NAVIGATION_OPEN_COMMAND, target, context)).toMatchObject({ success: true })
  expect(open).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      data: {
        projectId: target.projectId,
        viewKey: target.viewKey,
        selectionId: target.selectionId
      }
    })
  )
  expect(navigate).not.toHaveBeenCalled()
  for (const patch of [{ projectId: 'other' }, { viewKey: 'unregistered.view' }, { selectionId: '' }]) {
    await expect(registry.execute(WORKBENCH_NAVIGATION_OPEN_COMMAND, { ...target, ...patch }, context)).rejects.toThrow(
      'PROJECT_TASK_CONTEXT_REQUIRED'
    )
  }
  expect(open).toHaveBeenCalledTimes(1)
  component.ngOnDestroy()
})

it('preserves a validated pipeline return focus without opening configuration', () => {
  const id = '45123b96-3d55-4321-91d3-9123acb31380',
    paramMap = convertToParamMap({ id: 'project' })
  const focus = convertToParamMap({
    pipelineInstanceId: id,
    pipelineRoundId: id,
    pipelineNodeId: id,
    configure: 'true'
  })
  TestBed.configureTestingModule({
    providers: [
      { provide: Store, useValue: { user$: of({ id: 'user' }) } },
      { provide: Router, useValue: { navigate: jest.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(focus),
          snapshot: { data: { pipelineManagement: true }, queryParamMap: focus },
          parent: { paramMap: of(paramMap), snapshot: { paramMap } }
        }
      },
      { provide: Dialog, useValue: {} },
      { provide: ChatConversationService, useValue: {} },
      { provide: XpertProjectService, useValue: {} }
    ]
  })
  const component = TestBed.runInInjectionContext(() => new XpertProjectTaskManagementComponent())
  expect(component.entryQuery()).toEqual({
    parameters: { initialTab: 'pipeline', pipelineInstanceId: id, pipelineRoundId: id, pipelineNodeId: id }
  })
  component.ngOnDestroy()
})

it('uses current user identity and rejects mismatched or stale conversation navigation', async () => {
  const user = new BehaviorSubject({ id: 'first-user' })
  const params = new BehaviorSubject(convertToParamMap({ id: 'project' }))
  const open = jest.fn(),
    getOneById = jest.fn()
  TestBed.configureTestingModule({
    providers: [
      { provide: Store, useValue: { user$: user } },
      { provide: Router, useValue: { navigate: jest.fn() } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap({})),
          snapshot: { data: {}, queryParamMap: convertToParamMap({}) },
          parent: { paramMap: params, snapshot: { paramMap: params.value } }
        }
      },
      { provide: Dialog, useValue: { open } },
      { provide: ChatConversationService, useValue: { getOneById } },
      { provide: XpertProjectService, useValue: {} }
    ]
  })
  const component = TestBed.runInInjectionContext(() => new XpertProjectTaskManagementComponent())
  const registry = TestBed.inject(ViewClientCommandRegistry)
  const context = {
    hostType: 'project',
    hostId: 'project',
    viewKey: 'tasks',
    manifest: {} as XpertExtensionViewManifest
  }
  const target = {
    target: 'assistant.execution',
    projectId: 'project',
    conversationId: 'conversation',
    threadId: 'thread',
    executionId: 'exact-execution'
  }
  const conversation = { id: 'conversation', projectId: 'project', threadId: 'thread' }
  expect(component.runtimeUserId()).toBe('first-user')
  user.next({ id: 'second-user' })
  expect(component.runtimeUserId()).toBe('second-user')
  getOneById.mockReturnValue(of(conversation))
  await registry.execute(WORKBENCH_NAVIGATION_OPEN_COMMAND, target, context)
  expect(open).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({
      data: { projectId: 'project', conversation, executionId: 'exact-execution' }
    })
  )
  for (const patch of [{ projectId: 'other' }, { id: 'other-conversation' }, { threadId: 'other-thread' }]) {
    getOneById.mockReturnValue(of({ ...conversation, ...patch }))
    await expect(registry.execute(WORKBENCH_NAVIGATION_OPEN_COMMAND, target, context)).rejects.toThrow(
      'PROJECT_TASK_CONTEXT_CHANGED'
    )
  }
  const previousUser = new Subject<typeof conversation>()
  getOneById.mockReturnValue(previousUser)
  const previousResult = registry.execute(WORKBENCH_NAVIGATION_OPEN_COMMAND, target, context)
  user.next({ id: 'third-user' })
  previousUser.next(conversation)
  await expect(previousResult).rejects.toThrow('PROJECT_TASK_CONTEXT_CHANGED')
  const pending = new Subject<typeof conversation>()
  getOneById.mockReturnValue(pending)
  const result = registry.execute(WORKBENCH_NAVIGATION_OPEN_COMMAND, target, context)
  params.next(convertToParamMap({ id: 'next-project' }))
  pending.next(conversation)
  await expect(result).rejects.toThrow('PROJECT_TASK_CONTEXT_CHANGED')
  expect(open).toHaveBeenCalledTimes(1)
  component.ngOnDestroy()
})
