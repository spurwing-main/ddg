(function () {
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false,
		truePath: window.location.pathname,
		ajaxHomeLoaded: false
	});

	// GSAP Defaults
	gsap.defaults({ overwrite: 'auto' });
	gsap.ticker.lagSmoothing(500, 33);
	ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' });

	ddg.fs = (() => {
		// Memoized promise so we only subscribe once
		let _promise = null;

		function whenReady() {
			if (_promise) return _promise;

			_promise = new Promise((resolve) => {
				// Ensure FA queue exists
				window.FinsweetAttributes ||= [];

				let done = false;
					const finish = (instances, label) => {
						if (done) return;
						const inst = Array.isArray(instances) ? instances[0] : instances;
						if (inst && inst.items) {
							done = true;
							console.log(`[ddg.fs] list instance ready (${label})`, inst);
							try { document.dispatchEvent(new CustomEvent('ddg:list-ready', { detail: { list: inst, via: label } })); } catch {}
							resolve(inst);
						}
					};

				// 1) Subscribe FIRST so we never miss late inits
				try {
					window.FinsweetAttributes.push(['list', (instances) => finish(instances, 'push')]);
				} catch (e) {
					console.warn('[ddg.fs] push subscription failed', e);
				}

				// 2) If a module exists, hook its loading promise (safe even if already resolved)
				const mod = window.FinsweetAttributes?.modules?.list;
				console.log('[ddg.fs] whenReady called, module exists:', !!mod, 'has loading:', !!(mod?.loading));
				if (mod?.loading && typeof mod.loading.then === 'function') {
					mod.loading
						.then((instances) => finish(instances, 'module.loading'))
						.catch((err) => console.warn('[ddg.fs] module.loading rejected', err));
				}

					// 3) Nudge FA to scan (covers ajax-injected DOM) and hook returned promise
					try {
						const loadResult = window.FinsweetAttributes.load?.('list');
						if (loadResult && typeof loadResult.then === 'function') {
							loadResult.then((instances) => finish(instances, 'load()')).catch(() => {});
						}
					} catch {}
					try { window.FinsweetAttributes.modules?.list?.restart?.(); } catch {}

					// 4) Microtask re-check in case module attaches synchronously after load()
					queueMicrotask(() => {
						if (done) return;
						const m = window.FinsweetAttributes?.modules?.list;
						if (m?.loading && typeof m.loading.then === 'function') {
							m.loading.then((instances) => finish(instances, 'module.loading (microtask)')).catch(() => {});
						}
					});

					// 5) Patch FA.load so any later load('list') calls also resolve this promise
					try {
						const fa = window.FinsweetAttributes;
						if (fa && !fa.__ddgLoadPatched && typeof fa.load === 'function') {
							const _origLoad = fa.load.bind(fa);
							fa.load = function(name, ...args) {
								const ret = _origLoad(name, ...args);
								if (name === 'list' && ret && typeof ret.then === 'function') {
									ret.then((instances) => finish(instances, 'load(patched)')).catch(() => {});
								}
								return ret;
							};
							fa.__ddgLoadPatched = true;
						}
					} catch {}

					// 6) If ajax-home later injects the list, hook that signal as a resolver too
					try {
						document.addEventListener('ddg:ajax-home-ready', () => {
							if (done) return;
							const m = window.FinsweetAttributes?.modules?.list;
							if (m?.loading && typeof m.loading.then === 'function') {
								m.loading.then((instances) => finish(instances, 'module.loading (ajax-home)')).catch(() => {});
							} else {
								const r = window.FinsweetAttributes.load?.('list');
								if (r && typeof r.then === 'function') r.then((instances) => finish(instances, 'load(ddg:ajax-home-ready)')).catch(() => {});
							}
						}, { once: true });
					} catch {}
			});

			return _promise;
		}

		const restart = () => window.FinsweetAttributes?.modules?.list?.restart?.();
		const onRender = fn => whenReady().then(list => list.addHook?.('afterRender', fn)).catch(() => {});
		const watchItems = fn => whenReady().then(list => list.watch?.(() => list.items.value, fn)).catch(() => {});

		// --- KISS helpers (kept; used across modules) ---
		const items = (list) => {
			const v = list?.items;
			return Array.isArray(v?.value) ? v.value : (Array.isArray(v) ? v : []);
		};

			const valuesForItem = (item) => {
				const names = Object.keys(item?.fields || {}).length
					? Object.keys(item.fields)
					: Object.keys(item?.fieldElements || {});
				const out = {};
				for (const n of names) {
					const f = item?.fields?.[n];
					let v = f?.value ?? f?.rawValue ?? [];
					if (typeof v === 'string') {
						// Split comma-separated strings into arrays and trim tokens
						v = v.split(',').map(s => s.trim()).filter(Boolean);
					}
					out[n] = Array.isArray(v) ? v : (v == null ? [] : [v]);
				}
				return out;
			};

		async function applyCheckboxFilters(
			valuesByField,
			{ formSel='[fs-list-element="filters"]', clearSel='[fs-list-element="clear"]', maxFields=4 } = {}
		) {
			const form = document.querySelector(formSel);
			if (!form) { console.warn('[filters] no form'); return; }

			// Build UI map: field -> (value -> input)
			const inputs = [...form.querySelectorAll('input[type="checkbox"][fs-list-field][fs-list-value]')]
				.filter(i => !i.closest('label')?.classList.contains('is-list-emptyfacet'));
			const byField = new Map();
			for (const i of inputs) {
				const f = i.getAttribute('fs-list-field');
				const v = i.getAttribute('fs-list-value');
				if (!f || !v) continue;
				if (!byField.has(f)) byField.set(f, new Map());
				byField.get(f).set(v, i);
			}

			// Choose up to maxFields that exist in both the item and UI
			const picks = [];
			for (const [field, vals] of Object.entries(valuesByField || {})) {
				if (picks.length >= maxFields) break;
				const map = byField.get(field);
				if (!map) continue;
				const match = (vals || []).find(v => map.has(v));
				if (match) picks.push([field, match]);
			}
			if (!picks.length) { console.warn('[filters] no matching values to apply'); return; }

			// Clear existing — prefer the clear button, otherwise clear manually
			const clearBtn = form.querySelector(clearSel);
			if (clearBtn) {
				clearBtn.click();
			} else {
				for (const i of inputs) {
					if (i.checked) i.checked = false;
					i.closest('label')?.classList.remove('is-list-active');
					i.dispatchEvent(new Event('input',  { bubbles: true }));
					i.dispatchEvent(new Event('change', { bubbles: true }));
				}
			}

			// Click each candidate and mirror UI state
			for (const [f, v] of picks) {
				const input = byField.get(f)?.get(v);
				if (!input) continue;
				if (!input.checked) input.checked = true;
				input.closest('label')?.classList.add('is-list-active');
				input.dispatchEvent(new Event('input',  { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}

			// Ask Finsweet to recompute if available
			try {
				const list = await whenReady();
				list.triggerHook?.('filter');
				list.render?.();
			} catch {}

			console.log('[filters] applied:', picks.map(([f, v]) => `${f}:${v}`).join(' | '));
		}

		return { whenReady, restart, onRender, watchItems, items, valuesForItem, applyCheckboxFilters };
	})();

	// --- Debug helpers (console friendly) ---
	ddg.debug = (() => {
		const log = (...a) => console.log('[ddg.debug]', ...a);
		const sel = {
			list: '[fs-list-element="list"]',
			filters: '[fs-list-element="filters"]',
			clear: '[fs-list-element="clear"]',
			rfParent: '[data-relatedfilters="parent"]'
		};
		const fa = () => window.FinsweetAttributes || [];
		const mod = () => fa()?.modules?.list;

		function fsStatus() {
			const m = mod();
			const listEl = document.querySelector(sel.list);
			const filtersEl = document.querySelector(sel.filters);
			const clearEl = document.querySelector(sel.clear);
			const status = {
				hasFAArray: Array.isArray(fa()),
				hasModule: !!m,
				hasLoadingPromise: !!(m?.loading && typeof m.loading.then === 'function'),
				hasListElementInDOM: !!listEl,
				hasFiltersFormInDOM: !!filtersEl,
				hasClearBtnInDOM: !!clearEl
			};
			log('fsStatus:', status, 'module=', m);
			return status;
		}

		function fsNudge(times = 3, delay = 150) {
			let i = 0;
			log('fsNudge start', { times, delay });
			const tick = () => {
				try { mod()?.restart?.(); log('restart() called'); } catch (e) { log('restart() error', e); }
				try { fa()?.load?.('list'); log('load("list") called'); } catch (e) { log('load("list") error', e); }
				if (++i < times) setTimeout(tick, delay);
			};
			tick();
		}

		function withTimeout(p, ms = 8000, label = 'wait') {
			return Promise.race([
				p,
				new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' timed out in ' + ms + 'ms')), ms))
			]);
		}

		async function waitFs(timeout = 8000) {
			log('waitFs: awaiting ddg.fs.whenReady with timeout', timeout);
			try {
				const list = await withTimeout(ddg.fs.whenReady(), timeout, 'whenReady');
				log('waitFs: resolved', list);
				return list;
			} catch (e) {
				log('waitFs: FAILED', e);
				throw e;
			}
		}

		async function waitSignals(names = [], timeout = 8000) {
			log('waitSignals:', names, 'timeout=', timeout);
			try {
				const out = await ddg.signals.waitAll(names, timeout);
				log('waitSignals: resolved', out);
				return out;
			} catch (e) {
				log('waitSignals: FAILED', e);
				throw e;
			}
		}

		async function dumpList(limit = 30) {
			const list = await ddg.fs.whenReady().catch(() => null);
			if (!list) { log('dumpList: no list'); return []; }
			const arr = ddg.fs.items(list).map(it => ({
				id: it?.id,
				pathname: it?.url?.pathname,
				href: it?.url?.href || it?.href,
				slug: (typeof it?.slug === 'string' ? it.slug : (it?.fields?.slug?.value || null))
			}));
			log('dumpList: count=', arr.length, arr.slice(0, limit));
			return arr.slice(0, limit);
		}

		async function findByPath(path = window.location.pathname) {
			const list = await ddg.fs.whenReady().catch(() => null);
			if (!list) { log('findByPath: no list'); return null; }
			const p = path.startsWith('/') ? path : '/' + path;
			const slug = p.split('/').filter(Boolean).pop();
			const it = ddg.fs.items(list).find(i =>
				i?.url?.pathname === p ||
				(typeof i?.slug === 'string' ? i.slug : (i?.fields?.slug?.value || '')).toLowerCase() === slug?.toLowerCase()
			);
			log('findByPath:', p, '→', it);
			return it || null;
		}

		function watchEvents() {
			if (ddg.debug._unwatch) { log('watchEvents: already watching'); return ddg.debug._unwatch; }
			const on = (type, fn, opts) => (document.addEventListener(type, fn, opts), () => document.removeEventListener(type, fn, opts));
			const offs = [];
			offs.push(on('ddg:ajax-home-ready', () => log('evt ddg:ajax-home-ready')));
			offs.push(on('ddg:story-opened', e => log('evt ddg:story-opened', e.detail)));
			offs.push(on('ddg:current-item-changed', e => log('evt ddg:current-item-changed', { slug: e.detail?.item?.fields?.slug?.value || e.detail?.item?.slug, url: e.detail?.url })));
			offs.push(on('ddg:modal-opened', e => log('evt ddg:modal-opened', e.detail)));
			offs.push(on('ddg:modal-closed', e => log('evt ddg:modal-closed', e.detail)));
			offs.push(on('ddg:ajax-home-injected', () => log('evt ddg:ajax-home-injected')));
			offs.push(on('ddg:list-ready', e => log('evt ddg:list-ready', !!e.detail?.list)));
			offs.push(on('ddg:list-rendered', e => log('evt ddg:list-rendered', !!e.detail?.list)));
			offs.push(on('ddg:signal', e => log('evt ddg:signal', e.detail)));

			log('watchEvents: ON');
			ddg.debug._unwatch = () => { offs.forEach(off => off()); ddg.debug._unwatch = null; log('watchEvents: OFF'); };
			return ddg.debug._unwatch;
		}

		function logSelectors() {
			const listEl = document.querySelector(sel.list);
			const filtersEl = document.querySelector(sel.filters);
			const clearEl = document.querySelector(sel.clear);
			const info = { hasList: !!listEl, hasFilters: !!filtersEl, hasClear: !!clearEl, listEl, filtersEl, clearEl };
			log('selectors:', info);
			return info;
		}

		async function applySelectedRelated(parentSelector = sel.rfParent) {
			const parent = document.querySelector(parentSelector);
			if (!parent) { log('applySelectedRelated: no parent'); return; }
			const selected = parent.querySelectorAll('input[type="checkbox"][fs-list-field][fs-list-value]:checked');
			const map = {};
			selected.forEach((el) => {
				const f = el.getAttribute('fs-list-field');
				const v = el.getAttribute('fs-list-value');
				if (!f || !v) return;
				(map[f] ||= []).push(v);
			});
			log('applySelectedRelated: selections', map);
			if (!Object.keys(map).length) { log('applySelectedRelated: nothing selected'); return; }
			await ddg.fs.applyCheckboxFilters(map);
			log('applySelectedRelated: applied');
		}

		function buildRelatedNow() {
			const detail = ddg.currentItem || {};
			log('buildRelatedNow: dispatching ddg:current-item-changed with', detail);
			document.dispatchEvent(new CustomEvent('ddg:current-item-changed', { detail }));
		}

		function clickRandom() {
			log('clickRandom: clicking [data-randomfilters]');
			document.querySelector('[data-randomfilters]')?.click();
		}

		function traceFA() {
			const faObj = fa();
			if (!faObj) { log('traceFA: no FA object'); return; }
			if (!faObj.__traced) {
				const origLoad = faObj.load?.bind(faObj);
				if (origLoad) {
					faObj.load = function(...args) {
						log('FA.load called', args);
						try { return origLoad(...args).then(r => (log('FA.load resolved', args), r)).catch(e => (log('FA.load rejected', e), Promise.reject(e))); }
						catch (e) { log('FA.load threw', e); throw e; }
					};
				}
				try {
					const m = mod();
					if (m?.restart) {
						const origRestart = m.restart.bind(m);
						m.restart = function(...args) { log('FA.modules.list.restart called', args); return origRestart(...args); };
					}
				} catch {}
				faObj.__traced = true;
				log('traceFA: enabled');
			} else {
				log('traceFA: already enabled');
			}
		}

		return {
			fsStatus,
			fsNudge,
			waitFs,
			waitSignals,
			dumpList,
			findByPath,
			watchEvents,
			logSelectors,
			applySelectedRelated,
			buildRelatedNow,
			clickRandom,
			traceFA
		};
	})();

	// Site boot
	function initSite() {
		if (data.siteBooted) return;
		data.siteBooted = true;
		console.log('[ddg] booting site');

		requestAnimationFrame(() => {
			initNavigation();
			initModals();
			// Ensure listeners are ready before ajaxModal emits events
			initCurrentItemTracker();
			initRelatedFilters();
			initAjaxModal();
			initAjaxHome();
			initMarquee();
			initComingSoon();
			initShare();
			initRandomiseFilters();
		});
	}

	function initNavigation() {
		if (ddg.__navInitialized) return;
		ddg.__navInitialized = true;

		const navEl = document.querySelector('.nav');
		if (!navEl) return console.warn('[nav] no .nav element found');
		console.log('[nav] initialized');

		const showThreshold = 50; // px from top to start hiding nav
		const hideThreshold = 100; // px scrolled before nav can hide
		const revealBuffer = 50; // px scroll up needed to reveal nav

		let lastY = window.scrollY;
		let revealDistance = 0;

		// Defensive GSAP setup
		if (typeof ScrollTrigger === 'undefined' || !gsap) {
			console.warn('[nav] GSAP ScrollTrigger not available');
			return;
		}

		// Ensure a ScrollTrigger instance
		ScrollTrigger.create({
			trigger: document.body,
			start: 'top top',
			end: 'bottom bottom',
			onUpdate: () => {
				const y = ScrollTrigger?.scroll?.() ?? window.scrollY;
				const delta = y - lastY;

				// SCROLL UP / DOWN BEHAVIOR
				if (y <= showThreshold) {
					navEl.classList.remove('is-hidden', 'is-past-threshold');
					revealDistance = 0;
				} else if (delta > 0 && y > hideThreshold) {
					navEl.classList.add('is-hidden', 'is-past-threshold');
					revealDistance = 0;
				} else if (delta < 0) {
					revealDistance -= delta;
					if (revealDistance >= revealBuffer) {
						navEl.classList.remove('is-hidden');
						revealDistance = 0;
					}
				}

				navEl.classList.toggle('is-past-threshold', y > hideThreshold);

				lastY = y;
			}
		});

		console.log('[nav] ScrollTrigger active');

		// Cleanup for dynamic environments
		if (!ddg.__navCleanup) {
			ddg.__navCleanup = () => {
				console.log('[nav] cleanup triggered');
				ScrollTrigger.getAll().forEach(st => {
					if (st.trigger === document.body) st.kill();
				});
			};
		}
	}

	function initComingSoon() {
		if (ddg.__comingSoonInitialized) return;
		ddg.__comingSoonInitialized = true;

		console.log('[comingSoon] initialized');

		const splitSet = (ddg.__comingSoonSplitEls ||= new Set());
		const lineSel = '.home-list_split-line';
		const tapeSpeed = 5000;

		function getSplit(el) {
			if (el.__ddgSplit) return el.__ddgSplit;
			try {
				const split = SplitText.create(el, {
					type: 'lines',
					autoSplit: true,
					reduceWhiteSpace: true,
					tag: 'span',
					linesClass: 'home-list_split-line'
				});
				el.__ddgSplit = split;
				splitSet.add(el);
				console.log('[comingSoon] split created for', `"${el.textContent.trim()}"`);
				return split;
			} catch (e) {
				console.warn('[comingSoon] split failed', e);
				return null;
			}
		}

		function animate(el, offset) {
			const split = el.__ddgSplit || getSplit(el);
			if (!split) return;
			const lines = el.querySelectorAll(lineSel);
			if (!lines.length) return;

			console.log('[comingSoon] animate', `"${el.textContent.trim()}"`, '→', offset);
			gsap.killTweensOf(lines);
			const widths = Array.from(lines, l => l.offsetWidth);
			gsap.set(lines, { willChange: 'transform' });

			gsap.to(lines, {
				'--home-list--tape-r': offset,
				duration: i => widths[i] / tapeSpeed,
				ease: 'none',
				overwrite: 'auto',
				onComplete: () => gsap.set(lines, { clearProps: 'will-change' })
			});
		}

		$(document)
			.off('.ddgComingSoon')
			.on('mouseenter.ddgComingSoon', '.home-list_item-wrap', function () {
				if (!this.querySelector('[data-coming-soon]')) return;
				const link = this.querySelector('.home-list_item');
				if (!link) return;

				if (!link.__ddgCSInit) {
					link.__ddgCSInit = true;
					if (link.tagName === 'A') $(link).one('click.ddgComingSoon', e => e.preventDefault());
					console.log('[comingSoon] marked as coming soon:', `"${link.textContent.trim()}"`);
				}
				animate(link, 0);
			})
			.on('mouseleave.ddgComingSoon', '.home-list_item-wrap', function () {
				if (!this.querySelector('[data-coming-soon]')) return;
				const link = this.querySelector('.home-list_item');
				if (link) animate(link, '100%');
			});

		let resizeTimer;
		$(window).on('resize.ddgComingSoon', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				console.log('[comingSoon] resize → clear splits');
				for (const el of splitSet) {
					try { el.__ddgSplit?.revert(); } catch (_) { }
					delete el.__ddgSplit;
				}
				splitSet.clear();
			}, 200);
		});
	}

	function initShare() {
		if (ddg.__shareInitialized) return;
		ddg.__shareInitialized = true;

		const selectors = { btn: '[data-share]' };
		const shareWebhookUrl = 'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';
		const dailyShareKey = 'share_done_date';

		const todayString = () => new Date().toISOString().slice(0, 10);
		const nextMidnight = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d; };
		const setCookieValue = (name, value, exp) => {
			document.cookie = `${name}=${value}; expires=${exp.toUTCString()}; path=/; SameSite=Lax`;
		};
		const getCookieValue = (name) => {
			const row = document.cookie.split('; ').find(r => r.startsWith(name + '=')) || '';
			return row.split('=')[1] || null;
		};
		const markShareComplete = () => {
			const v = todayString(); const exp = nextMidnight();
			localStorage.setItem(dailyShareKey, v);
			sessionStorage.setItem(dailyShareKey, v);
			setCookieValue(dailyShareKey, v, exp);
		};
		const alreadySharedToday = () => {
			const v = todayString();
			return [localStorage.getItem(dailyShareKey), sessionStorage.getItem(dailyShareKey), getCookieValue(dailyShareKey)].includes(v);
		};

		const shareUrlMap = {
			clipboard: ({ url }) => url,
			x: ({ url, text }) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
			facebook: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
			linkedin: ({ url }) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
			whatsapp: ({ url, text }) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
			messenger: ({ url }) => `https://www.messenger.com/t/?link=${encodeURIComponent(url)}`,
			snapchat: ({ url }) => `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`,
			instagram: () => 'https://www.instagram.com/',
			telegram: ({ url, text }) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
		};

		const setState = (el, state) => {
			el.setAttribute('data-share-state', state);
			clearTimeout(el.__shareStateTimer);
			el.__shareStateTimer = setTimeout(() => {
				el.removeAttribute('data-share-state');
				el.__shareStateTimer = null;
			}, 2000);
		};

		const decrementCountdown = () => {
			$('[data-share-countdown]').each((_, el) => {
				const $el = $(el);
				let n = parseInt(el.getAttribute('data-share-countdown') || $el.text() || $el.val(), 10);
				if (!Number.isFinite(n)) n = 0;
				const next = Math.max(0, n - 1);
				$el.attr('data-share-countdown', next);
				$el.is('input, textarea') ? $el.val(next) : $el.text(next);
			});
		};

		const sendShareWebhook = (platform) => new Promise((resolve) => {
			const form = document.createElement('form');
			const iframe = document.createElement('iframe');
			const frameName = 'wf_' + Math.random().toString(36).slice(2);
			iframe.name = frameName; iframe.style.display = 'none';
			form.target = frameName; form.method = 'POST'; form.action = shareWebhookUrl; form.style.display = 'none';
			[['platform', platform], ['date', todayString()]].forEach(([name, value]) => {
				const input = document.createElement('input');
				input.type = 'hidden'; input.name = name; input.value = value;
				form.appendChild(input);
			});
			document.body.append(iframe, form);
			form.submit();
			setTimeout(() => { form.remove(); iframe.remove(); resolve(true); }, 800);
		});

		// delegated (covers injected content)
		$(document).off('click.ddgShare').on('click.ddgShare', selectors.btn, async (event) => {
			const el = event.currentTarget;
			event.preventDefault();

			// simple per-button lock
			if (el.__shareLock) return;
			el.__shareLock = true;
			setTimeout(() => { el.__shareLock = false; }, 400);

			const platform = (el.getAttribute('data-share') || '').toLowerCase();
			const shareUrl = el.getAttribute('data-share-url') || window.location.href;
			const shareText = el.getAttribute('data-share-text') || document.title;
			const resolver = shareUrlMap[platform];
			const destination = resolver ? resolver({ url: shareUrl, text: shareText }) : shareUrl;

			// minimal guard
			const realClick = event.isTrusted && document.hasFocus();

			// immediate UI feedback
			decrementCountdown();

			// webhook once/day on genuine clicks
			if (realClick && !alreadySharedToday()) {
				sendShareWebhook(platform).catch(() => { });
				markShareComplete();
			}

			if (platform === 'clipboard') {
				try {
					await navigator.clipboard.writeText(destination);
					setState(el, 'copied');
				} catch (err) {
					console.warn('[share] clipboard failed', err);
					setState(el, 'error');
				}
				return;
			}

			// open new tab; no fallbacks
			const w = window.open('about:blank', '_blank');
			if (w) {
				w.opener = null;
				w.location.href = destination;
			}
		});

		console.log('[share] ready (minimal)');
	}

	function initModals() {
		ddg.modals = ddg.modals || {};
		ddg._modalsKeydownBound = Boolean(ddg._modalsKeydownBound);
		console.log('[modals] initializing');

		const selectors = {
			trigger: '[data-modal-trigger]',
			modal: '[data-modal-el]',
			bg: '[data-modal-bg]',
			inner: '[data-modal-inner]',
			close: '[data-modal-close]',
			scrollAny: '[data-modal-scroll]',
		};

		const syncCssState = ($modal, open, id) => {
			const $bg = $(`[data-modal-bg="${id}"]`);
			const $inner = $modal.find(selectors.inner).first();
			[$modal[0], $inner[0], $bg[0]].filter(Boolean).forEach(el => {
				open ? el.classList.add('is-open') : el.classList.remove('is-open');
			});
		};

		const createModal = (id) => {
			if (ddg.modals[id]) return ddg.modals[id];

			const $modal = $(`[data-modal-el="${id}"]`);
			if (!$modal.length) return null;

			const $bg = $(`[data-modal-bg="${id}"]`);
			const $inner = $modal.find(selectors.inner).first();
			const $anim = $inner.length ? $inner : $modal;

			let lastActiveEl = null;
			let closing = false;
			let closingTl = null;

			const ensureTabIndex = (el) => {
				if (el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
			};

			const focusModal = () => {
				const node = ($inner[0] || $modal[0]);
				if (!node) return;
				ensureTabIndex(node);
				try { node.focus({ preventScroll: true }); } catch { try { node.focus(); } catch { } }
			};

			const onKeydownTrap = (e) => {
				if (e.key !== 'Tab') return;
				const root = $modal[0];
				const list = root.querySelectorAll('a[href],button,textarea,input,select,[tabindex]:not([tabindex="-1"])');
				if (!list.length) return;
				const first = list[0], last = list[list.length - 1];
				if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
				else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
			};

			const setAnimating = (on) => {
				if (!$anim[0]) return;
				if (on) gsap.set($anim[0], { willChange: 'transform, opacity' });
				else gsap.set($anim[0], { clearProps: 'will-change' });
			};

			const resolveScrollContainer = () => {
				const $global = $(`[data-modal-scroll="${id}"]`).first();
				if ($global.length) return $global[0];
				const $local = $modal.find(selectors.scrollAny).first();
				return $local[0] || $inner[0] || $modal[0];
			};

			const scrollToAnchor = (hash) => {
				if (!hash) return;
				let target = null;
				try {
					if (window.CSS?.escape) {
						target = $modal.find(`#${CSS.escape(hash)}`).first()[0] || null;
					} else {
						target = $modal.find(`[id="${hash.replace(/"/g, '\\"')}"]`).first()[0] || null;
					}
				} catch { target = null; }
				if (!target) return;

				const container = resolveScrollContainer();
				if (!container) return;

				const cRect = container.getBoundingClientRect();
				const tRect = target.getBoundingClientRect();
				const cs = getComputedStyle(target);
				const smt = parseFloat(cs.scrollMarginTop || cs.scrollMargin || '0') || 0;
				const nextTop = container.scrollTop + (tRect.top - cRect.top) - smt;

				try { container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' }); }
				catch { container.scrollTop = Math.max(0, nextTop); }

				const guard = (ev) => { if (!container.contains(ev.target)) { try { ev.preventDefault(); } catch { } } };
				window.addEventListener('wheel', guard, { capture: true, passive: false });
				window.addEventListener('touchmove', guard, { capture: true, passive: false });
				setTimeout(() => {
					window.removeEventListener('wheel', guard, true);
					window.removeEventListener('touchmove', guard, true);
				}, 900);
			};

			$modal.on('click.modalAnchors', 'a[href^="#"]', (e) => {
				const href = (e.currentTarget.getAttribute('href') || '');
				if (!href || href === '#' || href.length < 2) return;
				e.preventDefault();
				e.stopPropagation();
				scrollToAnchor(href.slice(1));
				try {
					const u = new URL(window.location.href);
					u.hash = href.slice(1);
					window.history.replaceState(window.history.state, '', u.toString());
				} catch { }
			});

			const open = ({ skipAnimation = false, afterOpen } = {}) => {
				console.log(`[modals:${id}] open (skip=${skipAnimation})`);

				Object.keys(ddg.modals).forEach(k => {
					if (k !== id && ddg.modals[k]?.isOpen?.()) ddg.modals[k].close({ skipAnimation: true });
				});

				lastActiveEl = document.activeElement;
				gsap.killTweensOf([$anim[0], $bg[0]]);
				syncCssState($modal, true, id);

				if (skipAnimation) {
					gsap.set([$bg[0], $anim[0]], { autoAlpha: 1, y: 0 });
					document.addEventListener('keydown', onKeydownTrap, true);
					requestAnimationFrame(focusModal);
					document.dispatchEvent(new CustomEvent('ddg:modal-opened', { detail: { id } }));
					return afterOpen && afterOpen();
				}

				setAnimating(true);
				gsap.set($bg[0], { autoAlpha: 0 });

				gsap.timeline({
					onComplete: () => {
						setAnimating(false);
						document.addEventListener('keydown', onKeydownTrap, true);
						requestAnimationFrame(focusModal);
						document.dispatchEvent(new CustomEvent('ddg:modal-opened', { detail: { id } }));
						afterOpen && afterOpen();
					}
				})
					.to($bg[0], { autoAlpha: 1, duration: 0.18, ease: 'power1.out' }, 0)
					.fromTo($anim[0], { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.32, ease: 'power2.out' }, 0);
			};

			const close = ({ skipAnimation = false, afterClose } = {}) => {
				if (!$modal.hasClass('is-open')) return;
				if (closing) return closingTl;

				console.log(`[modals:${id}] close (skip=${skipAnimation})`);
				closing = true;

				gsap.killTweensOf([$anim[0], $bg[0]]);

				const finish = () => {
					[$modal[0], $inner[0]].forEach(el => el?.classList.remove('is-open'));
					gsap.set([$anim[0], $bg[0], $modal[0], $inner[0]], { clearProps: 'all' });
					document.removeEventListener('keydown', onKeydownTrap, true);
					try { lastActiveEl && lastActiveEl.focus(); } catch { }
					lastActiveEl = null;
					document.dispatchEvent(new CustomEvent('ddg:modal-closed', { detail: { id } }));
					closing = false;
					closingTl = null;
					afterClose && afterClose();
				};

				if (skipAnimation) {
					$bg[0]?.classList.remove('is-open'); // remove bg first
					gsap.set([$bg[0], $anim[0]], { autoAlpha: 0, y: 40 });
					return finish();
				}

				setAnimating(true);

				// 1) remove bg is-open first
				$bg[0]?.classList.remove('is-open');

				// block any interactions while closing
				gsap.set([$modal[0], $inner[0], $bg[0]], { pointerEvents: 'none' });

				// 2) animate out
				closingTl = gsap.timeline({
					onComplete: () => { setAnimating(false); finish(); }
				});

				closingTl.to($anim[0], {
					y: 40,
					autoAlpha: 0,
					duration: 0.32,
					ease: 'power2.in',
					overwrite: 'auto'
				}, 0);

				closingTl.to($bg[0], {
					autoAlpha: 0,
					duration: 0.18,
					ease: 'power1.inOut',
					overwrite: 'auto'
				}, 0);

				return closingTl;
			};

			const isOpen = () => $modal.hasClass('is-open');

			const modal = { open, close, isOpen, $modal, $bg, $inner };
			ddg.modals[id] = modal;

			const initial = $modal.hasClass('is-open');
			syncCssState($modal, initial, id);

			document.dispatchEvent(new CustomEvent('ddg:modal-created', { detail: id }));
			return modal;
		};

		ddg.__createModal = createModal;

		$(document).on('click.modal', selectors.trigger, (e) => {
			const node = e.currentTarget;
			if (node.hasAttribute('data-ajax-modal')) return;
			e.preventDefault();
			const id = node.getAttribute('data-modal-trigger');
			const modal = createModal(id);
			modal?.open();
		});

		$(document).on('click.modal', selectors.close, (e) => {
			e.preventDefault();
			const id = e.currentTarget.getAttribute('data-modal-close');
			if (id) (ddg.modals[id] || createModal(id))?.close();
			else Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
		});

		$(document).on('click.modal', selectors.bg, (e) => {
			if (e.target !== e.currentTarget) return;
			const id = e.currentTarget.getAttribute('data-modal-bg');
			(ddg.modals[id] || createModal(id))?.close();
		});

		if (!ddg._modalsKeydownBound) {
			ddg._modalsKeydownBound = true;
			$(document).on('keydown.modal', (e) => {
				if (e.key === 'Escape') Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
			});
		}

		requestAnimationFrame(() => {
			$(selectors.modal).each((_, el) => {
				const id = el.getAttribute('data-modal-el');
				const open = el.classList.contains('is-open');
				syncCssState($(el), open, id);
			});
		});

		console.log('[modals] ready');
		document.dispatchEvent(new CustomEvent('ddg:modals-ready'));
	}

	function initAjaxModal() {
		if (ddg._ajaxModalInitialized) return;
		ddg._ajaxModalInitialized = true;

		console.log('[ajaxModal] init called');

		const storyModalId = 'story';
		const $embed = $('[data-ajax-modal="embed"]');
		const originalTitle = document.title;
		const homeUrl = '/';

		const dispatchStoryOpened = (url) => queueMicrotask(() => {
			try { document.dispatchEvent(new CustomEvent('ddg:story-opened', { detail: { url } })); } catch { }
		});

		let storyModal = ddg.modals?.[storyModalId] || null;
		const storyCache = new Map();
		let lock = false;

		let prefetchEnabled = false;
		setTimeout(() => {
			prefetchEnabled = true;
			console.log('[ajaxModal] prefetch enabled');
		}, 2000);

		const parseStory = (html) => {
			try {
				const doc = new DOMParser().parseFromString(html, 'text/html');
				const node = doc.querySelector('[data-ajax-modal="content"]');
				return { $content: node ? $(node) : null, title: doc.title || '' };
			} catch { return { $content: null, title: '' }; }
		};

		const ensureModal = () => {
			if (storyModal && storyModal.$modal?.length) return storyModal;
			if (ddg.__createModal) storyModal = ddg.__createModal(storyModalId) || storyModal;
			return storyModal;
		};

		const openStory = (url, title, $content) => {
			const modal = ensureModal();
			if (!modal) { console.warn('[ajaxModal] story modal not ready'); return; }

			$embed.empty().append($content);
			modal.open({
				afterOpen: () => {
					if (title) document.title = title;
					try { history.pushState({ modal: true }, '', url); } catch { }
					// Emit once the FA list is ready so currentItem resolves deterministically.
					ddg.fs.whenReady()
						.then(() => dispatchStoryOpened(url))
						.catch(() => dispatchStoryOpened(url));
					console.log('[ajaxModal] openStory -> updated history', url);
				}
			});
		};

		document.addEventListener('ddg:modal-closed', (ev) => {
			if (ev.detail?.id !== storyModalId) return;
			document.title = originalTitle;
			try { history.pushState({}, '', homeUrl); } catch { }
			console.log('[ajaxModal] modal closed -> restored home URL/title');
		});

		$(document).on('click.ajax', '[data-ajax-modal="link"]', (e) => {
			const $link = $(e.currentTarget);
			const linkUrl = $link.attr('href');
			if (!linkUrl) return;

			e.preventDefault();
			console.log('[ajaxModal] clicked link', linkUrl);

			if (lock) { console.log('[ajaxModal] locked'); return; }
			lock = true;

			if (storyCache.has(linkUrl)) {
				const { $content, title } = storyCache.get(linkUrl);
				openStory(linkUrl, title, $content);
				lock = false;
				return;
			}

			$embed.empty().append("<div class='modal-skeleton' aria-busy='true'></div>");

			$.ajax({
				url: linkUrl,
				success: (response) => {
					console.log('[ajaxModal] loaded', linkUrl, 'len:', response?.length ?? 0);
					const parsed = parseStory(response);
					if (!parsed.$content) parsed.$content = $("<div class='modal-error'>Failed to load content.</div>");
					storyCache.set(linkUrl, parsed);
					openStory(linkUrl, parsed.title, parsed.$content);
					if (parsed.$content?.[0]) { try { initMarquee(parsed.$content[0]); } catch { } }
				},
				error: () => {
					console.warn('[ajaxModal] load failed');
					$embed.empty().append("<div class='modal-error'>Failed to load content.</div>");
				},
				complete: () => { lock = false; console.log('[ajaxModal] complete'); }
			});
		});

		// Prefetch on hover/touch (snappy UX)
		let prefetchTimer = null;
		$(document).on('mouseenter.ajax touchstart.ajax', '[data-ajax-modal="link"]', (e) => {
			if (!prefetchEnabled) return; // 🔒 skip until 2s have passed
			const url = e.currentTarget.getAttribute('href');
			if (!url || storyCache.has(url)) return;
			clearTimeout(prefetchTimer);
			prefetchTimer = setTimeout(() => {
				$.ajax({
					url, success: (html) => {
						if (storyCache.has(url)) return;
						storyCache.set(url, parseStory(html));
						console.log('[ajaxModal] prefetched', url);
					}
				});
			}, 120);
		});

		window.addEventListener('popstate', () => {
			const path = window.location.pathname;
			const modal = ensureModal();
			if (!modal) return;
			if (!path.startsWith('/stories/') && modal.isOpen()) {
				console.log('[ajaxModal] popstate -> closing story modal');
				modal.close();
			}
		});

		const tryOpenDirectStory = () => {
			const modal = ensureModal();
			if (!modal) return console.warn('[ajaxModal] story modal not found after ready');

			if (!window.location.pathname.startsWith('/stories/')) return;

			const url = window.location.href;
			const after = () => {
				try { history.replaceState({ modal: true }, '', url); } catch { }
				ddg.fs.whenReady()
					.then(() => dispatchStoryOpened(url))
					.catch(() => dispatchStoryOpened(url));
			};

			if (modal.isOpen()) {
				console.log('[ajaxModal] direct story detected — modal already open, dispatching story-opened');
				after();
			} else {
				console.log('[ajaxModal] direct story detected — opening modal (skipAnimation)');
				modal.open({ skipAnimation: true, afterOpen: after });
			}

			// Safety recheck in case some other script closes it right after load
			setTimeout(() => {
				if (!modal.isOpen()) {
					console.log('[ajaxModal] re-opening story modal after initial close');
					modal.open({ skipAnimation: true, afterOpen: after });
				}
			}, 500);
			};

		// If modals are already initialized, run immediately; otherwise, wait.
		if (ddg.__createModal || (ddg.modals && Object.keys(ddg.modals).length)) {
			tryOpenDirectStory();
		} else {
			document.addEventListener('ddg:modals-ready', tryOpenDirectStory, { once: true });
			console.log('[ajaxModal] waiting for ddg:modals-ready');
		}
	}

	function initAjaxHome() {
		if (data.ajaxHomeLoaded || !data.truePath.startsWith('/stories/')) return;

		const $target = $('[data-ajax-home="target"]');
		if (!$target.length) return;

		$.ajax({
			url: '/',
			success: (response) => {
				const $html = $('<div>').append($.parseHTML(response));
				const $source = $html.find('[data-ajax-home="source"]');
				if (!$source.length) return;

				$target.empty().append($source.html());
				data.ajaxHomeLoaded = true;

				console.log('[ajaxHome] injected home list');

				// Let the DOM settle, then nudge FA scan. whenReady() will resolve once FA emits the list instance.
				requestAnimationFrame(() => {
					window.FinsweetAttributes ||= [];
					try { window.FinsweetAttributes.load?.('list'); } catch {}
					try { window.FinsweetAttributes.modules?.list?.restart?.(); } catch {}
					try { document.dispatchEvent(new CustomEvent('ddg:ajax-home-ready')); } catch {}
				});
			}
		});
	}

	function initRandomiseFilters() {
		const TRIGGER = '[data-randomfilters]';

		// session-scoped shuffle-bag so each click gets a new item (no repeats until we cycle)
		const state = (ddg._randomFilters ||= { bag: [] });

		const keyOf = (it) => (
			(it?.url?.pathname) ||
			(typeof it?.slug === 'string' ? it.slug : (typeof it?.fields?.slug?.value === 'string' ? it.fields.slug.value : null)) ||
			it?.id || null
		);

		const rebuildBag = (all, excludeKey) => {
			const idxs = all.map((_, i) => i).filter(i => keyOf(all[i]) !== excludeKey);
			// Fisher–Yates shuffle
			for (let i = idxs.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[idxs[i], idxs[j]] = [idxs[j], idxs[i]];
			}
			state.bag = idxs;
		};

		const nextIndex = (all) => {
			const excludeKey = ddg.currentItem?.item ? keyOf(ddg.currentItem.item) : null;
			if (!Array.isArray(state.bag) || state.bag.length === 0) rebuildBag(all, excludeKey);
			// if everything was excluded (e.g., only one item), allow all
			if (state.bag.length === 0) rebuildBag(all, null);
			return state.bag.shift();
		};

		document.addEventListener('click', async (e) => {
			const btn = e.target.closest(TRIGGER);
			if (!btn) return;
			e.preventDefault();

			// simple lock to avoid double fire
			if (btn.__rfLock) return;
			btn.__rfLock = true;
			setTimeout(() => { btn.__rfLock = false; }, 250);

			console.log('[randomfilters] trigger clicked');

			try {
				const list = await ddg.fs.whenReady();
				const all = ddg.fs.items(list);
				if (!all.length) return console.warn('[randomfilters] no items');

				const idx = nextIndex(all);
				const item = all[idx] ?? all[Math.floor(Math.random() * all.length)];
				const values = ddg.fs.valuesForItem(item);

				await ddg.fs.applyCheckboxFilters(values); // find matching checkboxes → clear → click
				console.log('[randomfilters] picked index', idx, '→ done');
			} catch (err) {
				console.warn('[randomfilters] failed', err);
			}
		}, true);
	}

	function initMarquee(root = document) {
		console.log('[marquee] init');

		const els = root.querySelectorAll('[data-marquee]:not([data-marquee-init])');
		if (!els.length) return;

		const baseSpeed = 100; // px/s
		const accelTime = 1.2; // s to reach full speed

		function startTween(el) {
			const { inner, distance, duration } = el.__ddgMarqueeConfig || {};
			if (!inner) return;
			el.__ddgMarqueeTween?.kill();

			const tween = gsap.to(inner, {
				x: -distance,
				duration,
				ease: 'none',
				repeat: -1,
				paused: true
			});
			tween.timeScale(0);
			gsap.to(tween, { timeScale: 1, duration: accelTime, ease: 'power1.out' });
			tween.play();
			el.__ddgMarqueeTween = tween;
		}

		function build(el) {
			const inner = el.querySelector('.marquee-inner');
			if (!inner || !el.offsetParent) return;

			// reset clones
			while (inner.children.length > 1 && inner.scrollWidth > el.offsetWidth * 2)
				inner.removeChild(inner.lastChild);

			const width = el.offsetWidth;
			let contentWidth = inner.scrollWidth;
			if (!width || !contentWidth) return;

			// duplicate content until 2× container width
			let i = 0;
			while (inner.scrollWidth < width * 2 && i++ < 20)
				Array.from(inner.children).forEach(c => inner.appendChild(c.cloneNode(true)));

			const totalWidth = inner.scrollWidth;
			const distance = totalWidth / 2;
			const duration = distance / baseSpeed;

			gsap.set(inner, { x: 0 });
			el.__ddgMarqueeConfig = { inner, distance, duration };
			startTween(el);
		}

		els.forEach(el => {
			el.setAttribute('data-marquee-init', '');
			el.querySelector('.marquee-inner')?.remove();

			const inner = document.createElement('div');
			inner.className = 'marquee-inner';
			while (el.firstChild) inner.appendChild(el.firstChild);
			el.appendChild(inner);

			Object.assign(el.style, { overflow: 'hidden' });
			Object.assign(inner.style, {
				display: 'flex',
				gap: getComputedStyle(el).gap || '0px',
				whiteSpace: 'nowrap',
				willChange: 'transform'
			});

			let resizeTimer;
			function handleResize() {
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(() => build(el), 200);
			}

			window.addEventListener('resize', handleResize);
			el.__ddgMarqueeCleanup = () => {
				el.__ddgMarqueeTween?.kill();
				window.removeEventListener('resize', handleResize);
				delete el.__ddgMarqueeTween;
				delete el.__ddgMarqueeConfig;
			};

			el.__ddgMarqueeReady = () => build(el);
		});

		// wait for stable fps before building any marquees
		let stable = 0, last = performance.now();
		requestAnimationFrame(function check(now) {
			const fps = 1000 / (now - last);
			last = now;
			stable = fps > 20 ? stable + 1 : 0;
			if (stable > 10) {
				console.log('[marquee] stable FPS — building');
				els.forEach(el => el.__ddgMarqueeReady?.());
			} else requestAnimationFrame(check);
		});

		// modal lifecycle integration
		document.addEventListener('ddg:modal-opened', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (modal) initMarquee(modal);
		});

		document.addEventListener('ddg:modal-closed', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (!modal) return;
			modal.querySelectorAll('[data-marquee-init]').forEach(el => {
				try { el.__ddgMarqueeCleanup?.(); } catch { }
				el.removeAttribute('data-marquee-init');
			});
		});
	}

	function initCurrentItemTracker() {
		const logPrefix = '[currentItem]';

		// exported handle
		ddg.currentItem = ddg.currentItem || { item: null, url: null, list: null };

		let lastKey = null;
		let pendingUrl = null;   // last seen story url (can arrive before list is ready)
		let hooksBound = false;

		// Reset so a re-open of the same slug re-emits
		document.addEventListener('ddg:modal-closed', (e) => {
			if (e.detail?.id === 'story') lastKey = null;
		});

		// ---- helpers ----
		function keyFor(item) {
			return (
				(item?.slug) ||
				(item?.fields?.slug?.value) ||
				(item?.url?.pathname) ||
				(item?.id) ||
				''
			);
		}

		function findItem(list, urlString) {
			if (!list) return null;
			const items = Array.isArray(list.items?.value) ? list.items.value : (list.items || []);
			if (!items.length) return null;

			const u = new URL(urlString || window.location.href, window.location.origin);
			const pathname = u.pathname;
			const slug = pathname.split('/').filter(Boolean).pop() || '';

			// 1) strict pathname match
			let found = items.find(it => {
				try { return it?.url?.pathname === pathname; }
				catch { return false; }
			});
			if (found) return found;

			// 2) fallback slug match (case-insensitive)
			if (slug) {
				const lower = slug.toLowerCase();
				found = items.find(it => {
					const s = (typeof it?.slug === 'string' ? it.slug :
						typeof it?.fields?.slug?.value === 'string' ? it.fields.slug.value : '');
					return s && s.toLowerCase() === lower;
				});
			}
			return found || null;
		}

		function setCurrent(item, url) {
			const k = keyFor(item);
			if (!k) {
				console.log(`${logPrefix} no match for`, url);
				return;
			}
			if (k === lastKey) return; // no change

			lastKey = k;
			ddg.currentItem.item = item;
			ddg.currentItem.url = url;

			console.log(`${logPrefix} current item changed →`, k, item);
			document.dispatchEvent(new CustomEvent('ddg:current-item-changed', {
				detail: { item, url }
			}));
		}

		function bindListHooks(list) {
			if (hooksBound) return;
			hooksBound = true;
			if (typeof list.addHook === 'function') list.addHook('afterRender', () => tryResolve());
			if (typeof list.watch === 'function') list.watch(() => list.items?.value, () => tryResolve());
		}

		async function ensureList() {
			if (ddg.currentItem.list) return ddg.currentItem.list;
			const list = await ddg.fs.whenReady();
			ddg.currentItem.list = list;
			console.log(`${logPrefix} list ready`, list);
			bindListHooks(list);
			return list;
		}

		async function tryResolve(url) {
			pendingUrl = url || pendingUrl || window.location.href;
			const list = ddg.currentItem.list || await ensureList();
			const item = findItem(list, pendingUrl);
			if (item) setCurrent(item, pendingUrl);
			else console.log(`${logPrefix} no match yet for`, new URL(pendingUrl, window.location.origin).pathname, '— will retry after render');
		}

		// capture early story-opened (can fire before list exists)
		document.addEventListener('ddg:story-opened', (e) => {
			pendingUrl = e.detail?.url || window.location.href;
			console.log(`${logPrefix} story-opened (global):`, pendingUrl);
			tryResolve(pendingUrl);
		});

		if (window.location.pathname.startsWith('/stories/')) {
			console.log(`${logPrefix} story page detected`);
			// On direct story load: kick both sides; whichever resolves last triggers tryResolve
			ensureList().then(() => tryResolve());
		} else {
			console.log(`${logPrefix} home page, attempting to get list`);
			ensureList().then(() => tryResolve('/'));
		}

		console.log(`${logPrefix} initialized`);
	}

	function initRelatedFilters() {
		const SEL = {
			parent: '[data-relatedfilters="parent"]',
			target: '[data-relatedfilters="target"]',
			search: '[data-relatedfilters="search"]',
			label: 'label[fs-list-emptyfacet]',
			input: 'input[type="checkbox"][fs-list-field][fs-list-value]',
			span: '.checkbox_label'
		};

		const EXCLUDE_FIELDS = new Set(['slug', 'name', 'title']);

		console.log('[relatedFilters] ready');

		function hasAnyUsableValues(values) {
			if (!values) return false;
			for (const [k, arr] of Object.entries(values)) {
				if (EXCLUDE_FIELDS.has(k)) continue;
				if (Array.isArray(arr) && arr.length) return true;
			}
			return false;
		}

		function buildAllWithRetry(item, tries = 20) {
			const values = ddg.fs.valuesForItem(item);
			if (hasAnyUsableValues(values)) {
				document.querySelectorAll(SEL.parent).forEach((parent) => {
					renderListForItem(parent, values);
					wireSearch(parent);
				});
				return;
			}
			if (tries <= 0) {
				console.warn('[relatedFilters] no usable field values yet (giving up)');
				return;
			}
			requestAnimationFrame(() => buildAllWithRetry(item, tries - 1));
		}

		function createLabelTemplate() {
			const label = document.createElement('label');
			label.className = 'checkbox_field';
			label.setAttribute('fs-list-emptyfacet', 'add-class');
			const input = document.createElement('input');
			input.type = 'checkbox';
			input.className = 'u-display-none';
			input.setAttribute('fs-list-field', '');
			input.setAttribute('fs-list-value', '');
			const span = document.createElement('span');
			span.className = 'checkbox_label';
			label.appendChild(input);
			label.appendChild(span);
			return label;
		}

		function clearTarget(target) {
			while (target.firstChild) target.removeChild(target.firstChild);
		}

		function renderListForItem(parent, itemValues) {
			const target = parent.querySelector(SEL.target);
			if (!target) return;

			// get a template label if present in DOM, else build one
			const tpl = target.querySelector(SEL.label) || createLabelTemplate();
			clearTarget(target);

			let count = 0;
			for (const [field, arr] of Object.entries(itemValues || {})) {
				if (!arr || !arr.length) continue;
				if (EXCLUDE_FIELDS.has(field)) continue;
				for (const val of Array.from(new Set(arr))) {
					const clone = tpl.cloneNode(true);
					const input = clone.querySelector(SEL.input);
					const span = clone.querySelector(SEL.span);
					if (!input || !span) continue;

					const id = `rf-${field}-${count++}`;
					input.id = id;
					input.name = `rf-${field}`;
					input.setAttribute('fs-list-field', field);
					input.setAttribute('fs-list-value', String(val));
					span.textContent = String(val);

					target.appendChild(clone);
				}
			}
			// ensure selection wiring and initial active classes
			wireSelectable(parent);
			const inputs = parent.querySelectorAll(`${SEL.target} ${SEL.input}`);
			inputs.forEach((i) => {
				const label = i.closest('label');
				if (!label) return;
				label.classList.toggle('is-list-active', i.checked);
			});
		}

		function collectSelections(parent) {
			const selected = parent.querySelectorAll(`${SEL.target} ${SEL.input}:checked`);
			const map = {};
			selected.forEach((el) => {
				const f = el.getAttribute('fs-list-field');
				const v = el.getAttribute('fs-list-value');
				if (!f || !v) return;
				(map[f] ||= []).push(v);
			});
			return map;
		}

		function wireSelectable(parent) {
			if (parent.__rfSelectableBound) return;
			parent.__rfSelectableBound = true;

			// Toggle active class when a checkbox changes
			parent.addEventListener('change', (e) => {
				const input = e.target;
				if (!input || !input.matches(SEL.input)) return;
				const label = input.closest('label');
				if (!label) return;
				label.classList.toggle('is-list-active', input.checked);
			});

			// Initialize current active states (in case of SSR or restored DOM)
			const inputs = parent.querySelectorAll(`${SEL.target} ${SEL.input}`);
			inputs.forEach((i) => {
				const label = i.closest('label');
				if (!label) return;
				label.classList.toggle('is-list-active', i.checked);
			});
		}

		function wireSearch(parent) {
			const btn = parent.querySelector(SEL.search);
			if (!btn || btn.__rfBound) return;
			btn.__rfBound = true;
			btn.addEventListener('click', async (e) => {
				e.preventDefault();
				const values = collectSelections(parent);
				if (!Object.keys(values).length) {
					console.warn('[relatedFilters] nothing selected to apply');
					return;
				}
				try {
					await ddg.fs.applyCheckboxFilters(values); // this clears then applies
					// keep local UI in sync (active classes already reflect checked state)
					const inputs = parent.querySelectorAll(`${SEL.target} ${SEL.input}`);
					inputs.forEach(i => {
						const label = i.closest('label');
						if (!label) return;
						label.classList.toggle('is-list-active', i.checked);
					});
					console.log('[relatedFilters] applied to main filters', values);
				} catch (err) {
					console.warn('[relatedFilters] failed to apply', err);
				}
			});
		}

		function buildAll(item) {
			buildAllWithRetry(item);
		}

		// Also rebuild when the Finsweet list re-renders (ensures values exist)
		try {
			ddg.fs.onRender(() => {
				if (ddg.currentItem?.item) buildAllWithRetry(ddg.currentItem.item, 8);
			});
		} catch {}

		document.addEventListener('ddg:current-item-changed', (e) => {
			const item = e.detail?.item;
			if (!item) return console.log('[relatedFilters] no item found');
			buildAllWithRetry(item);
		});
	}

	ddg.boot = initSite;
})();
