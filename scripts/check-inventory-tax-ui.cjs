const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const puppeteer=require('puppeteer'),XLSX=require('xlsx'),{encode}=require('next-auth/jwt');
require('dotenv').config({path:path.join(__dirname,'..','.env.local'),quiet:true});
(async()=>{
const base=process.argv[2]||'http://localhost:3047',secure=base.startsWith('https:'),name=secure?'__Secure-next-auth.session-token':'next-auth.session-token';
const token=await encode({secret:process.env.NEXTAUTH_SECRET,token:{email:'aizubrandhall@gmail.com'},maxAge:1200});
const response=await fetch(base+'/api/finance/closing-inventory?fiscalYear=2026',{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);const report=await response.json();
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tsa-inventory-tax-ui-')),browser=await puppeteer.launch({headless:true});
try{const page=await browser.newPage();await page.setCookie({name,value:token,url:base,httpOnly:true,secure});await page.setViewport({width:1440,height:1050});
const errors=[];page.on('pageerror',e=>errors.push(e.message));const client=await page.createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:directory});
for(const key of ['brand','manufacturing','warehouse','partner','food']){
 const rows=report.rows.filter(r=>r.key.startsWith(key+'-')),target=rows[0].href;await page.goto(base+target,{waitUntil:'networkidle0',timeout:120000});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>(b.textContent.includes('Excel出力')||b.title==='Excel出力')&&!b.disabled),{timeout:60000});
 const text=await page.$eval('body',b=>b.innerText);assert.ok(text.includes('税別')&&text.includes('税込'),key+' tax labels');
 const before=new Set(fs.readdirSync(directory));await page.$$eval('button',bs=>bs.find(b=>b.textContent.includes('Excel出力')||b.title==='Excel出力').click());
 let file;for(let i=0;i<120;i++){file=fs.readdirSync(directory).find(f=>f.endsWith('.xlsx')&&!before.has(f));if(file)break;await new Promise(r=>setTimeout(r,250));}assert.ok(file,key+' Excel download');
 const book=XLSX.readFile(path.join(directory,file));const cells=Object.values(book.Sheets).flatMap(s=>Object.entries(s).filter(([a])=>!a.startsWith('!')).map(([,c])=>c.v));assert.ok(cells.some(v=>typeof v==='string'&&v.includes('税別'))&&cells.some(v=>typeof v==='string'&&v.includes('税込')),key+' Excel labels');
 if(key==='manufacturing'||key==='brand'){
   const data=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);for(const [field,expected] of [['棚卸原価（税別）','amountExcluded'],['棚卸原価（税込）','amountIncluded']])assert.equal(data.reduce((s,r)=>s+(Number(r[field])||0),0),rows.reduce((s,r)=>s+r[expected],0),key+' '+field);
 } else if(key==='warehouse'){
   const sheet=book.Sheets[book.SheetNames[0]];assert.equal(sheet.B6.v,rows[0].amountExcluded);assert.equal(sheet.D6.v,rows[0].amountIncluded);
 } else if(key==='partner'){
   const data=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}),total=data.find(r=>r[1]==='合計');assert.equal(total[8],rows[0].amountIncluded);assert.equal(total[11],rows[0].amountExcluded);
 } else {
   const data=XLSX.utils.sheet_to_json(book.Sheets['合計'],{header:1}),total=data.find(r=>r[0]==='合計');assert.deepEqual(total.slice(-2),[rows.reduce((s,r)=>s+r.amountExcluded,0),rows.reduce((s,r)=>s+r.amountIncluded,0)]);
 }
 await page.screenshot({path:path.join(directory,key+'.png')});
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(directory,key+'-mobile.png')});
 console.log(JSON.stringify({key,file,excluded:rows.reduce((s,r)=>s+r.amountExcluded,0),included:rows.reduce((s,r)=>s+r.amountIncluded,0),mobileOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)}));await page.setViewport({width:1440,height:1050});
}
for(const url of ['/wholesale/inventory/print?fiscalYear=2026','/wholesale/inventory/other-stores/print?fiscalYear=2026']){await page.goto(base+url,{waitUntil:'networkidle0',timeout:120000});await page.waitForSelector('tbody tr');const text=await page.$eval('body',b=>b.innerText);assert.ok(text.includes('税別')&&text.includes('税込'));}
assert.deepEqual(errors,[]);console.log('PASS all five Excel exports reconcile with final summary; both print pages; artifacts '+directory);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
