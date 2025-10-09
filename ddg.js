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

	// -----------------------------------------------------------------------------
	// Utilities
	// -----------------------------------------------------------------------------

	// jQuery handle
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


	// -----------------------------------------------------------------------------
	// Boot
	// -----------------------------------------------------------------------------

	const initSite = () => {
		if (data.siteBooted) return;
		data.siteBooted = true;

		initNavigation();
		initPageProgress();
		initComingSoon();
		initActivityBar();
		initCustomCursor();
		initShare();
		initAjaxModal();
		initFilters();
	};

	// -----------------------------------------------------------------------------
	// Navigation: hide/reveal header on scroll
	// -----------------------------------------------------------------------------

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

	// -----------------------------------------------------------------------------
	// Page progress bar (top)
	// -----------------------------------------------------------------------------

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

	// -----------------------------------------------------------------------------
	// Activity bar (Splide carousel)
	// -----------------------------------------------------------------------------

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

	// -----------------------------------------------------------------------------
	// Custom cursor that follows the mouse
	// -----------------------------------------------------------------------------

	const initCustomCursor = () => {
		// Disable custom cursor on mobile devices
		if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return;
		const $cursor = $j('.c-cursor');
		const cursorEl = $cursor[0];
		if (!cursorEl) return;
		const $target = $j('.page-wrap');
		const targetEl = $target[0];
		if (!targetEl) return;
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

		// Align the custom cursor so its tip (top area) matches the pointer tip
		$win.on('mousemove.ddgCursor', event => {
			moveX(event.pageX);
			moveY(event.pageY);
			// No fade in/out on mousemove.
		});
	};

	// -----------------------------------------------------------------------------
	// Share: social sharing with daily limits & basic heuristics
	// -----------------------------------------------------------------------------

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

	// -----------------------------------------------------------------------------
	// AJAX modal
	// -----------------------------------------------------------------------------

	const initAjaxModal = () => {
		const modalLog = createLogger('ajax-modal', 'ajaxModalLogs', true);
		modalLog('init:start');
		const lightboxSelector = "[tr-ajaxmodal-element='lightbox']";
		const $lightbox = $j(lightboxSelector);
		const lightboxEl = $lightbox[0];
		if (!lightboxEl) {
			modalLog('init:abort-no-lightbox', { lightboxSelector });
			return;
		}
		const lightboxModalSelector = "[tr-ajaxmodal-element='lightbox-modal']";
		const lightboxBgSelector = "[tr-ajaxmodal-element='lightbox-bg']";
		const cmsLinkSelector = "[tr-ajaxmodal-element='cms-link']";
		const cmsPageContentSelector = "[tr-ajaxmodal-element='cms-page-content']";
		const lightboxCloseSelector = "[tr-ajaxmodal-element='lightbox-close']";
		modalLog('init:selectors', {
			lightboxSelector,
			lightboxModalSelector,
			lightboxBgSelector,
			cmsLinkSelector,
			cmsPageContentSelector,
			lightboxCloseSelector
		});

		// --- Scroll restoration manual ---
		if ('scrollRestoration' in history) {
			history.scrollRestoration = 'manual';
			modalLog('history:scrollRestoration', { value: history.scrollRestoration });
		}

		const $lightboxModal = $j(lightboxModalSelector);
		const $lightboxBg = $j(lightboxBgSelector);
		const homeTitle = document.title;
		modalLog('init:elements', {
			homeTitle,
			hasModalEl: Boolean($lightboxModal.length),
			hasLightboxBg: Boolean($lightboxBg.length)
		});

		const syncLightboxPosition = scrollY => {
			const offset = typeof scrollY === 'number' ? scrollY : 0;
			lightboxEl.style.position = 'absolute';
			lightboxEl.style.top = `${offset}px`;
			lightboxEl.style.left = '0';
			lightboxEl.style.right = '0';
			lightboxEl.style.width = '100%';
			lightboxEl.style.height = '100vh';
			modalLog('modal:sync-position', { offset });
		};

		const resetLightboxPosition = () => {
			lightboxEl.style.position = '';
			lightboxEl.style.top = '';
			lightboxEl.style.left = '';
			lightboxEl.style.right = '';
			lightboxEl.style.width = '';
			lightboxEl.style.height = '';
		};

		const toggleLightboxBg = isOpen => {
			if ($lightboxBg.length) {
				$lightboxBg.toggleClass('is-open', isOpen);
			}
		};

		// --- Modal open/close helpers ---
		const openModal = (newTitle, newUrl) => {
			const scrollY = window.scrollY;
			const state = window.history.state || {};
			window.history.replaceState({ ...state, scrollY }, '', window.location.href);

			toggleLightboxBg(true);
			$lightbox.addClass('is-open');
			$lightboxModal.addClass('is-open');
			syncLightboxPosition(scrollY);
			modalLog('modal:open', { newTitle, newUrl, scrollY });

			if (newTitle && newUrl) {
				document.title = newTitle;
				window.history.pushState({ modal: true, scrollY }, '', newUrl);
				modalLog('history:pushState', { newTitle, newUrl, scrollY });
			}
		};

		const closeModal = () => {
			const state = window.history.state || {};
			const savedScrollY = state.scrollY || 0;

			$lightbox.removeClass('is-open');
			$lightboxModal.removeClass('is-open');
			resetLightboxPosition();
			document.title = homeTitle;
			window.history.pushState({ modal: false, scrollY: savedScrollY }, '', '/');
			modalLog('modal:close', { savedScrollY });

			setTimeout(() => window.scrollTo(0, savedScrollY), 50);
		};

		const animateOpen = () =>
			gsap.fromTo($lightboxModal, { y: '5em', opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, onStart: () => modalLog('modal:animateOpen:start'), onComplete: () => modalLog('modal:animateOpen:complete') });
		const animateClose = () => {
			toggleLightboxBg(false);
			return gsap.to($lightboxModal, {
				y: '5em',
				opacity: 0,
				duration: 0.25,
				onStart: () => modalLog('modal:animateClose:start'),
				onComplete: () => {
					modalLog('modal:animateClose:complete');
					closeModal();
				}
			});
		};

		// --- open-on-load logic ---
		const isLightboxOpen = $lightbox.hasClass('is-open');
		if (isLightboxOpen) {
			const state = window.history.state || {};
			const scrollY = typeof state.scrollY === 'number' ? state.scrollY : 0;
			if (scrollY > 0) window.scrollTo(0, scrollY);
			syncLightboxPosition(scrollY);
			openModal();
			modalLog('init:reopen-from-state', { scrollY });
		}

		$j(document).on('click', cmsLinkSelector, event => {
			const $focusedLink = $j(event.currentTarget);
			event.preventDefault();
			const linkUrl = $focusedLink.attr('href');
			modalLog('link:click', { href: linkUrl });
			$j.ajax({
				url: linkUrl,
				success: response => {
					const $cmsContent = $j(response).find(cmsPageContentSelector);
					const cmsTitle = $j(response).filter('title').text();
					const cmsUrl = new URL(linkUrl, window.location.origin).href;
					$lightboxModal.empty().append($cmsContent);
					openModal(cmsTitle, cmsUrl);
					animateOpen();
					modalLog('ajax:success', {
						href: linkUrl,
						cmsTitle,
						cmsUrl,
						contentFound: Boolean($cmsContent.length)
					});
				},
				error: () => {
					modalLog('ajax:error', { href: linkUrl });
					$lightboxModal.empty().append("<div class='modal-error'>Failed to load content. Please try again later.</div>");
				}
			});
		});

		$lightbox.on('click', lightboxCloseSelector, e => {
			e.preventDefault();
			e.stopImmediatePropagation();
			animateClose();
			modalLog('lightbox:close-click');
		});

		$j(document).on('keydown', e => {
			if (e.key === 'Escape' && $lightbox.hasClass('is-open')) {
				animateClose();
				modalLog('keydown:escape');
			}
		});

		$lightbox.on('click', e => {
			if (e.target === $lightbox[0]) {
				animateClose();
				modalLog('lightbox:background-click');
			}
		});
		// --- popstate and open-on-load logic ---
		window.addEventListener('popstate', e => {
			const state = e.state || {};
			const scrollY = typeof state.scrollY === 'number' ? state.scrollY : 0;
			if (state.modal) {
				syncLightboxPosition(scrollY);
				$lightbox.addClass('is-open');
				$lightboxModal.addClass('is-open');
				toggleLightboxBg(true);
				modalLog('popstate:open', { state });
			} else {
				resetLightboxPosition();
				$lightbox.removeClass('is-open');
				$lightboxModal.removeClass('is-open');
				toggleLightboxBg(false);
				modalLog('popstate:close', { state });
			}
			if (typeof state.scrollY === 'number') {
				setTimeout(() => window.scrollTo(0, state.scrollY), 0);
				modalLog('popstate:scroll-restore', { scrollY: state.scrollY });
			}
		});

		if (window.location.pathname.startsWith('/story/')) {
			$lightbox.addClass('is-open');
			$lightboxModal.addClass('is-open');
			toggleLightboxBg(true);
			syncLightboxPosition(window.scrollY);
			window.history.replaceState({ modal: true, scrollY: window.scrollY }, '', window.location.href);
			modalLog('init:story-path', { path: window.location.pathname });
		}

		// On load, always restore scroll position from history.state, even if modal is open or replaced
		window.addEventListener('load', () => {
			const state = window.history.state || {};
			const scrollY = typeof state.scrollY === 'number' ? state.scrollY : 0;
			if (scrollY > 0) {
				requestAnimationFrame(() => window.scrollTo(0, scrollY));
				requestAnimationFrame(() => syncLightboxPosition(scrollY));
				modalLog('load:scroll-restore', { scrollY });
			} else {
				resetLightboxPosition();
			}
		});

		window.addEventListener(
			'resize',
			debounce(() => {
				if ($lightbox.hasClass('is-open')) {
					syncLightboxPosition(window.scrollY);
				}
			}, 100)
		);

		modalLog('init:complete');
	};

	// -----------------------------------------------------------------------------
	// Home filters (Finsweet attributes + random filter + Modal)
	// -----------------------------------------------------------------------------
	const initFilters = () => {
		const filterPanelSelector = '.c-home-filters';
		const openButtonSelector = '.c-search-btn';
		const closeButtonSelector = '.c-circle-button[data-action="close"], .filters_submit';
		const randomButtonSelector = '.random-filter';
		const listFieldSelector = '[fs-list-field]';
		const $filterPanel = $j(filterPanelSelector);
		if (!$filterPanel.length) return;
		const $openButtons = $j(openButtonSelector);
		const $closeButtons = $j(closeButtonSelector);
		const $randomButton = $j(randomButtonSelector);

		const toggleFilters = isOpen => {
			$filterPanel
				.toggleClass('is-open', isOpen)
				.css('display', isOpen ? 'block' : 'none')
				.attr('aria-hidden', !isOpen);
		};

		$openButtons.on('click', e => { e.preventDefault(); toggleFilters(true); });
		$closeButtons.on('click', e => { e.preventDefault(); toggleFilters(false); });

		// Random filter logic
		const pickRandom = arr => arr[Math.floor(Math.random() * arr.length)];

		window.FinsweetAttributes = window.FinsweetAttributes || [];
		window.FinsweetAttributes.push([
			'list',
			lists => {
				const list = lists[0];
				$randomButton.on('click', () => {
					const items = list.items.value;
					if (!items.length) return;

					const randomItem = pickRandom(items);
					const fieldEntries = Object.entries(randomItem.fields)
						.flatMap(([key, val]) =>
							Array.isArray(val) ? val.map(v => [key, v]) : [[key, val]]
						)
						.filter(([_, v]) => v && String(v).trim() !== '');

					const [field, value] = pickRandom(fieldEntries);
					const $input = $j(
						`[fs-list-field="${field}"][fs-list-value="${CSS.escape(String(value))}"]`
					);
					if (!$input.length) return;

					$j(listFieldSelector).each((_, el) => {
						if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
					});

					$input.prop('checked', true);
					$input.trigger('change');

					const closeOnce = () => {
						toggleFilters(false);
						list.removeHook('render', closeOnce);
					};
					list.addHook('render', closeOnce);
				});
			}
		]);
	};

	// -----------------------------------------------------------------------------
	// Feature order & public API
	// -----------------------------------------------------------------------------

	ddg.boot = initSite;
})();
