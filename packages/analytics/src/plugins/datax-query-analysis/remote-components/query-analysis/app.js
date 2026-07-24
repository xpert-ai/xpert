;(() => {
	var cp = Object.defineProperty
	var tl = (e) => {
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
	var fp = (e, t) => () => {
			try {
				return (t || e((t = { exports: {} }).exports, t), t.exports)
			} catch (a) {
				throw ((t = 0), a)
			}
		},
		Lt = (e, t) => {
			for (var a in t) cp(e, a, { get: t[a], enumerable: !0 })
		}
	var al = (e, t, a) => t.has(e) || tl('Cannot ' + a)
	var na = (e, t, a) => (al(e, t, 'read from private field'), a ? a.call(e) : t.get(e)),
		Mr = (e, t, a) =>
			t.has(e)
				? tl('Cannot add the same private member more than once')
				: t instanceof WeakSet
					? t.add(e)
					: t.set(e, a),
		Er = (e, t, a, o) => (al(e, t, 'write to private field'), o ? o.call(e, a) : t.set(e, a), a)
	var Y = {}
	Lt(Y, {
		Children: () => Ke,
		Component: () => pp,
		Fragment: () => $e,
		Profiler: () => mp,
		PureComponent: () => hp,
		StrictMode: () => gp,
		Suspense: () => xp,
		cloneElement: () => st,
		createContext: () => we,
		createElement: () => ge,
		createRef: () => vp,
		default: () => Ot,
		forwardRef: () => R,
		isValidElement: () => sa,
		lazy: () => Lp,
		memo: () => Ea,
		startTransition: () => Cp,
		useCallback: () => q,
		useContext: () => Re,
		useDebugValue: () => bp,
		useDeferredValue: () => Ip,
		useEffect: () => B,
		useId: () => Or,
		useImperativeHandle: () => lo,
		useInsertionEffect: () => Sp,
		useLayoutEffect: () => lt,
		useMemo: () => de,
		useReducer: () => la,
		useRef: () => D,
		useState: () => M,
		useSyncExternalStore: () => Br,
		useTransition: () => wp,
		version: () => yp
	})
	var ae,
		Ot,
		Ke,
		pp,
		$e,
		mp,
		hp,
		gp,
		xp,
		st,
		we,
		ge,
		vp,
		R,
		sa,
		Lp,
		Ea,
		Cp,
		q,
		Re,
		bp,
		Ip,
		B,
		Or,
		lo,
		Sp,
		lt,
		de,
		la,
		D,
		M,
		Br,
		wp,
		yp,
		K = y(() => {
			;((ae = globalThis.React),
				(Ot = ae),
				(Ke = ae.Children),
				(pp = ae.Component),
				($e = ae.Fragment),
				(mp = ae.Profiler),
				(hp = ae.PureComponent),
				(gp = ae.StrictMode),
				(xp = ae.Suspense),
				(st = ae.cloneElement),
				(we = ae.createContext),
				(ge = ae.createElement),
				(vp = ae.createRef),
				(R = ae.forwardRef),
				(sa = ae.isValidElement),
				(Lp = ae.lazy),
				(Ea = ae.memo),
				(Cp = ae.startTransition),
				(q = ae.useCallback),
				(Re = ae.useContext),
				(bp = ae.useDebugValue),
				(Ip = ae.useDeferredValue),
				(B = ae.useEffect),
				(Or = ae.useId),
				(lo = ae.useImperativeHandle),
				(Sp = ae.useInsertionEffect),
				(lt = ae.useLayoutEffect),
				(de = ae.useMemo),
				(la = ae.useReducer),
				(D = ae.useRef),
				(M = ae.useState),
				(Br = ae.useSyncExternalStore),
				(wp = ae.useTransition),
				(yp = ae.version))
		})
	var ol,
		rl,
		PL,
		nl = y(() => {
			;((ol = globalThis.ReactDOM), (rl = ol.createRoot), (PL = ol.hydrateRoot))
		})
	function sl(e = {}) {
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
	var ll = y(() => {})
	function il(e) {
		var t,
			a,
			o = ''
		if (typeof e == 'string' || typeof e == 'number') o += e
		else if (typeof e == 'object')
			if (Array.isArray(e)) {
				var r = e.length
				for (t = 0; t < r; t++) e[t] && (a = il(e[t])) && (o && (o += ' '), (o += a))
			} else for (a in e) e[a] && (o && (o += ' '), (o += a))
		return o
	}
	function io() {
		for (var e, t, a = 0, o = '', r = arguments.length; a < r; a++)
			(e = arguments[a]) && (t = il(e)) && (o && (o += ' '), (o += t))
		return o
	}
	var Fr = y(() => {})
	var Rp,
		Pp,
		ml,
		ul,
		kp,
		Tp,
		hl,
		Ap,
		Dp,
		Mp,
		zr,
		Ep,
		Op,
		Bp,
		Fp,
		gl,
		Np,
		zp,
		_p,
		dl,
		Hp,
		qp,
		Up,
		Vp,
		Gp,
		Wp,
		xl,
		jp,
		Xp,
		Le,
		vl,
		Ll,
		Kp,
		$p,
		Jp,
		Yp,
		Zp,
		Qp,
		ia,
		ee,
		Ct,
		Nr,
		it,
		Cl,
		em,
		_r,
		tm,
		am,
		om,
		rm,
		V,
		Bt,
		cl,
		nm,
		sm,
		fl,
		lm,
		uo,
		G,
		Oa,
		im,
		pl,
		um,
		dm,
		co,
		cm,
		bt,
		Ft,
		bl,
		Il,
		Sl,
		wl,
		fm,
		yl,
		Rl,
		Pl,
		pm,
		kl,
		Tl = y(() => {
			;((Rp = (e, t) => {
				let a = new Array(e.length + t.length)
				for (let o = 0; o < e.length; o++) a[o] = e[o]
				for (let o = 0; o < t.length; o++) a[e.length + o] = t[o]
				return a
			}),
				(Pp = (e, t) => ({ classGroupId: e, validator: t })),
				(ml = (e = new Map(), t = null, a) => ({ nextPart: e, validators: t, classGroupId: a })),
				(ul = []),
				(kp = 'arbitrary..'),
				(Tp = (e) => {
					let t = Dp(e),
						{ conflictingClassGroups: a, conflictingClassGroupModifiers: o } = e
					return {
						getClassGroupId: (s) => {
							if (s.startsWith('[') && s.endsWith(']')) return Ap(s)
							let l = s.split('-'),
								i = l[0] === '' && l.length > 1 ? 1 : 0
							return hl(l, i, t)
						},
						getConflictingClassGroupIds: (s, l) => {
							if (l) {
								let i = o[s],
									d = a[s]
								return i ? (d ? Rp(d, i) : i) : d || ul
							}
							return a[s] || ul
						}
					}
				}),
				(hl = (e, t, a) => {
					if (e.length - t === 0) return a.classGroupId
					let r = e[t],
						n = a.nextPart.get(r)
					if (n) {
						let d = hl(e, t + 1, n)
						if (d) return d
					}
					let s = a.validators
					if (s === null) return
					let l = t === 0 ? e.join('-') : e.slice(t).join('-'),
						i = s.length
					for (let d = 0; d < i; d++) {
						let u = s[d]
						if (u.validator(l)) return u.classGroupId
					}
				}),
				(Ap = (e) =>
					e.slice(1, -1).indexOf(':') === -1
						? void 0
						: (() => {
								let t = e.slice(1, -1),
									a = t.indexOf(':'),
									o = t.slice(0, a)
								return o ? kp + o : void 0
							})()),
				(Dp = (e) => {
					let { theme: t, classGroups: a } = e
					return Mp(a, t)
				}),
				(Mp = (e, t) => {
					let a = ml()
					for (let o in e) {
						let r = e[o]
						zr(r, a, o, t)
					}
					return a
				}),
				(zr = (e, t, a, o) => {
					let r = e.length
					for (let n = 0; n < r; n++) {
						let s = e[n]
						Ep(s, t, a, o)
					}
				}),
				(Ep = (e, t, a, o) => {
					if (typeof e == 'string') {
						Op(e, t, a)
						return
					}
					if (typeof e == 'function') {
						Bp(e, t, a, o)
						return
					}
					Fp(e, t, a, o)
				}),
				(Op = (e, t, a) => {
					let o = e === '' ? t : gl(t, e)
					o.classGroupId = a
				}),
				(Bp = (e, t, a, o) => {
					if (Np(e)) {
						zr(e(o), t, a, o)
						return
					}
					;(t.validators === null && (t.validators = []), t.validators.push(Pp(a, e)))
				}),
				(Fp = (e, t, a, o) => {
					let r = Object.entries(e),
						n = r.length
					for (let s = 0; s < n; s++) {
						let [l, i] = r[s]
						zr(i, gl(t, l), a, o)
					}
				}),
				(gl = (e, t) => {
					let a = e,
						o = t.split('-'),
						r = o.length
					for (let n = 0; n < r; n++) {
						let s = o[n],
							l = a.nextPart.get(s)
						;(l || ((l = ml()), a.nextPart.set(s, l)), (a = l))
					}
					return a
				}),
				(Np = (e) => 'isThemeGetter' in e && e.isThemeGetter === !0),
				(zp = (e) => {
					if (e < 1) return { get: () => {}, set: () => {} }
					let t = 0,
						a = Object.create(null),
						o = Object.create(null),
						r = (n, s) => {
							;((a[n] = s), t++, t > e && ((t = 0), (o = a), (a = Object.create(null))))
						}
					return {
						get(n) {
							let s = a[n]
							if (s !== void 0) return s
							if ((s = o[n]) !== void 0) return (r(n, s), s)
						},
						set(n, s) {
							n in a ? (a[n] = s) : r(n, s)
						}
					}
				}),
				(_p = []),
				(dl = (e, t, a, o, r) => ({
					modifiers: e,
					hasImportantModifier: t,
					baseClassName: a,
					maybePostfixModifierPosition: o,
					isExternal: r
				})),
				(Hp = (e) => {
					let { prefix: t, experimentalParseClassName: a } = e,
						o = (r) => {
							let n = [],
								s = 0,
								l = 0,
								i = 0,
								d,
								u = r.length
							for (let p = 0; p < u; p++) {
								let x = r[p]
								if (s === 0 && l === 0) {
									if (x === ':') {
										;(n.push(r.slice(i, p)), (i = p + 1))
										continue
									}
									if (x === '/') {
										d = p
										continue
									}
								}
								x === '[' ? s++ : x === ']' ? s-- : x === '(' ? l++ : x === ')' && l--
							}
							let f = n.length === 0 ? r : r.slice(i),
								m = f,
								g = !1
							f.endsWith('!')
								? ((m = f.slice(0, -1)), (g = !0))
								: f.startsWith('!') && ((m = f.slice(1)), (g = !0))
							let h = d && d > i ? d - i : void 0
							return dl(n, g, m, h)
						}
					if (t) {
						let r = t + ':',
							n = o
						o = (s) => (s.startsWith(r) ? n(s.slice(r.length)) : dl(_p, !1, s, void 0, !0))
					}
					if (a) {
						let r = o
						o = (n) => a({ className: n, parseClassName: r })
					}
					return o
				}),
				(qp = (e) => {
					let t = new Map()
					return (
						e.orderSensitiveModifiers.forEach((a, o) => {
							t.set(a, 1e6 + o)
						}),
						(a) => {
							let o = [],
								r = []
							for (let n = 0; n < a.length; n++) {
								let s = a[n],
									l = s[0] === '[',
									i = t.has(s)
								l || i ? (r.length > 0 && (r.sort(), o.push(...r), (r = [])), o.push(s)) : r.push(s)
							}
							return (r.length > 0 && (r.sort(), o.push(...r)), o)
						}
					)
				}),
				(Up = (e) => ({ cache: zp(e.cacheSize), parseClassName: Hp(e), sortModifiers: qp(e), ...Tp(e) })),
				(Vp = /\s+/),
				(Gp = (e, t) => {
					let { parseClassName: a, getClassGroupId: o, getConflictingClassGroupIds: r, sortModifiers: n } = t,
						s = [],
						l = e.trim().split(Vp),
						i = ''
					for (let d = l.length - 1; d >= 0; d -= 1) {
						let u = l[d],
							{
								isExternal: f,
								modifiers: m,
								hasImportantModifier: g,
								baseClassName: h,
								maybePostfixModifierPosition: p
							} = a(u)
						if (f) {
							i = u + (i.length > 0 ? ' ' + i : i)
							continue
						}
						let x = !!p,
							v = o(x ? h.substring(0, p) : h)
						if (!v) {
							if (!x) {
								i = u + (i.length > 0 ? ' ' + i : i)
								continue
							}
							if (((v = o(h)), !v)) {
								i = u + (i.length > 0 ? ' ' + i : i)
								continue
							}
							x = !1
						}
						let L = m.length === 0 ? '' : m.length === 1 ? m[0] : n(m).join(':'),
							C = g ? L + '!' : L,
							b = C + v
						if (s.indexOf(b) > -1) continue
						s.push(b)
						let I = r(v, x)
						for (let P = 0; P < I.length; ++P) {
							let k = I[P]
							s.push(C + k)
						}
						i = u + (i.length > 0 ? ' ' + i : i)
					}
					return i
				}),
				(Wp = (...e) => {
					let t = 0,
						a,
						o,
						r = ''
					for (; t < e.length; ) (a = e[t++]) && (o = xl(a)) && (r && (r += ' '), (r += o))
					return r
				}),
				(xl = (e) => {
					if (typeof e == 'string') return e
					let t,
						a = ''
					for (let o = 0; o < e.length; o++) e[o] && (t = xl(e[o])) && (a && (a += ' '), (a += t))
					return a
				}),
				(jp = (e, ...t) => {
					let a,
						o,
						r,
						n,
						s = (i) => {
							let d = t.reduce((u, f) => f(u), e())
							return ((a = Up(d)), (o = a.cache.get), (r = a.cache.set), (n = l), l(i))
						},
						l = (i) => {
							let d = o(i)
							if (d) return d
							let u = Gp(i, a)
							return (r(i, u), u)
						}
					return ((n = s), (...i) => n(Wp(...i)))
				}),
				(Xp = []),
				(Le = (e) => {
					let t = (a) => a[e] || Xp
					return ((t.isThemeGetter = !0), t)
				}),
				(vl = /^\[(?:(\w[\w-]*):)?(.+)\]$/i),
				(Ll = /^\((?:(\w[\w-]*):)?(.+)\)$/i),
				(Kp = /^\d+\/\d+$/),
				($p = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/),
				(Jp =
					/\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/),
				(Yp = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/),
				(Zp = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/),
				(Qp = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/),
				(ia = (e) => Kp.test(e)),
				(ee = (e) => !!e && !Number.isNaN(Number(e))),
				(Ct = (e) => !!e && Number.isInteger(Number(e))),
				(Nr = (e) => e.endsWith('%') && ee(e.slice(0, -1))),
				(it = (e) => $p.test(e)),
				(Cl = () => !0),
				(em = (e) => Jp.test(e) && !Yp.test(e)),
				(_r = () => !1),
				(tm = (e) => Zp.test(e)),
				(am = (e) => Qp.test(e)),
				(om = (e) => !V(e) && !G(e)),
				(rm = (e) => bt(e, Sl, _r)),
				(V = (e) => vl.test(e)),
				(Bt = (e) => bt(e, wl, em)),
				(cl = (e) => bt(e, fm, ee)),
				(nm = (e) => bt(e, Rl, Cl)),
				(sm = (e) => bt(e, yl, _r)),
				(fl = (e) => bt(e, bl, _r)),
				(lm = (e) => bt(e, Il, am)),
				(uo = (e) => bt(e, Pl, tm)),
				(G = (e) => Ll.test(e)),
				(Oa = (e) => Ft(e, wl)),
				(im = (e) => Ft(e, yl)),
				(pl = (e) => Ft(e, bl)),
				(um = (e) => Ft(e, Sl)),
				(dm = (e) => Ft(e, Il)),
				(co = (e) => Ft(e, Pl, !0)),
				(cm = (e) => Ft(e, Rl, !0)),
				(bt = (e, t, a) => {
					let o = vl.exec(e)
					return o ? (o[1] ? t(o[1]) : a(o[2])) : !1
				}),
				(Ft = (e, t, a = !1) => {
					let o = Ll.exec(e)
					return o ? (o[1] ? t(o[1]) : a) : !1
				}),
				(bl = (e) => e === 'position' || e === 'percentage'),
				(Il = (e) => e === 'image' || e === 'url'),
				(Sl = (e) => e === 'length' || e === 'size' || e === 'bg-size'),
				(wl = (e) => e === 'length'),
				(fm = (e) => e === 'number'),
				(yl = (e) => e === 'family-name'),
				(Rl = (e) => e === 'number' || e === 'weight'),
				(Pl = (e) => e === 'shadow'),
				(pm = () => {
					let e = Le('color'),
						t = Le('font'),
						a = Le('text'),
						o = Le('font-weight'),
						r = Le('tracking'),
						n = Le('leading'),
						s = Le('breakpoint'),
						l = Le('container'),
						i = Le('spacing'),
						d = Le('radius'),
						u = Le('shadow'),
						f = Le('inset-shadow'),
						m = Le('text-shadow'),
						g = Le('drop-shadow'),
						h = Le('blur'),
						p = Le('perspective'),
						x = Le('aspect'),
						v = Le('ease'),
						L = Le('animate'),
						C = () => ['auto', 'avoid', 'all', 'avoid-page', 'page', 'left', 'right', 'column'],
						b = () => [
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
						I = () => [...b(), G, V],
						P = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'],
						k = () => ['auto', 'contain', 'none'],
						w = () => [G, V, i],
						E = () => [ia, 'full', 'auto', ...w()],
						U = () => [Ct, 'none', 'subgrid', G, V],
						S = () => ['auto', { span: ['full', Ct, G, V] }, Ct, G, V],
						T = () => [Ct, 'auto', G, V],
						F = () => ['auto', 'min', 'max', 'fr', G, V],
						N = () => [
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
						H = () => ['start', 'end', 'center', 'stretch', 'center-safe', 'end-safe'],
						z = () => ['auto', ...w()],
						$ = () => [
							ia,
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
							...w()
						],
						A = () => [e, G, V],
						Q = () => [...b(), pl, fl, { position: [G, V] }],
						oe = () => ['no-repeat', { repeat: ['', 'x', 'y', 'space', 'round'] }],
						me = () => ['auto', 'cover', 'contain', um, rm, { size: [G, V] }],
						Ie = () => [Nr, Oa, Bt],
						le = () => ['', 'none', 'full', d, G, V],
						pe = () => ['', ee, Oa, Bt],
						Ee = () => ['solid', 'dashed', 'dotted', 'double'],
						ve = () => [
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
						_ = () => [ee, Nr, pl, fl],
						ne = () => ['', 'none', h, G, V],
						he = () => ['none', ee, G, V],
						se = () => ['none', ee, G, V],
						ie = () => [ee, G, V],
						fe = () => [ia, 'full', ...w()]
					return {
						cacheSize: 500,
						theme: {
							animate: ['spin', 'ping', 'pulse', 'bounce'],
							aspect: ['video'],
							blur: [it],
							breakpoint: [it],
							color: [Cl],
							container: [it],
							'drop-shadow': [it],
							ease: ['in', 'out', 'in-out'],
							font: [om],
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
							'inset-shadow': [it],
							leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
							perspective: ['dramatic', 'near', 'normal', 'midrange', 'distant', 'none'],
							radius: [it],
							shadow: [it],
							spacing: ['px', ee],
							text: [it],
							'text-shadow': [it],
							tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']
						},
						classGroups: {
							aspect: [{ aspect: ['auto', 'square', ia, V, G, x] }],
							container: ['container'],
							columns: [{ columns: [ee, V, G, l] }],
							'break-after': [{ 'break-after': C() }],
							'break-before': [{ 'break-before': C() }],
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
							overflow: [{ overflow: P() }],
							'overflow-x': [{ 'overflow-x': P() }],
							'overflow-y': [{ 'overflow-y': P() }],
							overscroll: [{ overscroll: k() }],
							'overscroll-x': [{ 'overscroll-x': k() }],
							'overscroll-y': [{ 'overscroll-y': k() }],
							position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
							inset: [{ inset: E() }],
							'inset-x': [{ 'inset-x': E() }],
							'inset-y': [{ 'inset-y': E() }],
							start: [{ start: E() }],
							end: [{ end: E() }],
							top: [{ top: E() }],
							right: [{ right: E() }],
							bottom: [{ bottom: E() }],
							left: [{ left: E() }],
							visibility: ['visible', 'invisible', 'collapse'],
							z: [{ z: [Ct, 'auto', G, V] }],
							basis: [{ basis: [ia, 'full', 'auto', l, ...w()] }],
							'flex-direction': [{ flex: ['row', 'row-reverse', 'col', 'col-reverse'] }],
							'flex-wrap': [{ flex: ['nowrap', 'wrap', 'wrap-reverse'] }],
							flex: [{ flex: [ee, ia, 'auto', 'initial', 'none', V] }],
							grow: [{ grow: ['', ee, G, V] }],
							shrink: [{ shrink: ['', ee, G, V] }],
							order: [{ order: [Ct, 'first', 'last', 'none', G, V] }],
							'grid-cols': [{ 'grid-cols': U() }],
							'col-start-end': [{ col: S() }],
							'col-start': [{ 'col-start': T() }],
							'col-end': [{ 'col-end': T() }],
							'grid-rows': [{ 'grid-rows': U() }],
							'row-start-end': [{ row: S() }],
							'row-start': [{ 'row-start': T() }],
							'row-end': [{ 'row-end': T() }],
							'grid-flow': [{ 'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense'] }],
							'auto-cols': [{ 'auto-cols': F() }],
							'auto-rows': [{ 'auto-rows': F() }],
							gap: [{ gap: w() }],
							'gap-x': [{ 'gap-x': w() }],
							'gap-y': [{ 'gap-y': w() }],
							'justify-content': [{ justify: [...N(), 'normal'] }],
							'justify-items': [{ 'justify-items': [...H(), 'normal'] }],
							'justify-self': [{ 'justify-self': ['auto', ...H()] }],
							'align-content': [{ content: ['normal', ...N()] }],
							'align-items': [{ items: [...H(), { baseline: ['', 'last'] }] }],
							'align-self': [{ self: ['auto', ...H(), { baseline: ['', 'last'] }] }],
							'place-content': [{ 'place-content': N() }],
							'place-items': [{ 'place-items': [...H(), 'baseline'] }],
							'place-self': [{ 'place-self': ['auto', ...H()] }],
							p: [{ p: w() }],
							px: [{ px: w() }],
							py: [{ py: w() }],
							ps: [{ ps: w() }],
							pe: [{ pe: w() }],
							pt: [{ pt: w() }],
							pr: [{ pr: w() }],
							pb: [{ pb: w() }],
							pl: [{ pl: w() }],
							m: [{ m: z() }],
							mx: [{ mx: z() }],
							my: [{ my: z() }],
							ms: [{ ms: z() }],
							me: [{ me: z() }],
							mt: [{ mt: z() }],
							mr: [{ mr: z() }],
							mb: [{ mb: z() }],
							ml: [{ ml: z() }],
							'space-x': [{ 'space-x': w() }],
							'space-x-reverse': ['space-x-reverse'],
							'space-y': [{ 'space-y': w() }],
							'space-y-reverse': ['space-y-reverse'],
							size: [{ size: $() }],
							w: [{ w: [l, 'screen', ...$()] }],
							'min-w': [{ 'min-w': [l, 'screen', 'none', ...$()] }],
							'max-w': [{ 'max-w': [l, 'screen', 'none', 'prose', { screen: [s] }, ...$()] }],
							h: [{ h: ['screen', 'lh', ...$()] }],
							'min-h': [{ 'min-h': ['screen', 'lh', 'none', ...$()] }],
							'max-h': [{ 'max-h': ['screen', 'lh', ...$()] }],
							'font-size': [{ text: ['base', a, Oa, Bt] }],
							'font-smoothing': ['antialiased', 'subpixel-antialiased'],
							'font-style': ['italic', 'not-italic'],
							'font-weight': [{ font: [o, cm, nm] }],
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
										Nr,
										V
									]
								}
							],
							'font-family': [{ font: [im, sm, t] }],
							'fvn-normal': ['normal-nums'],
							'fvn-ordinal': ['ordinal'],
							'fvn-slashed-zero': ['slashed-zero'],
							'fvn-figure': ['lining-nums', 'oldstyle-nums'],
							'fvn-spacing': ['proportional-nums', 'tabular-nums'],
							'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
							tracking: [{ tracking: [r, G, V] }],
							'line-clamp': [{ 'line-clamp': [ee, 'none', G, cl] }],
							leading: [{ leading: [n, ...w()] }],
							'list-image': [{ 'list-image': ['none', G, V] }],
							'list-style-position': [{ list: ['inside', 'outside'] }],
							'list-style-type': [{ list: ['disc', 'decimal', 'none', G, V] }],
							'text-alignment': [{ text: ['left', 'center', 'right', 'justify', 'start', 'end'] }],
							'placeholder-color': [{ placeholder: A() }],
							'text-color': [{ text: A() }],
							'text-decoration': ['underline', 'overline', 'line-through', 'no-underline'],
							'text-decoration-style': [{ decoration: [...Ee(), 'wavy'] }],
							'text-decoration-thickness': [{ decoration: [ee, 'from-font', 'auto', G, Bt] }],
							'text-decoration-color': [{ decoration: A() }],
							'underline-offset': [{ 'underline-offset': [ee, 'auto', G, V] }],
							'text-transform': ['uppercase', 'lowercase', 'capitalize', 'normal-case'],
							'text-overflow': ['truncate', 'text-ellipsis', 'text-clip'],
							'text-wrap': [{ text: ['wrap', 'nowrap', 'balance', 'pretty'] }],
							indent: [{ indent: w() }],
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
										G,
										V
									]
								}
							],
							whitespace: [
								{ whitespace: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'] }
							],
							break: [{ break: ['normal', 'words', 'all', 'keep'] }],
							wrap: [{ wrap: ['break-word', 'anywhere', 'normal'] }],
							hyphens: [{ hyphens: ['none', 'manual', 'auto'] }],
							content: [{ content: ['none', G, V] }],
							'bg-attachment': [{ bg: ['fixed', 'local', 'scroll'] }],
							'bg-clip': [{ 'bg-clip': ['border', 'padding', 'content', 'text'] }],
							'bg-origin': [{ 'bg-origin': ['border', 'padding', 'content'] }],
							'bg-position': [{ bg: Q() }],
							'bg-repeat': [{ bg: oe() }],
							'bg-size': [{ bg: me() }],
							'bg-image': [
								{
									bg: [
										'none',
										{
											linear: [{ to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] }, Ct, G, V],
											radial: ['', G, V],
											conic: [Ct, G, V]
										},
										dm,
										lm
									]
								}
							],
							'bg-color': [{ bg: A() }],
							'gradient-from-pos': [{ from: Ie() }],
							'gradient-via-pos': [{ via: Ie() }],
							'gradient-to-pos': [{ to: Ie() }],
							'gradient-from': [{ from: A() }],
							'gradient-via': [{ via: A() }],
							'gradient-to': [{ to: A() }],
							rounded: [{ rounded: le() }],
							'rounded-s': [{ 'rounded-s': le() }],
							'rounded-e': [{ 'rounded-e': le() }],
							'rounded-t': [{ 'rounded-t': le() }],
							'rounded-r': [{ 'rounded-r': le() }],
							'rounded-b': [{ 'rounded-b': le() }],
							'rounded-l': [{ 'rounded-l': le() }],
							'rounded-ss': [{ 'rounded-ss': le() }],
							'rounded-se': [{ 'rounded-se': le() }],
							'rounded-ee': [{ 'rounded-ee': le() }],
							'rounded-es': [{ 'rounded-es': le() }],
							'rounded-tl': [{ 'rounded-tl': le() }],
							'rounded-tr': [{ 'rounded-tr': le() }],
							'rounded-br': [{ 'rounded-br': le() }],
							'rounded-bl': [{ 'rounded-bl': le() }],
							'border-w': [{ border: pe() }],
							'border-w-x': [{ 'border-x': pe() }],
							'border-w-y': [{ 'border-y': pe() }],
							'border-w-s': [{ 'border-s': pe() }],
							'border-w-e': [{ 'border-e': pe() }],
							'border-w-t': [{ 'border-t': pe() }],
							'border-w-r': [{ 'border-r': pe() }],
							'border-w-b': [{ 'border-b': pe() }],
							'border-w-l': [{ 'border-l': pe() }],
							'divide-x': [{ 'divide-x': pe() }],
							'divide-x-reverse': ['divide-x-reverse'],
							'divide-y': [{ 'divide-y': pe() }],
							'divide-y-reverse': ['divide-y-reverse'],
							'border-style': [{ border: [...Ee(), 'hidden', 'none'] }],
							'divide-style': [{ divide: [...Ee(), 'hidden', 'none'] }],
							'border-color': [{ border: A() }],
							'border-color-x': [{ 'border-x': A() }],
							'border-color-y': [{ 'border-y': A() }],
							'border-color-s': [{ 'border-s': A() }],
							'border-color-e': [{ 'border-e': A() }],
							'border-color-t': [{ 'border-t': A() }],
							'border-color-r': [{ 'border-r': A() }],
							'border-color-b': [{ 'border-b': A() }],
							'border-color-l': [{ 'border-l': A() }],
							'divide-color': [{ divide: A() }],
							'outline-style': [{ outline: [...Ee(), 'none', 'hidden'] }],
							'outline-offset': [{ 'outline-offset': [ee, G, V] }],
							'outline-w': [{ outline: ['', ee, Oa, Bt] }],
							'outline-color': [{ outline: A() }],
							shadow: [{ shadow: ['', 'none', u, co, uo] }],
							'shadow-color': [{ shadow: A() }],
							'inset-shadow': [{ 'inset-shadow': ['none', f, co, uo] }],
							'inset-shadow-color': [{ 'inset-shadow': A() }],
							'ring-w': [{ ring: pe() }],
							'ring-w-inset': ['ring-inset'],
							'ring-color': [{ ring: A() }],
							'ring-offset-w': [{ 'ring-offset': [ee, Bt] }],
							'ring-offset-color': [{ 'ring-offset': A() }],
							'inset-ring-w': [{ 'inset-ring': pe() }],
							'inset-ring-color': [{ 'inset-ring': A() }],
							'text-shadow': [{ 'text-shadow': ['none', m, co, uo] }],
							'text-shadow-color': [{ 'text-shadow': A() }],
							opacity: [{ opacity: [ee, G, V] }],
							'mix-blend': [{ 'mix-blend': [...ve(), 'plus-darker', 'plus-lighter'] }],
							'bg-blend': [{ 'bg-blend': ve() }],
							'mask-clip': [
								{ 'mask-clip': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] },
								'mask-no-clip'
							],
							'mask-composite': [{ mask: ['add', 'subtract', 'intersect', 'exclude'] }],
							'mask-image-linear-pos': [{ 'mask-linear': [ee] }],
							'mask-image-linear-from-pos': [{ 'mask-linear-from': _() }],
							'mask-image-linear-to-pos': [{ 'mask-linear-to': _() }],
							'mask-image-linear-from-color': [{ 'mask-linear-from': A() }],
							'mask-image-linear-to-color': [{ 'mask-linear-to': A() }],
							'mask-image-t-from-pos': [{ 'mask-t-from': _() }],
							'mask-image-t-to-pos': [{ 'mask-t-to': _() }],
							'mask-image-t-from-color': [{ 'mask-t-from': A() }],
							'mask-image-t-to-color': [{ 'mask-t-to': A() }],
							'mask-image-r-from-pos': [{ 'mask-r-from': _() }],
							'mask-image-r-to-pos': [{ 'mask-r-to': _() }],
							'mask-image-r-from-color': [{ 'mask-r-from': A() }],
							'mask-image-r-to-color': [{ 'mask-r-to': A() }],
							'mask-image-b-from-pos': [{ 'mask-b-from': _() }],
							'mask-image-b-to-pos': [{ 'mask-b-to': _() }],
							'mask-image-b-from-color': [{ 'mask-b-from': A() }],
							'mask-image-b-to-color': [{ 'mask-b-to': A() }],
							'mask-image-l-from-pos': [{ 'mask-l-from': _() }],
							'mask-image-l-to-pos': [{ 'mask-l-to': _() }],
							'mask-image-l-from-color': [{ 'mask-l-from': A() }],
							'mask-image-l-to-color': [{ 'mask-l-to': A() }],
							'mask-image-x-from-pos': [{ 'mask-x-from': _() }],
							'mask-image-x-to-pos': [{ 'mask-x-to': _() }],
							'mask-image-x-from-color': [{ 'mask-x-from': A() }],
							'mask-image-x-to-color': [{ 'mask-x-to': A() }],
							'mask-image-y-from-pos': [{ 'mask-y-from': _() }],
							'mask-image-y-to-pos': [{ 'mask-y-to': _() }],
							'mask-image-y-from-color': [{ 'mask-y-from': A() }],
							'mask-image-y-to-color': [{ 'mask-y-to': A() }],
							'mask-image-radial': [{ 'mask-radial': [G, V] }],
							'mask-image-radial-from-pos': [{ 'mask-radial-from': _() }],
							'mask-image-radial-to-pos': [{ 'mask-radial-to': _() }],
							'mask-image-radial-from-color': [{ 'mask-radial-from': A() }],
							'mask-image-radial-to-color': [{ 'mask-radial-to': A() }],
							'mask-image-radial-shape': [{ 'mask-radial': ['circle', 'ellipse'] }],
							'mask-image-radial-size': [
								{ 'mask-radial': [{ closest: ['side', 'corner'], farthest: ['side', 'corner'] }] }
							],
							'mask-image-radial-pos': [{ 'mask-radial-at': b() }],
							'mask-image-conic-pos': [{ 'mask-conic': [ee] }],
							'mask-image-conic-from-pos': [{ 'mask-conic-from': _() }],
							'mask-image-conic-to-pos': [{ 'mask-conic-to': _() }],
							'mask-image-conic-from-color': [{ 'mask-conic-from': A() }],
							'mask-image-conic-to-color': [{ 'mask-conic-to': A() }],
							'mask-mode': [{ mask: ['alpha', 'luminance', 'match'] }],
							'mask-origin': [
								{ 'mask-origin': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] }
							],
							'mask-position': [{ mask: Q() }],
							'mask-repeat': [{ mask: oe() }],
							'mask-size': [{ mask: me() }],
							'mask-type': [{ 'mask-type': ['alpha', 'luminance'] }],
							'mask-image': [{ mask: ['none', G, V] }],
							filter: [{ filter: ['', 'none', G, V] }],
							blur: [{ blur: ne() }],
							brightness: [{ brightness: [ee, G, V] }],
							contrast: [{ contrast: [ee, G, V] }],
							'drop-shadow': [{ 'drop-shadow': ['', 'none', g, co, uo] }],
							'drop-shadow-color': [{ 'drop-shadow': A() }],
							grayscale: [{ grayscale: ['', ee, G, V] }],
							'hue-rotate': [{ 'hue-rotate': [ee, G, V] }],
							invert: [{ invert: ['', ee, G, V] }],
							saturate: [{ saturate: [ee, G, V] }],
							sepia: [{ sepia: ['', ee, G, V] }],
							'backdrop-filter': [{ 'backdrop-filter': ['', 'none', G, V] }],
							'backdrop-blur': [{ 'backdrop-blur': ne() }],
							'backdrop-brightness': [{ 'backdrop-brightness': [ee, G, V] }],
							'backdrop-contrast': [{ 'backdrop-contrast': [ee, G, V] }],
							'backdrop-grayscale': [{ 'backdrop-grayscale': ['', ee, G, V] }],
							'backdrop-hue-rotate': [{ 'backdrop-hue-rotate': [ee, G, V] }],
							'backdrop-invert': [{ 'backdrop-invert': ['', ee, G, V] }],
							'backdrop-opacity': [{ 'backdrop-opacity': [ee, G, V] }],
							'backdrop-saturate': [{ 'backdrop-saturate': [ee, G, V] }],
							'backdrop-sepia': [{ 'backdrop-sepia': ['', ee, G, V] }],
							'border-collapse': [{ border: ['collapse', 'separate'] }],
							'border-spacing': [{ 'border-spacing': w() }],
							'border-spacing-x': [{ 'border-spacing-x': w() }],
							'border-spacing-y': [{ 'border-spacing-y': w() }],
							'table-layout': [{ table: ['auto', 'fixed'] }],
							caption: [{ caption: ['top', 'bottom'] }],
							transition: [
								{ transition: ['', 'all', 'colors', 'opacity', 'shadow', 'transform', 'none', G, V] }
							],
							'transition-behavior': [{ transition: ['normal', 'discrete'] }],
							duration: [{ duration: [ee, 'initial', G, V] }],
							ease: [{ ease: ['linear', 'initial', v, G, V] }],
							delay: [{ delay: [ee, G, V] }],
							animate: [{ animate: ['none', L, G, V] }],
							backface: [{ backface: ['hidden', 'visible'] }],
							perspective: [{ perspective: [p, G, V] }],
							'perspective-origin': [{ 'perspective-origin': I() }],
							rotate: [{ rotate: he() }],
							'rotate-x': [{ 'rotate-x': he() }],
							'rotate-y': [{ 'rotate-y': he() }],
							'rotate-z': [{ 'rotate-z': he() }],
							scale: [{ scale: se() }],
							'scale-x': [{ 'scale-x': se() }],
							'scale-y': [{ 'scale-y': se() }],
							'scale-z': [{ 'scale-z': se() }],
							'scale-3d': ['scale-3d'],
							skew: [{ skew: ie() }],
							'skew-x': [{ 'skew-x': ie() }],
							'skew-y': [{ 'skew-y': ie() }],
							transform: [{ transform: [G, V, '', 'none', 'gpu', 'cpu'] }],
							'transform-origin': [{ origin: I() }],
							'transform-style': [{ transform: ['3d', 'flat'] }],
							translate: [{ translate: fe() }],
							'translate-x': [{ 'translate-x': fe() }],
							'translate-y': [{ 'translate-y': fe() }],
							'translate-z': [{ 'translate-z': fe() }],
							'translate-none': ['translate-none'],
							accent: [{ accent: A() }],
							appearance: [{ appearance: ['none', 'auto'] }],
							'caret-color': [{ caret: A() }],
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
										G,
										V
									]
								}
							],
							'field-sizing': [{ 'field-sizing': ['fixed', 'content'] }],
							'pointer-events': [{ 'pointer-events': ['auto', 'none'] }],
							resize: [{ resize: ['none', '', 'y', 'x'] }],
							'scroll-behavior': [{ scroll: ['auto', 'smooth'] }],
							'scroll-m': [{ 'scroll-m': w() }],
							'scroll-mx': [{ 'scroll-mx': w() }],
							'scroll-my': [{ 'scroll-my': w() }],
							'scroll-ms': [{ 'scroll-ms': w() }],
							'scroll-me': [{ 'scroll-me': w() }],
							'scroll-mt': [{ 'scroll-mt': w() }],
							'scroll-mr': [{ 'scroll-mr': w() }],
							'scroll-mb': [{ 'scroll-mb': w() }],
							'scroll-ml': [{ 'scroll-ml': w() }],
							'scroll-p': [{ 'scroll-p': w() }],
							'scroll-px': [{ 'scroll-px': w() }],
							'scroll-py': [{ 'scroll-py': w() }],
							'scroll-ps': [{ 'scroll-ps': w() }],
							'scroll-pe': [{ 'scroll-pe': w() }],
							'scroll-pt': [{ 'scroll-pt': w() }],
							'scroll-pr': [{ 'scroll-pr': w() }],
							'scroll-pb': [{ 'scroll-pb': w() }],
							'scroll-pl': [{ 'scroll-pl': w() }],
							'snap-align': [{ snap: ['start', 'end', 'center', 'align-none'] }],
							'snap-stop': [{ snap: ['normal', 'always'] }],
							'snap-type': [{ snap: ['none', 'x', 'y', 'both'] }],
							'snap-strictness': [{ snap: ['mandatory', 'proximity'] }],
							touch: [{ touch: ['auto', 'none', 'manipulation'] }],
							'touch-x': [{ 'touch-pan': ['x', 'left', 'right'] }],
							'touch-y': [{ 'touch-pan': ['y', 'up', 'down'] }],
							'touch-pz': ['touch-pinch-zoom'],
							select: [{ select: ['none', 'text', 'all', 'auto'] }],
							'will-change': [{ 'will-change': ['auto', 'scroll', 'contents', 'transform', G, V] }],
							fill: [{ fill: ['none', ...A()] }],
							'stroke-w': [{ stroke: [ee, Oa, Bt, cl] }],
							stroke: [{ stroke: ['none', ...A()] }],
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
				(kl = jp(pm)))
		})
	function j(...e) {
		return kl(io(e))
	}
	var re = y(() => {
		Fr()
		Tl()
	})
	function c(e, t, a) {
		return Al.createElement(e, a == null ? t : { ...t, key: a })
	}
	var Al,
		Je,
		W,
		O = y(() => {
			;((Al = globalThis.React), (Je = Al.Fragment))
			W = c
		})
	var mm,
		hm,
		gm,
		xm,
		vm,
		Lm,
		Cm,
		bm,
		Im,
		Sm,
		wm,
		ym,
		Rm,
		Pm,
		km,
		Tm,
		Am,
		Dm,
		Dl = y(() => {
			K()
			O()
			mm = R(({ size: e = 24, ...t }, a) =>
				c('svg', {
					ref: a,
					xmlns: 'http://www.w3.org/2000/svg',
					width: e,
					height: e,
					viewBox: '0 0 24 24',
					fill: 'currentColor',
					stroke: 'none',
					'aria-hidden': 'true',
					...t,
					children: c('path', {
						d: 'M2 6c0-.796.316-1.558.879-2.121A3 3 0 0 1 5 3h4l.099.005c.229.023.444.124.608.288L12.414 6H19c.796 0 1.558.316 2.121.879.319.319.559.703.707 1.121H7.305c-.407 0-.805.125-1.14.356-.292.203-.525.48-.674.801l-.058.141-1.379 3.676a1 1 0 0 0 1.873.702l1.134-3.027A1 1 0 0 1 7.998 10H21l.217.012c.216.024.426.082.624.173.054.025.107.053.159.083.199.115.377.263.525.439.188.222.325.482.403.762.077.28.092.573.045.859l-.005.024-.995 5.21a3 3 0 0 1-1.036 1.749c-.47.389-1.046.624-1.65.677l-.261.012H5a3 3 0 0 1-3-3V6z'
					})
				})
			)
			mm.displayName = 'TablerFolderOpenFilledIcon'
			hm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2' }),
						c('path', { d: 'M17 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2' })
					]
				})
			)
			hm.displayName = 'TablerFoldersIcon'
			gm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M2 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H2' }),
						c('path', { d: 'M17 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
						c('path', { d: 'M9.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-3 0v-3A1.5 1.5 0 0 1 9.5 15' }),
						c('path', { d: 'm19.5 15 3 6' }),
						c('path', { d: 'm19.5 21 3-6' })
					]
				})
			)
			gm.displayName = 'TablerFileTypeDocxIcon'
			xm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						c('path', { d: 'M17 18h2' }),
						c('path', { d: 'M20 15h-3v6' }),
						c('path', { d: 'M11 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1' })
					]
				})
			)
			xm.displayName = 'TablerFileTypePdfIcon'
			vm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M4 15l4 6' }),
						c('path', { d: 'M4 21l4-6' }),
						c('path', {
							d: 'M17 20.25c0 .414.336.75.75.75H19a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						c('path', { d: 'M11 15v6h3' })
					]
				})
			)
			vm.displayName = 'TablerFileTypeXlsIcon'
			Lm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M7 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
						c('path', {
							d: 'M10 20.25c0 .414.336.75.75.75H12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						c('path', { d: 'M16 15l2 6l2-6' })
					]
				})
			)
			Lm.displayName = 'TablerFileTypeCsvIcon'
			Cm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M2 21v-6' }),
						c('path', { d: 'M5 15v6' }),
						c('path', { d: 'M2 18h3' }),
						c('path', { d: 'M20 15v6h2' }),
						c('path', { d: 'M13 21v-6l2 3l2-3v6' }),
						c('path', { d: 'M7.5 15h3' }),
						c('path', { d: 'M9 15v6' })
					]
				})
			)
			Cm.displayName = 'TablerFileTypeHtmlIcon'
			bm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
						c('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
						c('path', { d: 'M5 15h3v4.5a1.5 1.5 0 0 1-3 0' })
					]
				})
			)
			bm.displayName = 'TablerFileTypeJpgIcon'
			Im = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
						c('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						c('path', { d: 'M11 21v-6l3 6v-6' })
					]
				})
			)
			Im.displayName = 'TablerFileTypePngIcon'
			Sm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
						c('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
						c('path', { d: 'M16.5 15h3' }),
						c('path', { d: 'M18 15v6' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' })
					]
				})
			)
			Sm.displayName = 'TablerFileTypePptIcon'
			wm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', {
							d: 'M4 20.25c0 .414.336.75.75.75H6a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
						}),
						c('path', { d: 'M10 15l2 6l2-6' }),
						c('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' })
					]
				})
			)
			wm.displayName = 'TablerFileTypeSvgIcon'
			ym = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M16.5 15h3' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M4.5 15h3' }),
						c('path', { d: 'M6 15v6' }),
						c('path', { d: 'M18 15v6' }),
						c('path', { d: 'M10 15l4 6' }),
						c('path', { d: 'M10 21l4-6' })
					]
				})
			)
			ym.displayName = 'TablerFileTypeTxtIcon'
			Rm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
						c('path', { d: 'M16 18h1.5a1.5 1.5 0 0 0 0-3H16v6' }),
						c('path', { d: 'M12 15v6' }),
						c('path', { d: 'M5 15h3l-3 6h3' })
					]
				})
			)
			Rm.displayName = 'TablerFileTypeZipIcon'
			Pm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
						c('path', { d: 'M9 17h6' }),
						c('path', { d: 'M9 13h6' })
					]
				})
			)
			Pm.displayName = 'TablerFileDescriptionIcon'
			km = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
						c('path', { d: 'M10 13l-1 2l1 2' }),
						c('path', { d: 'M14 13l1 2l-1 2' })
					]
				})
			)
			km.displayName = 'TablerFileCodeIcon'
			Tm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
						c('path', { d: 'M10 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0' }),
						c('path', { d: 'M12 16v-5l2 1' })
					]
				})
			)
			Tm.displayName = 'TablerFileMusicIcon'
			Am = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
						c('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' })
					]
				})
			)
			Am.displayName = 'TablerFileIcon'
			Dm = R(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
				W('svg', {
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
						c('path', { d: 'M15 10l4.553-2.276a1 1 0 0 1 1.447.894v6.764a1 1 0 0 1-1.447.894L15 14v-4' }),
						c('path', { d: 'M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8' })
					]
				})
			)
			Dm.displayName = 'TablerVideoIcon'
		})
	var Ml,
		El,
		It,
		Ba = y(() => {
			Fr()
			;((Ml = (e) => (typeof e == 'boolean' ? `${e}` : e === 0 ? '0' : e)),
				(El = io),
				(It = (e, t) => (a) => {
					var o
					if (t?.variants == null) return El(e, a?.class, a?.className)
					let { variants: r, defaultVariants: n } = t,
						s = Object.keys(r).map((d) => {
							let u = a?.[d],
								f = n?.[d]
							if (u === null) return null
							let m = Ml(u) || Ml(f)
							return r[d][m]
						}),
						l =
							a &&
							Object.entries(a).reduce((d, u) => {
								let [f, m] = u
								return (m === void 0 || (d[f] = m), d)
							}, {}),
						i =
							t == null || (o = t.compoundVariants) === null || o === void 0
								? void 0
								: o.reduce((d, u) => {
										let { class: f, className: m, ...g } = u
										return Object.entries(g).every((h) => {
											let [p, x] = h
											return Array.isArray(x)
												? x.includes({ ...n, ...l }[p])
												: { ...n, ...l }[p] === x
										})
											? [...d, f, m]
											: d
									}, [])
					return El(e, s, i, a?.class, a?.className)
				}))
		})
	var Hr,
		Fa,
		fo,
		HL,
		ua = y(() => {
			;((Hr = globalThis.ReactDOM),
				(Fa = Hr.createPortal),
				(fo = Hr.flushSync),
				(HL = Hr.unstable_batchedUpdates))
		})
	function Ol(e, t) {
		if (typeof e == 'function') return e(t)
		e != null && (e.current = t)
	}
	function Mm(...e) {
		return (t) => {
			let a = !1,
				o = e.map((r) => {
					let n = Ol(r, t)
					return (!a && typeof n == 'function' && (a = !0), n)
				})
			if (a)
				return () => {
					for (let r = 0; r < o.length; r++) {
						let n = o[r]
						typeof n == 'function' ? n() : Ol(e[r], null)
					}
				}
		}
	}
	function Z(...e) {
		return q(Mm(...e), e)
	}
	var Fe = y(() => {
		K()
	})
	var da = {}
	Lt(da, { Root: () => Em, Slot: () => Em, Slottable: () => Om, createSlot: () => qe, createSlottable: () => ho })
	function qe(e) {
		let t = R((a, o) => {
			let { children: r, ...n } = a,
				s = null,
				l = !1,
				i = []
			;(Bl(r) && typeof mo == 'function' && (r = mo(r._payload)),
				Ke.forEach(r, (m) => {
					if (zm(m)) {
						l = !0
						let g = m,
							h = 'child' in g.props ? g.props.child : g.props.children
						;(Bl(h) && typeof mo == 'function' && (h = mo(h._payload)),
							(s = Bm(g, h)),
							i.push(s?.props?.children))
					} else i.push(m)
				}),
				s ? (s = st(s, void 0, i)) : !l && Ke.count(r) === 1 && sa(r) && (s = r))
			let d = s ? Nm(s) : void 0,
				u = Z(o, d)
			if (!s) {
				if (r || r === 0) throw new Error(l ? Um(e) : qm(e))
				return r
			}
			let f = Fm(n, s.props ?? {})
			return (s.type !== $e && (f.ref = o ? u : d), st(s, f))
		})
		return ((t.displayName = `${e}.Slot`), t)
	}
	function ho(e) {
		let t = (a) => ('child' in a ? a.children(a.child) : a.children)
		return ((t.displayName = `${e}.Slottable`), (t.__radixId = Fl), t)
	}
	function Fm(e, t) {
		let a = { ...t }
		for (let o in t) {
			let r = e[o],
				n = t[o]
			;/^on[A-Z]/.test(o)
				? r && n
					? (a[o] = (...l) => {
							let i = n(...l)
							return (r(...l), i)
						})
					: r && (a[o] = r)
				: o === 'style'
					? (a[o] = { ...r, ...n })
					: o === 'className' && (a[o] = [r, n].filter(Boolean).join(' '))
		}
		return { ...e, ...a }
	}
	function Nm(e) {
		let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
			a = t && 'isReactWarning' in t && t.isReactWarning
		return a
			? e.ref
			: ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
				(a = t && 'isReactWarning' in t && t.isReactWarning),
				a ? e.props.ref : e.props.ref || e.ref)
	}
	function zm(e) {
		return sa(e) && typeof e.type == 'function' && '__radixId' in e.type && e.type.__radixId === Fl
	}
	function Bl(e) {
		return (
			e != null &&
			typeof e == 'object' &&
			'$$typeof' in e &&
			e.$$typeof === _m &&
			'_payload' in e &&
			Hm(e._payload)
		)
	}
	function Hm(e) {
		return typeof e == 'object' && e !== null && 'then' in e
	}
	var Em,
		Fl,
		Om,
		Bm,
		_m,
		qm,
		Um,
		mo,
		Nt = y(() => {
			K()
			Fe()
			;((Em = qe('Slot')), (Fl = Symbol.for('radix.slottable')))
			;((Om = ho('Slottable')),
				(Bm = (e, t) => {
					if ('child' in e.props) {
						let a = e.props.child
						return sa(a) ? st(a, void 0, e.props.children(a.props.children)) : null
					}
					return sa(t) ? t : null
				}))
			_m = Symbol.for('react.lazy')
			;((qm = (e) =>
				`${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`),
				(Um = (e) =>
					`${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`),
				(mo = Y[' use '.trim().toString()]))
		})
	function Nl(e, t) {
		e && fo(() => e.dispatchEvent(t))
	}
	var Vm,
		J,
		Oe = y(() => {
			K()
			ua()
			Nt()
			O()
			;((Vm = [
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
				(J = Vm.reduce((e, t) => {
					let a = qe(`Primitive.${t}`),
						o = R((r, n) => {
							let { asChild: s, ...l } = r,
								i = s ? a : t
							return (
								typeof window < 'u' && (window[Symbol.for('radix-ui')] = !0),
								c(i, { ...l, ref: n })
							)
						})
					return ((o.displayName = `Primitive.${t}`), { ...e, [t]: o })
				}, {})))
		})
	var qr,
		Gm,
		zl,
		_l,
		Ur = y(() => {
			K()
			Oe()
			O()
			;((qr = Object.freeze({
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
				(Gm = 'VisuallyHidden'),
				(zl = R((e, t) => c(J.span, { ...e, ref: t, style: { ...qr, ...e.style } }))))
			zl.displayName = Gm
			_l = zl
		})
	function be(e, t = []) {
		let a = []
		function o(n, s) {
			let l = we(s)
			l.displayName = n + 'Context'
			let i = a.length
			a = [...a, s]
			let d = (f) => {
				let { scope: m, children: g, ...h } = f,
					p = m?.[e]?.[i] || l,
					x = de(() => h, Object.values(h))
				return c(p.Provider, { value: x, children: g })
			}
			d.displayName = n + 'Provider'
			function u(f, m) {
				let g = m?.[e]?.[i] || l,
					h = Re(g)
				if (h) return h
				if (s !== void 0) return s
				throw new Error(`\`${f}\` must be used within \`${n}\``)
			}
			return [d, u]
		}
		let r = () => {
			let n = a.map((s) => we(s))
			return function (l) {
				let i = l?.[e] || n
				return de(() => ({ [`__scope${e}`]: { ...l, [e]: i } }), [l, i])
			}
		}
		return ((r.scopeName = e), [o, jm(r, ...t)])
	}
	function jm(...e) {
		let t = e[0]
		if (e.length === 1) return t
		let a = () => {
			let o = e.map((r) => ({ useScope: r(), scopeName: r.scopeName }))
			return function (n) {
				let s = o.reduce((l, { useScope: i, scopeName: d }) => {
					let f = i(n)[`__scope${d}`]
					return { ...l, ...f }
				}, {})
				return de(() => ({ [`__scope${t.scopeName}`]: s }), [s])
			}
		}
		return ((a.scopeName = t.scopeName), a)
	}
	var Ye = y(() => {
		K()
		O()
	})
	function go(e) {
		let t = e + 'CollectionProvider',
			[a, o] = be(t),
			[r, n] = a(t, { collectionRef: { current: null }, itemMap: new Map() }),
			s = (p) => {
				let { scope: x, children: v } = p,
					L = D(null),
					C = D(new Map()).current
				return c(r, { scope: x, itemMap: C, collectionRef: L, children: v })
			}
		s.displayName = t
		let l = e + 'CollectionSlot',
			i = qe(l),
			d = R((p, x) => {
				let { scope: v, children: L } = p,
					C = n(l, v),
					b = Z(x, C.collectionRef)
				return c(i, { ref: b, children: L })
			})
		d.displayName = l
		let u = e + 'CollectionItemSlot',
			f = 'data-radix-collection-item',
			m = qe(u),
			g = R((p, x) => {
				let { scope: v, children: L, ...C } = p,
					b = D(null),
					I = Z(x, b),
					P = n(u, v)
				return (
					B(
						() => (
							P.itemMap.set(b, { ref: b, ...C }),
							() => {
								P.itemMap.delete(b)
							}
						)
					),
					c(m, { [f]: '', ref: I, children: L })
				)
			})
		g.displayName = u
		function h(p) {
			let x = n(e + 'CollectionConsumer', p)
			return q(() => {
				let L = x.collectionRef.current
				if (!L) return []
				let C = Array.from(L.querySelectorAll(`[${f}]`))
				return Array.from(x.itemMap.values()).sort(
					(P, k) => C.indexOf(P.ref.current) - C.indexOf(k.ref.current)
				)
			}, [x.collectionRef, x.itemMap])
		}
		return [{ Provider: s, Slot: d, ItemSlot: g }, h, o]
	}
	var Vr = y(() => {
		'use client'
		K()
		Ye()
		Fe()
		Nt()
		O()
		K()
		O()
	})
	function X(e, t, { checkForDefaultPrevented: a = !0 } = {}) {
		return function (r) {
			if ((e?.(r), a === !1 || !r.defaultPrevented)) return t?.(r)
		}
	}
	var oC,
		ut = y(() => {
			oC = !!(typeof window < 'u' && window.document && window.document.createElement)
		})
	var ce,
		dt = y(() => {
			K()
			ce = globalThis?.document ? lt : () => {}
		})
	function Ue({ prop: e, defaultProp: t, onChange: a = () => {}, caller: o }) {
		let [r, n, s] = Km({ defaultProp: t, onChange: a }),
			l = e !== void 0,
			i = l ? e : r
		{
			let u = D(e !== void 0)
			B(() => {
				let f = u.current
				;(f !== l &&
					console.warn(
						`${o} is changing from ${f ? 'controlled' : 'uncontrolled'} to ${l ? 'controlled' : 'uncontrolled'}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
					),
					(u.current = l))
			}, [l, o])
		}
		let d = q(
			(u) => {
				if (l) {
					let f = $m(u) ? u(e) : u
					f !== e && s.current?.(f)
				} else n(u)
			},
			[l, e, n, s]
		)
		return [i, d]
	}
	function Km({ defaultProp: e, onChange: t }) {
		let [a, o] = M(e),
			r = D(a),
			n = D(t)
		return (
			Xm(() => {
				n.current = t
			}, [t]),
			B(() => {
				r.current !== a && (n.current?.(a), (r.current = a))
			}, [a, r]),
			[a, o, n]
		)
	}
	function $m(e) {
		return typeof e == 'function'
	}
	var Xm,
		ca = y(() => {
			K()
			dt()
			K()
			Xm = Y[' useInsertionEffect '.trim().toString()] || ce
		})
	function Jm(e, t) {
		return la((a, o) => t[a][o] ?? a, e)
	}
	function Ym(e) {
		let [t, a] = M(),
			o = D(null),
			r = D(e),
			n = D('none'),
			s = e ? 'mounted' : 'unmounted',
			[l, i] = Jm(s, {
				mounted: { UNMOUNT: 'unmounted', ANIMATION_OUT: 'unmountSuspended' },
				unmountSuspended: { MOUNT: 'mounted', ANIMATION_END: 'unmounted' },
				unmounted: { MOUNT: 'mounted' }
			})
		return (
			B(() => {
				let d = xo(o.current)
				n.current = l === 'mounted' ? d : 'none'
			}, [l]),
			ce(() => {
				let d = o.current,
					u = r.current
				if (u !== e) {
					let m = n.current,
						g = xo(d)
					;(e
						? i('MOUNT')
						: g === 'none' || d?.display === 'none'
							? i('UNMOUNT')
							: i(u && m !== g ? 'ANIMATION_OUT' : 'UNMOUNT'),
						(r.current = e))
				}
			}, [e, i]),
			ce(() => {
				if (t) {
					let d,
						u = t.ownerDocument.defaultView ?? window,
						f = (g) => {
							let p = xo(o.current).includes(CSS.escape(g.animationName))
							if (g.target === t && p && (i('ANIMATION_END'), !r.current)) {
								let x = t.style.animationFillMode
								;((t.style.animationFillMode = 'forwards'),
									(d = u.setTimeout(() => {
										t.style.animationFillMode === 'forwards' && (t.style.animationFillMode = x)
									})))
							}
						},
						m = (g) => {
							g.target === t && (n.current = xo(o.current))
						}
					return (
						t.addEventListener('animationstart', m),
						t.addEventListener('animationcancel', f),
						t.addEventListener('animationend', f),
						() => {
							;(u.clearTimeout(d),
								t.removeEventListener('animationstart', m),
								t.removeEventListener('animationcancel', f),
								t.removeEventListener('animationend', f))
						}
					)
				} else i('ANIMATION_END')
			}, [t, i]),
			{
				isPresent: ['mounted', 'unmountSuspended'].includes(l),
				ref: q((d) => {
					;((o.current = d ? getComputedStyle(d) : null), a(d))
				}, [])
			}
		)
	}
	function Hl(e, t) {
		if (typeof e == 'function') return e(t)
		e != null && (e.current = t)
	}
	function Zm(...e) {
		let t = D(e)
		return (
			(t.current = e),
			q((a) => {
				let o = t.current,
					r = !1,
					n = o.map((s) => {
						let l = Hl(s, a)
						return (!r && typeof l == 'function' && (r = !0), l)
					})
				if (r)
					return () => {
						for (let s = 0; s < n.length; s++) {
							let l = n[s]
							typeof l == 'function' ? l() : Hl(o[s], null)
						}
					}
			}, [])
		)
	}
	function xo(e) {
		return e?.animationName || 'none'
	}
	function Qm(e) {
		let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
			a = t && 'isReactWarning' in t && t.isReactWarning
		return a
			? e.ref
			: ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
				(a = t && 'isReactWarning' in t && t.isReactWarning),
				a ? e.props.ref : e.props.ref || e.ref)
	}
	var Se,
		fa = y(() => {
			'use client'
			K()
			dt()
			K()
			Se = (e) => {
				let { present: t, children: a } = e,
					o = Ym(t),
					r = typeof a == 'function' ? a({ present: o.isPresent }) : Ke.only(a),
					n = Zm(o.ref, Qm(r))
				return typeof a == 'function' || o.isPresent ? st(r, { ref: n }) : null
			}
			Se.displayName = 'Presence'
		})
	function Ae(e) {
		let [t, a] = M(eh())
		return (
			ce(() => {
				e || a((o) => o ?? String(th++))
			}, [e]),
			e || (t ? `radix-${t}` : '')
		)
	}
	var eh,
		th,
		pa = y(() => {
			K()
			dt()
			;((eh = Y[' useId '.trim().toString()] || (() => {})), (th = 0))
		})
	function St(e) {
		let t = Re(ah)
		return e || t || 'ltr'
	}
	var ah,
		Na = y(() => {
			'use client'
			K()
			O()
			ah = we(void 0)
		})
	function xe(e) {
		let t = D(e)
		return (
			B(() => {
				t.current = e
			}),
			de(
				() =>
					(...a) =>
						t.current?.(...a),
				[]
			)
		)
	}
	var wt = y(() => {
		K()
	})
	function ql(e, t = globalThis?.document) {
		let a = xe(e)
		B(() => {
			let o = (r) => {
				r.key === 'Escape' && a(r)
			}
			return (
				t.addEventListener('keydown', o, { capture: !0 }),
				() => t.removeEventListener('keydown', o, { capture: !0 })
			)
		}, [a, t])
	}
	var Ul = y(() => {
		K()
		wt()
	})
	function Wl() {
		let e = Re(Wr),
			[t, a] = M(null)
		return (
			B(() => {
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
	function ih(e, t) {
		let {
				ownerDocument: a = globalThis?.document,
				deferPointerDownOutside: o = !1,
				isDeferredPointerDownOutsideRef: r,
				dismissableSurfaces: n
			} = t,
			s = xe(e),
			l = D(!1),
			i = D(!1),
			d = D(new Map()),
			u = D(() => {})
		return (
			B(() => {
				function f() {
					;((i.current = !1), (r.current = !1), d.current.clear())
				}
				function m() {
					return Array.from(d.current.values()).some(Boolean)
				}
				function g(L) {
					if (!i.current) return
					let C = L.target
					;((C instanceof Node && [...n].some((I) => I.contains(C))) || d.current.set(L.type, !0),
						L.type === 'click' &&
							window.setTimeout(() => {
								i.current && u.current()
							}, 0))
				}
				function h(L) {
					i.current && d.current.set(L.type, !1)
				}
				let p = (L) => {
						if (L.target && !l.current) {
							let b = function () {
								a.removeEventListener('click', u.current)
								let P = m()
								;(f(), P || jl(rh, s, I, { discrete: !0 }))
							}
							var C = b
							let I = { originalEvent: L }
							;((i.current = !0),
								(r.current = o && L.button === 0),
								d.current.clear(),
								!o || L.button !== 0
									? b()
									: (a.removeEventListener('click', u.current),
										(u.current = b),
										a.addEventListener('click', u.current, { once: !0 })))
						} else (a.removeEventListener('click', u.current), f())
						l.current = !1
					},
					x = ['pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']
				for (let L of x) (a.addEventListener(L, g, !0), a.addEventListener(L, h))
				let v = window.setTimeout(() => {
					a.addEventListener('pointerdown', p)
				}, 0)
				return () => {
					;(window.clearTimeout(v),
						a.removeEventListener('pointerdown', p),
						a.removeEventListener('click', u.current))
					for (let L of x) (a.removeEventListener(L, g, !0), a.removeEventListener(L, h))
				}
			}, [a, s, o, r, n]),
			{ onPointerDownCapture: () => (l.current = !0) }
		)
	}
	function uh(e, t = globalThis?.document) {
		let a = xe(e),
			o = D(!1)
		return (
			B(() => {
				let r = (n) => {
					n.target && !o.current && jl(nh, a, { originalEvent: n }, { discrete: !1 })
				}
				return (t.addEventListener('focusin', r), () => t.removeEventListener('focusin', r))
			}, [t, a]),
			{ onFocusCapture: () => (o.current = !0), onBlurCapture: () => (o.current = !1) }
		)
	}
	function Gl() {
		let e = new CustomEvent(Gr)
		document.dispatchEvent(e)
	}
	function jl(e, t, a, { discrete: o }) {
		let r = a.originalEvent.target,
			n = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: a })
		;(t && r.addEventListener(e, t, { once: !0 }), o ? Nl(r, n) : r.dispatchEvent(n))
	}
	var oh,
		Gr,
		rh,
		nh,
		Vl,
		Wr,
		zt,
		sh,
		lh,
		vo = y(() => {
			'use client'
			K()
			ut()
			Oe()
			Fe()
			wt()
			Ul()
			O()
			;((oh = 'DismissableLayer'),
				(Gr = 'dismissableLayer.update'),
				(rh = 'dismissableLayer.pointerDownOutside'),
				(nh = 'dismissableLayer.focusOutside'),
				(Wr = we({
					layers: new Set(),
					layersWithOutsidePointerEventsDisabled: new Set(),
					branches: new Set(),
					dismissableSurfaces: new Set()
				})),
				(zt = R((e, t) => {
					let {
							disableOutsidePointerEvents: a = !1,
							deferPointerDownOutside: o = !1,
							onEscapeKeyDown: r,
							onPointerDownOutside: n,
							onFocusOutside: s,
							onInteractOutside: l,
							onDismiss: i,
							...d
						} = e,
						u = Re(Wr),
						[f, m] = M(null),
						g = f?.ownerDocument ?? globalThis?.document,
						[, h] = M({}),
						p = Z(t, (E) => m(E)),
						x = Array.from(u.layers),
						[v] = [...u.layersWithOutsidePointerEventsDisabled].slice(-1),
						L = x.indexOf(v),
						C = f ? x.indexOf(f) : -1,
						b = u.layersWithOutsidePointerEventsDisabled.size > 0,
						I = C >= L,
						P = D(!1),
						k = ih(
							(E) => {
								let U = E.target
								if (!(U instanceof Node)) return
								let S = [...u.branches].some((T) => T.contains(U))
								!I || S || (n?.(E), l?.(E), E.defaultPrevented || i?.())
							},
							{
								ownerDocument: g,
								deferPointerDownOutside: o,
								isDeferredPointerDownOutsideRef: P,
								dismissableSurfaces: u.dismissableSurfaces
							}
						),
						w = uh((E) => {
							if (o && P.current) return
							let U = E.target
							;[...u.branches].some((T) => T.contains(U)) || (s?.(E), l?.(E), E.defaultPrevented || i?.())
						}, g)
					return (
						ql((E) => {
							C === u.layers.size - 1 && (r?.(E), !E.defaultPrevented && i && (E.preventDefault(), i()))
						}, g),
						B(() => {
							if (f)
								return (
									a &&
										(u.layersWithOutsidePointerEventsDisabled.size === 0 &&
											((Vl = g.body.style.pointerEvents), (g.body.style.pointerEvents = 'none')),
										u.layersWithOutsidePointerEventsDisabled.add(f)),
									u.layers.add(f),
									Gl(),
									() => {
										a &&
											(u.layersWithOutsidePointerEventsDisabled.delete(f),
											u.layersWithOutsidePointerEventsDisabled.size === 0 &&
												(g.body.style.pointerEvents = Vl))
									}
								)
						}, [f, g, a, u]),
						B(
							() => () => {
								f && (u.layers.delete(f), u.layersWithOutsidePointerEventsDisabled.delete(f), Gl())
							},
							[f, u]
						),
						B(() => {
							let E = () => h({})
							return (document.addEventListener(Gr, E), () => document.removeEventListener(Gr, E))
						}, []),
						c(J.div, {
							...d,
							ref: p,
							style: { pointerEvents: b ? (I ? 'auto' : 'none') : void 0, ...e.style },
							onFocusCapture: X(e.onFocusCapture, w.onFocusCapture),
							onBlurCapture: X(e.onBlurCapture, w.onBlurCapture),
							onPointerDownCapture: X(e.onPointerDownCapture, k.onPointerDownCapture)
						})
					)
				})))
			zt.displayName = oh
			;((sh = 'DismissableLayerBranch'),
				(lh = R((e, t) => {
					let a = Re(Wr),
						o = D(null),
						r = Z(t, o)
					return (
						B(() => {
							let n = o.current
							if (n)
								return (
									a.branches.add(n),
									() => {
										a.branches.delete(n)
									}
								)
						}, [a.branches]),
						c(J.div, { ...e, ref: r })
					)
				})))
			lh.displayName = sh
		})
	function ch(e, { select: t = !1 } = {}) {
		let a = document.activeElement
		for (let o of e) if ((yt(o, { select: t }), document.activeElement !== a)) return
	}
	function fh(e) {
		let t = Yl(e),
			a = Kl(t, e),
			o = Kl(t.reverse(), e)
		return [a, o]
	}
	function Yl(e) {
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
	function Kl(e, t) {
		for (let a of e) if (!ph(a, { upTo: t })) return a
	}
	function ph(e, { upTo: t }) {
		if (getComputedStyle(e).visibility === 'hidden') return !0
		for (; e; ) {
			if (t !== void 0 && e === t) return !1
			if (getComputedStyle(e).display === 'none') return !0
			e = e.parentElement
		}
		return !1
	}
	function mh(e) {
		return e instanceof HTMLInputElement && 'select' in e
	}
	function yt(e, { select: t = !1 } = {}) {
		if (e && e.focus) {
			let a = document.activeElement
			;(e.focus({ preventScroll: !0 }), e !== a && mh(e) && t && e.select())
		}
	}
	function hh() {
		let e = []
		return {
			add(t) {
				let a = e[0]
				;(t !== a && a?.pause(), (e = Jl(e, t)), e.unshift(t))
			},
			remove(t) {
				;((e = Jl(e, t)), e[0]?.resume())
			}
		}
	}
	function Jl(e, t) {
		let a = [...e],
			o = a.indexOf(t)
		return (o !== -1 && a.splice(o, 1), a)
	}
	function gh(e) {
		return e.filter((t) => t.tagName !== 'A')
	}
	var jr,
		Xr,
		Xl,
		dh,
		za,
		$l,
		Kr = y(() => {
			'use client'
			K()
			Fe()
			Oe()
			wt()
			O()
			;((jr = 'focusScope.autoFocusOnMount'),
				(Xr = 'focusScope.autoFocusOnUnmount'),
				(Xl = { bubbles: !1, cancelable: !0 }),
				(dh = 'FocusScope'),
				(za = R((e, t) => {
					let { loop: a = !1, trapped: o = !1, onMountAutoFocus: r, onUnmountAutoFocus: n, ...s } = e,
						[l, i] = M(null),
						d = xe(r),
						u = xe(n),
						f = D(null),
						m = Z(t, (p) => i(p)),
						g = D({
							paused: !1,
							pause() {
								this.paused = !0
							},
							resume() {
								this.paused = !1
							}
						}).current
					;(B(() => {
						if (o) {
							let L = function (P) {
									if (g.paused || !l) return
									let k = P.target
									l.contains(k) ? (f.current = k) : yt(f.current, { select: !0 })
								},
								C = function (P) {
									if (g.paused || !l) return
									let k = P.relatedTarget
									k !== null && (l.contains(k) || yt(f.current, { select: !0 }))
								},
								b = function (P) {
									if (document.activeElement === document.body)
										for (let w of P) w.removedNodes.length > 0 && yt(l)
								}
							var p = L,
								x = C,
								v = b
							;(document.addEventListener('focusin', L), document.addEventListener('focusout', C))
							let I = new MutationObserver(b)
							return (
								l && I.observe(l, { childList: !0, subtree: !0 }),
								() => {
									;(document.removeEventListener('focusin', L),
										document.removeEventListener('focusout', C),
										I.disconnect())
								}
							)
						}
					}, [o, l, g.paused]),
						B(() => {
							if (l) {
								$l.add(g)
								let p = document.activeElement
								if (!l.contains(p)) {
									let v = new CustomEvent(jr, Xl)
									;(l.addEventListener(jr, d),
										l.dispatchEvent(v),
										v.defaultPrevented ||
											(ch(gh(Yl(l)), { select: !0 }), document.activeElement === p && yt(l)))
								}
								return () => {
									;(l.removeEventListener(jr, d),
										setTimeout(() => {
											let v = new CustomEvent(Xr, Xl)
											;(l.addEventListener(Xr, u),
												l.dispatchEvent(v),
												v.defaultPrevented || yt(p ?? document.body, { select: !0 }),
												l.removeEventListener(Xr, u),
												$l.remove(g))
										}, 0))
								}
							}
						}, [l, d, u, g]))
					let h = q(
						(p) => {
							if ((!a && !o) || g.paused) return
							let x = p.key === 'Tab' && !p.altKey && !p.ctrlKey && !p.metaKey,
								v = document.activeElement
							if (x && v) {
								let L = p.currentTarget,
									[C, b] = fh(L)
								C && b
									? !p.shiftKey && v === b
										? (p.preventDefault(), a && yt(C, { select: !0 }))
										: p.shiftKey && v === C && (p.preventDefault(), a && yt(b, { select: !0 }))
									: v === L && p.preventDefault()
							}
						},
						[a, o, g.paused]
					)
					return c(J.div, { tabIndex: -1, ...s, ref: m, onKeyDown: h })
				})))
			za.displayName = dh
			$l = hh()
		})
	var xh,
		_t,
		Lo = y(() => {
			'use client'
			K()
			ua()
			Oe()
			dt()
			O()
			;((xh = 'Portal'),
				(_t = R((e, t) => {
					let { container: a, ...o } = e,
						[r, n] = M(!1)
					ce(() => n(!0), [])
					let s = a || (r && globalThis?.document?.body)
					return s ? Fa(c(J.div, { ...o, ref: t }), s) : null
				})))
			_t.displayName = xh
		})
	function bo() {
		B(() => {
			ma || (ma = { start: Zl(), end: Zl() })
			let { start: e, end: t } = ma
			return (
				document.body.firstElementChild !== e && document.body.insertAdjacentElement('afterbegin', e),
				document.body.lastElementChild !== t && document.body.insertAdjacentElement('beforeend', t),
				Co++,
				() => {
					;(Co === 1 && (ma?.start.remove(), ma?.end.remove(), (ma = null)), (Co = Math.max(0, Co - 1)))
				}
			)
		}, [])
	}
	function Zl() {
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
	var Co,
		ma,
		$r = y(() => {
			'use client'
			K()
			;((Co = 0), (ma = null))
		})
	function Io(e, t) {
		var a = {}
		for (var o in e) Object.prototype.hasOwnProperty.call(e, o) && t.indexOf(o) < 0 && (a[o] = e[o])
		if (e != null && typeof Object.getOwnPropertySymbols == 'function')
			for (var r = 0, o = Object.getOwnPropertySymbols(e); r < o.length; r++)
				t.indexOf(o[r]) < 0 && Object.prototype.propertyIsEnumerable.call(e, o[r]) && (a[o[r]] = e[o[r]])
		return a
	}
	function Ql(e, t, a) {
		if (a || arguments.length === 2)
			for (var o = 0, r = t.length, n; o < r; o++)
				(n || !(o in t)) && (n || (n = Array.prototype.slice.call(t, 0, o)), (n[o] = t[o]))
		return e.concat(n || Array.prototype.slice.call(t))
	}
	var De,
		ha = y(() => {
			De = function () {
				return (
					(De =
						Object.assign ||
						function (t) {
							for (var a, o = 1, r = arguments.length; o < r; o++) {
								a = arguments[o]
								for (var n in a) Object.prototype.hasOwnProperty.call(a, n) && (t[n] = a[n])
							}
							return t
						}),
					De.apply(this, arguments)
				)
			}
		})
	var Ht,
		qt,
		Jr,
		Yr,
		So = y(() => {
			;((Ht = 'right-scroll-bar-position'),
				(qt = 'width-before-scroll-bar'),
				(Jr = 'with-scroll-bars-hidden'),
				(Yr = '--removed-body-scroll-bar-size'))
		})
	function wo(e, t) {
		return (typeof e == 'function' ? e(t) : e && (e.current = t), e)
	}
	var ei = y(() => {})
	function ti(e, t) {
		var a = M(function () {
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
	var ai = y(() => {
		K()
	})
	function Zr(e, t) {
		var a = ti(t || null, function (o) {
			return e.forEach(function (r) {
				return wo(r, o)
			})
		})
		return (
			vh(
				function () {
					var o = oi.get(a)
					if (o) {
						var r = new Set(o),
							n = new Set(e),
							s = a.current
						;(r.forEach(function (l) {
							n.has(l) || wo(l, null)
						}),
							n.forEach(function (l) {
								r.has(l) || wo(l, s)
							}))
					}
					oi.set(a, e)
				},
				[e]
			),
			a
		)
	}
	var vh,
		oi,
		ri = y(() => {
			K()
			ei()
			ai()
			;((vh = typeof window < 'u' ? lt : B), (oi = new WeakMap()))
		})
	var ni = y(() => {
		ri()
	})
	function Lh(e) {
		return e
	}
	function Ch(e, t) {
		t === void 0 && (t = Lh)
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
					var s = t(n, o)
					return (
						a.push(s),
						function () {
							a = a.filter(function (l) {
								return l !== s
							})
						}
					)
				},
				assignSyncMedium: function (n) {
					for (o = !0; a.length; ) {
						var s = a
						;((a = []), s.forEach(n))
					}
					a = {
						push: function (l) {
							return n(l)
						},
						filter: function () {
							return a
						}
					}
				},
				assignMedium: function (n) {
					o = !0
					var s = []
					if (a.length) {
						var l = a
						;((a = []), l.forEach(n), (s = a))
					}
					var i = function () {
							var u = s
							;((s = []), u.forEach(n))
						},
						d = function () {
							return Promise.resolve().then(i)
						}
					;(d(),
						(a = {
							push: function (u) {
								;(s.push(u), d())
							},
							filter: function (u) {
								return ((s = s.filter(u)), a)
							}
						}))
				}
			}
		return r
	}
	function Qr(e) {
		e === void 0 && (e = {})
		var t = Ch(null)
		return ((t.options = De({ async: !0, ssr: !1 }, e)), t)
	}
	var si = y(() => {
		ha()
	})
	function en(e, t) {
		return (e.useMedium(t), li)
	}
	var li,
		ii = y(() => {
			ha()
			K()
			li = function (e) {
				var t = e.sideCar,
					a = Io(e, ['sideCar'])
				if (!t) throw new Error('Sidecar: please provide `sideCar` property to import the right car')
				var o = t.read()
				if (!o) throw new Error('Sidecar medium not found')
				return ge(o, De({}, a))
			}
			li.isSideCarExport = !0
		})
	var tn = y(() => {
		si()
		ii()
	})
	var yo,
		an = y(() => {
			tn()
			yo = Qr()
		})
	var on,
		_a,
		ui = y(() => {
			ha()
			K()
			So()
			ni()
			an()
			;((on = function () {}),
				(_a = R(function (e, t) {
					var a = D(null),
						o = M({ onScrollCapture: on, onWheelCapture: on, onTouchMoveCapture: on }),
						r = o[0],
						n = o[1],
						s = e.forwardProps,
						l = e.children,
						i = e.className,
						d = e.removeScrollBar,
						u = e.enabled,
						f = e.shards,
						m = e.sideCar,
						g = e.noRelative,
						h = e.noIsolation,
						p = e.inert,
						x = e.allowPinchZoom,
						v = e.as,
						L = v === void 0 ? 'div' : v,
						C = e.gapMode,
						b = Io(e, [
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
						P = Zr([a, t]),
						k = De(De({}, b), r)
					return ge(
						$e,
						null,
						u &&
							ge(I, {
								sideCar: yo,
								removeScrollBar: d,
								shards: f,
								noRelative: g,
								noIsolation: h,
								inert: p,
								setCallbacks: n,
								allowPinchZoom: !!x,
								lockRef: a,
								gapMode: C
							}),
						s ? st(Ke.only(l), De(De({}, k), { ref: P })) : ge(L, De({}, k, { className: i, ref: P }), l)
					)
				})))
			_a.defaultProps = { enabled: !0, removeScrollBar: !0, inert: !1 }
			_a.classNames = { fullWidth: qt, zeroRight: Ht }
		})
	var di,
		ci,
		fi = y(() => {
			ci = function () {
				if (di) return di
				if (typeof __webpack_nonce__ < 'u') return __webpack_nonce__
			}
		})
	function bh() {
		if (!document) return null
		var e = document.createElement('style')
		e.type = 'text/css'
		var t = ci()
		return (t && e.setAttribute('nonce', t), e)
	}
	function Ih(e, t) {
		e.styleSheet ? (e.styleSheet.cssText = t) : e.appendChild(document.createTextNode(t))
	}
	function Sh(e) {
		var t = document.head || document.getElementsByTagName('head')[0]
		t.appendChild(e)
	}
	var rn,
		nn = y(() => {
			fi()
			rn = function () {
				var e = 0,
					t = null
				return {
					add: function (a) {
						;(e == 0 && (t = bh()) && (Ih(t, a), Sh(t)), e++)
					},
					remove: function () {
						;(e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), (t = null)))
					}
				}
			}
		})
	var sn,
		ln = y(() => {
			K()
			nn()
			sn = function () {
				var e = rn()
				return function (t, a) {
					B(
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
	var Ha,
		pi = y(() => {
			ln()
			Ha = function () {
				var e = sn(),
					t = function (a) {
						var o = a.styles,
							r = a.dynamic
						return (e(o, r), null)
					}
				return t
			}
		})
	var un = y(() => {
		pi()
		nn()
		ln()
	})
	var wh,
		dn,
		yh,
		cn,
		fn = y(() => {
			;((wh = { left: 0, top: 0, right: 0, gap: 0 }),
				(dn = function (e) {
					return parseInt(e || '', 10) || 0
				}),
				(yh = function (e) {
					var t = window.getComputedStyle(document.body),
						a = t[e === 'padding' ? 'paddingLeft' : 'marginLeft'],
						o = t[e === 'padding' ? 'paddingTop' : 'marginTop'],
						r = t[e === 'padding' ? 'paddingRight' : 'marginRight']
					return [dn(a), dn(o), dn(r)]
				}),
				(cn = function (e) {
					if ((e === void 0 && (e = 'margin'), typeof window > 'u')) return wh
					var t = yh(e),
						a = document.documentElement.clientWidth,
						o = window.innerWidth
					return { left: t[0], top: t[1], right: t[2], gap: Math.max(0, o - a + t[2] - t[0]) }
				}))
		})
	var Rh,
		ga,
		Ph,
		mi,
		kh,
		pn,
		hi = y(() => {
			K()
			un()
			So()
			fn()
			;((Rh = Ha()),
				(ga = 'data-scroll-locked'),
				(Ph = function (e, t, a, o) {
					var r = e.left,
						n = e.top,
						s = e.right,
						l = e.gap
					return (
						a === void 0 && (a = 'margin'),
						`
  .`
							.concat(
								Jr,
								` {
   overflow: hidden `
							)
							.concat(
								o,
								`;
   padding-right: `
							)
							.concat(l, 'px ')
							.concat(
								o,
								`;
  }
  body[`
							)
							.concat(
								ga,
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
												s,
												`px;
    margin-left:0;
    margin-top:0;
    margin-right: `
											)
											.concat(l, 'px ')
											.concat(
												o,
												`;
    `
											),
									a === 'padding' && 'padding-right: '.concat(l, 'px ').concat(o, ';')
								]
									.filter(Boolean)
									.join(''),
								`
  }

  .`
							)
							.concat(
								Ht,
								` {
    right: `
							)
							.concat(l, 'px ')
							.concat(
								o,
								`;
  }

  .`
							)
							.concat(
								qt,
								` {
    margin-right: `
							)
							.concat(l, 'px ')
							.concat(
								o,
								`;
  }

  .`
							)
							.concat(Ht, ' .')
							.concat(
								Ht,
								` {
    right: 0 `
							)
							.concat(
								o,
								`;
  }

  .`
							)
							.concat(qt, ' .')
							.concat(
								qt,
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
								ga,
								`] {
    `
							)
							.concat(Yr, ': ')
							.concat(
								l,
								`px;
  }
`
							)
					)
				}),
				(mi = function () {
					var e = parseInt(document.body.getAttribute(ga) || '0', 10)
					return isFinite(e) ? e : 0
				}),
				(kh = function () {
					B(function () {
						return (
							document.body.setAttribute(ga, (mi() + 1).toString()),
							function () {
								var e = mi() - 1
								e <= 0
									? document.body.removeAttribute(ga)
									: document.body.setAttribute(ga, e.toString())
							}
						)
					}, [])
				}),
				(pn = function (e) {
					var t = e.noRelative,
						a = e.noImportant,
						o = e.gapMode,
						r = o === void 0 ? 'margin' : o
					kh()
					var n = de(
						function () {
							return cn(r)
						},
						[r]
					)
					return ge(Rh, { styles: Ph(n, !t, r, a ? '' : '!important') })
				}))
		})
	var gi = y(() => {
		hi()
		So()
		fn()
	})
	var mn,
		qa,
		Ut,
		xi = y(() => {
			mn = !1
			if (typeof window < 'u')
				try {
					;((qa = Object.defineProperty({}, 'passive', {
						get: function () {
							return ((mn = !0), !0)
						}
					})),
						window.addEventListener('test', qa, qa),
						window.removeEventListener('test', qa, qa))
				} catch {
					mn = !1
				}
			Ut = mn ? { passive: !1 } : !1
		})
	var Th,
		vi,
		Ah,
		Dh,
		hn,
		Mh,
		Eh,
		Li,
		Ci,
		Oh,
		bi,
		Ii = y(() => {
			;((Th = function (e) {
				return e.tagName === 'TEXTAREA'
			}),
				(vi = function (e, t) {
					if (!(e instanceof Element)) return !1
					var a = window.getComputedStyle(e)
					return a[t] !== 'hidden' && !(a.overflowY === a.overflowX && !Th(e) && a[t] === 'visible')
				}),
				(Ah = function (e) {
					return vi(e, 'overflowY')
				}),
				(Dh = function (e) {
					return vi(e, 'overflowX')
				}),
				(hn = function (e, t) {
					var a = t.ownerDocument,
						o = t
					do {
						typeof ShadowRoot < 'u' && o instanceof ShadowRoot && (o = o.host)
						var r = Li(e, o)
						if (r) {
							var n = Ci(e, o),
								s = n[1],
								l = n[2]
							if (s > l) return !0
						}
						o = o.parentNode
					} while (o && o !== a.body)
					return !1
				}),
				(Mh = function (e) {
					var t = e.scrollTop,
						a = e.scrollHeight,
						o = e.clientHeight
					return [t, a, o]
				}),
				(Eh = function (e) {
					var t = e.scrollLeft,
						a = e.scrollWidth,
						o = e.clientWidth
					return [t, a, o]
				}),
				(Li = function (e, t) {
					return e === 'v' ? Ah(t) : Dh(t)
				}),
				(Ci = function (e, t) {
					return e === 'v' ? Mh(t) : Eh(t)
				}),
				(Oh = function (e, t) {
					return e === 'h' && t === 'rtl' ? -1 : 1
				}),
				(bi = function (e, t, a, o, r) {
					var n = Oh(e, window.getComputedStyle(t).direction),
						s = n * o,
						l = a.target,
						i = t.contains(l),
						d = !1,
						u = s > 0,
						f = 0,
						m = 0
					do {
						if (!l) break
						var g = Ci(e, l),
							h = g[0],
							p = g[1],
							x = g[2],
							v = p - x - n * h
						;(h || v) && Li(e, l) && ((f += v), (m += h))
						var L = l.parentNode
						l = L && L.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? L.host : L
					} while ((!i && l !== document.body) || (i && (t.contains(l) || t === l)))
					return (
						((u && ((r && Math.abs(f) < 1) || (!r && s > f))) ||
							(!u && ((r && Math.abs(m) < 1) || (!r && -s > m)))) &&
							(d = !0),
						d
					)
				}))
		})
	function yi(e) {
		var t = D([]),
			a = D([0, 0]),
			o = D(),
			r = M(Nh++)[0],
			n = M(Ha)[0],
			s = D(e)
		;(B(
			function () {
				s.current = e
			},
			[e]
		),
			B(
				function () {
					if (e.inert) {
						document.body.classList.add('block-interactivity-'.concat(r))
						var p = Ql([e.lockRef.current], (e.shards || []).map(wi), !0).filter(Boolean)
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
		var l = q(function (p, x) {
				if (('touches' in p && p.touches.length === 2) || (p.type === 'wheel' && p.ctrlKey))
					return !s.current.allowPinchZoom
				var v = Ro(p),
					L = a.current,
					C = 'deltaX' in p ? p.deltaX : L[0] - v[0],
					b = 'deltaY' in p ? p.deltaY : L[1] - v[1],
					I,
					P = p.target,
					k = Math.abs(C) > Math.abs(b) ? 'h' : 'v'
				if ('touches' in p && k === 'h' && P.type === 'range') return !1
				var w = window.getSelection(),
					E = w && w.anchorNode,
					U = E ? E === P || E.contains(P) : !1
				if (U) return !1
				var S = hn(k, P)
				if (!S) return !0
				if ((S ? (I = k) : ((I = k === 'v' ? 'h' : 'v'), (S = hn(k, P))), !S)) return !1
				if ((!o.current && 'changedTouches' in p && (C || b) && (o.current = I), !I)) return !0
				var T = o.current || I
				return bi(T, x, p, T === 'h' ? C : b, !0)
			}, []),
			i = q(function (p) {
				var x = p
				if (!(!xa.length || xa[xa.length - 1] !== n)) {
					var v = 'deltaY' in x ? Si(x) : Ro(x),
						L = t.current.filter(function (I) {
							return (
								I.name === x.type &&
								(I.target === x.target || x.target === I.shadowParent) &&
								Bh(I.delta, v)
							)
						})[0]
					if (L && L.should) {
						x.cancelable && x.preventDefault()
						return
					}
					if (!L) {
						var C = (s.current.shards || [])
								.map(wi)
								.filter(Boolean)
								.filter(function (I) {
									return I.contains(x.target)
								}),
							b = C.length > 0 ? l(x, C[0]) : !s.current.noIsolation
						b && x.cancelable && x.preventDefault()
					}
				}
			}, []),
			d = q(function (p, x, v, L) {
				var C = { name: p, delta: x, target: v, should: L, shadowParent: zh(v) }
				;(t.current.push(C),
					setTimeout(function () {
						t.current = t.current.filter(function (b) {
							return b !== C
						})
					}, 1))
			}, []),
			u = q(function (p) {
				;((a.current = Ro(p)), (o.current = void 0))
			}, []),
			f = q(function (p) {
				d(p.type, Si(p), p.target, l(p, e.lockRef.current))
			}, []),
			m = q(function (p) {
				d(p.type, Ro(p), p.target, l(p, e.lockRef.current))
			}, [])
		B(function () {
			return (
				xa.push(n),
				e.setCallbacks({ onScrollCapture: f, onWheelCapture: f, onTouchMoveCapture: m }),
				document.addEventListener('wheel', i, Ut),
				document.addEventListener('touchmove', i, Ut),
				document.addEventListener('touchstart', u, Ut),
				function () {
					;((xa = xa.filter(function (p) {
						return p !== n
					})),
						document.removeEventListener('wheel', i, Ut),
						document.removeEventListener('touchmove', i, Ut),
						document.removeEventListener('touchstart', u, Ut))
				}
			)
		}, [])
		var g = e.removeScrollBar,
			h = e.inert
		return ge(
			$e,
			null,
			h ? ge(n, { styles: Fh(r) }) : null,
			g ? ge(pn, { noRelative: e.noRelative, gapMode: e.gapMode }) : null
		)
	}
	function zh(e) {
		for (var t = null; e !== null; ) (e instanceof ShadowRoot && ((t = e.host), (e = e.host)), (e = e.parentNode))
		return t
	}
	var Ro,
		Si,
		wi,
		Bh,
		Fh,
		Nh,
		xa,
		Ri = y(() => {
			ha()
			K()
			gi()
			un()
			xi()
			Ii()
			;((Ro = function (e) {
				return 'changedTouches' in e ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY] : [0, 0]
			}),
				(Si = function (e) {
					return [e.deltaX, e.deltaY]
				}),
				(wi = function (e) {
					return e && 'current' in e ? e.current : e
				}),
				(Bh = function (e, t) {
					return e[0] === t[0] && e[1] === t[1]
				}),
				(Fh = function (e) {
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
				(Nh = 0),
				(xa = []))
		})
	var Pi,
		ki = y(() => {
			tn()
			Ri()
			an()
			Pi = en(yo, yi)
		})
	var Ti,
		Ua,
		Ai = y(() => {
			ha()
			K()
			ui()
			ki()
			Ti = R(function (e, t) {
				return ge(_a, De({}, e, { ref: t, sideCar: Pi }))
			})
			Ti.classNames = _a.classNames
			Ua = Ti
		})
	var gn = y(() => {
		Ai()
	})
	var _h,
		va,
		Po,
		ko,
		xn,
		Di,
		Hh,
		qh,
		To,
		vn = y(() => {
			;((_h = function (e) {
				if (typeof document > 'u') return null
				var t = Array.isArray(e) ? e[0] : e
				return t.ownerDocument.body
			}),
				(va = new WeakMap()),
				(Po = new WeakMap()),
				(ko = {}),
				(xn = 0),
				(Di = function (e) {
					return e && (e.host || Di(e.parentNode))
				}),
				(Hh = function (e, t) {
					return t
						.map(function (a) {
							if (e.contains(a)) return a
							var o = Di(a)
							return o && e.contains(o)
								? o
								: (console.error('aria-hidden', a, 'in not contained inside', e, '. Doing nothing'),
									null)
						})
						.filter(function (a) {
							return !!a
						})
				}),
				(qh = function (e, t, a, o) {
					var r = Hh(t, Array.isArray(e) ? e : [e])
					ko[a] || (ko[a] = new WeakMap())
					var n = ko[a],
						s = [],
						l = new Set(),
						i = new Set(r),
						d = function (f) {
							!f || l.has(f) || (l.add(f), d(f.parentNode))
						}
					r.forEach(d)
					var u = function (f) {
						!f ||
							i.has(f) ||
							Array.prototype.forEach.call(f.children, function (m) {
								if (l.has(m)) u(m)
								else
									try {
										var g = m.getAttribute(o),
											h = g !== null && g !== 'false',
											p = (va.get(m) || 0) + 1,
											x = (n.get(m) || 0) + 1
										;(va.set(m, p),
											n.set(m, x),
											s.push(m),
											p === 1 && h && Po.set(m, !0),
											x === 1 && m.setAttribute(a, 'true'),
											h || m.setAttribute(o, 'true'))
									} catch (v) {
										console.error('aria-hidden: cannot operate on ', m, v)
									}
							})
					}
					return (
						u(t),
						l.clear(),
						xn++,
						function () {
							;(s.forEach(function (f) {
								var m = va.get(f) - 1,
									g = n.get(f) - 1
								;(va.set(f, m),
									n.set(f, g),
									m || (Po.has(f) || f.removeAttribute(o), Po.delete(f)),
									g || f.removeAttribute(a))
							}),
								xn--,
								xn || ((va = new WeakMap()), (va = new WeakMap()), (Po = new WeakMap()), (ko = {})))
						}
					)
				}),
				(To = function (e, t, a) {
					a === void 0 && (a = 'data-aria-hidden')
					var o = Array.from(Array.isArray(e) ? e : [e]),
						r = t || _h(e)
					return r
						? (o.push.apply(o, Array.from(r.querySelectorAll('[aria-live], script'))),
							qh(o, r, a, 'aria-hidden'))
						: function () {
								return null
							}
				}))
		})
	var Rt = {}
	Lt(Rt, {
		Close: () => Va,
		Content: () => No,
		Description: () => _o,
		Dialog: () => Eo,
		DialogClose: () => Va,
		DialogContent: () => No,
		DialogDescription: () => _o,
		DialogOverlay: () => Fo,
		DialogPortal: () => Bo,
		DialogTitle: () => zo,
		DialogTrigger: () => Oo,
		Overlay: () => Fo,
		Portal: () => Bo,
		Root: () => Eo,
		Title: () => zo,
		Trigger: () => Oo,
		WarningProvider: () => Kh,
		createDialogScope: () => Mo
	})
	function Cn(e) {
		return e ? 'open' : 'closed'
	}
	var Do,
		Mi,
		Mo,
		Uh,
		Ve,
		Eo,
		Ei,
		Oo,
		Ln,
		Vh,
		Oi,
		Bo,
		Ao,
		Fo,
		Gh,
		Wh,
		La,
		No,
		jh,
		Xh,
		Bi,
		Fi,
		zo,
		Ni,
		_o,
		zi,
		Va,
		Kh,
		Ho = y(() => {
			'use client'
			K()
			ut()
			Fe()
			Ye()
			pa()
			ca()
			vo()
			Kr()
			Lo()
			fa()
			Oe()
			$r()
			gn()
			vn()
			Nt()
			O()
			;((Do = 'Dialog'),
				([Mi, Mo] = be(Do)),
				([Uh, Ve] = Mi(Do)),
				(Eo = (e) => {
					let { __scopeDialog: t, children: a, open: o, defaultOpen: r, onOpenChange: n, modal: s = !0 } = e,
						l = D(null),
						i = D(null),
						[d, u] = Ue({ prop: o, defaultProp: r ?? !1, onChange: n, caller: Do })
					return c(Uh, {
						scope: t,
						triggerRef: l,
						contentRef: i,
						contentId: Ae(),
						titleId: Ae(),
						descriptionId: Ae(),
						open: d,
						onOpenChange: u,
						onOpenToggle: q(() => u((f) => !f), [u]),
						modal: s,
						children: a
					})
				}))
			Eo.displayName = Do
			;((Ei = 'DialogTrigger'),
				(Oo = R((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = Ve(Ei, a),
						n = Z(t, r.triggerRef)
					return c(J.button, {
						type: 'button',
						'aria-haspopup': 'dialog',
						'aria-expanded': r.open,
						'aria-controls': r.open ? r.contentId : void 0,
						'data-state': Cn(r.open),
						...o,
						ref: n,
						onClick: X(e.onClick, r.onOpenToggle)
					})
				})))
			Oo.displayName = Ei
			;((Ln = 'DialogPortal'),
				([Vh, Oi] = Mi(Ln, { forceMount: void 0 })),
				(Bo = (e) => {
					let { __scopeDialog: t, forceMount: a, children: o, container: r } = e,
						n = Ve(Ln, t)
					return c(Vh, {
						scope: t,
						forceMount: a,
						children: Ke.map(o, (s) =>
							c(Se, { present: a || n.open, children: c(_t, { asChild: !0, container: r, children: s }) })
						)
					})
				}))
			Bo.displayName = Ln
			;((Ao = 'DialogOverlay'),
				(Fo = R((e, t) => {
					let a = Oi(Ao, e.__scopeDialog),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = Ve(Ao, e.__scopeDialog)
					return n.modal ? c(Se, { present: o || n.open, children: c(Wh, { ...r, ref: t }) }) : null
				})))
			Fo.displayName = Ao
			;((Gh = qe('DialogOverlay.RemoveScroll')),
				(Wh = R((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = Ve(Ao, a),
						n = Wl(),
						s = Z(t, n)
					return c(Ua, {
						as: Gh,
						allowPinchZoom: !0,
						shards: [r.contentRef],
						children: c(J.div, {
							'data-state': Cn(r.open),
							...o,
							ref: s,
							style: { pointerEvents: 'auto', ...o.style }
						})
					})
				})),
				(La = 'DialogContent'),
				(No = R((e, t) => {
					let a = Oi(La, e.__scopeDialog),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = Ve(La, e.__scopeDialog)
					return c(Se, {
						present: o || n.open,
						children: n.modal ? c(jh, { ...r, ref: t }) : c(Xh, { ...r, ref: t })
					})
				})))
			No.displayName = La
			;((jh = R((e, t) => {
				let a = Ve(La, e.__scopeDialog),
					o = D(null),
					r = Z(t, a.contentRef, o)
				return (
					B(() => {
						let n = o.current
						if (n) return To(n)
					}, []),
					c(Bi, {
						...e,
						ref: r,
						trapFocus: a.open,
						disableOutsidePointerEvents: a.open,
						onCloseAutoFocus: X(e.onCloseAutoFocus, (n) => {
							;(n.preventDefault(), a.triggerRef.current?.focus())
						}),
						onPointerDownOutside: X(e.onPointerDownOutside, (n) => {
							let s = n.detail.originalEvent,
								l = s.button === 0 && s.ctrlKey === !0
							;(s.button === 2 || l) && n.preventDefault()
						}),
						onFocusOutside: X(e.onFocusOutside, (n) => n.preventDefault())
					})
				)
			})),
				(Xh = R((e, t) => {
					let a = Ve(La, e.__scopeDialog),
						o = D(!1),
						r = D(!1)
					return c(Bi, {
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
							let s = n.target
							;(a.triggerRef.current?.contains(s) && n.preventDefault(),
								n.detail.originalEvent.type === 'focusin' && r.current && n.preventDefault())
						}
					})
				})),
				(Bi = R((e, t) => {
					let { __scopeDialog: a, trapFocus: o, onOpenAutoFocus: r, onCloseAutoFocus: n, ...s } = e,
						l = Ve(La, a)
					return (
						bo(),
						c(Je, {
							children: c(za, {
								asChild: !0,
								loop: !0,
								trapped: o,
								onMountAutoFocus: r,
								onUnmountAutoFocus: n,
								children: c(zt, {
									role: 'dialog',
									id: l.contentId,
									'aria-describedby': l.descriptionId,
									'aria-labelledby': l.titleId,
									'data-state': Cn(l.open),
									...s,
									ref: t,
									deferPointerDownOutside: !0,
									onDismiss: () => l.onOpenChange(!1)
								})
							})
						})
					)
				})),
				(Fi = 'DialogTitle'),
				(zo = R((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = Ve(Fi, a)
					return c(J.h2, { id: r.titleId, ...o, ref: t })
				})))
			zo.displayName = Fi
			;((Ni = 'DialogDescription'),
				(_o = R((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = Ve(Ni, a)
					return c(J.p, { id: r.descriptionId, ...o, ref: t })
				})))
			_o.displayName = Ni
			;((zi = 'DialogClose'),
				(Va = R((e, t) => {
					let { __scopeDialog: a, ...o } = e,
						r = Ve(zi, a)
					return c(J.button, {
						type: 'button',
						...o,
						ref: t,
						onClick: X(e.onClick, () => r.onOpenChange(!1))
					})
				})))
			Va.displayName = zi
			Kh = (e) => e.children
		})
	var Ca = {}
	Lt(Ca, {
		Action: () => dg,
		AlertDialog: () => bn,
		AlertDialogAction: () => kn,
		AlertDialogCancel: () => Tn,
		AlertDialogContent: () => yn,
		AlertDialogDescription: () => Pn,
		AlertDialogOverlay: () => wn,
		AlertDialogPortal: () => Sn,
		AlertDialogTitle: () => Rn,
		AlertDialogTrigger: () => In,
		Cancel: () => cg,
		Content: () => ug,
		Description: () => pg,
		Overlay: () => ig,
		Portal: () => lg,
		Root: () => ng,
		Title: () => fg,
		Trigger: () => sg,
		createAlertDialogScope: () => Jh
	})
	var _i,
		$h,
		Jh,
		ct,
		bn,
		Yh,
		In,
		Zh,
		Sn,
		Qh,
		wn,
		Hi,
		eg,
		tg,
		yn,
		ag,
		Rn,
		og,
		Pn,
		rg,
		kn,
		qi,
		Tn,
		ng,
		sg,
		lg,
		ig,
		ug,
		dg,
		cg,
		fg,
		pg,
		Ui = y(() => {
			'use client'
			K()
			Ye()
			Fe()
			Ho()
			Ho()
			ut()
			O()
			;((_i = 'AlertDialog'),
				([$h, Jh] = be(_i, [Mo])),
				(ct = Mo()),
				(bn = (e) => {
					let { __scopeAlertDialog: t, ...a } = e,
						o = ct(t)
					return c(Eo, { ...o, ...a, modal: !0 })
				}))
			bn.displayName = _i
			;((Yh = 'AlertDialogTrigger'),
				(In = R((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = ct(a)
					return c(Oo, { ...r, ...o, ref: t })
				})))
			In.displayName = Yh
			;((Zh = 'AlertDialogPortal'),
				(Sn = (e) => {
					let { __scopeAlertDialog: t, ...a } = e,
						o = ct(t)
					return c(Bo, { ...o, ...a })
				}))
			Sn.displayName = Zh
			;((Qh = 'AlertDialogOverlay'),
				(wn = R((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = ct(a)
					return c(Fo, { ...r, ...o, ref: t })
				})))
			wn.displayName = Qh
			;((Hi = 'AlertDialogContent'),
				([eg, tg] = $h(Hi)),
				(yn = R((e, t) => {
					let { __scopeAlertDialog: a, children: o, ...r } = e,
						n = ct(a),
						s = D(null),
						l = Z(t, s),
						i = D(null)
					return c(eg, {
						scope: a,
						cancelRef: i,
						children: c(No, {
							role: 'alertdialog',
							...n,
							...r,
							ref: l,
							onOpenAutoFocus: X(r.onOpenAutoFocus, (d) => {
								;(d.preventDefault(), i.current?.focus({ preventScroll: !0 }))
							}),
							onPointerDownOutside: (d) => d.preventDefault(),
							onInteractOutside: (d) => d.preventDefault(),
							children: o
						})
					})
				})))
			yn.displayName = Hi
			;((ag = 'AlertDialogTitle'),
				(Rn = R((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = ct(a)
					return c(zo, { ...r, ...o, ref: t })
				})))
			Rn.displayName = ag
			;((og = 'AlertDialogDescription'),
				(Pn = R((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = ct(a)
					return c(_o, { ...r, ...o, ref: t })
				})))
			Pn.displayName = og
			;((rg = 'AlertDialogAction'),
				(kn = R((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						r = ct(a)
					return c(Va, { ...r, ...o, ref: t })
				})))
			kn.displayName = rg
			;((qi = 'AlertDialogCancel'),
				(Tn = R((e, t) => {
					let { __scopeAlertDialog: a, ...o } = e,
						{ cancelRef: r } = tg(qi, a),
						n = ct(a),
						s = Z(t, r)
					return c(Va, { ...n, ...o, ref: s })
				})))
			Tn.displayName = qi
			;((ng = bn), (sg = In), (lg = Sn), (ig = wn), (ug = yn), (dg = kn), (cg = Tn), (fg = Rn), (pg = Pn))
		})
	function Vi(e) {
		let t = D({ value: e, previous: e })
		return de(
			() => (
				t.current.value !== e && ((t.current.previous = t.current.value), (t.current.value = e)),
				t.current.previous
			),
			[e]
		)
	}
	var Gi = y(() => {
		K()
	})
	function Wi(e) {
		let [t, a] = M(void 0)
		return (
			ce(() => {
				if (e) {
					a({ width: e.offsetWidth, height: e.offsetHeight })
					let o = new ResizeObserver((r) => {
						if (!Array.isArray(r) || !r.length) return
						let n = r[0],
							s,
							l
						if ('borderBoxSize' in n) {
							let i = n.borderBoxSize,
								d = Array.isArray(i) ? i[0] : i
							;((s = d.inlineSize), (l = d.blockSize))
						} else ((s = e.offsetWidth), (l = e.offsetHeight))
						a({ width: s, height: l })
					})
					return (o.observe(e, { box: 'border-box' }), () => o.unobserve(e))
				} else a(void 0)
			}, [e]),
			t
		)
	}
	var ji = y(() => {
		K()
		dt()
	})
	function Uo(e, t, a) {
		return Pe(e, Ze(t, a))
	}
	function Qe(e, t) {
		return typeof e == 'function' ? e(t) : e
	}
	function et(e) {
		return e.split('-')[0]
	}
	function Vt(e) {
		return e.split('-')[1]
	}
	function Vo(e) {
		return e === 'x' ? 'y' : 'x'
	}
	function Go(e) {
		return e === 'y' ? 'height' : 'width'
	}
	function We(e) {
		let t = e[0]
		return t === 't' || t === 'b' ? 'y' : 'x'
	}
	function Wo(e) {
		return Vo(We(e))
	}
	function Ji(e, t, a) {
		a === void 0 && (a = !1)
		let o = Vt(e),
			r = Wo(e),
			n = Go(r),
			s = r === 'x' ? (o === (a ? 'end' : 'start') ? 'right' : 'left') : o === 'start' ? 'bottom' : 'top'
		return (t.reference[n] > t.floating[n] && (s = Ga(s)), [s, Ga(s)])
	}
	function Yi(e) {
		let t = Ga(e)
		return [qo(e), t, qo(t)]
	}
	function qo(e) {
		return e.includes('start') ? e.replace('start', 'end') : e.replace('end', 'start')
	}
	function xg(e, t, a) {
		switch (e) {
			case 'top':
			case 'bottom':
				return a ? (t ? Ki : Xi) : t ? Xi : Ki
			case 'left':
			case 'right':
				return t ? hg : gg
			default:
				return []
		}
	}
	function Zi(e, t, a, o) {
		let r = Vt(e),
			n = xg(et(e), a === 'start', o)
		return (r && ((n = n.map((s) => s + '-' + r)), t && (n = n.concat(n.map(qo)))), n)
	}
	function Ga(e) {
		let t = et(e)
		return mg[t] + e.slice(t.length)
	}
	function vg(e) {
		return { top: 0, right: 0, bottom: 0, left: 0, ...e }
	}
	function An(e) {
		return typeof e != 'number' ? vg(e) : { top: e, right: e, bottom: e, left: e }
	}
	function Gt(e) {
		let { x: t, y: a, width: o, height: r } = e
		return { width: o, height: r, top: a, left: t, right: t + o, bottom: a + r, x: t, y: a }
	}
	var $i,
		Ze,
		Pe,
		Wa,
		ja,
		Ge,
		mg,
		Xi,
		Ki,
		hg,
		gg,
		jo = y(() => {
			;(($i = ['top', 'right', 'bottom', 'left']),
				(Ze = Math.min),
				(Pe = Math.max),
				(Wa = Math.round),
				(ja = Math.floor),
				(Ge = (e) => ({ x: e, y: e })),
				(mg = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' }))
			;((Xi = ['left', 'right']), (Ki = ['right', 'left']), (hg = ['top', 'bottom']), (gg = ['bottom', 'top']))
		})
	function Qi(e, t, a) {
		let { reference: o, floating: r } = e,
			n = We(t),
			s = Wo(t),
			l = Go(s),
			i = et(t),
			d = n === 'y',
			u = o.x + o.width / 2 - r.width / 2,
			f = o.y + o.height / 2 - r.height / 2,
			m = o[l] / 2 - r[l] / 2,
			g
		switch (i) {
			case 'top':
				g = { x: u, y: o.y - r.height }
				break
			case 'bottom':
				g = { x: u, y: o.y + o.height }
				break
			case 'right':
				g = { x: o.x + o.width, y: f }
				break
			case 'left':
				g = { x: o.x - r.width, y: f }
				break
			default:
				g = { x: o.x, y: o.y }
		}
		switch (Vt(t)) {
			case 'start':
				g[s] -= m * (a && d ? -1 : 1)
				break
			case 'end':
				g[s] += m * (a && d ? -1 : 1)
				break
		}
		return g
	}
	async function au(e, t) {
		var a
		t === void 0 && (t = {})
		let { x: o, y: r, platform: n, rects: s, elements: l, strategy: i } = e,
			{
				boundary: d = 'clippingAncestors',
				rootBoundary: u = 'viewport',
				elementContext: f = 'floating',
				altBoundary: m = !1,
				padding: g = 0
			} = Qe(t, e),
			h = An(g),
			x = l[m ? (f === 'floating' ? 'reference' : 'floating') : f],
			v = Gt(
				await n.getClippingRect({
					element:
						(a = await (n.isElement == null ? void 0 : n.isElement(x))) == null || a
							? x
							: x.contextElement ||
								(await (n.getDocumentElement == null ? void 0 : n.getDocumentElement(l.floating))),
					boundary: d,
					rootBoundary: u,
					strategy: i
				})
			),
			L = f === 'floating' ? { x: o, y: r, width: s.floating.width, height: s.floating.height } : s.reference,
			C = await (n.getOffsetParent == null ? void 0 : n.getOffsetParent(l.floating)),
			b = (await (n.isElement == null ? void 0 : n.isElement(C)))
				? (await (n.getScale == null ? void 0 : n.getScale(C))) || { x: 1, y: 1 }
				: { x: 1, y: 1 },
			I = Gt(
				n.convertOffsetParentRelativeRectToViewportRelativeRect
					? await n.convertOffsetParentRelativeRectToViewportRelativeRect({
							elements: l,
							rect: L,
							offsetParent: C,
							strategy: i
						})
					: L
			)
		return {
			top: (v.top - I.top + h.top) / b.y,
			bottom: (I.bottom - v.bottom + h.bottom) / b.y,
			left: (v.left - I.left + h.left) / b.x,
			right: (I.right - v.right + h.right) / b.x
		}
	}
	function eu(e, t) {
		return { top: e.top - t.height, right: e.right - t.width, bottom: e.bottom - t.height, left: e.left - t.width }
	}
	function tu(e) {
		return $i.some((t) => e[t] >= 0)
	}
	async function Cg(e, t) {
		let { placement: a, platform: o, elements: r } = e,
			n = await (o.isRTL == null ? void 0 : o.isRTL(r.floating)),
			s = et(a),
			l = Vt(a),
			i = We(a) === 'y',
			d = lu.has(s) ? -1 : 1,
			u = n && i ? -1 : 1,
			f = Qe(t, e),
			{
				mainAxis: m,
				crossAxis: g,
				alignmentAxis: h
			} = typeof f == 'number'
				? { mainAxis: f, crossAxis: 0, alignmentAxis: null }
				: { mainAxis: f.mainAxis || 0, crossAxis: f.crossAxis || 0, alignmentAxis: f.alignmentAxis }
		return (
			l && typeof h == 'number' && (g = l === 'end' ? h * -1 : h),
			i ? { x: g * u, y: m * d } : { x: m * d, y: g * u }
		)
	}
	var Lg,
		ou,
		ru,
		nu,
		su,
		lu,
		iu,
		uu,
		du,
		cu,
		fu = y(() => {
			jo()
			jo()
			;((Lg = 50),
				(ou = async (e, t, a) => {
					let { placement: o = 'bottom', strategy: r = 'absolute', middleware: n = [], platform: s } = a,
						l = s.detectOverflow ? s : { ...s, detectOverflow: au },
						i = await (s.isRTL == null ? void 0 : s.isRTL(t)),
						d = await s.getElementRects({ reference: e, floating: t, strategy: r }),
						{ x: u, y: f } = Qi(d, o, i),
						m = o,
						g = 0,
						h = {}
					for (let p = 0; p < n.length; p++) {
						let x = n[p]
						if (!x) continue
						let { name: v, fn: L } = x,
							{
								x: C,
								y: b,
								data: I,
								reset: P
							} = await L({
								x: u,
								y: f,
								initialPlacement: o,
								placement: m,
								strategy: r,
								middlewareData: h,
								rects: d,
								platform: l,
								elements: { reference: e, floating: t }
							})
						;((u = C ?? u),
							(f = b ?? f),
							(h[v] = { ...h[v], ...I }),
							P &&
								g < Lg &&
								(g++,
								typeof P == 'object' &&
									(P.placement && (m = P.placement),
									P.rects &&
										(d =
											P.rects === !0
												? await s.getElementRects({ reference: e, floating: t, strategy: r })
												: P.rects),
									({ x: u, y: f } = Qi(d, m, i))),
								(p = -1)))
					}
					return { x: u, y: f, placement: m, strategy: r, middlewareData: h }
				}),
				(ru = (e) => ({
					name: 'arrow',
					options: e,
					async fn(t) {
						let { x: a, y: o, placement: r, rects: n, platform: s, elements: l, middlewareData: i } = t,
							{ element: d, padding: u = 0 } = Qe(e, t) || {}
						if (d == null) return {}
						let f = An(u),
							m = { x: a, y: o },
							g = Wo(r),
							h = Go(g),
							p = await s.getDimensions(d),
							x = g === 'y',
							v = x ? 'top' : 'left',
							L = x ? 'bottom' : 'right',
							C = x ? 'clientHeight' : 'clientWidth',
							b = n.reference[h] + n.reference[g] - m[g] - n.floating[h],
							I = m[g] - n.reference[g],
							P = await (s.getOffsetParent == null ? void 0 : s.getOffsetParent(d)),
							k = P ? P[C] : 0
						;(!k || !(await (s.isElement == null ? void 0 : s.isElement(P)))) &&
							(k = l.floating[C] || n.floating[h])
						let w = b / 2 - I / 2,
							E = k / 2 - p[h] / 2 - 1,
							U = Ze(f[v], E),
							S = Ze(f[L], E),
							T = U,
							F = k - p[h] - S,
							N = k / 2 - p[h] / 2 + w,
							H = Uo(T, N, F),
							z =
								!i.arrow &&
								Vt(r) != null &&
								N !== H &&
								n.reference[h] / 2 - (N < T ? U : S) - p[h] / 2 < 0,
							$ = z ? (N < T ? N - T : N - F) : 0
						return {
							[g]: m[g] + $,
							data: { [g]: H, centerOffset: N - H - $, ...(z && { alignmentOffset: $ }) },
							reset: z
						}
					}
				})),
				(nu = function (e) {
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
										rects: s,
										initialPlacement: l,
										platform: i,
										elements: d
									} = t,
									{
										mainAxis: u = !0,
										crossAxis: f = !0,
										fallbackPlacements: m,
										fallbackStrategy: g = 'bestFit',
										fallbackAxisSideDirection: h = 'none',
										flipAlignment: p = !0,
										...x
									} = Qe(e, t)
								if ((a = n.arrow) != null && a.alignmentOffset) return {}
								let v = et(r),
									L = We(l),
									C = et(l) === l,
									b = await (i.isRTL == null ? void 0 : i.isRTL(d.floating)),
									I = m || (C || !p ? [Ga(l)] : Yi(l)),
									P = h !== 'none'
								!m && P && I.push(...Zi(l, p, h, b))
								let k = [l, ...I],
									w = await i.detectOverflow(t, x),
									E = [],
									U = ((o = n.flip) == null ? void 0 : o.overflows) || []
								if ((u && E.push(w[v]), f)) {
									let N = Ji(r, s, b)
									E.push(w[N[0]], w[N[1]])
								}
								if (((U = [...U, { placement: r, overflows: E }]), !E.every((N) => N <= 0))) {
									var S, T
									let N = (((S = n.flip) == null ? void 0 : S.index) || 0) + 1,
										H = k[N]
									if (
										H &&
										(!(f === 'alignment' ? L !== We(H) : !1) ||
											U.every((A) => (We(A.placement) === L ? A.overflows[0] > 0 : !0)))
									)
										return { data: { index: N, overflows: U }, reset: { placement: H } }
									let z =
										(T = U.filter(($) => $.overflows[0] <= 0).sort(
											($, A) => $.overflows[1] - A.overflows[1]
										)[0]) == null
											? void 0
											: T.placement
									if (!z)
										switch (g) {
											case 'bestFit': {
												var F
												let $ =
													(F = U.filter((A) => {
														if (P) {
															let Q = We(A.placement)
															return Q === L || Q === 'y'
														}
														return !0
													})
														.map((A) => [
															A.placement,
															A.overflows
																.filter((Q) => Q > 0)
																.reduce((Q, oe) => Q + oe, 0)
														])
														.sort((A, Q) => A[1] - Q[1])[0]) == null
														? void 0
														: F[0]
												$ && (z = $)
												break
											}
											case 'initialPlacement':
												z = l
												break
										}
									if (r !== z) return { reset: { placement: z } }
								}
								return {}
							}
						}
					)
				}))
			;((su = function (e) {
				return (
					e === void 0 && (e = {}),
					{
						name: 'hide',
						options: e,
						async fn(t) {
							let { rects: a, platform: o } = t,
								{ strategy: r = 'referenceHidden', ...n } = Qe(e, t)
							switch (r) {
								case 'referenceHidden': {
									let s = await o.detectOverflow(t, { ...n, elementContext: 'reference' }),
										l = eu(s, a.reference)
									return { data: { referenceHiddenOffsets: l, referenceHidden: tu(l) } }
								}
								case 'escaped': {
									let s = await o.detectOverflow(t, { ...n, altBoundary: !0 }),
										l = eu(s, a.floating)
									return { data: { escapedOffsets: l, escaped: tu(l) } }
								}
								default:
									return {}
							}
						}
					}
				)
			}),
				(lu = new Set(['left', 'top'])))
			;((iu = function (e) {
				return (
					e === void 0 && (e = 0),
					{
						name: 'offset',
						options: e,
						async fn(t) {
							var a, o
							let { x: r, y: n, placement: s, middlewareData: l } = t,
								i = await Cg(t, e)
							return s === ((a = l.offset) == null ? void 0 : a.placement) &&
								(o = l.arrow) != null &&
								o.alignmentOffset
								? {}
								: { x: r + i.x, y: n + i.y, data: { ...i, placement: s } }
						}
					}
				)
			}),
				(uu = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							name: 'shift',
							options: e,
							async fn(t) {
								let { x: a, y: o, placement: r, platform: n } = t,
									{
										mainAxis: s = !0,
										crossAxis: l = !1,
										limiter: i = {
											fn: (v) => {
												let { x: L, y: C } = v
												return { x: L, y: C }
											}
										},
										...d
									} = Qe(e, t),
									u = { x: a, y: o },
									f = await n.detectOverflow(t, d),
									m = We(et(r)),
									g = Vo(m),
									h = u[g],
									p = u[m]
								if (s) {
									let v = g === 'y' ? 'top' : 'left',
										L = g === 'y' ? 'bottom' : 'right',
										C = h + f[v],
										b = h - f[L]
									h = Uo(C, h, b)
								}
								if (l) {
									let v = m === 'y' ? 'top' : 'left',
										L = m === 'y' ? 'bottom' : 'right',
										C = p + f[v],
										b = p - f[L]
									p = Uo(C, p, b)
								}
								let x = i.fn({ ...t, [g]: h, [m]: p })
								return { ...x, data: { x: x.x - a, y: x.y - o, enabled: { [g]: s, [m]: l } } }
							}
						}
					)
				}),
				(du = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							options: e,
							fn(t) {
								let { x: a, y: o, placement: r, rects: n, middlewareData: s } = t,
									{ offset: l = 0, mainAxis: i = !0, crossAxis: d = !0 } = Qe(e, t),
									u = { x: a, y: o },
									f = We(r),
									m = Vo(f),
									g = u[m],
									h = u[f],
									p = Qe(l, t),
									x =
										typeof p == 'number'
											? { mainAxis: p, crossAxis: 0 }
											: { mainAxis: 0, crossAxis: 0, ...p }
								if (i) {
									let C = m === 'y' ? 'height' : 'width',
										b = n.reference[m] - n.floating[C] + x.mainAxis,
										I = n.reference[m] + n.reference[C] - x.mainAxis
									g < b ? (g = b) : g > I && (g = I)
								}
								if (d) {
									var v, L
									let C = m === 'y' ? 'width' : 'height',
										b = lu.has(et(r)),
										I =
											n.reference[f] -
											n.floating[C] +
											((b && ((v = s.offset) == null ? void 0 : v[f])) || 0) +
											(b ? 0 : x.crossAxis),
										P =
											n.reference[f] +
											n.reference[C] +
											(b ? 0 : ((L = s.offset) == null ? void 0 : L[f]) || 0) -
											(b ? x.crossAxis : 0)
									h < I ? (h = I) : h > P && (h = P)
								}
								return { [m]: g, [f]: h }
							}
						}
					)
				}),
				(cu = function (e) {
					return (
						e === void 0 && (e = {}),
						{
							name: 'size',
							options: e,
							async fn(t) {
								var a, o
								let { placement: r, rects: n, platform: s, elements: l } = t,
									{ apply: i = () => {}, ...d } = Qe(e, t),
									u = await s.detectOverflow(t, d),
									f = et(r),
									m = Vt(r),
									g = We(r) === 'y',
									{ width: h, height: p } = n.floating,
									x,
									v
								f === 'top' || f === 'bottom'
									? ((x = f),
										(v =
											m ===
											((await (s.isRTL == null ? void 0 : s.isRTL(l.floating))) ? 'start' : 'end')
												? 'left'
												: 'right'))
									: ((v = f), (x = m === 'end' ? 'top' : 'bottom'))
								let L = p - u.top - u.bottom,
									C = h - u.left - u.right,
									b = Ze(p - u[x], L),
									I = Ze(h - u[v], C),
									P = !t.middlewareData.shift,
									k = b,
									w = I
								if (
									((a = t.middlewareData.shift) != null && a.enabled.x && (w = C),
									(o = t.middlewareData.shift) != null && o.enabled.y && (k = L),
									P && !m)
								) {
									let U = Pe(u.left, 0),
										S = Pe(u.right, 0),
										T = Pe(u.top, 0),
										F = Pe(u.bottom, 0)
									g
										? (w = h - 2 * (U !== 0 || S !== 0 ? U + S : Pe(u.left, u.right)))
										: (k = p - 2 * (T !== 0 || F !== 0 ? T + F : Pe(u.top, u.bottom)))
								}
								await i({ ...t, availableWidth: w, availableHeight: k })
								let E = await s.getDimensions(l.floating)
								return h !== E.width || p !== E.height ? { reset: { rects: !0 } } : {}
							}
						}
					)
				}))
		})
	function Xo() {
		return typeof window < 'u'
	}
	function Xt(e) {
		return mu(e) ? (e.nodeName || '').toLowerCase() : '#document'
	}
	function Me(e) {
		var t
		return (e == null || (t = e.ownerDocument) == null ? void 0 : t.defaultView) || window
	}
	function je(e) {
		var t
		return (t = (mu(e) ? e.ownerDocument : e.document) || window.document) == null ? void 0 : t.documentElement
	}
	function mu(e) {
		return Xo() ? e instanceof Node || e instanceof Me(e).Node : !1
	}
	function Ne(e) {
		return Xo() ? e instanceof Element || e instanceof Me(e).Element : !1
	}
	function tt(e) {
		return Xo() ? e instanceof HTMLElement || e instanceof Me(e).HTMLElement : !1
	}
	function pu(e) {
		return !Xo() || typeof ShadowRoot > 'u' ? !1 : e instanceof ShadowRoot || e instanceof Me(e).ShadowRoot
	}
	function ba(e) {
		let { overflow: t, overflowX: a, overflowY: o, display: r } = ze(e)
		return /auto|scroll|overlay|hidden|clip/.test(t + o + a) && r !== 'inline' && r !== 'contents'
	}
	function hu(e) {
		return /^(table|td|th)$/.test(Xt(e))
	}
	function Xa(e) {
		try {
			if (e.matches(':popover-open')) return !0
		} catch {}
		try {
			return e.matches(':modal')
		} catch {
			return !1
		}
	}
	function Ko(e) {
		let t = Ne(e) ? ze(e) : e
		return (
			Wt(t.transform) ||
			Wt(t.translate) ||
			Wt(t.scale) ||
			Wt(t.rotate) ||
			Wt(t.perspective) ||
			(!$o() && (Wt(t.backdropFilter) || Wt(t.filter))) ||
			bg.test(t.willChange || '') ||
			Ig.test(t.contain || '')
		)
	}
	function gu(e) {
		let t = ft(e)
		for (; tt(t) && !Kt(t); ) {
			if (Ko(t)) return t
			if (Xa(t)) return null
			t = ft(t)
		}
		return null
	}
	function $o() {
		return (
			Dn == null && (Dn = typeof CSS < 'u' && CSS.supports && CSS.supports('-webkit-backdrop-filter', 'none')),
			Dn
		)
	}
	function Kt(e) {
		return /^(html|body|#document)$/.test(Xt(e))
	}
	function ze(e) {
		return Me(e).getComputedStyle(e)
	}
	function Ka(e) {
		return Ne(e)
			? { scrollLeft: e.scrollLeft, scrollTop: e.scrollTop }
			: { scrollLeft: e.scrollX, scrollTop: e.scrollY }
	}
	function ft(e) {
		if (Xt(e) === 'html') return e
		let t = e.assignedSlot || e.parentNode || (pu(e) && e.host) || je(e)
		return pu(t) ? t.host : t
	}
	function xu(e) {
		let t = ft(e)
		return Kt(t) ? (e.ownerDocument ? e.ownerDocument.body : e.body) : tt(t) && ba(t) ? t : xu(t)
	}
	function jt(e, t, a) {
		var o
		;(t === void 0 && (t = []), a === void 0 && (a = !0))
		let r = xu(e),
			n = r === ((o = e.ownerDocument) == null ? void 0 : o.body),
			s = Me(r)
		if (n) {
			let l = Jo(s)
			return t.concat(s, s.visualViewport || [], ba(r) ? r : [], l && a ? jt(l) : [])
		} else return t.concat(r, jt(r, [], a))
	}
	function Jo(e) {
		return e.parent && Object.getPrototypeOf(e.parent) ? e.frameElement : null
	}
	var bg,
		Ig,
		Wt,
		Dn,
		vu = y(() => {
			;((bg = /transform|translate|scale|rotate|perspective|filter/),
				(Ig = /paint|layout|strict|content/),
				(Wt = (e) => !!e && e !== 'none'))
		})
	function Iu(e) {
		let t = ze(e),
			a = parseFloat(t.width) || 0,
			o = parseFloat(t.height) || 0,
			r = tt(e),
			n = r ? e.offsetWidth : a,
			s = r ? e.offsetHeight : o,
			l = Wa(a) !== n || Wa(o) !== s
		return (l && ((a = n), (o = s)), { width: a, height: o, $: l })
	}
	function En(e) {
		return Ne(e) ? e : e.contextElement
	}
	function Ia(e) {
		let t = En(e)
		if (!tt(t)) return Ge(1)
		let a = t.getBoundingClientRect(),
			{ width: o, height: r, $: n } = Iu(t),
			s = (n ? Wa(a.width) : a.width) / o,
			l = (n ? Wa(a.height) : a.height) / r
		return ((!s || !Number.isFinite(s)) && (s = 1), (!l || !Number.isFinite(l)) && (l = 1), { x: s, y: l })
	}
	function Su(e) {
		let t = Me(e)
		return !$o() || !t.visualViewport ? Sg : { x: t.visualViewport.offsetLeft, y: t.visualViewport.offsetTop }
	}
	function wg(e, t, a) {
		return (t === void 0 && (t = !1), !a || (t && a !== Me(e)) ? !1 : t)
	}
	function $t(e, t, a, o) {
		;(t === void 0 && (t = !1), a === void 0 && (a = !1))
		let r = e.getBoundingClientRect(),
			n = En(e),
			s = Ge(1)
		t && (o ? Ne(o) && (s = Ia(o)) : (s = Ia(e)))
		let l = wg(n, a, o) ? Su(n) : Ge(0),
			i = (r.left + l.x) / s.x,
			d = (r.top + l.y) / s.y,
			u = r.width / s.x,
			f = r.height / s.y
		if (n) {
			let m = Me(n),
				g = o && Ne(o) ? Me(o) : o,
				h = m,
				p = Jo(h)
			for (; p && o && g !== h; ) {
				let x = Ia(p),
					v = p.getBoundingClientRect(),
					L = ze(p),
					C = v.left + (p.clientLeft + parseFloat(L.paddingLeft)) * x.x,
					b = v.top + (p.clientTop + parseFloat(L.paddingTop)) * x.y
				;((i *= x.x), (d *= x.y), (u *= x.x), (f *= x.y), (i += C), (d += b), (h = Me(p)), (p = Jo(h)))
			}
		}
		return Gt({ width: u, height: f, x: i, y: d })
	}
	function Yo(e, t) {
		let a = Ka(e).scrollLeft
		return t ? t.left + a : $t(je(e)).left + a
	}
	function wu(e, t) {
		let a = e.getBoundingClientRect(),
			o = a.left + t.scrollLeft - Yo(e, a),
			r = a.top + t.scrollTop
		return { x: o, y: r }
	}
	function yg(e) {
		let { elements: t, rect: a, offsetParent: o, strategy: r } = e,
			n = r === 'fixed',
			s = je(o),
			l = t ? Xa(t.floating) : !1
		if (o === s || (l && n)) return a
		let i = { scrollLeft: 0, scrollTop: 0 },
			d = Ge(1),
			u = Ge(0),
			f = tt(o)
		if ((f || (!f && !n)) && ((Xt(o) !== 'body' || ba(s)) && (i = Ka(o)), f)) {
			let g = $t(o)
			;((d = Ia(o)), (u.x = g.x + o.clientLeft), (u.y = g.y + o.clientTop))
		}
		let m = s && !f && !n ? wu(s, i) : Ge(0)
		return {
			width: a.width * d.x,
			height: a.height * d.y,
			x: a.x * d.x - i.scrollLeft * d.x + u.x + m.x,
			y: a.y * d.y - i.scrollTop * d.y + u.y + m.y
		}
	}
	function Rg(e) {
		return Array.from(e.getClientRects())
	}
	function Pg(e) {
		let t = je(e),
			a = Ka(e),
			o = e.ownerDocument.body,
			r = Pe(t.scrollWidth, t.clientWidth, o.scrollWidth, o.clientWidth),
			n = Pe(t.scrollHeight, t.clientHeight, o.scrollHeight, o.clientHeight),
			s = -a.scrollLeft + Yo(e),
			l = -a.scrollTop
		return (
			ze(o).direction === 'rtl' && (s += Pe(t.clientWidth, o.clientWidth) - r),
			{ width: r, height: n, x: s, y: l }
		)
	}
	function kg(e, t) {
		let a = Me(e),
			o = je(e),
			r = a.visualViewport,
			n = o.clientWidth,
			s = o.clientHeight,
			l = 0,
			i = 0
		if (r) {
			;((n = r.width), (s = r.height))
			let u = $o()
			;(!u || (u && t === 'fixed')) && ((l = r.offsetLeft), (i = r.offsetTop))
		}
		let d = Yo(o)
		if (d <= 0) {
			let u = o.ownerDocument,
				f = u.body,
				m = getComputedStyle(f),
				g = (u.compatMode === 'CSS1Compat' && parseFloat(m.marginLeft) + parseFloat(m.marginRight)) || 0,
				h = Math.abs(o.clientWidth - f.clientWidth - g)
			h <= Lu && (n -= h)
		} else d <= Lu && (n += d)
		return { width: n, height: s, x: l, y: i }
	}
	function Tg(e, t) {
		let a = $t(e, !0, t === 'fixed'),
			o = a.top + e.clientTop,
			r = a.left + e.clientLeft,
			n = tt(e) ? Ia(e) : Ge(1),
			s = e.clientWidth * n.x,
			l = e.clientHeight * n.y,
			i = r * n.x,
			d = o * n.y
		return { width: s, height: l, x: i, y: d }
	}
	function Cu(e, t, a) {
		let o
		if (t === 'viewport') o = kg(e, a)
		else if (t === 'document') o = Pg(je(e))
		else if (Ne(t)) o = Tg(t, a)
		else {
			let r = Su(e)
			o = { x: t.x - r.x, y: t.y - r.y, width: t.width, height: t.height }
		}
		return Gt(o)
	}
	function yu(e, t) {
		let a = ft(e)
		return a === t || !Ne(a) || Kt(a) ? !1 : ze(a).position === 'fixed' || yu(a, t)
	}
	function Ag(e, t) {
		let a = t.get(e)
		if (a) return a
		let o = jt(e, [], !1).filter((l) => Ne(l) && Xt(l) !== 'body'),
			r = null,
			n = ze(e).position === 'fixed',
			s = n ? ft(e) : e
		for (; Ne(s) && !Kt(s); ) {
			let l = ze(s),
				i = Ko(s)
			;(!i && l.position === 'fixed' && (r = null),
				(
					n
						? !i && !r
						: (!i &&
								l.position === 'static' &&
								!!r &&
								(r.position === 'absolute' || r.position === 'fixed')) ||
							(ba(s) && !i && yu(e, s))
				)
					? (o = o.filter((u) => u !== s))
					: (r = l),
				(s = ft(s)))
		}
		return (t.set(e, o), o)
	}
	function Dg(e) {
		let { element: t, boundary: a, rootBoundary: o, strategy: r } = e,
			s = [...(a === 'clippingAncestors' ? (Xa(t) ? [] : Ag(t, this._c)) : [].concat(a)), o],
			l = Cu(t, s[0], r),
			i = l.top,
			d = l.right,
			u = l.bottom,
			f = l.left
		for (let m = 1; m < s.length; m++) {
			let g = Cu(t, s[m], r)
			;((i = Pe(g.top, i)), (d = Ze(g.right, d)), (u = Ze(g.bottom, u)), (f = Pe(g.left, f)))
		}
		return { width: d - f, height: u - i, x: f, y: i }
	}
	function Mg(e) {
		let { width: t, height: a } = Iu(e)
		return { width: t, height: a }
	}
	function Eg(e, t, a) {
		let o = tt(t),
			r = je(t),
			n = a === 'fixed',
			s = $t(e, !0, n, t),
			l = { scrollLeft: 0, scrollTop: 0 },
			i = Ge(0)
		function d() {
			i.x = Yo(r)
		}
		if (o || (!o && !n))
			if (((Xt(t) !== 'body' || ba(r)) && (l = Ka(t)), o)) {
				let g = $t(t, !0, n, t)
				;((i.x = g.x + t.clientLeft), (i.y = g.y + t.clientTop))
			} else r && d()
		n && !o && r && d()
		let u = r && !o && !n ? wu(r, l) : Ge(0),
			f = s.left + l.scrollLeft - i.x - u.x,
			m = s.top + l.scrollTop - i.y - u.y
		return { x: f, y: m, width: s.width, height: s.height }
	}
	function Mn(e) {
		return ze(e).position === 'static'
	}
	function bu(e, t) {
		if (!tt(e) || ze(e).position === 'fixed') return null
		if (t) return t(e)
		let a = e.offsetParent
		return (je(e) === a && (a = a.ownerDocument.body), a)
	}
	function Ru(e, t) {
		let a = Me(e)
		if (Xa(e)) return a
		if (!tt(e)) {
			let r = ft(e)
			for (; r && !Kt(r); ) {
				if (Ne(r) && !Mn(r)) return r
				r = ft(r)
			}
			return a
		}
		let o = bu(e, t)
		for (; o && hu(o) && Mn(o); ) o = bu(o, t)
		return o && Kt(o) && Mn(o) && !Ko(o) ? a : o || gu(e) || a
	}
	function Bg(e) {
		return ze(e).direction === 'rtl'
	}
	function ku(e, t) {
		return e.x === t.x && e.y === t.y && e.width === t.width && e.height === t.height
	}
	function Fg(e, t) {
		let a = null,
			o,
			r = je(e)
		function n() {
			var l
			;(clearTimeout(o), (l = a) == null || l.disconnect(), (a = null))
		}
		function s(l, i) {
			;(l === void 0 && (l = !1), i === void 0 && (i = 1), n())
			let d = e.getBoundingClientRect(),
				{ left: u, top: f, width: m, height: g } = d
			if ((l || t(), !m || !g)) return
			let h = ja(f),
				p = ja(r.clientWidth - (u + m)),
				x = ja(r.clientHeight - (f + g)),
				v = ja(u),
				C = { rootMargin: -h + 'px ' + -p + 'px ' + -x + 'px ' + -v + 'px', threshold: Pe(0, Ze(1, i)) || 1 },
				b = !0
			function I(P) {
				let k = P[0].intersectionRatio
				if (k !== i) {
					if (!b) return s()
					k
						? s(!1, k)
						: (o = setTimeout(() => {
								s(!1, 1e-7)
							}, 1e3))
				}
				;(k === 1 && !ku(d, e.getBoundingClientRect()) && s(), (b = !1))
			}
			try {
				a = new IntersectionObserver(I, { ...C, root: r.ownerDocument })
			} catch {
				a = new IntersectionObserver(I, C)
			}
			a.observe(e)
		}
		return (s(!0), n)
	}
	function On(e, t, a, o) {
		o === void 0 && (o = {})
		let {
				ancestorScroll: r = !0,
				ancestorResize: n = !0,
				elementResize: s = typeof ResizeObserver == 'function',
				layoutShift: l = typeof IntersectionObserver == 'function',
				animationFrame: i = !1
			} = o,
			d = En(e),
			u = r || n ? [...(d ? jt(d) : []), ...(t ? jt(t) : [])] : []
		u.forEach((v) => {
			;(r && v.addEventListener('scroll', a, { passive: !0 }), n && v.addEventListener('resize', a))
		})
		let f = d && l ? Fg(d, a) : null,
			m = -1,
			g = null
		s &&
			((g = new ResizeObserver((v) => {
				let [L] = v
				;(L &&
					L.target === d &&
					g &&
					t &&
					(g.unobserve(t),
					cancelAnimationFrame(m),
					(m = requestAnimationFrame(() => {
						var C
						;(C = g) == null || C.observe(t)
					}))),
					a())
			})),
			d && !i && g.observe(d),
			t && g.observe(t))
		let h,
			p = i ? $t(e) : null
		i && x()
		function x() {
			let v = $t(e)
			;(p && !ku(p, v) && a(), (p = v), (h = requestAnimationFrame(x)))
		}
		return (
			a(),
			() => {
				var v
				;(u.forEach((L) => {
					;(r && L.removeEventListener('scroll', a), n && L.removeEventListener('resize', a))
				}),
					f?.(),
					(v = g) == null || v.disconnect(),
					(g = null),
					i && cancelAnimationFrame(h))
			}
		)
	}
	var Sg,
		Lu,
		Og,
		Pu,
		Tu,
		Au,
		Du,
		Mu,
		Eu,
		Bn,
		Ou,
		Fn,
		Nn = y(() => {
			fu()
			jo()
			vu()
			Sg = Ge(0)
			Lu = 25
			Og = async function (e) {
				let t = this.getOffsetParent || Ru,
					a = this.getDimensions,
					o = await a(e.floating)
				return {
					reference: Eg(e.reference, await t(e.floating), e.strategy),
					floating: { x: 0, y: 0, width: o.width, height: o.height }
				}
			}
			Pu = {
				convertOffsetParentRelativeRectToViewportRelativeRect: yg,
				getDocumentElement: je,
				getClippingRect: Dg,
				getOffsetParent: Ru,
				getElementRects: Og,
				getClientRects: Rg,
				getDimensions: Mg,
				getScale: Ia,
				isElement: Ne,
				isRTL: Bg
			}
			;((Tu = iu),
				(Au = uu),
				(Du = nu),
				(Mu = cu),
				(Eu = su),
				(Bn = ru),
				(Ou = du),
				(Fn = (e, t, a) => {
					let o = new Map(),
						r = { platform: Pu, ...a },
						n = { ...r.platform, _c: o }
					return ou(e, t, { ...r, platform: n })
				}))
		})
	function Qo(e, t) {
		if (e === t) return !0
		if (typeof e != typeof t) return !1
		if (typeof e == 'function' && e.toString() === t.toString()) return !0
		let a, o, r
		if (e && t && typeof e == 'object') {
			if (Array.isArray(e)) {
				if (((a = e.length), a !== t.length)) return !1
				for (o = a; o-- !== 0; ) if (!Qo(e[o], t[o])) return !1
				return !0
			}
			if (((r = Object.keys(e)), (a = r.length), a !== Object.keys(t).length)) return !1
			for (o = a; o-- !== 0; ) if (!{}.hasOwnProperty.call(t, r[o])) return !1
			for (o = a; o-- !== 0; ) {
				let n = r[o]
				if (!(n === '_owner' && e.$$typeof) && !Qo(e[n], t[n])) return !1
			}
			return !0
		}
		return e !== e && t !== t
	}
	function Fu(e) {
		return typeof window > 'u' ? 1 : (e.ownerDocument.defaultView || window).devicePixelRatio || 1
	}
	function Bu(e, t) {
		let a = Fu(e)
		return Math.round(t * a) / a
	}
	function zn(e) {
		let t = D(e)
		return (
			Zo(() => {
				t.current = e
			}),
			t
		)
	}
	function Nu(e) {
		e === void 0 && (e = {})
		let {
				placement: t = 'bottom',
				strategy: a = 'absolute',
				middleware: o = [],
				platform: r,
				elements: { reference: n, floating: s } = {},
				transform: l = !0,
				whileElementsMounted: i,
				open: d
			} = e,
			[u, f] = M({ x: 0, y: 0, strategy: a, placement: t, middlewareData: {}, isPositioned: !1 }),
			[m, g] = M(o)
		Qo(m, o) || g(o)
		let [h, p] = M(null),
			[x, v] = M(null),
			L = q((A) => {
				A !== P.current && ((P.current = A), p(A))
			}, []),
			C = q((A) => {
				A !== k.current && ((k.current = A), v(A))
			}, []),
			b = n || h,
			I = s || x,
			P = D(null),
			k = D(null),
			w = D(u),
			E = i != null,
			U = zn(i),
			S = zn(r),
			T = zn(d),
			F = q(() => {
				if (!P.current || !k.current) return
				let A = { placement: t, strategy: a, middleware: m }
				;(S.current && (A.platform = S.current),
					Fn(P.current, k.current, A).then((Q) => {
						let oe = { ...Q, isPositioned: T.current !== !1 }
						N.current &&
							!Qo(w.current, oe) &&
							((w.current = oe),
							fo(() => {
								f(oe)
							}))
					}))
			}, [m, t, a, S, T])
		Zo(() => {
			d === !1 &&
				w.current.isPositioned &&
				((w.current.isPositioned = !1), f((A) => ({ ...A, isPositioned: !1 })))
		}, [d])
		let N = D(!1)
		;(Zo(
			() => (
				(N.current = !0),
				() => {
					N.current = !1
				}
			),
			[]
		),
			Zo(() => {
				if ((b && (P.current = b), I && (k.current = I), b && I)) {
					if (U.current) return U.current(b, I, F)
					F()
				}
			}, [b, I, F, U, E]))
		let H = de(() => ({ reference: P, floating: k, setReference: L, setFloating: C }), [L, C]),
			z = de(() => ({ reference: b, floating: I }), [b, I]),
			$ = de(() => {
				let A = { position: a, left: 0, top: 0 }
				if (!z.floating) return A
				let Q = Bu(z.floating, u.x),
					oe = Bu(z.floating, u.y)
				return l
					? {
							...A,
							transform: 'translate(' + Q + 'px, ' + oe + 'px)',
							...(Fu(z.floating) >= 1.5 && { willChange: 'transform' })
						}
					: { position: a, left: Q, top: oe }
			}, [a, l, z.floating, u.x, u.y])
		return de(() => ({ ...u, update: F, refs: H, elements: z, floatingStyles: $ }), [u, F, H, z, $])
	}
	var Ng,
		zg,
		Zo,
		_g,
		zu,
		_u,
		Hu,
		qu,
		Uu,
		Vu,
		Gu,
		Wu = y(() => {
			Nn()
			Nn()
			K()
			K()
			ua()
			;((Ng = typeof document < 'u'), (zg = function () {}), (Zo = Ng ? lt : zg))
			;((_g = (e) => {
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
								? Bn({ element: o.current, padding: r }).fn(a)
								: {}
							: o
								? Bn({ element: o, padding: r }).fn(a)
								: {}
					}
				}
			}),
				(zu = (e, t) => {
					let a = Tu(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(_u = (e, t) => {
					let a = Au(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Hu = (e, t) => ({ fn: Ou(e).fn, options: [e, t] })),
				(qu = (e, t) => {
					let a = Du(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Uu = (e, t) => {
					let a = Mu(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Vu = (e, t) => {
					let a = Eu(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}),
				(Gu = (e, t) => {
					let a = _g(e)
					return { name: a.name, fn: a.fn, options: [e, t] }
				}))
		})
	var Hg,
		ju,
		Xu,
		Ku = y(() => {
			K()
			Oe()
			O()
			;((Hg = 'Arrow'),
				(ju = R((e, t) => {
					let { children: a, width: o = 10, height: r = 5, ...n } = e
					return c(J.svg, {
						...n,
						ref: t,
						width: o,
						height: r,
						viewBox: '0 0 30 10',
						preserveAspectRatio: 'none',
						children: e.asChild ? a : c('polygon', { points: '0,0 30,0 15,10' })
					})
				})))
			ju.displayName = Hg
			Xu = ju
		})
	function jg(e) {
		return e !== null
	}
	function qn(e) {
		let [t, a = 'center'] = e.split('-')
		return [t, a]
	}
	var _n,
		$u,
		Sa,
		Ug,
		Ju,
		Yu,
		Zu,
		Qu,
		Hn,
		Vg,
		Gg,
		ed,
		td,
		Wg,
		ad,
		Xg,
		er,
		tr,
		ar,
		or,
		$a = y(() => {
			'use client'
			K()
			Wu()
			Ku()
			Fe()
			Ye()
			Oe()
			wt()
			dt()
			ji()
			O()
			;((_n = 'Popper'),
				([$u, Sa] = be(_n)),
				([Ug, Ju] = $u(_n)),
				(Yu = (e) => {
					let { __scopePopper: t, children: a } = e,
						[o, r] = M(null),
						[n, s] = M(void 0)
					return c(Ug, {
						scope: t,
						anchor: o,
						onAnchorChange: r,
						placementState: n,
						setPlacementState: s,
						children: a
					})
				}))
			Yu.displayName = _n
			;((Zu = 'PopperAnchor'),
				(Qu = R((e, t) => {
					let { __scopePopper: a, virtualRef: o, ...r } = e,
						n = Ju(Zu, a),
						s = D(null),
						l = n.onAnchorChange,
						i = q(
							(h) => {
								;((s.current = h), h && l(h))
							},
							[l]
						),
						d = Z(t, i),
						u = D(null)
					B(() => {
						if (!o) return
						let h = u.current
						;((u.current = o.current), h !== u.current && l(u.current))
					})
					let f = n.placementState && qn(n.placementState),
						m = f?.[0],
						g = f?.[1]
					return o
						? null
						: c(J.div, { 'data-radix-popper-side': m, 'data-radix-popper-align': g, ...r, ref: d })
				})))
			Qu.displayName = Zu
			;((Hn = 'PopperContent'),
				([Vg, Gg] = $u(Hn)),
				(ed = R((e, t) => {
					let {
							__scopePopper: a,
							side: o = 'bottom',
							sideOffset: r = 0,
							align: n = 'center',
							alignOffset: s = 0,
							arrowPadding: l = 0,
							avoidCollisions: i = !0,
							collisionBoundary: d = [],
							collisionPadding: u = 0,
							sticky: f = 'partial',
							hideWhenDetached: m = !1,
							updatePositionStrategy: g = 'optimized',
							onPlaced: h,
							...p
						} = e,
						x = Ju(Hn, a),
						[v, L] = M(null),
						C = Z(t, (ne) => L(ne)),
						[b, I] = M(null),
						P = Wi(b),
						k = P?.width ?? 0,
						w = P?.height ?? 0,
						E = o + (n !== 'center' ? '-' + n : ''),
						U = typeof u == 'number' ? u : { top: 0, right: 0, bottom: 0, left: 0, ...u },
						S = Array.isArray(d) ? d : [d],
						T = S.length > 0,
						F = { padding: U, boundary: S.filter(jg), altBoundary: T },
						{
							refs: N,
							floatingStyles: H,
							placement: z,
							isPositioned: $,
							middlewareData: A
						} = Nu({
							strategy: 'fixed',
							placement: E,
							whileElementsMounted: (...ne) => On(...ne, { animationFrame: g === 'always' }),
							elements: { reference: x.anchor },
							middleware: [
								zu({ mainAxis: r + w, alignmentAxis: s }),
								i &&
									_u({ mainAxis: !0, crossAxis: !1, limiter: f === 'partial' ? Hu() : void 0, ...F }),
								i && qu({ ...F }),
								Uu({
									...F,
									apply: ({ elements: ne, rects: he, availableWidth: se, availableHeight: ie }) => {
										let { width: fe, height: nt } = he.reference,
											Be = ne.floating.style
										;(Be.setProperty('--radix-popper-available-width', `${se}px`),
											Be.setProperty('--radix-popper-available-height', `${ie}px`),
											Be.setProperty('--radix-popper-anchor-width', `${fe}px`),
											Be.setProperty('--radix-popper-anchor-height', `${nt}px`))
									}
								}),
								b && Gu({ element: b, padding: l }),
								Xg({ arrowWidth: k, arrowHeight: w }),
								m && Vu({ strategy: 'referenceHidden', ...F, boundary: T ? F.boundary : void 0 })
							]
						}),
						Q = x.setPlacementState
					ce(
						() => (
							Q(z),
							() => {
								Q(void 0)
							}
						),
						[z, Q]
					)
					let [oe, me] = qn(z),
						Ie = xe(h)
					ce(() => {
						$ && Ie?.()
					}, [$, Ie])
					let le = A.arrow?.x,
						pe = A.arrow?.y,
						Ee = A.arrow?.centerOffset !== 0,
						[ve, _] = M()
					return (
						ce(() => {
							v && _(window.getComputedStyle(v).zIndex)
						}, [v]),
						c('div', {
							ref: N.setFloating,
							'data-radix-popper-content-wrapper': '',
							style: {
								...H,
								transform: $ ? H.transform : 'translate(0, -200%)',
								minWidth: 'max-content',
								zIndex: ve,
								'--radix-popper-transform-origin': [A.transformOrigin?.x, A.transformOrigin?.y].join(
									' '
								),
								...(A.hide?.referenceHidden && { visibility: 'hidden', pointerEvents: 'none' })
							},
							dir: e.dir,
							children: c(Vg, {
								scope: a,
								placedSide: oe,
								placedAlign: me,
								onArrowChange: I,
								arrowX: le,
								arrowY: pe,
								shouldHideArrow: Ee,
								children: c(J.div, {
									'data-side': oe,
									'data-align': me,
									...p,
									ref: C,
									style: { ...p.style, animation: $ ? void 0 : 'none' }
								})
							})
						})
					)
				})))
			ed.displayName = Hn
			;((td = 'PopperArrow'),
				(Wg = { top: 'bottom', right: 'left', bottom: 'top', left: 'right' }),
				(ad = R(function (t, a) {
					let { __scopePopper: o, ...r } = t,
						n = Gg(td, o),
						s = Wg[n.placedSide]
					return c('span', {
						ref: n.onArrowChange,
						style: {
							position: 'absolute',
							left: n.arrowX,
							top: n.arrowY,
							[s]: 0,
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
						children: c(Xu, { ...r, ref: a, style: { ...r.style, display: 'block' } })
					})
				})))
			ad.displayName = td
			Xg = (e) => ({
				name: 'transformOrigin',
				options: e,
				fn(t) {
					let { placement: a, rects: o, middlewareData: r } = t,
						s = r.arrow?.centerOffset !== 0,
						l = s ? 0 : e.arrowWidth,
						i = s ? 0 : e.arrowHeight,
						[d, u] = qn(a),
						f = { start: '0%', center: '50%', end: '100%' }[u],
						m = (r.arrow?.x ?? 0) + l / 2,
						g = (r.arrow?.y ?? 0) + i / 2,
						h = '',
						p = ''
					return (
						d === 'bottom'
							? ((h = s ? f : `${m}px`), (p = `${-i}px`))
							: d === 'top'
								? ((h = s ? f : `${m}px`), (p = `${o.floating.height + i}px`))
								: d === 'right'
									? ((h = `${-i}px`), (p = s ? f : `${g}px`))
									: d === 'left' && ((h = `${o.floating.width + i}px`), (p = s ? f : `${g}px`)),
						{ data: { x: h, y: p } }
					)
				}
			})
			;((er = Yu), (tr = Qu), (ar = ed), (or = ad))
		})
	function tx(e, t) {
		return t !== 'rtl' ? e : e === 'ArrowLeft' ? 'ArrowRight' : e === 'ArrowRight' ? 'ArrowLeft' : e
	}
	function ax(e, t, a) {
		let o = tx(e.key, a)
		if (
			!(t === 'vertical' && ['ArrowLeft', 'ArrowRight'].includes(o)) &&
			!(t === 'horizontal' && ['ArrowUp', 'ArrowDown'].includes(o))
		)
			return ex[o]
	}
	function id(e, t = !1) {
		let a = document.activeElement
		for (let o of e) if (o === a || (o.focus({ preventScroll: t }), document.activeElement !== a)) return
	}
	function ox(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	var Un,
		Kg,
		Ja,
		Vn,
		rd,
		$g,
		Jg,
		Gn,
		Yg,
		Zg,
		nd,
		Qg,
		sd,
		ld,
		ex,
		ud,
		dd,
		Wn = y(() => {
			'use client'
			K()
			ut()
			Vr()
			Fe()
			Ye()
			pa()
			Oe()
			wt()
			ca()
			Na()
			O()
			;((Un = 'rovingFocusGroup.onEntryFocus'),
				(Kg = { bubbles: !1, cancelable: !0 }),
				(Ja = 'RovingFocusGroup'),
				([Vn, rd, $g] = go(Ja)),
				([Jg, Gn] = be(Ja, [$g])),
				([Yg, Zg] = Jg(Ja)),
				(nd = R((e, t) =>
					c(Vn.Provider, {
						scope: e.__scopeRovingFocusGroup,
						children: c(Vn.Slot, { scope: e.__scopeRovingFocusGroup, children: c(Qg, { ...e, ref: t }) })
					})
				)))
			nd.displayName = Ja
			;((Qg = R((e, t) => {
				let {
						__scopeRovingFocusGroup: a,
						orientation: o,
						loop: r = !1,
						dir: n,
						currentTabStopId: s,
						defaultCurrentTabStopId: l,
						onCurrentTabStopIdChange: i,
						onEntryFocus: d,
						preventScrollOnEntryFocus: u = !1,
						...f
					} = e,
					m = D(null),
					g = Z(t, m),
					h = St(n),
					[p, x] = Ue({ prop: s, defaultProp: l ?? null, onChange: i, caller: Ja }),
					[v, L] = M(!1),
					C = xe(d),
					b = rd(a),
					I = D(!1),
					[P, k] = M(0)
				return (
					B(() => {
						let w = m.current
						if (w) return (w.addEventListener(Un, C), () => w.removeEventListener(Un, C))
					}, [C]),
					c(Yg, {
						scope: a,
						orientation: o,
						dir: h,
						loop: r,
						currentTabStopId: p,
						onItemFocus: q((w) => x(w), [x]),
						onItemShiftTab: q(() => L(!0), []),
						onFocusableItemAdd: q(() => k((w) => w + 1), []),
						onFocusableItemRemove: q(() => k((w) => w - 1), []),
						children: c(J.div, {
							tabIndex: v || P === 0 ? -1 : 0,
							'data-orientation': o,
							...f,
							ref: g,
							style: { outline: 'none', ...e.style },
							onMouseDown: X(e.onMouseDown, () => {
								I.current = !0
							}),
							onFocus: X(e.onFocus, (w) => {
								let E = !I.current
								if (w.target === w.currentTarget && E && !v) {
									let U = new CustomEvent(Un, Kg)
									if ((w.currentTarget.dispatchEvent(U), !U.defaultPrevented)) {
										let S = b().filter((z) => z.focusable),
											T = S.find((z) => z.active),
											F = S.find((z) => z.id === p),
											H = [T, F, ...S].filter(Boolean).map((z) => z.ref.current)
										id(H, u)
									}
								}
								I.current = !1
							}),
							onBlur: X(e.onBlur, () => L(!1))
						})
					})
				)
			})),
				(sd = 'RovingFocusGroupItem'),
				(ld = R((e, t) => {
					let {
							__scopeRovingFocusGroup: a,
							focusable: o = !0,
							active: r = !1,
							tabStopId: n,
							children: s,
							...l
						} = e,
						i = Ae(),
						d = n || i,
						u = Zg(sd, a),
						f = u.currentTabStopId === d,
						m = rd(a),
						{ onFocusableItemAdd: g, onFocusableItemRemove: h, currentTabStopId: p } = u
					return (
						B(() => {
							if (o) return (g(), () => h())
						}, [o, g, h]),
						c(Vn.ItemSlot, {
							scope: a,
							id: d,
							focusable: o,
							active: r,
							children: c(J.span, {
								tabIndex: f ? 0 : -1,
								'data-orientation': u.orientation,
								...l,
								ref: t,
								onMouseDown: X(e.onMouseDown, (x) => {
									o ? u.onItemFocus(d) : x.preventDefault()
								}),
								onFocus: X(e.onFocus, () => u.onItemFocus(d)),
								onKeyDown: X(e.onKeyDown, (x) => {
									if (x.key === 'Tab' && x.shiftKey) {
										u.onItemShiftTab()
										return
									}
									if (x.target !== x.currentTarget) return
									let v = ax(x, u.orientation, u.dir)
									if (v !== void 0) {
										if (x.metaKey || x.ctrlKey || x.altKey || x.shiftKey) return
										x.preventDefault()
										let C = m()
											.filter((b) => b.focusable)
											.map((b) => b.ref.current)
										if (v === 'last') C.reverse()
										else if (v === 'prev' || v === 'next') {
											v === 'prev' && C.reverse()
											let b = C.indexOf(x.currentTarget)
											C = u.loop ? ox(C, b + 1) : C.slice(b + 1)
										}
										setTimeout(() => id(C))
									}
								}),
								children: typeof s == 'function' ? s({ isCurrentTabStop: f, hasTabStop: p != null }) : s
							})
						})
					)
				})))
			ld.displayName = sd
			ex = {
				ArrowLeft: 'prev',
				ArrowUp: 'prev',
				ArrowRight: 'next',
				ArrowDown: 'next',
				PageUp: 'first',
				Home: 'first',
				PageDown: 'last',
				End: 'last'
			}
			;((ud = nd), (dd = ld))
		})
	function Ya(e, [t, a]) {
		return Math.min(a, Math.max(t, e))
	}
	var jn = y(() => {})
	var Pt = {}
	Lt(Pt, {
		Corner: () => Ix,
		Root: () => vx,
		ScrollArea: () => Kn,
		ScrollAreaCorner: () => es,
		ScrollAreaScrollbar: () => Jn,
		ScrollAreaThumb: () => Zn,
		ScrollAreaViewport: () => $n,
		Scrollbar: () => Cx,
		Thumb: () => bx,
		Viewport: () => Lx,
		createScrollAreaScope: () => sx
	})
	function nx(e, t) {
		return la((a, o) => t[a][o] ?? a, e)
	}
	function nr(e) {
		return e ? parseInt(e, 10) : 0
	}
	function xd(e, t) {
		let a = e / t
		return isNaN(a) ? 0 : a
	}
	function sr(e) {
		let t = xd(e.viewport, e.content),
			a = e.scrollbar.paddingStart + e.scrollbar.paddingEnd,
			o = (e.scrollbar.size - a) * t
		return Math.max(o, 18)
	}
	function gx(e, t, a, o = 'ltr') {
		let r = sr(a),
			n = r / 2,
			s = t || n,
			l = r - s,
			i = a.scrollbar.paddingStart + s,
			d = a.scrollbar.size - a.scrollbar.paddingEnd - l,
			u = a.content - a.viewport,
			f = o === 'ltr' ? [0, u] : [u * -1, 0]
		return vd([i, d], f)(e)
	}
	function cd(e, t, a = 'ltr') {
		let o = sr(t),
			r = t.scrollbar.paddingStart + t.scrollbar.paddingEnd,
			n = t.scrollbar.size - r,
			s = t.content - t.viewport,
			l = n - o,
			i = a === 'ltr' ? [0, s] : [s * -1, 0],
			d = Ya(e, i)
		return vd([0, s], [0, l])(d)
	}
	function vd(e, t) {
		return (a) => {
			if (e[0] === e[1] || t[0] === t[1]) return t[0]
			let o = (t[1] - t[0]) / (e[1] - e[0])
			return t[0] + o * (a - e[0])
		}
	}
	function Ld(e, t) {
		return e > 0 && e < t
	}
	function lr(e, t) {
		let a = xe(e),
			o = D(0)
		return (
			B(() => () => window.clearTimeout(o.current), []),
			q(() => {
				;(window.clearTimeout(o.current), (o.current = window.setTimeout(a, t)))
			}, [a, t])
		)
	}
	function wa(e, t) {
		let a = xe(t)
		ce(() => {
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
	var Xn,
		fd,
		sx,
		lx,
		_e,
		Kn,
		pd,
		$n,
		ix,
		at,
		Jn,
		ux,
		dx,
		md,
		Yn,
		cx,
		fx,
		px,
		hd,
		gd,
		rr,
		Zn,
		mx,
		Qn,
		es,
		hx,
		xx,
		vx,
		Lx,
		Cx,
		bx,
		Ix,
		Cd = y(() => {
			'use client'
			K()
			Oe()
			fa()
			Ye()
			Fe()
			wt()
			Na()
			dt()
			jn()
			ut()
			K()
			O()
			;((Xn = 'ScrollArea'),
				([fd, sx] = be(Xn)),
				([lx, _e] = fd(Xn)),
				(Kn = R((e, t) => {
					let { __scopeScrollArea: a, type: o = 'hover', dir: r, scrollHideDelay: n = 600, ...s } = e,
						[l, i] = M(null),
						[d, u] = M(null),
						[f, m] = M(null),
						[g, h] = M(null),
						[p, x] = M(null),
						[v, L] = M(0),
						[C, b] = M(0),
						[I, P] = M(!1),
						[k, w] = M(!1),
						E = Z(t, (S) => i(S)),
						U = St(r)
					return c(lx, {
						scope: a,
						type: o,
						dir: U,
						scrollHideDelay: n,
						scrollArea: l,
						viewport: d,
						onViewportChange: u,
						content: f,
						onContentChange: m,
						scrollbarX: g,
						onScrollbarXChange: h,
						scrollbarXEnabled: I,
						onScrollbarXEnabledChange: P,
						scrollbarY: p,
						onScrollbarYChange: x,
						scrollbarYEnabled: k,
						onScrollbarYEnabledChange: w,
						onCornerWidthChange: L,
						onCornerHeightChange: b,
						children: c(J.div, {
							dir: U,
							...s,
							ref: E,
							style: {
								position: 'relative',
								'--radix-scroll-area-corner-width': v + 'px',
								'--radix-scroll-area-corner-height': C + 'px',
								...e.style
							}
						})
					})
				})))
			Kn.displayName = Xn
			;((pd = 'ScrollAreaViewport'),
				($n = R((e, t) => {
					let { __scopeScrollArea: a, children: o, nonce: r, ...n } = e,
						s = _e(pd, a),
						l = D(null),
						i = Z(t, l, s.onViewportChange)
					return W(Je, {
						children: [
							c(ix, { nonce: r }),
							c(J.div, {
								'data-radix-scroll-area-viewport': '',
								...n,
								ref: i,
								style: {
									overflowX: s.scrollbarXEnabled ? 'scroll' : 'hidden',
									overflowY: s.scrollbarYEnabled ? 'scroll' : 'hidden',
									...e.style
								},
								children: c('div', {
									ref: s.onContentChange,
									style: { minWidth: '100%', display: 'table' },
									children: o
								})
							})
						]
					})
				})))
			$n.displayName = pd
			;((ix = Ea(
				({ nonce: e }) =>
					c('style', {
						dangerouslySetInnerHTML: {
							__html: '[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}'
						},
						nonce: e
					}),
				(e, t) => e.nonce === t.nonce
			)),
				(at = 'ScrollAreaScrollbar'),
				(Jn = R((e, t) => {
					let { forceMount: a, ...o } = e,
						r = _e(at, e.__scopeScrollArea),
						{ onScrollbarXEnabledChange: n, onScrollbarYEnabledChange: s } = r,
						l = e.orientation === 'horizontal'
					return (
						B(
							() => (
								l ? n(!0) : s(!0),
								() => {
									l ? n(!1) : s(!1)
								}
							),
							[l, n, s]
						),
						r.type === 'hover'
							? c(ux, { ...o, ref: t, forceMount: a })
							: r.type === 'scroll'
								? c(dx, { ...o, ref: t, forceMount: a })
								: r.type === 'auto'
									? c(md, { ...o, ref: t, forceMount: a })
									: r.type === 'always'
										? c(Yn, { ...o, ref: t, 'data-state': 'visible' })
										: null
					)
				})))
			Jn.displayName = at
			;((ux = R((e, t) => {
				let { forceMount: a, ...o } = e,
					r = _e(at, e.__scopeScrollArea),
					[n, s] = M(!1)
				return (
					B(() => {
						let l = r.scrollArea,
							i = 0
						if (l) {
							let d = () => {
									;(window.clearTimeout(i), s(!0))
								},
								u = () => {
									i = window.setTimeout(() => s(!1), r.scrollHideDelay)
								}
							return (
								l.addEventListener('pointerenter', d),
								l.addEventListener('pointerleave', u),
								() => {
									;(window.clearTimeout(i),
										l.removeEventListener('pointerenter', d),
										l.removeEventListener('pointerleave', u))
								}
							)
						}
					}, [r.scrollArea, r.scrollHideDelay]),
					c(Se, {
						present: a || n,
						children: c(md, { 'data-state': n ? 'visible' : 'hidden', ...o, ref: t })
					})
				)
			})),
				(dx = R((e, t) => {
					let { forceMount: a, ...o } = e,
						r = _e(at, e.__scopeScrollArea),
						n = e.orientation === 'horizontal',
						s = lr(() => i('SCROLL_END'), 100),
						[l, i] = nx('hidden', {
							hidden: { SCROLL: 'scrolling' },
							scrolling: { SCROLL_END: 'idle', POINTER_ENTER: 'interacting' },
							interacting: { SCROLL: 'interacting', POINTER_LEAVE: 'idle' },
							idle: { HIDE: 'hidden', SCROLL: 'scrolling', POINTER_ENTER: 'interacting' }
						})
					return (
						B(() => {
							if (l === 'idle') {
								let d = window.setTimeout(() => i('HIDE'), r.scrollHideDelay)
								return () => window.clearTimeout(d)
							}
						}, [l, r.scrollHideDelay, i]),
						B(() => {
							let d = r.viewport,
								u = n ? 'scrollLeft' : 'scrollTop'
							if (d) {
								let f = d[u],
									m = () => {
										let g = d[u]
										;(f !== g && (i('SCROLL'), s()), (f = g))
									}
								return (d.addEventListener('scroll', m), () => d.removeEventListener('scroll', m))
							}
						}, [r.viewport, n, i, s]),
						c(Se, {
							present: a || l !== 'hidden',
							children: c(Yn, {
								'data-state': l === 'hidden' ? 'hidden' : 'visible',
								...o,
								ref: t,
								onPointerEnter: X(e.onPointerEnter, () => i('POINTER_ENTER')),
								onPointerLeave: X(e.onPointerLeave, () => i('POINTER_LEAVE'))
							})
						})
					)
				})),
				(md = R((e, t) => {
					let a = _e(at, e.__scopeScrollArea),
						{ forceMount: o, ...r } = e,
						[n, s] = M(!1),
						l = e.orientation === 'horizontal',
						i = lr(() => {
							if (a.viewport) {
								let d = a.viewport.offsetWidth < a.viewport.scrollWidth,
									u = a.viewport.offsetHeight < a.viewport.scrollHeight
								s(l ? d : u)
							}
						}, 10)
					return (
						wa(a.viewport, i),
						wa(a.content, i),
						c(Se, {
							present: o || n,
							children: c(Yn, { 'data-state': n ? 'visible' : 'hidden', ...r, ref: t })
						})
					)
				})),
				(Yn = R((e, t) => {
					let { orientation: a = 'vertical', ...o } = e,
						r = _e(at, e.__scopeScrollArea),
						n = D(null),
						s = D(0),
						[l, i] = M({ content: 0, viewport: 0, scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 } }),
						d = xd(l.viewport, l.content),
						u = {
							...o,
							sizes: l,
							onSizesChange: i,
							hasThumb: d > 0 && d < 1,
							onThumbChange: (m) => (n.current = m),
							onThumbPointerUp: () => (s.current = 0),
							onThumbPointerDown: (m) => (s.current = m)
						}
					function f(m, g) {
						return gx(m, s.current, l, g)
					}
					return a === 'horizontal'
						? c(cx, {
								...u,
								ref: t,
								onThumbPositionChange: () => {
									if (r.viewport && n.current) {
										let m = r.viewport.scrollLeft,
											g = cd(m, l, r.dir)
										n.current.style.transform = `translate3d(${g}px, 0, 0)`
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
							? c(fx, {
									...u,
									ref: t,
									onThumbPositionChange: () => {
										if (r.viewport && n.current) {
											let m = r.viewport.scrollTop,
												g = cd(m, l)
											n.current.style.transform = `translate3d(0, ${g}px, 0)`
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
				(cx = R((e, t) => {
					let { sizes: a, onSizesChange: o, ...r } = e,
						n = _e(at, e.__scopeScrollArea),
						[s, l] = M(),
						i = D(null),
						d = Z(t, i, n.onScrollbarXChange)
					return (
						B(() => {
							i.current && l(getComputedStyle(i.current))
						}, [i]),
						c(gd, {
							'data-orientation': 'horizontal',
							...r,
							ref: d,
							sizes: a,
							style: {
								bottom: 0,
								left: n.dir === 'rtl' ? 'var(--radix-scroll-area-corner-width)' : 0,
								right: n.dir === 'ltr' ? 'var(--radix-scroll-area-corner-width)' : 0,
								'--radix-scroll-area-thumb-width': sr(a) + 'px',
								...e.style
							},
							onThumbPointerDown: (u) => e.onThumbPointerDown(u.x),
							onDragScroll: (u) => e.onDragScroll(u.x),
							onWheelScroll: (u, f) => {
								if (n.viewport) {
									let m = n.viewport.scrollLeft + u.deltaX
									;(e.onWheelScroll(m), Ld(m, f) && u.preventDefault())
								}
							},
							onResize: () => {
								i.current &&
									n.viewport &&
									s &&
									o({
										content: n.viewport.scrollWidth,
										viewport: n.viewport.offsetWidth,
										scrollbar: {
											size: i.current.clientWidth,
											paddingStart: nr(s.paddingLeft),
											paddingEnd: nr(s.paddingRight)
										}
									})
							}
						})
					)
				})),
				(fx = R((e, t) => {
					let { sizes: a, onSizesChange: o, ...r } = e,
						n = _e(at, e.__scopeScrollArea),
						[s, l] = M(),
						i = D(null),
						d = Z(t, i, n.onScrollbarYChange)
					return (
						B(() => {
							i.current && l(getComputedStyle(i.current))
						}, [i]),
						c(gd, {
							'data-orientation': 'vertical',
							...r,
							ref: d,
							sizes: a,
							style: {
								top: 0,
								right: n.dir === 'ltr' ? 0 : void 0,
								left: n.dir === 'rtl' ? 0 : void 0,
								bottom: 'var(--radix-scroll-area-corner-height)',
								'--radix-scroll-area-thumb-height': sr(a) + 'px',
								...e.style
							},
							onThumbPointerDown: (u) => e.onThumbPointerDown(u.y),
							onDragScroll: (u) => e.onDragScroll(u.y),
							onWheelScroll: (u, f) => {
								if (n.viewport) {
									let m = n.viewport.scrollTop + u.deltaY
									;(e.onWheelScroll(m), Ld(m, f) && u.preventDefault())
								}
							},
							onResize: () => {
								i.current &&
									n.viewport &&
									s &&
									o({
										content: n.viewport.scrollHeight,
										viewport: n.viewport.offsetHeight,
										scrollbar: {
											size: i.current.clientHeight,
											paddingStart: nr(s.paddingTop),
											paddingEnd: nr(s.paddingBottom)
										}
									})
							}
						})
					)
				})),
				([px, hd] = fd(at)),
				(gd = R((e, t) => {
					let {
							__scopeScrollArea: a,
							sizes: o,
							hasThumb: r,
							onThumbChange: n,
							onThumbPointerUp: s,
							onThumbPointerDown: l,
							onThumbPositionChange: i,
							onDragScroll: d,
							onWheelScroll: u,
							onResize: f,
							...m
						} = e,
						g = _e(at, a),
						[h, p] = M(null),
						x = Z(t, (E) => p(E)),
						v = D(null),
						L = D(''),
						C = g.viewport,
						b = o.content - o.viewport,
						I = xe(u),
						P = xe(i),
						k = lr(f, 10)
					function w(E) {
						if (v.current) {
							let U = E.clientX - v.current.left,
								S = E.clientY - v.current.top
							d({ x: U, y: S })
						}
					}
					return (
						B(() => {
							let E = (U) => {
								let S = U.target
								h?.contains(S) && I(U, b)
							}
							return (
								document.addEventListener('wheel', E, { passive: !1 }),
								() => document.removeEventListener('wheel', E, { passive: !1 })
							)
						}, [C, h, b, I]),
						B(P, [o, P]),
						wa(h, k),
						wa(g.content, k),
						c(px, {
							scope: a,
							scrollbar: h,
							hasThumb: r,
							onThumbChange: xe(n),
							onThumbPointerUp: xe(s),
							onThumbPositionChange: P,
							onThumbPointerDown: xe(l),
							children: c(J.div, {
								...m,
								ref: x,
								style: { position: 'absolute', ...m.style },
								onPointerDown: X(e.onPointerDown, (E) => {
									E.button === 0 &&
										(E.target.setPointerCapture(E.pointerId),
										(v.current = h.getBoundingClientRect()),
										(L.current = document.body.style.webkitUserSelect),
										(document.body.style.webkitUserSelect = 'none'),
										g.viewport && (g.viewport.style.scrollBehavior = 'auto'),
										w(E))
								}),
								onPointerMove: X(e.onPointerMove, w),
								onPointerUp: X(e.onPointerUp, (E) => {
									let U = E.target
									;(U.hasPointerCapture(E.pointerId) && U.releasePointerCapture(E.pointerId),
										(document.body.style.webkitUserSelect = L.current),
										g.viewport && (g.viewport.style.scrollBehavior = ''),
										(v.current = null))
								})
							})
						})
					)
				})),
				(rr = 'ScrollAreaThumb'),
				(Zn = R((e, t) => {
					let { forceMount: a, ...o } = e,
						r = hd(rr, e.__scopeScrollArea)
					return c(Se, { present: a || r.hasThumb, children: c(mx, { ref: t, ...o }) })
				})),
				(mx = R((e, t) => {
					let { __scopeScrollArea: a, style: o, ...r } = e,
						n = _e(rr, a),
						s = hd(rr, a),
						{ onThumbPositionChange: l } = s,
						i = Z(t, (f) => s.onThumbChange(f)),
						d = D(void 0),
						u = lr(() => {
							d.current && (d.current(), (d.current = void 0))
						}, 100)
					return (
						B(() => {
							let f = n.viewport
							if (f) {
								let m = () => {
									if ((u(), !d.current)) {
										let g = xx(f, l)
										;((d.current = g), l())
									}
								}
								return (l(), f.addEventListener('scroll', m), () => f.removeEventListener('scroll', m))
							}
						}, [n.viewport, u, l]),
						c(J.div, {
							'data-state': s.hasThumb ? 'visible' : 'hidden',
							...r,
							ref: i,
							style: {
								width: 'var(--radix-scroll-area-thumb-width)',
								height: 'var(--radix-scroll-area-thumb-height)',
								...o
							},
							onPointerDownCapture: X(e.onPointerDownCapture, (f) => {
								let g = f.target.getBoundingClientRect(),
									h = f.clientX - g.left,
									p = f.clientY - g.top
								s.onThumbPointerDown({ x: h, y: p })
							}),
							onPointerUp: X(e.onPointerUp, s.onThumbPointerUp)
						})
					)
				})))
			Zn.displayName = rr
			;((Qn = 'ScrollAreaCorner'),
				(es = R((e, t) => {
					let a = _e(Qn, e.__scopeScrollArea),
						o = !!(a.scrollbarX && a.scrollbarY)
					return a.type !== 'scroll' && o ? c(hx, { ...e, ref: t }) : null
				})))
			es.displayName = Qn
			hx = R((e, t) => {
				let { __scopeScrollArea: a, ...o } = e,
					r = _e(Qn, a),
					[n, s] = M(0),
					[l, i] = M(0),
					d = !!(n && l)
				return (
					wa(r.scrollbarX, () => {
						let u = r.scrollbarX?.offsetHeight || 0
						;(r.onCornerHeightChange(u), i(u))
					}),
					wa(r.scrollbarY, () => {
						let u = r.scrollbarY?.offsetWidth || 0
						;(r.onCornerWidthChange(u), s(u))
					}),
					d
						? c(J.div, {
								...o,
								ref: t,
								style: {
									width: n,
									height: l,
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
			xx = (e, t = () => {}) => {
				let a = { left: e.scrollLeft, top: e.scrollTop },
					o = 0
				return (
					(function r() {
						let n = { left: e.scrollLeft, top: e.scrollTop },
							s = a.left !== n.left,
							l = a.top !== n.top
						;((s || l) && t(), (a = n), (o = window.requestAnimationFrame(r)))
					})(),
					() => window.cancelAnimationFrame(o)
				)
			}
			;((vx = Kn), (Lx = $n), (Cx = Jn), (bx = Zn), (Ix = es))
		})
	var ke = {}
	Lt(ke, {
		Arrow: () => $d,
		Content: () => Td,
		Group: () => Fd,
		Icon: () => Rd,
		Item: () => Hd,
		ItemIndicator: () => Vd,
		ItemText: () => qd,
		Label: () => zd,
		Portal: () => kd,
		Root: () => bd,
		ScrollDownButton: () => Wd,
		ScrollUpButton: () => Gd,
		Select: () => bd,
		SelectArrow: () => $d,
		SelectContent: () => Td,
		SelectGroup: () => Fd,
		SelectIcon: () => Rd,
		SelectItem: () => Hd,
		SelectItemIndicator: () => Vd,
		SelectItemText: () => qd,
		SelectLabel: () => zd,
		SelectPortal: () => kd,
		SelectScrollDownButton: () => Wd,
		SelectScrollUpButton: () => Gd,
		SelectSeparator: () => Xd,
		SelectTrigger: () => Sd,
		SelectValue: () => yd,
		SelectViewport: () => Od,
		Separator: () => Xd,
		Trigger: () => Sd,
		Value: () => yd,
		Viewport: () => Od,
		createSelectScope: () => Rx,
		unstable_BubbleInput: () => ls,
		unstable_Provider: () => ns,
		unstable_SelectBubbleInput: () => ls,
		unstable_SelectProvider: () => ns
	})
	function ns(e) {
		let {
				__scopeSelect: t,
				children: a,
				open: o,
				defaultOpen: r,
				onOpenChange: n,
				value: s,
				defaultValue: l,
				onValueChange: i,
				dir: d,
				name: u,
				autoComplete: f,
				disabled: m,
				required: g,
				form: h,
				internal_do_not_use_render: p
			} = e,
			x = cr(t),
			[v, L] = M(null),
			[C, b] = M(null),
			[I, P] = M(!1),
			k = St(d),
			[w, E] = Ue({ prop: o, defaultProp: r ?? !1, onChange: n, caller: Jt }),
			[U, S] = Ue({ prop: s, defaultProp: l, onChange: i, caller: Jt }),
			T = D(null),
			F = v ? !!h || !!v.closest('form') : !0,
			[N, H] = M(new Set()),
			z = Ae(),
			$ = Array.from(N)
				.map((me) => me.props.value)
				.join(';'),
			A = q((me) => {
				H((Ie) => new Set(Ie).add(me))
			}, []),
			Q = q((me) => {
				H((Ie) => {
					let le = new Set(Ie)
					return (le.delete(me), le)
				})
			}, []),
			oe = {
				required: g,
				trigger: v,
				onTriggerChange: L,
				valueNode: C,
				onValueNodeChange: b,
				valueNodeHasChildren: I,
				onValueNodeHasChildrenChange: P,
				contentId: z,
				value: U,
				onValueChange: S,
				open: w,
				onOpenChange: E,
				dir: k,
				triggerPointerDownPosRef: T,
				disabled: m,
				name: u,
				autoComplete: f,
				form: h,
				nativeOptions: N,
				nativeSelectKey: $,
				isFormControl: F
			}
		return c(er, {
			...x,
			children: c(Px, {
				scope: t,
				...oe,
				children: c(ur.Provider, {
					scope: t,
					children: c(kx, {
						scope: t,
						onNativeOptionAdd: A,
						onNativeOptionRemove: Q,
						children: Vx(p) ? p(oe) : a
					})
				})
			})
		})
	}
	function Vx(e) {
		return typeof e == 'function'
	}
	function fr(e) {
		return e === '' || e === void 0
	}
	function Yd(e) {
		let t = xe(e),
			a = D(''),
			o = D(0),
			r = q(
				(s) => {
					let l = a.current + s
					;(t(l),
						(function i(d) {
							;((a.current = d),
								window.clearTimeout(o.current),
								d !== '' && (o.current = window.setTimeout(() => i(''), 1e3)))
						})(l))
				},
				[t]
			),
			n = q(() => {
				;((a.current = ''), window.clearTimeout(o.current))
			}, [])
		return (B(() => () => window.clearTimeout(o.current), []), [a, r, n])
	}
	function Zd(e, t, a) {
		let r = t.length > 1 && Array.from(t).every((d) => d === t[0]) ? t[0] : t,
			n = a ? e.indexOf(a) : -1,
			s = Gx(e, Math.max(n, 0))
		r.length === 1 && (s = s.filter((d) => d !== a))
		let i = s.find((d) => d.textValue.toLowerCase().startsWith(r.toLowerCase()))
		return i !== a ? i : void 0
	}
	function Gx(e, t) {
		return e.map((a, o) => e[(t + o) % e.length])
	}
	var Sx,
		wx,
		Jt,
		ur,
		dr,
		yx,
		Yt,
		Rx,
		cr,
		Px,
		Tt,
		kx,
		Tx,
		Ax,
		bd,
		Id,
		Sd,
		wd,
		yd,
		Dx,
		Rd,
		Pd,
		Mx,
		Ex,
		kd,
		kt,
		Td,
		Ad,
		Xe,
		Dd,
		At,
		Ox,
		Bx,
		Md,
		Fx,
		Ed,
		Nx,
		ts,
		zx,
		ss,
		as,
		Od,
		Bd,
		_x,
		Hx,
		Fd,
		Nd,
		zd,
		ir,
		qx,
		_d,
		Hd,
		Za,
		qd,
		Ud,
		Vd,
		os,
		Gd,
		rs,
		Wd,
		jd,
		Ux,
		Xd,
		Kd,
		$d,
		Jd,
		ls,
		Qd = y(() => {
			'use client'
			K()
			ua()
			jn()
			ut()
			Vr()
			Fe()
			Ye()
			Na()
			vo()
			$r()
			Kr()
			pa()
			$a()
			$a()
			Lo()
			fa()
			Oe()
			Nt()
			wt()
			ca()
			dt()
			Gi()
			Ur()
			vn()
			gn()
			O()
			;((Sx = [' ', 'Enter', 'ArrowUp', 'ArrowDown']),
				(wx = [' ', 'Enter']),
				(Jt = 'Select'),
				([ur, dr, yx] = go(Jt)),
				([Yt, Rx] = be(Jt, [yx, Sa])),
				(cr = Sa()),
				([Px, Tt] = Yt(Jt)),
				([kx, Tx] = Yt(Jt)),
				(Ax = 'SelectProvider'))
			ns.displayName = Ax
			bd = (e) => {
				let { __scopeSelect: t, children: a, ...o } = e
				return c(ns, {
					__scopeSelect: t,
					...o,
					internal_do_not_use_render: ({ isFormControl: r }) =>
						W(Je, { children: [a, r ? c(ls, { __scopeSelect: t }) : null] })
				})
			}
			bd.displayName = Jt
			;((Id = 'SelectTrigger'),
				(Sd = R((e, t) => {
					let { __scopeSelect: a, disabled: o = !1, ...r } = e,
						n = cr(a),
						s = Tt(Id, a),
						l = s.disabled || o,
						i = Z(t, s.onTriggerChange),
						d = dr(a),
						u = D('touch'),
						[f, m, g] = Yd((p) => {
							let x = d().filter((C) => !C.disabled),
								v = x.find((C) => C.value === s.value),
								L = Zd(x, p, v)
							L !== void 0 && s.onValueChange(L.value)
						}),
						h = (p) => {
							;(l || (s.onOpenChange(!0), g()),
								p &&
									(s.triggerPointerDownPosRef.current = {
										x: Math.round(p.pageX),
										y: Math.round(p.pageY)
									}))
						}
					return c(tr, {
						asChild: !0,
						...n,
						children: c(J.button, {
							type: 'button',
							role: 'combobox',
							'aria-controls': s.open ? s.contentId : void 0,
							'aria-expanded': s.open,
							'aria-required': s.required,
							'aria-autocomplete': 'none',
							dir: s.dir,
							'data-state': s.open ? 'open' : 'closed',
							disabled: l,
							'data-disabled': l ? '' : void 0,
							'data-placeholder': fr(s.value) ? '' : void 0,
							...r,
							ref: i,
							onClick: X(r.onClick, (p) => {
								;(p.currentTarget.focus(), u.current !== 'mouse' && h(p))
							}),
							onPointerDown: X(r.onPointerDown, (p) => {
								u.current = p.pointerType
								let x = p.target
								;(x.hasPointerCapture(p.pointerId) && x.releasePointerCapture(p.pointerId),
									p.button === 0 &&
										p.ctrlKey === !1 &&
										p.pointerType === 'mouse' &&
										(h(p), p.preventDefault()))
							}),
							onKeyDown: X(r.onKeyDown, (p) => {
								let x = f.current !== ''
								;(!(p.ctrlKey || p.altKey || p.metaKey) && p.key.length === 1 && m(p.key),
									!(x && p.key === ' ') && Sx.includes(p.key) && (h(), p.preventDefault()))
							})
						})
					})
				})))
			Sd.displayName = Id
			;((wd = 'SelectValue'),
				(yd = R((e, t) => {
					let { __scopeSelect: a, className: o, style: r, children: n, placeholder: s = '', ...l } = e,
						i = Tt(wd, a),
						{ onValueNodeHasChildrenChange: d } = i,
						u = n !== void 0,
						f = Z(t, i.onValueNodeChange)
					ce(() => {
						d(u)
					}, [d, u])
					let m = fr(i.value)
					return c(J.span, {
						...l,
						asChild: m ? !1 : l.asChild,
						ref: f,
						style: { pointerEvents: 'none' },
						children: c($e, { children: m ? s : n }, m ? 'placeholder' : 'value')
					})
				})))
			yd.displayName = wd
			;((Dx = 'SelectIcon'),
				(Rd = R((e, t) => {
					let { __scopeSelect: a, children: o, ...r } = e
					return c(J.span, { 'aria-hidden': !0, ...r, ref: t, children: o || '\u25BC' })
				})))
			Rd.displayName = Dx
			;((Pd = 'SelectPortal'),
				([Mx, Ex] = Yt(Pd, { forceMount: void 0 })),
				(kd = (e) => {
					let { __scopeSelect: t, forceMount: a, ...o } = e
					return c(Mx, { scope: e.__scopeSelect, forceMount: a, children: c(_t, { asChild: !0, ...o }) })
				}))
			kd.displayName = Pd
			;((kt = 'SelectContent'),
				(Td = R((e, t) => {
					let a = Ex(kt, e.__scopeSelect),
						{ forceMount: o = a.forceMount, ...r } = e,
						n = Tt(kt, e.__scopeSelect),
						[s, l] = M()
					return (
						ce(() => {
							l(new DocumentFragment())
						}, []),
						c(Se, {
							present: o || n.open,
							children: ({ present: i }) => (i ? c(Md, { ...r, ref: t }) : c(Ad, { ...r, fragment: s }))
						})
					)
				})))
			Td.displayName = kt
			Ad = R((e, t) => {
				let { __scopeSelect: a, children: o, fragment: r } = e
				return r
					? Fa(
							c(Dd, {
								scope: a,
								children: c(ur.Slot, { scope: a, children: c('div', { ref: t, children: o }) })
							}),
							r
						)
					: null
			})
			Ad.displayName = 'SelectContentFragment'
			;((Xe = 10),
				([Dd, At] = Yt(kt)),
				(Ox = 'SelectContentImpl'),
				(Bx = qe('SelectContent.RemoveScroll')),
				(Md = R((e, t) => {
					let { __scopeSelect: a } = e,
						{
							position: o = 'item-aligned',
							onCloseAutoFocus: r,
							onEscapeKeyDown: n,
							onPointerDownOutside: s,
							side: l,
							sideOffset: i,
							align: d,
							alignOffset: u,
							arrowPadding: f,
							collisionBoundary: m,
							collisionPadding: g,
							sticky: h,
							hideWhenDetached: p,
							avoidCollisions: x,
							...v
						} = e,
						L = Tt(kt, a),
						[C, b] = M(null),
						[I, P] = M(null),
						k = Z(t, (_) => b(_)),
						[w, E] = M(null),
						[U, S] = M(null),
						T = dr(a),
						[F, N] = M(!1),
						H = D(!1)
					;(B(() => {
						if (C) return To(C)
					}, [C]),
						bo())
					let z = q(
							(_) => {
								let [ne, ...he] = T().map((fe) => fe.ref.current),
									[se] = he.slice(-1),
									ie = document.activeElement
								for (let fe of _)
									if (
										fe === ie ||
										(fe?.scrollIntoView({ block: 'nearest' }),
										fe === ne && I && (I.scrollTop = 0),
										fe === se && I && (I.scrollTop = I.scrollHeight),
										fe?.focus(),
										document.activeElement !== ie)
									)
										return
							},
							[T, I]
						),
						$ = q(() => z([w, C]), [z, w, C])
					B(() => {
						F && $()
					}, [F, $])
					let { onOpenChange: A, triggerPointerDownPosRef: Q } = L
					;(B(() => {
						if (C) {
							let _ = { x: 0, y: 0 },
								ne = (se) => {
									_ = {
										x: Math.abs(Math.round(se.pageX) - (Q.current?.x ?? 0)),
										y: Math.abs(Math.round(se.pageY) - (Q.current?.y ?? 0))
									}
								},
								he = (se) => {
									;(_.x <= 10 && _.y <= 10
										? se.preventDefault()
										: se.composedPath().includes(C) || A(!1),
										document.removeEventListener('pointermove', ne),
										(Q.current = null))
								}
							return (
								Q.current !== null &&
									(document.addEventListener('pointermove', ne),
									document.addEventListener('pointerup', he, { capture: !0, once: !0 })),
								() => {
									;(document.removeEventListener('pointermove', ne),
										document.removeEventListener('pointerup', he, { capture: !0 }))
								}
							)
						}
					}, [C, A, Q]),
						B(() => {
							let _ = () => A(!1)
							return (
								window.addEventListener('blur', _),
								window.addEventListener('resize', _),
								() => {
									;(window.removeEventListener('blur', _), window.removeEventListener('resize', _))
								}
							)
						}, [A]))
					let [oe, me] = Yd((_) => {
							let ne = T().filter((ie) => !ie.disabled),
								he = ne.find((ie) => ie.ref.current === document.activeElement),
								se = Zd(ne, _, he)
							se && setTimeout(() => se.ref.current?.focus())
						}),
						Ie = q(
							(_, ne, he) => {
								let se = !H.current && !he
								;((L.value !== void 0 && L.value === ne) || se) && (E(_), se && (H.current = !0))
							},
							[L.value]
						),
						le = q(() => C?.focus(), [C]),
						pe = q(
							(_, ne, he) => {
								let se = !H.current && !he
								;((L.value !== void 0 && L.value === ne) || se) && S(_)
							},
							[L.value]
						),
						Ee = o === 'popper' ? ts : Ed,
						ve =
							Ee === ts
								? {
										side: l,
										sideOffset: i,
										align: d,
										alignOffset: u,
										arrowPadding: f,
										collisionBoundary: m,
										collisionPadding: g,
										sticky: h,
										hideWhenDetached: p,
										avoidCollisions: x
									}
								: {}
					return c(Dd, {
						scope: a,
						content: C,
						viewport: I,
						onViewportChange: P,
						itemRefCallback: Ie,
						selectedItem: w,
						onItemLeave: le,
						itemTextRefCallback: pe,
						focusSelectedItem: $,
						selectedItemText: U,
						position: o,
						isPositioned: F,
						searchRef: oe,
						children: c(Ua, {
							as: Bx,
							allowPinchZoom: !0,
							children: c(za, {
								asChild: !0,
								trapped: L.open,
								onMountAutoFocus: (_) => {
									_.preventDefault()
								},
								onUnmountAutoFocus: X(r, (_) => {
									;(L.trigger?.focus({ preventScroll: !0 }), _.preventDefault())
								}),
								children: c(zt, {
									asChild: !0,
									disableOutsidePointerEvents: !0,
									onEscapeKeyDown: n,
									onPointerDownOutside: s,
									onFocusOutside: (_) => _.preventDefault(),
									onDismiss: () => L.onOpenChange(!1),
									children: c(Ee, {
										role: 'listbox',
										id: L.contentId,
										'data-state': L.open ? 'open' : 'closed',
										dir: L.dir,
										onContextMenu: (_) => _.preventDefault(),
										...v,
										...ve,
										onPlaced: () => N(!0),
										ref: k,
										style: {
											display: 'flex',
											flexDirection: 'column',
											outline: 'none',
											...v.style
										},
										onKeyDown: X(v.onKeyDown, (_) => {
											let ne = _.ctrlKey || _.altKey || _.metaKey
											if (
												(_.key === 'Tab' && _.preventDefault(),
												!ne && _.key.length === 1 && me(_.key),
												['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(_.key))
											) {
												let se = T()
													.filter((ie) => !ie.disabled)
													.map((ie) => ie.ref.current)
												if (
													(['ArrowUp', 'End'].includes(_.key) && (se = se.slice().reverse()),
													['ArrowUp', 'ArrowDown'].includes(_.key))
												) {
													let ie = _.target,
														fe = se.indexOf(ie)
													se = se.slice(fe + 1)
												}
												;(setTimeout(() => z(se)), _.preventDefault())
											}
										})
									})
								})
							})
						})
					})
				})))
			Md.displayName = Ox
			;((Fx = 'SelectItemAlignedPosition'),
				(Ed = R((e, t) => {
					let { __scopeSelect: a, onPlaced: o, ...r } = e,
						n = Tt(kt, a),
						s = At(kt, a),
						[l, i] = M(null),
						[d, u] = M(null),
						f = Z(t, (k) => u(k)),
						m = dr(a),
						g = D(!1),
						h = D(!0),
						{ viewport: p, selectedItem: x, selectedItemText: v, focusSelectedItem: L } = s,
						C = q(() => {
							if (n.trigger && n.valueNode && l && d && p && x && v) {
								let k = n.trigger.getBoundingClientRect(),
									w = d.getBoundingClientRect(),
									E = n.valueNode.getBoundingClientRect(),
									U = v.getBoundingClientRect()
								if (n.dir !== 'rtl') {
									let ie = U.left - w.left,
										fe = E.left - ie,
										nt = k.left - fe,
										Be = k.width + nt,
										Tr = Math.max(Be, w.width),
										Ar = window.innerWidth - Xe,
										Dr = Ya(fe, [Xe, Math.max(Xe, Ar - Tr)])
									;((l.style.minWidth = Be + 'px'), (l.style.left = Dr + 'px'))
								} else {
									let ie = w.right - U.right,
										fe = window.innerWidth - E.right - ie,
										nt = window.innerWidth - k.right - fe,
										Be = k.width + nt,
										Tr = Math.max(Be, w.width),
										Ar = window.innerWidth - Xe,
										Dr = Ya(fe, [Xe, Math.max(Xe, Ar - Tr)])
									;((l.style.minWidth = Be + 'px'), (l.style.right = Dr + 'px'))
								}
								let S = m(),
									T = window.innerHeight - Xe * 2,
									F = p.scrollHeight,
									N = window.getComputedStyle(d),
									H = parseInt(N.borderTopWidth, 10),
									z = parseInt(N.paddingTop, 10),
									$ = parseInt(N.borderBottomWidth, 10),
									A = parseInt(N.paddingBottom, 10),
									Q = H + z + F + A + $,
									oe = Math.min(x.offsetHeight * 5, Q),
									me = window.getComputedStyle(p),
									Ie = parseInt(me.paddingTop, 10),
									le = parseInt(me.paddingBottom, 10),
									pe = k.top + k.height / 2 - Xe,
									Ee = T - pe,
									ve = x.offsetHeight / 2,
									_ = x.offsetTop + ve,
									ne = H + z + _,
									he = Q - ne
								if (ne <= pe) {
									let ie = S.length > 0 && x === S[S.length - 1].ref.current
									l.style.bottom = '0px'
									let fe = d.clientHeight - p.offsetTop - p.offsetHeight,
										nt = Math.max(Ee, ve + (ie ? le : 0) + fe + $),
										Be = ne + nt
									l.style.height = Be + 'px'
								} else {
									let ie = S.length > 0 && x === S[0].ref.current
									l.style.top = '0px'
									let nt = Math.max(pe, H + p.offsetTop + (ie ? Ie : 0) + ve) + he
									;((l.style.height = nt + 'px'), (p.scrollTop = ne - pe + p.offsetTop))
								}
								;((l.style.margin = `${Xe}px 0`),
									(l.style.minHeight = oe + 'px'),
									(l.style.maxHeight = T + 'px'),
									o?.(),
									requestAnimationFrame(() => (g.current = !0)))
							}
						}, [m, n.trigger, n.valueNode, l, d, p, x, v, n.dir, o])
					ce(() => C(), [C])
					let [b, I] = M()
					ce(() => {
						d && I(window.getComputedStyle(d).zIndex)
					}, [d])
					let P = q(
						(k) => {
							k && h.current === !0 && (C(), L?.(), (h.current = !1))
						},
						[C, L]
					)
					return c(zx, {
						scope: a,
						contentWrapper: l,
						shouldExpandOnScrollRef: g,
						onScrollButtonChange: P,
						children: c('div', {
							ref: i,
							style: { display: 'flex', flexDirection: 'column', position: 'fixed', zIndex: b },
							children: c(J.div, {
								...r,
								ref: f,
								style: { boxSizing: 'border-box', maxHeight: '100%', ...r.style }
							})
						})
					})
				})))
			Ed.displayName = Fx
			;((Nx = 'SelectPopperPosition'),
				(ts = R((e, t) => {
					let { __scopeSelect: a, align: o = 'start', collisionPadding: r = Xe, ...n } = e,
						s = cr(a)
					return c(ar, {
						...s,
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
			ts.displayName = Nx
			;(([zx, ss] = Yt(kt, {})),
				(as = 'SelectViewport'),
				(Od = R((e, t) => {
					let { __scopeSelect: a, nonce: o, ...r } = e,
						n = At(as, a),
						s = ss(as, a),
						l = Z(t, n.onViewportChange),
						i = D(0)
					return W(Je, {
						children: [
							c('style', {
								dangerouslySetInnerHTML: {
									__html: '[data-radix-select-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-select-viewport]::-webkit-scrollbar{display:none}'
								},
								nonce: o
							}),
							c(ur.Slot, {
								scope: a,
								children: c(J.div, {
									'data-radix-select-viewport': '',
									role: 'presentation',
									...r,
									ref: l,
									style: { position: 'relative', flex: 1, overflow: 'hidden auto', ...r.style },
									onScroll: X(r.onScroll, (d) => {
										let u = d.currentTarget,
											{ contentWrapper: f, shouldExpandOnScrollRef: m } = s
										if (m?.current && f) {
											let g = Math.abs(i.current - u.scrollTop)
											if (g > 0) {
												let h = window.innerHeight - Xe * 2,
													p = parseFloat(f.style.minHeight),
													x = parseFloat(f.style.height),
													v = Math.max(p, x)
												if (v < h) {
													let L = v + g,
														C = Math.min(h, L),
														b = L - C
													;((f.style.height = C + 'px'),
														f.style.bottom === '0px' &&
															((u.scrollTop = b > 0 ? b : 0),
															(f.style.justifyContent = 'flex-end')))
												}
											}
										}
										i.current = u.scrollTop
									})
								})
							})
						]
					})
				})))
			Od.displayName = as
			;((Bd = 'SelectGroup'),
				([_x, Hx] = Yt(Bd)),
				(Fd = R((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = Ae()
					return c(_x, {
						scope: a,
						id: r,
						children: c(J.div, { role: 'group', 'aria-labelledby': r, ...o, ref: t })
					})
				})))
			Fd.displayName = Bd
			;((Nd = 'SelectLabel'),
				(zd = R((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = Hx(Nd, a)
					return c(J.div, { id: r.id, ...o, ref: t })
				})))
			zd.displayName = Nd
			;((ir = 'SelectItem'),
				([qx, _d] = Yt(ir)),
				(Hd = R((e, t) => {
					let { __scopeSelect: a, value: o, disabled: r = !1, textValue: n, ...s } = e,
						l = Tt(ir, a),
						i = At(ir, a),
						d = l.value === o,
						[u, f] = M(n ?? ''),
						[m, g] = M(!1),
						h = Z(t, (L) => i.itemRefCallback?.(L, o, r)),
						p = Ae(),
						x = D('touch'),
						v = () => {
							r || (l.onValueChange(o), l.onOpenChange(!1))
						}
					return c(qx, {
						scope: a,
						value: o,
						disabled: r,
						textId: p,
						isSelected: d,
						onItemTextChange: q((L) => {
							f((C) => C || (L?.textContent ?? '').trim())
						}, []),
						children: c(ur.ItemSlot, {
							scope: a,
							value: o,
							disabled: r,
							textValue: u,
							children: c(J.div, {
								role: 'option',
								'aria-labelledby': p,
								'data-highlighted': m ? '' : void 0,
								'aria-selected': d && m,
								'data-state': d ? 'checked' : 'unchecked',
								'aria-disabled': r || void 0,
								'data-disabled': r ? '' : void 0,
								tabIndex: r ? void 0 : -1,
								...s,
								ref: h,
								onFocus: X(s.onFocus, () => g(!0)),
								onBlur: X(s.onBlur, () => g(!1)),
								onClick: X(s.onClick, () => {
									x.current !== 'mouse' && v()
								}),
								onPointerUp: X(s.onPointerUp, () => {
									x.current === 'mouse' && v()
								}),
								onPointerDown: X(s.onPointerDown, (L) => {
									x.current = L.pointerType
								}),
								onPointerMove: X(s.onPointerMove, (L) => {
									;((x.current = L.pointerType),
										r
											? i.onItemLeave?.()
											: x.current === 'mouse' && L.currentTarget.focus({ preventScroll: !0 }))
								}),
								onPointerLeave: X(s.onPointerLeave, (L) => {
									L.currentTarget === document.activeElement && i.onItemLeave?.()
								}),
								onKeyDown: X(s.onKeyDown, (L) => {
									;(i.searchRef?.current !== '' && L.key === ' ') ||
										(wx.includes(L.key) && v(), L.key === ' ' && L.preventDefault())
								})
							})
						})
					})
				})))
			Hd.displayName = ir
			;((Za = 'SelectItemText'),
				(qd = R((e, t) => {
					let { __scopeSelect: a, className: o, style: r, ...n } = e,
						s = Tt(Za, a),
						l = At(Za, a),
						i = _d(Za, a),
						d = Tx(Za, a),
						[u, f] = M(null),
						m = Z(
							t,
							(v) => f(v),
							i.onItemTextChange,
							(v) => l.itemTextRefCallback?.(v, i.value, i.disabled)
						),
						g = u?.textContent,
						h = de(
							() => c('option', { value: i.value, disabled: i.disabled, children: g }, i.value),
							[i.disabled, i.value, g]
						),
						{ onNativeOptionAdd: p, onNativeOptionRemove: x } = d
					return (
						ce(() => (p(h), () => x(h)), [p, x, h]),
						W(Je, {
							children: [
								c(J.span, { id: i.textId, ...n, ref: m }),
								i.isSelected && s.valueNode && !s.valueNodeHasChildren && !fr(s.value)
									? Fa(n.children, s.valueNode)
									: null
							]
						})
					)
				})))
			qd.displayName = Za
			;((Ud = 'SelectItemIndicator'),
				(Vd = R((e, t) => {
					let { __scopeSelect: a, ...o } = e
					return _d(Ud, a).isSelected ? c(J.span, { 'aria-hidden': !0, ...o, ref: t }) : null
				})))
			Vd.displayName = Ud
			;((os = 'SelectScrollUpButton'),
				(Gd = R((e, t) => {
					let a = At(os, e.__scopeSelect),
						o = ss(os, e.__scopeSelect),
						[r, n] = M(!1),
						s = Z(t, o.onScrollButtonChange)
					return (
						ce(() => {
							if (a.viewport && a.isPositioned) {
								let i = function () {
									let u = d.scrollTop > 0
									n(u)
								}
								var l = i
								let d = a.viewport
								return (i(), d.addEventListener('scroll', i), () => d.removeEventListener('scroll', i))
							}
						}, [a.viewport, a.isPositioned]),
						r
							? c(jd, {
									...e,
									ref: s,
									onAutoScroll: () => {
										let { viewport: l, selectedItem: i } = a
										l && i && (l.scrollTop = l.scrollTop - i.offsetHeight)
									}
								})
							: null
					)
				})))
			Gd.displayName = os
			;((rs = 'SelectScrollDownButton'),
				(Wd = R((e, t) => {
					let a = At(rs, e.__scopeSelect),
						o = ss(rs, e.__scopeSelect),
						[r, n] = M(!1),
						s = Z(t, o.onScrollButtonChange)
					return (
						ce(() => {
							if (a.viewport && a.isPositioned) {
								let i = function () {
									let u = d.scrollHeight - d.clientHeight,
										f = Math.ceil(d.scrollTop) < u
									n(f)
								}
								var l = i
								let d = a.viewport
								return (i(), d.addEventListener('scroll', i), () => d.removeEventListener('scroll', i))
							}
						}, [a.viewport, a.isPositioned]),
						r
							? c(jd, {
									...e,
									ref: s,
									onAutoScroll: () => {
										let { viewport: l, selectedItem: i } = a
										l && i && (l.scrollTop = l.scrollTop + i.offsetHeight)
									}
								})
							: null
					)
				})))
			Wd.displayName = rs
			;((jd = R((e, t) => {
				let { __scopeSelect: a, onAutoScroll: o, ...r } = e,
					n = At('SelectScrollButton', a),
					s = D(null),
					l = dr(a),
					i = q(() => {
						s.current !== null && (window.clearInterval(s.current), (s.current = null))
					}, [])
				return (
					B(() => () => i(), [i]),
					ce(() => {
						l()
							.find((u) => u.ref.current === document.activeElement)
							?.ref.current?.scrollIntoView({ block: 'nearest' })
					}, [l]),
					c(J.div, {
						'aria-hidden': !0,
						...r,
						ref: t,
						style: { flexShrink: 0, ...r.style },
						onPointerDown: X(r.onPointerDown, () => {
							s.current === null && (s.current = window.setInterval(o, 50))
						}),
						onPointerMove: X(r.onPointerMove, () => {
							;(n.onItemLeave?.(), s.current === null && (s.current = window.setInterval(o, 50)))
						}),
						onPointerLeave: X(r.onPointerLeave, () => {
							i()
						})
					})
				)
			})),
				(Ux = 'SelectSeparator'),
				(Xd = R((e, t) => {
					let { __scopeSelect: a, ...o } = e
					return c(J.div, { 'aria-hidden': !0, ...o, ref: t })
				})))
			Xd.displayName = Ux
			;((Kd = 'SelectArrow'),
				($d = R((e, t) => {
					let { __scopeSelect: a, ...o } = e,
						r = cr(a)
					return At(Kd, a).position === 'popper' ? c(or, { ...r, ...o, ref: t }) : null
				})))
			$d.displayName = Kd
			;((Jd = 'SelectBubbleInput'),
				(ls = R(({ __scopeSelect: e, ...t }, a) => {
					let o = Tt(Jd, e),
						{ value: r, onValueChange: n, required: s, disabled: l, name: i, autoComplete: d, form: u } = o,
						{ nativeOptions: f, nativeSelectKey: m } = o,
						g = D(null),
						h = Z(a, g),
						p = r ?? '',
						x = Vi(p),
						v = Array.from(f).some((L) => (L.props.value ?? '') === '')
					return (
						B(() => {
							let L = g.current
							if (!L) return
							let C = window.HTMLSelectElement.prototype,
								I = Object.getOwnPropertyDescriptor(C, 'value').set
							if (x !== p && I) {
								let P = new Event('change', { bubbles: !0 })
								;(I.call(L, p), L.dispatchEvent(P))
							}
						}, [x, p]),
						W(
							J.select,
							{
								'aria-hidden': !0,
								required: s,
								tabIndex: -1,
								name: i,
								autoComplete: d,
								disabled: l,
								form: u,
								onChange: (L) => n(L.target.value),
								...t,
								style: { ...qr, ...t.style },
								ref: h,
								defaultValue: p,
								children: [fr(r) && !v ? c('option', { value: '' }) : null, Array.from(f)]
							},
							m
						)
					)
				})))
			ls.displayName = Jd
		})
	var Zt = {}
	Lt(Zt, {
		Content: () => Yx,
		List: () => $x,
		Root: () => Kx,
		Tabs: () => us,
		TabsContent: () => fs,
		TabsList: () => ds,
		TabsTrigger: () => cs,
		Trigger: () => Jx,
		createTabsScope: () => jx
	})
	function rc(e, t) {
		return `${e}-trigger-${t}`
	}
	function nc(e, t) {
		return `${e}-content-${t}`
	}
	var pr,
		Wx,
		jx,
		ec,
		Xx,
		is,
		us,
		tc,
		ds,
		ac,
		cs,
		oc,
		fs,
		Kx,
		$x,
		Jx,
		Yx,
		sc = y(() => {
			'use client'
			K()
			ut()
			Ye()
			Wn()
			fa()
			Oe()
			Wn()
			Na()
			ca()
			pa()
			O()
			;((pr = 'Tabs'),
				([Wx, jx] = be(pr, [Gn])),
				(ec = Gn()),
				([Xx, is] = Wx(pr)),
				(us = R((e, t) => {
					let {
							__scopeTabs: a,
							value: o,
							onValueChange: r,
							defaultValue: n,
							orientation: s = 'horizontal',
							dir: l,
							activationMode: i = 'automatic',
							...d
						} = e,
						u = St(l),
						[f, m] = Ue({ prop: o, onChange: r, defaultProp: n ?? '', caller: pr })
					return c(Xx, {
						scope: a,
						baseId: Ae(),
						value: f,
						onValueChange: m,
						orientation: s,
						dir: u,
						activationMode: i,
						children: c(J.div, { dir: u, 'data-orientation': s, ...d, ref: t })
					})
				})))
			us.displayName = pr
			;((tc = 'TabsList'),
				(ds = R((e, t) => {
					let { __scopeTabs: a, loop: o = !0, ...r } = e,
						n = is(tc, a),
						s = ec(a)
					return c(ud, {
						asChild: !0,
						...s,
						orientation: n.orientation,
						dir: n.dir,
						loop: o,
						children: c(J.div, { role: 'tablist', 'aria-orientation': n.orientation, ...r, ref: t })
					})
				})))
			ds.displayName = tc
			;((ac = 'TabsTrigger'),
				(cs = R((e, t) => {
					let { __scopeTabs: a, value: o, disabled: r = !1, ...n } = e,
						s = is(ac, a),
						l = ec(a),
						i = rc(s.baseId, o),
						d = nc(s.baseId, o),
						u = o === s.value
					return c(dd, {
						asChild: !0,
						...l,
						focusable: !r,
						active: u,
						children: c(J.button, {
							type: 'button',
							role: 'tab',
							'aria-selected': u,
							'aria-controls': d,
							'data-state': u ? 'active' : 'inactive',
							'data-disabled': r ? '' : void 0,
							disabled: r,
							id: i,
							...n,
							ref: t,
							onMouseDown: X(e.onMouseDown, (f) => {
								!r && f.button === 0 && f.ctrlKey === !1 ? s.onValueChange(o) : f.preventDefault()
							}),
							onKeyDown: X(e.onKeyDown, (f) => {
								;[' ', 'Enter'].includes(f.key) && s.onValueChange(o)
							}),
							onFocus: X(e.onFocus, () => {
								let f = s.activationMode !== 'manual'
								!u && !r && f && s.onValueChange(o)
							})
						})
					})
				})))
			cs.displayName = ac
			;((oc = 'TabsContent'),
				(fs = R((e, t) => {
					let { __scopeTabs: a, value: o, forceMount: r, children: n, ...s } = e,
						l = is(oc, a),
						i = rc(l.baseId, o),
						d = nc(l.baseId, o),
						u = o === l.value,
						f = D(u)
					return (
						B(() => {
							let m = requestAnimationFrame(() => (f.current = !1))
							return () => cancelAnimationFrame(m)
						}, []),
						c(Se, {
							present: r || u,
							children: ({ present: m }) =>
								c(J.div, {
									'data-state': u ? 'active' : 'inactive',
									'data-orientation': l.orientation,
									role: 'tabpanel',
									'aria-labelledby': i,
									hidden: !m,
									id: d,
									tabIndex: 0,
									...s,
									ref: t,
									style: { ...e.style, animationDuration: f.current ? '0s' : void 0 },
									children: m && n
								})
						})
					)
				})))
			fs.displayName = oc
			;((Kx = us), ($x = ds), (Jx = cs), (Yx = fs))
		})
	var pt = {}
	Lt(pt, {
		Arrow: () => Lv,
		Content: () => vv,
		Portal: () => xv,
		Provider: () => mv,
		Root: () => hv,
		Tooltip: () => xs,
		TooltipArrow: () => Is,
		TooltipContent: () => bs,
		TooltipPortal: () => Cs,
		TooltipProvider: () => gs,
		TooltipTrigger: () => vs,
		Trigger: () => gv,
		createTooltipScope: () => Zx
	})
	function iv(e, t) {
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
	function uv(e, t, a = 5) {
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
	function dv(e) {
		let { top: t, right: a, bottom: o, left: r } = e
		return [
			{ x: r, y: t },
			{ x: a, y: t },
			{ x: a, y: o },
			{ x: r, y: o }
		]
	}
	function cv(e, t) {
		let { x: a, y: o } = e,
			r = !1
		for (let n = 0, s = t.length - 1; n < t.length; s = n++) {
			let l = t[n],
				i = t[s],
				d = l.x,
				u = l.y,
				f = i.x,
				m = i.y
			u > o != m > o && a < ((f - d) * (o - u)) / (m - u) + d && (r = !r)
		}
		return r
	}
	function fv(e) {
		let t = e.slice()
		return (t.sort((a, o) => (a.x < o.x ? -1 : a.x > o.x ? 1 : a.y < o.y ? -1 : a.y > o.y ? 1 : 0)), pv(t))
	}
	function pv(e) {
		if (e.length <= 1) return e.slice()
		let t = []
		for (let o = 0; o < e.length; o++) {
			let r = e[o]
			for (; t.length >= 2; ) {
				let n = t[t.length - 1],
					s = t[t.length - 2]
				if ((n.x - s.x) * (r.y - s.y) >= (n.y - s.y) * (r.x - s.x)) t.pop()
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
					s = a[a.length - 2]
				if ((n.x - s.x) * (r.y - s.y) >= (n.y - s.y) * (r.x - s.x)) a.pop()
				else break
			}
			a.push(r)
		}
		return (a.pop(), t.length === 1 && a.length === 1 && t[0].x === a[0].x && t[0].y === a[0].y ? t : t.concat(a))
	}
	var mr,
		Zx,
		hr,
		lc,
		Qx,
		ps,
		ev,
		hs,
		gs,
		Qa,
		tv,
		eo,
		xs,
		ms,
		vs,
		Ls,
		av,
		ov,
		Cs,
		ya,
		bs,
		rv,
		nv,
		sv,
		lv,
		ic,
		uc,
		Is,
		mv,
		hv,
		gv,
		xv,
		vv,
		Lv,
		dc = y(() => {
			'use client'
			K()
			ut()
			Fe()
			Ye()
			vo()
			pa()
			$a()
			$a()
			Lo()
			fa()
			Oe()
			Nt()
			ca()
			Ur()
			O()
			;(([mr, Zx] = be('Tooltip', [Sa])),
				(hr = Sa()),
				(lc = 'TooltipProvider'),
				(Qx = 700),
				(ps = 'tooltip.open'),
				([ev, hs] = mr(lc)),
				(gs = (e) => {
					let {
							__scopeTooltip: t,
							delayDuration: a = Qx,
							skipDelayDuration: o = 300,
							disableHoverableContent: r = !1,
							children: n
						} = e,
						s = D(!0),
						l = D(!1),
						i = D(0)
					return (
						B(() => {
							let d = i.current
							return () => window.clearTimeout(d)
						}, []),
						c(ev, {
							scope: t,
							isOpenDelayedRef: s,
							delayDuration: a,
							onOpen: q(() => {
								o <= 0 || (window.clearTimeout(i.current), (s.current = !1))
							}, [o]),
							onClose: q(() => {
								o <= 0 ||
									(window.clearTimeout(i.current),
									(i.current = window.setTimeout(() => (s.current = !0), o)))
							}, [o]),
							isPointerInTransitRef: l,
							onPointerInTransitChange: q((d) => {
								l.current = d
							}, []),
							disableHoverableContent: r,
							children: n
						})
					)
				}))
			gs.displayName = lc
			;((Qa = 'Tooltip'),
				([tv, eo] = mr(Qa)),
				(xs = (e) => {
					let {
							__scopeTooltip: t,
							children: a,
							open: o,
							defaultOpen: r,
							onOpenChange: n,
							disableHoverableContent: s,
							delayDuration: l
						} = e,
						i = hs(Qa, e.__scopeTooltip),
						d = hr(t),
						[u, f] = M(null),
						m = Ae(),
						g = D(0),
						h = s ?? i.disableHoverableContent,
						p = l ?? i.delayDuration,
						x = D(!1),
						[v, L] = Ue({
							prop: o,
							defaultProp: r ?? !1,
							onChange: (k) => {
								;(k ? (i.onOpen(), document.dispatchEvent(new CustomEvent(ps))) : i.onClose(), n?.(k))
							},
							caller: Qa
						}),
						C = de(() => (v ? (x.current ? 'delayed-open' : 'instant-open') : 'closed'), [v]),
						b = q(() => {
							;(window.clearTimeout(g.current), (g.current = 0), (x.current = !1), L(!0))
						}, [L]),
						I = q(() => {
							;(window.clearTimeout(g.current), (g.current = 0), L(!1))
						}, [L]),
						P = q(() => {
							;(window.clearTimeout(g.current),
								(g.current = window.setTimeout(() => {
									;((x.current = !0), L(!0), (g.current = 0))
								}, p)))
						}, [p, L])
					return (
						B(
							() => () => {
								g.current && (window.clearTimeout(g.current), (g.current = 0))
							},
							[]
						),
						c(er, {
							...d,
							children: c(tv, {
								scope: t,
								contentId: m,
								open: v,
								stateAttribute: C,
								trigger: u,
								onTriggerChange: f,
								onTriggerEnter: q(() => {
									i.isOpenDelayedRef.current ? P() : b()
								}, [i.isOpenDelayedRef, P, b]),
								onTriggerLeave: q(() => {
									h ? I() : (window.clearTimeout(g.current), (g.current = 0))
								}, [I, h]),
								onOpen: b,
								onClose: I,
								disableHoverableContent: h,
								children: a
							})
						})
					)
				}))
			xs.displayName = Qa
			;((ms = 'TooltipTrigger'),
				(vs = R((e, t) => {
					let { __scopeTooltip: a, ...o } = e,
						r = eo(ms, a),
						n = hs(ms, a),
						s = hr(a),
						l = D(null),
						i = Z(t, l, r.onTriggerChange),
						d = D(!1),
						u = D(!1),
						f = q(() => (d.current = !1), [])
					return (
						B(() => () => document.removeEventListener('pointerup', f), [f]),
						c(tr, {
							asChild: !0,
							...s,
							children: c(J.button, {
								'aria-describedby': r.open ? r.contentId : void 0,
								'data-state': r.stateAttribute,
								...o,
								ref: i,
								onPointerMove: X(e.onPointerMove, (m) => {
									m.pointerType !== 'touch' &&
										!u.current &&
										!n.isPointerInTransitRef.current &&
										(r.onTriggerEnter(), (u.current = !0))
								}),
								onPointerLeave: X(e.onPointerLeave, () => {
									;(r.onTriggerLeave(), (u.current = !1))
								}),
								onPointerDown: X(e.onPointerDown, () => {
									;(r.open && r.onClose(),
										(d.current = !0),
										document.addEventListener('pointerup', f, { once: !0 }))
								}),
								onFocus: X(e.onFocus, () => {
									d.current || r.onOpen()
								}),
								onBlur: X(e.onBlur, r.onClose),
								onClick: X(e.onClick, r.onClose)
							})
						})
					)
				})))
			vs.displayName = ms
			;((Ls = 'TooltipPortal'),
				([av, ov] = mr(Ls, { forceMount: void 0 })),
				(Cs = (e) => {
					let { __scopeTooltip: t, forceMount: a, children: o, container: r } = e,
						n = eo(Ls, t)
					return c(av, {
						scope: t,
						forceMount: a,
						children: c(Se, {
							present: a || n.open,
							children: c(_t, { asChild: !0, container: r, children: o })
						})
					})
				}))
			Cs.displayName = Ls
			;((ya = 'TooltipContent'),
				(bs = R((e, t) => {
					let a = ov(ya, e.__scopeTooltip),
						{ forceMount: o = a.forceMount, side: r = 'top', ...n } = e,
						s = eo(ya, e.__scopeTooltip)
					return c(Se, {
						present: o || s.open,
						children: s.disableHoverableContent
							? c(ic, { side: r, ...n, ref: t })
							: c(rv, { side: r, ...n, ref: t })
					})
				})),
				(rv = R((e, t) => {
					let a = eo(ya, e.__scopeTooltip),
						o = hs(ya, e.__scopeTooltip),
						r = D(null),
						n = Z(t, r),
						[s, l] = M(null),
						{ trigger: i, onClose: d } = a,
						u = r.current,
						{ onPointerInTransitChange: f } = o,
						m = q(() => {
							;(l(null), f(!1))
						}, [f]),
						g = q(
							(h, p) => {
								let x = h.currentTarget,
									v = { x: h.clientX, y: h.clientY },
									L = iv(v, x.getBoundingClientRect()),
									C = uv(v, L),
									b = dv(p.getBoundingClientRect()),
									I = fv([...C, ...b])
								;(l(I), f(!0))
							},
							[f]
						)
					return (
						B(() => () => m(), [m]),
						B(() => {
							if (i && u) {
								let h = (x) => g(x, u),
									p = (x) => g(x, i)
								return (
									i.addEventListener('pointerleave', h),
									u.addEventListener('pointerleave', p),
									() => {
										;(i.removeEventListener('pointerleave', h),
											u.removeEventListener('pointerleave', p))
									}
								)
							}
						}, [i, u, g, m]),
						B(() => {
							if (s) {
								let h = (p) => {
									let x = p.target,
										v = { x: p.clientX, y: p.clientY },
										L = i?.contains(x) || u?.contains(x),
										C = !cv(v, s)
									L ? m() : C && (m(), d())
								}
								return (
									document.addEventListener('pointermove', h),
									() => document.removeEventListener('pointermove', h)
								)
							}
						}, [i, u, s, d, m]),
						c(ic, { ...e, ref: n })
					)
				})),
				([nv, sv] = mr(Qa, { isInside: !1 })),
				(lv = ho('TooltipContent')),
				(ic = R((e, t) => {
					let {
							__scopeTooltip: a,
							children: o,
							'aria-label': r,
							onEscapeKeyDown: n,
							onPointerDownOutside: s,
							...l
						} = e,
						i = eo(ya, a),
						d = hr(a),
						{ onClose: u } = i
					return (
						B(() => (document.addEventListener(ps, u), () => document.removeEventListener(ps, u)), [u]),
						B(() => {
							if (i.trigger) {
								let f = (m) => {
									m.target instanceof Node && m.target.contains(i.trigger) && u()
								}
								return (
									window.addEventListener('scroll', f, { capture: !0 }),
									() => window.removeEventListener('scroll', f, { capture: !0 })
								)
							}
						}, [i.trigger, u]),
						c(zt, {
							asChild: !0,
							disableOutsidePointerEvents: !1,
							onEscapeKeyDown: n,
							onPointerDownOutside: s,
							onFocusOutside: (f) => f.preventDefault(),
							onDismiss: u,
							children: W(ar, {
								'data-state': i.stateAttribute,
								...d,
								...l,
								ref: t,
								style: {
									...l.style,
									'--radix-tooltip-content-transform-origin': 'var(--radix-popper-transform-origin)',
									'--radix-tooltip-content-available-width': 'var(--radix-popper-available-width)',
									'--radix-tooltip-content-available-height': 'var(--radix-popper-available-height)',
									'--radix-tooltip-trigger-width': 'var(--radix-popper-anchor-width)',
									'--radix-tooltip-trigger-height': 'var(--radix-popper-anchor-height)'
								},
								children: [
									c(lv, { children: o }),
									c(nv, {
										scope: a,
										isInside: !0,
										children: c(_l, { id: i.contentId, role: 'tooltip', children: r || o })
									})
								]
							})
						})
					)
				})))
			bs.displayName = ya
			;((uc = 'TooltipArrow'),
				(Is = R((e, t) => {
					let { __scopeTooltip: a, ...o } = e,
						r = hr(a)
					return sv(uc, a).isInside ? null : c(or, { ...r, ...o, ref: t })
				})))
			Is.displayName = uc
			;((mv = gs), (hv = xs), (gv = vs), (xv = Cs), (vv = bs), (Lv = Is))
		})
	var mt = y(() => {
		Ui()
		Ho()
		Cd()
		Qd()
		Nt()
		sc()
		dc()
	})
	function gr({ className: e, variant: t = 'default', asChild: a = !1, ...o }) {
		let r = a ? da.Root : 'span'
		return c(r, { 'data-slot': 'badge', 'data-variant': t, className: j(Cv({ variant: t }), e), ...o })
	}
	var Cv,
		cc = y(() => {
			Ba()
			mt()
			re()
			O()
			Cv = It(
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
	function xr({ className: e, variant: t = 'default', size: a = 'default', asChild: o = !1, ...r }) {
		let n = o ? da.Root : 'button'
		return c(n, {
			'data-slot': 'button',
			'data-variant': t,
			'data-size': a,
			className: j(Ss({ variant: t, size: a, className: e })),
			...r
		})
	}
	var Ss,
		to = y(() => {
			Ba()
			mt()
			re()
			O()
			Ss = It(
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
	function ws({ className: e, ...t }) {
		return c('div', {
			'data-slot': 'card',
			className: j('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', e),
			...t
		})
	}
	function ys({ className: e, ...t }) {
		return c('div', {
			'data-slot': 'card-header',
			className: j(
				'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
				e
			),
			...t
		})
	}
	function Rs({ className: e, ...t }) {
		return c('div', { 'data-slot': 'card-title', className: j('leading-none font-semibold', e), ...t })
	}
	function Ps({ className: e, ...t }) {
		return c('div', { 'data-slot': 'card-content', className: j('px-6', e), ...t })
	}
	var fc = y(() => {
		re()
		O()
	})
	var vr,
		ks = y(() => {
			vr = (...e) =>
				e
					.filter((t, a, o) => !!t && t.trim() !== '' && o.indexOf(t) === a)
					.join(' ')
					.trim()
		})
	var pc,
		mc = y(() => {
			pc = (e) => e.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
		})
	var hc,
		gc = y(() => {
			hc = (e) => e.replace(/^([A-Z])|[\s-_]+(\w)/g, (t, a, o) => (o ? o.toUpperCase() : a.toLowerCase()))
		})
	var Ts,
		xc = y(() => {
			gc()
			Ts = (e) => {
				let t = hc(e)
				return t.charAt(0).toUpperCase() + t.slice(1)
			}
		})
	var Lr,
		vc = y(() => {
			Lr = {
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
	var Lc,
		Cc = y(() => {
			Lc = (e) => {
				for (let t in e) if (t.startsWith('aria-') || t === 'role' || t === 'title') return !0
				return !1
			}
		})
	var bv,
		bc,
		Ic = y(() => {
			'use strict'
			'use client'
			K()
			;((bv = we({})), (bc = () => Re(bv)))
		})
	var Sc,
		wc = y(() => {
			'use strict'
			'use client'
			K()
			vc()
			Cc()
			ks()
			Ic()
			Sc = R(
				(
					{
						color: e,
						size: t,
						strokeWidth: a,
						absoluteStrokeWidth: o,
						className: r = '',
						children: n,
						iconNode: s,
						...l
					},
					i
				) => {
					let {
							size: d = 24,
							strokeWidth: u = 2,
							absoluteStrokeWidth: f = !1,
							color: m = 'currentColor',
							className: g = ''
						} = bc() ?? {},
						h = (o ?? f) ? (Number(a ?? u) * 24) / Number(t ?? d) : (a ?? u)
					return ge(
						'svg',
						{
							ref: i,
							...Lr,
							width: t ?? d ?? Lr.width,
							height: t ?? d ?? Lr.height,
							stroke: e ?? m,
							strokeWidth: h,
							className: vr('lucide', g, r),
							...(!n && !Lc(l) && { 'aria-hidden': 'true' }),
							...l
						},
						[...s.map(([p, x]) => ge(p, x)), ...(Array.isArray(n) ? n : [n])]
					)
				}
			)
		})
	var Ra,
		Cr = y(() => {
			K()
			ks()
			mc()
			xc()
			wc()
			Ra = (e, t) => {
				let a = R(({ className: o, ...r }, n) =>
					ge(Sc, { ref: n, iconNode: t, className: vr(`lucide-${pc(Ts(e))}`, `lucide-${e}`, o), ...r })
				)
				return ((a.displayName = Ts(e)), a)
			}
		})
	var Iv,
		ao,
		yc = y(() => {
			Cr()
			;((Iv = [['path', { d: 'M20 6 9 17l-5-5', key: '1gmf2c' }]]), (ao = Ra('check', Iv)))
		})
	var Sv,
		Pa,
		Rc = y(() => {
			Cr()
			;((Sv = [['path', { d: 'm6 9 6 6 6-6', key: 'qrunsl' }]]), (Pa = Ra('chevron-down', Sv)))
		})
	var wv,
		oo,
		Pc = y(() => {
			Cr()
			;((wv = [['path', { d: 'm18 15-6-6-6 6', key: '153udz' }]]), (oo = Ra('chevron-up', wv)))
		})
	var kc = y(() => {
		'use strict'
		yc()
		Rc()
		Pc()
	})
	var Tc = y(() => {
		'use client'
		re()
		O()
	})
	var As = y(() => {
		re()
		to()
		O()
	})
	var Ac = y(() => {
		re()
		O()
	})
	function Dc({ className: e, children: t, ...a }) {
		return W(Pt.Root, {
			'data-slot': 'scroll-area',
			className: j('relative', e),
			...a,
			children: [
				c(Pt.Viewport, {
					'data-slot': 'scroll-area-viewport',
					className:
						'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
					children: t
				}),
				c(yv, {}),
				c(Pt.Corner, {})
			]
		})
	}
	function yv({ className: e, orientation: t = 'vertical', ...a }) {
		return c(Pt.ScrollAreaScrollbar, {
			'data-slot': 'scroll-area-scrollbar',
			orientation: t,
			className: j(
				'flex touch-none p-px transition-colors select-none',
				t === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
				t === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
				e
			),
			...a,
			children: c(Pt.ScrollAreaThumb, {
				'data-slot': 'scroll-area-thumb',
				className: 'relative flex-1 rounded-full bg-border'
			})
		})
	}
	var Mc = y(() => {
		mt()
		re()
		O()
	})
	function Ds({ ...e }) {
		return c(ke.Root, { 'data-slot': 'select', ...e })
	}
	function Ms({ ...e }) {
		return c(ke.Value, { 'data-slot': 'select-value', ...e })
	}
	function Es({ className: e, size: t = 'default', children: a, ...o }) {
		return W(ke.Trigger, {
			'data-slot': 'select-trigger',
			'data-size': t,
			className: j(
				"flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
				e
			),
			...o,
			children: [a, c(ke.Icon, { asChild: !0, children: c(Pa, { className: 'size-4 opacity-50' }) })]
		})
	}
	function Os({ className: e, children: t, position: a = 'item-aligned', align: o = 'center', ...r }) {
		return c(ke.Portal, {
			children: W(ke.Content, {
				'data-slot': 'select-content',
				className: j(
					'relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					a === 'popper' &&
						'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
					e
				),
				position: a,
				align: o,
				...r,
				children: [
					c(Rv, {}),
					c(ke.Viewport, {
						className: j(
							'p-1',
							a === 'popper' &&
								'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1'
						),
						children: t
					}),
					c(Pv, {})
				]
			})
		})
	}
	function Bs({ className: e, children: t, ...a }) {
		return W(ke.Item, {
			'data-slot': 'select-item',
			className: j(
				"relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				e
			),
			...a,
			children: [
				c('span', {
					'data-slot': 'select-item-indicator',
					className: 'absolute right-2 flex size-3.5 items-center justify-center',
					children: c(ke.ItemIndicator, { children: c(ao, { className: 'size-4' }) })
				}),
				c(ke.ItemText, { children: t })
			]
		})
	}
	function Rv({ className: e, ...t }) {
		return c(ke.ScrollUpButton, {
			'data-slot': 'select-scroll-up-button',
			className: j('flex cursor-default items-center justify-center py-1', e),
			...t,
			children: c(oo, { className: 'size-4' })
		})
	}
	function Pv({ className: e, ...t }) {
		return c(ke.ScrollDownButton, {
			'data-slot': 'select-scroll-down-button',
			className: j('flex cursor-default items-center justify-center py-1', e),
			...t,
			children: c(Pa, { className: 'size-4' })
		})
	}
	var Ec = y(() => {
		kc()
		mt()
		re()
		O()
	})
	var Oc = y(() => {
		'use client'
		re()
		O()
	})
	function Bc({ className: e, orientation: t = 'horizontal', ...a }) {
		return c(Zt.Root, {
			'data-slot': 'tabs',
			'data-orientation': t,
			orientation: t,
			className: j('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', e),
			...a
		})
	}
	function Fc({ className: e, variant: t = 'default', ...a }) {
		return c(Zt.List, { 'data-slot': 'tabs-list', 'data-variant': t, className: j(kv({ variant: t }), e), ...a })
	}
	function br({ className: e, ...t }) {
		return c(Zt.Trigger, {
			'data-slot': 'tabs-trigger',
			className: j(
				"relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent',
				'data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground',
				'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
				e
			),
			...t
		})
	}
	function Ir({ className: e, ...t }) {
		return c(Zt.Content, { 'data-slot': 'tabs-content', className: j('flex-1 outline-none', e), ...t })
	}
	var kv,
		Nc = y(() => {
			'use client'
			Ba()
			mt()
			re()
			O()
			kv = It(
				'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none',
				{
					variants: { variant: { default: 'bg-muted', line: 'gap-1 bg-transparent' } },
					defaultVariants: { variant: 'default' }
				}
			)
		})
	function zc({ className: e, ...t }) {
		return c('textarea', {
			'data-slot': 'textarea',
			className: j(
				'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
				e
			),
			...t
		})
	}
	var _c = y(() => {
		re()
		O()
	})
	function Hc({ delayDuration: e = 0, ...t }) {
		return c(pt.Provider, { 'data-slot': 'tooltip-provider', delayDuration: e, ...t })
	}
	function qc({ ...e }) {
		return c(pt.Root, { 'data-slot': 'tooltip', ...e })
	}
	function Uc({ ...e }) {
		return c(pt.Trigger, { 'data-slot': 'tooltip-trigger', ...e })
	}
	function Vc({ className: e, sideOffset: t = 0, children: a, ...o }) {
		return c(pt.Portal, {
			children: W(pt.Content, {
				'data-slot': 'tooltip-content',
				sideOffset: t,
				className: j(
					'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
					e
				),
				...o,
				children: [
					a,
					c(pt.Arrow, {
						className:
							'z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground'
					})
				]
			})
		})
	}
	var Gc = y(() => {
		mt()
		re()
		O()
	})
	function Wc({ className: e, ...t }) {
		return c('div', {
			'data-slot': 'table-container',
			className: 'relative w-full overflow-x-auto',
			children: c('table', { 'data-slot': 'table', className: j('w-full caption-bottom text-sm', e), ...t })
		})
	}
	function jc({ className: e, ...t }) {
		return c('thead', { 'data-slot': 'table-header', className: j('[&_tr]:border-b', e), ...t })
	}
	function Xc({ className: e, ...t }) {
		return c('tbody', { 'data-slot': 'table-body', className: j('[&_tr:last-child]:border-0', e), ...t })
	}
	function Fs({ className: e, ...t }) {
		return c('tr', {
			'data-slot': 'table-row',
			className: j('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', e),
			...t
		})
	}
	function Kc({ className: e, ...t }) {
		return c('th', {
			'data-slot': 'table-head',
			className: j(
				'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
				e
			),
			...t
		})
	}
	function $c({ className: e, ...t }) {
		return c('td', { 'data-slot': 'table-cell', className: j('p-3 align-middle', e), ...t })
	}
	var Jc = y(() => {
		re()
		O()
	})
	var Yc = y(() => {
		re()
		O()
	})
	var Zc = y(() => {
		re()
		O()
	})
	function Qc({ className: e, ...t }) {
		return c('div', { 'data-slot': 'skeleton', className: j('animate-pulse rounded-md bg-accent', e), ...t })
	}
	var ef = y(() => {
		re()
		O()
	})
	var zy,
		_y,
		Hy,
		qy,
		tf = y(() => {
			mt()
			re()
			O()
			;((zy = Rt.Root), (_y = Rt.Trigger), (Hy = Rt.Close), (qy = Rt.Portal))
		})
	var Xy,
		Ky,
		$y,
		af = y(() => {
			mt()
			re()
			to()
			O()
			;((Xy = Ca.Root), (Ky = Ca.Trigger), ($y = Ca.Portal))
		})
	var of = y(() => {
		re()
		O()
	})
	var rf = y(() => {
		re()
		O()
	})
	var nf = y(() => {
		'use client'
		O()
	})
	var sf = y(() => {
		'use client'
		re()
		As()
		O()
	})
	var lf = y(() => {
		re()
		O()
	})
	var uf = y(() => {
		re()
		to()
		O()
	})
	var df = y(() => {
		'use client'
		re()
		O()
	})
	var cf = y(() => {
		re()
		O()
	})
	var ff = y(() => {
		'use client'
		re()
		O()
	})
	function Tv(e, t) {
		let a = getComputedStyle(e),
			o = parseFloat(a.fontSize)
		return t * o
	}
	function Av(e, t) {
		let a = getComputedStyle(e.ownerDocument.documentElement),
			o = parseFloat(a.fontSize)
		return t * o
	}
	function Dv(e) {
		return (e / 100) * window.innerHeight
	}
	function Mv(e) {
		return (e / 100) * window.innerWidth
	}
	function Ev(e) {
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
	function ro({ groupSize: e, panelElement: t, styleProp: a }) {
		let o,
			[r, n] = Ev(a)
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
				o = Av(t, r)
				break
			}
			case 'em': {
				o = Tv(t, r)
				break
			}
			case 'vh': {
				o = Dv(r)
				break
			}
			case 'vw': {
				o = Mv(r)
				break
			}
		}
		return o
	}
	function Te(e) {
		return parseFloat(e.toFixed(3))
	}
	function Ma({ group: e }) {
		let { orientation: t, panels: a } = e
		return a.reduce((o, r) => ((o += t === 'horizontal' ? r.element.offsetWidth : r.element.offsetHeight), o), 0)
	}
	function zs(e) {
		let { panels: t } = e,
			a = Ma({ group: e })
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
						s = 0
					if (n.collapsedSize !== void 0) {
						let u = ro({ groupSize: a, panelElement: r, styleProp: n.collapsedSize })
						s = Te((u / a) * 100)
					}
					let l
					if (n.defaultSize !== void 0) {
						let u = ro({ groupSize: a, panelElement: r, styleProp: n.defaultSize })
						l = Te((u / a) * 100)
					}
					let i = 0
					if (n.minSize !== void 0) {
						let u = ro({ groupSize: a, panelElement: r, styleProp: n.minSize })
						i = Te((u / a) * 100)
					}
					let d = 100
					if (n.maxSize !== void 0) {
						let u = ro({ groupSize: a, panelElement: r, styleProp: n.maxSize })
						d = Te((u / a) * 100)
					}
					return {
						groupResizeBehavior: n.groupResizeBehavior,
						collapsedSize: s,
						collapsible: n.collapsible === !0,
						defaultSize: l,
						disabled: n.disabled,
						minSize: i,
						maxSize: d,
						panelId: o.id
					}
				})
	}
	function ue(e, t = 'Assertion error') {
		if (!e) throw Error(t)
	}
	function _s(e, t) {
		return Array.from(t).sort(e === 'horizontal' ? Ov : Bv)
	}
	function Ov(e, t) {
		let a = e.element.offsetLeft - t.element.offsetLeft
		return a !== 0 ? a : e.element.offsetWidth - t.element.offsetWidth
	}
	function Bv(e, t) {
		let a = e.element.offsetTop - t.element.offsetTop
		return a !== 0 ? a : e.element.offsetHeight - t.element.offsetHeight
	}
	function Af(e) {
		return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.ELEMENT_NODE
	}
	function Df(e, t) {
		return {
			x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(Math.abs(e.x - t.left), Math.abs(e.x - t.right)),
			y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(Math.abs(e.y - t.top), Math.abs(e.y - t.bottom))
		}
	}
	function Fv({ orientation: e, rects: t, targetRect: a }) {
		let o = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
			r,
			n = Number.MAX_VALUE
		for (let s of t) {
			let { x: l, y: i } = Df(o, s),
				d = e === 'horizontal' ? l : i
			d < n && ((n = d), (r = s))
		}
		return (ue(r, 'No rect found'), r)
	}
	function Nv() {
		return (
			Sr === void 0 &&
				(typeof matchMedia == 'function' ? (Sr = !!matchMedia('(pointer:coarse)').matches) : (Sr = !1)),
			Sr
		)
	}
	function Mf(e) {
		let { element: t, orientation: a, panels: o, separators: r } = e,
			n = _s(
				a,
				Array.from(t.children)
					.filter(Af)
					.map((h) => ({ element: h }))
			).map(({ element: h }) => h),
			s = [],
			l = !1,
			i = !1,
			d = -1,
			u = -1,
			f = 0,
			m,
			g = []
		{
			let h = -1
			for (let p of n)
				p.hasAttribute('data-panel') &&
					(h++, p.hasAttribute('data-disabled') || (f++, d === -1 && (d = h), (u = h)))
		}
		if (f > 1) {
			let h = -1
			for (let p of n)
				if (p.hasAttribute('data-panel')) {
					h++
					let x = o.find((v) => v.element === p)
					if (x) {
						if (m) {
							let v = m.element.getBoundingClientRect(),
								L = p.getBoundingClientRect(),
								C
							if (i) {
								let b =
										a === 'horizontal'
											? new DOMRect(v.right, v.top, 0, v.height)
											: new DOMRect(v.left, v.bottom, v.width, 0),
									I =
										a === 'horizontal'
											? new DOMRect(L.left, L.top, 0, L.height)
											: new DOMRect(L.left, L.top, L.width, 0)
								switch (g.length) {
									case 0: {
										C = [b, I]
										break
									}
									case 1: {
										let P = g[0],
											k = Fv({
												orientation: a,
												rects: [v, L],
												targetRect: P.element.getBoundingClientRect()
											})
										C = [P, k === v ? I : b]
										break
									}
									default: {
										C = g
										break
									}
								}
							} else
								g.length
									? (C = g)
									: (C = [
											a === 'horizontal'
												? new DOMRect(v.right, L.top, L.left - v.right, L.height)
												: new DOMRect(L.left, v.bottom, L.width, L.top - v.bottom)
										])
							for (let b of C) {
								let I = 'width' in b ? b : b.element.getBoundingClientRect(),
									P = Nv() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine
								if (I.width < P) {
									let w = P - I.width
									I = new DOMRect(I.x - w / 2, I.y, I.width + w, I.height)
								}
								if (I.height < P) {
									let w = P - I.height
									I = new DOMRect(I.x, I.y - w / 2, I.width, I.height + w)
								}
								let k = h <= d || h > u
								;(!l &&
									!k &&
									s.push({
										group: e,
										groupSize: Ma({ group: e }),
										panels: [m, x],
										separator: 'width' in b ? void 0 : b,
										rect: I
									}),
									(l = !1))
							}
						}
						;((i = !1), (m = x), (g = []))
					}
				} else if (p.hasAttribute('data-separator')) {
					p.ariaDisabled !== null && (l = !0)
					let x = r.find((v) => v.element === p)
					x ? g.push(x) : ((m = void 0), (g = []))
				} else i = !0
		}
		return s
	}
	function ea() {
		return Aa
	}
	function zv(e) {
		return Hs.addListener('change', e)
	}
	function _v(e) {
		let t = Aa,
			a = { ...Aa }
		;((a.cursorFlags = e), (Aa = a), Hs.emit('change', { prev: t, next: a }))
	}
	function Da(e) {
		let t = Aa
		;((Aa = e), Hs.emit('change', { prev: t, next: e }))
	}
	function hf() {
		return (
			wr === void 0 &&
				((wr = !1),
				typeof window < 'u' &&
					(window.navigator.userAgent.includes('Chrome') || window.navigator.userAgent.includes('Firefox')) &&
					(wr = !0)),
			wr
		)
	}
	function qv({ cursorFlags: e, groups: t, state: a }) {
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
					if (e && hf()) {
						let n = (e & Ef) !== 0,
							s = (e & Of) !== 0,
							l = (e & Bf) !== 0,
							i = (e & Ff) !== 0
						if (n) return l ? 'se-resize' : i ? 'ne-resize' : 'e-resize'
						if (s) return l ? 'sw-resize' : i ? 'nw-resize' : 'w-resize'
						if (l) return 's-resize'
						if (i) return 'n-resize'
					}
					break
				}
			}
			return hf()
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
	function qs(e) {
		if (e.defaultView === null || e.defaultView === void 0) return
		let { prevStyle: t, styleSheet: a } = gf.get(e) ?? {}
		a === void 0 &&
			((a = new e.defaultView.CSSStyleSheet()),
			e.adoptedStyleSheets &&
				(Object.isExtensible(e.adoptedStyleSheets)
					? e.adoptedStyleSheets.push(a)
					: (e.adoptedStyleSheets = [...e.adoptedStyleSheets, a])))
		let o = ea()
		switch (o.state) {
			case 'active':
			case 'hover': {
				let r = qv({ cursorFlags: o.cursorFlags, groups: o.hitRegions.map((s) => s.group), state: o.state }),
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
		gf.set(e, { prevStyle: t, styleSheet: a })
	}
	function Uv(e) {
		;((rt = new Map(rt)), rt.delete(e))
	}
	function xf(e, t) {
		for (let [a] of rt) if (a.id === e) return a
	}
	function Mt(e, t) {
		for (let [a, o] of rt) if (a.id === e) return o
		if (t) throw Error(`Could not find data for Group with id ${e}`)
	}
	function oa() {
		return rt
	}
	function Us(e, t) {
		return Nf.addListener('groupChange', (a) => {
			a.group.id === e && t(a)
		})
	}
	function ht(e, t, a) {
		let o = rt.get(e)
		;((rt = new Map(rt)),
			rt.set(e, t),
			Nf.emit('groupChange', { group: e, isUserInteraction: a?.isUserInteraction === !0, prev: o, next: t }))
	}
	function zf(e) {
		let t = ea(),
			a = !1
		return (
			t.state === 'active' &&
				(Da({ cursorFlags: 0, state: 'inactive' }),
				t.hitRegions.length > 0 &&
					(qs(e),
					(a = !0),
					t.hitRegions.forEach((o) => {
						let r = Mt(o.group.id, !0)
						ht(o.group, r, { isUserInteraction: !0 })
					}))),
			a
		)
	}
	function vf(e) {
		e.defaultPrevented || zf(e.currentTarget)
	}
	function Vv(e, t, a) {
		let o,
			r = { x: 1 / 0, y: 1 / 0 }
		for (let n of t) {
			let s = Df(a, n.rect)
			switch (e) {
				case 'horizontal': {
					s.x <= r.x && ((o = n), (r = s))
					break
				}
				case 'vertical': {
					s.y <= r.y && ((o = n), (r = s))
					break
				}
			}
		}
		return o ? { distance: r, hitRegion: o } : void 0
	}
	function Gv(e) {
		return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE
	}
	function Wv(e, t) {
		if (e === t) throw new Error('Cannot compare node with itself')
		let a = { a: bf(e), b: bf(t) },
			o
		for (; a.a.at(-1) === a.b.at(-1); ) ((o = a.a.pop()), a.b.pop())
		ue(o, 'Stacking order can only be calculated for elements with a common ancestor')
		let r = { a: Cf(Lf(a.a)), b: Cf(Lf(a.b)) }
		if (r.a === r.b) {
			let n = o.childNodes,
				s = { a: a.a.at(-1), b: a.b.at(-1) },
				l = n.length
			for (; l--; ) {
				let i = n[l]
				if (i === s.a) return 1
				if (i === s.b) return -1
			}
		}
		return Math.sign(r.a - r.b)
	}
	function Xv(e) {
		let t = getComputedStyle(_f(e) ?? e).display
		return t === 'flex' || t === 'inline-flex'
	}
	function Kv(e) {
		let t = getComputedStyle(e)
		return !!(
			t.position === 'fixed' ||
			(t.zIndex !== 'auto' && (t.position !== 'static' || Xv(e))) ||
			+t.opacity < 1 ||
			('transform' in t && t.transform !== 'none') ||
			('webkitTransform' in t && t.webkitTransform !== 'none') ||
			('mixBlendMode' in t && t.mixBlendMode !== 'normal') ||
			('filter' in t && t.filter !== 'none') ||
			('webkitFilter' in t && t.webkitFilter !== 'none') ||
			('isolation' in t && t.isolation === 'isolate') ||
			jv.test(t.willChange) ||
			t.webkitOverflowScrolling === 'touch'
		)
	}
	function Lf(e) {
		let t = e.length
		for (; t--; ) {
			let a = e[t]
			if ((ue(a, 'Missing node'), Kv(a))) return a
		}
		return null
	}
	function Cf(e) {
		return (e && Number(getComputedStyle(e).zIndex)) || 0
	}
	function bf(e) {
		let t = []
		for (; e; ) (t.push(e), (e = _f(e)))
		return t
	}
	function _f(e) {
		let { parentNode: t } = e
		return Gv(t) ? t.host : t
	}
	function $v(e, t) {
		return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y
	}
	function Jv({ groupElement: e, hitRegion: t, pointerEventTarget: a }) {
		if (!Af(a) || a.contains(e) || e.contains(a)) return !0
		if (Wv(a, e) > 0) {
			let o = a
			for (; o; ) {
				if (o.contains(e)) return !0
				if ($v(o.getBoundingClientRect(), t)) return !1
				o = o.parentElement
			}
		}
		return !0
	}
	function Vs(e, t) {
		let a = []
		return (
			t.forEach((o, r) => {
				if (r.disabled) return
				let n = Mf(r),
					s = Vv(r.orientation, n, { x: e.clientX, y: e.clientY })
				s &&
					s.distance.x <= 0 &&
					s.distance.y <= 0 &&
					Jv({ groupElement: r.element, hitRegion: s.hitRegion.rect, pointerEventTarget: e.target }) &&
					a.push(s.hitRegion)
			}),
			a
		)
	}
	function Yv(e, t) {
		if (e.length !== t.length) return !1
		for (let a = 0; a < e.length; a++) if (e[a] != t[a]) return !1
		return !0
	}
	function ye(e, t, a = 0) {
		return Math.abs(Te(e) - Te(t)) <= a
	}
	function ot(e, t) {
		return ye(e, t) ? 0 : e > t ? 1 : -1
	}
	function Ta({ overrideDisabledPanels: e, panelConstraints: t, prevSize: a, size: o }) {
		let { collapsedSize: r = 0, collapsible: n, disabled: s, maxSize: l = 100, minSize: i = 0 } = t
		if (s && !e) return a
		if (ot(o, i) < 0)
			if (n) {
				let d = (r + i) / 2
				ot(o, d) < 0 ? (o = r) : (o = i)
			} else o = i
		return ((o = Math.min(l, o)), (o = Te(o)), o)
	}
	function so({ delta: e, initialLayout: t, panelConstraints: a, pivotIndices: o, prevLayout: r, trigger: n }) {
		if (ye(e, 0)) return t
		let s = n === 'imperative-api',
			l = Object.values(t),
			i = Object.values(r),
			d = [...l],
			[u, f] = o
		;(ue(u != null, 'Invalid first pivot index'), ue(f != null, 'Invalid second pivot index'))
		let m = 0
		switch (n) {
			case 'keyboard': {
				{
					let p = e < 0 ? f : u,
						x = a[p]
					ue(x, `Panel constraints not found for index ${p}`)
					let { collapsedSize: v = 0, collapsible: L, minSize: C = 0 } = x
					if (L) {
						let b = l[p]
						if ((ue(b != null, `Previous layout not found for panel index ${p}`), ye(b, v))) {
							let I = C - b
							ot(I, Math.abs(e)) > 0 && (e = e < 0 ? 0 - I : I)
						}
					}
				}
				{
					let p = e < 0 ? u : f,
						x = a[p]
					ue(x, `No panel constraints found for index ${p}`)
					let { collapsedSize: v = 0, collapsible: L, minSize: C = 0 } = x
					if (L) {
						let b = l[p]
						if ((ue(b != null, `Previous layout not found for panel index ${p}`), ye(b, C))) {
							let I = b - v
							ot(I, Math.abs(e)) > 0 && (e = e < 0 ? 0 - I : I)
						}
					}
				}
				break
			}
			default: {
				let p = e < 0 ? f : u,
					x = a[p]
				ue(x, `Panel constraints not found for index ${p}`)
				let v = l[p],
					{ collapsible: L, collapsedSize: C, minSize: b } = x
				if (L && ot(v, b) < 0)
					if (e > 0) {
						let I = b - C,
							P = I / 2,
							k = v + e
						ot(k, b) < 0 && (e = ot(e, P) <= 0 ? 0 : I)
					} else {
						let I = b - C,
							P = 100 - I / 2,
							k = v - e
						ot(k, b) < 0 && (e = ot(100 + e, P) > 0 ? 0 : -I)
					}
				break
			}
		}
		{
			let p = e < 0 ? 1 : -1,
				x = e < 0 ? f : u,
				v = 0
			for (;;) {
				let C = l[x]
				ue(C != null, `Previous layout not found for panel index ${x}`)
				let b = Ta({ overrideDisabledPanels: s, panelConstraints: a[x], prevSize: C, size: 100 }) - C
				if (((v += b), (x += p), x < 0 || x >= a.length)) break
			}
			let L = Math.min(Math.abs(e), Math.abs(v))
			e = e < 0 ? 0 - L : L
		}
		{
			let p = e < 0 ? u : f
			for (; p >= 0 && p < a.length; ) {
				let x = Math.abs(e) - Math.abs(m),
					v = l[p]
				ue(v != null, `Previous layout not found for panel index ${p}`)
				let L = v - x,
					C = Ta({ overrideDisabledPanels: s, panelConstraints: a[p], prevSize: v, size: L })
				if (
					!ye(v, C) &&
					((m += v - C),
					(d[p] = C),
					m.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, { numeric: !0 }) >= 0)
				)
					break
				e < 0 ? p-- : p++
			}
		}
		if (Yv(i, d)) return r
		{
			let p = e < 0 ? f : u,
				x = l[p]
			ue(x != null, `Previous layout not found for panel index ${p}`)
			let v = x + m,
				L = Ta({ overrideDisabledPanels: s, panelConstraints: a[p], prevSize: x, size: v })
			if (((d[p] = L), !ye(L, v))) {
				let C = v - L,
					b = e < 0 ? f : u
				for (; b >= 0 && b < a.length; ) {
					let I = d[b]
					ue(I != null, `Previous layout not found for panel index ${b}`)
					let P = I + C,
						k = Ta({ overrideDisabledPanels: s, panelConstraints: a[b], prevSize: I, size: P })
					if ((ye(I, k) || ((C -= k - I), (d[b] = k)), ye(C, 0))) break
					e > 0 ? b-- : b++
				}
			}
		}
		let g = Object.values(d).reduce((p, x) => x + p, 0)
		if (!ye(g, 100, 0.1)) return r
		let h = Object.keys(r)
		return d.reduce((p, x, v) => ((p[h[v]] = x), p), {})
	}
	function ta(e, t) {
		if (Object.keys(e).length !== Object.keys(t).length) return !1
		for (let a in e) if (t[a] === void 0 || ot(e[a], t[a]) !== 0) return !1
		return !0
	}
	function aa({ layout: e, panelConstraints: t }) {
		let a = Object.values(e),
			o = [...a],
			r = o.reduce((l, i) => l + i, 0)
		if (o.length !== t.length) throw Error(`Invalid ${t.length} panel layout: ${o.map((l) => `${l}%`).join(', ')}`)
		if (!ye(r, 100) && o.length > 0)
			for (let l = 0; l < t.length; l++) {
				let i = o[l]
				ue(i != null, `No layout data found for index ${l}`)
				let d = (100 / r) * i
				o[l] = d
			}
		let n = 0
		for (let l = 0; l < t.length; l++) {
			let i = a[l]
			ue(i != null, `No layout data found for index ${l}`)
			let d = o[l]
			ue(d != null, `No layout data found for index ${l}`)
			let u = Ta({ overrideDisabledPanels: !0, panelConstraints: t[l], prevSize: i, size: d })
			d != u && ((n += d - u), (o[l] = u))
		}
		if (!ye(n, 0))
			for (let l = 0; l < t.length; l++) {
				let i = o[l]
				ue(i != null, `No layout data found for index ${l}`)
				let d = i + n,
					u = Ta({ overrideDisabledPanels: !0, panelConstraints: t[l], prevSize: i, size: d })
				if (i !== u && ((n -= u - i), (o[l] = u), ye(n, 0))) break
			}
		let s = Object.keys(e)
		return o.reduce((l, i, d) => ((l[s[d]] = i), l), {})
	}
	function Hf({ groupId: e, panelId: t }) {
		let a = () => {
				let i = oa()
				for (let [
					d,
					{
						defaultLayoutDeferred: u,
						derivedPanelConstraints: f,
						layout: m,
						groupSize: g,
						separatorToPanels: h
					}
				] of i)
					if (d.id === e)
						return {
							defaultLayoutDeferred: u,
							derivedPanelConstraints: f,
							group: d,
							groupSize: g,
							layout: m,
							separatorToPanels: h
						}
				throw Error(`Group ${e} not found`)
			},
			o = () => {
				let i = a().derivedPanelConstraints.find((d) => d.panelId === t)
				if (i !== void 0) return i
				throw Error(`Panel constraints not found for Panel ${t}`)
			},
			r = () => {
				let i = a().group.panels.find((d) => d.id === t)
				if (i !== void 0) return i
				throw Error(`Layout not found for Panel ${t}`)
			},
			n = () => {
				let i = a().layout[t]
				if (i !== void 0) return i
				throw Error(`Layout not found for Panel ${t}`)
			},
			s = ({ nextSize: i, panels: d, prevLayout: u, derivedPanelConstraints: f }) => {
				let m = n(),
					g = d.findIndex((x) => x.id === t),
					h = g === 0,
					p = g === d.length - 1
				if (
					p &&
					i < m &&
					(h ||
						d.slice(0, g).every((x, v) => {
							let L = f[v]
							return L?.collapsible && ye(L.collapsedSize, u[L.panelId])
						}))
				) {
					let x = d.slice(0, g).reduce((v, L) => v + u[L.id], 0)
					return { ...u, [t]: Te(100 - x) }
				}
				return so({
					delta: p ? m - i : i - m,
					initialLayout: u,
					panelConstraints: f,
					pivotIndices: p ? [g - 1, g] : [g, g + 1],
					prevLayout: u,
					trigger: 'imperative-api'
				})
			},
			l = (i) => {
				let d = n()
				if (i === d) return
				let {
						defaultLayoutDeferred: u,
						derivedPanelConstraints: f,
						group: m,
						groupSize: g,
						layout: h,
						separatorToPanels: p
					} = a(),
					x = s({ nextSize: i, panels: m.panels, prevLayout: h, derivedPanelConstraints: f }),
					v = aa({ layout: x, panelConstraints: f })
				ta(h, v) ||
					ht(m, {
						defaultLayoutDeferred: u,
						derivedPanelConstraints: f,
						groupSize: g,
						layout: v,
						separatorToPanels: p
					})
			}
		return {
			collapse: () => {
				let { collapsible: i, collapsedSize: d } = o(),
					{ mutableValues: u } = r(),
					f = n()
				i && f !== d && ((u.expandToSize = f), l(d))
			},
			expand: () => {
				let { collapsible: i, collapsedSize: d, minSize: u } = o(),
					{ mutableValues: f } = r(),
					m = n()
				if (i && m === d) {
					let g = f.expandToSize ?? u
					;(g === 0 && (g = 1), l(g))
				}
			},
			getSize: () => {
				let { group: i } = a(),
					d = n(),
					{ element: u } = r(),
					f = i.orientation === 'horizontal' ? u.offsetWidth : u.offsetHeight
				return { asPercentage: d, inPixels: f }
			},
			isCollapsed: () => {
				let { collapsible: i, collapsedSize: d } = o(),
					u = n()
				return i && ye(d, u)
			},
			resize: (i) => {
				let { group: d } = a(),
					{ element: u } = r(),
					f = Ma({ group: d }),
					m = ro({ groupSize: f, panelElement: u, styleProp: i }),
					g = Te((m / f) * 100)
				l(g)
			}
		}
	}
	function If(e) {
		if (e.defaultPrevented) return
		let t = oa()
		Vs(e, t).forEach((a) => {
			if (a.separator && !a.separator.disableDoubleClick) {
				let o = a.panels.find((r) => r.panelConstraints.defaultSize !== void 0)
				if (o) {
					let r = o.panelConstraints.defaultSize,
						n = Hf({ groupId: a.group.id, panelId: o.id })
					n && r !== void 0 && (n.resize(r), e.preventDefault())
				}
			}
		})
	}
	function yr(e) {
		let t = oa()
		for (let [a] of t) if (a.separators.some((o) => o.element === e)) return a
		throw Error('Could not find parent Group for separator element')
	}
	function qf({ groupId: e }) {
		let t = () => {
			let a = oa()
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
						groupSize: s,
						layout: l,
						separatorToPanels: i
					} = t(),
					d = aa({ layout: a, panelConstraints: r })
				return o
					? l
					: (ta(l, d) ||
							ht(n, {
								defaultLayoutDeferred: o,
								derivedPanelConstraints: r,
								groupSize: s,
								layout: d,
								separatorToPanels: i
							}),
						d)
			}
		}
	}
	function Qt(e, t) {
		let a = yr(e),
			o = Mt(a.id, !0),
			r = a.separators.find((u) => u.element === e)
		ue(r, 'Matching separator not found')
		let n = o.separatorToPanels.get(r)
		ue(n, 'Matching panels not found')
		let s = n.map((u) => a.panels.indexOf(u)),
			l = qf({ groupId: a.id }).getLayout(),
			i = so({
				delta: t,
				initialLayout: l,
				panelConstraints: o.derivedPanelConstraints,
				pivotIndices: s,
				prevLayout: l,
				trigger: 'keyboard'
			}),
			d = aa({ layout: i, panelConstraints: o.derivedPanelConstraints })
		ta(l, d) ||
			ht(
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
	function Sf(e) {
		if (e.defaultPrevented) return
		let t = e.currentTarget,
			a = yr(t)
		if (!a.disabled)
			switch (e.key) {
				case 'ArrowDown': {
					;(e.preventDefault(), a.orientation === 'vertical' && Qt(t, 5))
					break
				}
				case 'ArrowLeft': {
					;(e.preventDefault(), a.orientation === 'horizontal' && Qt(t, -5))
					break
				}
				case 'ArrowRight': {
					;(e.preventDefault(), a.orientation === 'horizontal' && Qt(t, 5))
					break
				}
				case 'ArrowUp': {
					;(e.preventDefault(), a.orientation === 'vertical' && Qt(t, -5))
					break
				}
				case 'End': {
					;(e.preventDefault(), Qt(t, 100))
					break
				}
				case 'Enter': {
					e.preventDefault()
					let o = yr(t),
						r = Mt(o.id, !0),
						{ derivedPanelConstraints: n, layout: s, separatorToPanels: l } = r,
						i = o.separators.find((m) => m.element === t)
					ue(i, 'Matching separator not found')
					let d = l.get(i)
					ue(d, 'Matching panels not found')
					let u = d[0],
						f = n.find((m) => m.panelId === u.id)
					if ((ue(f, 'Panel metadata not found'), f.collapsible)) {
						let m = s[u.id],
							g =
								f.collapsedSize === m
									? (o.mutableState.expandedPanelSizes[u.id] ?? f.minSize)
									: f.collapsedSize
						Qt(t, g - m)
					}
					break
				}
				case 'F6': {
					e.preventDefault()
					let o = yr(t).separators.map((s) => s.element),
						r = Array.from(o).findIndex((s) => s === e.currentTarget)
					ue(r !== null, 'Index not found')
					let n = e.shiftKey ? (r > 0 ? r - 1 : o.length - 1) : r + 1 < o.length ? r + 1 : 0
					o[n].focus({ preventScroll: !0 })
					break
				}
				case 'Home': {
					;(e.preventDefault(), Qt(t, -100))
					break
				}
			}
	}
	function wf(e) {
		if (e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0)) return
		let t = oa(),
			a = Vs(e, t),
			o = new Map(),
			r = !1
		;(a.forEach((n) => {
			n.separator && (r || ((r = !0), n.separator.element.focus({ focusVisible: !1, preventScroll: !0 })))
			let s = t.get(n.group)
			s && o.set(n.group, s.layout)
		}),
			Da({
				cursorFlags: 0,
				hitRegions: a,
				initialLayoutMap: o,
				pointerDownAtPoint: { x: e.clientX, y: e.clientY },
				state: 'active'
			}),
			a.length && e.preventDefault())
	}
	function Uf({
		document: e,
		event: t,
		hitRegions: a,
		initialLayoutMap: o,
		mountedGroups: r,
		pointerDownAtPoint: n,
		prevCursorFlags: s
	}) {
		let l = 0
		a.forEach((d) => {
			let { group: u, groupSize: f } = d,
				{ orientation: m, panels: g } = u,
				{ disableCursor: h } = u.mutableState,
				p = 0
			n
				? m === 'horizontal'
					? (p = ((t.clientX - n.x) / f) * 100)
					: (p = ((t.clientY - n.y) / f) * 100)
				: m === 'horizontal'
					? (p = t.clientX < 0 ? -100 : 100)
					: (p = t.clientY < 0 ? -100 : 100)
			let x = o.get(u),
				v = r.get(u)
			if (!x || !v) return
			let {
				defaultLayoutDeferred: L,
				derivedPanelConstraints: C,
				groupSize: b,
				layout: I,
				separatorToPanels: P
			} = v
			if (C && I && P) {
				let k = so({
					delta: p,
					initialLayout: x,
					panelConstraints: C,
					pivotIndices: d.panels.map((w) => g.indexOf(w)),
					prevLayout: I,
					trigger: 'mouse-or-touch'
				})
				if (ta(k, I)) {
					if (p !== 0 && !h)
						switch (m) {
							case 'horizontal': {
								l |= p < 0 ? Ef : Of
								break
							}
							case 'vertical': {
								l |= p < 0 ? Bf : Ff
								break
							}
						}
				} else
					ht(d.group, {
						defaultLayoutDeferred: L,
						derivedPanelConstraints: C,
						groupSize: b,
						layout: k,
						separatorToPanels: P
					})
			}
		})
		let i = 0
		;(t.movementX === 0 ? (i |= s & pf) : (i |= l & pf),
			t.movementY === 0 ? (i |= s & mf) : (i |= l & mf),
			_v(i),
			qs(e))
	}
	function yf(e) {
		let t = oa(),
			a = ea()
		a.state === 'active' &&
			Uf({
				document: e.currentTarget,
				event: e,
				hitRegions: a.hitRegions,
				initialLayoutMap: a.initialLayoutMap,
				mountedGroups: t,
				prevCursorFlags: a.cursorFlags
			})
	}
	function Rf(e) {
		if (e.defaultPrevented) return
		let t = ea(),
			a = oa()
		switch (t.state) {
			case 'active': {
				if (e.buttons === 0) {
					;(Da({ cursorFlags: 0, state: 'inactive' }),
						t.hitRegions.forEach((o) => {
							let r = Mt(o.group.id, !0)
							ht(o.group, r, { isUserInteraction: !0 })
						}))
					return
				}
				for (let o of t.hitRegions)
					if (o.separator) {
						let { element: r } = o.separator
						r.hasPointerCapture?.(e.pointerId) || r.setPointerCapture?.(e.pointerId)
					}
				Uf({
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
				let o = Vs(e, a)
				;(o.length === 0
					? t.state !== 'inactive' && Da({ cursorFlags: 0, state: 'inactive' })
					: Da({ cursorFlags: 0, hitRegions: o, state: 'hover' }),
					qs(e.currentTarget))
				break
			}
		}
	}
	function Pf(e) {
		e.relatedTarget instanceof HTMLIFrameElement &&
			ea().state === 'hover' &&
			Da({ cursorFlags: 0, state: 'inactive' })
	}
	function kf(e) {
		e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0) || (zf(e.currentTarget) && e.preventDefault())
	}
	function Tf(e) {
		let t = 0,
			a = 0,
			o = {}
		for (let n of e)
			if (n.defaultSize !== void 0) {
				t++
				let s = Te(n.defaultSize)
				;((a += s), (o[n.panelId] = s))
			} else o[n.panelId] = void 0
		let r = e.length - t
		if (r !== 0) {
			let n = Te((100 - a) / r)
			for (let s of e) s.defaultSize === void 0 && (o[s.panelId] = n)
		}
		return o
	}
	function Zv(e, t, a) {
		if (!a[0]) return
		let o = e.panels.find((i) => i.element === t)
		if (!o || !o.onResize) return
		let r = Ma({ group: e }),
			n = e.orientation === 'horizontal' ? o.element.offsetWidth : o.element.offsetHeight,
			s = o.mutableValues.prevSize,
			l = { asPercentage: Te((n / r) * 100), inPixels: n }
		;((o.mutableValues.prevSize = l), o.onResize(l, o.id, s))
	}
	function Qv(e, t) {
		if (Object.keys(e).length !== Object.keys(t).length) return !1
		for (let a in e) if (e[a] !== t[a]) return !1
		return !0
	}
	function eL({ group: e, nextGroupSize: t, prevGroupSize: a, prevLayout: o }) {
		if (a <= 0 || t <= 0 || a === t) return o
		let r = 0,
			n = 0,
			s = !1,
			l = new Map(),
			i = []
		for (let f of e.panels) {
			let m = o[f.id] ?? 0
			if (f.panelConstraints.groupResizeBehavior === 'preserve-pixel-size') {
				s = !0
				let g = (m / 100) * a,
					h = Te((g / t) * 100)
				;(l.set(f.id, h), (r += h))
			} else (i.push(f.id), (n += m))
		}
		if (!s || i.length === 0) return o
		let d = 100 - r,
			u = { ...o }
		if (
			(l.forEach((f, m) => {
				u[m] = f
			}),
			n > 0)
		)
			for (let f of i) {
				let m = o[f] ?? 0
				u[f] = Te((m / n) * d)
			}
		else {
			let f = Te(d / i.length)
			for (let m of i) u[m] = f
		}
		return u
	}
	function tL(e, t) {
		let a = e.map((r) => r.id),
			o = Object.keys(t)
		if (a.length !== o.length) return !1
		for (let r of a) if (!o.includes(r)) return !1
		return !0
	}
	function aL(e) {
		let t = !0
		ue(e.element.ownerDocument.defaultView, 'Cannot register an unmounted Group')
		let a = e.element.ownerDocument.defaultView.ResizeObserver,
			o = new Set(),
			r = new Set(),
			n = new a((h) => {
				for (let p of h) {
					let { borderBoxSize: x, target: v } = p
					if (v === e.element) {
						if (t) {
							let L = Ma({ group: e })
							if (L === 0) return
							let C = Mt(e.id)
							if (!C) return
							let b = zs(e),
								I = C.defaultLayoutDeferred ? Tf(b) : C.layout,
								P = eL({ group: e, nextGroupSize: L, prevGroupSize: C.groupSize, prevLayout: I }),
								k = aa({ layout: P, panelConstraints: b })
							if (
								!C.defaultLayoutDeferred &&
								ta(C.layout, k) &&
								Qv(C.derivedPanelConstraints, b) &&
								C.groupSize === L
							)
								return
							ht(e, {
								defaultLayoutDeferred: !1,
								derivedPanelConstraints: b,
								groupSize: L,
								layout: k,
								separatorToPanels: C.separatorToPanels
							})
						}
					} else Zv(e, v, x)
				}
			})
		;(n.observe(e.element),
			e.panels.forEach((h) => {
				;(ue(!o.has(h.id), `Panel ids must be unique; id "${h.id}" was used more than once`),
					o.add(h.id),
					h.onResize && n.observe(h.element))
			}))
		let s = Ma({ group: e }),
			l = zs(e),
			i = e.panels.map(({ id: h }) => h).join(','),
			d = e.mutableState.defaultLayout
		d && (tL(e.panels, d) || (d = void 0))
		let u = e.mutableState.layouts[i] ?? d ?? Tf(l),
			f = aa({ layout: u, panelConstraints: l }),
			m = e.element.ownerDocument
		ka.set(m, (ka.get(m) ?? 0) + 1)
		let g = new Map()
		return (
			Mf(e).forEach((h) => {
				h.separator && g.set(h.separator, h.panels)
			}),
			ht(e, {
				defaultLayoutDeferred: s === 0,
				derivedPanelConstraints: l,
				groupSize: s,
				layout: f,
				separatorToPanels: g
			}),
			e.separators.forEach((h) => {
				;(ue(!r.has(h.id), `Separator ids must be unique; id "${h.id}" was used more than once`),
					r.add(h.id),
					h.element.addEventListener('keydown', Sf))
			}),
			ka.get(m) === 1 &&
				(m.addEventListener('contextmenu', vf, !0),
				m.addEventListener('dblclick', If, !0),
				m.addEventListener('pointerdown', wf, !0),
				m.addEventListener('pointerleave', yf),
				m.addEventListener('pointermove', Rf),
				m.addEventListener('pointerout', Pf),
				m.addEventListener('pointerup', kf, !0)),
			function () {
				;((t = !1),
					ka.set(m, Math.max(0, (ka.get(m) ?? 0) - 1)),
					Uv(e),
					e.separators.forEach((h) => {
						h.element.removeEventListener('keydown', Sf)
					}),
					ka.get(m) ||
						(m.removeEventListener('contextmenu', vf, !0),
						m.removeEventListener('dblclick', If, !0),
						m.removeEventListener('pointerdown', wf, !0),
						m.removeEventListener('pointerleave', yf),
						m.removeEventListener('pointermove', Rf),
						m.removeEventListener('pointerout', Pf),
						m.removeEventListener('pointerup', kf, !0)),
					n.disconnect())
			}
		)
	}
	function oL() {
		let [e, t] = M({}),
			a = q(() => t({}), [])
		return [e, a]
	}
	function Gs(e) {
		let t = Or()
		return `${e ?? t}`
	}
	function no(e) {
		let t = D(e)
		return (
			ra(() => {
				t.current = e
			}, [e]),
			q((...a) => t.current?.(...a), [t])
		)
	}
	function Ws(...e) {
		return no((t) => {
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
	function js(e) {
		let t = D({ ...e })
		return (
			ra(() => {
				for (let a in e) t.current[a] = e[a]
			}, [e]),
			t.current
		)
	}
	function rL(e, t) {
		let a = D({ getLayout: () => ({}), setLayout: Hv })
		;(lo(t, () => a.current, []),
			ra(() => {
				Object.assign(a.current, qf({ groupId: e }))
			}))
	}
	function Gf({
		children: e,
		className: t,
		defaultLayout: a,
		disableCursor: o,
		disabled: r,
		elementRef: n,
		groupRef: s,
		id: l,
		onLayoutChange: i,
		onLayoutChanged: d,
		orientation: u = 'horizontal',
		resizeTargetMinimumSize: f = { coarse: 20, fine: 10 },
		style: m,
		...g
	}) {
		let h = D({ onLayoutChange: {}, onLayoutChanged: {} }),
			p = no((S) => {
				ta(h.current.onLayoutChange, S) || ((h.current.onLayoutChange = S), i?.(S))
			}),
			x = no((S, T) => {
				ta(h.current.onLayoutChanged, S) || ((h.current.onLayoutChanged = S), d?.(S, { isUserInteraction: T }))
			}),
			v = Gs(l),
			L = D(null),
			[C, b] = oL(),
			I = D({ lastExpandedPanelSizes: {}, layouts: {}, panels: [], resizeTargetMinimumSize: f, separators: [] }),
			P = Ws(L, n)
		rL(v, s)
		let k = no((S, T) => {
				let F = ea(),
					N = xf(S),
					H = Mt(S)
				if (H) {
					let z = !1
					return (
						F.state === 'active' && (z = F.hitRegions.some(($) => $.group === N)),
						{ flexGrow: H.layout[T] ?? 1, pointerEvents: z ? 'none' : void 0 }
					)
				}
				if (a?.[T]) return { flexGrow: a?.[T] }
			}),
			w = js({ defaultLayout: a, disableCursor: o }),
			E = de(
				() => ({
					get disableCursor() {
						return !!w.disableCursor
					},
					getPanelStyles: k,
					id: v,
					orientation: u,
					registerPanel: (S) => {
						let T = I.current
						return (
							(T.panels = _s(u, [...T.panels, S])),
							b(),
							() => {
								;((T.panels = T.panels.filter((F) => F !== S)), b())
							}
						)
					},
					registerSeparator: (S) => {
						let T = I.current
						return (
							(T.separators = _s(u, [...T.separators, S])),
							b(),
							() => {
								;((T.separators = T.separators.filter((F) => F !== S)), b())
							}
						)
					},
					updatePanelProps: (S, { disabled: T }) => {
						let F = I.current.panels.find((z) => z.id === S)
						F && (F.panelConstraints.disabled = T)
						let N = xf(v),
							H = Mt(v)
						N && H && ht(N, { ...H, derivedPanelConstraints: zs(N) })
					},
					updateSeparatorProps: (S, { disabled: T, disableDoubleClick: F }) => {
						let N = I.current.separators.find((H) => H.id === S)
						N && ((N.disabled = T), (N.disableDoubleClick = F))
					}
				}),
				[k, v, b, u, w]
			),
			U = D(null)
		return (
			ra(() => {
				let S = L.current
				if (S === null) return
				let T = I.current,
					F
				if (w.defaultLayout !== void 0 && Object.keys(w.defaultLayout).length === T.panels.length) {
					F = {}
					for (let oe of T.panels) {
						let me = w.defaultLayout[oe.id]
						me !== void 0 && (F[oe.id] = me)
					}
				}
				let N = {
					disabled: !!r,
					element: S,
					id: v,
					mutableState: {
						defaultLayout: F,
						disableCursor: !!w.disableCursor,
						expandedPanelSizes: I.current.lastExpandedPanelSizes,
						layouts: I.current.layouts
					},
					orientation: u,
					panels: T.panels,
					resizeTargetMinimumSize: T.resizeTargetMinimumSize,
					separators: T.separators
				}
				U.current = N
				let H = aL(N),
					{ defaultLayoutDeferred: z, derivedPanelConstraints: $, layout: A } = Mt(N.id, !0)
				!z && $.length > 0 && (p(A), x(A, !1))
				let Q = Us(v, (oe) => {
					let { defaultLayoutDeferred: me, derivedPanelConstraints: Ie, layout: le } = oe.next
					if (me || Ie.length === 0) return
					let pe = N.panels.map(({ id: ve }) => ve).join(',')
					;((N.mutableState.layouts[pe] = le),
						Ie.forEach((ve) => {
							if (ve.collapsible) {
								let { layout: _ } = oe.prev ?? {}
								if (_) {
									let ne = ye(ve.collapsedSize, le[ve.panelId]),
										he = ye(ve.collapsedSize, _[ve.panelId])
									ne && !he && (N.mutableState.expandedPanelSizes[ve.panelId] = _[ve.panelId])
								}
							}
						}))
					let Ee = ea().state !== 'active'
					;(p(le), Ee && x(le, oe.isUserInteraction))
				})
				return () => {
					;((U.current = null), H(), Q())
				}
			}, [r, v, x, p, u, C, w]),
			B(() => {
				let S = U.current
				S && ((S.mutableState.defaultLayout = a), (S.mutableState.disableCursor = !!o))
			}),
			c(Vf.Provider, {
				value: E,
				children: c('div', {
					...g,
					className: t,
					'data-group': !0,
					'data-testid': v,
					id: v,
					ref: P,
					style: {
						height: '100%',
						width: '100%',
						overflow: 'hidden',
						...m,
						display: 'flex',
						flexDirection: u === 'horizontal' ? 'row' : 'column',
						flexWrap: 'nowrap',
						touchAction: u === 'horizontal' ? 'pan-y' : 'pan-x'
					},
					children: e
				})
			})
		)
	}
	function Xs() {
		let e = Re(Vf)
		return (ue(e, 'Group Context not found; did you render a Panel or Separator outside of a Group?'), e)
	}
	function nL(e, t) {
		let { id: a } = Xs(),
			o = D({
				collapse: Ns,
				expand: Ns,
				getSize: () => ({ asPercentage: 0, inPixels: 0 }),
				isCollapsed: () => !1,
				resize: Ns
			})
		;(lo(t, () => o.current, []),
			ra(() => {
				Object.assign(o.current, Hf({ groupId: a, panelId: e }))
			}))
	}
	function Wf({
		children: e,
		className: t,
		collapsedSize: a = '0%',
		collapsible: o = !1,
		defaultSize: r,
		disabled: n,
		elementRef: s,
		groupResizeBehavior: l = 'preserve-relative-size',
		id: i,
		maxSize: d = '100%',
		minSize: u = '0%',
		onResize: f,
		panelRef: m,
		style: g,
		...h
	}) {
		let p = !!i,
			x = Gs(i),
			v = js({ disabled: n }),
			L = D(null),
			C = Ws(L, s),
			{ getPanelStyles: b, id: I, orientation: P, registerPanel: k, updatePanelProps: w } = Xs(),
			E = f !== null,
			U = no((N, H, z) => {
				f?.(N, i, z)
			})
		;(ra(() => {
			let N = L.current
			if (N !== null) {
				let H = {
					element: N,
					id: x,
					idIsStable: p,
					mutableValues: { expandToSize: void 0, prevSize: void 0 },
					onResize: E ? U : void 0,
					panelConstraints: {
						groupResizeBehavior: l,
						collapsedSize: a,
						collapsible: o,
						defaultSize: r,
						disabled: v.disabled,
						maxSize: d,
						minSize: u
					}
				}
				return k(H)
			}
		}, [l, a, o, r, E, x, p, d, u, U, k, v]),
			B(() => {
				w(x, { disabled: n })
			}, [n, x, w]),
			nL(x, m))
		let S = () => {
				let N = b(I, x)
				if (N) return JSON.stringify(N)
			},
			T = Br((N) => Us(I, N), S, S),
			F
		return (
			T
				? (F = JSON.parse(T))
				: r !== void 0
					? (F = { flexGrow: void 0, flexShrink: void 0, flexBasis: r })
					: (F = { flexGrow: 1 }),
			c('div', {
				...h,
				'data-disabled': n || void 0,
				'data-panel': !0,
				'data-testid': x,
				id: x,
				ref: C,
				style: { ...sL, display: 'flex', flexBasis: 0, flexShrink: 1, overflow: 'visible', ...F },
				children: c('div', {
					className: t,
					style: {
						maxHeight: '100%',
						maxWidth: '100%',
						flexGrow: 1,
						overflow: 'auto',
						...g,
						touchAction: P === 'horizontal' ? 'pan-y' : 'pan-x'
					},
					children: e
				})
			})
		)
	}
	function lL({ layout: e, panelConstraints: t, panelId: a, panelIndex: o }) {
		let r,
			n,
			s = e[a],
			l = t.find((i) => i.panelId === a)
		if (l) {
			let i = l.maxSize,
				d = l.collapsible ? l.collapsedSize : l.minSize,
				u = [o, o + 1]
			;((n = aa({
				layout: so({ delta: d - s, initialLayout: e, panelConstraints: t, pivotIndices: u, prevLayout: e }),
				panelConstraints: t
			})[a]),
				(r = aa({
					layout: so({ delta: i - s, initialLayout: e, panelConstraints: t, pivotIndices: u, prevLayout: e }),
					panelConstraints: t
				})[a]))
		}
		return { valueControls: a, valueMax: r, valueMin: n, valueNow: s }
	}
	function jf({
		children: e,
		className: t,
		disabled: a,
		disableDoubleClick: o,
		elementRef: r,
		id: n,
		style: s,
		...l
	}) {
		let i = Gs(n),
			d = js({ disabled: a, disableDoubleClick: o }),
			[u, f] = M({}),
			[m, g] = M('inactive'),
			[h, p] = M(!1),
			x = D(null),
			v = Ws(x, r),
			{ disableCursor: L, id: C, orientation: b, registerSeparator: I, updateSeparatorProps: P } = Xs(),
			k = b === 'horizontal' ? 'vertical' : 'horizontal'
		;(ra(() => {
			let U = x.current
			if (U !== null) {
				let S = { disabled: d.disabled, disableDoubleClick: d.disableDoubleClick, element: U, id: i },
					T = I(S),
					F = zv((H) => {
						g(
							H.next.state !== 'inactive' && H.next.hitRegions.some((z) => z.separator === S)
								? H.next.state
								: 'inactive'
						)
					}),
					N = Us(C, (H) => {
						let { derivedPanelConstraints: z, layout: $, separatorToPanels: A } = H.next,
							Q = A.get(S)
						if (Q) {
							let oe = Q[0],
								me = Q.indexOf(oe)
							f(lL({ layout: $, panelConstraints: z, panelId: oe.id, panelIndex: me }))
						}
					})
				return () => {
					;(F(), N(), T())
				}
			}
		}, [C, i, I, d]),
			B(() => {
				P(i, { disabled: a, disableDoubleClick: o })
			}, [a, o, i, P]))
		let w
		a && !L && (w = 'not-allowed')
		let E
		return (
			a ? (E = 'disabled') : m === 'active' ? (E = 'active') : h ? (E = 'focus') : (E = m),
			c('div', {
				...l,
				'aria-controls': u.valueControls,
				'aria-disabled': a || void 0,
				'aria-orientation': k,
				'aria-valuemax': u.valueMax,
				'aria-valuemin': u.valueMin,
				'aria-valuenow': u.valueNow,
				children: e,
				className: t,
				'data-separator': E,
				'data-testid': i,
				id: i,
				onBlur: () => p(!1),
				onFocus: () => p(!0),
				ref: v,
				role: 'separator',
				style: { flexBasis: 'auto', cursor: w, ...s, flexGrow: 0, flexShrink: 0, touchAction: 'none' },
				tabIndex: a ? void 0 : 0
			})
		)
	}
	var Sr,
		Dt,
		Rr,
		Aa,
		Hs,
		Hv,
		Ns,
		Ef,
		Of,
		Bf,
		Ff,
		pf,
		mf,
		wr,
		gf,
		rt,
		Nf,
		jv,
		ka,
		ra,
		Vf,
		sL,
		Xf = y(() => {
			'use client'
			O()
			K()
			Rr = class {
				constructor() {
					Mr(this, Dt, {})
				}
				addListener(t, a) {
					let o = na(this, Dt)[t]
					return (
						o === void 0 ? (na(this, Dt)[t] = [a]) : o.includes(a) || o.push(a),
						() => {
							this.removeListener(t, a)
						}
					)
				}
				emit(t, a) {
					let o = na(this, Dt)[t]
					if (o !== void 0)
						if (o.length === 1) o[0].call(null, a)
						else {
							let r = !1,
								n = null,
								s = Array.from(o)
							for (let l = 0; l < s.length; l++) {
								let i = s[l]
								try {
									i.call(null, a)
								} catch (d) {
									n === null && ((r = !0), (n = d))
								}
							}
							if (r) throw n
						}
				}
				removeAllListeners() {
					Er(this, Dt, {})
				}
				removeListener(t, a) {
					let o = na(this, Dt)[t]
					if (o !== void 0) {
						let r = o.indexOf(a)
						r >= 0 && o.splice(r, 1)
					}
				}
			}
			Dt = new WeakMap()
			;((Aa = { cursorFlags: 0, state: 'inactive' }), (Hs = new Rr()))
			;((Hv = (e) => e), (Ns = () => {}), (Ef = 1), (Of = 2), (Bf = 4), (Ff = 8), (pf = 3), (mf = 12))
			gf = new WeakMap()
			;((rt = new Map()), (Nf = new Rr()))
			jv = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/
			ka = new Map()
			ra = typeof window < 'u' ? lt : B
			Vf = we(null)
			Gf.displayName = 'Group'
			Wf.displayName = 'Panel'
			sL = {
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
			jf.displayName = 'Separator'
		})
	var Kf = y(() => {
		Xf()
		re()
		O()
	})
	var uL,
		NR,
		zR,
		$f = y(() => {
			'use client'
			K()
			;((uL = (e, t, a, o, r, n, s, l) => {
				let i = document.documentElement,
					d = ['light', 'dark']
				function u(g) {
					;((Array.isArray(e) ? e : [e]).forEach((h) => {
						let p = h === 'class',
							x = p && n ? r.map((v) => n[v] || v) : r
						p ? (i.classList.remove(...x), i.classList.add(n && n[g] ? n[g] : g)) : i.setAttribute(h, g)
					}),
						f(g))
				}
				function f(g) {
					l && d.includes(g) && (i.style.colorScheme = g)
				}
				function m() {
					return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
				}
				if (o) u(o)
				else
					try {
						let g = localStorage.getItem(t) || a,
							h = s && g === 'system' ? m() : g
						u(h)
					} catch {}
			}),
				(NR = we(void 0)),
				(zR = Ea(
					({
						forcedTheme: e,
						storageKey: t,
						attribute: a,
						enableSystem: o,
						enableColorScheme: r,
						defaultTheme: n,
						value: s,
						themes: l,
						nonce: i,
						scriptProps: d
					}) => {
						let u = JSON.stringify([a, t, n, e, l, s, o, r]).slice(1, -1)
						return ge('script', {
							...d,
							suppressHydrationWarning: !0,
							nonce: typeof window > 'u' ? i : '',
							dangerouslySetInnerHTML: { __html: `(${uL.toString()})(${u})` }
						})
					}
				)))
		})
	function dL(e) {
		if (!e || typeof document > 'u') return
		let t = document.head || document.getElementsByTagName('head')[0],
			a = document.createElement('style')
		;((a.type = 'text/css'),
			t.appendChild(a),
			a.styleSheet ? (a.styleSheet.cssText = e) : a.appendChild(document.createTextNode(e)))
	}
	var VR,
		Ks,
		$s,
		He,
		cL,
		fL,
		pL,
		mL,
		hL,
		GR,
		Jf = y(() => {
			'use client'
			K()
			ua()
			;((VR = Array(12).fill(0)),
				(Ks = 1),
				($s = class {
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
											: Ks++,
									s = this.toasts.find((i) => i.id === n),
									l = t.dismissible === void 0 ? !0 : t.dismissible
								return (
									this.dismissedToasts.has(n) && this.dismissedToasts.delete(n),
									s
										? (this.toasts = this.toasts.map((i) =>
												i.id === n
													? (this.publish({ ...i, ...t, id: n, title: o }),
														{ ...i, ...t, id: n, dismissible: l, title: o })
													: i
											))
										: this.addToast({ title: o, ...r, dismissible: l, id: n }),
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
									s,
									l = r
										.then(async (d) => {
											if (((s = ['resolve', d]), Ot.isValidElement(d)))
												((n = !1), this.create({ id: o, type: 'default', message: d }))
											else if (fL(d) && !d.ok) {
												n = !1
												let f =
														typeof a.error == 'function'
															? await a.error(`HTTP error! status: ${d.status}`)
															: a.error,
													m =
														typeof a.description == 'function'
															? await a.description(`HTTP error! status: ${d.status}`)
															: a.description,
													h =
														typeof f == 'object' && !Ot.isValidElement(f)
															? f
															: { message: f }
												this.create({ id: o, type: 'error', description: m, ...h })
											} else if (d instanceof Error) {
												n = !1
												let f = typeof a.error == 'function' ? await a.error(d) : a.error,
													m =
														typeof a.description == 'function'
															? await a.description(d)
															: a.description,
													h =
														typeof f == 'object' && !Ot.isValidElement(f)
															? f
															: { message: f }
												this.create({ id: o, type: 'error', description: m, ...h })
											} else if (a.success !== void 0) {
												n = !1
												let f = typeof a.success == 'function' ? await a.success(d) : a.success,
													m =
														typeof a.description == 'function'
															? await a.description(d)
															: a.description,
													h =
														typeof f == 'object' && !Ot.isValidElement(f)
															? f
															: { message: f }
												this.create({ id: o, type: 'success', description: m, ...h })
											}
										})
										.catch(async (d) => {
											if (((s = ['reject', d]), a.error !== void 0)) {
												n = !1
												let u = typeof a.error == 'function' ? await a.error(d) : a.error,
													f =
														typeof a.description == 'function'
															? await a.description(d)
															: a.description,
													g =
														typeof u == 'object' && !Ot.isValidElement(u)
															? u
															: { message: u }
												this.create({ id: o, type: 'error', description: f, ...g })
											}
										})
										.finally(() => {
											;(n && (this.dismiss(o), (o = void 0)),
												a.finally == null || a.finally.call(a))
										}),
									i = () =>
										new Promise((d, u) =>
											l.then(() => (s[0] === 'reject' ? u(s[1]) : d(s[1]))).catch(u)
										)
								return typeof o != 'string' && typeof o != 'number'
									? { unwrap: i }
									: Object.assign(o, { unwrap: i })
							}),
							(this.custom = (t, a) => {
								let o = a?.id || Ks++
								return (this.create({ jsx: t(o), id: o, ...a }), o)
							}),
							(this.getActiveToasts = () => this.toasts.filter((t) => !this.dismissedToasts.has(t.id))),
							(this.subscribers = []),
							(this.toasts = []),
							(this.dismissedToasts = new Set()))
					}
				}),
				(He = new $s()),
				(cL = (e, t) => {
					let a = t?.id || Ks++
					return (He.addToast({ title: e, ...t, id: a }), a)
				}),
				(fL = (e) =>
					e &&
					typeof e == 'object' &&
					'ok' in e &&
					typeof e.ok == 'boolean' &&
					'status' in e &&
					typeof e.status == 'number'),
				(pL = cL),
				(mL = () => He.toasts),
				(hL = () => He.getActiveToasts()),
				(GR = Object.assign(
					pL,
					{
						success: He.success,
						info: He.info,
						warning: He.warning,
						error: He.error,
						custom: He.custom,
						message: He.message,
						promise: He.promise,
						dismiss: He.dismiss,
						loading: He.loading
					},
					{ getHistory: mL, getToasts: hL }
				)))
			dL(
				"[data-sonner-toaster][dir=ltr],html[dir=ltr]{--toast-icon-margin-start:-3px;--toast-icon-margin-end:4px;--toast-svg-margin-start:-1px;--toast-svg-margin-end:0px;--toast-button-margin-start:auto;--toast-button-margin-end:0;--toast-close-button-start:0;--toast-close-button-end:unset;--toast-close-button-transform:translate(-35%, -35%)}[data-sonner-toaster][dir=rtl],html[dir=rtl]{--toast-icon-margin-start:4px;--toast-icon-margin-end:-3px;--toast-svg-margin-start:0px;--toast-svg-margin-end:-1px;--toast-button-margin-start:0;--toast-button-margin-end:auto;--toast-close-button-start:unset;--toast-close-button-end:0;--toast-close-button-transform:translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1:hsl(0, 0%, 99%);--gray2:hsl(0, 0%, 97.3%);--gray3:hsl(0, 0%, 95.1%);--gray4:hsl(0, 0%, 93%);--gray5:hsl(0, 0%, 90.9%);--gray6:hsl(0, 0%, 88.7%);--gray7:hsl(0, 0%, 85.8%);--gray8:hsl(0, 0%, 78%);--gray9:hsl(0, 0%, 56.1%);--gray10:hsl(0, 0%, 52.3%);--gray11:hsl(0, 0%, 43.5%);--gray12:hsl(0, 0%, 9%);--border-radius:8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:0;z-index:999999999;transition:transform .4s ease}@media (hover:none) and (pointer:coarse){[data-sonner-toaster][data-lifted=true]{transform:none}}[data-sonner-toaster][data-x-position=right]{right:var(--offset-right)}[data-sonner-toaster][data-x-position=left]{left:var(--offset-left)}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translateX(-50%)}[data-sonner-toaster][data-y-position=top]{top:var(--offset-top)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--offset-bottom)}[data-sonner-toast]{--y:translateY(100%);--lift-amount:calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:0;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px rgba(0,0,0,.1);width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-y-position=top]{top:0;--y:translateY(-100%);--lift:1;--lift-amount:calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y:translateY(100%);--lift:-1;--lift-amount:calc(var(--lift) * var(--gap))}[data-sonner-toast][data-styled=true] [data-description]{font-weight:400;line-height:1.4;color:#3f3f3f}[data-rich-colors=true][data-sonner-toast][data-styled=true] [data-description]{color:inherit}[data-sonner-toaster][data-sonner-theme=dark] [data-description]{color:#e8e8e8}[data-sonner-toast][data-styled=true] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast][data-styled=true] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast][data-styled=true] [data-icon]>*{flex-shrink:0}[data-sonner-toast][data-styled=true] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast][data-styled=true] [data-content]{display:flex;flex-direction:column;gap:2px}[data-sonner-toast][data-styled=true] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;font-weight:500;cursor:pointer;outline:0;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast][data-styled=true] [data-button]:focus-visible{box-shadow:0 0 0 2px rgba(0,0,0,.4)}[data-sonner-toast][data-styled=true] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast][data-styled=true] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-styled=true] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast][data-styled=true] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;color:var(--gray12);background:var(--normal-bg);border:1px solid var(--gray4);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast][data-styled=true] [data-close-button]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-styled=true] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast][data-styled=true]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]::before{content:'';position:absolute;left:-100%;right:-100%;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]::before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]::before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]::before{content:'';position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast][data-expanded=true]::after{content:'';position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y:translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale:var(--toasts-before) * 0.05 + 1;--y:translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-x-position=right]{right:0}[data-sonner-toast][data-x-position=left]{left:0}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y:translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y:translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]::before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount-y,0)) translateX(var(--swipe-amount-x,0));transition:none}[data-sonner-toast][data-swiped=true]{user-select:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation-duration:.2s;animation-timing-function:ease-out;animation-fill-mode:forwards}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=left]{animation-name:swipe-out-left}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=right]{animation-name:swipe-out-right}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=up]{animation-name:swipe-out-up}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=down]{animation-name:swipe-out-down}@keyframes swipe-out-left{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) - 100%));opacity:0}}@keyframes swipe-out-right{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) + 100%));opacity:0}}@keyframes swipe-out-up{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) - 100%));opacity:0}}@keyframes swipe-out-down{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) + 100%));opacity:0}}@media (max-width:600px){[data-sonner-toaster]{position:fixed;right:var(--mobile-offset-right);left:var(--mobile-offset-left);width:100%}[data-sonner-toaster][dir=rtl]{left:calc(var(--mobile-offset-left) * -1)}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - var(--mobile-offset-left) * 2)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset-left)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--mobile-offset-bottom)}[data-sonner-toaster][data-y-position=top]{top:var(--mobile-offset-top)}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset-left);right:var(--mobile-offset-right);transform:none}}[data-sonner-toaster][data-sonner-theme=light]{--normal-bg:#fff;--normal-border:var(--gray4);--normal-text:var(--gray12);--success-bg:hsl(143, 85%, 96%);--success-border:hsl(145, 92%, 87%);--success-text:hsl(140, 100%, 27%);--info-bg:hsl(208, 100%, 97%);--info-border:hsl(221, 91%, 93%);--info-text:hsl(210, 92%, 45%);--warning-bg:hsl(49, 100%, 97%);--warning-border:hsl(49, 91%, 84%);--warning-text:hsl(31, 92%, 45%);--error-bg:hsl(359, 100%, 97%);--error-border:hsl(359, 100%, 94%);--error-text:hsl(360, 100%, 45%)}[data-sonner-toaster][data-sonner-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg:#000;--normal-border:hsl(0, 0%, 20%);--normal-text:var(--gray1)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg:#fff;--normal-border:var(--gray3);--normal-text:var(--gray12)}[data-sonner-toaster][data-sonner-theme=dark]{--normal-bg:#000;--normal-bg-hover:hsl(0, 0%, 12%);--normal-border:hsl(0, 0%, 20%);--normal-border-hover:hsl(0, 0%, 25%);--normal-text:var(--gray1);--success-bg:hsl(150, 100%, 6%);--success-border:hsl(147, 100%, 12%);--success-text:hsl(150, 86%, 65%);--info-bg:hsl(215, 100%, 6%);--info-border:hsl(223, 43%, 17%);--info-text:hsl(216, 87%, 65%);--warning-bg:hsl(64, 100%, 6%);--warning-border:hsl(60, 100%, 9%);--warning-text:hsl(46, 87%, 65%);--error-bg:hsl(358, 76%, 10%);--error-border:hsl(357, 89%, 16%);--error-text:hsl(358, 100%, 81%)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]{background:var(--normal-bg);border-color:var(--normal-border);color:var(--normal-text)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]:hover{background:var(--normal-bg-hover);border-color:var(--normal-border-hover)}[data-rich-colors=true][data-sonner-toast][data-type=success]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=info]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=error]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}[data-rich-colors=true][data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size:16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:first-child{animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}100%{opacity:.15}}@media (prefers-reduced-motion){.sonner-loading-bar,[data-sonner-toast],[data-sonner-toast]>*{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}"
			)
		})
	var Yf = y(() => {
		'use client'
		$f()
		Jf()
		O()
	})
	var gL,
		Js = y(() => {
			Ba()
			re()
			O()
			gL = It(
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
	var r0,
		Zf = y(() => {
			'use client'
			K()
			re()
			Js()
			O()
			r0 = we({ size: 'default', variant: 'default', spacing: 0 })
		})
	var Qf = y(() => {
		ll()
		re()
		Dl()
		cc()
		to()
		fc()
		Tc()
		As()
		Ac()
		Mc()
		Ec()
		Oc()
		Nc()
		_c()
		Gc()
		Jc()
		Yc()
		Zc()
		ef()
		tf()
		af()
		of()
		rf()
		nf()
		sf()
		lf()
		uf()
		df()
		cf()
		ff()
		Kf()
		Yf()
		Js()
		Zf()
	})
	function ap(e) {
		let t = null,
			a = 0,
			o = null,
			r = new Map(),
			n = new Set(),
			s = new Set(),
			l = { enabled: !1, production: !0 },
			i = {
				debug(h, p) {
					d() && console.debug(`[${e}] ${h}`, Pr(p))
				},
				info(h, p) {
					d() && console.info(`[${e}] ${h}`, Pr(p))
				},
				warn(h, p) {
					console.warn(`[${e}] ${h}`, Pr(p))
				},
				error(h, p) {
					console.error(`[${e}] ${h}`, Pr(p))
				}
			}
		function d() {
			let h = window.localStorage?.getItem(`xpert.debug.${e}`)
			return h === '0'
				? !1
				: h === '1'
					? !0
					: new URLSearchParams(window.location.search).get('xpertDebug') === e || l.enabled
		}
		function u(h, p = {}) {
			;(!t && h !== 'ready') ||
				window.parent.postMessage({ channel: ep, protocolVersion: 1, instanceId: t, type: h, ...p }, '*')
		}
		function f(h, p = {}) {
			let x = String(++a)
			return new Promise((v, L) => {
				let C = window.setTimeout(() => {
					r.delete(x) && L(new Error(`Remote request '${h}' timed out.`))
				}, 3e4)
				;(r.set(x, {
					resolve(b) {
						;(window.clearTimeout(C), v(b))
					},
					reject(b) {
						;(window.clearTimeout(C), L(b))
					}
				}),
					u(h, { requestId: x, ...p }))
			})
		}
		function m(h) {
			if (h.source !== window.parent || !xt(h.data)) return
			let p = h.data
			if (te(p, 'channel') !== ep || gt(p, 'protocolVersion') !== 1) return
			let x = te(p, 'type')
			if (x === 'init') {
				;((t = te(p, 'instanceId') ?? null),
					(o = xL(p)),
					(l = o.debug ?? l),
					(document.documentElement.lang = o.locale),
					i.info('bridge.init', { locale: o.locale, viewKey: te(o.manifest, 'key') }))
				for (let C of n) C(o)
				g()
				return
			}
			if (te(p, 'instanceId') !== t) return
			if (x === 'hostEvent') {
				let C = vL(p.event)
				if (C) {
					i.debug('host-event.received', { type: C.type, toolName: C.toolName })
					for (let b of s) b(C)
				}
				return
			}
			let v = te(p, 'requestId')
			if (!v) return
			let L = r.get(v)
			L &&
				(r.delete(v),
				x === 'error' ? L.reject(new Error(te(p, 'message') ?? 'Remote request failed.')) : L.resolve(p))
		}
		return (
			window.addEventListener('message', m),
			{
				logger: i,
				ready() {
					u('ready')
				},
				destroy() {
					window.removeEventListener('message', m)
					for (let h of r.values()) h.reject(new Error('Remote component bridge was destroyed.'))
					;(r.clear(), n.clear(), s.clear())
				},
				subscribeContext(h) {
					return (
						n.add(h),
						o && h(o),
						() => {
							n.delete(h)
						}
					)
				},
				subscribeHostEvents(h) {
					return (
						s.add(h),
						() => {
							s.delete(h)
						}
					)
				},
				requestData(h) {
					return (
						i.debug('request-data.started', { modelId: te(Ce(h, 'parameters'), 'modelId') }),
						f('requestData', { query: h })
					)
				},
				requestParameterOptions(h, p) {
					return f('requestParameterOptions', { parameterKey: h, query: p })
				},
				executeAction(h, p = {}) {
					return (
						i.debug('execute-action.started', { actionKey: h, targetId: p.targetId }),
						f('executeAction', {
							actionKey: h,
							targetId: p.targetId,
							input: p.input,
							parameters: p.parameters
						})
					)
				},
				async executeFileAction(h, p, x = {}) {
					return (
						i.debug('execute-file-action.started', { actionKey: h, fileName: p.name, fileSize: p.size }),
						f('executeFileAction', {
							actionKey: h,
							targetId: x.targetId,
							input: x.input,
							parameters: x.parameters,
							file: { name: p.name, type: p.type, size: p.size, buffer: await p.arrayBuffer() }
						})
					)
				},
				notify(h, p) {
					u('notify', { level: h, message: p })
				},
				reportResize: g
			}
		)
		function g() {
			let h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, 1e5)
			u('resize', { height: h, viewportBound: !0 })
		}
	}
	function op(e) {
		let t = Ce(e.payload, 'parameters') ?? {}
		return {
			page: gt(e.initialQuery, 'page') ?? 1,
			pageSize: gt(e.initialQuery, 'pageSize') ?? 50,
			search: te(e.initialQuery, 'search'),
			parameters: { ...t, ...(Ce(e.initialQuery, 'parameters') ?? {}) }
		}
	}
	function rp(e) {
		let t = document.documentElement,
			a = xt(e) ? e : void 0,
			r =
				(typeof e == 'string' ? e : (te(a, 'mode') ?? te(a, 'name') ?? te(a, 'scheme')))
					?.toLowerCase()
					.includes('dark') ?? !1
		;((t.dataset.theme = r ? 'dark' : 'light'),
			t.classList.toggle('dark', r),
			(t.style.colorScheme = r ? 'dark' : 'light'))
		let n = Ce(a, 'tokens')
		if (n)
			for (let [s, l] of Object.entries(n))
				(typeof l == 'string' || typeof l == 'number') && t.style.setProperty(`--xui-${LL(s)}`, String(l))
	}
	function Ys(e) {
		return Ce(e, 'result') ?? {}
	}
	function Zs(e, t, a) {
		if (typeof e == 'string') return e
		if (!xt(e)) return a
		let r = Qs(t) === 'zh-Hans' ? 'zh_Hans' : 'en_US',
			n = r === 'zh_Hans' ? 'en_US' : 'zh_Hans'
		return te(e, r) ?? te(e, n) ?? a
	}
	function Qs(e) {
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
	function xt(e) {
		return !!e && typeof e == 'object' && !Array.isArray(e)
	}
	function Ce(e, t) {
		let a = e?.[t]
		return xt(a) ? a : void 0
	}
	function te(e, t) {
		let a = e?.[t]
		return typeof a == 'string' ? a : void 0
	}
	function gt(e, t) {
		let a = e?.[t]
		return typeof a == 'number' && Number.isFinite(a) ? a : void 0
	}
	function tp(e, t) {
		let a = e?.[t]
		return typeof a == 'boolean' ? a : void 0
	}
	function kr(e, t) {
		let a = e?.[t]
		return Array.isArray(a) ? a : []
	}
	function xL(e) {
		let t = Ce(e, 'debug')
		return {
			manifest: Ce(e, 'manifest') ?? {},
			payload: Ce(e, 'payload') ?? {},
			initialQuery: Ce(e, 'initialQuery') ?? {},
			locale: te(e, 'locale') ?? 'en-US',
			theme: e.theme,
			debug: t ? { enabled: tp(t, 'enabled') ?? !1, production: tp(t, 'production') ?? !0 } : void 0
		}
	}
	function vL(e) {
		return xt(e)
			? {
					id: te(e, 'id'),
					type: te(e, 'type'),
					source: te(e, 'source'),
					toolName: te(e, 'toolName'),
					data: Ce(e, 'data')
				}
			: null
	}
	function Pr(e) {
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
	function LL(e) {
		return e
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.replace(/[\s_]+/g, '-')
			.toLowerCase()
	}
	var ep,
		el = y(() => {
			ep = 'xpertai.remote_component'
		})
	function sp(e) {
		let t = Qs(e),
			a = t === 'zh-Hans' ? np : t === 'zh-Hant' ? bL : CL
		return {
			locale: t,
			t(o, r) {
				let n = a[o]
				for (let [s, l] of Object.entries(r ?? {})) n = n.split(`{${s}}`).join(String(l))
				return n
			},
			formatValue(o) {
				return o == null
					? '\u2014'
					: typeof o == 'number'
						? new Intl.NumberFormat(t, { maximumFractionDigits: 12 }).format(o)
						: typeof o == 'object'
							? JSON.stringify(o)
							: String(o)
			}
		}
	}
	var CL,
		np,
		bL,
		lp = y(() => {
			el()
			;((CL = {
				cached: 'Cached',
				column: 'Column',
				cube: 'Cube',
				editor: 'MDX query editor',
				empty: 'Run a query to see real data rows.',
				failed: 'Query failed',
				loading: 'Running query\u2026',
				model: 'Semantic model',
				next: 'Next',
				noCube: 'Select cube',
				noModel: 'Select semantic model',
				previous: 'Previous',
				refresh: 'Refresh',
				rowCount: '{count} row(s)',
				run: 'Run query',
				selectContext: 'Select a semantic model and cube before running a query.',
				statementRequired: 'Enter an MDX SELECT statement.',
				truncated: 'Showing the first {count} rows',
				value: 'Value'
			}),
				(np = {
					cached: '\u7F13\u5B58',
					column: '\u5217',
					cube: 'Cube',
					editor: 'MDX \u67E5\u8BE2\u7F16\u8F91\u5668',
					empty: '\u8FD0\u884C\u67E5\u8BE2\u540E\u53EF\u67E5\u770B\u771F\u5B9E\u6570\u636E\u7ED3\u679C\u3002',
					failed: '\u67E5\u8BE2\u5931\u8D25',
					loading: '\u6B63\u5728\u8FD0\u884C\u67E5\u8BE2\u2026',
					model: '\u8BED\u4E49\u6A21\u578B',
					next: '\u4E0B\u4E00\u9875',
					noCube: '\u9009\u62E9 Cube',
					noModel: '\u9009\u62E9\u8BED\u4E49\u6A21\u578B',
					previous: '\u4E0A\u4E00\u9875',
					refresh: '\u5237\u65B0',
					rowCount: '\u5171 {count} \u884C',
					run: '\u8FD0\u884C\u67E5\u8BE2',
					selectContext: '\u8BF7\u5148\u9009\u62E9\u8BED\u4E49\u6A21\u578B\u548C Cube\u3002',
					statementRequired: '\u8BF7\u8F93\u5165 MDX SELECT \u8BED\u53E5\u3002',
					truncated: '\u5F53\u524D\u5C55\u793A\u524D {count} \u884C',
					value: '\u503C'
				}),
				(bL = {
					...np,
					empty: '\u57F7\u884C\u67E5\u8A62\u5F8C\u53EF\u67E5\u770B\u771F\u5BE6\u8CC7\u6599\u7D50\u679C\u3002',
					failed: '\u67E5\u8A62\u5931\u6557',
					loading: '\u6B63\u5728\u57F7\u884C\u67E5\u8A62\u2026',
					model: '\u8A9E\u610F\u6A21\u578B',
					next: '\u4E0B\u4E00\u9801',
					noModel: '\u9078\u64C7\u8A9E\u610F\u6A21\u578B',
					previous: '\u4E0A\u4E00\u9801',
					refresh: '\u91CD\u65B0\u6574\u7406',
					rowCount: '\u5171 {count} \u884C',
					run: '\u57F7\u884C\u67E5\u8A62',
					selectContext: '\u8ACB\u5148\u9078\u64C7\u8A9E\u610F\u6A21\u578B\u548C Cube\u3002',
					statementRequired: '\u8ACB\u8F38\u5165 MDX SELECT \u8A9E\u53E5\u3002',
					truncated: '\u76EE\u524D\u986F\u793A\u524D {count} \u884C'
				}))
		})
	var yL = fp(() => {
		K()
		nl()
		Qf()
		el()
		lp()
		O()
		var Et = ap('datax-query-analysis'),
			ip = `SELECT
  {[Measures].Members} ON COLUMNS
FROM [Cube]`
		function IL() {
			let [e, t] = M(null),
				[a, o] = M({ page: 1, pageSize: 200, parameters: {} }),
				[r, n] = M([]),
				[s, l] = M([]),
				[i, d] = M(''),
				[u, f] = M(null),
				[m, g] = M(!1),
				[h, p] = M(null),
				x = de(() => sp(e?.locale), [e?.locale])
			;(B(
				() =>
					Et.subscribeContext((S) => {
						;(rp(S.theme), sl({ density: 'compact' }), t(S))
						let T = op(S)
						;(o(T), v(T))
					}),
				[]
			),
				B(
					() =>
						Et.subscribeHostEvents((S) => {
							P(S)
						}),
					[a]
				),
				B(() => {
					Et.reportResize()
				}, [r, s, u, m, h]))
			async function v(S) {
				g(!0)
				try {
					let T = await L('modelId', S)
					n(T)
					let F = Ce(S, 'parameters') ?? {},
						N = te(F, 'modelId') ?? T[0]?.value,
						H = te(F, 'statement') ?? ''
					if ((d(H), !N)) return
					let z = vt(S, 'modelId', N),
						$ = await L('cubeName', z)
					l($)
					let A = te(F, 'cubeName') ?? $[0]?.value,
						Q = A ? vt(z, 'cubeName', A) : z
					;(o(Q), H && F.autoRun === !0 && A && (await I(Q, H)))
				} catch (T) {
					k(T)
				} finally {
					g(!1)
				}
			}
			async function L(S, T) {
				let F = await Et.requestParameterOptions(S, { parameters: Ce(T, 'parameters') ?? {} })
				return SL(Ys(F))
			}
			async function C(S) {
				let T = vt(a, 'modelId', S)
				if (((T = vt(T, 'cubeName', '')), o(T), f(null), p(null), !S)) {
					l([])
					return
				}
				try {
					let F = await L('cubeName', T)
					;(l(F), F[0]?.value && ((T = vt(T, 'cubeName', F[0].value)), o(T)))
				} catch (F) {
					k(F)
				}
			}
			function b(S) {
				;(o(vt(a, 'cubeName', S)), f(null), p(null))
			}
			async function I(S = a, T = i) {
				let F = Ce(S, 'parameters') ?? {},
					N = te(F, 'modelId'),
					H = te(F, 'cubeName')
				if (!N || !H) {
					p({ error: !0, text: x.t('selectContext') })
					return
				}
				if (!T.trim()) {
					p({ error: !0, text: x.t('statementRequired') })
					return
				}
				;(g(!0), p(null))
				try {
					let z = await Et.executeAction('execute', {
							parameters: { ...F, modelId: N, cubeName: H },
							input: { statement: T.trim(), limit: 200 }
						}),
						$ = Ys(z)
					if ($.success !== !0) throw new Error(Zs($.message, e?.locale ?? 'en-US', x.t('failed')))
					let A = Ce($, 'data')
					if (!A) throw new Error('Query result payload is missing.')
					;(f(wL(A)),
						p({ error: !1, text: Zs($.message, e?.locale ?? 'en-US', '') }),
						o(vt(S, 'statement', T.trim())),
						Et.logger.info('query.completed', {
							modelId: N,
							cubeName: H,
							rowCount: gt(A, 'totalRowCount')
						}))
				} catch (z) {
					;(k(z), f(null))
				} finally {
					g(!1)
				}
			}
			async function P(S) {
				if (S.type !== 'assistant.tool.completed' || S.toolName !== 'datax_query_execute') return
				let T = Ce(S.data, 'output') ?? S.data,
					F = te(T, 'modelId'),
					N = te(T, 'cubeName'),
					H = te(T, 'mdx')
				if (!F || !N || !H) return
				let z = vt(a, 'modelId', F)
				;((z = vt(z, 'cubeName', N)), d(H), o(z), l(await L('cubeName', z)), await I(z, H))
			}
			function k(S) {
				let T = S instanceof Error ? S.message : String(S)
				;(p({ error: !0, text: T }), Et.logger.error('query.failed', { message: T }))
			}
			let w = Ce(a, 'parameters') ?? {},
				E = te(w, 'modelId') ?? '',
				U = te(w, 'cubeName') ?? ''
			return c(Hc, {
				children: W('div', {
					className: 'flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground',
					children: [
						W('header', {
							className: 'flex min-h-14 flex-wrap items-center gap-2 border-b bg-card px-4 py-2',
							children: [
								W('div', {
									className: 'mr-2 min-w-40',
									children: [
										c('div', { className: 'text-sm font-semibold', children: 'Query Analysis' }),
										c('div', {
											className: 'text-xs text-muted-foreground',
											children: 'MDX workbench \xB7 real data'
										})
									]
								}),
								W(Ds, {
									value: E,
									onValueChange: (S) => {
										C(S)
									},
									children: [
										c(Es, {
											className: 'w-[260px]',
											'aria-label': x.t('model'),
											children: c(Ms, { placeholder: x.t('noModel') })
										}),
										c(Os, {
											children: r.map((S) =>
												c(Bs, { value: S.value, children: S.label }, S.value)
											)
										})
									]
								}),
								W(Ds, {
									value: U,
									onValueChange: b,
									disabled: !E,
									children: [
										c(Es, {
											className: 'w-[220px]',
											'aria-label': x.t('cube'),
											children: c(Ms, { placeholder: x.t('noCube') })
										}),
										c(Os, {
											children: s.map((S) =>
												c(Bs, { value: S.value, children: S.label }, S.value)
											)
										})
									]
								}),
								W(qc, {
									children: [
										c(Uc, {
											asChild: !0,
											children: c(xr, {
												variant: 'outline',
												onClick: () => d(ip),
												children: 'Template'
											})
										}),
										c(Vc, { children: 'Insert a starter MDX statement' })
									]
								}),
								c(xr, {
									disabled: m,
									onClick: () => {
										I()
									},
									children: m ? x.t('loading') : x.t('run')
								})
							]
						}),
						W('div', {
							className: 'grid min-h-0 flex-1 grid-rows-[minmax(160px,34vh)_auto_minmax(0,1fr)]',
							children: [
								c('div', {
									className: 'border-b p-3',
									children: c(zc, {
										className: 'h-full min-h-36 resize-none font-mono text-[13px] leading-6',
										'aria-label': x.t('editor'),
										spellCheck: !1,
										placeholder: ip,
										value: i,
										onChange: (S) => d(S.currentTarget.value)
									})
								}),
								W('div', {
									className:
										'flex min-h-10 items-center gap-2 border-b px-4 py-1.5 text-xs text-muted-foreground',
									children: [
										h
											? c('span', {
													className: h.error ? 'text-destructive' : 'text-foreground',
													children: h.text
												})
											: c('span', { children: x.t('empty') }),
										u
											? W(Je, {
													children: [
														c(gr, {
															variant: 'secondary',
															children: x.t('rowCount', { count: u.totalRowCount })
														}),
														u.truncated
															? c(gr, {
																	variant: 'outline',
																	children: x.t('truncated', { count: u.rowCount })
																})
															: null,
														typeof u.durationMs == 'number'
															? W(gr, {
																	variant: 'outline',
																	children: [u.durationMs, ' ms']
																})
															: null
													]
												})
											: null
									]
								}),
								W(Bc, {
									defaultValue: 'results',
									className: 'flex min-h-0 flex-col',
									children: [
										c('div', {
											className: 'flex items-center border-b px-3',
											children: W(Fc, {
												className: 'h-10 bg-transparent',
												children: [
													c(br, { value: 'results', children: 'Results' }),
													c(br, {
														value: 'sql',
														disabled: !u?.sql,
														children: 'Generated SQL'
													}),
													c(br, {
														value: 'mdx',
														disabled: !u?.mdx,
														children: 'Normalized MDX'
													})
												]
											})
										}),
										c(Ir, {
											value: 'results',
											className: 'mt-0 min-h-0 flex-1 overflow-hidden',
											children:
												m && !u
													? c('div', {
															className: 'space-y-2 p-4',
															children: Array.from({ length: 6 }, (S, T) =>
																c(Qc, { className: 'h-8 w-full' }, T)
															)
														})
													: !u || !u.rows.length
														? c('div', {
																className:
																	'grid h-full place-items-center text-sm text-muted-foreground',
																children: x.t('empty')
															})
														: c(Dc, {
																className: 'h-full',
																children: W(Wc, {
																	children: [
																		c(jc, {
																			className: 'sticky top-0 z-10 bg-card',
																			children: c(Fs, {
																				children: u.columns.map((S) =>
																					W(
																						Kc,
																						{
																							className:
																								'min-w-40 whitespace-nowrap',
																							children: [
																								c('div', {
																									className:
																										'font-medium',
																									children: S.name
																								}),
																								c('div', {
																									className:
																										'text-[10px] font-normal text-muted-foreground',
																									children:
																										S.type ??
																										'value'
																								})
																							]
																						},
																						S.name
																					)
																				)
																			})
																		}),
																		c(Xc, {
																			children: u.rows.map((S, T) =>
																				c(
																					Fs,
																					{
																						children: u.columns.map((F) =>
																							c(
																								$c,
																								{
																									className:
																										'max-w-[440px] truncate whitespace-nowrap font-mono text-xs',
																									children:
																										x.formatValue(
																											S[F.name]
																										)
																								},
																								F.name
																							)
																						)
																					},
																					T
																				)
																			)
																		})
																	]
																})
															})
										}),
										c(Ir, {
											value: 'sql',
											className: 'mt-0 min-h-0 flex-1 p-3',
											children: W(ws, {
												className: 'h-full',
												children: [
													c(ys, {
														className: 'py-3',
														children: c(Rs, {
															className: 'text-sm',
															children: 'Generated SQL'
														})
													}),
													c(Ps, {
														children: c('pre', {
															className:
																'whitespace-pre-wrap font-mono text-xs leading-6',
															children: u?.sql
														})
													})
												]
											})
										}),
										c(Ir, {
											value: 'mdx',
											className: 'mt-0 min-h-0 flex-1 p-3',
											children: W(ws, {
												className: 'h-full',
												children: [
													c(ys, {
														className: 'py-3',
														children: c(Rs, {
															className: 'text-sm',
															children: 'Normalized MDX'
														})
													}),
													c(Ps, {
														children: c('pre', {
															className:
																'whitespace-pre-wrap font-mono text-xs leading-6',
															children: u?.mdx
														})
													})
												]
											})
										})
									]
								})
							]
						})
					]
				})
			})
		}
		function SL(e) {
			return kr(e, 'items')
				.filter(xt)
				.map((t) => ({
					value: up(t, 'value'),
					label: te(t, 'label') ?? up(t, 'value'),
					description: te(t, 'description')
				}))
				.filter((t) => t.value)
		}
		function wL(e) {
			let t = Ce(e, 'audit')
			return {
				columns: kr(e, 'columns')
					.filter(xt)
					.map((a) => ({ name: te(a, 'name') ?? '', type: te(a, 'type') }))
					.filter((a) => a.name),
				rows: kr(e, 'rows').filter(xt),
				rowCount: gt(e, 'rowCount') ?? 0,
				totalRowCount: gt(e, 'totalRowCount') ?? gt(e, 'rowCount') ?? 0,
				truncated: e.truncated === !0,
				mdx: te(e, 'mdx'),
				sql: te(e, 'sql'),
				durationMs: gt(t, 'durationMs')
			}
		}
		function vt(e, t, a) {
			let o = { ...(Ce(e, 'parameters') ?? {}) }
			return (a === '' || a === null || a === void 0 ? delete o[t] : (o[t] = a), { ...e, parameters: o })
		}
		function up(e, t) {
			let a = e[t]
			return typeof a == 'string' || typeof a == 'number' || typeof a == 'boolean' ? String(a) : ''
		}
		var dp = document.getElementById('root')
		if (!dp) throw new Error('Remote component root was not found.')
		rl(dp).render(c(IL, {}))
		Et.ready()
	})
	yL()
})()
