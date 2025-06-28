// /app/components/RakutenCsvImportModal.tsx ver.16
import React, { useState, useCallback } from 'react';
import { Button, Modal, Box, Typography, CircularProgress, Alert, Paper, Grid } from '@mui/material';
import { UploadFile, CheckCircleOutline, ErrorOutline, HelpOutline } from '@mui/icons-material';

// --- 型定義 ---
interface Product {
  rakutenTitle: string;
  quantity: number;
  productId?: string;
  productName?: string;
  matchType?: string;
}

interface BlankTitleInfo {
  count: number;
  quantity: number;
}

interface ParseResult {
  totalProducts: number;
  totalQuantity: number;
  matchedProducts: Product[];
  unmatchedProducts: Product[];
  processableQuantity: number;
  blankTitleInfo: BlankTitleInfo;
}

// --- Propsの型定義 ---
interface RakutenCsvImportModalProps {
  onImportSuccess: () => void;
}

const RakutenCsvImportModal: React.FC<RakutenCsvImportModalProps> = ({ onImportSuccess }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [salesMonth, setSalesMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [step, setStep] = useState(1); // 1: 選択, 2: 確認
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setFileName('');
    setStep(1);
    setIsLoading(false);
    setError(null);
    setParseResult(null);
    setCsvContent(null);
  }, []);

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => {
    setIsOpen(false);
    resetState();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFileName(selectedFile.name);
      setIsLoading(true);
      setError(null);

      const reader = new FileReader();
      
      // ★★★ 修正点：Shift_JISで読み込む処理 ★★★
      reader.onload = (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) {
            throw new Error('ファイルの読み込みに失敗しました。');
          }
          // TextDecoderを使用してShift_JISとしてデコード
          const decoder = new TextDecoder('shift-jis');
          const text = decoder.decode(arrayBuffer);
          setCsvContent(text);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('File decode error:', message);
            setError(`ファイルのデコードに失敗しました。ファイルがShift-JIS形式であることを確認してください。エラー: ${message}`);
            setIsLoading(false);
        }
      };

      reader.onerror = () => {
        setError('ファイルリーダーでエラーが発生しました。');
        setIsLoading(false);
      };

      // readAsTextからreadAsArrayBufferに変更
      reader.readAsArrayBuffer(selectedFile);
    }
  };
  
  // csvContentがセットされたら、APIに送信
  React.useEffect(() => {
    if (csvContent) {
      handleParse();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvContent]);


  const handleParse = async () => {
    if (!csvContent) {
      setError('CSVデータがありません。');
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/import/rakuten-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '不明な解析エラー');
      }
      
      setParseResult(data);
      setStep(2); // 確認ステップへ

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('楽天CSVの解析に失敗しました:', message);
      setError(`解析エラー: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!parseResult || !salesMonth) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/import/rakuten-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesMonth,
          matchedProducts: parseResult.matchedProducts,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '不明なインポートエラー');
      }
      onImportSuccess(); // 親コンポーネントに成功を通知
      handleClose();

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('楽天CSVの確認に失敗しました:', message);
      setError(`インポートエラー: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const StatCard = ({ title, value, icon, color = 'text.primary' }) => (
    <Paper sx={{ p: 2, textAlign: 'center', height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
        {icon}
        <Typography variant="h6">{title}</Typography>
      </Box>
      <Typography variant="h4" sx={{ color, mt: 1 }}>{value}</Typography>
    </Paper>
  );

  return (
    <>
      <Button variant="contained" onClick={handleOpen} startIcon={<UploadFile />}>
        楽天CSVインポート
      </Button>
      <Modal open={isOpen} onClose={handleClose}>
        <Box sx={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: '90%', maxWidth: 800, bgcolor: 'background.paper', boxShadow: 24, p: 4,
          borderRadius: 2, maxHeight: '90vh', overflowY: 'auto'
        }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            楽天CSVインポート
          </Typography>

          {step === 1 && (
            <Box sx={{ mt: 3, p: 3, border: '2px dashed grey', borderRadius: 2, textAlign: 'center' }}>
              <Typography sx={{ mb: 2 }}>売上計上する年月を選択し、CSVファイルをアップロードしてください。</Typography>
              <input
                  type="month"
                  value={salesMonth}
                  onChange={(e) => setSalesMonth(e.target.value)}
                  style={{ padding: '10px', marginBottom: '16px', border: '1px solid #ccc', borderRadius: '4px' }}
              />
              <Button
                  variant="contained"
                  component="label"
                  disabled={isLoading}
              >
                  ファイルを選択
                  <input type="file" accept=".csv" hidden onChange={handleFileChange} />
              </Button>
              {fileName && <Typography sx={{ mt: 2 }}>選択中のファイル: {fileName}</Typography>}
            </Box>
          )}

          {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
                  <CircularProgress />
              </Box>
          )}

          {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
          
          {step === 2 && parseResult && (
            <Box>
              <Typography variant="h6" sx={{ mb: 2, borderBottom: '2px solid #f0f0f0', pb: 1 }}>数量チェック</Typography>
              <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                      <StatCard title="CSV総商品数" value={`${parseResult.totalProducts}件`} icon={<HelpOutline color="action" />} />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                      <StatCard title="総販売数量" value={`${parseResult.totalQuantity}個`} icon={<HelpOutline color="action" />} />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                      <StatCard title="処理可能数量" value={`${parseResult.processableQuantity}個`} icon={<CheckCircleOutline color="success" />} color="success.main" />
                  </Grid>
              </Grid>

              <Grid container spacing={2} sx={{ mt: 2 }}>
                  <Grid item xs={12} sm={6}>
                      <Paper sx={{ p: 2, backgroundColor: '#e8f5e9' }}>
                          <Typography variant="h6" sx={{ color: 'success.dark' }}>マッチ済み</Typography>
                          <Typography variant="body1">{parseResult.matchedProducts.length}件の商品がDBと一致しました。</Typography>
                      </Paper>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                       <Paper sx={{ p: 2, backgroundColor: '#fff3e0' }}>
                          <Typography variant="h6" sx={{ color: 'warning.dark' }}>未マッチ</Typography>
                          <Typography variant="body1">{parseResult.unmatchedProducts.length}件の商品がDBに見つかりませんでした。</Typography>
                           {parseResult.unmatchedProducts.length > 0 && (
                            <Alert severity="warning" sx={{mt: 1}}>未マッチ商品はインポートされません。「学習」機能で紐付けを行ってください。</Alert>
                           )}
                      </Paper>
                  </Grid>
              </Grid>
              
               {parseResult.blankTitleInfo.count > 0 && (
                  <Alert severity="info" sx={{mt: 2}}>
                      商品名が空欄の行が{parseResult.blankTitleInfo.count}件（合計{parseResult.blankTitleInfo.quantity}個）あり、これらは無視されました。
                  </Alert>
              )}
            </Box>
          )}


          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'space-between' }}>
            <Button onClick={step === 1 ? handleClose : () => setStep(1)} disabled={isLoading}>
              {step === 1 ? '閉じる' : '← 戻る'}
            </Button>
            {step === 2 && (
              <Button
                variant="contained"
                color="primary"
                onClick={handleConfirm}
                disabled={isLoading || (parseResult && parseResult.matchedProducts.length === 0)}
              >
                {isLoading ? <CircularProgress size={24} /> : 'インポート実行'}
              </Button>
            )}
          </Box>
        </Box>
      </Modal>
    </>
  );
};

export default RakutenCsvImportModal;
