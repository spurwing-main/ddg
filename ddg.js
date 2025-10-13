(function () {
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false,
		truePath: window.location.pathname,
		ajaxHomeLoaded: false
	});

	const fsState = (ddg.fsState ??= {
		loadRequested: new Set(),
		activeList: null
	});

	try {
		if (window.gsap) {
			gsap.defaults({ overwrite: 'auto' });
			gsap.ticker.lagSmoothing(500, 33);
		}
		if (window.ScrollTrigger?.config) {
			ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' });
		}
	} catch (_) { }

	ddg.scheduleFsRestart = (moduleName) => {
		ddg.__fsRestartScheduled = ddg.__fsRestartScheduled || {};
		if (ddg.__fsRestartScheduled[moduleName]) return;
		ddg.__fsRestartScheduled[moduleName] = true;
		Promise.resolve().then(() => {
			try { window.FinsweetAttributes?.modules?.[moduleName]?.restart?.(); } catch (_) { }
			ddg.__fsRestartScheduled[moduleName] = false;
		});
	};

	ddg.requestFsLoad = (...modules) => {
		if (!window.FinsweetAttributes) window.FinsweetAttributes = [];
		modules.forEach((m) => {
			if (fsState.loadRequested.has(m)) return;
			try { window.FinsweetAttributes.load?.(m); } catch (_) { }
			fsState.loadRequested.add(m);
		});
	};

	const initSite = () => {
		if (data.siteBooted) return;
		data.siteBooted = true;

		const runInit = () => {
			setTimeout(() => {
				setupFinsweetListLoader();
				setTimeout(initNavigation, 150);
				setTimeout(initComingSoon, 450);
				setTimeout(initModals, 600);
				setTimeout(initAjaxModal, 800);
				setTimeout(initShare, 1200);
				setTimeout(initRandomiseFilters, 1400);
				setTimeout(initAjaxHome, 1600);
			}, 2000);
		};

		if (document.readyState === 'complete') {
			runInit();
		} else {
			window.addEventListener('load', runInit, { once: true });
		}
	};

	const setupFinsweetListLoader = () => {
		window.FinsweetAttributes = window.FinsweetAttributes || [];
		if (data.truePath.startsWith('/stories/')) return;
		setTimeout(() => ddg.requestFsLoad('list', 'copyclip'), 800);
	};

	const initNavigation = () => {
		const navEl = $('.nav')[0];
		if (!navEl) return;

		const showThreshold = 50;
		const hideThreshold = 100;
		const revealBuffer = 50;

		let lastScrollY = window.scrollY;
		let revealDistance = 0;

		ScrollTrigger.create({
			trigger: document.body,
			start: 'top top',
			end: 'bottom bottom',
			onUpdate: () => {
				const y = (window.ScrollTrigger?.scroll?.() ?? window.scrollY);
				const delta = y - lastScrollY;

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
				lastScrollY = y;
			}
		});
	};

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

	const initShare = () => {
		const $shareItems = $('[data-share]');
		if (!$shareItems.length || ddg.__shareInitialized) return;
		ddg.__shareInitialized = true;

		const shareWebhookUrl = 'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';
		const dailyShareKey = 'share_done_date';

		const todayString = () => new Date().toISOString().slice(0, 10);
		const nextMidnight = () => {
			const date = new Date();
			date.setHours(24, 0, 0, 0);
			return date;
		};

		const setCookieValue = (name, value, expiresAt) => {
			document.cookie = `${name}=${value}; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax`;
		};

		const getCookieValue = name => {
			const cookiePair = document.cookie.split('; ').find(row => row.startsWith(name + '=')) || '';
			return cookiePair.split('=')[1] || null;
		};

		const markShareComplete = () => {
			const todayValue = todayString();
			const expiresAt = nextMidnight();
			localStorage.setItem(dailyShareKey, todayValue);
			sessionStorage.setItem(dailyShareKey, todayValue);
			setCookieValue(dailyShareKey, todayValue, expiresAt);
		};

		const alreadySharedToday = () => {
			const todayValue = todayString();
			return [
				localStorage.getItem(dailyShareKey),
				sessionStorage.getItem(dailyShareKey),
				getCookieValue(dailyShareKey)
			].includes(todayValue);
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
				const $element = $(element);
				let remaining = parseInt(element.getAttribute('data-share-countdown') || $element.text() || $element.val(), 10);
				if (!Number.isFinite(remaining)) remaining = 0;
				const nextValue = Math.max(0, remaining - 1);
				$element.attr('data-share-countdown', nextValue);
				$element.is('input, textarea') ? $element.val(nextValue) : $element.text(nextValue);
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

		const sendShareWebhook = platform =>
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

		$(document).on('click.ddgShare', '[data-share]', event => {
			const $target = $(event.currentTarget);
			event.preventDefault();

			const platformKey = ($target.data('share') || '').toString().toLowerCase();
			const normalizedPlatform = (platformAlias[platformKey] || platformKey).toLowerCase();

			const shareUrl = $target.data('share-url') || window.location.href;
			const shareText = $target.data('share-text') || document.title;

			const resolver = shareUrlMap[normalizedPlatform];
			const destination = resolver ? resolver({ url: shareUrl, text: shareText }) : shareUrl;

			const sharewindow = window.open('about:blank', '_blank');

			if (!heuristicsSatisfied()) {
				sharewindow?.close();
				console.warn('[share] blocked');
				return;
			}

			stopTracking();
			decrementCountdown();

			if (!alreadySharedToday()) {
				sendShareWebhook(normalizedPlatform).then(() => console.log('[share] webhook sent'));
				markShareComplete();
			} else {
				console.log('[share] daily cap hit');
			}

			if (sharewindow) {
				sharewindow.opener = null;
				sharewindow.location.href = destination;
			} else {
				window.location.href = destination;
			}
		});
	};

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
			const $closeButtons = $(`[data-modal-close="${modalId}"]`);

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

			if (!isAjaxModal) {
				$(document).on('click', `[data-modal-trigger="${modalId}"]`, e => {
					e.preventDefault();
					open();
				});
			}

			$el.on('click.modal', e => {
				if (e.target === $el[0]) close();
			});
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

		const handleClose = (e) => {
			if (e.target === e.currentTarget) {
				e.preventDefault();
				e.stopImmediatePropagation?.();
				closeWithHistory();
			}
		};

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
					openWithHistory(title, url);
				},
				error: () => {
					$embed.empty().append("<div class='modal-error'>Failed to load content.</div>");
					modal.open();
				},
				complete: () => { ddg._ajaxModalLock = false; }
			});
		});

		modal.$el.find(`[data-modal-close="${modalId}"]`).off('click.modal').on('click.ajax', handleClose);
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

				const checkFinsweetReady = (attempt = 0) => {
					if (window.FinsweetAttributes?.load) {
						window.FinsweetAttributes.load('list');
						window.FinsweetAttributes.load('copyclip');

						const checkModulesReady = (attempt2 = 0) => {
							if (window.FinsweetAttributes.modules?.list?.restart) {
								$target.empty().append(content);
								data.ajaxHomeLoaded = true;

								ddg.scheduleFsRestart('list');
								ddg.scheduleFsRestart('copyclip');
								initModals();
								initComingSoon();

								requestAnimationFrame(() => {
									ScrollTrigger.refresh();
									if (ddg.tickerTape?.refresh) setTimeout(() => ddg.tickerTape.refresh(), 100);
								});
							} else if (attempt2 < 100) {
								setTimeout(() => checkModulesReady(attempt2 + 1), 50);
							} else {
								$target.empty().append(content);
								data.ajaxHomeLoaded = true;
								try {
									ddg.requestFsLoad('list', 'copyclip');
									ddg.scheduleFsRestart('list');
									ddg.scheduleFsRestart('copyclip');
								} catch (_) { }
								initModals();
							}
						};
						checkModulesReady();
					} else if (attempt < 100) {
						setTimeout(() => checkFinsweetReady(attempt + 1), 50);
					} else {
						$target.empty().append(content);
						data.ajaxHomeLoaded = true;
						initModals();
					}
				};
				checkFinsweetReady();
			}
		});
	};

	function initRandomiseFilters() {
		const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

		const fieldValueStrings = (field) => {
			if (!field) return [];
			const v = field.value;
			if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
			return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
		};

		let lastInstance = null;

		const resolveListInstance = () => {
			if (fsState.activeList || lastInstance) return fsState.activeList || lastInstance;

			try {
				const mod = window.FinsweetAttributes?.modules?.list;
				const candidates = mod?.instances || mod?.listInstances || mod?.__instances || [];
				if (Array.isArray(candidates) && candidates.length) return candidates[0];
			} catch (_) { }
			return null;
		};

		const randomise = (attempt = 0) => {
			const listInstance = resolveListInstance();
			if (!listInstance) {
				if (attempt === 0) log('No list instance. Loading and retrying…');

				try {
					if (data.truePath?.startsWith('/stories/') && !data.ajaxHomeLoaded) initAjaxHome();
				} catch (_) { }

				try {
					ddg.requestFsLoad('list');
					ddg.scheduleFsRestart('list');
				} catch (_) { }

				if (attempt < 50) {
					setTimeout(() => randomise(attempt + 1), 120);
				} else {
					log('Randomise aborted after waiting for list.');
				}
				return false;
			}

			const items = Array.isArray(listInstance.items?.value) ? listInstance.items.value : (Array.isArray(listInstance.items) ? listInstance.items : []);
			if (!items.length) { log('List has no items.'); return false; }

			const filtersForm = document.querySelector('[fs-list-element="filters"]');
			if (!filtersForm) { log('No filters form found.'); return false; }

			const uiByField = new Map();
			const allInputs = Array.from(filtersForm.querySelectorAll('input[type="checkbox"][fs-list-field][fs-list-value]'));
			log('Found checkbox inputs:', allInputs.length);
			allInputs.forEach((input) => {
				const label = input.closest('label');
				if (label && label.classList.contains('is-list-emptyfacet')) return;
				const key = input.getAttribute('fs-list-field');
				const val = input.getAttribute('fs-list-value');
				if (!key || !val) return;
				let map = uiByField.get(key);
				if (!map) uiByField.set(key, (map = new Map()));
				map.set(val, input);
			});
			log('Fields in UI:', Array.from(uiByField.keys()));

			const maxTries = Math.min(items.length, 50);
			let chosenFromItem = null;
			for (let attempt = 0; attempt < maxTries; attempt++) {
				const idx = rand(0, Math.max(0, items.length - 1));
				const item = items[idx];
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
					log('Using item index', idx, 'with', n, 'conditions.');
					break;
				}
			}

			if (!chosenFromItem) { log('No item found with >=2 UI-matchable fields; aborting (no fallbacks).'); return false; }
			const chosen = chosenFromItem;
			log('Chosen conditions:', chosen.map(c => ({ fieldKey: c.fieldKey, value: c.value })));

			const clearBtn = document.querySelector('[fs-list-element="clear"]');
			if (clearBtn) {
				log('Clearing via [fs-list-element="clear"]');
				clearBtn.click();
			} else {
				log('Clearing by unchecking all inputs');
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

			const apiFilters = listInstance.filters?.value;
			if (!apiFilters) { log('List filters ref not available.'); return false; }
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
					interacted: true,
				})),
			}];

			if (typeof listInstance.triggerHook === 'function') listInstance.triggerHook('filter');

			allInputs.forEach((input) => {
				input.checked = false;
				const lab = input.closest('label');
				if (lab) lab.classList.remove('is-list-active');
			});
			chosen.forEach(({ input }) => {
				input.checked = true;
				const lab = input.closest('label');
				if (lab) lab.classList.add('is-list-active');
			});
			log('Applied via API and synced UI for', chosen.length, 'conditions.');
			return true;
		};

		document.addEventListener('click', (e) => {
			const el = e.target.closest('[data-randomfilters]');
			if (!el) return;
			console.log('[randomfilters]', 'Click on [data-randomfilters]:', el);
			randomise(0);
		}, true);

		window.FinsweetAttributes = window.FinsweetAttributes || [];
		window.FinsweetAttributes.push(['list', (instances) => {
			let listArray = Array.isArray(instances) ? instances : instances?.instances || instances?.listInstances;
			if (listArray?.[0]) fsState.activeList = listArray[0];
			
			try {
				if (Array.isArray(instances) && instances.length) lastInstance = instances[0];
				else if (instances?.instances?.length) lastInstance = instances.instances[0];
				else if (instances?.listInstances?.length) lastInstance = instances.listInstances[0];
			} catch (_) { }
		}]);
	}

	ddg.boot = initSite;
})();