import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { UsersService } from '@metad/cloud/state'
import { NgmSpinComponent, NgmStepperComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr, IUserUpdateInput } from '../../../@core'
import { FilesUploadComponent, UploadFile } from '../../files'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    FilesUploadComponent,
    NgmStepperComponent,
    NgmTableComponent,
    NgmSpinComponent
  ],
  selector: 'user-upload',
  templateUrl: 'upload.component.html',
  styleUrls: ['upload.component.scss']
})
export class UserUploadComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly userService = inject(UsersService)
  readonly #toastr = injectToastr()

  readonly step = model<number>(1)

  readonly steps = [
    {
      title: {
        en_US: 'Upload files',
        zh_Hans: '上传文件'
      },
    },
    {
      title: {
        en_US: 'Save',
        zh_Hans: '保存'
      },
    }
  ]

  fileList: UploadFile[] = []

  readonly users = signal<IUserUpdateInput[]>([])

  readonly loading = signal(false)

  async onFileListChange(files: FileList) {
    for (let i = 0; i < files.length; i++) {
      await this.readDataFile(files[i])
    }

    this.step.update((i) => ++i)
  }

  removeFiles(files: UploadFile[]) {
    for (const item of files) {
      const index = this.fileList.indexOf(item)
      this.fileList.splice(index, 1)
      this.fileList = [...this.fileList]
    }
  }

  async readDataFile(file: File) {
    // Upload file to backend for encoding detection and parsing
    this.loading.set(true)
    try {
      const users = await firstValueFrom(this.userService.uploadAndParseCsv(file))
      if (users && users.length > 0) {
        this.users.update((existingUsers) => [...existingUsers, ...users])
      }
    } catch (err) {
      this.#toastr.error(getErrorMessage(err))
    } finally {
      this.loading.set(false)
    }
  }

  save() {
    this.loading.set(true)
    this.userService.createBulk(this.users()).subscribe({
      next: (users) => {
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved Successfully' })
        this.#dialogRef.close(users)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  downloadTempl() {
    const csvContent = 'username,email,hash,firstName,lastName,roleName,thirdPartyId\r\n';
    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  close() {
    this.#dialogRef.close()
  }
}
