<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Folio — Markdown Reader</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
<style>
  @font-face {
    font-family: 'ui-serif-stack';
    src: local('Iowan Old Style'), local('Palatino Linotype'), local('Georgia');
  }
 
  :root {
    --paper: #f6f2e9;
    --paper-2: #efe9db;
    --ink: #22201b;
    --ink-dim: #6b6558;
    --ink-faint: #a49c8a;
    --rule: #d8cfba;
    --accent: #a8442f;
    --accent-soft: #e9d9cd;
    --code-bg: #1e1c18;
    --sidebar-w: 280px;
    --serif: 'Iowan Old Style', 'Palatino Linotype', Georgia, 'Noto Serif', serif;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
    --mono: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace;
  }
 
  html[data-theme="dark"] {
    --paper: #161512;
    --paper-2: #1c1b17;
    --ink: #e9e4d8;
    --ink-dim: #a39c8a;
    --ink-faint: #6b6558;
    --rule: #322f27;
    --accent: #d9805f;
    --accent-soft: #382720;
    --code-bg: #0d0c0a;
  }
 
  * { box-sizing: border-box; }
  body { margin: 0; }
 
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: var(--sans);
    height: 100vh;
    overflow: hidden;
    transition: background .3s ease, color .3s ease;
  }
 
  .app {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
    height: 100vh;
  }
 
  /* ---------- SIDEBAR ---------- */
  .sidebar {
    background: var(--paper-2);
    border-right: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    min-width: 0;
    transition: margin-left .28s ease;
  }
  .sidebar.collapsed { margin-left: calc(-1 * var(--sidebar-w)); }
 
  .brand {
    padding: 22px 20px 14px;
    display: flex;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid var(--rule);
  }
  .brand-mark {
    font-family: var(--serif);
    font-size: 22px;
    font-style: italic;
    color: var(--accent);
  }
  .brand-sub {
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }
 
  .doc-controls {
    padding: 16px 18px;
    border-bottom: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
 
  .btn {
    font-family: var(--sans);
    font-size: 12.5px;
    letter-spacing: 0.01em;
    padding: 8px 12px;
    border-radius: 3px;
    border: 1px solid var(--rule);
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: border-color .15s ease, background .15s ease;
  }
  .btn:hover { border-color: var(--ink-faint); background: var(--paper); }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--paper-2);
  }
  .btn.primary:hover { opacity: .88; background: var(--accent); }
  .btn svg { width: 14px; height: 14px; flex-shrink: 0; }
  .btn-row { display: flex; gap: 8px; }
  .btn-row .btn { flex: 1; }
 
  #file-input { display: none; }
 
  .toc-header {
    padding: 16px 20px 8px;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-faint);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .toc-count {
    font-variant-numeric: tabular-nums;
    color: var(--ink-faint);
  }
 
  .toc {
    flex: 1;
    overflow-y: auto;
    padding: 4px 10px 20px;
  }
  .toc::-webkit-scrollbar { width: 6px; }
  .toc::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 3px; }
 
  .toc-item {
    display: block;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--ink-dim);
    text-decoration: none;
    border-radius: 3px;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-left: 2px solid transparent;
    transition: background .12s ease, color .12s ease;
  }
  .toc-item:hover { background: var(--paper); color: var(--ink); }
  .toc-item.active {
    color: var(--accent);
    border-left-color: var(--accent);
    background: var(--accent-soft);
    font-weight: 600;
  }
  .toc-item[data-level="2"] { padding-left: 22px; }
  .toc-item[data-level="3"] { padding-left: 34px; font-size: 12px; }
  .toc-item[data-level="4"] { padding-left: 46px; font-size: 12px; }
 
  .toc-empty {
    padding: 20px;
    font-size: 12px;
    color: var(--ink-faint);
    line-height: 1.6;
    font-style: italic;
  }
 
  .sidebar-footer {
    padding: 12px 18px;
    border-top: 1px solid var(--rule);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--ink-faint);
  }
  .stat-num { color: var(--ink-dim); font-variant-numeric: tabular-nums; }
 
  /* ---------- MAIN ---------- */
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100vh;
  }
 
  .topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 24px;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
  }
 
  .icon-btn {
    width: 30px; height: 30px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 4px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--ink-dim);
    cursor: pointer;
    flex-shrink: 0;
  }
  .icon-btn:hover { background: var(--paper-2); border-color: var(--rule); color: var(--ink); }
  .icon-btn svg { width: 16px; height: 16px; }
  .icon-btn.active { color: var(--accent); }
 
  .doc-title {
    font-family: var(--serif);
    font-size: 15px;
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
 
  .mode-switch {
    display: flex;
    border: 1px solid var(--rule);
    border-radius: 4px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .mode-btn {
    font-family: var(--sans);
    font-size: 11.5px;
    letter-spacing: 0.03em;
    padding: 6px 13px;
    background: transparent;
    border: none;
    color: var(--ink-dim);
    cursor: pointer;
    border-right: 1px solid var(--rule);
  }
  .mode-btn:last-child { border-right: none; }
  .mode-btn.active { background: var(--accent); color: var(--paper-2); }
 
  .topbar-right { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
 
  .progress-track {
    height: 2px;
    background: var(--rule);
    position: relative;
  }
  .progress-fill {
    height: 100%;
    background: var(--accent);
    width: 0%;
    transition: width .1s linear;
  }
 
  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr;
    overflow: hidden;
    position: relative;
  }
  .workspace.split { grid-template-columns: 1fr 1fr; }
 
  .pane { min-width: 0; height: 100%; overflow: hidden; position: relative; }
  .pane + .pane { border-left: 1px solid var(--rule); }
 
  #editor {
    width: 100%; height: 100%;
    resize: none; border: none; outline: none;
    background: var(--paper);
    color: var(--ink-dim);
    font-family: var(--mono);
    font-size: 13.5px;
    line-height: 1.7;
    padding: 28px 30px;
    tab-size: 2;
  }
 
  .reader-scroll {
    height: 100%;
    overflow-y: auto;
    scroll-behavior: smooth;
  }
  .reader-scroll::-webkit-scrollbar { width: 10px; }
  .reader-scroll::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 5px; border: 2px solid var(--paper); }
 
  .reader {
    max-width: 700px;
    margin: 0 auto;
    padding: 56px 40px 120px;
    font-family: var(--serif);
    font-size: 18px;
    line-height: 1.75;
    color: var(--ink);
  }
 
  /* dropzone empty state */
  .empty-state {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 18px;
    text-align: center;
    padding: 40px;
  }
  .empty-state.dragover { background: var(--accent-soft); }
  .empty-icon {
    width: 52px; height: 52px;
    color: var(--ink-faint);
  }
  .empty-title {
    font-family: var(--serif);
    font-style: italic;
    font-size: 22px;
    color: var(--ink-dim);
  }
  .empty-sub {
    font-size: 13px;
    color: var(--ink-faint);
    max-width: 320px;
    line-height: 1.6;
  }
 
  /* markdown typography */
  .reader h1, .reader h2, .reader h3, .reader h4 {
    font-family: var(--serif);
    color: var(--ink);
    font-weight: 600;
    scroll-margin-top: 30px;
  }
  .reader h1 {
    font-size: 2.1em;
    margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  .reader h1 + p { color: var(--ink-dim); font-style: italic; }
  .reader h2 {
    font-size: 1.5em;
    margin: 1.6em 0 0.5em;
    padding-top: 0.4em;
    border-top: 1px solid var(--rule);
  }
  .reader h2:first-child { border-top: none; padding-top: 0; margin-top: 0; }
  .reader h3 { font-size: 1.2em; margin: 1.4em 0 0.4em; }
  .reader h4 { font-size: 1.02em; margin: 1.2em 0 0.3em; color: var(--ink-dim); }
  .reader p { margin: 0.9em 0; }
  .reader a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent-soft); }
  .reader a:hover { border-bottom-color: var(--accent); }
  .reader strong { font-weight: 700; }
  .reader em { font-style: italic; }
  .reader ul, .reader ol { padding-left: 1.4em; margin: 0.9em 0; }
  .reader li { margin: 0.35em 0; }
  .reader li::marker { color: var(--accent); }
  .reader blockquote {
    margin: 1.2em 0;
    padding: 0.2em 0 0.2em 1.1em;
    border-left: 3px solid var(--accent);
    color: var(--ink-dim);
    font-style: italic;
  }
  .reader hr { border: none; border-top: 1px solid var(--rule); margin: 2.4em 0; }
  .reader img { max-width: 100%; border-radius: 4px; margin: 1em 0; }
  .reader code {
    font-family: var(--mono);
    font-size: 0.85em;
    background: var(--paper-2);
    border: 1px solid var(--rule);
    padding: 0.1em 0.4em;
    border-radius: 3px;
    color: var(--accent);
  }
  .reader pre {
    background: var(--code-bg) !important;
    border-radius: 6px;
    padding: 18px 20px;
    overflow-x: auto;
    margin: 1.2em 0;
    font-size: 0.82em;
    line-height: 1.6;
  }
  .reader pre code {
    background: none;
    border: none;
    padding: 0;
    color: #e9e4d8;
    font-size: 1em;
  }
  .reader table {
    width: 100%;
    border-collapse: collapse;
    margin: 1.4em 0;
    font-family: var(--sans);
    font-size: 0.82em;
  }
  .reader th, .reader td {
    border: 1px solid var(--rule);
    padding: 8px 12px;
    text-align: left;
  }
  .reader th {
    background: var(--paper-2);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .reader tr:nth-child(even) td { background: var(--paper-2); }
  .reader input[type="checkbox"] { margin-right: 0.5em; }
 
  @media print {
    .sidebar, .topbar, .progress-track { display: none !important; }
    .workspace { grid-template-columns: 1fr !important; }
    .pane#preview-pane { display: block !important; }
    #editor, #edit-pane { display: none !important; }
    .reader { max-width: 100%; padding: 0; }
    body { background: white; }
    .reader { color: black; }
  }
 
  @media (max-width: 760px) {
    :root { --sidebar-w: 240px; }
    .doc-title { display: none; }
    .reader { padding: 40px 20px 100px; font-size: 16px; }
  }
</style>
</head>
<body>
 
<div class="app">
 
  <aside class="sidebar" id="sidebar">
    <div class="brand">
      <span class="brand-mark">Folio</span>
      <span class="brand-sub">Markdown Reader</span>
    </div>
 
    <div class="doc-controls">
      <button class="btn primary" id="open-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
        Open file
      </button>
      <div class="btn-row">
        <button class="btn" id="sample-btn">Sample</button>
        <button class="btn" id="clear-btn">Clear</button>
      </div>
      <input type="file" id="file-input" accept=".md,.markdown,.txt">
    </div>
 
    <div class="toc-header">
      <span>Contents</span>
      <span class="toc-count" id="toc-count">0</span>
    </div>
    <nav class="toc" id="toc">
      <div class="toc-empty">Headings from your document will appear here for quick navigation.</div>
    </nav>
 
    <div class="sidebar-footer">
      <span><span class="stat-num" id="word-count">0</span> words</span>
      <span><span class="stat-num" id="read-time">0 min</span> read</span>
    </div>
  </aside>
 
  <div class="main">
    <div class="topbar">
      <button class="icon-btn" id="toggle-sidebar" title="Toggle sidebar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg>
      </button>
      <span class="doc-title" id="doc-title">Untitled document</span>
 
      <div class="mode-switch">
        <button class="mode-btn active" data-mode="read">Read</button>
        <button class="mode-btn" data-mode="split">Split</button>
        <button class="mode-btn" data-mode="edit">Edit</button>
      </div>
 
      <div class="topbar-right">
        <button class="icon-btn" id="theme-toggle" title="Toggle theme">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
        </button>
        <button class="icon-btn" id="print-btn" title="Print / Export PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
        </button>
      </div>
    </div>
 
    <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
 
    <div class="workspace" id="workspace">
      <div class="pane" id="edit-pane" style="display:none">
        <textarea id="editor" spellcheck="false" placeholder="# Start typing markdown here…"></textarea>
      </div>
      <div class="pane" id="preview-pane">
        <div class="reader-scroll" id="reader-scroll">
          <div class="empty-state" id="empty-state">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 11h3"/></svg>
            <div class="empty-title">Drop a markdown file to begin</div>
            <div class="empty-sub">Or open a file, paste text in Edit mode, or load the sample document to see Folio in action.</div>
          </div>
          <article class="reader" id="reader" style="display:none"></article>
        </div>
      </div>
    </div>
  </div>
 
</div>
 
<script>
(function () {
  marked.setOptions({
    gfm: true,
    breaks: false,
    highlight: function (code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try { return hljs.highlight(code, { language: lang }).value; } catch (e) {}
      }
      return hljs.highlightAuto(code).value;
    }
  });
 
  var editor = document.getElementById('editor');
  var reader = document.getElementById('reader');
  var emptyState = document.getElementById('empty-state');
  var readerScroll = document.getElementById('reader-scroll');
  var toc = document.getElementById('toc');
  var tocCount = document.getElementById('toc-count');
  var wordCountEl = document.getElementById('word-count');
  var readTimeEl = document.getElementById('read-time');
  var docTitle = document.getElementById('doc-title');
  var progressFill = document.getElementById('progress-fill');
  var workspace = document.getElementById('workspace');
  var editPane = document.getElementById('edit-pane');
  var previewPane = document.getElementById('preview-pane');
  var fileInput = document.getElementById('file-input');
 
  var slugCounts = {};
 
  function slugify(text) {
    var base = text.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    var n = slugCounts[base] || 0;
    slugCounts[base] = n + 1;
    return n === 0 ? base : base + '-' + n;
  }
 
  function render(md, filename) {
    slugCounts = {};
    var tokens = marked.lexer(md);
    var headings = [];
 
    tokens.forEach(function (t) {
      if (t.type === 'heading' && t.depth <= 4) {
        var id = slugify(t.text.replace(/[*_`]/g, ''));
        headings.push({ level: t.depth, text: t.text.replace(/[*_`]/g, ''), id: id });
      }
    });
 
    var renderer = new marked.Renderer();
    slugCounts = {};
    renderer.heading = function (text, level) {
      var clean = text.replace(/<[^>]+>/g, '');
      var id = slugify(clean);
      return '<h' + level + ' id="' + id + '">' + text + '</h' + level + '>';
    };
 
    var html = marked.parse(md, { renderer: renderer });
    reader.innerHTML = html;
    reader.style.display = 'block';
    emptyState.style.display = 'none';
 
    buildTOC(headings);
    updateStats(md);
    if (filename) docTitle.textContent = filename;
    readerScroll.scrollTop = 0;
  }
 
  function buildTOC(headings) {
    tocCount.textContent = headings.length;
    if (!headings.length) {
      toc.innerHTML = '<div class="toc-empty">No headings found in this document.</div>';
      return;
    }
    var html = headings.map(function (h) {
      return '<a class="toc-item" data-level="' + h.level + '" href="#' + h.id + '" data-target="' + h.id + '">' + h.text + '</a>';
    }).join('');
    toc.innerHTML = html;
 
    toc.querySelectorAll('.toc-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(this.getAttribute('data-target'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
 
  function updateStats(md) {
    var words = (md.trim().match(/\S+/g) || []).length;
    wordCountEl.textContent = words.toLocaleString();
    readTimeEl.textContent = Math.max(1, Math.round(words / 220)) + ' min';
  }
 
  function updateActiveTOC() {
    var headingsEls = reader.querySelectorAll('h1[id], h2[id], h3[id], h4[id]');
    if (!headingsEls.length) return;
    var scrollPos = readerScroll.scrollTop + 40;
    var activeId = headingsEls[0].id;
    headingsEls.forEach(function (h) {
      if (h.offsetTop <= scrollPos) activeId = h.id;
    });
    toc.querySelectorAll('.toc-item').forEach(function (item) {
      item.classList.toggle('active', item.getAttribute('data-target') === activeId);
    });
  }
 
  readerScroll.addEventListener('scroll', function () {
    updateActiveTOC();
    var max = readerScroll.scrollHeight - readerScroll.clientHeight;
    var pct = max > 0 ? (readerScroll.scrollTop / max) * 100 : 0;
    progressFill.style.width = pct + '%';
  });
 
  editor.addEventListener('input', function () {
    render(editor.value, docTitle.textContent === 'Untitled document' ? null : docTitle.textContent);
  });
 
  document.getElementById('open-btn').addEventListener('click', function () {
    fileInput.click();
  });
 
  fileInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (file) loadFile(file);
  });
 
  function loadFile(file) {
    var reader2 = new FileReader();
    reader2.onload = function (e) {
      editor.value = e.target.result;
      render(e.target.result, file.name);
    };
    reader2.readAsText(file);
  }
 
  ['dragenter', 'dragover'].forEach(function (evt) {
    document.body.addEventListener(evt, function (e) {
      e.preventDefault();
      emptyState.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    document.body.addEventListener(evt, function (e) {
      e.preventDefault();
      emptyState.classList.remove('dragover');
    });
  });
  document.body.addEventListener('drop', function (e) {
    e.preventDefault();
    var file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });
 
  document.getElementById('clear-btn').addEventListener('click', function () {
    editor.value = '';
    reader.style.display = 'none';
    reader.innerHTML = '';
    emptyState.style.display = 'flex';
    docTitle.textContent = 'Untitled document';
    toc.innerHTML = '<div class="toc-empty">Headings from your document will appear here for quick navigation.</div>';
    tocCount.textContent = '0';
    wordCountEl.textContent = '0';
    readTimeEl.textContent = '0 min';
  });
 
  var SAMPLE = '# The Folio Reader\\n\\nA quiet, distraction-free way to read markdown — drop a file, paste text, or write directly in Edit mode.\\n\\n## Why a reading-first layout\\n\\nMost markdown previewers are afterthoughts bolted onto a code editor. Folio starts from the opposite direction: the *reading* experience is the default view, with editing and side-by-side comparison available when you need them.\\n\\n### Three modes\\n\\n- **Read** — full-width typeset prose, like a printed page\\n- **Split** — editor and preview side by side\\n- **Edit** — distraction-free writing\\n\\n## Everything renders properly\\n\\nTables:\\n\\n| Feature | Status |\\n|---|---|\\n| Live TOC | Done |\\n| Dark mode | Done |\\n| Drag & drop | Done |\\n| Print / export | Done |\\n\\nCode blocks, syntax highlighted:\\n\\n```javascript\\nfunction greet(name) {\\n  return `Hello, ${name}!`;\\n}\\n```\\n\\n> Blockquotes get a warm accent rule and italic treatment, set apart from body text without shouting.\\n\\nTask lists:\\n\\n- [x] Parse markdown\\n- [x] Build a table of contents\\n- [ ] Add you as a reader\\n\\n### Try it\\n\\nSwitch to **Edit** or **Split** mode above and start typing — the table of contents and word count update as you go.\\n\\n---\\n\\nBuilt as a single self-contained HTML file. No build step, no server, works offline once loaded.\\n';
 
  document.getElementById('sample-btn').addEventListener('click', function () {
    editor.value = SAMPLE;
    render(SAMPLE, 'sample.md');
  });
 
  document.getElementById('toggle-sidebar').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('collapsed');
  });
 
  document.getElementById('theme-toggle').addEventListener('click', function () {
    var html = document.documentElement;
    var current = html.getAttribute('data-theme');
    html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  });
 
  document.getElementById('print-btn').addEventListener('click', function () {
    window.print();
  });
 
  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var mode = btn.getAttribute('data-mode');
      if (mode === 'read') {
        workspace.classList.remove('split');
        editPane.style.display = 'none';
        previewPane.style.display = 'block';
      } else if (mode === 'split') {
        workspace.classList.add('split');
        editPane.style.display = 'block';
        previewPane.style.display = 'block';
      } else if (mode === 'edit') {
        workspace.classList.remove('split');
        editPane.style.display = 'block';
        previewPane.style.display = 'none';
      }
    });
  });
 
  // load sample on first paint
  editor.value = SAMPLE;
  render(SAMPLE, 'sample.md');
})();
</script>
 
</body>
</html>
 
