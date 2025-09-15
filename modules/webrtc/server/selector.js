// modules/webrtc/server/selector.js
// For now, always export the vanilla server init.
// Later, switch based on env/config to export LiveKit's.

export { WEBRTC__initServer } from './init.js';
// If/when LiveKit server is added:
// export { WEBRTC__initServer } from '../../webrtc_livekit/server/init.js';
