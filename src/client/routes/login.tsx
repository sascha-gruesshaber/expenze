import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { authClient, useSession } from '../lib/auth';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { data: session } = useSession();
  const navigate = useNavigate();

  // Redirect if already authenticated
  if (session) {
    navigate({ to: '/dashboard' });
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: authError } = await authClient.signIn.magicLink({
        email,
        callbackURL: '/dashboard',
      });
      if (authError) {
        setError(authError.message || 'Fehler beim Senden des Links');
      } else {
        setSent(true);
      }
    } catch {
      setError('Verbindung zum Server fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <h1 className="font-heading font-extrabold text-3xl tracking-tight text-text">
            expen<span className="text-accent">z</span>e
          </h1>
          <p className="text-sm text-text-3 mt-1">Deine Finanzen im Blick</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-3">&#9993;</div>
              <h2 className="text-base font-semibold text-text mb-2">Link gesendet!</h2>
              <p className="text-[13px] text-text-2 leading-relaxed">
                Prüfe deine E-Mail-Inbox für <span className="font-medium text-text">{email}</span> und klicke auf den Login-Link.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(''); }}
                className="mt-4 text-[13px] text-accent hover:underline"
              >
                Andere E-Mail verwenden
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-text mb-1">Anmelden</h2>
              <p className="text-[13px] text-text-3 mb-5">
                Gib deine E-Mail ein, um einen Login-Link zu erhalten.
              </p>
              <form onSubmit={handleSubmit}>
                <label className="block text-[12px] font-medium text-text-2 mb-1.5">
                  E-Mail-Adresse
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@beispiel.de"
                  className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-[13px] text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  autoFocus
                />
                {error && (
                  <p className="mt-2 text-[12px] text-red-400">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full mt-4 px-4 py-2.5 bg-accent text-white text-[13px] font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Wird gesendet...' : 'Magic Link senden'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
