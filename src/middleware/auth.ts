import type { MiddlewareHandler } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { findUserBySession, SESSION_COOKIE } from '../lib/auth';

function getCookie(request: Request, name: string): string | null {
    const cookies = request.headers.get('Cookie')?.split(';') ?? [];
    const value = cookies.find((cookie) => cookie.trim().startsWith(`${name}=`));
    return value ? decodeURIComponent(value.trim().slice(name.length + 1)) : null;
}

export const requireAuth = (): MiddlewareHandler => async (c, next) => {
    if (c.env.DEV_BYPASS_AUTH === 'true') {
        c.set('user', {
            id: 1,
            email: 'parkdn@gmail.com',
            role: 'admin',
            householdId: 1,
            isAdmin: true,
        });
        return next();
    }

    const rawSession = getCookie(c.req.raw, SESSION_COOKIE);
    if (!rawSession) return c.json({ error: 'Unauthorized' }, 401);

    const user = await findUserBySession(drizzle(c.env.DB), rawSession);
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    c.set('user', user);
    return next();
};

export const requireAdmin = (): MiddlewareHandler => async (c, next) => {
    const user = c.get('user') as { isAdmin?: boolean; isOwner?: boolean } | undefined;
    if (!user?.isAdmin && !user?.isOwner) return c.json({ error: 'Forbidden' }, 403);
    return next();
};

export const requireDirectory = (): MiddlewareHandler => async (c, next) => {
    const user = c.get('user') as { residentId?: number | null; householdId?: number } | undefined;
    if (!user?.residentId && !user?.householdId) return c.json({ error: 'Directory access is pending approval.' }, 403);
    return next();
};

export { getCookie };
