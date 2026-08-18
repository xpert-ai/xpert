import { ComponentFixture, TestBed } from '@angular/core/testing'
import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { XpertAgentExecutionStatusComponent } from './execution.component'

describe('XpertAgentExecutionStatusComponent', () => {
  let fixture: ComponentFixture<XpertAgentExecutionStatusComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertAgentExecutionStatusComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(XpertAgentExecutionStatusComponent)
  })

  it('prefers total tokens aggregated from model invocations', () => {
    fixture.componentRef.setInput('execution', execution({ tokens: 53_487, totalTokens: 69_871 }))

    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('69,871')
    expect(fixture.nativeElement.textContent).not.toContain('53,487')
  })

  it('falls back to persisted LLM tokens for historical executions', () => {
    fixture.componentRef.setInput('execution', execution({ tokens: 53_487 }))

    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('53,487')
  })
})

function execution(overrides: Partial<IXpertAgentExecution>): IXpertAgentExecution {
  return {
    status: XpertAgentExecutionStatusEnum.SUCCESS,
    elapsedTime: 17_456,
    ...overrides
  }
}
