import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { HttpEvent, HttpResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Subject } from 'rxjs'
import { IStorageFile, StorageFileService, ToastrService } from '../../../@core'
import { FilesUploadDialogComponent } from './upload.component'

describe('FilesUploadDialogComponent', () => {
  afterEach(() => TestBed.resetTestingModule())

  function setup() {
    const events = new Subject<HttpEvent<IStorageFile>>()
    const uploadFile = jest.fn(() => events)
    const close = jest.fn()
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: {} },
        { provide: DialogRef, useValue: { close } },
        { provide: StorageFileService, useValue: { uploadFile } },
        { provide: ToastrService, useValue: {} }
      ]
    })
    return {
      component: TestBed.runInInjectionContext(() => new FilesUploadDialogComponent()),
      events,
      uploadFile,
      close
    }
  }

  it('retains the busy state until completion and prevents duplicate uploads', async () => {
    const { component, events, uploadFile, close } = setup()
    component.fileList = [{ file: new File(['sample'], 'sample.txt') }]
    await component.upload()
    await component.upload()
    expect(component.loading()).toBe(true)
    expect(uploadFile).toHaveBeenCalledTimes(1)
    const stored = { id: 'stored-file', originalName: 'sample.txt' } as IStorageFile
    events.next(new HttpResponse({ body: stored }))
    expect(close).not.toHaveBeenCalled()
    events.complete()
    expect(component.loading()).toBe(false)
    expect(close).toHaveBeenCalledWith([stored])
  })

  it('does not submit an empty file list and cancels through the CDK ref', async () => {
    const { component, uploadFile, close } = setup()
    await component.upload()
    expect(uploadFile).not.toHaveBeenCalled()
    component.close()
    expect(close).toHaveBeenCalledWith()
  })
})
