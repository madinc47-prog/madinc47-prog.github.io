// Green Screen & Video FX Studio Module
class GreenScreenStudio {
    constructor() {
        this.videoElement = null;
        this.canvasElement = null;
        this.ctx = null;
        this.stream = null;
        this.keyColor = { r: 0, g: 255, b: 0 }; // Default Chroma Green
        this.tolerance = 60;
    }

    async initCamera(videoSelector, canvasSelector) {
        this.videoElement = document.querySelector(videoSelector);
        this.canvasElement = document.querySelector(canvasSelector);
        if (this.canvasElement) {
            this.ctx = this.canvasElement.getContext('2d');
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (this.videoElement) {
                this.videoElement.srcObject = this.stream;
                this.videoElement.play();
            }
            return { status: "success", message: "Camera connected" };
        } catch (err) {
            console.error("Camera access error:", err);
            return { status: "error", message: err.message };
        }
    }

    setKeyColor(hexColor) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
        if (result) {
            this.keyColor = {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            };
        }
    }

    applyChromaKey() {
        if (!this.ctx || !this.videoElement) return;

        this.ctx.drawImage(this.videoElement, 0, 0, this.canvasElement.width, this.canvasElement.height);
        const frame = this.ctx.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
        const l = frame.data.length / 4;

        for (let i = 0; i < l; i++) {
            const r = frame.data[i * 4 + 0];
            const g = frame.data[i * 4 + 1];
            const b = frame.data[i * 4 + 2];

            if (
                Math.abs(r - this.keyColor.r) < this.tolerance &&
                Math.abs(g - this.keyColor.g) < this.tolerance &&
                Math.abs(b - this.keyColor.b) < this.tolerance
            ) {
                frame.data[i * 4 + 3] = 0; // Set pixel transparent
            }
        }
        this.ctx.putImageData(frame, 0, 0);
    }
}

const greenScreenStudio = new GreenScreenStudio();
