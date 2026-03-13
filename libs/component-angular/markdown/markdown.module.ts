import { OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ZardCardImports } from '@xpert-ai/headless-ui'
import { MarkdownTooltipComponent, MarkdownTooltipDirective } from './markdown-tooltip.directive'
import { MarkdownPipe } from './markdown.pipe'

/**
 * @deprecated
 */
@NgModule({
  declarations: [MarkdownPipe, MarkdownTooltipDirective, MarkdownTooltipComponent],
  imports: [CommonModule, OverlayModule, ...ZardCardImports],
  exports: [MarkdownPipe, MarkdownTooltipDirective, MarkdownTooltipComponent],
})
export class MarkdownModule {}
