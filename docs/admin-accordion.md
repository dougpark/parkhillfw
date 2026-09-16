# Admin Left Column Accordion Menu

- Modify the left column of the admin page to show categories and submenus.

## Categories
- Status (default)
- Directory
- Site Content
-> Pages
-> Navigation
-> Photos
- User Management
-> Access Requests
-> Login Accounts
-> Access Control
- Documents (coming soon)


## Remember State
- remember the expanded/collapsed state of the accordion sections across page reloads in the browser.

## UI Design Tips for the Accordion Layout
	1.	Keep Sub-Items Compact: Unlike top-level items with double-line descriptions, keep sub-items to single-line text (e.g., Pages and Navigation indented beneath Site Content).
	2.	Auto-Collapse Behavior: When opening a new parent category, automatically collapse previously opened parent sections to prevent the sidebar from overflowing vertically on smaller desktop or tablet screens.
	3.	Breadcrumb Alignment: Ensure clicking a sub-item updates your top breadcrumb trail accordingly:
Home > Admin > User Management > Access Control