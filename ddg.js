(function () {
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false
	});

	ddg.utils = {
		// Debounce: delays execution until silence for X ms
		debounce: (fn, ms = 150) => {
			if (typeof fn !== 'function') throw new Error('ddg: debounce expects function');
			let t;
			return (...a) => {
				clearTimeout(t);
				t = setTimeout(() => fn(...a), ms);
			};
		},
		// Throttle: runs at most once per X ms
		throttle: (fn, ms = 150) => {
			if (typeof fn !== 'function') throw new Error('ddg: throttle expects function');
			let last = 0;
			return (...a) => {
				const now = Date.now();
				if (now - last >= ms) {
					last = now;
					fn(...a);
				}
			};
		},
		// Wait: Promise-based delay
		wait: (ms = 0) => {
			if (typeof ms !== 'number' || ms < 0) throw new Error('ddg: wait expects positive number');
			return new Promise((resolve) => setTimeout(resolve, ms));
		},
		// Shuffle: Fisher–Yates; returns a new shuffled array
		shuffle: (arr) => {
			if (!Array.isArray(arr)) throw new Error('ddg: shuffle expects array');
			const a = arr.slice();
			for (let i = a.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[a[i], a[j]] = [a[j], a[i]];
			}
			return a;
		},
		on: (event, fn) => document.addEventListener(event, fn),
		emit: (event, detail) => document.dispatchEvent(new CustomEvent(event, { detail })),
		fail: (msg) => { throw new Error('ddg: ' + msg); },
		assert: (cond, msg) => { if (!cond) throw new Error('ddg: ' + (msg || 'assertion failed')); },
		log: (...a) => console.log('[ddg]', ...a),
		warn: (...a) => console.warn('[ddg]', ...a)
	};

	ddg.iframeBridge ??= (() => {
		const PREFIX = 'ddg:';
		const listeners = new Map();

		function post(type, data = {}, target = 'parent') {
			if (!type) return;
			try {
				const t = target === 'parent' ? window.parent : target;
				if (!t || typeof t.postMessage !== 'function') return;
				t.postMessage({ type: PREFIX + type, data }, '*');
			} catch (err) {
				ddg.utils?.warn?.('[iframeBridge] post failed', err);
			}
		}

		function on(type, fn) {
			if (!type || typeof fn !== 'function') return () => {};
			const key = PREFIX + type;
			const handler = (e) => { if (e?.data?.type === key) fn(e.data.data, e); };
			window.addEventListener('message', handler);
			listeners.set(fn, handler);
			return () => { window.removeEventListener('message', handler); listeners.delete(fn); };
		}

		return { post, on };
	})();

	ddg.net ??= {
		// Fetch and return parsed HTMLDocument
		async fetchHTML(url) {
			if (!url || typeof url !== 'string') throw new Error('ddg.net.fetchHTML: invalid URL');
			const res = await fetch(url, { credentials: 'same-origin' });
			if (!res.ok) throw new Error(`ddg.net.fetchHTML: HTTP ${res.status}`);
			const text = await res.text();
			return new DOMParser().parseFromString(text, 'text/html');
		},
		// Fetch and parse JSON safely
		async fetchJSON(url) {
			if (!url || typeof url !== 'string') throw new Error('ddg.net.fetchJSON: invalid URL');
			const res = await fetch(url, { credentials: 'same-origin' });
			if (!res.ok) throw new Error(`ddg.net.fetchJSON: HTTP ${res.status}`);
			try {
				return await res.json();
			} catch {
				throw new Error('ddg.net.fetchJSON: invalid JSON');
			}
		},
		// Prefetch (HTML or JSON) after delay, cancellable
		prefetch(url, delay = 250) {
			if (!url) throw new Error('ddg.net.prefetch: missing URL');
			const controller = new AbortController();
			const timeout = setTimeout(async () => {
				try {
					await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
				} catch (err) {
					if (err && err.name !== 'AbortError') console.warn('ddg.net.prefetch failed:', err);
				}
			}, delay);
			return () => { clearTimeout(timeout); controller.abort(); };
		}
	};

	ddg.scrollLock ??= (() => {
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

	ddg.resizeEvent ??= (() => {
		let lastW = window.innerWidth || 0;
		let pendingW = lastW;
		let ticking = false;
		let lastOrientation = (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) ? 'portrait' : 'landscape';
		const MIN_DELTA_BASE = 24; // px baseline threshold to consider a width change meaningful
		const emit = () => ddg.utils.emit('ddg:resize', { width: lastW, height: window.innerHeight });
		const updateAndEmit = ddg.utils.debounce(() => emit(), 180);

		function onWinResize() {
			// Capture current width immediately
			pendingW = window.innerWidth || 0;
			if (ticking) return; // coalesce multiple resize events into a single rAF tick
			ticking = true;
			requestAnimationFrame(() => {
				try {
					// Orientation change should always emit, regardless of delta
					const currOrientation = (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) ? 'portrait' : 'landscape';
					if (currOrientation !== lastOrientation) {
						lastOrientation = currOrientation;
						lastW = pendingW;
						emit();
					} else {
						// Only proceed if width changed meaningfully; ignore height-only resizes
						const dynamicDelta = Math.max(MIN_DELTA_BASE, Math.round(lastW * 0.03)); // ~3% or 24px
						if (Math.abs(pendingW - lastW) >= dynamicDelta) {
							lastW = pendingW;
							updateAndEmit();
						}
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

	ddg.fs ??= (() => {
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

				if (Array.isArray(window.FinsweetAttributes)) {
					window.FinsweetAttributes.push(['list', (instances) => finish(instances, 'push')]);
				}

				const mod = window.FinsweetAttributes?.modules?.list;
				if (mod?.loading?.then) {
					mod.loading.then((i) => finish(i, 'module.loading')).catch((err) => ddg.utils.warn('[fs] module.loading failed', err));
				}

				const fa = window.FinsweetAttributes;
				const attemptLoad = () => {
					if (typeof fa?.load !== 'function') return;
					try {
						const res = fa.load('list');
						if (res && typeof res.then === 'function') {
							res.then(i => finish(i, 'load()')).catch((err) => ddg.utils.warn('[fs] load(list) failed', err));
						}
					} catch (err) {
						ddg.utils.warn('[fs] load(list) threw', err);
					}
				};
				attemptLoad();
				if (!fa?.modules?.list && typeof MutationObserver === 'function') {
					const wait = new MutationObserver(() => {
						if (window.FinsweetAttributes?.modules?.list) {
							wait.disconnect();
							attemptLoad();
						}
					});
					wait.observe(document.documentElement, { childList: true, subtree: true });
				}

				if (typeof MutationObserver === 'function') {
					const observer = new MutationObserver(() => {
						const listEl = document.querySelector('[fs-list-element="list"]');
						if (listEl && window.FinsweetAttributes?.modules?.list) {
							const loader = window.FinsweetAttributes?.load;
							if (typeof loader === 'function') {
								try {
									const r = loader('list');
									if (r && typeof r.then === 'function') {
										r.then((i) => finish(i, 'observer')).catch((err) => ddg.utils.warn('[fs] observer load failed', err));
									}
								} catch (err) {
									ddg.utils.warn('[fs] observer load threw', err);
								}
							}
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
				}

			});
			return readyPromise;
		}

		const items = (list) => {
			const v = list?.items;
			return Array.isArray(v?.value) ? v.value : (Array.isArray(v) ? v : []);
		};

		const valuesForItemSafe = (item) => {
			const normalize = (value) => {
				if (value == null) return [];
				const arrayValue = Array.isArray(value) ? value : [value];
				const outValues = [];
				for (const entry of arrayValue) {
					if (entry == null) continue;
					const parts = String(entry).split(',');
					for (const part of parts) {
						const trimmed = part.trim();
						if (trimmed) outValues.push(trimmed);
					}
				}
				return outValues;
			};

			const out = {};
			if (item?.fields && Object.keys(item.fields).length) {
				for (const [n, f] of Object.entries(item.fields)) {
					const v = f?.value ?? f?.rawValue ?? [];
					out[n] = normalize(v);
				}
			} else if (item?.fieldData && typeof item.fieldData === 'object') {
				for (const [n, v] of Object.entries(item.fieldData)) {
					out[n] = normalize(v);
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

		async function applyCheckboxFilters(valuesByField, opts = {}) {
			const {
				formSel = '[fs-list-element="filters"]',
				merge = false,
			} = opts;

			const list = await whenReady();

			// Build a map of what values we want per field
			const targetValuesByField = {};
			for (const [field, vals = []] of Object.entries(valuesByField || {})) {
				targetValuesByField[field] = new Set((vals || []).map(String));
			}

			// Get or create groups - but PRESERVE existing group references
			const existingGroups = list.filters.value.groups || [];

			// Update existing groups in place
			for (const [field, targetValues] of Object.entries(targetValuesByField)) {
				// Find existing group for this field
				let group = existingGroups.find(g =>
					g.conditions.some(c => c.fieldKey === field)
				);

				// If no group exists, create one
				if (!group) {
					group = {
						id: `auto-${field}`,
						conditionsMatch: 'or',
						conditions: []
					};
					existingGroups.push(group);
				}

				// Find or create the condition for this field
				let condition = group.conditions.find(c =>
					c.fieldKey === field && (c.op === 'equal' || !c.op)
				);

				if (!condition) {
					// Create new condition
					condition = {
						id: `${field}_equal`,  // ← Use consistent ID format
						type: 'checkbox',
						fieldKey: field,
						value: [],
						op: 'equal',
						interacted: true,
					};
					group.conditions.push(condition);
				}

				// Update the condition's value IN PLACE (critical!)
				condition.value = Array.from(targetValues);
				condition.interacted = true;
			}

			// If not merging, remove groups for fields not in targetValuesByField
			if (!merge) {
				const fieldsToKeep = new Set(Object.keys(targetValuesByField));

				// Remove groups that don't match any target fields
				for (let i = existingGroups.length - 1; i >= 0; i--) {
					const group = existingGroups[i];
					const hasMatchingField = group.conditions.some(c => fieldsToKeep.has(c.fieldKey));

					if (!hasMatchingField) {
						existingGroups.splice(i, 1);
					}
				}
			}

			// Trigger the filter lifecycle
			await list.triggerHook('filter');
			await afterNextRender(list);
		}

		return { whenReady, items, valuesForItemSafe, applyCheckboxFilters, afterNextRender };
	})();

	ddg.confetti ??= (() => {
		let js = null;
		let canvas = null;

		function ensureCanvas() {
			if (canvas) return canvas;
			canvas = document.createElement('canvas');
			canvas.id = 'ddg-confetti-canvas';
			Object.assign(canvas.style, {
				position: 'fixed',
				inset: 0,
				width: '100%',
				height: '100%',
				zIndex: 999999, // 🔝 absolutely on top of everything
				pointerEvents: 'none',
			});
			document.body.appendChild(canvas);
			return canvas;
		}

		function getInstance() {
			if (!window.JSConfetti) {
				ddg.utils.warn('Confetti library missing');
				return null;
			}
			if (!js) js = new JSConfetti({ canvas: ensureCanvas() });
			return js;
		}

		function trigger(options = {}) {
			const inst = getInstance();
			if (!inst) return;
			inst.addConfetti({
				emojis: ['🎉', '✨', '💥'],
				confettiRadius: 6,
				confettiNumber: 150,
				...options,
			});
		}

		return { trigger };
	})();

	function initSite() {
		if (data.siteBooted) return;
		data.siteBooted = true;

		requestAnimationFrame(() => {
			iframe();
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
			storiesAudioPlayer();
		});
	}

	function iframe() {
		// --- parent: accept URL sync from children
		if (window === window.parent) {
			ddg.iframeBridge.on('sync-url', ({ url, title }) => {
				try {
					if (url && url !== location.href) {
						const u = new URL(url, location.href);
						if (u.origin === location.origin) history.replaceState(history.state, '', u.toString());
						else location.assign(u.toString());
					}
					if (title) document.title = title;
				} catch (err) {
					ddg.utils?.warn?.('[iframe] parent sync failed', err);
				}
			});
			return ddg.iframeBridge;
		}

		// --- child: notify parent on URL changes
		const notify = ddg.utils.debounce(
			() => ddg.iframeBridge.post('sync-url', { url: location.href, title: document.title }), 50
		);

		const wrap = (name) => {
			try {
				const orig = history[name];
				if (typeof orig !== 'function' || orig.__ddgWrapped) return;
				history[name] = function () { const r = orig.apply(this, arguments); notify(); return r; };
				history[name].__ddgWrapped = true;
			} catch {}
		};

		wrap('pushState'); wrap('replaceState');
		window.addEventListener('popstate', notify);
		window.addEventListener('hashchange', notify);
		setTimeout(notify, 0);

		// --- child: link policy (navigate top on same-origin normal clicks)
		if (!ddg.iframeLinkPolicyBound) {
			ddg.iframeLinkPolicyBound = true;
			document.addEventListener('click', (e) => {
				if (e.defaultPrevented || e.button !== 0) return;
				if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
				const a = e.target.closest?.('a[href]');
				if (!a) return;
				const href = a.getAttribute('href');
				if (!href || href.startsWith('#')) return;
				if (a.closest('[data-modal-trigger],[data-ajax-modal],[data-share]')) return;
				e.preventDefault();
				try { window.top.location.assign(href); } catch { location.assign(href); }
			}, true);
		}

		ddg.utils?.log?.('[ddg] iframe booted');
		return ddg.iframeBridge;
	}

	function nav() {
		const navEl = document.querySelector('.nav');
		if (!navEl) return;
		if (ddg.navInitialized) return;

		ddg.utils.assert(typeof ScrollTrigger !== 'undefined' && typeof ScrollTrigger.create === 'function', 'nav requires ScrollTrigger');
		ddg.utils.assert(typeof gsap !== 'undefined', 'nav requires gsap');

		ddg.navInitialized = true;

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
		const homelistContainer = document.querySelector('.home-list') || document.querySelector('[fs-list-element="list"]');
		if (!homelistContainer) return;
		
		const tapeSpeed = 5000;
		const getWraps = () => gsap.utils.toArray('.home-list_item-wrap');

		const clearLineState = (line) => {
			if (!line) return;
			delete line.__ddgTapeWidth;
			line.style.removeProperty('--tape-dur');
		};

		const revertWrap = (wrap) => {
			const item = wrap?.querySelector('.home-list_item');
			if (!item?.split) return;
			item.split.revert();
			item.split.lines?.forEach(clearLineState);
			delete item.split;
			delete item.dataset.splitInit;
		};

		const splitWrap = (wrap) => {
			const item = wrap?.querySelector('.home-list_item');
			if (!item || item.dataset.splitInit) return;
			const split = new SplitText(item, {
				type: 'lines',
				linesClass: 'home-list_split-line',
				autoSplit: true
			});
			item.split = split;
			item.dataset.splitInit = 'true';
			gsap.set(split.lines, { display: 'inline-block' });
			if (wrap.querySelector('[data-coming-soon]')) wrap.dataset.comingSoon = 'true';
			else delete wrap.dataset.comingSoon;
		};

		let tapeRaf = null;
		const setTapeDurations = () => {
			if (tapeRaf) return;
			tapeRaf = requestAnimationFrame(() => {
				tapeRaf = null;
				gsap.utils.toArray('.home-list_split-line').forEach((line) => {
					const width = Math.round(line.offsetWidth || 0);
					if (line.__ddgTapeWidth === width) return;
					line.__ddgTapeWidth = width;
					const dur = gsap.utils.clamp(0.3, 2, width / tapeSpeed);
					line.style.setProperty('--tape-dur', `${dur}s`);
				});
			});
		};

		const applyMobile = () => {
			getWraps().forEach(revertWrap);
		};

		const applyDesktop = () => {
			getWraps().forEach(splitWrap);
			setTapeDurations();
		};

		const handleResize = () => {
			const mobileNow = window.innerWidth <= 767;
			const wasMobile = !!ddg.homelistSplitIsMobile;
			ddg.homelistSplitIsMobile = mobileNow;
			if (mobileNow) {
				applyMobile();
				return;
			}
			if (wasMobile) {
				applyDesktop();
				return;
			}
			setTapeDurations();
		};

		if (!ddg.homelistSplitInitialized) {
			ddg.homelistSplitInitialized = true;
			if (!ddg.homelistSplitResizeUnsub) {
				ddg.homelistSplitResizeUnsub = ddg.resizeEvent.on(handleResize);
			}
			if (!ddg.homelistSplitRenderBound) {
				ddg.homelistSplitRenderBound = true;
				const sync = ddg.utils.debounce(() => homelistSplit(), 120);
				const boundLists = (ddg.homelistSplitHookedLists ||= new WeakSet());
				const bind = (list) => {
					if (!list || typeof list.addHook !== 'function' || boundLists.has(list)) return;
					boundLists.add(list);
					list.addHook('afterRender', sync);
				};
				if (ddg.fs?.whenReady) ddg.fs.whenReady().then(bind);
				ddg.utils.on('ddg:list-ready', (e) => bind(e.detail?.list));
			}
		}

		const isMobile = window.innerWidth <= 767;
		ddg.homelistSplitIsMobile = isMobile;
		if (isMobile) {
			applyMobile();
			return;
		}

		applyDesktop();
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
			telegram: ({ url, text }) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
		};


		const updateCountdowns = () => {
			let anyHitZero = false;
			document.querySelectorAll('[data-share-countdown]').forEach((node) => {
				const attrVal = node.getAttribute('data-share-countdown');
				let current = Number.parseInt(attrVal ?? '', 10);
				if (!Number.isFinite(current)) {
					// Fallback to visible text/value if attribute was not set
					const raw = (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)
						? node.value
						: node.textContent;
					current = Number.parseInt(String(raw || '').trim(), 10);
				}
				if (!Number.isFinite(current)) current = 0;

				const next = Math.max(0, current - 1);
				if (current > 0 && next === 0) anyHitZero = true;

				node.setAttribute('data-share-countdown', String(next));
				if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.value = String(next);
				else node.textContent = String(next);
			});
			if (anyHitZero && ddg.confetti && typeof ddg.confetti.trigger === 'function') {
				try { ddg.confetti.trigger(); } catch { }
			}
		};

		const clearShareStateTimer = (el) => {
			if (!el) return;
			if (el.__shareStateTimer) {
				clearTimeout(el.__shareStateTimer);
				el.__shareStateTimer = null;
			}
		};

		const onShareClick = async (event) => {
			const el = event.target.closest(selectors.btn);
			if (!el) return;
			if (event.button && event.button !== 0) return;
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
			updateCountdowns();

			if (realClick) {
				const today = new Date().toISOString().slice(0, 10);
				const cookieRow = document.cookie.split('; ').find(r => r.startsWith(dailyShareKey + '=')) || '';
				const cookieVal = cookieRow.split('=')[1] || null;
				const done = [localStorage.getItem(dailyShareKey), sessionStorage.getItem(dailyShareKey), cookieVal].includes(today);
				if (!done) {
					const form = document.createElement('form');
					const iframe = document.createElement('iframe');
					const frameName = 'wf_' + Math.random().toString(36).slice(2);
					iframe.name = frameName;
					iframe.style.display = 'none';
					form.target = frameName;
					form.method = 'POST';
					form.action = shareWebhookUrl;
					form.style.display = 'none';
					[['platform', platform], ['date', today]].forEach(([name, value]) => {
						const input = document.createElement('input');
						input.type = 'hidden';
						input.name = name;
						input.value = value;
						form.appendChild(input);
					});
					document.body.append(iframe, form);
					form.submit();
					const exp = new Date();
					exp.setHours(24, 0, 0, 0);
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
					clearShareStateTimer(el);
					el.__shareStateTimer = setTimeout(() => {
						el.removeAttribute('data-share-state');
						el.__shareStateTimer = null;
					}, 2000);
				} catch {
					el.setAttribute('data-share-state', 'error');
					clearShareStateTimer(el);
					el.__shareStateTimer = setTimeout(() => {
						el.removeAttribute('data-share-state');
						el.__shareStateTimer = null;
					}, 2000);
				}
				return;
			}

			const w = window.open('about:blank', '_blank');
			if (w) {
				w.opener = null;
				w.location.href = destination;
			}
		};

		document.addEventListener('click', onShareClick, true);
		ddg.shareClickHandler = onShareClick;

	}

	function modals() {
		const modalRoot = document.querySelector('[data-modal-el]') || document.querySelector('[data-modal-trigger]');
		if (!modalRoot) return;
		if (ddg.modalsInitialized) return;

		ddg.utils.assert(typeof $ === 'function', 'modals requires $');
		ddg.utils.assert(typeof gsap !== 'undefined', 'modals requires gsap');

		ddg.modalsInitialized = true;

		ddg.modals ??= {};
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
		const docRoot = document.documentElement;
		const initiallyOpen = document.querySelector('[data-modal-el].is-open');
		if (docRoot) {
			if (initiallyOpen) {
				const id = initiallyOpen.getAttribute('data-modal-el') || '';
				docRoot.setAttribute('data-modal-state', 'open');
				if (id) docRoot.setAttribute('data-modal-id', id);
			} else {
				docRoot.setAttribute('data-modal-state', 'closed');
				docRoot.removeAttribute('data-modal-id');
			}
		}

		const syncCssState = ($modal, open, id) => {
			const $bg = $(`[data-modal-bg="${id}"]`);
			const $inner = $modal.find(selectors.inner).first();
			[$modal[0], $inner[0], $bg[0]].filter(Boolean).forEach(el => {
				open ? el.classList.add('is-open') : el.classList.remove('is-open');
			});

			// Also reflect a global state for CSS with [data-modal-state]
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

			const clearInlineTransforms = () => {
				const el = $anim[0];
				if (!el) return;
				['transform', 'translate', 'rotate', 'scale', 'opacity', 'visibility'].forEach((prop) => {
					try { el.style.removeProperty(prop); } catch { el.style[prop] = ''; }
				});
				if (el.getAttribute('style') && el.getAttribute('style').trim() === '') {
					el.removeAttribute('style');
				}
			};

			const onKeydownTrap = (e) => {
				if (e.key !== 'Tab') return;
				const root = $modal[0];
				const list = Array.from(root.querySelectorAll('a[href],button,textarea,input,select,[tabindex]:not([tabindex="-1"])')).filter((node) => {
					if (!node) return false;
					if (node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
					const style = window.getComputedStyle(node);
					if (style.display === 'none' || style.visibility === 'hidden') return false;
					if (node.offsetParent === null && !node.hasAttribute('data-allow-focus-when-hidden')) return false;
					return node.tabIndex >= 0;
				});
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
				// Prefer the modal's inner wrapper which is the actual scrollable region
				if ($inner && $inner[0]) return $inner[0];
				// Fallbacks for custom containers if explicitly keyed to this modal id
				const $global = $(`[data-modal-scroll="${id}"]`).first();
				if ($global.length) return $global[0];
				const $scoped = $modal.find(`[data-modal-scroll="${id}"]`).first();
				if ($scoped.length) return $scoped[0];
				return $modal[0];
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


			// Internal anchor links should scroll the modal's scroll container
			$modal.on('click.modalAnchor', 'a[href^="#"], button[href^="#"]', (e) => {
				const href = e.currentTarget.getAttribute('href') || '';
				const hash = href.replace(/^#/, '').trim();
				if (!hash) return;
				e.preventDefault();
				e.stopPropagation();
				scrollToAnchor(hash);
				const u = new URL(window.location.href);
				u.hash = hash;
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
					requestAnimationFrame(clearInlineTransforms);
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
						requestAnimationFrame(clearInlineTransforms);
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
					gsap.set([$anim[0], $bg[0], $modal[0], $inner[0]], { clearProps: 'transform,opacity,autoAlpha,pointerEvents,willChange' });
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

		// If a close button exists inside a same-origin iframe within the modal,
		// delegate its click to the parent close logic.
		const getFrameDocument = (frame) => {
			if (!frame) return null;
			try {
				return frame.contentDocument || frame.contentWindow?.document || null;
			} catch (err) {
				return null;
			}
		};

		ddg.utils.on('ddg:modal-opened', (ev) => {
			const id = ev.detail?.id;
			if (!id) return;
			const modalEl = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modalEl) return;
			modalEl.querySelectorAll('iframe').forEach((frame) => {
				const doc = getFrameDocument(frame);
				if (!doc) return;
				const handler = (e) => {
					const target = e.target && (e.target.closest ? e.target.closest('[data-modal-close]') : null);
					if (target) {
						e.preventDefault?.();
						(ddg.modals[id] || createModal(id))?.close();
					}
				};
				if (frame.__ddgIframeCloseHandler) {
					doc.removeEventListener('click', frame.__ddgIframeCloseHandler);
				}
				doc.addEventListener('click', handler);
				frame.__ddgIframeCloseHandler = handler;

				const linkHandler = (event) => {
					const closestAnchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
					if (!closestAnchor) return;
					if (closestAnchor.closest('[data-modal-trigger],[data-ajax-modal]')) return;
					const href = closestAnchor.getAttribute('href');
					if (!href) return;
					event.preventDefault();
					try {
						if (window.top && window.top.location && typeof window.top.location.assign === 'function') {
							window.top.location.assign(href);
						} else {
							window.location.assign(href);
						}
					} catch {
						window.location.assign(href);
					}
				};
				if (frame.__ddgIframeLinkHandler) {
					doc.removeEventListener('click', frame.__ddgIframeLinkHandler);
				}
				doc.addEventListener('click', linkHandler);
				frame.__ddgIframeLinkHandler = linkHandler;
			});
		});

		ddg.utils.on('ddg:modal-closed', (ev) => {
			const id = ev.detail?.id;
			if (!id) return;
			const modalEl = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modalEl) return;
			modalEl.querySelectorAll('iframe').forEach((frame) => {
				const doc = getFrameDocument(frame);
				if (doc) {
					if (frame.__ddgIframeCloseHandler) doc.removeEventListener('click', frame.__ddgIframeCloseHandler);
					if (frame.__ddgIframeLinkHandler) doc.removeEventListener('click', frame.__ddgIframeLinkHandler);
				}
				delete frame.__ddgIframeCloseHandler;
				delete frame.__ddgIframeLinkHandler;
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
		const embedEl = document.querySelector('[data-ajax-modal="embed"]');
		if (!embedEl) return;
		if (ddg.ajaxStoriesInitialized) return;

		ddg.utils.assert(typeof $ === 'function', 'ajaxStories requires $');

		ddg.ajaxStoriesInitialized = true;


		const storyModalId = 'story';
		const $embed = $(embedEl);
		const originalTitle = document.title;
		const homeUrl = '/';
		const SKELETON_HTML = "<div class='modal-skeleton' aria-busy='true'></div>";
		const ERROR_HTML = "<div class='modal-error'>Failed to load content.</div>";

		const dispatchStoryOpened = (url) => queueMicrotask(() => {
			ddg.utils.emit('ddg:story-opened', { url });
		});

		let storyModal = ddg.modals?.[storyModalId] || null;
		const STORY_CACHE_MAX = 20;
		const STORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
		const storyCache = new Map(); // Map<url, { title, contentHTML, t }>
		const cacheGet = (url) => {
			const ent = storyCache.get(url);
			if (!ent) return null;
			if (Date.now() - ent.t > STORY_CACHE_TTL) { storyCache.delete(url); return null; }
			storyCache.delete(url); storyCache.set(url, ent); // mark as recent
			return ent;
		};
		const cacheSet = (url, payload) => {
			storyCache.set(url, { ...payload, t: Date.now() });
			if (storyCache.size > STORY_CACHE_MAX) {
				const overflow = storyCache.size - STORY_CACHE_MAX;
				for (let i = 0; i < overflow; i++) {
					const firstKey = storyCache.keys().next().value;
					if (firstKey == null) break;
					storyCache.delete(firstKey);
				}
			}
		};
		let lock = false;

		let prefetchEnabled = false;
		setTimeout(() => { prefetchEnabled = true; }, 2000);

		const storyFromDoc = (doc) => {
			const node = doc?.querySelector?.('[data-ajax-modal="content"]');
			return { title: (doc?.title || ''), contentHTML: node ? node.outerHTML : ERROR_HTML };
		};

		const renderEmbed = (html) => {
			const markup = typeof html === 'string' && html.trim() ? html : ERROR_HTML;
			$embed.empty();
			$embed[0].innerHTML = markup;
		};

		const ensureModal = () => {
			if (storyModal && storyModal.$modal?.length) return storyModal;
			if (ddg.createModal) storyModal = ddg.createModal(storyModalId) || storyModal;
			return storyModal;
		};

		const openStory = (url, title, contentHTML, options = {}) => {
			const modal = ensureModal();
			if (!modal) { return; }

			const { stateMode = 'push' } = options;
			renderEmbed(contentHTML);
			modal.open({
				afterOpen: () => {
					if (title) document.title = title;
					if (stateMode === 'replace') {
						history.replaceState({ modal: true }, '', url);
					} else if (stateMode === 'push') {
						history.pushState({ modal: true }, '', url);
					}
					// Notify parent of new URL if in iframe
					if (window !== window.parent) {
						try { ddg.iframeBridge.post('sync-url', { url, title: document.title }); } catch { }
					}
					ddg.fs.whenReady()
						.then(() => dispatchStoryOpened(url))
						.catch(() => dispatchStoryOpened(url))
						.finally(() => marquee?.($embed[0]));

				}
			});
		};

		const loadAndOpenStory = async (url, options = {}) => {
			if (!url) return;
			if (lock && !options.force) return;
			lock = true;
			try {
				const cached = cacheGet(url);
				if (cached) {
					openStory(url, cached.title, cached.contentHTML, options);
					return;
				}
				if (options.showSkeleton !== false) renderEmbed(SKELETON_HTML);
				const doc = await ddg.net.fetchHTML(url);
				const parsed = storyFromDoc(doc);
				cacheSet(url, parsed);
				openStory(url, parsed.title, parsed.contentHTML, options);
			} catch {
				renderEmbed(ERROR_HTML);
			} finally {
				lock = false;
			}
		};

		ddg.utils.on('ddg:modal-closed', (ev) => {
			if (ev.detail?.id !== storyModalId) return;
			document.title = originalTitle;
			history.pushState({}, '', homeUrl);
			if (window !== window.parent) {
				try { ddg.iframeBridge.post('sync-url', { url: homeUrl, title: originalTitle }); } catch { }
			}

		});

		const resolveLinkHref = (root, target) => {
			if (!root) return '';
			let url = root.getAttribute('href') || '';
			if (!url && target) {
				const candidate = target.closest ? target.closest('a[href]') : null;
				if (candidate && root.contains(candidate)) url = candidate.getAttribute('href') || '';
			}
			if (!url && root.querySelector) {
				const anchor = root.querySelector('a[href]');
				if (anchor) url = anchor.getAttribute('href') || '';
			}
			return url;
		};

		const onStoryLinkClick = async (event) => {
			if (event.defaultPrevented) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button === 1 || event.button === 2) return;
			const root = event.target.closest('[data-ajax-modal="link"]');
			if (!root) return;
			event.preventDefault();
			const url = resolveLinkHref(root, event.target);
			if (!url) return;
			await loadAndOpenStory(url, { stateMode: 'push' });
		};

		let prefetchCancel = null;

		const onStoryLinkPointerOver = (event) => {
			const root = event.target.closest('[data-ajax-modal="link"]');
			if (!root) return;
			const url = resolveLinkHref(root, event.target);
			if (prefetchCancel) { try { prefetchCancel(); } catch { } }
			if (prefetchEnabled && url && !cacheGet(url)) {
				try { prefetchCancel = ddg.net.prefetch(url, 120); } catch { prefetchCancel = null; }
			}
		};

		const onStoryLinkPointerOut = (event) => {
			const root = event.target.closest('[data-ajax-modal="link"]');
			if (!root) return;
			const related = event.relatedTarget;
			if (related && root.contains(related)) return;
			if (prefetchCancel) { try { prefetchCancel(); } catch { } prefetchCancel = null; }
		};

		const onStoryLinkTouchStart = (event) => {
			const root = event.target.closest('[data-ajax-modal="link"]');
			if (!root) return;
			const url = resolveLinkHref(root, event.target);
			if (prefetchCancel) { try { prefetchCancel(); } catch { } }
			if (prefetchEnabled && url && !cacheGet(url)) {
				try { prefetchCancel = ddg.net.prefetch(url, 120); } catch { prefetchCancel = null; }
			}
		};

		document.addEventListener('click', onStoryLinkClick);
		document.addEventListener('mouseover', onStoryLinkPointerOver);
		document.addEventListener('mouseout', onStoryLinkPointerOut);
		document.addEventListener('touchstart', onStoryLinkTouchStart, { passive: true });
		document.addEventListener('touchend', () => {
			if (prefetchCancel) { try { prefetchCancel(); } catch { } prefetchCancel = null; }
		}, { passive: true });
		document.addEventListener('touchcancel', () => {
			if (prefetchCancel) { try { prefetchCancel(); } catch { } prefetchCancel = null; }
		}, { passive: true });

		window.addEventListener('popstate', () => {
			const path = window.location.pathname;
			const modal = ensureModal();
			if (!modal) return;
			if (!path.startsWith('/stories/')) {
				if (modal.isOpen()) modal.close();
				return;
			}
			loadAndOpenStory(window.location.href, { stateMode: 'none', showSkeleton: true, force: true });
		});

		const tryOpenDirectStory = () => {
			if (!window.location.pathname.startsWith('/stories/')) return;
			loadAndOpenStory(window.location.href, { stateMode: 'replace', showSkeleton: true, force: true });
		};

		// If modals are already initialized, run immediately; otherwise, wait.
		if (ddg.createModal || (ddg.modals && Object.keys(ddg.modals).length)) {
			tryOpenDirectStory();
		} else {
			document.addEventListener('ddg:modals-ready', tryOpenDirectStory, { once: true });
		}
	}

	function randomFilters() {
		const triggerSelector = '[data-randomfilters]';
		const triggerEl = document.querySelector(triggerSelector);
		if (!triggerEl) return;
		if (ddg.randomFiltersInitialized) return;
		ddg.randomFiltersInitialized = true;

		const selectors = { trigger: triggerSelector };
		const state = (ddg.randomFilters ||= { bag: [] });
		if (!state.scheduleApply) {
			state.scheduleApply = (() => {
				let pendingValues = null;
				let resolvers = [];
				const run = ddg.utils.debounce(async () => {
					const toApply = pendingValues;
					pendingValues = null;
					try {
						await ddg.fs.applyCheckboxFilters(toApply, { merge: false });
					} finally {
						const pending = resolvers.slice();
						resolvers = [];
						pending.forEach(r => r());
					}
				}, 90);
				return (values) => new Promise((resolve) => {
					pendingValues = values;
					resolvers.push(resolve);
					run();
				});
			})();
		}

		const keyOf = (it) => (
			it?.url?.pathname ||
			it?.slug ||
			it?.fields?.slug?.value ||
			it?.id || null
		);

		const rebuildBag = (all, excludeKey) => {
			const ids = all.map((_, i) => i).filter(i => keyOf(all[i]) !== excludeKey);
			state.bag = ddg.utils.shuffle(ids);
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

			await state.scheduleApply(values);
		}, true);
	}

	function marquee(root = document) {
		const firstMarquee = root?.querySelector?.('[data-marquee]');
		if (!firstMarquee) return;
		ddg.utils.assert(typeof gsap !== 'undefined', 'marquee requires gsap');
		ddg.utils.assert(typeof IntersectionObserver !== 'undefined', 'marquee requires IntersectionObserver');

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

			const width = el.offsetWidth || 0;
			if (!width) return;

			// Capture original content once, then re-clone only as needed.
			if (!el.__ddgMarqueeOriginal) {
				el.__ddgMarqueeOriginal = Array.from(inner.children).map(n => n.cloneNode(true));
				// Reset to one set for base measurements
				inner.textContent = '';
				el.__ddgMarqueeOriginal.forEach(n => inner.appendChild(n.cloneNode(true)));
				el.__ddgMarqueeBaseWidth = inner.scrollWidth || 0;
				el.__ddgMarqueeCopies = 1;
			}

			const baseWidth = el.__ddgMarqueeBaseWidth || 0;
			if (!baseWidth) return;

			// Determine desired number of copies; ensure even for seamless half-swap
			let minTotal = Math.max(width * 2, baseWidth * 2);
			let targetCopies = Math.ceil(minTotal / Math.max(1, baseWidth));
			if (targetCopies % 2 !== 0) targetCopies += 1;
			if (targetCopies < 2) targetCopies = 2;

			const currentCopies = el.__ddgMarqueeCopies || 1;
			if (currentCopies !== targetCopies) {
				if (currentCopies < targetCopies) {
					const addSets = targetCopies - currentCopies;
					for (let k = 0; k < addSets; k++) {
						el.__ddgMarqueeOriginal.forEach(n => inner.appendChild(n.cloneNode(true)));
					}
				} else {
					const removeSets = currentCopies - targetCopies;
					const perSet = el.__ddgMarqueeOriginal.length;
					let toRemove = removeSets * perSet;
					while (toRemove-- > 0 && inner.lastChild) inner.removeChild(inner.lastChild);
				}
				el.__ddgMarqueeCopies = targetCopies;
			}

			// Compute animation metrics (distance and duration)
			const totalWidth = inner.scrollWidth;
			const distance = totalWidth / 2;
			const effW = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth));
			const speedPxPerSec = (vwPerSec / 100) * effW;
			const dynamicDuration = distance / Math.max(1, speedPxPerSec);
			const fixedDuration = distance / fixedPxPerSec;
			const duration = Math.max(fixedDuration, dynamicDuration);

			gsap.set(inner, { x: 0 });
			el.__ddgMarqueeConfig = { inner, distance, duration, copies: el.__ddgMarqueeCopies, baseWidth };
			el.__ddgMarqueeLastWidth = width;
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
				if (el.__ddgMarqueeIO && typeof el.__ddgMarqueeIO.disconnect === 'function') el.__ddgMarqueeIO.disconnect();
				delete el.__ddgMarqueeTween;
				delete el.__ddgMarqueeConfig;
				delete el.__ddgMarqueeOriginal;
				delete el.__ddgMarqueeBaseWidth;
				delete el.__ddgMarqueeCopies;
				delete el.__ddgMarqueeLastWidth;
			};

			// Defer building until element is visible to avoid wasted work
			el.__ddgMarqueeReady = () => {
				if (el.__ddgMarqueeIO) el.__ddgMarqueeIO.disconnect();
				const observer = new IntersectionObserver((entries, obs) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							build(el);
							obs.unobserve(el);
							break;
						}
					}
				}, { root: null, rootMargin: '100px', threshold: 0 });
				el.__ddgMarqueeIO = observer;
				observer.observe(el);
			};
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

		// Bind global listeners once (idempotent)
		if (!ddg.marqueeGlobalBound) {
			ddg.marqueeGlobalBound = true;
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
			// Cleanup for non-modal removals to prevent stray listeners
			const attachDomObserver = () => {
				if (ddg.marqueeDomObserver) return;
				if (typeof MutationObserver !== 'function') return;
				ddg.marqueeDomObserver = new MutationObserver(muts => {
					for (const m of muts) {
						m.removedNodes && m.removedNodes.forEach(node => {
							if (!(node instanceof Element)) return;
							const targets = node.matches?.('[data-marquee-init]') ? [node] : [];
							node.querySelectorAll?.('[data-marquee-init]').forEach(el => targets.push(el));
							targets.forEach(el => {
								el.__ddgMarqueeCleanup?.();
								el.removeAttribute('data-marquee-init');
							});
						});
					}
				});
				const domRoot = document.body || document.documentElement;
				if (domRoot) ddg.marqueeDomObserver.observe(domRoot, { childList: true, subtree: true });
			};
			if (document.readyState === 'loading') {
				document.addEventListener('DOMContentLoaded', attachDomObserver, { once: true });
			} else {
				attachDomObserver();
			}
		}
	}

	function storiesAudioPlayer() {
		const storyModal = document.querySelector('[data-modal-el="story"]');
		if (!storyModal) return;
		if (ddg.storiesAudioPlayerInitialized) return;

		ddg.utils.assert(typeof WaveSurfer !== 'undefined', 'storiesAudioPlayer requires WaveSurfer');

		ddg.storiesAudioPlayerInitialized = true;

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
			const playBtn = el.querySelector('[data-player="play"]');
			if (playBtn) {
				const playIcon = playBtn.querySelector('.circle-btn_icon.is-play');
				const pauseIcon = playBtn.querySelector('.circle-btn_icon.is-pause');
				setPlayState(playBtn, playIcon, pauseIcon, false);
				disable(playBtn, true);
			}
			const muteBtn = el.querySelector('[data-player="mute"]');
			if (muteBtn) {
				const muteIcon = muteBtn.querySelector('.circle-btn_icon.is-mute');
				const unmuteIcon = muteBtn.querySelector('.circle-btn_icon.is-unmute');
				setMuteState(muteBtn, muteIcon, unmuteIcon, false);
				disable(muteBtn, true);
			}
			el.removeAttribute('data-audio-init');
			delete el.__ws;
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

	function outreach() {
		if (outreach.__initialized) return;
		outreach.__initialized = true;

		// pages: main / success / error
		const path = (location.pathname || '').replace(/\/+$/, '') || '/';
		const isMain = path === '/share-your-story';
		const isSuccess = path === '/share-your-story-success';
		const isError = path === '/share-your-story-error';
		if (!isMain && !isSuccess && !isError) return;

		// helpers
		const getQuery = (key) => new URLSearchParams(location.search).get(key);
		const go = (p) => { try { location.replace(p); } catch { location.href = p; } };
		const warn = (...a) => console.warn('[outreach]', ...a);

		// niceties (safe on any page)
		setupSplitTextTweaks();
		setupVideoPlayPause();
		setupInstructionReveal();

		// success page: require ddg_id + wire Airtable link
		if (isSuccess) {
			const ddgId = getQuery('ddg_id');
			if (!ddgId) return go('/share-your-story-error');
			const link = document.querySelector('#send-us-more');
			if (link) {
				link.href = 'https://airtable.com/appXsCnokfNjxOjon/pagjRUFuQgWS5y2HF/form' +
					`?prefill_DDG+ID=${encodeURIComponent(ddgId)}&hide_DDG+ID=true`;
			}
			return;
		}

		// error page: nothing else to do
		if (isError) return;

		// main page
		const ddgId = getQuery('ddg_id');
		if (!ddgId) return go('/share-your-story-error');
		const heroName = getQuery('ddg_name');
		const isTestMode = Boolean(getQuery('test_mode'));

		if (heroName) {
			const hero = document.querySelector('.outreach-hero');
			if (hero) {
				if (heroName.length > 12) hero.classList.add('is-sm');
				else if (heroName.length > 6) hero.classList.add('is-md');
			}
			document.querySelectorAll('.outreach-hero_word.is-name').forEach(n => n.textContent = heroName);
			if (window.gsap) gsap.to('.outreach-hero_content', { autoAlpha: 1, duration: 0.1, overwrite: 'auto' });
		}

		// if backend already has a recording, jump to success
		if (!isTestMode) checkExistingSubmission(ddgId).catch(() => { });

		if (typeof WaveSurfer === 'undefined' || typeof WaveSurfer.Record === 'undefined') {
			warn('WaveSurfer not found — recorder disabled.');
			return;
		}

		// recorder elements
		const root = document.querySelector('.recorder');
		const recordBtn = root?.querySelector('#rec-record');
		const playBtn = root?.querySelector('#rec-playback');
		const clearBtn = root?.querySelector('#rec-clear');
		const saveBtn = root?.querySelector('#rec-save');
		const submitBtn = root?.querySelector('#rec-submit');
		const msgEl = root?.querySelector('.recorder_msg-l, .recorder_msg-s') || root?.querySelector('.recorder_msg-l');
		const timerEl = root?.querySelector('.recorder_timer');
		const recWaveWrap = root?.querySelector('.recorder_visualiser.is-record');
		const pbWaveWrap = root?.querySelector('.recorder_visualiser.is-playback');
		const form = root?.querySelector('#rec-form');

		if (!root || !recordBtn || !playBtn || !clearBtn || !saveBtn || !submitBtn || !msgEl || !timerEl || !form || !recWaveWrap || !pbWaveWrap) {
			warn('Recorder DOM incomplete — aborting wiring.');
			return;
		}

		const ddgIdInput = form.querySelector('#ddg-id');
		if (ddgIdInput) ddgIdInput.value = ddgId;

		// recorder state
		let wsRecord = null;
		let wsPlayback = null;
		let wsRecordPlugin = null;
		let welcomePlayed = false;
		let recording = false;
		let blob = null;

		// ui helpers
		function setMessage(html, size = 'large') {
			msgEl.innerHTML = html || 'Ready?';
			msgEl.classList.toggle('recorder_msg-s', size === 'small');
			msgEl.classList.toggle('recorder_msg-l', size !== 'small');
		}
		function setTimerMs(ms) {
			const m = Math.floor((ms || 0) / 60000);
			const s = Math.floor(((ms || 0) % 60000) / 1000);
			timerEl.textContent = [m, s].map(v => (v < 10 ? '0' + v : String(v))).join(':');
		}
		function setTimerSec(sec) { setTimerMs((Number(sec) || 0) * 1000); }
		function syncButtons() {
			const hasAudio = Boolean(blob);
			recordBtn.disabled = false;
			saveBtn.disabled = !recording && !hasAudio;
			clearBtn.disabled = !recording && !hasAudio;
			playBtn.disabled = !hasAudio;
			submitBtn.disabled = !hasAudio;
		}

		// beep
		let audioCtx = null;
		function getAudioCtx() {
			if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
			try { audioCtx = new AudioContext(); } catch { audioCtx = null; }
			return audioCtx;
		}
		function beep(duration = 300, freq = 900, gain = 0.7) {
			const ctx = getAudioCtx();
			if (!ctx) return;
			if (ctx.state === 'suspended') ctx.resume().catch(() => { });
			const osc = ctx.createOscillator();
			const vol = ctx.createGain();
			osc.type = 'sine'; osc.frequency.value = freq; vol.gain.value = gain;
			osc.connect(vol); vol.connect(ctx.destination);
			osc.start();
			setTimeout(() => { try { osc.stop(); osc.disconnect(); vol.disconnect(); } catch { } }, duration);
		}

		// wavesurfer
		function initWaveSurfer() {
			wsRecord?.destroy?.();
			wsRecord = WaveSurfer.create({
				container: recWaveWrap,
				waveColor: 'rgb(0,0,0)',
				progressColor: 'rgb(0,0,0)',
				normalize: false,
				barWidth: 4, barGap: 6, barHeight: 2.5
			});
			wsRecordPlugin = wsRecord.registerPlugin(WaveSurfer.Record.create({
				renderRecordedAudio: false,
				scrollingWaveform: false,
				continuousWaveform: false,
				continuousWaveformDuration: 30
			}));
			wsRecordPlugin.on('record-progress', (ms) => setTimerMs(ms));
			wsRecordPlugin.on('record-end', (b) => {
				blob = b; recording = false; syncButtons();
				wsPlayback?.destroy?.();
				const url = URL.createObjectURL(b);
				wsPlayback = WaveSurfer.create({
					container: pbWaveWrap,
					waveColor: '#B1B42E',
					progressColor: 'rgb(0,0,0)',
					normalize: false,
					barWidth: 4, barGap: 6, barHeight: 2.5,
					url
				});
				wsPlayback.on('timeupdate', (t) => setTimerSec(t));
			});
			setMessage('Ready?'); setTimerMs(0); syncButtons();
		}

		async function countdownThen(fn) {
			setMessage('3'); await ddg.utils.wait(1000);
			setMessage('2'); await ddg.utils.wait(1000);
			setMessage('1'); await ddg.utils.wait(1000);
			beep(); await ddg.utils.wait(700);
			fn();
		}

		async function onRecordClick() {
			// if already recording or paused, toggle immediately (no countdown/welcome)
			if (wsRecordPlugin?.isRecording() || wsRecordPlugin?.isPaused()) {
				return toggleRecording();
			}

			// first start: play welcome then countdown
			if (!welcomePlayed) {
				welcomePlayed = true;
				setMessage('👋<br>What’s the craic!<br>You’ve reached the DropDeadGenerous answering machine.<br>Leave your story after the tone...', 'small');
				try {
					const audio = new Audio('https://res.cloudinary.com/daoliqze4/video/upload/v1741701256/welcome_paoycn.mp3');
					audio.addEventListener('ended', () => countdownThen(toggleRecording), { once: true });
					await audio.play().catch(() => countdownThen(toggleRecording));
				} catch {
					await countdownThen(toggleRecording);
				}
			} else {
				await countdownThen(toggleRecording);
			}
		}

		function toggleRecording() {
			if (wsRecordPlugin.isRecording()) {
				wsRecordPlugin.pauseRecording();
				recording = true;
				setMessage('Recording paused.<br>You can add more; hit Save when finished.', 'small');
				return syncButtons();
			}
			if (wsRecordPlugin.isPaused()) {
				wsRecordPlugin.resumeRecording();
				recording = true;
				setMessage('Recording…', 'small');
				return syncButtons();
			}
			wsRecordPlugin.startRecording()
				.then(() => { recording = true; setMessage('Recording…', 'small'); syncButtons(); })
				.catch((err) => {
					recording = false; blob = null; syncButtons();
					setMessage('Mic access failed. Enable permissions and try again.', 'small');
					warn('startRecording failed', err);
				});
		}

		function onSaveClick() {
			try { wsRecordPlugin.stopRecording(); } catch { }
			recording = false;
			setMessage('Hit submit to send your recording. You can only do this once. 👂', 'small');
			syncButtons();
		}

		function onClearClick() {
			try { wsRecordPlugin.stopRecording(); } catch { }
			wsRecord?.empty?.(); wsPlayback?.pause?.();
			blob = null; recording = false;
			setMessage('Ready?'); setTimerMs(0); syncButtons();
		}

		async function onSubmitClick(e) {
			e.preventDefault();
			if (!blob) return go('/share-your-story-error');

			setMessage('Uploading your recording…', 'small');
			submitBtn.disabled = true;

			try {
				const fileUrl = await uploadToCloudinary(blob, ddgId);
				const urlField = form.querySelector('#file-url');
				if (urlField) urlField.value = fileUrl;

				// redirect to success (we intercept the submit)
				form.addEventListener('submit', (ev) => {
					ev.preventDefault();
					go(`/share-your-story-success?ddg_id=${encodeURIComponent(ddgId)}`);
				}, { once: true });

				const realSubmit = form.querySelector('[type="submit"]');
				if (realSubmit) realSubmit.click();
				else go(`/share-your-story-success?ddg_id=${encodeURIComponent(ddgId)}`);
			} catch (err) {
				warn('upload failed', err);
				setMessage('Upload failed. Please try again.', 'small');
				go('/share-your-story-error');
			}
		}

		async function uploadToCloudinary(fileBlob, id) {
			const fd = new FormData();
			fd.append('file', fileBlob, `${id}.webm`);
			fd.append('upload_preset', 'ddg-recordings');
			const res = await fetch('https://api.cloudinary.com/v1_1/daoliqze4/video/upload', { method: 'POST', body: fd });
			if (!res.ok) throw new Error('Cloudinary upload failed');
			const json = await res.json();
			if (!json?.secure_url) throw new Error('secure_url missing');
			return json.secure_url;
		}

		async function checkExistingSubmission(id) {
			const url = `https://hook.eu2.make.com/82eitnupdvhl1yn3agge1riqmonwlvg3?ddg_id=${encodeURIComponent(id)}`;
			const data = await ddg.net.fetchJSON(url);
			if (data?.status === 'recording') go(`/share-your-story-success?ddg_id=${encodeURIComponent(id)}`);
		}

		// wire up
		initWaveSurfer();
		syncButtons();
		recordBtn.addEventListener('click', onRecordClick);
		saveBtn.addEventListener('click', onSaveClick);
		clearBtn.addEventListener('click', onClearClick);
		playBtn.addEventListener('click', () => wsPlayback?.playPause?.());
		submitBtn.addEventListener('click', onSubmitClick);

		// niceties
		function setupSplitTextTweaks() {
			if (!window.gsap || typeof window.SplitText === 'undefined') return;
			document.querySelectorAll('[ddg-text-anim="true"]').forEach((el) => {
				const split = new SplitText(el, { type: 'chars, words' });
				for (let i = 1; i < 4; i++) {
					const raw = el.getAttribute('ddg-text-anim-' + i);
					const idx = Number(raw) - 1;
					if (!split.chars[idx]) continue;
					gsap.set(split.chars[idx], { fontFamily: 'Tiny5', letterSpacing: '-0.05em', fontSize: '1.18em' });
					if (split.chars[idx - 1]) gsap.set(split.chars[idx - 1], { letterSpacing: '0.05em' });
					if (split.chars[idx + 1]) gsap.set(split.chars[idx + 1], { letterSpacing: '-0.05em' });
				}
			});
		}

		function setupVideoPlayPause() {
			const video = document.getElementById('outreach-video');
			const trigger = document.getElementById('video-playpause-trigger');
			const label = document.getElementById('video-playpause');
			if (!video || !trigger || !label) return;

			trigger.addEventListener('click', async () => {
				if (video.paused) {
					try { await video.play(); label.textContent = 'Pause'; trigger.setAttribute('data-playing', 'true'); }
					catch (err) { warn('Video play failed', err); alert('Unable to play the video. Please try again.'); }
				} else {
					try { video.pause(); label.textContent = 'Play'; trigger.setAttribute('data-playing', 'false'); }
					catch (err) { warn('Video pause failed', err); }
				}
			});
		}

		function setupInstructionReveal() {
			if (!window.gsap || !window.ScrollTrigger) return;
			gsap.registerPlugin(ScrollTrigger);
			document.querySelectorAll('.outreach-instructions_item').forEach((item) => {
				const img = item.querySelector('.outreach-instructions_img-wrap');
				const block = item.querySelector('.outreach-instructions_block');
				const tl = gsap.timeline({ scrollTrigger: { trigger: item, start: 'top 80%', toggleActions: 'play none none reverse' } });
				if (block) { gsap.set(block, { opacity: 0, y: 50 }); tl.to(block, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, 0); }
				if (img) { gsap.set(img, { opacity: 0, y: 50 }); tl.to(img, { opacity: 1, y: 0, duration: 1, ease: 'power2.out' }, 0.2); }
			});
		}
	}

	function currentItem() {
		const logPrefix = '[currentItem]';

		ddg.currentItem ??= { item: null, url: null, list: null };

		let lastKey = null;
		let pendingUrl = null;   // last seen story url (can arrive before list is ready)
		let hooksBound = false;
		let unresolvedWarnLogged = false;

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
			unresolvedWarnLogged = false;

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

			try {
				const resolved = new URL(pendingUrl, window.location.origin);
				if (!unresolvedWarnLogged && list && resolved.pathname.startsWith('/stories/')) {
					unresolvedWarnLogged = true;
					ddg.utils.warn(`${logPrefix} unresolved for URL ${resolved.href}`);
				}
			} catch (err) {
				if (!unresolvedWarnLogged) {
					unresolvedWarnLogged = true;
					ddg.utils.warn(`${logPrefix} unresolved for URL ${pendingUrl}`);
				}
			}


		}

		// capture early story-opened (can fire before list exists)
		ddg.utils.on('ddg:story-opened', (e) => {
			pendingUrl = e.detail?.url || window.location.href;
			tryResolve(pendingUrl);
		});

	}

	function relatedFilters() {
		const parentSelector = '[data-relatedfilters="parent"]';
		const targetSelector = '[data-relatedfilters="target"]';
		const rootParent = document.querySelector(parentSelector);
		if (!rootParent) return;
		if (ddg.relatedFiltersInitialized) return;
		ddg.relatedFiltersInitialized = true;

		const selectors = {
			parent: parentSelector,
			target: targetSelector,
			search: '[data-relatedfilters="search"]',
			label: 'label[fs-list-emptyfacet]',
			input: 'input[type="checkbox"][fs-list-field][fs-list-value]',
			span: '.checkbox_label'
		};

		const excludeFields = new Set(['slug', 'name', 'title']);
		const MAX_FILTERS = 6;


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

			const entries = [];
			for (const [field, arr] of Object.entries(itemValues || {})) {
				if (!Array.isArray(arr) || !arr.length) continue;
				if (excludeFields.has(field)) continue;
				for (const val of Array.from(new Set(arr))) {
					entries.push({ field, value: String(val) });
				}
			}


			const limited = ddg.utils.shuffle(entries).slice(0, MAX_FILTERS);
			limited.forEach(({ field, value }, idx) => {
				const clone = tpl.cloneNode(true);
				const input = clone.querySelector(selectors.input);
				const span = clone.querySelector(selectors.span);
				if (!input || !span) return;
				const id = `rf-${field}-${idx}`;
				input.id = id;
				input.name = `rf-${field}`;
				input.setAttribute('fs-list-field', field);
				input.setAttribute('fs-list-value', value);
				span.textContent = value;
				target.appendChild(clone);
			});

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
