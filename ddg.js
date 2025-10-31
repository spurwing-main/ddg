
(function () {
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false
	});

	ddg.utils = {

		debounce: (fn, ms = 150) => {
			let t;
			return (...args) => {
				clearTimeout(t);
				t = setTimeout(() => fn(...args), ms);
			};
		},

		wait: (ms = 0) => new Promise(resolve => setTimeout(resolve, ms)),

		shuffle: (arr) => {
			const a = arr.slice();
			for (let i = a.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[a[i], a[j]] = [a[j], a[i]];
			}
			return a;
		},

		emit: (event, detail, el = document) =>
			el.dispatchEvent(new CustomEvent(event, { detail })),

		log: (...a) => console.log('[ddg]', ...a),
		warn: (...a) => console.warn('[ddg]', ...a),

		fontsReady: async (timeoutMs = 3000) => {
			if (!document.fonts?.ready) {
				await new Promise(r => requestAnimationFrame(r));
				return;
			}
			try {
				await Promise.race([
					document.fonts.ready,
					new Promise(r => setTimeout(r, timeoutMs))
				]);
				await new Promise(r => requestAnimationFrame(r));
			} catch { }
		}
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
			if (!type || typeof fn !== 'function') return () => { };
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
			document.addEventListener('ddg:resize', handler);
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

		const itemsValues = (item) => {
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

		async function applyCheckboxFilters(valuesByField) {
			const list = await whenReady();

			// Build a map of what values we want per field
			const targetValuesByField = {};
			for (const [field, vals = []] of Object.entries(valuesByField || {})) {
				const values = Array.from(new Set((vals || []).map(String))).filter(Boolean);
				if (values.length === 0) continue;
				targetValuesByField[field] = values;
			}

			// Clear ALL existing filters by creating a fresh filters object
			list.filters.value = {
				groupsMatch: 'and',
				groups: [{
					id: '0',
					conditionsMatch: 'and',
					conditions: Object.entries(targetValuesByField).map(([field, values]) => ({
						id: `${field}_equal`,
						type: 'checkbox',
						fieldKey: field,
						value: values,
						op: 'equal',
						interacted: true,
						showTag: true
					}))
				}]
			};

			// Trigger the filter lifecycle
			await list.triggerHook('filter');
			await afterNextRender(list);
		}

		return { whenReady, items, itemsValues, applyCheckboxFilters, afterNextRender };
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
			homelistSplit();
			outreach();
			share();
			randomFilters();
			storiesAudioPlayer();
			joinButtons();
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
			} catch { }
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
		const list = document.querySelector('.home-list_list');
		if (!list) {
			(window.ddg?.utils?.warn || console.warn)('homelistSplit: .home-list_list not found');
			return;
		}

		const mobileBp = 767;
		const tapeSpeed = 5000;

		let split = null;

		const isMobile = () => window.innerWidth <= mobileBp;

		const revertSplit = () => {
			if (!split) return;
			try { split.revert(); } catch (e) {
				(ddg?.utils?.warn || console.warn)('homelistSplit: revert failed', e);
			} finally { split = null; }
		};

		const applySplit = () => {
			const items = gsap.utils.toArray(list.querySelectorAll('.home-list_item'));
			if (!items.length) return;

			split = new SplitText(items, { type: 'lines', linesClass: 'home-list_split-line' });

			// helper to measure 1ch in pixels for a given element (inherits font)
			const measureChPx = (el) => {
				try {
					const probe = document.createElement('span');
					probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;margin:0;padding:0;border:0;width:1ch;height:0;font:inherit;white-space:normal;';
					el.appendChild(probe);
					const w = probe.getBoundingClientRect().width || 0;
					probe.remove();
					return w || 1; // avoid divide-by-zero
				} catch { return 1; }
			};

			split.lines.forEach(line => {
				const dur = gsap.utils.clamp(0.3, 2, (line.offsetWidth || 0) / tapeSpeed);
				line.style.setProperty('--tape-dur', `${dur}s`);

				// set a per-line CSS var with its width expressed in `ch`
				const chPx = measureChPx(line);
				const widthPx = line.getBoundingClientRect().width || 0;
				const chUnits = chPx ? (widthPx / chPx) : 0;
				line.style.setProperty('--line-ch', `${chUnits.toFixed(2)}ch`);
			});
		};

		// flags wrappers that contain a [data-coming-soon] descendant
		const flagComingSoon = () => {
			const wraps = list.querySelectorAll('.home-list_item-wrap');
			wraps.forEach(wrap => {
				const hasMarker = !!wrap.querySelector('[data-coming-soon]');
				if (hasMarker) {
					wrap.setAttribute('data-coming-soon', 'true');
				} else {
					wrap.removeAttribute('data-coming-soon');
				}
			});
		};

		const update = () => {
			try { flagComingSoon(); } catch (e) {
				(ddg?.utils?.warn || console.warn)('homelistSplit: flagComingSoon failed', e);
			}

			revertSplit();
			if (isMobile()) return;

			try { applySplit(); } catch (e) {
				(ddg?.utils?.warn || console.warn)('homelistSplit: split failed', e);
			}
		};

		const onResize = ddg?.utils?.debounce ? ddg.utils.debounce(update, 150) : update;

		const init = async () => {
			await (ddg?.utils?.fontsReady?.() ?? Promise.resolve());
			update();

			window.addEventListener('resize', onResize);

			ddg?.fs?.whenReady?.().then(listInstance => {
				if (typeof listInstance?.addHook === 'function') {
					listInstance.addHook('afterRender', update);
				}
			});
		};

		init();

		return () => {
			window.removeEventListener('resize', onResize);
			revertSplit();
		};
	}

	function share() {
		if (ddg.shareInitialized) return;
		ddg.shareInitialized = true;

		const sel = { btn: '[data-share]' };
		const webhookUrl = 'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';
		const dailyKey = 'share_done_date';

		const urlFor = {
			clipboard: ({ url }) => url,
			x: ({ url, text }) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
			facebook: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
			linkedin: ({ url }) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
			whatsapp: ({ url, text }) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
			messenger: ({ url }) => `https://www.messenger.com/t/?link=${encodeURIComponent(url)}`,
			snapchat: ({ url }) => `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`,
			telegram: ({ url, text }) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
		};

		// ---------- tiny helpers ----------
		const toNum = (v) => {
			const n = parseInt(String(v ?? '').trim(), 10);
			return Number.isFinite(n) ? n : 0;
		};

		const buildDest = (platform, url, text) =>
			(urlFor[platform] ? urlFor[platform]({ url, text }) : url);

		const navigateStub = (winRef, url) => {
			try {
				if (winRef && !winRef.closed) {
					winRef.opener = null;
					winRef.location.href = url;
					return;
				}
			} catch { /* noop */ }
			window.open(url, '_blank') || (location.href = url);
		};

		// ---------- confetti (uses utils + always returns a Promise) ----------
		let confettiInstance, confettiCanvas;
		const ensureCanvas = () => {
			if (confettiCanvas) return confettiCanvas;
			const c = document.createElement('canvas');
			Object.assign(c.style, {
				position: 'fixed', inset: 0, width: '100%', height: '100%',
				zIndex: 999999, pointerEvents: 'none'
			});
			c.id = 'ddg-confetti-canvas';
			document.body.appendChild(c);
			return (confettiCanvas = c);
		};

		const confetti = (opts = {}) => {
			try {
				if (!window.JSConfetti) {
					ddg.utils.warn('Confetti library missing');
					return Promise.resolve();
				}
				if (!confettiInstance) confettiInstance = new JSConfetti({ canvas: ensureCanvas() });
				// fun but simple: shuffle emojis so it varies
				const emojis = ddg.utils.shuffle(['🎉', '✨', '💥', '🎊']).slice(0, 3);
				ddg.utils.emit('ddg:share:confetti:start');
				return confettiInstance.addConfetti({
					emojis, confettiRadius: 6, confettiNumber: 150, ...opts
				}).finally(() => ddg.utils.emit('ddg:share:confetti:end'));
			} catch (e) {
				ddg.utils.warn('Confetti failed', e);
				return Promise.resolve();
			}
		};

		// ---------- countdown (returns true when any hits zero) ----------
		const tickCountdowns = () => {
			let hitZero = false;
			document.querySelectorAll('[data-share-countdown]').forEach((node) => {
				const cur = toNum(
					node.getAttribute('data-share-countdown') ||
					(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node.value : node.textContent)
				);
				const next = Math.max(0, cur - 1);
				if (cur > 0 && next === 0) hitZero = true;

				node.setAttribute('data-share-countdown', String(next));
				if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.value = String(next);
				else node.textContent = String(next);
			});
			return hitZero;
		};

		// ---------- webhook (unchanged behavior, clearer shape) ----------
		const postDailyWebhookIfNeeded = (platform) => {
			const today = new Date().toISOString().slice(0, 10);
			const cookieRow = document.cookie.split('; ').find(r => r.startsWith(dailyKey + '=')) || '';
			const cookieVal = cookieRow.split('=')[1] || null;
			const done = [localStorage.getItem(dailyKey), sessionStorage.getItem(dailyKey), cookieVal].includes(today);
			if (done) return;

			const form = document.createElement('form');
			const iframe = document.createElement('iframe');
			const name = 'wf_' + Math.random().toString(36).slice(2);
			iframe.name = name; iframe.style.display = 'none';
			form.target = name; form.method = 'POST'; form.action = webhookUrl; form.style.display = 'none';
			[['platform', platform], ['date', today]].forEach(([k, v]) => {
				const input = document.createElement('input');
				input.type = 'hidden'; input.name = k; input.value = v;
				form.appendChild(input);
			});
			document.body.append(iframe, form);
			form.submit();

			const exp = new Date(); exp.setHours(24, 0, 0, 0);
			localStorage.setItem(dailyKey, today);
			sessionStorage.setItem(dailyKey, today);
			document.cookie = `${dailyKey}=${today}; expires=${exp.toUTCString()}; path=/; SameSite=Lax`;

			// cleanup without blocking
			(async () => { await ddg.utils.wait(800); form.remove(); iframe.remove(); })();
		};

		// ---------- click handler ----------
		const onShareClick = async (e) => {
			const el = e.target.closest(sel.btn);
			if (!el) return;
			if (e.button && e.button !== 0) return; // left-click only
			e.preventDefault();

			if (el.shareLock) return;
			el.shareLock = true;
			(async () => { await ddg.utils.wait(350); el.shareLock = false; })();

			const platform = (el.getAttribute('data-share') || '').toLowerCase();
			const shareUrl = el.getAttribute('data-share-url') || window.location.href;
			const shareText = el.getAttribute('data-share-text') || document.title;
			const destination = buildDest(platform, shareUrl, shareText);

			const realClick = e.isTrusted && document.hasFocus();

			// clipboard path is quick feedback, no tab needed
			if (platform === 'clipboard') {
				// treat clipboard like a share: emit start, copy, tick countdown, maybe confetti, emit end
				ddg.utils.emit('ddg:share:start', { platform, destination });
				try {
					await navigator.clipboard.writeText(destination);
					el.setAttribute('data-share-state', 'copied');
					ddg.utils.emit('ddg:share:copied', { platform });
					// countdown + optional confetti for clipboard too
					const shouldConfetti = tickCountdowns();
					if (shouldConfetti) {
						await confetti();
					}
					if (realClick) postDailyWebhookIfNeeded(platform);
					ddg.utils.emit('ddg:share:end', { platform, destination });
				} catch {
					el.setAttribute('data-share-state', 'error');
				}
				(async () => { await ddg.utils.wait(2000); el.removeAttribute('data-share-state'); })();
				return;
			}

			// open stub immediately for popup blockers
			const stub = window.open('about:blank', '_blank');

			// countdown + optional confetti
			const shouldConfetti = tickCountdowns();
			const confettiDone = shouldConfetti ? confetti() : Promise.resolve();

			// fire webhook once/day
			if (realClick) postDailyWebhookIfNeeded(platform);

			ddg.utils.emit('ddg:share:start', { platform, destination });
			await confettiDone; // wait if any confetti
			navigateStub(stub, destination);
			ddg.utils.emit('ddg:share:end', { platform, destination });
		};

		document.addEventListener('click', onShareClick, true);
	}

	function modals() {
		const modalRoot = document.querySelector('[data-modal-el]');
		if (!modalRoot) return;
		if (ddg.modalsInitialized) return;

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

		// --- Existing baseline state setup ---
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

			const root = document.documentElement;
			if (open) {
				root.setAttribute('data-modal-state', 'open');
				root.setAttribute('data-modal-id', String(id || ''));
			} else {
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
				['transform', 'translate', 'rotate', 'scale', 'opacity', 'visibility', 'y', 'x'].forEach((prop) => {
					try { el.style.removeProperty(prop); } catch { try { el.style[prop] = ''; } catch { } }
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
				if ($inner && $inner[0]) return $inner[0];
				const $global = $(`[data-modal-scroll="${id}"]`).first();
				if ($global.length) return $global[0];
				const $scoped = $modal.find(`[data-modal-scroll="${id}"]`).first();
				if ($scoped.length) return $scoped[0];
				return $modal[0];
			};

			const resetScrollTop = () => {
				const container = resolveScrollContainer();
				if (!container) return;
				try { container.scrollTop = 0; } catch { }
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

				const guard = (ev) => { if (!container.contains(ev.target)) ev.preventDefault?.(); };
				window.addEventListener('wheel', guard, { capture: true, passive: false });
				window.addEventListener('touchmove', guard, { capture: true, passive: false });
				setTimeout(() => {
					window.removeEventListener('wheel', guard, true);
					window.removeEventListener('touchmove', guard, true);
				}, 900);
			};

			// Internal anchor scrolls (delegate inside this modal)
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
				if (!ddg.scrollLock.isHolding(id)) ddg.scrollLock.lock(id);
				Object.keys(ddg.modals).forEach(k => {
					if (k !== id && ddg.modals[k]?.isOpen?.()) ddg.modals[k].close({ skipAnimation: true });
				});

				lastActiveEl = document.activeElement;
				gsap.killTweensOf([$anim[0], $bg[0]]);
				syncCssState($modal, true, id);
				resetScrollTop();

				if (skipAnimation) {
					gsap.set([$bg[0], $anim[0]], { autoAlpha: 1, y: 0 });
					requestAnimationFrame(clearInlineTransforms);
					requestAnimationFrame(resetScrollTop);
					document.addEventListener('keydown', onKeydownTrap, true);
					requestAnimationFrame(focusModal);
					ddg.utils.emit('ddg:modal-opened', { id });
					return afterOpen && afterOpen();
				}

				setAnimating(true);
				gsap.set($bg[0], { autoAlpha: 0 });

				// Use transform-based slide for performance; no stacking context issues

				gsap.timeline({
					onComplete: () => {
						setAnimating(false);
						requestAnimationFrame(clearInlineTransforms);
						requestAnimationFrame(resetScrollTop);
						document.addEventListener('keydown', onKeydownTrap, true);
						requestAnimationFrame(focusModal);
						ddg.utils.emit('ddg:modal-opened', { id });
						afterOpen && afterOpen();
					}
				})
					.to($bg[0], {
						autoAlpha: 1,
						duration: 0.12,
						ease: 'power1.out',
						overwrite: 'auto'
					}, 0)
					.fromTo($anim[0], { y: '25%' }, { y: '0%', duration: 0.32, ease: 'power2.out', overwrite: 'auto' }, 0)
					.fromTo($anim[0], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16, ease: 'power1.out', overwrite: 'auto' }, 0);
			};

			const close = ({ skipAnimation = false, afterClose } = {}) => {
				if (!$modal.hasClass('is-open')) return;
				if (closing) return closingTl;

				closing = true;
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
					$bg[0]?.classList.remove('is-open');
					gsap.set([$bg[0], $anim[0]], { autoAlpha: 0, y: '25%' });
					return finish();
				}

				setAnimating(true);
				$bg[0]?.classList.remove('is-open');
				gsap.set([$modal[0], $inner[0], $bg[0]], { pointerEvents: 'none' });

				closingTl = gsap.timeline({ onComplete: () => { setAnimating(false); finish(); } });
				closingTl.to($anim[0], { y: '25%', duration: 0.32, ease: 'power2.in', overwrite: 'auto' }, 0);
				closingTl.to($anim[0], { autoAlpha: 0, duration: 0.16, ease: 'power1.in', overwrite: 'auto' }, 0);
				closingTl.to($bg[0], { autoAlpha: 0, duration: 0.12, ease: 'power1.inOut', overwrite: 'auto' }, 0);
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

		// --- Existing open logic ---
		$(document).on('click.modal', selectors.trigger, (e) => {
			const node = e.currentTarget;
			if (node.hasAttribute('data-ajax-modal')) return;
			e.preventDefault();
			const id = node.getAttribute('data-modal-trigger');
			const modal = createModal(id);
			modal?.open();
		});

		// --- Close buttons ---
		$(document).on('click.modal', selectors.close, (e) => {
			e.preventDefault();
			const id = e.currentTarget.getAttribute('data-modal-close');
			if (id) (ddg.modals[id] || createModal(id))?.close();
			else Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
		});

		// --- Story modal: clicking the inner container itself closes it (not its children)
		$(document).on('click.modal', '[data-modal-inner="story"]', (e) => {
			if (e.target !== e.currentTarget) return; // only close when clicking empty space on the inner
			const root = e.currentTarget.closest('[data-modal-el]');
			const id = root?.getAttribute('data-modal-el') || 'story';
			(ddg.modals[id] || createModal(id))?.close();
		});

		// --- Background clicks ---
		$(document).on('click.modal', selectors.bg, (e) => {
			if (e.target !== e.currentTarget) return;
			const id = e.currentTarget.getAttribute('data-modal-bg');
			(ddg.modals[id] || createModal(id))?.close();
		});

		// ✅ NEW: click anywhere *not inside modal content* closes it
		$(document).on('click.modal', (e) => {
			const isInner = e.target.closest(selectors.inner);
			const isModal = e.target.closest(selectors.modal);
			if (isInner || !isModal) return; // ignore clicks inside content or outside modals entirely
			const id = isModal.getAttribute('data-modal-el');
			if (id) (ddg.modals[id] || createModal(id))?.close();
		});

		// --- Iframe + escape logic remain unchanged ---
		const getFrameDocument = (frame) => {
			try { return frame.contentDocument || frame.contentWindow?.document || null; } catch { return null; }
		};

		document.addEventListener('ddg:modal-opened', (ev) => {
			const id = ev.detail?.id;
			if (!id) return;
			const modalEl = document.querySelector(`[data-modal-el="${id}"]`);
			if (!modalEl) return;
			modalEl.querySelectorAll('iframe').forEach((frame) => {
				const doc = getFrameDocument(frame);
				if (!doc) return;
				const handler = (e) => {
					if (e.target.closest('[data-modal-close]')) {
						e.preventDefault?.();
						(ddg.modals[id] || createModal(id))?.close();
					}
				};
				if (frame.__ddgIframeCloseHandler) doc.removeEventListener('click', frame.__ddgIframeCloseHandler);
				doc.addEventListener('click', handler);
				frame.__ddgIframeCloseHandler = handler;
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
				if (open && !ddg.scrollLock.isHolding(id)) ddg.scrollLock.lock(id);
				if (open) ddg.utils.emit('ddg:modal-opened', { id });
			});
		});

		document.addEventListener('ddg:modal-opened', () => {
			window.Marquee.rescan(document);
		});
		document.addEventListener('ddg:modal-closed', () => {
			window.Marquee.rescan(document);
		});

		ddg.utils.emit('ddg:modals-ready');
	}

	function ajaxStories() {
		const embedEl = document.querySelector('[data-ajax-modal="embed"]');
		if (!embedEl) return;
		if (ddg.ajaxStoriesInitialized) return;

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

		document.addEventListener('ddg:modal-closed', (ev) => {
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
						await ddg.fs.applyCheckboxFilters(toApply);
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
			const values = ddg.fs.itemsValues(item);

			await state.scheduleApply(values);
		}, true);
	}

	function storiesAudioPlayer() {
		const storyModal = document.querySelector('[data-modal-el="story"]');
		if (!storyModal || ddg.storiesAudioPlayerInitialized) return;
		ddg.storiesAudioPlayerInitialized = true;

		let activePlayer = null;

		const disable = (btn, state = true) => { if (btn) btn.disabled = !!state; };

		const setPlayState = (btn, playIcon, pauseIcon, playing) => {
			btn.setAttribute('data-state', playing ? 'playing' : 'paused');
			btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
			if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
			if (pauseIcon) pauseIcon.style.display = playing ? 'grid' : 'none';
		};

		const setMuteState = (btn, muteIcon, unmuteIcon, muted) => {
			btn.setAttribute('data-state', muted ? 'muted' : 'unmuted');
			btn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
			if (muteIcon) muteIcon.style.display = muted ? 'none' : 'block';
			if (unmuteIcon) unmuteIcon.style.display = muted ? 'block' : 'none';
		};

		const cleanupActive = () => {
			if (!activePlayer) return;
			try { activePlayer.wavesurfer?.destroy(); } catch (err) { ddg.utils.warn('[audio]', err); }
			activePlayer.el.removeAttribute('data-audio-init');
			activePlayer = null;
			ddg.utils.log('[audio] cleaned up');
		};

		const buildAudio = (modalEl) => {
			const playerEl = modalEl.querySelector('.story-player');
			if (!playerEl || playerEl.hasAttribute('data-audio-init')) return;
			cleanupActive();

			const audioUrl = playerEl.dataset.audioUrl;
			const waveformEl = playerEl.querySelector('.story-player_waveform');
			const playBtn = playerEl.querySelector('[data-player="play"]');
			const muteBtn = playerEl.querySelector('[data-player="mute"]');
			if (!audioUrl || !waveformEl || !playBtn || !muteBtn) return;

			const playIcon = playBtn.querySelector('.circle-btn_icon.is-play');
			const pauseIcon = playBtn.querySelector('.circle-btn_icon.is-pause');
			const muteIcon = muteBtn.querySelector('.circle-btn_icon.is-mute');
			const unmuteIcon = muteBtn.querySelector('.circle-btn_icon.is-unmute');

			playerEl.dataset.audioInit = 'true';
			ddg.utils.log('[audio] building player', audioUrl);

			let wavesurfer;
			let isMuted = false;

			try {
				if (typeof WaveSurfer === 'undefined') throw new Error('WaveSurfer not available');
				wavesurfer = WaveSurfer.create({
					container: waveformEl,
					height: waveformEl.offsetHeight || 42,
					waveColor: '#b6b83b',
					progressColor: '#2C2C2C',
					cursorColor: '#2C2C2C',
					barWidth: 3,
					barGap: 2,
					barAlign: 'center',
					normalize: false,
					dragToSeek: true,
					interact: true,
					url: audioUrl
				});
			} catch (err) {
				ddg.utils.warn('[audio]', err?.message || 'WaveSurfer init failed');
				return;
			}

			disable(playBtn, true);
			disable(muteBtn, true);
			setPlayState(playBtn, playIcon, pauseIcon, false);
			setMuteState(muteBtn, muteIcon, unmuteIcon, false);

			wavesurfer.once('ready', () => {
				disable(playBtn, false);
				disable(muteBtn, false);

				ddg.utils.log('[audio] waveform ready');
			});

			wavesurfer.on('play', () => {
				setPlayState(playBtn, playIcon, pauseIcon, true);
				document.querySelectorAll('.story-player[data-audio-init]').forEach(el => {
					if (el !== playerEl && el.__ws?.pause) el.__ws.pause();
				});
			});

			wavesurfer.on('pause', () => setPlayState(playBtn, playIcon, pauseIcon, false));
			wavesurfer.on('finish', () => setPlayState(playBtn, playIcon, pauseIcon, false));

			playBtn.addEventListener('click', () => wavesurfer.playPause());
			muteBtn.addEventListener('click', () => {
				isMuted = !isMuted;
				wavesurfer.setMuted(isMuted);
				setMuteState(muteBtn, muteIcon, unmuteIcon, isMuted);
			});

			playerEl.__ws = wavesurfer;
			activePlayer = { el: playerEl, wavesurfer };
		};

		document.addEventListener('ddg:modal-opened', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (modal) buildAudio(modal);
		});

		document.addEventListener('ddg:modal-closed', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (modal) cleanupActive();
		});

		ddg.utils.log('[audio] storiesAudioPlayer initialized');
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
					height: (pbWaveWrap?.offsetHeight || 42) * 1.2,
					waveColor: '#B1B42E',
					progressColor: 'rgb(0,0,0)',
					normalize: true,
					barWidth: 4, barGap: 2, barRadius: 2, barHeight: 2.5,
					minPxPerSec: 100,
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

		document.addEventListener('ddg:modal-closed', (e) => {
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
		document.addEventListener('ddg:story-opened', (e) => {
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
			const values = ddg.fs.itemsValues(item);

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
				await ddg.fs.applyCheckboxFilters(values);
			});
		}

		document.addEventListener('ddg:current-item-changed', (e) => {
			const item = e.detail?.item;
			if (!item) return;
			buildAll(item);
		});

		ddg.fs.whenReady().then(list => {
			const rebuild = () => {
				if (ddg.currentItem?.item) buildAll(ddg.currentItem.item);
			};
			document.addEventListener('ddg:list-ready', rebuild);
			if (typeof list.addHook === 'function') list.addHook('afterRender', rebuild);
		});
	}

	function joinButtons() {
		const stickyButton = document.querySelector('.join_sticky');
		const staticButton = document.querySelector('.join-cta_btn .button');

		// Initially: show sticky, hide static
		gsap.set(stickyButton, { autoAlpha: 1 });
		gsap.set(staticButton, { autoAlpha: 0 });

		ScrollTrigger.create({
			trigger: staticButton,
			start: () => {
				const remInPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
				return `bottom bottom-=${remInPx}px`;
			},
			end: () => {
				const remInPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
				return `bottom bottom-=${remInPx}px`;
			},
			onEnter: () => {
				// Animate swap with scale
				gsap.to(stickyButton, {
					autoAlpha: 0,
					duration: 0,
					ease: "none"
				});
				gsap.to(staticButton, {
					autoAlpha: 1,
					duration: 0,
					ease: "none"
				});
			},
			onLeaveBack: () => {
				// Animate reverse swap with scale
				gsap.to(stickyButton, {
					autoAlpha: 1,
					duration: 0,
					ease: "none"
				});
				gsap.to(staticButton, {
					autoAlpha: 0,
					duration: 0,
					ease: "none"
				});
			},
			invalidateOnRefresh: true
		});
	}

	ddg.boot = initSite;
})();
