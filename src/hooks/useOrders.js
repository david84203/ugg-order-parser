import { useState, useEffect } from 'react'
import {
  collection, onSnapshot, addDoc, doc, query, orderBy, where, getDoc
} from 'firebase/firestore'
import { db } from '../firebase/config'

export function useOrders(supplierId = null) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let q = query(collection(db, 'orders'), orderBy('orderDate', 'desc'))
    if (supplierId) {
      q = query(
        collection(db, 'orders'),
        where('supplierId', '==', supplierId),
        orderBy('orderDate', 'desc')
      )
    }
    const unsub = onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => console.error('orders snapshot error', err))
    return unsub
  }, [supplierId])

  async function addOrder(data) {
    const ref = await addDoc(collection(db, 'orders'), {
      ...data,
      createdAt: Date.now(),
    })
    return ref.id
  }

  async function getOrder(id) {
    const snap = await getDoc(doc(db, 'orders', id))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() }
  }

  return { orders, loading, addOrder, getOrder }
}
