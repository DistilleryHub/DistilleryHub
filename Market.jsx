import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, orderBy, onSnapshot, addDoc, deleteDoc, doc, updateDoc, where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { uploadToCloudinary } from './uploadUtils';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { IconStore } from './Icons';
import { notify } from './notify';

const RFQ_CATEGORIES = [
  'Raw Materials', 'Equipment & Machinery', 'Spares & Parts',
  'Chemicals & Reagents', 'Packaging', 'Services', 'Other',
];

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

function RfqBids({ rfq, currentUser, currentProfile, toast }) {
  const [bids, setBids] = useState([]);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isBuyer = rfq.buyerId === currentUser.uid;
  const myBid = bids.find((b) => b.sellerId === currentUser.uid);

  useEffect(() => {
    const q = isBuyer
      ? query(collection(db, 'rfqs', rfq.id, 'bids'), orderBy('createdAt', 'asc'))
      : query(collection(db, 'rfqs', rfq.id, 'bids'), where('sellerId', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      setBids(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [rfq.id, isBuyer, currentUser.uid]);

  async function submitBid(e) {
    e.preventDefault();
    if (!price || Number(price) <= 0) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'rfqs', rfq.id, 'bids'), {
        sellerId: currentUser.uid,
        sellerName: currentProfile?.name || 'Member',
        sellerPhotoURL: currentProfile?.photoURL || '',
        price: Number(price),
        message: message.trim(),
        accepted: false,
        createdAt: serverTimestamp(),
      });
      notify({
        toUserId: rfq.buyerId,
        type: 'rfq_quote',
        message: `${currentProfile?.name || 'Someone'} submitted a quote for "${rfq.title}"`,
        link: '/market',
        fromUserId: currentUser.uid,
        fromUserName: currentProfile?.name || 'Member',
        fromUserPhoto: currentProfile?.photoURL || '',
      });
      setPrice(''); setMessage('');
      toast('Quote submitted');
    } catch (err) {
      toast(err.message || 'Could not submit quote');
    }
    setSubmitting(false);
  }

  async function acceptBid(bid) {
    if (!isBuyer) return;
    await updateDoc(doc(db, 'rfqs', rfq.id, 'bids', bid.id), { accepted: true });
    await updateDoc(doc(db, 'rfqs', rfq.id), { status: 'closed', acceptedBidId: bid.id });
    notify({
      toUserId: bid.sellerId,
      type: 'rfq_accepted',
      message: `Your quote for "${rfq.title}" was accepted`,
      link: '/market',
      fromUserId: currentUser.uid,
      fromUserName: currentProfile?.name || 'Member',
      fromUserPhoto: currentProfile?.photoURL || '',
    });
    toast('Quote accepted');
  }

  return (
    <div className="rfq-bids">
      {isBuyer ? (
        <>
          <h4 className="rfq-bids-heading">Quotes ({bids.length})</h4>
          {bids.length === 0 && <div className="empty-state">No quotes yet.</div>}
          {bids.map((b) => (
            <div className={'rfq-bid-row' + (b.accepted ? ' accepted' : '')} key={b.id}>
              <div className="avatar">
                {b.sellerPhotoURL ? <img src={b.sellerPhotoURL} alt="" /> : (b.sellerName?.[0] || '?')}
              </div>
              <div className="rfq-bid-info">
                <div className="rfq-bid-seller">{b.sellerName}</div>
                <div className="rfq-bid-price">₹{b.price}</div>
                {b.message && <div className="rfq-bid-message">{b.message}</div>}
                <div className="post-time">{timeAgo(b.createdAt)}</div>
              </div>
              {rfq.status === 'open' && (
                <button className="btn btn-primary btn-sm" onClick={() => acceptBid(b)}>Accept</button>
              )}
              {b.accepted && <span className="badge">ACCEPTED</span>}
            </div>
          ))}
        </>
      ) : (
        <>
          {rfq.status === 'open' && !myBid && (
            <form className="rfq-bid-form" onSubmit={submitBid}>
              <div className="form-field">
                <input
                  type="number" placeholder="Your quoted price (₹)" value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="form-field">
                <textarea
                  placeholder="Message (delivery time, terms, etc.)" rows={2} value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                {submitting ? <span className="spinner" /> : 'Submit quote'}
              </button>
            </form>
          )}
          {myBid && (
            <div className={'rfq-bid-row' + (myBid.accepted ? ' accepted' : '')}>
              <div className="rfq-bid-info">
                <div className="rfq-bid-seller">Your quote</div>
                <div className="rfq-bid-price">₹{myBid.price}</div>
                {myBid.message && <div className="rfq-bid-message">{myBid.message}</div>}
              </div>
              {myBid.accepted && <span className="badge">ACCEPTED</span>}
            </div>
          )}
          {rfq.status === 'closed' && !myBid && (
            <div className="empty-state">This RFQ is closed.</div>
          )}
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// My Store — create/manage your own shop + its product catalog
// -----------------------------------------------------------------------
function MyStore({ currentUser, currentProfile, toast }) {
  const [myStore, setMyStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storeForm, setStoreForm] = useState({ name: '', description: '' });
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [savingStore, setSavingStore] = useState(false);

  const [products, setProducts] = useState([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState({ title: '', price: '', description: '', stock: '' });
  const [productImage, setProductImage] = useState(null);
  const [productPreview, setProductPreview] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'stores'), where('ownerId', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      setMyStore(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() });
      setLoading(false);
    });
    return unsub;
  }, [currentUser.uid]);

  useEffect(() => {
    if (!myStore) { setProducts([]); return; }
    const q = query(collection(db, 'stores', myStore.id, 'products'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [myStore]);

  async function createStore(e) {
    e.preventDefault();
    if (!storeForm.name.trim()) return;
    setSavingStore(true);
    try {
      let logoURL = '';
      if (logo) logoURL = await uploadToCloudinary(logo);
      await addDoc(collection(db, 'stores'), {
        ownerId: currentUser.uid,
        ownerName: currentProfile?.name || 'Member',
        name: storeForm.name.trim(),
        description: storeForm.description.trim(),
        logoURL,
        createdAt: serverTimestamp(),
      });
      toast('Store created!');
    } catch (err) {
      toast(err.message || 'Could not create store');
    }
    setSavingStore(false);
  }

  async function addProduct(e) {
    e.preventDefault();
    if (!productForm.title.trim() || !productForm.price) return;
    setSavingProduct(true);
    try {
      let imageURL = '';
      if (productImage) imageURL = await uploadToCloudinary(productImage);
      await addDoc(collection(db, 'stores', myStore.id, 'products'), {
        title: productForm.title.trim(),
        price: Number(productForm.price) || 0,
        description: productForm.description.trim(),
        stock: Number(productForm.stock) || 0,
        imageURL,
        createdAt: serverTimestamp(),
      });
      setProductForm({ title: '', price: '', description: '', stock: '' });
      setProductImage(null); setProductPreview(''); setShowProductForm(false);
      toast('Product added');
    } catch (err) {
      toast(err.message || 'Could not add product');
    }
    setSavingProduct(false);
  }

  async function deleteProduct(productId) {
    if (!confirm('Delete this product?')) return;
    await deleteDoc(doc(db, 'stores', myStore.id, 'products', productId));
  }

  async function updateStock(productId, stock) {
    await updateDoc(doc(db, 'stores', myStore.id, 'products', productId), { stock: Number(stock) || 0 });
  }

  if (loading) return <div className="empty-state">Loading…</div>;

  if (!myStore) {
    return (
      <form className="card" onSubmit={createStore}>
        <h3 className="listing-title">Apni Dukan banayein</h3>
        <div className="form-field">
          <input type="text" placeholder="Shop name" value={storeForm.name}
            onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} />
        </div>
        <div className="form-field">
          <textarea placeholder="Description (kya bechte hain)" rows={2} value={storeForm.description}
            onChange={(e) => setStoreForm({ ...storeForm, description: e.target.value })} />
        </div>
        {logoPreview && <img className="composer-preview-img" src={logoPreview} alt="" />}
        <label className="btn btn-ghost btn-sm">
          Add shop logo
          <input type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setLogo(f); setLogoPreview(URL.createObjectURL(f)); }
          }} />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={savingStore} style={{ marginTop: 8 }}>
          {savingStore ? <span className="spinner" /> : 'Create Store'}
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="avatar" style={{ width: 48, height: 48 }}>
          {myStore.logoURL ? <img src={myStore.logoURL} alt="" /> : (myStore.name?.[0] || <IconStore className="w-5 h-5" />)}
        </div>
        <div>
          <div className="listing-title">{myStore.name}</div>
          {myStore.description && <div className="job-meta">{myStore.description}</div>}
        </div>
      </div>

      <div className="card">
        <button className="btn btn-primary btn-sm" onClick={() => setShowProductForm((v) => !v)}>
          {showProductForm ? 'Cancel' : '+ Add product'}
        </button>
      </div>

      {showProductForm && (
        <form className="card" onSubmit={addProduct}>
          <div className="form-field">
            <input type="text" placeholder="Product name" value={productForm.title}
              onChange={(e) => setProductForm({ ...productForm, title: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="form-field" style={{ flex: 1 }}>
              <input type="number" placeholder="Price (₹)" value={productForm.price}
                onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <input type="number" placeholder="Stock qty" value={productForm.stock}
                onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} />
            </div>
          </div>
          <div className="form-field">
            <textarea placeholder="Description" rows={2} value={productForm.description}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
          </div>
          {productPreview && <img className="composer-preview-img" src={productPreview} alt="" />}
          <label className="btn btn-ghost btn-sm">
            Add photo
            <input type="file" accept="image/*" hidden onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setProductImage(f); setProductPreview(URL.createObjectURL(f)); }
            }} />
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={savingProduct} style={{ marginTop: 8 }}>
            {savingProduct ? <span className="spinner" /> : 'Add product'}
          </button>
        </form>
      )}

      <h3 className="settings-subheading">Aapke products ({products.length})</h3>
      <div className="people-grid">
        {products.map((p) => (
          <div className={'card listing-card' + (p.stock === 0 ? ' sold' : '')} key={p.id}>
            {p.imageURL && <img className="listing-image" src={p.imageURL} alt="" />}
            <div className="listing-title">{p.title}</div>
            <div className="listing-price">₹{p.price}</div>
            <div className="form-field" style={{ marginTop: 8 }}>
              <input type="number" defaultValue={p.stock} placeholder="Stock"
                onBlur={(e) => updateStock(p.id, e.target.value)} />
            </div>
            <div className="job-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => deleteProduct(p.id)}>Delete</button>
            </div>
          </div>
        ))}
        {products.length === 0 && <div className="empty-state">Abhi koi product nahi hai.</div>}
      </div>
    </>
  );
}

// -----------------------------------------------------------------------
// Directory of all stores (browse others)
// -----------------------------------------------------------------------
function StoreDirectory() {
  const [stores, setStores] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setStores(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  return (
    <div className="people-grid">
      {stores.map((s) => (
        <Link to={`/store/${s.id}`} className="card listing-card" key={s.id} style={{ display: 'block' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div className="avatar">
              {s.logoURL ? <img src={s.logoURL} alt="" /> : (s.name?.[0] || <IconStore className="w-5 h-5" />)}
            </div>
            <div>
              <div className="listing-title">{s.name}</div>
              <div className="job-meta">by {s.ownerName}</div>
            </div>
          </div>
        </Link>
      ))}
      {stores.length === 0 && <div className="empty-state">Koi store nahi hai abhi.</div>}
    </div>
  );
}

export default function Marketplace() {
  const { currentUser, currentProfile } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('listings'); // 'listings' | 'rfq' | 'stores'

  const [listings, setListings] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', price: '', description: '' });
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);

  const [rfqs, setRfqs] = useState([]);
  const [showRfqForm, setShowRfqForm] = useState(false);
  const [rfqForm, setRfqForm] = useState({
    title: '', quantity: '', unit: '', category: RFQ_CATEGORIES[0], description: '',
  });
  const [postingRfq, setPostingRfq] = useState(false);
  const [expandedRfq, setExpandedRfq] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'listings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'rfqs'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRfqs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  function handleImagePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.price) return;
    setSaving(true);
    try {
      let imageURL = '';
      if (image) imageURL = await uploadToCloudinary(image);
      await addDoc(collection(db, 'listings'), {
        title: form.title.trim(),
        price: Number(form.price) || 0,
        description: form.description.trim(),
        imageURL,
        sellerId: currentUser.uid,
        sellerName: currentProfile?.name || 'Member',
        sold: false,
        createdAt: serverTimestamp(),
      });
      setForm({ title: '', price: '', description: '' });
      setImage(null); setPreview(''); setShowForm(false);
      toast('Listing posted');
    } catch (err) {
      toast(err.message || 'Could not post listing');
    }
    setSaving(false);
  }

  async function toggleSold(listing) {
    if (listing.sellerId !== currentUser.uid) return;
    await updateDoc(doc(db, 'listings', listing.id), { sold: !listing.sold });
  }

  async function removeListing(listing) {
    if (listing.sellerId !== currentUser.uid) return;
    if (!confirm('Delete this listing?')) return;
    await deleteDoc(doc(db, 'listings', listing.id));
  }

  async function postRfq(e) {
    e.preventDefault();
    if (!rfqForm.title.trim() || !rfqForm.quantity) return;
    setPostingRfq(true);
    try {
      await addDoc(collection(db, 'rfqs'), {
        title: rfqForm.title.trim(),
        quantity: rfqForm.quantity.trim(),
        unit: rfqForm.unit.trim(),
        category: rfqForm.category,
        description: rfqForm.description.trim(),
        buyerId: currentUser.uid,
        buyerName: currentProfile?.name || 'Member',
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setRfqForm({ title: '', quantity: '', unit: '', category: RFQ_CATEGORIES[0], description: '' });
      setShowRfqForm(false);
      toast('RFQ posted');
    } catch (err) {
      toast(err.message || 'Could not post RFQ');
    }
    setPostingRfq(false);
  }

  async function closeRfq(rfq) {
    if (rfq.buyerId !== currentUser.uid) return;
    await updateDoc(doc(db, 'rfqs', rfq.id), { status: 'closed' });
    toast('RFQ closed');
  }

  async function deleteRfq(rfq) {
    if (rfq.buyerId !== currentUser.uid) return;
    if (!confirm('Delete this RFQ?')) return;
    await deleteDoc(doc(db, 'rfqs', rfq.id));
  }

  const visibleListings = useMemo(() => {
    if (!search.trim()) return listings;
    const s = search.toLowerCase();
    return listings.filter((l) => l.title?.toLowerCase().includes(s));
  }, [listings, search]);

  return (
    <div className="marketplace-page">
      <div className="market-tabs">
        <button
          className={'market-tab' + (tab === 'listings' ? ' active' : '')}
          onClick={() => setTab('listings')}
        >
          Buy & Sell
        </button>
        <button
          className={'market-tab' + (tab === 'rfq' ? ' active' : '')}
          onClick={() => setTab('rfq')}
        >
          Request for Quote
        </button>
        <button
          className={'market-tab' + (tab === 'stores' ? ' active' : '')}
          onClick={() => setTab('stores')}
        >
          Stores
        </button>
      </div>

      {tab === 'listings' && (
        <>
          <div className="card">
            <input
              type="text"
              placeholder="Search listings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Cancel' : 'Sell something'}
            </button>
          </div>

          {showForm && (
            <form className="card" onSubmit={handleSubmit}>
              <div className="form-field">
                <input type="text" placeholder="Item title" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="form-field">
                <input type="number" placeholder="Price" value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="form-field">
                <textarea placeholder="Description" rows={3} value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              {preview && <img className="composer-preview-img" src={preview} alt="" />}
              <label className="btn btn-ghost btn-sm">
                Add photo
                <input type="file" accept="image/*" hidden onChange={handleImagePick} />
              </label>
              <button type="submit" className="btn btn-primary btn-block" disabled={saving} style={{ marginTop: 8 }}>
                {saving ? <span className="spinner" /> : 'Post listing'}
              </button>
            </form>
          )}

          <div className="people-grid">
            {visibleListings.map((listing) => (
              <div className={'card listing-card' + (listing.sold ? ' sold' : '')} key={listing.id}>
                {listing.imageURL && <img className="listing-image" src={listing.imageURL} alt="" />}
                <div className="listing-title">{listing.title}</div>
                <div className="listing-price">₹{listing.price}</div>
                {listing.description && <p className="listing-description">{listing.description}</p>}
                <div className="listing-seller">by {listing.sellerName}</div>
                {listing.sold && <div className="badge">SOLD</div>}
                {listing.sellerId === currentUser.uid && (
                  <div className="job-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleSold(listing)}>
                      {listing.sold ? 'Mark available' : 'Mark sold'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => removeListing(listing)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
            {visibleListings.length === 0 && <div className="empty-state">No listings found.</div>}
          </div>
        </>
      )}

      {tab === 'rfq' && (
        <>
          <div className="card">
            <button className="btn btn-primary btn-sm" onClick={() => setShowRfqForm((v) => !v)}>
              {showRfqForm ? 'Cancel' : 'Post a requirement'}
            </button>
          </div>

          {showRfqForm && (
            <form className="card" onSubmit={postRfq}>
              <div className="form-field">
                <input type="text" placeholder="What do you need?" value={rfqForm.title}
                  onChange={(e) => setRfqForm({ ...rfqForm, title: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="form-field" style={{ flex: 1 }}>
                  <input type="text" placeholder="Quantity (e.g. 500)" value={rfqForm.quantity}
                    onChange={(e) => setRfqForm({ ...rfqForm, quantity: e.target.value })} />
                </div>
                <div className="form-field" style={{ flex: 1 }}>
                  <input type="text" placeholder="Unit (kg, L, units)" value={rfqForm.unit}
                    onChange={(e) => setRfqForm({ ...rfqForm, unit: e.target.value })} />
                </div>
              </div>
              <div className="form-field">
                <select
                  value={rfqForm.category}
                  onChange={(e) => setRfqForm({ ...rfqForm, category: e.target.value })}
                >
                  {RFQ_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-field">
                <textarea placeholder="Specifications, delivery location, timeline..." rows={3}
                  value={rfqForm.description}
                  onChange={(e) => setRfqForm({ ...rfqForm, description: e.target.value })} />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={postingRfq}>
                {postingRfq ? <span className="spinner" /> : 'Post RFQ'}
              </button>
            </form>
          )}

          {rfqs.length === 0 && <div className="empty-state">No requirements posted yet.</div>}

          {rfqs.map((rfq) => (
            <div className={'card rfq-card' + (rfq.status === 'closed' ? ' closed' : '')} key={rfq.id}>
              <div className="rfq-card-header">
                <div>
                  <div className="listing-title">{rfq.title}</div>
                  <div className="job-meta">{rfq.category} • {rfq.quantity} {rfq.unit}</div>
                </div>
                {rfq.status === 'closed' && <span className="badge">CLOSED</span>}
              </div>
              {rfq.description && <p className="job-description">{rfq.description}</p>}
              <div className="listing-seller">by {rfq.buyerName} • {timeAgo(rfq.createdAt)}</div>

              <div className="job-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setExpandedRfq(expandedRfq === rfq.id ? null : rfq.id)}
                >
                  {expandedRfq === rfq.id ? 'Hide quotes' : (rfq.buyerId === currentUser.uid ? 'View quotes' : 'Submit a quote')}
                </button>
                {rfq.buyerId === currentUser.uid && rfq.status === 'open' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => closeRfq(rfq)}>Close RFQ</button>
                )}
                {rfq.buyerId === currentUser.uid && (
                  <button className="btn btn-ghost btn-sm" onClick={() => deleteRfq(rfq)}>Delete</button>
                )}
              </div>

              {expandedRfq === rfq.id && (
                <RfqBids rfq={rfq} currentUser={currentUser} currentProfile={currentProfile} toast={toast} />
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'stores' && (
        <>
          <h3 className="settings-subheading">Aapki Dukan</h3>
          <MyStore currentUser={currentUser} currentProfile={currentProfile} toast={toast} />

          <h3 className="settings-subheading" style={{ marginTop: 20 }}>Sabhi Stores</h3>
          <StoreDirectory />
        </>
      )}
    </div>
  );
    }
