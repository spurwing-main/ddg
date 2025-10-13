(function () {

	// Namespace & data
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false,
		truePath: window.location.pathname,
		ajaxHomeLoaded: false
	});

	// Debug helpers
	const debug = (ddg.debug ??= {});

	const flagAccessor = (flagKey, defaultValue = false) => {
		if (typeof debug[flagKey] !== 'boolean') {
			debug[flagKey] = defaultValue;
		}
		return () => Boolean(debug[flagKey]);
	};

	const createLogger = (namespace, flagKey, defaultValue = false) => {
		const isEnabled = flagAccessor(flagKey, defaultValue);
		return (...args) => {
			if (!isEnabled()) return;
			console.log(`[ddg:${namespace}]`, ...args);
		};
	};

	// Utilities
	const debounce = (fn, wait) => {
		let timeoutId;
		return (...args) => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn(...args), wait);
		};
	};


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

		const $homeList = $('.home-list');
		const homeListEl = $homeList[0];
		if (!homeListEl) return;

		const homeListItemSelector = '.home-list_item';
		const hasListItems = () => $(homeListItemSelector).length > 0;

		const debouncedRefresh = debounce(() => ScrollTrigger.refresh(), 100);

		const observer = new MutationObserver(() => {
			debouncedRefresh();
		});
		observer.observe(homeListEl, { childList: true, subtree: true });

		if (!hasListItems()) {
			const waitObserver = new MutationObserver(() => {
				if (!hasListItems()) return;
				waitObserver.disconnect();
				requestAnimationFrame(debouncedRefresh);
			});
			waitObserver.observe(homeListEl, { childList: true, subtree: true });
		} else {
			debouncedRefresh();
		}
	};

	// Coming soon Hover Animation
	function initComingSoon() {
		const wrapperEl = document.querySelector('.home-list_list');
		if (!wrapperEl) return;

		const splitLineSel = '.home-list_split-line';
		const tapeSpeed = 5000;
		let splits = [];

		const refresh = () => {
			// clean up old
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

		// initial run
		refresh();

		const onResize = debounce(refresh, 200);
		$(window).on('resize.ddgComingSoon', onResize);

		return {
			refresh,
			destroy: () => {
				splits.forEach(s => {
					try { s.revert(); } catch (_) { }
				});
				$(window).off('resize.ddgComingSoon', onResize);
			}
		};
	}

	// Activity bar
	const initActivityBar = () => {
		const $activity = $('.activity.splide');
		const activityEl = $activity[0];
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
		// Disable custom cursor on mobile devices
		if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
		const $cursor = $('.c-cursor');
		const cursorEl = $cursor[0];
		if (!cursorEl) return;

		// Ensure cursor is always visible and has fixed positioning
		gsap.set(cursorEl, { autoAlpha: 1, position: 'fixed', top: 0, left: 0, pointerEvents: 'none' });

		// --- Hide/reveal on scroll and window leave/enter ---
		let scrollTimeout;
		let isHidden = false;

		const fadeOutCursor = () => {
			if (isHidden) return;
			gsap.to(cursorEl, { autoAlpha: 0, duration: 0.3 });
			isHidden = true;
		};

		const fadeInCursor = () => {
			if (!isHidden) return;
			gsap.to(cursorEl, { autoAlpha: 1, duration: 0.3 });
			isHidden = false;
		};

		// Improved scroll handler to fix fade glitch
		let isScrolling = false;
		$(window).on('wheel.ddgCursor', () => {
			if (!isScrolling) {
				fadeOutCursor();
				isScrolling = true;
			}
			clearTimeout(scrollTimeout);
			scrollTimeout = setTimeout(() => {
				isScrolling = false;
				setTimeout(fadeInCursor, 1000);
			}, 250);
		});

		// Hide when cursor leaves window, show when returns
		$(window).on('mouseleave.ddgCursor', fadeOutCursor);
		$(window).on('mouseenter.ddgCursor', fadeInCursor);

		const quickConfig = { duration: 0.2, ease: 'power3.out' };

		const moveX =
			gsap.quickTo?.(cursorEl, 'x', quickConfig) ||
			(value => gsap.to(cursorEl, { x: value, ...quickConfig }));

		const moveY =
			gsap.quickTo?.(cursorEl, 'y', quickConfig) ||
			(value => gsap.to(cursorEl, { y: value, ...quickConfig }));

		// Use clientX/Y instead of pageX/Y for accurate tracking regardless of scroll
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
		const modalLog = createLogger('modals', 'logModals', false);

		// Store modal instances in namespace
		ddg.modals = ddg.modals || {};
		ddg._modalsKeydownBound = Boolean(ddg._modalsKeydownBound);

		// Find all unique modal IDs from triggers and elements
		const modalIds = new Set();
		$('[data-modal-trigger], [data-modal-el]').each((_, el) => {
			const id = $(el).attr('data-modal-trigger') || $(el).attr('data-modal-el');
			if (id) modalIds.add(id);
		});

		// Initialize each modal (idempotent: skip ones we already have)
		modalIds.forEach(modalId => {
			if (ddg.modals[modalId]) {
				modalLog('skip:already-initialized', { modalId });
				return;
			}
			const $triggers = $(`[data-modal-trigger="${modalId}"]`);
			const $el = $(`[data-modal-el="${modalId}"]`);
			const $bg = $(`[data-modal-bg="${modalId}"]`);
			const $inner = $el.find('[data-modal-inner]').first();
			const $closeButtons = $(`[data-modal-close="${modalId}"]`);

			if (!$el.length) {
				modalLog('warn:no-modal-el', { modalId });
				return;
			}

			const elNode = $el[0];
			const $animTarget = $inner.length ? $inner : $el;

				// Get all descendants for is-open class
				const getAllElements = () => $el.find('*').addBack();

				// Initial state sync: if modal starts open, ensure every
				// descendant (and background) has `is-open`. If closed, strip any
				// stray `is-open` classes from descendants and bg to avoid stale state.
				if ($el.hasClass('is-open')) {
					if ($bg.length) $bg.addClass('is-open');
					getAllElements().addClass('is-open');
				} else {
					if ($bg.length) $bg.removeClass('is-open');
					getAllElements().removeClass('is-open');
				}

			// Position management (removed - no positioning needed)
			// Animation functions...

			// Open animation
			const open = (options = {}) => {
				const { skipAnimation = false, beforeOpen = null, afterOpen = null } = options;

				// Close other modals first
				Object.keys(ddg.modals).forEach(otherId => {
					if (otherId !== modalId && ddg.modals[otherId]?.isOpen?.()) {
						ddg.modals[otherId].close({ skipAnimation: true });
					}
				});

				// Callback before opening
				if (beforeOpen && typeof beforeOpen === 'function') {
					beforeOpen();
				}

				// Add is-open to ALL elements (bg, el, descendants) BEFORE animation
				if ($bg.length) $bg.addClass('is-open');
				getAllElements().addClass('is-open');

				modalLog('open:start', { modalId, skipAnimation });

				// Kill any existing animations
				gsap.killTweensOf($animTarget[0]);

				if (skipAnimation) {
					gsap.set($animTarget[0], { opacity: 1, y: 0 });
					modalLog('open:complete-no-animation', { modalId });
					if (afterOpen && typeof afterOpen === 'function') {
						afterOpen();
					}
					return;
				}

				// Animate
				gsap.fromTo($animTarget[0],
					{ y: 60, opacity: 0 },
					{
						y: 0,
						opacity: 1,
						duration: 0.6,
						ease: 'power2.out',
						onComplete: () => {
							modalLog('open:complete', { modalId });
							if (afterOpen && typeof afterOpen === 'function') {
								afterOpen();
							}
						}
					}
				);
			};

			// Close animation
			const close = (options = {}) => {
				const { skipAnimation = false, beforeClose = null, afterClose = null } = options;

				// Callback before closing
				if (beforeClose && typeof beforeClose === 'function') {
					beforeClose();
				}

				// Remove is-open from bg FIRST
				if ($bg.length) $bg.removeClass('is-open');

				modalLog('close:start', { modalId, skipAnimation });

				// Kill any existing animations
				gsap.killTweensOf($animTarget[0]);

				const cleanup = () => {
					// Remove is-open from el and descendants AFTER animation
					getAllElements().removeClass('is-open');
					modalLog('close:complete', { modalId });
					if (afterClose && typeof afterClose === 'function') {
						afterClose();
					}
				};

				if (skipAnimation) {
					gsap.set($animTarget[0], { opacity: 0, y: 60 });
					cleanup();
					return;
				}

				// Animate then cleanup
				gsap.to($animTarget[0], {
					y: 60,
					opacity: 0,
					duration: 0.6,
					ease: 'power2.out',
					onComplete: cleanup
				});
			};

			// Check if open
			const isOpen = () => $el.hasClass('is-open');

			// Store instance API
			ddg.modals[modalId] = {
				open,
				close,
				isOpen,
				$el,
				$bg,
				$triggers
			};

			// Event handlers - use delegation for dynamically added triggers
			const isAjaxModal = $triggers.first().is('[data-ajax-modal="link"]');

			if (!isAjaxModal) {
				$(document).on('click', `[data-modal-trigger="${modalId}"]`, e => {
					e.preventDefault();
					open();
					modalLog('trigger:click', { modalId });
				});
			}

			// Close button
			$closeButtons.on('click.modal', e => {
				e.preventDefault();
				e.stopImmediatePropagation();
				close();
				modalLog('close-button:click', { modalId });
			});

			// Background click to close - handle both sibling and child backgrounds
			if ($bg.length) {
				$bg.on('click.modal', e => {
					if (e.target === $bg[0]) {
						close();
						modalLog('background:click', { modalId });
					}
				});
			}

			// Modal element click to close (if click is directly on modal container, not its children)
			$el.on('click.modal', e => {
				if (e.target === elNode) {
					close();
					modalLog('modal-container:click', { modalId });
				}
			});

			modalLog('init:complete', { modalId, isAjaxModal });
		});

		// Single escape key handler for ALL modals (bind once)
		if (!ddg._modalsKeydownBound) {
			ddg._modalsKeydownBound = true;
			$(document).on('keydown.modals', e => {
			if (e.key === 'Escape') {
				// Find which modal is open and close it
				Object.keys(ddg.modals).forEach(modalId => {
					if (ddg.modals[modalId].isOpen()) {
						ddg.modals[modalId].close();
						modalLog('escape:press', { modalId });
					}
				});
			}
			});
		}

		modalLog('init:all-complete', { count: modalIds.size });
	};

	// Ajax Modal
	const initAjaxModal = () => {
		const modalLog = createLogger('ajax-modal', 'ajaxModalLogs', true);
		modalLog('init:start');

		const modalId = 'story'; // The modal ID for ajax modal
		const $embed = $('[data-ajax-modal="embed"]');
		const contentSelector = '[data-ajax-modal="content"]';

		// Wait for generic modal to initialize
		if (!ddg.modals || !ddg.modals[modalId]) {
			modalLog('error:modal-not-initialized', { modalId });
			return;
		}

		const modal = ddg.modals[modalId];
		const homeTitle = document.title;

		// Open with history management
		const openWithHistory = (title, url) => {
			// Open the modal (generic system handles animation)
			modal.open({
				afterOpen: () => {
					// Update history and title after animation
					if (title && url) {
						document.title = title;
						window.history.pushState({ modal: true }, '', url);
						// Note: truePath stays as '/' because this is a modal overlay
						modalLog('history:push', { title, url });
					}
				}
			});
		};

		// Close with history management
		const closeWithHistory = () => {
			// Close the modal (generic system handles animation)
			modal.close({
				beforeClose: () => {
					// Reset title and URL
					document.title = homeTitle;
					window.history.pushState({ modal: false }, '', '/');
					modalLog('history:push-home');
				}
			});
		};

		// AJAX link click handler - use delegation to work with dynamically injected content
		$(document).on('click', '[data-ajax-modal="link"]', e => {
			e.preventDefault();
			const $link = $(e.currentTarget);
			const linkUrl = $link.attr('href');

			modalLog('link:click', { href: linkUrl });

			$.ajax({
				url: linkUrl,
				success: (response) => {
					const $content = $(response).find(contentSelector);
					const title = $(response).filter('title').text();
					const url = new URL(linkUrl, window.location.origin).href;

					// Inject content
					$embed.empty().append($content);

					// Open modal with history
					openWithHistory(title, url);

					modalLog('ajax:success', {
						href: linkUrl,
						title,
						url,
						contentFound: Boolean($content.length)
					});
				},
				error: () => {
					modalLog('ajax:error', { href: linkUrl });
					$embed.empty().append("<div class='modal-error'>Failed to load content.</div>");
					modal.open();
				}
			});
		});

		// Override close button behavior to use history
		const $closeButtons = modal.$el.find(`[data-modal-close="${modalId}"]`);
		$closeButtons.off('click.modal').on('click.ajax', e => {
			e.preventDefault();
			e.stopImmediatePropagation();
			closeWithHistory();
			modalLog('close-button:click-override');
		});

		// Override background click to use history
		if (modal.$bg.length) {
			modal.$bg.off('click.modal').on('click.ajax', e => {
				if (e.target === modal.$bg[0]) {
					closeWithHistory();
					modalLog('background:click-override');
				}
			});
		}

		// Override escape key for this modal
		$(document).off('keydown.modals').on('keydown.modals', e => {
			if (e.key === 'Escape') {
				Object.keys(ddg.modals).forEach(id => {
					if (ddg.modals[id].isOpen()) {
						if (id === modalId) {
							closeWithHistory();
						} else {
							ddg.modals[id].close();
						}
						modalLog('escape:press-override', { id });
					}
				});
			}
		});

		// Override modal container click to use history
		if (modal.$el.length) {
			modal.$el.off('click.modal').on('click.ajax', e => {
				if (e.target === modal.$el[0]) {
					closeWithHistory();
					modalLog('modal-container:click-override');
				}
			});
		}

		// Popstate handler - browser back/forward
		window.addEventListener('popstate', e => {
			const state = e.state || {};

			if (state.modal) {
				// Opening via popstate - skip animation
				modal.open({ skipAnimation: true });
				modalLog('popstate:open', { state });
			} else {
				// Closing via popstate - skip animation
				modal.close({ skipAnimation: true });
				modalLog('popstate:close', { state });
			}
		});

		// Direct URL detection on load - /story/ paths
		if (window.location.pathname.startsWith('/story/')) {
			// This is a true story page load (not a modal)
			// truePath is already set correctly in data initialization
			modal.open({ skipAnimation: true });
			window.history.replaceState({ modal: true }, '', window.location.href);
			modalLog('init:story-path', { path: window.location.pathname, truePath: data.truePath });
		}

		modalLog('init:complete');
	};

	// Ajax Home
	const initAjaxHome = () => {
		console.log('[ajaxHome] init', { truePath: data.truePath, ajaxHomeLoaded: data.ajaxHomeLoaded });
		
		// Only run once
		if (data.ajaxHomeLoaded) {
			console.log('[ajaxHome] skip - already loaded');
			return;
		}
		
		// Only run on true story pages (not modal overlays)
		if (!data.truePath.startsWith('/stories/')) {
			console.log('[ajaxHome] skip - not story path');
			return;
		}

		const $target = $('[data-ajax-home="target"]');
		console.log('[ajaxHome] target found:', $target.length);
		
		if (!$target.length) {
			// Nothing to inject, but signal completion so dependents can continue
			document.dispatchEvent(new CustomEvent('homeAjax:done'));
			return;
		}

		console.log('[ajaxHome] fetching home page');
		
		$.ajax({
			url: '/',
			success: (response) => {
				console.log('[ajaxHome] response received');
				const $html = $('<div>').append($.parseHTML(response));
				const $source = $html.find('[data-ajax-home="source"]');
				
				console.log('[ajaxHome] source found:', $source.length);
				
				if ($source.length) {
					const content = $source.html();
					console.log('[ajaxHome] preparing to inject, length:', content.length);

					// Wait for Attributes runtime to be ready, then load List, then inject
					const waitFor = (test, { interval = 50, max = 200 } = {}) => new Promise((resolve, reject) => {
						let tries = 0;
						const id = setInterval(() => {
							tries += 1;
							if (test()) { clearInterval(id); resolve(true); }
							else if (tries >= max) { clearInterval(id); reject(new Error('timeout')); }
						}, interval);
					});

					waitFor(() => window.FinsweetAttributes && typeof window.FinsweetAttributes.load === 'function')
						.then(() => { window.FinsweetAttributes.load('list'); window.FinsweetAttributes.load('modal'); })
						.then(() => waitFor(() => {
							const m = window.FinsweetAttributes.modules || {};
							return m.list && typeof m.list.restart === 'function' && m.modal && typeof m.modal.restart === 'function';
						}))
						.then(() => {
							$target.empty().append(content);
							data.ajaxHomeLoaded = true;
							console.log('[ajaxHome] injection complete');

							// Rebind Finsweet modules to injected DOM
							window.FinsweetAttributes.modules.list.restart();
							window.FinsweetAttributes.modules.modal.restart();
							// Initialize site modals for newly injected elements
							initModals();

							// Signal sitewide that Ajax Home is done
							document.dispatchEvent(new CustomEvent('homeAjax:done'));

							// Re-initialize features that depend on the injected content
							initComingSoon();
							initPageProgress();

							// Refresh ScrollTrigger after content injection
							requestAnimationFrame(() => {
								ScrollTrigger.refresh();
								console.log('[ajaxHome] ScrollTrigger refreshed');
							});
						})
						.catch(() => {
							// If Attributes is somehow not ready, still inject to avoid blank UI
							$target.empty().append(content);
							data.ajaxHomeLoaded = true;
							console.warn('[ajaxHome] injected without Finsweet List restart');
							// Initialize site modals even if Attributes not ready
							initModals();
							document.dispatchEvent(new CustomEvent('homeAjax:done'));
						});
				} else {
					console.log('[ajaxHome] no source element found on home page');
					// Treat as complete to avoid blocking dependents
					document.dispatchEvent(new CustomEvent('homeAjax:done'));
				}
			},
			error: (xhr, status, error) => {
				console.error('[ajaxHome] fetch failed:', status, error);
				// Still signal completion so downstream can proceed
				document.dispatchEvent(new CustomEvent('homeAjax:done'));
			}
		});
		};

	// Randomise Filters
	function initRandomiseFilters() {
		// Require a trigger element to exist on the page
		const triggerExists = !!document.querySelector('[data-randomfilters]');
		if (!triggerExists) return;
		// Utilities
		const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
		const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);

		// Build an index of the Filters UI so we can set inputs programmatically
		const indexFiltersUI = () => {
			const forms = Array.from(document.querySelectorAll('[fs-list-element="filters"]'));
			const index = new Map();

			forms.forEach((form) => {
				const els = form.querySelectorAll('[fs-list-field]');
				els.forEach((el) => {
					const raw = el.getAttribute('fs-list-field') || '';
					const fieldKeys = raw.split(',').map(s => s.trim()).filter(Boolean);
					const tag = el.tagName.toLowerCase();
					const type = (el.getAttribute('type') || '').toLowerCase();

					fieldKeys.forEach((key) => {
						if (!key || key === '*') return; // skip catch‑all search

						const entry = index.get(key) || {
							checkboxes: [], radios: [], select: null, text: [], valuesMap: new Map(), selectValues: new Set(), forms: new Set()
						};
						entry.forms.add(form);

						if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
							const val = el.getAttribute('fs-list-value') ?? el.value ?? '';
							if (val) entry.valuesMap.set(val, el);
							if (type === 'checkbox') entry.checkboxes.push(el);
							if (type === 'radio') entry.radios.push(el);
						} else if (tag === 'select') {
							entry.select = el;
							Array.from(el.options).forEach(opt => entry.selectValues.add(opt.value));
						} else if (tag === 'input') {
							entry.text.push(el);
						}

						index.set(key, entry);
					});
				});
			});

			return index;
		};

		// Access list items safely across potential versions
		const getItemsArray = (listInstance) => {
			if (!listInstance) return [];
			if (Array.isArray(listInstance.items)) return listInstance.items;
			if (Array.isArray(listInstance.items?.value)) return listInstance.items.value;
			return [];
		};

		// Read an item's field map; fall back to DOM when needed
		const getItemFields = (item) => {
			if (item?.fields) return item.fields; // expected shape: { [key]: { value } }

			const map = {};
			const root = item?.element;
			if (!root) return map;

			root.querySelectorAll('[fs-list-field]').forEach((el) => {
				const key = el.getAttribute('fs-list-field');
				if (!key || key === '*') return;
				const vAttr = el.getAttribute('fs-list-value');
				const txt = (el.textContent || '').trim();
				const raw = vAttr ?? txt;
				const values = raw.split(',').map(s => s.trim()).filter(Boolean);
				map[key] = { value: values.length > 1 ? values : (values[0] ?? '') };
			});

			return map;
		};

		// Clear filters: prefer native Clear element, else reset forms
		const clearFilters = (uiIndex) => {
			const clearBtn = document.querySelector('[fs-list-element="clear"]');
			if (clearBtn) { clearBtn.click(); return; }

			const forms = new Set();
			for (const [, entry] of uiIndex) entry.forms.forEach(f => forms.add(f));

			forms.forEach((form) => {
				form.reset();
				form.querySelectorAll('[fs-list-field]').forEach((el) => {
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
				});
			});
		};

		// Apply one field/value to the UI
		const applyOne = (uiEntry, value, formsToSubmit) => {
			if (!uiEntry) return false;
			// Checkbox/Radio mapped by fs-list-value
			if (uiEntry.valuesMap.has(value)) {
				const input = uiEntry.valuesMap.get(value);
				if (input.type === 'checkbox' || input.type === 'radio') {
					input.checked = true;
					input.dispatchEvent(new Event('input', { bubbles: true }));
					input.dispatchEvent(new Event('change', { bubbles: true }));
					const form = input.closest('form');
					if (form && form.getAttribute('fs-list-filteron') === 'submit') formsToSubmit.add(form);
					return true;
				}
			}
			// Select
			if (uiEntry.select && uiEntry.selectValues.has(value)) {
				uiEntry.select.value = value;
				uiEntry.select.dispatchEvent(new Event('change', { bubbles: true }));
				const form = uiEntry.select.closest('form');
				if (form && form.getAttribute('fs-list-filteron') === 'submit') formsToSubmit.add(form);
				return true;
			}
			return false;
		};

		// When Finsweet List is ready, perform the randomisation
		const run = (listInstances) => {
			const [listInstance] = listInstances || [];
			if (!listInstance) return;

			const uiIndex = indexFiltersUI();
			const items = getItemsArray(listInstance);
			if (!items.length) return;

			const randomItem = items[randInt(0, items.length - 1)];
			const fieldsMap = getItemFields(randomItem);

			// Build candidate field/value pairs that actually exist in the UI
			const candidates = [];
			for (const [key, uiEntry] of uiIndex) {
				const data = fieldsMap[key];
				if (!data) continue;

				let values = Array.isArray(data.value) ? data.value : [data.value];
				values = values.flatMap(v => String(v).split(',')).map(s => s.trim()).filter(Boolean);

				const allowed = values.filter(v => uiEntry.valuesMap.has(v) || (uiEntry.select && uiEntry.selectValues.has(v)));
				if (!allowed.length) continue;

				const chosen = allowed[randInt(0, allowed.length - 1)];
				candidates.push({ key, value: chosen, uiEntry });
			}

			if (!candidates.length) return;

			shuffle(candidates);
			const howMany = randInt(2, Math.min(5, candidates.length));
			const chosenPairs = candidates.slice(0, howMany);

			clearFilters(uiIndex);

			const formsToSubmit = new Set();
			chosenPairs.forEach(({ value, uiEntry }) => applyOne(uiEntry, value, formsToSubmit));

			formsToSubmit.forEach((form) => {
				if (form.requestSubmit) form.requestSubmit();
				else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
			});
		};

		// Queue via Finsweet Attributes API so it runs when List is loaded
		window.FinsweetAttributes = window.FinsweetAttributes || [];
		window.FinsweetAttributes.push(['list', run]);
	}

	// Boot 🚀
	ddg.boot = initSite;
})();
