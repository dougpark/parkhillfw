import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/home' },
        {
            path: '/home',
            name: 'home',
            meta: { requiresDirectory: true },
            component: () => import('../views/HomeView.vue'),
        },
        {
            path: '/login',
            name: 'login',
            meta: { guestOnly: true },
            component: () => import('../views/LoginView.vue'),
        },
        {
            path: '/auth/verify',
            name: 'verify',
            component: () => import('../views/VerifyView.vue'),
        },
        {
            path: '/access-request',
            name: 'access-request',
            meta: { requiresAuth: true },
            component: () => import('../views/AccessRequestView.vue'),
        },
        {
            path: '/admin/access-requests',
            name: 'admin-access-requests',
            meta: { requiresAdmin: true },
            component: () => import('../views/AdminAccessRequestsView.vue'),
        },
        {
            path: '/admin',
            name: 'admin',
            meta: { requiresAdmin: true },
            component: () => import('../views/AdminView.vue'),
        },
        {
            path: '/admin/users',
            name: 'admin-users',
            meta: { requiresAdmin: true },
            component: () => import('../views/AdminUsersView.vue'),
        },
        {
            path: '/directory',
            name: 'directory',
            meta: { requiresDirectory: true },
            component: () => import('../views/DirectoryView.vue'),
        },
        {
            path: '/directory/edit',
            name: 'directory-edit',
            meta: { requiresDirectory: true },
            component: () => import('../views/DirectoryEditView.vue'),
        },
        {
            path: '/pages/:slug',
            name: 'page',
            meta: { requiresAuth: true },
            component: () => import('../views/PageView.vue'),
        },
    ],
});

router.beforeEach(async (to) => {
    if (!to.meta.requiresAdmin && !to.meta.requiresDirectory && !to.meta.requiresAuth && !to.meta.guestOnly) return true;

    try {
        const response = await fetch('/api/auth/me');
        if (to.meta.guestOnly) {
            if (to.query.switch === '1' || !response.ok) return true;
            const data = await response.json() as { matched?: boolean };
            return data.matched ? '/directory' : '/access-request';
        }
        if (!response.ok) return '/login';
        if (to.meta.requiresAuth) return true;
        const data = await response.json() as {
            matched?: boolean;
            user?: {
                isOwner?: boolean;
                isAdmin?: boolean;
                isPageEditor?: boolean;
                isDirectoryEditor?: boolean;
            };
        };
        if (to.meta.requiresDirectory && !data.matched) return '/access-request';
        if (to.meta.requiresDirectory) return true;
        const user = data.user;
        const authorized = Boolean(user?.isOwner || user?.isAdmin || user?.isPageEditor || user?.isDirectoryEditor);
        return authorized ? true : '/directory';
    } catch {
        return '/login';
    }
});

export default router;
