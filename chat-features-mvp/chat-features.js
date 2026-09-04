// chat-features.js
// Phase-1 Chat features (voice recorder, robust send, quick responses, subject input)
// Drop this file into the repo and add `<script src="/chat-features-mvp/chat-features.js"></script>` before </body> in index_fixed.html

(function(){
  // safety: run after DOM ready
  function onReady(fn){ if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',fn); else fn(); }

  onReady(()=>{
    // Ensure globals
    window.pendingChatImage = window.pendingChatImage || null;
    window.pendingVoiceBlob = window.pendingVoiceBlob || null;

    // Find chat input row
    const chatInput = document.getElementById('chatInput');
    const chatRow = chatInput?.closest('.chat-input-row');
    if(!chatRow) return; // nothing to wire

    // 1) Add subject input above chatInput (if not present)
    if(!document.getElementById('chatSubject')){
      const subject = document.createElement('input');
      subject.type = 'text';
      subject.id = 'chatSubject';
      subject.placeholder = 'Subject (optional)';
      subject.style.width = '100%';
      subject.style.marginBottom = '6px';
      subject.style.padding = '8px 12px';
      subject.style.borderRadius = '10px';
      subject.style.border = '1px solid rgba(0,0,0,0.08)';
      chatRow.insertAdjacentElement('beforebegin', subject);
    }

    // 2) Quick responses button
    function ensureQuickResponses(){
      if(document.getElementById('quickRespBtn')) return;
      const btn = document.createElement('button');
      btn.id = 'quickRespBtn';
      btn.className = 'chat-attach';
      btn.title = 'Quick responses';
      btn.textContent = '💬';
      btn.style.fontSize = '18px';
      btn.style.marginRight = '4px';
      chatRow.insertBefore(btn, chatRow.firstChild);

      const menu = document.createElement('div');
      menu.id = 'quickRespMenu';
      menu.className = 'mention-dropdown hidden';
      menu.style.position = 'absolute';
      menu.style.bottom = '56px';
      menu.style.left = chatRow.getBoundingClientRect().left + 'px';
      menu.style.zIndex = 9999;
      document.body.appendChild(menu);

      btn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        // toggle
        if(menu.classList.contains('hidden')){
          menu.innerHTML = '<div style="padding:8px">Loading…</div>';
          menu.classList.remove('hidden');
          await renderQuickResponses(menu);
        } else { menu.classList.add('hidden'); }
      });
      document.addEventListener('click', ()=> menu.classList.add('hidden'));
    }

    // Quick responses CRUD
    async function renderQuickResponses(menuEl){
      try{
        if(!window.currentUser || !window.db) { menuEl.innerHTML = '<div style="padding:8px">Not signed in</div>'; return; }
        const list = [];
        // read from collection users/{uid}/quick_responses — fallback to local default
        const qColl = collection(db, 'users', currentUser.uid, 'quick_responses');
        const snap = await (typeof getDocs === 'function' ? getDocs(qColl) : Promise.resolve({docs:[]}));
        if(snap && snap.docs && snap.docs.length){
          snap.forEach(d=> list.push({id:d.id, ...d.data()}));
        }
        if(list.length===0){
          // show default suggestions
          list.push({id:'d1', text:'On it — will update you shortly'});
          list.push({id:'d2', text:'Thanks — received'});
          list.push({id:'d3', text:'Please send more details'});
        }
        // build menu
        menuEl.innerHTML = '';
        list.forEach(item=>{
          const opt = document.createElement('div');
          opt.className = 'mention-option';
          opt.style.padding = '8px 12px';
          opt.style.cursor = 'pointer';
          opt.textContent = item.text;
          opt.addEventListener('click', ()=>{
            chatInput.value = (chatInput.value?chatInput.value + '\n' : '') + item.text;
            chatInput.focus();
            menuEl.classList.add('hidden');
          });
          menuEl.appendChild(opt);
        });
        // add manage row
        const manage = document.createElement('div');
        manage.style.padding = '8px';
        manage.style.borderTop = '1px solid rgba(255,255,255,0.03)';
        manage.innerHTML = '<button id="addQuickResp" class="btn btn-ghost btn-sm">+ Add</button>';
        menuEl.appendChild(manage);
        menuEl.querySelector('#addQuickResp').addEventListener('click', async ()=>{
          const txt = prompt('Quick response text'); if(!txt) return;
          if(window.currentUser && window.db && typeof addDoc === 'function'){
            try{ await addDoc(collection(db,'users',currentUser.uid,'quick_responses'), { text: txt, createdAt: serverTimestamp() });
              await renderQuickResponses(menuEl);
            }catch(err){ console.error(err); alert('Could not save quick response'); }
          }else{ alert('Not available'); }
        });
      }catch(err){ console.error(err); menuEl.innerHTML = '<div style="padding:8px">Error loading</div>'; }
    }

    ensureQuickResponses();

    // 3) Voice recorder wiring (uses existing UI: btnVoiceMsg and voiceRecordIndicator)
    const btnVoice = document.getElementById('btnVoiceMsg');
    const voiceIndicator = document.getElementById('voiceRecordIndicator');
    let mediaRecorder, recordedChunks = [];
    let recordingTimer = null; let recordStartAt = 0;
    function updateTimer(){ if(!voiceIndicator) return; const el = document.getElementById('voiceRecordTimer'); if(!el) return; const s = Math.floor((Date.now()-recordStartAt)/1000); const mm = String(Math.floor(s/60)).padStart(2,'0'); const ss = String(s%60).padStart(2,'0'); el.textContent = mm+':'+ss; }

    if(btnVoice){
      btnVoice.addEventListener('click', async ()=>{
        if(!mediaRecorder || mediaRecorder.state === 'inactive'){
          // start
          try{
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];
            mediaRecorder.ondataavailable = e=> { if(e.data && e.data.size) recordedChunks.push(e.data); };
            mediaRecorder.onstop = async ()=>{
              const blob = new Blob(recordedChunks, { type: 'audio/webm' });
              window.pendingVoiceBlob = blob;
              // auto-send currently if a convo is active (convoId must be available globally when chat open)
              try{ if(typeof sendMessage === 'function'){ sendMessage(window.activeConvoId || window.convoId); } else if(typeof robustSendMessage === 'function'){ robustSendMessage(window.activeConvoId || window.convoId); } }
              catch(e){ console.error(e); }
              // stop timer
              clearInterval(recordingTimer);
              voiceIndicator?.classList.add('hidden');
            };
            mediaRecorder.start();
            recordStartAt = Date.now();
            voiceIndicator?.classList.remove('hidden');
            recordingTimer = setInterval(updateTimer, 500);
          }catch(err){ console.error('Microphone permission error', err); alert('Microphone access is required to record voice messages.'); }
        } else if(mediaRecorder.state === 'recording'){
          mediaRecorder.stop();
        }
      });
    }

    // 4) Robust send implementation (non-destructive: will call existing sendMessage if present)
    async function robustSendMessage(convoId){
      // Use global utils if available
      const input = document.getElementById('chatInput');
      const subjectEl = document.getElementById('chatSubject');
      const text = (input?.value || '').trim();
      const subject = (subjectEl?.value || '').trim();
      if(!text && !window.pendingChatImage && !window.pendingVoiceBlob) return;

      const btn = document.getElementById('btnSendMsg');
      btn.disabled = true; const prevHtml = btn.innerHTML; btn.innerHTML = '<span class="spinner"></span>';

      // optimistic: render pending message in UI if renderMessage exists
      let optimisticId = null;
      try{
        if(typeof renderOutgoingMessage === 'function'){
          optimisticId = renderOutgoingMessage({ senderUid: currentUser?.uid, text, subject, pending:true });
        }
      }catch(e){ /* ignore */ }

      try{
        let imageURL = '';
        let audioURL = '';
        // handle image
        if(window.pendingChatImage){
          if(typeof uploadToCloudinary === 'function'){
            imageURL = await uploadToCloudinary(window.pendingChatImage);
          }else{ throw new Error('uploadToCloudinary not available'); }
        }
        // handle audio
        if(window.pendingVoiceBlob){
          if(typeof uploadRawToCloudinary === 'function'){
            audioURL = await uploadRawToCloudinary(window.pendingVoiceBlob, 'voice-message.webm');
          }else{ throw new Error('uploadRawToCloudinary not available'); }
        }

        // handle video attachments if chatImgInput.files contains video
        const chatImgInput = document.getElementById('chatImgInput');
        let videoURL = '';
        if(chatImgInput && chatImgInput.files && chatImgInput.files[0]){
          const f = chatImgInput.files[0];
          if(f.type.startsWith('video/')){
            if(typeof uploadRawToCloudinary === 'function'){
              videoURL = await uploadRawToCloudinary(f, f.name || 'video.mp4');
            }
          }
        }

        // prepare message object
        const message = {
          senderUid: currentUser?.uid || null,
          text: text || '',
          subject: subject || '',
          messageType: audioURL ? 'audio' : (videoURL ? 'video' : (imageURL ? 'image' : 'text')),
          imageURL: imageURL || '',
          audioURL: audioURL || '',
          videoURL: videoURL || '',
          createdAt: typeof serverTimestamp === 'function' ? serverTimestamp() : new Date()
        };

        // write to firestore
        if(window.db && typeof collection === 'function' && typeof addDoc === 'function'){
          const msgRef = await addDoc(collection(db, 'conversations', convoId, 'messages'), message);
          // success: clear inputs
          if(input) input.value = '';
          if(subjectEl) subjectEl.value = '';
          window.pendingChatImage = null; window.pendingVoiceBlob = null; if(chatImgInput) chatImgInput.value = '';
          // update optimistic UI if possible
          if(typeof markMessageSent === 'function') markMessageSent(optimisticId, msgRef.id);
        } else {
          throw new Error('Firestore write helpers not available');
        }

      }catch(err){
        console.error('robustSendMessage error', err);
        alert(err?.message || 'Message send failed');
        // revert optimistic
        if(typeof markMessageFailed === 'function') markMessageFailed(optimisticId);
      }finally{
        btn.disabled = false; btn.innerHTML = prevHtml || '➤';
      }
    }

    // Attach to existing UI events (btnSendMsg and Enter key)
    const existingBtn = document.getElementById('btnSendMsg');
    if(existingBtn){
      existingBtn.addEventListener('click', ()=>{
        const convoId = window.activeConvoId || window.convoId || (window.currentConversationId || null);
        robustSendMessage(convoId);
      });
    }
    chatInput.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' && !e.shiftKey && document.getElementById('mentionDropdown')?.classList.contains('hidden')){
        e.preventDefault();
        const convoId = window.activeConvoId || window.convoId || (window.currentConversationId || null);
        robustSendMessage(convoId);
      }
    });

    // Video attach: allow chatImgInput to accept video too (already present in HTML accept=image/*). We add a secondary input
    if(!document.getElementById('chatVideoInput')){
      const vidInput = document.createElement('input');
      vidInput.type = 'file'; vidInput.accept = 'video/*'; vidInput.id = 'chatVideoInput'; vidInput.className = 'hidden';
      chatRow.appendChild(vidInput);
      // provide UI button to open
      const vidBtn = document.createElement('button'); vidBtn.className = 'chat-attach'; vidBtn.title='Send video'; vidBtn.textContent='🎞️';
      chatRow.insertBefore(vidBtn, chatRow.querySelector('#btnVoiceMsg')?.nextSibling || null);
      vidBtn.addEventListener('click', ()=> vidInput.click());

      vidInput.addEventListener('change', async (e)=>{
        const file = e.target.files[0]; if(!file) return; const err = (file.size > (20*1024*1024)) ? 'Video too large (max 20MB)' : null; if(err){ alert(err); return; }
        // preview (optional)
        try{ window.pendingChatImage = null; // clear image
          // upload immediately or rely on send
          // we'll keep it as pending file in chatVideoInput and robustSendMessage will pick it up
        }catch(err){ console.error(err); }
      });
    }

    // finally: expose robustSendMessage globally in case other code wants to call
    window.robustSendMessage = robustSendMessage;

    // small CSS tweak dynamic to improve mobile spacing
    const style = document.createElement('style');
    style.textContent = `@media(max-width:760px){ .chat-messages{ padding-bottom: calc(96px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch;} .chat-input-row .chat-attach, .chat-input-row #btnSendMsg { min-width:44px; min-height:44px;} .post-img img, .msg-img { max-width:100%; height:auto; object-fit:cover; } }`;
    document.head.appendChild(style);

    console.log('Chat features (Phase‑1) initialized');
  });
})();
