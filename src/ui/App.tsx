import { LockSettings, type Vault } from 'local-vault';
import type { AppStore } from '../io/index.ts';
import { AppProvider } from './app/AppProvider.tsx';
import { Navigation } from './app/Navigation.tsx';
import { VAULT_TEXTS } from './app/texts.ts';
import './app/app.css';

export function App({ store, vault }: { store: AppStore; vault?: Vault }) {
  return (
    <AppProvider
      store={store}
      lockSettings={vault ? <LockSettings vault={vault} texts={VAULT_TEXTS} /> : null}
    >
      <Navigation />
    </AppProvider>
  );
}
