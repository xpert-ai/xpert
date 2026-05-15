import { Directive, TemplateRef } from '@angular/core'

/** Decorates the `ng-template` tags and reads out the template from it. */
@Directive({
  standalone: true,
  selector: '[ngmOptionContent]'
})
export class NgmOptionContent {
  constructor(/** Content for the option. */ public template: TemplateRef<any>) {}
}
