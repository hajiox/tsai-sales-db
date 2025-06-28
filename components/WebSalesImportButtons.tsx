// /app/components/WebSalesImportButtons.tsx ver.3 (正しい構造に修正)
import React from 'react';
import AmazonCsvImportModal from './AmazonCsvImportModal';
import RakutenCsvImportModal from './RakutenCsvImportModal';

interface WebSalesImportButtonsProps {
    onImportSuccess: () => void;
}

const WebSalesImportButtons: React.FC<WebSalesImportButtonsProps> = ({ onImportSuccess }) => {
    return (
        <div className="flex gap-2 mb-4">
            {/* 各モーダルコンポーネントが、それぞれ自身のボタンを持つ */}
            <AmazonCsvImportModal onImportSuccess={onImportSuccess} />
            <RakutenCsvImportModal onImportSuccess={onImportSuccess} />
        </div>
    );
};

export default WebSalesImportButtons;
