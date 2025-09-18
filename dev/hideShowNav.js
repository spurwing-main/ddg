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
