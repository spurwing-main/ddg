window.ddg = window.ddg || {};
const ddg = window.ddg;

ddg.data = ddg.data || { siteBooted: false };
const data = ddg.data;

ddg.utils = {
	debounce(fn, ms = 150) {
		let t;
		return (...args) => {
			clearTimeout(t);
			t = setTimeout(() => fn(...args), ms);
		};
	},

	throttle(fn, ms = 150) {
		let last = 0;
		return (...args) => {
			const now = Date.now();
			if (now - last >= ms) {
				last = now;
				fn(...args);
			}
		};
	},

	wait(ms = 0) {
		return new Promise(resolve => setTimeout(resolve, ms));
	},

	shuffle(arr) {
		const a = arr.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	},

	emit(event, detail, el = document) {
		el.dispatchEvent(new CustomEvent(event, { detail }));
	},

	log(...args) {
		console.log('[ddg]', ...args);
	},

	warn(...args) {
		console.warn('[ddg]', ...args);
	},

	async fontsReady(timeoutMs = 3000) {
		if (!document.fonts || !document.fonts.ready) {
			return new Promise(resolve => requestAnimationFrame(resolve));
		}

		await Promise.race([
			document.fonts.ready,
			new Promise(resolve => setTimeout(resolve, timeoutMs))
		]);

		return new Promise(resolve => requestAnimationFrame(resolve));
	}
};

ddg.iframeBridge = (function () {
	const prefix = 'ddg:';

	function post(type, data = {}, target = 'parent') {
		const t = target === 'parent' ? window.parent : target;
		if (!type || !t?.postMessage) return;
		t.postMessage({ type: prefix + type, data }, '*');
	}

	function on(type, fn) {
		if (!type || typeof fn !== 'function') return () => { };
		const key = prefix + type;
		const handler = (e) => {
			if (e?.data?.type === key) fn(e.data.data, e);
		};
		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}

	return { post, on };
})();

ddg.net = {
	async fetchHTML(url) {
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) throw new Error(`fetchHTML: HTTP ${res.status}`);
		const text = await res.text();
		return new DOMParser().parseFromString(text, 'text/html');
	},

	async fetchJSON(url) {
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) throw new Error(`fetchJSON: HTTP ${res.status}`);
		return res.json();
	},

	prefetch(url, delay = 250) {
		const controller = new AbortController();
		const timeout = setTimeout(() => {
			fetch(url, {
				signal: controller.signal,
				credentials: 'same-origin'
			}).catch((err) => {
				if (!err || err.name === 'AbortError') return;
				ddg.utils.warn('ddg.net.prefetch failed:', err);
			});
		}, delay);

		return () => {
			clearTimeout(timeout);
			controller.abort();
		};
	}
};

ddg.scrollLock = (function () {
	const held = new Set();
	let saved = null;
	const docEl = document.documentElement;
	const body = document.body;

	function applyLock() {
		if (saved) return;
		const y = window.scrollY || docEl.scrollTop || 0;
		const x = window.scrollX || docEl.scrollLeft || 0;
		saved = { x, y };
		body.style.position = 'fixed';
		body.style.top = `-${y}px`;
		body.style.left = '0';
		body.style.right = '0';
		body.style.width = '100%';
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
		if (!held.size) removeLock();
	}

	return {
		lock,
		unlock,
		isLocked: () => held.size > 0,
		isHolding: (key) => held.has(String(key))
	};
})();

ddg.resizeEvent = (function () {
	const listeners = new Set();

	const readSize = () => ({
		width: window.innerWidth || document.documentElement.clientWidth || 0,
		height: window.innerHeight || document.documentElement.clientHeight || 0
	});

	let lastSize = readSize();

	const notify = () => {
		lastSize = readSize();
		const detail = { ...lastSize };
		listeners.forEach(fn => fn(detail));
	};

	const onWinResize = ddg.utils.throttle(notify, 150);
	window.addEventListener('resize', onWinResize, { passive: true });

	const on = (fn, { immediate = false } = {}) => {
		if (typeof fn !== 'function') return () => { };
		listeners.add(fn);
		if (immediate) fn({ ...lastSize });
		return () => listeners.delete(fn);
	};

	const getSize = () => ({ ...lastSize });

	return { on, getSize };
})();

ddg.fs = (function () {
	const log = (...a) => ddg.utils.log('[fs]', ...a);
	const warn = (...a) => ddg.utils.warn('[fs]', ...a);

	const getItemsArray = (list) => {
		if (!list) return [];
		const raw = list.items?.value ?? list.items;
		return Array.isArray(raw) ? raw : [];
	};

	let listPromise;
	const readyList = () => {
		if (listPromise) return listPromise;
		listPromise = new Promise((resolve) => {
			window.FinsweetAttributes ||= [];
			window.FinsweetAttributes.push(['list', (instances) => {
				const list = Array.isArray(instances)
					? (instances.find(Boolean) || instances[0])
					: instances;
				if (!list) {
					warn('readyList: no list instance');
					resolve(null);
					return;
				}
				log('list ready');
				ddg.utils.emit('fs:list-ready', { list });
				resolve(list);
			}]);
		});
		return listPromise;
	};

	const currentItem = (() => {
		if (!ddg.currentItem) {
			ddg.currentItem = { item: null, url: null };
		}

		const resolve = async (url = window.location.href) => {
			const list = await readyList();
			const items = getItemsArray(list);
			if (!items.length) return;

			const resolved = new URL(url, window.location.origin);
			const item = items.find(i => i.url && i.url.pathname === resolved.pathname);
			if (item && item !== ddg.currentItem.item) {
				ddg.currentItem.item = item;
				ddg.currentItem.url = url;
				log('current item', resolved.pathname);
				ddg.utils.emit('ddg:current-item-changed', { item, url });
			}
		};

		return { resolve };
	})();

	const setFilters = async (fieldValues, { reset = true } = {}) => {
		const list = await readyList();
		if (!list) {
			warn('setFilters: no list');
			return;
		}

		// Prevent two-way binding from reacting to these changes
		list.settingFilters = true;

		// Build new conditions from fieldValues
		const conditions = Object.entries(fieldValues || {})
			.map(([fieldKey, values]) => {
				const arr = Array.isArray(values) ? values : [values];
				const clean = [...new Set(arr.map(String))].filter(Boolean);
				if (!clean.length) return null;

				return {
					id: `${fieldKey}_equal`,
					type: 'checkbox', // Adjust if your actual form fields differ
					fieldKey,
					value: clean,
					op: 'equal',
					filterMatch: 'or',
					interacted: true,
					showTag: true,
					tagValuesDisplay: 'combined',
				};
			})
			.filter(Boolean);

		log('setFilters', { groups: conditions.length });

		// Replace the entire filters model
		list.filters.value = {
			groupsMatch: 'and',
			groups: conditions.length
				? [
					{
						id: '0',
						conditionsMatch: 'and',
						conditions,
					},
				]
				: [],
		};

		// Re-enable two-way binding; the watcher will now call setConditionsData
		list.settingFilters = false;

		ddg.utils.emit('ddg:filters-change', { fieldValues, list }, window);
	};

	const relatedFilters = (() => {
		const max = 6;
		const excluded = new Set(['slug', 'name', 'title']);
		const sel = {
			parent: '[data-relatedfilters="parent"]',
			target: '[data-relatedfilters="target"]',
			search: '[data-relatedfilters="search"]',
			label: 'label[fs-list-emptyfacet]',
			input: 'input[type="checkbox"][fs-list-field][fs-list-value]',
			span: '.checkbox_label'
		};

		const extractFields = (item) => {
			const fields = item?.fields || {};
			const result = {};
			for (const [key, field] of Object.entries(fields)) {
				if (excluded.has(key)) continue;
				const vals = Array.isArray(field.value) ? field.value : [field.value];
				const strings = vals.map(v => String(v)).filter(Boolean);
				if (strings.length) result[key] = strings;
			}
			return result;
		};

		const createLabel = () => {
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
			label.append(input, span);
			return label;
		};

		const wireCheckboxes = (parent) => {
			if (parent.rfWired) return;
			parent.rfWired = true;
			parent.addEventListener('change', (e) => {
				if (!e.target?.matches(sel.input)) return;
				const label = e.target.closest('label');
				if (label) label.classList.toggle('is-list-active', e.target.checked);
			});
		};

		const wireSearch = (parent) => {
			const btn = parent.querySelector(sel.search);
			if (!btn || btn.rfBound) return;
			btn.rfBound = true;
			btn.addEventListener('click', async (e) => {
				e.preventDefault();
				const selected = {};
				parent.querySelectorAll(`${sel.target} ${sel.input}:checked`).forEach(input => {
					const field = input.getAttribute('fs-list-field');
					const value = input.getAttribute('fs-list-value');
					if (field && value) (selected[field] ||= []).push(value);
				});
				if (Object.keys(selected).length) await setFilters(selected);
			});
		};

		const render = (parent, fields) => {
			const target = parent.querySelector(sel.target);
			if (!target) return;

			const tpl = target.querySelector(sel.label) || createLabel();
			target.innerHTML = '';

			const entries = [];
			for (const [field, arr] of Object.entries(fields || {})) {
				if (!Array.isArray(arr) || !arr.length || excluded.has(field)) continue;
				new Set(arr).forEach(val => entries.push({ field, value: String(val) }));
			}

			ddg.utils.shuffle(entries).slice(0, max).forEach(({ field, value }, i) => {
				const clone = tpl.cloneNode(true);
				const input = clone.querySelector(sel.input);
				const span = clone.querySelector(sel.span);
				if (!input || !span) return;
				input.id = `rf-${field}-${i}`;
				input.name = `rf-${field}`;
				input.setAttribute('fs-list-field', field);
				input.setAttribute('fs-list-value', value);
				span.textContent = value;
				target.appendChild(clone);
			});

			wireCheckboxes(parent);
			parent.querySelectorAll(`${sel.target} ${sel.input}`).forEach(i => {
				const label = i.closest('label');
				if (label) label.classList.toggle('is-list-active', i.checked);
			});
		};

		const init = () => {
			const build = () => {
				const item = ddg.currentItem?.item;
				if (!item) return;
				const fields = extractFields(item);
				document.querySelectorAll(sel.parent).forEach(parent => {
					render(parent, fields);
					wireSearch(parent);
				});
			};

			document.addEventListener('ddg:current-item-changed', (e) => {
				if (e.detail?.item) build();
			});

			document.addEventListener('ddg:story-opened', () => {
				requestAnimationFrame(() => requestAnimationFrame(build));
			});

			log('relatedFilters init');
		};

		return { init };
	})();

	const randomFilters = (() => {
		const maxTotal = 4;
		const state = { bag: [] };

		const getKey = (item) =>
			item?.url?.pathname || item?.slug || item?.fields?.slug?.value || item?.id || null;

		const rebuildBag = (items, exclude) => {
			const ids = items.map((_, i) => i).filter(i => getKey(items[i]) !== exclude);
			state.bag = ddg.utils.shuffle(ids);
		};

		const getNext = (items) => {
			const exclude = ddg.currentItem?.item ? getKey(ddg.currentItem.item) : null;
			if (!state.bag.length) rebuildBag(items, exclude);
			return state.bag.shift();
		};

		const init = () => {
			document.addEventListener('click', async (e) => {
				const btn = e.target.closest('[data-randomfilters]');
				if (!btn || btn.rfLock) return;
				e.preventDefault();

				btn.rfLock = true;
				setTimeout(() => (btn.rfLock = false), 250);

				const list = await readyList();
				if (!list) return;

				const items = getItemsArray(list);
				if (!items.length) return;

				const idx = getNext(items);
				const item = items[idx] ?? items[Math.floor(Math.random() * items.length)];

				const allEntries = [];
				for (const [fieldKey, field] of Object.entries(item.fields || {})) {
					const vals = Array.isArray(field.value) ? field.value : [field.value];
					vals.forEach(v => allEntries.push({ fieldKey, value: v }));
				}

				const limited = {};
				ddg.utils.shuffle(allEntries)
					.slice(0, maxTotal)
					.forEach(({ fieldKey, value }) => {
						(limited[fieldKey] ||= []).push(value);
					});

				log('randomFilters apply', { idx, limited });
				await setFilters(limited);
			}, true);

			log('randomFilters init');
		};

		return { init };
	})();

	const loadingFilters = (() => {
		const maxDisplay = 8;

		const init = () => {
			log('loadingFilters init');

			let attempts = 0;
			const maxAttempts = 300;

			const waitForIx = () => new Promise((resolve, reject) => {
				const check = () => {
					attempts++;
					const wf = window.Webflow;
					if (wf?.require) {
						const wfIx = wf.require('ix3');
						if (wfIx?.emit) {
							resolve(wfIx);
							return;
						}
					}
					if (attempts >= maxAttempts) {
						reject(new Error('Webflow ix3 not ready'));
						return;
					}
					requestAnimationFrame(check);
				};
				check();
			});

			waitForIx()
				.then((wfIx) => {
					const parent = document.querySelector('[data-loadingfilters="parent"]');
					if (!parent) return;

					const labels = parent.querySelectorAll('label');
					let modalOpen = false;
					let pendingAnimation = false;

					readyList().then(list => {
						if (!list?.filters?.value) return;

						list.addHook('filter', (items) => {
							const groups = list.filters.value.groups || [];
							const allValues = groups.flatMap(g =>
								(g.conditions || []).flatMap(c => {
									const v = c.value;
									return Array.isArray(v) ? v : [v];
								})
							).filter(Boolean);

							const values = allValues.slice(0, maxDisplay);
							const extra = Math.max(0, allValues.length - maxDisplay);

							labels.forEach((label, i) => {
								const span = label.querySelector('span');
								if (values[i]) {
									label.style.display = '';
									if (span) span.textContent = values[i];
								} else if (i === values.length && extra > 0) {
									label.style.display = '';
									if (span) span.textContent = `+${extra} more`;
								} else {
									label.style.display = 'none';
								}
							});

							if (values.length) {
								if (modalOpen) {
									pendingAnimation = true;
								} else {
									window.scrollTo({ top: 0, behavior: 'smooth' });
									wfIx.emit('loadingFilters');
								}
							}

							return items;
						});
					});

					document.addEventListener('ddg:modal-opened', (e) => {
						if (e.detail?.id === 'filters') modalOpen = true;
					});

					document.addEventListener('ddg:modal-closed', (e) => {
						if (e.detail?.id === 'filters') {
							modalOpen = false;
							if (pendingAnimation) {
								pendingAnimation = false;
								window.scrollTo({ top: 0, behavior: 'smooth' });
								wfIx.emit('loadingFilters');
							}
						}
					});
				})
				.catch(err => {
					warn('loadingFilters: Webflow ix3 not available', err);
				});
		};

		return { init };
	})();

	let initialized = false;
	const finsweetRelated = () => {
		if (initialized) return;
		initialized = true;
		log('finsweetRelated init');
		currentItem.resolve();
		relatedFilters.init();
		randomFilters.init();
		loadingFilters.init();
		log('finsweetRelated: complete');
	};

	return {
		readyList,
		finsweetRelated,
		resolveCurrentItem: currentItem.resolve,
		setFilters
	};
})();

function iframe() {
	// parent window: follow child URL sync
	if (window === window.parent) {
		let childSyncSession = false;
		const norm = (p) => {
			const s = String(p || '');
			return s.replace(/\/+$/, '') || '/';
		};

		ddg.iframeBridge.on('sync-url', ({ url, title }) => {
			const parentPath = norm(location.pathname);
			let nextPath = null;

			if (url) {
				const nextUrl = new URL(url, location.href);
				nextPath = norm(nextUrl.pathname);
			}

			const allow = childSyncSession || parentPath === '/';
			if (!allow) return;

			if (!childSyncSession && parentPath === '/' && nextPath && nextPath !== '/') {
				childSyncSession = true;
			}

			if (url && url !== location.href) {
				const u = new URL(url, location.href);
				if (u.origin === location.origin) {
					history.replaceState(history.state, '', u.toString());
				} else {
					location.assign(u.toString());
				}
			}

			if (childSyncSession && nextPath === '/') childSyncSession = false;
			if (title) document.title = title;
		});

		return ddg.iframeBridge;
	}

	// child frame: notify parent on URL changes
	const notify = ddg.utils.debounce(
		() => ddg.iframeBridge.post('sync-url', { url: location.href, title: document.title }), 50
	);

	const wrapHistory = (name) => {
		const orig = history[name];
		if (typeof orig !== 'function' || orig.__ddgWrapped) return;
		const wrapped = function (...args) {
			const result = orig.apply(this, args);
			notify();
			return result;
		};
		wrapped.__ddgWrapped = true;
		history[name] = wrapped;
	};

	wrapHistory('pushState');
	wrapHistory('replaceState');
	window.addEventListener('popstate', notify);
	window.addEventListener('hashchange', notify);
	setTimeout(notify, 0);

	// child: normal links navigate top-level
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

	ddg.utils.log('[ddg] iframe booted');
	return ddg.iframeBridge;
}

function nav() {
	const navEl = document.querySelector('.nav');
	if (!navEl || ddg.navInitialized) return;

	ddg.navInitialized = true;

	const showThreshold = 50;   // px from top where nav always visible
	const hideThreshold = 100;  // px before nav is allowed to hide
	const revealBuffer = 50;    // px scroll up needed to reveal nav

	let lastY = window.scrollY || 0;
	let revealDistance = 0;

	const updateNav = () => {
		const y = window.scrollY || 0;
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
	};

	const onScroll = ddg.utils.throttle(updateNav, 16);
	window.addEventListener('scroll', onScroll, { passive: true });

	updateNav();
}

function homelistSplit() {
	const list = document.querySelector('.home-list_list');
	if (!list) {
		ddg.utils.warn('homelistSplit: .home-list_list not found');
		return;
	}

	const mobileBp = 767;
	const tapeSpeed = 5000;
	let split = null;
	let observer = null;
	let lastWidth = window.innerWidth;
	let resizeTimeout = null;

	const isMobile = () => window.innerWidth <= mobileBp;

	const revertSplit = () => {
		if (!split) return;
		try { split.revert(); } catch (e) { ddg.utils.warn('homelistSplit: revert failed', e); }
		split = null;
	};

	const applySplit = () => {
		const items = gsap.utils.toArray(list.querySelectorAll('.home-list_item'));
		if (!items.length) return;

		split = new SplitText(items, { type: 'lines', linesClass: 'home-list_split-line' });

		const probe = document.createElement('span');
		probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;margin:0;padding:0;border:0;width:1ch;height:0;font:inherit;white-space:normal;';

		try {
			const measurements = split.lines.map(line => {
				line.appendChild(probe);
				const chPx = probe.getBoundingClientRect().width || 1;
				line.removeChild(probe);
				const offsetWidth = line.offsetWidth || 0;
				const widthPx = line.getBoundingClientRect().width || 0;
				return { line, chPx, offsetWidth, widthPx };
			});

			measurements.forEach(({ line, chPx, offsetWidth, widthPx }) => {
				const dur = gsap.utils.clamp(0.3, 2, offsetWidth / tapeSpeed);
				line.style.setProperty('--tape-dur', `${dur}s`);
				const chUnits = chPx ? (widthPx / chPx) : 0;
				line.style.setProperty('--line-ch', `${chUnits.toFixed(2)}ch`);
			});
		} catch (err) {
			if (probe.parentNode) probe.parentNode.removeChild(probe);
			ddg.utils.warn('homelistSplit: measurement failed', err);
		}
	};

	const isNearViewport = () => {
		const rect = list.getBoundingClientRect();
		const buffer = 200;
		return rect.bottom >= -buffer && rect.top <= window.innerHeight + buffer;
	};

	const splitIfVisible = () => {
		if (isMobile()) return;
		if (!isNearViewport()) return;
		try { applySplit(); } catch (e) { ddg.utils.warn('homelistSplit: split failed', e); }
	};

	const onResize = ({ width }) => {
		if (width === lastWidth) return;
		lastWidth = width;

		revertSplit();

		if (resizeTimeout) clearTimeout(resizeTimeout);
		resizeTimeout = setTimeout(() => {
			resizeTimeout = null;
			splitIfVisible();
		}, 150);
	};
	
	const setupObserver = () => {
		if (observer) return;

		observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting && !split && !isMobile() && !resizeTimeout) {
					splitIfVisible();
				}
			}
		}, {
			rootMargin: '200px 0px',
			threshold: 0
		});

		observer.observe(list);
	};

	(async () => {
		await ddg.utils.fontsReady();
		setupObserver();
		splitIfVisible();
		ddg.resizeEvent.on(onResize);
	})();

	return () => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		if (resizeTimeout) {
			clearTimeout(resizeTimeout);
			resizeTimeout = null;
		}
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
	const parseCountdown = (v) => {
		const n = parseInt(String(v ?? '').trim(), 10);
		return Number.isFinite(n) ? n : 0;
	};

	const openShareUrl = (url) => {
		let winRef = null;
		try {
			winRef = window.open(url, '_blank');
		} catch { /* noop */ }
		if (!winRef) {
			try {
				location.href = url;
			} catch { /* noop */ }
			return;
		}
		try { winRef.opener = null; } catch { /* noop */ }
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
			const cur = parseCountdown(
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
		form.target = name; form.method = 'post'; form.action = webhookUrl; form.style.display = 'none';
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
		const destination = urlFor[platform] ? urlFor[platform]({ url: shareUrl, text: shareText }) : shareUrl;

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

		// countdown + optional confetti (does not block navigation)
		const shouldConfetti = tickCountdowns();
		if (shouldConfetti) {
			void confetti();
		}

		// fire webhook once/day
		if (realClick) postDailyWebhookIfNeeded(platform);

		ddg.utils.emit('ddg:share:start', { platform, destination });

		// Prefer Web Share API where available (mobile-ish browsers only)
		try {
			if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
				const ua = navigator.userAgent || '';
				const isLikelyMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);

				if (isLikelyMobile) {
					try {
						// Let the UA handle things like WhatsApp / native share targets
						await navigator.share({ url: shareUrl, text: shareText });
						ddg.utils.emit('ddg:share:end', { platform, destination: shareUrl });
						return;
					} catch (err) {
						// User cancelled or disallowed share: do not fall back to opening a new window.
						if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
							ddg.utils.warn('[share] navigator.share aborted/cancelled', err);
							ddg.utils.emit('ddg:share:end', { platform, destination: shareUrl, aborted: true });
							return;
						}
						// Other failures: just fall through to URL-based sharing.
						ddg.utils.warn('[share] navigator.share failed, falling back', err);
					}
				}
			}
		} catch (err) {
			ddg.utils.warn('[share] navigator.share runtime error (ignored)', err);
			// fall through to URL-based sharing
		}

		// Platform-specific navigation: WhatsApp behaves more reliably with same-tab nav on many mobile/webview combos
		let usedLocationHref = false;
		try {
			if (typeof navigator !== 'undefined') {
				const ua = navigator.userAgent || '';
				const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
				if (platform === 'whatsapp' && isMobile) {
					location.href = destination;
					usedLocationHref = true;
				}
			}
		} catch {
			// ignore UA / navigation issues and let the generic opener handle it
		}

		if (!usedLocationHref) {
			openShareUrl(destination);
		}

		ddg.utils.emit('ddg:share:end', { platform, destination });
	};

	document.addEventListener('click', onShareClick, true);
}

function modals() {
	const modalRoot = document.querySelector('[data-modal-el]');
	if (!modalRoot) return;
	if (ddg.modalsInitialized) return;

	ddg.modalsInitialized = true;
	ddg.modals = ddg.modals || {};

	const selectors = {
		trigger: '[data-modal-trigger]',
		modal: '[data-modal-el]',
		bg: '[data-modal-bg]',
		inner: '[data-modal-inner]',
		close: '[data-modal-close]',
	};

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
		let keydownListenerActive = false;
		let openedAnnounced = false; // ensures ddg:modal-opened fires once per open cycle

		const announceOpen = () => {
			if (openedAnnounced) return;
			openedAnnounced = true;
			ddg.utils.emit('ddg:modal-opened', { id });
		};

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
		const modalEl = $modal[0];
		if (modalEl) {
			modalEl.addEventListener('click', (e) => {
				const target = e.target.closest('a[href^="#"], button[href^="#"]');
				if (!target) return;
				const href = target.getAttribute('href') || '';
				const hash = href.replace(/^#/, '').trim();
				if (!hash) return;
				e.preventDefault();
				e.stopPropagation();
				scrollToAnchor(hash);
				const u = new URL(window.location.href);
				u.hash = hash;
				window.history.replaceState(window.history.state, '', u.toString());
			});
		}

		const open = ({ skipAnimation = false, afterOpen } = {}) => {
			// Combine: on-load, skipAnimation, and existing is-open are treated as "already open" (instant)
			const alreadyOpen = $modal.hasClass('is-open');

			if (!ddg.scrollLock.isHolding(id)) ddg.scrollLock.lock(id);
			Object.keys(ddg.modals).forEach(k => {
				if (k !== id && ddg.modals[k]?.isOpen?.()) ddg.modals[k].close({ skipAnimation: true });
			});

			if (!alreadyOpen) lastActiveEl = document.activeElement;
			gsap.killTweensOf([$anim[0], $bg[0]]);
			syncCssState($modal, true, id);
			resetScrollTop();

			if (skipAnimation || alreadyOpen) {
				gsap.set([$bg[0], $anim[0]], { autoAlpha: 1, y: 0 });
				requestAnimationFrame(clearInlineTransforms);
				requestAnimationFrame(resetScrollTop);
				if (!keydownListenerActive) {
					document.addEventListener('keydown', onKeydownTrap, true);
					keydownListenerActive = true;
				}
				requestAnimationFrame(focusModal);
				announceOpen();
				return afterOpen && afterOpen();
			}

			setAnimating(true);
			gsap.set($bg[0], { autoAlpha: 0 });

			gsap.timeline({
				onComplete: () => {
					setAnimating(false);
					requestAnimationFrame(clearInlineTransforms);
					requestAnimationFrame(resetScrollTop);
					if (!keydownListenerActive) {
						document.addEventListener('keydown', onKeydownTrap, true);
						keydownListenerActive = true;
					}
					requestAnimationFrame(focusModal);
					announceOpen();
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
			// Only unlock if this modal applied the lock
			if (ddg.scrollLock.isHolding(id)) ddg.scrollLock.unlock(id);
			gsap.killTweensOf([$anim[0], $bg[0]]);

			const finish = () => {
				[$modal[0], $inner[0]].forEach(el => el?.classList.remove('is-open'));
				gsap.set([$anim[0], $bg[0], $modal[0], $inner[0]], { clearProps: 'all' });
				document.removeEventListener('keydown', onKeydownTrap, true);
				keydownListenerActive = false;
				if (lastActiveEl) lastActiveEl.focus();
				lastActiveEl = null;
				syncCssState($modal, false, id);
				ddg.utils.emit('ddg:modal-closed', { id });
				openedAnnounced = false;
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
		const modal = { open, close, isOpen, $modal, $bg, $inner, announceOpen };
		ddg.modals[id] = modal;

		// Do not re-sync initial state on creation; assume markup is authoritative.
		ddg.utils.emit('ddg:modal-created', id);
		return modal;
	};

	ddg.createModal = createModal;

	// Unified click handler: open, close buttons, backgrounds, and outer clicks
	document.addEventListener('click', (e) => {
		const target = e.target;

		// 1) Open triggers
		const trigger = target.closest(selectors.trigger);
		if (trigger && !trigger.hasAttribute('data-ajax-modal')) {
			e.preventDefault();
			const id = trigger.getAttribute('data-modal-trigger');
			const modal = createModal(id);
			modal?.open();
			return;
		}

		// 2) Close buttons
		const closeBtn = target.closest(selectors.close);
		if (closeBtn) {
			e.preventDefault();
			const id = closeBtn.getAttribute('data-modal-close');
			if (id) (ddg.modals[id] || createModal(id))?.close();
			else Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
			return;
		}

		// 3) Story modal: clicking the inner container itself closes it
		const storyInner = target.closest('[data-modal-inner="story"]');
		if (storyInner && target === storyInner) {
			const root = storyInner.closest('[data-modal-el]');
			const id = root?.getAttribute('data-modal-el') || 'story';
			(ddg.modals[id] || createModal(id))?.close();
			return;
		}

		// 4) Background clicks
		const bg = target.closest(selectors.bg);
		if (bg && target === bg) {
			const id = bg.getAttribute('data-modal-bg');
			(ddg.modals[id] || createModal(id))?.close();
			return;
		}

		// 5) Click in modal outer but not inside inner content closes modal
		const modalEl = target.closest(selectors.modal);
		if (!modalEl) return; // click outside any modal
		if (target.closest(selectors.inner)) return; // click inside modal content

		const id = modalEl.getAttribute('data-modal-el');
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
		document.addEventListener('keydown', (e) => {
			if (e.key !== 'Escape') return;
			// Close all open modals, creating controllers on-demand
			const openEls = document.querySelectorAll('[data-modal-el].is-open');
			openEls.forEach((el) => {
				const id = el.getAttribute('data-modal-el');
				if (!id) return;
				(ddg.modals[id] || createModal(id))?.close();
			});
		});
	}

	// Emit modal-opened for any modals already open on load (no styling/locking).
	requestAnimationFrame(() => {
		document.querySelectorAll('[data-modal-el].is-open').forEach((el) => {
			const id = el.getAttribute('data-modal-el');
			if (!id) return;
			const m = ddg.modals[id] || createModal(id);
			m?.announceOpen?.();
			if (id === 'story') {
				try { ddg.utils.emit('ddg:story-opened', { url: window.location.href }); } catch { }
			}
		});
	});

	document.addEventListener('ddg:modal-opened', () => {
		if (window.Marquee && typeof window.Marquee.rescan === 'function') {
			window.Marquee.rescan(document);
		}
	});
	document.addEventListener('ddg:modal-closed', () => {
		if (window.Marquee && typeof window.Marquee.rescan === 'function') {
			window.Marquee.rescan(document);
		}
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
	const skeletonHtml = "<div class='modal-skeleton' aria-busy='true'></div>";
	const errorHtml = "<div class='modal-error'>Failed to load content.</div>";

	let storyModal = ddg.modals?.[storyModalId] || null;
	const storyCacheMax = 20;
	const storyCache = new Map(); // Map<url, { title, contentHTML }>

	const cacheGet = (url) => storyCache.get(url) || null;

	const cacheSet = (url, payload) => {
		storyCache.set(url, payload);
		if (storyCache.size > storyCacheMax) {
			const firstKey = storyCache.keys().next().value;
			if (firstKey != null) storyCache.delete(firstKey);
		}
	};

	let lock = false;

	let prefetchEnabled = false;
	setTimeout(() => { prefetchEnabled = true; }, 2000);

	const storyFromDoc = (doc) => {
		const node = doc?.querySelector?.('[data-ajax-modal="content"]');
		return { title: (doc?.title || ''), contentHTML: node ? node.outerHTML : errorHtml };
	};

	const renderEmbed = (html) => {
		const markup = typeof html === 'string' && html.trim() ? html : errorHtml;
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
				// Notify parent of new url if in iframe
				if (window !== window.parent) {
					try { ddg.iframeBridge.post('sync-url', { url, title: document.title }); } catch { }
				}

				const emitStoryOpened = () => {
					const fn = () => ddg.utils.emit('ddg:story-opened', { url });
					if (typeof queueMicrotask === 'function') queueMicrotask(fn);
					else setTimeout(fn, 0);
				};

				ddg.fs.readyList()
					.then(emitStoryOpened)
					.catch(emitStoryOpened)
					.finally(() => {
						ddg.fs.resolveCurrentItem(url);
					});

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
			if (options.showSkeleton !== false) renderEmbed(skeletonHtml);
			const doc = await ddg.net.fetchHTML(url);
			const parsed = storyFromDoc(doc);
			cacheSet(url, parsed);
			openStory(url, parsed.title, parsed.contentHTML, options);
		} catch {
			renderEmbed(errorHtml);
		} finally {
			lock = false;
		}
	};

	document.addEventListener('ddg:modal-closed', (ev) => {
		if (ev.detail?.id !== storyModalId) return;
		document.title = originalTitle;
		history.pushState({}, '', homeUrl);
		ddg.fs.resolveCurrentItem(homeUrl);
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
	let lastPrefetchUrl = null;
	let prefetchHoverTimeout = null;

	const cancelPrefetch = () => {
		if (prefetchHoverTimeout) {
			clearTimeout(prefetchHoverTimeout);
			prefetchHoverTimeout = null;
		}
		if (prefetchCancel) {
			prefetchCancel();
			prefetchCancel = null;
		}
		lastPrefetchUrl = null;
	};

	const maybePrefetchStory = (url) => {
		if (!prefetchEnabled || !url || cacheGet(url) || lastPrefetchUrl === url) return;
		cancelPrefetch();
		lastPrefetchUrl = url;
		try { prefetchCancel = ddg.net.prefetch(url, 500); }
		catch { prefetchCancel = null; }
	};

	const onMouseOver = (event) => {
		const root = event.target.closest('[data-ajax-modal="link"]');
		if (!root) return;
		const url = resolveLinkHref(root, event.target);
		if (!url) return;

		cancelPrefetch();
		prefetchHoverTimeout = setTimeout(() => {
			maybePrefetchStory(url);
		}, 300);
	};

	const onMouseOut = (event) => {
		const root = event.target.closest('[data-ajax-modal="link"]');
		if (!root) return;
		const related = event.relatedTarget;
		if (related && root.contains(related)) return;
		cancelPrefetch();
	};

	document.addEventListener('click', onStoryLinkClick);
	document.addEventListener('mouseover', onMouseOver);
	document.addEventListener('mouseout', onMouseOut);

	window.addEventListener('popstate', () => {
		const path = window.location.pathname;
		const modal = ensureModal();
		if (!modal) return;
		if (!path.startsWith('/stories/')) {
			if (modal.isOpen()) modal.close();
			ddg.fs.resolveCurrentItem(window.location.href);
			return;
		}
		loadAndOpenStory(window.location.href, { stateMode: 'none', showSkeleton: true, force: true });
	});
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
		const { wavesurfer, el } = activePlayer;
		try { wavesurfer?.destroy?.(); }
		catch (err) { ddg.utils.warn('[audio] destroy failed', err); }
		el.removeAttribute('data-audio-init');
		activePlayer = null;
		ddg.utils.log('[audio] destroyed active player');
	};

	const buildAudio = (modalEl) => {
		const playerEl = modalEl.querySelector('.story-player');
		if (!playerEl) return;

		const audioUrl = playerEl.dataset.audioUrl;
		if (!audioUrl) return;

		// If same audio is already loaded, don't rebuild
		if (playerEl.hasAttribute('data-audio-init') && activePlayer?.audioUrl === audioUrl) return;

		cleanupActive();

		const waveformEl = playerEl.querySelector('.story-player_waveform');
		const playBtn = playerEl.querySelector('[data-player="play"]');
		const muteBtn = playerEl.querySelector('[data-player="mute"]');
		if (!waveformEl || !playBtn || !muteBtn) return;

		const playIcon = playBtn.querySelector('.circle-btn_icon.is-play');
		const pauseIcon = playBtn.querySelector('.circle-btn_icon.is-pause');
		const muteIcon = muteBtn.querySelector('.circle-btn_icon.is-mute');
		const unmuteIcon = muteBtn.querySelector('.circle-btn_icon.is-unmute');

		let isMuted = false;

		ddg.utils.log('[audio] creating new player', audioUrl);

		if (typeof WaveSurfer === 'undefined') {
			ddg.utils.warn('[audio] WaveSurfer not available');
			return;
		}

		let wavesurfer;
		try {
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
			ddg.utils.warn('[audio] WaveSurfer init failed', err);
			return;
		}

		// mark as initialized only after successful create/reuse
		playerEl.dataset.audioInit = 'true';

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
			if (activePlayer && activePlayer.wavesurfer !== wavesurfer) {
				try { activePlayer.wavesurfer.pause(); } catch (e) { }
			}
			activePlayer = { el: playerEl, wavesurfer, audioUrl };
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

function joinButtons() {
	const stickyButton = document.querySelector('.join_sticky');
	const staticButton = document.querySelector('.join-cta_btn .button');

	if (!stickyButton || !staticButton) return;

	// keep static in layout for ScrollTrigger, but hide it visually
	stickyButton.style.display = 'flex';
	staticButton.style.display = 'flex';
	staticButton.style.visibility = 'hidden';
	staticButton.setAttribute('aria-hidden', 'true');

	const remInPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
	const scrollOffset = `bottom bottom-=${remInPx}px`;

	const showStaticHideSticky = () => {
		stickyButton.style.display = 'none';
		staticButton.style.visibility = 'visible';
		staticButton.removeAttribute('aria-hidden');
	};

	const showStickyHideStatic = () => {
		stickyButton.style.display = 'flex';
		staticButton.style.visibility = 'hidden';
		staticButton.setAttribute('aria-hidden', 'true');
	};

	const trigger = ScrollTrigger.create({
		trigger: staticButton,
		start: scrollOffset,
		end: scrollOffset,
		onEnter: showStaticHideSticky,
		onLeaveBack: showStickyHideStatic,
		invalidateOnRefresh: true
	});
	return () => trigger.kill();
}

ddg.boot = function boot() {
	if (data.siteBooted) return;
	data.siteBooted = true;

	requestAnimationFrame(() => {
		iframe();
		nav();
		modals();
		ddg.fs.finsweetRelated();
		ajaxStories();
		homelistSplit();
		share();
		storiesAudioPlayer();
		joinButtons();
	});
};