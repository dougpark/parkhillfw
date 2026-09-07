import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/login' },
        {
            path: '/login',
            name: 'login',
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
            component: () => import('../views/AccessRequestView.vue'),
        },
        {
            path: '/admin/access-requests',
            name: 'admin-access-requests',
            component: () => import('../views/AdminAccessRequestsView.vue'),
        },
        {
            path: '/admin',
            name: 'admin',
            meta: { requiresAdmin: true },
            component: () => import('../views/AdminView.vue'),
        },
        {
            path: '/directory',
            name: 'directory',
            component: () => import('../views/DirectoryView.vue'),
        },
        {
            path: '/directory/edit',
            name: 'directory-edit',
            meta: { requiresDirectory: true },
            component: () => import('../views/DirectoryEditView.vue'),
        },
    ],
});

router.beforeEach(async (to) => {
    if (!to.meta.requiresAdmin && !to.meta.requiresDirectory) return true;

    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) return '/login';
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
