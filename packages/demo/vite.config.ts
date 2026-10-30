import { viteStaticCopy } from "vite-plugin-static-copy";
import type { Plugin } from "vite";

/**
 * The engine bundles are re-emitted whenever packages/*\/dist changes, so they
 * must never be served from a cache. A stale copy is indistinguishable from a
 * broken build in the browser (the classic scripts fail to define their
 * globals and the app never boots).
 */
function noStoreEngineBundles(): Plugin {
  return {
    name: "no-store-engine-bundles",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (/^\/(scramjet|controller)\//.test(url)) {
          res.setHeader("Cache-Control", "no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
        next();
      });
    },
  };
}

export default {
  plugins: [
    noStoreEngineBundles(),
    viteStaticCopy({
      structured: false,
      targets: [
        {
          src: "node_modules/@mercuryworkshop/scramjet/dist/*",
          dest: "scramjet",
        },
        {
          src: "node_modules/@mercuryworkshop/scramjet-controller/dist/*",
          dest: "controller",
        },
      ],
      watch: {
        reloadPageOnChange: true,
      },
    }),
  ],
};
