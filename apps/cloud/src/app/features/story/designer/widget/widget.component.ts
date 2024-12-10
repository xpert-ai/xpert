import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, forwardRef, inject } from '@angular/core'
import {
  ControlValueAccessor,
  FormBuilder,
  FormControl,
  FormsModule,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule
} from '@angular/forms'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { MtxColorpickerModule } from '@ng-matero/extensions/colorpicker'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { ComponentStyling } from '@metad/story/core'
import { debounceTime, distinctUntilChanged, firstValueFrom, map } from 'rxjs'
import { IScreenshot, ScreenshotService, ToastrService, listAnimation } from '../../../../@core'
import { MaterialModule } from '../../../../@shared/material.module'
import { ColorInputComponent } from '../color-input/color-input.component'
import { ImageUploadComponent } from '../image-upload/image-upload.component'
import { ClipboardModule } from '@angular/cdk/clipboard'
import { sortBy } from 'lodash-es'
import { NgmInputComponent, NgmSliderInputComponent } from '@metad/ocap-angular/common'
import { BackdropFilterEnum, FilterEnum } from '@metad/core'
import { DesignerTextComponent } from '../text/text.component'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MaterialModule,
    FormlyModule,
    ClipboardModule,
    ButtonGroupDirective,

    MtxColorpickerModule,
    AppearanceDirective,
    DensityDirective,
    NgmSliderInputComponent,
    ColorInputComponent,
    ImageUploadComponent,
    NgmInputComponent,
    DesignerTextComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-designer-widget',
  templateUrl: './widget.component.html',
  styleUrls: ['./widget.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => DesignerWidgetComponent)
    }
  ],
  animations: [listAnimation]
})
export class DesignerWidgetComponent implements ControlValueAccessor {
  private readonly screenshotService = inject(ScreenshotService)
  private readonly formBuilder = inject(FormBuilder)
  private readonly _cdr = inject(ChangeDetectorRef)
  private readonly toastrService = inject(ToastrService)
  
  borderImages = []
  PresetBorderImages = [
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/border_1.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/border_2.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_1.png'
      },
      borderImageSlice: 10
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_2.png'
      },
      borderImageSlice: 10
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_3.png'
      },
      borderImageSlice: 10
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_4.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_5.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_6.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_7.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_8.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_9.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/blue_10.png'
      },
      borderImageSlice: 20
    },
    {
      borderWidth: 10,
      borderImageObj: {
        url: '/assets/images/border/dark_1.png'
      },
      borderImageSlice: 20
    }
  ]

  backgroundImages = []
  PresetBackgroundImages = [
    {
      backgroundImageObj: {
        url: '/assets/images/bg/title_1.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/title_2.jpg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/title_3.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/title_4.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/title_5.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/head_1.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/head_2.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/head_3.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/line_2.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_1.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_2.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_3.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_4.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_5.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_6.jpg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_7.jpg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_8.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_9.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_10.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/card_map_1.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/light_1.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_1.jpg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_2.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_3.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_4.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_5.jpg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_6.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_7.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_8.jpg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_9.jpg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_10.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/bg_11.jpeg'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/kpi_1.png'
      }
    },
    {
      backgroundImageObj: {
        url: '/assets/images/bg/kpi_2.png'
      }
    }
  ]

  backdropOptions = Object.entries(BackdropFilterEnum).map(([key, value]) => ({
    value: value,
    label: key
  }))

  filterOptions = Object.entries(FilterEnum).map(([key, value]) => ({
    value: value,
    label: key
  }))

  formGroup = this.formBuilder.group<ComponentStyling>({
    padding: null,
    borderRadius: null,
    backgroundColor: null,
    backgroundImage: null,
    backgroundImageObj: null,
    backgroundSize: '100% 100%',
    backgroundRepeat: null,
    backdropFilter: null,
    borderColor: null,
    borderWidth: null,
    borderStyle: null,
    borderImageObj: null,
    borderImageSlice: null,
    shadowColor: null,
    shadowOffsetX: null,
    shadowOffsetY: null,
    shadowBlur: null,
    shadowSpread: null,
    boxShadow: null,
    color: null,
    fontSize: null,
    lineHeight: null,
    textAlign: null,
    fontFamily: null,
    fontWeight: null,
    textShadow: null,
    transform: null,
    transformOrigin: null,
    filter: null,
    opacity: null,
  })

  readonly textFormControl = new FormControl({})

  get padding() {
    return this.formGroup.get('padding').value
  }
  set padding(value) {
    this.formGroup.get('padding').setValue(value)
  }

  get borderRadius() {
    return this.formGroup.get('borderRadius').value
  }
  set borderRadius(value) {
    this.formGroup.get('borderRadius').setValue(value)
  }

  get backgroundColor() {
    return this.formGroup.get('backgroundColor') as FormControl
  }
  get backgroundImage() {
    return this.formGroup.get('backgroundImage') as FormControl
  }

  get backgroundImageObj() {
    return this.formGroup.get('backgroundImageObj') as FormControl
  }

  get enableBackgroundImage() {
    return !!this.backgroundImageObj.value
  }

  get backgroundSize() {
    return this.formGroup.get('backgroundSize') as FormControl
  }
  get backgroundRepeat() {
    return this.formGroup.get('backgroundRepeat') as FormControl
  }
  get backdropFilter() {
    return this.formGroup.get('backdropFilter') as FormControl
  }

  get borderColor() {
    return this.formGroup.get('borderColor') as FormControl
  }

  get borderWidth() {
    return this.formGroup.get('borderWidth').value
  }
  set borderWidth(value) {
    this.formGroup.get('borderWidth').setValue(value)
  }

  get borderStyle() {
    return this.formGroup.get('borderStyle') as FormControl
  }

  get borderImage() {
    return this.formGroup.get('borderImageObj') as FormControl
  }

  get enableBorderImage() {
    return !!this.borderImage.value
  }

  get borderImageSlice() {
    return this.formGroup.get('borderImageSlice').value
  }
  set borderImageSlice(value) {
    this.formGroup.get('borderImageSlice').setValue(value)
  }

  get backgroundImageUrl() {
    return this.formGroup.get('backgroundImageObj').value?.url
  }
  get borderImageUrl() {
    return this.formGroup.get('borderImageObj').value?.url
  }

  get boxShadow() {
    return this.formGroup.get('boxShadow') as FormControl
  }
  get shadowColor() {
    return this.formGroup.get('shadowColor') as FormControl
  }

  get shadowOffsetX() {
    return this.formGroup.get('shadowOffsetX') as FormControl
  }
  get shadowOffsetY() {
    return this.formGroup.get('shadowOffsetY') as FormControl
  }
  get shadowBlur() {
    return this.formGroup.get('shadowBlur') as FormControl
  }
  get shadowSpread() {
    return this.formGroup.get('shadowSpread') as FormControl
  }

  get hasBorderColor() {
    return this.borderColor.value
  }

  // get color() {
  //   return this.formGroup.get('color') as FormControl
  // }
  // get fontSize() {
  //   return this.formGroup.get('fontSize') as FormControl
  // }
  // get lineHeight() {
  //   return this.formGroup.get('lineHeight') as FormControl
  // }
  // get fontWeight() {
  //   return this.formGroup.get('fontWeight') as FormControl
  // }
  // get fontFamily() {
  //   return this.formGroup.get('fontFamily') as FormControl
  // }
  // get textAlign() {
  //   return this.formGroup.get('textAlign').value
  // }
  // set textAlign(value) {
  //   this.formGroup.get('textAlign').setValue(value)
  // }

  // get textShadow() {
  //   return this.formGroup.get('textShadow') as FormControl
  // }
  get transform() {
    return this.formGroup.get('transform') as FormControl
  }
  get transformOrigin() {
    return this.formGroup.get('transformOrigin') as FormControl
  }
  get filter() {
    return this.formGroup.get('filter') as FormControl
  }
  get opacity() {
    return this.formGroup.get('opacity') as FormControl
  }

  customImages: IScreenshot[] = null
  customBorderImages: IScreenshot[] = null
  _customImages: IScreenshot[] = null
  showCustomImages = false
  loadingCustomImages = false

  private _onChange: (value) => void
  private _onTouched: (value) => void

  private valueSub = this.formGroup.valueChanges.pipe(debounceTime(500), distinctUntilChanged()).subscribe((value) => {
    this._onChange(value)
  })

  private textSub = this.textFormControl.valueChanges.subscribe((text) => {
    this.formGroup.patchValue(text)
  })

  writeValue(obj: any): void {
    if (obj) {
      this.formGroup.patchValue(obj)
      this.textFormControl.patchValue(obj)
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
    this._onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {}

  onBorderImage(event) {
    this.borderImage.setValue(event ? this.borderImage.value ?? {} : null)
  }

  onBackgroundImage(event) {
    this.backgroundImageObj.setValue(event ? this.backgroundImageObj.value ?? {} : null)
  }

  async onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    const screenshot = await this.uploadScreenshot(file)
    this.formGroup.patchValue({
      backgroundImageObj: screenshot
    })
    this._cdr.detectChanges()
  }

  async uploadScreenshot(fileUpload: File) {
    const formData = new FormData()
    formData.append('file', fileUpload)
    return await firstValueFrom(this.screenshotService.create(formData))
  }

  async onBorderFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0]
    const screenshot = await this.uploadScreenshot(file)
    this.formGroup.patchValue({
      borderImageObj: screenshot
    })
    this._cdr.detectChanges()
  }

  onBorderImageSelected(border) {
    this.formGroup.patchValue(border)
  }

  onBackgroundImageSelected(bgImage) {
    this.formGroup.patchValue(bgImage)
    this._cdr.detectChanges()
  }

  togglePresetBackgroundImages() {
    this.backgroundImages = this.backgroundImages.length ? [] : this.PresetBackgroundImages
  }

  togglePresetBorderImages() {
    this.borderImages = this.borderImages.length ? [] : this.PresetBorderImages
  }

  async toggleCustomImages() {
    this.showCustomImages = !this.showCustomImages
    this.customImages = this.showCustomImages ? this._customImages : []
    if (this.showCustomImages && !this.loadingCustomImages && !this._customImages) {
      this.loadingCustomImages = true
      const images = await firstValueFrom(this.screenshotService.getAll().pipe(map(({items}) => sortBy(items, 'createdAt').reverse())))
      this.loadingCustomImages = false
      this._customImages = images
      this.customImages = this._customImages
    }
    this._cdr.detectChanges()
  }

  async toggleBorderImages() {
    if (this.customBorderImages) {
      this.customBorderImages = null
    } else {
      if (!this._customImages && !this.loadingCustomImages) {
        this.loadingCustomImages = true
        const images = await firstValueFrom(this.screenshotService.getAll().pipe(map(({items}) => items)))
        this.loadingCustomImages = false
        this._customImages = images
      }
      this.customBorderImages = this._customImages
    }
    this._cdr.detectChanges()
  }

  onCopyToClipboardCopied(event) {
    this.toastrService.info({code: 'Story.Toolbar.CopiedtoClipboard', default: 'Copied to clipboard'})
  }
}


@Component({
  standalone: true,
  imports: [CommonModule, FormlyModule, TranslateModule, ReactiveFormsModule, DesignerWidgetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-formly-widget-designer',
  template: `
<!-- <div *ngIf="props?.label" class="p-4">{{props.label}}</div> -->
<pac-designer-widget class="ngm-density__compact" [formControl]="$any(formControl)"></pac-designer-widget>`,
  styles: [
    `
      :host {
        flex: 1;
        max-width: 100%;
      }
    `
  ]
})
export class PACFormlyWidgetDesignerComponent extends FieldType {

}
