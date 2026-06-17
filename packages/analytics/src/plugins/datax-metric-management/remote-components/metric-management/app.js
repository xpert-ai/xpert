;(function () {
	const CHANNEL = 'xpertai.remote_component'
	const VERSION = 1
	const h = React.createElement
	const VIEWPORT_BOUND_FILL_HEIGHT = 100000
	const APPROVALS_VIEW_KEY = 'datax_metric_management__approvals'
	let instanceId = null
	let requestSequence = 0
	const pending = new Map()
	const NO_WRAP = { whiteSpace: 'nowrap' }
	const I18N = {
		zh_Hans: {
			actionCompleted: '操作已完成',
			actionFailed: '操作失败',
			addFilter: '添加过滤',
			allBusinessAreas: '全部业务域',
			allCertifications: '全部认证',
			allModels: '全部模型',
			allStatuses: '全部状态',
			allTags: '全部标签',
			allTypes: '全部类型',
			appAvailable: '应用可用',
			approvalPolicy: '审批策略',
			approve: '通过',
			approving: '处理中',
			bulkDelete: '删除选中',
			business: '业务口径',
			businessArea: '业务域',
			calendar: '日历',
			cancel: '取消',
			certification: '认证',
			close: '关闭',
			code: '编码',
			confirmBulkDelete: '确认删除选中的指标？',
			confirmDelete: '确认删除该指标？',
			confirmEmbedAll: '确认启动当前项目全部 released + visible 指标向量化？',
			confirmRefuse: '确认拒绝该审批？',
			createMetric: '新建指标',
			createdAt: '创建时间',
			createdBy: '发起人',
			delete: '删除',
			deleting: '删除中',
			dimension: '维度',
			dimensions: '自由维度',
			downloadResult: '下载结果',
			duplicate: '复制',
			duplicating: '复制中',
			edit: '编辑',
			editMetric: '编辑指标',
			embedAll: '全量向量化',
			embedding: '向量化',
			embeddingBusy: '处理中',
			embeddingStatus: '向量状态',
			entity: '实体',
			error: '错误',
			export: '导出',
			exporting: '导出中',
			falseValue: '否',
			filters: '过滤条件',
			formula: '公式',
			hierarchy: '层级',
			importFile: '导入 YAML',
			importing: '导入中',
			initializing: '正在初始化指标管理插件...',
			measure: '度量',
			member: '成员',
			model: '模型',
			name: '名称',
			nextPage: '下一页',
			noModel: '不指定模型',
			page: '第 {page} 页',
			permissionType: '权限类型',
			previousPage: '上一页',
			principal: '负责人',
			projectRequired: '请选择项目。',
			publish: '发布',
			publishedAt: '发布时间',
			publishing: '发布中',
			refresh: '刷新',
			refreshEmbedding: '刷新向量状态',
			refuse: '拒绝',
			refusing: '处理中',
			remove: '移除',
			requiredFields: '编码和名称为必填项。',
			save: '保存',
			saving: '保存中',
			search: '搜索',
			searchApprovals: '搜索审批、指标或发起人',
			searchMetrics: '搜索指标编码、名称或业务口径',
			selectProject: '选择项目',
			selectedRows: '已选 {count} 条',
			sqlAggregator: 'SQL 聚合器',
			status: '状态',
			tag: '标签',
			tags: '标签',
			totalRows: '共 {total} 条',
			trueValue: '是',
			type: '类型',
			unit: '单位',
			updatedAt: '更新时间',
			validity: '有效期',
			visible: '可见'
		},
		en_US: {
			actionCompleted: 'Action completed',
			actionFailed: 'Action failed',
			addFilter: 'Add filter',
			allBusinessAreas: 'All business areas',
			allCertifications: 'All certifications',
			allModels: 'All models',
			allStatuses: 'All statuses',
			allTags: 'All tags',
			allTypes: 'All types',
			appAvailable: 'App available',
			approvalPolicy: 'Approval policy',
			approve: 'Approve',
			approving: 'Working',
			bulkDelete: 'Delete selected',
			business: 'Business definition',
			businessArea: 'Business area',
			calendar: 'Calendar',
			cancel: 'Cancel',
			certification: 'Certification',
			close: 'Close',
			code: 'Code',
			confirmBulkDelete: 'Delete selected metrics?',
			confirmDelete: 'Delete this metric?',
			confirmEmbedAll: 'Start embedding all released and visible metrics in this project?',
			confirmRefuse: 'Refuse this approval?',
			createMetric: 'Create metric',
			createdAt: 'Created at',
			createdBy: 'Created by',
			delete: 'Delete',
			deleting: 'Deleting',
			dimension: 'Dimension',
			dimensions: 'Free dimensions',
			downloadResult: 'Download result',
			duplicate: 'Duplicate',
			duplicating: 'Duplicating',
			edit: 'Edit',
			editMetric: 'Edit metric',
			embedAll: 'Embed project',
			embedding: 'Embed',
			embeddingBusy: 'Processing',
			embeddingStatus: 'Embedding',
			entity: 'Entity',
			error: 'Error',
			export: 'Export',
			exporting: 'Exporting',
			falseValue: 'No',
			filters: 'Filters',
			formula: 'Formula',
			hierarchy: 'Hierarchy',
			importFile: 'Import YAML',
			importing: 'Importing',
			initializing: 'Initializing metric management plugin...',
			measure: 'Measure',
			member: 'Member',
			model: 'Model',
			name: 'Name',
			nextPage: 'Next',
			noModel: 'No model',
			page: 'Page {page}',
			permissionType: 'Permission type',
			previousPage: 'Previous',
			principal: 'Principal',
			projectRequired: 'Select a project.',
			publish: 'Publish',
			publishedAt: 'Published at',
			publishing: 'Publishing',
			refresh: 'Refresh',
			refreshEmbedding: 'Refresh embedding',
			refuse: 'Refuse',
			refusing: 'Working',
			remove: 'Remove',
			requiredFields: 'Code and name are required.',
			save: 'Save',
			saving: 'Saving',
			search: 'Search',
			searchApprovals: 'Search approvals, metrics, or requesters',
			searchMetrics: 'Search metric code, name, or business definition',
			selectProject: 'Select project',
			selectedRows: '{count} selected',
			sqlAggregator: 'SQL aggregator',
			status: 'Status',
			tag: 'Tag',
			tags: 'Tags',
			totalRows: '{total} total',
			trueValue: 'Yes',
			type: 'Type',
			unit: 'Unit',
			updatedAt: 'Updated at',
			validity: 'Validity',
			visible: 'Visible'
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
				text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), String(values[name]))
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

	function post(type, body, transfers) {
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
			'*',
			transfers || []
		)
	}

	function request(type, body, transfers) {
		const requestId = String(++requestSequence)
		post(type, Object.assign({ requestId }, body || {}), transfers)
		return new Promise((resolve, reject) => {
			pending.set(requestId, { resolve, reject })
		})
	}

	function formatDate(value) {
		if (!value) return '-'
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
	}

	function formatBoolean(value, t) {
		if (typeof value !== 'boolean') return '-'
		return value ? t('trueValue') : t('falseValue')
	}

	function optionLabel(options, value) {
		const option = options.find((item) => item.value === value)
		return option ? option.label : value || ''
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
			window.__metricAppHandleHostEvent && window.__metricAppHandleHostEvent(message.event)
			return
		}

		if (message.requestId && pending.has(message.requestId)) {
			const item = pending.get(message.requestId)
			pending.delete(message.requestId)
			if (message.type === 'error') {
				item.reject(new Error(message.message || 'Remote request failed'))
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

	function getManifestKey(context) {
		return (context && context.manifest && context.manifest.key) || ''
	}

	function isApprovalsView(context) {
		const key = getManifestKey(context)
		return key === APPROVALS_VIEW_KEY || key === 'approvals'
	}

	function getEventOutput(event) {
		const data = (event && event.data) || {}
		return isObject(data.output) ? data.output : data
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

	function buildFormState(row, query) {
		const draft = isObject(row && row.draft) ? row.draft : {}
		const options = isObject(draft.options) ? draft.options : isObject(row && row.options) ? row.options : {}
		return {
			code: draft.code || (row && row.code) || '',
			name: draft.name || (row && row.name) || '',
			type: draft.type || (row && row.type) || 'BASIC',
			modelId: draft.modelId || (row && row.modelId) || query.parameters.modelId || '',
			businessAreaId:
				draft.businessAreaId || (row && row.businessAreaId) || query.parameters.businessAreaId || '',
			certificationId:
				draft.certificationId || (row && row.certificationId) || query.parameters.certificationId || '',
			principal: draft.principal || (row && row.principal) || '',
			validity: draft.validity || (row && row.validity) || '',
			cube: draft.cube || draft.entity || (row && (row.cube || row.entity)) || '',
			entity: draft.entity || (row && row.entity) || '',
			description: draft.description || draft.business || (row && (row.description || row.business)) || '',
			business: draft.business || (row && row.business) || '',
			calendar: draft.calendar || options.calendar || '',
			measure: draft.measure || options.measure || '',
			formula: draft.formula || options.formula || '',
			aggregator: draft.aggregator || options.aggregator || '',
			dimensions: Array.isArray(draft.dimensions)
				? draft.dimensions.join(', ')
				: Array.isArray(options.dimensions)
					? options.dimensions.join(', ')
					: '',
			filters: normalizeFilters(draft.filters || options.filters),
			unit: draft.unit || (row && row.unit) || '',
			tags: Array.isArray(row && row.tags)
				? row.tags
						.map((tag) => tag.name || tag.id)
						.filter(Boolean)
						.join(', ')
				: '',
			visible:
				typeof draft.visible === 'boolean'
					? draft.visible
					: row && typeof row.visible === 'boolean'
						? row.visible
						: true,
			isApplication:
				typeof draft.isApplication === 'boolean'
					? draft.isApplication
					: row && typeof row.isApplication === 'boolean'
						? row.isApplication
						: false
		}
	}

	function MetricManagementApp() {
		const [context, setContext] = React.useState(null)
		const [query, setQuery] = React.useState({ page: 1, pageSize: 20, parameters: {} })
		const [data, setData] = React.useState({ items: [], total: 0 })
		const [projects, setProjects] = React.useState([])
		const [models, setModels] = React.useState([])
		const [businessAreas, setBusinessAreas] = React.useState([])
		const [certifications, setCertifications] = React.useState([])
		const [tags, setTags] = React.useState([])
		const [statuses, setStatuses] = React.useState([])
		const [types, setTypes] = React.useState([])
		const [selectedIds, setSelectedIds] = React.useState([])
		const [searchInput, setSearchInput] = React.useState('')
		const [loading, setLoading] = React.useState(false)
		const [busy, setBusy] = React.useState('')
		const [notice, setNotice] = React.useState(null)
		const [modal, setModal] = React.useState(null)
		const [form, setForm] = React.useState(buildFormState(null, query))
		const fileInputRef = React.useRef(null)
		const locale = (context && context.locale) || navigator.language
		const t = React.useMemo(() => createTranslator(locale), [locale])
		const approvalsView = isApprovalsView(context)

		window.__metricAppSetContext = setContext
		window.__metricAppHandleHostEvent = handleHostEvent

		React.useEffect(() => {
			if (!context) return
			const nextQuery = buildInitialQuery(context)
			setQuery(nextQuery)
			setSearchInput(nextQuery.search || '')
			loadProjects(nextQuery)
			if (!isApprovalsView(context)) {
				loadStaticMetricOptions(nextQuery)
				if (nextQuery.parameters.projectId) {
					loadProjectOptions(nextQuery.parameters.projectId, nextQuery)
				}
			}
			loadData(nextQuery)
		}, [context])

		React.useEffect(() => {
			reportResize()
		}, [data, projects, models, businessAreas, certifications, tags, selectedIds, loading, notice, modal, form])

		async function loadProjects(nextQuery) {
			try {
				const response = await request('requestParameterOptions', {
					parameterKey: 'projectId',
					query: { parameters: nextQuery.parameters }
				})
				setProjects((response.result && response.result.items) || [])
			} catch (error) {
				setNotice({ error: true, text: error.message })
			}
		}

		async function loadOption(parameterKey, nextQuery) {
			const response = await request('requestParameterOptions', {
				parameterKey,
				query: { parameters: nextQuery.parameters }
			})
			return (response.result && response.result.items) || []
		}

		async function loadStaticMetricOptions(nextQuery) {
			try {
				const responses = await Promise.all([
					loadOption('status', nextQuery),
					loadOption('type', nextQuery),
					loadOption('certificationId', nextQuery)
				])
				setStatuses(responses[0])
				setTypes(responses[1])
				setCertifications(responses[2])
			} catch (error) {
				setNotice({ error: true, text: error.message })
			}
		}

		async function loadProjectOptions(projectId, nextQuery) {
			const scopedQuery = Object.assign({}, nextQuery, {
				parameters: Object.assign({}, nextQuery.parameters, { projectId })
			})
			try {
				const responses = await Promise.all([
					loadOption('modelId', scopedQuery),
					loadOption('businessAreaId', scopedQuery),
					loadOption('tagId', scopedQuery)
				])
				setModels(responses[0])
				setBusinessAreas(responses[1])
				setTags(responses[2])
			} catch (error) {
				setNotice({ error: true, text: error.message })
			}
		}

		async function loadData(nextQuery) {
			setLoading(true)
			try {
				const response = await request('requestData', { query: nextQuery })
				setData(response.data || { items: [], total: 0 })
				setSelectedIds((current) => {
					const rowIds = new Set(((response.data && response.data.items) || []).map((row) => row.id))
					return current.filter((id) => rowIds.has(id))
				})
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
			const parameters = Object.assign({}, query.parameters)
			if (projectId) parameters.projectId = projectId
			else delete parameters.projectId
			delete parameters.modelId
			delete parameters.businessAreaId
			delete parameters.tagId
			const nextQuery = Object.assign({}, query, { page: 1, parameters })
			setModels([])
			setBusinessAreas([])
			setTags([])
			setSelectedIds([])
			setQuery(nextQuery)
			if (projectId && !approvalsView) {
				loadProjectOptions(projectId, nextQuery)
			}
			loadData(nextQuery)
		}

		function updateParameter(key, value) {
			const parameters = Object.assign({}, query.parameters)
			if (value === 'true') parameters[key] = true
			else if (value === 'false') parameters[key] = false
			else if (value) parameters[key] = value
			else delete parameters[key]
			const nextQuery = Object.assign({}, query, { page: 1, parameters })
			applyQuery(nextQuery)
		}

		async function executeAction(actionKey, options) {
			const targetId = options && options.targetId
			const input = options && options.input
			const busyKey = targetId ? actionKey + ':' + targetId : actionKey
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

		async function executeFileAction(actionKey, file) {
			setBusy(actionKey)
			try {
				const buffer = await file.arrayBuffer()
				const response = await request(
					'executeFileAction',
					{
						actionKey,
						parameters: query.parameters,
						file: {
							name: file.name,
							type: file.type,
							size: file.size,
							buffer
						}
					},
					[buffer]
				)
				const result = response.result || {}
				setNotice({
					error: !result.success,
					text: resolveText(result.message, result.success ? t('actionCompleted') : t('actionFailed'), locale)
				})
				if (result.data && result.data.resultContent) {
					downloadText(
						result.data.resultFileName || 'Indicator_Import_Results.yaml',
						result.data.resultContent,
						'application/x-yaml'
					)
				}
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

		async function exportMetrics() {
			const result = await executeAction('export', {
				input: Object.assign({}, query, { ids: selectedIds })
			})
			if (result.success && result.data && result.data.content) {
				downloadText(result.data.fileName || 'Indicators.yaml', result.data.content, result.data.mimeType)
			}
		}

		function downloadText(fileName, content, mimeType) {
			const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = fileName
			document.body.appendChild(link)
			link.click()
			link.remove()
			URL.revokeObjectURL(url)
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
			const filters =
				form.type === 'BASIC'
					? form.filters
							.map((filter) => ({
								dimension: filter.dimension.trim(),
								hierarchy: filter.hierarchy.trim() || undefined,
								member: filter.member.trim()
							}))
							.filter((filter) => filter.dimension && filter.member)
					: undefined
			const input = {
				code: form.code.trim(),
				name: form.name.trim(),
				type: form.type,
				modelId: form.modelId || undefined,
				businessAreaId: form.businessAreaId || undefined,
				certificationId: form.certificationId || undefined,
				principal: form.principal.trim() || undefined,
				validity: form.validity.trim() || undefined,
				cube: form.cube.trim() || form.entity.trim() || undefined,
				entity: form.cube.trim() || form.entity.trim() || undefined,
				description: form.description.trim() || form.business.trim() || undefined,
				business: form.description.trim() || form.business.trim() || undefined,
				calendar: form.calendar.trim() || undefined,
				measure: form.type === 'BASIC' ? form.measure.trim() || undefined : undefined,
				formula: form.type === 'DERIVE' ? form.formula.trim() || undefined : undefined,
				aggregator: form.aggregator.trim() || undefined,
				dimensions: form.dimensions
					.split(',')
					.map((item) => item.trim())
					.filter(Boolean),
				filters,
				unit: form.unit.trim() || undefined,
				visible: form.visible,
				isApplication: form.isApplication
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
			if (!context || approvalsView || !event || event.type !== 'assistant.tool.completed') {
				return
			}
			const output = getEventOutput(event)
			const nextParameters = Object.assign({}, query.parameters)
			const scope = output && isObject(output.metricScope) ? output.metricScope : null
			if (scope) {
				mergeScopeParameters(nextParameters, scope)
			} else {
				if (output && output.projectId) nextParameters.projectId = output.projectId
				if (output && output.modelId) nextParameters.modelId = output.modelId
				if (output && output.businessAreaId) nextParameters.businessAreaId = output.businessAreaId
			}
			const nextQuery = Object.assign({}, query, { page: 1, parameters: nextParameters })
			setQuery(nextQuery)
			if (nextParameters.projectId) {
				loadProjectOptions(nextParameters.projectId, nextQuery)
			}
			await loadData(nextQuery)
		}

		function mergeScopeParameters(parameters, scope) {
			if (scope.projectId) parameters.projectId = scope.projectId
			else delete parameters.projectId
			setSingleScopeParameter(parameters, 'modelId', scope.modelIds)
			setSingleScopeParameter(parameters, 'businessAreaId', scope.businessAreaIds)
			setSingleScopeParameter(parameters, 'certificationId', scope.certificationIds)
			setSingleScopeParameter(parameters, 'tagId', scope.tagIds)
			if (typeof scope.isApplication === 'boolean') parameters.isApplication = scope.isApplication
			else delete parameters.isApplication
			if (scope.status) parameters.status = scope.status
			else delete parameters.status
			if (scope.type) parameters.type = scope.type
			else delete parameters.type
		}

		function setSingleScopeParameter(parameters, key, values) {
			if (Array.isArray(values) && values.length === 1) parameters[key] = values[0]
			else delete parameters[key]
		}

		function toggleSelected(id, checked) {
			setSelectedIds((current) =>
				checked ? Array.from(new Set(current.concat(id))) : current.filter((item) => item !== id)
			)
		}

		function toggleAllRows(checked) {
			const rowIds = ((data && data.items) || []).map((row) => row.id).filter(Boolean)
			setSelectedIds(checked ? rowIds : [])
		}

		function renderProjectFilter() {
			const projectId = query.parameters.projectId || ''
			return h(
				'select',
				{
					className: 'xui-control',
					value: projectId,
					onChange: (event) => updateProject(event.target.value)
				},
				h('option', { value: '' }, t('selectProject')),
				projects.map((project) => h('option', { key: project.value, value: project.value }, project.label))
			)
		}

		function renderMetricToolbar() {
			const projectId = query.parameters.projectId || ''
			return h(
				'div',
				{ className: 'xui-toolbar xui-metric-sticky-toolbar' },
				renderProjectFilter(),
				selectFilter('modelId', t('allModels'), models, !projectId),
				selectFilter('businessAreaId', t('allBusinessAreas'), businessAreas, !projectId),
				selectFilter('status', t('allStatuses'), statuses),
				selectFilter('type', t('allTypes'), types),
				selectFilter('certificationId', t('allCertifications'), certifications),
				selectFilter('tagId', t('allTags'), tags, !projectId),
				h(
					'select',
					{
						className: 'xui-control',
						value:
							typeof query.parameters.isApplication === 'boolean'
								? String(query.parameters.isApplication)
								: '',
						onChange: (event) => updateParameter('isApplication', event.target.value)
					},
					h('option', { value: '' }, t('appAvailable')),
					h('option', { value: 'true' }, t('trueValue')),
					h('option', { value: 'false' }, t('falseValue'))
				),
				searchInputControl(t('searchMetrics')),
				toolbarButton(t('search'), 'search', loading, () =>
					applyQuery(Object.assign({}, query, { page: 1, search: searchInput }))
				),
				toolbarButton(
					t('createMetric'),
					'createMetric',
					!projectId || loading,
					() => openModal('create', null),
					true
				),
				toolbarButton(
					busy === 'export' ? t('exporting') : t('export'),
					'export',
					loading || !projectId,
					exportMetrics
				),
				toolbarButton(
					busy === 'bulk_delete' ? t('deleting') : t('bulkDelete'),
					'bulkDelete',
					!selectedIds.length || Boolean(busy),
					() => {
						if (confirm(t('confirmBulkDelete'))) {
							executeAction('bulk_delete', { input: { ids: selectedIds } })
						}
					}
				),
				toolbarButton(
					busy === 'start_embedding_project' ? t('embeddingBusy') : t('embedAll'),
					'embedAll',
					!projectId || Boolean(busy),
					() => {
						if (confirm(t('confirmEmbedAll'))) {
							executeAction('start_embedding_project')
						}
					}
				),
				toolbarButton(
					busy === 'refresh_embedding_status' ? t('embeddingBusy') : t('refreshEmbedding'),
					'refreshEmbedding',
					loading || !projectId,
					() => executeAction('refresh_embedding_status', { input: query })
				),
				h('input', {
					ref: fileInputRef,
					type: 'file',
					accept: '.yaml,.yml,application/x-yaml,text/yaml,text/plain',
					style: { display: 'none' },
					onChange: (event) => {
						const file = event.target.files && event.target.files[0]
						event.target.value = ''
						if (file) executeFileAction('import', file)
					}
				}),
				toolbarButton(
					busy === 'import' ? t('importing') : t('importFile'),
					'importFile',
					!projectId || Boolean(busy),
					() => fileInputRef.current && fileInputRef.current.click()
				)
			)
		}

		function renderApprovalsToolbar() {
			return h(
				'div',
				{ className: 'xui-toolbar xui-metric-sticky-toolbar' },
				renderProjectFilter(),
				searchInputControl(t('searchApprovals')),
				toolbarButton(t('search'), 'search', loading, () =>
					applyQuery(Object.assign({}, query, { page: 1, search: searchInput }))
				),
				toolbarButton(t('refresh'), 'refresh', loading, () => loadData(query))
			)
		}

		function selectFilter(key, placeholder, options, disabled) {
			return h(
				'select',
				{
					className: 'xui-control',
					value: query.parameters[key] || '',
					disabled: Boolean(disabled),
					onChange: (event) => updateParameter(key, event.target.value)
				},
				h('option', { value: '' }, placeholder),
				options.map((item) => h('option', { key: item.value, value: item.value }, item.label))
			)
		}

		function searchInputControl(placeholder) {
			return h('input', {
				className: 'xui-input',
				value: searchInput,
				placeholder,
				onChange: (event) => setSearchInput(event.target.value),
				onKeyDown: (event) => {
					if (event.key === 'Enter') {
						applyQuery(Object.assign({}, query, { page: 1, search: searchInput }))
					}
				}
			})
		}

		function toolbarButton(label, key, disabled, onClick, primary) {
			return h(
				'button',
				{
					className: primary ? 'xui-button xui-button-primary' : 'xui-button',
					type: 'button',
					disabled,
					onClick
				},
				label
			)
		}

		function renderMetricsRows() {
			const rows = Array.isArray(data.items) ? data.items : []
			if (!query.parameters.projectId) return h('div', { className: 'xui-empty' }, t('projectRequired'))
			if (loading) return h('div', { className: 'xui-empty' }, '...')
			if (!rows.length) return h('div', { className: 'xui-empty' }, '-')
			const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id))

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
							h(
								'th',
								{ style: NO_WRAP },
								h('input', {
									type: 'checkbox',
									checked: allSelected,
									onChange: (event) => toggleAllRows(event.target.checked)
								})
							),
							[
								['code', t('code')],
								['name', t('name')],
								['type', t('type')],
								['status', t('status')],
								['model', t('model')],
								['businessArea', t('businessArea')],
								['certification', t('certification')],
								['entity', t('entity')],
								['appAvailable', t('appAvailable')],
								['visible', t('visible')],
								['embeddingStatus', t('embeddingStatus')],
								['publishedAt', t('publishedAt')],
								['updatedAt', t('updatedAt')],
								['actions', '']
							].map((column) => h('th', { key: column[0], style: NO_WRAP }, column[1]))
						)
					),
					h(
						'tbody',
						null,
						rows.map((row) =>
							h(
								'tr',
								{ key: row.id },
								h(
									'td',
									{ style: NO_WRAP },
									h('input', {
										type: 'checkbox',
										checked: selectedIds.includes(row.id),
										onChange: (event) => toggleSelected(row.id, event.target.checked)
									})
								),
								h('td', { style: NO_WRAP }, row.code || '-'),
								h('td', { style: NO_WRAP }, row.name || '-'),
								pillCell(row.type),
								pillCell(row.status),
								h('td', { style: NO_WRAP }, row.modelName || optionLabel(models, row.modelId) || '-'),
								h(
									'td',
									{ style: NO_WRAP },
									row.businessAreaName || optionLabel(businessAreas, row.businessAreaId) || '-'
								),
								h(
									'td',
									{ style: NO_WRAP },
									row.certificationName || optionLabel(certifications, row.certificationId) || '-'
								),
								h('td', { style: NO_WRAP }, row.entity || '-'),
								h('td', { style: NO_WRAP }, formatBoolean(row.isApplication, t)),
								h('td', { style: NO_WRAP }, formatBoolean(row.visible, t)),
								pillCell(row.embeddingStatus || '-'),
								h('td', { style: NO_WRAP }, formatDate(row.publishedAt)),
								h('td', { style: NO_WRAP }, formatDate(row.updatedAt)),
								h(
									'td',
									{ className: 'xui-table-actions-cell', style: NO_WRAP },
									h(
										'div',
										{ className: 'xui-actions xui-table-actions' },
										rowButton(t('edit'), () => openModal('edit', row), Boolean(busy)),
										rowButton(
											busy === 'duplicate:' + row.id ? t('duplicating') : t('duplicate'),
											() => executeAction('duplicate', { targetId: row.id }),
											Boolean(busy)
										),
										rowButton(
											busy === 'publish:' + row.id ? t('publishing') : t('publish'),
											() => executeAction('publish', { targetId: row.id }),
											Boolean(busy)
										),
										rowButton(
											busy === 'embedding:' + row.id ? t('embeddingBusy') : t('embedding'),
											() => executeAction('embedding', { targetId: row.id }),
											Boolean(busy)
										),
										rowButton(
											busy === 'delete:' + row.id ? t('deleting') : t('delete'),
											() => {
												if (confirm(t('confirmDelete')))
													executeAction('delete', { targetId: row.id })
											},
											Boolean(busy),
											true
										)
									)
								)
							)
						)
					)
				)
			)
		}

		function renderApprovalRows() {
			const rows = Array.isArray(data.items) ? data.items : []
			if (!query.parameters.projectId) return h('div', { className: 'xui-empty' }, t('projectRequired'))
			if (loading) return h('div', { className: 'xui-empty' }, '...')
			if (!rows.length) return h('div', { className: 'xui-empty' }, '-')
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
								['indicatorCode', t('code')],
								['indicatorName', t('name')],
								['status', t('status')],
								['permissionType', t('permissionType')],
								['approvalPolicyName', t('approvalPolicy')],
								['indicatorGroupName', t('businessArea')],
								['createdByName', t('createdBy')],
								['createdAt', t('createdAt')],
								['actions', '']
							].map((column) => h('th', { key: column[0], style: NO_WRAP }, column[1]))
						)
					),
					h(
						'tbody',
						null,
						rows.map((row) =>
							h(
								'tr',
								{ key: row.id },
								h('td', { style: NO_WRAP }, row.indicatorCode || '-'),
								h('td', { style: NO_WRAP }, row.indicatorName || '-'),
								pillCell(row.statusLabel || row.status || '-'),
								h('td', { style: NO_WRAP }, row.permissionType || '-'),
								h('td', { style: NO_WRAP }, row.approvalPolicyName || '-'),
								h('td', { style: NO_WRAP }, row.indicatorGroupName || '-'),
								h('td', { style: NO_WRAP }, row.createdByName || '-'),
								h('td', { style: NO_WRAP }, formatDate(row.createdAt)),
								h(
									'td',
									{ className: 'xui-table-actions-cell', style: NO_WRAP },
									h(
										'div',
										{ className: 'xui-actions xui-table-actions' },
										rowButton(
											busy === 'approve:' + row.id ? t('approving') : t('approve'),
											() => executeAction('approve', { targetId: row.id }),
											Boolean(busy)
										),
										rowButton(
											busy === 'refuse:' + row.id ? t('refusing') : t('refuse'),
											() => {
												if (confirm(t('confirmRefuse')))
													executeAction('refuse', { targetId: row.id })
											},
											Boolean(busy),
											true
										)
									)
								)
							)
						)
					)
				)
			)
		}

		function pillCell(value) {
			return h('td', { style: NO_WRAP }, h('span', { className: 'xui-pill' }, value || '-'))
		}

		function rowButton(label, onClick, disabled, danger) {
			return h(
				'button',
				{
					className: danger ? 'xui-button xui-button-sm xui-button-danger' : 'xui-button xui-button-sm',
					type: 'button',
					style: NO_WRAP,
					disabled,
					onClick
				},
				label
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
				h(
					'span',
					{ className: 'xui-metric-pager-total' },
					t('totalRows', { total }) +
						(selectedIds.length ? ' / ' + t('selectedRows', { count: selectedIds.length }) : '')
				),
				h(
					'div',
					{ className: 'xui-actions xui-metric-pager-actions' },
					rowButton(
						t('previousPage'),
						() => applyQuery(Object.assign({}, query, { page: page - 1 })),
						loading || page <= 1
					),
					h('span', { className: 'xui-muted' }, t('page', { page })),
					rowButton(
						t('nextPage'),
						() => applyQuery(Object.assign({}, query, { page: page + 1 })),
						loading || !hasNext
					),
					rowButton(t('refresh'), () => loadData(query), loading)
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
						rowButton(t('close'), () => setModal(null), false)
					),
					h(
						'div',
						{ className: 'xui-form' },
						field(t('code'), 'code'),
						field(t('name'), 'name'),
						selectField(t('type'), 'type', [
							{ value: 'BASIC', label: 'BASIC' },
							{ value: 'DERIVE', label: 'DERIVE' }
						]),
						selectField(t('model'), 'modelId', [{ value: '', label: t('noModel') }].concat(models)),
						selectField(
							t('businessArea'),
							'businessAreaId',
							[{ value: '', label: t('allBusinessAreas') }].concat(businessAreas)
						),
						selectField(
							t('certification'),
							'certificationId',
							[{ value: '', label: t('allCertifications') }].concat(certifications)
						),
						field(t('principal'), 'principal'),
						field(t('validity'), 'validity', 'date'),
						field(t('entity'), 'cube'),
						field(t('calendar'), 'calendar'),
						form.type === 'BASIC' ? field(t('measure'), 'measure') : null,
						form.type === 'DERIVE' ? textArea(t('formula'), 'formula') : null,
						field(t('sqlAggregator'), 'aggregator'),
						field(t('dimensions'), 'dimensions'),
						form.type === 'BASIC' ? renderFilters() : null,
						field(t('unit'), 'unit'),
						textArea(t('business'), 'description'),
						field(t('tags'), 'tags', 'text', true),
						checkboxField(t('visible'), 'visible'),
						checkboxField(t('appAvailable'), 'isApplication')
					),
					h(
						'div',
						{ className: 'xui-modal-footer' },
						h('span', { className: 'xui-muted' }, optionLabel(projects, query.parameters.projectId)),
						h(
							'div',
							{ className: 'xui-actions' },
							rowButton(t('cancel'), () => setModal(null), Boolean(busy)),
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

		function field(label, key, type, disabled) {
			return h(
				'div',
				{ className: 'xui-field' },
				h('label', null, label),
				h('input', {
					className: 'xui-input',
					type: type || 'text',
					value: form[key],
					disabled: Boolean(disabled),
					onChange: (event) => setForm(Object.assign({}, form, { [key]: event.target.value }))
				})
			)
		}

		function textArea(label, key) {
			return h(
				'div',
				{ className: 'xui-field xui-field-full' },
				h('label', null, label),
				h('textarea', {
					className: 'xui-textarea',
					value: form[key],
					onChange: (event) => setForm(Object.assign({}, form, { [key]: event.target.value }))
				})
			)
		}

		function selectField(label, key, options) {
			return h(
				'div',
				{ className: 'xui-field' },
				h('label', null, label),
				h(
					'select',
					{
						className: 'xui-input',
						value: form[key],
						onChange: (event) => setForm(Object.assign({}, form, { [key]: event.target.value }))
					},
					options.map((item) => h('option', { key: item.value || '__empty', value: item.value }, item.label))
				)
			)
		}

		function checkboxField(label, key) {
			return h(
				'label',
				{ className: 'xui-checkbox' },
				h('input', {
					type: 'checkbox',
					checked: Boolean(form[key]),
					onChange: (event) => setForm(Object.assign({}, form, { [key]: event.target.checked }))
				}),
				label
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
						filterInput(index, 'dimension', t('dimension')),
						filterInput(index, 'hierarchy', t('hierarchy')),
						filterInput(index, 'member', t('member')),
						rowButton(t('remove'), () => removeFilter(index), false)
					)
				),
				rowButton(
					t('addFilter'),
					() =>
						setForm(
							Object.assign({}, form, {
								filters: filters.concat([{ dimension: '', hierarchy: '', member: '' }])
							})
						),
					false
				)
			)
		}

		function filterInput(index, key, placeholder) {
			const filters = Array.isArray(form.filters) ? form.filters : []
			const filter = filters[index] || {}
			return h('input', {
				className: 'xui-input',
				value: filter[key] || '',
				placeholder,
				onChange: (event) => updateFilter(index, { [key]: event.target.value })
			})
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

		if (!context) {
			return h('div', { className: 'xui-app xui-empty' }, t('initializing'))
		}

		return h(
			'div',
			{ className: 'xui-app' },
			approvalsView ? renderApprovalsToolbar() : renderMetricToolbar(),
			notice
				? h('div', { className: notice.error ? 'xui-notice xui-notice-error' : 'xui-notice' }, notice.text)
				: null,
			approvalsView ? renderApprovalRows() : renderMetricsRows(),
			renderPager(),
			renderModal()
		)
	}

	ReactDOM.createRoot(document.getElementById('root')).render(h(MetricManagementApp))
	parent.postMessage({ channel: CHANNEL, protocolVersion: VERSION, type: 'ready' }, '*')
})()
