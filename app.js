const C = window.CONFIG, app = document.getElementById('app'), nav = document.getElementById('nav');
if (!C.SUPABASE_URL || !C.SUPABASE_ANON_KEY) { app.innerHTML = '<p class="empty">Preencha SUPABASE_URL e SUPABASE_ANON_KEY em config.js (veja o README).</p>'; throw new Error('config'); }
const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
let me = null, ideas = [];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = d => d ? new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const $ = s => app.querySelector(s);
function toast(t, err) { const e = document.getElementById('toast'); e.textContent = t; e.className = 'show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(() => e.className = '', 3200); }
const fail = (e, m = 'Algo deu errado') => { console.error(e); toast(navigator.onLine ? `${m}: ${e.message || e}` : 'Sem conexão. Tente novamente.', true); };

async function signed(paths) {
  paths = (paths || []).filter(Boolean); if (!paths.length) return {};
  const { data } = await sb.storage.from('fotos').createSignedUrls(paths, 3600);
  return Object.fromEntries((data || []).map(d => [d.path, d.signedUrl]));
}
async function loadIdeas() {
  const { data, error } = await sb.from('ideas').select('*').order('created_at', { ascending: false });
  if (error) throw error; ideas = data;
}
async function upload(files) {
  const out = [];
  for (const f of files) {
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${me.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('fotos').upload(path, f, { contentType: f.type || 'image/jpeg' });
    if (error) throw error; out.push(path);
  }
  return out;
}
const cover = i => (i.done && i.memory_photos[0]) || i.photos[0] || (i.memory_photos || [])[0];
function card(i, u) {
  const img = cover(i);
  return `<a class="card" href="#/ideia/${i.id}">${img && u[img] ? `<img class="ph" loading="lazy" src="${u[img]}" alt="">` : '<div class="ph"></div>'}
  <h3>${esc(i.title)}</h3><small>${esc(i.author_name)} · ${fmt(i.done ? i.done_at : i.created_at)}</small>
  <span class="tag ${i.done ? 'done' : ''}">${i.done ? 'vivido' : 'guardado'}</span>${i.category ? `<span class="tag">${esc(i.category)}</span>` : ''}</a>`;
}
async function cards(list, empty) {
  if (!list.length) return `<div class="empty">${empty}</div>`;
  const u = await signed(list.map(cover));
  return `<div class="grid">${list.map(i => card(i, u)).join('')}</div>`;
}

/* ---------- views ---------- */
async function vLogin() {
  nav.hidden = true;
  app.innerHTML = `<div class="box"><h1>entrar</h1><p class="muted">um espaço só de nós dois.</p>
  <form id="f"><label>E-mail<input name="e" type="email" required autocomplete="username"></label>
  <label>Senha<input name="p" type="password" required autocomplete="current-password"></label><button>Entrar</button></form></div>`;
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const b = ev.target.querySelector('button'); b.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: ev.target.e.value.trim(), password: ev.target.p.value });
    b.disabled = false; if (error) return toast('E-mail ou senha incorretos.', true);
    boot();
  };
}
async function vHome() {
  const rec = ideas.filter(i => !i.done).slice(0, 4);
  app.innerHTML = `<h1>quando der.</h1><p class="sub">coisas que ainda queremos fazer juntos</p>
  <div class="row"><a class="btn" href="#/nova">Adicionar ideia</a><a class="btn alt" href="#/guardados">Ver todas</a><a class="btn alt" href="#/vivemos">Já vivemos</a></div>
  <h2>Guardadas há pouco</h2>${await cards(rec, 'Nada guardado ainda. Comecem pela primeira ideia.')}`;
}
async function vList() {
  const cats = [...new Set(ideas.map(i => i.category).filter(Boolean))].sort(), auth = [...new Set(ideas.map(i => i.author_name))];
  app.innerHTML = `<h1>Guardados</h1><div class="filters">
  <input id="q" type="search" placeholder="Pesquisar…">
  <select id="a"><option value="">Todos os autores</option>${auth.map(a => `<option>${esc(a)}</option>`).join('')}</select>
  <select id="c"><option value="">Todas as categorias</option>${cats.map(a => `<option>${esc(a)}</option>`).join('')}</select>
  <select id="s"><option value="">Qualquer situação</option><option value="p">Pendentes</option><option value="d">Realizadas</option></select>
  <select id="o"><option value="created_at">Mais recentes</option><option value="updated_at">Atualizadas</option></select></div><div id="l"></div>`;
  const draw = async () => {
    const q = $('#q').value.toLowerCase(), o = $('#o').value;
    const r = ideas.filter(i => (!q || (i.title + ' ' + (i.description || '')).toLowerCase().includes(q)) && (!$('#a').value || i.author_name === $('#a').value)
      && (!$('#c').value || i.category === $('#c').value) && (!$('#s').value || (i.done === ($('#s').value === 'd')))).sort((x, y) => y[o].localeCompare(x[o]));
    $('#l').innerHTML = await cards(r, 'Nenhuma ideia encontrada.');
  };
  ['q', 'a', 'c', 's', 'o'].forEach(id => $('#' + id).oninput = draw); draw();
}
async function vPick(prev) {
  const pend = ideas.filter(i => !i.done);
  if (!pend.length) { app.innerHTML = '<h1>Escolhe por nós</h1><div class="empty">Não há ideias pendentes para sortear.</div>'; return; }
  const pool = pend.length > 1 ? pend.filter(i => i.id !== prev) : pend, p = pool[Math.floor(Math.random() * pool.length)];
  app.innerHTML = `<h1>Escolhe por nós</h1><p class="sub">hoje, quem sabe…</p><div class="grid" style="grid-template-columns:minmax(220px,340px)">${card(p, await signed([cover(p)]))}</div>
  <div class="row"><a class="btn" href="#/ideia/${p.id}">Abrir</a><button class="alt" id="again">Outra</button></div>`;
  $('#again').onclick = () => vPick(p.id);
}
async function vDone() {
  const l = ideas.filter(i => i.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  app.innerHTML = `<h1>Já vivemos</h1><p class="sub">o que deixou de ser plano</p>${await cards(l, 'Ainda nada por aqui. Quando marcarem uma ideia como realizada, ela aparece aqui.')}`;
}
async function vIdea(id) {
  const i = ideas.find(x => x.id === id); if (!i) { app.innerHTML = '<div class="empty">Ideia não encontrada.</div>'; return; }
  const u = await signed([...i.photos, ...i.memory_photos]), ph = a => a.length ? `<div class="photos">${a.map(p => u[p] ? `<img class="ph" src="${u[p]}" alt="">` : '').join('')}</div>` : '';
  app.innerHTML = `<h1>${esc(i.title)}</h1><p class="muted">${esc(i.author_name)} · guardado em ${fmt(i.created_at)} ${i.category ? '· ' + esc(i.category) : ''}</p>
  ${i.description ? `<p>${esc(i.description).replace(/\n/g, '<br>')}</p>` : ''}
  ${i.link ? `<p><a href="${esc(i.link)}" target="_blank" rel="noopener noreferrer">${esc(i.link)}</a></p>` : ''}
  ${i.why ? `<div class="note"><b>por que guardei isso?</b>${esc(i.why)}</div>` : ''}${ph(i.photos)}
  ${i.done ? `<h2>Como foi</h2><p class="muted">vivido em ${fmt(i.done_at)}</p>${i.memory ? `<div class="note">${esc(i.memory).replace(/\n/g, '<br>')}</div>` : ''}${ph(i.memory_photos)}` : ''}
  <div class="row" id="acts"><button id="dn">${i.done ? 'Editar lembrança' : 'Marcar como realizada'}</button>${i.done ? '<button class="alt" id="un">Devolver aos pendentes</button>' : ''}
  <a class="btn alt" href="#/editar/${i.id}">Editar</a><button class="danger" id="rm">Excluir</button></div><div id="dform"></div>`;
  $('#rm').onclick = async () => {
    if (!confirm('Excluir esta ideia? Não dá para desfazer.')) return;
    try { const { error } = await sb.from('ideas').delete().eq('id', i.id); if (error) throw error;
      const ps = [...i.photos, ...i.memory_photos]; if (ps.length) await sb.storage.from('fotos').remove(ps);
      ideas = ideas.filter(x => x.id !== i.id); toast('Ideia excluída.'); location.hash = '#/guardados'; } catch (e) { fail(e); }
  };
  if ($('#un')) $('#un').onclick = async () => { try { await save(i.id, { done: false }); toast('Voltou para os pendentes.'); vIdea(id); } catch (e) { fail(e); } };
  $('#dn').onclick = () => {
    $('#dform').innerHTML = `<form id="df"><label>Data em que fizemos<input type="date" name="d" required value="${i.done_at || new Date().toISOString().slice(0, 10)}"></label>
    <label>Lembrança<textarea name="m" rows="4" maxlength="5000">${esc(i.memory)}</textarea></label>
    <label>Fotos da experiência<input type="file" name="f" accept="image/*" multiple></label><button>Salvar</button></form>`;
    $('#df').onsubmit = async ev => {
      ev.preventDefault(); const b = ev.target.querySelector('button'); b.disabled = true; b.textContent = 'Salvando…';
      try { const n = await upload([...ev.target.f.files]);
        await save(i.id, { done: true, done_at: ev.target.d.value, memory: ev.target.m.value.trim() || null, memory_photos: [...i.memory_photos, ...n] });
        toast('Registrado em "Já vivemos".'); vIdea(id); } catch (e) { fail(e, 'Não foi possível salvar'); b.disabled = false; b.textContent = 'Salvar'; }
    };
  };
}
async function save(id, patch) {
  const { data, error } = await sb.from('ideas').update(patch).eq('id', id).select().single();
  if (error) throw error; ideas = ideas.map(x => x.id === id ? data : x); return data;
}
async function vForm(id) {
  const i = id ? ideas.find(x => x.id === id) : null, cats = [...new Set(ideas.map(x => x.category).filter(Boolean))];
  app.innerHTML = `<h1>${i ? 'Editar ideia' : 'Adicionar ideia'}</h1><form id="f">
  <label>Título<input name="title" required maxlength="200" value="${esc(i?.title)}"></label>
  <label>Descrição (opcional)<textarea name="description" rows="4" maxlength="5000">${esc(i?.description)}</textarea></label>
  <label>Link (opcional)<input name="link" type="url" inputmode="url" placeholder="https://" value="${esc(i?.link)}"></label>
  <label>Categoria (opcional)<input name="category" list="cl" maxlength="60" value="${esc(i?.category)}"><datalist id="cl">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
  <label>por que guardei isso? (opcional)<textarea name="why" rows="2" maxlength="1000">${esc(i?.why)}</textarea></label>
  <label>Fotos (opcional)<input name="files" type="file" accept="image/*" multiple></label>
  ${i?.photos.length ? '<p class="muted">Fotos atuais mantidas; novas serão somadas.</p>' : ''}<button>Guardar</button></form>`;
  $('#f').onsubmit = async ev => {
    ev.preventDefault(); const f = ev.target, b = f.querySelector('button'); b.disabled = true; b.textContent = 'Guardando…';
    try {
      const n = await upload([...f.files.files]), v = k => f[k].value.trim() || null;
      const row = { title: f.title.value.trim(), description: v('description'), link: v('link'), category: v('category'), why: v('why') };
      if (!row.title) throw new Error('O título é obrigatório.');
      if (i) { await save(i.id, { ...row, photos: [...i.photos, ...n] }); toast('Ideia atualizada.'); location.hash = '#/ideia/' + i.id; }
      else { const { data, error } = await sb.from('ideas').insert({ ...row, photos: n, author_name: me.name }).select().single();
        if (error) throw error; ideas.unshift(data); toast('Ideia guardada.'); location.hash = '#/ideia/' + data.id; }
    } catch (e) { fail(e, 'Não foi possível guardar'); b.disabled = false; b.textContent = 'Guardar'; }
  };
}
function vAccount() {
  app.innerHTML = `<h1>Conta</h1><p class="muted">${esc(me.name)} · ${esc(me.email)}</p>
  <form id="f"><label>Nova senha (mín. 8 caracteres)<input type="password" name="p" minlength="8" autocomplete="new-password" required></label><button>Trocar senha</button></form>
  <div class="row"><button class="alt" id="out">Sair</button></div>`;
  $('#f').onsubmit = async ev => { ev.preventDefault(); const { error } = await sb.auth.updateUser({ password: ev.target.p.value }); error ? fail(error) : (toast('Senha alterada.'), ev.target.reset()); };
  $('#out').onclick = async () => { await sb.auth.signOut(); me = null; ideas = []; vLogin(); };
}

/* ---------- roteador ---------- */
async function route() {
  if (!me) return;
  const [, r, id] = location.hash.split('/');
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + (r || '')));
  try {
    if (!ideas.length || r === '' || r === undefined || r === 'guardados' || r === 'vivemos' || r === 'escolhe') await loadIdeas();
    ({ guardados: vList, escolhe: vPick, vivemos: vDone, nova: () => vForm(), editar: () => vForm(id), ideia: () => vIdea(id), conta: vAccount }[r] || vHome)();
    scrollTo(0, 0);
  } catch (e) { app.innerHTML = '<div class="empty">Não foi possível carregar. Verifique a conexão e <a href="">tente de novo</a>.</div>'; fail(e); }
}
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return vLogin();
  const { data, error } = await sb.from('allowed_users').select('name').ilike('email', session.user.email).maybeSingle();
  if (error || !data) { await sb.auth.signOut(); vLogin(); return toast('Esta conta não está autorizada.', true); }
  me = { id: session.user.id, email: session.user.email, name: data.name }; nav.hidden = false; route();
}
addEventListener('hashchange', route);
boot();
