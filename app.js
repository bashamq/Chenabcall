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

// EMAILJS SETUP (APNI PUBLIC KEY YAHAN REPLACE KAREIN)
(function() {
    emailjs.init("CPy8DRdtRywJozXJR"); // EmailJS Public Key yahan lagayein
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

// Multi-User Meeting Room Elements
const meetingRoom = document.getElementById('meeting-room');
const videoGrid = document.getElementById('video-grid');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const leaveMeetingBtn = document.getElementById('leave-meeting-btn');

let currentUser = null;
let selectedUser = null;
let allUsersMap = {};
let myFullName = "";

// Meeting Control Variables
let localMeetingStream = null;
let isMicOn = true;
let isCamOn = true;

const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };

// ================= AUTHENTICATION =================
document.getElementById('register-btn').addEventListener('click', async () => {
    const name = regNameInput.value.trim();
    const dept = regDeptInput.value;
    const email = emailInput.value.trim();
    const password = passInput.value;
    
    if(!name || !dept || !email || !password) {
        alert("Registration ke liye Name, Department, Email aur Password sab lazmi hain!");
        return;
    }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await set(ref(db, `users/${user.uid}`), {
            uid: user.uid, email: user.email, name: name, department: dept, status: 'online'
        });
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
        meetingHeadSelect.innerHTML = '';
        meetingMembersSelect.innerHTML = '';
        allUsersMap = {};

        snapshot.forEach((child) => {
            const u = child.val();
            allUsersMap[u.uid] = u;

            // Schedule Meeting Dropdowns Fill Karna
            const optHead = document.createElement('option');
            optHead.value = u.uid;
            optHead.innerText = `${u.name || u.email.split('@')[0]} - ${u.department || 'Staff'}`;
            meetingHeadSelect.appendChild(optHead);

            if (u.uid !== currentUser.uid) {
                const optMember = document.createElement('option');
                optMember.value = u.email;
                optMember.innerText = `${u.name || u.email.split('@')[0]} (${u.department || 'Staff'})`;
                meetingMembersSelect.appendChild(optMember);

                // Sidebar Users List
                const item = document.createElement('div');
                item.className = 'user-item';
                if (selectedUser && selectedUser.uid === u.uid) item.classList.add('active');
                
                const statusDot = u.status === 'online' ? '<span class="online-dot"></span>' : '<span class="offline-dot"></span>';
                const displayName = `<div><strong>${u.name || u.email.split('@')[0]}</strong><br><small style="color:#666;">${u.department || 'Staff'}</small></div>`;

                item.innerHTML = `${displayName} ${statusDot}`;

                item.onclick = () => {
                    selectedUser = u;
                    targetUserName.innerText = u.name ? `${u.name} - ${u.department}` : u.email;
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

// ================= CHAT & FILES =================
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
                    content += `<img src="${msg.fileData}" style="max-width:100%; border-radius:5px; margin-top:5px;" onclick="window.open('${msg.fileData}')">`;
                } else {
                    content += `<div style="margin-top:5px;"><a href="${msg.fileData}" download="${msg.fileName}">📄 ${msg.fileName}</a></div>`;
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

// ================= MEETING SCHEDULING & EMAIL =================
openScheduleBtn.addEventListener('click', () => scheduleModal.style.display = 'flex');
closeScheduleBtn.addEventListener('click', () => scheduleModal.style.display = 'none');

sendMeetingBtn.addEventListener('click', async () => {
    const headUid = meetingHeadSelect.value;
    const selectedOptions = Array.from(meetingMembersSelect.selectedOptions).map(o => o.value);
    const datetime = meetingDatetime.value;
    const agenda = meetingAgenda.value.trim();

    if (!datetime || !agenda || selectedOptions.length === 0) {
        alert("Tamam fields (Coworkers, Date/Time, Agenda) lazmi fill karein!");
        return;
    }

    const headUser = allUsersMap[headUid];
    const meetingData = {
        meetingId: 'meet_' + Date.now(),
        headName: headUser.name || headUser.email,
        headDept: headUser.department || '',
        datetime: datetime,
        agenda: agenda,
        createdByName: myFullName,
        participants: selectedOptions
    };

    // 1. Database me Scheduled Meeting Push Karein
    push(ref(db, 'scheduled_meetings'), meetingData);

    // 2. Selected Coworkers ko Email Send Karein (via EmailJS)
    selectedOptions.forEach(userEmail => {
        const templateParams = {
            to_email: userEmail,
            meeting_head: `${headUser.name} (${headUser.department})`,
            date_time: datetime,
            agenda: agenda,
            invited_by: myFullName
        };

        // Agar EmailJS Service & Template ID configured hain
        emailjs.send('service_nzjlttn', 'template_ul2r6c8', templateParams)
            .then(() => console.log('Email sent to ' + userEmail))
            .catch(err => console.log('Email Error: ', err));
    });

    alert("Meeting schedule ho gayi aur sabhi selected coworkers ko invitation bhej di gayi hai!");
    scheduleModal.style.display = 'none';
    meetingAgenda.value = '';
});

// ================= INCOMING MEETING INVITATION NOTIFICATION =================
function listenForScheduledMeetings() {
    onChildAdded(ref(db, 'scheduled_meetings'), (snapshot) => {
        const meet = snapshot.val();
        if (meet.participants.includes(currentUser.email) || meet.headName.includes(currentUser.email)) {
            // Screen par meeting alert card show karna
            const msgEl = document.createElement('div');
            msgEl.className = 'message-bubble msg-other';
            msgEl.style.background = '#fff3cd';
            msgEl.style.border = '1px solid #ffeeba';
            msgEl.innerHTML = `
                <strong>📅 Meeting Invitation Received</strong><br>
                <b>Head:</b> ${meet.headName}<br>
                <b>Time:</b> ${meet.datetime}<br>
                <b>Agenda:</b> ${meet.agenda}<br>
                <button id="join-${meet.meetingId}" style="margin-top:8px; background:#075e54; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;">Join Meeting Room</button>
            `;
            messagesDiv.appendChild(msgEl);
            
            document.getElementById(`join-${meet.meetingId}`).onclick = () => startMultiUserMeeting(meet);
        }
    });
}

// ================= PROFESSIONAL MULTI-USER MEETING ROOM =================
async function startMultiUserMeeting(meetInfo) {
    meetingRoom.style.display = 'flex';
    document.getElementById('meeting-room-title').innerText = `Meeting: ${meetInfo.agenda}`;
    document.getElementById('meeting-room-agenda').innerText = `Scheduled Time: ${meetInfo.datetime}`;
    document.getElementById('meeting-head-badge').innerText = `Head: ${meetInfo.headName}`;

    try {
        localMeetingStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        addVideoStream(localMeetingStream, `${myFullName} (You)`);
    } catch (e) {
        alert("Camera / Mic access error: " + e.message);
    }
}

function addVideoStream(stream, userName) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'user-label';
    label.innerText = userName;

    wrapper.appendChild(video);
    wrapper.appendChild(label);
    videoGrid.appendChild(wrapper);
}

// Controls (Mic Mute / Camera Toggle)
toggleMicBtn.addEventListener('click', () => {
    if (localMeetingStream) {
        isMicOn = !isMicOn;
        localMeetingStream.getAudioTracks()[0].enabled = isMicOn;
        toggleMicBtn.className = isMicOn ? 'ctrl-btn btn-mic-on' : 'ctrl-btn btn-mic-off';
        toggleMicBtn.innerText = isMicOn ? '🎙️' : '🔇';
    }
});

toggleCamBtn.addEventListener('click', () => {
    if (localMeetingStream) {
        isCamOn = !isCamOn;
        localMeetingStream.getVideoTracks()[0].enabled = isCamOn;
        toggleCamBtn.className = isCamOn ? 'ctrl-btn btn-cam-on' : 'ctrl-btn btn-cam-off';
        toggleCamBtn.innerText = isCamOn ? '📹' : '📷';
    }
});

leaveMeetingBtn.addEventListener('click', () => {
    if (localMeetingStream) {
        localMeetingStream.getTracks().forEach(track => track.stop());
    }
    videoGrid.innerHTML = '';
    meetingRoom.style.display = 'none';
});
