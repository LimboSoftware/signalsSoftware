"use strict";
(() => {
const $ = id => document.getElementById(id);
const API="/api/drive";
const tabLimit=20;
let pendingImportedChromeTabs=null;
const state={presets:[],sessions:[],selectedId:"",selectedSessionId:"",selectedEditId:"",hostPassword:"",studentToken:"",studentSessionId:"",turnstileToken:"",turnstileWidget:null,config:null,pending:[],uploading:false};
const show=(id,on)=>$(id).classList.toggle("hidden",!on);
const say=(id,content,err=false)=>{const el=$(id);el.textContent=content;el.style.color=err?"#ffd0c8":"";};
const create=(tag,className,text)=>{
 const element=document.createElement(tag);
 if(className)element.className=className;
 if(text!==undefined)element.textContent=text;
 return element;
};
const add=(parent,tag,cls,text)=>{const e=create(tag,cls,text);parent.append(e);return e;};
async function request(path,options={}){
 const r=await fetch(API+path,{cache:"no-store",...options});
 const body=await r.json().catch(()=>({error:"Invalid JSON response from the server."}));
 if(!r.ok)throw new Error(body.error||"Server error "+r.status);
 return body;
}
function options(method,body,authenticated=false){
 const headers={"Content-Type":"application/json"};
 if(authenticated)headers["X-Host-Password"]=state.hostPassword;
 return {method,headers,body:body===undefined?undefined:JSON.stringify(body)};
}
function findPreset(id){return state.presets.find(p=>p.id===id)}
function showView(host){
 show("student-view",!host);show("host-view",host);
 if(host)refreshHost();else refreshStudent();
 window.scrollTo(0,0);
}
$("student-nav").onclick=()=>showView(false);
$("host-nav").onclick=()=>showView(true);
$("refresh").onclick=refreshStudent;
async function loadConfig(){
 try{
  state.config=await request("/config");
  $("connection").textContent="Google Drive API ready.";
  show("configuration",false);
 }catch(e){
  $("configuration").textContent="Backend setup needed: "+e.message;
  show("configuration",true);
  $("connection").textContent="Google Drive not yet authorised.";
 }
}
async function refreshStudent(){
 try{
  const data=await request("/catalogue");
  state.presets=data.presets||[];
  renderPresets();
  const selected=state.selectedId||sessionStorage.getItem("signals-selected-preset")||"";
  if(findPreset(selected))selectPreset(selected,false);
  say("student-message",state.presets.length+" workshop preset(s) available.");
  show("configuration",false);
 }catch(e){
  say("student-message",e.message,true);
  $("configuration").textContent="Unable to retrieve workshops from Google Drive: "+e.message;
  show("configuration",true);
 }
}
function renderPresets(){
 const box=$("presets");box.replaceChildren();
 if(!state.presets.length){
  add(box,"div","card","No workshops published yet. Your host can save one in Host controls.");
  return;
 }
 state.presets.forEach(p=>{
  const card=create("article","card");
  add(card,"h3","",p.name);
  add(card,"p","",p.links.length+" website(s)"+(p.activeSession?" · Submissions open: "+p.activeSession.name:" · Submissions not open"));
  const button=add(card,"button","secondary","Choose this workshop");
  button.onclick=()=>selectPreset(p.id,true);
  box.append(card);
 });
}
function selectPreset(id,scroll){
 const preset=findPreset(id);
 if(!preset)return;
 const newSession=preset.activeSession?.id||"";
 if(state.selectedSessionId!==newSession){state.studentToken="";state.turnstileToken="";show("uploader",false);}
 state.selectedSessionId=newSession;
 state.selectedId=id;
 try{sessionStorage.setItem("signals-selected-preset",id)}catch{}
 $("selected-title").textContent=preset.name;
 $("tab-count").textContent=preset.links.length+" tabs";
 const links=$("selected-links");links.replaceChildren();
 preset.links.forEach((item,i)=>{
  const row=create("div","link");
  add(row,"span","num",String(i+1));
  const detail=create("div","link-details");
  add(detail,"strong","",item.title);
  add(detail,"small","",item.url);
  const a=add(row,"a","","Open ↗");
  a.href=item.url;a.target="_blank";a.rel="noopener noreferrer";
  row.append(detail);row.append(a);links.append(row);
 });
 show("selected",true);
 if(newSession){
  $("session-intro").textContent="Session: "+preset.activeSession.name+". Enter your name and the code your host displays.";
  show("join-form",!state.studentToken);
  show("uploader",!!state.studentToken);
  if(!state.studentToken&&(!state.turnstileWidget||scroll))renderTurnstile();
 }else{
  $("session-intro").textContent="Your host has not started a submission session for this preset yet. You can still launch its websites.";
  show("join-form",false);show("uploader",false);
 }
 if(scroll)$("selected").scrollIntoView({behavior:"smooth",block:"start"});
}
$("launch").onclick=()=>{
 const p=findPreset(state.selectedId);if(!p)return;
 let blocked=0;
 for(const site of p.links){
  const tab=window.open(site.url,"_blank");
  if(!tab)blocked++;else{try{tab.opener=null}catch{}}
 }
 say("popup-warning",blocked?"Chrome blocked one or more tabs. Allow pop-ups from this site and press Open all again.":"Requested "+p.links.length+" website tab(s).",blocked>0);
};
function renderTurnstile(){
 const container=$("turnstile");container.replaceChildren();
 state.turnstileToken="";state.turnstileWidget=null;
 if(!state.config?.turnstileSiteKey){
  add(container,"p","warning","Submissions are locked until Cloudflare Turnstile has been configured by the host.");
  return;
 }
 const attempt=()=>{
  if(!state.selectedSessionId)return;
  if(!window.turnstile){setTimeout(attempt,400);return}
  if(state.turnstileWidget!==null)return;
  try{
   state.turnstileWidget=window.turnstile.render(container,{
    sitekey:state.config.turnstileSiteKey,
    callback:token=>{state.turnstileToken=token;},
    "expired-callback":()=>{state.turnstileToken="";}
   });
  }catch(e){say("submission-message","Verification failed to load: "+e.message,true)}
 };
 attempt();
}
$("join").onclick=async()=>{
 const preset=findPreset(state.selectedId);
 if(!preset?.activeSession)return;
 if(!state.turnstileToken)return say("submission-message","Complete the verification first.",true);
 const btn=$("join");btn.disabled=true;
 try{
  const result=await request("/join",options("POST",{
   presetId:preset.id,sessionId:preset.activeSession.id,
   studentName:$("student-name").value.trim(),
   code:$("student-code").value.trim().toUpperCase(),
   turnstileToken:state.turnstileToken
  }));
  state.studentToken=result.studentToken;
  state.studentSessionId=preset.activeSession.id;
  show("join-form",false);show("uploader",true);
  say("submission-message","Ready for "+result.studentName+". Drag your work into the box below.");
 }catch(e){
  say("submission-message",e.message,true);
  state.turnstileToken="";
  try{if(state.turnstileWidget!==null)window.turnstile.reset(state.turnstileWidget)}catch{}
 }finally{btn.disabled=false}
};
const drop=$("drop");
drop.onclick=()=>$("files").click();
drop.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();$("files").click();}};
drop.ondragover=e=>{e.preventDefault();drop.classList.add("over");};
drop.ondragleave=()=>drop.classList.remove("over");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("over");queue(e.dataTransfer.files);};
$("files").onchange=e=>{queue(e.target.files);e.target.value="";};
function queue(fileList){
 if(!state.studentToken)return say("submission-message","Join the active session first.",true);
 for(const file of Array.from(fileList||[]))state.pending.push(file);
 if(!state.uploading)runUploadQueue();
}
async function runUploadQueue(){
 state.uploading=true;
 while(state.pending.length){
  const file=state.pending.shift();
  const row=create("div","file-row");
  add(row,"strong","",file.name+" · "+(file.size/1048576).toFixed(1)+" MB");
  const bar=create("div","bar");const fill=add(bar,"span","");row.append(bar);
  const info=add(row,"p","","Starting upload...");
  $("file-rows").prepend(row);
  try{
   await sendFile(file,(fraction,message)=>{
    fill.style.width=Math.max(0,Math.min(100,fraction*100))+"%";
    info.textContent=message||Math.round(fraction*100)+"% uploaded";
   });
   fill.style.width="100%";info.textContent="✓ Saved to Google Drive";
  }catch(e){
   info.textContent="Failed: "+e.message+" — reselect the same file to try resuming.";
   info.style.color="#ffc6bb";
   say("submission-message","At least one file failed. Check its status below.",true);
  }
 }
 state.uploading=false;
}
async function sendFile(file,progress){
 if(file.size<1)throw Error("This file is empty.");
 const max=state.config?.maxFileBytes||10*1024*1024*1024;
 if(file.size>max)throw Error("File exceeds the configured upload limit.");
 const k="signals-upload-"+state.studentSessionId+"-"+file.name+"-"+file.size;
 let record=null;try{record=JSON.parse(sessionStorage.getItem(k)||"null")}catch{}
 let uploadToken=record?.uploadToken||"",offset=0;
 if(uploadToken){
  try{
   const r=await request("/upload/status",options("POST",{uploadToken}));
   if(r.complete){progress(1,"Already saved in Drive.");return}
   offset=r.nextOffset||0;
  }catch{uploadToken="";}
 }
 if(!uploadToken){
  const r=await request("/upload/start",options("POST",{
   studentToken:state.studentToken,fileName:file.name,fileSize:file.size,
   fileType:file.type||"application/octet-stream"
  }));
  uploadToken=r.uploadToken;
  try{sessionStorage.setItem(k,JSON.stringify({uploadToken}))}catch{}
 }
 let retries=0;
 const chunk=state.config?.chunkBytes||8*1024*1024;
 while(offset<file.size){
  const end=Math.min(file.size,offset+chunk);
  try{
   const response=await fetch(API+"/upload/chunk",{
    method:"PUT",headers:{"Content-Type":"application/octet-stream","X-Upload-Token":uploadToken,"X-Offset":String(offset)},
    body:file.slice(offset,end)
   });
   const body=await response.json().catch(()=>({error:"Invalid upload response."}));
   if(!response.ok)throw Error(body.error||"Drive upload rejected a chunk.");
   if(body.complete){
    progress(1,"File confirmed by Google Drive.");
    try{sessionStorage.removeItem(k)}catch{}
    return;
   }
   if(body.nextOffset<=offset)throw Error("No upload progress acknowledged.");
   offset=body.nextOffset;retries=0;
   progress(offset/file.size,Math.floor(offset/file.size*100)+"% uploaded");
  }catch(e){
   if(++retries>3)throw e;
   await new Promise(resolve=>setTimeout(resolve,1000*retries));
   const r=await request("/upload/status",options("POST",{uploadToken}));
   if(r.complete){progress(1,"File confirmed by Google Drive.");try{sessionStorage.removeItem(k)}catch{}return}
   offset=r.nextOffset||0;
  }
 }
}
function editorRows(){
 const list=$("editor");list.replaceChildren();
 (state.draft.links||[]).forEach(item=>rowAdd(item));
 renumber();
}
function renumber(){
 const rows=[...$("editor").children];
 for(let i=0;i<rows.length;i++)rows[i].querySelector("label").textContent="TAB "+(i+1);
 $("editor-count").textContent=rows.length+" / "+tabLimit;
 $("add-link").disabled=rows.length>=tabLimit;
}
function rowAdd(data){
 const wrap=create("div","tab-row");
 const top=create("div","between");
 add(top,"label","","Website");
 const remove=add(top,"button","secondary small","Remove");
 remove.onclick=()=>{wrap.remove();renumber();};
 const group=create("div","tab-grid");
 const title=create("input","tab-title");title.value=data.title||"";title.placeholder="Name (optional)";title.maxLength=80;
 const url=create("input","tab-url");url.type="url";url.value=data.url||"";url.placeholder="https://example.com";
 group.append(title,url);wrap.append(top,group);$("editor").append(wrap);renumber();
}
function collectEditor(){
 const name=$("preset-name").value.trim();
 const links=[...$("editor").children].map(row=>({
  title:row.querySelector(".tab-title").value.trim(),
  url:row.querySelector(".tab-url").value.trim()
 })).filter(p=>p.url);
 if(!name)throw Error("Give this preset a name.");
 if(!links.length||links.length>tabLimit)throw Error("Choose 1–20 websites.");
 return {name,links};
}
function blankPreset(){
 state.selectedEditId="";
 state.draft={name:"",links:[{title:"",url:""},{title:"",url:""},{title:"",url:""}]};
 $("preset-picker").value="";
 $("preset-name").value="";
 editorRows();
}
$("new").onclick=blankPreset;
$("add-link").onclick=()=>{if($("editor").children.length<tabLimit)rowAdd({title:"",url:""});};
$("preset-picker").onchange=e=>{
 const p=findPreset(e.target.value);
 if(!p){blankPreset();return}
 state.selectedEditId=p.id;
 state.draft={name:p.name,links:p.links.map(x=>({...x}))};
 $("preset-name").value=p.name;
 editorRows();
};
async function hostRequest(path,method,body){
 return request(path,{...options(method,body,true)});
}
$("unlock").onclick=()=>{
 state.hostPassword=$("host-password").value;
 if(!state.hostPassword)return say("host-message","Enter the host password.",true);
 try{sessionStorage.setItem("signals-host-password",state.hostPassword)}catch{}
 refreshHost();
};
async function refreshHost(){
 if(!state.hostPassword){try{state.hostPassword=sessionStorage.getItem("signals-host-password")||""}catch{}}
 if(!state.hostPassword)return;
 try{
  const data=await request("/host",{headers:{"X-Host-Password":state.hostPassword}});
  state.presets=data.presets||[];
  state.sessions=data.sessions||[];
  show("admin",true);
  const select=$("preset-picker");select.replaceChildren();
  const prompt=add(select,"option","","New preset");prompt.value="";
  state.presets.forEach(p=>{const option=add(select,"option","",p.name);option.value=p.id;});
  if(findPreset(state.selectedEditId)){
   select.value=state.selectedEditId;
   state.draft={name:findPreset(state.selectedEditId).name,links:findPreset(state.selectedEditId).links.map(x=>({...x}))};
   $("preset-name").value=state.draft.name;editorRows();
  }else blankPreset();
  if(pendingImportedChromeTabs){
   state.selectedEditId="";
   state.draft={name:"Imported Chrome workshop",links:pendingImportedChromeTabs.map(url=>({title:"",url}))};
   $("preset-picker").value="";
   $("preset-name").value=state.draft.name;
   editorRows();
   pendingImportedChromeTabs=null;
   say("save-message","Chrome tabs imported. Name the preset and press Save to Google Drive.");
  }
  renderSessions();
  say("host-message","Connected to your Google Drive workshop folder.");
 }catch(e){
  show("admin",false);
  say("host-message",e.message,true);
 }
}
$("save").onclick=async()=>{
 const btn=$("save");btn.disabled=true;
 try{
  const values=collectEditor();
  const result=await hostRequest("/presets","POST",{id:state.selectedEditId||undefined,...values});
  state.selectedEditId=result.preset.id;
  await refreshHost();
  say("save-message","Saved to Google Drive. Other MacBooks will see it automatically.");
 }catch(e){say("save-message",e.message,true)}finally{btn.disabled=false}
};
$("delete").onclick=async()=>{
 if(!state.selectedEditId)return say("save-message","Choose a saved preset first.",true);
 if(!confirm("Delete this preset from Signals?"))return;
 try{
  await hostRequest("/presets","DELETE",{id:state.selectedEditId});
  state.selectedEditId="";await refreshHost();say("save-message","Preset deleted.");
 }catch(e){say("save-message",e.message,true)}
};
$("start").onclick=async()=>{
 if(!state.selectedEditId)return say("session-message","Select a saved preset first.",true);
 try{
  const result=await hostRequest("/sessions","POST",{
   presetId:state.selectedEditId,name:$("session-name").value.trim()||"Workshop session"
  });
  await refreshHost();
  say("session-message","Session created. The student submission code is "+result.session.code+".");
 }catch(e){say("session-message",e.message,true)}
};
function renderSessions(){
 const box=$("sessions");box.replaceChildren();
 if(!state.sessions.length)add(box,"p","hint","No sessions yet. Select a preset above and start one.");
 state.sessions.forEach(s=>{
  const card=create("div","card");
  add(card,"h3","",s.name);
  const preset=findPreset(s.presetId);
  add(card,"p","",(preset?.name||"Unknown workshop")+" · "+s.status+" · "+s.createdAt);
  if(s.status==="open"){
   add(card,"div","code",s.code);
   add(card,"p","hint","Give this code to students to enable submissions.");
   const close=add(card,"button","secondary small","Close this session");
   close.onclick=async()=>{
    if(!confirm("Close submissions for this session?"))return;
    try{await hostRequest("/sessions","PATCH",{id:s.id,open:false});await refreshHost()}
    catch(e){say("session-message",e.message,true)}
   };
  }
  box.append(card);
 });
}
async function copyToClipboard(value){
 try{await navigator.clipboard.writeText(value);}
 catch{
  const textarea=document.createElement("textarea");
  textarea.value=value;textarea.style.position="fixed";textarea.style.opacity="0";
  document.body.append(textarea);textarea.select();
  const ok=document.execCommand("copy");textarea.remove();
  if(!ok)throw Error("Clipboard permission blocked.");
 }
}
$("capture-tabs").onclick=async()=>{
 const start=location.origin+location.pathname;
 const script='var c=Application("Google Chrome");var w=c.windows();if(!w.length)throw Error("Open Chrome first.");var u=w[0].tabs().map(function(t){return t.url()}).filter(function(v){return (v.indexOf("https://")===0||v.indexOf("http://")===0)&&v.indexOf('+JSON.stringify(start)+')!==0;}).slice(0,20);if(!u.length)throw Error("No website tabs in the front Chrome window.");var dest='+JSON.stringify(start+"?import=")+'+encodeURIComponent(JSON.stringify(u));c.windows[0].tabs.push(new c.Tab({url:dest}));';
 const command="osascript -l JavaScript -e '"+script.replace(/'/g,"'\\''")+"'";
 try{
  await copyToClipboard(command);
  say("save-message","Command copied. Open macOS Terminal, paste and press Return. Allow access to Chrome if prompted.");
 }catch(e){say("save-message",e.message,true)}
};
async function init(){
 const query=new URLSearchParams(location.search);
 if(query.has("import")){
  try{
   const links=JSON.parse(query.get("import"));
   if(!Array.isArray(links)||!links.length)throw Error("No tabs were imported.");
   pendingImportedChromeTabs=links.slice(0,20).filter(url=>typeof url==="string"&&/^https?:\/\//.test(url));
   showView(true);
   say("host-message","Chrome tabs captured. Enter your host password to load them into a preset.");
  }catch(e){say("host-message","Chrome import failed: "+e.message,true)}
  history.replaceState(null,"",location.pathname);
 }

 blankPreset();
 await loadConfig();
 await refreshStudent();
 setInterval(()=>{if(!$("student-view").classList.contains("hidden")&&!document.hidden)refreshStudent()},15000);
}
init();
})();
