import * as React from 'react'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/editor/editor.all.js'

type MonacoEnvironment = {
	getWorker?(workerId: string, label: string): Worker
}

type MonacoGlobal = typeof globalThis & {
	MonacoEnvironment?: MonacoEnvironment
}

let mdxLanguageRegistered = false
let themesRegistered = false

export function MonacoCodeEditor(props: {
	value: string
	language: 'mdx' | 'sql'
	ariaLabel: string
	readOnly?: boolean
	onChange?(value: string): void
	onExecute?(value: string): void
}) {
	const containerRef = React.useRef<HTMLDivElement>(null)
	const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
	const onChangeRef = React.useRef(props.onChange)
	const onExecuteRef = React.useRef(props.onExecute)

	onChangeRef.current = props.onChange
	onExecuteRef.current = props.onExecute

	React.useEffect(() => {
		const container = containerRef.current
		if (!container) {
			return
		}
		ensureMonacoRuntime()
		const model = monaco.editor.createModel(props.value, props.language)
		const editor = monaco.editor.create(container, {
			model,
			ariaLabel: props.ariaLabel,
			automaticLayout: false,
			contextmenu: true,
			cursorBlinking: 'smooth',
			cursorSmoothCaretAnimation: true,
			folding: true,
			fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, ui-monospace, monospace",
			fontLigatures: true,
			fontSize: 12,
			glyphMargin: false,
			lineDecorationsWidth: 8,
			lineHeight: 20,
			lineNumbers: 'on',
			lineNumbersMinChars: 3,
			minimap: { enabled: false },
			overviewRulerBorder: false,
			overviewRulerLanes: 0,
			padding: { top: 10, bottom: 10 },
			readOnly: props.readOnly,
			renderLineHighlight: 'line',
			renderValidationDecorations: 'on',
			scrollBeyondLastLine: false,
			smoothScrolling: true,
			tabSize: 2,
			wordWrap: props.readOnly ? 'on' : 'off'
		})
		editorRef.current = editor

		const changeSubscription = editor.onDidChangeModelContent(() => {
			onChangeRef.current?.(editor.getValue())
		})
		editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
			onExecuteRef.current?.(editor.getValue())
		})
		const resizeObserver = new ResizeObserver(() => editor.layout())
		resizeObserver.observe(container)
		const root = document.documentElement
		const updateTheme = () => {
			monaco.editor.setTheme(isDarkTheme(root) ? 'xpert-dark' : 'xpert-light')
		}
		const themeObserver = new MutationObserver(updateTheme)
		themeObserver.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] })
		updateTheme()
		editor.layout()

		return () => {
			themeObserver.disconnect()
			resizeObserver.disconnect()
			changeSubscription.dispose()
			editor.dispose()
			model.dispose()
			editorRef.current = null
		}
	}, [])

	React.useEffect(() => {
		const editor = editorRef.current
		const model = editor?.getModel()
		if (!editor || !model) {
			return
		}
		if (model.getValue() !== props.value) {
			editor.executeEdits('external-update', [
				{
					range: model.getFullModelRange(),
					text: props.value
				}
			])
		}
		if (model.getModeId() !== props.language) {
			monaco.editor.setModelLanguage(model, props.language)
		}
		editor.updateOptions({
			ariaLabel: props.ariaLabel,
			readOnly: props.readOnly,
			wordWrap: props.readOnly ? 'on' : 'off'
		})
	}, [props.ariaLabel, props.language, props.readOnly, props.value])

	return (
		<div ref={containerRef} className="size-full overflow-hidden" data-testid={`monaco-${props.language}-editor`} />
	)
}

function ensureMonacoRuntime() {
	const runtime = globalThis as MonacoGlobal
	if (!runtime.MonacoEnvironment?.getWorker) {
		runtime.MonacoEnvironment = {
			getWorker(_workerId, label) {
				const url = URL.createObjectURL(new Blob([__XPERT_MONACO_WORKER_SOURCE__], { type: 'text/javascript' }))
				const worker = new Worker(url, { name: label })
				globalThis.setTimeout(() => URL.revokeObjectURL(url), 0)
				return worker
			}
		}
	}
	if (!mdxLanguageRegistered) {
		monaco.languages.register({ id: 'mdx', extensions: ['.mdx'] })
		monaco.languages.setLanguageConfiguration('mdx', {
			brackets: [
				['(', ')'],
				['[', ']'],
				['{', '}']
			],
			autoClosingPairs: [
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '{', close: '}' },
				{ open: '"', close: '"' },
				{ open: "'", close: "'" }
			],
			comments: { lineComment: '--', blockComment: ['/*', '*/'] }
		})
		monaco.languages.setMonarchTokensProvider('mdx', {
			ignoreCase: true,
			keywords: [
				'SELECT',
				'FROM',
				'WHERE',
				'WITH',
				'MEMBER',
				'SET',
				'AS',
				'ON',
				'COLUMNS',
				'ROWS',
				'PAGES',
				'CHAPTERS',
				'SECTIONS',
				'NON',
				'EMPTY',
				'FILTER',
				'ORDER',
				'DESC',
				'ASC',
				'TOPCOUNT',
				'BOTTOMCOUNT',
				'CROSSJOIN',
				'EXCEPT',
				'UNION',
				'INTERSECT',
				'DRILLDOWNMEMBER',
				'DRILLUPMEMBER',
				'PROPERTIES',
				'DIMENSION',
				'CELL'
			],
			tokenizer: {
				root: [
					[/--.*$/, 'comment'],
					[/\/\*/, 'comment', '@comment'],
					[/\[[^\]]+\]/, 'type.identifier'],
					[/[a-zA-Z_][\w$]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
					[/\d+(\.\d+)?/, 'number'],
					[/"([^"\\]|\\.)*$/, 'string.invalid'],
					[/"/, 'string', '@doubleQuotedString'],
					[/'([^'\\]|\\.)*$/, 'string.invalid'],
					[/'/, 'string', '@singleQuotedString'],
					[/[{}()[\]]/, '@brackets'],
					[/[;,.]/, 'delimiter']
				],
				comment: [
					[/[^/*]+/, 'comment'],
					[/\*\//, 'comment', '@pop'],
					[/[/*]/, 'comment']
				],
				doubleQuotedString: [
					[/[^\\"]+/, 'string'],
					[/\\./, 'string.escape.invalid'],
					[/"/, 'string', '@pop']
				],
				singleQuotedString: [
					[/[^\\']+/, 'string'],
					[/\\./, 'string.escape.invalid'],
					[/'/, 'string', '@pop']
				]
			}
		})
		mdxLanguageRegistered = true
	}
	if (!themesRegistered) {
		monaco.editor.defineTheme('xpert-light', {
			base: 'vs',
			inherit: true,
			rules: [
				{ token: 'keyword', foreground: '4F46E5', fontStyle: 'bold' },
				{ token: 'type.identifier', foreground: '047857' },
				{ token: 'comment', foreground: '71717A', fontStyle: 'italic' }
			],
			colors: {
				'editor.background': '#FFFFFF',
				'editor.foreground': '#18181B',
				'editor.lineHighlightBackground': '#F4F4F533',
				'editorLineNumber.foreground': '#A1A1AA',
				'editorLineNumber.activeForeground': '#52525B',
				'editor.selectionBackground': '#C7D2FE88',
				'editorCursor.foreground': '#4F46E5'
			}
		})
		monaco.editor.defineTheme('xpert-dark', {
			base: 'vs-dark',
			inherit: true,
			rules: [
				{ token: 'keyword', foreground: 'A5B4FC', fontStyle: 'bold' },
				{ token: 'type.identifier', foreground: '6EE7B7' },
				{ token: 'comment', foreground: 'A1A1AA', fontStyle: 'italic' }
			],
			colors: {
				'editor.background': '#09090B',
				'editor.foreground': '#F4F4F5',
				'editor.lineHighlightBackground': '#27272A66',
				'editorLineNumber.foreground': '#52525B',
				'editorLineNumber.activeForeground': '#D4D4D8',
				'editor.selectionBackground': '#4338CA88',
				'editorCursor.foreground': '#A5B4FC'
			}
		})
		themesRegistered = true
	}
}

function isDarkTheme(root: HTMLElement) {
	return root.classList.contains('dark') || root.dataset['theme'] === 'dark'
}
