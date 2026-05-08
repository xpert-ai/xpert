import { ComponentFixture, TestBed } from '@angular/core/testing'
import { StoredMessage } from '@langchain/core/messages'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
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
})
