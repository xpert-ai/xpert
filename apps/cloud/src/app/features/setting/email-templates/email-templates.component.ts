import {
  ZardButtonComponent,
  ZardBadgeComponent,
  ZardComboboxComponent,
  ZardTableImports,
  XpDialogFrameImports,
  ZardSegmentedComponent,
  ZardIconComponent
} from '@xpert-ai/headless-ui'

import {
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  TemplateRef,
  ViewContainerRef,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { map, switchMap } from 'rxjs/operators'
import { EmailTemplateNameEnum } from '../../../@core/types'
import { EmailTemplateService, injectToastr, LanguagesService } from '../../../@core/services'
import { groupBy } from 'lodash-es'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { injectOrganization } from '@cloud/app/@core/state'
import { LanguagesEnum } from '@xpert-ai/contracts'
import { EmailTemplateComponent } from './template/template.component'

import { BehaviorSubject, forkJoin } from 'rxjs'

@Component({
  standalone: true,
  host: { class: 'w-full min-w-0' },
  imports: [
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardIconComponent,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardComboboxComponent,
    ...ZardTableImports,
    ZardSegmentedComponent,
    EmailTemplateComponent,
    ...XpDialogFrameImports
  ],
  templateUrl: './email-templates.component.html',
  styleUrls: ['./email-templates.component.scss']
})
export class EmailTemplatesComponent {
  readonly emailTemplateService = inject(EmailTemplateService)
  readonly languagesService = inject(LanguagesService)
  readonly #dialog = inject(Dialog)
  readonly #viewContainerRef = inject(ViewContainerRef)
  readonly #toastr = injectToastr()
  readonly organization = injectOrganization()

  // States
  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly emailTemplates = toSignal(
    this.refresh$.pipe(switchMap(() => this.emailTemplateService.getAllInOrg().pipe(map(({ items }) => items))))
  )
  readonly allLanguages = toSignal(
    this.refresh$.pipe(switchMap(() => this.languagesService.getAll().pipe(map(({ items }) => items))))
  )

  readonly langGroup = computed(() => {
    const languages = groupBy(this.emailTemplates(), 'languageCode')
    return languages
  })
  readonly languageOptions = computed(() => {
    const allLanguages = this.allLanguages()
    const languages = this.langGroup()
    return Object.keys(languages).map((l) => ({
      value: l,
      label: allLanguages?.find((_) => _.code === l)?.name ?? l
    }))
  })

  readonly newTempl = viewChild('newTempl', { read: TemplateRef })

  readonly languageCodes = model([LanguagesEnum.English])
  get languageCode() {
    return this.languageCodes()[0]
  }
  set languageCode(value: LanguagesEnum) {
    this.languageCodes.set([value])
  }
  readonly name = model<EmailTemplateNameEnum>(null)

  readonly templates = computed(() => {
    const items = this.langGroup()[this.languageCodes()[0]]
    if (!items) {
      return null
    }

    const g = groupBy(
      items.map((item) => ({
        ...item,
        name: item.name.split('/')[0],
        type: item.name.split('/')[1]
      })),
      'name'
    )
    return Object.keys(g).map((name) => ({
      name: name as EmailTemplateNameEnum,
      html: g[name].find((_) => _.type === 'html'),
      subject: g[name].find((_) => _.type === 'subject')
    }))
  })

  readonly templateNames = signal(
    Object.values(EmailTemplateNameEnum).map((name) => ({
      key: name,
      caption: name
    }))
  )

  readonly newLanguageOptions = computed(() =>
    (this.allLanguages() ?? []).map((language) => ({ value: language.code, label: language.name }))
  )
  readonly newTemplateOptions = computed(() =>
    this.templateNames().map((template) => ({ value: template.key, label: template.caption }))
  )

  readonly opened = signal(false)

  private dialogRef: DialogRef = null

  constructor() {
    effect(() => {
      // console.log(this.languageCodes())
    })
  }

  newEmailTemplate() {
    this.dialogRef = this.#dialog.open(this.newTempl(), {
      viewContainerRef: this.#viewContainerRef,
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
      ariaLabelledBy: 'new-email-template-title'
    })

    // Apply centering as soon as the template is attached, before the deferred render hook.
    this.dialogRef.overlayRef.updatePosition()
  }

  closeNewTemplate() {
    this.dialogRef?.close()
  }

  async create() {
    this.opened.set(true)
    this.dialogRef.close()

    // try {
    //   await this.emailTemplateService.saveEmailTemplate({
    //     name: this.name(),
    //     languageCode: this.languageCodes()[0],
    //     mjml: null,
    //     subject: null
    //   })

    //   this.opened.set(true)
    // } catch(err) {
    //   this.#toastr.error(getErrorMessage(err))
    // }
  }

  open(name: EmailTemplateNameEnum) {
    this.name.set(name)
    this.opened.set(true)
  }

  edit(name: EmailTemplateNameEnum) {
    this.name.set(name)
    this.opened.set(true)
  }

  delete(item) {
    forkJoin([
      this.emailTemplateService.delete(item.subject.id),
      this.emailTemplateService.delete(item.html.id)
    ]).subscribe({
      next: () => this.refresh$.next(),
      error: () => this.#toastr.error('TOASTR.MESSAGE.ERRORS')
    })
  }

  close() {
    this.opened.set(false)
    this.refresh$.next()
  }
}
