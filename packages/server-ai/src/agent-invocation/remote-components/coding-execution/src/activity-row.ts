import { button, el, hasSelection, text } from './dom'
import { stateLabel, type Activity, type Label, type Output } from './model'
import { ReplyContent } from './reply-content'

export class ActivityRow {
    readonly element = el('article', '', 'activity-record')
    readonly details = el('details', '', 'tool-record')
    private reply: ReplyContent
    private summary = el('summary', '', 'tool-heading')
    private title = el('span', '', 'tool-title searchable')
    private status = el('span', '', 'tool-state')
    private body = el('div', '', 'tool-body')
    private input = el('pre', '', 'tool-input searchable')
    private patch = el('pre', '', 'file-patch searchable')
    private output = el('pre', '', 'command-output searchable')
    private exit = el('span', '', 'exit-code')
    private actions = el('div', '', 'output-actions')
    private more = button('', () => {
        void this.loadMore()
    })
    private expand = button('', () => {
        this.full = !this.full
        this.update(this.item, this.captured)
    })
    private copy = button('', () =>
        this.onCopy(this.captured?.text ?? (this.item.content.kind === 'tool' ? (this.item.content.output ?? '') : ''))
    )
    private notice = el('span', '', 'output-notice')
    private inputLabel = el('summary')
    private inputDetails = el('details', '', 'input-details')
    private item: Activity
    private captured?: Output
    private full = false
    private loading = false
    private appliedSeq = -1
    private appliedOutput?: Output
    private locale = ''
    constructor(
        item: Activity,
        private label: Label,
        private onLoad: (item: Activity) => Promise<Output>,
        private onCopy: (text: string) => void
    ) {
        this.item = item
        this.reply = new ReplyContent(label, onCopy)
        this.element.dataset.recordId = item.id
        this.element.tabIndex = 0
        this.summary.append(this.title, this.status)
        this.inputDetails.append(this.inputLabel, this.input)
        this.actions.append(this.exit, this.copy, this.expand, this.more, this.notice)
        this.body.append(this.inputDetails, this.patch, this.output, this.actions)
        this.details.append(this.summary, this.body)
        this.element.append(this.reply.element, this.details)
        this.details.open = item.content.kind === 'tool' && item.content.detail?.type === 'command'
        this.update(item)
    }
    update(item: Activity, captured?: Output) {
        if (hasSelection(this.element)) return false
        const locale = this.label('en', 'zh')
        this.item = item
        this.captured = captured
        this.appliedSeq = item.seq
        this.appliedOutput = captured
        this.locale = locale
        const c = item.content
        this.element.dataset.kind = c.kind
        this.reply.element.hidden = c.kind === 'tool'
        this.details.hidden = c.kind !== 'tool'
        if (c.kind !== 'tool') {
            this.reply.update(c.text, c.kind === 'message')
            return true
        }
        const detail = c.detail
        const changes = {
            created: this.label('Write', '写入'),
            modified: this.label('Edit', '编辑'),
            deleted: this.label('Delete', '删除'),
            reported: this.label('File', '文件')
        }
        text(
            this.title,
            detail?.type === 'command'
                ? `$ ${detail.command}`
                : detail?.type === 'file_change'
                  ? detail.files.map((f) => `${changes[f.change]} ${f.path}`).join('\n')
                  : (c.name ?? this.label('Tool', '工具'))
        )
        this.status.dataset.status = c.status
        this.status.hidden = c.status === 'succeeded'
        text(this.status, stateLabel(c.status, this.label))
        this.summary.setAttribute('aria-label', `${this.title.textContent} · ${stateLabel(c.status, this.label)}`)
        this.inputDetails.hidden = !c.input || detail?.type === 'command'
        text(this.inputLabel, this.label('Input', '输入'))
        text(this.input, c.input ?? '')
        const patch =
            detail?.type === 'file_change'
                ? detail.files
                      .map((f) => (f.patch ? `${detail.files.length > 1 ? f.path + '\n' : ''}${f.patch}` : ''))
                      .filter(Boolean)
                      .join('\n\n')
                : ''
        this.patch.hidden = !patch
        if (this.patch.textContent !== patch)
            this.patch.replaceChildren(
                ...patch
                    .split('\n')
                    .map((line, i, lines) =>
                        el(
                            'span',
                            line + (i < lines.length - 1 ? '\n' : ''),
                            line.startsWith('+') ? 'patch-added' : line.startsWith('-') ? 'patch-removed' : ''
                        )
                    )
            )
        const output = captured?.text ?? c.output ?? ''
        const preview = output.split('\n').slice(0, 12).join('\n').slice(0, 2400)
        this.output.hidden = c.output === undefined && !captured
        text(this.output, output ? (this.full ? output : preview) : this.label('(empty output)', '（无输出）'))
        this.expand.hidden = output.length <= preview.length
        text(
            this.expand,
            this.full ? this.label('Collapse output', '收起输出') : this.label('Expand output', '展开输出')
        )
        this.copy.hidden = !output
        text(this.copy, this.label('Copy output', '复制输出'))
        this.more.hidden = !c.outputRef || !(captured?.hasMore ?? true)
        this.more.disabled = this.loading
        text(this.more, this.loading ? this.label('Loading…', '读取中…') : this.label('Load more', '加载更多'))
        this.notice.hidden = !c.truncated || !!(captured && !captured.hasMore)
        text(this.notice, this.label('Captured output is truncated', '已捕获输出被截断'))
        this.exit.hidden = detail?.type !== 'command' || detail.exitCode === undefined
        text(
            this.exit,
            detail?.type === 'command' && detail.exitCode !== undefined
                ? `${this.label('Exit code', '退出码')} ${detail.exitCode}`
                : ''
        )
        this.exit.dataset.status = detail?.type === 'command' && detail.exitCode ? 'failed' : 'succeeded'
        return true
    }
    needsUpdate(item: Activity, output?: Output) {
        return item.seq !== this.appliedSeq || output !== this.appliedOutput || this.locale !== this.label('en', 'zh')
    }
    reveal() {
        this.full = true
        this.details.open = true
        this.update(this.item, this.captured)
    }
    private async loadMore() {
        const target = this.item
        this.loading = true
        this.update(this.item, this.captured)
        try {
            const output = await this.onLoad(target)
            this.full = true
            this.loading = false
            if (
                this.item.content.kind === 'tool' &&
                target.content.kind === 'tool' &&
                this.item.content.outputRef?.key === target.content.outputRef?.key
            )
                this.update(this.item, output)
        } catch {
            this.loading = false
            this.more.disabled = false
            text(this.more, this.label('Read failed. Retry', '读取失败，重试'))
        }
    }
}
