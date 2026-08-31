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
  appId: "1:493814518178:web:4e661c0a791a35b09c62fb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ====== EMAILJS SETUP ======
(function() {
    emailjs.init("CPy8DRdtRywJozXJR"); 
})();

// DOM Elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const regNameInput = document.getElementById('reg-name');
const regDeptInput = document.getElementById('reg-dept');
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

// Meeting Schedule Elements
const scheduleModal = document.getElementById('schedule-modal');
const openScheduleBtn = document.getElementById('open-schedule-modal');
const closeScheduleBtn = document.getElementById('close-schedule-modal');
const meetingHeadSelect = document.getElementById('meeting-head-select');
const meetingMembersSelect = document.getElementById('meeting-members-select');
const meetingDatetime = document.getElementById('meeting-datetime');
const meetingAgenda = document.getElementById('meeting-agenda');
const sendMeetingBtn = document.getElementById('send-meeting-invitation');

// Multi-User Jitsi Meeting Elements
const meetingRoom = document.getElementById('meeting-room');
const jitsiContainer = document.getElementById('jitsi-container');
const leaveMeetingBtn = document.getElementById('leave-meeting-btn');

// 1-on-1 Call Elements
const callModal = document.getElementById('call-modal');
const callStatusText = document.getElementById('call-status-text');
const acceptCallBtn = document.getElementById('accept-call-btn');
const hangupCallBtn = document.getElementById('hangup-call-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteAudio = document.getElementById('remote-audio');

// Ringtone Setup
const ringtone = new Audio('https://actions.google.com/sounds/v1/alarms/phone_ring.ogg');
ringtone.loop = true;

let currentUser = null;
let selectedUser = null;
let allUsersMap = {};
let myFullName = "";
let jitsiApi = null; 

// WebRTC Variables
let peerConnection = null;
let localStream = null;
let currentCallId = null;

// Improved STUN Servers (Better Audio/Video Connectivity)
const servers = { 
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ] 
};

// ================= AUTHENTICATION =================
document.getElementById('register-btn').addEventListener('click', async () => {
    const name = regNameInput.value.trim();
    const dept = regDeptInput.value;
    const email = emailInput.value.trim();
    const password = passInput.value;
    
    if(!name || !dept || !email || !password) {
        alert("Name, Department, Email aur Password sab lazmi hain!"); return;
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await set(ref(db, `users/${user.uid}`), { uid: user.uid, email: user.email, name: name, department: dept, status: 'online' });
        alert("Registration successful!");
    } catch (err) { alert("Error: " + err.message); }
});

document.getElementById('login-btn').addEventListener('click', () => {
    signInWithEmailAndPassword(auth, emailInput.value, passInput.value).catch(err => alert("Error: " + err.message));
});

document.getElementById('logout-btn').addEventListener('click', () => {
    if (currentUser) update(ref(db, `users/${currentUser.uid}`), { status: 'offline' });
    signOut(auth);
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authSection.style.display = 'none';
        appSection.style.display = 'flex';
        onValue(ref(db, `users/${user.uid}`), (snapshot) => {
            const data = snapshot.val();
            if(data) {
                myFullName = `${data.name || user.email.split('@')[0]} (${data.department || 'Staff'})`;
                myNameDisplay.innerHTML = `<strong>${data.name || user.email.split('@')[0]}</strong> <br><small>${data.department || ''}</small>`;
                update(ref(db, `users/${user.uid}`), { status: 'online' });
            }
        }, { onlyOnce: true });
        onDisconnect(ref(db, `users/${user.uid}/status`)).set('offline');
        loadUsersList();
        listenForScheduledMeetings();
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
        usersListDiv.innerHTML = ''; meetingHeadSelect.innerHTML = ''; meetingMembersSelect.innerHTML = ''; allUsersMap = {};
        snapshot.forEach((child) => {
            const u = child.val();
            allUsersMap[u.uid] = u;

            const optHead = document.createElement('option'); optHead.value = u.uid; optHead.innerText = `${u.name || u.email.split('@')[0]} - ${u.department || 'Staff'}`; meetingHeadSelect.appendChild(optHead);
            
            if (u.uid !== currentUser.uid) {
                const optMember = document.createElement('option'); optMember.value = u.email; optMember.innerText = `${u.name || u.email.split('@')[0]} (${u.department || 'Staff'})`; meetingMembersSelect.appendChild(optMember);
                
                const item = document.createElement('div'); item.className = 'user-item';
                if (selectedUser && selectedUser.uid === u.uid) item.classList.add('active');
                const statusDot = u.status === 'online' ? '<span class="online-dot"></span>' : '<span class="offline-dot"></span>';
                const displayName = `<div><strong>${u.name || u.email.split('@')[0]}</strong><br><small style="color:#666;">${u.department || 'Staff'}</small></div>`;
                item.innerHTML = `${displayName} ${statusDot}`;

                item.onclick = () => {
                    selectedUser = u; targetUserName.innerText = u.name ? `${u.name} - ${u.department}` : u.email;
                    callButtons.style.display = 'block'; chatInputArea.style.display = 'flex';
                    loadMessages(); loadUsersList();
                };
                usersListDiv.appendChild(item);
            }
        });
    });
}
function getChatId() { return [currentUser.uid, selectedUser.uid].sort().join('_'); }

// ================= MEETING SCHEDULING & EMAIL =================
openScheduleBtn.addEventListener('click', () => scheduleModal.style.display = 'flex');
closeScheduleBtn.addEventListener('click', () => scheduleModal.style.display = 'none');

sendMeetingBtn.addEventListener('click', () => {
    const headUid = meetingHeadSelect.value;
    const selectedOptions = Array.from(meetingMembersSelect.selectedOptions).map(o => o.value);
    const datetime = meetingDatetime.value;
    const agenda = meetingAgenda.value.trim();

    if (!datetime || !agenda || selectedOptions.length === 0) { alert("Sab details (Coworkers, Date, Agenda) lazmi hain!"); return; }

    const headUser = allUsersMap[headUid];
    const meetingData = {
        meetingId: 'ChenabMeet_' + Date.now(),
        headName: headUser.name || headUser.email,
        headDept: headUser.department || '',
        datetime: datetime,
        agenda: agenda,
        createdByName: myFullName,
        participants: selectedOptions
    };

    push(ref(db, 'scheduled_meetings'), meetingData);

    let emailSuccessCount = 0;
    selectedOptions.forEach(userEmail => {
        const templateParams = {
            to_email: userEmail,
            meeting_head: `${headUser.name} (${headUser.department})`,
            date_time: datetime,
            agenda: agenda,
            invited_by: myFullName
        };

        emailjs.send('service_nzjlttn', 'template_ul2r6c8', templateParams)
            .then(() => {
                emailSuccessCount++;
                if (emailSuccessCount === selectedOptions.length) alert("Meeting schedule ho gayi aur Emails send ho gayin!");
            })
            .catch(err => {
                console.error('Email Error: ', err);
                alert("Email bhejne me masla aaya! Error: " + JSON.stringify(err));
            });
    });

    scheduleModal.style.display = 'none';
    meetingAgenda.value = '';
});

// ================= JITSI GROUP MEETING ROOM =================
function listenForScheduledMeetings() {
    onChildAdded(ref(db, 'scheduled_meetings'), (snapshot) => {
        const meet = snapshot.val();
        if (meet.participants.includes(currentUser.email) || meet.headName.includes(currentUser.email)) {
            const msgEl = document.createElement('div');
            msgEl.className = 'message-bubble msg-other';
            msgEl.style.background = '#fff3cd'; msgEl.style.border = '1px solid #ffeeba';
            msgEl.innerHTML = `<strong>📅 Meeting Invitation Received</strong><br>
                <b>Head:</b> ${meet.headName}<br><b>Time:</b> ${meet.datetime}<br><b>Agenda:</b> ${meet.agenda}<br>
                <button id="join-${meet.meetingId}" style="margin-top:8px; background:#075e54; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Join Meeting Room</button>`;
            messagesDiv.appendChild(msgEl);
            document.getElementById(`join-${meet.meetingId}`).onclick = () => startMultiUserMeeting(meet);
        }
    });
}

function startMultiUserMeeting(meetInfo) {
    meetingRoom.style.display = 'flex';
    document.getElementById('meeting-room-title').innerText = `Meeting: ${meetInfo.agenda}`;
    jitsiContainer.innerHTML = ''; 

    const domain = 'meet.jit.si';
    const options = {
        roomName: meetInfo.meetingId,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainer,
        userInfo: { displayName: myFullName },
        configOverwrite: { startWithAudioMuted: false, startWithVideoMuted: false, prejoinPageEnabled: false }
    };
    jitsiApi = new JitsiMeetExternalAPI(domain, options);
}

leaveMeetingBtn.addEventListener('click', () => {
    if(jitsiApi) { jitsiApi.dispose(); jitsiApi = null; }
    meetingRoom.style.display = 'none';
});

// ================= 1-ON-1 CALLING SYSTEM (WITH RING & AUTO-CUT) =================
document.getElementById('audio-call-btn').addEventListener('click', () => startCall(false));
document.getElementById('video-call-btn').addEventListener('click', () => startCall(true));

async function startCall(isVideo) {
    if (!selectedUser) return;
    callModal.style.display = 'flex'; callStatusText.innerText = `Ringing...`; acceptCallBtn.style.display = 'none';
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        if (isVideo) localVideo.srcObject = localStream;
    } catch (e) { alert("Camera/Mic Permission nahi mili"); cleanupCall(); return; }

    peerConnection = new RTCPeerConnection(servers);
    
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
    // Fixed Audio/Video Mapping
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            if (isVideo) remoteVideo.srcObject = event.streams[0];
            else remoteAudio.srcObject = event.streams[0];
        }
    };

    const callRef = push(ref(db, 'calls')); 
    currentCallId = callRef.key;
    
    peerConnection.onicecandidate = (e) => { if (e.candidate) push(ref(db, `calls/${currentCallId}/callerCandidates`), e.candidate.toJSON()); };

    const offer = await peerConnection.createOffer(); 
    await peerConnection.setLocalDescription(offer);
    
    set(ref(db, `calls/${currentCallId}/offer`), { type: offer.type, sdp: offer.sdp });
    set(ref(db, `users/${selectedUser.uid}/incomingCall`), { callId: currentCallId, callerName: myFullName, isVideo: isVideo });

    // Listen for Answer
    onValue(ref(db, `calls/${currentCallId}/answer`), (snapshot) => {
        const data = snapshot.val();
        if (data && !peerConnection.currentRemoteDescription) { 
            callStatusText.innerText = ""; 
            peerConnection.setRemoteDescription(new RTCSessionDescription(data)); 
        }
    });

    onChildAdded(ref(db, `calls/${currentCallId}/calleeCandidates`), (snapshot) => { peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val())); });

    // Listen for Auto-Cut (Agar receiver call reject kare ya cut kare)
    onValue(ref(db, `calls/${currentCallId}`), (snapshot) => {
        if (!snapshot.exists()) cleanupCall();
    });
}

function listenForIncomingCalls() {
    onValue(ref(db, `users/${currentUser.uid}/incomingCall`), (snapshot) => {
        const callData = snapshot.val();
        if (callData) {
            currentCallId = callData.callId; 
            callModal.style.display = 'flex';
            callStatusText.innerText = `Incoming ${callData.isVideo ? 'Video' : 'Audio'} Call from ${callData.callerName}`;
            acceptCallBtn.style.display = 'inline-block'; 
            
            // Play Ringtone
            ringtone.play().catch(e => console.log("Ringtone blocked by browser autoplay rules"));
            
            acceptCallBtn.onclick = () => acceptIncomingCall(callData);

            // Listen for Auto-Cut (Agar caller call end kar de uthane se pehle)
            onValue(ref(db, `calls/${currentCallId}`), (callSnap) => {
                if (!callSnap.exists()) {
                    remove(ref(db, `users/${currentUser.uid}/incomingCall`));
                    cleanupCall();
                }
            });
        }
    });
}

async function acceptIncomingCall(callData) {
    acceptCallBtn.style.display = 'none'; callStatusText.innerText = "Connecting...";
    ringtone.pause(); ringtone.currentTime = 0; // Stop Ringtone

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callData.isVideo });
        if (callData.isVideo) localVideo.srcObject = localStream;
    } catch (e) { cleanupCall(); return; }

    peerConnection = new RTCPeerConnection(servers);
    
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
    // Fixed Audio/Video Mapping
    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            if (callData.isVideo) remoteVideo.srcObject = event.streams[0];
            else remoteAudio.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (e) => { if (e.candidate) push(ref(db, `calls/${currentCallId}/calleeCandidates`), e.candidate.toJSON()); };

    onValue(ref(db, `calls/${currentCallId}/offer`), async (snapshot) => {
        const offer = snapshot.val();
        if (offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer(); 
            await peerConnection.setLocalDescription(answer);
            set(ref(db, `calls/${currentCallId}/answer`), { type: answer.type, sdp: answer.sdp });
            callStatusText.innerText = "";
        }
    }, { onlyOnce: true });

    onChildAdded(ref(db, `calls/${currentCallId}/callerCandidates`), (snapshot) => { peerConnection.addIceCandidate(new RTCIceCandidate(snapshot.val())); });
    remove(ref(db, `users/${currentUser.uid}/incomingCall`));
}

// Global Hangup Button Action
hangupCallBtn.addEventListener('click', () => {
    // Agar currentCallId DB mein hai toh usay delete kar do (Yeh dusri side ko auto-cut trigger kar dega)
    if (currentCallId) remove(ref(db, `calls/${currentCallId}`));
    if (currentUser) remove(ref(db, `users/${currentUser.uid}/incomingCall`));
    if (selectedUser) remove(ref(db, `users/${selectedUser.uid}/incomingCall`));
    cleanupCall();
});

// Centralized Cleanup Function (Jo dono taraf camera/mic properly band karega)
function cleanupCall() {
    ringtone.pause(); ringtone.currentTime = 0;
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (localVideo) localVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;
    
    callModal.style.display = 'none'; 
    callStatusText.innerText = "Calling...";
    currentCallId = null;
}

// ================= CHAT LOGIC =================
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
                    content += `<img src="${msg.fileData}" style="max-width:100%; border-radius:5px; margin-top:5px; cursor:pointer;" onclick="window.open('${msg.fileData}')">`;
                } else {
                    content += `<div style="margin-top:8px; padding:8px; background:rgba(0,0,0,0.05); border-radius:5px;">📄 <a href="${msg.fileData}" download="${msg.fileName}">Download ${msg.fileName}</a></div>`;
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
    push(ref(db, `chats/${getChatId()}`), { sender: currentUser.uid, text: msgInput.value, timestamp: Date.now() });
    msgInput.value = '';
});
attachBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height; const MAX_WIDTH = 1500, MAX_HEIGHT = 1500;
                if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
                else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
                canvas.width = width; canvas.height = height; canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                sendFileData(canvas.toDataURL('image/jpeg', 0.85), 'image/jpeg', file.name);
            }
            img.src = event.target.result;
        }
        reader.readAsDataURL(file);
    } else {
        if(file.size > 3 * 1024 * 1024) { alert('File 3MB se choti honi chahiye.'); return; }
        const reader = new FileReader();
        reader.onload = function(event) { sendFileData(event.target.result, file.type, file.name); }
        reader.readAsDataURL(file);
    }
    e.target.value = ''; 
});
function sendFileData(base64Data, type, name) { push(ref(db, `chats/${getChatId()}`), { sender: currentUser.uid, text: '', fileData: base64Data, fileType: type, fileName: name, timestamp: Date.now() }); }
