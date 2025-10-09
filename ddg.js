(function () {
	// Namespace & data
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false
	});

	// -----------------------------------------------------------------------------
	// Utilities
	// -----------------------------------------------------------------------------

	// jQuery handle
	const $j = window.$;
	const $win = $j(window);

	const debounce = (fn, wait) => {
		let timeoutId;
		return (...args) => {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn(...args), wait);
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
		initTicker();
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
		const $nav = $j('.nav');
		const navEl = $nav[0];
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

		const homeListEl = $j('.home-list')[0];
		if (!homeListEl) return;

		const hasListItems = () => $j('.home-list_item').length > 0;

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

	// -----------------------------------------------------------------------------
	// Ticker: SplitText hover effect on "coming soon" list items
	// -----------------------------------------------------------------------------

	const initTicker = () => {
		const createTickerController = () => {
			const tapeSpeed = 5000;
			let splitTextInstances = [];
			let comingSoonItems = [];

			const debouncedRefresh = debounce(refresh, 200);
			$win.on('resize.ddgTicker', debouncedRefresh);
			refresh();

			return {
				refresh,
				destroy: () => {
					$win.off('resize.ddgTicker', debouncedRefresh);
					teardown();
				}
			};

			function refresh() {
				teardown();
				comingSoonItems = $j('.home-list_item-wrap[data-story-status="coming-soon"] .home-list_item').get();
				if (!comingSoonItems.length) return;
				comingSoonItems.forEach(itemEl => {
					const splitTextInstance = SplitText.create(itemEl, {
						type: 'lines',
						autoSplit: true,
						tag: 'span',
						linesClass: 'home-list_split-line'
					});
					splitTextInstances.push(splitTextInstance);
					const $item = $j(itemEl);
					$item.on('mouseenter.ddgTicker', function (event) {
						animateLines(this, 0);
					});
					$item.on('mouseleave.ddgTicker', function (event) {
						animateLines(this, '100%');
					});
					if (itemEl.tagName === 'A') {
						$item.one('click.ddgTicker', function (event) {
							event.preventDefault();
						});
					}
				});
			}
			function animateLines(itemEl, offset) {
				const lines = gsap.utils.toArray(itemEl.querySelectorAll('.home-list_split-line'));
				gsap.killTweensOf(lines);
				gsap.to(lines, {
					'--home-list--tape-r': offset,
					duration: (_, el) => el.offsetWidth / tapeSpeed,
					ease: 'linear'
				});
			}
			function teardown() {
				splitTextInstances.forEach(instance => instance.revert());
				splitTextInstances = [];
				comingSoonItems.forEach(itemEl => {
					const $item = $j(itemEl);
					$item.off('.ddgTicker');
				});
				comingSoonItems = [];
			}
		};
		const controller = createTickerController();
		if (!controller) return;
		// No data.resources reference needed.
		const registerListHook = handler => {
			window.FinsweetAttributes = window.FinsweetAttributes || [];
			window.FinsweetAttributes.push([
				'list',
				lists => lists.forEach(listInstance => handler(listInstance))
			]);
		};
		registerListHook(listInstance => {
			listInstance.addHook('afterRender', () => {
				controller.refresh?.();
			});
		});
	};

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
		const cursorEl = $j('.c-cursor')[0];
		const targetEl = $j('.page-wrap')[0];
		if (!cursorEl || !targetEl) return;

		const $body = $j(document.body);

		const quickConfig = { duration: 0.2, ease: 'power3.out' };

		const moveX =
			gsap.quickTo?.(cursorEl, 'x', quickConfig) ||
			(value => gsap.to(cursorEl, { x: value, ...quickConfig }));

		const moveY =
			gsap.quickTo?.(cursorEl, 'y', quickConfig) ||
			(value => gsap.to(cursorEl, { y: value, ...quickConfig }));

		$win.on('mousemove.ddgCursor', event => {
			moveX(event.clientX);
			moveY(event.clientY);
		});

		$j(targetEl).on('mouseenter.ddgCursor', () => {
			$body.css('cursor', 'none');
			gsap.to(cursorEl, { autoAlpha: 1, duration: 0.2 });
		});

		$j(targetEl).on('mouseleave.ddgCursor', () => {
			$body.css('cursor', 'auto');
			gsap.to(cursorEl, { autoAlpha: 0, duration: 0.2 });
		});
	};

	// -----------------------------------------------------------------------------
	// Share: social sharing with daily limits & basic heuristics
	// -----------------------------------------------------------------------------

	const initShare = () => {
		const shareWebhookUrl =
			'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';

		const dailyShareKey = 'share_done_date';
		const shareItemSelector = '[data-share]';
		const shareCountdownSelector = '[data-share-countdown]';
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
		const shareStartTimestamp = performance.now();
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
			performance.now() - shareStartTimestamp > 1500 &&
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
		const lightboxEl = $j("[tr-ajaxmodal-element='lightbox']")[0];
		if (!lightboxEl) return;

		const $lightbox = $j(lightboxEl);
		const lightboxCloseEl = $j("[tr-ajaxmodal-element='lightbox-close']").attr('aria-label', 'Close Modal')[0];
		const $lightboxClose = $j(lightboxCloseEl);
		const lightboxModalEl = $j("[tr-ajaxmodal-element='lightbox-modal']")[0];
		const $lightboxModal = $j(lightboxModalEl);
		const cmsLinkSelector = "[tr-ajaxmodal-element='cms-link']";
		const cmsPageContentSelector = "[tr-ajaxmodal-element='cms-page-content']";
		let initialPageTitle = document.title;
		let initialPageUrl = window.location.href;
		let $focusedLink;

		const updatePageInfo = (newTitle, newUrl) => {
			document.title = newTitle;
			window.history.replaceState({}, '', newUrl);
		};

		const tl = gsap.timeline({
			paused: true,
			onReverseComplete: () => {
				if ($focusedLink && $focusedLink.length && typeof $focusedLink.focus === 'function') {
					$focusedLink.focus();
				}
				updatePageInfo(initialPageTitle, initialPageUrl);
			},
			onComplete: () => {
				if ($lightboxClose && $lightboxClose.length && typeof $lightboxClose.focus === 'function') {
					$lightboxClose.focus();
				}
			}
		});
		tl.set('body', { overflow: 'hidden' });
		tl.set($lightbox, { display: 'block', onComplete: () => { if ($lightboxModal && $lightboxModal.length) $lightboxModal.scrollTop(0); } });
		tl.from($lightbox, { opacity: 0, duration: 0.2 });
		tl.from($lightboxModal, { y: '5em', duration: 0.2 }, '<');

		const keepFocusWithinLightbox = () => {
			const $lastFocusableChild = $lightbox
				.find('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
				.not(':disabled')
				.not('[aria-hidden=true]')
				.last();
			$lastFocusableChild.on('focusout', () => {
				if ($lightboxClose && $lightboxClose.length && typeof $lightboxClose.focus === 'function') {
					$lightboxClose.focus();
				}
			});
		};

		$j(document).on('click', cmsLinkSelector, event => {
			$focusedLink = $j(event.currentTarget);
			initialPageUrl = window.location.href;
			event.preventDefault();
			const linkUrl = $focusedLink.attr('href');
			$j.ajax({
				url: linkUrl,
				success: response => {
					const $cmsContent = $j(response).find(cmsPageContentSelector);
					const cmsTitle = $j(response).filter('title').text();
					const cmsUrl = window.location.origin + linkUrl;
					if ($lightboxModal && $lightboxModal.length) {
						$lightboxModal.empty();
						$lightboxModal.append($cmsContent);
					}
					updatePageInfo(cmsTitle, cmsUrl);
					tl.play();
					keepFocusWithinLightbox();
				},
				error: (jqXHR, textStatus, errorThrown) => {
					if ($lightboxModal && $lightboxModal.length) {
						$lightboxModal.empty().append(
							`<div class='modal-error'>Failed to load content. Please try again later.</div>`
						);
					}
					// eslint-disable-next-line no-console
					console.error('[ddg] AJAX modal load error:', textStatus, errorThrown);
				}
			});
		});

		if ($lightboxClose && $lightboxClose.length) {
			$lightboxClose.on('click', () => {
				tl.reverse();
			});
		}
		$j(document).on('keydown', event => {
			if (event.key === 'Escape') tl.reverse();
		});
		$j(document).on('click', $lightbox, event => {
			if (!$j(event.target).is($lightbox.find('*'))) tl.reverse();
		});
	};

	// -----------------------------------------------------------------------------
	// Home filters (Finsweet attributes + random filter + Modal)
	// -----------------------------------------------------------------------------
	const initFilters = () => {
		// Selectors
		const $filterPanel = $j('.c-home-filters');
		const $openButtons = $j('.c-search-btn');
		const $closeButtons = $j('.c-circle-button[data-action="close"], .filters_submit');
		const $randomButton = $j('.random-filter');

		// Modal open/close
		const openFilters = () => {
			$filterPanel.addClass('is-open').css('display', 'block').attr('aria-hidden', 'false');
			$j('body').css('overflow', 'hidden');
		};

		const closeFilters = () => {
			$filterPanel.removeClass('is-open').css('display', 'none').attr('aria-hidden', 'true');
			$j('body').css('overflow', '');
		};

		$openButtons.on('click', e => {
			e.preventDefault();
			openFilters();
		});

		$closeButtons.on('click', e => {
			e.preventDefault();
			closeFilters();
		});

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

					$j('[fs-list-field]').each((_, el) => {
						if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
					});

					$input.prop('checked', true);
					$input.trigger('change');

					const closeOnce = () => {
						closeFilters();
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
