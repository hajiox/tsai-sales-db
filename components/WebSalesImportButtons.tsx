// /app/components/WebSalesImportButtons.tsx ver.4 (楽天機能を追加統合)
import React from 'react';
import AmazonCsvImportModal from './AmazonCsvImportModal';
import YahooCsvImportModal from './YahooCsvImportModal';
import BaseCsvImportModal from './BaseCsvImportModal';
import RakutenCsvImportModal from './RakutenCsvImportModal'; // 楽天モーダルを追加

interface WebSalesImportButtonsProps {
    onImportSuccess: () => void;
}

const WebSalesImportButtons: React.FC<WebSalesImportButtonsProps> = ({ onImportSuccess }) => {
    return (
        <div className="flex flex-wrap gap-2 mb-4">
            <AmazonCsvImportModal onImportSuccess={onImportSuccess} />
            <YahooCsvImportModal onImportSuccess={onImportSuccess} />
            <BaseCsvImportModal onImportSuccess={onImportSuccess} />
            <RakutenCsvImportModal onImportSuccess={onImportSuccess} />
        </div>
    );
};

export default WebSalesImportButtons;
