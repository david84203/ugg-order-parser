import { useState, useEffect } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy
} from 'firebase/firestore'
import { db } from '../firebase/config'

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'suppliers'), orderBy('name'))
    const unsub = onSnapshot(q, snap => {
      setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, err => console.error('suppliers snapshot error', err))
    return unsub
  }, [])

  async function addSupplier(data) {
    await addDoc(collection(db, 'suppliers'), { ...data, createdAt: Date.now() })
  }

  async function updateSupplier(id, data) {
    await updateDoc(doc(db, 'suppliers', id), data)
  }

  async function deleteSupplier(id) {
    await deleteDoc(doc(db, 'suppliers', id))
  }

  return { suppliers, loading, addSupplier, updateSupplier, deleteSupplier }
}
