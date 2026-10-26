import test from "node:test";
import assert from "node:assert/strict";
import {onRequest} from "../functions/api/drive/[[path]].js";

const env={
 GOOGLE_CLIENT_ID:"test-client",
 GOOGLE_CLIENT_SECRET:"test-secret",
 GOOGLE_REFRESH_TOKEN:"test-refresh",
 GOOGLE_DRIVE_ROOT_FOLDER_ID:"rootFolder123456789",
 HOST_PASSWORD:"a-long-private-test-password",
 UPLOAD_TOKEN_SECRET:"a-different-upload-token-secret-for-tests",
 TURNSTILE_SITE_KEY:"test-site",
 TURNSTILE_SECRET:"test-turnstile",
};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{
 status,headers:{"Content-Type":"application/json",...extra}
});
test("fails closed when Drive secrets are unavailable",async()=>{
 const response=await onRequest({request:new Request("https://signals.pages.dev/api/drive/catalogue"),env:{}});
 assert.equal(response.status,503);
 assert.match((await response.json()).error,/not configured/i);
});
test("public catalogue lists only Signals root folder and never returns credentials",async t=>{
 const called=[];
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  const target=String(url);
  called.push(target);
  if(target==="https://oauth2.googleapis.com/token")return reply({access_token:"TOP_SECRET_TEST_TOKEN"});
  if(target.startsWith("https://www.googleapis.com/drive/v3/files?"))return reply({files:[]});
  throw Error("Unexpected URL "+target);
 });
 const response=await onRequest({request:new Request("https://signals.pages.dev/api/drive/catalogue"),env});
 assert.equal(response.status,200);
 const obj=await response.json();
 assert.deepEqual(obj.presets,[]);
 assert.equal(JSON.stringify(obj).includes("TOP_SECRET"),false);
 assert.equal(called.length,2);
 assert.match(called[1],/rootFolder123456789/);
});
test("host editing rejects incorrect password",async t=>{
 let requests=0;
 t.mock.method(globalThis,"fetch",async(url)=>{
  requests++;
  if(String(url)==="https://oauth2.googleapis.com/token")return reply({access_token:"token"});
  throw Error("Unexpected request");
 });
 const request=new Request("https://signals.pages.dev/api/drive/host",{headers:{"X-Host-Password":"wrong"}});
 const response=await onRequest({request,env});
 assert.equal(response.status,401);
 assert.deepEqual((await response.json()).error,"Incorrect host password.");
 assert.equal(requests,1);
});
test("host can create a preset without GitHub Issues or D1",async t=>{
 const calls=[];
 t.mock.method(globalThis,"fetch",async(url,options)=>{
  const target=String(url);calls.push({url:target,method:options?.method||"GET"});
  if(target==="https://oauth2.googleapis.com/token")return reply({access_token:"access-token"});
  if(target==="https://www.googleapis.com/drive/v3/files"&&options.method==="POST")return reply({id:"newDriveFileId12345"});
  if(target.includes("/upload/drive/v3/files/newDriveFileId12345?uploadType=media")&&options.method==="PATCH")return reply({id:"newDriveFileId12345"});
  throw Error("Unexpected mock request "+target);
 });
 const request=new Request("https://signals.pages.dev/api/drive/presets",{
  method:"POST",headers:{"Content-Type":"application/json","X-Host-Password":env.HOST_PASSWORD,"Origin":"https://signals.pages.dev"},
  body:JSON.stringify({name:"Demo workshop",links:[{title:"Example",url:"https://example.com/"}]})
 });
 const response=await onRequest({request,env});
 assert.equal(response.status,201);
 const body=await response.json();
 assert.equal(body.preset.name,"Demo workshop");
 assert.equal(body.preset.links.length,1);
 assert.ok(calls.some(c=>c.url.includes("/upload/drive/v3/files/")&&c.method==="PATCH"));
});
test("refuses an unauthenticated session creation",async t=>{
 t.mock.method(globalThis,"fetch",async url=>{
  if(String(url)==="https://oauth2.googleapis.com/token")return reply({access_token:"access-token"});
  throw Error("Unexpected network request");
 });
 const request=new Request("https://signals.pages.dev/api/drive/sessions",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({presetId:"abc1234567890",name:"Session"})
 });
 const response=await onRequest({request,env});
 assert.equal(response.status,401);
});


test("a verified student can start and complete a Drive resumable upload without receiving its Google session URI",async t=>{
 const sessionId="sessionDriveId1234567890";
 const studentId="studentDriveId1234567890";
 const fileUrl="https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=TEST";
 const events=[];
 t.mock.method(globalThis,"fetch",async(url,options={})=>{
  const u=String(url);
  events.push({url:u,method:options.method||"GET",range:options.headers?.["Content-Range"]});
  if(u==="https://oauth2.googleapis.com/token")return reply({access_token:"private-oauth-token"});
  if(u==="https://challenges.cloudflare.com/turnstile/v0/siteverify")return reply({success:true,hostname:"signals.pages.dev"});
  if(u.includes("/drive/v3/files/"+sessionId+"?fields="))return reply({
   id:sessionId,mimeType:"application/vnd.google-apps.folder",
   parents:[env.GOOGLE_DRIVE_ROOT_FOLDER_ID],
   description:JSON.stringify({kind:"signals-session",status:"open",presetId:"preset123",name:"Test session",code:"ABC234"})
  });
  if(u==="https://www.googleapis.com/drive/v3/files"&&options.method==="POST")return reply({id:studentId});
  if(u.includes("/drive/v3/files/"+studentId+"?fields="))return reply({
   id:studentId,mimeType:"application/vnd.google-apps.folder",parents:[sessionId]
  });
  if(u.startsWith("https://www.googleapis.com/drive/v3/files?")&&options.method!=="POST")return reply({files:[]});
  if(u.startsWith("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable")&&options.method==="POST"){
   return new Response(null,{status:200,headers:{Location:fileUrl}});
  }
  if(u===fileUrl&&options.method==="PUT")return reply({id:"completed-file-12345",name:"test.zip"},201);
  throw Error("Unexpected Drive call "+u);
 });
 const joinReq=new Request("https://signals.pages.dev/api/drive/join",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({sessionId,presetId:"preset123",studentName:"Alex",code:"ABC234",turnstileToken:"test-challenge"})
 });
 const join=await onRequest({request:joinReq,env});
 assert.equal(join.status,200);
 const participant=(await join.json()).studentToken;
 assert.equal(typeof participant,"string");
 assert.equal(participant.includes("www.googleapis.com"),false);
 const startReq=new Request("https://signals.pages.dev/api/drive/upload/start",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({studentToken:participant,fileName:"test.zip",fileSize:128,fileType:"application/zip"})
 });
 const start=await onRequest({request:startReq,env});
 assert.equal(start.status,200);
 const upload=(await start.json()).uploadToken;
 assert.equal(typeof upload,"string");
 assert.equal(upload.includes("upload_id"),false);
 const bytes=new Uint8Array(128).fill(73);
 const chunkReq=new Request("https://signals.pages.dev/api/drive/upload/chunk",{
  method:"PUT",headers:{"Content-Type":"application/octet-stream","X-Upload-Token":upload,"X-Offset":"0"},
  body:bytes
 });
 const chunk=await onRequest({request:chunkReq,env});
 assert.equal(chunk.status,200);
 assert.deepEqual((await chunk.json()).complete,true);
 assert.ok(events.some(e=>e.url===fileUrl&&e.range==="bytes 0-127/128"));
});
