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
	function initSite() {
		if (data.siteBooted) return;
		data.siteBooted = true;
		console.log('[ddg] booting site');

		queueMicrotask(() => ddg.fs.ensureLoad());

		requestAnimationFrame(() => {
			initNavigation();
			initModals();
			initAjaxModal();
			initAjaxHome();
			initMarquee();
			initComingSoon();
			initShare();
			initRandomiseFilters();
		});
	}

	function initNavigation() {
		if (ddg.__navInitialized) return;
		ddg.__navInitialized = true;

		const navEl = document.querySelector('.nav');
		if (!navEl) return console.warn('[nav] no .nav element found');
		console.log('[nav] initialized');

		const showThreshold = 50;
		const hideThreshold = 100;
		const revealBuffer = 50;

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

				// STATE TOGGLE
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

		const sel = { btn: '[data-share]' };
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
		$(document).off('click.ddgShare').on('click.ddgShare', sel.btn, async (event) => {
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
		console.log('[modals] initializing with CSS-state sync + delegated bindings');

		const sel = {
			trigger: '[data-modal-trigger]',
			modal: '[data-modal-el]',
			bg: '[data-modal-bg]',
			inner: '[data-modal-inner]',
			close: '[data-modal-close]',
			scrollAny: '[data-modal-scroll]'
		};

		const syncCssState = ($modal, open, id) => {
			const $bg = $(`[data-modal-bg="${id}"]`);
			const $inner = $modal.find(sel.inner).first();
			[$modal[0], $inner[0], $bg[0]].filter(Boolean).forEach(el => {
				open ? el.classList.add('is-open') : el.classList.remove('is-open');
			});
			console.log(`[modals:${id}] syncCssState -> ${open} (bg:${$bg.length})`);
		};

		const createModal = (id) => {
			if (ddg.modals[id]) return ddg.modals[id];

			const $modal = $(`[data-modal-el="${id}"]`);
			if (!$modal.length) return null;

			const $bg = $(`[data-modal-bg="${id}"]`);
			const $inner = $modal.find(sel.inner).first();
			const $anim = $inner.length ? $inner : $modal;

			let lastActiveEl = null;

			const ensureTabIndex = (el) => { if (el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1'); };
			const focusModal = () => {
				const node = ($inner[0] || $modal[0]);
				if (!node) return;
				ensureTabIndex(node);
				try { node.focus({ preventScroll: true }); } catch { try { node.focus(); } catch (_) { } }
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

			// Resolve scroll container *lazily* (works after AJAX injection)
			const resolveScrollContainer = () => {
				const $global = $(`[data-modal-scroll="${id}"]`).first();
				if ($global.length) return $global[0];
				const $local = $modal.find(sel.scrollAny).first();
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
				} catch (_) { target = null; }
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

				// Briefly guard body scroll while smooth scroll runs
				const guard = (ev) => { if (!container.contains(ev.target)) { try { ev.preventDefault(); } catch { } } };
				window.addEventListener('wheel', guard, { capture: true, passive: false });
				window.addEventListener('touchmove', guard, { capture: true, passive: false });
				setTimeout(() => {
					window.removeEventListener('wheel', guard, true);
					window.removeEventListener('touchmove', guard, true);
				}, 900);
			};

			// Delegate anchor clicks inside the modal (handles injected content)
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
				} catch (_) { }
			});

			const open = ({ skipAnimation = false, afterOpen } = {}) => {
				console.log(`[modals:${id}] open (skipAnimation=${skipAnimation})`);

				Object.keys(ddg.modals).forEach(k => {
					if (k !== id && ddg.modals[k]?.isOpen?.()) ddg.modals[k].close({ skipAnimation: true });
				});

				lastActiveEl = document.activeElement;
				gsap.killTweensOf([$anim[0], $bg[0]]);
				syncCssState($modal, true, id); // Ensure visible before anim

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

			// add near other locals:
			let closing = false;
			let closingTl = null;

			const close = ({ skipAnimation = false, afterClose } = {}) => {
				if (!$modal.hasClass('is-open')) {
					console.log(`[modals:${id}] close() aborted — modal not open`);
					return;
				}

				// 🔒 Reentrancy guard: once we're closing, ignore any other close() calls
				if (closing) {
					console.log(`[modals:${id}] close() ignored — already closing`);
					return closingTl;
				}

				console.log(`[modals:${id}] close(skipAnimation=${skipAnimation})`);
				closing = true;

				gsap.killTweensOf([$anim[0], $bg[0]]);

				const finish = () => {
					console.log(`[modals:${id}] finish(): removing modal + inner classes`);
					// 3️⃣ Remove remaining open classes AFTER the animation
					[$modal[0], $inner[0]].forEach(el => el?.classList.remove('is-open'));

					// Clear all inline props we touched (modal/inner/bg/anim)
					gsap.set([$anim[0], $bg[0], $modal[0], $inner[0]], { clearProps: 'all' });

					document.removeEventListener('keydown', onKeydownTrap, true);
					try { lastActiveEl && lastActiveEl.focus(); } catch { }
					lastActiveEl = null;

					document.dispatchEvent(new CustomEvent('ddg:modal-closed', { detail: { id } }));
					console.log(`[modals:${id}] finish(): complete`);

					closing = false;
					closingTl = null;
					afterClose && afterClose();
				};

				if (skipAnimation) {
					// 1️⃣ Remove bg class first
					$bg[0]?.classList.remove('is-open');
					// 2️⃣ Immediately hide visuals
					gsap.set([$bg[0], $anim[0]], { autoAlpha: 0, y: 40 });
					return finish();
				}

				setAnimating(true);

				// 1️⃣ Remove bg `is-open` first (bg fades away)
				console.log(`[modals:${id}] removing bg is-open`);
				$bg[0]?.classList.remove('is-open');

				// 🛡️ Block further clicks (including bg) during the close
				gsap.set([$modal[0], $inner[0], $bg[0]], { pointerEvents: 'none' });

				// 2️⃣ Animate out (no parent visibility/alpha forcing)
				closingTl = gsap.timeline({
					onStart: () => console.log(`[modals:${id}] animation started`),
					onUpdate: () => {
						const animAlpha = gsap.getProperty($anim[0], 'autoAlpha');
						const bgAlpha = gsap.getProperty($bg[0], 'autoAlpha');
						console.log(`[modals:${id}] anim tick`, { animAlpha, bgAlpha });
					},
					onComplete: () => {
						console.log(`[modals:${id}] animation complete`);
						setAnimating(false);
						finish();
					}
				});

				closingTl.to($anim[0], {
					y: 40,
					autoAlpha: 0,
					duration: 0.32,
					ease: 'power2.in',
					overwrite: 'auto',
				}, 0);

				closingTl.to($bg[0], {
					autoAlpha: 0,
					duration: 0.18,
					ease: 'power1.inOut',
					overwrite: 'auto',
				}, 0);

				return closingTl;
			};

			const isOpen = () => $modal.hasClass('is-open');

			const modal = { open, close, isOpen, $modal, $bg, $inner };
			ddg.modals[id] = modal;

			const initial = $modal.hasClass('is-open');
			console.log(`[modals:${id}] initial state is-open=${initial}`);
			syncCssState($modal, initial, id);

			document.dispatchEvent(new CustomEvent('ddg:modal-created', { detail: id }));
			return modal;
		};

		// Expose factory so ajax module can lazily create the modal
		ddg.__createModal = createModal;

		// Triggers (non-ajax)
		$(document).on('click.modal', sel.trigger, (e) => {
			const node = e.currentTarget;
			if (node.hasAttribute('data-ajax-modal')) return;
			e.preventDefault();
			const id = node.getAttribute('data-modal-trigger');
			console.log('[modals] trigger clicked for', id);
			const modal = createModal(id);
			modal?.open();
		});

		// Close buttons
		$(document).on('click.modal', sel.close, (e) => {
			e.preventDefault();
			const id = e.currentTarget.getAttribute('data-modal-close');
			if (id) (ddg.modals[id] || createModal(id))?.close();
			else Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
		});

		// Backdrop
		$(document).on('click.modal', sel.bg, (e) => {
			if (e.target !== e.currentTarget) return;
			const id = e.currentTarget.getAttribute('data-modal-bg');
			console.log('[modals] bg clicked for', id);
			(ddg.modals[id] || createModal(id))?.close();
		});

		// ESC
		if (!ddg._modalsKeydownBound) {
			ddg._modalsKeydownBound = true;
			$(document).on('keydown.modal', (e) => {
				if (e.key === 'Escape') Object.values(ddg.modals).forEach(m => m.isOpen() && m.close());
			});
		}

		// Post-init CSS sanity pass
		requestAnimationFrame(() => {
			console.log('[modals] post-init CSS sync check');
			$(sel.modal).each((_, el) => {
				const id = el.getAttribute('data-modal-el');
				const open = el.classList.contains('is-open');
				syncCssState($(el), open, id);
			});
		});

		console.log('[modals] initialized with lazy + scroll + delegated bindings');
		document.dispatchEvent(new CustomEvent('ddg:modals-ready'));
	}

	function initAjaxModal() {
		if (ddg._ajaxModalInitialized) return;
		ddg._ajaxModalInitialized = true;

		console.log('[ajaxModal] init called');

		const modalId = 'story';
		const $embed = $('[data-ajax-modal="embed"]');
		const originalTitle = document.title;
		const homeUrl = '/';

		let storyModal = ddg.modals?.[modalId] || null;
		const storyCache = new Map();
		let lock = false;

		// === ADD THIS: delay prefetch activation for 2s after load ===
		let prefetchEnabled = false;
		setTimeout(() => {
			prefetchEnabled = true;
			console.log('[ajaxModal] prefetch enabled');
		}, 2000);
		// =============================================================

		const parseStory = (html) => {
			try {
				const doc = new DOMParser().parseFromString(html, 'text/html');
				const node = doc.querySelector('[data-ajax-modal="content"]');
				return { $content: node ? $(node) : null, title: doc.title || '' };
			} catch { return { $content: null, title: '' }; }
		};

		const ensureModal = () => {
			if (storyModal && storyModal.$modal?.length) return storyModal;
			if (ddg.__createModal) storyModal = ddg.__createModal(modalId) || storyModal;
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
					console.log('[ajaxModal] openStory -> updated history', url);
				}
			});
		};

		document.addEventListener('ddg:modal-closed', (ev) => {
			if (ev.detail?.id !== modalId) return;
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
		let pfTimer = null;
		$(document).on('mouseenter.ajax touchstart.ajax', '[data-ajax-modal="link"]', (e) => {
			if (!prefetchEnabled) return; // 🔒 skip until 2s have passed
			const url = e.currentTarget.getAttribute('href');
			if (!url || storyCache.has(url)) return;
			clearTimeout(pfTimer);
			pfTimer = setTimeout(() => {
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

		document.addEventListener('ddg:modals-ready', () => {
			const modal = ensureModal();
			if (!modal) return console.warn('[ajaxModal] story modal not found after ready');
			if (window.location.pathname.startsWith('/stories/')) {
				modal.open({
					skipAnimation: true, afterOpen: () => {
						try { history.replaceState({ modal: true }, '', window.location.href); } catch { }
					}
				});
			}
		}, { once: true });

		console.log('[ajaxModal] waiting for ddg:modals-ready');
	}

	function initAjaxHome () {
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
		console.log('[marquee] init', root);

		const elements = root.querySelectorAll('[data-marquee]:not([data-marquee-init])');
		if (!elements.length) return console.log('[marquee] none found');

		const BASE_SPEED = 100; // pixels per second (same for all marquees)

		elements.forEach(el => {
			el.setAttribute('data-marquee-init', '');
			console.log('[marquee] setup', el);

			// Wrap existing content
			const inner = document.createElement('div');
			inner.className = 'marquee-inner';
			while (el.firstChild) inner.appendChild(el.firstChild);
			el.appendChild(inner);

			Object.assign(el.style, {
				display: 'flex',
				overflow: 'hidden'
			});
			Object.assign(inner.style, {
				display: 'flex',
				gap: 'inherit',
				width: 'max-content',
				willChange: 'transform'
			});

			let tween = null;
			let resizeTimer = null;

			function cleanup() {
				console.log('[marquee] cleanup');
				if (tween) tween.kill();
				window.removeEventListener('resize', handleResize);
				el.__ddgMarqueeCleanup = null;
			}

			function buildMarquee() {
				if (tween) tween.kill();
				if (el.offsetParent === null) return; // skip hidden

				const elWidth = el.offsetWidth;
				let contentWidth = inner.scrollWidth;

				if (!contentWidth || !elWidth) return;
				// Duplicate until wider than container * 2 for seamless scroll
				let iterations = 0;
				while (inner.scrollWidth < elWidth * 2 && iterations < 50) {
					Array.from(inner.children).forEach(c => inner.appendChild(c.cloneNode(true)));
					iterations++;
				}

				contentWidth = inner.scrollWidth;
				const distance = contentWidth / 2; // One full cycle
				const duration = distance / BASE_SPEED; // speed = px/s

				console.log(`[marquee] width:${contentWidth}px duration:${duration}s`);

				gsap.set(inner, { x: 0 });
				tween = gsap.to(inner, {
					x: -distance,
					duration,
					ease: 'none',
					repeat: -1
				});
			}

			function handleResize() {
				clearTimeout(resizeTimer);
				resizeTimer = setTimeout(buildMarquee, 250);
			}

			buildMarquee();
			window.addEventListener('resize', handleResize);
			el.__ddgMarqueeCleanup = cleanup;
		});

		console.log('[marquee] complete');
	}

	ddg.boot = initSite;
})();