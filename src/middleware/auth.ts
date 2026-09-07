import type { MiddlewareHandler } from 'hono';

// Mock user representing a logged-in admin resident during dev
const DEV_MOCK_USER = {
    id: 1,
    email: 'parkdn@gmail.com',
    role: 'admin',
    householdId: 1,
};

export const requireAuth = (): MiddlewareHandler => {
    return async (c, next) => {
        // 1. Check for Development Bypass Flag
        const isDevBypass = c.env.DEV_BYPASS_AUTH === 'true';

        if (isDevBypass) {
            // Inject mock user and skip token validation
            c.set('user', DEV_MOCK_USER);
            return next();
        }

        // 2. Production Auth Logic (Session Cookie or Bearer Token)
        const authHeader = c.req.header('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return c.json({ error: 'Unauthorized: Missing authentication token' }, 401);
        }

        try {
            // Verify JWT/Session Token here
            const user = await verifyToken(token, c.env.JWT_SECRET);
            c.set('user', user);
            await next();
        } catch {
            return c.json({ error: 'Unauthorized: Invalid token' }, 401);
        }
    };
};