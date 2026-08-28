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

// Call Elements
const callModal = document.getElementById('call-modal');
const callStatusText = document.getElementById('call-status-text');
const acceptCallBtn = document.getElementById('accept-call-btn');
const hangupCallBtn = document.getElementById('hangup-call-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteAudio = document.getElementById('remote-audio');

let currentUser = null;
let selectedUser = null;
let activeChatListener = null;

// WebRTC Variables
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCallId = null;

const servers = {
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }]
};

// ================= AUTHENTICATION & USER STATUS =================
document.getElementById('register-btn').addEventListener('click', () => {
    createUserWithEmailAndPassword(auth, emailInput.value, passInput.value)
        .catch(err => alert("Error: " + err.message));
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, emailInput.value, passInput.value)
        .catch(err => alert("Error: " + err.message));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    if (currentUser) {
        set(ref(db, `users/${currentUser.uid}/status`), 'offline');
    }
    signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authSection.style.display = 'none';
        appSection.style.display = 'flex';
        myNameDisplay.innerText = user.email.split('@')[0];

        // Save status in DB
        const userRef = ref(db, `users/${user.uid}`);
        set(userRef, {
            uid: user.uid,
            email: user.email,
            status: 'online'
        });
        onDisconnect(ref(db, `users/${user.uid}/status`)).set('offline');

        loadUsersList();
        listenForIncomingCalls();
    } else {
        currentUser = null;
        authSection.style.display = 'block';
        appSection.style.display = 'none';
    }
});

// ================= USERS LIST & SELECTION =================
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

                item.onclick = () => selectUser(u);
                usersListDiv.appendChild(item);
            }
        });
    });
}

function selectUser(user) {
    selectedUser = user;
    targetUserName.innerText = user.email;
    callButtons.style.display = 'block';
    chatInputArea.style.display = 'flex';
    loadMessages();
    loadUsersList(); // Update highlight
}

// ================= 1-ON-1 CHAT SYSTEM =================
function getChatId() {
    return [currentUser.uid, selectedUser.uid].sort().join('_');
}

function loadMessages() {
    messagesDiv.innerHTML = '';
    const chatId = getChatId();
    
    onValue(ref(db, `chats/${chatId}`), (snapshot) => {
        messagesDiv.innerHTML = '';
        snapshot.forEach((child) => {
            const msg = child.val();
            const msgEl = document.createElement('div');
            msgEl.className = 'message-bubble ' + (msg.sender === currentUser.uid ? 'msg-mine' : 'msg-other');
            msgEl.innerText = msg.text;
            messagesDiv.appendChild(msgEl);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });
}

document.getElementById('send-btn').addEventListener('click', () => {
    if (!msgInput.value.trim() || !selectedUser) return;
    const chatId = getChatId();
    push(ref(db, `chats/${chatId}`), {
        sender: currentUser.uid,
        text: msgInput.value,
        timestamp: Date.now()
    });
    msgInput.value = '';
});

// ================= DIRECT CALLING (AUDIO & VIDEO) =================
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
        alert("Camera/Mic Permission nahi mili: " + e.message);
        endCall();
        return;
    }

    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    if (isVideo) remoteVideo.srcObject = remoteStream;
    else remoteAudio.srcObject = remoteStream;

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

    const callRef = push(ref(db, 'calls'));
    currentCallId = callRef.key;

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) push(ref(db, `calls/${currentCallId}/callerCandidates`), e.candidate.toJSON());
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    set(ref(db, `calls/${currentCallId}/offer`), { type: offer.type, sdp: offer.sdp });

    // Send Call Signal to Receiver
    set(ref(db, `users/${selectedUser.uid}/incomingCall`), {
        callId: currentCallId,
        callerEmail: currentUser.email,
        isVideo: isVideo
    });

    // Listen for answer
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

// ================= INCOMING CALL LISTENER =================
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
    } catch (e) {
        alert("Camera/Mic Permission Error");
        endCall();
        return;
    }

    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    if (callData.isVideo) remoteVideo.srcObject = remoteStream;
    else remoteAudio.srcObject = remoteStream;

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (e) => {
        e.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));
    };

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

    // Clear incoming notification
    remove(ref(db, `users/${currentUser.uid}/incomingCall`));
}

// ================= END CALL =================
hangupCallBtn.addEventListener('click', endCall);

function endCall() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    callModal.style.display = 'none';
    if (currentUser) remove(ref(db, `users/${currentUser.uid}/incomingCall`));
    if (currentCallId) remove(ref(db, `calls/${currentCallId}`));
    currentCallId = null;
    peerConnection = null;
}
