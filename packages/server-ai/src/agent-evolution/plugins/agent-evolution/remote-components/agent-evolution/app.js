;(() => {
    var fd = Object.defineProperty
    var ds = (e) => {
        throw TypeError(e)
    }
    var L = (e, t, a) => () => {
        if (a) throw a[0]
        try {
            return (e && (t = e((e = 0))), t)
        } catch (o) {
            throw ((a = [o]), o)
        }
    }
    var pd = (e, t) => () => {
            try {
                return (t || e((t = { exports: {} }).exports, t), t.exports)
            } catch (a) {
                throw ((t = 0), a)
            }
        },
        Ke = (e, t) => {
            for (var a in t) fd(e, a, { get: t[a], enumerable: !0 })
        }
    var cs = (e, t, a) => t.has(e) || ds('Cannot ' + a)
    var Dt = (e, t, a) => (cs(e, t, 'read from private field'), a ? a.call(e) : t.get(e)),
        To = (e, t, a) =>
            t.has(e)
                ? ds('Cannot add the same private member more than once')
                : t instanceof WeakSet
                  ? t.add(e)
                  : t.set(e, a),
        Ao = (e, t, a, o) => (cs(e, t, 'write to private field'), o ? o.call(e, a) : t.set(e, a), a)
    var _ = {}
    Ke(_, {
        Children: () => ke,
        Component: () => md,
        Fragment: () => Te,
        Profiler: () => gd,
        PureComponent: () => hd,
        StrictMode: () => xd,
        Suspense: () => vd,
        cloneElement: () => Be,
        createContext: () => de,
        createElement: () => oe,
        createRef: () => Ld,
        default: () => ft,
        forwardRef: () => P,
        isValidElement: () => Mt,
        lazy: () => Cd,
        memo: () => oa,
        startTransition: () => Id,
        useCallback: () => W,
        useContext: () => me,
        useDebugValue: () => bd,
        useDeferredValue: () => Sd,
        useEffect: () => M,
        useId: () => Do,
        useImperativeHandle: () => Ea,
        useInsertionEffect: () => yd,
        useLayoutEffect: () => pt,
        useMemo: () => he,
        useReducer: () => Et,
        useRef: () => k,
        useState: () => N,
        useSyncExternalStore: () => Mo,
        useTransition: () => wd,
        version: () => Pd
    })
    var j,
        ft,
        ke,
        md,
        Te,
        gd,
        hd,
        xd,
        vd,
        Be,
        de,
        oe,
        Ld,
        P,
        Mt,
        Cd,
        oa,
        Id,
        W,
        me,
        bd,
        Sd,
        M,
        Do,
        Ea,
        yd,
        pt,
        he,
        Et,
        k,
        N,
        Mo,
        wd,
        Pd,
        U = L(() => {
            ;((j = globalThis.React),
                (ft = j),
                (ke = j.Children),
                (md = j.Component),
                (Te = j.Fragment),
                (gd = j.Profiler),
                (hd = j.PureComponent),
                (xd = j.StrictMode),
                (vd = j.Suspense),
                (Be = j.cloneElement),
                (de = j.createContext),
                (oe = j.createElement),
                (Ld = j.createRef),
                (P = j.forwardRef),
                (Mt = j.isValidElement),
                (Cd = j.lazy),
                (oa = j.memo),
                (Id = j.startTransition),
                (W = j.useCallback),
                (me = j.useContext),
                (bd = j.useDebugValue),
                (Sd = j.useDeferredValue),
                (M = j.useEffect),
                (Do = j.useId),
                (Ea = j.useImperativeHandle),
                (yd = j.useInsertionEffect),
                (pt = j.useLayoutEffect),
                (he = j.useMemo),
                (Et = j.useReducer),
                (k = j.useRef),
                (N = j.useState),
                (Mo = j.useSyncExternalStore),
                (wd = j.useTransition),
                (Pd = j.version))
        })
    var fs,
        ps,
        Dg,
        ms = L(() => {
            ;((fs = globalThis.ReactDOM), (ps = fs.createRoot), (Dg = fs.hydrateRoot))
        })
    function gs(e = {}) {
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
    var hs = L(() => {})
    function xs(e) {
        var t,
            a,
            o = ''
        if (typeof e == 'string' || typeof e == 'number') o += e
        else if (typeof e == 'object')
            if (Array.isArray(e)) {
                var r = e.length
                for (t = 0; t < r; t++) e[t] && (a = xs(e[t])) && (o && (o += ' '), (o += a))
            } else for (a in e) e[a] && (o && (o += ' '), (o += a))
        return o
    }
    function Fa() {
        for (var e, t, a = 0, o = '', r = arguments.length; a < r; a++)
            (e = arguments[a]) && (t = xs(e)) && (o && (o += ' '), (o += t))
        return o
    }
    var Eo = L(() => {})
    var Rd,
        kd,
        Ss,
        vs,
        Td,
        Ad,
        ys,
        Dd,
        Md,
        Ed,
        Bo,
        Fd,
        Bd,
        Od,
        Nd,
        ws,
        zd,
        Hd,
        qd,
        Ls,
        Ud,
        _d,
        Vd,
        Gd,
        Wd,
        Xd,
        Ps,
        jd,
        Kd,
        ne,
        Rs,
        ks,
        $d,
        Zd,
        Yd,
        Jd,
        Qd,
        ec,
        Ft,
        V,
        $e,
        Fo,
        Oe,
        Ts,
        tc,
        Oo,
        ac,
        oc,
        rc,
        sc,
        E,
        mt,
        Cs,
        nc,
        lc,
        Is,
        ic,
        Ba,
        F,
        ra,
        uc,
        bs,
        dc,
        cc,
        Oa,
        fc,
        Ze,
        gt,
        As,
        Ds,
        Ms,
        Es,
        pc,
        Fs,
        Bs,
        Os,
        mc,
        Ns,
        zs = L(() => {
            ;((Rd = (e, t) => {
                let a = new Array(e.length + t.length)
                for (let o = 0; o < e.length; o++) a[o] = e[o]
                for (let o = 0; o < t.length; o++) a[e.length + o] = t[o]
                return a
            }),
                (kd = (e, t) => ({ classGroupId: e, validator: t })),
                (Ss = (e = new Map(), t = null, a) => ({ nextPart: e, validators: t, classGroupId: a })),
                (vs = []),
                (Td = 'arbitrary..'),
                (Ad = (e) => {
                    let t = Md(e),
                        { conflictingClassGroups: a, conflictingClassGroupModifiers: o } = e
                    return {
                        getClassGroupId: (i) => {
                            if (i.startsWith('[') && i.endsWith(']')) return Dd(i)
                            let l = i.split('-'),
                                u = l[0] === '' && l.length > 1 ? 1 : 0
                            return ys(l, u, t)
                        },
                        getConflictingClassGroupIds: (i, l) => {
                            if (l) {
                                let u = o[i],
                                    c = a[i]
                                return u ? (c ? Rd(c, u) : u) : c || vs
                            }
                            return a[i] || vs
                        }
                    }
                }),
                (ys = (e, t, a) => {
                    if (e.length - t === 0) return a.classGroupId
                    let r = e[t],
                        s = a.nextPart.get(r)
                    if (s) {
                        let c = ys(e, t + 1, s)
                        if (c) return c
                    }
                    let i = a.validators
                    if (i === null) return
                    let l = t === 0 ? e.join('-') : e.slice(t).join('-'),
                        u = i.length
                    for (let c = 0; c < u; c++) {
                        let d = i[c]
                        if (d.validator(l)) return d.classGroupId
                    }
                }),
                (Dd = (e) =>
                    e.slice(1, -1).indexOf(':') === -1
                        ? void 0
                        : (() => {
                              let t = e.slice(1, -1),
                                  a = t.indexOf(':'),
                                  o = t.slice(0, a)
                              return o ? Td + o : void 0
                          })()),
                (Md = (e) => {
                    let { theme: t, classGroups: a } = e
                    return Ed(a, t)
                }),
                (Ed = (e, t) => {
                    let a = Ss()
                    for (let o in e) {
                        let r = e[o]
                        Bo(r, a, o, t)
                    }
                    return a
                }),
                (Bo = (e, t, a, o) => {
                    let r = e.length
                    for (let s = 0; s < r; s++) {
                        let i = e[s]
                        Fd(i, t, a, o)
                    }
                }),
                (Fd = (e, t, a, o) => {
                    if (typeof e == 'string') {
                        Bd(e, t, a)
                        return
                    }
                    if (typeof e == 'function') {
                        Od(e, t, a, o)
                        return
                    }
                    Nd(e, t, a, o)
                }),
                (Bd = (e, t, a) => {
                    let o = e === '' ? t : ws(t, e)
                    o.classGroupId = a
                }),
                (Od = (e, t, a, o) => {
                    if (zd(e)) {
                        Bo(e(o), t, a, o)
                        return
                    }
                    ;(t.validators === null && (t.validators = []), t.validators.push(kd(a, e)))
                }),
                (Nd = (e, t, a, o) => {
                    let r = Object.entries(e),
                        s = r.length
                    for (let i = 0; i < s; i++) {
                        let [l, u] = r[i]
                        Bo(u, ws(t, l), a, o)
                    }
                }),
                (ws = (e, t) => {
                    let a = e,
                        o = t.split('-'),
                        r = o.length
                    for (let s = 0; s < r; s++) {
                        let i = o[s],
                            l = a.nextPart.get(i)
                        ;(l || ((l = Ss()), a.nextPart.set(i, l)), (a = l))
                    }
                    return a
                }),
                (zd = (e) => 'isThemeGetter' in e && e.isThemeGetter === !0),
                (Hd = (e) => {
                    if (e < 1) return { get: () => {}, set: () => {} }
                    let t = 0,
                        a = Object.create(null),
                        o = Object.create(null),
                        r = (s, i) => {
                            ;((a[s] = i), t++, t > e && ((t = 0), (o = a), (a = Object.create(null))))
                        }
                    return {
                        get(s) {
                            let i = a[s]
                            if (i !== void 0) return i
                            if ((i = o[s]) !== void 0) return (r(s, i), i)
                        },
                        set(s, i) {
                            s in a ? (a[s] = i) : r(s, i)
                        }
                    }
                }),
                (qd = []),
                (Ls = (e, t, a, o, r) => ({
                    modifiers: e,
                    hasImportantModifier: t,
                    baseClassName: a,
                    maybePostfixModifierPosition: o,
                    isExternal: r
                })),
                (Ud = (e) => {
                    let { prefix: t, experimentalParseClassName: a } = e,
                        o = (r) => {
                            let s = [],
                                i = 0,
                                l = 0,
                                u = 0,
                                c,
                                d = r.length
                            for (let m = 0; m < d; m++) {
                                let h = r[m]
                                if (i === 0 && l === 0) {
                                    if (h === ':') {
                                        ;(s.push(r.slice(u, m)), (u = m + 1))
                                        continue
                                    }
                                    if (h === '/') {
                                        c = m
                                        continue
                                    }
                                }
                                h === '[' ? i++ : h === ']' ? i-- : h === '(' ? l++ : h === ')' && l--
                            }
                            let f = s.length === 0 ? r : r.slice(u),
                                p = f,
                                g = !1
                            f.endsWith('!')
                                ? ((p = f.slice(0, -1)), (g = !0))
                                : f.startsWith('!') && ((p = f.slice(1)), (g = !0))
                            let x = c && c > u ? c - u : void 0
                            return Ls(s, g, p, x)
                        }
                    if (t) {
                        let r = t + ':',
                            s = o
                        o = (i) => (i.startsWith(r) ? s(i.slice(r.length)) : Ls(qd, !1, i, void 0, !0))
                    }
                    if (a) {
                        let r = o
                        o = (s) => a({ className: s, parseClassName: r })
                    }
                    return o
                }),
                (_d = (e) => {
                    let t = new Map()
                    return (
                        e.orderSensitiveModifiers.forEach((a, o) => {
                            t.set(a, 1e6 + o)
                        }),
                        (a) => {
                            let o = [],
                                r = []
                            for (let s = 0; s < a.length; s++) {
                                let i = a[s],
                                    l = i[0] === '[',
                                    u = t.has(i)
                                l || u ? (r.length > 0 && (r.sort(), o.push(...r), (r = [])), o.push(i)) : r.push(i)
                            }
                            return (r.length > 0 && (r.sort(), o.push(...r)), o)
                        }
                    )
                }),
                (Vd = (e) => ({ cache: Hd(e.cacheSize), parseClassName: Ud(e), sortModifiers: _d(e), ...Ad(e) })),
                (Gd = /\s+/),
                (Wd = (e, t) => {
                    let { parseClassName: a, getClassGroupId: o, getConflictingClassGroupIds: r, sortModifiers: s } = t,
                        i = [],
                        l = e.trim().split(Gd),
                        u = ''
                    for (let c = l.length - 1; c >= 0; c -= 1) {
                        let d = l[c],
                            {
                                isExternal: f,
                                modifiers: p,
                                hasImportantModifier: g,
                                baseClassName: x,
                                maybePostfixModifierPosition: m
                            } = a(d)
                        if (f) {
                            u = d + (u.length > 0 ? ' ' + u : u)
                            continue
                        }
                        let h = !!m,
                            v = o(h ? x.substring(0, m) : x)
                        if (!v) {
                            if (!h) {
                                u = d + (u.length > 0 ? ' ' + u : u)
                                continue
                            }
                            if (((v = o(x)), !v)) {
                                u = d + (u.length > 0 ? ' ' + u : u)
                                continue
                            }
                            h = !1
                        }
                        let C = p.length === 0 ? '' : p.length === 1 ? p[0] : s(p).join(':'),
                            b = g ? C + '!' : C,
                            S = b + v
                        if (i.indexOf(S) > -1) continue
                        i.push(S)
                        let y = r(v, h)
                        for (let A = 0; A < y.length; ++A) {
                            let B = y[A]
                            i.push(b + B)
                        }
                        u = d + (u.length > 0 ? ' ' + u : u)
                    }
                    return u
                }),
                (Xd = (...e) => {
                    let t = 0,
                        a,
                        o,
                        r = ''
                    for (; t < e.length; ) (a = e[t++]) && (o = Ps(a)) && (r && (r += ' '), (r += o))
                    return r
                }),
                (Ps = (e) => {
                    if (typeof e == 'string') return e
                    let t,
                        a = ''
                    for (let o = 0; o < e.length; o++) e[o] && (t = Ps(e[o])) && (a && (a += ' '), (a += t))
                    return a
                }),
                (jd = (e, ...t) => {
                    let a,
                        o,
                        r,
                        s,
                        i = (u) => {
                            let c = t.reduce((d, f) => f(d), e())
                            return ((a = Vd(c)), (o = a.cache.get), (r = a.cache.set), (s = l), l(u))
                        },
                        l = (u) => {
                            let c = o(u)
                            if (c) return c
                            let d = Wd(u, a)
                            return (r(u, d), d)
                        }
                    return ((s = i), (...u) => s(Xd(...u)))
                }),
                (Kd = []),
                (ne = (e) => {
                    let t = (a) => a[e] || Kd
                    return ((t.isThemeGetter = !0), t)
                }),
                (Rs = /^\[(?:(\w[\w-]*):)?(.+)\]$/i),
                (ks = /^\((?:(\w[\w-]*):)?(.+)\)$/i),
                ($d = /^\d+\/\d+$/),
                (Zd = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/),
                (Yd =
                    /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/),
                (Jd = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/),
                (Qd = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/),
                (ec = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/),
                (Ft = (e) => $d.test(e)),
                (V = (e) => !!e && !Number.isNaN(Number(e))),
                ($e = (e) => !!e && Number.isInteger(Number(e))),
                (Fo = (e) => e.endsWith('%') && V(e.slice(0, -1))),
                (Oe = (e) => Zd.test(e)),
                (Ts = () => !0),
                (tc = (e) => Yd.test(e) && !Jd.test(e)),
                (Oo = () => !1),
                (ac = (e) => Qd.test(e)),
                (oc = (e) => ec.test(e)),
                (rc = (e) => !E(e) && !F(e)),
                (sc = (e) => Ze(e, Ms, Oo)),
                (E = (e) => Rs.test(e)),
                (mt = (e) => Ze(e, Es, tc)),
                (Cs = (e) => Ze(e, pc, V)),
                (nc = (e) => Ze(e, Bs, Ts)),
                (lc = (e) => Ze(e, Fs, Oo)),
                (Is = (e) => Ze(e, As, Oo)),
                (ic = (e) => Ze(e, Ds, oc)),
                (Ba = (e) => Ze(e, Os, ac)),
                (F = (e) => ks.test(e)),
                (ra = (e) => gt(e, Es)),
                (uc = (e) => gt(e, Fs)),
                (bs = (e) => gt(e, As)),
                (dc = (e) => gt(e, Ms)),
                (cc = (e) => gt(e, Ds)),
                (Oa = (e) => gt(e, Os, !0)),
                (fc = (e) => gt(e, Bs, !0)),
                (Ze = (e, t, a) => {
                    let o = Rs.exec(e)
                    return o ? (o[1] ? t(o[1]) : a(o[2])) : !1
                }),
                (gt = (e, t, a = !1) => {
                    let o = ks.exec(e)
                    return o ? (o[1] ? t(o[1]) : a) : !1
                }),
                (As = (e) => e === 'position' || e === 'percentage'),
                (Ds = (e) => e === 'image' || e === 'url'),
                (Ms = (e) => e === 'length' || e === 'size' || e === 'bg-size'),
                (Es = (e) => e === 'length'),
                (pc = (e) => e === 'number'),
                (Fs = (e) => e === 'family-name'),
                (Bs = (e) => e === 'number' || e === 'weight'),
                (Os = (e) => e === 'shadow'),
                (mc = () => {
                    let e = ne('color'),
                        t = ne('font'),
                        a = ne('text'),
                        o = ne('font-weight'),
                        r = ne('tracking'),
                        s = ne('leading'),
                        i = ne('breakpoint'),
                        l = ne('container'),
                        u = ne('spacing'),
                        c = ne('radius'),
                        d = ne('shadow'),
                        f = ne('inset-shadow'),
                        p = ne('text-shadow'),
                        g = ne('drop-shadow'),
                        x = ne('blur'),
                        m = ne('perspective'),
                        h = ne('aspect'),
                        v = ne('ease'),
                        C = ne('animate'),
                        b = () => ['auto', 'avoid', 'all', 'avoid-page', 'page', 'left', 'right', 'column'],
                        S = () => [
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
                        y = () => [...S(), F, E],
                        A = () => ['auto', 'hidden', 'clip', 'visible', 'scroll'],
                        B = () => ['auto', 'contain', 'none'],
                        w = () => [F, E, u],
                        D = () => [Ft, 'full', 'auto', ...w()],
                        G = () => [$e, 'none', 'subgrid', F, E],
                        z = () => ['auto', { span: ['full', $e, F, E] }, $e, F, E],
                        q = () => [$e, 'auto', F, E],
                        ee = () => ['auto', 'min', 'max', 'fr', F, E],
                        X = () => [
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
                        te = () => ['start', 'end', 'center', 'stretch', 'center-safe', 'end-safe'],
                        Y = () => ['auto', ...w()],
                        Le = () => [
                            Ft,
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
                        H = () => [e, F, E],
                        je = () => [...S(), bs, Is, { position: [F, E] }],
                        Ce = () => ['no-repeat', { repeat: ['', 'x', 'y', 'space', 'round'] }],
                        Fe = () => ['auto', 'cover', 'contain', dc, sc, { size: [F, E] }],
                        kt = () => [Fo, ra, mt],
                        se = () => ['', 'none', 'full', c, F, E],
                        pe = () => ['', V, ra, mt],
                        Tt = () => ['solid', 'dashed', 'dotted', 'double'],
                        Ie = () => [
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
                        re = () => [V, Fo, bs, Is],
                        Aa = () => ['', 'none', x, F, E],
                        At = () => ['none', V, F, E],
                        Da = () => ['none', V, F, E],
                        ko = () => [V, F, E],
                        Ma = () => [Ft, 'full', ...w()]
                    return {
                        cacheSize: 500,
                        theme: {
                            animate: ['spin', 'ping', 'pulse', 'bounce'],
                            aspect: ['video'],
                            blur: [Oe],
                            breakpoint: [Oe],
                            color: [Ts],
                            container: [Oe],
                            'drop-shadow': [Oe],
                            ease: ['in', 'out', 'in-out'],
                            font: [rc],
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
                            'inset-shadow': [Oe],
                            leading: ['none', 'tight', 'snug', 'normal', 'relaxed', 'loose'],
                            perspective: ['dramatic', 'near', 'normal', 'midrange', 'distant', 'none'],
                            radius: [Oe],
                            shadow: [Oe],
                            spacing: ['px', V],
                            text: [Oe],
                            'text-shadow': [Oe],
                            tracking: ['tighter', 'tight', 'normal', 'wide', 'wider', 'widest']
                        },
                        classGroups: {
                            aspect: [{ aspect: ['auto', 'square', Ft, E, F, h] }],
                            container: ['container'],
                            columns: [{ columns: [V, E, F, l] }],
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
                            'object-position': [{ object: y() }],
                            overflow: [{ overflow: A() }],
                            'overflow-x': [{ 'overflow-x': A() }],
                            'overflow-y': [{ 'overflow-y': A() }],
                            overscroll: [{ overscroll: B() }],
                            'overscroll-x': [{ 'overscroll-x': B() }],
                            'overscroll-y': [{ 'overscroll-y': B() }],
                            position: ['static', 'fixed', 'absolute', 'relative', 'sticky'],
                            inset: [{ inset: D() }],
                            'inset-x': [{ 'inset-x': D() }],
                            'inset-y': [{ 'inset-y': D() }],
                            start: [{ start: D() }],
                            end: [{ end: D() }],
                            top: [{ top: D() }],
                            right: [{ right: D() }],
                            bottom: [{ bottom: D() }],
                            left: [{ left: D() }],
                            visibility: ['visible', 'invisible', 'collapse'],
                            z: [{ z: [$e, 'auto', F, E] }],
                            basis: [{ basis: [Ft, 'full', 'auto', l, ...w()] }],
                            'flex-direction': [{ flex: ['row', 'row-reverse', 'col', 'col-reverse'] }],
                            'flex-wrap': [{ flex: ['nowrap', 'wrap', 'wrap-reverse'] }],
                            flex: [{ flex: [V, Ft, 'auto', 'initial', 'none', E] }],
                            grow: [{ grow: ['', V, F, E] }],
                            shrink: [{ shrink: ['', V, F, E] }],
                            order: [{ order: [$e, 'first', 'last', 'none', F, E] }],
                            'grid-cols': [{ 'grid-cols': G() }],
                            'col-start-end': [{ col: z() }],
                            'col-start': [{ 'col-start': q() }],
                            'col-end': [{ 'col-end': q() }],
                            'grid-rows': [{ 'grid-rows': G() }],
                            'row-start-end': [{ row: z() }],
                            'row-start': [{ 'row-start': q() }],
                            'row-end': [{ 'row-end': q() }],
                            'grid-flow': [{ 'grid-flow': ['row', 'col', 'dense', 'row-dense', 'col-dense'] }],
                            'auto-cols': [{ 'auto-cols': ee() }],
                            'auto-rows': [{ 'auto-rows': ee() }],
                            gap: [{ gap: w() }],
                            'gap-x': [{ 'gap-x': w() }],
                            'gap-y': [{ 'gap-y': w() }],
                            'justify-content': [{ justify: [...X(), 'normal'] }],
                            'justify-items': [{ 'justify-items': [...te(), 'normal'] }],
                            'justify-self': [{ 'justify-self': ['auto', ...te()] }],
                            'align-content': [{ content: ['normal', ...X()] }],
                            'align-items': [{ items: [...te(), { baseline: ['', 'last'] }] }],
                            'align-self': [{ self: ['auto', ...te(), { baseline: ['', 'last'] }] }],
                            'place-content': [{ 'place-content': X() }],
                            'place-items': [{ 'place-items': [...te(), 'baseline'] }],
                            'place-self': [{ 'place-self': ['auto', ...te()] }],
                            p: [{ p: w() }],
                            px: [{ px: w() }],
                            py: [{ py: w() }],
                            ps: [{ ps: w() }],
                            pe: [{ pe: w() }],
                            pt: [{ pt: w() }],
                            pr: [{ pr: w() }],
                            pb: [{ pb: w() }],
                            pl: [{ pl: w() }],
                            m: [{ m: Y() }],
                            mx: [{ mx: Y() }],
                            my: [{ my: Y() }],
                            ms: [{ ms: Y() }],
                            me: [{ me: Y() }],
                            mt: [{ mt: Y() }],
                            mr: [{ mr: Y() }],
                            mb: [{ mb: Y() }],
                            ml: [{ ml: Y() }],
                            'space-x': [{ 'space-x': w() }],
                            'space-x-reverse': ['space-x-reverse'],
                            'space-y': [{ 'space-y': w() }],
                            'space-y-reverse': ['space-y-reverse'],
                            size: [{ size: Le() }],
                            w: [{ w: [l, 'screen', ...Le()] }],
                            'min-w': [{ 'min-w': [l, 'screen', 'none', ...Le()] }],
                            'max-w': [{ 'max-w': [l, 'screen', 'none', 'prose', { screen: [i] }, ...Le()] }],
                            h: [{ h: ['screen', 'lh', ...Le()] }],
                            'min-h': [{ 'min-h': ['screen', 'lh', 'none', ...Le()] }],
                            'max-h': [{ 'max-h': ['screen', 'lh', ...Le()] }],
                            'font-size': [{ text: ['base', a, ra, mt] }],
                            'font-smoothing': ['antialiased', 'subpixel-antialiased'],
                            'font-style': ['italic', 'not-italic'],
                            'font-weight': [{ font: [o, fc, nc] }],
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
                                        Fo,
                                        E
                                    ]
                                }
                            ],
                            'font-family': [{ font: [uc, lc, t] }],
                            'fvn-normal': ['normal-nums'],
                            'fvn-ordinal': ['ordinal'],
                            'fvn-slashed-zero': ['slashed-zero'],
                            'fvn-figure': ['lining-nums', 'oldstyle-nums'],
                            'fvn-spacing': ['proportional-nums', 'tabular-nums'],
                            'fvn-fraction': ['diagonal-fractions', 'stacked-fractions'],
                            tracking: [{ tracking: [r, F, E] }],
                            'line-clamp': [{ 'line-clamp': [V, 'none', F, Cs] }],
                            leading: [{ leading: [s, ...w()] }],
                            'list-image': [{ 'list-image': ['none', F, E] }],
                            'list-style-position': [{ list: ['inside', 'outside'] }],
                            'list-style-type': [{ list: ['disc', 'decimal', 'none', F, E] }],
                            'text-alignment': [{ text: ['left', 'center', 'right', 'justify', 'start', 'end'] }],
                            'placeholder-color': [{ placeholder: H() }],
                            'text-color': [{ text: H() }],
                            'text-decoration': ['underline', 'overline', 'line-through', 'no-underline'],
                            'text-decoration-style': [{ decoration: [...Tt(), 'wavy'] }],
                            'text-decoration-thickness': [{ decoration: [V, 'from-font', 'auto', F, mt] }],
                            'text-decoration-color': [{ decoration: H() }],
                            'underline-offset': [{ 'underline-offset': [V, 'auto', F, E] }],
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
                                        F,
                                        E
                                    ]
                                }
                            ],
                            whitespace: [
                                { whitespace: ['normal', 'nowrap', 'pre', 'pre-line', 'pre-wrap', 'break-spaces'] }
                            ],
                            break: [{ break: ['normal', 'words', 'all', 'keep'] }],
                            wrap: [{ wrap: ['break-word', 'anywhere', 'normal'] }],
                            hyphens: [{ hyphens: ['none', 'manual', 'auto'] }],
                            content: [{ content: ['none', F, E] }],
                            'bg-attachment': [{ bg: ['fixed', 'local', 'scroll'] }],
                            'bg-clip': [{ 'bg-clip': ['border', 'padding', 'content', 'text'] }],
                            'bg-origin': [{ 'bg-origin': ['border', 'padding', 'content'] }],
                            'bg-position': [{ bg: je() }],
                            'bg-repeat': [{ bg: Ce() }],
                            'bg-size': [{ bg: Fe() }],
                            'bg-image': [
                                {
                                    bg: [
                                        'none',
                                        {
                                            linear: [{ to: ['t', 'tr', 'r', 'br', 'b', 'bl', 'l', 'tl'] }, $e, F, E],
                                            radial: ['', F, E],
                                            conic: [$e, F, E]
                                        },
                                        cc,
                                        ic
                                    ]
                                }
                            ],
                            'bg-color': [{ bg: H() }],
                            'gradient-from-pos': [{ from: kt() }],
                            'gradient-via-pos': [{ via: kt() }],
                            'gradient-to-pos': [{ to: kt() }],
                            'gradient-from': [{ from: H() }],
                            'gradient-via': [{ via: H() }],
                            'gradient-to': [{ to: H() }],
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
                            'border-style': [{ border: [...Tt(), 'hidden', 'none'] }],
                            'divide-style': [{ divide: [...Tt(), 'hidden', 'none'] }],
                            'border-color': [{ border: H() }],
                            'border-color-x': [{ 'border-x': H() }],
                            'border-color-y': [{ 'border-y': H() }],
                            'border-color-s': [{ 'border-s': H() }],
                            'border-color-e': [{ 'border-e': H() }],
                            'border-color-t': [{ 'border-t': H() }],
                            'border-color-r': [{ 'border-r': H() }],
                            'border-color-b': [{ 'border-b': H() }],
                            'border-color-l': [{ 'border-l': H() }],
                            'divide-color': [{ divide: H() }],
                            'outline-style': [{ outline: [...Tt(), 'none', 'hidden'] }],
                            'outline-offset': [{ 'outline-offset': [V, F, E] }],
                            'outline-w': [{ outline: ['', V, ra, mt] }],
                            'outline-color': [{ outline: H() }],
                            shadow: [{ shadow: ['', 'none', d, Oa, Ba] }],
                            'shadow-color': [{ shadow: H() }],
                            'inset-shadow': [{ 'inset-shadow': ['none', f, Oa, Ba] }],
                            'inset-shadow-color': [{ 'inset-shadow': H() }],
                            'ring-w': [{ ring: pe() }],
                            'ring-w-inset': ['ring-inset'],
                            'ring-color': [{ ring: H() }],
                            'ring-offset-w': [{ 'ring-offset': [V, mt] }],
                            'ring-offset-color': [{ 'ring-offset': H() }],
                            'inset-ring-w': [{ 'inset-ring': pe() }],
                            'inset-ring-color': [{ 'inset-ring': H() }],
                            'text-shadow': [{ 'text-shadow': ['none', p, Oa, Ba] }],
                            'text-shadow-color': [{ 'text-shadow': H() }],
                            opacity: [{ opacity: [V, F, E] }],
                            'mix-blend': [{ 'mix-blend': [...Ie(), 'plus-darker', 'plus-lighter'] }],
                            'bg-blend': [{ 'bg-blend': Ie() }],
                            'mask-clip': [
                                { 'mask-clip': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] },
                                'mask-no-clip'
                            ],
                            'mask-composite': [{ mask: ['add', 'subtract', 'intersect', 'exclude'] }],
                            'mask-image-linear-pos': [{ 'mask-linear': [V] }],
                            'mask-image-linear-from-pos': [{ 'mask-linear-from': re() }],
                            'mask-image-linear-to-pos': [{ 'mask-linear-to': re() }],
                            'mask-image-linear-from-color': [{ 'mask-linear-from': H() }],
                            'mask-image-linear-to-color': [{ 'mask-linear-to': H() }],
                            'mask-image-t-from-pos': [{ 'mask-t-from': re() }],
                            'mask-image-t-to-pos': [{ 'mask-t-to': re() }],
                            'mask-image-t-from-color': [{ 'mask-t-from': H() }],
                            'mask-image-t-to-color': [{ 'mask-t-to': H() }],
                            'mask-image-r-from-pos': [{ 'mask-r-from': re() }],
                            'mask-image-r-to-pos': [{ 'mask-r-to': re() }],
                            'mask-image-r-from-color': [{ 'mask-r-from': H() }],
                            'mask-image-r-to-color': [{ 'mask-r-to': H() }],
                            'mask-image-b-from-pos': [{ 'mask-b-from': re() }],
                            'mask-image-b-to-pos': [{ 'mask-b-to': re() }],
                            'mask-image-b-from-color': [{ 'mask-b-from': H() }],
                            'mask-image-b-to-color': [{ 'mask-b-to': H() }],
                            'mask-image-l-from-pos': [{ 'mask-l-from': re() }],
                            'mask-image-l-to-pos': [{ 'mask-l-to': re() }],
                            'mask-image-l-from-color': [{ 'mask-l-from': H() }],
                            'mask-image-l-to-color': [{ 'mask-l-to': H() }],
                            'mask-image-x-from-pos': [{ 'mask-x-from': re() }],
                            'mask-image-x-to-pos': [{ 'mask-x-to': re() }],
                            'mask-image-x-from-color': [{ 'mask-x-from': H() }],
                            'mask-image-x-to-color': [{ 'mask-x-to': H() }],
                            'mask-image-y-from-pos': [{ 'mask-y-from': re() }],
                            'mask-image-y-to-pos': [{ 'mask-y-to': re() }],
                            'mask-image-y-from-color': [{ 'mask-y-from': H() }],
                            'mask-image-y-to-color': [{ 'mask-y-to': H() }],
                            'mask-image-radial': [{ 'mask-radial': [F, E] }],
                            'mask-image-radial-from-pos': [{ 'mask-radial-from': re() }],
                            'mask-image-radial-to-pos': [{ 'mask-radial-to': re() }],
                            'mask-image-radial-from-color': [{ 'mask-radial-from': H() }],
                            'mask-image-radial-to-color': [{ 'mask-radial-to': H() }],
                            'mask-image-radial-shape': [{ 'mask-radial': ['circle', 'ellipse'] }],
                            'mask-image-radial-size': [
                                { 'mask-radial': [{ closest: ['side', 'corner'], farthest: ['side', 'corner'] }] }
                            ],
                            'mask-image-radial-pos': [{ 'mask-radial-at': S() }],
                            'mask-image-conic-pos': [{ 'mask-conic': [V] }],
                            'mask-image-conic-from-pos': [{ 'mask-conic-from': re() }],
                            'mask-image-conic-to-pos': [{ 'mask-conic-to': re() }],
                            'mask-image-conic-from-color': [{ 'mask-conic-from': H() }],
                            'mask-image-conic-to-color': [{ 'mask-conic-to': H() }],
                            'mask-mode': [{ mask: ['alpha', 'luminance', 'match'] }],
                            'mask-origin': [
                                { 'mask-origin': ['border', 'padding', 'content', 'fill', 'stroke', 'view'] }
                            ],
                            'mask-position': [{ mask: je() }],
                            'mask-repeat': [{ mask: Ce() }],
                            'mask-size': [{ mask: Fe() }],
                            'mask-type': [{ 'mask-type': ['alpha', 'luminance'] }],
                            'mask-image': [{ mask: ['none', F, E] }],
                            filter: [{ filter: ['', 'none', F, E] }],
                            blur: [{ blur: Aa() }],
                            brightness: [{ brightness: [V, F, E] }],
                            contrast: [{ contrast: [V, F, E] }],
                            'drop-shadow': [{ 'drop-shadow': ['', 'none', g, Oa, Ba] }],
                            'drop-shadow-color': [{ 'drop-shadow': H() }],
                            grayscale: [{ grayscale: ['', V, F, E] }],
                            'hue-rotate': [{ 'hue-rotate': [V, F, E] }],
                            invert: [{ invert: ['', V, F, E] }],
                            saturate: [{ saturate: [V, F, E] }],
                            sepia: [{ sepia: ['', V, F, E] }],
                            'backdrop-filter': [{ 'backdrop-filter': ['', 'none', F, E] }],
                            'backdrop-blur': [{ 'backdrop-blur': Aa() }],
                            'backdrop-brightness': [{ 'backdrop-brightness': [V, F, E] }],
                            'backdrop-contrast': [{ 'backdrop-contrast': [V, F, E] }],
                            'backdrop-grayscale': [{ 'backdrop-grayscale': ['', V, F, E] }],
                            'backdrop-hue-rotate': [{ 'backdrop-hue-rotate': [V, F, E] }],
                            'backdrop-invert': [{ 'backdrop-invert': ['', V, F, E] }],
                            'backdrop-opacity': [{ 'backdrop-opacity': [V, F, E] }],
                            'backdrop-saturate': [{ 'backdrop-saturate': [V, F, E] }],
                            'backdrop-sepia': [{ 'backdrop-sepia': ['', V, F, E] }],
                            'border-collapse': [{ border: ['collapse', 'separate'] }],
                            'border-spacing': [{ 'border-spacing': w() }],
                            'border-spacing-x': [{ 'border-spacing-x': w() }],
                            'border-spacing-y': [{ 'border-spacing-y': w() }],
                            'table-layout': [{ table: ['auto', 'fixed'] }],
                            caption: [{ caption: ['top', 'bottom'] }],
                            transition: [
                                { transition: ['', 'all', 'colors', 'opacity', 'shadow', 'transform', 'none', F, E] }
                            ],
                            'transition-behavior': [{ transition: ['normal', 'discrete'] }],
                            duration: [{ duration: [V, 'initial', F, E] }],
                            ease: [{ ease: ['linear', 'initial', v, F, E] }],
                            delay: [{ delay: [V, F, E] }],
                            animate: [{ animate: ['none', C, F, E] }],
                            backface: [{ backface: ['hidden', 'visible'] }],
                            perspective: [{ perspective: [m, F, E] }],
                            'perspective-origin': [{ 'perspective-origin': y() }],
                            rotate: [{ rotate: At() }],
                            'rotate-x': [{ 'rotate-x': At() }],
                            'rotate-y': [{ 'rotate-y': At() }],
                            'rotate-z': [{ 'rotate-z': At() }],
                            scale: [{ scale: Da() }],
                            'scale-x': [{ 'scale-x': Da() }],
                            'scale-y': [{ 'scale-y': Da() }],
                            'scale-z': [{ 'scale-z': Da() }],
                            'scale-3d': ['scale-3d'],
                            skew: [{ skew: ko() }],
                            'skew-x': [{ 'skew-x': ko() }],
                            'skew-y': [{ 'skew-y': ko() }],
                            transform: [{ transform: [F, E, '', 'none', 'gpu', 'cpu'] }],
                            'transform-origin': [{ origin: y() }],
                            'transform-style': [{ transform: ['3d', 'flat'] }],
                            translate: [{ translate: Ma() }],
                            'translate-x': [{ 'translate-x': Ma() }],
                            'translate-y': [{ 'translate-y': Ma() }],
                            'translate-z': [{ 'translate-z': Ma() }],
                            'translate-none': ['translate-none'],
                            accent: [{ accent: H() }],
                            appearance: [{ appearance: ['none', 'auto'] }],
                            'caret-color': [{ caret: H() }],
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
                                        F,
                                        E
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
                            'will-change': [{ 'will-change': ['auto', 'scroll', 'contents', 'transform', F, E] }],
                            fill: [{ fill: ['none', ...H()] }],
                            'stroke-w': [{ stroke: [V, ra, mt, Cs] }],
                            stroke: [{ stroke: ['none', ...H()] }],
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
                (Ns = jd(mc)))
        })
    function O(...e) {
        return Ns(Fa(e))
    }
    var $ = L(() => {
        Eo()
        zs()
    })
    function n(e, t, a) {
        return Hs.createElement(e, a == null ? t : { ...t, key: a })
    }
    var Hs,
        Bt,
        I,
        R = L(() => {
            ;((Hs = globalThis.React), (Bt = Hs.Fragment))
            I = n
        })
    var gc,
        hc,
        xc,
        vc,
        Lc,
        Cc,
        Ic,
        bc,
        Sc,
        yc,
        wc,
        Pc,
        Rc,
        kc,
        Tc,
        Ac,
        Dc,
        Mc,
        qs = L(() => {
            U()
            R()
            gc = P(({ size: e = 24, ...t }, a) =>
                n('svg', {
                    ref: a,
                    xmlns: 'http://www.w3.org/2000/svg',
                    width: e,
                    height: e,
                    viewBox: '0 0 24 24',
                    fill: 'currentColor',
                    stroke: 'none',
                    'aria-hidden': 'true',
                    ...t,
                    children: n('path', {
                        d: 'M2 6c0-.796.316-1.558.879-2.121A3 3 0 0 1 5 3h4l.099.005c.229.023.444.124.608.288L12.414 6H19c.796 0 1.558.316 2.121.879.319.319.559.703.707 1.121H7.305c-.407 0-.805.125-1.14.356-.292.203-.525.48-.674.801l-.058.141-1.379 3.676a1 1 0 0 0 1.873.702l1.134-3.027A1 1 0 0 1 7.998 10H21l.217.012c.216.024.426.082.624.173.054.025.107.053.159.083.199.115.377.263.525.439.188.222.325.482.403.762.077.28.092.573.045.859l-.005.024-.995 5.21a3 3 0 0 1-1.036 1.749c-.47.389-1.046.624-1.65.677l-.261.012H5a3 3 0 0 1-3-3V6z'
                    })
                })
            )
            gc.displayName = 'TablerFolderOpenFilledIcon'
            hc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2' }),
                        n('path', { d: 'M17 16v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2' })
                    ]
                })
            )
            hc.displayName = 'TablerFoldersIcon'
            xc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M2 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H2' }),
                        n('path', { d: 'M17 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
                        n('path', { d: 'M9.5 15a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-3 0v-3A1.5 1.5 0 0 1 9.5 15' }),
                        n('path', { d: 'm19.5 15 3 6' }),
                        n('path', { d: 'm19.5 21 3-6' })
                    ]
                })
            )
            xc.displayName = 'TablerFileTypeDocxIcon'
            vc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12V5a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
                        n('path', { d: 'M17 18h2' }),
                        n('path', { d: 'M20 15h-3v6' }),
                        n('path', { d: 'M11 15v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-1' })
                    ]
                })
            )
            vc.displayName = 'TablerFileTypePdfIcon'
            Lc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M4 15l4 6' }),
                        n('path', { d: 'M4 21l4-6' }),
                        n('path', {
                            d: 'M17 20.25c0 .414.336.75.75.75H19a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
                        }),
                        n('path', { d: 'M11 15v6h3' })
                    ]
                })
            )
            Lc.displayName = 'TablerFileTypeXlsIcon'
            Cc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M7 16.5a1.5 1.5 0 0 0-3 0v3a1.5 1.5 0 0 0 3 0' }),
                        n('path', {
                            d: 'M10 20.25c0 .414.336.75.75.75H12a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-1a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
                        }),
                        n('path', { d: 'M16 15l2 6l2-6' })
                    ]
                })
            )
            Cc.displayName = 'TablerFileTypeCsvIcon'
            Ic = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M2 21v-6' }),
                        n('path', { d: 'M5 15v6' }),
                        n('path', { d: 'M2 18h3' }),
                        n('path', { d: 'M20 15v6h2' }),
                        n('path', { d: 'M13 21v-6l2 3l2-3v6' }),
                        n('path', { d: 'M7.5 15h3' }),
                        n('path', { d: 'M9 15v6' })
                    ]
                })
            )
            Ic.displayName = 'TablerFileTypeHtmlIcon'
            bc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
                        n('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
                        n('path', { d: 'M5 15h3v4.5a1.5 1.5 0 0 1-3 0' })
                    ]
                })
            )
            bc.displayName = 'TablerFileTypeJpgIcon'
            Sc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' }),
                        n('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
                        n('path', { d: 'M11 21v-6l3 6v-6' })
                    ]
                })
            )
            Sc.displayName = 'TablerFileTypePngIcon'
            yc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 18h1.5a1.5 1.5 0 0 0 0-3H5v6' }),
                        n('path', { d: 'M11 18h1.5a1.5 1.5 0 0 0 0-3H11v6' }),
                        n('path', { d: 'M16.5 15h3' }),
                        n('path', { d: 'M18 15v6' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' })
                    ]
                })
            )
            yc.displayName = 'TablerFileTypePptIcon'
            wc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', {
                            d: 'M4 20.25c0 .414.336.75.75.75H6a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1h1.25a.75.75 0 0 1 .75.75'
                        }),
                        n('path', { d: 'M10 15l2 6l2-6' }),
                        n('path', { d: 'M20 15h-1a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h1v-3' })
                    ]
                })
            )
            wc.displayName = 'TablerFileTypeSvgIcon'
            Pc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M16.5 15h3' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M4.5 15h3' }),
                        n('path', { d: 'M6 15v6' }),
                        n('path', { d: 'M18 15v6' }),
                        n('path', { d: 'M10 15l4 6' }),
                        n('path', { d: 'M10 21l4-6' })
                    ]
                })
            )
            Pc.displayName = 'TablerFileTypeTxtIcon'
            Rc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M5 12v-7a2 2 0 0 1 2-2h7l5 5v4' }),
                        n('path', { d: 'M16 18h1.5a1.5 1.5 0 0 0 0-3H16v6' }),
                        n('path', { d: 'M12 15v6' }),
                        n('path', { d: 'M5 15h3l-3 6h3' })
                    ]
                })
            )
            Rc.displayName = 'TablerFileTypeZipIcon'
            kc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
                        n('path', { d: 'M9 17h6' }),
                        n('path', { d: 'M9 13h6' })
                    ]
                })
            )
            kc.displayName = 'TablerFileDescriptionIcon'
            Tc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
                        n('path', { d: 'M10 13l-1 2l1 2' }),
                        n('path', { d: 'M14 13l1 2l-1 2' })
                    ]
                })
            )
            Tc.displayName = 'TablerFileCodeIcon'
            Ac = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' }),
                        n('path', { d: 'M10 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0' }),
                        n('path', { d: 'M12 16v-5l2 1' })
                    ]
                })
            )
            Ac.displayName = 'TablerFileMusicIcon'
            Dc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M14 3v4a1 1 0 0 0 1 1h4' }),
                        n('path', { d: 'M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2' })
                    ]
                })
            )
            Dc.displayName = 'TablerFileIcon'
            Mc = P(({ size: e = 24, strokeWidth: t = 2, ...a }, o) =>
                I('svg', {
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
                        n('path', { d: 'M15 10l4.553-2.276a1 1 0 0 1 1.447.894v6.764a1 1 0 0 1-1.447.894L15 14v-4' }),
                        n('path', { d: 'M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8' })
                    ]
                })
            )
            Mc.displayName = 'TablerVideoIcon'
        })
    var Us,
        _s,
        Ye,
        sa = L(() => {
            Eo()
            ;((Us = (e) => (typeof e == 'boolean' ? `${e}` : e === 0 ? '0' : e)),
                (_s = Fa),
                (Ye = (e, t) => (a) => {
                    var o
                    if (t?.variants == null) return _s(e, a?.class, a?.className)
                    let { variants: r, defaultVariants: s } = t,
                        i = Object.keys(r).map((c) => {
                            let d = a?.[c],
                                f = s?.[c]
                            if (d === null) return null
                            let p = Us(d) || Us(f)
                            return r[c][p]
                        }),
                        l =
                            a &&
                            Object.entries(a).reduce((c, d) => {
                                let [f, p] = d
                                return (p === void 0 || (c[f] = p), c)
                            }, {}),
                        u =
                            t == null || (o = t.compoundVariants) === null || o === void 0
                                ? void 0
                                : o.reduce((c, d) => {
                                      let { class: f, className: p, ...g } = d
                                      return Object.entries(g).every((x) => {
                                          let [m, h] = x
                                          return Array.isArray(h)
                                              ? h.includes({ ...s, ...l }[m])
                                              : { ...s, ...l }[m] === h
                                      })
                                          ? [...c, f, p]
                                          : c
                                  }, [])
                    return _s(e, i, u, a?.class, a?.className)
                }))
        })
    var Vs,
        Gs,
        Ws,
        Na = L(() => {
            ;((Vs = globalThis.ReactDOM), (Gs = Vs.createPortal), (Ws = Vs.flushSync))
        })
    function js(e, t) {
        if (typeof e == 'function') return e(t)
        e != null && (e.current = t)
    }
    function Ec(...e) {
        return (t) => {
            let a = !1,
                o = e.map((r) => {
                    let s = js(r, t)
                    return (!a && typeof s == 'function' && (a = !0), s)
                })
            if (a)
                return () => {
                    for (let r = 0; r < o.length; r++) {
                        let s = o[r]
                        typeof s == 'function' ? s() : js(e[r], null)
                    }
                }
        }
    }
    function ae(...e) {
        return W(Ec(...e), e)
    }
    var Ne = L(() => {
        U()
    })
    var Ot = {}
    Ke(Ot, { Root: () => Fc, Slot: () => Fc, Slottable: () => Bc, createSlot: () => ze, createSlottable: () => Zs })
    function ze(e) {
        let t = P((a, o) => {
            let { children: r, ...s } = a,
                i = null,
                l = !1,
                u = []
            ;(Ks(r) && typeof za == 'function' && (r = za(r._payload)),
                ke.forEach(r, (p) => {
                    if (Hc(p)) {
                        l = !0
                        let g = p,
                            x = 'child' in g.props ? g.props.child : g.props.children
                        ;(Ks(x) && typeof za == 'function' && (x = za(x._payload)),
                            (i = Oc(g, x)),
                            u.push(i?.props?.children))
                    } else u.push(p)
                }),
                i ? (i = Be(i, void 0, u)) : !l && ke.count(r) === 1 && Mt(r) && (i = r))
            let c = i ? zc(i) : void 0,
                d = ae(o, c)
            if (!i) {
                if (r || r === 0) throw new Error(l ? Vc(e) : _c(e))
                return r
            }
            let f = Nc(s, i.props ?? {})
            return (i.type !== Te && (f.ref = o ? d : c), Be(i, f))
        })
        return ((t.displayName = `${e}.Slot`), t)
    }
    function Zs(e) {
        let t = (a) => ('child' in a ? a.children(a.child) : a.children)
        return ((t.displayName = `${e}.Slottable`), (t.__radixId = $s), t)
    }
    function Nc(e, t) {
        let a = { ...t }
        for (let o in t) {
            let r = e[o],
                s = t[o]
            ;/^on[A-Z]/.test(o)
                ? r && s
                    ? (a[o] = (...l) => {
                          let u = s(...l)
                          return (r(...l), u)
                      })
                    : r && (a[o] = r)
                : o === 'style'
                  ? (a[o] = { ...r, ...s })
                  : o === 'className' && (a[o] = [r, s].filter(Boolean).join(' '))
        }
        return { ...e, ...a }
    }
    function zc(e) {
        let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
            a = t && 'isReactWarning' in t && t.isReactWarning
        return a
            ? e.ref
            : ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
              (a = t && 'isReactWarning' in t && t.isReactWarning),
              a ? e.props.ref : e.props.ref || e.ref)
    }
    function Hc(e) {
        return Mt(e) && typeof e.type == 'function' && '__radixId' in e.type && e.type.__radixId === $s
    }
    function Ks(e) {
        return (
            e != null &&
            typeof e == 'object' &&
            '$$typeof' in e &&
            e.$$typeof === qc &&
            '_payload' in e &&
            Uc(e._payload)
        )
    }
    function Uc(e) {
        return typeof e == 'object' && e !== null && 'then' in e
    }
    var Fc,
        $s,
        Bc,
        Oc,
        qc,
        _c,
        Vc,
        za,
        na = L(() => {
            U()
            Ne()
            ;((Fc = ze('Slot')), ($s = Symbol.for('radix.slottable')))
            ;((Bc = Zs('Slottable')),
                (Oc = (e, t) => {
                    if ('child' in e.props) {
                        let a = e.props.child
                        return Mt(a) ? Be(a, void 0, e.props.children(a.props.children)) : null
                    }
                    return Mt(t) ? t : null
                }))
            qc = Symbol.for('react.lazy')
            ;((_c = (e) =>
                `${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`),
                (Vc = (e) =>
                    `${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`),
                (za = _[' use '.trim().toString()]))
        })
    function Ys(e, t) {
        e && Ws(() => e.dispatchEvent(t))
    }
    var Gc,
        K,
        Ae = L(() => {
            U()
            Na()
            na()
            R()
            ;((Gc = [
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
                (K = Gc.reduce((e, t) => {
                    let a = ze(`Primitive.${t}`),
                        o = P((r, s) => {
                            let { asChild: i, ...l } = r,
                                u = i ? a : t
                            return (
                                typeof window < 'u' && (window[Symbol.for('radix-ui')] = !0),
                                n(u, { ...l, ref: s })
                            )
                        })
                    return ((o.displayName = `Primitive.${t}`), { ...e, [t]: o })
                }, {})))
        })
    function xe(e, t = []) {
        let a = []
        function o(s, i) {
            let l = de(i)
            l.displayName = s + 'Context'
            let u = a.length
            a = [...a, i]
            let c = (f) => {
                let { scope: p, children: g, ...x } = f,
                    m = p?.[e]?.[u] || l,
                    h = he(() => x, Object.values(x))
                return n(m.Provider, { value: h, children: g })
            }
            c.displayName = s + 'Provider'
            function d(f, p) {
                let g = p?.[e]?.[u] || l,
                    x = me(g)
                if (x) return x
                if (i !== void 0) return i
                throw new Error(`\`${f}\` must be used within \`${s}\``)
            }
            return [c, d]
        }
        let r = () => {
            let s = a.map((i) => de(i))
            return function (l) {
                let u = l?.[e] || s
                return he(() => ({ [`__scope${e}`]: { ...l, [e]: u } }), [l, u])
            }
        }
        return ((r.scopeName = e), [o, Wc(r, ...t)])
    }
    function Wc(...e) {
        let t = e[0]
        if (e.length === 1) return t
        let a = () => {
            let o = e.map((r) => ({ useScope: r(), scopeName: r.scopeName }))
            return function (s) {
                let i = o.reduce((l, { useScope: u, scopeName: c }) => {
                    let f = u(s)[`__scope${c}`]
                    return { ...l, ...f }
                }, {})
                return he(() => ({ [`__scope${t.scopeName}`]: i }), [i])
            }
        }
        return ((a.scopeName = t.scopeName), a)
    }
    var Je = L(() => {
        U()
        R()
    })
    function Js(e) {
        let t = e + 'CollectionProvider',
            [a, o] = xe(t),
            [r, s] = a(t, { collectionRef: { current: null }, itemMap: new Map() }),
            i = (m) => {
                let { scope: h, children: v } = m,
                    C = k(null),
                    b = k(new Map()).current
                return n(r, { scope: h, itemMap: b, collectionRef: C, children: v })
            }
        i.displayName = t
        let l = e + 'CollectionSlot',
            u = ze(l),
            c = P((m, h) => {
                let { scope: v, children: C } = m,
                    b = s(l, v),
                    S = ae(h, b.collectionRef)
                return n(u, { ref: S, children: C })
            })
        c.displayName = l
        let d = e + 'CollectionItemSlot',
            f = 'data-radix-collection-item',
            p = ze(d),
            g = P((m, h) => {
                let { scope: v, children: C, ...b } = m,
                    S = k(null),
                    y = ae(h, S),
                    A = s(d, v)
                return (
                    M(
                        () => (
                            A.itemMap.set(S, { ref: S, ...b }),
                            () => {
                                A.itemMap.delete(S)
                            }
                        )
                    ),
                    n(p, { [f]: '', ref: y, children: C })
                )
            })
        g.displayName = d
        function x(m) {
            let h = s(e + 'CollectionConsumer', m)
            return W(() => {
                let C = h.collectionRef.current
                if (!C) return []
                let b = Array.from(C.querySelectorAll(`[${f}]`))
                return Array.from(h.itemMap.values()).sort(
                    (A, B) => b.indexOf(A.ref.current) - b.indexOf(B.ref.current)
                )
            }, [h.collectionRef, h.itemMap])
        }
        return [{ Provider: i, Slot: c, ItemSlot: g }, x, o]
    }
    var Qs = L(() => {
        'use client'
        U()
        Je()
        Ne()
        na()
        R()
        U()
        R()
    })
    function Z(e, t, { checkForDefaultPrevented: a = !0 } = {}) {
        return function (r) {
            if ((e?.(r), a === !1 || !r.defaultPrevented)) return t?.(r)
        }
    }
    var rh,
        ht = L(() => {
            rh = !!(typeof window < 'u' && window.document && window.document.createElement)
        })
    var Pe,
        Nt = L(() => {
            U()
            Pe = globalThis?.document ? pt : () => {}
        })
    function zt({ prop: e, defaultProp: t, onChange: a = () => {}, caller: o }) {
        let [r, s, i] = jc({ defaultProp: t, onChange: a }),
            l = e !== void 0,
            u = l ? e : r
        {
            let d = k(e !== void 0)
            M(() => {
                let f = d.current
                ;(f !== l &&
                    console.warn(
                        `${o} is changing from ${f ? 'controlled' : 'uncontrolled'} to ${l ? 'controlled' : 'uncontrolled'}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`
                    ),
                    (d.current = l))
            }, [l, o])
        }
        let c = W(
            (d) => {
                if (l) {
                    let f = Kc(d) ? d(e) : d
                    f !== e && i.current?.(f)
                } else s(d)
            },
            [l, e, s, i]
        )
        return [u, c]
    }
    function jc({ defaultProp: e, onChange: t }) {
        let [a, o] = N(e),
            r = k(a),
            s = k(t)
        return (
            Xc(() => {
                s.current = t
            }, [t]),
            M(() => {
                r.current !== a && (s.current?.(a), (r.current = a))
            }, [a, r]),
            [a, o, s]
        )
    }
    function Kc(e) {
        return typeof e == 'function'
    }
    var Xc,
        Ha = L(() => {
            U()
            Nt()
            U()
            Xc = _[' useInsertionEffect '.trim().toString()] || Pe
        })
    function $c(e, t) {
        return Et((a, o) => t[a][o] ?? a, e)
    }
    function Zc(e) {
        let [t, a] = N(),
            o = k(null),
            r = k(e),
            s = k('none'),
            i = e ? 'mounted' : 'unmounted',
            [l, u] = $c(i, {
                mounted: { UNMOUNT: 'unmounted', ANIMATION_OUT: 'unmountSuspended' },
                unmountSuspended: { MOUNT: 'mounted', ANIMATION_END: 'unmounted' },
                unmounted: { MOUNT: 'mounted' }
            })
        return (
            M(() => {
                let c = qa(o.current)
                s.current = l === 'mounted' ? c : 'none'
            }, [l]),
            Pe(() => {
                let c = o.current,
                    d = r.current
                if (d !== e) {
                    let p = s.current,
                        g = qa(c)
                    ;(e
                        ? u('MOUNT')
                        : g === 'none' || c?.display === 'none'
                          ? u('UNMOUNT')
                          : u(d && p !== g ? 'ANIMATION_OUT' : 'UNMOUNT'),
                        (r.current = e))
                }
            }, [e, u]),
            Pe(() => {
                if (t) {
                    let c,
                        d = t.ownerDocument.defaultView ?? window,
                        f = (g) => {
                            let m = qa(o.current).includes(CSS.escape(g.animationName))
                            if (g.target === t && m && (u('ANIMATION_END'), !r.current)) {
                                let h = t.style.animationFillMode
                                ;((t.style.animationFillMode = 'forwards'),
                                    (c = d.setTimeout(() => {
                                        t.style.animationFillMode === 'forwards' && (t.style.animationFillMode = h)
                                    })))
                            }
                        },
                        p = (g) => {
                            g.target === t && (s.current = qa(o.current))
                        }
                    return (
                        t.addEventListener('animationstart', p),
                        t.addEventListener('animationcancel', f),
                        t.addEventListener('animationend', f),
                        () => {
                            ;(d.clearTimeout(c),
                                t.removeEventListener('animationstart', p),
                                t.removeEventListener('animationcancel', f),
                                t.removeEventListener('animationend', f))
                        }
                    )
                } else u('ANIMATION_END')
            }, [t, u]),
            {
                isPresent: ['mounted', 'unmountSuspended'].includes(l),
                ref: W((c) => {
                    ;((o.current = c ? getComputedStyle(c) : null), a(c))
                }, [])
            }
        )
    }
    function en(e, t) {
        if (typeof e == 'function') return e(t)
        e != null && (e.current = t)
    }
    function Yc(...e) {
        let t = k(e)
        return (
            (t.current = e),
            W((a) => {
                let o = t.current,
                    r = !1,
                    s = o.map((i) => {
                        let l = en(i, a)
                        return (!r && typeof l == 'function' && (r = !0), l)
                    })
                if (r)
                    return () => {
                        for (let i = 0; i < s.length; i++) {
                            let l = s[i]
                            typeof l == 'function' ? l() : en(o[i], null)
                        }
                    }
            }, [])
        )
    }
    function qa(e) {
        return e?.animationName || 'none'
    }
    function Jc(e) {
        let t = Object.getOwnPropertyDescriptor(e.props, 'ref')?.get,
            a = t && 'isReactWarning' in t && t.isReactWarning
        return a
            ? e.ref
            : ((t = Object.getOwnPropertyDescriptor(e, 'ref')?.get),
              (a = t && 'isReactWarning' in t && t.isReactWarning),
              a ? e.props.ref : e.props.ref || e.ref)
    }
    var be,
        Ua = L(() => {
            'use client'
            U()
            Nt()
            U()
            be = (e) => {
                let { present: t, children: a } = e,
                    o = Zc(t),
                    r = typeof a == 'function' ? a({ present: o.isPresent }) : ke.only(a),
                    s = Yc(o.ref, Jc(r))
                return typeof a == 'function' || o.isPresent ? Be(r, { ref: s }) : null
            }
            be.displayName = 'Presence'
        })
    function Qe(e) {
        let [t, a] = N(Qc())
        return (
            Pe(() => {
                e || a((o) => o ?? String(ef++))
            }, [e]),
            e || (t ? `radix-${t}` : '')
        )
    }
    var Qc,
        ef,
        _a = L(() => {
            U()
            Nt()
            ;((Qc = _[' useId '.trim().toString()] || (() => {})), (ef = 0))
        })
    function Ht(e) {
        let t = me(tf)
        return e || t || 'ltr'
    }
    var tf,
        Va = L(() => {
            'use client'
            U()
            R()
            tf = de(void 0)
        })
    function le(e) {
        let t = k(e)
        return (
            M(() => {
                t.current = e
            }),
            he(
                () =>
                    (...a) =>
                        t.current?.(...a),
                []
            )
        )
    }
    var qt = L(() => {
        U()
    })
    function tn(e, t = globalThis?.document) {
        let a = le(e)
        M(() => {
            let o = (r) => {
                r.key === 'Escape' && a(r)
            }
            return (
                t.addEventListener('keydown', o, { capture: !0 }),
                () => t.removeEventListener('keydown', o, { capture: !0 })
            )
        }, [a, t])
    }
    var an = L(() => {
        U()
        qt()
    })
    function sn() {
        let e = me(zo),
            [t, a] = N(null)
        return (
            M(() => {
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
    function lf(e, t) {
        let {
                ownerDocument: a = globalThis?.document,
                deferPointerDownOutside: o = !1,
                isDeferredPointerDownOutsideRef: r,
                dismissableSurfaces: s
            } = t,
            i = le(e),
            l = k(!1),
            u = k(!1),
            c = k(new Map()),
            d = k(() => {})
        return (
            M(() => {
                function f() {
                    ;((u.current = !1), (r.current = !1), c.current.clear())
                }
                function p() {
                    return Array.from(c.current.values()).some(Boolean)
                }
                function g(C) {
                    if (!u.current) return
                    let b = C.target
                    ;((b instanceof Node && [...s].some((y) => y.contains(b))) || c.current.set(C.type, !0),
                        C.type === 'click' &&
                            window.setTimeout(() => {
                                u.current && d.current()
                            }, 0))
                }
                function x(C) {
                    u.current && c.current.set(C.type, !1)
                }
                let m = (C) => {
                        if (C.target && !l.current) {
                            let S = function () {
                                a.removeEventListener('click', d.current)
                                let A = p()
                                ;(f(), A || nn(of, i, y, { discrete: !0 }))
                            }
                            var b = S
                            let y = { originalEvent: C }
                            ;((u.current = !0),
                                (r.current = o && C.button === 0),
                                c.current.clear(),
                                !o || C.button !== 0
                                    ? S()
                                    : (a.removeEventListener('click', d.current),
                                      (d.current = S),
                                      a.addEventListener('click', d.current, { once: !0 })))
                        } else (a.removeEventListener('click', d.current), f())
                        l.current = !1
                    },
                    h = ['pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click']
                for (let C of h) (a.addEventListener(C, g, !0), a.addEventListener(C, x))
                let v = window.setTimeout(() => {
                    a.addEventListener('pointerdown', m)
                }, 0)
                return () => {
                    ;(window.clearTimeout(v),
                        a.removeEventListener('pointerdown', m),
                        a.removeEventListener('click', d.current))
                    for (let C of h) (a.removeEventListener(C, g, !0), a.removeEventListener(C, x))
                }
            }, [a, i, o, r, s]),
            { onPointerDownCapture: () => (l.current = !0) }
        )
    }
    function uf(e, t = globalThis?.document) {
        let a = le(e),
            o = k(!1)
        return (
            M(() => {
                let r = (s) => {
                    s.target && !o.current && nn(rf, a, { originalEvent: s }, { discrete: !1 })
                }
                return (t.addEventListener('focusin', r), () => t.removeEventListener('focusin', r))
            }, [t, a]),
            { onFocusCapture: () => (o.current = !0), onBlurCapture: () => (o.current = !1) }
        )
    }
    function rn() {
        let e = new CustomEvent(No)
        document.dispatchEvent(e)
    }
    function nn(e, t, a, { discrete: o }) {
        let r = a.originalEvent.target,
            s = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: a })
        ;(t && r.addEventListener(e, t, { once: !0 }), o ? Ys(r, s) : r.dispatchEvent(s))
    }
    var af,
        No,
        of,
        rf,
        on,
        zo,
        Ho,
        sf,
        nf,
        ln = L(() => {
            'use client'
            U()
            ht()
            Ae()
            Ne()
            qt()
            an()
            R()
            ;((af = 'DismissableLayer'),
                (No = 'dismissableLayer.update'),
                (of = 'dismissableLayer.pointerDownOutside'),
                (rf = 'dismissableLayer.focusOutside'),
                (zo = de({
                    layers: new Set(),
                    layersWithOutsidePointerEventsDisabled: new Set(),
                    branches: new Set(),
                    dismissableSurfaces: new Set()
                })),
                (Ho = P((e, t) => {
                    let {
                            disableOutsidePointerEvents: a = !1,
                            deferPointerDownOutside: o = !1,
                            onEscapeKeyDown: r,
                            onPointerDownOutside: s,
                            onFocusOutside: i,
                            onInteractOutside: l,
                            onDismiss: u,
                            ...c
                        } = e,
                        d = me(zo),
                        [f, p] = N(null),
                        g = f?.ownerDocument ?? globalThis?.document,
                        [, x] = N({}),
                        m = ae(t, (D) => p(D)),
                        h = Array.from(d.layers),
                        [v] = [...d.layersWithOutsidePointerEventsDisabled].slice(-1),
                        C = h.indexOf(v),
                        b = f ? h.indexOf(f) : -1,
                        S = d.layersWithOutsidePointerEventsDisabled.size > 0,
                        y = b >= C,
                        A = k(!1),
                        B = lf(
                            (D) => {
                                let G = D.target
                                if (!(G instanceof Node)) return
                                let z = [...d.branches].some((q) => q.contains(G))
                                !y || z || (s?.(D), l?.(D), D.defaultPrevented || u?.())
                            },
                            {
                                ownerDocument: g,
                                deferPointerDownOutside: o,
                                isDeferredPointerDownOutsideRef: A,
                                dismissableSurfaces: d.dismissableSurfaces
                            }
                        ),
                        w = uf((D) => {
                            if (o && A.current) return
                            let G = D.target
                            ;[...d.branches].some((q) => q.contains(G)) || (i?.(D), l?.(D), D.defaultPrevented || u?.())
                        }, g)
                    return (
                        tn((D) => {
                            b === d.layers.size - 1 && (r?.(D), !D.defaultPrevented && u && (D.preventDefault(), u()))
                        }, g),
                        M(() => {
                            if (f)
                                return (
                                    a &&
                                        (d.layersWithOutsidePointerEventsDisabled.size === 0 &&
                                            ((on = g.body.style.pointerEvents), (g.body.style.pointerEvents = 'none')),
                                        d.layersWithOutsidePointerEventsDisabled.add(f)),
                                    d.layers.add(f),
                                    rn(),
                                    () => {
                                        a &&
                                            (d.layersWithOutsidePointerEventsDisabled.delete(f),
                                            d.layersWithOutsidePointerEventsDisabled.size === 0 &&
                                                (g.body.style.pointerEvents = on))
                                    }
                                )
                        }, [f, g, a, d]),
                        M(
                            () => () => {
                                f && (d.layers.delete(f), d.layersWithOutsidePointerEventsDisabled.delete(f), rn())
                            },
                            [f, d]
                        ),
                        M(() => {
                            let D = () => x({})
                            return (document.addEventListener(No, D), () => document.removeEventListener(No, D))
                        }, []),
                        n(K.div, {
                            ...c,
                            ref: m,
                            style: { pointerEvents: S ? (y ? 'auto' : 'none') : void 0, ...e.style },
                            onFocusCapture: Z(e.onFocusCapture, w.onFocusCapture),
                            onBlurCapture: Z(e.onBlurCapture, w.onBlurCapture),
                            onPointerDownCapture: Z(e.onPointerDownCapture, B.onPointerDownCapture)
                        })
                    )
                })))
            Ho.displayName = af
            ;((sf = 'DismissableLayerBranch'),
                (nf = P((e, t) => {
                    let a = me(zo),
                        o = k(null),
                        r = ae(t, o)
                    return (
                        M(() => {
                            let s = o.current
                            if (s)
                                return (
                                    a.branches.add(s),
                                    () => {
                                        a.branches.delete(s)
                                    }
                                )
                        }, [a.branches]),
                        n(K.div, { ...e, ref: r })
                    )
                })))
            nf.displayName = sf
        })
    function cf(e, { select: t = !1 } = {}) {
        let a = document.activeElement
        for (let o of e) if ((et(o, { select: t }), document.activeElement !== a)) return
    }
    function ff(e) {
        let t = pn(e),
            a = dn(t, e),
            o = dn(t.reverse(), e)
        return [a, o]
    }
    function pn(e) {
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
    function dn(e, t) {
        for (let a of e) if (!pf(a, { upTo: t })) return a
    }
    function pf(e, { upTo: t }) {
        if (getComputedStyle(e).visibility === 'hidden') return !0
        for (; e; ) {
            if (t !== void 0 && e === t) return !1
            if (getComputedStyle(e).display === 'none') return !0
            e = e.parentElement
        }
        return !1
    }
    function mf(e) {
        return e instanceof HTMLInputElement && 'select' in e
    }
    function et(e, { select: t = !1 } = {}) {
        if (e && e.focus) {
            let a = document.activeElement
            ;(e.focus({ preventScroll: !0 }), e !== a && mf(e) && t && e.select())
        }
    }
    function gf() {
        let e = []
        return {
            add(t) {
                let a = e[0]
                ;(t !== a && a?.pause(), (e = fn(e, t)), e.unshift(t))
            },
            remove(t) {
                ;((e = fn(e, t)), e[0]?.resume())
            }
        }
    }
    function fn(e, t) {
        let a = [...e],
            o = a.indexOf(t)
        return (o !== -1 && a.splice(o, 1), a)
    }
    function hf(e) {
        return e.filter((t) => t.tagName !== 'A')
    }
    var qo,
        Uo,
        un,
        df,
        _o,
        cn,
        mn = L(() => {
            'use client'
            U()
            Ne()
            Ae()
            qt()
            R()
            ;((qo = 'focusScope.autoFocusOnMount'),
                (Uo = 'focusScope.autoFocusOnUnmount'),
                (un = { bubbles: !1, cancelable: !0 }),
                (df = 'FocusScope'),
                (_o = P((e, t) => {
                    let { loop: a = !1, trapped: o = !1, onMountAutoFocus: r, onUnmountAutoFocus: s, ...i } = e,
                        [l, u] = N(null),
                        c = le(r),
                        d = le(s),
                        f = k(null),
                        p = ae(t, (m) => u(m)),
                        g = k({
                            paused: !1,
                            pause() {
                                this.paused = !0
                            },
                            resume() {
                                this.paused = !1
                            }
                        }).current
                    ;(M(() => {
                        if (o) {
                            let C = function (A) {
                                    if (g.paused || !l) return
                                    let B = A.target
                                    l.contains(B) ? (f.current = B) : et(f.current, { select: !0 })
                                },
                                b = function (A) {
                                    if (g.paused || !l) return
                                    let B = A.relatedTarget
                                    B !== null && (l.contains(B) || et(f.current, { select: !0 }))
                                },
                                S = function (A) {
                                    if (document.activeElement === document.body)
                                        for (let w of A) w.removedNodes.length > 0 && et(l)
                                }
                            var m = C,
                                h = b,
                                v = S
                            ;(document.addEventListener('focusin', C), document.addEventListener('focusout', b))
                            let y = new MutationObserver(S)
                            return (
                                l && y.observe(l, { childList: !0, subtree: !0 }),
                                () => {
                                    ;(document.removeEventListener('focusin', C),
                                        document.removeEventListener('focusout', b),
                                        y.disconnect())
                                }
                            )
                        }
                    }, [o, l, g.paused]),
                        M(() => {
                            if (l) {
                                cn.add(g)
                                let m = document.activeElement
                                if (!l.contains(m)) {
                                    let v = new CustomEvent(qo, un)
                                    ;(l.addEventListener(qo, c),
                                        l.dispatchEvent(v),
                                        v.defaultPrevented ||
                                            (cf(hf(pn(l)), { select: !0 }), document.activeElement === m && et(l)))
                                }
                                return () => {
                                    ;(l.removeEventListener(qo, c),
                                        setTimeout(() => {
                                            let v = new CustomEvent(Uo, un)
                                            ;(l.addEventListener(Uo, d),
                                                l.dispatchEvent(v),
                                                v.defaultPrevented || et(m ?? document.body, { select: !0 }),
                                                l.removeEventListener(Uo, d),
                                                cn.remove(g))
                                        }, 0))
                                }
                            }
                        }, [l, c, d, g]))
                    let x = W(
                        (m) => {
                            if ((!a && !o) || g.paused) return
                            let h = m.key === 'Tab' && !m.altKey && !m.ctrlKey && !m.metaKey,
                                v = document.activeElement
                            if (h && v) {
                                let C = m.currentTarget,
                                    [b, S] = ff(C)
                                b && S
                                    ? !m.shiftKey && v === S
                                        ? (m.preventDefault(), a && et(b, { select: !0 }))
                                        : m.shiftKey && v === b && (m.preventDefault(), a && et(S, { select: !0 }))
                                    : v === C && m.preventDefault()
                            }
                        },
                        [a, o, g.paused]
                    )
                    return n(K.div, { tabIndex: -1, ...i, ref: p, onKeyDown: x })
                })))
            _o.displayName = df
            cn = gf()
        })
    var xf,
        Vo,
        gn = L(() => {
            'use client'
            U()
            Na()
            Ae()
            Nt()
            R()
            ;((xf = 'Portal'),
                (Vo = P((e, t) => {
                    let { container: a, ...o } = e,
                        [r, s] = N(!1)
                    Pe(() => s(!0), [])
                    let i = a || (r && globalThis?.document?.body)
                    return i ? Gs(n(K.div, { ...o, ref: t }), i) : null
                })))
            Vo.displayName = xf
        })
    function xn() {
        M(() => {
            Ut || (Ut = { start: hn(), end: hn() })
            let { start: e, end: t } = Ut
            return (
                document.body.firstElementChild !== e && document.body.insertAdjacentElement('afterbegin', e),
                document.body.lastElementChild !== t && document.body.insertAdjacentElement('beforeend', t),
                Ga++,
                () => {
                    ;(Ga === 1 && (Ut?.start.remove(), Ut?.end.remove(), (Ut = null)), (Ga = Math.max(0, Ga - 1)))
                }
            )
        }, [])
    }
    function hn() {
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
    var Ga,
        Ut,
        vn = L(() => {
            'use client'
            U()
            ;((Ga = 0), (Ut = null))
        })
    function Wa(e, t) {
        var a = {}
        for (var o in e) Object.prototype.hasOwnProperty.call(e, o) && t.indexOf(o) < 0 && (a[o] = e[o])
        if (e != null && typeof Object.getOwnPropertySymbols == 'function')
            for (var r = 0, o = Object.getOwnPropertySymbols(e); r < o.length; r++)
                t.indexOf(o[r]) < 0 && Object.prototype.propertyIsEnumerable.call(e, o[r]) && (a[o[r]] = e[o[r]])
        return a
    }
    function Ln(e, t, a) {
        if (a || arguments.length === 2)
            for (var o = 0, r = t.length, s; o < r; o++)
                (s || !(o in t)) && (s || (s = Array.prototype.slice.call(t, 0, o)), (s[o] = t[o]))
        return e.concat(s || Array.prototype.slice.call(t))
    }
    var ve,
        _t = L(() => {
            ve = function () {
                return (
                    (ve =
                        Object.assign ||
                        function (t) {
                            for (var a, o = 1, r = arguments.length; o < r; o++) {
                                a = arguments[o]
                                for (var s in a) Object.prototype.hasOwnProperty.call(a, s) && (t[s] = a[s])
                            }
                            return t
                        }),
                    ve.apply(this, arguments)
                )
            }
        })
    var xt,
        vt,
        Go,
        Wo,
        Xa = L(() => {
            ;((xt = 'right-scroll-bar-position'),
                (vt = 'width-before-scroll-bar'),
                (Go = 'with-scroll-bars-hidden'),
                (Wo = '--removed-body-scroll-bar-size'))
        })
    function ja(e, t) {
        return (typeof e == 'function' ? e(t) : e && (e.current = t), e)
    }
    var Cn = L(() => {})
    function In(e, t) {
        var a = N(function () {
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
    var bn = L(() => {
        U()
    })
    function Xo(e, t) {
        var a = In(t || null, function (o) {
            return e.forEach(function (r) {
                return ja(r, o)
            })
        })
        return (
            vf(
                function () {
                    var o = Sn.get(a)
                    if (o) {
                        var r = new Set(o),
                            s = new Set(e),
                            i = a.current
                        ;(r.forEach(function (l) {
                            s.has(l) || ja(l, null)
                        }),
                            s.forEach(function (l) {
                                r.has(l) || ja(l, i)
                            }))
                    }
                    Sn.set(a, e)
                },
                [e]
            ),
            a
        )
    }
    var vf,
        Sn,
        yn = L(() => {
            U()
            Cn()
            bn()
            ;((vf = typeof window < 'u' ? pt : M), (Sn = new WeakMap()))
        })
    var wn = L(() => {
        yn()
    })
    function Lf(e) {
        return e
    }
    function Cf(e, t) {
        t === void 0 && (t = Lf)
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
                useMedium: function (s) {
                    var i = t(s, o)
                    return (
                        a.push(i),
                        function () {
                            a = a.filter(function (l) {
                                return l !== i
                            })
                        }
                    )
                },
                assignSyncMedium: function (s) {
                    for (o = !0; a.length; ) {
                        var i = a
                        ;((a = []), i.forEach(s))
                    }
                    a = {
                        push: function (l) {
                            return s(l)
                        },
                        filter: function () {
                            return a
                        }
                    }
                },
                assignMedium: function (s) {
                    o = !0
                    var i = []
                    if (a.length) {
                        var l = a
                        ;((a = []), l.forEach(s), (i = a))
                    }
                    var u = function () {
                            var d = i
                            ;((i = []), d.forEach(s))
                        },
                        c = function () {
                            return Promise.resolve().then(u)
                        }
                    ;(c(),
                        (a = {
                            push: function (d) {
                                ;(i.push(d), c())
                            },
                            filter: function (d) {
                                return ((i = i.filter(d)), a)
                            }
                        }))
                }
            }
        return r
    }
    function jo(e) {
        e === void 0 && (e = {})
        var t = Cf(null)
        return ((t.options = ve({ async: !0, ssr: !1 }, e)), t)
    }
    var Pn = L(() => {
        _t()
    })
    function Ko(e, t) {
        return (e.useMedium(t), Rn)
    }
    var Rn,
        kn = L(() => {
            _t()
            U()
            Rn = function (e) {
                var t = e.sideCar,
                    a = Wa(e, ['sideCar'])
                if (!t) throw new Error('Sidecar: please provide `sideCar` property to import the right car')
                var o = t.read()
                if (!o) throw new Error('Sidecar medium not found')
                return oe(o, ve({}, a))
            }
            Rn.isSideCarExport = !0
        })
    var $o = L(() => {
        Pn()
        kn()
    })
    var Ka,
        Zo = L(() => {
            $o()
            Ka = jo()
        })
    var Yo,
        la,
        Tn = L(() => {
            _t()
            U()
            Xa()
            wn()
            Zo()
            ;((Yo = function () {}),
                (la = P(function (e, t) {
                    var a = k(null),
                        o = N({ onScrollCapture: Yo, onWheelCapture: Yo, onTouchMoveCapture: Yo }),
                        r = o[0],
                        s = o[1],
                        i = e.forwardProps,
                        l = e.children,
                        u = e.className,
                        c = e.removeScrollBar,
                        d = e.enabled,
                        f = e.shards,
                        p = e.sideCar,
                        g = e.noRelative,
                        x = e.noIsolation,
                        m = e.inert,
                        h = e.allowPinchZoom,
                        v = e.as,
                        C = v === void 0 ? 'div' : v,
                        b = e.gapMode,
                        S = Wa(e, [
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
                        y = p,
                        A = Xo([a, t]),
                        B = ve(ve({}, S), r)
                    return oe(
                        Te,
                        null,
                        d &&
                            oe(y, {
                                sideCar: Ka,
                                removeScrollBar: c,
                                shards: f,
                                noRelative: g,
                                noIsolation: x,
                                inert: m,
                                setCallbacks: s,
                                allowPinchZoom: !!h,
                                lockRef: a,
                                gapMode: b
                            }),
                        i ? Be(ke.only(l), ve(ve({}, B), { ref: A })) : oe(C, ve({}, B, { className: u, ref: A }), l)
                    )
                })))
            la.defaultProps = { enabled: !0, removeScrollBar: !0, inert: !1 }
            la.classNames = { fullWidth: vt, zeroRight: xt }
        })
    var An,
        Dn,
        Mn = L(() => {
            Dn = function () {
                if (An) return An
                if (typeof __webpack_nonce__ < 'u') return __webpack_nonce__
            }
        })
    function If() {
        if (!document) return null
        var e = document.createElement('style')
        e.type = 'text/css'
        var t = Dn()
        return (t && e.setAttribute('nonce', t), e)
    }
    function bf(e, t) {
        e.styleSheet ? (e.styleSheet.cssText = t) : e.appendChild(document.createTextNode(t))
    }
    function Sf(e) {
        var t = document.head || document.getElementsByTagName('head')[0]
        t.appendChild(e)
    }
    var Jo,
        Qo = L(() => {
            Mn()
            Jo = function () {
                var e = 0,
                    t = null
                return {
                    add: function (a) {
                        ;(e == 0 && (t = If()) && (bf(t, a), Sf(t)), e++)
                    },
                    remove: function () {
                        ;(e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), (t = null)))
                    }
                }
            }
        })
    var er,
        tr = L(() => {
            U()
            Qo()
            er = function () {
                var e = Jo()
                return function (t, a) {
                    M(
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
    var ia,
        En = L(() => {
            tr()
            ia = function () {
                var e = er(),
                    t = function (a) {
                        var o = a.styles,
                            r = a.dynamic
                        return (e(o, r), null)
                    }
                return t
            }
        })
    var ar = L(() => {
        En()
        Qo()
        tr()
    })
    var yf,
        or,
        wf,
        rr,
        sr = L(() => {
            ;((yf = { left: 0, top: 0, right: 0, gap: 0 }),
                (or = function (e) {
                    return parseInt(e || '', 10) || 0
                }),
                (wf = function (e) {
                    var t = window.getComputedStyle(document.body),
                        a = t[e === 'padding' ? 'paddingLeft' : 'marginLeft'],
                        o = t[e === 'padding' ? 'paddingTop' : 'marginTop'],
                        r = t[e === 'padding' ? 'paddingRight' : 'marginRight']
                    return [or(a), or(o), or(r)]
                }),
                (rr = function (e) {
                    if ((e === void 0 && (e = 'margin'), typeof window > 'u')) return yf
                    var t = wf(e),
                        a = document.documentElement.clientWidth,
                        o = window.innerWidth
                    return { left: t[0], top: t[1], right: t[2], gap: Math.max(0, o - a + t[2] - t[0]) }
                }))
        })
    var Pf,
        Vt,
        Rf,
        Fn,
        kf,
        nr,
        Bn = L(() => {
            U()
            ar()
            Xa()
            sr()
            ;((Pf = ia()),
                (Vt = 'data-scroll-locked'),
                (Rf = function (e, t, a, o) {
                    var r = e.left,
                        s = e.top,
                        i = e.right,
                        l = e.gap
                    return (
                        a === void 0 && (a = 'margin'),
                        `
  .`
                            .concat(
                                Go,
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
                                Vt,
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
                                                s,
                                                `px;
    padding-right: `
                                            )
                                            .concat(
                                                i,
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
                                xt,
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
                                vt,
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
                            .concat(xt, ' .')
                            .concat(
                                xt,
                                ` {
    right: 0 `
                            )
                            .concat(
                                o,
                                `;
  }

  .`
                            )
                            .concat(vt, ' .')
                            .concat(
                                vt,
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
                                Vt,
                                `] {
    `
                            )
                            .concat(Wo, ': ')
                            .concat(
                                l,
                                `px;
  }
`
                            )
                    )
                }),
                (Fn = function () {
                    var e = parseInt(document.body.getAttribute(Vt) || '0', 10)
                    return isFinite(e) ? e : 0
                }),
                (kf = function () {
                    M(function () {
                        return (
                            document.body.setAttribute(Vt, (Fn() + 1).toString()),
                            function () {
                                var e = Fn() - 1
                                e <= 0
                                    ? document.body.removeAttribute(Vt)
                                    : document.body.setAttribute(Vt, e.toString())
                            }
                        )
                    }, [])
                }),
                (nr = function (e) {
                    var t = e.noRelative,
                        a = e.noImportant,
                        o = e.gapMode,
                        r = o === void 0 ? 'margin' : o
                    kf()
                    var s = he(
                        function () {
                            return rr(r)
                        },
                        [r]
                    )
                    return oe(Pf, { styles: Rf(s, !t, r, a ? '' : '!important') })
                }))
        })
    var On = L(() => {
        Bn()
        Xa()
        sr()
    })
    var lr,
        ua,
        Lt,
        Nn = L(() => {
            lr = !1
            if (typeof window < 'u')
                try {
                    ;((ua = Object.defineProperty({}, 'passive', {
                        get: function () {
                            return ((lr = !0), !0)
                        }
                    })),
                        window.addEventListener('test', ua, ua),
                        window.removeEventListener('test', ua, ua))
                } catch {
                    lr = !1
                }
            Lt = lr ? { passive: !1 } : !1
        })
    var Tf,
        zn,
        Af,
        Df,
        ir,
        Mf,
        Ef,
        Hn,
        qn,
        Ff,
        Un,
        _n = L(() => {
            ;((Tf = function (e) {
                return e.tagName === 'TEXTAREA'
            }),
                (zn = function (e, t) {
                    if (!(e instanceof Element)) return !1
                    var a = window.getComputedStyle(e)
                    return a[t] !== 'hidden' && !(a.overflowY === a.overflowX && !Tf(e) && a[t] === 'visible')
                }),
                (Af = function (e) {
                    return zn(e, 'overflowY')
                }),
                (Df = function (e) {
                    return zn(e, 'overflowX')
                }),
                (ir = function (e, t) {
                    var a = t.ownerDocument,
                        o = t
                    do {
                        typeof ShadowRoot < 'u' && o instanceof ShadowRoot && (o = o.host)
                        var r = Hn(e, o)
                        if (r) {
                            var s = qn(e, o),
                                i = s[1],
                                l = s[2]
                            if (i > l) return !0
                        }
                        o = o.parentNode
                    } while (o && o !== a.body)
                    return !1
                }),
                (Mf = function (e) {
                    var t = e.scrollTop,
                        a = e.scrollHeight,
                        o = e.clientHeight
                    return [t, a, o]
                }),
                (Ef = function (e) {
                    var t = e.scrollLeft,
                        a = e.scrollWidth,
                        o = e.clientWidth
                    return [t, a, o]
                }),
                (Hn = function (e, t) {
                    return e === 'v' ? Af(t) : Df(t)
                }),
                (qn = function (e, t) {
                    return e === 'v' ? Mf(t) : Ef(t)
                }),
                (Ff = function (e, t) {
                    return e === 'h' && t === 'rtl' ? -1 : 1
                }),
                (Un = function (e, t, a, o, r) {
                    var s = Ff(e, window.getComputedStyle(t).direction),
                        i = s * o,
                        l = a.target,
                        u = t.contains(l),
                        c = !1,
                        d = i > 0,
                        f = 0,
                        p = 0
                    do {
                        if (!l) break
                        var g = qn(e, l),
                            x = g[0],
                            m = g[1],
                            h = g[2],
                            v = m - h - s * x
                        ;(x || v) && Hn(e, l) && ((f += v), (p += x))
                        var C = l.parentNode
                        l = C && C.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? C.host : C
                    } while ((!u && l !== document.body) || (u && (t.contains(l) || t === l)))
                    return (
                        ((d && ((r && Math.abs(f) < 1) || (!r && i > f))) ||
                            (!d && ((r && Math.abs(p) < 1) || (!r && -i > p)))) &&
                            (c = !0),
                        c
                    )
                }))
        })
    function Wn(e) {
        var t = k([]),
            a = k([0, 0]),
            o = k(),
            r = N(Nf++)[0],
            s = N(ia)[0],
            i = k(e)
        ;(M(
            function () {
                i.current = e
            },
            [e]
        ),
            M(
                function () {
                    if (e.inert) {
                        document.body.classList.add('block-interactivity-'.concat(r))
                        var m = Ln([e.lockRef.current], (e.shards || []).map(Gn), !0).filter(Boolean)
                        return (
                            m.forEach(function (h) {
                                return h.classList.add('allow-interactivity-'.concat(r))
                            }),
                            function () {
                                ;(document.body.classList.remove('block-interactivity-'.concat(r)),
                                    m.forEach(function (h) {
                                        return h.classList.remove('allow-interactivity-'.concat(r))
                                    }))
                            }
                        )
                    }
                },
                [e.inert, e.lockRef.current, e.shards]
            ))
        var l = W(function (m, h) {
                if (('touches' in m && m.touches.length === 2) || (m.type === 'wheel' && m.ctrlKey))
                    return !i.current.allowPinchZoom
                var v = $a(m),
                    C = a.current,
                    b = 'deltaX' in m ? m.deltaX : C[0] - v[0],
                    S = 'deltaY' in m ? m.deltaY : C[1] - v[1],
                    y,
                    A = m.target,
                    B = Math.abs(b) > Math.abs(S) ? 'h' : 'v'
                if ('touches' in m && B === 'h' && A.type === 'range') return !1
                var w = window.getSelection(),
                    D = w && w.anchorNode,
                    G = D ? D === A || D.contains(A) : !1
                if (G) return !1
                var z = ir(B, A)
                if (!z) return !0
                if ((z ? (y = B) : ((y = B === 'v' ? 'h' : 'v'), (z = ir(B, A))), !z)) return !1
                if ((!o.current && 'changedTouches' in m && (b || S) && (o.current = y), !y)) return !0
                var q = o.current || y
                return Un(q, h, m, q === 'h' ? b : S, !0)
            }, []),
            u = W(function (m) {
                var h = m
                if (!(!Gt.length || Gt[Gt.length - 1] !== s)) {
                    var v = 'deltaY' in h ? Vn(h) : $a(h),
                        C = t.current.filter(function (y) {
                            return (
                                y.name === h.type &&
                                (y.target === h.target || h.target === y.shadowParent) &&
                                Bf(y.delta, v)
                            )
                        })[0]
                    if (C && C.should) {
                        h.cancelable && h.preventDefault()
                        return
                    }
                    if (!C) {
                        var b = (i.current.shards || [])
                                .map(Gn)
                                .filter(Boolean)
                                .filter(function (y) {
                                    return y.contains(h.target)
                                }),
                            S = b.length > 0 ? l(h, b[0]) : !i.current.noIsolation
                        S && h.cancelable && h.preventDefault()
                    }
                }
            }, []),
            c = W(function (m, h, v, C) {
                var b = { name: m, delta: h, target: v, should: C, shadowParent: zf(v) }
                ;(t.current.push(b),
                    setTimeout(function () {
                        t.current = t.current.filter(function (S) {
                            return S !== b
                        })
                    }, 1))
            }, []),
            d = W(function (m) {
                ;((a.current = $a(m)), (o.current = void 0))
            }, []),
            f = W(function (m) {
                c(m.type, Vn(m), m.target, l(m, e.lockRef.current))
            }, []),
            p = W(function (m) {
                c(m.type, $a(m), m.target, l(m, e.lockRef.current))
            }, [])
        M(function () {
            return (
                Gt.push(s),
                e.setCallbacks({ onScrollCapture: f, onWheelCapture: f, onTouchMoveCapture: p }),
                document.addEventListener('wheel', u, Lt),
                document.addEventListener('touchmove', u, Lt),
                document.addEventListener('touchstart', d, Lt),
                function () {
                    ;((Gt = Gt.filter(function (m) {
                        return m !== s
                    })),
                        document.removeEventListener('wheel', u, Lt),
                        document.removeEventListener('touchmove', u, Lt),
                        document.removeEventListener('touchstart', d, Lt))
                }
            )
        }, [])
        var g = e.removeScrollBar,
            x = e.inert
        return oe(
            Te,
            null,
            x ? oe(s, { styles: Of(r) }) : null,
            g ? oe(nr, { noRelative: e.noRelative, gapMode: e.gapMode }) : null
        )
    }
    function zf(e) {
        for (var t = null; e !== null; ) (e instanceof ShadowRoot && ((t = e.host), (e = e.host)), (e = e.parentNode))
        return t
    }
    var $a,
        Vn,
        Gn,
        Bf,
        Of,
        Nf,
        Gt,
        Xn = L(() => {
            _t()
            U()
            On()
            ar()
            Nn()
            _n()
            ;(($a = function (e) {
                return 'changedTouches' in e ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY] : [0, 0]
            }),
                (Vn = function (e) {
                    return [e.deltaX, e.deltaY]
                }),
                (Gn = function (e) {
                    return e && 'current' in e ? e.current : e
                }),
                (Bf = function (e, t) {
                    return e[0] === t[0] && e[1] === t[1]
                }),
                (Of = function (e) {
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
                (Nf = 0),
                (Gt = []))
        })
    var jn,
        Kn = L(() => {
            $o()
            Xn()
            Zo()
            jn = Ko(Ka, Wn)
        })
    var $n,
        ur,
        Zn = L(() => {
            _t()
            U()
            Tn()
            Kn()
            $n = P(function (e, t) {
                return oe(la, ve({}, e, { ref: t, sideCar: jn }))
            })
            $n.classNames = la.classNames
            ur = $n
        })
    var Yn = L(() => {
        Zn()
    })
    var Hf,
        Wt,
        Za,
        Ya,
        dr,
        Jn,
        qf,
        Uf,
        Qn,
        el = L(() => {
            ;((Hf = function (e) {
                if (typeof document > 'u') return null
                var t = Array.isArray(e) ? e[0] : e
                return t.ownerDocument.body
            }),
                (Wt = new WeakMap()),
                (Za = new WeakMap()),
                (Ya = {}),
                (dr = 0),
                (Jn = function (e) {
                    return e && (e.host || Jn(e.parentNode))
                }),
                (qf = function (e, t) {
                    return t
                        .map(function (a) {
                            if (e.contains(a)) return a
                            var o = Jn(a)
                            return o && e.contains(o)
                                ? o
                                : (console.error('aria-hidden', a, 'in not contained inside', e, '. Doing nothing'),
                                  null)
                        })
                        .filter(function (a) {
                            return !!a
                        })
                }),
                (Uf = function (e, t, a, o) {
                    var r = qf(t, Array.isArray(e) ? e : [e])
                    Ya[a] || (Ya[a] = new WeakMap())
                    var s = Ya[a],
                        i = [],
                        l = new Set(),
                        u = new Set(r),
                        c = function (f) {
                            !f || l.has(f) || (l.add(f), c(f.parentNode))
                        }
                    r.forEach(c)
                    var d = function (f) {
                        !f ||
                            u.has(f) ||
                            Array.prototype.forEach.call(f.children, function (p) {
                                if (l.has(p)) d(p)
                                else
                                    try {
                                        var g = p.getAttribute(o),
                                            x = g !== null && g !== 'false',
                                            m = (Wt.get(p) || 0) + 1,
                                            h = (s.get(p) || 0) + 1
                                        ;(Wt.set(p, m),
                                            s.set(p, h),
                                            i.push(p),
                                            m === 1 && x && Za.set(p, !0),
                                            h === 1 && p.setAttribute(a, 'true'),
                                            x || p.setAttribute(o, 'true'))
                                    } catch (v) {
                                        console.error('aria-hidden: cannot operate on ', p, v)
                                    }
                            })
                    }
                    return (
                        d(t),
                        l.clear(),
                        dr++,
                        function () {
                            ;(i.forEach(function (f) {
                                var p = Wt.get(f) - 1,
                                    g = s.get(f) - 1
                                ;(Wt.set(f, p),
                                    s.set(f, g),
                                    p || (Za.has(f) || f.removeAttribute(o), Za.delete(f)),
                                    g || f.removeAttribute(a))
                            }),
                                dr--,
                                dr || ((Wt = new WeakMap()), (Wt = new WeakMap()), (Za = new WeakMap()), (Ya = {})))
                        }
                    )
                }),
                (Qn = function (e, t, a) {
                    a === void 0 && (a = 'data-aria-hidden')
                    var o = Array.from(Array.isArray(e) ? e : [e]),
                        r = t || Hf(e)
                    return r
                        ? (o.push.apply(o, Array.from(r.querySelectorAll('[aria-live], script'))),
                          Uf(o, r, a, 'aria-hidden'))
                        : function () {
                              return null
                          }
                }))
        })
    var tt = {}
    Ke(tt, {
        Close: () => da,
        Content: () => so,
        Description: () => lo,
        Dialog: () => to,
        DialogClose: () => da,
        DialogContent: () => so,
        DialogDescription: () => lo,
        DialogOverlay: () => ro,
        DialogPortal: () => oo,
        DialogTitle: () => no,
        DialogTrigger: () => ao,
        Overlay: () => ro,
        Portal: () => oo,
        Root: () => to,
        Title: () => no,
        Trigger: () => ao,
        WarningProvider: () => Kf,
        createDialogScope: () => eo
    })
    function fr(e) {
        return e ? 'open' : 'closed'
    }
    var Qa,
        tl,
        eo,
        _f,
        Re,
        to,
        al,
        ao,
        cr,
        Vf,
        ol,
        oo,
        Ja,
        ro,
        Gf,
        Wf,
        Xt,
        so,
        Xf,
        jf,
        rl,
        sl,
        no,
        nl,
        lo,
        ll,
        da,
        Kf,
        io = L(() => {
            'use client'
            U()
            ht()
            Ne()
            Je()
            _a()
            Ha()
            ln()
            mn()
            gn()
            Ua()
            Ae()
            vn()
            Yn()
            el()
            na()
            R()
            ;((Qa = 'Dialog'),
                ([tl, eo] = xe(Qa)),
                ([_f, Re] = tl(Qa)),
                (to = (e) => {
                    let { __scopeDialog: t, children: a, open: o, defaultOpen: r, onOpenChange: s, modal: i = !0 } = e,
                        l = k(null),
                        u = k(null),
                        [c, d] = zt({ prop: o, defaultProp: r ?? !1, onChange: s, caller: Qa })
                    return n(_f, {
                        scope: t,
                        triggerRef: l,
                        contentRef: u,
                        contentId: Qe(),
                        titleId: Qe(),
                        descriptionId: Qe(),
                        open: c,
                        onOpenChange: d,
                        onOpenToggle: W(() => d((f) => !f), [d]),
                        modal: i,
                        children: a
                    })
                }))
            to.displayName = Qa
            ;((al = 'DialogTrigger'),
                (ao = P((e, t) => {
                    let { __scopeDialog: a, ...o } = e,
                        r = Re(al, a),
                        s = ae(t, r.triggerRef)
                    return n(K.button, {
                        type: 'button',
                        'aria-haspopup': 'dialog',
                        'aria-expanded': r.open,
                        'aria-controls': r.open ? r.contentId : void 0,
                        'data-state': fr(r.open),
                        ...o,
                        ref: s,
                        onClick: Z(e.onClick, r.onOpenToggle)
                    })
                })))
            ao.displayName = al
            ;((cr = 'DialogPortal'),
                ([Vf, ol] = tl(cr, { forceMount: void 0 })),
                (oo = (e) => {
                    let { __scopeDialog: t, forceMount: a, children: o, container: r } = e,
                        s = Re(cr, t)
                    return n(Vf, {
                        scope: t,
                        forceMount: a,
                        children: ke.map(o, (i) =>
                            n(be, { present: a || s.open, children: n(Vo, { asChild: !0, container: r, children: i }) })
                        )
                    })
                }))
            oo.displayName = cr
            ;((Ja = 'DialogOverlay'),
                (ro = P((e, t) => {
                    let a = ol(Ja, e.__scopeDialog),
                        { forceMount: o = a.forceMount, ...r } = e,
                        s = Re(Ja, e.__scopeDialog)
                    return s.modal ? n(be, { present: o || s.open, children: n(Wf, { ...r, ref: t }) }) : null
                })))
            ro.displayName = Ja
            ;((Gf = ze('DialogOverlay.RemoveScroll')),
                (Wf = P((e, t) => {
                    let { __scopeDialog: a, ...o } = e,
                        r = Re(Ja, a),
                        s = sn(),
                        i = ae(t, s)
                    return n(ur, {
                        as: Gf,
                        allowPinchZoom: !0,
                        shards: [r.contentRef],
                        children: n(K.div, {
                            'data-state': fr(r.open),
                            ...o,
                            ref: i,
                            style: { pointerEvents: 'auto', ...o.style }
                        })
                    })
                })),
                (Xt = 'DialogContent'),
                (so = P((e, t) => {
                    let a = ol(Xt, e.__scopeDialog),
                        { forceMount: o = a.forceMount, ...r } = e,
                        s = Re(Xt, e.__scopeDialog)
                    return n(be, {
                        present: o || s.open,
                        children: s.modal ? n(Xf, { ...r, ref: t }) : n(jf, { ...r, ref: t })
                    })
                })))
            so.displayName = Xt
            ;((Xf = P((e, t) => {
                let a = Re(Xt, e.__scopeDialog),
                    o = k(null),
                    r = ae(t, a.contentRef, o)
                return (
                    M(() => {
                        let s = o.current
                        if (s) return Qn(s)
                    }, []),
                    n(rl, {
                        ...e,
                        ref: r,
                        trapFocus: a.open,
                        disableOutsidePointerEvents: a.open,
                        onCloseAutoFocus: Z(e.onCloseAutoFocus, (s) => {
                            ;(s.preventDefault(), a.triggerRef.current?.focus())
                        }),
                        onPointerDownOutside: Z(e.onPointerDownOutside, (s) => {
                            let i = s.detail.originalEvent,
                                l = i.button === 0 && i.ctrlKey === !0
                            ;(i.button === 2 || l) && s.preventDefault()
                        }),
                        onFocusOutside: Z(e.onFocusOutside, (s) => s.preventDefault())
                    })
                )
            })),
                (jf = P((e, t) => {
                    let a = Re(Xt, e.__scopeDialog),
                        o = k(!1),
                        r = k(!1)
                    return n(rl, {
                        ...e,
                        ref: t,
                        trapFocus: !1,
                        disableOutsidePointerEvents: !1,
                        onCloseAutoFocus: (s) => {
                            ;(e.onCloseAutoFocus?.(s),
                                s.defaultPrevented || (o.current || a.triggerRef.current?.focus(), s.preventDefault()),
                                (o.current = !1),
                                (r.current = !1))
                        },
                        onInteractOutside: (s) => {
                            ;(e.onInteractOutside?.(s),
                                s.defaultPrevented ||
                                    ((o.current = !0),
                                    s.detail.originalEvent.type === 'pointerdown' && (r.current = !0)))
                            let i = s.target
                            ;(a.triggerRef.current?.contains(i) && s.preventDefault(),
                                s.detail.originalEvent.type === 'focusin' && r.current && s.preventDefault())
                        }
                    })
                })),
                (rl = P((e, t) => {
                    let { __scopeDialog: a, trapFocus: o, onOpenAutoFocus: r, onCloseAutoFocus: s, ...i } = e,
                        l = Re(Xt, a)
                    return (
                        xn(),
                        n(Bt, {
                            children: n(_o, {
                                asChild: !0,
                                loop: !0,
                                trapped: o,
                                onMountAutoFocus: r,
                                onUnmountAutoFocus: s,
                                children: n(Ho, {
                                    role: 'dialog',
                                    id: l.contentId,
                                    'aria-describedby': l.descriptionId,
                                    'aria-labelledby': l.titleId,
                                    'data-state': fr(l.open),
                                    ...i,
                                    ref: t,
                                    deferPointerDownOutside: !0,
                                    onDismiss: () => l.onOpenChange(!1)
                                })
                            })
                        })
                    )
                })),
                (sl = 'DialogTitle'),
                (no = P((e, t) => {
                    let { __scopeDialog: a, ...o } = e,
                        r = Re(sl, a)
                    return n(K.h2, { id: r.titleId, ...o, ref: t })
                })))
            no.displayName = sl
            ;((nl = 'DialogDescription'),
                (lo = P((e, t) => {
                    let { __scopeDialog: a, ...o } = e,
                        r = Re(nl, a)
                    return n(K.p, { id: r.descriptionId, ...o, ref: t })
                })))
            lo.displayName = nl
            ;((ll = 'DialogClose'),
                (da = P((e, t) => {
                    let { __scopeDialog: a, ...o } = e,
                        r = Re(ll, a)
                    return n(K.button, {
                        type: 'button',
                        ...o,
                        ref: t,
                        onClick: Z(e.onClick, () => r.onOpenChange(!1))
                    })
                })))
            da.displayName = ll
            Kf = (e) => e.children
        })
    var Se = {}
    Ke(Se, {
        Action: () => dp,
        AlertDialog: () => pr,
        AlertDialogAction: () => Cr,
        AlertDialogCancel: () => Ir,
        AlertDialogContent: () => xr,
        AlertDialogDescription: () => Lr,
        AlertDialogOverlay: () => hr,
        AlertDialogPortal: () => gr,
        AlertDialogTitle: () => vr,
        AlertDialogTrigger: () => mr,
        Cancel: () => cp,
        Content: () => up,
        Description: () => pp,
        Overlay: () => ip,
        Portal: () => lp,
        Root: () => sp,
        Title: () => fp,
        Trigger: () => np,
        createAlertDialogScope: () => Zf
    })
    var il,
        $f,
        Zf,
        He,
        pr,
        Yf,
        mr,
        Jf,
        gr,
        Qf,
        hr,
        ul,
        ep,
        tp,
        xr,
        ap,
        vr,
        op,
        Lr,
        rp,
        Cr,
        dl,
        Ir,
        sp,
        np,
        lp,
        ip,
        up,
        dp,
        cp,
        fp,
        pp,
        cl = L(() => {
            'use client'
            U()
            Je()
            Ne()
            io()
            io()
            ht()
            R()
            ;((il = 'AlertDialog'),
                ([$f, Zf] = xe(il, [eo])),
                (He = eo()),
                (pr = (e) => {
                    let { __scopeAlertDialog: t, ...a } = e,
                        o = He(t)
                    return n(to, { ...o, ...a, modal: !0 })
                }))
            pr.displayName = il
            ;((Yf = 'AlertDialogTrigger'),
                (mr = P((e, t) => {
                    let { __scopeAlertDialog: a, ...o } = e,
                        r = He(a)
                    return n(ao, { ...r, ...o, ref: t })
                })))
            mr.displayName = Yf
            ;((Jf = 'AlertDialogPortal'),
                (gr = (e) => {
                    let { __scopeAlertDialog: t, ...a } = e,
                        o = He(t)
                    return n(oo, { ...o, ...a })
                }))
            gr.displayName = Jf
            ;((Qf = 'AlertDialogOverlay'),
                (hr = P((e, t) => {
                    let { __scopeAlertDialog: a, ...o } = e,
                        r = He(a)
                    return n(ro, { ...r, ...o, ref: t })
                })))
            hr.displayName = Qf
            ;((ul = 'AlertDialogContent'),
                ([ep, tp] = $f(ul)),
                (xr = P((e, t) => {
                    let { __scopeAlertDialog: a, children: o, ...r } = e,
                        s = He(a),
                        i = k(null),
                        l = ae(t, i),
                        u = k(null)
                    return n(ep, {
                        scope: a,
                        cancelRef: u,
                        children: n(so, {
                            role: 'alertdialog',
                            ...s,
                            ...r,
                            ref: l,
                            onOpenAutoFocus: Z(r.onOpenAutoFocus, (c) => {
                                ;(c.preventDefault(), u.current?.focus({ preventScroll: !0 }))
                            }),
                            onPointerDownOutside: (c) => c.preventDefault(),
                            onInteractOutside: (c) => c.preventDefault(),
                            children: o
                        })
                    })
                })))
            xr.displayName = ul
            ;((ap = 'AlertDialogTitle'),
                (vr = P((e, t) => {
                    let { __scopeAlertDialog: a, ...o } = e,
                        r = He(a)
                    return n(no, { ...r, ...o, ref: t })
                })))
            vr.displayName = ap
            ;((op = 'AlertDialogDescription'),
                (Lr = P((e, t) => {
                    let { __scopeAlertDialog: a, ...o } = e,
                        r = He(a)
                    return n(lo, { ...r, ...o, ref: t })
                })))
            Lr.displayName = op
            ;((rp = 'AlertDialogAction'),
                (Cr = P((e, t) => {
                    let { __scopeAlertDialog: a, ...o } = e,
                        r = He(a)
                    return n(da, { ...r, ...o, ref: t })
                })))
            Cr.displayName = rp
            ;((dl = 'AlertDialogCancel'),
                (Ir = P((e, t) => {
                    let { __scopeAlertDialog: a, ...o } = e,
                        { cancelRef: r } = tp(dl, a),
                        s = He(a),
                        i = ae(t, r)
                    return n(da, { ...s, ...o, ref: i })
                })))
            Ir.displayName = dl
            ;((sp = pr), (np = mr), (lp = gr), (ip = hr), (up = xr), (dp = Cr), (cp = Ir), (fp = vr), (pp = Lr))
        })
    function Ip(e, t) {
        return t !== 'rtl' ? e : e === 'ArrowLeft' ? 'ArrowRight' : e === 'ArrowRight' ? 'ArrowLeft' : e
    }
    function bp(e, t, a) {
        let o = Ip(e.key, a)
        if (
            !(t === 'vertical' && ['ArrowLeft', 'ArrowRight'].includes(o)) &&
            !(t === 'horizontal' && ['ArrowUp', 'ArrowDown'].includes(o))
        )
            return Cp[o]
    }
    function hl(e, t = !1) {
        let a = document.activeElement
        for (let o of e) if (o === a || (o.focus({ preventScroll: t }), document.activeElement !== a)) return
    }
    function Sp(e, t) {
        return e.map((a, o) => e[(t + o) % e.length])
    }
    var br,
        mp,
        ca,
        Sr,
        fl,
        gp,
        hp,
        yr,
        xp,
        vp,
        pl,
        Lp,
        ml,
        gl,
        Cp,
        xl,
        vl,
        wr = L(() => {
            'use client'
            U()
            ht()
            Qs()
            Ne()
            Je()
            _a()
            Ae()
            qt()
            Ha()
            Va()
            R()
            ;((br = 'rovingFocusGroup.onEntryFocus'),
                (mp = { bubbles: !1, cancelable: !0 }),
                (ca = 'RovingFocusGroup'),
                ([Sr, fl, gp] = Js(ca)),
                ([hp, yr] = xe(ca, [gp])),
                ([xp, vp] = hp(ca)),
                (pl = P((e, t) =>
                    n(Sr.Provider, {
                        scope: e.__scopeRovingFocusGroup,
                        children: n(Sr.Slot, { scope: e.__scopeRovingFocusGroup, children: n(Lp, { ...e, ref: t }) })
                    })
                )))
            pl.displayName = ca
            ;((Lp = P((e, t) => {
                let {
                        __scopeRovingFocusGroup: a,
                        orientation: o,
                        loop: r = !1,
                        dir: s,
                        currentTabStopId: i,
                        defaultCurrentTabStopId: l,
                        onCurrentTabStopIdChange: u,
                        onEntryFocus: c,
                        preventScrollOnEntryFocus: d = !1,
                        ...f
                    } = e,
                    p = k(null),
                    g = ae(t, p),
                    x = Ht(s),
                    [m, h] = zt({ prop: i, defaultProp: l ?? null, onChange: u, caller: ca }),
                    [v, C] = N(!1),
                    b = le(c),
                    S = fl(a),
                    y = k(!1),
                    [A, B] = N(0)
                return (
                    M(() => {
                        let w = p.current
                        if (w) return (w.addEventListener(br, b), () => w.removeEventListener(br, b))
                    }, [b]),
                    n(xp, {
                        scope: a,
                        orientation: o,
                        dir: x,
                        loop: r,
                        currentTabStopId: m,
                        onItemFocus: W((w) => h(w), [h]),
                        onItemShiftTab: W(() => C(!0), []),
                        onFocusableItemAdd: W(() => B((w) => w + 1), []),
                        onFocusableItemRemove: W(() => B((w) => w - 1), []),
                        children: n(K.div, {
                            tabIndex: v || A === 0 ? -1 : 0,
                            'data-orientation': o,
                            ...f,
                            ref: g,
                            style: { outline: 'none', ...e.style },
                            onMouseDown: Z(e.onMouseDown, () => {
                                y.current = !0
                            }),
                            onFocus: Z(e.onFocus, (w) => {
                                let D = !y.current
                                if (w.target === w.currentTarget && D && !v) {
                                    let G = new CustomEvent(br, mp)
                                    if ((w.currentTarget.dispatchEvent(G), !G.defaultPrevented)) {
                                        let z = S().filter((Y) => Y.focusable),
                                            q = z.find((Y) => Y.active),
                                            ee = z.find((Y) => Y.id === m),
                                            te = [q, ee, ...z].filter(Boolean).map((Y) => Y.ref.current)
                                        hl(te, d)
                                    }
                                }
                                y.current = !1
                            }),
                            onBlur: Z(e.onBlur, () => C(!1))
                        })
                    })
                )
            })),
                (ml = 'RovingFocusGroupItem'),
                (gl = P((e, t) => {
                    let {
                            __scopeRovingFocusGroup: a,
                            focusable: o = !0,
                            active: r = !1,
                            tabStopId: s,
                            children: i,
                            ...l
                        } = e,
                        u = Qe(),
                        c = s || u,
                        d = vp(ml, a),
                        f = d.currentTabStopId === c,
                        p = fl(a),
                        { onFocusableItemAdd: g, onFocusableItemRemove: x, currentTabStopId: m } = d
                    return (
                        M(() => {
                            if (o) return (g(), () => x())
                        }, [o, g, x]),
                        n(Sr.ItemSlot, {
                            scope: a,
                            id: c,
                            focusable: o,
                            active: r,
                            children: n(K.span, {
                                tabIndex: f ? 0 : -1,
                                'data-orientation': d.orientation,
                                ...l,
                                ref: t,
                                onMouseDown: Z(e.onMouseDown, (h) => {
                                    o ? d.onItemFocus(c) : h.preventDefault()
                                }),
                                onFocus: Z(e.onFocus, () => d.onItemFocus(c)),
                                onKeyDown: Z(e.onKeyDown, (h) => {
                                    if (h.key === 'Tab' && h.shiftKey) {
                                        d.onItemShiftTab()
                                        return
                                    }
                                    if (h.target !== h.currentTarget) return
                                    let v = bp(h, d.orientation, d.dir)
                                    if (v !== void 0) {
                                        if (h.metaKey || h.ctrlKey || h.altKey || h.shiftKey) return
                                        h.preventDefault()
                                        let b = p()
                                            .filter((S) => S.focusable)
                                            .map((S) => S.ref.current)
                                        if (v === 'last') b.reverse()
                                        else if (v === 'prev' || v === 'next') {
                                            v === 'prev' && b.reverse()
                                            let S = b.indexOf(h.currentTarget)
                                            b = d.loop ? Sp(b, S + 1) : b.slice(S + 1)
                                        }
                                        setTimeout(() => hl(b))
                                    }
                                }),
                                children: typeof i == 'function' ? i({ isCurrentTabStop: f, hasTabStop: m != null }) : i
                            })
                        })
                    )
                })))
            gl.displayName = ml
            Cp = {
                ArrowLeft: 'prev',
                ArrowUp: 'prev',
                ArrowRight: 'next',
                ArrowDown: 'next',
                PageUp: 'first',
                Home: 'first',
                PageDown: 'last',
                End: 'last'
            }
            ;((xl = pl), (vl = gl))
        })
    function Ll(e, [t, a]) {
        return Math.min(a, Math.max(t, e))
    }
    var Cl = L(() => {})
    var fa = {}
    Ke(fa, {
        Indicator: () => Ep,
        Progress: () => kr,
        ProgressIndicator: () => Tr,
        Root: () => Mp,
        createProgressScope: () => Pp
    })
    function Tp(e, t) {
        return `${Math.round((e / t) * 100)}%`
    }
    function yl(e, t) {
        return e == null ? 'indeterminate' : e === t ? 'complete' : 'loading'
    }
    function uo(e) {
        return typeof e == 'number'
    }
    function Il(e) {
        return uo(e) && !isNaN(e) && e > 0
    }
    function bl(e, t) {
        return uo(e) && !isNaN(e) && e <= t && e >= 0
    }
    function Ap(e, t) {
        return `Invalid prop \`max\` of value \`${e}\` supplied to \`${t}\`. Only numbers greater than 0 are valid max values. Defaulting to \`${Rr}\`.`
    }
    function Dp(e, t) {
        return `Invalid prop \`value\` of value \`${e}\` supplied to \`${t}\`. The \`value\` prop must be:
  - a positive number
  - less than the value passed to \`max\` (or ${Rr} if no \`max\` prop is set)
  - \`null\` or \`undefined\` if the progress is indeterminate.

Defaulting to \`null\`.`
    }
    var Pr,
        Rr,
        wp,
        Pp,
        Rp,
        kp,
        kr,
        Sl,
        Tr,
        Mp,
        Ep,
        wl = L(() => {
            'use client'
            U()
            Je()
            Ae()
            R()
            ;((Pr = 'Progress'),
                (Rr = 100),
                ([wp, Pp] = xe(Pr)),
                ([Rp, kp] = wp(Pr)),
                (kr = P((e, t) => {
                    let { __scopeProgress: a, value: o = null, max: r, getValueLabel: s = Tp, ...i } = e
                    ;(r || r === 0) && !Il(r) && console.error(Ap(`${r}`, 'Progress'))
                    let l = Il(r) ? r : Rr
                    o !== null && !bl(o, l) && console.error(Dp(`${o}`, 'Progress'))
                    let u = bl(o, l) ? o : null,
                        c = uo(u) ? s(u, l) : void 0
                    return n(Rp, {
                        scope: a,
                        value: u,
                        max: l,
                        children: n(K.div, {
                            'aria-valuemax': l,
                            'aria-valuemin': 0,
                            'aria-valuenow': uo(u) ? u : void 0,
                            'aria-valuetext': c,
                            role: 'progressbar',
                            'data-state': yl(u, l),
                            'data-value': u ?? void 0,
                            'data-max': l,
                            ...i,
                            ref: t
                        })
                    })
                })))
            kr.displayName = Pr
            ;((Sl = 'ProgressIndicator'),
                (Tr = P((e, t) => {
                    let { __scopeProgress: a, ...o } = e,
                        r = kp(Sl, a)
                    return n(K.div, {
                        'data-state': yl(r.value, r.max),
                        'data-value': r.value ?? void 0,
                        'data-max': r.max,
                        ...o,
                        ref: t
                    })
                })))
            Tr.displayName = Sl
            ;((Mp = kr), (Ep = Tr))
        })
    var at = {}
    Ke(at, {
        Corner: () => Yp,
        Root: () => jp,
        ScrollArea: () => Dr,
        ScrollAreaCorner: () => Nr,
        ScrollAreaScrollbar: () => Er,
        ScrollAreaThumb: () => Br,
        ScrollAreaViewport: () => Mr,
        Scrollbar: () => $p,
        Thumb: () => Zp,
        Viewport: () => Kp,
        createScrollAreaScope: () => Bp
    })
    function Fp(e, t) {
        return Et((a, o) => t[a][o] ?? a, e)
    }
    function fo(e) {
        return e ? parseInt(e, 10) : 0
    }
    function Ml(e, t) {
        let a = e / t
        return isNaN(a) ? 0 : a
    }
    function po(e) {
        let t = Ml(e.viewport, e.content),
            a = e.scrollbar.paddingStart + e.scrollbar.paddingEnd,
            o = (e.scrollbar.size - a) * t
        return Math.max(o, 18)
    }
    function Wp(e, t, a, o = 'ltr') {
        let r = po(a),
            s = r / 2,
            i = t || s,
            l = r - i,
            u = a.scrollbar.paddingStart + i,
            c = a.scrollbar.size - a.scrollbar.paddingEnd - l,
            d = a.content - a.viewport,
            f = o === 'ltr' ? [0, d] : [d * -1, 0]
        return El([u, c], f)(e)
    }
    function Pl(e, t, a = 'ltr') {
        let o = po(t),
            r = t.scrollbar.paddingStart + t.scrollbar.paddingEnd,
            s = t.scrollbar.size - r,
            i = t.content - t.viewport,
            l = s - o,
            u = a === 'ltr' ? [0, i] : [i * -1, 0],
            c = Ll(e, u)
        return El([0, i], [0, l])(c)
    }
    function El(e, t) {
        return (a) => {
            if (e[0] === e[1] || t[0] === t[1]) return t[0]
            let o = (t[1] - t[0]) / (e[1] - e[0])
            return t[0] + o * (a - e[0])
        }
    }
    function Fl(e, t) {
        return e > 0 && e < t
    }
    function mo(e, t) {
        let a = le(e),
            o = k(0)
        return (
            M(() => () => window.clearTimeout(o.current), []),
            W(() => {
                ;(window.clearTimeout(o.current), (o.current = window.setTimeout(a, t)))
            }, [a, t])
        )
    }
    function jt(e, t) {
        let a = le(t)
        Pe(() => {
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
    var Ar,
        Rl,
        Bp,
        Op,
        ye,
        Dr,
        kl,
        Mr,
        Np,
        De,
        Er,
        zp,
        Hp,
        Tl,
        Fr,
        qp,
        Up,
        _p,
        Al,
        Dl,
        co,
        Br,
        Vp,
        Or,
        Nr,
        Gp,
        Xp,
        jp,
        Kp,
        $p,
        Zp,
        Yp,
        Bl = L(() => {
            'use client'
            U()
            Ae()
            Ua()
            Je()
            Ne()
            qt()
            Va()
            Nt()
            Cl()
            ht()
            U()
            R()
            ;((Ar = 'ScrollArea'),
                ([Rl, Bp] = xe(Ar)),
                ([Op, ye] = Rl(Ar)),
                (Dr = P((e, t) => {
                    let { __scopeScrollArea: a, type: o = 'hover', dir: r, scrollHideDelay: s = 600, ...i } = e,
                        [l, u] = N(null),
                        [c, d] = N(null),
                        [f, p] = N(null),
                        [g, x] = N(null),
                        [m, h] = N(null),
                        [v, C] = N(0),
                        [b, S] = N(0),
                        [y, A] = N(!1),
                        [B, w] = N(!1),
                        D = ae(t, (z) => u(z)),
                        G = Ht(r)
                    return n(Op, {
                        scope: a,
                        type: o,
                        dir: G,
                        scrollHideDelay: s,
                        scrollArea: l,
                        viewport: c,
                        onViewportChange: d,
                        content: f,
                        onContentChange: p,
                        scrollbarX: g,
                        onScrollbarXChange: x,
                        scrollbarXEnabled: y,
                        onScrollbarXEnabledChange: A,
                        scrollbarY: m,
                        onScrollbarYChange: h,
                        scrollbarYEnabled: B,
                        onScrollbarYEnabledChange: w,
                        onCornerWidthChange: C,
                        onCornerHeightChange: S,
                        children: n(K.div, {
                            dir: G,
                            ...i,
                            ref: D,
                            style: {
                                position: 'relative',
                                '--radix-scroll-area-corner-width': v + 'px',
                                '--radix-scroll-area-corner-height': b + 'px',
                                ...e.style
                            }
                        })
                    })
                })))
            Dr.displayName = Ar
            ;((kl = 'ScrollAreaViewport'),
                (Mr = P((e, t) => {
                    let { __scopeScrollArea: a, children: o, nonce: r, ...s } = e,
                        i = ye(kl, a),
                        l = k(null),
                        u = ae(t, l, i.onViewportChange)
                    return I(Bt, {
                        children: [
                            n(Np, { nonce: r }),
                            n(K.div, {
                                'data-radix-scroll-area-viewport': '',
                                ...s,
                                ref: u,
                                style: {
                                    overflowX: i.scrollbarXEnabled ? 'scroll' : 'hidden',
                                    overflowY: i.scrollbarYEnabled ? 'scroll' : 'hidden',
                                    ...e.style
                                },
                                children: n('div', {
                                    ref: i.onContentChange,
                                    style: { minWidth: '100%', display: 'table' },
                                    children: o
                                })
                            })
                        ]
                    })
                })))
            Mr.displayName = kl
            ;((Np = oa(
                ({ nonce: e }) =>
                    n('style', {
                        dangerouslySetInnerHTML: {
                            __html: '[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}'
                        },
                        nonce: e
                    }),
                (e, t) => e.nonce === t.nonce
            )),
                (De = 'ScrollAreaScrollbar'),
                (Er = P((e, t) => {
                    let { forceMount: a, ...o } = e,
                        r = ye(De, e.__scopeScrollArea),
                        { onScrollbarXEnabledChange: s, onScrollbarYEnabledChange: i } = r,
                        l = e.orientation === 'horizontal'
                    return (
                        M(
                            () => (
                                l ? s(!0) : i(!0),
                                () => {
                                    l ? s(!1) : i(!1)
                                }
                            ),
                            [l, s, i]
                        ),
                        r.type === 'hover'
                            ? n(zp, { ...o, ref: t, forceMount: a })
                            : r.type === 'scroll'
                              ? n(Hp, { ...o, ref: t, forceMount: a })
                              : r.type === 'auto'
                                ? n(Tl, { ...o, ref: t, forceMount: a })
                                : r.type === 'always'
                                  ? n(Fr, { ...o, ref: t, 'data-state': 'visible' })
                                  : null
                    )
                })))
            Er.displayName = De
            ;((zp = P((e, t) => {
                let { forceMount: a, ...o } = e,
                    r = ye(De, e.__scopeScrollArea),
                    [s, i] = N(!1)
                return (
                    M(() => {
                        let l = r.scrollArea,
                            u = 0
                        if (l) {
                            let c = () => {
                                    ;(window.clearTimeout(u), i(!0))
                                },
                                d = () => {
                                    u = window.setTimeout(() => i(!1), r.scrollHideDelay)
                                }
                            return (
                                l.addEventListener('pointerenter', c),
                                l.addEventListener('pointerleave', d),
                                () => {
                                    ;(window.clearTimeout(u),
                                        l.removeEventListener('pointerenter', c),
                                        l.removeEventListener('pointerleave', d))
                                }
                            )
                        }
                    }, [r.scrollArea, r.scrollHideDelay]),
                    n(be, {
                        present: a || s,
                        children: n(Tl, { 'data-state': s ? 'visible' : 'hidden', ...o, ref: t })
                    })
                )
            })),
                (Hp = P((e, t) => {
                    let { forceMount: a, ...o } = e,
                        r = ye(De, e.__scopeScrollArea),
                        s = e.orientation === 'horizontal',
                        i = mo(() => u('SCROLL_END'), 100),
                        [l, u] = Fp('hidden', {
                            hidden: { SCROLL: 'scrolling' },
                            scrolling: { SCROLL_END: 'idle', POINTER_ENTER: 'interacting' },
                            interacting: { SCROLL: 'interacting', POINTER_LEAVE: 'idle' },
                            idle: { HIDE: 'hidden', SCROLL: 'scrolling', POINTER_ENTER: 'interacting' }
                        })
                    return (
                        M(() => {
                            if (l === 'idle') {
                                let c = window.setTimeout(() => u('HIDE'), r.scrollHideDelay)
                                return () => window.clearTimeout(c)
                            }
                        }, [l, r.scrollHideDelay, u]),
                        M(() => {
                            let c = r.viewport,
                                d = s ? 'scrollLeft' : 'scrollTop'
                            if (c) {
                                let f = c[d],
                                    p = () => {
                                        let g = c[d]
                                        ;(f !== g && (u('SCROLL'), i()), (f = g))
                                    }
                                return (c.addEventListener('scroll', p), () => c.removeEventListener('scroll', p))
                            }
                        }, [r.viewport, s, u, i]),
                        n(be, {
                            present: a || l !== 'hidden',
                            children: n(Fr, {
                                'data-state': l === 'hidden' ? 'hidden' : 'visible',
                                ...o,
                                ref: t,
                                onPointerEnter: Z(e.onPointerEnter, () => u('POINTER_ENTER')),
                                onPointerLeave: Z(e.onPointerLeave, () => u('POINTER_LEAVE'))
                            })
                        })
                    )
                })),
                (Tl = P((e, t) => {
                    let a = ye(De, e.__scopeScrollArea),
                        { forceMount: o, ...r } = e,
                        [s, i] = N(!1),
                        l = e.orientation === 'horizontal',
                        u = mo(() => {
                            if (a.viewport) {
                                let c = a.viewport.offsetWidth < a.viewport.scrollWidth,
                                    d = a.viewport.offsetHeight < a.viewport.scrollHeight
                                i(l ? c : d)
                            }
                        }, 10)
                    return (
                        jt(a.viewport, u),
                        jt(a.content, u),
                        n(be, {
                            present: o || s,
                            children: n(Fr, { 'data-state': s ? 'visible' : 'hidden', ...r, ref: t })
                        })
                    )
                })),
                (Fr = P((e, t) => {
                    let { orientation: a = 'vertical', ...o } = e,
                        r = ye(De, e.__scopeScrollArea),
                        s = k(null),
                        i = k(0),
                        [l, u] = N({ content: 0, viewport: 0, scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 } }),
                        c = Ml(l.viewport, l.content),
                        d = {
                            ...o,
                            sizes: l,
                            onSizesChange: u,
                            hasThumb: c > 0 && c < 1,
                            onThumbChange: (p) => (s.current = p),
                            onThumbPointerUp: () => (i.current = 0),
                            onThumbPointerDown: (p) => (i.current = p)
                        }
                    function f(p, g) {
                        return Wp(p, i.current, l, g)
                    }
                    return a === 'horizontal'
                        ? n(qp, {
                              ...d,
                              ref: t,
                              onThumbPositionChange: () => {
                                  if (r.viewport && s.current) {
                                      let p = r.viewport.scrollLeft,
                                          g = Pl(p, l, r.dir)
                                      s.current.style.transform = `translate3d(${g}px, 0, 0)`
                                  }
                              },
                              onWheelScroll: (p) => {
                                  r.viewport && (r.viewport.scrollLeft = p)
                              },
                              onDragScroll: (p) => {
                                  r.viewport && (r.viewport.scrollLeft = f(p, r.dir))
                              }
                          })
                        : a === 'vertical'
                          ? n(Up, {
                                ...d,
                                ref: t,
                                onThumbPositionChange: () => {
                                    if (r.viewport && s.current) {
                                        let p = r.viewport.scrollTop,
                                            g = Pl(p, l)
                                        s.current.style.transform = `translate3d(0, ${g}px, 0)`
                                    }
                                },
                                onWheelScroll: (p) => {
                                    r.viewport && (r.viewport.scrollTop = p)
                                },
                                onDragScroll: (p) => {
                                    r.viewport && (r.viewport.scrollTop = f(p))
                                }
                            })
                          : null
                })),
                (qp = P((e, t) => {
                    let { sizes: a, onSizesChange: o, ...r } = e,
                        s = ye(De, e.__scopeScrollArea),
                        [i, l] = N(),
                        u = k(null),
                        c = ae(t, u, s.onScrollbarXChange)
                    return (
                        M(() => {
                            u.current && l(getComputedStyle(u.current))
                        }, [u]),
                        n(Dl, {
                            'data-orientation': 'horizontal',
                            ...r,
                            ref: c,
                            sizes: a,
                            style: {
                                bottom: 0,
                                left: s.dir === 'rtl' ? 'var(--radix-scroll-area-corner-width)' : 0,
                                right: s.dir === 'ltr' ? 'var(--radix-scroll-area-corner-width)' : 0,
                                '--radix-scroll-area-thumb-width': po(a) + 'px',
                                ...e.style
                            },
                            onThumbPointerDown: (d) => e.onThumbPointerDown(d.x),
                            onDragScroll: (d) => e.onDragScroll(d.x),
                            onWheelScroll: (d, f) => {
                                if (s.viewport) {
                                    let p = s.viewport.scrollLeft + d.deltaX
                                    ;(e.onWheelScroll(p), Fl(p, f) && d.preventDefault())
                                }
                            },
                            onResize: () => {
                                u.current &&
                                    s.viewport &&
                                    i &&
                                    o({
                                        content: s.viewport.scrollWidth,
                                        viewport: s.viewport.offsetWidth,
                                        scrollbar: {
                                            size: u.current.clientWidth,
                                            paddingStart: fo(i.paddingLeft),
                                            paddingEnd: fo(i.paddingRight)
                                        }
                                    })
                            }
                        })
                    )
                })),
                (Up = P((e, t) => {
                    let { sizes: a, onSizesChange: o, ...r } = e,
                        s = ye(De, e.__scopeScrollArea),
                        [i, l] = N(),
                        u = k(null),
                        c = ae(t, u, s.onScrollbarYChange)
                    return (
                        M(() => {
                            u.current && l(getComputedStyle(u.current))
                        }, [u]),
                        n(Dl, {
                            'data-orientation': 'vertical',
                            ...r,
                            ref: c,
                            sizes: a,
                            style: {
                                top: 0,
                                right: s.dir === 'ltr' ? 0 : void 0,
                                left: s.dir === 'rtl' ? 0 : void 0,
                                bottom: 'var(--radix-scroll-area-corner-height)',
                                '--radix-scroll-area-thumb-height': po(a) + 'px',
                                ...e.style
                            },
                            onThumbPointerDown: (d) => e.onThumbPointerDown(d.y),
                            onDragScroll: (d) => e.onDragScroll(d.y),
                            onWheelScroll: (d, f) => {
                                if (s.viewport) {
                                    let p = s.viewport.scrollTop + d.deltaY
                                    ;(e.onWheelScroll(p), Fl(p, f) && d.preventDefault())
                                }
                            },
                            onResize: () => {
                                u.current &&
                                    s.viewport &&
                                    i &&
                                    o({
                                        content: s.viewport.scrollHeight,
                                        viewport: s.viewport.offsetHeight,
                                        scrollbar: {
                                            size: u.current.clientHeight,
                                            paddingStart: fo(i.paddingTop),
                                            paddingEnd: fo(i.paddingBottom)
                                        }
                                    })
                            }
                        })
                    )
                })),
                ([_p, Al] = Rl(De)),
                (Dl = P((e, t) => {
                    let {
                            __scopeScrollArea: a,
                            sizes: o,
                            hasThumb: r,
                            onThumbChange: s,
                            onThumbPointerUp: i,
                            onThumbPointerDown: l,
                            onThumbPositionChange: u,
                            onDragScroll: c,
                            onWheelScroll: d,
                            onResize: f,
                            ...p
                        } = e,
                        g = ye(De, a),
                        [x, m] = N(null),
                        h = ae(t, (D) => m(D)),
                        v = k(null),
                        C = k(''),
                        b = g.viewport,
                        S = o.content - o.viewport,
                        y = le(d),
                        A = le(u),
                        B = mo(f, 10)
                    function w(D) {
                        if (v.current) {
                            let G = D.clientX - v.current.left,
                                z = D.clientY - v.current.top
                            c({ x: G, y: z })
                        }
                    }
                    return (
                        M(() => {
                            let D = (G) => {
                                let z = G.target
                                x?.contains(z) && y(G, S)
                            }
                            return (
                                document.addEventListener('wheel', D, { passive: !1 }),
                                () => document.removeEventListener('wheel', D, { passive: !1 })
                            )
                        }, [b, x, S, y]),
                        M(A, [o, A]),
                        jt(x, B),
                        jt(g.content, B),
                        n(_p, {
                            scope: a,
                            scrollbar: x,
                            hasThumb: r,
                            onThumbChange: le(s),
                            onThumbPointerUp: le(i),
                            onThumbPositionChange: A,
                            onThumbPointerDown: le(l),
                            children: n(K.div, {
                                ...p,
                                ref: h,
                                style: { position: 'absolute', ...p.style },
                                onPointerDown: Z(e.onPointerDown, (D) => {
                                    D.button === 0 &&
                                        (D.target.setPointerCapture(D.pointerId),
                                        (v.current = x.getBoundingClientRect()),
                                        (C.current = document.body.style.webkitUserSelect),
                                        (document.body.style.webkitUserSelect = 'none'),
                                        g.viewport && (g.viewport.style.scrollBehavior = 'auto'),
                                        w(D))
                                }),
                                onPointerMove: Z(e.onPointerMove, w),
                                onPointerUp: Z(e.onPointerUp, (D) => {
                                    let G = D.target
                                    ;(G.hasPointerCapture(D.pointerId) && G.releasePointerCapture(D.pointerId),
                                        (document.body.style.webkitUserSelect = C.current),
                                        g.viewport && (g.viewport.style.scrollBehavior = ''),
                                        (v.current = null))
                                })
                            })
                        })
                    )
                })),
                (co = 'ScrollAreaThumb'),
                (Br = P((e, t) => {
                    let { forceMount: a, ...o } = e,
                        r = Al(co, e.__scopeScrollArea)
                    return n(be, { present: a || r.hasThumb, children: n(Vp, { ref: t, ...o }) })
                })),
                (Vp = P((e, t) => {
                    let { __scopeScrollArea: a, style: o, ...r } = e,
                        s = ye(co, a),
                        i = Al(co, a),
                        { onThumbPositionChange: l } = i,
                        u = ae(t, (f) => i.onThumbChange(f)),
                        c = k(void 0),
                        d = mo(() => {
                            c.current && (c.current(), (c.current = void 0))
                        }, 100)
                    return (
                        M(() => {
                            let f = s.viewport
                            if (f) {
                                let p = () => {
                                    if ((d(), !c.current)) {
                                        let g = Xp(f, l)
                                        ;((c.current = g), l())
                                    }
                                }
                                return (l(), f.addEventListener('scroll', p), () => f.removeEventListener('scroll', p))
                            }
                        }, [s.viewport, d, l]),
                        n(K.div, {
                            'data-state': i.hasThumb ? 'visible' : 'hidden',
                            ...r,
                            ref: u,
                            style: {
                                width: 'var(--radix-scroll-area-thumb-width)',
                                height: 'var(--radix-scroll-area-thumb-height)',
                                ...o
                            },
                            onPointerDownCapture: Z(e.onPointerDownCapture, (f) => {
                                let g = f.target.getBoundingClientRect(),
                                    x = f.clientX - g.left,
                                    m = f.clientY - g.top
                                i.onThumbPointerDown({ x, y: m })
                            }),
                            onPointerUp: Z(e.onPointerUp, i.onThumbPointerUp)
                        })
                    )
                })))
            Br.displayName = co
            ;((Or = 'ScrollAreaCorner'),
                (Nr = P((e, t) => {
                    let a = ye(Or, e.__scopeScrollArea),
                        o = !!(a.scrollbarX && a.scrollbarY)
                    return a.type !== 'scroll' && o ? n(Gp, { ...e, ref: t }) : null
                })))
            Nr.displayName = Or
            Gp = P((e, t) => {
                let { __scopeScrollArea: a, ...o } = e,
                    r = ye(Or, a),
                    [s, i] = N(0),
                    [l, u] = N(0),
                    c = !!(s && l)
                return (
                    jt(r.scrollbarX, () => {
                        let d = r.scrollbarX?.offsetHeight || 0
                        ;(r.onCornerHeightChange(d), u(d))
                    }),
                    jt(r.scrollbarY, () => {
                        let d = r.scrollbarY?.offsetWidth || 0
                        ;(r.onCornerWidthChange(d), i(d))
                    }),
                    c
                        ? n(K.div, {
                              ...o,
                              ref: t,
                              style: {
                                  width: s,
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
            Xp = (e, t = () => {}) => {
                let a = { left: e.scrollLeft, top: e.scrollTop },
                    o = 0
                return (
                    (function r() {
                        let s = { left: e.scrollLeft, top: e.scrollTop },
                            i = a.left !== s.left,
                            l = a.top !== s.top
                        ;((i || l) && t(), (a = s), (o = window.requestAnimationFrame(r)))
                    })(),
                    () => window.cancelAnimationFrame(o)
                )
            }
            ;((jp = Dr), (Kp = Mr), ($p = Er), (Zp = Br), (Yp = Nr))
        })
    var go = {}
    Ke(go, { Root: () => tm, Separator: () => zr })
    function em(e) {
        return Qp.includes(e)
    }
    var Jp,
        Ol,
        Qp,
        zr,
        tm,
        Nl = L(() => {
            U()
            Ae()
            R()
            ;((Jp = 'Separator'),
                (Ol = 'horizontal'),
                (Qp = ['horizontal', 'vertical']),
                (zr = P((e, t) => {
                    let { decorative: a, orientation: o = Ol, ...r } = e,
                        s = em(o) ? o : Ol,
                        l = a
                            ? { role: 'none' }
                            : { 'aria-orientation': s === 'vertical' ? s : void 0, role: 'separator' }
                    return n(K.div, { 'data-orientation': s, ...l, ...r, ref: t })
                })))
            zr.displayName = Jp
            tm = zr
        })
    var Ct = {}
    Ke(Ct, {
        Content: () => im,
        List: () => nm,
        Root: () => sm,
        Tabs: () => qr,
        TabsContent: () => Vr,
        TabsList: () => Ur,
        TabsTrigger: () => _r,
        Trigger: () => lm,
        createTabsScope: () => om
    })
    function _l(e, t) {
        return `${e}-trigger-${t}`
    }
    function Vl(e, t) {
        return `${e}-content-${t}`
    }
    var ho,
        am,
        om,
        zl,
        rm,
        Hr,
        qr,
        Hl,
        Ur,
        ql,
        _r,
        Ul,
        Vr,
        sm,
        nm,
        lm,
        im,
        Gl = L(() => {
            'use client'
            U()
            ht()
            Je()
            wr()
            Ua()
            Ae()
            wr()
            Va()
            Ha()
            _a()
            R()
            ;((ho = 'Tabs'),
                ([am, om] = xe(ho, [yr])),
                (zl = yr()),
                ([rm, Hr] = am(ho)),
                (qr = P((e, t) => {
                    let {
                            __scopeTabs: a,
                            value: o,
                            onValueChange: r,
                            defaultValue: s,
                            orientation: i = 'horizontal',
                            dir: l,
                            activationMode: u = 'automatic',
                            ...c
                        } = e,
                        d = Ht(l),
                        [f, p] = zt({ prop: o, onChange: r, defaultProp: s ?? '', caller: ho })
                    return n(rm, {
                        scope: a,
                        baseId: Qe(),
                        value: f,
                        onValueChange: p,
                        orientation: i,
                        dir: d,
                        activationMode: u,
                        children: n(K.div, { dir: d, 'data-orientation': i, ...c, ref: t })
                    })
                })))
            qr.displayName = ho
            ;((Hl = 'TabsList'),
                (Ur = P((e, t) => {
                    let { __scopeTabs: a, loop: o = !0, ...r } = e,
                        s = Hr(Hl, a),
                        i = zl(a)
                    return n(xl, {
                        asChild: !0,
                        ...i,
                        orientation: s.orientation,
                        dir: s.dir,
                        loop: o,
                        children: n(K.div, { role: 'tablist', 'aria-orientation': s.orientation, ...r, ref: t })
                    })
                })))
            Ur.displayName = Hl
            ;((ql = 'TabsTrigger'),
                (_r = P((e, t) => {
                    let { __scopeTabs: a, value: o, disabled: r = !1, ...s } = e,
                        i = Hr(ql, a),
                        l = zl(a),
                        u = _l(i.baseId, o),
                        c = Vl(i.baseId, o),
                        d = o === i.value
                    return n(vl, {
                        asChild: !0,
                        ...l,
                        focusable: !r,
                        active: d,
                        children: n(K.button, {
                            type: 'button',
                            role: 'tab',
                            'aria-selected': d,
                            'aria-controls': c,
                            'data-state': d ? 'active' : 'inactive',
                            'data-disabled': r ? '' : void 0,
                            disabled: r,
                            id: u,
                            ...s,
                            ref: t,
                            onMouseDown: Z(e.onMouseDown, (f) => {
                                !r && f.button === 0 && f.ctrlKey === !1 ? i.onValueChange(o) : f.preventDefault()
                            }),
                            onKeyDown: Z(e.onKeyDown, (f) => {
                                ;[' ', 'Enter'].includes(f.key) && i.onValueChange(o)
                            }),
                            onFocus: Z(e.onFocus, () => {
                                let f = i.activationMode !== 'manual'
                                !d && !r && f && i.onValueChange(o)
                            })
                        })
                    })
                })))
            _r.displayName = ql
            ;((Ul = 'TabsContent'),
                (Vr = P((e, t) => {
                    let { __scopeTabs: a, value: o, forceMount: r, children: s, ...i } = e,
                        l = Hr(Ul, a),
                        u = _l(l.baseId, o),
                        c = Vl(l.baseId, o),
                        d = o === l.value,
                        f = k(d)
                    return (
                        M(() => {
                            let p = requestAnimationFrame(() => (f.current = !1))
                            return () => cancelAnimationFrame(p)
                        }, []),
                        n(be, {
                            present: r || d,
                            children: ({ present: p }) =>
                                n(K.div, {
                                    'data-state': d ? 'active' : 'inactive',
                                    'data-orientation': l.orientation,
                                    role: 'tabpanel',
                                    'aria-labelledby': u,
                                    hidden: !p,
                                    id: c,
                                    tabIndex: 0,
                                    ...i,
                                    ref: t,
                                    style: { ...e.style, animationDuration: f.current ? '0s' : void 0 },
                                    children: p && s
                                })
                        })
                    )
                })))
            Vr.displayName = Ul
            ;((sm = qr), (nm = Ur), (lm = _r), (im = Vr))
        })
    var qe = L(() => {
        cl()
        io()
        wl()
        Bl()
        Nl()
        na()
        Gl()
    })
    function Wl({ className: e, variant: t = 'default', asChild: a = !1, ...o }) {
        let r = a ? Ot.Root : 'span'
        return n(r, { 'data-slot': 'badge', 'data-variant': t, className: O(um({ variant: t }), e), ...o })
    }
    var um,
        Xl = L(() => {
            sa()
            qe()
            $()
            R()
            um = Ye(
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
    function xo({ className: e, variant: t = 'default', size: a = 'default', asChild: o = !1, ...r }) {
        let s = o ? Ot.Root : 'button'
        return n(s, {
            'data-slot': 'button',
            'data-variant': t,
            'data-size': a,
            className: O(pa({ variant: t, size: a, className: e })),
            ...r
        })
    }
    var pa,
        ma = L(() => {
            sa()
            qe()
            $()
            R()
            pa = Ye(
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
    function ot({ className: e, ...t }) {
        return n('div', {
            'data-slot': 'card',
            className: O('flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm', e),
            ...t
        })
    }
    function ga({ className: e, ...t }) {
        return n('div', {
            'data-slot': 'card-header',
            className: O(
                '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
                e
            ),
            ...t
        })
    }
    function ha({ className: e, ...t }) {
        return n('div', { 'data-slot': 'card-title', className: O('leading-none font-semibold', e), ...t })
    }
    function vo({ className: e, ...t }) {
        return n('div', { 'data-slot': 'card-description', className: O('text-sm text-muted-foreground', e), ...t })
    }
    function rt({ className: e, ...t }) {
        return n('div', { 'data-slot': 'card-content', className: O('px-6', e), ...t })
    }
    var jl = L(() => {
        $()
        R()
    })
    var Lo,
        Gr = L(() => {
            Lo = (...e) =>
                e
                    .filter((t, a, o) => !!t && t.trim() !== '' && o.indexOf(t) === a)
                    .join(' ')
                    .trim()
        })
    var Kl,
        $l = L(() => {
            Kl = (e) => e.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
        })
    var Zl,
        Yl = L(() => {
            Zl = (e) => e.replace(/^([A-Z])|[\s-_]+(\w)/g, (t, a, o) => (o ? o.toUpperCase() : a.toLowerCase()))
        })
    var Wr,
        Jl = L(() => {
            Yl()
            Wr = (e) => {
                let t = Zl(e)
                return t.charAt(0).toUpperCase() + t.slice(1)
            }
        })
    var Co,
        Ql = L(() => {
            Co = {
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
    var ei,
        ti = L(() => {
            ei = (e) => {
                for (let t in e) if (t.startsWith('aria-') || t === 'role' || t === 'title') return !0
                return !1
            }
        })
    var dm,
        ai,
        oi = L(() => {
            'use strict'
            'use client'
            U()
            ;((dm = de({})), (ai = () => me(dm)))
        })
    var ri,
        si = L(() => {
            'use strict'
            'use client'
            U()
            Ql()
            ti()
            Gr()
            oi()
            ri = P(
                (
                    {
                        color: e,
                        size: t,
                        strokeWidth: a,
                        absoluteStrokeWidth: o,
                        className: r = '',
                        children: s,
                        iconNode: i,
                        ...l
                    },
                    u
                ) => {
                    let {
                            size: c = 24,
                            strokeWidth: d = 2,
                            absoluteStrokeWidth: f = !1,
                            color: p = 'currentColor',
                            className: g = ''
                        } = ai() ?? {},
                        x = (o ?? f) ? (Number(a ?? d) * 24) / Number(t ?? c) : (a ?? d)
                    return oe(
                        'svg',
                        {
                            ref: u,
                            ...Co,
                            width: t ?? c ?? Co.width,
                            height: t ?? c ?? Co.height,
                            stroke: e ?? p,
                            strokeWidth: x,
                            className: Lo('lucide', g, r),
                            ...(!s && !ei(l) && { 'aria-hidden': 'true' }),
                            ...l
                        },
                        [...i.map(([m, h]) => oe(m, h)), ...(Array.isArray(s) ? s : [s])]
                    )
                }
            )
        })
    var J,
        ce = L(() => {
            U()
            Gr()
            $l()
            Jl()
            si()
            J = (e, t) => {
                let a = P(({ className: o, ...r }, s) =>
                    oe(ri, { ref: s, iconNode: t, className: Lo(`lucide-${Kl(Wr(e))}`, `lucide-${e}`, o), ...r })
                )
                return ((a.displayName = Wr(e)), a)
            }
        })
    var cm,
        Kt,
        ni = L(() => {
            ce()
            ;((cm = [
                [
                    'path',
                    {
                        d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
                        key: '169zse'
                    }
                ]
            ]),
                (Kt = J('activity', cm)))
        })
    var fm,
        $t,
        li = L(() => {
            ce()
            ;((fm = [
                ['path', { d: 'M5 12h14', key: '1ays0h' }],
                ['path', { d: 'm12 5 7 7-7 7', key: 'xquz4c' }]
            ]),
                ($t = J('arrow-right', fm)))
        })
    var pm,
        st,
        ii = L(() => {
            ce()
            ;((pm = [
                ['path', { d: 'M4.5 3h15', key: 'c7n0jr' }],
                ['path', { d: 'M6 3v16a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3', key: 'm1uhx7' }],
                ['path', { d: 'M6 14h12', key: '4cwo0f' }]
            ]),
                (st = J('beaker', pm)))
        })
    var mm,
        Zt,
        ui = L(() => {
            ce()
            ;((mm = [
                ['path', { d: 'M12 21V7', key: 'gj6g52' }],
                ['path', { d: 'm16 12 2 2 4-4', key: 'mdajum' }],
                [
                    'path',
                    {
                        d: 'M22 6V4a1 1 0 0 0-1-1h-5a4 4 0 0 0-4 4 4 4 0 0 0-4-4H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6a1 1 0 0 0 1-1v-1.3',
                        key: '8arnkb'
                    }
                ]
            ]),
                (Zt = J('book-open-check', mm)))
        })
    var gm,
        Ue,
        di = L(() => {
            ce()
            ;((gm = [
                ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
                ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }]
            ]),
                (Ue = J('circle-check', gm)))
        })
    var hm,
        _e,
        ci = L(() => {
            ce()
            ;((hm = [
                ['path', { d: 'M15.6 2.7a10 10 0 1 0 5.7 5.7', key: '1e0p6d' }],
                ['circle', { cx: '12', cy: '12', r: '2', key: '1c9p78' }],
                ['path', { d: 'M13.4 10.6 19 5', key: '1kr7tw' }]
            ]),
                (_e = J('circle-gauge', hm)))
        })
    var xm,
        nt,
        fi = L(() => {
            ce()
            ;((xm = [
                [
                    'path',
                    {
                        d: 'M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z',
                        key: 'kmsa83'
                    }
                ],
                ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }]
            ]),
                (nt = J('circle-play', xm)))
        })
    var vm,
        Yt,
        pi = L(() => {
            ce()
            ;((vm = [
                ['circle', { cx: '5', cy: '6', r: '3', key: '1qnov2' }],
                ['path', { d: 'M12 6h5a2 2 0 0 1 2 2v7', key: '1yj91y' }],
                ['path', { d: 'm15 9-3-3 3-3', key: '1lwv8l' }],
                ['circle', { cx: '19', cy: '18', r: '3', key: '1qljk2' }],
                ['path', { d: 'M12 18H7a2 2 0 0 1-2-2V9', key: '16sdep' }],
                ['path', { d: 'm9 15 3 3-3 3', key: '1m3kbl' }]
            ]),
                (Yt = J('git-compare-arrows', vm)))
        })
    var Lm,
        xa,
        mi = L(() => {
            ce()
            ;((Lm = [
                ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', key: '1357e3' }],
                ['path', { d: 'M3 3v5h5', key: '1xhq8a' }],
                ['path', { d: 'M12 7v5l4 2', key: '1fdv2h' }]
            ]),
                (xa = J('history', Lm)))
        })
    var Cm,
        va,
        gi = L(() => {
            ce()
            ;((Cm = [
                ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', key: 'v9h5vc' }],
                ['path', { d: 'M21 3v5h-5', key: '1q7to0' }],
                ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', key: '3uifl3' }],
                ['path', { d: 'M8 16H3v5', key: '1cv678' }]
            ]),
                (va = J('refresh-cw', Cm)))
        })
    var Im,
        It,
        hi = L(() => {
            ce()
            ;((Im = [
                ['path', { d: 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5', key: 'qeys4' }],
                [
                    'path',
                    {
                        d: 'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09',
                        key: 'u4xsad'
                    }
                ],
                [
                    'path',
                    {
                        d: 'M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z',
                        key: '676m9'
                    }
                ],
                ['path', { d: 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05', key: '92ym6u' }]
            ]),
                (It = J('rocket', Im)))
        })
    var bm,
        La,
        xi = L(() => {
            ce()
            ;((bm = [
                [
                    'path',
                    {
                        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
                        key: 'oel41y'
                    }
                ],
                ['path', { d: 'm9 12 2 2 4-4', key: 'dzmm74' }]
            ]),
                (La = J('shield-check', bm)))
        })
    var Sm,
        Ve,
        vi = L(() => {
            ce()
            ;((Sm = [
                [
                    'path',
                    {
                        d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
                        key: '1s2grr'
                    }
                ],
                ['path', { d: 'M20 2v4', key: '1rf3ol' }],
                ['path', { d: 'M22 4h-4', key: 'gwowj6' }],
                ['circle', { cx: '4', cy: '20', r: '2', key: '6kqj1y' }]
            ]),
                (Ve = J('sparkles', Sm)))
        })
    var ym,
        Ca,
        Li = L(() => {
            ce()
            ;((ym = [
                ['circle', { cx: '12', cy: '12', r: '10', key: '1mglay' }],
                ['circle', { cx: '12', cy: '12', r: '6', key: '1vlfrh' }],
                ['circle', { cx: '12', cy: '12', r: '2', key: '1c9p78' }]
            ]),
                (Ca = J('target', ym)))
        })
    var wm,
        lt,
        Ci = L(() => {
            ce()
            ;((wm = [
                [
                    'path',
                    { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', key: 'wmoenq' }
                ],
                ['path', { d: 'M12 9v4', key: 'juzpu7' }],
                ['path', { d: 'M12 17h.01', key: 'p32p05' }]
            ]),
                (lt = J('triangle-alert', wm)))
        })
    var Ii = L(() => {
        'use strict'
        di()
        ci()
        fi()
        vi()
        Ci()
        ni()
        li()
        ii()
        ui()
        pi()
        mi()
        gi()
        hi()
        xi()
        Li()
    })
    var bi = L(() => {
        'use client'
        $()
        R()
    })
    var Xr = L(() => {
        $()
        ma()
        R()
    })
    var Si = L(() => {
        $()
        R()
    })
    function yi({ className: e, children: t, ...a }) {
        return I(at.Root, {
            'data-slot': 'scroll-area',
            className: O('relative', e),
            ...a,
            children: [
                n(at.Viewport, {
                    'data-slot': 'scroll-area-viewport',
                    className:
                        'size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
                    children: t
                }),
                n(Pm, {}),
                n(at.Corner, {})
            ]
        })
    }
    function Pm({ className: e, orientation: t = 'vertical', ...a }) {
        return n(at.ScrollAreaScrollbar, {
            'data-slot': 'scroll-area-scrollbar',
            orientation: t,
            className: O(
                'flex touch-none p-px transition-colors select-none',
                t === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
                t === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
                e
            ),
            ...a,
            children: n(at.ScrollAreaThumb, {
                'data-slot': 'scroll-area-thumb',
                className: 'relative flex-1 rounded-full bg-border'
            })
        })
    }
    var wi = L(() => {
        qe()
        $()
        R()
    })
    var Pi = L(() => {
        $()
        R()
    })
    function Ri({ className: e, orientation: t = 'horizontal', decorative: a = !0, ...o }) {
        return n(go.Root, {
            'data-slot': 'separator',
            decorative: a,
            orientation: t,
            className: O(
                'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
                e
            ),
            ...o
        })
    }
    var ki = L(() => {
        'use client'
        qe()
        $()
        R()
    })
    function Ti({ className: e, orientation: t = 'horizontal', ...a }) {
        return n(Ct.Root, {
            'data-slot': 'tabs',
            'data-orientation': t,
            orientation: t,
            className: O('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', e),
            ...a
        })
    }
    function Ai({ className: e, variant: t = 'default', ...a }) {
        return n(Ct.List, { 'data-slot': 'tabs-list', 'data-variant': t, className: O(Rm({ variant: t }), e), ...a })
    }
    function Di({ className: e, ...t }) {
        return n(Ct.Trigger, {
            'data-slot': 'tabs-trigger',
            className: O(
                "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 group-data-[variant=default]/tabs-list:data-[state=active]:shadow-sm group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent dark:group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent',
                'data-[state=active]:bg-background data-[state=active]:text-foreground dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 dark:data-[state=active]:text-foreground',
                'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100',
                e
            ),
            ...t
        })
    }
    function Ia({ className: e, ...t }) {
        return n(Ct.Content, { 'data-slot': 'tabs-content', className: O('flex-1 outline-none', e), ...t })
    }
    var Rm,
        Mi = L(() => {
            'use client'
            sa()
            qe()
            $()
            R()
            Rm = Ye(
                'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none',
                {
                    variants: { variant: { default: 'bg-muted', line: 'gap-1 bg-transparent' } },
                    defaultVariants: { variant: 'default' }
                }
            )
        })
    var Ei = L(() => {
        $()
        R()
    })
    var Fi = L(() => {
        $()
        R()
    })
    function ba({ className: e, ...t }) {
        return n('div', {
            'data-slot': 'table-container',
            className: 'relative w-full overflow-x-auto',
            children: n('table', { 'data-slot': 'table', className: O('w-full caption-bottom text-sm', e), ...t })
        })
    }
    function Sa({ className: e, ...t }) {
        return n('thead', { 'data-slot': 'table-header', className: O('[&_tr]:border-b', e), ...t })
    }
    function ya({ className: e, ...t }) {
        return n('tbody', { 'data-slot': 'table-body', className: O('[&_tr:last-child]:border-0', e), ...t })
    }
    function Ge({ className: e, ...t }) {
        return n('tr', {
            'data-slot': 'table-row',
            className: O('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', e),
            ...t
        })
    }
    function ie({ className: e, ...t }) {
        return n('th', {
            'data-slot': 'table-head',
            className: O(
                'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
                e
            ),
            ...t
        })
    }
    function ue({ className: e, ...t }) {
        return n('td', { 'data-slot': 'table-cell', className: O('p-3 align-middle', e), ...t })
    }
    var Bi = L(() => {
        $()
        R()
    })
    var Oi = L(() => {
        $()
        R()
    })
    var Ni = L(() => {
        $()
        R()
    })
    var zi = L(() => {
        $()
        R()
    })
    var cI,
        fI,
        pI,
        mI,
        Hi = L(() => {
            qe()
            $()
            R()
            ;((cI = tt.Root), (fI = tt.Trigger), (pI = tt.Close), (mI = tt.Portal))
        })
    function Tm({ className: e, ...t }) {
        return n(Se.Overlay, {
            className: O(
                'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
                e
            ),
            ...t
        })
    }
    function _i({ className: e, ...t }) {
        return I(km, {
            children: [
                n(Tm, {}),
                n(Se.Content, {
                    className: O(
                        'fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg sm:max-w-lg',
                        e
                    ),
                    ...t
                })
            ]
        })
    }
    function Vi({ className: e, ...t }) {
        return n('div', { className: O('flex flex-col gap-2 text-center sm:text-left', e), ...t })
    }
    function Gi({ className: e, ...t }) {
        return n('div', { className: O('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', e), ...t })
    }
    function Wi({ className: e, ...t }) {
        return n(Se.Title, { className: O('text-lg font-semibold', e), ...t })
    }
    function Xi({ className: e, ...t }) {
        return n(Se.Description, { className: O('text-sm text-muted-foreground', e), ...t })
    }
    function ji({ className: e, ...t }) {
        return n(Se.Action, { className: O(pa(), e), ...t })
    }
    function Ki({ className: e, ...t }) {
        return n(Se.Cancel, { className: O(pa({ variant: 'outline' }), e), ...t })
    }
    var qi,
        Ui,
        km,
        $i = L(() => {
            qe()
            $()
            ma()
            R()
            ;((qi = Se.Root), (Ui = Se.Trigger), (km = Se.Portal))
        })
    var Zi = L(() => {
        $()
        R()
    })
    var Yi = L(() => {
        $()
        R()
    })
    var Ji = L(() => {
        'use client'
        R()
    })
    var Qi = L(() => {
        'use client'
        $()
        Xr()
        R()
    })
    var eu = L(() => {
        $()
        R()
    })
    var tu = L(() => {
        $()
        ma()
        R()
    })
    var au = L(() => {
        'use client'
        $()
        R()
    })
    function ou({ className: e, value: t, ...a }) {
        return n(fa.Root, {
            'data-slot': 'progress',
            className: O('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', e),
            ...a,
            children: n(fa.Indicator, {
                'data-slot': 'progress-indicator',
                className: 'h-full w-full flex-1 bg-primary transition-all',
                style: { transform: `translateX(-${100 - (t || 0)}%)` }
            })
        })
    }
    var ru = L(() => {
        qe()
        $()
        R()
    })
    var su = L(() => {
        'use client'
        $()
        R()
    })
    function Am(e, t) {
        let a = getComputedStyle(e),
            o = parseFloat(a.fontSize)
        return t * o
    }
    function Dm(e, t) {
        let a = getComputedStyle(e.ownerDocument.documentElement),
            o = parseFloat(a.fontSize)
        return t * o
    }
    function Mm(e) {
        return (e / 100) * window.innerHeight
    }
    function Em(e) {
        return (e / 100) * window.innerWidth
    }
    function Fm(e) {
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
    function wa({ groupSize: e, panelElement: t, styleProp: a }) {
        let o,
            [r, s] = Fm(a)
        switch (s) {
            case '%': {
                o = (r / 100) * e
                break
            }
            case 'px': {
                o = r
                break
            }
            case 'rem': {
                o = Dm(t, r)
                break
            }
            case 'em': {
                o = Am(t, r)
                break
            }
            case 'vh': {
                o = Mm(r)
                break
            }
            case 'vw': {
                o = Em(r)
                break
            }
        }
        return o
    }
    function ge(e) {
        return parseFloat(e.toFixed(3))
    }
    function aa({ group: e }) {
        let { orientation: t, panels: a } = e
        return a.reduce((o, r) => ((o += t === 'horizontal' ? r.element.offsetWidth : r.element.offsetHeight), o), 0)
    }
    function Kr(e) {
        let { panels: t } = e,
            a = aa({ group: e })
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
                  let { element: r, panelConstraints: s } = o,
                      i = 0
                  if (s.collapsedSize !== void 0) {
                      let d = wa({ groupSize: a, panelElement: r, styleProp: s.collapsedSize })
                      i = ge((d / a) * 100)
                  }
                  let l
                  if (s.defaultSize !== void 0) {
                      let d = wa({ groupSize: a, panelElement: r, styleProp: s.defaultSize })
                      l = ge((d / a) * 100)
                  }
                  let u = 0
                  if (s.minSize !== void 0) {
                      let d = wa({ groupSize: a, panelElement: r, styleProp: s.minSize })
                      u = ge((d / a) * 100)
                  }
                  let c = 100
                  if (s.maxSize !== void 0) {
                      let d = wa({ groupSize: a, panelElement: r, styleProp: s.maxSize })
                      c = ge((d / a) * 100)
                  }
                  return {
                      groupResizeBehavior: s.groupResizeBehavior,
                      collapsedSize: i,
                      collapsible: s.collapsible === !0,
                      defaultSize: l,
                      disabled: s.disabled,
                      minSize: u,
                      maxSize: c,
                      panelId: o.id
                  }
              })
    }
    function Q(e, t = 'Assertion error') {
        if (!e) throw Error(t)
    }
    function $r(e, t) {
        return Array.from(t).sort(e === 'horizontal' ? Bm : Om)
    }
    function Bm(e, t) {
        let a = e.element.offsetLeft - t.element.offsetLeft
        return a !== 0 ? a : e.element.offsetWidth - t.element.offsetWidth
    }
    function Om(e, t) {
        let a = e.element.offsetTop - t.element.offsetTop
        return a !== 0 ? a : e.element.offsetHeight - t.element.offsetHeight
    }
    function Su(e) {
        return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.ELEMENT_NODE
    }
    function yu(e, t) {
        return {
            x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(Math.abs(e.x - t.left), Math.abs(e.x - t.right)),
            y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(Math.abs(e.y - t.top), Math.abs(e.y - t.bottom))
        }
    }
    function Nm({ orientation: e, rects: t, targetRect: a }) {
        let o = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
            r,
            s = Number.MAX_VALUE
        for (let i of t) {
            let { x: l, y: u } = yu(o, i),
                c = e === 'horizontal' ? l : u
            c < s && ((s = c), (r = i))
        }
        return (Q(r, 'No rect found'), r)
    }
    function zm() {
        return (
            Io === void 0 &&
                (typeof matchMedia == 'function' ? (Io = !!matchMedia('(pointer:coarse)').matches) : (Io = !1)),
            Io
        )
    }
    function wu(e) {
        let { element: t, orientation: a, panels: o, separators: r } = e,
            s = $r(
                a,
                Array.from(t.children)
                    .filter(Su)
                    .map((x) => ({ element: x }))
            ).map(({ element: x }) => x),
            i = [],
            l = !1,
            u = !1,
            c = -1,
            d = -1,
            f = 0,
            p,
            g = []
        {
            let x = -1
            for (let m of s)
                m.hasAttribute('data-panel') &&
                    (x++, m.hasAttribute('data-disabled') || (f++, c === -1 && (c = x), (d = x)))
        }
        if (f > 1) {
            let x = -1
            for (let m of s)
                if (m.hasAttribute('data-panel')) {
                    x++
                    let h = o.find((v) => v.element === m)
                    if (h) {
                        if (p) {
                            let v = p.element.getBoundingClientRect(),
                                C = m.getBoundingClientRect(),
                                b
                            if (u) {
                                let S =
                                        a === 'horizontal'
                                            ? new DOMRect(v.right, v.top, 0, v.height)
                                            : new DOMRect(v.left, v.bottom, v.width, 0),
                                    y =
                                        a === 'horizontal'
                                            ? new DOMRect(C.left, C.top, 0, C.height)
                                            : new DOMRect(C.left, C.top, C.width, 0)
                                switch (g.length) {
                                    case 0: {
                                        b = [S, y]
                                        break
                                    }
                                    case 1: {
                                        let A = g[0],
                                            B = Nm({
                                                orientation: a,
                                                rects: [v, C],
                                                targetRect: A.element.getBoundingClientRect()
                                            })
                                        b = [A, B === v ? y : S]
                                        break
                                    }
                                    default: {
                                        b = g
                                        break
                                    }
                                }
                            } else
                                g.length
                                    ? (b = g)
                                    : (b = [
                                          a === 'horizontal'
                                              ? new DOMRect(v.right, C.top, C.left - v.right, C.height)
                                              : new DOMRect(C.left, v.bottom, C.width, C.top - v.bottom)
                                      ])
                            for (let S of b) {
                                let y = 'width' in S ? S : S.element.getBoundingClientRect(),
                                    A = zm() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine
                                if (y.width < A) {
                                    let w = A - y.width
                                    y = new DOMRect(y.x - w / 2, y.y, y.width + w, y.height)
                                }
                                if (y.height < A) {
                                    let w = A - y.height
                                    y = new DOMRect(y.x, y.y - w / 2, y.width, y.height + w)
                                }
                                let B = x <= c || x > d
                                ;(!l &&
                                    !B &&
                                    i.push({
                                        group: e,
                                        groupSize: aa({ group: e }),
                                        panels: [p, h],
                                        separator: 'width' in S ? void 0 : S,
                                        rect: y
                                    }),
                                    (l = !1))
                            }
                        }
                        ;((u = !1), (p = h), (g = []))
                    }
                } else if (m.hasAttribute('data-separator')) {
                    m.ariaDisabled !== null && (l = !0)
                    let h = r.find((v) => v.element === m)
                    h ? g.push(h) : ((p = void 0), (g = []))
                } else u = !0
        }
        return i
    }
    function St() {
        return ea
    }
    function Hm(e) {
        return Zr.addListener('change', e)
    }
    function qm(e) {
        let t = ea,
            a = { ...ea }
        ;((a.cursorFlags = e), (ea = a), Zr.emit('change', { prev: t, next: a }))
    }
    function ta(e) {
        let t = ea
        ;((ea = e), Zr.emit('change', { prev: t, next: e }))
    }
    function iu() {
        return (
            bo === void 0 &&
                ((bo = !1),
                typeof window < 'u' &&
                    (window.navigator.userAgent.includes('Chrome') || window.navigator.userAgent.includes('Firefox')) &&
                    (bo = !0)),
            bo
        )
    }
    function _m({ cursorFlags: e, groups: t, state: a }) {
        let o = 0,
            r = 0
        switch (a) {
            case 'active':
            case 'hover':
                t.forEach((s) => {
                    if (!s.mutableState.disableCursor)
                        switch (s.orientation) {
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
                    if (e && iu()) {
                        let s = (e & Pu) !== 0,
                            i = (e & Ru) !== 0,
                            l = (e & ku) !== 0,
                            u = (e & Tu) !== 0
                        if (s) return l ? 'se-resize' : u ? 'ne-resize' : 'e-resize'
                        if (i) return l ? 'sw-resize' : u ? 'nw-resize' : 'w-resize'
                        if (l) return 's-resize'
                        if (u) return 'n-resize'
                    }
                    break
                }
            }
            return iu()
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
    function Yr(e) {
        if (e.defaultView === null || e.defaultView === void 0) return
        let { prevStyle: t, styleSheet: a } = uu.get(e) ?? {}
        a === void 0 &&
            ((a = new e.defaultView.CSSStyleSheet()),
            e.adoptedStyleSheets &&
                (Object.isExtensible(e.adoptedStyleSheets)
                    ? e.adoptedStyleSheets.push(a)
                    : (e.adoptedStyleSheets = [...e.adoptedStyleSheets, a])))
        let o = St()
        switch (o.state) {
            case 'active':
            case 'hover': {
                let r = _m({ cursorFlags: o.cursorFlags, groups: o.hitRegions.map((i) => i.group), state: o.state }),
                    s = `*, *:hover {cursor: ${r} !important; }`
                if (t === s) return
                ;((t = s),
                    r
                        ? a.cssRules.length === 0
                            ? a.insertRule(s)
                            : a.replaceSync(s)
                        : a.cssRules.length === 1 && a.deleteRule(0))
                break
            }
            case 'inactive': {
                ;((t = void 0), a.cssRules.length === 1 && a.deleteRule(0))
                break
            }
        }
        uu.set(e, { prevStyle: t, styleSheet: a })
    }
    function Vm(e) {
        ;((Ee = new Map(Ee)), Ee.delete(e))
    }
    function du(e, t) {
        for (let [a] of Ee) if (a.id === e) return a
    }
    function ut(e, t) {
        for (let [a, o] of Ee) if (a.id === e) return o
        if (t) throw Error(`Could not find data for Group with id ${e}`)
    }
    function Pt() {
        return Ee
    }
    function Jr(e, t) {
        return Au.addListener('groupChange', (a) => {
            a.group.id === e && t(a)
        })
    }
    function We(e, t, a) {
        let o = Ee.get(e)
        ;((Ee = new Map(Ee)),
            Ee.set(e, t),
            Au.emit('groupChange', { group: e, isUserInteraction: a?.isUserInteraction === !0, prev: o, next: t }))
    }
    function Du(e) {
        let t = St(),
            a = !1
        return (
            t.state === 'active' &&
                (ta({ cursorFlags: 0, state: 'inactive' }),
                t.hitRegions.length > 0 &&
                    (Yr(e),
                    (a = !0),
                    t.hitRegions.forEach((o) => {
                        let r = ut(o.group.id, !0)
                        We(o.group, r, { isUserInteraction: !0 })
                    }))),
            a
        )
    }
    function cu(e) {
        e.defaultPrevented || Du(e.currentTarget)
    }
    function Gm(e, t, a) {
        let o,
            r = { x: 1 / 0, y: 1 / 0 }
        for (let s of t) {
            let i = yu(a, s.rect)
            switch (e) {
                case 'horizontal': {
                    i.x <= r.x && ((o = s), (r = i))
                    break
                }
                case 'vertical': {
                    i.y <= r.y && ((o = s), (r = i))
                    break
                }
            }
        }
        return o ? { distance: r, hitRegion: o } : void 0
    }
    function Wm(e) {
        return e !== null && typeof e == 'object' && 'nodeType' in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE
    }
    function Xm(e, t) {
        if (e === t) throw new Error('Cannot compare node with itself')
        let a = { a: mu(e), b: mu(t) },
            o
        for (; a.a.at(-1) === a.b.at(-1); ) ((o = a.a.pop()), a.b.pop())
        Q(o, 'Stacking order can only be calculated for elements with a common ancestor')
        let r = { a: pu(fu(a.a)), b: pu(fu(a.b)) }
        if (r.a === r.b) {
            let s = o.childNodes,
                i = { a: a.a.at(-1), b: a.b.at(-1) },
                l = s.length
            for (; l--; ) {
                let u = s[l]
                if (u === i.a) return 1
                if (u === i.b) return -1
            }
        }
        return Math.sign(r.a - r.b)
    }
    function Km(e) {
        let t = getComputedStyle(Mu(e) ?? e).display
        return t === 'flex' || t === 'inline-flex'
    }
    function $m(e) {
        let t = getComputedStyle(e)
        return !!(
            t.position === 'fixed' ||
            (t.zIndex !== 'auto' && (t.position !== 'static' || Km(e))) ||
            +t.opacity < 1 ||
            ('transform' in t && t.transform !== 'none') ||
            ('webkitTransform' in t && t.webkitTransform !== 'none') ||
            ('mixBlendMode' in t && t.mixBlendMode !== 'normal') ||
            ('filter' in t && t.filter !== 'none') ||
            ('webkitFilter' in t && t.webkitFilter !== 'none') ||
            ('isolation' in t && t.isolation === 'isolate') ||
            jm.test(t.willChange) ||
            t.webkitOverflowScrolling === 'touch'
        )
    }
    function fu(e) {
        let t = e.length
        for (; t--; ) {
            let a = e[t]
            if ((Q(a, 'Missing node'), $m(a))) return a
        }
        return null
    }
    function pu(e) {
        return (e && Number(getComputedStyle(e).zIndex)) || 0
    }
    function mu(e) {
        let t = []
        for (; e; ) (t.push(e), (e = Mu(e)))
        return t
    }
    function Mu(e) {
        let { parentNode: t } = e
        return Wm(t) ? t.host : t
    }
    function Zm(e, t) {
        return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y
    }
    function Ym({ groupElement: e, hitRegion: t, pointerEventTarget: a }) {
        if (!Su(a) || a.contains(e) || e.contains(a)) return !0
        if (Xm(a, e) > 0) {
            let o = a
            for (; o; ) {
                if (o.contains(e)) return !0
                if (Zm(o.getBoundingClientRect(), t)) return !1
                o = o.parentElement
            }
        }
        return !0
    }
    function Qr(e, t) {
        let a = []
        return (
            t.forEach((o, r) => {
                if (r.disabled) return
                let s = wu(r),
                    i = Gm(r.orientation, s, { x: e.clientX, y: e.clientY })
                i &&
                    i.distance.x <= 0 &&
                    i.distance.y <= 0 &&
                    Ym({ groupElement: r.element, hitRegion: i.hitRegion.rect, pointerEventTarget: e.target }) &&
                    a.push(i.hitRegion)
            }),
            a
        )
    }
    function Jm(e, t) {
        if (e.length !== t.length) return !1
        for (let a = 0; a < e.length; a++) if (e[a] != t[a]) return !1
        return !0
    }
    function fe(e, t, a = 0) {
        return Math.abs(ge(e) - ge(t)) <= a
    }
    function Me(e, t) {
        return fe(e, t) ? 0 : e > t ? 1 : -1
    }
    function Qt({ overrideDisabledPanels: e, panelConstraints: t, prevSize: a, size: o }) {
        let { collapsedSize: r = 0, collapsible: s, disabled: i, maxSize: l = 100, minSize: u = 0 } = t
        if (i && !e) return a
        if (Me(o, u) < 0)
            if (s) {
                let c = (r + u) / 2
                Me(o, c) < 0 ? (o = r) : (o = u)
            } else o = u
        return ((o = Math.min(l, o)), (o = ge(o)), o)
    }
    function Ra({ delta: e, initialLayout: t, panelConstraints: a, pivotIndices: o, prevLayout: r, trigger: s }) {
        if (fe(e, 0)) return t
        let i = s === 'imperative-api',
            l = Object.values(t),
            u = Object.values(r),
            c = [...l],
            [d, f] = o
        ;(Q(d != null, 'Invalid first pivot index'), Q(f != null, 'Invalid second pivot index'))
        let p = 0
        switch (s) {
            case 'keyboard': {
                {
                    let m = e < 0 ? f : d,
                        h = a[m]
                    Q(h, `Panel constraints not found for index ${m}`)
                    let { collapsedSize: v = 0, collapsible: C, minSize: b = 0 } = h
                    if (C) {
                        let S = l[m]
                        if ((Q(S != null, `Previous layout not found for panel index ${m}`), fe(S, v))) {
                            let y = b - S
                            Me(y, Math.abs(e)) > 0 && (e = e < 0 ? 0 - y : y)
                        }
                    }
                }
                {
                    let m = e < 0 ? d : f,
                        h = a[m]
                    Q(h, `No panel constraints found for index ${m}`)
                    let { collapsedSize: v = 0, collapsible: C, minSize: b = 0 } = h
                    if (C) {
                        let S = l[m]
                        if ((Q(S != null, `Previous layout not found for panel index ${m}`), fe(S, b))) {
                            let y = S - v
                            Me(y, Math.abs(e)) > 0 && (e = e < 0 ? 0 - y : y)
                        }
                    }
                }
                break
            }
            default: {
                let m = e < 0 ? f : d,
                    h = a[m]
                Q(h, `Panel constraints not found for index ${m}`)
                let v = l[m],
                    { collapsible: C, collapsedSize: b, minSize: S } = h
                if (C && Me(v, S) < 0)
                    if (e > 0) {
                        let y = S - b,
                            A = y / 2,
                            B = v + e
                        Me(B, S) < 0 && (e = Me(e, A) <= 0 ? 0 : y)
                    } else {
                        let y = S - b,
                            A = 100 - y / 2,
                            B = v - e
                        Me(B, S) < 0 && (e = Me(100 + e, A) > 0 ? 0 : -y)
                    }
                break
            }
        }
        {
            let m = e < 0 ? 1 : -1,
                h = e < 0 ? f : d,
                v = 0
            for (;;) {
                let b = l[h]
                Q(b != null, `Previous layout not found for panel index ${h}`)
                let S = Qt({ overrideDisabledPanels: i, panelConstraints: a[h], prevSize: b, size: 100 }) - b
                if (((v += S), (h += m), h < 0 || h >= a.length)) break
            }
            let C = Math.min(Math.abs(e), Math.abs(v))
            e = e < 0 ? 0 - C : C
        }
        {
            let m = e < 0 ? d : f
            for (; m >= 0 && m < a.length; ) {
                let h = Math.abs(e) - Math.abs(p),
                    v = l[m]
                Q(v != null, `Previous layout not found for panel index ${m}`)
                let C = v - h,
                    b = Qt({ overrideDisabledPanels: i, panelConstraints: a[m], prevSize: v, size: C })
                if (
                    !fe(v, b) &&
                    ((p += v - b),
                    (c[m] = b),
                    p.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, { numeric: !0 }) >= 0)
                )
                    break
                e < 0 ? m-- : m++
            }
        }
        if (Jm(u, c)) return r
        {
            let m = e < 0 ? f : d,
                h = l[m]
            Q(h != null, `Previous layout not found for panel index ${m}`)
            let v = h + p,
                C = Qt({ overrideDisabledPanels: i, panelConstraints: a[m], prevSize: h, size: v })
            if (((c[m] = C), !fe(C, v))) {
                let b = v - C,
                    S = e < 0 ? f : d
                for (; S >= 0 && S < a.length; ) {
                    let y = c[S]
                    Q(y != null, `Previous layout not found for panel index ${S}`)
                    let A = y + b,
                        B = Qt({ overrideDisabledPanels: i, panelConstraints: a[S], prevSize: y, size: A })
                    if ((fe(y, B) || ((b -= B - y), (c[S] = B)), fe(b, 0))) break
                    e > 0 ? S-- : S++
                }
            }
        }
        let g = Object.values(c).reduce((m, h) => h + m, 0)
        if (!fe(g, 100, 0.1)) return r
        let x = Object.keys(r)
        return c.reduce((m, h, v) => ((m[x[v]] = h), m), {})
    }
    function yt(e, t) {
        if (Object.keys(e).length !== Object.keys(t).length) return !1
        for (let a in e) if (t[a] === void 0 || Me(e[a], t[a]) !== 0) return !1
        return !0
    }
    function wt({ layout: e, panelConstraints: t }) {
        let a = Object.values(e),
            o = [...a],
            r = o.reduce((l, u) => l + u, 0)
        if (o.length !== t.length) throw Error(`Invalid ${t.length} panel layout: ${o.map((l) => `${l}%`).join(', ')}`)
        if (!fe(r, 100) && o.length > 0)
            for (let l = 0; l < t.length; l++) {
                let u = o[l]
                Q(u != null, `No layout data found for index ${l}`)
                let c = (100 / r) * u
                o[l] = c
            }
        let s = 0
        for (let l = 0; l < t.length; l++) {
            let u = a[l]
            Q(u != null, `No layout data found for index ${l}`)
            let c = o[l]
            Q(c != null, `No layout data found for index ${l}`)
            let d = Qt({ overrideDisabledPanels: !0, panelConstraints: t[l], prevSize: u, size: c })
            c != d && ((s += c - d), (o[l] = d))
        }
        if (!fe(s, 0))
            for (let l = 0; l < t.length; l++) {
                let u = o[l]
                Q(u != null, `No layout data found for index ${l}`)
                let c = u + s,
                    d = Qt({ overrideDisabledPanels: !0, panelConstraints: t[l], prevSize: u, size: c })
                if (u !== d && ((s -= d - u), (o[l] = d), fe(s, 0))) break
            }
        let i = Object.keys(e)
        return o.reduce((l, u, c) => ((l[i[c]] = u), l), {})
    }
    function Eu({ groupId: e, panelId: t }) {
        let a = () => {
                let u = Pt()
                for (let [
                    c,
                    {
                        defaultLayoutDeferred: d,
                        derivedPanelConstraints: f,
                        layout: p,
                        groupSize: g,
                        separatorToPanels: x
                    }
                ] of u)
                    if (c.id === e)
                        return {
                            defaultLayoutDeferred: d,
                            derivedPanelConstraints: f,
                            group: c,
                            groupSize: g,
                            layout: p,
                            separatorToPanels: x
                        }
                throw Error(`Group ${e} not found`)
            },
            o = () => {
                let u = a().derivedPanelConstraints.find((c) => c.panelId === t)
                if (u !== void 0) return u
                throw Error(`Panel constraints not found for Panel ${t}`)
            },
            r = () => {
                let u = a().group.panels.find((c) => c.id === t)
                if (u !== void 0) return u
                throw Error(`Layout not found for Panel ${t}`)
            },
            s = () => {
                let u = a().layout[t]
                if (u !== void 0) return u
                throw Error(`Layout not found for Panel ${t}`)
            },
            i = ({ nextSize: u, panels: c, prevLayout: d, derivedPanelConstraints: f }) => {
                let p = s(),
                    g = c.findIndex((h) => h.id === t),
                    x = g === 0,
                    m = g === c.length - 1
                if (
                    m &&
                    u < p &&
                    (x ||
                        c.slice(0, g).every((h, v) => {
                            let C = f[v]
                            return C?.collapsible && fe(C.collapsedSize, d[C.panelId])
                        }))
                ) {
                    let h = c.slice(0, g).reduce((v, C) => v + d[C.id], 0)
                    return { ...d, [t]: ge(100 - h) }
                }
                return Ra({
                    delta: m ? p - u : u - p,
                    initialLayout: d,
                    panelConstraints: f,
                    pivotIndices: m ? [g - 1, g] : [g, g + 1],
                    prevLayout: d,
                    trigger: 'imperative-api'
                })
            },
            l = (u) => {
                let c = s()
                if (u === c) return
                let {
                        defaultLayoutDeferred: d,
                        derivedPanelConstraints: f,
                        group: p,
                        groupSize: g,
                        layout: x,
                        separatorToPanels: m
                    } = a(),
                    h = i({ nextSize: u, panels: p.panels, prevLayout: x, derivedPanelConstraints: f }),
                    v = wt({ layout: h, panelConstraints: f })
                yt(x, v) ||
                    We(p, {
                        defaultLayoutDeferred: d,
                        derivedPanelConstraints: f,
                        groupSize: g,
                        layout: v,
                        separatorToPanels: m
                    })
            }
        return {
            collapse: () => {
                let { collapsible: u, collapsedSize: c } = o(),
                    { mutableValues: d } = r(),
                    f = s()
                u && f !== c && ((d.expandToSize = f), l(c))
            },
            expand: () => {
                let { collapsible: u, collapsedSize: c, minSize: d } = o(),
                    { mutableValues: f } = r(),
                    p = s()
                if (u && p === c) {
                    let g = f.expandToSize ?? d
                    ;(g === 0 && (g = 1), l(g))
                }
            },
            getSize: () => {
                let { group: u } = a(),
                    c = s(),
                    { element: d } = r(),
                    f = u.orientation === 'horizontal' ? d.offsetWidth : d.offsetHeight
                return { asPercentage: c, inPixels: f }
            },
            isCollapsed: () => {
                let { collapsible: u, collapsedSize: c } = o(),
                    d = s()
                return u && fe(c, d)
            },
            resize: (u) => {
                let { group: c } = a(),
                    { element: d } = r(),
                    f = aa({ group: c }),
                    p = wa({ groupSize: f, panelElement: d, styleProp: u }),
                    g = ge((p / f) * 100)
                l(g)
            }
        }
    }
    function gu(e) {
        if (e.defaultPrevented) return
        let t = Pt()
        Qr(e, t).forEach((a) => {
            if (a.separator && !a.separator.disableDoubleClick) {
                let o = a.panels.find((r) => r.panelConstraints.defaultSize !== void 0)
                if (o) {
                    let r = o.panelConstraints.defaultSize,
                        s = Eu({ groupId: a.group.id, panelId: o.id })
                    s && r !== void 0 && (s.resize(r), e.preventDefault())
                }
            }
        })
    }
    function So(e) {
        let t = Pt()
        for (let [a] of t) if (a.separators.some((o) => o.element === e)) return a
        throw Error('Could not find parent Group for separator element')
    }
    function Fu({ groupId: e }) {
        let t = () => {
            let a = Pt()
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
                        group: s,
                        groupSize: i,
                        layout: l,
                        separatorToPanels: u
                    } = t(),
                    c = wt({ layout: a, panelConstraints: r })
                return o
                    ? l
                    : (yt(l, c) ||
                          We(s, {
                              defaultLayoutDeferred: o,
                              derivedPanelConstraints: r,
                              groupSize: i,
                              layout: c,
                              separatorToPanels: u
                          }),
                      c)
            }
        }
    }
    function bt(e, t) {
        let a = So(e),
            o = ut(a.id, !0),
            r = a.separators.find((d) => d.element === e)
        Q(r, 'Matching separator not found')
        let s = o.separatorToPanels.get(r)
        Q(s, 'Matching panels not found')
        let i = s.map((d) => a.panels.indexOf(d)),
            l = Fu({ groupId: a.id }).getLayout(),
            u = Ra({
                delta: t,
                initialLayout: l,
                panelConstraints: o.derivedPanelConstraints,
                pivotIndices: i,
                prevLayout: l,
                trigger: 'keyboard'
            }),
            c = wt({ layout: u, panelConstraints: o.derivedPanelConstraints })
        yt(l, c) ||
            We(
                a,
                {
                    defaultLayoutDeferred: o.defaultLayoutDeferred,
                    derivedPanelConstraints: o.derivedPanelConstraints,
                    groupSize: o.groupSize,
                    layout: c,
                    separatorToPanels: o.separatorToPanels
                },
                { isUserInteraction: !0 }
            )
    }
    function hu(e) {
        if (e.defaultPrevented) return
        let t = e.currentTarget,
            a = So(t)
        if (!a.disabled)
            switch (e.key) {
                case 'ArrowDown': {
                    ;(e.preventDefault(), a.orientation === 'vertical' && bt(t, 5))
                    break
                }
                case 'ArrowLeft': {
                    ;(e.preventDefault(), a.orientation === 'horizontal' && bt(t, -5))
                    break
                }
                case 'ArrowRight': {
                    ;(e.preventDefault(), a.orientation === 'horizontal' && bt(t, 5))
                    break
                }
                case 'ArrowUp': {
                    ;(e.preventDefault(), a.orientation === 'vertical' && bt(t, -5))
                    break
                }
                case 'End': {
                    ;(e.preventDefault(), bt(t, 100))
                    break
                }
                case 'Enter': {
                    e.preventDefault()
                    let o = So(t),
                        r = ut(o.id, !0),
                        { derivedPanelConstraints: s, layout: i, separatorToPanels: l } = r,
                        u = o.separators.find((p) => p.element === t)
                    Q(u, 'Matching separator not found')
                    let c = l.get(u)
                    Q(c, 'Matching panels not found')
                    let d = c[0],
                        f = s.find((p) => p.panelId === d.id)
                    if ((Q(f, 'Panel metadata not found'), f.collapsible)) {
                        let p = i[d.id],
                            g =
                                f.collapsedSize === p
                                    ? (o.mutableState.expandedPanelSizes[d.id] ?? f.minSize)
                                    : f.collapsedSize
                        bt(t, g - p)
                    }
                    break
                }
                case 'F6': {
                    e.preventDefault()
                    let o = So(t).separators.map((i) => i.element),
                        r = Array.from(o).findIndex((i) => i === e.currentTarget)
                    Q(r !== null, 'Index not found')
                    let s = e.shiftKey ? (r > 0 ? r - 1 : o.length - 1) : r + 1 < o.length ? r + 1 : 0
                    o[s].focus({ preventScroll: !0 })
                    break
                }
                case 'Home': {
                    ;(e.preventDefault(), bt(t, -100))
                    break
                }
            }
    }
    function xu(e) {
        if (e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0)) return
        let t = Pt(),
            a = Qr(e, t),
            o = new Map(),
            r = !1
        ;(a.forEach((s) => {
            s.separator && (r || ((r = !0), s.separator.element.focus({ focusVisible: !1, preventScroll: !0 })))
            let i = t.get(s.group)
            i && o.set(s.group, i.layout)
        }),
            ta({
                cursorFlags: 0,
                hitRegions: a,
                initialLayoutMap: o,
                pointerDownAtPoint: { x: e.clientX, y: e.clientY },
                state: 'active'
            }),
            a.length && e.preventDefault())
    }
    function Bu({
        document: e,
        event: t,
        hitRegions: a,
        initialLayoutMap: o,
        mountedGroups: r,
        pointerDownAtPoint: s,
        prevCursorFlags: i
    }) {
        let l = 0
        a.forEach((c) => {
            let { group: d, groupSize: f } = c,
                { orientation: p, panels: g } = d,
                { disableCursor: x } = d.mutableState,
                m = 0
            s
                ? p === 'horizontal'
                    ? (m = ((t.clientX - s.x) / f) * 100)
                    : (m = ((t.clientY - s.y) / f) * 100)
                : p === 'horizontal'
                  ? (m = t.clientX < 0 ? -100 : 100)
                  : (m = t.clientY < 0 ? -100 : 100)
            let h = o.get(d),
                v = r.get(d)
            if (!h || !v) return
            let {
                defaultLayoutDeferred: C,
                derivedPanelConstraints: b,
                groupSize: S,
                layout: y,
                separatorToPanels: A
            } = v
            if (b && y && A) {
                let B = Ra({
                    delta: m,
                    initialLayout: h,
                    panelConstraints: b,
                    pivotIndices: c.panels.map((w) => g.indexOf(w)),
                    prevLayout: y,
                    trigger: 'mouse-or-touch'
                })
                if (yt(B, y)) {
                    if (m !== 0 && !x)
                        switch (p) {
                            case 'horizontal': {
                                l |= m < 0 ? Pu : Ru
                                break
                            }
                            case 'vertical': {
                                l |= m < 0 ? ku : Tu
                                break
                            }
                        }
                } else
                    We(c.group, {
                        defaultLayoutDeferred: C,
                        derivedPanelConstraints: b,
                        groupSize: S,
                        layout: B,
                        separatorToPanels: A
                    })
            }
        })
        let u = 0
        ;(t.movementX === 0 ? (u |= i & nu) : (u |= l & nu),
            t.movementY === 0 ? (u |= i & lu) : (u |= l & lu),
            qm(u),
            Yr(e))
    }
    function vu(e) {
        let t = Pt(),
            a = St()
        a.state === 'active' &&
            Bu({
                document: e.currentTarget,
                event: e,
                hitRegions: a.hitRegions,
                initialLayoutMap: a.initialLayoutMap,
                mountedGroups: t,
                prevCursorFlags: a.cursorFlags
            })
    }
    function Lu(e) {
        if (e.defaultPrevented) return
        let t = St(),
            a = Pt()
        switch (t.state) {
            case 'active': {
                if (e.buttons === 0) {
                    ;(ta({ cursorFlags: 0, state: 'inactive' }),
                        t.hitRegions.forEach((o) => {
                            let r = ut(o.group.id, !0)
                            We(o.group, r, { isUserInteraction: !0 })
                        }))
                    return
                }
                for (let o of t.hitRegions)
                    if (o.separator) {
                        let { element: r } = o.separator
                        r.hasPointerCapture?.(e.pointerId) || r.setPointerCapture?.(e.pointerId)
                    }
                Bu({
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
                let o = Qr(e, a)
                ;(o.length === 0
                    ? t.state !== 'inactive' && ta({ cursorFlags: 0, state: 'inactive' })
                    : ta({ cursorFlags: 0, hitRegions: o, state: 'hover' }),
                    Yr(e.currentTarget))
                break
            }
        }
    }
    function Cu(e) {
        e.relatedTarget instanceof HTMLIFrameElement &&
            St().state === 'hover' &&
            ta({ cursorFlags: 0, state: 'inactive' })
    }
    function Iu(e) {
        e.defaultPrevented || (e.pointerType === 'mouse' && e.button > 0) || (Du(e.currentTarget) && e.preventDefault())
    }
    function bu(e) {
        let t = 0,
            a = 0,
            o = {}
        for (let s of e)
            if (s.defaultSize !== void 0) {
                t++
                let i = ge(s.defaultSize)
                ;((a += i), (o[s.panelId] = i))
            } else o[s.panelId] = void 0
        let r = e.length - t
        if (r !== 0) {
            let s = ge((100 - a) / r)
            for (let i of e) i.defaultSize === void 0 && (o[i.panelId] = s)
        }
        return o
    }
    function Qm(e, t, a) {
        if (!a[0]) return
        let o = e.panels.find((u) => u.element === t)
        if (!o || !o.onResize) return
        let r = aa({ group: e }),
            s = e.orientation === 'horizontal' ? o.element.offsetWidth : o.element.offsetHeight,
            i = o.mutableValues.prevSize,
            l = { asPercentage: ge((s / r) * 100), inPixels: s }
        ;((o.mutableValues.prevSize = l), o.onResize(l, o.id, i))
    }
    function eg(e, t) {
        if (Object.keys(e).length !== Object.keys(t).length) return !1
        for (let a in e) if (e[a] !== t[a]) return !1
        return !0
    }
    function tg({ group: e, nextGroupSize: t, prevGroupSize: a, prevLayout: o }) {
        if (a <= 0 || t <= 0 || a === t) return o
        let r = 0,
            s = 0,
            i = !1,
            l = new Map(),
            u = []
        for (let f of e.panels) {
            let p = o[f.id] ?? 0
            if (f.panelConstraints.groupResizeBehavior === 'preserve-pixel-size') {
                i = !0
                let g = (p / 100) * a,
                    x = ge((g / t) * 100)
                ;(l.set(f.id, x), (r += x))
            } else (u.push(f.id), (s += p))
        }
        if (!i || u.length === 0) return o
        let c = 100 - r,
            d = { ...o }
        if (
            (l.forEach((f, p) => {
                d[p] = f
            }),
            s > 0)
        )
            for (let f of u) {
                let p = o[f] ?? 0
                d[f] = ge((p / s) * c)
            }
        else {
            let f = ge(c / u.length)
            for (let p of u) d[p] = f
        }
        return d
    }
    function ag(e, t) {
        let a = e.map((r) => r.id),
            o = Object.keys(t)
        if (a.length !== o.length) return !1
        for (let r of a) if (!o.includes(r)) return !1
        return !0
    }
    function og(e) {
        let t = !0
        Q(e.element.ownerDocument.defaultView, 'Cannot register an unmounted Group')
        let a = e.element.ownerDocument.defaultView.ResizeObserver,
            o = new Set(),
            r = new Set(),
            s = new a((x) => {
                for (let m of x) {
                    let { borderBoxSize: h, target: v } = m
                    if (v === e.element) {
                        if (t) {
                            let C = aa({ group: e })
                            if (C === 0) return
                            let b = ut(e.id)
                            if (!b) return
                            let S = Kr(e),
                                y = b.defaultLayoutDeferred ? bu(S) : b.layout,
                                A = tg({ group: e, nextGroupSize: C, prevGroupSize: b.groupSize, prevLayout: y }),
                                B = wt({ layout: A, panelConstraints: S })
                            if (
                                !b.defaultLayoutDeferred &&
                                yt(b.layout, B) &&
                                eg(b.derivedPanelConstraints, S) &&
                                b.groupSize === C
                            )
                                return
                            We(e, {
                                defaultLayoutDeferred: !1,
                                derivedPanelConstraints: S,
                                groupSize: C,
                                layout: B,
                                separatorToPanels: b.separatorToPanels
                            })
                        }
                    } else Qm(e, v, h)
                }
            })
        ;(s.observe(e.element),
            e.panels.forEach((x) => {
                ;(Q(!o.has(x.id), `Panel ids must be unique; id "${x.id}" was used more than once`),
                    o.add(x.id),
                    x.onResize && s.observe(x.element))
            }))
        let i = aa({ group: e }),
            l = Kr(e),
            u = e.panels.map(({ id: x }) => x).join(','),
            c = e.mutableState.defaultLayout
        c && (ag(e.panels, c) || (c = void 0))
        let d = e.mutableState.layouts[u] ?? c ?? bu(l),
            f = wt({ layout: d, panelConstraints: l }),
            p = e.element.ownerDocument
        Jt.set(p, (Jt.get(p) ?? 0) + 1)
        let g = new Map()
        return (
            wu(e).forEach((x) => {
                x.separator && g.set(x.separator, x.panels)
            }),
            We(e, {
                defaultLayoutDeferred: i === 0,
                derivedPanelConstraints: l,
                groupSize: i,
                layout: f,
                separatorToPanels: g
            }),
            e.separators.forEach((x) => {
                ;(Q(!r.has(x.id), `Separator ids must be unique; id "${x.id}" was used more than once`),
                    r.add(x.id),
                    x.element.addEventListener('keydown', hu))
            }),
            Jt.get(p) === 1 &&
                (p.addEventListener('contextmenu', cu, !0),
                p.addEventListener('dblclick', gu, !0),
                p.addEventListener('pointerdown', xu, !0),
                p.addEventListener('pointerleave', vu),
                p.addEventListener('pointermove', Lu),
                p.addEventListener('pointerout', Cu),
                p.addEventListener('pointerup', Iu, !0)),
            function () {
                ;((t = !1),
                    Jt.set(p, Math.max(0, (Jt.get(p) ?? 0) - 1)),
                    Vm(e),
                    e.separators.forEach((x) => {
                        x.element.removeEventListener('keydown', hu)
                    }),
                    Jt.get(p) ||
                        (p.removeEventListener('contextmenu', cu, !0),
                        p.removeEventListener('dblclick', gu, !0),
                        p.removeEventListener('pointerdown', xu, !0),
                        p.removeEventListener('pointerleave', vu),
                        p.removeEventListener('pointermove', Lu),
                        p.removeEventListener('pointerout', Cu),
                        p.removeEventListener('pointerup', Iu, !0)),
                    s.disconnect())
            }
        )
    }
    function rg() {
        let [e, t] = N({}),
            a = W(() => t({}), [])
        return [e, a]
    }
    function es(e) {
        let t = Do()
        return `${e ?? t}`
    }
    function Pa(e) {
        let t = k(e)
        return (
            Rt(() => {
                t.current = e
            }, [e]),
            W((...a) => t.current?.(...a), [t])
        )
    }
    function ts(...e) {
        return Pa((t) => {
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
    function as(e) {
        let t = k({ ...e })
        return (
            Rt(() => {
                for (let a in e) t.current[a] = e[a]
            }, [e]),
            t.current
        )
    }
    function sg(e, t) {
        let a = k({ getLayout: () => ({}), setLayout: Um })
        ;(Ea(t, () => a.current, []),
            Rt(() => {
                Object.assign(a.current, Fu({ groupId: e }))
            }))
    }
    function Nu({
        children: e,
        className: t,
        defaultLayout: a,
        disableCursor: o,
        disabled: r,
        elementRef: s,
        groupRef: i,
        id: l,
        onLayoutChange: u,
        onLayoutChanged: c,
        orientation: d = 'horizontal',
        resizeTargetMinimumSize: f = { coarse: 20, fine: 10 },
        style: p,
        ...g
    }) {
        let x = k({ onLayoutChange: {}, onLayoutChanged: {} }),
            m = Pa((z) => {
                yt(x.current.onLayoutChange, z) || ((x.current.onLayoutChange = z), u?.(z))
            }),
            h = Pa((z, q) => {
                yt(x.current.onLayoutChanged, z) || ((x.current.onLayoutChanged = z), c?.(z, { isUserInteraction: q }))
            }),
            v = es(l),
            C = k(null),
            [b, S] = rg(),
            y = k({ lastExpandedPanelSizes: {}, layouts: {}, panels: [], resizeTargetMinimumSize: f, separators: [] }),
            A = ts(C, s)
        sg(v, i)
        let B = Pa((z, q) => {
                let ee = St(),
                    X = du(z),
                    te = ut(z)
                if (te) {
                    let Y = !1
                    return (
                        ee.state === 'active' && (Y = ee.hitRegions.some((Le) => Le.group === X)),
                        { flexGrow: te.layout[q] ?? 1, pointerEvents: Y ? 'none' : void 0 }
                    )
                }
                if (a?.[q]) return { flexGrow: a?.[q] }
            }),
            w = as({ defaultLayout: a, disableCursor: o }),
            D = he(
                () => ({
                    get disableCursor() {
                        return !!w.disableCursor
                    },
                    getPanelStyles: B,
                    id: v,
                    orientation: d,
                    registerPanel: (z) => {
                        let q = y.current
                        return (
                            (q.panels = $r(d, [...q.panels, z])),
                            S(),
                            () => {
                                ;((q.panels = q.panels.filter((ee) => ee !== z)), S())
                            }
                        )
                    },
                    registerSeparator: (z) => {
                        let q = y.current
                        return (
                            (q.separators = $r(d, [...q.separators, z])),
                            S(),
                            () => {
                                ;((q.separators = q.separators.filter((ee) => ee !== z)), S())
                            }
                        )
                    },
                    updatePanelProps: (z, { disabled: q }) => {
                        let ee = y.current.panels.find((Y) => Y.id === z)
                        ee && (ee.panelConstraints.disabled = q)
                        let X = du(v),
                            te = ut(v)
                        X && te && We(X, { ...te, derivedPanelConstraints: Kr(X) })
                    },
                    updateSeparatorProps: (z, { disabled: q, disableDoubleClick: ee }) => {
                        let X = y.current.separators.find((te) => te.id === z)
                        X && ((X.disabled = q), (X.disableDoubleClick = ee))
                    }
                }),
                [B, v, S, d, w]
            ),
            G = k(null)
        return (
            Rt(() => {
                let z = C.current
                if (z === null) return
                let q = y.current,
                    ee
                if (w.defaultLayout !== void 0 && Object.keys(w.defaultLayout).length === q.panels.length) {
                    ee = {}
                    for (let Ce of q.panels) {
                        let Fe = w.defaultLayout[Ce.id]
                        Fe !== void 0 && (ee[Ce.id] = Fe)
                    }
                }
                let X = {
                    disabled: !!r,
                    element: z,
                    id: v,
                    mutableState: {
                        defaultLayout: ee,
                        disableCursor: !!w.disableCursor,
                        expandedPanelSizes: y.current.lastExpandedPanelSizes,
                        layouts: y.current.layouts
                    },
                    orientation: d,
                    panels: q.panels,
                    resizeTargetMinimumSize: q.resizeTargetMinimumSize,
                    separators: q.separators
                }
                G.current = X
                let te = og(X),
                    { defaultLayoutDeferred: Y, derivedPanelConstraints: Le, layout: H } = ut(X.id, !0)
                !Y && Le.length > 0 && (m(H), h(H, !1))
                let je = Jr(v, (Ce) => {
                    let { defaultLayoutDeferred: Fe, derivedPanelConstraints: kt, layout: se } = Ce.next
                    if (Fe || kt.length === 0) return
                    let pe = X.panels.map(({ id: Ie }) => Ie).join(',')
                    ;((X.mutableState.layouts[pe] = se),
                        kt.forEach((Ie) => {
                            if (Ie.collapsible) {
                                let { layout: re } = Ce.prev ?? {}
                                if (re) {
                                    let Aa = fe(Ie.collapsedSize, se[Ie.panelId]),
                                        At = fe(Ie.collapsedSize, re[Ie.panelId])
                                    Aa && !At && (X.mutableState.expandedPanelSizes[Ie.panelId] = re[Ie.panelId])
                                }
                            }
                        }))
                    let Tt = St().state !== 'active'
                    ;(m(se), Tt && h(se, Ce.isUserInteraction))
                })
                return () => {
                    ;((G.current = null), te(), je())
                }
            }, [r, v, h, m, d, b, w]),
            M(() => {
                let z = G.current
                z && ((z.mutableState.defaultLayout = a), (z.mutableState.disableCursor = !!o))
            }),
            n(Ou.Provider, {
                value: D,
                children: n('div', {
                    ...g,
                    className: t,
                    'data-group': !0,
                    'data-testid': v,
                    id: v,
                    ref: A,
                    style: {
                        height: '100%',
                        width: '100%',
                        overflow: 'hidden',
                        ...p,
                        display: 'flex',
                        flexDirection: d === 'horizontal' ? 'row' : 'column',
                        flexWrap: 'nowrap',
                        touchAction: d === 'horizontal' ? 'pan-y' : 'pan-x'
                    },
                    children: e
                })
            })
        )
    }
    function os() {
        let e = me(Ou)
        return (Q(e, 'Group Context not found; did you render a Panel or Separator outside of a Group?'), e)
    }
    function ng(e, t) {
        let { id: a } = os(),
            o = k({
                collapse: jr,
                expand: jr,
                getSize: () => ({ asPercentage: 0, inPixels: 0 }),
                isCollapsed: () => !1,
                resize: jr
            })
        ;(Ea(t, () => o.current, []),
            Rt(() => {
                Object.assign(o.current, Eu({ groupId: a, panelId: e }))
            }))
    }
    function zu({
        children: e,
        className: t,
        collapsedSize: a = '0%',
        collapsible: o = !1,
        defaultSize: r,
        disabled: s,
        elementRef: i,
        groupResizeBehavior: l = 'preserve-relative-size',
        id: u,
        maxSize: c = '100%',
        minSize: d = '0%',
        onResize: f,
        panelRef: p,
        style: g,
        ...x
    }) {
        let m = !!u,
            h = es(u),
            v = as({ disabled: s }),
            C = k(null),
            b = ts(C, i),
            { getPanelStyles: S, id: y, orientation: A, registerPanel: B, updatePanelProps: w } = os(),
            D = f !== null,
            G = Pa((X, te, Y) => {
                f?.(X, u, Y)
            })
        ;(Rt(() => {
            let X = C.current
            if (X !== null) {
                let te = {
                    element: X,
                    id: h,
                    idIsStable: m,
                    mutableValues: { expandToSize: void 0, prevSize: void 0 },
                    onResize: D ? G : void 0,
                    panelConstraints: {
                        groupResizeBehavior: l,
                        collapsedSize: a,
                        collapsible: o,
                        defaultSize: r,
                        disabled: v.disabled,
                        maxSize: c,
                        minSize: d
                    }
                }
                return B(te)
            }
        }, [l, a, o, r, D, h, m, c, d, G, B, v]),
            M(() => {
                w(h, { disabled: s })
            }, [s, h, w]),
            ng(h, p))
        let z = () => {
                let X = S(y, h)
                if (X) return JSON.stringify(X)
            },
            q = Mo((X) => Jr(y, X), z, z),
            ee
        return (
            q
                ? (ee = JSON.parse(q))
                : r !== void 0
                  ? (ee = { flexGrow: void 0, flexShrink: void 0, flexBasis: r })
                  : (ee = { flexGrow: 1 }),
            n('div', {
                ...x,
                'data-disabled': s || void 0,
                'data-panel': !0,
                'data-testid': h,
                id: h,
                ref: b,
                style: { ...lg, display: 'flex', flexBasis: 0, flexShrink: 1, overflow: 'visible', ...ee },
                children: n('div', {
                    className: t,
                    style: {
                        maxHeight: '100%',
                        maxWidth: '100%',
                        flexGrow: 1,
                        overflow: 'auto',
                        ...g,
                        touchAction: A === 'horizontal' ? 'pan-y' : 'pan-x'
                    },
                    children: e
                })
            })
        )
    }
    function ig({ layout: e, panelConstraints: t, panelId: a, panelIndex: o }) {
        let r,
            s,
            i = e[a],
            l = t.find((u) => u.panelId === a)
        if (l) {
            let u = l.maxSize,
                c = l.collapsible ? l.collapsedSize : l.minSize,
                d = [o, o + 1]
            ;((s = wt({
                layout: Ra({ delta: c - i, initialLayout: e, panelConstraints: t, pivotIndices: d, prevLayout: e }),
                panelConstraints: t
            })[a]),
                (r = wt({
                    layout: Ra({ delta: u - i, initialLayout: e, panelConstraints: t, pivotIndices: d, prevLayout: e }),
                    panelConstraints: t
                })[a]))
        }
        return { valueControls: a, valueMax: r, valueMin: s, valueNow: i }
    }
    function Hu({
        children: e,
        className: t,
        disabled: a,
        disableDoubleClick: o,
        elementRef: r,
        id: s,
        style: i,
        ...l
    }) {
        let u = es(s),
            c = as({ disabled: a, disableDoubleClick: o }),
            [d, f] = N({}),
            [p, g] = N('inactive'),
            [x, m] = N(!1),
            h = k(null),
            v = ts(h, r),
            { disableCursor: C, id: b, orientation: S, registerSeparator: y, updateSeparatorProps: A } = os(),
            B = S === 'horizontal' ? 'vertical' : 'horizontal'
        ;(Rt(() => {
            let G = h.current
            if (G !== null) {
                let z = { disabled: c.disabled, disableDoubleClick: c.disableDoubleClick, element: G, id: u },
                    q = y(z),
                    ee = Hm((te) => {
                        g(
                            te.next.state !== 'inactive' && te.next.hitRegions.some((Y) => Y.separator === z)
                                ? te.next.state
                                : 'inactive'
                        )
                    }),
                    X = Jr(b, (te) => {
                        let { derivedPanelConstraints: Y, layout: Le, separatorToPanels: H } = te.next,
                            je = H.get(z)
                        if (je) {
                            let Ce = je[0],
                                Fe = je.indexOf(Ce)
                            f(ig({ layout: Le, panelConstraints: Y, panelId: Ce.id, panelIndex: Fe }))
                        }
                    })
                return () => {
                    ;(ee(), X(), q())
                }
            }
        }, [b, u, y, c]),
            M(() => {
                A(u, { disabled: a, disableDoubleClick: o })
            }, [a, o, u, A]))
        let w
        a && !C && (w = 'not-allowed')
        let D
        return (
            a ? (D = 'disabled') : p === 'active' ? (D = 'active') : x ? (D = 'focus') : (D = p),
            n('div', {
                ...l,
                'aria-controls': d.valueControls,
                'aria-disabled': a || void 0,
                'aria-orientation': B,
                'aria-valuemax': d.valueMax,
                'aria-valuemin': d.valueMin,
                'aria-valuenow': d.valueNow,
                children: e,
                className: t,
                'data-separator': D,
                'data-testid': u,
                id: u,
                onBlur: () => m(!1),
                onFocus: () => m(!0),
                ref: v,
                role: 'separator',
                style: { flexBasis: 'auto', cursor: w, ...i, flexGrow: 0, flexShrink: 0, touchAction: 'none' },
                tabIndex: a ? void 0 : 0
            })
        )
    }
    var Io,
        it,
        yo,
        ea,
        Zr,
        Um,
        jr,
        Pu,
        Ru,
        ku,
        Tu,
        nu,
        lu,
        bo,
        uu,
        Ee,
        Au,
        jm,
        Jt,
        Rt,
        Ou,
        lg,
        qu = L(() => {
            'use client'
            R()
            U()
            yo = class {
                constructor() {
                    To(this, it, {})
                }
                addListener(t, a) {
                    let o = Dt(this, it)[t]
                    return (
                        o === void 0 ? (Dt(this, it)[t] = [a]) : o.includes(a) || o.push(a),
                        () => {
                            this.removeListener(t, a)
                        }
                    )
                }
                emit(t, a) {
                    let o = Dt(this, it)[t]
                    if (o !== void 0)
                        if (o.length === 1) o[0].call(null, a)
                        else {
                            let r = !1,
                                s = null,
                                i = Array.from(o)
                            for (let l = 0; l < i.length; l++) {
                                let u = i[l]
                                try {
                                    u.call(null, a)
                                } catch (c) {
                                    s === null && ((r = !0), (s = c))
                                }
                            }
                            if (r) throw s
                        }
                }
                removeAllListeners() {
                    Ao(this, it, {})
                }
                removeListener(t, a) {
                    let o = Dt(this, it)[t]
                    if (o !== void 0) {
                        let r = o.indexOf(a)
                        r >= 0 && o.splice(r, 1)
                    }
                }
            }
            it = new WeakMap()
            ;((ea = { cursorFlags: 0, state: 'inactive' }), (Zr = new yo()))
            ;((Um = (e) => e), (jr = () => {}), (Pu = 1), (Ru = 2), (ku = 4), (Tu = 8), (nu = 3), (lu = 12))
            uu = new WeakMap()
            ;((Ee = new Map()), (Au = new yo()))
            jm = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/
            Jt = new Map()
            Rt = typeof window < 'u' ? pt : M
            Ou = de(null)
            Nu.displayName = 'Group'
            zu.displayName = 'Panel'
            lg = {
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
            Hu.displayName = 'Separator'
        })
    var Uu = L(() => {
        qu()
        $()
        R()
    })
    var dg,
        ib,
        ub,
        _u = L(() => {
            'use client'
            U()
            ;((dg = (e, t, a, o, r, s, i, l) => {
                let u = document.documentElement,
                    c = ['light', 'dark']
                function d(g) {
                    ;((Array.isArray(e) ? e : [e]).forEach((x) => {
                        let m = x === 'class',
                            h = m && s ? r.map((v) => s[v] || v) : r
                        m ? (u.classList.remove(...h), u.classList.add(s && s[g] ? s[g] : g)) : u.setAttribute(x, g)
                    }),
                        f(g))
                }
                function f(g) {
                    l && c.includes(g) && (u.style.colorScheme = g)
                }
                function p() {
                    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
                }
                if (o) d(o)
                else
                    try {
                        let g = localStorage.getItem(t) || a,
                            x = i && g === 'system' ? p() : g
                        d(x)
                    } catch {}
            }),
                (ib = de(void 0)),
                (ub = oa(
                    ({
                        forcedTheme: e,
                        storageKey: t,
                        attribute: a,
                        enableSystem: o,
                        enableColorScheme: r,
                        defaultTheme: s,
                        value: i,
                        themes: l,
                        nonce: u,
                        scriptProps: c
                    }) => {
                        let d = JSON.stringify([a, t, s, e, l, i, o, r]).slice(1, -1)
                        return oe('script', {
                            ...c,
                            suppressHydrationWarning: !0,
                            nonce: typeof window > 'u' ? u : '',
                            dangerouslySetInnerHTML: { __html: `(${dg.toString()})(${d})` }
                        })
                    }
                )))
        })
    function cg(e) {
        if (!e || typeof document > 'u') return
        let t = document.head || document.getElementsByTagName('head')[0],
            a = document.createElement('style')
        ;((a.type = 'text/css'),
            t.appendChild(a),
            a.styleSheet ? (a.styleSheet.cssText = e) : a.appendChild(document.createTextNode(e)))
    }
    var mb,
        rs,
        ss,
        we,
        fg,
        pg,
        mg,
        gg,
        hg,
        gb,
        Vu = L(() => {
            'use client'
            U()
            Na()
            ;((mb = Array(12).fill(0)),
                (rs = 1),
                (ss = class {
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
                                    s =
                                        typeof t?.id == 'number' || ((a = t.id) == null ? void 0 : a.length) > 0
                                            ? t.id
                                            : rs++,
                                    i = this.toasts.find((u) => u.id === s),
                                    l = t.dismissible === void 0 ? !0 : t.dismissible
                                return (
                                    this.dismissedToasts.has(s) && this.dismissedToasts.delete(s),
                                    i
                                        ? (this.toasts = this.toasts.map((u) =>
                                              u.id === s
                                                  ? (this.publish({ ...u, ...t, id: s, title: o }),
                                                    { ...u, ...t, id: s, dismissible: l, title: o })
                                                  : u
                                          ))
                                        : this.addToast({ title: o, ...r, dismissible: l, id: s }),
                                    s
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
                                    s = o !== void 0,
                                    i,
                                    l = r
                                        .then(async (c) => {
                                            if (((i = ['resolve', c]), ft.isValidElement(c)))
                                                ((s = !1), this.create({ id: o, type: 'default', message: c }))
                                            else if (pg(c) && !c.ok) {
                                                s = !1
                                                let f =
                                                        typeof a.error == 'function'
                                                            ? await a.error(`HTTP error! status: ${c.status}`)
                                                            : a.error,
                                                    p =
                                                        typeof a.description == 'function'
                                                            ? await a.description(`HTTP error! status: ${c.status}`)
                                                            : a.description,
                                                    x =
                                                        typeof f == 'object' && !ft.isValidElement(f)
                                                            ? f
                                                            : { message: f }
                                                this.create({ id: o, type: 'error', description: p, ...x })
                                            } else if (c instanceof Error) {
                                                s = !1
                                                let f = typeof a.error == 'function' ? await a.error(c) : a.error,
                                                    p =
                                                        typeof a.description == 'function'
                                                            ? await a.description(c)
                                                            : a.description,
                                                    x =
                                                        typeof f == 'object' && !ft.isValidElement(f)
                                                            ? f
                                                            : { message: f }
                                                this.create({ id: o, type: 'error', description: p, ...x })
                                            } else if (a.success !== void 0) {
                                                s = !1
                                                let f = typeof a.success == 'function' ? await a.success(c) : a.success,
                                                    p =
                                                        typeof a.description == 'function'
                                                            ? await a.description(c)
                                                            : a.description,
                                                    x =
                                                        typeof f == 'object' && !ft.isValidElement(f)
                                                            ? f
                                                            : { message: f }
                                                this.create({ id: o, type: 'success', description: p, ...x })
                                            }
                                        })
                                        .catch(async (c) => {
                                            if (((i = ['reject', c]), a.error !== void 0)) {
                                                s = !1
                                                let d = typeof a.error == 'function' ? await a.error(c) : a.error,
                                                    f =
                                                        typeof a.description == 'function'
                                                            ? await a.description(c)
                                                            : a.description,
                                                    g =
                                                        typeof d == 'object' && !ft.isValidElement(d)
                                                            ? d
                                                            : { message: d }
                                                this.create({ id: o, type: 'error', description: f, ...g })
                                            }
                                        })
                                        .finally(() => {
                                            ;(s && (this.dismiss(o), (o = void 0)),
                                                a.finally == null || a.finally.call(a))
                                        }),
                                    u = () =>
                                        new Promise((c, d) =>
                                            l.then(() => (i[0] === 'reject' ? d(i[1]) : c(i[1]))).catch(d)
                                        )
                                return typeof o != 'string' && typeof o != 'number'
                                    ? { unwrap: u }
                                    : Object.assign(o, { unwrap: u })
                            }),
                            (this.custom = (t, a) => {
                                let o = a?.id || rs++
                                return (this.create({ jsx: t(o), id: o, ...a }), o)
                            }),
                            (this.getActiveToasts = () => this.toasts.filter((t) => !this.dismissedToasts.has(t.id))),
                            (this.subscribers = []),
                            (this.toasts = []),
                            (this.dismissedToasts = new Set()))
                    }
                }),
                (we = new ss()),
                (fg = (e, t) => {
                    let a = t?.id || rs++
                    return (we.addToast({ title: e, ...t, id: a }), a)
                }),
                (pg = (e) =>
                    e &&
                    typeof e == 'object' &&
                    'ok' in e &&
                    typeof e.ok == 'boolean' &&
                    'status' in e &&
                    typeof e.status == 'number'),
                (mg = fg),
                (gg = () => we.toasts),
                (hg = () => we.getActiveToasts()),
                (gb = Object.assign(
                    mg,
                    {
                        success: we.success,
                        info: we.info,
                        warning: we.warning,
                        error: we.error,
                        custom: we.custom,
                        message: we.message,
                        promise: we.promise,
                        dismiss: we.dismiss,
                        loading: we.loading
                    },
                    { getHistory: gg, getToasts: hg }
                )))
            cg(
                "[data-sonner-toaster][dir=ltr],html[dir=ltr]{--toast-icon-margin-start:-3px;--toast-icon-margin-end:4px;--toast-svg-margin-start:-1px;--toast-svg-margin-end:0px;--toast-button-margin-start:auto;--toast-button-margin-end:0;--toast-close-button-start:0;--toast-close-button-end:unset;--toast-close-button-transform:translate(-35%, -35%)}[data-sonner-toaster][dir=rtl],html[dir=rtl]{--toast-icon-margin-start:4px;--toast-icon-margin-end:-3px;--toast-svg-margin-start:0px;--toast-svg-margin-end:-1px;--toast-button-margin-start:0;--toast-button-margin-end:auto;--toast-close-button-start:unset;--toast-close-button-end:0;--toast-close-button-transform:translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1:hsl(0, 0%, 99%);--gray2:hsl(0, 0%, 97.3%);--gray3:hsl(0, 0%, 95.1%);--gray4:hsl(0, 0%, 93%);--gray5:hsl(0, 0%, 90.9%);--gray6:hsl(0, 0%, 88.7%);--gray7:hsl(0, 0%, 85.8%);--gray8:hsl(0, 0%, 78%);--gray9:hsl(0, 0%, 56.1%);--gray10:hsl(0, 0%, 52.3%);--gray11:hsl(0, 0%, 43.5%);--gray12:hsl(0, 0%, 9%);--border-radius:8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:0;z-index:999999999;transition:transform .4s ease}@media (hover:none) and (pointer:coarse){[data-sonner-toaster][data-lifted=true]{transform:none}}[data-sonner-toaster][data-x-position=right]{right:var(--offset-right)}[data-sonner-toaster][data-x-position=left]{left:var(--offset-left)}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translateX(-50%)}[data-sonner-toaster][data-y-position=top]{top:var(--offset-top)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--offset-bottom)}[data-sonner-toast]{--y:translateY(100%);--lift-amount:calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:0;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px rgba(0,0,0,.1);width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-y-position=top]{top:0;--y:translateY(-100%);--lift:1;--lift-amount:calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y:translateY(100%);--lift:-1;--lift-amount:calc(var(--lift) * var(--gap))}[data-sonner-toast][data-styled=true] [data-description]{font-weight:400;line-height:1.4;color:#3f3f3f}[data-rich-colors=true][data-sonner-toast][data-styled=true] [data-description]{color:inherit}[data-sonner-toaster][data-sonner-theme=dark] [data-description]{color:#e8e8e8}[data-sonner-toast][data-styled=true] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast][data-styled=true] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast][data-styled=true] [data-icon]>*{flex-shrink:0}[data-sonner-toast][data-styled=true] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast][data-styled=true] [data-content]{display:flex;flex-direction:column;gap:2px}[data-sonner-toast][data-styled=true] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;font-weight:500;cursor:pointer;outline:0;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast][data-styled=true] [data-button]:focus-visible{box-shadow:0 0 0 2px rgba(0,0,0,.4)}[data-sonner-toast][data-styled=true] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast][data-styled=true] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-styled=true] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast][data-styled=true] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;color:var(--gray12);background:var(--normal-bg);border:1px solid var(--gray4);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast][data-styled=true] [data-close-button]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-styled=true] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast][data-styled=true]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]::before{content:'';position:absolute;left:-100%;right:-100%;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]::before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]::before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]::before{content:'';position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast][data-expanded=true]::after{content:'';position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y:translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale:var(--toasts-before) * 0.05 + 1;--y:translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-x-position=right]{right:0}[data-sonner-toast][data-x-position=left]{left:0}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y:translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y:translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]::before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount-y,0)) translateX(var(--swipe-amount-x,0));transition:none}[data-sonner-toast][data-swiped=true]{user-select:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation-duration:.2s;animation-timing-function:ease-out;animation-fill-mode:forwards}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=left]{animation-name:swipe-out-left}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=right]{animation-name:swipe-out-right}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=up]{animation-name:swipe-out-up}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=down]{animation-name:swipe-out-down}@keyframes swipe-out-left{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) - 100%));opacity:0}}@keyframes swipe-out-right{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) + 100%));opacity:0}}@keyframes swipe-out-up{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) - 100%));opacity:0}}@keyframes swipe-out-down{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) + 100%));opacity:0}}@media (max-width:600px){[data-sonner-toaster]{position:fixed;right:var(--mobile-offset-right);left:var(--mobile-offset-left);width:100%}[data-sonner-toaster][dir=rtl]{left:calc(var(--mobile-offset-left) * -1)}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - var(--mobile-offset-left) * 2)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset-left)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--mobile-offset-bottom)}[data-sonner-toaster][data-y-position=top]{top:var(--mobile-offset-top)}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset-left);right:var(--mobile-offset-right);transform:none}}[data-sonner-toaster][data-sonner-theme=light]{--normal-bg:#fff;--normal-border:var(--gray4);--normal-text:var(--gray12);--success-bg:hsl(143, 85%, 96%);--success-border:hsl(145, 92%, 87%);--success-text:hsl(140, 100%, 27%);--info-bg:hsl(208, 100%, 97%);--info-border:hsl(221, 91%, 93%);--info-text:hsl(210, 92%, 45%);--warning-bg:hsl(49, 100%, 97%);--warning-border:hsl(49, 91%, 84%);--warning-text:hsl(31, 92%, 45%);--error-bg:hsl(359, 100%, 97%);--error-border:hsl(359, 100%, 94%);--error-text:hsl(360, 100%, 45%)}[data-sonner-toaster][data-sonner-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg:#000;--normal-border:hsl(0, 0%, 20%);--normal-text:var(--gray1)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg:#fff;--normal-border:var(--gray3);--normal-text:var(--gray12)}[data-sonner-toaster][data-sonner-theme=dark]{--normal-bg:#000;--normal-bg-hover:hsl(0, 0%, 12%);--normal-border:hsl(0, 0%, 20%);--normal-border-hover:hsl(0, 0%, 25%);--normal-text:var(--gray1);--success-bg:hsl(150, 100%, 6%);--success-border:hsl(147, 100%, 12%);--success-text:hsl(150, 86%, 65%);--info-bg:hsl(215, 100%, 6%);--info-border:hsl(223, 43%, 17%);--info-text:hsl(216, 87%, 65%);--warning-bg:hsl(64, 100%, 6%);--warning-border:hsl(60, 100%, 9%);--warning-text:hsl(46, 87%, 65%);--error-bg:hsl(358, 76%, 10%);--error-border:hsl(357, 89%, 16%);--error-text:hsl(358, 100%, 81%)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]{background:var(--normal-bg);border-color:var(--normal-border);color:var(--normal-text)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]:hover{background:var(--normal-bg-hover);border-color:var(--normal-border-hover)}[data-rich-colors=true][data-sonner-toast][data-type=success]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=info]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=error]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}[data-rich-colors=true][data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size:16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:first-child{animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}100%{opacity:.15}}@media (prefers-reduced-motion){.sonner-loading-bar,[data-sonner-toast],[data-sonner-toast]>*{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}"
            )
        })
    var Gu = L(() => {
        'use client'
        _u()
        Vu()
        R()
    })
    var xg,
        ns = L(() => {
            sa()
            $()
            R()
            xg = Ye(
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
    var Tb,
        Wu = L(() => {
            'use client'
            U()
            $()
            ns()
            R()
            Tb = de({ size: 'default', variant: 'default', spacing: 0 })
        })
    var Xu = L(() => {
        hs()
        $()
        qs()
        Xl()
        ma()
        jl()
        bi()
        Xr()
        Si()
        wi()
        Pi()
        ki()
        Mi()
        Ei()
        Fi()
        Bi()
        Oi()
        Ni()
        zi()
        Hi()
        $i()
        Zi()
        Yi()
        Ji()
        Qi()
        eu()
        tu()
        au()
        ru()
        su()
        Uu()
        Gu()
        ns()
        Wu()
    })
    function Ku(e) {
        return (
            typeof e == 'object' &&
            e !== null &&
            'channel' in e &&
            e.channel === ls &&
            'protocolVersion' in e &&
            e.protocolVersion === 1 &&
            'type' in e &&
            e.type === 'init'
        )
    }
    function vg(e) {
        return (
            typeof e == 'object' &&
            e !== null &&
            'channel' in e &&
            e.channel === ls &&
            'protocolVersion' in e &&
            e.protocolVersion === 1 &&
            'type' in e &&
            (e.type === 'data' || e.type === 'actionResult' || e.type === 'error')
        )
    }
    function $u(e) {
        ju = e ?? null
    }
    function Zu(e) {
        if (!vg(e) || typeof e.requestId != 'string') return !1
        let t = ka.get(e.requestId)
        return t
            ? (ka.delete(e.requestId),
              e.type === 'error'
                  ? t.reject(new Error(e.message ?? 'Remote request failed'))
                  : t.resolve(e.data ?? e.result ?? {}),
              !0)
            : !1
    }
    function Yu() {
        return ed('requestData', { query: { page: 1, pageSize: 1, parameters: {} } })
    }
    function Ju() {
        return ed('executeAction', { actionKey: 'run_conformance_simulation', input: {}, parameters: {} })
    }
    function is(e, t) {
        td('notify', { message: e, level: t })
    }
    function Qu(e) {
        if (e?.tokens)
            for (let [t, a] of Object.entries(e.tokens))
                document.documentElement.style.setProperty(`--xui-${Lg(t)}`, String(a))
    }
    function ed(e, t) {
        let a = crypto.randomUUID()
        return new Promise((o, r) => {
            ;(ka.set(a, { resolve: (s) => o(s), reject: r }),
                td(e, { requestId: a, ...t }),
                window.setTimeout(() => {
                    ka.has(a) && (ka.delete(a), r(new Error(`${e} request timed out`)))
                }, 3e4))
        })
    }
    function td(e, t) {
        window.parent?.postMessage({ channel: ls, protocolVersion: 1, instanceId: ju, type: e, ...t }, '*')
    }
    function Lg(e) {
        return e.replace(/[A-Z]/g, (t) => `-${t.toLowerCase()}`)
    }
    var ls,
        ka,
        ju,
        ad = L(() => {
            ;((ls = 'xpertai.remote_component'), (ka = new Map()), (ju = null))
        })
    function rd(e) {
        ;((Ta = Ig(e)), (document.documentElement.lang = Ta))
    }
    function T(e, t = {}) {
        return (Ta === 'zh-Hans' ? Cg : od)[e].replace(/\{\{(\w+)\}\}/g, (o, r) => String(t[r] ?? ''))
    }
    function wo(e) {
        let t = `status.${e}`
        return bg(t) ? T(t) : T('status.unknown')
    }
    function us(e, t) {
        return new Intl.NumberFormat(Ta, t).format(e)
    }
    function sd(e) {
        return new Intl.DateTimeFormat(Ta, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(e))
    }
    function Ig(e) {
        return e === 'zh-Hans' || e === 'zh_Hans' || e === 'zh-CN' || e === 'zh-SG' ? 'zh-Hans' : 'en-US'
    }
    function bg(e) {
        return e in od
    }
    var od,
        Cg,
        Ta,
        nd = L(() => {
            ;((od = {
                'app.title': 'Agent Evolution',
                'app.subtitle': 'Continuously discover, validate, and safely release Agent capability improvements',
                'tabs.overview': 'Overview',
                'tabs.learning': 'Learning & Proposals',
                'tabs.evaluation': 'Candidates & Evaluation',
                'tabs.release': 'Release & Runtime',
                'actions.run': 'Run full simulation',
                'actions.running': 'Running evolution\u2026',
                'actions.refresh': 'Refresh',
                'actions.cancel': 'Cancel',
                'confirm.title': 'Run end-to-end Agent Evolution?',
                'confirm.description':
                    'The isolated conformance fixture will create immutable learning evidence, replay a candidate, pass governance, run Shadow and Canary, and atomically activate a new version.',
                'empty.title': 'No evolution run yet',
                'empty.description':
                    'Run the conformance scenario to exercise the complete governed lifecycle without touching production domain data.',
                'health.normal': 'System healthy',
                'health.detail': 'Registered targets are isolated and production pointers are governed.',
                'metric.targets': 'Evolution targets',
                'metric.events': 'Learning events',
                'metric.candidates': 'Candidates',
                'metric.active': 'Active releases',
                'section.targets': 'Target health',
                'section.pipeline': 'Evolution loop',
                'section.signals': 'Learning signals',
                'section.proposals': 'Proposals',
                'section.evaluations': 'Evaluation runs',
                'section.cases': 'Golden replay cases',
                'section.releases': 'Release packages',
                'section.deployments': 'Deployments',
                'section.pointer': 'Capability pointers',
                'section.audit': 'Release audit',
                'pipeline.events': 'Learning Events',
                'pipeline.proposal': 'Proposal',
                'pipeline.candidate': 'Candidate',
                'pipeline.evaluation': 'Golden Replay',
                'pipeline.release': 'Release',
                'pipeline.production': 'Production',
                'table.id': 'ID',
                'table.target': 'Target',
                'table.status': 'Status',
                'table.evidence': 'Evidence / Summary',
                'table.version': 'Version',
                'table.metric': 'Metric',
                'table.baseline': 'Baseline',
                'table.candidate': 'Candidate',
                'table.result': 'Result',
                'table.channel': 'Channel',
                'table.samples': 'Samples',
                'table.action': 'Action',
                'table.actor': 'Actor',
                'table.time': 'Time',
                'status.active': 'Active',
                'status.ready': 'Ready',
                'status.approved': 'Approved',
                'status.installed': 'Installed',
                'status.candidate_built': 'Candidate built',
                'status.packaged': 'Packaged',
                'status.passed': 'Passed',
                'status.failed': 'Failed',
                'status.shadow': 'Shadow passed',
                'status.canary': 'Canary passed',
                'status.production': 'Production',
                'status.pending_approval': 'Pending approval',
                'status.prediction_reviewed': 'Prediction reviewed',
                'status.unknown': 'Unknown',
                'result.correct': 'Correct',
                'result.regression': 'Regression',
                'result.promote': 'Promote',
                'pointer.revision': 'Revision {{revision}}',
                'simulation.complete': 'Simulation {{id}} completed; Active Pointer now references {{version}}.',
                'error.load': 'Unable to load Agent Evolution data.',
                'error.run': 'The simulation did not complete.'
            }),
                (Cg = {
                    'app.title': '\u667A\u80FD\u4F53\u8FDB\u5316',
                    'app.subtitle':
                        '\u6301\u7EED\u53D1\u73B0\u3001\u9A8C\u8BC1\u5E76\u5B89\u5168\u53D1\u5E03\u667A\u80FD\u4F53\u80FD\u529B\u6539\u8FDB',
                    'tabs.overview': '\u6982\u89C8',
                    'tabs.learning': '\u5B66\u4E60\u4E0E\u5EFA\u8BAE',
                    'tabs.evaluation': '\u5019\u9009\u4E0E\u8BC4\u6D4B',
                    'tabs.release': '\u53D1\u5E03\u4E0E\u8FD0\u884C',
                    'actions.run': '\u8FD0\u884C\u5B8C\u6574\u6A21\u62DF',
                    'actions.running': '\u8FDB\u5316\u6267\u884C\u4E2D\u2026',
                    'actions.refresh': '\u5237\u65B0',
                    'actions.cancel': '\u53D6\u6D88',
                    'confirm.title': '\u8FD0\u884C\u7AEF\u5230\u7AEF\u667A\u80FD\u4F53\u8FDB\u5316\uFF1F',
                    'confirm.description':
                        '\u9694\u79BB\u7684\u5951\u7EA6\u6D4B\u8BD5\u5C06\u521B\u5EFA\u4E0D\u53EF\u53D8\u5B66\u4E60\u8BC1\u636E\u3001\u56DE\u653E\u5019\u9009\u3001\u901A\u8FC7\u6CBB\u7406\u3001\u8FD0\u884C Shadow \u4E0E Canary\uFF0C\u5E76\u539F\u5B50\u6FC0\u6D3B\u65B0\u7248\u672C\u3002',
                    'empty.title': '\u5C1A\u65E0\u8FDB\u5316\u6267\u884C',
                    'empty.description':
                        '\u8FD0\u884C\u5951\u7EA6\u6D4B\u8BD5\u573A\u666F\uFF0C\u5728\u4E0D\u89E6\u78B0\u751F\u4EA7\u9886\u57DF\u6570\u636E\u7684\u60C5\u51B5\u4E0B\u5B8C\u6574\u6F14\u7EC3\u53D7\u6CBB\u7406\u751F\u547D\u5468\u671F\u3002',
                    'health.normal': '\u6574\u4F53\u8FD0\u884C\u6B63\u5E38',
                    'health.detail':
                        '\u5DF2\u6CE8\u518C\u76EE\u6807\u76F8\u4E92\u9694\u79BB\uFF0C\u751F\u4EA7\u6307\u9488\u53D7\u5230\u6CBB\u7406\u3002',
                    'metric.targets': '\u8FDB\u5316\u76EE\u6807',
                    'metric.events': '\u5B66\u4E60\u4E8B\u4EF6',
                    'metric.candidates': '\u5019\u9009',
                    'metric.active': '\u6D3B\u8DC3\u53D1\u5E03',
                    'section.targets': '\u8FDB\u5316\u76EE\u6807\u5065\u5EB7\u5EA6',
                    'section.pipeline': '\u8FDB\u5316\u95ED\u73AF',
                    'section.signals': '\u5B66\u4E60\u4FE1\u53F7',
                    'section.proposals': '\u6539\u8FDB\u5EFA\u8BAE',
                    'section.evaluations': '\u8BC4\u6D4B\u6267\u884C',
                    'section.cases': 'Golden Replay \u6837\u672C',
                    'section.releases': '\u53D1\u5E03\u5305',
                    'section.deployments': '\u90E8\u7F72',
                    'section.pointer': '\u80FD\u529B\u7248\u672C\u6307\u9488',
                    'section.audit': '\u53D1\u5E03\u5BA1\u8BA1',
                    'pipeline.events': '\u5B66\u4E60\u4E8B\u4EF6',
                    'pipeline.proposal': 'Proposal',
                    'pipeline.candidate': 'Candidate',
                    'pipeline.evaluation': 'Golden Replay',
                    'pipeline.release': '\u53D1\u5E03',
                    'pipeline.production': '\u751F\u4EA7',
                    'table.id': 'ID',
                    'table.target': '\u76EE\u6807',
                    'table.status': '\u72B6\u6001',
                    'table.evidence': '\u8BC1\u636E / \u6458\u8981',
                    'table.version': '\u7248\u672C',
                    'table.metric': '\u6307\u6807',
                    'table.baseline': '\u57FA\u7EBF',
                    'table.candidate': '\u5019\u9009',
                    'table.result': '\u7ED3\u679C',
                    'table.channel': '\u901A\u9053',
                    'table.samples': '\u6837\u672C',
                    'table.action': '\u52A8\u4F5C',
                    'table.actor': '\u6267\u884C\u8005',
                    'table.time': '\u65F6\u95F4',
                    'status.active': '\u6D3B\u8DC3',
                    'status.ready': '\u5C31\u7EEA',
                    'status.approved': '\u5DF2\u5BA1\u6279',
                    'status.installed': '\u5DF2\u5B89\u88C5',
                    'status.candidate_built': '\u5019\u9009\u5DF2\u6784\u5EFA',
                    'status.packaged': '\u5DF2\u6253\u5305',
                    'status.passed': '\u901A\u8FC7',
                    'status.failed': '\u5931\u8D25',
                    'status.shadow': 'Shadow \u901A\u8FC7',
                    'status.canary': 'Canary \u901A\u8FC7',
                    'status.production': '\u751F\u4EA7',
                    'status.pending_approval': '\u5F85\u5BA1\u6279',
                    'status.prediction_reviewed': '\u9884\u6D4B\u5DF2\u590D\u6838',
                    'status.unknown': '\u672A\u77E5',
                    'result.correct': '\u6B63\u786E',
                    'result.regression': '\u56DE\u5F52',
                    'result.promote': '\u5EFA\u8BAE\u53D1\u5E03',
                    'pointer.revision': '\u4FEE\u8BA2 {{revision}}',
                    'simulation.complete':
                        '\u6A21\u62DF {{id}} \u5DF2\u5B8C\u6210\uFF1BActive Pointer \u5DF2\u6307\u5411 {{version}}\u3002',
                    'error.load': '\u65E0\u6CD5\u52A0\u8F7D\u667A\u80FD\u4F53\u8FDB\u5316\u6570\u636E\u3002',
                    'error.run': '\u6A21\u62DF\u672A\u80FD\u5B8C\u6210\u3002'
                }),
                (Ta = 'en-US'))
        })
    var Tg = pd(() => {
        U()
        ms()
        Xu()
        Ii()
        ad()
        nd()
        R()
        var ld = {
            targets: [],
            events: [],
            proposals: [],
            candidates: [],
            evaluations: [],
            releases: [],
            deployments: [],
            pointers: [],
            audits: []
        }
        function Sg() {
            let [e, t] = N(!1),
                [a, o] = N(!1),
                [r, s] = N(!1),
                [i, l] = N('overview'),
                [u, c] = N(ld),
                [d, f] = N(null),
                p = W(async () => {
                    if (e) {
                        ;(o(!0), f(null))
                        try {
                            let x = await Yu()
                            c(x.summary ?? ld)
                        } catch (x) {
                            f(ud(x, T('error.load')))
                        } finally {
                            o(!1)
                        }
                    }
                }, [e])
            ;(M(() => {
                let x = (m) => {
                    Zu(m.data) ||
                        (Ku(m.data) &&
                            ($u(m.data.instanceId),
                            Qu(m.data.theme),
                            gs(),
                            rd(m.data.locale),
                            id(m.data.parameters?.tab) && l(m.data.parameters.tab),
                            t(!0)))
                }
                return (
                    window.addEventListener('message', x),
                    window.parent?.postMessage(
                        { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready' },
                        '*'
                    ),
                    () => window.removeEventListener('message', x)
                )
            }, []),
                M(() => {
                    p()
                }, [p]))
            let g = W(async () => {
                ;(s(!0), f(null))
                try {
                    let x = await Ju()
                    if (!x.success || !x.data) throw new Error(T('error.run'))
                    ;(is(
                        T('simulation.complete', { id: x.data.simulationId, version: x.data.activeVersionId }),
                        'success'
                    ),
                        await p(),
                        l('release'))
                } catch (x) {
                    let m = ud(x, T('error.run'))
                    ;(f(m), is(m, 'error'))
                } finally {
                    s(!1)
                }
            }, [p])
            return I('main', {
                className: 'flex h-full min-h-0 flex-col bg-background text-foreground',
                'data-testid': 'evolution-center',
                children: [
                    I('header', {
                        className: 'flex shrink-0 items-center justify-between border-b px-6 py-5',
                        children: [
                            I('div', {
                                children: [
                                    I('div', {
                                        className: 'flex items-center gap-2',
                                        children: [
                                            n(Ve, { className: 'size-5 text-primary', 'aria-hidden': 'true' }),
                                            n('h1', {
                                                className: 'text-2xl font-semibold tracking-tight',
                                                children: T('app.title')
                                            })
                                        ]
                                    }),
                                    n('p', {
                                        className: 'mt-1 text-sm text-muted-foreground',
                                        children: T('app.subtitle')
                                    })
                                ]
                            }),
                            I('div', {
                                className: 'flex items-center gap-2',
                                children: [
                                    I(xo, {
                                        variant: 'outline',
                                        size: 'sm',
                                        onClick: () => {
                                            p()
                                        },
                                        disabled: a || r,
                                        children: [
                                            n(va, {
                                                className: a ? 'size-4 animate-spin' : 'size-4',
                                                'aria-hidden': 'true'
                                            }),
                                            T('actions.refresh')
                                        ]
                                    }),
                                    n(cd, { running: r, onConfirm: g })
                                ]
                            })
                        ]
                    }),
                    d
                        ? I('div', {
                              className:
                                  'mx-6 mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive',
                              children: [n(lt, { className: 'size-4', 'aria-hidden': 'true' }), d]
                          })
                        : null,
                    I(Ti, {
                        value: i,
                        onValueChange: (x) => id(x) && l(x),
                        className: 'min-h-0 flex-1',
                        children: [
                            I(Ai, {
                                className: 'mx-6 mt-3 h-auto justify-start rounded-none border-b bg-transparent p-0',
                                children: [
                                    n(Po, { value: 'overview', icon: _e, label: T('tabs.overview') }),
                                    n(Po, { value: 'learning', icon: Zt, label: T('tabs.learning') }),
                                    n(Po, { value: 'evaluation', icon: st, label: T('tabs.evaluation') }),
                                    n(Po, { value: 'release', icon: It, label: T('tabs.release') })
                                ]
                            }),
                            n(yi, {
                                className: 'h-[calc(100%-3.5rem)]',
                                children: n('div', {
                                    className: 'p-6',
                                    children: u.events.length
                                        ? I(Bt, {
                                              children: [
                                                  n(Ia, {
                                                      value: 'overview',
                                                      className: 'm-0',
                                                      children: n(wg, { dashboard: u })
                                                  }),
                                                  n(Ia, {
                                                      value: 'learning',
                                                      className: 'm-0',
                                                      children: n(Pg, { dashboard: u })
                                                  }),
                                                  n(Ia, {
                                                      value: 'evaluation',
                                                      className: 'm-0',
                                                      children: n(Rg, { dashboard: u })
                                                  }),
                                                  n(Ia, {
                                                      value: 'release',
                                                      className: 'm-0',
                                                      children: n(kg, { dashboard: u })
                                                  })
                                              ]
                                          })
                                        : n(yg, { running: r, onRun: g })
                                })
                            })
                        ]
                    })
                ]
            })
        }
        function cd({ running: e, onConfirm: t, testId: a }) {
            return I(qi, {
                children: [
                    n(Ui, {
                        asChild: !0,
                        children: I(xo, {
                            size: 'sm',
                            disabled: e,
                            'data-testid': a,
                            children: [
                                n(nt, { className: 'size-4', 'aria-hidden': 'true' }),
                                e ? T('actions.running') : T('actions.run')
                            ]
                        })
                    }),
                    I(_i, {
                        children: [
                            I(Vi, {
                                children: [
                                    n(Wi, { children: T('confirm.title') }),
                                    n(Xi, { children: T('confirm.description') })
                                ]
                            }),
                            I(Gi, {
                                children: [
                                    n(Ki, { children: T('actions.cancel') }),
                                    n(ji, {
                                        onClick: () => {
                                            t()
                                        },
                                        children: T('actions.run')
                                    })
                                ]
                            })
                        ]
                    })
                ]
            })
        }
        function Po({ value: e, icon: t, label: a }) {
            return I(Di, {
                value: e,
                className:
                    'gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                children: [n(t, { className: 'size-4', 'aria-hidden': 'true' }), a]
            })
        }
        function yg({ running: e, onRun: t }) {
            return I(ot, {
                className: 'mx-auto mt-16 max-w-xl border-dashed text-center',
                children: [
                    I(ga, {
                        className: 'items-center',
                        children: [
                            n('div', {
                                className:
                                    'mb-2 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary',
                                children: n(Yt, { className: 'size-7', 'aria-hidden': 'true' })
                            }),
                            n(ha, { children: T('empty.title') }),
                            n(vo, { className: 'max-w-md', children: T('empty.description') })
                        ]
                    }),
                    n(rt, { children: n(cd, { running: e, onConfirm: t, testId: 'empty-run-simulation' }) })
                ]
            })
        }
        function wg({ dashboard: e }) {
            let t = e.releases.filter((o) => o.status === 'active').length,
                a = [
                    [T('pipeline.events'), e.events.length, Zt],
                    [T('pipeline.proposal'), e.proposals.length, Ve],
                    [T('pipeline.candidate'), e.candidates.length, st],
                    [T('pipeline.evaluation'), e.evaluations.length, Yt],
                    [T('pipeline.release'), e.releases.length, La],
                    [T('pipeline.production'), e.pointers.length, It]
                ]
            return I('div', {
                className: 'space-y-6',
                children: [
                    n(ot, {
                        className: 'border-primary/20 bg-primary/5',
                        children: I(rt, {
                            className: 'flex items-center justify-between py-5',
                            children: [
                                I('div', {
                                    className: 'flex items-center gap-3',
                                    children: [
                                        n(Ue, { className: 'size-6 text-primary', 'aria-hidden': 'true' }),
                                        I('div', {
                                            children: [
                                                n('div', { className: 'font-semibold', children: T('health.normal') }),
                                                n('div', {
                                                    className: 'text-sm text-muted-foreground',
                                                    children: T('health.detail')
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                n(Xe, { status: 'active' })
                            ]
                        })
                    }),
                    I('div', {
                        className: 'grid gap-4 md:grid-cols-4',
                        children: [
                            n(dt, { label: T('metric.targets'), value: e.targets.length, icon: Ca }),
                            n(dt, { label: T('metric.events'), value: e.events.length, icon: Kt }),
                            n(dt, { label: T('metric.candidates'), value: e.candidates.length, icon: st }),
                            n(dt, { label: T('metric.active'), value: t, icon: It })
                        ]
                    }),
                    n(ct, {
                        title: T('section.pipeline'),
                        children: n('div', {
                            className: 'grid gap-2 lg:grid-cols-6',
                            children: a.map(([o, r, s], i) =>
                                n(
                                    Te,
                                    {
                                        children: I('div', {
                                            className: 'relative rounded-lg border bg-card p-4',
                                            children: [
                                                n(s, { className: 'mb-3 size-5 text-primary', 'aria-hidden': 'true' }),
                                                n('div', { className: 'text-2xl font-semibold', children: r }),
                                                n('div', { className: 'text-xs text-muted-foreground', children: o }),
                                                i < a.length - 1
                                                    ? n($t, {
                                                          className:
                                                              'absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block',
                                                          'aria-hidden': 'true'
                                                      })
                                                    : null
                                            ]
                                        })
                                    },
                                    o
                                )
                            )
                        })
                    }),
                    n(ct, {
                        title: T('section.targets'),
                        children: I(ba, {
                            children: [
                                n(Sa, {
                                    children: I(Ge, {
                                        children: [
                                            n(ie, { children: T('table.target') }),
                                            n(ie, { children: T('table.status') }),
                                            n(ie, { children: T('table.version') }),
                                            n(ie, { children: T('table.evidence') })
                                        ]
                                    })
                                }),
                                n(ya, {
                                    children: e.targets.map((o) => {
                                        let r = e.pointers.find((s) => s.targetId === o.targetId)
                                        return I(
                                            Ge,
                                            {
                                                children: [
                                                    I(ue, {
                                                        children: [
                                                            n('div', {
                                                                className: 'font-medium',
                                                                children: o.displayName
                                                            }),
                                                            n('div', {
                                                                className: 'font-mono text-xs text-muted-foreground',
                                                                children: o.targetId
                                                            })
                                                        ]
                                                    }),
                                                    n(ue, { children: n(Xe, { status: o.status }) }),
                                                    n(ue, {
                                                        className: 'font-mono text-xs',
                                                        children: r?.activeVersionId ?? '\u2014'
                                                    }),
                                                    n(ue, { children: o.metricSetId })
                                                ]
                                            },
                                            o.targetId
                                        )
                                    })
                                })
                            ]
                        })
                    })
                ]
            })
        }
        function Pg({ dashboard: e }) {
            return I('div', {
                className: 'grid gap-6 xl:grid-cols-[1.2fr_0.8fr]',
                children: [
                    n(ct, {
                        title: T('section.signals'),
                        children: I(ba, {
                            children: [
                                n(Sa, {
                                    children: I(Ge, {
                                        children: [
                                            n(ie, { children: T('table.id') }),
                                            n(ie, { children: T('table.target') }),
                                            n(ie, { children: T('table.status') }),
                                            n(ie, { children: T('table.evidence') })
                                        ]
                                    })
                                }),
                                n(ya, {
                                    children: e.events.map((t) =>
                                        I(
                                            Ge,
                                            {
                                                children: [
                                                    n(ue, { className: 'font-mono text-xs', children: t.eventId }),
                                                    n(ue, { children: t.targetId }),
                                                    n(ue, { children: n(Xe, { status: t.eventType }) }),
                                                    n(ue, {
                                                        className: 'max-w-md text-sm',
                                                        children: t.finalOutcomeSummary
                                                    })
                                                ]
                                            },
                                            t.eventId
                                        )
                                    )
                                })
                            ]
                        })
                    }),
                    n(ct, {
                        title: T('section.proposals'),
                        children: n('div', {
                            className: 'space-y-4',
                            children: e.proposals.map((t) =>
                                I(
                                    ot,
                                    {
                                        children: [
                                            I(ga, {
                                                children: [
                                                    I('div', {
                                                        className: 'flex items-center justify-between gap-3',
                                                        children: [
                                                            n(ha, { className: 'text-base', children: t.title }),
                                                            n(Xe, { status: t.status })
                                                        ]
                                                    }),
                                                    n(vo, { children: t.problemStatement })
                                                ]
                                            }),
                                            I(rt, {
                                                className: 'space-y-3 text-sm',
                                                children: [
                                                    n('p', { children: t.changeHypothesis }),
                                                    n(Ri, {}),
                                                    I('div', {
                                                        className: 'flex justify-between text-muted-foreground',
                                                        children: [
                                                            n('span', { children: t.proposalId }),
                                                            I('span', {
                                                                children: [t.evidenceEventIds.length, ' evidence']
                                                            })
                                                        ]
                                                    })
                                                ]
                                            })
                                        ]
                                    },
                                    `${t.proposalId}:${t.revision}`
                                )
                            )
                        })
                    })
                ]
            })
        }
        function Rg({ dashboard: e }) {
            let t = e.evaluations[0]
            if (!t) return null
            let a = t.metrics
            return I('div', {
                className: 'space-y-6',
                children: [
                    I('div', {
                        className: 'grid gap-4 md:grid-cols-4',
                        children: [
                            n(dt, { label: T('table.baseline'), value: Ro(a.baselineAccuracy), icon: _e }),
                            n(dt, {
                                label: T('table.candidate'),
                                value: Ro(a.candidateAccuracy),
                                icon: st,
                                emphasis: !0
                            }),
                            n(dt, {
                                label: 'Accuracy \u0394',
                                value: `+${Ro(a.accuracyDelta)}`,
                                icon: Kt,
                                emphasis: !0
                            }),
                            n(dt, { label: 'P95 latency', value: `${a.p95LatencyMs} ms`, icon: xa })
                        ]
                    }),
                    n(ot, {
                        className: 'border-primary/20 bg-primary/5',
                        children: I(rt, {
                            className: 'flex items-center justify-between py-5',
                            children: [
                                I('div', {
                                    children: [
                                        n('div', { className: 'text-sm text-muted-foreground', children: t.runId }),
                                        n('div', {
                                            className: 'mt-1 text-xl font-semibold',
                                            children: T('result.promote')
                                        })
                                    ]
                                }),
                                I('div', {
                                    className: 'flex items-center gap-3',
                                    children: [
                                        I('span', {
                                            className: 'text-sm text-muted-foreground',
                                            children: [a.passedCases, '/', a.totalCases]
                                        }),
                                        n(Xe, { status: t.status })
                                    ]
                                })
                            ]
                        })
                    }),
                    n(ct, {
                        title: T('section.cases'),
                        children: I(ba, {
                            children: [
                                n(Sa, {
                                    children: I(Ge, {
                                        children: [
                                            n(ie, { children: T('table.id') }),
                                            n(ie, { children: T('table.baseline') }),
                                            n(ie, { children: T('table.candidate') }),
                                            n(ie, { children: T('table.result') }),
                                            n(ie, { children: 'P95' })
                                        ]
                                    })
                                }),
                                n(ya, {
                                    children: t.caseResults.map((o) =>
                                        I(
                                            Ge,
                                            {
                                                children: [
                                                    n(ue, { className: 'font-mono text-xs', children: o.caseId }),
                                                    n(ue, {
                                                        children: o.baselinePassed
                                                            ? T('result.correct')
                                                            : T('result.regression')
                                                    }),
                                                    n(ue, {
                                                        children: o.candidatePassed
                                                            ? T('result.correct')
                                                            : T('result.regression')
                                                    }),
                                                    n(ue, {
                                                        children: n(Xe, {
                                                            status: o.candidatePassed ? 'passed' : 'failed'
                                                        })
                                                    }),
                                                    I(ue, { children: [o.latencyMs, ' ms'] })
                                                ]
                                            },
                                            o.caseId
                                        )
                                    )
                                })
                            ]
                        })
                    })
                ]
            })
        }
        function kg({ dashboard: e }) {
            let t = e.releases[0],
                a = e.pointers[0]
            return I('div', {
                className: 'space-y-6',
                children: [
                    t
                        ? I(ot, {
                              children: [
                                  n(ga, {
                                      children: I('div', {
                                          className: 'flex items-center justify-between gap-3',
                                          children: [
                                              I('div', {
                                                  children: [
                                                      n(ha, { children: t.releasePackageId }),
                                                      I(vo, { children: [t.candidateId, ' \xB7 ', t.targetId] })
                                                  ]
                                              }),
                                              n(Xe, { status: t.status })
                                          ]
                                      })
                                  }),
                                  n(rt, {
                                      children: n('div', {
                                          className: 'grid gap-3 md:grid-cols-5',
                                          children: ['approved', 'installed', 'shadow', 'canary', 'active'].map(
                                              (o, r) =>
                                                  I(
                                                      'div',
                                                      {
                                                          className: 'relative rounded-lg border bg-muted/30 p-3',
                                                          children: [
                                                              n(Ue, {
                                                                  className: 'mb-2 size-5 text-primary',
                                                                  'aria-hidden': 'true'
                                                              }),
                                                              n('div', {
                                                                  className: 'text-sm font-medium',
                                                                  children: wo(o)
                                                              }),
                                                              r < 4
                                                                  ? n($t, {
                                                                        className:
                                                                            'absolute -right-3 top-1/2 hidden size-5 -translate-y-1/2 rounded-full bg-background text-muted-foreground md:block',
                                                                        'aria-hidden': 'true'
                                                                    })
                                                                  : null
                                                          ]
                                                      },
                                                      o
                                                  )
                                          )
                                      })
                                  })
                              ]
                          })
                        : null,
                    I('div', {
                        className: 'grid gap-6 lg:grid-cols-2',
                        children: [
                            n(ct, {
                                title: T('section.deployments'),
                                children: n('div', {
                                    className: 'space-y-4',
                                    children: e.deployments.map((o) =>
                                        I(
                                            'div',
                                            {
                                                className: 'rounded-lg border p-4',
                                                children: [
                                                    I('div', {
                                                        className: 'flex items-center justify-between',
                                                        children: [
                                                            I('div', {
                                                                children: [
                                                                    n('div', {
                                                                        className: 'font-medium',
                                                                        children: wo(o.channel)
                                                                    }),
                                                                    n('div', {
                                                                        className:
                                                                            'font-mono text-xs text-muted-foreground',
                                                                        children: o.deploymentId
                                                                    })
                                                                ]
                                                            }),
                                                            n(Xe, { status: o.status })
                                                        ]
                                                    }),
                                                    I('div', {
                                                        className: 'mt-4 flex items-center gap-3',
                                                        children: [
                                                            n(ou, { value: o.candidateAccuracy * 100 }),
                                                            n('span', {
                                                                className: 'whitespace-nowrap text-sm',
                                                                children: Ro(o.candidateAccuracy)
                                                            })
                                                        ]
                                                    }),
                                                    I('div', {
                                                        className: 'mt-2 text-xs text-muted-foreground',
                                                        children: [us(o.sampleCount), ' ', T('table.samples')]
                                                    })
                                                ]
                                            },
                                            o.deploymentId
                                        )
                                    )
                                })
                            }),
                            n(ct, {
                                title: T('section.pointer'),
                                children: a
                                    ? I('div', {
                                          className: 'space-y-4',
                                          children: [
                                              I('div', {
                                                  className: 'rounded-lg border border-primary/20 bg-primary/5 p-5',
                                                  children: [
                                                      I('div', {
                                                          className: 'flex items-center justify-between',
                                                          children: [
                                                              n('span', {
                                                                  className: 'text-sm text-muted-foreground',
                                                                  children: 'Active Pointer'
                                                              }),
                                                              n(Xe, { status: 'production' })
                                                          ]
                                                      }),
                                                      n('div', {
                                                          className: 'mt-3 font-mono text-xl font-semibold',
                                                          children: a.activeVersionId
                                                      }),
                                                      n('div', {
                                                          className: 'mt-1 text-sm text-muted-foreground',
                                                          children: T('pointer.revision', { revision: a.revision })
                                                      })
                                                  ]
                                              }),
                                              I('div', {
                                                  className: 'grid grid-cols-2 gap-3 text-sm',
                                                  children: [
                                                      I('div', {
                                                          className: 'rounded-lg border p-3',
                                                          children: [
                                                              n('div', {
                                                                  className: 'text-muted-foreground',
                                                                  children: 'Rollback'
                                                              }),
                                                              n('div', {
                                                                  className: 'mt-1 font-mono text-xs',
                                                                  children: a.rollbackVersionId ?? '\u2014'
                                                              })
                                                          ]
                                                      }),
                                                      I('div', {
                                                          className: 'rounded-lg border p-3',
                                                          children: [
                                                              n('div', {
                                                                  className: 'text-muted-foreground',
                                                                  children: 'Release'
                                                              }),
                                                              n('div', {
                                                                  className: 'mt-1 font-mono text-xs',
                                                                  children: a.releasePackageId ?? '\u2014'
                                                              })
                                                          ]
                                                      })
                                                  ]
                                              })
                                          ]
                                      })
                                    : null
                            })
                        ]
                    }),
                    n(ct, {
                        title: T('section.audit'),
                        children: I(ba, {
                            children: [
                                n(Sa, {
                                    children: I(Ge, {
                                        children: [
                                            n(ie, { children: T('table.time') }),
                                            n(ie, { children: T('table.action') }),
                                            n(ie, { children: T('table.actor') }),
                                            n(ie, { children: T('table.evidence') })
                                        ]
                                    })
                                }),
                                n(ya, {
                                    children: e.audits.map((o) =>
                                        I(
                                            Ge,
                                            {
                                                children: [
                                                    n(ue, {
                                                        className: 'whitespace-nowrap text-xs',
                                                        children: sd(o.occurredAt)
                                                    }),
                                                    n(ue, { className: 'font-mono text-xs', children: o.action }),
                                                    n(ue, { children: o.actorRole }),
                                                    n(ue, { children: o.summary })
                                                ]
                                            },
                                            o.auditId
                                        )
                                    )
                                })
                            ]
                        })
                    })
                ]
            })
        }
        function dt({ label: e, value: t, icon: a, emphasis: o = !1 }) {
            return n(ot, {
                className: o ? 'border-primary/30 bg-primary/5' : '',
                children: I(rt, {
                    className: 'flex items-start justify-between p-5',
                    children: [
                        I('div', {
                            children: [
                                n('div', { className: 'text-sm text-muted-foreground', children: e }),
                                n('div', { className: 'mt-2 text-3xl font-semibold tracking-tight', children: t })
                            ]
                        }),
                        n('div', {
                            className: 'rounded-lg bg-muted p-2 text-primary',
                            children: n(a, { className: 'size-5', 'aria-hidden': 'true' })
                        })
                    ]
                })
            })
        }
        function ct({ title: e, children: t }) {
            return I(ot, {
                children: [
                    n(ga, { className: 'pb-3', children: n(ha, { className: 'text-base', children: e }) }),
                    n(rt, { children: t })
                ]
            })
        }
        function Xe({ status: e }) {
            let t = [
                'active',
                'ready',
                'approved',
                'packaged',
                'passed',
                'shadow',
                'canary',
                'production',
                'prediction_reviewed'
            ].includes(e)
            return n(Wl, { variant: t ? 'secondary' : e === 'failed' ? 'destructive' : 'outline', children: wo(e) })
        }
        function Ro(e) {
            return us(e, { style: 'percent', maximumFractionDigits: 1 })
        }
        function id(e) {
            return e === 'overview' || e === 'learning' || e === 'evaluation' || e === 'release'
        }
        function ud(e, t) {
            return e instanceof Error && e.message ? e.message : t
        }
        var dd = document.getElementById('root')
        dd && ps(dd).render(n(Sg, {}))
    })
    Tg()
})()
