/// <reference path="./.sst/platform/config.d.ts" />

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((value, part) => value * 256 + Number(part), 0);
}

function ipv4CidrToRange(cidr: string) {
  const [ip, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  const size = 2 ** (32 - prefix);
  const start = Math.floor(ipv4ToInt(ip) / size) * size;

  return [start, start + size - 1];
}

function ipv6ToBigInt(ip: string) {
  const halves = ip.toLowerCase().split("::");
  if (halves.length > 2) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const fill = new Array(ip.includes("::") ? 8 - head.length - tail.length : 0).fill("0");
  const parts = head.concat(fill, tail);

  if (parts.length !== 8) {
    throw new Error(`Invalid IPv6 address: ${ip}`);
  }

  return parts.reduce((value, part) => (value << 16n) + BigInt(parseInt(part || "0", 16)), 0n);
}

function expandIpv6CidrTo32Prefixes(cidr: string) {
  const [ip, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  if (prefix > 32) {
    throw new Error(`Unsupported IPv6 prefix length for CloudFront Function compression: ${cidr}`);
  }

  const start32 = Number(ipv6ToBigInt(ip) >> 96n);
  const blockCount = 2 ** (32 - prefix);
  const networkStart = Math.floor(start32 / blockCount) * blockCount;

  return Array.from({ length: blockCount }, (_, index) =>
    (networkStart + index).toString(16).padStart(8, "0")
  );
}

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
    const cloudflareIpsResponse = await fetch("https://api.cloudflare.com/client/v4/ips");

    if (!cloudflareIpsResponse.ok) {
      throw new Error(
        `Failed to fetch Cloudflare IP ranges: ${cloudflareIpsResponse.status} ${cloudflareIpsResponse.statusText}`
      );
    }

    const cloudflareIps = (await cloudflareIpsResponse.json()) as {
      result: {
        ipv4_cidrs: string[];
        ipv6_cidrs: string[];
      };
    };

    const cloudflareIpv4Ranges = JSON.stringify(
      cloudflareIps.result.ipv4_cidrs.flatMap(ipv4CidrToRange)
    );
    const cloudflareIpv6Prefixes = JSON.stringify(
      `|${cloudflareIps.result.ipv6_cidrs
        .flatMap(expandIpv6CidrTo32Prefixes)
        .join("|")}|`
    );
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
                    record.ttl = 1; // Auto
                }
            }
        }}),
      },
      edge: {
        // This is a temporary hack to restrict access to Cloudflare IPs and confirm the presence of the CF Access JWT header before allowing access to the site.
        // This is necessary because the site is protected by Cloudflare Access and we want to prevent direct access to the CloudFront distribution.
        // Need to move this to Lambda@Edge in the future where we can do full RS256
        viewerRequest: {
            injection: $interpolate`
            const v4 = ${cloudflareIpv4Ranges};
            const v6 = ${cloudflareIpv6Prefixes};
            function p4(ip){let p=ip.split(".");if(p.length!==4)return;return (((+p[0])*256+ +p[1])*256+ +p[2])*256+ +p[3]}
            function p6(ip){let x=ip.toLowerCase().split("::"),a=x[0]?x[0].split(":"):[],b=x[1]?x[1].split(":"):[];if(x.length>2)return;let m=8-a.length-b.length;if((x.length===2&&m<1)||(x.length===1&&m))return;a=a.concat(Array(x.length===2?m:0).fill("0"),b);return ("0000"+a[0]).slice(-4)+("0000"+a[1]).slice(-4)}
            function ok(ip){if(ip.indexOf(".")>-1){let n=p4(ip);if(n==null)return 0;for(let i=0;i<v4.length;i+=2)if(n>=v4[i]&&n<=v4[i+1])return 1;return 0}let s=p6(ip);return !!s&&v6.indexOf("|"+s+"|")>-1}

                if (!event.request.headers["cf-access-jwt-assertion"]) {
              return {statusCode: 403, statusDescription: "Forbidden", body: "CFJWT: Forbidden"};
                }

            if (!ok(event.viewer.ip)) {
              return {statusCode: 403, statusDescription: "Forbidden", body: "CFIP: Forbidden"};
            }
            `
        }
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
