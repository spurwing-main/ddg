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

	// Performance monitoring utilities
	perf: {
		marks: new Map(),

		start(label) {
			const key = `ddg:${label}`;
			this.marks.set(label, performance.now());
			console.log(`[ddg:perf] 🚀 START: ${label}`);
			if (typeof performance.mark === 'function') {
				performance.mark(`${key}:start`);
			}
		},

		end(label) {
			const startTime = this.marks.get(label);
			if (!startTime) {
				console.warn(`[ddg:perf] ⚠️ No start mark for: ${label}`);
				return;
			}
			const duration = performance.now() - startTime;
			const color = duration > 100 ? '🔴' : duration > 50 ? '🟡' : '🟢';
			console.log(`[ddg:perf] ${color} END: ${label} - ${duration.toFixed(2)}ms`);
			this.marks.delete(label);

			const key = `ddg:${label}`;
			if (typeof performance.mark === 'function' && typeof performance.measure === 'function') {
				performance.mark(`${key}:end`);
				try {
					performance.measure(key, `${key}:start`, `${key}:end`);
				} catch (e) { /* ignore */ }
			}
		},

		count(label) {
			const key = `ddg:count:${label}`;
			const current = this.marks.get(key) || 0;
			this.marks.set(key, current + 1);
			if (current > 0 && current % 10 === 0) {
				console.log(`[ddg:perf] 📊 COUNT: ${label} = ${current + 1}`);
			}
		},

		memory() {
			if (performance.memory) {
				const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
				const total = (performance.memory.totalJSHeapSize / 1048576).toFixed(2);
				console.log(`[ddg:perf] 💾 Memory: ${used}MB / ${total}MB`);
			}
		}
	},

	async fontsReady(timeoutMs = 3000) {
		ddg.utils.perf.start('fonts-ready');
		if (!document.fonts || !document.fonts.ready) {
			ddg.utils.perf.end('fonts-ready');
			return new Promise(resolve => requestAnimationFrame(resolve));
		}

		await Promise.race([
			document.fonts.ready,
			new Promise(resolve => setTimeout(resolve, timeoutMs))
		]);

		ddg.utils.perf.end('fonts-ready');
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
		ddg.utils.perf.start(`fetchHTML:${url}`);
		ddg.utils.perf.count('fetchHTML');
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) throw new Error(`fetchHTML: HTTP ${res.status}`);
		const text = await res.text();
		const doc = new DOMParser().parseFromString(text, 'text/html');
		ddg.utils.perf.end(`fetchHTML:${url}`);
		return doc;
	},

	async fetchJSON(url) {
		ddg.utils.perf.start(`fetchJSON:${url}`);
		ddg.utils.perf.count('fetchJSON');
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) throw new Error(`fetchJSON: HTTP ${res.status}`);
		const data = await res.json();
		ddg.utils.perf.end(`fetchJSON:${url}`);
		return data;
	},

	prefetch(url, delay = 250) {
		console.log(`[ddg:perf] 🌐 PREFETCH scheduled: ${url} (delay: ${delay}ms)`);
		ddg.utils.perf.count('prefetch');
		const controller = new AbortController();
		const timeout = setTimeout(() => {
			console.log(`[ddg:perf] 🌐 PREFETCH executing: ${url}`);
			const start = performance.now();
			fetch(url, {
				signal: controller.signal,
				credentials: 'same-origin'
			}).then(() => {
				const duration = performance.now() - start;
				console.log(`[ddg:perf] ✅ PREFETCH complete: ${url} (${duration.toFixed(2)}ms)`);
			}).catch((err) => {
				if (!err || err.name === 'AbortError') {
					console.log(`[ddg:perf] ❌ PREFETCH cancelled: ${url}`);
					return;
				}
				ddg.utils.warn('ddg.net.prefetch failed:', err);
			});
		}, delay);

		return () => {
			console.log(`[ddg:perf] 🚫 PREFETCH abort: ${url}`);
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
		console.log('[ddg:perf] 🔒 ScrollLock: applying lock');
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
		console.log('[ddg:perf] 🔓 ScrollLock: removing lock');
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
		console.log(`[ddg:perf] 🔒 ScrollLock: lock requested (key: ${key}, total: ${held.size})`);
		if (held.size === 1) applyLock();
	}

	function unlock(key) {
		if (key) held.delete(String(key));
		console.log(`[ddg:perf] 🔓 ScrollLock: unlock requested (key: ${key}, remaining: ${held.size})`);
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
		const newSize = readSize();
		const widthChange = Math.abs(newSize.width - lastSize.width);
		const heightChange = Math.abs(newSize.height - lastSize.height);

		console.log(`[ddg:perf] 📐 ResizeEvent: ${lastSize.width}x${lastSize.height} → ${newSize.width}x${newSize.height} (Δ ${widthChange}x${heightChange})`);
		ddg.utils.perf.count('resize-event-notify');

		lastSize = newSize;
		const detail = { ...lastSize };
		listeners.forEach(fn => fn(detail));
	};

	const onWinResize = ddg.utils.throttle(notify, 150);
	window.addEventListener('resize', onWinResize, { passive: true });

	const on = (fn, { immediate = false } = {}) => {
		if (typeof fn !== 'function') return () => { };
		listeners.add(fn);
		console.log(`[ddg:perf] 📐 ResizeEvent: listener added (total: ${listeners.size})`);
		if (immediate) fn({ ...lastSize });
		return () => {
			listeners.delete(fn);
			console.log(`[ddg:perf] 📐 ResizeEvent: listener removed (remaining: ${listeners.size})`);
		};
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
		ddg.utils.perf.start('fs-setFilters');
		console.log('[ddg:perf] 🔍 Finsweet: setFilters called', fieldValues);
		const list = await readyList();
		if (!list) {
			warn('setFilters: no list');
			ddg.utils.perf.end('fs-setFilters');
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

		console.log(`[ddg:perf] 🔍 Finsweet: applying ${conditions.length} filter conditions`);
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
		ddg.utils.perf.end('fs-setFilters');
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
			console.log(`[ddg:perf] 🎲 RandomFilters: bag rebuilt with ${state.bag.length} items`);
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

				console.log('[ddg:perf] 🎲 RandomFilters: button clicked');
				ddg.utils.perf.start('randomFilters-apply');

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
				console.log(`[ddg:perf] 🎲 RandomFilters: applying filters from item ${idx}`, limited);
				await setFilters(limited);
				ddg.utils.perf.end('randomFilters-apply');
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
	ddg.utils.perf.start('nav-init');
	const navEl = document.querySelector('.nav');
	if (!navEl || ddg.navInitialized) return;

	ddg.navInitialized = true;

	const showThreshold = 50;   // px from top where nav always visible
	const hideThreshold = 100;  // px before nav is allowed to hide
	const revealBuffer = 50;    // px scroll up needed to reveal nav

	let lastY = window.scrollY || 0;
	let revealDistance = 0;

	const updateNav = () => {
		ddg.utils.perf.count('nav-scroll-update');
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

	const onScroll = ddg.utils.throttle(updateNav, 100);
	window.addEventListener('scroll', onScroll, { passive: true });

	updateNav();
	ddg.utils.perf.end('nav-init');
}

function homelistSplit() {
	ddg.utils.perf.start('homelistSplit-init');

	const list = document.querySelector('.home-list_list');
	if (!list) {
		ddg.utils.warn('homelistSplit: .home-list_list not found');
		ddg.utils.perf.end('homelistSplit-init');
		return;
	}

	const mobileBp = 767;
	const tapeSpeed = 5000;

	let items = [];
	let split = null;
	let observer = null;
	let mobileObserver = null;
	let lastWidth = window.innerWidth;
	let resizePending = false;
	let isApplying = false;

	const refreshItems = () => {
		items = Array.from(list.querySelectorAll('.home-list_item'));
		if (!items.length) {
			ddg.utils.warn('homelistSplit: no .home-list_item elements found (current state)');
		} else {
			ddg.utils.log(`homelistSplit: ${items.length} .home-list_item elements`);
		}
	};

	// Initial snapshot; don't bail if empty – filters may populate later
	refreshItems();

	const isMobile = () => window.innerWidth <= mobileBp;

	const enableMobileCenter = () => {
		if (mobileObserver || !items.length) return;

		mobileObserver = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-hover');
				} else {
					entry.target.classList.remove('is-hover');
				}
			});
		}, { rootMargin: '-50% 0px -50% 0px' });

		items.forEach(item => mobileObserver.observe(item));
	};

	const disableMobileCenter = () => {
		if (!mobileObserver) return;
		mobileObserver.disconnect();
		mobileObserver = null;
		items.forEach(item => item.classList.remove('is-hover'));
	};

	const revertSplit = () => {
		if (!split) return;
		ddg.utils.perf.start('homelistSplit-revert');
		try {
			split.revert();
		} catch (e) {
			ddg.utils.warn('homelistSplit: revert failed', e);
		}
		split = null;
		ddg.utils.perf.end('homelistSplit-revert');
	};

	const applySplit = () => {
		// Guard against re-entrancy & double application
		if (split || isApplying || !items.length) return;

		isApplying = true;
		ddg.utils.perf.start('homelistSplit-apply');
		ddg.utils.perf.count('homelistSplit-apply');

		try {
			console.log(`[ddg:perf] SplitText processing ${items.length} items`);

			split = new SplitText(items, {
				type: 'lines',
				linesClass: 'home-list_split-line'
			});

			const lines = split.lines || [];
			if (!lines.length) {
				console.log('[ddg:perf] SplitText produced no lines');
				return;
			}

			// Shared probe for 1ch measurement
			const probe = document.createElement('span');
			probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;margin:0;padding:0;border:0;width:1ch;height:0;font:inherit;white-space:normal;';

			const firstLine = lines[0];
			firstLine.appendChild(probe);
			const chPx = probe.getBoundingClientRect().width || 1;
			firstLine.removeChild(probe);

			// Phase 2: batch measurements (reads only)
			const measurements = lines.map(line => {
				const rect = line.getBoundingClientRect();
				return {
					line,
					offsetWidth: line.offsetWidth || rect.width || 0,
					widthPx: rect.width || 0,
					chPx
				};
			});

			// Phase 3: write CSS vars (writes only)
			measurements.forEach(({ line, offsetWidth, widthPx, chPx }) => {
				const dur = gsap.utils.clamp(0.3, 2, (offsetWidth || 0) / tapeSpeed || 0.3);
				line.style.setProperty('--tape-dur', `${dur}s`);

				const chUnits = chPx ? (widthPx / chPx) : 0;
				line.style.setProperty('--line-ch', `${chUnits.toFixed(2)}ch`);
			});

			// Group lines by their parent .home-list_item
			const itemLinesMap = new Map();
			lines.forEach(line => {
				const item = line.closest('.home-list_item');
				if (!item) return;
				if (!itemLinesMap.has(item)) itemLinesMap.set(item, []);
				itemLinesMap.get(item).push(line);
			});

			// Ensure a non-breaking space between lines of the same item
			itemLinesMap.forEach((linesForItem) => {
				linesForItem.forEach((line, index) => {
					const isLastLineOfItem = index === linesForItem.length - 1;
					if (isLastLineOfItem) return;

					const text = line.textContent || '';
					if (!/\s$/.test(text)) {
						line.appendChild(document.createTextNode('\u00A0'));
					}
				});
			});

			console.log(`[ddg:perf] SplitText created ${lines.length} lines`);
		} catch (err) {
			ddg.utils.warn('homelistSplit: measurement failed', err);
		} finally {
			ddg.utils.perf.end('homelistSplit-apply');
			isApplying = false;
		}
	};

	const isNearViewport = () => {
		const rect = list.getBoundingClientRect();
		const buffer = 200;
		return rect.bottom >= -buffer && rect.top <= window.innerHeight + buffer;
	};

	const splitIfVisible = () => {
		if (isMobile()) {
			enableMobileCenter();
			return;
		}

		disableMobileCenter();

		if (!isNearViewport()) return;

		try {
			applySplit();
		} catch (e) {
			ddg.utils.warn('homelistSplit: split failed', e);
		}
	};

	const handleResizeInternal = ({ width }) => {
		resizePending = false;
		ddg.utils.perf.count('homelistSplit-resize');

		// Ignore small width changes (e.g., scrollbar appearing/disappearing)
		if (Math.abs(width - lastWidth) < 50) {
			console.log(`[ddg:perf] homelistSplit resize ignored: ${width}px (< 50px change)`);
			return;
		}

		lastWidth = width;
		console.log(`[ddg:perf] homelistSplit resize: ${width}px`);

		revertSplit();
		// items don't change on resize, so no refreshItems() here
		splitIfVisible();
	};

	const debouncedResize = ddg.utils.debounce(handleResizeInternal, 500);

	const onResize = (payload) => {
		resizePending = true;
		debouncedResize(payload);
	};

	const setupObserver = () => {
		if (observer) return;

		observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting && !split && !isMobile() && !resizePending) {
					console.log('[ddg:perf] homelistSplit intersection visible');
					splitIfVisible();
					break;
				}
			}
		}, {
			rootMargin: '200px 0px',
			threshold: 0
		});

		observer.observe(list);
	};

	// Handle Finsweet filters changing the DOM
	const onFiltersChange = (event) => {
		const detail = event.detail || {};
		const changedList = detail.list;

		// Ignore events for other lists
		if (changedList && changedList !== list) return;

		ddg.utils.perf.start('homelistSplit-filters-change');
		console.log('[ddg:perf] homelistSplit filters-change');

		// Tear down old split content
		revertSplit();

		// Refresh items from current DOM
		refreshItems();

		// Rebuild mobile observer bindings if needed
		if (mobileObserver) {
			mobileObserver.disconnect();
			mobileObserver = null;
		}

		if (isMobile()) {
			enableMobileCenter();
		} else {
			splitIfVisible();
		}

		ddg.utils.perf.end('homelistSplit-filters-change');
	};

	window.addEventListener('ddg:filters-change', onFiltersChange);

	(async () => {
		await ddg.utils.fontsReady();
		setupObserver();
		splitIfVisible();
		ddg.resizeEvent.on(onResize);
		ddg.utils.perf.end('homelistSplit-init');
	})();

	return () => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
		if (mobileObserver) {
			mobileObserver.disconnect();
			mobileObserver = null;
		}

		if (ddg.resizeEvent && typeof ddg.resizeEvent.off === 'function') {
			ddg.resizeEvent.off(onResize);
		}

		window.removeEventListener('ddg:filters-change', onFiltersChange);

		resizePending = false;
		revertSplit();
		disableMobileCenter();
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
		linkedin: ({ url, text }) => `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text + ' ' + url)}`,
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

	// ---------- persistence ----------
	const storageKey = 'ddg:share_state';
	const oneHour = 60 * 60 * 1000;
	const defaultCount = 25;

	const getStoredState = () => {
		try {
			const raw = localStorage.getItem(storageKey);
			if (!raw) {
				console.log('[ddg:share] No stored state, using default:', defaultCount);
				return { remaining: defaultCount, ts: Date.now() };
			}
			const { remaining, ts } = JSON.parse(raw);
			// Expire after 1 hour
			if (Date.now() - ts > oneHour) {
				console.log('[ddg:share] Stored state expired, resetting to default');
				localStorage.removeItem(storageKey);
				return { remaining: defaultCount, ts: Date.now() };
			}
			console.log('[ddg:share] Loaded stored state:', { remaining, age: Date.now() - ts });
			return { remaining, ts };
		} catch (e) {
			console.warn('[ddg:share] Error reading state:', e);
			return { remaining: defaultCount, ts: Date.now() };
		}
	};

	const saveState = (remaining) => {
		console.log('[ddg:share] Saving state:', remaining);
		localStorage.setItem(storageKey, JSON.stringify({ remaining, ts: Date.now() }));
	};

	// ---------- countdown (returns true when any hits zero) ----------
	const updateNode = (node, remaining) => {
		node.setAttribute('data-share-countdown', String(remaining));
		if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.value = String(remaining);
		else node.textContent = String(remaining);
		return remaining === 0;
	};

	const syncCountdowns = () => {
		const { remaining } = getStoredState();
		console.log('[ddg:share] Syncing countdowns to:', remaining);
		let anyHitZero = false;
		document.querySelectorAll('[data-share-countdown]').forEach(node => {
			if (updateNode(node, remaining)) anyHitZero = true;
		});
		return anyHitZero;
	};

	const tickCountdowns = () => {
		const { remaining } = getStoredState();
		const next = Math.max(0, remaining - 1);
		console.log('[ddg:share] Ticking countdown:', remaining, '->', next);
		saveState(next);

		let hitZero = false;
		document.querySelectorAll('[data-share-countdown]').forEach(node => {
			if (updateNode(node, next)) hitZero = true;
		});
		return hitZero;
	};

	// Initialize on load
	const { remaining: initRemaining } = getStoredState();
	const anyModalOpen = document.querySelector('[data-modal-el].is-open');
	if (initRemaining === 0 && !anyModalOpen) {
		console.log('[ddg:share] Init: 0 remaining and no modal open. Resetting to default.');
		saveState(defaultCount);
	}
	syncCountdowns();

	// Initialize when modals open (in case they contain countdowns)
	document.addEventListener('ddg:modal-opened', () => {
		requestAnimationFrame(syncCountdowns);
	});

	// Reset on modal close if reached 0
	document.addEventListener('ddg:modal-closed', () => {
		const { remaining } = getStoredState();
		if (remaining === 0) {
			console.log('[ddg:share] Modal closed with 0 remaining. Resetting to default.');
			saveState(defaultCount);
			syncCountdowns();
		}
	});

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
	ddg.utils.perf.start('modals-init');
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
			ddg.utils.perf.start(`modal-open:${id}`);
			ddg.utils.perf.count('modal-open');
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
				ddg.utils.perf.end(`modal-open:${id}`);
				return afterOpen && afterOpen();
			}

			setAnimating(true);
			gsap.set($bg[0], { autoAlpha: 0 });

			console.log(`[ddg:perf] 🎬 Modal: starting open animation (id: ${id})`);
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
					console.log(`[ddg:perf] 🎬 Modal: open animation complete (id: ${id})`);
					ddg.utils.perf.end(`modal-open:${id}`);
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

			console.log(`[ddg:perf] 🚪 Modal: starting close (id: ${id}, skipAnimation: ${skipAnimation})`);
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
				console.log(`[ddg:perf] 🚪 Modal: close complete (id: ${id})`);
				afterClose && afterClose();
			};

			if (skipAnimation) {
				$bg[0]?.classList.remove('is-open');
				gsap.set([$bg[0], $anim[0]], { autoAlpha: 0, y: '25%' });
				return finish();
			}

			console.log(`[ddg:perf] 🎬 Modal: starting close animation (id: ${id})`);
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
	ddg.utils.perf.start('ajaxStories-init');
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
		ddg.utils.perf.start('renderEmbed');
		const markup = typeof html === 'string' && html.trim() ? html : errorHtml;
		const htmlLength = markup.length;
		$embed.empty();
		$embed[0].innerHTML = markup;
		console.log(`[ddg:perf] 📄 RenderEmbed: ${htmlLength} chars, ${$embed[0].children.length} children`);
		ddg.utils.perf.end('renderEmbed');
	};

	const ensureModal = () => {
		if (storyModal && storyModal.$modal?.length) return storyModal;
		if (ddg.createModal) storyModal = ddg.createModal(storyModalId) || storyModal;
		return storyModal;
	};

	const openStory = (url, title, contentHTML, options = {}) => {
		console.log(`[ddg:perf] 📖 OpenStory: ${url} (cached: ${!!options.cached})`);
		ddg.utils.perf.start('openStory');
		const modal = ensureModal();
		if (!modal) {
			ddg.utils.perf.end('openStory');
			return;
		}

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
						ddg.utils.perf.end('openStory');
					});

			}
		});
	};

	const loadAndOpenStory = async (url, options = {}) => {
		if (!url) return;
		if (lock && !options.force) return;
		lock = true;
		ddg.utils.perf.start(`loadStory:${url}`);
		ddg.utils.perf.count('loadStory');
		try {
			const cached = cacheGet(url);
			if (cached) {
				console.log(`[ddg:perf] ✅ Story cache HIT: ${url}`);
				openStory(url, cached.title, cached.contentHTML, { ...options, cached: true });
				return;
			}
			console.log(`[ddg:perf] ❌ Story cache MISS: ${url} (cache size: ${storyCache.size}/${storyCacheMax})`);
			if (options.showSkeleton !== false) renderEmbed(skeletonHtml);
			const doc = await ddg.net.fetchHTML(url);
			const parsed = storyFromDoc(doc);
			cacheSet(url, parsed);
			console.log(`[ddg:perf] 💾 Story cached: ${url} (new cache size: ${storyCache.size}/${storyCacheMax})`);
			openStory(url, parsed.title, parsed.contentHTML, options);
		} catch {
			renderEmbed(errorHtml);
		} finally {
			ddg.utils.perf.end(`loadStory:${url}`);
			lock = false;
		}
	};

	document.addEventListener('ddg:modal-closed', (ev) => {
		if (ev.detail?.id !== storyModalId) return;
		console.log('[ddg:perf] 📕 Story modal closed, navigating to home');
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

	// Throttle hover handler to reduce excessive event processing
	const onMouseOver = ddg.utils.throttle((event) => {
		ddg.utils.perf.count('story-hover');
		const root = event.target.closest('[data-ajax-modal="link"]');
		if (!root) return;
		const url = resolveLinkHref(root, event.target);
		if (!url) return;

		cancelPrefetch();
		// Increased delay - only prefetch on intentional hovers
		prefetchHoverTimeout = setTimeout(() => {
			maybePrefetchStory(url);
		}, 800);
	}, 150);

	const onMouseOut = ddg.utils.throttle((event) => {
		const root = event.target.closest('[data-ajax-modal="link"]');
		if (!root) return;
		const related = event.relatedTarget;
		if (related && root.contains(related)) return;
		cancelPrefetch();
	}, 150);

	// Also prefetch on mousedown for immediate clicks (before hover timeout fires)
	const onMouseDown = (event) => {
		const root = event.target.closest('[data-ajax-modal="link"]');
		if (!root) return;
		const url = resolveLinkHref(root, event.target);
		if (url && !cacheGet(url)) {
			// Cancel any pending hover prefetch and prefetch immediately
			cancelPrefetch();
			maybePrefetchStory(url);
		}
	};

	document.addEventListener('click', onStoryLinkClick);
	document.addEventListener('mouseover', onMouseOver);
	document.addEventListener('mouseout', onMouseOut);
	document.addEventListener('mousedown', onMouseDown, { passive: true });

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

	ddg.utils.perf.end('ajaxStories-init');
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
		console.log('[ddg:perf] 🎵 Audio: cleanup active player');
		const { wavesurfer, el } = activePlayer;
		try { wavesurfer?.destroy?.(); }
		catch (err) { ddg.utils.warn('[audio] destroy failed', err); }
		el.removeAttribute('data-audio-init');
		activePlayer = null;
		ddg.utils.log('[audio] destroyed active player');
	};

	const buildAudio = (modalEl) => {
		ddg.utils.perf.start('audio-build');
		const playerEl = modalEl.querySelector('.story-player');
		if (!playerEl) {
			ddg.utils.perf.end('audio-build');
			return;
		}

		const audioUrl = playerEl.dataset.audioUrl;
		if (!audioUrl) {
			ddg.utils.perf.end('audio-build');
			return;
		}

		// If same audio is already loaded, don't rebuild
		if (playerEl.hasAttribute('data-audio-init') && activePlayer?.audioUrl === audioUrl) {
			console.log('[ddg:perf] 🎵 Audio: already initialized, skipping');
			ddg.utils.perf.end('audio-build');
			return;
		}

		cleanupActive();
		console.log('[ddg:perf] 🎵 Audio: building new player', audioUrl);

		const waveformEl = playerEl.querySelector('.story-player_waveform');
		const playBtn = playerEl.querySelector('[data-player="play"]');
		const muteBtn = playerEl.querySelector('[data-player="mute"]');
		if (!waveformEl || !playBtn || !muteBtn) {
			ddg.utils.perf.end('audio-build');
			return;
		}

		const playIcon = playBtn.querySelector('.circle-btn_icon.is-play');
		const pauseIcon = playBtn.querySelector('.circle-btn_icon.is-pause');
		const muteIcon = muteBtn.querySelector('.circle-btn_icon.is-mute');
		const unmuteIcon = muteBtn.querySelector('.circle-btn_icon.is-unmute');

		let isMuted = false;

		ddg.utils.log('[audio] creating new player', audioUrl);

		if (typeof WaveSurfer === 'undefined') {
			ddg.utils.warn('[audio] WaveSurfer not available');
			ddg.utils.perf.end('audio-build');
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
			ddg.utils.perf.end('audio-build');
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
			console.log('[ddg:perf] 🎵 Audio: waveform ready');
			ddg.utils.log('[audio] waveform ready');
		});

		wavesurfer.on('play', () => {
			console.log('[ddg:perf] 🎵 Audio: playback started');
			setPlayState(playBtn, playIcon, pauseIcon, true);
			if (activePlayer && activePlayer.wavesurfer !== wavesurfer) {
				try { activePlayer.wavesurfer.pause(); } catch (e) { }
			}
			activePlayer = { el: playerEl, wavesurfer, audioUrl };
		});

		wavesurfer.on('pause', () => {
			console.log('[ddg:perf] 🎵 Audio: playback paused');
			setPlayState(playBtn, playIcon, pauseIcon, false);
		});
		wavesurfer.on('finish', () => {
			console.log('[ddg:perf] 🎵 Audio: playback finished');
			setPlayState(playBtn, playIcon, pauseIcon, false);
		});

		playBtn.addEventListener('click', () => wavesurfer.playPause());
		muteBtn.addEventListener('click', () => {
			isMuted = !isMuted;
			wavesurfer.setMuted(isMuted);
			setMuteState(muteBtn, muteIcon, unmuteIcon, isMuted);
		});

		playerEl.__ws = wavesurfer;
		ddg.utils.perf.end('audio-build');
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

	console.log('[ddg:perf] ========== BOOT START ==========');
	ddg.utils.perf.start('boot');
	ddg.utils.perf.memory();

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

		ddg.utils.perf.end('boot');
		ddg.utils.perf.memory();
		console.log('[ddg:perf] ========== BOOT COMPLETE ==========');

		// Log overall performance marks
		if (typeof performance.getEntriesByType === 'function') {
			const measures = performance.getEntriesByType('measure').filter(m => m.name.startsWith('ddg:'));
			if (measures.length) {
				console.table(measures.map(m => ({
					name: m.name.replace('ddg:', ''),
					duration: `${m.duration.toFixed(2)}ms`
				})));
			}
		}
	});
};