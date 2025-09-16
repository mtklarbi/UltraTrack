import { Link, NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SearchBox from './SearchBox';
import { useEffect, useState } from 'react';
import { useSyncStore } from '../store/sync';

export default function Layout() {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const online = useSyncStore((s) => s.online);
  const syncingCount = useSyncStore((s) => s.syncingCount);
  const statusLabel = !online ? 'Offline' : syncingCount > 0 ? 'Syncing…' : 'All saved';

  type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onBIP as any);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP as any);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return (
    <div className="app-container">
      <header className="app-header sticky top-0 z-40 bg-white/80 border-b border-gray-200">
        <div className="mx-auto max-w-6xl px-4 h-[var(--header-height)] flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold text-brand hover:text-brand-dark">{t('app.title')}</Link>
          <nav className="hidden md:flex items-center gap-4 text-sm">
            <NavLink to="/" className={({isActive})=>`px-2 py-1 rounded hover:bg-gray-100 ${isActive? 'text-brand font-medium':'text-gray-700'}`}>{t('nav.home')}</NavLink>
            <NavLink to="/dashboard" className={({isActive})=>`px-2 py-1 rounded hover:bg-gray-100 ${isActive? 'text-brand font-medium':'text-gray-700'}`}>{t('nav.dashboard')}</NavLink>
            <NavLink to="/settings" className={({isActive})=>`px-2 py-1 rounded hover:bg-gray-100 ${isActive? 'text-brand font-medium':'text-gray-700'}`}>{t('nav.settings')}</NavLink>
          </nav>
          <div className="flex-1" />
          <div className="hidden sm:block">
            <SearchBox />
          </div>
          <div className={`text-xs px-2 py-1 rounded-full border ${!online? 'bg-yellow-50 border-yellow-300 text-yellow-800': (syncingCount>0? 'bg-blue-50 border-blue-300 text-blue-800': 'bg-emerald-50 border-emerald-300 text-emerald-800')}`}>{statusLabel}</div>
          <button
            className="ml-2 rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
            onClick={async ()=>{ const { syncNow } = await import('../syncClient'); syncNow().catch(()=>{}); }}
          >Sync</button>
          {deferredPrompt && !installed && (
            <button
              className="ml-2 rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
              onClick={async ()=>{ await deferredPrompt.prompt(); const res = await deferredPrompt.userChoice; setDeferredPrompt(null); }}
            >Install</button>
          )}
          <select
            aria-label="Language"
            value={i18n.language}
            onChange={(e)=> i18n.changeLanguage(e.target.value)}
            className="ml-2 rounded border px-2 py-1 text-sm"
          >
            <option value="fr">FR</option>
            <option value="ar">AR</option>
          </select>
        </div>
      </header>
      <main className="mx-auto max-w-6xl w-full px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
