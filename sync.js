// Sync Firebase to LocalStorage and UI

function initFirebaseSync() {
    if (!window.firebaseDB) {
        setTimeout(initFirebaseSync, 100);
        return;
    }

    const { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } = window.firebaseModules;
    const db = window.firebaseDB;
    const auth = window.firebaseAuth;

    console.log("Starting Firebase Sync...");

    // Sync Workshops
    onSnapshot(collection(db, 'workshops'), (snapshot) => {
        const fbWorkshops = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            fbWorkshops.push({ id: doc.id, ...data });
            if (data.isOpen !== undefined) {
                localStorage.setItem('status_' + doc.id, data.isOpen ? 'open' : 'closed');
            }
            if (data.savesCount !== undefined) {
                localStorage.setItem('saves_' + doc.id, data.savesCount);
            }
        });
        
        if (fbWorkshops.length === 0 && window.defaultWorkshopsDB) {
            window.allWorkshops = window.defaultWorkshopsDB;
            localStorage.setItem('bhat_workshops_db', JSON.stringify(window.defaultWorkshopsDB));
        } else {
            window.allWorkshops = fbWorkshops;
            localStorage.setItem('bhat_workshops_db', JSON.stringify(fbWorkshops));
        }
        if (window.setupBookingsListeners) window.setupBookingsListeners();
        if (window.renderWorkshops) {
            window.renderWorkshops(window.allWorkshops);
            window.renderDashboard();
            window.updateFeaturedWorkshopDOM();
            if (window.updateAddTabVisibility) window.updateAddTabVisibility();
        }
    }, (error) => {
        window.handleFirestoreError(error, 'list', 'workshops');
    });

    // Sync Bookings
    let bookingsUnsubscribes = [];
    let fbBookingsMap = new Map();
    let currentWorkshopIds = '';

    window.setupBookingsListeners = function() {
        const user = auth.currentUser;
        if (!user) {
            bookingsUnsubscribes.forEach(unsub => unsub());
            bookingsUnsubscribes = [];
            fbBookingsMap.clear();
            window.bookings = [];
            localStorage.setItem('bhat_bookings', JSON.stringify([]));
            if (window.renderMyBookings) window.renderMyBookings();
            if (window.renderDashboard) window.renderDashboard();
            return;
        }

        const userWorkshops = window.allWorkshops ? window.allWorkshops.filter(w => w.ownerId === user.uid).map(w => w.id) : [];
        const newWorkshopIds = userWorkshops.sort().join(',');

        // If listeners are already set up for this exact state, don't recreate them
        if (bookingsUnsubscribes.length > 0 && currentWorkshopIds === newWorkshopIds) {
            return;
        }

        currentWorkshopIds = newWorkshopIds;
        bookingsUnsubscribes.forEach(unsub => unsub());
        bookingsUnsubscribes = [];
        fbBookingsMap.clear();

        const updateBookingsUI = () => {
            const fbBookings = Array.from(fbBookingsMap.values());
            window.bookings = fbBookings;
            localStorage.setItem('bhat_bookings', JSON.stringify(fbBookings));
            if (window.renderMyBookings) window.renderMyBookings();
            if (window.renderDashboard) window.renderDashboard();
        };

        const handleSnapshot = (snapshot) => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'removed') {
                    fbBookingsMap.delete(change.doc.id);
                } else {
                    fbBookingsMap.set(change.doc.id, { id: change.doc.id, ...change.doc.data() });
                }
            });
            updateBookingsUI();
        };

        const { query, where } = window.firebaseModules;
        
        // 1. Listen to user's own bookings
        const qUser = query(collection(db, 'bookings'), where('userId', '==', user.uid));
        bookingsUnsubscribes.push(onSnapshot(qUser, handleSnapshot, (error) => {
            window.handleFirestoreError(error, 'list', 'bookings');
        }));

        // 2. Listen to bookings for user's workshops
        if (userWorkshops.length > 0) {
            const qWorkshop = query(collection(db, 'bookings'), where('workshopOwnerId', '==', user.uid));
            bookingsUnsubscribes.push(onSnapshot(qWorkshop, handleSnapshot, (error) => {
                window.handleFirestoreError(error, 'list', 'bookings');
            }));
        }
    };

    // Sync Reviews
    onSnapshot(collection(db, 'reviews'), (snapshot) => {
        const fbReviews = {};
        snapshot.forEach(doc => {
            const r = { id: doc.id, ...doc.data() };
            if (!fbReviews[r.workshopId]) fbReviews[r.workshopId] = [];
            fbReviews[r.workshopId].push(r);
        });
        window.reviewsDB = fbReviews;
        localStorage.setItem('bhat_reviews', JSON.stringify(fbReviews));
        
        // Re-render reviews if a workshop is open
        const detailsEl = document.getElementById('workshopDetails');
        if (detailsEl && !detailsEl.classList.contains('hidden')) {
            const currentId = detailsEl.getAttribute('data-id');
            if (currentId && window.renderReviews) window.renderReviews(currentId);
        }
    }, (error) => {
        window.handleFirestoreError(error, 'list', 'reviews');
    });

    // Auth State
    window.firebaseModules.onAuthStateChanged(auth, (user) => {
        if (user) {
            window.currentUser = user.displayName || 'User';
            window.currentUserId = user.uid;
            window.profilePhoto = user.photoURL;
            window.userLoggedIn = true; // For simplicity, any logged in user can be a mechanic
            window.userEmail = user.email || ''; // Use email as identifier
            
            localStorage.setItem('bhat_user', window.currentUser);
            localStorage.setItem('bhat_user_id', window.currentUserId);
            localStorage.setItem('bhat_user_logged_in', 'true');
            localStorage.setItem('bhat_user_email', window.userEmail);
            if (window.profilePhoto) {
                localStorage.setItem('bhat_profile_photo', window.profilePhoto);
            }
            
            document.getElementById('profileNameDisplay').textContent = window.currentUser;
            if (window.profilePhoto) {
                document.getElementById('profileIcon').classList.add('hidden');
                const img = document.getElementById('profileImage');
                img.src = window.profilePhoto;
                img.classList.remove('hidden');
            }
            
            if (window.setupBookingsListeners) window.setupBookingsListeners();
            
            // Sync user profile to Firestore
            const { getDoc } = window.firebaseModules;
            getDoc(doc(db, 'users', user.uid)).then(userDoc => {
                const userData = {
                    name: window.currentUser,
                    followedWorkshops: Array.isArray(window.followedWorkshops) ? window.followedWorkshops : []
                };
                if (user.email) userData.email = user.email;
                if (user.phoneNumber) userData.phone = user.phoneNumber;
                if (window.profilePhoto) {
                    userData.profilePhoto = window.profilePhoto;
                }
                if (!userDoc.exists() || !userDoc.data().role) {
                    userData.role = 'user';
                }
                setDoc(doc(db, 'users', user.uid), userData, { merge: true }).catch(e => window.handleFirestoreError(e, 'update', 'users'));
            }).catch(e => window.handleFirestoreError(e, 'get', 'users'));

        } else {
            window.currentUser = 'Guest User';
            window.currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            window.profilePhoto = null;
            window.userLoggedIn = false;
            window.userEmail = '';
            
            localStorage.removeItem('bhat_user');
            localStorage.setItem('bhat_user_id', window.currentUserId);
            localStorage.setItem('bhat_user_logged_in', 'false');
            localStorage.setItem('bhat_user_email', '');
            localStorage.removeItem('bhat_profile_photo');
            
            document.getElementById('profileNameDisplay').textContent = window.currentUser;
            document.getElementById('profileIcon').classList.remove('hidden');
            document.getElementById('profileImage').classList.add('hidden');
            document.getElementById('profileImage').src = '';
            
            if (window.setupBookingsListeners) window.setupBookingsListeners();
        }
        
        if (window.updateAddTabVisibility) window.updateAddTabVisibility();
        if (window.renderDashboard) window.renderDashboard();
        if (window.renderMyBookings) window.renderMyBookings();
        if (window.renderAddWorkshop) window.renderAddWorkshop();
    });
}

// Expose Google Login
let isLoggingIn = false;
window.loginWithGoogle = function() {
    if (!window.firebaseAuth || isLoggingIn) return;
    isLoggingIn = true;
    const { signInWithPopup } = window.firebaseModules;
    signInWithPopup(window.firebaseAuth, window.firebaseProvider)
        .then((result) => {
            isLoggingIn = false;
            console.log("Logged in", result.user);
            // Close login modal if open
            document.getElementById('dashboardLogin').classList.add('hidden');
            document.getElementById('dashboardContent').classList.remove('hidden');
        })
        .catch((error) => {
            isLoggingIn = false;
            console.error("Login error", error);
            let errorMsg = "Login failed: " + error.message;
            if (error.code === 'auth/network-request-failed') {
                errorMsg = `Network error during login. This is often caused by ad blockers, strict privacy settings, or blocked third-party cookies in this preview window.<br><br><b>To fix this:</b><br>1. <a href="${window.location.href}" target="_blank" class="text-blue-500 underline">Open the app in a new tab</a><br>2. Disable any ad blockers for this site.<br>3. If you restricted your Firebase API Key, ensure these domains are allowed:<br><code class="text-xs bg-gray-100 p-1 rounded">ais-dev-57uzjgethkzegh55g3yewd-678661993153.asia-southeast1.run.app</code><br><code class="text-xs bg-gray-100 p-1 rounded">ais-pre-57uzjgethkzegh55g3yewd-678661993153.asia-southeast1.run.app</code>`;
            } else if (error.code === 'auth/popup-closed-by-user') {
                errorMsg = "Login popup was closed before completing. Please try again.";
            } else if (error.code === 'auth/cancelled-popup-request') {
                errorMsg = "Multiple login attempts detected. Please wait for the previous popup to close or try again.";
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMsg = "This domain is not authorized for Firebase Auth. Please add it in the Firebase Console.";
            }
            if (window.showModal) window.showModal(errorMsg);
        });
};

window.logoutFromGoogle = function() {
    if (!window.firebaseAuth) return;
    const { signOut } = window.firebaseModules;
    signOut(window.firebaseAuth).then(() => {
        console.log("Logged out");
    });
};

// Start sync
initFirebaseSync();
