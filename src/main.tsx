import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import './i18n';
import { ensureSeedData } from './seed';
import { useSyncStore } from './store/sync';
import Layout from './components/Layout';
import Home from './routes/Home';
import Student from './routes/Student';
import Dashboard from './routes/Dashboard';
import Settings from './routes/Settings';

const root = document.getElementById('root')!;

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: '/', element: <Home /> },
        { path: '/student/:id', element: <Student /> },
        { path: '/dashboard', element: <Dashboard /> },
        { path: '/settings', element: <Settings /> },
      ],
    },
  ],
  {
    future: { v7_startTransition: true, v7_relativeSplatPath: true },
  }
);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

// Register a simple service worker for PWA capabilities
// Register service worker only in production to avoid dev cache conflicts
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

// Seed demo data (runs once when tables are empty)
ensureSeedData().catch((e) => console.warn('Seeding failed:', e));

// Track online/offline
window.addEventListener('online', () => useSyncStore.getState().setOnline(true));
window.addEventListener('offline', () => useSyncStore.getState().setOnline(false));
