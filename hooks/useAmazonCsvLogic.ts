// /hooks/useAmazonCsvLogic.ts ver.3 (商品名なし学習除外版)

  const handleLearnAllMappings = async () => {
    // 🔥 商品名なしの未マッチング商品は学習対象から除外
    const learningTargets = manualSelections.filter(selection => 
      !selection.amazonTitle.startsWith('[商品名なし]')
    )
    
    if (learningTargets.length === 0) {
      alert('学習するマッピングがありません')
      return
    }

    // ローディング状態を表示
    const loadingAlert = setTimeout(() => {
      console.log('学習処理中...')
    }, 100)

    try {
      let successCount = 0
      let errorMessages: string[] = []
      
      for (const selection of learningTargets) {
        console.log(`学習中: ${selection.amazonTitle} -> ${selection.productId}`)
        
        const response = await fetch('/api/products/add-learning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            amazonTitle: selection.amazonTitle, 
            productId: selection.productId 
          }),
        })
        
        if (response.ok) {
          successCount++
          console.log(`✅ 学習成功: ${selection.amazonTitle}`)
        } else {
          const errorText = await response.text()
          const errorMsg = `${selection.amazonTitle}: ${response.status} ${errorText}`
          errorMessages.push(errorMsg)
          console.error(`❌ 学習失敗: ${errorMsg}`)
        }
      }
      
      clearTimeout(loadingAlert)
      
      // 結果の表示
      const skippedCount = manualSelections.length - learningTargets.length
      let message = ''
      
      if (successCount === learningTargets.length) {
        message = `✅ 全${successCount}件のマッピングを学習しました！`
        if (skippedCount > 0) {
          message += `\n(商品名なし${skippedCount}件は学習対象外)`
        }
      } else if (successCount > 0) {
        message = `⚠️ ${successCount}/${learningTargets.length}件のマッピングを学習しました`
        if (skippedCount > 0) {
          message += `\n(商品名なし${skippedCount}件は学習対象外)`
        }
        message += `\n\nエラー:\n${errorMessages.join('\n')}`
      } else {
        message = `❌ 学習に失敗しました\n\nエラー:\n${errorMessages.join('\n')}`
        if (skippedCount > 0) {
          message += `\n(商品名なし${skippedCount}件は学習対象外)`
        }
      }
      
      alert(message)
      
    } catch (error) {
      clearTimeout(loadingAlert)
      console.error('学習エラー:', error)
      alert(`❌ ネットワークエラーが発生しました\n${error instanceof Error ? error.message : '不明なエラー'}`)
    }
  }
