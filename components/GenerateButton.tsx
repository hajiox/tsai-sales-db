'use client'

import { useState } from 'react'

export default function GenerateButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const handleClick = async () => {
    setLoading(true)
    const res = await fetch('/api/analyze', { method: 'POST' })
    const json = await res.json()
    if (json.ok) setResult(json.markdown)
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
      >
        {loading ? '生成中…' : '売上報告を生成'}
      </button>
      {result && (
        <div className="prose bg-white p-4 rounded border">
          <pre>{result}</pre>
        </div>
      )}
    </div>
  )
}
