import { TestBed } from '@angular/core/testing'
import { Dialog } from '@angular/cdk/dialog'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { of } from 'rxjs'
import { ChatConversationService, XpertProjectService } from '@cloud/app/@core'
import { WORKBENCH_NAVIGATION_OPEN_COMMAND, type XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { ViewClientCommandRegistry } from '@cloud/app/@shared/view-extension/view-client-command-registry.service'
import { XpertProjectTaskManagementComponent } from './project-task-management.component'

it('preserves node focus query parameters through the actual Project host registration', async () => {
  const navigate = jest.fn(async () => true),
    paramMap = convertToParamMap({ id: 'project' })
  TestBed.configureTestingModule({
    providers: [
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
