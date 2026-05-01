import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { SafePipe } from '@xpert-ai/core'
import type { TChatElementAttribute, TChatFileElementReference } from '@xpert-ai/contracts'

type HtmlInspectorElementPayload = {
  attributes: TChatElementAttribute[]
  documentTitle?: string
  domPath: string
  label?: string
  outerHtml: string
  role?: string
  selector: string
  tagName: string
  text: string
}

type HtmlInspectorMessage = {
  element: HtmlInspectorElementPayload
  token: string
  type: 'xpert-html-inspector-element'
}

type HtmlInspectorMessageCandidate = {
  element?: unknown
  token?: unknown
  type?: unknown
}

type HtmlInspectorElementCandidate = {
  attributes?: unknown
  documentTitle?: unknown
  domPath?: unknown
  label?: unknown
  outerHtml?: unknown
  role?: unknown
  selector?: unknown
  tagName?: unknown
  text?: unknown
}

type HtmlInspectorAttributeCandidate = {
  name?: unknown
  value?: unknown
}

type HtmlSourceLineRange = {
  sourceEndLine: number
  sourceStartLine: number
}

@Component({
  standalone: true,
  selector: 'pac-file-html-preview',
  templateUrl: './file-html-preview.component.html',
  imports: [SafePipe],
  host: {
    class: 'flex h-full min-h-0 flex-1 overflow-hidden'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileHtmlPreviewComponent {
  readonly #destroyRef = inject(DestroyRef)

  readonly content = input<string | null>(null)
  readonly filePath = input<string | null>(null)
  readonly fileName = input<string>('')
  readonly inspectMode = input(false)
  readonly loading = input(false)
  readonly referenceable = input(false)
  readonly url = input<string | null>(null)

  readonly fileElementReference = output<TChatFileElementReference>()
  readonly inspectModeChange = output<boolean>()

  readonly htmlInspectorToken = signal(createHtmlInspectorToken())
  readonly htmlPreviewUrl = signal<string | null>(null)
  readonly htmlReferenceFilePath = computed(() => normalizeReferencePath(this.filePath() || this.fileName()))
  readonly htmlInspectAvailable = computed(() => {
    const content = this.content()
    return (
      this.referenceable() &&
      !this.loading() &&
      typeof content === 'string' &&
      content.trim().length > 0 &&
      !!this.htmlReferenceFilePath()
    )
  })

  readonly #htmlPreviewUrlEffect = effect((onCleanup) => {
    const url = this.url()
    const content = this.content()
    const inspectAvailable = this.htmlInspectAvailable()
    const token = inspectAvailable ? createHtmlInspectorToken() : null
    if (token) {
      this.htmlInspectorToken.set(token)
    }

    const objectUrl =
      typeof content === 'string' && (!url || inspectAvailable)
        ? createHtmlPreviewObjectUrl(token ? buildHtmlInspectorPreviewContent(content, token) : content)
        : null

    this.htmlPreviewUrl.set(objectUrl || url)

    onCleanup(() => {
      if (objectUrl) {
        revokePreviewObjectUrl(objectUrl)
      }
    })
  })

  readonly #syncHtmlInspectModeEffect = effect(() => {
    this.inspectMode()
    this.htmlInspectorToken()
    this.htmlPreviewUrl()
    void Promise.resolve().then(() => this.syncHtmlInspectMode())
  })

  private readonly htmlPreviewFrame = viewChild<ElementRef<HTMLIFrameElement>>('htmlPreviewFrame')

  constructor() {
    if (typeof window === 'undefined') {
      return
    }

    const messageHandler = (event: MessageEvent) => this.handleHtmlInspectorMessage(event)
    window.addEventListener('message', messageHandler)

    this.#destroyRef.onDestroy(() => {
      window.removeEventListener('message', messageHandler)
    })
  }

  handleHtmlPreviewLoad() {
    this.syncHtmlInspectMode()
  }

  private handleHtmlInspectorMessage(event: MessageEvent) {
    const frameWindow = this.htmlPreviewFrame()?.nativeElement.contentWindow
    if (!frameWindow || event.source !== frameWindow) {
      return
    }

    const message = normalizeHtmlInspectorMessage(event.data)
    if (!message || message.token !== this.htmlInspectorToken()) {
      return
    }

    const filePath = this.htmlReferenceFilePath()
    if (!filePath) {
      return
    }

    const content = this.content() ?? ''
    const sourceRange = resolveHtmlSourceLineRange(content, message.element.outerHtml)
    this.fileElementReference.emit({
      type: 'file_element',
      attributes: message.element.attributes,
      domPath: message.element.domPath,
      filePath,
      outerHtml: message.element.outerHtml,
      selector: message.element.selector,
      tagName: message.element.tagName,
      text: message.element.text,
      ...(message.element.label ? { label: message.element.label } : {}),
      ...(message.element.documentTitle ? { documentTitle: message.element.documentTitle } : {}),
      ...(message.element.role ? { role: message.element.role } : {}),
      ...(sourceRange ?? {})
    })
    this.inspectModeChange.emit(false)
  }

  private syncHtmlInspectMode() {
    const frameWindow = this.htmlPreviewFrame()?.nativeElement.contentWindow
    if (!frameWindow) {
      return
    }

    frameWindow.postMessage(
      {
        enabled: this.htmlInspectAvailable() && this.inspectMode(),
        token: this.htmlInspectorToken(),
        type: 'xpert-html-inspector-mode'
      },
      '*'
    )
  }
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isHtmlInspectorAttribute(value: unknown): value is TChatElementAttribute {
  if (!isObjectLike(value)) {
    return false
  }

  const candidate = value as HtmlInspectorAttributeCandidate
  return isNonEmptyString(candidate.name) && typeof candidate.value === 'string'
}

function isHtmlInspectorElementPayload(value: unknown): value is HtmlInspectorElementPayload {
  if (!isObjectLike(value)) {
    return false
  }

  const candidate = value as HtmlInspectorElementCandidate
  return (
    isNonEmptyString(candidate.domPath) &&
    isNonEmptyString(candidate.outerHtml) &&
    isNonEmptyString(candidate.selector) &&
    isNonEmptyString(candidate.tagName) &&
    isNonEmptyString(candidate.text) &&
    Array.isArray(candidate.attributes) &&
    candidate.attributes.every((attribute) => isHtmlInspectorAttribute(attribute)) &&
    isOptionalString(candidate.documentTitle) &&
    isOptionalString(candidate.label) &&
    isOptionalString(candidate.role)
  )
}

function normalizeHtmlInspectorMessage(value: unknown): HtmlInspectorMessage | null {
  if (!isObjectLike(value)) {
    return null
  }

  const candidate = value as HtmlInspectorMessageCandidate
  if (
    candidate.type !== 'xpert-html-inspector-element' ||
    !isNonEmptyString(candidate.token) ||
    !isHtmlInspectorElementPayload(candidate.element)
  ) {
    return null
  }

  return {
    element: candidate.element,
    token: candidate.token,
    type: 'xpert-html-inspector-element'
  }
}

function normalizeReferencePath(value?: string | null) {
  return (value ?? '').trim().replace(/\\/g, '/') || null
}

function createHtmlInspectorToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `html-inspector-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

function buildHtmlInspectorPreviewContent(content: string, token: string) {
  const script = createHtmlInspectorScript(token)
  const scriptTag = `<script>${script}</script>`
  const bodyCloseIndex = content.search(/<\/body\s*>/i)
  if (bodyCloseIndex >= 0) {
    return `${content.slice(0, bodyCloseIndex)}${scriptTag}${content.slice(bodyCloseIndex)}`
  }

  return `${content}${scriptTag}`
}

function createHtmlPreviewObjectUrl(content: string) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return `data:text/html;charset=utf-8,${encodeURIComponent(content)}`
  }

  return URL.createObjectURL(
    new Blob([content], {
      type: 'text/html;charset=utf-8'
    })
  )
}

function createHtmlInspectorScript(token: string) {
  const serializedToken = JSON.stringify(token).replace(/</g, '\\u003c')
  return `
(function () {
  var token = ${serializedToken};
  var enabled = false;
  var currentElement = null;
  var pinnedElement = null;
  var overlay = null;
  var overlayLabel = null;

  function normalizeText(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim();
  }

  function truncate(value, limit) {
    var text = String(value || '');
    return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 3)) + '...';
  }

  function escapeCssIdentifier(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (character) {
      return '\\\\' + character;
    });
  }

  function buildSelectorSegment(element) {
    var tagName = element.tagName.toLowerCase();
    var id = element.getAttribute('id');
    if (id && id.trim()) {
      return '#' + escapeCssIdentifier(id.trim());
    }

    var classes = Array.prototype.slice.call(element.classList || [])
      .filter(function (className) { return className && className.trim(); })
      .slice(0, 2)
      .map(function (className) { return '.' + escapeCssIdentifier(className); })
      .join('');
    var parent = element.parentElement;
    if (!parent) {
      return tagName + classes;
    }

    var sameTagSiblings = Array.prototype.filter.call(parent.children, function (child) {
      return child.tagName === element.tagName;
    });
    if (sameTagSiblings.length <= 1) {
      return tagName + classes;
    }

    return tagName + classes + ':nth-of-type(' + (sameTagSiblings.indexOf(element) + 1) + ')';
  }

  function buildUniqueSelector(element) {
    var segments = [];
    var current = element;
    while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
      segments.unshift(buildSelectorSegment(current));
      var selector = segments.join(' > ');
      try {
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch (error) {
      }
      current = current.parentElement;
    }

    return segments.join(' > ') || element.tagName.toLowerCase();
  }

  function buildDomPath(element) {
    var segments = [];
    var current = element;
    while (current && current.nodeType === 1) {
      var tagName = current.tagName.toLowerCase();
      var parent = current.parentElement;
      if (!parent) {
        segments.unshift(tagName);
        break;
      }

      var sameTagSiblings = Array.prototype.filter.call(parent.children, function (child) {
        return child.tagName === current.tagName;
      });
      var position = sameTagSiblings.indexOf(current) + 1;
      segments.unshift(sameTagSiblings.length > 1 ? tagName + ':nth-of-type(' + position + ')' : tagName);
      current = parent;
    }

    return segments.join(' > ');
  }

  function buildLabel(element, selector) {
    var ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) {
      return element.tagName.toLowerCase() + ' "' + truncate(ariaLabel.trim(), 48) + '"';
    }

    var text = normalizeText(element.textContent);
    if (text) {
      return element.tagName.toLowerCase() + ' "' + truncate(text, 48) + '"';
    }

    return element.tagName.toLowerCase() + ' ' + selector;
  }

  function readTargetElement(target) {
    if (!target) {
      return null;
    }

    if (target.nodeType === 3 && target.parentElement) {
      return target.parentElement;
    }

    if (target.nodeType !== 1) {
      return null;
    }

    if (target.closest && target.closest('[data-xpert-html-inspector]')) {
      return null;
    }

    return target;
  }

  function ensureOverlay() {
    if (overlay && overlayLabel) {
      return;
    }

    overlay = document.createElement('div');
    overlay.setAttribute('data-xpert-html-inspector', 'overlay');
    overlay.style.cssText = 'display:none;position:fixed;z-index:2147483646;pointer-events:none;border:2px solid Highlight;background:color-mix(in srgb, Highlight 14%, transparent);box-sizing:border-box;';
    overlayLabel = document.createElement('div');
    overlayLabel.setAttribute('data-xpert-html-inspector', 'label');
    overlayLabel.style.cssText = 'display:none;position:fixed;z-index:2147483647;pointer-events:none;max-width:320px;padding:4px 8px;border-radius:6px;background:Highlight;color:Canvas;font:12px/1.4 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px color-mix(in srgb, CanvasText 18%, transparent);';
    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(overlayLabel);
  }

  function clearOverlay() {
    if (overlay) {
      overlay.style.display = 'none';
    }
    if (overlayLabel) {
      overlayLabel.style.display = 'none';
    }
  }

  function updateOverlay(element) {
    ensureOverlay();
    var rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      clearOverlay();
      return;
    }

    var selector = buildUniqueSelector(element);
    overlay.style.display = 'block';
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    overlayLabel.textContent = buildLabel(element, selector);
    overlayLabel.style.display = 'block';
    overlayLabel.style.left = rect.left + 'px';
    overlayLabel.style.top = (rect.top > 32 ? rect.top - 30 : rect.top + 6) + 'px';
  }

  function buildPayload(element) {
    var selector = buildUniqueSelector(element);
    var text = normalizeText(element.textContent) || element.tagName.toLowerCase();
    return {
      attributes: Array.prototype.map.call(element.attributes || [], function (attribute) {
        return {
          name: attribute.name,
          value: truncate(attribute.value, 300)
        };
      }),
      documentTitle: normalizeText(document.title) || undefined,
      domPath: buildDomPath(element),
      label: buildLabel(element, selector),
      outerHtml: truncate(element.outerHTML, 4000),
      role: element.getAttribute('role') || undefined,
      selector: selector,
      tagName: element.tagName.toLowerCase(),
      text: truncate(text, 1000)
    };
  }

  document.addEventListener('mousemove', function (event) {
    if (!enabled) {
      return;
    }

    var element = readTargetElement(event.target);
    if (!element) {
      currentElement = null;
      if (!pinnedElement) {
        clearOverlay();
      }
      return;
    }

    currentElement = element;
    updateOverlay(element);
  }, true);

  document.addEventListener('mouseleave', function () {
    currentElement = null;
    if (!pinnedElement) {
      clearOverlay();
    }
  }, true);

  document.addEventListener('click', function (event) {
    if (!enabled) {
      return;
    }

    var element = readTargetElement(event.target);
    if (!element) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    currentElement = element;
    pinnedElement = element;
    enabled = false;
    document.documentElement.style.cursor = '';
    updateOverlay(element);
    window.parent.postMessage({
      element: buildPayload(element),
      token: token,
      type: 'xpert-html-inspector-element'
    }, '*');
  }, true);

  window.addEventListener('scroll', function () {
    var element = pinnedElement || (enabled ? currentElement : null);
    if (element) {
      updateOverlay(element);
    }
  }, true);

  window.addEventListener('resize', function () {
    var element = pinnedElement || (enabled ? currentElement : null);
    if (element) {
      updateOverlay(element);
    }
  });

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'xpert-html-inspector-mode' || data.token !== token) {
      return;
    }

    enabled = data.enabled === true;
    document.documentElement.style.cursor = enabled ? 'crosshair' : '';
    if (enabled) {
      currentElement = null;
      pinnedElement = null;
      clearOverlay();
      return;
    }

    currentElement = null;
    if (pinnedElement) {
      updateOverlay(pinnedElement);
    } else {
      clearOverlay();
    }
  });
})();`
}

function resolveHtmlSourceLineRange(content: string, outerHtml: string): HtmlSourceLineRange | null {
  if (!content || !outerHtml) {
    return null
  }

  const index = content.indexOf(outerHtml)
  if (index < 0) {
    return null
  }
  if (content.indexOf(outerHtml, index + outerHtml.length) >= 0) {
    return null
  }

  const before = content.slice(0, index)
  const selected = content.slice(index, index + outerHtml.length)
  const sourceStartLine = countLines(before)
  const sourceEndLine = sourceStartLine + countLines(selected) - 1
  return {
    sourceEndLine,
    sourceStartLine
  }
}

function countLines(value: string) {
  return value.split(/\r\n|\r|\n/).length
}

function revokePreviewObjectUrl(url: string) {
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function' || !url.startsWith('blob:')) {
    return
  }

  URL.revokeObjectURL(url)
}
