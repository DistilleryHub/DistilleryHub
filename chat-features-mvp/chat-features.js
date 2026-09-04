// chat-features.js (updated)
// Phase-1 Chat features (voice recorder, robust send, quick responses, subject input)
// Added: optimistic UI, client-side image compression, improved error handling

(function(){
  function onReady(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn); else fn(); }

  onReady(()=>{
    // Globals
    window.pendingChatImage = window.pendingChatImage || null;
    window.pendingVoiceBlob = window.pendingVoiceBlob || null;

    const chatInput = document.getElementById('chatInput');
    const chatRow = chatInput?.closest('.chat-input-row');
    const messagesContainer = document.querySelector('.chat-messages');
    if(!chatRow) return;

    // --- Subject input ---
    if(!document.getElementById('chatSubject')){
      const subject = document.createElement('input');
      subject.type = 'text'; subject.id = 'chatSubject'; subject.placeholder = 'Subject (optional)';
      subject.style.width = '100%'; subject.style.marginBottom = '6px'; subject.style.padding = '8px 12px';
      subject.style.borderRadius = '10px'; subject.style.border = '1px solid rgba(0,0,0,0.08)';
      chatRow.insertAdjacentElement('beforebegin', subject);
    }

    // --- Quick responses --- (same as before)
    function ensureQuickResponses(){
      if(document.getElementById('quickRespBtn')) return;
      const btn = document.createElement('button'); btn.id = 'quickRespBtn'; btn.className = 'chat-attach';
      btn.title = 'Quick responses'; btn.textContent = '💬'; btn.style.fontSize = '18px'; btn.style.marginRight = '4px';
      chatRow.insertBefore(btn, chatRow.firstChild);

      const menu = document.createElement('div'); menu.id = 'quickRespMenu'; menu.className = 'mention-dropdown hidden';
      menu.style.position = 'absolute'; menu.style.zIndex = 9999; document.body.appendChild(menu);

      btn.addEventListener('click', async (e)=>{
        e.stopPropagation(); if(menu.classList.contains('hidden')){ menu.classList.remove('hidden'); await renderQuickResponses(menu); } else { menu.classList.add('hidden'); }
      });
      document.addEventListener('click', ()=> menu.classList.add('hidden'));
    }

    async function renderQuickResponses(menuEl){
      try{
        if(!window.currentUser || !window.db) { menuEl.innerHTML = '<div style="padding:8px">Not signed in</div>'; return; }
        const list = [];
        const qColl = collection(db, 'users', currentUser.uid, 'quick_responses');
        let snap;
        try{ snap = await getDocs(qColl); }catch(e){ snap = null; }
        if(snap && snap.docs && snap.docs.length){ snap.forEach(d=> list.push({id:d.id, ...d.data()})); }
        if(list.length===0){ list.push({id:'d1', text:'On it — will update you shortly'}); list.push({id:'d2', text:'Thanks — received'}); list.push({id:'d3', text:'Please send more details'}); }
        menuEl.innerHTML = '';
        list.forEach(item=>{
          const opt = document.createElement('div'); opt.className = 'mention-option'; opt.style.padding = '8px 12px'; opt.style.cursor = 'pointer'; opt.textContent = item.text;
          opt.addEventListener('click', ()=>{ chatInput.value = (chatInput.value?chatInput.value + '\n' : '') + item.text; chatInput.focus(); menuEl.classList.add('hidden'); });
          menuEl.appendChild(opt);
        });
        const manage = document.createElement('div'); manage.style.padding='8px'; manage.style.borderTop='1px solid rgba(255,255,255,0.03)';
        manage.innerHTML = '<button id="addQuickResp" class="btn btn-ghost btn-sm">+ Add</button>';
        menuEl.appendChild(manage);
        menuEl.querySelector('#addQuickResp').addEventListener('click', async ()=>{
          const txt = prompt('Quick response text'); if(!txt) return;
          try{ await addDoc(collection(db,'users',currentUser.uid,'quick_responses'), { text: txt, createdAt: serverTimestamp() }); await renderQuickResponses(menuEl); }catch(err){ console.error(err); alert('Could not save quick response'); }
        });
      }catch(err){ console.error(err); menuEl.innerHTML = '<div style="padding:8px">Error loading</div>'; }
    }
    ensureQuickResponses();

    // --- Image compression helper ---
    async function compressImage(file, maxWidth=1280, quality=0.8){
      return new Promise((res, rej)=>{
        if(!file.type.startsWith('image/')) return res(file);
        const img = new Image();
        const reader = new FileReader();
        reader.onload = ()=>{ img.src = reader.result; };
        img.onerror = ()=> rej(new Error('Image load error'));
        img.onload = ()=>{
          const canvas = document.createElement('canvas');
          const ratio = img.width / img.height;
          const w = Math.min(maxWidth, img.width);
          const h = Math.round(w / ratio);
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0,w,h);
          canvas.toBlob((blob)=>{ if(!blob) return rej(new Error('Compression failed')); const newFile = new File([blob], file.name, { type: 'image/jpeg' }); res(newFile); }, 'image/jpeg', quality);
        };
        reader.readAsDataURL(file);
      });
    }

    // Wire existing chatImgInput change to compress
    const chatImgInput = document.getElementById('chatImgInput');
    if(chatImgInput){
      chatImgInput.addEventListener('change', async (e)=>{
        const file = e.target.files[0]; if(!file) return;
        const err = validateImageFile ? validateImageFile(file) : null;
        if(err){ toast ? toast(err) : alert(err); return; }
        try{
          const compressed = await compressImage(file, 1280, 0.75);
          window.pendingChatImage = compressed; // compressed File
          // show preview
          const reader = new FileReader(); reader.onload = ()=>{ document.getElementById('postImgPreview') && (document.getElementById('postImgPreview').innerHTML = `<div class="imgpreview"><img src="${reader.result}"><button onclick="clearPostImage()">×</button></div>`); };
          reader.readAsDataURL(compressed);
        }catch(err){ console.error(err); window.pendingChatImage = file; }
      });
    }

    // --- Optimistic UI helpers ---
    function renderOutgoingMessage(obj){
      try{
        if(!messagesContainer) return null;
        const row = document.createElement('div'); row.className = 'msg-row mine'; row.dataset.pending = '1';
        const col = document.createElement('div'); col.className = 'msg-col';
        const bubble = document.createElement('div'); bubble.className = 'msg-bubble'; bubble.innerText = obj.text || '';
        const meta = document.createElement('div'); meta.className = 'msg-time'; meta.innerText = 'Sending…';
        const spinner = document.createElement('span'); spinner.className='spinner'; spinner.style.marginLeft='8px'; meta.appendChild(spinner);
        col.appendChild(bubble); col.appendChild(meta); row.appendChild(col);
        messagesContainer.appendChild(row);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        // return a temporary id (DOM element) to identify
        return row;
      }catch(e){ console.error(e); return null; }
    }
    function markMessageSent(domRow, realId){
      try{ if(!domRow) return; domRow.removeAttribute('data-pending'); const meta = domRow.querySelector('.msg-time'); if(meta){ meta.textContent = new Date().toLocaleTimeString(); } domRow.dataset.msgId = realId; }
      catch(e){ console.error(e); }
    }
    function markMessageFailed(domRow){ if(!domRow) return; domRow.querySelector('.msg-bubble')?.classList.add('msg-failed'); const meta = domRow.querySelector('.msg-time'); if(meta) meta.textContent = 'Failed'; }
    window.renderOutgoingMessage = renderOutgoingMessage; window.markMessageSent = markMessageSent; window.markMessageFailed = markMessageFailed;

    // --- Voice recorder (same, with auto-send) ---
    const btnVoice = document.getElementById('btnVoiceMsg'); const voiceIndicator = document.getElementById('voiceRecordIndicator');
    let mediaRecorder, recordedChunks = [], recordingTimer=null, recordStartAt=0;
    function updateTimer(){ if(!voiceIndicator) return; const el = document.getElementById('voiceRecordTimer'); if(!el) return; const s = Math.floor((Date.now()-recordStartAt)/1000); const mm = String(Math.floor(s/60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0'); el.textContent = mm+':'+ss; }
    if(btnVoice){ btnVoice.addEventListener('click', async ()=>{
      if(!mediaRecorder || mediaRecorder.state==='inactive'){
        try{ const stream = await navigator.mediaDevices.getUserMedia({ audio:true }); mediaRecorder = new MediaRecorder(stream); recordedChunks = [];
          mediaRecorder.ondataavailable = e=>{ if(e.data && e.data.size) recordedChunks.push(e.data); };
          mediaRecorder.onstop = async ()=>{
            const blob = new Blob(recordedChunks, { type:'audio/webm' }); window.pendingVoiceBlob = blob;
            // optimistic render
            const optimistic = renderOutgoingMessage({ text: '[Voice message]', subject: document.getElementById('chatSubject')?.value || '' });
            try{ await window.robustSendMessage(window.activeConvoId || window.convoId || window.currentConversationId); // will mark sent
              // Firestore write in robustSendMessage will call markMessageSent
            }catch(err){ console.error(err); markMessageFailed(optimistic); }
            clearInterval(recordingTimer); voiceIndicator?.classList.add('hidden');
          };
          mediaRecorder.start(); recordStartAt = Date.now(); voiceIndicator?.classList.remove('hidden'); recordingTimer = setInterval(updateTimer, 500);
        }catch(err){ console.error('Microphone error',err); alert('Microphone access required'); }
      } else if(mediaRecorder.state==='recording'){ mediaRecorder.stop(); }
    }); }

    // --- robustSendMessage updated to use optimistic UI & compressed images ---
    window.robustSendMessage = async function(convoId){
      const input = document.getElementById('chatInput'); const subjectEl = document.getElementById('chatSubject');
      const text = (input?.value || '').trim(); const subject = (subjectEl?.value || '').trim();
      if(!text && !window.pendingChatImage && !window.pendingVoiceBlob && !(document.getElementById('chatVideoInput')?.files?.length)) return;
      const btn = document.getElementById('btnSendMsg'); btn.disabled = true; const prevHtml = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span>';

      const optimistic = renderOutgoingMessage({ senderUid: currentUser?.uid, text: text || (window.pendingVoiceBlob? '[Voice message]' : ''), subject });
      try{
        let imageURL='', audioURL='', videoURL='';
        if(window.pendingChatImage){ if(typeof uploadToCloudinary === 'function'){ imageURL = await uploadToCloudinary(window.pendingChatImage); } else throw new Error('uploadToCloudinary not available'); }
        if(window.pendingVoiceBlob){ if(typeof uploadRawToCloudinary === 'function'){ audioURL = await uploadRawToCloudinary(window.pendingVoiceBlob, 'voice-message.webm'); } else throw new Error('uploadRawToCloudinary not available'); }
        const vidInput = document.getElementById('chatVideoInput'); if(vidInput && vidInput.files && vidInput.files[0]){ const f = vidInput.files[0]; if(typeof uploadRawToCloudinary === 'function'){ videoURL = await uploadRawToCloudinary(f, f.name||'video.mp4'); } }
        const msg = { senderUid: currentUser?.uid || null, text: text || '', subject: subject || '', messageType: audioURL ? 'audio' : (videoURL ? 'video' : (imageURL ? 'image' : 'text')), imageURL, audioURL, videoURL, createdAt: serverTimestamp() };
        if(window.db && typeof addDoc === 'function'){
          const docRef = await addDoc(collection(db, 'conversations', convoId, 'messages'), msg);
          // clear
          if(input) input.value=''; if(subjectEl) subjectEl.value=''; window.pendingChatImage=null; window.pendingVoiceBlob=null; if(vidInput) vidInput.value=''; if(chatImgInput) chatImgInput.value='';
          markMessageSent(optimistic, docRef.id);
        } else throw new Error('Firestore helpers not available');
      }catch(err){ console.error(err); markMessageFailed(optimistic); alert(err?.message || 'Message send failed'); }
      finally{ btn.disabled=false; btn.innerHTML = prevHtml || '➤'; }
    };

    // Attach events
    const existingBtn = document.getElementById('btnSendMsg'); if(existingBtn){ existingBtn.addEventListener('click', ()=>{ const convoId = window.activeConvoId || window.convoId || window.currentConversationId || null; window.robustSendMessage(convoId); }); }
    chatInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey && document.getElementById('mentionDropdown')?.classList.contains('hidden')){ e.preventDefault(); const convoId = window.activeConvoId || window.convoId || window.currentConversationId || null; window.robustSendMessage(convoId); } });

    // Video attach UI
    if(!document.getElementById('chatVideoInput')){
      const vidInput = document.createElement('input'); vidInput.type='file'; vidInput.accept='video/*'; vidInput.id='chatVideoInput'; vidInput.className='hidden'; chatRow.appendChild(vidInput);
      const vidBtn = document.createElement('button'); vidBtn.className='chat-attach'; vidBtn.title='Send video'; vidBtn.textContent='🎞️'; chatRow.insertBefore(vidBtn, document.getElementById('btnVoiceMsg')?.nextSibling || null);
      vidBtn.addEventListener('click', ()=> vidInput.click());
      vidInput.addEventListener('change', (e)=>{ const file=e.target.files[0]; if(!file) return; if(file.size>20*1024*1024){ alert('Video too large (max 20MB)'); vidInput.value=''; } });
    }

    // CSS tweaks
    const style = document.createElement('style'); style.textContent = `@media(max-width:760px){ .chat-messages{ padding-bottom: calc(96px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch;} .chat-input-row .chat-attach, .chat-input-row #btnSendMsg { min-width:44px; min-height:44px;} .post-img img, .msg-img { max-width:100%; height:auto; object-fit:cover; } } .msg-failed{opacity:0.6;border:1px solid rgba(255,80,80,0.6);} `; document.head.appendChild(style);

    console.log('Chat features (Phase‑1, improved) initialized');
  });
})();
