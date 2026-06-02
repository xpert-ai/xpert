;(function () {
	const CHANNEL = 'xpertai.remote_component'
	const VERSION = 1
	const h = React.createElement
	const NO_WRAP_STYLE = { whiteSpace: 'nowrap' }
	const ACTIONS_NO_WRAP_STYLE = { whiteSpace: 'nowrap', flexWrap: 'nowrap' }
	const VIEWPORT_BOUND_FILL_HEIGHT = 100000
	let instanceId = null
	let requestSequence = 0
	const pending = new Map()
	const I18N = {
		zh_Hans: {
			remoteRequestFailed: '远程请求失败',
			actionCompleted: '操作已完成',
			actionFailed: '操作失败',
			requiredFields: '编码和名称为必填项。',
			selectProject: '选择项目',
			allModels: '全部模型',
			searchPlaceholder: '搜索指标编码、名称或业务口径',
			search: '搜索',
			createMetric: '新建指标',
			editMetric: '编辑指标',
			projectRequired: '请选择项目后维护指标。',
			loadingMetrics: '正在加载指标...',
			emptyMetrics: '暂无指标。',
			code: '编码',
			name: '名称',
			type: '类型',
			status: '状态',
			model: '模型',
			embeddingStatus: '向量状态',
			updatedAt: '更新时间',
			actions: '操作',
			edit: '编辑',
			publish: '发布',
			publishing: '发布中',
			embedding: '向量化',
			embeddingBusy: '处理中',
			delete: '删除',
			deleting: '删除中',
			confirmDelete: '确认删除该指标？',
			totalRows: '共 {total} 条',
			page: '第 {page} 页',
			previousPage: '上一页',
			nextPage: '下一页',
			refresh: '刷新',
			close: '关闭',
			noModel: '不指定模型',
			cube: '立方体',
			entity: '实体',
			description: '描述',
			calendar: '日历',
			measure: '度量',
			formula: '公式',
			filters: '过滤条件',
			addFilter: '添加过滤',
			remove: '移除',
			dimension: '维度',
			hierarchy: '层级',
			member: '成员',
			unit: '单位',
			business: '业务口径',
			visible: '可见',
			cancel: '取消',
			save: '保存',
			saving: '保存中',
			initializing: '正在初始化指标管理插件...'
		},
		en_US: {
			remoteRequestFailed: 'Remote request failed',
			actionCompleted: 'Action completed',
			actionFailed: 'Action failed',
			requiredFields: 'Code and name are required.',
			selectProject: 'Select project',
			allModels: 'All models',
			searchPlaceholder: 'Search metric code, name, or business definition',
			search: 'Search',
			createMetric: 'Create metric',
			editMetric: 'Edit metric',
			projectRequired: 'Select a project to maintain metrics.',
			loadingMetrics: 'Loading metrics...',
			emptyMetrics: 'No metrics.',
			code: 'Code',
			name: 'Name',
			type: 'Type',
			status: 'Status',
			model: 'Model',
			embeddingStatus: 'Embedding',
			updatedAt: 'Updated at',
			actions: 'Actions',
			edit: 'Edit',
			publish: 'Publish',
			publishing: 'Publishing',
			embedding: 'Embed',
			embeddingBusy: 'Processing',
			delete: 'Delete',
			deleting: 'Deleting',
			confirmDelete: 'Delete this metric?',
			totalRows: '{total} total',
			page: 'Page {page}',
			previousPage: 'Previous',
			nextPage: 'Next',
			refresh: 'Refresh',
			close: 'Close',
			noModel: 'No model',
			cube: 'Cube',
			entity: 'Entity',
			description: 'Description',
			calendar: 'Calendar',
			measure: 'Measure',
			formula: 'Formula',
			filters: 'Filters',
			addFilter: 'Add filter',
			remove: 'Remove',
			dimension: 'Dimension',
			hierarchy: 'Hierarchy',
			member: 'Member',
			unit: 'Unit',
			business: 'Business definition',
			visible: 'Visible',
			cancel: 'Cancel',
			save: 'Save',
			saving: 'Saving',
			initializing: 'Initializing metric management plugin...'
		}
	}

	function isObject(value) {
		return value && typeof value === 'object' && !Array.isArray(value)
	}

	function normalizeLocale(locale) {
		const language = String(locale || navigator.language || '').toLowerCase()
		return language.startsWith('zh') ? 'zh_Hans' : 'en_US'
	}

	function createTranslator(locale) {
		const key = normalizeLocale(locale)
		const messages = I18N[key] || I18N.en_US
		return function translate(messageKey, values) {
			let text = messages[messageKey] || I18N.en_US[messageKey] || messageKey
			Object.keys(values || {}).forEach((name) => {
				text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(values[name]))
			})
			return text
		}
	}

	function resolveText(value, fallback, locale) {
		if (typeof value === 'string') return value
		if (!isObject(value)) return fallback || ''
		const language = String(locale || navigator.language || '').toLowerCase()
		const primary = language.startsWith('zh') ? value.zh_Hans : value.en_US
		const secondary = language.startsWith('zh') ? value.en_US : value.zh_Hans
		return primary || secondary || fallback || ''
	}

	function post(type, body) {
		if (!instanceId && type !== 'ready') return
		parent.postMessage(
			Object.assign(
				{
					channel: CHANNEL,
					protocolVersion: VERSION,
					instanceId,
					type
				},
				body || {}
			),
			'*'
		)
	}

	function request(type, body) {
		const requestId = String(++requestSequence)
		post(type, Object.assign({ requestId }, body || {}))
		return new Promise((resolve, reject) => {
			pending.set(requestId, { resolve, reject })
		})
	}

	function formatDate(value) {
		if (!value) return '-'
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
	}

	function reportResize() {
		const height = Math.max(
			document.body.scrollHeight,
			document.documentElement.scrollHeight,
			VIEWPORT_BOUND_FILL_HEIGHT
		)
		post('resize', { height, viewportBound: true })
	}

	window.addEventListener('message', (event) => {
		const message = event.data
		if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) {
			return
		}

		if (message.type === 'init') {
			instanceId = message.instanceId
			window.__metricAppSetContext &&
				window.__metricAppSetContext({
					manifest: message.manifest,
					payload: message.payload,
					initialQuery: message.initialQuery || {},
					locale: message.locale,
					theme: message.theme
				})
			setTimeout(reportResize, 0)
			return
		}

		if (message.instanceId !== instanceId) return

		if (message.type === 'hostEvent') {
			if (window.__metricAppHandleHostEvent) {
				window.__metricAppHandleHostEvent(message.event)
			}
			return
		}

		if (message.requestId && pending.has(message.requestId)) {
			const item = pending.get(message.requestId)
			pending.delete(message.requestId)
			if (message.type === 'error') {
				item.reject(new Error(message.message || createTranslator()('remoteRequestFailed')))
			} else {
				item.resolve(message)
			}
		}
	})

	function buildInitialQuery(context) {
		const initialQuery = context.initialQuery || {}
		return Object.assign({ page: 1, pageSize: 20 }, initialQuery, {
			parameters: Object.assign(
				{},
				(context.payload && context.payload.parameters) || {},
				initialQuery.parameters || {}
			)
		})
	}

	function getEventOutput(event) {
		const data = (event && event.data) || {}
		return isObject(data.output) ? data.output : data
	}

	function optionLabel(options, value) {
		const option = options.find((item) => item.value === value)
		return option ? option.label : value || ''
	}

	function buildFormState(row, query) {
		const draft = isObject(row && row.draft) ? row.draft : {}
		const options = isObject(draft.options) ? draft.options : isObject(row && row.options) ? row.options : {}
		return {
			code: draft.code || (row && row.code) || '',
			name: draft.name || (row && row.name) || '',
			type: draft.type || (row && row.type) || 'BASIC',
			modelId: draft.modelId || (row && row.modelId) || query.parameters.modelId || '',
			cube: draft.cube || draft.entity || (row && (row.cube || row.entity)) || '',
			entity: draft.entity || (row && row.entity) || '',
			description: draft.description || draft.business || (row && (row.description || row.business)) || '',
			business: draft.business || (row && row.business) || '',
			calendar: draft.calendar || options.calendar || '',
			measure: draft.measure || options.measure || '',
			formula: draft.formula || options.formula || '',
			filters: normalizeFilters(draft.filters || options.filters),
			unit: draft.unit || (row && row.unit) || '',
			visible:
				typeof draft.visible === 'boolean'
					? draft.visible
					: row && typeof row.visible === 'boolean'
						? row.visible
						: true
		}
	}

	function normalizeFilters(filters) {
		if (!Array.isArray(filters)) return []
		return filters
			.map((filter) => {
				if (!isObject(filter)) return null
				const dimension = isObject(filter.dimension) ? filter.dimension : {}
				const members = Array.isArray(filter.members) ? filter.members : []
				return {
					dimension:
						filter.dimension && !isObject(filter.dimension) ? filter.dimension : dimension.dimension || '',
					hierarchy: filter.hierarchy || dimension.hierarchy || '',
					member: filter.member || (members[0] && members[0].key) || ''
				}
			})
			.filter(Boolean)
	}

	function MetricApp() {
		const [context, setContext] = React.useState(null)
		const [query, setQuery] = React.useState({ page: 1, pageSize: 20, parameters: {} })
		const [data, setData] = React.useState({ items: [], total: 0 })
		const [projects, setProjects] = React.useState([])
		const [models, setModels] = React.useState([])
		const [searchInput, setSearchInput] = React.useState('')
		const [loading, setLoading] = React.useState(false)
		const [busy, setBusy] = React.useState('')
		const [notice, setNotice] = React.useState(null)
		const [modal, setModal] = React.useState(null)
		const [form, setForm] = React.useState(buildFormState(null, query))
		const locale = (context && context.locale) || navigator.language
		const t = React.useMemo(() => createTranslator(locale), [locale])

		window.__metricAppSetContext = setContext
		window.__metricAppHandleHostEvent = handleHostEvent

		React.useEffect(() => {
			if (!context) return
			const nextQuery = buildInitialQuery(context)
			setQuery(nextQuery)
			setSearchInput(nextQuery.search || '')
			loadProjects(nextQuery)
			if (nextQuery.parameters.projectId) {
				loadModels(nextQuery.parameters.projectId, nextQuery)
			}
			loadData(nextQuery)
		}, [context])

		React.useEffect(() => {
			reportResize()
		}, [data, projects, models, loading, notice, modal, form])

		async function loadProjects(nextQuery) {
			try {
				const response = await request('requestParameterOptions', {
					parameterKey: 'projectId',
					parameters: nextQuery.parameters
				})
				setProjects((response.result && response.result.items) || [])
			} catch (error) {
				setNotice({ error: true, text: error.message })
			}
		}

		async function loadModels(projectId, nextQuery) {
			try {
				const response = await request('requestParameterOptions', {
					parameterKey: 'modelId',
					parameters: Object.assign({}, nextQuery.parameters, { projectId })
				})
				setModels((response.result && response.result.items) || [])
			} catch (error) {
				setNotice({ error: true, text: error.message })
			}
		}

		async function loadData(nextQuery) {
			setLoading(true)
			try {
				const response = await request('requestData', { query: nextQuery })
				setData(response.data || { items: [], total: 0 })
				setNotice(null)
			} catch (error) {
				setNotice({ error: true, text: error.message })
			} finally {
				setLoading(false)
			}
		}

		function applyQuery(nextQuery) {
			setQuery(nextQuery)
			loadData(nextQuery)
		}

		function updateProject(projectId) {
			const parameters = Object.assign({}, query.parameters, { projectId })
			delete parameters.modelId
			const nextQuery = Object.assign({}, query, {
				page: 1,
				parameters
			})
			setModels([])
			setQuery(nextQuery)
			if (projectId) {
				loadModels(projectId, nextQuery)
			}
			loadData(nextQuery)
		}

		function updateModel(modelId) {
			const parameters = Object.assign({}, query.parameters)
			if (modelId) parameters.modelId = modelId
			else delete parameters.modelId
			applyQuery(Object.assign({}, query, { page: 1, parameters }))
		}

		async function executeAction(actionKey, options) {
			const targetId = options && options.targetId
			const input = options && options.input
			const busyKey = targetId ? `${actionKey}:${targetId}` : actionKey
			setBusy(busyKey)
			try {
				const response = await request('executeAction', {
					actionKey,
					targetId,
					input,
					parameters: query.parameters
				})
				const result = response.result || {}
				setNotice({
					error: !result.success,
					text: resolveText(result.message, result.success ? t('actionCompleted') : t('actionFailed'), locale)
				})
				if (result.refresh) {
					await loadData(query)
				}
				return result
			} catch (error) {
				setNotice({ error: true, text: error.message })
				return { success: false }
			} finally {
				setBusy('')
			}
		}

		function openModal(mode, row) {
			setForm(buildFormState(row, query))
			setModal({ mode, row })
		}

		async function submitForm() {
			if (!form.code.trim() || !form.name.trim()) {
				setNotice({ error: true, text: t('requiredFields') })
				return
			}
			const input = {
				code: form.code.trim(),
				name: form.name.trim(),
				type: form.type,
				modelId: form.modelId || undefined,
				cube: form.cube.trim() || form.entity.trim() || undefined,
				entity: form.cube.trim() || form.entity.trim() || undefined,
				description: form.description.trim() || form.business.trim() || undefined,
				business: form.description.trim() || form.business.trim() || undefined,
				calendar: form.calendar.trim() || undefined,
				measure: form.type === 'BASIC' ? form.measure.trim() || undefined : undefined,
				formula: form.type === 'DERIVE' ? form.formula.trim() || undefined : undefined,
				filters:
					form.type === 'BASIC'
						? form.filters
								.map((filter) => ({
									dimension: filter.dimension.trim(),
									hierarchy: filter.hierarchy.trim() || undefined,
									member: filter.member.trim()
								}))
								.filter((filter) => filter.dimension && filter.member)
						: undefined,
				unit: form.unit.trim() || undefined,
				visible: form.visible
			}
			const result = await executeAction(modal.mode === 'create' ? 'create' : 'edit', {
				targetId: modal.row && modal.row.id,
				input
			})
			if (result.success) {
				setModal(null)
			}
		}

		async function handleHostEvent(event) {
			if (!context || !event || event.type !== 'assistant.tool.completed') {
				return
			}
			const output = getEventOutput(event)
			const nextParameters = Object.assign({}, query.parameters)
			if (output && output.projectId) {
				nextParameters.projectId = output.projectId
			}
			if (output && output.modelId) {
				nextParameters.modelId = output.modelId
			}
			const nextQuery = Object.assign({}, query, {
				page: 1,
				parameters: nextParameters
			})
			setQuery(nextQuery)
			await loadData(nextQuery)
		}

		function renderToolbar() {
			const projectId = query.parameters.projectId || ''
			const modelId = query.parameters.modelId || ''
			return h(
				'div',
				{ className: 'xui-toolbar xui-metric-sticky-toolbar' },
				h(
					'select',
					{
						className: 'xui-control',
						value: projectId,
						onChange: (event) => updateProject(event.target.value)
					},
					h('option', { value: '' }, t('selectProject')),
					projects.map((project) => h('option', { key: project.value, value: project.value }, project.label))
				),
				h(
					'select',
					{
						className: 'xui-control',
						value: modelId,
						disabled: !projectId,
						onChange: (event) => updateModel(event.target.value)
					},
					h('option', { value: '' }, t('allModels')),
					models.map((model) => h('option', { key: model.value, value: model.value }, model.label))
				),
				h('input', {
					className: 'xui-input',
					value: searchInput,
					placeholder: t('searchPlaceholder'),
					onChange: (event) => setSearchInput(event.target.value),
					onKeyDown: (event) => {
						if (event.key === 'Enter') {
							applyQuery(Object.assign({}, query, { page: 1, search: searchInput }))
						}
					}
				}),
				h(
					'button',
					{
						className: 'xui-button',
						type: 'button',
						disabled: loading,
						onClick: () => applyQuery(Object.assign({}, query, { page: 1, search: searchInput }))
					},
					t('search')
				),
				h(
					'button',
					{
						className: 'xui-button xui-button-primary',
						type: 'button',
						disabled: !projectId || loading,
						onClick: () => openModal('create', null)
					},
					t('createMetric')
				)
			)
		}

		function renderRows() {
			const rows = Array.isArray(data.items) ? data.items : []
			if (!query.parameters.projectId) {
				return h('div', { className: 'xui-empty' }, t('projectRequired'))
			}
			if (loading) {
				return h('div', { className: 'xui-empty' }, t('loadingMetrics'))
			}
			if (rows.length === 0) {
				return h('div', { className: 'xui-empty' }, t('emptyMetrics'))
			}

			return h(
				'div',
				{ className: 'xui-table-wrap' },
				h(
					'table',
					{ className: 'xui-table' },
					h(
						'thead',
						null,
						h(
							'tr',
							null,
							[
								['code', t('code')],
								['name', t('name')],
								['type', t('type')],
								['status', t('status')],
								['model', t('model')],
								['entity', t('entity')],
								['business', t('business')],
								['unit', t('unit')],
								['embeddingStatus', t('embeddingStatus')],
								['updatedAt', t('updatedAt')],
								['actions', t('actions')]
							].map((column) => h('th', { key: column[0], style: NO_WRAP_STYLE }, column[1]))
						)
					),
					h(
						'tbody',
						null,
						rows.map((row) =>
							h(
								'tr',
								{ key: row.id },
								h('td', { style: NO_WRAP_STYLE }, row.code || '-'),
								h('td', { style: NO_WRAP_STYLE }, row.name || '-'),
								h(
									'td',
									{ style: NO_WRAP_STYLE },
									h('span', { className: 'xui-pill' }, row.type || '-')
								),
								h(
									'td',
									{ style: NO_WRAP_STYLE },
									h('span', { className: 'xui-pill' }, row.status || '-')
								),
								h(
									'td',
									{ style: NO_WRAP_STYLE },
									row.modelName || optionLabel(models, row.modelId) || '-'
								),
								h('td', { style: NO_WRAP_STYLE }, row.entity || '-'),
								h('td', { style: NO_WRAP_STYLE }, row.business || '-'),
								h('td', { style: NO_WRAP_STYLE }, row.unit || '-'),
								h(
									'td',
									{ style: NO_WRAP_STYLE },
									h('span', { className: 'xui-pill' }, row.embeddingStatus || '-')
								),
								h('td', { style: NO_WRAP_STYLE }, formatDate(row.updatedAt)),
								h(
									'td',
									{ className: 'xui-table-actions-cell', style: NO_WRAP_STYLE },
									h(
										'div',
										{ className: 'xui-actions xui-table-actions', style: ACTIONS_NO_WRAP_STYLE },
										h(
											'button',
											{
												className: 'xui-button xui-button-sm',
												type: 'button',
												style: NO_WRAP_STYLE,
												disabled: Boolean(busy),
												onClick: () => openModal('edit', row)
											},
											t('edit')
										),
										h(
											'button',
											{
												className: 'xui-button xui-button-sm',
												type: 'button',
												style: NO_WRAP_STYLE,
												disabled: Boolean(busy),
												onClick: () => executeAction('publish', { targetId: row.id })
											},
											busy === `publish:${row.id}` ? t('publishing') : t('publish')
										),
										h(
											'button',
											{
												className: 'xui-button xui-button-sm',
												type: 'button',
												style: NO_WRAP_STYLE,
												disabled: Boolean(busy),
												onClick: () => executeAction('embedding', { targetId: row.id })
											},
											busy === `embedding:${row.id}` ? t('embeddingBusy') : t('embedding')
										),
										h(
											'button',
											{
												className: 'xui-button xui-button-sm xui-button-danger',
												type: 'button',
												style: NO_WRAP_STYLE,
												disabled: Boolean(busy),
												onClick: () => {
													if (confirm(t('confirmDelete'))) {
														executeAction('delete', { targetId: row.id })
													}
												}
											},
											busy === `delete:${row.id}` ? t('deleting') : t('delete')
										)
									)
								)
							)
						)
					)
				)
			)
		}

		function renderPager() {
			const page = query.page || 1
			const pageSize = query.pageSize || 20
			const total = typeof data.total === 'number' ? data.total : 0
			const hasNext = page * pageSize < total
			return h(
				'div',
				{ className: 'xui-pager xui-metric-pager' },
				h('span', { className: 'xui-metric-pager-total' }, t('totalRows', { total })),
				h(
					'div',
					{ className: 'xui-actions xui-metric-pager-actions' },
					h(
						'button',
						{
							className: 'xui-button xui-button-sm',
							type: 'button',
							disabled: loading || page <= 1,
							onClick: () => applyQuery(Object.assign({}, query, { page: page - 1 }))
						},
						t('previousPage')
					),
					h('span', { className: 'xui-muted' }, t('page', { page })),
					h(
						'button',
						{
							className: 'xui-button xui-button-sm',
							type: 'button',
							disabled: loading || !hasNext,
							onClick: () => applyQuery(Object.assign({}, query, { page: page + 1 }))
						},
						t('nextPage')
					),
					h(
						'button',
						{
							className: 'xui-button xui-button-sm',
							type: 'button',
							disabled: loading,
							onClick: () => loadData(query)
						},
						t('refresh')
					)
				)
			)
		}

		function renderModal() {
			if (!modal) return null
			return h(
				'div',
				{ className: 'xui-modal-backdrop' },
				h(
					'div',
					{ className: 'xui-modal' },
					h(
						'div',
						{ className: 'xui-modal-header' },
						h(
							'h2',
							{ className: 'xui-modal-title' },
							modal.mode === 'create' ? t('createMetric') : t('editMetric')
						),
						h(
							'button',
							{ className: 'xui-button xui-button-sm', type: 'button', onClick: () => setModal(null) },
							t('close')
						)
					),
					h(
						'div',
						{ className: 'xui-form' },
						field(t('code'), 'code'),
						field(t('name'), 'name'),
						h(
							'div',
							{ className: 'xui-field' },
							h('label', null, t('type')),
							h(
								'select',
								{
									className: 'xui-input',
									value: form.type,
									onChange: (event) => setForm(Object.assign({}, form, { type: event.target.value }))
								},
								h('option', { value: 'BASIC' }, 'BASIC'),
								h('option', { value: 'DERIVE' }, 'DERIVE')
							)
						),
						h(
							'div',
							{ className: 'xui-field' },
							h('label', null, t('model')),
							h(
								'select',
								{
									className: 'xui-input',
									value: form.modelId,
									onChange: (event) =>
										setForm(Object.assign({}, form, { modelId: event.target.value }))
								},
								h('option', { value: '' }, t('noModel')),
								models.map((model) =>
									h('option', { key: model.value, value: model.value }, model.label)
								)
							)
						),
						field(t('cube'), 'cube'),
						field(t('calendar'), 'calendar'),
						form.type === 'BASIC' ? field(t('measure'), 'measure') : null,
						form.type === 'DERIVE'
							? h(
									'div',
									{ className: 'xui-field xui-field-full' },
									h('label', null, t('formula')),
									h('textarea', {
										className: 'xui-textarea',
										value: form.formula,
										onChange: (event) =>
											setForm(Object.assign({}, form, { formula: event.target.value }))
									})
								)
							: null,
						form.type === 'BASIC' ? renderFilters() : null,
						field(t('unit'), 'unit'),
						h(
							'div',
							{ className: 'xui-field xui-field-full' },
							h('label', null, t('business')),
							h('textarea', {
								className: 'xui-textarea',
								value: form.description,
								onChange: (event) =>
									setForm(
										Object.assign({}, form, {
											description: event.target.value,
											business: event.target.value
										})
									)
							})
						),
						h(
							'label',
							{ className: 'xui-checkbox' },
							h('input', {
								type: 'checkbox',
								checked: form.visible,
								onChange: (event) => setForm(Object.assign({}, form, { visible: event.target.checked }))
							}),
							t('visible')
						)
					),
					h(
						'div',
						{ className: 'xui-modal-footer' },
						h(
							'span',
							{ className: 'xui-muted' },
							query.parameters.projectId ? optionLabel(projects, query.parameters.projectId) : ''
						),
						h(
							'div',
							{ className: 'xui-actions' },
							h(
								'button',
								{
									className: 'xui-button',
									type: 'button',
									disabled: Boolean(busy),
									onClick: () => setModal(null)
								},
								t('cancel')
							),
							h(
								'button',
								{
									className: 'xui-button xui-button-primary',
									type: 'button',
									disabled: Boolean(busy),
									onClick: submitForm
								},
								busy ? t('saving') : t('save')
							)
						)
					)
				)
			)
		}

		function renderFilters() {
			const filters = Array.isArray(form.filters) ? form.filters : []
			return h(
				'div',
				{ className: 'xui-field xui-field-full' },
				h('label', null, t('filters')),
				filters.map((filter, index) =>
					h(
						'div',
						{ className: 'xui-actions', key: index },
						h('input', {
							className: 'xui-input',
							value: filter.dimension,
							placeholder: t('dimension'),
							onChange: (event) => updateFilter(index, { dimension: event.target.value })
						}),
						h('input', {
							className: 'xui-input',
							value: filter.hierarchy,
							placeholder: t('hierarchy'),
							onChange: (event) => updateFilter(index, { hierarchy: event.target.value })
						}),
						h('input', {
							className: 'xui-input',
							value: filter.member,
							placeholder: t('member'),
							onChange: (event) => updateFilter(index, { member: event.target.value })
						}),
						h(
							'button',
							{
								className: 'xui-button xui-button-sm',
								type: 'button',
								onClick: () => removeFilter(index)
							},
							t('remove')
						)
					)
				),
				h(
					'button',
					{
						className: 'xui-button xui-button-sm',
						type: 'button',
						onClick: () =>
							setForm(
								Object.assign({}, form, {
									filters: filters.concat([{ dimension: '', hierarchy: '', member: '' }])
								})
							)
					},
					t('addFilter')
				)
			)
		}

		function updateFilter(index, patch) {
			const filters = (Array.isArray(form.filters) ? form.filters : []).map((filter, itemIndex) =>
				itemIndex === index ? Object.assign({}, filter, patch) : filter
			)
			setForm(Object.assign({}, form, { filters }))
		}

		function removeFilter(index) {
			const filters = (Array.isArray(form.filters) ? form.filters : []).filter(
				(_, itemIndex) => itemIndex !== index
			)
			setForm(Object.assign({}, form, { filters }))
		}

		function field(label, key) {
			return h(
				'div',
				{ className: 'xui-field' },
				h('label', null, label),
				h('input', {
					className: 'xui-input',
					value: form[key],
					onChange: (event) => setForm(Object.assign({}, form, { [key]: event.target.value }))
				})
			)
		}

		if (!context) {
			return h('div', { className: 'xui-app xui-empty' }, t('initializing'))
		}

		return h(
			'div',
			{ className: 'xui-app' },
			renderToolbar(),
			notice
				? h('div', { className: notice.error ? 'xui-notice xui-notice-error' : 'xui-notice' }, notice.text)
				: null,
			renderRows(),
			renderPager(),
			renderModal()
		)
	}

	ReactDOM.createRoot(document.getElementById('root')).render(h(MetricApp))
	parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, type: 'ready' }, '*')
})()
