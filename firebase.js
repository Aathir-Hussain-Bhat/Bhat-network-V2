import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, getDoc, addDoc, updateDoc, doc, onSnapshot, setDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, RecaptchaVerifier, signInWithPhoneNumber } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    projectId: "bhatech",
    appId: "1:2949571880:web:d2237aad83d283b5d29c1d",
    apiKey: "AIzaSyBfBhvQXXfk3GC2wee6LDYARY6bURvDgJk",
    authDomain: "bhatech.firebaseapp.com",
    storageBucket: "bhatech.firebasestorage.app",
    messagingSenderId: "2949571880",
    measurementId: ""
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "ai-studio-cee4818c-05e5-417a-8a88-2cec88c1c2ea");
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

window.firebaseDB = db;
window.firebaseAuth = auth;
window.firebaseProvider = provider;
window.firebaseModules = {
    collection, getDocs, getDoc, addDoc, updateDoc, doc, onSnapshot, setDoc, deleteDoc, query, where,
    signInWithPopup, onAuthStateChanged, signOut, RecaptchaVerifier, signInWithPhoneNumber
};

window.handleFirestoreError = function(error, operationType, path) {
    const errInfo = {
        error: error instanceof Error ? error.message : String(error),
        authInfo: {
            userId: auth.currentUser?.uid,
            email: auth.currentUser?.email,
            emailVerified: auth.currentUser?.emailVerified,
            isAnonymous: auth.currentUser?.isAnonymous,
            tenantId: auth.currentUser?.tenantId,
            providerInfo: auth.currentUser?.providerData.map(provider => ({
                providerId: provider.providerId,
                displayName: provider.displayName,
                email: provider.email,
                photoUrl: provider.photoURL
            })) || []
        },
        operationType,
        path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
};

console.log("Firebase initialized");
