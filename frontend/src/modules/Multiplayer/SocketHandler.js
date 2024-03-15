import { getSelfLoginCode, getCookieId, processServerPacket } from "./MultiplayerHandler.js";

const debug = true;

/** @type {undefined | WebSocket} */
let socket;

let closeReason = null;
let lastBeginTime = null;
let lastStartTime = null;
let lastErrorTime = null;
let lastCloseTime = null;
let isSocketClosed = false;

let lastRestartTime = null;
let lastRestartDelayPeriod = 500;
let responseResolveRecord = {};

async function createSocket() {
    if (lastBeginTime && new Date().getTime() - lastBeginTime < 1000) {
        debug && console.log('[D]', 'Last begin time was only', new Date().getTime() - lastBeginTime, 'ms before and 1000 ms of artificial delay will be added before connection');
        await new Promise((resolve) => setTimeout(() => resolve, 1000));
    }
    const [selfLoginCode, cookieId] = await Promise.all([getSelfLoginCode(), getCookieId()]);
    return await new Promise((resolve, reject) => {
        lastBeginTime = new Date().getTime();
        const url = `wss://${window.location.host}:443/websocket/${selfLoginCode}/${cookieId ? cookieId + '/' : ''}`;
        debug && console.log('[D]', 'Creating websocket to', url);
        const s = new WebSocket(url);

        let resolved = false;
        const timeoutTimer = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                const message = 'Timeout while waiting for socket to initialize';
                debug && console.log('[D]', message);
                closeReason = new Error(message);
                reject(closeReason);
            }
        }, 7000);

        s.addEventListener('timeout', (evt) => {
            isSocketClosed = true;
            clearTimeout(timeoutTimer);
            const message = `Timeout event emitted for websocket ${evt && typeof evt['message'] === 'string' ? evt['message'] : 'without message'} at phase ${evt.eventPhase} (${resolved ? 'after resolving' : 'before resolving'})`;
            debug && console.log('[D]', message);
            if (!resolved) {
                resolved = true;
                closeReason = new Error(message);
                reject(closeReason);
            }
        });

        s.addEventListener('error', (evt) => {
            isSocketClosed = true;
            clearTimeout(timeoutTimer);
            const now = new Date().getTime();
            const message = `Error event emitted for websocket ${evt && typeof evt['message'] === 'string' ? evt['message'] : 'without message'} at phase ${evt.eventPhase} (${resolved ? 'after resolving' : 'before resolving'}),  ${now - lastBeginTime} ms since begining connection and ${now - lastErrorTime} ms since last error event`;
            lastErrorTime = new Date().getTime();
            debug && console.log('[D]', message);
            if (!resolved) {
                resolved = true;
                closeReason = new Error(message);
                reject(closeReason);
            }
        });

        s.addEventListener('close', () => {
            isSocketClosed = true;
            clearTimeout(timeoutTimer);
            const now = new Date().getTime();
            const message = `Socket close event emitted ${now - lastBeginTime} ms since begining connection, ${now - lastStartTime} ms since last connection start, ${now - lastCloseTime} ms since last connection close`;
            debug && console.log('[D]', message);
            closeReason = new Error(message);
            lastCloseTime = now;
        });

        s.addEventListener('open', () => {
            clearTimeout(timeoutTimer);
            if (resolved) {
                debug && console.log('[D]', 'Socket open event emitted but socket function has resolved already. Attempting to close socket.');
                try {
                    isSocketClosed = true;
                    s.close();
                } catch (err) {
                    // Ignore
                }
                return;
            }
            isSocketClosed = false;
            // Delay to confirm nothing will fail
            setTimeout(() => {
                if (resolved) {
                    debug && console.log('[D]', 'Socket open timeout after open event emitted but socket function has resolved already. Attempting to close socket.');
                    try {
                        isSocketClosed = true;
                        s.close();
                    } catch (err) {
                        // Ignore
                    }
                    return;
                }
                resolved = true;
                resolve(s);
            }, 250);
        });

        s.addEventListener('message', (event) => {
            let obj;
            try {
                obj = typeof event.data === 'string' && event.data[0] === '{' ? JSON.parse(event.data) : event.data;
            } catch (err) {
                debug && console.log('[D]', 'Failed to parse data from socket:', err.message);
                s.close();
                return;
            }
            if (responseResolveRecord[obj.responseId]) {
                debug && console.log('[D]', 'Routed server packet to response');
                responseResolveRecord[obj.responseId].resolve(obj);
                delete responseResolveRecord[obj.responseId];
                return;
            }
            debug && console.log('[D]', 'Routed server packet to process server event');
            processServerPacket(obj);
        });
    });
}

let isStartingSocket = false;

export async function initializeSocket() {
    let socket;
    if (isStartingSocket) {
        throw new Error('Cannot initialize socket because it is already being started');
    }
    isStartingSocket = true;
    const startTime = new Date().getTime();
    try {
        socket = await createSocket();
        isStartingSocket = false;
    } catch (err) {
        isStartingSocket = false;
        console.log('Failed while starting socket for the first time:');
        console.log(err);
        const has = localStorage.getItem('has-socket-connected-on-the-past');
        if (has === 'true' || has === '1') {
            console.log('Socket has connected on the past so multiplayer setup will attempt to reconnect once regardless of previous error');
        } else {
            console.log('No indication that the socket has connected previously was found');
            if (new Date().getTime() - startTime > 4000) {
                console.log('The socket failed after a while so multiplayer setup will fail');
                throw err;
            }
            console.log('First socket connection failed quickly so multiplayer setup will attempt to reconnect once regardless of previous error');
        }
    }
    if (!socket) {
        isStartingSocket = true;
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
            socket = await createSocket();
            localStorage.setItem('has-socket-connected-on-the-past', 'true');
            isStartingSocket = false;
        } catch (err) {
            isStartingSocket = false;
            throw err;
        }
    }
    if (!socket) {
        throw new Error('Unexpectedly missing socket after creation');
    }
}

// let lastSendTime = new Date().getTime();
let replyId = 0;
export async function sendEvent(obj, waitReply = false) {
    if (!socket) {
        throw new Error('No socket connection stabilished to send event');
    }
    if (isSocketClosed && !isStartingSocket) {
        debug && console.log('[D]', 'Restarting socket');
        isStartingSocket = true;
        try {
            socket = await createSocket();
            isStartingSocket = false;
        } catch (err) {
            debug && console.log('[D]', 'Failed while restarting socket:', err.stack);
            isStartingSocket = false;
            throw err;
        }
    }
    for (let i = 0; i < 30 && isStartingSocket; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (isStartingSocket || !socket || isSocketClosed) {
        throw new Error('No socket connection stabilished after restart');
    }
    /*
    while (lastSendTime - new Date().getTime() < 50) {
      await new Promise((resolve) => setTimeout(resolve, 51));
    }
    lastSendTime = new Date().getTime();
    */
    return await new Promise((resolve, reject) => {
        try {
            if (waitReply) {
                obj.replyId = replyId;
                responseResolveRecord[replyId] = {
                    resolve,
                    time: new Date().getTime(),
                };
                replyId++;
            }
            socket.send(JSON.stringify(obj));
            if (!waitReply) {
                resolve();
            }
        } catch (err) {
            reject(err);
        }
    });
}

