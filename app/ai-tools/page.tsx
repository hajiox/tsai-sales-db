// /app/ai-tools/page.tsx ver.2
'use client';

import { useState, useEffect } from 'react';

interface AITool {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  og_image: string | null;
  login_method: string;
  account: string | null;
  password: string | null;
  memo: string | null;
  created_at: string;
}

export default function AIToolsPage() {
  const [tools, setTools] = useState<AITool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 新規追加フォーム
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newOgImage, setNewOgImage] = useState('');
  const [newLoginMethod, setNewLoginMethod] = useState('google');
  const [newAccount, setNewAccount] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [isFetchingOgp, setIsFetchingOgp] = useState(false);

  // 編集フォーム
  const [editUrl, setEditUrl] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOgImage, setEditOgImage] = useState('');
  const [editLoginMethod, setEditLoginMethod] = useState('google');
  const [editAccount, setEditAccount] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editMemo, setEditMemo] = useState('');

  // データ取得
  const fetchTools = async () => {
    try {
      const res = await fetch('/api/ai-tools');
      const data = await res.json();
      if (Array.isArray(data)) {
        setTools(data);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  // OGP取得（新規追加用）
  const fetchOgpForNew = async () => {
    if (!newUrl.trim()) {
      alert('URLを入力してください');
      return;
    }

    setIsFetchingOgp(true);
    try {
      const res = await fetch('/api/links/fetch-ogp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl })
      });
      const result = await res.json();
      if (result.success && result.data) {
        setNewTitle(result.data.title || '');
        setNewDescription(result.data.description || '');
        setNewOgImage(result.data.image || '');
        alert('OGP情報を取得しました');
      } else {
        alert('OGP情報の取得に失敗しました');
      }
    } catch (error) {
      console.error('OGP取得エラー:', error);
      alert('OGP情報の取得に失敗しました');
    } finally {
      setIsFetchingOgp(false);
    }
  };

  // OGP取得（編集用）
  const fetchOgpForEdit = async () => {
    if (!editUrl.trim()) {
      alert('URLを入力してください');
      return;
    }

    setIsFetchingOgp(true);
    try {
      const res = await fetch('/api/links/fetch-ogp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: editUrl })
      });
      const result = await res.json();
      if (result.success && result.data) {
        setEditTitle(result.data.title || '');
        setEditDescription(result.data.description || '');
        setEditOgImage(result.data.image || '');
        alert('OGP情報を取得しました');
      } else {
        alert('OGP情報の取得に失敗しました');
      }
    } catch (error) {
      console.error('OGP取得エラー:', error);
      alert('OGP情報の取得に失敗しました');
    } finally {
      setIsFetchingOgp(false);
    }
  };

  // 新規追加
  const handleAdd = async () => {
    if (!newUrl.trim()) {
      alert('URLを入力してください');
      return;
    }

    try {
      const res = await fetch('/api/ai-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newUrl,
          title: newTitle,
          description: newDescription,
          og_image: newOgImage,
          login_method: newLoginMethod,
          account: newAccount || null,
          password: newPassword || null,
          memo: newMemo || null
        })
      });

      if (res.ok) {
        setNewUrl('');
        setNewTitle('');
        setNewDescription('');
        setNewOgImage('');
        setNewLoginMethod('google');
        setNewAccount('');
        setNewPassword('');
        setNewMemo('');
        setIsAdding(false);
        fetchTools();
      }
    } catch (error) {
      console.error('追加エラー:', error);
      alert('追加に失敗しました');
    }
  };

  // 編集開始
  const startEdit = (tool: AITool) => {
    setEditingId(tool.id);
    setEditUrl(tool.url);
    setEditTitle(tool.title || '');
    setEditDescription(tool.description || '');
    setEditOgImage(tool.og_image || '');
    setEditLoginMethod(tool.login_method);
    setEditAccount(tool.account || '');
    setEditPassword(tool.password || '');
    setEditMemo(tool.memo || '');
  };

  // 更新
  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch(`/api/ai-tools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: editUrl,
          title: editTitle,
          description: editDescription,
          og_image: editOgImage,
          login_method: editLoginMethod,
          account: editAccount || null,
          password: editPassword || null,
          memo: editMemo || null
        })
      });

      if (res.ok) {
        setEditingId(null);
        fetchTools();
      }
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm('このAIツールを削除しますか？')) return;

    try {
      const res = await fetch(`/api/ai-tools/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        fetchTools();
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
    }
  };

  if (isLoading) {
    return <div className="p-8">読み込み中...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">使用可能AI</h1>
        <button onClick={() => setIsAdding(!isAdding)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          {isAdding ? 'キャンセル' : '+ 新規追加'}
        </button>
      </div>

      {isAdding && (
        <div className="mb-6 p-6 bg-gray-50 rounded-lg border">
          <h2 className="text-lg font-semibold mb-4">新規AIツール追加</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">URL *</label>
              <div className="flex gap-2">
                <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="flex-1 px-3 py-2 border rounded" placeholder="https://..." disabled={isFetchingOgp} />
                <button onClick={fetchOgpForNew} disabled={isFetchingOgp} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 whitespace-nowrap">
                  {isFetchingOgp ? '取得中...' : 'OGP取得'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">タイトル</label>
              <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full px-3 py-2 border rounded bg-gray-100" readOnly />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">説明</label>
              <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="w-full px-3 py-2 border rounded bg-gray-100" readOnly />
            </div>
            {newOgImage && (
              <div>
                <label className="block text-sm font-medium mb-1">OGP画像</label>
                <img src={newOgImage} alt="OGP" className="w-32 h-32 object-cover rounded border" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">ログイン方法 *</label>
              <select value={newLoginMethod} onChange={(e) => setNewLoginMethod(e.target.value)} className="w-full px-3 py-2 border rounded">
                <option value="google">Googleログイン</option>
                <option value="direct">直接入力</option>
              </select>
            </div>
            {newLoginMethod === 'direct' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">アカウント</label>
                  <input type="text" value={newAccount} onChange={(e) => setNewAccount(e.target.value)} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">パスワード</label>
                  <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 border rounded" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">説明</label>
                  <textarea value={newMemo} onChange={(e) => setNewMemo(e.target.value)} className="w-full px-3 py-2 border rounded" rows={4} />
                </div>
              </>
            )}
            <button onClick={handleAdd} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              追加
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {tools.length === 0 ? (
          <p className="text-gray-500">登録されたAIツールはありません</p>
        ) : (
          tools.map((tool) => (
            <div key={tool.id} className="border rounded-lg p-6 bg-white">
              {editingId === tool.id ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">URL</label>
                    <div className="flex gap-2">
                      <input type="url" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="flex-1 px-3 py-2 border rounded" />
                      <button onClick={fetchOgpForEdit} disabled={isFetchingOgp} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 whitespace-nowrap">
                        {isFetchingOgp ? '取得中...' : 'OGP取得'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">タイトル</label>
                    <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3 py-2 border rounded bg-gray-100" readOnly />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">説明</label>
                    <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="w-full px-3 py-2 border rounded bg-gray-100" readOnly />
                  </div>
                  {editOgImage && (
                    <div>
                      <label className="block text-sm font-medium mb-1">OGP画像</label>
                      <img src={editOgImage} alt="OGP" className="w-32 h-32 object-cover rounded border" />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium mb-1">ログイン方法</label>
                    <select value={editLoginMethod} onChange={(e) => setEditLoginMethod(e.target.value)} className="w-full px-3 py-2 border rounded">
                      <option value="google">Googleログイン</option>
                      <option value="direct">直接入力</option>
                    </select>
                  </div>
                  {editLoginMethod === 'direct' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1">アカウント</label>
                        <input type="text" value={editAccount} onChange={(e) => setEditAccount(e.target.value)} className="w-full px-3 py-2 border rounded" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">パスワード</label>
                        <input type="text" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="w-full px-3 py-2 border rounded" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">説明</label>
                        <textarea value={editMemo} onChange={(e) => setEditMemo(e.target.value)} className="w-full px-3 py-2 border rounded" rows={4} />
                      </div>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => handleUpdate(tool.id)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">キャンセル</button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex gap-4">
                    {tool.og_image && (
                      <img src={tool.og_image} alt={tool.title || ''} className="w-32 h-32 object-cover rounded" />
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2">{tool.title || 'タイトルなし'}</h3>
                      <p className="text-sm text-gray-600 mb-2">{tool.description}</p>
                      <a href={tool.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm break-all">{tool.url}</a>
                      <div className="mt-3 text-sm">
                        <p><strong>ログイン方法:</strong> {tool.login_method === 'google' ? 'Googleログイン' : '直接入力'}</p>
                        {tool.login_method === 'direct' && (
                          <>
                            {tool.account && <p><strong>アカウント:</strong> {tool.account}</p>}
                            {tool.password && <p><strong>パスワード:</strong> {tool.password}</p>}
                            {tool.memo && <p className="mt-2"><strong>説明:</strong> {tool.memo}</p>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => startEdit(tool)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">編集</button>
                    <button onClick={() => handleDelete(tool.id)} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">削除</button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
