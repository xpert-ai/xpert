import { ChangeDetectorRef, Directive, HostBinding, HostListener } from '@angular/core'
import { ZardDialogService } from '@xpert-ai/headless-ui'
// import { NxScaleChromaticService } from './scale-chromatic.service'

@Directive({
  selector: '[nxScaleChromatic]',
  standalone: false,
})
export class NxScaleChromaticDirective {
  constructor(
    // @Inject(NX_SCALE_CHROMATIC)
    // public scaleChromaticService: NxScaleChromaticService,
    public dialog: ZardDialogService,
    private _cdr: ChangeDetectorRef
  ) {}

  @HostBinding('style.cursor') styleCursor = 'pointer'

  @HostListener('click', ['$event'])
  onClick(event) {

    // const dialogRef = this.dialog.open(NxChromaticDialogComponent, {
    //   data: {
    //     scaleChromaticService: this.scaleChromaticService,
    //   },
    // })

    // dialogRef.afterClosed().subscribe((result) => {
    //   this._cdr.markForCheck()
    //   this._cdr.detectChanges()
    // })

    // this.dialogService
    //   .open(NxScaleChromaticComponent, {
    //     context: {
    //       scaleChromaticService: this.scaleChromaticService,
    //     },
    //     autoFocus: false,
    //   })
    //   .onClose.subscribe(() => {

    //   })
  }
}
