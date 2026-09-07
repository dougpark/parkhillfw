# intent.md

## Summary
- Mobile First with desktop support
- Neighborhood directory and information site
- manage directory
- manage pages
- manage menus
- manage info-messages
- manage users
- show directory
- show pages
- show menus
- show info-messages

## Modes: User vs Admin
- for authorized editors and admins show Admin menu option in top right
- admin page is two column with left column showing admin features they are authorized for
- right column is details editor for the selected admin feature

## Users
- email magic links
- long term 400 day browser token
- send email through Amazon SES
- flags - owner, admin, directory-editor, page-editor
- homeowner match to their directory entry by email / default to same email, can override to a directory email on user table

## Email subsystem
- use Amazon SES
- send magic link emails for login

## Directory
- import from existing json files - done
- format for list
- format for individual view
- full text search

## Pages
- markdown with attachments
- full markdown editor page with preview overlay
- full drag and drop images and attachments
- full copy and paste images
- page can be marked for showing on homepage
- Public flag can show to non-authorized users
- Draft Publish flag to hide unfinished pages, defaults to Draft


## Info-Messages
- short md  message to show at top in info box on homepage
- flagged priority shows at top of all pages
- start date 
- end date
- select from small color pallet
- select image from drive
- select from small icon pallet

## Homepage
- shows info messages
- show security phone number
- shows cards for highlighted pages
- non-authorized users see only public flagged pages and menus

## Menus
- Folders contain other folders and pages
- pages show markdown previews
- public flag can show to non-authorized users

## Documents
- Drive type listing of all images and documents
- copy md link so can paste into page editor
- thumbnail previews

## Authorization Levels
- Owner - site owner and can edit everything, multiple owners, can assign new owners
- Admin - full site admin, can edit everything, can assign new admins
- Page-Editor - can only edit all pages, info-messages and menus
- Directory-Editor - can only edit all directory entries
- User - no admin features only see the generated output

## Tech Stack
- Bun
- Hono
- Vue
- Cloudflare Wrangler 
- worker
- D1
- R2
- Amazon SES for magic link emails
- markdown editor/ preview generator codemirror@6.0.2


## Explicit Data Schema & Relationships
•	User ‭$\leftrightarrow$‬ Directory Mapping:
•	FK Link: users.resident_id (Nullable Foreign Key to residents.id ON DELETE SET NULL).
•	Link Resolution: On login, if resident_id is null, attempt auto-linking where users.email === residents.email. Set link_status to 'auto_matched'.
•	Manual Override & Linking: If no match is found, set link_status to 'unlinked'. Admins can manually assign or override resident_id via the admin dashboard, updating link_status to 'admin_linked'.
•	Directory Model (Normalized 3-Table System):
•	Households: Physical property anchor storing street_address, year_moved_in, park_hill_member, security_member, pets, photo_key (R2), and notes.
•	Residents: Adults/Members tied to a household storing household_id (FK), first_name, last_name, is_primary_contact, email, phone_mobile, phone_home, phone_work, and occupation.
•	Children: Dependents/Youth tied to a household storing household_id (FK), name, birth_year, school, residence_location, and service flags (babysitting, pet_sitting, special_skills).
•	Full-Text Search: Direct SQLite queries or FTS5 virtual tables indexing residents.first_name, residents.last_name, residents.email, households.street_address, and children.name.
•	Menu Hierarchy (Nested Trees):
•	Storage Pattern: Adjacency List pattern (id, parent_id [nullable FK -> menus.id], title, page_id [nullable FK -> pages.id], target_url [nullable], display_order, is_public).
•	Pages & Documents:
•	Pages: pages (id, slug [unique], title, body_md, is_public, is_homepage_card, created_at, updated_at).
•	Documents & Attachments: documents (id, r2_key, filename, mime_type, size_bytes, uploaded_by_user_id [FK -> users.id], created_at).



## Database Schema Constraints (D1 + Drizzle)
•	Households: id (PK), street_address (text, indexed), year_moved_in (integer), park_hill_member (boolean), security_member (boolean), pets (text), photo_key (text R2 key), notes (text), created_at, updated_at.
•	Residents: id (PK), household_id (FK -> households.id ON DELETE CASCADE), first_name (text), last_name (text), is_primary_contact (boolean), email (text, indexed), phone_mobile (text), phone_home (text), phone_work (text), occupation (text), created_at.
•	Children: id (PK), household_id (FK -> households.id ON DELETE CASCADE), name (text), birth_year (integer), school (text), occupation (text), residence_location (text), babysitting (boolean), pet_sitting (boolean), special_skills (text).
•	Users: id (PK), email (text, unique index), resident_id (nullable FK -> residents.id ON DELETE SET NULL), link_status (enum text: 'auto_matched' | 'admin_linked' | 'unlinked'), is_owner (boolean), is_admin (boolean), is_page_editor (boolean), is_directory_editor (boolean), created_at.
•	Pages: id (PK), slug (text, unique index), title (text), body_md (text), is_public (boolean), is_homepage_card (boolean), created_at, updated_at.
•	Menus: id (PK), parent_id (nullable FK -> menus.id for nested folders), title (text), page_id (nullable FK -> pages.id), target_url (nullable text), display_order (integer), is_public (boolean).
•	InfoMessages: id (PK), text_md (text), priority (boolean), start_date (timestamp), end_date (timestamp), bg_color (text), icon_name (text), r2_image_key (text).
•	Documents: id (PK), r2_key (text), filename (text), mime_type (text), size_bytes (integer), uploaded_by_user_id (FK -> users.id), created_at.

## Auth Workflow Specs
- Magic link token valid for 15 minutes, stored in `auth_tokens` table, destroyed on redemption.
- Successful authentication returns an `HttpOnly` cookie containing a 400-day session UUID, stored in `sessions` table.
- Authorization: Middleware must evaluate Hono request context against user `role_flags`.

## UI/UX Specifics
- Editor: Markdown editor with auto-upload on drag-and-drop or paste (POST to `/api/documents/upload`, store in R2, return Markdown image link).
- Full Text Search: Use D1 FTS5 extension or indexed multi-column search query over directory entries.
- Mobile Layout: Mobile-first responsive navigation bar collapsible into a slide-over menu panel. Admin view collapses two-column layout into tabbed navigation on screens < 768px.

```javascript
    // Pin exact versions — bare "codemirror@6" resolves to a mis-tagged CM5 republish.
    // NOTE: deliberately NOT importing @codemirror/language separately here. Doing so (to
    // get classHighlighter for stable tok-* CSS classes) resolves a different @lezer/highlight
    // instance than the one @codemirror/lang-markdown's tags use, and crashes
    // ("TypeError: Cannot read properties of undefined (reading 'scope')") inside
    // @lezer/highlight's highlightRange during decoration build. minimalSetup's own bundled
    // defaultHighlightStyle comes from the same resolution graph as `codemirror` core and
    // works without error, so we rely on that instead (see CSS notes in notes.html).
    const CM6_URLS = {
        core: 'https://esm.sh/codemirror@6.0.2',
        state: 'https://esm.sh/@codemirror/state@6',
        view: 'https://esm.sh/@codemirror/view@6',
        commands: 'https://esm.sh/@codemirror/commands@6',
        markdown: 'https://esm.sh/@codemirror/lang-markdown@6',
    }
```

## Database

[Database Schema](../src/db/schema.sql)