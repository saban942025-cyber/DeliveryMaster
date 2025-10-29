// shared/firebase-init.js - v33.0 (Unified)

// ייבוא פונקציות נדרשות מה-SDK של Firebase
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import {
    getFirestore, collection, doc, onSnapshot, query, orderBy, addDoc, updateDoc,
    serverTimestamp, deleteDoc, arrayUnion, where, getDocs, setDoc, limit, getDoc,
    Timestamp // חשוב לייצא Timestamp
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";

// --- הגדרות Firebase ---
// !!! חשוב: ודא שההגדרות כאן נכונות ותואמות לפרויקט שלך ב-Firebase !!!
const firebaseConfig = {
  apiKey: "AIzaSyDq0oVwS6zbEfsgrYBRkeBq80dDUKMedzo", // מפתח API שלך
  authDomain: "saban94-78949.firebaseapp.com",      // הדומיין שלך
  projectId: "saban94-78949",                      // ID הפרויקט שלך
  storageBucket: "saban94-78949.appspot.com",   // (אם אתה משתמש ב-Storage)
  messagingSenderId: "41553157903",             // ID לשליחת הודעות
  appId: "1:41553157903:web:cc33d252cff023be97a87a",               // ID האפליקציה שלך
  measurementId: "G-XV6RZDESSB"                 // (אם אתה משתמש ב-Analytics)
};

// --- אתחול Firebase ---
let app, auth, db, functions;
let initializationError = null;
try {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app); // אתחול Functions
    console.log("[Firebase Shared] Initialization successful.");
} catch (error) {
    console.error("[Firebase Shared] CRITICAL: Initialization failed!", error);
    initializationError = error;
    // נזרוק את השגיאה כדי שה-Promise יידחה
    throw error;
}

// --- הבטחת אימות (Authentication Promise) ---
const MAX_AUTH_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const authReadyPromise = new Promise(async (resolve, reject) => {
    if (initializationError) {
        return reject(initializationError);
    }
    // בדוק אם המשתמש כבר מחובר (נדיר באפליקציות האלה, כי הן בעיקר אנונימיות)
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe(); // הפסק להאזין אחרי הבדיקה הראשונית
        if (user) {
            console.log("[Firebase Shared] User already authenticated:", user.uid);
            resolve(user);
        } else {
            // נסה להתחבר אנונימית
            console.log("[Firebase Shared] Attempting anonymous sign-in...");
            let tries = 0;
            while (tries < MAX_AUTH_RETRIES) {
                tries++;
                try {
                    const userCredential = await signInAnonymously(auth);
                    console.log("[Firebase Shared] Anonymous sign-in successful:", userCredential.user.uid);
                    resolve(userCredential.user);
                    return; // הצלחה, צא מהלולאה
                } catch (e) {
                    console.warn(`[Firebase Shared] Auth attempt ${tries} failed:`, e.code, e.message);
                    if (tries >= MAX_AUTH_RETRIES) {
                        console.error("[Firebase Shared] All auth attempts failed.");
                        reject(e); // כל הניסיונות נכשלו
                        return;
                    }
                    console.log(`[Firebase Shared] Retrying auth in ${RETRY_DELAY_MS / 1000}s...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                }
            }
        }
    }, (error) => {
        // שגיאה בבדיקת מצב האימות הראשוני
        console.error("[Firebase Shared] Error checking initial auth state:", error);
        reject(error);
    });
});


// --- SmartLog V3 (לרישום לוגים) ---
const LOG_COLLECTION = 'system_logs_v3'; // שם הקולקציה ב-Firestore
const sessionId = (Date.now() + Math.random()).toString(36);
let isDbAvailableForLogging = !!db; // נשתמש בזה כדי למנוע ניסיונות כתיבה אם DB נכשל
let isAuthReadyForLogging = false;

// הבטחה שנוכל לכתוב לוגים רק אחרי שהאימות הסתיים בהצלחה
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
    // ... (אפשר להוסיף הדפסת category/solution לקונסול אם רוצים)
    switch (level) {
        case 'INFO': console.log(...consoleArgs); break;
        case 'WARN': console.warn(...consoleArgs); break;
        case 'ERROR': console.error(...consoleArgs); break;
        default: console.log(...consoleArgs);
    }

    // 2. כתיבה ל-Firestore (אם אפשרי)
    if (!isDbAvailableForLogging) return; // אל תנסה אם DB נכשל באתחול

    try {
        await loggingReadyPromise; // ודא שהאימות הסתיים
        const user = auth?.currentUser;
        if (!user) { // הגנה נוספת
             console.warn("[SmartLog] Cannot write log, user context unavailable.");
             return;
        }

        // ניקוי הקונטקסט מאובייקטים שלא ניתנים לסריאליזציה (כמו שגיאות)
        let safeContext = {};
        try {
            safeContext = JSON.parse(JSON.stringify(context || {}));
            // אם יש stack בקונטקסט המקורי (משגיאה), נוסיף אותו בנפרד
             if (context?.stack && typeof context.stack === 'string') {
                 safeContext.stack = context.stack.substring(0, 1000); // הגבלת אורך ה-stack
             }
        } catch (e) {
            safeContext = { serializationError: `Failed to stringify context: ${e.message}` };
        }


        const logEntry = {
            timestamp: serverTimestamp(), // חותמת זמן מהשרת
            level, // INFO, WARN, ERROR
            message: String(message).substring(0, 1500), // הגבלת אורך הודעה
            origin: String(origin).substring(0, 100), // מקור הלוג (למשל, DriverApp, Sidor.Map)
            context: { // קונטקסט נוסף (אובייקט)
                ...safeContext,
                sessionId,
                userAgent: navigator?.userAgent?.substring(0, 200) || 'N/A', // User Agent מקוצר
                page: window.location.pathname
            },
            user: { // פרטי משתמש (אנונימי במקרה שלנו)
                uid: user.uid,
                isAnonymous: user.isAnonymous
            },
            category: category ? String(category).substring(0, 100) : null, // קטגוריה (למשל, Auth, Firestore.Query)
            solution: solution ? String(solution).substring(0, 500) : null // הצעה לפתרון (בשגיאות)
        };

        // הוספת המסמך ל-Firestore (Fire and Forget)
        addDoc(collection(db, LOG_COLLECTION), logEntry)
            .catch(e => console.error("[SmartLog] Firestore write error:", e)); // הדפס שגיאה אם הכתיבה נכשלה

    } catch (error) {
        console.error("[SmartLog] FATAL ERROR during writeLog:", error);
        // במקרה של שגיאת הרשאות קריטית, נשבית כתיבה עתידית
        if (error.code === 'permission-denied' || error.message.includes('permission')) {
            console.warn("[SmartLog] Disabling Firestore logging due to permission error.");
            isDbAvailableForLogging = false;
        }
    }
};

// ייצוא אובייקט SmartLog
const SmartLog = {
    info: (msg, origin, ctx = {}) => { writeLog('INFO', msg, origin, ctx); },
    warn: (msg, origin, ctx = {}, cat = null, sol = null) => { writeLog('WARN', msg, origin, ctx, cat, sol); },
    // קבלת שגיאה (Error object) או מחרוזת
    error: (err, origin, ctx = {}, cat = null, sol = null) => {
        const message = err instanceof Error ? err.message : String(err);
        // אם זה אובייקט שגיאה, נשלח אותו כקונטקסט כדי לתפוס את ה-stack
        const errorContext = err instanceof Error ? { ...ctx, stack: err.stack } : ctx;
        writeLog('ERROR', message, origin, errorContext, cat, sol);
    }
};

// --- פונקציית Toast משותפת ---
/**
 * מציג הודעת Toast קופצת למשתמש.
 * @param {string} message - ההודעה להצגה.
 * @param {'info'|'success'|'warn'|'error'|'ping'} [type='info'] - סוג ההודעה (משפיע על הצבע).
 * @param {number} [duration=3000] - משך הזמן להצגת ההודעה (במילישניות).
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn("[showToast] Toast container not found for message:", message);
        return; // יציאה אם האלמנט לא קיים
    }

    const toast = document.createElement('div');
    // הוספת קלאסים בסיסיים וקלאס לפי סוג ההודעה
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // אנימציה לכניסה
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // הסרה אוטומטית אחרי משך הזמן הנתון
    setTimeout(() => {
        toast.classList.remove('show');
        // הסרת האלמנט מה-DOM אחרי סיום האנימציה
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode === container) { // בדיקה שהאלמנט עדיין קיים לפני הסרה
                container.removeChild(toast);
            }
        }, { once: true }); // הפעלת ה-listener פעם אחת בלבד
    }, duration);

    // רישום הלוג גם דרך SmartLog
    SmartLog.info(`Toast shown: ${message}`, "UI.Toast", { type, duration });
}

// --- ייצוא (Export) ---
// ייצא את כל מה שהאפליקציות צריכות
export {
    // אובייקטים מרכזיים של Firebase
    db,
    auth,
    functions, // ייצוא Functions אם יש בו שימוש ישיר
    httpsCallable, // אם משתמשים ב-callable functions

    // הבטחת אימות
    authReadyPromise,

    // כלי עזר משותפים
    SmartLog,
    showToast,

    // פונקציות Firestore נפוצות
    collection,
    doc,
    onSnapshot,
    query,
    orderBy,
    addDoc,
    updateDoc,
    serverTimestamp,
    deleteDoc,
    arrayUnion,
    where,
    getDocs,
    setDoc,
    limit,
    getDoc,
    Timestamp // חשוב לייצא Timestamp
};

console.log("[Firebase Shared] Module loaded and exports are set.");
