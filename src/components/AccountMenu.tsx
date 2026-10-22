import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { getStore } from '../lib/store';
import { supabaseStorage } from '../lib/supabaseStorage';
import { Link } from './Link';
import { toast } from '../lib/ui';

type Mode = 'signin' | 'signup' | 'link';

const friendlyError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : '';
  if (/invalid login credentials/i.test(message)) return 'That email and password don’t match. Check them, or create an account.';
  if (/provider is not enabled|unsupported provider/i.test(message)) return 'Google sign-in isn’t switched on yet. Use email for now.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a few minutes and try again.';
  return message || fallback;
};

export function AccountMenu() {
  const store = getStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('signin');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  useEffect(() => {
    if (!supabaseStorage) return;
    let active = true;
    // A failed or expired email link comes back as #error_description=… on the page URL.
    const hash = new URLSearchParams(window.location.hash.replace(/^#\/?/, ''));
    const linkError = hash.get('error_description');
    if (linkError) {
      toast(linkError.replace(/\+/g, ' ') + ' Please try signing in again.', 'error');
      history.replaceState(null, '', window.location.pathname + window.location.search + '#/');
    }
    const unsubscribe = supabaseStorage.onAuthStateChange((event, currentEmail, userChanged) => {
      setEmail(currentEmail);
      // Only announce real changes; Supabase also emits SIGNED_IN on every tab refocus.
      if (!userChanged) return;
      if (event === 'SIGNED_IN') {
        setLinkSent(false);
        setPassword('');
        setFeedback(null);
        setOpen(false);
        toast('You’re signed in. Your library is syncing to your account.');
      }
      if (event === 'SIGNED_OUT') {
        setFeedback(null);
        toast('You’re signed out. This browser is using its local library.');
      }
    });
    void supabaseStorage.getCurrentEmail().then((currentEmail) => {
      if (active) setEmail(currentEmail);
    }).catch((error: unknown) => {
      if (active) setFeedback({ text: friendlyError(error, 'Could not check your sign-in status.'), error: true });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = async (task: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setFeedback(null);
    try {
      await store.flush();
      await task();
    } catch (error) {
      setFeedback({ text: friendlyError(error, fallback), error: true });
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabaseStorage) return;
    const target = emailInput.trim();
    if (mode === 'link') {
      return run(async () => {
        await supabaseStorage!.sendSignInLink(target);
        setLinkSent(true);
        setFeedback({ text: `We emailed a sign-in link to ${target}. Open it on this device.` });
      }, 'Could not send a sign-in link.');
    }
    if (mode === 'signup') {
      if (password.length < 8) {
        setFeedback({ text: 'Choose a password with at least 8 characters.', error: true });
        return;
      }
      return run(async () => {
        const signedIn = await supabaseStorage!.signUpWithPassword(target, password);
        if (!signedIn) setFeedback({ text: `Almost there. Confirm your email using the message we sent to ${target}, then sign in.` });
      }, 'Could not create your account.');
    }
    return run(() => supabaseStorage!.signInWithPassword(target, password), 'Could not sign in.');
  };

  const google = () => run(() => supabaseStorage!.signInWithGoogle(), 'Could not start Google sign-in.');
  const signOut = () => run(() => supabaseStorage!.signOut(), 'Could not sign out.');
  const switchMode = (next: Mode) => {
    setMode(next);
    setFeedback(null);
    setLinkSent(false);
  };

  const heading = email ? 'Your account' : mode === 'signup' ? 'Create account' : 'Sign in';

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className="icon-btn"
        type="button"
        aria-label={email ? `Account: ${email}` : 'Sign in'}
        aria-expanded={open}
        aria-controls="account-panel"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        data-testid="account-menu-trigger"
      >
        <Icon name="user" />
      </button>
      {open && (
        <section className="account-panel" id="account-panel" aria-label="Account">
          <div className="account-panel-head">
            <h2>{heading}</h2>
            <button className="icon-btn" type="button" aria-label="Close account menu" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button>
          </div>
          {!supabaseStorage ? (
            <p className="muted">Cloud sign-in is not configured. Your library is saved in this browser.</p>
          ) : email ? (
            <>
              <p className="account-email">{email}</p>
              <p className="muted">Your library is syncing to your cloud account.</p>
              <button className="btn" type="button" onClick={() => void signOut()} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
            </>
          ) : (
            <>
              <p className="muted">Sign in to keep your library safe and use it on every device.</p>
              <button className="btn account-google" type="button" onClick={() => void google()} disabled={busy}>
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" /><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.500 42.600 14.600 48 24 48z" /></svg>
                Continue with Google
              </button>
              <div className="account-or"><span>or use email</span></div>
              <form onSubmit={(event) => void submit(event)}>
                <label className="field">
                  <span className="field-label">Email address</span>
                  <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={emailInput} onChange={(event) => setEmailInput(event.target.value)} />
                </label>
                {mode !== 'link' && (
                  <label className="field">
                    <span className="field-label">Password</span>
                    <span className="password-row">
                      <input className="input" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />
                      <button className="btn-link" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-pressed={showPassword}>{showPassword ? 'Hide' : 'Show'}</button>
                    </span>
                    {mode === 'signup' && <span className="field-hint">At least 8 characters.</span>}
                  </label>
                )}
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'link' ? (linkSent ? 'Send another link' : 'Email me a link') : 'Sign in'}
                </button>
              </form>
              <p className="account-switch">
                {mode === 'signin' && <>New here? <button className="link" type="button" onClick={() => switchMode('signup')}>Create an account</button></>}
                {mode === 'signup' && <>Already have an account? <button className="link" type="button" onClick={() => switchMode('signin')}>Sign in</button></>}
                {mode === 'link' && <button className="link" type="button" onClick={() => switchMode('signin')}>Use a password instead</button>}
                {mode !== 'link' && <> · <button className="link" type="button" onClick={() => switchMode('link')}>Email me a link</button></>}
              </p>
            </>
          )}
          {feedback && <p className={`notice${feedback.error ? ' is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
          <Link to="/settings" className="account-settings" onClick={() => setOpen(false)}><Icon name="gear" size={15} /> Settings</Link>
        </section>
      )}
    </div>
  );
}
