import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { PptxEditorComponent } from './pptx-editor.component'

describe('PptxEditorComponent', () => {
  it('renders its empty presentation state', async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), PptxEditorComponent]
    }).compileComponents()

    const fixture = TestBed.createComponent(PptxEditorComponent)
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('XP.Files.PptxNotLoaded')
  })
})
