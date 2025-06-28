// /app/components/RakutenCsvImportModal.tsx ver.18 (エラー回避・ボタン削除)
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Spinner,
    Card,
    CardBody,
    Chip
} from "@nextui-org/react";
import { FileCheck, AlertTriangle, CheckCircle, Info } from 'lucide-react';

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
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
}

const RakutenCsvImportModal: React.FC<RakutenCsvImportModalProps> = ({ isOpen, onClose, onImportSuccess }) => {
  const [fileName, setFileName] = useState('');
  const [salesMonth, setSalesMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFileName('');
    setStep(1);
    setIsLoading(false);
    setError(null);
    setParseResult(null);
    setCsvContent(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  }, []);

  const handleModalClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFileName(selectedFile.name);
      setIsLoading(true);
      setError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          if (!arrayBuffer) throw new Error('ファイルの読み込みに失敗しました。');
          const decoder = new TextDecoder('shift-jis');
          const text = decoder.decode(arrayBuffer);
          setCsvContent(text);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`ファイルのデコードに失敗: ${message}`);
            setIsLoading(false);
        }
      };
      reader.onerror = () => {
        setError('ファイルリーダーでエラーが発生しました。');
        setIsLoading(false);
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  };

  const handleParse = useCallback(async (content: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/import/rakuten-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: content }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '不明な解析エラー');
      setParseResult(data);
      setStep(2);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`解析エラー: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (csvContent) {
      handleParse(csvContent);
    }
  }, [csvContent, handleParse]);

  const handleConfirm = async () => {
    if (!parseResult || !salesMonth) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/import/rakuten-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salesMonth, matchedProducts: parseResult.matchedProducts }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || '不明なインポートエラー');
      onImportSuccess();
      handleModalClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`インポートエラー: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // isOpenがfalseになったときに状態をリセットする
  useEffect(() => {
    if (!isOpen) {
      resetState();
    }
  }, [isOpen, resetState]);


  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} onClose={handleModalClose} size="3xl" scrollBehavior="inside">
      <ModalContent>
        <>
          <ModalHeader className="flex flex-col gap-1">楽天CSVインポート</ModalHeader>
          <ModalBody>
            {isLoading && <Spinner label="処理中..." color="primary" />}
            
            {error && (
                <Card className="bg-danger-50 p-4">
                    <CardBody>
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="text-danger" />
                            <p className="text-danger-700">{error}</p>
                        </div>
                    </CardBody>
                </Card>
            )}

            {step === 1 && !isLoading && !error && (
              <div className="flex flex-col gap-4 items-center p-8 border-2 border-dashed rounded-xl">
                <p>売上計上する年月を選択し、CSVファイルをアップロードしてください。</p>
                <Input
                  type="month"
                  label="売上月"
                  value={salesMonth}
                  onChange={(e) => setSalesMonth(e.target.value)}
                  className="max-w-xs"
                />
                <Button color="primary" variant="ghost" onPress={() => fileInputRef.current?.click()}>
                  ファイルを選択
                </Button>
                <input type="file" accept=".csv" ref={fileInputRef} hidden onChange={handleFileChange} />
                {fileName && <p>選択中のファイル: {fileName}</p>}
              </div>
            )}
            
            {step === 2 && parseResult && !isLoading && (
              <div className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold">数量チェック</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card><CardBody className="text-center"><h4>CSV総商品数</h4><p className="text-2xl">{parseResult.totalProducts}件</p></CardBody></Card>
                    <Card><CardBody className="text-center"><h4>総販売数量</h4><p className="text-2xl">{parseResult.totalQuantity}個</p></CardBody></Card>
                    <Card><CardBody className="text-center"><h4>処理可能数量</h4><p className="text-2xl text-success-500">{parseResult.processableQuantity}個</p></CardBody></Card>
                </div>

                <Card className="bg-success-50"><CardBody><div className="flex gap-2 items-center"><CheckCircle className="text-success-500"/><p>マッチ済み: {parseResult.matchedProducts.length}件の商品がDBと一致しました。</p></div></CardBody></Card>
                <Card className="bg-warning-50"><CardBody><div className="flex gap-2 items-center"><AlertTriangle className="text-warning-500"/><p>未マッチ: {parseResult.unmatchedProducts.length}件の商品はインポートされません。</p></div></CardBody></Card>

                {parseResult.blankTitleInfo.count > 0 && (
                    <Chip color="default" variant="flat" startContent={<Info size={16}/>}>
                        商品名が空欄の行が{parseResult.blankTitleInfo.count}件（合計{parseResult.blankTitleInfo.quantity}個）あり、無視されました。
                    </Chip>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onPress={step === 1 ? handleModalClose : () => setStep(1)} disabled={isLoading}>
              {step === 1 ? '閉じる' : '← 戻る'}
            </Button>
            {step === 2 && (
              <Button color="primary" onPress={handleConfirm} isLoading={isLoading} disabled={!parseResult || parseResult.matchedProducts.length === 0}>
                インポート実行
              </Button>
            )}
          </ModalFooter>
        </>
      </ModalContent>
    </Modal>
  );
};

export default RakutenCsvImportModal;
