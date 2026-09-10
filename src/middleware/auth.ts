import type { MiddlewareHandler } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { findUserBySession, sessionCookie, SESSION_COOKIE } from '../lib/auth';

function getCookie(request: Request, name: string): string | null {
    const cookies = request.headers.get('Cookie')?.split(';') ?? [];
    const value = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
    return value ? decodeURIComponent(value.trim().slice(name.length + 1)) : null;
}

export type PermissionFlags = {
    isOwner?: boolean | null;
    isAdmin?: boolean | null;
    isPageEditor?: boolean | null;
    isDirectoryEditor?: boolean | null;
};

// The authenticated principal stashed on the request context by requireAuth().
// Index signature keeps ad-hoc route-level `as {...}` narrowings type-checking.
export type AppUser = PermissionFlags & Record<string, unknown> & {
    id: number;
    email?: string;
    residentId?: number | null;
    householdId?: number;
};

export type AppBindings = {
    DB: D1Database;
    BUCKET: R2Bucket;
    ASSETS: Fetcher;
    DEV_BYPASS_AUTH?: string;
    DEV_BYPASS_ROLE?: string;
    JWT_SECRET?: string;
    EMAIL: {
        send(message: Record<string, unknown>): Promise<unknown>;
    };
};

export type AppEnv = { Bindings: AppBindings; Variables: { user?: AppUser } };

export const isOwner = (user?: PermissionFlags | null) => Boolean(user?.isOwner);
export const isAdmin = (user?: PermissionFlags | null) => Boolean(user?.isAdmin || user?.isOwner);
export const isPageEditor = (user?: PermissionFlags | null) => Boolean(user?.isPageEditor) || isAdmin(user);
export const isDirectoryEditor = (user?: PermissionFlags | null) => Boolean(user?.isDirectoryEditor) || isAdmin(user);
export const hasAnyAdminRole = (user?: PermissionFlags | null) =>
    isAdmin(user) || Boolean(user?.isPageEditor) || Boolean(user?.isDirectoryEditor);

// Local-only role simulation so each permission level can be exercised without real logins.
export function devBypassUser(role: string | undefined): AppUser {
    const flags = {
        owner: { isOwner: true, isAdmin: true },
        admin: { isAdmin: true },
        directoryEditor: { isDirectoryEditor: true },
        pageEditor: { isPageEditor: true },
        user: {},
    }[role ?? 'admin'] ?? { isAdmin: true };
    return { id: 1, email: 'parkdn@gmail.com', householdId: 1, residentId: 1, ...flags };
}

export const requireAuth = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (c.env.DEV_BYPASS_AUTH === 'true') {
        c.set('user', devBypassUser(c.env.DEV_BYPASS_ROLE));
        return next();
    }

    const rawSession = getCookie(c.req.raw, SESSION_COOKIE);
    if (!rawSession) return c.json({ error: 'Unauthorized' }, 401);

    const authResult = await findUserBySession(drizzle(c.env.DB), rawSession);
    if (!authResult) return c.json({ error: 'Unauthorized' }, 401);

    c.set('user', authResult.user);

    await next();

    if (authResult.renewedExpiresAt) {
        const secure = new URL(c.req.url).protocol === 'https:';
        c.header('Set-Cookie', sessionCookie(rawSession, authResult.renewedExpiresAt, secure), { append: true });
    }
};

export const requireAdmin = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (!isAdmin(c.get('user') as PermissionFlags | undefined)) return c.json({ error: 'Forbidden' }, 403);
    return next();
};

export const requireOwner = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (!isOwner(c.get('user') as PermissionFlags | undefined)) return c.json({ error: 'Forbidden' }, 403);
    return next();
};

export const requireAnyAdminRole = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (!hasAnyAdminRole(c.get('user') as PermissionFlags | undefined)) return c.json({ error: 'Forbidden' }, 403);
    return next();
};

export const requirePageEditor = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (!isPageEditor(c.get('user') as PermissionFlags | undefined)) return c.json({ error: 'Forbidden' }, 403);
    return next();
};

export const requireDirectoryEditor = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    if (!isDirectoryEditor(c.get('user') as PermissionFlags | undefined)) return c.json({ error: 'Forbidden' }, 403);
    return next();
};

export const requireDirectory = (): MiddlewareHandler<AppEnv> => async (c, next) => {
    const user = c.get('user') as { residentId?: number | null; householdId?: number } | undefined;
    if (!user?.residentId && !user?.householdId) return c.json({ error: 'Directory access is pending approval.' }, 403);
    return next();
};

export { getCookie };
