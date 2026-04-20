/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app() {
    return {
      name: "chartdb",
      home: "aws",
      removal: "remove",
      protect: false,
      providers: { cloudflare: "6.14.0", aws: "7.26.0" },
    };
  },
  async run() {
    const appDomain = "chartdb.nemiah.app";
    const site = new sst.aws.StaticSite("ChartDBSite", {
      path: ".",
      build: {
        command: "npm run build",
        output: "dist",
      },
      domain: {
        name: appDomain,
        dns: sst.cloudflare.dns({transform: {
            record: (record) => {
                if (record.name === appDomain && record.type === "CNAME") {
                    // We proxy because *.nemiah.app is protected by Zero Trust, internal Google Workspace account is required.
                    record.proxied = true;
                }
            }
        }}),
      },
      errorPage: "index.html",
      invalidation: {
        paths: "all",
        wait: true,
      },
    });
    return {
      url: site.url,
    };
  },
});
