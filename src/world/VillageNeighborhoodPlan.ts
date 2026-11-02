/** Ground, collision and assembly share the two residential compounds. */
export const VILLAGE_RESIDENTIAL_COURTS = [
 {id:"north-shared-court",points:[[35,188],[127,142],[337,227],[260,299],[130,257]]},
 {id:"south-laundry-court",points:[[27,652],[110,610],[288,699],[200,768],[71,710]]},
] as const;
export const VILLAGE_RESIDENTIAL_ROUTES = {
 residentialNorth:[[260,305],[260,286]],
 residentialSouth:[[20,555],[20,640],[55,672]],
} as const;
export const VILLAGE_RESIDENTIAL_SOLIDS = [
 {id:"north-house-west",points:[[28,162],[90,128],[152,162],[90,196]]},
 {id:"north-house-east",points:[[151,140],[215,107],[279,140],[215,179]]},
 {id:"south-house",points:[[42,626],[110,592],[178,626],[110,664]]},
 {id:"laundry-line",points:[[98,736],[196,710],[207,722],[108,754]]},
] as const;
export const VILLAGE_RESIDENTIAL_FURNITURE = [
 {centerX:218,centerY:244,radiusX:11,radiusY:7},
 {centerX:264,centerY:256,radiusX:23,radiusY:13},
 {centerX:204,centerY:755,radiusX:35,radiusY:18},
] as const;
