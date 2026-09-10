import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';

// ==========================================
// 1. DIRECTORY SUBSYSTEM (Normalized 3-Table)
// ==========================================

// Physical Household / Property Anchor
export const households = sqliteTable(
    'households',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        streetAddress: text('street_address').notNull(),
        status: text('status', { enum: ['active', 'vacant', 'archived'] }).notNull().default('active'),
        yearMovedIn: integer('year_moved_in'),

        // Membership Flags
        parkHillMember: text('park_hill_member'), // e.g., "PARK HILL REGULAR", "PARK HILL PACESETTER"
        securityMember: integer('security_member', { mode: 'boolean' }).default(false),

        pets: text('pets'),
        photoKey: text('photo_key'), // R2 Storage Key
        notes: text('notes'),

        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_households_address').on(table.streetAddress),
    ]
);

// Adult Residents / Members
export const residents = sqliteTable(
    'residents',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        householdId: integer('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),

        firstName: text('first_name').notNull(),
        lastName: text('last_name').notNull(),
        isPrimaryContact: integer('is_primary_contact', { mode: 'boolean' }).default(false),

        email: text('email'),
        phoneMobile: text('phone_mobile'),
        phoneHome: text('phone_home'),
        phoneWork: text('phone_work'),
        occupation: text('occupation'),

        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_residents_household').on(table.householdId),
        index('idx_residents_email').on(table.email),
        index('idx_residents_name').on(table.lastName, table.firstName),
    ]
);

// Children / Dependents & Services
export const children = sqliteTable(
    'children',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        householdId: integer('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),

        name: text('name').notNull(),
        birthYear: integer('birth_year'),
        school: text('school'),
        occupation: text('occupation'),
        residenceLocation: text('residence_location'),

        // Neighborhood Service Flags
        babysitting: integer('babysitting', { mode: 'boolean' }).default(false),
        petSitting: integer('pet_sitting', { mode: 'boolean' }).default(false),
        specialSkills: text('special_skills'),
    },
    (table) => [
        index('idx_children_household').on(table.householdId),
    ]
);

// ==========================================
// 2. AUTHENTICATION & USERS
// ==========================================

export const users = sqliteTable(
    'users',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        email: text('email').notNull(),

        // Directory Association
        residentId: integer('resident_id').references(() => residents.id, { onDelete: 'set null' }),
        linkStatus: text('link_status', { enum: ['auto_matched', 'admin_linked', 'unlinked'] })
            .notNull()
            .default('unlinked'),

        // Role Flags
        isOwner: integer('is_owner', { mode: 'boolean' }).default(false),
        isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
        isPageEditor: integer('is_page_editor', { mode: 'boolean' }).default(false),
        isDirectoryEditor: integer('is_directory_editor', { mode: 'boolean' }).default(false),

        // Account Security
        isSuspended: integer('is_suspended', { mode: 'boolean' }).default(false),
        lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),

        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_users_email_unique').on(table.email),
        index('idx_users_resident').on(table.residentId),
    ]
);

export const userLoginEmails = sqliteTable(
    'user_login_emails',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        email: text('email').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_user_login_emails_email_unique').on(table.email),
        index('idx_user_login_emails_user').on(table.userId),
    ]
);

export const householdFavorites = sqliteTable(
    'household_favorites',
    {
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        householdId: integer('household_id')
            .notNull()
            .references(() => households.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.householdId] }),
        index('idx_household_favorites_household').on(table.householdId),
    ]
);

// Magic Link Auth Tokens (15-min TTL)
export const magicTokens = sqliteTable(
    'magic_tokens',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        email: text('email').notNull(),
        token: text('token').notNull(),
        // 6-digit manual-entry code, tied to the same row/TTL so either credential invalidates both.
        codeHash: text('code_hash'),
        codeAttempts: integer('code_attempts').notNull().default(0),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_magic_tokens_token_unique').on(table.token),
        index('idx_magic_tokens_email').on(table.email),
    ]
);

// Long-Term User Sessions (400-Day TTL)
export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey(), // Session UUID
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),

        // Per-device detail so an admin (or the user) can identify and revoke a single session
        userAgent: text('user_agent'),
        ipAddress: text('ip_address'),
        lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),

        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_sessions_user').on(table.userId),
    ]
);

export const accessRequests = sqliteTable(
    'access_requests',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        email: text('email').notNull(),
        fullName: text('full_name').notNull(),
        streetAddress: text('street_address').notNull(),
        status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
        reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
        notes: text('notes'),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_access_requests_email').on(table.email),
        index('idx_access_requests_status').on(table.status),
    ]
);

export const magicLinkRateLimits = sqliteTable(
    'magic_link_rate_limits',
    {
        email: text('email').primaryKey(),
        minuteStartedAt: integer('minute_started_at', { mode: 'timestamp' }).notNull(),
        dailyStartedAt: integer('daily_started_at', { mode: 'timestamp' }).notNull(),
        dailyCount: integer('daily_count').notNull().default(0),
    }
);

// Reusable audit trail for access control, access requests, page/directory edits, etc.
export const activityLogs = sqliteTable(
    'activity_logs',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
        targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'set null' }),
        category: text('category', { enum: ['access_control', 'access_request', 'page', 'directory', 'user_management'] }).notNull(),
        action: text('action').notNull(),
        details: text('details'),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_activity_logs_category').on(table.category, table.createdAt),
        index('idx_activity_logs_target').on(table.targetUserId),
    ]
);

// ==========================================
// 3. CONTENT & NAVIGATION (Pages, Menus, Messages)
// ==========================================

export const pages = sqliteTable(
    'pages',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        slug: text('slug').notNull(),
        title: text('title').notNull(),
        bodyMd: text('body_md').notNull(),

        isPublic: integer('is_public', { mode: 'boolean' }).default(false),
        isDraft: integer('is_draft', { mode: 'boolean' }).default(true),
        isHomepageCard: integer('is_homepage_card', { mode: 'boolean' }).default(false),

        authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),

        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_pages_slug_unique').on(table.slug),
    ]
);

// Self-referencing Nested Menu Hierarchy. A row is a navigation node; the same
// page may be referenced by several rows so it can appear in multiple menus.
export const menus = sqliteTable(
    'menus',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        parentId: integer('parent_id').references((): any => menus.id, { onDelete: 'cascade' }),

        kind: text('kind', { enum: ['menu', 'page', 'link'] }).notNull().default('menu'),
        slug: text('slug'),
        title: text('title').notNull(),
        description: text('description'),
        iconName: text('icon_name'),

        pageId: integer('page_id').references(() => pages.id, { onDelete: 'set null' }),
        targetUrl: text('target_url'),

        displayOrder: integer('display_order').default(0),
        isPublic: integer('is_public', { mode: 'boolean' }).default(false),
        isDraft: integer('is_draft', { mode: 'boolean' }).default(true),

        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_menus_parent').on(table.parentId, table.displayOrder),
        uniqueIndex('idx_menus_slug_unique').on(table.slug),
    ]
);

export const infoMessages = sqliteTable('info_messages', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    textMd: text('text_md').notNull(),
    priority: integer('priority', { mode: 'boolean' }).default(false),

    startDate: integer('start_date', { mode: 'timestamp' }),
    endDate: integer('end_date', { mode: 'timestamp' }),

    bgColor: text('bg_color').default('#1a73e8'),
    iconName: text('icon_name'),
    r2ImageKey: text('r2_image_key'),

    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ==========================================
// 4. DOCUMENTS & ATTACHMENTS (R2 Storage)
// ==========================================

export const documents = sqliteTable(
    'documents',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        pageId: integer('page_id').references(() => pages.id, { onDelete: 'cascade' }),
        r2Key: text('r2_key').notNull(),
        filename: text('filename').notNull(),
        mimeType: text('mime_type').notNull(),
        sizeBytes: integer('size_bytes').notNull(),

        uploadedByUserId: integer('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_documents_r2_key_unique').on(table.r2Key),
        index('idx_documents_page').on(table.pageId),
    ]
);