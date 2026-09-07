# Email Sending

Park Hill uses Cloudflare Email Sending through the `EMAIL` binding in `wrangler.json`.

- From: `auth@parkhillfw.org`
- Reply-To: `parkdn@gmail.com`
- Magic-link lifetime: 15 minutes
- Session lifetime: 400 days
- Local and test sends use the configured remote binding

```ts
await env.EMAIL.send({
  to: email,
  from: 'auth@parkhillfw.org',
  subject: 'Your Park Hill Directory sign-in link',
  html,
  text,
  headers: {
    'Reply-To': 'parkdn@gmail.com',
  },
});
```

Magic-link requests are limited to one per minute per email address and ten per 24-hour period. The server stores a hash of the one-time token, consumes it after verification, and never logs the token or complete login URL.
