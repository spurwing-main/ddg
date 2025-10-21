function initAudioPlayer() {
	console.log("Audio player script loaded");

	const playerElement = document.querySelector(".story-player");
	if (!playerElement) {
		console.warn("No audio player element found");
		return;
	}

	const audioFileUrl = playerElement.dataset.audioUrl;

	if (!audioFileUrl) {
		console.warn("No audio file URL found");
		return;
	}

	const scroller = document.querySelector(".lightbox_panel");
	if (!scroller) {
		console.warn("No scroller element found");
		return;
	}

	const waveformContainer = playerElement.querySelector(".story-player_waveform");
	const playButton = playerElement.querySelector("button[data-player='play']");
	const muteButton = playerElement.querySelector("button[data-player='mute']");
	const shareButton = playerElement.querySelector("button[data-player='share']");

	const playIcon = playButton.querySelector(".circle-btn_icon.is-play");
	const pauseIcon = playButton.querySelector(".circle-btn_icon.is-pause");
	const muteIcon = muteButton.querySelector(".circle-btn_icon.is-mute");
	const unmuteIcon = muteButton.querySelector(".circle-btn_icon.is-unmute");

	if (!waveformContainer || !playButton || !muteButton || !shareButton) {
		console.warn("Required player elements not found");
		return;
	}

	let wavesurfer = null;
	let isMuted = false;
	let isPlaying = false;
	let status = "not ready";
	let hasPlayedOnce = false;
	let flipInstance = null;
	let debounceTimeout = null;

	// Initialize GSAP plugins
	function initGSAP() {
		if (typeof gsap !== "undefined") {
			gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, Flip);
		}
	}

	// Initialize WaveSurfer
	function createWaveSurfer() {
		// Prevent multiple initializations
		if (wavesurfer) {
			console.warn("WaveSurfer already initialized");
			return;
		}

		wavesurfer = WaveSurfer.create({
			container: waveformContainer,
			height: 42,
			waveColor: "#b6b83bff",
			progressColor: "#2C2C2C",
			cursorColor: "#2C2C2C",
			normalize: true,
			barWidth: 2,
			barGap: 1,
			dragToSeek: true,
			url: audioFileUrl,
			interact: true,
		});

		wavesurfer.load(audioFileUrl);

		wavesurfer.once("ready", () => {
			console.log("Waveform ready");
			status = "ready";
			playButton.disabled = false;
			muteButton.disabled = false;
		});

		wavesurfer.on("play", () => {
			isPlaying = true;
			status = "playing";
			updatePlayButton();
		});

		wavesurfer.on("pause", () => {
			isPlaying = false;
			status = "paused";
			updatePlayButton();
		});

		wavesurfer.on("finish", () => {
			isPlaying = false;
			status = "finished";
			updatePlayButton();
		});
	}

	// Update play button state
	function updatePlayButton() {
		if (isPlaying) {
			playButton.setAttribute("data-state", "playing");
			playButton.setAttribute("aria-label", "Pause");
			if (playIcon) playIcon.style.display = "none";
			if (pauseIcon) pauseIcon.style.display = "grid";
		} else {
			playButton.setAttribute("data-state", "paused");
			playButton.setAttribute("aria-label", "Play");
			if (playIcon) playIcon.style.display = "block";
			if (pauseIcon) pauseIcon.style.display = "none";
		}
	}

	// Update mute button state
	function updateMuteButton() {
		if (isMuted) {
			muteButton.setAttribute("aria-label", "Unmute");
			muteButton.setAttribute("data-state", "muted");
			if (muteIcon) muteIcon.style.display = "none";
			if (unmuteIcon) unmuteIcon.style.display = "block";
		} else {
			muteButton.setAttribute("aria-label", "Mute");
			muteButton.setAttribute("data-state", "unmuted");
			if (muteIcon) muteIcon.style.display = "block";
			if (unmuteIcon) unmuteIcon.style.display = "none";
		}
	}

	// Initialize GSAP Flip animation for player positioning
	function initPlayerFlip() {
		if (typeof gsap === "undefined" || !gsap.registerPlugin) {
			console.warn("GSAP or Flip not available");
			return;
		}

		gsap.registerPlugin(Flip);

		const lightboxTopBar = document.querySelector(".lightbox_top-bar");
		const lightboxTopNumber = document.querySelector(".lightbox_top-number");

		if (!lightboxTopBar || !lightboxTopNumber) {
			console.warn("Required elements (.lightbox_top-bar, .lightbox_top-number) not found");
			return;
		}

		// Record the initial state
		const state = Flip.getState(playerElement);

		// Move the player to the new position (after .lightbox_top-number)
		lightboxTopNumber.insertAdjacentElement("afterend", playerElement);

		// Create the flip animation
		flipInstance = Flip.from(state, {
			duration: 0.8,
			ease: "power2.out",
			scale: true,
			onComplete: () => {
				console.log("Player flipped to top bar");
			},
		});
	}

	// Scroll to story main section
	function scrollToStoryMain() {
		const storyMain = document.querySelector(".story_main");
		if (!storyMain) {
			console.warn(".story_main section not found");
			return;
		}

		gsap.to(scroller, {
			duration: 1.5,
			scrollTo: ".story_main",
			ease: "power2.out",
		});
	}

	// Scroll to story share section
	function scrollToStoryShare() {
		const storyShare = document.querySelector(".story_share");
		if (!storyShare) {
			console.warn(".story_share section not found");
			return;
		}

		gsap.to(scroller, {
			duration: 1.5,
			scrollTo: ".story_share",
			ease: "power2.out",
		});
	}

	// Play/Pause functionality
	playButton.addEventListener("click", () => {
		if (!wavesurfer) return;

		// First time play button is clicked
		if (!hasPlayedOnce && status === "ready") {
			hasPlayedOnce = true;

			wavesurfer.play();
			scrollToStoryMain();

			// Trigger the flip animation
			setTimeout(() => {
				initPlayerFlip();
			}, 100);
		} else {
			wavesurfer.playPause();
		}
	});

	// Mute/Unmute functionality
	muteButton.addEventListener("click", () => {
		if (!wavesurfer) return;

		isMuted = !isMuted;
		wavesurfer.setMuted(isMuted);
		updateMuteButton();
	});

	// Share button functionality
	shareButton.addEventListener("click", () => {
		scrollToStoryShare();
	});

	// Clean up function
	function cleanup() {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		if (flipInstance) {
			flipInstance.kill();
		}

		if (wavesurfer) {
			wavesurfer.destroy();
		}
	}

	// Initialize everything
	playButton.disabled = true;
	muteButton.disabled = true;

	initGSAP();
	updatePlayButton();
	updateMuteButton();
	createWaveSurfer();

	// Clean up on page unload
	window.addEventListener("beforeunload", cleanup);

	// Return cleanup function for manual cleanup if needed
	return { cleanup };
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", initAudioPlayer);
