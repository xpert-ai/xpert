import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { KnowledgeKeywordAnalyzer } from '@xpert-ai/contracts'
import { KnowledgebaseService, ToastrService } from '../../../../@core'
import { KeywordAnalyzerSettingsComponent } from './keyword-analyzer-settings.component'

describe('KeywordAnalyzerSettingsComponent', () => {
  const basic: KnowledgeKeywordAnalyzer = { provider: 'basic', revision: 'v1', source: { kind: 'builtin' } }
  const plugin: KnowledgeKeywordAnalyzer = {
    provider: 'jieba',
    revision: 'v1',
    source: { kind: 'plugin', pluginName: '@xpert-ai/plugin-jieba', scopeKey: 'org' }
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KeywordAnalyzerSettingsComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: KnowledgebaseService,
          useValue: {
            getKeywordAnalyzers: () =>
              of([
                { label: 'Basic (Unicode)', languages: ['zh'], analyzer: basic },
                { label: 'Jieba', languages: ['zh'], analyzer: plugin }
              ])
          }
        },
        { provide: ToastrService, useValue: { error: jest.fn() } }
      ]
    }).compileComponents()
  })

  it('selects Basic (Unicode) by default and exposes installed plugin options', async () => {
    const fixture = TestBed.createComponent(KeywordAnalyzerSettingsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.analyzer()).toEqual(basic)
    fixture.componentInstance.form.controls.provider.setValue('jieba')
    expect(fixture.componentInstance.analyzer()).toEqual(plugin)
  })

  it('preserves legacy selection and disables changes when documents exist', async () => {
    const fixture = TestBed.createComponent(KeywordAnalyzerSettingsComponent)
    fixture.componentRef.setInput('analyzer', null)
    fixture.componentRef.setInput('locked', true)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.analyzer()).toBeNull()
    expect(fixture.componentInstance.form.controls.provider.disabled).toBe(true)
    fixture.componentInstance.form.controls.provider.setValue('jieba')
    expect(fixture.componentInstance.analyzer()).toBeNull()
  })

  it('does not default an unloaded analyzer while the settings are locked', async () => {
    const fixture = TestBed.createComponent(KeywordAnalyzerSettingsComponent)
    fixture.componentRef.setInput('locked', true)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.analyzer()).toBeUndefined()
  })
})
