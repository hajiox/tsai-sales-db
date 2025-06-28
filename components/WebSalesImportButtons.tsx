// /app/components/WebSalesImportButtons.tsx ver.2
import React, { useState } from 'react';
import { Button } from '@nextui-org/react';
import { Upload } from 'lucide-react';
import AmazonCsvImportModal from './AmazonCsvImportModal';
import RakutenCsvImportModal from './RakutenCsvImportModal'; // 楽天モーダルをインポート

interface WebSalesImportButtonsProps {
    onImportSuccess: () => void;
}

const WebSalesImportButtons: React.FC<WebSalesImportButtonsProps> = ({ onImportSuccess }) => {
    const [isAmazonModalOpen, setIsAmazonModalOpen] = useState(false);
    const [isRakutenModalOpen, setIsRakutenModalOpen] = useState(false); // 楽天モーダルの表示状態

    return (
        <div className="flex gap-2 mb-4">
            <Button
                color="warning"
                startContent={<Upload size={18} />}
                onPress={() => setIsAmazonModalOpen(true)}
            >
                Amazon CSVインポート
            </Button>
            
            {/* ★楽天用のボタンを追加★ */}
            <Button
                color="primary"
                startContent={<Upload size={18} />}
                onPress={() => setIsRakutenModalOpen(true)}
            >
                楽天CSVインポート
            </Button>

            <AmazonCsvImportModal
                isOpen={isAmazonModalOpen}
                onClose={() => setIsAmazonModalOpen(false)}
                onImportSuccess={onImportSuccess}
            />

            {/* ★楽天用のモーダルを呼び出し★ */}
            <RakutenCsvImportModal
                isOpen={isRakutenModalOpen}
                onClose={() => setIsRakutenModalOpen(false)}
                onImportSuccess={onImportSuccess}
            />
        </div>
    );
};

export default WebSalesImportButtons;
