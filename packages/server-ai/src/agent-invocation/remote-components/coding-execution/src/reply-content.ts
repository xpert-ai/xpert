import { button, el, hasSelection, text } from './dom'
import { publicReply, type Label } from './model'
import { JsonTree } from './json-tree'

/** Keep disclosures and text nodes mounted across Activity updates. */
export class ReplyContent {
    readonly element = el('div', '', 'reply-content')
    private message = el('p', '', 'public-message searchable')
    private raw = el('section', '', 'raw-result')
    private title = el('span', '', 'raw-result-title')
    private tree: JsonTree
    private original = ''
    private copy = button('', () => this.onCopy(this.original))
    constructor(
        private label: Label,
        private onCopy: (value: string) => void
    ) {
        this.raw.hidden = true
        this.tree = new JsonTree(label)
        const header = el('div', '', 'raw-result-header')
        header.append(this.title, this.copy)
        this.raw.append(header, this.tree.element)
        this.element.append(this.message, this.raw)
    }
    update(value: string, structured = true) {
        if (hasSelection(this.element)) return
        const reply = structured ? publicReply(value) : { text: value }
        this.original = reply.raw ?? value
        this.message.hidden = !reply.text
        text(this.message, reply.text)
        this.raw.hidden = !reply.raw
        if (reply.data !== undefined) this.tree.update(reply.data, !reply.text)
        const title = reply.text
            ? this.label('Raw result JSON', '原始结果 JSON')
            : this.label('JSON result', 'JSON 结果')
        text(this.title, title)
        const copyLabel = this.label('Copy original', '复制原文')
        text(this.copy, copyLabel)
        this.copy.title = copyLabel
        this.copy.setAttribute('aria-label', copyLabel)
    }
}
