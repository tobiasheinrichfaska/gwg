import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { VaultGate, createVault } from 'local-vault';
import { SETTINGS_SLOT, VAULT_SLOT, createVaultStore } from './io/index.ts';
import { App } from './ui/App.tsx';
import { VAULT_TEXTS } from './ui/app/texts.ts';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

// Device mode (the only one in local-vault 0.1.0): encrypted on this device, optional app lock.
// One slot holds the whole data set, one the list settings (not in the backup file). The public
// sanctions list is not in the vault: it lives in IndexedDB (`src/io/list-store.ts`).
const vault = createVault({
  prefix: 'gwg',
  slots: [VAULT_SLOT, SETTINGS_SLOT],
  texts: VAULT_TEXTS,
});
const store = createVaultStore(vault);

createRoot(root).render(
  <StrictMode>
    <VaultGate vault={vault} texts={VAULT_TEXTS}>
      <App store={store} vault={vault} />
    </VaultGate>
  </StrictMode>,
);
