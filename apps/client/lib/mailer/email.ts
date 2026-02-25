import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";

// ─── Build-time detection ────────────────────────────────────────────────────
// Next.js sets NEXT_PHASE during build — skip heavy init during page collection
const isBuildTime =
    process.env.NEXT_PHASE === "phase-production-build" ||
    (!process.env.BREVO_API_KEY && !process.env.REDIS_URL);

// ─── Brevo Helper ────────────────────────────────────────────────────────────
async function sendViaBrevo(job: EmailJob) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error("Brevo API key missing");

    const appName = process.env.APP_NAME || "Youtube";
    const fromEmail = process.env.EMAIL_FROM || "clashutosh04@gmail.com";

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
            "api-key": apiKey,
            "content-type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify({
            sender: { name: appName, email: fromEmail },
            to: [{ email: job.to }],
            subject: job.subject,
            htmlContent: job.html,
        }),
    });

    const result = await response.json();
    if (!response.ok) {
        throw new Error(
            result.code
                ? `${result.code}: ${result.message}`
                : `Brevo error: ${response.statusText}`,
        );
    }
    return result;
}

// ─── Email Job Types ─────────────────────────────────────────────────────────
interface EmailJob {
    to: string;
    subject: string;
    html: string;
    from: string;
}

// ─── BullMQ Queue + Worker (non-blocking) ────────────────────────────────────
// Uses Redis for persistent, retryable email queue.
// If Redis is unavailable, falls back to direct (blocking) send.

const QUEUE_NAME = "email-queue";

let emailQueue: Queue | null = null;
let emailWorker: Worker | null = null;

// Lazy-init to avoid import-time crashes when Redis isn't available (build time)
function getQueue(): Queue | null {
    if (emailQueue) return emailQueue;
    if (!process.env.REDIS_URL || isBuildTime) return null;

    try {
        const connection = new IORedis(process.env.REDIS_URL!, {
            maxRetriesPerRequest: null,
            lazyConnect: true,
        });
        emailQueue = new Queue(QUEUE_NAME, {
            connection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "exponential", delay: 5000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 500 },
            },
        });
        return emailQueue;
    } catch (err) {
        console.warn("[Email] Failed to create BullMQ queue:", err);
        return null;
    }
}

// Global singleton guard for worker (prevents duplicates in dev HMR)
const globalForWorker = global as unknown as { emailWorker: Worker | null };

function ensureWorker(): void {
    if (globalForWorker.emailWorker || emailWorker) return;
    if (isBuildTime || !process.env.REDIS_URL || !process.env.BREVO_API_KEY)
        return;

    try {
        const connection = new IORedis(process.env.REDIS_URL!, {
            maxRetriesPerRequest: null,
            lazyConnect: true,
        });
        const worker = new Worker(
            QUEUE_NAME,
            async (job: Job<EmailJob>) => {
                const { to, subject } = job.data;
                try {
                    await sendViaBrevo(job.data);
                    console.log(
                        `[Email Worker] Sent "${subject}" to ${to} (attempt ${job.attemptsMade + 1})`,
                    );
                } catch (error) {
                    const err = error as Error;
                    console.error(
                        `[Email Worker] Failed to send "${subject}" to ${to}:`,
                        err.message || error,
                    );
                    throw error;
                }
            },
            {
                connection,
                concurrency: 5,
                limiter: {
                    max: 10,
                    duration: 1000, // 10 emails/sec max
                },
            },
        );

        worker.on("failed", (job, err) => {
            console.error(
                `[Email Worker] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
                err.message,
            );
        });

        worker.on("error", (err) => {
            console.error("[Email Worker] Worker error:", err);
        });

        emailWorker = worker;
        globalForWorker.emailWorker = worker;
        console.log("[Email Worker] Started processing email queue");
    } catch (err) {
        console.warn("[Email Worker] Failed to start:", err);
    }
}

// ─── Email Service ───────────────────────────────────────────────────────────

const DEFAULT_FROM = process.env.EMAIL_FROM || "clashutosh04@gmail.com";

class EmailService {
    constructor() {
        // Start the worker on first import (production: single instance in Docker)
        ensureWorker();
    }

    /**
     * Queue an email for async delivery via BullMQ → Brevo.
     * Falls back to direct send if Redis is unavailable.
     * Never throws — errors are logged and swallowed.
     */
    private async queueEmail(
        to: string,
        subject: string,
        html: string,
    ): Promise<void> {
        const job: EmailJob = { to, subject, html, from: DEFAULT_FROM };

        const queue = getQueue();
        if (queue) {
            try {
                await queue.add("send-email", job, {
                    priority: this.getPriority(subject),
                });
                return;
            } catch (err) {
                console.warn("[Email] Queue add failed, falling back:", err);
            }
        }

        // Fallback: direct send
        try {
            await sendViaBrevo(job);
            console.log(`[Email] Direct sent "${subject}" to ${to}`);
        } catch (err) {
            const error = err as Error;
            console.error("[Email] Direct send error:", error.message || err);
        }
    }

    /** Higher priority for auth-critical emails */
    private getPriority(subject: string): number {
        if (subject.includes("Verify") || subject.includes("Reset")) return 1;
        if (subject.includes("Delete")) return 2;
        return 5; // welcome emails, etc.
    }

    // ─── Public API (unchanged interface) ────────────────────────────────

    public async sendEmail(
        to: string,
        subject: string,
        text: string,
    ): Promise<void> {
        await this.queueEmail(to, subject, `<pre>${text}</pre>`);
    }

    public async sendPasswordResetMail(
        to: string,
        url: string,
        name: string,
    ): Promise<void> {
        await this.queueEmail(
            to,
            "Reset Your Password",
            generateHtml({
                name,
                headline: "RESET YOUR PASSWORD",
                body: `We noticed you requested to reset your password. <strong>Don't worry!</strong><br>Click the button below to set up a new password:`,
                buttonText: "Reset password",
                buttonUrl: url,
                footerText: `For your security, this link will expire in 1 hour. If you didn't request a password reset, you can ignore this email — your account is safe and secure.`,
            }),
        );
    }

    public async sendEmailVerificationMail(
        to: string,
        url: string,
        name: string,
    ): Promise<void> {
        await this.queueEmail(
            to,
            "Verify Your Email",
            generateHtml({
                name,
                headline: "VERIFY YOUR EMAIL",
                body: `Welcome to Youtube! <strong>We're excited to have you.</strong><br>Click the button below to verify your email address:`,
                buttonText: "Verify Email",
                buttonUrl: url,
                footerText: `For your security, this link will expire in 1 hour. If you didn't sign up for Youtube, you can ignore this email.`,
            }),
        );
    }

    public async sendDeleteAccountVerificationMail(
        to: string,
        url: string,
        name: string,
    ): Promise<void> {
        await this.queueEmail(
            to,
            "Verify Account Deletion",
            generateHtml({
                name,
                headline: "DELETE YOUR ACCOUNT?",
                body: `We received a request to permanently delete your Youtube account. <strong>This action is irreversible.</strong><br>If you're sure, click the button below to verify:`,
                buttonText: "Verify Deletion",
                buttonUrl: url,
                footerText: `If you didn't request to delete your account, please ignore this email and secure your account immediately.`,
            }),
        );
    }

    public async sendUserJoiningMail(to: string, name: string): Promise<void> {
        await this.queueEmail(
            to,
            "Welcome to Youtube",
            generateHtml({
                name,
                headline: `WELCOME ${name}!`,
                body: `Thank you for joining the Youtube family! We're thrilled to have you here. <br>Start exploring and sharing your passion with the world.`,
                buttonText: "Go to Youtube",
                buttonUrl:
                    process.env.NEXT_PUBLIC_APP_URL ||
                    process.env.APP_URL ||
                    "#",
                footerText: `If you have any questions, our team is here to help. Just reply to this email or visit our Support Center.`,
            }),
        );
    }
}

// ─── HTML Template Generator ─────────────────────────────────────────────────

function generateHtml({
    name,
    headline,
    body,
    buttonText,
    buttonUrl,
    footerText,
}: {
    name: string;
    headline: string;
    body: string;
    buttonText: string;
    buttonUrl: string;
    footerText: string;
}) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${headline}</title>
    <style>
        body { margin: 0; padding: 0; background-color: #f0f0f0; font-family: 'Helvetica', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
        table { border-collapse: collapse; }
        .container { width: 100%; max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .headline { font-family: 'Arial Black', Gadget, sans-serif; font-size: 26px; font-weight: 900; color: #000000; text-transform: uppercase; margin: 0; }
        .body-text { font-size: 15px; color: #1a1a1a; line-height: 1.4; margin: 15px 0; }
        .small-text { font-size: 12px; color: #444444; line-height: 1.4; }
        .btn-black { background-color: #231f20; color: #ffffff !important; text-decoration: none; padding: 12px 25px; display: inline-block; font-weight: bold; font-size: 16px; border-radius: 4px; }
        @media screen and (max-width: 600px) {
            .side-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .stack { display: block !important; width: 100% !important; padding-left: 0 !important; text-align: center !important; }
            .stack-padding { padding-top: 20px !important; }
        }
    </style>
</head>
<body>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
            <td align="center">
                <table class="container" role="presentation" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td>
                            <img src="https://images.unsplash.com/photo-1768488801582-3d05e9cd7c14?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.1.0" alt="Banner" style="width: 100%; height: 200px; display: block; overflow:hidden; object-fit: cover;">
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 0 40px; position: relative; height: 40px;">
                            <div style="text-align: right; margin-top: -50px;">
                                <img src="https://i.postimg.cc/q7S7Y8Yh/santa-cruz-logo.png" alt="Logo" width="100" style="display: inline-block; border-radius: 50%; border: 4px solid #ffffff;">
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td class="side-padding" style="padding: 0 50px 40px 50px;">
                            <h1 class="headline">HEY ${name.toUpperCase()}!</h1>
                            <p class="body-text">${body}</p>
                            <table width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 25px;">
                                <tr>
                                    <td class="stack" width="180" style="vertical-align: top;">
                                        <a href="${buttonUrl}" class="btn-black">${buttonText}</a>
                                    </td>
                                    <td class="stack stack-padding" style="padding-left: 20px; vertical-align: middle;">
                                        <p class="small-text" style="margin: 0;">
                                            Is this button not working for you? In that case use the following link:<br>
                                            <a href="${buttonUrl}" style="color: #3498db; text-decoration: none; word-break: break-all;">${buttonUrl}</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            <div style="margin-top: 40px;">
                                <p class="body-text" style="font-size: 14px; color: #666666;">${footerText}</p>
                            </div>
                            <div style="margin-top: 40px; border-top: 1px solid #eeeeee; padding-top: 20px;">
                                <p class="body-text" style="margin-bottom: 5px;">Thanks for being part of the Youtube family!</p>
                                <p style="font-size: 16px; font-weight: bold; margin: 0;">Stay Creative,</p>
                                <p style="font-size: 16px; font-weight: bold; margin: 0;">The Youtube Team</p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

// ─── Singleton Export ─────────────────────────────────────────────────────────
export const emailService = new EmailService();
