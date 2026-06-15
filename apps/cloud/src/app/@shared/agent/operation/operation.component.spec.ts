import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import type { TSensitiveOperation } from '../../../@core'
import { XpertAgentOperationComponent } from './operation.component'

jest.mock('../../../@core', () => ({
  agentLabel: jest.fn(
    (agent?: { title?: string; name?: string; key?: string }) => agent?.title ?? agent?.name ?? agent?.key ?? ''
  ),
  BIInterruptMessageType: {
    DeleteArtifact: 'delete_artifact',
    SwitchProject: 'switch_project',
    SwitchSemanticModel: 'switch_semantic_model'
  },
  InterruptMessageType: {
    Select: 'select',
    SlidesTemplate: 'slides_template',
    SwitchGitHubRepository: 'switch_github_repository'
  },
  isInterruptMessage: jest.fn(() => false)
}))

describe('XpertAgentOperationComponent', () => {
  it('renders client tool interrupts as client execution waiting state', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertAgentOperationComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(XpertAgentOperationComponent)
    const operation: TSensitiveOperation = {
      tasks: [
        {
          name: 'submit_ai_result_file',
          interrupts: [
            {
              id: 'interrupt-1',
              value: {
                clientToolCalls: [
                  {
                    id: 'call-1',
                    name: 'submit_ai_result_file',
                    args: {
                      file_url: 'https://example.com/result.xlsx',
                      suggested_filename: 'AI生成数据.xlsx'
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    }

    fixture.componentRef.setInput('operation', operation)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const text = fixture.nativeElement.textContent as string
    expect(text).toContain('PAC.Xpert.ClientToolWaiting')
    expect(text).toContain('submit_ai_result_file')
    expect(text).not.toContain('https://example.com/result.xlsx')
    expect(text).not.toContain('AI生成数据.xlsx')
    expect(text).not.toContain('PAC.Xpert.ActionToReview')
    expect(text).not.toContain('PAC.Xpert.HITLEmpty')
    expect(fixture.nativeElement.querySelector('xp-xpert-agent-interrupt')).toBeNull()
    expect(fixture.nativeElement.querySelector('button')).toBeNull()
  })
})
