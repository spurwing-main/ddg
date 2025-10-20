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

		if (typeof window !== 'undefined' && window.location.hostname === 'localhost' || window.location.search.includes('debug')) {
			const events = ['ddg:ajax-home-ready', 'ddg:list-ready', 'ddg:story-opened', 'ddg:current-item-changed', 'ddg:modal-opened', 'ddg:modal-closed'];
			events.forEach(name => {
				document.addEventListener(name, (e) => {
					console.log(`🔔 ${name}`, e.detail || '');
				});
			});
			console.log('[ddg] event logger active for:', events.join(', '));
		}

		requestAnimationFrame(() => {
			nav();
			modals();
			currentItem();
			relatedFilters();
			ajaxStories();
			marquee();
			homelistSplit();
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

		// ✅ Proper resize handling with debounce
		let resizeTimer;
		const handleResize = () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				console.log('[homelistSplit] responsive reflow');

				wraps.forEach(wrap => {
					const item = wrap.querySelector('.home-list_item');
					if (!item?.split) return;

					// Official cleanup method
					item.split.revert();
					delete item.split;
					delete item.dataset.splitInit;
				});

				homelistSplit();
			}, 300);
		};

		window.addEventListener('resize', handleResize, { passive: true });
	}

	// Cleanup on resize
	let resizeTimer;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(() => {
			document.querySelectorAll('.home-list_item').forEach(item => {
				if (item.ddgSplit) {
					try {
						item.ddgSplit.revert();
					} catch (_) { }
					delete item.ddgSplit;
				}
			});
		}, 200);
	});

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

		// Ensure targets start empty on load (before data is available)
		try {
			Array.from(document.querySelectorAll(SEL.target)).forEach((el) => clearTarget(el));
		} catch { }

		function hasAnyUsableValues(values) {
			if (!values) return false;
			for (const [k, arr] of Object.entries(values)) {
				if (EXCLUDE_FIELDS.has(k)) continue;
				if (Array.isArray(arr) && arr.length) return true;
			}
			return false;
		}

		function buildAll(item) {
			const values = ddg.fs.valuesForItemSafe(item);

			// Always clear targets first; if no usable values, leave empty
			const parents = Array.from(document.querySelectorAll(SEL.parent));
			parents.forEach((parent) => {
				const target = parent.querySelector(SEL.target);
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
			if (parent.rfSelectableBound) return;
			parent.rfSelectableBound = true;

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
