import { EXTERNAL_ONLINE_RESOURCES_DEPRECATION_WARNING, validateAndPrepareLiveArtifactHtml } from './html'

describe('Data X Live Artifact HTML security', () => {
	it('injects the resource-only network CSP and host bridge SDK into a complete document', () => {
		const result = validateAndPrepareLiveArtifactHtml(
			Buffer.from(
				'<!doctype html><html><head><meta charset="utf-8"><title>Sales</title></head><body><main id="app"></main></body></html>'
			)
		)

		expect(result.ok).toBe(true)
		expect(result.issues).toEqual([])
		expect(result.warnings).toEqual([])
		expect(result.html).toContain("connect-src 'none'")
		expect(result.html).toContain("frame-src 'none'")
		expect(result.html).toContain("script-src 'unsafe-inline' https: http:")
		expect(result.html).toContain('window.dataxLiveArtifact=Object.freeze')
		expect(result.html).toContain('data-datax-live-artifact-theme-runtime="1"')
		expect(result.html).toContain("root.classList.toggle('dark'")
		expect(result.html).toContain('root.style.colorScheme=theme')
		expect(result.html).toContain('datax-live-artifact-theme-change')
		expect(result.html).toContain('subscribe,refresh')
		expect(result.html).toContain('INVALID_LIVE_QUERY_CONTROLS')
		expect(result.html).toContain('controls must be a flat object')
		expect(result.html).toContain("data.type==='binding_update'")
		expect(result.html).toContain("send('ready')")
	})

	it('temporarily allows external HTTP(S) assets with a deprecation warning', () => {
		const result = validateAndPrepareLiveArtifactHtml(
			Buffer.from(`<!doctype html><html><head>
				<title>Chart</title>
				<link rel="stylesheet" href="https://cdn.example/chart.css">
				<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
			</head><body><img src="https://cdn.example/chart.png" alt="Chart"></body></html>`)
		)

		expect(result.ok).toBe(true)
		expect(result.issues).toEqual([])
		expect(result.warnings).toContain(EXTERNAL_ONLINE_RESOURCES_DEPRECATION_WARNING)
	})

	it.each([
		['unsupported resource URL', '<script src="ftp://cdn.example/chart.js"></script>'],
		['network API', '<script>fetch("https://example.test")</script>'],
		['direct bridge escape', '<script>parent.postMessage({secret: 1}, "*")</script>'],
		['nested frame', '<iframe src="data:text/html,test"></iframe>'],
		['form submission', '<form action="/collect"><input></form>'],
		['custom CSP', '<meta http-equiv="Content-Security-Policy" content="default-src *">']
	])('rejects %s capabilities', (_label, unsafeMarkup) => {
		const result = validateAndPrepareLiveArtifactHtml(
			Buffer.from(`<!doctype html><html><head><title>Unsafe</title></head><body>${unsafeMarkup}</body></html>`)
		)
		expect(result.ok).toBe(false)
		expect(result.issues.length).toBeGreaterThan(0)
	})

	it('rejects a manifest-bound HTML shell without author data runtime', () => {
		const result = validateAndPrepareLiveArtifactHtml(
			Buffer.from(
				'<!doctype html><html><head><title>Sales</title></head><body><h1>Sales</h1><div id="dashboard"></div></body></html>'
			),
			{ bindingIds: ['sales_trend'] }
		)

		expect(result.ok).toBe(false)
		expect(result.issues).toEqual(
			expect.arrayContaining([
				'HTML must use window.dataxLiveArtifact for manifest-bound data',
				"HTML does not reference manifest binding 'sales_trend'"
			])
		)
	})

	it('accepts a manifest-bound document with query and subscription data paths', () => {
		const result = validateAndPrepareLiveArtifactHtml(
			Buffer.from(`<!doctype html><html><head><title>Sales</title></head><body>
				<script>
					const bridge = window.dataxLiveArtifact;
					bridge.subscribe('sales_trend', update => update.ok ? update.result.effect.series : update.error);
					bridge.ready.then(() => bridge.query('sales_trend').then(result => result.effect.series));
				</script>
			</body></html>`),
			{ bindingIds: ['sales_trend'] }
		)

		expect(result.ok).toBe(true)
		expect(result.issues).toEqual([])
	})

	it('rejects subscription code that treats updates as status records', () => {
		const result = validateAndPrepareLiveArtifactHtml(
			Buffer.from(`<!doctype html><html><head><title>Sales</title></head><body>
				<script>
					const bridge = window.dataxLiveArtifact;
					bridge.subscribe('sales_trend', update => update.status === 'success' && update.result.effect.series);
					bridge.ready.then(() => bridge.query('sales_trend').then(result => result.effect.series));
				</script>
			</body></html>`),
			{ bindingIds: ['sales_trend'] }
		)

		expect(result.ok).toBe(false)
		expect(result.issues).toContain('HTML must branch subscription updates on update.ok')
	})
})
