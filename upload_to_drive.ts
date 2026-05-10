import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';

const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH!;
const auth = new google.auth.GoogleAuth({
  keyFile: keyFilePath,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

async function main() {
  // List all files visible to the service account
  const res = await drive.files.list({
    fields: 'files(id, name, mimeType, parents)',
    pageSize: 50,
    orderBy: 'modifiedTime desc',
  });
  
  const files = res.data.files || [];
  console.log(`Found ${files.length} files:`);
  for (const f of files) {
    console.log(`  ${f.name} (${f.mimeType}) id=${f.id} parents=${f.parents?.join(',')}`);
  }

  // Now try uploading to root
  const localPath = path.resolve(__dirname, '全体開発.md');
  const content = fs.readFileSync(localPath, 'utf-8');
  
  // Find existing file by name
  const existing = await drive.files.list({
    q: `name = 'TSA開発_全体開発.md' and trashed = false`,
    fields: 'files(id, name, parents)',
  });
  
  const existingFiles = existing.data.files || [];
  console.log(`\nExisting 'TSA開発_全体開発.md':`, existingFiles.length);
  for (const f of existingFiles) {
    console.log(`  id=${f.id} parents=${f.parents?.join(',')}`);
  }
  
  const { Readable } = require('stream');
  const media = { mimeType: 'text/markdown', body: Readable.from([content]) };
  
  if (existingFiles.length > 0) {
    const fileId = existingFiles[0].id!;
    const res = await drive.files.update({ fileId, media, fields: 'id, name, modifiedTime' });
    console.log('Updated!', res.data.id, res.data.modifiedTime);
  } else {
    // Try creating without parent folder
    const res = await drive.files.create({
      requestBody: { name: 'TSA開発_全体開発.md', mimeType: 'text/markdown' },
      media,
      fields: 'id, name, modifiedTime',
    });
    console.log('Created!', res.data.id, res.data.modifiedTime);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
