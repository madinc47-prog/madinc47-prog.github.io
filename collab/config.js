/* Collab config — Emmanuel: paste your Supabase Project URL + anon public key (see SETUP.md).
   Empty = page shows "Setup pending". Never paste the service_role key here.
   iceServers: STUN is free. A TURN entry is REQUIRED before Collab Room launches (calls fail on some mobile/
   carrier networks without it). Paste the TURN entries from Cloudflare or Metered (see SETUP.md). */
window.COLLAB_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }
    // , { urls: ["turn:…:3478?transport=udp","turn:…:443?transport=tcp","turns:…:443?transport=tcp"], username: "…", credential: "…" }
  ]
};
