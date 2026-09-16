import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc,
  getCountFromServer, getDocs, limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

function daysAgo(ts) {
  if (!ts?.toDate) return Infinity;
  return (Date.now() - ts.toDate().getTime()) / (1000 * 60 * 60 * 24);
}

export default function Admin() {
  const { currentProfile, isAdmin, bootstrapAdminClaim } = useAuth();
  const toast = useToast();
  const [migrating, setMigrating] = useState(false);
  const [tab, setTab] = useState('overview');

  async function handleBootstrap() {
    setMigrating(true);
    try {
      await bootstrapAdminClaim();
      toast('Admin access upgraded — welcome back.');
    } catch (err) {
      toast(err.message || 'Could not upgrade admin access.');
    }
    setMigrating(false);
  }
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState('');

  // Analytics-only state — fetched once when the Analytics tab is opened,
  // not on every Admin page visit, since counts/top-lists are read-heavy.
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (tab !== 'analytics' || analytics || !isAdmin) return;
    let cancelled = false;
    setLoadingAnalytics(true);
    (async () => {
      try {
        const [postsCount, jobsCount, articlesCount, groupsCount, storesCount] = await Promise.all([
          getCountFromServer(collection(db, 'posts')),
          getCountFromServer(collection(db, 'jobs')),
          getCountFromServer(collection(db, 'articles')),
          getCountFromServer(collection(db, 'groups')),
          getCountFromServer(collection(db, 'stores')),
        ]);

        // "Top posts" is approximate on purpose: it looks at the 200 most
        // recent posts and ranks those by like count, rather than needing a
        // denormalized likeCount field + extra index just for this panel.
        const recentPostsSnap = await getDocs(
          query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(200))
        );
        const topPosts = recentPostsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
          .slice(0, 5);

        // BUG FIX: this used to query a `shops` collection that doesn't
        // exist anywhere in the app (Market.jsx/StoreDetail.jsx both use
        // `stores`), and ordered by an `avgRating` field that `stores` docs
        // don't have (no ratings/reviews feature exists yet) — so it always
        // silently failed and showed "No rated shops yet". Fixed to the
        // real collection, ordered by creation time since there's no
        // rating data to sort by.
        let recentStores = [];
        try {
          const storesSnap = await getDocs(
            query(collection(db, 'stores'), orderBy('createdAt', 'desc'), limit(5))
          );
          recentStores = storesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (storeErr) {
          console.error('recent stores query failed', storeErr);
        }

        if (!cancelled) {
          setAnalytics({
            postsCount: postsCount.data().count,
            jobsCount: jobsCount.data().count,
            articlesCount: articlesCount.data().count,
            groupsCount: groupsCount.data().count,
            storesCount: storesCount.data().count,
            topPosts,
            recentStores,
          });
        }
      } catch (err) {
        console.error('analytics load failed', err);
        if (!cancelled) toast('Could not load analytics');
      }
      if (!cancelled) setLoadingAnalytics(false);
    })();
    return () => { cancelled = true; };
  }, [tab, analytics, isAdmin]);

  async function toggleDisabled(user) {
    await updateDoc(doc(db, 'users', user.id), { disabled: !user.disabled });
    toast(user.disabled ? `${user.name} unblocked` : `${user.name} blocked`);
  }

  async function toggleVerified(user) {
    await updateDoc(doc(db, 'users', user.id), { isVerified: !user.isVerified });
    toast(user.isVerified ? `${user.name} unverified` : `${user.name} verified`);
  }

  async function resolveReport(report) {
    await updateDoc(doc(db, 'reports', report.id), { status: 'resolved' });
  }

  if (!isAdmin) {
    // Legacy admins (marked isAdmin: true in Firestore before this
    // security update) get a one-tap upgrade instead of being locked
    // out cold. Anyone else just sees the plain access-denied message.
    if (currentProfile?.isAdmin) {
      return (
        <div className="empty-state">
          <p>Your admin access needs a one-time upgrade to the new security model.</p>
          <button className="btn btn-primary" onClick={handleBootstrap} disabled={migrating}>
            {migrating ? 'Upgrading…' : 'Upgrade admin access'}
          </button>
        </div>
      );
    }
    return <div className="empty-state">You don't have access to this page.</div>;
  }

  const visibleUsers = users.filter((u) => !search.trim() || u.name?.toLowerCase().includes(search.toLowerCase()));
  const openReports = reports.filter((r) => r.status !== 'resolved');

  const verifiedCount = users.filter((u) => u.isVerified).length;
  const blockedCount = users.filter((u) => u.disabled).length;
  const adminCount = users.filter((u) => u.isAdmin).length;
  const newThisWeek = users.filter((u) => daysAgo(u.createdAt) <= 7).length;

  return (
    <div className="admin-page">
      <h2>Admin</h2>

      <div className="notifications-toolbar">
        <button className={'btn btn-sm ' + (tab === 'overview' ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button className={'btn btn-sm ' + (tab === 'analytics' ? 'btn-primary' : 'btn-ghost')} onClick={() => setTab('analytics')}>
          Analytics
        </button>
      </div>

      {tab === 'analytics' && (
        <>
          <div className="card">
            <h3>User growth</h3>
            <div className="settings-toggle-hint" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>Total users: <strong>{users.length}</strong></div>
              <div>New this week: <strong>{newThisWeek}</strong></div>
              <div>Verified: <strong>{verifiedCount}</strong></div>
              <div>Blocked: <strong>{blockedCount}</strong></div>
              <div>Admins: <strong>{adminCount}</strong></div>
            </div>
          </div>

          {loadingAnalytics && <div className="empty-state"><span className="spinner" /> Loading analytics…</div>}

          {analytics && (
            <>
              <div className="card">
                <h3>Content totals</h3>
                <div className="settings-toggle-hint" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>Posts: <strong>{analytics.postsCount}</strong></div>
                  <div>Jobs: <strong>{analytics.jobsCount}</strong></div>
                  <div>Articles: <strong>{analytics.articlesCount}</strong></div>
                  <div>Groups: <strong>{analytics.groupsCount}</strong></div>
                  <div>Vendor stores: <strong>{analytics.storesCount}</strong></div>
                </div>
              </div>

              <div className="card">
                <h3>Top posts (last 200, by likes)</h3>
                {analytics.topPosts.length === 0 && <div className="empty-state">No posts yet.</div>}
                {analytics.topPosts.map((p) => (
                  <div className="person-row" key={p.id}>
                    <div className="person-info">
                      <div className="person-name">{p.authorName}</div>
                      <div className="person-headline">{(p.text || '').slice(0, 60)}</div>
                    </div>
                    <span className="job-applicants">👍 {p.likes?.length || 0}</span>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3>Newest vendor stores</h3>
                {analytics.recentStores.length === 0 && <div className="empty-state">No stores yet.</div>}
                {analytics.recentStores.map((s) => (
                  <div className="person-row" key={s.id}>
                    <div className="person-info">
                      <div className="person-name">{s.name}</div>
                      <div className="person-headline">{s.ownerName || ''}</div>
                    </div>
                    <span className="job-applicants">{s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString() : ''}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'overview' && (
        <>
          <div className="card">
            <h3>Open reports ({openReports.length})</h3>
            {openReports.length === 0 && <div className="empty-state">No open reports.</div>}
            {openReports.map((r) => (
              <div className="person-row" key={r.id}>
                <div className="person-info">
                  <div className="person-name">{r.targetType}: {r.targetId}</div>
                  <div className="person-headline">{r.reason}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => resolveReport(r)}>Resolve</button>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Users</h3>
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {visibleUsers.map((user) => (
            <div className="card person-row" key={user.id}>
              <div className="avatar">
                {user.photoURL ? <img src={user.photoURL} alt="" /> : (user.name?.[0] || '?')}
              </div>
              <div className="person-info">
                <div className="person-name">
                  {user.name}
                  {user.isAdmin && <span className="badge">ADMIN</span>}
                  {user.isVerified && <span className="verified-badge" title="Verified professional">✔️</span>}
                </div>
                <div className="person-headline">{user.headline}</div>
              </div>
              <div className="admin-user-actions">
                <button
                  className={'btn btn-sm ' + (user.isVerified ? 'btn-primary' : 'btn-ghost')}
                  onClick={() => toggleVerified(user)}
                >
                  {user.isVerified ? 'Unverify' : 'Verify'}
                </button>
                <button
                  className={'btn btn-sm ' + (user.disabled ? 'btn-primary' : 'btn-ghost')}
                  onClick={() => toggleDisabled(user)}
                >
                  {user.disabled ? 'Unblock' : 'Block'}
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
