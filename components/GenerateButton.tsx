'use client'

import { useState } from 'react'
import { Button } from './ui/button'

export default function GenerateButton() {
  const [loading, setLoading] = useState(false)
  const [markdown, setMarkdown] = useState('')

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/analyze', { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        setMarkdown(json.markdown ?? json.result ?? '')
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
      <div>
        <h3 className="text-sm font-semibold mb-1">売上報告結果</h3>
        {loading ? (
          <p>生成中…</p>
        ) : (
          markdown && (
            <pre className="whitespace-pre-wrap bg-white p-4 rounded border">
              {markdown}
            </pre>
          )
        )}
      </div>
    </div>
  )
}
