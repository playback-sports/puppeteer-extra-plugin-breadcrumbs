/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./puppeteer-mods.d.ts" />
// Warn: The above is EXTREMELY important for our custom page mods to be recognized by the end users typescript!

export type BreadcrumbsPluginPageAdditions = {
    breadcrumb: (name: string) => Promise<void>;
};

export interface PluginOptions {
    onPageLoad: boolean;
    diskPath: string;
    tmpDir: string;
    gcsBucket: string;
}
