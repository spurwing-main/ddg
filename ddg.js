function main() {
	let wavesurfer, record;
	let scrollingWaveform = false;
	let continuousWaveform = false;
	let btn_record = document.querySelector("#record");
	let btn_play = document.querySelector("#play");
	let btn_clear = document.querySelector("#clear");
	let btn_save = document.querySelector("#save");
	let isRecording = false;

	btn_play.disabled = true;
	btn_clear.disabled = true;
	btn_save.disable = true;

	const createWaveSurfer = () => {
		// Destroy the previous wavesurfer instance
		if (wavesurfer) {
			wavesurfer.destroy();
		}

		// Create a new Wavesurfer instance
		wavesurfer = WaveSurfer.create({
			container: ".proto_visualiser",
			waveColor: "rgb(200, 0, 200)",
			progressColor: "rgb(100, 0, 100)",
		});

		// Initialize the Record plugin
		record = wavesurfer.registerPlugin(
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
				const container = document.querySelector(".proto_hidden");
				const recordedUrl = URL.createObjectURL(blob);
				const wavesurfer = WaveSurfer.create({
					container,
					waveColor: "rgb(200, 100, 0)",
					progressColor: "rgb(100, 50, 0)",
					url: recordedUrl,
				});

				// Play button
				btn_play.disabled = false; // enable play button
				btn_play.textContent = "Play"; // Reset button text
				btn_play.onclick = () => wavesurfer.playPause();
				wavesurfer.on("pause", () => (btn_play.textContent = "Play"));
				wavesurfer.on("play", () => (btn_play.textContent = "Pause playback"));
			}
		});

		record.on("record-progress", (time) => {
			updateProgress(time);
		});
	};

	const progress = document.querySelector("#progress");
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

		if (record.isRecording()) {
			record.pauseRecording();
			wavesurfer.empty(); // Clears the waveform
			btn_record.textContent = "Resume recording";
			return;
		} else if (record.isPaused()) {
			record.resumeRecording();
			btn_record.textContent = "Pause recording";
			return;
		} else {
			record.startRecording().then(() => {
				btn_record.textContent = "Pause recording";
				btn_clear.disabled = false;
			});
		}
	};

	// stop button
	btn_save.onclick = () => {
		record.stopRecording();
		btn_play.disabled = false;
		btn_clear.disabled = false;
		btn_save.disabled = true;
		btn_record.disabled = true;
	};

	// restart button
	btn_clear.onclick = () => {
		isRecording = false;
		record.stopRecording();
		btn_record.textContent = "Record";
		wavesurfer.empty(); // Clears the waveform
		btn_clear.disabled = true; // disable clear button
		btn_play.disabled = true;
		btn_save.disabled = true;
		btn_record.disabled = false;
	};
}
