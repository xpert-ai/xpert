import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal, ViewContainerRef } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getErrorMessage, IfAnimation, injectToastr, IXpert, XpertService } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertComponent } from '../xpert.component'
import { Dialog } from '@angular/cdk/dialog'
import { Router } from '@angular/router'
import { CdkConfirmDeleteComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { switchMap } from 'rxjs/operators'
import { EMPTY } from 'rxjs'
import { XpertAppComponent } from '../app/app.component'
import { XpertAPIComponent } from '../api/api.component'
import { XpertBasicComponent } from '../basic/basic.component'
import { XpertBasicDialogComponent } from 'apps/cloud/src/app/@shared/xpert'

@Component({
  selector: 'xpert-basic-manage',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    DragDropModule,

    NgmSpinComponent,
    EmojiAvatarComponent,
    XpertAppComponent,
    XpertAPIComponent
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
  animations: [IfAnimation]
})
export class XpertBasicManageComponent {
  readonly #dialog = inject(Dialog)
  readonly #translate = inject(TranslateService)
  readonly #xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly xpertComponent = inject(XpertComponent)
  readonly #viewContainerRef = inject(ViewContainerRef)

  readonly xpert = this.xpertComponent.latestXpert

  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly xpertType = computed(() => this.xpert()?.type)

  readonly loading = signal(false)

  openBasic() {
    this.#dialog.open(XpertBasicComponent, {
      viewContainerRef: this.#viewContainerRef
    }).closed.subscribe({
      next: ()=> {}
    })
  }

  delete() {
    const xpert = this.xpert()
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: xpert.title,
          information: this.#translate.instant('PAC.Xpert.DeleteAllDataXpert', {
            value: xpert.name,
            Default: `Delete all data of xpert '${xpert.name}'?`
          })
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this.#xpertService.delete(xpert.id) : EMPTY)))
      .subscribe({
        next: () => {
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully!' }, xpert.title)
          this.#router.navigate(['/xpert/w', xpert.workspaceId])
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  export(isDraft = false) {
    this.#xpertService.exportDSL(this.xpert().id, isDraft).subscribe({
      next: (result) => {
        const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xpert-${this.xpert().slug}.yaml`
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.#toastr.error(
          `PAC.Xpert.ExportFailed`,
          getErrorMessage(err)
        )
      }
    })
  }

  duplicate() {
    const xpert = this.xpertComponent.xpert()
    this.#dialog
      .open<Partial<IXpert>>(XpertBasicDialogComponent, {
        data: {
          name: xpert.name,
          avatar: xpert.avatar,
          description: xpert.description
        }
      })
      .closed.pipe(
          switchMap((basic) => {
            if (basic) {
              this.loading.set(true)
              return this.#xpertService.duplicate(this.xpert().id, {
                basic: {
                  ...basic,
                  workspaceId: this.xpert().workspaceId
                },
                isDraft: true
              })
            }
            return EMPTY
          })
        )
        .subscribe({
          next: (xpert) => {
            this.loading.set(false)
            this.#router.navigate(['/xpert/', xpert.id])
            this.#toastr.success(
              this.#translate.instant('PAC.Xpert.DuplicateSuccess', { Default: 'Duplicate successfully' })
            )
          },
          error: (err) => {
            this.loading.set(false)
            this.#toastr.error(
              this.#translate.instant('PAC.Xpert.DuplicateError', { Default: 'Failed to duplicate xpert' }) +
                ': ' +
                getErrorMessage(err)
            )
          }
        })
  }
}
