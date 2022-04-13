import os from 'os';
import fs from 'fs';
import path from 'path';
import copy from 'recursive-copy';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { Storage } from '@google-cloud/storage';
import * as types from './types';

import { Browser, ConnectOptions, LaunchOptions, Page, Target } from 'puppeteer';

export type BreadcrumbInfo = {
    targetID: string;
    filename: string;
    customName: string;
    url: string;
    date: Date;
};

export const parseBreadcrumbInfoFilepath = (filepath: string): BreadcrumbInfo => {
    const pathSplit = filepath.split('/');
    if (pathSplit.length != 2) {
        throw new Error('breadcrumb filepath malformed');
    }

    const targetID = pathSplit[0];
    const filename = pathSplit[1];

    const split1 = filename.split(/§(.*)/s);
    if (split1.length < 2) {
        throw new Error('breadcrumb filename malformed');
    }

    const url = split1[1].replace(/§/g, '/');
    const split2 = split1[0].split(/_(.*)/s);

    if (!split2.length) {
        throw new Error('breadcrumb filename malformed');
    }
    let isoTime = split2[0];
    const date = new Date(isoTime);
    let customName = '';
    if (split2.length > 1) {
        customName = split2[1];
    }

    return {
        targetID,
        filename,
        customName,
        url,
        date,
    };
};

const convertUrlToFilename = (url: string): string => {
    const u = new URL(url);
    const urlPathName = u.pathname.replace(/\//g, '§');
    return urlPathName;
};

export const convertBreadcrumbInfoToFilepath = (
    targetID: string,
    date: Date,
    url: string,
    customName: string = ''
) => {
    const _customName = customName ? `_${customName}` : '';
    return path.join(
        targetID,
        `${date.toISOString()}${_customName}§${convertUrlToFilename(url)}.mhtml`
    );
};

/**
 * A puppeteer plugin that leaves a trail of HTML page breadcrumbs
 */
export class PuppeteerExtraPluginBreadcrumbs extends PuppeteerExtraPlugin {
    constructor(opts: Partial<types.PluginOptions>) {
        super(opts);
        this.debug('Initialized', this.opts);
    }

    get name() {
        return 'breadcrumbs';
    }

    get defaults(): types.PluginOptions {
        return {
            onPageLoad: false,
            diskPath: '',
            tmpDir: path.join(os.tmpdir(), 'pptr-breadcrumbs'),
            gcsBucket: '',
        };
    }

    get opts(): types.PluginOptions {
        return super.opts as types.PluginOptions;
    }

    async onPluginRegistered(): Promise<void> {
        this.debug('onPluginRegistered');
        if (!fs.existsSync(this.opts.tmpDir)) {
            this.debug('creating temp directory', this.opts.tmpDir);
            fs.mkdirSync(this.opts.tmpDir);
        }
    }

    async beforeLaunch(options: any): Promise<void> {
        this.debug('beforeconnect', options);
    }

    async afterLaunch(browser: Browser, opts?: { options: LaunchOptions }): Promise<void> {
        this.debug('afterLaunch', opts);
    }

    async beforeConnect(options: ConnectOptions): Promise<void> {
        this.debug('beforeconnect', options);
    }

    async afterConnect(browser: Browser, opts?: {}): Promise<void> {
        this.debug('afterConnect', opts);
    }

    async onPageCreated(page: Page) {
        this.debug('onPageCreated', page.url());
        this.addCustomMethods(page);

        if (this.opts.onPageLoad) {
            page.on('load', async () => {
                this.debug('onPageLoad', page.url());
                try {
                    await this.writePageMHTMLToTempDisk(page);
                } catch (e) {
                    console.log('caught err writePageMHTMLToTempDisk', e);
                }
            });
        }
    }

    async onTargetCreated(target: Target): Promise<void> {
        this.debug('onTargetCreated', target._targetId);
    }

    async onTargetChanged(target: Target): Promise<void> {
        this.debug('onTargetChanged', target._targetId);
    }

    async onTargetDestroyed(target: Target): Promise<void> {
        this.debug('onTargetDestroyed', target._targetId);
        const targetID = target._targetId;
        const pageDir = path.join(this.opts.tmpDir, targetID);

        if (!fs.existsSync(pageDir)) {
            this.debug('page directory does not exist for target', targetID);
            return;
        }

        if (this.opts.diskPath) {
            const results = await copy(pageDir, path.join(this.opts.diskPath, targetID));
            this.debug('Copied ' + results.length + ' files!');
        }

        if (this.opts.gcsBucket) {
            await this.uploadDirectoryToGCS(pageDir, this.opts.gcsBucket, targetID);
        }

        fs.rmSync(pageDir, { recursive: true, force: true });
    }

    async onBrowser(browser: Browser) {
        this.debug('onBrowser');
    }

    async onDisconnected(): Promise<void> {
        this.debug('onDisconnected');
    }

    async addBreadcrumb(page: Page, name: string = '') {
        this.debug('manual addBreadcrumb!');
        try {
            await this.writePageMHTMLToTempDisk(page, name);
        } catch (e) {
            this.debug('caught err writePageMHTMLToTempDisk', e);
        }
    }

    private addCustomMethods(prop: Page) {
        prop.addBreadcrumb = async () => this.addBreadcrumb(prop);
    }

    private async writePageMHTMLToTempDisk(page: Page, name: string = '') {
        const targetID = page.target()._targetId;
        console.log('writePageMHTMLToTempDisk', targetID);
        if (page.url() === 'blank') {
            return;
        }

        const cdp = await page.target().createCDPSession();
        const { data: mhtmlData } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
        await cdp.detach();

        const pageDir = path.join(this.opts.tmpDir, targetID);
        if (!fs.existsSync(pageDir)) {
            fs.mkdirSync(pageDir);
        }

        const d = new Date();
        const mhtmlFilePath = convertBreadcrumbInfoToFilepath(targetID, d, page.url(), name);
        fs.writeFileSync(path.join(this.opts.tmpDir, mhtmlFilePath), mhtmlData);
    }

    private uploadDirectoryToGCS = (
        directoryPath: string,
        bucketName: string,
        gcsOutputDir: string
    ) => {
        return new Promise((resolve, reject) => {
            const storage = new Storage();

            const getAllFiles = (dirPath: string, arrayOfFiles: string[] = []): string[] => {
                const files = fs.readdirSync(dirPath);
                files.forEach((file) => {
                    if (fs.statSync(dirPath + '/' + file).isDirectory()) {
                        arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles);
                    } else {
                        arrayOfFiles.push(path.join(dirPath, '/', file));
                    }
                });
                return arrayOfFiles;
            };

            const allFiles = getAllFiles(directoryPath);

            const uploadPromises = allFiles.map((filePath) => {
                let destination = path.join(gcsOutputDir, path.relative(directoryPath, filePath));
                // If running on Windows
                if (process.platform === 'win32') {
                    destination = destination.replace(/\\/g, '/');
                }

                let uploadOpts = {
                    destination: destination,
                    configPath: path.join(this.opts.tmpDir, 'node_gcs_upload.config'),
                };

                return storage.bucket(bucketName).upload(filePath, uploadOpts);
            });

            Promise.all(uploadPromises).then(resolve).catch(reject);
        });
    };
}

const defaultExport = (options: Partial<types.PluginOptions>): PuppeteerExtraPluginBreadcrumbs => {
    return new PuppeteerExtraPluginBreadcrumbs(options);
};

export default defaultExport;
