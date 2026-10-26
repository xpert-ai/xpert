import './clawxpert-conversation-detail.test-setup'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import {
  KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
  WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
  WORKBENCH_ASSISTANT_PROJECT_TARGET,
  WORKBENCH_NAVIGATION_OPEN_COMMAND
} from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import { injectWorkspaceConnectorClientCommand } from '../../assistant/workspace-connector-client-command'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import {
  buildFixedViewManifest,
  configureConversationDetailTests,
  getRuntimeInput,
  runtimeModule,
  settle
} from './clawxpert-conversation-detail.test-setup'
describe('ClawXpertConversationDetailComponent navigation.spec.ts', () => {
  const setup = configureConversationDetailTests()
  let facade: ReturnType<typeof setup>['facade']
  let aiThreadService: ReturnType<typeof setup>['aiThreadService']
  let conversationService: ReturnType<typeof setup>['conversationService']
  let artifactService: ReturnType<typeof setup>['artifactService']
  let viewExtensionApi: ReturnType<typeof setup>['viewExtensionApi']
  let groupWorkbenchApi: ReturnType<typeof setup>['groupWorkbenchApi']
  let skillTrialIntent: ReturnType<typeof setup>['skillTrialIntent']
  let workbenchViewUrlState: ReturnType<typeof setup>['workbenchViewUrlState']
  let hostEvents: ReturnType<typeof setup>['hostEvents']
  let projectApi: ReturnType<typeof setup>['projectApi']
  let projectPermissions: ReturnType<typeof setup>['projectPermissions']
  beforeEach(() => {
    ;({
      facade,
      aiThreadService,
      conversationService,
      artifactService,
      viewExtensionApi,
      groupWorkbenchApi,
      skillTrialIntent,
      workbenchViewUrlState,
      hostEvents,
      projectApi,
      projectPermissions
    } = setup())
  })
  it('passes remote assistant context client commands into the current ChatKit request context', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const registry = TestBed.inject(ViewClientCommandRegistry)
    const result = await registry.execute(
      'assistant.context.set',
      {
        key: 'docxEditor',
        env: {
          docxEditorDocumentId: 'doc-1',
          docxEditorVersionId: 'version-1',
          docxEditorWorkspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx'
        },
        context: {
          currentDocument: {
            documentId: 'doc-1',
            title: '技术通知单',
            currentVersionId: 'version-1',
            currentVersionNumber: 1,
            workspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx',
            selection: {
              selectedText: 'selected text'
            }
          }
        }
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'docx-editor',
        manifest: buildFixedViewManifest('docx-editor')
      }
    )
    await settle(fixture)

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        status: 'updated',
        key: 'docxEditor'
      })
    )
    expect(getRuntimeInput().requestContext?.()).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          workspaceId: 'workspace-1',
          xpertId: 'assistant-1',
          docxEditorDocumentId: 'doc-1',
          docxEditorVersionId: 'version-1',
          docxEditorWorkspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx'
        }),
        docxEditor: expect.objectContaining({
          currentDocument: expect.objectContaining({
            documentId: 'doc-1',
            currentVersionId: 'version-1',
            workspaceFilePath: 'files/docx-editor/documents/doc-1/versions/v1-deadbeef.docx',
            selection: expect.objectContaining({
              selectedText: 'selected text'
            })
          })
        })
      })
    )
  })
  it('clears fixed-view request context when the Project scope changes', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const registry = TestBed.inject(ViewClientCommandRegistry)
    await registry.execute(
      'assistant.context.set',
      {
        key: 'docxEditor',
        env: {
          docxEditorDocumentId: 'personal-doc-1',
          docxEditorWorkspaceFilePath: 'files/docx-editor/documents/personal-doc-1/document.docx'
        },
        context: {
          currentDocument: {
            documentId: 'personal-doc-1',
            title: 'Personal document',
            workspaceFilePath: 'files/docx-editor/documents/personal-doc-1/document.docx'
          }
        }
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'docx-editor',
        manifest: buildFixedViewManifest('docx-editor')
      }
    )
    await settle(fixture)

    expect(getRuntimeInput().requestContext?.()).toEqual(
      expect.objectContaining({
        docxEditor: expect.any(Object)
      })
    )

    fixture.componentInstance.resolvedConversation.set(null)
    fixture.componentInstance.resolvedConversationId.set(null)
    facade.projectId.set('project-2')
    await settle(fixture)

    expect(getRuntimeInput().requestContext?.()).toEqual({
      env: {
        workspaceId: 'workspace-1',
        xpertId: 'assistant-1'
      }
    })
  })
  it('falls back to the knowledge document deep link when the workbench view is unavailable', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const router = TestBed.inject(Router)
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    getRuntimeInput().onEffect?.({
      name: KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
      data: {
        knowledgebaseId: 'kb-auto-1',
        documentId: 'doc-auto-1',
        chunkId: 'chunk-auto-7',
        page: 4,
        sourceBlockIds: ['block-auto-2'],
        evidenceText: 'Automotive motor rated voltage is 800 V.'
      }
    })
    await settle(fixture)

    expect(navigate).toHaveBeenCalledWith(['/xpert/knowledges', 'kb-auto-1', 'documents', 'doc-auto-1'], {
      queryParams: {
        chunkId: 'chunk-auto-7',
        view: 'analysis',
        page: '4',
        block: 'block-auto-2'
      },
      state: {
        knowledgeEvidence: {
          text: 'Automotive motor rated voltage is 800 V.',
          chunkId: 'chunk-auto-7',
          page: 4,
          sourceBlockIds: ['block-auto-2']
        }
      }
    })
  })
  it('opens FAQ citations in the FAQ manager instead of the hidden managed document', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const router = TestBed.inject(Router)
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    getRuntimeInput().onEffect?.({
      name: KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
      data: {
        knowledgebaseId: 'kb-faq-1',
        citationUrl: 'xpert://knowledgebase/faq?knowledgebaseId=kb-faq-1&faqId=faq-7'
      }
    })
    await settle(fixture)

    expect(navigate).toHaveBeenCalledWith(['/xpert/knowledges', 'kb-faq-1', 'faq'], {
      queryParams: { faqId: 'faq-7' }
    })
  })
  it('opens Wiki citations in the Wiki browser', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const router = TestBed.inject(Router)
    const navigate = jest.spyOn(router, 'navigate').mockResolvedValue(true)

    getRuntimeInput().onEffect?.({
      name: KNOWLEDGEBASE_OPEN_CITATION_EFFECT,
      data: {
        knowledgebaseId: 'kb-wiki-1',
        wikiPageId: 'page-1',
        section: 'overview'
      }
    })
    await settle(fixture)

    expect(navigate).toHaveBeenCalledWith(['/xpert/knowledges', 'kb-wiki-1', 'wiki'], {
      queryParams: { wikiPageId: 'page-1', section: 'overview' }
    })
  })
  it('forwards embedded view commands to the authorized execution conversation and reopens the same attempt', async () => {
    viewExtensionApi.getSlotViews.mockReturnValue(
      of([
        buildFixedViewManifest('platform.project-tasks__timeline', {
          clientCommands: [{ key: WORKBENCH_NAVIGATION_OPEN_COMMAND, label: { en_US: 'Open execution' } }]
        })
      ])
    )
    Object.assign(facade, {
      chatkitProjectSelection: signal({ mode: 'auto-new' }),
      currentXpert: signal({ options: { workspaceScope: { mode: 'project-required', onMissing: 'create' } } })
    })
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    facade.projectId.set('case-project-1')
    conversationService.resolveWorkbenchNavigation.mockReturnValue(
      of({
        conversationId: 'job-conversation-1',
        threadId: 'job-thread-1',
        xpertId: 'role-assistant-current',
        projectId: 'case-project-1',
        isExternalAssistant: true
      })
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    const primaryChatkitElement = fixture.nativeElement.querySelector('xpert-chatkit')

    facade.onChatThreadChange.mockClear()
    facade.setActiveConversation.mockClear()
    conversationService.markRead.mockClear()
    const result = await getRuntimeInput()
      .workbench?.()
      ?.onClientCommand?.({
        commandKey: WORKBENCH_NAVIGATION_OPEN_COMMAND,
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'platform.project-tasks__timeline',
        payload: {
          target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
          conversationId: 'job-conversation-1',
          threadId: 'job-thread-1',
          executionId: 'job-execution-1',
          xpertId: 'spoofed-role-assistant',
          projectId: 'case-project-1'
        }
      })
    await settle(fixture)

    expect(result).toEqual({
      success: true,
      status: 'opened',
      target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
      conversationId: 'job-conversation-1',
      threadId: 'job-thread-1',
      executionId: 'job-execution-1',
      xpertId: 'role-assistant-current',
      projectId: 'case-project-1',
      isExternalAssistant: true
    })
    expect(conversationService.resolveWorkbenchNavigation).toHaveBeenCalledWith(
      'job-conversation-1',
      'assistant-1',
      undefined,
      { threadId: 'job-thread-1', messageId: undefined }
    )
    expect(conversationService.getById).not.toHaveBeenCalledWith('job-conversation-1', { relations: ['messages'] })
    expect(getRuntimeInput().assistantId?.()).toBe('role-assistant-current')
    const connectorAssistantId = jest.mocked(injectWorkspaceConnectorClientCommand).mock.calls[0][0]
    expect(connectorAssistantId()).toBe('role-assistant-current')
    expect(getRuntimeInput().projectId?.()).toBe('case-project-1')
    expect(getRuntimeInput().composer?.().projects).toMatchObject({
      selection: undefined,
      autoNewEnabled: false
    })
    expect(getRuntimeInput().initialThread?.()).toBe('job-thread-1')
    expect(getRuntimeInput().delegatedConversation?.()).toEqual({
      conversationId: 'job-conversation-1',
      requesterXpertId: 'assistant-1'
    })
    expect(fixture.nativeElement.querySelector('xpert-chatkit')).toBe(primaryChatkitElement)
    expect(getRuntimeInput().requestContext?.()).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          xpertId: 'role-assistant-current',
          threadId: 'job-thread-1',
          executionId: 'job-execution-1',
          executionFocusRequestId: '1'
        })
      })
    )
    expect(setThreadId).toHaveBeenCalledWith('job-thread-1')
    expect(facade.onChatThreadChange).not.toHaveBeenCalled()
    expect(facade.setActiveConversation).not.toHaveBeenCalled()
    expect(conversationService.markRead).toHaveBeenCalledWith('job-conversation-1')

    await getRuntimeInput()
      .workbench?.()
      ?.onClientCommand?.({
        commandKey: WORKBENCH_NAVIGATION_OPEN_COMMAND,
        hostType: 'agent',
        hostId: 'role-assistant-current',
        viewKey: 'platform.project-tasks__timeline',
        payload: {
          target: WORKBENCH_ASSISTANT_CONVERSATION_TARGET,
          conversationId: 'job-conversation-1',
          threadId: 'job-thread-1',
          executionId: 'job-execution-1'
        }
      })
    await settle(fixture)
    expect(getRuntimeInput().requestContext?.()).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          threadId: 'job-thread-1',
          executionId: 'job-execution-1',
          executionFocusRequestId: '2'
        })
      })
    )

    const runtimeInput = getRuntimeInput()
    runtimeInput.onThreadChange?.({ threadId: 'role-thread-2' })
    runtimeInput.onProjectChange?.({ projectId: 'other-project' })
    runtimeInput.onEffect?.({ name: 'project.create', data: { name: 'Other project' } })
    await settle(fixture)
    expect(projectApi.create).not.toHaveBeenCalled()
    expect(facade.onChatThreadChange).not.toHaveBeenCalled()
    expect(facade.onChatProjectChange).not.toHaveBeenCalled()
  })
  it('rejects a stale thread hint before rebuilding ChatKit', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    conversationService.resolveWorkbenchNavigation.mockReturnValue(
      of({
        conversationId: 'job-conversation-1',
        threadId: 'canonical-thread-1',
        xpertId: 'role-assistant-current',
        projectId: 'case-project-1',
        isExternalAssistant: true
      })
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    await expect(
      fixture.componentInstance.openWorkbenchAssistantConversation({
        conversationId: 'job-conversation-1',
        threadId: 'stale-thread-1'
      })
    ).rejects.toThrow('does not match the authorized Assistant conversation')

    expect(getRuntimeInput().assistantId?.()).toBe('assistant-1')
    expect(setThreadId).not.toHaveBeenCalledWith('canonical-thread-1')
  })
  it('restores the primary Assistant ChatKit when the host route changes', async () => {
    const setThreadId = jest.fn().mockResolvedValue(undefined)
    runtimeModule.injectHostedAssistantChatkitControl.mockReturnValueOnce(
      signal({
        element: {},
        setThreadId,
        focusComposer: jest.fn()
      })
    )
    facade.projectId.set('case-project-1')
    conversationService.resolveWorkbenchNavigation.mockReturnValue(
      of({
        conversationId: 'job-conversation-1',
        threadId: 'job-thread-1',
        xpertId: 'role-assistant-current',
        projectId: 'case-project-1',
        isExternalAssistant: true
      })
    )
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    await fixture.componentInstance.openWorkbenchAssistantConversation({ conversationId: 'job-conversation-1' })
    await settle(fixture)
    expect(getRuntimeInput().assistantId?.()).toBe('role-assistant-current')

    facade.threadId.set('orchestrator-thread-2')
    await settle(fixture)

    expect(getRuntimeInput().assistantId?.()).toBe('assistant-1')
    expect(getRuntimeInput().projectId?.()).toBe('case-project-1')
    expect(getRuntimeInput().initialThread?.()).toBe('orchestrator-thread-2')
  })
  it('switches the embedded Workbench to the requested Assistant Project', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)

    const registry = TestBed.inject(ViewClientCommandRegistry)
    const result = await registry.execute(
      WORKBENCH_NAVIGATION_OPEN_COMMAND,
      {
        target: WORKBENCH_ASSISTANT_PROJECT_TARGET,
        projectId: 'case-project-1'
      },
      {
        hostType: 'agent',
        hostId: 'assistant-1',
        viewKey: 'factory-operations-center',
        manifest: buildFixedViewManifest('factory-operations-center')
      }
    )

    expect(result).toEqual({
      success: true,
      status: 'opened',
      target: WORKBENCH_ASSISTANT_PROJECT_TARGET,
      projectId: 'case-project-1'
    })
    expect(facade.onChatProjectChange).toHaveBeenCalledWith('case-project-1', undefined)
  })
})
