# Document Library
- Admin page to upload and delete documents
- create and delete folders
- copy md link to document in R2
- copy md link to folder (for use in Pages)
- Page Editor can view and manage documents in attachments section
- This project is like a simple Google Drive
- This is a document archive not a working folder

# Folder
- name
- description
- created at
- folders cannot contain other folders
- icon button to delete folder with confirmation modal
- show document counts before delete
- folder can be published to a md link on a Page
- when clicked then a list of documents in the folder with be shown and documents can be viewed in the browser modal
- Example: A folder called "Meeting Notes" containing all the notes from various meetings. When published to a Page, clicking the folder will display a list of its documents, which can then be viewed in the browser.

# Document
- name
- description
- created at
- size
- type
- draft / published flag
- icon button to preview document in modal
- icon button to delete document with confirmation modal
- most documet types are PDF, with some image files, reject MS Office document types with message that should be saved to pdf first.
- limit upload file size to a reasonable maximum (e.g., 20MB)
- default name based on file name of uploaded document but can be updaed in D1 for a display name (e.g., "Document Title")
- support renaming documents after upload

# Admin -> Site Content -> Documents
- Remove skeleton place holder at Admin -> Documents
- search and list documents
- icon button to preview document in modal
- icon button to delete document with confirmation modal
- documents can be replaced with like file_named document verify with modal before replacing


# Page Editor Attachments Section
- PageView.vue
- document search by name
- filter by document mime types
- list results
- icon button to insert link to document at cursor position on page
- icon button to preview document in modal
- links in page should ask to view or download
- viewer modal to preview documents
- start with standard browser viewer for supported document types
- phase 2 will have enhanced document viewer with support for more file types 

# R2
- Private bucket for storing documents
- Access controlled via signed URLs
- Documents are uploaded and retrieved from this bucket
- Bucket is not directly accessible from the public internet
- All access to documents must go through the application which generates signed URLs   
- Any authenticated user can read the documents linked from a Page through the signed URLs
- Only users with Paged Editor, Admin or Owner permissions can upload, replace, or delete documents in the R2 bucket
- /documents
- /documents/:id
- D1 will store metadata about the documents, such as name, description, created at, size, type, and draft/published flag and folder



# Eample Implementation

Here is a structural blueprint for implementing your lightweight Document Library built on Cloudflare Workers (Hono), D1, R2, and Vue 3.


## (Example)Database Schema (Cloudflare D1)

```sql
CREATE TABLE document_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL,          -- User-editable display name
  original_filename TEXT NOT NULL,
  description TEXT,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,       -- Path in R2: e.g. "documents/{doc_id}"
  is_published INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (folder_id) REFERENCES document_folders(id) ON DELETE CASCADE
);

CREATE INDEX idx_docs_folder ON documents(folder_id);
CREATE INDEX idx_docs_search ON documents(name, original_filename);
```

## R2 Security & Presigned URLs Architecture

• Storage Path: Keep objects organized using unique document IDs rather than raw filenames: documents/{doc_id}.

• Upload Validation: Check MIME types and size limits on the Hono backend before generating R2 PUT operations. Reject .docx, .xlsx, .pptx, and .doc with HTTP 400: "MS Office files are not supported. Please convert to PDF before uploading." Set maximum payload size to 20MB (20 * 1024 * 1024 bytes).

• Signed URL Generation: Instead of public R2 links, route requests through a Hono endpoint that checks user authentication and streams the file 

## Key API Endpoints (Hono)

• GET /api/documents/search?q=...&type=... – Instant search endpoint for the Page Editor attachment picker.

• POST /api/documents/upload – Accepts multipart/form-data, verifies user role (Admin/Editor), validates file size (<20MB) and type (reject Office docs, accept PDF/images), stores the file in R2, and creates a record in D1.

• PUT /api/documents/:id/replace – Replaces the existing file payload in R2 while keeping the same metadata ID.

• DELETE /api/folders/:id – Queries count of documents in folder (SELECT COUNT(*) FROM documents WHERE folder_id = ?), returns count for confirmation UI, and deletes folder + R2 objects on confirmation.

## UI & Component Breakdown

• Folder Management: 
• Displays single-level folder cards/rows (no nesting allowed). • Delete action triggers a modal: "Deleting '[Folder Name]' will permanently remove [X] documents. Proceed?"

• Document Replacement Flow: 
• When an admin uploads a file with a matching name, prompt: "A document named '[Name]' already exists. Do you want to replace the existing file?"

• PageView.vue - Page Editor Markdown Integration: 
• Clicking "Insert Document" in the attachment panel inserts standard Markdown pointing to your authenticated viewer route: [Document Title](/api/documents/view/doc_123) 
• When clicked by a end-user, view in browser viewer panel.

## Phase 2 Preview Readiness

Start Phase 1 using standard browser <iframe :src="presignedUrl"> or native embed tags for inline PDF rendering and <img> tags for image formats. This sets up a clean abstraction layer so you can easily drop in a custom canvas renderer (like PDF.js) in Phase 2.