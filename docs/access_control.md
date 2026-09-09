# Access Control section of Admin page

# Summary
- search and add a new user
- column layout to check which permissions each user has
- layout: Page Editor, Directory Editor, Admin
- this page is only seen by and accessible to Admins and Owners
- only owners change permissions in the Owner column

# Database - users table
- isOwner
- isAdmin
- isPageEditor
- isDirectoryEditor

# UI
- add a new Access Control section to the Adminvue
- search bar to find and add users
- column layout to display user permissions
- Owner column changeable only by  isOwner
- Admin and Owner access required to view this page
- list of users with their respective permissions
- click pills to modify user permissions
- changes are saved automatically
- users can be assigned to 1 or more permissions
- A delete icon is available to remove users from the list and remove all their permissions.

# Permissions to use this page
- Admin and Owner access required to view and modify user permissions
- Admin can change permissions for all users except the Owner column
- Only owners can change the Owner column
- when an owner permission is granted the associated Admin permission is automatically granted too.

# UI Flow
- search for a user 
- select the user from the search results
- hide search results and show permissions grid
- modify user permissions by clicking pills in the permissions grid
- changes are saved automatically

# Access Control Activity Log
- A new table should be created to store access control activity logs
- track the user making the change and the changes made
- display timestamp of each change
- show log results in section below the user permissions list
- sort by most recent changes
- search Activity Log
- Log should be reusable for other System activities
- such as the Admin Access Request approval or Reject, Page changes and Directory changes
