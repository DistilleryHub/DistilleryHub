import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, VAPID_KEY, getMessagingIfSupported } from '../firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { currentUser } = useAuth();
  const showToast = useToast();
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [fcmToken, setFcmToken] = useState(null);
  const [enabling, setEnabling] = useState(false);

  const saveTokenToFirestore = useCallback(async (token) => {
    if (!currentUser) return;
    await updateDoc(doc(db, 'users', currentUser.uid), {
      fcmTokens: arrayUnion(token),
    });
  }, [currentUser]);

  const removeTokenFromFirestore = useCallback(async (token) => {
    if (!currentUser || !token) return;
    await updateDoc(doc(db, 'users', currentUser.uid), {
      fcmTokens: arrayRemove(token),
    });
  }, [currentUser]);

  const enableNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      showToast('This device/browser does not support notifications', 'error');
      return false;
    }
    setEnabling(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        showToast('Notifications permission denied', 'error');
        return false;
      }

      const messaging = await getMessagingIfSupported();
      if (!messaging) {
        showToast('Push messaging not supported on this browser', 'error');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;

      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        showToast('Could not get notification token', 'error');
        return false;
      }

      setFcmToken(token);
      await saveTokenToFirestore(token);
      showToast('Notifications enabled', 'success');
      return true;
    } catch (err) {
      console.error('enableNotifications error:', err);
      showToast('Failed to enable notifications', 'error');
      return false;
    } finally {
      setEnabling(false);
    }
  }, [saveTokenToFirestore, showToast]);

  const disableNotifications = useCallback(async () => {
    await removeTokenFromFirestore(fcmToken);
    setFcmToken(null);
    showToast('Notifications disabled', 'success');
  }, [fcmToken, removeTokenFromFirestore, showToast]);

  // App khula ho tab (foreground) — toast dikhana
  useEffect(() => {
    let unsub;
    (async () => {
      const messaging = await getMessagingIfSupported();
      if (!messaging) return;
      unsub = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || 'DistilleryHub';
        const body = payload.notification?.body || payload.data?.body || '';
        showToast(`${title}: ${body}`, 'info');
      });
    })();
    return () => unsub && unsub();
  }, [showToast]);

  const value = { permission, fcmToken, enabling, enableNotifications, disableNotifications };
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
