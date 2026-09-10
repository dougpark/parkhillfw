# Dual Login Codes
- in addition to the existing magic links add a 6-digit numeric code for manual entry.

1.	Dual-Credential Generation: When a login is requested, generate both a long cryptographic token (for the URL) and a 6-digit numeric code (for manual entry).
	2.	Database Storage: Store a hash of the token and code in your database (or Cloudflare D1/KV) attached to the user ID, with a short expiration (e.g., 10–15 minutes).
	3.	UI State: When the email is sent, transition the Login Screen app UI to an "Enter 6-Digit Code" input screen.
Security Considerations
•	Rate Limiting: A 6-digit code has only 1,000,000 possibilities (‭$10^6$‬). You must strictly rate-limit code verification attempts (e.g., maximum 3 or 5 failed attempts per request window before invalidating the code entirely).
•	Short Expiration: Keep the TTL (Time-To-Live) for numeric codes short—ideally 15 minutes.
•	Single Use: Immediately invalidate both the magic link token and the 6-digit code in your database as soon as either one is successfully validated.

## email

iOS (Apple Mail + Safari/PWA): When an email or SMS arrives in Apple Mail or Messages, iOS parses the 6-digit code and offers it in the QuickType bar directly above the keyboard, regardless of whether the user is in Safari or a bookmarked Home Screen WebApp.

```
<input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" />
```

## Best Practices for Email 6-Digit Codes


	1.	Use autocomplete="one-time-code": This ensures iOS users receiving emails in Apple Mail get the single-tap code suggestion above their keyboard.
	2.	Use inputmode="numeric": Forces mobile devices (Android and iOS) to open the numeric keypad rather than the full QWERTY keyboard when tapping the box.
	3.	Keep the Code Standalone: In the email body, place the 6-digit code on its own line in large, bold text so Android/non-Apple Mail users can easily long-press to copy it without accidentally selecting surrounding text.