import './clawxpert-conversation-detail.test-setup'
import { TestBed } from '@angular/core/testing'
import { of, Subject } from 'rxjs'
import {
  CHATKIT_TASK_SUMMARY_OPEN_RESOURCE_EFFECT,
  type ChatTaskSummaryResourceReference
} from '@xpert-ai/chatkit-types'
import { ClawXpertConversationDetailComponent } from './clawxpert-conversation-detail.component'
import {
  configureConversationDetailTests,
  filePreviewModule,
  getRuntimeInput,
  resourceDialogModule,
  settle
} from './clawxpert-conversation-detail.test-setup'

function openResource(resource: ChatTaskSummaryResourceReference) {
  getRuntimeInput().onEffect?.({ name: CHATKIT_TASK_SUMMARY_OPEN_RESOURCE_EFFECT, data: { resource } })
}

describe('ChatKit host resource fallbacks without a legacy workbench', () => {
  const setup = configureConversationDetailTests()
  it('opens legacy workspace resources as previews without adding another workspace section', async () => {
    const { conversationService } = setup()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    openResource({ type: 'workspace_file', workspacePath: '/workspace/report.pdf' })
    await settle(fixture)
    expect(conversationService.getFile).toHaveBeenCalledWith(
      'conversation-1',
      '/workspace/report.pdf',
      undefined,
      undefined,
      true
    )
    expect(filePreviewModule.openWorkbenchFilePreviewDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'report.pdf',
        url: 'https://files.example.com/report.pdf'
      })
    )
    expect(fixture.nativeElement.querySelectorAll('section')).toHaveLength(1)
  })

  it('ignores late previews after a conversation switch', async () => {
    const { conversationService, facade } = setup()
    const file = new Subject<{ fileUrl: string }>()
    conversationService.getFile.mockReturnValue(file)
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    openResource({ type: 'workspace_file', workspacePath: '/workspace/report.pdf' })
    facade.threadId.set('thread-b')
    await settle(fixture)
    file.next({ fileUrl: 'https://files.example.com/stale.pdf' })
    await settle(fixture)
    expect(filePreviewModule.openWorkbenchFilePreviewDialog).not.toHaveBeenCalled()
  })

  it('downloads private files with authentication and releases the temporary URL on close', async () => {
    const { conversationService } = setup()
    conversationService.getFile.mockReturnValue(of({ mimeType: 'application/pdf' }))
    const previousCreate = URL.createObjectURL,
      previousRevoke = URL.revokeObjectURL
    URL.createObjectURL = jest.fn(() => 'blob:private-report')
    URL.revokeObjectURL = jest.fn()
    try {
      const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
      await settle(fixture)
      openResource({ type: 'workspace_file', workspacePath: '/workspace/private.pdf' })
      await settle(fixture)
      expect(conversationService.downloadFile).toHaveBeenCalledWith('conversation-1', '/workspace/private.pdf')
      const ref = filePreviewModule.openWorkbenchFilePreviewDialog.mock.results.at(-1)?.value
      ref.closed.next()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-report')
    } finally {
      URL.createObjectURL = previousCreate
      URL.revokeObjectURL = previousRevoke
    }
  })

  it('only signs an artifact preview after an explicit resource effect', async () => {
    const { artifactService } = setup()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    expect(artifactService.createSignedPreviewLink).not.toHaveBeenCalled()
    openResource({ type: 'artifact', artifactId: 'artifact-1' })
    await settle(fixture)
    expect(artifactService.createSignedPreviewLink).toHaveBeenCalledWith('artifact-1')
    expect(filePreviewModule.openWorkbenchFilePreviewDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        url: 'https://artifacts.example.com/report.pdf'
      })
    )
  })

  it('previews fallback browser resources in a scoped dialog, rejecting unsafe URLs', async () => {
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    openResource({ type: 'url', url: 'javascript:alert(1)' })
    expect(resourceDialogModule.openChatkitTaskResourceDialog).not.toHaveBeenCalled()
    openResource({ type: 'browser', serviceId: 'preview-service' })
    await settle(fixture)
    expect(resourceDialogModule.openChatkitTaskResourceDialog).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      {
        kind: 'browser',
        conversationId: 'conversation-1',
        serviceId: 'preview-service',
        url: undefined
      },
      expect.any(Function)
    )
    const ref = resourceDialogModule.openChatkitTaskResourceDialog.mock.results.at(-1)?.value
    fixture.destroy()
    expect(ref.close).toHaveBeenCalled()
  })

  it('can quote a preview element but never appends a stale preview to another conversation', async () => {
    const { facade } = setup()
    const fixture = TestBed.createComponent(ClawXpertConversationDetailComponent)
    await settle(fixture)
    openResource({ type: 'url', url: 'https://preview.example.com/' })
    const onReference = resourceDialogModule.openChatkitTaskResourceDialog.mock.calls.at(-1)?.[3]
    const reference = {
      type: 'element',
      tagName: 'h1',
      selector: 'main > h1',
      text: 'Hello',
      pageTitle: 'Preview',
      pageUrl: 'https://preview.example.com/',
      outerHtml: '<h1>Hello</h1>',
      attributes: []
    }
    await onReference(reference)
    const control = fixture.componentInstance.control()
    expect(control?.setComposerValue).toHaveBeenCalledWith({
      references: [expect.objectContaining({ type: 'quote' })],
      appendReferences: true
    })
    facade.threadId.set('thread-b')
    await settle(fixture)
    await onReference(reference)
    expect(control?.setComposerValue).toHaveBeenCalledTimes(1)
  })
})
