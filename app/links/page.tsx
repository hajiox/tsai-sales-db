// /app/links/page.tsx ver.7
"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, ExternalLink, Pencil, Trash2, Loader2, Search, ChevronUp, ChevronDown, Upload } from "lucide-react"

interface CompanyLink {
  id: string
  url: string
  title: string | null
  description: string | null
  og_image: string | null
  memo: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export default function LinksPage() {
  const [links, setLinks] = useState<CompanyLink[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingLink, setEditingLink] = useState<CompanyLink | null>(null)
  const [formUrl, setFormUrl] = useState("")
  const [formTitle, setFormTitle] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formOgImage, setFormOgImage] = useState("")
  const [formMemo, setFormMemo] = useState("")
  const [formSortOrder, setFormSortOrder] = useState(0)
  const [fetchingOgp, setFetchingOgp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchLinks = async () => {
    try {
      const res = await fetch("/api/links")
      const data = await res.json()
      if (Array.isArray(data)) {
        setLinks(data)
      }
    } catch (error) {
      console.error("リンク取得エラー:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLinks()
  }, [])

  const handleFetchOgp = async () => {
    if (!formUrl) return
    setFetchingOgp(true)
    try {
      const res = await fetch("/api/links/fetch-ogp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: formUrl }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setFormTitle(json.data.title || "")
        setFormDescription(json.data.description || "")
        setFormOgImage(json.data.og_image || "")
        if (json.data.url) {
          setFormUrl(json.data.url)
        }
      } else {
        alert(json.error || "OGP情報の取得に失敗しました")
      }
    } catch (error) {
      console.error("OGP取得エラー:", error)
      alert("OGP情報の取得に失敗しました")
    } finally {
      setFetchingOgp(false)
    }
  }

  const openNewModal = () => {
    setEditingLink(null)
    setFormUrl("")
    setFormTitle("")
    setFormDescription("")
    setFormOgImage("")
    setFormMemo("")
    const maxOrder = links.length > 0 ? Math.max(...links.map(l => l.sort_order)) : -1
    setFormSortOrder(maxOrder + 1)
    setShowModal(true)
  }

  const openEditModal = (link: CompanyLink) => {
    setEditingLink(link)
    setFormUrl(link.url)
    setFormTitle(link.title || "")
    setFormDescription(link.description || "")
    setFormOgImage(link.og_image || "")
    setFormMemo(link.memo || "")
    setFormSortOrder(link.sort_order)
    setShowModal(true)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // ファイルサイズチェック (5MB制限)
    if (file.size > 5 * 1024 * 1024) {
      alert("ファイルサイズは5MB以下にしてください")
      return
    }

    // 画像ファイルかチェック
    if (!file.type.startsWith("image/")) {
      alert("画像ファイルを選択してください")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/links/upload-image", {
        method: "POST",
        body: formData,
      })

      const json = await res.json()
      if (json.success && json.url) {
        setFormOgImage(json.url)
      } else {
        alert(json.error || "アップロードに失敗しました")
      }
    } catch (error) {
      console.error("アップロードエラー:", error)
      alert("アップロードに失敗しました")
    } finally {
      setUploading(false)
      // ファイル入力をリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleSave = async () => {
    if (!formUrl) {
      alert("URLを入力してください")
      return
    }
    setSaving(true)
    try {
      const payload = {
        url: formUrl,
        title: formTitle,
        description: formDescription,
        og_image: formOgImage,
        memo: formMemo,
        sort_order: formSortOrder,
      }

      console.log("Saving link...", { editingLink, payload })

      let res
      if (editingLink) {
        if (!editingLink.id || editingLink.id === 'undefined') {
          console.error("Link ID is missing or 'undefined'", editingLink)
          alert("リンクIDが不正です。再読み込みしてください。")
          setSaving(false)
          return
        }
        console.log(`Updating link ${editingLink.id}`)
        res = await fetch(`/api/links/${editingLink.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch("/api/links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        setShowModal(false)
        fetchLinks()
      } else {
        const errorData = await res.json()
        console.error("Save failed response:", errorData)
        alert(`保存に失敗しました: ${errorData.error || res.statusText}`)
      }
    } catch (error) {
      console.error("保存エラー:", error)
      alert("保存に失敗しました")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("このリンクを削除しますか?")) return
    try {
      const res = await fetch(`/api/links/${id}`, { method: "DELETE" })
      if (res.ok) {
        fetchLinks()
      } else {
        alert("削除に失敗しました")
      }
    } catch (error) {
      console.error("削除エラー:", error)
      alert("削除に失敗しました")
    }
  }

  const handleMoveUp = async (index: number) => {
    if (index === 0) return
    const currentLink = links[index]
    const prevLink = links[index - 1]
    try {
      await fetch(`/api/links/${currentLink.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentLink, sort_order: prevLink.sort_order }),
      })
      await fetch(`/api/links/${prevLink.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prevLink, sort_order: currentLink.sort_order }),
      })
      fetchLinks()
    } catch (error) {
      console.error("移動エラー:", error)
      alert("移動に失敗しました")
    }
  }

  const handleMoveDown = async (index: number) => {
    if (index === links.length - 1) return
    const currentLink = links[index]
    const nextLink = links[index + 1]
    try {
      await fetch(`/api/links/${currentLink.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...currentLink, sort_order: nextLink.sort_order }),
      })
      await fetch(`/api/links/${nextLink.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...nextLink, sort_order: currentLink.sort_order }),
      })
      fetchLinks()
    } catch (error) {
      console.error("移動エラー:", error)
      alert("移動に失敗しました")
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">自社リンク集</h1>
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4 mr-2" />
          リンク追加
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          リンクがありません。「リンク追加」から追加してください。
        </div>
      ) : (
        <div className="grid gap-4">
          {links.map((link, index) => (
            <div key={link.id} className="bg-white border rounded-lg p-4 flex gap-4 hover:shadow-md transition-shadow">
              <div className="flex-shrink-0 flex flex-col justify-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleMoveUp(index)} disabled={index === 0} className="h-6 w-6 p-0">
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleMoveDown(index)} disabled={index === links.length - 1} className="h-6 w-6 p-0">
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-shrink-0 w-32 h-20 bg-gray-100 rounded overflow-hidden">
                {link.og_image ? (
                  <img src={link.og_image} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <ExternalLink className="w-8 h-8" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-blue-600 hover:underline truncate block">{link.title || link.url}</a>
                {link.description && (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{link.description}</p>
                )}
                {link.memo && (
                  <p className="text-sm text-orange-600 mt-1 bg-orange-50 px-2 py-1 rounded inline-block">メモ: {link.memo}</p>
                )}
                <p className="text-xs text-gray-400 mt-2 truncate">{link.url}</p>
              </div>

              <div className="flex-shrink-0 flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditModal(link)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(link.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold mb-4">{editingLink ? "リンク編集" : "リンク追加"}</h2>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">URL *</label>
                <div className="flex gap-2">
                  <Input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://example.com" className="flex-1" />
                  <Button type="button" variant="outline" onClick={handleFetchOgp} disabled={fetchingOgp || !formUrl}>
                    {fetchingOgp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span className="ml-1">取得</span>
                  </Button>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">タイトル</label>
                <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="ページタイトル" />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">説明</label>
                <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="ページの説明" className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px]" />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">OGP画像</label>
                <div className="flex gap-2">
                  <Input
                    value={formOgImage}
                    onChange={(e) => setFormOgImage(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="flex-1"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span className="ml-1">アップロード</span>
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">URLを入力するか、画像をアップロードしてください（5MB以下）</p>
                {formOgImage && (
                  <div className="mt-2 w-32 h-20 bg-gray-100 rounded overflow-hidden">
                    <img src={formOgImage} alt="プレビュー" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }} />
                  </div>
                )}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">メモ</label>
                <textarea value={formMemo} onChange={(e) => setFormMemo(e.target.value)} placeholder="自由にメモを入力" className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px]" />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowModal(false)} disabled={saving}>キャンセル</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  {editingLink ? "更新" : "追加"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
