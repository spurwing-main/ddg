(function () {
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false,
		truePath: window.location.pathname,
		ajaxHomeLoaded: false
	});

	ddg.utils = {
		debounce: (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
		on: (event, fn) => document.addEventListener(event, fn),
		emit: (event, detail) => document.dispatchEvent(new CustomEvent(event, { detail })),
		fail: (msg) => { throw new Error('ddg: ' + msg); },
		assert: (cond, msg) => { if (!cond) throw new Error('ddg: ' + (msg || 'assertion failed')); },
		log: (...a) => { try { console.log('[ddg]', ...a); } catch {} },
		warn: (...a) => { try { console.warn('[ddg]', ...a); } catch {} },
		waitForStableFps: function(thresholdFps = 20, stableFrames = 10) {
			return new Promise((resolve) => {
				let stable = 0, last = performance.now();
				function check(now) {
					const fps = 1000 / (now - last);
					last = now;
					stable = fps > thresholdFps ? stable + 1 : 0;
					if (stable > stableFrames) {
						resolve();
					} else {
						requestAnimationFrame(check);
					}
				}
				requestAnimationFrame(check);
			});
		}
	};

	ddg.scrollLock = ddg.scrollLock || (() => {
		const held = new Set();
		let saved = null;
		const docEl = document.documentElement;
		const body = document.body;

		function applyLock() {
			if (saved) return;
			const scrollY = window.scrollY || docEl.scrollTop || 0;
			const scrollX = window.scrollX || docEl.scrollLeft || 0;
			saved = { x: scrollX, y: scrollY };
			// Prevent background scroll without layout shift
			body.style.position = 'fixed';
			body.style.top = `-${scrollY}px`;
			body.style.left = '0';
			body.style.right = '0';
			body.style.width = '100%';
			// Reduce bounce/overscroll behind modals
			body.style.overscrollBehavior = 'contain';
			docEl.style.overscrollBehavior = 'contain';
		}

		function removeLock() {
			if (!saved) return;
			const { x, y } = saved;
			saved = null;
			body.style.position = '';
			body.style.top = '';
			body.style.left = '';
			body.style.right = '';
			body.style.width = '';
			body.style.overscrollBehavior = '';
			docEl.style.overscrollBehavior = '';
			window.scrollTo(x, y);
		}

		function lock(key) {
			if (key) held.add(String(key));
			if (held.size === 1) applyLock();
		}
		function unlock(key) {
			if (key) held.delete(String(key));
			if (held.size === 0) removeLock();
		}
		function isLocked() { return held.size > 0; }
		function isHolding(key) { return held.has(String(key)); }
		return { lock, unlock, isLocked, isHolding };
	})();

	ddg.resizeEvent = ddg.resizeEvent || (() => {
		// Only emit when viewport WIDTH changes (ignore height-only resizes)
		// Gate with rAF + debounce for efficiency under continuous resizing
		let lastW = window.innerWidth || 0;
		let pendingW = lastW;
		let ticking = false;
		const MIN_DELTA = 16; // px threshold to consider a width change meaningful
		const emit = () => ddg.utils.emit('ddg:resize', { width: lastW, height: window.innerHeight });
		const updateAndEmit = ddg.utils.debounce(() => emit(), 180);

		function onWinResize() {
			// Capture current width immediately
			pendingW = window.innerWidth || 0;
			if (ticking) return; // coalesce multiple resize events into a single rAF tick
			ticking = true;
			requestAnimationFrame(() => {
				try {
					// Only proceed if width changed meaningfully; ignore height-only resizes
					if (Math.abs(pendingW - lastW) >= MIN_DELTA) {
						lastW = pendingW;
						updateAndEmit();
					}
				} finally {
					ticking = false;
				}
			});
		}

		window.addEventListener('resize', onWinResize, { passive: true });

		const on = (fn) => {
			if (typeof fn !== 'function') return () => { };
			const handler = (e) => fn(e?.detail || { width: window.innerWidth, height: window.innerHeight });
			ddg.utils.on('ddg:resize', handler);
			return () => document.removeEventListener('ddg:resize', handler);
		};

		return { on };
	})();

	ddg.fs = ddg.fs || (() => {
		let readyPromise = null;
		let firstResolved = false;
		let currentList = null;

		function whenReady() {
			if (firstResolved && currentList) return Promise.resolve(currentList);
			if (readyPromise) return readyPromise;
			readyPromise = new Promise((resolve) => {
				window.FinsweetAttributes ||= [];

				const finish = (instances, via) => {
					const arr = Array.isArray(instances) ? instances : [instances];
					const inst = arr.find(i => i && i.items);
					if (!inst) return;
					if (inst !== currentList) {
						currentList = inst;
						ddg.utils.emit('ddg:list-ready', { list: inst, via });
					}
					if (!firstResolved) { firstResolved = true; resolve(inst); }
				};

				try { window.FinsweetAttributes.push(['list', (instances) => finish(instances, 'push')]); } catch { }

				const mod = window.FinsweetAttributes?.modules?.list;
				if (mod?.loading?.then) mod.loading.then((i) => finish(i, 'module.loading')).catch(() => { });

				try {
					const fa = window.FinsweetAttributes;
					const attemptLoad = () => {
						try {
							const res = fa.load?.('list');
							if (res && typeof res.then === 'function') res.then(i => finish(i, 'load()')).catch(() => { });
						} catch { }
					};
					attemptLoad();
					if (!fa?.modules?.list) {
						const wait = new MutationObserver(() => {
							if (window.FinsweetAttributes?.modules?.list) {
								wait.disconnect();
								attemptLoad();
							}
						});
						wait.observe(document.documentElement, { childList: true, subtree: true });
					}
				} catch { }

				const observer = new MutationObserver(() => {
					const listEl = document.querySelector('[fs-list-element="list"]');
					if (listEl && window.FinsweetAttributes?.modules?.list) {
						try {
							const r = window.FinsweetAttributes.load?.('list');
							if (r && typeof r.then === 'function') r.then((i) => finish(i, 'observer')).catch(() => { });
						} catch { }
						if (firstResolved) observer.disconnect();
					}
				});
				if (document.body) {
					observer.observe(document.body, { childList: true, subtree: true });
				} else {
					document.addEventListener('DOMContentLoaded', () => {
						observer.observe(document.body, { childList: true, subtree: true });
					}, { once: true });
				}

				document.addEventListener('ddg:ajax-home-ready', () => {
					const m = window.FinsweetAttributes?.modules?.list;
					if (m?.loading?.then) m.loading.then((i) => finish(i, 'module.loading (ajax-home)')).catch(() => { });
					else {
						const r = window.FinsweetAttributes.load?.('list');
						if (r && typeof r.then === 'function') r.then((i) => finish(i, 'load(ddg:ajax-home-ready)')).catch(() => { });
					}
				}, { once: true });
			});
			return readyPromise;
		}

		const items = (list) => {
			const v = list?.items;
			return Array.isArray(v?.value) ? v.value : (Array.isArray(v) ? v : []);
		};

		const valuesForItemSafe = (item) => {
			const out = {};
			if (item?.fields && Object.keys(item.fields).length) {
				for (const [n, f] of Object.entries(item.fields)) {
					let v = f?.value ?? f?.rawValue ?? [];
					if (typeof v === 'string') v = v.split(',').map(s => s.trim()).filter(Boolean);
					out[n] = Array.isArray(v) ? v.map(String) : (v == null ? [] : [String(v)]);
				}
			} else if (item?.fieldData && typeof item.fieldData === 'object') {
				for (const [n, v] of Object.entries(item.fieldData)) {
					out[n] = Array.isArray(v) ? v.map(String) : (v == null ? [] : [String(v)]);
				}
			}
			return out;
		};

		function afterNextRender(list) {
			return new Promise((resolve) => {
				if (typeof list?.addHook !== 'function') return resolve();
				let done = false;
				list.addHook('afterRender', () => {
					if (done) return; done = true; resolve();
				});
			});
		}

		function toPlainCondition(c = {}) {
			return {
				id: String(c.id ?? ''),
				type: String(c.type ?? 'checkbox'),
				fieldKey: String(c.fieldKey ?? ''),
				value: String(c.value ?? ''),
				op: String(c.op ?? 'equal'),
				interacted: Boolean(c.interacted ?? true),
			};
		}

		function toPlainGroup(g = {}) {
			const conditions = Array.isArray(g.conditions) ? g.conditions.map(toPlainCondition) : [];
			return {
				id: String(g.id ?? ''),
				conditionsMatch: String(g.conditionsMatch ?? 'or'),
				conditions,
			};
		}

		function firstFieldKey(g = {}) {
			return g?.conditions?.[0]?.fieldKey || '';
		}

		async function applyCheckboxFilters(valuesByField, opts = {}) {
			const {
				formSel = '[fs-list-element="filters"]',
				merge = false,
				reflectUi = true
			} = opts;

			const list = await whenReady();

			const newGroups = Object.entries(valuesByField || {}).map(([field, vals = []]) => {
				const conditions = vals.map((v, i) => ({
					id: `auto-${field}-${i}`,
					type: 'checkbox',
					fieldKey: String(field),
					value: String(v),
					op: 'equal',
					interacted: true,
				}));
				return { id: `auto-${field}`, conditionsMatch: 'or', conditions };
			});

			const current = list.filters.value || { groupsMatch: 'and', groups: [] };

			let nextGroups;
			if (merge) {
				const existingPlain = (current.groups || []).map(toPlainGroup);
				const newPlain = newGroups.map(toPlainGroup);

				const keep = existingPlain.filter(
					g => !newPlain.some(ng => firstFieldKey(ng) === firstFieldKey(g))
				);

				nextGroups = [...keep, ...newPlain];
			} else {
				nextGroups = newGroups.map(toPlainGroup);
			}

			list.filters.value = { groupsMatch: 'and', groups: nextGroups };

			await list.triggerHook('filter');
			await afterNextRender(list); // ← ensure callers await the render

			if (reflectUi && formSel) {
				const form = document.querySelector(formSel);
				if (form) {
					const inputs = form.querySelectorAll('input[type="checkbox"][fs-list-field][fs-list-value]');
					const wantedByField = {};
					for (const [f, arr] of Object.entries(valuesByField || {})) {
						wantedByField[f] = new Set((arr || []).map(String));
					}
					inputs.forEach((input) => {
						const f = input.getAttribute('fs-list-field');
						const v = input.getAttribute('fs-list-value');
						const on = !!wantedByField[f]?.has(v);
						input.checked = on;
						input.closest('label')?.classList.toggle('is-list-active', on);
					});
				}
			}


		}

		return { whenReady, items, valuesForItemSafe, applyCheckboxFilters, afterNextRender };
	})();

	function initSite() {
		if (data.siteBooted) return;
		data.siteBooted = true;

		requestAnimationFrame(() => {
			nav();
			modals();
			currentItem();
			relatedFilters();
			ajaxStories();
			marquee();
			homelistSplit();
			outreach();
			share();
			randomFilters();
			storiesAudioPlayer()
		});
	}

	function nav() {
		if (ddg.navInitialized) return;
		ddg.navInitialized = true;

		const navEl = document.querySelector('.nav');
		if (!navEl) return;

		const showThreshold = 50; // px from top to start hiding nav
		const hideThreshold = 100; // px scrolled before nav can hide
		const revealBuffer = 50; // px scroll up needed to reveal nav

		let lastY = window.scrollY;
		let revealDistance = 0;

		// Ensure a ScrollTrigger instance
		ScrollTrigger.create({
			trigger: document.body,
			start: 'top top',
			end: 'bottom bottom',
			onUpdate: () => {
				const y = ScrollTrigger?.scroll?.() ?? window.scrollY;
				const delta = y - lastY;

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


	}

	function homelistSplit() {
		const wraps = gsap.utils.toArray('.home-list_item-wrap');
		const tapeSpeed = 5000;

		// Track mobile/desktop state to avoid heavy re-splitting on minor resizes
		const isMobile = window.innerWidth <= 767;
		ddg.homelistIsMobile = isMobile;

		// Disable SplitText behavior on small screens (<= 767px)
		if (isMobile) {
			wraps.forEach(wrap => {
				const item = wrap.querySelector('.home-list_item');
				if (item?.split) {
					item.split.revert();
					delete item.split;
					delete item.dataset.splitInit;
				}
			});
			return;
		}

		wraps.forEach(wrap => {
			const item = wrap.querySelector('.home-list_item');
			if (!item || item.dataset.splitInit) return;

			const split = new SplitText(item, {
				type: 'lines',
				linesClass: 'home-list_split-line',
				autoSplit: true
			});
			item.split = split;
			gsap.set(split.lines, {
				display: 'inline-block'
			});
			if (wrap.querySelector('[data-coming-soon]')) {
				wrap.dataset.comingSoon = 'true';
			} else {
				delete wrap.dataset.comingSoon;
			}

			item.dataset.splitInit = 'true';
		});

		function setTapeDurations() {
			requestAnimationFrame(() => {
				const lines = gsap.utils.toArray('.home-list_split-line');
				const measurements = lines.map(line => ({
					line,
					width: line.offsetWidth
				}));
				measurements.forEach(({ line, width }) => {
					const dur = gsap.utils.clamp(0.3, 2, width / tapeSpeed);
					line.style.setProperty('--tape-dur', `${dur}s`);
				});
			});
		}

		setTapeDurations();

		const handleResize = () => {
			const mobileNow = window.innerWidth <= 767;
			const wasMobile = !!ddg.homelistIsMobile;
			// Update state early
			ddg.homelistIsMobile = mobileNow;

			if (mobileNow && !wasMobile) {
				// Transitioned to mobile: revert any splits and exit
				gsap.utils.toArray('.home-list_item-wrap').forEach(wrap => {
					const item = wrap.querySelector('.home-list_item');
					if (item?.split) {
						item.split.revert();
						delete item.split;
						delete item.dataset.splitInit;
					}
				});
				return;
			}

			if (!mobileNow && wasMobile) {
				// Transitioned to desktop: initialize split on any not yet split
				gsap.utils.toArray('.home-list_item-wrap').forEach(wrap => {
					const item = wrap.querySelector('.home-list_item');
					if (!item || item.dataset.splitInit) return;
					const split = new SplitText(item, {
						type: 'lines',
						linesClass: 'home-list_split-line',
						autoSplit: true
					});
					item.split = split;
					gsap.set(split.lines, { display: 'inline-block' });
					if (wrap.querySelector('[data-coming-soon]')) {
						wrap.dataset.comingSoon = 'true';
					} else {
						delete wrap.dataset.comingSoon;
					}
					item.dataset.splitInit = 'true';
				});
				// Refresh durations on enter desktop
				setTapeDurations();
				return;
			}

			// Within the same mode: only update durations (cheap), no re-splitting
			if (!mobileNow) setTapeDurations();
		};
		if (!ddg.homelistResizeUnsub) {
			ddg.homelistResizeUnsub = ddg.resizeEvent.on(() => handleResize());
		}

		// Keep SplitText in sync with list renders — simple, deduped binding
		if (!ddg.homelistRenderHooked) {
			ddg.homelistRenderHooked = true;
			const sync = ddg.utils.debounce(() => homelistSplit(), 120);
			const bound = (ddg.homelistHookedLists ||= new WeakSet());
			const bind = (list) => {
				if (!list || typeof list.addHook !== 'function' || bound.has(list)) return;
				bound.add(list);
				list.addHook('afterRender', sync);
			};
			if (ddg.fs?.whenReady) ddg.fs.whenReady().then(bind).catch(() => { });
			ddg.utils.on('ddg:list-ready', (e) => bind(e.detail?.list));
		}
	}

	function share() {
		if (ddg.shareInitialized) return;
		ddg.shareInitialized = true;

		const selectors = { btn: '[data-share]' };
		const shareWebhookUrl = 'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';
		const dailyShareKey = 'share_done_date';


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


		$(document).off('click.ddgShare').on('click.ddgShare', selectors.btn, async (event) => {
			const el = event.currentTarget;
			event.preventDefault();

			if (el.shareLock) return;
			el.shareLock = true;
			setTimeout(() => { el.shareLock = false; }, 400);

			const platform = (el.getAttribute('data-share') || '').toLowerCase();
			const shareUrl = el.getAttribute('data-share-url') || window.location.href;
			const shareText = el.getAttribute('data-share-text') || document.title;
			const resolver = shareUrlMap[platform];
			const destination = resolver ? resolver({ url: shareUrl, text: shareText }) : shareUrl;

			const realClick = event.isTrusted && document.hasFocus();
			$('[data-share-countdown]').each((_, el2) => {
				const $el2 = $(el2);
				let n = parseInt(el2.getAttribute('data-share-countdown') || $el2.text() || $el2.val(), 10);
				if (!Number.isFinite(n)) n = 0;
				const next = Math.max(0, n - 1);
				$el2.attr('data-share-countdown', next);
				$el2.is('input, textarea') ? $el2.val(next) : $el2.text(next);
			});

			if (realClick) {
				const today = new Date().toISOString().slice(0, 10);
				const cookieRow = document.cookie.split('; ').find(r => r.startsWith(dailyShareKey + '=')) || '';
				const cookieVal = cookieRow.split('=')[1] || null;
				const done = [localStorage.getItem(dailyShareKey), sessionStorage.getItem(dailyShareKey), cookieVal].includes(today);
				if (!done) {
					const form = document.createElement('form');
					const iframe = document.createElement('iframe');
					const frameName = 'wf_' + Math.random().toString(36).slice(2);
					iframe.name = frameName; iframe.style.display = 'none';
					form.target = frameName; form.method = 'POST'; form.action = shareWebhookUrl; form.style.display = 'none';
					[['platform', platform], ['date', today]].forEach(([name, value]) => {
						const input = document.createElement('input');
						input.type = 'hidden'; input.name = name; input.value = value;
						form.appendChild(input);
					});
					document.body.append(iframe, form);
					form.submit();
					const exp = new Date(); exp.setHours(24, 0, 0, 0);
					localStorage.setItem(dailyShareKey, today);
					sessionStorage.setItem(dailyShareKey, today);
					document.cookie = `${dailyShareKey}=${today}; expires=${exp.toUTCString()}; path=/; SameSite=Lax`;
					setTimeout(() => { form.remove(); iframe.remove(); }, 800);
				}
			}

			if (platform === 'clipboard') {
				try {
					await navigator.clipboard.writeText(destination);
					el.setAttribute('data-share-state', 'copied');
					clearTimeout(el.__shareStateTimer);
					el.__shareStateTimer = setTimeout(() => { el.removeAttribute('data-share-state'); el.__shareStateTimer = null; }, 2000);
				} catch {
					el.setAttribute('data-share-state', 'error');
					clearTimeout(el.__shareStateTimer);
					el.__shareStateTimer = setTimeout(() => { el.removeAttribute('data-share-state'); el.__shareStateTimer = null; }, 2000);
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

	}

	function modals() {
		ddg.modals = ddg.modals || {};
		ddg.modalsKeydownBound = Boolean(ddg.modalsKeydownBound);

		const selectors = {
			trigger: '[data-modal-trigger]',
			modal: '[data-modal-el]',
			bg: '[data-modal-bg]',
			inner: '[data-modal-inner]',
			close: '[data-modal-close]',
			scrollAny: '[data-modal-scroll]',
		};

		// Ensure a stable baseline: reflect closed state on load before any interaction
		try {
			const root = document.documentElement;
			const initiallyOpen = document.querySelector('[data-modal-el].is-open');
			if (initiallyOpen) {
				const id = initiallyOpen.getAttribute('data-modal-el');
				root.setAttribute('data-modal-state', 'open');
				if (id) root.setAttribute('data-modal-id', id);
			} else {
				root.setAttribute('data-modal-state', 'closed');
				root.removeAttribute('data-modal-id');
			}
		} catch { }

		const syncCssState = ($modal, open, id) => {
			const $bg = $(`[data-modal-bg="${id}"]`);
			const $inner = $modal.find(selectors.inner).first();
			[$modal[0], $inner[0], $bg[0]].filter(Boolean).forEach(el => {
				open ? el.classList.add('is-open') : el.classList.remove('is-open');
			});

			// Also reflect a global state for CSS with [data-modal-state]
			try {
				const root = document.documentElement;
				if (open) {
					root.setAttribute('data-modal-state', 'open');
					root.setAttribute('data-modal-id', String(id || ''));
				} else {
					// Only mark closed if no other modal is currently open
					const anyOpen = !!document.querySelector('[data-modal-el].is-open');
					if (!anyOpen) {
						root.setAttribute('data-modal-state', 'closed');
						root.removeAttribute('data-modal-id');
					}
				}
			} catch { }
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
				node.focus({ preventScroll: true });
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
				const target = $modal.find(`#${CSS.escape(hash)}`).first()[0] || null;
				if (!target) return;

				const container = resolveScrollContainer();
				if (!container) return;

				const cRect = container.getBoundingClientRect();
				const tRect = target.getBoundingClientRect();
				const cs = getComputedStyle(target);
				const smt = parseFloat(cs.scrollMarginTop || cs.scrollMargin || '0') || 0;
				const nextTop = container.scrollTop + (tRect.top - cRect.top) - smt;

				container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });

				const guard = (ev) => { if (!container.contains(ev.target)) { ev.preventDefault?.(); } };
				window.addEventListener('wheel', guard, { capture: true, passive: false });
				window.addEventListener('touchmove', guard, { capture: true, passive: false });
				setTimeout(() => {
					window.removeEventListener('wheel', guard, true);
					window.removeEventListener('touchmove', guard, true);
				}, 900);
			};


			// handle waveform share or any button-based scroll trigger
			$modal.on('click.modalShare', 'a[href^="#"], button[href^="#"]', (e) => {
				e.preventDefault();
				e.stopPropagation();
				scrollToAnchor('share');
				const u = new URL(window.location.href);
				u.hash = 'share';
				window.history.replaceState(window.history.state, '', u.toString());
			});

			const open = ({ skipAnimation = false, afterOpen } = {}) => {

				// Lock body scroll immediately on trigger
				if (!ddg.scrollLock.isHolding(id)) {
					ddg.scrollLock.lock(id);
				}

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
					ddg.utils.emit('ddg:modal-opened', { id });
					return afterOpen && afterOpen();
				}

				setAnimating(true);
				gsap.set($bg[0], { autoAlpha: 0 });

				gsap.timeline({
					onComplete: () => {
						setAnimating(false);
						document.addEventListener('keydown', onKeydownTrap, true);
						requestAnimationFrame(focusModal);
						ddg.utils.emit('ddg:modal-opened', { id });
						afterOpen && afterOpen();
					}
				})
					.to($bg[0], { autoAlpha: 1, duration: 0.18, ease: 'power1.out', overwrite: 'auto' }, 0)
					.fromTo($anim[0], { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.32, ease: 'power2.out', overwrite: 'auto' }, 0);
			};

			const close = ({ skipAnimation = false, afterClose } = {}) => {
				if (!$modal.hasClass('is-open')) return;
				if (closing) return closingTl;

				closing = true;

				// Unlock body scroll immediately on close trigger
				ddg.scrollLock.unlock(id);

				gsap.killTweensOf([$anim[0], $bg[0]]);

				const finish = () => {
					[$modal[0], $inner[0]].forEach(el => el?.classList.remove('is-open'));
					gsap.set([$anim[0], $bg[0], $modal[0], $inner[0]], { clearProps: 'all' });
					document.removeEventListener('keydown', onKeydownTrap, true);
					if (lastActiveEl) lastActiveEl.focus();
					lastActiveEl = null;
					syncCssState($modal, false, id);
					ddg.utils.emit('ddg:modal-closed', { id });
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

				$bg[0]?.classList.remove('is-open');

				gsap.set([$modal[0], $inner[0], $bg[0]], { pointerEvents: 'none' });

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

			ddg.utils.emit('ddg:modal-created', id);
			return modal;
		};

		ddg.createModal = createModal;

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

		window.addEventListener('message', (ev) => {
			const data = ev?.data;
			if (!data) return;
			const type = data.type || data.event;
			if (type === 'ddg:modal-close' || type === 'iframe:close-modal') {
				const id = data.id || data.modalId || 'story';
				(ddg.modals[id] || createModal(id))?.close();
			}
		});

		// If a close button exists inside a same-origin iframe within the modal,
		// delegate its click to the parent close logic.
		ddg.utils.on('ddg:modal-opened', (ev) => {
			const id = ev.detail?.id;
			if (!id) return;
			const modalEl = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modalEl) return;
			modalEl.querySelectorAll('iframe').forEach((frame) => {
				const doc = frame.contentDocument;
				const handler = (e) => {
					const target = e.target && (e.target.closest ? e.target.closest('[data-modal-close]') : null);
					if (target) {
						e.preventDefault?.();
						(ddg.modals[id] || createModal(id))?.close();
					}
				};
				doc.addEventListener('click', handler);
				frame.__ddgIframeCloseHandler = handler;
			});
		});

		ddg.utils.on('ddg:modal-closed', (ev) => {
			const id = ev.detail?.id;
			if (!id) return;
			const modalEl = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modalEl) return;
			modalEl.querySelectorAll('iframe').forEach((frame) => {
				const doc = frame.contentDocument;
				doc.removeEventListener('click', frame.__ddgIframeCloseHandler);
				delete frame.__ddgIframeCloseHandler;
			});
		});

		if (!ddg.modalsKeydownBound) {
			ddg.modalsKeydownBound = true;
			$(document).on('keydown.modal', (e) => {
				if (e.key === 'Escape') Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
			});
		}

        requestAnimationFrame(() => {
            $(selectors.modal).each((_, el) => {
                const id = el.getAttribute('data-modal-el');
                const open = el.classList.contains('is-open');
                syncCssState($(el), open, id);
                if (open && !ddg.scrollLock.isHolding(id)) {
                    ddg.scrollLock.lock(id);
                }
                // Emit an open event for any modal already open at init
                if (open) ddg.utils.emit('ddg:modal-opened', { id });
            });
        });

		ddg.utils.emit('ddg:modals-ready');
	}

	function ajaxStories() {
		if (ddg.ajaxModalInitialized) return;
		ddg.ajaxModalInitialized = true;


		const storyModalId = 'story';
		const $embed = $('[data-ajax-modal="embed"]');
		const originalTitle = document.title;
		const homeUrl = '/';

		const dispatchStoryOpened = (url) => queueMicrotask(() => {
			ddg.utils.emit('ddg:story-opened', { url });
		});

		let storyModal = ddg.modals?.[storyModalId] || null;
		const storyCache = new Map();
		let lock = false;

		let prefetchEnabled = false;
		setTimeout(() => { prefetchEnabled = true; }, 2000);

		const parseStory = (html) => {
			const doc = new DOMParser().parseFromString(html, 'text/html');
			const node = doc.querySelector('[data-ajax-modal="content"]');
			return { $content: node ? $(node) : null, title: doc.title || '' };
		};

		const ensureModal = () => {
			if (storyModal && storyModal.$modal?.length) return storyModal;
			if (ddg.createModal) storyModal = ddg.createModal(storyModalId) || storyModal;
			return storyModal;
		};

		const openStory = (url, title, $content) => {
			const modal = ensureModal();
			if (!modal) { return; }

			$embed.empty().append($content);
			modal.open({
				afterOpen: () => {
					if (title) document.title = title;
					history.pushState({ modal: true }, '', url);
					// Notify parent of new URL if in iframe
					if (window !== window.parent) {
						window.parent.postMessage({
							type: 'iframe:url-change',
							url,
							title: document.title
						}, '*');
					}
					ddg.fs.whenReady()
						.then(() => dispatchStoryOpened(url))
						.catch(() => dispatchStoryOpened(url));

				}
			});
		};

		ddg.utils.on('ddg:modal-closed', (ev) => {
			if (ev.detail?.id !== storyModalId) return;
			document.title = originalTitle;
			history.pushState({}, '', homeUrl);
			if (window !== window.parent) {
				window.parent.postMessage({
					type: 'iframe:url-change',
					url: homeUrl,
					title: originalTitle
				}, '*');
			}

		});

		$(document).on('click.ajax', '[data-ajax-modal="link"]', (e) => {
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1 || e.button === 2) return;

			const root = e.currentTarget;
			let linkUrl = root.getAttribute('href') || '';
			if (!linkUrl) {
				const candidate = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
				if (candidate && root.contains(candidate)) linkUrl = candidate.getAttribute('href') || '';
			}
			if (!linkUrl) {
				const a = root.querySelector ? root.querySelector('a[href]') : null;
				if (a) linkUrl = a.getAttribute('href') || '';
			}
			if (!linkUrl) return;

			e.preventDefault();

			if (lock) { return; }
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
					const parsed = parseStory(response);
					if (!parsed.$content) parsed.$content = $("<div class='modal-error'>Failed to load content.</div>");
					storyCache.set(linkUrl, parsed);
					openStory(linkUrl, parsed.title, parsed.$content);
					if (parsed.$content?.[0]) { marquee(parsed.$content[0]); }
				},
				error: () => {
					$embed.empty().append("<div class='modal-error'>Failed to load content.</div>");
				},
				complete: () => { lock = false; }
			});
		});

		let prefetchTimer = null;
		$(document).on('mouseenter.ajax touchstart.ajax', '[data-ajax-modal="link"]', (e) => {
			if (!prefetchEnabled) return; // 🔒 skip until 2s have passed
			const root = e.currentTarget;
			let url = root.getAttribute('href') || '';
			if (!url) {
				const candidate = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
				if (candidate && root.contains(candidate)) url = candidate.getAttribute('href') || '';
			}
			if (!url) {
				const a = root.querySelector ? root.querySelector('a[href]') : null;
				if (a) url = a.getAttribute('href') || '';
			}
			if (!url || storyCache.has(url)) return;
			clearTimeout(prefetchTimer);
			prefetchTimer = setTimeout(() => {
				$.ajax({
					url, success: (html) => {
						if (storyCache.has(url)) return;
						storyCache.set(url, parseStory(html));

					}
				});
			}, 120);
		});

		window.addEventListener('popstate', () => {
			const path = window.location.pathname;
			const modal = ensureModal();
			if (!modal) return;
			if (!path.startsWith('/stories/') && modal.isOpen()) {
				modal.close();
			}
		});

		const tryOpenDirectStory = () => {
			const modal = ensureModal();
			if (!modal) return;

			if (!window.location.pathname.startsWith('/stories/')) return;

			const url = window.location.href;
			const after = () => {
				history.replaceState({ modal: true }, '', url);
				ddg.fs.whenReady()
					.then(() => dispatchStoryOpened(url))
					.catch(() => dispatchStoryOpened(url));
			};

			if (modal.isOpen()) {
				after();
			} else {
				modal.open({ skipAnimation: true, afterOpen: () => after() });
			}
		};

		// If modals are already initialized, run immediately; otherwise, wait.
		if (ddg.createModal || (ddg.modals && Object.keys(ddg.modals).length)) {
			tryOpenDirectStory();
		} else {
			document.addEventListener('ddg:modals-ready', tryOpenDirectStory, { once: true });
		}
	}

	function randomFilters() {
		const selectors = { trigger: '[data-randomfilters]' };
		const state = (ddg.randomFilters ||= { bag: [] });

		const keyOf = (it) => (
			it?.url?.pathname ||
			it?.slug ||
			it?.fields?.slug?.value ||
			it?.id || null
		);

		const rebuildBag = (all, excludeKey) => {
			const ids = all.map((_, i) => i).filter(i => keyOf(all[i]) !== excludeKey);
			for (let i = ids.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[ids[i], ids[j]] = [ids[j], ids[i]];
			}
			state.bag = ids;
		};

		const nextIndex = (all) => {
			const excludeKey = ddg.currentItem?.item ? keyOf(ddg.currentItem.item) : null;
			if (!Array.isArray(state.bag) || !state.bag.length) rebuildBag(all, excludeKey);
			if (!state.bag.length) rebuildBag(all, null);
			return state.bag.shift();
		};

		document.addEventListener('click', async (e) => {
			const btn = e.target.closest(selectors.trigger);
			if (!btn) return;
			e.preventDefault();

			if (btn.rfLock) return;
			btn.rfLock = true;
			setTimeout(() => (btn.rfLock = false), 250);

			const list = await ddg.fs.whenReady();
			const all = ddg.fs.items(list);
			if (!all.length) return;

			const idx = nextIndex(all);
			const item = all[idx] ?? all[Math.floor(Math.random() * all.length)];
			const values = ddg.fs.valuesForItemSafe(item);

			await ddg.fs.applyCheckboxFilters(values, { merge: false });
		}, true);
	}

	function marquee(root = document) {

		const els = root.querySelectorAll('[data-marquee]:not([data-marquee-init])');
		if (!els.length) return;

		const MIN_W = 320;
		const MAX_W = 1440;
		const vwPerSec = 12; // viewport-width units per second (fixed for all marquees)
		const fixedPxPerSec = 100; // legacy fixed speed (px/s) baseline
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
				paused: true,
				overwrite: 'auto'
			});
			tween.timeScale(0);
			gsap.to(tween, { timeScale: 1, duration: accelTime, ease: 'power1.out', overwrite: 'auto' });
			tween.play();
			el.__ddgMarqueeTween = tween;
		}

		function build(el) {
			const inner = el.querySelector('.marquee-inner');
			if (!inner || !el.offsetParent) return;


			// Capture original content once, then rebuild from it each time
			if (!el.__ddgMarqueeOriginal) {
				el.__ddgMarqueeOriginal = Array.from(inner.children).map(n => n.cloneNode(true));
			}
			inner.textContent = '';
			el.__ddgMarqueeOriginal.forEach(n => inner.appendChild(n.cloneNode(true)));

			const width = el.offsetWidth;
			let contentWidth = inner.scrollWidth;
			if (!width || !contentWidth) return;

			const baseWidth = inner.scrollWidth;
			let minTotal = Math.max(width * 2, baseWidth * 2);
			let copies = Math.ceil(minTotal / Math.max(1, baseWidth));
			if (copies % 2 !== 0) copies += 1; // ensure even number for seamless half-swap
			for (let k = 1; k < copies; k++) {
				el.__ddgMarqueeOriginal.forEach(n => inner.appendChild(n.cloneNode(true)));
			}

			const totalWidth = inner.scrollWidth;
			const distance = totalWidth / 2;
			const effW = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth));
			const speedPxPerSec = (vwPerSec / 100) * effW;
			const dynamicDuration = distance / Math.max(1, speedPxPerSec);
			const fixedDuration = distance / fixedPxPerSec;
			const duration = Math.max(fixedDuration, dynamicDuration);

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

			const unsubResize = ddg.resizeEvent.on(() => build(el));
			el.__ddgMarqueeCleanup = () => {
				el.__ddgMarqueeTween?.kill();
				if (typeof unsubResize === 'function') unsubResize();
				delete el.__ddgMarqueeTween;
				delete el.__ddgMarqueeConfig;
			};

			el.__ddgMarqueeReady = () => build(el);
		});

		let stable = 0, last = performance.now();
		requestAnimationFrame(function check(now) {
			const fps = 1000 / (now - last);
			last = now;
			stable = fps > 20 ? stable + 1 : 0;
			if (stable > 10) {
				els.forEach(el => el.__ddgMarqueeReady?.());
			} else requestAnimationFrame(check);
		});

		ddg.utils.on('ddg:modal-opened', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (modal) marquee(modal);
		});

		ddg.utils.on('ddg:modal-closed', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (!modal) return;
			modal.querySelectorAll('[data-marquee-init]').forEach(el => {
				el.__ddgMarqueeCleanup?.();
				el.removeAttribute('data-marquee-init');
			});
		});
	}

	function storiesAudioPlayer() {
		// Use centralized utils for logging
		const log = (...a) => ddg.utils.log('[audio]', ...a);
		const warn = (...a) => ddg.utils.warn('[audio]', ...a);

		let activePlayer = null;

		// ---- Helpers ----
		const disable = (btn, state = true) => { if (btn) btn.disabled = !!state; };

		const setPlayState = (playBtn, playIcon, pauseIcon, playing) => {
			playBtn.setAttribute('data-state', playing ? 'playing' : 'paused');
			playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
			if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
			if (pauseIcon) pauseIcon.style.display = playing ? 'grid' : 'none';
		};

		const setMuteState = (muteBtn, muteIcon, unmuteIcon, muted) => {
			muteBtn.setAttribute('data-state', muted ? 'muted' : 'unmuted');
			muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
			if (muteIcon) muteIcon.style.display = muted ? 'none' : 'block';
			if (unmuteIcon) unmuteIcon.style.display = muted ? 'block' : 'none';
		};

		const cleanupActive = () => {
			if (!activePlayer) return;
			const { el, wavesurfer } = activePlayer;
			try { wavesurfer?.destroy(); } catch (err) { warn('cleanup failed', err); }
			el.removeAttribute('data-audio-init');
			activePlayer = null;
			log('cleaned up');
		};

		// ---- Build player ----
		const buildAudio = (modalEl) => {
			if (!modalEl) { warn('No modal element'); return; }
			const playerEl = modalEl.querySelector('.story-player');
			if (!playerEl) { warn('No .story-player found'); return; }
			if (playerEl.hasAttribute('data-audio-init')) return;

			cleanupActive(); // ensure only one at a time

			const audioUrl = playerEl.dataset.audioUrl;
			if (!audioUrl) { warn('Missing data-audio-url', playerEl); return; }

			const waveformEl = playerEl.querySelector('.story-player_waveform');
			const playBtn = playerEl.querySelector('[data-player="play"]');
			const muteBtn = playerEl.querySelector('[data-player="mute"]');
			if (!waveformEl || !playBtn || !muteBtn) { warn('Missing waveform/play/mute buttons', playerEl); return; }

			const playIcon = playBtn.querySelector('.circle-btn_icon.is-play');
			const pauseIcon = playBtn.querySelector('.circle-btn_icon.is-pause');
			const muteIcon = muteBtn.querySelector('.circle-btn_icon.is-mute');
			const unmuteIcon = muteBtn.querySelector('.circle-btn_icon.is-unmute');

			playerEl.dataset.audioInit = 'true';
			log('building player', audioUrl);

			let wavesurfer = null;
			let isMuted = false;
			let isPlaying = false;

			// Dynamically read the rendered height of the container
			const containerHeight = waveformEl.offsetHeight || 42;

			// ---- WaveSurfer ----
			try {
				if (typeof WaveSurfer === 'undefined') throw new Error('WaveSurfer not available');
				wavesurfer = WaveSurfer.create({
					container: waveformEl,
					height: containerHeight,
					waveColor: '#b6b83b',
					progressColor: '#2C2C2C',
					cursorColor: '#2C2C2C',
					normalize: true,
					barWidth: 2,
					barGap: 1,
					dragToSeek: true,
					interact: true,
					url: audioUrl
				});
			} catch (err) { warn(err?.message || 'WaveSurfer init failed', playerEl); return; }

			// ---- Initial UI ----
			disable(playBtn, true);
			disable(muteBtn, true);
			setPlayState(playBtn, playIcon, pauseIcon, false);
			setMuteState(muteBtn, muteIcon, unmuteIcon, false);

			wavesurfer.once('ready', () => {
				disable(playBtn, false);
				disable(muteBtn, false);
				log('waveform ready');
			});

			// ---- Events ----
			wavesurfer.on('play', () => {
				isPlaying = true;
				setPlayState(playBtn, playIcon, pauseIcon, true);
				// Pause other players
				document.querySelectorAll('.story-player[data-audio-init]').forEach((el) => {
					if (el !== playerEl && el.__ws && typeof el.__ws.pause === 'function') el.__ws.pause();
				});
			});

			wavesurfer.on('pause', () => {
				isPlaying = false;
				setPlayState(playBtn, playIcon, pauseIcon, false);
			});

			wavesurfer.on('finish', () => {
				isPlaying = false;
				setPlayState(playBtn, playIcon, pauseIcon, false);
			});

			playBtn.addEventListener('click', () => {
				try { wavesurfer.playPause(); }
				catch (err) { warn('playPause failed', err); }
			});

			muteBtn.addEventListener('click', () => {
				try {
					isMuted = !isMuted;
					wavesurfer.setMuted(isMuted);
					setMuteState(muteBtn, muteIcon, unmuteIcon, isMuted);
				} catch (err) { warn('mute toggle failed', err); }
			});

			playerEl.__ws = wavesurfer;
			activePlayer = { el: playerEl, wavesurfer };
		};

		// ---- Modal lifecycle ----
		const onModalOpened = (e) => {
			const id = e.detail?.id;
			const modal = document.querySelector(`[data-modal-el="${id}"]`);
			if (modal) buildAudio(modal);
		};

		const onModalClosed = (e) => {
			const id = e.detail?.id;
			const modal = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modal) return;
			const playerEl = modal.querySelector('.story-player[data-audio-init]');
			if (playerEl && activePlayer && activePlayer.el === playerEl) cleanupActive();
		};

		// Attach once
		document.addEventListener('ddg:modal-opened', onModalOpened);
		document.addEventListener('ddg:modal-closed', onModalClosed);
		log('storiesAudioPlayer initialized');
	}

	function outreach(root = document) {
		const recs = Array.from(root.querySelectorAll('.recorder:not([data-outreach-init])'));
		if (!recs.length) return;

		recs.forEach((recorder) => {
			const btnRecord = recorder.querySelector('#rec-record');
			const btnPlay = recorder.querySelector('#rec-playback');
			const btnClear = recorder.querySelector('#rec-clear');
			const btnSave = recorder.querySelector('#rec-save');
			const btnSubmit = recorder.querySelector('#rec-submit');
			const msg = recorder.querySelector('.recorder_msg-l, .recorder_msg-s') || recorder.querySelector('.recorder_msg-l');
			const prog = recorder.querySelector('.recorder_timer');
			const form = recorder.querySelector('#rec-form');
			const visRecordSel = '.recorder_visualiser.is-record';
			const visPlaybackSel = '.recorder_visualiser.is-playback';
			if (!btnRecord || !btnPlay || !btnClear || !btnSave || !btnSubmit || !msg || !prog || !form) return;

			recorder.setAttribute('data-outreach-init', '');

			let status = 'ready';
			let wsRec = null;
			let wsPlayback = null;
			let recordPlugin = null;
			let recordedBlob = null;
			let isRecording = false;
			let sound = new Audio();
			let welcomeHasPlayed = false;

			const welcomeURL = 'https://res.cloudinary.com/daoliqze4/video/upload/v1741701256/welcome_paoycn.mp3';
			const click1 = 'https://res.cloudinary.com/daoliqze4/video/upload/v1741276319/click-1_za1q7j.mp3';
			const click2 = 'https://res.cloudinary.com/daoliqze4/video/upload/v1741276319/click-2_lrgabh.mp3';

			function setStatus(next) {
				recorder.setAttribute('ddg-status', next);
				status = next;
				return status;
			}

			function updateMessage(text, size) {
				if (!msg) return;
				msg.innerHTML = text ? String(text) : 'Ready?';
				if (size === 'small') {
					msg.classList.remove('recorder_msg-l');
					msg.classList.add('recorder_msg-s');
				} else {
					msg.classList.remove('recorder_msg-s');
					msg.classList.add('recorder_msg-l');
				}
			}

			function updateProgress(time, units) {
				if (!prog) return;
				let mm, ss;
				if (units === 's') {
					mm = Math.floor((time % 3600000) / 60);
					ss = Math.floor((time % 60000) / 1);
				} else {
					mm = Math.floor((time % 3600000) / 60000);
					ss = Math.floor((time % 60000) / 1000);
				}
				prog.textContent = [mm, ss].map(v => (v < 10 ? '0' + v : v)).join(':');
			}

			function beep(duration = 500, frequency = 1000, volume = 1) {
				const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
				const oscillator = audioCtx.createOscillator();
				const gainNode = audioCtx.createGain();
				oscillator.type = 'sine';
				oscillator.frequency.value = frequency;
				gainNode.gain.value = volume;
				oscillator.connect(gainNode);
				gainNode.connect(audioCtx.destination);
				oscillator.start();
				setTimeout(() => { oscillator.stop(); audioCtx.close(); }, duration);
			}

			function addSounds() {
				recorder.querySelectorAll('.recorder_btn').forEach((button) => {
					button.addEventListener('mousedown', () => { sound = new Audio(click1); sound.play(); });
					button.addEventListener('mouseup', () => { sound = new Audio(click2); sound.play(); });
				});
			}

			function qsParam(name) { return new URLSearchParams(window.location.search).get(name); }

			function redirectError() { window.location.replace('/share-your-story-error'); }
			function redirectSuccess(id) { window.location.replace('/share-your-story-success?ddg_id=' + encodeURIComponent(id || '')); }

			function loadData() {
				const ddgId = qsParam('ddg_id');
				const isTestMode = qsParam('test_mode');
				const name = qsParam('ddg_name');

				if (!ddgId) {
					updateMessage('Error :(');
					recorder.style.pointerEvents = 'none';
					redirectError();
					return { ddgId, isTestMode };
				}

				const ddgIdInput = recorder.querySelector('#ddg-id');
				if (ddgIdInput) ddgIdInput.value = ddgId;

				if (name) {
					const section = document.querySelector('.outreach-hero');
					if (section) {
						if (name.length > 12) section.classList.add('is-sm');
						else if (name.length > 6) section.classList.add('is-md');
					}
					document.querySelectorAll('.outreach-hero_word.is-name').forEach(el => { el.textContent = name; });
					gsap.to('.outreach-hero_content', { autoAlpha: 1, duration: 0.1, overwrite: 'auto' });
				}

				return { ddgId, isTestMode };
			}

			async function checkSubmission(ddgId) {
				const res = await fetch('https://hook.eu2.make.com/82eitnupdvhl1yn3agge1riqmonwlvg3?ddg_id=' + encodeURIComponent(ddgId));
				const data = await res.json();
				if (!data) return redirectError();
				if (data.status === 'no-id') return redirectError();
				if (data.status === 'recording') return redirectSuccess(ddgId);
			}

			function wireRecorder(ddgId) {
				// Initial disabled states
				btnPlay.disabled = true;
				btnClear.disabled = true;
				btnSave.disabled = true;

				function createWaveSurfer() {
					if (wsRec) { wsRec.destroy(); }
					wsRec = WaveSurfer.create({
						container: visRecordSel,
						waveColor: 'rgb(0, 0, 0)',
						progressColor: 'rgb(0, 0, 0)',
						normalize: false,
						barWidth: 4,
						barGap: 6,
						barHeight: 2.5
					});

					recordPlugin = wsRec.registerPlugin(WaveSurfer.Record.create({
						renderRecordedAudio: false,
						scrollingWaveform: false,
						continuousWaveform: false,
						continuousWaveformDuration: 30
					}));

					recordPlugin.on('record-progress', (time) => updateProgress(time));
					recordPlugin.on('record-end', (blob) => {
						recordedBlob = blob;
						if (isRecording) {
							setStatus('saved');
							const url = URL.createObjectURL(blob);
							if (wsPlayback) { wsPlayback.destroy(); }
							wsPlayback = WaveSurfer.create({
								container: visPlaybackSel,
								waveColor: '#B1B42E',
								progressColor: 'rgb(0, 0, 0)',
								normalize: false,
								barWidth: 4,
								barGap: 6,
								barHeight: 2.5,
								url
							});

							btnPlay.onclick = () => wsPlayback.playPause();
							wsPlayback.on('pause', () => { if (status === 'playback') setStatus('saved'); });
							wsPlayback.on('play', () => setStatus('playback'));
							wsPlayback.on('timeupdate', (t) => updateProgress(t, 's'));
						}
					});
				}

				function startRecording() {
					isRecording = true;
					btnRecord.disabled = false;
					btnSave.disabled = false;
					btnClear.disabled = false;
					btnPlay.disabled = true;
					if (recordPlugin.isRecording()) {
						setStatus('recording-paused');
						recordPlugin.pauseRecording();
						wsRec.empty();
						updateMessage('Recording paused.<br>You can continue adding to your recording, and when you\'re finished, hit Save to listen back.', 'small');
						return;
					} else if (recordPlugin.isPaused()) {
						setStatus('recording');
						recordPlugin.resumeRecording();
						return;
					} else {
						recordPlugin.startRecording().then(() => setStatus('recording'));
					}
				}

				btnRecord.onclick = async () => {
					btnSave.disabled = true;
					btnClear.disabled = true;
					btnPlay.disabled = true;
					btnRecord.disabled = true;
					btnSubmit.disabled = true;

					if (!welcomeHasPlayed) {
						welcomeHasPlayed = true;
						setStatus('welcome');
						sound = new Audio(welcomeURL);
						await sound.play();
						updateMessage('👋<br>What\'s the craic!<br>You\'ve reached the DropDeadGenerous answering machine.<br>Leave your story after the tone...', 'small');

						sound.onended = async () => {
							updateMessage('3', 'large'); await new Promise(r => setTimeout(r, 1000));
							updateMessage('2', 'large'); await new Promise(r => setTimeout(r, 1000));
							updateMessage('1', 'large'); await new Promise(r => setTimeout(r, 1000));
							beep(300, 900, 0.7);
							await new Promise(r => setTimeout(r, 700));
							startRecording();
						};
					} else {
						startRecording();
					}
				};

				btnSave.onclick = () => {
					setStatus('saved');
					recordPlugin.stopRecording();
					btnPlay.disabled = false;
					btnClear.disabled = false;
					btnSave.disabled = false;
					btnRecord.disabled = false;
					btnSubmit.disabled = false;
					updateMessage('Hit the submit button to send us your voice recording. You can only do this once, so feel free to play it back and have a listen 👂', 'small');
				};

				btnClear.onclick = () => {
					if (status === 'playback' && wsPlayback) wsPlayback.pause();
					setStatus('ready');
					updateMessage();
					isRecording = false;
					recordPlugin.stopRecording();
					wsRec.empty();
					btnClear.disabled = true;
					btnPlay.disabled = true;
					btnSave.disabled = true;
					btnRecord.disabled = false;
				};

				btnSubmit.addEventListener('click', async (e) => {
					e.preventDefault();

					if (status === 'playback' && wsPlayback) wsPlayback.pause();
					setStatus('submitting');
					updateMessage('Uploading your recording...', 'small');

					if (!recordedBlob) return;

					const formData = new FormData();
					formData.append('file', recordedBlob, ddgId + '.webm');
					formData.append('upload_preset', 'ddg-recordings');

					const resp = await fetch('https://api.cloudinary.com/v1_1/daoliqze4/video/upload', {
						method: 'POST', body: formData
					});
					const data = await resp.json();
					if (!data.secure_url) { redirectError(); return; }

					form.querySelector('#file-url').value = data.secure_url;
					form.querySelector('[type="submit"]').click();
				});

				form.addEventListener('submit', (e) => {
					e.preventDefault();
					redirectSuccess(ddgId);
				});

				addSounds();
				createWaveSurfer();
			}

			const { ddgId, isTestMode } = loadData();
			if (!ddgId) return;
			if (!isTestMode) {
				checkSubmission(ddgId).catch(() => { });
			}
			setStatus('ready');
			wireRecorder(ddgId);
		});
	}

	function currentItem() {
		const logPrefix = '[currentItem]';

		ddg.currentItem = ddg.currentItem || { item: null, url: null, list: null };

		let lastKey = null;
		let pendingUrl = null;   // last seen story url (can arrive before list is ready)
		let hooksBound = false;

		ddg.utils.on('ddg:modal-closed', (e) => {
			if (e.detail?.id === 'story') lastKey = null;
		});

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

			let found = items.find(it => it?.url?.pathname === pathname);
			if (found) return found;

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
			if (!k) { return; }
			if (k === lastKey) return; // no change

			lastKey = k;
			ddg.currentItem.item = item;
			ddg.currentItem.url = url;

			ddg.utils.emit('ddg:current-item-changed', { item, url });
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
			bindListHooks(list);
			return list;
		}

		async function tryResolve(url) {
			pendingUrl = url || pendingUrl || window.location.href;
			const list = ddg.currentItem.list || await ensureList();
			const item = findItem(list, pendingUrl);
			if (item) { setCurrent(item, pendingUrl); return; }


		}

		// capture early story-opened (can fire before list exists)
		ddg.utils.on('ddg:story-opened', (e) => {
			pendingUrl = e.detail?.url || window.location.href;
			tryResolve(pendingUrl);
		});

		if (window.location.pathname.startsWith('/stories/')) {
			// On direct story load: kick both sides; whichever resolves last triggers tryResolve
			ensureList().then(() => tryResolve());
		} else {
			ensureList().then(() => tryResolve('/'));
		}

		// Force reconciliation after list becomes ready (critical for /stories/ pages)
		ddg.utils.on('ddg:list-ready', (e) => {
			const newList = e.detail?.list;
			if (newList && newList !== ddg.currentItem.list) {
				ddg.currentItem.list = newList;
				hooksBound = false;          // allow rebinding on the new instance
				bindListHooks(newList);
			}
			if (window.location.pathname.startsWith('/stories/')) {
				tryResolve(window.location.href);
			}
		});

	}

	function relatedFilters() {
		const selectors = {
			parent: '[data-relatedfilters="parent"]',
			target: '[data-relatedfilters="target"]',
			search: '[data-relatedfilters="search"]',
			label: 'label[fs-list-emptyfacet]',
			input: 'input[type="checkbox"][fs-list-field][fs-list-value]',
			span: '.checkbox_label'
		};

		const excludeFields = new Set(['slug', 'name', 'title']);


		Array.from(document.querySelectorAll(selectors.target)).forEach((el) => clearTarget(el));

		function hasAnyUsableValues(values) {
			if (!values) return false;
			for (const [k, arr] of Object.entries(values)) {
				if (excludeFields.has(k)) continue;
				if (Array.isArray(arr) && arr.length) return true;
			}
			return false;
		}

		function buildAll(item) {
			const values = ddg.fs.valuesForItemSafe(item);

			// Always clear targets first; if no usable values, leave empty
			const parents = Array.from(document.querySelectorAll(selectors.parent));
			parents.forEach((parent) => {
				const target = parent.querySelector(selectors.target);
				if (target) clearTarget(target);
			});

			if (!hasAnyUsableValues(values)) { return; }

			parents.forEach((parent) => {
				renderListForItem(parent, values);
				wireSearch(parent);
			});
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
			const target = parent.querySelector(selectors.target);
			if (!target) return;

			// get a template label if present in DOM, else build one
			const tpl = target.querySelector(selectors.label) || createLabelTemplate();
			clearTarget(target);

			let count = 0;
			for (const [field, arr] of Object.entries(itemValues || {})) {
				if (!arr || !arr.length) continue;
				if (excludeFields.has(field)) continue;
				for (const val of Array.from(new Set(arr))) {
					const clone = tpl.cloneNode(true);
					const input = clone.querySelector(selectors.input);
					const span = clone.querySelector(selectors.span);
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
			const inputs = parent.querySelectorAll(`${selectors.target} ${selectors.input}`);
			inputs.forEach((i) => {
				const label = i.closest('label');
				if (!label) return;
				label.classList.toggle('is-list-active', i.checked);
			});
		}

		function collectSelections(parent) {
			const selected = parent.querySelectorAll(`${selectors.target} ${selectors.input}:checked`);
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
			if (parent.rfSelectableBound) return;
			parent.rfSelectableBound = true;

			// Toggle active class when a checkbox changes
			parent.addEventListener('change', (e) => {
				const input = e.target;
				if (!input || !input.matches(selectors.input)) return;
				const label = input.closest('label');
				if (!label) return;
				label.classList.toggle('is-list-active', input.checked);
			});

			// Initialize current active states (in case of SSR or restored DOM)
			const inputs = parent.querySelectorAll(`${selectors.target} ${selectors.input}`);
			inputs.forEach((i) => {
				const label = i.closest('label');
				if (!label) return;
				label.classList.toggle('is-list-active', i.checked);
			});
		}

		function wireSearch(parent) {
			const btn = parent.querySelector(selectors.search);
			if (!btn || btn.rfBound) return;
			btn.rfBound = true;
			btn.addEventListener('click', async (e) => {
				e.preventDefault();
				const values = collectSelections(parent);
				if (!Object.keys(values).length) { return; }
				await ddg.fs.applyCheckboxFilters(values, { merge: true });
			});
		}

		ddg.utils.on('ddg:current-item-changed', (e) => {
			const item = e.detail?.item;
			if (!item) return;
			buildAll(item);
		});

		ddg.fs.whenReady().then(list => {
			const rebuild = () => {
				if (ddg.currentItem?.item) buildAll(ddg.currentItem.item);
			};
			ddg.utils.on('ddg:list-ready', rebuild);
			if (typeof list.addHook === 'function') list.addHook('afterRender', rebuild);
		});
	}

	ddg.boot = initSite;
})();
