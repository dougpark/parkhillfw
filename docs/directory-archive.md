# Directory Household Archive
- Archive the current household to an archive table and make the address ready for a new household.
- The goal is to remove the AdminHouseholdResetView from the Admin interface and replace its functionality with the new Archive Household workflow in the Directory interface, with the addition of an archive table and updating the log table accordingly.
- /src/views/DirectoryEditView.vue
- Replaces: Admin -> Directory -> Mark Household Vacant /src/views/AdminHouseholdResetView.vue

## Archive
- To safely transition an address for a new incoming family while preserving administrative records, you must archive key identity and historical data before purging active dependencies.

## Essential Data to Retain in household_archive
Since archived data is read-only, consolidating the structure into a single table with a JSON payload minimizes schema complexity while keeping history intact:
• Address Reference: address_id to link back to the permanent property record.
• Archival Metadata: Timestamp (archived_at) and the ID/email of the performing administrator (archived_by_admin_id).
• Snapshot Payload (JSON): • Primary contact full name and primary phone/email. • Array of all adult residents (name, email, phone, role). • Array of children (name, age_group / birth_year). • Historic membership status/years active.
• Audit Trail Entry: A corresponding event logged in your system audit log table containing household_address, primary_resident_name, admin_user, and timestamp.

## Refined Action Steps
Here is the rewritten flow for clearing household tables, ready to be incorporated into your documentation or UI design:

### Step 1: Trigger & Confirmation
1. In DirectoryEditView.vue, when opened through Admin -> Directory -> Edit Household Directory, click Archive Household (located to the left of Save Changes). The button must not appear in the regular Edit My Household flow.
2. Confirm the action in the prompt modal: "Are you sure you want to archive this household? This will wipe all resident profiles and reset the address for new occupants."
- Type the address to confirm in the input field of the prompt modal. (Same as AdminHouseholdResetView.vue)
3. Upon confirmation, the backend processes the archival snapshot, executes the cleanup script, and redirects back to the cleared Edit Household page with a success message.

### Step 2: Database Execution Sequence
When the transaction executes, the system performs the following operations in order:
1. Write Archive Snapshot: Insert historical snapshot and admin metadata into household_archive.
2. Write Audit Log: Record the archival event in the general log table.
3. Purge Household Relational Data: Delete all records tied to the household_id across child tables: • residents & children • Active user sessions, login tokens, & private login emails • pets, notes, favorites, and active memberships
4. Reset Base Household Record: Clear household-level custom fields (e.g., move-in date, primary photo) while keeping the core address record intact and set to vacant status.

## UI and Permission Clarification
- DirectoryEditView.vue is shared by two flows:
	- Edit My Household: regular household members can edit their own household; do not show Archive Household.
	- Admin -> Directory -> Edit Household Directory: directory editors and admins can edit a selected household; show Archive Household here only.
- The archive endpoint should use the same `requireDirectoryEditor()` permission as the existing admin directory editing flow, allowing Directory Editor and Admin/Owner roles.
- The archive action must still be protected server-side; hiding the button in the personal edit flow is not sufficient authorization.