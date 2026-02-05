
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-red-600">データの読み込みに失敗しました</h2>
                <p className="text-gray-600 max-w-md mx-auto">
                    {error.message || '予期せぬエラーが発生しました。'}
                </p>
                {error.digest && (
                    <p className="text-xs text-mono text-gray-400">Digest: {error.digest}</p>
                )}
            </div>
            <Button
                onClick={() => reset()}
                variant="outline"
            >
                再試行
            </Button>
        </div>
    )
}
