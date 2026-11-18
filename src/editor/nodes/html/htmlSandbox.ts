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
})();`

const BASE_CSS = (vars: Record<string, string>) =>
  `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}` +
  'html{background:transparent}body{margin:0;padding:4px 2px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;' +
  'font-size:15px;line-height:1.55;color:var(--c-text,#1a1a1a)}*{box-sizing:border-box}'

/** Wraps a teacher's / AI's HTML (a fragment or a whole page) with the policy, theme and SDK. */
export function buildSrcDoc(code: string, vars: Record<string, string>, id: string): string {
  const head =
    `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${BASE_CSS(vars)}</style><script>${SDK(id).replace(/<\/script/gi, '<\\/script')}</script>`
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
