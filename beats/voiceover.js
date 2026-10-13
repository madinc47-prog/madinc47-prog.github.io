// Voiceover & Mic Recorder Studio Module
class VoiceoverRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.audioUrl = null;
        this.isRecording = false;
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.audioUrl = URL.createObjectURL(this.audioBlob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            return { status: "recording", message: "Voiceover recording started..." };
        } catch (err) {
            console.error("Mic access error:", err);
            return { status: "error", message: err.message };
        }
    }

    stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || !this.isRecording) {
                resolve({ status: "error", message: "No active recording" });
                return;
            }

            this.mediaRecorder.onstop = () => {
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                this.audioUrl = URL.createObjectURL(this.audioBlob);
                this.isRecording = false;
                resolve({ status: "stopped", audioUrl: this.audioUrl, audioBlob: this.audioBlob });
            };

            this.mediaRecorder.stop();
        });
    }

    playPreview() {
        if (this.audioUrl) {
            const audio = new Audio(this.audioUrl);
            audio.play();
        }
    }
}

const voiceoverRecorder = new VoiceoverRecorder();
