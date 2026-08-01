import { OverlayModule } from '@angular/cdk/overlay'
import { PortalModule } from '@angular/cdk/portal'

import { ZardSheetComponent } from './sheet.component'

export const ZardSheetImports = [ZardSheetComponent, OverlayModule, PortalModule] as const
