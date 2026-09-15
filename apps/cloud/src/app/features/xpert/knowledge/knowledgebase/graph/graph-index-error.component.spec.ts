import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { KnowledgeGraphIndexErrorComponent } from './graph-index-error.component'

describe('Graph index failure presentation', () => {
  it('explains a legacy structured-output failure without presenting JSON as the summary', async () => {
    await TestBed.configureTestingModule({
      imports: [KnowledgeGraphIndexErrorComponent, TranslateModule.forRoot()]
    }).compileComponents()
    const fixture = TestBed.createComponent(KnowledgeGraphIndexErrorComponent)
    fixture.componentRef.setInput('error', 'Function extract arguments: {incomplete OUTPUT_PARSING_FAILURE')
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('[role=alert] > p')?.textContent).toContain('GraphIndexOutputInvalidHelp')
    expect(element.querySelector('[role=alert] > p')?.textContent).not.toContain('{incomplete')
    fixture.destroy()
  })

  it('keeps legacy raw model output collapsed and bounded while retaining a failure explanation', async () => {
    await TestBed.configureTestingModule({
      imports: [KnowledgeGraphIndexErrorComponent, TranslateModule.forRoot()]
    }).compileComponents()
    const fixture = TestBed.createComponent(KnowledgeGraphIndexErrorComponent)
    fixture.componentRef.setInput('error', 'Function extract arguments: ' + 'JSON '.repeat(5000))
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('details')?.open).toBe(false)
    expect(element.querySelector('pre')?.textContent?.length).toBe(4000)
    expect(element.querySelector('[role=alert] > p')?.textContent).toContain('GraphIndexFailedHelp')
    fixture.destroy()
  })
})
