import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth, sendPasswordResetEmail, deleteUser } from 'firebase/auth';
import { db, apiFetch } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from './LanguageContext';
import { useTheme } from './ThemeContext';
import { useNotifications } from './src/context/NotificationContext';

const DEFAULT_SETTINGS = {
  // Privacy & Visibility
  profileVisibility: 'connections', // public | connections | private
  whoCanMessage: 'connections',     // everyone | connections
  whoCanViewStatus: 'connections',  // everyone | connections
  showOnlineStatus: true,
  // Chat & Call Preferences
  readReceipts: true,
  lastSeen: true,
  messagePreview: true,
  defaultCallType: 'video', // audio | video
  // Jobs & Market Alerts
  openToWork: false,
  preferredLocations: '',
  expectedCTC: '',
  jobAlerts: true,
  marketLeadAlerts: true,
  // Content & Downloads
  autoDownloadFiles: false,
  videoAutoplay: true,
  videoQuality: 'auto', // auto | high | data-saver
  // Notifications
  notifyChatMessages: true,
  notifyJobAlerts: true,
  notifyMarketLeads: true,
  notifyAdminAnnouncements: true,
  notifyPush: true,
  notifyEmail: false,
};

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="settings-toggle-row">
      <span className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        {hint && <span className="settings-toggle-hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="settings-toggle-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="settings-select-row">
      <span className="settings-toggle-label">{label}</span>
      <select className="settings-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function Settings() {
  const { currentUser, currentProfile, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { t, lang, setLang, languages } = useLanguage();
  const { theme, setTheme, themes, accent, setAccent, compact, setCompact, ACCENT_COLORS } = useTheme();
  const { permission: pushPermission, enabling: pushEnabling, enableNotifications, disableNotifications } = useNotifications();

  // null = main menu list screen (like a typical professional-network Settings home).
  const [activeTab, setActiveTab] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [profileForm, setProfileForm] = useState({
    name: '', bio: '', designation: '', company: '', qualifications: '',
  });
  const [saving, setSaving] = useState(false);

  // Mobile + MPIN sign-in setup — calls the Cloudflare Pages Function at
  // /api/setMpin (see functions/api/setMpin.js), which hashes the MPIN with
  // bcrypt server-side and stores it in the userSecrets/{uid} doc that
  // firestore.rules locks to server-only access.
  const [mpinForm, setMpinForm] = useState({ mobile: '', mpin: '', confirmMpin: '' });
  const [mpinSaving, setMpinSaving] = useState(false);

  const MENU = [
    { id: 'account', icon: '👤', title: t('settings.menu.account'), desc: t('settings.menu.account.desc') },
    { id: 'security', icon: '🔒', title: t('settings.menu.security'), desc: t('settings.menu.security.desc') },
    { id: 'privacy', icon: '👁️', title: t('settings.menu.visibility'), desc: t('settings.menu.visibility.desc') },
    { id: 'chatcall', icon: '💬', title: t('settings.menu.chatcall'), desc: t('settings.menu.chatcall.desc') },
    { id: 'jobsmarket', icon: '💼', title: t('settings.menu.jobsmarket'), desc: t('settings.menu.jobsmarket.desc') },
    { id: 'content', icon: '📁', title: t('settings.menu.content'), desc: t('settings.menu.content.desc') },
    { id: 'notifications', icon: '🔔', title: t('settings.menu.notifications'), desc: t('settings.menu.notifications.desc') },
    { id: 'appearance', icon: '🎨', title: t('settings.menu.appearance'), desc: t('settings.menu.appearance.desc') },
    { id: 'language', icon: '🌐', title: t('settings.menu.language'), desc: t('settings.menu.language.desc') },
  ];
  if (currentProfile?.isAdmin) {
    MENU.push({ id: 'admin', icon: '🛡️', title: t('settings.menu.admin'), desc: '' });
  }

  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings || {}) });
      setProfileForm({
        name: data.name || '',
        bio: data.bio || '',
        designation: data.designation || '',
        company: data.company || '',
        qualifications: data.qualifications || '',
      });
      // Prefill the mobile field if the account already has one on file.
      setMpinForm((f) => ({ ...f, mobile: data.mobile || f.mobile }));
    });
    return unsub;
  }, [currentUser]);

  async function saveSettings(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await setDoc(doc(db, 'users', currentUser.uid), { settings: next }, { merge: true });
    } catch (err) {
      toast(t('toast.settingSaveFail'));
    }
  }

  // Push toggle "on" karne par sirf Firestore flag save karna kaafi nahi hai —
  // browser se actual Notification permission maangni hai aur FCM token
  // generate/save karna hai, warna server ke paas bhejne ke liye koi token
  // hi nahi hoga aur notification kabhi mobile pe aayegi hi nahi.
  async function handlePushToggle(v) {
    if (v) {
      const ok = await enableNotifications();
      if (!ok) return; // permission deny ya unsupported — flag mat badlo
    } else {
      await disableNotifications();
    }
    saveSettings({ notifyPush: v });
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), { ...profileForm });
      toast(t('toast.profileUpdated'));
    } catch (err) {
      toast(t('toast.profileUpdateFail'));
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    try {
      await sendPasswordResetEmail(getAuth(), currentUser.email);
      toast(t('toast.resetSent'));
    } catch (err) {
      toast(t('toast.resetFail'));
    }
  }

  async function handleSetMpin(e) {
    e.preventDefault();
    const mobile = mpinForm.mobile.trim();
    const mpin = mpinForm.mpin.trim();
    const confirmMpin = mpinForm.confirmMpin.trim();

    if (!/^\d{10}$/.test(mobile)) {
      toast('Mobile number 10 digit ka hona chahiye.');
      return;
    }
    if (!/^\d{4,6}$/.test(mpin)) {
      toast('MPIN 4 se 6 digit ka hona chahiye.');
      return;
    }
    if (mpin !== confirmMpin) {
      toast('Dono MPIN match nahi kar rahe.');
      return;
    }

    setMpinSaving(true);
    try {
      await apiFetch('/api/setMpin', { body: { mobile, mpin } });
      toast('MPIN set ho gaya. Ab Mobile + MPIN se sign in kar sakte ho.');
      setMpinForm((f) => ({ ...f, mpin: '', confirmMpin: '' }));
    } catch (err) {
      toast(err?.message || 'MPIN set nahi ho paya. Baad mein try karo.');
    } finally {
      setMpinSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm(t('confirm.deleteAccount'))) return;
    try {
      await deleteUser(getAuth().currentUser);
      toast(t('toast.accountDeleted'));
      navigate('/auth');
    } catch (err) {
      toast(t('toast.accountDeleteFail'));
    }
  }

  function clearLocalCache() {
    try {
      // Clears anything the app has cached locally, keeps Firebase auth (IndexedDB) intact.
      Object.keys(window.localStorage)
        .filter((k) => !k.startsWith('firebase:'))
        .forEach((k) => window.localStorage.removeItem(k));
      toast(t('toast.cacheCleared'));
    } catch (err) {
      toast(t('toast.cacheClearFail'));
    }
  }

  const activeMenuItem = MENU.find((m) => m.id === activeTab);

  return (
    <div className="settings-page">
      <h1 className="settings-title">{t('settings.title')}</h1>

      {/* ---------- Main menu (no section open) ---------- */}
      {!activeTab && (
        <>
          <nav className="settings-menu-list">
            {MENU.map((item) => (
              <button
                key={item.id}
                type="button"
                className="settings-menu-row"
                onClick={() => setActiveTab(item.id)}
              >
                <span className="settings-menu-row-icon">{item.icon}</span>
                <span className="settings-menu-row-text">
                  <span className="settings-menu-row-title">{item.title}</span>
                  {item.desc && <span className="settings-menu-row-desc">{item.desc}</span>}
                </span>
                <span className="settings-menu-row-arrow">›</span>
              </button>
            ))}
          </nav>

          <div className="settings-footer-links">
            <button className="btn btn-ghost btn-block" onClick={logout}>{t('nav.signOut')}</button>
            <div className="settings-version">DistilleryHub</div>
          </div>
        </>
      )}

      {/* ---------- Detail screens ---------- */}
      {activeTab && (
        <div className="settings-panel">
          <div className="settings-detail-header">
            <button type="button" className="settings-detail-back" onClick={() => setActiveTab(null)}>
              ← {t('settings.back')}
            </button>
            <h2>{activeMenuItem?.title}</h2>
          </div>

          {activeTab === 'account' && (
            <section className="settings-section">
              <h2>{t('settings.account.heading')}</h2>
              <form onSubmit={saveProfile} className="settings-form">
                <label className="settings-field">
                  <span>{t('settings.field.name')}</span>
                  <input
                    value={profileForm.name}
                    onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="settings-field">
                  <span>{t('settings.field.bio')}</span>
                  <textarea
                    rows={3}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                  />
                </label>
                <label className="settings-field">
                  <span>{t('settings.field.designation')}</span>
                  <input
                    value={profileForm.designation}
                    onChange={(e) => setProfileForm((f) => ({ ...f, designation: e.target.value }))}
                  />
                </label>
                <label className="settings-field">
                  <span>{t('settings.field.company')}</span>
                  <input
                    value={profileForm.company}
                    onChange={(e) => setProfileForm((f) => ({ ...f, company: e.target.value }))}
                  />
                </label>
                <label className="settings-field">
                  <span>{t('settings.field.qualifications')}</span>
                  <input
                    value={profileForm.qualifications}
                    onChange={(e) => setProfileForm((f) => ({ ...f, qualifications: e.target.value }))}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? t('settings.saving') : t('settings.save')}
                </button>
              </form>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="settings-section">
              <h2>{t('settings.contactSecurity')}</h2>
              <p className="settings-static-field"><strong>{t('settings.email')}:</strong> {currentUser?.email}</p>
              <button className="btn btn-secondary" onClick={handlePasswordReset}>
                {t('settings.changePassword')}
              </button>

              <h3 className="settings-subheading">Mobile + MPIN sign-in</h3>
              <p className="settings-toggle-hint" style={{ marginBottom: 10 }}>
                Mobile number aur MPIN set karo taaki agli baar Google/password ke bina, seedha Mobile + MPIN se sign in kar sako.
              </p>
              <form onSubmit={handleSetMpin} className="settings-form">
                <label className="settings-field">
                  <span>Mobile number</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10 digit mobile number"
                    value={mpinForm.mobile}
                    onChange={(e) => setMpinForm((f) => ({ ...f, mobile: e.target.value.replace(/\D/g, '') }))}
                  />
                </label>
                <label className="settings-field">
                  <span>Naya MPIN</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="4-6 digit MPIN"
                    value={mpinForm.mpin}
                    onChange={(e) => setMpinForm((f) => ({ ...f, mpin: e.target.value.replace(/\D/g, '') }))}
                  />
                </label>
                <label className="settings-field">
                  <span>MPIN dobara likho</span>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="MPIN confirm karo"
                    value={mpinForm.confirmMpin}
                    onChange={(e) => setMpinForm((f) => ({ ...f, confirmMpin: e.target.value.replace(/\D/g, '') }))}
                  />
                </label>
                <button className="btn btn-primary" type="submit" disabled={mpinSaving}>
                  {mpinSaving ? 'Saving…' : 'MPIN Set/Update karo'}
                </button>
              </form>

              <h3 className="settings-subheading danger-zone-heading">{t('settings.dangerZone')}</h3>
              <div className="danger-zone">
                <button className="btn btn-ghost btn-block" onClick={logout}>{t('nav.signOut')}</button>
                <button className="btn btn-danger btn-block" onClick={handleDeleteAccount}>
                  {t('settings.deleteAccount')}
                </button>
              </div>
            </section>
          )}

          {activeTab === 'privacy' && (
            <section className="settings-section">
              <h2>{t('settings.privacy.heading')}</h2>
              <Select
                label={t('settings.privacy.whoSeesProfile')}
                value={settings.profileVisibility}
                onChange={(v) => saveSettings({ profileVisibility: v })}
                options={[
                  { value: 'public', label: t('settings.opt.everyone') },
                  { value: 'connections', label: t('settings.opt.connectionsOnly') },
                  { value: 'private', label: t('settings.opt.onlyMe') },
                ]}
              />
              <Select
                label={t('settings.privacy.whoMessages')}
                value={settings.whoCanMessage}
                onChange={(v) => saveSettings({ whoCanMessage: v })}
                options={[
                  { value: 'everyone', label: t('settings.opt.everyone') },
                  { value: 'connections', label: t('settings.opt.connectionsOnly') },
                ]}
              />
              <Select
                label={t('settings.privacy.whoViewsStatus')}
                value={settings.whoCanViewStatus}
                onChange={(v) => saveSettings({ whoCanViewStatus: v })}
                options={[
                  { value: 'everyone', label: t('settings.opt.everyone') },
                  { value: 'connections', label: t('settings.opt.connectionsOnly') },
                ]}
              />
              <Toggle
                label={t('settings.privacy.showOnline')}
                checked={settings.showOnlineStatus}
                onChange={(v) => saveSettings({ showOnlineStatus: v })}
              />
            </section>
          )}

          {activeTab === 'chatcall' && (
            <section className="settings-section">
              <h2>{t('settings.chatcall.heading')}</h2>
              <Toggle
                label={t('settings.chatcall.readReceipts')}
                hint={t('settings.chatcall.readReceipts.hint')}
                checked={settings.readReceipts}
                onChange={(v) => saveSettings({ readReceipts: v })}
              />
              <Toggle
                label={t('settings.chatcall.lastSeen')}
                checked={settings.lastSeen}
                onChange={(v) => saveSettings({ lastSeen: v })}
              />
              <Toggle
                label={t('settings.chatcall.msgPreview')}
                checked={settings.messagePreview}
                onChange={(v) => saveSettings({ messagePreview: v })}
              />
              <Select
                label={t('settings.chatcall.defaultCall')}
                value={settings.defaultCallType}
                onChange={(v) => saveSettings({ defaultCallType: v })}
                options={[
                  { value: 'audio', label: t('settings.opt.audio') },
                  { value: 'video', label: t('settings.opt.video') },
                ]}
              />
            </section>
          )}

          {activeTab === 'jobsmarket' && (
            <section className="settings-section">
              <h2>{t('settings.jobsmarket.heading')}</h2>
              <Toggle
                label={t('settings.jobsmarket.openToWork')}
                checked={settings.openToWork}
                onChange={(v) => saveSettings({ openToWork: v })}
              />
              <label className="settings-field">
                <span>{t('settings.jobsmarket.preferredLocations')}</span>
                <input
                  value={settings.preferredLocations}
                  onChange={(e) => saveSettings({ preferredLocations: e.target.value })}
                />
              </label>
              <label className="settings-field">
                <span>{t('settings.jobsmarket.expectedCTC')}</span>
                <input
                  value={settings.expectedCTC}
                  onChange={(e) => saveSettings({ expectedCTC: e.target.value })}
                />
              </label>
              <Toggle
                label={t('settings.jobsmarket.jobAlerts')}
                checked={settings.jobAlerts}
                onChange={(v) => saveSettings({ jobAlerts: v })}
              />
              <Toggle
                label={t('settings.jobsmarket.marketAlerts')}
                checked={settings.marketLeadAlerts}
                onChange={(v) => saveSettings({ marketLeadAlerts: v })}
              />
            </section>
          )}

          {activeTab === 'content' && (
            <section className="settings-section">
              <h2>{t('settings.content.heading')}</h2>
              <Toggle
                label={t('settings.content.autoDownload')}
                checked={settings.autoDownloadFiles}
                onChange={(v) => saveSettings({ autoDownloadFiles: v })}
              />
              <Toggle
                label={t('settings.content.autoplay')}
                checked={settings.videoAutoplay}
                onChange={(v) => saveSettings({ videoAutoplay: v })}
              />
              <Select
                label={t('settings.content.quality')}
                value={settings.videoQuality}
                onChange={(v) => saveSettings({ videoQuality: v })}
                options={[
                  { value: 'auto', label: t('settings.opt.auto') },
                  { value: 'high', label: t('settings.opt.high') },
                  { value: 'data-saver', label: t('settings.opt.dataSaver') },
                ]}
              />
              <button className="btn btn-secondary" onClick={clearLocalCache}>
                {t('settings.content.clearCache')}
              </button>
            </section>
          )}

          {activeTab === 'notifications' && (
            <section className="settings-section">
              <h2>{t('settings.notif.heading')}</h2>
              <Toggle
                label={t('settings.notif.chat')}
                checked={settings.notifyChatMessages}
                onChange={(v) => saveSettings({ notifyChatMessages: v })}
              />
              <Toggle
                label={t('settings.notif.jobs')}
                checked={settings.notifyJobAlerts}
                onChange={(v) => saveSettings({ notifyJobAlerts: v })}
              />
              <Toggle
                label={t('settings.notif.market')}
                checked={settings.notifyMarketLeads}
                onChange={(v) => saveSettings({ notifyMarketLeads: v })}
              />
              <Toggle
                label={t('settings.notif.admin')}
                checked={settings.notifyAdminAnnouncements}
                onChange={(v) => saveSettings({ notifyAdminAnnouncements: v })}
              />
              <Toggle
                label={t('settings.notif.push')}
                hint={
                  pushPermission === 'denied'
                    ? 'Notifications block hain browser/device settings mein — waha se manually allow karo'
                    : pushEnabling
                      ? 'Enabling…'
                      : undefined
                }
                checked={settings.notifyPush && pushPermission === 'granted'}
                onChange={handlePushToggle}
              />
              <Toggle
                label={t('settings.notif.email')}
                checked={settings.notifyEmail}
                onChange={(v) => saveSettings({ notifyEmail: v })}
              />
            </section>
          )}

          {activeTab === 'appearance' && (
            <section className="settings-section">
              <h2>{t('settings.appearance.heading')}</h2>

              <div className="settings-field">
                <span>{t('settings.appearance.theme')}</span>
                <div
                  className="theme-toggle-row"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
                >
                  {themes.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={'theme-toggle-btn' + (theme === preset.id ? ' active' : '')}
                      onClick={() => setTheme(preset.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        justifyContent: 'flex-start',
                        padding: '10px 12px',
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: preset.swatch.card,
                          border: `2px solid ${preset.swatch.accent}`,
                        }}
                      />
                      {preset.emoji} {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="settings-field" style={{ marginTop: 18 }}>
                <span>{t('settings.appearance.accent')}</span>
                <div className="accent-swatches">
                  {ACCENT_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      title={c.label}
                      className={'accent-swatch' + (accent === c.value ? ' selected' : '')}
                      style={{ background: c.value }}
                      onClick={() => setAccent(c.value)}
                    >
                      {accent === c.value ? '✓' : ''}
                    </button>
                  ))}
                </div>
              </label>

              <Toggle
                label={t('settings.appearance.compact')}
                checked={compact}
                onChange={setCompact}
              />
            </section>
          )}

          {activeTab === 'language' && (
            <section className="settings-section">
              <h2>{t('settings.language.heading')}</h2>
              <p className="settings-toggle-hint" style={{ marginBottom: 10 }}>{t('settings.language.choose')}</p>
              <div className="language-list">
                {languages.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    className={'language-row' + (lang === l.code ? ' selected' : '')}
                    onClick={() => setLang(l.code)}
                  >
                    <span>
                      {l.label}
                      <span className="language-native">{l.native}</span>
                    </span>
                    {lang === l.code && <span className="language-check">✓</span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'admin' && currentProfile?.isAdmin && (
            <section className="settings-section">
              <h2>{t('settings.admin.heading')}</h2>
              <p>{t('settings.admin.text')}</p>
              <button className="btn btn-primary" onClick={() => navigate('/admin')}>
                {t('settings.admin.open')}
              </button>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
