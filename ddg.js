(function () {

	// Namespace & data
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false,
		truePath: window.location.pathname,
		ajaxHomeLoaded: false
	});


	// Boot
	const initSite = () => {
		if (data.siteBooted) return;
		data.siteBooted = true;

		initAjaxHome();

		// Ensure Finsweet List loads deterministically after page + Ajax
		setupFinsweetListLoader();

		initNavigation();
		initPageProgress();
		initComingSoon();
		initActivityBar();
		initCustomCursor();
		initShare();
		initRandomiseFilters();

		initModals();
		initAjaxModal();
	};

	// Finsweet List: simple programmatic load
	const setupFinsweetListLoader = () => {
		window.FinsweetAttributes = window.FinsweetAttributes || [];

		// On story index pages, List is loaded inside Ajax Home before embed.
		if (data.truePath.startsWith('/stories/')) return;

		const loadAll = () => {
			window.FinsweetAttributes.load('list');
			window.FinsweetAttributes.load('copyclip');
		};

		if (document.readyState === 'complete') loadAll();
		else window.addEventListener('load', loadAll, { once: true });
	};

	// Navigation: hide/reveal header on scroll
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
				const y = window.scrollY;
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

	// Page progress bar
	const initPageProgress = () => {
		const progressBarEl = $('.page-progress_bar')[0];
		if (!progressBarEl) return;

		gsap.set(progressBarEl, { scaleX: 0 });

		gsap.to(progressBarEl, {
			scaleX: 1,
			ease: 'none',
			scrollTrigger: {
				trigger: document.body,
				start: 'top top',
				end: 'bottom bottom',
				scrub: 0.75
			}
		});

		const homeListEl = $('.home-list')[0];
		if (!homeListEl) return;

		let debounceTimer;
		const debouncedRefresh = () => {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => ScrollTrigger.refresh(), 100);
		};

		const observer = new MutationObserver(debouncedRefresh);
		observer.observe(homeListEl, { childList: true, subtree: true });
		debouncedRefresh();
	};

	// Coming soon Hover Animation
	function initComingSoon() {
		const wrapperEl = document.querySelector('.home-list_list');
		if (!wrapperEl) return;

		const splitLineSel = '.home-list_split-line';
		const tapeSpeed = 5000;
		let splits = [];

		const refresh = () => {
			splits.forEach(s => {
				try { s.revert(); } catch (e) { }
			});
			splits = [];
			wrapperEl
				.querySelectorAll('.home-list_item-wrap[data-story-status="coming-soon"] .home-list_item')
				.forEach(el => {
					let split;
					try {
						split = SplitText.create(el, {
							type: 'lines',
							autoSplit: true,
							tag: 'span',
							linesClass: 'home-list_split-line'
						});
					} catch (e) {
						console.warn('SplitText error', e);
						return;
					}
					splits.push(split);

					const $el = $(el);
					$el
						.on('mouseenter.ddgComingSoon', () => animate(el, 0))
						.on('mouseleave.ddgComingSoon', () => animate(el, '100%'));
					if (el.tagName === 'A') {
						$el.one('click.ddgComingSoon', e => e.preventDefault());
					}
				});
		};

		const animate = (el, offset) => {
			const lines = el.querySelectorAll(splitLineSel);
			if (!lines.length) return;
			gsap.killTweensOf(lines);
			gsap.to(lines, {
				'--home-list--tape-r': offset,
				duration: (_, l) => l.offsetWidth / tapeSpeed,
				ease: 'linear'
			});
		};

		refresh();

		let resizeTimer;
		$(window).on('resize.ddgComingSoon', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(refresh, 200);
		});
	}

	// Activity bar
	const initActivityBar = () => {
		const activityEl = $('.activity.splide')[0];
		if (!activityEl) return;

		const splide = new Splide(activityEl, {
			type: 'loop',
			perPage: 'auto',
			perMove: 1,
			gap: '0',
			autoplay: false,
			autoScroll: {
				speed: 1,
				pauseOnHover: true
			},
			arrows: false,
			pagination: false,
			drag: true,
			clones: 5
		});

		splide.mount(window.splide.Extensions);
	};

	// Custom cursor
	const initCustomCursor = () => {
		if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
		
		const cursorEl = $('.c-cursor')[0];
		if (!cursorEl) return;

		gsap.set(cursorEl, { autoAlpha: 1, position: 'fixed', top: 0, left: 0, pointerEvents: 'none' });

		let scrollTimeout;

		$(window).on('wheel.ddgCursor', () => {
			gsap.to(cursorEl, { autoAlpha: 0, duration: 0.3 });
			clearTimeout(scrollTimeout);
			scrollTimeout = setTimeout(() => {
				setTimeout(() => gsap.to(cursorEl, { autoAlpha: 1, duration: 0.3 }), 1000);
			}, 250);
		});

		$(window).on('mouseleave.ddgCursor', () => {
			gsap.to(cursorEl, { autoAlpha: 0, duration: 0.3 });
		});

		$(window).on('mouseenter.ddgCursor', () => {
			gsap.to(cursorEl, { autoAlpha: 1, duration: 0.3 });
		});

		const moveX = gsap.quickTo(cursorEl, 'x', { duration: 0.2, ease: 'power3.out' });
		const moveY = gsap.quickTo(cursorEl, 'y', { duration: 0.2, ease: 'power3.out' });

		$(window).on('mousemove.ddgCursor', event => {
			moveX(event.clientX);
			moveY(event.clientY);
		});
	};

	// Share Buttons. Sends to webhook and opens share URL
	const initShare = () => {
		const shareItemSelector = '[data-share]';
		const shareCountdownSelector = '[data-share-countdown]';
		const $shareItems = $(shareItemSelector);
		if (!$shareItems.length) return;

		const shareWebhookUrl =
			'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';

		const dailyShareKey = 'share_done_date';
		const shareOpenTarget = '_blank';

		const $doc = $(document);
		const eventNamespace = '.ddgShare';

		// date helpers
		const todayString = () => new Date().toISOString().slice(0, 10);
		const nextMidnight = () => {
			const date = new Date();
			date.setHours(24, 0, 0, 0);
			return date;
		};

		// cookie helpers
		const setCookieValue = (name, value, expiresAt) => {
			document.cookie = `${name}=${value}; expires=${expiresAt.toUTCString()}; path=/; SameSite=Lax`;
		};

		const getCookieValue = name => {
			const cookiePair =
				document.cookie.split('; ').find(row => row.startsWith(name + '=')) ||
				'';
			return cookiePair.split('=')[1] || null;
		};

		// data helpers
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
			x: ({ url, text }) =>
				`https://twitter.com/intent/tweet?text=${encodeURIComponent(
					text
				)}&url=${encodeURIComponent(url)}`,
			facebook: ({ url }) =>
				`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
			linkedin: ({ url }) =>
				`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
					url
				)}`,
			whatsapp: ({ url, text }) =>
				`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
			messenger: ({ url }) =>
				`https://www.messenger.com/t/?link=${encodeURIComponent(url)}`,
			snapchat: ({ url }) =>
				`https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`,
			instagram: () => 'https://www.instagram.com/',
			telegram: ({ url, text }) =>
				`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
					text
				)}`
		};

		const platformAlias = { twitter: 'x' };

		// countdown decrement utility
		const decrementCountdown = () => {
			const $countdownElements = $(shareCountdownSelector);
			$countdownElements.each((_, element) => {
				const $element = $(element);
				let remaining = parseInt(
					element.getAttribute('data-share-countdown') ||
					$element.text() ||
					$element.val(),
					10
				);
				if (!Number.isFinite(remaining)) remaining = 0;
				const nextValue = Math.max(0, remaining - 1);
				$element.attr('data-share-countdown', nextValue);
				if ($element.is('input, textarea')) {
					$element.val(nextValue);
				} else {
					$element.text(nextValue);
				}
			});
		};

		// basic "human intent" heuristics
		const shareStartTimestamp = Date.now();
		let pointerTravel = 0;
		let lastPointerPosition = null;

		$doc.on(`pointermove${eventNamespace}`, event => {
			const { clientX, clientY } = event;

			if (!lastPointerPosition) {
				lastPointerPosition = [clientX, clientY];
				return;
			}

			pointerTravel += Math.hypot(
				clientX - lastPointerPosition[0],
				clientY - lastPointerPosition[1]
			);
			lastPointerPosition = [clientX, clientY];
		});

		const heuristicsSatisfied = () =>
			Date.now() - shareStartTimestamp > 1500 &&
			pointerTravel > 120 &&
			document.hasFocus();

		// webhook (via hidden form + iframe to avoid CORS headaches)
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

				[
					['platform', platform],
					['date', todayString()]
				].forEach(([name, value]) => {
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

		// click handler
		$doc.on(`click${eventNamespace}`, shareItemSelector, event => {
			const $target = $(event.currentTarget);
			event.preventDefault();

			const platformKey = ($target.data('share') || '').toString().toLowerCase();
			const normalizedPlatform = (platformAlias[platformKey] || platformKey).toLowerCase();

			const shareUrl = $target.data('share-url') || window.location.href;
			const shareText = $target.data('share-text') || document.title;

			const resolver = shareUrlMap[normalizedPlatform];
			const destination = resolver
				? resolver({ url: shareUrl, text: shareText })
				: shareUrl;

			const sharewindow = window.open('about:blank', shareOpenTarget);

			if (!heuristicsSatisfied()) {
				sharewindow?.close();
				// eslint-disable-next-line no-console
				console.warn('[share] blocked');
				return;
			}

			decrementCountdown();

			if (!alreadySharedToday()) {
				sendShareWebhook(normalizedPlatform).then(() =>
					// eslint-disable-next-line no-console
					console.log('[share] webhook sent')
				);
				markShareComplete();
			} else {
				// eslint-disable-next-line no-console
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

	// Modals
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

			const elNode = $el[0];
			const $animTarget = $inner.length ? $inner : $el;

			// Initial state sync
			if ($el.hasClass('is-open')) {
				if ($bg.length) $bg.addClass('is-open');
			} else {
				if ($bg.length) $bg.removeClass('is-open');
				$el.removeClass('is-open');
			}

			const open = (options = {}) => {
				const { skipAnimation = false, beforeOpen = null, afterOpen = null } = options;

				// Close other modals first
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

			$closeButtons.on('click.modal', e => {
				e.preventDefault();
				e.stopImmediatePropagation();
				close();
			});

			if ($bg.length) {
				$bg.on('click.modal', e => {
					if (e.target === $bg[0]) close();
				});
			}

			$el.on('click.modal', e => {
				if (e.target === elNode) close();
			});
		});

		if (!ddg._modalsKeydownBound) {
			ddg._modalsKeydownBound = true;
			$(document).on('keydown.modals', e => {
				if (e.key === 'Escape') {
					Object.keys(ddg.modals).forEach(modalId => {
						if (ddg.modals[modalId].isOpen()) {
							ddg.modals[modalId].close();
						}
					});
				}
			});
		}
	};

	// Ajax Modal
	const initAjaxModal = () => {
		if (ddg._ajaxModalInitialized) return;
		ddg._ajaxModalInitialized = true;

		const modalId = 'story';
		const $embed = $('[data-ajax-modal="embed"]');
		const contentSelector = '[data-ajax-modal="content"]';
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

			$.ajax({
				url: linkUrl,
				success: (response) => {
					const $content = $(response).find(contentSelector);
					const title = $(response).filter('title').text();
					const url = new URL(linkUrl, window.location.origin).href;

					$embed.empty().append($content);
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
		
		if (modal.$bg.length) {
			modal.$bg.off('click.modal').on('click.ajax', handleClose);
		}

		if (modal.$el.length) {
			modal.$el.off('click.modal').on('click.ajax', handleClose);
		}

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

		window.addEventListener('popstate', e => {
			const state = e.state || {};
			if (state.modal) {
				modal.open({ skipAnimation: true });
			} else {
				modal.close({ skipAnimation: true });
			}
		});

		if (window.location.pathname.startsWith('/story/')) {
			modal.open({ skipAnimation: true });
			window.history.replaceState({ modal: true }, '', window.location.href);
		}
	};

	// Ajax Home
	const initAjaxHome = () => {
		if (data.ajaxHomeLoaded) return;
		if (!data.truePath.startsWith('/stories/')) return;

		const $target = $('[data-ajax-home="target"]');
		if (!$target.length) return;
		
		$.ajax({
			url: '/',
			success: (response) => {
				const $html = $('<div>').append($.parseHTML(response));
				const $source = $html.find('[data-ajax-home="source"]');
				
				if (!$source.length) return;

				const content = $source.html();
				
				// Simple check with fallback
				const checkFinsweetReady = (attempt = 0) => {
					if (window.FinsweetAttributes && typeof window.FinsweetAttributes.load === 'function') {
						window.FinsweetAttributes.load('list');
						window.FinsweetAttributes.load('copyclip');
						
						const checkModulesReady = (attempt2 = 0) => {
							if (window.FinsweetAttributes.modules?.list?.restart) {
								$target.empty().append(content);
								data.ajaxHomeLoaded = true;

								window.FinsweetAttributes.modules.list.restart();
								window.FinsweetAttributes.modules.copyclip?.restart?.();
								initModals();
								initComingSoon();
								initPageProgress();

								requestAnimationFrame(() => ScrollTrigger.refresh());
							} else if (attempt2 < 100) {
								setTimeout(() => checkModulesReady(attempt2 + 1), 50);
							} else {
								// Fallback: inject anyway
								$target.empty().append(content);
								data.ajaxHomeLoaded = true;
								initModals();
							}
						};
						checkModulesReady();
					} else if (attempt < 100) {
						setTimeout(() => checkFinsweetReady(attempt + 1), 50);
					} else {
						// Fallback: inject anyway
						$target.empty().append(content);
						data.ajaxHomeLoaded = true;
						initModals();
					}
				};
				checkFinsweetReady();
			}
		});
	};

    // Randomise Filters (single list, API-only, 2–5 conditions from a single item)
    function initRandomiseFilters() {
        const log = (...args) => { try { console.log('[randomfilters]', ...args); } catch (_) {} };
        const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

        const fieldValueStrings = (field) => {
            if (!field) return [];
            const v = field.value;
            if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
            return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        };

        let lastInstance = null; // updated via API callback; also try modules.list.instances at runtime

        const getActiveListInstance = () => {
            const mod = window.FinsweetAttributes?.modules?.list;
            if (mod) {
                const arr = Array.isArray(mod.instances) ? mod.instances : (Array.isArray(mod.instances?.value) ? mod.instances.value : null);
                if (arr && arr.length) return arr[0];
            }
            return lastInstance;
        };

        const randomise = () => {
            const listInstance = getActiveListInstance();
            if (!listInstance) {
                log('No list instance. Loading and retrying…');
                try { if (window.FinsweetAttributes?.load) window.FinsweetAttributes.load('list'); } catch (_) {}
                setTimeout(() => randomise(), 100);
                return false;
            }

            const items = Array.isArray(listInstance.items?.value) ? listInstance.items.value : (Array.isArray(listInstance.items) ? listInstance.items : []);
            if (!items.length) { log('List has no items.'); return false; }

            const filtersForm = document.querySelector('[fs-list-element="filters"]');
            if (!filtersForm) { log('No filters form found.'); return false; }

            // Build UI index: available checkbox values per field (skip empty facets)
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

            // Try random items until we find one with >= 2 UI-matchable fields
            const maxTries = Math.min(items.length, 50);
            let chosenFromItem = null;
            for (let attempt = 0; attempt < maxTries; attempt++) {
                const idx = rand(0, Math.max(0, items.length - 1));
                const item = items[idx];
                const fieldsEntries = Object.entries(item?.fields || {});
                if (!fieldsEntries.length) continue;

                // For this item, pick at most one random value per field that exists in UI
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
                    // Choose 2–5 conditions from this item
                    for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
                    const n = rand(2, Math.min(5, candidates.length));
                    chosenFromItem = candidates.slice(0, n);
                    log('Using item index', idx, 'with', n, 'conditions.');
                    break;
                }
            }

            if (!chosenFromItem) { log('No item found with >=2 UI-matchable fields; aborting (no fallbacks).'); return false; }
            const chosen = chosenFromItem;
            log('Chosen conditions:', chosen.map(c => ({ fieldKey: c.fieldKey, value: c.value })));

            // Prefer built-in clear if available to let Attributes handle state
            const clearBtn = document.querySelector('[fs-list-element="clear"]');
            if (clearBtn) {
                log('Clearing via [fs-list-element="clear"]');
                clearBtn.click();
            } else {
                // Uncheck all currently-checked inputs and emit events so Attributes updates state
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

            // Apply via API (reactive filters) to guarantee match to selected item
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

            // Trigger the filtering phase explicitly
            if (typeof listInstance.triggerHook === 'function') listInstance.triggerHook('filter');

            // Sync UI to reflect applied conditions (quietly; no events)
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

        // Click handler: any element with data-randomfilters triggers randomisation on the single list
        document.addEventListener(
            'click',
            (e) => {
                const el = e.target.closest('[data-randomfilters]');
                if (!el) return;
                log('Click on [data-randomfilters]:', el);

                const ok = randomise();
                if (!ok) log('Randomise aborted.');
            },
            true // capture phase to run before modal close handlers
        );

        // Capture the single list instance via v2 API
        window.FinsweetAttributes = window.FinsweetAttributes || [];
        window.FinsweetAttributes.push([
            'list',
            (instances) => {
                if (Array.isArray(instances) && instances.length) lastInstance = instances[0];
            },
        ]);
    }

	// Boot 🚀
	ddg.boot = initSite;
})();
