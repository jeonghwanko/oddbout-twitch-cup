import current from './native-city-current-building-art.json';
import shared from './native-city-shared-building-art.json';

/** Old logical paths always load adopted artwork, even in retained scene adapters. */
export function currentCityBuildingAssetPath(path:string):string {
 const adopted=(current.redirects as Readonly<Record<string,string>>)[path]??path;
 return (shared as Readonly<Record<string,{path:string}>>)[adopted]?.path??adopted;
}
