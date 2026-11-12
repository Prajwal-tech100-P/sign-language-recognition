let isDetecting = false;
let detectionInterval = null;
const FPS = 2; // Frames per second for detection

// UI Elements
const localVideo = document.getElementById('localVideo');
const startButton = document.getElementById('startDetection');
const stopButton = document.getElementById('stopDetection');
const detectionStatus = document.getElementById('detectionStatus');
const detectionResult = document.getElementById('detectionResult');
const detectionHistory = document.getElementById('detectionHistory');

// Canvas setup for frame capture
const captureCanvas = document.createElement('canvas');
const captureCtx = captureCanvas.getContext('2d');

function getSocket() {
    return (window.webRTC && window.webRTC.socket) ? window.webRTC.socket : null;
}

// UI update functions
function updateDetectionStatus(active) {
    if (detectionStatus) {
        detectionStatus.innerHTML = active ?
            '<i class="fas fa-video"></i> Active' :
            '<i class="fas fa-video-slash"></i> Inactive';
        detectionStatus.className = `status-value ${active ? 'active' : 'inactive'}`;
    }
}

function updateDetectionResult(result) {
    if (detectionResult && result) {
        const confidence = (result.confidence * 100).toFixed(1);
        detectionResult.innerHTML = `
            <div class="result-label">${result.label}</div>
            <div class="result-confidence">${confidence}%</div>
        `;
        detectionResult.className = 'detection-result active';
    }
}

function showError(message) {
    if (detectionResult) {
        detectionResult.innerHTML = `<div class="error-message">${message}</div>`;
        detectionResult.className = 'detection-result error';
    }
}

function enableControls(cameraReady) {
    if (startButton) {
        startButton.disabled = !cameraReady || isDetecting;
    }
    if (stopButton) {
        stopButton.disabled = !cameraReady || !isDetecting;
    }
}

// Frame capture: extract center square matching the detection box and resize to 64x64
function captureFrame() {
    if (!localVideo || !localVideo.videoWidth) return null;

    try {
        const vw = localVideo.videoWidth;
        const vh = localVideo.videoHeight;
        const minDim = Math.min(vw, vh);
        const cropSize = minDim * 0.7; // ROI region
        const sx = (vw - cropSize) / 2;
        const sy = (vh - cropSize) / 2;

        captureCanvas.width = 64;
        captureCanvas.height = 64;
        captureCtx.drawImage(localVideo, sx, sy, cropSize, cropSize, 0, 0, 64, 64);
        
        return captureCanvas.toDataURL('image/jpeg', 0.85);
    } catch (error) {
        console.error('Error capturing frame:', error);
        return null;
    }
}

// Start detection
function startDetection() {
    if (!localVideo || isDetecting) return;
    const socket = getSocket();
    if (!socket) {
        showError('Not connected to server');
        return;
    }
    
    isDetecting = true;
    updateDetectionStatus(true);
    enableControls(true);
    
    detectionInterval = setInterval(() => {
        const frame = captureFrame();
        if (frame) {
            const currentRoom = (window.webRTC && window.webRTC.room) ? window.webRTC.room : null;
            socket.emit('detect_sign', {
                image: frame,
                roomId: currentRoom
            });
        }
    }, 1000 / FPS);
}

// Stop detection
function stopDetection() {
    isDetecting = false;
    updateDetectionStatus(false);
    enableControls(true);
    
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }
}

// History management
function addToHistory(result) {
    if (!detectionHistory || !result) return;
    
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    
    const confidence = Math.round(result.confidence * 100);
    entry.innerHTML = `
        <i class="fas fa-clock"></i>
        <span class="time">${new Date().toLocaleTimeString()}</span>
        <span class="label">${result.label}</span>
        <span class="confidence">${confidence}%</span>
    `;
    
    detectionHistory.insertBefore(entry, detectionHistory.firstChild);
    
    while (detectionHistory.children.length > 10) {
        detectionHistory.removeChild(detectionHistory.lastChild);
    }
}

function setupDetectionSocket() {
    const socket = getSocket();
    if (!socket) {
        setTimeout(setupDetectionSocket, 200);
        return;
    }

    socket.on('detection_result', (data) => {
        updateDetectionResult(data);
        addToHistory(data);
    });

    socket.on('detection_error', (data) => {
        console.error('Detection error:', data.error);
        showError(data.error);
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    if (startButton) {
        startButton.addEventListener('click', startDetection);
        startButton.disabled = true;
    }
    
    if (stopButton) {
        stopButton.addEventListener('click', stopDetection);
        stopButton.disabled = true;
    }

    setupDetectionSocket();

    // Auto-initialize camera preview
    if (window.webRTC) {
        const ok = await window.webRTC.setupMediaStream();
        if (ok) {
            enableControls(true);
        }
    }
});
