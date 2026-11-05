import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Bouton « Installer l'app » (Chrome/Edge/Android) et badge hors ligne. */
export function PwaStatus() {
  const [promptEvt, setPromptEvt] = useState<InstallPromptEvent | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPromptEvt(null);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const install = async () => {
    if (!promptEvt) return;
    await promptEvt.prompt();
    await promptEvt.userChoice.catch(() => null);
    setPromptEvt(null);
  };

  return (
    <>
      {!online && (
        <span className="offline-badge" title="L'application fonctionne sans internet ; vos posters restent enregistrés sur cet appareil.">
          Hors ligne
        </span>
      )}
      {promptEvt && (
        <button className="install-btn" onClick={install} title="Installer Poster Pro sur cet appareil">
          ⤓ Installer l'app
        </button>
      )}
    </>
  );
}
