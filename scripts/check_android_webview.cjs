/* Actual Android WebView CDP test (emulator, not physical Samsung).
 * Browser-level Playwright CDP cannot attach to WebView; use its page target.
 */
'use strict';
const fs=require('node:fs');
const http=require('node:http');
const WebSocket=require('./flag-browser/node_modules/ws');
function getJson(path){
  return new Promise((resolve,reject)=>http.get('http://127.0.0.1:9222'+path,response=>{
    const parts=[];
    response.on('data',part=>parts.push(part));
    response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')))}
      catch(error){reject(error)}});
    response.on('error',reject);
  }).on('error',reject));
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(){
  let tabs=[];
  for(let i=0;i<25;i++){
    tabs=await getJson('/json');
    const target=tabs.find(t=>t.webSocketDebuggerUrl &&
      t.url.includes('appassets.androidplatform.net'));
    if(target){
      const ws=new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
      let serial=0;
      const pending=new Map();
      ws.on('message',raw=>{
        const msg=JSON.parse(raw.toString());
        if(!msg.id || !pending.has(msg.id))return;
        const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);
        msg.error?reject(Error(msg.error.message)):resolve(msg.result);
      });
      const call=(method,params={})=>new Promise((resolve,reject)=>{
        const id=++serial;pending.set(id,{resolve,reject});
        ws.send(JSON.stringify({id,method,params}));
      });
      const evaluate=async expression=>{
        const result=await call('Runtime.evaluate',
          {expression,returnByValue:true,awaitPromise:true});
        if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
        return result.result?.value;
      };
      await call('Runtime.enable');
      return {ws,call,evaluate,url:target.url};
    }
    await sleep(400);
  }
  throw Error('No WebView page target: '+JSON.stringify(tabs));
}
// The function is serialized and executed within Android WebView via CDP.
async function inspectFlags(){
  const map=document.getElementById('world-map');
  const image=document.getElementById('geo8-overview-flags');
  const border=document.getElementById('geo8-overview-borders');
  const response=await fetch('flag-overview.json');
  const manifest=await response.json();
  return {
    platform:navigator.userAgent,
    mapHasFlags:map.classList.contains('flag-fill'),
    rasterSrc:image?.getAttribute('href'),
    rasterVisible:!!image && image.style.display!=='none' &&
      getComputedStyle(image).display!=='none',
    borderVisible:!!border && border.style.display!=='none',
    actualCountryCount:document.querySelectorAll('#countries .country-link').length,
    flagCount:manifest.countries,
    flagScale:manifest.scale,
    polygonCount:manifest.pieces,
    assetStatus:response.status
  };
}
async function main(){
  fs.mkdirSync('webview-evidence',{recursive:true});
  const {ws,call,evaluate,url}=await connect();
  let ready=false;
  for(let i=0;i<100;i++){
    ready=await evaluate('!!document.getElementById("world-map")');
    if(ready)break;
    await sleep(250);
  }
  if(!ready)throw Error('Map not loaded in Android WebView at '+url);
  await evaluate('document.getElementById("skip-name")?.click()');
  let complete=false;
  for(let i=0;i<160;i++){
    complete=await evaluate('!!window.GeoPrzygodaFlagStatus?.().complete');
    if(complete)break;
    await sleep(250);
  }
  if(!complete)throw Error('Flag init not completed in WebView');
  const evidence=await evaluate('('+inspectFlags.toString()+')()');
  fs.writeFileSync('webview-evidence/report.json',JSON.stringify(evidence,null,2));
  const capture=await call('Page.captureScreenshot',{format:'png'});
  if(capture?.data)fs.writeFileSync('webview-evidence/webview.png',
    Buffer.from(capture.data,'base64'));
  // Verify the historical 1.0.26 SVG fallback and direct PNG clipping at a
  // real close-up, not only the pre-rasterized global overview.
  await evaluate('setView({x:548,y:343,w:25,h:25},false)');
  let zoomCheck=null;
  for (let attempt=0;attempt<45;attempt++) {
    await sleep(350);
    zoomCheck=await evaluate(String.raw`(()=>{
      const primary=document.getElementById('land-NLD');
      const group=primary?.parentElement;
      const pieces=group?[...group.querySelectorAll('path.land')]:[];
      const legacy=document.getElementById('geo10-legacy-flag-NLD');
      return {
        zoom:document.getElementById('world-map').viewBox.baseVal.width,
        baseRasterHidden:document.getElementById('geo8-overview-flags').style.display==='none',
        pieces:pieces.length,
        legacyFlag:!!legacy,
        legacyPainted:pieces.some(p=>p.style.fill.includes('geo10-legacy-flag-NLD')),
        oldSvgSource:legacy?.querySelector('image')?.getAttribute('href'),
        symbolAspect:legacy?.querySelector('image')?.getAttribute('preserveAspectRatio'),
        noDuplicateClipImages:!group?.querySelector('.geo8-photo')
      };
    })()`);
    if(zoomCheck.legacyPainted && zoomCheck.legacyFlag && zoomCheck.pieces>1)
      break;
  }
  const zoomCapture=await call('Page.captureScreenshot',{format:'png'});
  if(zoomCapture?.data)fs.writeFileSync('webview-evidence/nld-zoom.png',
    Buffer.from(zoomCapture.data,'base64'));
  fs.writeFileSync('webview-evidence/zoom-report.json',
    JSON.stringify(zoomCheck,null,2));
  console.log('Plan 10 Netherlands close-up',JSON.stringify(zoomCheck));
  console.log(JSON.stringify(evidence,null,2));
  ws.close();
  if(!evidence.mapHasFlags||!evidence.rasterVisible||!evidence.borderVisible||
     evidence.rasterSrc!=='flag-overview.png'||evidence.flagCount<230||
     evidence.flagScale<2||evidence.actualCountryCount<190||
     evidence.assetStatus!==200)throw Error('Real WebView flag smoke test failed');
  if(!zoomCheck || zoomCheck.zoom>30 || !zoomCheck.baseRasterHidden ||
     zoomCheck.pieces<2 || !zoomCheck.legacyPainted ||
     !zoomCheck.noDuplicateClipImages || !zoomCheck.legacyFlag ||
     zoomCheck.oldSvgSource!=='flags/nl.svg' || zoomCheck.symbolAspect!=='none')
    throw Error('Plan 10: Android WebView detailed islands or legacy flag failed');
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
