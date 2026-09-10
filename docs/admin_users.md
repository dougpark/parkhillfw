# Admin Users Section

# User Account & Session Management Specification

## Overview
While the **Directory** manages physical household data (names, addresses, phone numbers, children), the **Users Admin** page focuses strictly on **Identity, Authentication, and Session Security**. 

This system manages login accounts tied to directory entries, handles Cloudflare D1 token-based cookie sessions, and provides administrative overrides for support and security.

---

## Key Administrative Capabilities

* **Force Logout / Session Revocation**: Invalidate all stored cookie tokens for a specific user across all devices (e.g., lost phone, public computer, compromised account).
* **Account Suspension**: Toggle account status between `Active` and `Suspended`. Suspended accounts cannot request magic links or authenticate with existing session tokens (useful for departed residents).
* **Magic Link Dispatch**: Direct trigger to send an instant magic link login email for residents who have difficulty receiving or finding auto-generated emails.
* **Session Auditing**: Inspect total active device tokens, registration timestamps, and last active authentication time for troubleshooting.


# UI
- provide a search of the login user accounts
- display user status (Active/Suspended)
- show last login time and active sessions
- provide buttons for Force Logout, Account Suspension, and Magic Link Dispatch
- include confirmation dialogs for destructive actions (e.g., Force Logout, Account Suspension)
- provide visual feedback for successful or failed actions 
- allow filtering and sorting of user accounts based on status, last login time, and active sessions

## Login Process
- should honor account suspension flag and prevent suspended users from logging in or using existing session tokens.

# UI Flow
1. Admin navigates to the **Admin Users** page.
2. Admin uses the search bar to locate a specific user account.
3. Admin reviews the user's status, last login time, and active sessions.
4. Admin performs actions such as Force Logout, Account Suspension, or Magic Link Dispatch as needed.
5. Admin confirms any destructive actions through confirmation dialogs.
6. Admin observes visual feedback (e.g., toast notifications) to verify the success or failure of actions.
7. Log all administrative actions for auditing purposes, including timestamps, admin user performing the action, and the affected user account in the existing logs table.

# Search by User Name
- if user name is not in the login users table then follow the link to the resident table to find matching names for the list.
- when a name is clicked in the search results then hide the search results from the UI and show the corresponding user account details for administrative actions.

# Log View
- display a chronological list of all administrative actions performed on user accounts
- include details such as timestamp, admin user, affected user account, and action type (Force Logout, Account Suspension, Magic Link Dispatch)
- include pagination for easier navigation through large sets of logs
- see the Admin -> Access Accounts view for similar log view for a different filter.
