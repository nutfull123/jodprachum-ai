import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveBuildId() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 12);
  if (vercelSha) return vercelSha;

  const vercelDeploymentId = process.env.VERCEL_DEPLOYMENT_ID?.trim();
  if (vercelDeploymentId) return vercelDeploymentId;

  const explicitId = process.env.NEXT_PUBLIC_APP_BUILD_ID?.trim();
  if (explicitId) return explicitId;

  try {
    const gitSha = execSync("git rev-parse --short=12 HEAD", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (gitSha) return `git-${gitSha}`;
  } catch {
    // Fallback below if git is unavailable
  }

  return "release-2.2.0";
}

const buildId = resolveBuildId();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  env: {
    NEXT_PUBLIC_APP_BUILD_ID: buildId,
    NEXT_PUBLIC_APP_BUILT_AT: process.env.NEXT_PUBLIC_APP_BUILT_AT || "",
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, must-revalidate",
          },
        ],
      },
    ];
  },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        os: false,
      };
    }
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
