jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ZardSelectComponent } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom, of, Subject, throwError } from 'rxjs'
import { KnowledgebaseService, KBDocumentCategoryEnum, BUILTIN_KNOWLEDGE_FILE_TYPES } from '@cloud/app/@core'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { IntegrationSelectComponent } from '@cloud/app/@shared/integration'
import { createKnowledgeProcessingForm } from './processing-form'
import { KnowledgeProcessingSettingsComponent } from './processing-settings.component'

describe('processing settings file-type visibility', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [KnowledgeProcessingSettingsComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: KnowledgebaseService,
          useValue: {
            getTextSplitterStrategies: () => of([]),
            getDocumentTransformerStrategies: () =>
              of([
                {
                  meta: {
                    name: 'default',
                    supportedFileTypes: BUILTIN_KNOWLEDGE_FILE_TYPES,
                    configSchema: { type: 'object', properties: { replaceWhitespace: { type: 'boolean' } } }
                  }
                },
                {
                  meta: {
                    name: 'pdf-visual',
                    supportedFileTypes: ['pdf'],
                    configSchema: { type: 'object', properties: { maxPages: { type: 'number', default: 300 } } }
                  }
                }
              ])
          }
        }
      ]
    })
    TestBed.overrideComponent(KnowledgeProcessingSettingsComponent, {
      remove: { imports: [CopilotModelSelectComponent, IntegrationSelectComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] }
    })
  })

  afterEach(() => TestBed.resetTestingModule())

  it('explains spreadsheet document parsing when selecting a plugin without changing other formats', async () => {
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('zh-Hans', {
      XP: {
        Knowledgebase: {
          WorkspaceConfiguration: {
            Implemented: {
              BuiltinParser: '内置解析器',
              SpreadsheetDocumentMode: '文档解析',
              SpreadsheetDocumentModeHelp: '提取表格正文，不生成逐行记录。',
              SpreadsheetBuiltinModeHelp: '默认按行记录入库。'
            }
          }
        }
      }
    })
    translate.use('zh-Hans')
    const { fixture, form, root } = setup()
    fixture.componentRef.setInput('documents', [{ type: 'xlsx' }, { type: 'csv' }, { type: 'docx' }])
    await form.loadStrategies()
    form.parserProviders.update((providers) => [
      ...providers,
      { meta: { name: 'anydoc', label: 'AnyDoc', supportedFileTypes: ['xlsx', 'csv', 'docx'] } }
    ])
    fixture.autoDetectChanges()
    await fixture.whenStable()
    expect(root.querySelector('[data-parser-type="excel"] [data-spreadsheet-parser-mode]').textContent).toContain(
      '按行记录'
    )
    fixture.debugElement
      .query(By.css('[data-parser-type="excel"] z-select'))
      .triggerEventHandler('ngModelChange', 'anydoc')
    await fixture.whenStable()
    expect(root.querySelector('[data-parser-type="excel"] [data-spreadsheet-parser-mode]').textContent).toContain(
      '不生成逐行记录'
    )
    expect(root.querySelector('[data-parser-type="csv"] [data-spreadsheet-parser-mode]').textContent).toContain(
      '按行记录'
    )
    expect(root.querySelector('[data-parser-type="word"] [data-spreadsheet-parser-mode]')).toBeNull()
  })

  it.each(['knowledgebase', 'documents'])(
    'keeps builtin labels and disables parser selection until strategies load for %s',
    async (scope) => {
      const translate = TestBed.inject(TranslateService)
      translate.setTranslation('zh-Hans', {
        XP: { Knowledgebase: { WorkspaceConfiguration: { Implemented: { BuiltinParser: '内置解析器' } } } }
      })
      translate.use('zh-Hans')
      const api = TestBed.inject(KnowledgebaseService)
      const providers = await firstValueFrom(api.getDocumentTransformerStrategies())
      const pending = new Subject<typeof providers>()
      jest.spyOn(api, 'getDocumentTransformerStrategies').mockReturnValue(pending)
      const { fixture, root, form } = setup()
      fixture.componentRef.setInput('scope', scope)
      fixture.componentRef.setInput('documents', [{ type: 'pdf' }, { type: 'docx' }])
      fixture.autoDetectChanges()
      await fixture.whenStable()

      const controls = ['pdf', 'word'].map((format) => ({
        trigger: root.querySelector<HTMLButtonElement>(`[data-parser-type="${format}"] button[role="combobox"]`),
        select: fixture.debugElement
          .query(By.css(`[data-parser-type="${format}"] z-select`))
          .injector.get(ZardSelectComponent)
      }))
      for (const { trigger } of controls) {
        expect(trigger.textContent).toContain('内置解析器')
        expect(trigger.disabled).toBe(true)
      }
      const loading = form.loadStrategies()
      await fixture.whenStable()
      for (const { trigger, select } of controls) {
        expect(trigger.textContent).toContain('内置解析器')
        expect(trigger.disabled).toBe(true)
        trigger.click()
        expect(select.isOpen()).toBe(false)
      }

      pending.next(providers)
      await loading
      await fixture.whenStable()
      for (const { trigger } of controls) {
        expect(trigger.textContent).toContain('内置解析器')
        expect(trigger.disabled).toBe(false)
      }
      form.parserProviders.update((current) => [
        ...current,
        { meta: { name: 'word-plugin', label: 'Word plugin', supportedFileTypes: ['docx'] } }
      ])
      form.selectParser('docx', 'word-plugin')
      await fixture.whenStable()
      expect(controls[1].trigger.textContent).toContain('Word plugin')
      expect(controls[1].trigger.textContent).not.toContain('内置解析器')
      expect(form.parserType('docx')).toBe('word-plugin')
    }
  )

  it('keeps parser selection disabled after a strategy failure and enables it after a successful retry', async () => {
    const api = TestBed.inject(KnowledgebaseService)
    const providers = await firstValueFrom(api.getDocumentTransformerStrategies())
    jest
      .spyOn(api, 'getDocumentTransformerStrategies')
      .mockReturnValueOnce(throwError(() => new Error('Strategy request failed')))
      .mockReturnValueOnce(of(providers))
    const { fixture, root, form } = setup()
    fixture.autoDetectChanges()
    await form.loadStrategies()
    await fixture.whenStable()
    const trigger = root.querySelector<HTMLButtonElement>('[data-parser-type="word"] button[role="combobox"]')
    expect(root.querySelector('[role="alert"]').textContent).toContain('Strategy request failed')
    expect(trigger.disabled).toBe(true)
    await form.loadStrategies()
    await fixture.whenStable()
    expect(form.strategiesError()).toBe('')
    expect(trigger.disabled).toBe(false)
  })

  it.each(['knowledgebase', 'documents'])(
    'keeps builtin settings compact without discarding saved parser options for %s',
    async (scope) => {
      const { fixture, root, form } = setup()
      fixture.componentRef.setInput('scope', scope)
      await form.loadStrategies()
      fixture.autoDetectChanges()
      await fixture.whenStable()
      const select = fixture.debugElement
        .query(By.css('[data-parser-type="pdf"] z-select'))
        .injector.get(ZardSelectComponent)
      expect(select.zValue()).toBe('builtin')
      expect(root.querySelector('[data-parser-type] json-schema-form')).toBeNull()
      expect(form.pdfParserOptions()).toEqual({ maxPages: 300 })
      expect(root.querySelector('z-select-item[zValue="inherit"]')).toBeNull()
      expect(root.textContent).not.toContain('InheritParser')
      expect(root.querySelector('[data-excel-header] input[type="checkbox"]')).not.toBeNull()

      for (const name of ['builtin', 'pdf-visual', 'default']) {
        form.selectPdfParser(name)
        form.pdfParserOptions.set({ maxPages: 20, renderScale: 3 })
        form.selectParser('docx', 'default')
        form.updateParser('docx', { transformer: { removeSensitive: true } })
        const reopened = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm({ config: form.config() }))
        await reopened.loadStrategies()
        fixture.componentRef.setInput('form', reopened)
        await fixture.whenStable()
        expect(root.querySelector('[data-parser-type] json-schema-form')).toBeNull()
        expect(reopened.config().pdfParser.transformer).toMatchObject({ maxPages: 20, renderScale: 3 })
        expect(reopened.config().parsers.docx.transformer).toEqual({ removeSensitive: true })
      }

      fixture.componentRef.setInput('form', form)
      form.selectParser('xlsx', 'external-excel')
      fixture.detectChanges()
      expect(root.querySelector('[data-excel-header]')).toBeNull()
    }
  )

  it.each(['knowledgebase', 'documents'])(
    'hides empty parser forms while preserving configured fields and saved options for %s',
    async (scope) => {
      const { fixture, root, form } = setup()
      fixture.componentRef.setInput('scope', scope)
      await form.loadStrategies()
      form.parserProviders.update((providers) => [
        ...providers,
        { meta: { name: 'no-schema', supportedFileTypes: ['pdf', 'docx', 'pptx'] } },
        {
          meta: {
            name: 'no-properties',
            supportedFileTypes: ['pdf', 'docx', 'pptx'],
            configSchema: { type: 'object' }
          }
        },
        {
          meta: {
            name: 'empty-schema',
            supportedFileTypes: ['pdf', 'docx', 'pptx'],
            configSchema: { type: 'object', properties: {} }
          }
        },
        {
          meta: {
            name: 'with-fields',
            supportedFileTypes: ['pdf', 'docx', 'pptx'],
            configSchema: { type: 'object', properties: { language: { type: 'string', title: 'Language' } } }
          }
        }
      ])
      fixture.autoDetectChanges()
      for (const name of ['with-fields', 'no-schema', 'no-properties', 'empty-schema', 'with-fields']) {
        for (const format of ['pdf', 'docx', 'pptx']) {
          form.selectParser(format, name)
          if (format === 'pdf') form.pdfParserOptions.set({ language: 'en' })
          else form.updateParser(format, { transformer: { language: 'en' } })
        }
        await fixture.whenStable()
        for (const row of ['pdf', 'word', 'presentation']) {
          const region = root.querySelector(`[data-parser-type="${row}"]`)
          expect(region).not.toBeNull()
          if (name === 'with-fields') {
            expect(region.querySelector('json-schema-form')).not.toBeNull()
            expect(region.textContent).toContain('Language')
          } else {
            expect(region.querySelector('json-schema-form')).toBeNull()
          }
        }
        expect(form.config().pdfParser.transformer).toEqual({ language: 'en' })
        expect(form.config().parsers.docx.transformer).toEqual({ language: 'en' })
        expect(form.config().parsers.pptx.transformer).toEqual({ language: 'en' })
      }
    }
  )

  function setup() {
    const form = TestBed.runInInjectionContext(() => createKnowledgeProcessingForm())
    const fixture = TestBed.createComponent(KnowledgeProcessingSettingsComponent)
    fixture.componentRef.setInput('form', form)
    fixture.componentRef.setInput('section', 'parser')
    const root: HTMLElement = fixture.nativeElement
    const rows = () =>
      Array.from(root.querySelectorAll('[data-parser-type]')).map((element) => element.getAttribute('data-parser-type'))
    return { fixture, rows, form, root }
  }

  it('shows one image row and an explicit default-parser hint for unsupported batch formats', async () => {
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('zh-Hans', {
      XP: {
        Knowledgebase: {
          WorkspaceConfiguration: {
            Implemented: {
              GroupParserFallback: '{{formats}} 不受所选解析器支持，将使用系统默认解析器。'
            }
          }
        }
      }
    })
    translate.use('zh-Hans')
    const { fixture, rows, form, root } = setup()
    await form.loadStrategies()
    form.parserProviders.update((providers) => [
      ...providers,
      {
        meta: {
          name: 'baidu-paddleocr-vl',
          label: 'Baidu OCR',
          supportedFileTypes: ['png'],
          configScope: 'integration',
          configSchema: { type: 'object', properties: {} }
        }
      }
    ])
    fixture.componentRef.setInput('documents', [{ type: 'png' }, { type: 'gif' }, { type: 'webp' }])
    fixture.autoDetectChanges()
    await fixture.whenStable()
    expect(rows()).toEqual(['image'])
    expect(root.querySelector('[data-parser-type="image"]').textContent).toContain('.png')
    expect(root.querySelector('[data-parser-type="image"]').textContent).not.toContain('.jpg')
    const select = fixture.debugElement
      .query(By.css('[data-parser-type="image"] z-select'))
      .injector.get(ZardSelectComponent)
    select.selectItem('baidu-paddleocr-vl', 'Baidu OCR')
    await fixture.whenStable()
    expect(root.querySelector('[data-parser-fallback]').textContent).toContain('.gif, .webp')
    expect(root.querySelector('[data-parser-fallback]').textContent).toContain('将使用系统默认解析器')
    expect(form.config().parsers.png.transformerType).toBe('baidu-paddleocr-vl')
    expect(form.config().parsers.gif.transformerType).toBe('builtin')
    expect(form.config().parsers.webp.transformerType).toBe('builtin')
    expect(form.config().parsers.jpg.transformerType).toBe('builtin')
  })

  it('edits the token cap with an enabled validated control', async () => {
    const { fixture, root, form } = setup()
    fixture.componentRef.setInput('section', 'chunk')
    fixture.detectChanges()
    await fixture.whenStable()
    const trigger = root.querySelector<HTMLElement>('z-accordion-header')
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    const input = root.querySelector<HTMLInputElement>('[data-chunk-max-tokens] input')
    expect(input.disabled).toBe(false)
    for (const value of ['64', '0', '-1', '']) {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      fixture.detectChanges()
      await fixture.whenStable()
      if (value === '64' || value === '0') {
        expect(form.config().maxChunkTokens).toBe(Number(value))
        expect(form.validation()).toBeNull()
      } else {
        expect(form.validation()?.key).toContain('InvalidTokenLimit')
        expect(root.querySelector('[data-chunk-max-tokens]').textContent).toContain('InvalidTokenLimit')
      }
    }
  })

  it('enables and saves the language selection only for supported splitters', async () => {
    const { fixture, root, form } = setup()
    form.splitterProviders.set([{ name: 'auto', supportsLanguageHint: true }, { name: 'parent-child' }])
    fixture.componentRef.setInput('section', 'chunk')
    fixture.detectChanges()
    await fixture.whenStable()
    root.querySelector<HTMLElement>('z-accordion-header').click()
    fixture.detectChanges()
    await fixture.whenStable()
    const select = fixture.debugElement
      .query(By.css('[data-chunk-language-hint] z-select'))
      .injector.get(ZardSelectComponent)
    const trigger = root.querySelector<HTMLButtonElement>('[data-chunk-language-hint] button[role="combobox"]')
    expect(trigger.disabled).toBe(false)
    expect(root.querySelector('[data-chunk-language-hint]').textContent).not.toContain('LaterOptions')
    select.selectItem('Chinese', 'Chinese')
    fixture.detectChanges()
    await fixture.whenStable()
    expect(form.config().chunkLanguageHint).toBe('Chinese')
    form.chunkStrategy.set('parent-child')
    fixture.detectChanges()
    await fixture.whenStable()
    expect(trigger.disabled).toBe(true)
  })

  it('shows the header control only for supported Excel record documents', async () => {
    const { fixture, root } = setup()
    for (const document of [
      { type: 'xlsx', category: KBDocumentCategoryEnum.Sheet },
      { type: 'xlsx', category: KBDocumentCategoryEnum.Text },
      { type: 'csv', category: KBDocumentCategoryEnum.Sheet },
      { type: 'xlsx', category: KBDocumentCategoryEnum.Sheet, parserConfig: { transformerType: 'external' } },
      {
        type: 'xlsx',
        category: KBDocumentCategoryEnum.Sheet,
        parserConfig: { spreadsheet: { interpretation: 'form_document' } }
      }
    ]) {
      fixture.componentRef.setInput('documents', [document])
      fixture.detectChanges()
      await fixture.whenStable()
      expect(!!root.querySelector('[data-excel-header]')).toBe(
        document.type === 'xlsx' && document.category === KBDocumentCategoryEnum.Sheet && !document.parserConfig
      )
    }
  })

  it('shows all parser types for knowledgebase defaults', async () => {
    const { fixture, rows } = setup()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(rows()).toEqual(expect.arrayContaining(['pdf', 'word', 'presentation', 'excel', 'text']))
  })

  it('explains that document imports inherit the library structure while retaining the existing-document settings hint', async () => {
    const { fixture, form, root } = setup()
    form.indexStrategyLocked.set(true)
    fixture.componentRef.setInput('section', 'chunk')
    fixture.componentRef.setInput('scope', 'documents')
    fixture.detectChanges()
    await fixture.whenStable()
    const section = root.querySelector('[data-chunk-parent-child]')
    expect(section.textContent).toContain('XP.Knowledgebase.SharedProcessing.ChunkStructureInherited')
    expect(section.textContent).not.toContain('XP.Knowledgebase.SharedProcessing.ChunkStructureLocked')
    fixture.componentRef.setInput('scope', 'knowledgebase')
    fixture.detectChanges()
    expect(section.textContent).toContain('XP.Knowledgebase.SharedProcessing.ChunkStructureLocked')
  })

  it('shows only batch types, recognizes upload MIME metadata and removes obsolete rows', async () => {
    const { fixture, rows } = setup()
    fixture.componentRef.setInput('documents', [
      { type: 'pdf' },
      { type: '.PDF' },
      { type: 'vnd.openxmlformats-officedocument.wordprocessingml.document' }
    ])
    fixture.detectChanges()
    await fixture.whenStable()
    expect(rows()).toEqual(['pdf', 'word'])
    fixture.componentRef.setInput('documents', [{ mimeType: 'text/plain', name: 'misleading.pdf' }])
    fixture.detectChanges()
    await fixture.whenStable()
    expect(rows()).toEqual(['text'])
    fixture.componentRef.setInput('documents', [])
    fixture.detectChanges()
    await fixture.whenStable()
    expect(rows()).toEqual([])
  })

  it('shows parent and child controls under the switch only when enabled, and hides unused full-document fields', async () => {
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('zh-Hans', {
      XP: {
        Knowledgebase: {
          SharedProcessing: {
            ParentChild: {
              ParagraphMode: '按段落划分',
              FullMode: '全文作为父块',
              FullHelp: '将当前解析文本的完整内容作为一个父块'
            }
          }
        }
      }
    })
    translate.use('zh-Hans')
    const { fixture, root, form } = setup()
    fixture.componentRef.setInput('section', 'chunk')
    fixture.detectChanges()
    await fixture.whenStable()
    expect(root.querySelector('[data-parent-child-config]')).toBeNull()
    form.toggleParentChild(true)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(root.querySelector('[data-chunk-parent-child] [data-parent-child-config]')).not.toBeNull()
    expect(root.querySelector('[data-parent-paragraph-settings]')).not.toBeNull()
    expect(root.textContent).toContain('按段落划分')
    form.parentChild.controls.parent.controls.mode.setValue('full')
    fixture.detectChanges()
    await fixture.whenStable()
    expect(root.querySelector('[data-parent-paragraph-settings]')).toBeNull()
    expect(root.querySelector('[data-child-settings]')).not.toBeNull()
    expect(root.textContent).toContain('全文作为父块')
    expect(root.textContent).toContain('将当前解析文本的完整内容作为一个父块')
    form.toggleParentChild(false)
    fixture.detectChanges()
    expect(root.querySelector('[data-parent-child-config]')).toBeNull()
  })

  it('binds both separator tag selectors to independent draft lists and supports adding and removing custom tags', async () => {
    const { fixture, root, form } = setup()
    fixture.componentRef.setInput('section', 'chunk')
    form.toggleParentChild(true)
    fixture.detectChanges()
    await fixture.whenStable()
    const selectors = root.querySelectorAll('[data-parent-child-config] z-tag-select')
    expect(selectors).toHaveLength(2)
    const parentInput = selectors[0].querySelector('input')
    const childInput = selectors[1].querySelector('input')
    expect(parentInput).not.toBeNull()
    expect(childInput).not.toBeNull()
    for (const [input, separator] of [
      [parentInput, '|'],
      [childInput, ',']
    ] as const) {
      input.value = separator
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      fixture.detectChanges()
      await fixture.whenStable()
    }
    expect(form.config().textSplitter.parent).toMatchObject({ separators: ['\\n\\n', '|'] })
    expect(form.config().textSplitter.child).toMatchObject({ separators: ['\\n', ','] })
    expect(selectors[0].querySelectorAll('z-tag-select-chip')).toHaveLength(2)
    parentInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    fixture.detectChanges()
    await fixture.whenStable()
    expect(form.config().textSplitter.parent).toMatchObject({ separators: ['\\n\\n'] })
    expect(form.config().textSplitter.child).toMatchObject({ separators: ['\\n', ','] })
  })
})
