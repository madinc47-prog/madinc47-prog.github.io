/* Collab config — Emmanuel: paste your Supabase Project URL + anon public key (see SETUP.md).
   Empty = page shows "Setup pending". Never paste the service_role key here.
   iceServers: STUN is free. A TURN entry is REQUIRED before Collab Room launches (calls fail on some mobile/
   carrier networks without it). Paste the TURN entries from Cloudflare or Metered (see SETUP.md). */
window.COLLAB_CONFIG = {
  supabaseUrl: "https://eitgovoudisilagxtcju.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdGdvdm91ZGlzaWxhZ3h0Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODQwNzYsImV4cCI6MjEwODI2MDA3Nn0.abo42qymygzLyg-jbOHhcI883pa3GvSHSgAFLYLCUbc",
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }
    // , { urls: ["turn:…:3478?transport=udp","turn:…:443?transport=tcp","turns:…:443?transport=tcp"], username: "…", credential: "…" }
  ]
};
