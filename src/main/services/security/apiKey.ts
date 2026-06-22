import { safeStorage } from 'electron';
import { envApiKey } from '../../env';
import { SETTINGS_KEYS, settingsRepo } from '../../db/repositories/settings.repo';
import { log } from './logger';

/**
 * The OpenAI key only ever lives here, in the main process. `getDecrypted()`
 * MUST NEVER be returned over IPC. The renderer may only learn `isPresent()`.
 * See docs/07-API-KEY-SECURITY.md.
 */
export const apiKeyStore = {
  /** Boolean only — safe to expose to the renderer. */
  isPresent(): boolean {
    if (envApiKey()) return true;
    return settingsRepo.get(SETTINGS_KEYS.apiKeyPresent) === '1';
  },

  /** Encrypt with OS-backed safeStorage and persist. */
  set(plaintext: string): void {
    const key = plaintext.trim();
    if (!key) throw new Error('Empty API key');
    if (!safeStorage.isEncryptionAvailable()) {
      // Do not silently store plaintext. A keytar fallback can be added here.
      throw new Error(
        'Secure storage is unavailable on this OS. Cannot store the API key safely.',
      );
    }
    const cipher = safeStorage.encryptString(key);
    settingsRepo.set(SETTINGS_KEYS.apiKeyEnc, cipher.toString('base64'));
    settingsRepo.set(SETTINGS_KEYS.apiKeyPresent, '1');
    log.info('api key stored (encrypted)');
  },

  clear(): void {
    settingsRepo.delete(SETTINGS_KEYS.apiKeyEnc);
    settingsRepo.set(SETTINGS_KEYS.apiKeyPresent, '0');
    log.info('api key cleared');
  },

  /** MAIN-PROCESS ONLY. Resolution order: dev env var, then stored key. */
  getDecrypted(): string | null {
    const fromEnv = envApiKey();
    if (fromEnv) return fromEnv;

    const enc = settingsRepo.get(SETTINGS_KEYS.apiKeyEnc);
    if (!enc) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch (e) {
      log.error('failed to decrypt stored api key', e);
      return null;
    }
  },
};
