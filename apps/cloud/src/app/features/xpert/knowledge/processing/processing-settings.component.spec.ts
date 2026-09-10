jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { of } from 'rxjs'
import { KnowledgebaseService } from '@cloud/app/@core'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
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
            getDocumentTransformerStrategies: () => of([])
          }
        }
      ]
    })
    TestBed.overrideComponent(KnowledgeProcessingSettingsComponent, {
      remove: { imports: [CopilotModelSelectComponent, JSONSchemaFormComponent, IntegrationSelectComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] }
    })
  })

  afterEach(() => TestBed.resetTestingModule())

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
