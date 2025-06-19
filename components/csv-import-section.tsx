// /components/csv-import-section.tsx ver.1 (新規作成)
"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

export default function CsvImportSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>CSV一括インポート</CardTitle>
        <CardDescription>
          各ECサイトからダウンロードした売上実績CSVファイルをアップロードして、一括でデータを取り込みます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Amazon */}
          <div className="space-y-2">
            <Label htmlFor="amazon-csv">Amazon</Label>
            <div className="flex gap-2">
              <Input id="amazon-csv" type="file" className="flex-grow" />
              <Button>読込</Button>
            </div>
          </div>
          {/* Rakuten */}
          <div className="space-y-2">
            <Label htmlFor="rakuten-csv">Rakuten</Label>
            <div className="flex gap-2">
              <Input id="rakuten-csv" type="file" className="flex-grow" />
              <Button>読込</Button>
            </div>
          </div>
          {/* Yahoo */}
          <div className="space-y-2">
            <Label htmlFor="yahoo-csv">Yahoo!ショッピング</Label>
            <div className="flex gap-2">
              <Input id="yahoo-csv" type="file" className="flex-grow" />
              <Button>読込</Button>
            </div>
          </div>
          {/* Mercari */}
          <div className="space-y-2">
            <Label htmlFor="mercari-csv">メルカリShops</Label>
            <div className="flex gap-2">
              <Input id="mercari-csv" type="file" className="flex-grow" />
              <Button>読込</Button>
            </div>
          </div>
           {/* Qoo10 */}
          <div className="space-y-2">
            <Label htmlFor="qoo10-csv">Qoo10</Label>
            <div className="flex gap-2">
              <Input id="qoo10-csv" type="file" className="flex-grow" />
              <Button>読込</Button>
            </div>
          </div>
          {/* Base */}
          <div className="space-y-2">
            <Label htmlFor="base-csv">BASE</Label>
            <div className="flex gap-2">
              <Input id="base-csv" type="file" className="flex-grow" />
              <Button>読込</Button>
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end">
         <Button size="lg" disabled>（未実装）選択したファイルを一括読込</Button>
      </CardFooter>
    </Card>
  )
}
