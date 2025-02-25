import { AfterViewInit, ChangeDetectorRef, Component, computed, inject, output, SecurityContext, signal } from '@angular/core'
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { EmailTemplateNameEnum, IOrganization, LanguagesMap } from '../../../../@core/types'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { isEqual } from 'lodash-es'
import { Subject, combineLatest } from 'rxjs'
import { debounceTime, distinctUntilChanged, filter, map, tap } from 'rxjs/operators'
import { EmailTemplateService, Store, ToastrService } from '../../../../@core/'
import { TranslationBaseComponent } from '../../../../@shared/language'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { EditorThemeMap } from '@metad/ocap-angular/formula'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { EmailTemplatesComponent } from '../email-templates.component'


@Component({
  standalone: true,
  imports: [
    CommonModule,
		FormsModule,
		ReactiveFormsModule,
		TranslateModule,
		
    MatButtonModule,
    MatIconModule,
		MonacoEditorModule,
		
		ButtonGroupDirective,
  ],
  selector: 'pac-email-template',
  templateUrl: './template.component.html',
  styleUrls: ['./template.component.scss']
})
export class EmailTemplateComponent extends TranslationBaseComponent implements AfterViewInit {

  readonly homeComponent = inject(EmailTemplatesComponent)

  // Outputs
  readonly closed = output<void>()

  // Signals
  readonly languageCode = computed(() =>
    this.homeComponent.languageCodes()[0]
  )
  readonly name = computed(() =>
    this.homeComponent.name()
  )
  
  previewSubject: SafeHtml
  organization: IOrganization

  templateNames: ISelectOption[] = Object.values(EmailTemplateNameEnum).map((name) => ({ key: name, caption: name }))
  subject$: Subject<any> = new Subject()

  readonly form: FormGroup = EmailTemplateComponent.buildForm(this.fb)
  static buildForm(fb: FormBuilder): FormGroup {
    return fb.group({
      // name: [EmailTemplateNameEnum.WELCOME_USER],
      // languageCode: [LanguagesEnum.English],
      subject: ['', [Validators.required, Validators.maxLength(60)]],
      mjml: ['', Validators.required]
    })
  }

  readonly theme = toSignal(this.store.primaryTheme$.pipe(map((theme) => EditorThemeMap[theme])))

  readonly previewEmail = signal<SafeHtml>(null)

  private _templateSub = this.subject$
    .pipe(
      debounceTime(500),
      tap(() => this.getTemplate()),
      takeUntilDestroyed()
    )
    .subscribe()

  private _selectedOrganizationSub = combineLatest([this.store.selectedOrganization$, this.store.preferredLanguage$])
    .pipe(
      distinctUntilChanged(isEqual),
      filter(([organization, language]) => !!language),
      tap(([organization, language]) => {
        this.organization = organization
        this.form.patchValue({ languageCode: LanguagesMap[language] ?? language })
      }),
      tap(() => this.subject$.next(true)),
	  takeUntilDestroyed()
    )
    .subscribe()
  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly store: Store,
    private readonly fb: FormBuilder,
    private readonly toastrService: ToastrService,
    private readonly emailTemplateService: EmailTemplateService,
    private _cdr: ChangeDetectorRef
  ) {
    super()

  }

  ngAfterViewInit() {
    this.form
      .get('subject')
      .valueChanges.pipe(debounceTime(1000), distinctUntilChanged())
      .subscribe((value) => {
        this.onSubjectChange(value)
      })
    this.form
      .get('mjml')
      .valueChanges.pipe(debounceTime(1000), distinctUntilChanged())
      .subscribe((value) => {
        this.onEmailChange(value)
      })

    const editorOptions = {
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      printMargin: false,
      showLineNumbers: true,
      tabSize: 2
    }

    // this.emailEditor.getEditor().setOptions(editorOptions);
    // this.subjectEditor
    // 	.getEditor()
    // 	.setOptions({ ...editorOptions, maxLines: 2 });
  }

  async getTemplate() {
    try {
      const { tenantId } = this.store.user
      const { id: organizationId } = this.organization ?? {}
      const languageCode = this.languageCode()
      const name = this.name()
      // const { languageCode = LanguagesEnum.English, name = EmailTemplateNameEnum.WELCOME_USER } = this.form.value
      const result = await this.emailTemplateService.getTemplate({
        languageCode,
        name,
        organizationId,
        tenantId
      })

      this.form.patchValue({
        subject: result.subject,
        mjml: result.template
      })
      this.form.markAsPristine()
      const { html: email } = await this.emailTemplateService.generateTemplatePreview(result.template)
      const { html: subject } = await this.emailTemplateService.generateTemplatePreview(result.subject)
      this.previewEmail.set(this.sanitizer.bypassSecurityTrustHtml(email))

      this.previewSubject = this.sanitizer.sanitize(SecurityContext.HTML, subject)
    } catch (error) {
      this.form.patchValue({
        subject: '',
        mjml: ''
      })
      this.form.markAsPristine()
      this.toastrService.danger(error)
    }
  }

  async onSubjectChange(code: string) {
    // this.form.get('subject').setValue(code);
    const { html } = await this.emailTemplateService.generateTemplatePreview(code)
    this.previewSubject = this.sanitizer.bypassSecurityTrustHtml(html)
    this._cdr.detectChanges()
  }

  async onEmailChange(code: string) {
    // this.form.get('mjml').setValue(code);
    const { html } = await this.emailTemplateService.generateTemplatePreview(code)
    this.previewEmail.set(this.sanitizer.bypassSecurityTrustHtml(html))
    this._cdr.detectChanges()
  }

  selectedLanguage(event) {
    this.form.patchValue({
      languageCode: event.code
    })
  }

  async submitForm() {
    try {
      const { tenantId } = this.store.user
      const { id: organizationId } = this.organization ?? {}
      await this.emailTemplateService.saveEmailTemplate({
        ...this.form.value,
        name: this.name(),
        languageCode: this.languageCode(),
        organizationId,
        tenantId
      })

      this.form.markAsPristine()
      this._cdr.detectChanges()

      this.toastrService.success('TOASTR.MESSAGE.EMAIL_TEMPLATE_SAVED', {
        templateName: this.getTranslation('EMAIL_TEMPLATES_PAGE.TEMPLATE_NAMES.' + this.name()),
        Default: 'Email Template saved'
      })
    } catch (error) {
      this.toastrService.danger(error)
    }
  }

  close() {
    this.closed.emit()
  }
}
