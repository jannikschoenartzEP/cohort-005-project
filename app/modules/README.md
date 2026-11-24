# Modules

Every folder under `app/modules/` is a **deep module**: a lot of behaviour behind a small interface. Its interface is its **entry points**, the files at the module root. Everything in a subfolder is hidden.

```
app/modules/
  <name>/
    index.ts          ← entry point (public). Import this from outside.
    index.server.ts   ← another entry point. A module may expose several.
    lib/              ← implementation: private, free to import each other.
    tests/            ← tests + fixtures (a subfolder, so private).
```

Copy `app/modules/example/` to start a new module.

**Import only through entry points.** Code outside a module (routes, components, `app/lib`, other modules) imports only that module's root files, never anything in its subfolders. Any subfolder is private, not just `lib/` and `tests/`.

**Inside a module, anything goes.** A module's own files import each other freely.

**Tests go through the entry points too.** Files in `<name>/tests/` may import any module's entry points and their own `tests/` fixtures, but never `lib/` internals, not even their own module's. If a test needs to reach something, that is a sign the entry point is missing a seam.

**No cycles.** No dependency cycles anywhere in `app/`.

**No barrel files.** Don't make one `index.ts` that re-exports a whole subtree. Expose several small, purpose-named entry points instead (`index.ts`, `client.ts`, `index.server.ts`). Adding an entry point is just adding a root file.

Modules are flat: one level under `app/modules/`. A module's internals may nest as deep as you like, but a module may not contain another module.

Check the rules with:

```sh
npm run lint:boundaries
```
