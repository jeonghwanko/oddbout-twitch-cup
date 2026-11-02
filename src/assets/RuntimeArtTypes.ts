export interface ImageAssetDefinition {
 readonly key: string;
 readonly path: string;
 readonly normalPath?: string;
}
export interface AsepriteAssetDefinition {
 readonly key: string;
 readonly path: string;
 readonly dataPath: string;
}
export interface SpriteSheetAssetDefinition {
 readonly key: string;
 readonly path: string;
 readonly frameWidth: number;
 readonly frameHeight: number;
 readonly columns: number;
 readonly rows: number;
}
