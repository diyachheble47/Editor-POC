// The page that goes inside an interactive HTML block's iframe.
//
// Safety comes from the browser, not from cleaning the code:
//  - the iframe has sandbox="allow-scripts" and NOT allow-same-origin, so the code
//    runs as an opaque origin: it cannot read the editor's DOM, cookies, storage or
//    call our backend as the user;
//  - the Content-Security-Policy below blocks every network request, external
//    script, image URL, frame and form post from inside it.
// What it can do: run its own inline JS and CSS, and talk to us through postMessage
// (resize, and tnb.emit() for things a student does, which is how reports will be fed).

export const SANDBOX = 'allow-scripts'
export const MAX_HTML = 60000

export const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** Theme colours handed to the widget as CSS variables (read from the app's tokens). */
export const THEME_VARS = [
  '--c-ground', '--c-surface', '--c-surface-hover', '--c-border', '--c-border-strong', '--c-text', '--c-text-2',
  '--c-text-3', '--c-accent', '--c-accent-bg', '--c-accent-text', '--c-success', '--c-danger',
] as const

const SDK = (id: string) => `(function(){
var id=${JSON.stringify(id)};
function send(m){try{parent.postMessage(m,'*')}catch(e){}}
function size(){var b=document.body,d=document.documentElement;send({tnb:1,id:id,type:'resize',height:Math.max(b?b.offsetHeight:0,d.offsetHeight)})}
window.tnb={emit:function(name,payload){send({tnb:1,id:id,type:'event',name:String(name).slice(0,60),payload:payload})}};
if(window.ResizeObserver)new ResizeObserver(size).observe(document.documentElement);
addEventListener('load',size);setTimeout(size,60);
// A still picture of the widget as it looks right now (used by Export as PDF): the
// parent asks, the widget answers with its own DOM and canvases flattened to images.
function copyStyles(a,b){var cs=getComputedStyle(a),st=b.style;if(st)for(var i=0;i<cs.length;i++)st.setProperty(cs[i],cs.getPropertyValue(cs[i]));for(var k=0;k<a.children.length&&k<b.children.length;k++)copyStyles(a.children[k],b.children[k])}
addEventListener('message',function(e){
var d=e.data;if(!d||d.tnb!==1||d.type!=='snapshot'||d.id!==id)return;
try{
var body=document.body,wrap=document.createElement('div'),clone=body.cloneNode(true);
var live=body.querySelectorAll('canvas'),cp=clone.querySelectorAll('canvas');
for(var i=0;i<cp.length;i++){try{var im=document.createElement('img');im.src=live[i].toDataURL('image/png');im.style.cssText='width:'+live[i].clientWidth+'px;height:'+live[i].clientHeight+'px';cp[i].parentNode.replaceChild(im,cp[i])}catch(x){}}
var sc=clone.querySelectorAll('script');for(var j=0;j<sc.length;j++)sc[j].remove();
copyStyles(body,clone);
var bs=getComputedStyle(body);for(var m=0;m<bs.length;m++)wrap.style.setProperty(bs[m],bs.getPropertyValue(bs[m]));
wrap.style.margin='0';while(clone.firstChild)wrap.appendChild(clone.firstChild);
wrap.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
send({tnb:1,id:id,type:'snapshot',req:d.req,xhtml:new XMLSerializer().serializeToString(wrap),width:Math.ceil(document.documentElement.scrollWidth),height:Math.ceil(Math.max(body.scrollHeight,document.documentElement.scrollHeight))});
}catch(x){send({tnb:1,id:id,type:'snapshot',req:d.req,error:String(x)})}
});
})();`

const BASE_CSS = (vars: Record<string, string>) =>
  `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}` +
  // !important: the widget's own CSS (often a light body background) must not
  // paint the whole iframe white in dark mode; the page behind should show through.
  'html,body{background:transparent !important}body{margin:0;padding:4px 2px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;' +
  'font-size:15px;line-height:1.55;color:var(--c-text,#1a1a1a)}*{box-sizing:border-box}'

// Pages written for three.js usually carry their own CDN <script src>, which the policy blocks.
const THREE_TAG = /<script\b[^>]*\bsrc=["'][^"']*three(?:\.min)?\.js[^"']*["'][^>]*>\s*<\/script>/gi

/** True when the page draws with three.js, so the editor should hand it the library. */
export const usesThree = (code: string) => /\b(THREE|T3)\b/.test(code)

/**
 * Wraps a teacher's / AI's HTML (a fragment or a whole page) with the policy, theme and SDK.
 * `three` is the library source; pass it for pages that use THREE and it is inlined (their own CDN tag is dropped).
 */
export function buildSrcDoc(code: string, vars: Record<string, string>, id: string, three?: string): string {
  if (three) code = code.replace(THREE_TAG, '')
  const head =
    `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${BASE_CSS(vars)}</style><script>${SDK(id).replace(/<\/script/gi, '<\\/script')}</script>` +
    (three ? `<script>${three.replace(/<\/script/gi, '<\\/script')}</script>` : '')
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, m => `${m}${head}`)
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, m => `${m}<head>${head}</head>`)
  return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`
}

export const clampHeight = (h: number) => Math.max(80, Math.min(900, Math.ceil(h)))

export function newBlockId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
