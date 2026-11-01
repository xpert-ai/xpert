import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { PreviewFileActivityComponent } from './file-activity.component'
import en from '../../../../../assets/i18n/en-US.json'
import zh from '../../../../../assets/i18n/zh-Hans.json'

const base = { version: 1, receiptId: 'receipt', toolCallId: 'tool', updatedAt: '2026-10-29T00:00:00.000Z' }
describe('preview file receipts', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PreviewFileActivityComponent, TranslateModule.forRoot()]
    }).compileComponents()
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('en', en)
    translate.setTranslation('zh', zh)
  })
  it.each([
    ['en', 'File changes', 'Files delivered'],
    ['zh', '文件变更', '文件已交付']
  ])('renders historical and streamed receipts in %s', (lang, changes, delivered) => {
    TestBed.inject(TranslateService).use(lang)
    const fixture = TestBed.createComponent(PreviewFileActivityComponent)
    const set = (data: object) => {
      fixture.componentRef.setInput('content', { id: 'receipt', type: 'file_activity', data })
      fixture.detectChanges()
    }
    set({
      ...base,
      kind: 'changes',
      coverage: 'bounded',
      fileChanges: [{ id: 'f', title: '结果', workspacePath: '/result.json', operation: 'added', coverage: 'observed' }]
    })
    expect(fixture.nativeElement.textContent).toContain(changes)
    expect(fixture.nativeElement.textContent).toContain('/result.json')
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeNull()
    set({
      ...base,
      kind: 'delivery',
      status: 'success',
      outputs: [
        {
          id: 'out',
          kind: 'file',
          title: 'result.json',
          status: 'success',
          resource: { type: 'workspace_file', workspacePath: '/result.json' }
        }
      ]
    })
    expect(fixture.nativeElement.textContent).toContain(delivered)
    set({ ...base, kind: 'delivery', status: 'error', error: 'Delivery unavailable' })
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Delivery unavailable')
  })
  it('reports malformed receipts without rendering untrusted markup', () => {
    TestBed.inject(TranslateService).use('en')
    const fixture = TestBed.createComponent(PreviewFileActivityComponent)
    fixture.componentRef.setInput('content', { type: 'file_activity', data: { kind: 'changes' } })
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain('Invalid file activity receipt')
  })
})
