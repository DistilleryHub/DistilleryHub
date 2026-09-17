import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

function friendlyAuthError(err) {
  const code = err?.code || '';
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
    return 'Incorrect email or password.';
  }
  if (code.includes('email-already-in-use')) return 'An account with this email already exists.';
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('popup-closed-by-user')) return '';
  if (err?.message) return err.message.replace('Firebase: ', '').replace(/\(.*\)\.?/, '').trim();
  return 'Something went wrong. Please try again.';
}

export default function Auth() {
  const { signup, signin, signinWithMpin, googleSignIn, forgotPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState('signin'); // 'signin' | 'signup'
  const [loginMethod, setLoginMethod] = useState('mobile'); // 'email' | 'mobile'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [signinEmail, setSigninEmail] = useState('');
  const [signinPassword, setSigninPassword] = useState('');
  const [signinMobile, setSigninMobile] = useState('');
  const [signinMpin, setSigninMpin] = useState('');

  const [signupName, setSignupName] = useState('');
  const [signupHeadline, setSignupHeadline] = useState('');
  const [signupMobile, setSignupMobile] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupMpin, setSignupMpin] = useState('');

  async function handleSignin(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (loginMethod === 'email') {
        await signin({ email: signinEmail.trim(), password: signinPassword });
      } else {
        await signinWithMpin({ mobile: signinMobile.trim(), mpin: signinMpin });
      }
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
    setBusy(false);
  }

  async function handleSignup(e) {
    e.preventDefault();
    if (signupMpin.length < 4) {
      setError('MPIN kam se kam 4 digit ka hona chahiye.');
      return;
    }
    setError(''); setBusy(true);
    try {
      await signup({
        name: signupName.trim(),
        headline: signupHeadline.trim(),
        mobile: signupMobile.trim(),
        email: signupEmail.trim(),
        password: signupPassword,
        mpin: signupMpin,
      });
      toast('Account ban gaya! Email verification link bheji gayi hai — check karo.');
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
    setBusy(false);
  }

  async function handleGoogle() {
    setError('');
    try {
      await googleSignIn();
      navigate('/');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  }

  async function handleForgotPassword() {
    if (!signinEmail.trim()) {
      setError('Enter your email above first, then tap "Forgot password?"');
      return;
    }
    try {
      await forgotPassword(signinEmail.trim());
      toast('Password reset email sent — check your inbox');
    } catch (err) {
      setError(friendlyAuthError(err));
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="mark">DH</div>
          <div className="auth-title">DistilleryHub</div>
          <div className="auth-sub">Professional network</div>
        </div>

        <div className="auth-tabs">
          <button type="button" className={'auth-tab' + (tab === 'signin' ? ' active' : '')}
            onClick={() => { setTab('signin'); setError(''); }}>Sign in</button>
          <button type="button" className={'auth-tab' + (tab === 'signup' ? ' active' : '')}
            onClick={() => { setTab('signup'); setError(''); }}>Sign up</button>
        </div>

        {error && <div className="auth-error" style={{ display: 'block' }}>{error}</div>}

        <button type="button" className="gbtn" onClick={handleGoogle}>
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6 29.5 4 24 4c-7.7 0-14.4 4.3-17.7 10.7z" />
            <path fill="#4CAF50" d="M24 44c5.3 0 10.2-2 13.9-5.4l-6.4-5.4C29.4 34.9 26.8 36 24 36c-5.3 0-9.8-3.4-11.4-8.1l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.4-2.3 4.4-4.3 5.9l6.4 5.4C40.9 36.4 44 30.9 44 24c0-1.3-.1-2.3-.4-3.5z" />
          </svg>
          Continue with Google
        </button>
        <div className="or-sep">or</div>

        {tab === 'signin' && (
          <>
            <div className="auth-tabs" style={{ marginBottom: 12 }}>
              <button type="button" className={'auth-tab' + (loginMethod === 'mobile' ? ' active' : '')}
                onClick={() => { setLoginMethod('mobile'); setError(''); }}>Mobile + MPIN</button>
              <button type="button" className={'auth-tab' + (loginMethod === 'email' ? ' active' : '')}
                onClick={() => { setLoginMethod('email'); setError(''); }}>Email</button>
            </div>

            <form onSubmit={handleSignin}>
              {loginMethod === 'email' ? (
                <>
                  <div className="form-field">
                    <label>Email</label>
                    <input type="email" required autoComplete="email"
                      value={signinEmail} onChange={(e) => setSigninEmail(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label>Password</label>
                    <input type="password" required autoComplete="current-password"
                      value={signinPassword} onChange={(e) => setSigninPassword(e.target.value)} />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-field">
                    <label>Mobile number</label>
                    <input type="tel" required
                      value={signinMobile} onChange={(e) => setSigninMobile(e.target.value)} />
                  </div>
                  <div className="form-field">
                    <label>MPIN</label>
                    <input type="password" inputMode="numeric" maxLength={6} required
                      value={signinMpin} onChange={(e) => setSigninMpin(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </>
              )}

              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? <span className="spinner" /> : 'Sign in'}
              </button>

              {loginMethod === 'email' && (
                <div className="auth-link">
                  <button type="button" className="linklike" onClick={handleForgotPassword}>
                    Forgot password?
                  </button>
                </div>
              )}
            </form>
          </>
        )}

        {tab === 'signup' && (
          <form onSubmit={handleSignup}>
            <div className="form-field">
              <label>Full name</label>
              <input type="text" required
                value={signupName} onChange={(e) => setSignupName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Mobile number</label>
              <input type="tel" required
                value={signupMobile} onChange={(e) => setSignupMobile(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Headline</label>
              <input type="text" placeholder="e.g. Distillery Manager · Grain to Glass Spirits"
                value={signupHeadline} onChange={(e) => setSignupHeadline(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input type="email" required autoComplete="email"
                value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Password</label>
              <input type="password" required minLength={6} autoComplete="new-password"
                value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
            </div>
            <div className="form-field">
              <label>MPIN (4-6 digit, quick login ke liye)</label>
              <input type="password" inputMode="numeric" maxLength={6} required
                value={signupMpin} onChange={(e) => setSignupMpin(e.target.value.replace(/\D/g, ''))} />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? <span className="spinner" /> : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
            }
