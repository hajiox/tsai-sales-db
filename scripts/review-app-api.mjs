// Deterministic HTTP client only: never starts Codex CLI, Bridge, or a browser.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const [command,value,...flags]=process.argv.slice(2);
const configPath=process.env.TSA_REVIEW_APP_CONFIG || path.join(os.homedir(),".codex","tsa-review-app.json");
try {
  const config=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,"utf8")):{};
  const token=process.env.TSA_REVIEW_APP_TOKEN || config.token;
  if(!token)throw new Error("Review API credential is not configured");
  const url=new URL("https://v0-tsa-19.vercel.app/api/recipe/reviews/direct");
  let body;
  if(command==="batch")url.searchParams.set("batchId",value);
  else if(command==="packet"||command==="analysis-packet") {url.searchParams.set("jobId",value);if(command==="analysis-packet")url.searchParams.set("analysis","1");}
  else if(command==="import") {body=fs.readFileSync(value,"utf8");JSON.parse(body);}
  else throw new Error("Usage: review-app-api.mjs batch|packet|analysis-packet <id> | import <json-file> [--output <file>]");
  const response=await fetch(url,{method:body?"POST":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body,redirect:"error",signal:AbortSignal.timeout(65000)});
  const data=await response.json();
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${data.error || "Request failed"}`);
  const output=JSON.stringify(data,null,2)+"\n", index=flags.indexOf("--output");
  if(index>=0){if(!flags[index+1])throw new Error("Output path required");fs.writeFileSync(flags[index+1],output);console.log("Saved API response to requested file");}
  else process.stdout.write(output);
}catch(e){console.error(e.message);process.exitCode=1;}
