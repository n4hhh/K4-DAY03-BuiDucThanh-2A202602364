const $ = selector => document.querySelector(selector);
const chat = $('#chat'), form = $('#composer'), input = $('#message'), send = $('#send');
const tracksBox = $('#tracks'), count = $('#track-count'), playlistTitle = $('#playlist-title');
const saveButton = $('#save-playlist'), exportBox = $('#export'), toastBox = $('#toast');
let sessionId = crypto.randomUUID(), busy = false, currentTracks = [], playlists = [];

const audio = new Audio();
let activeTrack = null;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeUrl = value => /^https:\/\//.test(value || '') ? value : '';
const formatTime = seconds => `${Math.floor((seconds || 0) / 60)}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;
const markdown = value => escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
const scrollChat = () => { chat.scrollTop = chat.scrollHeight; };
const toast = text => { toastBox.textContent = text; toastBox.classList.add('show'); setTimeout(() => toastBox.classList.remove('show'), 2200); };

function createMessage(text, kind) {
  $('#empty')?.remove();
  const node = document.createElement('article');
  node.className = `message ${kind}`;
  const body = document.createElement('div');
  body.className = 'message-body';
  body.innerHTML = markdown(text);
  node.append(body);
  chat.append(node);
  scrollChat();
  return {node, body};
}

function addTrace(list, data) {
  const item = document.createElement('li');
  item.className = data.stage || 'result';
  item.innerHTML = `<b>${escapeHtml(data.stage || 'status')}</b><span>${escapeHtml(data.content || data.tool || 'Working')}</span>`;
  list.append(item);
}

function settings() {
  return {
    temperature: Number($('#temperature').value),
    max_tracks: Number($('#max-tracks').value),
    response_style: $('#response-style').value,
    language: $('#language').value,
    retry_empty: $('#retry-empty').checked
  };
}

function saveSettings() {
  localStorage.setItem('moodmix-settings', JSON.stringify({...settings(), volume: Number($('#volume').value)}));
}

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('moodmix-settings') || '{}'); } catch (_) {}
  const values = {temperature: .3, max_tracks: 10, response_style: 'balanced', language: 'auto', retry_empty: true, volume: .7, ...saved};
  $('#temperature').value = values.temperature;
  $('#max-tracks').value = values.max_tracks;
  $('#response-style').value = values.response_style;
  $('#language').value = values.language;
  $('#retry-empty').checked = values.retry_empty;
  $('#volume').value = values.volume;
  audio.volume = values.volume;
  updateSettingLabels();
}

function updateSettingLabels() {
  $('#temperature-value').textContent = Number($('#temperature').value).toFixed(1);
  $('#max-tracks-value').textContent = $('#max-tracks').value;
  $('#volume-value').textContent = `${Math.round(Number($('#volume').value) * 100)}%`;
}

function updatePlayButtons() {
  document.querySelectorAll('.preview').forEach(button => {
    button.textContent = activeTrack && button.dataset.id === activeTrack.track_id && !audio.paused ? '❚❚' : '▶';
  });
  $('#player-toggle').textContent = audio.paused ? '▶' : '❚❚';
}

function playTrack(track) {
  if (!track.preview_url) return toast('No preview is available for this track.');
  if (activeTrack?.track_id === track.track_id) {
    audio.paused ? audio.play().catch(() => toast('Preview playback failed.')) : audio.pause();
    return;
  }
  activeTrack = track;
  audio.src = `/api/session/${encodeURIComponent(sessionId)}/preview/${encodeURIComponent(track.track_id)}`;
  audio.volume = Number($('#volume').value);
  $('#player').hidden = false;
  $('#player-art').src = safeUrl(track.artwork_url);
  $('#player-title').textContent = track.title;
  $('#player-artist').textContent = track.artist;
  audio.play().catch(() => toast('Preview playback failed. Try another track.'));
  updatePlayButtons();
}

function renderTracks(tracks, name) {
  currentTracks = [...new Map((tracks || []).map(track => [track.track_id, track])).values()];
  if (name) playlistTitle.textContent = name;
  count.textContent = `${currentTracks.length} track${currentTracks.length === 1 ? '' : 's'}`;
  saveButton.disabled = !currentTracks.length;
  tracksBox.innerHTML = '';
  if (!currentTracks.length) {
    tracksBox.innerHTML = '<div class="playlist-empty">Your search results will appear here.</div>';
    return;
  }
  currentTracks.forEach((track, index) => {
    const row = document.createElement('article');
    row.className = 'track';
    row.innerHTML = `<span class="track-number">${index + 1}</span><img alt="" src="${safeUrl(track.artwork_url)}"><div class="track-meta"><strong>${escapeHtml(track.title)}</strong><span>${escapeHtml(track.artist)}</span></div><span class="album">${escapeHtml(track.album)}</span><span class="duration">${formatTime(track.duration_seconds)}</span><button class="preview" data-id="${escapeHtml(track.track_id)}" ${track.preview_url ? '' : 'disabled'} aria-label="Play preview">${activeTrack?.track_id === track.track_id && !audio.paused ? '❚❚' : track.preview_url ? '▶' : '—'}</button>`;
    row.querySelector('.preview').addEventListener('click', () => playTrack(track));
    tracksBox.append(row);
  });
}

function renderHistory(items) {
  playlists = items || [];
  $('#history-count').textContent = playlists.length;
  const list = $('#history-list');
  list.innerHTML = playlists.length ? '' : '<p>No saved playlists yet.</p>';
  playlists.forEach(item => {
    const card = document.createElement('article');
    card.className = 'history-card';
    const covers = item.tracks.slice(0, 3).map(track => `<img src="${safeUrl(track.artwork_url)}" alt="">`).join('');
    card.innerHTML = `<div class="history-covers">${covers}</div><div><strong>${escapeHtml(item.name)}</strong><span>${item.tracks.length} tracks</span></div><button>Restore</button>`;
    card.querySelector('button').addEventListener('click', () => restorePlaylist(item.id));
    list.append(card);
  });
}

async function restorePlaylist(id) {
  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}/restore/${encodeURIComponent(id)}`, {method: 'POST'});
  const data = await response.json();
  if (!response.ok) return toast(data.error || 'Could not restore that playlist.');
  audio.pause(); activeTrack = null;
  renderTracks(data.tracks, data.playlist_name);
  renderHistory(data.playlists);
  $('#history-panel').hidden = true;
  toast('Playlist restored.');
}

async function savePlaylist() {
  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}/save`, {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({name: playlistTitle.textContent})});
  const data = await response.json();
  if (!response.ok) return toast(data.error || 'Could not save this playlist.');
  renderHistory(data.playlists);
  toast('Playlist saved to history.');
}

async function sendMessage(text) {
  if (busy || !text.trim()) return;
  busy = true; input.disabled = send.disabled = true;
  createMessage(text, 'user');
  const reply = createMessage('', 'assistant');
  reply.body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  const details = document.createElement('details'), traceSummary = document.createElement('summary'), traceList = document.createElement('ul');
  details.className = 'trace'; traceSummary.textContent = 'Live Agent Trace'; details.append(traceSummary, traceList); reply.node.append(details);
  let content = '';
  try {
    const response = await fetch('/api/chat/stream', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message:text, session_id:sessionId, settings:settings()})});
    if (!response.ok || !response.body) throw new Error('Request failed');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream:true});
      const parts = buffer.split('\n\n'); buffer = parts.pop();
      for (const part of parts) {
        const line = part.split('\n').find(value => value.startsWith('data:'));
        if (!line) continue;
        const data = JSON.parse(line.slice(5));
        if (data.type === 'token') { content += data.content; reply.body.innerHTML = markdown(content); }
        if (data.type === 'trace') addTrace(traceList, data);
        if (data.type === 'status') addTrace(traceList, {stage:'status', content:data.content});
        if (data.type === 'tracks') renderTracks(data.tracks, data.playlist_name);
        if (data.type === 'history') renderHistory(data.playlists);
        if (data.type === 'export') { playlistTitle.textContent = data.playlist_name; exportBox.innerHTML = `<a class="export" href="${data.download_url}">Download CSV</a>`; }
        if (data.type === 'error') { content = data.content; reply.body.innerHTML = markdown(content); addTrace(traceList, {stage:'error', content:data.content}); }
        scrollChat();
      }
    }
    if (!content) reply.body.textContent = 'No response was returned. Please try again.';
  } catch (_) {
    reply.body.textContent = 'Sorry, I could not process that request.';
  } finally {
    busy = false; input.disabled = send.disabled = false; input.value = ''; input.focus(); scrollChat();
  }
}

function reset() {
  fetch(`/api/session/${encodeURIComponent(sessionId)}`, {method:'DELETE'}).catch(() => {});
  sessionId = crypto.randomUUID(); busy = false; currentTracks = []; playlists = []; audio.pause(); activeTrack = null;
  chat.innerHTML = '<div id="empty" class="empty"><h1>Find your next soundtrack.</h1><p>Ask for recommendations, build a playlist, or learn about a song.</p><div class="suggestions"><button>Top 10 songs for a happy day</button><button>Find 5 Linkin Park songs</button><button>What is Numb by Linkin Park about?</button><button>Create a chill late-night playlist</button></div></div>';
  playlistTitle.textContent = 'Your queue'; count.textContent = 'No tracks yet'; exportBox.innerHTML = ''; $('#player').hidden = true;
  renderTracks([]); renderHistory([]); bindSuggestions();
}

function bindSuggestions() { document.querySelectorAll('.suggestions button').forEach(button => button.addEventListener('click', () => sendMessage(button.textContent))); }
form.addEventListener('submit', event => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 150)}px`; });
$('#new-chat').addEventListener('click', reset); $('#clear-chat').addEventListener('click', reset); saveButton.addEventListener('click', savePlaylist);

$('#settings-button').addEventListener('click', () => { $('#settings-panel').hidden = !$('#settings-panel').hidden; });
$('.close-popover').addEventListener('click', () => { $('#settings-panel').hidden = true; });
$('#history-button').addEventListener('click', () => { $('#history-panel').hidden = !$('#history-panel').hidden; });
$('.close-history').addEventListener('click', () => { $('#history-panel').hidden = true; });
$('.history-wrap').addEventListener('mouseenter', () => { if (playlists.length) $('#history-panel').hidden = false; });
$('.history-wrap').addEventListener('mouseleave', () => { setTimeout(() => { if (!$('.history-wrap:hover')) $('#history-panel').hidden = true; }, 120); });

['temperature','max-tracks','response-style','language','retry-empty','volume'].forEach(id => $(`#${id}`).addEventListener('input', () => {
  audio.volume = Number($('#volume').value); updateSettingLabels(); saveSettings();
}));
audio.addEventListener('play', updatePlayButtons); audio.addEventListener('pause', updatePlayButtons); audio.addEventListener('ended', updatePlayButtons);
audio.addEventListener('loadedmetadata', () => { $('#total-time').textContent = formatTime(audio.duration); });
audio.addEventListener('timeupdate', () => { $('#current-time').textContent = formatTime(audio.currentTime); $('#progress').value = audio.duration ? audio.currentTime / audio.duration * 100 : 0; });
audio.addEventListener('error', () => toast('This preview is currently unavailable.'));
$('#player-toggle').addEventListener('click', () => { audio.paused ? audio.play().catch(() => toast('Preview playback failed.')) : audio.pause(); });
$('#progress').addEventListener('input', event => { if (audio.duration) audio.currentTime = Number(event.target.value) / 100 * audio.duration; });

loadSettings(); bindSuggestions();
