import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, forwardRef, inject } from '@angular/core'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { IScreenshot, ScreenshotService } from 'apps/cloud/src/app/@core'
import { firstValueFrom } from 'rxjs'
import { MaterialModule } from '../../../../@shared/material.module'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, MaterialModule, AppearanceDirective],
  // changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-image-upload',
  templateUrl: './image-upload.component.html',
  styleUrls: ['./image-upload.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => ImageUploadComponent)
    }
  ]
})
export class ImageUploadComponent implements ControlValueAccessor {
  private readonly screenshotService = inject(ScreenshotService)
  private readonly _cdr = inject(ChangeDetectorRef)
  
  @Input() backgroundSize = 'cover'
  @Input() backgroundRepeat = 'no-repeat'
  
  value: IScreenshot = null
  disabled = false

  get imageUrl() {
    return this.value?.url
  }

  private _onChange: (value) => void
  private _onTouched: (value) => void

  writeValue(obj: any): void {
    this.value = obj
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    const screenshot = await this.uploadScreenshot(file)
    this.value = screenshot
    this._cdr.detectChanges()

    this._onChange(screenshot)
  }

  async uploadScreenshot(fileUpload: File) {
    const formData = new FormData()
    formData.append('file', fileUpload)
    return await firstValueFrom(this.screenshotService.create(formData))
  }
}

@Component({
  standalone: true,
  imports: [CommonModule, FormlyModule, TranslateModule, ReactiveFormsModule, ImageUploadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-formly-image-upload',
  template: `<label class="ngm-input-label shrink-0">
      {{ props?.label }}
    </label>

    <div class="flex justify-start items-center gap-2">
      <pac-image-upload class="w-full" [formControl]="$any(formControl)"></pac-image-upload>
    </div>`,
  styles: [
    `
      :host {
        flex: 1;
        max-width: 100%;
        display: flex;
        flex-direction: column;
      }
    `
  ]
})
export class PACFormlyImageUploadComponent extends FieldType {}
