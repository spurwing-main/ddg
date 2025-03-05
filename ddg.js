function main() {
	let recorder = document.querySelector(".recorder");
	if (!recorder) {
		return;
	}
	let ws_rec, record;
	let scrollingWaveform = false;
	let continuousWaveform = false;
	let btn_record = recorder.querySelector("#rec-record");
	let btn_play = recorder.querySelector("#rec-playback");
	let btn_clear = recorder.querySelector("#rec-clear");
	let btn_save = recorder.querySelector("#rec-save");
	let btn_submit = recorder.querySelector("#rec-submit"); // fake submit button
	// let btn_save_text = btn_save.querySelector(".recorder_btn-text");
	let msg = recorder.querySelector(".recorder_msg-l");
	let waveform = recorder.querySelector("recorder_visualiser");
	let status = "ready";
	let form = recorder.querySelector("#rec-form");
	let isRecording = false;
	let recordedBlob = null;
	let ws_playback;

	btn_play.disabled = true;
	btn_clear.disabled = true;
	btn_save.disabled = true;

	function setStatus(newStatus) {
		let oldStatus = recorder.getAttribute("ddg-status");
		recorder.setAttribute("ddg-status", newStatus);
		status = newStatus;
		console.log("Status updated from " + oldStatus + " to " + newStatus);
		return status;
	}

	function updateMessage(message, size) {
		if (!message) {
			msg.innerHTML = "Ready?";
		} else {
			msg.innerHTML = message;
		}
		if (size == "small") {
			msg.classList.remove("recorder_msg-l");
			msg.classList.add("recorder_msg-s");
		} else {
			msg.classList.remove("recorder_msg-s");
			msg.classList.add("recorder_msg-l");
		}
	}

	function loadData() {
		// Function to get URL parameters
		function getQueryParam(param) {
			const urlParams = new URLSearchParams(window.location.search);
			return urlParams.get(param);
		}

		// Get the ddg_id from the URL
		const ddgIdValue = getQueryParam("ddg_id");
		if (!ddgIdValue) {
			console.log("DDG ID not found");
			updateMessage("Error :(");
			recorder.style.pointerEvents = "none";
		}

		// Populate the input field if ddg_id exists in the URL
		if (ddgIdValue) {
			const ddgIdInput = recorder.querySelector("#ddg-id");
			if (ddgIdInput) {
				ddgIdInput.value = ddgIdValue;
			} else {
				console.warn("DDG ID input field not found!");
			}
		}

		// get name
		const name = getQueryParam("ddg_name");
		if (!name) {
			console.log("DDG name not found");
		} else {
			let nameLength = name.length;
			const section = document.querySelector(".outreach-hero");
			if (nameLength > 6) {
				section.classList.add("is-md");
			} else if (nameLength > 12) {
				section.classList.add("is-sm");
			}

			let names = document.querySelectorAll(".outreach-hero_word.is-name");
			names.forEach((el) => {
				el.innerHTML = name;
			});
		}
	}

	loadData();
	setStatus("ready");

	const createWaveSurfer = () => {
		// Destroy the previous wavesurfer instance
		if (ws_rec) {
			ws_rec.destroy();
		}

		// Create a new Wavesurfer instance
		ws_rec = WaveSurfer.create({
			container: ".recorder_visualiser",
			waveColor: "rgb(0, 0, 0)",
			progressColor: "rgb(0, 0, 0)",
			normalize: false,
			barWidth: 4,
			barGap: 6,
			barHeight: 2.5,
		});

		// Initialize the Record plugin
		record = ws_rec.registerPlugin(
			WaveSurfer.Record.create({
				renderRecordedAudio: false,
				scrollingWaveform,
				continuousWaveform,
				continuousWaveformDuration: 30, // optional
			})
		);

		// Render recorded audio
		record.on("record-end", (blob) => {
			if (isRecording) {
				setStatus("saved");
				// btn_save_text.innerHTML = "Submit";

				const container = document.querySelector(".recorder_ws-container");
				const recordedUrl = URL.createObjectURL(blob);
				ws_playback = WaveSurfer.create({
					container,
					waveColor: "rgb(200, 100, 0)",
					progressColor: "rgb(100, 50, 0)",
					url: recordedUrl,
				});

				btn_play.onclick = () => ws_playback.playPause();
				ws_playback.on("pause", () => {
					// on end of recording, only update status to saved if we're still playing
					if (status == "playback") {
						setStatus("saved");
					}
				});
				ws_playback.on("play", () => {
					setStatus("playback");
				});
			}
		});

		record.on("record-progress", (time) => {
			updateProgress(time);
		});
	};

	// const progress = document.querySelector("#progress");
	const updateProgress = (time) => {
		//   // time will be in milliseconds, convert it to mm:ss format
		//   const formattedTime = [
		//     Math.floor((time % 3600000) / 60000), // minutes
		//     Math.floor((time % 60000) / 1000), // seconds
		//   ]
		//     .map((v) => (v < 10 ? '0' + v : v))
		//     .join(':')
		//   progress.textContent = formattedTime
	};

	createWaveSurfer();

	// record button
	btn_record.onclick = () => {
		isRecording = true;
		btn_save.disabled = false;
		btn_clear.disabled = false;
		btn_play.disabled = true;

		if (record.isRecording()) {
			setStatus("recording-paused");
			record.pauseRecording();
			ws_rec.empty(); // Clears the waveform
			return;
		} else if (record.isPaused()) {
			setStatus("recording");
			record.resumeRecording();
			return;
		} else {
			record.startRecording().then(() => {
				setStatus("recording");
			});
		}
	};

	// stop button
	btn_save.onclick = () => {
		setStatus("saved");
		record.stopRecording();
		btn_play.disabled = false;
		btn_clear.disabled = false;
		btn_save.disabled = false;
		btn_record.disabled = false;
		updateMessage(
			"Hit the submit button to send us your voice recording. You can only do this once, so feel free to play it back and have a listen 👂",
			"small"
		);
	};

	// restart button
	btn_clear.onclick = () => {
		// if already playing, pause
		if (status == "playback") {
			console.log("Interrupting playback to clear");
			ws_rec.playPause();
		}
		setStatus("ready");
		// btn_save_text.innerHTML = "Save";
		updateMessage();
		isRecording = false;
		record.stopRecording();
		ws_rec.empty(); // Clears the waveform
		btn_clear.disabled = true; // disable clear button
		btn_play.disabled = true;
		btn_save.disabled = true;
		btn_record.disabled = false;
	};

	record.on("record-end", (blob) => {
		console.log("Recording finished.");
		recordedBlob = blob; // Store the blob for later
	});

	btn_submit.addEventListener("click", async (e) => {
		e.preventDefault(); // Prevent default form submission

		if (!recordedBlob) {
			console.log("No recording found. Please record before submitting.");
			return;
		}

		console.log("Uploading recording...");
		const formData = new FormData();
		formData.append("file", recordedBlob, "voice_note.webm");
		formData.append("upload_preset", "ddg-prototype"); // Replace with Cloudinary upload preset

		// Upload to Cloudinary (or your preferred storage)
		const response = await fetch(
			"https://api.cloudinary.com/v1_1/daoliqze4/video/upload",
			{
				method: "POST",
				body: formData,
			}
		);

		const data = await response.json();
		if (!data.secure_url) {
			alert("Upload failed!");
			return;
		}

		console.log("Uploaded file URL:", data.secure_url);

		// Store the Cloudinary URL in the hidden form field
		console.log(form.querySelector("#file-url"));
		form.querySelector("#file-url").value = data.secure_url;

		// Now submit the Webflow form
		form.querySelector('[type="submit"]').click();
	});
}
