(function () {
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false,
		truePath: window.location.pathname,
		ajaxHomeLoaded: false
	});

	const fsState = (ddg.fsState ??= {
		activeList: null
	});

	// --- GSAP base config ------------------------------------------------------
	try {
		if (window.gsap) {
			gsap.defaults({ overwrite: 'auto' });
			gsap.ticker.lagSmoothing(500, 33);
		}
		if (window.ScrollTrigger?.config) {
			ScrollTrigger.config({
				ignoreMobileResize: true,
				autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load'
			});
		}
	} catch (_) { }

	// --- Finsweet (deduped helpers + single instance source of truth) ----------
	const FS = (window.FinsweetAttributes ||= []);
	const fsLoad = (m) => { try { window.FinsweetAttributes.load?.(m); } catch (_) { } };
	const fsRestart = (m) => { try { window.FinsweetAttributes.modules?.[m]?.restart?.(); } catch (_) { } };

	/** Single source of truth for the List instance */
	let list = null;

	// Hook once: when Attributes List boots, remember the first instance.
	FS.push(['list', (instances) => {
		try {
			list = Array.isArray(instances) ? instances[0] : instances?.[0];
			fsState.activeList = list || null;
		} catch (_) {
			list = null;
			fsState.activeList = null;
		}
	}]);

	// Optional helper to register list lifecycle hooks when available
	const onList = (phase, fn) => { try { list?.addHook?.(phase, fn); } catch (_) { } };

	// --- Public boot -----------------------------------------------------------
	const initSite = () => {
		if (data.siteBooted) return;
		data.siteBooted = true;

		setupFinsweetListLoader();
		initNavigation();
		initComingSoon();
		initModals();
		initAjaxModal();
		initAjaxHome();           // stripped "checkers" version
		initMarquee();
		setTimeout(initShare, 1000);
		setTimeout(initRandomiseFilters, 1000);
	};

	const setupFinsweetListLoader = () => {
		if (data.truePath.startsWith('/stories/')) return;
		// Load once: treat these as the canonical modules used on the site
		fsLoad('list');
		fsLoad('copyclip');
	};

	// --- Navigation (slim ScrollTrigger handler) -------------------------------
	const initNavigation = () => {
		const navEl = $('.nav')[0];
		if (!navEl) return;

		const showThreshold = 50;
		const hideThreshold = 100;
		let lastY = window.scrollY;

		ScrollTrigger.create({
			trigger: document.body,
			start: 'top top',
			end: 'bottom bottom',
			onUpdate: (self) => {
				const y = (window.ScrollTrigger?.scroll?.() ?? window.scrollY);
				const down = y > lastY;

				navEl.classList.toggle('is-past-threshold', y > hideThreshold);

				if (y <= showThreshold) {
					navEl.classList.remove('is-hidden');
				} else if (down && y > hideThreshold) {
					navEl.classList.add('is-hidden');
				} else if (!down) {
					navEl.classList.remove('is-hidden');
				}

				lastY = y;
			}
		});
	};

	// --- Coming Soon (SplitText lines animation) -------------------------------
	function initComingSoon() {
		const wrapperEl = document.querySelector('.home-list_list');
		if (!wrapperEl) return;

		const splitLineSel = '.home-list_split-line';
		const tapeSpeed = 5000;
		const splitSet = (ddg.__comingSoonSplitEls ||= new Set());

		const getSplit = (el) => {
			if (el.__ddgSplit) return el.__ddgSplit;
			try {
				const split = SplitText.create(el, {
					type: 'lines',
					autoSplit: true,
					tag: 'span',
					linesClass: 'home-list_split-line'
				});
				el.__ddgSplit = split;
				splitSet.add(el);
				return split;
			} catch (e) {
				console.warn('SplitText error', e);
				return null;
			}
		};

		const animate = (el, offset) => {
			const split = el.__ddgSplit || getSplit(el);
			if (!split) return;
			const lines = el.querySelectorAll(splitLineSel);
			if (!lines.length) return;
			gsap.killTweensOf(lines);
			const widths = Array.from(lines, (l) => l.offsetWidth);
			gsap.set(lines, { willChange: 'transform' });
			gsap.to(lines, {
				'--home-list--tape-r': offset,
				duration: (i) => widths[i] / tapeSpeed,
				ease: 'linear',
				onComplete: () => gsap.set(lines, { clearProps: 'will-change' })
			});
		};

		$(wrapperEl)
			.on('mouseenter.ddgComingSoon', '.home-list_item', function () {
				const wrap = this.closest('.home-list_item-wrap');
				if (!wrap || !wrap.querySelector('[data-coming-soon]')) return;
				if (this.tagName === 'A' && !this.__ddgCSClickBound) {
					this.__ddgCSClickBound = true;
					$(this).one('click.ddgComingSoon', e => e.preventDefault());
				}
				animate(this, 0);
			})
			.on('mouseleave.ddgComingSoon', '.home-list_item', function () {
				const wrap = this.closest('.home-list_item-wrap');
				if (!wrap || !wrap.querySelector('[data-coming-soon]')) return;
				animate(this, '100%');
			});

		let resizeTimer;
		$(window).on('resize.ddgComingSoon', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				for (const el of splitSet) {
					try { el.__ddgSplit?.revert(); } catch (_) { }
					delete el.__ddgSplit;
				}
				splitSet.clear();
			}, 200);
		});
	}

	// --- Share (unchanged, tiny touch-ups only) --------------------------------
	const initShare = () => {
		const $shareItems = $('[data-share]');
		if (!$shareItems.length || ddg.__shareInitialized) return;
		ddg.__shareInitialized = true;

		const shareWebhookUrl = 'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';
		const dailyShareKey = 'share_done_date';

		const todayString = () => new Date().toISOString().slice(0, 10);
		const nextMidnight = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d; };

		const setCookieValue = (name, value, expiresAt) => {
			document.cookie = `${name}=${value}; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax`;
		};
		const getCookieValue = (name) => {
			const pair = document.cookie.split('; ').find(row => row.startsWith(name + '=')) || '';
			return pair.split('=')[1] || null;
		};

		const markShareComplete = () => {
			const today = todayString();
			const exp = nextMidnight();
			localStorage.setItem(dailyShareKey, today);
			sessionStorage.setItem(dailyShareKey, today);
			setCookieValue(dailyShareKey, today, exp);
		};
		const alreadySharedToday = () => {
			const t = todayString();
			return [localStorage.getItem(dailyShareKey), sessionStorage.getItem(dailyShareKey), getCookieValue(dailyShareKey)].includes(t);
		};

		const shareUrlMap = {
			x: ({ url, text }) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
			facebook: ({ url }) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
			linkedin: ({ url }) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
			whatsapp: ({ url, text }) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
			messenger: ({ url }) => `https://www.messenger.com/t/?link=${encodeURIComponent(url)}`,
			snapchat: ({ url }) => `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`,
			instagram: () => 'https://www.instagram.com/',
			telegram: ({ url, text }) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
		};
		const platformAlias = { twitter: 'x' };

		const decrementCountdown = () => {
			$('[data-share-countdown]').each((_, element) => {
				const $el = $(element);
				let remaining = parseInt(element.getAttribute('data-share-countdown') || $el.text() || $el.val(), 10);
				if (!Number.isFinite(remaining)) remaining = 0;
				const next = Math.max(0, remaining - 1);
				$el.attr('data-share-countdown', next);
				$el.is('input, textarea') ? $el.val(next) : $el.text(next);
			});
		};

		let shareStartTimestamp = null;
		let pointerTravel = 0;
		let lastPointerPosition = null;
		let tracking = false;
		let trackingTimeout = null;

		const onSharePointerMove = (event) => {
			const { clientX, clientY } = event;
			if (!lastPointerPosition) { lastPointerPosition = [clientX, clientY]; return; }
			pointerTravel += Math.hypot(clientX - lastPointerPosition[0], clientY - lastPointerPosition[1]);
			lastPointerPosition = [clientX, clientY];
		};
		const startTracking = () => {
			if (tracking) return;
			tracking = true;
			shareStartTimestamp = Date.now();
			pointerTravel = 0;
			lastPointerPosition = null;
			$(document).on('pointermove.ddgShare', onSharePointerMove);
			trackingTimeout = setTimeout(() => stopTracking(), 8000);
		};
		const stopTracking = () => {
			if (!tracking) return;
			tracking = false;
			clearTimeout(trackingTimeout);
			$(document).off('pointermove.ddgShare', onSharePointerMove);
		};

		$(document).on('pointerenter.ddgShare', '[data-share]', startTracking);
		$(document).on('focusin.ddgShare', '[data-share]', startTracking);

		const heuristicsSatisfied = () =>
			shareStartTimestamp !== null &&
			Date.now() - shareStartTimestamp > 1500 &&
			pointerTravel > 120 &&
			document.hasFocus();

		const sendShareWebhook = (platform) =>
			new Promise(resolve => {
				const form = document.createElement('form');
				const iframe = document.createElement('iframe');
				const frameName = 'wf_' + Math.random().toString(36).slice(2);

				iframe.name = frameName;
				iframe.style.display = 'none';

				form.target = frameName;
				form.method = 'POST';
				form.action = shareWebhookUrl;
				form.style.display = 'none';

				[['platform', platform], ['date', todayString()]].forEach(([name, value]) => {
					const input = document.createElement('input');
					input.type = 'hidden';
					input.name = name;
					input.value = value;
					form.appendChild(input);
				});

				document.body.append(iframe, form);
				form.submit();

				setTimeout(() => {
					form.remove();
					iframe.remove();
					resolve(true);
				}, 1000);
			});

		$(document).on('click.ddgShare', '[data-share]', async (event) => {
			const $target = $(event.currentTarget);
			event.preventDefault();

			const platformKey = ($target.data('share') || '').toString().toLowerCase();
			const normalizedPlatform = (platformAlias[platformKey] || platformKey).toLowerCase();

			const shareUrl = $target.data('share-url') || window.location.href;
			const shareText = $target.data('share-text') || document.title;

			const resolver = shareUrlMap[normalizedPlatform];
			const destination = resolver ? resolver({ url: shareUrl, text: shareText }) : shareUrl;

			// Prefer Web Share API on supported devices
			if (navigator.share) {
				try {
					await navigator.share({ title: document.title, text: shareText, url: shareUrl });
					if (!alreadySharedToday()) { sendShareWebhook(normalizedPlatform); markShareComplete(); }
					decrementCountdown();
					return;
				} catch (_) { /* fall back */ }
			}

			const sharewindow = window.open('about:blank', '_blank');

			if (!heuristicsSatisfied()) {
				sharewindow?.close();
				console.warn('[share] blocked');
				return;
			}

			stopTracking();
			decrementCountdown();

			if (!alreadySharedToday()) {
				sendShareWebhook(normalizedPlatform);
				markShareComplete();
			}

			if (sharewindow) {
				sharewindow.opener = null;
				sharewindow.location.href = destination;
			} else {
				window.location.href = destination;
			}
		});
	};

	// --- Modals ----------------------------------------------------------------
	const initModals = () => {
		ddg.modals = ddg.modals || {};
		ddg._modalsKeydownBound = Boolean(ddg._modalsKeydownBound);

		const modalIds = new Set();
		$('[data-modal-trigger], [data-modal-el]').each((_, el) => {
			const id = $(el).attr('data-modal-trigger') || $(el).attr('data-modal-el');
			if (id) modalIds.add(id);
		});

		modalIds.forEach(modalId => {
			if (ddg.modals[modalId]) return;

			const $el = $(`[data-modal-el="${modalId}"]`);
			const $bg = $(`[data-modal-bg="${modalId}"]`);
			const $inner = $el.find('[data-modal-inner]').first();
			const $closeButtons = $(`[data-modal-close="${modalId}"], [data-modal-close]`).filter((_, node) => {
				const attr = node.getAttribute('data-modal-close');
				return !attr || attr === modalId;
			});

			if (!$el.length) return;

			const $animTarget = $inner.length ? $inner : $el;

			if ($el.hasClass('is-open')) {
				if ($bg.length) $bg.addClass('is-open');
				try { document.documentElement.style.overflow = 'hidden'; } catch (_) { }
			} else {
				if ($bg.length) $bg.removeClass('is-open');
				$el.removeClass('is-open');
			}

			const open = (options = {}) => {
				const { skipAnimation = false, beforeOpen = null, afterOpen = null } = options;

				Object.keys(ddg.modals).forEach(otherId => {
					if (otherId !== modalId && ddg.modals[otherId]?.isOpen?.()) {
						ddg.modals[otherId].close({ skipAnimation: true });
					}
				});

				if (beforeOpen) beforeOpen();
				if ($bg.length) $bg.addClass('is-open');

				gsap.killTweensOf($animTarget[0]);

				if (skipAnimation) {
					gsap.set($animTarget[0], { opacity: 1, y: 0 });
					$el.addClass('is-open');
					if (afterOpen) afterOpen();
					return;
				}

				gsap.fromTo($animTarget[0],
					{ y: 60, opacity: 0 },
					{
						y: 0,
						opacity: 1,
						duration: 0.6,
						ease: 'power2.out',
						onStart: () => $el.addClass('is-open'),
						onComplete: () => { if (afterOpen) afterOpen(); }
					}
				);
			};

			const close = (options = {}) => {
				const { skipAnimation = false, beforeClose = null, afterClose = null } = options;

				if (beforeClose) beforeClose();
				if ($bg.length) $bg.removeClass('is-open');

				gsap.killTweensOf($animTarget[0]);

				const cleanup = () => {
					$el.removeClass('is-open');
					try { document.documentElement.style.overflow = ''; } catch (_) { }
					if (afterClose) afterClose();
				};

				if (skipAnimation) {
					gsap.set($animTarget[0], { opacity: 0, y: 60 });
					cleanup();
					return;
				}

				gsap.to($animTarget[0], {
					y: 60,
					opacity: 0,
					duration: 0.6,
					ease: 'power2.out',
					onComplete: cleanup
				});
			};

			const isOpen = () => $el.hasClass('is-open');

			ddg.modals[modalId] = { open, close, isOpen, $el, $bg };

			const $triggers = $(`[data-modal-trigger="${modalId}"]`);
			const isAjaxModal = (modalId === 'story') || $triggers.first().is('[data-ajax-modal="link"]');
			const closeClickHandler = (e) => { if (e) { e.preventDefault(); e.stopPropagation?.(); } close(); };

			const bindCloseButtons = () => {
				if (!$closeButtons.length) return;
				$closeButtons.off('click.modal').on('click.modal', closeClickHandler);
			};
			const bindBackdrop = () => {
				if (!$bg.length) return;
				$bg.off('click.modal').on('click.modal', (e) => {
					if (e.target === e.currentTarget) closeClickHandler(e);
				});
			};

			if (!isAjaxModal) {
				$(document).on('click', `[data-modal-trigger="${modalId}"]`, e => {
					e.preventDefault();
					open();
				});
			}

			bindCloseButtons();
			bindBackdrop();

			$el.on('click.modal', e => { if (e.target === $el[0]) close(); });
		});

		if (!ddg._modalsKeydownBound) {
			ddg._modalsKeydownBound = true;
			$(document).on('keydown.modals', e => {
				if (e.key === 'Escape') {
					Object.keys(ddg.modals).forEach(modalId => {
						if (ddg.modals[modalId].isOpen()) ddg.modals[modalId].close();
					});
				}
			});
		}
	};

	// --- Ajax Modal ------------------------------------------------------------
	const initAjaxModal = () => {
		if (ddg._ajaxModalInitialized) return;
		ddg._ajaxModalInitialized = true;

		const modalId = 'story';
		const $embed = $('[data-ajax-modal="embed"]');
		const modal = ddg.modals[modalId];
		const homeTitle = document.title;

		const openWithHistory = (title, url) => {
			modal.open({
				afterOpen: () => {
					if (title && url) {
						document.title = title;
						window.history.pushState({ modal: true }, '', url);
					}
				}
			});
		};
		const closeWithHistory = () => {
			modal.close({
				beforeClose: () => {
					document.title = homeTitle;
					window.history.pushState({ modal: false }, '', '/');
				}
			});
		};
		const handleClose = (e) => { e.preventDefault(); e.stopImmediatePropagation?.(); closeWithHistory(); };

		ddg._ajaxModalLock = false;
		$(document).on('click', '[data-ajax-modal="link"]', e => {
			e.preventDefault();
			if (ddg._ajaxModalLock || modal.isOpen()) return;
			ddg._ajaxModalLock = true;

			const linkUrl = $(e.currentTarget).attr('href');
			try { $embed.empty().append("<div class='modal-skeleton' aria-busy='true'></div>"); } catch (_) { }

			$.ajax({
				url: linkUrl,
				success: (response) => {
					let contentNode = null;
					let title = '';
					try {
						const doc = new DOMParser().parseFromString(response, 'text/html');
						contentNode = doc.querySelector('[data-ajax-modal="content"]');
						title = doc.title || '';
					} catch (_) { }
					const url = new URL(linkUrl, window.location.origin).href;

					$embed.empty().append(contentNode ? $(contentNode) : "<div class='modal-error'>Failed to load content.</div>");
					if (contentNode) initMarquee(contentNode);
					openWithHistory(title, url);
				},
				error: () => {
					$embed.empty().append("<div class='modal-error'>Failed to load content.</div>");
					modal.open();
				},
				complete: () => { ddg._ajaxModalLock = false; }
			});
		});

		modal.$el.find(`[data-modal-close="${modalId}"], [data-modal-close]`).filter((_, node) => {
			const attr = node.getAttribute('data-modal-close');
			return !attr || attr === modalId;
		}).off('click.modal').on('click.ajax', handleClose);
		if (modal.$bg.length) modal.$bg.off('click.modal').on('click.ajax', handleClose);
		if (modal.$el.length) modal.$el.off('click.modal').on('click.ajax', handleClose);

		$(document).off('keydown.modals').on('keydown.modals', e => {
			if (e.key === 'Escape') {
				Object.keys(ddg.modals).forEach(id => {
					if (ddg.modals[id].isOpen()) {
						if (id === modalId) closeWithHistory();
						else ddg.modals[id].close();
					}
				});
			}
		});

		if (window.location.pathname.startsWith('/story/')) {
			modal.open({ skipAnimation: true });
			window.history.replaceState({ modal: true }, '', window.location.href);
		}
	};

	// --- Ajax Home (STRIPPED CHECKERS: direct load → restart → refresh) -------
	const initAjaxHome = () => {
		if (data.ajaxHomeLoaded || !data.truePath.startsWith('/stories/')) return;

		const $target = $('[data-ajax-home="target"]');
		if (!$target.length) return;

		$.ajax({
			url: '/',
			success: (response) => {
				const $html = $('<div>').append($.parseHTML(response));
				const $source = $html.find('[data-ajax-home="source"]');
				if (!$source.length) return;

				const content = $source.html();
				$target.empty().append(content);
				data.ajaxHomeLoaded = true;

				// load + restart relevant modules once
				fsLoad('list'); fsLoad('copyclip');
				fsRestart('list'); fsRestart('copyclip');

				initModals();
				initComingSoon();
				initMarquee($target[0]);

				requestAnimationFrame(() => {
					ScrollTrigger?.refresh?.();
					if (ddg.tickerTape?.refresh) setTimeout(() => ddg.tickerTape.refresh(), 100);
				});
			}
		});
	};

	// --- Randomise Filters (hook-based; no instance chasing) -------------------
	function initRandomiseFilters() {
		const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
		const fieldValueStrings = (field) => {
			if (!field) return [];
			const v = field.value;
			if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
			return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
		};

		const filtersForm = document.querySelector('[fs-list-element="filters"]');

		// Build a simple UI index once (rebuilt on afterRender if needed)
		const buildUiIndex = () => {
			if (!filtersForm) return null;
			const allInputs = Array
				.from(filtersForm.querySelectorAll('input[type="checkbox"][fs-list-field][fs-list-value]'))
				.filter((input) => {
					const label = input.closest('label');
					return !(label && label.classList.contains('is-list-emptyfacet'));
				});
			if (!allInputs.length) return null;

			const uiByField = new Map();
			allInputs.forEach((input) => {
				const key = input.getAttribute('fs-list-field');
				const val = input.getAttribute('fs-list-value');
				if (!key || !val) return;
				let map = uiByField.get(key);
				if (!map) uiByField.set(key, (map = new Map()));
				map.set(val, input);
			});

			const clearBtn = document.querySelector('[fs-list-element="clear"]');
			return { allInputs, uiByField, clearBtn };
		};

		let uiIndex = buildUiIndex();

		// Keep UI index fresh after list renders
		onList('afterRender', () => { uiIndex = buildUiIndex(); });

		async function randomise() {
			if (!list) { fsLoad('list'); return false; } // ensure module is requested

			const cache = uiIndex || buildUiIndex();
			if (!cache) return false;

			const { allInputs, uiByField, clearBtn } = cache;
			const items = Array.isArray(list.items?.value) ? list.items.value :
				(Array.isArray(list.items) ? list.items : []);
			if (!items.length) return false;

			// Pick a random item; collect 2–5 existing facets that have UI
			const maxTries = Math.min(items.length, 50);
			let chosenFromItem = null;

			for (let attempt = 0; attempt < maxTries; attempt++) {
				const item = items[rand(0, Math.max(0, items.length - 1))];
				const fieldsEntries = Object.entries(item?.fields || {});
				if (!fieldsEntries.length) continue;

				const candidates = [];
				fieldsEntries.forEach(([key, field]) => {
					const map = uiByField.get(key);
					if (!map || !map.size) return;
					const values = fieldValueStrings(field);
					const exists = values.filter((v) => map.has(v));
					if (!exists.length) return;
					const val = exists[rand(0, exists.length - 1)];
					candidates.push({ fieldKey: key, value: val, input: map.get(val) });
				});

				if (candidates.length >= 2) {
					for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
					const n = rand(2, Math.min(5, candidates.length));
					chosenFromItem = candidates.slice(0, n);
					break;
				}
			}

			if (!chosenFromItem) return false;
			const chosen = chosenFromItem;

			// Clear via official clear button if present, else manually uncheck
			if (clearBtn) {
				clearBtn.click();
			} else {
				allInputs.forEach((input) => {
					if (input.checked) {
						input.checked = false;
						input.dispatchEvent(new Event('input', { bubbles: true }));
						input.dispatchEvent(new Event('change', { bubbles: true }));
					}
					const lab = input.closest('label');
					if (lab) lab.classList.remove('is-list-active');
				});
			}

			// Apply API-level filters and let Attributes drive UI/DOM update
			const apiFilters = list.filters?.value;
			if (!apiFilters) return false;
			apiFilters.groupsMatch = 'and';
			apiFilters.groups = [{
				id: 'random',
				conditionsMatch: 'and',
				conditions: chosen.map(({ fieldKey, value }) => ({
					id: `rf-${fieldKey}-${Date.now()}`,
					type: 'checkbox',
					fieldKey,
					op: 'equal',
					value,
					interacted: true
				}))
			}];

			if (typeof list.triggerHook === 'function') list.triggerHook('filter');

			return true;
		}

		document.addEventListener('click', (e) => {
			const el = e.target.closest('[data-randomfilters]');
			if (!el) return;
			void randomise();
		}, true);
	}

	// --- Marquee (lean, single stylesheet rule) --------------------------------
	function initMarquee(root = document) {
		// global stylesheet once
		if (!document.getElementById('ddg-marquee-style')) {
			const s = document.createElement('style');
			s.id = 'ddg-marquee-style';
			s.textContent = `
        @keyframes ddg-marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        [data-marquee] { display:flex; overflow:hidden; }
        [data-marquee] .marquee-inner { display:flex; gap:inherit; width:max-content; animation: ddg-marquee var(--ddg-marquee-duration,20000ms) linear infinite; will-change: transform; }
      `;
			document.head.appendChild(s);
		}

		const elements = root.querySelectorAll('[data-marquee]:not([data-marquee-init])');
		elements.forEach((el) => {
			el.setAttribute('data-marquee-init', '1');

			const inner = document.createElement('div');
			inner.className = 'marquee-inner';
			while (el.firstChild) inner.appendChild(el.firstChild);
			// clone content once so the animation can loop seamlessly
			inner.append(...Array.from(inner.children).map((n) => n.cloneNode(true)));
			el.appendChild(inner);
		});
	}
	ddg.initMarquee = initMarquee;

	// --- Export boot -----------------------------------------------------------
	ddg.boot = initSite;
})();