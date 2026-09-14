import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgeDocumentTag } from '@xpert-ai/contracts'
import { DocumentTagsCellComponent } from './document-tags-cell.component'

describe('document list tags', () => {
  const assignment = (tagId: string, source: 'manual' | 'automatic', isActive = true): IKnowledgeDocumentTag => ({
    documentId: 'document',
    tagId,
    source,
    tag: { id: tagId, name: tagId, isActive }
  })

  it('renders empty, mixed and historical tags with stable overflow without mutating the list response', async () => {
    await TestBed.configureTestingModule({
      imports: [DocumentTagsCellComponent, TranslateModule.forRoot()]
    }).compileComponents()
    const fixture = TestBed.createComponent(DocumentTagsCellComponent)
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent.trim()).toBe('—')
    const rows = [
      assignment('D', 'automatic'),
      assignment('B', 'automatic', false),
      assignment('C', 'automatic'),
      assignment('A', 'manual')
    ]
    fixture.componentRef.setInput('assignments', rows)
    fixture.detectChanges()
    expect(fixture.componentInstance.visible().map((tag) => tag.tagId)).toEqual(['A', 'B', 'C'])
    expect(fixture.componentInstance.remainingNames()).toBe('D')
    expect(rows.map((tag) => tag.tagId)).toEqual(['D', 'B', 'C', 'A'])
    const badges: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('z-badge')
    expect(Array.from(badges).map((e) => e.textContent.trim())).toEqual(['A', 'B', 'C', '+1'])
    expect(badges[3].title).toBe('D')
    expect(fixture.nativeElement.querySelectorAll('.ri-sparkling-line')).toHaveLength(2)
    fixture.componentRef.setInput('assignments', [])
    fixture.detectChanges()
    expect(fixture.nativeElement.textContent.trim()).toBe('—')
  })
})
