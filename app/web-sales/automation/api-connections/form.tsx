"use client";
import { useEffect,useState } from "react";
const groups=[
  {title:"Amazon 商品売上・EC控除",prefix:"AMAZON_SP_API_",names:["CLIENT_ID","CLIENT_SECRET","REFRESH_TOKEN","ACCESS_TOKEN","SELLER_ID"],help:"店舗自身のSP-API認可と、販売レポート・精算の読取権限が必要です。販売者IDで対象店舗を固定します。"},
  {title:"楽天 商品売上",prefix:"RAKUTEN_RMS_",names:["SERVICE_SECRET","LICENSE_KEY"],help:"RMS WEB SERVICEの店舗所有アプリでsearchOrder・getOrderを許可します。BillPay・RPPは公式ファイルを使用します。"},
  {title:"BASE 商品売上・EC控除",prefix:"BASE_",names:["CLIENT_ID","CLIENT_SECRET","REFRESH_TOKEN","ACCESS_TOKEN","SHOP_ID","REDIRECT_URI"],help:"read_users・read_orders、控除にはread_savingsも必要です。SHOP_IDと登録済みの正確なredirect URIを指定します。返金や月額料金などAPIで確定できない費用は原本で補完します。"},
  {title:"Amazon 広告",prefix:"AMAZON_ADS_",names:["CLIENT_ID","CLIENT_SECRET","REFRESH_TOKEN","PROFILE_ID"],help:"SP-APIとは別のAmazon Ads API認可が必要です。日本の広告プロフィールと通貨JPYを検証します。"},
  {title:"Meta 広告",prefix:"META_",names:["ACCESS_TOKEN","AD_ACCOUNT_ID"],help:"対象広告アカウントのads_read認可が必要です。SNS投稿の認可だけでは取得できません。"},
];
const labels:Record<string,string>={CLIENT_ID:"クライアントID",CLIENT_SECRET:"クライアント秘密鍵",REFRESH_TOKEN:"更新トークン",ACCESS_TOKEN:"アクセストークン（短期利用）",SELLER_ID:"販売者・ストアID",SHOP_ID:"ショップID",REDIRECT_URI:"登録済みのリダイレクトURI",SERVICE_SECRET:"serviceSecret",LICENSE_KEY:"ライセンスキー",PROFILE_ID:"広告プロフィールID",AD_ACCOUNT_ID:"広告アカウントID"};
export default function ConnectionForm() {
  const [configured,setConfigured]=useState<Set<string>>(new Set()); const [values,setValues]=useState<Record<string,string>>({});
  const [message,setMessage]=useState("");const [saving,setSaving]=useState(false);
  async function load(){const response=await fetch("/api/web-sales/acquisition/connections",{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error||"接続状態を取得できません");setConfigured(new Set((data.settings as {name:string;configured:boolean}[]).filter(s=>s.configured).map(s=>s.name)));}
  useEffect(()=>{load().catch(e=>setMessage(e.message));},[]);
  async function save(event:React.FormEvent){event.preventDefault();const entries=Object.fromEntries(Object.entries(values).filter(([,v])=>v.trim()));if(!Object.keys(entries).length){setMessage("変更する接続情報を入力してください");return;}setSaving(true);setMessage("");try{const response=await fetch("/api/web-sales/acquisition/connections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({values:entries})});const data=await response.json();if(!response.ok)throw new Error(data.error);setValues({});await load();setMessage(data.message);}catch(e){setMessage(e instanceof Error?e.message:"保存できません");}finally{setSaving(false);}}
  return <div className="space-y-5"><form onSubmit={save} className="space-y-5"><p className="rounded border bg-blue-50 p-3 text-sm">Google広告は既存のAPI接続を使用します。取得は事務所PCのAPI処理で順に実行し、AIの利用枠を消費しません。</p>
    {groups.map(group=><fieldset key={group.prefix} className="space-y-3 rounded border p-4"><legend className="px-2 font-semibold">{group.title}</legend><p className="text-sm text-gray-600">{group.help}</p>
      <div className="grid gap-3 sm:grid-cols-2">{group.names.map(name=>{const key=group.prefix+name;return <label key={key} className="block space-y-1 text-sm"><span>{labels[name]} <span className={configured.has(key)?"text-green-700":"text-gray-500"}>{configured.has(key)?"設定済み":"未設定"}</span></span>
        <input name={key} autoComplete="off" type={/SECRET|TOKEN|KEY/.test(name)?"password":"text"} maxLength={16000} value={values[key]||""} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))} className="w-full rounded border p-2" placeholder={configured.has(key)?"変更するときだけ入力":"接続情報を入力"}/></label>})}</div></fieldset>)}
    <button type="submit" disabled={saving} className="rounded bg-blue-700 px-5 py-2 text-white disabled:opacity-50">{saving?"保存中":"接続情報を保存"}</button><p role="status" className="text-sm">{message}</p></form>
    <p className="rounded border bg-slate-50 p-3 text-sm">Yahoo!の商品売上・EC控除・アイテムリーチ広告費はBridgeで取得します。保存済みのAPI認証情報は保持しています。</p>
    </div>;
}
