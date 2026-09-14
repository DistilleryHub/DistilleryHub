import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase';

const AuthContext = createContext(null);
const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // isAdmin here comes from the verified Auth custom claim, NOT the
  // users/{uid}.isAdmin Firestore field. The Firestore field can only
  // ever be used for display (e.g. the ADMIN badge in Admin.jsx) --
  // Firestore rules and this claim are what actually gate access.
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setCurrentProfile(null);
        setIsAdmin(false);
        setAuthLoading(false);
        return;
      }
      const tokenResult = await user.getIdTokenResult();
      setIsAdmin(tokenResult.claims.admin === true);
    });
    return unsub;
  }, []);

  // Call this once for a legacy admin (users/{uid}.isAdmin === true in
  // Firestore) to move them onto the real admin custom claim. Safe to
  // expose to any signed-in user: the Cloud Function itself checks the
  // legacy Firestore flag server-side before granting anything, so a
  // non-admin calling this just gets a permission-denied error.
  async function bootstrapAdminClaim() {
    const bootstrap = httpsCallable(functions, 'bootstrapAdminClaimFromLegacyFlag');
    await bootstrap();
    await auth.currentUser.getIdToken(true); // force refresh so the new claim takes effect
    const tokenResult = await auth.currentUser.getIdTokenResult();
    setIsAdmin(tokenResult.claims.admin === true);
  }

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      setCurrentProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setAuthLoading(false);
    });
    return unsub;
  }, [currentUser]);

  // Naya signup: name, mobile, email, password, mpin sab ek saath
  async function signup({ name, headline, mobile, email, password, mpin }) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });

    // NOTE: mpinHash is intentionally NOT stored here. users/{uid} is
    // readable by any signed-in user (see firestore.rules), so the MPIN
    // hash must never live on this doc. It's hashed and stored server-side
    // in the protected userSecrets/{uid} collection via setMpin below.
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, headline: headline || '', company: '', location: '', bio: '', photoURL: '',
      mobile: mobile || '',
      blocked: [], isAdmin: false, createdAt: serverTimestamp(),
    });

    if (mpin) {
      const setMpinFn = httpsCallable(functions, 'setMpin');
      await setMpinFn({ mpin });
    }

    await sendEmailVerification(cred.user);
  }

  async function signin({ email, password }) {
    await signInWithEmailAndPassword(auth, email, password);
  }

  // Naya: Mobile + MPIN se login
  async function signinWithMpin({ mobile, mpin }) {
    const mpinLogin = httpsCallable(functions, 'mpinLogin');
    const result = await mpinLogin({ mobile, mpin });
    await signInWithCustomToken(auth, result.data.token);
  }

  async function googleSignIn() {
    const cred = await signInWithPopup(auth, googleProvider);
    const snap = await getDoc(doc(db, 'users', cred.user.uid));
    if (!snap.exists()) {
      await setDoc(doc(db, 'users', cred.user.uid), {
        name: cred.user.displayName || 'Member', headline: '', company: '',
        photoURL: cred.user.photoURL || '', mobile: '',
        blocked: [], isAdmin: false, createdAt: serverTimestamp(),
      });
    }
  }

  async function forgotPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }

  function logout() {
    return signOut(auth);
  }

  const value = {
    currentUser, currentProfile, authLoading, isAdmin, bootstrapAdminClaim,
    signup, signin, signinWithMpin, googleSignIn, forgotPassword, logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
