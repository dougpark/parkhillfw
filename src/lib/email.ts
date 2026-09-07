type EmailBinding = {
    send(message: {
        to: string;
        from: string;
        subject: string;
        html: string;
        text: string;
        replyTo?: string;
    }): Promise<unknown>;
};

export async function sendMagicLinkEmail(email: EmailBinding, toEmail: string, token: string, origin: string) {
    const loginUrl = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f1f1f"><h1 style="font-size:24px">Park Hill Directory</h1><p>Use the button below to sign in.</p><p><a href="${loginUrl}" style="display:inline-block;background:#1a73e8;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600">Sign in</a></p><p style="color:#444746;font-size:14px">This link expires in 15 minutes and can only be used once. If you did not request it, you can ignore this email.</p></div>`;
    const text = `Park Hill Directory\n\nSign in using this link:\n${loginUrl}\n\nThis link expires in 15 minutes and can only be used once.`;

    await email.send({
        to: toEmail,
        from: 'auth@parkhillfw.org',
        subject: 'Your Park Hill Directory sign-in link',
        html,
        text,
        replyTo: 'parkdn@gmail.com',
    });
}
