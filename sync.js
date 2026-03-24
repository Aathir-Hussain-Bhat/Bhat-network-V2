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
        
        // Merge with defaultWorkshopsDB
        // We will just use fbWorkshops if it has data, otherwise we'll upload defaultWorkshopsDB
        if (fbWorkshops.length === 0 && window.defaultWorkshopsDB) {
            window.defaultWorkshopsDB.forEach(w => {
                setDoc(doc(db, 'workshops', w.id), w).catch(e => window.handleFirestoreError(e, 'create', 'workshops'));
            });
        } else {
            window.allWorkshops = fbWorkshops;
            localStorage.setItem('bhat_workshops_db', JSON.stringify(fbWorkshops));
            if (window.renderWorkshops) {
                window.renderWorkshops(window.allWorkshops);
                window.renderDashboard();
                window.updateFeaturedWorkshopDOM();
            }
        }
    }, (error) => {
        window.handleFirestoreError(error, 'list', 'workshops');
    });

    // Sync Bookings
    onSnapshot(collection(db, 'bookings'), (snapshot) => {
        const fbBookings = [];
        snapshot.forEach(doc => {
            fbBookings.push({ id: doc.id, ...doc.data() });
        });
        window.bookings = fbBookings;
        localStorage.setItem('bhat_bookings', JSON.stringify(fbBookings));
        if (window.renderMyBookings) window.renderMyBookings();
        if (window.renderDashboard) window.renderDashboard();
    }, (error) => {
        window.handleFirestoreError(error, 'list', 'bookings');
    });

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
            window.mechanicLoggedIn = true; // For simplicity, any logged in user can be a mechanic
            window.mechanicPhone = user.phoneNumber || user.email; // Use email as fallback identifier
            
            localStorage.setItem('bhat_user', window.currentUser);
            localStorage.setItem('bhat_user_id', window.currentUserId);
            localStorage.setItem('bhat_mechanic_logged_in', 'true');
            localStorage.setItem('bhat_mechanic_phone', window.mechanicPhone);
            if (window.profilePhoto) localStorage.setItem('bhat_profile_photo', window.profilePhoto);
            
            document.getElementById('profileNameDisplay').textContent = window.currentUser;
            if (window.profilePhoto) {
                document.getElementById('profileIcon').classList.add('hidden');
                const img = document.getElementById('profileImage');
                img.src = window.profilePhoto;
                img.classList.remove('hidden');
            }
            
            // Sync user profile to Firestore
            const { getDoc } = window.firebaseModules;
            getDoc(doc(db, 'users', user.uid)).then(userDoc => {
                const userData = {
                    name: window.currentUser,
                    email: user.email,
                    followedWorkshops: window.followedWorkshops || []
                };
                if (window.profilePhoto) {
                    userData.profilePhoto = window.profilePhoto;
                }
                if (!userDoc.exists()) {
                    userData.role = 'user'; // Only set role on creation
                }
                setDoc(doc(db, 'users', user.uid), userData, { merge: true }).catch(e => window.handleFirestoreError(e, 'update', 'users'));
            }).catch(e => window.handleFirestoreError(e, 'get', 'users'));

        } else {
            window.currentUser = 'Guest User';
            window.currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            window.profilePhoto = null;
            window.mechanicLoggedIn = false;
            window.mechanicPhone = '';
            
            localStorage.removeItem('bhat_user');
            localStorage.setItem('bhat_user_id', window.currentUserId);
            localStorage.setItem('bhat_mechanic_logged_in', 'false');
            localStorage.setItem('bhat_mechanic_phone', '');
            localStorage.removeItem('bhat_profile_photo');
            
            document.getElementById('profileNameDisplay').textContent = window.currentUser;
            document.getElementById('profileIcon').classList.remove('hidden');
            document.getElementById('profileImage').classList.add('hidden');
            document.getElementById('profileImage').src = '';
        }
        
        if (window.updateAddTabVisibility) window.updateAddTabVisibility();
        if (window.renderDashboard) window.renderDashboard();
        if (window.renderMyBookings) window.renderMyBookings();
    });
}

// Expose Google Login
window.loginWithGoogle = function() {
    if (!window.firebaseAuth) return;
    const { signInWithPopup } = window.firebaseModules;
    signInWithPopup(window.firebaseAuth, window.firebaseProvider)
        .then((result) => {
            console.log("Logged in", result.user);
            // Close login modal if open
            document.getElementById('dashboardLogin').classList.add('hidden');
            document.getElementById('dashboardContent').classList.remove('hidden');
        })
        .catch((error) => {
            console.error("Login error", error);
            if (window.showModal) window.showModal("Login failed: " + error.message);
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
