import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, set, push, onChildAdded, onValue, update, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// ====== AAPKA FIREBASE CONFIG ======
const firebaseConfig = {
  apiKey: "AIzaSyCjOP1sVNRCa3byVzDf0MXG4OGGPLXf4DI",
  authDomain: "chenabcall.firebaseapp.com",
  projectId: "chenabcall",
  storageBucket: "chenabcall.firebasestorage.app",
  messagingSenderId: "493814518178",
  appId: "1:493814518178:web:4e661c0a791a35b09c62fb",
  measurementId: "G-534MHSRCJD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// DOM Elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const myNameDisplay = document.getElementById('my-name');
const usersListDiv = document.getElementById('users-list');
const targetUserName = document.getElementById('target-user-name');
const callButtons = document.getElementById('call-buttons');
const chatInputArea = document.getElementById('chat-input-area');
const messagesDiv = document.getElementById('messages');
const msgInput = document.getElementById('msg-input');
const fileInput = document.getElementById('file-input');
const attachBtn = document.getElementById('attach-btn');

const callModal = document.getElementById('call-modal');
const callStatusText = document.getElementById('call-status-text');
const acceptCallBtn = document.getElementById('accept-call-btn');
const hangupCallBtn = document.getElementById('hangup-call-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteAudio = document.getElementById('remote-audio');

let currentUser = null;
let selectedUser = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

// ================= AUTHENTICATION =================
document.getElementById('register-btn').addEventListener('click', () => {
    createUserWithEmailAndPassword(auth, emailInput.value, passInput.value).catch(err => alert("Error: " + err.message));
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, emailInput.value, passInput.value).catch(err => alert("Error: " + err.message));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    if (currentUser) set(ref(db, `users/${currentUser.uid}/status`), 'offline');
    signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authSection.style.display = 'none';
        appSection.style.display = 'flex';
        myNameDisplay.innerText = user.email.split('@')[0];

        set(ref(db, `users/${user.uid}`), { uid: user.uid, email: user.email, status: 'online' });
        onDisconnect(ref(db, `users/${user.uid}/status`)).set('offline');

        loadUsersList();
        listenForIncomingCalls();
    } else {
        currentUser = null;
        authSection.style.display = 'block';
        appSection.style.display = 'none';
    }
});

// ================= USERS LIST =================
function loadUsersList() {
    onValue(ref(db, 'users'), (snapshot) => {
        usersListDiv.innerHTML = '';
        snapshot.forEach((child) => {
            const u = child.val();
            if (u.uid !== currentUser.uid) {
                const item = document.createElement('div');
                item.className = 'user-item';
                if (selectedUser && selectedUser.uid === u.uid) item.classList.add('active');
                const statusDot = u.status === 'online' ? '<span class="online-dot"></span>' : '<span class="offline-dot"></span>';
                item.innerHTML = `<span>${u.email.split('@')[0]}</span> ${statusDot}`;

                item.onclick = () => {
                    selectedUser = u;
                    targetUserName.innerText = u.email;
                    callButtons.style.display = 'block';
                    chatInputArea.style.display = 'flex';
                    loadMessages();
                    loadUsersList();
                };
                usersListDiv.appendChild(item);
            }
        });
    });
}

function getChatId() { return [currentUser.uid, selectedUser.uid].sort().join('_'); }

// ================= CHAT & FILE DISPLAY =================
function loadMessages() {
    const chatId = getChatId();
    onValue(ref(db, `chats/${chatId}`), (snapshot) => {
        messagesDiv.innerHTML = '';
        snapshot.forEach((child) => {
            const msg = child.val();
            const msgEl = document.createElement('div');
            msgEl.className = 'message-bubble ' + (msg.sender === currentUser.uid ? 'msg-mine' : 'msg-other');
            
            let content = '';
            if (msg.text) content += `<div>${msg.text}</div>`;
            
            if (msg.fileData) {
                if (msg.fileType && msg.fileType.startsWith('image/')) {
                    content += `<img src="${msg.fileData}" alt="shared-image" style="max-width: 100%; border-radius: 5px; margin-top: 5px; cursor: pointer;" class="zoomable-image">`;
                } else {
                    content += `<div style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 5px;">
                        📄 <a href="${msg.fileData}" download="${msg.fileName}">Download ${msg.fileName}</a>
                    </div>`;
                }
            }
            
            msgEl.innerHTML = content;
            messagesDiv.appendChild(msgEl);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

document.getElementById('send-btn').addEventListener('click', () => {
    if (!msgInput.value.trim() || !selectedUser) return;
    push(ref(db, `chats/${getChatId()}`), {
        sender: currentUser.uid, text: msgInput.value, timestamp: Date.now()
    });
    msgInput.value = '';
});

// ================= IMAGE FULL SCREEN POPUP LOGIC =================
messagesDiv.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('zoomable-image')) {
        showImagePopup(e.target.src);
    }
});

function showImagePopup(imgSrc) {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.maxWidth = '90%';
    img.style.maxHeight = '90%';
    img.style.borderRadius = '10px';
    img.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';

    const closeIcon = document.createElement('div');
    closeIcon.innerHTML = '✖';
    closeIcon.style.position = 'absolute';
    closeIcon.style.top = '20px';
    closeIcon.style.right = '30px';
    closeIcon.style.color = 'white';
    closeIcon.style.fontSize = '30px';
    
    overlay.appendChild(img);
    overlay.appendChild(closeIcon);
    
    overlay.onclick = () => document.body.removeChild(overlay);
    document.body.appendChild(overlay);
}

// ================= 📎 FILE UPLOAD LOGIC (HD IMAGES) =================
attachBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                
                let width = img.width;
                let height = img.height;
                
                // Nayi HD Limit (Text clear parhne ke liye)
                const MAX_WIDTH = 1500; 
                const MAX_HEIGHT = 1500;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Quality ko 0.6 se 0.85 kar diya hai HD result ke liye
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85); 
                sendFileData(compressedBase64, 'image/jpeg', file.name);
            }
            img.src = event.target.result;
        }
        reader.readAsDataURL(file);
    } 
    else {
        // Document (PDF, Word) ke liye limit 3MB kar di hai
        if(file.size > 3 * 1024 * 1024) { 
            alert('File 3MB se choti honi chahiye.');
            return;
        }
        const reader = new FileReader();
        reader.onload = function(event) {
            sendFileData(event.target.result, file.type, file.name);
        }
        reader.readAsDataURL(file);
    }
    e.target.value = ''; 
});

function sendFileData(base64Data, type, name) {
    push(ref(db, `chats/${getChatId()}`), {
        sender: currentUser.uid,
        text: '', 
        fileData: base64Data,
        fileType: type,
        fileName: name,
        timestamp: Date.now()
    });
}

// ================= CALLING SYSTEM (AUDIO & VIDEO) =================
document.getElementById('audio-call-btn').addEventListener('click', () => startCall(false));
document.getElementById('video-call-btn').addEventListener('click', () => startCall(true));

async function startCall(isVideo) {
    if (!selectedUser) return;
    callModal.style.display = 'flex';
    callStatusText.innerText = `Calling ${selectedUser.email.split('@')[0]}...`;
    acceptCallBtn.style.display = 'none';

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        if (isVideo) localVideo.srcObject = localStream;
    } catch (e) {
        alert("Camera/Mic Permission nahi mili"); endCall(); return;
    }

    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    if (isVideo) remoteVideo.srcObject = remoteStream;
    else remoteAudio.srcObject = remoteStream;

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (event) => event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));

    const callRef = push(ref(db, 'calls'));
    currentCallId = callRef.key;

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) push(ref(db, `calls/${currentCallId}/callerCandidates`), e.candidate.toJSON());
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    set(ref(db, `calls/${currentCallId}/offer`), { type: offer.type, sdp: offer.sdp });

    set(ref(db, `users/${selectedUser.uid}/incomingCall`), { callId: currentCallId, callerEmail: currentUser.email, isVideo: isVideo });

    onValue(ref(db, `calls/${currentCallId}/answer`), (snapshot) => {
        const data = snapshot.val();
        if (data && !peerConnection.currentRemoteDescription) {
            callStatusText.innerText = "Connected";
            peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        }
    });

    onChildAdded(ref(db, `calls/${currentCallId}/calleeCandidates`), (snapshot) => {
        peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
    });
}

function listenForIncomingCalls() {
    onValue(ref(db, `users/${currentUser.uid}/incomingCall`), (snapshot) => {
        const callData = snapshot.val();
        if (callData) {
            currentCallId = callData.callId;
            callModal.style.display = 'flex';
            callStatusText.innerText = `Incoming ${callData.isVideo ? 'Video' : 'Audio'} Call from ${callData.callerEmail.split('@')[0]}`;
            acceptCallBtn.style.display = 'inline-block';
            acceptCallBtn.onclick = () => acceptIncomingCall(callData);
        }
    });
}

async function acceptIncomingCall(callData) {
    acceptCallBtn.style.display = 'none';
    callStatusText.innerText = "Connecting...";
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callData.isVideo });
        if (callData.isVideo) localVideo.srcObject = localStream;
    } catch (e) { endCall(); return; }

    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    if (callData.isVideo) remoteVideo.srcObject = remoteStream;
    else remoteAudio.srcObject = remoteStream;

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = (e) => e.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) push(ref(db, `calls/${currentCallId}/calleeCandidates`), e.candidate.toJSON());
    };

    onValue(ref(db, `calls/${currentCallId}/offer`), async (snapshot) => {
        const offer = snapshot.val();
        if (offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            set(ref(db, `calls/${currentCallId}/answer`), { type: answer.type, sdp: answer.sdp });
            callStatusText.innerText = "Connected";
        }
    }, { onlyOnce: true });

    onChildAdded(ref(db, `calls/${currentCallId}/callerCandidates`), (snapshot) => {
        peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val()));
    });
    remove(ref(db, `users/${currentUser.uid}/incomingCall`));
}

hangupCallBtn.addEventListener('click', endCall);
function endCall() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    callModal.style.display = 'none';
    if (currentUser) remove(ref(db, `users/${currentUser.uid}/incomingCall`));
    if (currentCallId) remove(ref(db, `calls/${currentCallId}`));
    currentCallId = null; peerConnection = null;
}
