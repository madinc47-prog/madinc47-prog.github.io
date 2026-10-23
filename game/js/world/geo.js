// Geo helpers: lat/lon <-> local meters. Origin = Roseau (15.3, -61.388). x east, z south.
export const ORIGIN = [15.3, -61.388];
const K = 111320, KX = K * Math.cos(ORIGIN[0] * Math.PI / 180);
export const toXZ = (lat, lon) => [(lon - ORIGIN[1]) * KX, -(lat - ORIGIN[0]) * K];
// Terrain heightmap bbox (AWS Terrain Tiles, terrarium z12 -> 512 px wide)
export const TBOX = { n: 15.66, w: -61.50, s: 15.19, e: -61.23 };
export const T0 = toXZ(TBOX.n, TBOX.w), T1 = toXZ(TBOX.s, TBOX.e);
