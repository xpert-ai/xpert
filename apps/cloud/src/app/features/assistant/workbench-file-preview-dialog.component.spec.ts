import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import type { WorkbenchOpenFile } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'

import { FilePreviewContentComponent } from '../../@shared/files/preview/file-preview-content.component'

import {
  WORKBENCH_FILE_PREVIEW_MAX_BYTES,
  WorkbenchFilePreviewDialogComponent
} from './workbench-file-preview-dialog.component'
import { WorkbenchPdfEvidencePreviewComponent } from './workbench-pdf-evidence-preview.component'

describe('WorkbenchFilePreviewDialogComponent', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('does not load oversized spreadsheet previews', () => {
    global.fetch = jest.fn()
    const file = {
      name: '车辆信号查询_LSJWR4095RS105767_20241228183344-241227.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 4_114_081,
      url: '/api/files/large-report.xlsx'
    } satisfies WorkbenchOpenFile
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), WorkbenchFilePreviewDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: file },
        { provide: DialogRef, useValue: { close: jest.fn() } }
      ]
    })

    const fixture = TestBed.createComponent(WorkbenchFilePreviewDialogComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.previewKind()).toBe('spreadsheet')
    expect(fixture.componentInstance.previewTooLarge()).toBe(true)
    expect(fixture.componentInstance.previewSource()).toBeNull()
    expect(fixture.componentInstance.previewError()).toBe('file-too-large')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[data-file-preview-too-large="true"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-file-preview-open-external="true"]')).toBeNull()
    expect(fixture.componentInstance.fileSizeLabel()).toBe('3.9 MB')
    expect(fixture.componentInstance.previewSizeLimitLabel()).toBe('1.0 MB')
    expect(fixture.debugElement.query(By.directive(FilePreviewContentComponent))).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-file-preview-too-large="true"] button')).not.toBeNull()
  })

  it('keeps files at the size limit previewable', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => undefined))
    const file = {
      name: 'report.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: WORKBENCH_FILE_PREVIEW_MAX_BYTES,
      url: '/api/files/report.xlsx'
    } satisfies WorkbenchOpenFile
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), WorkbenchFilePreviewDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: file },
        { provide: DialogRef, useValue: { close: jest.fn() } }
      ]
    })

    const fixture = TestBed.createComponent(WorkbenchFilePreviewDialogComponent)

    expect(fixture.componentInstance.previewTooLarge()).toBe(false)
    expect(fixture.componentInstance.previewSource()).not.toBeNull()
  })

  it('blocks oversized PDFs from opening in the preview', () => {
    const file = {
      name: 'manual.pdf',
      mimeType: 'application/pdf',
      size: 50 * 1024 * 1024,
      url: '/api/files/manual.pdf'
    } satisfies WorkbenchOpenFile
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), WorkbenchFilePreviewDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: file },
        { provide: DialogRef, useValue: { close: jest.fn() } }
      ]
    })

    const fixture = TestBed.createComponent(WorkbenchFilePreviewDialogComponent)

    expect(fixture.componentInstance.previewKind()).toBe('pdf')
    expect(fixture.componentInstance.previewTooLarge()).toBe(true)
    expect(fixture.componentInstance.previewSource()).toBeNull()
  })

  it('does not render the evidence PDF preview for oversized files', () => {
    const file = {
      name: 'evidence.pdf',
      mimeType: 'application/pdf',
      size: 50 * 1024 * 1024,
      url: '/api/files/evidence.pdf',
      evidence: {
        locator: {
          page: 1,
          box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
        }
      }
    } satisfies WorkbenchOpenFile
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), WorkbenchFilePreviewDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: file },
        { provide: DialogRef, useValue: { close: jest.fn() } }
      ]
    })

    const fixture = TestBed.createComponent(WorkbenchFilePreviewDialogComponent)
    fixture.detectChanges()

    expect(fixture.debugElement.query(By.directive(WorkbenchPdfEvidencePreviewComponent))).toBeNull()
    expect(fixture.debugElement.query(By.directive(FilePreviewContentComponent))).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-file-preview-too-large="true"]')).not.toBeNull()
  })

  it('overlays normalized evidence coordinates on image previews', () => {
    const file = {
      name: 'wiring.jpg',
      mimeType: 'image/jpeg',
      url: '/api/files/wiring.jpg',
      evidence: {
        locator: {
          page: 1,
          coordinateSpace: 'image_normalized_0_1',
          box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
        }
      }
    } satisfies WorkbenchOpenFile
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), WorkbenchFilePreviewDialogComponent],
      providers: [
        { provide: DIALOG_DATA, useValue: file },
        { provide: DialogRef, useValue: { close: jest.fn() } }
      ]
    })

    const fixture = TestBed.createComponent(WorkbenchFilePreviewDialogComponent)
    fixture.detectChanges()

    const overlay = fixture.nativeElement.querySelector(
      '[data-workbench-image-evidence-box="true"]'
    ) as HTMLElement | null
    expect(fixture.componentInstance.evidencePage()).toBe(1)
    expect(fixture.componentInstance.imageEvidenceBox()).toEqual(file.evidence.locator.box)
    expect(overlay).not.toBeNull()
    expect(overlay?.classList.contains('border-text-destructive')).toBe(true)
    expect(overlay?.classList.contains('bg-status-error-bg')).toBe(true)
    expect(overlay?.classList.contains('border-danger-500')).toBe(false)
    expect(overlay?.style.left).toBe('10%')
    expect(overlay?.style.top).toBe('20%')
    expect(overlay?.style.width).toBe('30%')
    expect(overlay?.style.height).toBe('40%')
  })
})
