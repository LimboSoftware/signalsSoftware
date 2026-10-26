#!/usr/bin/env node
// Authorise Signals to access your own Drive, locally, without sending Google secrets through chat.
// Run: node scripts/authorize-drive.mjs
import {createServer} from "node:http";
import {randomBytes,createHash} from "node:crypto";
import {createInterface} from "node:readline/promises";
import {stdin,stdout} from "node:process";
const io=createInterface({input:stdin,output:stdout});
const clientId=(await io.question("Google Cloud OAuth Desktop client ID: ")).trim();
const clientSecret=(await io.question("Google Cloud OAuth Desktop client secret: ")).trim();
if(!clientId||!clientSecret){console.error("Client ID and secret required.");process.exit(1)}
const state=randomBytes(24).toString("base64url");
const verifier=randomBytes(48).toString("base64url");
const challenge=createHash("sha256").update(verifier).digest("base64url");
const server=createServer();
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const address=server.address();
const redirect="http://127.0.0.1:"+address.port+"/callback";
const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
for(const [k,v] of Object.entries({
 client_id:clientId,response_type:"code",scope:"https://www.googleapis.com/auth/drive",
 redirect_uri:redirect,access_type:"offline",prompt:"consent",state,
 code_challenge:challenge,code_challenge_method:"S256"
}))url.searchParams.set(k,v);
console.log("\nOpen this URL in the browser signed into the Drive account you want for Signals:\n");
console.log(url.toString()+"\n");
console.log("Waiting for Google's authorisation callback on localhost...");
const authResult=await new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>reject(new Error("No callback received. Try again.")),5*60*1000);
 server.on("request",(req,res)=>{
  try{
   const incoming=new URL(req.url,redirect);
   if(incoming.pathname!=="/callback"){res.writeHead(404).end();return}
   if(incoming.searchParams.get("state")!==state)throw Error("OAuth state mismatch");
   if(incoming.searchParams.has("error"))throw Error(incoming.searchParams.get("error"));
   const code=incoming.searchParams.get("code");if(!code)throw Error("No OAuth authorisation code returned.");
   res.writeHead(200,{"Content-Type":"text/html;charset=utf-8"}).end("<h1>Signals authorisation complete.</h1><p>Return to the terminal to finish setting Cloudflare secrets.</p>");
   clearTimeout(timeout);resolve(code);
  }catch(err){res.writeHead(400).end("Authorisation failed.");clearTimeout(timeout);reject(err)}
 });
});
server.close();
const payload=new URLSearchParams({code:authResult,client_id:clientId,client_secret:clientSecret,
 redirect_uri:redirect,grant_type:"authorization_code",code_verifier:verifier});
const response=await fetch("https://oauth2.googleapis.com/token",{
 method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:payload
});
const token=await response.json();
if(!response.ok||!token.refresh_token){
 console.error("Google did not return a refresh token. Retry with the same account and prompt=consent.");
 console.error("Response status:",response.status);
 process.exitCode=1;
}else{
 console.log("\nCopy these values directly into the Cloudflare project's production secrets:");
 console.log("GOOGLE_CLIENT_ID = "+clientId);
 console.log("GOOGLE_CLIENT_SECRET = "+clientSecret);
 console.log("GOOGLE_REFRESH_TOKEN = "+token.refresh_token);
 console.log("\nDo not paste these values into chat, GitHub or your source files.");
 console.log("If the OAuth consent screen remains in Testing mode, Google may expire the refresh token after 7 days.");
}
io.close();
