// ========== MODAL HANDLING FIXES ==========

// पुराने openModal को override करें
window.openModal = function(backdropId) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) {
    console.error(`Modal backdrop नहीं मिला: ${backdropId}`);
    return;
  }
  
  backdrop.classList.remove('hidden');
  backdrop.style.display = 'flex';
  backdrop.style.zIndex = '1000';
  
  // Body को scroll करने से रोकें
  document.body.style.overflow = 'hidden';
  
  console.log(`✅ Modal खुला: ${backdropId}`);
};

// पुराने closeModal को override करें
window.closeModal = function(backdropId) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) return;
  
  backdrop.classList.add('hidden');
  backdrop.style.display = 'none';
  
  // Body को फिर से scroll करने दें
  document.body.style.overflow = 'auto';
  
  console.log(`❌ Modal बंद: ${backdropId}`);
};

// ========== STATUS MODAL FIX ==========

// Status Modal को HTML में जोड़ें (अगर नहीं है)
function ensureStatusModal() {
  let statusBackdrop = document.getElementById('statusModalBackdrop');
  
  if (!statusBackdrop) {
    const modalHTML = `
      <div class="modal-backdrop hidden" id="statusModalBackdrop" 
           onclick="if(event.target===this) closeModal('statusModalBackdrop')">
        <div class="modal">
          <div class="modal-head">
            <h3>स्टेटस जोड़ें (Status)</h3>
            <button class="close-x" onclick="closeModal('statusModalBackdrop')">×</button>
          </div>
          <div class="form-field">
            <label>अपनी स्टेटस लिखें</label>
            <textarea id="statusText" rows="4" 
                      placeholder="आपका अपडेट या कहानी..."></textarea>
          </div>
          <div id="statusImgPreview"></div>
          <div class="form-field">
            <button class="btn btn-ghost btn-sm" id="btnStatusAttachImg">📸 फोटो जोड़ें</button>
            <input type="file" id="statusImgInput" accept="image/*" class="hidden">
          </div>
          <div style="display:flex;gap:8px;margin-top:16px">
            <button class="btn btn-primary btn-sm" id="btnStatusStory">
              🟢 24h Story (24 घंटे)
            </button>
            <button class="btn btn-primary btn-sm" id="btnStatusPost">
              📌 Post (स्थायी)
            </button>
          </div>
        </div>
      </div>
    `;
    
    const app = document.getElementById('app');
    if (app) {
      app.insertAdjacentHTML('beforeend', modalHTML);
      statusBackdrop = document.getElementById('statusModalBackdrop');
    }
  }
  
  return statusBackdrop;
}

// Status Modal को खोलने का फंक्शन
window.openStatusModal = function() {
  ensureStatusModal();
  openModal('statusModalBackdrop');
};

// ========== STATUS POSTING LOGIC ==========

function initStatusHandlers() {
  ensureStatusModal();
  
  const btnStatusAttachImg = document.getElementById('btnStatusAttachImg');
  const statusImgInput = document.getElementById('statusImgInput');
  const btnStatusStory = document.getElementById('btnStatusStory');
  const btnStatusPost = document.getElementById('btnStatusPost');
  
  if (!btnStatusAttachImg) return;
  
  // फोटो अटैच करें
  btnStatusAttachImg.addEventListener('click', () => {
    statusImgInput.click();
  });
  
  statusImgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const imgPreview = document.getElementById('statusImgPreview');
      imgPreview.innerHTML = `
        <div class="imgpreview">
          <img src="${event.target.result}">
          <button type="button" onclick="this.parentElement.remove()">×</button>
        </div>
      `;
    };
    reader.readAsDataURL(file);
  });
  
  // 24 घंटे की स्टोरी
  btnStatusStory.addEventListener('click', async () => {
    await postStatus('story');
  });
  
  // स्थायी पोस्ट
  btnStatusPost.addEventListener('click', async () => {
    await postStatus('post');
  });
}

async function postStatus(type) {
  const statusText = document.getElementById('statusText').value.trim();
  const statusImgInput = document.getElementById('statusImgInput');
  
  if (!statusText && statusImgInput.files.length === 0) {
    alert('कृपया कुछ टेक्स्ट या फोटो जोड़ें');
    return;
  }
  
  try {
    // यहाँ Firebase में डेटा सेव करें
    let imageURL = '';
    
    if (statusImgInput.files.length > 0) {
      // फोटो अपलोड करें
      const file = statusImgInput.files[0];
      // Firebase Storage में अपलोड करने का कोड यहाँ आएगा
      console.log('📸 फोटो अपलोड: ', file.name);
    }
    
    // स्टेटस डेटा
    const statusData = {
      text: statusText,
      imageURL: imageURL,
      type: type,  // 'story' या 'post'
      createdAt: new Date(),
      authorUid: currentUser?.uid || 'unknown',
      authorName: currentUser?.displayName || 'Member'
    };
    
    console.log('✅ स्टेटस पोस्ट:', statusData);
    
    // Firestore में जोड़ें (अगर Firebase सेट है)
    if (typeof addDoc !== 'undefined' && typeof db !== 'undefined') {
      await addDoc(collection(db, 'statuses'), statusData);
    }
    
    // Modal बंद करें
    closeModal('statusModalBackdrop');
    
    // फॉर्म रीसेट करें
    document.getElementById('statusText').value = '';
    statusImgInput.value = '';
    document.getElementById('statusImgPreview').innerHTML = '';
    
    alert('✅ स्टेटस सफलतापूर्वक पोस्ट हो गया!');
    
  } catch (error) {
    console.error('❌ Error पोस्ट करते समय:', error);
    alert('❌ स्टेटस पोस्ट करने में समस्या: ' + error.message);
  }
}

// जब पेज लोड हो तो handlers को initialize करें
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStatusHandlers);
} else {
  initStatusHandlers();
}

// ========== BUTTON CLICK HANDLERS ==========

// Status button को जोड़ें
document.addEventListener('DOMContentLoaded', () => {
  const btnOpenStatusModal = document.getElementById('btnOpenStatusModal');
  if (btnOpenStatusModal) {
    btnOpenStatusModal.addEventListener('click', openStatusModal);
  }
  
  // Mobile menu में भी
  const moreMenuStatus = document.querySelector('[data-tab="status"]');
  if (moreMenuStatus) {
    moreMenuStatus.addEventListener('click', openStatusModal);
  }
});
