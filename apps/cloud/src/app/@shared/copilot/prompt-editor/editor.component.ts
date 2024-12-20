import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, model, numberAttribute, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmHighlightVarDirective } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotPromptGeneratorComponent } from '../prompt-generator/generator.component'

@Component({
  selector: 'copilot-prompt-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CdkMenuModule, FormsModule, TranslateModule, MatTooltipModule, NgmHighlightVarDirective],
})
export class CopilotPromptEditorComponent {

  readonly #dialog = inject(MatDialog)

  readonly regex = `{{(.*?)}}`

  readonly initHeight = input<number, number | string>(210, {
    transform: numberAttribute
  })
  readonly tooltip = input<string>()

  readonly prompt = model<string>()
  readonly promptLength = computed(() => this.prompt()?.length)


  height = this.initHeight();
  private isResizing = false;
  private startY = 0;
  private startHeight = 0;

  constructor() {
    effect(() => {
      if (this.initHeight()) {
        this.height = this.initHeight()
      }
    })
  }

  generate() {
    this.#dialog.open(CopilotPromptGeneratorComponent, {
        panelClass: 'large'
    }).afterClosed().subscribe({
      next: (result) => {
        if (result) {
          this.prompt.set(result)
        }
      }
    })
  }

  onPromptChange(editor: HTMLDivElement) {
    // console.log(editor.innerHTML)
    // console.log(formatInnerHTML(editor.innerHTML))
    this.prompt.set(formatInnerHTML(editor.innerHTML))
  }

  onMouseDown(event: MouseEvent): void {
    this.isResizing = true;
    this.startY = event.clientY;
    this.startHeight = this.height;
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isResizing) {
      const offset = event.clientY - this.startY;
      this.height = this.startHeight + offset;
      if (this.height < 50) this.height = 50; // 设置最小高度
      event.preventDefault();
    }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false;
  }
}

function formatInnerHTML(htmlContent: string) {
  // Step 1: 处理段落 <p> 标签并替换为换行符
  let formattedText = htmlContent
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n') // 替换段落间的换行
    .replace(/<br\s*\/?>/gi, '\n') // 替换 <br> 标签为换行
    .replace(/<\/?p[^>]*>/gi, '') // 移除 <p> 标签
    .replace(/<\/?span[^>]*>/gi, '') // 移除 <span> 标签
    .replace(/<mark[^>]*>(.*?)<\/mark>/gi, '$1') // 保留 <mark> 内的内容
    .replace(/<div[^>]*>/gi, '') // 移除 <div> 标签及带 class 的 <div> 标签
    .replace(/<\/div>/gi, '\n') // 将 </div> 替换成换行符

  // // Step 2: 替换 HTML 转义字符
  // formattedText = formattedText.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

  // Step 3: 返回转换后的文本内容
  return formattedText
}
