export class UploadStats {
    private startTime: number;
    private lastBytes: number;
    private lastTime: number;
    private speedBuffer: number[] = [];
    private readonly BUFFER_SIZE = 5;

    constructor() {
        this.startTime = Date.now();
        this.lastTime = Date.now();
        this.lastBytes = 0;
    }

    update(uploadedBytes: number) {
        const now = Date.now();
        const timeDiff = (now - this.lastTime) / 1000; // seconds

        if (timeDiff < 1) return; // Update at most once per second

        const bytesDiff = uploadedBytes - this.lastBytes;
        const speed = bytesDiff / timeDiff; // bytes per second

        this.speedBuffer.push(speed);
        if (this.speedBuffer.length > this.BUFFER_SIZE) {
            this.speedBuffer.shift();
        }

        this.lastTime = now;
        this.lastBytes = uploadedBytes;
    }

    getSpeed(): number {
        if (this.speedBuffer.length === 0) return 0;
        const sum = this.speedBuffer.reduce((a, b) => a + b, 0);
        return sum / this.speedBuffer.length;
    }

    getTimeRemaining(totalBytes: number): number {
        const speed = this.getSpeed();
        if (speed === 0) return 0;
        const remainingBytes = totalBytes - this.lastBytes;
        return remainingBytes / speed; // seconds
    }

    reset() {
        this.startTime = Date.now();
        this.lastTime = Date.now();
        this.lastBytes = 0;
        this.speedBuffer = [];
    }
}
