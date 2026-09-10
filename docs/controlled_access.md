# Controlled Access
- Controlled access ensures that only authorized users can access certain resources or perform specific actions within a system.

# Users Table
- isOwner
- isAdmin
- isDirectoryEditor
- isPageEditor

# Permissions
- Owner - can do everything an Admin can do
- Owner - can also assign and remove other Owners in Access Control
- Admin - can manage all Administration pages
- Admin - can not assign and manage Owners in Access Control
- Directory Editor - Can only see and manage the Directory section of the Admin page.
- Page Editor - Can see and manage the Pages and Navigation sections of the Admin page.
- default user (with no admin permissions) - can only access non-admin sections of the system


# UI

## Home Page
- Admin card on home page is not available by default
- Only users with any admin permissions can see and access the Admin card on the home page.

## Admin Page
- Only users with any admin permissions can access the Admin page.
- The visibility and accessibility of different sections within the Admin page are controlled based on the user's specific admin permissions.   
- All admin permissions can see the Stats page (default)
- Only Owners and Admins can see and manage the Access Control, Access Requests and Login Accounts section within the Admin page.
- Only Directory Editors can see and manage the Directory section within the Admin page.
- Only Page Editors can see and manage the Pages and Navigation sections within the Admin page.


# Backend
- Controlled access in the backend is enforced by checking the user's permissions before allowing access to specific resources or actions.