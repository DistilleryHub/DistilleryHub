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
import bcrypt from 'bcryptjs';
import { auth, db, functions } from './firebase';

const AuthContext = createContext(null);
const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setCurrentProfile(null);
        setAuthLoading(false);
      }
    });
    return unsub;
  }, []);

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

    const mpinHash = mpin ? bcrypt.hashSync(mpin, 10) : '';

    await setDoc(doc(db, 'users', cred.user.uid), {
      name, headline: headline || '', company: '', location: '', bio: '', photoURL: '',
      mobile: mobile || '', mpinHash,
      blocked: [], isAdmin: false, createdAt: serverTimestamp(),
    });

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
        photoURL: cred.user.photoURL || '', mobile: '', mpinHash: '',
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
    currentUser, currentProfile, authLoading,
    signup, signin, signinWithMpin, googleSignIn, forgotPassword, logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
