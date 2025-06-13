'use client'

import { useState } from 'react'
import { Button } from './ui/button'

export default function GenerateReportButton() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState('')

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/report')
      const json = await res.json()
      if (json.ok) {
        setReport(json.report ?? '')
      } else {
        console.error(json.error)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleClick} disabled={loading} className="w-max">
        {loading ? '生成中…' : '売上報告を生成'}
      </Button>
      {loading && <p>生成中…</p>}
      {!loading && report && (
        <pre className="whitespace-pre-wrap bg-white p-4 rounded border">
          {report}
        </pre>
      )}
    </div>
  )
}
