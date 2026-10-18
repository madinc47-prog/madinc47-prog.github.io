# Video Studio
Browser video & movie editing suite. Green-screen keying reuses math from
/workspace/video-studio-spec/shaders/chroma_key.frag.glsl (YCbCr distance +
hue member + spill suppression), alpha_separable concepts (choke/feather),
and LOG/look formulas from VIDEO_STUDIO_SPEC.md §8.2/8.6, fused into one
WebGL2 shader for Android 10 tablet performance.
Lens profiles are inspired-by emulation, not official brand products.
