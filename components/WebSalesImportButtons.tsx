// /app/components/WebSalesImportButtons.tsx ver.11 (正しいCSVコンポーネント名を反映)
import React from 'react';
import { Button } from '@nextui-org/react';
import { Upload } from 'lucide-react';

// 実装済みのコンポーネントをインポート
import CsvImportConfirmModal from './CsvImportConfirmModal';
import AmazonCsvImportModal from './AmazonCsvImportModal';
import RakutenCsvImportModal from './RakutenCsvImportModal';

interface WebSalesImportButtonsProps {
    onImportSuccess: () => void;
}

const WebSalesImportButtons: React.FC<WebSalesImportButtonsProps> = ({ onImportSuccess }) => {
    return (
        <div className="flex flex-wrap gap-2 mb-4">
            {/* 実装済みの機能 */}
            <CsvImportConfirmModal onImportSuccess={onImportSuccess} />
            <AmazonCsvImportModal onImportSuccess={onImportSuccess} />
            <RakutenCsvImportModal onImportSuccess={onImportSuccess} />
            
            {/* 未実装のダミーボタン（無効化状態） */}
            <Button color="secondary" startContent={<Upload size={18} />} isDisabled>Yahoo</Button>
            <Button color="success" className="text-white" startContent={<Upload size={18} />} isDisabled>BASE</Button>
            <Button color="danger" variant="bordered" startContent={<Upload size={18} />} isDisabled>メルカリ</Button>
            <Button color="warning" variant="bordered" startContent={<Upload size={18} />} isDisabled>Qoo10</Button>
        </div>
    );
};

export default WebSalesImportButtons;
