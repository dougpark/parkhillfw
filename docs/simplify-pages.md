# Simplify content creation for pages
- the UI and backend are working well individually
- however there is a need to streamline the page management into a consolidated interface.
- the goal is to make the Site-Content -> Navigation -> List View page have complete and intuitive content management capabilities.

## Menu system 
- the site menu system and navigation added the concept of meta-data about the pages, it gives structure to the position of pages on the site. this meta-data view has become difficult to manage and understand for content creators.

## Hierarchy Page
- The Hierarchy Page will primarily serve as a structural overview of the site's navigation, while detailed content management will be handled in the List View page.
- Move the row-level meta-data edit button (pencil icon) to the List View row-level action for easier access and management. pick a new icon for this action that is distinct from the pencil icon.
- remove the row-level delete action for easier management and to prevent accidental deletions.

## List View Page
- the List View page is close to being able to manage the whole content process

### Action Bar Buttons
- create a new button called "+ Add Item" that triggers a popup.
- move the "Add page" button into the "+ Add Item" popup rename button to "Insert Page" since it is not creating a new page but just inserting an existing page into the navigation hierarchy.
- move the "Add Link" button into the "+ Add Item" popup rename button to "New Link".
- move the "New Menu" button into the "+ Add Item" popup.
- create a new "New Page" button in the "+ Add Item" popup, with a quick add panel to get the Title and create a new page. Similar to the "New Page" action in the Site-Content -> Pages section.
- since there is no row context for this "+ Add Item" action in the action bar, it will default to adding new items at the top level of the navigation hierarchy at the bottom of the list.

### Row-level action buttons
- In the menu row replace the "Add page" button with the "Add Item" button and popup. All newly added items should be inserted directly below the current item in the navigation structure.
- each row needs the existing "published" toggle to control and show the visibility of the row 
- the newly added edit meta-data button should be present in each row to allow quick access to edit the page's meta-information.
- if the row represents a page, the row should also include a second icon to edit the page content itself, similar to the current List View implementation.
- keep the existing delete icon for each row to allow removal of items from the navigation hierarchy.


# Rename the switch view button
- rename the "Hierarchy Editor" button to "Reorder Mode" view for better clarity.
- rename the "List View" button to "Edit Mode" view for better clarity.

---

## Implementation Plan

### Affected files
- [src/views/AdminMenusView.vue](../src/views/AdminMenusView.vue) — Edit Mode (list) view, action bar, row actions, modals.
- [src/components/menus/MenuTreeEditor.vue](../src/components/menus/MenuTreeEditor.vue) — Reorder Mode (tree) view.
- [src/components/menus/MenuItemDialog.vue](../src/components/menus/MenuItemDialog.vue) — metadata edit modal (already supports `menu`/`link`/`page` kinds, no change needed).
- [src/components/menus/PagePickerPanel.vue](../src/components/menus/PagePickerPanel.vue) — existing "insert existing page" picker, reused as-is.
- New: `src/components/menus/AddItemMenu.vue` — the "+ Add Item" popup used both in the action bar and per-row.
- [src/index.ts](../src/index.ts) (`POST /api/admin/menus` ~line 2491) — add insert-position support.
- [src/components/menus/menuTree.ts](../src/components/menus/menuTree.ts) — no structural change expected, reused for flattening.

### 1. Rename mode toggle labels
In `AdminMenusView.vue` (~line 183), the toggle button currently reads `mode === 'list' ? 'Hierarchy editor' : 'List view'`. Rename to:
- `mode === 'list'` → button reads **"Reorder Mode"** (switches into tree/reorder mode).
- `mode === 'tree'` → button reads **"Edit Mode"** (switches back into the list).
No change to underlying `mode` ref values (`'list' | 'tree'`) — only the visible labels change.

### 2. Reorder Mode (`MenuTreeEditor.vue`) becomes structure-only
- Remove the **Pencil** button (~line 281) and its `emit('edit', node.row)` handler.
- Remove the **Trash2** button (~line 285) and its `emit('remove', node.row)` handler.
- Remove the now-unused `edit` / `remove` entries from `defineEmits` in this component.
- Keep drag handle, expand/collapse, move up/down, indent/outdent — this view stays purely structural.
- In `AdminMenusView.vue`, remove the `@edit="editing = $event"` and `@remove="deleteTarget = $event"` bindings on `<MenuTreeEditor>` (~lines 213–217), since the tree no longer emits them.

### 3. Edit Mode (`AdminMenusView.vue`) row-level actions
Update each row's action cluster (~lines 243–283):
- **Remove** the existing "Add page" text button.
- **Add** an "Add Item" icon button (only for `kind === 'menu'` rows, same condition as the old "Add page" button) that opens `AddItemMenu` scoped to that row (`parentId: node.row.id`). New items are inserted using `position: 'start'` (see backend section) so they land as the first child directly under the menu row.
- **Keep** the Publish/Unpublish toggle unchanged.
- **Add** a new "edit metadata" icon button on every row (all kinds) using a new icon distinct from `Pencil` — use `Settings2` from `lucide-vue-next`. This opens `MenuItemDialog` for that row (`editing = node.row`), same as today's menu/link pencil behavior, now also available for `page` rows.
- **Keep** a `Pencil` icon button only for `kind === 'page'` rows, exclusively for editing page content (`editPage(node.row)`). It no longer doubles as the metadata editor.
- **Keep** the `Trash2` delete button unchanged.

Resulting per-row icon set:
- `menu` rows: Add Item, Publish toggle, Settings2 (metadata), Trash2 (delete).
- `link` rows: Publish toggle, Settings2 (metadata), Trash2 (delete).
- `page` rows: Publish toggle, Settings2 (metadata), Pencil (content), Trash2 (delete).

### 4. Action bar — "+ Add Item" popup
Replace the three action-bar buttons ("Add page", "Add link", "New menu") with a single **"+ Add Item"** button (icon: `Plus`) that opens `AddItemMenu` with `parentId: null` (top level). Keep the Reorder/Edit mode toggle button separate, to its left.

`AddItemMenu.vue` (new component):
- Props: `parentId: number | null`.
- Emits: `close`, and delegates actual creation back to the parent via emitted events so `AdminMenusView` keeps owning all `fetch` calls: `insert-page`, `new-link`, `new-menu`, `new-page: [title: string]`.
- Internal states: `'menu'` (default — shows 4 options) and `'new-page'` (inline quick-add form with a single Title input + Create/Cancel, matching the quick-add feel of `AdminPagesView.vue`'s "New page" flow).
- Menu options and labels/icons:
  - **Insert Page** (`FilePlus2`) → emits `insert-page` → parent calls existing `openPagePicker(parentId)`.
  - **New Link** (`Link2`) → emits `new-link` → parent calls existing `addLink()` logic, passing `parentId`.
  - **New Menu** (`FolderPlus`) → emits `new-menu` → parent calls existing `addFolder()` logic, passing `parentId`.
  - **New Page** (`FilePlus`) → switches internal state to `'new-page'` form; on submit emits `new-page` with the entered title.
- Rendered as a small anchored dropdown panel (absolute positioned card, closes on outside click / `close` emit), consistent with existing modal styling (`rounded-2xl`/`rounded-3xl`, `border-theme-border`, `bg-surface`).

`AdminMenusView.vue` wiring:
- `addFolder()` / `addLink()` gain an optional `parentId` argument (default `null`) instead of always creating at top level, so the same functions serve both the action bar (`parentId: null`) and row-level "Add Item" (`parentId: node.row.id`).
- New `createNewPage(title: string, parentId: number | null)`:
  1. `POST /api/admin/pages` with `{ title }` → get `page.id`.
  2. `createItem({ kind: 'page', pageId: page.id, title, parentId, position: parentId ? 'start' : 'end' })` to insert into the nav tree.
  3. Jump straight into the page editor (`editingPageId.value = page.id`) so authors land in content editing immediately, mirroring `AdminPagesView.vue`'s `createPage()` flow.
- Row-level "Add Item" passes `position: 'start'` so new items appear directly below the menu row; action-bar "Add Item" passes `position: 'end'` (or omits it, since `'end'` is already the default) so items land at the bottom of the top level, per the doc's note that there's no row context to anchor to.

### 5. Backend: insert position support
In `src/index.ts`, `POST /api/admin/menus` (~line 2491):
- Accept an optional `position?: 'start' | 'end'` field in the request body (default `'end'`, preserving current behavior).
- Where `displayOrder` is currently computed as `siblings.length ? Math.max(...siblings.map(...)) + 1 : 0`, branch:
  - `'end'` (default): unchanged (`max + 1`).
  - `'start'`: `siblings.length ? Math.min(...siblings.map((row) => row.displayOrder ?? 0)) - 1 : 0`.
- This keeps ordering sparse/relative (matches how `/reorder` already tolerates non-contiguous values sorted by `displayOrder` then `id`) — no need to shift sibling rows.

### 6. Suggested implementation order
1. Backend `position` support in `POST /api/admin/menus` (small, testable in isolation via `curl`/API).
2. Rename mode toggle labels (trivial, no behavior change).
3. Strip edit/delete from `MenuTreeEditor.vue` + remove corresponding bindings in `AdminMenusView.vue`.
4. Build `AddItemMenu.vue` as a standalone component (menu options + inline "new page" title form), no wiring yet.
5. Wire `AddItemMenu` into the action bar (`parentId: null`) — replaces the 3 old buttons.
6. Wire `AddItemMenu` into each `menu`-kind row (`parentId: node.row.id`, `position: 'start'`) — replaces "Add page".
7. Add the `Settings2` metadata-edit icon to every row and restrict `Pencil` to page-content editing only.
8. Manual QA pass (see Verification below).

### Verification
- `bun run build` to confirm the Vue/TS compiles cleanly.
- Manual check in dev (`bun run dev`):
  - Reorder Mode: drag/indent/outdent still work; no pencil/trash icons present.
  - Edit Mode: action bar "+ Add Item" opens the popup with all 4 options; each creates the right kind at the bottom of the top level.
  - Row "Add Item" on a menu inserts the new item directly below that menu row.
  - "New Page" quick-add creates a page, inserts it into the nav, and opens the content editor.
  - Metadata icon opens `MenuItemDialog` for menu/link/page rows; page rows still show a separate content-edit pencil.
  - Publish toggle and delete confirmation still behave as before.
