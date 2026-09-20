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

export async function sendMagicLinkEmail(email: EmailBinding, toEmail: string, token: string, code: string, origin: string, adminEmail: string, siteName: string) {
    const loginUrl = `${origin}/auth/verify?token=${encodeURIComponent(token)}`;
    const html = `<div style="background:#ffffff;padding:32px 16px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#f7f6f1;border:1px solid #d7ded8;border-radius:16px;padding:32px;color:#1e2f23"><div style="text-align:center;margin-bottom:16px"><img src="${origin}/ph-logo.jpeg" alt="${siteName}" style="height:144px" /></div><h1 style="font-size:22px;text-align:center;margin:0 0 16px">${siteName}</h1><p>Use the button below to sign in.</p><p style="text-align:center;margin:24px 0"><a href="${loginUrl}" style="display:inline-block;background:#e07a5f;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">Sign in</a></p><p style="color:#52685a;font-size:14px">Or enter this code on the sign-in screen:</p><p style="font-size:32px;font-weight:700;letter-spacing:4px;margin:8px 0;text-align:center">${code}</p><p style="color:#52685a;font-size:13px;margin-top:24px">This link and code expire in 15 minutes and can only be used once. If you did not request it, you can ignore this email.</p></div></div>`;
    const text = `${siteName}\n\nSign in using this link:\n${loginUrl}\n\nOr enter this code on the sign-in screen:\n${code}\n\nThis link and code expire in 15 minutes and can only be used once.`;

    await email.send({
        to: toEmail,
        from: `"${siteName}" <support@parkhillfw.org>`,
        subject: `Your ${siteName} sign-in link`,
        html,
        text,
        replyTo: `"Admin" <support@parkhillfw.org>`,
    });
}

export async function sendAccessRequestAdminNotificationEmail(
    email: EmailBinding,
    adminEmail: string,
    requesterEmail: string,
    fullName: string,
    streetAddress: string,
    origin: string,
    siteName: string,
) {
    const reviewUrl = `${origin}/admin/access-requests`;
    const subject = `New ${siteName} access request needs review`;
    const text = `A new access request needs admin review.\n\nEmail: ${requesterEmail}\nName: ${fullName}\nAddress: ${streetAddress}\n\nReview it here: ${reviewUrl}`;
    const html = `<div style="background:#ffffff;padding:32px 16px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#f7f6f1;border:1px solid #d7ded8;border-radius:16px;padding:32px;color:#1e2f23"><h1 style="font-size:22px;margin:0 0 16px">New access request</h1><p>A new ${siteName} access request needs admin review.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="padding:6px 0;color:#52685a;font-size:13px">Email</td><td style="padding:6px 0">${requesterEmail}</td></tr><tr><td style="padding:6px 0;color:#52685a;font-size:13px">Name</td><td style="padding:6px 0">${fullName}</td></tr><tr><td style="padding:6px 0;color:#52685a;font-size:13px">Address</td><td style="padding:6px 0">${streetAddress}</td></tr></table><p style="text-align:center;margin:24px 0"><a href="${reviewUrl}" style="display:inline-block;background:#e07a5f;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">Review request</a></p></div></div>`;

    await email.send({
        to: adminEmail,
        from: `"${siteName}" <support@parkhillfw.org>`,
        subject,
        html,
        text,
    });
}

export async function sendAccessRequestOutcomeEmail(
    email: EmailBinding,
    toEmail: string,
    outcome: 'approved' | 'rejected',
    token: string | null,
    origin: string,
    adminEmail: string,
    siteName: string,
) {
    const loginUrl = token ? `${origin}/auth/verify?token=${encodeURIComponent(token)}` : null;
    const approved = outcome === 'approved';
    const subject = approved ? `Your ${siteName} access was approved` : `Update on your ${siteName} request`;
    const text = approved
        ? `Your ${siteName} access was approved. This sign-in link is valid for 48 hours. Sign in here: ${loginUrl}`
        : `Your ${siteName} access request was not approved. Please contact <support@parkhillfw.org> if you believe this was a mistake.`;
    const html = approved
        ? `<div style="background:#ffffff;padding:32px 16px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#f7f6f1;border:1px solid #d7ded8;border-radius:16px;padding:32px;color:#1e2f23"><div style="text-align:center;margin-bottom:16px"><img src="${origin}/ph-logo.jpeg" alt="${siteName}" style="height:144px" /></div><h1 style="font-size:22px;text-align:center;margin:0 0 16px">Access approved</h1><p>Your ${siteName} access was approved and your email is connected to the directory.</p><p style="text-align:center;margin:24px 0"><a href="${loginUrl}" style="display:inline-block;background:#e07a5f;color:#ffffff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">Sign in to the directory</a></p><p style="color:#52685a;font-size:13px;margin-top:24px">This approval sign-in link is valid for 48 hours and can only be used once.</p></div></div>`
        : `<div style="background:#ffffff;padding:32px 16px;font-family:Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#f7f6f1;border:1px solid #d7ded8;border-radius:16px;padding:32px;color:#1e2f23"><div style="text-align:center;margin-bottom:16px"><img src="${origin}/ph-logo.jpeg" alt="${siteName}" style="height:144px" /></div><h1 style="font-size:22px;text-align:center;margin:0 0 16px">Request update</h1><p>We were unable to approve your ${siteName} access request at this time.</p><p style="color:#52685a;font-size:13px;margin-top:24px">Please contact <a href="mailto:support@parkhillfw.org">support@parkhillfw.org</a> if you believe this was a mistake.</p></div></div>`;

    await email.send({
        to: toEmail,
        from: `"${siteName}" <support@parkhillfw.org>`,
        subject,
        html,
        text,
        replyTo: `"Admin" <support@parkhillfw.org>`,
    });
}
