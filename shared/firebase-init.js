// shared/firebase-init.js - V33.0 (Unified)

// ייבוא פונקציות נדרשות מה-SDK של Firebase
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
    getFirestore, collection, doc, onSnapshot, query, orderBy, addDoc, updateDoc,
    serverTimestamp, deleteDoc, arrayUnion, where, getDocs, setDoc, limit, getDoc,
    Timestamp 
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

// --- הגדרות Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", 
  authDomain: "saban94-78949.firebaseapp.com",
  projectId: "saban94-78949",
  storageBucket: "saban94-78949.appspot.com",
  messagingSenderId: "41553157903",
  appId: "1:41553157903:web:cc33d252cff023be97a87a",
  measurementId: "G-XV6RZDESSB"
};

// --- אתחול Firebase ---
let app, auth, db, functions;
let initializationError = null;
try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
    console.log("[Firebase Shared] Initialization successful.");
} catch (error) {
    console.error("[Firebase Shared] CRITICAL: Initialization failed!", error);
    initializationError = error;
    throw error;
}

// --- הבטחת אימות (Authentication Promise) ---
const MAX_AUTH_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const authReadyPromise = new Promise(async (resolve, reject) => {
    if (initializationError) return reject(initializationError);
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();
        if (user) {
            console.log("[Firebase Shared] User already authenticated:", user.uid);
            resolve(user);
        } else {
            let tries = 0;
            while (tries < MAX_AUTH_RETRIES) {
                tries++;
                try {
                    const userCredential = await signInAnonymously(auth);
                    console.log("[Firebase Shared] Anonymous sign-in successful:", userCredential.user.uid);
                    resolve(userCredential.user);
                    return;
                } catch (e) {
                    console.warn(`[Firebase Shared] Auth attempt ${tries} failed:`, e.code, e.message);
                    if (tries >= MAX_AUTH_RETRIES) {
                        console.error("[Firebase Shared] All auth attempts failed.");
                        reject(e);
                        return;
                    }
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                }
            }
        }
    }, (error) => {
        console.error("[Firebase Shared] Error checking initial auth state:", error);
        reject(error);
    });
});


// --- SmartLog V3 (לרישום לוגים) ---
const LOG_COLLECTION = 'system_logs_v3';
const sessionId = (Date.now() + Math.random()).toString(36);
let isDbAvailableForLogging = !!db;
let isAuthReadyForLogging = false;

const loggingReadyPromise = authReadyPromise.then(() => {
    isAuthReadyForLogging = true;
    console.log("[SmartLog] Auth is ready for logging.");
}).catch(() => {
    console.warn("[SmartLog] Auth failed, Firestore logging disabled.");
    isDbAvailableForLogging = false;
});

const writeLog = async (level, message, origin = "Unknown", context = {}, category = null, solution = null) => {
    // 1. הדפסה לקונסול תמיד
    const consoleArgs = [`[${origin}] ${level}:`, message];
    if (Object.keys(context).length > 0) consoleArgs.push(context);
    switch (level) {
        case 'INFO': console.log(...consoleArgs); break;
        case 'WARN': console.warn(...consoleArgs); break;
        case 'ERROR': console.error(...consoleArgs); break;
        default: console.log(...consoleArgs);
    }

    // 2. כתיבה ל-Firestore (אם אפשרי)
    if (!isDbAvailableForLogging) return;

    try {
        await loggingReadyPromise;
        const user = auth?.currentUser;
        if (!user) return;

        let safeContext = {};
        try {
            safeContext = JSON.parse(JSON.stringify(context || {}));
            if (context?.stack && typeof context.stack === 'string') {
                 safeContext.stack = context.stack.substring(0, 1000);
             }
        } catch (e) {
            safeContext = { serializationError: `Failed to stringify context: ${e.message}` };
        }

        const logEntry = {
            timestamp: serverTimestamp(),
            level,
            message: String(message).substring(0, 1500),
            origin: String(origin).substring(0, 100),
            context: {
                ...safeContext,
                sessionId,
                userAgent: navigator?.userAgent?.substring(0, 200) || 'N/A',
                page: window.location.pathname
            },
            user: {
                uid: user.uid,
                isAnonymous: user.isAnonymous
            },
            category: category ? String(category).substring(0, 100) : null,
            solution: solution ? String(solution).substring(0, 500) : null
        };

        addDoc(collection(db, LOG_COLLECTION), logEntry)
            .catch(e => console.error("[SmartLog] Firestore write error:", e));
    } catch (error) {
        console.error("[SmartLog] FATAL ERROR during writeLog:", error);
        if (error.code === 'permission-denied' || error.message.includes('permission')) {
            console.warn("[SmartLog] Disabling Firestore logging due to permission error.");
            isDbAvailableForLogging = false;
        }
    }
};

const SmartLog = {
    info: (msg, origin, ctx = {}) => { writeLog('INFO', msg, origin, ctx); },
    warn: (msg, origin, ctx = {}, cat = null, sol = null) => { writeLog('WARN', msg, origin, ctx, cat, sol); },
    error: (err, origin, ctx = {}, cat = null, sol = null) => {
        const message = err instanceof Error ? err.message : String(err);
        const errorContext = err instanceof Error ? { ...ctx, stack: err.stack } : ctx;
        writeLog('ERROR', message, origin, errorContext, cat, sol);
    }
};

// --- פונקציית Toast משותפת ---
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn("[showToast] Toast container not found for message:", message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, { once: true });
    }, duration);

    SmartLog.info(`Toast shown: ${message}`, "UI.Toast", { type, duration });
}

// --- ייצוא (Export) ---
export {
    db, auth, functions, httpsCallable, authReadyPromise,
    SmartLog, showToast,
    collection, doc, onSnapshot, query, orderBy, addDoc, updateDoc,
    serverTimestamp, deleteDoc, arrayUnion, where, getDocs, setDoc, limit, getDoc,
    Timestamp 
};

console.log("[Firebase Shared] Module loaded and exports are set.");
