import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LocalStorageAdapter } from './lib/storage';
import { supabaseStorage } from './lib/supabaseStorage';
import { Store, setStore } from './lib/store';
import './styles/index.css';

const store = new Store(supabaseStorage ?? new LocalStorageAdapter());
setStore(store);
// Flush any pending write when the tab is hidden or closed.
addEventListener('pagehide', () => void store.flush());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void store.flush());

supabaseStorage?.onAuthStateChange((_event, _email, userChanged) => {
	if (userChanged) setTimeout(() => void store.reload(), 0);
});

createRoot(document.getElementById('root')!).render(<App />);
void store.init();
