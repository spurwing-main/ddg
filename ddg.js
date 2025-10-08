(function () {
	ddg = window.ddg ??= {};
	ddg.functions ??= {};
	ddg.helperFunctions ??= {};
	ddg.resources ??= {};
	ddg._initedStories ??= new Set();
	ddg._homeBooted ??= false;

	const filterPanel = document.querySelector(".c-home-filters");
	let previousBodyOverflow = "";
	let isScrollLocked = false;

	/** Initialize anything global to Home (once) */

	ddg.initHome = function initHome() {
		if (ddg._homeBooted) return;
		ddg._homeBooted = true;
		gsap.registerPlugin(ScrollTrigger);
		hideShowNav();
		pageProgress();
		// customCursor();
		ddg.resources.tickerTape = tickerTapeHover();
		toggleFilters();
		activityBar();
		randomSelection();
		socialShares();
		formatStoryNumbers();
		copyClip();
		duplicateMarqueeContent();
		moreStories();

		window.FinsweetAttributes ||= [];
		window.FinsweetAttributes.push([
			"list",
			(listInstances) => {
				console.log("List initialized:", listInstances);
			},
		]);

		window.FinsweetAttributes.push([
			"list",
			(lists) => {
				lists.forEach((list) => {
					list.addHook("filter", (items) => {
						console.log("Filtering items", items);
						return items;
					});
					list.addHook("afterRender", (items) => {
						console.log("After render items:", items.length);
						ddg.resources.tickerTape.refresh();
						// console.log("List fields data:", list.allFieldsData);
						// console.log("List items:", list.items);
						// console.log("List filters:", list.filters);
						// console.log(list.items.value.length);
					});
				});
			},
		]);
	};

	/** Initialize a story fragment, idempotent per slug */
	ddg.initStory = function initStory(root = document) {
		const frag = root.querySelector("#ddg-story-fragment");
		if (!frag) return;

		const slug = frag.dataset.storySlug || location.pathname;
		if (ddg._initedStories.has(slug)) return; // prevents double-run on back/forward
		ddg._initedStories.add(slug);

		// --- Story-specific wiring goes here (binds only inside 'frag') ---
		// e.g.
		// ddg.functions.bindShareButtons?.(frag);
		// ddg.functions.initAudio?.(frag);
		// ddg.functions.initStoryGsap?.(frag);
		// ------------------------------------------------------------------
	};

	/** Entry point called by your inline loader after the script loads */
	ddg.boot = function boot() {
		// 1) site-wide init
		ddg.initHome();

		// 2) Direct story visits (standalone story page, no modal)
		ddg.initStory(document);

		// 3) Drain any fragments that arrived before ddg.js was ready
		if (Array.isArray(window.__ddgStoryQueue)) {
			for (const root of window.__ddgStoryQueue) {
				try {
					ddg.initStory(root);
				} catch (e) {
					console.error(e);
				}
			}
			window.__ddgStoryQueue.length = 0;
		}
	};

	function pageProgress() {
		const progressBar = document.querySelector(".page-progress_bar");
		if (!progressBar) return;
		// use GSAP ScrollTrigger
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
	}

	function hideShowNav() {
		const nav = document.querySelector(".nav");
		if (!nav) return;

		const showThreshold = 50; // Always show when within this distance from top
		const hideThreshold = 100; // Can hide only after passing this
		const revealBuffer = 50; // Scroll-up distance before revealing

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
					// scrolling down
					nav.classList.add("is-hidden", "is-past-threshold");
					revealDistance = 0;
				} else if (delta < 0) {
					// scrolling up
					revealDistance -= delta; // delta is negative
					if (revealDistance >= revealBuffer) {
						nav.classList.remove("is-hidden");
						revealDistance = 0;
					}
				}

				if (y > hideThreshold) {
					nav.classList.add("is-past-threshold");
				} else {
					nav.classList.remove("is-past-threshold");
				}

				lastScrollY = y;
			},
		});
	}

	function customCursor() {
		const cursor = document.querySelector(".c-cursor");
		const target = document.querySelector(".page-wrap");

		if (!cursor || !target) return;

		// Follow mouse with GSAP
		window.addEventListener("mousemove", (e) => {
			gsap.to(cursor, {
				x: e.clientX,
				y: e.clientY,
				duration: 0.2,
				ease: "power3.out",
			});
		});

		// Show  cursor when hovering target
		target.addEventListener("mouseenter", () => {
			document.body.style.cursor = "none";
			gsap.to(cursor, { autoAlpha: 1, duration: 0.2 });
		});

		target.addEventListener("mouseleave", () => {
			document.body.style.cursor = "auto";
			gsap.to(cursor, { autoAlpha: 0, duration: 0.2 });
		});
	}

	function tickerTapeHover() {
		const tapeSpeed = 5000; // pixels per second
		let splitTextInstances = [];
		let comingSoonItems = [];

		function handleHoverIn(e) {
			const item = e.target;
			const lines = gsap.utils.toArray(item.querySelectorAll(".home-list_split-line"));
			gsap.killTweensOf(lines);
			gsap.to(lines, {
				"--home-list--tape-r": 0,
				duration: (i, el) => el.offsetWidth / tapeSpeed, // maintain speed across line widths
				ease: "linear",
				// stagger: 0.05,
			});
		}

		function handleHoverOut(e) {
			const item = e.target;
			const lines = gsap.utils.toArray(item.querySelectorAll(".home-list_split-line"));
			gsap.killTweensOf(lines);
			gsap.to(lines, {
				"--home-list--tape-r": "100%",
				duration: (i, el) => el.offsetWidth / tapeSpeed,
				ease: "linear",
				// stagger: 0.05,
			});
		}

		function setupSplitLines(item) {
			return SplitText.create(item, {
				type: "lines",
				autoSplit: true,
				tag: "span",
				linesClass: "home-list_split-line",
			});
		}

		function teardown() {
			splitTextInstances.forEach((instance) => instance.revert());
			splitTextInstances = [];

			comingSoonItems.forEach((item) => {
				item.removeEventListener("mouseenter", handleHoverIn);
				item.removeEventListener("mouseleave", handleHoverOut);
			});
			comingSoonItems = [];
		}

		function refresh() {
			console.log("refresh");
			teardown();

			comingSoonItems = Array.from(
				document.querySelectorAll(
					'.home-list_item-wrap[data-story-status="coming-soon"] .home-list_item'
				)
			);

			if (!comingSoonItems.length) return;

			comingSoonItems.forEach((item) => {
				const splitTextInstance = setupSplitLines(item);
				splitTextInstances.push(splitTextInstance);

				// for coming soon items, need to keep hrefs but disable navigation
				if (item.tagName === "A") {
					item.addEventListener("click", (e) => e.preventDefault());
				}

				item.addEventListener("mouseenter", handleHoverIn);
				item.addEventListener("mouseleave", handleHoverOut);

				console.log(splitTextInstance);
			});
		}

		const debounce = (fn, delay = 200) => {
			let t;
			return (...args) => {
				clearTimeout(t);
				t = setTimeout(() => fn(...args), delay);
			};
		};

		const handleResize = debounce(() => {
			refresh();
		});

		window.addEventListener("resize", handleResize);
		refresh();

		return {
			refresh,
			destroy() {
				window.removeEventListener("resize", handleResize);
				teardown();
			},
		};
	}

	const setAriaHidden = (el, isHidden) => {
		el.setAttribute("aria-hidden", isHidden ? "true" : "false");
	};

	const lockBodyScroll = () => {
		if (isScrollLocked) return;
		previousBodyOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		isScrollLocked = true;
	};

	const unlockBodyScroll = () => {
		if (!isScrollLocked) return;
		if (previousBodyOverflow) {
			document.body.style.overflow = previousBodyOverflow;
		} else {
			document.body.style.removeProperty("overflow");
		}
		previousBodyOverflow = "";
		isScrollLocked = false;
	};

	const openModal = (el) => {
		el.classList.add("is-open");
		el.style.display = "block";
		setAriaHidden(el, false);
		lockBodyScroll();
	};

	const closeModal = (el) => {
		el.classList.remove("is-open");
		el.style.display = "none";
		setAriaHidden(el, true);
		unlockBodyScroll();
	};

	function toggleFilters() {
		const searchButtons = document.querySelectorAll(".c-search-btn");
		const closeButtons = document.querySelectorAll(
			".c-circle-button[data-action='close'], .filters_submit"
		);

		if (!filterPanel || !searchButtons.length) return;

		searchButtons.forEach((button) => {
			button.addEventListener("click", (event) => {
				if (button.tagName === "A") {
					event.preventDefault();
				}
				openModal(filterPanel);
			});
		});

		closeButtons.forEach((button) => {
			button.addEventListener("click", (event) => {
				if (button.tagName === "A" || button.type === "button") {
					event.preventDefault();
				}
				closeModal(filterPanel);
			});
		});

		// Ensure panel starts hidden for assistive tech if it isn't open by default
		if (!filterPanel.classList.contains("is-open")) {
			setAriaHidden(filterPanel, true);
		}
	}

	function activityBar() {
		// set up splide instance on .activity.splide element, looping with autoscroll extension
		const activityEl = document.querySelector(".activity.splide");
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

	function randomSelection() {
		let randomHasRun = false;

		const filterPanel = document.querySelector(".c-home-filters");

		// Helper: tick the correct checkbox in the DOM and dispatch change
		function checkFilterInput(fieldKey, value) {
			const selector = `[fs-list-field="${fieldKey}"][fs-list-value="${value}"]`;
			const input = document.querySelector(selector);
			if (input) {
				input.checked = true;
				input.dispatchEvent(new Event("change", { bubbles: true }));
				console.log(`☑️ UI synced: ${fieldKey} = ${value}`);
			} else {
				console.warn(`⚠️ Could not find input for ${fieldKey} = ${value}`);
			}
		}

		window.FinsweetAttributes ||= [];
		window.FinsweetAttributes.push([
			"list",
			(lists) => {
				lists.forEach((listInstance) => {
					// --- Helpers ---
					function pickRandom(arr) {
						if (!arr || arr.length === 0) return null;
						return arr[Math.floor(Math.random() * arr.length)];
					}

					// Store the initial FS filter object so we can truly reset
					const initialFilters = JSON.parse(JSON.stringify(listInstance.filters.value));
					console.log("Initial filters:", initialFilters);

					function resetFilters() {
						listInstance.filters.value = JSON.parse(JSON.stringify(initialFilters));
						listInstance.triggerHook("filter");

						// Also uncheck any checkboxes
						document.querySelectorAll("[fs-cmsfilter-field]").forEach((el) => {
							if (el.type === "checkbox") el.checked = false;
						});
					}

					// Global afterRender hook — only closes modal if randomHasRun = true
					listInstance.addHook("afterRender", () => {
						if (randomHasRun) {
							console.log("✅ Randomiser finished, closing modal");
							if (filterPanel) closeModal(filterPanel);
							randomHasRun = false; // reset the flag
						}
					});

					function applyRandomFilters(minResults = 3, maxTries = 20) {
						const fieldsData = listInstance.allFieldsData.value;
						const locationKey = Object.keys(fieldsData).find(
							(key) => key.toLowerCase() === "location"
						);
						if (!locationKey) {
							console.warn("⚠️ No 'location' field found in allFieldsData.");
							return;
						}

						let attempt = 0;

						function tryOnce() {
							attempt++;

							// --- Always apply a random Location ---
							const locations = Array.from(fieldsData[locationKey].rawValues || []);
							const chosenLocation = pickRandom(locations);

							const groups = [
								{
									id: "rand-location",
									conditionsMatch: "and",
									conditions: [
										{
											id: "location-cond",
											type: "checkbox",
											fieldKey: locationKey,
											value: chosenLocation,
											op: "equal",
											interacted: true,
										},
									],
								},
							];

							console.log(`🎲 Random choice: ${locationKey} = ${chosenLocation}`);

							// --- 50% chance to also add a secondary group ---
							if (Math.random() < 0.5) {
								const otherGroups = Object.keys(fieldsData).filter((key) => key !== locationKey);
								const otherGroup = pickRandom(otherGroups);
								const otherValues = otherGroup
									? Array.from(fieldsData[otherGroup].rawValues || [])
									: [];
								const chosenOtherValue = pickRandom(otherValues);

								if (otherGroup && chosenOtherValue) {
									groups.push({
										id: `rand-${otherGroup}`,
										conditionsMatch: "and",
										conditions: [
											{
												id: `${otherGroup}-cond`,
												type: "checkbox",
												fieldKey: otherGroup,
												value: chosenOtherValue,
												op: "equal",
												interacted: true,
											},
										],
									});
									console.log(`🎲 Random choice: ${otherGroup} = ${chosenOtherValue}`);
								}
							}

							// --- Reset, then apply new filters ---
							resetFilters();

							// Sync UI inputs (so checkboxes reflect chosen filters)
							groups.forEach((g) => {
								g.conditions.forEach((c) => {
									checkFilterInput(c.fieldKey, c.value);
								});
							});

							// Apply to FS reactive object
							listInstance.filters.value = {
								groupsMatch: "and",
								groups,
							};
							listInstance.triggerHook("filter");

							// Mark that this randomiser run is active
							randomHasRun = true;

							// --- Delay before count check to allow re-render ---
							setTimeout(() => {
								const count = listInstance.items.value.length;
								if (count < minResults && attempt < maxTries) {
									console.log(`⚠️ Attempt ${attempt}: ${count} results, retrying…`);
									tryOnce();
								} else {
									console.log(`🎉 Filters applied after ${attempt} attempt(s): ${count} results`);
									console.log("Applied filters:", listInstance.filters.value);

									const counter = document.querySelector("#resultsCount");
									if (counter) counter.textContent = count;
								}
							}, 200); // 200ms delay
						}

						tryOnce();
					}

					// --- Hook up UI buttons ---
					document.querySelectorAll(".random-filter").forEach((btn) => {
						btn.addEventListener("click", () => applyRandomFilters(3, 20));
					});

					// const clearBtn = document.querySelector("[fs-cmsfilter-clear]");
					// if (clearBtn) {
					// 	clearBtn.addEventListener("click", () => {
					// 		console.log("🧹 Manual clear triggered");
					// 		resetFilters();
					// 		// ❌ Do not close modal here
					// 	});
					// }
				});
			},
		]);
	}

	function socialShares() {
		const url = encodeURIComponent(window.location.href);
		const title = encodeURIComponent(document.title);

		document.querySelectorAll("[data-action='share'][data-custom-share]").forEach((btn) => {
			btn.addEventListener("click", (e) => {
				e.preventDefault();
				const platform = btn.getAttribute("data-custom-share").toLowerCase();

				let shareUrl = "";

				switch (platform) {
					case "facebook messenger":
						// Mobile-only (no App ID for desktop)
						shareUrl = `fb-messenger://share/?link=${url}`;
						break;

					case "whatsapp":
						shareUrl = `https://wa.me/?text=${url}`;
						break;

					case "instagram":
						// Instagram has no public web-share endpoint.
						// Use Web Share API if supported, else fallback to profile link.
						if (navigator.share) {
							navigator
								.share({ title: document.title, url: window.location.href })
								.catch((err) => console.warn("Share cancelled or failed", err));
							return;
						} else {
							alert(
								"Instagram sharing isn’t supported directly. Opening Instagram profile instead."
							);
						}
						break;

					case "snapchat":
						shareUrl = `https://www.snapchat.com/scan?attachmentUrl=${url}`;
						break;

					default:
						console.warn("Unsupported share target:", platform);
						return;
				}

				// Open in a new tab/window
				if (shareUrl) window.open(shareUrl, "_blank", "noopener,noreferrer");
			});
		});
	}

	function formatStoryNumbers() {
		document.querySelectorAll("[data-story-number]").forEach((el) => {
			const raw = parseInt(el.getAttribute("data-story-number"), 10);
			if (!isNaN(raw) && raw > 0) {
				const formatted = `#${String(raw).padStart(4, "0")}`;
				el.textContent = formatted;
			}
		});
	}

	function copyClip() {
		// Get the base URL (no params, no hash)
		const cleanUrl = window.location.origin + window.location.pathname;

		// Find all Copyclip elements that should copy the current URL
		document.querySelectorAll("[fs-copyclip-element='click']").forEach((el) => {
			el.setAttribute("fs-copyclip-text", cleanUrl);
		});
	}

	function duplicateMarqueeContent() {
		document.querySelectorAll(".marquee_content-wrap").forEach((el) => {
			const clone = el.cloneNode(true); // deep clone
			el.parentNode.insertBefore(clone, el.nextSibling); // insert after original
		});
	}

	function moreStories() {
		const parent = document.querySelector(".more-stories_all");
		if (!parent) return;

		const allWraps = Array.from(parent.querySelectorAll(".more-stories_list-wrap"));
		const searchBtn = parent.querySelector(".c-circle-btn");

		// filter out empties
		const nonEmpty = allWraps.filter((wrap) => !wrap.querySelector(".w-dyn-empty"));

		// shuffle helper
		function shuffle(arr) {
			for (let i = arr.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[arr[i], arr[j]] = [arr[j], arr[i]];
			}
			return arr;
		}

		// shuffle and pick first 4
		const chosen = shuffle(nonEmpty).slice(0, 4);

		// hide all groups by default
		allWraps.forEach((wrap) => {
			wrap.style.display = "none";
		});

		// show chosen ones in random order
		chosen.forEach((wrap) => {
			wrap.style.display = "";
			parent.insertBefore(wrap, searchBtn); // insert before the button
		});

		// ensure button is always last
		if (searchBtn) parent.appendChild(searchBtn);

		gsap.to(parent, { autoAlpha: 1, duration: 0.5 });
	}
})();
