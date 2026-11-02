/** Public package shape; the runtime validator checks incoming manifests before use. */
export type FighterManifest = {
    "schemaVersion": number;
    "specVersion": string;
    "localId": string;
    "profile": {
        "name": string;
        "description": string;
        "language": string;
        "concept": string;
        "moves": {
            "combo": {
                "name": string;
                "description": string;
            };
            "slam": {
                "name": string;
                "description": string;
            };
            "dash": {
                "name": string;
                "description": string;
            };
            "block": {
                "name": string;
                "description": string;
            };
        };
        "portrait": {
            "assetId": string;
            "crop": {
                "x": number;
                "y": number;
                "width": number;
                "height": number;
            };
        };
        "preview": {
            "assetId": string;
            "crop": {
                "x": number;
                "y": number;
                "width": number;
                "height": number;
            };
        };
    };
    "combat": {
        "kitId": string;
        "stats": {
            "power": number;
            "toughness": number;
            "speed": number;
        };
    };
    "appearance": {
        "projection": string;
        "elevationDegrees": number;
        "sourceFacing": string;
        "leftFacing": string;
        "bodyHeight": number;
        "bodyScale": number;
    };
    "assets": ({
        "id": string;
        "path": string;
        "mediaType": string;
        "sha256": string;
        "bytes": number;
        "width": number;
        "height": number;
    })[];
    "clips": {
        "idle": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "durationMs": number;
        };
        "walk": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "durationMs": number;
            "stridePixels": number;
        };
        "run": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "durationMs": number;
        };
        "fightIdle": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": never[];
        };
        "combo": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": (number)[];
            "landmarks": {
                "spinStart": number;
            };
        };
        "slam": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": (number)[];
        };
        "dash": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": never[];
            "landmarks": {
                "windup": {
                    "clip": string;
                    "frame": number;
                };
                "recover": {
                    "clip": string;
                    "frame": number;
                };
            };
        };
        "block": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": (number)[];
        };
        "hit": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": (number)[];
            "landmarks": {
                "recoil": number;
                "stagger": (number)[];
                "recover": (number)[];
            };
        };
        "groggy": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": never[];
        };
        "fall": {
            "assetId": string;
            "frameWidth": number;
            "frameHeight": number;
            "columns": number;
            "rows": number;
            "frames": (number)[];
            "origins": ({
                "originX": number;
                "originY": number;
                "groundContacts": never[];
            })[];
            "loop": boolean;
            "sequence": ({
                "frame": number;
                "durationMs": number;
            })[];
            "hitSequenceIndices": (number)[];
            "landmarks": {
                "lieSequenceIndex": number;
                "getUp": ({
                    "clip": string;
                    "frame": number;
                    "durationMs": number;
                })[];
            };
        };
    };
};
