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

	const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

	ddg.resizeEvent = ddg.resizeEvent || (() => {
		const emit = () => document.dispatchEvent(new CustomEvent('ddg:resize', { detail: { width: window.innerWidth, height: window.innerHeight } }));
		const updateAndEmit = debounce(() => emit(), 180);
		let ticking = false;
		function onWinResize() {
			if (ticking) return; ticking = true;
			requestAnimationFrame(() => { ticking = false; updateAndEmit(); });
		}
		window.addEventListener('resize', onWinResize, { passive: true });
		const on = (fn) => {
			if (typeof fn !== 'function') return () => {};
			const handler = (e) => fn(e.detail || { width: window.innerWidth, height: window.innerHeight });
			document.addEventListener('ddg:resize', handler);
			return () => document.removeEventListener('ddg:resize', handler);
		};
		return { on };
	})();

	ddg.fs = (() => {
		let readyPromise = null;
		let firstResolved = false;
		let currentList = null; // always the latest instance we've seen

		function whenReady() {
			// If we've already resolved once, always return the latest instance.
			if (firstResolved && currentList) return Promise.resolve(currentList);
			if (readyPromise) return readyPromise;

			readyPromise = new Promise((resolve) => {
				window.FinsweetAttributes ||= [];

				const finish = (instances, label) => {
					const instArray = Array.isArray(instances) ? instances : [instances];
					const inst = instArray.find(i => i?.items);
					if (!inst) return;

					if (inst !== currentList) {
						currentList = inst;
						console.log(`[ddg.fs] list instance ready (${label})`, inst);
						document.dispatchEvent(new CustomEvent('ddg:list-ready', { detail: { list: inst, via: label } }));
					}

					if (!firstResolved) {
						firstResolved = true;
						resolve(inst);
					}
				};

				// (1) Early subscription — never miss push init
				try { window.FinsweetAttributes.push(['list', (instances) => finish(instances, 'push')]); } catch { }

				// (2) Hook existing module loading
				const mod = window.FinsweetAttributes?.modules?.list;
				if (mod?.loading?.then) mod.loading.then((i) => finish(i, 'module.loading')).catch(() => { });

				// (3) Trigger FA load and hook — proactive then wait for registration if needed
				try {
					const fa = window.FinsweetAttributes;
					const attemptLoad = () => {
						try {
							const res = fa.load?.('list');
							if (res?.then) res.then(i => finish(i, 'load()')).catch(() => { });
						} catch (err) {
							console.warn('[ddg.fs] early load(list) failed', err);
						}
					};

					// Always attempt to load once — registers the module if not yet ready
					attemptLoad();

					// If module not registered, observe DOM until it appears
					if (!fa?.modules?.list) {
						console.warn('[ddg.fs] list module not yet registered, waiting for registration');
						const wait = new MutationObserver(() => {
							if (window.FinsweetAttributes?.modules?.list) {
								wait.disconnect();
								attemptLoad();
							}
						});
						wait.observe(document.documentElement, { childList: true, subtree: true });
					}
				} catch (err) {
					console.warn('[ddg.fs] load(list) failed early', err);
				}

				// (4) Fallback: detect late-appearing list container (for /stories/ pages)
				const observer = new MutationObserver(() => {
					// keep watching until we've seen an instance at least once
					const listEl = document.querySelector('[fs-list-element="list"]');
					if (listEl && window.FinsweetAttributes?.modules?.list) {
						console.log('[ddg.fs] detected late list container → reloading');
						try {
							const r = window.FinsweetAttributes.load?.('list');
							if (r?.then) r.then((i) => finish(i, 'observer')).catch(() => { });
						} catch { }
						if (firstResolved) observer.disconnect();
					}
				});
				observer.observe(document.body, { childList: true, subtree: true });

				// (6) React on ajax-home ready
				document.addEventListener('ddg:ajax-home-ready', () => {
					const m = window.FinsweetAttributes?.modules?.list;
					if (m?.loading?.then) m.loading.then((i) => finish(i, 'module.loading (ajax-home)')).catch(() => { });
					else {
						const r = window.FinsweetAttributes.load?.('list');
						if (r?.then) r.then((i) => finish(i, 'load(ddg:ajax-home-ready)')).catch(() => { });
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

		// one-shot "next render" helper
		function afterNextRender(list) {
			return new Promise((resolve) => {
				if (typeof list?.addHook !== 'function') return resolve();
				let done = false;
				list.addHook('afterRender', () => {
					if (done) return; done = true; resolve();
				});
			});
		}

		// Helpers: force plain, cloneable shapes
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

			try {
				const list = await whenReady();

				// create NEW groups as plain objects
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
					// ✨ sanitize any existing groups before merging
					const existingPlain = (current.groups || []).map(toPlainGroup);
					const newPlain = newGroups.map(toPlainGroup);

					// keep existing groups whose fieldKey doesn't collide
					const keep = existingPlain.filter(
						g => !newPlain.some(ng => firstFieldKey(ng) === firstFieldKey(g))
					);

					nextGroups = [...keep, ...newPlain];
				} else {
					nextGroups = newGroups.map(toPlainGroup);
				}

				// assign only plain JSON
				list.filters.value = { groupsMatch: 'and', groups: nextGroups };

				await list.triggerHook('filter');
				await afterNextRender(list); // ← ensure callers await the render

				// Reflect in UI without firing change events (avoid double-driving)
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

				const flat = Object.entries(valuesByField)
					.map(([f, v]) => `${f}:${v.join(', ')}`)
					.join(' | ');
				console.log('[filters] applied:', flat);
			} catch (err) {
				console.error('[filters] applyCheckboxFilters error:', err);
				throw err;
			}
		}

		return { whenReady, items, valuesForItemSafe, applyCheckboxFilters, afterNextRender };
	})();

	// Site boot
	function initSite() {
		if (data.siteBooted) return;
		data.siteBooted = true;

		console.log('[ddg] booting site');

		requestAnimationFrame(() => {
			nav();
			modals();
			currentItem();
			relatedFilters();
			ajaxStories();
			marquee();
			homelistSplit();
			outreach();
			storiesAudioPlayer();
			share();
			randomFilters();
		});
	}

	function nav() {
		if (ddg.navInitialized) return;
		ddg.navInitialized = true;

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
		if (!ddg.navCleanup) {
			ddg.navCleanup = () => {
				console.log('[nav] cleanup triggered');
				ScrollTrigger.getAll().forEach(st => {
					if (st.trigger === document.body) st.kill();
				});
			};
		}
	}

	function homelistSplit() {
		const wraps = gsap.utils.toArray('.home-list_item-wrap');
		const tapeSpeed = 5000;

		wraps.forEach(wrap => {
			const item = wrap.querySelector('.home-list_item');
			if (!item || item.dataset.splitInit) return;

			// ✅ Create SplitText with autoSplit (VALID in v3.13.0)
			const split = new SplitText(item, {
				type: 'lines',
				linesClass: 'home-list_split-line',
				autoSplit: true  // ✅ Official feature (line 246 in source)
			});

			// Store instance for cleanup
			item.split = split;

			// ✅ Use gsap.set() for batched style updates
			gsap.set(split.lines, {
				display: 'inline-block'
			});

			// Detect coming-soon flag
			if (wrap.querySelector('[data-coming-soon]')) {
				wrap.dataset.comingSoon = 'true';
			} else {
				delete wrap.dataset.comingSoon;
			}

			item.dataset.splitInit = 'true';
		});

		// ✅ Batch DOM reads/writes to prevent layout thrashing
		function setTapeDurations() {
			requestAnimationFrame(() => {
				const lines = gsap.utils.toArray('.home-list_split-line');

				// Read all widths first
				const measurements = lines.map(line => ({
					line,
					width: line.offsetWidth
				}));

				// Then write all durations (prevents layout thrashing)
				measurements.forEach(({ line, width }) => {
					const dur = gsap.utils.clamp(0.3, 2, width / tapeSpeed);
					line.style.setProperty('--tape-dur', `${dur}s`);
				});
			});
		}

		setTapeDurations();

		// ✅ Hook into global ddg:resize (debounced centrally)
		const handleResize = () => {
			gsap.utils.toArray('.home-list_item-wrap').forEach(wrap => {
				const item = wrap.querySelector('.home-list_item');
				if (!item?.split) return;
				item.split.revert();
				delete item.split;
				delete item.dataset.splitInit;
			});
			homelistSplit();
		};
		if (!ddg.homelistResizeUnsub) {
			ddg.homelistResizeUnsub = ddg.resizeEvent.on(() => handleResize());
		}
	}

	function share() {
		if (ddg.shareInitialized) return;
		ddg.shareInitialized = true;

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
			if (el.shareLock) return;
			el.shareLock = true;
			setTimeout(() => { el.shareLock = false; }, 400);

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

	function modals() {
		ddg.modals = ddg.modals || {};
		ddg.modalsKeydownBound = Boolean(ddg.modalsKeydownBound);
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

		// Allow iframes to request closing the modal via postMessage
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
		document.addEventListener('ddg:modal-opened', (ev) => {
			const id = ev.detail?.id;
			if (!id) return;
			const modalEl = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modalEl) return;
			modalEl.querySelectorAll('iframe').forEach((frame) => {
				try {
					const doc = frame.contentDocument || frame.contentWindow?.document;
					if (!doc) return;
					const handler = (e) => {
						const target = e.target && (e.target.closest ? e.target.closest('[data-modal-close]') : null);
						if (target) {
							try { e.preventDefault?.(); } catch { }
							(ddg.modals[id] || createModal(id))?.close();
						}
					};
					doc.addEventListener('click', handler);
					frame.__ddgIframeCloseHandler = handler;
				} catch { /* cross-origin — ignore */ }
			});
		});

		document.addEventListener('ddg:modal-closed', (ev) => {
			const id = ev.detail?.id;
			if (!id) return;
			const modalEl = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modalEl) return;
			modalEl.querySelectorAll('iframe').forEach((frame) => {
				try {
					const doc = frame.contentDocument || frame.contentWindow?.document;
					if (doc && frame.__ddgIframeCloseHandler) {
						doc.removeEventListener('click', frame.__ddgIframeCloseHandler);
						delete frame.__ddgIframeCloseHandler;
					}
				} catch { }
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
			});
		});

		console.log('[modals] ready');
		document.dispatchEvent(new CustomEvent('ddg:modals-ready'));
	}

	function ajaxStories() {
		if (ddg.ajaxModalInitialized) return;
		ddg.ajaxModalInitialized = true;

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
			if (ddg.createModal) storyModal = ddg.createModal(storyModalId) || storyModal;
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
					// Notify parent of new URL if in iframe
					if (window !== window.parent) {
						try {
							window.parent.postMessage({
								type: 'iframe:url-change',
								url,
								title: document.title
							}, '*');
							console.log('[ajaxModal] posted url to parent:', url);
						} catch (err) {
							console.warn('[ajaxModal] failed to post url to parent', err);
						}
					}
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
			// Notify parent of home URL if in iframe
			if (window !== window.parent) {
				try {
					window.parent.postMessage({
						type: 'iframe:url-change',
						url: homeUrl,
						title: originalTitle
					}, '*');
					console.log('[ajaxModal] posted home url to parent:', homeUrl);
				} catch (err) {
					console.warn('[ajaxModal] failed to post home url to parent', err);
				}
			}
			console.log('[ajaxModal] modal closed -> restored home URL/title');
		});

		$(document).on('click.ajax', '[data-ajax-modal="link"]', (e) => {
			// Respect standard link interactions (new tab/window, middle/right click)
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1 || e.button === 2) return;

			const root = e.currentTarget;
			let linkUrl = root.getAttribute('href') || '';
			// Support wrapper elements (e.g., div) containing an <a href>
			if (!linkUrl) {
				// Prefer closest anchor from the actual click target within the wrapper
				const candidate = (e.target && e.target.closest) ? e.target.closest('a[href]') : null;
				if (candidate && root.contains(candidate)) linkUrl = candidate.getAttribute('href') || '';
			}
			if (!linkUrl) {
				// Fallback: first anchor within the wrapper
				const a = root.querySelector ? root.querySelector('a[href]') : null;
				if (a) linkUrl = a.getAttribute('href') || '';
			}
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
					if (parsed.$content?.[0]) { try { marquee(parsed.$content[0]); } catch { } }
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
		};

		// If modals are already initialized, run immediately; otherwise, wait.
		if (ddg.createModal || (ddg.modals && Object.keys(ddg.modals).length)) {
			tryOpenDirectStory();
		} else {
			document.addEventListener('ddg:modals-ready', tryOpenDirectStory, { once: true });
			console.log('[ajaxModal] waiting for ddg:modals-ready');
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

			console.log('[randomfilters] trigger clicked');

			try {
				const list = await ddg.fs.whenReady();
				const all = ddg.fs.items(list);
				if (!all.length) return console.warn('[randomfilters] no items found');

				const idx = nextIndex(all);
				const item = all[idx] ?? all[Math.floor(Math.random() * all.length)];
				const values = ddg.fs.valuesForItemSafe(item);

				await ddg.fs.applyCheckboxFilters(values, { merge: false });
				console.log('[randomfilters] picked index', idx, '→ applied');
			} catch (err) {
				console.warn('[randomfilters] failed', err);
			}
		}, true);
	}

	function marquee(root = document) {
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

			const unsubResize = ddg.resizeEvent.on(() => build(el));
			el.__ddgMarqueeCleanup = () => {
				el.__ddgMarqueeTween?.kill();
				if (typeof unsubResize === 'function') unsubResize();
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
			if (modal) marquee(modal);
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

	function storiesAudioPlayer(root = document) {
		if (!root || !root.querySelectorAll) return;

		const scope = root;
		const players = scope.querySelectorAll('.story-player:not([data-audio-init])');
		if (!players.length) return;

		players.forEach((playerEl) => {
			// Ensure a single active player per modal/document root
			const ownerRoot = playerEl.closest('[data-modal-el]') || document.body;
			if (ownerRoot.hasAttribute('data-audio-active')) return;

			const audioFileUrl = playerEl?.dataset?.audioUrl || '';
			if (!audioFileUrl) return;

			const waveformContainer = playerEl.querySelector('.story-player_waveform');
			const playButton = playerEl.querySelector("button[data-player='play']");
			const muteButton = playerEl.querySelector("button[data-player='mute']");
			const shareButton = playerEl.querySelector("button[data-player='share']");

			if (!waveformContainer || !playButton || !muteButton || !shareButton) return;

			const playIcon = playButton.querySelector('.circle-btn_icon.is-play');
			const pauseIcon = playButton.querySelector('.circle-btn_icon.is-pause');
			const muteIcon = muteButton.querySelector('.circle-btn_icon.is-mute');
			const unmuteIcon = muteButton.querySelector('.circle-btn_icon.is-unmute');

			// Find the scrolling panel within the story modal if present
			const modalRoot = playerEl.closest('[data-modal-el]') || document;
			const scroller = (modalRoot.querySelector('.lightbox_panel') || document.querySelector('.lightbox_panel'));
			if (!scroller) return;

			// Guard this root and mark this player as initialized
			ownerRoot.setAttribute('data-audio-active', '');
			playerEl.setAttribute('data-audio-init', '');

			let wavesurfer = null;
			let isMuted = false;
			let isPlaying = false;
			let status = 'not ready';
			let hasPlayedOnce = false;
			let flipInstance = null;
			let cleanupHandlers = [];
			let originalParent = playerEl.parentNode;
			let originalNext = playerEl.nextSibling;

			const prefersReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

			const setBtnDisabled = (btn, on) => { try { btn.disabled = !!on; } catch { } };

			function updatePlayButton() {
				if (isPlaying) {
					playButton.setAttribute('data-state', 'playing');
					playButton.setAttribute('aria-label', 'Pause');
					if (playIcon) playIcon.style.display = 'none';
					if (pauseIcon) pauseIcon.style.display = 'grid';
				} else {
					playButton.setAttribute('data-state', 'paused');
					playButton.setAttribute('aria-label', 'Play');
					if (playIcon) playIcon.style.display = 'block';
					if (pauseIcon) pauseIcon.style.display = 'none';
				}
			}

			function updateMuteButton() {
				if (isMuted) {
					muteButton.setAttribute('aria-label', 'Unmute');
					muteButton.setAttribute('data-state', 'muted');
					if (muteIcon) muteIcon.style.display = 'none';
					if (unmuteIcon) unmuteIcon.style.display = 'block';
				} else {
					muteButton.setAttribute('aria-label', 'Mute');
					muteButton.setAttribute('data-state', 'unmuted');
					if (muteIcon) muteIcon.style.display = 'block';
					if (unmuteIcon) unmuteIcon.style.display = 'none';
				}
			}

			function scrollToSel(sel) {
				const target = (modalRoot || document).querySelector(sel);
				if (!target) return;
				gsap.to(scroller, { duration: prefersReduced() ? 0 : 1.2, scrollTo: sel, ease: 'power2.out' });
			}

			function initPlayerFlip() {
				const topBar = modalRoot.querySelector('.lightbox_top-bar');
				const topNumber = modalRoot.querySelector('.lightbox_top-number');
				if (!topBar || !topNumber) return;
				const state = Flip.getState(playerEl);
				topNumber.insertAdjacentElement('afterend', playerEl);
				flipInstance = Flip.from(state, { duration: prefersReduced() ? 0 : 0.8, ease: 'power2.out', scale: true });
			}

			function createWaveSurfer() {
				if (wavesurfer) return;
				if (typeof WaveSurfer === 'undefined') throw new Error('audio: WaveSurfer not available');

				wavesurfer = WaveSurfer.create({
					container: waveformContainer,
					height: 42,
					waveColor: '#b6b83bff',
					progressColor: '#2C2C2C',
					cursorColor: '#2C2C2C',
					normalize: true,
					barWidth: 2,
					barGap: 1,
					dragToSeek: true,
					url: audioFileUrl,
					interact: true
				});

				wavesurfer.once('ready', () => {
					status = 'ready';
					setBtnDisabled(playButton, false);
					setBtnDisabled(muteButton, false);
					console.log('[audio] waveform ready');
				});

				wavesurfer.on('play', () => { isPlaying = true; status = 'playing'; updatePlayButton(); });
				wavesurfer.on('pause', () => { isPlaying = false; status = 'paused'; updatePlayButton(); });
				wavesurfer.on('finish', () => { isPlaying = false; status = 'finished'; updatePlayButton(); });
			}

			function cleanup() {
				cleanupHandlers.forEach((off) => off());
				cleanupHandlers = [];
				if (flipInstance) flipInstance.kill();
				flipInstance = null;
				if (wavesurfer) wavesurfer.destroy();
				wavesurfer = null;
				if (originalParent) originalParent.insertBefore(playerEl, originalNext || null);
				playerEl.removeAttribute('data-audio-init');
				ownerRoot.removeAttribute('data-audio-active');
				console.log('[audio] cleaned up');
			}

			// Initial UI state
			setBtnDisabled(playButton, true);
			setBtnDisabled(muteButton, true);
			updatePlayButton();
			updateMuteButton();

			// Wire controls
			const onPlay = (e) => {
				if (!wavesurfer) return;
				if (!hasPlayedOnce && (status === 'ready' || status === 'not ready')) {
					hasPlayedOnce = true;
					try { wavesurfer.play(); } catch { }
					// Scroll to main content
					try { scrollToSel('.story_main'); } catch { }
					// Defer the FLIP move slightly to avoid jank
					setTimeout(() => { try { initPlayerFlip(); } catch { } }, 100);
				} else {
					try { wavesurfer.playPause(); } catch { }
				}
			};
			const onMute = (e) => {
				if (!wavesurfer) return;
				isMuted = !isMuted;
				try { wavesurfer.setMuted(isMuted); } catch { }
				updateMuteButton();
			};
			const onShare = (e) => { e?.preventDefault?.(); scrollToSel('.story_share'); };

			playButton.addEventListener('click', onPlay);
			muteButton.addEventListener('click', onMute);
			shareButton.addEventListener('click', onShare);

			cleanupHandlers.push(() => playButton.removeEventListener('click', onPlay));
			cleanupHandlers.push(() => muteButton.removeEventListener('click', onMute));
			cleanupHandlers.push(() => shareButton.removeEventListener('click', onShare));

			// Build immediately; WaveSurfer is assumed available
			createWaveSurfer();

			// Expose a per-player cleanup method
			playerEl.__ddgAudioCleanup = cleanup;
		});
	}

	// modal lifecycle integration for audio player
	document.addEventListener('ddg:modal-opened', e => {
		const id = e.detail?.id;
		const modal = document.querySelector(`[data-modal-el="${id}"]`);
		if (modal) storiesAudioPlayer(modal);
	});

	document.addEventListener('ddg:modal-closed', e => {
		const id = e.detail?.id;
		const modal = document.querySelector(`[data-modal-el="${id}"]`);
		if (!modal) return;
		modal.querySelectorAll('.story-player[data-audio-init]').forEach((el) => {
			try { el.__ddgAudioCleanup?.(); } catch { }
		});
	});

	function outreach(root = document) {
		const recs = Array.from(root.querySelectorAll('.recorder:not([data-outreach-init])'));
		if (!recs.length) return;

		recs.forEach((recorder) => {
			// Required UI
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
					gsap.to('.outreach-hero_content', { autoAlpha: 1, duration: 0.1 });
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
					if (wsRec) { try { wsRec.destroy(); } catch { } }
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
							if (wsPlayback) { try { wsPlayback.destroy(); } catch { } }
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
						try { wsRec.empty(); } catch { }
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
					try { wsRec.empty(); } catch { }
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
			if (item) { setCurrent(item, pendingUrl); return; }

			console.log(`${logPrefix} no match yet for`, new URL(pendingUrl, window.location.origin).pathname, '— will retry after render');
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

		// Force reconciliation after list becomes ready (critical for /stories/ pages)
		document.addEventListener('ddg:list-ready', (e) => {
			const newList = e.detail?.list;
			if (newList && newList !== ddg.currentItem.list) {
				ddg.currentItem.list = newList;
				hooksBound = false;          // allow rebinding on the new instance
				bindListHooks(newList);
			}
			if (window.location.pathname.startsWith('/stories/')) {
				console.log(`${logPrefix} forcing resolve after list-ready`);
				tryResolve(window.location.href);
			}
		});

		console.log(`${logPrefix} initialized`);
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

		console.log('[relatedFilters] ready');

		// Ensure targets start empty on load (before data is available)
		try {
			Array.from(document.querySelectorAll(selectors.target)).forEach((el) => clearTarget(el));
		} catch { }

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

			if (!hasAnyUsableValues(values)) {
				console.warn('[relatedFilters] no usable field values');
				return; // Targets already emptied above
			}

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
				if (!Object.keys(values).length) {
					console.warn('[relatedFilters] nothing selected to apply');
					return;
				}
				try {
					await ddg.fs.applyCheckboxFilters(values, { merge: true });
					console.log('[relatedFilters] applied to main filters', values);
				} catch (err) {
					console.warn('[relatedFilters] failed to apply', err);
				}
			});
		}

		document.addEventListener('ddg:current-item-changed', (e) => {
			const item = e.detail?.item;
			if (!item) return;
			buildAll(item);
		});

		// Rebuild after Finsweet render (ensures fields are hydrated)
		try {
			ddg.fs.whenReady().then(list => {
				const rebuild = () => {
					if (ddg.currentItem?.item) buildAll(ddg.currentItem.item);
				};
				document.addEventListener('ddg:list-ready', rebuild);
				if (typeof list.addHook === 'function') list.addHook('afterRender', rebuild);
			});
		} catch { }
	}

	ddg.boot = initSite;
})();
