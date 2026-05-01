// /components/web-sales-ai-section.tsx
"use client"

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Target, Send, Bot, User } from 'lucide-react';

interface WebSalesAISectionProps {
  month: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export default function WebSalesAISection({ month }: WebSalesAISectionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/web-sales-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, month })
      });

      const data = await response.json();

      if (data.success && data.reply) {
        setMessages(prev => [...prev, { role: 'model', text: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'model', text: `エラーが発生しました: ${data.error || '不明なエラー'}` }]);
      }
    } catch (err) {
      console.error('Chat Error:', err);
      setMessages(prev => [...prev, { role: 'model', text: '通信エラーが発生しました。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 内部Markdown簡易パース（太字と見出しとリスト）
  const renderText = (text: string) => {
    return text.split('\n').map((line, i) => {
      // 簡易的なマークダウン処理
      let parsedLine = line;
      // Bold: **text**
      parsedLine = parsedLine.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Heading: ## text or ### text
      if (parsedLine.startsWith('### ')) {
        return <h3 key={i} className="text-md font-bold mt-3 mb-1" dangerouslySetInnerHTML={{ __html: parsedLine.substring(4) }} />;
      }
      if (parsedLine.startsWith('## ')) {
        return <h2 key={i} className="text-lg font-bold mt-4 mb-2 border-b pb-1" dangerouslySetInnerHTML={{ __html: parsedLine.substring(3) }} />;
      }
      // List item
      if (parsedLine.trim().startsWith('- ')) {
        return <li key={i} className="ml-4 list-disc" dangerouslySetInnerHTML={{ __html: parsedLine.substring(2) }} />;
      }
      if (parsedLine.trim().startsWith('* ')) {
        return <li key={i} className="ml-4 list-disc" dangerouslySetInnerHTML={{ __html: parsedLine.substring(2) }} />;
      }
      
      return (
        <span key={i}>
          <span dangerouslySetInnerHTML={{ __html: parsedLine }} />
          <br />
        </span>
      );
    });
  };

  return (
    <div id="ai-analysis-section" className="space-y-6">
      <Card className="bg-white border-indigo-200 shadow-sm flex flex-col h-[600px]">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-cyan-50 border-b border-indigo-100 py-4">
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-indigo-800">
            <Sparkles className="w-6 h-6 text-yellow-500" />
            WEB販売 AIデータアナリスト (Gemini 2.5 Pro)
            <Target className="w-6 h-6 text-indigo-600 ml-auto opacity-20" />
          </CardTitle>
          <p className="text-sm text-indigo-600 font-medium mt-1">
            {month} を基準とした過去6ヶ月のDBデータを読み込んでいます。自由に質問してください。
          </p>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-gray-500">
              <Bot className="w-16 h-16 text-indigo-200" />
              <p>過去6ヶ月の売上データ、商品トレンドを把握しています。</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => setInput('今月の売上が最も良かったシリーズとその理由を推測して')}>
                  売上の良かったシリーズは？
                </Button>
                <Button variant="outline" size="sm" onClick={() => setInput('過去6ヶ月で急激に衰退している商品はある？対策は？')}>
                  衰退している商品は？
                </Button>
                <Button variant="outline" size="sm" onClick={() => setInput('来月の売上を伸ばすための具体的なアクションを3つ提案して')}>
                  売上を伸ばすアクションは？
                </Button>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'}`}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={`p-4 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-50 text-indigo-900 rounded-tr-sm' : 'bg-gray-50 text-gray-800 border border-gray-200 rounded-tl-sm'}`}>
                    <div className="text-sm leading-relaxed space-y-1">
                      {msg.role === 'user' ? (
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      ) : (
                        renderText(msg.text)
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] flex gap-3 flex-row">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 text-white flex items-center justify-center mt-1">
                  <Bot size={16} />
                </div>
                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 rounded-tl-sm flex items-center gap-2 h-12">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="AIに自由に質問・分析依頼を入力してください (Shift+Enterで改行)"
              className="flex-1 resize-none rounded-lg border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[60px] max-h-[120px] text-sm"
              rows={2}
            />
            <Button 
              onClick={handleSend} 
              disabled={isLoading || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 h-auto px-6"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
