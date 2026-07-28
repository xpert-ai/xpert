import { Directive, TemplateRef } from '@angular/core'

/** Decorates the `ng-template` tags and reads out the template from it. */
@Directive({
  standalone: true,
  selector: '[xpOptionContent]'
})
export class XpOptionContent {
  constructor(/** Content for the option. */ public template: TemplateRef<any>) {}
}
