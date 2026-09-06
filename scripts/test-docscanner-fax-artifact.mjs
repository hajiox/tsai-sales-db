import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireDocScannerFaxImages, deleteDocScannerFaxImages } from "../tools/tsa-codex-bridge/docscanner-fax-artifact.mjs";

const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const workDir = await mkdtemp(join(tmpdir(), "fax-artifact-test-"));
const parameters = { sourceKey: "synthetic-source", imageFiles: [{ page: 1, size: bytes.length, sha256, localPath: "C:/must-not-read.jpg" }] };
const options = { baseUrl: "http://127.0.0.1:3004", secret: "synthetic-secret", parameters, workDir };
const response = (body = bytes, headers = {}) => new Response(body, { headers: { "content-type": "image/jpeg", ...headers } });
try {
  let calls = 0;
  const images = await acquireDocScannerFaxImages({ ...options, fetchImpl: async (url, request) => {
    calls++;
    assert.equal(url.href, "http://127.0.0.1:3004/api/integrations/codex-bridge/fax-summary-artifact");
    assert.equal(request.method, "POST");
    assert.equal(request.redirect, "error");
    assert.equal(request.headers["x-tsg-integration-secret"], "synthetic-secret");
    assert.deepEqual(JSON.parse(request.body), { sourceKey: parameters.sourceKey, page: 1, sha256 });
    return response();
  } });
  assert.equal(calls, 1);
  assert.deepEqual(await readFile(images[0].copiedPath), bytes);
  for (const [fetchImpl, pattern] of [
    [async () => new Response("secret diagnostic", { status: 401 }), /HTTP 401/],
    [async () => response(bytes, { "content-type": "text/html" }), /形式/],
    [async () => response(bytes, { "content-length": "99999999" }), /サイズ/],
    [async () => response(Buffer.alloc(5)), /上限/],
    [async () => response(Buffer.alloc(4)), /一致/],
    [async () => { throw new Error("sensitive source and secret"); }, /接続できません/],
  ]) {
    await assert.rejects(acquireDocScannerFaxImages({ ...options, fetchImpl }), pattern);
  }
  await assert.rejects(acquireDocScannerFaxImages({ ...options, secret: "" }), /未設定/);
  await assert.rejects(acquireDocScannerFaxImages({ ...options, fetchImpl: async () => new Response(null, { status: 403 }) }), error => error.operatorWait === true);
  await assert.rejects(acquireDocScannerFaxImages({ ...options, baseUrl: "http://user:pass@localhost" }), /接続先/);
  await assert.rejects(acquireDocScannerFaxImages({ ...options, parameters: { ...parameters, imageFiles: [{ ...parameters.imageFiles[0], page: 7 }] } }), /取得契約/);
  await deleteDocScannerFaxImages({ ...options, fetchImpl: async (url, request) => {
    assert.equal(request.method, "DELETE");
    assert.equal(url.search, "");
    assert.equal(request.redirect, "error");
    assert.deepEqual(JSON.parse(request.body), { sourceKey: parameters.sourceKey, page: 1, sha256 });
    return new Response(null, { status: 204 });
  } });
  await deleteDocScannerFaxImages({ ...options, fetchImpl: async () => new Response(null, { status: 404 }) });
  await assert.rejects(deleteDocScannerFaxImages({ ...options, fetchImpl: async () => new Response(null, { status: 401 }) }), /HTTP 401/);
  console.log("FAX artifact API: identity, authentication, bounded streaming, hash, errors verified");
} finally {
  // mkdtemp returned this test-owned child of the OS temp directory.
  await rm(workDir, { recursive: true, force: true });
}
