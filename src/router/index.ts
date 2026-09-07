import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        { path: '/', redirect: '/directory' },
        {
            path: '/directory',
            name: 'directory',
            component: () => import('../views/DirectoryView.vue'),
        },
    ],
});

export default router;
