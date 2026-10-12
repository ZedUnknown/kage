/**
 * Architecture rules, checked by `npm run check:boundaries`.
 *
 * Layout:  src/modules/<module>/{domain,application,infrastructure}, index.ts = public API
 *          src/shared   cross-cutting building blocks (config, clock, db)
 *          src/http     request plumbing for route handlers
 *          src/app      Next.js routes and UI
 *          src/container.ts   composition root
 */

const MODULE = "^src/modules/([^/]+)/";
const ANY_MODULE = "^src/modules/";
const MODULE_INTERNALS = "^src/modules/[^/]+/(?!index\\.ts$).+";
// npm packages are matched on their resolved path inside node_modules.
const DB_DRIVERS = "^node_modules/(drizzle-orm|pg|mqtt|jose|@electric-sql/pglite)/";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---- module boundaries -------------------------------------------------
    {
      name: "module-internals-are-private",
      comment:
        "Code outside a module may only import the module's index.ts, never its domain, application or infrastructure files.",
      severity: "error",
      from: { pathNot: `${MODULE}|^src/testing/` },
      to: { path: MODULE_INTERNALS },
    },
    {
      name: "no-reaching-into-other-modules",
      comment: "A module may use another module only through that module's index.ts.",
      severity: "error",
      from: { path: MODULE },
      to: { path: MODULE_INTERNALS, pathNot: "^src/modules/$1/" },
    },
    {
      name: "module-dependency-direction",
      comment:
        "devices, audit and messaging are leaf modules and depend on no other module.",
      severity: "error",
      from: { path: "^src/modules/(devices|audit|messaging)/" },
      to: { path: ANY_MODULE, pathNot: "^src/modules/$1/" },
    },
    {
      name: "identity-may-only-use-devices",
      severity: "error",
      from: { path: "^src/modules/identity/" },
      to: { path: "^src/modules/(actions|messaging|audit|admin)/" },
    },
    {
      name: "actions-may-not-use-identity-or-admin",
      severity: "error",
      from: { path: "^src/modules/actions/" },
      to: { path: "^src/modules/(identity|admin)/" },
    },
    {
      name: "nothing-depends-on-admin",
      comment: "admin composes the other modules; none of them may call back into it.",
      severity: "error",
      from: { path: ANY_MODULE, pathNot: "^src/modules/admin/" },
      to: { path: "^src/modules/admin/" },
    },

    // ---- layering inside a module -----------------------------------------
    {
      name: "domain-is-pure",
      comment:
        "Domain code holds business rules only: no application or infrastructure code, no framework or driver packages.",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain/", pathNot: "\\.test\\.ts$" },
      to: {
        path: "^src/modules/[^/]+/(application|infrastructure)/|^src/shared/db|^src/shared/config",
      },
    },
    {
      name: "domain-has-no-packages",
      severity: "error",
      from: { path: "^src/modules/[^/]+/domain/", pathNot: "\\.test\\.ts$" },
      to: { path: "^node_modules/(drizzle-orm|pg|mqtt|jose|next|react|react-dom|zod)/" },
    },
    {
      name: "application-does-not-know-infrastructure",
      comment: "Services depend on ports (interfaces); the module's index.ts wires the implementation.",
      severity: "error",
      from: { path: "^src/modules/[^/]+/application/" },
      to: { path: "^src/modules/[^/]+/infrastructure/" },
    },
    {
      name: "database-and-broker-drivers-stay-in-infrastructure",
      comment: "Only infrastructure code (and the shared db helpers) may import drizzle, pg, mqtt or jose.",
      severity: "error",
      from: {
        pathNot: "^src/modules/[^/]+/infrastructure/|^src/shared/db/|^src/testing/|\\.test\\.ts$|^drizzle\\.config",
      },
      to: { path: DB_DRIVERS },
    },

    // ---- outer layers ------------------------------------------------------
    {
      name: "shared-is-independent",
      comment: "shared/ is a leaf: it must not import modules, http, app or the container.",
      severity: "error",
      from: { path: "^src/shared/" },
      to: { path: "^src/(modules|http|app|container)" },
    },
    {
      name: "routes-use-the-container-and-http-helpers",
      comment:
        "Route handlers are thin controllers: they call services through the container and may not import modules or the database directly.",
      severity: "error",
      from: { path: "^src/app/api/" },
      to: { path: "^src/(modules|shared/db)" },
    },
    {
      name: "client-code-stays-out-of-the-server",
      comment: "UI files must not import server-side code.",
      severity: "error",
      from: { path: "^src/app/", pathNot: "^src/app/api/" },
      to: { path: "^src/(modules|shared|http|container)" },
    },
    {
      name: "http-layer-uses-modules-through-the-container",
      severity: "error",
      from: { path: "^src/http/" },
      to: { path: "^src/modules/" },
    },
    {
      name: "testing-helpers-are-for-tests",
      severity: "error",
      from: { path: "^src/", pathNot: "^src/testing/|\\.test\\.ts$" },
      to: { path: "^src/testing/" },
    },

    // ---- hygiene -----------------------------------------------------------
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)\\.[^/]+\\.(c|m)?js$",
          "^src/app/(layout|page)\\.tsx$",
          "^src/app/api/",
          "\\.test\\.ts$",
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "^src/app/(globals\\.css|favicon\\.ico)$" },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
