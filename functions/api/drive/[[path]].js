// Signals workshop API. Cloudflare Pages Function catch-all at /api/drive/*.
// Google Drive is the canonical store for presets, session metadata and student files.
// NEVER return a Google OAuth access token, refresh token or resumable upload URL to a browser.
const JSON_HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const json=(v,s=200)=>new Response(JSON.stringify(v),{status:s,headers:JSON_HEADERS});
const DRIVE="https://www.googleapis.com/drive/v3/files";
const MEDIA="https://www.googleapis.com/upload/drive/v3/files";
const FOLDER="application/vnd.google-apps.folder";
const CHUNK=8*1024*1024; // 8 MiB: divisible by Google's 256 KiB upload increment.
const safe=(s,max=80)=>String(s||"").replace(/[\x00-\x1f<>]/g,"").trim().slice(0,max);
function error(msg,status=400){return json({error:msg},status)}
function required(env){
 const keys=["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REFRESH_TOKEN","GOOGLE_DRIVE_ROOT_FOLDER_ID","HOST_PASSWORD","UPLOAD_TOKEN_SECRET"];
 return keys.filter(k=>!env[k]||String(env[k]).length<(k==="HOST_PASSWORD"?12:1));
}
async function readBody(req){
 if(!(req.headers.get("content-type")||"").startsWith("application/json"))throw Error("Expected JSON.");
 const raw=await req.text();
 if(raw.length>65000)throw Error("Request is too large.");
 return JSON.parse(raw);
}
function validUrl(value){
 if(typeof value!=="string"||value.length>2048)throw Error("Invalid website URL.");
 const u=new URL(value.trim());
 if(!["https:","http:"].includes(u.protocol)||u.username||u.password||!u.hostname)throw Error("Only normal http/https websites may be shared.");
 return u.toString();
}
function presetInput(body){
 const name=safe(body?.name);
 if(!name)throw Error("Preset name required.");
 if(!Array.isArray(body.links)||body.links.length<1||body.links.length>20)throw Error("Presets need 1–20 links.");
 return {name,links:body.links.map((v,i)=>({title:safe(v?.title)||"Page "+(i+1),url:validUrl(v?.url)}))};
}
async function sha(input){return new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(input)))}
async function hostAuth(req,env){
 const given=req.headers.get("x-host-password")||"";
 const [a,b]=await Promise.all([sha(given),sha(env.HOST_PASSWORD||"")]);
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return given.length>0&&diff===0;
}
function assertOrigin(req){
 const origin=req.headers.get("origin");
 if(origin&&origin!==new URL(req.url).origin)throw Error("Origin mismatch.");
}
function b64u(data){let s="";for(const b of data)s+=String.fromCharCode(b);return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}
function unb64u(s){const raw=atob(s.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function aesKey(env){return crypto.subtle.importKey("raw",await sha(env.UPLOAD_TOKEN_SECRET),"AES-GCM",false,["encrypt","decrypt"])}
async function seal(data,env){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const enc=await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(env),new TextEncoder().encode(JSON.stringify(data)));
 return b64u(iv)+"."+b64u(new Uint8Array(enc));
}
async function unseal(token,env){
 if(typeof token!=="string"||token.length>4096)throw Error("Invalid upload token.");
 const parts=token.split(".");if(parts.length!==2)throw Error("Invalid upload token.");
 const result=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64u(parts[0])},await aesKey(env),unb64u(parts[1]));
 const payload=JSON.parse(new TextDecoder().decode(result));
 if(!payload.exp||Date.now()>payload.exp)throw Error("Upload access expired; rejoin the workshop.");
 return payload;
}
async function accessToken(env){
 const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:"refresh_token"});
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:params});
 const data=await r.json();
 if(!r.ok||!data.access_token)throw Error("Google Drive authorisation failed; check the OAuth credentials.");
 return data.access_token;
}
async function google(token,path,options={}){
 const r=await fetch(path.startsWith("https://")?path:DRIVE+path,{
  ...options,headers:{Authorization:"Bearer "+token,...(options.headers||{})},redirect:"manual"
 });
 if(!r.ok){const snippet=(await r.text()).slice(0,250);throw Error("Google Drive request failed ("+r.status+"): "+snippet)}
 return r;
}
async function driveJson(token,path,options={}){return (await google(token,path,options)).json()}
function q(v){return String(v).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}
async function children(token,parentId,pageLimit=100){
 let result=[],pageToken="";
 do{
  const p=new URLSearchParams({q:"'"+q(parentId)+"' in parents and trashed = false",fields:"nextPageToken,files(id,name,mimeType,description,createdTime,modifiedTime,webViewLink)",pageSize:"100",orderBy:"createdTime desc"});
  if(pageToken)p.set("pageToken",pageToken);
  const resp=await driveJson(token,"?"+p.toString());
  result.push(...(resp.files||[]));pageToken=resp.nextPageToken||"";
 }while(pageToken&&result.length<pageLimit);
 return result.slice(0,pageLimit);
}
async function getMeta(token,id){
 if(!/^[A-Za-z0-9_-]{10,200}$/.test(id))throw Error("Invalid Drive identifier.");
 return driveJson(token,"/"+encodeURIComponent(id)+"?fields=id,name,mimeType,description,parents,webViewLink");
}
async function createMeta(token,metadata){
 return driveJson(token,"",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(metadata)});
}
async function updateMeta(token,id,metadata){
 return driveJson(token,"/"+encodeURIComponent(id)+"?fields=id,name,mimeType,description,webViewLink",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(metadata)});
}
async function readText(token,id){return (await google(token,"/"+encodeURIComponent(id)+"?alt=media")).text()}
async function saveText(token,id,body){
 await google(token,MEDIA+"/"+encodeURIComponent(id)+"?uploadType=media",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
async function listData(token,env,includePrivate=false){
 const root=env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
 const files=await children(token,root,250);
 const presetFiles=files.filter(f=>f.mimeType!=="application/vnd.google-apps.folder"&&f.name.startsWith("SIGNALS_PRESET__")).slice(0,60);
 const presets=[];
 for(const file of presetFiles){
  try{
   const value=JSON.parse(await readText(token,file.id));
   const preset=presetInput(value);
   presets.push({id:file.id,...preset,updatedAt:file.modifiedTime});
  }catch(ex){console.error("Skipping unreadable preset",file.id)}
 }
 const sessions=files.filter(f=>f.mimeType===FOLDER&&f.name.startsWith("SIGNALS_SESSION__")).map(f=>{
  try{
   const d=JSON.parse(f.description||"{}");
   if(d.kind!=="signals-session")return null;
   const s={id:f.id,presetId:d.presetId,name:d.name,createdAt:d.createdAt,status:d.status};
   if(includePrivate)s.code=d.code;
   return s;
  }catch{return null;}
 }).filter(Boolean);
 const latest=new Map();
 for(const s of sessions){
  if(s.status!=="open")continue;
  if(!latest.has(s.presetId)||latest.get(s.presetId).createdAt<s.createdAt)latest.set(s.presetId,s);
 }
 for(const p of presets)p.activeSession=latest.get(p.id)||null;
 return {presets,sessions:includePrivate?sessions:undefined};
}
async function requireHost(req,env){
 assertOrigin(req);
 if(!await hostAuth(req,env))return error("Incorrect host password.",401);
 return null;
}
async function turnstile(req,env,code){
 if(!env.TURNSTILE_SECRET||!env.TURNSTILE_SITE_KEY)return false;
 if(!code)return false;
 const data=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:code});
 const ip=req.headers.get("CF-Connecting-IP");if(ip)data.set("remoteip",ip);
 const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:data});
 if(!r.ok)return false;
 const result=await r.json();
 const host=new URL(req.url).hostname;
 return result.success===true&&(!result.hostname||result.hostname===host);
}
function passwordCode(code){return /^[A-Z2-9]{6}$/.test(String(code||"").toUpperCase())}
async function activeSession(token,env,id){
 const entry=await getMeta(token,id);
 if(entry.mimeType!==FOLDER||!(entry.parents||[]).includes(env.GOOGLE_DRIVE_ROOT_FOLDER_ID))throw Error("Invalid workshop session.");
 let data;try{data=JSON.parse(entry.description||"{}")}catch{throw Error("Invalid session data.")}
 if(data.kind!=="signals-session"||data.status!=="open")throw Error("This workshop session is closed.");
 return {id:entry.id,...data};
}
async function route(req,env){
 const path=new URL(req.url).pathname.slice("/api/drive".length);
 const missing=required(env);
 if(missing.length)return error("Drive backend not configured. Missing "+missing.join(", ")+".",503);
 if(req.method!=="GET")assertOrigin(req);
 if(path==="/config"&&req.method==="GET")return json({turnstileSiteKey:env.TURNSTILE_SITE_KEY||"",chunkBytes:CHUNK,maxFileBytes:Number(env.MAX_UPLOAD_BYTES)||10*1024*1024*1024,driveConnected:true});
 const token=await accessToken(env);
 if(path==="/catalogue"&&req.method==="GET"){
  const all=await listData(token,env,false);
  return json({presets:all.presets});
 }
 if(path==="/host"&&req.method==="GET"){
  const rejected=await requireHost(req,env);if(rejected)return rejected;
  return json(await listData(token,env,true));
 }
 if(path==="/presets"&&req.method==="POST"){
  const rejected=await requireHost(req,env);if(rejected)return rejected;
  const input=await readBody(req);
  const item=presetInput(input);
  if(input.id){
   const existing=await getMeta(token,String(input.id));
   if(!existing.name.startsWith("SIGNALS_PRESET__")||!(existing.parents||[]).includes(env.GOOGLE_DRIVE_ROOT_FOLDER_ID))return error("Preset is outside the Signals folder.",403);
   await saveText(token,existing.id,{version:1,...item});
   await updateMeta(token,existing.id,{description:"Workshop links preset: "+item.name});
   return json({ok:true,preset:{id:existing.id,...item}});
  }
  const id=crypto.randomUUID();
  const created=await createMeta(token,{name:"SIGNALS_PRESET__"+id+".json",mimeType:"application/json",parents:[env.GOOGLE_DRIVE_ROOT_FOLDER_ID],description:"Workshop links preset: "+item.name});
  try{await saveText(token,created.id,{version:1,...item});}
  catch(e){await updateMeta(token,created.id,{trashed:true}).catch(()=>{});throw e;}
  return json({ok:true,preset:{id:created.id,...item}},201);
 }
 if(path==="/presets"&&req.method==="DELETE"){
  const rejected=await requireHost(req,env);if(rejected)return rejected;
  const data=await readBody(req);
  const old=await getMeta(token,String(data.id||""));
  if(!old.name.startsWith("SIGNALS_PRESET__")||!(old.parents||[]).includes(env.GOOGLE_DRIVE_ROOT_FOLDER_ID))return error("Preset not found in Signals.",404);
  await updateMeta(token,old.id,{trashed:true});
  return json({ok:true});
 }
 if(path==="/sessions"&&req.method==="POST"){
  const rejected=await requireHost(req,env);if(rejected)return rejected;
  const b=await readBody(req);
  const preset=await getMeta(token,String(b.presetId||""));
  if(!preset.name.startsWith("SIGNALS_PRESET__")||!(preset.parents||[]).includes(env.GOOGLE_DRIVE_ROOT_FOLDER_ID))return error("Invalid preset.",403);
  const title=safe(b.name)||"Workshop session";
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>alphabet[v%alphabet.length]).join("");
  const record={kind:"signals-session",presetId:preset.id,name:title,createdAt:new Date().toISOString(),status:"open",code};
  const folder=await createMeta(token,{name:"SIGNALS_SESSION__"+crypto.randomUUID(),mimeType:FOLDER,parents:[env.GOOGLE_DRIVE_ROOT_FOLDER_ID],description:JSON.stringify(record)});
  return json({ok:true,session:{id:folder.id,...record}},201);
 }
 if(path==="/sessions"&&req.method==="PATCH"){
  const rejected=await requireHost(req,env);if(rejected)return rejected;
  const b=await readBody(req);
  const entry=await getMeta(token,String(b.id||""));
  if(entry.mimeType!==FOLDER||!(entry.parents||[]).includes(env.GOOGLE_DRIVE_ROOT_FOLDER_ID)||!entry.name.startsWith("SIGNALS_SESSION__"))return error("Session not found.",404);
  const original=JSON.parse(entry.description||"{}");
  if(original.kind!=="signals-session")return error("Session not found.",404);
  original.status=b.open===true?"open":"closed";
  await updateMeta(token,entry.id,{description:JSON.stringify(original)});
  return json({ok:true,session:{id:entry.id,...original}});
 }
 if(path==="/join"&&req.method==="POST"){
  const b=await readBody(req);
  const s=await activeSession(token,env,String(b.sessionId||""));
  if(!passwordCode(b.code)||String(b.code).trim().toUpperCase()!==s.code)return error("Incorrect workshop submission code.",403);
  if(b.presetId!==s.presetId)return error("Wrong workshop selected.",400);
  if(!await turnstile(req,env,b.turnstileToken))return error("Complete the human verification to upload.",403);
  const name=safe(b.studentName,70);
  if(name.length<2||name.length>70)return error("Enter your name (2–70 characters).");
  const folder=await createMeta(token,{name:"STUDENT__"+name+"__"+crypto.randomUUID().slice(0,8),mimeType:FOLDER,parents:[s.id],description:"Submitted work from "+name});
  const sessionToken=await seal({purpose:"participant",sessionId:s.id,presetId:s.presetId,folderId:folder.id,exp:Date.now()+24*60*60*1000},env);
  return json({ok:true,studentToken:sessionToken,studentName:name,sessionName:s.name});
 }
 if(path==="/upload/start"&&req.method==="POST"){
  const b=await readBody(req);
  const payload=await unseal(b.studentToken,env);
  if(payload.purpose!=="participant")return error("Incorrect upload access.",403);
  const session=await activeSession(token,env,payload.sessionId);
  if(session.presetId!==payload.presetId)return error("Session mismatch.",403);
  const folder=await getMeta(token,payload.folderId);
  if(folder.mimeType!==FOLDER||!(folder.parents||[]).includes(session.id))return error("Submission folder mismatch.",403);
  const name=safe(b.fileName,180);
  const max=Number(env.MAX_UPLOAD_BYTES)||10*1024*1024*1024;
  const size=Number(b.fileSize);
  if(name.length<1||!Number.isSafeInteger(size)||size<1||size>max)return error("File missing or exceeds the configured size limit ("+Math.round(max/1024/1024)+" MB).");
  const existing=await children(token,folder.id,25);
  if(existing.length>=20)return error("Maximum 20 submitted files per student for this session.");
  const mime=safe(b.fileType,100)||"application/octet-stream";
  const initiate=await fetch(MEDIA+"?uploadType=resumable&fields=id,name,mimeType,size,webViewLink",{
   method:"POST",
   headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Type":mime,"X-Upload-Content-Length":String(size)},
   body:JSON.stringify({name,mimeType:mime,parents:[folder.id],description:"Signals workshop upload: "+session.name}),
   redirect:"manual"
  });
  if(!initiate.ok)throw Error("Unable to initialise Google Drive upload ("+initiate.status+").");
  const sessionUrl=initiate.headers.get("Location");
  if(!sessionUrl||!(new URL(sessionUrl).hostname==="www.googleapis.com"))throw Error("Google did not return a trusted upload session.");
  const uploadToken=await seal({purpose:"upload",sessionUrl,size,sessionId:session.id,exp:Date.now()+24*60*60*1000},env);
  return json({ok:true,uploadToken,chunkBytes:CHUNK});
 }
 if(path==="/upload/chunk"&&req.method==="PUT"){
  const uploadToken=req.headers.get("x-upload-token");
  const payload=await unseal(uploadToken,env);
  if(payload.purpose!=="upload")return error("Incorrect upload token.",403);
  const start=Number(req.headers.get("x-offset"));
  if(!Number.isSafeInteger(start)||start<0||start>=payload.size)return error("Invalid upload offset.");
  const length=Number(req.headers.get("content-length"));
  if(Number.isFinite(length)&&length>CHUNK)return error("Upload chunk too large.",413);
  const bytes=await req.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>CHUNK||start+bytes.byteLength>payload.size)return error("Invalid chunk length.");
  if(start+bytes.byteLength<payload.size&&bytes.byteLength%(256*1024)!==0)return error("Non-final chunks must be multiples of 256 KiB.");
  const response=await fetch(payload.sessionUrl,{method:"PUT",headers:{
   "Authorization":"Bearer "+token,"Content-Type":"application/octet-stream",
   "Content-Range":"bytes "+start+"-"+(start+bytes.byteLength-1)+"/"+payload.size
  },body:bytes,redirect:"manual"});
  if(response.status===308){
   const match=(response.headers.get("Range")||"").match(/bytes=0-(\d+)/);
   return json({complete:false,nextOffset:match?Number(match[1])+1:0});
  }
  if(response.ok){
   let metadata={};try{metadata=await response.json()}catch{}
   return json({complete:true,fileId:metadata.id||null,filename:metadata.name||null});
  }
  const details=(await response.text()).slice(0,200);
  if(response.status===404||response.status===410)return error("Upload session expired, please restart.",410);
  return error("Drive rejected upload chunk ("+response.status+"): "+details,502);
 }
 if(path==="/upload/status"&&req.method==="POST"){
  const b=await readBody(req);
  const payload=await unseal(b.uploadToken,env);
  if(payload.purpose!=="upload")return error("Incorrect upload token.",403);
  const response=await fetch(payload.sessionUrl,{method:"PUT",
   headers:{"Authorization":"Bearer "+token,"Content-Range":"bytes */"+payload.size},
   body:new Uint8Array(0),redirect:"manual"});
  if(response.status===308){
   const match=(response.headers.get("Range")||"").match(/bytes=0-(\d+)/);
   return json({complete:false,nextOffset:match?Number(match[1])+1:0});
  }
  if(response.ok)return json({complete:true});
  return error("Unable to resume this upload ("+response.status+").",response.status===404?410:502);
 }
 return error("No matching API route.",404);
}
export async function onRequest(context){
 try{return await route(context.request,context.env)}
 catch(e){console.error("Signals Drive error",e);return error(e.message||"Unexpected error.",/OAuth|authorisation|Google Drive request/.test(e.message)?502:400)}
}
