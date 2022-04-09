import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';

import { Browser, ConnectOptions, LaunchOptions, Page, Target } from 'puppeteer';

export type PluginOptions = {
    diskPath: string;
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
            diskPath: './',
        };
    }

    get opts(): PluginOptions {
        return super.opts as any;
    }

    async onPluginRegistered(): Promise<void> {
        this.debug('onPluginRegistered');
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
        // Make sure we can run our content script
        await page.setBypassCSP(true);

        page.on('frameattached', (frame) => {
            if (!frame) return;
            this.debug('on frameattached');
        });

        page.on('framenavigated', (frame) => {
            if (!frame) return;
            this.debug('on framenavigated');
        });

        page.on('framedetached', (frame) => {
            if (!frame) return;
            this.debug('on framedetached');
        });

        page.on('load', () => {
            this.debug('page load');
        });

        page.on('domcontentloaded', () => {
            this.debug('page domcontentloaded');
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
    }

    async onBrowser(browser: Browser) {
        const pages = await browser.pages();
        for (const page of pages) {
            //   this._addCustomMethods(page);
            for (const frame of page.mainFrame().childFrames()) {
                // this._addCustomMethods(frame);
            }
        }
    }

    async onDisconnected(): Promise<void> {
        this.debug('onDisconnected');
    }
}

const defaultExport = (options?: Partial<PluginOptions>) => {
    return new PuppeteerExtraPluginBreadcrumbs(options || {});
};

export default defaultExport;
