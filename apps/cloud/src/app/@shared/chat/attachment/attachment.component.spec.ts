import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { StorageFileService } from '@cloud/app/@core'
import { of } from 'rxjs'
import { ChatAttachmentComponent } from './attachment.component'

describe('ChatAttachmentComponent', () => {
  it('deletes uploaded AgentFile attachments by StorageFile id', async () => {
    const deleteSpy = jest.fn().mockReturnValue(of(null))

    await TestBed.configureTestingModule({
      imports: [ChatAttachmentComponent],
      providers: [
        {
          provide: StorageFileService,
          useValue: {
            delete: deleteSpy
          }
        },
        {
          provide: Dialog,
          useValue: {
            open: jest.fn()
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ChatAttachmentComponent)
    fixture.componentRef.setInput('deletable', true)
    fixture.componentInstance.storageFile.set({
      id: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      fileId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      storageFileId: '89d94277-097f-4b9d-ad02-8e1ddab03487',
      originalName: 'resume.pdf'
    })
    fixture.detectChanges()

    fixture.componentInstance.delete()

    expect(deleteSpy).toHaveBeenCalledWith('89d94277-097f-4b9d-ad02-8e1ddab03487')
  })

  it('does not delete FileAsset-only attachments by FileAsset id', async () => {
    const deleteSpy = jest.fn().mockReturnValue(of(null))

    await TestBed.configureTestingModule({
      imports: [ChatAttachmentComponent],
      providers: [
        {
          provide: StorageFileService,
          useValue: {
            delete: deleteSpy
          }
        },
        {
          provide: Dialog,
          useValue: {
            open: jest.fn()
          }
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ChatAttachmentComponent)
    fixture.componentRef.setInput('deletable', true)
    fixture.componentInstance.storageFile.set({
      id: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      fileId: 'b1dd2538-f5b4-4616-aedb-a76aa2df601a',
      originalName: 'resume.pdf'
    })
    fixture.detectChanges()

    fixture.componentInstance.delete()

    expect(deleteSpy).not.toHaveBeenCalled()
  })
})
