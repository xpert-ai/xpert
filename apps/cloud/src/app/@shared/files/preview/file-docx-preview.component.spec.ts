import { TestBed } from '@angular/core/testing'
import { renderAsync } from 'docx-preview'
import { FileDocxPreviewComponent } from './file-docx-preview.component'

jest.mock('docx-preview', () => ({
  renderAsync: jest.fn().mockResolvedValue(undefined)
}))

describe('FileDocxPreviewComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders docx blobs with docx-preview', async () => {
    await TestBed.configureTestingModule({
      imports: [FileDocxPreviewComponent]
    }).compileComponents()

    const documentBlob = new Blob(['docx'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    const fixture = TestBed.createComponent(FileDocxPreviewComponent)
    const rendered = jest.fn()
    fixture.componentInstance.rendered.subscribe(rendered)
    fixture.componentRef.setInput('documentBlob', documentBlob)
    fixture.componentRef.setInput('fileName', 'proposal.docx')
    fixture.detectChanges()

    await fixture.whenStable()

    expect(renderAsync).toHaveBeenCalledWith(
      documentBlob,
      expect.any(HTMLElement),
      undefined,
      expect.objectContaining({
        breakPages: true,
        className: 'docx',
        ignoreLastRenderedPageBreak: false,
        inWrapper: true,
        useBase64URL: true
      })
    )
    expect(rendered).toHaveBeenCalledTimes(1)
  })
})
