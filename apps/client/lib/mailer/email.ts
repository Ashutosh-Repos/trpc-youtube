import { createTransport, Transporter } from "nodemailer";
export class EmailService {
    private transporter: Transporter;
    constructor() {
        const port = Number(process.env.SMTP_PORT);
        this.transporter = createTransport({
            host: process.env.SMTP_HOST,
            port: port,
            // secure: true for port 465, false for other ports (like 587)
            secure: port === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });
    }

    public async sendEmail(to: string, subject: string, text: string) {
        const mailOptions = {
            from: `"${process.env.APP_NAME || "Youtube"}" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text,
        };
        await this.transporter.sendMail(mailOptions);
    }

    public async sendPasswordResetMail(to: string, url: string, name: string) {
        const mailOptions = {
            from: `"${process.env.APP_NAME || "Youtube"}" <${process.env.SMTP_USER}>`,
            to,
            subject: "Reset Your Password",
            html: this.generateHtml({
                name,
                headline: "RESET YOUR PASSWORD",
                body: `We noticed you requested to reset your password. <strong>Don't worry!</strong><br>Click the button below to set up a new password:`,
                buttonText: "Reset password",
                buttonUrl: url,
                footerText: `For your security, this link will expire in 1 hour. If you didn't request a password reset, you can ignore this email — your account is safe and secure.`,
            }),
        };
        await this.transporter.sendMail(mailOptions);
    }

    public async sendEmailVerificationMail(
        to: string,
        url: string,
        name: string,
    ) {
        const mailOptions = {
            from: `"${process.env.APP_NAME || "Youtube"}" <${process.env.SMTP_USER}>`,
            to,
            subject: "Verify Your Email",
            html: this.generateHtml({
                name,
                headline: "VERIFY YOUR EMAIL",
                body: `Welcome to Youtube! <strong>We're excited to have you.</strong><br>Click the button below to verify your email address:`,
                buttonText: "Verify Email",
                buttonUrl: url,
                footerText: `For your security, this link will expire in 1 hour. If you didn't sign up for Youtube, you can ignore this email.`,
            }),
        };
        await this.transporter.sendMail(mailOptions);
    }

    public async sendDeleteAccountVerificationMail(
        to: string,
        url: string,
        name: string,
    ) {
        const mailOptions = {
            from: `"${process.env.APP_NAME || "Youtube"}" <${process.env.SMTP_USER}>`,
            to,
            subject: "Verify Account Deletion",
            html: this.generateHtml({
                name,
                headline: "DELETE YOUR ACCOUNT?",
                body: `We received a request to permanently delete your Youtube account. <strong>This action is irreversible.</strong><br>If you're sure, click the button below to verify:`,
                buttonText: "Verify Deletion",
                buttonUrl: url,
                footerText: `If you didn't request to delete your account, please ignore this email and secure your account immediately.`,
            }),
        };
        await this.transporter.sendMail(mailOptions);
    }

    public async sendUserJoiningMail(to: string, name: string) {
        const mailOptions = {
            from: `"${process.env.APP_NAME || "Youtube"}" <${process.env.SMTP_USER}>`,
            to,
            subject: "Welcome to Youtube",
            html: this.generateHtml({
                name,
                headline: `WELCOME ${name}!`,
                body: `Thank you for joining the Youtube family! We're thrilled to have you here. <br>Start exploring and sharing your passion with the world.`,
                buttonText: "Go to Youtube",
                buttonUrl: process.env.APP_URL || "#",
                footerText: `If you have any questions, our team is here to help. Just reply to this email or visit our Support Center.`,
            }),
        };
        await this.transporter.sendMail(mailOptions);
    }

    private generateHtml({
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
        
        /* Typography */
        .headline { font-family: 'Arial Black', Gadget, sans-serif; font-size: 26px; font-weight: 900; color: #000000; text-transform: uppercase; margin: 0; }
        .body-text { font-size: 15px; color: #1a1a1a; line-height: 1.4; margin: 15px 0; }
        .small-text { font-size: 12px; color: #444444; line-height: 1.4; }
        
        /* Button Style */
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
                            <p class="body-text">
                                ${body}
                            </p>

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
                                <p class="body-text" style="font-size: 14px; color: #666666;">
                                    ${footerText}
                                </p>
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
</html>
        `;
    }
}
export const emailService = new EmailService();
