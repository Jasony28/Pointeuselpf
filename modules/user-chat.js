import { db, currentUser } from '../app.js';
import { 
    collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDocs, doc, updateDoc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

let activeChatListener = null;
let conversationsListener = null;

export async function render() {
    const container = document.getElementById('page-content');
    
    // On utilise les variables CSS pour le background et les bordures
    container.innerHTML = `
        <div class="h-[calc(100vh-140px)] flex flex-col md:flex-row rounded-lg shadow overflow-hidden relative" style="background-color: var(--color-surface); border: 1px solid var(--color-border);">
            
            <div id="conversations-list-panel" class="w-full md:w-1/3 border-r flex flex-col h-full" style="background-color: var(--color-background); border-color: var(--color-border);">
                <div class="p-4 border-b flex justify-between items-center sticky top-0 z-10" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <h2 class="font-bold text-lg" style="color: var(--color-text-base);">Discussions</h2>
                    <button id="new-chat-btn" class="p-2 rounded-full hover:opacity-80 transition" style="color: var(--color-primary); background-color: var(--color-background);">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                </div>
                <div id="conversations-container" class="overflow-y-auto flex-1 p-2 space-y-2">
                    <div class="text-center mt-10 text-sm opacity-50" style="color: var(--color-text-muted);">Chargement...</div>
                </div>
            </div>

            <div id="chat-panel" class="w-full md:w-2/3 flex flex-col h-full absolute md:relative top-0 left-0 transform translate-x-full md:translate-x-0 transition-transform duration-300 z-20" style="background-color: var(--color-surface);">
                
                <div id="chat-header" class="p-4 border-b flex items-center shadow-sm hidden" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <button id="back-to-list" class="md:hidden mr-3" style="color: var(--color-text-muted);">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div class="flex items-center">
                        <div class="w-10 h-10 rounded-full text-white flex items-center justify-center font-bold mr-3 shadow-sm" style="background-color: var(--color-primary);" id="chat-header-avatar">?</div>
                        <h3 class="font-bold" style="color: var(--color-text-base);" id="chat-header-name">Sélectionnez une discussion</h3>
                    </div>
                </div>

                <div id="no-chat-selected" class="flex-1 flex flex-col items-center justify-center opacity-50" style="color: var(--color-text-muted);">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p>Sélectionnez ou commencez une discussion</p>
                </div>

                <div id="messages-area" class="flex-1 overflow-y-auto p-4 space-y-4 hidden" style="background-color: var(--color-background);"></div>

                <div id="input-area" class="p-4 border-t hidden" style="background-color: var(--color-surface); border-color: var(--color-border);">
                    <form id="message-form" class="flex gap-2">
                        <input type="text" id="message-input" placeholder="Votre message..." class="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2" style="background-color: var(--color-background); border-color: var(--color-border); color: var(--color-text-base); --tw-ring-color: var(--color-primary);">
                        <button type="submit" class="text-white rounded-full p-2 w-10 h-10 flex items-center justify-center hover:opacity-90 transition shadow" style="background-color: var(--color-primary);">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 ml-1" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <div id="new-chat-modal" class="fixed inset-0 bg-black bg-opacity-60 hidden z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="rounded-lg w-full max-w-md shadow-2xl overflow-hidden border" style="background-color: var(--color-surface); border-color: var(--color-border);">
                <div class="p-4 border-b flex justify-between items-center" style="border-color: var(--color-border);">
                    <h3 class="font-bold text-lg" style="color: var(--color-text-base);">Nouvelle discussion</h3>
                    <button id="close-modal" class="text-2xl hover:opacity-70" style="color: var(--color-text-muted);">&times;</button>
                </div>
                <div id="users-list" class="h-80 overflow-y-auto p-2">
                    </div>
            </div>
        </div>
    `;

    setupEventListeners();
    loadConversations();
}

function setupEventListeners() {
    const btnBack = document.getElementById('back-to-list');
    if(btnBack) {
        btnBack.onclick = () => {
            document.getElementById('chat-panel').classList.add('translate-x-full');
            if (activeChatListener) activeChatListener(); 
            document.getElementById('messages-area').innerHTML = '';
            document.getElementById('no-chat-selected').classList.remove('hidden');
            document.getElementById('chat-header').classList.add('hidden');
            document.getElementById('input-area').classList.add('hidden');
            document.getElementById('messages-area').classList.add('hidden');
        };
    }

    // Modal
    const modal = document.getElementById('new-chat-modal');
    const newChatBtn = document.getElementById('new-chat-btn');
    if(newChatBtn) {
        newChatBtn.onclick = async () => {
            modal.classList.remove('hidden');
            await loadUsersForNewChat();
        };
    }
    
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

    // Envoi Message
    const form = document.getElementById('message-form');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const input = document.getElementById('message-input');
            const text = input.value.trim();
            const chatId = form.dataset.chatId;

            if (text && chatId) {
                input.value = '';
                try {
                    await addDoc(collection(db, `chats/${chatId}/messages`), {
                        text: text,
                        senderId: currentUser.uid,
                        createdAt: serverTimestamp()
                    });
                    await updateDoc(doc(db, "chats", chatId), {
                        lastMessage: text,
                        lastMessageTime: serverTimestamp()
                    });
                } catch (error) {
                    console.error("Erreur envoi:", error);
                }
            }
        });
    }
}

function loadConversations() {
    if (conversationsListener) conversationsListener();

    // NOTE : CETTE REQUÊTE NÉCESSITE L'INDEX QUE TU DOIS CRÉER
    const q = query(
        collection(db, "chats"), 
        where("participants", "array-contains", currentUser.uid),
        orderBy("lastMessageTime", "desc")
    );

    const container = document.getElementById('conversations-container');

    conversationsListener = onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = `<div class="text-center mt-10 text-sm" style="color: var(--color-text-muted);">Aucune conversation.<br>Cliquez sur le +</div>`;
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const otherUserName = data.participantNames.find(n => n !== (currentUser.displayName || 'Moi')) || data.participantNames[0];
            
            const div = document.createElement('div');
            // Style de la liste des conversations
            div.className = "p-3 rounded-lg cursor-pointer transition flex items-center mb-1 border";
            div.style.borderColor = 'transparent';
            div.style.backgroundColor = 'transparent';
            
            div.onmouseover = () => { div.style.backgroundColor = 'var(--color-background)'; div.style.borderColor = 'var(--color-border)'; };
            div.onmouseout = () => { div.style.backgroundColor = 'transparent'; div.style.borderColor = 'transparent'; };

            // Format date
            let timeStr = '';
            if (data.lastMessageTime) {
                const date = data.lastMessageTime.toDate();
                const now = new Date();
                timeStr = (date.toDateString() === now.toDateString()) 
                    ? date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                    : date.toLocaleDateString();
            }

            div.innerHTML = `
                <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold mr-3 text-sm flex-shrink-0" style="background-color: var(--color-border); color: var(--color-text-muted);">
                    ${otherUserName.substring(0,2).toUpperCase()}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-baseline">
                        <h4 class="font-bold truncate text-sm" style="color: var(--color-text-base);">${otherUserName}</h4>
                        <span class="text-xs" style="color: var(--color-text-muted);">${timeStr}</span>
                    </div>
                    <p class="text-xs truncate" style="color: var(--color-text-muted); opacity: 0.8;">${data.lastMessage || 'Nouvelle conversation'}</p>
                </div>
            `;
            
            div.onclick = () => openChat(docSnap.id, otherUserName);
            container.appendChild(div);
        });
    }, (error) => {
        console.error("Erreur Index probable:", error);
        container.innerHTML = `<div class="text-red-500 p-2 text-xs">Erreur: Index manquant (voir console)</div>`;
    });
}

async function loadUsersForNewChat() {
    const list = document.getElementById('users-list');
    list.innerHTML = `<div class="text-center p-4"><svg class="animate-spin h-6 w-6 mx-auto" style="color: var(--color-primary);" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>`;
    
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        list.innerHTML = '';
        
        querySnapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            if (userDoc.id !== currentUser.uid && userData.status === 'approved') {
                const div = document.createElement('div');
                div.className = "p-3 cursor-pointer flex items-center border-b hover:opacity-80 transition";
                div.style.borderColor = 'var(--color-border)';
                
                div.innerHTML = `
                    <div class="w-8 h-8 rounded-full text-white flex items-center justify-center text-xs font-bold mr-3" style="background-color: var(--color-primary);">
                        ${(userData.displayName || 'U').substring(0,2).toUpperCase()}
                    </div>
                    <span class="font-medium" style="color: var(--color-text-base);">${userData.displayName || userData.email}</span>
                `;
                div.onclick = () => startConversation(userDoc.id, userData.displayName || userData.email);
                list.appendChild(div);
            }
        });
    } catch (e) {
        list.innerHTML = '<div class="text-red-500 text-center">Erreur de chargement</div>';
    }
}

async function startConversation(targetUserId, targetUserName) {
    document.getElementById('new-chat-modal').classList.add('hidden');

    // On crée un ID unique basé sur les deux IDs triés (ex: "uid1_uid2")
    // Comme ça, on retombe toujours sur la même conversation entre 2 personnes.
    const participants = [currentUser.uid, targetUserId].sort();
    const chatId = participants.join('_');
    const chatRef = doc(db, "chats", chatId);

    try {
        // CORRECTION : On ne fait plus de 'getDoc' (lecture) qui bloquait.
        // On force l'écriture/mise à jour directement.
        // 'merge: true' permet de ne pas effacer les messages existants si le chat existe déjà.
        await setDoc(chatRef, {
            participants: participants,
            participantNames: [
               participants[0] === currentUser.uid ? (currentUser.displayName || 'Moi') : targetUserName,
               participants[1] === currentUser.uid ? (currentUser.displayName || 'Moi') : targetUserName
            ], 
            // On met à jour l'heure pour faire remonter la conversation en haut de la liste
            lastMessageTime: serverTimestamp()
        }, { merge: true });

        // Une fois l'écriture validée (les permissions sont OK car on s'est ajouté), on ouvre le chat.
        openChat(chatId, targetUserName);

    } catch (error) {
        console.error("Erreur lors de la création du chat:", error);
        alert("Impossible de lancer la conversation. Vérifiez votre connexion.");
    }
}

function openChat(chatId, chatName) {
    document.getElementById('chat-panel').classList.remove('translate-x-full');
    document.getElementById('no-chat-selected').classList.add('hidden');
    
    const header = document.getElementById('chat-header');
    header.classList.remove('hidden');
    document.getElementById('chat-header-name').textContent = chatName;
    document.getElementById('chat-header-avatar').textContent = chatName.substring(0,2).toUpperCase();

    const inputArea = document.getElementById('input-area');
    inputArea.classList.remove('hidden');
    document.getElementById('message-form').dataset.chatId = chatId;

    const messagesArea = document.getElementById('messages-area');
    messagesArea.classList.remove('hidden');
    messagesArea.innerHTML = '';

    if (activeChatListener) activeChatListener();

    const q = query(collection(db, `chats/${chatId}/messages`), orderBy("createdAt", "asc"));

    activeChatListener = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const msg = change.doc.data();
                const isMe = msg.senderId === currentUser.uid;
                
                const msgDiv = document.createElement('div');
                msgDiv.className = `flex w-full ${isMe ? 'justify-end' : 'justify-start'}`;
                
                // Style des bulles de chat
                // MOI : Couleur Primaire
                // AUTRE : Couleur Surface + Bordure
                const bubbleStyle = isMe 
                    ? `background-color: var(--color-primary); color: #ffffff;` 
                    : `background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text-base);`;

                let timeStr = '';
                if(msg.createdAt) timeStr = msg.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                msgDiv.innerHTML = `
                    <div class="max-w-[75%] px-4 py-2 my-1 rounded-lg shadow-sm group relative" style="${bubbleStyle}">
                        <div class="text-sm break-words">${msg.text}</div>
                        <div class="text-[10px] text-right mt-1 opacity-70">${timeStr}</div>
                    </div>
                `;
                messagesArea.appendChild(msgDiv);
            }
        });
        messagesArea.scrollTop = messagesArea.scrollHeight;
    });
}