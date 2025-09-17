function main() {
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
		const tapeSpeed = 2000; // pixels per second
		let splitTextInstances = [];
		let comingSoonItems = [];

		function handleHoverIn(e) {
			const item = e.target;
			const lines = gsap.utils.toArray(item.querySelectorAll(".home-list_split-line"));
			gsap.killTweensOf(lines);
			gsap.to(lines, {
				"--home-list--tape-r": 0,
				duration: (i, el) => el.offsetWidth / tapeSpeed, // maintain speed across line widths
				ease: "power2.out",
				stagger: 0.05,
			});
		}

		function handleHoverOut(e) {
			const item = e.target;
			const lines = gsap.utils.toArray(item.querySelectorAll(".home-list_split-line"));
			gsap.killTweensOf(lines);
			gsap.to(lines, {
				"--home-list--tape-r": "100%",
				duration: (i, el) => el.offsetWidth / tapeSpeed,
				ease: "power2.out",
				stagger: 0.05,
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
			teardown();

			comingSoonItems = Array.from(
				document.querySelectorAll(
					'.home-list_item-wrap[data-story-status="coming-soon"] > .home-list_item'
				)
			);

			if (!comingSoonItems.length) return;

			comingSoonItems.forEach((item) => {
				const splitTextInstance = setupSplitLines(item);
				splitTextInstances.push(splitTextInstance);

				item.addEventListener("mouseenter", handleHoverIn);
				item.addEventListener("mouseleave", handleHoverOut);
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

	function toggleFilters() {
		const filterPanel = document.querySelector(".c-home-filters");
		const searchButtons = document.querySelectorAll(".c-search-btn");
		const closeButtons = document.querySelectorAll(".filters_close, .filters_submit");

		if (!filterPanel || !searchButtons.length) return;

		let previousBodyOverflow = "";
		let isScrollLocked = false;

		const setAriaHidden = (isHidden) => {
			filterPanel.setAttribute("aria-hidden", isHidden ? "true" : "false");
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

		const openFilters = () => {
			filterPanel.classList.add("is-open");
			filterPanel.style.display = "block";
			setAriaHidden(false);
			lockBodyScroll();
		};

		const closeFilters = () => {
			filterPanel.classList.remove("is-open");
			filterPanel.style.display = "none";
			setAriaHidden(true);
			unlockBodyScroll();
		};

		searchButtons.forEach((button) => {
			button.addEventListener("click", (event) => {
				if (button.tagName === "A") {
					event.preventDefault();
				}
				openFilters();
			});
		});

		closeButtons.forEach((button) => {
			button.addEventListener("click", (event) => {
				if (button.tagName === "A" || button.type === "button") {
					event.preventDefault();
				}
				closeFilters();
			});
		});

		// Ensure panel starts hidden for assistive tech if it isn't open by default
		if (!filterPanel.classList.contains("is-open")) {
			setAriaHidden(true);
		}

		return { openFilters, closeFilters };
	}

	function registerFinsweetRefresh(refreshFn) {
		if (typeof refreshFn !== "function") return;

		window.fsAttributes = window.fsAttributes || [];
		window.fsAttributes.push([
			"cmsfilter",
			(filterInstances) => {
				filterInstances.forEach((instance) => {
					if (typeof instance?.on === "function") {
						instance.on("renderitems", () => {
							requestAnimationFrame(() => {
								refreshFn();
							});
						});
					}
				});
			},
		]);
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

	hideShowNav();
	pageProgress();
	// customCursor();
	const tickerTape = tickerTapeHover();
	toggleFilters();
	// registerFinsweetRefresh(tickerTape && tickerTape.refresh);
	activityBar();

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
				});
			});
		},
	]);
}
