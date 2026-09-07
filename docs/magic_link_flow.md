# Registration/Login Flow with Magic Link and Automatic Directory Resolution


## Automatic Resolution During Magic Link Authentication
## When the user completes the Magic Link authentication flow:

```ts
app.get('/api/auth/verify', async (c) => {
  const email = tokenEmail.toLowerCase().trim();

  // 1. Fetch or create user record
  let user = await db.select().from(users).where(eq(users.email, email)).get();

  if (!user) {
    // Check for an existing matching email in the residents table
    const matchedResident = await db
      .select()
      .from(residents)
      .where(eq(residents.email, email))
      .get();

    const [newUser] = await db.insert(users).values({
      email: email,
      residentId: matchedResident ? matchedResident.id : null,
      linkStatus: matchedResident ? 'auto_matched' : 'unlinked',
    }).returning();

    user = newUser;
  }

  // Issue 400-day session cookie...
});
```

## Manual Admin Resolution Endpoint
## When an unlinked user (linkStatus: 'unlinked') needs manual association, an admin selects the proper resident profile from an admin search UI:
```ts
app.patch('/api/admin/users/:userId/link-resident', async (c) => {
  const userId = c.req.param('userId');
  const { residentId } = await c.req.json(); // Selected by admin from UI dropdown

  await db
    .update(users)
    .set({
      residentId: residentId,
      linkStatus: 'admin_linked',
    })
    .where(eq(users.id, Number(userId)));

  return c.json({ success: true });
});
```

# Advantages of This Pattern
•	Decouples Authentication from Directory: Users can log in immediately via Magic Link even if their email doesn't exist in the directory yet.
•	Allows Email Overrides: A resident can log in with a preferred personal email (e.g., user@gmail.com) while their published directory listing shows a legacy household email (e.g., user@sbcglobal.net).
•	Clean Auditability: The linkStatus enum (auto_matched, admin_linked, unlinked) makes it easy to build an Admin Dashboard queue showing all unlinked users who need manual mapping.
