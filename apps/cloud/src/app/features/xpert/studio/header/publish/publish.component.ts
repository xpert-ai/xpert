import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { nonBlank, SlideUpAnimation } from '@metad/core'
import { injectConfirm, injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getErrorMessage, IXpert, ToastrService, TSelectOption, XpertAPIService } from '@cloud/app/@core'
import { Observable, of, switchMap } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { XpertService } from '../../../xpert/xpert.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    TranslateModule,
    MatSlideToggleModule,
    MatTooltipModule,
    NgmSpinComponent,
    NgmSelectComponent
  ],
  selector: 'xpert-publish',
  templateUrl: './publish.component.html',
  styleUrl: 'publish.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [SlideUpAnimation]
})
export class XpertPublishVersionComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertAPI = inject(XpertAPIService)
  readonly xpertService = inject(XpertService)
  readonly confirmDelete = injectConfirmDelete()
  readonly confirm = injectConfirm()
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)

  readonly xpert = this.studioService.team
  readonly latest = computed(() => this.xpert()?.latest)
  readonly version = computed(() => this.xpert()?.version)
  readonly versions = computed(() => {
    const versions = this.studioService.versions()?.filter(nonBlank)
    const compareVersion = (a: string, b: string) => {
      const as = (a || '').split('.').map((v) => Number(v))
      const bs = (b || '').split('.').map((v) => Number(v))
      const len = Math.max(as.length, bs.length)
      for (let i = 0; i < len; i++) {
        const av = as[i] ?? 0
        const bv = bs[i] ?? 0
        if (av !== bv) {
          return bv - av
        }
      }
      return 0
    }
    return versions?.sort((a, b) => compareVersion(a.version, b.version))
  })

  readonly newVersion = model(false)
  readonly releaseNotes = model('')
  readonly releaseNotesError = computed(() => {
    if (!this.releaseNotes()) {
      return this.#translate.instant('PAC.Xpert.AddReleaseNotes', {Default: 'Add release notes'})
    } else if (this.releaseNotes().trim().length < 10) {
      return this.#translate.instant('PAC.Xpert.ReleaseNotesLess', {Default: 'Release notes too less'})
    }
    return null
  })

  readonly environments = computed(() => {
    return this.studioService.environments()?.map((env) => {
      return {
        value: env.id,
        label: env.name
      } as TSelectOption
    })
  })

  readonly environmentId = model<string>(this.xpert().environmentId)

  readonly loading = signal(false)

  close() {
    this.#dialogRef.close()
  }

  setAsLatest(xpert: Partial<IXpert>) {
    this.loading.set(true)
    this.confirm({
      title: this.#translate.instant('PAC.Xpert.SetAsLatest', {Default: 'Set as latest'}),
      information: this.#translate.instant('PAC.Xpert.LatestDefaultVersion', {Default: 'Set this version as the latest, the default version when opening Digital Expert'})
    }, this.xpertAPI.setAsLatest(xpert.id))
    .subscribe({
      next: () => {
        this.loading.set(false)
        this.studioService.refresh()
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  deleteVer(xpert: Partial<IXpert>) {
    this.loading.set(true)
    this.confirmDelete({
      value: 'v' + xpert.version,
      information: this.#translate.instant('PAC.Xpert.DeleteThisVersion', {Default: 'Deleting this version will not affect the use of other versions'})
    }, this.xpertAPI.delete(xpert.id))
    .subscribe({
      next: () => {
        this.loading.set(false)
        if (xpert.id === this.xpert().id) {
          this.studioService.gotoWorkspace()
        } else {
          this.studioService.refresh()
          this.#toastr.success(
            `PAC.Xpert.DeletedSuccessfully`,
            { Default: 'Deleted successfully' },
            `v${xpert.version}`
          )
        }
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  publish() {
    this.loading.set(true)
    // Check if the draft has been saved
    const obser: Observable<any> = this.studioService.unsaved() ? this.studioService.saveDraft() : of(true)
    obser.pipe(switchMap(() => this.xpertAPI.publish(this.xpert().id, this.newVersion(), {
      environmentId: this.environmentId(), releaseNotes: this.releaseNotes()}))).subscribe({
      next: (result) => {
        this.#toastr.success(
          `PAC.Xpert.PublishedSuccessfully`,
          { Default: 'Published successfully' },
          `v${result.version}`
        )
        this.loading.set(false)
        this.studioService.refresh()
        this.xpertService.published$.next(result)
        this.close()
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }
}
