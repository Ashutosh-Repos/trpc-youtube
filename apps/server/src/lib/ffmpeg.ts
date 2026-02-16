import ffmpeg from "fluent-ffmpeg";
import * as path from "path";
import * as fs from "fs";

// --- GLOBAL PROCESS REGISTRY (Zombie Prevention) ---
const activeCommands = new Set<ffmpeg.FfmpegCommand>();

/**
 * Kill all active FFmpeg processes gracefully
 */
export async function killAllFfmpeg() {
    console.log(
        `[FFmpeg] 🗡️ Killing ${activeCommands.size} active FFmpeg processes...`,
    );
    for (const cmd of activeCommands) {
        try {
            (cmd as any).kill("SIGKILL");
        } catch (e) {
            // Silently fail if already dead
        }
    }
    activeCommands.clear();
}

function trackCommand(cmd: ffmpeg.FfmpegCommand) {
    activeCommands.add(cmd);
    cmd.on("end", () => activeCommands.delete(cmd));
    cmd.on("error", () => activeCommands.delete(cmd));
}
// ----------------------------------------------------
export interface VideoMetadata {
    duration: number; // Seconds
    width: number;
    height: number;
    format: string;
    fps: number;
    hasAudio: boolean;
    audioChannels?: number;
    audioCodec?: string; // For passthrough detection
}

/**
 * Probe video metadata
 */
export function probeVideo(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);

            const format = metadata.format;
            const videoStream = metadata.streams.find(
                (s) => s.codec_type === "video",
            );
            const audioStream = metadata.streams.find(
                (s) => s.codec_type === "audio",
            );

            if (!videoStream) return reject(new Error("No video stream found"));

            // Parse FPS (e.g. "30/1" or "30")
            let fps = 30;
            if (videoStream.r_frame_rate) {
                const parts = videoStream.r_frame_rate.split("/");
                if (parts.length === 2) {
                    const num = parseInt(parts[0] as string, 10);
                    const den = parseInt(parts[1] as string, 10);
                    if (!isNaN(num) && !isNaN(den) && den !== 0) {
                        fps = num / den;
                    }
                } else {
                    const val = parseInt(videoStream.r_frame_rate, 10);
                    if (!isNaN(val)) {
                        fps = val;
                    }
                }
            }

            resolve({
                duration: format.duration || 0,
                width: videoStream.width || 0,
                height: videoStream.height || 0,
                format: format.format_name || "unknown",
                fps: Math.round(fps),
                hasAudio: !!audioStream,
                audioChannels: audioStream ? audioStream.channels : undefined,
                audioCodec: audioStream?.codec_name,
            });
        });
    });
}

/**
 * Generate Thumbnails
 * Generates 10 thumbnails evenly spaced
 */
export function generateThumbnails(
    inputPath: string,
    outputDir: string,
): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const fileNames: string[] = [];

        const cmd = ffmpeg(inputPath);
        trackCommand(cmd);

        cmd.screenshots({
            count: 5,
            folder: outputDir,
            filename: "thumb-%i.jpg",
            size: "1280x720",
        })
            .on("filenames", (filenames) => {
                fileNames.push(...filenames);
            })
            .on("end", () => {
                resolve(fileNames);
            })
            .on("error", (err) => {
                reject(err);
            });
    });
}

/**
 * Transcode a Single Resolution to HLS
 * Used by Parallel Workers
 *
 * Enhancements:
 * - Audio passthrough when source is already AAC
 * - Hardware acceleration support via config
 */
import config from "../config";

export function transcodeResolution(
    inputPath: string,
    outputDir: string,
    resolution: { width: number; height: number; name: string },
    onProgress?: (percent: number) => void,
    options?: { sourceAudioCodec?: string },
): Promise<string> {
    return new Promise((resolve, reject) => {
        const cleanName = resolution.name.replace("p", ""); // 1080

        // Determine Profile & Audio Bitrate based on Resolution
        let profile = "main";
        let audioBitrate = "128k";

        if (resolution.height >= 1080) {
            profile = "high";
            audioBitrate = "192k";
        }

        // Select video encoder based on config
        let videoEncoder = "libx264";
        const hwAccel = config.hwAccel;

        switch (hwAccel) {
            case "nvenc":
                videoEncoder = "h264_nvenc";
                console.log(`[FFmpeg] 🎮 Using NVIDIA NVENC acceleration`);
                break;
            case "videotoolbox":
                videoEncoder = "h264_videotoolbox";
                console.log(
                    `[FFmpeg] 🍎 Using Apple VideoToolbox acceleration`,
                );
                break;
            case "vaapi":
                videoEncoder = "h264_vaapi";
                console.log(`[FFmpeg] 🐧 Using VA-API acceleration`);
                break;
            default:
                // Software encoding
                break;
        }

        // Audio passthrough when source is already AAC
        const useAudioPassthrough = options?.sourceAudioCodec === "aac";
        if (useAudioPassthrough) {
            console.log(`[FFmpeg] 🎵 Using audio passthrough (source is AAC)`);
        }

        const cmd = ffmpeg(inputPath);
        trackCommand(cmd);

        const outputOptions = [
            `-profile:v ${profile}`, // high for HD, main for SD
            `-c:v ${videoEncoder}`,
            "-preset veryfast", // Balance speed/quality
            "-sc_threshold 0", // Disable scene change detection for strict keyframes
            "-g 48", // Keyframe interval (GOP) - kept for compatibility
            "-keyint_min 48",
            "-force_key_frames expr:gte(t,n_forced*4)", // Force keyframe every 4 seconds explicitly for HLS
            "-hls_time 4", // 4 second segments
            "-hls_playlist_type vod",
            `-hls_segment_filename ${path.join(outputDir, `seg_${cleanName}_%03d.ts`)}`,
        ];

        // CRF only works with software encoding (libx264)
        if (hwAccel === "none") {
            outputOptions.push("-crf 23"); // Constant Rate Factor (Quality)
        }
        // Add bitrate control for HW encoders (they often ignore CRF)
        if (hwAccel !== "none") {
            const bitrate =
                resolution.height >= 1080
                    ? "6M"
                    : resolution.height >= 480
                      ? "2M"
                      : "1M";
            outputOptions.push(`-b:v ${bitrate}`);
        }

        cmd.outputOptions(outputOptions).videoFilters([
            `scale=w=${resolution.width}:h=${resolution.height}:force_original_aspect_ratio=decrease`,
            "pad=ceil(iw/2)*2:ceil(ih/2)*2", // Ensure even dimensions
        ]);

        // --- Audio Settings ---
        if (useAudioPassthrough) {
            cmd.audioCodec("copy");
        } else {
            cmd.audioCodec("aac").audioBitrate(audioBitrate).audioChannels(2); // Stereo
        }

        cmd.output(`${path.join(outputDir, `playlist.m3u8`)}`)
            .on("start", (commandLine) => {
                console.log(
                    `[Pipeline] 🎥 FFmpeg Start (${resolution.name}): ${commandLine}`,
                );
            })
            .on("progress", (progress) => {
                if (progress.percent && onProgress) {
                    onProgress(Math.round(progress.percent));
                }
            })
            .on("end", () => resolve("playlist.m3u8"))
            .on("error", (err) => reject(err))
            .run();
    });
}

export function generatePreviewSprite(
    inputPath: string,
    outputDir: string,
    duration: number,
    width = 160,
    height = 90,
): Promise<{ spriteFile: string; vttFile: string }> {
    return new Promise((resolve, reject) => {
        const spriteFile = "sprite.jpg";
        const vttFile = "sprite.vtt";
        const outputImage = path.join(outputDir, spriteFile);
        const outputVtt = path.join(outputDir, vttFile);

        // Safety Guard
        if (!duration || isNaN(duration) || duration <= 0) {
            console.warn(
                `⚠️ Invalid duration for sprite generation: ${duration}. Defaulting to 1s.`,
            );
            duration = 1;
        }

        // Calculate interval to fit 100 images (10x10)
        // If Duration is 100s, interval = 1s
        // If Duration is 1000s, interval = 10s
        // Minimum interval 1s
        const maxImages = 100;
        let interval = Math.ceil(duration / maxImages);
        if (interval < 1) interval = 1;
        console.log(
            `🎨 Sprite Strategy: 10x10 grid, interval ${interval}s for duration ${duration}s`,
        );

        const cmd = ffmpeg(inputPath);
        trackCommand(cmd);

        cmd.inputOptions(["-y"]) // Overwrite
            .complexFilter(
                [
                    `select='not(mod(t,${interval}))'`,
                    `scale=${width}:${height}`,
                    "tile=10x10",
                ].join(","),
            ) // Join with commas for linear chain
            .frames(1)
            .output(outputImage)
            .on("start", (cmd) =>
                console.log(`[Pipeline] 📷 Sprite Gen Start: ${cmd}`),
            )
            .on("end", () => {
                // Generate VTT file content
                let vttContent = "WEBVTT\n\n";
                const columns = 10;
                const rows = 10;
                const totalFrames = Math.min(
                    100,
                    Math.ceil(duration / interval),
                );

                for (let i = 0; i < totalFrames; i++) {
                    const startTime = i * interval;
                    const endTime = Math.min((i + 1) * interval, duration);

                    const formatTime = (seconds: number) => {
                        const h = Math.floor(seconds / 3600);
                        const m = Math.floor((seconds % 3600) / 60);
                        const s = Math.floor(seconds % 60);
                        const ms = Math.floor((seconds % 1) * 1000);
                        return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
                    };

                    const x = (i % columns) * width;
                    const y = Math.floor(i / columns) * height;

                    vttContent += `${formatTime(startTime)} --> ${formatTime(endTime)}\n`;
                    vttContent += `${spriteFile}#xywh=${x},${y},${width},${height}\n\n`;
                }

                fs.writeFileSync(outputVtt, vttContent);
                console.log(`[Pipeline] 📝 Generated VTT: ${outputVtt}`);
                resolve({ spriteFile, vttFile });
            })
            .on("error", (err) => reject(err))
            .run();
    });
}

export function createMasterPlaylist(
    outputDir: string,
    variants: Array<{
        bandwidth: number;
        width: number;
        height: number;
        name: string;
    }>,
): Promise<string> {
    return new Promise((resolve, reject) => {
        let content = "#EXTM3U\n#EXT-X-VERSION:3\n";

        variants.forEach((v) => {
            content += `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.width}x${v.height}\n`;
            content += `${v.name}/playlist.m3u8\n`;
        });

        const masterPath = path.join(outputDir, "master.m3u8");
        fs.writeFile(masterPath, content, (err) => {
            if (err) reject(err);
            else resolve("master.m3u8");
        });
    });
}
