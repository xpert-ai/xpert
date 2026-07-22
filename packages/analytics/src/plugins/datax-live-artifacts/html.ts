import { DATA_X_LIVE_ARTIFACT_MAX_HTML_BYTES } from './constants'

// Invariants: direct data-network APIs remain blocked and connect-src stays disabled.
// HTTP(S) display assets are a deprecated Phase 0 compatibility exception only.
// Replace this exception with governed, version-pinned assets in the security upgrade.

export type LiveArtifactHtmlValidation = {
	ok: boolean
	issues: string[]
	warnings: string[]
	html?: string
}

export type LiveArtifactHtmlValidationOptions = {
	bindingIds?: readonly string[]
}

const FORBIDDEN_TAG_PATTERN = /<(?:iframe|object|embed|base|frame|frameset|form)\b/i
const FORBIDDEN_META_PATTERN = /<meta\b[^>]*http-equiv\s*=\s*["']?(?:refresh|content-security-policy)\b/i
const DISALLOWED_URL_PATTERN =
	/\b(?:src|srcset|href|poster|action|formaction)\s*=\s*(["'])(?!#|data:|blob:|about:blank|https?:\/\/|\/\/)([^"']+)\1/i
const EXTERNAL_ONLINE_RESOURCE_PATTERN =
	/(?:\b(?:src|srcset|href|poster)\s*=\s*["']\s*|(?:url\s*\(\s*|@import\s+)["']?\s*)(?:https?:)?\/\//i
export const EXTERNAL_ONLINE_RESOURCES_DEPRECATION_WARNING =
	'DEPRECATED: External HTTP(S) resources are temporarily allowed. A future security upgrade will require governed, version-pinned assets.'
const FORBIDDEN_SCRIPT_PATTERNS: Array<[RegExp, string]> = [
	[/\bfetch\s*\(/i, 'fetch is not allowed'],
	[/\bXMLHttpRequest\b/i, 'XMLHttpRequest is not allowed'],
	[/\bWebSocket\b/i, 'WebSocket is not allowed'],
	[/\bEventSource\b/i, 'EventSource is not allowed'],
	[/\bnavigator\s*\.\s*serviceWorker\b/i, 'service workers are not allowed'],
	[/\bwindow\s*\.\s*open\s*\(/i, 'window.open is not allowed'],
	[/\b(?:localStorage|sessionStorage|indexedDB|document\s*\.\s*cookie)\b/i, 'browser persistence is not allowed'],
	[/\b(?:parent|top|opener)\s*\./i, 'direct parent/top/opener access is not allowed'],
	[/\bpostMessage\s*\(/i, 'use window.dataxLiveArtifact instead of postMessage'],
	[/\b(?:eval|Function)\s*\(/i, 'dynamic code evaluation is not allowed']
]

const LIVE_ARTIFACT_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline' https: http:",
	"style-src 'unsafe-inline' data: blob: https: http:",
	'img-src data: blob: https: http:',
	'font-src data: https: http:',
	'media-src data: blob: https: http:',
	"connect-src 'none'",
	"object-src 'none'",
	"frame-src 'none'",
	"worker-src 'none'",
	"base-uri 'none'",
	"form-action 'none'"
].join('; ')

export function validateAndPrepareLiveArtifactHtml(
	buffer: Buffer,
	options: LiveArtifactHtmlValidationOptions = {}
): LiveArtifactHtmlValidation {
	const issues: string[] = []
	const warnings: string[] = []
	if (buffer.byteLength === 0) issues.push('HTML file is empty')
	if (buffer.byteLength > DATA_X_LIVE_ARTIFACT_MAX_HTML_BYTES) {
		issues.push(`HTML exceeds the ${DATA_X_LIVE_ARTIFACT_MAX_HTML_BYTES} byte Phase 0 limit`)
	}

	let source = ''
	try {
		source = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
	} catch {
		issues.push('HTML must be valid UTF-8')
	}
	if (!source) return { ok: false, issues, warnings }

	if (!/<html\b/i.test(source) || !/<body\b/i.test(source)) {
		issues.push('HTML must be a complete single document with html and body elements')
	}
	if (FORBIDDEN_TAG_PATTERN.test(source))
		issues.push('iframe, object, embed, base, frame, frameset, and form tags are not allowed')
	if (FORBIDDEN_META_PATTERN.test(source)) issues.push('custom CSP and meta refresh declarations are not allowed')
	const disallowedUrl = source.match(DISALLOWED_URL_PATTERN)
	if (disallowedUrl) {
		issues.push(`URL is not allowed: ${disallowedUrl[2]}; use an HTTP(S), data, blob, fragment, or about:blank URL`)
	}
	for (const [pattern, message] of FORBIDDEN_SCRIPT_PATTERNS) {
		if (pattern.test(source)) issues.push(message)
	}
	if (EXTERNAL_ONLINE_RESOURCE_PATTERN.test(source)) {
		warnings.push(EXTERNAL_ONLINE_RESOURCES_DEPRECATION_WARNING)
	}
	validateBindingRuntime(source, options.bindingIds ?? [], issues)
	if (!/<meta\b[^>]*charset=/i.test(source)) warnings.push('UTF-8 charset metadata was injected')
	if (!/<title\b/i.test(source)) warnings.push('The document has no title element')
	if (issues.length) return { ok: false, issues, warnings }

	return { ok: true, issues, warnings, html: injectRuntime(source) }
}

// Validate the author-owned data path before the host SDK is injected.
function validateBindingRuntime(source: string, bindingIds: readonly string[], issues: string[]): void {
	if (!bindingIds.length) return

	if (!/window\s*\.\s*dataxLiveArtifact\b/.test(source)) {
		issues.push('HTML must use window.dataxLiveArtifact for manifest-bound data')
	}
	if (!/\.\s*(?:query|refresh)\s*\(/.test(source)) {
		issues.push('HTML must query or refresh at least one manifest binding')
	}
	if (!/\.\s*subscribe\s*\(/.test(source)) {
		issues.push('HTML must subscribe to manifest binding updates before querying')
	}
	if (!/(?:\.\s*effect\b|\[\s*["']effect["']\s*\])/.test(source)) {
		issues.push('HTML must parse query data from the result effect payload')
	}
	if (!/(?:\.\s*result\b|\[\s*["']result["']\s*\])/.test(source)) {
		issues.push('HTML must unwrap subscription updates from update.result')
	}
	if (!/(?:\.\s*ok\b|\[\s*["']ok["']\s*\])/.test(source)) {
		issues.push('HTML must branch subscription updates on update.ok')
	}

	for (const bindingId of bindingIds) {
		if (!source.includes(bindingId)) {
			issues.push(`HTML does not reference manifest binding '${bindingId}'`)
		}
	}
}

function injectRuntime(source: string): string {
	const bootstrap = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${LIVE_ARTIFACT_CSP}"><script data-datax-live-artifact-theme-runtime="1">${LIVE_ARTIFACT_SDK}</script>`
	if (/<head\b[^>]*>/i.test(source)) {
		return source.replace(/<head\b[^>]*>/i, (head) => `${head}${bootstrap}`)
	}
	return source.replace(/<html\b[^>]*>/i, (html) => `${html}<head>${bootstrap}</head>`)
}

const LIVE_ARTIFACT_SDK = String.raw`(()=>{'use strict';
const CHANNEL='datax.live_artifact',VERSION=1,THEME_EVENT='datax-live-artifact-theme-change',pending=new Map(),subscriptions=new Map();let instanceId=null,readyResolve,activeTheme=null;
const ready=new Promise(resolve=>{readyResolve=resolve});
const send=(type,payload={})=>window.parent.postMessage({channel:CHANNEL,version:VERSION,type,instanceId,...payload},'*');
const applyTheme=context=>{const theme=context&&context.theme==='dark'?'dark':context&&context.theme==='light'?'light':null;if(!theme)return;const root=document.documentElement;root.classList.toggle('dark',theme==='dark');root.classList.toggle('light',theme==='light');root.dataset.theme=theme;root.style.colorScheme=theme;if(activeTheme===theme)return;activeTheme=theme;window.dispatchEvent(new CustomEvent(THEME_EVENT,{detail:{theme}}))};
const validControls=controls=>controls&&typeof controls==='object'&&!Array.isArray(controls)&&Object.entries(controls).length<=24&&Object.entries(controls).every(([key,value])=>/^[A-Za-z][A-Za-z0-9._:-]*$/.test(key)&&key.length<=80&&(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)));
const query=async(bindingId,controls={},options={})=>{await ready;if(!validControls(controls)){const error=new TypeError('Live query controls must be a flat object of declared control IDs with primitive values; do not pass manifest params such as window');error.code='INVALID_LIVE_QUERY_CONTROLS';error.retryable=false;throw error}const requestId=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());const timeoutMs=Math.min(Math.max(Number(options.timeoutMs)||60000,1000),120000);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Live query timed out'))},timeoutMs);pending.set(requestId,{resolve,reject,timer});send('query',{requestId,bindingId,controls,forceRefresh:options.forceRefresh===true})})};
const notify=(level,message)=>send('notify',{level,message:String(message).slice(0,500)});
const subscribe=(bindingId,listener)=>{if(typeof bindingId!=='string'||typeof listener!=='function')throw new TypeError('subscribe requires bindingId and listener');const listeners=subscriptions.get(bindingId)||new Set();listeners.add(listener);subscriptions.set(bindingId,listeners);return()=>{listeners.delete(listener);if(!listeners.size)subscriptions.delete(bindingId)}};
window.dataxLiveArtifact=Object.freeze({ready,query,notify,subscribe,refresh:(bindingId,controls={})=>query(bindingId,controls,{forceRefresh:true})});
window.addEventListener('message',event=>{if(event.source!==window.parent)return;const data=event.data;if(!data||data.channel!==CHANNEL||data.version!==VERSION)return;if(data.type==='init'&&typeof data.instanceId==='string'){const context=data.context||{};instanceId=data.instanceId;applyTheme(context);readyResolve(context);window.dispatchEvent(new CustomEvent('datax-live-artifact-ready',{detail:context}));return}if(data.instanceId!==instanceId)return;if(data.type==='binding_update'&&typeof data.bindingId==='string'){const detail=data.ok?{ok:true,result:data.result}:{ok:false,error:data.error};for(const listener of subscriptions.get(data.bindingId)||[])try{listener(detail)}catch(error){console.error(error)}window.dispatchEvent(new CustomEvent('datax-live-artifact-binding-update',{detail:{bindingId:data.bindingId,...detail}}));return}if(data.type!=='query_result'||typeof data.requestId!=='string')return;const entry=pending.get(data.requestId);if(!entry)return;pending.delete(data.requestId);clearTimeout(entry.timer);data.ok?entry.resolve(data.result):entry.reject(Object.assign(new Error(data.error?.message||'Live query failed'),{code:data.error?.code||'LIVE_QUERY_FAILED',retryable:data.error?.retryable===true}))});
const resize=()=>send('resize',{height:Math.min(Math.max(document.documentElement.scrollHeight,240),5000)});new ResizeObserver(resize).observe(document.documentElement);window.addEventListener('load',resize);send('ready');
})();`
