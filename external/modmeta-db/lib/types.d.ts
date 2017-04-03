export interface IReference {
    fileMD5?: string;
    modId?: string;
    versionMatch?: string;
    logicalFileName?: string;
    fileExpression?: string;
}
export declare type RuleType = 'before' | 'after' | 'requires' | 'conflicts' | 'recommends' | 'provides';
export interface IRule {
    type: RuleType;
    reference: IReference;
    comment?: string;
}
export interface IModInfo {
    modId: string;
    modName: string;
    fileName: string;
    fileCategory: string;
    isPrimary: boolean;
    fileSizeBytes: number;
    gameId: string;
    logicalFileName?: string;
    fileVersion: string;
    fileMD5: string;
    fileId: string;
    sourceURI: any;
    rules?: IRule[];
    expires?: number;
    uploadedTimestamp: number;
    changelogHtml: string;
    details?: {
        homepage?: string;
        category?: string;
        description?: string;
        author?: string;
    };
}
export interface ILookupResult {
    key: string;
    value: IModInfo;
}
export interface IHashResult {
    md5sum: string;
    numBytes: number;
}
