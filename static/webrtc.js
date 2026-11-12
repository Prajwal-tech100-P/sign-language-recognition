class WebRTCHandler {
    constructor() {
        this.localStream = null;
        this.peerConnection = null;
        this.room = null;
        this.userType = 'deaf';

        // Connect to current origin
        const SERVER_URL = window.location.origin;
        this.socket = io(SERVER_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true
        });

        // WebRTC configuration with STUN servers
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };

        this.setupSocketListeners();
        this.setupUIListeners();
    }

    setupUIListeners() {
        // User type selection
        document.querySelectorAll('input[name="userType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.userType = e.target.value;
                this.updateUIForUserType();
            });
        });

        // Room controls
        const createBtn = document.getElementById('createRoom');
        if (createBtn) {
            createBtn.addEventListener('click', () => this.createRoom());
        }

        const joinBtn = document.getElementById('joinRoom');
        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                const roomInput = document.getElementById('roomInput');
                const roomId = roomInput ? roomInput.value.trim() : '';
                if (roomId) this.joinRoom(roomId);
            });
        }
    }

    updateUIForUserType() {
        const detectionControls = document.querySelector('.video-controls');
        const detectionBox = document.querySelector('.detection-box');

        if (this.userType === 'deaf') {
            if (detectionControls) detectionControls.style.display = 'flex';
            if (detectionBox) detectionBox.style.display = 'block';
        } else {
            if (detectionControls) detectionControls.style.display = 'none';
            if (detectionBox) detectionBox.style.display = 'none';
        }
    }

    async setupMediaStream() {
        if (this.localStream && this.localStream.active) {
            return true;
        }

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: true
            });

            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
                await localVideo.play().catch(() => {});
            }
            return true;
        } catch (error) {
            console.warn('Could not access microphone and camera, trying video only:', error);
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });

                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = this.localStream;
                    await localVideo.play().catch(() => {});
                }
                return true;
            } catch (err) {
                console.error('Error accessing video devices:', err);
                return false;
            }
        }
    }

    async createRoom() {
        await this.setupMediaStream();
        this.socket.emit('create_room');
    }

    async joinRoom(roomId) {
        if (!roomId) return;
        await this.setupMediaStream();
        this.socket.emit('join_room', roomId);
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to server');
            const conn = document.getElementById('connectionStatus');
            if (conn) {
                conn.innerHTML = '<i class="fas fa-check-circle"></i> Connected';
                conn.className = 'status-value connected';
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            const conn = document.getElementById('connectionStatus');
            if (conn) {
                conn.innerHTML = '<i class="fas fa-times-circle"></i> Disconnected';
                conn.className = 'status-value disconnected';
            }
        });

        this.socket.on('room_created', (roomId) => {
            console.log('Room created:', roomId);
            this.room = roomId;
            const roomInfo = document.getElementById('roomInfo');
            if (roomInfo) roomInfo.textContent = `Room ID: ${roomId}`;
            const roomInput = document.getElementById('roomInput');
            if (roomInput) roomInput.value = roomId;
            this.initializePeerConnection();
        });

        this.socket.on('room_joined', (roomId) => {
            console.log('Room joined:', roomId);
            this.room = roomId;
            const roomInfo = document.getElementById('roomInfo');
            if (roomInfo) roomInfo.textContent = `Room ID: ${roomId}`;
            this.initializePeerConnection();
            this.createAndSendOffer();
        });

        this.socket.on('user_joined', () => {
            console.log('Another user joined the room');
            if (this.peerConnection) {
                this.createAndSendOffer();
            }
        });

        this.socket.on('offer', async (offer) => {
            if (!offer) return;
            console.log('Received offer');
            if (!this.peerConnection) {
                this.initializePeerConnection();
            }
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.socket.emit('answer', { answer: answer, roomId: this.room });
            } catch (err) {
                console.error('Error handling offer:', err);
            }
        });

        this.socket.on('answer', async (answer) => {
            if (!answer || !this.peerConnection) return;
            console.log('Received answer');
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        });

        this.socket.on('ice_candidate', async (candidate) => {
            if (!candidate || !this.peerConnection) return;
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error adding ice candidate:', error);
            }
        });

        this.socket.on('peer_disconnected', () => {
            console.log('Peer disconnected');
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo) remoteVideo.srcObject = null;
        });

        this.socket.on('error', (err) => {
            alert(err.message || 'Error occurred');
        });
    }

    initializePeerConnection() {
        if (this.peerConnection) {
            try { this.peerConnection.close(); } catch (e) {}
        }
        this.peerConnection = new RTCPeerConnection(this.configuration);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.room) {
                this.socket.emit('ice_candidate', {
                    candidate: event.candidate,
                    roomId: this.room
                });
            }
        };

        this.peerConnection.ontrack = (event) => {
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        this.peerConnection.onconnectionstatechange = () => {
            const conn = document.getElementById('connectionStatus');
            if (conn) {
                if (this.peerConnection.connectionState === 'connected') {
                    conn.innerHTML = '<i class="fas fa-check-circle"></i> Connected (Peer)';
                    conn.className = 'status-value connected';
                }
            }
        };
    }

    async createAndSendOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('offer', { offer: offer, roomId: this.room });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }
}

// Global instance
window.webRTC = new WebRTCHandler();
