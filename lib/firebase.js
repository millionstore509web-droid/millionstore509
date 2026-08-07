import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
const firebaseConfig = {
  apiKey: "AIzaSyBrlB7fK-KOAJPt-tRlPNEwT95a-feGEFo",
  authDomain: "millionstorev2.firebaseapp.com",
  projectId: "millionstorev2",
  storageBucket: "millionstorev2.firebasestorage.app",
  messagingSenderId: "198386149357",
  appId: "1:198386149357:web:f7b38aadd177dce6f9e9e4",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);