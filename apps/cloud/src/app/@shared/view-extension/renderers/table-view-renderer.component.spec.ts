import { formatDate } from '@angular/common'
import { LOCALE_ID } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { TableViewRendererComponent } from './table-view-renderer.component'

describe('TableViewRendererComponent', () => {
  const text = (en_US: string, zh_Hans?: string) => ({
    en_US,
    ...(zh_Hans ? { zh_Hans } : {})
  })

  beforeEach(async () => {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), TableViewRendererComponent],
      providers: [
        {
          provide: LOCALE_ID,
          useValue: 'en-US'
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('formats datetime cells using the Angular date pipe', async () => {
    const fixture = TestBed.createComponent(TableViewRendererComponent)
    const updatedAt = '2026-04-24T08:32:32.032Z'

    fixture.componentRef.setInput('schema', {
      type: 'table',
      columns: [{ key: 'updatedAt', label: text('Updated At', '更新时间'), dataType: 'datetime' }]
    })
    fixture.componentRef.setInput('items', [{ id: 'row-1', updatedAt }])
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const rendered = fixture.nativeElement.textContent
    expect(rendered).toContain(formatDate(updatedAt, 'medium', 'en-US'))
    expect(rendered).not.toContain(updatedAt)
  })

  it('falls back to raw text when a datetime cell cannot be parsed', async () => {
    const fixture = TestBed.createComponent(TableViewRendererComponent)
    const updatedAt = 'not-a-date'

    fixture.componentRef.setInput('schema', {
      type: 'table',
      columns: [{ key: 'updatedAt', label: text('Updated At', '更新时间'), dataType: 'datetime' }]
    })
    fixture.componentRef.setInput('items', [{ id: 'row-1', updatedAt }])
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain(updatedAt)
  })
})
