// ddg.js — site behaviour hub
(function () {
	// namespace and state management
	ddg = window.ddg ??= {};
	ddg.helperFunctions ??= {};
	ddg.features ??= {};

	const state =
		(ddg.state ??= {
			resources: {},
			storyCache: new Set(),
			siteBooted: false,
		});

	const $j = window.$;

	// dom and shared utilities
	const select = (selector, root = document) => {
		const $root = root === document ? $j : $j(root);
		return (root === document ? $j(selector) : $root.find(selector)).get(0) ?? null;
	};

	const select_all = (selector, root = document) => {
		const $root = root === document ? $j : $j(root);
		return (root === document ? $j(selector) : $root.find(selector)).toArray();
	};

	const debounce = (fn, delay = 200) => {
		let timer;
		return (...args) => {
			clearTimeout(timer);
			timer = setTimeout(() => fn(...args), delay);
		};
	};
	const create_selector_map = (map, root = document) => {
		const api = {};

		Object.entries(map).forEach(([key, selector]) => {
			const getter = () => select(selector, root);
			getter.all = () => select_all(selector, root);
			getter.selector = selector;
			api[key] = getter;
		});

		return api;
	};

	const resolve_story_slug = (fragment, fallback = window.location.pathname) =>
		fragment?.dataset?.storySlug || fallback;
	const ensure_resource = (store, key, factory) => (store[key] ??= factory());
	const register_list_hook = (handler) => {
		(window.FinsweetAttributes ||= []).push([
			"list",
			(lists) => lists.forEach((listInstance) => handler(listInstance)),
		]);
	};

	function createLayoutRefresher() {
		const refresh = debounce(() => {
			if (typeof ScrollTrigger !== "undefined") {
				ScrollTrigger.refresh();
			}
		}, 100);

		return () => refresh();
	}

	const refreshLayout = createLayoutRefresher();

	// boots all features in order
	function initSite() {
		if (state.siteBooted) return;
		state.siteBooted = true;

		featureOrder.forEach((feature) => feature());
	}

	// hides/reveals the header on scroll
	function initNavigation() {
		const nav = select(".nav");
		if (!nav) return;

		const showThreshold = 50;
		const hideThreshold = 100;
		const revealBuffer = 50;
		let lastScrollY = window.scrollY;
		let revealDistance = 0;

		ScrollTrigger.create({
			trigger: document.body,
			start: "top top",
			end: "bottom bottom",
			onUpdate() {
				const y = window.scrollY;
				const delta = y - lastScrollY;

				if (y <= showThreshold) {
					nav.classList.remove("is-hidden", "is-past-threshold");
					revealDistance = 0;
				} else if (delta > 0 && y > hideThreshold) {
					nav.classList.add("is-hidden", "is-past-threshold");
					revealDistance = 0;
				} else if (delta < 0) {
					revealDistance -= delta;
					if (revealDistance >= revealBuffer) {
						nav.classList.remove("is-hidden");
						revealDistance = 0;
					}
				}

				nav.classList.toggle("is-past-threshold", y > hideThreshold);
				lastScrollY = y;
			},
		});
	}

	// drives the top progress bar
	function initPageProgress() {
		const selectors = create_selector_map({
			bar: ".page-progress_bar",
			homeList: ".home-list",
			homeListItem: ".home-list_item",
		});

		const progressBar = selectors.bar();
		if (!progressBar) return;

		gsap.set(progressBar, { scaleX: 0 });

		gsap.to(progressBar, {
			scaleX: 1,
			ease: "none",
			scrollTrigger: {
				trigger: document.body,
				start: "top top",
				end: "bottom bottom",
				scrub: 0.75,
			},
		});

		const homeList = selectors.homeList();
		if (homeList) {
			const hasListItems = () => selectors.homeListItem.all().length > 0;

			if (!hasListItems()) {
				const waitObserver = new MutationObserver(() => {
					if (!hasListItems()) return;
					waitObserver.disconnect();
					requestAnimationFrame(refreshLayout);
				});
				waitObserver.observe(homeList, { childList: true, subtree: true });
			} else {
				refreshLayout();
			}

			const listObserver = new MutationObserver(() => refreshLayout());
			listObserver.observe(homeList, { childList: true, subtree: true });
		}

		register_list_hook((listInstance) => {
			listInstance.addHook("afterRender", refreshLayout);
		});
	}

	// animates “coming soon” list items with a SplitText hover effect
	function initTicker() {
		const controller = createTickerController();
		if (!controller) return;
		state.resources.tickerTape = controller;

		register_list_hook((listInstance) => {
			listInstance.addHook("afterRender", () => {
				state.resources.tickerTape?.refresh?.();
			});
		});

		function createTickerController() {
			const tapeSpeed = 5000;
			let splitTextInstances = [];
			let comingSoonItems = [];

			const handleResize = debounce(refresh, 200);
			$j(window).on("resize.ddgTicker", handleResize);
			refresh();

			return {
				refresh,
				destroy() {
					$j(window).off("resize.ddgTicker", handleResize);
					teardown();
				},
			};

			function refresh() {
				teardown();
				comingSoonItems = select_all(
					'.home-list_item-wrap[data-story-status="coming-soon"] .home-list_item'
				);

				if (!comingSoonItems.length) return;

				comingSoonItems.forEach((item) => {
					const splitTextInstance = SplitText.create(item, {
						type: "lines",
						autoSplit: true,
						tag: "span",
						linesClass: "home-list_split-line",
					});
					splitTextInstances.push(splitTextInstance);

					const $item = $j(item);
					$item.on("mouseenter.ddgTicker", handleHoverIn);
					$item.on("mouseleave.ddgTicker", handleHoverOut);
					if (item.tagName === "A") $item.on("click.ddgTicker", preventDefault);
				});
			}

			function handleHoverIn(event) {
				animateLines(event.currentTarget, 0);
			}

			function handleHoverOut(event) {
				animateLines(event.currentTarget, "100%");
			}

			function animateLines(item, offset) {
				const lines = gsap.utils.toArray(item.querySelectorAll(".home-list_split-line"));
				gsap.killTweensOf(lines);
				gsap.to(lines, {
					"--home-list--tape-r": offset,
					duration: (i, el) => el.offsetWidth / tapeSpeed,
					ease: "linear",
				});
			}

			function preventDefault(event) {
				event.preventDefault();
			}

			function teardown() {
				splitTextInstances.forEach((instance) => instance.revert());
				splitTextInstances = [];

				comingSoonItems.forEach((item) => {
					const $item = $j(item);
					$item.off("mouseenter.ddgTicker", handleHoverIn);
					$item.off("mouseleave.ddgTicker", handleHoverOut);
					if (item.tagName === "A") $item.off("click.ddgTicker", preventDefault);
				});
				comingSoonItems = [];
			}
		}
	}

	// handles home filters modal and randomiser
	function initFilters() {
		const selectors = create_selector_map({
			panel: ".c-home-filters",
			searchButtons: ".c-search-btn",
			closeButtons: ".c-circle-button[data-action='close'], .filters_submit",
			randomButtons: ".random-filter",
		});
		const cloneFilters = (value) => JSON.parse(JSON.stringify(value));
		const pickRandomValue = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

		const modal = ensure_resource(state.resources, "filterModal", () =>
			createFilterModalController(selectors.panel.selector)
		);
		if (!modal) return;

		ensureFilterActionDelegation();

		bindModalTriggers(modal);
		attachRandomiser(modal);

		function createFilterModalController(selectorOrElement) {
			const panel =
				typeof selectorOrElement === "string"
					? select(selectorOrElement)
					: selectorOrElement instanceof Element
						? selectorOrElement
						: select(selectorOrElement);
			if (!panel) return null;

			let previousBodyOverflow = "";
			let isScrollLocked = false;

			return { open, close, ensureHidden };

			function open() {
				panel.classList.add("is-open");
				panel.style.display = "block";
				setAriaHidden(false);
				lockBodyScroll();
			}

			function close() {
				panel.classList.remove("is-open");
				panel.style.display = "none";
				setAriaHidden(true);
				unlockBodyScroll();
			}

			function ensureHidden() {
				if (!panel.classList.contains("is-open")) {
					panel.style.display = "none";
					setAriaHidden(true);
				}
			}

			function setAriaHidden(isHidden) {
				panel.setAttribute("aria-hidden", isHidden ? "true" : "false");
			}

			function lockBodyScroll() {
				if (isScrollLocked) return;
				previousBodyOverflow = document.body.style.overflow;
				document.body.style.overflow = "hidden";
				isScrollLocked = true;
			}

			function unlockBodyScroll() {
				if (!isScrollLocked) return;
				document.body.style.overflow = previousBodyOverflow || "";
				previousBodyOverflow = "";
				isScrollLocked = false;
			}
		}

		function ensureFilterActionDelegation() {
			if (state.resources.__filterActionDelegation) return;

			$j(document.body).on("click.ddgFilters", "[data-filter-action]", (event) => {
				const $trigger = $j(event.currentTarget);
				const action = $trigger.data("filterAction");
				const controller = state.resources.filterModal;
				if (!controller || !action) return;

				if (action === "open") {
					if ($trigger.is("a")) event.preventDefault();
					controller.open();
				} else if (action === "close") {
					if ($trigger.is("a") || $trigger.is("button")) {
						event.preventDefault();
					}
					controller.close();
				}
			});

			state.resources.__filterActionDelegation = true;
		}

		function bindModalTriggers({ ensureHidden }) {
			const searchButtons = selectors.searchButtons.all();
			const closeButtons = selectors.closeButtons.all();

			if (!searchButtons.length) {
				ensureHidden();
				return;
			}

			searchButtons.forEach((button) => {
				button.dataset.filterAction = "open";
			});

			closeButtons.forEach((button) => {
				button.dataset.filterAction = "close";
			});

			ensureHidden();
		}

		function attachRandomiser(filterModal) {
			const randomButtons = selectors.randomButtons.all();
			if (!randomButtons.length) return;

			register_list_hook((listInstance) => {
				const initialFilters = cloneFilters(listInstance.filters.value);

				listInstance.addHook("afterRender", () => {
					if (!listInstance.__ddgRandomActive) return;
					filterModal.close();
					listInstance.__ddgRandomActive = false;
				});

				$j(randomButtons)
					.off("click.ddgRandomiser")
					.on("click.ddgRandomiser", () => runRandom(listInstance, initialFilters));
			});

			function runRandom(listInstance, initialFilters, minResults = 3, maxTries = 20, delay = 200) {
				const fieldsData = listInstance.allFieldsData.value;
				const locationKey = Object.keys(fieldsData).find((key) => key.toLowerCase() === "location");
				if (!locationKey) {
					console.warn("⚠️ No 'location' field found in allFieldsData.");
					return;
				}

				if (listInstance.__ddgRandomInterval) {
					clearInterval(listInstance.__ddgRandomInterval);
					listInstance.__ddgRandomInterval = null;
				}

				const applySelection = () => {
					const groups = buildGroups(fieldsData, locationKey);
					if (!groups.length) return false;
					applyGroups(listInstance, initialFilters, groups);
					listInstance.__ddgRandomActive = true;
					return true;
				};

				if (!applySelection()) return;

				let attempt = 0;
				const updateCounter = () => {
					const counter = select("#resultsCount");
					if (counter) counter.textContent = listInstance.items.value.length;
				};
				const stopInterval = () => {
					if (listInstance.__ddgRandomInterval) {
						clearInterval(listInstance.__ddgRandomInterval);
						listInstance.__ddgRandomInterval = null;
					}
					updateCounter();
				};

				listInstance.__ddgRandomInterval = setInterval(() => {
					const count = listInstance.items.value.length;
					if (count >= minResults || attempt >= maxTries) {
						stopInterval();
						return;
					}

					attempt += 1;
					if (!applySelection()) {
						stopInterval();
					}
				}, delay);
			}

			function buildGroups(fieldsData, locationKey) {
				const chosenLocation = pickRandomValue(Array.from(fieldsData[locationKey].rawValues || []));
				if (!chosenLocation) {
					console.warn("⚠️ Unable to select a random location.");
					return [];
				}

				const groups = [createGroup("rand-location", locationKey, chosenLocation)];

				if (Math.random() < 0.5) {
					const otherKey = pickRandomValue(Object.keys(fieldsData).filter((key) => key !== locationKey));
					const otherValue = pickRandomValue(Array.from(fieldsData[otherKey]?.rawValues || []));
					if (otherKey && otherValue) groups.push(createGroup(`rand-${otherKey}`, otherKey, otherValue));
				}

				return groups;
			}

			function createGroup(id, fieldKey, value) {
				return {
					id,
					conditionsMatch: "and",
					conditions: [
						{
							id: `${fieldKey}-cond`,
							type: "checkbox",
							fieldKey,
							value,
							op: "equal",
							interacted: true,
						},
					],
				};
			}

			function applyGroups(listInstance, initialFilters, groups) {
				listInstance.filters.value = cloneFilters(initialFilters);
				listInstance.triggerHook("filter");

				select_all('[fs-cmsfilter-field]').forEach((el) => {
					if (el.type === "checkbox") el.checked = false;
				});

				groups.forEach(({ conditions }) => {
					conditions.forEach(({ fieldKey, value }) => {
						const input = select(`[fs-list-field="${fieldKey}"][fs-list-value="${value}"]`);
						if (input) {
							input.checked = true;
							input.dispatchEvent(new Event("change", { bubbles: true }));
						} else {
							console.warn(`⚠️ Could not find input for ${fieldKey} = ${value}`);
						}
					});
				});

				listInstance.filters.value = {
					groupsMatch: "and",
					groups,
				};
				listInstance.triggerHook("filter");
			}
		}
	}

	// mounts the splide carousel for the activity bar
	function initActivityBar() {
		const activityEl = select(".activity.splide");
		if (!activityEl) return;

		const splide = new Splide(activityEl, {
			type: "loop",
			perPage: "auto",
			perMove: 1,
			gap: "0",
			autoplay: false,
			autoScroll: {
				speed: 1,
				pauseOnHover: true,
			},
			arrows: false,
			pagination: false,
			drag: true,
			clones: 5,
		});

		splide.mount(window.splide.Extensions);
	}

	// handles delegated sharing buttons
	function initSocialShares() {
		if (state.resources.__shareDelegation) return;

		const shareHandlers = new Map([
			["facebook messenger", (url) => `fb-messenger://share/?link=${url}`],
			["whatsapp", (url) => `https://wa.me/?text=${url}`],
			["snapchat", (url) => `https://www.snapchat.com/scan?attachmentUrl=${url}`],
		]);

		const handleInstagram = () => {
			if (navigator.share) {
				navigator
					.share({ title: document.title, url: window.location.href })
					.catch((err) => console.warn("Share cancelled or failed", err));
				return;
			}
			alert("Instagram sharing isn’t supported directly. Opening Instagram profile instead.");
		};

		$j(document.body).on("click.ddgShare", '[data-action="share"][data-custom-share]', (event) => {
			const $trigger = $j(event.currentTarget);

			event.preventDefault();
			const platform = $trigger.data("customShare")?.toString().trim().toLowerCase();
			if (!platform) return;

			if (platform === "instagram") {
				handleInstagram();
				return;
			}

			const handler = shareHandlers.get(platform);
			if (!handler) {
				console.warn("Unsupported share target:", platform);
				return;
			}

			const shareUrl = handler(encodeURIComponent(window.location.href));
			if (shareUrl) window.open(shareUrl, "_blank", "noopener,noreferrer");
		});

		state.resources.__shareDelegation = true;
	}

	// queues fragment hooks for story content
	function initStory() {
		const storyApi = ensure_resource(state.resources, "story", createStoryModule);
		storyApi.process(document);

		function createStoryModule() {
			const processed = state.storyCache;
			const queue = [];
			let scheduled = false;
			const resolved = Promise.resolve();
			const schedule =
				typeof queueMicrotask === "function" ? queueMicrotask : (cb) => resolved.then(cb);

			return { process };

			function process(root) {
				if (!root) return;
				queue.push(root);
				if (scheduled) return;
				scheduled = true;
				schedule(flushQueue);
			}

			function flushQueue() {
				scheduled = false;
				while (queue.length) handleFragment(queue.shift());
			}

			function handleFragment(root) {
				const frag = select("#ddg-story-fragment", root);
				if (!frag) return;

				const slug = resolve_story_slug(frag);
				if (processed.has(slug)) return;
				processed.add(slug);

				// story-specific hooks can be initialised here
			}
		}
	}

	// loads and manages the story overlay modal via htmx
	function initStoryModal() {
		const doc = document;
		const selectors = create_selector_map({
			modal: "#story-modal",
			panel: "#story-modal-panel",
			content: "#story-modal-content",
			loadingIndicator: "#story-modal-loading",
			main: "main",
			filterPanel: ".c-home-filters",
			storyFragment: "#ddg-story-fragment",
			storyLinks: '.home-list_item[href^="/stories/"]',
			storyListRoot: ".home-list",
			storyClose: "[data-ddg-close]",
			searchOpen: "[data-search-open]",
			searchClose: "[data-search-close]",
			focusTargets: "h1, h2, [tabindex], a, button, input, select, textarea",
		});
		const tagSelector = (tag) => `input[fs-list-field="tags"][fs-list-value="${CSS.escape(tag)}"]`;

		const modal = selectors.modal();
		const panel = selectors.panel();
		const content = selectors.content();
		const loadingIndicator = selectors.loadingIndicator();
		const mainEl = selectors.main();
		const filterPanel = selectors.filterPanel();
		const $filterPanel = filterPanel ? $j(filterPanel) : null;
		const storyList = selectors.storyListRoot();
		const $modal = modal ? $j(modal) : null;
		const $content = content ? $j(content) : null;
		const $body = $j(document.body);
		const $window = $j(window);
		const $loading = loadingIndicator ? $j(loadingIndicator) : null;

		if (!modal || !content) return;
		if (modal.dataset.ddgStoryModalInit === "true") return;
		modal.dataset.ddgStoryModalInit = "true";
		const fragmentsCache = ensure_resource(state.resources, "storyFragments", () => new Map());
		let activeRequest = null;

		let lastFocusEl = null;
		let currentSlug = null;
		const initialHomeUrl = isStoryPath(location.pathname)
			? "/"
			: `${location.pathname}${location.search}${location.hash}` || "/";

		window.__ddgStoryQueue ||= [];

		const boot = () => {
			setupStoryLinks();
			applyQueryStateOnHome();
			startStoryLinkObserver();
		};

		if (doc.readyState === "loading") {
			doc.addEventListener("DOMContentLoaded", boot, { once: true });
		} else {
			boot();
		}

		$modal?.on("click.ddgStoryModal", (event) => {
			if ($j(event.target).closest(selectors.storyClose.selector).length) {
				event.preventDefault();
				requestCloseToHome();
			}
		});

		$window.on("keydown.ddgStoryModal", (event) => {
			if (event.key === "Escape" && modal.classList.contains("is-open")) {
				event.preventDefault();
				requestCloseToHome();
			}
		});

		$window.on("popstate.ddgStoryModal", () => {
			if (isStoryPath(location.pathname)) {
				if (!modal.classList.contains("is-open")) openStoryModal();
				if (currentSlug !== location.pathname) loadStory(location.pathname, { pushState: false });
			} else {
				if (modal.classList.contains("is-open")) closeStoryModal();
				applyQueryStateOnHome();
			}
		});

		function ensureStoryInit(root) {
			if (window.ddg?.initStory) {
				window.ddg.initStory(root);
			} else {
				window.__ddgStoryQueue.push(root);
			}
		}

		function openStoryModal() {
			if (modal.classList.contains("is-open")) return;

			lastFocusEl = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
			modal.style.display = "block";
			modal.setAttribute("aria-hidden", "false");
			doc.documentElement.classList.add("story-modal-open");
			modal.classList.add("is-open");

			mainEl?.setAttribute("inert", "");
			requestAnimationFrame(() => panel?.focus?.({ preventScroll: true }));
		}

		function closeStoryModal({ restoreFocus = true } = {}) {
			if (!modal.classList.contains("is-open")) return;

			modal.classList.remove("is-open");
			modal.style.display = "none";

			modal.setAttribute("aria-hidden", "true");
			doc.documentElement.classList.remove("story-modal-open");
			mainEl?.removeAttribute("inert");
			$content?.empty();
			$loading?.attr("hidden", "hidden");
			delete content.dataset.currentSlug;
			currentSlug = null;

			if (restoreFocus) lastFocusEl?.focus?.();
		}

		function loadStory(path, { pushState = true } = {}) {
			if (!path) return Promise.resolve();

			const url = new URL(path, location.origin);
			const requestKey = `${url.pathname}${url.search}`;
			if (pushState) history.pushState({}, "", requestKey);

			return ensureStoryFragment(requestKey, { prefetch: false }).then((html) => {
				renderStoryContent(html, url.pathname);
				return html;
			});
		}

		function ensureStoryFragment(path, { prefetch } = {}) {
			const url = new URL(path, location.origin);
			const key = `${url.pathname}${url.search}`;

			if (fragmentsCache.has(key)) {
				return Promise.resolve(fragmentsCache.get(key));
			}

			if (!prefetch && activeRequest?.abort) {
				activeRequest.abort();
			}

			if (!prefetch) {
				$loading?.removeAttr("hidden");
			}

			const requestUrl = new URL(url.href, location.origin);
			if (!requestUrl.searchParams.has("partial")) {
				requestUrl.searchParams.set("partial", "1");
			}

			const xhr = $j.ajax({
				url: requestUrl.toString(),
				method: "GET",
				dataType: "html",
				cache: false,
			});

			if (!prefetch) activeRequest = xhr;

			return new Promise((resolve, reject) => {
				xhr
					.done((response) => {
						try {
							const fragmentHtml = extractStoryFragment(response, key);
							fragmentsCache.set(key, fragmentHtml);
							resolve(fragmentHtml);
						} catch (error) {
							if (!prefetch) handleStoryError(error);
							reject(error);
						}
					})
					.fail((jqXHR, textStatus) => {
						const error = new Error(`Unable to load story: ${textStatus || jqXHR.status}`);
						if (!prefetch) handleStoryError(error);
						reject(error);
					})
					.always(() => {
						if (!prefetch && activeRequest === xhr) {
							activeRequest = null;
						}
					});
			});
		}

		function renderStoryContent(fragmentHtml, slugHint) {
			if (!$content) return;

			$content.html(fragmentHtml);

			const frag = select(selectors.storyFragment.selector, content);
			if (!frag) {
				const error = new Error("Story fragment missing from response.");
				handleStoryError(error);
				throw error;
			}

			const slug = resolve_story_slug(frag, slugHint);
			currentSlug = slug;
			content.dataset.currentSlug = slug;

			if (modal && !modal.dataset.homeFallback) {
				modal.dataset.homeFallback = "/";
			}

			ensureStoryInit(content);
			$loading?.attr("hidden", "hidden");

			if (!modal.classList.contains("is-open")) {
				openStoryModal();
			}

			const focusTarget =
				frag.querySelector("[data-modal-focus]") ||
				select(selectors.focusTargets.selector, content);

			focusTarget?.focus?.({ preventScroll: true });
			window.ddg?.functions?.trackStoryView?.(slug, { source: "modal" });
		}

		function extractStoryFragment(response, key) {
			if (typeof response !== "string") {
				response = response?.toString?.() ?? "";
			}

			if (!response.trim()) {
				throw new Error(`Empty story response for ${key}`);
			}

			const parser = new DOMParser();
			const doc = parser.parseFromString(response, "text/html");
			const fragment = doc.querySelector("#ddg-story-fragment");

			if (!fragment) {
				throw new Error(`Story fragment missing for ${key}`);
			}

			return fragment.outerHTML;
		}

		function handleStoryError(error) {
			console.error(error);
			$loading?.attr("hidden", "hidden");
			if ($content) {
				$content.html(
					'<div class="story-modal_error">Sorry, we could not load that story. Please try again.</div>'
				);
			}
			if (!modal.classList.contains("is-open")) openStoryModal();
		}

		function prefetchStory(path) {
			if (!path) return;
			ensureStoryFragment(path, { prefetch: true }).catch((error) => {
				console.warn("Story prefetch failed", error);
			});
		}

		function requestCloseToHome() {
			forceCloseToHome();
		}

		function forceCloseToHome() {
			const fallback = modal.dataset.homeFallback || initialHomeUrl || "/";
			history.replaceState({}, "", fallback);

			delete modal.dataset.homeFallback;
			closeStoryModal();
			applyQueryStateOnHome();
		}

		function applyQueryStateOnHome() {
			const url = new URL(location.href);
			const openStoryParam = url.searchParams.get("open");
			const tag = url.searchParams.get("tag");
			const openSearch = url.searchParams.get("search") === "1";

			if (openStoryParam && !isStoryPath(location.pathname)) {
				if (modal) {
					const fallbackParams = new URLSearchParams(url.search);
					fallbackParams.delete("open");
					const fallbackQuery = fallbackParams.toString();
					const fallbackUrl = `${url.pathname}${fallbackQuery ? `?${fallbackQuery}` : ""}${url.hash}`;
					modal.dataset.homeFallback = fallbackUrl || "/";
				}

				loadStory(openStoryParam, { pushState: false })
					.then(() => {
						history.replaceState({}, "", openStoryParam);
					})
					.catch(() => {
						history.replaceState({}, "", url.pathname);
					});
			}

			if (tag) enableTagFilter(tag);
			if (openSearch) {
				openSearchModal();
			} else {
				closeSearchModal();
			}
		}

		function enableTagFilter(tag) {
			if (!tag) return;

			const selector = tagSelector(tag);
			const input = select(selector, doc);

			if (input && !input.checked) input.click();
		}

		function openSearchModal() {
			if (!$filterPanel) return;

			if (!$filterPanel.hasClass("is-open")) {
				const opener = selectors.searchOpen();
				opener && $j(opener).trigger("click");
			}
		}

		function closeSearchModal() {
			if (!$filterPanel) return;

			if ($filterPanel.hasClass("is-open")) {
				$j(selectors.searchClose.selector).trigger("click");
			}
		}

		function setupStoryLinks() {
			selectors.storyLinks.all().forEach((link) => {
				const href = link.getAttribute("href");
				if (!href) return;

				const url = new URL(href, location.origin);
				// Keep these attributes on each story tile: data-ddg-story-link marks the element for ddg,
				// data-ddg-story-path stores the absolute path, and data-ddg-story-bound prevents rebinding.
				link.dataset.ddgStoryLink = "true";
				link.dataset.ddgStoryPath = `${url.pathname}${url.search}`;
				link.removeAttribute("hx-get");
				link.removeAttribute("hx-select");
				link.removeAttribute("hx-target");
				link.removeAttribute("hx-swap");
				link.removeAttribute("hx-push-url");
				link.removeAttribute("hx-trigger");
				link.removeAttribute("hx-indicator");

				if (link.dataset.ddgStoryBound === "true") return;

				link.addEventListener("click", (event) => {
					if (
						event.defaultPrevented ||
						event.metaKey ||
						event.ctrlKey ||
						event.shiftKey ||
						event.altKey ||
						event.button !== 0
					) {
						return;
					}

					event.preventDefault();
					const path = link.dataset.ddgStoryPath;
					if (!path) return;

					const fallback = buildHomeFallback();
					if (fallback) modal.dataset.homeFallback = fallback;

					if (!modal.classList.contains("is-open")) openStoryModal();
					loadStory(path, { pushState: true });
				});

				link.addEventListener(
					"mouseenter",
					() => {
						prefetchStory(link.dataset.ddgStoryPath);
					},
					{ once: true }
				);

				link.dataset.ddgStoryBound = "true";
			});
		}

		function startStoryLinkObserver() {
			const observerTargets = [storyList, mainEl, doc.body].filter(Boolean);
			if (!observerTargets.length) return;

			const observer = new MutationObserver((mutations) => {
				let needsSetup = false;

				for (const mutation of mutations) {
					if (mutation.type !== "childList") continue;

					for (const node of mutation.addedNodes) {
						if (!(node instanceof HTMLElement)) continue;
						if (
							node.matches(selectors.storyLinks.selector) ||
							node.querySelector(selectors.storyLinks.selector)
						) {
							needsSetup = true;
							break;
						}
					}

					if (needsSetup) break;
				}

				if (needsSetup) setupStoryLinks();
			});

			observerTargets.forEach((target) =>
				observer.observe(target, { childList: true, subtree: true })
			);
		}

		function isStoryPath(pathname) {
			return /^\/stories\//.test(pathname);
		}

		function buildHomeFallback() {
			if (!modal) return null;

			if (!isStoryPath(location.pathname)) {
				const fallback = `${location.pathname}${location.search}${location.hash}`;
				return fallback || "/";
			}

			return modal.dataset.homeFallback || initialHomeUrl || "/";
		}
	}

	// a smooth custom cursor that follows the mouse
	function initCustomCursor() {
		const cursor = select(".c-cursor");
		const target = select(".page-wrap");
		if (!cursor || !target) return;

		const $target = $j(target);
		const $body = $j(document.body);
		const $win = $j(window);

		const quickConfig = { duration: 0.2, ease: "power3.out" };
		const moveX =
			gsap.quickTo?.(cursor, "x", quickConfig) ||
			((value) => gsap.to(cursor, { x: value, ...quickConfig }));
		const moveY =
			gsap.quickTo?.(cursor, "y", quickConfig) ||
			((value) => gsap.to(cursor, { y: value, ...quickConfig }));

		$win.on("mousemove.ddgCursor", (e) => {
			moveX(e.clientX);
			moveY(e.clientY);
		});

		$target.on("mouseenter.ddgCursor", () => {
			$body.css("cursor", "none");
			gsap.to(cursor, { autoAlpha: 1, duration: 0.2 });
		});

		$target.on("mouseleave.ddgCursor", () => {
			$body.css("cursor", "auto");
			gsap.to(cursor, { autoAlpha: 0, duration: 0.2 });
		});
	}

	// boot sequence
	const featureOrder = [
		initNavigation,
		initPageProgress,
		initTicker,
		initFilters,
		initActivityBar,
		initSocialShares,
		initStory,
		initStoryModal,
		initCustomCursor,
	];

	ddg.helperFunctions.refreshLayout ??= refreshLayout;
	ddg.boot = initSite;
})();
