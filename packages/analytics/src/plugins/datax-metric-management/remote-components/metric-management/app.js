;(() => {
	var Mh = Object.defineProperty
	var au = (e) => {
		throw TypeError(e)
	}
	var y = (e, t, a) => () => {
		if (a) throw a[0]
		try {
			return (e && (t = e((e = 0))), t)
		} catch (o) {
			throw ((a = [o]), o)
		}
	}
	var Dh = (e, t) => () => {
			try {
				return (t || e((t = { exports: {} }).exports, t), t.exports)
			} catch (a) {
				throw ((t = 0), a)
			}
		},
		Je = (e, t) => {
			for (var a in t) Mh(e, a, { get: t[a], enumerable: !0 })
		}
	var ou = (e, t, a) => t.has(e) || au('Cannot ' + a)
	var Fa = (e, t, a) => (ou(e, t, 'read from private field'), a ? a.call(e) : t.get(e)),
		Jn = (e, t, a) =>
			t.has(e)
				? au('Cannot add the same private member more than once')
				: t instanceof WeakSet
					? t.add(e)
					: t.set(e, a),
		Yn = (e, t, a, o) => (ou(e, t, 'write to private field'), o ? o.call(e, a) : t.set(e, a), a)
	var ae = {}
	Je(ae, {
		Children: () => ct,
		Component: () => Eh,
		Fragment: () => Ye,
		Profiler: () => Oh,
		PureComponent: () => Fh,
		StrictMode: () => Bh,
		Suspense: () => Nh,
		cloneElement: () => yt,
		createContext: () => Ee,
		createElement: () => Re,
		createRef: () => _h,
		default: () => ra,
		forwardRef: () => S,
		isValidElement: () => Ba,
		lazy: () => zh,
		memo: () => Lo,
		startTransition: () => Hh,
		useCallback: () => G,
		useContext: () => _e,
		useDebugValue: () => Uh,
		useDeferredValue: () => qh,
		useEffect: () => E,
		useId: () => Na,
		useImperativeHandle: () => hr,
		useInsertionEffect: () => Vh,
		useLayoutEffect: () => Rt,
		useMemo: () => we,
		useReducer: () => _a,
		useRef: () => w,
		useState: () => T,
		useSyncExternalStore: () => Zn,
		useTransition: () => Gh,
		version: () => Wh
	})
	var de,
		ra,
		ct,
		Eh,
		Ye,
		Oh,
		Fh,
		Bh,
		Nh,
		yt,
		Ee,
		Re,
		_h,
		S,
		Ba,
		zh,
		Lo,
		Hh,
		G,
		_e,
		Uh,
		qh,
		E,
		Na,
		hr,
		Vh,
		Rt,
		we,
		_a,
		w,
		T,
		Zn,
		Gh,
		Wh,
		Q = y(() => {
			;((de = globalThis.React),
				(ra = de),
				(ct = de.Children),
				(Eh = de.Component),
				(Ye = de.Fragment),
				(Oh = de.Profiler),
				(Fh = de.PureComponent),
				(Bh = de.StrictMode),
				(Nh = de.Suspense),
				(yt = de.cloneElement),
				(Ee = de.createContext),
				(Re = de.createElement),
				(_h = de.createRef),
				(S = de.forwardRef),
				(Ba = de.isValidElement),
				(zh = de.lazy),
				(Lo = de.memo),
				(Hh = de.startTransition),
				(G = de.useCallback),
				(_e = de.useContext),
				(Uh = de.useDebugValue),
				(qh = de.useDeferredValue),
				(E = de.useEffect),
				(Na = de.useId),
				(hr = de.useImperativeHandle),
				(Vh = de.useInsertionEffect),
				(Rt = de.useLayoutEffect),
				(we = de.useMemo),
				(_a = de.useReducer),
				(w = de.useRef),
				(T = de.useState),
				(Zn = de.useSyncExternalStore),
				(Gh = de.useTransition),
				(Wh = de.version))
		})
	var ru,
		nu,
		hw,
		su = y(() => {
			;((ru = globalThis.ReactDOM), (nu = ru.createRoot), (hw = ru.hydrateRoot))
		})
	function lu(e = {}) {
		let t = e.styleId ?? 'xpert-shadcn-ui-theme-vars'
		if (typeof document > 'u') return
		e.density === 'compact'
			? (document.documentElement.dataset.xuiDensity = 'compact')
			: e.density === 'default' && delete document.documentElement.dataset.xuiDensity
		let a = document.getElementById(t)
		;(a || ((a = document.createElement('style')), (a.id = t), document.head.appendChild(a)),
			(a.textContent = `
    :root {
      --background: var(--xui-color-background, #ffffff);
      --foreground: var(--xui-color-foreground, #18181b);
      --card: var(--xui-color-card, var(--background));
      --card-foreground: var(--xui-color-card-foreground, var(--foreground));
      --popover: var(--xui-color-popover, var(--card));
      --popover-foreground: var(--xui-color-popover-foreground, var(--foreground));
      --primary: var(--xui-color-primary, #0f766e);
      --primary-foreground: var(--xui-color-primary-foreground, #ffffff);
      --secondary: var(--xui-color-secondary, var(--xui-color-muted, #f4f4f5));
      --secondary-foreground: var(--xui-color-secondary-foreground, var(--foreground));
      --muted: var(--xui-color-muted, #f4f4f5);
      --muted-foreground: var(--xui-color-muted-foreground, #71717a);
      --accent: var(--xui-color-accent, oklch(0.58 0.18 255));
      --accent-foreground: var(--xui-color-accent-foreground, oklch(0.985 0 0));
      --destructive: var(--xui-color-destructive, #dc2626);
      --destructive-foreground: var(--xui-color-destructive-foreground, #ffffff);
      --success: var(--xui-color-success, #047857);
      --warning: var(--xui-color-warning, #b45309);
      --info: var(--xui-color-info, #2563eb);
      --border: var(--xui-color-border, #e4e4e7);
      --input: var(--xui-color-input, var(--border));
      --ring: var(--xui-color-ring, var(--primary));
      --chart-1: var(--xui-color-chart-1, #0f766e);
      --chart-2: var(--xui-color-chart-2, #2563eb);
      --chart-3: var(--xui-color-chart-3, #f59e0b);
      --chart-4: var(--xui-color-chart-4, #dc2626);
      --chart-5: var(--xui-color-chart-5, #7c3aed);
      --radius: var(--xui-radius-md, 0.5rem);
      --font-sans: var(--xui-font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    }

    .dark,
    [data-theme='dark'] {
      --background: var(--xui-color-background, #09090b);
      --foreground: var(--xui-color-foreground, #fafafa);
      --card: var(--xui-color-card, #18181b);
      --card-foreground: var(--xui-color-card-foreground, var(--foreground));
      --popover: var(--xui-color-popover, var(--card));
      --popover-foreground: var(--xui-color-popover-foreground, var(--foreground));
      --secondary: var(--xui-color-secondary, #27272a);
      --secondary-foreground: var(--xui-color-secondary-foreground, var(--foreground));
      --muted: var(--xui-color-muted, #27272a);
      --muted-foreground: var(--xui-color-muted-foreground, #a1a1aa);
      --accent: var(--xui-color-accent, oklch(0.58 0.18 255));
      --accent-foreground: var(--xui-color-accent-foreground, oklch(0.985 0 0));
      --destructive: var(--xui-color-destructive, #f87171);
      --destructive-foreground: var(--xui-color-destructive-foreground, #ffffff);
      --success: var(--xui-color-success, #34d399);
      --warning: var(--xui-color-warning, #fbbf24);
      --info: var(--xui-color-info, #60a5fa);
      --border: var(--xui-color-border, #27272a);
      --input: var(--xui-color-input, var(--border));
    }
  `))
	}
	var iu = y(() => {})
	function uu(e) {
		var t,
			a,
			o = ''
		if (typeof e == 'string' || typeof e == 'number') o += e
		else if (typeof e == 'object')
			if (Array.isArray(e)) {
				var r = e.length
				for (t = 0; t < r; t++) e[t] && (a = uu(e[t])) && (o && (o += ' '), (o += a))
			} else for (a in e) e[a] && (o && (o += ' '), (o += a))
		return o
	}
	function xr() {
		for (var e, t, a = 0, o = '', r = arguments.length; a < r; a++)
			(e = arguments[a]) && (t = uu(e)) && (o && (o += ' '), (o += t))
		return o
	}
	var Qn = y(() => {})
	var jh,
		Xh,
		gu,
		du,
		Kh,
		$h,
		hu,
		Jh,
		Yh,
		Zh,
		ts,
		Qh,
		ex,
		tx,
		ax,
		xu,
		ox,
		rx,
		nx,
		cu,
		sx,
		lx,
		ix,
		ux,
		dx,
		cx,
		vu,
		fx,
		px,
		Ae,
		Cu,
		bu,
		mx,
		gx,
		hx,
		xx,
		vx,
		Cx,
		za,
		le,
		qt,
		es,
		Pt,
		Lu,
		bx,
		as,
		Lx,
		Ix,
		Sx,
		wx,
		J,
		na,
		fu,
		yx,
		Rx,
		pu,
		Px,
		vr,
		Y,
		Io,
		kx,
		mu,
		Tx,
		Ax,
		Cr,
		Mx,
		Vt,
		sa,
		Iu,
		Su,
		wu,
		yu,
		Dx,
		Ru,
		Pu,
		ku,
		Ex,
		Tu,
		Au = y(() => {
			;((jh = (e, t) => {
				let a = new Array(e.length + t.length)
				for (let o = 0; o < e.length; o++) a[o] = e[o]
				for (let o = 0; o < t.length; o++) a[e.length + o] = t[o]
				return a
			}),
				(Xh = (e, t) => ({ classGroupId: e, validator: t })),
				(gu = (e = new Map(), t = null, a) => ({ nextPart: e, validators: t, classGroupId: a })),
				(du = []),
				(Kh = 'arbitrary..'),
				($h = (e) => {
					let t = Yh(e),
						{ conflictingClassGroups: a, conflictingClassGroupModifiers: o } = e
					return {
						getClassGroupId: (l) => {
							if (l.startsWith('[') && l.endsWith(']')) return Jh(l)
							let i = l.split('-'),
								u = i[0] === '' && i.length > 1 ? 1 : 0
							return hu(i, u, t)
						},
						getConflictingClassGroupIds: (l, i) => {
							if (i) {
								let u = o[l],
									d = a[l]
								return u ? (d ? jh(d, u) : u) : d || du
							}
							return a[l] || du
						}
					}
				}),
				(hu = (e, t, a) => {
					if (e.length - t === 0) return a.classGroupId
					let r = e[t],
						n = a.nextPart.get(r)
					if (n) {
						let d = hu(e, t + 1, n)
						if (d) return d
					}
					let l = a.validators
					if (l === null) return
					let i = t === 0 ? e.join('-') : e.slice(t).join('-'),
						u = l.length
					for (let d = 0; d < u; d++) {
						let c = l[d]
						if (c.validator(i)) return c.classGroupId
					}
				}),
				(Jh = (e) =>
					e.slice(1, -1).indexOf(':') === -1
						? void 0
						: (() => {
								let t = e.slice(1, -1),
									a = t.indexOf(':'),
									o = t.slice(0, a)
								return o ? Kh + o : void 0
							})()),
				(Yh = (e) => {
					let { theme: t, classGroups: a } = e
					return Zh(a, t)
				}),
				(Zh = (e, t) => {
					let a = gu()
					for (let o in e) {
						let r = e[o]
						ts(r, a, o, t)
					}
					return a
				}),
				(ts = (e, t, a, o) => {
					let r = e.length
					for (let n = 0; n < r; n++) {
						let l = e[n]
						Qh(l, t, a, o)
					}
				}),
				(Qh = (e, t, a, o) => {
					if (typeof e == 'string') {
						ex(e, t, a)
						return
					}
					if (typeof e == 'function') {
						tx(e, t, a, o)
						return
					}
					ax(e, t, a, o)
				}),
				(ex = (e, t, a) => {
					let o = e === '' ? t : xu(t, e)
					o.classGroupId = a
				}),
				(tx = (e, t, a, o) => {
					if (ox(e)) {
						ts(e(o), t, a, o)
						return
					}
					;(t.validators === null && (t.validators = []), t.validators.push(Xh(a, e)))
				}),
				(ax = (e, t, a, o) => {
					let r = Object.entries(e),
						n = r.length
					for (let l = 0; l < n; l++) {
						let [i, u] = r[l]
						ts(u, xu(t, i), a, o)
					}
				}),
				(xu = (e, t) => {
					let a = e,
						o = t.split('-'),
						r = o.length
					for (let n = 0; n < r; n++) {
						let l = o[n],
							i = a.nextPart.get(l)
						;(i || ((i = gu()), a.nextPart.set(l, i)), (a = i))
					}
					return a
				}),
				(ox = (e) => 'isThemeGetter' in e && e.isThemeGetter === !0),
				(rx = (e) => {
					if (e < 1) return { get: () => {}, set: () => {} }
					let t = 0,
						a = Object.create(null),
						o = Object.create(null),
						r = (n, l) => {
							;((a[n] = l), t++, t > e && ((t = 0), (o = a), (a = Object.create(null))))
						}
					return {
						get(n) {
							let l = a[n]
							if (l !== void 0) return l
							if ((l = o[n]) !== void 0) return (r(n, l), l)
						},
						set(n, l) {
							n in a ? (a[n] = l) : r(n, l)
						}
					}
				}),
				(nx = []),
				(cu = (e, t, a, o, r) => ({
					modifiers: e,
					hasImportantModifier: t,
					baseClassName: a,
					maybePostfixModifierPosition: o,
					isExternal: r
				})),
				(sx = (e) => {
					let { prefix: t, experimentalParseClassName: a } = e,
						o = (r) => {
							let n = [],
								l = 0,
								i = 0,
								u = 0,
								d,
								c = r.length
							for (let p = 0; p < c; p++) {
								let x = r[p]
								if (l === 0 && i === 0) {
									if (x === ':') {
										;(n.push(r.slice(u, p)), (u = p + 1))
										continue
									}
									if (x === '/') {
										d = p
										continue
									}
								}
								x === '[' ? l++ : x === ']' ? l-- : x === '(' ? i++ : x === ')' && i--
							}
							let f = n.length === 0 ? r : r.slice(u),
								m = f,
								h = !1
							f.endsWith('!')
								? ((m = f.slice(0, -1)), (h = !0))
								: f.startsWith('!') && ((m = f.slice(1)), (h = !0))
							let g = d && d > u ? d - u : void 0
							return cu(n, h, m, g)
						}
					if (t) {
						let r = t + ':',
							n = o
						o = (l) => (l.startsWith(r) ? n(l.slice(r.length)) : cu(nx, !1, l, void 0, !0))
					}
					if (a) {
						let r = o
						o = (n) => a({ className: n, parseClassName: r })
					}
					return o
				}),
				(lx = (e) => {
					let t = new Map()
					return (
						e.orderSensitiveModifiers.forEach((a, o) => {
							t.set(a, 1e6 + o)
						}),
						(a) => {
							let o = [],
								r = []
							for (let n = 0; n < a.length; n++) {
								let l = a[n],
									i = l[0] === '[',
									u = t.has(l)
								i || u ? (r.length > 0 && (r.sort(), o.push(...r), (r = [])), o.push(l)) : r.push(l)
							}
							return (r.length > 0 && (r.sort(), o.push(...r)), o)
						}
					)
				}),
				(ix = (e) => ({ cache: rx(e.cacheSize), parseClassName: sx(e), sortModifiers: lx(e), ...$h(e) })),
				(ux = /\s+/),
				(dx = (e, t) => {
					let { parseClassName: a, getClassGroupId: o, getConflictingClassGroupIds: r, sortModifiers: n } = t,
						l = [],
						i = e.trim().split(ux),
						u = ''
					for (let d = i.length - 1; d >= 0; d -= 1) {
						let c = i[d],
							{
								isExternal: f,
								modifiers: m,
								hasImportantModifier: h,
								baseClassName: g,
								maybePostfixModifierPosition: p
							} = a(c)
						if (f) {
							u = c + (u.length > 0 ? ' ' + u : u)
							continue
						}
						let x = !!p,
							v = o(x ? g.substring(0, p) : g)
						if (!v) {
							if (!x) {
								u = c + (u.length > 0 ? ' ' + u : u)
								continue
							}
							if (((v = o(g)), !v)) {
								u = c + (u.length > 0 ? ' ' + u : u)
								continue
							}
							x = !1
						}
						let C = m.length === 0 ? '' : m.length === 1 ? m[0] : n(m).join(':'),
							b = h ? C + '!' : C,
							L = b + v
						if (l.indexOf(L) > -1) continue
						l.push(L)
						let I = r(v, x)
						for (let k = 0; k < I.length; ++k) {
							let P = I[k]
							l.push(b + P)
						}
						u = c + (u.length > 0 ? ' ' + u : u)
					}
					return u
				}),
				(cx = (...e) => {
					let t = 0,
						a,
						o,
						r = ''
					for (; t < e.length; ) (a = e[t++]) && (o = vu(a)) && (r && (r += ' '), (r += o))
					return r
				}),
				(vu = (e) => {
					if (typeof e == 'string') return e
					let t,
						a = ''
					for (let o = 0; o < e.length; o++) e[o] && (t = vu(e[o])) && (a && (a += ' '), (a += t))
					return a
				}),
				(fx = (e, ...t) => {
					let a,
						o,
						r,
						n,
						l = (u) => {
							let d = t.reduce((c, f) => f(c), e())
							return ((a = ix(d)), (o = a.cache.get), (r = a.cache.set), (n = i), i(u))
						},
						i = (u) => {
							let d = o(u)
							if (d) return d
							let c = dx(u, a)
							return (r(u, c), c)
						}
					return ((n = l), (...u) => n(cx(...u)))
				}),
				(px = []),
				(Ae = (e) => {
					let t = (a) => a[e] || px
					return ((t.isThemeGetter = !0), t)
				}),
				(Cu = /^\[(?:(\w[\w-]*):)?(.+)\]$/i),
				(bu = /^\((?:(\w[\w-]*):)?(.+)\)$/i),
				(mx = /^\d+\/\d+$/),
				(gx = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/),
				(hx =
					/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/),
				(xx = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/),
				(vx = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/),
				(Cx = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/),
				(za = (e) => mx.test(e)),
				(le = (e) => !!e && !Number.isNaN(Number(e))),
				(qt = (e) => !!e && Number.isInteger(Number(e))),
				(es = (e) => e.endsWith('%') && le(e.slice(0, -1))),
				(Pt = (e) => gx.test(e)),
				(Lu = () => !0),
				(bx = (e) => hx.test(e) && !xx.test(e)),
				(as = () => !1),
				(Lx = (e) => vx.test(e)),
				(Ix = (e) => Cx.test(e)),
				(Sx = (e) => !J(e) && !Y(e)),
				(wx = (e) => Vt(e, wu, as)),
				(J = (e) => Cu.test(e)),
				(na = (e) => Vt(e, yu, bx)),
				(fu = (e) => Vt(e, Dx, le)),
				(yx = (e) => Vt(e, Pu, Lu)),
				(Rx = (e) => Vt(e, Ru, as)),
				(pu = (e) => Vt(e, Iu, as)),
				(Px = (e) => Vt(e, Su, Ix)),
				(vr = (e) => Vt(e, ku, Lx)),
				(Y = (e) => bu.test(e)),
				(Io = (e) => sa(e, yu)),
				(kx = (e) => sa(e, Ru)),
				(mu = (e) => sa(e, Iu)),
				(Tx = (e) => sa(e, wu)),
				(Ax = (e) => sa(e, Su)),
				(Cr = (e) => sa(e, ku, !0)),
				(Mx = (e) => sa(e, Pu, !0)),
				(Vt = (e, t, a) => {
					let o = Cu.exec(e)
					return o ? (o[1] ? t(o[1]) : a(o[2])) : !1
				}),
				(sa = (e, t, a = !1) => {
					let o = bu.exec(e)
					return o ? (o[1] ? t(o[1]) : a) : !1
				}),
				(Iu = (e) => e === 'position' || e === 'percentage'),
				(Su = (e) => e === 'image' || e === 'url'),
				(wu = (e) => e === 'length' || e === 'size' || e === 'bg-size'),
				(yu = (e) => e === 'length'),
				(Dx = (e) => e === 'number'),
				(Ru = (e) => e === 'family-name'),
				(Pu = (e) => e === 'number' || e === 'weight'),
				(ku = (e) => e === 'shadow'),
				(Ex = () => {
					let e = Ae('color'),
						t = Ae('font'),
						a = Ae('text'),
						o = Ae('font-weight'),
						r = Ae('tracking'),
						n = Ae('leading'),
						l = Ae('breakpoint'),
						i = Ae('container'),
						u = Ae('spacing'),
						d = Ae('radius'),
						c = Ae('shadow'),
						f = Ae('inset-shadow'),
						m = Ae('text-shadow'),
						h = Ae('drop-shadow'),
						g = Ae('blur'),
						p = Ae('perspective'),
						x = Ae('aspect'),
						v = Ae('ease'),
						C = Ae('animate'),
						b = () => ['auto', 'avoid', 'all', 'avoid-page', 'page', 'left', 'right', 'column'],
						L = () => [
							'center',
							'top',
							'bottom',
							'left',
							'right',
							'top-left',
							'left-top',
							'top-right',
							'right-top',
							'bottom-right',
							'right-bottom',
							'bottom-left',
							'left-bottom'
						],
						I = () => [...L(), Y, J],
						k = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'],
						P = () => ['auto', 'contain', 'none'],
						R = () => [Y, J, u],
						O = () => [za, 'full', 'auto', ...R()],
						U = () => [qt, 'none', 'subgrid', Y, J],
						N = () => ['auto', { span: ['full', qt, Y, J] }, qt, Y, J],
						V = () => [qt, 'auto', Y, J],
						K = () => ['auto', 'min', 'max', 'fr', Y, J],
						W = () => [
							'start',
							'end',
							'center',
							'between',
							'around',
							'evenly',
							'stretch',
							'baseline',
							'center-safe',
							'end-safe'
						],
						ee = () => ['start', 'end', 'center', 'stretch', 'center-safe', 'end-safe'],
						X = () => ['auto', ...R()],
						oe = () => [
							za,
							'auto',
							'full',
							'dvw',
							'dvh',
							'lvw',
							'lvh',
							'svw',
							'svh',
							'min',
							'max',
							'fit',
							...R()
						],
						M = () => [e, Y, J],
						z = () => [...L(), mu, pu, { position: [Y, J] }],
						re = () => ['no-repeat', { repeat: ['', 'x', 'y', 'space', 'round'] }],
						ue = () => ['auto', 'cover', 'contain', Tx, wx, { size: [Y, J] }],
						Se = () => [es, Io, na],
						ie = () => ['', 'none', 'full', d, Y, J],
						ce = () => ['', le, Io, na],
						ke = () => ['solid', 'dashed', 'dotted', 'double'],
						fe = () => [
							'normal',
							'multiply',
							'screen',
							'overlay',
							'darken',
							'lighten',
							'color-dodge',
							'color-burn',
							'hard-light',
							'soft-light',
							'difference',
							'exclusion',
							'hue',
							'saturation',
							'color',
							'luminosity'
						],
						H = () => [le, es, mu, pu],
						se = () => ['', 'none', g, Y, J],
						Ce = () => ['none', le, Y, J],
						ne = () => ['none', le, Y, J],
						ge = () => [le, Y, J],
						xe = () => [za, 'full', ...R()]
					return {
						cacheSize: 500,
						theme: {
							animate: ['spin', 'ping', 'pulse', 'bounce'],
							aspect: ['video'],
							blur: [Pt],
							breakpoint: [Pt],
							color: [Lu],
							container: [Pt],
							'drop-shadow': [Pt],
							ease: ['in', 'out', 'in-out'],
							font: [Sx],
							'font-weight': [
								'thin',
								'extralight',
								'light',
								'normal',
								'medium',
								'semibold',
								'bold',
								'extrabold',
								'black'
							],
							'inset-shadow': [Pt],
							leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
							perspective: ['dramatic', 'near', 'normal', 'midrange', 'distant', 'none'],
							radius: [Pt],
							shadow: [Pt],
							spacing: ['px', le],
							text: [Pt],
							'text-shadow': [Pt],
							tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']
						},
						classGroups: {
							aspect: [{ aspect: ['auto', 'square', za, J, Y, x] }],
							container: ['container'],
							columns: [{ columns: [le, J, Y, i] }],
							'break-after': [{ 'break-after': b() }],
							'break-before': [{ 'break-before': b() }],
							'break-inside': [{ 'break-inside': ['auto', 'avoid', 'avoid-page', 'avoid-column'] }],
							'box-decoration': [{ 'box-decoration': ['slice', 'clone'] }],
							box: [{ box: ['border', 'content'] }],
							display: [
								'block',
								'inline-block',
								'inline',
								'flex',
								'inline-flex',
								'table',
								'inline-table',
								'table-caption',
								'table-cell',
								'table-column',
								'table-column-group',
								'table-footer-group',
								'table-header-group',
								'table-row-group',
								'table-row',
								'flow-root',
								'grid',
								'inline-grid',
								'contents',
								'list-item',
								'hidden'
							],
							sr: ['sr-only', 'not-sr-only'],
							float: [{ float: ['right', 'left', 'none', 'start', 'end'] }],
							clear: [{ clear: ['left', 'right', 'both', 'none', 'start', 'end'] }],
							isolation: ['isolate', 'isolation-auto'],
							'object-fit': [{ object: ['contain', 'cover', 'fill', 'none', 'scale-down'] }],
							'object-position': [{ object: I() }],
							overflow: [{ overflow: k() }],
							'overflow-x': [{ 'overflow-x': k() }],
							'overflow-y': [{ 'overflow-y': k() }],
							overscroll: [{ overscroll: P() }],
							'overscroll-x': [{ 'overscroll-x': P() }],
							'overscroll-y': [{ 'overscroll-y': P() }],
							position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
							inset: [{ inset: O() }],
							'inset-x': [{ 'inset-x': O() }],
							'inset-y': [{ 'inset-y': O() }],
							start: [{ start: O() }],
							end: [{ end: O() }],
							top: [{ top: O() }],
							right: [{ right: O() }],
							bottom: [{ bottom: O() }],
							left: [{ left: O() }],
							visibility: ['visible', 'invisible', 'collapse'],
							z: [{ z: [qt, 'auto', Y, J] }],
							basis: [{ basis: [za, 'full', 'auto', i, ...R()] }],
							'flex-direction': [{ flex: ['row', 'row-reverse', 'col', 'col-reverse'] }],
							'flex-wrap': [{ flex: ['nowrap', 'wrap', 'wrap-reverse'] }],
							flex: [{ flex: [le, za, 'auto', 'initial', 'none', J] }],
							grow: [{ grow: ['', le, Y, J] }],
							shrink: [{ shrink: ['', le, Y, J] }],
							order: [{ order: [qt, 'first', 'last', 'none', Y, J] }],
							'grid-cols': [{ 'grid-cols': U() }],
							'col-start-end': [{ col: N() }],
							'col-start': [{ 'col-start': V() }],
							'col-end': [{ 'col-end': V() }],
							'grid-rows': [{ 'grid-rows': U() }],
							'row-start-end': [{ row: N() }],
							'row-start': [{ 'row-start': V() }],
							'row-end': [{ 'row-end': V() }],
							'grid-flow': [{ 'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense'] }],
							'auto-cols': [{ 'auto-cols': K() }],
							'auto-rows': [{ 'auto-rows': K() }],
							gap: [{ gap: R() }],
							'gap-x': [{ 'gap-x': R() }],
							'gap-y': [{ 'gap-y': R() }],
							'justify-content': [{ justify: [...W(), 'normal'] }],
							'justify-items': [{ 'justify-items': [...ee(), 'normal'] }],
							'justify-self': [{ 'justify-self': ['auto', ...ee()] }],
							'align-content': [{ content: ['normal', ...W()] }],
							'align-items': [{ items: [...ee(), { baseline: ['', 'last'] }] }],
							'align-self': [{ self: ['auto', ...ee(), { baseline: ['', 'last'] }] }],
							'place-content': [{ 'place-content': W() }],
							'place-items': [{ 'place-items': [...ee(), 'baseline'] }],
							'place-self': [{ 'place-self': ['auto', ...ee()] }],
							p: [{ p: R() }],
							px: [{ px: R() }],
							py: [{ py: R() }],
							ps: [{ ps: R() }],
							pe: [{ pe: R() }],
							pt: [{ pt: R() }],
							pr: [{ pr: R() }],
							pb: [{ pb: R() }],
							pl: [{ pl: R() }],
							m: [{ m: X() }],
							mx: [{ mx: X() }],
							my: [{ my: X() }],
							ms: [{ ms: X() }],
							me: [{ me: X() }],
							mt: [{ mt: X() }],
							mr: [{ mr: X() }],
							mb: [{ mb: X() }],
							ml: [{ ml: X() }],
							'space-x': [{ 'space-x': R() }],
							'space-x-reverse': ['space-x-reverse'],
							'space-y': [{ 'space-y': R() }],
							'space-y-reverse': ['space-y-reverse'],
							size: [{ size: oe() }],
							w: [{ w: [i, 'screen', ...oe()] }],
							'min-w': [{ 'min-w': [i, 'screen', 'none', ...oe()] }],
							'max-w': [{ 'max-w': [i, 'screen', 'none', 'prose', { screen: [l] }, ...oe()] }],
							h: [{ h: ['screen', 'lh', ...oe()] }],
							'min-h': [{ 'min-h': ['screen', 'lh', 'none', ...oe()] }],
							'max-h': [{ 'max-h': ['screen', 'lh', ...oe()] }],
							'font-size': [{ text: ['base', a, Io, na] }],
							'font-smoothing': ['antialiased', 'subpixel-antialiased'],
							'font-style': ['italic', 'not-italic'],
							'font-weight': [{ font: [o, Mx, yx] }],
							'font-stretch': [
								{
									'font-stretch': [
										'ultra-condensed',
										'extra-condensed',
										'condensed',
										'semi-condensed',
										'normal',
										'semi-expanded',
										'expanded',
										'extra-expanded',
										'ultra-expanded',
										es,
										J
									]
								}
							],
							'font-family': [{ font: [kx, Rx, t] }],
							'fvn-normal': ['normal-nums'],
							'fvn-ordinal': ['ordinal'],
							'fvn-slashed-zero': ['slashed-zero'],
							'fvn-figure': ['lining-nums', 'oldstyle-nums'],
							'fvn-spacing': ['proportional-nums', 'tabular-nums'],
							'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
							tracking: [{ tracking: [r, Y, J] }],
							'line-clamp': [{ 'line-clamp': [le, 'none', Y, fu] }],
							leading: [{ leading: [n, ...R()] }],
							'list-image': [{ 'list-image': ['none', Y, J] }],
							'list-style-position': [{ list: ['inside', 'outside'] }],
							'list-style-type': [{ list: ['disc', 'decimal', 'none', Y, J] }],
							'text-alignment': [{ text: ['left', 'center', 'right', 'justify', 'start', 'end'] }],
							'placeholder-color': [{ placeholder: M() }],
							'text-color': [{ text: M() }],
							'text-decoration': ['underline', 'overline', 'line-through', 'no-underline'],
							'text-decoration-style': [{ decoration: [...ke(), 'wavy'] }],
							'text-decoration-thickness': [{ decoration: [le, 'from-font', 'auto', Y, na] }],
							'text-decoration-color': [{ decoration: M() }],
							'underline-offset': [{ 'underline-offset': [le, 'auto', Y, J] }],
							'text-transform': ['uppercase', 'lowercase', 'capitalize', 'normal-case'],
							'text-overflow': ['truncate', 'text-ellipsis', 'text-clip'],
							'text-wrap': [{ text: ['wrap', 'nowrap', 'balance', 'pretty'] }],
							indent: [{ indent: R() }],
							'vertical-align': [
								{
									align: [
										'baseline',
										'top',
										'middle',
										'bottom',
										'text-top',
										'text-bottom',
										'sub',
										'super',
										Y,
										J
									]
								}
							],
							whitespace: [
								{ whitespace: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'] }
							],
							break: [{ break: ['normal', 'words', 'all', 'keep'] }],
							wrap: [{ wrap: ['break-word', 'anywhere', 'normal'] }],
							hyphens: [{ hyphens: ['none', 'manual', 'auto'] }],
							content: [{ content: ['none', Y, J] }],
							'bg-attachment': [{ bg: ['fixed', 'local', 'scroll'] }],
							'bg-clip': [{ 'bg-clip': ['border', 'padding', 'content', 'text'] }],
							'bg-origin': [{ 'bg-origin': ['border', 'padding', 'content'] }],
							'bg-position': [{ bg: z() }],
							'bg-repeat': [{ bg: re() }],
							'bg-size': [{ bg: ue() }],
							'bg-image': [
								{
									bg: [
										'none',
										{
											linear: [{ to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] }, qt, Y, J],
											radial: ['', Y, J],
											conic: [qt, Y, J]
										},
										Ax,
										Px
									]
								}
							],
							'bg-color': [{ bg: M() }],
							'gradient-from-pos': [{ from: Se() }],
							'gradient-via-pos': [{ via: Se() }],
							'gradient-to-pos': [{ to: Se() }],
							'gradient-from': [{ from: M() }],
							'gradient-via': [{ via: M() }],
							'gradient-to': [{ to: M() }],
							rounded: [{ rounded: ie() }],
							'rounded-s': [{ 'rounded-s': ie() }],
							'rounded-e': [{ 'rounded-e': ie() }],
							'rounded-t': [{ 'rounded-t': ie() }],
							'rounded-r': [{ 'rounded-r': ie() }],
							'rounded-b': [{ 'rounded-b': ie() }],
							'rounded-l': [{ 'rounded-l': ie() }],
							'rounded-ss': [{ 'rounded-ss': ie() }],
							'rounded-se': [{ 'rounded-se': ie() }],
							'rounded-ee': [{ 'rounded-ee': ie() }],
							'rounded-es': [{ 'rounded-es': ie() }],
							'rounded-tl': [{ 'rounded-tl': ie() }],
							'rounded-tr': [{ 'rounded-tr': ie() }],
							'rounded-br': [{ 'rounded-br': ie() }],
							'rounded-bl': [{ 'rounded-bl': ie() }],
							'border-w': [{ border: ce() }],
							'border-w-x': [{ 'border-x': ce() }],
							'border-w-y': [{ 'border-y': ce() }],
							'border-w-s': [{ 'border-s': ce() }],
							'border-w-e': [{ 'border-e': ce() }],
							'border-w-t': [{ 'border-t': ce() }],
							'border-w-r': [{ 'border-r': ce() }],
							'border-w-b': [{ 'border-b': ce() }],
							'border-w-l': [{ 'border-l': ce() }],
							'divide-x': [{ 'divide-x': ce() }],
							'divide-x-reverse': ['divide-x-reverse'],
							'divide-y': [{ 'divide-y': ce() }],
							'divide-y-reverse': ['divide-y-reverse'],
							'border-style': [{ border: [...ke(), 'hidden', 'none'] }],
							'divide-style': [{ divide: [...ke(), 'hidden', 'none'] }],
							'border-color': [{ border: M() }],
							'border-color-x': [{ 'border-x': M() }],
							'border-color-y': [{ 'border-y': M() }],
							'border-color-s': [{ 'border-s': M() }],
							'border-color-e': [{ 'border-e': M() }],
							'border-color-t': [{ 'border-t': M() }],
							'border-color-r': [{ 'border-r': M() }],
							'border-color-b': [{ 'border-b': M() }],
							'border-color-l': [{ 'border-l': M() }],
							'divide-color': [{ divide: M() }],
							'outline-style': [{ outline: [...ke(), 'none', 'hidden'] }],
							'outline-offset': [{ 'outline-offset': [le, Y, J] }],
							'outline-w': [{ outline: ['', le, Io, na] }],
							'outline-color': [{ outline: M() }],
							shadow: [{ shadow: ['', 'none', c, Cr, vr] }],
							'shadow-color': [{ shadow: M() }],
							'inset-shadow': [{ 'inset-shadow': ['none', f, Cr, vr] }],
							'inset-shadow-color': [{ 'inset-shadow': M() }],
							'ring-w': [{ ring: ce() }],
							'ring-w-inset': ['ring-inset'],
							'ring-color': [{ ring: M() }],
							'ring-offset-w': [{ 'ring-offset': [le, na] }],
							'ring-offset-color': [{ 'ring-offset': M() }],
							'inset-ring-w': [{ 'inset-ring': ce() }],
							'inset-ring-color': [{ 'inset-ring': M() }],
							'text-shadow': [{ 'text-shadow': ['none', m, Cr, vr] }],
							'text-shadow-color': [{ 'text-shadow': M() }],
							opacity: [{ opacity: [le, Y, J] }],
							'mix-blend': [{ 'mix-blend': [...fe(), 'plus-darker', 'plus-lighter'] }],
							'bg-blend': [{ 'bg-blend': fe() }],
							'mask-clip': [
								{ 'mask-clip': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] },
								'mask-no-clip'
							],
							'mask-composite': [{ mask: ['add', 'subtract', 'intersect', 'exclude'] }],
							'mask-image-linear-pos': [{ 'mask-linear': [le] }],
							'mask-image-linear-from-pos': [{ 'mask-linear-from': H() }],
							'mask-image-linear-to-pos': [{ 'mask-linear-to': H() }],
							'mask-image-linear-from-color': [{ 'mask-linear-from': M() }],
							'mask-image-linear-to-color': [{ 'mask-linear-to': M() }],
							'mask-image-t-from-pos': [{ 'mask-t-from': H() }],
							'mask-image-t-to-pos': [{ 'mask-t-to': H() }],
							'mask-image-t-from-color': [{ 'mask-t-from': M() }],
							'mask-image-t-to-color': [{ 'mask-t-to': M() }],
							'mask-image-r-from-pos': [{ 'mask-r-from': H() }],
							'mask-image-r-to-pos': [{ 'mask-r-to': H() }],
							'mask-image-r-from-color': [{ 'mask-r-from': M() }],
							'mask-image-r-to-color': [{ 'mask-r-to': M() }],
							'mask-image-b-from-pos': [{ 'mask-b-from': H() }],
							'mask-image-b-to-pos': [{ 'mask-b-to': H() }],
							'mask-image-b-from-color': [{ 'mask-b-from': M() }],
							'mask-image-b-to-color': [{ 'mask-b-to': M() }],
							'mask-image-l-from-pos': [{ 'mask-l-from': H() }],
							'mask-image-l-to-pos': [{ 'mask-l-to': H() }],
							'mask-image-l-from-color': [{ 'mask-l-from': M() }],
							'mask-image-l-to-color': [{ 'mask-l-to': M() }],
							'mask-image-x-from-pos': [{ 'mask-x-from': H() }],
							'mask-image-x-to-pos': [{ 'mask-x-to': H() }],
							'mask-image-x-from-color': [{ 'mask-x-from': M() }],
							'mask-image-x-to-color': [{ 'mask-x-to': M() }],
							'mask-image-y-from-pos': [{ 'mask-y-from': H() }],
							'mask-image-y-to-pos': [{ 'mask-y-to': H() }],
							'mask-image-y-from-color': [{ 'mask-y-from': M() }],
							'mask-image-y-to-color': [{ 'mask-y-to': M() }],
							'mask-image-radial': [{ 'mask-radial': [Y, J] }],
							'mask-image-radial-from-pos': [{ 'mask-radial-from': H() }],
							'mask-image-radial-to-pos': [{ 'mask-radial-to': H() }],
							'mask-image-radial-from-color': [{ 'mask-radial-from': M() }],
							'mask-image-radial-to-color': [{ 'mask-radial-to': M() }],
							'mask-image-radial-shape': [{ 'mask-radial': ['circle', 'ellipse'] }],
							'mask-image-radial-size': [
								{ 'mask-radial': [{ closest: ['side', 'corner'], farthest: ['side', 'corner'] }] }
							],
							'mask-image-radial-pos': [{ 'mask-radial-at': L() }],
							'mask-image-conic-pos': [{ 'mask-conic': [le] }],
							'mask-image-conic-from-pos': [{ 'mask-conic-from': H() }],
							'mask-image-conic-to-pos': [{ 'mask-conic-to': H() }],
							'mask-image-conic-from-color': [{ 'mask-conic-from': M() }],
							'mask-image-conic-to-color': [{ 'mask-conic-to': M() }],
							'mask-mode': [{ mask: ['alpha', 'luminance', 'match'] }],
							'mask-origin': [
								{ 'mask-origin': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] }
							],
							'mask-position': [{ mask: z() }],
							'mask-repeat': [{ mask: re() }],
							'mask-size': [{ mask: ue() }],
							'mask-type': [{ 'mask-type': ['alpha', 'luminance'] }],
							'mask-image': [{ mask: ['none', Y, J] }],
							filter: [{ filter: ['', 'none', Y, J] }],
							blur: [{ blur: se() }],
							brightness: [{ brightness: [le, Y, J] }],
							contrast: [{ contrast: [le, Y, J] }],
							'drop-shadow': [{ 'drop-shadow': ['', 'none', h, Cr, vr] }],
							'drop-shadow-color': [{ 'drop-shadow': M() }],
							grayscale: [{ grayscale: ['', le, Y, J] }],
							'hue-rotate': [{ 'hue-rotate': [le, Y, J] }],
							invert: [{ invert: ['', le, Y, J] }],
							saturate: [{ saturate: [le, Y, J] }],
							sepia: [{ sepia: ['', le, Y, J] }],
							'backdrop-filter': [{ 'backdrop-filter': ['', 'none', Y, J] }],
							'backdrop-blur': [{ 'backdrop-blur': se() }],
							'backdrop-brightness': [{ 'backdrop-brightness': [le, Y, J] }],
							'backdrop-contrast': [{ 'backdrop-contrast': [le, Y, J] }],
							'backdrop-grayscale': [{ 'backdrop-grayscale': ['', le, Y, J] }],
							'backdrop-hue-rotate': [{ 'backdrop-hue-rotate': [le, Y, J] }],
							'backdrop-invert': [{ 'backdrop-invert': ['', le, Y, J] }],
							'backdrop-opacity': [{ 'backdrop-opacity': [le, Y, J] }],
							'backdrop-saturate': [{ 'backdrop-saturate': [le, Y, J] }],
							'backdrop-sepia': [{ 'backdrop-sepia': ['', le, Y, J] }],
							'border-collapse': [{ border: ['collapse', 'separate'] }],
							'border-spacing': [{ 'border-spacing': R() }],
							'border-spacing-x': [{ 'border-spacing-x': R() }],
							'border-spacing-y': [{ 'border-spacing-y': R() }],
							'table-layout': [{ table: ['auto', 'fixed'] }],
							caption: [{ caption: ['top', 'bottom'] }],
							transition: [
								{ transition: ['', 'all', 'colors', 'opacity', 'shadow', 'transform', 'none', Y, J] }
							],
							'transition-behavior': [{ transition: ['normal', 'discrete'] }],
							duration: [{ duration: [le, 'initial', Y, J] }],
							ease: [{ ease: ['linear', 'initial', v, Y, J] }],
							delay: [{ delay: [le, Y, J] }],
							animate: [{ animate: ['none', C, Y, J] }],
							backface: [{ backface: ['hidden', 'visible'] }],
							perspective: [{ perspective: [p, Y, J] }],
							'perspective-origin': [{ 'perspective-origin': I() }],
							rotate: [{ rotate: Ce() }],
							'rotate-x': [{ 'rotate-x': Ce() }],
							'rotate-y': [{ 'rotate-y': Ce() }],
							'rotate-z': [{ 'rotate-z': Ce() }],
							scale: [{ scale: ne() }],
							'scale-x': [{ 'scale-x': ne() }],
							'scale-y': [{ 'scale-y': ne() }],
							'scale-z': [{ 'scale-z': ne() }],
							'scale-3d': ['scale-3d'],
							skew: [{ skew: ge() }],
							'skew-x': [{ 'skew-x': ge() }],
							'skew-y': [{ 'skew-y': ge() }],
							transform: [{ transform: [Y, J, '', 'none', 'gpu', 'cpu'] }],
							'transform-origin': [{ origin: I() }],
							'transform-style': [{ transform: ['3d', 'flat'] }],
							translate: [{ translate: xe() }],
							'translate-x': [{ 'translate-x': xe() }],
							'translate-y': [{ 'translate-y': xe() }],
							'translate-z': [{ 'translate-z': xe() }],
							'translate-none': ['translate-none'],
							accent: [{ accent: M() }],
							appearance: [{ appearance: ['none', 'auto'] }],
							'caret-color': [{ caret: M() }],
							'color-scheme': [
								{ scheme: ['normal', 'dark', 'light', 'light-dark', 'only-dark', 'only-light'] }
							],
							cursor: [
								{
									cursor: [
										'auto',
										'default',
										'pointer',
										'wait',
										'text',
										'move',
										'help',
										'not-allowed',
										'none',
										'context-menu',
										'progress',
										'cell',
										'crosshair',
										'vertical-text',
										'alias',
										'copy',
										'no-drop',
										'grab',
										'grabbing',
										'all-scroll',
										'col-resize',
										'row-resize',
										'n-resize',
										'e-resize',
										's-resize',
										'w-resize',
										'ne-resize',
										'nw-resize',
										'se-resize',
										'sw-resize',
										'ew-resize',
										'ns-resize',
										'nesw-resize',
										'nwse-resize',
										'zoom-in',
										'zoom-out',
										Y,
										J
									]
								}
							],
							'field-sizing': [{ 'field-sizing': ['fixed', 'content'] }],
							'pointer-events': [{ 'pointer-events': ['auto', 'none'] }],
							resize: [{ resize: ['none', '', 'y', 'x'] }],
							'scroll-behavior': [{ scroll: ['auto', 'smooth'] }],
							'scroll-m': [{ 'scroll-m': R() }],
							'scroll-mx': [{ 'scroll-mx': R() }],
							'scroll-my': [{ 'scroll-my': R() }],
							'scroll-ms': [{ 'scroll-ms': R() }],
							'scroll-me': [{ 'scroll-me': R() }],
							'scroll-mt': [{ 'scroll-mt': R() }],
							'scroll-mr': [{ 'scroll-mr': R() }],
							'scroll-mb': [{ 'scroll-mb': R() }],
							'scroll-ml': [{ 'scroll-ml': R() }],
							'scroll-p': [{ 'scroll-p': R() }],
							'scroll-px': [{ 'scroll-px': R() }],
							'scroll-py': [{ 'scroll-py': R() }],
							'scroll-ps': [{ 'scroll-ps': R() }],
							'scroll-pe': [{ 'scroll-pe': R() }],
							'scroll-pt': [{ 'scroll-pt': R() }],
							'scroll-pr': [{ 'scroll-pr': R() }],
							'scroll-pb': [{ 'scroll-pb': R() }],
							'scroll-pl': [{ 'scroll-pl': R() }],
							'snap-align': [{ snap: ['start', 'end', 'center', 'align-none'] }],
							'snap-stop': [{ snap: ['normal', 'always'] }],
							'snap-type': [{ snap: ['none', 'x', 'y', 'both'] }],
							'snap-strictness': [{ snap: ['mandatory', 'proximity'] }],
							touch: [{ touch: ['auto', 'none', 'manipulation'] }],
							'touch-x': [{ 'touch-pan': ['x', 'left', 'right'] }],
							'touch-y': [{ 'touch-pan': ['y', 'up', 'down'] }],
							'touch-pz': ['touch-pinch-zoom'],
							select: [{ select: ['none', 'text', 'all', 'auto'] }],
							'will-change': [{ 'will-change': ['auto', 'scroll', 'contents', 'transform', Y, J] }],
							fill: [{ fill: ['none', ...M()] }],
							'stroke-w': [{ stroke: [le, Io, na, fu] }],
							stroke: [{ stroke: ['none', ...M()] }],
							'forced-color-adjust': [{ 'forced-color-adjust': ['auto', 'none'] }]
						},
						conflictingClassGroups: {
							overflow: ['overflow-x', 'overflow-y'],
							overscroll: ['overscroll-x', 'overscroll-y'],
							inset: ['inset-x', 'inset-y', 'start', 'end', 'top', 'right', 'bottom', 'left'],
							'inset-x': ['right', 'left'],
							'inset-y': ['top', 'bottom'],
							flex: ['basis', 'grow', 'shrink'],
							gap: ['gap-x', 'gap-y'],
							p: ['px', 'py', 'ps', 'pe', 'pt', 'pr', 'pb', 'pl'],
							px: ['pr', 'pl'],
							py: ['pt', 'pb'],
							m: ['mx', 'my', 'ms', 'me', 'mt', 'mr', 'mb', 'ml'],
							mx: ['mr', 'ml'],
							my: ['mt', 'mb'],
							size: ['w', 'h'],
							'font-size': ['leading'],
							'fvn-normal': [
								'fvn-ordinal',
								'fvn-slashed-zero',
								'fvn-figure',
								'fvn-spacing',
								'fvn-fraction'
							],
							'fvn-ordinal': ['fvn-normal'],
							'fvn-slashed-zero': ['fvn-normal'],
							'fvn-figure': ['fvn-normal'],
							'fvn-spacing': ['fvn-normal'],
							'fvn-fraction': ['fvn-normal'],
							'line-clamp': ['display', 'overflow'],
							rounded: [
								'rounded-s',
								'rounded-e',
								'rounded-t',
								'rounded-r',
								'rounded-b',
								'rounded-l',
								'rounded-ss',
								'rounded-se',
								'rounded-ee',
								'rounded-es',
								'rounded-tl',
								'rounded-tr',
								'rounded-br',
								'rounded-bl'
							],
							'rounded-s': ['rounded-ss', 'rounded-es'],
							'rounded-e': ['rounded-se', 'rounded-ee'],
							'rounded-t': ['rounded-tl', 'rounded-tr'],
							'rounded-r': ['rounded-tr', 'rounded-br'],
							'rounded-b': ['rounded-br', 'rounded-bl'],
							'rounded-l': ['rounded-tl', 'rounded-bl'],
							'border-spacing': ['border-spacing-x', 'border-spacing-y'],
							'border-w': [
								'border-w-x',
								'border-w-y',
								'border-w-s',
								'border-w-e',
								'border-w-t',
								'border-w-r',
								'border-w-b',
								'border-w-l'
							],
							'border-w-x': ['border-w-r', 'border-w-l'],
							'border-w-y': ['border-w-t', 'border-w-b'],
							'border-color': [
								'border-color-x',
								'border-color-y',
								'border-color-s',
								'border-color-e',
								'border-color-t',
								'border-color-r',
								'border-color-b',
								'border-color-l'
							],
							'border-color-x': ['border-color-r', 'border-color-l'],
							'border-color-y': ['border-color-t', 'border-color-b'],
							translate: ['translate-x', 'translate-y', 'translate-none'],
							'translate-none': ['translate', 'translate-x', 'translate-y', 'translate-z'],
							'scroll-m': [
								'scroll-mx',
								'scroll-my',
								'scroll-ms',
								'scroll-me',
								'scroll-mt',
								'scroll-mr',
								'scroll-mb',
								'scroll-ml'
							],
							'scroll-mx': ['scroll-mr', 'scroll-ml'],
							'scroll-my': ['scroll-mt', 'scroll-mb'],
							'scroll-p': [
								'scroll-px',
								'scroll-py',
								'scroll-ps',
								'scroll-pe',
								'scroll-pt',
								'scroll-pr',
								'scroll-pb',
								'scroll-pl'
							],
							'scroll-px': ['scroll-pr', 'scroll-pl'],
							'scroll-py': ['scroll-pt', 'scroll-pb'],
							touch: ['touch-x', 'touch-y', 'touch-pz'],
							'touch-x': ['touch'],
							'touch-y': ['touch'],
							'touch-pz': ['touch']
						},
						conflictingClassGroupModifiers: { 'font-size': ['leading'] },
						orderSensitiveModifiers: [
							'*',
							'**',
							'after',
							'backdrop',
							'before',
							'details-content',
							'file',
							'first-letter',
							'first-line',
							'marker',
							'placeholder',
							'selection'
						]
					}
				}),
				(Tu = fx(Ex)))
		})
	function q(...e) {
		return Tu(xr(e))
	}
	var pe = y(() => {
		Qn()
		Au()
	})
	function s(e, t, a) {
		return Mu.createElement(e, a == null ? t : { ...t, key: a })
	}
	var Mu,
		Ze,
		D,
		B = y(() => {
			;((Mu = globalThis.React), (Ze = Mu.Fragment))
			D = s
		})
	var Ox,
		Fx,
		Bx,
		Nx,
		_x,
		zx,
		Hx,
		Ux,
		qx,
		Vx,
		Gx,
		Wx,
		jx,
		Xx,
		Kx,
		$x,
		Jx,
		Yx,
		Du = y(() => {
			Q()
			B()
			Ox = S(({ size: e = 24, ...t }, a) =>
				s('svg', {
					ref: a,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'currentColor',
					stroke: 'none',
					'aria-hidden': 'true',
					...t,
					children: s('path', {
						d: 'M2 6c0-.796.316-1.558.879-2.121A3 3 0 0 1 5 3h4l.099.005c.229.023.444.124.608.288L12.414 6H19c.796 0 1.558.316 2.121.879.319.319.559.703.707 1.121H7.305c-.407 0-.805.125-1.14.356-.292.203-.525.48-.674.801l-.058.141-1.379 3.676a1 1 0 0 0 1.873.702l1.134-3.027A1 1 0 0 1 7.998 10H21l.217.012c.216.024.426.082.624.173.054.025.107.053.159.083.199.115.377.263.525.439.188.222.325.482.403.762.077.28.092.573.045.859l-.005.024-.995 5.21a3 3 0 0 1-1.036 1.749c-.47.389-1.046.624-1.65.677l-.261.012H5a3 3 0 0 1-3-3V6z'
					})
				})
			)
			Ox.displayName = 'TablerFolderOpenFilledIcon'
			Fx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2' }),
						s('path', { d: 'M17 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2' })
					]
				})
			)
			Fx.displayName = 'TablerFoldersIcon'
			Bx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M2 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H2' }),
						s('path', { d: 'M17 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
						s('path', { d: 'M9.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-3 0v-3A1.5 1.5 0 0 1 9.5 15' }),
						s('path', { d: 'm19.5 15 3 6' }),
						s('path', { d: 'm19.5 21 3-6' })
					]
				})
			)
			Bx.displayName = 'TablerFileTypeDocxIcon'
			Nx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						s('path', { d: 'M17 18h2' }),
						s('path', { d: 'M20 15h-3v6' }),
						s('path', { d: 'M11 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1' })
					]
				})
			)
			Nx.displayName = 'TablerFileTypePdfIcon'
			_x = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M4 15l4 6' }),
						s('path', { d: 'M4 21l4-6' }),
						s('path', {
							d: 'M17 20.25c0 .414.336.75.75.75H19a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						s('path', { d: 'M11 15v6h3' })
					]
				})
			)
			_x.displayName = 'TablerFileTypeXlsIcon'
			zx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M7 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
						s('path', {
							d: 'M10 20.25c0 .414.336.75.75.75H12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						s('path', { d: 'M16 15l2 6l2-6' })
					]
				})
			)
			zx.displayName = 'TablerFileTypeCsvIcon'
			Hx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M2 21v-6' }),
						s('path', { d: 'M5 15v6' }),
						s('path', { d: 'M2 18h3' }),
						s('path', { d: 'M20 15v6h2' }),
						s('path', { d: 'M13 21v-6l2 3l2-3v6' }),
						s('path', { d: 'M7.5 15h3' }),
						s('path', { d: 'M9 15v6' })
					]
				})
			)
			Hx.displayName = 'TablerFileTypeHtmlIcon'
			Ux = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
						s('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
						s('path', { d: 'M5 15h3v4.5a1.5 1.5 0 0 1-3 0' })
					]
				})
			)
			Ux.displayName = 'TablerFileTypeJpgIcon'
			qx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
						s('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						s('path', { d: 'M11 21v-6l3 6v-6' })
					]
				})
			)
			qx.displayName = 'TablerFileTypePngIcon'
			Vx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						s('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
						s('path', { d: 'M16.5 15h3' }),
						s('path', { d: 'M18 15v6' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' })
					]
				})
			)
			Vx.displayName = 'TablerFileTypePptIcon'
			Gx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', {
							d: 'M4 20.25c0 .414.336.75.75.75H6a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						s('path', { d: 'M10 15l2 6l2-6' }),
						s('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' })
					]
				})
			)
			Gx.displayName = 'TablerFileTypeSvgIcon'
			Wx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M16.5 15h3' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M4.5 15h3' }),
						s('path', { d: 'M6 15v6' }),
						s('path', { d: 'M18 15v6' }),
						s('path', { d: 'M10 15l4 6' }),
						s('path', { d: 'M10 21l4-6' })
					]
				})
			)
			Wx.displayName = 'TablerFileTypeTxtIcon'
			jx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M16 18h1.5a1.5 1.5 0 0 0 0-3H16v6' }),
						s('path', { d: 'M12 15v6' }),
						s('path', { d: 'M5 15h3l-3 6h3' })
					]
				})
			)
			jx.displayName = 'TablerFileTypeZipIcon'
			Xx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
						s('path', { d: 'M9 17h6' }),
						s('path', { d: 'M9 13h6' })
					]
				})
			)
			Xx.displayName = 'TablerFileDescriptionIcon'
			Kx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
						s('path', { d: 'M10 13l-1 2l1 2' }),
						s('path', { d: 'M14 13l1 2l-1 2' })
					]
				})
			)
			Kx.displayName = 'TablerFileCodeIcon'
			$x = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
						s('path', { d: 'M10 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0' }),
						s('path', { d: 'M12 16v-5l2 1' })
					]
				})
			)
			$x.displayName = 'TablerFileMusicIcon'
			Jx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' })
					]
				})
			)
			Jx.displayName = 'TablerFileIcon'
			Yx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				D('svg', {
					ref: o,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'none',
					stroke: 'currentColor',
					strokeLinecap: 'round',
					strokeLinejoin: 'round',
					strokeWidth: t,
					'aria-hidden': 'true',
					...a,
					children: [
						s('path', { d: 'M15 10l4.553-2.276a1 1 0 0 1 1.447.894v6.764a1 1 0 0 1-1.447.894L15 14v-4' }),
						s('path', { d: 'M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8' })
					]
				})
			)
			Yx.displayName = 'TablerVideoIcon'
		})
	var Eu,
		Ou,
		Gt,
		So = y(() => {
			Qn()
			;((Eu = (e) => (typeof e == 'boolean' ? `${e}` : e === 0 ? '0' : e)),
				(Ou = xr),
				(Gt = (e, t) => (a) => {
					var o
					if (t?.variants == null) return Ou(e, a?.class, a?.className)
					let { variants: r, defaultVariants: n } = t,
						l = Object.keys(r).map((d) => {
							let c = a?.[d],
								f = n?.[d]
							if (c === null) return null
							let m = Eu(c) || Eu(f)
							return r[d][m]
						}),
						i =
							a &&
							Object.entries(a).reduce((d, c) => {
								let [f, m] = c
								return (m === void 0 || (d[f] = m), d)
							}, {}),
						u =
							t == null || (o = t.compoundVariants) === null || o === void 0
								? void 0
								: o.reduce((d, c) => {
										let { class: f, className: m, ...h } = c
										return Object.entries(h).every((g) => {
											let [p, x] = g
											return Array.isArray(x)
												? x.includes({ ...n, ...i }[p])
												: { ...n, ...i }[p] === x
										})
											? [...d, f, m]
											: d
									}, [])
					return Ou(e, l, u, a?.class, a?.className)
				}))
		})
	var os,
		wo,
		br,
		Tw,
		Ha = y(() => {
			;((os = globalThis.ReactDOM),
				(wo = os.createPortal),
				(br = os.flushSync),
				(Tw = os.unstable_batchedUpdates))
		})
	function Fu(e, t) {
		if (typeof e == 'function') return e(t)
		e != null && (e.current = t)
	}
	function yo(...e) {
		return (t) => {
			let a = !1,
				o = e.map((r) => {
					let n = Fu(r, t)
					return (!a && typeof n == 'function' && (a = !0), n)
				})
			if (a)
				return () => {
					for (let r = 0; r < o.length; r++) {
						let n = o[r]
						typeof n == 'function' ? n() : Fu(e[r], null)
					}
				}
		}
	}
	function te(...e) {
		return G(yo(...e), e)
	}
	var Oe = y(() => {
		Q()
	})
	var Ua = {}
	Je(Ua, { Root: () => Zx, Slot: () => Zx, Slottable: () => Qx, createSlot: () => Xe, createSlottable: () => Sr })
	function Xe(e) {
		let t = S((a, o) => {
			let { children: r, ...n } = a,
				l = null,
				i = !1,
				u = []
			;(Bu(r) && typeof Ir == 'function' && (r = Ir(r._payload)),
				ct.forEach(r, (m) => {
					if (ov(m)) {
						i = !0
						let h = m,
							g = 'child' in h.props ? h.props.child : h.props.children
						;(Bu(g) && typeof Ir == 'function' && (g = Ir(g._payload)),
							(l = ev(h, g)),
							u.push(l?.props?.children))
					} else u.push(m)
				}),
				l ? (l = yt(l, void 0, u)) : !i && ct.count(r) === 1 && Ba(r) && (l = r))
			let d = l ? av(l) : void 0,
				c = te(o, d)
			if (!l) {
				if (r || r === 0) throw new Error(i ? lv(e) : sv(e))
				return r
			}
			let f = tv(n, l.props ?? {})
			return (l.type !== Ye && (f.ref = o ? c : d), yt(l, f))
		})
		return ((t.displayName = `${e}.Slot`), t)
	}
	function Sr(e) {
		let t = (a) => ('child' in a ? a.children(a.child) : a.children)
		return ((t.displayName = `${e}.Slottable`), (t.__radixId = Nu), t)
	}
	function tv(e, t) {
		let a = { ...t }
		for (let o in t) {
			let r = e[o],
				n = t[o]
			;/^on[A-Z]/.test(o)
				? r && n
					? (a[o] = (...i) => {
							let u = n(...i)
							return (r(...i), u)
						})
					: r && (a[o] = r)
				: o === 'style'
					? (a[o] = { ...r, ...n })
					: o === 'className' && (a[o] = [r, n].filter(Boolean).join(' '))
		}
		return { ...e, ...a }
	}
	function av(e) {
		let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
			a = t && 'isReactWarning' in t && t.isReactWarning
		return a
			? e.ref
			: ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
				(a = t && 'isReactWarning' in t && t.isReactWarning),
				a ? e.props.ref : e.props.ref || e.ref)
	}
	function ov(e) {
		return Ba(e) && typeof e.type == 'function' && '__radixId' in e.type && e.type.__radixId === Nu
	}
	function Bu(e) {
		return (
			e != null &&
			typeof e == 'object' &&
			'$$typeof' in e &&
			e.$$typeof === rv &&
			'_payload' in e &&
			nv(e._payload)
		)
	}
	function nv(e) {
		return typeof e == 'object' && e !== null && 'then' in e
	}
	var Zx,
		Nu,
		Qx,
		ev,
		rv,
		sv,
		lv,
		Ir,
		Wt = y(() => {
			Q()
			Oe()
			;((Zx = Xe('Slot')), (Nu = Symbol.for('radix.slottable')))
			;((Qx = Sr('Slottable')),
				(ev = (e, t) => {
					if ('child' in e.props) {
						let a = e.props.child
						return Ba(a) ? yt(a, void 0, e.props.children(a.props.children)) : null
					}
					return Ba(t) ? t : null
				}))
			rv = Symbol.for('react.lazy')
			;((sv = (e) =>
				`${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`),
				(lv = (e) =>
					`${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`),
				(Ir = ae[' use '.trim().toString()]))
		})
	function wr(e, t) {
		e && br(() => e.dispatchEvent(t))
	}
	var iv,
		j,
		Me = y(() => {
			Q()
			Ha()
			Wt()
			B()
			;((iv = [
				'a',
				'button',
				'div',
				'form',
				'h2',
				'h3',
				'img',
				'input',
				'label',
				'li',
				'nav',
				'ol',
				'p',
				'select',
				'span',
				'svg',
				'ul'
			]),
				(j = iv.reduce((e, t) => {
					let a = Xe(`Primitive.${t}`),
						o = S((r, n) => {
							let { asChild: l, ...i } = r,
								u = l ? a : t
							return (
								typeof window < 'u' && (window[Symbol.for('radix-ui')] = !0),
								s(u, { ...i, ref: n })
							)
						})
					return ((o.displayName = `Primitive.${t}`), { ...e, [t]: o })
				}, {})))
		})
	var rs,
		uv,
		_u,
		zu,
		ns = y(() => {
			Q()
			Me()
			B()
			;((rs = Object.freeze({
				position: 'absolute',
				border: 0,
				width: 1,
				height: 1,
				padding: 0,
				margin: -1,
				overflow: 'hidden',
				clip: 'rect(0, 0, 0, 0)',
				whiteSpace: 'nowrap',
				wordWrap: 'normal'
			})),
				(uv = 'VisuallyHidden'),
				(_u = S((e, t) => s(j.span, { ...e, ref: t, style: { ...rs, ...e.style } }))))
			_u.displayName = uv
			zu = _u
		})
	function be(e, t = []) {
		let a = []
		function o(n, l) {
			let i = Ee(l)
			i.displayName = n + 'Context'
			let u = a.length
			a = [...a, l]
			let d = (f) => {
				let { scope: m, children: h, ...g } = f,
					p = m?.[e]?.[u] || i,
					x = we(() => g, Object.values(g))
				return s(p.Provider, { value: x, children: h })
			}
			d.displayName = n + 'Provider'
			function c(f, m) {
				let h = m?.[e]?.[u] || i,
					g = _e(h)
				if (g) return g
				if (l !== void 0) return l
				throw new Error(`\`${f}\` must be used within \`${n}\``)
			}
			return [d, c]
		}
		let r = () => {
			let n = a.map((l) => Ee(l))
			return function (i) {
				let u = i?.[e] || n
				return we(() => ({ [`__scope${e}`]: { ...i, [e]: u } }), [i, u])
			}
		}
		return ((r.scopeName = e), [o, cv(r, ...t)])
	}
	function cv(...e) {
		let t = e[0]
		if (e.length === 1) return t
		let a = () => {
			let o = e.map((r) => ({ useScope: r(), scopeName: r.scopeName }))
			return function (n) {
				let l = o.reduce((i, { useScope: u, scopeName: d }) => {
					let f = u(n)[`__scope${d}`]
					return { ...i, ...f }
				}, {})
				return we(() => ({ [`__scope${t.scopeName}`]: l }), [l])
			}
		}
		return ((a.scopeName = t.scopeName), a)
	}
	var qe = y(() => {
		Q()
		B()
	})
	function qa(e) {
		let t = e + 'CollectionProvider',
			[a, o] = be(t),
			[r, n] = a(t, { collectionRef: { current: null }, itemMap: new Map() }),
			l = (p) => {
				let { scope: x, children: v } = p,
					C = w(null),
					b = w(new Map()).current
				return s(r, { scope: x, itemMap: b, collectionRef: C, children: v })
			}
		l.displayName = t
		let i = e + 'CollectionSlot',
			u = Xe(i),
			d = S((p, x) => {
				let { scope: v, children: C } = p,
					b = n(i, v),
					L = te(x, b.collectionRef)
				return s(u, { ref: L, children: C })
			})
		d.displayName = i
		let c = e + 'CollectionItemSlot',
			f = 'data-radix-collection-item',
			m = Xe(c),
			h = S((p, x) => {
				let { scope: v, children: C, ...b } = p,
					L = w(null),
					I = te(x, L),
					k = n(c, v)
				return (
					E(
						() => (
							k.itemMap.set(L, { ref: L, ...b }),
							() => {
								k.itemMap.delete(L)
							}
						)
					),
					s(m, { [f]: '', ref: I, children: C })
				)
			})
		h.displayName = c
		function g(p) {
			let x = n(e + 'CollectionConsumer', p)
			return G(() => {
				let C = x.collectionRef.current
				if (!C) return []
				let b = Array.from(C.querySelectorAll(`[${f}]`))
				return Array.from(x.itemMap.values()).sort(
					(k, P) => b.indexOf(k.ref.current) - b.indexOf(P.ref.current)
				)
			}, [x.collectionRef, x.itemMap])
		}
		return [{ Provider: l, Slot: d, ItemSlot: h }, g, o]
	}
	var yr = y(() => {
		'use client'
		Q()
		qe()
		Oe()
		Wt()
		B()
		Q()
		B()
	})
	function _(e, t, { checkForDefaultPrevented: a = !0 } = {}) {
		return function (r) {
			if ((e?.(r), a === !1 || !r.defaultPrevented)) return t?.(r)
		}
	}
	var jw,
		Ke = y(() => {
			jw = !!(typeof window < 'u' && window.document && window.document.createElement)
		})
	var Le,
		kt = y(() => {
			Q()
			Le = globalThis?.document ? Rt : () => {}
		})
	function De({ prop: e, defaultProp: t, onChange: a = () => {}, caller: o }) {
		let [r, n, l] = pv({ defaultProp: t, onChange: a }),
			i = e !== void 0,
			u = i ? e : r
		{
			let c = w(e !== void 0)
			E(() => {
				let f = c.current
				;(f !== i &&
					console.warn(
						`${o} is changing from ${f ? 'controlled' : 'uncontrolled'} to ${i ? 'controlled' : 'uncontrolled'}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
					),
					(c.current = i))
			}, [i, o])
		}
		let d = G(
			(c) => {
				if (i) {
					let f = mv(c) ? c(e) : c
					f !== e && l.current?.(f)
				} else n(c)
			},
			[i, e, n, l]
		)
		return [u, d]
	}
	function pv({ defaultProp: e, onChange: t }) {
		let [a, o] = T(e),
			r = w(a),
			n = w(t)
		return (
			fv(() => {
				n.current = t
			}, [t]),
			E(() => {
				r.current !== a && (n.current?.(a), (r.current = a))
			}, [a, r]),
			[a, o, n]
		)
	}
	function mv(e) {
		return typeof e == 'function'
	}
	var fv,
		Tt = y(() => {
			Q()
			kt()
			Q()
			fv = ae[' useInsertionEffect '.trim().toString()] || Le
		})
	function gv(e, t) {
		return _a((a, o) => t[a][o] ?? a, e)
	}
	function hv(e) {
		let [t, a] = T(),
			o = w(null),
			r = w(e),
			n = w('none'),
			l = e ? 'mounted' : 'unmounted',
			[i, u] = gv(l, {
				mounted: { UNMOUNT: 'unmounted', ANIMATION_OUT: 'unmountSuspended' },
				unmountSuspended: { MOUNT: 'mounted', ANIMATION_END: 'unmounted' },
				unmounted: { MOUNT: 'mounted' }
			})
		return (
			E(() => {
				let d = Rr(o.current)
				n.current = i === 'mounted' ? d : 'none'
			}, [i]),
			Le(() => {
				let d = o.current,
					c = r.current
				if (c !== e) {
					let m = n.current,
						h = Rr(d)
					;(e
						? u('MOUNT')
						: h === 'none' || d?.display === 'none'
							? u('UNMOUNT')
							: u(c && m !== h ? 'ANIMATION_OUT' : 'UNMOUNT'),
						(r.current = e))
				}
			}, [e, u]),
			Le(() => {
				if (t) {
					let d,
						c = t.ownerDocument.defaultView ?? window,
						f = (h) => {
							let p = Rr(o.current).includes(CSS.escape(h.animationName))
							if (h.target === t && p && (u('ANIMATION_END'), !r.current)) {
								let x = t.style.animationFillMode
								;((t.style.animationFillMode = 'forwards'),
									(d = c.setTimeout(() => {
										t.style.animationFillMode === 'forwards' && (t.style.animationFillMode = x)
									})))
							}
						},
						m = (h) => {
							h.target === t && (n.current = Rr(o.current))
						}
					return (
						t.addEventListener('animationstart', m),
						t.addEventListener('animationcancel', f),
						t.addEventListener('animationend', f),
						() => {
							;(c.clearTimeout(d),
								t.removeEventListener('animationstart', m),
								t.removeEventListener('animationcancel', f),
								t.removeEventListener('animationend', f))
						}
					)
				} else u('ANIMATION_END')
			}, [t, u]),
			{
				isPresent: ['mounted', 'unmountSuspended'].includes(i),
				ref: G((d) => {
					;((o.current = d ? getComputedStyle(d) : null), a(d))
				}, [])
			}
		)
	}
	function Hu(e, t) {
		if (typeof e == 'function') return e(t)
		e != null && (e.current = t)
	}
	function xv(...e) {
		let t = w(e)
		return (
			(t.current = e),
			G((a) => {
				let o = t.current,
					r = !1,
					n = o.map((l) => {
						let i = Hu(l, a)
						return (!r && typeof i == 'function' && (r = !0), i)
					})
				if (r)
					return () => {
						for (let l = 0; l < n.length; l++) {
							let i = n[l]
							typeof i == 'function' ? i() : Hu(o[l], null)
						}
					}
			}, [])
		)
	}
	function Rr(e) {
		return e?.animationName || 'none'
	}
	function vv(e) {
		let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
			a = t && 'isReactWarning' in t && t.isReactWarning
		return a
			? e.ref
			: ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
				(a = t && 'isReactWarning' in t && t.isReactWarning),
				a ? e.props.ref : e.props.ref || e.ref)
	}
	var ye,
		jt = y(() => {
			'use client'
			Q()
			kt()
			Q()
			ye = (e) => {
				let { present: t, children: a } = e,
					o = hv(t),
					r = typeof a == 'function' ? a({ present: o.isPresent }) : ct.only(a),
					n = xv(o.ref, vv(r))
				return typeof a == 'function' || o.isPresent ? yt(r, { ref: n }) : null
			}
			ye.displayName = 'Presence'
		})
	function Te(e) {
		let [t, a] = T(Cv())
		return (
			Le(() => {
				e || a((o) => o ?? String(bv++))
			}, [e]),
			e || (t ? `radix-${t}` : '')
		)
	}
	var Cv,
		bv,
		Xt = y(() => {
			Q()
			kt()
			;((Cv = ae[' useId '.trim().toString()] || (() => {})), (bv = 0))
		})
	function ft(e) {
		let t = _e(Lv)
		return e || t || 'ltr'
	}
	var Lv,
		Va = y(() => {
			'use client'
			Q()
			B()
			Lv = Ee(void 0)
		})
	function Ie(e) {
		let t = w(e)
		return (
			E(() => {
				t.current = e
			}),
			we(
				() =>
					(...a) =>
						t.current?.(...a),
				[]
			)
		)
	}
	var At = y(() => {
		Q()
	})
	function Uu(e, t = globalThis?.document) {
		let a = Ie(e)
		E(() => {
			let o = (r) => {
				r.key === 'Escape' && a(r)
			}
			return (
				t.addEventListener('keydown', o, { capture: !0 }),
				() => t.removeEventListener('keydown', o, { capture: !0 })
			)
		}, [a, t])
	}
	var qu = y(() => {
		Q()
		At()
	})
	function Wu() {
		let e = _e(ls),
			[t, a] = T(null)
		return (
			E(() => {
				if (t)
					return (
						e.dismissableSurfaces.add(t),
						() => {
							e.dismissableSurfaces.delete(t)
						}
					)
			}, [t, e.dismissableSurfaces]),
			a
		)
	}
	function Pv(e, t) {
		let {
				ownerDocument: a = globalThis?.document,
				deferPointerDownOutside: o = !1,
				isDeferredPointerDownOutsideRef: r,
				dismissableSurfaces: n
			} = t,
			l = Ie(e),
			i = w(!1),
			u = w(!1),
			d = w(new Map()),
			c = w(() => {})
		return (
			E(() => {
				function f() {
					;((u.current = !1), (r.current = !1), d.current.clear())
				}
				function m() {
					return Array.from(d.current.values()).some(Boolean)
				}
				function h(C) {
					if (!u.current) return
					let b = C.target
					;((b instanceof Node && [...n].some((I) => I.contains(b))) || d.current.set(C.type, !0),
						C.type === 'click' &&
							window.setTimeout(() => {
								u.current && c.current()
							}, 0))
				}
				function g(C) {
					u.current && d.current.set(C.type, !1)
				}
				let p = (C) => {
						if (C.target && !i.current) {
							let L = function () {
								a.removeEventListener('click', c.current)
								let k = m()
								;(f(), k || ju(Sv, l, I, { discrete: !0 }))
							}
							var b = L
							let I = { originalEvent: C }
							;((u.current = !0),
								(r.current = o && C.button === 0),
								d.current.clear(),
								!o || C.button !== 0
									? L()
									: (a.removeEventListener('click', c.current),
										(c.current = L),
										a.addEventListener('click', c.current, { once: !0 })))
						} else (a.removeEventListener('click', c.current), f())
						i.current = !1
					},
					x = ['pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']
				for (let C of x) (a.addEventListener(C, h, !0), a.addEventListener(C, g))
				let v = window.setTimeout(() => {
					a.addEventListener('pointerdown', p)
				}, 0)
				return () => {
					;(window.clearTimeout(v),
						a.removeEventListener('pointerdown', p),
						a.removeEventListener('click', c.current))
					for (let C of x) (a.removeEventListener(C, h, !0), a.removeEventListener(C, g))
				}
			}, [a, l, o, r, n]),
			{ onPointerDownCapture: () => (i.current = !0) }
		)
	}
	function kv(e, t = globalThis?.document) {
		let a = Ie(e),
			o = w(!1)
		return (
			E(() => {
				let r = (n) => {
					n.target && !o.current && ju(wv, a, { originalEvent: n }, { discrete: !1 })
				}
				return (t.addEventListener('focusin', r), () => t.removeEventListener('focusin', r))
			}, [t, a]),
			{ onFocusCapture: () => (o.current = !0), onBlurCapture: () => (o.current = !1) }
		)
	}
	function Gu() {
		let e = new CustomEvent(ss)
		document.dispatchEvent(e)
	}
	function ju(e, t, a, { discrete: o }) {
		let r = a.originalEvent.target,
			n = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: a })
		;(t && r.addEventListener(e, t, { once: !0 }), o ? wr(r, n) : r.dispatchEvent(n))
	}
	var Iv,
		ss,
		Sv,
		wv,
		Vu,
		ls,
		Mt,
		yv,
		Rv,
		Ro = y(() => {
			'use client'
			Q()
			Ke()
			Me()
			Oe()
			At()
			qu()
			B()
			;((Iv = 'DismissableLayer'),
				(ss = 'dismissableLayer.update'),
				(Sv = 'dismissableLayer.pointerDownOutside'),
				(wv = 'dismissableLayer.focusOutside'),
				(ls = Ee({
					layers: new Set(),
					layersWithOutsidePointerEventsDisabled: new Set(),
					branches: new Set(),
					dismissableSurfaces: new Set()
				})),
				(Mt = S((e, t) => {
					let {
							disableOutsidePointerEvents: a = !1,
							deferPointerDownOutside: o = !1,
							onEscapeKeyDown: r,
							onPointerDownOutside: n,
							onFocusOutside: l,
							onInteractOutside: i,
							onDismiss: u,
							...d
						} = e,
						c = _e(ls),
						[f, m] = T(null),
						h = f?.ownerDocument ?? globalThis?.document,
						[, g] = T({}),
						p = te(t, (O) => m(O)),
						x = Array.from(c.layers),
						[v] = [...c.layersWithOutsidePointerEventsDisabled].slice(-1),
						C = x.indexOf(v),
						b = f ? x.indexOf(f) : -1,
						L = c.layersWithOutsidePointerEventsDisabled.size > 0,
						I = b >= C,
						k = w(!1),
						P = Pv(
							(O) => {
								let U = O.target
								if (!(U instanceof Node)) return
								let N = [...c.branches].some((V) => V.contains(U))
								!I || N || (n?.(O), i?.(O), O.defaultPrevented || u?.())
							},
							{
								ownerDocument: h,
								deferPointerDownOutside: o,
								isDeferredPointerDownOutsideRef: k,
								dismissableSurfaces: c.dismissableSurfaces
							}
						),
						R = kv((O) => {
							if (o && k.current) return
							let U = O.target
							;[...c.branches].some((V) => V.contains(U)) || (l?.(O), i?.(O), O.defaultPrevented || u?.())
						}, h)
					return (
						Uu((O) => {
							b === c.layers.size - 1 && (r?.(O), !O.defaultPrevented && u && (O.preventDefault(), u()))
						}, h),
						E(() => {
							if (f)
								return (
									a &&
										(c.layersWithOutsidePointerEventsDisabled.size === 0 &&
											((Vu = h.body.style.pointerEvents), (h.body.style.pointerEvents = 'none')),
										c.layersWithOutsidePointerEventsDisabled.add(f)),
									c.layers.add(f),
									Gu(),
									() => {
										a &&
											(c.layersWithOutsidePointerEventsDisabled.delete(f),
											c.layersWithOutsidePointerEventsDisabled.size === 0 &&
												(h.body.style.pointerEvents = Vu))
									}
								)
						}, [f, h, a, c]),
						E(
							() => () => {
								f && (c.layers.delete(f), c.layersWithOutsidePointerEventsDisabled.delete(f), Gu())
							},
							[f, c]
						),
						E(() => {
							let O = () => g({})
							return (document.addEventListener(ss, O), () => document.removeEventListener(ss, O))
						}, []),
						s(j.div, {
							...d,
							ref: p,
							style: { pointerEvents: L ? (I ? 'auto' : 'none') : void 0, ...e.style },
							onFocusCapture: _(e.onFocusCapture, R.onFocusCapture),
							onBlurCapture: _(e.onBlurCapture, R.onBlurCapture),
							onPointerDownCapture: _(e.onPointerDownCapture, P.onPointerDownCapture)
						})
					)
				})))
			Mt.displayName = Iv
			;((yv = 'DismissableLayerBranch'),
				(Rv = S((e, t) => {
					let a = _e(ls),
						o = w(null),
						r = te(t, o)
					return (
						E(() => {
							let n = o.current
							if (n)
								return (
									a.branches.add(n),
									() => {
										a.branches.delete(n)
									}
								)
						}, [a.branches]),
						s(j.div, { ...e, ref: r })
					)
				})))
			Rv.displayName = yv
		})
	function Av(e, { select: t = !1 } = {}) {
		let a = document.activeElement
		for (let o of e) if ((Kt(o, { select: t }), document.activeElement !== a)) return
	}
	function Mv(e) {
		let t = Yu(e),
			a = Ku(t, e),
			o = Ku(t.reverse(), e)
		return [a, o]
	}
	function Yu(e) {
		let t = [],
			a = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, {
				acceptNode: (o) => {
					let r = o.tagName === 'INPUT' && o.type === 'hidden'
					return o.disabled || o.hidden || r
						? NodeFilter.FILTER_SKIP
						: o.tabIndex >= 0
							? NodeFilter.FILTER_ACCEPT
							: NodeFilter.FILTER_SKIP
				}
			})
		for (; a.nextNode(); ) t.push(a.currentNode)
		return t
	}
	function Ku(e, t) {
		for (let a of e) if (!Dv(a, { upTo: t })) return a
	}
	function Dv(e, { upTo: t }) {
		if (getComputedStyle(e).visibility === 'hidden') return !0
		for (; e; ) {
			if (t !== void 0 && e === t) return !1
			if (getComputedStyle(e).display === 'none') return !0
			e = e.parentElement
		}
		return !1
	}
	function Ev(e) {
		return e instanceof HTMLInputElement && 'select' in e
	}
	function Kt(e, { select: t = !1 } = {}) {
		if (e && e.focus) {
			let a = document.activeElement
			;(e.focus({ preventScroll: !0 }), e !== a && Ev(e) && t && e.select())
		}
	}
	function Ov() {
		let e = []
		return {
			add(t) {
				let a = e[0]
				;(t !== a && a?.pause(), (e = Ju(e, t)), e.unshift(t))
			},
			remove(t) {
				;((e = Ju(e, t)), e[0]?.resume())
			}
		}
	}
	function Ju(e, t) {
		let a = [...e],
			o = a.indexOf(t)
		return (o !== -1 && a.splice(o, 1), a)
	}
	function Fv(e) {
		return e.filter((t) => t.tagName !== 'A')
	}
	var is,
		us,
		Xu,
		Tv,
		la,
		$u,
		Pr = y(() => {
			'use client'
			Q()
			Oe()
			Me()
			At()
			B()
			;((is = 'focusScope.autoFocusOnMount'),
				(us = 'focusScope.autoFocusOnUnmount'),
				(Xu = { bubbles: !1, cancelable: !0 }),
				(Tv = 'FocusScope'),
				(la = S((e, t) => {
					let { loop: a = !1, trapped: o = !1, onMountAutoFocus: r, onUnmountAutoFocus: n, ...l } = e,
						[i, u] = T(null),
						d = Ie(r),
						c = Ie(n),
						f = w(null),
						m = te(t, (p) => u(p)),
						h = w({
							paused: !1,
							pause() {
								this.paused = !0
							},
							resume() {
								this.paused = !1
							}
						}).current
					;(E(() => {
						if (o) {
							let C = function (k) {
									if (h.paused || !i) return
									let P = k.target
									i.contains(P) ? (f.current = P) : Kt(f.current, { select: !0 })
								},
								b = function (k) {
									if (h.paused || !i) return
									let P = k.relatedTarget
									P !== null && (i.contains(P) || Kt(f.current, { select: !0 }))
								},
								L = function (k) {
									if (document.activeElement === document.body)
										for (let R of k) R.removedNodes.length > 0 && Kt(i)
								}
							var p = C,
								x = b,
								v = L
							;(document.addEventListener('focusin', C), document.addEventListener('focusout', b))
							let I = new MutationObserver(L)
							return (
								i && I.observe(i, { childList: !0, subtree: !0 }),
								() => {
									;(document.removeEventListener('focusin', C),
										document.removeEventListener('focusout', b),
										I.disconnect())
								}
							)
						}
					}, [o, i, h.paused]),
						E(() => {
							if (i) {
								$u.add(h)
								let p = document.activeElement
								if (!i.contains(p)) {
									let v = new CustomEvent(is, Xu)
									;(i.addEventListener(is, d),
										i.dispatchEvent(v),
										v.defaultPrevented ||
											(Av(Fv(Yu(i)), { select: !0 }), document.activeElement === p && Kt(i)))
								}
								return () => {
									;(i.removeEventListener(is, d),
										setTimeout(() => {
											let v = new CustomEvent(us, Xu)
											;(i.addEventListener(us, c),
												i.dispatchEvent(v),
												v.defaultPrevented || Kt(p ?? document.body, { select: !0 }),
												i.removeEventListener(us, c),
												$u.remove(h))
										}, 0))
								}
							}
						}, [i, d, c, h]))
					let g = G(
						(p) => {
							if ((!a && !o) || h.paused) return
							let x = p.key === 'Tab' && !p.altKey && !p.ctrlKey && !p.metaKey,
								v = document.activeElement
							if (x && v) {
								let C = p.currentTarget,
									[b, L] = Mv(C)
								b && L
									? !p.shiftKey && v === L
										? (p.preventDefault(), a && Kt(b, { select: !0 }))
										: p.shiftKey && v === b && (p.preventDefault(), a && Kt(L, { select: !0 }))
									: v === C && p.preventDefault()
							}
						},
						[a, o, h.paused]
					)
					return s(j.div, { tabIndex: -1, ...l, ref: m, onKeyDown: g })
				})))
			la.displayName = Tv
			$u = Ov()
		})
	var Bv,
		Dt,
		Po = y(() => {
			'use client'
			Q()
			Ha()
			Me()
			kt()
			B()
			;((Bv = 'Portal'),
				(Dt = S((e, t) => {
					let { container: a, ...o } = e,
						[r, n] = T(!1)
					Le(() => n(!0), [])
					let l = a || (r && globalThis?.document?.body)
					return l ? wo(s(j.div, { ...o, ref: t }), l) : null
				})))
			Dt.displayName = Bv
		})
	function Wa() {
		E(() => {
			Ga || (Ga = { start: Zu(), end: Zu() })
			let { start: e, end: t } = Ga
			return (
				document.body.firstElementChild !== e && document.body.insertAdjacentElement('afterbegin', e),
				document.body.lastElementChild !== t && document.body.insertAdjacentElement('beforeend', t),
				kr++,
				() => {
					;(kr === 1 && (Ga?.start.remove(), Ga?.end.remove(), (Ga = null)), (kr = Math.max(0, kr - 1)))
				}
			)
		}, [])
	}
	function Zu() {
		let e = document.createElement('span')
		return (
			e.setAttribute('data-radix-focus-guard', ''),
			(e.tabIndex = 0),
			(e.style.outline = 'none'),
			(e.style.opacity = '0'),
			(e.style.position = 'fixed'),
			(e.style.pointerEvents = 'none'),
			e
		)
	}
	var kr,
		Ga,
		Tr = y(() => {
			'use client'
			Q()
			;((kr = 0), (Ga = null))
		})
	function Ar(e, t) {
		var a = {}
		for (var o in e) Object.prototype.hasOwnProperty.call(e, o) && t.indexOf(o) < 0 && (a[o] = e[o])
		if (e != null && typeof Object.getOwnPropertySymbols == 'function')
			for (var r = 0, o = Object.getOwnPropertySymbols(e); r < o.length; r++)
				t.indexOf(o[r]) < 0 && Object.prototype.propertyIsEnumerable.call(e, o[r]) && (a[o[r]] = e[o[r]])
		return a
	}
	function Qu(e, t, a) {
		if (a || arguments.length === 2)
			for (var o = 0, r = t.length, n; o < r; o++)
				(n || !(o in t)) && (n || (n = Array.prototype.slice.call(t, 0, o)), (n[o] = t[o]))
		return e.concat(n || Array.prototype.slice.call(t))
	}
	var Ve,
		ja = y(() => {
			Ve = function () {
				return (
					(Ve =
						Object.assign ||
						function (t) {
							for (var a, o = 1, r = arguments.length; o < r; o++) {
								a = arguments[o]
								for (var n in a) Object.prototype.hasOwnProperty.call(a, n) && (t[n] = a[n])
							}
							return t
						}),
					Ve.apply(this, arguments)
				)
			}
		})
	var ia,
		ua,
		ds,
		cs,
		Mr = y(() => {
			;((ia = 'right-scroll-bar-position'),
				(ua = 'width-before-scroll-bar'),
				(ds = 'with-scroll-bars-hidden'),
				(cs = '--removed-body-scroll-bar-size'))
		})
	function Dr(e, t) {
		return (typeof e == 'function' ? e(t) : e && (e.current = t), e)
	}
	var ed = y(() => {})
	function td(e, t) {
		var a = T(function () {
			return {
				value: e,
				callback: t,
				facade: {
					get current() {
						return a.value
					},
					set current(o) {
						var r = a.value
						r !== o && ((a.value = o), a.callback(o, r))
					}
				}
			}
		})[0]
		return ((a.callback = t), a.facade)
	}
	var ad = y(() => {
		Q()
	})
	function fs(e, t) {
		var a = td(t || null, function (o) {
			return e.forEach(function (r) {
				return Dr(r, o)
			})
		})
		return (
			Nv(
				function () {
					var o = od.get(a)
					if (o) {
						var r = new Set(o),
							n = new Set(e),
							l = a.current
						;(r.forEach(function (i) {
							n.has(i) || Dr(i, null)
						}),
							n.forEach(function (i) {
								r.has(i) || Dr(i, l)
							}))
					}
					od.set(a, e)
				},
				[e]
			),
			a
		)
	}
	var Nv,
		od,
		rd = y(() => {
			Q()
			ed()
			ad()
			;((Nv = typeof window < 'u' ? Rt : E), (od = new WeakMap()))
		})
	var nd = y(() => {
		rd()
	})
	function _v(e) {
		return e
	}
	function zv(e, t) {
		t === void 0 && (t = _v)
		var a = [],
			o = !1,
			r = {
				read: function () {
					if (o)
						throw new Error(
							'Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.'
						)
					return a.length ? a[a.length - 1] : e
				},
				useMedium: function (n) {
					var l = t(n, o)
					return (
						a.push(l),
						function () {
							a = a.filter(function (i) {
								return i !== l
							})
						}
					)
				},
				assignSyncMedium: function (n) {
					for (o = !0; a.length; ) {
						var l = a
						;((a = []), l.forEach(n))
					}
					a = {
						push: function (i) {
							return n(i)
						},
						filter: function () {
							return a
						}
					}
				},
				assignMedium: function (n) {
					o = !0
					var l = []
					if (a.length) {
						var i = a
						;((a = []), i.forEach(n), (l = a))
					}
					var u = function () {
							var c = l
							;((l = []), c.forEach(n))
						},
						d = function () {
							return Promise.resolve().then(u)
						}
					;(d(),
						(a = {
							push: function (c) {
								;(l.push(c), d())
							},
							filter: function (c) {
								return ((l = l.filter(c)), a)
							}
						}))
				}
			}
		return r
	}
	function ps(e) {
		e === void 0 && (e = {})
		var t = zv(null)
		return ((t.options = Ve({ async: !0, ssr: !1 }, e)), t)
	}
	var sd = y(() => {
		ja()
	})
	function ms(e, t) {
		return (e.useMedium(t), ld)
	}
	var ld,
		id = y(() => {
			ja()
			Q()
			ld = function (e) {
				var t = e.sideCar,
					a = Ar(e, ['sideCar'])
				if (!t) throw new Error('Sidecar: please provide `sideCar` property to import the right car')
				var o = t.read()
				if (!o) throw new Error('Sidecar medium not found')
				return Re(o, Ve({}, a))
			}
			ld.isSideCarExport = !0
		})
	var gs = y(() => {
		sd()
		id()
	})
	var Er,
		hs = y(() => {
			gs()
			Er = ps()
		})
	var xs,
		ko,
		ud = y(() => {
			ja()
			Q()
			Mr()
			nd()
			hs()
			;((xs = function () {}),
				(ko = S(function (e, t) {
					var a = w(null),
						o = T({ onScrollCapture: xs, onWheelCapture: xs, onTouchMoveCapture: xs }),
						r = o[0],
						n = o[1],
						l = e.forwardProps,
						i = e.children,
						u = e.className,
						d = e.removeScrollBar,
						c = e.enabled,
						f = e.shards,
						m = e.sideCar,
						h = e.noRelative,
						g = e.noIsolation,
						p = e.inert,
						x = e.allowPinchZoom,
						v = e.as,
						C = v === void 0 ? 'div' : v,
						b = e.gapMode,
						L = Ar(e, [
							'forwardProps',
							'children',
							'className',
							'removeScrollBar',
							'enabled',
							'shards',
							'sideCar',
							'noRelative',
							'noIsolation',
							'inert',
							'allowPinchZoom',
							'as',
							'gapMode'
						]),
						I = m,
						k = fs([a, t]),
						P = Ve(Ve({}, L), r)
					return Re(
						Ye,
						null,
						c &&
							Re(I, {
								sideCar: Er,
								removeScrollBar: d,
								shards: f,
								noRelative: h,
								noIsolation: g,
								inert: p,
								setCallbacks: n,
								allowPinchZoom: !!x,
								lockRef: a,
								gapMode: b
							}),
						l ? yt(ct.only(i), Ve(Ve({}, P), { ref: k })) : Re(C, Ve({}, P, { className: u, ref: k }), i)
					)
				})))
			ko.defaultProps = { enabled: !0, removeScrollBar: !0, inert: !1 }
			ko.classNames = { fullWidth: ua, zeroRight: ia }
		})
	var dd,
		cd,
		fd = y(() => {
			cd = function () {
				if (dd) return dd
				if (typeof __webpack_nonce__ < 'u') return __webpack_nonce__
			}
		})
	function Hv() {
		if (!document) return null
		var e = document.createElement('style')
		e.type = 'text/css'
		var t = cd()
		return (t && e.setAttribute('nonce', t), e)
	}
	function Uv(e, t) {
		e.styleSheet ? (e.styleSheet.cssText = t) : e.appendChild(document.createTextNode(t))
	}
	function qv(e) {
		var t = document.head || document.getElementsByTagName('head')[0]
		t.appendChild(e)
	}
	var vs,
		Cs = y(() => {
			fd()
			vs = function () {
				var e = 0,
					t = null
				return {
					add: function (a) {
						;(e == 0 && (t = Hv()) && (Uv(t, a), qv(t)), e++)
					},
					remove: function () {
						;(e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), (t = null)))
					}
				}
			}
		})
	var bs,
		Ls = y(() => {
			Q()
			Cs()
			bs = function () {
				var e = vs()
				return function (t, a) {
					E(
						function () {
							return (
								e.add(t),
								function () {
									e.remove()
								}
							)
						},
						[t && a]
					)
				}
			}
		})
	var To,
		pd = y(() => {
			Ls()
			To = function () {
				var e = bs(),
					t = function (a) {
						var o = a.styles,
							r = a.dynamic
						return (e(o, r), null)
					}
				return t
			}
		})
	var Is = y(() => {
		pd()
		Cs()
		Ls()
	})
	var Vv,
		Ss,
		Gv,
		ws,
		ys = y(() => {
			;((Vv = { left: 0, top: 0, right: 0, gap: 0 }),
				(Ss = function (e) {
					return parseInt(e || '', 10) || 0
				}),
				(Gv = function (e) {
					var t = window.getComputedStyle(document.body),
						a = t[e === 'padding' ? 'paddingLeft' : 'marginLeft'],
						o = t[e === 'padding' ? 'paddingTop' : 'marginTop'],
						r = t[e === 'padding' ? 'paddingRight' : 'marginRight']
					return [Ss(a), Ss(o), Ss(r)]
				}),
				(ws = function (e) {
					if ((e === void 0 && (e = 'margin'), typeof window > 'u')) return Vv
					var t = Gv(e),
						a = document.documentElement.clientWidth,
						o = window.innerWidth
					return { left: t[0], top: t[1], right: t[2], gap: Math.max(0, o - a + t[2] - t[0]) }
				}))
		})
	var Wv,
		Xa,
		jv,
		md,
		Xv,
		Rs,
		gd = y(() => {
			Q()
			Is()
			Mr()
			ys()
			;((Wv = To()),
				(Xa = 'data-scroll-locked'),
				(jv = function (e, t, a, o) {
					var r = e.left,
						n = e.top,
						l = e.right,
						i = e.gap
					return (
						a === void 0 && (a = 'margin'),
						`
  .`
							.concat(
								ds,
								` {
   overflow: hidden `
							)
							.concat(
								o,
								`;
   padding-right: `
							)
							.concat(i, 'px ')
							.concat(
								o,
								`;
  }
  body[`
							)
							.concat(
								Xa,
								`] {
    overflow: hidden `
							)
							.concat(
								o,
								`;
    overscroll-behavior: contain;
    `
							)
							.concat(
								[
									t && 'position: relative '.concat(o, ';'),
									a === 'margin' &&
										`
    padding-left: `
											.concat(
												r,
												`px;
    padding-top: `
											)
											.concat(
												n,
												`px;
    padding-right: `
											)
											.concat(
												l,
												`px;
    margin-left:0;
    margin-top:0;
    margin-right: `
											)
											.concat(i, 'px ')
											.concat(
												o,
												`;
    `
											),
									a === 'padding' && 'padding-right: '.concat(i, 'px ').concat(o, ';')
								]
									.filter(Boolean)
									.join(''),
								`
  }

  .`
							)
							.concat(
								ia,
								` {
    right: `
							)
							.concat(i, 'px ')
							.concat(
								o,
								`;
  }

  .`
							)
							.concat(
								ua,
								` {
    margin-right: `
							)
							.concat(i, 'px ')
							.concat(
								o,
								`;
  }

  .`
							)
							.concat(ia, ' .')
							.concat(
								ia,
								` {
    right: 0 `
							)
							.concat(
								o,
								`;
  }

  .`
							)
							.concat(ua, ' .')
							.concat(
								ua,
								` {
    margin-right: 0 `
							)
							.concat(
								o,
								`;
  }

  body[`
							)
							.concat(
								Xa,
								`] {
    `
							)
							.concat(cs, ': ')
							.concat(
								i,
								`px;
  }
`
							)
					)
				}),
				(md = function () {
					var e = parseInt(document.body.getAttribute(Xa) || '0', 10)
					return isFinite(e) ? e : 0
				}),
				(Xv = function () {
					E(function () {
						return (
							document.body.setAttribute(Xa, (md() + 1).toString()),
							function () {
								var e = md() - 1
								e <= 0
									? document.body.removeAttribute(Xa)
									: document.body.setAttribute(Xa, e.toString())
							}
						)
					}, [])
				}),
				(Rs = function (e) {
					var t = e.noRelative,
						a = e.noImportant,
						o = e.gapMode,
						r = o === void 0 ? 'margin' : o
					Xv()
					var n = we(
						function () {
							return ws(r)
						},
						[r]
					)
					return Re(Wv, { styles: jv(n, !t, r, a ? '' : '!important') })
				}))
		})
	var hd = y(() => {
		gd()
		Mr()
		ys()
	})
	var Ps,
		Ao,
		da,
		xd = y(() => {
			Ps = !1
			if (typeof window < 'u')
				try {
					;((Ao = Object.defineProperty({}, 'passive', {
						get: function () {
							return ((Ps = !0), !0)
						}
					})),
						window.addEventListener('test', Ao, Ao),
						window.removeEventListener('test', Ao, Ao))
				} catch {
					Ps = !1
				}
			da = Ps ? { passive: !1 } : !1
		})
	var Kv,
		vd,
		$v,
		Jv,
		ks,
		Yv,
		Zv,
		Cd,
		bd,
		Qv,
		Ld,
		Id = y(() => {
			;((Kv = function (e) {
				return e.tagName === 'TEXTAREA'
			}),
				(vd = function (e, t) {
					if (!(e instanceof Element)) return !1
					var a = window.getComputedStyle(e)
					return a[t] !== 'hidden' && !(a.overflowY === a.overflowX && !Kv(e) && a[t] === 'visible')
				}),
				($v = function (e) {
					return vd(e, 'overflowY')
				}),
				(Jv = function (e) {
					return vd(e, 'overflowX')
				}),
				(ks = function (e, t) {
					var a = t.ownerDocument,
						o = t
					do {
						typeof ShadowRoot < 'u' && o instanceof ShadowRoot && (o = o.host)
						var r = Cd(e, o)
						if (r) {
							var n = bd(e, o),
								l = n[1],
								i = n[2]
							if (l > i) return !0
						}
						o = o.parentNode
					} while (o && o !== a.body)
					return !1
				}),
				(Yv = function (e) {
					var t = e.scrollTop,
						a = e.scrollHeight,
						o = e.clientHeight
					return [t, a, o]
				}),
				(Zv = function (e) {
					var t = e.scrollLeft,
						a = e.scrollWidth,
						o = e.clientWidth
					return [t, a, o]
				}),
				(Cd = function (e, t) {
					return e === 'v' ? $v(t) : Jv(t)
				}),
				(bd = function (e, t) {
					return e === 'v' ? Yv(t) : Zv(t)
				}),
				(Qv = function (e, t) {
					return e === 'h' && t === 'rtl' ? -1 : 1
				}),
				(Ld = function (e, t, a, o, r) {
					var n = Qv(e, window.getComputedStyle(t).direction),
						l = n * o,
						i = a.target,
						u = t.contains(i),
						d = !1,
						c = l > 0,
						f = 0,
						m = 0
					do {
						if (!i) break
						var h = bd(e, i),
							g = h[0],
							p = h[1],
							x = h[2],
							v = p - x - n * g
						;(g || v) && Cd(e, i) && ((f += v), (m += g))
						var C = i.parentNode
						i = C && C.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? C.host : C
					} while ((!u && i !== document.body) || (u && (t.contains(i) || t === i)))
					return (
						((c && ((r && Math.abs(f) < 1) || (!r && l > f))) ||
							(!c && ((r && Math.abs(m) < 1) || (!r && -l > m)))) &&
							(d = !0),
						d
					)
				}))
		})
	function yd(e) {
		var t = w([]),
			a = w([0, 0]),
			o = w(),
			r = T(aC++)[0],
			n = T(To)[0],
			l = w(e)
		;(E(
			function () {
				l.current = e
			},
			[e]
		),
			E(
				function () {
					if (e.inert) {
						document.body.classList.add('block-interactivity-'.concat(r))
						var p = Qu([e.lockRef.current], (e.shards || []).map(wd), !0).filter(Boolean)
						return (
							p.forEach(function (x) {
								return x.classList.add('allow-interactivity-'.concat(r))
							}),
							function () {
								;(document.body.classList.remove('block-interactivity-'.concat(r)),
									p.forEach(function (x) {
										return x.classList.remove('allow-interactivity-'.concat(r))
									}))
							}
						)
					}
				},
				[e.inert, e.lockRef.current, e.shards]
			))
		var i = G(function (p, x) {
				if (('touches' in p && p.touches.length === 2) || (p.type === 'wheel' && p.ctrlKey))
					return !l.current.allowPinchZoom
				var v = Or(p),
					C = a.current,
					b = 'deltaX' in p ? p.deltaX : C[0] - v[0],
					L = 'deltaY' in p ? p.deltaY : C[1] - v[1],
					I,
					k = p.target,
					P = Math.abs(b) > Math.abs(L) ? 'h' : 'v'
				if ('touches' in p && P === 'h' && k.type === 'range') return !1
				var R = window.getSelection(),
					O = R && R.anchorNode,
					U = O ? O === k || O.contains(k) : !1
				if (U) return !1
				var N = ks(P, k)
				if (!N) return !0
				if ((N ? (I = P) : ((I = P === 'v' ? 'h' : 'v'), (N = ks(P, k))), !N)) return !1
				if ((!o.current && 'changedTouches' in p && (b || L) && (o.current = I), !I)) return !0
				var V = o.current || I
				return Ld(V, x, p, V === 'h' ? b : L, !0)
			}, []),
			u = G(function (p) {
				var x = p
				if (!(!Ka.length || Ka[Ka.length - 1] !== n)) {
					var v = 'deltaY' in x ? Sd(x) : Or(x),
						C = t.current.filter(function (I) {
							return (
								I.name === x.type &&
								(I.target === x.target || x.target === I.shadowParent) &&
								eC(I.delta, v)
							)
						})[0]
					if (C && C.should) {
						x.cancelable && x.preventDefault()
						return
					}
					if (!C) {
						var b = (l.current.shards || [])
								.map(wd)
								.filter(Boolean)
								.filter(function (I) {
									return I.contains(x.target)
								}),
							L = b.length > 0 ? i(x, b[0]) : !l.current.noIsolation
						L && x.cancelable && x.preventDefault()
					}
				}
			}, []),
			d = G(function (p, x, v, C) {
				var b = { name: p, delta: x, target: v, should: C, shadowParent: oC(v) }
				;(t.current.push(b),
					setTimeout(function () {
						t.current = t.current.filter(function (L) {
							return L !== b
						})
					}, 1))
			}, []),
			c = G(function (p) {
				;((a.current = Or(p)), (o.current = void 0))
			}, []),
			f = G(function (p) {
				d(p.type, Sd(p), p.target, i(p, e.lockRef.current))
			}, []),
			m = G(function (p) {
				d(p.type, Or(p), p.target, i(p, e.lockRef.current))
			}, [])
		E(function () {
			return (
				Ka.push(n),
				e.setCallbacks({ onScrollCapture: f, onWheelCapture: f, onTouchMoveCapture: m }),
				document.addEventListener('wheel', u, da),
				document.addEventListener('touchmove', u, da),
				document.addEventListener('touchstart', c, da),
				function () {
					;((Ka = Ka.filter(function (p) {
						return p !== n
					})),
						document.removeEventListener('wheel', u, da),
						document.removeEventListener('touchmove', u, da),
						document.removeEventListener('touchstart', c, da))
				}
			)
		}, [])
		var h = e.removeScrollBar,
			g = e.inert
		return Re(
			Ye,
			null,
			g ? Re(n, { styles: tC(r) }) : null,
			h ? Re(Rs, { noRelative: e.noRelative, gapMode: e.gapMode }) : null
		)
	}
	function oC(e) {
		for (var t = null; e !== null; ) (e instanceof ShadowRoot && ((t = e.host), (e = e.host)), (e = e.parentNode))
		return t
	}
	var Or,
		Sd,
		wd,
		eC,
		tC,
		aC,
		Ka,
		Rd = y(() => {
			ja()
			Q()
			hd()
			Is()
			xd()
			Id()
			;((Or = function (e) {
				return 'changedTouches' in e ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY] : [0, 0]
			}),
				(Sd = function (e) {
					return [e.deltaX, e.deltaY]
				}),
				(wd = function (e) {
					return e && 'current' in e ? e.current : e
				}),
				(eC = function (e, t) {
					return e[0] === t[0] && e[1] === t[1]
				}),
				(tC = function (e) {
					return `
  .block-interactivity-`
						.concat(
							e,
							` {pointer-events: none;}
  .allow-interactivity-`
						)
						.concat(
							e,
							` {pointer-events: all;}
`
						)
				}),
				(aC = 0),
				(Ka = []))
		})
	var Pd,
		kd = y(() => {
			gs()
			Rd()
			hs()
			Pd = ms(Er, yd)
		})
	var Td,
		ca,
		Ad = y(() => {
			ja()
			Q()
			ud()
			kd()
			Td = S(function (e, t) {
				return Re(ko, Ve({}, e, { ref: t, sideCar: Pd }))
			})
			Td.classNames = ko.classNames
			ca = Td
		})
	var Fr = y(() => {
		Ad()
	})
	var rC,
		$a,
		Br,
		Nr,
		Ts,
		Md,
		nC,
		sC,
		Ja,
		_r = y(() => {
			;((rC = function (e) {
				if (typeof document > 'u') return null
				var t = Array.isArray(e) ? e[0] : e
				return t.ownerDocument.body
			}),
				($a = new WeakMap()),
				(Br = new WeakMap()),
				(Nr = {}),
				(Ts = 0),
				(Md = function (e) {
					return e && (e.host || Md(e.parentNode))
				}),
				(nC = function (e, t) {
					return t
						.map(function (a) {
							if (e.contains(a)) return a
							var o = Md(a)
							return o && e.contains(o)
								? o
								: (console.error('aria-hidden', a, 'in not contained inside', e, '. Doing nothing'),
									null)
						})
						.filter(function (a) {
							return !!a
						})
				}),
				(sC = function (e, t, a, o) {
					var r = nC(t, Array.isArray(e) ? e : [e])
					Nr[a] || (Nr[a] = new WeakMap())
					var n = Nr[a],
						l = [],
						i = new Set(),
						u = new Set(r),
						d = function (f) {
							!f || i.has(f) || (i.add(f), d(f.parentNode))
						}
					r.forEach(d)
					var c = function (f) {
						!f ||
							u.has(f) ||
							Array.prototype.forEach.call(f.children, function (m) {
								if (i.has(m)) c(m)
								else
									try {
										var h = m.getAttribute(o),
											g = h !== null && h !== 'false',
											p = ($a.get(m) || 0) + 1,
											x = (n.get(m) || 0) + 1
										;($a.set(m, p),
											n.set(m, x),
											l.push(m),
											p === 1 && g && Br.set(m, !0),
											x === 1 && m.setAttribute(a, 'true'),
											g || m.setAttribute(o, 'true'))
									} catch (v) {
										console.error('aria-hidden: cannot operate on ', m, v)
									}
							})
					}
					return (
						c(t),
						i.clear(),
						Ts++,
						function () {
							;(l.forEach(function (f) {
								var m = $a.get(f) - 1,
									h = n.get(f) - 1
								;($a.set(f, m),
									n.set(f, h),
									m || (Br.has(f) || f.removeAttribute(o), Br.delete(f)),
									h || f.removeAttribute(a))
							}),
								Ts--,
								Ts || (($a = new WeakMap()), ($a = new WeakMap()), (Br = new WeakMap()), (Nr = {})))
						}
					)
				}),
				(Ja = function (e, t, a) {
					a === void 0 && (a = 'data-aria-hidden')
					var o = Array.from(Array.isArray(e) ? e : [e]),
						r = t || rC(e)
					return r
						? (o.push.apply(o, Array.from(r.querySelectorAll('[aria-live], script'))),
							sC(o, r, a, 'aria-hidden'))
						: function () {
								return null
							}
				}))
		})
	var Pe = {}
	Je(Pe, {
		Close: () => Mo,
		Content: () => jr,
		Description: () => Kr,
		Dialog: () => qr,
		DialogClose: () => Mo,
		DialogContent: () => jr,
		DialogDescription: () => Kr,
		DialogOverlay: () => Wr,
		DialogPortal: () => Gr,
		DialogTitle: () => Xr,
		DialogTrigger: () => Vr,
		Overlay: () => Wr,
		Portal: () => Gr,
		Root: () => qr,
		Title: () => Xr,
		Trigger: () => Vr,
		WarningProvider: () => pC,
		createDialogScope: () => Ur
	})
	function Ms(e) {
		return e ? 'open' : 'closed'
	}
	var Hr,
		Dd,
		Ur,
		lC,
		st,
		qr,
		Ed,
		Vr,
		As,
		iC,
		Od,
		Gr,
		zr,
		Wr,
		uC,
		dC,
		Ya,
		jr,
		cC,
		fC,
		Fd,
		Bd,
		Xr,
		Nd,
		Kr,
		_d,
		Mo,
		pC,
		$r = y(() => {
			'use client'
			Q()
			Ke()
			Oe()
			qe()
			Xt()
			Tt()
			Ro()
			Pr()
			Po()
			jt()
			Me()
			Tr()
			Fr()
			_r()
			Wt()
			B()
			;((Hr = 'Dialog'),
				([Dd, Ur] = be(Hr)),
				([lC, st] = Dd(Hr)),
				(qr = (e) => {
					let { __scopeDialog: t, children: a, open: o, defaultOpen: r, onOpenChange: n, modal: l = !0 } = e,
						i = w(null),
						u = w(null),
						[d, c] = De({ prop: o, defaultProp: r ?? !1, onChange: n, caller: Hr })
					return s(lC, {
						scope: t,
						triggerRef: i,
						contentRef: u,
						contentId: Te(),
						titleId: Te(),
						descriptionId: Te(),
						open: d,
						onOpenChange: c,
						onOpenToggle: G(() => c((f) => !f), [c]),
						modal: l,
						children: a
					})
				}))
			qr.displayName = Hr
			;((Ed = 'DialogTrigger'),
				(Vr = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = st(Ed, a),
						n = te(t, r.triggerRef)
					return s(j.button, {
						type: 'button',
						'aria-haspopup': 'dialog',
						'aria-expanded': r.open,
						'aria-controls': r.open ? r.contentId : void 0,
						'data-state': Ms(r.open),
						...o,
						ref: n,
						onClick: _(e.onClick, r.onOpenToggle)
					})
				})))
			Vr.displayName = Ed
			;((As = 'DialogPortal'),
				([iC, Od] = Dd(As, { forceMount: void 0 })),
				(Gr = (e) => {
					let { __scopeDialog: t, forceMount: a, children: o, container: r } = e,
						n = st(As, t)
					return s(iC, {
						scope: t,
						forceMount: a,
						children: ct.map(o, (l) =>
							s(ye, { present: a || n.open, children: s(Dt, { asChild: !0, container: r, children: l }) })
						)
					})
				}))
			Gr.displayName = As
			;((zr = 'DialogOverlay'),
				(Wr = S((e, t) => {
					let a = Od(zr, e.__scopeDialog),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = st(zr, e.__scopeDialog)
					return n.modal ? s(ye, { present: o || n.open, children: s(dC, { ...r, ref: t }) }) : null
				})))
			Wr.displayName = zr
			;((uC = Xe('DialogOverlay.RemoveScroll')),
				(dC = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = st(zr, a),
						n = Wu(),
						l = te(t, n)
					return s(ca, {
						as: uC,
						allowPinchZoom: !0,
						shards: [r.contentRef],
						children: s(j.div, {
							'data-state': Ms(r.open),
							...o,
							ref: l,
							style: { pointerEvents: 'auto', ...o.style }
						})
					})
				})),
				(Ya = 'DialogContent'),
				(jr = S((e, t) => {
					let a = Od(Ya, e.__scopeDialog),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = st(Ya, e.__scopeDialog)
					return s(ye, {
						present: o || n.open,
						children: n.modal ? s(cC, { ...r, ref: t }) : s(fC, { ...r, ref: t })
					})
				})))
			jr.displayName = Ya
			;((cC = S((e, t) => {
				let a = st(Ya, e.__scopeDialog),
					o = w(null),
					r = te(t, a.contentRef, o)
				return (
					E(() => {
						let n = o.current
						if (n) return Ja(n)
					}, []),
					s(Fd, {
						...e,
						ref: r,
						trapFocus: a.open,
						disableOutsidePointerEvents: a.open,
						onCloseAutoFocus: _(e.onCloseAutoFocus, (n) => {
							;(n.preventDefault(), a.triggerRef.current?.focus())
						}),
						onPointerDownOutside: _(e.onPointerDownOutside, (n) => {
							let l = n.detail.originalEvent,
								i = l.button === 0 && l.ctrlKey === !0
							;(l.button === 2 || i) && n.preventDefault()
						}),
						onFocusOutside: _(e.onFocusOutside, (n) => n.preventDefault())
					})
				)
			})),
				(fC = S((e, t) => {
					let a = st(Ya, e.__scopeDialog),
						o = w(!1),
						r = w(!1)
					return s(Fd, {
						...e,
						ref: t,
						trapFocus: !1,
						disableOutsidePointerEvents: !1,
						onCloseAutoFocus: (n) => {
							;(e.onCloseAutoFocus?.(n),
								n.defaultPrevented || (o.current || a.triggerRef.current?.focus(), n.preventDefault()),
								(o.current = !1),
								(r.current = !1))
						},
						onInteractOutside: (n) => {
							;(e.onInteractOutside?.(n),
								n.defaultPrevented ||
									((o.current = !0),
									n.detail.originalEvent.type === 'pointerdown' && (r.current = !0)))
							let l = n.target
							;(a.triggerRef.current?.contains(l) && n.preventDefault(),
								n.detail.originalEvent.type === 'focusin' && r.current && n.preventDefault())
						}
					})
				})),
				(Fd = S((e, t) => {
					let { __scopeDialog: a, trapFocus: o, onOpenAutoFocus: r, onCloseAutoFocus: n, ...l } = e,
						i = st(Ya, a)
					return (
						Wa(),
						s(Ze, {
							children: s(la, {
								asChild: !0,
								loop: !0,
								trapped: o,
								onMountAutoFocus: r,
								onUnmountAutoFocus: n,
								children: s(Mt, {
									role: 'dialog',
									id: i.contentId,
									'aria-describedby': i.descriptionId,
									'aria-labelledby': i.titleId,
									'data-state': Ms(i.open),
									...l,
									ref: t,
									deferPointerDownOutside: !0,
									onDismiss: () => i.onOpenChange(!1)
								})
							})
						})
					)
				})),
				(Bd = 'DialogTitle'),
				(Xr = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = st(Bd, a)
					return s(j.h2, { id: r.titleId, ...o, ref: t })
				})))
			Xr.displayName = Bd
			;((Nd = 'DialogDescription'),
				(Kr = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = st(Nd, a)
					return s(j.p, { id: r.descriptionId, ...o, ref: t })
				})))
			Kr.displayName = Nd
			;((_d = 'DialogClose'),
				(Mo = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = st(_d, a)
					return s(j.button, {
						type: 'button',
						...o,
						ref: t,
						onClick: _(e.onClick, () => r.onOpenChange(!1))
					})
				})))
			Mo.displayName = _d
			pC = (e) => e.children
		})
	var Qe = {}
	Je(Qe, {
		Action: () => TC,
		AlertDialog: () => Ds,
		AlertDialogAction: () => zs,
		AlertDialogCancel: () => Hs,
		AlertDialogContent: () => Bs,
		AlertDialogDescription: () => _s,
		AlertDialogOverlay: () => Fs,
		AlertDialogPortal: () => Os,
		AlertDialogTitle: () => Ns,
		AlertDialogTrigger: () => Es,
		Cancel: () => AC,
		Content: () => kC,
		Description: () => DC,
		Overlay: () => PC,
		Portal: () => RC,
		Root: () => wC,
		Title: () => MC,
		Trigger: () => yC,
		createAlertDialogScope: () => gC
	})
	var zd,
		mC,
		gC,
		Et,
		Ds,
		hC,
		Es,
		xC,
		Os,
		vC,
		Fs,
		Hd,
		CC,
		bC,
		Bs,
		LC,
		Ns,
		IC,
		_s,
		SC,
		zs,
		Ud,
		Hs,
		wC,
		yC,
		RC,
		PC,
		kC,
		TC,
		AC,
		MC,
		DC,
		qd = y(() => {
			'use client'
			Q()
			qe()
			Oe()
			$r()
			$r()
			Ke()
			B()
			;((zd = 'AlertDialog'),
				([mC, gC] = be(zd, [Ur])),
				(Et = Ur()),
				(Ds = (e) => {
					let { __scopeAlertDialog: t, ...a } = e,
						o = Et(t)
					return s(qr, { ...o, ...a, modal: !0 })
				}))
			Ds.displayName = zd
			;((hC = 'AlertDialogTrigger'),
				(Es = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Et(a)
					return s(Vr, { ...r, ...o, ref: t })
				})))
			Es.displayName = hC
			;((xC = 'AlertDialogPortal'),
				(Os = (e) => {
					let { __scopeAlertDialog: t, ...a } = e,
						o = Et(t)
					return s(Gr, { ...o, ...a })
				}))
			Os.displayName = xC
			;((vC = 'AlertDialogOverlay'),
				(Fs = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Et(a)
					return s(Wr, { ...r, ...o, ref: t })
				})))
			Fs.displayName = vC
			;((Hd = 'AlertDialogContent'),
				([CC, bC] = mC(Hd)),
				(Bs = S((e, t) => {
					let { __scopeAlertDialog: a, children: o, ...r } = e,
						n = Et(a),
						l = w(null),
						i = te(t, l),
						u = w(null)
					return s(CC, {
						scope: a,
						cancelRef: u,
						children: s(jr, {
							role: 'alertdialog',
							...n,
							...r,
							ref: i,
							onOpenAutoFocus: _(r.onOpenAutoFocus, (d) => {
								;(d.preventDefault(), u.current?.focus({ preventScroll: !0 }))
							}),
							onPointerDownOutside: (d) => d.preventDefault(),
							onInteractOutside: (d) => d.preventDefault(),
							children: o
						})
					})
				})))
			Bs.displayName = Hd
			;((LC = 'AlertDialogTitle'),
				(Ns = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Et(a)
					return s(Xr, { ...r, ...o, ref: t })
				})))
			Ns.displayName = LC
			;((IC = 'AlertDialogDescription'),
				(_s = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Et(a)
					return s(Kr, { ...r, ...o, ref: t })
				})))
			_s.displayName = IC
			;((SC = 'AlertDialogAction'),
				(zs = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Et(a)
					return s(Mo, { ...r, ...o, ref: t })
				})))
			zs.displayName = SC
			;((Ud = 'AlertDialogCancel'),
				(Hs = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						{ cancelRef: r } = bC(Ud, a),
						n = Et(a),
						l = te(t, r)
					return s(Mo, { ...n, ...o, ref: l })
				})))
			Hs.displayName = Ud
			;((wC = Ds), (yC = Es), (RC = Os), (PC = Fs), (kC = Bs), (TC = zs), (AC = Hs), (MC = Ns), (DC = _s))
		})
	function Za(e) {
		let t = w({ value: e, previous: e })
		return we(
			() => (
				t.current.value !== e && ((t.current.previous = t.current.value), (t.current.value = e)),
				t.current.previous
			),
			[e]
		)
	}
	var Jr = y(() => {
		Q()
	})
	function Qa(e) {
		let [t, a] = T(void 0)
		return (
			Le(() => {
				if (e) {
					a({ width: e.offsetWidth, height: e.offsetHeight })
					let o = new ResizeObserver((r) => {
						if (!Array.isArray(r) || !r.length) return
						let n = r[0],
							l,
							i
						if ('borderBoxSize' in n) {
							let u = n.borderBoxSize,
								d = Array.isArray(u) ? u[0] : u
							;((l = d.inlineSize), (i = d.blockSize))
						} else ((l = e.offsetWidth), (i = e.offsetHeight))
						a({ width: l, height: i })
					})
					return (o.observe(e, { box: 'border-box' }), () => o.unobserve(e))
				} else a(void 0)
			}, [e]),
			t
		)
	}
	var Yr = y(() => {
		Q()
		kt()
	})
	var Do = {}
	Je(Do, {
		Checkbox: () => Wd,
		CheckboxIndicator: () => Xd,
		Indicator: () => Xd,
		Root: () => Wd,
		createCheckboxScope: () => OC,
		unstable_BubbleInput: () => Vs,
		unstable_CheckboxBubbleInput: () => Vs,
		unstable_CheckboxProvider: () => Vd,
		unstable_CheckboxTrigger: () => qs,
		unstable_Provider: () => Vd,
		unstable_Trigger: () => qs
	})
	function Vd(e) {
		let {
				__scopeCheckbox: t,
				checked: a,
				children: o,
				defaultChecked: r,
				disabled: n,
				form: l,
				name: i,
				onCheckedChange: u,
				required: d,
				value: c = 'on',
				internal_do_not_use_render: f
			} = e,
			[m, h] = De({ prop: a, defaultProp: r ?? !1, onChange: u, caller: Zr }),
			[g, p] = T(null),
			[x, v] = T(null),
			C = w(!1),
			b = g ? !!l || !!g.closest('form') : !0,
			L = {
				checked: m,
				disabled: n,
				setChecked: h,
				control: g,
				setControl: p,
				name: i,
				form: l,
				value: c,
				hasConsumerStoppedPropagationRef: C,
				required: d,
				defaultChecked: $t(r) ? !1 : r,
				isFormControl: b,
				bubbleInput: x,
				setBubbleInput: v
			}
		return s(FC, { scope: t, ...L, children: BC(f) ? f(L) : o })
	}
	function BC(e) {
		return typeof e == 'function'
	}
	function $t(e) {
		return e === 'indeterminate'
	}
	function $d(e) {
		return $t(e) ? 'indeterminate' : e ? 'checked' : 'unchecked'
	}
	var Zr,
		EC,
		OC,
		FC,
		Us,
		Gd,
		qs,
		Wd,
		jd,
		Xd,
		Kd,
		Vs,
		Jd = y(() => {
			'use client'
			Q()
			Oe()
			qe()
			Ke()
			Tt()
			Jr()
			Yr()
			jt()
			Me()
			B()
			;((Zr = 'Checkbox'), ([EC, OC] = be(Zr)), ([FC, Us] = EC(Zr)))
			;((Gd = 'CheckboxTrigger'),
				(qs = S(({ __scopeCheckbox: e, onKeyDown: t, onClick: a, ...o }, r) => {
					let {
							control: n,
							value: l,
							disabled: i,
							checked: u,
							required: d,
							setControl: c,
							setChecked: f,
							hasConsumerStoppedPropagationRef: m,
							isFormControl: h,
							bubbleInput: g
						} = Us(Gd, e),
						p = te(r, c),
						x = w(u)
					return (
						E(() => {
							let v = n?.form
							if (v) {
								let C = () => f(x.current)
								return (v.addEventListener('reset', C), () => v.removeEventListener('reset', C))
							}
						}, [n, f]),
						s(j.button, {
							type: 'button',
							role: 'checkbox',
							'aria-checked': $t(u) ? 'mixed' : u,
							'aria-required': d,
							'data-state': $d(u),
							'data-disabled': i ? '' : void 0,
							disabled: i,
							value: l,
							...o,
							ref: p,
							onKeyDown: _(t, (v) => {
								v.key === 'Enter' && v.preventDefault()
							}),
							onClick: _(a, (v) => {
								;(f((C) => ($t(C) ? !0 : !C)),
									g &&
										h &&
										((m.current = v.isPropagationStopped()), m.current || v.stopPropagation()))
							})
						})
					)
				})))
			qs.displayName = Gd
			Wd = S((e, t) => {
				let {
					__scopeCheckbox: a,
					name: o,
					checked: r,
					defaultChecked: n,
					required: l,
					disabled: i,
					value: u,
					onCheckedChange: d,
					form: c,
					...f
				} = e
				return s(Vd, {
					__scopeCheckbox: a,
					checked: r,
					defaultChecked: n,
					disabled: i,
					required: l,
					onCheckedChange: d,
					name: o,
					form: c,
					value: u,
					internal_do_not_use_render: ({ isFormControl: m }) =>
						D(Ze, {
							children: [s(qs, { ...f, ref: t, __scopeCheckbox: a }), m && s(Vs, { __scopeCheckbox: a })]
						})
				})
			})
			Wd.displayName = Zr
			;((jd = 'CheckboxIndicator'),
				(Xd = S((e, t) => {
					let { __scopeCheckbox: a, forceMount: o, ...r } = e,
						n = Us(jd, a)
					return s(ye, {
						present: o || $t(n.checked) || n.checked === !0,
						children: s(j.span, {
							'data-state': $d(n.checked),
							'data-disabled': n.disabled ? '' : void 0,
							...r,
							ref: t,
							style: { pointerEvents: 'none', ...e.style }
						})
					})
				})))
			Xd.displayName = jd
			;((Kd = 'CheckboxBubbleInput'),
				(Vs = S(({ __scopeCheckbox: e, ...t }, a) => {
					let {
							control: o,
							hasConsumerStoppedPropagationRef: r,
							checked: n,
							defaultChecked: l,
							required: i,
							disabled: u,
							name: d,
							value: c,
							form: f,
							bubbleInput: m,
							setBubbleInput: h
						} = Us(Kd, e),
						g = te(a, h),
						p = Za(n),
						x = Qa(o)
					E(() => {
						let C = m
						if (!C) return
						let b = window.HTMLInputElement.prototype,
							I = Object.getOwnPropertyDescriptor(b, 'checked').set,
							k = !r.current
						if (p !== n && I) {
							let P = new Event('click', { bubbles: k })
							;((C.indeterminate = $t(n)), I.call(C, $t(n) ? !1 : n), C.dispatchEvent(P))
						}
					}, [m, p, n, r])
					let v = w($t(n) ? !1 : n)
					return s(j.input, {
						type: 'checkbox',
						'aria-hidden': !0,
						defaultChecked: l ?? v.current,
						required: i,
						disabled: u,
						name: d,
						value: c,
						form: f,
						...t,
						tabIndex: -1,
						ref: g,
						style: {
							...t.style,
							...x,
							position: 'absolute',
							pointerEvents: 'none',
							opacity: 0,
							margin: 0,
							transform: 'translateX(-100%)'
						}
					})
				})))
			Vs.displayName = Kd
		})
	function en(e, t, a) {
		return ze(e, pt(t, a))
	}
	function mt(e, t) {
		return typeof e == 'function' ? e(t) : e
	}
	function gt(e) {
		return e.split('-')[0]
	}
	function fa(e) {
		return e.split('-')[1]
	}
	function tn(e) {
		return e === 'x' ? 'y' : 'x'
	}
	function an(e) {
		return e === 'y' ? 'height' : 'width'
	}
	function it(e) {
		let t = e[0]
		return t === 't' || t === 'b' ? 'y' : 'x'
	}
	function on(e) {
		return tn(it(e))
	}
	function ec(e, t, a) {
		a === void 0 && (a = !1)
		let o = fa(e),
			r = on(e),
			n = an(r),
			l = r === 'x' ? (o === (a ? 'end' : 'start') ? 'right' : 'left') : o === 'start' ? 'bottom' : 'top'
		return (t.reference[n] > t.floating[n] && (l = Eo(l)), [l, Eo(l)])
	}
	function tc(e) {
		let t = Eo(e)
		return [Qr(e), t, Qr(t)]
	}
	function Qr(e) {
		return e.includes('start') ? e.replace('start', 'end') : e.replace('end', 'start')
	}
	function HC(e, t, a) {
		switch (e) {
			case 'top':
			case 'bottom':
				return a ? (t ? Zd : Yd) : t ? Yd : Zd
			case 'left':
			case 'right':
				return t ? _C : zC
			default:
				return []
		}
	}
	function ac(e, t, a, o) {
		let r = fa(e),
			n = HC(gt(e), a === 'start', o)
		return (r && ((n = n.map((l) => l + '-' + r)), t && (n = n.concat(n.map(Qr)))), n)
	}
	function Eo(e) {
		let t = gt(e)
		return NC[t] + e.slice(t.length)
	}
	function UC(e) {
		return { top: 0, right: 0, bottom: 0, left: 0, ...e }
	}
	function Gs(e) {
		return typeof e != 'number' ? UC(e) : { top: e, right: e, bottom: e, left: e }
	}
	function pa(e) {
		let { x: t, y: a, width: o, height: r } = e
		return { width: o, height: r, top: a, left: t, right: t + o, bottom: a + r, x: t, y: a }
	}
	var Qd,
		pt,
		ze,
		Oo,
		Fo,
		lt,
		NC,
		Yd,
		Zd,
		_C,
		zC,
		rn = y(() => {
			;((Qd = ['top', 'right', 'bottom', 'left']),
				(pt = Math.min),
				(ze = Math.max),
				(Oo = Math.round),
				(Fo = Math.floor),
				(lt = (e) => ({ x: e, y: e })),
				(NC = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' }))
			;((Yd = ['left', 'right']), (Zd = ['right', 'left']), (_C = ['top', 'bottom']), (zC = ['bottom', 'top']))
		})
	function oc(e, t, a) {
		let { reference: o, floating: r } = e,
			n = it(t),
			l = on(t),
			i = an(l),
			u = gt(t),
			d = n === 'y',
			c = o.x + o.width / 2 - r.width / 2,
			f = o.y + o.height / 2 - r.height / 2,
			m = o[i] / 2 - r[i] / 2,
			h
		switch (u) {
			case 'top':
				h = { x: c, y: o.y - r.height }
				break
			case 'bottom':
				h = { x: c, y: o.y + o.height }
				break
			case 'right':
				h = { x: o.x + o.width, y: f }
				break
			case 'left':
				h = { x: o.x - r.width, y: f }
				break
			default:
				h = { x: o.x, y: o.y }
		}
		switch (fa(t)) {
			case 'start':
				h[l] -= m * (a && d ? -1 : 1)
				break
			case 'end':
				h[l] += m * (a && d ? -1 : 1)
				break
		}
		return h
	}
	async function sc(e, t) {
		var a
		t === void 0 && (t = {})
		let { x: o, y: r, platform: n, rects: l, elements: i, strategy: u } = e,
			{
				boundary: d = 'clippingAncestors',
				rootBoundary: c = 'viewport',
				elementContext: f = 'floating',
				altBoundary: m = !1,
				padding: h = 0
			} = mt(t, e),
			g = Gs(h),
			x = i[m ? (f === 'floating' ? 'reference' : 'floating') : f],
			v = pa(
				await n.getClippingRect({
					element:
						(a = await (n.isElement == null ? void 0 : n.isElement(x))) == null || a
							? x
							: x.contextElement ||
								(await (n.getDocumentElement == null ? void 0 : n.getDocumentElement(i.floating))),
					boundary: d,
					rootBoundary: c,
					strategy: u
				})
			),
			C = f === 'floating' ? { x: o, y: r, width: l.floating.width, height: l.floating.height } : l.reference,
			b = await (n.getOffsetParent == null ? void 0 : n.getOffsetParent(i.floating)),
			L = (await (n.isElement == null ? void 0 : n.isElement(b)))
				? (await (n.getScale == null ? void 0 : n.getScale(b))) || { x: 1, y: 1 }
				: { x: 1, y: 1 },
			I = pa(
				n.convertOffsetParentRelativeRectToViewportRelativeRect
					? await n.convertOffsetParentRelativeRectToViewportRelativeRect({
							elements: i,
							rect: C,
							offsetParent: b,
							strategy: u
						})
					: C
			)
		return {
			top: (v.top - I.top + g.top) / L.y,
			bottom: (I.bottom - v.bottom + g.bottom) / L.y,
			left: (v.left - I.left + g.left) / L.x,
			right: (I.right - v.right + g.right) / L.x
		}
	}
	function rc(e, t) {
		return { top: e.top - t.height, right: e.right - t.width, bottom: e.bottom - t.height, left: e.left - t.width }
	}
	function nc(e) {
		return Qd.some((t) => e[t] >= 0)
	}
	async function VC(e, t) {
		let { placement: a, platform: o, elements: r } = e,
			n = await (o.isRTL == null ? void 0 : o.isRTL(r.floating)),
			l = gt(a),
			i = fa(a),
			u = it(a) === 'y',
			d = cc.has(l) ? -1 : 1,
			c = n && u ? -1 : 1,
			f = mt(t, e),
			{
				mainAxis: m,
				crossAxis: h,
				alignmentAxis: g
			} = typeof f == 'number'
				? { mainAxis: f, crossAxis: 0, alignmentAxis: null }
				: { mainAxis: f.mainAxis || 0, crossAxis: f.crossAxis || 0, alignmentAxis: f.alignmentAxis }
		return (
			i && typeof g == 'number' && (h = i === 'end' ? g * -1 : g),
			u ? { x: h * c, y: m * d } : { x: m * d, y: h * c }
		)
	}
	var qC,
		lc,
		ic,
		uc,
		dc,
		cc,
		fc,
		pc,
		mc,
		gc,
		hc = y(() => {
			rn()
			rn()
			;((qC = 50),
				(lc = async (e, t, a) => {
					let { placement: o = 'bottom', strategy: r = 'absolute', middleware: n = [], platform: l } = a,
						i = l.detectOverflow ? l : { ...l, detectOverflow: sc },
						u = await (l.isRTL == null ? void 0 : l.isRTL(t)),
						d = await l.getElementRects({ reference: e, floating: t, strategy: r }),
						{ x: c, y: f } = oc(d, o, u),
						m = o,
						h = 0,
						g = {}
					for (let p = 0; p < n.length; p++) {
						let x = n[p]
						if (!x) continue
						let { name: v, fn: C } = x,
							{
								x: b,
								y: L,
								data: I,
								reset: k
							} = await C({
								x: c,
								y: f,
								initialPlacement: o,
								placement: m,
								strategy: r,
								middlewareData: g,
								rects: d,
								platform: i,
								elements: { reference: e, floating: t }
							})
						;((c = b ?? c),
							(f = L ?? f),
							(g[v] = { ...g[v], ...I }),
							k &&
								h < qC &&
								(h++,
								typeof k == 'object' &&
									(k.placement && (m = k.placement),
									k.rects &&
										(d =
											k.rects === !0
												? await l.getElementRects({ reference: e, floating: t, strategy: r })
												: k.rects),
									({ x: c, y: f } = oc(d, m, u))),
								(p = -1)))
					}
					return { x: c, y: f, placement: m, strategy: r, middlewareData: g }
				}),
				(ic = (e) => ({
					name: 'arrow',
					options: e,
					async fn(t) {
						let { x: a, y: o, placement: r, rects: n, platform: l, elements: i, middlewareData: u } = t,
							{ element: d, padding: c = 0 } = mt(e, t) || {}
						if (d == null) return {}
						let f = Gs(c),
							m = { x: a, y: o },
							h = on(r),
							g = an(h),
							p = await l.getDimensions(d),
							x = h === 'y',
							v = x ? 'top' : 'left',
							C = x ? 'bottom' : 'right',
							b = x ? 'clientHeight' : 'clientWidth',
							L = n.reference[g] + n.reference[h] - m[h] - n.floating[g],
							I = m[h] - n.reference[h],
							k = await (l.getOffsetParent == null ? void 0 : l.getOffsetParent(d)),
							P = k ? k[b] : 0
						;(!P || !(await (l.isElement == null ? void 0 : l.isElement(k)))) &&
							(P = i.floating[b] || n.floating[g])
						let R = L / 2 - I / 2,
							O = P / 2 - p[g] / 2 - 1,
							U = pt(f[v], O),
							N = pt(f[C], O),
							V = U,
							K = P - p[g] - N,
							W = P / 2 - p[g] / 2 + R,
							ee = en(V, W, K),
							X =
								!u.arrow &&
								fa(r) != null &&
								W !== ee &&
								n.reference[g] / 2 - (W < V ? U : N) - p[g] / 2 < 0,
							oe = X ? (W < V ? W - V : W - K) : 0
						return {
							[h]: m[h] + oe,
							data: { [h]: ee, centerOffset: W - ee - oe, ...(X && { alignmentOffset: oe }) },
							reset: X
						}
					}
				})),
				(uc = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							name: 'flip',
							options: e,
							async fn(t) {
								var a, o
								let {
										placement: r,
										middlewareData: n,
										rects: l,
										initialPlacement: i,
										platform: u,
										elements: d
									} = t,
									{
										mainAxis: c = !0,
										crossAxis: f = !0,
										fallbackPlacements: m,
										fallbackStrategy: h = 'bestFit',
										fallbackAxisSideDirection: g = 'none',
										flipAlignment: p = !0,
										...x
									} = mt(e, t)
								if ((a = n.arrow) != null && a.alignmentOffset) return {}
								let v = gt(r),
									C = it(i),
									b = gt(i) === i,
									L = await (u.isRTL == null ? void 0 : u.isRTL(d.floating)),
									I = m || (b || !p ? [Eo(i)] : tc(i)),
									k = g !== 'none'
								!m && k && I.push(...ac(i, p, g, L))
								let P = [i, ...I],
									R = await u.detectOverflow(t, x),
									O = [],
									U = ((o = n.flip) == null ? void 0 : o.overflows) || []
								if ((c && O.push(R[v]), f)) {
									let W = ec(r, l, L)
									O.push(R[W[0]], R[W[1]])
								}
								if (((U = [...U, { placement: r, overflows: O }]), !O.every((W) => W <= 0))) {
									var N, V
									let W = (((N = n.flip) == null ? void 0 : N.index) || 0) + 1,
										ee = P[W]
									if (
										ee &&
										(!(f === 'alignment' ? C !== it(ee) : !1) ||
											U.every((M) => (it(M.placement) === C ? M.overflows[0] > 0 : !0)))
									)
										return { data: { index: W, overflows: U }, reset: { placement: ee } }
									let X =
										(V = U.filter((oe) => oe.overflows[0] <= 0).sort(
											(oe, M) => oe.overflows[1] - M.overflows[1]
										)[0]) == null
											? void 0
											: V.placement
									if (!X)
										switch (h) {
											case 'bestFit': {
												var K
												let oe =
													(K = U.filter((M) => {
														if (k) {
															let z = it(M.placement)
															return z === C || z === 'y'
														}
														return !0
													})
														.map((M) => [
															M.placement,
															M.overflows
																.filter((z) => z > 0)
																.reduce((z, re) => z + re, 0)
														])
														.sort((M, z) => M[1] - z[1])[0]) == null
														? void 0
														: K[0]
												oe && (X = oe)
												break
											}
											case 'initialPlacement':
												X = i
												break
										}
									if (r !== X) return { reset: { placement: X } }
								}
								return {}
							}
						}
					)
				}))
			;((dc = function (e) {
				return (
					e === void 0 && (e = {}),
					{
						name: 'hide',
						options: e,
						async fn(t) {
							let { rects: a, platform: o } = t,
								{ strategy: r = 'referenceHidden', ...n } = mt(e, t)
							switch (r) {
								case 'referenceHidden': {
									let l = await o.detectOverflow(t, { ...n, elementContext: 'reference' }),
										i = rc(l, a.reference)
									return { data: { referenceHiddenOffsets: i, referenceHidden: nc(i) } }
								}
								case 'escaped': {
									let l = await o.detectOverflow(t, { ...n, altBoundary: !0 }),
										i = rc(l, a.floating)
									return { data: { escapedOffsets: i, escaped: nc(i) } }
								}
								default:
									return {}
							}
						}
					}
				)
			}),
				(cc = new Set(['left', 'top'])))
			;((fc = function (e) {
				return (
					e === void 0 && (e = 0),
					{
						name: 'offset',
						options: e,
						async fn(t) {
							var a, o
							let { x: r, y: n, placement: l, middlewareData: i } = t,
								u = await VC(t, e)
							return l === ((a = i.offset) == null ? void 0 : a.placement) &&
								(o = i.arrow) != null &&
								o.alignmentOffset
								? {}
								: { x: r + u.x, y: n + u.y, data: { ...u, placement: l } }
						}
					}
				)
			}),
				(pc = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							name: 'shift',
							options: e,
							async fn(t) {
								let { x: a, y: o, placement: r, platform: n } = t,
									{
										mainAxis: l = !0,
										crossAxis: i = !1,
										limiter: u = {
											fn: (v) => {
												let { x: C, y: b } = v
												return { x: C, y: b }
											}
										},
										...d
									} = mt(e, t),
									c = { x: a, y: o },
									f = await n.detectOverflow(t, d),
									m = it(gt(r)),
									h = tn(m),
									g = c[h],
									p = c[m]
								if (l) {
									let v = h === 'y' ? 'top' : 'left',
										C = h === 'y' ? 'bottom' : 'right',
										b = g + f[v],
										L = g - f[C]
									g = en(b, g, L)
								}
								if (i) {
									let v = m === 'y' ? 'top' : 'left',
										C = m === 'y' ? 'bottom' : 'right',
										b = p + f[v],
										L = p - f[C]
									p = en(b, p, L)
								}
								let x = u.fn({ ...t, [h]: g, [m]: p })
								return { ...x, data: { x: x.x - a, y: x.y - o, enabled: { [h]: l, [m]: i } } }
							}
						}
					)
				}),
				(mc = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							options: e,
							fn(t) {
								let { x: a, y: o, placement: r, rects: n, middlewareData: l } = t,
									{ offset: i = 0, mainAxis: u = !0, crossAxis: d = !0 } = mt(e, t),
									c = { x: a, y: o },
									f = it(r),
									m = tn(f),
									h = c[m],
									g = c[f],
									p = mt(i, t),
									x =
										typeof p == 'number'
											? { mainAxis: p, crossAxis: 0 }
											: { mainAxis: 0, crossAxis: 0, ...p }
								if (u) {
									let b = m === 'y' ? 'height' : 'width',
										L = n.reference[m] - n.floating[b] + x.mainAxis,
										I = n.reference[m] + n.reference[b] - x.mainAxis
									h < L ? (h = L) : h > I && (h = I)
								}
								if (d) {
									var v, C
									let b = m === 'y' ? 'width' : 'height',
										L = cc.has(gt(r)),
										I =
											n.reference[f] -
											n.floating[b] +
											((L && ((v = l.offset) == null ? void 0 : v[f])) || 0) +
											(L ? 0 : x.crossAxis),
										k =
											n.reference[f] +
											n.reference[b] +
											(L ? 0 : ((C = l.offset) == null ? void 0 : C[f]) || 0) -
											(L ? x.crossAxis : 0)
									g < I ? (g = I) : g > k && (g = k)
								}
								return { [m]: h, [f]: g }
							}
						}
					)
				}),
				(gc = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							name: 'size',
							options: e,
							async fn(t) {
								var a, o
								let { placement: r, rects: n, platform: l, elements: i } = t,
									{ apply: u = () => {}, ...d } = mt(e, t),
									c = await l.detectOverflow(t, d),
									f = gt(r),
									m = fa(r),
									h = it(r) === 'y',
									{ width: g, height: p } = n.floating,
									x,
									v
								f === 'top' || f === 'bottom'
									? ((x = f),
										(v =
											m ===
											((await (l.isRTL == null ? void 0 : l.isRTL(i.floating))) ? 'start' : 'end')
												? 'left'
												: 'right'))
									: ((v = f), (x = m === 'end' ? 'top' : 'bottom'))
								let C = p - c.top - c.bottom,
									b = g - c.left - c.right,
									L = pt(p - c[x], C),
									I = pt(g - c[v], b),
									k = !t.middlewareData.shift,
									P = L,
									R = I
								if (
									((a = t.middlewareData.shift) != null && a.enabled.x && (R = b),
									(o = t.middlewareData.shift) != null && o.enabled.y && (P = C),
									k && !m)
								) {
									let U = ze(c.left, 0),
										N = ze(c.right, 0),
										V = ze(c.top, 0),
										K = ze(c.bottom, 0)
									h
										? (R = g - 2 * (U !== 0 || N !== 0 ? U + N : ze(c.left, c.right)))
										: (P = p - 2 * (V !== 0 || K !== 0 ? V + K : ze(c.top, c.bottom)))
								}
								await u({ ...t, availableWidth: R, availableHeight: P })
								let O = await l.getDimensions(i.floating)
								return g !== O.width || p !== O.height ? { reset: { rects: !0 } } : {}
							}
						}
					)
				}))
		})
	function nn() {
		return typeof window < 'u'
	}
	function ha(e) {
		return vc(e) ? (e.nodeName || '').toLowerCase() : '#document'
	}
	function Ge(e) {
		var t
		return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window
	}
	function ut(e) {
		var t
		return (t = (vc(e) ? e.ownerDocument : e.document) || window.document) == null ? void 0 : t.documentElement
	}
	function vc(e) {
		return nn() ? e instanceof Node || e instanceof Ge(e).Node : !1
	}
	function et(e) {
		return nn() ? e instanceof Element || e instanceof Ge(e).Element : !1
	}
	function ht(e) {
		return nn() ? e instanceof HTMLElement || e instanceof Ge(e).HTMLElement : !1
	}
	function xc(e) {
		return !nn() || typeof ShadowRoot > 'u' ? !1 : e instanceof ShadowRoot || e instanceof Ge(e).ShadowRoot
	}
	function eo(e) {
		let { overflow: t, overflowX: a, overflowY: o, display: r } = tt(e)
		return /auto|scroll|overlay|hidden|clip/.test(t + o + a) && r !== 'inline' && r !== 'contents'
	}
	function Cc(e) {
		return /^(table|td|th)$/.test(ha(e))
	}
	function Bo(e) {
		try {
			if (e.matches(':popover-open')) return !0
		} catch {}
		try {
			return e.matches(':modal')
		} catch {
			return !1
		}
	}
	function sn(e) {
		let t = et(e) ? tt(e) : e
		return (
			ma(t.transform) ||
			ma(t.translate) ||
			ma(t.scale) ||
			ma(t.rotate) ||
			ma(t.perspective) ||
			(!ln() && (ma(t.backdropFilter) || ma(t.filter))) ||
			GC.test(t.willChange || '') ||
			WC.test(t.contain || '')
		)
	}
	function bc(e) {
		let t = Ot(e)
		for (; ht(t) && !xa(t); ) {
			if (sn(t)) return t
			if (Bo(t)) return null
			t = Ot(t)
		}
		return null
	}
	function ln() {
		return (
			Ws == null && (Ws = typeof CSS < 'u' && CSS.supports && CSS.supports('-webkit-backdrop-filter', 'none')),
			Ws
		)
	}
	function xa(e) {
		return /^(html|body|#document)$/.test(ha(e))
	}
	function tt(e) {
		return Ge(e).getComputedStyle(e)
	}
	function No(e) {
		return et(e)
			? { scrollLeft: e.scrollLeft, scrollTop: e.scrollTop }
			: { scrollLeft: e.scrollX, scrollTop: e.scrollY }
	}
	function Ot(e) {
		if (ha(e) === 'html') return e
		let t = e.assignedSlot || e.parentNode || (xc(e) && e.host) || ut(e)
		return xc(t) ? t.host : t
	}
	function Lc(e) {
		let t = Ot(e)
		return xa(t) ? (e.ownerDocument ? e.ownerDocument.body : e.body) : ht(t) && eo(t) ? t : Lc(t)
	}
	function ga(e, t, a) {
		var o
		;(t === void 0 && (t = []), a === void 0 && (a = !0))
		let r = Lc(e),
			n = r === ((o = e.ownerDocument) == null ? void 0 : o.body),
			l = Ge(r)
		if (n) {
			let i = un(l)
			return t.concat(l, l.visualViewport || [], eo(r) ? r : [], i && a ? ga(i) : [])
		} else return t.concat(r, ga(r, [], a))
	}
	function un(e) {
		return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null
	}
	var GC,
		WC,
		ma,
		Ws,
		Ic = y(() => {
			;((GC = /transform|translate|scale|rotate|perspective|filter/),
				(WC = /paint|layout|strict|content/),
				(ma = (e) => !!e && e !== 'none'))
		})
	function Rc(e) {
		let t = tt(e),
			a = parseFloat(t.width) || 0,
			o = parseFloat(t.height) || 0,
			r = ht(e),
			n = r ? e.offsetWidth : a,
			l = r ? e.offsetHeight : o,
			i = Oo(a) !== n || Oo(o) !== l
		return (i && ((a = n), (o = l)), { width: a, height: o, $: i })
	}
	function Xs(e) {
		return et(e) ? e : e.contextElement
	}
	function to(e) {
		let t = Xs(e)
		if (!ht(t)) return lt(1)
		let a = t.getBoundingClientRect(),
			{ width: o, height: r, $: n } = Rc(t),
			l = (n ? Oo(a.width) : a.width) / o,
			i = (n ? Oo(a.height) : a.height) / r
		return ((!l || !Number.isFinite(l)) && (l = 1), (!i || !Number.isFinite(i)) && (i = 1), { x: l, y: i })
	}
	function Pc(e) {
		let t = Ge(e)
		return !ln() || !t.visualViewport ? jC : { x: t.visualViewport.offsetLeft, y: t.visualViewport.offsetTop }
	}
	function XC(e, t, a) {
		return (t === void 0 && (t = !1), !a || (t && a !== Ge(e)) ? !1 : t)
	}
	function va(e, t, a, o) {
		;(t === void 0 && (t = !1), a === void 0 && (a = !1))
		let r = e.getBoundingClientRect(),
			n = Xs(e),
			l = lt(1)
		t && (o ? et(o) && (l = to(o)) : (l = to(e)))
		let i = XC(n, a, o) ? Pc(n) : lt(0),
			u = (r.left + i.x) / l.x,
			d = (r.top + i.y) / l.y,
			c = r.width / l.x,
			f = r.height / l.y
		if (n) {
			let m = Ge(n),
				h = o && et(o) ? Ge(o) : o,
				g = m,
				p = un(g)
			for (; p && o && h !== g; ) {
				let x = to(p),
					v = p.getBoundingClientRect(),
					C = tt(p),
					b = v.left + (p.clientLeft + parseFloat(C.paddingLeft)) * x.x,
					L = v.top + (p.clientTop + parseFloat(C.paddingTop)) * x.y
				;((u *= x.x), (d *= x.y), (c *= x.x), (f *= x.y), (u += b), (d += L), (g = Ge(p)), (p = un(g)))
			}
		}
		return pa({ width: c, height: f, x: u, y: d })
	}
	function dn(e, t) {
		let a = No(e).scrollLeft
		return t ? t.left + a : va(ut(e)).left + a
	}
	function kc(e, t) {
		let a = e.getBoundingClientRect(),
			o = a.left + t.scrollLeft - dn(e, a),
			r = a.top + t.scrollTop
		return { x: o, y: r }
	}
	function KC(e) {
		let { elements: t, rect: a, offsetParent: o, strategy: r } = e,
			n = r === 'fixed',
			l = ut(o),
			i = t ? Bo(t.floating) : !1
		if (o === l || (i && n)) return a
		let u = { scrollLeft: 0, scrollTop: 0 },
			d = lt(1),
			c = lt(0),
			f = ht(o)
		if ((f || (!f && !n)) && ((ha(o) !== 'body' || eo(l)) && (u = No(o)), f)) {
			let h = va(o)
			;((d = to(o)), (c.x = h.x + o.clientLeft), (c.y = h.y + o.clientTop))
		}
		let m = l && !f && !n ? kc(l, u) : lt(0)
		return {
			width: a.width * d.x,
			height: a.height * d.y,
			x: a.x * d.x - u.scrollLeft * d.x + c.x + m.x,
			y: a.y * d.y - u.scrollTop * d.y + c.y + m.y
		}
	}
	function $C(e) {
		return Array.from(e.getClientRects())
	}
	function JC(e) {
		let t = ut(e),
			a = No(e),
			o = e.ownerDocument.body,
			r = ze(t.scrollWidth, t.clientWidth, o.scrollWidth, o.clientWidth),
			n = ze(t.scrollHeight, t.clientHeight, o.scrollHeight, o.clientHeight),
			l = -a.scrollLeft + dn(e),
			i = -a.scrollTop
		return (
			tt(o).direction === 'rtl' && (l += ze(t.clientWidth, o.clientWidth) - r),
			{ width: r, height: n, x: l, y: i }
		)
	}
	function YC(e, t) {
		let a = Ge(e),
			o = ut(e),
			r = a.visualViewport,
			n = o.clientWidth,
			l = o.clientHeight,
			i = 0,
			u = 0
		if (r) {
			;((n = r.width), (l = r.height))
			let c = ln()
			;(!c || (c && t === 'fixed')) && ((i = r.offsetLeft), (u = r.offsetTop))
		}
		let d = dn(o)
		if (d <= 0) {
			let c = o.ownerDocument,
				f = c.body,
				m = getComputedStyle(f),
				h = (c.compatMode === 'CSS1Compat' && parseFloat(m.marginLeft) + parseFloat(m.marginRight)) || 0,
				g = Math.abs(o.clientWidth - f.clientWidth - h)
			g <= Sc && (n -= g)
		} else d <= Sc && (n += d)
		return { width: n, height: l, x: i, y: u }
	}
	function ZC(e, t) {
		let a = va(e, !0, t === 'fixed'),
			o = a.top + e.clientTop,
			r = a.left + e.clientLeft,
			n = ht(e) ? to(e) : lt(1),
			l = e.clientWidth * n.x,
			i = e.clientHeight * n.y,
			u = r * n.x,
			d = o * n.y
		return { width: l, height: i, x: u, y: d }
	}
	function wc(e, t, a) {
		let o
		if (t === 'viewport') o = YC(e, a)
		else if (t === 'document') o = JC(ut(e))
		else if (et(t)) o = ZC(t, a)
		else {
			let r = Pc(e)
			o = { x: t.x - r.x, y: t.y - r.y, width: t.width, height: t.height }
		}
		return pa(o)
	}
	function Tc(e, t) {
		let a = Ot(e)
		return a === t || !et(a) || xa(a) ? !1 : tt(a).position === 'fixed' || Tc(a, t)
	}
	function QC(e, t) {
		let a = t.get(e)
		if (a) return a
		let o = ga(e, [], !1).filter((i) => et(i) && ha(i) !== 'body'),
			r = null,
			n = tt(e).position === 'fixed',
			l = n ? Ot(e) : e
		for (; et(l) && !xa(l); ) {
			let i = tt(l),
				u = sn(l)
			;(!u && i.position === 'fixed' && (r = null),
				(
					n
						? !u && !r
						: (!u &&
								i.position === 'static' &&
								!!r &&
								(r.position === 'absolute' || r.position === 'fixed')) ||
							(eo(l) && !u && Tc(e, l))
				)
					? (o = o.filter((c) => c !== l))
					: (r = i),
				(l = Ot(l)))
		}
		return (t.set(e, o), o)
	}
	function eb(e) {
		let { element: t, boundary: a, rootBoundary: o, strategy: r } = e,
			l = [...(a === 'clippingAncestors' ? (Bo(t) ? [] : QC(t, this._c)) : [].concat(a)), o],
			i = wc(t, l[0], r),
			u = i.top,
			d = i.right,
			c = i.bottom,
			f = i.left
		for (let m = 1; m < l.length; m++) {
			let h = wc(t, l[m], r)
			;((u = ze(h.top, u)), (d = pt(h.right, d)), (c = pt(h.bottom, c)), (f = ze(h.left, f)))
		}
		return { width: d - f, height: c - u, x: f, y: u }
	}
	function tb(e) {
		let { width: t, height: a } = Rc(e)
		return { width: t, height: a }
	}
	function ab(e, t, a) {
		let o = ht(t),
			r = ut(t),
			n = a === 'fixed',
			l = va(e, !0, n, t),
			i = { scrollLeft: 0, scrollTop: 0 },
			u = lt(0)
		function d() {
			u.x = dn(r)
		}
		if (o || (!o && !n))
			if (((ha(t) !== 'body' || eo(r)) && (i = No(t)), o)) {
				let h = va(t, !0, n, t)
				;((u.x = h.x + t.clientLeft), (u.y = h.y + t.clientTop))
			} else r && d()
		n && !o && r && d()
		let c = r && !o && !n ? kc(r, i) : lt(0),
			f = l.left + i.scrollLeft - u.x - c.x,
			m = l.top + i.scrollTop - u.y - c.y
		return { x: f, y: m, width: l.width, height: l.height }
	}
	function js(e) {
		return tt(e).position === 'static'
	}
	function yc(e, t) {
		if (!ht(e) || tt(e).position === 'fixed') return null
		if (t) return t(e)
		let a = e.offsetParent
		return (ut(e) === a && (a = a.ownerDocument.body), a)
	}
	function Ac(e, t) {
		let a = Ge(e)
		if (Bo(e)) return a
		if (!ht(e)) {
			let r = Ot(e)
			for (; r && !xa(r); ) {
				if (et(r) && !js(r)) return r
				r = Ot(r)
			}
			return a
		}
		let o = yc(e, t)
		for (; o && Cc(o) && js(o); ) o = yc(o, t)
		return o && xa(o) && js(o) && !sn(o) ? a : o || bc(e) || a
	}
	function rb(e) {
		return tt(e).direction === 'rtl'
	}
	function Dc(e, t) {
		return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height
	}
	function nb(e, t) {
		let a = null,
			o,
			r = ut(e)
		function n() {
			var i
			;(clearTimeout(o), (i = a) == null || i.disconnect(), (a = null))
		}
		function l(i, u) {
			;(i === void 0 && (i = !1), u === void 0 && (u = 1), n())
			let d = e.getBoundingClientRect(),
				{ left: c, top: f, width: m, height: h } = d
			if ((i || t(), !m || !h)) return
			let g = Fo(f),
				p = Fo(r.clientWidth - (c + m)),
				x = Fo(r.clientHeight - (f + h)),
				v = Fo(c),
				b = { rootMargin: -g + 'px ' + -p + 'px ' + -x + 'px ' + -v + 'px', threshold: ze(0, pt(1, u)) || 1 },
				L = !0
			function I(k) {
				let P = k[0].intersectionRatio
				if (P !== u) {
					if (!L) return l()
					P
						? l(!1, P)
						: (o = setTimeout(() => {
								l(!1, 1e-7)
							}, 1e3))
				}
				;(P === 1 && !Dc(d, e.getBoundingClientRect()) && l(), (L = !1))
			}
			try {
				a = new IntersectionObserver(I, { ...b, root: r.ownerDocument })
			} catch {
				a = new IntersectionObserver(I, b)
			}
			a.observe(e)
		}
		return (l(!0), n)
	}
	function Ks(e, t, a, o) {
		o === void 0 && (o = {})
		let {
				ancestorScroll: r = !0,
				ancestorResize: n = !0,
				elementResize: l = typeof ResizeObserver == 'function',
				layoutShift: i = typeof IntersectionObserver == 'function',
				animationFrame: u = !1
			} = o,
			d = Xs(e),
			c = r || n ? [...(d ? ga(d) : []), ...(t ? ga(t) : [])] : []
		c.forEach((v) => {
			;(r && v.addEventListener('scroll', a, { passive: !0 }), n && v.addEventListener('resize', a))
		})
		let f = d && i ? nb(d, a) : null,
			m = -1,
			h = null
		l &&
			((h = new ResizeObserver((v) => {
				let [C] = v
				;(C &&
					C.target === d &&
					h &&
					t &&
					(h.unobserve(t),
					cancelAnimationFrame(m),
					(m = requestAnimationFrame(() => {
						var b
						;(b = h) == null || b.observe(t)
					}))),
					a())
			})),
			d && !u && h.observe(d),
			t && h.observe(t))
		let g,
			p = u ? va(e) : null
		u && x()
		function x() {
			let v = va(e)
			;(p && !Dc(p, v) && a(), (p = v), (g = requestAnimationFrame(x)))
		}
		return (
			a(),
			() => {
				var v
				;(c.forEach((C) => {
					;(r && C.removeEventListener('scroll', a), n && C.removeEventListener('resize', a))
				}),
					f?.(),
					(v = h) == null || v.disconnect(),
					(h = null),
					u && cancelAnimationFrame(g))
			}
		)
	}
	var jC,
		Sc,
		ob,
		Mc,
		Ec,
		Oc,
		Fc,
		Bc,
		Nc,
		$s,
		_c,
		Js,
		Ys = y(() => {
			hc()
			rn()
			Ic()
			jC = lt(0)
			Sc = 25
			ob = async function (e) {
				let t = this.getOffsetParent || Ac,
					a = this.getDimensions,
					o = await a(e.floating)
				return {
					reference: ab(e.reference, await t(e.floating), e.strategy),
					floating: { x: 0, y: 0, width: o.width, height: o.height }
				}
			}
			Mc = {
				convertOffsetParentRelativeRectToViewportRelativeRect: KC,
				getDocumentElement: ut,
				getClippingRect: eb,
				getOffsetParent: Ac,
				getElementRects: ob,
				getClientRects: $C,
				getDimensions: tb,
				getScale: to,
				isElement: et,
				isRTL: rb
			}
			;((Ec = fc),
				(Oc = pc),
				(Fc = uc),
				(Bc = gc),
				(Nc = dc),
				($s = ic),
				(_c = mc),
				(Js = (e, t, a) => {
					let o = new Map(),
						r = { platform: Mc, ...a },
						n = { ...r.platform, _c: o }
					return lc(e, t, { ...r, platform: n })
				}))
		})
	function fn(e, t) {
		if (e === t) return !0
		if (typeof e != typeof t) return !1
		if (typeof e == 'function' && e.toString() === t.toString()) return !0
		let a, o, r
		if (e && t && typeof e == 'object') {
			if (Array.isArray(e)) {
				if (((a = e.length), a !== t.length)) return !1
				for (o = a; o-- !== 0; ) if (!fn(e[o], t[o])) return !1
				return !0
			}
			if (((r = Object.keys(e)), (a = r.length), a !== Object.keys(t).length)) return !1
			for (o = a; o-- !== 0; ) if (!{}.hasOwnProperty.call(t, r[o])) return !1
			for (o = a; o-- !== 0; ) {
				let n = r[o]
				if (!(n === '_owner' && e.$$typeof) && !fn(e[n], t[n])) return !1
			}
			return !0
		}
		return e !== e && t !== t
	}
	function Hc(e) {
		return typeof window > 'u' ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1
	}
	function zc(e, t) {
		let a = Hc(e)
		return Math.round(t * a) / a
	}
	function Zs(e) {
		let t = w(e)
		return (
			cn(() => {
				t.current = e
			}),
			t
		)
	}
	function Uc(e) {
		e === void 0 && (e = {})
		let {
				placement: t = 'bottom',
				strategy: a = 'absolute',
				middleware: o = [],
				platform: r,
				elements: { reference: n, floating: l } = {},
				transform: i = !0,
				whileElementsMounted: u,
				open: d
			} = e,
			[c, f] = T({ x: 0, y: 0, strategy: a, placement: t, middlewareData: {}, isPositioned: !1 }),
			[m, h] = T(o)
		fn(m, o) || h(o)
		let [g, p] = T(null),
			[x, v] = T(null),
			C = G((M) => {
				M !== k.current && ((k.current = M), p(M))
			}, []),
			b = G((M) => {
				M !== P.current && ((P.current = M), v(M))
			}, []),
			L = n || g,
			I = l || x,
			k = w(null),
			P = w(null),
			R = w(c),
			O = u != null,
			U = Zs(u),
			N = Zs(r),
			V = Zs(d),
			K = G(() => {
				if (!k.current || !P.current) return
				let M = { placement: t, strategy: a, middleware: m }
				;(N.current && (M.platform = N.current),
					Js(k.current, P.current, M).then((z) => {
						let re = { ...z, isPositioned: V.current !== !1 }
						W.current &&
							!fn(R.current, re) &&
							((R.current = re),
							br(() => {
								f(re)
							}))
					}))
			}, [m, t, a, N, V])
		cn(() => {
			d === !1 &&
				R.current.isPositioned &&
				((R.current.isPositioned = !1), f((M) => ({ ...M, isPositioned: !1 })))
		}, [d])
		let W = w(!1)
		;(cn(
			() => (
				(W.current = !0),
				() => {
					W.current = !1
				}
			),
			[]
		),
			cn(() => {
				if ((L && (k.current = L), I && (P.current = I), L && I)) {
					if (U.current) return U.current(L, I, K)
					K()
				}
			}, [L, I, K, U, O]))
		let ee = we(() => ({ reference: k, floating: P, setReference: C, setFloating: b }), [C, b]),
			X = we(() => ({ reference: L, floating: I }), [L, I]),
			oe = we(() => {
				let M = { position: a, left: 0, top: 0 }
				if (!X.floating) return M
				let z = zc(X.floating, c.x),
					re = zc(X.floating, c.y)
				return i
					? {
							...M,
							transform: 'translate(' + z + 'px, ' + re + 'px)',
							...(Hc(X.floating) >= 1.5 && { willChange: 'transform' })
						}
					: { position: a, left: z, top: re }
			}, [a, i, X.floating, c.x, c.y])
		return we(() => ({ ...c, update: K, refs: ee, elements: X, floatingStyles: oe }), [c, K, ee, X, oe])
	}
	var sb,
		lb,
		cn,
		ib,
		qc,
		Vc,
		Gc,
		Wc,
		jc,
		Xc,
		Kc,
		$c = y(() => {
			Ys()
			Ys()
			Q()
			Q()
			Ha()
			;((sb = typeof document < 'u'), (lb = function () {}), (cn = sb ? Rt : lb))
			;((ib = (e) => {
				function t(a) {
					return {}.hasOwnProperty.call(a, 'current')
				}
				return {
					name: 'arrow',
					options: e,
					fn(a) {
						let { element: o, padding: r } = typeof e == 'function' ? e(a) : e
						return o && t(o)
							? o.current != null
								? $s({ element: o.current, padding: r }).fn(a)
								: {}
							: o
								? $s({ element: o, padding: r }).fn(a)
								: {}
					}
				}
			}),
				(qc = (e, t) => {
					let a = Ec(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Vc = (e, t) => {
					let a = Oc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Gc = (e, t) => ({ fn: _c(e).fn, options: [e, t] })),
				(Wc = (e, t) => {
					let a = Fc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(jc = (e, t) => {
					let a = Bc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Xc = (e, t) => {
					let a = Nc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Kc = (e, t) => {
					let a = ib(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}))
		})
	var ub,
		Jc,
		Yc,
		Zc = y(() => {
			Q()
			Me()
			B()
			;((ub = 'Arrow'),
				(Jc = S((e, t) => {
					let { children: a, width: o = 10, height: r = 5, ...n } = e
					return s(j.svg, {
						...n,
						ref: t,
						width: o,
						height: r,
						viewBox: '0 0 30 10',
						preserveAspectRatio: 'none',
						children: e.asChild ? a : s('polygon', { points: '0,0 30,0 15,10' })
					})
				})))
			Jc.displayName = ub
			Yc = Jc
		})
	function gb(e) {
		return e !== null
	}
	function tl(e) {
		let [t, a = 'center'] = e.split('-')
		return [t, a]
	}
	var Qs,
		Qc,
		Ft,
		cb,
		ef,
		tf,
		af,
		of,
		el,
		fb,
		pb,
		rf,
		nf,
		mb,
		sf,
		hb,
		Ca,
		ao,
		oo,
		ro,
		ba = y(() => {
			'use client'
			Q()
			$c()
			Zc()
			Oe()
			qe()
			Me()
			At()
			kt()
			Yr()
			B()
			;((Qs = 'Popper'),
				([Qc, Ft] = be(Qs)),
				([cb, ef] = Qc(Qs)),
				(tf = (e) => {
					let { __scopePopper: t, children: a } = e,
						[o, r] = T(null),
						[n, l] = T(void 0)
					return s(cb, {
						scope: t,
						anchor: o,
						onAnchorChange: r,
						placementState: n,
						setPlacementState: l,
						children: a
					})
				}))
			tf.displayName = Qs
			;((af = 'PopperAnchor'),
				(of = S((e, t) => {
					let { __scopePopper: a, virtualRef: o, ...r } = e,
						n = ef(af, a),
						l = w(null),
						i = n.onAnchorChange,
						u = G(
							(g) => {
								;((l.current = g), g && i(g))
							},
							[i]
						),
						d = te(t, u),
						c = w(null)
					E(() => {
						if (!o) return
						let g = c.current
						;((c.current = o.current), g !== c.current && i(c.current))
					})
					let f = n.placementState && tl(n.placementState),
						m = f?.[0],
						h = f?.[1]
					return o
						? null
						: s(j.div, { 'data-radix-popper-side': m, 'data-radix-popper-align': h, ...r, ref: d })
				})))
			of.displayName = af
			;((el = 'PopperContent'),
				([fb, pb] = Qc(el)),
				(rf = S((e, t) => {
					let {
							__scopePopper: a,
							side: o = 'bottom',
							sideOffset: r = 0,
							align: n = 'center',
							alignOffset: l = 0,
							arrowPadding: i = 0,
							avoidCollisions: u = !0,
							collisionBoundary: d = [],
							collisionPadding: c = 0,
							sticky: f = 'partial',
							hideWhenDetached: m = !1,
							updatePositionStrategy: h = 'optimized',
							onPlaced: g,
							...p
						} = e,
						x = ef(el, a),
						[v, C] = T(null),
						b = te(t, (se) => C(se)),
						[L, I] = T(null),
						k = Qa(L),
						P = k?.width ?? 0,
						R = k?.height ?? 0,
						O = o + (n !== 'center' ? '-' + n : ''),
						U = typeof c == 'number' ? c : { top: 0, right: 0, bottom: 0, left: 0, ...c },
						N = Array.isArray(d) ? d : [d],
						V = N.length > 0,
						K = { padding: U, boundary: N.filter(gb), altBoundary: V },
						{
							refs: W,
							floatingStyles: ee,
							placement: X,
							isPositioned: oe,
							middlewareData: M
						} = Uc({
							strategy: 'fixed',
							placement: O,
							whileElementsMounted: (...se) => Ks(...se, { animationFrame: h === 'always' }),
							elements: { reference: x.anchor },
							middleware: [
								qc({ mainAxis: r + R, alignmentAxis: l }),
								u &&
									Vc({ mainAxis: !0, crossAxis: !1, limiter: f === 'partial' ? Gc() : void 0, ...K }),
								u && Wc({ ...K }),
								jc({
									...K,
									apply: ({ elements: se, rects: Ce, availableWidth: ne, availableHeight: ge }) => {
										let { width: xe, height: $e } = Ce.reference,
											Ne = se.floating.style
										;(Ne.setProperty('--radix-popper-available-width', `${ne}px`),
											Ne.setProperty('--radix-popper-available-height', `${ge}px`),
											Ne.setProperty('--radix-popper-anchor-width', `${xe}px`),
											Ne.setProperty('--radix-popper-anchor-height', `${$e}px`))
									}
								}),
								L && Kc({ element: L, padding: i }),
								hb({ arrowWidth: P, arrowHeight: R }),
								m && Xc({ strategy: 'referenceHidden', ...K, boundary: V ? K.boundary : void 0 })
							]
						}),
						z = x.setPlacementState
					Le(
						() => (
							z(X),
							() => {
								z(void 0)
							}
						),
						[X, z]
					)
					let [re, ue] = tl(X),
						Se = Ie(g)
					Le(() => {
						oe && Se?.()
					}, [oe, Se])
					let ie = M.arrow?.x,
						ce = M.arrow?.y,
						ke = M.arrow?.centerOffset !== 0,
						[fe, H] = T()
					return (
						Le(() => {
							v && H(window.getComputedStyle(v).zIndex)
						}, [v]),
						s('div', {
							ref: W.setFloating,
							'data-radix-popper-content-wrapper': '',
							style: {
								...ee,
								transform: oe ? ee.transform : 'translate(0, -200%)',
								minWidth: 'max-content',
								zIndex: fe,
								'--radix-popper-transform-origin': [M.transformOrigin?.x, M.transformOrigin?.y].join(
									' '
								),
								...(M.hide?.referenceHidden && { visibility: 'hidden', pointerEvents: 'none' })
							},
							dir: e.dir,
							children: s(fb, {
								scope: a,
								placedSide: re,
								placedAlign: ue,
								onArrowChange: I,
								arrowX: ie,
								arrowY: ce,
								shouldHideArrow: ke,
								children: s(j.div, {
									'data-side': re,
									'data-align': ue,
									...p,
									ref: b,
									style: { ...p.style, animation: oe ? void 0 : 'none' }
								})
							})
						})
					)
				})))
			rf.displayName = el
			;((nf = 'PopperArrow'),
				(mb = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }),
				(sf = S(function (t, a) {
					let { __scopePopper: o, ...r } = t,
						n = pb(nf, o),
						l = mb[n.placedSide]
					return s('span', {
						ref: n.onArrowChange,
						style: {
							position: 'absolute',
							left: n.arrowX,
							top: n.arrowY,
							[l]: 0,
							transformOrigin: { top: '', right: '0 0', bottom: 'center 0', left: '100% 0' }[
								n.placedSide
							],
							transform: {
								top: 'translateY(100%)',
								right: 'translateY(50%) rotate(90deg) translateX(-50%)',
								bottom: 'rotate(180deg)',
								left: 'translateY(50%) rotate(-90deg) translateX(50%)'
							}[n.placedSide],
							visibility: n.shouldHideArrow ? 'hidden' : void 0
						},
						children: s(Yc, { ...r, ref: a, style: { ...r.style, display: 'block' } })
					})
				})))
			sf.displayName = nf
			hb = (e) => ({
				name: 'transformOrigin',
				options: e,
				fn(t) {
					let { placement: a, rects: o, middlewareData: r } = t,
						l = r.arrow?.centerOffset !== 0,
						i = l ? 0 : e.arrowWidth,
						u = l ? 0 : e.arrowHeight,
						[d, c] = tl(a),
						f = { start: '0%', center: '50%', end: '100%' }[c],
						m = (r.arrow?.x ?? 0) + i / 2,
						h = (r.arrow?.y ?? 0) + u / 2,
						g = '',
						p = ''
					return (
						d === 'bottom'
							? ((g = l ? f : `${m}px`), (p = `${-u}px`))
							: d === 'top'
								? ((g = l ? f : `${m}px`), (p = `${o.floating.height + u}px`))
								: d === 'right'
									? ((g = `${-u}px`), (p = l ? f : `${h}px`))
									: d === 'left' && ((g = `${o.floating.width + u}px`), (p = l ? f : `${h}px`)),
						{ data: { x: g, y: p } }
					)
				}
			})
			;((Ca = tf), (ao = of), (oo = rf), (ro = sf))
		})
	function wb(e, t) {
		return t !== 'rtl' ? e : e === 'ArrowLeft' ? 'ArrowRight' : e === 'ArrowRight' ? 'ArrowLeft' : e
	}
	function yb(e, t, a) {
		let o = wb(e.key, a)
		if (
			!(t === 'vertical' && ['ArrowLeft', 'ArrowRight'].includes(o)) &&
			!(t === 'horizontal' && ['ArrowUp', 'ArrowDown'].includes(o))
		)
			return Sb[o]
	}
	function ff(e, t = !1) {
		let a = document.activeElement
		for (let o of e) if (o === a || (o.focus({ preventScroll: t }), document.activeElement !== a)) return
	}
	function Rb(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	var ol,
		xb,
		_o,
		rl,
		lf,
		vb,
		Cb,
		no,
		bb,
		Lb,
		uf,
		Ib,
		df,
		cf,
		Sb,
		pn,
		mn,
		zo = y(() => {
			'use client'
			Q()
			Ke()
			yr()
			Oe()
			qe()
			Xt()
			Me()
			At()
			Tt()
			Va()
			B()
			;((ol = 'rovingFocusGroup.onEntryFocus'),
				(xb = { bubbles: !1, cancelable: !0 }),
				(_o = 'RovingFocusGroup'),
				([rl, lf, vb] = qa(_o)),
				([Cb, no] = be(_o, [vb])),
				([bb, Lb] = Cb(_o)),
				(uf = S((e, t) =>
					s(rl.Provider, {
						scope: e.__scopeRovingFocusGroup,
						children: s(rl.Slot, { scope: e.__scopeRovingFocusGroup, children: s(Ib, { ...e, ref: t }) })
					})
				)))
			uf.displayName = _o
			;((Ib = S((e, t) => {
				let {
						__scopeRovingFocusGroup: a,
						orientation: o,
						loop: r = !1,
						dir: n,
						currentTabStopId: l,
						defaultCurrentTabStopId: i,
						onCurrentTabStopIdChange: u,
						onEntryFocus: d,
						preventScrollOnEntryFocus: c = !1,
						...f
					} = e,
					m = w(null),
					h = te(t, m),
					g = ft(n),
					[p, x] = De({ prop: l, defaultProp: i ?? null, onChange: u, caller: _o }),
					[v, C] = T(!1),
					b = Ie(d),
					L = lf(a),
					I = w(!1),
					[k, P] = T(0)
				return (
					E(() => {
						let R = m.current
						if (R) return (R.addEventListener(ol, b), () => R.removeEventListener(ol, b))
					}, [b]),
					s(bb, {
						scope: a,
						orientation: o,
						dir: g,
						loop: r,
						currentTabStopId: p,
						onItemFocus: G((R) => x(R), [x]),
						onItemShiftTab: G(() => C(!0), []),
						onFocusableItemAdd: G(() => P((R) => R + 1), []),
						onFocusableItemRemove: G(() => P((R) => R - 1), []),
						children: s(j.div, {
							tabIndex: v || k === 0 ? -1 : 0,
							'data-orientation': o,
							...f,
							ref: h,
							style: { outline: 'none', ...e.style },
							onMouseDown: _(e.onMouseDown, () => {
								I.current = !0
							}),
							onFocus: _(e.onFocus, (R) => {
								let O = !I.current
								if (R.target === R.currentTarget && O && !v) {
									let U = new CustomEvent(ol, xb)
									if ((R.currentTarget.dispatchEvent(U), !U.defaultPrevented)) {
										let N = L().filter((X) => X.focusable),
											V = N.find((X) => X.active),
											K = N.find((X) => X.id === p),
											ee = [V, K, ...N].filter(Boolean).map((X) => X.ref.current)
										ff(ee, c)
									}
								}
								I.current = !1
							}),
							onBlur: _(e.onBlur, () => C(!1))
						})
					})
				)
			})),
				(df = 'RovingFocusGroupItem'),
				(cf = S((e, t) => {
					let {
							__scopeRovingFocusGroup: a,
							focusable: o = !0,
							active: r = !1,
							tabStopId: n,
							children: l,
							...i
						} = e,
						u = Te(),
						d = n || u,
						c = Lb(df, a),
						f = c.currentTabStopId === d,
						m = lf(a),
						{ onFocusableItemAdd: h, onFocusableItemRemove: g, currentTabStopId: p } = c
					return (
						E(() => {
							if (o) return (h(), () => g())
						}, [o, h, g]),
						s(rl.ItemSlot, {
							scope: a,
							id: d,
							focusable: o,
							active: r,
							children: s(j.span, {
								tabIndex: f ? 0 : -1,
								'data-orientation': c.orientation,
								...i,
								ref: t,
								onMouseDown: _(e.onMouseDown, (x) => {
									o ? c.onItemFocus(d) : x.preventDefault()
								}),
								onFocus: _(e.onFocus, () => c.onItemFocus(d)),
								onKeyDown: _(e.onKeyDown, (x) => {
									if (x.key === 'Tab' && x.shiftKey) {
										c.onItemShiftTab()
										return
									}
									if (x.target !== x.currentTarget) return
									let v = yb(x, c.orientation, c.dir)
									if (v !== void 0) {
										if (x.metaKey || x.ctrlKey || x.altKey || x.shiftKey) return
										x.preventDefault()
										let b = m()
											.filter((L) => L.focusable)
											.map((L) => L.ref.current)
										if (v === 'last') b.reverse()
										else if (v === 'prev' || v === 'next') {
											v === 'prev' && b.reverse()
											let L = b.indexOf(x.currentTarget)
											b = c.loop ? Rb(b, L + 1) : b.slice(L + 1)
										}
										setTimeout(() => ff(b))
									}
								}),
								children: typeof l == 'function' ? l({ isCurrentTabStop: f, hasTabStop: p != null }) : l
							})
						})
					)
				})))
			cf.displayName = df
			Sb = {
				ArrowLeft: 'prev',
				ArrowUp: 'prev',
				ArrowRight: 'next',
				ArrowDown: 'next',
				PageUp: 'first',
				Home: 'first',
				PageDown: 'last',
				End: 'last'
			}
			;((pn = uf), (mn = cf))
		})
	function _f(e) {
		return e ? 'open' : 'closed'
	}
	function hn(e) {
		return e === 'indeterminate'
	}
	function ml(e) {
		return hn(e) ? 'indeterminate' : e ? 'checked' : 'unchecked'
	}
	function $b(e) {
		let t = document.activeElement
		for (let a of e) if (a === t || (a.focus(), document.activeElement !== t)) return
	}
	function Jb(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	function Yb(e, t, a) {
		let r = t.length > 1 && Array.from(t).every((d) => d === t[0]) ? t[0] : t,
			n = a ? e.indexOf(a) : -1,
			l = Jb(e, Math.max(n, 0))
		r.length === 1 && (l = l.filter((d) => d !== a))
		let u = l.find((d) => d.toLowerCase().startsWith(r.toLowerCase()))
		return u !== a ? u : void 0
	}
	function Zb(e, t) {
		let { x: a, y: o } = e,
			r = !1
		for (let n = 0, l = t.length - 1; n < t.length; l = n++) {
			let i = t[n],
				u = t[l],
				d = i.x,
				c = i.y,
				f = u.x,
				m = u.y
			c > o != m > o && a < ((f - d) * (o - c)) / (m - c) + d && (r = !r)
		}
		return r
	}
	function Qb(e, t) {
		if (!t) return !1
		let a = { x: e.clientX, y: e.clientY }
		return Zb(a, t)
	}
	function qo(e) {
		return (t) => (t.pointerType === 'mouse' ? e(t) : void 0)
	}
	var nl,
		Pb,
		gf,
		kb,
		Tb,
		Ab,
		Vo,
		Uo,
		Mb,
		Db,
		La,
		sl,
		Go,
		hf,
		xf,
		Jt,
		Eb,
		Wo,
		vf,
		Ob,
		ll,
		il,
		Fb,
		Cf,
		bf,
		at,
		Bb,
		ul,
		Lf,
		Nb,
		_b,
		zb,
		dl,
		Hb,
		cl,
		Ub,
		If,
		gn,
		mf,
		xn,
		Sf,
		qb,
		wf,
		yf,
		Vb,
		Gb,
		Rf,
		Pf,
		kf,
		fl,
		Tf,
		Wb,
		Af,
		jb,
		Mf,
		Xb,
		Df,
		pl,
		Kb,
		Ef,
		Of,
		Ho,
		Ff,
		Bf,
		Nf,
		zf,
		Hf,
		Uf,
		qf,
		Vf,
		Gf,
		Wf,
		jf,
		Xf,
		Kf,
		$f,
		Jf,
		Yf,
		Zf,
		Qf,
		ep,
		gl = y(() => {
			'use client'
			Q()
			Ke()
			yr()
			Oe()
			qe()
			Va()
			Ro()
			Tr()
			Pr()
			Xt()
			ba()
			ba()
			Po()
			jt()
			Me()
			zo()
			zo()
			Wt()
			At()
			_r()
			Fr()
			B()
			;((nl = ['Enter', ' ']),
				(Pb = ['ArrowDown', 'PageUp', 'Home']),
				(gf = ['ArrowUp', 'PageDown', 'End']),
				(kb = [...Pb, ...gf]),
				(Tb = { ltr: [...nl, 'ArrowRight'], rtl: [...nl, 'ArrowLeft'] }),
				(Ab = { ltr: ['ArrowLeft'], rtl: ['ArrowRight'] }),
				(Vo = 'Menu'),
				([Uo, Mb, Db] = qa(Vo)),
				([La, sl] = be(Vo, [Db, Ft, no])),
				(Go = Ft()),
				(hf = no()),
				([xf, Jt] = La(Vo)),
				([Eb, Wo] = La(Vo)),
				(vf = (e) => {
					let { __scopeMenu: t, open: a = !1, children: o, dir: r, onOpenChange: n, modal: l = !0 } = e,
						i = Go(t),
						[u, d] = T(null),
						c = w(!1),
						f = Ie(n),
						m = ft(r)
					return (
						E(() => {
							let h = () => {
									;((c.current = !0),
										document.addEventListener('pointerdown', g, { capture: !0, once: !0 }),
										document.addEventListener('pointermove', g, { capture: !0, once: !0 }))
								},
								g = () => (c.current = !1)
							return (
								document.addEventListener('keydown', h, { capture: !0 }),
								() => {
									;(document.removeEventListener('keydown', h, { capture: !0 }),
										document.removeEventListener('pointerdown', g, { capture: !0 }),
										document.removeEventListener('pointermove', g, { capture: !0 }))
								}
							)
						}, []),
						E(() => {
							if (!a) return
							let h = () => f(!1)
							return (window.addEventListener('blur', h), () => window.removeEventListener('blur', h))
						}, [a, f]),
						s(Ca, {
							...i,
							children: s(xf, {
								scope: t,
								open: a,
								onOpenChange: f,
								content: u,
								onContentChange: d,
								children: s(Eb, {
									scope: t,
									onClose: G(() => f(!1), [f]),
									isUsingKeyboardRef: c,
									dir: m,
									modal: l,
									children: o
								})
							})
						})
					)
				}))
			vf.displayName = Vo
			;((Ob = 'MenuAnchor'),
				(ll = S((e, t) => {
					let { __scopeMenu: a, ...o } = e,
						r = Go(a)
					return s(ao, { ...r, ...o, ref: t })
				})))
			ll.displayName = Ob
			;((il = 'MenuPortal'),
				([Fb, Cf] = La(il, { forceMount: void 0 })),
				(bf = (e) => {
					let { __scopeMenu: t, forceMount: a, children: o, container: r } = e,
						n = Jt(il, t)
					return s(Fb, {
						scope: t,
						forceMount: a,
						children: s(ye, {
							present: a || n.open,
							children: s(Dt, { asChild: !0, container: r, children: o })
						})
					})
				}))
			bf.displayName = il
			;((at = 'MenuContent'),
				([Bb, ul] = La(at)),
				(Lf = S((e, t) => {
					let a = Cf(at, e.__scopeMenu),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = Jt(at, e.__scopeMenu),
						l = Wo(at, e.__scopeMenu)
					return s(Uo.Provider, {
						scope: e.__scopeMenu,
						children: s(ye, {
							present: o || n.open,
							children: s(Uo.Slot, {
								scope: e.__scopeMenu,
								children: l.modal ? s(Nb, { ...r, ref: t }) : s(_b, { ...r, ref: t })
							})
						})
					})
				})),
				(Nb = S((e, t) => {
					let a = Jt(at, e.__scopeMenu),
						o = w(null),
						r = te(t, o)
					return (
						E(() => {
							let n = o.current
							if (n) return Ja(n)
						}, []),
						s(dl, {
							...e,
							ref: r,
							trapFocus: a.open,
							disableOutsidePointerEvents: a.open,
							disableOutsideScroll: !0,
							onFocusOutside: _(e.onFocusOutside, (n) => n.preventDefault(), {
								checkForDefaultPrevented: !1
							}),
							onDismiss: () => a.onOpenChange(!1)
						})
					)
				})),
				(_b = S((e, t) => {
					let a = Jt(at, e.__scopeMenu)
					return s(dl, {
						...e,
						ref: t,
						trapFocus: !1,
						disableOutsidePointerEvents: !1,
						disableOutsideScroll: !1,
						onDismiss: () => a.onOpenChange(!1)
					})
				})),
				(zb = Xe('MenuContent.ScrollLock')),
				(dl = S((e, t) => {
					let {
							__scopeMenu: a,
							loop: o = !1,
							trapFocus: r,
							onOpenAutoFocus: n,
							onCloseAutoFocus: l,
							disableOutsidePointerEvents: i,
							onEntryFocus: u,
							onEscapeKeyDown: d,
							onPointerDownOutside: c,
							onFocusOutside: f,
							onInteractOutside: m,
							onDismiss: h,
							disableOutsideScroll: g,
							...p
						} = e,
						x = Jt(at, a),
						v = Wo(at, a),
						C = Go(a),
						b = hf(a),
						L = Mb(a),
						[I, k] = T(null),
						P = w(null),
						R = te(t, P, x.onContentChange),
						O = w(0),
						U = w(''),
						N = w(0),
						V = w(null),
						K = w('right'),
						W = w(0),
						ee = g ? ca : Ye,
						X = g ? { as: zb, allowPinchZoom: !0 } : void 0,
						oe = (z) => {
							let re = U.current + z,
								ue = L().filter((H) => !H.disabled),
								Se = document.activeElement,
								ie = ue.find((H) => H.ref.current === Se)?.textValue,
								ce = ue.map((H) => H.textValue),
								ke = Yb(ce, re, ie),
								fe = ue.find((H) => H.textValue === ke)?.ref.current
							;((function H(se) {
								;((U.current = se),
									window.clearTimeout(O.current),
									se !== '' && (O.current = window.setTimeout(() => H(''), 1e3)))
							})(re),
								fe && setTimeout(() => fe.focus()))
						}
					;(E(() => () => window.clearTimeout(O.current), []), Wa())
					let M = G((z) => K.current === V.current?.side && Qb(z, V.current?.area), [])
					return s(Bb, {
						scope: a,
						searchRef: U,
						onItemEnter: G(
							(z) => {
								M(z) && z.preventDefault()
							},
							[M]
						),
						onItemLeave: G(
							(z) => {
								M(z) || (P.current?.focus(), k(null))
							},
							[M]
						),
						onTriggerLeave: G(
							(z) => {
								M(z) && z.preventDefault()
							},
							[M]
						),
						pointerGraceTimerRef: N,
						onPointerGraceIntentChange: G((z) => {
							V.current = z
						}, []),
						children: s(ee, {
							...X,
							children: s(la, {
								asChild: !0,
								trapped: r,
								onMountAutoFocus: _(n, (z) => {
									;(z.preventDefault(), P.current?.focus({ preventScroll: !0 }))
								}),
								onUnmountAutoFocus: l,
								children: s(Mt, {
									asChild: !0,
									disableOutsidePointerEvents: i,
									onEscapeKeyDown: d,
									onPointerDownOutside: c,
									onFocusOutside: f,
									onInteractOutside: m,
									onDismiss: h,
									children: s(pn, {
										asChild: !0,
										...b,
										dir: v.dir,
										orientation: 'vertical',
										loop: o,
										currentTabStopId: I,
										onCurrentTabStopIdChange: k,
										onEntryFocus: _(u, (z) => {
											v.isUsingKeyboardRef.current || z.preventDefault()
										}),
										preventScrollOnEntryFocus: !0,
										children: s(oo, {
											role: 'menu',
											'aria-orientation': 'vertical',
											'data-state': _f(x.open),
											'data-radix-menu-content': '',
											dir: v.dir,
											...C,
											...p,
											ref: R,
											style: { outline: 'none', ...p.style },
											onKeyDown: _(p.onKeyDown, (z) => {
												let ue =
														z.target.closest('[data-radix-menu-content]') ===
														z.currentTarget,
													Se = z.ctrlKey || z.altKey || z.metaKey,
													ie = z.key.length === 1
												ue && (z.key === 'Tab' && z.preventDefault(), !Se && ie && oe(z.key))
												let ce = P.current
												if (z.target !== ce || !kb.includes(z.key)) return
												z.preventDefault()
												let fe = L()
													.filter((H) => !H.disabled)
													.map((H) => H.ref.current)
												;(gf.includes(z.key) && fe.reverse(), $b(fe))
											}),
											onBlur: _(e.onBlur, (z) => {
												z.currentTarget.contains(z.target) ||
													(window.clearTimeout(O.current), (U.current = ''))
											}),
											onPointerMove: _(
												e.onPointerMove,
												qo((z) => {
													let re = z.target,
														ue = W.current !== z.clientX
													if (z.currentTarget.contains(re) && ue) {
														let Se = z.clientX > W.current ? 'right' : 'left'
														;((K.current = Se), (W.current = z.clientX))
													}
												})
											)
										})
									})
								})
							})
						})
					})
				})))
			Lf.displayName = at
			;((Hb = 'MenuGroup'),
				(cl = S((e, t) => {
					let { __scopeMenu: a, ...o } = e
					return s(j.div, { role: 'group', ...o, ref: t })
				})))
			cl.displayName = Hb
			;((Ub = 'MenuLabel'),
				(If = S((e, t) => {
					let { __scopeMenu: a, ...o } = e
					return s(j.div, { ...o, ref: t })
				})))
			If.displayName = Ub
			;((gn = 'MenuItem'),
				(mf = 'menu.itemSelect'),
				(xn = S((e, t) => {
					let { disabled: a = !1, onSelect: o, ...r } = e,
						n = w(null),
						l = Wo(gn, e.__scopeMenu),
						i = ul(gn, e.__scopeMenu),
						u = te(t, n),
						d = w(!1),
						c = () => {
							let f = n.current
							if (!a && f) {
								let m = new CustomEvent(mf, { bubbles: !0, cancelable: !0 })
								;(f.addEventListener(mf, (h) => o?.(h), { once: !0 }),
									wr(f, m),
									m.defaultPrevented ? (d.current = !1) : l.onClose())
							}
						}
					return s(Sf, {
						...r,
						ref: u,
						disabled: a,
						onClick: _(e.onClick, c),
						onPointerDown: (f) => {
							;(e.onPointerDown?.(f), (d.current = !0))
						},
						onPointerUp: _(e.onPointerUp, (f) => {
							d.current || f.currentTarget?.click()
						}),
						onKeyDown: _(e.onKeyDown, (f) => {
							let m = i.searchRef.current !== ''
							a ||
								(m && f.key === ' ') ||
								(nl.includes(f.key) && (f.currentTarget.click(), f.preventDefault()))
						})
					})
				})))
			xn.displayName = gn
			;((Sf = S((e, t) => {
				let { __scopeMenu: a, disabled: o = !1, textValue: r, ...n } = e,
					l = ul(gn, a),
					i = hf(a),
					u = w(null),
					d = te(t, u),
					[c, f] = T(!1),
					[m, h] = T('')
				return (
					E(() => {
						let g = u.current
						g && h((g.textContent ?? '').trim())
					}, [n.children]),
					s(Uo.ItemSlot, {
						scope: a,
						disabled: o,
						textValue: r ?? m,
						children: s(mn, {
							asChild: !0,
							...i,
							focusable: !o,
							children: s(j.div, {
								role: 'menuitem',
								'data-highlighted': c ? '' : void 0,
								'aria-disabled': o || void 0,
								'data-disabled': o ? '' : void 0,
								...n,
								ref: d,
								onPointerMove: _(
									e.onPointerMove,
									qo((g) => {
										o
											? l.onItemLeave(g)
											: (l.onItemEnter(g),
												g.defaultPrevented || g.currentTarget.focus({ preventScroll: !0 }))
									})
								),
								onPointerLeave: _(
									e.onPointerLeave,
									qo((g) => l.onItemLeave(g))
								),
								onFocus: _(e.onFocus, () => f(!0)),
								onBlur: _(e.onBlur, () => f(!1))
							})
						})
					})
				)
			})),
				(qb = 'MenuCheckboxItem'),
				(wf = S((e, t) => {
					let { checked: a = !1, onCheckedChange: o, ...r } = e
					return s(Tf, {
						scope: e.__scopeMenu,
						checked: a,
						children: s(xn, {
							role: 'menuitemcheckbox',
							'aria-checked': hn(a) ? 'mixed' : a,
							...r,
							ref: t,
							'data-state': ml(a),
							onSelect: _(r.onSelect, () => o?.(hn(a) ? !0 : !a), { checkForDefaultPrevented: !1 })
						})
					})
				})))
			wf.displayName = qb
			;((yf = 'MenuRadioGroup'),
				([Vb, Gb] = La(yf, { value: void 0, onValueChange: () => {} })),
				(Rf = S((e, t) => {
					let { value: a, onValueChange: o, ...r } = e,
						n = Ie(o)
					return s(Vb, {
						scope: e.__scopeMenu,
						value: a,
						onValueChange: n,
						children: s(cl, { ...r, ref: t })
					})
				})))
			Rf.displayName = yf
			;((Pf = 'MenuRadioItem'),
				(kf = S((e, t) => {
					let { value: a, ...o } = e,
						r = Gb(Pf, e.__scopeMenu),
						n = a === r.value
					return s(Tf, {
						scope: e.__scopeMenu,
						checked: n,
						children: s(xn, {
							role: 'menuitemradio',
							'aria-checked': n,
							...o,
							ref: t,
							'data-state': ml(n),
							onSelect: _(o.onSelect, () => r.onValueChange?.(a), { checkForDefaultPrevented: !1 })
						})
					})
				})))
			kf.displayName = Pf
			;((fl = 'MenuItemIndicator'),
				([Tf, Wb] = La(fl, { checked: !1 })),
				(Af = S((e, t) => {
					let { __scopeMenu: a, forceMount: o, ...r } = e,
						n = Wb(fl, a)
					return s(ye, {
						present: o || hn(n.checked) || n.checked === !0,
						children: s(j.span, { ...r, ref: t, 'data-state': ml(n.checked) })
					})
				})))
			Af.displayName = fl
			;((jb = 'MenuSeparator'),
				(Mf = S((e, t) => {
					let { __scopeMenu: a, ...o } = e
					return s(j.div, { role: 'separator', 'aria-orientation': 'horizontal', ...o, ref: t })
				})))
			Mf.displayName = jb
			;((Xb = 'MenuArrow'),
				(Df = S((e, t) => {
					let { __scopeMenu: a, ...o } = e,
						r = Go(a)
					return s(ro, { ...r, ...o, ref: t })
				})))
			Df.displayName = Xb
			;((pl = 'MenuSub'),
				([Kb, Ef] = La(pl)),
				(Of = (e) => {
					let { __scopeMenu: t, children: a, open: o = !1, onOpenChange: r } = e,
						n = Jt(pl, t),
						l = Go(t),
						[i, u] = T(null),
						[d, c] = T(null),
						f = Ie(r)
					return (
						E(() => (n.open === !1 && f(!1), () => f(!1)), [n.open, f]),
						s(Ca, {
							...l,
							children: s(xf, {
								scope: t,
								open: o,
								onOpenChange: f,
								content: d,
								onContentChange: c,
								children: s(Kb, {
									scope: t,
									contentId: Te(),
									triggerId: Te(),
									trigger: i,
									onTriggerChange: u,
									children: a
								})
							})
						})
					)
				}))
			Of.displayName = pl
			;((Ho = 'MenuSubTrigger'),
				(Ff = S((e, t) => {
					let a = Jt(Ho, e.__scopeMenu),
						o = Wo(Ho, e.__scopeMenu),
						r = Ef(Ho, e.__scopeMenu),
						n = ul(Ho, e.__scopeMenu),
						l = w(null),
						{ pointerGraceTimerRef: i, onPointerGraceIntentChange: u } = n,
						d = { __scopeMenu: e.__scopeMenu },
						c = G(() => {
							;(l.current && window.clearTimeout(l.current), (l.current = null))
						}, [])
					return (
						E(() => c, [c]),
						E(() => {
							let f = i.current
							return () => {
								;(window.clearTimeout(f), u(null))
							}
						}, [i, u]),
						s(ll, {
							asChild: !0,
							...d,
							children: s(Sf, {
								id: r.triggerId,
								'aria-haspopup': 'menu',
								'aria-expanded': a.open,
								'aria-controls': a.open ? r.contentId : void 0,
								'data-state': _f(a.open),
								...e,
								ref: yo(t, r.onTriggerChange),
								onClick: (f) => {
									;(e.onClick?.(f),
										!(e.disabled || f.defaultPrevented) &&
											(f.currentTarget.focus(), a.open || a.onOpenChange(!0)))
								},
								onPointerMove: _(
									e.onPointerMove,
									qo((f) => {
										;(n.onItemEnter(f),
											!f.defaultPrevented &&
												!e.disabled &&
												!a.open &&
												!l.current &&
												(n.onPointerGraceIntentChange(null),
												(l.current = window.setTimeout(() => {
													;(a.onOpenChange(!0), c())
												}, 100))))
									})
								),
								onPointerLeave: _(
									e.onPointerLeave,
									qo((f) => {
										c()
										let m = a.content?.getBoundingClientRect()
										if (m) {
											let h = a.content?.dataset.side,
												g = h === 'right',
												p = g ? -5 : 5,
												x = m[g ? 'left' : 'right'],
												v = m[g ? 'right' : 'left']
											;(n.onPointerGraceIntentChange({
												area: [
													{ x: f.clientX + p, y: f.clientY },
													{ x, y: m.top },
													{ x: v, y: m.top },
													{ x: v, y: m.bottom },
													{ x, y: m.bottom }
												],
												side: h
											}),
												window.clearTimeout(i.current),
												(i.current = window.setTimeout(
													() => n.onPointerGraceIntentChange(null),
													300
												)))
										} else {
											if ((n.onTriggerLeave(f), f.defaultPrevented)) return
											n.onPointerGraceIntentChange(null)
										}
									})
								),
								onKeyDown: _(e.onKeyDown, (f) => {
									let m = n.searchRef.current !== ''
									e.disabled ||
										(m && f.key === ' ') ||
										(Tb[o.dir].includes(f.key) &&
											(a.onOpenChange(!0), a.content?.focus(), f.preventDefault()))
								})
							})
						})
					)
				})))
			Ff.displayName = Ho
			;((Bf = 'MenuSubContent'),
				(Nf = S((e, t) => {
					let a = Cf(at, e.__scopeMenu),
						{ forceMount: o = a.forceMount, align: r = 'start', ...n } = e,
						l = Jt(at, e.__scopeMenu),
						i = Wo(at, e.__scopeMenu),
						u = Ef(Bf, e.__scopeMenu),
						d = w(null),
						c = te(t, d)
					return s(Uo.Provider, {
						scope: e.__scopeMenu,
						children: s(ye, {
							present: o || l.open,
							children: s(Uo.Slot, {
								scope: e.__scopeMenu,
								children: s(dl, {
									id: u.contentId,
									'aria-labelledby': u.triggerId,
									...n,
									ref: c,
									align: r,
									side: i.dir === 'rtl' ? 'left' : 'right',
									disableOutsidePointerEvents: !1,
									disableOutsideScroll: !1,
									trapFocus: !1,
									onOpenAutoFocus: (f) => {
										;(i.isUsingKeyboardRef.current && d.current?.focus(), f.preventDefault())
									},
									onCloseAutoFocus: (f) => f.preventDefault(),
									onFocusOutside: _(e.onFocusOutside, (f) => {
										f.target !== u.trigger && l.onOpenChange(!1)
									}),
									onEscapeKeyDown: _(e.onEscapeKeyDown, (f) => {
										;(i.onClose(), f.preventDefault())
									}),
									onKeyDown: _(e.onKeyDown, (f) => {
										let m = f.currentTarget.contains(f.target),
											h = Ab[i.dir].includes(f.key)
										m && h && (l.onOpenChange(!1), u.trigger?.focus(), f.preventDefault())
									})
								})
							})
						})
					})
				})))
			Nf.displayName = Bf
			;((zf = vf),
				(Hf = ll),
				(Uf = bf),
				(qf = Lf),
				(Vf = cl),
				(Gf = If),
				(Wf = xn),
				(jf = wf),
				(Xf = Rf),
				(Kf = kf),
				($f = Af),
				(Jf = Mf),
				(Yf = Df),
				(Zf = Of),
				(Qf = Ff),
				(ep = Nf))
		})
	var Bt = {}
	Je(Bt, {
		Arrow: () => kL,
		CheckboxItem: () => SL,
		Content: () => CL,
		DropdownMenu: () => hl,
		DropdownMenuArrow: () => kl,
		DropdownMenuCheckboxItem: () => Sl,
		DropdownMenuContent: () => Cl,
		DropdownMenuGroup: () => bl,
		DropdownMenuItem: () => Il,
		DropdownMenuItemIndicator: () => Rl,
		DropdownMenuLabel: () => Ll,
		DropdownMenuPortal: () => vl,
		DropdownMenuRadioGroup: () => wl,
		DropdownMenuRadioItem: () => yl,
		DropdownMenuSeparator: () => Pl,
		DropdownMenuSub: () => rp,
		DropdownMenuSubContent: () => Al,
		DropdownMenuSubTrigger: () => Tl,
		DropdownMenuTrigger: () => xl,
		Group: () => bL,
		Item: () => IL,
		ItemIndicator: () => RL,
		Label: () => LL,
		Portal: () => vL,
		RadioGroup: () => wL,
		RadioItem: () => yL,
		Root: () => hL,
		Separator: () => PL,
		Sub: () => TL,
		SubContent: () => ML,
		SubTrigger: () => AL,
		Trigger: () => xL,
		createDropdownMenuScope: () => aL
	})
	var vn,
		tL,
		aL,
		Fe,
		oL,
		tp,
		hl,
		ap,
		xl,
		rL,
		vl,
		op,
		Cl,
		nL,
		bl,
		sL,
		Ll,
		lL,
		Il,
		iL,
		Sl,
		uL,
		wl,
		dL,
		yl,
		cL,
		Rl,
		fL,
		Pl,
		pL,
		kl,
		rp,
		mL,
		Tl,
		gL,
		Al,
		hL,
		xL,
		vL,
		CL,
		bL,
		LL,
		IL,
		SL,
		wL,
		yL,
		RL,
		PL,
		kL,
		TL,
		AL,
		ML,
		np = y(() => {
			'use client'
			Q()
			Ke()
			Oe()
			qe()
			Tt()
			Me()
			gl()
			gl()
			Xt()
			B()
			;((vn = 'DropdownMenu'),
				([tL, aL] = be(vn, [sl])),
				(Fe = sl()),
				([oL, tp] = tL(vn)),
				(hl = (e) => {
					let {
							__scopeDropdownMenu: t,
							children: a,
							dir: o,
							open: r,
							defaultOpen: n,
							onOpenChange: l,
							modal: i = !0
						} = e,
						u = Fe(t),
						d = w(null),
						[c, f] = De({ prop: r, defaultProp: n ?? !1, onChange: l, caller: vn })
					return s(oL, {
						scope: t,
						triggerId: Te(),
						triggerRef: d,
						contentId: Te(),
						open: c,
						onOpenChange: f,
						onOpenToggle: G(() => f((m) => !m), [f]),
						modal: i,
						children: s(zf, { ...u, open: c, onOpenChange: f, dir: o, modal: i, children: a })
					})
				}))
			hl.displayName = vn
			;((ap = 'DropdownMenuTrigger'),
				(xl = S((e, t) => {
					let { __scopeDropdownMenu: a, disabled: o = !1, ...r } = e,
						n = tp(ap, a),
						l = Fe(a)
					return s(Hf, {
						asChild: !0,
						...l,
						children: s(j.button, {
							type: 'button',
							id: n.triggerId,
							'aria-haspopup': 'menu',
							'aria-expanded': n.open,
							'aria-controls': n.open ? n.contentId : void 0,
							'data-state': n.open ? 'open' : 'closed',
							'data-disabled': o ? '' : void 0,
							disabled: o,
							...r,
							ref: yo(t, n.triggerRef),
							onPointerDown: _(e.onPointerDown, (i) => {
								!o &&
									i.button === 0 &&
									i.ctrlKey === !1 &&
									(n.onOpenToggle(), n.open || i.preventDefault())
							}),
							onKeyDown: _(e.onKeyDown, (i) => {
								o ||
									(['Enter', ' '].includes(i.key) && n.onOpenToggle(),
									i.key === 'ArrowDown' && n.onOpenChange(!0),
									['Enter', ' ', 'ArrowDown'].includes(i.key) && i.preventDefault())
							})
						})
					})
				})))
			xl.displayName = ap
			;((rL = 'DropdownMenuPortal'),
				(vl = (e) => {
					let { __scopeDropdownMenu: t, ...a } = e,
						o = Fe(t)
					return s(Uf, { ...o, ...a })
				}))
			vl.displayName = rL
			;((op = 'DropdownMenuContent'),
				(Cl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = tp(op, a),
						n = Fe(a),
						l = w(!1)
					return s(qf, {
						id: r.contentId,
						'aria-labelledby': r.triggerId,
						...n,
						...o,
						ref: t,
						onCloseAutoFocus: _(e.onCloseAutoFocus, (i) => {
							;(l.current || r.triggerRef.current?.focus(), (l.current = !1), i.preventDefault())
						}),
						onInteractOutside: _(e.onInteractOutside, (i) => {
							let u = i.detail.originalEvent,
								d = u.button === 0 && u.ctrlKey === !0,
								c = u.button === 2 || d
							;(!r.modal || c) && (l.current = !0)
						}),
						style: {
							...e.style,
							'--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
							'--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
							'--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
							'--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
							'--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)'
						}
					})
				})))
			Cl.displayName = op
			;((nL = 'DropdownMenuGroup'),
				(bl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Vf, { ...r, ...o, ref: t })
				})))
			bl.displayName = nL
			;((sL = 'DropdownMenuLabel'),
				(Ll = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Gf, { ...r, ...o, ref: t })
				})))
			Ll.displayName = sL
			;((lL = 'DropdownMenuItem'),
				(Il = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Wf, { ...r, ...o, ref: t })
				})))
			Il.displayName = lL
			;((iL = 'DropdownMenuCheckboxItem'),
				(Sl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(jf, { ...r, ...o, ref: t })
				})))
			Sl.displayName = iL
			;((uL = 'DropdownMenuRadioGroup'),
				(wl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Xf, { ...r, ...o, ref: t })
				})))
			wl.displayName = uL
			;((dL = 'DropdownMenuRadioItem'),
				(yl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Kf, { ...r, ...o, ref: t })
				})))
			yl.displayName = dL
			;((cL = 'DropdownMenuItemIndicator'),
				(Rl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s($f, { ...r, ...o, ref: t })
				})))
			Rl.displayName = cL
			;((fL = 'DropdownMenuSeparator'),
				(Pl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Jf, { ...r, ...o, ref: t })
				})))
			Pl.displayName = fL
			;((pL = 'DropdownMenuArrow'),
				(kl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Yf, { ...r, ...o, ref: t })
				})))
			kl.displayName = pL
			;((rp = (e) => {
				let { __scopeDropdownMenu: t, children: a, open: o, onOpenChange: r, defaultOpen: n } = e,
					l = Fe(t),
					[i, u] = De({ prop: o, defaultProp: n ?? !1, onChange: r, caller: 'DropdownMenuSub' })
				return s(Zf, { ...l, open: i, onOpenChange: u, children: a })
			}),
				(mL = 'DropdownMenuSubTrigger'),
				(Tl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(Qf, { ...r, ...o, ref: t })
				})))
			Tl.displayName = mL
			;((gL = 'DropdownMenuSubContent'),
				(Al = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Fe(a)
					return s(ep, {
						...r,
						...o,
						ref: t,
						style: {
							...e.style,
							'--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
							'--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
							'--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
							'--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
							'--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)'
						}
					})
				})))
			Al.displayName = gL
			;((hL = hl),
				(xL = xl),
				(vL = vl),
				(CL = Cl),
				(bL = bl),
				(LL = Ll),
				(IL = Il),
				(SL = Sl),
				(wL = wl),
				(yL = yl),
				(RL = Rl),
				(PL = Pl),
				(kL = kl),
				(TL = rp),
				(AL = Tl),
				(ML = Al))
		})
	var Cn = {}
	Je(Cn, { Label: () => Ml, Root: () => EL })
	var DL,
		Ml,
		EL,
		sp = y(() => {
			'use client'
			Q()
			Me()
			B()
			;((DL = 'Label'),
				(Ml = S((e, t) =>
					s(j.label, {
						...e,
						ref: t,
						onMouseDown: (a) => {
							a.target.closest('button, input, select, textarea') ||
								(e.onMouseDown?.(a), !a.defaultPrevented && a.detail > 1 && a.preventDefault())
						}
					})
				)))
			Ml.displayName = DL
			EL = Ml
		})
	function jo(e, [t, a]) {
		return Math.min(a, Math.max(t, e))
	}
	var Dl = y(() => {})
	var Yt = {}
	Je(Yt, {
		Corner: () => YL,
		Root: () => XL,
		ScrollArea: () => Ol,
		ScrollAreaCorner: () => Hl,
		ScrollAreaScrollbar: () => Bl,
		ScrollAreaThumb: () => _l,
		ScrollAreaViewport: () => Fl,
		Scrollbar: () => $L,
		Thumb: () => JL,
		Viewport: () => KL,
		createScrollAreaScope: () => FL
	})
	function OL(e, t) {
		return _a((a, o) => t[a][o] ?? a, e)
	}
	function Ln(e) {
		return e ? parseInt(e, 10) : 0
	}
	function pp(e, t) {
		let a = e / t
		return isNaN(a) ? 0 : a
	}
	function In(e) {
		let t = pp(e.viewport, e.content),
			a = e.scrollbar.paddingStart + e.scrollbar.paddingEnd,
			o = (e.scrollbar.size - a) * t
		return Math.max(o, 18)
	}
	function WL(e, t, a, o = 'ltr') {
		let r = In(a),
			n = r / 2,
			l = t || n,
			i = r - l,
			u = a.scrollbar.paddingStart + l,
			d = a.scrollbar.size - a.scrollbar.paddingEnd - i,
			c = a.content - a.viewport,
			f = o === 'ltr' ? [0, c] : [c * -1, 0]
		return mp([u, d], f)(e)
	}
	function lp(e, t, a = 'ltr') {
		let o = In(t),
			r = t.scrollbar.paddingStart + t.scrollbar.paddingEnd,
			n = t.scrollbar.size - r,
			l = t.content - t.viewport,
			i = n - o,
			u = a === 'ltr' ? [0, l] : [l * -1, 0],
			d = jo(e, u)
		return mp([0, l], [0, i])(d)
	}
	function mp(e, t) {
		return (a) => {
			if (e[0] === e[1] || t[0] === t[1]) return t[0]
			let o = (t[1] - t[0]) / (e[1] - e[0])
			return t[0] + o * (a - e[0])
		}
	}
	function gp(e, t) {
		return e > 0 && e < t
	}
	function Sn(e, t) {
		let a = Ie(e),
			o = w(0)
		return (
			E(() => () => window.clearTimeout(o.current), []),
			G(() => {
				;(window.clearTimeout(o.current), (o.current = window.setTimeout(a, t)))
			}, [a, t])
		)
	}
	function so(e, t) {
		let a = Ie(t)
		Le(() => {
			let o = 0
			if (e) {
				let r = new ResizeObserver(() => {
					;(cancelAnimationFrame(o), (o = window.requestAnimationFrame(a)))
				})
				return (
					r.observe(e),
					() => {
						;(window.cancelAnimationFrame(o), r.unobserve(e))
					}
				)
			}
		}, [e, a])
	}
	var El,
		ip,
		FL,
		BL,
		ot,
		Ol,
		up,
		Fl,
		NL,
		xt,
		Bl,
		_L,
		zL,
		dp,
		Nl,
		HL,
		UL,
		qL,
		cp,
		fp,
		bn,
		_l,
		VL,
		zl,
		Hl,
		GL,
		jL,
		XL,
		KL,
		$L,
		JL,
		YL,
		hp = y(() => {
			'use client'
			Q()
			Me()
			jt()
			qe()
			Oe()
			At()
			Va()
			kt()
			Dl()
			Ke()
			Q()
			B()
			;((El = 'ScrollArea'),
				([ip, FL] = be(El)),
				([BL, ot] = ip(El)),
				(Ol = S((e, t) => {
					let { __scopeScrollArea: a, type: o = 'hover', dir: r, scrollHideDelay: n = 600, ...l } = e,
						[i, u] = T(null),
						[d, c] = T(null),
						[f, m] = T(null),
						[h, g] = T(null),
						[p, x] = T(null),
						[v, C] = T(0),
						[b, L] = T(0),
						[I, k] = T(!1),
						[P, R] = T(!1),
						O = te(t, (N) => u(N)),
						U = ft(r)
					return s(BL, {
						scope: a,
						type: o,
						dir: U,
						scrollHideDelay: n,
						scrollArea: i,
						viewport: d,
						onViewportChange: c,
						content: f,
						onContentChange: m,
						scrollbarX: h,
						onScrollbarXChange: g,
						scrollbarXEnabled: I,
						onScrollbarXEnabledChange: k,
						scrollbarY: p,
						onScrollbarYChange: x,
						scrollbarYEnabled: P,
						onScrollbarYEnabledChange: R,
						onCornerWidthChange: C,
						onCornerHeightChange: L,
						children: s(j.div, {
							dir: U,
							...l,
							ref: O,
							style: {
								position: 'relative',
								'--radix-scroll-area-corner-width': v + 'px',
								'--radix-scroll-area-corner-height': b + 'px',
								...e.style
							}
						})
					})
				})))
			Ol.displayName = El
			;((up = 'ScrollAreaViewport'),
				(Fl = S((e, t) => {
					let { __scopeScrollArea: a, children: o, nonce: r, ...n } = e,
						l = ot(up, a),
						i = w(null),
						u = te(t, i, l.onViewportChange)
					return D(Ze, {
						children: [
							s(NL, { nonce: r }),
							s(j.div, {
								'data-radix-scroll-area-viewport': '',
								...n,
								ref: u,
								style: {
									overflowX: l.scrollbarXEnabled ? 'scroll' : 'hidden',
									overflowY: l.scrollbarYEnabled ? 'scroll' : 'hidden',
									...e.style
								},
								children: s('div', {
									ref: l.onContentChange,
									style: { minWidth: '100%', display: 'table' },
									children: o
								})
							})
						]
					})
				})))
			Fl.displayName = up
			;((NL = Lo(
				({ nonce: e }) =>
					s('style', {
						dangerouslySetInnerHTML: {
							__html: '[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}'
						},
						nonce: e
					}),
				(e, t) => e.nonce === t.nonce
			)),
				(xt = 'ScrollAreaScrollbar'),
				(Bl = S((e, t) => {
					let { forceMount: a, ...o } = e,
						r = ot(xt, e.__scopeScrollArea),
						{ onScrollbarXEnabledChange: n, onScrollbarYEnabledChange: l } = r,
						i = e.orientation === 'horizontal'
					return (
						E(
							() => (
								i ? n(!0) : l(!0),
								() => {
									i ? n(!1) : l(!1)
								}
							),
							[i, n, l]
						),
						r.type === 'hover'
							? s(_L, { ...o, ref: t, forceMount: a })
							: r.type === 'scroll'
								? s(zL, { ...o, ref: t, forceMount: a })
								: r.type === 'auto'
									? s(dp, { ...o, ref: t, forceMount: a })
									: r.type === 'always'
										? s(Nl, { ...o, ref: t, 'data-state': 'visible' })
										: null
					)
				})))
			Bl.displayName = xt
			;((_L = S((e, t) => {
				let { forceMount: a, ...o } = e,
					r = ot(xt, e.__scopeScrollArea),
					[n, l] = T(!1)
				return (
					E(() => {
						let i = r.scrollArea,
							u = 0
						if (i) {
							let d = () => {
									;(window.clearTimeout(u), l(!0))
								},
								c = () => {
									u = window.setTimeout(() => l(!1), r.scrollHideDelay)
								}
							return (
								i.addEventListener('pointerenter', d),
								i.addEventListener('pointerleave', c),
								() => {
									;(window.clearTimeout(u),
										i.removeEventListener('pointerenter', d),
										i.removeEventListener('pointerleave', c))
								}
							)
						}
					}, [r.scrollArea, r.scrollHideDelay]),
					s(ye, {
						present: a || n,
						children: s(dp, { 'data-state': n ? 'visible' : 'hidden', ...o, ref: t })
					})
				)
			})),
				(zL = S((e, t) => {
					let { forceMount: a, ...o } = e,
						r = ot(xt, e.__scopeScrollArea),
						n = e.orientation === 'horizontal',
						l = Sn(() => u('SCROLL_END'), 100),
						[i, u] = OL('hidden', {
							hidden: { SCROLL: 'scrolling' },
							scrolling: { SCROLL_END: 'idle', POINTER_ENTER: 'interacting' },
							interacting: { SCROLL: 'interacting', POINTER_LEAVE: 'idle' },
							idle: { HIDE: 'hidden', SCROLL: 'scrolling', POINTER_ENTER: 'interacting' }
						})
					return (
						E(() => {
							if (i === 'idle') {
								let d = window.setTimeout(() => u('HIDE'), r.scrollHideDelay)
								return () => window.clearTimeout(d)
							}
						}, [i, r.scrollHideDelay, u]),
						E(() => {
							let d = r.viewport,
								c = n ? 'scrollLeft' : 'scrollTop'
							if (d) {
								let f = d[c],
									m = () => {
										let h = d[c]
										;(f !== h && (u('SCROLL'), l()), (f = h))
									}
								return (d.addEventListener('scroll', m), () => d.removeEventListener('scroll', m))
							}
						}, [r.viewport, n, u, l]),
						s(ye, {
							present: a || i !== 'hidden',
							children: s(Nl, {
								'data-state': i === 'hidden' ? 'hidden' : 'visible',
								...o,
								ref: t,
								onPointerEnter: _(e.onPointerEnter, () => u('POINTER_ENTER')),
								onPointerLeave: _(e.onPointerLeave, () => u('POINTER_LEAVE'))
							})
						})
					)
				})),
				(dp = S((e, t) => {
					let a = ot(xt, e.__scopeScrollArea),
						{ forceMount: o, ...r } = e,
						[n, l] = T(!1),
						i = e.orientation === 'horizontal',
						u = Sn(() => {
							if (a.viewport) {
								let d = a.viewport.offsetWidth < a.viewport.scrollWidth,
									c = a.viewport.offsetHeight < a.viewport.scrollHeight
								l(i ? d : c)
							}
						}, 10)
					return (
						so(a.viewport, u),
						so(a.content, u),
						s(ye, {
							present: o || n,
							children: s(Nl, { 'data-state': n ? 'visible' : 'hidden', ...r, ref: t })
						})
					)
				})),
				(Nl = S((e, t) => {
					let { orientation: a = 'vertical', ...o } = e,
						r = ot(xt, e.__scopeScrollArea),
						n = w(null),
						l = w(0),
						[i, u] = T({ content: 0, viewport: 0, scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 } }),
						d = pp(i.viewport, i.content),
						c = {
							...o,
							sizes: i,
							onSizesChange: u,
							hasThumb: d > 0 && d < 1,
							onThumbChange: (m) => (n.current = m),
							onThumbPointerUp: () => (l.current = 0),
							onThumbPointerDown: (m) => (l.current = m)
						}
					function f(m, h) {
						return WL(m, l.current, i, h)
					}
					return a === 'horizontal'
						? s(HL, {
								...c,
								ref: t,
								onThumbPositionChange: () => {
									if (r.viewport && n.current) {
										let m = r.viewport.scrollLeft,
											h = lp(m, i, r.dir)
										n.current.style.transform = `translate3d(${h}px, 0, 0)`
									}
								},
								onWheelScroll: (m) => {
									r.viewport && (r.viewport.scrollLeft = m)
								},
								onDragScroll: (m) => {
									r.viewport && (r.viewport.scrollLeft = f(m, r.dir))
								}
							})
						: a === 'vertical'
							? s(UL, {
									...c,
									ref: t,
									onThumbPositionChange: () => {
										if (r.viewport && n.current) {
											let m = r.viewport.scrollTop,
												h = lp(m, i)
											n.current.style.transform = `translate3d(0, ${h}px, 0)`
										}
									},
									onWheelScroll: (m) => {
										r.viewport && (r.viewport.scrollTop = m)
									},
									onDragScroll: (m) => {
										r.viewport && (r.viewport.scrollTop = f(m))
									}
								})
							: null
				})),
				(HL = S((e, t) => {
					let { sizes: a, onSizesChange: o, ...r } = e,
						n = ot(xt, e.__scopeScrollArea),
						[l, i] = T(),
						u = w(null),
						d = te(t, u, n.onScrollbarXChange)
					return (
						E(() => {
							u.current && i(getComputedStyle(u.current))
						}, [u]),
						s(fp, {
							'data-orientation': 'horizontal',
							...r,
							ref: d,
							sizes: a,
							style: {
								bottom: 0,
								left: n.dir === 'rtl' ? 'var(--radix-scroll-area-corner-width)' : 0,
								right: n.dir === 'ltr' ? 'var(--radix-scroll-area-corner-width)' : 0,
								'--radix-scroll-area-thumb-width': In(a) + 'px',
								...e.style
							},
							onThumbPointerDown: (c) => e.onThumbPointerDown(c.x),
							onDragScroll: (c) => e.onDragScroll(c.x),
							onWheelScroll: (c, f) => {
								if (n.viewport) {
									let m = n.viewport.scrollLeft + c.deltaX
									;(e.onWheelScroll(m), gp(m, f) && c.preventDefault())
								}
							},
							onResize: () => {
								u.current &&
									n.viewport &&
									l &&
									o({
										content: n.viewport.scrollWidth,
										viewport: n.viewport.offsetWidth,
										scrollbar: {
											size: u.current.clientWidth,
											paddingStart: Ln(l.paddingLeft),
											paddingEnd: Ln(l.paddingRight)
										}
									})
							}
						})
					)
				})),
				(UL = S((e, t) => {
					let { sizes: a, onSizesChange: o, ...r } = e,
						n = ot(xt, e.__scopeScrollArea),
						[l, i] = T(),
						u = w(null),
						d = te(t, u, n.onScrollbarYChange)
					return (
						E(() => {
							u.current && i(getComputedStyle(u.current))
						}, [u]),
						s(fp, {
							'data-orientation': 'vertical',
							...r,
							ref: d,
							sizes: a,
							style: {
								top: 0,
								right: n.dir === 'ltr' ? 0 : void 0,
								left: n.dir === 'rtl' ? 0 : void 0,
								bottom: 'var(--radix-scroll-area-corner-height)',
								'--radix-scroll-area-thumb-height': In(a) + 'px',
								...e.style
							},
							onThumbPointerDown: (c) => e.onThumbPointerDown(c.y),
							onDragScroll: (c) => e.onDragScroll(c.y),
							onWheelScroll: (c, f) => {
								if (n.viewport) {
									let m = n.viewport.scrollTop + c.deltaY
									;(e.onWheelScroll(m), gp(m, f) && c.preventDefault())
								}
							},
							onResize: () => {
								u.current &&
									n.viewport &&
									l &&
									o({
										content: n.viewport.scrollHeight,
										viewport: n.viewport.offsetHeight,
										scrollbar: {
											size: u.current.clientHeight,
											paddingStart: Ln(l.paddingTop),
											paddingEnd: Ln(l.paddingBottom)
										}
									})
							}
						})
					)
				})),
				([qL, cp] = ip(xt)),
				(fp = S((e, t) => {
					let {
							__scopeScrollArea: a,
							sizes: o,
							hasThumb: r,
							onThumbChange: n,
							onThumbPointerUp: l,
							onThumbPointerDown: i,
							onThumbPositionChange: u,
							onDragScroll: d,
							onWheelScroll: c,
							onResize: f,
							...m
						} = e,
						h = ot(xt, a),
						[g, p] = T(null),
						x = te(t, (O) => p(O)),
						v = w(null),
						C = w(''),
						b = h.viewport,
						L = o.content - o.viewport,
						I = Ie(c),
						k = Ie(u),
						P = Sn(f, 10)
					function R(O) {
						if (v.current) {
							let U = O.clientX - v.current.left,
								N = O.clientY - v.current.top
							d({ x: U, y: N })
						}
					}
					return (
						E(() => {
							let O = (U) => {
								let N = U.target
								g?.contains(N) && I(U, L)
							}
							return (
								document.addEventListener('wheel', O, { passive: !1 }),
								() => document.removeEventListener('wheel', O, { passive: !1 })
							)
						}, [b, g, L, I]),
						E(k, [o, k]),
						so(g, P),
						so(h.content, P),
						s(qL, {
							scope: a,
							scrollbar: g,
							hasThumb: r,
							onThumbChange: Ie(n),
							onThumbPointerUp: Ie(l),
							onThumbPositionChange: k,
							onThumbPointerDown: Ie(i),
							children: s(j.div, {
								...m,
								ref: x,
								style: { position: 'absolute', ...m.style },
								onPointerDown: _(e.onPointerDown, (O) => {
									O.button === 0 &&
										(O.target.setPointerCapture(O.pointerId),
										(v.current = g.getBoundingClientRect()),
										(C.current = document.body.style.webkitUserSelect),
										(document.body.style.webkitUserSelect = 'none'),
										h.viewport && (h.viewport.style.scrollBehavior = 'auto'),
										R(O))
								}),
								onPointerMove: _(e.onPointerMove, R),
								onPointerUp: _(e.onPointerUp, (O) => {
									let U = O.target
									;(U.hasPointerCapture(O.pointerId) && U.releasePointerCapture(O.pointerId),
										(document.body.style.webkitUserSelect = C.current),
										h.viewport && (h.viewport.style.scrollBehavior = ''),
										(v.current = null))
								})
							})
						})
					)
				})),
				(bn = 'ScrollAreaThumb'),
				(_l = S((e, t) => {
					let { forceMount: a, ...o } = e,
						r = cp(bn, e.__scopeScrollArea)
					return s(ye, { present: a || r.hasThumb, children: s(VL, { ref: t, ...o }) })
				})),
				(VL = S((e, t) => {
					let { __scopeScrollArea: a, style: o, ...r } = e,
						n = ot(bn, a),
						l = cp(bn, a),
						{ onThumbPositionChange: i } = l,
						u = te(t, (f) => l.onThumbChange(f)),
						d = w(void 0),
						c = Sn(() => {
							d.current && (d.current(), (d.current = void 0))
						}, 100)
					return (
						E(() => {
							let f = n.viewport
							if (f) {
								let m = () => {
									if ((c(), !d.current)) {
										let h = jL(f, i)
										;((d.current = h), i())
									}
								}
								return (i(), f.addEventListener('scroll', m), () => f.removeEventListener('scroll', m))
							}
						}, [n.viewport, c, i]),
						s(j.div, {
							'data-state': l.hasThumb ? 'visible' : 'hidden',
							...r,
							ref: u,
							style: {
								width: 'var(--radix-scroll-area-thumb-width)',
								height: 'var(--radix-scroll-area-thumb-height)',
								...o
							},
							onPointerDownCapture: _(e.onPointerDownCapture, (f) => {
								let h = f.target.getBoundingClientRect(),
									g = f.clientX - h.left,
									p = f.clientY - h.top
								l.onThumbPointerDown({ x: g, y: p })
							}),
							onPointerUp: _(e.onPointerUp, l.onThumbPointerUp)
						})
					)
				})))
			_l.displayName = bn
			;((zl = 'ScrollAreaCorner'),
				(Hl = S((e, t) => {
					let a = ot(zl, e.__scopeScrollArea),
						o = !!(a.scrollbarX && a.scrollbarY)
					return a.type !== 'scroll' && o ? s(GL, { ...e, ref: t }) : null
				})))
			Hl.displayName = zl
			GL = S((e, t) => {
				let { __scopeScrollArea: a, ...o } = e,
					r = ot(zl, a),
					[n, l] = T(0),
					[i, u] = T(0),
					d = !!(n && i)
				return (
					so(r.scrollbarX, () => {
						let c = r.scrollbarX?.offsetHeight || 0
						;(r.onCornerHeightChange(c), u(c))
					}),
					so(r.scrollbarY, () => {
						let c = r.scrollbarY?.offsetWidth || 0
						;(r.onCornerWidthChange(c), l(c))
					}),
					d
						? s(j.div, {
								...o,
								ref: t,
								style: {
									width: n,
									height: i,
									position: 'absolute',
									right: r.dir === 'ltr' ? 0 : void 0,
									left: r.dir === 'rtl' ? 0 : void 0,
									bottom: 0,
									...e.style
								}
							})
						: null
				)
			})
			jL = (e, t = () => {}) => {
				let a = { left: e.scrollLeft, top: e.scrollTop },
					o = 0
				return (
					(function r() {
						let n = { left: e.scrollLeft, top: e.scrollTop },
							l = a.left !== n.left,
							i = a.top !== n.top
						;((l || i) && t(), (a = n), (o = window.requestAnimationFrame(r)))
					})(),
					() => window.cancelAnimationFrame(o)
				)
			}
			;((XL = Ol), (KL = Fl), ($L = Bl), (JL = _l), (YL = Hl))
		})
	var He = {}
	Je(He, {
		Arrow: () => Wp,
		Content: () => yp,
		Group: () => Dp,
		Icon: () => Ip,
		Item: () => Bp,
		ItemIndicator: () => zp,
		ItemText: () => Np,
		Label: () => Op,
		Portal: () => wp,
		Root: () => xp,
		ScrollDownButton: () => Up,
		ScrollUpButton: () => Hp,
		Select: () => xp,
		SelectArrow: () => Wp,
		SelectContent: () => yp,
		SelectGroup: () => Dp,
		SelectIcon: () => Ip,
		SelectItem: () => Bp,
		SelectItemIndicator: () => zp,
		SelectItemText: () => Np,
		SelectLabel: () => Op,
		SelectPortal: () => wp,
		SelectScrollDownButton: () => Up,
		SelectScrollUpButton: () => Hp,
		SelectSeparator: () => Vp,
		SelectTrigger: () => Cp,
		SelectValue: () => Lp,
		SelectViewport: () => Ap,
		Separator: () => Vp,
		Trigger: () => Cp,
		Value: () => Lp,
		Viewport: () => Ap,
		createSelectScope: () => tI,
		unstable_BubbleInput: () => Xl,
		unstable_Provider: () => Wl,
		unstable_SelectBubbleInput: () => Xl,
		unstable_SelectProvider: () => Wl
	})
	function Wl(e) {
		let {
				__scopeSelect: t,
				children: a,
				open: o,
				defaultOpen: r,
				onOpenChange: n,
				value: l,
				defaultValue: i,
				onValueChange: u,
				dir: d,
				name: c,
				autoComplete: f,
				disabled: m,
				required: h,
				form: g,
				internal_do_not_use_render: p
			} = e,
			x = Pn(t),
			[v, C] = T(null),
			[b, L] = T(null),
			[I, k] = T(!1),
			P = ft(d),
			[R, O] = De({ prop: o, defaultProp: r ?? !1, onChange: n, caller: Ia }),
			[U, N] = De({ prop: l, defaultProp: i, onChange: u, caller: Ia }),
			V = w(null),
			K = v ? !!g || !!v.closest('form') : !0,
			[W, ee] = T(new Set()),
			X = Te(),
			oe = Array.from(W)
				.map((ue) => ue.props.value)
				.join(';'),
			M = G((ue) => {
				ee((Se) => new Set(Se).add(ue))
			}, []),
			z = G((ue) => {
				ee((Se) => {
					let ie = new Set(Se)
					return (ie.delete(ue), ie)
				})
			}, []),
			re = {
				required: h,
				trigger: v,
				onTriggerChange: C,
				valueNode: b,
				onValueNodeChange: L,
				valueNodeHasChildren: I,
				onValueNodeHasChildrenChange: k,
				contentId: X,
				value: U,
				onValueChange: N,
				open: R,
				onOpenChange: O,
				dir: P,
				triggerPointerDownPosRef: V,
				disabled: m,
				name: c,
				autoComplete: f,
				form: g,
				nativeOptions: W,
				nativeSelectKey: oe,
				isFormControl: K
			}
		return s(Ca, {
			...x,
			children: s(aI, {
				scope: t,
				...re,
				children: s(yn.Provider, {
					scope: t,
					children: s(oI, {
						scope: t,
						onNativeOptionAdd: M,
						onNativeOptionRemove: z,
						children: vI(p) ? p(re) : a
					})
				})
			})
		})
	}
	function vI(e) {
		return typeof e == 'function'
	}
	function kn(e) {
		return e === '' || e === void 0
	}
	function Xp(e) {
		let t = Ie(e),
			a = w(''),
			o = w(0),
			r = G(
				(l) => {
					let i = a.current + l
					;(t(i),
						(function u(d) {
							;((a.current = d),
								window.clearTimeout(o.current),
								d !== '' && (o.current = window.setTimeout(() => u(''), 1e3)))
						})(i))
				},
				[t]
			),
			n = G(() => {
				;((a.current = ''), window.clearTimeout(o.current))
			}, [])
		return (E(() => () => window.clearTimeout(o.current), []), [a, r, n])
	}
	function Kp(e, t, a) {
		let r = t.length > 1 && Array.from(t).every((d) => d === t[0]) ? t[0] : t,
			n = a ? e.indexOf(a) : -1,
			l = CI(e, Math.max(n, 0))
		r.length === 1 && (l = l.filter((d) => d !== a))
		let u = l.find((d) => d.textValue.toLowerCase().startsWith(r.toLowerCase()))
		return u !== a ? u : void 0
	}
	function CI(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	var ZL,
		QL,
		Ia,
		yn,
		Rn,
		eI,
		Sa,
		tI,
		Pn,
		aI,
		Qt,
		oI,
		rI,
		nI,
		xp,
		vp,
		Cp,
		bp,
		Lp,
		sI,
		Ip,
		Sp,
		lI,
		iI,
		wp,
		Zt,
		yp,
		Rp,
		dt,
		Pp,
		ea,
		uI,
		dI,
		kp,
		cI,
		Tp,
		fI,
		Ul,
		pI,
		jl,
		ql,
		Ap,
		Mp,
		mI,
		gI,
		Dp,
		Ep,
		Op,
		wn,
		hI,
		Fp,
		Bp,
		Xo,
		Np,
		_p,
		zp,
		Vl,
		Hp,
		Gl,
		Up,
		qp,
		xI,
		Vp,
		Gp,
		Wp,
		jp,
		Xl,
		$p = y(() => {
			'use client'
			Q()
			Ha()
			Dl()
			Ke()
			yr()
			Oe()
			qe()
			Va()
			Ro()
			Tr()
			Pr()
			Xt()
			ba()
			ba()
			Po()
			jt()
			Me()
			Wt()
			At()
			Tt()
			kt()
			Jr()
			ns()
			_r()
			Fr()
			B()
			;((ZL = [' ', 'Enter', 'ArrowUp', 'ArrowDown']),
				(QL = [' ', 'Enter']),
				(Ia = 'Select'),
				([yn, Rn, eI] = qa(Ia)),
				([Sa, tI] = be(Ia, [eI, Ft])),
				(Pn = Ft()),
				([aI, Qt] = Sa(Ia)),
				([oI, rI] = Sa(Ia)),
				(nI = 'SelectProvider'))
			Wl.displayName = nI
			xp = (e) => {
				let { __scopeSelect: t, children: a, ...o } = e
				return s(Wl, {
					__scopeSelect: t,
					...o,
					internal_do_not_use_render: ({ isFormControl: r }) =>
						D(Ze, { children: [a, r ? s(Xl, { __scopeSelect: t }) : null] })
				})
			}
			xp.displayName = Ia
			;((vp = 'SelectTrigger'),
				(Cp = S((e, t) => {
					let { __scopeSelect: a, disabled: o = !1, ...r } = e,
						n = Pn(a),
						l = Qt(vp, a),
						i = l.disabled || o,
						u = te(t, l.onTriggerChange),
						d = Rn(a),
						c = w('touch'),
						[f, m, h] = Xp((p) => {
							let x = d().filter((b) => !b.disabled),
								v = x.find((b) => b.value === l.value),
								C = Kp(x, p, v)
							C !== void 0 && l.onValueChange(C.value)
						}),
						g = (p) => {
							;(i || (l.onOpenChange(!0), h()),
								p &&
									(l.triggerPointerDownPosRef.current = {
										x: Math.round(p.pageX),
										y: Math.round(p.pageY)
									}))
						}
					return s(ao, {
						asChild: !0,
						...n,
						children: s(j.button, {
							type: 'button',
							role: 'combobox',
							'aria-controls': l.open ? l.contentId : void 0,
							'aria-expanded': l.open,
							'aria-required': l.required,
							'aria-autocomplete': 'none',
							dir: l.dir,
							'data-state': l.open ? 'open' : 'closed',
							disabled: i,
							'data-disabled': i ? '' : void 0,
							'data-placeholder': kn(l.value) ? '' : void 0,
							...r,
							ref: u,
							onClick: _(r.onClick, (p) => {
								;(p.currentTarget.focus(), c.current !== 'mouse' && g(p))
							}),
							onPointerDown: _(r.onPointerDown, (p) => {
								c.current = p.pointerType
								let x = p.target
								;(x.hasPointerCapture(p.pointerId) && x.releasePointerCapture(p.pointerId),
									p.button === 0 &&
										p.ctrlKey === !1 &&
										p.pointerType === 'mouse' &&
										(g(p), p.preventDefault()))
							}),
							onKeyDown: _(r.onKeyDown, (p) => {
								let x = f.current !== ''
								;(!(p.ctrlKey || p.altKey || p.metaKey) && p.key.length === 1 && m(p.key),
									!(x && p.key === ' ') && ZL.includes(p.key) && (g(), p.preventDefault()))
							})
						})
					})
				})))
			Cp.displayName = vp
			;((bp = 'SelectValue'),
				(Lp = S((e, t) => {
					let { __scopeSelect: a, className: o, style: r, children: n, placeholder: l = '', ...i } = e,
						u = Qt(bp, a),
						{ onValueNodeHasChildrenChange: d } = u,
						c = n !== void 0,
						f = te(t, u.onValueNodeChange)
					Le(() => {
						d(c)
					}, [d, c])
					let m = kn(u.value)
					return s(j.span, {
						...i,
						asChild: m ? !1 : i.asChild,
						ref: f,
						style: { pointerEvents: 'none' },
						children: s(Ye, { children: m ? l : n }, m ? 'placeholder' : 'value')
					})
				})))
			Lp.displayName = bp
			;((sI = 'SelectIcon'),
				(Ip = S((e, t) => {
					let { __scopeSelect: a, children: o, ...r } = e
					return s(j.span, { 'aria-hidden': !0, ...r, ref: t, children: o || '\u25BC' })
				})))
			Ip.displayName = sI
			;((Sp = 'SelectPortal'),
				([lI, iI] = Sa(Sp, { forceMount: void 0 })),
				(wp = (e) => {
					let { __scopeSelect: t, forceMount: a, ...o } = e
					return s(lI, { scope: e.__scopeSelect, forceMount: a, children: s(Dt, { asChild: !0, ...o }) })
				}))
			wp.displayName = Sp
			;((Zt = 'SelectContent'),
				(yp = S((e, t) => {
					let a = iI(Zt, e.__scopeSelect),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = Qt(Zt, e.__scopeSelect),
						[l, i] = T()
					return (
						Le(() => {
							i(new DocumentFragment())
						}, []),
						s(ye, {
							present: o || n.open,
							children: ({ present: u }) => (u ? s(kp, { ...r, ref: t }) : s(Rp, { ...r, fragment: l }))
						})
					)
				})))
			yp.displayName = Zt
			Rp = S((e, t) => {
				let { __scopeSelect: a, children: o, fragment: r } = e
				return r
					? wo(
							s(Pp, {
								scope: a,
								children: s(yn.Slot, { scope: a, children: s('div', { ref: t, children: o }) })
							}),
							r
						)
					: null
			})
			Rp.displayName = 'SelectContentFragment'
			;((dt = 10),
				([Pp, ea] = Sa(Zt)),
				(uI = 'SelectContentImpl'),
				(dI = Xe('SelectContent.RemoveScroll')),
				(kp = S((e, t) => {
					let { __scopeSelect: a } = e,
						{
							position: o = 'item-aligned',
							onCloseAutoFocus: r,
							onEscapeKeyDown: n,
							onPointerDownOutside: l,
							side: i,
							sideOffset: u,
							align: d,
							alignOffset: c,
							arrowPadding: f,
							collisionBoundary: m,
							collisionPadding: h,
							sticky: g,
							hideWhenDetached: p,
							avoidCollisions: x,
							...v
						} = e,
						C = Qt(Zt, a),
						[b, L] = T(null),
						[I, k] = T(null),
						P = te(t, (H) => L(H)),
						[R, O] = T(null),
						[U, N] = T(null),
						V = Rn(a),
						[K, W] = T(!1),
						ee = w(!1)
					;(E(() => {
						if (b) return Ja(b)
					}, [b]),
						Wa())
					let X = G(
							(H) => {
								let [se, ...Ce] = V().map((xe) => xe.ref.current),
									[ne] = Ce.slice(-1),
									ge = document.activeElement
								for (let xe of H)
									if (
										xe === ge ||
										(xe?.scrollIntoView({ block: 'nearest' }),
										xe === se && I && (I.scrollTop = 0),
										xe === ne && I && (I.scrollTop = I.scrollHeight),
										xe?.focus(),
										document.activeElement !== ge)
									)
										return
							},
							[V, I]
						),
						oe = G(() => X([R, b]), [X, R, b])
					E(() => {
						K && oe()
					}, [K, oe])
					let { onOpenChange: M, triggerPointerDownPosRef: z } = C
					;(E(() => {
						if (b) {
							let H = { x: 0, y: 0 },
								se = (ne) => {
									H = {
										x: Math.abs(Math.round(ne.pageX) - (z.current?.x ?? 0)),
										y: Math.abs(Math.round(ne.pageY) - (z.current?.y ?? 0))
									}
								},
								Ce = (ne) => {
									;(H.x <= 10 && H.y <= 10
										? ne.preventDefault()
										: ne.composedPath().includes(b) || M(!1),
										document.removeEventListener('pointermove', se),
										(z.current = null))
								}
							return (
								z.current !== null &&
									(document.addEventListener('pointermove', se),
									document.addEventListener('pointerup', Ce, { capture: !0, once: !0 })),
								() => {
									;(document.removeEventListener('pointermove', se),
										document.removeEventListener('pointerup', Ce, { capture: !0 }))
								}
							)
						}
					}, [b, M, z]),
						E(() => {
							let H = () => M(!1)
							return (
								window.addEventListener('blur', H),
								window.addEventListener('resize', H),
								() => {
									;(window.removeEventListener('blur', H), window.removeEventListener('resize', H))
								}
							)
						}, [M]))
					let [re, ue] = Xp((H) => {
							let se = V().filter((ge) => !ge.disabled),
								Ce = se.find((ge) => ge.ref.current === document.activeElement),
								ne = Kp(se, H, Ce)
							ne && setTimeout(() => ne.ref.current?.focus())
						}),
						Se = G(
							(H, se, Ce) => {
								let ne = !ee.current && !Ce
								;((C.value !== void 0 && C.value === se) || ne) && (O(H), ne && (ee.current = !0))
							},
							[C.value]
						),
						ie = G(() => b?.focus(), [b]),
						ce = G(
							(H, se, Ce) => {
								let ne = !ee.current && !Ce
								;((C.value !== void 0 && C.value === se) || ne) && N(H)
							},
							[C.value]
						),
						ke = o === 'popper' ? Ul : Tp,
						fe =
							ke === Ul
								? {
										side: i,
										sideOffset: u,
										align: d,
										alignOffset: c,
										arrowPadding: f,
										collisionBoundary: m,
										collisionPadding: h,
										sticky: g,
										hideWhenDetached: p,
										avoidCollisions: x
									}
								: {}
					return s(Pp, {
						scope: a,
						content: b,
						viewport: I,
						onViewportChange: k,
						itemRefCallback: Se,
						selectedItem: R,
						onItemLeave: ie,
						itemTextRefCallback: ce,
						focusSelectedItem: oe,
						selectedItemText: U,
						position: o,
						isPositioned: K,
						searchRef: re,
						children: s(ca, {
							as: dI,
							allowPinchZoom: !0,
							children: s(la, {
								asChild: !0,
								trapped: C.open,
								onMountAutoFocus: (H) => {
									H.preventDefault()
								},
								onUnmountAutoFocus: _(r, (H) => {
									;(C.trigger?.focus({ preventScroll: !0 }), H.preventDefault())
								}),
								children: s(Mt, {
									asChild: !0,
									disableOutsidePointerEvents: !0,
									onEscapeKeyDown: n,
									onPointerDownOutside: l,
									onFocusOutside: (H) => H.preventDefault(),
									onDismiss: () => C.onOpenChange(!1),
									children: s(ke, {
										role: 'listbox',
										id: C.contentId,
										'data-state': C.open ? 'open' : 'closed',
										dir: C.dir,
										onContextMenu: (H) => H.preventDefault(),
										...v,
										...fe,
										onPlaced: () => W(!0),
										ref: P,
										style: {
											display: 'flex',
											flexDirection: 'column',
											outline: 'none',
											...v.style
										},
										onKeyDown: _(v.onKeyDown, (H) => {
											let se = H.ctrlKey || H.altKey || H.metaKey
											if (
												(H.key === 'Tab' && H.preventDefault(),
												!se && H.key.length === 1 && ue(H.key),
												['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(H.key))
											) {
												let ne = V()
													.filter((ge) => !ge.disabled)
													.map((ge) => ge.ref.current)
												if (
													(['ArrowUp', 'End'].includes(H.key) && (ne = ne.slice().reverse()),
													['ArrowUp', 'ArrowDown'].includes(H.key))
												) {
													let ge = H.target,
														xe = ne.indexOf(ge)
													ne = ne.slice(xe + 1)
												}
												;(setTimeout(() => X(ne)), H.preventDefault())
											}
										})
									})
								})
							})
						})
					})
				})))
			kp.displayName = uI
			;((cI = 'SelectItemAlignedPosition'),
				(Tp = S((e, t) => {
					let { __scopeSelect: a, onPlaced: o, ...r } = e,
						n = Qt(Zt, a),
						l = ea(Zt, a),
						[i, u] = T(null),
						[d, c] = T(null),
						f = te(t, (P) => c(P)),
						m = Rn(a),
						h = w(!1),
						g = w(!0),
						{ viewport: p, selectedItem: x, selectedItemText: v, focusSelectedItem: C } = l,
						b = G(() => {
							if (n.trigger && n.valueNode && i && d && p && x && v) {
								let P = n.trigger.getBoundingClientRect(),
									R = d.getBoundingClientRect(),
									O = n.valueNode.getBoundingClientRect(),
									U = v.getBoundingClientRect()
								if (n.dir !== 'rtl') {
									let ge = U.left - R.left,
										xe = O.left - ge,
										$e = P.left - xe,
										Ne = P.width + $e,
										Ea = Math.max(Ne, R.width),
										xo = window.innerWidth - dt,
										vo = jo(xe, [dt, Math.max(dt, xo - Ea)])
									;((i.style.minWidth = Ne + 'px'), (i.style.left = vo + 'px'))
								} else {
									let ge = R.right - U.right,
										xe = window.innerWidth - O.right - ge,
										$e = window.innerWidth - P.right - xe,
										Ne = P.width + $e,
										Ea = Math.max(Ne, R.width),
										xo = window.innerWidth - dt,
										vo = jo(xe, [dt, Math.max(dt, xo - Ea)])
									;((i.style.minWidth = Ne + 'px'), (i.style.right = vo + 'px'))
								}
								let N = m(),
									V = window.innerHeight - dt * 2,
									K = p.scrollHeight,
									W = window.getComputedStyle(d),
									ee = parseInt(W.borderTopWidth, 10),
									X = parseInt(W.paddingTop, 10),
									oe = parseInt(W.borderBottomWidth, 10),
									M = parseInt(W.paddingBottom, 10),
									z = ee + X + K + M + oe,
									re = Math.min(x.offsetHeight * 5, z),
									ue = window.getComputedStyle(p),
									Se = parseInt(ue.paddingTop, 10),
									ie = parseInt(ue.paddingBottom, 10),
									ce = P.top + P.height / 2 - dt,
									ke = V - ce,
									fe = x.offsetHeight / 2,
									H = x.offsetTop + fe,
									se = ee + X + H,
									Ce = z - se
								if (se <= ce) {
									let ge = N.length > 0 && x === N[N.length - 1].ref.current
									i.style.bottom = '0px'
									let xe = d.clientHeight - p.offsetTop - p.offsetHeight,
										$e = Math.max(ke, fe + (ge ? ie : 0) + xe + oe),
										Ne = se + $e
									i.style.height = Ne + 'px'
								} else {
									let ge = N.length > 0 && x === N[0].ref.current
									i.style.top = '0px'
									let $e = Math.max(ce, ee + p.offsetTop + (ge ? Se : 0) + fe) + Ce
									;((i.style.height = $e + 'px'), (p.scrollTop = se - ce + p.offsetTop))
								}
								;((i.style.margin = `${dt}px 0`),
									(i.style.minHeight = re + 'px'),
									(i.style.maxHeight = V + 'px'),
									o?.(),
									requestAnimationFrame(() => (h.current = !0)))
							}
						}, [m, n.trigger, n.valueNode, i, d, p, x, v, n.dir, o])
					Le(() => b(), [b])
					let [L, I] = T()
					Le(() => {
						d && I(window.getComputedStyle(d).zIndex)
					}, [d])
					let k = G(
						(P) => {
							P && g.current === !0 && (b(), C?.(), (g.current = !1))
						},
						[b, C]
					)
					return s(pI, {
						scope: a,
						contentWrapper: i,
						shouldExpandOnScrollRef: h,
						onScrollButtonChange: k,
						children: s('div', {
							ref: u,
							style: { display: 'flex', flexDirection: 'column', position: 'fixed', zIndex: L },
							children: s(j.div, {
								...r,
								ref: f,
								style: { boxSizing: 'border-box', maxHeight: '100%', ...r.style }
							})
						})
					})
				})))
			Tp.displayName = cI
			;((fI = 'SelectPopperPosition'),
				(Ul = S((e, t) => {
					let { __scopeSelect: a, align: o = 'start', collisionPadding: r = dt, ...n } = e,
						l = Pn(a)
					return s(oo, {
						...l,
						...n,
						ref: t,
						align: o,
						collisionPadding: r,
						style: {
							boxSizing: 'border-box',
							...n.style,
							'--radix-select-content-transform-origin': 'var(--radix-popper-transform-origin)',
							'--radix-select-content-available-width': 'var(--radix-popper-available-width)',
							'--radix-select-content-available-height': 'var(--radix-popper-available-height)',
							'--radix-select-trigger-width': 'var(--radix-popper-anchor-width)',
							'--radix-select-trigger-height': 'var(--radix-popper-anchor-height)'
						}
					})
				})))
			Ul.displayName = fI
			;(([pI, jl] = Sa(Zt, {})),
				(ql = 'SelectViewport'),
				(Ap = S((e, t) => {
					let { __scopeSelect: a, nonce: o, ...r } = e,
						n = ea(ql, a),
						l = jl(ql, a),
						i = te(t, n.onViewportChange),
						u = w(0)
					return D(Ze, {
						children: [
							s('style', {
								dangerouslySetInnerHTML: {
									__html: '[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}'
								},
								nonce: o
							}),
							s(yn.Slot, {
								scope: a,
								children: s(j.div, {
									'data-radix-select-viewport': '',
									role: 'presentation',
									...r,
									ref: i,
									style: { position: 'relative', flex: 1, overflow: 'hidden auto', ...r.style },
									onScroll: _(r.onScroll, (d) => {
										let c = d.currentTarget,
											{ contentWrapper: f, shouldExpandOnScrollRef: m } = l
										if (m?.current && f) {
											let h = Math.abs(u.current - c.scrollTop)
											if (h > 0) {
												let g = window.innerHeight - dt * 2,
													p = parseFloat(f.style.minHeight),
													x = parseFloat(f.style.height),
													v = Math.max(p, x)
												if (v < g) {
													let C = v + h,
														b = Math.min(g, C),
														L = C - b
													;((f.style.height = b + 'px'),
														f.style.bottom === '0px' &&
															((c.scrollTop = L > 0 ? L : 0),
															(f.style.justifyContent = 'flex-end')))
												}
											}
										}
										u.current = c.scrollTop
									})
								})
							})
						]
					})
				})))
			Ap.displayName = ql
			;((Mp = 'SelectGroup'),
				([mI, gI] = Sa(Mp)),
				(Dp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = Te()
					return s(mI, {
						scope: a,
						id: r,
						children: s(j.div, { role: 'group', 'aria-labelledby': r, ...o, ref: t })
					})
				})))
			Dp.displayName = Mp
			;((Ep = 'SelectLabel'),
				(Op = S((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = gI(Ep, a)
					return s(j.div, { id: r.id, ...o, ref: t })
				})))
			Op.displayName = Ep
			;((wn = 'SelectItem'),
				([hI, Fp] = Sa(wn)),
				(Bp = S((e, t) => {
					let { __scopeSelect: a, value: o, disabled: r = !1, textValue: n, ...l } = e,
						i = Qt(wn, a),
						u = ea(wn, a),
						d = i.value === o,
						[c, f] = T(n ?? ''),
						[m, h] = T(!1),
						g = te(t, (C) => u.itemRefCallback?.(C, o, r)),
						p = Te(),
						x = w('touch'),
						v = () => {
							r || (i.onValueChange(o), i.onOpenChange(!1))
						}
					return s(hI, {
						scope: a,
						value: o,
						disabled: r,
						textId: p,
						isSelected: d,
						onItemTextChange: G((C) => {
							f((b) => b || (C?.textContent ?? '').trim())
						}, []),
						children: s(yn.ItemSlot, {
							scope: a,
							value: o,
							disabled: r,
							textValue: c,
							children: s(j.div, {
								role: 'option',
								'aria-labelledby': p,
								'data-highlighted': m ? '' : void 0,
								'aria-selected': d && m,
								'data-state': d ? 'checked' : 'unchecked',
								'aria-disabled': r || void 0,
								'data-disabled': r ? '' : void 0,
								tabIndex: r ? void 0 : -1,
								...l,
								ref: g,
								onFocus: _(l.onFocus, () => h(!0)),
								onBlur: _(l.onBlur, () => h(!1)),
								onClick: _(l.onClick, () => {
									x.current !== 'mouse' && v()
								}),
								onPointerUp: _(l.onPointerUp, () => {
									x.current === 'mouse' && v()
								}),
								onPointerDown: _(l.onPointerDown, (C) => {
									x.current = C.pointerType
								}),
								onPointerMove: _(l.onPointerMove, (C) => {
									;((x.current = C.pointerType),
										r
											? u.onItemLeave?.()
											: x.current === 'mouse' && C.currentTarget.focus({ preventScroll: !0 }))
								}),
								onPointerLeave: _(l.onPointerLeave, (C) => {
									C.currentTarget === document.activeElement && u.onItemLeave?.()
								}),
								onKeyDown: _(l.onKeyDown, (C) => {
									;(u.searchRef?.current !== '' && C.key === ' ') ||
										(QL.includes(C.key) && v(), C.key === ' ' && C.preventDefault())
								})
							})
						})
					})
				})))
			Bp.displayName = wn
			;((Xo = 'SelectItemText'),
				(Np = S((e, t) => {
					let { __scopeSelect: a, className: o, style: r, ...n } = e,
						l = Qt(Xo, a),
						i = ea(Xo, a),
						u = Fp(Xo, a),
						d = rI(Xo, a),
						[c, f] = T(null),
						m = te(
							t,
							(v) => f(v),
							u.onItemTextChange,
							(v) => i.itemTextRefCallback?.(v, u.value, u.disabled)
						),
						h = c?.textContent,
						g = we(
							() => s('option', { value: u.value, disabled: u.disabled, children: h }, u.value),
							[u.disabled, u.value, h]
						),
						{ onNativeOptionAdd: p, onNativeOptionRemove: x } = d
					return (
						Le(() => (p(g), () => x(g)), [p, x, g]),
						D(Ze, {
							children: [
								s(j.span, { id: u.textId, ...n, ref: m }),
								u.isSelected && l.valueNode && !l.valueNodeHasChildren && !kn(l.value)
									? wo(n.children, l.valueNode)
									: null
							]
						})
					)
				})))
			Np.displayName = Xo
			;((_p = 'SelectItemIndicator'),
				(zp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e
					return Fp(_p, a).isSelected ? s(j.span, { 'aria-hidden': !0, ...o, ref: t }) : null
				})))
			zp.displayName = _p
			;((Vl = 'SelectScrollUpButton'),
				(Hp = S((e, t) => {
					let a = ea(Vl, e.__scopeSelect),
						o = jl(Vl, e.__scopeSelect),
						[r, n] = T(!1),
						l = te(t, o.onScrollButtonChange)
					return (
						Le(() => {
							if (a.viewport && a.isPositioned) {
								let u = function () {
									let c = d.scrollTop > 0
									n(c)
								}
								var i = u
								let d = a.viewport
								return (u(), d.addEventListener('scroll', u), () => d.removeEventListener('scroll', u))
							}
						}, [a.viewport, a.isPositioned]),
						r
							? s(qp, {
									...e,
									ref: l,
									onAutoScroll: () => {
										let { viewport: i, selectedItem: u } = a
										i && u && (i.scrollTop = i.scrollTop - u.offsetHeight)
									}
								})
							: null
					)
				})))
			Hp.displayName = Vl
			;((Gl = 'SelectScrollDownButton'),
				(Up = S((e, t) => {
					let a = ea(Gl, e.__scopeSelect),
						o = jl(Gl, e.__scopeSelect),
						[r, n] = T(!1),
						l = te(t, o.onScrollButtonChange)
					return (
						Le(() => {
							if (a.viewport && a.isPositioned) {
								let u = function () {
									let c = d.scrollHeight - d.clientHeight,
										f = Math.ceil(d.scrollTop) < c
									n(f)
								}
								var i = u
								let d = a.viewport
								return (u(), d.addEventListener('scroll', u), () => d.removeEventListener('scroll', u))
							}
						}, [a.viewport, a.isPositioned]),
						r
							? s(qp, {
									...e,
									ref: l,
									onAutoScroll: () => {
										let { viewport: i, selectedItem: u } = a
										i && u && (i.scrollTop = i.scrollTop + u.offsetHeight)
									}
								})
							: null
					)
				})))
			Up.displayName = Gl
			;((qp = S((e, t) => {
				let { __scopeSelect: a, onAutoScroll: o, ...r } = e,
					n = ea('SelectScrollButton', a),
					l = w(null),
					i = Rn(a),
					u = G(() => {
						l.current !== null && (window.clearInterval(l.current), (l.current = null))
					}, [])
				return (
					E(() => () => u(), [u]),
					Le(() => {
						i()
							.find((c) => c.ref.current === document.activeElement)
							?.ref.current?.scrollIntoView({ block: 'nearest' })
					}, [i]),
					s(j.div, {
						'aria-hidden': !0,
						...r,
						ref: t,
						style: { flexShrink: 0, ...r.style },
						onPointerDown: _(r.onPointerDown, () => {
							l.current === null && (l.current = window.setInterval(o, 50))
						}),
						onPointerMove: _(r.onPointerMove, () => {
							;(n.onItemLeave?.(), l.current === null && (l.current = window.setInterval(o, 50)))
						}),
						onPointerLeave: _(r.onPointerLeave, () => {
							u()
						})
					})
				)
			})),
				(xI = 'SelectSeparator'),
				(Vp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e
					return s(j.div, { 'aria-hidden': !0, ...o, ref: t })
				})))
			Vp.displayName = xI
			;((Gp = 'SelectArrow'),
				(Wp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = Pn(a)
					return ea(Gp, a).position === 'popper' ? s(ro, { ...r, ...o, ref: t }) : null
				})))
			Wp.displayName = Gp
			;((jp = 'SelectBubbleInput'),
				(Xl = S(({ __scopeSelect: e, ...t }, a) => {
					let o = Qt(jp, e),
						{ value: r, onValueChange: n, required: l, disabled: i, name: u, autoComplete: d, form: c } = o,
						{ nativeOptions: f, nativeSelectKey: m } = o,
						h = w(null),
						g = te(a, h),
						p = r ?? '',
						x = Za(p),
						v = Array.from(f).some((C) => (C.props.value ?? '') === '')
					return (
						E(() => {
							let C = h.current
							if (!C) return
							let b = window.HTMLSelectElement.prototype,
								I = Object.getOwnPropertyDescriptor(b, 'value').set
							if (x !== p && I) {
								let k = new Event('change', { bubbles: !0 })
								;(I.call(C, p), C.dispatchEvent(k))
							}
						}, [x, p]),
						D(
							j.select,
							{
								'aria-hidden': !0,
								required: l,
								tabIndex: -1,
								name: u,
								autoComplete: d,
								disabled: i,
								form: c,
								onChange: (C) => n(C.target.value),
								...t,
								style: { ...rs, ...t.style },
								ref: g,
								defaultValue: p,
								children: [kn(r) && !v ? s('option', { value: '' }) : null, Array.from(f)]
							},
							m
						)
					)
				})))
			Xl.displayName = jp
		})
	var Ko = {}
	Je(Ko, {
		Root: () => Zp,
		Switch: () => Zp,
		SwitchThumb: () => em,
		Thumb: () => em,
		createSwitchScope: () => LI,
		unstable_BubbleInput: () => Jl,
		unstable_Provider: () => Jp,
		unstable_SwitchBubbleInput: () => Jl,
		unstable_SwitchProvider: () => Jp,
		unstable_SwitchTrigger: () => $l,
		unstable_Trigger: () => $l
	})
	function Jp(e) {
		let {
				__scopeSwitch: t,
				checked: a,
				children: o,
				defaultChecked: r,
				disabled: n,
				form: l,
				name: i,
				onCheckedChange: u,
				required: d,
				value: c = 'on',
				internal_do_not_use_render: f
			} = e,
			[m, h] = De({ prop: a, defaultProp: r ?? !1, onChange: u, caller: Tn }),
			[g, p] = T(null),
			[x, v] = T(null),
			C = w(!1),
			b = g ? !!l || !!g.closest('form') : !0,
			L = {
				checked: m,
				setChecked: h,
				disabled: n,
				control: g,
				setControl: p,
				name: i,
				form: l,
				value: c,
				hasConsumerStoppedPropagationRef: C,
				required: d,
				defaultChecked: r,
				isFormControl: b,
				bubbleInput: x,
				setBubbleInput: v
			}
		return s(II, { scope: t, ...L, children: SI(f) ? f(L) : o })
	}
	function SI(e) {
		return typeof e == 'function'
	}
	function am(e) {
		return e ? 'checked' : 'unchecked'
	}
	var Tn,
		bI,
		LI,
		II,
		Kl,
		Yp,
		$l,
		Zp,
		Qp,
		em,
		tm,
		Jl,
		om = y(() => {
			'use client'
			Q()
			Ke()
			Oe()
			qe()
			Tt()
			Jr()
			Yr()
			Me()
			B()
			;((Tn = 'Switch'), ([bI, LI] = be(Tn)), ([II, Kl] = bI(Tn)))
			;((Yp = 'SwitchTrigger'),
				($l = S(({ __scopeSwitch: e, onClick: t, ...a }, o) => {
					let {
							value: r,
							disabled: n,
							checked: l,
							required: i,
							setControl: u,
							setChecked: d,
							hasConsumerStoppedPropagationRef: c,
							isFormControl: f,
							bubbleInput: m
						} = Kl(Yp, e),
						h = te(o, u)
					return s(j.button, {
						type: 'button',
						role: 'switch',
						'aria-checked': l,
						'aria-required': i,
						'data-state': am(l),
						'data-disabled': n ? '' : void 0,
						disabled: n,
						value: r,
						...a,
						ref: h,
						onClick: _(t, (g) => {
							;(d((p) => !p),
								m && f && ((c.current = g.isPropagationStopped()), c.current || g.stopPropagation()))
						})
					})
				})))
			$l.displayName = Yp
			Zp = S((e, t) => {
				let {
					__scopeSwitch: a,
					name: o,
					checked: r,
					defaultChecked: n,
					required: l,
					disabled: i,
					value: u,
					onCheckedChange: d,
					form: c,
					...f
				} = e
				return s(Jp, {
					__scopeSwitch: a,
					checked: r,
					defaultChecked: n,
					disabled: i,
					required: l,
					onCheckedChange: d,
					name: o,
					form: c,
					value: u,
					internal_do_not_use_render: ({ isFormControl: m }) =>
						D(Ze, {
							children: [s($l, { ...f, ref: t, __scopeSwitch: a }), m && s(Jl, { __scopeSwitch: a })]
						})
				})
			})
			Zp.displayName = Tn
			;((Qp = 'SwitchThumb'),
				(em = S((e, t) => {
					let { __scopeSwitch: a, ...o } = e,
						r = Kl(Qp, a)
					return s(j.span, {
						'data-state': am(r.checked),
						'data-disabled': r.disabled ? '' : void 0,
						...o,
						ref: t
					})
				})))
			em.displayName = Qp
			;((tm = 'SwitchBubbleInput'),
				(Jl = S(({ __scopeSwitch: e, ...t }, a) => {
					let {
							control: o,
							hasConsumerStoppedPropagationRef: r,
							checked: n,
							defaultChecked: l,
							required: i,
							disabled: u,
							name: d,
							value: c,
							form: f,
							bubbleInput: m,
							setBubbleInput: h
						} = Kl(tm, e),
						g = te(a, h),
						p = Za(n),
						x = Qa(o)
					E(() => {
						let C = m
						if (!C) return
						let b = window.HTMLInputElement.prototype,
							I = Object.getOwnPropertyDescriptor(b, 'checked').set,
							k = !r.current
						if (p !== n && I) {
							let P = new Event('click', { bubbles: k })
							;(I.call(C, n), C.dispatchEvent(P))
						}
					}, [m, p, n, r])
					let v = w(n)
					return s(j.input, {
						type: 'checkbox',
						'aria-hidden': !0,
						defaultChecked: l ?? v.current,
						required: i,
						disabled: u,
						name: d,
						value: c,
						form: f,
						...t,
						tabIndex: -1,
						ref: g,
						style: {
							...t.style,
							...x,
							position: 'absolute',
							pointerEvents: 'none',
							opacity: 0,
							margin: 0,
							transform: 'translateX(-100%)'
						}
					})
				})))
			Jl.displayName = tm
		})
	var wa = {}
	Je(wa, {
		Content: () => AI,
		List: () => kI,
		Root: () => PI,
		Tabs: () => Zl,
		TabsContent: () => ti,
		TabsList: () => Ql,
		TabsTrigger: () => ei,
		Trigger: () => TI,
		createTabsScope: () => yI
	})
	function im(e, t) {
		return `${e}-trigger-${t}`
	}
	function um(e, t) {
		return `${e}-content-${t}`
	}
	var An,
		wI,
		yI,
		rm,
		RI,
		Yl,
		Zl,
		nm,
		Ql,
		sm,
		ei,
		lm,
		ti,
		PI,
		kI,
		TI,
		AI,
		dm = y(() => {
			'use client'
			Q()
			Ke()
			qe()
			zo()
			jt()
			Me()
			zo()
			Va()
			Tt()
			Xt()
			B()
			;((An = 'Tabs'),
				([wI, yI] = be(An, [no])),
				(rm = no()),
				([RI, Yl] = wI(An)),
				(Zl = S((e, t) => {
					let {
							__scopeTabs: a,
							value: o,
							onValueChange: r,
							defaultValue: n,
							orientation: l = 'horizontal',
							dir: i,
							activationMode: u = 'automatic',
							...d
						} = e,
						c = ft(i),
						[f, m] = De({ prop: o, onChange: r, defaultProp: n ?? '', caller: An })
					return s(RI, {
						scope: a,
						baseId: Te(),
						value: f,
						onValueChange: m,
						orientation: l,
						dir: c,
						activationMode: u,
						children: s(j.div, { dir: c, 'data-orientation': l, ...d, ref: t })
					})
				})))
			Zl.displayName = An
			;((nm = 'TabsList'),
				(Ql = S((e, t) => {
					let { __scopeTabs: a, loop: o = !0, ...r } = e,
						n = Yl(nm, a),
						l = rm(a)
					return s(pn, {
						asChild: !0,
						...l,
						orientation: n.orientation,
						dir: n.dir,
						loop: o,
						children: s(j.div, { role: 'tablist', 'aria-orientation': n.orientation, ...r, ref: t })
					})
				})))
			Ql.displayName = nm
			;((sm = 'TabsTrigger'),
				(ei = S((e, t) => {
					let { __scopeTabs: a, value: o, disabled: r = !1, ...n } = e,
						l = Yl(sm, a),
						i = rm(a),
						u = im(l.baseId, o),
						d = um(l.baseId, o),
						c = o === l.value
					return s(mn, {
						asChild: !0,
						...i,
						focusable: !r,
						active: c,
						children: s(j.button, {
							type: 'button',
							role: 'tab',
							'aria-selected': c,
							'aria-controls': d,
							'data-state': c ? 'active' : 'inactive',
							'data-disabled': r ? '' : void 0,
							disabled: r,
							id: u,
							...n,
							ref: t,
							onMouseDown: _(e.onMouseDown, (f) => {
								!r && f.button === 0 && f.ctrlKey === !1 ? l.onValueChange(o) : f.preventDefault()
							}),
							onKeyDown: _(e.onKeyDown, (f) => {
								;[' ', 'Enter'].includes(f.key) && l.onValueChange(o)
							}),
							onFocus: _(e.onFocus, () => {
								let f = l.activationMode !== 'manual'
								!c && !r && f && l.onValueChange(o)
							})
						})
					})
				})))
			ei.displayName = sm
			;((lm = 'TabsContent'),
				(ti = S((e, t) => {
					let { __scopeTabs: a, value: o, forceMount: r, children: n, ...l } = e,
						i = Yl(lm, a),
						u = im(i.baseId, o),
						d = um(i.baseId, o),
						c = o === i.value,
						f = w(c)
					return (
						E(() => {
							let m = requestAnimationFrame(() => (f.current = !1))
							return () => cancelAnimationFrame(m)
						}, []),
						s(ye, {
							present: r || c,
							children: ({ present: m }) =>
								s(j.div, {
									'data-state': c ? 'active' : 'inactive',
									'data-orientation': i.orientation,
									role: 'tabpanel',
									'aria-labelledby': u,
									hidden: !m,
									id: d,
									tabIndex: 0,
									...l,
									ref: t,
									style: { ...e.style, animationDuration: f.current ? '0s' : void 0 },
									children: m && n
								})
						})
					)
				})))
			ti.displayName = lm
			;((PI = Zl), (kI = Ql), (TI = ei), (AI = ti))
		})
	var Nt = {}
	Je(Nt, {
		Arrow: () => ZI,
		Content: () => YI,
		Portal: () => JI,
		Provider: () => XI,
		Root: () => KI,
		Tooltip: () => si,
		TooltipArrow: () => ci,
		TooltipContent: () => di,
		TooltipPortal: () => ui,
		TooltipProvider: () => ni,
		TooltipTrigger: () => li,
		Trigger: () => $I,
		createTooltipScope: () => MI
	})
	function UI(e, t) {
		let a = Math.abs(t.top - e.y),
			o = Math.abs(t.bottom - e.y),
			r = Math.abs(t.right - e.x),
			n = Math.abs(t.left - e.x)
		switch (Math.min(a, o, r, n)) {
			case n:
				return 'left'
			case r:
				return 'right'
			case a:
				return 'top'
			case o:
				return 'bottom'
			default:
				throw new Error('unreachable')
		}
	}
	function qI(e, t, a = 5) {
		let o = []
		switch (t) {
			case 'top':
				o.push({ x: e.x - a, y: e.y + a }, { x: e.x + a, y: e.y + a })
				break
			case 'bottom':
				o.push({ x: e.x - a, y: e.y - a }, { x: e.x + a, y: e.y - a })
				break
			case 'left':
				o.push({ x: e.x + a, y: e.y - a }, { x: e.x + a, y: e.y + a })
				break
			case 'right':
				o.push({ x: e.x - a, y: e.y - a }, { x: e.x - a, y: e.y + a })
				break
		}
		return o
	}
	function VI(e) {
		let { top: t, right: a, bottom: o, left: r } = e
		return [
			{ x: r, y: t },
			{ x: a, y: t },
			{ x: a, y: o },
			{ x: r, y: o }
		]
	}
	function GI(e, t) {
		let { x: a, y: o } = e,
			r = !1
		for (let n = 0, l = t.length - 1; n < t.length; l = n++) {
			let i = t[n],
				u = t[l],
				d = i.x,
				c = i.y,
				f = u.x,
				m = u.y
			c > o != m > o && a < ((f - d) * (o - c)) / (m - c) + d && (r = !r)
		}
		return r
	}
	function WI(e) {
		let t = e.slice()
		return (t.sort((a, o) => (a.x < o.x ? -1 : a.x > o.x ? 1 : a.y < o.y ? -1 : a.y > o.y ? 1 : 0)), jI(t))
	}
	function jI(e) {
		if (e.length <= 1) return e.slice()
		let t = []
		for (let o = 0; o < e.length; o++) {
			let r = e[o]
			for (; t.length >= 2; ) {
				let n = t[t.length - 1],
					l = t[t.length - 2]
				if ((n.x - l.x) * (r.y - l.y) >= (n.y - l.y) * (r.x - l.x)) t.pop()
				else break
			}
			t.push(r)
		}
		t.pop()
		let a = []
		for (let o = e.length - 1; o >= 0; o--) {
			let r = e[o]
			for (; a.length >= 2; ) {
				let n = a[a.length - 1],
					l = a[a.length - 2]
				if ((n.x - l.x) * (r.y - l.y) >= (n.y - l.y) * (r.x - l.x)) a.pop()
				else break
			}
			a.push(r)
		}
		return (a.pop(), t.length === 1 && a.length === 1 && t[0].x === a[0].x && t[0].y === a[0].y ? t : t.concat(a))
	}
	var Mn,
		MI,
		Dn,
		cm,
		DI,
		ai,
		EI,
		ri,
		ni,
		$o,
		OI,
		Jo,
		si,
		oi,
		li,
		ii,
		FI,
		BI,
		ui,
		lo,
		di,
		NI,
		_I,
		zI,
		HI,
		fm,
		pm,
		ci,
		XI,
		KI,
		$I,
		JI,
		YI,
		ZI,
		mm = y(() => {
			'use client'
			Q()
			Ke()
			Oe()
			qe()
			Ro()
			Xt()
			ba()
			ba()
			Po()
			jt()
			Me()
			Wt()
			Tt()
			ns()
			B()
			;(([Mn, MI] = be('Tooltip', [Ft])),
				(Dn = Ft()),
				(cm = 'TooltipProvider'),
				(DI = 700),
				(ai = 'tooltip.open'),
				([EI, ri] = Mn(cm)),
				(ni = (e) => {
					let {
							__scopeTooltip: t,
							delayDuration: a = DI,
							skipDelayDuration: o = 300,
							disableHoverableContent: r = !1,
							children: n
						} = e,
						l = w(!0),
						i = w(!1),
						u = w(0)
					return (
						E(() => {
							let d = u.current
							return () => window.clearTimeout(d)
						}, []),
						s(EI, {
							scope: t,
							isOpenDelayedRef: l,
							delayDuration: a,
							onOpen: G(() => {
								o <= 0 || (window.clearTimeout(u.current), (l.current = !1))
							}, [o]),
							onClose: G(() => {
								o <= 0 ||
									(window.clearTimeout(u.current),
									(u.current = window.setTimeout(() => (l.current = !0), o)))
							}, [o]),
							isPointerInTransitRef: i,
							onPointerInTransitChange: G((d) => {
								i.current = d
							}, []),
							disableHoverableContent: r,
							children: n
						})
					)
				}))
			ni.displayName = cm
			;(($o = 'Tooltip'),
				([OI, Jo] = Mn($o)),
				(si = (e) => {
					let {
							__scopeTooltip: t,
							children: a,
							open: o,
							defaultOpen: r,
							onOpenChange: n,
							disableHoverableContent: l,
							delayDuration: i
						} = e,
						u = ri($o, e.__scopeTooltip),
						d = Dn(t),
						[c, f] = T(null),
						m = Te(),
						h = w(0),
						g = l ?? u.disableHoverableContent,
						p = i ?? u.delayDuration,
						x = w(!1),
						[v, C] = De({
							prop: o,
							defaultProp: r ?? !1,
							onChange: (P) => {
								;(P ? (u.onOpen(), document.dispatchEvent(new CustomEvent(ai))) : u.onClose(), n?.(P))
							},
							caller: $o
						}),
						b = we(() => (v ? (x.current ? 'delayed-open' : 'instant-open') : 'closed'), [v]),
						L = G(() => {
							;(window.clearTimeout(h.current), (h.current = 0), (x.current = !1), C(!0))
						}, [C]),
						I = G(() => {
							;(window.clearTimeout(h.current), (h.current = 0), C(!1))
						}, [C]),
						k = G(() => {
							;(window.clearTimeout(h.current),
								(h.current = window.setTimeout(() => {
									;((x.current = !0), C(!0), (h.current = 0))
								}, p)))
						}, [p, C])
					return (
						E(
							() => () => {
								h.current && (window.clearTimeout(h.current), (h.current = 0))
							},
							[]
						),
						s(Ca, {
							...d,
							children: s(OI, {
								scope: t,
								contentId: m,
								open: v,
								stateAttribute: b,
								trigger: c,
								onTriggerChange: f,
								onTriggerEnter: G(() => {
									u.isOpenDelayedRef.current ? k() : L()
								}, [u.isOpenDelayedRef, k, L]),
								onTriggerLeave: G(() => {
									g ? I() : (window.clearTimeout(h.current), (h.current = 0))
								}, [I, g]),
								onOpen: L,
								onClose: I,
								disableHoverableContent: g,
								children: a
							})
						})
					)
				}))
			si.displayName = $o
			;((oi = 'TooltipTrigger'),
				(li = S((e, t) => {
					let { __scopeTooltip: a, ...o } = e,
						r = Jo(oi, a),
						n = ri(oi, a),
						l = Dn(a),
						i = w(null),
						u = te(t, i, r.onTriggerChange),
						d = w(!1),
						c = w(!1),
						f = G(() => (d.current = !1), [])
					return (
						E(() => () => document.removeEventListener('pointerup', f), [f]),
						s(ao, {
							asChild: !0,
							...l,
							children: s(j.button, {
								'aria-describedby': r.open ? r.contentId : void 0,
								'data-state': r.stateAttribute,
								...o,
								ref: u,
								onPointerMove: _(e.onPointerMove, (m) => {
									m.pointerType !== 'touch' &&
										!c.current &&
										!n.isPointerInTransitRef.current &&
										(r.onTriggerEnter(), (c.current = !0))
								}),
								onPointerLeave: _(e.onPointerLeave, () => {
									;(r.onTriggerLeave(), (c.current = !1))
								}),
								onPointerDown: _(e.onPointerDown, () => {
									;(r.open && r.onClose(),
										(d.current = !0),
										document.addEventListener('pointerup', f, { once: !0 }))
								}),
								onFocus: _(e.onFocus, () => {
									d.current || r.onOpen()
								}),
								onBlur: _(e.onBlur, r.onClose),
								onClick: _(e.onClick, r.onClose)
							})
						})
					)
				})))
			li.displayName = oi
			;((ii = 'TooltipPortal'),
				([FI, BI] = Mn(ii, { forceMount: void 0 })),
				(ui = (e) => {
					let { __scopeTooltip: t, forceMount: a, children: o, container: r } = e,
						n = Jo(ii, t)
					return s(FI, {
						scope: t,
						forceMount: a,
						children: s(ye, {
							present: a || n.open,
							children: s(Dt, { asChild: !0, container: r, children: o })
						})
					})
				}))
			ui.displayName = ii
			;((lo = 'TooltipContent'),
				(di = S((e, t) => {
					let a = BI(lo, e.__scopeTooltip),
						{ forceMount: o = a.forceMount, side: r = 'top', ...n } = e,
						l = Jo(lo, e.__scopeTooltip)
					return s(ye, {
						present: o || l.open,
						children: l.disableHoverableContent
							? s(fm, { side: r, ...n, ref: t })
							: s(NI, { side: r, ...n, ref: t })
					})
				})),
				(NI = S((e, t) => {
					let a = Jo(lo, e.__scopeTooltip),
						o = ri(lo, e.__scopeTooltip),
						r = w(null),
						n = te(t, r),
						[l, i] = T(null),
						{ trigger: u, onClose: d } = a,
						c = r.current,
						{ onPointerInTransitChange: f } = o,
						m = G(() => {
							;(i(null), f(!1))
						}, [f]),
						h = G(
							(g, p) => {
								let x = g.currentTarget,
									v = { x: g.clientX, y: g.clientY },
									C = UI(v, x.getBoundingClientRect()),
									b = qI(v, C),
									L = VI(p.getBoundingClientRect()),
									I = WI([...b, ...L])
								;(i(I), f(!0))
							},
							[f]
						)
					return (
						E(() => () => m(), [m]),
						E(() => {
							if (u && c) {
								let g = (x) => h(x, c),
									p = (x) => h(x, u)
								return (
									u.addEventListener('pointerleave', g),
									c.addEventListener('pointerleave', p),
									() => {
										;(u.removeEventListener('pointerleave', g),
											c.removeEventListener('pointerleave', p))
									}
								)
							}
						}, [u, c, h, m]),
						E(() => {
							if (l) {
								let g = (p) => {
									let x = p.target,
										v = { x: p.clientX, y: p.clientY },
										C = u?.contains(x) || c?.contains(x),
										b = !GI(v, l)
									C ? m() : b && (m(), d())
								}
								return (
									document.addEventListener('pointermove', g),
									() => document.removeEventListener('pointermove', g)
								)
							}
						}, [u, c, l, d, m]),
						s(fm, { ...e, ref: n })
					)
				})),
				([_I, zI] = Mn($o, { isInside: !1 })),
				(HI = Sr('TooltipContent')),
				(fm = S((e, t) => {
					let {
							__scopeTooltip: a,
							children: o,
							'aria-label': r,
							onEscapeKeyDown: n,
							onPointerDownOutside: l,
							...i
						} = e,
						u = Jo(lo, a),
						d = Dn(a),
						{ onClose: c } = u
					return (
						E(() => (document.addEventListener(ai, c), () => document.removeEventListener(ai, c)), [c]),
						E(() => {
							if (u.trigger) {
								let f = (m) => {
									m.target instanceof Node && m.target.contains(u.trigger) && c()
								}
								return (
									window.addEventListener('scroll', f, { capture: !0 }),
									() => window.removeEventListener('scroll', f, { capture: !0 })
								)
							}
						}, [u.trigger, c]),
						s(Mt, {
							asChild: !0,
							disableOutsidePointerEvents: !1,
							onEscapeKeyDown: n,
							onPointerDownOutside: l,
							onFocusOutside: (f) => f.preventDefault(),
							onDismiss: c,
							children: D(oo, {
								'data-state': u.stateAttribute,
								...d,
								...i,
								ref: t,
								style: {
									...i.style,
									'--radix-tooltip-content-transform-origin': 'var(--radix-popper-transform-origin)',
									'--radix-tooltip-content-available-width': 'var(--radix-popper-available-width)',
									'--radix-tooltip-content-available-height': 'var(--radix-popper-available-height)',
									'--radix-tooltip-trigger-width': 'var(--radix-popper-anchor-width)',
									'--radix-tooltip-trigger-height': 'var(--radix-popper-anchor-height)'
								},
								children: [
									s(HI, { children: o }),
									s(_I, {
										scope: a,
										isInside: !0,
										children: s(zu, { id: u.contentId, role: 'tooltip', children: r || o })
									})
								]
							})
						})
					)
				})))
			di.displayName = lo
			;((pm = 'TooltipArrow'),
				(ci = S((e, t) => {
					let { __scopeTooltip: a, ...o } = e,
						r = Dn(a)
					return zI(pm, a).isInside ? null : s(ro, { ...r, ...o, ref: t })
				})))
			ci.displayName = pm
			;((XI = ni), (KI = si), ($I = li), (JI = ui), (YI = di), (ZI = ci))
		})
	var We = y(() => {
		qd()
		Jd()
		$r()
		np()
		sp()
		hp()
		$p()
		Wt()
		om()
		dm()
		mm()
	})
	function En({ className: e, variant: t = 'default', asChild: a = !1, ...o }) {
		let r = a ? Ua.Root : 'span'
		return s(r, { 'data-slot': 'badge', 'data-variant': t, className: q(QI({ variant: t }), e), ...o })
	}
	var QI,
		gm = y(() => {
			So()
			We()
			pe()
			B()
			QI = Gt(
				'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
				{
					variants: {
						variant: {
							default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
							secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
							destructive:
								'bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
							outline:
								'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
							ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
							link: 'text-primary underline-offset-4 [a&]:hover:underline'
						}
					},
					defaultVariants: { variant: 'default' }
				}
			)
		})
	function je({ className: e, variant: t = 'default', size: a = 'default', asChild: o = !1, ...r }) {
		let n = o ? Ua.Root : 'button'
		return s(n, {
			'data-slot': 'button',
			'data-variant': t,
			'data-size': a,
			className: q(Yo({ variant: t, size: a, className: e })),
			...r
		})
	}
	var Yo,
		Zo = y(() => {
			So()
			We()
			pe()
			B()
			Yo = Gt(
				"inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				{
					variants: {
						variant: {
							default: 'bg-primary text-primary-foreground hover:bg-primary/90',
							destructive:
								'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40',
							outline:
								'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
							secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
							ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
							link: 'text-primary underline-offset-4 hover:underline'
						},
						size: {
							default: 'h-9 px-4 py-2 has-[>svg]:px-3',
							xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
							sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
							lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
							icon: 'size-9',
							'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
							'icon-sm': 'size-8',
							'icon-lg': 'size-10'
						}
					},
					defaultVariants: { variant: 'default', size: 'default' }
				}
			)
		})
	function hm({ className: e, ...t }) {
		return s('div', {
			'data-slot': 'card',
			className: q('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', e),
			...t
		})
	}
	function xm({ className: e, ...t }) {
		return s('div', { 'data-slot': 'card-content', className: q('px-6', e), ...t })
	}
	var vm = y(() => {
		pe()
		B()
	})
	var On,
		fi = y(() => {
			On = (...e) =>
				e
					.filter((t, a, o) => !!t && t.trim() !== '' && o.indexOf(t) === a)
					.join(' ')
					.trim()
		})
	var Cm,
		bm = y(() => {
			Cm = (e) => e.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
		})
	var Lm,
		Im = y(() => {
			Lm = (e) => e.replace(/^([A-Z])|[\s-_]+(\w)/g, (t, a, o) => (o ? o.toUpperCase() : a.toLowerCase()))
		})
	var pi,
		Sm = y(() => {
			Im()
			pi = (e) => {
				let t = Lm(e)
				return t.charAt(0).toUpperCase() + t.slice(1)
			}
		})
	var Fn,
		wm = y(() => {
			Fn = {
				xmlns: 'http://www.w3.org/2000/svg',
				width: 24,
				height: 24,
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 2,
				strokeLinecap: 'round',
				strokeLinejoin: 'round'
			}
		})
	var ym,
		Rm = y(() => {
			ym = (e) => {
				for (let t in e) if (t.startsWith('aria-') || t === 'role' || t === 'title') return !0
				return !1
			}
		})
	var eS,
		Pm,
		km = y(() => {
			'use strict'
			'use client'
			Q()
			;((eS = Ee({})), (Pm = () => _e(eS)))
		})
	var Tm,
		Am = y(() => {
			'use strict'
			'use client'
			Q()
			wm()
			Rm()
			fi()
			km()
			Tm = S(
				(
					{
						color: e,
						size: t,
						strokeWidth: a,
						absoluteStrokeWidth: o,
						className: r = '',
						children: n,
						iconNode: l,
						...i
					},
					u
				) => {
					let {
							size: d = 24,
							strokeWidth: c = 2,
							absoluteStrokeWidth: f = !1,
							color: m = 'currentColor',
							className: h = ''
						} = Pm() ?? {},
						g = (o ?? f) ? (Number(a ?? c) * 24) / Number(t ?? d) : (a ?? c)
					return Re(
						'svg',
						{
							ref: u,
							...Fn,
							width: t ?? d ?? Fn.width,
							height: t ?? d ?? Fn.height,
							stroke: e ?? m,
							strokeWidth: g,
							className: On('lucide', h, r),
							...(!n && !ym(i) && { 'aria-hidden': 'true' }),
							...i
						},
						[...l.map(([p, x]) => Re(p, x)), ...(Array.isArray(n) ? n : [n])]
					)
				}
			)
		})
	var ta,
		Qo = y(() => {
			Q()
			fi()
			bm()
			Sm()
			Am()
			ta = (e, t) => {
				let a = S(({ className: o, ...r }, n) =>
					Re(Tm, { ref: n, iconNode: t, className: On(`lucide-${Cm(pi(e))}`, `lucide-${e}`, o), ...r })
				)
				return ((a.displayName = pi(e)), a)
			}
		})
	var tS,
		ya,
		Mm = y(() => {
			Qo()
			;((tS = [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]]), (ya = ta('check', tS)))
		})
	var aS,
		io,
		Dm = y(() => {
			Qo()
			;((aS = [['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]]), (io = ta('chevron-down', aS)))
		})
	var oS,
		er,
		Em = y(() => {
			Qo()
			;((oS = [['path', { d: 'm18 15-6-6-6 6', key: '153udz' }]]), (er = ta('chevron-up', oS)))
		})
	var rS,
		Ra,
		Om = y(() => {
			Qo()
			;((rS = [
				['path', { d: 'M18 6 6 18', key: '1bl5f8' }],
				['path', { d: 'm6 6 12 12', key: 'd8bk6v' }]
			]),
				(Ra = ta('x', rS)))
		})
	var tr = y(() => {
		'use strict'
		Mm()
		Dm()
		Em()
		Om()
	})
	function mi({ className: e, ...t }) {
		return s(Do.Root, {
			'data-slot': 'checkbox',
			className: q(
				'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary',
				e
			),
			...t,
			children: s(Do.Indicator, {
				'data-slot': 'checkbox-indicator',
				className: 'grid place-content-center text-current transition-none',
				children: s(ya, { className: 'size-3.5' })
			})
		})
	}
	var Fm = y(() => {
		'use client'
		tr()
		We()
		pe()
		B()
	})
	function gi({ ...e }) {
		return s(Pe.Root, { 'data-slot': 'dialog', ...e })
	}
	function nS({ ...e }) {
		return s(Pe.Portal, { 'data-slot': 'dialog-portal', ...e })
	}
	function sS({ className: e, ...t }) {
		return s(Pe.Overlay, {
			'data-slot': 'dialog-overlay',
			className: q(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
				e
			),
			...t
		})
	}
	function hi({ className: e, children: t, showCloseButton: a = !0, ...o }) {
		return D(nS, {
			'data-slot': 'dialog-portal',
			children: [
				s(sS, {}),
				D(Pe.Content, {
					'data-slot': 'dialog-content',
					className: q(
						'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
						e
					),
					...o,
					children: [
						t,
						a &&
							D(Pe.Close, {
								'data-slot': 'dialog-close',
								className:
									"absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
								children: [s(Ra, {}), s('span', { className: 'sr-only', children: 'Close' })]
							})
					]
				})
			]
		})
	}
	function xi({ className: e, ...t }) {
		return s('div', {
			'data-slot': 'dialog-header',
			className: q('flex flex-col gap-2 text-center sm:text-left', e),
			...t
		})
	}
	function Bm({ className: e, showCloseButton: t = !1, children: a, ...o }) {
		return D('div', {
			'data-slot': 'dialog-footer',
			className: q('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', e),
			...o,
			children: [a, t && s(Pe.Close, { asChild: !0, children: s(je, { variant: 'outline', children: 'Close' }) })]
		})
	}
	function vi({ className: e, ...t }) {
		return s(Pe.Title, { 'data-slot': 'dialog-title', className: q('text-lg leading-none font-semibold', e), ...t })
	}
	function Ci({ className: e, ...t }) {
		return s(Pe.Description, {
			'data-slot': 'dialog-description',
			className: q('text-sm text-muted-foreground', e),
			...t
		})
	}
	var bi = y(() => {
		tr()
		We()
		pe()
		Zo()
		B()
	})
	function Bn({ className: e, type: t, ...a }) {
		return s('input', {
			type: t,
			'data-slot': 'input',
			className: q(
				'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
				'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
				'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
				e
			),
			...a
		})
	}
	var Nm = y(() => {
		pe()
		B()
	})
	function _m({ className: e, children: t, ...a }) {
		return D(Yt.Root, {
			'data-slot': 'scroll-area',
			className: q('relative', e),
			...a,
			children: [
				s(Yt.Viewport, {
					'data-slot': 'scroll-area-viewport',
					className:
						'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
					children: t
				}),
				s(lS, {}),
				s(Yt.Corner, {})
			]
		})
	}
	function lS({ className: e, orientation: t = 'vertical', ...a }) {
		return s(Yt.ScrollAreaScrollbar, {
			'data-slot': 'scroll-area-scrollbar',
			orientation: t,
			className: q(
				'flex touch-none p-px transition-colors select-none',
				t === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
				t === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
				e
			),
			...a,
			children: s(Yt.ScrollAreaThumb, {
				'data-slot': 'scroll-area-thumb',
				className: 'relative flex-1 rounded-full bg-border'
			})
		})
	}
	var zm = y(() => {
		We()
		pe()
		B()
	})
	function ar({ ...e }) {
		return s(He.Root, { 'data-slot': 'select', ...e })
	}
	function or({ ...e }) {
		return s(He.Value, { 'data-slot': 'select-value', ...e })
	}
	function rr({ className: e, size: t = 'default', children: a, ...o }) {
		return D(He.Trigger, {
			'data-slot': 'select-trigger',
			'data-size': t,
			className: q(
				"flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
				e
			),
			...o,
			children: [a, s(He.Icon, { asChild: !0, children: s(io, { className: 'size-4 opacity-50' }) })]
		})
	}
	function nr({ className: e, children: t, position: a = 'item-aligned', align: o = 'center', ...r }) {
		return s(He.Portal, {
			children: D(He.Content, {
				'data-slot': 'select-content',
				className: q(
					'relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					a === 'popper' &&
						'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
					e
				),
				position: a,
				align: o,
				...r,
				children: [
					s(iS, {}),
					s(He.Viewport, {
						className: q(
							'p-1',
							a === 'popper' &&
								'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1'
						),
						children: t
					}),
					s(uS, {})
				]
			})
		})
	}
	function uo({ className: e, children: t, ...a }) {
		return D(He.Item, {
			'data-slot': 'select-item',
			className: q(
				"relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				e
			),
			...a,
			children: [
				s('span', {
					'data-slot': 'select-item-indicator',
					className: 'absolute right-2 flex size-3.5 items-center justify-center',
					children: s(He.ItemIndicator, { children: s(ya, { className: 'size-4' }) })
				}),
				s(He.ItemText, { children: t })
			]
		})
	}
	function iS({ className: e, ...t }) {
		return s(He.ScrollUpButton, {
			'data-slot': 'select-scroll-up-button',
			className: q('flex cursor-default items-center justify-center py-1', e),
			...t,
			children: s(er, { className: 'size-4' })
		})
	}
	function uS({ className: e, ...t }) {
		return s(He.ScrollDownButton, {
			'data-slot': 'select-scroll-down-button',
			className: q('flex cursor-default items-center justify-center py-1', e),
			...t,
			children: s(io, { className: 'size-4' })
		})
	}
	var Hm = y(() => {
		tr()
		We()
		pe()
		B()
	})
	var Um = y(() => {
		'use client'
		pe()
		B()
	})
	function qm({ className: e, orientation: t = 'horizontal', ...a }) {
		return s(wa.Root, {
			'data-slot': 'tabs',
			'data-orientation': t,
			orientation: t,
			className: q('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', e),
			...a
		})
	}
	function Vm({ className: e, variant: t = 'default', ...a }) {
		return s(wa.List, { 'data-slot': 'tabs-list', 'data-variant': t, className: q(dS({ variant: t }), e), ...a })
	}
	function Nn({ className: e, ...t }) {
		return s(wa.Trigger, {
			'data-slot': 'tabs-trigger',
			className: q(
				"relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent',
				'data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground',
				'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
				e
			),
			...t
		})
	}
	function _n({ className: e, ...t }) {
		return s(wa.Content, { 'data-slot': 'tabs-content', className: q('flex-1 outline-none', e), ...t })
	}
	var dS,
		Gm = y(() => {
			'use client'
			So()
			We()
			pe()
			B()
			dS = Gt(
				'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none',
				{
					variants: { variant: { default: 'bg-muted', line: 'gap-1 bg-transparent' } },
					defaultVariants: { variant: 'default' }
				}
			)
		})
	function Wm({ className: e, ...t }) {
		return s('textarea', {
			'data-slot': 'textarea',
			className: q(
				'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
				e
			),
			...t
		})
	}
	var jm = y(() => {
		pe()
		B()
	})
	function Xm({ delayDuration: e = 0, ...t }) {
		return s(Nt.Provider, { 'data-slot': 'tooltip-provider', delayDuration: e, ...t })
	}
	function Km({ ...e }) {
		return s(Nt.Root, { 'data-slot': 'tooltip', ...e })
	}
	function $m({ ...e }) {
		return s(Nt.Trigger, { 'data-slot': 'tooltip-trigger', ...e })
	}
	function Jm({ className: e, sideOffset: t = 0, children: a, ...o }) {
		return s(Nt.Portal, {
			children: D(Nt.Content, {
				'data-slot': 'tooltip-content',
				sideOffset: t,
				className: q(
					'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
					e
				),
				...o,
				children: [
					a,
					s(Nt.Arrow, {
						className:
							'z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground'
					})
				]
			})
		})
	}
	var Ym = y(() => {
		We()
		pe()
		B()
	})
	function Zm({ className: e, ...t }) {
		return s('div', {
			'data-slot': 'table-container',
			className: 'relative w-full overflow-x-auto',
			children: s('table', { 'data-slot': 'table', className: q('w-full caption-bottom text-sm', e), ...t })
		})
	}
	function Qm({ className: e, ...t }) {
		return s('thead', { 'data-slot': 'table-header', className: q('[&_tr]:border-b', e), ...t })
	}
	function eg({ className: e, ...t }) {
		return s('tbody', { 'data-slot': 'table-body', className: q('[&_tr:last-child]:border-0', e), ...t })
	}
	function Li({ className: e, ...t }) {
		return s('tr', {
			'data-slot': 'table-row',
			className: q('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', e),
			...t
		})
	}
	function vt({ className: e, ...t }) {
		return s('th', {
			'data-slot': 'table-head',
			className: q(
				'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
				e
			),
			...t
		})
	}
	function Ct({ className: e, ...t }) {
		return s('td', { 'data-slot': 'table-cell', className: q('p-3 align-middle', e), ...t })
	}
	var tg = y(() => {
		pe()
		B()
	})
	function sr({ className: e, ...t }) {
		return s(Cn.Root, {
			'data-slot': 'label',
			className: q(
				'flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
				e
			),
			...t
		})
	}
	var ag = y(() => {
		We()
		pe()
		B()
	})
	function og({ className: e, ...t }) {
		return s(Ko.Root, {
			'data-slot': 'switch',
			className: q(
				'peer inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
				e
			),
			...t,
			children: s(Ko.Thumb, {
				'data-slot': 'switch-thumb',
				className:
					'pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
			})
		})
	}
	var rg = y(() => {
		We()
		pe()
		B()
	})
	function ng({ className: e, ...t }) {
		return s('div', { 'data-slot': 'skeleton', className: q('animate-pulse rounded-md bg-accent', e), ...t })
	}
	var sg = y(() => {
		pe()
		B()
	})
	function fS({ className: e, ...t }) {
		return s(Pe.Overlay, {
			'data-slot': 'sheet-overlay',
			className: q(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
				e
			),
			...t
		})
	}
	function ig({ className: e, children: t, side: a = 'right', ...o }) {
		return D(cS, {
			children: [
				s(fS, {}),
				D(Pe.Content, {
					'data-slot': 'sheet-content',
					className: q(
						'fixed z-50 flex flex-col gap-4 border bg-background shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
						a === 'right' &&
							'inset-y-0 right-0 h-full w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl',
						a === 'left' &&
							'inset-y-0 left-0 h-full w-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-xl',
						a === 'top' &&
							'inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
						a === 'bottom' &&
							'inset-x-0 bottom-0 h-auto border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
						e
					),
					...o,
					children: [
						t,
						D(Pe.Close, {
							className:
								'absolute right-4 top-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
							children: [
								s(Ra, { className: 'size-4' }),
								s('span', { className: 'sr-only', children: 'Close' })
							]
						})
					]
				})
			]
		})
	}
	function ug({ className: e, ...t }) {
		return s('div', { 'data-slot': 'sheet-header', className: q('flex flex-col gap-1.5 p-4', e), ...t })
	}
	function dg({ className: e, ...t }) {
		return s(Pe.Title, { 'data-slot': 'sheet-title', className: q('font-semibold text-foreground', e), ...t })
	}
	function cg({ className: e, ...t }) {
		return s(Pe.Description, {
			'data-slot': 'sheet-description',
			className: q('text-sm text-muted-foreground', e),
			...t
		})
	}
	var lg,
		TA,
		AA,
		cS,
		fg = y(() => {
			tr()
			We()
			pe()
			B()
			;((lg = Pe.Root), (TA = Pe.Trigger), (AA = Pe.Close), (cS = Pe.Portal))
		})
	function mS({ className: e, ...t }) {
		return s(Qe.Overlay, {
			className: q(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
				e
			),
			...t
		})
	}
	function Si({ className: e, ...t }) {
		return D(pS, {
			children: [
				s(mS, {}),
				s(Qe.Content, {
					className: q(
						'fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg sm:max-w-lg',
						e
					),
					...t
				})
			]
		})
	}
	function wi({ className: e, ...t }) {
		return s('div', { className: q('flex flex-col gap-2 text-center sm:text-left', e), ...t })
	}
	function yi({ className: e, ...t }) {
		return s('div', { className: q('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', e), ...t })
	}
	function Ri({ className: e, ...t }) {
		return s(Qe.Title, { className: q('text-lg font-semibold', e), ...t })
	}
	function Pi({ className: e, ...t }) {
		return s(Qe.Description, { className: q('text-sm text-muted-foreground', e), ...t })
	}
	function ki({ className: e, ...t }) {
		return s(Qe.Action, { className: q(Yo(), e), ...t })
	}
	function Ti({ className: e, ...t }) {
		return s(Qe.Cancel, { className: q(Yo({ variant: 'outline' }), e), ...t })
	}
	var Ii,
		BA,
		pS,
		pg = y(() => {
			We()
			pe()
			Zo()
			B()
			;((Ii = Qe.Root), (BA = Qe.Trigger), (pS = Qe.Portal))
		})
	var mg = y(() => {
		pe()
		B()
	})
	var gg = y(() => {
		pe()
		B()
	})
	var hg = y(() => {
		'use client'
		B()
	})
	var xg = y(() => {
		'use client'
		pe()
		bi()
		B()
	})
	function Ai({ ...e }) {
		return s(Bt.Root, { 'data-slot': 'dropdown-menu', ...e })
	}
	function Mi({ ...e }) {
		return s(Bt.Trigger, { 'data-slot': 'dropdown-menu-trigger', ...e })
	}
	function Di({ className: e, sideOffset: t = 4, ...a }) {
		return s(Bt.Portal, {
			children: s(Bt.Content, {
				'data-slot': 'dropdown-menu-content',
				sideOffset: t,
				className: q(
					'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					e
				),
				...a
			})
		})
	}
	function bt({ className: e, inset: t, variant: a = 'default', ...o }) {
		return s(Bt.Item, {
			'data-slot': 'dropdown-menu-item',
			'data-inset': t,
			'data-variant': a,
			className: q(
				"relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
				e
			),
			...o
		})
	}
	function Ei({ className: e, ...t }) {
		return s(Bt.Separator, {
			'data-slot': 'dropdown-menu-separator',
			className: q('-mx-1 my-1 h-px bg-border', e),
			...t
		})
	}
	var vg = y(() => {
		We()
		pe()
		B()
	})
	var Cg = y(() => {
		pe()
		Zo()
		B()
	})
	var bg = y(() => {
		'use client'
		pe()
		B()
	})
	var Lg = y(() => {
		pe()
		B()
	})
	var Ig = y(() => {
		'use client'
		pe()
		B()
	})
	function gS(e, t) {
		let a = getComputedStyle(e),
			o = parseFloat(a.fontSize)
		return t * o
	}
	function hS(e, t) {
		let a = getComputedStyle(e.ownerDocument.documentElement),
			o = parseFloat(a.fontSize)
		return t * o
	}
	function xS(e) {
		return (e / 100) * window.innerHeight
	}
	function vS(e) {
		return (e / 100) * window.innerWidth
	}
	function CS(e) {
		switch (typeof e) {
			case 'number':
				return [e, 'px']
			case 'string': {
				let t = parseFloat(e)
				return e.endsWith('%')
					? [t, '%']
					: e.endsWith('px')
						? [t, 'px']
						: e.endsWith('rem')
							? [t, 'rem']
							: e.endsWith('em')
								? [t, 'em']
								: e.endsWith('vh')
									? [t, 'vh']
									: e.endsWith('vw')
										? [t, 'vw']
										: [t, '%']
			}
		}
	}
	function lr({ groupSize: e, panelElement: t, styleProp: a }) {
		let o,
			[r, n] = CS(a)
		switch (n) {
			case '%': {
				o = (r / 100) * e
				break
			}
			case 'px': {
				o = r
				break
			}
			case 'rem': {
				o = hS(t, r)
				break
			}
			case 'em': {
				o = gS(t, r)
				break
			}
			case 'vh': {
				o = xS(r)
				break
			}
			case 'vw': {
				o = vS(r)
				break
			}
		}
		return o
	}
	function Ue(e) {
		return parseFloat(e.toFixed(3))
	}
	function go({ group: e }) {
		let { orientation: t, panels: a } = e
		return a.reduce((o, r) => ((o += t === 'horizontal' ? r.element.offsetWidth : r.element.offsetHeight), o), 0)
	}
	function Fi(e) {
		let { panels: t } = e,
			a = go({ group: e })
		return a === 0
			? t.map((o) => ({
					groupResizeBehavior: o.panelConstraints.groupResizeBehavior,
					collapsedSize: 0,
					collapsible: o.panelConstraints.collapsible === !0,
					defaultSize: void 0,
					disabled: o.panelConstraints.disabled,
					minSize: 0,
					maxSize: 100,
					panelId: o.id
				}))
			: t.map((o) => {
					let { element: r, panelConstraints: n } = o,
						l = 0
					if (n.collapsedSize !== void 0) {
						let c = lr({ groupSize: a, panelElement: r, styleProp: n.collapsedSize })
						l = Ue((c / a) * 100)
					}
					let i
					if (n.defaultSize !== void 0) {
						let c = lr({ groupSize: a, panelElement: r, styleProp: n.defaultSize })
						i = Ue((c / a) * 100)
					}
					let u = 0
					if (n.minSize !== void 0) {
						let c = lr({ groupSize: a, panelElement: r, styleProp: n.minSize })
						u = Ue((c / a) * 100)
					}
					let d = 100
					if (n.maxSize !== void 0) {
						let c = lr({ groupSize: a, panelElement: r, styleProp: n.maxSize })
						d = Ue((c / a) * 100)
					}
					return {
						groupResizeBehavior: n.groupResizeBehavior,
						collapsedSize: l,
						collapsible: n.collapsible === !0,
						defaultSize: i,
						disabled: n.disabled,
						minSize: u,
						maxSize: d,
						panelId: o.id
					}
				})
	}
	function ve(e, t = 'Assertion error') {
		if (!e) throw Error(t)
	}
	function Bi(e, t) {
		return Array.from(t).sort(e === 'horizontal' ? bS : LS)
	}
	function bS(e, t) {
		let a = e.element.offsetLeft - t.element.offsetLeft
		return a !== 0 ? a : e.element.offsetWidth - t.element.offsetWidth
	}
	function LS(e, t) {
		let a = e.element.offsetTop - t.element.offsetTop
		return a !== 0 ? a : e.element.offsetHeight - t.element.offsetHeight
	}
	function Hg(e) {
		return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.ELEMENT_NODE
	}
	function Ug(e, t) {
		return {
			x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(Math.abs(e.x - t.left), Math.abs(e.x - t.right)),
			y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(Math.abs(e.y - t.top), Math.abs(e.y - t.bottom))
		}
	}
	function IS({ orientation: e, rects: t, targetRect: a }) {
		let o = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
			r,
			n = Number.MAX_VALUE
		for (let l of t) {
			let { x: i, y: u } = Ug(o, l),
				d = e === 'horizontal' ? i : u
			d < n && ((n = d), (r = l))
		}
		return (ve(r, 'No rect found'), r)
	}
	function SS() {
		return (
			zn === void 0 &&
				(typeof matchMedia == 'function' ? (zn = !!matchMedia('(pointer:coarse)').matches) : (zn = !1)),
			zn
		)
	}
	function qg(e) {
		let { element: t, orientation: a, panels: o, separators: r } = e,
			n = Bi(
				a,
				Array.from(t.children)
					.filter(Hg)
					.map((g) => ({ element: g }))
			).map(({ element: g }) => g),
			l = [],
			i = !1,
			u = !1,
			d = -1,
			c = -1,
			f = 0,
			m,
			h = []
		{
			let g = -1
			for (let p of n)
				p.hasAttribute('data-panel') &&
					(g++, p.hasAttribute('data-disabled') || (f++, d === -1 && (d = g), (c = g)))
		}
		if (f > 1) {
			let g = -1
			for (let p of n)
				if (p.hasAttribute('data-panel')) {
					g++
					let x = o.find((v) => v.element === p)
					if (x) {
						if (m) {
							let v = m.element.getBoundingClientRect(),
								C = p.getBoundingClientRect(),
								b
							if (u) {
								let L =
										a === 'horizontal'
											? new DOMRect(v.right, v.top, 0, v.height)
											: new DOMRect(v.left, v.bottom, v.width, 0),
									I =
										a === 'horizontal'
											? new DOMRect(C.left, C.top, 0, C.height)
											: new DOMRect(C.left, C.top, C.width, 0)
								switch (h.length) {
									case 0: {
										b = [L, I]
										break
									}
									case 1: {
										let k = h[0],
											P = IS({
												orientation: a,
												rects: [v, C],
												targetRect: k.element.getBoundingClientRect()
											})
										b = [k, P === v ? I : L]
										break
									}
									default: {
										b = h
										break
									}
								}
							} else
								h.length
									? (b = h)
									: (b = [
											a === 'horizontal'
												? new DOMRect(v.right, C.top, C.left - v.right, C.height)
												: new DOMRect(C.left, v.bottom, C.width, C.top - v.bottom)
										])
							for (let L of b) {
								let I = 'width' in L ? L : L.element.getBoundingClientRect(),
									k = SS() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine
								if (I.width < k) {
									let R = k - I.width
									I = new DOMRect(I.x - R / 2, I.y, I.width + R, I.height)
								}
								if (I.height < k) {
									let R = k - I.height
									I = new DOMRect(I.x, I.y - R / 2, I.width, I.height + R)
								}
								let P = g <= d || g > c
								;(!i &&
									!P &&
									l.push({
										group: e,
										groupSize: go({ group: e }),
										panels: [m, x],
										separator: 'width' in L ? void 0 : L,
										rect: I
									}),
									(i = !1))
							}
						}
						;((u = !1), (m = x), (h = []))
					}
				} else if (p.hasAttribute('data-separator')) {
					p.ariaDisabled !== null && (i = !0)
					let x = r.find((v) => v.element === p)
					x ? h.push(x) : ((m = void 0), (h = []))
				} else u = !0
		}
		return l
	}
	function ka() {
		return po
	}
	function wS(e) {
		return Ni.addListener('change', e)
	}
	function yS(e) {
		let t = po,
			a = { ...po }
		;((a.cursorFlags = e), (po = a), Ni.emit('change', { prev: t, next: a }))
	}
	function mo(e) {
		let t = po
		;((po = e), Ni.emit('change', { prev: t, next: e }))
	}
	function yg() {
		return (
			Hn === void 0 &&
				((Hn = !1),
				typeof window < 'u' &&
					(window.navigator.userAgent.includes('Chrome') || window.navigator.userAgent.includes('Firefox')) &&
					(Hn = !0)),
			Hn
		)
	}
	function PS({ cursorFlags: e, groups: t, state: a }) {
		let o = 0,
			r = 0
		switch (a) {
			case 'active':
			case 'hover':
				t.forEach((n) => {
					if (!n.mutableState.disableCursor)
						switch (n.orientation) {
							case 'horizontal': {
								o++
								break
							}
							case 'vertical': {
								r++
								break
							}
						}
				})
		}
		if (!(o === 0 && r === 0)) {
			switch (a) {
				case 'active': {
					if (e && yg()) {
						let n = (e & Vg) !== 0,
							l = (e & Gg) !== 0,
							i = (e & Wg) !== 0,
							u = (e & jg) !== 0
						if (n) return i ? 'se-resize' : u ? 'ne-resize' : 'e-resize'
						if (l) return i ? 'sw-resize' : u ? 'nw-resize' : 'w-resize'
						if (i) return 's-resize'
						if (u) return 'n-resize'
					}
					break
				}
			}
			return yg()
				? o > 0 && r > 0
					? 'move'
					: o > 0
						? 'ew-resize'
						: 'ns-resize'
				: o > 0 && r > 0
					? 'grab'
					: o > 0
						? 'col-resize'
						: 'row-resize'
		}
	}
	function _i(e) {
		if (e.defaultView === null || e.defaultView === void 0) return
		let { prevStyle: t, styleSheet: a } = Rg.get(e) ?? {}
		a === void 0 &&
			((a = new e.defaultView.CSSStyleSheet()),
			e.adoptedStyleSheets &&
				(Object.isExtensible(e.adoptedStyleSheets)
					? e.adoptedStyleSheets.push(a)
					: (e.adoptedStyleSheets = [...e.adoptedStyleSheets, a])))
		let o = ka()
		switch (o.state) {
			case 'active':
			case 'hover': {
				let r = PS({ cursorFlags: o.cursorFlags, groups: o.hitRegions.map((l) => l.group), state: o.state }),
					n = `*, *:hover {cursor: ${r} !important; }`
				if (t === n) return
				;((t = n),
					r
						? a.cssRules.length === 0
							? a.insertRule(n)
							: a.replaceSync(n)
						: a.cssRules.length === 1 && a.deleteRule(0))
				break
			}
			case 'inactive': {
				;((t = void 0), a.cssRules.length === 1 && a.deleteRule(0))
				break
			}
		}
		Rg.set(e, { prevStyle: t, styleSheet: a })
	}
	function kS(e) {
		;((It = new Map(It)), It.delete(e))
	}
	function Pg(e, t) {
		for (let [a] of It) if (a.id === e) return a
	}
	function oa(e, t) {
		for (let [a, o] of It) if (a.id === e) return o
		if (t) throw Error(`Could not find data for Group with id ${e}`)
	}
	function Ma() {
		return It
	}
	function zi(e, t) {
		return Xg.addListener('groupChange', (a) => {
			a.group.id === e && t(a)
		})
	}
	function _t(e, t, a) {
		let o = It.get(e)
		;((It = new Map(It)),
			It.set(e, t),
			Xg.emit('groupChange', { group: e, isUserInteraction: a?.isUserInteraction === !0, prev: o, next: t }))
	}
	function Kg(e) {
		let t = ka(),
			a = !1
		return (
			t.state === 'active' &&
				(mo({ cursorFlags: 0, state: 'inactive' }),
				t.hitRegions.length > 0 &&
					(_i(e),
					(a = !0),
					t.hitRegions.forEach((o) => {
						let r = oa(o.group.id, !0)
						_t(o.group, r, { isUserInteraction: !0 })
					}))),
			a
		)
	}
	function kg(e) {
		e.defaultPrevented || Kg(e.currentTarget)
	}
	function TS(e, t, a) {
		let o,
			r = { x: 1 / 0, y: 1 / 0 }
		for (let n of t) {
			let l = Ug(a, n.rect)
			switch (e) {
				case 'horizontal': {
					l.x <= r.x && ((o = n), (r = l))
					break
				}
				case 'vertical': {
					l.y <= r.y && ((o = n), (r = l))
					break
				}
			}
		}
		return o ? { distance: r, hitRegion: o } : void 0
	}
	function AS(e) {
		return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE
	}
	function MS(e, t) {
		if (e === t) throw new Error('Cannot compare node with itself')
		let a = { a: Mg(e), b: Mg(t) },
			o
		for (; a.a.at(-1) === a.b.at(-1); ) ((o = a.a.pop()), a.b.pop())
		ve(o, 'Stacking order can only be calculated for elements with a common ancestor')
		let r = { a: Ag(Tg(a.a)), b: Ag(Tg(a.b)) }
		if (r.a === r.b) {
			let n = o.childNodes,
				l = { a: a.a.at(-1), b: a.b.at(-1) },
				i = n.length
			for (; i--; ) {
				let u = n[i]
				if (u === l.a) return 1
				if (u === l.b) return -1
			}
		}
		return Math.sign(r.a - r.b)
	}
	function ES(e) {
		let t = getComputedStyle($g(e) ?? e).display
		return t === 'flex' || t === 'inline-flex'
	}
	function OS(e) {
		let t = getComputedStyle(e)
		return !!(
			t.position === 'fixed' ||
			(t.zIndex !== 'auto' && (t.position !== 'static' || ES(e))) ||
			+t.opacity < 1 ||
			('transform' in t && t.transform !== 'none') ||
			('webkitTransform' in t && t.webkitTransform !== 'none') ||
			('mixBlendMode' in t && t.mixBlendMode !== 'normal') ||
			('filter' in t && t.filter !== 'none') ||
			('webkitFilter' in t && t.webkitFilter !== 'none') ||
			('isolation' in t && t.isolation === 'isolate') ||
			DS.test(t.willChange) ||
			t.webkitOverflowScrolling === 'touch'
		)
	}
	function Tg(e) {
		let t = e.length
		for (; t--; ) {
			let a = e[t]
			if ((ve(a, 'Missing node'), OS(a))) return a
		}
		return null
	}
	function Ag(e) {
		return (e && Number(getComputedStyle(e).zIndex)) || 0
	}
	function Mg(e) {
		let t = []
		for (; e; ) (t.push(e), (e = $g(e)))
		return t
	}
	function $g(e) {
		let { parentNode: t } = e
		return AS(t) ? t.host : t
	}
	function FS(e, t) {
		return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y
	}
	function BS({ groupElement: e, hitRegion: t, pointerEventTarget: a }) {
		if (!Hg(a) || a.contains(e) || e.contains(a)) return !0
		if (MS(a, e) > 0) {
			let o = a
			for (; o; ) {
				if (o.contains(e)) return !0
				if (FS(o.getBoundingClientRect(), t)) return !1
				o = o.parentElement
			}
		}
		return !0
	}
	function Hi(e, t) {
		let a = []
		return (
			t.forEach((o, r) => {
				if (r.disabled) return
				let n = qg(r),
					l = TS(r.orientation, n, { x: e.clientX, y: e.clientY })
				l &&
					l.distance.x <= 0 &&
					l.distance.y <= 0 &&
					BS({ groupElement: r.element, hitRegion: l.hitRegion.rect, pointerEventTarget: e.target }) &&
					a.push(l.hitRegion)
			}),
			a
		)
	}
	function NS(e, t) {
		if (e.length !== t.length) return !1
		for (let a = 0; a < e.length; a++) if (e[a] != t[a]) return !1
		return !0
	}
	function Be(e, t, a = 0) {
		return Math.abs(Ue(e) - Ue(t)) <= a
	}
	function Lt(e, t) {
		return Be(e, t) ? 0 : e > t ? 1 : -1
	}
	function fo({ overrideDisabledPanels: e, panelConstraints: t, prevSize: a, size: o }) {
		let { collapsedSize: r = 0, collapsible: n, disabled: l, maxSize: i = 100, minSize: u = 0 } = t
		if (l && !e) return a
		if (Lt(o, u) < 0)
			if (n) {
				let d = (r + u) / 2
				Lt(o, d) < 0 ? (o = r) : (o = u)
			} else o = u
		return ((o = Math.min(i, o)), (o = Ue(o)), o)
	}
	function ur({ delta: e, initialLayout: t, panelConstraints: a, pivotIndices: o, prevLayout: r, trigger: n }) {
		if (Be(e, 0)) return t
		let l = n === 'imperative-api',
			i = Object.values(t),
			u = Object.values(r),
			d = [...i],
			[c, f] = o
		;(ve(c != null, 'Invalid first pivot index'), ve(f != null, 'Invalid second pivot index'))
		let m = 0
		switch (n) {
			case 'keyboard': {
				{
					let p = e < 0 ? f : c,
						x = a[p]
					ve(x, `Panel constraints not found for index ${p}`)
					let { collapsedSize: v = 0, collapsible: C, minSize: b = 0 } = x
					if (C) {
						let L = i[p]
						if ((ve(L != null, `Previous layout not found for panel index ${p}`), Be(L, v))) {
							let I = b - L
							Lt(I, Math.abs(e)) > 0 && (e = e < 0 ? 0 - I : I)
						}
					}
				}
				{
					let p = e < 0 ? c : f,
						x = a[p]
					ve(x, `No panel constraints found for index ${p}`)
					let { collapsedSize: v = 0, collapsible: C, minSize: b = 0 } = x
					if (C) {
						let L = i[p]
						if ((ve(L != null, `Previous layout not found for panel index ${p}`), Be(L, b))) {
							let I = L - v
							Lt(I, Math.abs(e)) > 0 && (e = e < 0 ? 0 - I : I)
						}
					}
				}
				break
			}
			default: {
				let p = e < 0 ? f : c,
					x = a[p]
				ve(x, `Panel constraints not found for index ${p}`)
				let v = i[p],
					{ collapsible: C, collapsedSize: b, minSize: L } = x
				if (C && Lt(v, L) < 0)
					if (e > 0) {
						let I = L - b,
							k = I / 2,
							P = v + e
						Lt(P, L) < 0 && (e = Lt(e, k) <= 0 ? 0 : I)
					} else {
						let I = L - b,
							k = 100 - I / 2,
							P = v - e
						Lt(P, L) < 0 && (e = Lt(100 + e, k) > 0 ? 0 : -I)
					}
				break
			}
		}
		{
			let p = e < 0 ? 1 : -1,
				x = e < 0 ? f : c,
				v = 0
			for (;;) {
				let b = i[x]
				ve(b != null, `Previous layout not found for panel index ${x}`)
				let L = fo({ overrideDisabledPanels: l, panelConstraints: a[x], prevSize: b, size: 100 }) - b
				if (((v += L), (x += p), x < 0 || x >= a.length)) break
			}
			let C = Math.min(Math.abs(e), Math.abs(v))
			e = e < 0 ? 0 - C : C
		}
		{
			let p = e < 0 ? c : f
			for (; p >= 0 && p < a.length; ) {
				let x = Math.abs(e) - Math.abs(m),
					v = i[p]
				ve(v != null, `Previous layout not found for panel index ${p}`)
				let C = v - x,
					b = fo({ overrideDisabledPanels: l, panelConstraints: a[p], prevSize: v, size: C })
				if (
					!Be(v, b) &&
					((m += v - b),
					(d[p] = b),
					m.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, { numeric: !0 }) >= 0)
				)
					break
				e < 0 ? p-- : p++
			}
		}
		if (NS(u, d)) return r
		{
			let p = e < 0 ? f : c,
				x = i[p]
			ve(x != null, `Previous layout not found for panel index ${p}`)
			let v = x + m,
				C = fo({ overrideDisabledPanels: l, panelConstraints: a[p], prevSize: x, size: v })
			if (((d[p] = C), !Be(C, v))) {
				let b = v - C,
					L = e < 0 ? f : c
				for (; L >= 0 && L < a.length; ) {
					let I = d[L]
					ve(I != null, `Previous layout not found for panel index ${L}`)
					let k = I + b,
						P = fo({ overrideDisabledPanels: l, panelConstraints: a[L], prevSize: I, size: k })
					if ((Be(I, P) || ((b -= P - I), (d[L] = P)), Be(b, 0))) break
					e > 0 ? L-- : L++
				}
			}
		}
		let h = Object.values(d).reduce((p, x) => x + p, 0)
		if (!Be(h, 100, 0.1)) return r
		let g = Object.keys(r)
		return d.reduce((p, x, v) => ((p[g[v]] = x), p), {})
	}
	function Ta(e, t) {
		if (Object.keys(e).length !== Object.keys(t).length) return !1
		for (let a in e) if (t[a] === void 0 || Lt(e[a], t[a]) !== 0) return !1
		return !0
	}
	function Aa({ layout: e, panelConstraints: t }) {
		let a = Object.values(e),
			o = [...a],
			r = o.reduce((i, u) => i + u, 0)
		if (o.length !== t.length) throw Error(`Invalid ${t.length} panel layout: ${o.map((i) => `${i}%`).join(', ')}`)
		if (!Be(r, 100) && o.length > 0)
			for (let i = 0; i < t.length; i++) {
				let u = o[i]
				ve(u != null, `No layout data found for index ${i}`)
				let d = (100 / r) * u
				o[i] = d
			}
		let n = 0
		for (let i = 0; i < t.length; i++) {
			let u = a[i]
			ve(u != null, `No layout data found for index ${i}`)
			let d = o[i]
			ve(d != null, `No layout data found for index ${i}`)
			let c = fo({ overrideDisabledPanels: !0, panelConstraints: t[i], prevSize: u, size: d })
			d != c && ((n += d - c), (o[i] = c))
		}
		if (!Be(n, 0))
			for (let i = 0; i < t.length; i++) {
				let u = o[i]
				ve(u != null, `No layout data found for index ${i}`)
				let d = u + n,
					c = fo({ overrideDisabledPanels: !0, panelConstraints: t[i], prevSize: u, size: d })
				if (u !== c && ((n -= c - u), (o[i] = c), Be(n, 0))) break
			}
		let l = Object.keys(e)
		return o.reduce((i, u, d) => ((i[l[d]] = u), i), {})
	}
	function Jg({ groupId: e, panelId: t }) {
		let a = () => {
				let u = Ma()
				for (let [
					d,
					{
						defaultLayoutDeferred: c,
						derivedPanelConstraints: f,
						layout: m,
						groupSize: h,
						separatorToPanels: g
					}
				] of u)
					if (d.id === e)
						return {
							defaultLayoutDeferred: c,
							derivedPanelConstraints: f,
							group: d,
							groupSize: h,
							layout: m,
							separatorToPanels: g
						}
				throw Error(`Group ${e} not found`)
			},
			o = () => {
				let u = a().derivedPanelConstraints.find((d) => d.panelId === t)
				if (u !== void 0) return u
				throw Error(`Panel constraints not found for Panel ${t}`)
			},
			r = () => {
				let u = a().group.panels.find((d) => d.id === t)
				if (u !== void 0) return u
				throw Error(`Layout not found for Panel ${t}`)
			},
			n = () => {
				let u = a().layout[t]
				if (u !== void 0) return u
				throw Error(`Layout not found for Panel ${t}`)
			},
			l = ({ nextSize: u, panels: d, prevLayout: c, derivedPanelConstraints: f }) => {
				let m = n(),
					h = d.findIndex((x) => x.id === t),
					g = h === 0,
					p = h === d.length - 1
				if (
					p &&
					u < m &&
					(g ||
						d.slice(0, h).every((x, v) => {
							let C = f[v]
							return C?.collapsible && Be(C.collapsedSize, c[C.panelId])
						}))
				) {
					let x = d.slice(0, h).reduce((v, C) => v + c[C.id], 0)
					return { ...c, [t]: Ue(100 - x) }
				}
				return ur({
					delta: p ? m - u : u - m,
					initialLayout: c,
					panelConstraints: f,
					pivotIndices: p ? [h - 1, h] : [h, h + 1],
					prevLayout: c,
					trigger: 'imperative-api'
				})
			},
			i = (u) => {
				let d = n()
				if (u === d) return
				let {
						defaultLayoutDeferred: c,
						derivedPanelConstraints: f,
						group: m,
						groupSize: h,
						layout: g,
						separatorToPanels: p
					} = a(),
					x = l({ nextSize: u, panels: m.panels, prevLayout: g, derivedPanelConstraints: f }),
					v = Aa({ layout: x, panelConstraints: f })
				Ta(g, v) ||
					_t(m, {
						defaultLayoutDeferred: c,
						derivedPanelConstraints: f,
						groupSize: h,
						layout: v,
						separatorToPanels: p
					})
			}
		return {
			collapse: () => {
				let { collapsible: u, collapsedSize: d } = o(),
					{ mutableValues: c } = r(),
					f = n()
				u && f !== d && ((c.expandToSize = f), i(d))
			},
			expand: () => {
				let { collapsible: u, collapsedSize: d, minSize: c } = o(),
					{ mutableValues: f } = r(),
					m = n()
				if (u && m === d) {
					let h = f.expandToSize ?? c
					;(h === 0 && (h = 1), i(h))
				}
			},
			getSize: () => {
				let { group: u } = a(),
					d = n(),
					{ element: c } = r(),
					f = u.orientation === 'horizontal' ? c.offsetWidth : c.offsetHeight
				return { asPercentage: d, inPixels: f }
			},
			isCollapsed: () => {
				let { collapsible: u, collapsedSize: d } = o(),
					c = n()
				return u && Be(d, c)
			},
			resize: (u) => {
				let { group: d } = a(),
					{ element: c } = r(),
					f = go({ group: d }),
					m = lr({ groupSize: f, panelElement: c, styleProp: u }),
					h = Ue((m / f) * 100)
				i(h)
			}
		}
	}
	function Dg(e) {
		if (e.defaultPrevented) return
		let t = Ma()
		Hi(e, t).forEach((a) => {
			if (a.separator && !a.separator.disableDoubleClick) {
				let o = a.panels.find((r) => r.panelConstraints.defaultSize !== void 0)
				if (o) {
					let r = o.panelConstraints.defaultSize,
						n = Jg({ groupId: a.group.id, panelId: o.id })
					n && r !== void 0 && (n.resize(r), e.preventDefault())
				}
			}
		})
	}
	function Un(e) {
		let t = Ma()
		for (let [a] of t) if (a.separators.some((o) => o.element === e)) return a
		throw Error('Could not find parent Group for separator element')
	}
	function Yg({ groupId: e }) {
		let t = () => {
			let a = Ma()
			for (let [o, r] of a) if (o.id === e) return { group: o, ...r }
			throw Error(`Could not find Group with id "${e}"`)
		}
		return {
			getLayout() {
				let { defaultLayoutDeferred: a, layout: o } = t()
				return a ? {} : o
			},
			setLayout(a) {
				let {
						defaultLayoutDeferred: o,
						derivedPanelConstraints: r,
						group: n,
						groupSize: l,
						layout: i,
						separatorToPanels: u
					} = t(),
					d = Aa({ layout: a, panelConstraints: r })
				return o
					? i
					: (Ta(i, d) ||
							_t(n, {
								defaultLayoutDeferred: o,
								derivedPanelConstraints: r,
								groupSize: l,
								layout: d,
								separatorToPanels: u
							}),
						d)
			}
		}
	}
	function Pa(e, t) {
		let a = Un(e),
			o = oa(a.id, !0),
			r = a.separators.find((c) => c.element === e)
		ve(r, 'Matching separator not found')
		let n = o.separatorToPanels.get(r)
		ve(n, 'Matching panels not found')
		let l = n.map((c) => a.panels.indexOf(c)),
			i = Yg({ groupId: a.id }).getLayout(),
			u = ur({
				delta: t,
				initialLayout: i,
				panelConstraints: o.derivedPanelConstraints,
				pivotIndices: l,
				prevLayout: i,
				trigger: 'keyboard'
			}),
			d = Aa({ layout: u, panelConstraints: o.derivedPanelConstraints })
		Ta(i, d) ||
			_t(
				a,
				{
					defaultLayoutDeferred: o.defaultLayoutDeferred,
					derivedPanelConstraints: o.derivedPanelConstraints,
					groupSize: o.groupSize,
					layout: d,
					separatorToPanels: o.separatorToPanels
				},
				{ isUserInteraction: !0 }
			)
	}
	function Eg(e) {
		if (e.defaultPrevented) return
		let t = e.currentTarget,
			a = Un(t)
		if (!a.disabled)
			switch (e.key) {
				case 'ArrowDown': {
					;(e.preventDefault(), a.orientation === 'vertical' && Pa(t, 5))
					break
				}
				case 'ArrowLeft': {
					;(e.preventDefault(), a.orientation === 'horizontal' && Pa(t, -5))
					break
				}
				case 'ArrowRight': {
					;(e.preventDefault(), a.orientation === 'horizontal' && Pa(t, 5))
					break
				}
				case 'ArrowUp': {
					;(e.preventDefault(), a.orientation === 'vertical' && Pa(t, -5))
					break
				}
				case 'End': {
					;(e.preventDefault(), Pa(t, 100))
					break
				}
				case 'Enter': {
					e.preventDefault()
					let o = Un(t),
						r = oa(o.id, !0),
						{ derivedPanelConstraints: n, layout: l, separatorToPanels: i } = r,
						u = o.separators.find((m) => m.element === t)
					ve(u, 'Matching separator not found')
					let d = i.get(u)
					ve(d, 'Matching panels not found')
					let c = d[0],
						f = n.find((m) => m.panelId === c.id)
					if ((ve(f, 'Panel metadata not found'), f.collapsible)) {
						let m = l[c.id],
							h =
								f.collapsedSize === m
									? (o.mutableState.expandedPanelSizes[c.id] ?? f.minSize)
									: f.collapsedSize
						Pa(t, h - m)
					}
					break
				}
				case 'F6': {
					e.preventDefault()
					let o = Un(t).separators.map((l) => l.element),
						r = Array.from(o).findIndex((l) => l === e.currentTarget)
					ve(r !== null, 'Index not found')
					let n = e.shiftKey ? (r > 0 ? r - 1 : o.length - 1) : r + 1 < o.length ? r + 1 : 0
					o[n].focus({ preventScroll: !0 })
					break
				}
				case 'Home': {
					;(e.preventDefault(), Pa(t, -100))
					break
				}
			}
	}
	function Og(e) {
		if (e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0)) return
		let t = Ma(),
			a = Hi(e, t),
			o = new Map(),
			r = !1
		;(a.forEach((n) => {
			n.separator && (r || ((r = !0), n.separator.element.focus({ focusVisible: !1, preventScroll: !0 })))
			let l = t.get(n.group)
			l && o.set(n.group, l.layout)
		}),
			mo({
				cursorFlags: 0,
				hitRegions: a,
				initialLayoutMap: o,
				pointerDownAtPoint: { x: e.clientX, y: e.clientY },
				state: 'active'
			}),
			a.length && e.preventDefault())
	}
	function Zg({
		document: e,
		event: t,
		hitRegions: a,
		initialLayoutMap: o,
		mountedGroups: r,
		pointerDownAtPoint: n,
		prevCursorFlags: l
	}) {
		let i = 0
		a.forEach((d) => {
			let { group: c, groupSize: f } = d,
				{ orientation: m, panels: h } = c,
				{ disableCursor: g } = c.mutableState,
				p = 0
			n
				? m === 'horizontal'
					? (p = ((t.clientX - n.x) / f) * 100)
					: (p = ((t.clientY - n.y) / f) * 100)
				: m === 'horizontal'
					? (p = t.clientX < 0 ? -100 : 100)
					: (p = t.clientY < 0 ? -100 : 100)
			let x = o.get(c),
				v = r.get(c)
			if (!x || !v) return
			let {
				defaultLayoutDeferred: C,
				derivedPanelConstraints: b,
				groupSize: L,
				layout: I,
				separatorToPanels: k
			} = v
			if (b && I && k) {
				let P = ur({
					delta: p,
					initialLayout: x,
					panelConstraints: b,
					pivotIndices: d.panels.map((R) => h.indexOf(R)),
					prevLayout: I,
					trigger: 'mouse-or-touch'
				})
				if (Ta(P, I)) {
					if (p !== 0 && !g)
						switch (m) {
							case 'horizontal': {
								i |= p < 0 ? Vg : Gg
								break
							}
							case 'vertical': {
								i |= p < 0 ? Wg : jg
								break
							}
						}
				} else
					_t(d.group, {
						defaultLayoutDeferred: C,
						derivedPanelConstraints: b,
						groupSize: L,
						layout: P,
						separatorToPanels: k
					})
			}
		})
		let u = 0
		;(t.movementX === 0 ? (u |= l & Sg) : (u |= i & Sg),
			t.movementY === 0 ? (u |= l & wg) : (u |= i & wg),
			yS(u),
			_i(e))
	}
	function Fg(e) {
		let t = Ma(),
			a = ka()
		a.state === 'active' &&
			Zg({
				document: e.currentTarget,
				event: e,
				hitRegions: a.hitRegions,
				initialLayoutMap: a.initialLayoutMap,
				mountedGroups: t,
				prevCursorFlags: a.cursorFlags
			})
	}
	function Bg(e) {
		if (e.defaultPrevented) return
		let t = ka(),
			a = Ma()
		switch (t.state) {
			case 'active': {
				if (e.buttons === 0) {
					;(mo({ cursorFlags: 0, state: 'inactive' }),
						t.hitRegions.forEach((o) => {
							let r = oa(o.group.id, !0)
							_t(o.group, r, { isUserInteraction: !0 })
						}))
					return
				}
				for (let o of t.hitRegions)
					if (o.separator) {
						let { element: r } = o.separator
						r.hasPointerCapture?.(e.pointerId) || r.setPointerCapture?.(e.pointerId)
					}
				Zg({
					document: e.currentTarget,
					event: e,
					hitRegions: t.hitRegions,
					initialLayoutMap: t.initialLayoutMap,
					mountedGroups: a,
					pointerDownAtPoint: t.pointerDownAtPoint,
					prevCursorFlags: t.cursorFlags
				})
				break
			}
			default: {
				let o = Hi(e, a)
				;(o.length === 0
					? t.state !== 'inactive' && mo({ cursorFlags: 0, state: 'inactive' })
					: mo({ cursorFlags: 0, hitRegions: o, state: 'hover' }),
					_i(e.currentTarget))
				break
			}
		}
	}
	function Ng(e) {
		e.relatedTarget instanceof HTMLIFrameElement &&
			ka().state === 'hover' &&
			mo({ cursorFlags: 0, state: 'inactive' })
	}
	function _g(e) {
		e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0) || (Kg(e.currentTarget) && e.preventDefault())
	}
	function zg(e) {
		let t = 0,
			a = 0,
			o = {}
		for (let n of e)
			if (n.defaultSize !== void 0) {
				t++
				let l = Ue(n.defaultSize)
				;((a += l), (o[n.panelId] = l))
			} else o[n.panelId] = void 0
		let r = e.length - t
		if (r !== 0) {
			let n = Ue((100 - a) / r)
			for (let l of e) l.defaultSize === void 0 && (o[l.panelId] = n)
		}
		return o
	}
	function _S(e, t, a) {
		if (!a[0]) return
		let o = e.panels.find((u) => u.element === t)
		if (!o || !o.onResize) return
		let r = go({ group: e }),
			n = e.orientation === 'horizontal' ? o.element.offsetWidth : o.element.offsetHeight,
			l = o.mutableValues.prevSize,
			i = { asPercentage: Ue((n / r) * 100), inPixels: n }
		;((o.mutableValues.prevSize = i), o.onResize(i, o.id, l))
	}
	function zS(e, t) {
		if (Object.keys(e).length !== Object.keys(t).length) return !1
		for (let a in e) if (e[a] !== t[a]) return !1
		return !0
	}
	function HS({ group: e, nextGroupSize: t, prevGroupSize: a, prevLayout: o }) {
		if (a <= 0 || t <= 0 || a === t) return o
		let r = 0,
			n = 0,
			l = !1,
			i = new Map(),
			u = []
		for (let f of e.panels) {
			let m = o[f.id] ?? 0
			if (f.panelConstraints.groupResizeBehavior === 'preserve-pixel-size') {
				l = !0
				let h = (m / 100) * a,
					g = Ue((h / t) * 100)
				;(i.set(f.id, g), (r += g))
			} else (u.push(f.id), (n += m))
		}
		if (!l || u.length === 0) return o
		let d = 100 - r,
			c = { ...o }
		if (
			(i.forEach((f, m) => {
				c[m] = f
			}),
			n > 0)
		)
			for (let f of u) {
				let m = o[f] ?? 0
				c[f] = Ue((m / n) * d)
			}
		else {
			let f = Ue(d / u.length)
			for (let m of u) c[m] = f
		}
		return c
	}
	function US(e, t) {
		let a = e.map((r) => r.id),
			o = Object.keys(t)
		if (a.length !== o.length) return !1
		for (let r of a) if (!o.includes(r)) return !1
		return !0
	}
	function qS(e) {
		let t = !0
		ve(e.element.ownerDocument.defaultView, 'Cannot register an unmounted Group')
		let a = e.element.ownerDocument.defaultView.ResizeObserver,
			o = new Set(),
			r = new Set(),
			n = new a((g) => {
				for (let p of g) {
					let { borderBoxSize: x, target: v } = p
					if (v === e.element) {
						if (t) {
							let C = go({ group: e })
							if (C === 0) return
							let b = oa(e.id)
							if (!b) return
							let L = Fi(e),
								I = b.defaultLayoutDeferred ? zg(L) : b.layout,
								k = HS({ group: e, nextGroupSize: C, prevGroupSize: b.groupSize, prevLayout: I }),
								P = Aa({ layout: k, panelConstraints: L })
							if (
								!b.defaultLayoutDeferred &&
								Ta(b.layout, P) &&
								zS(b.derivedPanelConstraints, L) &&
								b.groupSize === C
							)
								return
							_t(e, {
								defaultLayoutDeferred: !1,
								derivedPanelConstraints: L,
								groupSize: C,
								layout: P,
								separatorToPanels: b.separatorToPanels
							})
						}
					} else _S(e, v, x)
				}
			})
		;(n.observe(e.element),
			e.panels.forEach((g) => {
				;(ve(!o.has(g.id), `Panel ids must be unique; id "${g.id}" was used more than once`),
					o.add(g.id),
					g.onResize && n.observe(g.element))
			}))
		let l = go({ group: e }),
			i = Fi(e),
			u = e.panels.map(({ id: g }) => g).join(','),
			d = e.mutableState.defaultLayout
		d && (US(e.panels, d) || (d = void 0))
		let c = e.mutableState.layouts[u] ?? d ?? zg(i),
			f = Aa({ layout: c, panelConstraints: i }),
			m = e.element.ownerDocument
		co.set(m, (co.get(m) ?? 0) + 1)
		let h = new Map()
		return (
			qg(e).forEach((g) => {
				g.separator && h.set(g.separator, g.panels)
			}),
			_t(e, {
				defaultLayoutDeferred: l === 0,
				derivedPanelConstraints: i,
				groupSize: l,
				layout: f,
				separatorToPanels: h
			}),
			e.separators.forEach((g) => {
				;(ve(!r.has(g.id), `Separator ids must be unique; id "${g.id}" was used more than once`),
					r.add(g.id),
					g.element.addEventListener('keydown', Eg))
			}),
			co.get(m) === 1 &&
				(m.addEventListener('contextmenu', kg, !0),
				m.addEventListener('dblclick', Dg, !0),
				m.addEventListener('pointerdown', Og, !0),
				m.addEventListener('pointerleave', Fg),
				m.addEventListener('pointermove', Bg),
				m.addEventListener('pointerout', Ng),
				m.addEventListener('pointerup', _g, !0)),
			function () {
				;((t = !1),
					co.set(m, Math.max(0, (co.get(m) ?? 0) - 1)),
					kS(e),
					e.separators.forEach((g) => {
						g.element.removeEventListener('keydown', Eg)
					}),
					co.get(m) ||
						(m.removeEventListener('contextmenu', kg, !0),
						m.removeEventListener('dblclick', Dg, !0),
						m.removeEventListener('pointerdown', Og, !0),
						m.removeEventListener('pointerleave', Fg),
						m.removeEventListener('pointermove', Bg),
						m.removeEventListener('pointerout', Ng),
						m.removeEventListener('pointerup', _g, !0)),
					n.disconnect())
			}
		)
	}
	function VS() {
		let [e, t] = T({}),
			a = G(() => t({}), [])
		return [e, a]
	}
	function Ui(e) {
		let t = Na()
		return `${e ?? t}`
	}
	function ir(e) {
		let t = w(e)
		return (
			Da(() => {
				t.current = e
			}, [e]),
			G((...a) => t.current?.(...a), [t])
		)
	}
	function qi(...e) {
		return ir((t) => {
			e.forEach((a) => {
				if (a)
					switch (typeof a) {
						case 'function': {
							a(t)
							break
						}
						case 'object': {
							a.current = t
							break
						}
					}
			})
		})
	}
	function Vi(e) {
		let t = w({ ...e })
		return (
			Da(() => {
				for (let a in e) t.current[a] = e[a]
			}, [e]),
			t.current
		)
	}
	function GS(e, t) {
		let a = w({ getLayout: () => ({}), setLayout: RS })
		;(hr(t, () => a.current, []),
			Da(() => {
				Object.assign(a.current, Yg({ groupId: e }))
			}))
	}
	function eh({
		children: e,
		className: t,
		defaultLayout: a,
		disableCursor: o,
		disabled: r,
		elementRef: n,
		groupRef: l,
		id: i,
		onLayoutChange: u,
		onLayoutChanged: d,
		orientation: c = 'horizontal',
		resizeTargetMinimumSize: f = { coarse: 20, fine: 10 },
		style: m,
		...h
	}) {
		let g = w({ onLayoutChange: {}, onLayoutChanged: {} }),
			p = ir((N) => {
				Ta(g.current.onLayoutChange, N) || ((g.current.onLayoutChange = N), u?.(N))
			}),
			x = ir((N, V) => {
				Ta(g.current.onLayoutChanged, N) || ((g.current.onLayoutChanged = N), d?.(N, { isUserInteraction: V }))
			}),
			v = Ui(i),
			C = w(null),
			[b, L] = VS(),
			I = w({ lastExpandedPanelSizes: {}, layouts: {}, panels: [], resizeTargetMinimumSize: f, separators: [] }),
			k = qi(C, n)
		GS(v, l)
		let P = ir((N, V) => {
				let K = ka(),
					W = Pg(N),
					ee = oa(N)
				if (ee) {
					let X = !1
					return (
						K.state === 'active' && (X = K.hitRegions.some((oe) => oe.group === W)),
						{ flexGrow: ee.layout[V] ?? 1, pointerEvents: X ? 'none' : void 0 }
					)
				}
				if (a?.[V]) return { flexGrow: a?.[V] }
			}),
			R = Vi({ defaultLayout: a, disableCursor: o }),
			O = we(
				() => ({
					get disableCursor() {
						return !!R.disableCursor
					},
					getPanelStyles: P,
					id: v,
					orientation: c,
					registerPanel: (N) => {
						let V = I.current
						return (
							(V.panels = Bi(c, [...V.panels, N])),
							L(),
							() => {
								;((V.panels = V.panels.filter((K) => K !== N)), L())
							}
						)
					},
					registerSeparator: (N) => {
						let V = I.current
						return (
							(V.separators = Bi(c, [...V.separators, N])),
							L(),
							() => {
								;((V.separators = V.separators.filter((K) => K !== N)), L())
							}
						)
					},
					updatePanelProps: (N, { disabled: V }) => {
						let K = I.current.panels.find((X) => X.id === N)
						K && (K.panelConstraints.disabled = V)
						let W = Pg(v),
							ee = oa(v)
						W && ee && _t(W, { ...ee, derivedPanelConstraints: Fi(W) })
					},
					updateSeparatorProps: (N, { disabled: V, disableDoubleClick: K }) => {
						let W = I.current.separators.find((ee) => ee.id === N)
						W && ((W.disabled = V), (W.disableDoubleClick = K))
					}
				}),
				[P, v, L, c, R]
			),
			U = w(null)
		return (
			Da(() => {
				let N = C.current
				if (N === null) return
				let V = I.current,
					K
				if (R.defaultLayout !== void 0 && Object.keys(R.defaultLayout).length === V.panels.length) {
					K = {}
					for (let re of V.panels) {
						let ue = R.defaultLayout[re.id]
						ue !== void 0 && (K[re.id] = ue)
					}
				}
				let W = {
					disabled: !!r,
					element: N,
					id: v,
					mutableState: {
						defaultLayout: K,
						disableCursor: !!R.disableCursor,
						expandedPanelSizes: I.current.lastExpandedPanelSizes,
						layouts: I.current.layouts
					},
					orientation: c,
					panels: V.panels,
					resizeTargetMinimumSize: V.resizeTargetMinimumSize,
					separators: V.separators
				}
				U.current = W
				let ee = qS(W),
					{ defaultLayoutDeferred: X, derivedPanelConstraints: oe, layout: M } = oa(W.id, !0)
				!X && oe.length > 0 && (p(M), x(M, !1))
				let z = zi(v, (re) => {
					let { defaultLayoutDeferred: ue, derivedPanelConstraints: Se, layout: ie } = re.next
					if (ue || Se.length === 0) return
					let ce = W.panels.map(({ id: fe }) => fe).join(',')
					;((W.mutableState.layouts[ce] = ie),
						Se.forEach((fe) => {
							if (fe.collapsible) {
								let { layout: H } = re.prev ?? {}
								if (H) {
									let se = Be(fe.collapsedSize, ie[fe.panelId]),
										Ce = Be(fe.collapsedSize, H[fe.panelId])
									se && !Ce && (W.mutableState.expandedPanelSizes[fe.panelId] = H[fe.panelId])
								}
							}
						}))
					let ke = ka().state !== 'active'
					;(p(ie), ke && x(ie, re.isUserInteraction))
				})
				return () => {
					;((U.current = null), ee(), z())
				}
			}, [r, v, x, p, c, b, R]),
			E(() => {
				let N = U.current
				N && ((N.mutableState.defaultLayout = a), (N.mutableState.disableCursor = !!o))
			}),
			s(Qg.Provider, {
				value: O,
				children: s('div', {
					...h,
					className: t,
					'data-group': !0,
					'data-testid': v,
					id: v,
					ref: k,
					style: {
						height: '100%',
						width: '100%',
						overflow: 'hidden',
						...m,
						display: 'flex',
						flexDirection: c === 'horizontal' ? 'row' : 'column',
						flexWrap: 'nowrap',
						touchAction: c === 'horizontal' ? 'pan-y' : 'pan-x'
					},
					children: e
				})
			})
		)
	}
	function Gi() {
		let e = _e(Qg)
		return (ve(e, 'Group Context not found; did you render a Panel or Separator outside of a Group?'), e)
	}
	function WS(e, t) {
		let { id: a } = Gi(),
			o = w({
				collapse: Oi,
				expand: Oi,
				getSize: () => ({ asPercentage: 0, inPixels: 0 }),
				isCollapsed: () => !1,
				resize: Oi
			})
		;(hr(t, () => o.current, []),
			Da(() => {
				Object.assign(o.current, Jg({ groupId: a, panelId: e }))
			}))
	}
	function th({
		children: e,
		className: t,
		collapsedSize: a = '0%',
		collapsible: o = !1,
		defaultSize: r,
		disabled: n,
		elementRef: l,
		groupResizeBehavior: i = 'preserve-relative-size',
		id: u,
		maxSize: d = '100%',
		minSize: c = '0%',
		onResize: f,
		panelRef: m,
		style: h,
		...g
	}) {
		let p = !!u,
			x = Ui(u),
			v = Vi({ disabled: n }),
			C = w(null),
			b = qi(C, l),
			{ getPanelStyles: L, id: I, orientation: k, registerPanel: P, updatePanelProps: R } = Gi(),
			O = f !== null,
			U = ir((W, ee, X) => {
				f?.(W, u, X)
			})
		;(Da(() => {
			let W = C.current
			if (W !== null) {
				let ee = {
					element: W,
					id: x,
					idIsStable: p,
					mutableValues: { expandToSize: void 0, prevSize: void 0 },
					onResize: O ? U : void 0,
					panelConstraints: {
						groupResizeBehavior: i,
						collapsedSize: a,
						collapsible: o,
						defaultSize: r,
						disabled: v.disabled,
						maxSize: d,
						minSize: c
					}
				}
				return P(ee)
			}
		}, [i, a, o, r, O, x, p, d, c, U, P, v]),
			E(() => {
				R(x, { disabled: n })
			}, [n, x, R]),
			WS(x, m))
		let N = () => {
				let W = L(I, x)
				if (W) return JSON.stringify(W)
			},
			V = Zn((W) => zi(I, W), N, N),
			K
		return (
			V
				? (K = JSON.parse(V))
				: r !== void 0
					? (K = { flexGrow: void 0, flexShrink: void 0, flexBasis: r })
					: (K = { flexGrow: 1 }),
			s('div', {
				...g,
				'data-disabled': n || void 0,
				'data-panel': !0,
				'data-testid': x,
				id: x,
				ref: b,
				style: { ...jS, display: 'flex', flexBasis: 0, flexShrink: 1, overflow: 'visible', ...K },
				children: s('div', {
					className: t,
					style: {
						maxHeight: '100%',
						maxWidth: '100%',
						flexGrow: 1,
						overflow: 'auto',
						...h,
						touchAction: k === 'horizontal' ? 'pan-y' : 'pan-x'
					},
					children: e
				})
			})
		)
	}
	function XS({ layout: e, panelConstraints: t, panelId: a, panelIndex: o }) {
		let r,
			n,
			l = e[a],
			i = t.find((u) => u.panelId === a)
		if (i) {
			let u = i.maxSize,
				d = i.collapsible ? i.collapsedSize : i.minSize,
				c = [o, o + 1]
			;((n = Aa({
				layout: ur({ delta: d - l, initialLayout: e, panelConstraints: t, pivotIndices: c, prevLayout: e }),
				panelConstraints: t
			})[a]),
				(r = Aa({
					layout: ur({ delta: u - l, initialLayout: e, panelConstraints: t, pivotIndices: c, prevLayout: e }),
					panelConstraints: t
				})[a]))
		}
		return { valueControls: a, valueMax: r, valueMin: n, valueNow: l }
	}
	function ah({
		children: e,
		className: t,
		disabled: a,
		disableDoubleClick: o,
		elementRef: r,
		id: n,
		style: l,
		...i
	}) {
		let u = Ui(n),
			d = Vi({ disabled: a, disableDoubleClick: o }),
			[c, f] = T({}),
			[m, h] = T('inactive'),
			[g, p] = T(!1),
			x = w(null),
			v = qi(x, r),
			{ disableCursor: C, id: b, orientation: L, registerSeparator: I, updateSeparatorProps: k } = Gi(),
			P = L === 'horizontal' ? 'vertical' : 'horizontal'
		;(Da(() => {
			let U = x.current
			if (U !== null) {
				let N = { disabled: d.disabled, disableDoubleClick: d.disableDoubleClick, element: U, id: u },
					V = I(N),
					K = wS((ee) => {
						h(
							ee.next.state !== 'inactive' && ee.next.hitRegions.some((X) => X.separator === N)
								? ee.next.state
								: 'inactive'
						)
					}),
					W = zi(b, (ee) => {
						let { derivedPanelConstraints: X, layout: oe, separatorToPanels: M } = ee.next,
							z = M.get(N)
						if (z) {
							let re = z[0],
								ue = z.indexOf(re)
							f(XS({ layout: oe, panelConstraints: X, panelId: re.id, panelIndex: ue }))
						}
					})
				return () => {
					;(K(), W(), V())
				}
			}
		}, [b, u, I, d]),
			E(() => {
				k(u, { disabled: a, disableDoubleClick: o })
			}, [a, o, u, k]))
		let R
		a && !C && (R = 'not-allowed')
		let O
		return (
			a ? (O = 'disabled') : m === 'active' ? (O = 'active') : g ? (O = 'focus') : (O = m),
			s('div', {
				...i,
				'aria-controls': c.valueControls,
				'aria-disabled': a || void 0,
				'aria-orientation': P,
				'aria-valuemax': c.valueMax,
				'aria-valuemin': c.valueMin,
				'aria-valuenow': c.valueNow,
				children: e,
				className: t,
				'data-separator': O,
				'data-testid': u,
				id: u,
				onBlur: () => p(!1),
				onFocus: () => p(!0),
				ref: v,
				role: 'separator',
				style: { flexBasis: 'auto', cursor: R, ...l, flexGrow: 0, flexShrink: 0, touchAction: 'none' },
				tabIndex: a ? void 0 : 0
			})
		)
	}
	var zn,
		aa,
		qn,
		po,
		Ni,
		RS,
		Oi,
		Vg,
		Gg,
		Wg,
		jg,
		Sg,
		wg,
		Hn,
		Rg,
		It,
		Xg,
		DS,
		co,
		Da,
		Qg,
		jS,
		oh = y(() => {
			'use client'
			B()
			Q()
			qn = class {
				constructor() {
					Jn(this, aa, {})
				}
				addListener(t, a) {
					let o = Fa(this, aa)[t]
					return (
						o === void 0 ? (Fa(this, aa)[t] = [a]) : o.includes(a) || o.push(a),
						() => {
							this.removeListener(t, a)
						}
					)
				}
				emit(t, a) {
					let o = Fa(this, aa)[t]
					if (o !== void 0)
						if (o.length === 1) o[0].call(null, a)
						else {
							let r = !1,
								n = null,
								l = Array.from(o)
							for (let i = 0; i < l.length; i++) {
								let u = l[i]
								try {
									u.call(null, a)
								} catch (d) {
									n === null && ((r = !0), (n = d))
								}
							}
							if (r) throw n
						}
				}
				removeAllListeners() {
					Yn(this, aa, {})
				}
				removeListener(t, a) {
					let o = Fa(this, aa)[t]
					if (o !== void 0) {
						let r = o.indexOf(a)
						r >= 0 && o.splice(r, 1)
					}
				}
			}
			aa = new WeakMap()
			;((po = { cursorFlags: 0, state: 'inactive' }), (Ni = new qn()))
			;((RS = (e) => e), (Oi = () => {}), (Vg = 1), (Gg = 2), (Wg = 4), (jg = 8), (Sg = 3), (wg = 12))
			Rg = new WeakMap()
			;((It = new Map()), (Xg = new qn()))
			DS = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/
			co = new Map()
			Da = typeof window < 'u' ? Rt : E
			Qg = Ee(null)
			eh.displayName = 'Group'
			th.displayName = 'Panel'
			jS = {
				minHeight: 0,
				maxHeight: '100%',
				height: 'auto',
				minWidth: 0,
				maxWidth: '100%',
				width: 'auto',
				border: 'none',
				borderWidth: 0,
				padding: 0,
				margin: 0
			}
			ah.displayName = 'Separator'
		})
	var rh = y(() => {
		oh()
		pe()
		B()
	})
	var $S,
		bM,
		LM,
		nh = y(() => {
			'use client'
			Q()
			;(($S = (e, t, a, o, r, n, l, i) => {
				let u = document.documentElement,
					d = ['light', 'dark']
				function c(h) {
					;((Array.isArray(e) ? e : [e]).forEach((g) => {
						let p = g === 'class',
							x = p && n ? r.map((v) => n[v] || v) : r
						p ? (u.classList.remove(...x), u.classList.add(n && n[h] ? n[h] : h)) : u.setAttribute(g, h)
					}),
						f(h))
				}
				function f(h) {
					i && d.includes(h) && (u.style.colorScheme = h)
				}
				function m() {
					return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
				}
				if (o) c(o)
				else
					try {
						let h = localStorage.getItem(t) || a,
							g = l && h === 'system' ? m() : h
						c(g)
					} catch {}
			}),
				(bM = Ee(void 0)),
				(LM = Lo(
					({
						forcedTheme: e,
						storageKey: t,
						attribute: a,
						enableSystem: o,
						enableColorScheme: r,
						defaultTheme: n,
						value: l,
						themes: i,
						nonce: u,
						scriptProps: d
					}) => {
						let c = JSON.stringify([a, t, n, e, i, l, o, r]).slice(1, -1)
						return Re('script', {
							...d,
							suppressHydrationWarning: !0,
							nonce: typeof window > 'u' ? u : '',
							dangerouslySetInnerHTML: { __html: `(${$S.toString()})(${c})` }
						})
					}
				)))
		})
	function JS(e) {
		if (!e || typeof document > 'u') return
		let t = document.head || document.getElementsByTagName('head')[0],
			a = document.createElement('style')
		;((a.type = 'text/css'),
			t.appendChild(a),
			a.styleSheet ? (a.styleSheet.cssText = e) : a.appendChild(document.createTextNode(e)))
	}
	var RM,
		Wi,
		ji,
		rt,
		YS,
		ZS,
		QS,
		ew,
		tw,
		PM,
		sh = y(() => {
			'use client'
			Q()
			Ha()
			;((RM = Array(12).fill(0)),
				(Wi = 1),
				(ji = class {
					constructor() {
						;((this.subscribe = (t) => (
							this.subscribers.push(t),
							() => {
								let a = this.subscribers.indexOf(t)
								this.subscribers.splice(a, 1)
							}
						)),
							(this.publish = (t) => {
								this.subscribers.forEach((a) => a(t))
							}),
							(this.addToast = (t) => {
								;(this.publish(t), (this.toasts = [...this.toasts, t]))
							}),
							(this.create = (t) => {
								var a
								let { message: o, ...r } = t,
									n =
										typeof t?.id == 'number' || ((a = t.id) == null ? void 0 : a.length) > 0
											? t.id
											: Wi++,
									l = this.toasts.find((u) => u.id === n),
									i = t.dismissible === void 0 ? !0 : t.dismissible
								return (
									this.dismissedToasts.has(n) && this.dismissedToasts.delete(n),
									l
										? (this.toasts = this.toasts.map((u) =>
												u.id === n
													? (this.publish({ ...u, ...t, id: n, title: o }),
														{ ...u, ...t, id: n, dismissible: i, title: o })
													: u
											))
										: this.addToast({ title: o, ...r, dismissible: i, id: n }),
									n
								)
							}),
							(this.dismiss = (t) => (
								t
									? (this.dismissedToasts.add(t),
										requestAnimationFrame(() =>
											this.subscribers.forEach((a) => a({ id: t, dismiss: !0 }))
										))
									: this.toasts.forEach((a) => {
											this.subscribers.forEach((o) => o({ id: a.id, dismiss: !0 }))
										}),
								t
							)),
							(this.message = (t, a) => this.create({ ...a, message: t })),
							(this.error = (t, a) => this.create({ ...a, message: t, type: 'error' })),
							(this.success = (t, a) => this.create({ ...a, type: 'success', message: t })),
							(this.info = (t, a) => this.create({ ...a, type: 'info', message: t })),
							(this.warning = (t, a) => this.create({ ...a, type: 'warning', message: t })),
							(this.loading = (t, a) => this.create({ ...a, type: 'loading', message: t })),
							(this.promise = (t, a) => {
								if (!a) return
								let o
								a.loading !== void 0 &&
									(o = this.create({
										...a,
										promise: t,
										type: 'loading',
										message: a.loading,
										description: typeof a.description != 'function' ? a.description : void 0
									}))
								let r = Promise.resolve(t instanceof Function ? t() : t),
									n = o !== void 0,
									l,
									i = r
										.then(async (d) => {
											if (((l = ['resolve', d]), ra.isValidElement(d)))
												((n = !1), this.create({ id: o, type: 'default', message: d }))
											else if (ZS(d) && !d.ok) {
												n = !1
												let f =
														typeof a.error == 'function'
															? await a.error(`HTTP error! status: ${d.status}`)
															: a.error,
													m =
														typeof a.description == 'function'
															? await a.description(`HTTP error! status: ${d.status}`)
															: a.description,
													g =
														typeof f == 'object' && !ra.isValidElement(f)
															? f
															: { message: f }
												this.create({ id: o, type: 'error', description: m, ...g })
											} else if (d instanceof Error) {
												n = !1
												let f = typeof a.error == 'function' ? await a.error(d) : a.error,
													m =
														typeof a.description == 'function'
															? await a.description(d)
															: a.description,
													g =
														typeof f == 'object' && !ra.isValidElement(f)
															? f
															: { message: f }
												this.create({ id: o, type: 'error', description: m, ...g })
											} else if (a.success !== void 0) {
												n = !1
												let f = typeof a.success == 'function' ? await a.success(d) : a.success,
													m =
														typeof a.description == 'function'
															? await a.description(d)
															: a.description,
													g =
														typeof f == 'object' && !ra.isValidElement(f)
															? f
															: { message: f }
												this.create({ id: o, type: 'success', description: m, ...g })
											}
										})
										.catch(async (d) => {
											if (((l = ['reject', d]), a.error !== void 0)) {
												n = !1
												let c = typeof a.error == 'function' ? await a.error(d) : a.error,
													f =
														typeof a.description == 'function'
															? await a.description(d)
															: a.description,
													h =
														typeof c == 'object' && !ra.isValidElement(c)
															? c
															: { message: c }
												this.create({ id: o, type: 'error', description: f, ...h })
											}
										})
										.finally(() => {
											;(n && (this.dismiss(o), (o = void 0)),
												a.finally == null || a.finally.call(a))
										}),
									u = () =>
										new Promise((d, c) =>
											i.then(() => (l[0] === 'reject' ? c(l[1]) : d(l[1]))).catch(c)
										)
								return typeof o != 'string' && typeof o != 'number'
									? { unwrap: u }
									: Object.assign(o, { unwrap: u })
							}),
							(this.custom = (t, a) => {
								let o = a?.id || Wi++
								return (this.create({ jsx: t(o), id: o, ...a }), o)
							}),
							(this.getActiveToasts = () => this.toasts.filter((t) => !this.dismissedToasts.has(t.id))),
							(this.subscribers = []),
							(this.toasts = []),
							(this.dismissedToasts = new Set()))
					}
				}),
				(rt = new ji()),
				(YS = (e, t) => {
					let a = t?.id || Wi++
					return (rt.addToast({ title: e, ...t, id: a }), a)
				}),
				(ZS = (e) =>
					e &&
					typeof e == 'object' &&
					'ok' in e &&
					typeof e.ok == 'boolean' &&
					'status' in e &&
					typeof e.status == 'number'),
				(QS = YS),
				(ew = () => rt.toasts),
				(tw = () => rt.getActiveToasts()),
				(PM = Object.assign(
					QS,
					{
						success: rt.success,
						info: rt.info,
						warning: rt.warning,
						error: rt.error,
						custom: rt.custom,
						message: rt.message,
						promise: rt.promise,
						dismiss: rt.dismiss,
						loading: rt.loading
					},
					{ getHistory: ew, getToasts: tw }
				)))
			JS(
				"[data-sonner-toaster][dir=ltr],html[dir=ltr]{--toast-icon-margin-start:-3px;--toast-icon-margin-end:4px;--toast-svg-margin-start:-1px;--toast-svg-margin-end:0px;--toast-button-margin-start:auto;--toast-button-margin-end:0;--toast-close-button-start:0;--toast-close-button-end:unset;--toast-close-button-transform:translate(-35%, -35%)}[data-sonner-toaster][dir=rtl],html[dir=rtl]{--toast-icon-margin-start:4px;--toast-icon-margin-end:-3px;--toast-svg-margin-start:0px;--toast-svg-margin-end:-1px;--toast-button-margin-start:0;--toast-button-margin-end:auto;--toast-close-button-start:unset;--toast-close-button-end:0;--toast-close-button-transform:translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1:hsl(0, 0%, 99%);--gray2:hsl(0, 0%, 97.3%);--gray3:hsl(0, 0%, 95.1%);--gray4:hsl(0, 0%, 93%);--gray5:hsl(0, 0%, 90.9%);--gray6:hsl(0, 0%, 88.7%);--gray7:hsl(0, 0%, 85.8%);--gray8:hsl(0, 0%, 78%);--gray9:hsl(0, 0%, 56.1%);--gray10:hsl(0, 0%, 52.3%);--gray11:hsl(0, 0%, 43.5%);--gray12:hsl(0, 0%, 9%);--border-radius:8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:0;z-index:999999999;transition:transform .4s ease}@media (hover:none) and (pointer:coarse){[data-sonner-toaster][data-lifted=true]{transform:none}}[data-sonner-toaster][data-x-position=right]{right:var(--offset-right)}[data-sonner-toaster][data-x-position=left]{left:var(--offset-left)}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translateX(-50%)}[data-sonner-toaster][data-y-position=top]{top:var(--offset-top)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--offset-bottom)}[data-sonner-toast]{--y:translateY(100%);--lift-amount:calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:0;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px rgba(0,0,0,.1);width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-y-position=top]{top:0;--y:translateY(-100%);--lift:1;--lift-amount:calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y:translateY(100%);--lift:-1;--lift-amount:calc(var(--lift) * var(--gap))}[data-sonner-toast][data-styled=true] [data-description]{font-weight:400;line-height:1.4;color:#3f3f3f}[data-rich-colors=true][data-sonner-toast][data-styled=true] [data-description]{color:inherit}[data-sonner-toaster][data-sonner-theme=dark] [data-description]{color:#e8e8e8}[data-sonner-toast][data-styled=true] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast][data-styled=true] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast][data-styled=true] [data-icon]>*{flex-shrink:0}[data-sonner-toast][data-styled=true] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast][data-styled=true] [data-content]{display:flex;flex-direction:column;gap:2px}[data-sonner-toast][data-styled=true] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;font-weight:500;cursor:pointer;outline:0;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast][data-styled=true] [data-button]:focus-visible{box-shadow:0 0 0 2px rgba(0,0,0,.4)}[data-sonner-toast][data-styled=true] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast][data-styled=true] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-styled=true] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast][data-styled=true] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;color:var(--gray12);background:var(--normal-bg);border:1px solid var(--gray4);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast][data-styled=true] [data-close-button]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-styled=true] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast][data-styled=true]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]::before{content:'';position:absolute;left:-100%;right:-100%;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]::before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]::before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]::before{content:'';position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast][data-expanded=true]::after{content:'';position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y:translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale:var(--toasts-before) * 0.05 + 1;--y:translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-x-position=right]{right:0}[data-sonner-toast][data-x-position=left]{left:0}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y:translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y:translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]::before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount-y,0)) translateX(var(--swipe-amount-x,0));transition:none}[data-sonner-toast][data-swiped=true]{user-select:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation-duration:.2s;animation-timing-function:ease-out;animation-fill-mode:forwards}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=left]{animation-name:swipe-out-left}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=right]{animation-name:swipe-out-right}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=up]{animation-name:swipe-out-up}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=down]{animation-name:swipe-out-down}@keyframes swipe-out-left{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) - 100%));opacity:0}}@keyframes swipe-out-right{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) + 100%));opacity:0}}@keyframes swipe-out-up{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) - 100%));opacity:0}}@keyframes swipe-out-down{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) + 100%));opacity:0}}@media (max-width:600px){[data-sonner-toaster]{position:fixed;right:var(--mobile-offset-right);left:var(--mobile-offset-left);width:100%}[data-sonner-toaster][dir=rtl]{left:calc(var(--mobile-offset-left) * -1)}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - var(--mobile-offset-left) * 2)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset-left)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--mobile-offset-bottom)}[data-sonner-toaster][data-y-position=top]{top:var(--mobile-offset-top)}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset-left);right:var(--mobile-offset-right);transform:none}}[data-sonner-toaster][data-sonner-theme=light]{--normal-bg:#fff;--normal-border:var(--gray4);--normal-text:var(--gray12);--success-bg:hsl(143, 85%, 96%);--success-border:hsl(145, 92%, 87%);--success-text:hsl(140, 100%, 27%);--info-bg:hsl(208, 100%, 97%);--info-border:hsl(221, 91%, 93%);--info-text:hsl(210, 92%, 45%);--warning-bg:hsl(49, 100%, 97%);--warning-border:hsl(49, 91%, 84%);--warning-text:hsl(31, 92%, 45%);--error-bg:hsl(359, 100%, 97%);--error-border:hsl(359, 100%, 94%);--error-text:hsl(360, 100%, 45%)}[data-sonner-toaster][data-sonner-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg:#000;--normal-border:hsl(0, 0%, 20%);--normal-text:var(--gray1)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg:#fff;--normal-border:var(--gray3);--normal-text:var(--gray12)}[data-sonner-toaster][data-sonner-theme=dark]{--normal-bg:#000;--normal-bg-hover:hsl(0, 0%, 12%);--normal-border:hsl(0, 0%, 20%);--normal-border-hover:hsl(0, 0%, 25%);--normal-text:var(--gray1);--success-bg:hsl(150, 100%, 6%);--success-border:hsl(147, 100%, 12%);--success-text:hsl(150, 86%, 65%);--info-bg:hsl(215, 100%, 6%);--info-border:hsl(223, 43%, 17%);--info-text:hsl(216, 87%, 65%);--warning-bg:hsl(64, 100%, 6%);--warning-border:hsl(60, 100%, 9%);--warning-text:hsl(46, 87%, 65%);--error-bg:hsl(358, 76%, 10%);--error-border:hsl(357, 89%, 16%);--error-text:hsl(358, 100%, 81%)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]{background:var(--normal-bg);border-color:var(--normal-border);color:var(--normal-text)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]:hover{background:var(--normal-bg-hover);border-color:var(--normal-border-hover)}[data-rich-colors=true][data-sonner-toast][data-type=success]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=info]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=error]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}[data-rich-colors=true][data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size:16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:first-child{animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}100%{opacity:.15}}@media (prefers-reduced-motion){.sonner-loading-bar,[data-sonner-toast],[data-sonner-toast]>*{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}"
			)
		})
	var lh = y(() => {
		'use client'
		nh()
		sh()
		B()
	})
	var aw,
		Xi = y(() => {
			So()
			pe()
			B()
			aw = Gt(
				"inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				{
					variants: {
						variant: {
							default: 'bg-transparent',
							outline:
								'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground'
						},
						size: { default: 'h-9 min-w-9 px-2', sm: 'h-8 min-w-8 px-1.5', lg: 'h-10 min-w-10 px-2.5' }
					},
					defaultVariants: { variant: 'default', size: 'default' }
				}
			)
		})
	var UM,
		ih = y(() => {
			'use client'
			Q()
			pe()
			Xi()
			B()
			UM = Ee({ size: 'default', variant: 'default', spacing: 0 })
		})
	var Ki = y(() => {
		iu()
		pe()
		Du()
		gm()
		Zo()
		vm()
		Fm()
		bi()
		Nm()
		zm()
		Hm()
		Um()
		Gm()
		jm()
		Ym()
		tg()
		ag()
		rg()
		sg()
		fg()
		pg()
		mg()
		gg()
		hg()
		xg()
		vg()
		Cg()
		bg()
		Lg()
		Ig()
		rh()
		lh()
		Xi()
		ih()
	})
	function dh(e) {
		let t = null,
			a = 0,
			o = null,
			r = new Map(),
			n = new Set(),
			l = new Set(),
			i = { enabled: !1, production: !0 },
			u = {
				debug(g, p) {
					d() && console.debug(`[${e}] ${g}`, Vn(p))
				},
				info(g, p) {
					d() && console.info(`[${e}] ${g}`, Vn(p))
				},
				warn(g, p) {
					console.warn(`[${e}] ${g}`, Vn(p))
				},
				error(g, p) {
					console.error(`[${e}] ${g}`, Vn(p))
				}
			}
		function d() {
			let g = window.localStorage?.getItem(`xpert.debug.${e}`)
			return g === '0'
				? !1
				: g === '1'
					? !0
					: new URLSearchParams(window.location.search).get('xpertDebug') === e || i.enabled
		}
		function c(g, p = {}) {
			;(!t && g !== 'ready') ||
				window.parent.postMessage({ channel: uh, protocolVersion: 1, instanceId: t, type: g, ...p }, '*')
		}
		function f(g, p = {}) {
			let x = String(++a)
			return new Promise((v, C) => {
				let b = window.setTimeout(() => {
					r.delete(x) && C(new Error(`Remote request '${g}' timed out.`))
				}, 3e4)
				;(r.set(x, {
					resolve(L) {
						;(window.clearTimeout(b), v(L))
					},
					reject(L) {
						;(window.clearTimeout(b), C(L))
					}
				}),
					c(g, { requestId: x, ...p }))
			})
		}
		function m(g) {
			if (g.source !== window.parent || !St(g.data)) return
			let p = g.data
			if (Z(p, 'channel') !== uh || dr(p, 'protocolVersion') !== 1) return
			let x = Z(p, 'type')
			if (x === 'init') {
				;((t = Z(p, 'instanceId') ?? null),
					(o = rw(p)),
					(i = o.debug ?? i),
					(document.documentElement.lang = o.locale),
					u.info('bridge.init', { locale: o.locale, viewKey: Z(o.manifest, 'key') }))
				for (let b of n) b(o)
				h()
				return
			}
			if (Z(p, 'instanceId') !== t) return
			if (x === 'hostEvent') {
				let b = nw(p.event)
				if (b) {
					u.debug('host-event.received', { type: b.type, toolName: b.toolName })
					for (let L of l) L(b)
				}
				return
			}
			let v = Z(p, 'requestId')
			if (!v) return
			let C = r.get(v)
			C &&
				(r.delete(v),
				x === 'error' ? C.reject(new Error(Z(p, 'message') ?? 'Remote request failed.')) : C.resolve(p))
		}
		return (
			window.addEventListener('message', m),
			{
				logger: u,
				ready() {
					c('ready')
				},
				destroy() {
					window.removeEventListener('message', m)
					for (let g of r.values()) g.reject(new Error('Remote component bridge was destroyed.'))
					;(r.clear(), n.clear(), l.clear())
				},
				subscribeContext(g) {
					return (
						n.add(g),
						o && g(o),
						() => {
							n.delete(g)
						}
					)
				},
				subscribeHostEvents(g) {
					return (
						l.add(g),
						() => {
							l.delete(g)
						}
					)
				},
				requestData(g) {
					return (
						u.debug('request-data.started', { modelId: Z(me(g, 'parameters'), 'modelId') }),
						f('requestData', { query: g })
					)
				},
				requestParameterOptions(g, p) {
					return f('requestParameterOptions', { parameterKey: g, query: p })
				},
				executeAction(g, p = {}) {
					return (
						u.debug('execute-action.started', { actionKey: g, targetId: p.targetId }),
						f('executeAction', {
							actionKey: g,
							targetId: p.targetId,
							input: p.input,
							parameters: p.parameters
						})
					)
				},
				async executeFileAction(g, p, x = {}) {
					return (
						u.debug('execute-file-action.started', { actionKey: g, fileName: p.name, fileSize: p.size }),
						f('executeFileAction', {
							actionKey: g,
							targetId: x.targetId,
							input: x.input,
							parameters: x.parameters,
							file: { name: p.name, type: p.type, size: p.size, buffer: await p.arrayBuffer() }
						})
					)
				},
				notify(g, p) {
					c('notify', { level: g, message: p })
				},
				reportResize: h
			}
		)
		function h() {
			let g = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1e5)
			c('resize', { height: g, viewportBound: !0 })
		}
	}
	function ch(e) {
		let t = me(e.payload, 'parameters') ?? {}
		return {
			page: dr(e.initialQuery, 'page') ?? 1,
			pageSize: dr(e.initialQuery, 'pageSize') ?? 50,
			search: Z(e.initialQuery, 'search'),
			parameters: { ...t, ...(me(e.initialQuery, 'parameters') ?? {}) }
		}
	}
	function fh(e) {
		let t = document.documentElement,
			a = St(e) ? e : void 0,
			r =
				(typeof e == 'string' ? e : (Z(a, 'mode') ?? Z(a, 'name') ?? Z(a, 'scheme')))
					?.toLowerCase()
					.includes('dark') ?? !1
		;((t.dataset.theme = r ? 'dark' : 'light'),
			t.classList.toggle('dark', r),
			(t.style.colorScheme = r ? 'dark' : 'light'))
		let n = me(a, 'tokens')
		if (n)
			for (let [l, i] of Object.entries(n))
				(typeof i == 'string' || typeof i == 'number') && t.style.setProperty(`--xui-${sw(l)}`, String(i))
	}
	function ph(e) {
		return me(e, 'data') ?? {}
	}
	function Gn(e) {
		return me(e, 'result') ?? {}
	}
	function Wn(e, t, a) {
		if (typeof e == 'string') return e
		if (!St(e)) return a
		let r = ow(t) === 'zh-Hans' ? 'zh_Hans' : 'en_US',
			n = r === 'zh_Hans' ? 'en_US' : 'zh_Hans'
		return Z(e, r) ?? Z(e, n) ?? a
	}
	function ow(e) {
		let t = (e ?? '').split('_').join('-')
		return (
			{
				en: 'en-US',
				'en-US': 'en-US',
				'en-GB': 'en-US',
				zh: 'zh-Hans',
				'zh-CN': 'zh-Hans',
				'zh-SG': 'zh-Hans',
				'zh-Hans': 'zh-Hans',
				'zh-TW': 'zh-Hant',
				'zh-HK': 'zh-Hant',
				'zh-MO': 'zh-Hant',
				'zh-Hant': 'zh-Hant'
			}[t] ?? 'en-US'
		)
	}
	function St(e) {
		return !!e && typeof e == 'object' && !Array.isArray(e)
	}
	function me(e, t) {
		let a = e?.[t]
		return St(a) ? a : void 0
	}
	function Z(e, t) {
		let a = e?.[t]
		return typeof a == 'string' ? a : void 0
	}
	function dr(e, t) {
		let a = e?.[t]
		return typeof a == 'number' && Number.isFinite(a) ? a : void 0
	}
	function cr(e, t) {
		let a = e?.[t]
		return typeof a == 'boolean' ? a : void 0
	}
	function ho(e, t) {
		let a = e?.[t]
		return Array.isArray(a) ? a : []
	}
	function rw(e) {
		let t = me(e, 'debug')
		return {
			manifest: me(e, 'manifest') ?? {},
			payload: me(e, 'payload') ?? {},
			initialQuery: me(e, 'initialQuery') ?? {},
			locale: Z(e, 'locale') ?? 'en-US',
			theme: e.theme,
			debug: t ? { enabled: cr(t, 'enabled') ?? !1, production: cr(t, 'production') ?? !0 } : void 0
		}
	}
	function nw(e) {
		return St(e)
			? {
					id: Z(e, 'id'),
					type: Z(e, 'type'),
					source: Z(e, 'source'),
					toolName: Z(e, 'toolName'),
					data: me(e, 'data')
				}
			: null
	}
	function Vn(e) {
		if (!e) return
		let t = {}
		for (let [a, o] of Object.entries(e))
			/token|credential|secret|tenant|organization/i.test(a)
				? (t[a] = '[redacted]')
				: typeof o == 'string' && o.length > 300
					? (t[a] = `${o.slice(0, 300)}\u2026`)
					: Array.isArray(o) && o.length > 20
						? (t[a] = `[${o.length} items]`)
						: (t[a] = o)
		return t
	}
	function sw(e) {
		return e
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.replace(/[\s_]+/g, '-')
			.toLowerCase()
	}
	var uh,
		$i = y(() => {
			uh = 'xpertai.remote_component'
		})
	function mh(e) {
		return ho(e, 'items')
			.filter(St)
			.map((t) => ({ value: Ji(t.value), label: Z(t, 'label') ?? Ji(t.value), description: Z(t, 'description') }))
			.filter((t) => t.value)
	}
	function gh(e) {
		return {
			items: ho(e, 'items').filter(St).map(lw),
			total: dr(e, 'total') ?? 0,
			scopeSummary: Z(me(e, 'meta'), 'scopeSummary')
		}
	}
	function lw(e) {
		return {
			id: Ji(e.id),
			code: Z(e, 'code') ?? '',
			name: Z(e, 'name') ?? '',
			type: Z(e, 'type') ?? 'BASIC',
			status: Z(e, 'status') ?? 'DRAFT',
			modelId: Z(e, 'modelId'),
			modelName: Z(e, 'modelName'),
			businessAreaId: Z(e, 'businessAreaId'),
			businessAreaName: Z(e, 'businessAreaName'),
			certificationId: Z(e, 'certificationId'),
			certificationName: Z(e, 'certificationName'),
			entity: Z(e, 'entity'),
			business: Z(e, 'business'),
			unit: Z(e, 'unit'),
			principal: Z(e, 'principal'),
			validity: Z(e, 'validity'),
			isApplication: cr(e, 'isApplication') ?? !1,
			embeddingStatus: Z(e, 'embeddingStatus'),
			error: Z(e, 'error'),
			visible: cr(e, 'visible') ?? !0,
			updatedAt: Z(e, 'updatedAt'),
			tags: ho(e, 'tags')
				.filter(St)
				.map((t) => ({ id: Z(t, 'id'), name: Z(t, 'name'), color: Z(t, 'color') })),
			draft: me(e, 'draft'),
			options: me(e, 'options')
		}
	}
	function hh(e) {
		let t = e.options ?? me(e.draft, 'options') ?? {},
			a = ho(t, 'dimensions').filter((r) => typeof r == 'string'),
			o = ho(t, 'filters')
		return {
			code: e.code,
			name: e.name,
			type: e.type === 'DERIVE' ? 'DERIVE' : 'BASIC',
			modelId: e.modelId ?? '',
			businessAreaId: e.businessAreaId ?? '',
			cube: e.entity ?? '',
			description: e.business ?? '',
			business: e.business ?? '',
			calendar: Z(t, 'calendar') ?? '',
			measure: Z(t, 'measure') ?? '',
			formula: Z(t, 'formula') ?? '',
			aggregator: Z(t, 'aggregator') ?? 'sum',
			dimensionsText: a.join(', '),
			filtersText: JSON.stringify(o, null, 2),
			unit: e.unit ?? '',
			certificationId: e.certificationId ?? '',
			principal: e.principal ?? '',
			validity: e.validity ?? '',
			visible: e.visible,
			isApplication: e.isApplication
		}
	}
	function xh(e) {
		let t = JSON.parse(e.filtersText || '[]')
		if (!Array.isArray(t)) throw new Error('Filters must be a JSON array.')
		return {
			code: e.code.trim(),
			name: e.name.trim(),
			type: e.type,
			modelId: e.modelId || void 0,
			businessAreaId: e.businessAreaId || void 0,
			cube: e.cube.trim() || void 0,
			entity: e.cube.trim() || void 0,
			description: e.description.trim() || void 0,
			business: e.business.trim() || e.description.trim() || void 0,
			calendar: e.calendar.trim() || void 0,
			measure: e.measure.trim() || void 0,
			formula: e.formula.trim() || void 0,
			aggregator: e.aggregator.trim() || void 0,
			dimensions: e.dimensionsText
				.split(',')
				.map((a) => a.trim())
				.filter(Boolean),
			filters: t.filter(St),
			unit: e.unit.trim() || void 0,
			certificationId: e.certificationId || void 0,
			principal: e.principal.trim() || void 0,
			validity: e.validity.trim() || void 0,
			visible: e.visible,
			isApplication: e.isApplication
		}
	}
	function F(e, t, a) {
		return e?.toLowerCase().startsWith('zh') ? a : t
	}
	function Ji(e) {
		return typeof e == 'string' || typeof e == 'number' || typeof e == 'boolean' ? String(e) : ''
	}
	var Yi,
		Zi = y(() => {
			$i()
			Yi = () => ({
				code: '',
				name: '',
				type: 'BASIC',
				modelId: '',
				businessAreaId: '',
				cube: '',
				description: '',
				business: '',
				calendar: '',
				measure: '',
				formula: '',
				aggregator: 'sum',
				dimensionsText: '',
				filtersText: '[]',
				unit: '',
				certificationId: '',
				principal: '',
				validity: '',
				visible: !0,
				isApplication: !1
			})
		})
	function Ch(e) {
		function t(a, o) {
			e.onChange({ ...e.form, [a]: o })
		}
		return s(gi, {
			open: e.open,
			onOpenChange: e.onOpenChange,
			children: D(hi, {
				className: 'max-h-[92vh] max-w-4xl overflow-hidden',
				children: [
					D(xi, {
						children: [
							s(vi, {
								children:
									e.mode === 'create'
										? F(
												e.locale,
												'Create governed metric',
												'\u521B\u5EFA\u53D7\u6CBB\u7406\u6307\u6807'
											)
										: F(
												e.locale,
												'Edit governed metric',
												'\u7F16\u8F91\u53D7\u6CBB\u7406\u6307\u6807'
											)
							}),
							s(Ci, {
								children: F(
									e.locale,
									'Define business identity, semantic logic, and governance metadata in one draft.',
									'\u5728\u540C\u4E00\u4E2A\u8349\u7A3F\u4E2D\u5B9A\u4E49\u4E1A\u52A1\u6807\u8BC6\u3001\u8BED\u4E49\u903B\u8F91\u548C\u6CBB\u7406\u5143\u6570\u636E\u3002'
								)
							})
						]
					}),
					D(qm, {
						defaultValue: 'definition',
						className: 'min-h-0',
						children: [
							D(Vm, {
								className: 'w-full justify-start',
								children: [
									s(Nn, { value: 'definition', children: F(e.locale, 'Definition', '\u5B9A\u4E49') }),
									s(Nn, {
										value: 'logic',
										children: F(e.locale, 'Semantic logic', '\u8BED\u4E49\u903B\u8F91')
									}),
									s(Nn, { value: 'governance', children: F(e.locale, 'Governance', '\u6CBB\u7406') })
								]
							}),
							D('div', {
								className: 'max-h-[62vh] overflow-y-auto py-4',
								children: [
									D(_n, {
										value: 'definition',
										className: 'mt-0 grid gap-4 lg:grid-cols-2',
										children: [
											s(zt, {
												label: F(e.locale, 'Metric code', '\u6307\u6807\u7F16\u7801'),
												required: !0,
												value: e.form.code,
												onChange: (a) => t('code', a)
											}),
											s(zt, {
												label: F(e.locale, 'Metric name', '\u6307\u6807\u540D\u79F0'),
												required: !0,
												value: e.form.name,
												onChange: (a) => t('name', a)
											}),
											s(fr, {
												label: F(e.locale, 'Metric type', '\u6307\u6807\u7C7B\u578B'),
												value: e.form.type,
												options: [
													{
														value: 'BASIC',
														label: F(e.locale, 'Basic metric', '\u57FA\u7840\u6307\u6807')
													},
													{
														value: 'DERIVE',
														label: F(e.locale, 'Derived metric', '\u6D3E\u751F\u6307\u6807')
													}
												],
												onChange: (a) => t('type', a === 'DERIVE' ? 'DERIVE' : 'BASIC')
											}),
											s(fr, {
												label: F(e.locale, 'Semantic model', '\u8BED\u4E49\u6A21\u578B'),
												value: e.form.modelId,
												options: e.models,
												placeholder: F(e.locale, 'Choose model', '\u9009\u62E9\u6A21\u578B'),
												onChange: (a) => t('modelId', a)
											}),
											s(zt, {
												label: F(e.locale, 'Cube / entity', 'Cube / \u5B9E\u4F53'),
												value: e.form.cube,
												onChange: (a) => t('cube', a)
											}),
											s(fr, {
												label: F(e.locale, 'Business area', '\u4E1A\u52A1\u57DF'),
												value: e.form.businessAreaId,
												options: e.businessAreas,
												placeholder: F(
													e.locale,
													'Choose business area',
													'\u9009\u62E9\u4E1A\u52A1\u57DF'
												),
												onChange: (a) => t('businessAreaId', a)
											}),
											s('div', {
												className: 'lg:col-span-2',
												children: s(jn, {
													label: F(e.locale, 'Description', '\u63CF\u8FF0'),
													value: e.form.description,
													onChange: (a) => t('description', a)
												})
											}),
											s('div', {
												className: 'lg:col-span-2',
												children: s(jn, {
													label: F(
														e.locale,
														'Business definition',
														'\u4E1A\u52A1\u53E3\u5F84'
													),
													value: e.form.business,
													onChange: (a) => t('business', a)
												})
											})
										]
									}),
									D(_n, {
										value: 'logic',
										className: 'mt-0 grid gap-4 lg:grid-cols-2',
										children: [
											s(zt, {
												label: F(e.locale, 'Base measure', '\u57FA\u7840\u5EA6\u91CF'),
												value: e.form.measure,
												onChange: (a) => t('measure', a)
											}),
											s(fr, {
												label: F(e.locale, 'SQL aggregator', 'SQL \u805A\u5408\u5668'),
												value: e.form.aggregator,
												options: ['sum', 'count', 'min', 'max', 'avg', 'distinct-count'].map(
													(a) => ({ value: a, label: a })
												),
												onChange: (a) => t('aggregator', a)
											}),
											s(zt, {
												label: F(e.locale, 'Calendar', '\u65E5\u5386'),
												value: e.form.calendar,
												onChange: (a) => t('calendar', a)
											}),
											s(zt, {
												label: F(e.locale, 'Unit', '\u5355\u4F4D'),
												value: e.form.unit,
												onChange: (a) => t('unit', a)
											}),
											s('div', {
												className: 'lg:col-span-2',
												children: s(jn, {
													label: F(
														e.locale,
														'Formula / MDX expression',
														'\u516C\u5F0F / MDX \u8868\u8FBE\u5F0F'
													),
													value: e.form.formula,
													className: 'min-h-28 font-mono',
													onChange: (a) => t('formula', a)
												})
											}),
											s('div', {
												className: 'lg:col-span-2',
												children: s(zt, {
													label: F(
														e.locale,
														'Free dimensions (comma separated)',
														'\u81EA\u7531\u7EF4\u5EA6\uFF08\u9017\u53F7\u5206\u9694\uFF09'
													),
													value: e.form.dimensionsText,
													onChange: (a) => t('dimensionsText', a)
												})
											}),
											s('div', {
												className: 'lg:col-span-2',
												children: s(jn, {
													label: F(e.locale, 'Filters JSON', '\u8FC7\u6EE4\u6761\u4EF6 JSON'),
													value: e.form.filtersText,
													className: 'min-h-32 font-mono text-xs',
													onChange: (a) => t('filtersText', a)
												})
											})
										]
									}),
									D(_n, {
										value: 'governance',
										className: 'mt-0 grid gap-4 lg:grid-cols-2',
										children: [
											s(fr, {
												label: F(e.locale, 'Certification', '\u8BA4\u8BC1'),
												value: e.form.certificationId,
												options: e.certifications,
												placeholder: F(
													e.locale,
													'Choose certification',
													'\u9009\u62E9\u8BA4\u8BC1'
												),
												onChange: (a) => t('certificationId', a)
											}),
											s(zt, {
												label: F(e.locale, 'Principal', '\u8D1F\u8D23\u4EBA'),
												value: e.form.principal,
												onChange: (a) => t('principal', a)
											}),
											s(zt, {
												label: F(e.locale, 'Validity', '\u6709\u6548\u671F'),
												value: e.form.validity,
												onChange: (a) => t('validity', a)
											}),
											D('div', {
												className: 'grid gap-2',
												children: [
													s(vh, {
														label: F(
															e.locale,
															'Visible in catalog',
															'\u5728\u76EE\u5F55\u4E2D\u53EF\u89C1'
														),
														checked: e.form.visible,
														onChange: (a) => t('visible', a)
													}),
													s(vh, {
														label: F(
															e.locale,
															'Available to Agentic Apps',
															'\u53EF\u7528\u4E8E Agentic Apps'
														),
														checked: e.form.isApplication,
														onChange: (a) => t('isApplication', a)
													})
												]
											})
										]
									})
								]
							})
						]
					}),
					D(Bm, {
						children: [
							s(je, {
								variant: 'outline',
								onClick: () => e.onOpenChange(!1),
								children: F(e.locale, 'Cancel', '\u53D6\u6D88')
							}),
							s(je, {
								disabled: e.busy || !e.form.code.trim() || !e.form.name.trim(),
								onClick: e.onSubmit,
								children: e.busy
									? F(e.locale, 'Saving\u2026', '\u4FDD\u5B58\u4E2D\u2026')
									: e.mode === 'create'
										? F(e.locale, 'Create draft', '\u521B\u5EFA\u8349\u7A3F')
										: F(e.locale, 'Save changes', '\u4FDD\u5B58\u53D8\u66F4')
							})
						]
					})
				]
			})
		})
	}
	function zt(e) {
		let t = Na()
		return D('div', {
			className: 'grid gap-1.5',
			children: [
				s(sr, { htmlFor: t, children: e.label }),
				s(Bn, {
					id: t,
					required: e.required,
					value: e.value,
					onChange: (a) => e.onChange(a.currentTarget.value)
				})
			]
		})
	}
	function jn(e) {
		let t = Na()
		return D('div', {
			className: 'grid gap-1.5',
			children: [
				s(sr, { htmlFor: t, children: e.label }),
				s(Wm, {
					id: t,
					className: e.className,
					value: e.value,
					onChange: (a) => e.onChange(a.currentTarget.value)
				})
			]
		})
	}
	function fr(e) {
		return D('div', {
			className: 'grid gap-1.5',
			children: [
				s(sr, { children: e.label }),
				D(ar, {
					value: e.value,
					onValueChange: e.onChange,
					children: [
						s(rr, { children: s(or, { placeholder: e.placeholder }) }),
						s(nr, { children: e.options.map((t) => s(uo, { value: t.value, children: t.label }, t.value)) })
					]
				})
			]
		})
	}
	function vh(e) {
		return D('div', {
			className: 'flex min-h-10 items-center justify-between rounded-md border px-3',
			children: [s(sr, { children: e.label }), s(og, { checked: e.checked, onCheckedChange: e.onChange })]
		})
	}
	var bh = y(() => {
		Q()
		Ki()
		Zi()
		B()
	})
	var mw = Dh(() => {
		Q()
		su()
		Ki()
		$i()
		bh()
		Zi()
		B()
		var Ht = dh('datax-metric-management')
		function iw() {
			let [e, t] = T(null),
				[a, o] = T({ page: 1, pageSize: 20, parameters: {} }),
				[r, n] = T([]),
				[l, i] = T([]),
				[u, d] = T([]),
				[c, f] = T([]),
				[m, h] = T([]),
				[g, p] = T([]),
				[x, v] = T({ items: [], total: 0 }),
				[C, b] = T(''),
				[L, I] = T(!1),
				[k, P] = T(''),
				[R, O] = T(null),
				[U, N] = T([]),
				[V, K] = T(!1),
				[W, ee] = T('create'),
				[X, oe] = T(null),
				[M, z] = T(Yi),
				[re, ue] = T(null),
				[Se, ie] = T(!1),
				[ce, ke] = T(null),
				fe = w(null)
			;(E(
				() =>
					Ht.subscribeContext((A) => {
						;(fh(A.theme), lu({ density: 'compact' }), t(A))
						let $ = ch(A)
						;(o($), H($))
					}),
				[]
			),
				E(
					() =>
						Ht.subscribeHostEvents((A) => {
							Ph(A)
						}),
					[a]
				),
				E(() => {
					Ht.reportResize()
				}, [x, R, V, ce]))
			async function H(A) {
				I(!0)
				try {
					let $ = me(A, 'parameters') ?? {},
						[he, nt, Kn, Ah] = await Promise.all([
							se('projectId', $),
							se('status', $),
							se('type', $),
							se('certificationId', $)
						])
					;(n(he), f(nt), h(Kn), p(Ah))
					let tu = Z($, 'projectId') ?? he[0]?.value
					if (!tu) {
						v({ items: [], total: 0 })
						return
					}
					let $n = pr(A, 'projectId', tu)
					;(o($n), await Ce($n), await ne($n))
				} catch ($) {
					Ut($)
				} finally {
					I(!1)
				}
			}
			async function se(A, $, he) {
				let nt = await Ht.requestParameterOptions(A, { parameters: $, search: he })
				return mh(Gn(nt))
			}
			async function Ce(A) {
				let $ = me(A, 'parameters') ?? {},
					[he, nt] = await Promise.all([se('modelId', $), se('businessAreaId', $)])
				;(i(he), d(nt))
			}
			async function ne(A = a) {
				if (!Z(me(A, 'parameters'), 'projectId')) {
					v({ items: [], total: 0 })
					return
				}
				I(!0)
				try {
					let he = await Ht.requestData(A)
					;(v(gh(ph(he))), N([]))
				} catch (he) {
					Ut(he)
				} finally {
					I(!1)
				}
			}
			async function ge(A) {
				let $ = pr(a, 'projectId', A)
				;(($ = pr($, 'modelId', '')),
					($ = pr($, 'businessAreaId', '')),
					($ = { ...$, page: 1 }),
					o($),
					i([]),
					d([]),
					await Ce($),
					await ne($))
			}
			async function xe(A, $) {
				let he = { ...pr(a, A, $ === '__all__' ? '' : $), page: 1 }
				;(o(he), await ne(he))
			}
			async function $e() {
				let A = { ...a, search: C.trim() || void 0, page: 1 }
				;(o(A), await ne(A))
			}
			async function Ne(A) {
				let $ = { ...a, page: A }
				;(o($), await ne($))
			}
			function Ea() {
				let A = me(a, 'parameters') ?? {}
				;(ee('create'),
					oe(null),
					z({ ...Yi(), modelId: Z(A, 'modelId') ?? '', businessAreaId: Z(A, 'businessAreaId') ?? '' }),
					K(!0))
			}
			function xo(A) {
				;(ee('edit'), oe(A), z(hh(A)), K(!0))
			}
			async function vo() {
				if (!Z(me(a, 'parameters'), 'projectId')) {
					O({
						error: !0,
						text: F(e?.locale, 'Choose a project first.', '\u8BF7\u5148\u9009\u62E9\u9879\u76EE\u3002')
					})
					return
				}
				P('editor')
				try {
					let $ = await Co(W === 'create' ? 'create' : 'edit', {
						targetId: X?.id,
						input: xh(M),
						parameters: me(a, 'parameters')
					})
					;(K(!1), Oa($), await ne(a))
				} catch ($) {
					Ut($)
				} finally {
					P('')
				}
			}
			async function mr(A, $) {
				P(`${A}:${$.id}`)
				try {
					let he = await Co(A, { targetId: $.id, parameters: me(a, 'parameters') })
					;(Oa(he), await ne(a))
				} catch (he) {
					Ut(he)
				} finally {
					P('')
				}
			}
			async function Ih() {
				if (!re) return
				let A = re
				;(ue(null), await mr('delete', A))
			}
			async function Sh() {
				;(ie(!1), P('bulk-delete'))
				try {
					let A = await Co('bulk_delete', { input: { ids: U }, parameters: me(a, 'parameters') })
					;(Oa(A), await ne(a))
				} catch (A) {
					Ut(A)
				} finally {
					P('')
				}
			}
			async function wh() {
				P('export')
				try {
					let A = await Co('export', {
						input: { ids: U, page: a.page, pageSize: a.pageSize, search: a.search },
						parameters: me(a, 'parameters')
					})
					Oa(A)
					let $ = me(A, 'data'),
						he = Z($, 'content'),
						nt = Z($, 'fileName') ?? 'metrics.yaml',
						Kn = Z($, 'mimeType') ?? 'application/x-yaml'
					he && pw(nt, he, Kn)
				} catch (A) {
					Ut(A)
				} finally {
					P('')
				}
			}
			async function yh(A) {
				P('import')
				try {
					let $ = await Ht.executeFileAction('import', A, { parameters: me(a, 'parameters') }),
						he = Gn($)
					if (he.success !== !0)
						throw new Error(Wn(he.message, e?.locale ?? 'en-US', 'Metric import failed.'))
					;(Oa(he), await ne(a))
				} catch ($) {
					Ut($)
				} finally {
					;(P(''), fe.current && (fe.current.value = ''))
				}
			}
			async function Rh() {
				P('embed-project')
				try {
					let A = await Co('start_embedding_project', { parameters: me(a, 'parameters') })
					;(Oa(A), await ne(a))
				} catch (A) {
					Ut(A)
				} finally {
					P('')
				}
			}
			async function Co(A, $) {
				let he = await Ht.executeAction(A, $),
					nt = Gn(he)
				if (nt.success !== !0)
					throw new Error(
						Wn(
							nt.message,
							e?.locale ?? 'en-US',
							F(e?.locale, 'Action failed.', '\u64CD\u4F5C\u5931\u8D25\u3002')
						)
					)
				return nt
			}
			function Oa(A) {
				O({
					error: !1,
					text: Wn(
						A.message,
						e?.locale ?? 'en-US',
						F(e?.locale, 'Operation completed.', '\u64CD\u4F5C\u5DF2\u5B8C\u6210\u3002')
					)
				})
			}
			async function Ph(A) {
				A.type === 'assistant.tool.completed' && (await ne(a))
			}
			function Ut(A) {
				let $ = A instanceof Error ? A.message : String(A)
				;(O({ error: !0, text: $ }), Ht.logger.error('metric.operation.failed', { message: $ }))
			}
			let gr = me(a, 'parameters') ?? {},
				Xn = Z(gr, 'projectId') ?? '',
				bo = typeof a.page == 'number' ? a.page : 1,
				kh = typeof a.pageSize == 'number' ? a.pageSize : 20,
				eu = Math.max(1, Math.ceil(x.total / kh)),
				Th = x.items.length > 0 && x.items.every((A) => U.includes(A.id))
			return s(Xm, {
				children: D('div', {
					className: 'flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground',
					children: [
						D('header', {
							className: 'flex min-h-14 flex-wrap items-center gap-2 border-b bg-card px-4 py-2',
							children: [
								D('div', {
									className: 'mr-2 min-w-40',
									children: [
										s('div', {
											className: 'text-sm font-semibold',
											children: F(e?.locale, 'Metric Management', '\u6307\u6807\u7BA1\u7406')
										}),
										s('div', {
											className: 'text-xs text-muted-foreground',
											children: F(
												e?.locale,
												'Governed catalog & lifecycle',
												'\u53D7\u6CBB\u7406\u7684\u6307\u6807\u76EE\u5F55\u4E0E\u751F\u547D\u5468\u671F'
											)
										})
									]
								}),
								D(ar, {
									value: Xn,
									onValueChange: (A) => {
										ge(A)
									},
									children: [
										s(rr, {
											className: 'w-[240px]',
											children: s(or, {
												placeholder: F(e?.locale, 'Choose project', '\u9009\u62E9\u9879\u76EE')
											})
										}),
										s(nr, {
											children: r.map((A) =>
												s(uo, { value: A.value, children: A.label }, A.value)
											)
										})
									]
								}),
								s(je, {
									onClick: Ea,
									disabled: !Xn,
									children: F(e?.locale, 'New metric', '\u65B0\u5EFA\u6307\u6807')
								}),
								s(je, {
									variant: 'outline',
									disabled: L,
									onClick: () => {
										ne()
									},
									children: F(e?.locale, 'Refresh', '\u5237\u65B0')
								}),
								s('div', { className: 'flex-1' }),
								D(Ai, {
									children: [
										s(Mi, {
											asChild: !0,
											children: s(je, {
												variant: 'outline',
												children: F(e?.locale, 'Operations', '\u6279\u91CF\u64CD\u4F5C')
											})
										}),
										D(Di, {
											align: 'end',
											children: [
												s(bt, {
													disabled: !U.length,
													onSelect: () => {
														wh()
													},
													children: F(
														e?.locale,
														'Export selected',
														'\u5BFC\u51FA\u9009\u4E2D'
													)
												}),
												s(bt, {
													onSelect: () => fe.current?.click(),
													children: F(e?.locale, 'Import YAML', '\u5BFC\u5165 YAML')
												}),
												s(Ei, {}),
												s(bt, {
													onSelect: () => {
														Rh()
													},
													children: F(
														e?.locale,
														'Embed project',
														'\u9879\u76EE\u5168\u91CF\u5411\u91CF\u5316'
													)
												}),
												s(bt, {
													disabled: !U.length,
													className: 'text-destructive',
													onSelect: () => ie(!0),
													children: F(
														e?.locale,
														'Delete selected',
														'\u5220\u9664\u9009\u4E2D'
													)
												})
											]
										})
									]
								}),
								s('input', {
									ref: fe,
									className: 'hidden',
									type: 'file',
									accept: '.yaml,.yml,text/yaml,application/yaml',
									onChange: (A) => {
										let $ = A.currentTarget.files?.[0]
										$ && yh($)
									}
								})
							]
						}),
						D('div', {
							className: 'flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2',
							children: [
								D('div', {
									className: 'flex min-w-64 flex-1 gap-2',
									children: [
										s(Bn, {
											value: C,
											placeholder: F(
												e?.locale,
												'Search code, name, or definition\u2026',
												'\u641C\u7D22\u7F16\u7801\u3001\u540D\u79F0\u6216\u53E3\u5F84\u2026'
											),
											onChange: (A) => b(A.currentTarget.value),
											onKeyDown: (A) => {
												A.key === 'Enter' && $e()
											}
										}),
										s(je, {
											variant: 'outline',
											onClick: () => {
												$e()
											},
											children: F(e?.locale, 'Search', '\u641C\u7D22')
										})
									]
								}),
								s(Qi, {
									value: Z(gr, 'modelId') ?? '__all__',
									placeholder: F(e?.locale, 'All models', '\u5168\u90E8\u6A21\u578B'),
									options: l,
									onChange: (A) => {
										xe('modelId', A)
									}
								}),
								s(Qi, {
									value: Z(gr, 'status') ?? '__all__',
									placeholder: F(e?.locale, 'All statuses', '\u5168\u90E8\u72B6\u6001'),
									options: c,
									onChange: (A) => {
										xe('status', A)
									}
								}),
								s(Qi, {
									value: Z(gr, 'type') ?? '__all__',
									placeholder: F(e?.locale, 'All types', '\u5168\u90E8\u7C7B\u578B'),
									options: m,
									onChange: (A) => {
										xe('type', A)
									}
								})
							]
						}),
						R
							? s('div', {
									className: R.error
										? 'border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive'
										: 'border-b bg-primary/5 px-4 py-2 text-sm',
									children: R.text
								})
							: null,
						s('div', {
							className: 'min-h-0 flex-1 overflow-hidden',
							children:
								L && !x.items.length
									? s('div', {
											className: 'space-y-2 p-4',
											children: Array.from({ length: 9 }, (A, $) =>
												s(ng, { className: 'h-10 w-full' }, $)
											)
										})
									: Xn
										? x.items.length
											? s(_m, {
													className: 'h-full',
													children: D(Zm, {
														children: [
															s(Qm, {
																className: 'sticky top-0 z-20 bg-card',
																children: D(Li, {
																	children: [
																		s(vt, {
																			className: 'w-10',
																			children: s(mi, {
																				checked: Th,
																				onCheckedChange: (A) =>
																					N(
																						A === !0
																							? Array.from(
																									new Set([
																										...U,
																										...x.items.map(
																											($) => $.id
																										)
																									])
																								)
																							: U.filter(
																									($) =>
																										!x.items.some(
																											(he) =>
																												he.id ===
																												$
																										)
																								)
																					)
																			})
																		}),
																		s(vt, {
																			children: F(
																				e?.locale,
																				'Metric',
																				'\u6307\u6807'
																			)
																		}),
																		s(vt, {
																			children: F(
																				e?.locale,
																				'Type',
																				'\u7C7B\u578B'
																			)
																		}),
																		s(vt, {
																			children: F(
																				e?.locale,
																				'Model / Cube',
																				'\u6A21\u578B / Cube'
																			)
																		}),
																		s(vt, {
																			children: F(
																				e?.locale,
																				'Business area',
																				'\u4E1A\u52A1\u57DF'
																			)
																		}),
																		s(vt, {
																			children: F(
																				e?.locale,
																				'Status',
																				'\u72B6\u6001'
																			)
																		}),
																		s(vt, {
																			children: F(
																				e?.locale,
																				'Embedding',
																				'\u5411\u91CF\u72B6\u6001'
																			)
																		}),
																		s(vt, {
																			children: F(
																				e?.locale,
																				'Updated',
																				'\u66F4\u65B0\u65F6\u95F4'
																			)
																		}),
																		s(vt, { className: 'w-16' })
																	]
																})
															}),
															s(eg, {
																children: x.items.map((A) =>
																	D(
																		Li,
																		{
																			className: 'cursor-pointer',
																			onDoubleClick: () => ke(A),
																			children: [
																				s(Ct, {
																					children: s(mi, {
																						checked: U.includes(A.id),
																						onCheckedChange: ($) =>
																							N(
																								$ === !0
																									? Array.from(
																											new Set([
																												...U,
																												A.id
																											])
																										)
																									: U.filter(
																											(he) =>
																												he !==
																												A.id
																										)
																							)
																					})
																				}),
																				s(Ct, {
																					className: 'min-w-64',
																					children: D('button', {
																						className: 'block text-left',
																						type: 'button',
																						onClick: () => ke(A),
																						children: [
																							s('div', {
																								className:
																									'font-medium',
																								children:
																									A.name || A.code
																							}),
																							s('div', {
																								className:
																									'font-mono text-xs text-muted-foreground',
																								children: A.code
																							})
																						]
																					})
																				}),
																				s(Ct, {
																					children: s(En, {
																						variant: 'outline',
																						children: A.type
																					})
																				}),
																				D(Ct, {
																					children: [
																						s('div', {
																							className:
																								'max-w-52 truncate text-sm',
																							children:
																								A.modelName ?? '\u2014'
																						}),
																						s('div', {
																							className:
																								'max-w-52 truncate text-xs text-muted-foreground',
																							children:
																								A.entity ?? '\u2014'
																						})
																					]
																				}),
																				s(Ct, {
																					children:
																						A.businessAreaName ?? '\u2014'
																				}),
																				s(Ct, {
																					children: s(cw, { value: A.status })
																				}),
																				s(Ct, {
																					children: s(En, {
																						variant: 'secondary',
																						children:
																							A.embeddingStatus ??
																							'\u2014'
																					})
																				}),
																				s(Ct, {
																					className:
																						'whitespace-nowrap text-xs text-muted-foreground',
																					children: fw(A.updatedAt, e?.locale)
																				}),
																				s(Ct, {
																					children: s(uw, {
																						row: A,
																						busy: k,
																						locale: e?.locale,
																						onEdit: () => xo(A),
																						onDuplicate: () => {
																							mr('duplicate', A)
																						},
																						onPublish: () => {
																							mr('publish', A)
																						},
																						onEmbed: () => {
																							mr('embedding', A)
																						},
																						onDelete: () => ue(A)
																					})
																				})
																			]
																		},
																		A.id
																	)
																)
															})
														]
													})
												})
											: s('div', {
													className: 'grid h-full place-items-center',
													children: s(hm, {
														className: 'max-w-md',
														children: D(xm, {
															className: 'space-y-3 pt-6 text-center',
															children: [
																s('div', {
																	className: 'font-medium',
																	children: F(
																		e?.locale,
																		'No metrics found',
																		'\u672A\u627E\u5230\u6307\u6807'
																	)
																}),
																s('div', {
																	className: 'text-sm text-muted-foreground',
																	children: F(
																		e?.locale,
																		'Create the first governed metric in this scope.',
																		'\u5728\u5F53\u524D\u8303\u56F4\u5185\u521B\u5EFA\u7B2C\u4E00\u4E2A\u53D7\u6CBB\u7406\u6307\u6807\u3002'
																	)
																}),
																s(je, {
																	onClick: Ea,
																	children: F(
																		e?.locale,
																		'New metric',
																		'\u65B0\u5EFA\u6307\u6807'
																	)
																})
															]
														})
													})
												})
										: s('div', {
												className:
													'grid h-full place-items-center text-sm text-muted-foreground',
												children: F(
													e?.locale,
													'Choose a project to load its metric catalog.',
													'\u9009\u62E9\u9879\u76EE\u4EE5\u52A0\u8F7D\u6307\u6807\u76EE\u5F55\u3002'
												)
											})
						}),
						D('footer', {
							className: 'flex min-h-12 items-center justify-between gap-3 border-t bg-card px-4 text-sm',
							children: [
								s('div', {
									className: 'text-muted-foreground',
									children: F(
										e?.locale,
										`${x.total} metric(s) \xB7 ${U.length} selected`,
										`\u5171 ${x.total} \u4E2A\u6307\u6807 \xB7 \u5DF2\u9009\u62E9 ${U.length} \u4E2A`
									)
								}),
								D('div', {
									className: 'flex items-center gap-2',
									children: [
										D('span', {
											className: 'text-xs text-muted-foreground',
											children: [bo, ' / ', eu]
										}),
										s(je, {
											variant: 'outline',
											size: 'sm',
											disabled: bo <= 1 || L,
											onClick: () => {
												Ne(bo - 1)
											},
											children: F(e?.locale, 'Previous', '\u4E0A\u4E00\u9875')
										}),
										s(je, {
											variant: 'outline',
											size: 'sm',
											disabled: bo >= eu || L,
											onClick: () => {
												Ne(bo + 1)
											},
											children: F(e?.locale, 'Next', '\u4E0B\u4E00\u9875')
										})
									]
								})
							]
						}),
						s(Ch, {
							open: V,
							mode: W,
							form: M,
							models: l,
							businessAreas: u,
							certifications: g,
							busy: k === 'editor',
							locale: e?.locale,
							onOpenChange: K,
							onChange: z,
							onSubmit: () => {
								vo()
							}
						}),
						s(dw, { row: ce, locale: e?.locale, onOpenChange: (A) => !A && ke(null) }),
						s(Ii, {
							open: !!re,
							onOpenChange: (A) => !A && ue(null),
							children: D(Si, {
								children: [
									D(wi, {
										children: [
											s(Ri, {
												children: F(
													e?.locale,
													'Delete metric?',
													'\u5220\u9664\u6307\u6807\uFF1F'
												)
											}),
											s(Pi, {
												children: F(
													e?.locale,
													`This permanently deletes '${re?.name ?? re?.code ?? ''}'.`,
													`\u8FD9\u4F1A\u6C38\u4E45\u5220\u9664\u201C${re?.name ?? re?.code ?? ''}\u201D\u3002`
												)
											})
										]
									}),
									D(yi, {
										children: [
											s(Ti, { children: F(e?.locale, 'Cancel', '\u53D6\u6D88') }),
											s(ki, {
												onClick: () => {
													Ih()
												},
												children: F(e?.locale, 'Delete', '\u5220\u9664')
											})
										]
									})
								]
							})
						}),
						s(Ii, {
							open: Se,
							onOpenChange: ie,
							children: D(Si, {
								children: [
									D(wi, {
										children: [
											s(Ri, {
												children: F(
													e?.locale,
													'Delete selected metrics?',
													'\u5220\u9664\u9009\u4E2D\u6307\u6807\uFF1F'
												)
											}),
											s(Pi, {
												children: F(
													e?.locale,
													`This permanently deletes ${U.length} metric(s).`,
													`\u8FD9\u4F1A\u6C38\u4E45\u5220\u9664 ${U.length} \u4E2A\u6307\u6807\u3002`
												)
											})
										]
									}),
									D(yi, {
										children: [
											s(Ti, { children: F(e?.locale, 'Cancel', '\u53D6\u6D88') }),
											s(ki, {
												onClick: () => {
													Sh()
												},
												children: F(e?.locale, 'Delete selected', '\u5220\u9664\u9009\u4E2D')
											})
										]
									})
								]
							})
						})
					]
				})
			})
		}
		function Qi(e) {
			return D(ar, {
				value: e.value,
				onValueChange: e.onChange,
				children: [
					s(rr, { className: 'w-[180px]', children: s(or, { placeholder: e.placeholder }) }),
					D(nr, {
						children: [
							s(uo, { value: '__all__', children: e.placeholder }),
							e.options.map((t) => s(uo, { value: t.value, children: t.label }, t.value))
						]
					})
				]
			})
		}
		function uw(e) {
			let t = e.busy.endsWith(`:${e.row.id}`)
			return D(Ai, {
				children: [
					D(Km, {
						children: [
							s($m, {
								asChild: !0,
								children: s(Mi, {
									asChild: !0,
									children: s(je, {
										variant: 'ghost',
										size: 'sm',
										disabled: t,
										children: '\u2022\u2022\u2022'
									})
								})
							}),
							s(Jm, { children: F(e.locale, 'Metric actions', '\u6307\u6807\u64CD\u4F5C') })
						]
					}),
					D(Di, {
						align: 'end',
						children: [
							s(bt, { onSelect: e.onEdit, children: F(e.locale, 'Edit', '\u7F16\u8F91') }),
							s(bt, { onSelect: e.onDuplicate, children: F(e.locale, 'Duplicate', '\u590D\u5236') }),
							s(bt, { onSelect: e.onPublish, children: F(e.locale, 'Publish', '\u53D1\u5E03') }),
							s(bt, { onSelect: e.onEmbed, children: F(e.locale, 'Embed', '\u5411\u91CF\u5316') }),
							s(Ei, {}),
							s(bt, {
								className: 'text-destructive',
								onSelect: e.onDelete,
								children: F(e.locale, 'Delete', '\u5220\u9664')
							})
						]
					})
				]
			})
		}
		function dw(e) {
			let t = e.row
			return s(lg, {
				open: !!t,
				onOpenChange: e.onOpenChange,
				children: D(ig, {
					className: 'w-full overflow-y-auto sm:max-w-xl',
					children: [
						D(ug, {
							children: [
								s(dg, {
									children: t?.name ?? F(e.locale, 'Metric details', '\u6307\u6807\u8BE6\u60C5')
								}),
								s(cg, { className: 'font-mono', children: t?.code })
							]
						}),
						t
							? D('div', {
									className: 'grid gap-4 p-4',
									children: [
										s(wt, {
											label: F(e.locale, 'Type / status', '\u7C7B\u578B / \u72B6\u6001'),
											value: `${t.type} \xB7 ${t.status}`
										}),
										s(wt, {
											label: F(e.locale, 'Semantic model', '\u8BED\u4E49\u6A21\u578B'),
											value: t.modelName
										}),
										s(wt, { label: F(e.locale, 'Cube', 'Cube'), value: t.entity }),
										s(wt, {
											label: F(e.locale, 'Business area', '\u4E1A\u52A1\u57DF'),
											value: t.businessAreaName
										}),
										s(wt, {
											label: F(e.locale, 'Business definition', '\u4E1A\u52A1\u53E3\u5F84'),
											value: t.business
										}),
										s(wt, {
											label: F(e.locale, 'Principal', '\u8D1F\u8D23\u4EBA'),
											value: t.principal
										}),
										s(wt, {
											label: F(e.locale, 'Certification', '\u8BA4\u8BC1'),
											value: t.certificationName
										}),
										s(wt, {
											label: F(e.locale, 'Validity', '\u6709\u6548\u671F'),
											value: t.validity
										}),
										s(wt, {
											label: F(e.locale, 'Embedding status', '\u5411\u91CF\u72B6\u6001'),
											value: t.embeddingStatus
										}),
										t.error
											? s(wt, { label: F(e.locale, 'Error', '\u9519\u8BEF'), value: t.error })
											: null,
										D('div', {
											children: [
												s('div', {
													className:
														'mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground',
													children: F(
														e.locale,
														'Semantic options',
														'\u8BED\u4E49\u9009\u9879'
													)
												}),
												s('pre', {
													className:
														'overflow-auto rounded-md border bg-muted/20 p-3 text-xs',
													children: JSON.stringify(t.options ?? {}, null, 2)
												})
											]
										})
									]
								})
							: null
					]
				})
			})
		}
		function wt(e) {
			return D('div', {
				children: [
					s('div', {
						className: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',
						children: e.label
					}),
					s('div', { className: 'mt-1 whitespace-pre-wrap text-sm', children: e.value || '\u2014' })
				]
			})
		}
		function cw(e) {
			return s(En, {
				variant: e.value === 'RELEASED' ? 'default' : e.value === 'ARCHIVED' ? 'secondary' : 'outline',
				children: e.value
			})
		}
		function pr(e, t, a) {
			let o = { ...(me(e, 'parameters') ?? {}) }
			return (a ? (o[t] = a) : delete o[t], { ...e, parameters: o })
		}
		function fw(e, t) {
			if (!e) return '\u2014'
			let a = new Date(e)
			return Number.isNaN(a.getTime())
				? e
				: new Intl.DateTimeFormat(t ?? 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(a)
		}
		function pw(e, t, a) {
			let o = URL.createObjectURL(new Blob([t], { type: a })),
				r = document.createElement('a')
			;((r.href = o), (r.download = e), r.click(), URL.revokeObjectURL(o))
		}
		var Lh = document.getElementById('root')
		if (!Lh) throw new Error('Remote component root was not found.')
		nu(Lh).render(s(iw, {}))
		Ht.ready()
	})
	mw()
})()
