import { authClient } from './auth.js';
import { apiClient } from './api.js';
import { decryptText, encryptText, generateAESKey } from './aes.js';
import { saltedBase64ToString, stringToSaltedBase64 } from './base64.js'

let config = {};
let configLoaded = false;

const loadConfig = async () => {
    if (configLoaded) {
        return;
    }

    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`Failed to load frontend config (${response.status})`);
    }
    config = await response.json();

    const backendConfig = await apiClient(config.backend_hostname).config();
    config = { ...config, ...backendConfig };

    configLoaded = true;
};

const encodeMessage = (data) => encodeURIComponent(stringToSaltedBase64(JSON.stringify(data)));

const createMessageLink = (data) => `${window.location.origin}?${data}`;

const copyTextToClipboard = async (text) => {
    if (!text) {
        return;
    }

    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
};

const enableClickToCopy = (element) => {
    const copy = async () => {
        await copyTextToClipboard(element.textContent.trim());
    };

    element.addEventListener('click', () => void copy());
};

const renderExpirationOptions = (selectElement, options) => {
    selectElement.innerHTML = '';

    for (const option of options) {
        const optionElement = document.createElement('option');
        optionElement.value = String(option.value);
        const label = `${String(option.label)}${option.allowOneClick ? ' (one click enabled)' : ''}`
        optionElement.textContent = label;
        selectElement.appendChild(optionElement);
    }
};

const initPage = async () => {
    let isAuthenticated = false;

    const globalState = document.getElementById('globalState');
    const mainPageStatus = document.getElementById('mainPageStatus');

    const topMenuModeWrite = document.getElementById('topMenuModeWrite');
    const topMenuModeRead = document.getElementById('topMenuModeRead');

    const readMessageInputForm = document.getElementById('readMessageInputForm');
    const readMessageInputMessageId = document.getElementById('readMessageInputMessageId');
    const readMessageInputKey = document.getElementById('readMessageInputKey');
    const readMessageOutput = document.getElementById('readMessageOutput');

    const writeMessageInputForm = document.getElementById('writeMessageInputForm');
    const writeMessageInputText = document.getElementById('messageInput');
    const writeMessageInputExpiration = document.getElementById('writeMessageInputExpiration');
    const writeMessageOutputMessageId = document.getElementById('writeMessageOutputMessageId');
    const writeMessageOutputUrlTwoStep = document.getElementById('writeMessageOutputUrlTwoStep');
    const writeMessageOutputTwoStepKey = document.getElementById('writeMessageOutputKeyTwoStep');
    const writeMessageOutputRowOneClick = document.getElementById('writeMessageOutputRowOneClick');
    const writeMessageOutputUrlOneClick = document.getElementById('writeMessageOutputUrlOneClick');

    for (const outputElement of [
        writeMessageOutputMessageId,
        writeMessageOutputTwoStepKey,
        writeMessageOutputUrlTwoStep,
        writeMessageOutputUrlOneClick,
        readMessageOutput
    ]) {
        enableClickToCopy(outputElement);
    }

    const updateSubmitButtons = () => {
        for (const form of [readMessageInputForm, writeMessageInputForm]) {
            const inputs = form.querySelectorAll('input[type="text"], input[type="password"]');
            form.querySelector('button[type="submit"]').disabled = [...inputs].some(i => !i.disabled && i.value.trim() === '');
        }
    };

    const setAuthenticated = (authenticated) => {
        isAuthenticated = authenticated;
        globalState.classList.remove(
            'auth-logged-in',
            'auth-logged-out'
        );
        globalState.classList.add(authenticated ? 'auth-logged-in' : 'auth-logged-out');
    };

    const setGlobalState = (stateClass = '', statusText = '') => {
        globalState.classList.remove(
            'state-idle',
            'state-loading',
            'state-input',
            'state-submitting',
            'state-error',
            'state-fatal',
            'state-success'
        );
        if (stateClass) {
            globalState.classList.add(stateClass);
        }
        mainPageStatus.textContent = statusText;
        updateSubmitButtons();
    };

    const setGlobalMode = (modeClass = '') => {
        globalState.classList.remove(
            'mode-reading',
            'mode-writing'
        );
        if (modeClass) {
            globalState.classList.add(modeClass);
        }

        topMenuModeWrite.setAttribute('aria-selected', String(modeClass === 'mode-writing'));
        topMenuModeRead.setAttribute('aria-selected', String(modeClass === 'mode-reading'));

        readMessageInputMessageId.dispatchEvent(new Event('input', { bubbles: true }));
    };

    const setModeRestrictions = (roles) => {
        const hasWriteRole = roles.includes('write');
        topMenuModeWrite.disabled = !hasWriteRole;

        if (!hasWriteRole) {
            setGlobalMode('mode-reading');
        }
    };

    const normalizeMessageIdInput = async () => {
        const inputValue = readMessageInputMessageId.value.trim();

        try {
            const inputUrl = new URL(inputValue);
            if (inputUrl.search.length > 1) {
                readMessageInputMessageId.value = inputUrl.search.slice(1);
            }
        } catch {
            // Not a URL, keep the user-provided token as-is.
        }

        try {
            const urlQueryToken = JSON.parse(saltedBase64ToString(readMessageInputMessageId.value));
            if (urlQueryToken?.key) {
                readMessageInputKey.value = '';
                readMessageInputKey.disabled = true;
                readMessageInputKey.placeholder = 'one click token';
                updateSubmitButtons();
                return;
            }
        }
        catch {
            // Not yet valid JSON, keep the user-provided token as-is.
        }

        readMessageInputKey.disabled = false;
        readMessageInputKey.placeholder = 'Enter base64 key...';
        updateSubmitButtons();
    };

    const setInitialMode = () => {
        const urlQuery = decodeURIComponent(window.location.search.slice(1));

        if (urlQuery) {
            switchMode('mode-reading');
            // pre-fill values after mode switch
            readMessageInputMessageId.value = urlQuery;
            normalizeMessageIdInput();
        } else {
            switchMode('mode-writing');
        }
    };

    const switchMode = (modeClass) => {
        if (!isAuthenticated) {
            return;
        }

        readMessageInputForm.reset();
        writeMessageInputForm.reset();

        setGlobalMode(modeClass);
        setGlobalState('state-input');
    };

    const submitReadForm = async (event) => {
        event.preventDefault();

        setGlobalState('state-submitting', 'Loading...');

        try {
            const urlQueryToken = JSON.parse(saltedBase64ToString(readMessageInputMessageId.value));
            const value = await apiClient(config.backend_hostname).read(urlQueryToken?.expiration, urlQueryToken?.id);
            const key = urlQueryToken?.key ?? readMessageInputKey.value;
            readMessageOutput.textContent = await decryptText(value, key);
            readMessageInputMessageId.value = ''
            readMessageInputKey.value = ''
            setGlobalState('state-success');
        } catch (error) {
            setGlobalState('state-error', error.message);
        }
    };

    const submitWriteForm = async (event) => {
        event.preventDefault();

        setGlobalState('state-submitting', 'Submitting...');

        try {
            const expiration = writeMessageInputExpiration.value;
            const expirationOption = config.expiration_options.find((option) => String(option.value) === expiration);
            const allowOneClick = expirationOption?.allowOneClick;

            const key = await generateAESKey();
            const encryptedValue = await encryptText(writeMessageInputText.value, key);
            const id = await apiClient(config.backend_hostname).write(expiration, encryptedValue);

            const messageData = encodeMessage({ expiration, id });
            writeMessageOutputMessageId.textContent = messageData;
            writeMessageOutputTwoStepKey.textContent = key;
            writeMessageOutputUrlTwoStep.textContent = createMessageLink(messageData);

            if (allowOneClick) {
                writeMessageOutputRowOneClick.classList.remove('writeMessageOutputRowHidden');
                writeMessageOutputUrlOneClick.textContent = createMessageLink(encodeMessage({
                    expiration, id, key
                }));
            } else {
                writeMessageOutputRowOneClick.classList.add('writeMessageOutputRowHidden');
                writeMessageOutputUrlOneClick.textContent = '';
            }

            writeMessageInputText.value = '';
            setGlobalState('state-success');

        } catch (error) {
            setGlobalState(
                'state-error',
                error.message.startsWith('Error (')
                    ? error.message
                    : `Network error occurred: ${error.message}`
            );
        }
    };

    setGlobalState('state-loading', 'Loading...');
    try {
        await loadConfig();
    } catch (error) {
        setGlobalState('state-fatal', `Could not load config: ${error}`);
        return;
    }

    authClient(config.auth_google_client_id, async ({ isLoggedIn }) => {
        setAuthenticated(isLoggedIn);
        setGlobalState('state-idle');
        if (isLoggedIn) {
            try {
                setGlobalState('state-loading', 'Loading...');
                const { roles = [] } = await apiClient(config.backend_hostname).roles();
                setInitialMode();
                setModeRestrictions(roles);
                setGlobalState('state-input');
            } catch (error) {
                setGlobalState('state-fatal', `Could not initialize page: ${error}`);
            }
        }
    });

    topMenuModeWrite.addEventListener('click', () => void switchMode('mode-writing'));
    topMenuModeRead.addEventListener('click', () => void switchMode('mode-reading'));
    writeMessageInputText.addEventListener('input', updateSubmitButtons);
    readMessageInputKey.addEventListener('input', updateSubmitButtons);
    readMessageInputMessageId.addEventListener('input', normalizeMessageIdInput);
    readMessageInputForm.addEventListener('submit', submitReadForm);
    writeMessageInputForm.addEventListener('submit', submitWriteForm);

    renderExpirationOptions(writeMessageInputExpiration, config.expiration_options);
}

const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    try {
        await navigator.serviceWorker.register('/service-worker.js');
    } catch (error) {
        console.error('Service worker registration failed:', error);
    }
};

window.addEventListener('DOMContentLoaded', initPage);
window.addEventListener('DOMContentLoaded', registerServiceWorker);
