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
            path: '/directory',
            name: 'directory',
            component: () => import('../views/DirectoryView.vue'),
        },
    ],
});

export default router;
