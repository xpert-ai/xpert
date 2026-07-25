;(() => {
	var Nh = Object.defineProperty
	var nu = (e) => {
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
	var _h = (e, t) => () => {
			try {
				return (t || e((t = { exports: {} }).exports, t), t.exports)
			} catch (a) {
				throw ((t = 0), a)
			}
		},
		Ye = (e, t) => {
			for (var a in t) Nh(e, a, { get: t[a], enumerable: !0 })
		}
	var su = (e, t, a) => t.has(e) || nu('Cannot ' + a)
	var Na = (e, t, a) => (su(e, t, 'read from private field'), a ? a.call(e) : t.get(e)),
		Jn = (e, t, a) =>
			t.has(e)
				? nu('Cannot add the same private member more than once')
				: t instanceof WeakSet
					? t.add(e)
					: t.set(e, a),
		Yn = (e, t, a, o) => (su(e, t, 'write to private field'), o ? o.call(e, a) : t.set(e, a), a)
	var ae = {}
	Ye(ae, {
		Children: () => ft,
		Component: () => zh,
		Fragment: () => Ze,
		Profiler: () => Hh,
		PureComponent: () => Uh,
		StrictMode: () => qh,
		Suspense: () => Vh,
		cloneElement: () => Rt,
		createContext: () => Fe,
		createElement: () => Re,
		createRef: () => Gh,
		default: () => na,
		forwardRef: () => S,
		isValidElement: () => _a,
		lazy: () => Wh,
		memo: () => Io,
		startTransition: () => jh,
		useCallback: () => W,
		useContext: () => He,
		useDebugValue: () => Xh,
		useDeferredValue: () => Kh,
		useEffect: () => E,
		useId: () => za,
		useImperativeHandle: () => hr,
		useInsertionEffect: () => $h,
		useLayoutEffect: () => Pt,
		useMemo: () => we,
		useReducer: () => Ha,
		useRef: () => w,
		useState: () => k,
		useSyncExternalStore: () => Zn,
		useTransition: () => Jh,
		version: () => Yh
	})
	var me,
		na,
		ft,
		zh,
		Ze,
		Hh,
		Uh,
		qh,
		Vh,
		Rt,
		Fe,
		Re,
		Gh,
		S,
		_a,
		Wh,
		Io,
		jh,
		W,
		He,
		Xh,
		Kh,
		E,
		za,
		hr,
		$h,
		Pt,
		we,
		Ha,
		w,
		k,
		Zn,
		Jh,
		Yh,
		ee = y(() => {
			;((me = globalThis.React),
				(na = me),
				(ft = me.Children),
				(zh = me.Component),
				(Ze = me.Fragment),
				(Hh = me.Profiler),
				(Uh = me.PureComponent),
				(qh = me.StrictMode),
				(Vh = me.Suspense),
				(Rt = me.cloneElement),
				(Fe = me.createContext),
				(Re = me.createElement),
				(Gh = me.createRef),
				(S = me.forwardRef),
				(_a = me.isValidElement),
				(Wh = me.lazy),
				(Io = me.memo),
				(jh = me.startTransition),
				(W = me.useCallback),
				(He = me.useContext),
				(Xh = me.useDebugValue),
				(Kh = me.useDeferredValue),
				(E = me.useEffect),
				(za = me.useId),
				(hr = me.useImperativeHandle),
				($h = me.useInsertionEffect),
				(Pt = me.useLayoutEffect),
				(we = me.useMemo),
				(Ha = me.useReducer),
				(w = me.useRef),
				(k = me.useState),
				(Zn = me.useSyncExternalStore),
				(Jh = me.useTransition),
				(Yh = me.version))
		})
	var lu,
		iu,
		Sw,
		uu = y(() => {
			;((lu = globalThis.ReactDOM), (iu = lu.createRoot), (Sw = lu.hydrateRoot))
		})
	function du(e = {}) {
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
	var cu = y(() => {})
	function fu(e) {
		var t,
			a,
			o = ''
		if (typeof e == 'string' || typeof e == 'number') o += e
		else if (typeof e == 'object')
			if (Array.isArray(e)) {
				var r = e.length
				for (t = 0; t < r; t++) e[t] && (a = fu(e[t])) && (o && (o += ' '), (o += a))
			} else for (a in e) e[a] && (o && (o += ' '), (o += a))
		return o
	}
	function xr() {
		for (var e, t, a = 0, o = '', r = arguments.length; a < r; a++)
			(e = arguments[a]) && (t = fu(e)) && (o && (o += ' '), (o += t))
		return o
	}
	var Qn = y(() => {})
	var Zh,
		Qh,
		vu,
		pu,
		ex,
		tx,
		Cu,
		ax,
		ox,
		rx,
		ts,
		nx,
		sx,
		lx,
		ix,
		bu,
		ux,
		dx,
		cx,
		mu,
		fx,
		px,
		mx,
		gx,
		hx,
		xx,
		Lu,
		vx,
		Cx,
		Ae,
		Iu,
		Su,
		bx,
		Lx,
		Ix,
		Sx,
		wx,
		yx,
		Ua,
		ie,
		qt,
		es,
		kt,
		wu,
		Rx,
		as,
		Px,
		kx,
		Tx,
		Ax,
		J,
		sa,
		gu,
		Mx,
		Dx,
		hu,
		Ex,
		vr,
		Y,
		So,
		Ox,
		xu,
		Fx,
		Bx,
		Cr,
		Nx,
		Vt,
		la,
		yu,
		Ru,
		Pu,
		ku,
		_x,
		Tu,
		Au,
		Mu,
		zx,
		Du,
		Eu = y(() => {
			;((Zh = (e, t) => {
				let a = new Array(e.length + t.length)
				for (let o = 0; o < e.length; o++) a[o] = e[o]
				for (let o = 0; o < t.length; o++) a[e.length + o] = t[o]
				return a
			}),
				(Qh = (e, t) => ({ classGroupId: e, validator: t })),
				(vu = (e = new Map(), t = null, a) => ({ nextPart: e, validators: t, classGroupId: a })),
				(pu = []),
				(ex = 'arbitrary..'),
				(tx = (e) => {
					let t = ox(e),
						{ conflictingClassGroups: a, conflictingClassGroupModifiers: o } = e
					return {
						getClassGroupId: (l) => {
							if (l.startsWith('[') && l.endsWith(']')) return ax(l)
							let i = l.split('-'),
								u = i[0] === '' && i.length > 1 ? 1 : 0
							return Cu(i, u, t)
						},
						getConflictingClassGroupIds: (l, i) => {
							if (i) {
								let u = o[l],
									d = a[l]
								return u ? (d ? Zh(d, u) : u) : d || pu
							}
							return a[l] || pu
						}
					}
				}),
				(Cu = (e, t, a) => {
					if (e.length - t === 0) return a.classGroupId
					let r = e[t],
						n = a.nextPart.get(r)
					if (n) {
						let d = Cu(e, t + 1, n)
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
				(ax = (e) =>
					e.slice(1, -1).indexOf(':') === -1
						? void 0
						: (() => {
								let t = e.slice(1, -1),
									a = t.indexOf(':'),
									o = t.slice(0, a)
								return o ? ex + o : void 0
							})()),
				(ox = (e) => {
					let { theme: t, classGroups: a } = e
					return rx(a, t)
				}),
				(rx = (e, t) => {
					let a = vu()
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
						nx(l, t, a, o)
					}
				}),
				(nx = (e, t, a, o) => {
					if (typeof e == 'string') {
						sx(e, t, a)
						return
					}
					if (typeof e == 'function') {
						lx(e, t, a, o)
						return
					}
					ix(e, t, a, o)
				}),
				(sx = (e, t, a) => {
					let o = e === '' ? t : bu(t, e)
					o.classGroupId = a
				}),
				(lx = (e, t, a, o) => {
					if (ux(e)) {
						ts(e(o), t, a, o)
						return
					}
					;(t.validators === null && (t.validators = []), t.validators.push(Qh(a, e)))
				}),
				(ix = (e, t, a, o) => {
					let r = Object.entries(e),
						n = r.length
					for (let l = 0; l < n; l++) {
						let [i, u] = r[l]
						ts(u, bu(t, i), a, o)
					}
				}),
				(bu = (e, t) => {
					let a = e,
						o = t.split('-'),
						r = o.length
					for (let n = 0; n < r; n++) {
						let l = o[n],
							i = a.nextPart.get(l)
						;(i || ((i = vu()), a.nextPart.set(l, i)), (a = i))
					}
					return a
				}),
				(ux = (e) => 'isThemeGetter' in e && e.isThemeGetter === !0),
				(dx = (e) => {
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
				(cx = []),
				(mu = (e, t, a, o, r) => ({
					modifiers: e,
					hasImportantModifier: t,
					baseClassName: a,
					maybePostfixModifierPosition: o,
					isExternal: r
				})),
				(fx = (e) => {
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
							return mu(n, h, m, g)
						}
					if (t) {
						let r = t + ':',
							n = o
						o = (l) => (l.startsWith(r) ? n(l.slice(r.length)) : mu(cx, !1, l, void 0, !0))
					}
					if (a) {
						let r = o
						o = (n) => a({ className: n, parseClassName: r })
					}
					return o
				}),
				(px = (e) => {
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
				(mx = (e) => ({ cache: dx(e.cacheSize), parseClassName: fx(e), sortModifiers: px(e), ...tx(e) })),
				(gx = /\s+/),
				(hx = (e, t) => {
					let { parseClassName: a, getClassGroupId: o, getConflictingClassGroupIds: r, sortModifiers: n } = t,
						l = [],
						i = e.trim().split(gx),
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
						for (let T = 0; T < I.length; ++T) {
							let A = I[T]
							l.push(b + A)
						}
						u = c + (u.length > 0 ? ' ' + u : u)
					}
					return u
				}),
				(xx = (...e) => {
					let t = 0,
						a,
						o,
						r = ''
					for (; t < e.length; ) (a = e[t++]) && (o = Lu(a)) && (r && (r += ' '), (r += o))
					return r
				}),
				(Lu = (e) => {
					if (typeof e == 'string') return e
					let t,
						a = ''
					for (let o = 0; o < e.length; o++) e[o] && (t = Lu(e[o])) && (a && (a += ' '), (a += t))
					return a
				}),
				(vx = (e, ...t) => {
					let a,
						o,
						r,
						n,
						l = (u) => {
							let d = t.reduce((c, f) => f(c), e())
							return ((a = mx(d)), (o = a.cache.get), (r = a.cache.set), (n = i), i(u))
						},
						i = (u) => {
							let d = o(u)
							if (d) return d
							let c = hx(u, a)
							return (r(u, c), c)
						}
					return ((n = l), (...u) => n(xx(...u)))
				}),
				(Cx = []),
				(Ae = (e) => {
					let t = (a) => a[e] || Cx
					return ((t.isThemeGetter = !0), t)
				}),
				(Iu = /^\[(?:(\w[\w-]*):)?(.+)\]$/i),
				(Su = /^\((?:(\w[\w-]*):)?(.+)\)$/i),
				(bx = /^\d+\/\d+$/),
				(Lx = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/),
				(Ix =
					/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/),
				(Sx = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/),
				(wx = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/),
				(yx = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/),
				(Ua = (e) => bx.test(e)),
				(ie = (e) => !!e && !Number.isNaN(Number(e))),
				(qt = (e) => !!e && Number.isInteger(Number(e))),
				(es = (e) => e.endsWith('%') && ie(e.slice(0, -1))),
				(kt = (e) => Lx.test(e)),
				(wu = () => !0),
				(Rx = (e) => Ix.test(e) && !Sx.test(e)),
				(as = () => !1),
				(Px = (e) => wx.test(e)),
				(kx = (e) => yx.test(e)),
				(Tx = (e) => !J(e) && !Y(e)),
				(Ax = (e) => Vt(e, Pu, as)),
				(J = (e) => Iu.test(e)),
				(sa = (e) => Vt(e, ku, Rx)),
				(gu = (e) => Vt(e, _x, ie)),
				(Mx = (e) => Vt(e, Au, wu)),
				(Dx = (e) => Vt(e, Tu, as)),
				(hu = (e) => Vt(e, yu, as)),
				(Ex = (e) => Vt(e, Ru, kx)),
				(vr = (e) => Vt(e, Mu, Px)),
				(Y = (e) => Su.test(e)),
				(So = (e) => la(e, ku)),
				(Ox = (e) => la(e, Tu)),
				(xu = (e) => la(e, yu)),
				(Fx = (e) => la(e, Pu)),
				(Bx = (e) => la(e, Ru)),
				(Cr = (e) => la(e, Mu, !0)),
				(Nx = (e) => la(e, Au, !0)),
				(Vt = (e, t, a) => {
					let o = Iu.exec(e)
					return o ? (o[1] ? t(o[1]) : a(o[2])) : !1
				}),
				(la = (e, t, a = !1) => {
					let o = Su.exec(e)
					return o ? (o[1] ? t(o[1]) : a) : !1
				}),
				(yu = (e) => e === 'position' || e === 'percentage'),
				(Ru = (e) => e === 'image' || e === 'url'),
				(Pu = (e) => e === 'length' || e === 'size' || e === 'bg-size'),
				(ku = (e) => e === 'length'),
				(_x = (e) => e === 'number'),
				(Tu = (e) => e === 'family-name'),
				(Au = (e) => e === 'number' || e === 'weight'),
				(Mu = (e) => e === 'shadow'),
				(zx = () => {
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
						T = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'],
						A = () => ['auto', 'contain', 'none'],
						R = () => [Y, J, u],
						B = () => [Ua, 'full', 'auto', ...R()],
						X = () => [qt, 'none', 'subgrid', Y, J],
						O = () => ['auto', { span: ['full', qt, Y, J] }, qt, Y, J],
						U = () => [qt, 'auto', Y, J],
						$ = () => ['auto', 'min', 'max', 'fr', Y, J],
						z = () => [
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
						Q = () => ['start', 'end', 'center', 'stretch', 'center-safe', 'end-safe'],
						j = () => ['auto', ...R()],
						oe = () => [
							Ua,
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
						q = () => [...L(), xu, hu, { position: [Y, J] }],
						re = () => ['no-repeat', { repeat: ['', 'x', 'y', 'space', 'round'] }],
						pe = () => ['auto', 'cover', 'contain', Fx, Ax, { size: [Y, J] }],
						ne = () => [es, So, sa],
						se = () => ['', 'none', 'full', d, Y, J],
						ue = () => ['', ie, So, sa],
						ke = () => ['solid', 'dashed', 'dotted', 'double'],
						xe = () => [
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
						H = () => [ie, es, xu, hu],
						de = () => ['', 'none', g, Y, J],
						Ce = () => ['none', ie, Y, J],
						ce = () => ['none', ie, Y, J],
						fe = () => [ie, Y, J],
						be = () => [Ua, 'full', ...R()]
					return {
						cacheSize: 500,
						theme: {
							animate: ['spin', 'ping', 'pulse', 'bounce'],
							aspect: ['video'],
							blur: [kt],
							breakpoint: [kt],
							color: [wu],
							container: [kt],
							'drop-shadow': [kt],
							ease: ['in', 'out', 'in-out'],
							font: [Tx],
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
							'inset-shadow': [kt],
							leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
							perspective: ['dramatic', 'near', 'normal', 'midrange', 'distant', 'none'],
							radius: [kt],
							shadow: [kt],
							spacing: ['px', ie],
							text: [kt],
							'text-shadow': [kt],
							tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']
						},
						classGroups: {
							aspect: [{ aspect: ['auto', 'square', Ua, J, Y, x] }],
							container: ['container'],
							columns: [{ columns: [ie, J, Y, i] }],
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
							overflow: [{ overflow: T() }],
							'overflow-x': [{ 'overflow-x': T() }],
							'overflow-y': [{ 'overflow-y': T() }],
							overscroll: [{ overscroll: A() }],
							'overscroll-x': [{ 'overscroll-x': A() }],
							'overscroll-y': [{ 'overscroll-y': A() }],
							position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
							inset: [{ inset: B() }],
							'inset-x': [{ 'inset-x': B() }],
							'inset-y': [{ 'inset-y': B() }],
							start: [{ start: B() }],
							end: [{ end: B() }],
							top: [{ top: B() }],
							right: [{ right: B() }],
							bottom: [{ bottom: B() }],
							left: [{ left: B() }],
							visibility: ['visible', 'invisible', 'collapse'],
							z: [{ z: [qt, 'auto', Y, J] }],
							basis: [{ basis: [Ua, 'full', 'auto', i, ...R()] }],
							'flex-direction': [{ flex: ['row', 'row-reverse', 'col', 'col-reverse'] }],
							'flex-wrap': [{ flex: ['nowrap', 'wrap', 'wrap-reverse'] }],
							flex: [{ flex: [ie, Ua, 'auto', 'initial', 'none', J] }],
							grow: [{ grow: ['', ie, Y, J] }],
							shrink: [{ shrink: ['', ie, Y, J] }],
							order: [{ order: [qt, 'first', 'last', 'none', Y, J] }],
							'grid-cols': [{ 'grid-cols': X() }],
							'col-start-end': [{ col: O() }],
							'col-start': [{ 'col-start': U() }],
							'col-end': [{ 'col-end': U() }],
							'grid-rows': [{ 'grid-rows': X() }],
							'row-start-end': [{ row: O() }],
							'row-start': [{ 'row-start': U() }],
							'row-end': [{ 'row-end': U() }],
							'grid-flow': [{ 'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense'] }],
							'auto-cols': [{ 'auto-cols': $() }],
							'auto-rows': [{ 'auto-rows': $() }],
							gap: [{ gap: R() }],
							'gap-x': [{ 'gap-x': R() }],
							'gap-y': [{ 'gap-y': R() }],
							'justify-content': [{ justify: [...z(), 'normal'] }],
							'justify-items': [{ 'justify-items': [...Q(), 'normal'] }],
							'justify-self': [{ 'justify-self': ['auto', ...Q()] }],
							'align-content': [{ content: ['normal', ...z()] }],
							'align-items': [{ items: [...Q(), { baseline: ['', 'last'] }] }],
							'align-self': [{ self: ['auto', ...Q(), { baseline: ['', 'last'] }] }],
							'place-content': [{ 'place-content': z() }],
							'place-items': [{ 'place-items': [...Q(), 'baseline'] }],
							'place-self': [{ 'place-self': ['auto', ...Q()] }],
							p: [{ p: R() }],
							px: [{ px: R() }],
							py: [{ py: R() }],
							ps: [{ ps: R() }],
							pe: [{ pe: R() }],
							pt: [{ pt: R() }],
							pr: [{ pr: R() }],
							pb: [{ pb: R() }],
							pl: [{ pl: R() }],
							m: [{ m: j() }],
							mx: [{ mx: j() }],
							my: [{ my: j() }],
							ms: [{ ms: j() }],
							me: [{ me: j() }],
							mt: [{ mt: j() }],
							mr: [{ mr: j() }],
							mb: [{ mb: j() }],
							ml: [{ ml: j() }],
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
							'font-size': [{ text: ['base', a, So, sa] }],
							'font-smoothing': ['antialiased', 'subpixel-antialiased'],
							'font-style': ['italic', 'not-italic'],
							'font-weight': [{ font: [o, Nx, Mx] }],
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
							'font-family': [{ font: [Ox, Dx, t] }],
							'fvn-normal': ['normal-nums'],
							'fvn-ordinal': ['ordinal'],
							'fvn-slashed-zero': ['slashed-zero'],
							'fvn-figure': ['lining-nums', 'oldstyle-nums'],
							'fvn-spacing': ['proportional-nums', 'tabular-nums'],
							'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
							tracking: [{ tracking: [r, Y, J] }],
							'line-clamp': [{ 'line-clamp': [ie, 'none', Y, gu] }],
							leading: [{ leading: [n, ...R()] }],
							'list-image': [{ 'list-image': ['none', Y, J] }],
							'list-style-position': [{ list: ['inside', 'outside'] }],
							'list-style-type': [{ list: ['disc', 'decimal', 'none', Y, J] }],
							'text-alignment': [{ text: ['left', 'center', 'right', 'justify', 'start', 'end'] }],
							'placeholder-color': [{ placeholder: M() }],
							'text-color': [{ text: M() }],
							'text-decoration': ['underline', 'overline', 'line-through', 'no-underline'],
							'text-decoration-style': [{ decoration: [...ke(), 'wavy'] }],
							'text-decoration-thickness': [{ decoration: [ie, 'from-font', 'auto', Y, sa] }],
							'text-decoration-color': [{ decoration: M() }],
							'underline-offset': [{ 'underline-offset': [ie, 'auto', Y, J] }],
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
							'bg-position': [{ bg: q() }],
							'bg-repeat': [{ bg: re() }],
							'bg-size': [{ bg: pe() }],
							'bg-image': [
								{
									bg: [
										'none',
										{
											linear: [{ to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] }, qt, Y, J],
											radial: ['', Y, J],
											conic: [qt, Y, J]
										},
										Bx,
										Ex
									]
								}
							],
							'bg-color': [{ bg: M() }],
							'gradient-from-pos': [{ from: ne() }],
							'gradient-via-pos': [{ via: ne() }],
							'gradient-to-pos': [{ to: ne() }],
							'gradient-from': [{ from: M() }],
							'gradient-via': [{ via: M() }],
							'gradient-to': [{ to: M() }],
							rounded: [{ rounded: se() }],
							'rounded-s': [{ 'rounded-s': se() }],
							'rounded-e': [{ 'rounded-e': se() }],
							'rounded-t': [{ 'rounded-t': se() }],
							'rounded-r': [{ 'rounded-r': se() }],
							'rounded-b': [{ 'rounded-b': se() }],
							'rounded-l': [{ 'rounded-l': se() }],
							'rounded-ss': [{ 'rounded-ss': se() }],
							'rounded-se': [{ 'rounded-se': se() }],
							'rounded-ee': [{ 'rounded-ee': se() }],
							'rounded-es': [{ 'rounded-es': se() }],
							'rounded-tl': [{ 'rounded-tl': se() }],
							'rounded-tr': [{ 'rounded-tr': se() }],
							'rounded-br': [{ 'rounded-br': se() }],
							'rounded-bl': [{ 'rounded-bl': se() }],
							'border-w': [{ border: ue() }],
							'border-w-x': [{ 'border-x': ue() }],
							'border-w-y': [{ 'border-y': ue() }],
							'border-w-s': [{ 'border-s': ue() }],
							'border-w-e': [{ 'border-e': ue() }],
							'border-w-t': [{ 'border-t': ue() }],
							'border-w-r': [{ 'border-r': ue() }],
							'border-w-b': [{ 'border-b': ue() }],
							'border-w-l': [{ 'border-l': ue() }],
							'divide-x': [{ 'divide-x': ue() }],
							'divide-x-reverse': ['divide-x-reverse'],
							'divide-y': [{ 'divide-y': ue() }],
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
							'outline-offset': [{ 'outline-offset': [ie, Y, J] }],
							'outline-w': [{ outline: ['', ie, So, sa] }],
							'outline-color': [{ outline: M() }],
							shadow: [{ shadow: ['', 'none', c, Cr, vr] }],
							'shadow-color': [{ shadow: M() }],
							'inset-shadow': [{ 'inset-shadow': ['none', f, Cr, vr] }],
							'inset-shadow-color': [{ 'inset-shadow': M() }],
							'ring-w': [{ ring: ue() }],
							'ring-w-inset': ['ring-inset'],
							'ring-color': [{ ring: M() }],
							'ring-offset-w': [{ 'ring-offset': [ie, sa] }],
							'ring-offset-color': [{ 'ring-offset': M() }],
							'inset-ring-w': [{ 'inset-ring': ue() }],
							'inset-ring-color': [{ 'inset-ring': M() }],
							'text-shadow': [{ 'text-shadow': ['none', m, Cr, vr] }],
							'text-shadow-color': [{ 'text-shadow': M() }],
							opacity: [{ opacity: [ie, Y, J] }],
							'mix-blend': [{ 'mix-blend': [...xe(), 'plus-darker', 'plus-lighter'] }],
							'bg-blend': [{ 'bg-blend': xe() }],
							'mask-clip': [
								{ 'mask-clip': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] },
								'mask-no-clip'
							],
							'mask-composite': [{ mask: ['add', 'subtract', 'intersect', 'exclude'] }],
							'mask-image-linear-pos': [{ 'mask-linear': [ie] }],
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
							'mask-image-conic-pos': [{ 'mask-conic': [ie] }],
							'mask-image-conic-from-pos': [{ 'mask-conic-from': H() }],
							'mask-image-conic-to-pos': [{ 'mask-conic-to': H() }],
							'mask-image-conic-from-color': [{ 'mask-conic-from': M() }],
							'mask-image-conic-to-color': [{ 'mask-conic-to': M() }],
							'mask-mode': [{ mask: ['alpha', 'luminance', 'match'] }],
							'mask-origin': [
								{ 'mask-origin': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] }
							],
							'mask-position': [{ mask: q() }],
							'mask-repeat': [{ mask: re() }],
							'mask-size': [{ mask: pe() }],
							'mask-type': [{ 'mask-type': ['alpha', 'luminance'] }],
							'mask-image': [{ mask: ['none', Y, J] }],
							filter: [{ filter: ['', 'none', Y, J] }],
							blur: [{ blur: de() }],
							brightness: [{ brightness: [ie, Y, J] }],
							contrast: [{ contrast: [ie, Y, J] }],
							'drop-shadow': [{ 'drop-shadow': ['', 'none', h, Cr, vr] }],
							'drop-shadow-color': [{ 'drop-shadow': M() }],
							grayscale: [{ grayscale: ['', ie, Y, J] }],
							'hue-rotate': [{ 'hue-rotate': [ie, Y, J] }],
							invert: [{ invert: ['', ie, Y, J] }],
							saturate: [{ saturate: [ie, Y, J] }],
							sepia: [{ sepia: ['', ie, Y, J] }],
							'backdrop-filter': [{ 'backdrop-filter': ['', 'none', Y, J] }],
							'backdrop-blur': [{ 'backdrop-blur': de() }],
							'backdrop-brightness': [{ 'backdrop-brightness': [ie, Y, J] }],
							'backdrop-contrast': [{ 'backdrop-contrast': [ie, Y, J] }],
							'backdrop-grayscale': [{ 'backdrop-grayscale': ['', ie, Y, J] }],
							'backdrop-hue-rotate': [{ 'backdrop-hue-rotate': [ie, Y, J] }],
							'backdrop-invert': [{ 'backdrop-invert': ['', ie, Y, J] }],
							'backdrop-opacity': [{ 'backdrop-opacity': [ie, Y, J] }],
							'backdrop-saturate': [{ 'backdrop-saturate': [ie, Y, J] }],
							'backdrop-sepia': [{ 'backdrop-sepia': ['', ie, Y, J] }],
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
							duration: [{ duration: [ie, 'initial', Y, J] }],
							ease: [{ ease: ['linear', 'initial', v, Y, J] }],
							delay: [{ delay: [ie, Y, J] }],
							animate: [{ animate: ['none', C, Y, J] }],
							backface: [{ backface: ['hidden', 'visible'] }],
							perspective: [{ perspective: [p, Y, J] }],
							'perspective-origin': [{ 'perspective-origin': I() }],
							rotate: [{ rotate: Ce() }],
							'rotate-x': [{ 'rotate-x': Ce() }],
							'rotate-y': [{ 'rotate-y': Ce() }],
							'rotate-z': [{ 'rotate-z': Ce() }],
							scale: [{ scale: ce() }],
							'scale-x': [{ 'scale-x': ce() }],
							'scale-y': [{ 'scale-y': ce() }],
							'scale-z': [{ 'scale-z': ce() }],
							'scale-3d': ['scale-3d'],
							skew: [{ skew: fe() }],
							'skew-x': [{ 'skew-x': fe() }],
							'skew-y': [{ 'skew-y': fe() }],
							transform: [{ transform: [Y, J, '', 'none', 'gpu', 'cpu'] }],
							'transform-origin': [{ origin: I() }],
							'transform-style': [{ transform: ['3d', 'flat'] }],
							translate: [{ translate: be() }],
							'translate-x': [{ 'translate-x': be() }],
							'translate-y': [{ 'translate-y': be() }],
							'translate-z': [{ 'translate-z': be() }],
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
							'stroke-w': [{ stroke: [ie, So, sa, gu] }],
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
				(Du = vx(zx)))
		})
	function V(...e) {
		return Du(xr(e))
	}
	var he = y(() => {
		Qn()
		Eu()
	})
	function s(e, t, a) {
		return Ou.createElement(e, a == null ? t : { ...t, key: a })
	}
	var Ou,
		Qe,
		D,
		N = y(() => {
			;((Ou = globalThis.React), (Qe = Ou.Fragment))
			D = s
		})
	var Hx,
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
		Zx,
		Qx,
		ev,
		tv,
		av,
		ov,
		Fu = y(() => {
			ee()
			N()
			Hx = S(({ size: e = 24, ...t }, a) =>
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
			Hx.displayName = 'TablerFolderOpenFilledIcon'
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
						s('path', { d: 'M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2' }),
						s('path', { d: 'M17 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2' })
					]
				})
			)
			Ux.displayName = 'TablerFoldersIcon'
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
						s('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M2 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H2' }),
						s('path', { d: 'M17 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
						s('path', { d: 'M9.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-3 0v-3A1.5 1.5 0 0 1 9.5 15' }),
						s('path', { d: 'm19.5 15 3 6' }),
						s('path', { d: 'm19.5 21 3-6' })
					]
				})
			)
			qx.displayName = 'TablerFileTypeDocxIcon'
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
						s('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						s('path', { d: 'M17 18h2' }),
						s('path', { d: 'M20 15h-3v6' }),
						s('path', { d: 'M11 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1' })
					]
				})
			)
			Vx.displayName = 'TablerFileTypePdfIcon'
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
						s('path', { d: 'M4 15l4 6' }),
						s('path', { d: 'M4 21l4-6' }),
						s('path', {
							d: 'M17 20.25c0 .414.336.75.75.75H19a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						s('path', { d: 'M11 15v6h3' })
					]
				})
			)
			Gx.displayName = 'TablerFileTypeXlsIcon'
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
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M7 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
						s('path', {
							d: 'M10 20.25c0 .414.336.75.75.75H12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						s('path', { d: 'M16 15l2 6l2-6' })
					]
				})
			)
			Wx.displayName = 'TablerFileTypeCsvIcon'
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
			jx.displayName = 'TablerFileTypeHtmlIcon'
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
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
						s('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
						s('path', { d: 'M5 15h3v4.5a1.5 1.5 0 0 1-3 0' })
					]
				})
			)
			Xx.displayName = 'TablerFileTypeJpgIcon'
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
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
						s('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						s('path', { d: 'M11 21v-6l3 6v-6' })
					]
				})
			)
			Kx.displayName = 'TablerFileTypePngIcon'
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
						s('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						s('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						s('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
						s('path', { d: 'M16.5 15h3' }),
						s('path', { d: 'M18 15v6' }),
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' })
					]
				})
			)
			$x.displayName = 'TablerFileTypePptIcon'
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
						s('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						s('path', {
							d: 'M4 20.25c0 .414.336.75.75.75H6a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						s('path', { d: 'M10 15l2 6l2-6' }),
						s('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' })
					]
				})
			)
			Jx.displayName = 'TablerFileTypeSvgIcon'
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
			Yx.displayName = 'TablerFileTypeTxtIcon'
			Zx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
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
			Zx.displayName = 'TablerFileTypeZipIcon'
			Qx = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
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
			Qx.displayName = 'TablerFileDescriptionIcon'
			ev = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
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
			ev.displayName = 'TablerFileCodeIcon'
			tv = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
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
			tv.displayName = 'TablerFileMusicIcon'
			av = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
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
			av.displayName = 'TablerFileIcon'
			ov = S(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
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
			ov.displayName = 'TablerVideoIcon'
		})
	var Bu,
		Nu,
		Gt,
		wo = y(() => {
			Qn()
			;((Bu = (e) => (typeof e == 'boolean' ? `${e}` : e === 0 ? '0' : e)),
				(Nu = xr),
				(Gt = (e, t) => (a) => {
					var o
					if (t?.variants == null) return Nu(e, a?.class, a?.className)
					let { variants: r, defaultVariants: n } = t,
						l = Object.keys(r).map((d) => {
							let c = a?.[d],
								f = n?.[d]
							if (c === null) return null
							let m = Bu(c) || Bu(f)
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
					return Nu(e, l, u, a?.class, a?.className)
				}))
		})
	var os,
		yo,
		br,
		Bw,
		qa = y(() => {
			;((os = globalThis.ReactDOM),
				(yo = os.createPortal),
				(br = os.flushSync),
				(Bw = os.unstable_batchedUpdates))
		})
	function _u(e, t) {
		if (typeof e == 'function') return e(t)
		e != null && (e.current = t)
	}
	function Ro(...e) {
		return (t) => {
			let a = !1,
				o = e.map((r) => {
					let n = _u(r, t)
					return (!a && typeof n == 'function' && (a = !0), n)
				})
			if (a)
				return () => {
					for (let r = 0; r < o.length; r++) {
						let n = o[r]
						typeof n == 'function' ? n() : _u(e[r], null)
					}
				}
		}
	}
	function te(...e) {
		return W(Ro(...e), e)
	}
	var Be = y(() => {
		ee()
	})
	var Va = {}
	Ye(Va, { Root: () => rv, Slot: () => rv, Slottable: () => nv, createSlot: () => $e, createSlottable: () => Sr })
	function $e(e) {
		let t = S((a, o) => {
			let { children: r, ...n } = a,
				l = null,
				i = !1,
				u = []
			;(zu(r) && typeof Ir == 'function' && (r = Ir(r._payload)),
				ft.forEach(r, (m) => {
					if (uv(m)) {
						i = !0
						let h = m,
							g = 'child' in h.props ? h.props.child : h.props.children
						;(zu(g) && typeof Ir == 'function' && (g = Ir(g._payload)),
							(l = sv(h, g)),
							u.push(l?.props?.children))
					} else u.push(m)
				}),
				l ? (l = Rt(l, void 0, u)) : !i && ft.count(r) === 1 && _a(r) && (l = r))
			let d = l ? iv(l) : void 0,
				c = te(o, d)
			if (!l) {
				if (r || r === 0) throw new Error(i ? pv(e) : fv(e))
				return r
			}
			let f = lv(n, l.props ?? {})
			return (l.type !== Ze && (f.ref = o ? c : d), Rt(l, f))
		})
		return ((t.displayName = `${e}.Slot`), t)
	}
	function Sr(e) {
		let t = (a) => ('child' in a ? a.children(a.child) : a.children)
		return ((t.displayName = `${e}.Slottable`), (t.__radixId = Hu), t)
	}
	function lv(e, t) {
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
	function iv(e) {
		let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
			a = t && 'isReactWarning' in t && t.isReactWarning
		return a
			? e.ref
			: ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
				(a = t && 'isReactWarning' in t && t.isReactWarning),
				a ? e.props.ref : e.props.ref || e.ref)
	}
	function uv(e) {
		return _a(e) && typeof e.type == 'function' && '__radixId' in e.type && e.type.__radixId === Hu
	}
	function zu(e) {
		return (
			e != null &&
			typeof e == 'object' &&
			'$$typeof' in e &&
			e.$$typeof === dv &&
			'_payload' in e &&
			cv(e._payload)
		)
	}
	function cv(e) {
		return typeof e == 'object' && e !== null && 'then' in e
	}
	var rv,
		Hu,
		nv,
		sv,
		dv,
		fv,
		pv,
		Ir,
		Wt = y(() => {
			ee()
			Be()
			;((rv = $e('Slot')), (Hu = Symbol.for('radix.slottable')))
			;((nv = Sr('Slottable')),
				(sv = (e, t) => {
					if ('child' in e.props) {
						let a = e.props.child
						return _a(a) ? Rt(a, void 0, e.props.children(a.props.children)) : null
					}
					return _a(t) ? t : null
				}))
			dv = Symbol.for('react.lazy')
			;((fv = (e) =>
				`${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`),
				(pv = (e) =>
					`${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`),
				(Ir = ae[' use '.trim().toString()]))
		})
	function wr(e, t) {
		e && br(() => e.dispatchEvent(t))
	}
	var mv,
		K,
		De = y(() => {
			ee()
			qa()
			Wt()
			N()
			;((mv = [
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
				(K = mv.reduce((e, t) => {
					let a = $e(`Primitive.${t}`),
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
		gv,
		Uu,
		qu,
		ns = y(() => {
			ee()
			De()
			N()
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
				(gv = 'VisuallyHidden'),
				(Uu = S((e, t) => s(K.span, { ...e, ref: t, style: { ...rs, ...e.style } }))))
			Uu.displayName = gv
			qu = Uu
		})
	function Le(e, t = []) {
		let a = []
		function o(n, l) {
			let i = Fe(l)
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
					g = He(h)
				if (g) return g
				if (l !== void 0) return l
				throw new Error(`\`${f}\` must be used within \`${n}\``)
			}
			return [d, c]
		}
		let r = () => {
			let n = a.map((l) => Fe(l))
			return function (i) {
				let u = i?.[e] || n
				return we(() => ({ [`__scope${e}`]: { ...i, [e]: u } }), [i, u])
			}
		}
		return ((r.scopeName = e), [o, xv(r, ...t)])
	}
	function xv(...e) {
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
	var Ge = y(() => {
		ee()
		N()
	})
	function Ga(e) {
		let t = e + 'CollectionProvider',
			[a, o] = Le(t),
			[r, n] = a(t, { collectionRef: { current: null }, itemMap: new Map() }),
			l = (p) => {
				let { scope: x, children: v } = p,
					C = w(null),
					b = w(new Map()).current
				return s(r, { scope: x, itemMap: b, collectionRef: C, children: v })
			}
		l.displayName = t
		let i = e + 'CollectionSlot',
			u = $e(i),
			d = S((p, x) => {
				let { scope: v, children: C } = p,
					b = n(i, v),
					L = te(x, b.collectionRef)
				return s(u, { ref: L, children: C })
			})
		d.displayName = i
		let c = e + 'CollectionItemSlot',
			f = 'data-radix-collection-item',
			m = $e(c),
			h = S((p, x) => {
				let { scope: v, children: C, ...b } = p,
					L = w(null),
					I = te(x, L),
					T = n(c, v)
				return (
					E(
						() => (
							T.itemMap.set(L, { ref: L, ...b }),
							() => {
								T.itemMap.delete(L)
							}
						)
					),
					s(m, { [f]: '', ref: I, children: C })
				)
			})
		h.displayName = c
		function g(p) {
			let x = n(e + 'CollectionConsumer', p)
			return W(() => {
				let C = x.collectionRef.current
				if (!C) return []
				let b = Array.from(C.querySelectorAll(`[${f}]`))
				return Array.from(x.itemMap.values()).sort(
					(T, A) => b.indexOf(T.ref.current) - b.indexOf(A.ref.current)
				)
			}, [x.collectionRef, x.itemMap])
		}
		return [{ Provider: l, Slot: d, ItemSlot: h }, g, o]
	}
	var yr = y(() => {
		'use client'
		ee()
		Ge()
		Be()
		Wt()
		N()
		ee()
		N()
	})
	function _(e, t, { checkForDefaultPrevented: a = !0 } = {}) {
		return function (r) {
			if ((e?.(r), a === !1 || !r.defaultPrevented)) return t?.(r)
		}
	}
	var Qw,
		Je = y(() => {
			Qw = !!(typeof window < 'u' && window.document && window.document.createElement)
		})
	var Ie,
		Tt = y(() => {
			ee()
			Ie = globalThis?.document ? Pt : () => {}
		})
	function Ee({ prop: e, defaultProp: t, onChange: a = () => {}, caller: o }) {
		let [r, n, l] = Cv({ defaultProp: t, onChange: a }),
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
		let d = W(
			(c) => {
				if (i) {
					let f = bv(c) ? c(e) : c
					f !== e && l.current?.(f)
				} else n(c)
			},
			[i, e, n, l]
		)
		return [u, d]
	}
	function Cv({ defaultProp: e, onChange: t }) {
		let [a, o] = k(e),
			r = w(a),
			n = w(t)
		return (
			vv(() => {
				n.current = t
			}, [t]),
			E(() => {
				r.current !== a && (n.current?.(a), (r.current = a))
			}, [a, r]),
			[a, o, n]
		)
	}
	function bv(e) {
		return typeof e == 'function'
	}
	var vv,
		At = y(() => {
			ee()
			Tt()
			ee()
			vv = ae[' useInsertionEffect '.trim().toString()] || Ie
		})
	function Lv(e, t) {
		return Ha((a, o) => t[a][o] ?? a, e)
	}
	function Iv(e) {
		let [t, a] = k(),
			o = w(null),
			r = w(e),
			n = w('none'),
			l = e ? 'mounted' : 'unmounted',
			[i, u] = Lv(l, {
				mounted: { UNMOUNT: 'unmounted', ANIMATION_OUT: 'unmountSuspended' },
				unmountSuspended: { MOUNT: 'mounted', ANIMATION_END: 'unmounted' },
				unmounted: { MOUNT: 'mounted' }
			})
		return (
			E(() => {
				let d = Rr(o.current)
				n.current = i === 'mounted' ? d : 'none'
			}, [i]),
			Ie(() => {
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
			Ie(() => {
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
				ref: W((d) => {
					;((o.current = d ? getComputedStyle(d) : null), a(d))
				}, [])
			}
		)
	}
	function Vu(e, t) {
		if (typeof e == 'function') return e(t)
		e != null && (e.current = t)
	}
	function Sv(...e) {
		let t = w(e)
		return (
			(t.current = e),
			W((a) => {
				let o = t.current,
					r = !1,
					n = o.map((l) => {
						let i = Vu(l, a)
						return (!r && typeof i == 'function' && (r = !0), i)
					})
				if (r)
					return () => {
						for (let l = 0; l < n.length; l++) {
							let i = n[l]
							typeof i == 'function' ? i() : Vu(o[l], null)
						}
					}
			}, [])
		)
	}
	function Rr(e) {
		return e?.animationName || 'none'
	}
	function wv(e) {
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
			ee()
			Tt()
			ee()
			ye = (e) => {
				let { present: t, children: a } = e,
					o = Iv(t),
					r = typeof a == 'function' ? a({ present: o.isPresent }) : ft.only(a),
					n = Sv(o.ref, wv(r))
				return typeof a == 'function' || o.isPresent ? Rt(r, { ref: n }) : null
			}
			ye.displayName = 'Presence'
		})
	function Te(e) {
		let [t, a] = k(yv())
		return (
			Ie(() => {
				e || a((o) => o ?? String(Rv++))
			}, [e]),
			e || (t ? `radix-${t}` : '')
		)
	}
	var yv,
		Rv,
		Xt = y(() => {
			ee()
			Tt()
			;((yv = ae[' useId '.trim().toString()] || (() => {})), (Rv = 0))
		})
	function pt(e) {
		let t = He(Pv)
		return e || t || 'ltr'
	}
	var Pv,
		Wa = y(() => {
			'use client'
			ee()
			N()
			Pv = Fe(void 0)
		})
	function Se(e) {
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
	var Mt = y(() => {
		ee()
	})
	function Gu(e, t = globalThis?.document) {
		let a = Se(e)
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
	var Wu = y(() => {
		ee()
		Mt()
	})
	function Ku() {
		let e = He(ls),
			[t, a] = k(null)
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
	function Ev(e, t) {
		let {
				ownerDocument: a = globalThis?.document,
				deferPointerDownOutside: o = !1,
				isDeferredPointerDownOutsideRef: r,
				dismissableSurfaces: n
			} = t,
			l = Se(e),
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
								let T = m()
								;(f(), T || $u(Tv, l, I, { discrete: !0 }))
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
	function Ov(e, t = globalThis?.document) {
		let a = Se(e),
			o = w(!1)
		return (
			E(() => {
				let r = (n) => {
					n.target && !o.current && $u(Av, a, { originalEvent: n }, { discrete: !1 })
				}
				return (t.addEventListener('focusin', r), () => t.removeEventListener('focusin', r))
			}, [t, a]),
			{ onFocusCapture: () => (o.current = !0), onBlurCapture: () => (o.current = !1) }
		)
	}
	function Xu() {
		let e = new CustomEvent(ss)
		document.dispatchEvent(e)
	}
	function $u(e, t, a, { discrete: o }) {
		let r = a.originalEvent.target,
			n = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: a })
		;(t && r.addEventListener(e, t, { once: !0 }), o ? wr(r, n) : r.dispatchEvent(n))
	}
	var kv,
		ss,
		Tv,
		Av,
		ju,
		ls,
		Dt,
		Mv,
		Dv,
		Po = y(() => {
			'use client'
			ee()
			Je()
			De()
			Be()
			Mt()
			Wu()
			N()
			;((kv = 'DismissableLayer'),
				(ss = 'dismissableLayer.update'),
				(Tv = 'dismissableLayer.pointerDownOutside'),
				(Av = 'dismissableLayer.focusOutside'),
				(ls = Fe({
					layers: new Set(),
					layersWithOutsidePointerEventsDisabled: new Set(),
					branches: new Set(),
					dismissableSurfaces: new Set()
				})),
				(Dt = S((e, t) => {
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
						c = He(ls),
						[f, m] = k(null),
						h = f?.ownerDocument ?? globalThis?.document,
						[, g] = k({}),
						p = te(t, (B) => m(B)),
						x = Array.from(c.layers),
						[v] = [...c.layersWithOutsidePointerEventsDisabled].slice(-1),
						C = x.indexOf(v),
						b = f ? x.indexOf(f) : -1,
						L = c.layersWithOutsidePointerEventsDisabled.size > 0,
						I = b >= C,
						T = w(!1),
						A = Ev(
							(B) => {
								let X = B.target
								if (!(X instanceof Node)) return
								let O = [...c.branches].some((U) => U.contains(X))
								!I || O || (n?.(B), i?.(B), B.defaultPrevented || u?.())
							},
							{
								ownerDocument: h,
								deferPointerDownOutside: o,
								isDeferredPointerDownOutsideRef: T,
								dismissableSurfaces: c.dismissableSurfaces
							}
						),
						R = Ov((B) => {
							if (o && T.current) return
							let X = B.target
							;[...c.branches].some((U) => U.contains(X)) || (l?.(B), i?.(B), B.defaultPrevented || u?.())
						}, h)
					return (
						Gu((B) => {
							b === c.layers.size - 1 && (r?.(B), !B.defaultPrevented && u && (B.preventDefault(), u()))
						}, h),
						E(() => {
							if (f)
								return (
									a &&
										(c.layersWithOutsidePointerEventsDisabled.size === 0 &&
											((ju = h.body.style.pointerEvents), (h.body.style.pointerEvents = 'none')),
										c.layersWithOutsidePointerEventsDisabled.add(f)),
									c.layers.add(f),
									Xu(),
									() => {
										a &&
											(c.layersWithOutsidePointerEventsDisabled.delete(f),
											c.layersWithOutsidePointerEventsDisabled.size === 0 &&
												(h.body.style.pointerEvents = ju))
									}
								)
						}, [f, h, a, c]),
						E(
							() => () => {
								f && (c.layers.delete(f), c.layersWithOutsidePointerEventsDisabled.delete(f), Xu())
							},
							[f, c]
						),
						E(() => {
							let B = () => g({})
							return (document.addEventListener(ss, B), () => document.removeEventListener(ss, B))
						}, []),
						s(K.div, {
							...d,
							ref: p,
							style: { pointerEvents: L ? (I ? 'auto' : 'none') : void 0, ...e.style },
							onFocusCapture: _(e.onFocusCapture, R.onFocusCapture),
							onBlurCapture: _(e.onBlurCapture, R.onBlurCapture),
							onPointerDownCapture: _(e.onPointerDownCapture, A.onPointerDownCapture)
						})
					)
				})))
			Dt.displayName = kv
			;((Mv = 'DismissableLayerBranch'),
				(Dv = S((e, t) => {
					let a = He(ls),
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
						s(K.div, { ...e, ref: r })
					)
				})))
			Dv.displayName = Mv
		})
	function Bv(e, { select: t = !1 } = {}) {
		let a = document.activeElement
		for (let o of e) if ((Kt(o, { select: t }), document.activeElement !== a)) return
	}
	function Nv(e) {
		let t = ed(e),
			a = Yu(t, e),
			o = Yu(t.reverse(), e)
		return [a, o]
	}
	function ed(e) {
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
	function Yu(e, t) {
		for (let a of e) if (!_v(a, { upTo: t })) return a
	}
	function _v(e, { upTo: t }) {
		if (getComputedStyle(e).visibility === 'hidden') return !0
		for (; e; ) {
			if (t !== void 0 && e === t) return !1
			if (getComputedStyle(e).display === 'none') return !0
			e = e.parentElement
		}
		return !1
	}
	function zv(e) {
		return e instanceof HTMLInputElement && 'select' in e
	}
	function Kt(e, { select: t = !1 } = {}) {
		if (e && e.focus) {
			let a = document.activeElement
			;(e.focus({ preventScroll: !0 }), e !== a && zv(e) && t && e.select())
		}
	}
	function Hv() {
		let e = []
		return {
			add(t) {
				let a = e[0]
				;(t !== a && a?.pause(), (e = Qu(e, t)), e.unshift(t))
			},
			remove(t) {
				;((e = Qu(e, t)), e[0]?.resume())
			}
		}
	}
	function Qu(e, t) {
		let a = [...e],
			o = a.indexOf(t)
		return (o !== -1 && a.splice(o, 1), a)
	}
	function Uv(e) {
		return e.filter((t) => t.tagName !== 'A')
	}
	var is,
		us,
		Ju,
		Fv,
		ia,
		Zu,
		Pr = y(() => {
			'use client'
			ee()
			Be()
			De()
			Mt()
			N()
			;((is = 'focusScope.autoFocusOnMount'),
				(us = 'focusScope.autoFocusOnUnmount'),
				(Ju = { bubbles: !1, cancelable: !0 }),
				(Fv = 'FocusScope'),
				(ia = S((e, t) => {
					let { loop: a = !1, trapped: o = !1, onMountAutoFocus: r, onUnmountAutoFocus: n, ...l } = e,
						[i, u] = k(null),
						d = Se(r),
						c = Se(n),
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
							let C = function (T) {
									if (h.paused || !i) return
									let A = T.target
									i.contains(A) ? (f.current = A) : Kt(f.current, { select: !0 })
								},
								b = function (T) {
									if (h.paused || !i) return
									let A = T.relatedTarget
									A !== null && (i.contains(A) || Kt(f.current, { select: !0 }))
								},
								L = function (T) {
									if (document.activeElement === document.body)
										for (let R of T) R.removedNodes.length > 0 && Kt(i)
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
								Zu.add(h)
								let p = document.activeElement
								if (!i.contains(p)) {
									let v = new CustomEvent(is, Ju)
									;(i.addEventListener(is, d),
										i.dispatchEvent(v),
										v.defaultPrevented ||
											(Bv(Uv(ed(i)), { select: !0 }), document.activeElement === p && Kt(i)))
								}
								return () => {
									;(i.removeEventListener(is, d),
										setTimeout(() => {
											let v = new CustomEvent(us, Ju)
											;(i.addEventListener(us, c),
												i.dispatchEvent(v),
												v.defaultPrevented || Kt(p ?? document.body, { select: !0 }),
												i.removeEventListener(us, c),
												Zu.remove(h))
										}, 0))
								}
							}
						}, [i, d, c, h]))
					let g = W(
						(p) => {
							if ((!a && !o) || h.paused) return
							let x = p.key === 'Tab' && !p.altKey && !p.ctrlKey && !p.metaKey,
								v = document.activeElement
							if (x && v) {
								let C = p.currentTarget,
									[b, L] = Nv(C)
								b && L
									? !p.shiftKey && v === L
										? (p.preventDefault(), a && Kt(b, { select: !0 }))
										: p.shiftKey && v === b && (p.preventDefault(), a && Kt(L, { select: !0 }))
									: v === C && p.preventDefault()
							}
						},
						[a, o, h.paused]
					)
					return s(K.div, { tabIndex: -1, ...l, ref: m, onKeyDown: g })
				})))
			ia.displayName = Fv
			Zu = Hv()
		})
	var qv,
		Et,
		ko = y(() => {
			'use client'
			ee()
			qa()
			De()
			Tt()
			N()
			;((qv = 'Portal'),
				(Et = S((e, t) => {
					let { container: a, ...o } = e,
						[r, n] = k(!1)
					Ie(() => n(!0), [])
					let l = a || (r && globalThis?.document?.body)
					return l ? yo(s(K.div, { ...o, ref: t }), l) : null
				})))
			Et.displayName = qv
		})
	function Xa() {
		E(() => {
			ja || (ja = { start: td(), end: td() })
			let { start: e, end: t } = ja
			return (
				document.body.firstElementChild !== e && document.body.insertAdjacentElement('afterbegin', e),
				document.body.lastElementChild !== t && document.body.insertAdjacentElement('beforeend', t),
				kr++,
				() => {
					;(kr === 1 && (ja?.start.remove(), ja?.end.remove(), (ja = null)), (kr = Math.max(0, kr - 1)))
				}
			)
		}, [])
	}
	function td() {
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
		ja,
		Tr = y(() => {
			'use client'
			ee()
			;((kr = 0), (ja = null))
		})
	function Ar(e, t) {
		var a = {}
		for (var o in e) Object.prototype.hasOwnProperty.call(e, o) && t.indexOf(o) < 0 && (a[o] = e[o])
		if (e != null && typeof Object.getOwnPropertySymbols == 'function')
			for (var r = 0, o = Object.getOwnPropertySymbols(e); r < o.length; r++)
				t.indexOf(o[r]) < 0 && Object.prototype.propertyIsEnumerable.call(e, o[r]) && (a[o[r]] = e[o[r]])
		return a
	}
	function ad(e, t, a) {
		if (a || arguments.length === 2)
			for (var o = 0, r = t.length, n; o < r; o++)
				(n || !(o in t)) && (n || (n = Array.prototype.slice.call(t, 0, o)), (n[o] = t[o]))
		return e.concat(n || Array.prototype.slice.call(t))
	}
	var We,
		Ka = y(() => {
			We = function () {
				return (
					(We =
						Object.assign ||
						function (t) {
							for (var a, o = 1, r = arguments.length; o < r; o++) {
								a = arguments[o]
								for (var n in a) Object.prototype.hasOwnProperty.call(a, n) && (t[n] = a[n])
							}
							return t
						}),
					We.apply(this, arguments)
				)
			}
		})
	var ua,
		da,
		ds,
		cs,
		Mr = y(() => {
			;((ua = 'right-scroll-bar-position'),
				(da = 'width-before-scroll-bar'),
				(ds = 'with-scroll-bars-hidden'),
				(cs = '--removed-body-scroll-bar-size'))
		})
	function Dr(e, t) {
		return (typeof e == 'function' ? e(t) : e && (e.current = t), e)
	}
	var od = y(() => {})
	function rd(e, t) {
		var a = k(function () {
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
	var nd = y(() => {
		ee()
	})
	function fs(e, t) {
		var a = rd(t || null, function (o) {
			return e.forEach(function (r) {
				return Dr(r, o)
			})
		})
		return (
			Vv(
				function () {
					var o = sd.get(a)
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
					sd.set(a, e)
				},
				[e]
			),
			a
		)
	}
	var Vv,
		sd,
		ld = y(() => {
			ee()
			od()
			nd()
			;((Vv = typeof window < 'u' ? Pt : E), (sd = new WeakMap()))
		})
	var id = y(() => {
		ld()
	})
	function Gv(e) {
		return e
	}
	function Wv(e, t) {
		t === void 0 && (t = Gv)
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
		var t = Wv(null)
		return ((t.options = We({ async: !0, ssr: !1 }, e)), t)
	}
	var ud = y(() => {
		Ka()
	})
	function ms(e, t) {
		return (e.useMedium(t), dd)
	}
	var dd,
		cd = y(() => {
			Ka()
			ee()
			dd = function (e) {
				var t = e.sideCar,
					a = Ar(e, ['sideCar'])
				if (!t) throw new Error('Sidecar: please provide `sideCar` property to import the right car')
				var o = t.read()
				if (!o) throw new Error('Sidecar medium not found')
				return Re(o, We({}, a))
			}
			dd.isSideCarExport = !0
		})
	var gs = y(() => {
		ud()
		cd()
	})
	var Er,
		hs = y(() => {
			gs()
			Er = ps()
		})
	var xs,
		To,
		fd = y(() => {
			Ka()
			ee()
			Mr()
			id()
			hs()
			;((xs = function () {}),
				(To = S(function (e, t) {
					var a = w(null),
						o = k({ onScrollCapture: xs, onWheelCapture: xs, onTouchMoveCapture: xs }),
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
						T = fs([a, t]),
						A = We(We({}, L), r)
					return Re(
						Ze,
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
						l ? Rt(ft.only(i), We(We({}, A), { ref: T })) : Re(C, We({}, A, { className: u, ref: T }), i)
					)
				})))
			To.defaultProps = { enabled: !0, removeScrollBar: !0, inert: !1 }
			To.classNames = { fullWidth: da, zeroRight: ua }
		})
	var pd,
		md,
		gd = y(() => {
			md = function () {
				if (pd) return pd
				if (typeof __webpack_nonce__ < 'u') return __webpack_nonce__
			}
		})
	function jv() {
		if (!document) return null
		var e = document.createElement('style')
		e.type = 'text/css'
		var t = md()
		return (t && e.setAttribute('nonce', t), e)
	}
	function Xv(e, t) {
		e.styleSheet ? (e.styleSheet.cssText = t) : e.appendChild(document.createTextNode(t))
	}
	function Kv(e) {
		var t = document.head || document.getElementsByTagName('head')[0]
		t.appendChild(e)
	}
	var vs,
		Cs = y(() => {
			gd()
			vs = function () {
				var e = 0,
					t = null
				return {
					add: function (a) {
						;(e == 0 && (t = jv()) && (Xv(t, a), Kv(t)), e++)
					},
					remove: function () {
						;(e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), (t = null)))
					}
				}
			}
		})
	var bs,
		Ls = y(() => {
			ee()
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
	var Ao,
		hd = y(() => {
			Ls()
			Ao = function () {
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
		hd()
		Cs()
		Ls()
	})
	var $v,
		Ss,
		Jv,
		ws,
		ys = y(() => {
			;(($v = { left: 0, top: 0, right: 0, gap: 0 }),
				(Ss = function (e) {
					return parseInt(e || '', 10) || 0
				}),
				(Jv = function (e) {
					var t = window.getComputedStyle(document.body),
						a = t[e === 'padding' ? 'paddingLeft' : 'marginLeft'],
						o = t[e === 'padding' ? 'paddingTop' : 'marginTop'],
						r = t[e === 'padding' ? 'paddingRight' : 'marginRight']
					return [Ss(a), Ss(o), Ss(r)]
				}),
				(ws = function (e) {
					if ((e === void 0 && (e = 'margin'), typeof window > 'u')) return $v
					var t = Jv(e),
						a = document.documentElement.clientWidth,
						o = window.innerWidth
					return { left: t[0], top: t[1], right: t[2], gap: Math.max(0, o - a + t[2] - t[0]) }
				}))
		})
	var Yv,
		$a,
		Zv,
		xd,
		Qv,
		Rs,
		vd = y(() => {
			ee()
			Is()
			Mr()
			ys()
			;((Yv = Ao()),
				($a = 'data-scroll-locked'),
				(Zv = function (e, t, a, o) {
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
								$a,
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
								ua,
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
								da,
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
							.concat(ua, ' .')
							.concat(
								ua,
								` {
    right: 0 `
							)
							.concat(
								o,
								`;
  }

  .`
							)
							.concat(da, ' .')
							.concat(
								da,
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
								$a,
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
				(xd = function () {
					var e = parseInt(document.body.getAttribute($a) || '0', 10)
					return isFinite(e) ? e : 0
				}),
				(Qv = function () {
					E(function () {
						return (
							document.body.setAttribute($a, (xd() + 1).toString()),
							function () {
								var e = xd() - 1
								e <= 0
									? document.body.removeAttribute($a)
									: document.body.setAttribute($a, e.toString())
							}
						)
					}, [])
				}),
				(Rs = function (e) {
					var t = e.noRelative,
						a = e.noImportant,
						o = e.gapMode,
						r = o === void 0 ? 'margin' : o
					Qv()
					var n = we(
						function () {
							return ws(r)
						},
						[r]
					)
					return Re(Yv, { styles: Zv(n, !t, r, a ? '' : '!important') })
				}))
		})
	var Cd = y(() => {
		vd()
		Mr()
		ys()
	})
	var Ps,
		Mo,
		ca,
		bd = y(() => {
			Ps = !1
			if (typeof window < 'u')
				try {
					;((Mo = Object.defineProperty({}, 'passive', {
						get: function () {
							return ((Ps = !0), !0)
						}
					})),
						window.addEventListener('test', Mo, Mo),
						window.removeEventListener('test', Mo, Mo))
				} catch {
					Ps = !1
				}
			ca = Ps ? { passive: !1 } : !1
		})
	var eC,
		Ld,
		tC,
		aC,
		ks,
		oC,
		rC,
		Id,
		Sd,
		nC,
		wd,
		yd = y(() => {
			;((eC = function (e) {
				return e.tagName === 'TEXTAREA'
			}),
				(Ld = function (e, t) {
					if (!(e instanceof Element)) return !1
					var a = window.getComputedStyle(e)
					return a[t] !== 'hidden' && !(a.overflowY === a.overflowX && !eC(e) && a[t] === 'visible')
				}),
				(tC = function (e) {
					return Ld(e, 'overflowY')
				}),
				(aC = function (e) {
					return Ld(e, 'overflowX')
				}),
				(ks = function (e, t) {
					var a = t.ownerDocument,
						o = t
					do {
						typeof ShadowRoot < 'u' && o instanceof ShadowRoot && (o = o.host)
						var r = Id(e, o)
						if (r) {
							var n = Sd(e, o),
								l = n[1],
								i = n[2]
							if (l > i) return !0
						}
						o = o.parentNode
					} while (o && o !== a.body)
					return !1
				}),
				(oC = function (e) {
					var t = e.scrollTop,
						a = e.scrollHeight,
						o = e.clientHeight
					return [t, a, o]
				}),
				(rC = function (e) {
					var t = e.scrollLeft,
						a = e.scrollWidth,
						o = e.clientWidth
					return [t, a, o]
				}),
				(Id = function (e, t) {
					return e === 'v' ? tC(t) : aC(t)
				}),
				(Sd = function (e, t) {
					return e === 'v' ? oC(t) : rC(t)
				}),
				(nC = function (e, t) {
					return e === 'h' && t === 'rtl' ? -1 : 1
				}),
				(wd = function (e, t, a, o, r) {
					var n = nC(e, window.getComputedStyle(t).direction),
						l = n * o,
						i = a.target,
						u = t.contains(i),
						d = !1,
						c = l > 0,
						f = 0,
						m = 0
					do {
						if (!i) break
						var h = Sd(e, i),
							g = h[0],
							p = h[1],
							x = h[2],
							v = p - x - n * g
						;(g || v) && Id(e, i) && ((f += v), (m += g))
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
	function kd(e) {
		var t = w([]),
			a = w([0, 0]),
			o = w(),
			r = k(iC++)[0],
			n = k(Ao)[0],
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
						var p = ad([e.lockRef.current], (e.shards || []).map(Pd), !0).filter(Boolean)
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
		var i = W(function (p, x) {
				if (('touches' in p && p.touches.length === 2) || (p.type === 'wheel' && p.ctrlKey))
					return !l.current.allowPinchZoom
				var v = Or(p),
					C = a.current,
					b = 'deltaX' in p ? p.deltaX : C[0] - v[0],
					L = 'deltaY' in p ? p.deltaY : C[1] - v[1],
					I,
					T = p.target,
					A = Math.abs(b) > Math.abs(L) ? 'h' : 'v'
				if ('touches' in p && A === 'h' && T.type === 'range') return !1
				var R = window.getSelection(),
					B = R && R.anchorNode,
					X = B ? B === T || B.contains(T) : !1
				if (X) return !1
				var O = ks(A, T)
				if (!O) return !0
				if ((O ? (I = A) : ((I = A === 'v' ? 'h' : 'v'), (O = ks(A, T))), !O)) return !1
				if ((!o.current && 'changedTouches' in p && (b || L) && (o.current = I), !I)) return !0
				var U = o.current || I
				return wd(U, x, p, U === 'h' ? b : L, !0)
			}, []),
			u = W(function (p) {
				var x = p
				if (!(!Ja.length || Ja[Ja.length - 1] !== n)) {
					var v = 'deltaY' in x ? Rd(x) : Or(x),
						C = t.current.filter(function (I) {
							return (
								I.name === x.type &&
								(I.target === x.target || x.target === I.shadowParent) &&
								sC(I.delta, v)
							)
						})[0]
					if (C && C.should) {
						x.cancelable && x.preventDefault()
						return
					}
					if (!C) {
						var b = (l.current.shards || [])
								.map(Pd)
								.filter(Boolean)
								.filter(function (I) {
									return I.contains(x.target)
								}),
							L = b.length > 0 ? i(x, b[0]) : !l.current.noIsolation
						L && x.cancelable && x.preventDefault()
					}
				}
			}, []),
			d = W(function (p, x, v, C) {
				var b = { name: p, delta: x, target: v, should: C, shadowParent: uC(v) }
				;(t.current.push(b),
					setTimeout(function () {
						t.current = t.current.filter(function (L) {
							return L !== b
						})
					}, 1))
			}, []),
			c = W(function (p) {
				;((a.current = Or(p)), (o.current = void 0))
			}, []),
			f = W(function (p) {
				d(p.type, Rd(p), p.target, i(p, e.lockRef.current))
			}, []),
			m = W(function (p) {
				d(p.type, Or(p), p.target, i(p, e.lockRef.current))
			}, [])
		E(function () {
			return (
				Ja.push(n),
				e.setCallbacks({ onScrollCapture: f, onWheelCapture: f, onTouchMoveCapture: m }),
				document.addEventListener('wheel', u, ca),
				document.addEventListener('touchmove', u, ca),
				document.addEventListener('touchstart', c, ca),
				function () {
					;((Ja = Ja.filter(function (p) {
						return p !== n
					})),
						document.removeEventListener('wheel', u, ca),
						document.removeEventListener('touchmove', u, ca),
						document.removeEventListener('touchstart', c, ca))
				}
			)
		}, [])
		var h = e.removeScrollBar,
			g = e.inert
		return Re(
			Ze,
			null,
			g ? Re(n, { styles: lC(r) }) : null,
			h ? Re(Rs, { noRelative: e.noRelative, gapMode: e.gapMode }) : null
		)
	}
	function uC(e) {
		for (var t = null; e !== null; ) (e instanceof ShadowRoot && ((t = e.host), (e = e.host)), (e = e.parentNode))
		return t
	}
	var Or,
		Rd,
		Pd,
		sC,
		lC,
		iC,
		Ja,
		Td = y(() => {
			Ka()
			ee()
			Cd()
			Is()
			bd()
			yd()
			;((Or = function (e) {
				return 'changedTouches' in e ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY] : [0, 0]
			}),
				(Rd = function (e) {
					return [e.deltaX, e.deltaY]
				}),
				(Pd = function (e) {
					return e && 'current' in e ? e.current : e
				}),
				(sC = function (e, t) {
					return e[0] === t[0] && e[1] === t[1]
				}),
				(lC = function (e) {
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
				(iC = 0),
				(Ja = []))
		})
	var Ad,
		Md = y(() => {
			gs()
			Td()
			hs()
			Ad = ms(Er, kd)
		})
	var Dd,
		fa,
		Ed = y(() => {
			Ka()
			ee()
			fd()
			Md()
			Dd = S(function (e, t) {
				return Re(To, We({}, e, { ref: t, sideCar: Ad }))
			})
			Dd.classNames = To.classNames
			fa = Dd
		})
	var Fr = y(() => {
		Ed()
	})
	var dC,
		Ya,
		Br,
		Nr,
		Ts,
		Od,
		cC,
		fC,
		Za,
		_r = y(() => {
			;((dC = function (e) {
				if (typeof document > 'u') return null
				var t = Array.isArray(e) ? e[0] : e
				return t.ownerDocument.body
			}),
				(Ya = new WeakMap()),
				(Br = new WeakMap()),
				(Nr = {}),
				(Ts = 0),
				(Od = function (e) {
					return e && (e.host || Od(e.parentNode))
				}),
				(cC = function (e, t) {
					return t
						.map(function (a) {
							if (e.contains(a)) return a
							var o = Od(a)
							return o && e.contains(o)
								? o
								: (console.error('aria-hidden', a, 'in not contained inside', e, '. Doing nothing'),
									null)
						})
						.filter(function (a) {
							return !!a
						})
				}),
				(fC = function (e, t, a, o) {
					var r = cC(t, Array.isArray(e) ? e : [e])
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
											p = (Ya.get(m) || 0) + 1,
											x = (n.get(m) || 0) + 1
										;(Ya.set(m, p),
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
								var m = Ya.get(f) - 1,
									h = n.get(f) - 1
								;(Ya.set(f, m),
									n.set(f, h),
									m || (Br.has(f) || f.removeAttribute(o), Br.delete(f)),
									h || f.removeAttribute(a))
							}),
								Ts--,
								Ts || ((Ya = new WeakMap()), (Ya = new WeakMap()), (Br = new WeakMap()), (Nr = {})))
						}
					)
				}),
				(Za = function (e, t, a) {
					a === void 0 && (a = 'data-aria-hidden')
					var o = Array.from(Array.isArray(e) ? e : [e]),
						r = t || dC(e)
					return r
						? (o.push.apply(o, Array.from(r.querySelectorAll('[aria-live], script'))),
							fC(o, r, a, 'aria-hidden'))
						: function () {
								return null
							}
				}))
		})
	var Pe = {}
	Ye(Pe, {
		Close: () => Do,
		Content: () => jr,
		Description: () => Kr,
		Dialog: () => qr,
		DialogClose: () => Do,
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
		WarningProvider: () => CC,
		createDialogScope: () => Ur
	})
	function Ms(e) {
		return e ? 'open' : 'closed'
	}
	var Hr,
		Fd,
		Ur,
		pC,
		lt,
		qr,
		Bd,
		Vr,
		As,
		mC,
		Nd,
		Gr,
		zr,
		Wr,
		gC,
		hC,
		Qa,
		jr,
		xC,
		vC,
		_d,
		zd,
		Xr,
		Hd,
		Kr,
		Ud,
		Do,
		CC,
		$r = y(() => {
			'use client'
			ee()
			Je()
			Be()
			Ge()
			Xt()
			At()
			Po()
			Pr()
			ko()
			jt()
			De()
			Tr()
			Fr()
			_r()
			Wt()
			N()
			;((Hr = 'Dialog'),
				([Fd, Ur] = Le(Hr)),
				([pC, lt] = Fd(Hr)),
				(qr = (e) => {
					let { __scopeDialog: t, children: a, open: o, defaultOpen: r, onOpenChange: n, modal: l = !0 } = e,
						i = w(null),
						u = w(null),
						[d, c] = Ee({ prop: o, defaultProp: r ?? !1, onChange: n, caller: Hr })
					return s(pC, {
						scope: t,
						triggerRef: i,
						contentRef: u,
						contentId: Te(),
						titleId: Te(),
						descriptionId: Te(),
						open: d,
						onOpenChange: c,
						onOpenToggle: W(() => c((f) => !f), [c]),
						modal: l,
						children: a
					})
				}))
			qr.displayName = Hr
			;((Bd = 'DialogTrigger'),
				(Vr = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = lt(Bd, a),
						n = te(t, r.triggerRef)
					return s(K.button, {
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
			Vr.displayName = Bd
			;((As = 'DialogPortal'),
				([mC, Nd] = Fd(As, { forceMount: void 0 })),
				(Gr = (e) => {
					let { __scopeDialog: t, forceMount: a, children: o, container: r } = e,
						n = lt(As, t)
					return s(mC, {
						scope: t,
						forceMount: a,
						children: ft.map(o, (l) =>
							s(ye, { present: a || n.open, children: s(Et, { asChild: !0, container: r, children: l }) })
						)
					})
				}))
			Gr.displayName = As
			;((zr = 'DialogOverlay'),
				(Wr = S((e, t) => {
					let a = Nd(zr, e.__scopeDialog),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = lt(zr, e.__scopeDialog)
					return n.modal ? s(ye, { present: o || n.open, children: s(hC, { ...r, ref: t }) }) : null
				})))
			Wr.displayName = zr
			;((gC = $e('DialogOverlay.RemoveScroll')),
				(hC = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = lt(zr, a),
						n = Ku(),
						l = te(t, n)
					return s(fa, {
						as: gC,
						allowPinchZoom: !0,
						shards: [r.contentRef],
						children: s(K.div, {
							'data-state': Ms(r.open),
							...o,
							ref: l,
							style: { pointerEvents: 'auto', ...o.style }
						})
					})
				})),
				(Qa = 'DialogContent'),
				(jr = S((e, t) => {
					let a = Nd(Qa, e.__scopeDialog),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = lt(Qa, e.__scopeDialog)
					return s(ye, {
						present: o || n.open,
						children: n.modal ? s(xC, { ...r, ref: t }) : s(vC, { ...r, ref: t })
					})
				})))
			jr.displayName = Qa
			;((xC = S((e, t) => {
				let a = lt(Qa, e.__scopeDialog),
					o = w(null),
					r = te(t, a.contentRef, o)
				return (
					E(() => {
						let n = o.current
						if (n) return Za(n)
					}, []),
					s(_d, {
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
				(vC = S((e, t) => {
					let a = lt(Qa, e.__scopeDialog),
						o = w(!1),
						r = w(!1)
					return s(_d, {
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
				(_d = S((e, t) => {
					let { __scopeDialog: a, trapFocus: o, onOpenAutoFocus: r, onCloseAutoFocus: n, ...l } = e,
						i = lt(Qa, a)
					return (
						Xa(),
						s(Qe, {
							children: s(ia, {
								asChild: !0,
								loop: !0,
								trapped: o,
								onMountAutoFocus: r,
								onUnmountAutoFocus: n,
								children: s(Dt, {
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
				(zd = 'DialogTitle'),
				(Xr = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = lt(zd, a)
					return s(K.h2, { id: r.titleId, ...o, ref: t })
				})))
			Xr.displayName = zd
			;((Hd = 'DialogDescription'),
				(Kr = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = lt(Hd, a)
					return s(K.p, { id: r.descriptionId, ...o, ref: t })
				})))
			Kr.displayName = Hd
			;((Ud = 'DialogClose'),
				(Do = S((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = lt(Ud, a)
					return s(K.button, {
						type: 'button',
						...o,
						ref: t,
						onClick: _(e.onClick, () => r.onOpenChange(!1))
					})
				})))
			Do.displayName = Ud
			CC = (e) => e.children
		})
	var et = {}
	Ye(et, {
		Action: () => FC,
		AlertDialog: () => Ds,
		AlertDialogAction: () => zs,
		AlertDialogCancel: () => Hs,
		AlertDialogContent: () => Bs,
		AlertDialogDescription: () => _s,
		AlertDialogOverlay: () => Fs,
		AlertDialogPortal: () => Os,
		AlertDialogTitle: () => Ns,
		AlertDialogTrigger: () => Es,
		Cancel: () => BC,
		Content: () => OC,
		Description: () => _C,
		Overlay: () => EC,
		Portal: () => DC,
		Root: () => AC,
		Title: () => NC,
		Trigger: () => MC,
		createAlertDialogScope: () => LC
	})
	var qd,
		bC,
		LC,
		Ot,
		Ds,
		IC,
		Es,
		SC,
		Os,
		wC,
		Fs,
		Vd,
		yC,
		RC,
		Bs,
		PC,
		Ns,
		kC,
		_s,
		TC,
		zs,
		Gd,
		Hs,
		AC,
		MC,
		DC,
		EC,
		OC,
		FC,
		BC,
		NC,
		_C,
		Wd = y(() => {
			'use client'
			ee()
			Ge()
			Be()
			$r()
			$r()
			Je()
			N()
			;((qd = 'AlertDialog'),
				([bC, LC] = Le(qd, [Ur])),
				(Ot = Ur()),
				(Ds = (e) => {
					let { __scopeAlertDialog: t, ...a } = e,
						o = Ot(t)
					return s(qr, { ...o, ...a, modal: !0 })
				}))
			Ds.displayName = qd
			;((IC = 'AlertDialogTrigger'),
				(Es = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Ot(a)
					return s(Vr, { ...r, ...o, ref: t })
				})))
			Es.displayName = IC
			;((SC = 'AlertDialogPortal'),
				(Os = (e) => {
					let { __scopeAlertDialog: t, ...a } = e,
						o = Ot(t)
					return s(Gr, { ...o, ...a })
				}))
			Os.displayName = SC
			;((wC = 'AlertDialogOverlay'),
				(Fs = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Ot(a)
					return s(Wr, { ...r, ...o, ref: t })
				})))
			Fs.displayName = wC
			;((Vd = 'AlertDialogContent'),
				([yC, RC] = bC(Vd)),
				(Bs = S((e, t) => {
					let { __scopeAlertDialog: a, children: o, ...r } = e,
						n = Ot(a),
						l = w(null),
						i = te(t, l),
						u = w(null)
					return s(yC, {
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
			Bs.displayName = Vd
			;((PC = 'AlertDialogTitle'),
				(Ns = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Ot(a)
					return s(Xr, { ...r, ...o, ref: t })
				})))
			Ns.displayName = PC
			;((kC = 'AlertDialogDescription'),
				(_s = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Ot(a)
					return s(Kr, { ...r, ...o, ref: t })
				})))
			_s.displayName = kC
			;((TC = 'AlertDialogAction'),
				(zs = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = Ot(a)
					return s(Do, { ...r, ...o, ref: t })
				})))
			zs.displayName = TC
			;((Gd = 'AlertDialogCancel'),
				(Hs = S((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						{ cancelRef: r } = RC(Gd, a),
						n = Ot(a),
						l = te(t, r)
					return s(Do, { ...n, ...o, ref: l })
				})))
			Hs.displayName = Gd
			;((AC = Ds), (MC = Es), (DC = Os), (EC = Fs), (OC = Bs), (FC = zs), (BC = Hs), (NC = Ns), (_C = _s))
		})
	function eo(e) {
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
		ee()
	})
	function to(e) {
		let [t, a] = k(void 0)
		return (
			Ie(() => {
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
		ee()
		Tt()
	})
	var Eo = {}
	Ye(Eo, {
		Checkbox: () => Kd,
		CheckboxIndicator: () => Jd,
		Indicator: () => Jd,
		Root: () => Kd,
		createCheckboxScope: () => HC,
		unstable_BubbleInput: () => Vs,
		unstable_CheckboxBubbleInput: () => Vs,
		unstable_CheckboxProvider: () => jd,
		unstable_CheckboxTrigger: () => qs,
		unstable_Provider: () => jd,
		unstable_Trigger: () => qs
	})
	function jd(e) {
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
			[m, h] = Ee({ prop: a, defaultProp: r ?? !1, onChange: u, caller: Zr }),
			[g, p] = k(null),
			[x, v] = k(null),
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
		return s(UC, { scope: t, ...L, children: qC(f) ? f(L) : o })
	}
	function qC(e) {
		return typeof e == 'function'
	}
	function $t(e) {
		return e === 'indeterminate'
	}
	function Zd(e) {
		return $t(e) ? 'indeterminate' : e ? 'checked' : 'unchecked'
	}
	var Zr,
		zC,
		HC,
		UC,
		Us,
		Xd,
		qs,
		Kd,
		$d,
		Jd,
		Yd,
		Vs,
		Qd = y(() => {
			'use client'
			ee()
			Be()
			Ge()
			Je()
			At()
			Jr()
			Yr()
			jt()
			De()
			N()
			;((Zr = 'Checkbox'), ([zC, HC] = Le(Zr)), ([UC, Us] = zC(Zr)))
			;((Xd = 'CheckboxTrigger'),
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
						} = Us(Xd, e),
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
						s(K.button, {
							type: 'button',
							role: 'checkbox',
							'aria-checked': $t(u) ? 'mixed' : u,
							'aria-required': d,
							'data-state': Zd(u),
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
			qs.displayName = Xd
			Kd = S((e, t) => {
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
				return s(jd, {
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
						D(Qe, {
							children: [s(qs, { ...f, ref: t, __scopeCheckbox: a }), m && s(Vs, { __scopeCheckbox: a })]
						})
				})
			})
			Kd.displayName = Zr
			;(($d = 'CheckboxIndicator'),
				(Jd = S((e, t) => {
					let { __scopeCheckbox: a, forceMount: o, ...r } = e,
						n = Us($d, a)
					return s(ye, {
						present: o || $t(n.checked) || n.checked === !0,
						children: s(K.span, {
							'data-state': Zd(n.checked),
							'data-disabled': n.disabled ? '' : void 0,
							...r,
							ref: t,
							style: { pointerEvents: 'none', ...e.style }
						})
					})
				})))
			Jd.displayName = $d
			;((Yd = 'CheckboxBubbleInput'),
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
						} = Us(Yd, e),
						g = te(a, h),
						p = eo(n),
						x = to(o)
					E(() => {
						let C = m
						if (!C) return
						let b = window.HTMLInputElement.prototype,
							I = Object.getOwnPropertyDescriptor(b, 'checked').set,
							T = !r.current
						if (p !== n && I) {
							let A = new Event('click', { bubbles: T })
							;((C.indeterminate = $t(n)), I.call(C, $t(n) ? !1 : n), C.dispatchEvent(A))
						}
					}, [m, p, n, r])
					let v = w($t(n) ? !1 : n)
					return s(K.input, {
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
			Vs.displayName = Yd
		})
	function en(e, t, a) {
		return Ue(e, mt(t, a))
	}
	function gt(e, t) {
		return typeof e == 'function' ? e(t) : e
	}
	function ht(e) {
		return e.split('-')[0]
	}
	function pa(e) {
		return e.split('-')[1]
	}
	function tn(e) {
		return e === 'x' ? 'y' : 'x'
	}
	function an(e) {
		return e === 'y' ? 'height' : 'width'
	}
	function ut(e) {
		let t = e[0]
		return t === 't' || t === 'b' ? 'y' : 'x'
	}
	function on(e) {
		return tn(ut(e))
	}
	function oc(e, t, a) {
		a === void 0 && (a = !1)
		let o = pa(e),
			r = on(e),
			n = an(r),
			l = r === 'x' ? (o === (a ? 'end' : 'start') ? 'right' : 'left') : o === 'start' ? 'bottom' : 'top'
		return (t.reference[n] > t.floating[n] && (l = Oo(l)), [l, Oo(l)])
	}
	function rc(e) {
		let t = Oo(e)
		return [Qr(e), t, Qr(t)]
	}
	function Qr(e) {
		return e.includes('start') ? e.replace('start', 'end') : e.replace('end', 'start')
	}
	function jC(e, t, a) {
		switch (e) {
			case 'top':
			case 'bottom':
				return a ? (t ? tc : ec) : t ? ec : tc
			case 'left':
			case 'right':
				return t ? GC : WC
			default:
				return []
		}
	}
	function nc(e, t, a, o) {
		let r = pa(e),
			n = jC(ht(e), a === 'start', o)
		return (r && ((n = n.map((l) => l + '-' + r)), t && (n = n.concat(n.map(Qr)))), n)
	}
	function Oo(e) {
		let t = ht(e)
		return VC[t] + e.slice(t.length)
	}
	function XC(e) {
		return { top: 0, right: 0, bottom: 0, left: 0, ...e }
	}
	function Gs(e) {
		return typeof e != 'number' ? XC(e) : { top: e, right: e, bottom: e, left: e }
	}
	function ma(e) {
		let { x: t, y: a, width: o, height: r } = e
		return { width: o, height: r, top: a, left: t, right: t + o, bottom: a + r, x: t, y: a }
	}
	var ac,
		mt,
		Ue,
		Fo,
		Bo,
		it,
		VC,
		ec,
		tc,
		GC,
		WC,
		rn = y(() => {
			;((ac = ['top', 'right', 'bottom', 'left']),
				(mt = Math.min),
				(Ue = Math.max),
				(Fo = Math.round),
				(Bo = Math.floor),
				(it = (e) => ({ x: e, y: e })),
				(VC = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' }))
			;((ec = ['left', 'right']), (tc = ['right', 'left']), (GC = ['top', 'bottom']), (WC = ['bottom', 'top']))
		})
	function sc(e, t, a) {
		let { reference: o, floating: r } = e,
			n = ut(t),
			l = on(t),
			i = an(l),
			u = ht(t),
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
		switch (pa(t)) {
			case 'start':
				h[l] -= m * (a && d ? -1 : 1)
				break
			case 'end':
				h[l] += m * (a && d ? -1 : 1)
				break
		}
		return h
	}
	async function uc(e, t) {
		var a
		t === void 0 && (t = {})
		let { x: o, y: r, platform: n, rects: l, elements: i, strategy: u } = e,
			{
				boundary: d = 'clippingAncestors',
				rootBoundary: c = 'viewport',
				elementContext: f = 'floating',
				altBoundary: m = !1,
				padding: h = 0
			} = gt(t, e),
			g = Gs(h),
			x = i[m ? (f === 'floating' ? 'reference' : 'floating') : f],
			v = ma(
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
			I = ma(
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
	function lc(e, t) {
		return { top: e.top - t.height, right: e.right - t.width, bottom: e.bottom - t.height, left: e.left - t.width }
	}
	function ic(e) {
		return ac.some((t) => e[t] >= 0)
	}
	async function $C(e, t) {
		let { placement: a, platform: o, elements: r } = e,
			n = await (o.isRTL == null ? void 0 : o.isRTL(r.floating)),
			l = ht(a),
			i = pa(a),
			u = ut(a) === 'y',
			d = mc.has(l) ? -1 : 1,
			c = n && u ? -1 : 1,
			f = gt(t, e),
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
	var KC,
		dc,
		cc,
		fc,
		pc,
		mc,
		gc,
		hc,
		xc,
		vc,
		Cc = y(() => {
			rn()
			rn()
			;((KC = 50),
				(dc = async (e, t, a) => {
					let { placement: o = 'bottom', strategy: r = 'absolute', middleware: n = [], platform: l } = a,
						i = l.detectOverflow ? l : { ...l, detectOverflow: uc },
						u = await (l.isRTL == null ? void 0 : l.isRTL(t)),
						d = await l.getElementRects({ reference: e, floating: t, strategy: r }),
						{ x: c, y: f } = sc(d, o, u),
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
								reset: T
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
							T &&
								h < KC &&
								(h++,
								typeof T == 'object' &&
									(T.placement && (m = T.placement),
									T.rects &&
										(d =
											T.rects === !0
												? await l.getElementRects({ reference: e, floating: t, strategy: r })
												: T.rects),
									({ x: c, y: f } = sc(d, m, u))),
								(p = -1)))
					}
					return { x: c, y: f, placement: m, strategy: r, middlewareData: g }
				}),
				(cc = (e) => ({
					name: 'arrow',
					options: e,
					async fn(t) {
						let { x: a, y: o, placement: r, rects: n, platform: l, elements: i, middlewareData: u } = t,
							{ element: d, padding: c = 0 } = gt(e, t) || {}
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
							T = await (l.getOffsetParent == null ? void 0 : l.getOffsetParent(d)),
							A = T ? T[b] : 0
						;(!A || !(await (l.isElement == null ? void 0 : l.isElement(T)))) &&
							(A = i.floating[b] || n.floating[g])
						let R = L / 2 - I / 2,
							B = A / 2 - p[g] / 2 - 1,
							X = mt(f[v], B),
							O = mt(f[C], B),
							U = X,
							$ = A - p[g] - O,
							z = A / 2 - p[g] / 2 + R,
							Q = en(U, z, $),
							j =
								!u.arrow &&
								pa(r) != null &&
								z !== Q &&
								n.reference[g] / 2 - (z < U ? X : O) - p[g] / 2 < 0,
							oe = j ? (z < U ? z - U : z - $) : 0
						return {
							[h]: m[h] + oe,
							data: { [h]: Q, centerOffset: z - Q - oe, ...(j && { alignmentOffset: oe }) },
							reset: j
						}
					}
				})),
				(fc = function (e) {
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
									} = gt(e, t)
								if ((a = n.arrow) != null && a.alignmentOffset) return {}
								let v = ht(r),
									C = ut(i),
									b = ht(i) === i,
									L = await (u.isRTL == null ? void 0 : u.isRTL(d.floating)),
									I = m || (b || !p ? [Oo(i)] : rc(i)),
									T = g !== 'none'
								!m && T && I.push(...nc(i, p, g, L))
								let A = [i, ...I],
									R = await u.detectOverflow(t, x),
									B = [],
									X = ((o = n.flip) == null ? void 0 : o.overflows) || []
								if ((c && B.push(R[v]), f)) {
									let z = oc(r, l, L)
									B.push(R[z[0]], R[z[1]])
								}
								if (((X = [...X, { placement: r, overflows: B }]), !B.every((z) => z <= 0))) {
									var O, U
									let z = (((O = n.flip) == null ? void 0 : O.index) || 0) + 1,
										Q = A[z]
									if (
										Q &&
										(!(f === 'alignment' ? C !== ut(Q) : !1) ||
											X.every((M) => (ut(M.placement) === C ? M.overflows[0] > 0 : !0)))
									)
										return { data: { index: z, overflows: X }, reset: { placement: Q } }
									let j =
										(U = X.filter((oe) => oe.overflows[0] <= 0).sort(
											(oe, M) => oe.overflows[1] - M.overflows[1]
										)[0]) == null
											? void 0
											: U.placement
									if (!j)
										switch (h) {
											case 'bestFit': {
												var $
												let oe =
													($ = X.filter((M) => {
														if (T) {
															let q = ut(M.placement)
															return q === C || q === 'y'
														}
														return !0
													})
														.map((M) => [
															M.placement,
															M.overflows
																.filter((q) => q > 0)
																.reduce((q, re) => q + re, 0)
														])
														.sort((M, q) => M[1] - q[1])[0]) == null
														? void 0
														: $[0]
												oe && (j = oe)
												break
											}
											case 'initialPlacement':
												j = i
												break
										}
									if (r !== j) return { reset: { placement: j } }
								}
								return {}
							}
						}
					)
				}))
			;((pc = function (e) {
				return (
					e === void 0 && (e = {}),
					{
						name: 'hide',
						options: e,
						async fn(t) {
							let { rects: a, platform: o } = t,
								{ strategy: r = 'referenceHidden', ...n } = gt(e, t)
							switch (r) {
								case 'referenceHidden': {
									let l = await o.detectOverflow(t, { ...n, elementContext: 'reference' }),
										i = lc(l, a.reference)
									return { data: { referenceHiddenOffsets: i, referenceHidden: ic(i) } }
								}
								case 'escaped': {
									let l = await o.detectOverflow(t, { ...n, altBoundary: !0 }),
										i = lc(l, a.floating)
									return { data: { escapedOffsets: i, escaped: ic(i) } }
								}
								default:
									return {}
							}
						}
					}
				)
			}),
				(mc = new Set(['left', 'top'])))
			;((gc = function (e) {
				return (
					e === void 0 && (e = 0),
					{
						name: 'offset',
						options: e,
						async fn(t) {
							var a, o
							let { x: r, y: n, placement: l, middlewareData: i } = t,
								u = await $C(t, e)
							return l === ((a = i.offset) == null ? void 0 : a.placement) &&
								(o = i.arrow) != null &&
								o.alignmentOffset
								? {}
								: { x: r + u.x, y: n + u.y, data: { ...u, placement: l } }
						}
					}
				)
			}),
				(hc = function (e) {
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
									} = gt(e, t),
									c = { x: a, y: o },
									f = await n.detectOverflow(t, d),
									m = ut(ht(r)),
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
				(xc = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							options: e,
							fn(t) {
								let { x: a, y: o, placement: r, rects: n, middlewareData: l } = t,
									{ offset: i = 0, mainAxis: u = !0, crossAxis: d = !0 } = gt(e, t),
									c = { x: a, y: o },
									f = ut(r),
									m = tn(f),
									h = c[m],
									g = c[f],
									p = gt(i, t),
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
										L = mc.has(ht(r)),
										I =
											n.reference[f] -
											n.floating[b] +
											((L && ((v = l.offset) == null ? void 0 : v[f])) || 0) +
											(L ? 0 : x.crossAxis),
										T =
											n.reference[f] +
											n.reference[b] +
											(L ? 0 : ((C = l.offset) == null ? void 0 : C[f]) || 0) -
											(L ? x.crossAxis : 0)
									g < I ? (g = I) : g > T && (g = T)
								}
								return { [m]: h, [f]: g }
							}
						}
					)
				}),
				(vc = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							name: 'size',
							options: e,
							async fn(t) {
								var a, o
								let { placement: r, rects: n, platform: l, elements: i } = t,
									{ apply: u = () => {}, ...d } = gt(e, t),
									c = await l.detectOverflow(t, d),
									f = ht(r),
									m = pa(r),
									h = ut(r) === 'y',
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
									L = mt(p - c[x], C),
									I = mt(g - c[v], b),
									T = !t.middlewareData.shift,
									A = L,
									R = I
								if (
									((a = t.middlewareData.shift) != null && a.enabled.x && (R = b),
									(o = t.middlewareData.shift) != null && o.enabled.y && (A = C),
									T && !m)
								) {
									let X = Ue(c.left, 0),
										O = Ue(c.right, 0),
										U = Ue(c.top, 0),
										$ = Ue(c.bottom, 0)
									h
										? (R = g - 2 * (X !== 0 || O !== 0 ? X + O : Ue(c.left, c.right)))
										: (A = p - 2 * (U !== 0 || $ !== 0 ? U + $ : Ue(c.top, c.bottom)))
								}
								await u({ ...t, availableWidth: R, availableHeight: A })
								let B = await l.getDimensions(i.floating)
								return g !== B.width || p !== B.height ? { reset: { rects: !0 } } : {}
							}
						}
					)
				}))
		})
	function nn() {
		return typeof window < 'u'
	}
	function xa(e) {
		return Lc(e) ? (e.nodeName || '').toLowerCase() : '#document'
	}
	function je(e) {
		var t
		return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window
	}
	function dt(e) {
		var t
		return (t = (Lc(e) ? e.ownerDocument : e.document) || window.document) == null ? void 0 : t.documentElement
	}
	function Lc(e) {
		return nn() ? e instanceof Node || e instanceof je(e).Node : !1
	}
	function tt(e) {
		return nn() ? e instanceof Element || e instanceof je(e).Element : !1
	}
	function xt(e) {
		return nn() ? e instanceof HTMLElement || e instanceof je(e).HTMLElement : !1
	}
	function bc(e) {
		return !nn() || typeof ShadowRoot > 'u' ? !1 : e instanceof ShadowRoot || e instanceof je(e).ShadowRoot
	}
	function ao(e) {
		let { overflow: t, overflowX: a, overflowY: o, display: r } = at(e)
		return /auto|scroll|overlay|hidden|clip/.test(t + o + a) && r !== 'inline' && r !== 'contents'
	}
	function Ic(e) {
		return /^(table|td|th)$/.test(xa(e))
	}
	function No(e) {
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
		let t = tt(e) ? at(e) : e
		return (
			ga(t.transform) ||
			ga(t.translate) ||
			ga(t.scale) ||
			ga(t.rotate) ||
			ga(t.perspective) ||
			(!ln() && (ga(t.backdropFilter) || ga(t.filter))) ||
			JC.test(t.willChange || '') ||
			YC.test(t.contain || '')
		)
	}
	function Sc(e) {
		let t = Ft(e)
		for (; xt(t) && !va(t); ) {
			if (sn(t)) return t
			if (No(t)) return null
			t = Ft(t)
		}
		return null
	}
	function ln() {
		return (
			Ws == null && (Ws = typeof CSS < 'u' && CSS.supports && CSS.supports('-webkit-backdrop-filter', 'none')),
			Ws
		)
	}
	function va(e) {
		return /^(html|body|#document)$/.test(xa(e))
	}
	function at(e) {
		return je(e).getComputedStyle(e)
	}
	function _o(e) {
		return tt(e)
			? { scrollLeft: e.scrollLeft, scrollTop: e.scrollTop }
			: { scrollLeft: e.scrollX, scrollTop: e.scrollY }
	}
	function Ft(e) {
		if (xa(e) === 'html') return e
		let t = e.assignedSlot || e.parentNode || (bc(e) && e.host) || dt(e)
		return bc(t) ? t.host : t
	}
	function wc(e) {
		let t = Ft(e)
		return va(t) ? (e.ownerDocument ? e.ownerDocument.body : e.body) : xt(t) && ao(t) ? t : wc(t)
	}
	function ha(e, t, a) {
		var o
		;(t === void 0 && (t = []), a === void 0 && (a = !0))
		let r = wc(e),
			n = r === ((o = e.ownerDocument) == null ? void 0 : o.body),
			l = je(r)
		if (n) {
			let i = un(l)
			return t.concat(l, l.visualViewport || [], ao(r) ? r : [], i && a ? ha(i) : [])
		} else return t.concat(r, ha(r, [], a))
	}
	function un(e) {
		return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null
	}
	var JC,
		YC,
		ga,
		Ws,
		yc = y(() => {
			;((JC = /transform|translate|scale|rotate|perspective|filter/),
				(YC = /paint|layout|strict|content/),
				(ga = (e) => !!e && e !== 'none'))
		})
	function Tc(e) {
		let t = at(e),
			a = parseFloat(t.width) || 0,
			o = parseFloat(t.height) || 0,
			r = xt(e),
			n = r ? e.offsetWidth : a,
			l = r ? e.offsetHeight : o,
			i = Fo(a) !== n || Fo(o) !== l
		return (i && ((a = n), (o = l)), { width: a, height: o, $: i })
	}
	function Xs(e) {
		return tt(e) ? e : e.contextElement
	}
	function oo(e) {
		let t = Xs(e)
		if (!xt(t)) return it(1)
		let a = t.getBoundingClientRect(),
			{ width: o, height: r, $: n } = Tc(t),
			l = (n ? Fo(a.width) : a.width) / o,
			i = (n ? Fo(a.height) : a.height) / r
		return ((!l || !Number.isFinite(l)) && (l = 1), (!i || !Number.isFinite(i)) && (i = 1), { x: l, y: i })
	}
	function Ac(e) {
		let t = je(e)
		return !ln() || !t.visualViewport ? ZC : { x: t.visualViewport.offsetLeft, y: t.visualViewport.offsetTop }
	}
	function QC(e, t, a) {
		return (t === void 0 && (t = !1), !a || (t && a !== je(e)) ? !1 : t)
	}
	function Ca(e, t, a, o) {
		;(t === void 0 && (t = !1), a === void 0 && (a = !1))
		let r = e.getBoundingClientRect(),
			n = Xs(e),
			l = it(1)
		t && (o ? tt(o) && (l = oo(o)) : (l = oo(e)))
		let i = QC(n, a, o) ? Ac(n) : it(0),
			u = (r.left + i.x) / l.x,
			d = (r.top + i.y) / l.y,
			c = r.width / l.x,
			f = r.height / l.y
		if (n) {
			let m = je(n),
				h = o && tt(o) ? je(o) : o,
				g = m,
				p = un(g)
			for (; p && o && h !== g; ) {
				let x = oo(p),
					v = p.getBoundingClientRect(),
					C = at(p),
					b = v.left + (p.clientLeft + parseFloat(C.paddingLeft)) * x.x,
					L = v.top + (p.clientTop + parseFloat(C.paddingTop)) * x.y
				;((u *= x.x), (d *= x.y), (c *= x.x), (f *= x.y), (u += b), (d += L), (g = je(p)), (p = un(g)))
			}
		}
		return ma({ width: c, height: f, x: u, y: d })
	}
	function dn(e, t) {
		let a = _o(e).scrollLeft
		return t ? t.left + a : Ca(dt(e)).left + a
	}
	function Mc(e, t) {
		let a = e.getBoundingClientRect(),
			o = a.left + t.scrollLeft - dn(e, a),
			r = a.top + t.scrollTop
		return { x: o, y: r }
	}
	function eb(e) {
		let { elements: t, rect: a, offsetParent: o, strategy: r } = e,
			n = r === 'fixed',
			l = dt(o),
			i = t ? No(t.floating) : !1
		if (o === l || (i && n)) return a
		let u = { scrollLeft: 0, scrollTop: 0 },
			d = it(1),
			c = it(0),
			f = xt(o)
		if ((f || (!f && !n)) && ((xa(o) !== 'body' || ao(l)) && (u = _o(o)), f)) {
			let h = Ca(o)
			;((d = oo(o)), (c.x = h.x + o.clientLeft), (c.y = h.y + o.clientTop))
		}
		let m = l && !f && !n ? Mc(l, u) : it(0)
		return {
			width: a.width * d.x,
			height: a.height * d.y,
			x: a.x * d.x - u.scrollLeft * d.x + c.x + m.x,
			y: a.y * d.y - u.scrollTop * d.y + c.y + m.y
		}
	}
	function tb(e) {
		return Array.from(e.getClientRects())
	}
	function ab(e) {
		let t = dt(e),
			a = _o(e),
			o = e.ownerDocument.body,
			r = Ue(t.scrollWidth, t.clientWidth, o.scrollWidth, o.clientWidth),
			n = Ue(t.scrollHeight, t.clientHeight, o.scrollHeight, o.clientHeight),
			l = -a.scrollLeft + dn(e),
			i = -a.scrollTop
		return (
			at(o).direction === 'rtl' && (l += Ue(t.clientWidth, o.clientWidth) - r),
			{ width: r, height: n, x: l, y: i }
		)
	}
	function ob(e, t) {
		let a = je(e),
			o = dt(e),
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
			g <= Rc && (n -= g)
		} else d <= Rc && (n += d)
		return { width: n, height: l, x: i, y: u }
	}
	function rb(e, t) {
		let a = Ca(e, !0, t === 'fixed'),
			o = a.top + e.clientTop,
			r = a.left + e.clientLeft,
			n = xt(e) ? oo(e) : it(1),
			l = e.clientWidth * n.x,
			i = e.clientHeight * n.y,
			u = r * n.x,
			d = o * n.y
		return { width: l, height: i, x: u, y: d }
	}
	function Pc(e, t, a) {
		let o
		if (t === 'viewport') o = ob(e, a)
		else if (t === 'document') o = ab(dt(e))
		else if (tt(t)) o = rb(t, a)
		else {
			let r = Ac(e)
			o = { x: t.x - r.x, y: t.y - r.y, width: t.width, height: t.height }
		}
		return ma(o)
	}
	function Dc(e, t) {
		let a = Ft(e)
		return a === t || !tt(a) || va(a) ? !1 : at(a).position === 'fixed' || Dc(a, t)
	}
	function nb(e, t) {
		let a = t.get(e)
		if (a) return a
		let o = ha(e, [], !1).filter((i) => tt(i) && xa(i) !== 'body'),
			r = null,
			n = at(e).position === 'fixed',
			l = n ? Ft(e) : e
		for (; tt(l) && !va(l); ) {
			let i = at(l),
				u = sn(l)
			;(!u && i.position === 'fixed' && (r = null),
				(
					n
						? !u && !r
						: (!u &&
								i.position === 'static' &&
								!!r &&
								(r.position === 'absolute' || r.position === 'fixed')) ||
							(ao(l) && !u && Dc(e, l))
				)
					? (o = o.filter((c) => c !== l))
					: (r = i),
				(l = Ft(l)))
		}
		return (t.set(e, o), o)
	}
	function sb(e) {
		let { element: t, boundary: a, rootBoundary: o, strategy: r } = e,
			l = [...(a === 'clippingAncestors' ? (No(t) ? [] : nb(t, this._c)) : [].concat(a)), o],
			i = Pc(t, l[0], r),
			u = i.top,
			d = i.right,
			c = i.bottom,
			f = i.left
		for (let m = 1; m < l.length; m++) {
			let h = Pc(t, l[m], r)
			;((u = Ue(h.top, u)), (d = mt(h.right, d)), (c = mt(h.bottom, c)), (f = Ue(h.left, f)))
		}
		return { width: d - f, height: c - u, x: f, y: u }
	}
	function lb(e) {
		let { width: t, height: a } = Tc(e)
		return { width: t, height: a }
	}
	function ib(e, t, a) {
		let o = xt(t),
			r = dt(t),
			n = a === 'fixed',
			l = Ca(e, !0, n, t),
			i = { scrollLeft: 0, scrollTop: 0 },
			u = it(0)
		function d() {
			u.x = dn(r)
		}
		if (o || (!o && !n))
			if (((xa(t) !== 'body' || ao(r)) && (i = _o(t)), o)) {
				let h = Ca(t, !0, n, t)
				;((u.x = h.x + t.clientLeft), (u.y = h.y + t.clientTop))
			} else r && d()
		n && !o && r && d()
		let c = r && !o && !n ? Mc(r, i) : it(0),
			f = l.left + i.scrollLeft - u.x - c.x,
			m = l.top + i.scrollTop - u.y - c.y
		return { x: f, y: m, width: l.width, height: l.height }
	}
	function js(e) {
		return at(e).position === 'static'
	}
	function kc(e, t) {
		if (!xt(e) || at(e).position === 'fixed') return null
		if (t) return t(e)
		let a = e.offsetParent
		return (dt(e) === a && (a = a.ownerDocument.body), a)
	}
	function Ec(e, t) {
		let a = je(e)
		if (No(e)) return a
		if (!xt(e)) {
			let r = Ft(e)
			for (; r && !va(r); ) {
				if (tt(r) && !js(r)) return r
				r = Ft(r)
			}
			return a
		}
		let o = kc(e, t)
		for (; o && Ic(o) && js(o); ) o = kc(o, t)
		return o && va(o) && js(o) && !sn(o) ? a : o || Sc(e) || a
	}
	function db(e) {
		return at(e).direction === 'rtl'
	}
	function Fc(e, t) {
		return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height
	}
	function cb(e, t) {
		let a = null,
			o,
			r = dt(e)
		function n() {
			var i
			;(clearTimeout(o), (i = a) == null || i.disconnect(), (a = null))
		}
		function l(i, u) {
			;(i === void 0 && (i = !1), u === void 0 && (u = 1), n())
			let d = e.getBoundingClientRect(),
				{ left: c, top: f, width: m, height: h } = d
			if ((i || t(), !m || !h)) return
			let g = Bo(f),
				p = Bo(r.clientWidth - (c + m)),
				x = Bo(r.clientHeight - (f + h)),
				v = Bo(c),
				b = { rootMargin: -g + 'px ' + -p + 'px ' + -x + 'px ' + -v + 'px', threshold: Ue(0, mt(1, u)) || 1 },
				L = !0
			function I(T) {
				let A = T[0].intersectionRatio
				if (A !== u) {
					if (!L) return l()
					A
						? l(!1, A)
						: (o = setTimeout(() => {
								l(!1, 1e-7)
							}, 1e3))
				}
				;(A === 1 && !Fc(d, e.getBoundingClientRect()) && l(), (L = !1))
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
			c = r || n ? [...(d ? ha(d) : []), ...(t ? ha(t) : [])] : []
		c.forEach((v) => {
			;(r && v.addEventListener('scroll', a, { passive: !0 }), n && v.addEventListener('resize', a))
		})
		let f = d && i ? cb(d, a) : null,
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
			p = u ? Ca(e) : null
		u && x()
		function x() {
			let v = Ca(e)
			;(p && !Fc(p, v) && a(), (p = v), (g = requestAnimationFrame(x)))
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
	var ZC,
		Rc,
		ub,
		Oc,
		Bc,
		Nc,
		_c,
		zc,
		Hc,
		$s,
		Uc,
		Js,
		Ys = y(() => {
			Cc()
			rn()
			yc()
			ZC = it(0)
			Rc = 25
			ub = async function (e) {
				let t = this.getOffsetParent || Ec,
					a = this.getDimensions,
					o = await a(e.floating)
				return {
					reference: ib(e.reference, await t(e.floating), e.strategy),
					floating: { x: 0, y: 0, width: o.width, height: o.height }
				}
			}
			Oc = {
				convertOffsetParentRelativeRectToViewportRelativeRect: eb,
				getDocumentElement: dt,
				getClippingRect: sb,
				getOffsetParent: Ec,
				getElementRects: ub,
				getClientRects: tb,
				getDimensions: lb,
				getScale: oo,
				isElement: tt,
				isRTL: db
			}
			;((Bc = gc),
				(Nc = hc),
				(_c = fc),
				(zc = vc),
				(Hc = pc),
				($s = cc),
				(Uc = xc),
				(Js = (e, t, a) => {
					let o = new Map(),
						r = { platform: Oc, ...a },
						n = { ...r.platform, _c: o }
					return dc(e, t, { ...r, platform: n })
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
	function Vc(e) {
		return typeof window > 'u' ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1
	}
	function qc(e, t) {
		let a = Vc(e)
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
	function Gc(e) {
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
			[c, f] = k({ x: 0, y: 0, strategy: a, placement: t, middlewareData: {}, isPositioned: !1 }),
			[m, h] = k(o)
		fn(m, o) || h(o)
		let [g, p] = k(null),
			[x, v] = k(null),
			C = W((M) => {
				M !== T.current && ((T.current = M), p(M))
			}, []),
			b = W((M) => {
				M !== A.current && ((A.current = M), v(M))
			}, []),
			L = n || g,
			I = l || x,
			T = w(null),
			A = w(null),
			R = w(c),
			B = u != null,
			X = Zs(u),
			O = Zs(r),
			U = Zs(d),
			$ = W(() => {
				if (!T.current || !A.current) return
				let M = { placement: t, strategy: a, middleware: m }
				;(O.current && (M.platform = O.current),
					Js(T.current, A.current, M).then((q) => {
						let re = { ...q, isPositioned: U.current !== !1 }
						z.current &&
							!fn(R.current, re) &&
							((R.current = re),
							br(() => {
								f(re)
							}))
					}))
			}, [m, t, a, O, U])
		cn(() => {
			d === !1 &&
				R.current.isPositioned &&
				((R.current.isPositioned = !1), f((M) => ({ ...M, isPositioned: !1 })))
		}, [d])
		let z = w(!1)
		;(cn(
			() => (
				(z.current = !0),
				() => {
					z.current = !1
				}
			),
			[]
		),
			cn(() => {
				if ((L && (T.current = L), I && (A.current = I), L && I)) {
					if (X.current) return X.current(L, I, $)
					$()
				}
			}, [L, I, $, X, B]))
		let Q = we(() => ({ reference: T, floating: A, setReference: C, setFloating: b }), [C, b]),
			j = we(() => ({ reference: L, floating: I }), [L, I]),
			oe = we(() => {
				let M = { position: a, left: 0, top: 0 }
				if (!j.floating) return M
				let q = qc(j.floating, c.x),
					re = qc(j.floating, c.y)
				return i
					? {
							...M,
							transform: 'translate(' + q + 'px, ' + re + 'px)',
							...(Vc(j.floating) >= 1.5 && { willChange: 'transform' })
						}
					: { position: a, left: q, top: re }
			}, [a, i, j.floating, c.x, c.y])
		return we(() => ({ ...c, update: $, refs: Q, elements: j, floatingStyles: oe }), [c, $, Q, j, oe])
	}
	var fb,
		pb,
		cn,
		mb,
		Wc,
		jc,
		Xc,
		Kc,
		$c,
		Jc,
		Yc,
		Zc = y(() => {
			Ys()
			Ys()
			ee()
			ee()
			qa()
			;((fb = typeof document < 'u'), (pb = function () {}), (cn = fb ? Pt : pb))
			;((mb = (e) => {
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
				(Wc = (e, t) => {
					let a = Bc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(jc = (e, t) => {
					let a = Nc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Xc = (e, t) => ({ fn: Uc(e).fn, options: [e, t] })),
				(Kc = (e, t) => {
					let a = _c(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				($c = (e, t) => {
					let a = zc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Jc = (e, t) => {
					let a = Hc(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Yc = (e, t) => {
					let a = mb(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}))
		})
	var gb,
		Qc,
		ef,
		tf = y(() => {
			ee()
			De()
			N()
			;((gb = 'Arrow'),
				(Qc = S((e, t) => {
					let { children: a, width: o = 10, height: r = 5, ...n } = e
					return s(K.svg, {
						...n,
						ref: t,
						width: o,
						height: r,
						viewBox: '0 0 30 10',
						preserveAspectRatio: 'none',
						children: e.asChild ? a : s('polygon', { points: '0,0 30,0 15,10' })
					})
				})))
			Qc.displayName = gb
			ef = Qc
		})
	function Lb(e) {
		return e !== null
	}
	function tl(e) {
		let [t, a = 'center'] = e.split('-')
		return [t, a]
	}
	var Qs,
		af,
		Bt,
		xb,
		of,
		rf,
		nf,
		sf,
		el,
		vb,
		Cb,
		lf,
		uf,
		bb,
		df,
		Ib,
		ba,
		ro,
		no,
		so,
		La = y(() => {
			'use client'
			ee()
			Zc()
			tf()
			Be()
			Ge()
			De()
			Mt()
			Tt()
			Yr()
			N()
			;((Qs = 'Popper'),
				([af, Bt] = Le(Qs)),
				([xb, of] = af(Qs)),
				(rf = (e) => {
					let { __scopePopper: t, children: a } = e,
						[o, r] = k(null),
						[n, l] = k(void 0)
					return s(xb, {
						scope: t,
						anchor: o,
						onAnchorChange: r,
						placementState: n,
						setPlacementState: l,
						children: a
					})
				}))
			rf.displayName = Qs
			;((nf = 'PopperAnchor'),
				(sf = S((e, t) => {
					let { __scopePopper: a, virtualRef: o, ...r } = e,
						n = of(nf, a),
						l = w(null),
						i = n.onAnchorChange,
						u = W(
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
						: s(K.div, { 'data-radix-popper-side': m, 'data-radix-popper-align': h, ...r, ref: d })
				})))
			sf.displayName = nf
			;((el = 'PopperContent'),
				([vb, Cb] = af(el)),
				(lf = S((e, t) => {
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
						x = of(el, a),
						[v, C] = k(null),
						b = te(t, (de) => C(de)),
						[L, I] = k(null),
						T = to(L),
						A = T?.width ?? 0,
						R = T?.height ?? 0,
						B = o + (n !== 'center' ? '-' + n : ''),
						X = typeof c == 'number' ? c : { top: 0, right: 0, bottom: 0, left: 0, ...c },
						O = Array.isArray(d) ? d : [d],
						U = O.length > 0,
						$ = { padding: X, boundary: O.filter(Lb), altBoundary: U },
						{
							refs: z,
							floatingStyles: Q,
							placement: j,
							isPositioned: oe,
							middlewareData: M
						} = Gc({
							strategy: 'fixed',
							placement: B,
							whileElementsMounted: (...de) => Ks(...de, { animationFrame: h === 'always' }),
							elements: { reference: x.anchor },
							middleware: [
								Wc({ mainAxis: r + R, alignmentAxis: l }),
								u &&
									jc({ mainAxis: !0, crossAxis: !1, limiter: f === 'partial' ? Xc() : void 0, ...$ }),
								u && Kc({ ...$ }),
								$c({
									...$,
									apply: ({ elements: de, rects: Ce, availableWidth: ce, availableHeight: fe }) => {
										let { width: be, height: Me } = Ce.reference,
											ze = de.floating.style
										;(ze.setProperty('--radix-popper-available-width', `${ce}px`),
											ze.setProperty('--radix-popper-available-height', `${fe}px`),
											ze.setProperty('--radix-popper-anchor-width', `${be}px`),
											ze.setProperty('--radix-popper-anchor-height', `${Me}px`))
									}
								}),
								L && Yc({ element: L, padding: i }),
								Ib({ arrowWidth: A, arrowHeight: R }),
								m && Jc({ strategy: 'referenceHidden', ...$, boundary: U ? $.boundary : void 0 })
							]
						}),
						q = x.setPlacementState
					Ie(
						() => (
							q(j),
							() => {
								q(void 0)
							}
						),
						[j, q]
					)
					let [re, pe] = tl(j),
						ne = Se(g)
					Ie(() => {
						oe && ne?.()
					}, [oe, ne])
					let se = M.arrow?.x,
						ue = M.arrow?.y,
						ke = M.arrow?.centerOffset !== 0,
						[xe, H] = k()
					return (
						Ie(() => {
							v && H(window.getComputedStyle(v).zIndex)
						}, [v]),
						s('div', {
							ref: z.setFloating,
							'data-radix-popper-content-wrapper': '',
							style: {
								...Q,
								transform: oe ? Q.transform : 'translate(0, -200%)',
								minWidth: 'max-content',
								zIndex: xe,
								'--radix-popper-transform-origin': [M.transformOrigin?.x, M.transformOrigin?.y].join(
									' '
								),
								...(M.hide?.referenceHidden && { visibility: 'hidden', pointerEvents: 'none' })
							},
							dir: e.dir,
							children: s(vb, {
								scope: a,
								placedSide: re,
								placedAlign: pe,
								onArrowChange: I,
								arrowX: se,
								arrowY: ue,
								shouldHideArrow: ke,
								children: s(K.div, {
									'data-side': re,
									'data-align': pe,
									...p,
									ref: b,
									style: { ...p.style, animation: oe ? void 0 : 'none' }
								})
							})
						})
					)
				})))
			lf.displayName = el
			;((uf = 'PopperArrow'),
				(bb = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }),
				(df = S(function (t, a) {
					let { __scopePopper: o, ...r } = t,
						n = Cb(uf, o),
						l = bb[n.placedSide]
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
						children: s(ef, { ...r, ref: a, style: { ...r.style, display: 'block' } })
					})
				})))
			df.displayName = uf
			Ib = (e) => ({
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
			;((ba = rf), (ro = sf), (no = lf), (so = df))
		})
	function Ab(e, t) {
		return t !== 'rtl' ? e : e === 'ArrowLeft' ? 'ArrowRight' : e === 'ArrowRight' ? 'ArrowLeft' : e
	}
	function Mb(e, t, a) {
		let o = Ab(e.key, a)
		if (
			!(t === 'vertical' && ['ArrowLeft', 'ArrowRight'].includes(o)) &&
			!(t === 'horizontal' && ['ArrowUp', 'ArrowDown'].includes(o))
		)
			return Tb[o]
	}
	function gf(e, t = !1) {
		let a = document.activeElement
		for (let o of e) if (o === a || (o.focus({ preventScroll: t }), document.activeElement !== a)) return
	}
	function Db(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	var ol,
		Sb,
		zo,
		rl,
		cf,
		wb,
		yb,
		lo,
		Rb,
		Pb,
		ff,
		kb,
		pf,
		mf,
		Tb,
		pn,
		mn,
		Ho = y(() => {
			'use client'
			ee()
			Je()
			yr()
			Be()
			Ge()
			Xt()
			De()
			Mt()
			At()
			Wa()
			N()
			;((ol = 'rovingFocusGroup.onEntryFocus'),
				(Sb = { bubbles: !1, cancelable: !0 }),
				(zo = 'RovingFocusGroup'),
				([rl, cf, wb] = Ga(zo)),
				([yb, lo] = Le(zo, [wb])),
				([Rb, Pb] = yb(zo)),
				(ff = S((e, t) =>
					s(rl.Provider, {
						scope: e.__scopeRovingFocusGroup,
						children: s(rl.Slot, { scope: e.__scopeRovingFocusGroup, children: s(kb, { ...e, ref: t }) })
					})
				)))
			ff.displayName = zo
			;((kb = S((e, t) => {
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
					g = pt(n),
					[p, x] = Ee({ prop: l, defaultProp: i ?? null, onChange: u, caller: zo }),
					[v, C] = k(!1),
					b = Se(d),
					L = cf(a),
					I = w(!1),
					[T, A] = k(0)
				return (
					E(() => {
						let R = m.current
						if (R) return (R.addEventListener(ol, b), () => R.removeEventListener(ol, b))
					}, [b]),
					s(Rb, {
						scope: a,
						orientation: o,
						dir: g,
						loop: r,
						currentTabStopId: p,
						onItemFocus: W((R) => x(R), [x]),
						onItemShiftTab: W(() => C(!0), []),
						onFocusableItemAdd: W(() => A((R) => R + 1), []),
						onFocusableItemRemove: W(() => A((R) => R - 1), []),
						children: s(K.div, {
							tabIndex: v || T === 0 ? -1 : 0,
							'data-orientation': o,
							...f,
							ref: h,
							style: { outline: 'none', ...e.style },
							onMouseDown: _(e.onMouseDown, () => {
								I.current = !0
							}),
							onFocus: _(e.onFocus, (R) => {
								let B = !I.current
								if (R.target === R.currentTarget && B && !v) {
									let X = new CustomEvent(ol, Sb)
									if ((R.currentTarget.dispatchEvent(X), !X.defaultPrevented)) {
										let O = L().filter((j) => j.focusable),
											U = O.find((j) => j.active),
											$ = O.find((j) => j.id === p),
											Q = [U, $, ...O].filter(Boolean).map((j) => j.ref.current)
										gf(Q, c)
									}
								}
								I.current = !1
							}),
							onBlur: _(e.onBlur, () => C(!1))
						})
					})
				)
			})),
				(pf = 'RovingFocusGroupItem'),
				(mf = S((e, t) => {
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
						c = Pb(pf, a),
						f = c.currentTabStopId === d,
						m = cf(a),
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
							children: s(K.span, {
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
									let v = Mb(x, c.orientation, c.dir)
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
											b = c.loop ? Db(b, L + 1) : b.slice(L + 1)
										}
										setTimeout(() => gf(b))
									}
								}),
								children: typeof l == 'function' ? l({ isCurrentTabStop: f, hasTabStop: p != null }) : l
							})
						})
					)
				})))
			mf.displayName = pf
			Tb = {
				ArrowLeft: 'prev',
				ArrowUp: 'prev',
				ArrowRight: 'next',
				ArrowDown: 'next',
				PageUp: 'first',
				Home: 'first',
				PageDown: 'last',
				End: 'last'
			}
			;((pn = ff), (mn = mf))
		})
	function Uf(e) {
		return e ? 'open' : 'closed'
	}
	function hn(e) {
		return e === 'indeterminate'
	}
	function ml(e) {
		return hn(e) ? 'indeterminate' : e ? 'checked' : 'unchecked'
	}
	function tL(e) {
		let t = document.activeElement
		for (let a of e) if (a === t || (a.focus(), document.activeElement !== t)) return
	}
	function aL(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	function oL(e, t, a) {
		let r = t.length > 1 && Array.from(t).every((d) => d === t[0]) ? t[0] : t,
			n = a ? e.indexOf(a) : -1,
			l = aL(e, Math.max(n, 0))
		r.length === 1 && (l = l.filter((d) => d !== a))
		let u = l.find((d) => d.toLowerCase().startsWith(r.toLowerCase()))
		return u !== a ? u : void 0
	}
	function rL(e, t) {
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
	function nL(e, t) {
		if (!t) return !1
		let a = { x: e.clientX, y: e.clientY }
		return rL(a, t)
	}
	function Vo(e) {
		return (t) => (t.pointerType === 'mouse' ? e(t) : void 0)
	}
	var nl,
		Eb,
		vf,
		Ob,
		Fb,
		Bb,
		Go,
		qo,
		Nb,
		_b,
		Ia,
		sl,
		Wo,
		Cf,
		bf,
		Jt,
		zb,
		jo,
		Lf,
		Hb,
		ll,
		il,
		Ub,
		If,
		Sf,
		ot,
		qb,
		ul,
		wf,
		Vb,
		Gb,
		Wb,
		dl,
		jb,
		cl,
		Xb,
		yf,
		gn,
		xf,
		xn,
		Rf,
		Kb,
		Pf,
		kf,
		$b,
		Jb,
		Tf,
		Af,
		Mf,
		fl,
		Df,
		Yb,
		Ef,
		Zb,
		Of,
		Qb,
		Ff,
		pl,
		eL,
		Bf,
		Nf,
		Uo,
		_f,
		zf,
		Hf,
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
		tp,
		ap,
		op,
		gl = y(() => {
			'use client'
			ee()
			Je()
			yr()
			Be()
			Ge()
			Wa()
			Po()
			Tr()
			Pr()
			Xt()
			La()
			La()
			ko()
			jt()
			De()
			Ho()
			Ho()
			Wt()
			Mt()
			_r()
			Fr()
			N()
			;((nl = ['Enter', ' ']),
				(Eb = ['ArrowDown', 'PageUp', 'Home']),
				(vf = ['ArrowUp', 'PageDown', 'End']),
				(Ob = [...Eb, ...vf]),
				(Fb = { ltr: [...nl, 'ArrowRight'], rtl: [...nl, 'ArrowLeft'] }),
				(Bb = { ltr: ['ArrowLeft'], rtl: ['ArrowRight'] }),
				(Go = 'Menu'),
				([qo, Nb, _b] = Ga(Go)),
				([Ia, sl] = Le(Go, [_b, Bt, lo])),
				(Wo = Bt()),
				(Cf = lo()),
				([bf, Jt] = Ia(Go)),
				([zb, jo] = Ia(Go)),
				(Lf = (e) => {
					let { __scopeMenu: t, open: a = !1, children: o, dir: r, onOpenChange: n, modal: l = !0 } = e,
						i = Wo(t),
						[u, d] = k(null),
						c = w(!1),
						f = Se(n),
						m = pt(r)
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
						s(ba, {
							...i,
							children: s(bf, {
								scope: t,
								open: a,
								onOpenChange: f,
								content: u,
								onContentChange: d,
								children: s(zb, {
									scope: t,
									onClose: W(() => f(!1), [f]),
									isUsingKeyboardRef: c,
									dir: m,
									modal: l,
									children: o
								})
							})
						})
					)
				}))
			Lf.displayName = Go
			;((Hb = 'MenuAnchor'),
				(ll = S((e, t) => {
					let { __scopeMenu: a, ...o } = e,
						r = Wo(a)
					return s(ro, { ...r, ...o, ref: t })
				})))
			ll.displayName = Hb
			;((il = 'MenuPortal'),
				([Ub, If] = Ia(il, { forceMount: void 0 })),
				(Sf = (e) => {
					let { __scopeMenu: t, forceMount: a, children: o, container: r } = e,
						n = Jt(il, t)
					return s(Ub, {
						scope: t,
						forceMount: a,
						children: s(ye, {
							present: a || n.open,
							children: s(Et, { asChild: !0, container: r, children: o })
						})
					})
				}))
			Sf.displayName = il
			;((ot = 'MenuContent'),
				([qb, ul] = Ia(ot)),
				(wf = S((e, t) => {
					let a = If(ot, e.__scopeMenu),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = Jt(ot, e.__scopeMenu),
						l = jo(ot, e.__scopeMenu)
					return s(qo.Provider, {
						scope: e.__scopeMenu,
						children: s(ye, {
							present: o || n.open,
							children: s(qo.Slot, {
								scope: e.__scopeMenu,
								children: l.modal ? s(Vb, { ...r, ref: t }) : s(Gb, { ...r, ref: t })
							})
						})
					})
				})),
				(Vb = S((e, t) => {
					let a = Jt(ot, e.__scopeMenu),
						o = w(null),
						r = te(t, o)
					return (
						E(() => {
							let n = o.current
							if (n) return Za(n)
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
				(Gb = S((e, t) => {
					let a = Jt(ot, e.__scopeMenu)
					return s(dl, {
						...e,
						ref: t,
						trapFocus: !1,
						disableOutsidePointerEvents: !1,
						disableOutsideScroll: !1,
						onDismiss: () => a.onOpenChange(!1)
					})
				})),
				(Wb = $e('MenuContent.ScrollLock')),
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
						x = Jt(ot, a),
						v = jo(ot, a),
						C = Wo(a),
						b = Cf(a),
						L = Nb(a),
						[I, T] = k(null),
						A = w(null),
						R = te(t, A, x.onContentChange),
						B = w(0),
						X = w(''),
						O = w(0),
						U = w(null),
						$ = w('right'),
						z = w(0),
						Q = g ? fa : Ze,
						j = g ? { as: Wb, allowPinchZoom: !0 } : void 0,
						oe = (q) => {
							let re = X.current + q,
								pe = L().filter((H) => !H.disabled),
								ne = document.activeElement,
								se = pe.find((H) => H.ref.current === ne)?.textValue,
								ue = pe.map((H) => H.textValue),
								ke = oL(ue, re, se),
								xe = pe.find((H) => H.textValue === ke)?.ref.current
							;((function H(de) {
								;((X.current = de),
									window.clearTimeout(B.current),
									de !== '' && (B.current = window.setTimeout(() => H(''), 1e3)))
							})(re),
								xe && setTimeout(() => xe.focus()))
						}
					;(E(() => () => window.clearTimeout(B.current), []), Xa())
					let M = W((q) => $.current === U.current?.side && nL(q, U.current?.area), [])
					return s(qb, {
						scope: a,
						searchRef: X,
						onItemEnter: W(
							(q) => {
								M(q) && q.preventDefault()
							},
							[M]
						),
						onItemLeave: W(
							(q) => {
								M(q) || (A.current?.focus(), T(null))
							},
							[M]
						),
						onTriggerLeave: W(
							(q) => {
								M(q) && q.preventDefault()
							},
							[M]
						),
						pointerGraceTimerRef: O,
						onPointerGraceIntentChange: W((q) => {
							U.current = q
						}, []),
						children: s(Q, {
							...j,
							children: s(ia, {
								asChild: !0,
								trapped: r,
								onMountAutoFocus: _(n, (q) => {
									;(q.preventDefault(), A.current?.focus({ preventScroll: !0 }))
								}),
								onUnmountAutoFocus: l,
								children: s(Dt, {
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
										onCurrentTabStopIdChange: T,
										onEntryFocus: _(u, (q) => {
											v.isUsingKeyboardRef.current || q.preventDefault()
										}),
										preventScrollOnEntryFocus: !0,
										children: s(no, {
											role: 'menu',
											'aria-orientation': 'vertical',
											'data-state': Uf(x.open),
											'data-radix-menu-content': '',
											dir: v.dir,
											...C,
											...p,
											ref: R,
											style: { outline: 'none', ...p.style },
											onKeyDown: _(p.onKeyDown, (q) => {
												let pe =
														q.target.closest('[data-radix-menu-content]') ===
														q.currentTarget,
													ne = q.ctrlKey || q.altKey || q.metaKey,
													se = q.key.length === 1
												pe && (q.key === 'Tab' && q.preventDefault(), !ne && se && oe(q.key))
												let ue = A.current
												if (q.target !== ue || !Ob.includes(q.key)) return
												q.preventDefault()
												let xe = L()
													.filter((H) => !H.disabled)
													.map((H) => H.ref.current)
												;(vf.includes(q.key) && xe.reverse(), tL(xe))
											}),
											onBlur: _(e.onBlur, (q) => {
												q.currentTarget.contains(q.target) ||
													(window.clearTimeout(B.current), (X.current = ''))
											}),
											onPointerMove: _(
												e.onPointerMove,
												Vo((q) => {
													let re = q.target,
														pe = z.current !== q.clientX
													if (q.currentTarget.contains(re) && pe) {
														let ne = q.clientX > z.current ? 'right' : 'left'
														;(($.current = ne), (z.current = q.clientX))
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
			wf.displayName = ot
			;((jb = 'MenuGroup'),
				(cl = S((e, t) => {
					let { __scopeMenu: a, ...o } = e
					return s(K.div, { role: 'group', ...o, ref: t })
				})))
			cl.displayName = jb
			;((Xb = 'MenuLabel'),
				(yf = S((e, t) => {
					let { __scopeMenu: a, ...o } = e
					return s(K.div, { ...o, ref: t })
				})))
			yf.displayName = Xb
			;((gn = 'MenuItem'),
				(xf = 'menu.itemSelect'),
				(xn = S((e, t) => {
					let { disabled: a = !1, onSelect: o, ...r } = e,
						n = w(null),
						l = jo(gn, e.__scopeMenu),
						i = ul(gn, e.__scopeMenu),
						u = te(t, n),
						d = w(!1),
						c = () => {
							let f = n.current
							if (!a && f) {
								let m = new CustomEvent(xf, { bubbles: !0, cancelable: !0 })
								;(f.addEventListener(xf, (h) => o?.(h), { once: !0 }),
									wr(f, m),
									m.defaultPrevented ? (d.current = !1) : l.onClose())
							}
						}
					return s(Rf, {
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
			;((Rf = S((e, t) => {
				let { __scopeMenu: a, disabled: o = !1, textValue: r, ...n } = e,
					l = ul(gn, a),
					i = Cf(a),
					u = w(null),
					d = te(t, u),
					[c, f] = k(!1),
					[m, h] = k('')
				return (
					E(() => {
						let g = u.current
						g && h((g.textContent ?? '').trim())
					}, [n.children]),
					s(qo.ItemSlot, {
						scope: a,
						disabled: o,
						textValue: r ?? m,
						children: s(mn, {
							asChild: !0,
							...i,
							focusable: !o,
							children: s(K.div, {
								role: 'menuitem',
								'data-highlighted': c ? '' : void 0,
								'aria-disabled': o || void 0,
								'data-disabled': o ? '' : void 0,
								...n,
								ref: d,
								onPointerMove: _(
									e.onPointerMove,
									Vo((g) => {
										o
											? l.onItemLeave(g)
											: (l.onItemEnter(g),
												g.defaultPrevented || g.currentTarget.focus({ preventScroll: !0 }))
									})
								),
								onPointerLeave: _(
									e.onPointerLeave,
									Vo((g) => l.onItemLeave(g))
								),
								onFocus: _(e.onFocus, () => f(!0)),
								onBlur: _(e.onBlur, () => f(!1))
							})
						})
					})
				)
			})),
				(Kb = 'MenuCheckboxItem'),
				(Pf = S((e, t) => {
					let { checked: a = !1, onCheckedChange: o, ...r } = e
					return s(Df, {
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
			Pf.displayName = Kb
			;((kf = 'MenuRadioGroup'),
				([$b, Jb] = Ia(kf, { value: void 0, onValueChange: () => {} })),
				(Tf = S((e, t) => {
					let { value: a, onValueChange: o, ...r } = e,
						n = Se(o)
					return s($b, {
						scope: e.__scopeMenu,
						value: a,
						onValueChange: n,
						children: s(cl, { ...r, ref: t })
					})
				})))
			Tf.displayName = kf
			;((Af = 'MenuRadioItem'),
				(Mf = S((e, t) => {
					let { value: a, ...o } = e,
						r = Jb(Af, e.__scopeMenu),
						n = a === r.value
					return s(Df, {
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
			Mf.displayName = Af
			;((fl = 'MenuItemIndicator'),
				([Df, Yb] = Ia(fl, { checked: !1 })),
				(Ef = S((e, t) => {
					let { __scopeMenu: a, forceMount: o, ...r } = e,
						n = Yb(fl, a)
					return s(ye, {
						present: o || hn(n.checked) || n.checked === !0,
						children: s(K.span, { ...r, ref: t, 'data-state': ml(n.checked) })
					})
				})))
			Ef.displayName = fl
			;((Zb = 'MenuSeparator'),
				(Of = S((e, t) => {
					let { __scopeMenu: a, ...o } = e
					return s(K.div, { role: 'separator', 'aria-orientation': 'horizontal', ...o, ref: t })
				})))
			Of.displayName = Zb
			;((Qb = 'MenuArrow'),
				(Ff = S((e, t) => {
					let { __scopeMenu: a, ...o } = e,
						r = Wo(a)
					return s(so, { ...r, ...o, ref: t })
				})))
			Ff.displayName = Qb
			;((pl = 'MenuSub'),
				([eL, Bf] = Ia(pl)),
				(Nf = (e) => {
					let { __scopeMenu: t, children: a, open: o = !1, onOpenChange: r } = e,
						n = Jt(pl, t),
						l = Wo(t),
						[i, u] = k(null),
						[d, c] = k(null),
						f = Se(r)
					return (
						E(() => (n.open === !1 && f(!1), () => f(!1)), [n.open, f]),
						s(ba, {
							...l,
							children: s(bf, {
								scope: t,
								open: o,
								onOpenChange: f,
								content: d,
								onContentChange: c,
								children: s(eL, {
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
			Nf.displayName = pl
			;((Uo = 'MenuSubTrigger'),
				(_f = S((e, t) => {
					let a = Jt(Uo, e.__scopeMenu),
						o = jo(Uo, e.__scopeMenu),
						r = Bf(Uo, e.__scopeMenu),
						n = ul(Uo, e.__scopeMenu),
						l = w(null),
						{ pointerGraceTimerRef: i, onPointerGraceIntentChange: u } = n,
						d = { __scopeMenu: e.__scopeMenu },
						c = W(() => {
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
							children: s(Rf, {
								id: r.triggerId,
								'aria-haspopup': 'menu',
								'aria-expanded': a.open,
								'aria-controls': a.open ? r.contentId : void 0,
								'data-state': Uf(a.open),
								...e,
								ref: Ro(t, r.onTriggerChange),
								onClick: (f) => {
									;(e.onClick?.(f),
										!(e.disabled || f.defaultPrevented) &&
											(f.currentTarget.focus(), a.open || a.onOpenChange(!0)))
								},
								onPointerMove: _(
									e.onPointerMove,
									Vo((f) => {
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
									Vo((f) => {
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
										(Fb[o.dir].includes(f.key) &&
											(a.onOpenChange(!0), a.content?.focus(), f.preventDefault()))
								})
							})
						})
					)
				})))
			_f.displayName = Uo
			;((zf = 'MenuSubContent'),
				(Hf = S((e, t) => {
					let a = If(ot, e.__scopeMenu),
						{ forceMount: o = a.forceMount, align: r = 'start', ...n } = e,
						l = Jt(ot, e.__scopeMenu),
						i = jo(ot, e.__scopeMenu),
						u = Bf(zf, e.__scopeMenu),
						d = w(null),
						c = te(t, d)
					return s(qo.Provider, {
						scope: e.__scopeMenu,
						children: s(ye, {
							present: o || l.open,
							children: s(qo.Slot, {
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
											h = Bb[i.dir].includes(f.key)
										m && h && (l.onOpenChange(!1), u.trigger?.focus(), f.preventDefault())
									})
								})
							})
						})
					})
				})))
			Hf.displayName = zf
			;((qf = Lf),
				(Vf = ll),
				(Gf = Sf),
				(Wf = wf),
				(jf = cl),
				(Xf = yf),
				(Kf = xn),
				($f = Pf),
				(Jf = Tf),
				(Yf = Mf),
				(Zf = Ef),
				(Qf = Of),
				(ep = Ff),
				(tp = Nf),
				(ap = _f),
				(op = Hf))
		})
	var Nt = {}
	Ye(Nt, {
		Arrow: () => OL,
		CheckboxItem: () => TL,
		Content: () => yL,
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
		DropdownMenuSub: () => lp,
		DropdownMenuSubContent: () => Al,
		DropdownMenuSubTrigger: () => Tl,
		DropdownMenuTrigger: () => xl,
		Group: () => RL,
		Item: () => kL,
		ItemIndicator: () => DL,
		Label: () => PL,
		Portal: () => wL,
		RadioGroup: () => AL,
		RadioItem: () => ML,
		Root: () => IL,
		Separator: () => EL,
		Sub: () => FL,
		SubContent: () => NL,
		SubTrigger: () => BL,
		Trigger: () => SL,
		createDropdownMenuScope: () => iL
	})
	var vn,
		lL,
		iL,
		Ne,
		uL,
		rp,
		hl,
		np,
		xl,
		dL,
		vl,
		sp,
		Cl,
		cL,
		bl,
		fL,
		Ll,
		pL,
		Il,
		mL,
		Sl,
		gL,
		wl,
		hL,
		yl,
		xL,
		Rl,
		vL,
		Pl,
		CL,
		kl,
		lp,
		bL,
		Tl,
		LL,
		Al,
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
		DL,
		EL,
		OL,
		FL,
		BL,
		NL,
		ip = y(() => {
			'use client'
			ee()
			Je()
			Be()
			Ge()
			At()
			De()
			gl()
			gl()
			Xt()
			N()
			;((vn = 'DropdownMenu'),
				([lL, iL] = Le(vn, [sl])),
				(Ne = sl()),
				([uL, rp] = lL(vn)),
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
						u = Ne(t),
						d = w(null),
						[c, f] = Ee({ prop: r, defaultProp: n ?? !1, onChange: l, caller: vn })
					return s(uL, {
						scope: t,
						triggerId: Te(),
						triggerRef: d,
						contentId: Te(),
						open: c,
						onOpenChange: f,
						onOpenToggle: W(() => f((m) => !m), [f]),
						modal: i,
						children: s(qf, { ...u, open: c, onOpenChange: f, dir: o, modal: i, children: a })
					})
				}))
			hl.displayName = vn
			;((np = 'DropdownMenuTrigger'),
				(xl = S((e, t) => {
					let { __scopeDropdownMenu: a, disabled: o = !1, ...r } = e,
						n = rp(np, a),
						l = Ne(a)
					return s(Vf, {
						asChild: !0,
						...l,
						children: s(K.button, {
							type: 'button',
							id: n.triggerId,
							'aria-haspopup': 'menu',
							'aria-expanded': n.open,
							'aria-controls': n.open ? n.contentId : void 0,
							'data-state': n.open ? 'open' : 'closed',
							'data-disabled': o ? '' : void 0,
							disabled: o,
							...r,
							ref: Ro(t, n.triggerRef),
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
			xl.displayName = np
			;((dL = 'DropdownMenuPortal'),
				(vl = (e) => {
					let { __scopeDropdownMenu: t, ...a } = e,
						o = Ne(t)
					return s(Gf, { ...o, ...a })
				}))
			vl.displayName = dL
			;((sp = 'DropdownMenuContent'),
				(Cl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = rp(sp, a),
						n = Ne(a),
						l = w(!1)
					return s(Wf, {
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
			Cl.displayName = sp
			;((cL = 'DropdownMenuGroup'),
				(bl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(jf, { ...r, ...o, ref: t })
				})))
			bl.displayName = cL
			;((fL = 'DropdownMenuLabel'),
				(Ll = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(Xf, { ...r, ...o, ref: t })
				})))
			Ll.displayName = fL
			;((pL = 'DropdownMenuItem'),
				(Il = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(Kf, { ...r, ...o, ref: t })
				})))
			Il.displayName = pL
			;((mL = 'DropdownMenuCheckboxItem'),
				(Sl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s($f, { ...r, ...o, ref: t })
				})))
			Sl.displayName = mL
			;((gL = 'DropdownMenuRadioGroup'),
				(wl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(Jf, { ...r, ...o, ref: t })
				})))
			wl.displayName = gL
			;((hL = 'DropdownMenuRadioItem'),
				(yl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(Yf, { ...r, ...o, ref: t })
				})))
			yl.displayName = hL
			;((xL = 'DropdownMenuItemIndicator'),
				(Rl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(Zf, { ...r, ...o, ref: t })
				})))
			Rl.displayName = xL
			;((vL = 'DropdownMenuSeparator'),
				(Pl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(Qf, { ...r, ...o, ref: t })
				})))
			Pl.displayName = vL
			;((CL = 'DropdownMenuArrow'),
				(kl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(ep, { ...r, ...o, ref: t })
				})))
			kl.displayName = CL
			;((lp = (e) => {
				let { __scopeDropdownMenu: t, children: a, open: o, onOpenChange: r, defaultOpen: n } = e,
					l = Ne(t),
					[i, u] = Ee({ prop: o, defaultProp: n ?? !1, onChange: r, caller: 'DropdownMenuSub' })
				return s(tp, { ...l, open: i, onOpenChange: u, children: a })
			}),
				(bL = 'DropdownMenuSubTrigger'),
				(Tl = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(ap, { ...r, ...o, ref: t })
				})))
			Tl.displayName = bL
			;((LL = 'DropdownMenuSubContent'),
				(Al = S((e, t) => {
					let { __scopeDropdownMenu: a, ...o } = e,
						r = Ne(a)
					return s(op, {
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
			Al.displayName = LL
			;((IL = hl),
				(SL = xl),
				(wL = vl),
				(yL = Cl),
				(RL = bl),
				(PL = Ll),
				(kL = Il),
				(TL = Sl),
				(AL = wl),
				(ML = yl),
				(DL = Rl),
				(EL = Pl),
				(OL = kl),
				(FL = lp),
				(BL = Tl),
				(NL = Al))
		})
	var Cn = {}
	Ye(Cn, { Label: () => Ml, Root: () => zL })
	var _L,
		Ml,
		zL,
		up = y(() => {
			'use client'
			ee()
			De()
			N()
			;((_L = 'Label'),
				(Ml = S((e, t) =>
					s(K.label, {
						...e,
						ref: t,
						onMouseDown: (a) => {
							a.target.closest('button, input, select, textarea') ||
								(e.onMouseDown?.(a), !a.defaultPrevented && a.detail > 1 && a.preventDefault())
						}
					})
				)))
			Ml.displayName = _L
			zL = Ml
		})
	function Xo(e, [t, a]) {
		return Math.min(a, Math.max(t, e))
	}
	var Dl = y(() => {})
	var Yt = {}
	Ye(Yt, {
		Corner: () => oI,
		Root: () => QL,
		ScrollArea: () => Ol,
		ScrollAreaCorner: () => Hl,
		ScrollAreaScrollbar: () => Bl,
		ScrollAreaThumb: () => _l,
		ScrollAreaViewport: () => Fl,
		Scrollbar: () => tI,
		Thumb: () => aI,
		Viewport: () => eI,
		createScrollAreaScope: () => UL
	})
	function HL(e, t) {
		return Ha((a, o) => t[a][o] ?? a, e)
	}
	function Ln(e) {
		return e ? parseInt(e, 10) : 0
	}
	function hp(e, t) {
		let a = e / t
		return isNaN(a) ? 0 : a
	}
	function In(e) {
		let t = hp(e.viewport, e.content),
			a = e.scrollbar.paddingStart + e.scrollbar.paddingEnd,
			o = (e.scrollbar.size - a) * t
		return Math.max(o, 18)
	}
	function YL(e, t, a, o = 'ltr') {
		let r = In(a),
			n = r / 2,
			l = t || n,
			i = r - l,
			u = a.scrollbar.paddingStart + l,
			d = a.scrollbar.size - a.scrollbar.paddingEnd - i,
			c = a.content - a.viewport,
			f = o === 'ltr' ? [0, c] : [c * -1, 0]
		return xp([u, d], f)(e)
	}
	function dp(e, t, a = 'ltr') {
		let o = In(t),
			r = t.scrollbar.paddingStart + t.scrollbar.paddingEnd,
			n = t.scrollbar.size - r,
			l = t.content - t.viewport,
			i = n - o,
			u = a === 'ltr' ? [0, l] : [l * -1, 0],
			d = Xo(e, u)
		return xp([0, l], [0, i])(d)
	}
	function xp(e, t) {
		return (a) => {
			if (e[0] === e[1] || t[0] === t[1]) return t[0]
			let o = (t[1] - t[0]) / (e[1] - e[0])
			return t[0] + o * (a - e[0])
		}
	}
	function vp(e, t) {
		return e > 0 && e < t
	}
	function Sn(e, t) {
		let a = Se(e),
			o = w(0)
		return (
			E(() => () => window.clearTimeout(o.current), []),
			W(() => {
				;(window.clearTimeout(o.current), (o.current = window.setTimeout(a, t)))
			}, [a, t])
		)
	}
	function io(e, t) {
		let a = Se(t)
		Ie(() => {
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
		cp,
		UL,
		qL,
		rt,
		Ol,
		fp,
		Fl,
		VL,
		vt,
		Bl,
		GL,
		WL,
		pp,
		Nl,
		jL,
		XL,
		KL,
		mp,
		gp,
		bn,
		_l,
		$L,
		zl,
		Hl,
		JL,
		ZL,
		QL,
		eI,
		tI,
		aI,
		oI,
		Cp = y(() => {
			'use client'
			ee()
			De()
			jt()
			Ge()
			Be()
			Mt()
			Wa()
			Tt()
			Dl()
			Je()
			ee()
			N()
			;((El = 'ScrollArea'),
				([cp, UL] = Le(El)),
				([qL, rt] = cp(El)),
				(Ol = S((e, t) => {
					let { __scopeScrollArea: a, type: o = 'hover', dir: r, scrollHideDelay: n = 600, ...l } = e,
						[i, u] = k(null),
						[d, c] = k(null),
						[f, m] = k(null),
						[h, g] = k(null),
						[p, x] = k(null),
						[v, C] = k(0),
						[b, L] = k(0),
						[I, T] = k(!1),
						[A, R] = k(!1),
						B = te(t, (O) => u(O)),
						X = pt(r)
					return s(qL, {
						scope: a,
						type: o,
						dir: X,
						scrollHideDelay: n,
						scrollArea: i,
						viewport: d,
						onViewportChange: c,
						content: f,
						onContentChange: m,
						scrollbarX: h,
						onScrollbarXChange: g,
						scrollbarXEnabled: I,
						onScrollbarXEnabledChange: T,
						scrollbarY: p,
						onScrollbarYChange: x,
						scrollbarYEnabled: A,
						onScrollbarYEnabledChange: R,
						onCornerWidthChange: C,
						onCornerHeightChange: L,
						children: s(K.div, {
							dir: X,
							...l,
							ref: B,
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
			;((fp = 'ScrollAreaViewport'),
				(Fl = S((e, t) => {
					let { __scopeScrollArea: a, children: o, nonce: r, ...n } = e,
						l = rt(fp, a),
						i = w(null),
						u = te(t, i, l.onViewportChange)
					return D(Qe, {
						children: [
							s(VL, { nonce: r }),
							s(K.div, {
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
			Fl.displayName = fp
			;((VL = Io(
				({ nonce: e }) =>
					s('style', {
						dangerouslySetInnerHTML: {
							__html: '[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}'
						},
						nonce: e
					}),
				(e, t) => e.nonce === t.nonce
			)),
				(vt = 'ScrollAreaScrollbar'),
				(Bl = S((e, t) => {
					let { forceMount: a, ...o } = e,
						r = rt(vt, e.__scopeScrollArea),
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
							? s(GL, { ...o, ref: t, forceMount: a })
							: r.type === 'scroll'
								? s(WL, { ...o, ref: t, forceMount: a })
								: r.type === 'auto'
									? s(pp, { ...o, ref: t, forceMount: a })
									: r.type === 'always'
										? s(Nl, { ...o, ref: t, 'data-state': 'visible' })
										: null
					)
				})))
			Bl.displayName = vt
			;((GL = S((e, t) => {
				let { forceMount: a, ...o } = e,
					r = rt(vt, e.__scopeScrollArea),
					[n, l] = k(!1)
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
						children: s(pp, { 'data-state': n ? 'visible' : 'hidden', ...o, ref: t })
					})
				)
			})),
				(WL = S((e, t) => {
					let { forceMount: a, ...o } = e,
						r = rt(vt, e.__scopeScrollArea),
						n = e.orientation === 'horizontal',
						l = Sn(() => u('SCROLL_END'), 100),
						[i, u] = HL('hidden', {
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
				(pp = S((e, t) => {
					let a = rt(vt, e.__scopeScrollArea),
						{ forceMount: o, ...r } = e,
						[n, l] = k(!1),
						i = e.orientation === 'horizontal',
						u = Sn(() => {
							if (a.viewport) {
								let d = a.viewport.offsetWidth < a.viewport.scrollWidth,
									c = a.viewport.offsetHeight < a.viewport.scrollHeight
								l(i ? d : c)
							}
						}, 10)
					return (
						io(a.viewport, u),
						io(a.content, u),
						s(ye, {
							present: o || n,
							children: s(Nl, { 'data-state': n ? 'visible' : 'hidden', ...r, ref: t })
						})
					)
				})),
				(Nl = S((e, t) => {
					let { orientation: a = 'vertical', ...o } = e,
						r = rt(vt, e.__scopeScrollArea),
						n = w(null),
						l = w(0),
						[i, u] = k({ content: 0, viewport: 0, scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 } }),
						d = hp(i.viewport, i.content),
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
						return YL(m, l.current, i, h)
					}
					return a === 'horizontal'
						? s(jL, {
								...c,
								ref: t,
								onThumbPositionChange: () => {
									if (r.viewport && n.current) {
										let m = r.viewport.scrollLeft,
											h = dp(m, i, r.dir)
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
							? s(XL, {
									...c,
									ref: t,
									onThumbPositionChange: () => {
										if (r.viewport && n.current) {
											let m = r.viewport.scrollTop,
												h = dp(m, i)
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
				(jL = S((e, t) => {
					let { sizes: a, onSizesChange: o, ...r } = e,
						n = rt(vt, e.__scopeScrollArea),
						[l, i] = k(),
						u = w(null),
						d = te(t, u, n.onScrollbarXChange)
					return (
						E(() => {
							u.current && i(getComputedStyle(u.current))
						}, [u]),
						s(gp, {
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
									;(e.onWheelScroll(m), vp(m, f) && c.preventDefault())
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
				(XL = S((e, t) => {
					let { sizes: a, onSizesChange: o, ...r } = e,
						n = rt(vt, e.__scopeScrollArea),
						[l, i] = k(),
						u = w(null),
						d = te(t, u, n.onScrollbarYChange)
					return (
						E(() => {
							u.current && i(getComputedStyle(u.current))
						}, [u]),
						s(gp, {
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
									;(e.onWheelScroll(m), vp(m, f) && c.preventDefault())
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
				([KL, mp] = cp(vt)),
				(gp = S((e, t) => {
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
						h = rt(vt, a),
						[g, p] = k(null),
						x = te(t, (B) => p(B)),
						v = w(null),
						C = w(''),
						b = h.viewport,
						L = o.content - o.viewport,
						I = Se(c),
						T = Se(u),
						A = Sn(f, 10)
					function R(B) {
						if (v.current) {
							let X = B.clientX - v.current.left,
								O = B.clientY - v.current.top
							d({ x: X, y: O })
						}
					}
					return (
						E(() => {
							let B = (X) => {
								let O = X.target
								g?.contains(O) && I(X, L)
							}
							return (
								document.addEventListener('wheel', B, { passive: !1 }),
								() => document.removeEventListener('wheel', B, { passive: !1 })
							)
						}, [b, g, L, I]),
						E(T, [o, T]),
						io(g, A),
						io(h.content, A),
						s(KL, {
							scope: a,
							scrollbar: g,
							hasThumb: r,
							onThumbChange: Se(n),
							onThumbPointerUp: Se(l),
							onThumbPositionChange: T,
							onThumbPointerDown: Se(i),
							children: s(K.div, {
								...m,
								ref: x,
								style: { position: 'absolute', ...m.style },
								onPointerDown: _(e.onPointerDown, (B) => {
									B.button === 0 &&
										(B.target.setPointerCapture(B.pointerId),
										(v.current = g.getBoundingClientRect()),
										(C.current = document.body.style.webkitUserSelect),
										(document.body.style.webkitUserSelect = 'none'),
										h.viewport && (h.viewport.style.scrollBehavior = 'auto'),
										R(B))
								}),
								onPointerMove: _(e.onPointerMove, R),
								onPointerUp: _(e.onPointerUp, (B) => {
									let X = B.target
									;(X.hasPointerCapture(B.pointerId) && X.releasePointerCapture(B.pointerId),
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
						r = mp(bn, e.__scopeScrollArea)
					return s(ye, { present: a || r.hasThumb, children: s($L, { ref: t, ...o }) })
				})),
				($L = S((e, t) => {
					let { __scopeScrollArea: a, style: o, ...r } = e,
						n = rt(bn, a),
						l = mp(bn, a),
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
										let h = ZL(f, i)
										;((d.current = h), i())
									}
								}
								return (i(), f.addEventListener('scroll', m), () => f.removeEventListener('scroll', m))
							}
						}, [n.viewport, c, i]),
						s(K.div, {
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
					let a = rt(zl, e.__scopeScrollArea),
						o = !!(a.scrollbarX && a.scrollbarY)
					return a.type !== 'scroll' && o ? s(JL, { ...e, ref: t }) : null
				})))
			Hl.displayName = zl
			JL = S((e, t) => {
				let { __scopeScrollArea: a, ...o } = e,
					r = rt(zl, a),
					[n, l] = k(0),
					[i, u] = k(0),
					d = !!(n && i)
				return (
					io(r.scrollbarX, () => {
						let c = r.scrollbarX?.offsetHeight || 0
						;(r.onCornerHeightChange(c), u(c))
					}),
					io(r.scrollbarY, () => {
						let c = r.scrollbarY?.offsetWidth || 0
						;(r.onCornerWidthChange(c), l(c))
					}),
					d
						? s(K.div, {
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
			ZL = (e, t = () => {}) => {
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
			;((QL = Ol), (eI = Fl), (tI = Bl), (aI = _l), (oI = Hl))
		})
	var qe = {}
	Ye(qe, {
		Arrow: () => Kp,
		Content: () => kp,
		Group: () => Fp,
		Icon: () => yp,
		Item: () => zp,
		ItemIndicator: () => qp,
		ItemText: () => Hp,
		Label: () => Np,
		Portal: () => Pp,
		Root: () => bp,
		ScrollDownButton: () => Gp,
		ScrollUpButton: () => Vp,
		Select: () => bp,
		SelectArrow: () => Kp,
		SelectContent: () => kp,
		SelectGroup: () => Fp,
		SelectIcon: () => yp,
		SelectItem: () => zp,
		SelectItemIndicator: () => qp,
		SelectItemText: () => Hp,
		SelectLabel: () => Np,
		SelectPortal: () => Pp,
		SelectScrollDownButton: () => Gp,
		SelectScrollUpButton: () => Vp,
		SelectSeparator: () => jp,
		SelectTrigger: () => Ip,
		SelectValue: () => wp,
		SelectViewport: () => Ep,
		Separator: () => jp,
		Trigger: () => Ip,
		Value: () => wp,
		Viewport: () => Ep,
		createSelectScope: () => lI,
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
			[v, C] = k(null),
			[b, L] = k(null),
			[I, T] = k(!1),
			A = pt(d),
			[R, B] = Ee({ prop: o, defaultProp: r ?? !1, onChange: n, caller: Sa }),
			[X, O] = Ee({ prop: l, defaultProp: i, onChange: u, caller: Sa }),
			U = w(null),
			$ = v ? !!g || !!v.closest('form') : !0,
			[z, Q] = k(new Set()),
			j = Te(),
			oe = Array.from(z)
				.map((pe) => pe.props.value)
				.join(';'),
			M = W((pe) => {
				Q((ne) => new Set(ne).add(pe))
			}, []),
			q = W((pe) => {
				Q((ne) => {
					let se = new Set(ne)
					return (se.delete(pe), se)
				})
			}, []),
			re = {
				required: h,
				trigger: v,
				onTriggerChange: C,
				valueNode: b,
				onValueNodeChange: L,
				valueNodeHasChildren: I,
				onValueNodeHasChildrenChange: T,
				contentId: j,
				value: X,
				onValueChange: O,
				open: R,
				onOpenChange: B,
				dir: A,
				triggerPointerDownPosRef: U,
				disabled: m,
				name: c,
				autoComplete: f,
				form: g,
				nativeOptions: z,
				nativeSelectKey: oe,
				isFormControl: $
			}
		return s(ba, {
			...x,
			children: s(iI, {
				scope: t,
				...re,
				children: s(yn.Provider, {
					scope: t,
					children: s(uI, {
						scope: t,
						onNativeOptionAdd: M,
						onNativeOptionRemove: q,
						children: wI(p) ? p(re) : a
					})
				})
			})
		})
	}
	function wI(e) {
		return typeof e == 'function'
	}
	function kn(e) {
		return e === '' || e === void 0
	}
	function Jp(e) {
		let t = Se(e),
			a = w(''),
			o = w(0),
			r = W(
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
			n = W(() => {
				;((a.current = ''), window.clearTimeout(o.current))
			}, [])
		return (E(() => () => window.clearTimeout(o.current), []), [a, r, n])
	}
	function Yp(e, t, a) {
		let r = t.length > 1 && Array.from(t).every((d) => d === t[0]) ? t[0] : t,
			n = a ? e.indexOf(a) : -1,
			l = yI(e, Math.max(n, 0))
		r.length === 1 && (l = l.filter((d) => d !== a))
		let u = l.find((d) => d.textValue.toLowerCase().startsWith(r.toLowerCase()))
		return u !== a ? u : void 0
	}
	function yI(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	var rI,
		nI,
		Sa,
		yn,
		Rn,
		sI,
		wa,
		lI,
		Pn,
		iI,
		Qt,
		uI,
		dI,
		cI,
		bp,
		Lp,
		Ip,
		Sp,
		wp,
		fI,
		yp,
		Rp,
		pI,
		mI,
		Pp,
		Zt,
		kp,
		Tp,
		ct,
		Ap,
		ea,
		gI,
		hI,
		Mp,
		xI,
		Dp,
		vI,
		Ul,
		CI,
		jl,
		ql,
		Ep,
		Op,
		bI,
		LI,
		Fp,
		Bp,
		Np,
		wn,
		II,
		_p,
		zp,
		Ko,
		Hp,
		Up,
		qp,
		Vl,
		Vp,
		Gl,
		Gp,
		Wp,
		SI,
		jp,
		Xp,
		Kp,
		$p,
		Xl,
		Zp = y(() => {
			'use client'
			ee()
			qa()
			Dl()
			Je()
			yr()
			Be()
			Ge()
			Wa()
			Po()
			Tr()
			Pr()
			Xt()
			La()
			La()
			ko()
			jt()
			De()
			Wt()
			Mt()
			At()
			Tt()
			Jr()
			ns()
			_r()
			Fr()
			N()
			;((rI = [' ', 'Enter', 'ArrowUp', 'ArrowDown']),
				(nI = [' ', 'Enter']),
				(Sa = 'Select'),
				([yn, Rn, sI] = Ga(Sa)),
				([wa, lI] = Le(Sa, [sI, Bt])),
				(Pn = Bt()),
				([iI, Qt] = wa(Sa)),
				([uI, dI] = wa(Sa)),
				(cI = 'SelectProvider'))
			Wl.displayName = cI
			bp = (e) => {
				let { __scopeSelect: t, children: a, ...o } = e
				return s(Wl, {
					__scopeSelect: t,
					...o,
					internal_do_not_use_render: ({ isFormControl: r }) =>
						D(Qe, { children: [a, r ? s(Xl, { __scopeSelect: t }) : null] })
				})
			}
			bp.displayName = Sa
			;((Lp = 'SelectTrigger'),
				(Ip = S((e, t) => {
					let { __scopeSelect: a, disabled: o = !1, ...r } = e,
						n = Pn(a),
						l = Qt(Lp, a),
						i = l.disabled || o,
						u = te(t, l.onTriggerChange),
						d = Rn(a),
						c = w('touch'),
						[f, m, h] = Jp((p) => {
							let x = d().filter((b) => !b.disabled),
								v = x.find((b) => b.value === l.value),
								C = Yp(x, p, v)
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
					return s(ro, {
						asChild: !0,
						...n,
						children: s(K.button, {
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
									!(x && p.key === ' ') && rI.includes(p.key) && (g(), p.preventDefault()))
							})
						})
					})
				})))
			Ip.displayName = Lp
			;((Sp = 'SelectValue'),
				(wp = S((e, t) => {
					let { __scopeSelect: a, className: o, style: r, children: n, placeholder: l = '', ...i } = e,
						u = Qt(Sp, a),
						{ onValueNodeHasChildrenChange: d } = u,
						c = n !== void 0,
						f = te(t, u.onValueNodeChange)
					Ie(() => {
						d(c)
					}, [d, c])
					let m = kn(u.value)
					return s(K.span, {
						...i,
						asChild: m ? !1 : i.asChild,
						ref: f,
						style: { pointerEvents: 'none' },
						children: s(Ze, { children: m ? l : n }, m ? 'placeholder' : 'value')
					})
				})))
			wp.displayName = Sp
			;((fI = 'SelectIcon'),
				(yp = S((e, t) => {
					let { __scopeSelect: a, children: o, ...r } = e
					return s(K.span, { 'aria-hidden': !0, ...r, ref: t, children: o || '\u25BC' })
				})))
			yp.displayName = fI
			;((Rp = 'SelectPortal'),
				([pI, mI] = wa(Rp, { forceMount: void 0 })),
				(Pp = (e) => {
					let { __scopeSelect: t, forceMount: a, ...o } = e
					return s(pI, { scope: e.__scopeSelect, forceMount: a, children: s(Et, { asChild: !0, ...o }) })
				}))
			Pp.displayName = Rp
			;((Zt = 'SelectContent'),
				(kp = S((e, t) => {
					let a = mI(Zt, e.__scopeSelect),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = Qt(Zt, e.__scopeSelect),
						[l, i] = k()
					return (
						Ie(() => {
							i(new DocumentFragment())
						}, []),
						s(ye, {
							present: o || n.open,
							children: ({ present: u }) => (u ? s(Mp, { ...r, ref: t }) : s(Tp, { ...r, fragment: l }))
						})
					)
				})))
			kp.displayName = Zt
			Tp = S((e, t) => {
				let { __scopeSelect: a, children: o, fragment: r } = e
				return r
					? yo(
							s(Ap, {
								scope: a,
								children: s(yn.Slot, { scope: a, children: s('div', { ref: t, children: o }) })
							}),
							r
						)
					: null
			})
			Tp.displayName = 'SelectContentFragment'
			;((ct = 10),
				([Ap, ea] = wa(Zt)),
				(gI = 'SelectContentImpl'),
				(hI = $e('SelectContent.RemoveScroll')),
				(Mp = S((e, t) => {
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
						[b, L] = k(null),
						[I, T] = k(null),
						A = te(t, (H) => L(H)),
						[R, B] = k(null),
						[X, O] = k(null),
						U = Rn(a),
						[$, z] = k(!1),
						Q = w(!1)
					;(E(() => {
						if (b) return Za(b)
					}, [b]),
						Xa())
					let j = W(
							(H) => {
								let [de, ...Ce] = U().map((be) => be.ref.current),
									[ce] = Ce.slice(-1),
									fe = document.activeElement
								for (let be of H)
									if (
										be === fe ||
										(be?.scrollIntoView({ block: 'nearest' }),
										be === de && I && (I.scrollTop = 0),
										be === ce && I && (I.scrollTop = I.scrollHeight),
										be?.focus(),
										document.activeElement !== fe)
									)
										return
							},
							[U, I]
						),
						oe = W(() => j([R, b]), [j, R, b])
					E(() => {
						$ && oe()
					}, [$, oe])
					let { onOpenChange: M, triggerPointerDownPosRef: q } = C
					;(E(() => {
						if (b) {
							let H = { x: 0, y: 0 },
								de = (ce) => {
									H = {
										x: Math.abs(Math.round(ce.pageX) - (q.current?.x ?? 0)),
										y: Math.abs(Math.round(ce.pageY) - (q.current?.y ?? 0))
									}
								},
								Ce = (ce) => {
									;(H.x <= 10 && H.y <= 10
										? ce.preventDefault()
										: ce.composedPath().includes(b) || M(!1),
										document.removeEventListener('pointermove', de),
										(q.current = null))
								}
							return (
								q.current !== null &&
									(document.addEventListener('pointermove', de),
									document.addEventListener('pointerup', Ce, { capture: !0, once: !0 })),
								() => {
									;(document.removeEventListener('pointermove', de),
										document.removeEventListener('pointerup', Ce, { capture: !0 }))
								}
							)
						}
					}, [b, M, q]),
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
					let [re, pe] = Jp((H) => {
							let de = U().filter((fe) => !fe.disabled),
								Ce = de.find((fe) => fe.ref.current === document.activeElement),
								ce = Yp(de, H, Ce)
							ce && setTimeout(() => ce.ref.current?.focus())
						}),
						ne = W(
							(H, de, Ce) => {
								let ce = !Q.current && !Ce
								;((C.value !== void 0 && C.value === de) || ce) && (B(H), ce && (Q.current = !0))
							},
							[C.value]
						),
						se = W(() => b?.focus(), [b]),
						ue = W(
							(H, de, Ce) => {
								let ce = !Q.current && !Ce
								;((C.value !== void 0 && C.value === de) || ce) && O(H)
							},
							[C.value]
						),
						ke = o === 'popper' ? Ul : Dp,
						xe =
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
					return s(Ap, {
						scope: a,
						content: b,
						viewport: I,
						onViewportChange: T,
						itemRefCallback: ne,
						selectedItem: R,
						onItemLeave: se,
						itemTextRefCallback: ue,
						focusSelectedItem: oe,
						selectedItemText: X,
						position: o,
						isPositioned: $,
						searchRef: re,
						children: s(fa, {
							as: hI,
							allowPinchZoom: !0,
							children: s(ia, {
								asChild: !0,
								trapped: C.open,
								onMountAutoFocus: (H) => {
									H.preventDefault()
								},
								onUnmountAutoFocus: _(r, (H) => {
									;(C.trigger?.focus({ preventScroll: !0 }), H.preventDefault())
								}),
								children: s(Dt, {
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
										...xe,
										onPlaced: () => z(!0),
										ref: A,
										style: {
											display: 'flex',
											flexDirection: 'column',
											outline: 'none',
											...v.style
										},
										onKeyDown: _(v.onKeyDown, (H) => {
											let de = H.ctrlKey || H.altKey || H.metaKey
											if (
												(H.key === 'Tab' && H.preventDefault(),
												!de && H.key.length === 1 && pe(H.key),
												['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(H.key))
											) {
												let ce = U()
													.filter((fe) => !fe.disabled)
													.map((fe) => fe.ref.current)
												if (
													(['ArrowUp', 'End'].includes(H.key) && (ce = ce.slice().reverse()),
													['ArrowUp', 'ArrowDown'].includes(H.key))
												) {
													let fe = H.target,
														be = ce.indexOf(fe)
													ce = ce.slice(be + 1)
												}
												;(setTimeout(() => j(ce)), H.preventDefault())
											}
										})
									})
								})
							})
						})
					})
				})))
			Mp.displayName = gI
			;((xI = 'SelectItemAlignedPosition'),
				(Dp = S((e, t) => {
					let { __scopeSelect: a, onPlaced: o, ...r } = e,
						n = Qt(Zt, a),
						l = ea(Zt, a),
						[i, u] = k(null),
						[d, c] = k(null),
						f = te(t, (A) => c(A)),
						m = Rn(a),
						h = w(!1),
						g = w(!0),
						{ viewport: p, selectedItem: x, selectedItemText: v, focusSelectedItem: C } = l,
						b = W(() => {
							if (n.trigger && n.valueNode && i && d && p && x && v) {
								let A = n.trigger.getBoundingClientRect(),
									R = d.getBoundingClientRect(),
									B = n.valueNode.getBoundingClientRect(),
									X = v.getBoundingClientRect()
								if (n.dir !== 'rtl') {
									let fe = X.left - R.left,
										be = B.left - fe,
										Me = A.left - be,
										ze = A.width + Me,
										Oe = Math.max(ze, R.width),
										Co = window.innerWidth - ct,
										ra = Xo(be, [ct, Math.max(ct, Co - Oe)])
									;((i.style.minWidth = ze + 'px'), (i.style.left = ra + 'px'))
								} else {
									let fe = R.right - X.right,
										be = window.innerWidth - B.right - fe,
										Me = window.innerWidth - A.right - be,
										ze = A.width + Me,
										Oe = Math.max(ze, R.width),
										Co = window.innerWidth - ct,
										ra = Xo(be, [ct, Math.max(ct, Co - Oe)])
									;((i.style.minWidth = ze + 'px'), (i.style.right = ra + 'px'))
								}
								let O = m(),
									U = window.innerHeight - ct * 2,
									$ = p.scrollHeight,
									z = window.getComputedStyle(d),
									Q = parseInt(z.borderTopWidth, 10),
									j = parseInt(z.paddingTop, 10),
									oe = parseInt(z.borderBottomWidth, 10),
									M = parseInt(z.paddingBottom, 10),
									q = Q + j + $ + M + oe,
									re = Math.min(x.offsetHeight * 5, q),
									pe = window.getComputedStyle(p),
									ne = parseInt(pe.paddingTop, 10),
									se = parseInt(pe.paddingBottom, 10),
									ue = A.top + A.height / 2 - ct,
									ke = U - ue,
									xe = x.offsetHeight / 2,
									H = x.offsetTop + xe,
									de = Q + j + H,
									Ce = q - de
								if (de <= ue) {
									let fe = O.length > 0 && x === O[O.length - 1].ref.current
									i.style.bottom = '0px'
									let be = d.clientHeight - p.offsetTop - p.offsetHeight,
										Me = Math.max(ke, xe + (fe ? se : 0) + be + oe),
										ze = de + Me
									i.style.height = ze + 'px'
								} else {
									let fe = O.length > 0 && x === O[0].ref.current
									i.style.top = '0px'
									let Me = Math.max(ue, Q + p.offsetTop + (fe ? ne : 0) + xe) + Ce
									;((i.style.height = Me + 'px'), (p.scrollTop = de - ue + p.offsetTop))
								}
								;((i.style.margin = `${ct}px 0`),
									(i.style.minHeight = re + 'px'),
									(i.style.maxHeight = U + 'px'),
									o?.(),
									requestAnimationFrame(() => (h.current = !0)))
							}
						}, [m, n.trigger, n.valueNode, i, d, p, x, v, n.dir, o])
					Ie(() => b(), [b])
					let [L, I] = k()
					Ie(() => {
						d && I(window.getComputedStyle(d).zIndex)
					}, [d])
					let T = W(
						(A) => {
							A && g.current === !0 && (b(), C?.(), (g.current = !1))
						},
						[b, C]
					)
					return s(CI, {
						scope: a,
						contentWrapper: i,
						shouldExpandOnScrollRef: h,
						onScrollButtonChange: T,
						children: s('div', {
							ref: u,
							style: { display: 'flex', flexDirection: 'column', position: 'fixed', zIndex: L },
							children: s(K.div, {
								...r,
								ref: f,
								style: { boxSizing: 'border-box', maxHeight: '100%', ...r.style }
							})
						})
					})
				})))
			Dp.displayName = xI
			;((vI = 'SelectPopperPosition'),
				(Ul = S((e, t) => {
					let { __scopeSelect: a, align: o = 'start', collisionPadding: r = ct, ...n } = e,
						l = Pn(a)
					return s(no, {
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
			Ul.displayName = vI
			;(([CI, jl] = wa(Zt, {})),
				(ql = 'SelectViewport'),
				(Ep = S((e, t) => {
					let { __scopeSelect: a, nonce: o, ...r } = e,
						n = ea(ql, a),
						l = jl(ql, a),
						i = te(t, n.onViewportChange),
						u = w(0)
					return D(Qe, {
						children: [
							s('style', {
								dangerouslySetInnerHTML: {
									__html: '[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}'
								},
								nonce: o
							}),
							s(yn.Slot, {
								scope: a,
								children: s(K.div, {
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
												let g = window.innerHeight - ct * 2,
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
			Ep.displayName = ql
			;((Op = 'SelectGroup'),
				([bI, LI] = wa(Op)),
				(Fp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = Te()
					return s(bI, {
						scope: a,
						id: r,
						children: s(K.div, { role: 'group', 'aria-labelledby': r, ...o, ref: t })
					})
				})))
			Fp.displayName = Op
			;((Bp = 'SelectLabel'),
				(Np = S((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = LI(Bp, a)
					return s(K.div, { id: r.id, ...o, ref: t })
				})))
			Np.displayName = Bp
			;((wn = 'SelectItem'),
				([II, _p] = wa(wn)),
				(zp = S((e, t) => {
					let { __scopeSelect: a, value: o, disabled: r = !1, textValue: n, ...l } = e,
						i = Qt(wn, a),
						u = ea(wn, a),
						d = i.value === o,
						[c, f] = k(n ?? ''),
						[m, h] = k(!1),
						g = te(t, (C) => u.itemRefCallback?.(C, o, r)),
						p = Te(),
						x = w('touch'),
						v = () => {
							r || (i.onValueChange(o), i.onOpenChange(!1))
						}
					return s(II, {
						scope: a,
						value: o,
						disabled: r,
						textId: p,
						isSelected: d,
						onItemTextChange: W((C) => {
							f((b) => b || (C?.textContent ?? '').trim())
						}, []),
						children: s(yn.ItemSlot, {
							scope: a,
							value: o,
							disabled: r,
							textValue: c,
							children: s(K.div, {
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
										(nI.includes(C.key) && v(), C.key === ' ' && C.preventDefault())
								})
							})
						})
					})
				})))
			zp.displayName = wn
			;((Ko = 'SelectItemText'),
				(Hp = S((e, t) => {
					let { __scopeSelect: a, className: o, style: r, ...n } = e,
						l = Qt(Ko, a),
						i = ea(Ko, a),
						u = _p(Ko, a),
						d = dI(Ko, a),
						[c, f] = k(null),
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
						Ie(() => (p(g), () => x(g)), [p, x, g]),
						D(Qe, {
							children: [
								s(K.span, { id: u.textId, ...n, ref: m }),
								u.isSelected && l.valueNode && !l.valueNodeHasChildren && !kn(l.value)
									? yo(n.children, l.valueNode)
									: null
							]
						})
					)
				})))
			Hp.displayName = Ko
			;((Up = 'SelectItemIndicator'),
				(qp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e
					return _p(Up, a).isSelected ? s(K.span, { 'aria-hidden': !0, ...o, ref: t }) : null
				})))
			qp.displayName = Up
			;((Vl = 'SelectScrollUpButton'),
				(Vp = S((e, t) => {
					let a = ea(Vl, e.__scopeSelect),
						o = jl(Vl, e.__scopeSelect),
						[r, n] = k(!1),
						l = te(t, o.onScrollButtonChange)
					return (
						Ie(() => {
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
							? s(Wp, {
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
			Vp.displayName = Vl
			;((Gl = 'SelectScrollDownButton'),
				(Gp = S((e, t) => {
					let a = ea(Gl, e.__scopeSelect),
						o = jl(Gl, e.__scopeSelect),
						[r, n] = k(!1),
						l = te(t, o.onScrollButtonChange)
					return (
						Ie(() => {
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
							? s(Wp, {
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
			Gp.displayName = Gl
			;((Wp = S((e, t) => {
				let { __scopeSelect: a, onAutoScroll: o, ...r } = e,
					n = ea('SelectScrollButton', a),
					l = w(null),
					i = Rn(a),
					u = W(() => {
						l.current !== null && (window.clearInterval(l.current), (l.current = null))
					}, [])
				return (
					E(() => () => u(), [u]),
					Ie(() => {
						i()
							.find((c) => c.ref.current === document.activeElement)
							?.ref.current?.scrollIntoView({ block: 'nearest' })
					}, [i]),
					s(K.div, {
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
				(SI = 'SelectSeparator'),
				(jp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e
					return s(K.div, { 'aria-hidden': !0, ...o, ref: t })
				})))
			jp.displayName = SI
			;((Xp = 'SelectArrow'),
				(Kp = S((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = Pn(a)
					return ea(Xp, a).position === 'popper' ? s(so, { ...r, ...o, ref: t }) : null
				})))
			Kp.displayName = Xp
			;(($p = 'SelectBubbleInput'),
				(Xl = S(({ __scopeSelect: e, ...t }, a) => {
					let o = Qt($p, e),
						{ value: r, onValueChange: n, required: l, disabled: i, name: u, autoComplete: d, form: c } = o,
						{ nativeOptions: f, nativeSelectKey: m } = o,
						h = w(null),
						g = te(a, h),
						p = r ?? '',
						x = eo(p),
						v = Array.from(f).some((C) => (C.props.value ?? '') === '')
					return (
						E(() => {
							let C = h.current
							if (!C) return
							let b = window.HTMLSelectElement.prototype,
								I = Object.getOwnPropertyDescriptor(b, 'value').set
							if (x !== p && I) {
								let T = new Event('change', { bubbles: !0 })
								;(I.call(C, p), C.dispatchEvent(T))
							}
						}, [x, p]),
						D(
							K.select,
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
			Xl.displayName = $p
		})
	var $o = {}
	Ye($o, {
		Root: () => tm,
		Switch: () => tm,
		SwitchThumb: () => om,
		Thumb: () => om,
		createSwitchScope: () => PI,
		unstable_BubbleInput: () => Jl,
		unstable_Provider: () => Qp,
		unstable_SwitchBubbleInput: () => Jl,
		unstable_SwitchProvider: () => Qp,
		unstable_SwitchTrigger: () => $l,
		unstable_Trigger: () => $l
	})
	function Qp(e) {
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
			[m, h] = Ee({ prop: a, defaultProp: r ?? !1, onChange: u, caller: Tn }),
			[g, p] = k(null),
			[x, v] = k(null),
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
		return s(kI, { scope: t, ...L, children: TI(f) ? f(L) : o })
	}
	function TI(e) {
		return typeof e == 'function'
	}
	function nm(e) {
		return e ? 'checked' : 'unchecked'
	}
	var Tn,
		RI,
		PI,
		kI,
		Kl,
		em,
		$l,
		tm,
		am,
		om,
		rm,
		Jl,
		sm = y(() => {
			'use client'
			ee()
			Je()
			Be()
			Ge()
			At()
			Jr()
			Yr()
			De()
			N()
			;((Tn = 'Switch'), ([RI, PI] = Le(Tn)), ([kI, Kl] = RI(Tn)))
			;((em = 'SwitchTrigger'),
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
						} = Kl(em, e),
						h = te(o, u)
					return s(K.button, {
						type: 'button',
						role: 'switch',
						'aria-checked': l,
						'aria-required': i,
						'data-state': nm(l),
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
			$l.displayName = em
			tm = S((e, t) => {
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
				return s(Qp, {
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
						D(Qe, {
							children: [s($l, { ...f, ref: t, __scopeSwitch: a }), m && s(Jl, { __scopeSwitch: a })]
						})
				})
			})
			tm.displayName = Tn
			;((am = 'SwitchThumb'),
				(om = S((e, t) => {
					let { __scopeSwitch: a, ...o } = e,
						r = Kl(am, a)
					return s(K.span, {
						'data-state': nm(r.checked),
						'data-disabled': r.disabled ? '' : void 0,
						...o,
						ref: t
					})
				})))
			om.displayName = am
			;((rm = 'SwitchBubbleInput'),
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
						} = Kl(rm, e),
						g = te(a, h),
						p = eo(n),
						x = to(o)
					E(() => {
						let C = m
						if (!C) return
						let b = window.HTMLInputElement.prototype,
							I = Object.getOwnPropertyDescriptor(b, 'checked').set,
							T = !r.current
						if (p !== n && I) {
							let A = new Event('click', { bubbles: T })
							;(I.call(C, n), C.dispatchEvent(A))
						}
					}, [m, p, n, r])
					let v = w(n)
					return s(K.input, {
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
			Jl.displayName = rm
		})
	var ya = {}
	Ye(ya, {
		Content: () => BI,
		List: () => OI,
		Root: () => EI,
		Tabs: () => Zl,
		TabsContent: () => ti,
		TabsList: () => Ql,
		TabsTrigger: () => ei,
		Trigger: () => FI,
		createTabsScope: () => MI
	})
	function cm(e, t) {
		return `${e}-trigger-${t}`
	}
	function fm(e, t) {
		return `${e}-content-${t}`
	}
	var An,
		AI,
		MI,
		lm,
		DI,
		Yl,
		Zl,
		im,
		Ql,
		um,
		ei,
		dm,
		ti,
		EI,
		OI,
		FI,
		BI,
		pm = y(() => {
			'use client'
			ee()
			Je()
			Ge()
			Ho()
			jt()
			De()
			Ho()
			Wa()
			At()
			Xt()
			N()
			;((An = 'Tabs'),
				([AI, MI] = Le(An, [lo])),
				(lm = lo()),
				([DI, Yl] = AI(An)),
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
						c = pt(i),
						[f, m] = Ee({ prop: o, onChange: r, defaultProp: n ?? '', caller: An })
					return s(DI, {
						scope: a,
						baseId: Te(),
						value: f,
						onValueChange: m,
						orientation: l,
						dir: c,
						activationMode: u,
						children: s(K.div, { dir: c, 'data-orientation': l, ...d, ref: t })
					})
				})))
			Zl.displayName = An
			;((im = 'TabsList'),
				(Ql = S((e, t) => {
					let { __scopeTabs: a, loop: o = !0, ...r } = e,
						n = Yl(im, a),
						l = lm(a)
					return s(pn, {
						asChild: !0,
						...l,
						orientation: n.orientation,
						dir: n.dir,
						loop: o,
						children: s(K.div, { role: 'tablist', 'aria-orientation': n.orientation, ...r, ref: t })
					})
				})))
			Ql.displayName = im
			;((um = 'TabsTrigger'),
				(ei = S((e, t) => {
					let { __scopeTabs: a, value: o, disabled: r = !1, ...n } = e,
						l = Yl(um, a),
						i = lm(a),
						u = cm(l.baseId, o),
						d = fm(l.baseId, o),
						c = o === l.value
					return s(mn, {
						asChild: !0,
						...i,
						focusable: !r,
						active: c,
						children: s(K.button, {
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
			ei.displayName = um
			;((dm = 'TabsContent'),
				(ti = S((e, t) => {
					let { __scopeTabs: a, value: o, forceMount: r, children: n, ...l } = e,
						i = Yl(dm, a),
						u = cm(i.baseId, o),
						d = fm(i.baseId, o),
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
								s(K.div, {
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
			ti.displayName = dm
			;((EI = Zl), (OI = Ql), (FI = ei), (BI = ti))
		})
	var _t = {}
	Ye(_t, {
		Arrow: () => rS,
		Content: () => oS,
		Portal: () => aS,
		Provider: () => QI,
		Root: () => eS,
		Tooltip: () => si,
		TooltipArrow: () => ci,
		TooltipContent: () => di,
		TooltipPortal: () => ui,
		TooltipProvider: () => ni,
		TooltipTrigger: () => li,
		Trigger: () => tS,
		createTooltipScope: () => NI
	})
	function XI(e, t) {
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
	function KI(e, t, a = 5) {
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
	function $I(e) {
		let { top: t, right: a, bottom: o, left: r } = e
		return [
			{ x: r, y: t },
			{ x: a, y: t },
			{ x: a, y: o },
			{ x: r, y: o }
		]
	}
	function JI(e, t) {
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
	function YI(e) {
		let t = e.slice()
		return (t.sort((a, o) => (a.x < o.x ? -1 : a.x > o.x ? 1 : a.y < o.y ? -1 : a.y > o.y ? 1 : 0)), ZI(t))
	}
	function ZI(e) {
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
		NI,
		Dn,
		mm,
		_I,
		ai,
		zI,
		ri,
		ni,
		Jo,
		HI,
		Yo,
		si,
		oi,
		li,
		ii,
		UI,
		qI,
		ui,
		uo,
		di,
		VI,
		GI,
		WI,
		jI,
		gm,
		hm,
		ci,
		QI,
		eS,
		tS,
		aS,
		oS,
		rS,
		xm = y(() => {
			'use client'
			ee()
			Je()
			Be()
			Ge()
			Po()
			Xt()
			La()
			La()
			ko()
			jt()
			De()
			Wt()
			At()
			ns()
			N()
			;(([Mn, NI] = Le('Tooltip', [Bt])),
				(Dn = Bt()),
				(mm = 'TooltipProvider'),
				(_I = 700),
				(ai = 'tooltip.open'),
				([zI, ri] = Mn(mm)),
				(ni = (e) => {
					let {
							__scopeTooltip: t,
							delayDuration: a = _I,
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
						s(zI, {
							scope: t,
							isOpenDelayedRef: l,
							delayDuration: a,
							onOpen: W(() => {
								o <= 0 || (window.clearTimeout(u.current), (l.current = !1))
							}, [o]),
							onClose: W(() => {
								o <= 0 ||
									(window.clearTimeout(u.current),
									(u.current = window.setTimeout(() => (l.current = !0), o)))
							}, [o]),
							isPointerInTransitRef: i,
							onPointerInTransitChange: W((d) => {
								i.current = d
							}, []),
							disableHoverableContent: r,
							children: n
						})
					)
				}))
			ni.displayName = mm
			;((Jo = 'Tooltip'),
				([HI, Yo] = Mn(Jo)),
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
						u = ri(Jo, e.__scopeTooltip),
						d = Dn(t),
						[c, f] = k(null),
						m = Te(),
						h = w(0),
						g = l ?? u.disableHoverableContent,
						p = i ?? u.delayDuration,
						x = w(!1),
						[v, C] = Ee({
							prop: o,
							defaultProp: r ?? !1,
							onChange: (A) => {
								;(A ? (u.onOpen(), document.dispatchEvent(new CustomEvent(ai))) : u.onClose(), n?.(A))
							},
							caller: Jo
						}),
						b = we(() => (v ? (x.current ? 'delayed-open' : 'instant-open') : 'closed'), [v]),
						L = W(() => {
							;(window.clearTimeout(h.current), (h.current = 0), (x.current = !1), C(!0))
						}, [C]),
						I = W(() => {
							;(window.clearTimeout(h.current), (h.current = 0), C(!1))
						}, [C]),
						T = W(() => {
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
						s(ba, {
							...d,
							children: s(HI, {
								scope: t,
								contentId: m,
								open: v,
								stateAttribute: b,
								trigger: c,
								onTriggerChange: f,
								onTriggerEnter: W(() => {
									u.isOpenDelayedRef.current ? T() : L()
								}, [u.isOpenDelayedRef, T, L]),
								onTriggerLeave: W(() => {
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
			si.displayName = Jo
			;((oi = 'TooltipTrigger'),
				(li = S((e, t) => {
					let { __scopeTooltip: a, ...o } = e,
						r = Yo(oi, a),
						n = ri(oi, a),
						l = Dn(a),
						i = w(null),
						u = te(t, i, r.onTriggerChange),
						d = w(!1),
						c = w(!1),
						f = W(() => (d.current = !1), [])
					return (
						E(() => () => document.removeEventListener('pointerup', f), [f]),
						s(ro, {
							asChild: !0,
							...l,
							children: s(K.button, {
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
				([UI, qI] = Mn(ii, { forceMount: void 0 })),
				(ui = (e) => {
					let { __scopeTooltip: t, forceMount: a, children: o, container: r } = e,
						n = Yo(ii, t)
					return s(UI, {
						scope: t,
						forceMount: a,
						children: s(ye, {
							present: a || n.open,
							children: s(Et, { asChild: !0, container: r, children: o })
						})
					})
				}))
			ui.displayName = ii
			;((uo = 'TooltipContent'),
				(di = S((e, t) => {
					let a = qI(uo, e.__scopeTooltip),
						{ forceMount: o = a.forceMount, side: r = 'top', ...n } = e,
						l = Yo(uo, e.__scopeTooltip)
					return s(ye, {
						present: o || l.open,
						children: l.disableHoverableContent
							? s(gm, { side: r, ...n, ref: t })
							: s(VI, { side: r, ...n, ref: t })
					})
				})),
				(VI = S((e, t) => {
					let a = Yo(uo, e.__scopeTooltip),
						o = ri(uo, e.__scopeTooltip),
						r = w(null),
						n = te(t, r),
						[l, i] = k(null),
						{ trigger: u, onClose: d } = a,
						c = r.current,
						{ onPointerInTransitChange: f } = o,
						m = W(() => {
							;(i(null), f(!1))
						}, [f]),
						h = W(
							(g, p) => {
								let x = g.currentTarget,
									v = { x: g.clientX, y: g.clientY },
									C = XI(v, x.getBoundingClientRect()),
									b = KI(v, C),
									L = $I(p.getBoundingClientRect()),
									I = YI([...b, ...L])
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
										b = !JI(v, l)
									C ? m() : b && (m(), d())
								}
								return (
									document.addEventListener('pointermove', g),
									() => document.removeEventListener('pointermove', g)
								)
							}
						}, [u, c, l, d, m]),
						s(gm, { ...e, ref: n })
					)
				})),
				([GI, WI] = Mn(Jo, { isInside: !1 })),
				(jI = Sr('TooltipContent')),
				(gm = S((e, t) => {
					let {
							__scopeTooltip: a,
							children: o,
							'aria-label': r,
							onEscapeKeyDown: n,
							onPointerDownOutside: l,
							...i
						} = e,
						u = Yo(uo, a),
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
						s(Dt, {
							asChild: !0,
							disableOutsidePointerEvents: !1,
							onEscapeKeyDown: n,
							onPointerDownOutside: l,
							onFocusOutside: (f) => f.preventDefault(),
							onDismiss: c,
							children: D(no, {
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
									s(jI, { children: o }),
									s(GI, {
										scope: a,
										isInside: !0,
										children: s(qu, { id: u.contentId, role: 'tooltip', children: r || o })
									})
								]
							})
						})
					)
				})))
			di.displayName = uo
			;((hm = 'TooltipArrow'),
				(ci = S((e, t) => {
					let { __scopeTooltip: a, ...o } = e,
						r = Dn(a)
					return WI(hm, a).isInside ? null : s(so, { ...r, ...o, ref: t })
				})))
			ci.displayName = hm
			;((QI = ni), (eS = si), (tS = li), (aS = ui), (oS = di), (rS = ci))
		})
	var Xe = y(() => {
		Wd()
		Qd()
		$r()
		ip()
		up()
		Cp()
		Zp()
		Wt()
		sm()
		pm()
		xm()
	})
	function En({ className: e, variant: t = 'default', asChild: a = !1, ...o }) {
		let r = a ? Va.Root : 'span'
		return s(r, { 'data-slot': 'badge', 'data-variant': t, className: V(nS({ variant: t }), e), ...o })
	}
	var nS,
		vm = y(() => {
			wo()
			Xe()
			he()
			N()
			nS = Gt(
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
	function Ke({ className: e, variant: t = 'default', size: a = 'default', asChild: o = !1, ...r }) {
		let n = o ? Va.Root : 'button'
		return s(n, {
			'data-slot': 'button',
			'data-variant': t,
			'data-size': a,
			className: V(Zo({ variant: t, size: a, className: e })),
			...r
		})
	}
	var Zo,
		Qo = y(() => {
			wo()
			Xe()
			he()
			N()
			Zo = Gt(
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
	function Cm({ className: e, ...t }) {
		return s('div', {
			'data-slot': 'card',
			className: V('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', e),
			...t
		})
	}
	function bm({ className: e, ...t }) {
		return s('div', { 'data-slot': 'card-content', className: V('px-6', e), ...t })
	}
	var Lm = y(() => {
		he()
		N()
	})
	var On,
		fi = y(() => {
			On = (...e) =>
				e
					.filter((t, a, o) => !!t && t.trim() !== '' && o.indexOf(t) === a)
					.join(' ')
					.trim()
		})
	var Im,
		Sm = y(() => {
			Im = (e) => e.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
		})
	var wm,
		ym = y(() => {
			wm = (e) => e.replace(/^([A-Z])|[\s-_]+(\w)/g, (t, a, o) => (o ? o.toUpperCase() : a.toLowerCase()))
		})
	var pi,
		Rm = y(() => {
			ym()
			pi = (e) => {
				let t = wm(e)
				return t.charAt(0).toUpperCase() + t.slice(1)
			}
		})
	var Fn,
		Pm = y(() => {
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
	var km,
		Tm = y(() => {
			km = (e) => {
				for (let t in e) if (t.startsWith('aria-') || t === 'role' || t === 'title') return !0
				return !1
			}
		})
	var sS,
		Am,
		Mm = y(() => {
			'use strict'
			'use client'
			ee()
			;((sS = Fe({})), (Am = () => He(sS)))
		})
	var Dm,
		Em = y(() => {
			'use strict'
			'use client'
			ee()
			Pm()
			Tm()
			fi()
			Mm()
			Dm = S(
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
						} = Am() ?? {},
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
							...(!n && !km(i) && { 'aria-hidden': 'true' }),
							...i
						},
						[...l.map(([p, x]) => Re(p, x)), ...(Array.isArray(n) ? n : [n])]
					)
				}
			)
		})
	var ta,
		er = y(() => {
			ee()
			fi()
			Sm()
			Rm()
			Em()
			ta = (e, t) => {
				let a = S(({ className: o, ...r }, n) =>
					Re(Dm, { ref: n, iconNode: t, className: On(`lucide-${Im(pi(e))}`, `lucide-${e}`, o), ...r })
				)
				return ((a.displayName = pi(e)), a)
			}
		})
	var lS,
		Ra,
		Om = y(() => {
			er()
			;((lS = [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]]), (Ra = ta('check', lS)))
		})
	var iS,
		co,
		Fm = y(() => {
			er()
			;((iS = [['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]]), (co = ta('chevron-down', iS)))
		})
	var uS,
		tr,
		Bm = y(() => {
			er()
			;((uS = [['path', { d: 'm18 15-6-6-6 6', key: '153udz' }]]), (tr = ta('chevron-up', uS)))
		})
	var dS,
		Pa,
		Nm = y(() => {
			er()
			;((dS = [
				['path', { d: 'M18 6 6 18', key: '1bl5f8' }],
				['path', { d: 'm6 6 12 12', key: 'd8bk6v' }]
			]),
				(Pa = ta('x', dS)))
		})
	var ar = y(() => {
		'use strict'
		Om()
		Fm()
		Bm()
		Nm()
	})
	function mi({ className: e, ...t }) {
		return s(Eo.Root, {
			'data-slot': 'checkbox',
			className: V(
				'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary',
				e
			),
			...t,
			children: s(Eo.Indicator, {
				'data-slot': 'checkbox-indicator',
				className: 'grid place-content-center text-current transition-none',
				children: s(Ra, { className: 'size-3.5' })
			})
		})
	}
	var _m = y(() => {
		'use client'
		ar()
		Xe()
		he()
		N()
	})
	function gi({ ...e }) {
		return s(Pe.Root, { 'data-slot': 'dialog', ...e })
	}
	function cS({ ...e }) {
		return s(Pe.Portal, { 'data-slot': 'dialog-portal', ...e })
	}
	function fS({ className: e, ...t }) {
		return s(Pe.Overlay, {
			'data-slot': 'dialog-overlay',
			className: V(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
				e
			),
			...t
		})
	}
	function hi({ className: e, children: t, showCloseButton: a = !0, ...o }) {
		return D(cS, {
			'data-slot': 'dialog-portal',
			children: [
				s(fS, {}),
				D(Pe.Content, {
					'data-slot': 'dialog-content',
					className: V(
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
								children: [s(Pa, {}), s('span', { className: 'sr-only', children: 'Close' })]
							})
					]
				})
			]
		})
	}
	function xi({ className: e, ...t }) {
		return s('div', {
			'data-slot': 'dialog-header',
			className: V('flex flex-col gap-2 text-center sm:text-left', e),
			...t
		})
	}
	function zm({ className: e, showCloseButton: t = !1, children: a, ...o }) {
		return D('div', {
			'data-slot': 'dialog-footer',
			className: V('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', e),
			...o,
			children: [a, t && s(Pe.Close, { asChild: !0, children: s(Ke, { variant: 'outline', children: 'Close' }) })]
		})
	}
	function vi({ className: e, ...t }) {
		return s(Pe.Title, { 'data-slot': 'dialog-title', className: V('text-lg leading-none font-semibold', e), ...t })
	}
	function Ci({ className: e, ...t }) {
		return s(Pe.Description, {
			'data-slot': 'dialog-description',
			className: V('text-sm text-muted-foreground', e),
			...t
		})
	}
	var bi = y(() => {
		ar()
		Xe()
		he()
		Qo()
		N()
	})
	function Bn({ className: e, type: t, ...a }) {
		return s('input', {
			type: t,
			'data-slot': 'input',
			className: V(
				'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
				'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
				'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
				e
			),
			...a
		})
	}
	var Hm = y(() => {
		he()
		N()
	})
	function Um({ className: e, children: t, ...a }) {
		return D(Yt.Root, {
			'data-slot': 'scroll-area',
			className: V('relative', e),
			...a,
			children: [
				s(Yt.Viewport, {
					'data-slot': 'scroll-area-viewport',
					className:
						'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
					children: t
				}),
				s(pS, {}),
				s(Yt.Corner, {})
			]
		})
	}
	function pS({ className: e, orientation: t = 'vertical', ...a }) {
		return s(Yt.ScrollAreaScrollbar, {
			'data-slot': 'scroll-area-scrollbar',
			orientation: t,
			className: V(
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
	var qm = y(() => {
		Xe()
		he()
		N()
	})
	function or({ ...e }) {
		return s(qe.Root, { 'data-slot': 'select', ...e })
	}
	function rr({ ...e }) {
		return s(qe.Value, { 'data-slot': 'select-value', ...e })
	}
	function nr({ className: e, size: t = 'default', children: a, ...o }) {
		return D(qe.Trigger, {
			'data-slot': 'select-trigger',
			'data-size': t,
			className: V(
				"flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
				e
			),
			...o,
			children: [a, s(qe.Icon, { asChild: !0, children: s(co, { className: 'size-4 opacity-50' }) })]
		})
	}
	function sr({ className: e, children: t, position: a = 'item-aligned', align: o = 'center', ...r }) {
		return s(qe.Portal, {
			children: D(qe.Content, {
				'data-slot': 'select-content',
				className: V(
					'relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					a === 'popper' &&
						'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
					e
				),
				position: a,
				align: o,
				...r,
				children: [
					s(mS, {}),
					s(qe.Viewport, {
						className: V(
							'p-1',
							a === 'popper' &&
								'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1'
						),
						children: t
					}),
					s(gS, {})
				]
			})
		})
	}
	function fo({ className: e, children: t, ...a }) {
		return D(qe.Item, {
			'data-slot': 'select-item',
			className: V(
				"relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				e
			),
			...a,
			children: [
				s('span', {
					'data-slot': 'select-item-indicator',
					className: 'absolute right-2 flex size-3.5 items-center justify-center',
					children: s(qe.ItemIndicator, { children: s(Ra, { className: 'size-4' }) })
				}),
				s(qe.ItemText, { children: t })
			]
		})
	}
	function mS({ className: e, ...t }) {
		return s(qe.ScrollUpButton, {
			'data-slot': 'select-scroll-up-button',
			className: V('flex cursor-default items-center justify-center py-1', e),
			...t,
			children: s(tr, { className: 'size-4' })
		})
	}
	function gS({ className: e, ...t }) {
		return s(qe.ScrollDownButton, {
			'data-slot': 'select-scroll-down-button',
			className: V('flex cursor-default items-center justify-center py-1', e),
			...t,
			children: s(co, { className: 'size-4' })
		})
	}
	var Vm = y(() => {
		ar()
		Xe()
		he()
		N()
	})
	var Gm = y(() => {
		'use client'
		he()
		N()
	})
	function Wm({ className: e, orientation: t = 'horizontal', ...a }) {
		return s(ya.Root, {
			'data-slot': 'tabs',
			'data-orientation': t,
			orientation: t,
			className: V('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', e),
			...a
		})
	}
	function jm({ className: e, variant: t = 'default', ...a }) {
		return s(ya.List, { 'data-slot': 'tabs-list', 'data-variant': t, className: V(hS({ variant: t }), e), ...a })
	}
	function Nn({ className: e, ...t }) {
		return s(ya.Trigger, {
			'data-slot': 'tabs-trigger',
			className: V(
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
		return s(ya.Content, { 'data-slot': 'tabs-content', className: V('flex-1 outline-none', e), ...t })
	}
	var hS,
		Xm = y(() => {
			'use client'
			wo()
			Xe()
			he()
			N()
			hS = Gt(
				'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none',
				{
					variants: { variant: { default: 'bg-muted', line: 'gap-1 bg-transparent' } },
					defaultVariants: { variant: 'default' }
				}
			)
		})
	function Km({ className: e, ...t }) {
		return s('textarea', {
			'data-slot': 'textarea',
			className: V(
				'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
				e
			),
			...t
		})
	}
	var $m = y(() => {
		he()
		N()
	})
	function Jm({ delayDuration: e = 0, ...t }) {
		return s(_t.Provider, { 'data-slot': 'tooltip-provider', delayDuration: e, ...t })
	}
	function Ym({ ...e }) {
		return s(_t.Root, { 'data-slot': 'tooltip', ...e })
	}
	function Zm({ ...e }) {
		return s(_t.Trigger, { 'data-slot': 'tooltip-trigger', ...e })
	}
	function Qm({ className: e, sideOffset: t = 0, children: a, ...o }) {
		return s(_t.Portal, {
			children: D(_t.Content, {
				'data-slot': 'tooltip-content',
				sideOffset: t,
				className: V(
					'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
					e
				),
				...o,
				children: [
					a,
					s(_t.Arrow, {
						className:
							'z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground'
					})
				]
			})
		})
	}
	var eg = y(() => {
		Xe()
		he()
		N()
	})
	function tg({ className: e, ...t }) {
		return s('div', {
			'data-slot': 'table-container',
			className: 'relative w-full overflow-x-auto',
			children: s('table', { 'data-slot': 'table', className: V('w-full caption-bottom text-sm', e), ...t })
		})
	}
	function ag({ className: e, ...t }) {
		return s('thead', { 'data-slot': 'table-header', className: V('[&_tr]:border-b', e), ...t })
	}
	function og({ className: e, ...t }) {
		return s('tbody', { 'data-slot': 'table-body', className: V('[&_tr:last-child]:border-0', e), ...t })
	}
	function Li({ className: e, ...t }) {
		return s('tr', {
			'data-slot': 'table-row',
			className: V('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', e),
			...t
		})
	}
	function Ct({ className: e, ...t }) {
		return s('th', {
			'data-slot': 'table-head',
			className: V(
				'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
				e
			),
			...t
		})
	}
	function bt({ className: e, ...t }) {
		return s('td', { 'data-slot': 'table-cell', className: V('p-3 align-middle', e), ...t })
	}
	var rg = y(() => {
		he()
		N()
	})
	function lr({ className: e, ...t }) {
		return s(Cn.Root, {
			'data-slot': 'label',
			className: V(
				'flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
				e
			),
			...t
		})
	}
	var ng = y(() => {
		Xe()
		he()
		N()
	})
	function sg({ className: e, ...t }) {
		return s($o.Root, {
			'data-slot': 'switch',
			className: V(
				'peer inline-flex h-[1.15rem] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
				e
			),
			...t,
			children: s($o.Thumb, {
				'data-slot': 'switch-thumb',
				className:
					'pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0'
			})
		})
	}
	var lg = y(() => {
		Xe()
		he()
		N()
	})
	function ig({ className: e, ...t }) {
		return s('div', { 'data-slot': 'skeleton', className: V('animate-pulse rounded-md bg-accent', e), ...t })
	}
	var ug = y(() => {
		he()
		N()
	})
	function vS({ className: e, ...t }) {
		return s(Pe.Overlay, {
			'data-slot': 'sheet-overlay',
			className: V(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
				e
			),
			...t
		})
	}
	function cg({ className: e, children: t, side: a = 'right', ...o }) {
		return D(xS, {
			children: [
				s(vS, {}),
				D(Pe.Content, {
					'data-slot': 'sheet-content',
					className: V(
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
								s(Pa, { className: 'size-4' }),
								s('span', { className: 'sr-only', children: 'Close' })
							]
						})
					]
				})
			]
		})
	}
	function fg({ className: e, ...t }) {
		return s('div', { 'data-slot': 'sheet-header', className: V('flex flex-col gap-1.5 p-4', e), ...t })
	}
	function pg({ className: e, ...t }) {
		return s(Pe.Title, { 'data-slot': 'sheet-title', className: V('font-semibold text-foreground', e), ...t })
	}
	function mg({ className: e, ...t }) {
		return s(Pe.Description, {
			'data-slot': 'sheet-description',
			className: V('text-sm text-muted-foreground', e),
			...t
		})
	}
	var dg,
		BA,
		NA,
		xS,
		gg = y(() => {
			ar()
			Xe()
			he()
			N()
			;((dg = Pe.Root), (BA = Pe.Trigger), (NA = Pe.Close), (xS = Pe.Portal))
		})
	function bS({ className: e, ...t }) {
		return s(et.Overlay, {
			className: V(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
				e
			),
			...t
		})
	}
	function Si({ className: e, ...t }) {
		return D(CS, {
			children: [
				s(bS, {}),
				s(et.Content, {
					className: V(
						'fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg sm:max-w-lg',
						e
					),
					...t
				})
			]
		})
	}
	function wi({ className: e, ...t }) {
		return s('div', { className: V('flex flex-col gap-2 text-center sm:text-left', e), ...t })
	}
	function yi({ className: e, ...t }) {
		return s('div', { className: V('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', e), ...t })
	}
	function Ri({ className: e, ...t }) {
		return s(et.Title, { className: V('text-lg font-semibold', e), ...t })
	}
	function Pi({ className: e, ...t }) {
		return s(et.Description, { className: V('text-sm text-muted-foreground', e), ...t })
	}
	function ki({ className: e, ...t }) {
		return s(et.Action, { className: V(Zo(), e), ...t })
	}
	function Ti({ className: e, ...t }) {
		return s(et.Cancel, { className: V(Zo({ variant: 'outline' }), e), ...t })
	}
	var Ii,
		VA,
		CS,
		hg = y(() => {
			Xe()
			he()
			Qo()
			N()
			;((Ii = et.Root), (VA = et.Trigger), (CS = et.Portal))
		})
	var xg = y(() => {
		he()
		N()
	})
	var vg = y(() => {
		he()
		N()
	})
	var Cg = y(() => {
		'use client'
		N()
	})
	var bg = y(() => {
		'use client'
		he()
		bi()
		N()
	})
	function Ai({ ...e }) {
		return s(Nt.Root, { 'data-slot': 'dropdown-menu', ...e })
	}
	function Mi({ ...e }) {
		return s(Nt.Trigger, { 'data-slot': 'dropdown-menu-trigger', ...e })
	}
	function Di({ className: e, sideOffset: t = 4, ...a }) {
		return s(Nt.Portal, {
			children: s(Nt.Content, {
				'data-slot': 'dropdown-menu-content',
				sideOffset: t,
				className: V(
					'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					e
				),
				...a
			})
		})
	}
	function Lt({ className: e, inset: t, variant: a = 'default', ...o }) {
		return s(Nt.Item, {
			'data-slot': 'dropdown-menu-item',
			'data-inset': t,
			'data-variant': a,
			className: V(
				"relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
				e
			),
			...o
		})
	}
	function Ei({ className: e, ...t }) {
		return s(Nt.Separator, {
			'data-slot': 'dropdown-menu-separator',
			className: V('-mx-1 my-1 h-px bg-border', e),
			...t
		})
	}
	var Lg = y(() => {
		Xe()
		he()
		N()
	})
	var Ig = y(() => {
		he()
		Qo()
		N()
	})
	var Sg = y(() => {
		'use client'
		he()
		N()
	})
	var wg = y(() => {
		he()
		N()
	})
	var yg = y(() => {
		'use client'
		he()
		N()
	})
	function LS(e, t) {
		let a = getComputedStyle(e),
			o = parseFloat(a.fontSize)
		return t * o
	}
	function IS(e, t) {
		let a = getComputedStyle(e.ownerDocument.documentElement),
			o = parseFloat(a.fontSize)
		return t * o
	}
	function SS(e) {
		return (e / 100) * window.innerHeight
	}
	function wS(e) {
		return (e / 100) * window.innerWidth
	}
	function yS(e) {
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
	function ir({ groupSize: e, panelElement: t, styleProp: a }) {
		let o,
			[r, n] = yS(a)
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
				o = IS(t, r)
				break
			}
			case 'em': {
				o = LS(t, r)
				break
			}
			case 'vh': {
				o = SS(r)
				break
			}
			case 'vw': {
				o = wS(r)
				break
			}
		}
		return o
	}
	function Ve(e) {
		return parseFloat(e.toFixed(3))
	}
	function xo({ group: e }) {
		let { orientation: t, panels: a } = e
		return a.reduce((o, r) => ((o += t === 'horizontal' ? r.element.offsetWidth : r.element.offsetHeight), o), 0)
	}
	function Fi(e) {
		let { panels: t } = e,
			a = xo({ group: e })
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
						let c = ir({ groupSize: a, panelElement: r, styleProp: n.collapsedSize })
						l = Ve((c / a) * 100)
					}
					let i
					if (n.defaultSize !== void 0) {
						let c = ir({ groupSize: a, panelElement: r, styleProp: n.defaultSize })
						i = Ve((c / a) * 100)
					}
					let u = 0
					if (n.minSize !== void 0) {
						let c = ir({ groupSize: a, panelElement: r, styleProp: n.minSize })
						u = Ve((c / a) * 100)
					}
					let d = 100
					if (n.maxSize !== void 0) {
						let c = ir({ groupSize: a, panelElement: r, styleProp: n.maxSize })
						d = Ve((c / a) * 100)
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
		return Array.from(t).sort(e === 'horizontal' ? RS : PS)
	}
	function RS(e, t) {
		let a = e.element.offsetLeft - t.element.offsetLeft
		return a !== 0 ? a : e.element.offsetWidth - t.element.offsetWidth
	}
	function PS(e, t) {
		let a = e.element.offsetTop - t.element.offsetTop
		return a !== 0 ? a : e.element.offsetHeight - t.element.offsetHeight
	}
	function Vg(e) {
		return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.ELEMENT_NODE
	}
	function Gg(e, t) {
		return {
			x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(Math.abs(e.x - t.left), Math.abs(e.x - t.right)),
			y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(Math.abs(e.y - t.top), Math.abs(e.y - t.bottom))
		}
	}
	function kS({ orientation: e, rects: t, targetRect: a }) {
		let o = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
			r,
			n = Number.MAX_VALUE
		for (let l of t) {
			let { x: i, y: u } = Gg(o, l),
				d = e === 'horizontal' ? i : u
			d < n && ((n = d), (r = l))
		}
		return (ve(r, 'No rect found'), r)
	}
	function TS() {
		return (
			zn === void 0 &&
				(typeof matchMedia == 'function' ? (zn = !!matchMedia('(pointer:coarse)').matches) : (zn = !1)),
			zn
		)
	}
	function Wg(e) {
		let { element: t, orientation: a, panels: o, separators: r } = e,
			n = Bi(
				a,
				Array.from(t.children)
					.filter(Vg)
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
										let T = h[0],
											A = kS({
												orientation: a,
												rects: [v, C],
												targetRect: T.element.getBoundingClientRect()
											})
										b = [T, A === v ? I : L]
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
									T = TS() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine
								if (I.width < T) {
									let R = T - I.width
									I = new DOMRect(I.x - R / 2, I.y, I.width + R, I.height)
								}
								if (I.height < T) {
									let R = T - I.height
									I = new DOMRect(I.x, I.y - R / 2, I.width, I.height + R)
								}
								let A = g <= d || g > c
								;(!i &&
									!A &&
									l.push({
										group: e,
										groupSize: xo({ group: e }),
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
	function Ta() {
		return go
	}
	function AS(e) {
		return Ni.addListener('change', e)
	}
	function MS(e) {
		let t = go,
			a = { ...go }
		;((a.cursorFlags = e), (go = a), Ni.emit('change', { prev: t, next: a }))
	}
	function ho(e) {
		let t = go
		;((go = e), Ni.emit('change', { prev: t, next: e }))
	}
	function kg() {
		return (
			Hn === void 0 &&
				((Hn = !1),
				typeof window < 'u' &&
					(window.navigator.userAgent.includes('Chrome') || window.navigator.userAgent.includes('Firefox')) &&
					(Hn = !0)),
			Hn
		)
	}
	function ES({ cursorFlags: e, groups: t, state: a }) {
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
					if (e && kg()) {
						let n = (e & jg) !== 0,
							l = (e & Xg) !== 0,
							i = (e & Kg) !== 0,
							u = (e & $g) !== 0
						if (n) return i ? 'se-resize' : u ? 'ne-resize' : 'e-resize'
						if (l) return i ? 'sw-resize' : u ? 'nw-resize' : 'w-resize'
						if (i) return 's-resize'
						if (u) return 'n-resize'
					}
					break
				}
			}
			return kg()
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
		let { prevStyle: t, styleSheet: a } = Tg.get(e) ?? {}
		a === void 0 &&
			((a = new e.defaultView.CSSStyleSheet()),
			e.adoptedStyleSheets &&
				(Object.isExtensible(e.adoptedStyleSheets)
					? e.adoptedStyleSheets.push(a)
					: (e.adoptedStyleSheets = [...e.adoptedStyleSheets, a])))
		let o = Ta()
		switch (o.state) {
			case 'active':
			case 'hover': {
				let r = ES({ cursorFlags: o.cursorFlags, groups: o.hitRegions.map((l) => l.group), state: o.state }),
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
		Tg.set(e, { prevStyle: t, styleSheet: a })
	}
	function OS(e) {
		;((St = new Map(St)), St.delete(e))
	}
	function Ag(e, t) {
		for (let [a] of St) if (a.id === e) return a
	}
	function oa(e, t) {
		for (let [a, o] of St) if (a.id === e) return o
		if (t) throw Error(`Could not find data for Group with id ${e}`)
	}
	function Da() {
		return St
	}
	function zi(e, t) {
		return Jg.addListener('groupChange', (a) => {
			a.group.id === e && t(a)
		})
	}
	function zt(e, t, a) {
		let o = St.get(e)
		;((St = new Map(St)),
			St.set(e, t),
			Jg.emit('groupChange', { group: e, isUserInteraction: a?.isUserInteraction === !0, prev: o, next: t }))
	}
	function Yg(e) {
		let t = Ta(),
			a = !1
		return (
			t.state === 'active' &&
				(ho({ cursorFlags: 0, state: 'inactive' }),
				t.hitRegions.length > 0 &&
					(_i(e),
					(a = !0),
					t.hitRegions.forEach((o) => {
						let r = oa(o.group.id, !0)
						zt(o.group, r, { isUserInteraction: !0 })
					}))),
			a
		)
	}
	function Mg(e) {
		e.defaultPrevented || Yg(e.currentTarget)
	}
	function FS(e, t, a) {
		let o,
			r = { x: 1 / 0, y: 1 / 0 }
		for (let n of t) {
			let l = Gg(a, n.rect)
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
	function BS(e) {
		return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE
	}
	function NS(e, t) {
		if (e === t) throw new Error('Cannot compare node with itself')
		let a = { a: Og(e), b: Og(t) },
			o
		for (; a.a.at(-1) === a.b.at(-1); ) ((o = a.a.pop()), a.b.pop())
		ve(o, 'Stacking order can only be calculated for elements with a common ancestor')
		let r = { a: Eg(Dg(a.a)), b: Eg(Dg(a.b)) }
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
	function zS(e) {
		let t = getComputedStyle(Zg(e) ?? e).display
		return t === 'flex' || t === 'inline-flex'
	}
	function HS(e) {
		let t = getComputedStyle(e)
		return !!(
			t.position === 'fixed' ||
			(t.zIndex !== 'auto' && (t.position !== 'static' || zS(e))) ||
			+t.opacity < 1 ||
			('transform' in t && t.transform !== 'none') ||
			('webkitTransform' in t && t.webkitTransform !== 'none') ||
			('mixBlendMode' in t && t.mixBlendMode !== 'normal') ||
			('filter' in t && t.filter !== 'none') ||
			('webkitFilter' in t && t.webkitFilter !== 'none') ||
			('isolation' in t && t.isolation === 'isolate') ||
			_S.test(t.willChange) ||
			t.webkitOverflowScrolling === 'touch'
		)
	}
	function Dg(e) {
		let t = e.length
		for (; t--; ) {
			let a = e[t]
			if ((ve(a, 'Missing node'), HS(a))) return a
		}
		return null
	}
	function Eg(e) {
		return (e && Number(getComputedStyle(e).zIndex)) || 0
	}
	function Og(e) {
		let t = []
		for (; e; ) (t.push(e), (e = Zg(e)))
		return t
	}
	function Zg(e) {
		let { parentNode: t } = e
		return BS(t) ? t.host : t
	}
	function US(e, t) {
		return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y
	}
	function qS({ groupElement: e, hitRegion: t, pointerEventTarget: a }) {
		if (!Vg(a) || a.contains(e) || e.contains(a)) return !0
		if (NS(a, e) > 0) {
			let o = a
			for (; o; ) {
				if (o.contains(e)) return !0
				if (US(o.getBoundingClientRect(), t)) return !1
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
				let n = Wg(r),
					l = FS(r.orientation, n, { x: e.clientX, y: e.clientY })
				l &&
					l.distance.x <= 0 &&
					l.distance.y <= 0 &&
					qS({ groupElement: r.element, hitRegion: l.hitRegion.rect, pointerEventTarget: e.target }) &&
					a.push(l.hitRegion)
			}),
			a
		)
	}
	function VS(e, t) {
		if (e.length !== t.length) return !1
		for (let a = 0; a < e.length; a++) if (e[a] != t[a]) return !1
		return !0
	}
	function _e(e, t, a = 0) {
		return Math.abs(Ve(e) - Ve(t)) <= a
	}
	function It(e, t) {
		return _e(e, t) ? 0 : e > t ? 1 : -1
	}
	function mo({ overrideDisabledPanels: e, panelConstraints: t, prevSize: a, size: o }) {
		let { collapsedSize: r = 0, collapsible: n, disabled: l, maxSize: i = 100, minSize: u = 0 } = t
		if (l && !e) return a
		if (It(o, u) < 0)
			if (n) {
				let d = (r + u) / 2
				It(o, d) < 0 ? (o = r) : (o = u)
			} else o = u
		return ((o = Math.min(i, o)), (o = Ve(o)), o)
	}
	function dr({ delta: e, initialLayout: t, panelConstraints: a, pivotIndices: o, prevLayout: r, trigger: n }) {
		if (_e(e, 0)) return t
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
						if ((ve(L != null, `Previous layout not found for panel index ${p}`), _e(L, v))) {
							let I = b - L
							It(I, Math.abs(e)) > 0 && (e = e < 0 ? 0 - I : I)
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
						if ((ve(L != null, `Previous layout not found for panel index ${p}`), _e(L, b))) {
							let I = L - v
							It(I, Math.abs(e)) > 0 && (e = e < 0 ? 0 - I : I)
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
				if (C && It(v, L) < 0)
					if (e > 0) {
						let I = L - b,
							T = I / 2,
							A = v + e
						It(A, L) < 0 && (e = It(e, T) <= 0 ? 0 : I)
					} else {
						let I = L - b,
							T = 100 - I / 2,
							A = v - e
						It(A, L) < 0 && (e = It(100 + e, T) > 0 ? 0 : -I)
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
				let L = mo({ overrideDisabledPanels: l, panelConstraints: a[x], prevSize: b, size: 100 }) - b
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
					b = mo({ overrideDisabledPanels: l, panelConstraints: a[p], prevSize: v, size: C })
				if (
					!_e(v, b) &&
					((m += v - b),
					(d[p] = b),
					m.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, { numeric: !0 }) >= 0)
				)
					break
				e < 0 ? p-- : p++
			}
		}
		if (VS(u, d)) return r
		{
			let p = e < 0 ? f : c,
				x = i[p]
			ve(x != null, `Previous layout not found for panel index ${p}`)
			let v = x + m,
				C = mo({ overrideDisabledPanels: l, panelConstraints: a[p], prevSize: x, size: v })
			if (((d[p] = C), !_e(C, v))) {
				let b = v - C,
					L = e < 0 ? f : c
				for (; L >= 0 && L < a.length; ) {
					let I = d[L]
					ve(I != null, `Previous layout not found for panel index ${L}`)
					let T = I + b,
						A = mo({ overrideDisabledPanels: l, panelConstraints: a[L], prevSize: I, size: T })
					if ((_e(I, A) || ((b -= A - I), (d[L] = A)), _e(b, 0))) break
					e > 0 ? L-- : L++
				}
			}
		}
		let h = Object.values(d).reduce((p, x) => x + p, 0)
		if (!_e(h, 100, 0.1)) return r
		let g = Object.keys(r)
		return d.reduce((p, x, v) => ((p[g[v]] = x), p), {})
	}
	function Aa(e, t) {
		if (Object.keys(e).length !== Object.keys(t).length) return !1
		for (let a in e) if (t[a] === void 0 || It(e[a], t[a]) !== 0) return !1
		return !0
	}
	function Ma({ layout: e, panelConstraints: t }) {
		let a = Object.values(e),
			o = [...a],
			r = o.reduce((i, u) => i + u, 0)
		if (o.length !== t.length) throw Error(`Invalid ${t.length} panel layout: ${o.map((i) => `${i}%`).join(', ')}`)
		if (!_e(r, 100) && o.length > 0)
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
			let c = mo({ overrideDisabledPanels: !0, panelConstraints: t[i], prevSize: u, size: d })
			d != c && ((n += d - c), (o[i] = c))
		}
		if (!_e(n, 0))
			for (let i = 0; i < t.length; i++) {
				let u = o[i]
				ve(u != null, `No layout data found for index ${i}`)
				let d = u + n,
					c = mo({ overrideDisabledPanels: !0, panelConstraints: t[i], prevSize: u, size: d })
				if (u !== c && ((n -= c - u), (o[i] = c), _e(n, 0))) break
			}
		let l = Object.keys(e)
		return o.reduce((i, u, d) => ((i[l[d]] = u), i), {})
	}
	function Qg({ groupId: e, panelId: t }) {
		let a = () => {
				let u = Da()
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
							return C?.collapsible && _e(C.collapsedSize, c[C.panelId])
						}))
				) {
					let x = d.slice(0, h).reduce((v, C) => v + c[C.id], 0)
					return { ...c, [t]: Ve(100 - x) }
				}
				return dr({
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
					v = Ma({ layout: x, panelConstraints: f })
				Aa(g, v) ||
					zt(m, {
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
				return u && _e(d, c)
			},
			resize: (u) => {
				let { group: d } = a(),
					{ element: c } = r(),
					f = xo({ group: d }),
					m = ir({ groupSize: f, panelElement: c, styleProp: u }),
					h = Ve((m / f) * 100)
				i(h)
			}
		}
	}
	function Fg(e) {
		if (e.defaultPrevented) return
		let t = Da()
		Hi(e, t).forEach((a) => {
			if (a.separator && !a.separator.disableDoubleClick) {
				let o = a.panels.find((r) => r.panelConstraints.defaultSize !== void 0)
				if (o) {
					let r = o.panelConstraints.defaultSize,
						n = Qg({ groupId: a.group.id, panelId: o.id })
					n && r !== void 0 && (n.resize(r), e.preventDefault())
				}
			}
		})
	}
	function Un(e) {
		let t = Da()
		for (let [a] of t) if (a.separators.some((o) => o.element === e)) return a
		throw Error('Could not find parent Group for separator element')
	}
	function eh({ groupId: e }) {
		let t = () => {
			let a = Da()
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
					d = Ma({ layout: a, panelConstraints: r })
				return o
					? i
					: (Aa(i, d) ||
							zt(n, {
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
	function ka(e, t) {
		let a = Un(e),
			o = oa(a.id, !0),
			r = a.separators.find((c) => c.element === e)
		ve(r, 'Matching separator not found')
		let n = o.separatorToPanels.get(r)
		ve(n, 'Matching panels not found')
		let l = n.map((c) => a.panels.indexOf(c)),
			i = eh({ groupId: a.id }).getLayout(),
			u = dr({
				delta: t,
				initialLayout: i,
				panelConstraints: o.derivedPanelConstraints,
				pivotIndices: l,
				prevLayout: i,
				trigger: 'keyboard'
			}),
			d = Ma({ layout: u, panelConstraints: o.derivedPanelConstraints })
		Aa(i, d) ||
			zt(
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
	function Bg(e) {
		if (e.defaultPrevented) return
		let t = e.currentTarget,
			a = Un(t)
		if (!a.disabled)
			switch (e.key) {
				case 'ArrowDown': {
					;(e.preventDefault(), a.orientation === 'vertical' && ka(t, 5))
					break
				}
				case 'ArrowLeft': {
					;(e.preventDefault(), a.orientation === 'horizontal' && ka(t, -5))
					break
				}
				case 'ArrowRight': {
					;(e.preventDefault(), a.orientation === 'horizontal' && ka(t, 5))
					break
				}
				case 'ArrowUp': {
					;(e.preventDefault(), a.orientation === 'vertical' && ka(t, -5))
					break
				}
				case 'End': {
					;(e.preventDefault(), ka(t, 100))
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
						ka(t, h - m)
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
					;(e.preventDefault(), ka(t, -100))
					break
				}
			}
	}
	function Ng(e) {
		if (e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0)) return
		let t = Da(),
			a = Hi(e, t),
			o = new Map(),
			r = !1
		;(a.forEach((n) => {
			n.separator && (r || ((r = !0), n.separator.element.focus({ focusVisible: !1, preventScroll: !0 })))
			let l = t.get(n.group)
			l && o.set(n.group, l.layout)
		}),
			ho({
				cursorFlags: 0,
				hitRegions: a,
				initialLayoutMap: o,
				pointerDownAtPoint: { x: e.clientX, y: e.clientY },
				state: 'active'
			}),
			a.length && e.preventDefault())
	}
	function th({
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
				separatorToPanels: T
			} = v
			if (b && I && T) {
				let A = dr({
					delta: p,
					initialLayout: x,
					panelConstraints: b,
					pivotIndices: d.panels.map((R) => h.indexOf(R)),
					prevLayout: I,
					trigger: 'mouse-or-touch'
				})
				if (Aa(A, I)) {
					if (p !== 0 && !g)
						switch (m) {
							case 'horizontal': {
								i |= p < 0 ? jg : Xg
								break
							}
							case 'vertical': {
								i |= p < 0 ? Kg : $g
								break
							}
						}
				} else
					zt(d.group, {
						defaultLayoutDeferred: C,
						derivedPanelConstraints: b,
						groupSize: L,
						layout: A,
						separatorToPanels: T
					})
			}
		})
		let u = 0
		;(t.movementX === 0 ? (u |= l & Rg) : (u |= i & Rg),
			t.movementY === 0 ? (u |= l & Pg) : (u |= i & Pg),
			MS(u),
			_i(e))
	}
	function _g(e) {
		let t = Da(),
			a = Ta()
		a.state === 'active' &&
			th({
				document: e.currentTarget,
				event: e,
				hitRegions: a.hitRegions,
				initialLayoutMap: a.initialLayoutMap,
				mountedGroups: t,
				prevCursorFlags: a.cursorFlags
			})
	}
	function zg(e) {
		if (e.defaultPrevented) return
		let t = Ta(),
			a = Da()
		switch (t.state) {
			case 'active': {
				if (e.buttons === 0) {
					;(ho({ cursorFlags: 0, state: 'inactive' }),
						t.hitRegions.forEach((o) => {
							let r = oa(o.group.id, !0)
							zt(o.group, r, { isUserInteraction: !0 })
						}))
					return
				}
				for (let o of t.hitRegions)
					if (o.separator) {
						let { element: r } = o.separator
						r.hasPointerCapture?.(e.pointerId) || r.setPointerCapture?.(e.pointerId)
					}
				th({
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
					? t.state !== 'inactive' && ho({ cursorFlags: 0, state: 'inactive' })
					: ho({ cursorFlags: 0, hitRegions: o, state: 'hover' }),
					_i(e.currentTarget))
				break
			}
		}
	}
	function Hg(e) {
		e.relatedTarget instanceof HTMLIFrameElement &&
			Ta().state === 'hover' &&
			ho({ cursorFlags: 0, state: 'inactive' })
	}
	function Ug(e) {
		e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0) || (Yg(e.currentTarget) && e.preventDefault())
	}
	function qg(e) {
		let t = 0,
			a = 0,
			o = {}
		for (let n of e)
			if (n.defaultSize !== void 0) {
				t++
				let l = Ve(n.defaultSize)
				;((a += l), (o[n.panelId] = l))
			} else o[n.panelId] = void 0
		let r = e.length - t
		if (r !== 0) {
			let n = Ve((100 - a) / r)
			for (let l of e) l.defaultSize === void 0 && (o[l.panelId] = n)
		}
		return o
	}
	function GS(e, t, a) {
		if (!a[0]) return
		let o = e.panels.find((u) => u.element === t)
		if (!o || !o.onResize) return
		let r = xo({ group: e }),
			n = e.orientation === 'horizontal' ? o.element.offsetWidth : o.element.offsetHeight,
			l = o.mutableValues.prevSize,
			i = { asPercentage: Ve((n / r) * 100), inPixels: n }
		;((o.mutableValues.prevSize = i), o.onResize(i, o.id, l))
	}
	function WS(e, t) {
		if (Object.keys(e).length !== Object.keys(t).length) return !1
		for (let a in e) if (e[a] !== t[a]) return !1
		return !0
	}
	function jS({ group: e, nextGroupSize: t, prevGroupSize: a, prevLayout: o }) {
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
					g = Ve((h / t) * 100)
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
				c[f] = Ve((m / n) * d)
			}
		else {
			let f = Ve(d / u.length)
			for (let m of u) c[m] = f
		}
		return c
	}
	function XS(e, t) {
		let a = e.map((r) => r.id),
			o = Object.keys(t)
		if (a.length !== o.length) return !1
		for (let r of a) if (!o.includes(r)) return !1
		return !0
	}
	function KS(e) {
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
							let C = xo({ group: e })
							if (C === 0) return
							let b = oa(e.id)
							if (!b) return
							let L = Fi(e),
								I = b.defaultLayoutDeferred ? qg(L) : b.layout,
								T = jS({ group: e, nextGroupSize: C, prevGroupSize: b.groupSize, prevLayout: I }),
								A = Ma({ layout: T, panelConstraints: L })
							if (
								!b.defaultLayoutDeferred &&
								Aa(b.layout, A) &&
								WS(b.derivedPanelConstraints, L) &&
								b.groupSize === C
							)
								return
							zt(e, {
								defaultLayoutDeferred: !1,
								derivedPanelConstraints: L,
								groupSize: C,
								layout: A,
								separatorToPanels: b.separatorToPanels
							})
						}
					} else GS(e, v, x)
				}
			})
		;(n.observe(e.element),
			e.panels.forEach((g) => {
				;(ve(!o.has(g.id), `Panel ids must be unique; id "${g.id}" was used more than once`),
					o.add(g.id),
					g.onResize && n.observe(g.element))
			}))
		let l = xo({ group: e }),
			i = Fi(e),
			u = e.panels.map(({ id: g }) => g).join(','),
			d = e.mutableState.defaultLayout
		d && (XS(e.panels, d) || (d = void 0))
		let c = e.mutableState.layouts[u] ?? d ?? qg(i),
			f = Ma({ layout: c, panelConstraints: i }),
			m = e.element.ownerDocument
		po.set(m, (po.get(m) ?? 0) + 1)
		let h = new Map()
		return (
			Wg(e).forEach((g) => {
				g.separator && h.set(g.separator, g.panels)
			}),
			zt(e, {
				defaultLayoutDeferred: l === 0,
				derivedPanelConstraints: i,
				groupSize: l,
				layout: f,
				separatorToPanels: h
			}),
			e.separators.forEach((g) => {
				;(ve(!r.has(g.id), `Separator ids must be unique; id "${g.id}" was used more than once`),
					r.add(g.id),
					g.element.addEventListener('keydown', Bg))
			}),
			po.get(m) === 1 &&
				(m.addEventListener('contextmenu', Mg, !0),
				m.addEventListener('dblclick', Fg, !0),
				m.addEventListener('pointerdown', Ng, !0),
				m.addEventListener('pointerleave', _g),
				m.addEventListener('pointermove', zg),
				m.addEventListener('pointerout', Hg),
				m.addEventListener('pointerup', Ug, !0)),
			function () {
				;((t = !1),
					po.set(m, Math.max(0, (po.get(m) ?? 0) - 1)),
					OS(e),
					e.separators.forEach((g) => {
						g.element.removeEventListener('keydown', Bg)
					}),
					po.get(m) ||
						(m.removeEventListener('contextmenu', Mg, !0),
						m.removeEventListener('dblclick', Fg, !0),
						m.removeEventListener('pointerdown', Ng, !0),
						m.removeEventListener('pointerleave', _g),
						m.removeEventListener('pointermove', zg),
						m.removeEventListener('pointerout', Hg),
						m.removeEventListener('pointerup', Ug, !0)),
					n.disconnect())
			}
		)
	}
	function $S() {
		let [e, t] = k({}),
			a = W(() => t({}), [])
		return [e, a]
	}
	function Ui(e) {
		let t = za()
		return `${e ?? t}`
	}
	function ur(e) {
		let t = w(e)
		return (
			Ea(() => {
				t.current = e
			}, [e]),
			W((...a) => t.current?.(...a), [t])
		)
	}
	function qi(...e) {
		return ur((t) => {
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
			Ea(() => {
				for (let a in e) t.current[a] = e[a]
			}, [e]),
			t.current
		)
	}
	function JS(e, t) {
		let a = w({ getLayout: () => ({}), setLayout: DS })
		;(hr(t, () => a.current, []),
			Ea(() => {
				Object.assign(a.current, eh({ groupId: e }))
			}))
	}
	function oh({
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
			p = ur((O) => {
				Aa(g.current.onLayoutChange, O) || ((g.current.onLayoutChange = O), u?.(O))
			}),
			x = ur((O, U) => {
				Aa(g.current.onLayoutChanged, O) || ((g.current.onLayoutChanged = O), d?.(O, { isUserInteraction: U }))
			}),
			v = Ui(i),
			C = w(null),
			[b, L] = $S(),
			I = w({ lastExpandedPanelSizes: {}, layouts: {}, panels: [], resizeTargetMinimumSize: f, separators: [] }),
			T = qi(C, n)
		JS(v, l)
		let A = ur((O, U) => {
				let $ = Ta(),
					z = Ag(O),
					Q = oa(O)
				if (Q) {
					let j = !1
					return (
						$.state === 'active' && (j = $.hitRegions.some((oe) => oe.group === z)),
						{ flexGrow: Q.layout[U] ?? 1, pointerEvents: j ? 'none' : void 0 }
					)
				}
				if (a?.[U]) return { flexGrow: a?.[U] }
			}),
			R = Vi({ defaultLayout: a, disableCursor: o }),
			B = we(
				() => ({
					get disableCursor() {
						return !!R.disableCursor
					},
					getPanelStyles: A,
					id: v,
					orientation: c,
					registerPanel: (O) => {
						let U = I.current
						return (
							(U.panels = Bi(c, [...U.panels, O])),
							L(),
							() => {
								;((U.panels = U.panels.filter(($) => $ !== O)), L())
							}
						)
					},
					registerSeparator: (O) => {
						let U = I.current
						return (
							(U.separators = Bi(c, [...U.separators, O])),
							L(),
							() => {
								;((U.separators = U.separators.filter(($) => $ !== O)), L())
							}
						)
					},
					updatePanelProps: (O, { disabled: U }) => {
						let $ = I.current.panels.find((j) => j.id === O)
						$ && ($.panelConstraints.disabled = U)
						let z = Ag(v),
							Q = oa(v)
						z && Q && zt(z, { ...Q, derivedPanelConstraints: Fi(z) })
					},
					updateSeparatorProps: (O, { disabled: U, disableDoubleClick: $ }) => {
						let z = I.current.separators.find((Q) => Q.id === O)
						z && ((z.disabled = U), (z.disableDoubleClick = $))
					}
				}),
				[A, v, L, c, R]
			),
			X = w(null)
		return (
			Ea(() => {
				let O = C.current
				if (O === null) return
				let U = I.current,
					$
				if (R.defaultLayout !== void 0 && Object.keys(R.defaultLayout).length === U.panels.length) {
					$ = {}
					for (let re of U.panels) {
						let pe = R.defaultLayout[re.id]
						pe !== void 0 && ($[re.id] = pe)
					}
				}
				let z = {
					disabled: !!r,
					element: O,
					id: v,
					mutableState: {
						defaultLayout: $,
						disableCursor: !!R.disableCursor,
						expandedPanelSizes: I.current.lastExpandedPanelSizes,
						layouts: I.current.layouts
					},
					orientation: c,
					panels: U.panels,
					resizeTargetMinimumSize: U.resizeTargetMinimumSize,
					separators: U.separators
				}
				X.current = z
				let Q = KS(z),
					{ defaultLayoutDeferred: j, derivedPanelConstraints: oe, layout: M } = oa(z.id, !0)
				!j && oe.length > 0 && (p(M), x(M, !1))
				let q = zi(v, (re) => {
					let { defaultLayoutDeferred: pe, derivedPanelConstraints: ne, layout: se } = re.next
					if (pe || ne.length === 0) return
					let ue = z.panels.map(({ id: xe }) => xe).join(',')
					;((z.mutableState.layouts[ue] = se),
						ne.forEach((xe) => {
							if (xe.collapsible) {
								let { layout: H } = re.prev ?? {}
								if (H) {
									let de = _e(xe.collapsedSize, se[xe.panelId]),
										Ce = _e(xe.collapsedSize, H[xe.panelId])
									de && !Ce && (z.mutableState.expandedPanelSizes[xe.panelId] = H[xe.panelId])
								}
							}
						}))
					let ke = Ta().state !== 'active'
					;(p(se), ke && x(se, re.isUserInteraction))
				})
				return () => {
					;((X.current = null), Q(), q())
				}
			}, [r, v, x, p, c, b, R]),
			E(() => {
				let O = X.current
				O && ((O.mutableState.defaultLayout = a), (O.mutableState.disableCursor = !!o))
			}),
			s(ah.Provider, {
				value: B,
				children: s('div', {
					...h,
					className: t,
					'data-group': !0,
					'data-testid': v,
					id: v,
					ref: T,
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
		let e = He(ah)
		return (ve(e, 'Group Context not found; did you render a Panel or Separator outside of a Group?'), e)
	}
	function YS(e, t) {
		let { id: a } = Gi(),
			o = w({
				collapse: Oi,
				expand: Oi,
				getSize: () => ({ asPercentage: 0, inPixels: 0 }),
				isCollapsed: () => !1,
				resize: Oi
			})
		;(hr(t, () => o.current, []),
			Ea(() => {
				Object.assign(o.current, Qg({ groupId: a, panelId: e }))
			}))
	}
	function rh({
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
			{ getPanelStyles: L, id: I, orientation: T, registerPanel: A, updatePanelProps: R } = Gi(),
			B = f !== null,
			X = ur((z, Q, j) => {
				f?.(z, u, j)
			})
		;(Ea(() => {
			let z = C.current
			if (z !== null) {
				let Q = {
					element: z,
					id: x,
					idIsStable: p,
					mutableValues: { expandToSize: void 0, prevSize: void 0 },
					onResize: B ? X : void 0,
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
				return A(Q)
			}
		}, [i, a, o, r, B, x, p, d, c, X, A, v]),
			E(() => {
				R(x, { disabled: n })
			}, [n, x, R]),
			YS(x, m))
		let O = () => {
				let z = L(I, x)
				if (z) return JSON.stringify(z)
			},
			U = Zn((z) => zi(I, z), O, O),
			$
		return (
			U
				? ($ = JSON.parse(U))
				: r !== void 0
					? ($ = { flexGrow: void 0, flexShrink: void 0, flexBasis: r })
					: ($ = { flexGrow: 1 }),
			s('div', {
				...g,
				'data-disabled': n || void 0,
				'data-panel': !0,
				'data-testid': x,
				id: x,
				ref: b,
				style: { ...ZS, display: 'flex', flexBasis: 0, flexShrink: 1, overflow: 'visible', ...$ },
				children: s('div', {
					className: t,
					style: {
						maxHeight: '100%',
						maxWidth: '100%',
						flexGrow: 1,
						overflow: 'auto',
						...h,
						touchAction: T === 'horizontal' ? 'pan-y' : 'pan-x'
					},
					children: e
				})
			})
		)
	}
	function QS({ layout: e, panelConstraints: t, panelId: a, panelIndex: o }) {
		let r,
			n,
			l = e[a],
			i = t.find((u) => u.panelId === a)
		if (i) {
			let u = i.maxSize,
				d = i.collapsible ? i.collapsedSize : i.minSize,
				c = [o, o + 1]
			;((n = Ma({
				layout: dr({ delta: d - l, initialLayout: e, panelConstraints: t, pivotIndices: c, prevLayout: e }),
				panelConstraints: t
			})[a]),
				(r = Ma({
					layout: dr({ delta: u - l, initialLayout: e, panelConstraints: t, pivotIndices: c, prevLayout: e }),
					panelConstraints: t
				})[a]))
		}
		return { valueControls: a, valueMax: r, valueMin: n, valueNow: l }
	}
	function nh({
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
			[c, f] = k({}),
			[m, h] = k('inactive'),
			[g, p] = k(!1),
			x = w(null),
			v = qi(x, r),
			{ disableCursor: C, id: b, orientation: L, registerSeparator: I, updateSeparatorProps: T } = Gi(),
			A = L === 'horizontal' ? 'vertical' : 'horizontal'
		;(Ea(() => {
			let X = x.current
			if (X !== null) {
				let O = { disabled: d.disabled, disableDoubleClick: d.disableDoubleClick, element: X, id: u },
					U = I(O),
					$ = AS((Q) => {
						h(
							Q.next.state !== 'inactive' && Q.next.hitRegions.some((j) => j.separator === O)
								? Q.next.state
								: 'inactive'
						)
					}),
					z = zi(b, (Q) => {
						let { derivedPanelConstraints: j, layout: oe, separatorToPanels: M } = Q.next,
							q = M.get(O)
						if (q) {
							let re = q[0],
								pe = q.indexOf(re)
							f(QS({ layout: oe, panelConstraints: j, panelId: re.id, panelIndex: pe }))
						}
					})
				return () => {
					;($(), z(), U())
				}
			}
		}, [b, u, I, d]),
			E(() => {
				T(u, { disabled: a, disableDoubleClick: o })
			}, [a, o, u, T]))
		let R
		a && !C && (R = 'not-allowed')
		let B
		return (
			a ? (B = 'disabled') : m === 'active' ? (B = 'active') : g ? (B = 'focus') : (B = m),
			s('div', {
				...i,
				'aria-controls': c.valueControls,
				'aria-disabled': a || void 0,
				'aria-orientation': A,
				'aria-valuemax': c.valueMax,
				'aria-valuemin': c.valueMin,
				'aria-valuenow': c.valueNow,
				children: e,
				className: t,
				'data-separator': B,
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
		go,
		Ni,
		DS,
		Oi,
		jg,
		Xg,
		Kg,
		$g,
		Rg,
		Pg,
		Hn,
		Tg,
		St,
		Jg,
		_S,
		po,
		Ea,
		ah,
		ZS,
		sh = y(() => {
			'use client'
			N()
			ee()
			qn = class {
				constructor() {
					Jn(this, aa, {})
				}
				addListener(t, a) {
					let o = Na(this, aa)[t]
					return (
						o === void 0 ? (Na(this, aa)[t] = [a]) : o.includes(a) || o.push(a),
						() => {
							this.removeListener(t, a)
						}
					)
				}
				emit(t, a) {
					let o = Na(this, aa)[t]
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
					let o = Na(this, aa)[t]
					if (o !== void 0) {
						let r = o.indexOf(a)
						r >= 0 && o.splice(r, 1)
					}
				}
			}
			aa = new WeakMap()
			;((go = { cursorFlags: 0, state: 'inactive' }), (Ni = new qn()))
			;((DS = (e) => e), (Oi = () => {}), (jg = 1), (Xg = 2), (Kg = 4), ($g = 8), (Rg = 3), (Pg = 12))
			Tg = new WeakMap()
			;((St = new Map()), (Jg = new qn()))
			_S = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/
			po = new Map()
			Ea = typeof window < 'u' ? Pt : E
			ah = Fe(null)
			oh.displayName = 'Group'
			rh.displayName = 'Panel'
			ZS = {
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
			nh.displayName = 'Separator'
		})
	var lh = y(() => {
		sh()
		he()
		N()
	})
	var tw,
		PM,
		kM,
		ih = y(() => {
			'use client'
			ee()
			;((tw = (e, t, a, o, r, n, l, i) => {
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
				(PM = Fe(void 0)),
				(kM = Io(
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
							dangerouslySetInnerHTML: { __html: `(${tw.toString()})(${c})` }
						})
					}
				)))
		})
	function aw(e) {
		if (!e || typeof document > 'u') return
		let t = document.head || document.getElementsByTagName('head')[0],
			a = document.createElement('style')
		;((a.type = 'text/css'),
			t.appendChild(a),
			a.styleSheet ? (a.styleSheet.cssText = e) : a.appendChild(document.createTextNode(e)))
	}
	var EM,
		Wi,
		ji,
		nt,
		ow,
		rw,
		nw,
		sw,
		lw,
		OM,
		uh = y(() => {
			'use client'
			ee()
			qa()
			;((EM = Array(12).fill(0)),
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
											if (((l = ['resolve', d]), na.isValidElement(d)))
												((n = !1), this.create({ id: o, type: 'default', message: d }))
											else if (rw(d) && !d.ok) {
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
														typeof f == 'object' && !na.isValidElement(f)
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
														typeof f == 'object' && !na.isValidElement(f)
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
														typeof f == 'object' && !na.isValidElement(f)
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
														typeof c == 'object' && !na.isValidElement(c)
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
				(nt = new ji()),
				(ow = (e, t) => {
					let a = t?.id || Wi++
					return (nt.addToast({ title: e, ...t, id: a }), a)
				}),
				(rw = (e) =>
					e &&
					typeof e == 'object' &&
					'ok' in e &&
					typeof e.ok == 'boolean' &&
					'status' in e &&
					typeof e.status == 'number'),
				(nw = ow),
				(sw = () => nt.toasts),
				(lw = () => nt.getActiveToasts()),
				(OM = Object.assign(
					nw,
					{
						success: nt.success,
						info: nt.info,
						warning: nt.warning,
						error: nt.error,
						custom: nt.custom,
						message: nt.message,
						promise: nt.promise,
						dismiss: nt.dismiss,
						loading: nt.loading
					},
					{ getHistory: sw, getToasts: lw }
				)))
			aw(
				"[data-sonner-toaster][dir=ltr],html[dir=ltr]{--toast-icon-margin-start:-3px;--toast-icon-margin-end:4px;--toast-svg-margin-start:-1px;--toast-svg-margin-end:0px;--toast-button-margin-start:auto;--toast-button-margin-end:0;--toast-close-button-start:0;--toast-close-button-end:unset;--toast-close-button-transform:translate(-35%, -35%)}[data-sonner-toaster][dir=rtl],html[dir=rtl]{--toast-icon-margin-start:4px;--toast-icon-margin-end:-3px;--toast-svg-margin-start:0px;--toast-svg-margin-end:-1px;--toast-button-margin-start:0;--toast-button-margin-end:auto;--toast-close-button-start:unset;--toast-close-button-end:0;--toast-close-button-transform:translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1:hsl(0, 0%, 99%);--gray2:hsl(0, 0%, 97.3%);--gray3:hsl(0, 0%, 95.1%);--gray4:hsl(0, 0%, 93%);--gray5:hsl(0, 0%, 90.9%);--gray6:hsl(0, 0%, 88.7%);--gray7:hsl(0, 0%, 85.8%);--gray8:hsl(0, 0%, 78%);--gray9:hsl(0, 0%, 56.1%);--gray10:hsl(0, 0%, 52.3%);--gray11:hsl(0, 0%, 43.5%);--gray12:hsl(0, 0%, 9%);--border-radius:8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:0;z-index:999999999;transition:transform .4s ease}@media (hover:none) and (pointer:coarse){[data-sonner-toaster][data-lifted=true]{transform:none}}[data-sonner-toaster][data-x-position=right]{right:var(--offset-right)}[data-sonner-toaster][data-x-position=left]{left:var(--offset-left)}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translateX(-50%)}[data-sonner-toaster][data-y-position=top]{top:var(--offset-top)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--offset-bottom)}[data-sonner-toast]{--y:translateY(100%);--lift-amount:calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:0;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px rgba(0,0,0,.1);width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-y-position=top]{top:0;--y:translateY(-100%);--lift:1;--lift-amount:calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y:translateY(100%);--lift:-1;--lift-amount:calc(var(--lift) * var(--gap))}[data-sonner-toast][data-styled=true] [data-description]{font-weight:400;line-height:1.4;color:#3f3f3f}[data-rich-colors=true][data-sonner-toast][data-styled=true] [data-description]{color:inherit}[data-sonner-toaster][data-sonner-theme=dark] [data-description]{color:#e8e8e8}[data-sonner-toast][data-styled=true] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast][data-styled=true] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast][data-styled=true] [data-icon]>*{flex-shrink:0}[data-sonner-toast][data-styled=true] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast][data-styled=true] [data-content]{display:flex;flex-direction:column;gap:2px}[data-sonner-toast][data-styled=true] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;font-weight:500;cursor:pointer;outline:0;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast][data-styled=true] [data-button]:focus-visible{box-shadow:0 0 0 2px rgba(0,0,0,.4)}[data-sonner-toast][data-styled=true] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast][data-styled=true] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-styled=true] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast][data-styled=true] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;color:var(--gray12);background:var(--normal-bg);border:1px solid var(--gray4);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast][data-styled=true] [data-close-button]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-styled=true] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast][data-styled=true]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]::before{content:'';position:absolute;left:-100%;right:-100%;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]::before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]::before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]::before{content:'';position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast][data-expanded=true]::after{content:'';position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y:translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale:var(--toasts-before) * 0.05 + 1;--y:translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-x-position=right]{right:0}[data-sonner-toast][data-x-position=left]{left:0}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y:translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y:translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]::before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount-y,0)) translateX(var(--swipe-amount-x,0));transition:none}[data-sonner-toast][data-swiped=true]{user-select:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation-duration:.2s;animation-timing-function:ease-out;animation-fill-mode:forwards}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=left]{animation-name:swipe-out-left}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=right]{animation-name:swipe-out-right}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=up]{animation-name:swipe-out-up}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=down]{animation-name:swipe-out-down}@keyframes swipe-out-left{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) - 100%));opacity:0}}@keyframes swipe-out-right{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) + 100%));opacity:0}}@keyframes swipe-out-up{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) - 100%));opacity:0}}@keyframes swipe-out-down{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) + 100%));opacity:0}}@media (max-width:600px){[data-sonner-toaster]{position:fixed;right:var(--mobile-offset-right);left:var(--mobile-offset-left);width:100%}[data-sonner-toaster][dir=rtl]{left:calc(var(--mobile-offset-left) * -1)}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - var(--mobile-offset-left) * 2)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset-left)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--mobile-offset-bottom)}[data-sonner-toaster][data-y-position=top]{top:var(--mobile-offset-top)}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset-left);right:var(--mobile-offset-right);transform:none}}[data-sonner-toaster][data-sonner-theme=light]{--normal-bg:#fff;--normal-border:var(--gray4);--normal-text:var(--gray12);--success-bg:hsl(143, 85%, 96%);--success-border:hsl(145, 92%, 87%);--success-text:hsl(140, 100%, 27%);--info-bg:hsl(208, 100%, 97%);--info-border:hsl(221, 91%, 93%);--info-text:hsl(210, 92%, 45%);--warning-bg:hsl(49, 100%, 97%);--warning-border:hsl(49, 91%, 84%);--warning-text:hsl(31, 92%, 45%);--error-bg:hsl(359, 100%, 97%);--error-border:hsl(359, 100%, 94%);--error-text:hsl(360, 100%, 45%)}[data-sonner-toaster][data-sonner-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg:#000;--normal-border:hsl(0, 0%, 20%);--normal-text:var(--gray1)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg:#fff;--normal-border:var(--gray3);--normal-text:var(--gray12)}[data-sonner-toaster][data-sonner-theme=dark]{--normal-bg:#000;--normal-bg-hover:hsl(0, 0%, 12%);--normal-border:hsl(0, 0%, 20%);--normal-border-hover:hsl(0, 0%, 25%);--normal-text:var(--gray1);--success-bg:hsl(150, 100%, 6%);--success-border:hsl(147, 100%, 12%);--success-text:hsl(150, 86%, 65%);--info-bg:hsl(215, 100%, 6%);--info-border:hsl(223, 43%, 17%);--info-text:hsl(216, 87%, 65%);--warning-bg:hsl(64, 100%, 6%);--warning-border:hsl(60, 100%, 9%);--warning-text:hsl(46, 87%, 65%);--error-bg:hsl(358, 76%, 10%);--error-border:hsl(357, 89%, 16%);--error-text:hsl(358, 100%, 81%)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]{background:var(--normal-bg);border-color:var(--normal-border);color:var(--normal-text)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]:hover{background:var(--normal-bg-hover);border-color:var(--normal-border-hover)}[data-rich-colors=true][data-sonner-toast][data-type=success]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=info]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=error]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}[data-rich-colors=true][data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size:16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:first-child{animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}100%{opacity:.15}}@media (prefers-reduced-motion){.sonner-loading-bar,[data-sonner-toast],[data-sonner-toast]>*{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}"
			)
		})
	var dh = y(() => {
		'use client'
		ih()
		uh()
		N()
	})
	var iw,
		Xi = y(() => {
			wo()
			he()
			N()
			iw = Gt(
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
	var KM,
		ch = y(() => {
			'use client'
			ee()
			he()
			Xi()
			N()
			KM = Fe({ size: 'default', variant: 'default', spacing: 0 })
		})
	var Ki = y(() => {
		cu()
		he()
		Fu()
		vm()
		Qo()
		Lm()
		_m()
		bi()
		Hm()
		qm()
		Vm()
		Gm()
		Xm()
		$m()
		eg()
		rg()
		ng()
		lg()
		ug()
		gg()
		hg()
		xg()
		vg()
		Cg()
		bg()
		Lg()
		Ig()
		Sg()
		wg()
		yg()
		lh()
		dh()
		Xi()
		ch()
	})
	function ph(e) {
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
			let g = uw(e)
			return g === '0'
				? !1
				: g === '1'
					? !0
					: new URLSearchParams(window.location.search).get('xpertDebug') === e || i.enabled
		}
		function c(g, p = {}) {
			;(!t && g !== 'ready') ||
				window.parent.postMessage({ channel: fh, protocolVersion: 1, instanceId: t, type: g, ...p }, '*')
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
			if (g.source !== window.parent || !wt(g.data)) return
			let p = g.data
			if (Z(p, 'channel') !== fh || cr(p, 'protocolVersion') !== 1) return
			let x = Z(p, 'type')
			if (x === 'init') {
				;((t = Z(p, 'instanceId') ?? null),
					(o = cw(p)),
					(i = o.debug ?? i),
					(document.documentElement.lang = o.locale),
					u.info('bridge.init', { locale: o.locale, viewKey: Z(o.manifest, 'key') }))
				for (let b of n) b(o)
				h()
				return
			}
			if (Z(p, 'instanceId') !== t) return
			if (x === 'hostEvent') {
				let b = fw(p.event)
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
						u.debug('request-data.started', { modelId: Z(ge(g, 'parameters'), 'modelId') }),
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
	function uw(e, t = (a) => window.localStorage?.getItem(a) ?? null) {
		try {
			return t(`xpert.debug.${e}`)
		} catch {
			return null
		}
	}
	function mh(e) {
		let t = ge(e.payload, 'parameters') ?? {}
		return {
			page: cr(e.initialQuery, 'page') ?? 1,
			pageSize: cr(e.initialQuery, 'pageSize') ?? 50,
			search: Z(e.initialQuery, 'search'),
			parameters: { ...t, ...(ge(e.initialQuery, 'parameters') ?? {}) }
		}
	}
	function gh(e) {
		let t = document.documentElement,
			a = wt(e) ? e : void 0,
			r =
				(typeof e == 'string' ? e : (Z(a, 'mode') ?? Z(a, 'name') ?? Z(a, 'scheme')))
					?.toLowerCase()
					.includes('dark') ?? !1
		;((t.dataset.theme = r ? 'dark' : 'light'),
			t.classList.toggle('dark', r),
			(t.style.colorScheme = r ? 'dark' : 'light'))
		let n = ge(a, 'tokens')
		if (n)
			for (let [l, i] of Object.entries(n))
				(typeof i == 'string' || typeof i == 'number') && t.style.setProperty(`--xui-${pw(l)}`, String(i))
	}
	function hh(e) {
		return ge(e, 'data') ?? {}
	}
	function Gn(e) {
		return ge(e, 'result') ?? {}
	}
	function Wn(e, t, a) {
		if (typeof e == 'string') return e
		if (!wt(e)) return a
		let r = dw(t) === 'zh-Hans' ? 'zh_Hans' : 'en_US',
			n = r === 'zh_Hans' ? 'en_US' : 'zh_Hans'
		return Z(e, r) ?? Z(e, n) ?? a
	}
	function dw(e) {
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
	function wt(e) {
		return !!e && typeof e == 'object' && !Array.isArray(e)
	}
	function ge(e, t) {
		let a = e?.[t]
		return wt(a) ? a : void 0
	}
	function Z(e, t) {
		let a = e?.[t]
		return typeof a == 'string' ? a : void 0
	}
	function cr(e, t) {
		let a = e?.[t]
		return typeof a == 'number' && Number.isFinite(a) ? a : void 0
	}
	function fr(e, t) {
		let a = e?.[t]
		return typeof a == 'boolean' ? a : void 0
	}
	function vo(e, t) {
		let a = e?.[t]
		return Array.isArray(a) ? a : []
	}
	function cw(e) {
		let t = ge(e, 'debug')
		return {
			manifest: ge(e, 'manifest') ?? {},
			payload: ge(e, 'payload') ?? {},
			initialQuery: ge(e, 'initialQuery') ?? {},
			locale: Z(e, 'locale') ?? 'en-US',
			theme: e.theme,
			debug: t ? { enabled: fr(t, 'enabled') ?? !1, production: fr(t, 'production') ?? !0 } : void 0
		}
	}
	function fw(e) {
		return wt(e)
			? {
					id: Z(e, 'id'),
					type: Z(e, 'type'),
					source: Z(e, 'source'),
					toolName: Z(e, 'toolName'),
					data: ge(e, 'data')
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
	function pw(e) {
		return e
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.replace(/[\s_]+/g, '-')
			.toLowerCase()
	}
	var fh,
		$i = y(() => {
			fh = 'xpertai.remote_component'
		})
	function xh(e) {
		return vo(e, 'items')
			.filter(wt)
			.map((t) => ({ value: Ji(t.value), label: Z(t, 'label') ?? Ji(t.value), description: Z(t, 'description') }))
			.filter((t) => t.value)
	}
	function vh(e) {
		return {
			items: vo(e, 'items').filter(wt).map(mw),
			total: cr(e, 'total') ?? 0,
			scopeSummary: Z(ge(e, 'meta'), 'scopeSummary')
		}
	}
	function mw(e) {
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
			isApplication: fr(e, 'isApplication') ?? !1,
			embeddingStatus: Z(e, 'embeddingStatus'),
			error: Z(e, 'error'),
			visible: fr(e, 'visible') ?? !0,
			updatedAt: Z(e, 'updatedAt'),
			tags: vo(e, 'tags')
				.filter(wt)
				.map((t) => ({ id: Z(t, 'id'), name: Z(t, 'name'), color: Z(t, 'color') })),
			draft: ge(e, 'draft'),
			options: ge(e, 'options')
		}
	}
	function Ch(e) {
		let t = e.options ?? ge(e.draft, 'options') ?? {},
			a = vo(t, 'dimensions').filter((r) => typeof r == 'string'),
			o = vo(t, 'filters')
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
	function bh(e) {
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
			filters: t.filter(wt),
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
	function Ih(e) {
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
					D(Wm, {
						defaultValue: 'definition',
						className: 'min-h-0',
						children: [
							D(jm, {
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
											s(Oa, {
												label: F(e.locale, 'Metric code', '\u6307\u6807\u7F16\u7801'),
												required: !0,
												value: e.form.code,
												onChange: (a) => t('code', a)
											}),
											s(Oa, {
												label: F(e.locale, 'Metric name', '\u6307\u6807\u540D\u79F0'),
												required: !0,
												value: e.form.name,
												onChange: (a) => t('name', a)
											}),
											s(Fa, {
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
											s(Fa, {
												label: F(e.locale, 'Semantic model', '\u8BED\u4E49\u6A21\u578B'),
												value: e.form.modelId,
												options: e.models,
												placeholder: F(e.locale, 'Choose model', '\u9009\u62E9\u6A21\u578B'),
												onChange: (a) => t('modelId', a)
											}),
											s(Fa, {
												label: F(e.locale, 'Cube / entity', 'Cube / \u5B9E\u4F53'),
												value: e.form.cube,
												options: e.cubes,
												placeholder: F(
													e.locale,
													'Choose Cube',
													'\u9009\u62E9\u7ACB\u65B9\u4F53'
												),
												onChange: (a) => t('cube', a)
											}),
											s(Fa, {
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
											s(Fa, {
												label: F(e.locale, 'Base measure', '\u57FA\u7840\u5EA6\u91CF'),
												value: e.form.measure,
												options: e.measures,
												placeholder: F(
													e.locale,
													'Choose measure',
													'\u9009\u62E9\u57FA\u7840\u5EA6\u91CF'
												),
												onChange: (a) => t('measure', a)
											}),
											s(Fa, {
												label: F(e.locale, 'SQL aggregator', 'SQL \u805A\u5408\u5668'),
												value: e.form.aggregator,
												options: ['sum', 'count', 'min', 'max', 'avg', 'distinct-count'].map(
													(a) => ({ value: a, label: a })
												),
												onChange: (a) => t('aggregator', a)
											}),
											s(Oa, {
												label: F(e.locale, 'Calendar', '\u65E5\u5386'),
												value: e.form.calendar,
												onChange: (a) => t('calendar', a)
											}),
											s(Oa, {
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
												children: s(Oa, {
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
											s(Fa, {
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
											s(Oa, {
												label: F(e.locale, 'Principal', '\u8D1F\u8D23\u4EBA'),
												value: e.form.principal,
												onChange: (a) => t('principal', a)
											}),
											s(Oa, {
												label: F(e.locale, 'Validity', '\u6709\u6548\u671F'),
												value: e.form.validity,
												onChange: (a) => t('validity', a)
											}),
											D('div', {
												className: 'grid gap-2',
												children: [
													s(Lh, {
														label: F(
															e.locale,
															'Visible in catalog',
															'\u5728\u76EE\u5F55\u4E2D\u53EF\u89C1'
														),
														checked: e.form.visible,
														onChange: (a) => t('visible', a)
													}),
													s(Lh, {
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
					D(zm, {
						children: [
							s(Ke, {
								variant: 'outline',
								onClick: () => e.onOpenChange(!1),
								children: F(e.locale, 'Cancel', '\u53D6\u6D88')
							}),
							s(Ke, {
								disabled:
									e.busy ||
									!e.form.code.trim() ||
									!e.form.name.trim() ||
									!e.form.modelId ||
									!e.form.cube ||
									(e.form.type === 'BASIC' && !e.form.measure),
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
	function Oa(e) {
		let t = za()
		return D('div', {
			className: 'grid gap-1.5',
			children: [
				s(lr, { htmlFor: t, children: e.label }),
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
		let t = za()
		return D('div', {
			className: 'grid gap-1.5',
			children: [
				s(lr, { htmlFor: t, children: e.label }),
				s(Km, {
					id: t,
					className: e.className,
					value: e.value,
					onChange: (a) => e.onChange(a.currentTarget.value)
				})
			]
		})
	}
	function Fa(e) {
		return D('div', {
			className: 'grid gap-1.5',
			children: [
				s(lr, { children: e.label }),
				D(or, {
					value: e.value,
					onValueChange: e.onChange,
					children: [
						s(nr, { children: s(rr, { placeholder: e.placeholder }) }),
						s(sr, { children: e.options.map((t) => s(fo, { value: t.value, children: t.label }, t.value)) })
					]
				})
			]
		})
	}
	function Lh(e) {
		return D('div', {
			className: 'flex min-h-10 items-center justify-between rounded-md border px-3',
			children: [s(lr, { children: e.label }), s(sg, { checked: e.checked, onCheckedChange: e.onChange })]
		})
	}
	var Sh = y(() => {
		ee()
		Ki()
		Zi()
		N()
	})
	var Lw = _h(() => {
		ee()
		uu()
		Ki()
		$i()
		Sh()
		Zi()
		N()
		var Ht = ph('datax-metric-management')
		function gw() {
			let [e, t] = k(null),
				[a, o] = k({ page: 1, pageSize: 20, parameters: {} }),
				[r, n] = k([]),
				[l, i] = k([]),
				[u, d] = k([]),
				[c, f] = k([]),
				[m, h] = k([]),
				[g, p] = k([]),
				[x, v] = k([]),
				[C, b] = k([]),
				[L, I] = k({ items: [], total: 0 }),
				[T, A] = k(''),
				[R, B] = k(!1),
				[X, O] = k(''),
				[U, $] = k(null),
				[z, Q] = k([]),
				[j, oe] = k(!1),
				[M, q] = k('create'),
				[re, pe] = k(null),
				[ne, se] = k(Yi),
				[ue, ke] = k(null),
				[xe, H] = k(!1),
				[de, Ce] = k(null),
				ce = w(null)
			;(E(
				() =>
					Ht.subscribeContext((P) => {
						;(gh(P.theme), du({ density: 'compact' }), t(P))
						let G = mh(P)
						;(o(G), be(G))
					}),
				[]
			),
				E(
					() =>
						Ht.subscribeHostEvents((P) => {
							Eh(P)
						}),
					[a]
				),
				E(() => {
					Ht.reportResize()
				}, [L, U, j, de]))
			let fe = Z(ge(a, 'parameters'), 'projectId') ?? ''
			;(E(() => {
				let P = !0
				return !j || !fe || !ne.modelId
					? (d([]),
						() => {
							P = !1
						})
					: (Me('cube', { projectId: fe, modelId: ne.modelId }).then((G) => {
							P &&
								(d(G),
								!ne.cube &&
									G[0] &&
									se((le) => (le.modelId === ne.modelId ? { ...le, cube: G[0].value } : le)))
						}),
						() => {
							P = !1
						})
			}, [j, fe, ne.modelId]),
				E(() => {
					let P = !0
					return !j || !fe || !ne.modelId || !ne.cube
						? (f([]),
							() => {
								P = !1
							})
						: (Me('measure', { projectId: fe, modelId: ne.modelId, cube: ne.cube }).then((G) => {
								P &&
									(f(G),
									!ne.measure &&
										G[0] &&
										se((le) =>
											le.modelId === ne.modelId && le.cube === ne.cube
												? { ...le, measure: G[0].value }
												: le
										))
							}),
							() => {
								P = !1
							})
				}, [j, fe, ne.modelId, ne.cube]))
			async function be(P) {
				B(!0)
				try {
					let G = ge(P, 'parameters') ?? {},
						[le, st, Kn, Bh] = await Promise.all([
							Me('projectId', G),
							Me('status', G),
							Me('type', G),
							Me('certificationId', G)
						])
					;(n(le), p(st), v(Kn), b(Bh))
					let ru = Z(G, 'projectId') ?? le[0]?.value
					if (!ru) {
						I({ items: [], total: 0 })
						return
					}
					let $n = pr(P, 'projectId', ru)
					;(o($n), await ze($n), await Oe($n))
				} catch (G) {
					Ut(G)
				} finally {
					B(!1)
				}
			}
			async function Me(P, G, le) {
				let st = await Ht.requestParameterOptions(P, { parameters: G, search: le })
				return xh(Gn(st))
			}
			async function ze(P) {
				let G = ge(P, 'parameters') ?? {},
					[le, st] = await Promise.all([Me('modelId', G), Me('businessAreaId', G)])
				;(i(le), h(st))
			}
			async function Oe(P = a) {
				if (!Z(ge(P, 'parameters'), 'projectId')) {
					I({ items: [], total: 0 })
					return
				}
				B(!0)
				try {
					let le = await Ht.requestData(P)
					;(I(vh(hh(le))), Q([]))
				} catch (le) {
					Ut(le)
				} finally {
					B(!1)
				}
			}
			async function Co(P) {
				let G = pr(a, 'projectId', P)
				;((G = pr(G, 'modelId', '')),
					(G = pr(G, 'businessAreaId', '')),
					(G = { ...G, page: 1 }),
					o(G),
					i([]),
					h([]),
					await ze(G),
					await Oe(G))
			}
			async function ra(P, G) {
				let le = { ...pr(a, P, G === '__all__' ? '' : G), page: 1 }
				;(o(le), await Oe(le))
			}
			async function eu() {
				let P = { ...a, search: T.trim() || void 0, page: 1 }
				;(o(P), await Oe(P))
			}
			async function tu(P) {
				let G = { ...a, page: P }
				;(o(G), await Oe(G))
			}
			function au() {
				let P = ge(a, 'parameters') ?? {}
				;(q('create'),
					pe(null),
					d([]),
					f([]),
					se({ ...Yi(), modelId: Z(P, 'modelId') ?? '', businessAreaId: Z(P, 'businessAreaId') ?? '' }),
					oe(!0))
			}
			function yh(P) {
				;(q('edit'), pe(P), d([]), f([]), se(Ch(P)), oe(!0))
			}
			function Rh(P) {
				se((G) =>
					P.modelId !== G.modelId
						? { ...P, cube: '', measure: '' }
						: P.cube !== G.cube
							? { ...P, measure: '' }
							: P
				)
			}
			async function Ph() {
				if (!Z(ge(a, 'parameters'), 'projectId')) {
					$({
						error: !0,
						text: F(e?.locale, 'Choose a project first.', '\u8BF7\u5148\u9009\u62E9\u9879\u76EE\u3002')
					})
					return
				}
				O('editor')
				try {
					let G = await bo(M === 'create' ? 'create' : 'edit', {
						targetId: re?.id,
						input: bh(ne),
						parameters: ge(a, 'parameters')
					})
					;(oe(!1), Ba(G), await Oe(a))
				} catch (G) {
					Ut(G)
				} finally {
					O('')
				}
			}
			async function mr(P, G) {
				O(`${P}:${G.id}`)
				try {
					let le = await bo(P, { targetId: G.id, parameters: ge(a, 'parameters') })
					;(Ba(le), await Oe(a))
				} catch (le) {
					Ut(le)
				} finally {
					O('')
				}
			}
			async function kh() {
				if (!ue) return
				let P = ue
				;(ke(null), await mr('delete', P))
			}
			async function Th() {
				;(H(!1), O('bulk-delete'))
				try {
					let P = await bo('bulk_delete', { input: { ids: z }, parameters: ge(a, 'parameters') })
					;(Ba(P), await Oe(a))
				} catch (P) {
					Ut(P)
				} finally {
					O('')
				}
			}
			async function Ah() {
				O('export')
				try {
					let P = await bo('export', {
						input: { ids: z, page: a.page, pageSize: a.pageSize, search: a.search },
						parameters: ge(a, 'parameters')
					})
					Ba(P)
					let G = ge(P, 'data'),
						le = Z(G, 'content'),
						st = Z(G, 'fileName') ?? 'metrics.yaml',
						Kn = Z(G, 'mimeType') ?? 'application/x-yaml'
					le && bw(st, le, Kn)
				} catch (P) {
					Ut(P)
				} finally {
					O('')
				}
			}
			async function Mh(P) {
				O('import')
				try {
					let G = await Ht.executeFileAction('import', P, { parameters: ge(a, 'parameters') }),
						le = Gn(G)
					if (le.success !== !0)
						throw new Error(Wn(le.message, e?.locale ?? 'en-US', 'Metric import failed.'))
					;(Ba(le), await Oe(a))
				} catch (G) {
					Ut(G)
				} finally {
					;(O(''), ce.current && (ce.current.value = ''))
				}
			}
			async function Dh() {
				O('embed-project')
				try {
					let P = await bo('start_embedding_project', { parameters: ge(a, 'parameters') })
					;(Ba(P), await Oe(a))
				} catch (P) {
					Ut(P)
				} finally {
					O('')
				}
			}
			async function bo(P, G) {
				let le = await Ht.executeAction(P, G),
					st = Gn(le)
				if (st.success !== !0)
					throw new Error(
						Wn(
							st.message,
							e?.locale ?? 'en-US',
							F(e?.locale, 'Action failed.', '\u64CD\u4F5C\u5931\u8D25\u3002')
						)
					)
				return st
			}
			function Ba(P) {
				$({
					error: !1,
					text: Wn(
						P.message,
						e?.locale ?? 'en-US',
						F(e?.locale, 'Operation completed.', '\u64CD\u4F5C\u5DF2\u5B8C\u6210\u3002')
					)
				})
			}
			async function Eh(P) {
				P.type === 'assistant.tool.completed' && (await Oe(a))
			}
			function Ut(P) {
				let G = P instanceof Error ? P.message : String(P)
				;($({ error: !0, text: G }), Ht.logger.error('metric.operation.failed', { message: G }))
			}
			let gr = ge(a, 'parameters') ?? {},
				Xn = Z(gr, 'projectId') ?? '',
				Lo = typeof a.page == 'number' ? a.page : 1,
				Oh = typeof a.pageSize == 'number' ? a.pageSize : 20,
				ou = Math.max(1, Math.ceil(L.total / Oh)),
				Fh = L.items.length > 0 && L.items.every((P) => z.includes(P.id))
			return s(Jm, {
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
								D(or, {
									value: Xn,
									onValueChange: (P) => {
										Co(P)
									},
									children: [
										s(nr, {
											className: 'w-[240px]',
											children: s(rr, {
												placeholder: F(e?.locale, 'Choose project', '\u9009\u62E9\u9879\u76EE')
											})
										}),
										s(sr, {
											children: r.map((P) =>
												s(fo, { value: P.value, children: P.label }, P.value)
											)
										})
									]
								}),
								s(Ke, {
									onClick: au,
									disabled: !Xn,
									children: F(e?.locale, 'New metric', '\u65B0\u5EFA\u6307\u6807')
								}),
								s(Ke, {
									variant: 'outline',
									disabled: R,
									onClick: () => {
										Oe()
									},
									children: F(e?.locale, 'Refresh', '\u5237\u65B0')
								}),
								s('div', { className: 'flex-1' }),
								D(Ai, {
									children: [
										s(Mi, {
											asChild: !0,
											children: s(Ke, {
												variant: 'outline',
												children: F(e?.locale, 'Operations', '\u6279\u91CF\u64CD\u4F5C')
											})
										}),
										D(Di, {
											align: 'end',
											children: [
												s(Lt, {
													disabled: !z.length,
													onSelect: () => {
														Ah()
													},
													children: F(
														e?.locale,
														'Export selected',
														'\u5BFC\u51FA\u9009\u4E2D'
													)
												}),
												s(Lt, {
													onSelect: () => ce.current?.click(),
													children: F(e?.locale, 'Import YAML', '\u5BFC\u5165 YAML')
												}),
												s(Ei, {}),
												s(Lt, {
													onSelect: () => {
														Dh()
													},
													children: F(
														e?.locale,
														'Embed project',
														'\u9879\u76EE\u5168\u91CF\u5411\u91CF\u5316'
													)
												}),
												s(Lt, {
													disabled: !z.length,
													className: 'text-destructive',
													onSelect: () => H(!0),
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
									ref: ce,
									className: 'hidden',
									type: 'file',
									accept: '.yaml,.yml,text/yaml,application/yaml',
									onChange: (P) => {
										let G = P.currentTarget.files?.[0]
										G && Mh(G)
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
											value: T,
											placeholder: F(
												e?.locale,
												'Search code, name, or definition\u2026',
												'\u641C\u7D22\u7F16\u7801\u3001\u540D\u79F0\u6216\u53E3\u5F84\u2026'
											),
											onChange: (P) => A(P.currentTarget.value),
											onKeyDown: (P) => {
												P.key === 'Enter' && eu()
											}
										}),
										s(Ke, {
											variant: 'outline',
											onClick: () => {
												eu()
											},
											children: F(e?.locale, 'Search', '\u641C\u7D22')
										})
									]
								}),
								s(Qi, {
									value: Z(gr, 'modelId') ?? '__all__',
									placeholder: F(e?.locale, 'All models', '\u5168\u90E8\u6A21\u578B'),
									options: l,
									onChange: (P) => {
										ra('modelId', P)
									}
								}),
								s(Qi, {
									value: Z(gr, 'status') ?? '__all__',
									placeholder: F(e?.locale, 'All statuses', '\u5168\u90E8\u72B6\u6001'),
									options: g,
									onChange: (P) => {
										ra('status', P)
									}
								}),
								s(Qi, {
									value: Z(gr, 'type') ?? '__all__',
									placeholder: F(e?.locale, 'All types', '\u5168\u90E8\u7C7B\u578B'),
									options: x,
									onChange: (P) => {
										ra('type', P)
									}
								})
							]
						}),
						U
							? s('div', {
									className: U.error
										? 'border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive'
										: 'border-b bg-primary/5 px-4 py-2 text-sm',
									children: U.text
								})
							: null,
						s('div', {
							className: 'min-h-0 flex-1 overflow-hidden',
							children:
								R && !L.items.length
									? s('div', {
											className: 'space-y-2 p-4',
											children: Array.from({ length: 9 }, (P, G) =>
												s(ig, { className: 'h-10 w-full' }, G)
											)
										})
									: Xn
										? L.items.length
											? s(Um, {
													className: 'h-full',
													children: D(tg, {
														children: [
															s(ag, {
																className: 'sticky top-0 z-20 bg-card',
																children: D(Li, {
																	children: [
																		s(Ct, {
																			className: 'w-10',
																			children: s(mi, {
																				checked: Fh,
																				onCheckedChange: (P) =>
																					Q(
																						P === !0
																							? Array.from(
																									new Set([
																										...z,
																										...L.items.map(
																											(G) => G.id
																										)
																									])
																								)
																							: z.filter(
																									(G) =>
																										!L.items.some(
																											(le) =>
																												le.id ===
																												G
																										)
																								)
																					)
																			})
																		}),
																		s(Ct, {
																			children: F(
																				e?.locale,
																				'Metric',
																				'\u6307\u6807'
																			)
																		}),
																		s(Ct, {
																			children: F(
																				e?.locale,
																				'Type',
																				'\u7C7B\u578B'
																			)
																		}),
																		s(Ct, {
																			children: F(
																				e?.locale,
																				'Model / Cube',
																				'\u6A21\u578B / Cube'
																			)
																		}),
																		s(Ct, {
																			children: F(
																				e?.locale,
																				'Business area',
																				'\u4E1A\u52A1\u57DF'
																			)
																		}),
																		s(Ct, {
																			children: F(
																				e?.locale,
																				'Status',
																				'\u72B6\u6001'
																			)
																		}),
																		s(Ct, {
																			children: F(
																				e?.locale,
																				'Embedding',
																				'\u5411\u91CF\u72B6\u6001'
																			)
																		}),
																		s(Ct, {
																			children: F(
																				e?.locale,
																				'Updated',
																				'\u66F4\u65B0\u65F6\u95F4'
																			)
																		}),
																		s(Ct, { className: 'w-16' })
																	]
																})
															}),
															s(og, {
																children: L.items.map((P) =>
																	D(
																		Li,
																		{
																			className: 'cursor-pointer',
																			onDoubleClick: () => Ce(P),
																			children: [
																				s(bt, {
																					children: s(mi, {
																						checked: z.includes(P.id),
																						onCheckedChange: (G) =>
																							Q(
																								G === !0
																									? Array.from(
																											new Set([
																												...z,
																												P.id
																											])
																										)
																									: z.filter(
																											(le) =>
																												le !==
																												P.id
																										)
																							)
																					})
																				}),
																				s(bt, {
																					className: 'min-w-64',
																					children: D('button', {
																						className: 'block text-left',
																						type: 'button',
																						onClick: () => Ce(P),
																						children: [
																							s('div', {
																								className:
																									'font-medium',
																								children:
																									P.name || P.code
																							}),
																							s('div', {
																								className:
																									'font-mono text-xs text-muted-foreground',
																								children: P.code
																							})
																						]
																					})
																				}),
																				s(bt, {
																					children: s(En, {
																						variant: 'outline',
																						children: P.type
																					})
																				}),
																				D(bt, {
																					children: [
																						s('div', {
																							className:
																								'max-w-52 truncate text-sm',
																							children:
																								P.modelName ?? '\u2014'
																						}),
																						s('div', {
																							className:
																								'max-w-52 truncate text-xs text-muted-foreground',
																							children:
																								P.entity ?? '\u2014'
																						})
																					]
																				}),
																				s(bt, {
																					children:
																						P.businessAreaName ?? '\u2014'
																				}),
																				s(bt, {
																					children: s(vw, { value: P.status })
																				}),
																				s(bt, {
																					children: s(En, {
																						variant: 'secondary',
																						children:
																							P.embeddingStatus ??
																							'\u2014'
																					})
																				}),
																				s(bt, {
																					className:
																						'whitespace-nowrap text-xs text-muted-foreground',
																					children: Cw(P.updatedAt, e?.locale)
																				}),
																				s(bt, {
																					children: s(hw, {
																						row: P,
																						busy: X,
																						locale: e?.locale,
																						onEdit: () => yh(P),
																						onDuplicate: () => {
																							mr('duplicate', P)
																						},
																						onPublish: () => {
																							mr('publish', P)
																						},
																						onEmbed: () => {
																							mr('embedding', P)
																						},
																						onDelete: () => ke(P)
																					})
																				})
																			]
																		},
																		P.id
																	)
																)
															})
														]
													})
												})
											: s('div', {
													className: 'grid h-full place-items-center',
													children: s(Cm, {
														className: 'max-w-md',
														children: D(bm, {
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
																s(Ke, {
																	onClick: au,
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
										`${L.total} metric(s) \xB7 ${z.length} selected`,
										`\u5171 ${L.total} \u4E2A\u6307\u6807 \xB7 \u5DF2\u9009\u62E9 ${z.length} \u4E2A`
									)
								}),
								D('div', {
									className: 'flex items-center gap-2',
									children: [
										D('span', {
											className: 'text-xs text-muted-foreground',
											children: [Lo, ' / ', ou]
										}),
										s(Ke, {
											variant: 'outline',
											size: 'sm',
											disabled: Lo <= 1 || R,
											onClick: () => {
												tu(Lo - 1)
											},
											children: F(e?.locale, 'Previous', '\u4E0A\u4E00\u9875')
										}),
										s(Ke, {
											variant: 'outline',
											size: 'sm',
											disabled: Lo >= ou || R,
											onClick: () => {
												tu(Lo + 1)
											},
											children: F(e?.locale, 'Next', '\u4E0B\u4E00\u9875')
										})
									]
								})
							]
						}),
						s(Ih, {
							open: j,
							mode: M,
							form: ne,
							models: l,
							cubes: u,
							measures: c,
							businessAreas: m,
							certifications: C,
							busy: X === 'editor',
							locale: e?.locale,
							onOpenChange: oe,
							onChange: Rh,
							onSubmit: () => {
								Ph()
							}
						}),
						s(xw, { row: de, locale: e?.locale, onOpenChange: (P) => !P && Ce(null) }),
						s(Ii, {
							open: !!ue,
							onOpenChange: (P) => !P && ke(null),
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
													`This permanently deletes '${ue?.name ?? ue?.code ?? ''}'.`,
													`\u8FD9\u4F1A\u6C38\u4E45\u5220\u9664\u201C${ue?.name ?? ue?.code ?? ''}\u201D\u3002`
												)
											})
										]
									}),
									D(yi, {
										children: [
											s(Ti, { children: F(e?.locale, 'Cancel', '\u53D6\u6D88') }),
											s(ki, {
												onClick: () => {
													kh()
												},
												children: F(e?.locale, 'Delete', '\u5220\u9664')
											})
										]
									})
								]
							})
						}),
						s(Ii, {
							open: xe,
							onOpenChange: H,
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
													`This permanently deletes ${z.length} metric(s).`,
													`\u8FD9\u4F1A\u6C38\u4E45\u5220\u9664 ${z.length} \u4E2A\u6307\u6807\u3002`
												)
											})
										]
									}),
									D(yi, {
										children: [
											s(Ti, { children: F(e?.locale, 'Cancel', '\u53D6\u6D88') }),
											s(ki, {
												onClick: () => {
													Th()
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
			return D(or, {
				value: e.value,
				onValueChange: e.onChange,
				children: [
					s(nr, { className: 'w-[180px]', children: s(rr, { placeholder: e.placeholder }) }),
					D(sr, {
						children: [
							s(fo, { value: '__all__', children: e.placeholder }),
							e.options.map((t) => s(fo, { value: t.value, children: t.label }, t.value))
						]
					})
				]
			})
		}
		function hw(e) {
			let t = e.busy.endsWith(`:${e.row.id}`)
			return D(Ai, {
				children: [
					D(Ym, {
						children: [
							s(Zm, {
								asChild: !0,
								children: s(Mi, {
									asChild: !0,
									children: s(Ke, {
										variant: 'ghost',
										size: 'sm',
										disabled: t,
										children: '\u2022\u2022\u2022'
									})
								})
							}),
							s(Qm, { children: F(e.locale, 'Metric actions', '\u6307\u6807\u64CD\u4F5C') })
						]
					}),
					D(Di, {
						align: 'end',
						children: [
							s(Lt, { onSelect: e.onEdit, children: F(e.locale, 'Edit', '\u7F16\u8F91') }),
							s(Lt, { onSelect: e.onDuplicate, children: F(e.locale, 'Duplicate', '\u590D\u5236') }),
							s(Lt, { onSelect: e.onPublish, children: F(e.locale, 'Publish', '\u53D1\u5E03') }),
							s(Lt, { onSelect: e.onEmbed, children: F(e.locale, 'Embed', '\u5411\u91CF\u5316') }),
							s(Ei, {}),
							s(Lt, {
								className: 'text-destructive',
								onSelect: e.onDelete,
								children: F(e.locale, 'Delete', '\u5220\u9664')
							})
						]
					})
				]
			})
		}
		function xw(e) {
			let t = e.row
			return s(dg, {
				open: !!t,
				onOpenChange: e.onOpenChange,
				children: D(cg, {
					className: 'w-full overflow-y-auto sm:max-w-xl',
					children: [
						D(fg, {
							children: [
								s(pg, {
									children: t?.name ?? F(e.locale, 'Metric details', '\u6307\u6807\u8BE6\u60C5')
								}),
								s(mg, { className: 'font-mono', children: t?.code })
							]
						}),
						t
							? D('div', {
									className: 'grid gap-4 p-4',
									children: [
										s(yt, {
											label: F(e.locale, 'Type / status', '\u7C7B\u578B / \u72B6\u6001'),
											value: `${t.type} \xB7 ${t.status}`
										}),
										s(yt, {
											label: F(e.locale, 'Semantic model', '\u8BED\u4E49\u6A21\u578B'),
											value: t.modelName
										}),
										s(yt, { label: F(e.locale, 'Cube', 'Cube'), value: t.entity }),
										s(yt, {
											label: F(e.locale, 'Business area', '\u4E1A\u52A1\u57DF'),
											value: t.businessAreaName
										}),
										s(yt, {
											label: F(e.locale, 'Business definition', '\u4E1A\u52A1\u53E3\u5F84'),
											value: t.business
										}),
										s(yt, {
											label: F(e.locale, 'Principal', '\u8D1F\u8D23\u4EBA'),
											value: t.principal
										}),
										s(yt, {
											label: F(e.locale, 'Certification', '\u8BA4\u8BC1'),
											value: t.certificationName
										}),
										s(yt, {
											label: F(e.locale, 'Validity', '\u6709\u6548\u671F'),
											value: t.validity
										}),
										s(yt, {
											label: F(e.locale, 'Embedding status', '\u5411\u91CF\u72B6\u6001'),
											value: t.embeddingStatus
										}),
										t.error
											? s(yt, { label: F(e.locale, 'Error', '\u9519\u8BEF'), value: t.error })
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
		function yt(e) {
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
		function vw(e) {
			return s(En, {
				variant: e.value === 'RELEASED' ? 'default' : e.value === 'ARCHIVED' ? 'secondary' : 'outline',
				children: e.value
			})
		}
		function pr(e, t, a) {
			let o = { ...(ge(e, 'parameters') ?? {}) }
			return (a ? (o[t] = a) : delete o[t], { ...e, parameters: o })
		}
		function Cw(e, t) {
			if (!e) return '\u2014'
			let a = new Date(e)
			return Number.isNaN(a.getTime())
				? e
				: new Intl.DateTimeFormat(t ?? 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(a)
		}
		function bw(e, t, a) {
			let o = URL.createObjectURL(new Blob([t], { type: a })),
				r = document.createElement('a')
			;((r.href = o), (r.download = e), r.click(), URL.revokeObjectURL(o))
		}
		var wh = document.getElementById('root')
		if (!wh) throw new Error('Remote component root was not found.')
		iu(wh).render(s(gw, {}))
		Ht.ready()
	})
	Lw()
})()
