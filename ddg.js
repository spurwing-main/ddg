(function () {

	// Namespace & data
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false
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
			if (typeof console?.log === 'function') {
				console.log(`[ddg:${namespace}]`, ...args);
			}
		};
	};

	// Utilities
	const $j = window.$;
	const $win = $j(window);

	const debounce = (fn, wait) => {
		let timeoutId;
		return function (...args) {
			const context = this;
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(context, args), wait);
		};
	};


	// Boot
	const initSite = () => {
		if (data.siteBooted) return;
		data.siteBooted = true;

		initNavigation();
		initPageProgress();
		initComingSoon();
		initActivityBar();
		initCustomCursor();
		initShare();
		initModals();
		initAjaxModal();
	};

	// Navigation: hide/reveal header on scroll
	const initNavigation = () => {
		const navEl = $j('.nav')[0];
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
		const progressBarEl = $j('.page-progress_bar')[0];
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

		const $homeList = $j('.home-list');
		const homeListEl = $homeList[0];
		if (!homeListEl) return;

		const homeListItemSelector = '.home-list_item';
		const hasListItems = () => $j(homeListItemSelector).length > 0;

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

					const $el = $j(el);
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
		$j(window).on('resize.ddgComingSoon', onResize);

		return {
			refresh,
			destroy: () => {
				splits.forEach(s => {
					try { s.revert(); } catch (_) { }
				});
				$j(window).off('resize.ddgComingSoon', onResize);
			}
		};
	}

	// Activity bar
	const initActivityBar = () => {
		const $activity = $j('.activity.splide');
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
		const $cursor = $j('.c-cursor');
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
		$win.on('wheel.ddgCursor', () => {
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
		$win.on('mouseleave.ddgCursor', fadeOutCursor);
		$win.on('mouseenter.ddgCursor', fadeInCursor);

		const quickConfig = { duration: 0.2, ease: 'power3.out' };

		const moveX =
			gsap.quickTo?.(cursorEl, 'x', quickConfig) ||
			(value => gsap.to(cursorEl, { x: value, ...quickConfig }));

		const moveY =
			gsap.quickTo?.(cursorEl, 'y', quickConfig) ||
			(value => gsap.to(cursorEl, { y: value, ...quickConfig }));

		// Use clientX/Y instead of pageX/Y for accurate tracking regardless of scroll
		$win.on('mousemove.ddgCursor', event => {
			moveX(event.clientX);
			moveY(event.clientY);
		});
	};

	// Share Buttons. Sends to webhook and opens share URL
	const initShare = () => {
		const shareItemSelector = '[data-share]';
		const shareCountdownSelector = '[data-share-countdown]';
		const $shareItems = $j(shareItemSelector);
		if (!$shareItems.length) return;

		const shareWebhookUrl =
			'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';

		const dailyShareKey = 'share_done_date';
		const shareOpenTarget = '_blank';

		const $doc = $j(document);
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
			const $countdownElements = $j(shareCountdownSelector);
			$countdownElements.each((_, element) => {
				const $element = $j(element);
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
			const $target = $j(event.currentTarget);
			event.preventDefault();

			const platformKey = ($target.data('share') || '').toString().toLowerCase();
			const normalizedPlatform = (platformAlias[platformKey] || platformKey).toLowerCase();

			const shareUrl = $target.data('share-url') || window.location.href;
			const shareText = $target.data('share-text') || document.title;

			const resolver = shareUrlMap[normalizedPlatform];
			const destination = resolver
				? resolver({ url: shareUrl, text: shareText })
				: shareUrl;

			const shareWindow = window.open('about:blank', shareOpenTarget);

			if (!heuristicsSatisfied()) {
				shareWindow?.close();
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

			if (shareWindow) {
				shareWindow.opener = null;
				shareWindow.location.href = destination;
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

		// Find all unique modal IDs from triggers and elements
		const modalIds = new Set();
		$j('[data-modal-trigger], [data-modal-el]').each((_, el) => {
			const id = $j(el).attr('data-modal-trigger') || $j(el).attr('data-modal-el');
			if (id) modalIds.add(id);
		});

		// Initialize each modal
		modalIds.forEach(modalId => {
			const $triggers = $j(`[data-modal-trigger="${modalId}"]`);
			const $el = $j(`[data-modal-el="${modalId}"]`);
			const $bg = $j(`[data-modal-bg="${modalId}"]`);
			const $inner = $el.find('[data-modal-inner]').first();
			const $closeButtons = $j(`[data-modal-close="${modalId}"]`);

			if (!$el.length) {
				modalLog('warn:no-modal-el', { modalId });
				return;
			}

			const elNode = $el[0];
			const $animTarget = $inner.length ? $inner : $el;

			// Get all descendants for is-open class
			const getAllElements = () => $el.find('*').addBack();

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

			// Event handlers - only for non-ajax modals
			const isAjaxModal = $triggers.first().is('[data-ajax-modal="link"]');

			if (!isAjaxModal) {
				$triggers.on('click', e => {
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

		// Single escape key handler for ALL modals
		$j(document).on('keydown.modals', e => {
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

		modalLog('init:all-complete', { count: modalIds.size });
	};

	// Ajax Modal: load content via AJAX into a modal with history management
	const initAjaxModal = () => {
		const modalLog = createLogger('ajax-modal', 'ajaxModalLogs', true);
		modalLog('init:start');

		const modalId = 'story'; // The modal ID for ajax modal
		const $links = $j('[data-ajax-modal="link"]');
		const $embed = $j('[data-ajax-modal="embed"]');
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

		// AJAX link click handler
		$links.on('click', e => {
			e.preventDefault();
			const $link = $j(e.currentTarget);
			const linkUrl = $link.attr('href');

			modalLog('link:click', { href: linkUrl });

			$j.ajax({
				url: linkUrl,
				success: (response) => {
					const $content = $j(response).find(contentSelector);
					const title = $j(response).filter('title').text();
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
		$j(document).off('keydown.modals').on('keydown.modals', e => {
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
			modal.open({ skipAnimation: true });
			window.history.replaceState({ modal: true }, '', window.location.href);
			modalLog('init:story-path', { path: window.location.pathname });
		}

		modalLog('init:complete');
	};

	// Boot 🚀
	ddg.boot = initSite;
	
})();
