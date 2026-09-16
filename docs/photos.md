# Photo Gallery Technical Specification & Architecture Recommendations

## System Overview
A mobile- and desktop-friendly Photo Gallery feature integrated into the administration dashboard and public portal. Photos are organized logically into **Folders** $\rightarrow$ **Events** $\rightarrow$ **Photos**, managed via Cloudflare Workers, Cloudflare D1 (metadata), and Cloudflare R2 (object storage).

## R2 
- photos are static with long cache lifetimes, typically set to one year, to optimize performance and reduce redundant network requests.
- R2 objects are private and only accessible through the app


## 1. Database Schema Design (Cloudflare D1)

Rather than performing expensive file system operations (moving/copying objects) inside R2 when renaming or re-organizing content, all hierarchy, ordering, and metadata are maintained in D1. R2 object keys remain immutable using UUIDs.

Examples: 

```sql
-- Photo Folders
CREATE TABLE photo_folders (
  id TEXT PRIMARY KEY,               -- e.g., 'fld_uuid'
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Photo Events
CREATE TABLE photo_events (
  id TEXT PRIMARY KEY,               -- e.g., 'evt_uuid'
  folder_id TEXT NOT NULL REFERENCES photo_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  event_date DATE,
  status TEXT CHECK(status IN ('draft', 'published')) DEFAULT 'draft',
  cover_photo_id TEXT,               -- Foreign key to photos(id) set upon photo selection
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Individual Photos
CREATE TABLE photos (
  id TEXT PRIMARY KEY,               -- e.g., 'pho_uuid'
  event_id TEXT NOT NULL REFERENCES photo_events(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,              -- e.g., 'photos/pho_uuid/original.jpg'
  r2_thumb_key TEXT NOT NULL,        -- e.g., 'photos/pho_uuid/thumb.webp'
  r2_display_key TEXT NOT NULL,      -- e.g., 'photos/pho_uuid/display.webp'
  caption TEXT,
  width INTEGER,
  height INTEGER,
  display_order INTEGER DEFAULT 0,
  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_photo_events_folder ON photo_events(folder_id);
CREATE INDEX idx_photo_events_slug ON photo_events(slug);
CREATE INDEX idx_photos_event ON photos(event_id);
```

## 2. R2 Storage & Immutable Key Architecture

To prevent execution timeouts in Cloudflare Workers during bulk folder renames or moves, physical paths in R2 do not reflect folder/event names.
• Object Key Pattern: photos/{photo_id}/{variant}.webp
• Variants: • thumb – 400 \times 400\text{px} cropped/scaled WebP for square thumbnail grids. • display – 1920\text{px} max-width WebP for lightbox viewing. • original – Uncompressed source upload (optional, for archival).

# Mutability Operations Comparison
Database-Backed Strategy (Recommended)

## Move Event to New Folder		
- Single D1 SQL statement: UPDATE photo_events SET folder_id = ? WHERE id = ?.

## Rename Event / Folder		
- Update name and slug column in D1.

## Delete Event	
- Worker background process purges R2 keys; D1 handles cascade.


## 3. Public & Admin Navigation Hierarchy

### Public Routing
• /gallery – Renders all public Photo Folders alongside published Photo Events.
• /gallery/:event_slug – Public Photo Event page with grid and lightbox interactive viewer.

### Navigation Management Integration (Admin -> Site Content -> Navigation)
• Photo Gallery Root: Place the main /gallery endpoint into primary or secondary navigation structure.
• Direct Event Placement: Allow pinning individual published events (e.g., /gallery/100th-celebration) into navigation trees alongside custom links.

### Visibility & Guardrails
- Admin -> Site Content -> Photos requires "Page Editor" or "Admin" or "Owner"
• Unauthenticated visitors requesting a draft event route directly return a 404 Not Found.
• Authenticated admins viewing a draft event see a sticky preview badge ("Draft - Not visible to public").

## 4. Administrative Workflow (Admin -> Site Content -> Photos)

## Folder & Event Operations
• Folder Management: Create, rename, or delete folders. Deleting a folder prompts an explicit confirmation modal listing child events and photo counts.
• Event Actions: • Create/Edit metadata (Name, Slug, Date, Description, Status). • Re-assign event to another folder via simple select dropdown. • Set Cover Image directly by clicking any photo within the event grid edit screen.

## Bulk Drag-and-Drop Uploads

• Client-side direct or multi-part uploads to Worker endpoints.
• Automatic image resizing pipeline via Cloudflare Image Resizing  to generate thumb and display variants.
• Re-order grid using drag-and-drop handles, updating display_order attributes across photo rows.

## 5. UI/UX Specifications

### Grid Layout (Event Page)
• Responsive CSS Grid utilizing grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)) on mobile, scaling to 200px on desktop.
• Fixed 1:1 aspect ratio cards (aspect-square) with object-fit: cover for crisp alignment.

### Lightbox Viewer
• Modal container opening on thumbnail selection.
• Touch swipe navigation enabled (touchstart/touchend gesture tracking) for mobile users.
• Keyboard navigation bindings (ArrowLeft, ArrowRight, Escape).
• Dynamic preloading of adjacent images (\pm 1) for instantaneous transitions.