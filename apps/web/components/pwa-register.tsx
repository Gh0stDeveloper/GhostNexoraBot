'use client'

import { useEffect } from 'react'

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const secure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    if (!secure) return
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined)
  }, [])

  return null
}
