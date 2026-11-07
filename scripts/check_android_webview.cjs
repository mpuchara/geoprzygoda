/* Actual Android WebView smoke test via adb's remote DevTools connection.
 * This is an emulator WebView, not a physical Samsung validation.
 */
'use strict';
const fs=require('node:fs');
const {chromium}=require('./flag-browser/node_modules/playwright-core');
async function main(){
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages=browser.contexts().flatMap(c=>c.pages());
  const page=pages.find(p=>p.url().includes('appassets.androidplatform.net')) || pages[0];
  if(!page)throw Error('No Android WebView page found');
  await page.waitForFunction(()=>!!document.getElementById('world-map'),null,{timeout:60000});
  await page.evaluate(()=>document.getElementById('skip-name')?.click());
  await page.waitForFunction(()=>window.GeoPrzygodaFlagStatus?.().complete,
    null,{timeout:60000});
  const evidence=await page.evaluate(async()=>{
    const map=document.getElementById('world-map');
    const image=document.getElementById('geo8-overview-flags');
    const border=document.getElementById('geo8-overview-borders');
    if(!image||!border)throw Error('Missing Android raster overlay');
    const response=await fetch('flag-overview.json');
    const manifest=await response.json();
    return {
      platform:navigator.userAgent,
      mapHasFlags:map.classList.contains('flag-fill'),
      rasterSrc:image.getAttribute('href'),
      rasterVisible:image.style.display!=='none' &&
        getComputedStyle(image).display!=='none',
      selectedBorderPresent:!!border.getAttribute('d'),
      actualCountryCount:document.querySelectorAll('#countries .country-link').length,
      flagCount:manifest.countries,
      flagScale:manifest.scale,
      polygonCount:manifest.pieces,
      error:response.status
    };
  });
  fs.mkdirSync('webview-evidence',{recursive:true});
  fs.writeFileSync('webview-evidence/report.json',JSON.stringify(evidence,null,2));
  await page.screenshot({path:'webview-evidence/webview.png'});
  console.log(JSON.stringify(evidence,null,2));
  if(!evidence.mapHasFlags || !evidence.rasterVisible ||
     evidence.rasterSrc!=='flag-overview.png' || evidence.flagCount<230 ||
     evidence.flagScale<2 || evidence.actualCountryCount<190 ||
     !evidence.selectedBorderPresent || evidence.error!==200)
    throw Error('Android WebView world flag smoke test failed');
  await browser.close();
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1;});