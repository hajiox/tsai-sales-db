// /app/components/AmazonCsvImportModal.tsx ver.13 (自己完結型に修正)
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
    Chip,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableCell,
    useDisclosure,
} from "@nextui-org/react";
import { Upload, AlertTriangle, CheckCircle, Info, Edit } from 'lucide-react';

// --- 型定義 ---
interface ProductInfo {
  id: string;
  name: string;
}

interface UnmatchedProduct {
  amazonTitle: string;
  quantity: number;
}

interface MatchedProduct extends UnmatchedProduct {
  productId: string;
  productName: string;
  matchType: string;
}

interface ParseResult {
  matchedProducts: MatchedProduct[];
  unmatchedProducts: UnmatchedProduct[];
  totalProducts: number;
  totalQuantity: number;
  processableQuantity: number;
  blankTitleInfo: {
    count: number;
    quantity: number;
  };
}

interface AmazonCsvImportModalProps {
  onImportSuccess: () => void;
}

const AmazonCsvImportModal: React.FC<AmazonCsvImportModalProps> = ({ onImportSuccess }) => {
  // ★★★ 自己完結型にするための状態管理を追加 ★★★
  const [isOpen, setIsOpen] = useState(false);

  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [salesMonth, setSalesMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [editingProduct, setEditingProduct] = useState<UnmatchedProduct | null>(null);
  const [allProducts, setAllProducts] = useState<ProductInfo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setParseResult(null);
    setStep(1);
    setIsLoading(false);
    setError(null);
    setFileName('');
    setEditingProduct(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleOpen = () => setIsOpen(true);
  
  const handleClose = () => {
    setIsOpen(false);
    resetState();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsLoading(true);
    setError(null);

    try {
      const text = await file.text();
      const response = await fetch('/api/import/amazon-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent: text }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || '不明な解析エラー');
      }
      
      setParseResult(data.data);
      setAllProducts(data.allProducts || []);
      setStep(2);

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`解析エラー: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateMapping = (newProductId: string) => {
    if (!editingProduct || !parseResult) return;

    const updatedUnmatched = parseResult.unmatchedProducts.filter(
      p => p.amazonTitle !== editingProduct.amazonTitle
    );
    
    const productToMove = {
      ...editingProduct,
      productId: newProductId,
      productName: allProducts.find(p => p.id === newProductId)?.name || '不明な商品',
      matchType: 'manual'
    };

    const updatedMatched = [...parseResult.matchedProducts, productToMove];

    setParseResult({
      ...parseResult,
      matchedProducts: updatedMatched,
      unmatchedProducts: updatedUnmatched
    });
    
    setEditingProduct(null);
  };

  const handleConfirm = async () => {
    if (!parseResult) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/import/amazon-confirm', {
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
      
      onImportSuccess();
      handleClose();

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`インポートエラー: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <>
      {/* ★★★ 本来あるべきトリガーボタン ★★★ */}
      <Button
        color="warning"
        startContent={<Upload size={18} />}
        onPress={handleOpen}
      >
        Amazon
      </Button>

      {/* ★★★ モーダル部分を正しくラップ ★★★ */}
      <Modal isOpen={isOpen} onOpenChange={handleClose} size="5xl" scrollBehavior="inside">
        <ModalContent>
          <>
            <ModalHeader className="flex flex-col gap-1">Amazon CSVインポート</ModalHeader>
            <ModalBody>
              {isLoading && <Spinner label="処理中..." />}
              {error && <Card className="bg-danger-50 p-2"><CardBody>{error}</CardBody></Card>}
              
              {step === 1 && !isLoading && !error && (
                <div className="flex flex-col gap-4 items-center p-8 border-2 border-dashed rounded-xl">
                  <Input type="month" label="売上月" value={salesMonth} onChange={(e) => setSalesMonth(e.target.value)} className="max-w-xs" />
                  <Button color="primary" variant="ghost" onPress={() => fileInputRef.current?.click()}>ファイルを選択</Button>
                  <input type="file" accept=".csv, .txt" ref={fileInputRef} hidden onChange={handleFileChange} />
                  {fileName && <p>選択中のファイル: {fileName}</p>}
                </div>
              )}

              {step === 2 && parseResult && (
                <div>
                  {/* ... (中身のテーブル表示部分は変更なし) ... */}
                  <h3 className="text-lg font-semibold">内容確認</h3>
                   <Table aria-label="CSV確認テーブル">
                      <TableHeader>
                          <TableCell>商品名（Amazon）</TableCell>
                          <TableCell>DB商品名</TableCell>
                          <TableCell>数量</TableCell>
                          <TableCell>アクション</TableCell>
                      </TableHeader>
                      <TableBody>
                          {parseResult.matchedProducts.map((p, i) => (
                              <TableRow key={`matched-${i}`}>
                                  <TableCell>{p.amazonTitle}</TableCell>
                                  <TableCell>{p.productName}</TableCell>
                                  <TableCell>{p.quantity}</TableCell>
                                  <TableCell><Chip color="success">マッチ済</Chip></TableCell>
                              </TableRow>
                          ))}
                          {parseResult.unmatchedProducts.map((p, i) => (
                             <TableRow key={`unmatched-${i}`}>
                               <TableCell>{p.amazonTitle}</TableCell>
                               <TableCell>
                                   {editingProduct?.amazonTitle === p.amazonTitle ? (
                                       <select
                                           onChange={(e) => handleUpdateMapping(e.target.value)}
                                           defaultValue=""
                                       >
                                           <option value="" disabled>商品を選択...</option>
                                           {allProducts.map(ap => (
                                               <option key={ap.id} value={ap.id}>{ap.name}</option>
                                           ))}
                                       </select>
                                   ) : (
                                       <Chip color="danger">未マッチ</Chip>
                                   )}
                               </TableCell>
                               <TableCell>{p.quantity}</TableCell>
                               <TableCell>
                                   <Button isIconOnly size="sm" onPress={() => setEditingProduct(p)}><Edit size={16}/></Button>
                               </TableCell>
                             </TableRow>
                          ))}
                      </TableBody>
                   </Table>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={handleClose}>閉じる</Button>
              {step === 2 && (
                <Button color="primary" onPress={handleConfirm} isLoading={isLoading}>インポート実行</Button>
              )}
            </ModalFooter>
          </>
        </ModalContent>
      </Modal>
    </>
  );
};

export default AmazonCsvImportModal;
