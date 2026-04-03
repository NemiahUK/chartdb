/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
    app() {
        return {
            name: 'chartdb',
            home: 'aws',
            removal: 'remove',
            protect: false,
        };
    },
    async run() {
        const site = new sst.aws.StaticSite('ChartDBSite', {
            path: '.',
            build: {
                command: 'npm run build',
                output: 'dist',
            },
            errorPage: 'index.html',
            invalidation: {
                paths: 'all',
                wait: true,
            },
        });

        return {
            url: site.url,
        };
    },
});
