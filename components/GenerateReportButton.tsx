'use client'

import { useState } from 'react'
import { Button } from './ui/button'

export default function GenerateReportButton() {
  const [loading, setLoading] = useState(false)
  const [reportText, setReportText] = useState('')

  const handleClick = async () => {
    // Always reset previous report before generating a new one
    setReportText('')
    setLoading(true)
    try {
      const res = await fetch('/api/report', { method: 'POST' })
      const text = await res.text()
      setReportText(text)
      await navigator.clipboard.writeText(text)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading} className="w-max">
      {loading ? '生成中…' : '売上報告を生成'}
    </Button>
  )
}
