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

	ddg.fs = (() => {
		function whenReady() {
			return new Promise((resolve, reject) => {
				const t = setTimeout(() => reject(new Error('Finsweet list not ready (timeout)')), 10000);

				// Initialize FinsweetAttributes if needed
				window.FinsweetAttributes ||= []; // Initialize if not present

				// Check if list module is already loaded
				const mod = window.FinsweetAttributes?.modules?.list;
				console.log('[ddg.fs] whenReady called, module exists:', !!mod, 'has loading:', !!(mod?.loading));

				if (mod?.loading && typeof mod.loading.then === 'function') {
					// Module exists and has a loading promise - use it
					console.log('[ddg.fs] using existing module loading promise');
					mod.loading.then((instances) => {
						clearTimeout(t);
						const inst = Array.isArray(instances) ? instances[0] : instances;
						if (inst?.items) {
							console.log('[ddg.fs] Finsweet list instance ready (from existing module):', inst);
							resolve(inst);
						} else {
							console.warn('[ddg.fs] no valid instance in existing module:', instances);
							reject(new Error('No valid Finsweet list instance found'));
						}
					}).catch((err) => {
						clearTimeout(t);
						reject(err);
					});
					return;
				}

				// Try to load the list attribute if not already loaded
				try {
					const loadResult = window.FinsweetAttributes?.load?.('list');
					if (loadResult && typeof loadResult.then === 'function') {
						console.log('[ddg.fs] called load(), waiting for result');
						loadResult.then(() => {
							// After load completes, check if module now exists
							const mod = window.FinsweetAttributes?.modules?.list;
							if (mod?.loading && typeof mod.loading.then === 'function') {
								mod.loading.then((instances) => {
									clearTimeout(t);
									const inst = Array.isArray(instances) ? instances[0] : instances;
									if (inst?.items) {
										console.log('[ddg.fs] Finsweet list instance ready (from load):', inst);
										resolve(inst);
									} else {
										reject(new Error('No valid Finsweet list instance found'));
									}
								}).catch(reject);
							} else {
								clearTimeout(t);
								reject(new Error('No list module after load'));
							}
						}).catch((err) => {
							clearTimeout(t);
							reject(err);
						});
						return;
					}
				} catch (err) {
					console.warn('[ddg.fs] load() failed:', err);
				}

				// Fallback: Use the official Finsweet push API for new loads
				console.log('[ddg.fs] using push API as fallback');
				window.FinsweetAttributes.push(['list', (instances) => {
					clearTimeout(t);
					const inst = Array.isArray(instances) ? instances[0] : instances;
					if (inst?.items) {
						console.log('[ddg.fs] Finsweet list instance ready (from push):', inst);
						resolve(inst);
					} else {
						console.warn('[ddg.fs] no valid instance from push:', instances);
						reject(new Error('No valid Finsweet list instance found'));
					}
				}]);
			});
		}
		const restart = () => window.FinsweetAttributes?.modules?.list?.restart?.();
		const onRender = fn => whenReady().then(list => list.addHook?.('afterRender', fn));
		const watchItems = fn => whenReady().then(list => list.watch?.(() => list.items.value, fn));
		return { whenReady, restart, onRender, watchItems };
	})();

	// Site boot
	function initSite() {
		if (data.siteBooted) return;
		data.siteBooted = true;
		console.log('[ddg] booting site');

		requestAnimationFrame(() => {
			initNavigation();
			initModals();
			initAjaxModal();
			initAjaxHome();
			initMarquee();
			initComingSoon();
			initShare();
			initRandomiseFilters();
			initCurrentItemTracker();
			initRelatedFilters();

		});
	}

	function initNavigation() {
		if (ddg.__navInitialized) return;
		ddg.__navInitialized = true;

		const navEl = document.querySelector('.nav');
		if (!navEl) return console.warn('[nav] no .nav element found');
		console.log('[nav] initialized');

		const showThreshold = 50; // px from top to start hiding nav
		const hideThreshold = 100; // px scrolled before nav can hide
		const revealBuffer = 50; // px scroll up needed to reveal nav

		let lastY = window.scrollY;
		let revealDistance = 0;

		// Defensive GSAP setup
		if (typeof ScrollTrigger === 'undefined' || !gsap) {
			console.warn('[nav] GSAP ScrollTrigger not available');
			return;
		}

		// Ensure a ScrollTrigger instance
		ScrollTrigger.create({
			trigger: document.body,
			start: 'top top',
			end: 'bottom bottom',
			onUpdate: () => {
				const y = ScrollTrigger?.scroll?.() ?? window.scrollY;
				const delta = y - lastY;

				// SCROLL UP / DOWN BEHAVIOR
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
			}
		});

		console.log('[nav] ScrollTrigger active');

		// Cleanup for dynamic environments
		if (!ddg.__navCleanup) {
			ddg.__navCleanup = () => {
				console.log('[nav] cleanup triggered');
				ScrollTrigger.getAll().forEach(st => {
					if (st.trigger === document.body) st.kill();
				});
			};
		}
	}

	function initComingSoon() {
		if (ddg.__comingSoonInitialized) return;
		ddg.__comingSoonInitialized = true;

		console.log('[comingSoon] initialized');

		const splitSet = (ddg.__comingSoonSplitEls ||= new Set());
		const lineSel = '.home-list_split-line';
		const tapeSpeed = 5000;

		function getSplit(el) {
			if (el.__ddgSplit) return el.__ddgSplit;
			try {
				const split = SplitText.create(el, {
					type: 'lines',
					autoSplit: true,
					reduceWhiteSpace: true,
					tag: 'span',
					linesClass: 'home-list_split-line'
				});
				el.__ddgSplit = split;
				splitSet.add(el);
				console.log('[comingSoon] split created for', `"${el.textContent.trim()}"`);
				return split;
			} catch (e) {
				console.warn('[comingSoon] split failed', e);
				return null;
			}
		}

		function animate(el, offset) {
			const split = el.__ddgSplit || getSplit(el);
			if (!split) return;
			const lines = el.querySelectorAll(lineSel);
			if (!lines.length) return;

			console.log('[comingSoon] animate', `"${el.textContent.trim()}"`, '→', offset);
			gsap.killTweensOf(lines);
			const widths = Array.from(lines, l => l.offsetWidth);
			gsap.set(lines, { willChange: 'transform' });

			gsap.to(lines, {
				'--home-list--tape-r': offset,
				duration: i => widths[i] / tapeSpeed,
				ease: 'none',
				overwrite: 'auto',
				onComplete: () => gsap.set(lines, { clearProps: 'will-change' })
			});
		}

		$(document)
			.off('.ddgComingSoon')
			.on('mouseenter.ddgComingSoon', '.home-list_item-wrap', function () {
				if (!this.querySelector('[data-coming-soon]')) return;
				const link = this.querySelector('.home-list_item');
				if (!link) return;

				if (!link.__ddgCSInit) {
					link.__ddgCSInit = true;
					if (link.tagName === 'A') $(link).one('click.ddgComingSoon', e => e.preventDefault());
					console.log('[comingSoon] marked as coming soon:', `"${link.textContent.trim()}"`);
				}
				animate(link, 0);
			})
			.on('mouseleave.ddgComingSoon', '.home-list_item-wrap', function () {
				if (!this.querySelector('[data-coming-soon]')) return;
				const link = this.querySelector('.home-list_item');
				if (link) animate(link, '100%');
			});

		let resizeTimer;
		$(window).on('resize.ddgComingSoon', () => {
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => {
				console.log('[comingSoon] resize → clear splits');
				for (const el of splitSet) {
					try { el.__ddgSplit?.revert(); } catch (_) { }
					delete el.__ddgSplit;
				}
				splitSet.clear();
			}, 200);
		});
	}

	function initShare() {
		if (ddg.__shareInitialized) return;
		ddg.__shareInitialized = true;

		const selectors = { btn: '[data-share]' };
		const shareWebhookUrl = 'https://hooks.airtable.com/workflows/v1/genericWebhook/appXsCnokfNjxOjon/wfl6j7YJx5joE3Fue/wtre1W0EEjNZZw0V9';
		const dailyShareKey = 'share_done_date';

		const todayString = () => new Date().toISOString().slice(0, 10);
		const nextMidnight = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d; };
		const setCookieValue = (name, value, exp) => {
			document.cookie = `${name}=${value}; expires=${exp.toUTCString()}; path=/; SameSite=Lax`;
		};
		const getCookieValue = (name) => {
			const row = document.cookie.split('; ').find(r => r.startsWith(name + '=')) || '';
			return row.split('=')[1] || null;
		};
		const markShareComplete = () => {
			const v = todayString(); const exp = nextMidnight();
			localStorage.setItem(dailyShareKey, v);
			sessionStorage.setItem(dailyShareKey, v);
			setCookieValue(dailyShareKey, v, exp);
		};
		const alreadySharedToday = () => {
			const v = todayString();
			return [localStorage.getItem(dailyShareKey), sessionStorage.getItem(dailyShareKey), getCookieValue(dailyShareKey)].includes(v);
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

		const setState = (el, state) => {
			el.setAttribute('data-share-state', state);
			clearTimeout(el.__shareStateTimer);
			el.__shareStateTimer = setTimeout(() => {
				el.removeAttribute('data-share-state');
				el.__shareStateTimer = null;
			}, 2000);
		};

		const decrementCountdown = () => {
			$('[data-share-countdown]').each((_, el) => {
				const $el = $(el);
				let n = parseInt(el.getAttribute('data-share-countdown') || $el.text() || $el.val(), 10);
				if (!Number.isFinite(n)) n = 0;
				const next = Math.max(0, n - 1);
				$el.attr('data-share-countdown', next);
				$el.is('input, textarea') ? $el.val(next) : $el.text(next);
			});
		};

		const sendShareWebhook = (platform) => new Promise((resolve) => {
			const form = document.createElement('form');
			const iframe = document.createElement('iframe');
			const frameName = 'wf_' + Math.random().toString(36).slice(2);
			iframe.name = frameName; iframe.style.display = 'none';
			form.target = frameName; form.method = 'POST'; form.action = shareWebhookUrl; form.style.display = 'none';
			[['platform', platform], ['date', todayString()]].forEach(([name, value]) => {
				const input = document.createElement('input');
				input.type = 'hidden'; input.name = name; input.value = value;
				form.appendChild(input);
			});
			document.body.append(iframe, form);
			form.submit();
			setTimeout(() => { form.remove(); iframe.remove(); resolve(true); }, 800);
		});

		// delegated (covers injected content)
		$(document).off('click.ddgShare').on('click.ddgShare', selectors.btn, async (event) => {
			const el = event.currentTarget;
			event.preventDefault();

			// simple per-button lock
			if (el.__shareLock) return;
			el.__shareLock = true;
			setTimeout(() => { el.__shareLock = false; }, 400);

			const platform = (el.getAttribute('data-share') || '').toLowerCase();
			const shareUrl = el.getAttribute('data-share-url') || window.location.href;
			const shareText = el.getAttribute('data-share-text') || document.title;
			const resolver = shareUrlMap[platform];
			const destination = resolver ? resolver({ url: shareUrl, text: shareText }) : shareUrl;

			// minimal guard
			const realClick = event.isTrusted && document.hasFocus();

			// immediate UI feedback
			decrementCountdown();

			// webhook once/day on genuine clicks
			if (realClick && !alreadySharedToday()) {
				sendShareWebhook(platform).catch(() => { });
				markShareComplete();
			}

			if (platform === 'clipboard') {
				try {
					await navigator.clipboard.writeText(destination);
					setState(el, 'copied');
				} catch (err) {
					console.warn('[share] clipboard failed', err);
					setState(el, 'error');
				}
				return;
			}

			// open new tab; no fallbacks
			const w = window.open('about:blank', '_blank');
			if (w) {
				w.opener = null;
				w.location.href = destination;
			}
		});

		console.log('[share] ready (minimal)');
	}

	function initModals() {
		ddg.modals = ddg.modals || {};
		ddg._modalsKeydownBound = Boolean(ddg._modalsKeydownBound);
		console.log('[modals] initializing');

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

			const ensureTabIndex = (el) => {
				if (el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
			};

			const focusModal = () => {
				const node = ($inner[0] || $modal[0]);
				if (!node) return;
				ensureTabIndex(node);
				try { node.focus({ preventScroll: true }); } catch { try { node.focus(); } catch { } }
			};

			const onKeydownTrap = (e) => {
				if (e.key !== 'Tab') return;
				const root = $modal[0];
				const list = root.querySelectorAll('a[href],button,textarea,input,select,[tabindex]:not([tabindex="-1"])');
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
				const $global = $(`[data-modal-scroll="${id}"]`).first();
				if ($global.length) return $global[0];
				const $local = $modal.find(selectors.scrollAny).first();
				return $local[0] || $inner[0] || $modal[0];
			};

			const scrollToAnchor = (hash) => {
				if (!hash) return;
				let target = null;
				try {
					if (window.CSS?.escape) {
						target = $modal.find(`#${CSS.escape(hash)}`).first()[0] || null;
					} else {
						target = $modal.find(`[id="${hash.replace(/"/g, '\\"')}"]`).first()[0] || null;
					}
				} catch { target = null; }
				if (!target) return;

				const container = resolveScrollContainer();
				if (!container) return;

				const cRect = container.getBoundingClientRect();
				const tRect = target.getBoundingClientRect();
				const cs = getComputedStyle(target);
				const smt = parseFloat(cs.scrollMarginTop || cs.scrollMargin || '0') || 0;
				const nextTop = container.scrollTop + (tRect.top - cRect.top) - smt;

				try { container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' }); }
				catch { container.scrollTop = Math.max(0, nextTop); }

				const guard = (ev) => { if (!container.contains(ev.target)) { try { ev.preventDefault(); } catch { } } };
				window.addEventListener('wheel', guard, { capture: true, passive: false });
				window.addEventListener('touchmove', guard, { capture: true, passive: false });
				setTimeout(() => {
					window.removeEventListener('wheel', guard, true);
					window.removeEventListener('touchmove', guard, true);
				}, 900);
			};

			$modal.on('click.modalAnchors', 'a[href^="#"]', (e) => {
				const href = (e.currentTarget.getAttribute('href') || '');
				if (!href || href === '#' || href.length < 2) return;
				e.preventDefault();
				e.stopPropagation();
				scrollToAnchor(href.slice(1));
				try {
					const u = new URL(window.location.href);
					u.hash = href.slice(1);
					window.history.replaceState(window.history.state, '', u.toString());
				} catch { }
			});

			const open = ({ skipAnimation = false, afterOpen } = {}) => {
				console.log(`[modals:${id}] open (skip=${skipAnimation})`);

				Object.keys(ddg.modals).forEach(k => {
					if (k !== id && ddg.modals[k]?.isOpen?.()) ddg.modals[k].close({ skipAnimation: true });
				});

				lastActiveEl = document.activeElement;
				gsap.killTweensOf([$anim[0], $bg[0]]);
				syncCssState($modal, true, id);

				if (skipAnimation) {
					gsap.set([$bg[0], $anim[0]], { autoAlpha: 1, y: 0 });
					document.addEventListener('keydown', onKeydownTrap, true);
					requestAnimationFrame(focusModal);
					document.dispatchEvent(new CustomEvent('ddg:modal-opened', { detail: { id } }));
					return afterOpen && afterOpen();
				}

				setAnimating(true);
				gsap.set($bg[0], { autoAlpha: 0 });

				gsap.timeline({
					onComplete: () => {
						setAnimating(false);
						document.addEventListener('keydown', onKeydownTrap, true);
						requestAnimationFrame(focusModal);
						document.dispatchEvent(new CustomEvent('ddg:modal-opened', { detail: { id } }));
						afterOpen && afterOpen();
					}
				})
					.to($bg[0], { autoAlpha: 1, duration: 0.18, ease: 'power1.out' }, 0)
					.fromTo($anim[0], { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.32, ease: 'power2.out' }, 0);
			};

			const close = ({ skipAnimation = false, afterClose } = {}) => {
				if (!$modal.hasClass('is-open')) return;
				if (closing) return closingTl;

				console.log(`[modals:${id}] close (skip=${skipAnimation})`);
				closing = true;

				gsap.killTweensOf([$anim[0], $bg[0]]);

				const finish = () => {
					[$modal[0], $inner[0]].forEach(el => el?.classList.remove('is-open'));
					gsap.set([$anim[0], $bg[0], $modal[0], $inner[0]], { clearProps: 'all' });
					document.removeEventListener('keydown', onKeydownTrap, true);
					try { lastActiveEl && lastActiveEl.focus(); } catch { }
					lastActiveEl = null;
					document.dispatchEvent(new CustomEvent('ddg:modal-closed', { detail: { id } }));
					closing = false;
					closingTl = null;
					afterClose && afterClose();
				};

				if (skipAnimation) {
					$bg[0]?.classList.remove('is-open'); // remove bg first
					gsap.set([$bg[0], $anim[0]], { autoAlpha: 0, y: 40 });
					return finish();
				}

				setAnimating(true);

				// 1) remove bg is-open first
				$bg[0]?.classList.remove('is-open');

				// block any interactions while closing
				gsap.set([$modal[0], $inner[0], $bg[0]], { pointerEvents: 'none' });

				// 2) animate out
				closingTl = gsap.timeline({
					onComplete: () => { setAnimating(false); finish(); }
				});

				closingTl.to($anim[0], {
					y: 40,
					autoAlpha: 0,
					duration: 0.32,
					ease: 'power2.in',
					overwrite: 'auto'
				}, 0);

				closingTl.to($bg[0], {
					autoAlpha: 0,
					duration: 0.18,
					ease: 'power1.inOut',
					overwrite: 'auto'
				}, 0);

				return closingTl;
			};

			const isOpen = () => $modal.hasClass('is-open');

			const modal = { open, close, isOpen, $modal, $bg, $inner };
			ddg.modals[id] = modal;

			const initial = $modal.hasClass('is-open');
			syncCssState($modal, initial, id);

			document.dispatchEvent(new CustomEvent('ddg:modal-created', { detail: id }));
			return modal;
		};

		ddg.__createModal = createModal;

		$(document).on('click.modal', selectors.trigger, (e) => {
			const node = e.currentTarget;
			if (node.hasAttribute('data-ajax-modal')) return;
			e.preventDefault();
			const id = node.getAttribute('data-modal-trigger');
			const modal = createModal(id);
			modal?.open();
		});

		$(document).on('click.modal', selectors.close, (e) => {
			e.preventDefault();
			const id = e.currentTarget.getAttribute('data-modal-close');
			if (id) (ddg.modals[id] || createModal(id))?.close();
			else Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
		});

		$(document).on('click.modal', selectors.bg, (e) => {
			if (e.target !== e.currentTarget) return;
			const id = e.currentTarget.getAttribute('data-modal-bg');
			(ddg.modals[id] || createModal(id))?.close();
		});

		if (!ddg._modalsKeydownBound) {
			ddg._modalsKeydownBound = true;
			$(document).on('keydown.modal', (e) => {
				if (e.key === 'Escape') Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
			});
		}

		requestAnimationFrame(() => {
			$(selectors.modal).each((_, el) => {
				const id = el.getAttribute('data-modal-el');
				const open = el.classList.contains('is-open');
				syncCssState($(el), open, id);
			});
		});

		console.log('[modals] ready');
		document.dispatchEvent(new CustomEvent('ddg:modals-ready'));
	}

	function initAjaxModal() {
		if (ddg._ajaxModalInitialized) return;
		ddg._ajaxModalInitialized = true;

		console.log('[ajaxModal] init called');

		const storyModalId = 'story';
		const $embed = $('[data-ajax-modal="embed"]');
		const originalTitle = document.title;
		const homeUrl = '/';

		let storyModal = ddg.modals?.[storyModalId] || null;
		const storyCache = new Map();
		let lock = false;

		let prefetchEnabled = false;
		setTimeout(() => {
			prefetchEnabled = true;
			console.log('[ajaxModal] prefetch enabled');
		}, 2000);

		const parseStory = (html) => {
			try {
				const doc = new DOMParser().parseFromString(html, 'text/html');
				const node = doc.querySelector('[data-ajax-modal="content"]');
				return { $content: node ? $(node) : null, title: doc.title || '' };
			} catch { return { $content: null, title: '' }; }
		};

		const ensureModal = () => {
			if (storyModal && storyModal.$modal?.length) return storyModal;
			if (ddg.__createModal) storyModal = ddg.__createModal(storyModalId) || storyModal;
			return storyModal;
		};

		const openStory = (url, title, $content) => {
			const modal = ensureModal();
			if (!modal) { console.warn('[ajaxModal] story modal not ready'); return; }

			$embed.empty().append($content);
			modal.open({
				afterOpen: () => {
					if (title) document.title = title;
					try { history.pushState({ modal: true }, '', url); } catch { }
					// Local event for listeners that care about the opened story URL
					document.dispatchEvent(new CustomEvent('ddg:story-opened', {
						detail: { url }
					}));
					console.log('[ajaxModal] openStory -> updated history', url);
				}
			});
		};

		document.addEventListener('ddg:modal-closed', (ev) => {
			if (ev.detail?.id !== storyModalId) return;
			document.title = originalTitle;
			try { history.pushState({}, '', homeUrl); } catch { }
			console.log('[ajaxModal] modal closed -> restored home URL/title');
		});

		$(document).on('click.ajax', '[data-ajax-modal="link"]', (e) => {
			const $link = $(e.currentTarget);
			const linkUrl = $link.attr('href');
			if (!linkUrl) return;

			e.preventDefault();
			console.log('[ajaxModal] clicked link', linkUrl);

			if (lock) { console.log('[ajaxModal] locked'); return; }
			lock = true;

			if (storyCache.has(linkUrl)) {
				const { $content, title } = storyCache.get(linkUrl);
				openStory(linkUrl, title, $content);
				lock = false;
				return;
			}

			$embed.empty().append("<div class='modal-skeleton' aria-busy='true'></div>");

			$.ajax({
				url: linkUrl,
				success: (response) => {
					console.log('[ajaxModal] loaded', linkUrl, 'len:', response?.length ?? 0);
					const parsed = parseStory(response);
					if (!parsed.$content) parsed.$content = $("<div class='modal-error'>Failed to load content.</div>");
					storyCache.set(linkUrl, parsed);
					openStory(linkUrl, parsed.title, parsed.$content);
					if (parsed.$content?.[0]) { try { initMarquee(parsed.$content[0]); } catch { } }
				},
				error: () => {
					console.warn('[ajaxModal] load failed');
					$embed.empty().append("<div class='modal-error'>Failed to load content.</div>");
				},
				complete: () => { lock = false; console.log('[ajaxModal] complete'); }
			});
		});

		// Prefetch on hover/touch (snappy UX)
		let prefetchTimer = null;
		$(document).on('mouseenter.ajax touchstart.ajax', '[data-ajax-modal="link"]', (e) => {
			if (!prefetchEnabled) return; // 🔒 skip until 2s have passed
			const url = e.currentTarget.getAttribute('href');
			if (!url || storyCache.has(url)) return;
			clearTimeout(prefetchTimer);
			prefetchTimer = setTimeout(() => {
				$.ajax({
					url, success: (html) => {
						if (storyCache.has(url)) return;
						storyCache.set(url, parseStory(html));
						console.log('[ajaxModal] prefetched', url);
					}
				});
			}, 120);
		});

		window.addEventListener('popstate', () => {
			const path = window.location.pathname;
			const modal = ensureModal();
			if (!modal) return;
			if (!path.startsWith('/stories/') && modal.isOpen()) {
				console.log('[ajaxModal] popstate -> closing story modal');
				modal.close();
			}
		});

		const tryOpenDirectStory = () => {
			const modal = ensureModal();
			if (!modal) return console.warn('[ajaxModal] story modal not found after ready');

			if (!window.location.pathname.startsWith('/stories/')) return;

			const url = window.location.href;
			const after = () => {
				try { history.replaceState({ modal: true }, '', url); } catch { }
				document.dispatchEvent(new CustomEvent('ddg:story-opened', { detail: { url } }));
			};

			if (modal.isOpen()) {
				console.log('[ajaxModal] direct story detected — modal already open, dispatching story-opened');
				after();
			} else {
				console.log('[ajaxModal] direct story detected — opening modal (skipAnimation)');
				modal.open({ skipAnimation: true, afterOpen: after });
			}

			// Safety recheck in case some other script closes it right after load
			setTimeout(() => {
				if (!modal.isOpen()) {
					console.log('[ajaxModal] re-opening story modal after initial close');
					modal.open({ skipAnimation: true, afterOpen: after });
				}
			}, 500);
		};

		// If modals are already initialized, run immediately; otherwise, wait.
		if (ddg.__createModal || (ddg.modals && Object.keys(ddg.modals).length)) {
			tryOpenDirectStory();
		} else {
			document.addEventListener('ddg:modals-ready', tryOpenDirectStory, { once: true });
			console.log('[ajaxModal] waiting for ddg:modals-ready');
		}
	}

	function initAjaxHome() {
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

				// Wait for DOM to settle, then load Finsweet
				requestAnimationFrame(() => {
					// Initialize FinsweetAttributes if needed
					window.FinsweetAttributes ||= []; // Initialize if not present

					// Load the list attribute
					const loadResult = window.FinsweetAttributes?.load?.('list');

					if (loadResult && typeof loadResult.then === 'function') {
						// Wait for load to complete, then wait for the module's loading promise
						loadResult.then(() => {
							const mod = window.FinsweetAttributes?.modules?.list;
							if (mod?.loading && typeof mod.loading.then === 'function') {
								// Wait for the actual list instances to load
								mod.loading.then((instances) => {
									console.log('[ajaxHome] Finsweet list instances loaded:', instances?.length || 0);
									document.dispatchEvent(new CustomEvent('ddg:ajax-home-ready'));
								}).catch((err) => {
									console.warn('[ajaxHome] Finsweet loading promise failed', err);
									document.dispatchEvent(new CustomEvent('ddg:ajax-home-ready'));
								});
							} else {
								console.log('[ajaxHome] Finsweet load completed, dispatching ready');
								document.dispatchEvent(new CustomEvent('ddg:ajax-home-ready'));
							}
						}).catch((err) => {
							console.warn('[ajaxHome] Finsweet load failed', err);
							document.dispatchEvent(new CustomEvent('ddg:ajax-home-ready'));
						});
					} else {
						// Otherwise dispatch immediately
						console.log('[ajaxHome] dispatching ready event immediately');
						document.dispatchEvent(new CustomEvent('ddg:ajax-home-ready'));
					}
				});
			}
		});
	}

	function initRandomiseFilters() {
		const selectors = {
			list: '[fs-list-element="list"]',
			form: '[fs-list-element="filters"]',
			inputs: 'input[type="checkbox"][fs-list-field][fs-list-value]',
			clear: '[fs-list-element="clear"]',
			trigger: '[data-randomfilters]'
		};

		const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

		const apply = (list) => {
			console.log('[randomfilters] applying...');
			const listEl = document.querySelector(selectors.list);
			const formEl = document.querySelector(selectors.form);
			if (!listEl || !formEl) return console.warn('[randomfilters] no form/list');

			const checkboxes = [...formEl.querySelectorAll(selectors.inputs)]
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
			const clearBtn = formEl.querySelector(selectors.clear);
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
			const btn = e.target.closest(selectors.trigger);
			if (!btn) return;
			e.preventDefault();
			if (btn.__rfLock) return;
			btn.__rfLock = true;
			setTimeout(() => (btn.__rfLock = false), 250);
			console.log('[randomfilters] trigger clicked');
			console.log('[randomfilters] waiting for list...');
			// Try once, and if it fails, forcibly reload and retry once more
			ddg.fs.whenReady().then(list => {
				console.log('[randomfilters] list ready, applying random filters');
				apply(list);
			}).catch(err => {
				console.warn('[randomfilters] list not ready', err, '→ forcing reload and retrying once');
				try { window.FinsweetAttributes?.load?.('list'); } catch { }
				setTimeout(() => {
					ddg.fs.whenReady().then(apply);
				}, 250);
			});
		}, true);
	}

	function initMarquee(root = document) {
		console.log('[marquee] init');

		const els = root.querySelectorAll('[data-marquee]:not([data-marquee-init])');
		if (!els.length) return;

		const baseSpeed = 100; // px/s
		const accelTime = 1.2; // s to reach full speed

		function startTween(el) {
			const { inner, distance, duration } = el.__ddgMarqueeConfig || {};
			if (!inner) return;
			el.__ddgMarqueeTween?.kill();

			const tween = gsap.to(inner, {
				x: -distance,
				duration,
				ease: 'none',
				repeat: -1,
				paused: true
			});
			tween.timeScale(0);
			gsap.to(tween, { timeScale: 1, duration: accelTime, ease: 'power1.out' });
			tween.play();
			el.__ddgMarqueeTween = tween;
		}

		function build(el) {
			const inner = el.querySelector('.marquee-inner');
			if (!inner || !el.offsetParent) return;

			// reset clones
			while (inner.children.length > 1 && inner.scrollWidth > el.offsetWidth * 2)
				inner.removeChild(inner.lastChild);

			const width = el.offsetWidth;
			let contentWidth = inner.scrollWidth;
			if (!width || !contentWidth) return;

			// duplicate content until 2× container width
			let i = 0;
			while (inner.scrollWidth < width * 2 && i++ < 20)
				Array.from(inner.children).forEach(c => inner.appendChild(c.cloneNode(true)));

			const totalWidth = inner.scrollWidth;
			const distance = totalWidth / 2;
			const duration = distance / baseSpeed;

			gsap.set(inner, { x: 0 });
			el.__ddgMarqueeConfig = { inner, distance, duration };
			startTween(el);
		}

		els.forEach(el => {
			el.setAttribute('data-marquee-init', '');
			el.querySelector('.marquee-inner')?.remove();

			const inner = document.createElement('div');
			inner.className = 'marquee-inner';
			while (el.firstChild) inner.appendChild(el.firstChild);
			el.appendChild(inner);

			Object.assign(el.style, { overflow: 'hidden' });
			Object.assign(inner.style, {
				display: 'flex',
				gap: getComputedStyle(el).gap || '0px',
				whiteSpace: 'nowrap',
				willChange: 'transform'
			});

			let resizeTimer;
			function handleResize() {
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(() => build(el), 200);
			}

			window.addEventListener('resize', handleResize);
			el.__ddgMarqueeCleanup = () => {
				el.__ddgMarqueeTween?.kill();
				window.removeEventListener('resize', handleResize);
				delete el.__ddgMarqueeTween;
				delete el.__ddgMarqueeConfig;
			};

			el.__ddgMarqueeReady = () => build(el);
		});

		// wait for stable fps before building any marquees
		let stable = 0, last = performance.now();
		requestAnimationFrame(function check(now) {
			const fps = 1000 / (now - last);
			last = now;
			stable = fps > 20 ? stable + 1 : 0;
			if (stable > 10) {
				console.log('[marquee] stable FPS — building');
				els.forEach(el => el.__ddgMarqueeReady?.());
			} else requestAnimationFrame(check);
		});

		// modal lifecycle integration
		document.addEventListener('ddg:modal-opened', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (modal) initMarquee(modal);
		});

		document.addEventListener('ddg:modal-closed', e => {
			const modal = document.querySelector(`[data-modal-el="${e.detail?.id}"]`);
			if (!modal) return;
			modal.querySelectorAll('[data-marquee-init]').forEach(el => {
				try { el.__ddgMarqueeCleanup?.(); } catch { }
				el.removeAttribute('data-marquee-init');
			});
		});
	}

	function initCurrentItemTracker() {
		const logPrefix = '[currentItem]';

		// exported handle
		ddg.currentItem = ddg.currentItem || { item: null, url: null, list: null };

		let lastKey = null;
		let pendingUrl = null; // last seen story url (can arrive before list is ready)

		// ---- helpers ----
		function keyFor(item) {
			return (
				(item?.slug) ||
				(item?.fields?.slug?.value) ||
				(item?.url?.pathname) ||
				(item?.id) ||
				''
			);
		}

		function findItem(list, urlString) {
			if (!list) return null;
			const items = Array.isArray(list.items?.value) ? list.items.value : (list.items || []);
			if (!items.length) return null;

			const u = new URL(urlString || window.location.href, window.location.origin);
			const pathname = u.pathname;
			const slug = pathname.split('/').filter(Boolean).pop() || '';

			// 1) strict pathname match
			let found = items.find(it => {
				try { return it?.url?.pathname === pathname; }
				catch { return false; }
			});
			if (found) return found;

			// 2) fallback slug match (case-insensitive)
			if (slug) {
				const lower = slug.toLowerCase();
				found = items.find(it => {
					const s = (typeof it?.slug === 'string' ? it.slug :
						typeof it?.fields?.slug?.value === 'string' ? it.fields.slug.value : '');
					return s && s.toLowerCase() === lower;
				});
			}
			return found || null;
		}

		function setCurrent(item, url) {
					const k = keyFor(item);
					if (!k) {
						console.log(`${logPrefix} no match for`, url);
						return;
					}
					if (k === lastKey) return; // no change
		
					lastKey = k;
					ddg.currentItem.item = item;
					ddg.currentItem.url = url;
		
					console.log(`${logPrefix} current item changed →`, k, item);
					document.dispatchEvent(new CustomEvent('ddg:current-item-changed', {
						detail: { item, url }
					}));
				}
		function resolve(srcUrl) {
			const list = ddg.currentItem.list;
			const url = srcUrl || pendingUrl || window.location.href;
			if (!list) {
				console.log(`${logPrefix} list not ready yet — waiting...`);
				return;
			}
			const item = findItem(list, url);
			if (item) {
				console.log(`${logPrefix} match found for`, new URL(url, window.location.origin).pathname);
				setCurrent(item, url);
			} else {
				console.log(`${logPrefix} no match yet for`, new URL(url, window.location.origin).pathname, '— will retry after render');
			}
		}

		// capture early story-opened (can fire before list exists)
		document.addEventListener('ddg:story-opened', (e) => {
			pendingUrl = e.detail?.url || window.location.href;
			console.log(`${logPrefix} story-opened (global):`, pendingUrl);
			resolve(pendingUrl);
		});

		// On story pages, the list comes from ajax-home injection
		// Set up the listener FIRST to avoid race condition
		if (window.location.pathname.startsWith('/stories/')) {
			console.log(`${logPrefix} story page detected, setting up ajax-home-ready listener`);
			document.addEventListener('ddg:ajax-home-ready', () => {
				console.log(`${logPrefix} ajax-home-ready received, calling whenReady...`);
				ddg.fs.whenReady().then(list => {
					ddg.currentItem.list = list;
					console.log(`${logPrefix} Finsweet list ready after ajax-home`, list);
					if (typeof list.addHook === 'function') list.addHook('afterRender', () => resolve());
					if (typeof list.watch === 'function') list.watch(() => list.items?.value, () => resolve());
					resolve();
				}).catch(err => {
					console.warn(`${logPrefix} Finsweet list not ready after ajax-home`, err);
				});
			}, { once: true });
		} else {
			// On home page, try to grab the list
			console.log(`${logPrefix} home page, attempting to get list`);
			ddg.fs.whenReady().then(list => {
				ddg.currentItem.list = list;
				console.log(`${logPrefix} Finsweet list ready on home`);
				// re-resolve whenever items render/update
				if (typeof list.addHook === 'function') list.addHook('afterRender', () => resolve());
				if (typeof list.watch === 'function') list.watch(() => list.items?.value, () => resolve());
				resolve();
			}).catch(err => {
				// On home page, list might not exist or be needed - that's ok
				console.log(`${logPrefix} no list on home page (expected if no list element exists)`);
			});
		}

		console.log(`${logPrefix} initialized`);
	}

	function initRelatedFilters() {
		console.log('[relatedFilters] initialized');

		const getNames = (item) => {
			const f = item?.fields || {};
			const byFields = Reflect.ownKeys(f).filter(k => typeof k === 'string');
			const byEls = item?.fieldElements ? Object.keys(item.fieldElements) : [];
			return [...new Set([...byFields, ...byEls])];
		};

		const print = (item) => {
			console.log('--- Related Filter Fields ---');
			for (const n of getNames(item)) {
				const v = item.fields?.[n]?.value ?? item.fields?.[n]?.rawValue;
				if (v == null) continue;
				console.log('field:', n, 'value:', Array.isArray(v) ? v.join(', ') : v);
			}
			console.log('--------------------------');
		};

		const waitAndPrint = (item, tries = 20) => {
			const has = getNames(item).length > 0;
			if (has) return print(item);
			if (tries <= 0) return console.log('[relatedFilters] no field names (after retries)');
			requestAnimationFrame(() => waitAndPrint(item, tries - 1));
		};

		document.addEventListener('ddg:current-item-changed', (e) => {
			const item = e.detail?.item;
			if (!item) return console.log('[relatedFilters] no item found');
			waitAndPrint(item);
		});
	}

	ddg.boot = initSite;
})();