import { useNotifications } from '../context/NotificationContext';

export default function EnableNotificationsButton() {
  const { permission, enabling, enableNotifications, disableNotifications } = useNotifications();

  if (permission === 'granted') {
    return (
      <button onClick={disableNotifications} className="btn-secondary">
        Notifications On — Turn Off
      </button>
    );
  }

  if (permission === 'denied') {
    return (
      <p className="text-sm text-red-400">
        Notifications block hain browser settings mein. Alerts paane ke liye browser/site settings se manually enable karo.
      </p>
    );
  }

  return (
    <button onClick={enableNotifications} disabled={enabling} className="btn-primary">
      {enabling ? 'Enabling…' : 'Enable Notifications'}
    </button>
  );
}
