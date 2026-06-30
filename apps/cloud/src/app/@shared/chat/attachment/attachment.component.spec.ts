import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { StorageFileService } from '@cloud/app/@core'
import { of } from 'rxjs'
import { ChatAttachmentComponent } from './attachment.component'

jest.mock('@cloud/app/@core', () => ({
  StorageFileService: class StorageFileService {}
}))

jest.mock('@cloud/app/@core/types', () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error))
}))

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

  it('renders persisted image attachments from fileUrl', async () => {
    const imageUrl = 'data:image/png;base64,YWJj'

    await TestBed.configureTestingModule({
      imports: [ChatAttachmentComponent],
      providers: [
        {
          provide: StorageFileService,
          useValue: {}
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
    fixture.componentInstance.storageFile.set({
      fileUrl: imageUrl,
      originalName: 'photo.png',
      mimetype: 'image/png'
    })
    fixture.detectChanges()

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement | null

    expect(image?.getAttribute('src')).toBe(imageUrl)
  })
})
