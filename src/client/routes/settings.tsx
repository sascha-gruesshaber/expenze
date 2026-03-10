import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { authClient, useSession } from '../lib/auth';
import { Fingerprint, Plus, Trash2, Loader2 } from 'lucide-react';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

interface PasskeyEntry {
  id: string;
  name: string | null;
  createdAt: string;
  deviceType: string;
}

function SettingsPage() {
  const { data: session } = useSession();
  const [passkeys, setPasskeys] = useState<PasskeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadPasskeys = useCallback(async () => {
    try {
      const { data } = await authClient.passkey.listUserPasskeys();
      setPasskeys((data as PasskeyEntry[]) || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  async function handleAddPasskey() {
    setError('');
    setSuccess('');
    setAdding(true);
    try {
      const { error: addError } = await authClient.passkey.addPasskey({
        authenticatorAttachment: 'platform',
      });
      if (addError) {
        setError(addError.message || 'Passkey konnte nicht hinzugefügt werden');
      } else {
        setSuccess('Passkey erfolgreich hinzugefügt');
        await loadPasskeys();
      }
    } catch {
      setError('Passkey konnte nicht hinzugefügt werden');
    } finally {
      setAdding(false);
    }
  }

  async function handleDeletePasskey(id: string) {
    setError('');
    setSuccess('');
    setDeleting(id);
    try {
      await authClient.passkey.deletePasskey({ id });
      setSuccess('Passkey gelöscht');
      await loadPasskeys();
    } catch {
      setError('Passkey konnte nicht gelöscht werden');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl">
        <h1 className="text-xl font-heading font-bold text-text mb-1">Einstellungen</h1>
        <p className="text-[13px] text-text-3 mb-8">Konto und Sicherheit</p>

        {/* Account info */}
        <section className="mb-8">
          <h2 className="text-[13px] font-semibold text-text-2 uppercase tracking-wider mb-3">Konto</h2>
          <div className="bg-surface border border-border rounded-xl p-5">
            <div className="text-[13px] text-text-2">
              Angemeldet als <span className="text-text font-medium">{session?.user.email}</span>
            </div>
          </div>
        </section>

        {/* Passkeys */}
        <section>
          <h2 className="text-[13px] font-semibold text-text-2 uppercase tracking-wider mb-3">Passkeys</h2>
          <div className="bg-surface border border-border rounded-xl p-5">
            <p className="text-[13px] text-text-2 mb-4">
              Passkeys ermöglichen eine sichere Anmeldung per Fingerabdruck, Gesichtserkennung oder Geräte-PIN.
            </p>

            {error && <p className="text-[12px] text-red-400 mb-3">{error}</p>}
            {success && <p className="text-[12px] text-green-400 mb-3">{success}</p>}

            {loading ? (
              <div className="flex items-center gap-2 text-[13px] text-text-3 py-4">
                <Loader2 size={14} className="animate-spin" /> Lade Passkeys...
              </div>
            ) : (
              <>
                {passkeys.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {passkeys.map((pk) => (
                      <div
                        key={pk.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface-2 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Fingerprint size={16} className="text-accent flex-shrink-0" />
                          <div>
                            <div className="text-[13px] text-text font-medium">
                              {pk.name || 'Passkey'}
                            </div>
                            <div className="text-[11px] text-text-3">
                              {pk.deviceType === 'singleDevice' ? 'Einzelgerät' : 'Multi-Gerät'} &middot; Erstellt {new Date(pk.createdAt).toLocaleDateString('de-DE')}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeletePasskey(pk.id)}
                          disabled={deleting === pk.id}
                          className="text-text-3 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Passkey löschen"
                        >
                          {deleting === pk.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-text-3 mb-4">
                    Noch keine Passkeys registriert.
                  </p>
                )}

                <button
                  onClick={handleAddPasskey}
                  disabled={adding}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-[13px] font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  {adding ? 'Warte auf Gerät...' : 'Passkey hinzufügen'}
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
