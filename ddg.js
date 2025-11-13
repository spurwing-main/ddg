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

		throttle: (fn, ms = 150) => {
			let lastCall = 0;
			return (...args) => {
				const now = Date.now();
				if (now - lastCall >= ms) {
					lastCall = now;
					fn(...args);
				}
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
		const prefix = 'ddg:';
		const listeners = new Map();

		function post(type, data = {}, target = 'parent') {
			if (!type) return;
			try {
				const t = target === 'parent' ? window.parent : target;
				if (!t || typeof t.postMessage !== 'function') return;
				t.postMessage({ type: prefix + type, data }, '*');
			} catch (err) {
				ddg.utils.warn('[iframeBridge] post failed', err);
			}
		}

		function on(type, fn) {
			if (!type || typeof fn !== 'function') return () => { };
			const key = prefix + type;
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
			if (!url || typeof url !== 'string') throw new Error('ddg.net.fetchHTML: invalid url');
			const res = await fetch(url, { credentials: 'same-origin' });
			if (!res.ok) throw new Error(`ddg.net.fetchHTML: http ${res.status}`);
			const text = await res.text();
			return new DOMParser().parseFromString(text, 'text/html');
		},
		// Fetch and parse json safely
		async fetchJSON(url) {
			if (!url || typeof url !== 'string') throw new Error('ddg.net.fetchJSON: invalid url');
			const res = await fetch(url, { credentials: 'same-origin' });
			if (!res.ok) throw new Error(`ddg.net.fetchJSON: http ${res.status}`);
			try {
				return await res.json();
			} catch {
				throw new Error('ddg.net.fetchJSON: invalid json');
			}
		},
		// Prefetch (html or json) after delay, cancellable
		prefetch(url, delay = 250) {
			if (!url) throw new Error('ddg.net.prefetch: missing url');
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
		const listeners = new Set();

		const readSize = () => ({
			width: window.innerWidth || document.documentElement.clientWidth || 0,
			height: window.innerHeight || document.documentElement.clientHeight || 0
		});

		let lastSize = readSize();

		const notify = () => {
			lastSize = readSize();
			const detail = { ...lastSize };

			// Fire a single global custom event (on both window + document for maximum compatibility)
			const evt = new CustomEvent('ddg:resize', { detail });
			try {
				window.dispatchEvent(evt);
			} catch { /* ignore */ }
			try {
				document.dispatchEvent(evt);
			} catch { /* ignore */ }

			// Call registered listeners
			listeners.forEach(fn => {
				try {
					fn(detail);
				} catch (err) {
					ddg.utils.warn('[resizeEvent] listener error', err);
				}
			});
		};

		// One global, throttled resize handler
		const onWinResize = ddg.utils.throttle(notify, 150);
		window.addEventListener('resize', onWinResize, { passive: true });

		const on = (fn, { immediate = false } = {}) => {
			if (typeof fn !== 'function') return () => { };
			listeners.add(fn);

			if (immediate) {
				try {
					fn({ ...lastSize });
				} catch (err) {
					ddg.utils.warn('[resizeEvent] immediate listener error', err);
				}
			}

			return () => {
				listeners.delete(fn);
			};
		};

		const getSize = () => ({ ...lastSize });

		return { on, getSize };
	})();

	ddg.fs ??= (() => {
		const log = (...args) => ddg.utils.log('[fs]', ...args);
		const warn = (...args) => ddg.utils.warn('[fs]', ...args);

		// Core - Get list instance
		let listPromise;
		const readyList = () => {
			if (listPromise) return listPromise;

			listPromise = new Promise((resolve) => {
				window.FinsweetAttributes ||= [];
				window.FinsweetAttributes.push(['list', (instances) => {
					const list = Array.isArray(instances) ? (instances.find(Boolean) ?? instances[0]) : instances;

					if (!list) {
						throw new Error('ddg.fs.readyList: Finsweet list instance is missing or invalid');
					}

					log('list ready', { instances });

					try {
						ddg.utils.emit('fs:list-ready', { list });
					} catch (err) {
						warn('event dispatch failed', err);
					}

					resolve(list);
				}]);
			});

			return listPromise;
		};

		const currentItem = (() => {
			ddg.currentItem ??= { item: null, url: null };

			return {
				resolve: async (url = window.location.href) => {
					const list = await readyList();
					if (!list || !list.items) {
						throw new Error('ddg.fs.currentItem.resolve: list or list.items missing');
					}

					const itemsArr = list.items.value || list.items;
					if (!Array.isArray(itemsArr)) {
						throw new Error('ddg.fs.currentItem.resolve: items is not an array');
					}

					const resolved = new URL(url, window.location.origin);

					// Use Finsweet's native item matching
					const item = itemsArr.find(item => {
						if (!item.url) return false;
						return item.url.pathname === resolved.pathname;
					});

					if (item && item !== ddg.currentItem.item) {
						ddg.currentItem.item = item;
						ddg.currentItem.url = url;
						log('current item changed', { pathname: resolved.pathname });
						ddg.utils.emit('ddg:current-item-changed', { item, url });
					}
				}
			};
		})();

		const setFilters = async (fieldValues, { reset = true } = {}) => {
			const list = await readyList();
			if (!list) {
				throw new Error('ddg.fs.setFilters: list instance is missing');
			}

		// Step 1: Clear all form fields first (only if reset is true)
			if (reset) {
				const forms = document.querySelectorAll('[fs-list-element="filters"]');
				forms.forEach(form => {
					form.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(input => {
						input.checked = false;
						input.closest('label')?.classList.remove('is-list-active');
					});

					form.querySelectorAll('input[type="text"], input[type="search"], textarea').forEach(input => {
						input.value = '';
					});

					form.querySelectorAll('select').forEach(select => {
						select.selectedIndex = 0;
					});
				});
			}

		// Step 2: Build new conditions
			const conditions = Object.entries(fieldValues || {})
				.map(([fieldKey, values]) => {
					const valueArray = Array.isArray(values) ? values : [values];
					const cleanValues = [...new Set(valueArray.map(String))].filter(Boolean);

					if (!cleanValues.length) return null;

					return {
						id: `${fieldKey}_equal`,
						type: 'checkbox',
						fieldKey,
						value: cleanValues,
						op: 'equal',
						filterMatch: 'or',  // <-- This is the "or" you asked about
						interacted: true,
						showTag: true,
						tagValuesDisplay: 'combined'
					};
				})
				.filter(Boolean);

			log('setFilters', { fieldValues, conditions: conditions.length });

		// Step 3: Set the new filters
			list.filters.value = {
				groupsMatch: 'and',
				groups: conditions.length ? [{
					id: '0',
					conditionsMatch: 'and',
					conditions
				}] : []
			};

		// Step 4: Notify other modules (e.g. homelistSplit) - event on window, not document
			ddg.utils.emit('ddg:filters-change', { fieldValues, list }, window);
		};

		// Related filters
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
				if (!item?.fields) return {};
				const result = {};
				for (const [fieldKey, field] of Object.entries(item.fields)) {
					if (excluded.has(fieldKey)) continue;
					const values = Array.isArray(field.value) ? field.value : [field.value];
					const stringValues = values.map(v => String(v)).filter(Boolean);
					if (stringValues.length) result[fieldKey] = stringValues;
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
				label.appendChild(input);
				label.appendChild(span);
				return label;
			};

			const render = (parent, fields) => {
				const target = parent.querySelector(sel.target);
				if (!target) return;

				const tpl = target.querySelector(sel.label) || createLabel();
				while (target.firstChild) target.removeChild(target.firstChild);

				const entries = [];
				for (const [field, arr] of Object.entries(fields || {})) {
					if (!Array.isArray(arr) || !arr.length || excluded.has(field)) continue;
					for (const val of Array.from(new Set(arr))) {
						entries.push({ field, value: String(val) });
					}
				}

				ddg.utils.shuffle(entries).slice(0, max).forEach(({ field, value }, idx) => {
					const clone = tpl.cloneNode(true);
					const input = clone.querySelector(sel.input);
					const span = clone.querySelector(sel.span);
					if (!input || !span) return;

					input.id = `rf-${field}-${idx}`;
					input.name = `rf-${field}`;
					input.setAttribute('fs-list-field', field);
					input.setAttribute('fs-list-value', value);
					span.textContent = value;
					target.appendChild(clone);
				});

				wireCheckboxes(parent);
				parent.querySelectorAll(`${sel.target} ${sel.input}`).forEach((i) => {
					const label = i.closest('label');
					if (label) label.classList.toggle('is-list-active', i.checked);
				});
			};

			const wireCheckboxes = (parent) => {
				if (parent.rfWired) return;
				parent.rfWired = true;
				parent.addEventListener('change', (e) => {
					if (!e.target?.matches?.(sel.input)) return;
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

			const init = () => {
				const buildFilters = () => {
					const item = ddg.currentItem?.item;
					if (!item) return;
					const fields = extractFields(item);
					document.querySelectorAll(sel.parent).forEach(parent => {
						render(parent, fields);
						wireSearch(parent);
					});
				};

				document.addEventListener('ddg:current-item-changed', (e) => {
					if (e.detail?.item) buildFilters();
				});

				document.addEventListener('ddg:story-opened', () => {
					requestAnimationFrame(() => requestAnimationFrame(buildFilters));
				});

				log('relatedFilters init', { parents: document.querySelectorAll(sel.parent).length });
			};

			return { init };
		})();

		// Random filters
		const randomFilters = (() => {
			const maxTotal = 4;
			const state = { bag: [] };

			const getKey = (item) =>
				item?.url?.pathname || item?.slug || item?.fields?.slug?.value || item?.id || null;

			const rebuildBag = (items, exclude) => {
				const ids = items.map((_, i) => i).filter(i => getKey(items[i]) !== exclude);
				state.bag = ddg.utils.shuffle(ids);
				log('randomFilters rebuild bag', { size: state.bag.length });
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
					const items = list.items?.value || [];
					if (!items.length) return;

					const idx = getNext(items);
					const item = items[idx] ?? items[Math.floor(Math.random() * items.length)];

					// Flatten all field values into single array, shuffle, and limit to maxTotal
					const allEntries = [];
					for (const [fieldKey, field] of Object.entries(item.fields)) {
						const values = Array.isArray(field.value) ? field.value : [field.value];
						values.forEach(val => allEntries.push({ fieldKey, value: val }));
					}

					const limitedFields = {};
					ddg.utils.shuffle(allEntries).slice(0, maxTotal).forEach(({ fieldKey, value }) => {
						(limitedFields[fieldKey] ||= []).push(value);
					});

					log('randomFilters apply', { idx, limitedFields });
					await setFilters(limitedFields);
				}, true);

				log('randomFilters init');
			};

			return { init };
		})();

		// Loading filters
		const loadingFilters = (() => {
			const maxDisplay = 4;

			const init = () => {
				log('loadingFilters init');

				const waitForWebflow = () => {
					return new Promise((resolve) => {
						const check = () => {
							const wfIx = Webflow?.require?.("ix3");
							if (wfIx?.emit) resolve(wfIx);
							else requestAnimationFrame(check);
						};
						check();
					});
				};

				waitForWebflow().then((wfIx) => {
					const parent = document.querySelector('[data-loadingfilters="parent"]');
					if (!parent) return;

					const labels = parent.querySelectorAll('label');
					let modalOpen = false;
					let pendingAnimation = false;

					// Listen for Finsweet's native filter hook
					readyList().then(list => {
						list.addHook('filter', (items) => {
							// Extract current filter values from list.filters
							const allValues = list.filters.value.groups.flatMap(group =>
								group.conditions.flatMap(condition => {
									const val = condition.value;
									return Array.isArray(val) ? val : [val];
								})
							).filter(Boolean);

							const values = allValues.slice(0, maxDisplay);
							const extraCount = Math.max(0, allValues.length - maxDisplay);

							labels.forEach((label, i) => {
								const span = label.querySelector('span');
								label.style.pointerEvents = 'none';

								if (values[i]) {
									label.style.display = '';
									if (span) span.textContent = values[i];
								} else if (i === values.length && extraCount > 0) {
									label.style.display = '';
									if (span) span.textContent = `+${extraCount} more`;
								} else {
									label.style.display = 'none';
								}
							});

							if (values.length > 0) {
								if (modalOpen) {
									pendingAnimation = true;
								} else {
									window.scrollTo({ top: 0, behavior: 'smooth' });
									wfIx.emit("loadingFilters");
								}
							}

							return items; // Pass items through unchanged
						});
					});

					document.addEventListener('ddg:modal-opened', (e) => {
						if (e?.detail?.id === 'filters') modalOpen = true;
					});

					document.addEventListener('ddg:modal-closed', (e) => {
						if (e?.detail?.id === 'filters') {
							modalOpen = false;
							if (pendingAnimation) {
								pendingAnimation = false;
								window.scrollTo({ top: 0, behavior: 'smooth' });
								wfIx.emit("loadingFilters");
								}
						}
					});
				});
			};

			return { init };
		})();

		// Main initializer
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

		// Public api
		return {
			readyList,
			finsweetRelated,
			resolveCurrentItem: currentItem.resolve,
			setFilters
		};
	})();

	function initSite() {
		if (data.siteBooted) return;
		data.siteBooted = true;

		requestAnimationFrame(() => {
			iframe();
			nav();
			modals();
			ddg.fs.finsweetRelated();
			ajaxStories();
			homelistSplit();
			outreach();
			share();
			storiesAudioPlayer();
			joinButtons();
		});
	}

	function iframe() {
		// --- parent: accept url sync from children
		if (window === window.parent) {
			let childSyncSession = false; // active while parent is following a child-driven story journey
			const norm = (p) => { try { const s = String(p || ''); return (s.replace(/\/+$/, '') || '/'); } catch { return '/'; } };
			ddg.iframeBridge.on('sync-url', ({ url, title }, ev) => {
				try {
					const parentPath = norm(location.pathname);
					let nextUrl = null, nextPath = null;
					if (url) {
						nextUrl = new URL(url, location.href);
						nextPath = norm(nextUrl.pathname);
					}

					const allowNow = childSyncSession || parentPath === '/';
					if (!allowNow) return;

					// Start session when following child from home to a different path
					if (!childSyncSession && parentPath === '/' && nextPath && nextPath !== '/') { childSyncSession = true; }
					if (url && url !== location.href) {
						const u = new URL(url, location.href);
						if (u.origin === location.origin) {
							history.replaceState(history.state, '', u.toString());
						} else {
							location.assign(u.toString());
						}
					}

					// End session when returning to home
					if (childSyncSession && nextPath === '/') { childSyncSession = false; }
					if (title) document.title = title;
				} catch (err) {
					ddg.utils.warn('[iframe] parent sync failed', err);
				}
			});
			return ddg.iframeBridge;
		}

		// --- child: notify parent on url changes
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

		ddg.utils.log('[ddg] iframe booted');
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

		// Throttled update function for better scroll performance
		const updateNav = () => {
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
		};

		// Ensure a ScrollTrigger instance with throttled updates
		ScrollTrigger.create({
			trigger: document.body,
			start: 'top top',
			end: 'bottom bottom',
			onUpdate: ddg.utils.throttle(updateNav, 16) // Throttle to ~60fps
		});
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

		const isMobile = () => window.innerWidth <= mobileBp;

		const revertSplit = () => {
			if (!split) return;
			try { split.revert(); }
			catch (e) { ddg.utils.warn('homelistSplit: revert failed', e); }
			finally { split = null; }
		};

		const applySplit = () => {
			const items = gsap.utils.toArray(list.querySelectorAll('.home-list_item'));
			if (!items.length) return;

			split = new SplitText(items, { type: 'lines', linesClass: 'home-list_split-line' });

			// Create a single reusable probe element for measuring 1ch
			const probe = document.createElement('span');
			probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;margin:0;padding:0;border:0;width:1ch;height:0;font:inherit;white-space:normal;';

			try {
				// Phase 1: batch all dom reads (measurements) to minimize layout thrashing
				const measurements = split.lines.map(line => {
					// Measure ch-width in this line's font context
					line.appendChild(probe);
					const chPx = probe.getBoundingClientRect().width || 1;
					line.removeChild(probe);

					// Read all needed dimensions
					const offsetWidth = line.offsetWidth || 0;
					const widthPx = line.getBoundingClientRect().width || 0;

					return { line, chPx, offsetWidth, widthPx };
				});

				// Phase 2: batch all dom writes (style updates)
				measurements.forEach(({ line, chPx, offsetWidth, widthPx }) => {
					const dur = gsap.utils.clamp(0.3, 2, offsetWidth / tapeSpeed);
					line.style.setProperty('--tape-dur', `${dur}s`);

					const chUnits = chPx ? (widthPx / chPx) : 0;
					line.style.setProperty('--line-ch', `${chUnits.toFixed(2)}ch`);
				});
			} catch (err) {
				if (probe.parentNode) probe.parentNode.removeChild(probe);
				ddg.utils.warn('homelistSplit: split measurement failed', err);
				return;
			}
		};

		const update = () => {
			revertSplit();
			if (isMobile()) return;

			try { applySplit(); }
			catch (e) { ddg.utils.warn('homelistSplit: split failed', e); }
		};

		const throttleUpdate = ddg.utils.throttle(update, 120);

		const init = async () => {
			await (ddg?.utils?.fontsReady?.() ?? Promise.resolve());

			update();

			// Use the shared global resize bus where available
			if (ddg.resizeEvent?.on) {
				ddg.resizeEvent.on(throttleUpdate);
			} else {
				// Fallback: direct resize listener (shouldn't usually be hit)
				window.addEventListener('resize', throttleUpdate);
			}

			window.addEventListener('ddg:filters-change', throttleUpdate);
		};

		init();

		return () => {
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
			if (!window.open(url, '_blank')) { location.href = url; }
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

		document.addEventListener('ddg:modal-opened', (e) => {
			window.Marquee.rescan(document);
		});
		document.addEventListener('ddg:modal-closed', (e) => {
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
		const skeletonHtml = "<div class='modal-skeleton' aria-busy='true'></div>";
		const errorHtml = "<div class='modal-error'>Failed to load content.</div>";

		const dispatchStoryOpened = (url) => queueMicrotask(() => {
			ddg.utils.emit('ddg:story-opened', { url });
		});

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
					ddg.fs.readyList()
						.then(() => dispatchStoryOpened(url))
						.catch(() => dispatchStoryOpened(url))
						.finally(() => {
							ddg.fs.resolveCurrentItem?.(url);
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
			ddg.fs.resolveCurrentItem?.(homeUrl);
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

		const cancelPrefetch = () => {
			if (!prefetchCancel) return;
			try { prefetchCancel(); } catch { }
			prefetchCancel = null;
		};

		const maybePrefetchStory = (event) => {
			const root = event.target.closest('[data-ajax-modal="link"]');
			if (!root) return;
			const url = resolveLinkHref(root, event.target);
			if (!prefetchEnabled || !url || cacheGet(url)) return;
			cancelPrefetch();
			try { prefetchCancel = ddg.net.prefetch(url, 120); }
			catch { prefetchCancel = null; }
		};

		const throttledHover = ddg.utils.throttle((event) => {
			maybePrefetchStory(event);
		}, 16);

		const throttledHoverOut = ddg.utils.throttle((event) => {
			const root = event.target.closest('[data-ajax-modal="link"]');
			if (!root) return;
			const related = event.relatedTarget;
			if (related && root.contains(related)) return;
			cancelPrefetch();
		}, 16);

		document.addEventListener('click', onStoryLinkClick);
		document.addEventListener('mouseover', throttledHover);
		document.addEventListener('mouseout', throttledHoverOut);
		document.addEventListener('touchstart', maybePrefetchStory, { passive: true });
		document.addEventListener('touchend', cancelPrefetch, { passive: true });
		document.addEventListener('touchcancel', cancelPrefetch, { passive: true });

		window.addEventListener('popstate', () => {
			const path = window.location.pathname;
			const modal = ensureModal();
			if (!modal) return;
			if (!path.startsWith('/stories/')) {
				if (modal.isOpen()) modal.close();
				ddg.fs.resolveCurrentItem?.(window.location.href);
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

			let wavesurfer;
			let isMuted = false;

			ddg.utils.log('[audio] creating new player', audioUrl);
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
			warn('Recorder dom incomplete — aborting wiring.');
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
			const res = await fetch('https://api.cloudinary.com/v1_1/daoliqze4/video/upload', { method: 'post', body: fd });
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

	function joinButtons() {
		const stickyButton = document.querySelector('.join_sticky');
		const staticButton = document.querySelector('.join-cta_btn .button');

		if (!stickyButton || !staticButton || !window.gsap || !window.ScrollTrigger) return;

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

	ddg.boot = initSite;
})();
