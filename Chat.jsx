import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  collection, query, where, orderBy, onSnapshot, addDoc, doc, setDoc, updateDoc,
  deleteDoc, serverTimestamp, Timestamp, arrayUnion, arrayRemove,
  limit, getDocs, writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useCall } from './CallContext';
import {
  IconClock, IconCornerUpRight, IconBarChart, IconCalendar, IconMapPin, IconUser,
  IconImage, IconMic, IconFileText, IconX, IconEye, IconPhone, IconVideo, IconSettings,
  IconSearch, IconTrash2, IconBellOff, IconBell, IconBan, IconCheck, IconFlag, IconCrown,
  IconChevronUp, IconCornerUpLeft, IconSmile, IconCopy, IconEdit, IconLock, IconCheckCheck,
  IconUsers, IconArrowUpRight, IconArrowDownLeft, IconPlus, IconMoreVertical, IconMessage, IconSend,
} from './Icons';
import { useLanguage } from './LanguageContext';
import { notify } from './notify';
import ReportDialog from './ReportDialog';
import StatusTray from './StatusTray';
import { usePromptModal } from './PromptModal';

function chatIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

function timeAgo(ts) {
  if (!ts?.toDate) return '';
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function formatScheduledFor(ts) {
  if (!ts?.toDate) return '';
  return ts.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

const ATTACH_OPTIONS = [
  { key: 'schedule', label: 'Schedule Message', icon: <IconClock className="w-5 h-5" />, color: '#4f7fff' },
  { key: 'quickreply', label: 'Quick Reply', icon: <IconCornerUpRight className="w-5 h-5" />, color: '#4f7fff' },
  { key: 'poll', label: 'Poll', icon: <IconBarChart className="w-5 h-5" />, color: '#0ea5e9' },
  { key: 'event', label: 'Event', icon: <IconCalendar className="w-5 h-5" />, color: '#14b8a6' },
  { key: 'location', label: 'Batch Location', icon: <IconMapPin className="w-5 h-5" />, color: '#22c55e' },
  { key: 'profile', label: 'Share Profile', icon: <IconUser className="w-5 h-5" />, color: '#f97316' },
  { key: 'photo', label: 'Photo', icon: <IconImage className="w-5 h-5" />, color: '#ec4899' },
  { key: 'video', label: 'Video', icon: <IconVideo className="w-5 h-5" />, color: '#a855f7' },
  { key: 'voice', label: 'Voice Note', icon: <IconMic className="w-5 h-5" />, color: '#f5576c' },
  { key: 'document', label: 'Share Document', icon: <IconFileText className="w-5 h-5" />, color: '#f97316' },
];

const QUICK_REPLIES = [
  'Thanks, will check and get back!',
  'Can we schedule a call?',
  'Sounds good 👍',
];

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const DISAPPEARING_OPTIONS = [
  { key: 0, label: 'Off' },
  { key: 86400, label: '24 hours' },
  { key: 604800, label: '7 days' },
  { key: 7776000, label: '90 days' },
];

const WALLPAPER_OPTIONS = [
  { key: 'default', label: 'Default', bg: 'transparent' },
  { key: 'teal', label: 'Teal', bg: '#0f2f2c' },
  { key: 'sunset', label: 'Sunset', bg: 'linear-gradient(160deg,#3a1c33,#552a1f)' },
  { key: 'sky', label: 'Sky', bg: 'linear-gradient(160deg,#12263a,#173a52)' },
];

// How often we poll for due scheduled messages / expired disappearing
// messages while the app is open.
const BACKGROUND_CHECK_INTERVAL_MS = 20000;
const PRESENCE_HEARTBEAT_MS = 30000;
const ONLINE_THRESHOLD_MS = 60000;
const MESSAGES_PAGE_SIZE = 40;

// Renders *bold*, _italic_, ~strike~, "@mention" and "> quoted line" —
// the same shortcut syntax WhatsApp recognizes while typing.
function renderFormattedText(text) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, li) => {
    let content = line;
    let isQuoteLine = false;
    if (content.startsWith('>')) {
      isQuoteLine = true;
      content = content.slice(1).trimStart();
    }
    const regex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|@[a-zA-Z0-9_]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) parts.push(content.slice(lastIndex, match.index));
      const token = match[0];
      if (token.startsWith('*')) parts.push(<strong key={key++}>{token.slice(1, -1)}</strong>);
      else if (token.startsWith('_')) parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
      else if (token.startsWith('~')) parts.push(<s key={key++}>{token.slice(1, -1)}</s>);
      else if (token.startsWith('@')) parts.push(<strong key={key++} style={{ color: '#4f7fff' }}>{token}</strong>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) parts.push(content.slice(lastIndex));
    return (
      <div key={li} className={isQuoteLine ? 'msg-line msg-quote-line' : 'msg-line'}
        style={isQuoteLine ? { borderLeft: '3px solid currentColor', paddingLeft: 8, opacity: 0.85 } : undefined}>
        {parts.length ? parts : content}
      </div>
    );
  });
}

export default function Chat() {
  const { currentUser, currentProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { confirmDialog, formDialog, choiceDialog, noticeDialog, modalElement } = usePromptModal();
  const { startCall } = useCall();
  const { t } = useLanguage();
  const [people, setPeople] = useState([]);
  const [connections, setConnections] = useState([]);
  const [groupChats, setGroupChats] = useState([]);
  const [directChatDocs, setDirectChatDocs] = useState([]);
  const [callLog, setCallLog] = useState([]);
  const [callFilter, setCallFilter] = useState('all'); // 'all' | 'missed' | 'incoming' | 'outgoing'
  const [showNewCall, setShowNewCall] = useState(false);
  const [listTab, setListTab] = useState('chats'); // 'chats' | 'groups' | 'calls'

  // Bottom nav's "Calls" tab links to /chat?tab=calls so it opens straight
  // into the existing Calls sub-tab instead of needing a separate route.
  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('tab');
    setListTab(wanted === 'calls' || wanted === 'groups' ? wanted : 'chats');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);
  const [listSearch, setListSearch] = useState('');
  const [activeChat, setActiveChat] = useState(null);
  const [chatMeta, setChatMeta] = useState(null); // live chat doc: pinned/admin/disappearing/mute/etc.
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showAttach, setShowAttach] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Photo/video "preview before send" flow — holds the picked files (as
  // local object URLs) plus the batch-level View Once / HD toggles and an
  // optional caption, until the user hits Send in the preview modal.
  const [mediaPreview, setMediaPreview] = useState(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);

  // Per-message WhatsApp-style options
  const [activeMessageMenu, setActiveMessageMenu] = useState(null); // message id
  const [reactingTo, setReactingTo] = useState(null); // message id
  const [replyTo, setReplyTo] = useState(null); // { id, text, senderId, senderName }
  const [revealedIds, setRevealedIds] = useState(new Set()); // view-once media opened this session

  // @ mentions (group chats only)
  const [mentionCandidates, setMentionCandidates] = useState([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);

  // Group admin controls
  const [showManageGroup, setShowManageGroup] = useState(false);
  const [showAddMemberList, setShowAddMemberList] = useState(false);

  // Forward message
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null); // { id, chatId }
  const [reportingMessage, setReportingMessage] = useState(null);
  const [reportingPerson, setReportingPerson] = useState(false);

  // Top bar (⋮) menu: search / wallpaper / clear chat / mute
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWallpaperPicker, setShowWallpaperPicker] = useState(false);
  const [wallpaperKey, setWallpaperKey] = useState('default');
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);

  // Presence (online / last seen) — only tracked for direct chats.
  const [otherPresence, setOtherPresence] = useState(null);

  // Schedule Message state
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleWhen, setScheduleWhen] = useState('');
  const [myScheduledMessages, setMyScheduledMessages] = useState([]);

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setPeople(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const qFrom = query(collection(db, 'connections'), where('from', '==', currentUser.uid), where('status', '==', 'accepted'));
    const qTo = query(collection(db, 'connections'), where('to', '==', currentUser.uid), where('status', '==', 'accepted'));
    let fromDocs = [], toDocs = [];
    const merge = () => setConnections([...fromDocs, ...toDocs]);
    const unsub1 = onSnapshot(qFrom, (snap) => { fromDocs = snap.docs.map((d) => d.data()); merge(); });
    const unsub2 = onSnapshot(qTo, (snap) => { toDocs = snap.docs.map((d) => d.data()); merge(); });
    return () => { unsub1(); unsub2(); };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const groups = all.filter((c) => c.type === 'group');
      groups.sort((a, b) => (b.lastMessageAt?.toMillis() || 0) - (a.lastMessageAt?.toMillis() || 0));
      setGroupChats(groups);
      const direct = all.filter((c) => c.type === 'direct');
      setDirectChatDocs(direct);
    });
    return unsub;
  }, [currentUser]);

  // Ended call history for the "Calls" tab. Needs a composite index
  // (participants array-contains + status == + createdAt orderBy) — if it's
  // missing, Firestore logs an error with a one-click link to create it.
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', currentUser.uid),
      where('status', '==', 'ended'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => setCallLog(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (error) => console.error('DistilleryHub: call log listener failed', error)
    );
    return unsub;
  }, [currentUser]);

  const connectedPeople = useMemo(() => {
    const otherIds = connections.map((c) => (c.from === currentUser?.uid ? c.to : c.from));
    return people.filter((p) => otherIds.includes(p.id));
  }, [connections, people, currentUser]);

  // Direct chat doc (lastMessage/lastMessageAt) for each connected person,
  // keyed by their uid — chat doc IDs are deterministic (chatIdFor), so the
  // other participant is just whichever id in `participants` isn't mine.
  const directChatByPersonId = useMemo(() => {
    const map = {};
    directChatDocs.forEach((c) => {
      const otherId = (c.participants || []).find((id) => id !== currentUser?.uid);
      if (otherId) map[otherId] = c;
    });
    return map;
  }, [directChatDocs, currentUser]);

  // WhatsApp-style ordering: whoever you most recently messaged floats to
  // the top; connections you haven't chatted with yet fall to the bottom,
  // alphabetically.
  const sortedDirectList = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return connectedPeople
      .map((p) => ({ person: p, chatDoc: directChatByPersonId[p.id] || null }))
      .filter(({ person }) => !q || person.name?.toLowerCase().includes(q))
      .sort((a, b) => {
        const at = a.chatDoc?.lastMessageAt?.toMillis() || 0;
        const bt = b.chatDoc?.lastMessageAt?.toMillis() || 0;
        if (at !== bt) return bt - at;
        return (a.person.name || '').localeCompare(b.person.name || '');
      });
  }, [connectedPeople, directChatByPersonId, listSearch]);

  const filteredGroupChats = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return groupChats.filter((c) => !q || c.name?.toLowerCase().includes(q));
  }, [groupChats, listSearch]);

  // Other members of the currently open group chat, used for @mention lookups.
  const groupMembers = useMemo(() => {
    if (!activeChat || activeChat.type !== 'group' || !currentUser) return [];
    return people.filter(
      (p) => activeChat.chat.participants.includes(p.id) && p.id !== currentUser.uid
    );
  }, [activeChat, people, currentUser]);

  function mentionHandleFor(name) {
    return (name || '').replace(/\s+/g, '');
  }

  function handleTextChange(e) {
    const val = e.target.value;
    setText(val);
    pingTyping();
    if (!activeChat || activeChat.type !== 'group') {
      setShowMentionPicker(false);
      return;
    }
    const match = val.match(/@([a-zA-Z0-9_]*)$/);
    if (match) {
      const q = match[1].toLowerCase();
      const candidates = groupMembers.filter((p) => mentionHandleFor(p.name).toLowerCase().includes(q));
      setMentionCandidates(candidates);
      setShowMentionPicker(candidates.length > 0);
    } else {
      setShowMentionPicker(false);
    }
  }

  function insertMention(p) {
    setText((cur) => cur.replace(/@([a-zA-Z0-9_]*)$/, `@${mentionHandleFor(p.name)} `));
    setShowMentionPicker(false);
  }

  // Finds which group members were actually @mentioned in the sent text,
  // so we can tag the message and notify them.
  function extractMentionedUids(body) {
    if (!activeChat || activeChat.type !== 'group') return [];
    return groupMembers
      .filter((p) => body.includes('@' + mentionHandleFor(p.name)))
      .map((p) => p.id);
  }

  async function notifyMentioned(uids, body) {
    const { chatId } = getChatMeta();
    for (const uid of uids) {
      try {
        await addDoc(collection(db, 'notifications'), {
          toUserId: uid,
          type: 'mention',
          fromUserId: currentUser.uid,
          fromUserName: currentUser.displayName || currentUser.email,
          chatId,
          groupName: activeChat.chat.name,
          text: body,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Failed to notify mentioned user', err);
      }
    }
  }

  function getChatMeta() {
    const chatId = activeChat.type === 'direct'
      ? chatIdFor(currentUser.uid, activeChat.person.id)
      : activeChat.chat.id;
    const participants = activeChat.type === 'direct'
      ? [currentUser.uid, activeChat.person.id].sort()
      : activeChat.chat.participants;
    return { chatId, participants };
  }

  function getSenderName(uid) {
    if (!uid) return 'Member';
    if (uid === currentUser.uid) return 'You';
    if (activeChat?.type === 'direct' && uid === activeChat.person.id) return activeChat.person.name;
    return people.find((p) => p.id === uid)?.name || 'Member';
  }

  // Messages: only the latest MESSAGES_PAGE_SIZE are kept live via onSnapshot.
  // Older pages are fetched once (not live) via loadOlderMessages() below and
  // appended — this is the "don't load the whole history at once" fix.
  const [olderDocs, setOlderDocs] = useState([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const liveDocsRef = useRef([]); // latest snap.docs from the live window, desc order
  const olderDocsRef = useRef([]);
  useEffect(() => { olderDocsRef.current = olderDocs; }, [olderDocs]);

  useEffect(() => {
    if (!activeChat || !currentUser) return;
    const { chatId } = getChatMeta();
    setOlderDocs([]);
    setHasMoreOlder(true);
    liveDocsRef.current = [];
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(MESSAGES_PAGE_SIZE)
    );
    const unsub = onSnapshot(q, (snap) => {
      liveDocsRef.current = snap.docs;
      if (snap.docs.length < MESSAGES_PAGE_SIZE) setHasMoreOlder(false);
      const merged = new Map();
      [...snap.docs, ...olderDocsRef.current].forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
      setMessages([...merged.values()].reverse());
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, currentUser]);

  // Anchored on the oldest currently-shown message's timestamp (not a doc
  // snapshot reference) — a snapshot-based anchor can develop a gap if the
  // live window shifts (new messages arriving) between page loads; a
  // timestamp anchor stays correct regardless.
  async function loadOlderMessages() {
    if (loadingOlder || !hasMoreOlder || !activeChat || !currentUser || messages.length === 0) return;
    const oldestShown = messages[0];
    if (!oldestShown?.createdAt) return;
    setLoadingOlder(true);
    try {
      const { chatId } = getChatMeta();
      const q = query(
        collection(db, 'chats', chatId, 'messages'),
        orderBy('createdAt', 'desc'),
        where('createdAt', '<', oldestShown.createdAt),
        limit(MESSAGES_PAGE_SIZE)
      );
      const snap = await getDocs(q);
      if (snap.docs.length < MESSAGES_PAGE_SIZE) setHasMoreOlder(false);
      setOlderDocs((prev) => {
        const next = [...prev, ...snap.docs];
        const merged = new Map();
        [...liveDocsRef.current, ...next].forEach((d) => merged.set(d.id, { id: d.id, ...d.data() }));
        setMessages([...merged.values()].reverse());
        return next;
      });
    } catch (err) {
      console.error('loadOlderMessages failed', err);
    } finally {
      setLoadingOlder(false);
    }
  }

  // Live chat doc (pinned message, admin list, disappearing timer, mute, etc).
  useEffect(() => {
    if (!activeChat || !currentUser) return;
    const { chatId } = getChatMeta();
    const unsub = onSnapshot(doc(db, 'chats', chatId), (snap) => {
      setChatMeta(snap.exists() ? snap.data() : null);
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat, currentUser]);

  // Reset per-chat UI state (view-once reveals, wallpaper, search) when switching chats.
  useEffect(() => {
    setRevealedIds(new Set());
    setShowSearchBar(false);
    setSearchQuery('');
    setShowChatMenu(false);
    setShowManageGroup(false);
    if (activeChat) {
      const { chatId } = getChatMeta();
      setWallpaperKey(localStorage.getItem(`wallpaper_${chatId}`) || 'default');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat]);

  // Mark incoming messages as delivered (direct chats only) — this is what
  // flips a message from single tick (✓ sent, not yet delivered) to double
  // tick (✓✓ delivered). Unlike the read receipt below, this ALWAYS runs
  // regardless of the "Read receipts" privacy setting — WhatsApp shows
  // delivered ticks even when read receipts are off; only the blue "read"
  // tick is gated by that setting. Delivery here means "the recipient's
  // client is open on this chat" (this app has no background/push-based
  // delivery tracking) — a reasonable proxy, not true device-level delivery.
  useEffect(() => {
    if (!activeChat || activeChat.type !== 'direct' || !currentUser) return;
    const { chatId } = getChatMeta();
    const undelivered = messages.filter(
      (m) => m.senderId !== currentUser.uid && !(m.deliveredTo || []).includes(currentUser.uid)
    );
    undelivered.forEach((m) => {
      updateDoc(doc(db, 'chats', chatId, 'messages', m.id), {
        deliveredTo: arrayUnion(currentUser.uid),
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeChat, currentUser]);

  // Mark incoming messages as read (direct chats only — keeps group receipts simple).
  // Respects Settings > Privacy > "Read receipts": if the reader has turned
  // this off, we don't write readBy at all, so the sender never sees a read
  // tick for them.
  const readReceiptsEnabled = currentProfile?.settings?.readReceipts !== false;
  useEffect(() => {
    if (!activeChat || activeChat.type !== 'direct' || !currentUser || !readReceiptsEnabled) return;
    const { chatId } = getChatMeta();
    const unread = messages.filter(
      (m) => m.senderId !== currentUser.uid && !(m.readBy || []).includes(currentUser.uid)
    );
    unread.forEach((m) => {
      updateDoc(doc(db, 'chats', chatId, 'messages', m.id), {
        readBy: arrayUnion(currentUser.uid),
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeChat, currentUser, readReceiptsEnabled]);

  // Presence heartbeat: keep our own lastSeen fresh while the app is open.
  // Respects Settings > Privacy > "Show online status" — if off, we stop
  // broadcasting presence entirely (and clear any stale doc from before).
  const showOnlineStatus = currentProfile?.settings?.showOnlineStatus !== false;
  useEffect(() => {
    if (!currentUser) return;
    if (!showOnlineStatus) {
      deleteDoc(doc(db, 'presence', currentUser.uid)).catch(() => {});
      return;
    }
    const beat = () => {
      setDoc(doc(db, 'presence', currentUser.uid), { lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    };
    beat();
    const interval = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [currentUser, showOnlineStatus]);

  // Subscribe to the other participant's presence in a direct chat.
  useEffect(() => {
    if (!activeChat || activeChat.type !== 'direct') { setOtherPresence(null); return; }
    const unsub = onSnapshot(doc(db, 'presence', activeChat.person.id), (snap) => {
      setOtherPresence(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [activeChat]);

  // Subscribe to the other participant's profile just for `blocked` /
  // `settings.whoCanMessage` — used to hide the composer/call buttons on
  // either side of a block, or when they only accept messages from
  // connections. UX convenience only; real enforcement for blocking is in
  // firestore.rules (isBlockedPair).
  const [otherProfile, setOtherProfile] = useState(null);
  useEffect(() => {
    if (!activeChat || activeChat.type !== 'direct') { setOtherProfile(null); return; }
    const unsub = onSnapshot(doc(db, 'users', activeChat.person.id), (snap) => {
      setOtherProfile(snap.exists() ? snap.data() : null);
    });
    return unsub;
  }, [activeChat]);

  const isBlockedEitherWay = activeChat?.type === 'direct' && (
    (currentProfile?.blocked || []).includes(activeChat.person.id) ||
    (otherProfile?.blocked || []).includes(currentUser.uid)
  );

  const isRestrictedByWhoCanMessage = activeChat?.type === 'direct' &&
    otherProfile?.settings?.whoCanMessage === 'connections' &&
    !connectedPeople.some((p) => p.id === activeChat.person.id);

  // ---- Typing indicator ----
  // Throttled write (at most once every 2.5s) to chats/{chatId}.typing.{uid},
  // plus an inactivity timer that clears it after 4s of no keystrokes.
  // Piggy-backs on the existing chat-doc update permission (any participant
  // can already update the chat doc per firestore.rules).
  const lastTypingWriteRef = useRef(0);
  const typingClearTimeoutRef = useRef(null);
  const TYPING_THROTTLE_MS = 2500;
  const TYPING_IDLE_MS = 4000;
  const TYPING_STALE_MS = 6000; // reader-side: ignore a typing flag older than this

  function clearTypingFlag() {
    if (!activeChat || !currentUser) return;
    const { chatId } = getChatMeta();
    updateDoc(doc(db, 'chats', chatId), { [`typing.${currentUser.uid}`]: null }).catch(() => {});
  }

  function pingTyping() {
    if (!activeChat || !currentUser) return;
    if (typingClearTimeoutRef.current) clearTimeout(typingClearTimeoutRef.current);
    typingClearTimeoutRef.current = setTimeout(clearTypingFlag, TYPING_IDLE_MS);

    const now = Date.now();
    if (now - lastTypingWriteRef.current < TYPING_THROTTLE_MS) return;
    lastTypingWriteRef.current = now;
    const { chatId } = getChatMeta();
    setDoc(doc(db, 'chats', chatId), { [`typing.${currentUser.uid}`]: serverTimestamp() }, { merge: true }).catch(() => {});
  }

  useEffect(() => {
    return () => {
      if (typingClearTimeoutRef.current) clearTimeout(typingClearTimeoutRef.current);
      clearTypingFlag();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat]);

  const typingUserIds = useMemo(() => {
    const typing = chatMeta?.typing || {};
    const now = Date.now();
    return Object.entries(typing)
      .filter(([uid, ts]) => uid !== currentUser?.uid && ts?.toMillis && (now - ts.toMillis()) < TYPING_STALE_MS)
      .map(([uid]) => uid);
  }, [chatMeta, currentUser]);

  // Listen to this user's own pending scheduled messages (across all chats).
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'scheduledMessages'),
      where('senderId', '==', currentUser.uid),
      where('sent', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.scheduledFor?.toMillis() || 0) - (b.scheduledFor?.toMillis() || 0));
      setMyScheduledMessages(items);
    });
    return unsub;
  }, [currentUser]);

  // Poll for due scheduled messages while the app is open and send them.
  // NOTE: this only fires while some user's browser tab is open at the
  // scheduled time — there's no backend/cron here, so a message won't send
  // itself while every device is fully closed. For guaranteed delivery even
  // when apps are closed, a Firebase Cloud Function (scheduled trigger)
  // would be needed instead.
  useEffect(() => {
    if (!currentUser) return;
    async function checkDue() {
      const now = Date.now();
      const due = myScheduledMessages.filter((m) => (m.scheduledFor?.toMillis() || 0) <= now);
      for (let i = 0; i < due.length; i++) {
        const m = due[i];
        // If several are due in the same tick, space them out past the
        // rateLimits gap (see firestore.rules) instead of firing all at
        // once — otherwise only the first would get through.
        if (i > 0) await new Promise((r) => setTimeout(r, 800));
        try {
          const batch = writeBatch(db);
          batch.set(doc(db, 'chats', m.chatId), {
            type: m.chatType,
            participants: m.participants,
            ...(m.chatType === 'group' ? { name: m.groupName } : {}),
            lastMessage: m.text,
            lastMessageAt: serverTimestamp(),
          }, { merge: true });
          batch.set(doc(collection(db, 'chats', m.chatId, 'messages')), {
            senderId: currentUser.uid,
            text: m.text,
            createdAt: serverTimestamp(),
            readBy: [],
            deliveredTo: [],
            reactions: {},
            deletedFor: [],
          });
          batch.set(doc(db, 'rateLimits', currentUser.uid), { lastMessageAt: serverTimestamp() }, { merge: true });
          batch.update(doc(db, 'scheduledMessages', m.id), { sent: true, sentAt: serverTimestamp() });
          await batch.commit();
          notifyOthers(m.participants, m.text, m.chatType === 'group', m.groupName);
        } catch (err) {
          console.error('Failed to send scheduled message', err);
        }
      }
    }
    checkDue();
    const interval = setInterval(checkDue, BACKGROUND_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [myScheduledMessages, currentUser]);

  // Sweep expired disappearing messages in the currently open chat.
  // Same limitation as scheduled messages: this only runs while someone has
  // the chat open, since there's no backend cron in this static app.
  useEffect(() => {
    if (!activeChat || !currentUser) return;
    const { chatId } = getChatMeta();
    async function sweep() {
      const now = Date.now();
      const expired = messages.filter((m) => m.expiresAt?.toMillis && m.expiresAt.toMillis() <= now);
      for (const m of expired) {
        try {
          await deleteDoc(doc(db, 'chats', chatId, 'messages', m.id));
        } catch (err) {
          console.error('Failed to remove expired message', err);
        }
      }
    }
    sweep();
    const interval = setInterval(sweep, BACKGROUND_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, activeChat, currentUser]);

  // Notifies everyone in a chat except the sender — used for regular
  // messages, forwards, polls/events/attachments, everything that lands in
  // the messages subcollection. Without this, recipients only ever found
  // out about a new message by having Chat open already.
  function notifyOthers(participants, body, isGroup, groupName) {
    const preview = (body || '[attachment]').slice(0, 60);
    participants
      .filter((uid) => uid !== currentUser.uid)
      .forEach((uid) => {
        notify({
          toUserId: uid,
          type: 'message',
          message: isGroup
            ? `${currentProfile?.name || 'Someone'} in ${groupName}: ${preview}`
            : `${currentProfile?.name || 'Someone'}: ${preview}`,
          link: '/chat',
          fromUserId: currentUser.uid,
          fromUserName: currentProfile?.name || 'Member',
          fromUserPhoto: currentProfile?.photoURL || '',
        });
      });
  }

  async function sendRawMessage(body, extra = {}) {
    if (!body.trim() && !extra.mediaUrl && !extra.poll && !extra.event) return;
    const { chatId, participants } = getChatMeta();
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'chats', chatId), {
        type: activeChat.type === 'group' ? 'group' : 'direct',
        participants,
        ...(activeChat.type === 'group' ? { name: activeChat.chat.name } : {}),
        lastMessage: body || `[${extra.attachmentType || 'attachment'}]`,
        lastMessageAt: serverTimestamp(),
      }, { merge: true });
      const disappearingSeconds = chatMeta?.disappearingSeconds || 0;
      const expiresAt = disappearingSeconds > 0
        ? Timestamp.fromMillis(Date.now() + disappearingSeconds * 1000)
        : null;
      const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
      batch.set(messageRef, {
        senderId: currentUser.uid,
        text: body,
        createdAt: serverTimestamp(),
        readBy: [],
            deliveredTo: [],
        reactions: {},
        deletedFor: [],
        ...(expiresAt ? { expiresAt } : {}),
        ...extra,
      });
      // Rate-limit stamp: the messages `create` rule in firestore.rules
      // checks that THIS doc's previous value is >700ms old before allowing
      // the message, and (via getAfter) requires this exact write to happen
      // in the same commit — so a client can't skip it to dodge the limit.
      batch.set(doc(db, 'rateLimits', currentUser.uid), { lastMessageAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      notifyOthers(participants, body, activeChat.type === 'group', activeChat.chat?.name);
    } catch (err) {
      console.error('sendRawMessage failed', err);
      if (err.code === 'permission-denied') {
        noticeDialog('You\u2019re sending messages too fast — slow down a bit.');
      } else {
        noticeDialog('Message send failed: ' + err.code + ' — ' + err.message);
      }
      setText(body);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !activeChat) return;
    if (activeChat.type === 'group' && chatMeta?.onlyAdminsCanSend && !(chatMeta?.admins || []).includes(currentUser.uid)) {
      return;
    }
    const body = text.trim();

    if (editingMessage) {
      setText('');
      if (typingClearTimeoutRef.current) clearTimeout(typingClearTimeoutRef.current);
      clearTypingFlag();
      const { id, chatId } = editingMessage;
      setEditingMessage(null);
      try {
        await updateDoc(doc(db, 'chats', chatId, 'messages', id), {
          text: body,
          edited: true,
          editedAt: serverTimestamp(),
        });
      } catch (err) {
        noticeDialog('Edit failed: ' + (err.message || err));
      }
      return;
    }

    setText('');
    if (typingClearTimeoutRef.current) clearTimeout(typingClearTimeoutRef.current);
    clearTypingFlag();
    setShowMentionPicker(false);
    const mentions = extractMentionedUids(body);
    const extra = { ...(replyTo ? { replyTo } : {}), ...(mentions.length ? { mentions } : {}) };
    setReplyTo(null);
    await sendRawMessage(body, extra);
    if (mentions.length) await notifyMentioned(mentions, body);
  }

  async function handleAttachClick(key) {
    setShowAttach(false);
    if (key === 'schedule') {
      setShowScheduleForm(true);
    } else if (key === 'quickreply') {
      setShowQuickReplies(true);
    } else if (key === 'poll') {
      promptForPoll();
    } else if (key === 'event') {
      promptForEvent();
    } else if (key === 'location') {
      const loc = await formDialog('Batch / distillery location', [{ key: 'loc', label: 'Enter batch / distillery location' }]);
      if (loc?.loc) sendRawMessage(`📍 ${loc.loc}`, { attachmentType: 'location' });
    } else if (key === 'profile') {
      sendRawMessage(`👤 Shared profile: ${currentUser.displayName || currentUser.email}`, {
        attachmentType: 'profile',
        sharedUid: currentUser.uid,
      });
    } else if (key === 'photo') {
      fileInputRef.current.setAttribute('accept', 'image/*');
      fileInputRef.current.setAttribute('data-kind', 'photo');
      fileInputRef.current.setAttribute('multiple', 'true');
      fileInputRef.current.click();
    } else if (key === 'video') {
      fileInputRef.current.setAttribute('accept', 'video/*');
      fileInputRef.current.setAttribute('data-kind', 'video');
      fileInputRef.current.setAttribute('multiple', 'true');
      fileInputRef.current.click();
    } else if (key === 'document') {
      fileInputRef.current.setAttribute('accept', '.pdf,.doc,.docx,.xls,.xlsx,.txt');
      fileInputRef.current.setAttribute('data-kind', 'document');
      fileInputRef.current.removeAttribute('multiple');
      fileInputRef.current.click();
    } else if (key === 'voice') {
      startRecording();
    }
  }

  async function promptForPoll() {
    const result = await formDialog('Create a poll', [
      { key: 'question', label: 'Poll question' },
      { key: 'options', label: 'Options (comma separated)', placeholder: 'e.g. Yes, No, Maybe' },
    ]);
    if (!result) return;
    const { question, options: optionsRaw } = result;
    if (!question?.trim()) return;
    const options = (optionsRaw || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) {
      await noticeDialog('Add at least 2 options.');
      return;
    }
    await sendRawMessage(`📊 ${question}`, { attachmentType: 'poll', poll: { question, options, votes: {} } });
  }

  async function promptForEvent() {
    const result = await formDialog('Create an event', [
      { key: 'title', label: 'Event title' },
      { key: 'when', label: 'Date & time', placeholder: 'e.g. 12 Oct, 6pm' },
      { key: 'location', label: 'Location (optional)' },
    ]);
    if (!result?.title?.trim()) return;
    const { title, when, location } = result;
    await sendRawMessage(`📅 ${title}`, { attachmentType: 'event', event: { title, when: when || '', location: location || '', going: [] } });
  }

  async function votePoll(m, optionIndex) {
    const { chatId } = getChatMeta();
    const votes = { ...(m.poll.votes || {}) };
    Object.keys(votes).forEach((k) => {
      votes[k] = (votes[k] || []).filter((uid) => uid !== currentUser.uid);
    });
    const key = String(optionIndex);
    votes[key] = [...(votes[key] || []), currentUser.uid];
    await updateDoc(doc(db, 'chats', chatId, 'messages', m.id), { poll: { ...m.poll, votes } });
  }

  async function toggleGoingEvent(m) {
    const { chatId } = getChatMeta();
    const going = m.event.going || [];
    const isGoing = going.includes(currentUser.uid);
    const newGoing = isGoing ? going.filter((uid) => uid !== currentUser.uid) : [...going, currentUser.uid];
    await updateDoc(doc(db, 'chats', chatId, 'messages', m.id), { event: { ...m.event, going: newGoing } });
  }

  async function submitScheduleForm(e) {
    e.preventDefault();
    if (!scheduleText.trim() || !scheduleWhen || !activeChat) return;
    const when = new Date(scheduleWhen);
    if (isNaN(when.getTime())) {
      noticeDialog('Please pick a valid date & time.');
      return;
    }
    if (when.getTime() <= Date.now()) {
      noticeDialog('Please pick a time in the future.');
      return;
    }
    const { chatId, participants } = getChatMeta();
    try {
      await addDoc(collection(db, 'scheduledMessages'), {
        chatId,
        chatType: activeChat.type === 'group' ? 'group' : 'direct',
        groupName: activeChat.type === 'group' ? activeChat.chat.name : null,
        participants,
        senderId: currentUser.uid,
        text: scheduleText.trim(),
        scheduledFor: Timestamp.fromDate(when),
        sent: false,
        createdAt: serverTimestamp(),
      });
      setScheduleText('');
      setScheduleWhen('');
      setShowScheduleForm(false);
    } catch (err) {
      noticeDialog('Could not schedule message: ' + err.message);
    }
  }

  async function cancelScheduledMessage(id) {
    if (!(await confirmDialog('Cancel this scheduled message?'))) return;
    await deleteDoc(doc(db, 'scheduledMessages', id));
  }

  async function handleFileChosen(e) {
    const files = Array.from(e.target.files || []);
    const kind = e.target.getAttribute('data-kind');
    e.target.value = '';
    if (!files.length) return;

    if (kind === 'photo' || kind === 'video') {
      // Preview first — see mediaPreview state + sendMediaPreviewBatch()
      // below. object URLs are revoked either on send or on close.
      const items = files.map((file) => ({ file, kind, url: URL.createObjectURL(file) }));
      setMediaPreview({ items, activeIndex: 0, viewOnce: false, hd: false, caption: '' });
      return;
    }

    // Documents: unchanged — single file, straight upload, no preview needed.
    const file = files[0];
    setUploading(true);
    try {
      const url = await uploadToCloudinary(file, 'raw');
      await sendRawMessage(`📄 ${file.name}`, { attachmentType: 'document', mediaUrl: url });
    } catch (err) {
      noticeDialog('Upload failed: ' + err.message);
    }
    setUploading(false);
  }

  // Downscales+recompresses an image client-side (mirrors WhatsApp's
  // non-HD send) so "HD off" actually saves bandwidth instead of being a
  // label with no effect. Videos aren't re-encoded here — doing that in the
  // browser needs a heavy library (e.g. ffmpeg.wasm) this project doesn't
  // include yet — so the HD toggle for video only affects upload quality
  // hints/labeling, not the actual file size, until that's added.
  function compressImageFile(file, maxDim = 1280, quality = 0.72) {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
          else { width = Math.round((width * maxDim) / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  }

  function closeMediaPreview() {
    mediaPreview?.items.forEach((it) => URL.revokeObjectURL(it.url));
    setMediaPreview(null);
  }

  function removeMediaPreviewItem(index) {
    setMediaPreview((mp) => {
      if (!mp) return mp;
      URL.revokeObjectURL(mp.items[index].url);
      const items = mp.items.filter((_, i) => i !== index);
      if (!items.length) return null;
      return { ...mp, items, activeIndex: Math.min(mp.activeIndex, items.length - 1) };
    });
  }

  async function sendMediaPreviewBatch() {
    if (!mediaPreview || uploading) return;
    const { items, viewOnce, hd, caption } = mediaPreview;
    setMediaPreview(null);
    setUploading(true);
    try {
      for (let i = 0; i < items.length; i++) {
        const { file, kind } = items[i];
        const resourceType = kind === 'photo' ? 'image' : 'video';
        const uploadFile = kind === 'photo' && !hd ? await compressImageFile(file) : file;
        const url = await uploadToCloudinary(uploadFile, resourceType);
        const icon = kind === 'photo' ? '🖼️' : '▶️';
        const text = (i === 0 && caption.trim()) ? caption.trim() : `${icon} ${file.name}`;
        await sendRawMessage(text, {
          attachmentType: kind,
          mediaUrl: url,
          ...(viewOnce ? { viewOnce: true, openedBy: [] } : {}),
        });
      }
    } catch (err) {
      noticeDialog('Upload failed: ' + err.message);
    }
    items.forEach((it) => URL.revokeObjectURL(it.url));
    setUploading(false);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      discardRecordingRef.current = false;
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setPaused(false);
        if (discardRecordingRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setUploading(true);
        try {
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
          const url = await uploadToCloudinary(file, 'video');
          await sendRawMessage('🎤 Voice note', { attachmentType: 'voice', mediaUrl: url });
        } catch (err) {
          noticeDialog('Upload failed: ' + err.message);
        }
        setUploading(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (err) {
      noticeDialog('Microphone access denied or unavailable.');
    }
  }

  function stopRecording() {
    discardRecordingRef.current = false;
    mediaRecorderRef.current?.stop();
  }

  function pauseRecording() {
    mediaRecorderRef.current?.pause();
    setPaused(true);
  }

  function resumeRecording() {
    mediaRecorderRef.current?.resume();
    setPaused(false);
  }

  function discardRecording() {
    discardRecordingRef.current = true;
    mediaRecorderRef.current?.stop();
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!groupName.trim() || selectedIds.length === 0) return;
    const ref = await addDoc(collection(db, 'chats'), {
      type: 'group',
      name: groupName.trim(),
      participants: [...selectedIds, currentUser.uid],
      createdBy: currentUser.uid,
      admins: [currentUser.uid],
      onlyAdminsCanSend: false,
      pendingMembers: [],
      lastMessage: '',
      lastMessageAt: serverTimestamp(),
    });
    setGroupName(''); setSelectedIds([]); setShowNewGroup(false);
    setActiveChat({ type: 'group', chat: { id: ref.id, name: groupName.trim(), participants: [...selectedIds, currentUser.uid] } });
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function redialCall(call, callType) {
    const others = (call.participants || []).filter((id) => id !== currentUser.uid);
    if (others.some((id) => (currentProfile?.blocked || []).includes(id))) {
      noticeDialog('You can\u2019t call this user.');
      return;
    }
    startCall(others, callType || call.callType);
  }

  function startCallWithPerson(personId, callType) {
    if ((currentProfile?.blocked || []).includes(personId)) {
      noticeDialog('You can\u2019t call this user.');
      return;
    }
    setShowNewCall(false);
    startCall([personId], callType);
  }

  // ---- Per-message WhatsApp-style option handlers ----

  function openMessageMenu(m) {
    setReactingTo(null);
    setActiveMessageMenu((cur) => (cur === m.id ? null : m.id));
  }

  function startReply(m) {
    setReplyTo({
      id: m.id,
      text: m.text || `[${m.attachmentType || 'attachment'}]`,
      senderId: m.senderId,
      senderName: getSenderName(m.senderId),
    });
    setActiveMessageMenu(null);
  }

  function startForward(m) {
    setForwardingMessage(m);
    setShowForwardPicker(true);
    setActiveMessageMenu(null);
  }

  // Edit window mirrors common chat-app convention (WhatsApp uses 15 min) —
  // keeps someone from silently rewriting old conversation history. Enforced
  // both here (UX) and in firestore.rules (real enforcement).
  const EDIT_WINDOW_MS = 15 * 60 * 1000;

  function canEditMessage(m) {
    if (m.senderId !== currentUser.uid) return false;
    if (m.attachmentType) return false;
    if (!m.createdAt?.toMillis) return false;
    return Date.now() - m.createdAt.toMillis() < EDIT_WINDOW_MS;
  }

  function startEdit(m) {
    const { chatId } = getChatMeta();
    setEditingMessage({ id: m.id, chatId });
    setReplyTo(null);
    setText(m.text || '');
    setActiveMessageMenu(null);
  }

  function cancelEdit() {
    setEditingMessage(null);
    setText('');
  }

  async function toggleBlockPerson(personId, isCurrentlyBlocked) {
    if (!isCurrentlyBlocked && !(await confirmDialog('Block this person? They won\u2019t be able to message or call you.', { danger: true, confirmLabel: 'Block' }))) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        blocked: isCurrentlyBlocked ? arrayRemove(personId) : arrayUnion(personId),
      });
    } catch (err) {
      noticeDialog('Could not update block status: ' + (err.message || err));
    }
  }

  async function reactToMessage(m, emoji) {
    const { chatId } = getChatMeta();
    const already = (m.reactions?.[emoji] || []).includes(currentUser.uid);
    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', m.id), {
        [`reactions.${emoji}`]: already ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
      });
    } catch (err) {
      console.error(err);
    }
    setReactingTo(null);
    setActiveMessageMenu(null);
  }

  async function copyMessageText(m) {
    try {
      await navigator.clipboard.writeText(m.text || '');
    } catch (err) {
      // Clipboard API can fail without HTTPS/permissions — fail silently.
    }
    setActiveMessageMenu(null);
  }

  async function pinMessage(m) {
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), {
      pinnedMessageId: m.id,
      pinnedMessageText: m.text || `[${m.attachmentType || 'attachment'}]`,
    });
    setActiveMessageMenu(null);
  }

  async function unpinMessage() {
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), {
      pinnedMessageId: null,
      pinnedMessageText: null,
    });
  }

  async function deleteForMe(m) {
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId, 'messages', m.id), {
      deletedFor: arrayUnion(currentUser.uid),
    });
    setActiveMessageMenu(null);
  }

  async function deleteForEveryone(m) {
    if (m.senderId !== currentUser.uid) return;
    if (!(await confirmDialog('Delete this message for everyone?', { danger: true, confirmLabel: 'Delete' }))) return;
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId, 'messages', m.id), {
      text: '',
      mediaUrl: '',
      attachmentType: null,
      deletedForEveryone: true,
    });
    setActiveMessageMenu(null);
  }

  async function markViewOnceOpened(m) {
    setRevealedIds((prev) => new Set(prev).add(m.id));
    const { chatId } = getChatMeta();
    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', m.id), {
        openedBy: arrayUnion(currentUser.uid),
      });
    } catch (err) {
      console.error(err);
    }
  }

  // ---- Group admin control handlers ----

  async function toggleOnlyAdminsCanSend() {
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), {
      onlyAdminsCanSend: !chatMeta?.onlyAdminsCanSend,
    });
  }

  async function makeAdmin(uid) {
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), { admins: arrayUnion(uid) });
  }

  async function removeAdmin(uid) {
    if ((chatMeta?.admins || []).length <= 1) {
      noticeDialog('A group needs at least one admin.');
      return;
    }
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), { admins: arrayRemove(uid) });
  }

  // Admins add members directly; other members can only raise a request that
  // waits in pendingMembers until an admin approves it.
  async function requestAddMember(personId) {
    const { chatId } = getChatMeta();
    const isAdmin = (chatMeta?.admins || []).includes(currentUser.uid);
    if (isAdmin) {
      await updateDoc(doc(db, 'chats', chatId), { participants: arrayUnion(personId) });
    } else {
      await updateDoc(doc(db, 'chats', chatId), { pendingMembers: arrayUnion(personId) });
    }
    setShowAddMemberList(false);
  }

  async function approveMember(uid) {
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), {
      participants: arrayUnion(uid),
      pendingMembers: arrayRemove(uid),
    });
  }

  async function rejectMember(uid) {
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), { pendingMembers: arrayRemove(uid) });
  }

  // ---- Disappearing messages ----

  function canChangeDisappearing() {
    if (!activeChat) return false;
    if (activeChat.type === 'direct') return true;
    return (chatMeta?.admins || []).includes(currentUser.uid);
  }

  async function setDisappearingSeconds(seconds) {
    if (!canChangeDisappearing()) return;
    const { chatId } = getChatMeta();
    await updateDoc(doc(db, 'chats', chatId), { disappearingSeconds: seconds });
    setShowDisappearingMenu(false);
  }

  // ---- Forward message ----

  async function sendToTarget(target, body, extra = {}) {
    const isGroup = target.type === 'group';
    const chatId = isGroup ? target.chat.id : chatIdFor(currentUser.uid, target.person.id);
    const participants = isGroup ? target.chat.participants : [currentUser.uid, target.person.id].sort();
    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chatId), {
      type: isGroup ? 'group' : 'direct',
      participants,
      ...(isGroup ? { name: target.chat.name } : {}),
      lastMessage: body || `[${extra.attachmentType || 'attachment'}]`,
      lastMessageAt: serverTimestamp(),
    }, { merge: true });
    batch.set(doc(collection(db, 'chats', chatId, 'messages')), {
      senderId: currentUser.uid,
      text: body,
      createdAt: serverTimestamp(),
      readBy: [],
            deliveredTo: [],
      reactions: {},
      deletedFor: [],
      forwarded: true,
      ...extra,
    });
    batch.set(doc(db, 'rateLimits', currentUser.uid), { lastMessageAt: serverTimestamp() }, { merge: true });
    await batch.commit();
    notifyOthers(participants, body, isGroup, target.chat?.name);
  }

  async function forwardTo(target) {
    if (!forwardingMessage) return;
    const { text: t, attachmentType, mediaUrl, poll, event } = forwardingMessage;
    try {
      await sendToTarget(target, t || '', {
        ...(attachmentType ? { attachmentType } : {}),
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(poll ? { poll: { ...poll, votes: {} } } : {}),
        ...(event ? { event: { ...event, going: [] } } : {}),
      });
      setForwardingMessage(null);
      setShowForwardPicker(false);
    } catch (err) {
      noticeDialog('Could not forward: ' + err.message);
    }
  }

  // ---- Top bar menu: wallpaper / clear chat / mute ----

  function selectWallpaper(key) {
    if (!activeChat) return;
    const { chatId } = getChatMeta();
    localStorage.setItem(`wallpaper_${chatId}`, key);
    setWallpaperKey(key);
    setShowWallpaperPicker(false);
  }

  async function clearChatForMe() {
    if (!(await confirmDialog('Clear this chat? Messages will be hidden only for you.', { danger: true, confirmLabel: 'Clear' }))) return;
    const { chatId } = getChatMeta();
    try {
      await Promise.all(
        messages.map((m) =>
          updateDoc(doc(db, 'chats', chatId, 'messages', m.id), { deletedFor: arrayUnion(currentUser.uid) })
        )
      );
    } catch (err) {
      noticeDialog('Could not clear chat: ' + err.message);
    }
    setShowChatMenu(false);
  }

  async function toggleMute() {
    const { chatId } = getChatMeta();
    const isMuted = (chatMeta?.mutedBy || []).includes(currentUser.uid);
    await updateDoc(doc(db, 'chats', chatId), {
      mutedBy: isMuted ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
    });
  }

  if (activeChat) {
    const name = activeChat.type === 'direct' ? activeChat.person.name : activeChat.chat.name;
    const photoURL = activeChat.type === 'direct' ? activeChat.person.photoURL : null;
    const { participants } = getChatMeta();
    const otherParticipantId = activeChat.type === 'direct'
      ? participants.find((id) => id !== currentUser.uid)
      : null;
    const { chatId: currentChatId } = getChatMeta();
    const pendingForThisChat = myScheduledMessages.filter((m) => m.chatId === currentChatId);
    const visibleMessages = messages
      .filter((m) => !(m.deletedFor || []).includes(currentUser.uid))
      .filter((m) => !searchQuery.trim() || (m.text || '').toLowerCase().includes(searchQuery.trim().toLowerCase()));
    const isAdmin = activeChat.type === 'group' && (chatMeta?.admins || []).includes(currentUser.uid);
    const sendBlocked = activeChat.type === 'group' && chatMeta?.onlyAdminsCanSend && !isAdmin;
    const groupParticipantIds = activeChat.type === 'group' ? (chatMeta?.participants || activeChat.chat.participants || []) : [];
    const addableConnections = connectedPeople.filter((p) => !groupParticipantIds.includes(p.id) && !(chatMeta?.pendingMembers || []).includes(p.id));
    const isMuted = (chatMeta?.mutedBy || []).includes(currentUser.uid);
    const isOnline = otherPresence?.lastSeen?.toMillis && (Date.now() - otherPresence.lastSeen.toMillis() < ONLINE_THRESHOLD_MS);
    const statusLabel = activeChat.type === 'direct'
      ? (otherPresence?.lastSeen ? (isOnline ? 'Online' : `Last seen ${timeAgo(otherPresence.lastSeen)} ago`) : '')
      : '';
    const typingLabel = activeChat.type === 'direct'
      ? (typingUserIds.includes(activeChat.person.id) ? 'typing…' : '')
      : (typingUserIds.length > 0
          ? `${typingUserIds.map((uid) => (people.find((p) => p.id === uid)?.name || 'Someone').split(' ')[0]).join(', ')} typing…`
          : '');
    const wallpaper = WALLPAPER_OPTIONS.find((w) => w.key === wallpaperKey) || WALLPAPER_OPTIONS[0];
    const forwardTargets = [
      ...connectedPeople.map((p) => ({ type: 'direct', person: p, label: p.name })),
      ...groupChats.map((c) => ({ type: 'group', chat: c, label: c.name })),
    ];

    return (
      <div className="chat-thread">
        {modalElement}
        {mediaPreview && createPortal(
          <div style={{
            position: 'fixed', inset: 0, width: '100vw', height: '100dvh', background: '#000', zIndex: 2147483000,
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Top bar — close (left), page counter (center-right), HD badge (right), like WhatsApp's send preview */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              padding: '14px 14px 22px', flexShrink: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))',
            }}>
              <button type="button" onClick={closeMediaPreview} title="Close"
                style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', cursor: 'pointer',
                }}><IconX className="w-4 h-4" /></button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {mediaPreview.items.length > 1 && (
                  <span style={{
                    color: '#fff', fontSize: 12.5, fontWeight: 600, background: 'rgba(255,255,255,0.14)',
                    borderRadius: 999, padding: '4px 10px',
                  }}>
                    {mediaPreview.activeIndex + 1} / {mediaPreview.items.length}
                  </span>
                )}
                {mediaPreview.items[mediaPreview.activeIndex]?.kind === 'photo' && (
                  <button type="button" onClick={() => setMediaPreview((mp) => ({ ...mp, hd: !mp.hd }))}
                    title="HD — send full quality (larger file)"
                    style={{
                      border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
                      fontSize: 12.5, fontWeight: 800, letterSpacing: 0.3,
                      background: mediaPreview.hd ? '#4f7fff' : 'rgba(255,255,255,0.14)', color: '#fff',
                    }}>HD</button>
                )}
              </div>
            </div>

            {/* Media */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', minHeight: 0 }}>
              {mediaPreview.items[mediaPreview.activeIndex]?.kind === 'photo' ? (
                <img src={mediaPreview.items[mediaPreview.activeIndex].url} alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <video src={mediaPreview.items[mediaPreview.activeIndex]?.url} controls
                  style={{ maxWidth: '100%', maxHeight: '100%' }} />
              )}
            </div>

            {/* Bottom area — gradient backdrop holding thumbnails + toggles + caption + send */}
            <div style={{ flexShrink: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.15) 70%, transparent)', paddingTop: 10 }}>
              {mediaPreview.items.length > 1 && (
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 12px 10px' }}>
                  {mediaPreview.items.map((it, i) => (
                    <div key={i} style={{ position: 'relative', flex: '0 0 auto' }}>
                      <button type="button" onClick={() => setMediaPreview((mp) => ({ ...mp, activeIndex: i }))}
                        style={{
                          width: 48, height: 48, borderRadius: 10, overflow: 'hidden', padding: 0,
                          border: i === mediaPreview.activeIndex ? '2px solid #fff' : '2px solid transparent',
                          opacity: i === mediaPreview.activeIndex ? 1 : 0.55,
                          background: '#111', cursor: 'pointer', transition: 'opacity 120ms, border-color 120ms',
                        }}>
                        {it.kind === 'photo'
                          ? <img src={it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <video src={it.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </button>
                      <button type="button" onClick={() => removeMediaPreviewItem(i)} title="Remove"
                        style={{
                          position: 'absolute', top: -5, right: -5, width: 17, height: 17, borderRadius: '50%',
                          border: '1.5px solid #000', background: '#e5484d', color: '#fff',
                          padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><IconX className="w-2.5 h-2.5" /></button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px 14px' }}>
                <button type="button" onClick={() => setMediaPreview((mp) => ({ ...mp, viewOnce: !mp.viewOnce }))}
                  title="View once — disappears after it's opened"
                  style={{
                    flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: 'none', cursor: 'pointer',
                    background: mediaPreview.viewOnce ? '#4f7fff' : 'rgba(255,255,255,0.14)', color: '#fff',
                  }}><IconEye className="w-4 h-4" /></button>
                <input
                  type="text" placeholder="Add a caption"
                  value={mediaPreview.caption}
                  onChange={(e) => setMediaPreview((mp) => ({ ...mp, caption: e.target.value }))}
                  style={{
                    flex: '1 1 auto', minWidth: 0, background: 'rgba(255,255,255,0.14)', border: 'none', borderRadius: 22,
                    padding: '10px 16px', color: '#fff', fontSize: 14.5,
                  }}
                />
                <button type="button" onClick={sendMediaPreviewBatch} disabled={uploading}
                  title="Send"
                  style={{
                    flexShrink: 0, border: 'none', borderRadius: '50%', width: 44, height: 44, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#4f7fff', color: '#fff', opacity: uploading ? 0.6 : 1,
                    boxShadow: '0 2px 8px rgba(79,127,255,0.45)',
                  }}><IconSend className="w-4 h-4" /></button>
              </div>
              {mediaPreview.viewOnce && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 11.5, paddingBottom: 10 }}>
                  <IconEye className="w-3 h-3" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Photo will disappear after it's opened
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
        <div className="chat-thread-header">
          <div
            className="avatar"
            onClick={() => activeChat.type === 'direct' && navigate(`/profile/${activeChat.person.id}`)}
            style={{ cursor: activeChat.type === 'direct' ? 'pointer' : 'default' }}
          >
            {photoURL ? <img src={photoURL} alt="" /> : (name?.[0] || '?')}
          </div>
          <div
            onClick={() => activeChat.type === 'direct' && navigate(`/profile/${activeChat.person.id}`)}
            style={{ cursor: activeChat.type === 'direct' ? 'pointer' : 'default' }}
          >
            <div className="chat-thread-name">{name}{isAdmin && <IconCrown className="w-3.5 h-3.5" style={{ display: 'inline', marginLeft: 4, color: '#f5c542' }} />}</div>
            {(typingLabel || statusLabel) && (
              <div className="chat-thread-status" style={typingLabel ? { color: '#4f7fff', fontStyle: 'italic' } : undefined}>
                {typingLabel || statusLabel}
              </div>
            )}
          </div>
          <div className="chat-call-actions">
            {activeChat.type === 'direct' && (
              <>
                <button className="chat-call-btn" disabled={isBlockedEitherWay}
                  onClick={() => startCallWithPerson(activeChat.person.id, 'audio')}
                  title="Voice call"><IconPhone className="w-4 h-4" /></button>
                <button className="chat-call-btn" disabled={isBlockedEitherWay}
                  onClick={() => startCallWithPerson(activeChat.person.id, 'video')}
                  title="Video call"><IconVideo className="w-4 h-4" /></button>
              </>
            )}
            {activeChat.type === 'group' && (
              <button className="chat-call-btn" onClick={() => setShowManageGroup((v) => !v)} title={t('chat.manageGroup')}><IconSettings className="w-4 h-4" /></button>
            )}
            <button className="chat-call-btn" onClick={() => setShowChatMenu((v) => !v)} title={t('chat.moreOptions')}><IconMoreVertical className="w-4 h-4" /></button>
          </div>
        </div>

        {showChatMenu && (
          <div className="chat-dropdown-menu">
            <button className="attach-item" onClick={() => { setShowSearchBar((v) => !v); setShowChatMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconSearch className="w-4 h-4" /> {t('chat.searchInChat')}</button>
            <button className="attach-item" onClick={() => { setShowWallpaperPicker((v) => !v); setShowChatMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconImage className="w-4 h-4" /> {t('chat.wallpaper')}</button>
            <button className="attach-item" onClick={() => { setShowDisappearingMenu((v) => !v); setShowChatMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconClock className="w-4 h-4" /> {t('chat.disappearing')}</button>
            <button className="attach-item" onClick={clearChatForMe} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconTrash2 className="w-4 h-4" /> {t('chat.clearChat')}</button>
            <button className="attach-item" onClick={() => { toggleMute(); setShowChatMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isMuted ? (<><IconBell className="w-4 h-4" /> {t('chat.unmute')}</>) : (<><IconBellOff className="w-4 h-4" /> {t('chat.mute')}</>)}
            </button>
            {activeChat.type === 'direct' && (
              <>
                <button
                  className="attach-item"
                  onClick={() => {
                    setShowChatMenu(false);
                    toggleBlockPerson(activeChat.person.id, (currentProfile?.blocked || []).includes(activeChat.person.id));
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {(currentProfile?.blocked || []).includes(activeChat.person.id)
                    ? (<><IconCheck className="w-4 h-4" /> Unblock</>)
                    : (<><IconBan className="w-4 h-4" /> Block</>)} {activeChat.person.name}
                </button>
                <button className="attach-item" onClick={() => { setReportingPerson(true); setShowChatMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconFlag className="w-4 h-4" /> Report {activeChat.person.name}</button>
              </>
            )}
          </div>
        )}

        {showSearchBar && (
          <div style={{ padding: '6px 12px' }}>
            <input
              type="text"
              placeholder="Search in this chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
              autoFocus
            />
          </div>
        )}

        {showWallpaperPicker && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
            {WALLPAPER_OPTIONS.map((w) => (
              <button
                key={w.key}
                className="btn btn-ghost btn-sm"
                onClick={() => selectWallpaper(w.key)}
                style={{ border: wallpaperKey === w.key ? '2px solid #4f7fff' : '1px solid #00000020' }}
              >
                {w.label}
              </button>
            ))}
          </div>
        )}

        {showDisappearingMenu && (
          <div style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap', fontSize: 13 }}>
            {!canChangeDisappearing() && <span style={{ opacity: 0.7 }}>Only group admins can change this.</span>}
            {canChangeDisappearing() && DISAPPEARING_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                className="btn btn-ghost btn-sm"
                onClick={() => setDisappearingSeconds(opt.key)}
                style={{ border: (chatMeta?.disappearingSeconds || 0) === opt.key ? '2px solid #4f7fff' : '1px solid #00000020' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {chatMeta?.disappearingSeconds > 0 && (
          <div style={{ padding: '4px 12px', fontSize: 12, opacity: 0.7 }}>
            <IconClock className="w-4 h-4" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} /> Disappearing messages: {DISAPPEARING_OPTIONS.find((o) => o.key === chatMeta.disappearingSeconds)?.label || 'On'}
          </div>
        )}

        {activeChat.type === 'group' && showManageGroup && (
          <div className="group-settings-panel">
            <label className="group-settings-checkbox-row">
              <input
                type="checkbox"
                checked={!!chatMeta?.onlyAdminsCanSend}
                onChange={toggleOnlyAdminsCanSend}
                disabled={!isAdmin}
              />
              Only admins can send messages
            </label>

            <div className="group-settings-block">
              <strong>Members</strong>
              {groupParticipantIds.map((uid) => {
                const p = uid === currentUser.uid
                  ? { id: uid, name: 'You' }
                  : people.find((pp) => pp.id === uid) || { id: uid, name: 'Member' };
                const memberIsAdmin = (chatMeta?.admins || []).includes(uid);
                return (
                  <div className="group-member-row" key={uid}>
                    <span className="member-name">{p.name}{memberIsAdmin && <IconCrown className="w-3.5 h-3.5" style={{ display: 'inline', marginLeft: 4, color: '#f5c542' }} />}</span>
                    {isAdmin && uid !== currentUser.uid && (
                      memberIsAdmin
                        ? <button className="btn btn-ghost btn-sm" onClick={() => removeAdmin(uid)}>Remove admin</button>
                        : <button className="btn btn-ghost btn-sm" onClick={() => makeAdmin(uid)}>Make admin</button>
                    )}
                  </div>
                );
              })}
            </div>

            {isAdmin && (chatMeta?.pendingMembers || []).length > 0 && (
              <div className="group-settings-block">
                <strong>Pending requests</strong>
                {(chatMeta.pendingMembers || []).map((uid) => {
                  const p = people.find((pp) => pp.id === uid) || { id: uid, name: 'Member' };
                  return (
                    <div className="group-member-row" key={uid}>
                      <span className="member-name">{p.name}</span>
                      <span style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => approveMember(uid)}>Approve</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => rejectMember(uid)}>Reject</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="group-settings-block">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddMemberList((v) => !v)}>
                {showAddMemberList ? 'Cancel' : '+ Add member'}
              </button>
              {showAddMemberList && (
                <div style={{ marginTop: 8 }}>
                  {addableConnections.length === 0 && (
                    <div className="group-settings-empty">No connections left to add.</div>
                  )}
                  {addableConnections.map((p) => (
                    <div className="group-member-row" key={p.id}>
                      <span className="member-name">{p.name}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => requestAddMember(p.id)}>
                        {isAdmin ? 'Add' : 'Request'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {chatMeta?.pinnedMessageId && (
          <div className="pinned-banner" style={{ padding: '8px 12px', background: '#f9731622', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconMapPin className="w-3.5 h-3.5" /> {chatMeta.pinnedMessageText}</span>
            <button className="btn btn-ghost btn-sm" onClick={unpinMessage}>Unpin</button>
          </div>
        )}

        {pendingForThisChat.length > 0 && (
          <div className="scheduled-banner" style={{ padding: '8px 12px', background: '#4f7fff15', fontSize: 13 }}>
            {pendingForThisChat.map((m) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconClock className="w-3.5 h-3.5" /> "{m.text}" — {formatScheduledFor(m.scheduledFor)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => cancelScheduledMessage(m.id)}>Cancel</button>
              </div>
            ))}
          </div>
        )}

        <div className="chat-messages" style={{ background: wallpaper.bg }}>
          {hasMoreOlder && !searchQuery.trim() && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <button className="btn btn-ghost btn-sm" onClick={loadOlderMessages} disabled={loadingOlder}>
                {loadingOlder ? 'Loading…' : (<><IconChevronUp className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Load older messages</>)}
              </button>
            </div>
          )}
          {visibleMessages.map((m) => {
            const isMine = m.senderId === currentUser.uid;
            const reactionEntries = Object.entries(m.reactions || {}).filter(([, uids]) => uids?.length);
            const isRead = activeChat.type === 'direct' && otherParticipantId && (m.readBy || []).includes(otherParticipantId);
            const isDelivered = activeChat.type === 'direct' && otherParticipantId && (m.deliveredTo || []).includes(otherParticipantId);
            const isViewOnceMedia = m.viewOnce && (m.attachmentType === 'photo' || m.attachmentType === 'video');
            const openedByMe = (m.openedBy || []).includes(currentUser.uid);
            const revealedNow = revealedIds.has(m.id);

            return (
              <div key={m.id} className={'chat-bubble' + (isMine ? ' mine' : '')}>
                {activeChat.type === 'group' && !isMine && (
                  <div className="chat-bubble-sender" style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, marginBottom: 2 }}>
                    {getSenderName(m.senderId)}
                  </div>
                )}

                {m.forwarded && (
                  <div style={{ fontSize: 11, opacity: 0.6, fontStyle: 'italic', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}><IconCornerUpRight className="w-3 h-3" /> Forwarded</div>
                )}

                {m.replyTo && (
                  <div className="chat-reply-preview" style={{ borderLeft: '3px solid currentColor', paddingLeft: 8, opacity: 0.7, fontSize: 12, marginBottom: 4 }}>
                    <strong>{m.replyTo.senderId === currentUser.uid ? 'You' : m.replyTo.senderName}</strong>: {m.replyTo.text}
                  </div>
                )}

                {m.deletedForEveryone ? (
                  <div style={{ fontStyle: 'italic', opacity: 0.6, display: 'flex', alignItems: 'center', gap: 5 }}><IconBan className="w-3.5 h-3.5" /> This message was deleted</div>
                ) : (
                  <>
                    {isViewOnceMedia ? (
                      isMine ? (
                        <div style={{ position: 'relative' }}>
                          {m.attachmentType === 'photo'
                            ? <img src={m.mediaUrl} alt="" className="chat-media-img" />
                            : <video src={m.mediaUrl} controls className="chat-media-video" />}
                          <div style={{ fontSize: 11, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 4 }}><IconEye className="w-3.5 h-3.5" /> View once{(m.openedBy || []).length ? ' · Opened' : ''}</div>
                        </div>
                      ) : (revealedNow ? (
                        m.attachmentType === 'photo'
                          ? <img src={m.mediaUrl} alt="" className="chat-media-img" />
                          : <video src={m.mediaUrl} controls autoPlay className="chat-media-video" />
                      ) : openedByMe ? (
                        <div className="btn btn-ghost btn-sm" style={{ opacity: 0.6, display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconLock className="w-3.5 h-3.5" /> Opened</div>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={() => markViewOnceOpened(m)}>
                          <IconEye className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Tap to view once
                        </button>
                      ))
                    ) : (
                      <>
                        {m.attachmentType === 'photo' && m.mediaUrl && (
                          <img src={m.mediaUrl} alt="" className="chat-media-img" onClick={() => openMessageMenu(m)} />
                        )}
                        {m.attachmentType === 'video' && m.mediaUrl && (
                          <video src={m.mediaUrl} controls className="chat-media-video" />
                        )}
                        {m.attachmentType === 'voice' && m.mediaUrl && (
                          <audio src={m.mediaUrl} controls className="chat-media-audio" />
                        )}
                        {m.attachmentType === 'document' && m.mediaUrl && (
                          <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="chat-media-doc">{m.text}</a>
                        )}
                      </>
                    )}

                    {m.attachmentType === 'poll' && m.poll && (
                      <div className="poll-card" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconBarChart className="w-4 h-4" /> {m.poll.question}</strong>
                        {m.poll.options.map((opt, idx) => {
                          const voters = m.poll.votes?.[String(idx)] || [];
                          const iVoted = voters.includes(currentUser.uid);
                          return (
                            <button
                              key={idx}
                              className="btn btn-ghost btn-sm"
                              onClick={() => votePoll(m, idx)}
                              style={{ justifyContent: 'space-between', display: 'flex', border: iVoted ? '2px solid #4f7fff' : '1px solid #00000020' }}
                            >
                              <span>{opt}</span>
                              <span>{voters.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {m.attachmentType === 'event' && m.event && (
                      <div className="event-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><IconCalendar className="w-4 h-4" /> {m.event.title}</strong>
                        {m.event.when && <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconClock className="w-3 h-3" /> {m.event.when}</span>}
                        {m.event.location && <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconMapPin className="w-3 h-3" /> {m.event.location}</span>}
                        <button className="btn btn-sm btn-primary" onClick={() => toggleGoingEvent(m)}>
                          {(m.event.going || []).includes(currentUser.uid) ? (<><IconCheck className="w-3.5 h-3.5" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Going</>) : 'Mark as going'}
                          {' '}({(m.event.going || []).length})
                        </button>
                      </div>
                    )}

                    {(!m.attachmentType || m.attachmentType === 'location' || m.attachmentType === 'profile') && (
                      <div onClick={() => openMessageMenu(m)} style={{ cursor: 'pointer' }}>
                        {renderFormattedText(m.text)}
                        {m.edited && <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 6 }}>(edited)</span>}
                      </div>
                    )}
                  </>
                )}

                {reactionEntries.length > 0 && (
                  <div className="chat-reactions-row" style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {reactionEntries.map(([emoji, uids]) => (
                      <span key={emoji} className="reaction-badge" style={{ fontSize: 12, background: '#00000010', borderRadius: 10, padding: '1px 6px' }}>
                        {emoji} {uids.length}
                      </span>
                    ))}
                  </div>
                )}

                <div className="chat-bubble-time" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {timeAgo(m.createdAt)}
                  {isMine && activeChat.type === 'direct' && (
                    <span style={{ color: isRead ? '#4f7fff' : 'inherit', display: 'inline-flex' }}>{isDelivered ? <IconCheckCheck className="w-3.5 h-3.5" /> : <IconCheck className="w-3.5 h-3.5" />}</span>
                  )}
                  {isMine && activeChat.type === 'group' && <span style={{ display: 'inline-flex' }}><IconCheck className="w-3.5 h-3.5" /></span>}
                </div>

                {!m.deletedForEveryone && activeMessageMenu === m.id && (
                  <div className="msg-options-menu" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, background: '#00000010', borderRadius: 8, padding: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => startReply(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCornerUpLeft className="w-4 h-4" /> Reply</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => startForward(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCornerUpRight className="w-4 h-4" /> Forward</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setReactingTo(reactingTo === m.id ? null : m.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconSmile className="w-4 h-4" /> React</button>
                    {m.text && <button className="btn btn-ghost btn-sm" onClick={() => copyMessageText(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconCopy className="w-4 h-4" /> Copy</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => pinMessage(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconMapPin className="w-4 h-4" /> Pin</button>
                    {canEditMessage(m) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconEdit className="w-4 h-4" /> Edit</button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteForMe(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconTrash2 className="w-4 h-4" /> Delete for me</button>
                    {isMine && (
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteForEveryone(m)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconBan className="w-4 h-4" /> Delete for everyone</button>
                    )}
                    {!isMine && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { setReportingMessage(m); setActiveMessageMenu(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconFlag className="w-4 h-4" /> Report</button>
                    )}
                  </div>
                )}

                {reactingTo === m.id && (
                  <div className="reaction-picker-row" style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {REACTION_EMOJIS.map((emoji) => (
                      <button key={emoji} className="btn btn-ghost btn-sm" onClick={() => reactToMessage(m, emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {uploading && <div className="chat-bubble mine chat-bubble-uploading">Uploading…</div>}
        </div>

        {showForwardPicker && (
          <div className="forward-picker" style={{ display: 'flex', flexDirection: 'column', background: '#00000015', maxHeight: 220, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: 13 }}>
              <strong>Forward to...</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowForwardPicker(false); setForwardingMessage(null); }}><IconX className="w-4 h-4" /></button>
            </div>
            {forwardTargets.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => forwardTo(t)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <span className="avatar" style={{ width: 22, height: 22, fontSize: 12 }}>
                  {t.type === 'group' ? <IconUsers className="w-4 h-4" /> : (t.person.photoURL ? <img src={t.person.photoURL} alt="" /> : (t.label?.[0] || '?'))}
                </span>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {reportingMessage && (
          <ReportDialog
            targetType="message"
            targetId={reportingMessage.id}
            extra={{
              chatId: getChatMeta().chatId,
              messageText: (reportingMessage.text || '').slice(0, 200),
              messageSenderId: reportingMessage.senderId,
            }}
            onClose={() => setReportingMessage(null)}
            onSubmitted={() => noticeDialog('Report submitted. Thanks for flagging this.')}
          />
        )}

        {reportingPerson && activeChat.type === 'direct' && (
          <ReportDialog
            targetType="user"
            targetId={activeChat.person.id}
            onClose={() => setReportingPerson(false)}
            onSubmitted={() => noticeDialog('Report submitted. Thanks for flagging this.')}
          />
        )}

        {recording && (
          <div className="recording-bar" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="recording-dot" /> {paused ? 'Recording paused' : 'Recording voice note…'}
            {!paused
              ? <button className="btn btn-sm btn-ghost" onClick={pauseRecording} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconLock className="w-4 h-4" /> Lock &amp; Pause</button>
              : <button className="btn btn-sm btn-ghost" onClick={resumeRecording}>▶️ Resume</button>}
            <button className="btn btn-sm btn-ghost" onClick={discardRecording} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconTrash2 className="w-4 h-4" /> Discard</button>
            <button className="btn btn-sm btn-primary" onClick={stopRecording}>Stop &amp; Send</button>
          </div>
        )}

        {showQuickReplies && (
          <div className="quick-reply-row">
            {QUICK_REPLIES.map((qr) => (
              <button key={qr} className="quick-reply-chip" onClick={() => { sendRawMessage(qr); setShowQuickReplies(false); }}>
                {qr}
              </button>
            ))}
            <button className="quick-reply-chip quick-reply-close" onClick={() => setShowQuickReplies(false)}><IconX className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {showScheduleForm && (
          <form className="attach-menu" onSubmit={submitScheduleForm} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
            <textarea
              placeholder="Message to send later..."
              value={scheduleText}
              onChange={(e) => setScheduleText(e.target.value)}
              rows={2}
            />
            <input
              type="datetime-local"
              value={scheduleWhen}
              onChange={(e) => setScheduleWhen(e.target.value)}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowScheduleForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary btn-sm">Schedule</button>
            </div>
          </form>
        )}

        {showAttach && (
          <div className="attach-menu">
            {ATTACH_OPTIONS.map((opt) => (
              <button key={opt.key} className="attach-item" onClick={() => handleAttachClick(opt.key)}>
                <span className="attach-icon" style={{ background: opt.color + '22', color: opt.color }}>
                  {opt.icon}
                </span>
                <span className="attach-label">{opt.label}</span>
              </button>
            ))}
          </div>
        )}

        <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChosen} />

        {replyTo && (
          <div className="reply-preview-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderLeft: '3px solid #4f7fff', background: '#4f7fff10', fontSize: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconCornerUpLeft className="w-3.5 h-3.5" /> Replying to <strong>{replyTo.senderId === currentUser.uid ? 'yourself' : replyTo.senderName}</strong>: {replyTo.text}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReplyTo(null)}><IconX className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {editingMessage && (
          <div className="reply-preview-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderLeft: '3px solid #ffa500', background: '#ffa50010', fontSize: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconEdit className="w-3.5 h-3.5" /> Editing message</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit}><IconX className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {sendBlocked || isBlockedEitherWay || isRestrictedByWhoCanMessage ? (
          <div className="only-admins-notice" style={{ padding: '10px 12px', textAlign: 'center', fontSize: 13, opacity: 0.75 }}>
            {isBlockedEitherWay
              ? (<><IconBan className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />You can\u2019t message this user.</>)
              : isRestrictedByWhoCanMessage
                ? (<><IconLock className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />This person only accepts messages from connections.</>)
                : (<><IconLock className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Only admins can send messages in this group.</>)}
          </div>
        ) : (
          <>
            {showMentionPicker && (
              <div className="mention-picker" style={{ display: 'flex', flexDirection: 'column', background: '#00000010', borderRadius: 8, margin: '0 12px', overflow: 'hidden' }}>
                {mentionCandidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="mention-picker-item"
                    onClick={() => insertMention(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <span className="avatar" style={{ width: 22, height: 22, fontSize: 12 }}>
                      {p.photoURL ? <img src={p.photoURL} alt="" /> : (p.name?.[0] || '?')}
                    </span>
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            <form className="chat-input-row" onSubmit={sendMessage}>
              <button type="button" className="chat-attach-btn" onClick={() => setShowAttach((v) => !v)}>
                {showAttach ? <IconX className="w-5 h-5" /> : <IconPlus className="w-5 h-5" />}
              </button>
              <input
                type="text"
                placeholder={t('chat.typeMessage')}
                value={text}
                onChange={handleTextChange}
              />
              <button type="submit" className="btn btn-primary btn-sm">{t('chat.send')}</button>
            </form>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="chat-page">
      {modalElement}
      <StatusTray />

      <div className="chat-list-tabs">
        <button
          type="button"
          className={'chat-list-tab' + (listTab === 'chats' ? ' active' : '')}
          onClick={() => setListTab('chats')}
        >
          <IconMessage className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Chats
        </button>
        <button
          type="button"
          className={'chat-list-tab' + (listTab === 'groups' ? ' active' : '')}
          onClick={() => setListTab('groups')}
        >
          <IconUsers className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Groups{groupChats.length > 0 ? ` ${groupChats.length}` : ''}
        </button>
        <button
          type="button"
          className={'chat-list-tab' + (listTab === 'calls' ? ' active' : '')}
          onClick={() => setListTab('calls')}
        >
          <IconPhone className="w-4 h-4" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />Calls
        </button>
        <button
          type="button"
          className="chat-list-tab-add"
          onClick={() => (listTab === 'calls' ? setShowNewCall((v) => !v) : setShowNewGroup((v) => !v))}
          title={listTab === 'calls' ? 'New call' : 'New group chat'}
        >
          {(listTab === 'calls' ? showNewCall : showNewGroup) ? <IconX className="w-5 h-5" /> : <IconPlus className="w-5 h-5" />}
        </button>
      </div>

      {listTab !== 'calls' && (
        <div className="chat-search-wrap">
          <input
            type="text"
            placeholder={listTab === 'groups' ? 'Search groups...' : 'Search chats...'}
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
        </div>
      )}

      {showNewCall && (
        <div className="card">
          <div className="form-field" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12.5, color: 'var(--muted)' }}>Start a new call</label>
          </div>
          <div className="group-select-list">
            {connectedPeople.length === 0 && <div className="empty-state">Connect with someone first to call them.</div>}
            {connectedPeople.map((p) => (
              <div key={p.id} className="chat-row" style={{ cursor: 'default' }}>
                <div className="chat-row-avatar">
                  {p.photoURL ? <img src={p.photoURL} alt="" /> : (p.name?.[0] || '?')}
                </div>
                <div className="chat-row-body">
                  <span className="chat-row-name">{p.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="chat-call-btn" title="Voice call" onClick={() => startCallWithPerson(p.id, 'audio')}><IconPhone className="w-4 h-4" /></button>
                  <button type="button" className="chat-call-btn" title="Video call" onClick={() => startCallWithPerson(p.id, 'video')}><IconVideo className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showNewGroup && (
        <form className="card" onSubmit={createGroup}>
          <div className="form-field">
            <input type="text" placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div className="group-select-list">
            {connectedPeople.map((p) => (
              <label key={p.id} className="group-select-item">
                <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
          <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>Create group</button>
        </form>
      )}

      {listTab === 'groups' && (
        <div className="chat-list">
          {filteredGroupChats.length === 0 && (
            <div className="empty-state">
              {groupChats.length === 0 ? 'No groups yet — tap + to start one.' : 'No groups match your search.'}
            </div>
          )}
          {filteredGroupChats.map((chat) => (
            <div className="chat-row" key={chat.id} onClick={() => setActiveChat({ type: 'group', chat })}>
              <div className="chat-row-avatar"><IconUsers className="w-5 h-5" /></div>
              <div className="chat-row-body">
                <div className="chat-row-top">
                  <span className="chat-row-name">{chat.name}</span>
                  {chat.lastMessageAt && <span className="chat-list-time">{timeAgo(chat.lastMessageAt)}</span>}
                </div>
                <div className="chat-row-bottom">
                  <span className="chat-row-preview">{chat.lastMessage || 'No messages yet'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {listTab === 'chats' && (
        <div className="chat-list">
          {sortedDirectList.length === 0 && (
            <div className="empty-state">
              {connectedPeople.length === 0 ? 'Connect with people in Network to start chatting.' : 'No chats match your search.'}
            </div>
          )}
          {sortedDirectList.map(({ person, chatDoc }) => (
            <div className="chat-row" key={person.id} onClick={() => setActiveChat({ type: 'direct', person })}>
              <div className="chat-row-avatar">
                {person.photoURL ? <img src={person.photoURL} alt="" /> : (person.name?.[0] || '?')}
              </div>
              <div className="chat-row-body">
                <div className="chat-row-top">
                  <span className="chat-row-name">{person.name}</span>
                  {chatDoc?.lastMessageAt && <span className="chat-list-time">{timeAgo(chatDoc.lastMessageAt)}</span>}
                </div>
                <div className="chat-row-bottom">
                  <span className="chat-row-preview">{chatDoc?.lastMessage || person.headline || 'Tap to start chatting'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {listTab === 'calls' && (
        <div className="chat-list">
          <div className="call-filter-row">
            {[
              { key: 'all', label: 'All calls' },
              { key: 'missed', label: 'Missed' },
              { key: 'incoming', label: 'Incoming' },
              { key: 'outgoing', label: 'Outgoing' },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                className={'call-filter-chip' + (callFilter === f.key ? ' active' : '')}
                onClick={() => setCallFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {callLog
            .filter((call) => {
              const isOutgoing = call.initiatedBy === currentUser.uid;
              const isMissed = !isOutgoing && !call.answeredAt;
              if (callFilter === 'missed') return isMissed;
              if (callFilter === 'incoming') return !isOutgoing;
              if (callFilter === 'outgoing') return isOutgoing;
              return true;
            })
            .length === 0 && (
            <div className="empty-state">No calls in this filter yet.</div>
          )}
          {callLog
            .filter((call) => {
              const isOutgoing = call.initiatedBy === currentUser.uid;
              const isMissed = !isOutgoing && !call.answeredAt;
              if (callFilter === 'missed') return isMissed;
              if (callFilter === 'incoming') return !isOutgoing;
              if (callFilter === 'outgoing') return isOutgoing;
              return true;
            })
            .map((call) => {
            const participants = call.participants || [];
            const isGroup = participants.length > 2;
            const otherId = !isGroup ? participants.find((id) => id !== currentUser.uid) : null;
            const otherPerson = otherId ? people.find((p) => p.id === otherId) : null;
            const matchedGroup = isGroup
              ? groupChats.find((g) => {
                  const a = [...(g.participants || [])].sort().join(',');
                  const b = [...participants].sort().join(',');
                  return a === b;
                })
              : null;
            const isOutgoing = call.initiatedBy === currentUser.uid;
            const isMissed = !isOutgoing && !call.answeredAt;
            const label = isOutgoing ? 'Outgoing' : (isMissed ? 'Missed' : 'Incoming');
            const displayName = isGroup ? (matchedGroup?.name || 'Group call') : (otherPerson?.name || 'Unknown');

            return (
              <div className="chat-row" key={call.id}>
                <div className="chat-row-avatar">
                  {isGroup
                    ? <IconUsers className="w-5 h-5" />
                    : (otherPerson?.photoURL ? <img src={otherPerson.photoURL} alt="" /> : (displayName?.[0] || '?'))}
                </div>
                <div className="chat-row-body">
                  <div className="chat-row-top">
                    <span className="chat-row-name">{displayName}</span>
                    <span className="chat-list-time">{timeAgo(call.createdAt)}</span>
                  </div>
                  <div className="chat-row-bottom">
                    <span className={'chat-row-preview' + (isMissed ? ' call-log-missed' : '')}>
                      {call.callType === 'video' ? <IconVideo className="w-3.5 h-3.5" style={{ display: 'inline' }} /> : <IconPhone className="w-3.5 h-3.5" style={{ display: 'inline' }} />} {isOutgoing ? <IconArrowUpRight className="w-3.5 h-3.5" style={{ display: 'inline' }} /> : <IconArrowDownLeft className="w-3.5 h-3.5" style={{ display: 'inline' }} />} {label}
                    </span>
                  </div>
                </div>
                {!isGroup && (
                  <button
                    type="button"
                    className="chat-call-btn"
                    title={call.callType === 'video' ? 'Video call back' : 'Call back'}
                    onClick={() => redialCall(call)}
                  >
                    {call.callType === 'video' ? <IconVideo className="w-4 h-4" /> : <IconPhone className="w-4 h-4" />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
