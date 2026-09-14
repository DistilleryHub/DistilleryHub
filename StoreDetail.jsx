import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, doc, getDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useLanguage } from './LanguageContext';

export default function StoreDetail() {
  const { storeId } = useParams();
  const { t } = useLanguage();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'stores', storeId)).then((snap) => {
      setStore(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
  }, [storeId]);

  useEffect(() => {
    const q = query(collection(db, 'stores', storeId, 'products'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [storeId]);

  if (loading) return <div className="marketplace-page"><div className="empty-state">{t('market.store.loading')}</div></div>;
  if (!store) return <div className="marketplace-page"><div className="empty-state">{t('market.store.notFound')}</div></div>;

  return (
    <div className="marketplace-page">
      <Link to="/market" className="linklike">{t('market.store.backToMarket')}</Link>

      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <div className="avatar" style={{ width: 56, height: 56 }}>
          {store.logoURL ? <img src={store.logoURL} alt="" /> : (store.name?.[0] || '🏪')}
        </div>
        <div>
          <div className="listing-title">{store.name}</div>
          <div className="job-meta">{t('market.store.by')} {store.ownerName}</div>
          {store.description && <p className="listing-description">{store.description}</p>}
        </div>
      </div>

      <h3 className="settings-subheading" style={{ marginTop: 16 }}>{t('market.myProducts')} ({products.length})</h3>

      <div className="people-grid">
        {products.map((p) => (
          <div className={'card listing-card' + (p.stock === 0 ? ' sold' : '')} key={p.id}>
            {p.imageURL && <img className="listing-image" src={p.imageURL} alt="" />}
            <div className="listing-title">{p.title}</div>
            <div className="listing-price">₹{p.price}</div>
            {p.description && <p className="listing-description">{p.description}</p>}
            <div className="listing-seller">
              {p.stock > 0 ? `${t('market.product.inStock')}: ${p.stock}` : t('market.product.outOfStock')}
            </div>
          </div>
        ))}
        {products.length === 0 && <div className="empty-state">{t('market.noProducts')}</div>}
      </div>
    </div>
  );
}
