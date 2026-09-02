export let currentIdToken = null;

let currentUserHint = null;
let authStateChangedListener = null;

const loginDataBinder = document.getElementById('g_id_onload');
const loginDataBinderClientId = 'data-client_id';
const loginButton = document.getElementById('loginButton');
const logoutButton = document.getElementById('logoutButton');
const authStatus = document.getElementById('authStatus');

const notifyAuthStateChanged = () => {
    if (!authStateChangedListener) {
        return;
    }

    authStateChangedListener({
        isLoggedIn: Boolean(currentIdToken),
        userHint: currentUserHint,
        idToken: currentIdToken
    });
};

const setAuthButtonVisibility = (isLoggedIn) => {
    if (loginButton) {
        loginButton.style.display = isLoggedIn ? 'none' : '';
    }

    if (logoutButton) {
        logoutButton.style.display = isLoggedIn ? 'inline-block' : 'none';
    }
};

const setLoggedIn = (displayName, userHint) => {
    authStatus.textContent = `logged in as ${displayName}`;
    setAuthButtonVisibility(true);
    currentUserHint = userHint || null;
    notifyAuthStateChanged();
};

const setLoggedOut = () => {
    authStatus.textContent = 'Not logged in';
    setAuthButtonVisibility(false);
    currentUserHint = null;
    currentIdToken = null;
    notifyAuthStateChanged();
};

const parseJwt = (token) => JSON.parse(
    new TextDecoder().decode(
        Uint8Array.fromBase64(token.split('.')[1], { alphabet: 'base64url' })
    )
);

// must be global for data-callback='handleCredentialResponse'
window.handleGoogleGsiResponse = async (response) => {
    const payload = parseJwt(response.credential);
    if (!payload) {
        setLoggedOut();
        return;
    }

    currentIdToken = response.credential;
    const userName = payload.name || payload.email || payload.sub || 'unknown user';
    const userHint = payload.email || payload.sub;
    setLoggedIn(`${userName} (${userHint})`, userHint);
};

const loadGoogleGsiScript = () => {
    return new Promise((resolve, reject) => {
        if (document.querySelector('script[data-google-gsi="true"]')) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleGsi = 'true';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Google GSI script'));
        document.head.appendChild(script);
    });
};

// True when running as an installed PWA (standalone display mode).
// In this mode window.open() for external origins opens in the system browser, which
// breaks the GSI popup flow (window.opener is null → postMessage never arrives).
const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true; // iOS Safari

// After a GSI redirect-mode sign-in the service worker converts the POST response into
// a 303 GET redirect to /#gsi_credential=<token>. Pick that up, fire the normal
// credential handler, and clean the hash so it doesn't linger in history.
const consumeHashCredential = () => {
    const match = window.location.hash.match(/[#&]gsi_credential=([^&]*)/);
    if (!match) {
        return;
    }
    const credential = decodeURIComponent(match[1]);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    window.handleGoogleGsiResponse({ credential });
};

export const authClient = (client_id, listener) => {
    if (loginDataBinder.getAttribute(loginDataBinderClientId).trim().length > 0) {
        return;
    }
    loginDataBinder.setAttribute(loginDataBinderClientId, `${client_id || ''}`);

    // In standalone PWA mode switch to redirect UX so the sign-in flow stays within
    // the PWA window instead of opening an external popup that loses window.opener.
    if (isStandalone()) {
        loginDataBinder.setAttribute('data-ux_mode', 'redirect');
        loginDataBinder.setAttribute('data-login_uri', `${window.location.origin}/`);
    }

    loadGoogleGsiScript();

    logoutButton.addEventListener('click', () => {
        if (currentUserHint && window.google?.accounts?.id?.revoke) {
            google.accounts.id.revoke(currentUserHint, () => setLoggedOut());
        } else {
            setLoggedOut();
        }

        if (window.google?.accounts?.id?.disableAutoSelect) {
            google.accounts.id.disableAutoSelect();
        }
    });

    logoutButton.dataset.boundLogoutHandler = 'true';

    authStateChangedListener = listener;
    notifyAuthStateChanged();
    consumeHashCredential();
}
