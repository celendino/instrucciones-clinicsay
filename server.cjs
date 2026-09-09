/**
 * Clinicsay File Browser Server
 * Servidor HTTP simple para navegar por las sedes y ver archivos JSON
 *
 * Uso:
 *   npm run server           (puerto 3456 por defecto)
 *   npm run server -- 8080   (puerto personalizado)
 *   node server.cjs [puerto]
 *
 * Default puerto: 3456
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;
const PORT = process.argv[2] || 3456;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
};

function escapeHtml(text) {
  if (text === undefined || text === null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── SVG Icons ──────────────────────────────────────────────────────
const ICONS = {
  folder: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  file: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  json: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  md: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  home: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  arrowLeft: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>`,
  chevronRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
  sede: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  input: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  output: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  clipboard: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
};

// ─── Shared Page Parts ──────────────────────────────────────────────
function pageHead(title, extraStyles = '') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --primary: #0d6efd;
      --primary-dark: #0b5ed7;
      --primary-light: #e7f1ff;
      --success: #198754;
      --success-light: #d1f2e7;
      --warning: #fd7e14;
      --warning-light: #ffe5d0;
      --info: #0dcaf0;
      --info-light: #cff4fc;
      --dark: #212529;
      --gray-50: #f8f9fa;
      --gray-100: #f1f3f4;
      --gray-200: #e9ecef;
      --gray-300: #dee2e6;
      --gray-400: #ced4da;
      --gray-500: #adb5bd;
      --gray-600: #6c757d;
      --gray-700: #495057;
      --gray-800: #343a40;
      --gray-900: #212529;
      --radius-sm: 6px;
      --radius: 10px;
      --radius-lg: 14px;
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
      --shadow: 0 2px 8px rgba(0,0,0,0.06);
      --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
      --shadow-lg: 0 8px 30px rgba(0,0,0,0.10);
      --transition: all 0.18s cubic-bezier(0.4,0,0.2,1);
      --font-sans: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
      --font-mono: "SF Mono",Monaco,Inconsolata,"Roboto Mono","Courier New",monospace;
    }
    * { box-sizing: border-box; }
    html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    body { margin:0; padding:0; font-family:var(--font-sans); background:var(--gray-50); color:var(--gray-800); line-height:1.55; font-size:15px; }
    a { color: var(--primary); text-decoration:none; }
    a:hover { text-decoration:underline; }
    
    /* Header */
    .header { background: linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%); color:white; padding: 1.25rem 2rem; box-shadow: var(--shadow-md); position: sticky; top:0; z-index:50; }
    .header-inner { max-width:1200px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .header-brand { display:flex; align-items:center; gap:0.75rem; font-size:1.15rem; font-weight:700; letter-spacing:-0.01em; }
    .header-brand svg { opacity:0.9; }
    .header-meta { font-size:0.8rem; opacity:0.8; font-weight:400; }
    
    /* Container */
    .container { max-width:1200px; margin:0 auto; padding: 1.5rem 2rem 3rem; }
    
    /* Breadcrumbs */
    .breadcrumbs { display:flex; align-items:center; flex-wrap:wrap; gap:0.35rem; margin-bottom:1.5rem; font-size:0.85rem; color:var(--gray-600); background:white; padding:0.65rem 1rem; border-radius:var(--radius); box-shadow:var(--shadow-sm); border:1px solid var(--gray-200); }
    .breadcrumbs a { color:var(--gray-600); display:flex; align-items:center; gap:0.3rem; padding:0.15rem 0.3rem; border-radius:var(--radius-sm); transition:var(--transition); }
    .breadcrumbs a:hover { background:var(--gray-100); color:var(--primary); text-decoration:none; }
    .breadcrumbs .sep { color:var(--gray-400); }
    .breadcrumbs .current { color:var(--gray-800); font-weight:500; display:flex; align-items:center; gap:0.3rem; }
    
    /* Page Title */
    .page-title { font-size:1.6rem; font-weight:700; color:var(--gray-900); margin:0 0 0.35rem; display:flex; align-items:center; gap:0.65rem; }
    .page-subtitle { color:var(--gray-600); font-size:0.9rem; margin-bottom:1.5rem; }
    
    /* Cards Grid */
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(280px,1fr)); gap:1rem; }
    @media (min-width: 768px) { .grid { grid-template-columns: repeat(auto-fill, minmax(300px,1fr)); } }
    
    /* Card */
    .card { background:white; border-radius:var(--radius-lg); box-shadow:var(--shadow); border:1px solid var(--gray-200); transition:var(--transition); overflow:hidden; display:flex; flex-direction:column; }
    .card:hover { box-shadow:var(--shadow-md); transform: translateY(-2px); border-color:var(--gray-300); }
    .card:active { transform: translateY(0); }
    .card-link { display:flex; align-items:center; gap:0.9rem; padding:1.1rem 1.25rem; color:inherit; text-decoration:none; flex:1; }
    .card-link:hover { text-decoration:none; }
    .card-icon { width:44px; height:44px; border-radius:var(--radius); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
    .card-icon svg { stroke-width:2.2; }
    .card-icon.folder { background:var(--primary-light); color:var(--primary); }
    .card-icon.sede { background:#e8f5e9; color:var(--success); }
    .card-icon.input { background:#fff8e1; color:#f9a825; }
    .card-icon.output { background:#fce4ec; color:#c2185b; }
    .card-icon.file { background:var(--gray-100); color:var(--gray-600); }
    .card-icon.json { background:var(--info-light); color:#0277bd; }
    .card-icon.md { background:#f3e5f5; color:#7b1fa2; }
    .card-body { flex:1; min-width:0; }
    .card-title { font-weight:600; font-size:0.95rem; color:var(--gray-900); margin:0 0 0.2rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .card-meta { font-size:0.8rem; color:var(--gray-500); display:flex; align-items:center; gap:0.4rem; }
    .card-badges { display:flex; gap:0.35rem; margin-top:0.5rem; flex-wrap:wrap; }
    
    /* Badges */
    .badge { display:inline-flex; align-items:center; gap:0.25rem; font-size:0.7rem; font-weight:600; padding:0.2rem 0.55rem; border-radius:100px; letter-spacing:0.02em; }
    .badge-full { background:var(--success-light); color:var(--success); }
    .badge-tasks { background:var(--warning-light); color:#e65100; }
    .badge-json { background:var(--info-light); color:#006064; }
    .badge-dir { background:var(--gray-100); color:var(--gray-700); }
    
    /* Section */
    .section { margin-top:2rem; }
    .section-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1rem; }
    .section-title { font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--gray-500); margin:0; }
    .section-count { font-size:0.75rem; color:var(--gray-400); background:var(--gray-100); padding:0.15rem 0.5rem; border-radius:100px; font-weight:600; }
    
    /* Empty State */
    .empty { text-align:center; padding:3rem 1rem; color:var(--gray-400); }
    .empty svg { margin-bottom:0.75rem; opacity:0.4; }
    
    /* Footer */
    .footer { text-align:center; padding:2rem 1rem; color:var(--gray-400); font-size:0.8rem; border-top:1px solid var(--gray-200); margin-top:2rem; }
    
    /* JSON Viewer */
    .json-wrapper { background:#1e1e1e; border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--shadow-lg); }
    .json-header { background:#252526; padding:0.75rem 1.25rem; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #333; }
    .json-title { font-size:0.85rem; font-weight:600; color:#cccccc; display:flex; align-items:center; gap:0.5rem; }
    .json-badge { font-size:0.65rem; background:#3c3c3c; color:#aaa; padding:0.15rem 0.45rem; border-radius:4px; font-family:var(--font-mono); }
    .json-body { padding:1.25rem; overflow-x:auto; }
    .json-body pre { margin:0; font-family:var(--font-mono); font-size:0.82rem; line-height:1.55; color:#d4d4d4; background:transparent; }
    
    /* Syntax Highlighting */
    .j-key { color:#9cdcfe; }
    .j-string { color:#ce9178; }
    .j-number { color:#b5cea8; }
    .j-bool { color:#569cd6; }
    .j-null { color:#569cd6; }
    .j-brace { color:#ffd700; }
    
    /* Back button */
    .back-btn { display:inline-flex; align-items:center; gap:0.4rem; font-size:0.85rem; color:var(--primary); margin-bottom:1rem; padding:0.4rem 0.75rem; border-radius:var(--radius); transition:var(--transition); }
    .back-btn:hover { background:var(--primary-light); text-decoration:none; }

    /* Copy button */
    .copy-btn { display:inline-flex; align-items:center; gap:0.4rem; padding:0.45rem 0.85rem; border-radius:var(--radius-sm); font-size:0.8rem; font-weight:600; color:white; background:var(--success); border:none; cursor:pointer; transition:var(--transition); font-family:inherit; }
    .copy-btn:hover { background:#146c43; transform:translateY(-1px); }
    .copy-btn:active { transform:translateY(0); }
    .copy-btn svg { width:14px; height:14px; stroke-width:2.5; }
    .copy-btn.copied { background:var(--primary); }

    /* Card copy button */
    .card-copy { position:absolute; top:0.7rem; right:0.7rem; display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:var(--radius-sm); background:rgba(255,255,255,0.9); border:1px solid var(--gray-200); color:var(--gray-600); cursor:pointer; transition:var(--transition); opacity:0; }
    .card { position:relative; }
    .card:hover .card-copy { opacity:1; }
    .card-copy:hover { background:var(--primary); color:white; border-color:var(--primary); }
    .card-copy svg { width:16px; height:16px; }

    /* Toast */
    .toast { position:fixed; bottom:2rem; right:2rem; background:var(--gray-900); color:white; padding:0.85rem 1.25rem; border-radius:var(--radius); font-size:0.85rem; font-weight:500; box-shadow:var(--shadow-lg); display:flex; align-items:center; gap:0.6rem; transform:translateY(120%); transition:transform 0.35s cubic-bezier(0.175,0.885,0.32,1.275); z-index:9999; }
    .toast.show { transform:translateY(0); }
    .toast svg { width:18px; height:18px; color:var(--success); stroke-width:2.5; }

    /* Responsive */
    @media (max-width: 640px) {
      .header { padding:1rem; }
      .header-inner { flex-direction:column; align-items:flex-start; gap:0.35rem; }
      .container { padding:1rem; }
      .grid { grid-template-columns:1fr; }
      .page-title { font-size:1.3rem; }
    }
    
    /* Animations */
    @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
    .card { animation: fadeIn 0.25s ease-out both; }
    .card:nth-child(1) { animation-delay:0ms; }
    .card:nth-child(2) { animation-delay:40ms; }
    .card:nth-child(3) { animation-delay:80ms; }
    .card:nth-child(4) { animation-delay:120ms; }
    .card:nth-child(5) { animation-delay:160ms; }
    .card:nth-child(6) { animation-delay:200ms; }
    .card:nth-child(7) { animation-delay:240ms; }
    .card:nth-child(8) { animation-delay:280ms; }
    .card:nth-child(9) { animation-delay:320ms; }
    .card:nth-child(10) { animation-delay:360ms; }
    .card:nth-child(11) { animation-delay:400ms; }
    .card:nth-child(12) { animation-delay:440ms; }
    
    ${extraStyles}
  </style>
</head>`;
}

function pageHeader() {
  return `<body>
  <header class="header">
    <div class="header-inner">
      <div class="header-brand">
        ${ICONS.sede}
        <span>Clinicsay File Browser</span>
      </div>
      <div class="header-meta">Repositorio de instrucciones · Sede configs</div>
    </div>
  </header>
  <main class="container">`;
}

function pageFooter(requestPath, jsonContent = null) {
  const isRoot = requestPath === '/';
  const parent = isRoot ? '' : `<div style="margin-top:1rem;"><a class="back-btn" href="${path.dirname(requestPath) === '.' ? '/' : path.dirname(requestPath)}">${ICONS.arrowLeft} Carpeta superior</a></div>`;

  const copyScript = jsonContent ? `
  <script>
    const jsonContent = ${JSON.stringify(jsonContent)};
    async function copyJson() {
      try {
        await navigator.clipboard.writeText(jsonContent);
        showToast('${ICONS.check} JSON copiado al portapapeles');
        const btn = document.getElementById('copy-json-btn');
        if (btn) { btn.classList.add('copied'); btn.innerHTML = '${ICONS.check} Copiado'; setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML='${ICONS.copy} Copiar JSON';},2200); }
      } catch(e) {
        const ta = document.createElement('textarea'); ta.value = jsonContent; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        showToast('${ICONS.check} JSON copiado al portapapeles');
      }
    }
    function showToast(msg) {
      let t = document.getElementById('toast');
      if (!t) { t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
      t.innerHTML = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600);
    }
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.card-copy');
      if (!btn) return;
      const content = btn.getAttribute('data-content');
      if (!content) return;
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard.writeText(content).then(()=>showToast('${ICONS.check} Copiado al portapapeles')).catch(()=>{ const ta=document.createElement('textarea');ta.value=content;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('${ICONS.check} Copiado al portapapeles'); });
      btn.style.opacity='1'; btn.style.background='var(--success)'; btn.style.color='white'; btn.style.borderColor='var(--success)';
      setTimeout(()=>{ btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; },2200);
    });
  </script>` : `
  <script>
    function showToast(msg) {
      let t = document.getElementById('toast');
      if (!t) { t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
      t.innerHTML = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600);
    }
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.card-copy');
      if (!btn) return;
      const content = btn.getAttribute('data-content');
      if (!content) return;
      e.preventDefault(); e.stopPropagation();
      navigator.clipboard.writeText(content).then(()=>showToast('${ICONS.check} Copiado al portapapeles')).catch(()=>{ const ta=document.createElement('textarea');ta.value=content;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);showToast('${ICONS.check} Copiado al portapapeles'); });
      btn.style.opacity='1'; btn.style.background='var(--success)'; btn.style.color='white'; btn.style.borderColor='var(--success)';
      setTimeout(()=>{ btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; },2200);
    });
  </script>`;

  return `${parent}
  </main>
  <footer class="footer">
    <div>Clinicsay File Browser · Puerto ${PORT}</div>
    <div style="margin-top:0.3rem; font-size:0.75rem;">Node.js ${process.version} · ${new Date().toLocaleDateString('es-ES', {year:'numeric',month:'long',day:'numeric'})}</div>
  </footer>
  ${copyScript}
</body>
</html>`;
}

function breadcrumbs(requestPath) {
  if (!requestPath || requestPath === '/') {
    return `<nav class="breadcrumbs">${ICONS.home}<span class="sep">/</span><span class="current">Raíz del repositorio</span></nav>`;
  }
  let html = `<nav class="breadcrumbs">${ICONS.home}<a href="/">Raíz</a>`;
  let acc = '';
  const parts = requestPath.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    acc += '/' + part;
    const isLast = i === parts.length - 1;
    html += ` <span class="sep">${ICONS.chevronRight}</span> `;
    if (isLast) {
      html += `<span class="current">${escapeHtml(part)}</span>`;
    } else {
      html += `<a href="${acc}">${escapeHtml(part)}</a>`;
    }
  }
  html += `</nav>`;
  return html;
}

function getFileIconClass(name, ext) {
  if (name.includes('.full.')) return 'json';
  if (name.includes('.tasks-only.')) return 'json';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'md';
  if (name === 'input') return 'input';
  if (name === 'output') return 'output';
  return 'file';
}

function getFileIconSvg(name, ext) {
  if (ext === '.json' || name.includes('.json')) return ICONS.json;
  if (ext === '.md') return ICONS.md;
  return ICONS.file;
}

function getSedeIcon(name) {
  if (name.includes('martinez')) return 'sede';
  if (name.includes('aureo')) return 'sede';
  if (name.includes('poyatos')) return 'sede';
  if (name.includes('vene')) return 'sede';
  if (name.includes('demo')) return 'sede';
  return 'sede';
}

// ─── Render Directory ───────────────────────────────────────────────
function renderDirectory(dirPath, requestPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const dirs = entries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
  const files = entries.filter(e => e.isFile()).sort((a,b) => a.name.localeCompare(b.name));

  let html = pageHead(requestPath || 'Raíz');
  html += pageHeader();
  html += breadcrumbs(requestPath);

  const dirName = requestPath === '/' ? 'Repositorio Clinicsay' : path.basename(requestPath);
  const dirCount = dirs.length;
  const fileCount = files.length;

  html += `<h1 class="page-title">${requestPath === '/' ? ICONS.sede : ICONS.folder} ${escapeHtml(dirName)}</h1>`;
  html += `<div class="page-subtitle">${dirCount} carpeta${dirCount!==1?'s':''} · ${fileCount} archivo${fileCount!==1?'s':''}</div>`;

  if (dirs.length) {
    html += `<div class="section">`;
    html += `<div class="section-header"><h2 class="section-title">Carpetas</h2><span class="section-count">${dirs.length}</span></div>`;
    html += `<div class="grid">`;
    for (const d of dirs) {
      const fullPath = path.join(requestPath, d.name);
      const isSede = requestPath === '/sedes' || requestPath === '/sedes/';
      const iconClass = isSede ? getSedeIcon(d.name) : d.name === 'input' ? 'input' : d.name === 'output' ? 'output' : 'folder';
      const iconSvg = isSede ? ICONS.sede : d.name === 'input' ? ICONS.input : d.name === 'output' ? ICONS.output : ICONS.folder;
      let subtitle = 'Carpeta';
      if (d.name === 'input') subtitle = 'Archivos fuente y configuración';
      if (d.name === 'output') subtitle = 'JSON generados y validados';
      if (isSede) subtitle = 'Configuración de sede';

      html += `<div class="card">
        <a class="card-link" href="${fullPath}">
          <div class="card-icon ${iconClass}">${iconSvg}</div>
          <div class="card-body">
            <div class="card-title">${escapeHtml(d.name)}</div>
            <div class="card-meta">${subtitle}</div>
          </div>
        </a>
      </div>`;
    }
    html += `</div></div>`;
  }

  if (files.length) {
    html += `<div class="section">`;
    html += `<div class="section-header"><h2 class="section-title">Archivos</h2><span class="section-count">${files.length}</span></div>`;
    html += `<div class="grid">`;
    for (const f of files) {
      const fullPath = path.join(requestPath, f.name);
      const ext = path.extname(f.name).toLowerCase();
      const stat = fs.statSync(path.join(dirPath, f.name));
      const size = stat.size;
      const sizeStr = size > 1024*1024 ? (size/(1024*1024)).toFixed(1)+' MB'
        : size > 1024 ? (size/1024).toFixed(1)+' KB'
        : size+' B';
      const mtime = stat.mtime.toLocaleDateString('es-ES', {day:'2-digit', month:'short', year:'numeric'});

      const iconClass = getFileIconClass(f.name, ext);
      const iconSvg = getFileIconSvg(f.name, ext);

      let badges = '';
      if (f.name.includes('.full.')) badges += `<span class="badge badge-full">${ICONS.check} FULL</span>`;
      else if (f.name.includes('.tasks-only.')) badges += `<span class="badge badge-tasks">TASKS ONLY</span>`;
      else if (ext === '.json') badges += `<span class="badge badge-json">JSON</span>`;

      let meta = `${sizeStr} · ${mtime}`;
      if (f.name === 'structured-logic.full.json') meta = 'JSON modo full · ' + meta;
      if (f.name === 'structured-logic.tasks-only.json') meta = 'JSON modo tasks-only · ' + meta;

      // Copy button for JSON files
      let copyBtn = '';
      if (ext === '.json') {
        try {
          const fileContent = fs.readFileSync(path.join(dirPath, f.name), 'utf-8');
          copyBtn = `<button class="card-copy" data-content="${escapeHtml(fileContent)}" title="Copiar JSON completo">${ICONS.copy}</button>`;
        } catch(e) { /* ignore */ }
      }

      html += `<div class="card">
        <a class="card-link" href="${fullPath}">
          <div class="card-icon ${iconClass}">${iconSvg}</div>
          <div class="card-body">
            <div class="card-title">${escapeHtml(f.name)}</div>
            <div class="card-meta">${meta}</div>
            <div class="card-badges">${badges}</div>
          </div>
        </a>
        ${copyBtn}
      </div>`;
    }
    html += `</div></div>`;
  }

  if (!dirs.length && !files.length) {
    html += `<div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
      <div>Esta carpeta está vacía</div>
    </div>`;
  }

  html += pageFooter(requestPath);
  return html;
}

// ─── Syntax Highlight JSON ──────────────────────────────────────────
function highlightJson(jsonStr) {
  // Simple syntax highlighter for JSON string
  let html = '';
  let inString = false;
  let stringChar = '';
  let buffer = '';

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    const next = jsonStr[i+1] || '';

    if (!inString && (ch === '"' || ch === "'")) {
      if (buffer) { html += escapeHtml(buffer); buffer = ''; }
      inString = true;
      stringChar = ch;
      buffer = ch;
    } else if (inString && ch === stringChar && jsonStr[i-1] !== '\\') {
      buffer += ch;
      html += `<span class="j-string">${escapeHtml(buffer)}</span>`;
      buffer = '';
      inString = false;
    } else if (inString) {
      buffer += ch;
    } else if (/[0-9\-]/.test(ch) && !inString) {
      if (buffer && !/[0-9\-\.]/.test(buffer[0])) { html += escapeHtml(buffer); buffer = ''; }
      buffer += ch;
    } else if (buffer && /[0-9\-\.]/.test(buffer[0]) && !/[0-9\-\.]/.test(ch)) {
      html += `<span class="j-number">${escapeHtml(buffer)}</span>`;
      buffer = ch;
    } else if (ch === '{' || ch === '}' || ch === '[' || ch === ']') {
      if (buffer) { html += escapeHtml(buffer); buffer = ''; }
      html += `<span class="j-brace">${escapeHtml(ch)}</span>`;
    } else if (ch === ':' && !inString) {
      if (buffer) { html += `<span class="j-key">${escapeHtml(buffer)}</span>`; buffer = ''; }
      html += `<span class="j-brace">:</span>`;
    } else if ((ch === 't' && jsonStr.substr(i,4) === 'true') || (ch === 'f' && jsonStr.substr(i,5) === 'false')) {
      if (buffer) { html += escapeHtml(buffer); buffer = ''; }
      const word = ch === 't' ? 'true' : 'false';
      html += `<span class="j-bool">${word}</span>`;
      i += word.length - 1;
    } else if (ch === 'n' && jsonStr.substr(i,4) === 'null') {
      if (buffer) { html += escapeHtml(buffer); buffer = ''; }
      html += `<span class="j-null">null</span>`;
      i += 3;
    } else {
      buffer += ch;
    }
  }
  if (buffer) html += escapeHtml(buffer);
  return html;
}

// ─── Render File ────────────────────────────────────────────────────
function renderFile(filePath, requestPath) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf-8');
  const size = content.length;
  const sizeStr = size > 1024 ? (size/1024).toFixed(1)+' KB' : size+' B';

  if (ext === '.json') {
    let formatted;
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      formatted = content;
    }
    const highlighted = highlightJson(formatted);

    let badge = '';
    const basename = path.basename(requestPath);
    if (basename.includes('.full.')) badge = '<span class="json-badge">MODO FULL</span>';
    else if (basename.includes('.tasks-only.')) badge = '<span class="json-badge">TASKS ONLY</span>';
    else badge = '<span class="json-badge">JSON</span>';

    return pageHead(basename, `
      .json-wrapper { max-width:1200px; margin:0 auto; }
      .container { max-width:none; padding:1.5rem 1rem; }
      .json-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
      .json-actions { display:flex; align-items:center; gap:0.5rem; }
    `) + pageHeader() +
    breadcrumbs(requestPath) +
    `<a class="back-btn" href="${path.dirname(requestPath)}">${ICONS.arrowLeft} Volver a la carpeta</a>
    <div class="json-wrapper">
      <div class="json-header">
        <div class="json-title">${ICONS.json} ${escapeHtml(basename)} ${badge}</div>
        <div class="json-actions">
          <button class="copy-btn" id="copy-json-btn" onclick="copyJson()">${ICONS.copy} Copiar JSON</button>
          <div class="json-badge">${sizeStr}</div>
        </div>
      </div>
      <div class="json-body"><pre>${highlighted}</pre></div>
    </div>` +
    pageFooter(requestPath, formatted);
  }

  // Text file
  return pageHead(path.basename(requestPath)) + pageHeader() +
  breadcrumbs(requestPath) +
  `<a class="back-btn" href="${path.dirname(requestPath)}">${ICONS.arrowLeft} Volver a la carpeta</a>
  <div class="json-wrapper">
    <div class="json-header">
      <div class="json-title">${ICONS.file} ${escapeHtml(path.basename(requestPath))}</div>
      <div class="json-badge">${sizeStr}</div>
    </div>
    <div class="json-body"><pre>${escapeHtml(content)}</pre></div>
  </div>` +
  pageFooter(requestPath);
}

// ─── Server ─────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  let requestPath = decodeURIComponent(parsed.pathname);

  // Path traversal protection
  const safePath = path.normalize(requestPath).replace(/^(\.\.(\/|\$))+/g, '');
  const fullPath = path.join(ROOT, safePath);

  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  try {
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!requestPath.endsWith('/')) {
        res.writeHead(301, { Location: requestPath + '/' });
        res.end();
        return;
      }
      const html = renderDirectory(fullPath, safePath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      const ext = path.extname(fullPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/javascript') {
        const html = renderFile(fullPath, safePath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } else {
        const data = fs.readFileSync(fullPath);
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
        res.end(data);
      }
    }
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(pageHead('404') + `<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:var(--font-sans);background:var(--gray-50);color:var(--gray-600);">
      <div style="text-align:center;">
        <div style="font-size:4rem;margin-bottom:1rem;">🔍</div>
        <h1 style="color:var(--gray-800);margin:0 0 0.5rem;">404 — No encontrado</h1>
        <p>${escapeHtml(err.message)}</p>
        <a href="/" style="display:inline-block;margin-top:1rem;color:var(--primary);">← Volver al inicio</a>
      </div>
    </body></html>`);
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🚀  Clinicsay File Browser levantado correctamente          ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📍 URL principal:  http://localhost:${PORT}                    ║
║                                                              ║
║  📂 Ver sedes:      http://localhost:${PORT}/sedes/               ║
║                                                              ║
║  💡 Uso:                                                 ║
║     npm run server                                         ║
║     npm run server -- 8080                                 ║
║     node server.cjs 3456                                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
   Presiona Ctrl+C para detener el servidor
`);
});
