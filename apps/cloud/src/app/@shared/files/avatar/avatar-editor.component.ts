import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, forwardRef, inject, input, output, signal } from '@angular/core'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ScreenshotService } from '../../../@core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'


/**
 * @deprecated use EmojiAvatar
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-avatar-editor',
  templateUrl: './avatar-editor.component.html',
  styles: [``],
  imports: [CommonModule, CdkMenuModule, TranslateModule, AppearanceDirective],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => AvatarEditorComponent)
    }
  ]
})
export class AvatarEditorComponent implements ControlValueAccessor  {

  private readonly screenshotService = inject(ScreenshotService)

  readonly imageUrl = input<string>()
  readonly imageUrlChange = output<string | null>()

  readonly value = signal<string | null>(null)
  readonly disabled = signal<boolean>(false)

  private onChange: (value: string | null) => void
  private onTouched: (value: string | null) => void

  constructor() {
    effect(() => {
      this.value.set(this.imageUrl())
    }, { allowSignalWrites: true })
  }

  writeValue(obj: any): void {
    this.value.set(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled.set(isDisabled)
  }

  uploadAvatar(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    this.uploadScreenshot(file!).subscribe({
      next: (screenshot) => {
        this.value.set(screenshot.url)
        this.imageUrlChange.emit(this.value())
        this.onChange?.(this.value())
      }
    })
  }

  uploadScreenshot(fileUpload: File) {
    const formData = new FormData()
    formData.append('file', fileUpload)
    return this.screenshotService.create(formData)
  }

  remove() {
    this.value.set(null)
    this.imageUrlChange.emit(null)
    this.onChange?.(null)
  }
}
