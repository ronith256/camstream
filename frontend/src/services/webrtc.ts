// frontend/src/services/webrtc.ts
import { API_BASE_URL } from './api';

export interface RTCSessionDescription {
  type: RTCSdpType;
  sdp: string;
}

export interface RTCIceCandidateInit {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface WebRTCSession {
  id: string;
}

// Connection state type
type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed' | 'closed';

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private sessionId: string | null = null;
  private stream: MediaStream | null = null;
  private connectionState: ConnectionState = 'new';
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private connectionLock = Promise.resolve();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private isReconnecting = false;
  private recoveryMode = false;
  private mediaOperationInProgress = false;
  private eventHandlers: {[key: string]: Array<(data?: any) => void>} = {};
  
  // Debug mode
  private debug = true;

  constructor() {
    // No early initialization - wait for explicit initialize call
  }

  // Logging helper
  private log(...args: any[]) {
    if (this.debug) {
      console.log('[WebRTC]', ...args);
    }
  }

  // Error logging helper
  private error(...args: any[]) {
    console.error('[WebRTC ERROR]', ...args);
  }

  // Event system
  public on(event: string, callback: (data?: any) => void) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
    
    return () => {
      if (this.eventHandlers[event]) {
        this.eventHandlers[event] = this.eventHandlers[event].filter(cb => cb !== callback);
      }
    };
  }

  private emit(event: string, data?: any) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          this.error('Error in event handler', e);
        }
      });
    }
  }

  // Connection state management
  private updateConnectionState(state: ConnectionState) {
    if (this.connectionState !== state) {
      this.log(`Connection state changed: ${this.connectionState} -> ${state}`);
      this.connectionState = state;
      this.emit('connectionStateChange', state);
    }
  }

  // Connection lock to prevent concurrent operations
  private async withConnectionLock<T>(operation: () => Promise<T>): Promise<T> {
    const unlock = await this.connectionLock.then(() => {
      const resolver: { resolve?: () => void } = {};
      const newLock = new Promise<void>(resolve => {
        resolver.resolve = resolve;
      });
      this.connectionLock = newLock;
      return resolver.resolve!;
    });

    try {
      return await operation();
    } finally {
      unlock();
    }
  }

  // Create a fresh peer connection
  private createPeerConnection() {
    if (this.peerConnection) {
      this.cleanupPeerConnection();
    }

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10
    };

    this.peerConnection = new RTCPeerConnection(configuration);
    this.setupEventHandlers();
    return this.peerConnection;
  }

  // Set up all event handlers for the peer connection
  private setupEventHandlers() {
    if (!this.peerConnection) return;

    this.peerConnection.ontrack = this.handleTrack.bind(this);
    this.peerConnection.onicecandidate = this.handleIceCandidate.bind(this);
    this.peerConnection.onconnectionstatechange = this.handleConnectionStateChange.bind(this);
    this.peerConnection.oniceconnectionstatechange = this.handleIceConnectionStateChange.bind(this);
    this.peerConnection.onicegatheringstatechange = this.handleIceGatheringStateChange.bind(this);
    this.peerConnection.onsignalingstatechange = this.handleSignalingStateChange.bind(this);
    this.peerConnection.onicecandidateerror = this.handleIceCandidateError.bind(this);
  }

  // Event handler for incoming tracks
  private handleTrack(event: RTCTrackEvent) {
    this.log('Received remote track', event);
    if (event.streams && event.streams[0]) {
      this.stream = event.streams[0];
      
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        this.videoElement.play().catch(e => {
          this.error('Error playing video:', e);
        });
      }
      
      this.emit('track', event);
    }
  }

  // Event handler for ICE candidates
  private handleIceCandidate(event: RTCPeerConnectionIceEvent) {
    if (event.candidate) {
      this.log('Generated ICE candidate', event.candidate);
      this.sendIceCandidate({
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
        usernameFragment: event.candidate.usernameFragment
      });
    } else {
      this.log('ICE candidates gathering complete');
    }
  }

  // Event handler for ICE candidate errors
  private handleIceCandidateError(event: any) {
    this.error('ICE candidate error:', event);
  }

  // Event handler for connection state changes
  private handleConnectionStateChange() {
    if (!this.peerConnection) return;
    
    this.log(`Connection state: ${this.peerConnection.connectionState}`);
    
    switch (this.peerConnection.connectionState) {
      case 'connected':
        this.handleConnected();
        break;
      case 'disconnected':
        this.handleDisconnected();
        break;
      case 'failed':
        this.handleFailed();
        break;
      case 'closed':
        this.handleClosed();
        break;
    }
  }

  // Event handler for ICE connection state changes
  private handleIceConnectionStateChange() {
    if (!this.peerConnection) return;
    
    this.log(`ICE connection state: ${this.peerConnection.iceConnectionState}`);
    
    switch (this.peerConnection.iceConnectionState) {
      case 'connected':
      case 'completed':
        // Ensure our state is connected
        if (this.connectionState !== 'connected') {
          this.updateConnectionState('connected');
          this.emit('connected');
        }
        break;
      case 'disconnected':
        if (!this.mediaOperationInProgress) {
          this.updateConnectionState('disconnected');
        } else {
          this.log('Media operation in progress, ignoring temporary disconnect');
        }
        break;
      case 'failed':
        if (!this.mediaOperationInProgress) {
          this.updateConnectionState('failed');
          this.scheduleReconnect();
        } else {
          this.log('Media operation in progress, ignoring temporary failure');
          this.recoveryMode = true;
        }
        break;
    }
  }

  // Event handler for ICE gathering state changes
  private handleIceGatheringStateChange() {
    if (!this.peerConnection) return;
    this.log(`ICE gathering state: ${this.peerConnection.iceGatheringState}`);
  }

  // Event handler for signaling state changes
  private handleSignalingStateChange() {
    if (!this.peerConnection) return;
    this.log(`Signaling state: ${this.peerConnection.signalingState}`);
  }

  // Handler for connected state
  private handleConnected() {
    this.log('Connection established successfully');
    this.updateConnectionState('connected');
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.recoveryMode = false;
    this.emit('connected');
    
    // Check if we need to recover from a media operation
    if (this.mediaOperationInProgress) {
      this.log('Connection recovered during media operation');
    }
  }

  // Handler for disconnected state
  private handleDisconnected() {
    this.log('Connection temporarily disconnected');
    
    if (!this.mediaOperationInProgress) {
      this.updateConnectionState('disconnected');
      
      // Wait a short time before considering a reconnect
      setTimeout(() => {
        if (this.peerConnection?.connectionState === 'disconnected') {
          this.scheduleReconnect();
        }
      }, 3000);
    } else {
      this.log('Media operation in progress, treating as temporary');
      this.recoveryMode = true;
    }
  }

  // Handler for failed state
  private handleFailed() {
    this.error('Connection failed');
    
    if (!this.mediaOperationInProgress) {
      this.updateConnectionState('failed');
      this.scheduleReconnect();
    } else {
      this.log('Media operation in progress, will attempt recovery');
      this.recoveryMode = true;
    }
  }

  // Handler for closed state
  private handleClosed() {
    this.log('Connection closed');
    this.updateConnectionState('closed');
  }

  // Schedule a reconnection attempt with exponential backoff
  private scheduleReconnect() {
    if (this.isReconnecting || this.reconnectTimer !== null) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.log(`Reached maximum reconnect attempts (${this.maxReconnectAttempts})`);
      this.updateConnectionState('failed');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    this.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.updateConnectionState('reconnecting');
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptReconnect();
    }, delay);
  }

  // Attempt to reconnect
  private async attemptReconnect() {
    this.log(`Executing reconnect attempt ${this.reconnectAttempts}`);
    
    try {
      // Preserve session ID for reconnection
      const oldSessionId = this.sessionId;
      
      // Clean up old connection but maintain the session
      this.cleanupPeerConnection();
      this.sessionId = oldSessionId;
      
      // Connect with the existing session ID
      await this.connect();
      
      this.log('Reconnection successful');
      this.isReconnecting = false;
    } catch (error) {
      this.error('Reconnection failed:', error);
      
      // Schedule another reconnect attempt
      this.scheduleReconnect();
    }
  }

  // Clean up peer connection without fully disconnecting
  private cleanupPeerConnection() {
    this.log('Cleaning up peer connection');

    // Stop all transceivers
    if (this.peerConnection) {
      const transceivers = this.peerConnection.getTransceivers();
      transceivers.forEach(transceiver => {
        try {
          if (transceiver.stop) {
            transceiver.stop();
          }
        } catch (e) {
          this.error('Error stopping transceiver:', e);
        }
      });
    }
    
    // Clear track references but don't stop the remote stream
    if (this.videoElement && this.videoElement.srcObject) {
      try {
        // Just clear the srcObject reference, don't stop the tracks
        this.videoElement.srcObject = null;
      } catch (e) {
        this.error('Error clearing video element:', e);
      }
    }

    // Close the peer connection
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {
        this.error('Error closing peer connection:', e);
      }
      this.peerConnection = null;
    }
  }

  // Full cleanup including stream
  private cleanupConnection() {
    this.log('Full connection cleanup');
    
    // Stop media tracks
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            this.error('Error stopping track:', e);
          }
        });
      } catch (e) {
        this.error('Error stopping stream tracks:', e);
      }
      this.stream = null;
    }

    // Clean up peer connection
    this.cleanupPeerConnection();
    
    // Clear session ID for a full disconnect
    this.sessionId = null;
    
    // Clear pending candidates
    this.pendingCandidates = [];
    
    // Reset reconnection state
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // Initialize with video element
  public async initialize(videoElement: HTMLVideoElement) {
    return this.withConnectionLock(async () => {
      this.log('Initializing WebRTC service');
      this.videoElement = videoElement;
      
      // Don't create peer connection yet - wait for connect call
    });
  }

  // Begin a media operation - this will set a flag to handle connection interruptions differently
  public beginMediaOperation() {
    this.log('Beginning media operation');
    this.mediaOperationInProgress = true;
  }

  // End a media operation
  public endMediaOperation() {
    this.log('Ending media operation');
    this.mediaOperationInProgress = false;
    
    // Check if we need to recover the connection
    if (this.recoveryMode) {
      this.log('In recovery mode, attempting reconnection');
      this.recoveryMode = false;
      setTimeout(() => this.attemptReconnect(), 500);
    }
  }

  // Get current connection state
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  // Create and send WebRTC offer, handle answer
  public async connect(): Promise<void> {
    return this.withConnectionLock(async () => {
      if (this.connectionState === 'connected') {
        this.log('Already connected');
        return;
      }

      if (this.connectionState === 'connecting') {
        this.log('Connection already in progress');
        return;
      }

      this.log('Starting connection process');
      this.updateConnectionState('connecting');
      
      try {
        // Create peer connection
        const pc = this.createPeerConnection();

        // Create offer
        this.log('Creating offer');
        const offer = await pc.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });

        // Set local description
        this.log('Setting local description');
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering to complete or timeout after 2 seconds
        await Promise.race([
          new Promise<void>(resolve => {
            const checkState = () => {
              if (!pc.localDescription) {
                setTimeout(checkState, 100);
                return;
              }
              
              if (pc.iceGatheringState === 'complete') {
                resolve();
              } else {
                setTimeout(checkState, 100);
              }
            };
            checkState();
          }),
          new Promise<void>(resolve => setTimeout(resolve, 2000))
        ]);

        // Send offer to server
        this.log('Sending offer to server');
        const response = await fetch(`${API_BASE_URL}/webrtc/offer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session: { id: this.sessionId || undefined },
            offer: {
              type: pc.localDescription?.type || offer.type,
              sdp: pc.localDescription?.sdp || offer.sdp,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Server rejected offer: ${response.status}`);
        }

        // Parse response
        const data = await response.json();
        
        // Store session ID
        if (data.session_id) {
          this.sessionId = data.session_id;
          this.log(`Received session ID: ${this.sessionId}`);
        }

        // Set remote description (server's answer)
        this.log('Setting remote description (answer)');
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: data.type,
          sdp: data.sdp
        }));

        // Send any pending ICE candidates
        if (this.pendingCandidates.length > 0 && this.sessionId) {
          this.log(`Sending ${this.pendingCandidates.length} pending ICE candidates`);
          for (const candidate of this.pendingCandidates) {
            await this.sendIceCandidate(candidate);
          }
          this.pendingCandidates = [];
        }

        // Connection will be marked as connected via event handlers
        this.log('WebRTC connection process complete');
      } catch (error) {
        this.error('Error establishing connection:', error);
        this.updateConnectionState('failed');
        
        if (!this.mediaOperationInProgress) {
          // Clean up and prepare for reconnect
          this.cleanupPeerConnection();
          this.scheduleReconnect();
        } else {
          this.log('Media operation in progress, setting recovery mode');
          this.recoveryMode = true;
        }
        
        throw error;
      }
    });
  }

  // Send ICE candidate to server
  private async sendIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    // If no session ID yet, store the candidate for later
    if (!this.sessionId) {
      this.log('No session ID yet, storing candidate for later');
      this.pendingCandidates.push(candidate);
      return;
    }

    try {
      this.log('Sending ICE candidate to server');
      const response = await fetch(`${API_BASE_URL}/webrtc/icecandidate/${this.sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(candidate),
      });

      if (!response.ok) {
        this.error(`Failed to send ICE candidate: ${response.status}`);
      } else {
        this.log('ICE candidate sent successfully');
      }
    } catch (error) {
      this.error('Error sending ICE candidate:', error);
      // Don't rethrow, just log the error
    }
  }

  // Disconnect from server
  public async disconnect(): Promise<void> {
    return this.withConnectionLock(async () => {
      if (this.connectionState === 'closed' || this.connectionState === 'new') {
        this.log('Already disconnected');
        return;
      }

      this.log('Disconnecting WebRTC connection');
      
      try {
        // Close session on server
        if (this.sessionId) {
          this.log(`Closing session ${this.sessionId} on server`);
          
          try {
            await fetch(`${API_BASE_URL}/webrtc/session/${this.sessionId}`, {
              method: 'DELETE',
            });
          } catch (error) {
            this.error('Error closing session on server:', error);
            // Continue with local cleanup even if server cleanup fails
          }
        }
        
        // Full cleanup
        this.cleanupConnection();
        this.updateConnectionState('closed');
        
        this.log('Disconnected successfully');
      } catch (error) {
        this.error('Error during disconnect:', error);
        // Still mark as disconnected even if there were errors
        this.updateConnectionState('closed');
        this.cleanupConnection();
      }
    });
  }

  // Is the connection currently active?
  public isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  // Is there a media operation in progress?
  public isMediaOperationInProgress(): boolean {
    return this.mediaOperationInProgress;
  }
  
  // Force a reconnection (useful for troubleshooting)
  public async forceReconnect(): Promise<void> {
    return this.withConnectionLock(async () => {
      this.log('Forcing reconnection');
      
      // Preserve session ID
      const oldSessionId = this.sessionId;
      
      // Clean up but keep the session ID
      this.cleanupPeerConnection();
      this.sessionId = oldSessionId;
      
      // Reconnect
      await this.connect();
    });
  }
}

// Singleton instance
export const webRTCService = new WebRTCService();
export default webRTCService;