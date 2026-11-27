import { LockSettings, type Vault } from 'local-vault';
import type { AppStore, ListStore, SettingsStore } from '../io/index.ts';
import { AppProvider } from './app/AppProvider.tsx';
import { Navigation } from './app/Navigation.tsx';
import { VAULT_TEXTS } from './app/texts.ts';
import './app/app.css';

interface Props {
  store: AppStore;
  vault?: Vault;
  listStore?: ListStore;
  settingsStore?: SettingsStore;
}

export function App({ store, vault, listStore, settingsStore }: Props) {
  return (
    <AppProvider
      store={store}
      listStore={listStore}
      settingsStore={settingsStore}
      lockSettings={vault ? <LockSettings vault={vault} texts={VAULT_TEXTS} /> : null}
    >
      <Navigation />
    </AppProvider>
  );
}
