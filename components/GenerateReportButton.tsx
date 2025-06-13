'use client'

import { useState } from 'react'
import { Button } from './ui/button'

export default function GenerateReportButton() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<string | null>(null)

  const generate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/report', { method: 'POST' })
      const text = await res.text()
      setReport(text)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report)
      console.log('コピーしました')
    } catch (e) {
      console.error(e)
    }
  }

  return report ? (
    <Button onClick={copy} className="w-max">
      コピーする
    </Button>
  ) : (
    <Button onClick={generate} disabled={loading} className="w-max">
      {loading ? '生成中…' : '売上報告を生成'}
    </Button>
  )
}
