(function () {
	const ddg = (window.ddg ??= {});
	const data = (ddg.data ??= {
		siteBooted: false,
		truePath: window.location.pathname,
		ajaxHomeLoaded: false
	});

	// GSAP Defaults
	gsap.defaults({ overwrite: 'auto' });
	gsap.ticker.lagSmoothing(500, 33);
	ScrollTrigger.config({ ignoreMobileResize: true, autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' });

	// Finsweet
	ddg.fs = (() => {
		const state = { firstList: null, queued: [], subscribed: false };

		const ensureFsArray = () => (window.FinsweetAttributes ||= []);

		const setFirst = (inst) => {
			if (!inst || state.firstList) return;
			console.log('[fs] set first instance', inst);
			state.firstList = inst;
			state.queued.splice(0).forEach(fn => { try { fn(inst); } catch (e) { console.error(e); } });
		};

		const subscribeOnce = () => {
			if (state.subscribed) return;
			state.subscribed = true;
			console.log('[fs] subscribe to list ready');
			ensureFsArray().push([
				'list',
				(instances) => {
					const inst = instances?.[0] || instances?.instances?.[0] || instances?.listInstances?.[0] || null;
					if (inst) setFirst(inst);
					else console.warn('[fs] no list instance found');
				}
			]);
		};

		const ensureLoad = () => {
			console.log('[fs] ensureLoad');
			try { ensureFsArray().load?.('list'); } catch (err) { console.warn('[fs] load error', err); }
		};

		const whenListReady = (fn) => {
			if (state.firstList) return fn(state.firstList);
			state.queued.push(fn);
			subscribeOnce();
			ensureLoad();
		};

		const restart = () => {
			console.log('[fs] restart');
			window.FinsweetAttributes?.modules?.list?.restart?.();
		};

		return { whenListReady, restart, ensureLoad };
	})();

	// Site boot
	const initSite = () => {
		if (data.siteBooted) return;
		data.siteBooted = true;
		console.log('[ddg] booting site');

		// Ensure Finsweet Loaded
		ddg.fs.ensureLoad();

		// On Scroll
		initNavigation();

		// On Hover
		initComingSoon();

		// On Load
		initModals();
		initAjaxModal();
		initAjaxHome();
		initMarquee();

		// On Click
		initShare();
		initRandomiseFilters();
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
		const resizeHandler = () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				for (const el of splitSet) {
					try { el.__ddgSplit?.revert(); } catch (_) { }
					delete el.__ddgSplit;
				}
				splitSet.clear();
			}, 200);
		};

		$(window).on('resize.ddgComingSoon', resizeHandler);

		// Cleanup function
		if (!ddg.__comingSoonCleanup) {
			ddg.__comingSoonCleanup = () => {
				$(wrapperEl).off('.ddgComingSoon');
				$(window).off('resize.ddgComingSoon', resizeHandler);
				for (const el of splitSet) {
					try { el.__ddgSplit?.revert(); } catch (_) { }
					delete el.__ddgSplit;
				}
				splitSet.clear();
			};
		}
	}

	const initShare = () => {
		if (ddg.__shareInitialized) return;
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
			clipboard: ({ url }) => url,
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

		let shareLiveRegion = null;
		const ensureShareLiveRegion = () => {
			if (shareLiveRegion && document.body.contains(shareLiveRegion)) return shareLiveRegion;
			shareLiveRegion = document.createElement('div');
			shareLiveRegion.setAttribute('aria-live', 'polite');
			shareLiveRegion.setAttribute('aria-atomic', 'true');
			shareLiveRegion.setAttribute('data-share-live-region', 'true');
			Object.assign(shareLiveRegion.style, {
				position: 'fixed',
				width: '1px',
				height: '1px',
				padding: '0',
				border: '0',
				margin: '-1px',
				overflow: 'hidden',
				clip: 'rect(0 0 0 0)'
			});
			document.body.appendChild(shareLiveRegion);
			return shareLiveRegion;
		};

		const announceShare = message => {
			if (!message) return;
			const region = ensureShareLiveRegion();
			region.textContent = '';
			setTimeout(() => { region.textContent = message; }, 20);
		};

		const updateShareState = (element, state) => {
			if (!element) return;
			element.setAttribute('data-share-state', state);
			clearTimeout(element.__shareStateTimer);
			element.__shareStateTimer = setTimeout(() => {
				element.removeAttribute('data-share-state');
				element.__shareStateTimer = null;
			}, 2000);
		};

		const fallbackCopy = text => new Promise((resolve, reject) => {
			if (!document.body) {
				reject(new Error('Document body unavailable'));
				return;
			}
			const textarea = document.createElement('textarea');
			textarea.value = text;
			textarea.setAttribute('readonly', '');
			Object.assign(textarea.style, {
				position: 'fixed',
				top: '-9999px',
				left: '-9999px',
				opacity: '0'
			});
			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();
			let successful = false;
			try {
				successful = document.execCommand('copy');
			} catch (_) { successful = false; }
			textarea.remove();
			if (successful) resolve();
			else reject(new Error('execCommand failed'));
		});

		const copyToClipboard = text => {
			if (!text) return Promise.reject(new Error('Nothing to copy'));
			if (navigator.clipboard?.writeText) {
				return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
			}
			return fallbackCopy(text);
		};

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

			const isClipboardShare = normalizedPlatform === 'clipboard';
			const sharewindow = isClipboardShare ? null : window.open('about:blank', '_blank');
			const heuristicsPassed = heuristicsSatisfied();

			stopTracking();

			// Fake the countdown for immediate feedback
			decrementCountdown();

			if (heuristicsPassed) {
				if (!alreadySharedToday()) {
					sendShareWebhook(normalizedPlatform);
					markShareComplete();
				}
			} else {
				console.warn('[share] heuristics not satisfied');
			}

			if (isClipboardShare) {
				const successMessage = $target.attr('data-share-copy-label') || 'Link copied to clipboard';
				const errorMessage = $target.attr('data-share-copy-error') || 'Copy failed. Copy the link manually.';
				copyToClipboard(destination)
					.then(() => {
						updateShareState(event.currentTarget, 'copied');
						announceShare(successMessage);
					})
					.catch(() => {
						updateShareState(event.currentTarget, 'error');
						announceShare(errorMessage);
						try { window.prompt('Copy this link', destination); } catch (_) { }
					});
				return;
			}

			if (sharewindow) {
				sharewindow.opener = null;
				sharewindow.location.href = destination;
			} else {
				window.location.href = destination;
			}
		});
	};

	// ==============================
	// initModals
	// ==============================
	function initModals() {
		ddg.modals = ddg.modals || {};
		ddg._modalsKeydownBound = Boolean(ddg._modalsKeydownBound);
		console.log('[modals] initializing with CSS-state sync + delegated bindings');

		const sel = {
			trigger: '[data-modal-trigger]',
			modal: '[data-modal-el]',
			bg: '[data-modal-bg]',
			inner: '[data-modal-inner]',
			close: '[data-modal-close]',
		};

		const syncCssState = ($modal, open, id) => {
			const $bg = $(`[data-modal-bg="${id}"]`);
			const $inner = $modal.find(sel.inner).first();
			[$modal[0], $inner[0], $bg[0]].filter(Boolean).forEach(el => el.classList.toggle('is-open', !!open));
			console.log(`[modals:${id}] syncCssState -> ${!!open} (bg:${$bg.length})`);
		};

		const createModal = (id) => {
			if (ddg.modals[id]) return ddg.modals[id];
			const $modal = $(`[data-modal-el="${id}"]`);
			if (!$modal.length) return null;

			const $inner = $modal.find(sel.inner).first();
			const $bg = $(`[data-modal-bg="${id}"]`);
			const $animTarget = $inner.length ? $inner : $modal;

			const open = ({ skipAnimation = false, beforeOpen, afterOpen } = {}) => {
				console.log(`[modals:${id}] open (skipAnimation=${skipAnimation})`);
				// Single-open policy
				Object.entries(ddg.modals).forEach(([otherId, m]) => {
					if (otherId !== id && m.isOpen()) m.close({ skipAnimation: true });
				});

				beforeOpen && beforeOpen();
				gsap.killTweensOf($animTarget[0]);

				// is-open on all parts BEFORE anim
				syncCssState($modal, true, id);

				if (skipAnimation) {
					gsap.set($animTarget[0], { opacity: 1, y: 0 });
					afterOpen && afterOpen();
					return;
				}

				gsap.fromTo(
					$animTarget[0],
					{ y: 60, opacity: 0 },
					{
						y: 0,
						opacity: 1,
						duration: 0.6,
						ease: 'power2.out',
						onComplete: () => afterOpen && afterOpen(),
					}
				);
			};

			const close = ({ skipAnimation = false, beforeClose, afterClose } = {}) => {
				console.log(`[modals:${id}] close (skipAnimation=${skipAnimation})`);
				beforeClose && beforeClose();
				gsap.killTweensOf($animTarget[0]);

				// Remove bg immediately
				if ($bg.length) $bg.removeClass('is-open');

				const finish = () => {
					$modal.removeClass('is-open');
					$inner.removeClass('is-open');
					afterClose && afterClose();
				};

				if (skipAnimation) {
					gsap.set($animTarget[0], { opacity: 0, y: 60 });
					finish();
					return;
				}

				gsap.to($animTarget[0], {
					y: 60,
					opacity: 0,
					duration: 0.6,
					ease: 'power2.out',
					onComplete: finish,
				});
			};

			const isOpen = () => $modal.hasClass('is-open');

			const modal = { open, close, isOpen, $modal };
			ddg.modals[id] = modal;

			// Initial CSS sync (e.g. direct /stories/... loads)
			const initial = $modal.hasClass('is-open');
			console.log(`[modals:${id}] initial state is-open=${initial}`);
			syncCssState($modal, initial, id);

			document.dispatchEvent(new CustomEvent('ddg:modal-created', { detail: id }));
			return modal;
		};

		ddg.ensureModal = (id) => ddg.modals[id] || createModal(id);

		// Triggers — skip ajax links (ajaxModal handles them)
		$(document).on('click.modal', sel.trigger, (e) => {
			const el = e.currentTarget;
			const id = el.getAttribute('data-modal-trigger');
			if (el.hasAttribute('data-ajax-modal')) return;
			e.preventDefault();
			console.log(`[modals] trigger clicked for ${id}`);
			ddg.ensureModal(id)?.open();
		});

		// Close buttons (targeted or generic)
		$(document).on('click.modal', sel.close, (e) => {
			e.preventDefault();
			const id = e.currentTarget.getAttribute('data-modal-close');
			if (id) ddg.ensureModal(id)?.close();
			else Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
		});

		// Backdrop click
		$(document).on('click.modal', sel.bg, (e) => {
			if (e.target !== e.currentTarget) return;
			const id = e.currentTarget.getAttribute('data-modal-bg');
			console.log(`[modals] bg clicked for ${id}`);
			ddg.ensureModal(id)?.close();
		});

		// ESC
		if (!ddg._modalsKeydownBound) {
			ddg._modalsKeydownBound = true;
			$(document).on('keydown.modal', (e) => {
				if (e.key === 'Escape') {
					Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
				}
			});
		}

		// Build controllers for all present modals now
		$(sel.modal).each((_, el) => {
			const id = el.getAttribute('data-modal-el');
			ddg.ensureModal(id);
		});

		// Final CSS sync pass
		requestAnimationFrame(() => {
			console.log('[modals] post-init CSS sync check');
			$(sel.modal).each((_, el) => {
				const id = el.getAttribute('data-modal-el');
				const isOpen = el.classList.contains('is-open');
				syncCssState($(el), isOpen, id);
			});
		});

		console.log('[modals] initialized with lazy + scroll + delegated bindings');
		document.dispatchEvent(new CustomEvent('ddg:modals-ready'));
	}

	// ==============================
	// initAjaxModal
	// ==============================
	function initAjaxModal() {
		if (ddg._ajaxModalInitialized) return;
		ddg._ajaxModalInitialized = true;

		console.log('[ajaxModal] init called');

		const modalId = 'story';
		const $embed = $('[data-ajax-modal="embed"]');
		const originalTitle = document.title;
		const homeUrl = '/';

		let storyModal = ddg.modals?.[modalId] || ddg.ensureModal?.(modalId) || null;

		const augmentStoryModal = () => {
			if (!storyModal || storyModal.__ajaxAugmented) return;
			storyModal.__ajaxAugmented = true;

			const origOpen = storyModal.open;
			const origClose = storyModal.close;

			// We leave open() mostly untouched; history is handled by openStory()
			storyModal.open = (opts = {}) => {
				return origOpen({
					...opts,
					afterOpen: () => {
						try { opts.afterOpen?.(); } catch (_) { }
					}
				});
			};

			// Wrap close() so ANY close path restores home + title
			storyModal.close = (opts = {}) => {
				return origClose({
					...opts,
					afterClose: () => {
						try { opts.afterClose?.(); } catch (_) { }
						// Always restore to home when story modal closes
						if (document.title !== originalTitle) document.title = originalTitle;
						try { history.pushState({}, '', homeUrl); } catch (_) { }
						console.log('[ajaxModal] (wrap) restored home');
					}
				});
			};

			console.log('[ajaxModal] story modal augmented');
		};

		if (storyModal) augmentStoryModal();

		// If created later, grab and augment
		document.addEventListener('ddg:modal-created', (e) => {
			if (e.detail === modalId) {
				storyModal = ddg.modals[modalId];
				console.log('[ajaxModal] story modal created and ready');
				augmentStoryModal();
			}
		});

		const openStory = (url, title, $content) => {
			if (!storyModal) {
				console.warn('[ajaxModal] story modal not ready yet');
				return;
			}
			$embed.empty().append($content || '');
			storyModal.open({
				afterOpen: () => {
					if (title) document.title = title;
					try { history.pushState({ modal: true, story: true }, '', url); } catch (_) { }
					console.log('[ajaxModal] openStory -> updated history', url);
				}
			});
		};

		// Live click handler (works for injected nodes too)
		$(document).on('click.ajax', '[data-ajax-modal="link"]', (e) => {
			const $link = $(e.currentTarget);
			const linkUrl = $link.attr('href');
			e.preventDefault();
			console.log('[ajaxModal] clicked link', linkUrl);

			// Ensure controller exists on the home page too
			if (!storyModal) { storyModal = ddg.ensureModal?.(modalId) || null; augmentStoryModal(); }
			if (!storyModal) {
				console.warn('[ajaxModal] story modal not ready, aborting click');
				return;
			}

			if (ddg._ajaxModalLock) {
				console.log('[ajaxModal] still locked');
				return;
			}
			ddg._ajaxModalLock = true;

			$embed.empty().append("<div class='modal-skeleton' aria-busy='true'></div>");

			$.ajax({
				url: linkUrl,
				success: (response) => {
					console.log('[ajaxModal] loaded', linkUrl, 'len:', response.length);
					let $content = null;
					let title = '';
					try {
						const doc = new DOMParser().parseFromString(response, 'text/html');
						const node = doc.querySelector('[data-ajax-modal="content"]');
						title = doc.title || '';
						$content = node ? $(node) : $("<div class='modal-error'>Failed to load content.</div>");
					} catch (err) {
						console.warn('[ajaxModal] parse error', err);
						$content = $("<div class='modal-error'>Failed to load content.</div>");
					}

					console.log('[ajaxModal] injecting content');
					openStory(linkUrl, title, $content);
					if ($content && $content[0]) {
						try { initMarquee($content[0]); } catch (_) { }
					}
				},
				error: () => {
					console.warn('[ajaxModal] load failed');
					$embed.empty().append("<div class='modal-error'>Failed to load content.</div>");
					openStory(linkUrl, 'Error', null);
				},
				complete: () => {
					ddg._ajaxModalLock = false;
					console.log('[ajaxModal] complete');
				}
			});
		});

		// Browser back/forward
		window.addEventListener('popstate', (e) => {
			console.log('[ajaxModal] popstate', e.state);
			if (!e.state?.modal && storyModal?.isOpen()) {
				// Will run the wrapped afterClose that restores home/title
				storyModal.close({ skipAnimation: true });
			}
		});

		// Deep link on /stories/... -> open instantly and mark history
		console.log('[ajaxModal] waiting for ddg:modals-ready');
		document.addEventListener('ddg:modals-ready', () => {
			console.log('[ajaxModal] modals-ready detected');
			storyModal = ddg.modals?.[modalId] || ddg.ensureModal?.(modalId) || storyModal;
			augmentStoryModal();
			if (!storyModal) {
				console.warn('[ajaxModal] story modal not found after ready');
				return;
			}
			if (window.location.pathname.startsWith('/stories/')) {
				console.log('[ajaxModal] story path detected — syncing open state');
				storyModal.open({ skipAnimation: true });
				try { history.replaceState({ modal: true, story: true }, '', window.location.href); } catch (_) { }
			}
		}, { once: true });
	}

	// Ajax Home List Injection
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

				$target.empty().append($source.html());
				data.ajaxHomeLoaded = true;

				console.log('[ajaxHome] injected home list');
				ddg.fs.ensureLoad();
				ddg.fs.restart();
				console.log('[ajaxHome] ensureLoad + restart');
			}
		});
	};

	// Randomise Filters
	function initRandomiseFilters() {
		const sel = {
			list: '[fs-list-element="list"]',
			form: '[fs-list-element="filters"]',
			inputs: 'input[type="checkbox"][fs-list-field][fs-list-value]',
			clear: '[fs-list-element="clear"]',
			trigger: '[data-randomfilters]'
		};

		const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

		const apply = (list) => {
			console.log('[randomfilters] applying...');
			const listEl = document.querySelector(sel.list);
			const formEl = document.querySelector(sel.form);
			if (!listEl || !formEl) return console.warn('[randomfilters] no form/list');

			const checkboxes = [...formEl.querySelectorAll(sel.inputs)]
				.filter(i => !i.closest('label')?.classList.contains('is-list-emptyfacet'));
			if (!checkboxes.length) return console.warn('[randomfilters] no checkboxes');

			const byField = new Map();
			for (const input of checkboxes) {
				const field = input.getAttribute('fs-list-field');
				const value = input.getAttribute('fs-list-value');
				if (!field || !value) continue;
				if (!byField.has(field)) byField.set(field, new Map());
				byField.get(field).set(value, input);
			}

			const items = Array.isArray(list.items?.value) ? list.items.value : (list.items || []);
			if (!items.length) return;

			const item = items[rand(0, items.length - 1)];
			const fields = Object.entries(item.fields || []);
			const cands = [];
			for (const [key, f] of fields) {
				const map = byField.get(key);
				if (!map) continue;
				const vals = String(f?.value ?? '').split(',').map(v => v.trim()).filter(v => map.has(v));
				if (!vals.length) continue;
				const val = vals[rand(0, vals.length - 1)];
				cands.push({ key, val, input: map.get(val) });
			}
			if (!cands.length) return console.warn('[randomfilters] no candidates');

			const chosen = cands.slice(0, rand(2, Math.min(5, cands.length)));
			const clearBtn = formEl.querySelector(sel.clear);
			if (clearBtn) clearBtn.click();
			else for (const input of checkboxes) {
				input.checked = false;
				input.closest('label')?.classList.remove('is-list-active');
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}

			const filters = list.filters?.value || list.filters;
			if (!filters) return console.warn('[randomfilters] no filters obj');
			filters.groupsMatch = 'and';
			filters.groups = [{
				id: 'random',
				conditionsMatch: 'and',
				conditions: chosen.map(({ key, val }, i) => ({
					id: `rf-${key}-${i}`,
					type: 'checkbox',
					fieldKey: key,
					op: 'equal',
					value: val,
					interacted: true
				}))
			}];

			list.triggerHook?.('filter');
			list.render?.();

			for (const { input } of chosen) {
				input.checked = true;
				input.closest('label')?.classList.add('is-list-active');
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}

			console.log('[randomfilters] done');
		};

		document.addEventListener('click', (e) => {
			const btn = e.target.closest(sel.trigger);
			if (!btn) return;
			e.preventDefault();
			if (btn.__rfLock) return;
			btn.__rfLock = true;
			setTimeout(() => (btn.__rfLock = false), 250);
			console.log('[randomfilters] trigger clicked');
			ddg.fs.whenListReady((list) => apply(list));
		}, true);
	}

	function initMarquee(root = document) {
		const elements = root.querySelectorAll('[data-marquee]:not([data-marquee-init])');
		elements.forEach((el) => {
			el.setAttribute('data-marquee-init', '');
			const duration = 20000;
			const direction = 'left';
			const uniqueId = `marquee-${Math.random().toString(36).slice(2, 11)}`;

			const inner = document.createElement('div');
			inner.className = 'marquee-inner';
			while (el.firstChild) inner.appendChild(el.firstChild);
			el.appendChild(inner);

			el.style.display = 'flex';
			el.style.overflow = 'hidden';
			inner.style.display = 'flex';
			inner.style.gap = 'inherit';
			inner.style.width = 'max-content';

			let resizeHandler = null;
			let mutationObserver = null;

			const cleanup = () => {
				if (resizeHandler) {
					window.removeEventListener('resize', resizeHandler);
					resizeHandler = null;
				}
				if (mutationObserver) {
					mutationObserver.disconnect();
					mutationObserver = null;
				}
				const style = document.getElementById(`${uniqueId}-style`);
				if (style) style.remove();
			};

			const update = () => {
				if (el.offsetParent === null) return;
				const marqueeWidth = el.offsetWidth;
				let contentWidth = inner.scrollWidth;

				// Prevent infinite loop - bail if content is empty or too small
				if (contentWidth === 0 || marqueeWidth === 0) return;

				let iterations = 0;
				const maxIterations = 50;
				while (contentWidth < marqueeWidth * 2 && iterations < maxIterations) {
					const children = Array.from(inner.children);
					if (children.length === 0) break;
					children.forEach((child) => inner.appendChild(child.cloneNode(true)));
					const newWidth = inner.scrollWidth;
					if (newWidth === contentWidth) break; // No change, prevent infinite loop
					contentWidth = newWidth;
					iterations++;
				}

				const totalWidth = inner.scrollWidth;
				const from = direction === 'left' ? 0 : -totalWidth / 2;
				const to = direction === 'left' ? -totalWidth / 2 : 0;

				const keyframes = `@keyframes ${uniqueId} { from { transform: translateX(${from}px); } to { transform: translateX(${to}px); } }`;
				let style = document.getElementById(`${uniqueId}-style`);
				if (style) style.remove();
				style = document.createElement('style');
				style.id = `${uniqueId}-style`;
				style.textContent = keyframes;
				document.head.appendChild(style);

				inner.style.animation = `${uniqueId} ${duration}ms linear infinite`;
			};

			mutationObserver = new MutationObserver((mutations) => {
				mutations.forEach((mutation) => {
					if (mutation.attributeName === 'style') update();
				});
			});
			mutationObserver.observe(el, { attributes: true, attributeFilter: ['style'] });

			update();
			resizeHandler = update;
			window.addEventListener('resize', resizeHandler);

			// Store cleanup function on element for manual cleanup if needed
			el.__ddgMarqueeCleanup = cleanup;
		});
	}

	ddg.boot = initSite;
})();