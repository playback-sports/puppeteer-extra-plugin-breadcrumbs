import os from 'os';
import fs from 'fs';
import path from 'path';
import copy from 'recursive-copy';
import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';

import { Browser, ConnectOptions, LaunchOptions, Page, Target } from 'puppeteer';

export type PluginOptions = {
    diskPath: string;
    tmpDir: string;
};

/**
 * A puppeteer plugin that leaves a trail of HTML page breadcrumbs
 */
export class PuppeteerExtraPluginBreadcrumbs extends PuppeteerExtraPlugin {
    constructor(opts: Partial<PluginOptions>) {
        super(opts);
        this.debug('Initialized', this.opts);
    }

    get name() {
        return 'breadcrumbs';
    }

    get defaults(): PluginOptions {
        return {
            diskPath: '',
            tmpDir: path.join(os.tmpdir(), 'pptr-breadcrumbs'),
        };
    }

    get opts(): PluginOptions {
        return super.opts as PluginOptions;
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

        page.on('load', async () => {
            await this.writePageMHTMLToTempDisk(page);
        });
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

        fs.rmSync(pageDir, { recursive: true, force: true });
    }

    async onBrowser(browser: Browser) {
        this.debug('onBrowser');
    }

    async onDisconnected(): Promise<void> {
        this.debug('onDisconnected');
    }

    private getPageTempPath(page: Page) {
        const targetID = page.target()._targetId;
        return path.join(this.opts.tmpDir, targetID);
    }

    private async writePageMHTMLToTempDisk(page: Page) {
        const targetID = page.target()._targetId;
        console.log('writePageMHTMLToTempDisk', targetID);
        const url = page.url();
        const u = new URL(url);

        const cdp = await page.target().createCDPSession();
        const { data: mhtmlData } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
        await cdp.detach();

        const pageDir = path.join(this.opts.tmpDir, targetID);
        if (!fs.existsSync(pageDir)) {
            fs.mkdirSync(pageDir);
        }
        const d = new Date();
        const urlPathName = u.pathname.replace(/\//g, '_');
        console.log('urlPathName', urlPathName, typeof urlPathName);
        const fileName = `${d.toISOString()}_${u.hostname}${urlPathName}.mhtml`;
        const htmlFilePath = path.join(pageDir, fileName);
        fs.writeFileSync(htmlFilePath, mhtmlData);
    }
}

const defaultExport = (options?: Partial<PluginOptions>) => {
    return new PuppeteerExtraPluginBreadcrumbs(options || {});
};

export default defaultExport;
