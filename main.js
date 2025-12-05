import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --------------------------------------------------------
// 1. CONFIGURACIÓN
// --------------------------------------------------------

// A. Firebase (Tu base de datos)
const firebaseConfig = {
  apiKey: "AIzaSyDLUnpZYmTn0bRfqvwKQca9wzbfAd0SD-U",
  authDomain: "ia-biomedica.firebaseapp.com",
  projectId: "ia-biomedica",
  storageBucket: "ia-biomedica.firebasestorage.app",
  messagingSenderId: "228464906184",
  appId: "1:228464906184:web:6f317a103a68c9a5efbafd"
};

// B. LLAMA 3 API KEY (GROQ)
const GROQ_API_KEY = "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"; 

// --------------------------------------------------------
// 2. CEREBRO BIOINGENIERO (System Prompt)
// --------------------------------------------------------
const SYSTEM_PROMPT = `
INSTRUCCIÓN GENERAL (CORE PROMPT – BioMed AI v2.0):

Eres **BioMed AI**, un **Ingeniero Bioelectrónico Senior (Argentina)** con maestría en **Metrología**, especializado en soporte técnico REAL de **equipos médicos hospitalarios**. Tu única función es dar asistencia a **Técnicos Biomédicos** que están reparando dispositivos médicos en campo o taller.

────────────────────────────────────────
PROTOCOLO DE RESPUESTA (OBLIGATORIO)
────────────────────────────────────────

1. PRESENTACIÓN (SE CUMPLE UNA SOLA VEZ):
   En tu PRIMER mensaje al usuario, debes:
   – Saludar.
   – Presentarte como Ingeniero Bioelectrónico Senior (Argentina).
   – Mencionar tu formación en Metrología.
   – Mencionar Normas IRAM y ANMAT.
   Después de ese primer mensaje:
   **NUNCA más vuelvas a mencionar normativas excepto si el usuario lo pide explícitamente.**

2. ESTILO Y FOCO:
   – Responde SIEMPRE de forma **corta, directa, técnica y orientada a la reparación**.
   – Evita teoría superficial o demasiado básica.
   – No uses lenguaje vago ni genérico.
   – No rellenes. No inventes.

3. SEGURIDAD (CONDICIONAL):
   Si la falla involucra:
      • tensiones peligrosas,
      • gases presurizados,
      • bombas, vacíos,
      • radiación,
      • riesgo biológico,
      • fuentes conmutadas expuestas,
   entonces DEBES iniciar tu respuesta con:
   **"⚠️ Cortá alimentación y usá EPP."**
   Si es software, menú, firmware o configuración → NO pongas la advertencia.

4. DETALLE TÉCNICO AVANZADO (OBLIGATORIO):
   Tus explicaciones deben incluir terminología profesional de bioingeniería:
   - impedancia
   - **puente de Wheatstone**
   - op-amp
   - **driver MOSFET**
   - shunt
   - **sensor REM**
   - carga fantasma
   - fuente conmutada
   - etapa de acondicionamiento
   - filtros activos/pasivos
   - red RC/LC
   - grounding, lazo de masa
   - aislación BF/CF
   - mediciones reales esperables
   - fallas típicas: drift térmico, offset, saturación, ruido, inestabilidad, fuga, falso contacto, etc.

5. FORMATO OBLIGATORIO:
   – SIEMPRE usar **listas numeradas**.
   – Componentes críticos SIEMPRE en **negrita**.
   – Incluir valores esperables de medición (ej: “debería dar ~5 VDC”, “impedancia esperada 1 kΩ – 10 kΩ”, etc.)
   – Paso a paso claro orientado a diagnóstico o reparación.

6. REGLA ANTI-FANTASÍA (IMPRESCINDIBLE):
   Si no hay datos suficientes,
   o si la reparación requiere esquema del fabricante,
   o si falta información vital,

   debes responder EXACTAMENTE:
   **"No dispongo de datos suficientes para asegurar ese diagnóstico. Por seguridad, consulta el Manual de Servicio."**

7. TONO:
   – Profesional.
   – Directo.
   – Nada de emojis salvo el símbolo de advertencia (⚠️) SI corresponda.
   – Sin cuentos, sin relleno, sin improvisar teoría.

8. LO QUE NO DEBES HACER:
   – No inventar partes, voltajes o fallas.
   – No “explicar como a un estudiante”. Estás ayudando a un técnico real.
   – No dar pasos genéricos como “revisa visualmente”, a menos que sea necesario.
   – No diagnosticar sin datos medibles.
   – No dar información irrelevante ni médica (solo técnica).

────────────────────────────────────────
FIN DEL PROMPT
────────────────────────────────────────

`;

// --------------------------------------------------------
// 3. INICIALIZACIÓN
// --------------------------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

setPersistence(auth, browserLocalPersistence).catch(console.error);

// Variables Globales
let currentUser = null;
let currentChatId = null;
let unsubscribeMessages = null;

const refs = {
    loginScreen: document.getElementById('login-screen'),
    appContainer: document.getElementById('app-container'),
    emailInput: document.getElementById('email-input'),
    passInput: document.getElementById('pass-input'),
    btnGoogle: document.getElementById('google-login-btn'),
    btnRegister: document.getElementById('email-register-btn'),
    btnLogin: document.getElementById('email-login-btn'),
    errorMsg: document.getElementById('auth-error-msg'),
    chatList: document.getElementById('conversations-list'),
    newChatBtn: document.getElementById('new-chat-btn'),
    chatHistory: document.getElementById('chat-history'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    loading: document.getElementById('loading-indicator'),
    sidebarAvatar: document.getElementById('sidebar-avatar'),
    sidebarName: document.getElementById('sidebar-username'),
    btnLogout: document.getElementById('logout-btn-sidebar'),
    
    // NUEVO: Para el toggle móvil
    menuToggleBtn: document.getElementById('menu-toggle-btn'),
    sidebar: document.querySelector('.sidebar')
};

// --- MONITOR DE ESTADO ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        refs.loginScreen.classList.add('hidden');
        refs.appContainer.classList.remove('hidden');
        cargarPerfilSidebar(user);
        cargarListaDeChats(user.uid);
    } else {
        currentUser = null;
        refs.loginScreen.classList.remove('hidden');
        refs.appContainer.classList.add('hidden');
    }
});

// --- CHAT SIDEBAR ---
async function crearNuevoChat() {
    if (!currentUser) return;
    const newChatRef = await addDoc(collection(db, `users/${currentUser.uid}/chats`), {
        title: "Nuevo Chat",
        createdAt: serverTimestamp()
    });
    seleccionarChat(newChatRef.id);
}

function cargarListaDeChats(uid) {
    const q = query(collection(db, `users/${uid}/chats`), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        refs.chatList.innerHTML = '';
        if (snapshot.empty) { crearNuevoChat(); return; }

        let first = true;
        snapshot.forEach(doc => {
            const chat = doc.data();
            const chatId = doc.id;
            const btn = document.createElement('div');
            btn.classList.add('chat-item');
            btn.innerText = chat.title || "Chat sin título";
            btn.onclick = () => seleccionarChat(chatId);
            btn.id = `chat-${chatId}`;
            refs.chatList.appendChild(btn);
            
            if (first && !currentChatId) seleccionarChat(chatId);
            first = false;
        });
    });
}

function seleccionarChat(chatId) {
    if (currentChatId === chatId) return;
    currentChatId = chatId;
    
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`chat-${chatId}`);
    if(activeEl) activeEl.classList.add('active');
    
    // Si estamos en móvil, cerramos el menú al seleccionar un chat
    if (window.innerWidth <= 768) {
        refs.sidebar.classList.remove('active');
    }
    
    cargarMensajes(chatId);
}

// --- MENSAJERÍA ---
function cargarMensajes(chatId) {
    if (unsubscribeMessages) unsubscribeMessages();
    const q = query(collection(db, `users/${currentUser.uid}/chats/${chatId}/messages`), orderBy("timestamp", "asc"));
    
    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        refs.chatHistory.innerHTML = '';
        if (snapshot.empty) appendMessageUI("Sistema BioMed (Llama 3.3) Online. Ingeniero especialista listo.", 'ai');

        snapshot.forEach(doc => {
            const data = doc.data();
            appendMessageUI(data.text, data.sender);
        });
        refs.chatHistory.scrollTop = refs.chatHistory.scrollHeight;
    });
}

// 🔥 FUNCIÓN PRINCIPAL DE LLAMA 3 (CON MEMORIA Y TÍTULOS) 🔥
async function sendMessage() {
    const text = refs.userInput.value.trim();
    if (!text || !currentChatId) return;

    refs.userInput.value = '';

    try {
        // 1. Guardar mensaje usuario
        await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
            text: text,
            sender: 'user',
            timestamp: serverTimestamp()
        });

        // 2. ACTUALIZACIÓN DE TÍTULO
        const chatRef = doc(db, `users/${currentUser.uid}/chats/${currentChatId}`);
        const messagesQ = query(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`));
        const messagesSnapshot = await getDocs(messagesQ);
        
        if (messagesSnapshot.size <= 2) {
            const newTitle = text.length > 30 ? text.substring(0, 30) + "..." : text;
            updateDoc(chatRef, { title: newTitle });
        }

        refs.loading.classList.remove('hidden');
        refs.chatHistory.scrollTop = refs.chatHistory.scrollHeight;

        // 3. PREPARAR EL CONTEXTO (MEMORIA)
        const history = [];
        const historyQ = query(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), orderBy("timestamp", "asc"));
        const historyDocs = await getDocs(historyQ);
        
        historyDocs.forEach(doc => {
            const msg = doc.data();
            history.push({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
            });
        });

        // 4. CONECTAR A GROQ
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...history 
                ],
                temperature: 0.5,
                max_tokens: 1024
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        const responseText = data.choices[0].message.content;

        // 5. Guardar respuesta IA
        await addDoc(collection(db, `users/${currentUser.uid}/chats/${currentChatId}/messages`), {
            text: responseText,
            sender: 'ai',
            timestamp: serverTimestamp()
        });

        refs.loading.classList.add('hidden');

    } catch (e) { 
        console.error("Error Llama 3:", e);
        refs.loading.classList.add('hidden');
        appendMessageUI(`Error de IA: ${e.message}. Verifica tu API Key de Groq.`, 'ai');
    }
}

// --- UTILIDADES ---
function cargarPerfilSidebar(user) {
    refs.sidebarName.innerText = user.displayName || user.email.split('@')[0];
    if (user.photoURL) refs.sidebarAvatar.innerHTML = `<img src="${user.photoURL}">`;
    else refs.sidebarAvatar.innerHTML = `<i class="ph ph-user" style="color:#fff"></i>`;
}

function appendMessageUI(text, sender) {
    let formattedText = text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); 
    const div = document.createElement('div');
    div.classList.add('message', `${sender}-message`);
    let avatarHTML = sender === 'ai' ? `<div class=\"chat-avatar\"><i class=\"ph ph-robot\" style=\"font-size:1.2rem;\"></i></div>` : (currentUser.photoURL ? `<div class=\"chat-avatar\"><img src=\"${currentUser.photoURL}\"></div>` : `<div class=\"chat-avatar\"><i class=\"ph ph-user\"></i></div>`);
    div.innerHTML = `${sender === 'ai' ? avatarHTML : ''}<div class=\"message-content\">${formattedText}</div>${sender === 'user' ? avatarHTML : ''}`;
    refs.chatHistory.appendChild(div);
}

// LISTENERS
refs.newChatBtn.addEventListener('click', crearNuevoChat);
refs.sendBtn.addEventListener('click', sendMessage);
refs.userInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });
refs.btnLogout.addEventListener('click', () => { signOut(auth); location.reload(); });
refs.btnGoogle.addEventListener('click', () => signInWithPopup(auth, googleProvider).catch(e => refs.errorMsg.innerText = e.message));
refs.btnRegister.addEventListener('click', async () => { try { await createUserWithEmailAndPassword(auth, refs.emailInput.value, refs.passInput.value); } catch(e) { refs.errorMsg.innerText = e.message; refs.errorMsg.classList.remove('hidden'); } });
refs.btnLogin.addEventListener('click', async () => { try { await signInWithEmailAndPassword(auth, refs.emailInput.value, refs.passInput.value); } catch(e) { refs.errorMsg.innerText = "Error de credenciales"; refs.errorMsg.classList.remove('hidden'); } });

// NUEVO: Lógica de Toggle para Móviles
if (refs.menuToggleBtn && refs.sidebar) {
    refs.menuToggleBtn.addEventListener('click', () => {
        refs.sidebar.classList.toggle('active');
    });
}