import { createRoot } from 'react-dom/client';
import { App } from './App';
import { LocalStorageAdapter } from './lib/storage';
import { Store, setStore } from './lib/store';
import './styles/index.css';

const store = new Store(new LocalStorageAdapter());
setStore(store);
// Flush any pending write when the tab is hidden or closed.
addEventListener('pagehide', () => void store.flush());
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void store.flush());

createRoot(document.getElementById('root')!).render(<App />);
void store.init();
