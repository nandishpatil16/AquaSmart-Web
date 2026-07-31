import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyA0Ex9aIRO0spkeYghA_RzdhSmiSKfdbpk",
  authDomain: "aquasmart-3d0cb.firebaseapp.com",
  databaseURL: "https://aquasmart-3d0cb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "aquasmart-3d0cb",
  storageBucket: "aquasmart-3d0cb.firebasestorage.app",
  messagingSenderId: "536108658459",
  appId: "1:536108658459:web:2869f5e3c2317cfc1b2dbe",
  measurementId: "G-SVCQ082PLC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

export { database, ref, onValue, set, update, remove, isFirebaseConfigured };
