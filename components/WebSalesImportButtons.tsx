// /app/components/WebSalesImportButtons.tsx ver.8 (ボタン表示名を短縮)
import React from 'react';
import { Button } from '@nextui-org/react';
import { Upload } from 'lucide-react';

import CommonCsvImportModal from './CommonCsvImportModal';
import AmazonCsvImportModal from './AmazonCsvImportModal';
import RakutenCsvImportModal from './RakutenCsvImportModal';

interface WebSalesImportButtonsProps {
    onImportSuccess: () => void;
}

const WebSalesImportButtons: React.FC<WebSalesImportButtonsProps> = ({ onImportSuccess }) => {
    return (
        <div className="flex flex-wrap gap-2 mb-4">
            <CommonCsvImportModal onImportSuccess={onImportSuccess} />
            <AmazonCsvImportModal onImportSuccess={onImportSuccess} />
            <RakutenCsvImportModal onImportSuccess={onImportSuccess} />
            
            <Button color="secondary" startContent={<Upload size={18} />} isDisabled>Yahoo</Button>
            <Button color="success" className="text-white" startContent={<Upload size={18} />} isDisabled>BASE</Button>
            <Button color="danger" variant="bordered" startContent={<Upload size={18} />} isDisabled>メルカリ</Button>
            <Button color="warning" variant="bordered" startContent={<Upload size={18} />} isDisabled>Qoo10</Button>
        </div>
    );
};

export default WebSalesImportButtons;
