// Amazon CSV確定処理の修正版
const handleAmazonConfirm = async (updatedResults: any[]) => {
  setIsAmazonSubmitting(true)
  try {
    const response = await fetch('/api/import/amazon-confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        month: month,
        results: updatedResults,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('レスポンスエラー:', result)
      throw new Error(result.error || 'Amazon データの更新に失敗しました')
    }

    console.log('Amazon データ更新成功:', result)
    alert(`Amazon データの更新が完了しました\n成功: ${result.successCount}件`)
    
    // データを再読み込み
    window.location.reload()
    
  } catch (error) {
    console.error('Amazon データ更新エラー:', error)
    alert(`データの更新に失敗しました: ${error.message}`)
  } finally {
    setIsAmazonSubmitting(false)
    handleAmazonConfirmClose()
  }
}
