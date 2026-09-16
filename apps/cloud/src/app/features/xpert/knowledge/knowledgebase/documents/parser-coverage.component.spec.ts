import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import en from '../../../../../../assets/i18n/en.json'
import enUs from '../../../../../../assets/i18n/en-US.json'
import zhHans from '../../../../../../assets/i18n/zh-Hans.json'
import zhCn from '../../../../../../assets/i18n/zh-CN.json'
import zhHant from '../../../../../../assets/i18n/zh-Hant.json'
import { ParserCoverageComponent } from './parser-coverage.component'

const english = {
  incomplete: 'Completed with image recognition errors',
  failed: '2 image(s) could not be recognized.',
  skipped: '1 image(s) were skipped.',
  coverage: 'Completed with unrecognized content',
  pages: 'page(s) 2, 4'
}
const simplifiedChinese = {
  incomplete: '完成，但图片识别有失败',
  failed: '有 2 张图片未能识别',
  skipped: '已跳过 1 张图片。',
  coverage: '完成，但有内容未识别',
  pages: '第 2, 4 页'
}
const traditionalChinese = {
  incomplete: '完成，但圖片識別有失敗',
  failed: '有 2 張圖片未能識別',
  skipped: '已略過 1 張圖片。',
  coverage: '完成，但有內容未識別',
  pages: '第 2, 4 頁'
}

describe.each([
  { language: 'en', resources: en, text: english },
  { language: 'en-US', resources: enUs, text: english },
  { language: 'zh-Hans', resources: zhHans, text: simplifiedChinese },
  { language: 'zh-CN', resources: zhCn, text: simplifiedChinese },
  { language: 'zh-Hant', resources: zhHant, text: traditionalChinese }
])('document parsing notices in $language', ({ language, resources, text }) => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ParserCoverageComponent, TranslateModule.forRoot()] })
    const translate = TestBed.inject(TranslateService)
    translate.setTranslation(language, resources)
    translate.use(language)
  })

  it('shows failed image understanding on the completed status and details', () => {
    const fixture = TestBed.createComponent(ParserCoverageComponent)
    fixture.componentRef.setInput('warnings', [
      { type: 'image_understanding_failed', message: 'Model unavailable', assetCount: 2 }
    ])
    fixture.componentRef.setInput('compact', true)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('z-badge').textContent.trim()).toBe(text.incomplete)
    fixture.componentRef.setInput('compact', false)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain(text.failed)
    expect(fixture.nativeElement.textContent).toContain('Model unavailable')
    expect(fixture.nativeElement.textContent).not.toContain('XP.Knowledgebase.')
    expect(fixture.nativeElement.textContent).not.toContain('{{')
  })

  it('reports skipped placeholders in details without marking recognition failed', () => {
    const fixture = TestBed.createComponent(ParserCoverageComponent)
    fixture.componentRef.setInput('warnings', [{ type: 'image_understanding_skipped', message: 'Skipped 1×1' }])
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain(text.skipped)
    expect(fixture.nativeElement.textContent).not.toContain(text.failed)
    expect(fixture.nativeElement.textContent).not.toContain('XP.Knowledgebase.')
    fixture.componentRef.setInput('compact', true)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('z-badge')).toBeNull()
  })

  it('retains page coverage notices alongside image failures', () => {
    const fixture = TestBed.createComponent(ParserCoverageComponent)
    fixture.componentRef.setInput('diagnostics', {
      schemaVersion: 1,
      pages: [
        { page: 4, status: 'needs-ocr', imagePaths: ['page4.png'] },
        { page: 2, status: 'needs-ocr', imagePaths: ['page2.png'] }
      ]
    })
    fixture.componentRef.setInput('warnings', [
      { type: 'image_understanding_failed', message: 'Model unavailable', assetCount: 2 }
    ])
    fixture.componentRef.setInput('compact', true)
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('z-badge').textContent.trim()).toBe(text.coverage)
    fixture.componentRef.setInput('compact', false)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent).toContain(text.pages)
    expect(fixture.nativeElement.textContent).toContain(text.failed)
    expect(fixture.nativeElement.textContent).not.toContain('XP.Knowledgebase.')
    expect(fixture.nativeElement.textContent).not.toContain('{{')
  })
})
