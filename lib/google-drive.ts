// lib/google-drive.ts
// Google Drive API ユーティリティ - 開発履歴MDの読み書き

import { google } from 'googleapis';

const GOOGLE_DRIVE_FOLDER_ID = '1jIEslY2H9Z9jyvPaKMFhCmoCNd7dDwU9';

function getAuth() {
    const keyFilePath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (keyFilePath) {
        return new google.auth.GoogleAuth({
            keyFile: keyFilePath,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
    }
    const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (credentials) {
        const parsed = JSON.parse(credentials);
        return new google.auth.GoogleAuth({
            credentials: parsed,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
    }
    throw new Error('Google Drive認証情報が設定されていません');
}

function getDrive() {
    const auth = getAuth();
    return google.drive({ version: 'v3', auth });
}

export async function listDriveFiles() {
    const drive = getDrive();
    const res = await drive.files.list({
        q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name, mimeType, modifiedTime, size)',
        orderBy: 'name',
    });
    return res.data.files || [];
}

export async function findFileByName(fileName: string): Promise<string | null> {
    const drive = getDrive();
    const res = await drive.files.list({
        q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
        fields: 'files(id, name)',
    });
    const files = res.data.files || [];
    return files.length > 0 ? files[0].id! : null;
}

export async function readDriveFile(fileId: string): Promise<string> {
    const drive = getDrive();
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' }
    );
    return res.data as string;
}

export async function readDriveFileByName(fileName: string): Promise<string | null> {
    const fileId = await findFileByName(fileName);
    if (!fileId) return null;
    return readDriveFile(fileId);
}

export async function uploadDriveFile(fileName: string, content: string): Promise<string> {
    const drive = getDrive();
    const existingId = await findFileByName(fileName);
    const { Readable } = require('stream');
    const media = {
        mimeType: 'text/markdown',
        body: Readable.from([content]),
    };

    if (existingId) {
        const res = await drive.files.update({
            fileId: existingId,
            media,
            fields: 'id, name, modifiedTime',
        });
        return res.data.id!;
    } else {
        const res = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [GOOGLE_DRIVE_FOLDER_ID],
                mimeType: 'text/markdown',
            },
            media,
            fields: 'id, name, modifiedTime',
        });
        return res.data.id!;
    }
}

export async function syncLocalMdToDrive(localPath: string, driveName: string): Promise<string> {
    const fs = require('fs');
    const content = fs.readFileSync(localPath, 'utf-8');
    return uploadDriveFile(driveName, content);
}

export async function syncDriveMdToLocal(driveName: string, localPath: string): Promise<boolean> {
    const content = await readDriveFileByName(driveName);
    if (content === null) return false;
    const fs = require('fs');
    fs.writeFileSync(localPath, content, 'utf-8');
    return true;
}
