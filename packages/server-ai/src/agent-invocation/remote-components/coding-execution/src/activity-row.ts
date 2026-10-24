import type { ExecutionI18n } from './i18n/core'
import { button, buttonText, el, hasSelection, text } from './dom'
import { stateLabel, type Activity, type Output } from './model'
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
    private loadFailed = false
    private appliedSeq = -1
    private appliedOutput?: Output
    private locale = ''
    constructor(
        item: Activity,
        private i18n: ExecutionI18n,
        private onLoad: (item: Activity) => Promise<Output>,
        private onCopy: (text: string) => void
    ) {
        this.item = item
        this.reply = new ReplyContent(i18n, onCopy)
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
        const locale = this.i18n.locale
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
            created: 'activity.write',
            modified: 'activity.edit',
            deleted: 'activity.delete',
            reported: 'activity.file'
        } as const
        text(
            this.title,
            detail?.type === 'command'
                ? `$ ${detail.command}`
                : detail?.type === 'file_change'
                  ? detail.files.map((f) => this.i18n.t(changes[f.change], { path: f.path })).join('\n')
                  : (c.name ?? this.i18n.t('activity.tool'))
        )
        this.status.dataset.status = c.status
        this.status.hidden = c.status === 'succeeded'
        text(this.status, stateLabel(c.status, this.i18n))
        this.summary.setAttribute(
            'aria-label',
            this.i18n.t('activity.summary', {
                title: this.title.textContent ?? '',
                status: stateLabel(c.status, this.i18n)
            })
        )
        this.inputDetails.hidden = !c.input || detail?.type === 'command'
        text(this.inputLabel, this.i18n.t('activity.input'))
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
        text(this.output, output ? (this.full ? output : preview) : this.i18n.t('output.empty'))
        this.expand.hidden = output.length <= preview.length
        buttonText(this.expand, this.full ? this.i18n.t('output.collapse') : this.i18n.t('output.expand'))
        this.copy.hidden = !output
        buttonText(this.copy, this.i18n.t('output.copy'))
        this.more.hidden = !c.outputRef || !(captured?.hasMore ?? true)
        this.more.disabled = this.loading
        buttonText(
            this.more,
            this.i18n.t(this.loading ? 'output.loading' : this.loadFailed ? 'output.readFailed' : 'output.loadMore')
        )
        this.notice.hidden = !c.truncated || !!(captured && !captured.hasMore)
        text(this.notice, this.i18n.t('output.truncated'))
        this.exit.hidden = detail?.type !== 'command' || detail.exitCode === undefined
        text(
            this.exit,
            detail?.type === 'command' && detail.exitCode !== undefined
                ? this.i18n.t('output.exitCode', { code: detail.exitCode })
                : ''
        )
        this.exit.dataset.status = detail?.type === 'command' && detail.exitCode ? 'failed' : 'succeeded'
        return true
    }
    needsUpdate(item: Activity, output?: Output) {
        return item.seq !== this.appliedSeq || output !== this.appliedOutput || this.locale !== this.i18n.locale
    }
    reveal() {
        this.full = true
        this.details.open = true
        this.update(this.item, this.captured)
    }
    private async loadMore() {
        const target = this.item
        this.loading = true
        this.loadFailed = false
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
            this.loadFailed = true
            buttonText(this.more, this.i18n.t('output.readFailed'))
        }
    }
}
