/* =========================================================================
   main.js
   Handles:
     - Loading data from data/rankings.json
     - Search, filter, sort
     - Rendering table and UI updates
     - Local notes & star ratings persisted to localStorage
     - CSV export
     - Optional Firebase-backed persistent notes when js/firebase-config.js is present
   ========================================================================= */

/* -------------------------
   Quick helpers
   ------------------------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmt = (v) => (v === null || v === undefined) ? '' : String(v);

/* -------------------------
   App state
   ------------------------- */
const state = {
  data: [],        // all entries
  visible: [],     // filtered/sorted entries
  compact: false   // compact table view toggle (unused CSS can be added)
};

/* -------------------------
   Keys for localStorage
   ------------------------- */
const LS_NOTES = 'ediguide_notes_v1';
const LS_RATINGS = 'ediguide_ratings_v1';

/* -------------------------
   DOM refs
   ------------------------- */
const refs = {
  search: '#search',
  country: '#country',
  rankMin: '#rank-min',
  rankMax: '#rank-max',
  sort: '#sort',
  resetFilters: '#resetFilters',
  resultsInfo: '#results-info',
  tableBody: '#rankingTable tbody',
  activeFilters: '#activeFilters',
  exportCsv: '#exportCsv',
  toggleCompact: '#toggleCompact',
  noteForm: '#noteForm',
  notesList: '#notesList',
  noteName: '#noteName',
  noteUniv: '#noteUniv',
  noteText: '#noteText',
  noteRating: '#noteRating',
  clearNotes: '#clearNotes',
  curYear: '#curYear'
};

/* -------------------------
   Initialization on load
   ------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  setYear();
  bindUI();
  // load optional firebase config if file exists
  loadOptionalScript('js/firebase-config.js').then(() => {
    if(window.FIREBASE_CONFIG) {
      initFirebase(window.FIREBASE_CONFIG);
    }
  }).catch(()=>{ /* ignore */ });

  await loadData();
  initFilters();
  applyAll();
  renderNotes();
});

/* -------------------------
   Set footer year
   ------------------------- */
function setYear(){
  const el = document.querySelector(refs.curYear);
  if(el) el.textContent = new Date().getFullYear();
}

/* -------------------------
   Load rankings.json
   ------------------------- */
async function loadData(){
  try {
    const resp = await fetch('data/rankings.json', {cache: "no-store"});
    if(!resp.ok) throw new Error('Failed to fetch rankings.json');
    const arr = await resp.json();
    // Normalize: ensure fields exist and ranks are numbers
    state.data = arr.map((x,i) => ({
      rank: Number(x.rank) || (i+1),
      university: fmt(x.university || x.name || ''),
      country: fmt(x.country || ''),
      score: (x.score === undefined || x.score === null) ? null : Number(x.score),
      raw: x
    }));
  } catch (err) {
    console.error(err);
    $('#results-info').textContent = 'Failed to load ranking data.';
  }
}

/* -------------------------
   Initialize filter lists (countries)
   ------------------------- */
function initFilters(){
  const countries = Array.from(new Set(state.data.map(d => d.country).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  const sel = $(refs.country);
  if(!sel) return;
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

/* -------------------------
   Bind UI event listeners
   ------------------------- */
function bindUI(){
  // inputs
  [refs.search, refs.country, refs.rankMin, refs.rankMax, refs.sort].forEach(id => {
    const el = $(id);
    if(el) el.addEventListener('input', debounce(applyAll, 180));
  });

  // reset
  const resetBtn = $(refs.resetFilters);
  if(resetBtn) resetBtn.addEventListener('click', () => {
    resetFilters();
    applyAll();
  });

  // export CSV
  const exportBtn = $(refs.exportCsv);
  if(exportBtn) exportBtn.addEventListener('click', () => {
    exportToCSV(state.visible);
  });

  // compact toggle
  const compactBtn = $(refs.toggleCompact);
  if(compactBtn) compactBtn.addEventListener('click', () => {
    state.compact = !state.compact;
    compactBtn.textContent = state.compact ? 'Comfort view' : 'Compact view';
    renderTable(state.visible);
  });

  // notes form
  const noteForm = $(refs.noteForm);
  if(noteForm) noteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveNote();
  });

  const clearNotes = $(refs.clearNotes);
  if(clearNotes) clearNotes.addEventListener('click', () => {
    if(confirm('Clear ALL local notes and ratings? This affects only this browser.')) {
      localStorage.removeItem(LS_NOTES);
      localStorage.removeItem(LS_RATINGS);
      renderNotes();
      applyAll(); // re-render ratings
    }
  });
}

/* -------------------------
   Debounce helper
   ------------------------- */
function debounce(fn, wait=200){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(()=>fn(...args), wait);
  };
}

/* -------------------------
   Apply filters, sort, render
   ------------------------- */
function applyAll(){
  const q = ($(refs.search).value || '').trim().toLowerCase();
  const country = $(refs.country).value || '';
  const min = parseInt($(refs.rankMin).value) || null;
  const max = parseInt($(refs.rankMax).value) || null;
  const sortVal = $(refs.sort).value || 'rank-asc';

  // filter
  state.visible = state.data.filter(item => {
    if(q){
      const hay = `${item.university} ${item.country}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(country && item.country !== country) return false;
    if(min && item.rank < min) return false;
    if(max && item.rank > max) return false;
    return true;
  });

  // sort
  state.visible.sort((a,b) => {
    switch(sortVal){
      case 'rank-asc': return a.rank - b.rank;
      case 'rank-desc': return b.rank - a.rank;
      case 'score-asc': return (a.score||0) - (b.score||0);
      case 'score-desc': return (b.score||0) - (a.score||0);
      case 'name-asc': return a.university.localeCompare(b.university);
      case 'name-desc': return b.university.localeCompare(a.university);
      case 'country-asc': return a.country.localeCompare(b.country);
      default: return a.rank - b.rank;
    }
  });

  // render
  renderTable(state.visible);
  updateActiveFilters();
}

/* -------------------------
   Reset filters
   ------------------------- */
function resetFilters(){
  $(refs.search).value = '';
  $(refs.country).value = '';
  $(refs.rankMin).value = '';
  $(refs.rankMax).value = '';
  $(refs.sort).value = 'rank-asc';
}

/* -------------------------
   Render active filters summary
   ------------------------- */
function updateActiveFilters(){
  const list = $(refs.activeFilters);
  const parts = [];
  const s = $(refs.search).value.trim();
  if(s) parts.push(`Query: "${s}"`);
  const c = $(refs.country).value;
  if(c) parts.push(`Country: ${c}`);
  const min = $(refs.rankMin).value;
  const max = $(refs.rankMax).value;
  if(min || max) parts.push(`Rank: ${min || '1'}–${max || '∞'}`);
  list.innerHTML = parts.length ? parts.map(p => `<li>${escapeHtml(p)}</li>`).join('') : '<li>None</li>';
  const info = $(refs.resultsInfo);
  if(info) info.textContent = `${state.visible.length} result${state.visible.length !== 1 ? 's' : ''}`;
}

/* -------------------------
   Render table rows
   ------------------------- */
function renderTable(list){
  const tbody = $(refs.tableBody);
  tbody.innerHTML = '';
  if(!list.length){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="7" class="kv">No results found.</td>`;
    tbody.appendChild(tr);
    updateActiveFilters();
    return;
  }

  const ratings = loadRatings();

  list.forEach(item => {
    const tr = document.createElement('tr');

    // rank
    const rankCell = `<td><span class="rank-badge">${item.rank}</span></td>`;

    // university
    const uniCell = `<td>
      <span class="univ-title">${escapeHtml(item.university)}</span>
      <span class="univ-sub">${escapeHtml(item.university)}</span>
    </td>`;

    // country
    const countryCell = `<td>${escapeHtml(item.country)}</td>`;

    // score
    const scoreCell = `<td>${(item.score !== null) ? item.score : '—'}</td>`;

    // small ad placeholder
    const adCell = `<td><div class="ad-inner" style="padding:6px 8px; border-radius:6px;">Ad slot</div></td>`;

    // rating cell: compute average if exists
    const r = ratings[item.university];
    const avg = r ? (r.sum / r.count) : null;
    const ratingCell = `<td class="rating-cell" data-univ="${escapeHtml(item.university)}">${renderStars(avg)}</td>`;

    // notes count
    const notes = loadNotes();
    const nCount = notes.filter(n => n.univ === item.university).length;
    const notesCell = `<td>${nCount ? `${nCount} note${nCount>1?'s':''}` : '-'}</td>`;

    tr.innerHTML = rankCell + uniCell + countryCell + scoreCell + adCell + ratingCell + notesCell;

    tbody.appendChild(tr);
  });

  // Attach rating click handlers
  $$('.rating-cell .star').forEach(star => {
    star.addEventListener('click', (e) => {
      const cell = e.target.closest('.rating-cell');
      const univ = cell.dataset.univ;
      const val = Number(e.target.dataset.value);
      saveRating(univ, val);
      applyAll();
      alert(`Saved ${val}★ for "${univ}" (stored locally)`);
    });
  });

  updateActiveFilters();
}

/* -------------------------
   Render stars markup
   ------------------------- */
function renderStars(avg){
  // show 5 stars, highlight those <= avg
  let out = '<span class="stars" aria-hidden="true">';
  for(let i=1;i<=5;i++){
    const cls = (avg && avg >= (i - 0.25)) ? 'star active' : 'star';
    out += `<span class="${cls}" data-value="${i}">★</span>`;
  }
  out += '</span>';
  out += avg ? `<span class="kv"> ${avg.toFixed(1)}</span>` : `<span class="kv"> (no ratings)</span>`;
  return out;
}

/* -------------------------
   Local ratings (localStorage)
   ------------------------- */
function loadRatings(){
  try {
    return JSON.parse(localStorage.getItem(LS_RATINGS) || '{}');
  } catch(err) {
    return {};
  }
}
function saveRatings(obj){
  localStorage.setItem(LS_RATINGS, JSON.stringify(obj));
}
function saveRating(univ, value){
  const all = loadRatings();
  if(!all[univ]) all[univ] = { sum: 0, count: 0 };
  all[univ].sum += value;
  all[univ].count += 1;
  saveRatings(all);
}

/* -------------------------
   Local notes (localStorage) and optional Firebase
   ------------------------- */
function loadNotes(){
  try {
    return JSON.parse(localStorage.getItem(LS_NOTES) || '[]');
  } catch(err){
    return [];
  }
}
function saveNote(){
  const name = $(refs.noteName).value.trim() || 'anon';
  const univ = $(refs.noteUniv).value.trim() || '';
  const text = $(refs.noteText).value.trim() || '';
  const rating = $(refs.noteRating).value ? Number($(refs.noteRating).value) : null;
  if(!text && !rating && !univ){
    alert('Add a short note, choose a university, or add a rating.');
    return;
  }
  // If Firebase is configured and available, push to Firebase Realtime Database
  if(window.firebase && window.firebase.database && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId){
    const db = firebase.database();
    const ref = db.ref('notes');
    const payload = { name, univ, text, rating, ts: Date.now() };
    ref.push(payload).then(()=>{
      $('#noteForm').reset();
      renderNotes();
      alert('Saved note to Firebase.');
    }).catch(err=>{
      console.error(err);
      alert('Failed to save to Firebase. Saved locally instead.');
      saveNoteLocal({name,univ,text,rating,ts:Date.now()});
    });
    return;
  }
  saveNoteLocal({name,univ,text,rating,ts:Date.now()});
}
function saveNoteLocal(obj){
  const arr = loadNotes(); arr.unshift(obj); localStorage.setItem(LS_NOTES, JSON.stringify(arr)); $('#noteForm').reset(); renderNotes();
}
function renderNotes(){
  // If Firebase available, load from DB; otherwise localStorage
  if(window.firebase && window.firebase.database && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.projectId){
    const db = firebase.database();
    const ref = db.ref('notes').orderByChild('ts').limitToLast(200);
    ref.on('value', snapshot=>{
      const val = snapshot.val()||{};
      const arr = Object.keys(val).map(k=>val[k]).sort((a,b)=>b.ts - a.ts);
      renderNotesList(arr);
    });
  } else {
    const arr = loadNotes();
    renderNotesList(arr);
  }
}
function renderNotesList(arr){
  const out = $('#notesList');
  if(!arr.length){
    out.innerHTML = `<p class="kv">No notes yet. Notes are stored locally in this browser only.</p>`;
    return;
  }
  out.innerHTML = arr.map(n => `
    <div class="note">
      <div class="meta">${escapeHtml(n.name)} ${n.univ?`— ${escapeHtml(n.univ)}`:''} <span class="kv">(${new Date(n.ts).toLocaleString()})</span></div>
      <div class="body">${escapeHtml(n.text || '')} ${n.rating?`<div class="kv">Rating: ${'★'.repeat(n.rating)}</div>`: ''}</div>
    </div>
  `).join('');
}

/* -------------------------
   CSV export
   ------------------------- */
function exportToCSV(rows){
  if(!rows || !rows.length){ alert('No rows to export'); return; }
  const header = ['rank','university','country','score'];
  const lines = [ header.join(',') ];
  rows.forEach(r => {
    const line = [
      r.rank,
      '"' + (String(r.university).replace(/"/g,'""')) + '"',
      '"' + (String(r.country).replace(/"/g,'""')) + '"',
      r.score !== null ? r.score : ''
    ].join(',');
    lines.push(line);
  });
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ediguide_rankings.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------------------------
   Utility: escape HTML
   ------------------------- */
function escapeHtml(str){
  if(!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

/* -------------------------
   Optional dynamic script loader for firebase-config
   ------------------------- */
function loadOptionalScript(src) {
  return new Promise((resolve,reject) => {
    fetch(src, {cache:'no-store'}).then(resp=>{
      if(!resp.ok) return reject();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    }).catch(reject);
  });
}

/* -------------------------
   Firebase initialization helper (compat)
   ------------------------- */
function initFirebase(config){
  try{
    if(!window.firebase){ console.warn('Firebase scripts not loaded.'); return; }
    firebase.initializeApp(config);
    console.log('Firebase initialized');
  }catch(e){ console.error('initFirebase',e); }
}
