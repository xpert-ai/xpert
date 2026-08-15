import { ComponentFixture, TestBed } from '@angular/core/testing'
import { StoredMessage } from '@langchain/core/messages'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import type { IModelInvocation } from '@xpert-ai/contracts'
import { CopilotStoredMessageComponent } from './message.component'

describe('CopilotStoredMessageComponent', () => {
  let fixture: ComponentFixture<CopilotStoredMessageComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), MarkdownModule.forRoot(), CopilotStoredMessageComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(CopilotStoredMessageComponent)
  })

  it('shows formatted response metadata for AI messages', () => {
    fixture.componentRef.setInput('message', {
      type: 'ai',
      data: {
        content: 'Done',
        role: undefined,
        name: undefined,
        tool_call_id: undefined,
        response_metadata: {
          usage: {
            prompt_tokens: 3769,
            completion_tokens: 171,
            total_tokens: 3940
          }
        }
      }
    } satisfies StoredMessage)

    fixture.detectChanges()

    expect(fixture.componentInstance.responseMetadataText()).toBe(
      JSON.stringify(
        {
          usage: {
            prompt_tokens: 3769,
            completion_tokens: 171,
            total_tokens: 3940
          }
        },
        null,
        2
      )
    )
    expect(fixture.nativeElement.querySelector('.message-metadata-icon')).not.toBeNull()
  })

  it('does not show metadata for non-AI messages', () => {
    fixture.componentRef.setInput('message', {
      type: 'human',
      data: {
        content: 'Hi',
        role: undefined,
        name: undefined,
        tool_call_id: undefined,
        response_metadata: {
          usage: {
            total_tokens: 1
          }
        }
      }
    } satisfies StoredMessage)

    fixture.detectChanges()

    expect(fixture.componentInstance.responseMetadataText()).toBe('')
    expect(fixture.nativeElement.querySelector('.message-metadata-icon')).toBeNull()
  })

  it('shows model invocation usage on the matching tool message', () => {
    fixture.componentRef.setInput('message', {
      type: 'tool',
      data: {
        content: 'Generated 1 image.',
        role: undefined,
        name: 'seedream_text_to_image',
        tool_call_id: 'call-seedream-1'
      }
    } satisfies StoredMessage)
    fixture.componentRef.setInput('modelInvocation', invocation())

    fixture.detectChanges()

    expect(fixture.componentInstance.modelInvocationMetadataText()).toContain('"totalTokens": 16384')
    expect(fixture.componentInstance.modelInvocationMetadataText()).toContain('"quantity": 1')
    expect(fixture.nativeElement.querySelector('.message-metadata-icon')).not.toBeNull()
  })
})

function invocation(): IModelInvocation {
  return {
    id: 'invocation-1',
    tenantId: 'tenant-1',
    organizationId: 'organization-1',
    invocationKey: 'call-seedream-1',
    originType: 'execution',
    originId: 'execution-1',
    originExecutionId: 'execution-1',
    userId: 'user-1',
    agentKey: 'agent-1',
    toolsetId: 'toolset-1',
    providerScopeId: 'provider-scope-1',
    copilotId: 'copilot-1',
    provider: 'seedream_aigc',
    modelType: AiModelTypeEnum.IMAGE,
    model: 'doubao-seedream-4-5-251128',
    toolName: 'seedream_text_to_image',
    operation: 'text_to_image',
    modality: 'image',
    providerState: 'succeeded',
    usageAvailability: 'available',
    metrics: [
      { unit: 'token', promptTokens: 0, completionTokens: 16_384, totalTokens: 16_384, authority: 'provider' },
      { unit: 'generation', quantity: 1, authority: 'provider' }
    ],
    artifactState: 'ready',
    reconciliationState: 'finished',
    reconcileAttempts: 0,
    startedAt: new Date('2026-08-15T00:00:00.000Z')
  }
}
